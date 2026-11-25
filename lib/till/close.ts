// lib/till/close.ts — 🔴 till-pack-4 (25 November 2026, docs/till-pack-4-report.md): THE TILL'S CLOSES — the day's Z, the month, the year.
//
// PURE AND CLIENT-SAFE (no database, no clock — `now` is passed in). lib/till/close-run.ts loads the rows (lib/accounts/daily-inputs.ts,
// the SAME loader the daily-totals file uses) and writes each close through public.till_close_commit (the migration 20261140).
//
// 🔴 THE Z IS THE DAILY-TOTALS FILE. A day close's per-rate lines ARE lib/accounts/daily-totals.ts dailyTotals() for that one day, on the
// same rows, under the same dating rule (saleDayOf: the trading day — event_date — or, for a record made after its day's close, the day it
// was recorded). So the Z and the file can never disagree for any day.
//
// THE DAY CLOSE OF D (Q2: it runs after 06:00 on D + 1, truck time) holds:
//   rates                        per VAT rate: sales incl. VAT, refunds incl. VAT (negative), net excl. VAT, VAT — the file's rows for D
//   totals                       the same, summed
//   payments                     the charges whose trading day is D, by method (cash / card in person / card online / no method recorded);
//                                a payment's trading day is its order's while that day is open, else the day it was recorded (Q2)
//   refunds                      the refunds recorded on D, by method (the file dates refunds the same way)
//   received_for_later_days      charges recorded on D for orders served on a LATER day — deposits (law change 10)
//   accepted_no_payment          accepted orders of D with no payment recorded: their count and value (Q4) — already IN the sales
//   late_records                 orders recorded on D for an earlier, closed day, and refunds recorded on D for an earlier day's order —
//                                listed with their own day and totalled; they ARE in D's figures (a closed day is never reopened)
//   reversals_netted             (payment, reversal) pairs whose reversal was recorded on D: counted nothing in every figure; listed
//   receipts                     the first and last receipt number of D's orders, and how many
//   counts                       orders by state; charges and refunds
//   by_van, by_channel           sales incl. VAT per van and per source
// THE GRAND TOTALS (Q11), never reset, from the truck's till start:
//   gt_incl / gt_excl            previous + the day's sales − refunds (incl. VAT / excl. VAT)
//   gt_abs                       previous + |sales| + |refunds| + |reversed amounts| — every operation counted positive
//   gt_period                    the same as gt_incl, counted from the start of the truck's fiscal year (law change 9)
// MONTH and YEAR closes sum their day closes (and carry the grand totals); they are written even at zero (Q12). Days with no activity
// get no close (Q12).
import { dailyTotals, saleDayOf, closeInstantOf, ACCEPTED_STATUSES, orderRates, type DailyOrder, type DailyPayment, type DailyRow } from '@/lib/accounts/daily-totals'
import { localParts } from '@/lib/accounts/ledger'
import { addDaysYmd, instantOfLocal } from '@/lib/time-utils'

export type PeriodType = 'day' | 'month' | 'year'
export interface CloseOrder extends DailyOrder { receipt_no?: number | string | null; source?: string | null; van_id?: string | null }
export interface ClosePayment extends DailyPayment { channel?: string | null; method?: string | null; livemode?: boolean | null }
export interface CloseReversal { amount_minor: number; created_at: string | null; channel: string | null; method: string | null }
export interface GrandTotals { gtIncl: number; gtExcl: number; gtAbs: number; gtPeriod: number }
export const ZERO_GT: GrandTotals = { gtIncl: 0, gtExcl: 0, gtAbs: 0, gtPeriod: 0 }

type Method = 'cash' | 'card_in_person' | 'card_online' | 'no_method'
const METHODS: Method[] = ['cash', 'card_in_person', 'card_online', 'no_method']
export function methodOf(p: { channel?: string | null; method?: string | null }): Method {
  if (p.channel === 'online') return 'card_online'
  if (p.channel === 'in_person_stripe') return 'card_in_person'
  return p.method === 'cash' ? 'cash' : p.method === 'card' ? 'card_in_person' : 'no_method'
}
const zeroMethods = () => Object.fromEntries(METHODS.map(m => [m, 0])) as Record<Method, number>
const int = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : 0 }
const sumRows = (rows: readonly DailyRow[]) => rows.reduce((t, r) => ({ salesMinor: t.salesMinor + r.salesMinor, refundsMinor: t.refundsMinor + r.refundsMinor, netMinor: t.netMinor + r.netMinor, vatMinor: t.vatMinor + r.vatMinor }), { salesMinor: 0, refundsMinor: 0, netMinor: 0, vatMinor: 0 })

export interface DayCloseInput {
  day: string
  timeZone: string
  tax: { inclusive: boolean; rateMilli: number | null }
  orders: readonly CloseOrder[]
  /** NETTED (lib/payments/reversals.ts). */
  payments: readonly ClosePayment[]
  reversals: readonly CloseReversal[]
  cancelledAt?: Readonly<Record<string, string>>
  /** The previous close's grand totals; `samePeriod` false at a fiscal year's first close (gt_period restarts). */
  prev: GrandTotals
  samePeriod: boolean
}
export interface CloseTotals {
  type: PeriodType
  period_start: string
  period_end: string
  rates: DailyRow[]
  totals: { salesMinor: number; refundsMinor: number; netMinor: number; vatMinor: number }
  no_rate_orders: number
  payments: Record<Method, number>
  refunds: Record<Method, number>
  received_for_later_days: { total: number; by_method: Record<Method, number>; count: number }
  accepted_no_payment: { count: number; minor: number }
  late_records: { orders: { order_key: string; own_day: string; minor: number }[]; refunds: { order_key: string; own_day: string; minor: number }[]; total_minor: number }
  reversals_netted: { count: number; minor: number }
  receipts: { first: number | null; last: number | null; count: number }
  counts: { orders: Record<string, number>; charges: number; refunds: number }
  by_van: Record<string, number>
  by_channel: Record<string, number>
  days_closed?: number
  gt: GrandTotals
}

/** Does day D's data contain anything to close? (Q12: no activity → no day close.) */
export function hasActivity(z: CloseTotals): boolean {
  return z.rates.length > 0 || z.no_rate_orders > 0 || METHODS.some(m => z.payments[m] || z.refunds[m]) || z.received_for_later_days.count > 0
    || z.accepted_no_payment.count > 0 || z.late_records.orders.length > 0 || z.late_records.refunds.length > 0 || z.reversals_netted.count > 0
    || Object.values(z.counts.orders).some(n => n > 0)
}

/** 🔴 THE DAY CLOSE OF D. */
export function computeDayClose(input: DayCloseInput): CloseTotals {
  const { day, timeZone: tz } = input
  const local = (iso: string | null | undefined) => (iso ? localParts(iso, tz).date : '')
  const file = dailyTotals({ orders: input.orders, payments: input.payments, cancelledAt: input.cancelledAt, tax: input.tax, timeZone: tz, from: day, to: day })
  const rates = file.rows.filter(r => r.date === day)
  const orderBy = new Map(input.orders.map(o => [o.order_key, o]))
  const tradingDayOfOrder = (o: CloseOrder | undefined) => (o ? saleDayOf(o, tz) : { day: '', late: false })
  const succeeded = input.payments.filter(p => p.state === 'succeeded')
  const payments = zeroMethods(), refunds = zeroMethods(), laterBy = zeroMethods()
  let charges = 0, refundCount = 0, laterCount = 0
  const lateRefunds: CloseTotals['late_records']['refunds'] = []
  for (const p of succeeded) {
    const o = orderBy.get(p.order_key)
    const own = tradingDayOfOrder(o).day
    const rec = local(p.created_at)
    if (p.kind === 'charge') {
      // Q2: the order's day while it is open, else the day it was recorded.
      const tday = own && p.created_at && Date.parse(p.created_at) < closeInstantOf(own, tz) ? own : rec
      if (tday === day) { payments[methodOf(p)] += int(p.amount_minor); charges++ }
      if (rec === day && own > day) { laterBy[methodOf(p)] += int(p.amount_minor); laterCount++ }
    } else if (p.kind === 'refund' && rec === day) {
      refunds[methodOf(p)] += int(p.amount_minor); refundCount++
      if (own && own < day) lateRefunds.push({ order_key: p.order_key, own_day: own, minor: int(p.amount_minor) })
    }
  }
  const mine = input.orders.filter(o => tradingDayOfOrder(o).day === day)
  const charged = new Map<string, number>()
  for (const p of succeeded) if (p.kind === 'charge') charged.set(p.order_key, (charged.get(p.order_key) ?? 0) + int(p.amount_minor))
  const grossOf = (o: CloseOrder) => { const r = orderRates(o, input.tax); return r ? r.reduce((s, x) => s + x.gross, 0) : int(o.total_minor) }
  const accepted = mine.filter(o => ACCEPTED_STATUSES.has(String(o.status ?? '')))
  const noPay = accepted.filter(o => !(charged.get(o.order_key) ?? 0))
  const lateOrders = mine.filter(o => tradingDayOfOrder(o).late && ACCEPTED_STATUSES.has(String(o.status ?? '')))
    .map(o => ({ order_key: o.order_key, own_day: String(o.event_date ?? '').slice(0, 10), minor: grossOf(o) }))
  const receiptNos = mine.map(o => Number(o.receipt_no)).filter(n => Number.isInteger(n) && n > 0).sort((a, b) => a - b)
  const counts: Record<string, number> = {}
  for (const o of mine) { const s = String(o.status ?? 'unknown'); const k = ACCEPTED_STATUSES.has(s) ? (s === 'collected' ? 'collected' : 'accepted') : s; counts[k] = (counts[k] ?? 0) + 1 }
  const byVan: Record<string, number> = {}, byChannel: Record<string, number> = {}
  for (const o of accepted) { const g = grossOf(o); const v = o.van_id ? String(o.van_id) : 'none'; byVan[v] = (byVan[v] ?? 0) + g; const c = o.source ? String(o.source) : 'unrecorded'; byChannel[c] = (byChannel[c] ?? 0) + g }
  const revs = input.reversals.filter(r => local(r.created_at) === day)
  const totals = sumRows(rates)
  const netIncl = totals.salesMinor + totals.refundsMinor
  const reversedMinor = revs.reduce((s, r) => s + int(r.amount_minor), 0)
  const absDay = Math.abs(totals.salesMinor) + Math.abs(totals.refundsMinor) + reversedMinor
  return {
    type: 'day', period_start: day, period_end: day, rates, totals, no_rate_orders: file.noRateOrders,
    payments, refunds,
    received_for_later_days: { total: METHODS.reduce((s, m) => s + laterBy[m], 0), by_method: laterBy, count: laterCount },
    accepted_no_payment: { count: noPay.length, minor: noPay.reduce((s, o) => s + grossOf(o), 0) },
    late_records: { orders: lateOrders, refunds: lateRefunds, total_minor: lateOrders.reduce((s, x) => s + x.minor, 0) - lateRefunds.reduce((s, x) => s + x.minor, 0) },
    reversals_netted: { count: revs.length, minor: reversedMinor },
    receipts: { first: receiptNos[0] ?? null, last: receiptNos[receiptNos.length - 1] ?? null, count: receiptNos.length },
    counts: { orders: counts, charges, refunds: refundCount },
    by_van: byVan, by_channel: byChannel,
    gt: { gtIncl: input.prev.gtIncl + netIncl, gtExcl: input.prev.gtExcl + totals.netMinor, gtAbs: input.prev.gtAbs + absDay, gtPeriod: (input.samePeriod ? input.prev.gtPeriod : 0) + netIncl },
  }
}

/** A MONTH or YEAR close: the sum of its day closes; the grand totals carried from the last close before or inside it. */
export function computePeriodClose(type: 'month' | 'year', start: string, end: string, dayCloses: readonly CloseTotals[], prev: GrandTotals, samePeriod: boolean): CloseTotals {
  const days = dayCloses.filter(z => z.type === 'day' && z.period_start >= start && z.period_start <= end).sort((a, b) => a.period_start.localeCompare(b.period_start))
  const byRate = new Map<number, DailyRow>()
  for (const z of days) for (const r of z.rates) {
    const t = byRate.get(r.rate) ?? { date: '', rate: r.rate, salesMinor: 0, refundsMinor: 0, netMinor: 0, vatMinor: 0 }
    t.salesMinor += r.salesMinor; t.refundsMinor += r.refundsMinor; t.netMinor += r.netMinor; t.vatMinor += r.vatMinor
    byRate.set(r.rate, t)
  }
  const rates = [...byRate.values()].sort((a, b) => a.rate - b.rate).map(r => ({ ...r, date: `${start}..${end}` }))
  const addM = (k: 'payments' | 'refunds') => { const m = zeroMethods(); for (const z of days) for (const x of METHODS) m[x] += z[k][x]; return m }
  const later = zeroMethods(); let laterCount = 0
  for (const z of days) { for (const x of METHODS) later[x] += z.received_for_later_days.by_method[x]; laterCount += z.received_for_later_days.count }
  const counts: Record<string, number> = {}
  for (const z of days) for (const [k, v] of Object.entries(z.counts.orders)) counts[k] = (counts[k] ?? 0) + v
  const merge = (k: 'by_van' | 'by_channel') => { const o: Record<string, number> = {}; for (const z of days) for (const [a, v] of Object.entries(z[k])) o[a] = (o[a] ?? 0) + v; return o }
  const receipts = days.flatMap(z => (z.receipts.first == null ? [] : [z.receipts.first, z.receipts.last as number]))
  const last = days[days.length - 1]
  const gt = last ? { ...last.gt } : { ...prev, gtPeriod: samePeriod ? prev.gtPeriod : 0 }
  return {
    type, period_start: start, period_end: end, rates, totals: sumRows(rates), no_rate_orders: days.reduce((s, z) => s + z.no_rate_orders, 0),
    payments: addM('payments'), refunds: addM('refunds'),
    received_for_later_days: { total: METHODS.reduce((s, m) => s + later[m], 0), by_method: later, count: laterCount },
    accepted_no_payment: { count: days.reduce((s, z) => s + z.accepted_no_payment.count, 0), minor: days.reduce((s, z) => s + z.accepted_no_payment.minor, 0) },
    late_records: { orders: days.flatMap(z => z.late_records.orders), refunds: days.flatMap(z => z.late_records.refunds), total_minor: days.reduce((s, z) => s + z.late_records.total_minor, 0) },
    reversals_netted: { count: days.reduce((s, z) => s + z.reversals_netted.count, 0), minor: days.reduce((s, z) => s + z.reversals_netted.minor, 0) },
    receipts: { first: receipts.length ? Math.min(...receipts) : null, last: receipts.length ? Math.max(...receipts) : null, count: days.reduce((s, z) => s + z.receipts.count, 0) },
    counts: { orders: counts, charges: days.reduce((s, z) => s + z.counts.charges, 0), refunds: days.reduce((s, z) => s + z.counts.refunds, 0) },
    by_van: merge('by_van'), by_channel: merge('by_channel'), days_closed: days.length, gt,
  }
}

// ── THE FISCAL YEAR AND WHAT IS DUE ─────────────────────────────────────────────────────────────────────────────────────────────────
/** The fiscal year END (month, day): the truck's own (till_truck_settings), else the day before its country's tax year start, else
 *  31 December. */
export function fiscalYearEnd(truck: { month?: number | null; day?: number | null } | null, countryStart: { month?: number | null; day?: number | null } | null): { month: number; day: number } {
  if (truck?.month && truck?.day) return { month: truck.month, day: truck.day }
  if (countryStart?.month && countryStart?.day) {
    const prev = addDaysYmd(`2001-${String(countryStart.month).padStart(2, '0')}-${String(countryStart.day).padStart(2, '0')}`, -1)
    return { month: Number(prev.slice(5, 7)), day: Number(prev.slice(8, 10)) }
  }
  return { month: 12, day: 31 }
}
const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
/** The fiscal year containing `date`: [start, end] (a 29 February end is the last day of February). */
export function fiscalYearOf(date: string, end: { month: number; day: number }): { start: string; end: string } {
  const y = Number(date.slice(0, 4))
  const endIn = (yy: number) => ymd(yy, end.month, Math.min(end.day, lastDayOf(yy, end.month)))
  const e = endIn(y) >= date ? endIn(y) : endIn(y + 1)
  const prevEnd = endIn(Number(e.slice(0, 4)) - 1)
  return { start: addDaysYmd(prevEnd, 1), end: e }
}
/** The last trading day whose close is due at `now` (06:00 on D + 1, truck time). */
export function lastClosableDay(nowMs: number, timeZone: string): string {
  const today = localParts(new Date(nowMs).toISOString(), timeZone).date
  return nowMs >= instantOfLocal(today, '06:00', timeZone) ? addDaysYmd(today, -1) : addDaysYmd(today, -2)
}
export interface ExistingClose { type: PeriodType; period_start: string; period_end: string }
/** 🔴 WHAT IS DUE at `now`: the days from `scanFrom` (after the last scanned day) to the last closable day; every calendar month (from the
 *  till's start) whose last day is closable; every fiscal year whose last day is closable — each not already closed. A year is due only
 *  after the month containing its last day is (or is about to be) closed. */
export function dueCloses(args: { nowMs: number; timeZone: string; tillStartDay: string; scannedThrough: string | null; existing: readonly ExistingClose[]; fyEnd: { month: number; day: number } }): { days: string[]; months: { start: string; end: string }[]; years: { start: string; end: string }[] } {
  const until = lastClosableDay(args.nowMs, args.timeZone)
  const have = new Set(args.existing.map(c => `${c.type}:${c.period_start}`))
  const days: string[] = []
  let d = args.scannedThrough && args.scannedThrough >= args.tillStartDay ? addDaysYmd(args.scannedThrough, 1) : args.tillStartDay
  for (let i = 0; d <= until && i < 400; i++, d = addDaysYmd(d, 1)) if (!have.has(`day:${d}`)) days.push(d)
  const months: { start: string; end: string }[] = []
  let y = Number(args.tillStartDay.slice(0, 4)), m = Number(args.tillStartDay.slice(5, 7))
  for (let i = 0; i < 240; i++) {
    const start = ymd(y, m, 1), end = ymd(y, m, lastDayOf(y, m))
    if (end > until) break
    if (!have.has(`month:${start}`)) months.push({ start, end })
    m++; if (m === 13) { m = 1; y++ }
  }
  const years: { start: string; end: string }[] = []
  let fy = fiscalYearOf(args.tillStartDay, args.fyEnd)
  for (let i = 0; i < 20 && fy.end <= until; i++, fy = fiscalYearOf(addDaysYmd(fy.end, 1), args.fyEnd)) {
    const endMonth = fy.end.slice(0, 7) + '-01'
    const monthEnd = ymd(Number(fy.end.slice(0, 4)), Number(fy.end.slice(5, 7)), lastDayOf(Number(fy.end.slice(0, 4)), Number(fy.end.slice(5, 7))))
    const monthDone = have.has(`month:${endMonth}`) || months.some(x => x.start === endMonth)
    if (monthEnd <= until && monthDone && !have.has(`year:${fy.start}`)) years.push(fy)
  }
  return { days, months, years }
}
