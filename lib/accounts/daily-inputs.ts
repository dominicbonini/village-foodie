// lib/accounts/daily-inputs.ts — 🔴 till-pack-4 (25 November 2026, docs/till-pack-4-report.md): THE ROWS BEHIND A DAY'S FIGURES, READ ONCE.
//
// SERVER ONLY (it reads the payment ledger). Both readers of a period's sales use THIS loader — the daily-totals file (/api/manage
// `get_daily_totals`, whose CSV lib/accounts/daily-totals.ts builds) and the till's day close (lib/till/close-run.ts) — so the Z and the
// file are computed from the same rows by the same engine and can never disagree.
//
// THE ROWS for a period [from, to] (the truck's clock; startIso / endIso are its first and last instants):
//   • orders RECORDED in the period (created_at) — today's walk-ups, and a late record synced in the period;
//   • orders whose TRADING DAY (event_date) is in the period — a pre-order placed days before (Q3: it counts on the day it is served);
//   • orders with a refund recorded in the period (one a reversal cancels — a failed refund — is no refund);
//   • orders cancelled in the period (the audit log's order_cancelled, else a cancelled row's updated_at);
//   • (the till only — `withChargesInPeriod`) orders with a charge recorded in the period, for "payments received today for later days";
//   • every payment of those orders, NETTED (lib/payments/reversals.ts: a payment and its reversal are nothing).
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NETTING_COLUMNS, netted, withoutReversals } from '@/lib/payments/reversals'

/** The order columns the daily figures read (event_date: the trading day, Q3). */
export const DAILY_ORDER_COLUMNS = 'order_key, status, created_at, placed_at, updated_at, event_date, total, total_minor, currency, food_minor, tax_minor, tax_inclusive, tax_rate_milli, tax_breakdown, receipt_no'
/** …and what the till's close reads besides (the per-van and per-channel breakdown). */
export const CLOSE_ORDER_COLUMNS = `${DAILY_ORDER_COLUMNS}, source, van_id`

export interface DailyInputs {
  orders: Record<string, unknown>[]
  /** Netted: no reversal, no payment a reversal cancels. */
  payments: Record<string, unknown>[]
  cancelledAt: Record<string, string>
  /** The reversal pairs among these orders' payments (till: the absolute total counts them). [{ amount_minor, created_at, channel, method }] of the payment each reversal cancels, dated by the reversal. */
  reversals: { amount_minor: number; created_at: string | null; channel: string | null; method: string | null }[]
}

export async function loadDailyInputs(
  supabase: SupabaseClient,
  args: { truckId: string; startIso: string; endIso: string; from: string; to: string; full?: boolean; withChargesInPeriod?: boolean },
): Promise<DailyInputs> {
  const { truckId, startIso, endIso, from, to } = args
  const COLS: string = args.full ? CLOSE_ORDER_COLUMNS : DAILY_ORDER_COLUMNS
  const paged = async <T,>(build: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) => {
    const out: T[] = []
    for (let i = 0; ; i += 1000) { const { data, error } = await build(i, i + 999); if (error) throw new Error(error.message); out.push(...(data ?? [])); if (!data || data.length < 1000) return out }
  }
  const placed = await paged(async (a, b) => supabase.from('orders').select(COLS).eq('truck_id', truckId).gte('created_at', startIso).lt('created_at', endIso).order('created_at').order('order_key').range(a, b))
  const served = await paged(async (a, b) => supabase.from('orders').select(COLS).eq('truck_id', truckId).gte('event_date', from).lte('event_date', to).order('created_at').order('order_key').range(a, b))
  const refundRowsAll = await paged(async (a, b) => supabase.from('order_payments').select('order_key, id').eq('truck_id', truckId).eq('kind', 'refund').eq('state', 'succeeded').gte('created_at', startIso).lt('created_at', endIso).order('created_at').range(a, b))
  // till-pack-2: a refund a reversal cancels (a refund that failed) is no refund — it used to be deleted. Looked up only when refunds exist.
  const refundIds = (refundRowsAll as { id: string }[]).map(r => r.id)
  const reversedRefunds = new Set<string>()
  for (let i = 0; i < refundIds.length; i += 150) {
    const { data, error } = await supabase.from('order_payments').select('reverses_payment_id').eq('kind', 'reversal').in('reverses_payment_id', refundIds.slice(i, i + 150))
    if (error) throw new Error(error.message)
    for (const r of (data ?? []) as { reverses_payment_id: string | null }[]) if (r.reverses_payment_id) reversedRefunds.add(r.reverses_payment_id)
  }
  const refundRows = (refundRowsAll as { order_key: string; id: string }[]).filter(r => !reversedRefunds.has(r.id)).map(r => ({ order_key: r.order_key }))
  const chargeRows = args.withChargesInPeriod
    ? await paged(async (a, b) => supabase.from('order_payments').select('order_key').eq('truck_id', truckId).eq('kind', 'charge').eq('state', 'succeeded').gte('created_at', startIso).lt('created_at', endIso).order('created_at').range(a, b))
    : []
  const cancelRows = await paged(async (a, b) => supabase.from('action_audit_log').select('order_key, created_at').eq('truck_id', truckId).eq('action', 'order_cancelled').gte('created_at', startIso).lt('created_at', endIso).order('created_at').range(a, b))
  const cancelledNoAudit = await paged(async (a, b) => supabase.from('orders').select(COLS).eq('truck_id', truckId).eq('status', 'cancelled').gte('updated_at', startIso).lt('updated_at', endIso).order('updated_at').range(a, b))
  const have = new Set((placed as unknown as { order_key: string }[]).map(o => o.order_key))
  const servedNew = (served as unknown as { order_key: string }[]).filter(o => !have.has(o.order_key))
  for (const o of servedNew) have.add(o.order_key)
  const extraKeys = [...new Set([...(refundRows as { order_key: string }[]), ...(chargeRows as { order_key: string }[]), ...(cancelRows as { order_key: string }[])].map(r => r.order_key))].filter(k => k && !have.has(k))
  const extra: unknown[] = []
  for (let i = 0; i < extraKeys.length; i += 150) {
    const { data, error } = await supabase.from('orders').select(COLS).eq('truck_id', truckId).in('order_key', extraKeys.slice(i, i + 150))
    if (error) throw new Error(error.message)
    extra.push(...(data ?? []))
  }
  const orders = [...(placed as unknown as Record<string, unknown>[]), ...(servedNew as Record<string, unknown>[]), ...(extra as Record<string, unknown>[]),
    ...(cancelledNoAudit as unknown as Record<string, unknown>[]).filter(o => !have.has(String(o.order_key)) && !extraKeys.includes(String(o.order_key)))]
  const keys = orders.map(o => String(o.order_key))
  const payCols: string = args.full ? `order_key, kind, amount_minor, state, created_at, channel, method, livemode, ${NETTING_COLUMNS}` : `order_key, kind, amount_minor, state, created_at, ${NETTING_COLUMNS}`
  const payments: Record<string, unknown>[] = []
  const reversals: DailyInputs['reversals'] = []
  for (let i = 0; i < keys.length; i += 150) {
    const { data, error } = await supabase.from('order_payments').select(payCols).eq('truck_id', truckId).in('order_key', keys.slice(i, i + 150))
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as unknown as Record<string, unknown>[]
    payments.push(...(netted(rows as never[]) as Record<string, unknown>[]))   // till-pack-2: reversal pairs removed, today's columns kept
    if (args.full) {
      const kept = new Set(withoutReversals(rows as never[]).map(r => (r as Record<string, unknown>).id))
      const byId = new Map(rows.map(r => [r.id, r]))
      for (const r of rows) if (r.kind === 'reversal' && r.reverses_payment_id && byId.has(r.reverses_payment_id) && !kept.has(r.reverses_payment_id)) {
        const p = byId.get(r.reverses_payment_id) as Record<string, unknown>
        reversals.push({ amount_minor: Number(p.amount_minor) || 0, created_at: (r.created_at as string) ?? null, channel: (p.channel as string) ?? null, method: (p.method as string) ?? null })
      }
    }
  }
  const cancelledAt: Record<string, string> = {}
  for (const r of cancelRows as { order_key: string; created_at: string }[]) if (r.order_key && !cancelledAt[r.order_key]) cancelledAt[r.order_key] = r.created_at
  return { orders, payments, cancelledAt, reversals }
}
