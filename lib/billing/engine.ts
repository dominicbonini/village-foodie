// lib/billing/engine.ts — billing-1: EVERY CHARGE, AND EVERYTHING THAT MOVES A TRUCK'S BILLING STATE.
// No server-only import: it talks to a BillingStore and a BillingProcessor it is handed (lib/billing/store-types.ts,
// lib/billing/processor.ts), so the harness runs exactly this code against an in-memory store and a fake processor.
//
// ── THE CHARGES (Dominic's correction, 10 November 2026) ────────────────────────────────────────────────────────────
//   monthly    on the 1st (the truck's zone): THIS month's plan fee and extra vans IN ADVANCE + LAST month's billed usage IN
//              ARREARS + the post-pay surcharge for that month + anything carried. One per truck per month.
//   trial_end  when the trial ends mid-month: the plan for the rest of that month, pro rata by day, charged then.
//   upgrade    when the plan goes up mid-month: the pro-rata difference for the rest of the month, charged then.
//   (a downgrade is held until the 1st — requestPlanChange — and nothing is refunded)
// Every charge under the country's minimum is CARRIED and added to the next monthly charge (carried_into).
//
// ── 🔴 NEVER BILLED TWICE ───────────────────────────────────────────────────────────────────────────────────────────
//   1  A charge is a row with unique (truck, month, kind, ref) — the claim is an INSERT; a second run finds the first's row.
//   2  One invoice per charge (billing_invoices.charge_id unique), and every Stripe call carries a key derived from the charge.
//   3  A usage month is billed by exactly one monthly charge (billing_usage.charge_id); once billed it is never recomputed.
//   4  An order whose fee was taken by application fee is never on an invoice (lib/billing/rules.ts allocateUsage).
//
// ── 🔴 OFF MEANS OFF ────────────────────────────────────────────────────────────────────────────────────────────────
// Every entry point reads platform_switches.billing_enabled first and returns `skipped: switch_off` while it is false —
// except an admin's explicit TEST run for a truck whose truck_billing row is marked billing_test (the processor is
// Stripe test mode only, so even that can charge nobody).
import type { PlanCatalog } from '@/lib/plans'
import { planByKey, planPriceFor, effectivePlan } from '@/lib/plans'
import { localDateOfInstant, instantOfLocal } from '@/lib/time-utils'
import { minorDigits } from '@/lib/money-format'
import {
  billingStatusOf, arrangementOf, billableOf, planMonth, usageMonth, settleCharge, invoiceLinesOf, digestOf, periodBounds, periodOf,
  previousPeriod, nextPeriod, planLevelAt, stripeLocaleFor, DEFAULT_TRUCK_BILLING, failureTimeline, trialEndOf,
  type BillingContext, type TruckBillingFacts, type PaymentMethodType, type PlanHistoryRow, type PlanInputs, type ChargeFigures,
} from '@/lib/billing/rules'
import type { BillingStore, TruckBillingRow, UsageRow, InvoiceRow, StoredTruck, InvoiceStatus, ChargeRow, ChargeKind } from '@/lib/billing/store-types'
import type { BillingProcessor, ProcessorInvoice, ProcessorPaymentMethod } from '@/lib/billing/processor'

const factsOf = (r: TruckBillingRow | null): TruckBillingFacts => r
  ? { postPay: r.postPay, billingTest: r.billingTest, paymentMethodState: r.paymentMethodState, paymentMethodType: r.paymentMethodType }
  : DEFAULT_TRUCK_BILLING
const tzOf = (t: StoredTruck) => t.timezone || 'Europe/London'
/** billing-3: the truck's plan END DATE (trucks.trial_expires_at — lib/plans.ts planEndDate) has already passed at `now`. A truck in
 *  that state that gets a new plan must lose the past end date with it, or effectivePlan keeps answering with the fallback. */
const planEndPassed = (t: StoredTruck, now: Date) => !!t.trial_expires_at && Date.parse(t.trial_expires_at) <= now.getTime()

/** Build the context for one truck from the store. `forceSwitch` is the admin test run's override (test trucks only). */
export async function billingContextFor(store: BillingStore, truck: StoredTruck, catalog: PlanCatalog, now: Date, opts: { forceSwitch?: boolean } = {}): Promise<BillingContext> {
  const [sw, cb, tb, facts, invoices] = await Promise.all([
    store.switches(), store.countryBilling(truck.country), store.truckBilling(truck.id), store.countryFacts(truck.country), store.listInvoices(truck.id),
  ])
  const truckBilling = factsOf(tb)
  return {
    switchOn: sw.enabled || (opts.forceSwitch === true && truckBilling.billingTest),
    pauseAfterDays: sw.pauseAfterDays,
    suspendWarningDays: sw.suspendWarningDays ?? 6,
    truck, catalog,
    country: { countryCode: truck.country, platformFeeEnabled: facts?.platformFeeEnabled === true, platformFeeAllowed: facts?.platformFeeAllowed !== false },
    countryBilling: cb,
    truckBilling,
    unpaid: invoices.filter(i => i.status === 'open' || i.status === 'failed').map(i => ({ dueAt: i.dueAt ?? i.createdAt, firstFailedAt: i.firstFailedAt ?? null })),
    now,
  }
}

async function planInputs(store: BillingStore, truck: StoredTruck, catalog: PlanCatalog, extra: PlanHistoryRow[] = []): Promise<PlanInputs> {
  return { truck, history: [...(await store.planHistory(truck.id)), ...extra], catalog, countryCode: truck.country, tz: tzOf(truck) }
}

// ── the status cache ────────────────────────────────────────────────────────────────────────────────────────────────

/** Recompute the truck's status from the facts and write the cache when it changed (Admin reads it; the gate never). */
export async function refreshTruckBillingStatus(store: BillingStore, catalog: PlanCatalog, truckId: string, now: Date, by = 'billing'): Promise<{ status: string | null; changed: boolean }> {
  const truck = await store.truck(truckId)
  if (!truck) return { status: null, changed: false }
  const ctx = await billingContextFor(store, truck, catalog, now)
  const st = billingStatusOf(ctx)
  const row = await store.truckBilling(truckId)
  const next = st?.status ?? null
  if (!row && next === null) return { status: null, changed: false }
  if (row && row.status === next && row.statusReason === (st?.reason ?? null)) return { status: next, changed: false }
  await store.upsertTruckBilling(truckId, { status: next, statusReason: st?.reason ?? null, statusChangedAt: now.toISOString() }, by)
  return { status: next, changed: true }
}

// ── one charge, once ────────────────────────────────────────────────────────────────────────────────────────────────

export type ChargeOutcome =
  | { truckId: string; period: string; kind: ChargeKind; ref: string; outcome: 'skipped'; reason: string }
  | { truckId: string; period: string; kind: ChargeKind; ref: string; outcome: 'nothing' | 'carried'; charge: ChargeRow }
  | { truckId: string; period: string; kind: ChargeKind; ref: string; outcome: 'no_payment_method'; figures: ChargeFigures; charge?: ChargeRow }
  | { truckId: string; period: string; kind: ChargeKind; ref: string; outcome: 'invoiced' | 'already'; charge: ChargeRow; invoice: InvoiceRow }
  | { truckId: string; period: string; kind: ChargeKind; ref: string; outcome: 'failed'; reason: string; charge?: ChargeRow; invoice?: InvoiceRow }

interface ChargeSpec {
  period: string; kind: ChargeKind; ref: string; planKey: string; fromPlanKey: string | null
  planMinor: number; planDays: number; periodDays: number; vansMinor: number
  usagePeriod: string | null; usageFeeMinor: number; surchargeMinor: number
  consume: ChargeRow[]; billsUsage: string | null; digest: unknown
}

/** Stripe idempotency for a charge: derived from the charge alone, never a clock. */
export const chargeKeyOf = (c: Pick<ChargeRow, 'truckId' | 'period' | 'kind' | 'ref'>) => `billing:${c.truckId}:${c.period}:${c.kind}${c.ref ? `:${c.ref}` : ''}`

async function planNames(catalog: PlanCatalog, c: ChargeRow) {
  return { plan: planByKey(catalog, c.planKey)?.name ?? c.planKey, fromPlan: c.fromPlanKey ? planByKey(catalog, c.fromPlanKey)?.name ?? c.fromPlanKey : null }
}

async function chargeOnce(store: BillingStore, processor: BillingProcessor | null, catalog: PlanCatalog, truck: StoredTruck, ctx: BillingContext,
  spec: ChargeSpec, now: Date, by: string): Promise<ChargeOutcome> {
  const base = { truckId: truck.id, period: spec.period, kind: spec.kind, ref: spec.ref }
  let charge = await store.charge(truck.id, spec.period, spec.kind, spec.ref)
  const tb = await store.truckBilling(truck.id)
  const pmReady = !!tb && tb.paymentMethodState === 'valid' && !!tb.stripePaymentMethodId && !!tb.paymentMethodType

  if (!charge) {
    const figures = settleCharge({
      planMinor: spec.planMinor, vansMinor: spec.vansMinor, usageFeeMinor: spec.usageFeeMinor, surchargeMinor: spec.surchargeMinor,
      carriedInMinor: spec.consume.reduce((s, c) => s + c.carriedOutMinor, 0), minChargeMinor: ctx.countryBilling?.minChargeMinor ?? 0,
    })
    if (figures.outcome === 'invoice') {
      // Owed now. Nothing is claimed until it can be charged: no method → the next run tries again (the status says paused).
      if (!pmReady) { await refreshTruckBillingStatus(store, catalog, truck.id, now, by); return { ...base, outcome: 'no_payment_method', figures } }
      if (!processor) return { ...base, outcome: 'failed', reason: 'no_processor' }
      if (processor.livemode) return { ...base, outcome: 'failed', reason: 'live_processor_refused' }
    }
    const ins = await store.insertCharge({
      truckId: truck.id, period: spec.period, kind: spec.kind, ref: spec.ref, currency: truck.currency, planKey: spec.planKey, fromPlanKey: spec.fromPlanKey,
      planMinor: figures.planMinor, planDays: spec.planDays, periodDays: spec.periodDays, vansMinor: figures.vansMinor, usagePeriod: spec.usagePeriod,
      usageFeeMinor: figures.usageFeeMinor, surchargeMinor: figures.surchargeMinor, carriedInMinor: figures.carriedInMinor,
      amountDueMinor: figures.amountDueMinor, chargedMinor: figures.chargedMinor, carriedOutMinor: figures.carriedOutMinor, minChargeMinor: figures.minChargeMinor,
      state: figures.outcome === 'invoice' ? 'invoicing' : figures.outcome === 'carried' ? 'carried' : 'nothing',
      inputsDigest: digestOf(spec.digest),
    }, { consume: spec.consume.map(c => c.id), billsUsage: spec.billsUsage })
    charge = ins.row
  }
  if (charge.state === 'nothing' || charge.state === 'carried') return { ...base, outcome: charge.state, charge }
  if (charge.state === 'invoiced') {
    const inv = await store.invoiceForCharge(charge.id)
    return inv ? { ...base, outcome: 'already', charge, invoice: inv } : { ...base, outcome: 'failed', reason: 'invoiced charge without an invoice row', charge }
  }

  // 'invoicing': raise (or finish raising) its one invoice.
  if (!pmReady || !tb) {
    await refreshTruckBillingStatus(store, catalog, truck.id, now, by)
    return { ...base, outcome: 'no_payment_method', figures: settleCharge({ planMinor: charge.amountDueMinor, minChargeMinor: 0 }), charge }
  }
  if (!processor) return { ...base, outcome: 'failed', reason: 'no_processor', charge }
  if (processor.livemode) return { ...base, outcome: 'failed', reason: 'live_processor_refused', charge }
  const { claimed, row } = await store.claimInvoice({ chargeId: charge.id, truckId: truck.id, period: spec.period, currency: truck.currency, amountMinor: charge.chargedMinor, livemode: processor.livemode })
  if (!claimed && row.status !== 'creating') {
    const done = await store.updateCharge(charge.id, { state: 'invoiced' })
    return { ...base, outcome: 'already', charge: done, invoice: row }
  }
  try {
    const customerId = await ensureCustomer(store, processor, truck)
    const inv = await processor.createInvoice({
      customerId, truckId: truck.id, period: spec.period, currency: truck.currency, idempotencyBase: chargeKeyOf(charge),
      lines: invoiceLinesOf(charge, await planNames(catalog, charge)),
      paymentMethodId: tb.stripePaymentMethodId as string, paymentMethodType: tb.paymentMethodType as PaymentMethodType,
      description: `HatchGrab — ${truck.name} — ${spec.period.slice(0, 7)}${spec.kind === 'monthly' ? '' : spec.kind === 'trial_end' ? ' (end of free trial)' : ' (upgrade)'}`,
    })
    if (inv.amountDueMinor !== charge.chargedMinor) console.error(`[billing] 🔴 invoice ${inv.id} amount_due ${inv.amountDueMinor} ≠ charge ${charge.chargedMinor} (${chargeKeyOf(charge)})`)
    const updated = await store.updateInvoice(row.id, {
      stripeInvoiceId: inv.id, status: invoiceStatusOf(inv), dueAt: inv.finalizedAt ?? now.toISOString(), finalizedAt: inv.finalizedAt, paidAt: inv.paidAt,
      attemptCount: inv.attemptCount, hostedInvoiceUrl: inv.hostedUrl, lastError: inv.lastError, invoicePdfUrl: inv.pdfUrl ?? null,
    })
    const done = await store.updateCharge(charge.id, { state: 'invoiced' })
    await refreshTruckBillingStatus(store, catalog, truck.id, now, by)
    return { ...base, outcome: 'invoiced', charge: done, invoice: updated }
  } catch (err) {
    const msg = (err instanceof Error ? err.message : String(err)).slice(0, 500)
    await store.updateInvoice(row.id, { lastError: msg })
    // The claim stays 'creating' and the charge 'invoicing': the next run completes it under the same idempotency keys.
    return { ...base, outcome: 'failed', reason: msg, charge, invoice: row }
  }
}

/** The truck owner's Stripe Customer (one per owner): found in operator_billing, or created with the truck's language. */
export async function ensureCustomer(store: BillingStore, processor: BillingProcessor, truck: StoredTruck): Promise<string> {
  if (!truck.operator_id) throw new Error('truck has no owner (operator_id) to bill')
  const have = await store.customerFor(truck.operator_id)
  if (have && have.livemode === processor.livemode) return have.stripeCustomerId
  const [op, facts] = await Promise.all([store.operator(truck.operator_id), store.countryFacts(truck.country)])
  const c = await processor.ensureCustomer({ operatorId: truck.operator_id, email: op?.email ?? null, name: op?.name ?? truck.name, locale: stripeLocaleFor(facts?.locale) })
  await store.saveCustomer(truck.operator_id, c.id, processor.livemode)
  return c.id
}

function invoiceStatusOf(inv: ProcessorInvoice): InvoiceStatus {
  if (inv.status === 'paid') return 'paid'
  if (inv.status === 'void') return 'void'
  if (inv.status === 'uncollectible') return 'uncollectible'
  if (inv.status === 'open') return inv.attemptCount > 0 ? 'failed' : 'open'
  return 'creating'
}

async function setUp(store: BillingStore, catalog: PlanCatalog, truckId: string, now: Date, testRun?: boolean) {
  const truck = await store.truck(truckId)
  if (!truck) return { skip: 'no_truck' as const }
  const ctx = await billingContextFor(store, truck, catalog, now, { forceSwitch: testRun === true })
  if (!ctx.switchOn) return { skip: 'switch_off' as const }
  const b = billableOf(ctx)
  if (b.billable === false) return { skip: b.reason }
  const arrangement = arrangementOf(ctx)
  if (!arrangement || !ctx.countryBilling) return { skip: 'country_not_configured' as const }
  return { truck, ctx, arrangement, countryBilling: ctx.countryBilling }
}

// ── the monthly charge ──────────────────────────────────────────────────────────────────────────────────────────────

/** The usage month (arrears), computed into billing_usage while it is open. Exposed for Admin's preview. */
export async function computeUsage(store: BillingStore, catalog: PlanCatalog, truck: StoredTruck, ctx: BillingContext, period: string, now: Date, extra: PlanHistoryRow[] = []):
  Promise<{ ok: true; usage: UsageRow; lines: ReturnType<typeof usageMonth>['lines'] } | { ok: false; reason: string }> {
  const arrangement = arrangementOf(ctx)
  if (!arrangement || !ctx.countryBilling) return { ok: false, reason: 'country_not_configured' }
  const pin = await planInputs(store, truck, catalog, extra)
  const { start, end } = periodBounds(period, pin.tz)
  const orders = await store.usageOrders(truck.id, start, end)
  const u = usageMonth({ ...pin, period, orders, roundDown: minorDigits(truck.currency) === 0, arrangement, countryBilling: ctx.countryBilling })
  const lv = planLevelAt(pin, Date.parse(end) - 1)
  const usage: UsageRow = {
    truckId: truck.id, period, currency: truck.currency, countryCode: truck.country, paymentModel: arrangement.model, postPay: arrangement.postPay,
    planKey: u.planKeyAtEnd, preorderCount: u.totals.preorderCount, countedOnlineMinor: u.totals.countedOnlineMinor, countedAtTruckMinor: u.totals.countedAtTruckMinor,
    countedMinor: u.totals.countedMinor, allowanceMinor: lv.price ? lv.price.includedOnlineMinor : null, allowanceUsedMinor: u.totals.allowanceUsedMinor,
    feeBps: lv.price ? lv.price.feeBps : 0, feeDueMinor: u.totals.feeDueMinor, feeTakenMinor: u.totals.feeTakenMinor, feeBilledMinor: u.totals.feeBilledMinor,
    periodDays: u.periodDays, surchargeMinor: u.surchargeMinor,
    inputsDigest: digestOf({ orders, history: pin.history, cb: ctx.countryBilling, arrangement }), state: 'open', chargeId: null, computedAt: now.toISOString(),
  }
  void now
  return { ok: true, usage, lines: u.lines }
}

/**
 * 🔴 THE 1st's CHARGE for month `period`: this month's plan fee and extra vans IN ADVANCE + last month's billed usage IN
 * ARREARS + the post-pay surcharge + the carried amounts. A downgrade waiting for this 1st is applied first. Safe to run any
 * number of times (one per truck per month).
 */
export async function runMonthly(store: BillingStore, processor: BillingProcessor | null, catalog: PlanCatalog,
  a: { truckId: string; period: string; now: Date; by: string; testRun?: boolean }): Promise<ChargeOutcome> {
  const base = { truckId: a.truckId, period: a.period, kind: 'monthly' as const, ref: '' }
  const s = await setUp(store, catalog, a.truckId, a.now, a.testRun)
  if ('skip' in s) return { ...base, outcome: 'skipped', reason: String(s.skip) }
  const { truck, ctx, arrangement } = s
  const { start } = periodBounds(a.period, tzOf(truck))
  if (a.now.getTime() < Date.parse(start)) return { ...base, outcome: 'skipped', reason: 'period_not_started' }

  const existing = await store.charge(truck.id, a.period, 'monthly', '')
  // A downgrade waiting for this 1st counts from the 1st itself; it is APPLIED (trucks.plan) only once this month's charge
  // exists, so a run that could not charge (no payment method) leaves it waiting and the next run prices the same plan.
  const tb = await store.truckBilling(truck.id)
  const pending = tb?.pendingPlanKey && tb.pendingPlanFrom && tb.pendingPlanFrom <= a.period ? tb.pendingPlanKey : null
  const ended = planEndPassed(truck, a.now)
  const extra: PlanHistoryRow[] = pending ? [{ planKey: pending, trialExpiresAt: ended ? null : truck.trial_expires_at ?? null, changedAt: start }] : []
  const applyPending = async (r: ChargeOutcome) => {
    if (!pending || !('charge' in r) || !r.charge) return r
    if (truck.plan !== pending || ended) await store.setTruckPlan(truck.id, pending, a.by, a.now.toISOString(), { clearPlanEnd: ended })
    await store.upsertTruckBilling(truck.id, { pendingPlanKey: null, pendingPlanFrom: null }, a.by)
    return r
  }
  if (existing) {
    return applyPending(await chargeOnce(store, processor, catalog, truck, ctx, { period: a.period, kind: 'monthly', ref: '', planKey: existing.planKey, fromPlanKey: null, planMinor: existing.planMinor,
      planDays: existing.planDays, periodDays: existing.periodDays, vansMinor: existing.vansMinor, usagePeriod: existing.usagePeriod, usageFeeMinor: existing.usageFeeMinor,
      surchargeMinor: existing.surchargeMinor, consume: [], billsUsage: null, digest: null }, a.now, a.by))
  }

  // Last month's usage (arrears).
  const usagePeriod = previousPeriod(a.period)
  let usageFeeMinor = 0, surchargeMinor = 0
  const prior = await store.usage(truck.id, usagePeriod)
  if (prior && prior.state === 'billed') { usageFeeMinor = 0; surchargeMinor = 0 }   // already on an earlier charge
  else {
    const u = await computeUsage(store, catalog, truck, ctx, usagePeriod, a.now, extra)
    if (u.ok) {
      await store.replaceUsage(u.usage, u.lines)
      usageFeeMinor = u.usage.feeBilledMinor
      surchargeMinor = u.usage.surchargeMinor
    }
  }
  // This month's plan (advance).
  const pin = await planInputs(store, truck, catalog, extra)
  const pm = planMonth({ ...pin, period: a.period, vanCount: await store.vanCount(truck.id), upTo: Date.parse(start) })
  const consume = await store.carriedPool(truck.id)
  return applyPending(await chargeOnce(store, processor, catalog, truck, ctx, {
    period: a.period, kind: 'monthly', ref: '', planKey: pm.advance.planKey, fromPlanKey: null,
    planMinor: pm.advance.monthlyMinor, planDays: pm.advance.trialling ? 0 : pm.periodDays, periodDays: pm.periodDays, vansMinor: pm.advance.vansMinor,
    usagePeriod: prior && prior.state === 'billed' ? null : usagePeriod, usageFeeMinor, surchargeMinor,
    consume, billsUsage: prior && prior.state === 'billed' ? null : usagePeriod,
    digest: { advance: pm.advance, usagePeriod, usageFeeMinor, surchargeMinor, consume: consume.map(c => c.id), arrangement },
  }, a.now, a.by))
}

// ── mid-month: the trial's end and upgrades ─────────────────────────────────────────────────────────────────────────

/**
 * 🔴 CHARGE WHAT HAPPENED MID-MONTH: the trial ending (the rest of that month's plan) and every upgrade (the pro-rata
 * difference), in this month and the last (so a change late on the 31st is not missed). Each event is charged once (its
 * ref is the event's instant). The month's "already paid" level starts at what its monthly charge actually charged.
 */
export async function settleMidMonth(store: BillingStore, processor: BillingProcessor | null, catalog: PlanCatalog,
  a: { truckId: string; now: Date; by: string; testRun?: boolean }): Promise<ChargeOutcome[]> {
  const s = await setUp(store, catalog, a.truckId, a.now, a.testRun)
  if ('skip' in s) return []
  const { truck, ctx } = s
  const here = periodOf(a.now, tzOf(truck))
  const out: ChargeOutcome[] = []
  for (const period of [previousPeriod(here), here]) {
    const pin = await planInputs(store, truck, catalog)
    const monthly = await store.charge(truck.id, period, 'monthly', '')
    const pm = planMonth({ ...pin, period, vanCount: await store.vanCount(truck.id), upTo: a.now.getTime(), paidAtStart: monthly ? monthly.planMinor : undefined })
    for (const ev of pm.events) {
      if (ev.amountMinor <= 0) continue
      out.push(await chargeOnce(store, processor, catalog, truck, ctx, {
        period, kind: ev.kind, ref: ev.ref, planKey: ev.toPlanKey, fromPlanKey: ev.fromPlanKey, planMinor: ev.amountMinor, planDays: ev.days, periodDays: ev.periodDays,
        vansMinor: 0, usagePeriod: null, usageFeeMinor: 0, surchargeMinor: 0, consume: [], billsUsage: null, digest: ev,
      }, a.now, a.by))
    }
  }
  return out
}

/**
 * A plan change asked for by the truck (the operator screen, when it exists; Admin's test tools now). Correction decision 3:
 *   up    → applied at once, and the pro-rata difference for the rest of the month charged at once;
 *   down  → held until the 1st (truck_billing.pending_plan_*), when the monthly charge applies it — nothing refunded;
 *   same  → applied at once.
 * During the free trial it is refused (`in_trial`): which plan a trialling truck lands on is the operator screen's to design.
 */
export async function requestPlanChange(store: BillingStore, processor: BillingProcessor | null, catalog: PlanCatalog,
  a: { truckId: string; planKey: string; now: Date; by: string; testRun?: boolean }):
  Promise<{ outcome: 'skipped'; reason: string } | { outcome: 'trial_choice'; planKey: string; at: string } | { outcome: 'scheduled'; from: string } | { outcome: 'changed'; charges: ChargeOutcome[] }> {
  const s = await setUp(store, catalog, a.truckId, a.now, a.testRun)
  if ('skip' in s) return { outcome: 'skipped', reason: String(s.skip) }
  const { truck } = s
  const plan = planByKey(catalog, a.planKey)
  if (!plan || !plan.active || !plan.isPublic) return { outcome: 'skipped', reason: 'not_a_public_plan' }
  const price = planPriceFor(catalog, plan.key, truck.country)
  if (!price || price.offered === false) return { outcome: 'skipped', reason: 'not_offered_in_country' }
  const pin = await planInputs(store, truck, catalog)
  const now = planLevelAt(pin, a.now.getTime())
  // billing-3 item 5: during the trial the choice is the plan the trial ENDS INTO — stored, nothing charged now. lib/plans.ts
  // effectivePlan reads it at the trial's end (the engine then charges the rest of that month on it, as billing-1 already does), and
  // the hourly run moves trucks.plan to it (applyTrialEndChoice). Choosing again replaces it; no choice = the country's trial-end plan.
  if (now.trialling) {
    const at = trialEndOf(truck, catalog)
    if (!at) return { outcome: 'skipped', reason: 'no_trial_end' }
    await store.upsertTruckBilling(truck.id, { trialEndPlanKey: plan.key, pendingPlanKey: null, pendingPlanFrom: null }, a.by)
    return { outcome: 'trial_choice', planKey: plan.key, at }
  }
  if (price.monthlyMinor < now.monthlyMinor) {
    const from = nextPeriod(periodOf(a.now, tzOf(truck)))
    await store.upsertTruckBilling(truck.id, { pendingPlanKey: plan.key, pendingPlanFrom: from }, a.by)
    return { outcome: 'scheduled', from }
  }
  await store.upsertTruckBilling(truck.id, { pendingPlanKey: null, pendingPlanFrom: null }, a.by)
  // billing-3: a truck whose trial (or plan) end date has passed loses that past date with the new plan — before this, an upgrade
  // after the trial wrote trucks.plan but left trial_expires_at in the past, so effectivePlan still answered with the fallback.
  const ended = planEndPassed(truck, a.now)
  if (truck.plan !== plan.key || ended) await store.setTruckPlan(truck.id, plan.key, a.by, a.now.toISOString(), { clearPlanEnd: ended })
  return { outcome: 'changed', charges: await settleMidMonth(store, processor, catalog, { truckId: truck.id, now: a.now, by: a.by, testRun: a.testRun }) }
}

// ── the late-payment fee ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Correction decision 4: once per invoice, when it is still unpaid as online ordering pauses (billing-2: the pause instant of
 * the 5-full-day rule — rules.ts failureTimeline), the
 * country's late fee (country_billing.late_fee_minor) is ADDED TO THAT INVOICE — a finalised Stripe invoice cannot take a new
 * line, so it is voided and re-issued with the fee as its last line (same charge, same due date, so the pause holds until it
 * is paid). With the fee at 0 (every country today) the decision is recorded as 0 and nothing else happens.
 */
export async function applyLateFees(store: BillingStore, processor: BillingProcessor | null, catalog: PlanCatalog,
  a: { truckId: string; now: Date; by: string; testRun?: boolean }): Promise<{ invoiceId: string; lateFeeMinor: number; outcome: 'none' | 'added' | 'paid_meanwhile' | 'failed'; detail?: string }[]> {
  const s = await setUp(store, catalog, a.truckId, a.now, a.testRun)
  if ('skip' in s) return []
  const { truck, ctx, countryBilling } = s
  const out: { invoiceId: string; lateFeeMinor: number; outcome: 'none' | 'added' | 'paid_meanwhile' | 'failed'; detail?: string }[] = []
  for (const inv of await store.listInvoices(truck.id)) {
    if (!(inv.status === 'open' || inv.status === 'failed') || inv.lateFeeMinor !== null || !inv.stripeInvoiceId || !inv.firstFailedAt) continue
    // billing-2: at the PAUSE INSTANT — 00:00 truck time on the day after the last full day to pay (failureTimeline).
    if (a.now.getTime() < Date.parse(failureTimeline(inv.firstFailedAt, tzOf(truck), ctx.pauseAfterDays, ctx.suspendWarningDays).pauseAt)) continue
    const fee = countryBilling.lateFeeMinor
    if (fee <= 0) { await store.updateInvoice(inv.id, { lateFeeMinor: 0 }); out.push({ invoiceId: inv.id, lateFeeMinor: 0, outcome: 'none' }); continue }
    if (!processor || processor.livemode) { out.push({ invoiceId: inv.id, lateFeeMinor: fee, outcome: 'failed', detail: processor ? 'live_processor_refused' : 'no_processor' }); continue }
    const charge = (await store.listCharges(truck.id)).find(c => c.id === inv.chargeId)
    const tb = await store.truckBilling(truck.id)
    if (!charge || !tb?.stripePaymentMethodId || !tb.paymentMethodType) { out.push({ invoiceId: inv.id, lateFeeMinor: fee, outcome: 'failed', detail: 'no charge or payment method' }); continue }
    try {
      const voided = await processor.voidInvoice(inv.stripeInvoiceId)
      if (voided.status === 'paid') { await applyInvoiceUpdate(store, catalog, voided, a.now); out.push({ invoiceId: inv.id, lateFeeMinor: 0, outcome: 'paid_meanwhile' }); continue }
      const customerId = await ensureCustomer(store, processor, truck)
      const re = await processor.createInvoice({
        customerId, truckId: truck.id, period: inv.period, currency: truck.currency, idempotencyBase: `${chargeKeyOf(charge)}:late`,
        lines: invoiceLinesOf(charge, await planNames(catalog, charge), fee),
        paymentMethodId: tb.stripePaymentMethodId, paymentMethodType: tb.paymentMethodType,
        description: `HatchGrab — ${truck.name} — ${inv.period.slice(0, 7)} (with late payment fee)`,
      })
      await store.updateInvoice(inv.id, {
        stripeInvoiceId: re.id, replacedStripeInvoiceId: inv.stripeInvoiceId, amountMinor: inv.amountMinor + fee, lateFeeMinor: fee,
        status: invoiceStatusOf(re), attemptCount: re.attemptCount, lastError: null, hostedInvoiceUrl: re.hostedUrl, invoicePdfUrl: re.pdfUrl ?? null,
      })
      out.push({ invoiceId: inv.id, lateFeeMinor: fee, outcome: 'added' })
    } catch (err) {
      out.push({ invoiceId: inv.id, lateFeeMinor: fee, outcome: 'failed', detail: (err instanceof Error ? err.message : String(err)).slice(0, 300) })
    }
  }
  return out
}

// ── the run (cron) ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Everything billing does on a schedule, for every candidate truck: the monthly charge for the truck's current month (once),
 *  mid-month charges, late fees, and the status. Idempotent; runs hourly. */
export async function runBillingAll(store: BillingStore, processor: BillingProcessor | null, catalog: PlanCatalog, now: Date, by = 'cron'):
  Promise<{ skipped?: 'switch_off'; outcomes: ChargeOutcome[]; lateFees: number }> {
  if (!(await store.switches()).enabled) return { skipped: 'switch_off', outcomes: [], lateFees: 0 }
  const outcomes: ChargeOutcome[] = []
  let lateFees = 0
  for (const id of await store.candidateTruckIds()) {
    const truck = await store.truck(id)
    if (!truck) continue
    const period = periodOf(now, tzOf(truck))
    try { await applyTrialEndChoice(store, catalog, { truckId: id, now, by }) } catch { /* the plan stays the fallback's until the next run */ }
    try { outcomes.push(await runMonthly(store, processor, catalog, { truckId: id, period, now, by })) }
    catch (err) { outcomes.push({ truckId: id, period, kind: 'monthly', ref: '', outcome: 'failed', reason: err instanceof Error ? err.message : String(err) }) }
    try { outcomes.push(...(await settleMidMonth(store, processor, catalog, { truckId: id, now, by }))) } catch (err) { outcomes.push({ truckId: id, period, kind: 'upgrade', ref: '?', outcome: 'failed', reason: err instanceof Error ? err.message : String(err) }) }
    try { await retryUnpaidInvoices(store, processor, catalog, { truckId: id, now, by }) } catch { /* retried next run */ }
    try { lateFees += (await applyLateFees(store, processor, catalog, { truckId: id, now, by })).filter(x => x.outcome === 'added').length } catch { /* reported next run */ }
    try { await refreshTruckBillingStatus(store, catalog, id, now, by) } catch { /* reported by the outcome list */ }
  }
  return { outcomes, lateFees }
}

// ── events from Stripe (the billing webhook) ────────────────────────────────────────────────────────────────────────

/**
 * An invoice changed at Stripe (invoice.paid / payment_failed / finalized / voided / marked_uncollectible). Updates our
 * row and the truck's status — paying resumes online ordering at once, because the gate derives "paused" from the unpaid
 * invoices and this one is no longer unpaid. Unknown invoices (not ours, or one a late fee replaced) are ignored.
 */
export async function applyInvoiceUpdate(store: BillingStore, catalog: PlanCatalog, inv: ProcessorInvoice, now: Date): Promise<'updated' | 'unknown'> {
  const row = await store.invoiceByStripeId(inv.id)
  if (!row) return 'unknown'
  const status = invoiceStatusOf(inv)
  await store.updateInvoice(row.id, {
    status, attemptCount: inv.attemptCount, lastError: inv.lastError,
    paidAt: inv.paidAt, finalizedAt: inv.finalizedAt ?? row.finalizedAt, dueAt: row.dueAt ?? inv.finalizedAt, hostedInvoiceUrl: inv.hostedUrl ?? row.hostedInvoiceUrl,
    invoicePdfUrl: inv.pdfUrl ?? row.invoicePdfUrl,
    // billing-2: the 5-full-day rule counts from the FIRST failure — stamped once, never moved by a later retry.
    ...(status === 'failed' && !row.firstFailedAt ? { firstFailedAt: now.toISOString() } : {}),
  })
  await refreshTruckBillingStatus(store, catalog, row.truckId, now, 'stripe_webhook')
  return 'updated'
}

/** A payment method was set up (setup_intent.succeeded) or removed — the truck's method on file and its state. */
export async function applyPaymentMethod(store: BillingStore, catalog: PlanCatalog,
  a: { truckId: string; pm: ProcessorPaymentMethod | null; state: 'valid' | 'failed' | 'none' | 'pending'; livemode: boolean; now: Date; by: string; setupIntentId?: string | null }): Promise<TruckBillingRow> {
  const type: PaymentMethodType | null = a.pm && a.pm.type !== 'other' ? a.pm.type : null
  const row = await store.upsertTruckBilling(a.truckId, {
    paymentMethodState: a.state,
    paymentMethodType: a.state === 'none' ? null : type,
    stripePaymentMethodId: a.state === 'none' ? null : a.pm?.id ?? null,
    paymentMethodLabel: a.state === 'none' ? null : a.pm?.label ?? null,
    paymentMethodUpdatedAt: a.now.toISOString(),
    paymentMethodLivemode: a.livemode,
    ...(a.setupIntentId !== undefined ? { stripeSetupIntentId: a.setupIntentId } : {}),
  }, a.by)
  await refreshTruckBillingStatus(store, catalog, a.truckId, a.now, a.by)
  return row
}

/**
 * billing-2: a new payment method was added (Checkout set-up returned, or its webhook) — try every unpaid invoice on it now,
 * so "Use a different card" and "Update card" bring online ordering straight back when the charge goes through.
 */
export async function payOpenInvoices(store: BillingStore, processor: BillingProcessor, catalog: PlanCatalog, a: { truckId: string; now: Date; by: string }): Promise<{ invoiceId: string; status: string }[]> {
  if (processor.livemode) throw new Error('live processor refused')
  const tb = await store.truckBilling(a.truckId)
  if (!tb || tb.paymentMethodState !== 'valid' || !tb.stripePaymentMethodId) return []
  const out: { invoiceId: string; status: string }[] = []
  for (const inv of await store.listInvoices(a.truckId)) {
    if (!(inv.status === 'open' || inv.status === 'failed') || !inv.stripeInvoiceId) continue
    const res = await processor.payInvoice(inv.stripeInvoiceId, tb.stripePaymentMethodId)
    await applyInvoiceUpdate(store, catalog, res, a.now)
    out.push({ invoiceId: inv.id, status: res.status })
  }
  return out
}

/** Start setting up a payment method (card everywhere; Pix Automático in Brazil). Returns the SetupIntent's client secret
 *  for the (not yet built) operator screen; records the intent so its webhook finds the truck. */
export async function startPaymentMethodSetup(store: BillingStore, processor: BillingProcessor, _catalog: PlanCatalog,
  a: { truckId: string; type: PaymentMethodType; now: Date; by: string }): Promise<{ setupIntentId: string; clientSecret: string | null }> {
  if (processor.livemode) throw new Error('live processor refused')
  const truck = await store.truck(a.truckId)
  if (!truck) throw new Error('no truck')
  if (a.type === 'pix' && truck.currency !== 'BRL') throw new Error('Pix Automático is for Brazilian trucks (BRL) only')
  const customerId = await ensureCustomer(store, processor, truck)
  const si = await processor.createSetupIntent({ customerId, truckId: truck.id, type: a.type, currency: truck.currency })
  await store.upsertTruckBilling(truck.id, { stripeSetupIntentId: si.id, paymentMethodState: 'pending', paymentMethodUpdatedAt: a.now.toISOString() }, a.by)
  return { setupIntentId: si.id, clientSecret: si.clientSecret }
}

/** TEST ONLY (harness and Admin's test tools): attach a Stripe test payment method and mark it valid. */
export async function attachTestPaymentMethod(store: BillingStore, processor: BillingProcessor, catalog: PlanCatalog,
  a: { truckId: string; testToken: string; now: Date; by: string }): Promise<TruckBillingRow> {
  if (processor.livemode) throw new Error('live processor refused')
  const truck = await store.truck(a.truckId)
  if (!truck) throw new Error('no truck')
  const tb = await store.truckBilling(a.truckId)
  if (!tb?.billingTest) throw new Error('only a billing TEST truck (truck_billing.billing_test) may take a test payment method')
  const customerId = await ensureCustomer(store, processor, truck)
  const pm = await processor.attachTestPaymentMethod({ customerId, testToken: a.testToken })
  return applyPaymentMethod(store, catalog, { truckId: a.truckId, pm, state: 'valid', livemode: false, now: a.now, by: a.by })
}

// ── billing-3: the trial's chosen plan, and retrying a payment Stripe will not retry ─────────────────────────────────────

/**
 * billing-3 item 5: once a trial has ENDED, a truck that chose a plan for it moves to that plan in trucks.plan (and loses the past end
 * date), so every surface outside billing (features, the plan pills) agrees with what billing charges. Billing itself already charges
 * the chosen plan from the trial's end instant (lib/plans.ts effectivePlan reads truck_billing.trial_end_plan_key via the store), so
 * the hour between the end and this run changes nothing that is billed. The choice stays recorded (the history before this run reads
 * it). No choice = nothing to do: the country's trial-end plan, as today.
 */
export async function applyTrialEndChoice(store: BillingStore, catalog: PlanCatalog, a: { truckId: string; now: Date; by: string }): Promise<'moved' | 'none'> {
  const truck = await store.truck(a.truckId)
  if (!truck?.trial_end_plan || !planEndPassed(truck, a.now)) return 'none'
  if (!planByKey(catalog, truck.plan)?.isTrial) return 'none'
  const eff = effectivePlan(truck, catalog, a.now)
  if (eff.plan.key !== truck.trial_end_plan) return 'none'   // not offered any more → the country's fallback stands
  await store.setTruckPlan(truck.id, truck.trial_end_plan, a.by, a.now.toISOString(), { clearPlanEnd: true })
  return 'moved'
}

/** Retry an unpaid invoice ourselves for this many days after its first failure (what Stripe's Smart Retries gave a one-off
 *  invoice in test mode: 9 attempts over 16 days — docs/billing-3-report.md §1). */
export const RETRY_FOR_DAYS = 16

/**
 * billing-3 item 1 (billing-2 §6 point 3): Stripe's Smart Retries DO retry our one-off invoices after ITS OWN automatic attempt fails
 * (proved on a test clock) — but a FAILED MANUAL attempt (invoices.pay: "Update card", payOpenInvoices) leaves next_payment_attempt
 * null, and Stripe never tries that invoice again. So: for every unpaid invoice that has failed and that Stripe has NO retry
 * scheduled for, try once per truck-local day (from 08:00, after the failure day, for RETRY_FOR_DAYS days) on the card on file —
 * idempotency key `billing:retry:<invoice>:<day>`, so a second run the same day replays the first instead of charging again.
 */
export async function retryUnpaidInvoices(store: BillingStore, processor: BillingProcessor | null, catalog: PlanCatalog,
  a: { truckId: string; now: Date; by: string }): Promise<{ invoiceId: string; outcome: 'refreshed' | 'retried' | 'waiting_for_stripe' | 'not_due'; status?: string }[]> {
  if (!processor || processor.livemode) return []
  const truck = await store.truck(a.truckId)
  if (!truck) return []
  const tz = tzOf(truck)
  const today = localDateOfInstant(a.now, tz)
  const tb = await store.truckBilling(truck.id)
  const out: { invoiceId: string; outcome: 'refreshed' | 'retried' | 'waiting_for_stripe' | 'not_due'; status?: string }[] = []
  for (const inv of await store.listInvoices(truck.id)) {
    if (!(inv.status === 'open' || inv.status === 'failed') || !inv.stripeInvoiceId || !inv.firstFailedAt) continue
    const failDay = localDateOfInstant(inv.firstFailedAt, tz)
    const lastDay = localDateOfInstant(new Date(Date.parse(inv.firstFailedAt) + RETRY_FOR_DAYS * 86_400_000), tz)
    if (today <= failDay || today > lastDay || a.now.getTime() < instantOfLocal(today, '08:00:00', tz)) { out.push({ invoiceId: inv.id, outcome: 'not_due' }); continue }
    const now = await processor.retrieveInvoice(inv.stripeInvoiceId)
    if (now.status !== 'open') { await applyInvoiceUpdate(store, catalog, now, a.now); out.push({ invoiceId: inv.id, outcome: 'refreshed', status: now.status }); continue }
    if (now.nextPaymentAttempt) { out.push({ invoiceId: inv.id, outcome: 'waiting_for_stripe' }); continue }
    if (tb?.paymentMethodState !== 'valid' || !tb.stripePaymentMethodId) { out.push({ invoiceId: inv.id, outcome: 'not_due' }); continue }
    const res = await processor.payInvoice(inv.stripeInvoiceId, tb.stripePaymentMethodId, { idempotencyKey: `billing:retry:${inv.stripeInvoiceId}:${today}` })
    await applyInvoiceUpdate(store, catalog, res, a.now)
    out.push({ invoiceId: inv.id, outcome: 'retried', status: res.status })
  }
  return out
}
