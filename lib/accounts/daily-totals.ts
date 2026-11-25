// lib/accounts/daily-totals.ts — france-records-1 (24 November 2026, docs/france-records-1-report.md): DAILY TOTALS BY VAT RATE, the file
// a truck hands its approved e-reporting platform.
//
// PURE AND CLIENT-SAFE. /api/manage `get_daily_totals` reads the rows (only the server can read the payment ledger); the screen builds the
// CSV with dailyTotalsCsv() below. One row per day per VAT rate, on the truck's clock, then one totals row per rate.
//
// 🔴 THE RULES (Dominic, the brief):
//   WHICH ORDERS   accepted ones: confirmed, modified, cooking, ready, collected. PENDING and REJECTED never count. A CANCELLED order
//                  counts only if money was taken (a succeeded charge) — its sale on the day it was placed, and its money given back as
//                  a refund on the day it was given back.
//   SALE DATE      🔴 till-pack-4 (Q3, Dominic 25 November 2026): the order's TRADING DAY — its event_date, so a pre-order counts on the
//                  day it is served and the file matches the till's day close (lib/till/close.ts). ONE EXCEPTION, the till's late
//                  record: an order RECORDED after its day's close (06:00 the next day, truck time — an offline walk-up synced late) counts
//                  on the day it was recorded, because that closed day is never reopened. (Before till-pack-4: the day it was PLACED.)
//                  An order with no event_date (none live) keeps the placed day.
//   REFUND DATE    the day the refund was MADE (order_payments.created_at). A refund takes back each rate's share in proportion:
//                  sales incl. VAT and VAT, each split by the order's rates (largest remainder), scaled by refund ÷ the order's total.
//   THE CANCELLED-AFTER-PAYMENT CASE (readiness §4): a cancelled order with a succeeded charge and no refund row (money taken at the
//                  truck, then the order cancelled) would otherwise count at full value. Here the money not refunded is treated as
//                  refunded ON THE DAY OF THE CANCELLATION — the audit log's order_cancelled row (france-records-1), else the row's
//                  updated_at — so a sale and its cancellation net to zero, each on its own day.
//   THE RATES      each order's tax_breakdown (france-vat-1): sales incl. VAT = each row's gross, VAT = each row's tax. An order with no
//                  breakdown uses its single stored rate as the accountant's ledger does (the stored rate, else the truck's current rate
//                  — "estimated"). An order with NO rate at all (a UK truck with No VAT) is left out of every rate row and COUNTED, so the
//                  file says how many were left out.
//   TIPS AND FEES  are not a sale of goods at a VAT rate and are not in these rows (France has neither).
import { allocate } from '@/lib/order-tax'
import { localParts } from '@/lib/accounts/ledger'
import { csvAmount, csvFile } from '@/lib/accounts/csv'
import { formatRateMilli } from '@/lib/order-charge-lines'
import { addDaysYmd, instantOfLocal } from '@/lib/time-utils'

export interface DailyOrder {
  order_key: string
  status: string | null
  created_at: string | null
  placed_at?: string | null
  updated_at?: string | null
  /** till-pack-4 (Q3): the trading day. */
  event_date?: string | null
  total?: number | string | null
  total_minor?: number | null
  currency?: string | null
  food_minor?: number | null
  tax_minor?: number | null
  tax_inclusive?: boolean | null
  tax_rate_milli?: number | null
  tax_breakdown?: unknown
}
export interface DailyPayment { order_key: string; kind: string; amount_minor: number; state: string | null; created_at: string | null }
export interface DailyInput {
  orders: readonly DailyOrder[]
  payments: readonly DailyPayment[]
  /** order_key → when it was cancelled (the audit log's order_cancelled row). Absent → the row's updated_at. */
  cancelledAt?: Readonly<Record<string, string>>
  /** The truck's rule today, for an order with no stored rate (the ledger's "estimated"). */
  tax: { inclusive: boolean; rateMilli: number | null }
  timeZone: string
  from: string
  to: string
}
export interface DailyRow { date: string; rate: number; salesMinor: number; refundsMinor: number; netMinor: number; vatMinor: number }
export interface DailyResult { rows: DailyRow[]; totals: DailyRow[]; noRateOrders: number }

const ACCEPTED = new Set(['confirmed', 'modified', 'cooking', 'ready', 'collected'])
/** The accepted statuses (the till's 'accepted' and 'collected'). */
export const ACCEPTED_STATUSES: ReadonlySet<string> = ACCEPTED

/** till-pack-2's close of trading day D: 06:00 on D + 1, truck time (Q2). */
export const CLOSE_TIME = '06:00'
/** The instant trading day `ymd` closes, in `timeZone`. */
export const closeInstantOf = (ymd: string, timeZone: string): number => instantOfLocal(addDaysYmd(ymd, 1), CLOSE_TIME, timeZone)
/** 🔴 THE ONE DATING RULE (Q3) — shared by this file and the till's day close, so the two can never disagree. An order's day is its
 *  event_date; an order RECORDED (created_at) after that day's close is a late record and counts on the day it was recorded. */
export function saleDayOf(o: Pick<DailyOrder, 'event_date' | 'created_at' | 'placed_at'>, timeZone: string): { day: string; late: boolean } {
  const ed = typeof o.event_date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(o.event_date) ? o.event_date.slice(0, 10) : null
  if (!ed) return { day: localParts(o.placed_at ?? o.created_at ?? null, timeZone).date, late: false }
  const rec = o.created_at ? Date.parse(o.created_at) : NaN
  if (Number.isFinite(rec) && rec >= closeInstantOf(ed, timeZone)) return { day: localParts(o.created_at ?? null, timeZone).date, late: true }
  return { day: ed, late: false }
}
const int = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : 0 }

/** An order's food by rate: [{ rate, gross, tax }] (gross incl. VAT), or null when it has no rate at all. */
export function orderRates(o: DailyOrder, rule: DailyInput['tax']): { rate: number; gross: number; tax: number }[] | null {
  if (Array.isArray(o.tax_breakdown) && o.tax_breakdown.length) {
    const rows = (o.tax_breakdown as Record<string, unknown>[])
      .map(r => ({ rate: typeof r.rate_milli === 'number' ? r.rate_milli : null, gross: int(r.gross_minor), tax: int(r.tax_minor) }))
      .filter((r): r is { rate: number; gross: number; tax: number } => r.rate !== null && r.rate >= 0 && (r.gross > 0 || r.tax > 0))
    return rows.length ? rows : null
  }
  const food = o.food_minor != null ? int(o.food_minor) : int(o.total_minor)
  const stored = int(o.tax_rate_milli)
  if (o.tax_inclusive != null && stored > 0) {
    if (o.tax_inclusive) return [{ rate: stored, gross: food, tax: food > 0 ? Math.round(food * stored / (100000 + stored)) : 0 }]
    const tax = int(o.tax_minor)
    return [{ rate: stored, gross: food + tax, tax }]
  }
  const m = rule.rateMilli != null ? int(rule.rateMilli) : 0
  if (m > 0) {
    const tax = food > 0 ? Math.round(rule.inclusive ? food * m / (100000 + m) : food * m / 100000) : 0
    return [{ rate: m, gross: rule.inclusive ? food : food + tax, tax }]
  }
  return null
}

export function dailyTotals(input: DailyInput): DailyResult {
  const day = (iso: string | null | undefined) => (iso ? localParts(iso, input.timeZone).date : '')
  const inRange = (d: string) => d >= input.from && d <= input.to
  const cell = new Map<string, DailyRow>()
  const at = (date: string, rate: number) => {
    const k = `${date}|${rate}`
    let r = cell.get(k)
    if (!r) { r = { date, rate, salesMinor: 0, refundsMinor: 0, netMinor: 0, vatMinor: 0 }; cell.set(k, r) }
    return r
  }
  const byOrder = new Map<string, DailyPayment[]>()
  for (const p of input.payments) if (p.state === 'succeeded') { const l = byOrder.get(p.order_key) ?? []; l.push(p); byOrder.set(p.order_key, l) }
  let noRateOrders = 0
  for (const o of input.orders) {
    const status = String(o.status ?? '')
    const pays = byOrder.get(o.order_key) ?? []
    const charged = pays.filter(p => p.kind === 'charge').reduce((s, p) => s + int(p.amount_minor), 0)
    if (!(ACCEPTED.has(status) || (status === 'cancelled' && charged > 0))) continue
    const saleDay = saleDayOf(o, input.timeZone).day   // till-pack-4 (Q3): the trading day (see the header)
    const refunds = pays.filter(p => p.kind === 'refund').map(p => ({ minor: int(p.amount_minor), date: day(p.created_at) }))
    // The cancelled-after-payment case: what was taken and not refunded comes back on the day of the cancellation.
    if (status === 'cancelled') {
      const left = charged - refunds.reduce((s, r) => s + r.minor, 0)
      if (left > 0) refunds.push({ minor: left, date: day(input.cancelledAt?.[o.order_key] ?? o.updated_at ?? o.created_at) })
    }
    const touches = inRange(saleDay) || refunds.some(r => inRange(r.date))
    if (!touches) continue
    const rates = orderRates(o, input.tax)
    if (!rates) { noRateOrders++; continue }
    if (inRange(saleDay)) for (const r of rates) { const c = at(saleDay, r.rate); c.salesMinor += r.gross; c.vatMinor += r.tax }
    const total = o.total_minor != null ? int(o.total_minor) : rates.reduce((s, r) => s + r.gross, 0)
    for (const rf of refunds) {
      if (!inRange(rf.date) || total <= 0) continue
      const minor = Math.min(rf.minor, total)
      const grossBack = allocate(Math.round(rates.reduce((s, r) => s + r.gross, 0) * minor / total), rates.map(r => r.gross))
      const taxBack = allocate(Math.round(rates.reduce((s, r) => s + r.tax, 0) * minor / total), rates.map(r => r.tax))
      rates.forEach((r, i) => { const c = at(rf.date, r.rate); c.refundsMinor -= grossBack[i]; c.vatMinor -= taxBack[i] })
    }
  }
  const rows = [...cell.values()].sort((a, b) => a.date.localeCompare(b.date) || a.rate - b.rate)
  for (const r of rows) r.netMinor = r.salesMinor + r.refundsMinor - r.vatMinor
  const totalsBy = new Map<number, DailyRow>()
  for (const r of rows) {
    const t = totalsBy.get(r.rate) ?? { date: '', rate: r.rate, salesMinor: 0, refundsMinor: 0, netMinor: 0, vatMinor: 0 }
    t.salesMinor += r.salesMinor; t.refundsMinor += r.refundsMinor; t.netMinor += r.netMinor; t.vatMinor += r.vatMinor
    totalsBy.set(r.rate, t)
  }
  return { rows, totals: [...totalsBy.values()].sort((a, b) => a.rate - b.rate), noRateOrders }
}

/** The words the file needs, in the truck's language (manageReports.dailyCsv.*). */
export interface DailyWords {
  meta: { legalName: string; registration: string; vatNumber: string; vatRegime: string; period: string }
  header: { date: string; type: string; rate: string; sales: string; refunds: string; net: string; vat: string }
  goods: string
  total: string
  /** The line under the header when orders were left out for having no rate (null when none were). */
  noRate: (n: number) => string
}
export interface DailyHeader { legalName: string | null; registration: string | null; vatNumber: string | null; vatRegime: string | null; from: string; to: string }

/** The CSV: UTF-8 with BOM, CRLF, ISO dates, the accountant CSVs' number format (lib/accounts/csv.ts). */
export function dailyTotalsCsv(r: DailyResult, h: DailyHeader, currency: string, w: DailyWords): string {
  const rate = (m: number) => `${formatRateMilli(m)}%`
  const line = (d: string, x: DailyRow) => [d, w.goods, rate(x.rate), csvAmount(x.salesMinor, currency), csvAmount(x.refundsMinor, currency), csvAmount(x.netMinor, currency), csvAmount(x.vatMinor, currency)]
  const meta: (string | null)[][] = [
    [w.meta.legalName, h.legalName ?? ''], [w.meta.registration, h.registration ?? ''], [w.meta.vatNumber, h.vatNumber ?? ''],
    [w.meta.vatRegime, h.vatRegime ?? ''], [w.meta.period, `${h.from} – ${h.to}`],
  ]
  if (r.noRateOrders > 0) meta.push([w.noRate(r.noRateOrders)])
  meta.push([])
  const head = [w.header.date, w.header.type, w.header.rate, w.header.sales, w.header.refunds, w.header.net, w.header.vat]
  const body = [...r.rows.map(x => line(x.date, x)), ...r.totals.map(x => line(w.total, x))]
  return csvFile(meta[0] as string[], [...meta.slice(1), head, ...body])
}
