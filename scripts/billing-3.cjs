#!/usr/bin/env node
// scripts/billing-3.cjs — billing-3 (11 November 2026, docs/billing-3-report.md): the three approved changes and the fixes found on
// the way, built switched off. NO NETWORK, NO DATABASE, NEVER A LIVE TRUCK: the REAL lib/billing rules, view, engine and screen
// loader over the in-memory store (lib/billing/memory-store.ts) and a fake processor.
//   1 · item 2: "How customers pay for pre-orders" — the second choice's title is the locale's own Pay at Hatch word, the new hint line;
//       and what a Pay at Hatch order does when the truck chose "Online, when they order" (the gate)
//   2 · item 4: notice F (trial over, no card, online ordering paused) — words, priority, not dismissible; the Payment method card line
//   3 · item 5: choosing a plan during the trial — stored, nothing charged, the trial line and notice C name it, the trial-end charge
//       is on it, trucks.plan moves to it after the end; no choice = the country's trial-end plan, as today
//   4 · the plan-end fix: an upgrade after an ended trial takes effect (trial_expires_at cleared), as does a held downgrade on the 1st
//   5 · the hourly retry's timing (a fake processor): only when the payment processor has no retry scheduled, from the day after, 08:00, once a day
//   6 · every language base carries the new words; Gusto-shaped trucks (not billing_test, switch off) see nothing new
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '..')
const kit = require('./_render-kit.cjs')({ cacheTag: 'billing-3' })

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const J = JSON.stringify

const plan = (key, name, sortOrder, o = {}) => ({ key, name, description: '', sortOrder, isPublic: false, isInternal: false, isTrial: false, isSignupDefault: false,
  isExpiryFallback: false, isDemo: false, payAtHatchAllowed: true, active: true, includedVans: 1, trialMonths: null, isHighlighted: false, subtitle: null, ...o })
const PLANS = [plan('payg', 'Pay as you go', 1, { isPublic: true, isExpiryFallback: true }), plan('pro', 'Pro', 2, { isPublic: true }), plan('unlimited', 'Unlimited', 3, { isPublic: true }),
  plan('trial', 'Free trial', 4, { isInternal: true, isTrial: true, isSignupDefault: true, trialMonths: 3 })]
const price = (planKey, countryCode, monthlyMinor, includedOnlineMinor, feeBps, o = {}) => ({ planKey, countryCode, monthlyMinor, includedOnlineMinor, feeBps, extraVanMonthlyMinor: monthlyMinor, offered: true, trialEnd: false, ...o })
const PRICES = [price('payg', 'GB', 0, 0, 99), price('pro', 'GB', 2900, 400000, 99), price('unlimited', 'GB', 6900, null, 0)]
const CATALOG = { plans: PLANS, prices: PRICES, features: [] }

;(async () => {
  const B = await kit.bundle('billing-3', [
    "export * as R from '@/lib/billing/rules'", "export * as V from '@/lib/billing/view'", "export * as E from '@/lib/billing/engine'",
    "export * as S from '@/lib/billing/memory-store'", "export * as SS from '@/lib/billing/screen-server'", "export * as G from '@/lib/billing/gate'",
    "export * as P from '@/lib/plans'", "export { translatorFor } from '@/lib/i18n/translator'", "export { priceText } from '@/lib/price-text'",
    "export { PRICE_WORD } from '@/lib/price-words'", "import '@/lib/i18n/catalog/billing'", "import '@/lib/i18n/catalog/planFeatures'",
  ].join('\n'), { stubs: { '@/lib/billing/store': 'export async function serverBillingStore() { if (!globalThis.__billingStore) throw new Error("no store"); return globalThis.__billingStore }' } })
  const { R, V, E, S, SS, G, P, translatorFor, priceText, PRICE_WORD } = B
  const tb = translatorFor('en-GB', 'billing')

  // One GB world: a trialling truck (ends 31 Jan 2027 23:59:59 London), and switches as asked.
  function world({ on = true, test = true, trialEnd = '2027-01-31T23:59:59.000Z', tbx = {} } = {}) {
    const d = S.emptyMemoryData()
    d.switches = { enabled: on, pauseAfterDays: 5, suspendWarningDays: 6 }
    d.countryFacts = [{ countryCode: 'GB', currency: 'GBP', locale: 'en-GB', platformFeeEnabled: false, platformFeeAllowed: true }]
    d.countryBilling = [{ countryCode: 'GB', paymentModel: 'fee_from_payment', postPaySurchargeBps: 0, postPaySurchargeFixedMinor: 0, minChargeMinor: 500, lateFeeMinor: 0, updatedAt: 'x' }]
    d.trucks.push({ id: 'trial', name: 'Truck trial', slug: 'trial', country: 'GB', currency: 'GBP', timezone: 'Europe/London', plan: 'trial', trial_expires_at: trialEnd, is_customer: false, operator_id: 'op' })
    d.operators.push({ id: 'op', email: 'op@example.test', name: 'Sam', firstName: 'Sam' })
    d.truckBilling.push({ truckId: 'trial', postPay: false, billingTest: test, paymentMethodState: 'none', paymentMethodType: null, stripePaymentMethodId: null, stripeSetupIntentId: null,
      paymentMethodLabel: null, paymentMethodUpdatedAt: null, paymentMethodLivemode: null, status: null, statusReason: null, statusChangedAt: null, pendingPlanKey: null, pendingPlanFrom: null,
      trialEndPlanKey: null, ...tbx })
    return d
  }
  const VISA = { paymentMethodState: 'valid', paymentMethodType: 'card', stripePaymentMethodId: 'pm_1', paymentMethodLabel: 'visa •••• 4242' }
  const screen = async (d, nowIso) => SS.loadBillingScreen(S.memoryBillingStore(d), CATALOG, 'trial', new Date(nowIso))
  // A fake processor: invoices are created open and paid on a good card (enough for the plan side; no network).
  let seq = 0
  const fakeProc = () => ({ livemode: false, invoices: {},
    async ensureCustomer() { return 'cus_fake' },
    async createInvoice(a) { const id = `in_fake_${++seq}`; const inv = { id, status: 'open', amountDueMinor: a.lines.reduce((s, l) => s + l.amountMinor, 0), amountPaidMinor: 0, attemptCount: 0, lastError: null, finalizedAt: new Date().toISOString(), paidAt: null, hostedUrl: `https://pay.example/${id}`, pdfUrl: null, nextPaymentAttempt: null, metadata: {} }; this.invoices[id] = inv; return { ...inv } },
    async retrieveInvoice(id) { return { ...this.invoices[id] } },
    async payInvoice(id) { const inv = this.invoices[id]; inv.attemptCount++; return { ...inv } },
  })

  // ══ 1 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · item 2: the Pay at Hatch choice, and what it means for a customer when the truck chose "Online"')
  {
    t('the second choice\'s title is the locale\'s existing word: "Pay at Hatch" (en-GB)', priceText(PRICE_WORD.payAtHatch, 'en-GB') === 'Pay at Hatch')
    const en = JSON.parse(read('messages/en-US.json')), nz = JSON.parse(read('messages/en-NZ.json'))
    t('…"Pay at the truck" in the English locales that word it so (en-NZ), each language its own word (fr: Paiement sur place)',
      priceText(PRICE_WORD.payAtHatch, 'en-NZ') === nz.planFeatures.priceWord.payAtHatch && priceText(PRICE_WORD.payAtHatch, 'fr-FR') === JSON.parse(read('messages/fr-FR.json')).planFeatures.priceWord.payAtHatch)
    void en
    t('the line under it: "Customers pay when they collect. Our fee is added to your monthly charge."', tb('tab.preorders.atTruckHint') === 'Customers pay when they collect. Our fee is added to your monthly charge.')
    const bs = strip(read('components/manage/BillingScreen.tsx'))
    t('the screen shows priceText(PRICE_WORD.payAtHatch) as that title (the old "At the truck, when they collect" key is gone everywhere)',
      /payAtHatch: priceText\(PRICE_WORD\.payAtHatch, country\.locale\)/.test(bs) && /\{w\.payAtHatch\}/.test(bs) && !/tab\.preorders\.atTruck'/.test(bs) && !('atTruck' in JSON.parse(read('messages/en-GB.json')).billing.tab.preorders))
    // The gate for a truck that chose "Online, when they order" (post_pay false), billing on.
    const gateOf = async (d, nowIso) => { globalThis.__billingStore = S.memoryBillingStore(d); G.__resetBillingSwitchCache(); return G.billingGateForTruck({ id: 'trial' }, CATALOG, new Date(nowIso)) }
    const onTrial = await gateOf(world({ tbx: VISA }), '2027-01-10T12:00:00Z')
    t('"Online" chosen, during the trial: Pay at Hatch is still offered (plan permitting) and card payment too', onTrial.payAtHatchAllowed === true && onTrial.cardPaymentsAllowed === true, onTrial)
    const after = await gateOf(world({ tbx: VISA }), '2027-02-10T12:00:00Z')
    t('"Online" chosen, after the trial: Pay at Hatch is NOT offered — customers pay online by card', after.payAtHatchAllowed === false && after.cardPaymentsAllowed === true, after)
    const pp = await gateOf(world({ tbx: { ...VISA, postPay: true } }), '2027-02-10T12:00:00Z')
    t('"Pay at Hatch" chosen (post-pay), after the trial, a card on file: Pay at Hatch only, no card payment online', pp.payAtHatchAllowed === true && pp.cardPaymentsAllowed === false, pp)
    const off = await gateOf(world({ on: false, test: false, tbx: VISA }), '2027-02-10T12:00:00Z')
    t('billing off: today\'s rule (the gate answers "off" — the plan\'s own Pay at Hatch switch alone decides)', J(off) === J(G.BILLING_GATE_OFF), off)
    // The fee on a Pay at Hatch order: never taken at the truck, so it is billed on the next 1st (the allocation's 'invoice' route).
    const al = R.allocateUsage({ orders: [{ orderKey: 'a', placedAt: '2027-02-05T12:00:00Z', paidOnline: false, foodMinor: 10000, refundedFoodMinor: 0, feeTakenMinor: 0, status: 'collected', source: 'web' }], allowanceMinor: 0, feeBps: 99, roundDown: false })
    t('the fee on a pay-at-the-truck pre-order is billed on the monthly invoice (feeVia "invoice"), never taken at the truck', al.lines[0]?.feeVia === 'invoice' && al.totals.feeBilledMinor === al.lines[0].feeMinor && al.lines[0].feeMinor > 0, al.lines)
  }

  // ══ 2 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · item 4: notice F — the trial is over, no card, online ordering paused')
  {
    t('the words: "<b>Your free trial has ended.</b> Add a card to turn online ordering back on." + "Add card →"',
      JSON.parse(read('messages/en-GB.json')).billing.notices.trialEnded === '<b>Your free trial has ended.</b> Add a card to turn online ordering back on.' && tb('notices.addCard') === 'Add card →')
    const l = await screen(world(), '2027-02-03T12:00:00Z')
    t('trial over, no card → notice F, not dismissible', l.visible && l.view.notice?.kind === 'trial_ended' && l.view.notice.dismissible === false && l.view.trialEndedNoCard === true, l.view?.notice)
    const ctx = await E.billingContextFor(S.memoryBillingStore(world()), world().trucks[0], CATALOG, new Date('2027-02-03T12:00:00Z'), { forceSwitch: true })
    t('…the state it names: online ordering paused (no payment method)', J(R.billingStatusOf(ctx)) === J({ status: 'paused', reason: 'no_payment_method' }))
    t('the Payment method card in that state: "No card added. Add one to turn online ordering back on." (+ "Add card")', tb('tab.payment.noneAfterTrial') === 'No card added. Add one to turn online ordering back on.'
      && /view\.trialEndedNoCard \? t\('tab\.payment\.noneAfterTrial'\) : t\('tab\.payment\.none'\)/.test(strip(read('components/manage/BillingScreen.tsx'))))
    const card = await screen(world({ tbx: VISA }), '2027-02-03T12:00:00Z')
    t('trial over WITH a card: no F (nothing to say)', card.view.notice === null && card.view.trialEndedNoCard === false, card.view.notice)
    const pend = await screen(world({ tbx: { paymentMethodState: 'pending', paymentMethodType: 'pix' } }), '2027-02-03T12:00:00Z')
    t('a payment method waiting for confirmation (Pix): no F', pend.view.notice === null, pend.view.notice)
    const during = await screen(world(), '2027-01-30T12:00:00Z')
    t('during the trial: A/B as before, never F', during.view.notice?.kind === 'trial_ends_tomorrow' || during.view.notice?.kind === 'trial_ends_soon', during.view.notice)
    // Priority: a failed invoice (D) and a pause (E) still come first.
    const dF = world(); dF.invoices.push({ id: 'i1', chargeId: 'c1', truckId: 'trial', period: '2027-02-01', currency: 'GBP', amountMinor: 2900, livemode: false, stripeInvoiceId: 'in_1', status: 'failed', dueAt: '2027-02-01T08:00:00Z', attemptCount: 1, lastError: 'x', hostedInvoiceUrl: 'https://pay.example/1', createdAt: '2027-02-01T08:00:00Z', finalizedAt: '2027-02-01T08:00:00Z', paidAt: null, lateFeeMinor: null, replacedStripeInvoiceId: null, firstFailedAt: '2027-02-01T08:00:00Z', invoicePdfUrl: null })
    dF.charges.push({ id: 'c1', truckId: 'trial', period: '2027-02-01', kind: 'monthly', ref: '', currency: 'GBP', planKey: 'payg', fromPlanKey: null, planMinor: 2900, planDays: 28, periodDays: 28, vansMinor: 0, usagePeriod: '2027-01-01', usageFeeMinor: 0, surchargeMinor: 0, carriedInMinor: 0, amountDueMinor: 2900, chargedMinor: 2900, carriedOutMinor: 0, carriedInto: null, minChargeMinor: 500, state: 'invoiced', inputsDigest: 'x', computedAt: '2027-02-01T08:00:00Z' })
    const pr = await screen(dF, '2027-02-03T12:00:00Z')
    t('priority: a payment failure (D) still comes before F', pr.view.notice?.kind === 'payment_failed', pr.view.notice)
    const bs = strip(read('components/manage/BillingScreen.tsx'))
    t('the strip renders F with the existing mechanism (amber, "Add card →", no ✕) and, on iOS, not at all (3.1.1, as A–E)',
      /notice\.kind === 'trial_ended' \? w\.t\.rich\('notices\.trialEnded', \{ b \}\)/.test(bs) && /if \(dismissed \|\| !purchaseCtaAllowed\(\)\) return null/.test(bs))
  }

  // ══ 3 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · item 5: choosing a plan during the trial')
  {
    t('the words: "You’re on a free trial. Choose your plan for when it ends on {date}." · "Starts when your trial ends." · "Choose {plan}"',
      tb('changePlan.trialLine', { date: '31 January' }) === 'You’re on a free trial. Choose your plan for when it ends on 31 January.' && tb('changePlan.startsAtTrialEnd') === 'Starts when your trial ends.' && tb('changePlan.choose', { plan: 'Pro' }) === 'Choose Pro')
    const d = world({ tbx: VISA })
    const store = S.memoryBillingStore(d)
    const proc = fakeProc()
    const before = await screen(d, '2027-01-10T12:00:00Z')
    t('no choice: the trial ends into the country\'s plan (Pay as you go here), as today', before.view.trial?.afterPlanKey === 'payg', before.view.trial)
    t('"Change plan" is offered during the trial (the button no longer hides on the trial)', /\{cta && view\.plans\.length > 1 && <button/.test(strip(read('components/manage/BillingScreen.tsx'))))
    const pv = V.planChangePreview({ ...before.input, toPlanKey: 'pro' })
    t('the trial preview: starts when the trial ends (31 Jan), nothing charged now — no amount box', pv.direction === 'in_trial' && pv.amountMinor === 0 && pv.trialEndDate === '2027-01-31', pv)
    const ch = await E.requestPlanChange(store, proc, CATALOG, { truckId: 'trial', planKey: 'pro', now: new Date('2027-01-10T12:00:00Z'), by: 'h', testRun: true })
    t('choosing Pro: stored as the plan the trial ends into; no invoice, no charge, trucks.plan untouched', ch.outcome === 'trial_choice' && d.truckBilling[0].trialEndPlanKey === 'pro' && d.charges.length === 0 && Object.keys(proc.invoices).length === 0 && d.trucks[0].plan === 'trial', { ch, charges: d.charges.length })
    const afterChoice = await screen(d, '2027-01-10T12:00:00Z')
    t('the plan card\'s trial line now names Pro ("After that, Pro is £29 a month.")', afterChoice.view.trial?.afterPlanKey === 'pro' && afterChoice.view.trial?.afterMonthlyMinor === 2900, afterChoice.view.trial)
    const c = await screen(d, '2027-01-28T12:00:00Z')
    t('notice C names it: "You’re all set. Pro starts on 1 February."', c.view.notice?.kind === 'all_set' && c.view.notice.planKey === 'pro' && c.view.notice.date === '2027-02-01', c.view.notice)
    const effEnd = P.effectivePlan({ ...d.trucks[0], trial_end_plan: 'pro' }, CATALOG, new Date('2027-02-01T00:00:01Z'))
    t('lib/plans effectivePlan: an ended trial with a choice answers the chosen plan', effEnd.plan.key === 'pro' && effEnd.ended === true, effEnd.plan.key)
    t('…and with no choice (every other code path, Gusto included), the country\'s fallback exactly as before', P.effectivePlan({ ...d.trucks[0] }, CATALOG, new Date('2027-02-01T00:00:01Z')).plan.key === 'payg'
      && P.effectivePlan({ ...d.trucks[0], trial_end_plan: 'pro' }, CATALOG, new Date('2027-01-15T00:00:00Z')).plan.key === 'trial')
    t('…a chosen plan that is not offered (or not public) is ignored → the country\'s fallback', P.effectivePlan({ ...d.trucks[0], trial_end_plan: 'trial' }, CATALOG, new Date('2027-02-02T00:00:00Z')).plan.key === 'payg'
      && P.effectivePlan({ ...d.trucks[0], trial_end_plan: 'pro' }, { ...CATALOG, prices: PRICES.map(p => p.planKey === 'pro' ? { ...p, offered: false } : p) }, new Date('2027-02-02T00:00:00Z')).plan.key === 'payg')
    // A trial ending mid-month: the end-of-trial charge is on the chosen plan (as billing-1 charges the trial's plan).
    const dm = world({ trialEnd: '2027-02-14T23:59:59.000Z', tbx: { ...VISA, trialEndPlanKey: 'pro' } })
    const sm = S.memoryBillingStore(dm)
    const settled = await E.settleMidMonth(sm, fakeProc(), CATALOG, { truckId: 'trial', now: new Date('2027-02-15T09:00:00Z'), by: 'h', testRun: true })
    const te = settled.find(x => x.kind === 'trial_end')
    t('a trial ending 14 Feb with Pro chosen → the rest of February on Pro: £29 × 14/28 = £14.50, invoiced then', te?.outcome === 'invoiced' && te.charge.planKey === 'pro' && te.charge.chargedMinor === 1450, settled)
    const moved = await E.applyTrialEndChoice(sm, CATALOG, { truckId: 'trial', now: new Date('2027-02-15T09:00:00Z'), by: 'h' })
    t('after the end the hourly run moves trucks.plan to Pro and clears the past end date (every surface then agrees)', moved === 'moved' && dm.trucks[0].plan === 'pro' && dm.trucks[0].trial_expires_at === null, dm.trucks[0])
    const again = await E.settleMidMonth(sm, fakeProc(), CATALOG, { truckId: 'trial', now: new Date('2027-02-15T10:00:00Z'), by: 'h', testRun: true })
    t('…and nothing is charged twice for it (the move is not an upgrade)', again.every(x => x.kind !== 'upgrade') && dm.charges.filter(x => x.kind === 'trial_end').length === 1, again)
    t('no choice → nothing moves (the country\'s plan applies through effectivePlan, as today)', (await E.applyTrialEndChoice(S.memoryBillingStore(world({ tbx: VISA })), CATALOG, { truckId: 'trial', now: new Date('2027-02-15T09:00:00Z'), by: 'h' })) === 'none')
    const ord = strip(read('lib/billing/engine.ts'))
    t('the hourly run moves the choice BEFORE it charges', ord.indexOf('applyTrialEndChoice(store, catalog, { truckId: id, now, by })') > 0 && ord.indexOf('applyTrialEndChoice(store, catalog, { truckId: id, now, by })') < ord.indexOf('runMonthly(store, processor, catalog, { truckId: id, period, now, by })'))
    const route = strip(read('app/api/manage/billing/route.ts'))
    t('the API answers the trial choice with the new view (no longer a 400 "in_trial")', !/in_trial/.test(route) && /if \(out\.outcome === 'skipped'\) return json/.test(route))
  }

  // ══ 4 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · the plan-end fix: an upgrade after an ended trial takes effect')
  {
    const d = world({ tbx: VISA })   // the trial ended 31 Jan; no choice → Pay as you go
    const store = S.memoryBillingStore(d)
    const proc = fakeProc()
    const before = P.effectivePlan(d.trucks[0], CATALOG, new Date('2027-02-10T12:00:00Z'))
    t('after the trial (no choice): Pay as you go, through the fallback', before.plan.key === 'payg' && before.ended === true)
    const up = await E.requestPlanChange(store, proc, CATALOG, { truckId: 'trial', planKey: 'pro', now: new Date('2027-02-10T12:00:00Z'), by: 'h', testRun: true })
    const eff = P.effectivePlan(d.trucks[0], CATALOG, new Date('2027-02-10T12:00:01Z'))
    t('Change plan → Pro: trucks.plan is Pro AND the past end date is cleared, so Pro applies (before billing-3 it stayed Pay as you go)', up.outcome === 'changed' && d.trucks[0].plan === 'pro' && d.trucks[0].trial_expires_at === null && eff.plan.key === 'pro', { up: up.outcome, truck: d.trucks[0], eff: eff.plan.key })
    const upCharge = up.outcome === 'changed' ? up.charges.find(x => x.kind === 'upgrade') : null
    t('…and the rest of February is charged on Pro (£29 × 19/28 = £19.67)', upCharge?.outcome === 'invoiced' && upCharge.charge.chargedMinor === 1967, up)
    // A held downgrade applied on the 1st after an ended trial: the same.
    const dd = world({ tbx: { ...VISA, pendingPlanKey: 'payg', pendingPlanFrom: '2027-03-01' } })
    dd.trucks[0].plan = 'unlimited'
    const sd = S.memoryBillingStore(dd)
    await E.runMonthly(sd, fakeProc(), CATALOG, { truckId: 'trial', period: '2027-03-01', now: new Date('2027-03-01T09:00:00Z'), by: 'h', testRun: true })
    t('a held downgrade applied on the 1st also clears a past end date', dd.trucks[0].plan === 'payg' && dd.trucks[0].trial_expires_at === null, dd.trucks[0])
    const live = world({ trialEnd: null, tbx: VISA }); live.trucks[0].plan = 'pro'
    const sl = S.memoryBillingStore(live)
    await E.requestPlanChange(sl, fakeProc(), CATALOG, { truckId: 'trial', planKey: 'unlimited', now: new Date('2027-02-10T12:00:00Z'), by: 'h', testRun: true })
    t('a truck with no end date: nothing else changes (only trucks.plan)', live.trucks[0].plan === 'unlimited' && live.trucks[0].trial_expires_at === null)
  }

  // ══ 5 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · the hourly retry (the processor does retry — this only acts when the processor has nothing scheduled)')
  {
    const d = world({ trialEnd: null, tbx: VISA }); d.trucks[0].plan = 'pro'
    const store = S.memoryBillingStore(d)
    const proc = fakeProc()
    const inv = await proc.createInvoice({ lines: [{ amountMinor: 2900 }] })
    d.invoices.push({ id: 'r1', chargeId: 'c-r1', truckId: 'trial', period: '2027-03-01', currency: 'GBP', amountMinor: 2900, livemode: false, stripeInvoiceId: inv.id, status: 'failed', dueAt: '2027-03-01T08:00:00Z', attemptCount: 1, lastError: 'x', hostedInvoiceUrl: null, createdAt: '2027-03-01T08:00:00Z', finalizedAt: '2027-03-01T08:00:00Z', paidAt: null, lateFeeMinor: null, replacedStripeInvoiceId: null, firstFailedAt: '2027-03-01T10:00:00Z', invoicePdfUrl: null })
    const at = async iso => (await E.retryUnpaidInvoices(store, proc, CATALOG, { truckId: 'trial', now: new Date(iso), by: 'h' }))[0]?.outcome
    proc.invoices[inv.id].nextPaymentAttempt = '2027-03-03T10:00:00Z'
    t('the processor has a retry scheduled → left to the processor', (await at('2027-03-02T09:00:00Z')) === 'waiting_for_stripe')
    proc.invoices[inv.id].nextPaymentAttempt = null
    t('nothing scheduled: not on the failure day', (await at('2027-03-01T20:00:00Z')) === 'not_due')
    t('…not before 08:00 truck time the next day', (await at('2027-03-02T07:59:00Z')) === 'not_due')
    t('…retried from 08:00 the next day', (await at('2027-03-02T08:00:00Z')) === 'retried')
    t('…and not after 16 days', (await at('2027-03-18T09:00:00Z')) === 'not_due')
    t('a live processor is refused (nothing at all)', (await E.retryUnpaidInvoices(store, { ...proc, livemode: true }, CATALOG, { truckId: 'trial', now: new Date('2027-03-02T09:00:00Z'), by: 'h' })).length === 0)
    t('the hourly run calls it (after charging, before the late fee)', /retryUnpaidInvoices\(store, processor, catalog, \{ truckId: id, now, by \}\)/.test(strip(read('lib/billing/engine.ts'))))
  }

  // ══ 6 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('6 · every language base carries the new words; nothing new for a truck billing is not shown to')
  {
    const src = read('lib/i18n/locales.ts')
    const bases = JSON.parse(src.match(/export const LANGUAGE_BASES[^=]*= (\[[^\]]*\])/)[1].replace(/'/g, '"'))
    const KEYS = ['notices.trialEnded', 'tab.payment.noneAfterTrial', 'changePlan.trialLine', 'changePlan.startsAtTrialEnd', 'changePlan.choose', 'tab.preorders.atTruckHint']
    const en = JSON.parse(read('messages/en-GB.json')).billing
    const get = (o, k) => k.split('.').reduce((x, p) => (x ? x[p] : undefined), o)
    const missing = []
    for (const l of bases) {
      const b = JSON.parse(read(`messages/${l}.json`)).billing
      for (const k of KEYS) { const v = get(b, k); if (typeof v !== 'string' || !v.trim() || v === get(en, k)) missing.push(`${l}:${k}`) }
      if (b?.tab?.preorders && 'atTruck' in b.tab.preorders) missing.push(`${l}: atTruck still there`)
    }
    t(`all ${bases.length} language bases have the 6 new/changed strings, translated (not English), and no longer the old title`, bases.length === 36 && missing.length === 0, missing.slice(0, 20))
    const none = []
    for (const l of bases) { const s = JSON.stringify(JSON.parse(read(`messages/${l}.json`)).billing); if (/[‪-‮⁦-⁩]/.test(s)) none.push(l) }
    t('no bidi control characters in any billing words', none.length === 0, none)
    const g = world({ on: false, test: false, tbx: VISA })
    t('switch off and not a billing_test truck (as Pizzeria Gusto): the Billing screen stays today\'s ({ visible: false })', (await screen(g, '2027-02-03T12:00:00Z')).visible === false)
    const gs = S.memoryBillingStore(g)
    const runs = await E.runBillingAll(gs, fakeProc(), CATALOG, new Date('2027-02-15T09:00:00Z'))
    t('…and the hourly run does nothing at all with the switch off (no move, no retry, no write)', runs.skipped === 'switch_off' && g.writes.length === 0 && g.trucks[0].plan === 'trial', { runs, writes: g.writes })
    const reg = JSON.parse(read('scripts/harnesses.json'))
    t('this harness is in the sweep list', reg.harnesses.includes('billing-3.cjs'))
  }

  console.log(`\n${fail === 0 ? '✅' : '🔴'} billing-3: ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})().catch(e => { console.error('🔴 crashed:', e && e.stack || e); process.exit(1) })
