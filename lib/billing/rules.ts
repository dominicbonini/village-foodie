// lib/billing/rules.ts — 🔴 THE ONE SOURCE FOR HOW HATCHGRAB CHARGES A TRUCK (billing-1, 10 November 2026;
// docs/billing-1-report.md). PURE AND CLIENT-SAFE: no database, no Stripe, no server import. Every server path asks THIS
// module — the gate (ordering paused? Pay at Hatch?), the capture path (the application fee), the month-end run (the
// ledger and the invoice) and Admin — so one rule cannot be applied two ways.
//
// ── THE DECISIONS (Dominic, 10 November 2026), AS CODE ───────────────────────────────────────────────────────────────
//   1  Three payment models per country (public.country_billing.payment_model):
//        fee_from_payment (a) online payments, the fee taken from each payment (a Stripe application fee at capture);
//        billed_online    (b) online payments, the fee billed monthly afterwards (where Stripe forbids application fees);
//        billed_at_truck  (c) pay at the truck, the fee billed monthly afterwards.
//      Any truck may choose post-pay (truck_billing.post_pay): its fee is billed monthly, whatever the country's model.
//      A (c) truck is always post-pay.
//   2  The fee (plan_prices.fee_bps) and Pro's allowance (plan_prices.included_online_minor) count EVERY PRE-ORDER
//      (orders.source = 'web'), however it was paid. Walk-ups (source = 'manual') never count. The base is food_minor.
//   3  The post-pay surcharge per country (bps on the counted value + a fixed monthly amount), 0 by default = not applied.
//   4  A payment method is required when the trial ENDS. Without one, online ordering pauses (status 'paused').
//   5  One charge per calendar month (in the truck's time zone): the plan's monthly fee for that month (prorated by day in
//      the month the trial ends) + the month's billed usage + any surcharge + what was carried in. In the truck's currency.
//   6  Under the country's minimum (country_billing.min_charge_minor) nothing is charged; the amount is carried forward.
//   8  Unpaid for platform_switches.billing_pause_after_days (5) after the invoice's due date → online ordering pauses
//      until paid. Walk-ups, the kitchen screen and the account keep working.
//   9  After the trial, Pay at Hatch needs post-pay AND a valid payment method on file.
//
// 🔴 OFF MEANS OFF: with platform_switches.billing_enabled false, `billable` is false for every truck, and every answer
// below is the one today's code already gives (nothing paused, Pay at Hatch as the plan says, no fee).
import {
  effectivePlan, planEndDate, planByKey, truckPlanPrice, includedVans as planIncludedVans,
  type PlanCatalog, type TruckPlanFields,
} from '@/lib/plans'
import { applyBps, applyBpsDown } from '@/lib/order-charges'
import { localDateOfInstant, instantOfLocal } from '@/lib/time-utils'
import { platformFeeOn } from '@/lib/country-settings-types'

// ── the vocabulary ──────────────────────────────────────────────────────────────────────────────────────────────────

export type PaymentModel = 'fee_from_payment' | 'billed_online' | 'billed_at_truck'
export const PAYMENT_MODELS: readonly PaymentModel[] = ['fee_from_payment', 'billed_online', 'billed_at_truck']
/** Admin's words for the three models (English only — Admin is not translated). */
export const PAYMENT_MODEL_LABELS: Record<PaymentModel, string> = {
  fee_from_payment: '(a) Online — fee taken from each payment',
  billed_online: '(b) Online — fee billed monthly',
  billed_at_truck: '(c) Pay at the truck — fee billed monthly',
}
export const isPaymentModel = (v: unknown): v is PaymentModel => typeof v === 'string' && (PAYMENT_MODELS as readonly string[]).includes(v)

/** One public.country_billing row. */
export interface CountryBilling {
  countryCode: string
  paymentModel: PaymentModel
  postPaySurchargeBps: number
  postPaySurchargeFixedMinor: number
  minChargeMinor: number
  updatedAt?: string
  updatedBy?: string | null
}

export type PaymentMethodState = 'none' | 'pending' | 'valid' | 'failed'
export type PaymentMethodType = 'card' | 'pix' | 'sepa_debit'

/** The truck_billing facts the rules read. No row = DEFAULT_TRUCK_BILLING. */
export interface TruckBillingFacts {
  postPay: boolean
  billingTest: boolean
  paymentMethodState: PaymentMethodState
  paymentMethodType: PaymentMethodType | null
}
export const DEFAULT_TRUCK_BILLING: TruckBillingFacts = { postPay: false, billingTest: false, paymentMethodState: 'none', paymentMethodType: null }

export type BillingStatus = 'trialling' | 'active' | 'past_due' | 'paused'
export type StatusReason = 'trial' | 'no_payment_method' | 'unpaid' | 'ok'

/** The truck columns the rules read. */
export type BillingTruck = TruckPlanFields & {
  id: string
  is_customer?: boolean | null
  timezone?: string | null
  currency?: string | null
}

/** Everything one answer needs. The server builds it (lib/billing/gate.ts); a harness builds it by hand. */
export interface BillingContext {
  /** platform_switches.billing_enabled */
  switchOn: boolean
  /** platform_switches.billing_pause_after_days */
  pauseAfterDays: number
  truck: BillingTruck
  catalog: PlanCatalog
  country: { countryCode: string; platformFeeEnabled: boolean; platformFeeAllowed?: boolean }
  /** null = the country has no country_billing row: never billed (Admin shows it as not set). */
  countryBilling: CountryBilling | null
  truckBilling: TruckBillingFacts
  /** The truck's invoices still being collected (status open or failed), with their due dates. */
  unpaid: { dueAt: string }[]
  now: Date
}

// ── who is billed ───────────────────────────────────────────────────────────────────────────────────────────────────

export type NotBillableReason = 'switch_off' | 'country_not_configured' | 'internal_plan' | 'not_a_customer' | 'unpriced'
export type Billable = { billable: true } | { billable: false; reason: NotBillableReason }

/**
 * 🔴 THE FIRST QUESTION EVERY PATH ASKS. False for every truck while the switch is off.
 * The demo plan and non-trial internal plans (tester) are never billed; a truck that is not a customer (`is_customer` false — test trucks,
 * Real Thai Food) is billed only when its truck_billing row opts in as a billing TEST truck.
 */
export function billableOf(ctx: Pick<BillingContext, 'switchOn' | 'truck' | 'catalog' | 'countryBilling' | 'truckBilling' | 'country'>): Billable {
  if (!ctx.switchOn) return { billable: false, reason: 'switch_off' }
  if (!ctx.countryBilling) return { billable: false, reason: 'country_not_configured' }
  // ⚠️ THE TRIAL PLAN IS ITSELF FLAGGED is_internal (OBSERVED live, 10 November 2026), and a truck keeps `plan = 'trial'`
  // after its trial ends (it resolves to the trial-end plan at read time). So "internal" exempts only the demo plan and the
  // non-trial internal plans (tester) — never a trial, which is exactly the truck that must start paying when it ends.
  const assigned = planByKey(ctx.catalog, ctx.truck.plan)
  if (!assigned || assigned.isDemo || (assigned.isInternal && !assigned.isTrial)) return { billable: false, reason: 'internal_plan' }
  if (ctx.truck.is_customer !== true && !ctx.truckBilling.billingTest) return { billable: false, reason: 'not_a_customer' }
  return { billable: true }
}

/** Is the truck in its free trial right now (a trial plan whose end date has not passed)? */
export function inTrial(truck: TruckPlanFields, catalog: PlanCatalog, now: Date): boolean {
  const eff = effectivePlan(truck, catalog, now)
  return !eff.ended && eff.plan.isTrial
}

/** When the trial ends (ended), or null when the truck is not on a trial plan. */
export function trialEndOf(truck: TruckPlanFields, catalog: PlanCatalog): string | null {
  const assigned = planByKey(catalog, truck.plan)
  return assigned?.isTrial ? planEndDate(truck) : null
}

// ── the arrangement: how this truck's fee is collected ──────────────────────────────────────────────────────────────

export interface Arrangement {
  model: PaymentModel
  /** The truck is post-pay: chosen (truck_billing.post_pay) or because its country is (c). */
  postPay: boolean
  /**
   * 🔴 TAKE THE FEE FROM EACH ONLINE PAYMENT? Only (a), only where the country's platform fee is ON and allowed
   * (platformFeeOn — 35.an-17), and never for a post-pay truck. Otherwise every fee is billed monthly.
   */
  feeFromPayment: boolean
}

export function arrangementOf(ctx: Pick<BillingContext, 'countryBilling' | 'truckBilling' | 'country'>): Arrangement | null {
  if (!ctx.countryBilling) return null
  const model = ctx.countryBilling.paymentModel
  const postPay = ctx.truckBilling.postPay || model === 'billed_at_truck'
  const feeFromPayment = model === 'fee_from_payment' && platformFeeOn(ctx.country) && !postPay
  return { model, postPay, feeFromPayment }
}

// ── the status ──────────────────────────────────────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000

/**
 * 🔴 THE STATUS, DERIVED FROM THE FACTS EVERY TIME (never read from the cached truck_billing.status):
 *   trialling  the trial is running;
 *   paused     the trial has ended and no valid payment method is on file, OR an invoice is unpaid `pauseAfterDays` days
 *              after its due date;
 *   past_due   an invoice is unpaid, inside those days;
 *   active     otherwise.
 * null = not billable (the switch is off, an internal plan, …) — nothing is paused and nothing is charged.
 */
export function billingStatusOf(ctx: BillingContext): { status: BillingStatus; reason: StatusReason } | null {
  if (!billableOf(ctx).billable) return null
  if (inTrial(ctx.truck, ctx.catalog, ctx.now)) return { status: 'trialling', reason: 'trial' }
  if (ctx.truckBilling.paymentMethodState !== 'valid') return { status: 'paused', reason: 'no_payment_method' }
  const oldestDue = ctx.unpaid.map(u => Date.parse(u.dueAt)).filter(Number.isFinite).sort((a, b) => a - b)[0]
  if (oldestDue !== undefined) {
    const daysUnpaid = (ctx.now.getTime() - oldestDue) / DAY_MS
    if (daysUnpaid >= ctx.pauseAfterDays) return { status: 'paused', reason: 'unpaid' }
    return { status: 'past_due', reason: 'unpaid' }
  }
  return { status: 'active', reason: 'ok' }
}

/** Does billing pause this truck's ONLINE ordering (the existing "not taking orders" state)? Walk-ups never pause. */
export function onlineOrderingPausedByBilling(ctx: BillingContext): boolean {
  return billingStatusOf(ctx)?.status === 'paused'
}

/**
 * Does billing ALLOW Pay at Hatch? (The plan's own switch still applies on top — lib/plans.ts payAtHatchOn.)
 * Not billable → true (today's rule, unchanged). During the trial → true. After it → post-pay AND a valid payment method
 * on file AND not paused (decision 9).
 */
export function payAtHatchAllowedByBilling(ctx: BillingContext): boolean {
  const st = billingStatusOf(ctx)
  if (!st) return true
  if (st.status === 'trialling') return true
  const arr = arrangementOf(ctx)
  return !!arr?.postPay && ctx.truckBilling.paymentMethodState === 'valid' && st.status !== 'paused'
}

// ── periods (calendar months in the truck's time zone) ──────────────────────────────────────────────────────────────

/** 'YYYY-MM-01' — the month an instant falls in, in `tz`. */
export function periodOf(instant: Date | string, tz: string): string {
  return localDateOfInstant(instant, tz).slice(0, 8) + '01'
}
export function nextPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
}
export function previousPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`
}
export function daysInPeriod(period: string): number {
  const [y, m] = period.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}
/** The period's instants: [start, end) — local midnight on the 1st to local midnight on the next 1st. */
export function periodBounds(period: string, tz: string): { start: string; end: string } {
  return {
    start: new Date(instantOfLocal(period, '00:00:00', tz)).toISOString(),
    end: new Date(instantOfLocal(nextPeriod(period), '00:00:00', tz)).toISOString(),
  }
}
export const isPeriod = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])-01$/.test(v)

// ── the usage: which pre-orders count, and each one's share of the fee ──────────────────────────────────────────────

/** A pre-order's billing facts. `feeTakenMinor` is the application fee actually taken, net of fee refunds. */
export interface UsageOrder {
  orderKey: string
  placedAt: string
  source: string | null
  status: string | null
  foodMinor: number | null
  /** Paid online (a captured card payment exists). */
  paidOnline: boolean
  capturedMinor: number
  refundedMinor: number
  feeTakenMinor: number
}

/** The order statuses that count: confirmed and onwards. Pending (never confirmed), cancelled and rejected never count. */
export const COUNTED_STATUSES: readonly string[] = ['confirmed', 'modified', 'ready', 'collected']

/** Is this a pre-order that counts? Walk-ups (source 'manual') never do. */
export function countsAsPreorder(o: Pick<UsageOrder, 'source' | 'status'>): boolean {
  return o.source === 'web' && COUNTED_STATUSES.includes(String(o.status))
}

/** The order's counted value: its food, less the refunded share of it (a card refund refunds food in proportion). */
export function countedValueOf(o: UsageOrder): number {
  const food = Number.isSafeInteger(o.foodMinor) && (o.foodMinor as number) > 0 ? (o.foodMinor as number) : 0
  if (!o.paidOnline || o.capturedMinor <= 0 || o.refundedMinor <= 0) return food
  const refundedFood = Math.min(food, Math.floor((food * Math.min(o.refundedMinor, o.capturedMinor)) / o.capturedMinor))
  return food - refundedFood
}

export interface UsageLine {
  orderKey: string
  placedAt: string
  paidOnline: boolean
  foodMinor: number
  countedMinor: number
  allowanceBeforeMinor: number
  feeMinor: number
  feeVia: 'application_fee' | 'invoice' | 'none'
  feeTakenMinor: number
}

export interface UsageTotals {
  preorderCount: number
  countedOnlineMinor: number
  countedAtTruckMinor: number
  countedMinor: number
  allowanceUsedMinor: number
  feeDueMinor: number
  feeTakenMinor: number
  feeBilledMinor: number
}

/**
 * 🔴 THE ALLOCATION — the ONE rule for "how much of this order sits above the allowance". Orders in the order they were
 * placed (then by key); the running total of counted value is the month-to-date meter; each order's fee is the plan's
 * rate on the part of it above the allowance (an order may straddle it). `allowanceMinor` null = unlimited (no fee).
 * The capture path asks the same function (applicationFeeFor) so the fee taken at capture and the month-end figure come
 * from one computation. Rounding: JPY (zero-decimal) rounds down (35.ao-6); two-decimal currencies round as the order
 * engine's platform fee does (applyBps).
 *
 * How each fee share is collected:
 *   application_fee  an application fee was actually taken from the payment → never billed again (the double-billing rule);
 *   invoice          everything else with a fee — pay-at-the-truck pre-orders, (b)/(c)/post-pay, and an online order
 *                    whose application fee was never taken (e.g. paid before the switch);
 *   none             inside the allowance, or a 0% plan.
 */
export function allocateUsage(input: {
  orders: UsageOrder[]
  allowanceMinor: number | null
  feeBps: number
  roundDown: boolean
}): { lines: UsageLine[]; totals: UsageTotals } {
  const sorted = input.orders.filter(countsAsPreorder)
    .slice().sort((a, b) => Date.parse(a.placedAt) - Date.parse(b.placedAt) || a.orderKey.localeCompare(b.orderKey))
  const lines: UsageLine[] = []
  let cum = 0
  for (const o of sorted) {
    const v = countedValueOf(o)
    const before = cum
    cum += v
    const above = input.allowanceMinor === null ? 0 : Math.max(0, cum - Math.max(before, input.allowanceMinor))
    const fee = input.feeBps > 0 && above > 0 ? (input.roundDown ? applyBpsDown(above, input.feeBps) : applyBps(above, input.feeBps)) : 0
    const taken = Math.max(0, o.feeTakenMinor | 0)
    const feeVia: UsageLine['feeVia'] = taken > 0 ? 'application_fee' : fee > 0 ? 'invoice' : 'none'
    lines.push({
      orderKey: o.orderKey, placedAt: o.placedAt, paidOnline: o.paidOnline,
      foodMinor: Math.max(0, o.foodMinor ?? 0), countedMinor: v, allowanceBeforeMinor: before,
      feeMinor: fee, feeVia, feeTakenMinor: taken,
    })
  }
  const sum = (f: (l: UsageLine) => number) => lines.reduce((s, l) => s + f(l), 0)
  const countedMinor = sum(l => l.countedMinor)
  return {
    lines,
    totals: {
      preorderCount: lines.length,
      countedOnlineMinor: sum(l => (l.paidOnline ? l.countedMinor : 0)),
      countedAtTruckMinor: sum(l => (l.paidOnline ? 0 : l.countedMinor)),
      countedMinor,
      allowanceUsedMinor: input.allowanceMinor === null ? countedMinor : Math.min(countedMinor, input.allowanceMinor),
      feeDueMinor: sum(l => l.feeMinor),
      feeTakenMinor: sum(l => l.feeTakenMinor),
      // 🔴 NEVER billed for an order already charged by application fee.
      feeBilledMinor: sum(l => (l.feeVia === 'invoice' ? l.feeMinor : 0)),
    },
  }
}

/**
 * The application fee to take when THIS online order is captured: its line of the allocation over the month's earlier
 * counted pre-orders plus itself. 0 = send none (Stripe requires a positive fee — absence, never zero).
 */
export function applicationFeeFor(input: {
  earlier: UsageOrder[]
  order: UsageOrder
  allowanceMinor: number | null
  feeBps: number
  roundDown: boolean
}): number {
  const self = { ...input.order, status: COUNTED_STATUSES.includes(String(input.order.status)) ? input.order.status : 'confirmed', feeTakenMinor: 0 }
  const { lines } = allocateUsage({
    orders: [...input.earlier.filter(o => o.orderKey !== self.orderKey), self],
    allowanceMinor: input.allowanceMinor, feeBps: input.feeBps, roundDown: input.roundDown,
  })
  return lines.find(l => l.orderKey === self.orderKey)?.feeMinor ?? 0
}

// ── the month ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface MonthInput {
  period: string
  truck: BillingTruck
  catalog: PlanCatalog
  countryCode: string
  countryBilling: CountryBilling
  arrangement: Arrangement
  /** The truck's van count (truck_vans rows; at least 1). */
  vanCount: number
  /** All the truck's pre-orders placed in the period (any status — the allocation filters). */
  orders: UsageOrder[]
  /** The previous period's carried_out_minor. */
  carriedInMinor: number
  /** Zero-decimal currency (JPY): round down. */
  roundDown: boolean
}

export interface MonthResult {
  planKey: string
  /** From this instant the truck is billed in the period (the period start, or the end of its trial). null = not at all. */
  billableFrom: string | null
  allowanceMinor: number | null
  feeBps: number
  lines: UsageLine[]
  totals: UsageTotals
  planFeeMinor: number
  planDays: number
  periodDays: number
  extraVansMinor: number
  surchargeMinor: number
  carriedInMinor: number
  amountDueMinor: number
  chargedMinor: number
  carriedOutMinor: number
  minChargeMinor: number
  state: 'invoiced' | 'carried' | 'nothing'
}

/**
 * 🔴 ONE MONTH'S BILL, from the data. The plan in force at the END of the period (the truck's effective plan an instant
 * before the next period starts) prices the month; in the month the trial ends, the plan fee is prorated by whole local
 * days after the trial's last day, and only pre-orders placed after the trial count. Promotional overrides
 * (plan_price_override_minor) apply as lib/plans.ts truckPlanPrice says. Extra vans at the plan's extra-van price, prorated
 * the same way. The post-pay surcharge only for a post-pay truck. Under the minimum → carried forward (decision 6).
 */
export function composeMonth(m: MonthInput): MonthResult {
  const tz = m.truck.timezone || 'Europe/London'
  const { start, end } = periodBounds(m.period, tz)
  const lastInstant = new Date(Date.parse(end) - 1000)
  const periodDays = daysInPeriod(m.period)
  const priced = truckPlanPrice(m.truck, m.catalog, m.countryCode, { now: lastInstant, today: localDateOfInstant(lastInstant, tz) })
  const planKey = priced.effective.plan.key

  // When is the truck billable in this period? A trial still running at the period's end → not at all.
  const trialEnd = trialEndOf(m.truck, m.catalog)
  let billableFrom: string | null = start
  let planDays = periodDays
  if (!priced.effective.ended && priced.effective.plan.isTrial) { billableFrom = null; planDays = 0 }
  else if (trialEnd && Date.parse(trialEnd) >= Date.parse(start)) {
    if (Date.parse(trialEnd) >= Date.parse(end)) { billableFrom = null; planDays = 0 }
    else {
      billableFrom = trialEnd
      const lastTrialDay = localDateOfInstant(trialEnd, tz)
      planDays = Math.max(0, periodDays - Number(lastTrialDay.slice(8, 10)))
    }
  }

  const price = priced.price
  const allowanceMinor = price ? price.includedOnlineMinor : null
  const feeBps = price ? price.feeBps : 0
  // In the period, and — in the month the trial ends — placed after the trial's end.
  const startMs = Date.parse(start), endMs = Date.parse(end)
  const fromMs = billableFrom === null ? null : billableFrom === start ? startMs - 1 : Date.parse(billableFrom)
  const counted = fromMs === null ? [] : m.orders.filter(o => {
    const t = Date.parse(o.placedAt)
    return t > fromMs && t >= startMs && t < endMs
  })
  const { lines, totals } = allocateUsage({ orders: counted, allowanceMinor, feeBps, roundDown: m.roundDown })

  const prorate = (monthly: number) => (planDays >= periodDays ? monthly : Math.floor((monthly * planDays) / periodDays))
  const planFeeMinor = billableFrom === null || priced.monthlyMinor === null ? 0 : prorate(priced.monthlyMinor)
  const extraVans = Math.max(0, m.vanCount - planIncludedVans(m.truck, m.catalog, lastInstant))
  const extraVansMinor = billableFrom === null || !price ? 0 : prorate(extraVans * price.extraVanMonthlyMinor)
  const cb = m.countryBilling
  const surchargeMinor = billableFrom !== null && m.arrangement.postPay
    ? (planDays > 0 ? cb.postPaySurchargeFixedMinor : 0) + (cb.postPaySurchargeBps > 0 ? applyBpsDown(totals.countedMinor, cb.postPaySurchargeBps) : 0)
    : 0

  const carriedInMinor = Math.max(0, m.carriedInMinor | 0)
  const amountDueMinor = planFeeMinor + extraVansMinor + totals.feeBilledMinor + surchargeMinor + carriedInMinor
  let chargedMinor = 0, carriedOutMinor = 0
  let state: MonthResult['state']
  if (amountDueMinor === 0) state = 'nothing'
  else if (amountDueMinor < cb.minChargeMinor) { carriedOutMinor = amountDueMinor; state = 'carried' }
  else { chargedMinor = amountDueMinor; state = 'invoiced' }

  return {
    planKey, billableFrom, allowanceMinor, feeBps, lines, totals,
    planFeeMinor, planDays: billableFrom === null ? 0 : planDays, periodDays, extraVansMinor, surchargeMinor,
    carriedInMinor, amountDueMinor, chargedMinor, carriedOutMinor, minChargeMinor: cb.minChargeMinor, state,
  }
}

/** A stable fingerprint of a month's inputs (FNV-1a over canonical JSON) — stored on the ledger row for audit. */
export function digestOf(value: unknown): string {
  const canon = (v: unknown): unknown => Array.isArray(v) ? v.map(canon)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map(k => [k, canon((v as Record<string, unknown>)[k])])) : v
  const s = JSON.stringify(canon(value))
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16).padStart(8, '0')
}

// ── the invoice lines a month produces ──────────────────────────────────────────────────────────────────────────────

export interface InvoiceLine { key: 'plan' | 'vans' | 'usage' | 'surcharge' | 'carried'; amountMinor: number; description: string }

/** The invoice's lines (English descriptions; Stripe renders the invoice in the customer's preferred locale). */
export function invoiceLinesOf(r: MonthResult, planName: string, period: string): InvoiceLine[] {
  const month = period.slice(0, 7)
  const out: InvoiceLine[] = []
  if (r.planFeeMinor > 0) out.push({ key: 'plan', amountMinor: r.planFeeMinor, description: `${planName} plan — ${month}${r.planDays < r.periodDays ? ` (${r.planDays} of ${r.periodDays} days)` : ''}` })
  if (r.extraVansMinor > 0) out.push({ key: 'vans', amountMinor: r.extraVansMinor, description: `Extra vans — ${month}` })
  if (r.totals.feeBilledMinor > 0) out.push({ key: 'usage', amountMinor: r.totals.feeBilledMinor, description: `HatchGrab fee on pre-orders — ${month}` })
  if (r.surchargeMinor > 0) out.push({ key: 'surcharge', amountMinor: r.surchargeMinor, description: `Post-pay charge — ${month}` })
  if (r.carriedInMinor > 0) out.push({ key: 'carried', amountMinor: r.carriedInMinor, description: 'Carried over from earlier months' })
  return out
}

// ── the truck's language, for Stripe's own emails and invoices ──────────────────────────────────────────────────────

/** Stripe's supported customer locales (preferred_locales), as of the SDK in node_modules (stripe@22.4.0). */
const STRIPE_LOCALES = new Set(['bg', 'cs', 'da', 'de', 'el', 'en', 'en-GB', 'es', 'es-419', 'et', 'fi', 'fil', 'fr', 'fr-CA', 'hr', 'hu',
  'id', 'it', 'ja', 'ko', 'lt', 'lv', 'ms', 'mt', 'nb', 'nl', 'pl', 'pt', 'pt-BR', 'ro', 'ru', 'sk', 'sl', 'sv', 'th', 'tr', 'vi', 'zh', 'zh-HK', 'zh-TW'])

/** The truck's language (its country's locale, e.g. 'pt-BR') → the Stripe locale its emails and invoices use. */
export function stripeLocaleFor(locale: string | null | undefined): string {
  const l = String(locale || 'en-GB')
  if (STRIPE_LOCALES.has(l)) return l
  const lang = l.split('-')[0]
  if (lang === 'es' && !/^es-ES$/i.test(l)) return 'es-419'
  if (lang === 'en') return /^en-US$/i.test(l) ? 'en' : 'en-GB'
  return STRIPE_LOCALES.has(lang) ? lang : 'en-GB'
}
