// lib/till/close-run.ts — 🔴 till-pack-4 (25 November 2026, docs/till-pack-4-report.md): THE CLOSE RUN — what /api/cron/till-close does
// every hour.
//
// SERVER ONLY (the service role). For every truck in the till (a chain head, public.till_applies — demo trucks are outside it):
//   1. DAYS — every trading day from the till's start (the till_start event) that is due (06:00 on D + 1, truck time, Q2) and not yet
//      scanned, IN ORDER: load the day's rows (lib/accounts/daily-inputs.ts — the daily-totals file's own loader), compute the Z
//      (lib/till/close.ts computeDayClose — its lines ARE the file's), and write it through public.till_close_commit (one transaction:
//      seal the day's leftover orders, the close, its chain entry, till_verify, the verify entry). A day with no activity gets no close
//      (Q12), only "scanned". The first refusal stops that truck's run (the next hour retries): the days must close in order.
//   2. MONTHS — every calendar month whose last day is scanned: the sum of its day closes, always written, even at zero (Q12).
//   3. YEARS — every fiscal year (lib/till/close.ts fiscalYearEnd) whose last day is scanned and whose last month is closed; always written.
//   4. SIGNING — with TILL_SIGNING_KEY set (lib/till/signing.ts): register its public key (first use only; a different key is refused and
//      nothing is signed), then sign every close of the truck that has no signature yet — including closes written unsigned before.
// Writes NOTHING to orders or order_payments. Sends nothing anywhere: the result is counts only (no hash, no key).
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadDailyInputs } from '@/lib/accounts/daily-inputs'
import { saleDayOf } from '@/lib/accounts/daily-totals'
import { localParts } from '@/lib/accounts/ledger'
import { addDaysYmd, instantOfLocal } from '@/lib/time-utils'
import { computeDayClose, computePeriodClose, dueCloses, fiscalYearEnd, fiscalYearOf, hasActivity, ZERO_GT,
  type CloseOrder, type ClosePayment, type CloseTotals, type GrandTotals, type PeriodType } from '@/lib/till/close'
import { signHash, type SigningKey } from '@/lib/till/signing'

interface CloseRow { type: PeriodType; period_start: string; period_end: string; seq: number; hash: string; totals: CloseTotals; signed: boolean }
interface Context {
  now: string; applies: boolean; till_started_at: string | null; time_zone: string; currency: string | null
  fiscal_year_end: { month: number | null; day: number | null } | null; country_tax_year_start: { month: number | null; day: number | null } | null
  days_scanned_through: string | null; signing_key_id: string | null; closes: CloseRow[]
}
export interface TruckRunResult { truck: string; days: number; scanned: number; months: number; years: number; signed: number; stopped?: string; verifyOk?: boolean }
export interface RunOptions {
  /** The truck's VAT fallback (orders without their own rates): lib/order-charge-rules loadChargeRules → { taxInclusive, taxRateMilli }. */
  taxOf: (truckId: string) => Promise<{ inclusive: boolean; rateMilli: number | null }>
  signingKey: SigningKey | null
  /** Only these trucks (the rollback proofs); default: every truck with a chain head. */
  trucks?: string[]
  /** Demo trucks are skipped (they are outside the till anyway); the proofs pass () => false. */
  isDemo?: (truckId: string) => boolean
  /** THE ROLLBACK PROOFS ONLY (scripts/db-rollback-proofs.cjs --till-4-check): the first trading day to scan — inside a rolled-back
   *  transaction a demo truck's till starts "now", so seeded past days would otherwise be before it — and the last day to close in this
   *  run. The cron never passes them. */
  fromDay?: string
  untilDay?: string
  log?: (msg: string) => void
}

const codeOf = (e: unknown) => (e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : '')
class Stop extends Error { constructor(public why: string) { super(why) } }

async function rpc<T>(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args)
  if (error) throw Object.assign(new Error(`${fn}: ${error.message}`), { code: (error as { code?: string }).code })
  return data as T
}

/** 🔴 ONE TRUCK. */
export async function runTruckCloses(db: SupabaseClient, truck: string, opts: RunOptions): Promise<TruckRunResult> {
  const out: TruckRunResult = { truck, days: 0, scanned: 0, months: 0, years: 0, signed: 0 }
  let ctx = await rpc<Context>(db, 'till_close_context', { p_truck: truck })
  if (!ctx.applies || !ctx.till_started_at) { out.stopped = ctx.applies ? 'no till start' : 'outside the till'; return out }
  const tz = ctx.time_zone
  const startDay = opts.fromDay ?? localParts(ctx.till_started_at, tz).date
  const fyEnd = fiscalYearEnd(ctx.fiscal_year_end, ctx.country_tax_year_start)
  const closes: CloseRow[] = [...ctx.closes]
  let scanned = ctx.days_scanned_through && ctx.days_scanned_through >= startDay ? ctx.days_scanned_through : addDaysYmd(startDay, -1)

  // The key: registered (first use) before any close names it; a different key → nothing signed, closes written unsigned.
  let key: SigningKey | null = opts.signingKey
  if (key) {
    try { await rpc(db, 'till_register_signing_key', { p_public_key: key.publicKeyB64, p_key_id: key.keyId }) }
    catch (e) { opts.log?.(`[till-close] ${truck}: the signing key was refused (${codeOf(e) || 'error'}) — closes stay unsigned`); key = null }
  }
  const dayCloses = () => closes.filter(c => c.type === 'day').sort((a, b) => a.period_start.localeCompare(b.period_start))
  /** The grand totals of the last day close before `day`; samePeriod: is it in the fiscal year of `fyDay` (gt_period restarts at a new one). */
  const prevBefore = (day: string, fyDay: string = day): { prev: GrandTotals; samePeriod: boolean } => {
    const before = dayCloses().filter(c => c.period_start < day)
    const last = before[before.length - 1]
    if (!last) return { prev: ZERO_GT, samePeriod: false }
    return { prev: last.totals.gt, samePeriod: fiscalYearOf(last.period_start, fyEnd).start === fiscalYearOf(fyDay, fyEnd).start }
  }
  const commit = async (type: PeriodType, start: string, end: string, totals: CloseTotals, inputKeys: string[], sealKeys: string[]) => {
    try {
      const r = await rpc<{ seq: number; hash: string; verify_ok: boolean }>(db, 'till_close_commit', {
        p_truck: truck, p_type: type, p_start: start, p_end: end, p_currency: ctx.currency, p_computed_at: ctx.now,
        p_input_keys: inputKeys, p_seal_keys: sealKeys, p_totals: totals, p_key_id: key?.keyId ?? null })
      closes.push({ type, period_start: start, period_end: end, seq: Number(r.seq), hash: r.hash, totals, signed: false })
      out.verifyOk = Boolean(r.verify_ok) && out.verifyOk !== false
      return true
    } catch (e) {
      throw new Stop(`${type} ${start}: ${codeOf(e) === 'HGT20' ? 'refused (already closed or not due)' : codeOf(e) === 'HGT21' ? 'its rows changed — retried next run' : e instanceof Error ? e.message : String(e)}`)
    }
  }

  try {
    const taxOf = await opts.taxOf(truck)
    // 1. DAYS
    const due = dueCloses({ nowMs: Date.parse(ctx.now), timeZone: tz, tillStartDay: startDay, scannedThrough: scanned, existing: closes, fyEnd })
    for (const day of due.days.filter(d => !opts.untilDay || d <= opts.untilDay)) {
      ctx = { ...ctx, now: (await rpc<Context>(db, 'till_close_context', { p_truck: truck })).now }   // computed-at: the database's clock, per day
      const startIso = new Date(instantOfLocal(day, '00:00', tz)).toISOString()
      const endIso = new Date(instantOfLocal(addDaysYmd(day, 1), '00:00', tz)).toISOString()
      const inputs = await loadDailyInputs(db, { truckId: truck, startIso, endIso, from: day, to: day, full: true, withChargesInPeriod: true })
      const { prev, samePeriod } = prevBefore(day)
      const orders = inputs.orders as unknown as CloseOrder[]
      const z = computeDayClose({ day, timeZone: tz, tax: taxOf, orders, payments: inputs.payments as unknown as ClosePayment[], reversals: inputs.reversals,
        cancelledAt: inputs.cancelledAt, prev, samePeriod })
      if (!hasActivity(z)) {
        await rpc(db, 'till_mark_scanned', { p_truck: truck, p_day: day })
        out.scanned++
      } else {
        const mine = orders.filter(o => saleDayOf(o, tz).day === day).map(o => o.order_key)
        await commit('day', day, day, z, orders.map(o => o.order_key), mine)
        out.days++
      }
      scanned = day
    }
    // 2. MONTHS, 3. YEARS — only once every day in them is scanned.
    const periods = () => dueCloses({ nowMs: Date.parse(ctx.now), timeZone: tz, tillStartDay: startDay, scannedThrough: scanned, existing: closes, fyEnd })
    for (const m of periods().months.filter(x => x.end <= scanned)) {
      const { prev, samePeriod } = prevBefore(m.start, m.end)
      await commit('month', m.start, m.end, computePeriodClose('month', m.start, m.end, dayCloses().map(c => c.totals), prev, samePeriod), [], [])
      out.months++
    }
    for (const y of periods().years.filter(x => x.end <= scanned)) {
      const { prev, samePeriod } = prevBefore(y.start, y.end)
      await commit('year', y.start, y.end, computePeriodClose('year', y.start, y.end, dayCloses().map(c => c.totals), prev, samePeriod), [], [])
      out.years++
    }
  } catch (e) {
    if (!(e instanceof Stop)) throw e
    out.stopped = e.why
  }

  // 4. SIGNING — every close of this truck with no signature yet (written unsigned earlier, or just now).
  if (key) for (const c of closes.filter(x => !x.signed)) {
    try { if (await rpc<boolean>(db, 'till_sign_close', { p_truck: truck, p_seq: c.seq, p_key_id: key.keyId, p_signature: signHash(key, c.hash) })) out.signed++; c.signed = true }
    catch (e) { opts.log?.(`[till-close] ${truck}: signing seq ${c.seq} failed (${codeOf(e) || 'error'})`); break }
  }
  return out
}

/** 🔴 EVERY TRUCK IN THE TILL. One truck's failure never stops another's. */
export async function runTillCloses(db: SupabaseClient, opts: RunOptions): Promise<{ trucks: TruckRunResult[]; failed: number }> {
  let ids = opts.trucks
  if (!ids) {
    const { data, error } = await db.from('till_chain_heads').select('truck_id').gt('last_seq', 0).order('truck_id')
    if (error) throw new Error(error.message)
    ids = ((data ?? []) as { truck_id: string }[]).map(r => r.truck_id)
  }
  const isDemo = opts.isDemo ?? (() => false)
  const trucks: TruckRunResult[] = []
  let failed = 0
  for (const id of ids) {
    if (isDemo(id)) continue
    try { trucks.push(await runTruckCloses(db, id, opts)) }
    catch (e) { failed++; opts.log?.(`[till-close] ${id}: the run stopped (${e instanceof Error ? e.message : String(e)}) — the next run retries`) }
  }
  return { trucks, failed }
}
