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
//   5  One charge on the 1st of each month (the truck's time zone), in the truck's currency — CORRECTED by Dominic the same day:
//      PLAN FEES IN ADVANCE (this month's plan and extra vans), USAGE IN ARREARS (last month's billed fee) + any surcharge + what
//      was carried in. When the trial ends mid-month, the rest of that month's plan is charged then, pro rata by day; an upgrade
//      charges the pro-rata difference at once; a downgrade takes effect on the 1st (planMonth). Plan history: truck_plan_history.
//   7  A late-payment fee per country (country_billing.late_fee_minor, 0 everywhere = none), once per invoice, if it is still
//      unpaid when online ordering pauses (lib/billing/engine.ts applyLateFees).
//   6  Under the country's minimum (country_billing.min_charge_minor) nothing is charged; the amount is carried forward.
//   8  Unpaid for platform_switches.billing_pause_after_days (5) after the invoice's due date → online ordering pauses
//      until paid. Walk-ups, the kitchen screen and the account keep working.
//   9  After the trial, Pay at Hatch needs post-pay AND a valid payment method on file.
//
// 🔴 OFF MEANS OFF: with platform_switches.billing_enabled false, `billable` is false for every truck, and every answer
// below is the one today's code already gives (nothing paused, Pay at Hatch as the plan says, no fee).
import {
  effectivePlan, planEndDate, planByKey, truckPlanPrice,
  type PlanCatalog, type TruckPlanFields, type PlanPrice,
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
  /** A fixed late-payment fee in local minor units, once per invoice, if still unpaid when online ordering pauses. 0 = none. */
  lateFeeMinor: number
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
  /** The truck's invoices still being collected (status open or failed), with their due dates and — once a collection attempt
   *  has failed — when it first failed (billing_invoices.first_failed_at: the 5-full-day rule counts from its local date). */
  unpaid: { dueAt: string; firstFailedAt?: string | null }[]
  /** platform_switches.billing_suspend_warning_days (6): the suspension-warning date is the pause date + this. Wording only. */
  suspendWarningDays?: number
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


/**
 * 🔴 THE 5-FULL-DAY RULE (billing-2, Dominic, 11 November 2026). A failed charge gives the failure day and then
 * `pauseAfterDays` (5) FULL days to pay, in the truck's own time zone; online ordering pauses at 00:00 on the day after:
 *   fails 1 Jan → last day to pay 6 Jan → paused from 00:00 on 7 Jan → "pay by 13 Jan or your account may be suspended".
 * The late fee (0 everywhere) is applied at the same pause instant. The suspension date is wording only — nothing locks.
 */
export interface FailureTimeline {
  /** The local date the first attempt failed. */
  failDay: string
  /** The last full day to pay (failDay + pauseAfterDays). */
  lastDay: string
  /** The local date online ordering pauses (lastDay + 1), and that day's 00:00 as an instant. */
  pauseDay: string
  pauseAt: string
  /** pauseDay + suspendWarningDays — "pay by {date} or your account may be suspended". */
  suspendWarningDate: string
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}

export function failureTimeline(firstFailedAt: string, tz: string, pauseAfterDays: number, suspendWarningDays = 6): FailureTimeline {
  const failDay = localDateOfInstant(firstFailedAt, tz)
  const lastDay = addDaysYmd(failDay, pauseAfterDays)
  const pauseDay = addDaysYmd(lastDay, 1)
  return { failDay, lastDay, pauseDay, pauseAt: new Date(instantOfLocal(pauseDay, '00:00:00', tz)).toISOString(), suspendWarningDate: addDaysYmd(pauseDay, suspendWarningDays) }
}

/** The earliest failed unpaid invoice's timeline, or null when nothing unpaid has failed yet. */
export function oldestFailure(ctx: Pick<BillingContext, 'unpaid' | 'truck' | 'pauseAfterDays' | 'suspendWarningDays'>): FailureTimeline | null {
  const first = ctx.unpaid.map(u => u.firstFailedAt).filter((x): x is string => !!x && Number.isFinite(Date.parse(x))).sort()[0]
  return first ? failureTimeline(first, ctx.truck.timezone || 'Europe/London', ctx.pauseAfterDays, ctx.suspendWarningDays ?? 6) : null
}

/**
 * 🔴 THE STATUS, DERIVED FROM THE FACTS EVERY TIME (never read from the cached truck_billing.status):
 *   trialling  the trial is running;
 *   paused     the trial has ended and no valid payment method is on file, OR a failed invoice is still unpaid at its pause
 *              instant (00:00 truck time, the day after the last full day to pay — failureTimeline);
 *   past_due   a failed invoice is unpaid, before that instant;
 *   active     otherwise (an invoice not yet attempted is simply being collected).
 * null = not billable (the switch is off, an internal plan, …) — nothing is paused and nothing is charged.
 * Paying clears it at once: a paid invoice is no longer in `unpaid`.
 */
export function billingStatusOf(ctx: BillingContext): { status: BillingStatus; reason: StatusReason } | null {
  if (!billableOf(ctx).billable) return null
  if (inTrial(ctx.truck, ctx.catalog, ctx.now)) return { status: 'trialling', reason: 'trial' }
  if (ctx.truckBilling.paymentMethodState !== 'valid') return { status: 'paused', reason: 'no_payment_method' }
  const fail = oldestFailure(ctx)
  if (fail) return ctx.now.getTime() >= Date.parse(fail.pauseAt) ? { status: 'paused', reason: 'unpaid' } : { status: 'past_due', reason: 'unpaid' }
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
  /** The plan in force when it was placed, and its rate. */
  planKey: string | null
  feeBps: number
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

/** A pre-order's price: the plan in force when it was placed. null = not billable then (the trial) — not counted at all. */
export interface OrderPrice { allowanceMinor: number | null; feeBps: number; planKey?: string | null }

/**
 * 🔴 THE ALLOCATION — the ONE rule for "how much of this order sits above the allowance". Orders in the order they were
 * placed (then by key); the running total of counted value is the month-to-date meter; each order's fee is the rate of the
 * plan in force when it was placed, on the part of it above THAT plan's allowance (an order may straddle it; a plan change
 * mid-month changes the rate and the allowance from that order on, against the same meter). `allowanceMinor` null = unlimited.
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
  /** One price for every order (the capture path, and a month without a plan change)… */
  allowanceMinor?: number | null
  feeBps?: number
  /** …or each order's own (the plan in force when it was placed; null = not billable then, e.g. during the trial). */
  priceOf?: (o: UsageOrder) => OrderPrice | null
  roundDown: boolean
}): { lines: UsageLine[]; totals: UsageTotals } {
  const sorted = input.orders.filter(countsAsPreorder)
    .slice().sort((a, b) => Date.parse(a.placedAt) - Date.parse(b.placedAt) || a.orderKey.localeCompare(b.orderKey))
  const lines: UsageLine[] = []
  let cum = 0, allowanceUsed = 0
  for (const o of sorted) {
    const p = input.priceOf ? input.priceOf(o) : { allowanceMinor: input.allowanceMinor ?? null, feeBps: input.feeBps ?? 0, planKey: null }
    if (!p) continue
    const v = countedValueOf(o)
    const before = cum
    cum += v
    const above = p.allowanceMinor === null ? 0 : Math.max(0, cum - Math.max(before, p.allowanceMinor))
    allowanceUsed += v - above
    const fee = p.feeBps > 0 && above > 0 ? (input.roundDown ? applyBpsDown(above, p.feeBps) : applyBps(above, p.feeBps)) : 0
    const taken = Math.max(0, o.feeTakenMinor | 0)
    const feeVia: UsageLine['feeVia'] = taken > 0 ? 'application_fee' : fee > 0 ? 'invoice' : 'none'
    lines.push({
      orderKey: o.orderKey, placedAt: o.placedAt, paidOnline: o.paidOnline,
      foodMinor: Math.max(0, o.foodMinor ?? 0), countedMinor: v, allowanceBeforeMinor: before,
      feeMinor: fee, feeVia, feeTakenMinor: taken, planKey: p.planKey ?? null, feeBps: p.feeBps,
    })
  }
  const sum = (f: (l: UsageLine) => number) => lines.reduce((s, l) => s + f(l), 0)
  return {
    lines,
    totals: {
      preorderCount: lines.length,
      countedOnlineMinor: sum(l => (l.paidOnline ? l.countedMinor : 0)),
      countedAtTruckMinor: sum(l => (l.paidOnline ? 0 : l.countedMinor)),
      countedMinor: sum(l => l.countedMinor),
      allowanceUsedMinor: allowanceUsed,
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
  allowanceMinor?: number | null
  feeBps?: number
  priceOf?: (o: UsageOrder) => OrderPrice | null
  roundDown: boolean
}): number {
  const self = { ...input.order, status: COUNTED_STATUSES.includes(String(input.order.status)) ? input.order.status : 'confirmed', feeTakenMinor: 0 }
  const { lines } = allocateUsage({
    orders: [...input.earlier.filter(o => o.orderKey !== self.orderKey), self],
    allowanceMinor: input.allowanceMinor, feeBps: input.feeBps, priceOf: input.priceOf, roundDown: input.roundDown,
  })
  return lines.find(l => l.orderKey === self.orderKey)?.feeMinor ?? 0
}

// ── plans over time: the history, and the plan in force at an instant ───────────────────────────────────────────────

/** One public.truck_plan_history row (changed_at '-infinity' = the state before the first recorded change). */
export interface PlanHistoryRow { planKey: string; trialExpiresAt: string | null; changedAt: string }
const instantOf = (iso: string): number => (iso === '-infinity' ? -Infinity : Date.parse(iso))

/** The truck's plan columns as they stood at instant `t`. No history = the truck as it is now (nothing has changed since
 *  billing was switched on). Before the earliest record = the earliest record. */
export function truckAt(truck: BillingTruck, history: PlanHistoryRow[], t: number): BillingTruck {
  if (!history.length) return truck
  const sorted = [...history].sort((a, b) => instantOf(a.changedAt) - instantOf(b.changedAt))
  let row = sorted[0]
  for (const h of sorted) if (instantOf(h.changedAt) <= t) row = h
  return { ...truck, plan: row.planKey, trial_expires_at: row.trialExpiresAt }
}

export interface PlanInputs { truck: BillingTruck; history: PlanHistoryRow[]; catalog: PlanCatalog; countryCode: string; tz: string }

export interface PlanLevel {
  planKey: string
  /** In the free trial at that instant (nothing is billed for it). */
  trialling: boolean
  /** What the plan costs a month at that instant (promo override included; 0 in the trial or without a price row). */
  monthlyMinor: number
  price: PlanPrice | null
  includedVans: number
}

/** The plan in force at instant `t` and what it costs. */
export function planLevelAt(m: PlanInputs, t: number): PlanLevel {
  const st = truckAt(m.truck, m.history, t)
  const now = new Date(t)
  const eff = effectivePlan(st, m.catalog, now)
  const trialling = !eff.ended && eff.plan.isTrial
  const priced = truckPlanPrice(st, m.catalog, m.countryCode, { now, today: localDateOfInstant(now, m.tz) })
  return {
    planKey: eff.plan.key, trialling,
    monthlyMinor: trialling ? 0 : priced.monthlyMinor ?? 0,
    price: trialling ? null : priced.price,
    includedVans: eff.plan.includedVans,
  }
}

/** Whole local days left in the period from instant `t`: the day it happens counts, unless it happens in that day's last
 *  second (a trial ends at 23:59:59, so its month is billed from the next day). */
export function daysLeftFrom(t: number, period: string, tz: string): number {
  const day = localDateOfInstant(new Date(t + 1000), tz)
  if (day.slice(0, 8) !== period.slice(0, 8)) return 0
  return Math.max(0, daysInPeriod(period) - Number(day.slice(8, 10)) + 1)
}

// ── the plan side of a month: IN ADVANCE, and pro rata when the trial ends or the plan goes up ──────────────────────

export interface PlanEvent {
  kind: 'trial_end' | 'upgrade'
  /** Stable: the kind and the instant — the charge's unique ref. */
  ref: string
  at: string
  fromPlanKey: string
  toPlanKey: string
  /** What the month was already paid at (the advance, or an earlier event), and the new plan's monthly price. */
  fromMinor: number
  toMinor: number
  days: number
  periodDays: number
  /** floor((toMinor − fromMinor) × days / periodDays) */
  amountMinor: number
}

export interface PlanMonth {
  period: string
  periodDays: number
  /** IN ADVANCE, on the 1st: the plan in force as the month starts (0 in the trial) and its extra vans. */
  advance: { planKey: string; trialling: boolean; monthlyMinor: number; vansMinor: number }
  /** Mid-month, charged straight away: the trial ending (the plan for the rest of the month) and every rise in the monthly
   *  price (the difference for the rest of the month). A DOWNGRADE is never refunded — the lower price starts on the next 1st. */
  events: PlanEvent[]
}

/**
 * 🔴 DECISIONS 1–3 OF THE CORRECTION (Dominic, 10 November 2026): the plan fee is IN ADVANCE — the 1st's charge carries this
 * month's plan; when the trial ends mid-month the rest of that month is charged then, pro rata by day; an upgrade charges the
 * pro-rata difference at once; a downgrade takes effect on the 1st (lib/billing/engine.ts requestPlanChange holds it until
 * then, and nothing here refunds). Events up to `upTo` only.
 */
export function planMonth(m: PlanInputs & { period: string; vanCount: number; upTo: number; paidAtStart?: number }): PlanMonth {
  const { start, end } = periodBounds(m.period, m.tz)
  const S = Date.parse(start), E = Date.parse(end)
  const periodDays = daysInPeriod(m.period)
  const startLevel = planLevelAt(m, S)
  const vansMinor = startLevel.trialling || !startLevel.price ? 0 : Math.max(0, m.vanCount - startLevel.includedVans) * startLevel.price.extraVanMonthlyMinor
  // The instants the plan can change: every recorded change, and every trial end, inside the month and before `upTo`.
  const xs = new Set<number>()
  for (const h of m.history) { const c = instantOf(h.changedAt); if (c > S && c < E && c <= m.upTo) xs.add(c) }
  const states = [m.truck, ...m.history.map(h => ({ ...m.truck, plan: h.planKey, trial_expires_at: h.trialExpiresAt }))]
  for (const st of states) {
    const te = trialEndOf(st, m.catalog)
    if (te) { const x = Date.parse(te); if (x >= S && x < E && x <= m.upTo) xs.add(x) }
  }
  // What the month is already paid at: what its monthly charge actually charged, once it exists (a downgrade applied on the
  // 1st makes that lower than the history's start), else the plan at the start.
  let paid = m.paidAtStart ?? startLevel.monthlyMinor
  const events: PlanEvent[] = []
  for (const x of [...xs].sort((a, b) => a - b)) {
    const before = planLevelAt(m, x - 1), after = planLevelAt(m, x)
    if (after.monthlyMinor <= paid) continue                    // the same, or a downgrade: nothing now, nothing back
    const days = daysLeftFrom(x, m.period, m.tz)
    const amountMinor = Math.floor(((after.monthlyMinor - paid) * days) / periodDays)
    const kind: PlanEvent['kind'] = before.trialling ? 'trial_end' : 'upgrade'
    events.push({ kind, ref: `${kind}:${new Date(x).toISOString()}`, at: new Date(x).toISOString(), fromPlanKey: before.planKey, toPlanKey: after.planKey,
      fromMinor: paid, toMinor: after.monthlyMinor, days, periodDays, amountMinor })
    paid = after.monthlyMinor
  }
  return { period: m.period, periodDays, advance: { planKey: startLevel.planKey, trialling: startLevel.trialling, monthlyMinor: startLevel.monthlyMinor, vansMinor }, events }
}

// ── the usage side of a month: IN ARREARS ───────────────────────────────────────────────────────────────────────────

export interface UsageMonth {
  period: string
  periodDays: number
  /** The plan in force as the month ends (the ledger's label). */
  planKeyAtEnd: string
  lines: UsageLine[]
  totals: UsageTotals
  /** The post-pay surcharge for the month (post-pay trucks only; 0 = not applied). */
  surchargeMinor: number
}

/**
 * The month's billed usage, charged on the NEXT 1st: every counted pre-order placed in the month while the truck was not in
 * its trial, each at the plan in force when it was placed (Pay as you go 0.99%; Pro 0.99% above its allowance). The post-pay
 * surcharge (bps of the counted value + the fixed monthly amount) belongs to the usage month.
 */
export function usageMonth(m: PlanInputs & { period: string; orders: UsageOrder[]; roundDown: boolean; arrangement: Arrangement; countryBilling: CountryBilling }): UsageMonth {
  const { start, end } = periodBounds(m.period, m.tz)
  const S = Date.parse(start), E = Date.parse(end)
  const inMonth = m.orders.filter(o => { const t = Date.parse(o.placedAt); return t >= S && t < E })
  const { lines, totals } = allocateUsage({
    orders: inMonth, roundDown: m.roundDown,
    priceOf: o => {
      const lv = planLevelAt(m, Date.parse(o.placedAt))
      return lv.trialling ? null : { allowanceMinor: lv.price ? lv.price.includedOnlineMinor : null, feeBps: lv.price ? lv.price.feeBps : 0, planKey: lv.planKey }
    },
  })
  const endLevel = planLevelAt(m, E - 1)
  const cb = m.countryBilling
  const surchargeMinor = m.arrangement.postPay && !endLevel.trialling
    ? cb.postPaySurchargeFixedMinor + (cb.postPaySurchargeBps > 0 ? applyBpsDown(totals.countedMinor, cb.postPaySurchargeBps) : 0)
    : 0
  return { period: m.period, periodDays: daysInPeriod(m.period), planKeyAtEnd: endLevel.planKey, lines, totals, surchargeMinor }
}

// ── a charge: the parts, the minimum and the carry ──────────────────────────────────────────────────────────────────

export interface ChargeFigures {
  planMinor: number
  vansMinor: number
  usageFeeMinor: number
  surchargeMinor: number
  carriedInMinor: number
  amountDueMinor: number
  chargedMinor: number
  carriedOutMinor: number
  minChargeMinor: number
  /** 'invoice' = charge it now; 'carried' = under the minimum, carried to the next 1st; 'nothing' = 0 owed. */
  outcome: 'invoice' | 'carried' | 'nothing'
}

/** Add the parts; under the country's minimum, charge nothing and carry the amount to the next monthly charge (decision 6). */
export function settleCharge(p: { planMinor?: number; vansMinor?: number; usageFeeMinor?: number; surchargeMinor?: number; carriedInMinor?: number; minChargeMinor: number }): ChargeFigures {
  const planMinor = p.planMinor ?? 0, vansMinor = p.vansMinor ?? 0, usageFeeMinor = p.usageFeeMinor ?? 0, surchargeMinor = p.surchargeMinor ?? 0, carriedInMinor = p.carriedInMinor ?? 0
  const amountDueMinor = planMinor + vansMinor + usageFeeMinor + surchargeMinor + carriedInMinor
  const outcome: ChargeFigures['outcome'] = amountDueMinor === 0 ? 'nothing' : amountDueMinor < p.minChargeMinor ? 'carried' : 'invoice'
  return {
    planMinor, vansMinor, usageFeeMinor, surchargeMinor, carriedInMinor, amountDueMinor, minChargeMinor: p.minChargeMinor, outcome,
    chargedMinor: outcome === 'invoice' ? amountDueMinor : 0, carriedOutMinor: outcome === 'carried' ? amountDueMinor : 0,
  }
}

/** A stable fingerprint of a charge's inputs (FNV-1a over canonical JSON) — stored on the row for audit. */
export function digestOf(value: unknown): string {
  const canon = (v: unknown): unknown => Array.isArray(v) ? v.map(canon)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map(k => [k, canon((v as Record<string, unknown>)[k])])) : v
  const s = JSON.stringify(canon(value))
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16).padStart(8, '0')
}

// ── the invoice lines a charge produces ─────────────────────────────────────────────────────────────────────────────

export interface InvoiceLine { key: 'plan' | 'vans' | 'usage' | 'surcharge' | 'carried' | 'late_fee'; amountMinor: number; description: string }

export interface ChargeLike {
  kind: 'monthly' | 'trial_end' | 'upgrade'
  period: string
  planMinor: number
  planDays: number
  periodDays: number
  vansMinor: number
  usagePeriod: string | null
  usageFeeMinor: number
  surchargeMinor: number
  carriedInMinor: number
}

/** The invoice's lines (English descriptions; Stripe renders the invoice in the customer's preferred locale). */
export function invoiceLinesOf(c: ChargeLike, names: { plan: string; fromPlan?: string | null }, lateFeeMinor = 0): InvoiceLine[] {
  const month = c.period.slice(0, 7)
  const usageMonthLabel = (c.usagePeriod ?? '').slice(0, 7)
  const part = c.planDays > 0 && c.planDays < c.periodDays ? ` (${c.planDays} of ${c.periodDays} days)` : ''
  const out: InvoiceLine[] = []
  if (c.planMinor > 0) {
    const what = c.kind === 'upgrade' ? `Upgrade to ${names.plan}${names.fromPlan ? ` from ${names.fromPlan}` : ''}` : `${names.plan} plan`
    out.push({ key: 'plan', amountMinor: c.planMinor, description: `${what} — ${month}${part}${c.kind === 'trial_end' ? ', from the end of your free trial' : ''}` })
  }
  if (c.vansMinor > 0) out.push({ key: 'vans', amountMinor: c.vansMinor, description: `Extra vans — ${month}` })
  if (c.usageFeeMinor > 0) out.push({ key: 'usage', amountMinor: c.usageFeeMinor, description: `HatchGrab fee on pre-orders — ${usageMonthLabel}` })
  if (c.surchargeMinor > 0) out.push({ key: 'surcharge', amountMinor: c.surchargeMinor, description: `Post-pay charge — ${usageMonthLabel}` })
  if (c.carriedInMinor > 0) out.push({ key: 'carried', amountMinor: c.carriedInMinor, description: 'Carried over from earlier charges' })
  if (lateFeeMinor > 0) out.push({ key: 'late_fee', amountMinor: lateFeeMinor, description: 'Late payment fee' })
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
