// lib/billing/engine.ts — billing-1: THE MONTH-END RUN AND EVERYTHING THAT MOVES A TRUCK'S BILLING STATE.
// No server-only import: it talks to a BillingStore and a BillingProcessor it is handed (lib/billing/store-types.ts,
// lib/billing/processor.ts), so the harness runs exactly this code against an in-memory store and a fake processor.
//
// ── 🔴 NEVER BILLED TWICE ───────────────────────────────────────────────────────────────────────────────────────────
//   1  A month is computed into billing_usage while it is OPEN; once it is invoiced, carried or found to owe nothing it
//      is FROZEN and never recomputed (replaceUsage refuses).
//   2  billing_invoices has unique (truck_id, period): the claim is an INSERT, and a second run finds the first's row.
//   3  Every Stripe call carries a key derived from the truck, the period and the step (lib/billing/processor.ts).
//   4  An order whose fee was taken by application fee is never on an invoice (lib/billing/rules.ts allocateUsage).
//
// ── 🔴 OFF MEANS OFF ────────────────────────────────────────────────────────────────────────────────────────────────
// Every entry point reads platform_switches.billing_enabled first and returns `skipped: switch_off` while it is false —
// except an admin's explicit TEST run for a truck whose truck_billing row is marked billing_test (the processor is
// Stripe test mode only, so even that can charge nobody).
import type { PlanCatalog } from '@/lib/plans'
import { planByKey } from '@/lib/plans'
import { minorDigits } from '@/lib/money-format'
import {
  billingStatusOf, arrangementOf, billableOf, composeMonth, invoiceLinesOf, digestOf, periodBounds, periodOf, previousPeriod,
  stripeLocaleFor, DEFAULT_TRUCK_BILLING, type BillingContext, type TruckBillingFacts, type PaymentMethodType, type MonthResult,
} from '@/lib/billing/rules'
import type { BillingStore, TruckBillingRow, UsageRow, InvoiceRow, StoredTruck, InvoiceStatus } from '@/lib/billing/store-types'
import type { BillingProcessor, ProcessorInvoice, ProcessorPaymentMethod } from '@/lib/billing/processor'

const factsOf = (r: TruckBillingRow | null): TruckBillingFacts => r
  ? { postPay: r.postPay, billingTest: r.billingTest, paymentMethodState: r.paymentMethodState, paymentMethodType: r.paymentMethodType }
  : DEFAULT_TRUCK_BILLING

/** Build the context for one truck from the store. `forceSwitch` is the admin test run's override (test trucks only). */
export async function billingContextFor(store: BillingStore, truck: StoredTruck, catalog: PlanCatalog, now: Date, opts: { forceSwitch?: boolean } = {}): Promise<BillingContext> {
  const [sw, cb, tb, facts, invoices] = await Promise.all([
    store.switches(), store.countryBilling(truck.country), store.truckBilling(truck.id), store.countryFacts(truck.country), store.listInvoices(truck.id),
  ])
  const truckBilling = factsOf(tb)
  return {
    switchOn: sw.enabled || (opts.forceSwitch === true && truckBilling.billingTest),
    pauseAfterDays: sw.pauseAfterDays,
    truck, catalog,
    country: { countryCode: truck.country, platformFeeEnabled: facts?.platformFeeEnabled === true, platformFeeAllowed: facts?.platformFeeAllowed !== false },
    countryBilling: cb,
    truckBilling,
    unpaid: invoices.filter(i => i.status === 'open' || i.status === 'failed').map(i => ({ dueAt: i.dueAt ?? i.createdAt })),
    now,
  }
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

// ── the month ───────────────────────────────────────────────────────────────────────────────────────────────────────

export type MonthOutcome =
  | { truckId: string; period: string; outcome: 'skipped'; reason: string }
  | { truckId: string; period: string; outcome: 'nothing' | 'carried' | 'no_payment_method'; usage: UsageRow }
  | { truckId: string; period: string; outcome: 'invoiced' | 'already'; usage: UsageRow; invoice: InvoiceRow }
  | { truckId: string; period: string; outcome: 'failed'; reason: string; usage?: UsageRow; invoice?: InvoiceRow }

/** Compute (but do not charge) one truck's month — what Admin shows as the open month, and step 1 of runMonth. */
export async function computeMonth(store: BillingStore, catalog: PlanCatalog, truck: StoredTruck, ctx: BillingContext, period: string, now: Date):
  Promise<{ ok: true; result: MonthResult; usage: UsageRow } | { ok: false; reason: string }> {
  const billable = billableOf(ctx)
  if (!billable.billable) return { ok: false, reason: billable.reason }
  const arrangement = arrangementOf(ctx)
  if (!arrangement || !ctx.countryBilling) return { ok: false, reason: 'country_not_configured' }
  const tz = truck.timezone || 'Europe/London'
  const { start, end } = periodBounds(period, tz)
  const [orders, vanCount, prev] = await Promise.all([
    store.usageOrders(truck.id, start, end), store.vanCount(truck.id), store.usage(truck.id, previousPeriod(period)),
  ])
  const carriedInMinor = prev && prev.state === 'carried' ? prev.carriedOutMinor : 0
  const roundDown = minorDigits(truck.currency) === 0
  const result = composeMonth({
    period, truck, catalog, countryCode: truck.country, countryBilling: ctx.countryBilling, arrangement, vanCount, orders, carriedInMinor, roundDown,
  })
  const usage: UsageRow = {
    truckId: truck.id, period, currency: truck.currency, countryCode: truck.country, paymentModel: arrangement.model, postPay: arrangement.postPay,
    planKey: result.planKey, preorderCount: result.totals.preorderCount, countedOnlineMinor: result.totals.countedOnlineMinor,
    countedAtTruckMinor: result.totals.countedAtTruckMinor, countedMinor: result.totals.countedMinor, allowanceMinor: result.allowanceMinor,
    allowanceUsedMinor: result.totals.allowanceUsedMinor, feeBps: result.feeBps, feeDueMinor: result.totals.feeDueMinor,
    feeTakenMinor: result.totals.feeTakenMinor, feeBilledMinor: result.totals.feeBilledMinor, planFeeMinor: result.planFeeMinor,
    planDays: result.planDays, periodDays: result.periodDays, extraVansMinor: result.extraVansMinor, surchargeMinor: result.surchargeMinor,
    carriedInMinor: result.carriedInMinor, amountDueMinor: result.amountDueMinor, chargedMinor: result.chargedMinor,
    carriedOutMinor: result.carriedOutMinor, minChargeMinor: result.minChargeMinor,
    inputsDigest: digestOf({ orders, vanCount, carriedInMinor, plan: truck.plan, end: truck.trial_expires_at, cb: ctx.countryBilling, arrangement }),
    state: 'open', computedAt: now.toISOString(),
  }
  return { ok: true, result, usage }
}

/**
 * 🔴 RUN ONE TRUCK'S MONTH-END: compute the month, freeze it, and — when something is owed above the minimum — raise ONE
 * invoice on the payment method on file, collected automatically by Stripe. Safe to run any number of times.
 */
export async function runMonth(store: BillingStore, processor: BillingProcessor | null, catalog: PlanCatalog,
  a: { truckId: string; period: string; now: Date; by: string; testRun?: boolean }): Promise<MonthOutcome> {
  const { truckId, period, now } = a
  const truck = await store.truck(truckId)
  if (!truck) return { truckId, period, outcome: 'skipped', reason: 'no_truck' }
  const ctx = await billingContextFor(store, truck, catalog, now, { forceSwitch: a.testRun === true })
  if (!ctx.switchOn) return { truckId, period, outcome: 'skipped', reason: 'switch_off' }
  const tz = truck.timezone || 'Europe/London'
  if (now.getTime() < Date.parse(periodBounds(period, tz).end)) return { truckId, period, outcome: 'skipped', reason: 'period_not_ended' }

  // A frozen month is never recomputed; an invoiced one is only ever COMPLETED (a claim that crashed half-way).
  const existing = await store.usage(truckId, period)
  let usage: UsageRow
  if (existing && existing.state !== 'open') {
    usage = existing
    if (existing.state === 'nothing' || existing.state === 'carried') return { truckId, period, outcome: existing.state, usage }
  } else {
    const c = await computeMonth(store, catalog, truck, ctx, period, now)
    if (!c.ok) return { truckId, period, outcome: 'skipped', reason: c.reason }
    usage = c.usage
    if (!(await store.replaceUsage(usage, c.result.lines))) {
      const frozen = await store.usage(truckId, period)
      return frozen ? { truckId, period, outcome: 'already', usage: frozen, invoice: (await store.invoice(truckId, period)) as InvoiceRow } : { truckId, period, outcome: 'failed', reason: 'usage_frozen_race' }
    }
    if (usage.state === 'open' && (c.result.state === 'nothing' || c.result.state === 'carried')) {
      await store.freezeUsage(truckId, period, c.result.state)
      return { truckId, period, outcome: c.result.state, usage: { ...usage, state: c.result.state } }
    }
  }

  // Something is owed. Payment method on file?
  const tb = await store.truckBilling(truckId)
  if (!tb || tb.paymentMethodState !== 'valid' || !tb.stripePaymentMethodId || !tb.paymentMethodType) {
    await refreshTruckBillingStatus(store, catalog, truckId, now, a.by)
    return { truckId, period, outcome: 'no_payment_method', usage }
  }
  if (!processor) return { truckId, period, outcome: 'failed', reason: 'no_processor', usage }
  if (processor.livemode) return { truckId, period, outcome: 'failed', reason: 'live_processor_refused', usage }

  // 🔴 THE CLAIM. One row per (truck, period), inserted before Stripe is asked anything.
  const { claimed, row } = await store.claimInvoice({ truckId, period, currency: truck.currency, amountMinor: usage.chargedMinor, livemode: processor.livemode })
  if (!claimed && row.status !== 'creating') {
    await store.freezeUsage(truckId, period, 'invoiced')
    return { truckId, period, outcome: 'already', usage: { ...usage, state: 'invoiced' }, invoice: row }
  }
  if (row.amountMinor !== usage.chargedMinor) {
    return { truckId, period, outcome: 'failed', reason: `claimed amount ${row.amountMinor} ≠ computed ${usage.chargedMinor}`, usage, invoice: row }
  }

  try {
    const customerId = await ensureCustomer(store, processor, truck)
    const plan = planByKey(catalog, usage.planKey)
    const month = await composeLines(store, catalog, truck, usage)
    const inv = await processor.createInvoice({
      customerId, truckId, period, currency: truck.currency, lines: invoiceLinesOf(month, plan?.name ?? usage.planKey, period),
      paymentMethodId: tb.stripePaymentMethodId, paymentMethodType: tb.paymentMethodType,
      description: `HatchGrab — ${truck.name} — ${period.slice(0, 7)}`,
    })
    if (inv.amountDueMinor !== usage.chargedMinor) {
      console.error(`[billing] 🔴 invoice ${inv.id} amount_due ${inv.amountDueMinor} ≠ ledger ${usage.chargedMinor} for ${truckId} ${period}`)
    }
    const updated = await store.updateInvoice(row.id, {
      stripeInvoiceId: inv.id, status: invoiceStatusOf(inv), dueAt: inv.finalizedAt ?? now.toISOString(),
      finalizedAt: inv.finalizedAt, paidAt: inv.paidAt, attemptCount: inv.attemptCount, hostedInvoiceUrl: inv.hostedUrl, lastError: inv.lastError,
    })
    await store.freezeUsage(truckId, period, 'invoiced')
    await refreshTruckBillingStatus(store, catalog, truckId, now, a.by)
    return { truckId, period, outcome: 'invoiced', usage: { ...usage, state: 'invoiced' }, invoice: updated }
  } catch (err) {
    const msg = (err instanceof Error ? err.message : String(err)).slice(0, 500)
    await store.updateInvoice(row.id, { lastError: msg })
    // The claim stays 'creating': the next run completes it under the same idempotency keys.
    return { truckId, period, outcome: 'failed', reason: msg, usage, invoice: row }
  }
}

/** The month's figures again from the frozen/open usage row (the lines are the row's, not a recomputation). */
async function composeLines(_store: BillingStore, _catalog: PlanCatalog, _truck: StoredTruck, u: UsageRow): Promise<MonthResult> {
  return {
    planKey: u.planKey, billableFrom: null, allowanceMinor: u.allowanceMinor, feeBps: u.feeBps, lines: [],
    totals: { preorderCount: u.preorderCount, countedOnlineMinor: u.countedOnlineMinor, countedAtTruckMinor: u.countedAtTruckMinor, countedMinor: u.countedMinor,
      allowanceUsedMinor: u.allowanceUsedMinor, feeDueMinor: u.feeDueMinor, feeTakenMinor: u.feeTakenMinor, feeBilledMinor: u.feeBilledMinor },
    planFeeMinor: u.planFeeMinor, planDays: u.planDays, periodDays: u.periodDays, extraVansMinor: u.extraVansMinor, surchargeMinor: u.surchargeMinor,
    carriedInMinor: u.carriedInMinor, amountDueMinor: u.amountDueMinor, chargedMinor: u.chargedMinor, carriedOutMinor: u.carriedOutMinor,
    minChargeMinor: u.minChargeMinor, state: 'invoiced',
  }
}

async function ensureCustomer(store: BillingStore, processor: BillingProcessor, truck: StoredTruck): Promise<string> {
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

/** The month-end for every candidate truck: the month that has just ended in each truck's own time zone. */
export async function runMonthEndAll(store: BillingStore, processor: BillingProcessor | null, catalog: PlanCatalog, now: Date, by = 'cron'):
  Promise<{ skipped?: 'switch_off'; outcomes: MonthOutcome[] }> {
  if (!(await store.switches()).enabled) return { skipped: 'switch_off', outcomes: [] }
  const outcomes: MonthOutcome[] = []
  for (const id of await store.candidateTruckIds()) {
    const truck = await store.truck(id)
    if (!truck) continue
    const period = previousPeriod(periodOf(now, truck.timezone || 'Europe/London'))
    try { outcomes.push(await runMonth(store, processor, catalog, { truckId: id, period, now, by })) }
    catch (err) { outcomes.push({ truckId: id, period, outcome: 'failed', reason: err instanceof Error ? err.message : String(err) }) }
    // Status after the run (trial ended without a card, the 5-day pause) — the daily job's other half.
    try { await refreshTruckBillingStatus(store, catalog, id, now, by) } catch { /* reported by the outcome list */ }
  }
  return { outcomes }
}

// ── events from Stripe (the billing webhook) ────────────────────────────────────────────────────────────────────────

/**
 * An invoice changed at Stripe (invoice.paid / payment_failed / finalized / voided / marked_uncollectible). Updates our
 * row and the truck's status — paying resumes online ordering at once, because the gate derives "paused" from the unpaid
 * invoices and this one is no longer unpaid. Unknown invoices (not ours) are ignored.
 */
export async function applyInvoiceUpdate(store: BillingStore, catalog: PlanCatalog, inv: ProcessorInvoice, now: Date): Promise<'updated' | 'unknown'> {
  const row = await store.invoiceByStripeId(inv.id)
  if (!row) return 'unknown'
  await store.updateInvoice(row.id, {
    status: invoiceStatusOf(inv), attemptCount: inv.attemptCount, lastError: inv.lastError,
    paidAt: inv.paidAt, finalizedAt: inv.finalizedAt ?? row.finalizedAt, dueAt: row.dueAt ?? inv.finalizedAt, hostedInvoiceUrl: inv.hostedUrl ?? row.hostedInvoiceUrl,
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

/** Start setting up a payment method (card everywhere; Pix Automático in Brazil). Returns the SetupIntent's client secret
 *  for the (not yet built) operator screen; records the intent so its webhook finds the truck. */
export async function startPaymentMethodSetup(store: BillingStore, processor: BillingProcessor, catalog: PlanCatalog,
  a: { truckId: string; type: PaymentMethodType; now: Date; by: string }): Promise<{ setupIntentId: string; clientSecret: string | null }> {
  if (processor.livemode) throw new Error('live processor refused')
  const truck = await store.truck(a.truckId)
  if (!truck) throw new Error('no truck')
  if (a.type === 'pix' && truck.currency !== 'BRL') throw new Error('Pix Automático is for Brazilian trucks (BRL) only')
  const customerId = await ensureCustomer(store, processor, truck)
  const si = await processor.createSetupIntent({ customerId, truckId: truck.id, type: a.type, currency: truck.currency })
  await store.upsertTruckBilling(truck.id, { stripeSetupIntentId: si.id, paymentMethodState: 'pending', paymentMethodUpdatedAt: a.now.toISOString() }, a.by)
  void catalog
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
