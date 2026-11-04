// lib/accounts/ledger.ts — costs-accounts-1 (4 November 2026, docs/costs-accounts-1-report.md): SALES, TAX, REFUNDS, COST AND
// PROFIT, ORDER BY ORDER, AND THEIR TOTALS.
//
// PURE AND CLIENT-SAFE. Two halves:
//   • accountRows() — run by /api/manage `get_report` (it alone can read the payment ledger and the private cost history): one
//     row per order that took money or is still standing, in minor units of the order's currency;
//   • summarise() — run by the Reports screen over the rows the van filter keeps, so the totals, the per-event lines and both
//     accountant CSVs always describe the same orders as the screen.
//
// 🔴 THE RULES, ONE PLACE:
//   WHICH ORDERS   every order not cancelled or rejected (what Reports already counts), plus a cancelled or rejected order that took
//                  money (a succeeded charge) — so its refund can be shown and subtracted. A cancelled order has no dishes and no cost.
//   GROSS          the order's total, as the customer paid it (food, tax, tip and fees).
//   REFUNDED       the succeeded refunds in the payment ledger (order_payments kind 'refund'), at most the gross.
//   TAX            1 · STORED where the order kept its own tax: the tax it added (tax_minor), or the share its stored INCLUDED rate
//                    stands for (France's "dont TVA", the receipt's own sum: food × rate ÷ (100 % + rate));
//                  2 · ESTIMATED from the truck's current rate and its rule otherwise — included: food × rate ÷ (100 % + rate);
//                    added: food × rate — and labelled "estimated from your tax rate";
//                  3 · NONE when there is no rate at all (every UK truck today): 0, labelled "no tax rate set", never guessed.
//                  A refund takes back its share of the tax (tax × what was kept ÷ gross), so a full refund leaves no tax.
//   NET            gross − refunded − tax.
//   COST           each dish line's cost × quantity, from the dish's cost history ON THE ORDER'S EVENT DATE (costOn). A line whose dish
//                  has no cost that day is NOT counted as zero: the row says how many of its dishes had one (dishes / dishesWithCost).
//   PROFIT         per order and per event only when every dish has a cost (else null — blank in a CSV); for the period, net − the
//                  cost of the dishes that have one, shown with "Cost set for X of Y dishes sold".
//   CHANNEL        online (the customer placed it) or walk-up (the truck did) — Reports' own rule, `customer_email`.
//   PAYMENT        card online (a succeeded online charge), pay at the truck (placed online, not paid online), walk-up.
// Lines are matched to dishes BY NAME (an order line carries no dish id; Reports' category breakdown does the same).
import { minorDigits } from '@/lib/money-format'

export type Channel = 'online' | 'walkup'
export type PaymentMethod = 'card_online' | 'pay_at_truck' | 'walkup'
export type TaxBasis = 'stored' | 'estimated' | 'none'

export interface LedgerOrder {
  order_key: string
  id: string | number
  created_at: string | null
  event_date: string | null
  event_id: string | null
  customer_email: string | null
  status: string | null
  total: number | string | null
  currency?: string | null
  items?: unknown
  food_minor?: number | null
  tax_minor?: number | null
  tax_inclusive?: boolean | null
  tax_rate_milli?: number | null
}
export interface LedgerPayment { order_key: string; kind: string; channel: string | null; amount_minor: number; state: string | null }
export interface CostRow { item_id: string; cost_minor: number | null; currency: string; effective_from: string }
/** The truck's tax rule today: the country's included-or-added rule and the truck's one rate (thousandths of a percent). */
export interface TaxRule { inclusive: boolean; rateMilli: number | null }

export interface AccountRow {
  orderKey: string
  number: string
  /** Placed, on the truck's clock: YYYY-MM-DD and HH:MM (24-hour). */
  date: string
  time: string
  eventDate: string | null
  eventId: string | null
  channel: Channel
  payment: PaymentMethod
  currency: string
  cancelled: boolean
  grossMinor: number
  refundedMinor: number
  taxMinor: number
  taxBasis: TaxBasis
  netMinor: number
  dishes: number
  dishesWithCost: number
  /** The cost of the dishes that have one (0 when none has). */
  costMinor: number
  /** net − cost, only when every dish has a cost; else null. */
  profitMinor: number | null
}

const CANCELLED = new Set(['cancelled', 'rejected'])
const int = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : 0 }

/** The cost of a dish on a day: the latest entry on or before it; a day before the first entry uses the first (there was no
 *  earlier cost to keep). null when the entry found says "no cost" or there is no entry. `history` sorted by effective_from. */
export function costOn(history: readonly CostRow[] | undefined, day: string | null): CostRow | null {
  if (!history || history.length === 0) return null
  if (!day) return history[history.length - 1]
  let found: CostRow | null = null
  for (const h of history) { if (h.effective_from <= day) found = h; else break }
  return found ?? history[0]
}

/** Placed date and time on the truck's clock. */
export function localParts(iso: string | null, timeZone: string): { date: string; time: string } {
  if (!iso) return { date: '', time: '' }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: '', time: '' }
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).map(p => [p.type, p.value]))
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` }
}

/** The tax in an order, and where the figure comes from (see the header). */
export function orderTax(o: LedgerOrder, grossMinor: number, rule: TaxRule): { minor: number; basis: TaxBasis } {
  const food = o.food_minor != null ? int(o.food_minor) : grossMinor
  const storedMilli = int(o.tax_rate_milli)
  if (o.tax_inclusive != null && (int(o.tax_minor) > 0 || storedMilli > 0)) {
    if (o.tax_inclusive) return { minor: storedMilli > 0 && food > 0 ? Math.round(food * storedMilli / (100000 + storedMilli)) : 0, basis: 'stored' }
    return { minor: int(o.tax_minor), basis: 'stored' }
  }
  const m = rule.rateMilli != null ? int(rule.rateMilli) : 0
  if (m > 0) return { minor: food > 0 ? Math.round(rule.inclusive ? food * m / (100000 + m) : food * m / 100000) : 0, basis: 'estimated' }
  return { minor: 0, basis: 'none' }
}

export interface AccountRowsInput {
  orders: readonly LedgerOrder[]
  payments: readonly LedgerPayment[]
  /** Every cost row of the truck (any order). */
  costs: readonly CostRow[]
  /** Dish name → dish id (an active dish wins a name shared with a removed one). */
  itemIdByName: Readonly<Record<string, string>>
  tax: TaxRule
  timeZone: string
  /** The truck's currency, for an order row from before orders carried one. */
  currency: string
}

export function accountRows(input: AccountRowsInput): AccountRow[] {
  const byOrder = new Map<string, LedgerPayment[]>()
  for (const p of input.payments) {
    if (p.state !== 'succeeded') continue
    const list = byOrder.get(p.order_key) ?? []
    list.push(p); byOrder.set(p.order_key, list)
  }
  const history = new Map<string, CostRow[]>()
  for (const c of [...input.costs].sort((a, b) => (a.effective_from < b.effective_from ? -1 : a.effective_from > b.effective_from ? 1 : 0))) {
    const list = history.get(c.item_id) ?? []
    list.push(c); history.set(c.item_id, list)
  }
  const rows: AccountRow[] = []
  for (const o of input.orders) {
    const pays = byOrder.get(o.order_key) ?? []
    const cancelled = CANCELLED.has(String(o.status ?? ''))
    const tookMoney = pays.some(p => p.kind === 'charge')
    if (cancelled && !tookMoney) continue
    const currency = o.currency || input.currency
    const grossMinor = Math.round((Number(o.total) || 0) * 10 ** minorDigits(currency))
    const refundedMinor = Math.min(grossMinor, pays.filter(p => p.kind === 'refund').reduce((s, p) => s + int(p.amount_minor), 0))
    const tax = orderTax(o, grossMinor, input.tax)
    const kept = grossMinor - refundedMinor
    const taxMinor = grossMinor > 0 ? Math.round(tax.minor * kept / grossMinor) : 0
    const netMinor = kept - taxMinor
    let dishes = 0, dishesWithCost = 0, costMinor = 0
    if (!cancelled) {
      for (const line of (Array.isArray(o.items) ? o.items : []) as { name?: unknown; quantity?: unknown }[]) {
        const qty = Math.max(1, int(line?.quantity) || 1)
        dishes += qty
        const itemId = typeof line?.name === 'string' ? input.itemIdByName[line.name] : undefined
        const c = itemId ? costOn(history.get(itemId), o.event_date) : null
        if (c && c.cost_minor != null && c.currency === currency) { dishesWithCost += qty; costMinor += c.cost_minor * qty }
      }
    }
    const { date, time } = localParts(o.created_at, input.timeZone)
    const online = !!o.customer_email
    rows.push({
      orderKey: o.order_key, number: String(o.id ?? ''), date, time, eventDate: o.event_date, eventId: o.event_id,
      channel: online ? 'online' : 'walkup',
      payment: !online ? 'walkup' : pays.some(p => p.kind === 'charge' && p.channel === 'online') ? 'card_online' : 'pay_at_truck',
      currency, cancelled, grossMinor, refundedMinor, taxMinor, taxBasis: tax.basis, netMinor,
      dishes, dishesWithCost, costMinor, profitMinor: dishesWithCost === dishes ? netMinor - costMinor : null,
    })
  }
  return rows
}

export interface Totals {
  orders: number
  grossMinor: number; refundedMinor: number; taxMinor: number; netMinor: number
  /** Gross by channel and by payment method. */
  channel: Record<Channel, number>
  payment: Record<PaymentMethod, number>
  dishes: number; dishesWithCost: number
  costMinor: number
  /** net − the cost of the dishes that have one (the period's figure, with the "X of Y" wording beside it). */
  profitMinor: number
  /** How the tax was found, across the rows. */
  taxBases: Record<TaxBasis, number>
}
export interface EventSummary extends Omit<Totals, 'profitMinor'> {
  key: string
  eventId: string | null
  eventDate: string | null
  /** net − cost only when every dish has a cost; else null. */
  profitMinor: number | null
}

const emptyTotals = (): Totals => ({ orders: 0, grossMinor: 0, refundedMinor: 0, taxMinor: 0, netMinor: 0, channel: { online: 0, walkup: 0 }, payment: { card_online: 0, pay_at_truck: 0, walkup: 0 }, dishes: 0, dishesWithCost: 0, costMinor: 0, profitMinor: 0, taxBases: { stored: 0, estimated: 0, none: 0 } })
function add(t: Totals, r: AccountRow) {
  t.orders++; t.grossMinor += r.grossMinor; t.refundedMinor += r.refundedMinor; t.taxMinor += r.taxMinor; t.netMinor += r.netMinor
  t.channel[r.channel] += r.grossMinor; t.payment[r.payment] += r.grossMinor
  t.dishes += r.dishes; t.dishesWithCost += r.dishesWithCost; t.costMinor += r.costMinor; t.taxBases[r.taxBasis]++
  t.profitMinor = t.netMinor - t.costMinor
}

/** The period's totals and one line per event (in date order), over the rows given. */
export function summarise(rows: readonly AccountRow[]): { totals: Totals; events: EventSummary[] } {
  const totals = emptyTotals()
  const events = new Map<string, Totals & { eventId: string | null; eventDate: string | null }>()
  for (const r of rows) {
    add(totals, r)
    const key = r.eventId ?? `date:${r.eventDate ?? ''}`
    const e = events.get(key) ?? { ...emptyTotals(), eventId: r.eventId, eventDate: r.eventDate }
    add(e, r); events.set(key, e)
  }
  const list = [...events.entries()].map(([key, e]) => ({ ...e, key, profitMinor: e.dishesWithCost === e.dishes ? e.netMinor - e.costMinor : null }))
    .sort((a, b) => String(a.eventDate).localeCompare(String(b.eventDate)) || a.key.localeCompare(b.key))
  return { totals, events: list }
}

/** The tax basis to show for a set of rows: estimated if any row was estimated, none only if every row had no rate. */
export function taxBasisOf(bases: Record<TaxBasis, number>): TaxBasis {
  if (bases.estimated > 0) return 'estimated'
  if (bases.stored > 0) return 'stored'
  return 'none'
}
