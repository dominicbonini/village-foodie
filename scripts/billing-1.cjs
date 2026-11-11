#!/usr/bin/env node
// scripts/billing-1.cjs — billing-1 (10 November 2026, docs/billing-1-report.md): HatchGrab charging trucks, built switched off.
// NO NETWORK, NO DATABASE, NEVER A LIVE TRUCK. The REAL lib/billing code — the rules, the month-end engine and the live-path gate —
// runs over the in-memory BillingStore (lib/billing/memory-store.ts, same contract as the database store) and a FAKE payment
// processor that behaves like the provider's test mode (idempotent by key; a "charge fails" test method declines).
//   1 · the switch OFF: nothing read but the switch, nothing written, every answer today's      2 · who is billed
//   3 · GB (a): the 1st = this month's plan IN ADVANCE + last month's usage IN ARREARS; walk-ups ignored; the fee at capture
//   4 · refunds   5 · BR and MX on Pay as you go, carry-over, Pix Automático, the guard for BR/MX/MY/SG/TH fee plans
//   6 · MX: the trial ends mid-month → the rest of the month charged that day   7 · a (c) country   8 · FR post-pay   9 · JPY
//   10 · the trial   11 · upgrade and downgrade mid-month (plan history)   12 · failed payment → day 5 pause + the late fee → paid
//   12b · never billed twice   13 · the key (test only)   14 · the live paths (constructs)   15 · the migrations   16 · Admin's classes
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '..')
const kit = require('./_render-kit.cjs')({ cacheTag: 'billing-1' })

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const J = JSON.stringify

// ── the catalogue: the live plans and prices (OBSERVED 10 November 2026) — plus XC, a made-up (c) country priced like FR ──────
const plan = (key, name, sortOrder, o = {}) => ({ key, name, description: '', sortOrder, isPublic: false, isInternal: false, isTrial: false, isSignupDefault: false,
  isExpiryFallback: false, isDemo: false, payAtHatchAllowed: true, active: true, includedVans: 1, trialMonths: null, isHighlighted: false, subtitle: null, ...o })
const PLANS = [
  plan('payg', 'Pay as you go', 1, { isPublic: true, isExpiryFallback: true }), plan('pro', 'Pro', 2, { isPublic: true, isHighlighted: true }),
  plan('unlimited', 'Unlimited', 3, { isPublic: true }), plan('trial', 'Free trial', 4, { isInternal: true, isTrial: true, isSignupDefault: true, trialMonths: 3 }),
  plan('demo', 'Demo', 5, { isInternal: true, isDemo: true }), plan('tester', 'Tester', 6, { isInternal: true }),
]
const price = (planKey, countryCode, monthlyMinor, includedOnlineMinor, feeBps, o = {}) => ({ planKey, countryCode, monthlyMinor, includedOnlineMinor, feeBps,
  extraVanMonthlyMinor: monthlyMinor, offered: true, trialEnd: false, ...o })
const PRICES = []
for (const cc of ['GB', 'FR', 'XC']) PRICES.push(price('payg', cc, 0, 0, 99), price('pro', cc, 2900, 400000, 99), price('unlimited', cc, 6900, null, 0))
PRICES.push(price('payg', 'BR', 0, 0, 99, { offered: false }), price('pro', 'BR', 5900, 800000, 99, { offered: false }), price('unlimited', 'BR', 14900, null, 0, { trialEnd: true }))
PRICES.push(price('payg', 'MX', 0, 0, 99, { offered: false }), price('pro', 'MX', 34900, 5000000, 99, { offered: false }), price('unlimited', 'MX', 84900, null, 0, { trialEnd: true }))
PRICES.push(price('payg', 'JP', 0, 0, 99), price('pro', 'JP', 1980, 250000, 99), price('unlimited', 'JP', 2980, null, 0))
const CATALOG = { plans: PLANS, prices: PRICES, features: [] }

// ── a fake payment processor (the provider's test mode, as far as billing can see it) ──────────────────────────────────────────
function fakeProcessor({ livemode = false, failCreateOnce = new Set() } = {}) {
  const P = { livemode, customers: [], pms: {}, invoices: {}, created: 0, keys: new Map(), calls: [] }
  const TEST = { pm_card_visa: { type: 'card', label: 'visa •••• 4242', fails: false }, pm_card_chargeCustomerFail: { type: 'card', label: 'visa •••• 0341', fails: true },
    pm_pix_test: { type: 'pix', label: 'Pix Automático', fails: false } }
  const inv = i => ({ ...i, metadata: { ...i.metadata } })
  return {
    P, livemode,
    async ensureCustomer(a) { P.calls.push('ensureCustomer'); let c = P.customers.find(x => x.operatorId === a.operatorId); if (!c) { c = { id: `cus_${P.customers.length + 1}`, ...a }; P.customers.push(c) } return { id: c.id } },
    async createSetupIntent(a) { P.calls.push('createSetupIntent'); return { id: `seti_${a.truckId}_${a.type}`, clientSecret: 'secret_x', status: 'requires_payment_method' } },
    async retrievePaymentMethod(id) { const p = P.pms[id]; return { id, type: p ? p.type : 'other', label: p ? p.label : '?' } },
    async attachTestPaymentMethod(a) { const tpl = TEST[a.testToken]; if (!tpl) throw new Error('unknown test token'); const id = `${a.testToken}_${Object.keys(P.pms).length + 1}`; P.pms[id] = { ...tpl, customerId: a.customerId }; return { id, type: tpl.type, label: tpl.label } },
    async createInvoice(a) {
      P.calls.push('createInvoice')
      const key = a.idempotencyBase
      if (failCreateOnce.has(key)) { failCreateOnce.delete(key); throw new Error('network went away half-way') }
      if (P.keys.has(key)) return inv(P.invoices[P.keys.get(key)])          // idempotency: the first answer, replayed
      const id = `in_${++P.created}`
      const total = a.lines.reduce((s, l) => s + l.amountMinor, 0)
      P.invoices[id] = { id, status: 'open', amountDueMinor: total, amountPaidMinor: 0, attemptCount: 0, lastError: null, finalizedAt: globalThis.__now.toISOString(), paidAt: null,
        hostedUrl: `https://pay.example/${id}`, metadata: { truck_id: a.truckId, period: a.period, hatchgrab: 'billing-1' }, currency: a.currency, lines: a.lines, pm: a.paymentMethodId, pmType: a.paymentMethodType }
      P.keys.set(key, id)
      return inv(P.invoices[id])
    },
    async payInvoice(id, pmId) {
      const i = P.invoices[id]; if (pmId) i.pm = pmId
      i.attemptCount++
      if (P.pms[i.pm]?.fails) { i.lastError = 'Your card was declined.'; return inv(i) }
      i.status = 'paid'; i.amountPaidMinor = i.amountDueMinor; i.paidAt = globalThis.__now.toISOString(); i.lastError = null
      return inv(i)
    },
    async retrieveInvoice(id) { return inv(P.invoices[id]) },
    async voidInvoice(id) { P.calls.push('voidInvoice'); const i = P.invoices[id]; if (i.status !== 'paid') i.status = 'void'; return inv(i) },
  }
}

;(async () => {
  const B = await kit.bundle('billing-1', [
    "export * as R from '@/lib/billing/rules'", "export * as E from '@/lib/billing/engine'", "export * as G from '@/lib/billing/gate'",
    "export * as S from '@/lib/billing/memory-store'", "export * as K from '@/lib/billing/processor'",
  ].join('\n'), { stubs: { '@/lib/billing/store': 'export async function serverBillingStore() { if (!globalThis.__billingStore) throw new Error("no store in this harness"); return globalThis.__billingStore }' } })
  const { R, E, G, S, K } = B
  const NOW = iso => { globalThis.__now = new Date(iso); return globalThis.__now }

  // ── the world: six countries, a truck per scenario, all billing TEST trucks (is_customer false) ─────────────────────────────
  function world({ on = true } = {}) {
    const d = S.emptyMemoryData()
    d.switches = { enabled: on, pauseAfterDays: 5 }
    const fact = (countryCode, currency, locale, platformFeeEnabled, platformFeeAllowed) => ({ countryCode, currency, locale, platformFeeEnabled, platformFeeAllowed })
    d.countryFacts = [fact('GB', 'GBP', 'en-GB', true, true), fact('FR', 'EUR', 'fr-FR', true, true), fact('BR', 'BRL', 'pt-BR', false, false),
      fact('MX', 'MXN', 'es-MX', false, false), fact('JP', 'JPY', 'ja-JP', true, true), fact('XC', 'EUR', 'en-GB', false, true)]
    const cb = (countryCode, paymentModel, minChargeMinor, o = {}) => ({ countryCode, paymentModel, postPaySurchargeBps: 0, postPaySurchargeFixedMinor: 0, minChargeMinor, lateFeeMinor: 0, updatedAt: '2026-11-10T00:00:00.000Z', ...o })
    d.countryBilling = [cb('GB', 'fee_from_payment', 500), cb('FR', 'fee_from_payment', 600, { postPaySurchargeBps: 50, postPaySurchargeFixedMinor: 100 }),
      cb('BR', 'billed_online', 3500), cb('MX', 'billed_online', 13000), cb('JP', 'fee_from_payment', 1000), cb('XC', 'billed_at_truck', 600)]
    const TZ = { GB: 'Europe/London', FR: 'Europe/Paris', BR: 'America/Sao_Paulo', MX: 'America/Mexico_City', JP: 'Asia/Tokyo', XC: 'Europe/Paris' }
    const CUR = { GB: 'GBP', FR: 'EUR', BR: 'BRL', MX: 'MXN', JP: 'JPY', XC: 'EUR' }
    const truck = (id, country, plan, trialEnd, o = {}) => {
      d.trucks.push({ id, name: id, slug: id, country, currency: CUR[country], timezone: TZ[country], plan, trial_expires_at: trialEnd, is_customer: false, operator_id: `op-${id}`, ...o })
      d.operators.push({ id: `op-${id}`, email: `${id}@example.test`, name: id })
      d.truckBilling.push({ truckId: id, postPay: false, billingTest: true, paymentMethodState: 'none', paymentMethodType: null, stripePaymentMethodId: null, stripeSetupIntentId: null,
        paymentMethodLabel: null, paymentMethodUpdatedAt: null, paymentMethodLivemode: null, status: null, statusReason: null, statusChangedAt: null, pendingPlanKey: null, pendingPlanFrom: null, ...(o.tb || {}) })
    }
    truck('gb-a', 'GB', 'pro', null); truck('gb-fail', 'GB', 'pro', null); truck('br-card', 'BR', 'payg', null); truck('br-pix', 'BR', 'unlimited', null)
    truck('mx', 'MX', 'trial', '2026-10-16T05:59:59.000Z')   // 15 October 23:59:59 in Mexico City (UTC−6)
    truck('xc', 'XC', 'payg', null); truck('fr-pp', 'FR', 'pro', null, { tb: { postPay: true } }); truck('jp', 'JP', 'payg', null)
    truck('gb-trial', 'GB', 'trial', '2026-12-31T23:59:59.000Z'); truck('mx-payg', 'MX', 'payg', null); truck('gb-up', 'GB', 'payg', null)
    for (const tr of d.trucks) delete tr.tb
    return d
  }
  const order = (d, truck_id, key, placed_at, food, o = {}) => { d.orders.push({ order_key: key, truck_id, source: 'web', status: 'confirmed', food_minor: food, placed_at, ...o }) }
  const paid = (d, key, amount, fee = 0) => d.payments.push({ order_key: key, kind: 'charge', amount_minor: amount, application_fee_minor: fee || null })
  const pm = async (d, store, proc, truckId, token) => E.attachTestPaymentMethod(store, proc, CATALOG, { truckId, testToken: token, now: globalThis.__now, by: 'harness' })
  const ctxFor = async (store, id, now) => E.billingContextFor(store, await store.truck(id), CATALOG, now)
  const gate = async (store, id, now) => { globalThis.__billingStore = store; G.__resetBillingSwitchCache(); return G.billingGateForTruck({ id }, CATALOG, now) }
  const fee = async (store, orderKey, truckId, captureMinor, now) => { globalThis.__billingStore = store; G.__resetBillingSwitchCache(); return G.applicationFeeAtCapture({ orderKey, truckId, captureMinor, now, catalog: CATALOG }) }

  // ══ 1 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · the switch OFF: nothing read but the switch, nothing written, every answer today\'s')
  {
    const d = world({ on: false })
    d.invoices.push({ id: 'old', chargeId: 'c-old', truckId: 'gb-fail', period: '2026-09-01', currency: 'GBP', amountMinor: 2900, livemode: false, stripeInvoiceId: 'in_old', status: 'failed', dueAt: '2026-10-01T12:00:00Z',
      attemptCount: 3, lastError: 'declined', hostedInvoiceUrl: null, createdAt: '2026-10-01T12:00:00Z', finalizedAt: null, paidAt: null, lateFeeMinor: null, replacedStripeInvoiceId: null })
    const real = S.memoryBillingStore(d)
    const reads = []
    const onlySwitch = new Proxy(real, { get(o, k) { if (typeof o[k] !== 'function') return o[k]; return (...a) => { reads.push(String(k)); if (k !== 'switches') throw new Error(`read ${String(k)} while the switch is off`); return o[k](...a) } } })
    const now = NOW('2026-11-20T12:00:00Z')
    const g = await gate(onlySwitch, 'gb-fail', now)
    t('gate: online ordering NOT paused, Pay at Hatch allowed (an unpaid, method-less truck included)', g.onlineOrderingPaused === false && g.payAtHatchAllowed === true, g)
    t('gate: read nothing but the switch', reads.every(r => r === 'switches') && reads.length >= 1, reads)
    reads.length = 0
    t('capture: no application fee', (await fee(onlySwitch, 'x', 'gb-a', 10000, now)) === null)
    t('capture: read nothing but the switch', reads.every(r => r === 'switches'), reads)
    const proc = fakeProcessor()
    const m = await E.runMonthly(real, proc, CATALOG, { truckId: 'gb-a', period: '2026-11-01', now, by: 'harness' })
    t('the monthly charge: skipped (switch_off)', m.outcome === 'skipped' && m.reason === 'switch_off', m)
    t('mid-month charges, late fees: nothing', (await E.settleMidMonth(real, proc, CATALOG, { truckId: 'mx', now, by: 'h' })).length === 0 && (await E.applyLateFees(real, proc, CATALOG, { truckId: 'gb-fail', now, by: 'h' })).length === 0)
    t('a plan change: skipped (switch_off)', (await E.requestPlanChange(real, proc, CATALOG, { truckId: 'gb-up', planKey: 'pro', now, by: 'h' })).outcome === 'skipped')
    const all = await E.runBillingAll(real, proc, CATALOG, now)
    t('the hourly run: skipped (switch_off), no outcomes', all.skipped === 'switch_off' && all.outcomes.length === 0, all)
    t('NOTHING WRITTEN (store) and nothing sent (processor)', d.writes.length === 0 && proc.P.calls.length === 0, { writes: d.writes, calls: proc.P.calls })
    const ctx = await ctxFor(real, 'gb-fail', now)
    t('rules: not billable (switch_off) → status null, nothing paused, Pay at Hatch allowed',
      R.billableOf(ctx).reason === 'switch_off' && R.billingStatusOf(ctx) === null && !R.onlineOrderingPausedByBilling(ctx) && R.payAtHatchAllowedByBilling(ctx))
    const broken = { switches: async () => { throw new Error('db down') } }
    globalThis.__billingStore = { ...real, ...broken }; G.__resetBillingSwitchCache()
    t('a switch that cannot be read is OFF (the gate answers as before)', J(await G.billingGateForTruck({ id: 'gb-fail' }, CATALOG, now)) === J(G.BILLING_GATE_OFF))
    const d2 = world({ on: true }); const s2 = S.memoryBillingStore(d2)
    const failing = { ...s2, truck: async () => { throw new Error('db hiccup') } }
    const quiet = console.error; console.error = () => {}
    const gf = await gate(failing, 'gb-a', now)
    console.error = quiet
    t('switch on, billing reads fail → the gate answers as if off (a truck is never paused by our error)', J(gf) === J(G.BILLING_GATE_OFF))
  }

  // ══ 2 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · who is billed')
  {
    const d = world(); const store = S.memoryBillingStore(d); const now = NOW('2026-11-10T12:00:00Z')
    const c = await ctxFor(store, 'gb-a', now)
    t('a billing test truck (is_customer false, billing_test true) is billable', R.billableOf(c).billable === true)
    d.truckBilling.find(x => x.truckId === 'gb-a').billingTest = false
    t('…without billing_test it is not (not_a_customer) — test trucks and Real Thai Food are never billed by accident', R.billableOf(await ctxFor(store, 'gb-a', now)).reason === 'not_a_customer')
    d.trucks.find(x => x.id === 'gb-a').is_customer = true
    t('a customer truck is billable', R.billableOf(await ctxFor(store, 'gb-a', now)).billable === true)
    d.trucks.find(x => x.id === 'gb-a').plan = 'demo'
    t('the demo plan is never billed', R.billableOf(await ctxFor(store, 'gb-a', now)).reason === 'internal_plan')
    d.trucks.find(x => x.id === 'gb-a').plan = 'tester'
    t('the tester plan (internal, not a trial) is never billed', R.billableOf(await ctxFor(store, 'gb-a', now)).reason === 'internal_plan')
    d.trucks.find(x => x.id === 'gb-a').plan = 'trial'
    t('🔴 the TRIAL plan IS billable (it is flagged internal live; a truck keeps plan = trial after it ends)', R.billableOf(await ctxFor(store, 'gb-a', now)).billable === true)
    d.countryBilling = d.countryBilling.filter(x => x.countryCode !== 'GB')
    t('a country with no billing row is never billed (country_not_configured)', R.billableOf(await ctxFor(store, 'gb-a', now)).reason === 'country_not_configured')
    const w = world()
    const arr = cc => R.arrangementOf({ countryBilling: w.countryBilling.find(x => x.countryCode === cc), truckBilling: R.DEFAULT_TRUCK_BILLING, country: w.countryFacts.find(x => x.countryCode === cc) })
    t('GB (a): the fee is taken from the payment', arr('GB').feeFromPayment === true && arr('GB').postPay === false)
    t('BR (b): billed monthly, never from the payment', arr('BR').feeFromPayment === false && arr('BR').model === 'billed_online')
    t('XC (c): post-pay by definition', arr('XC').postPay === true && arr('XC').feeFromPayment === false)
    t('(a) with the country\'s platform fee switched OFF (today\'s GB) → billed monthly instead (platformFeeOn, 35.an-17)',
      R.arrangementOf({ countryBilling: w.countryBilling[0], truckBilling: R.DEFAULT_TRUCK_BILLING, country: { countryCode: 'GB', platformFeeEnabled: false, platformFeeAllowed: true } }).feeFromPayment === false)
    t('a post-pay truck in an (a) country: billed monthly', R.arrangementOf({ countryBilling: w.countryBilling[0], truckBilling: { ...R.DEFAULT_TRUCK_BILLING, postPay: true }, country: w.countryFacts[0] }).feeFromPayment === false)
  }

  // ══ 3 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · GB (a): the 1st = THIS month\'s plan IN ADVANCE + LAST month\'s usage IN ARREARS; walk-ups ignored; the fee at capture')
  {
    const d = world(); const store = S.memoryBillingStore(d)
    order(d, 'gb-a', 'o1', '2026-10-03T12:00:00Z', 300000); paid(d, 'o1', 300000)                     // online, inside the £4,000
    order(d, 'gb-a', 'o2', '2026-10-05T12:00:00Z', 150000, { status: 'collected' })                    // AT THE TRUCK, straddles it
    order(d, 'gb-a', 'o3', '2026-10-07T12:00:00Z', 200000, { status: 'ready' })                        // online, all above
    order(d, 'gb-a', 'o4', '2026-10-08T12:00:00Z', 1000000, { source: 'manual', status: 'collected' }) // a WALK-UP
    order(d, 'gb-a', 'o5', '2026-10-09T12:00:00Z', 50000, { status: 'cancelled' })
    order(d, 'gb-a', 'o6', '2026-10-09T13:00:00Z', 50000, { status: 'pending' })
    order(d, 'gb-a', 'o7', '2026-10-09T14:00:00Z', 50000, { status: 'rejected' })
    const f3 = await fee(store, 'o3', 'gb-a', 200000, NOW('2026-10-07T12:05:00Z'))
    t('capture of o3: application fee 1980 (0.99% of £2,000, all above the allowance after o1 + the at-the-truck o2)', f3 === 1980, f3)
    t('capture of o1: no fee (inside the allowance — absence, never zero)', (await fee(store, 'o1', 'gb-a', 300000, NOW('2026-10-03T12:05:00Z'))) === null)
    t('the fee is capped at what is being captured', (await fee(store, 'o3', 'gb-a', 1000, NOW('2026-10-07T12:05:00Z'))) === 1000)
    t('the walk-up is never an order the fee is computed for', (await fee(store, 'o4', 'gb-a', 1000000, NOW('2026-10-08T12:05:00Z'))) === null)
    paid(d, 'o3', 200000, 1980)
    const proc = fakeProcessor(); NOW('2026-10-20T12:00:00Z'); await pm(d, store, proc, 'gb-a', 'pm_card_visa')
    const out = await E.runMonthly(store, proc, CATALOG, { truckId: 'gb-a', period: '2026-11-01', now: NOW('2026-11-01T00:30:00Z'), by: 'h' })
    const u = await store.usage('gb-a', '2026-10-01')
    t('1 November: invoiced', out.outcome === 'invoiced', out)
    t('October usage: 3 pre-orders, £6,500 (online £5,000 + at the truck £1,500); walk-up, cancelled, pending, rejected ignored',
      u.preorderCount === 3 && u.countedMinor === 650000 && u.countedOnlineMinor === 500000 && u.countedAtTruckMinor === 150000, u)
    t('allowance used £4,000; fee due 495 + 1980; 🔴 1980 already taken by application fee is NOT billed again — 495 billed', u.allowanceUsedMinor === 400000 && u.feeDueMinor === 2475 && u.feeTakenMinor === 1980 && u.feeBilledMinor === 495, u)
    const c = out.charge
    t('🔴 the charge: NOVEMBER\'s Pro £29 in advance + OCTOBER\'s fee 495 in arrears = 3395 GBP', c.planMinor === 2900 && c.planDays === 30 && c.usagePeriod === '2026-10-01' && c.usageFeeMinor === 495 && c.chargedMinor === 3395 && out.invoice.currency === 'GBP', c)
    const lines = proc.P.invoices[out.invoice.stripeInvoiceId].lines
    t('the invoice lines say which month each part is for', J(lines.map(l => [l.key, l.amountMinor, l.description])) === J([['plan', 2900, 'Pro plan — 2026-11'], ['usage', 495, 'HatchGrab fee on pre-orders — 2026-10']]), lines)
    t('October\'s usage is now billed by this charge (and frozen)', u.state === 'billed' && u.chargeId === c.id)
    t('the ledger lines: o1 none, o2 invoice 495, o3 application_fee 1980, each with its plan', J(d.usageLines.filter(l => l.truckId === 'gb-a').map(l => [l.orderKey, l.feeVia, l.feeMinor, l.planKey])) === J([['o1', 'none', 0, 'pro'], ['o2', 'invoice', 495, 'pro'], ['o3', 'application_fee', 1980, 'pro']]))
    t('a month not started yet is refused (December on 10 November)', (await E.runMonthly(store, proc, CATALOG, { truckId: 'gb-a', period: '2026-12-01', now: NOW('2026-11-10T12:00:00Z'), by: 'h' })).reason === 'period_not_started')
    t('the 1st\'s charge runs as soon as the month starts in the truck\'s zone (00:30 UTC = 00:30 London in November)', out.charge.period === '2026-11-01')
  }

  // ══ 4 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · refunds: the counted value falls in proportion, and so does the fee taken')
  {
    const d = world(); const store = S.memoryBillingStore(d)
    order(d, 'gb-a', 'o1', '2026-10-03T12:00:00Z', 300000); paid(d, 'o1', 300000)
    order(d, 'gb-a', 'o2', '2026-10-05T12:00:00Z', 150000, { status: 'collected' })
    order(d, 'gb-a', 'o3', '2026-10-07T12:00:00Z', 200000); paid(d, 'o3', 200000, 1980)
    d.payments.push({ order_key: 'o3', kind: 'refund', amount_minor: 100000, application_fee_refunded_minor: 990 })
    const proc = fakeProcessor(); NOW('2026-10-20T12:00:00Z'); await pm(d, store, proc, 'gb-a', 'pm_card_visa')
    await E.runMonthly(store, proc, CATALOG, { truckId: 'gb-a', period: '2026-11-01', now: NOW('2026-11-01T12:00:00Z'), by: 'h' })
    const u = await store.usage('gb-a', '2026-10-01')
    t('o3 counts £1,000 after a half refund; counted £5,500', u.countedMinor === 550000, u)
    t('fee taken is net of the fee given back (990); billed still only 495', u.feeTakenMinor === 990 && u.feeBilledMinor === 495, u)
    const r = read('lib/payments/refund.ts')
    t('refund.ts sends refund_application_fee ONLY when the charge carried a fee (construct)', /\.\.\.\(chargeFeeMinor > 0 \? \{ refund_application_fee: true \} : \{\}\)/.test(strip(r)) && (strip(r).match(/refund_application_fee/g) || []).length === 1)
    t('…and decides from the ledger row of the capture, every time (not only while the switch is on)', /from\('order_payments'\)\.select\('application_fee_minor'\)/.test(strip(r)) && !/billingSwitchOn/.test(strip(r)))
  }

  // ══ 5 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · BR and MX on Pay as you go (b): the fee billed monthly in arrears, carry-over; Pix Automático')
  {
    const d = world(); const store = S.memoryBillingStore(d)
    order(d, 'br-card', 'b1', '2026-10-10T15:00:00Z', 10000); paid(d, 'b1', 10000)
    order(d, 'br-card', 'b2', '2026-10-11T15:00:00Z', 5000, { status: 'collected' })
    t('capture in Brazil: no application fee, ever ((b), and the provider forbids it there)', (await fee(store, 'b1', 'br-card', 10000, NOW('2026-10-10T15:05:00Z'))) === null)
    const proc = fakeProcessor(); NOW('2026-10-20T12:00:00Z'); await pm(d, store, proc, 'br-card', 'pm_card_visa')
    const nov = await E.runMonthly(store, proc, CATALOG, { truckId: 'br-card', period: '2026-11-01', now: NOW('2026-11-01T12:00:00Z'), by: 'h' })
    t('1 November: Pay as you go R$0 in advance + October\'s 99 + 50 = 149 centavos → under R$35: CARRIED, no invoice', nov.outcome === 'carried' && nov.charge.usageFeeMinor === 149 && nov.charge.carriedOutMinor === 149 && proc.P.created === 0, nov)
    order(d, 'br-card', 'b3', '2026-11-12T15:00:00Z', 400000); paid(d, 'b3', 400000)
    const dec = await E.runMonthly(store, proc, CATALOG, { truckId: 'br-card', period: '2026-12-01', now: NOW('2026-12-01T12:00:00Z'), by: 'h' })
    t('1 December: November\'s 3960 + 149 carried in = 4109 BRL invoiced; the carried charge now points at it', dec.outcome === 'invoiced' && dec.charge.chargedMinor === 4109 && dec.invoice.currency === 'BRL'
      && d.charges.find(c => c.id === nov.charge.id).carriedInto === dec.charge.id, dec.charge)
    t('the carried amount is its own invoice line', J(proc.P.invoices[dec.invoice.stripeInvoiceId].lines.map(l => [l.key, l.amountMinor])) === J([['usage', 3960], ['carried', 149]]))
    order(d, 'mx-payg', 'x1', '2026-10-12T18:00:00Z', 2000000, { status: 'collected' })   // MX$20,000 at the truck
    NOW('2026-10-20T12:00:00Z'); await pm(d, store, proc, 'mx-payg', 'pm_card_visa')
    const mx = await E.runMonthly(store, proc, CATALOG, { truckId: 'mx-payg', period: '2026-11-01', now: NOW('2026-11-01T12:00:00Z'), by: 'h' })
    t('MX on Pay as you go: October\'s 0.99% of MX$20,000 = 19800 MXN invoiced on 1 November', mx.outcome === 'invoiced' && mx.charge.usageFeeMinor === 19800 && mx.charge.planMinor === 0 && mx.invoice.currency === 'MXN', mx.charge)
    const s = await E.startPaymentMethodSetup(store, proc, CATALOG, { truckId: 'br-pix', type: 'pix', now: NOW('2026-10-20T12:00:00Z'), by: 'h' })
    t('Pix set-up starts a SetupIntent for the truck (state pending)', s.setupIntentId === 'seti_br-pix_pix' && (await store.truckBilling('br-pix')).paymentMethodState === 'pending')
    let refused = null; try { await E.startPaymentMethodSetup(store, proc, CATALOG, { truckId: 'gb-a', type: 'pix', now: NOW('2026-10-20T12:00:00Z'), by: 'h' }) } catch (e) { refused = e.message }
    t('Pix is refused for a non-BRL truck', /BRL/.test(String(refused)), refused)
    await pm(d, store, proc, 'br-pix', 'pm_pix_test')
    const px = await E.runMonthly(store, proc, CATALOG, { truckId: 'br-pix', period: '2026-11-01', now: NOW('2026-11-01T12:00:00Z'), by: 'h' })
    t('Unlimited R$149 for November in advance, invoiced in BRL on the Pix method', px.outcome === 'invoiced' && px.charge.chargedMinor === 14900 && proc.P.invoices[px.invoice.stripeInvoiceId].pmType === 'pix', px.charge)
    const mig = read('supabase/migrations/20261086_billing_1_correction.sql')
    t('BR, MX, MY, SG, TH: Pay as you go and Pro can be OFFERED only with billing on and the fee billed monthly (the world guard)',
      /where pp\.offered and pp\.fee_bps > 0 and not cs\.platform_fee_allowed\s+and not \(\s+coalesce\(\(select ps\.billing_enabled from public\.platform_switches ps where ps\.id\), false\)\s+and exists \(select 1 from public\.country_billing cb where cb\.country_code = pp\.country_code and cb\.payment_model <> 'fee_from_payment'\)\)/.test(mig)
      && !/update public\.plan_prices/i.test(mig.replace(/--[^\n]*/g, '')))
  }

  // ══ 6 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('6 · MX: the trial ends mid-month → the rest of October\'s plan charged THAT DAY; usage from then on the next 1st')
  {
    const d = world(); const store = S.memoryBillingStore(d)
    order(d, 'mx', 'm1', '2026-10-10T18:00:00Z', 900000); paid(d, 'm1', 900000)   // during the trial: never counted
    order(d, 'mx', 'm2', '2026-10-20T18:00:00Z', 900000); paid(d, 'm2', 900000)
    const proc = fakeProcessor(); NOW('2026-10-01T12:00:00Z'); await pm(d, store, proc, 'mx', 'pm_card_visa')
    const oct = await E.runMonthly(store, proc, CATALOG, { truckId: 'mx', period: '2026-10-01', now: globalThis.__now, by: 'h' })
    t('1 October (in the trial): nothing in advance', oct.outcome === 'nothing' && oct.charge.planMinor === 0, oct)
    t('15 October: no trial-end charge before the trial has ended', (await E.settleMidMonth(store, proc, CATALOG, { truckId: 'mx', now: NOW('2026-10-15T12:00:00Z'), by: 'h' })).length === 0)
    const end = await E.settleMidMonth(store, proc, CATALOG, { truckId: 'mx', now: NOW('2026-10-16T06:30:00Z'), by: 'h' })
    const te = end[0]
    t('the hour after the trial ends (15 Oct 23:59:59 Mexico City): Unlimited for 16 of 31 days = floor(84900 × 16 / 31) = 43819 MXN, invoiced',
      end.length === 1 && te.kind === 'trial_end' && te.outcome === 'invoiced' && te.charge.planMinor === 43819 && te.charge.planDays === 16 && te.invoice.currency === 'MXN', end)
    t('the plan line says it is from the end of the trial', /16 of 31 days\), from the end of your free trial/.test(proc.P.invoices[te.invoice.stripeInvoiceId].lines[0].description))
    t('settling again (the next hour) charges nothing more', (await E.settleMidMonth(store, proc, CATALOG, { truckId: 'mx', now: NOW('2026-10-16T07:30:00Z'), by: 'h' }))[0].outcome === 'already' && proc.P.created === 1)
    const nov = await E.runMonthly(store, proc, CATALOG, { truckId: 'mx', period: '2026-11-01', now: NOW('2026-11-01T12:00:00Z'), by: 'h' })
    t('1 November: November\'s Unlimited 84900 in advance; October\'s usage counts only m2 (Unlimited: no fee)', nov.outcome === 'invoiced' && nov.charge.planMinor === 84900 && nov.charge.usageFeeMinor === 0 && (await store.usage('mx', '2026-10-01')).preorderCount === 1, nov.charge)
  }

  // ══ 7 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('7 · a (c) country: pay at the truck, the fee billed monthly; Pay at Hatch needs a method on file')
  {
    const d = world(); const store = S.memoryBillingStore(d); const now = NOW('2026-11-03T12:00:00Z')
    let c = await ctxFor(store, 'xc', now)
    t('no payment method after the trial → paused (no_payment_method), Pay at Hatch off', R.billingStatusOf(c).status === 'paused' && !R.payAtHatchAllowedByBilling(c))
    const proc = fakeProcessor(); await pm(d, store, proc, 'xc', 'pm_card_visa')
    c = await ctxFor(store, 'xc', now)
    t('with a valid method → active, Pay at Hatch ON (post-pay by definition)', R.billingStatusOf(c).status === 'active' && R.payAtHatchAllowedByBilling(c))
    order(d, 'xc', 'x1', '2026-10-05T10:00:00Z', 60000, { status: 'collected' }); order(d, 'xc', 'x2', '2026-10-06T10:00:00Z', 40000, { status: 'collected' })
    const out = await E.runMonthly(store, proc, CATALOG, { truckId: 'xc', period: '2026-11-01', now, by: 'h' })
    t('€1,000 at the truck in October → fee 594 + 396 = 990 billed in EUR on 1 November', out.outcome === 'invoiced' && out.charge.usageFeeMinor === 990 && out.invoice.currency === 'EUR', out.charge)
  }

  // ══ 8 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('8 · FR post-pay: no fee from the payment, the fee billed, the surcharge (0.5% + €1)')
  {
    const d = world(); const store = S.memoryBillingStore(d)
    order(d, 'fr-pp', 'f1', '2026-10-04T10:00:00Z', 300000, { status: 'collected' }); order(d, 'fr-pp', 'f2', '2026-10-05T10:00:00Z', 200000); paid(d, 'f2', 200000)
    t('capture for a post-pay truck: no application fee (FR\'s platform fee is on)', (await fee(store, 'f2', 'fr-pp', 200000, NOW('2026-10-05T10:05:00Z'))) === null)
    const proc = fakeProcessor(); NOW('2026-10-20T12:00:00Z'); await pm(d, store, proc, 'fr-pp', 'pm_card_visa')
    const c = await ctxFor(store, 'fr-pp', globalThis.__now)
    t('post-pay with a method → Pay at Hatch allowed after the trial', R.payAtHatchAllowedByBilling(c))
    const out = await E.runMonthly(store, proc, CATALOG, { truckId: 'fr-pp', period: '2026-11-01', now: NOW('2026-11-01T12:00:00Z'), by: 'h' })
    t('1 November: November\'s Pro 2900 + October\'s fee 990 + October\'s surcharge 2500 + 100 = 6490 EUR',
      out.charge.planMinor === 2900 && out.charge.usageFeeMinor === 990 && out.charge.surchargeMinor === 2600 && out.charge.chargedMinor === 6490 && out.invoice.currency === 'EUR', out.charge)
    const d0 = world(); d0.countryBilling.find(x => x.countryCode === 'FR').postPaySurchargeBps = 0; d0.countryBilling.find(x => x.countryCode === 'FR').postPaySurchargeFixedMinor = 0
    const s0 = S.memoryBillingStore(d0); order(d0, 'fr-pp', 'f1', '2026-10-04T10:00:00Z', 300000, { status: 'collected' })
    const p0 = fakeProcessor(); await pm(d0, s0, p0, 'fr-pp', 'pm_card_visa')
    t('a surcharge of 0 is not applied (no line)', (await E.runMonthly(s0, p0, CATALOG, { truckId: 'fr-pp', period: '2026-11-01', now: globalThis.__now, by: 'h' })).charge.surchargeMinor === 0)
    t('NOT post-pay, with a method, after the trial → Pay at Hatch OFF (decision 9)', !R.payAtHatchAllowedByBilling({ ...c, truckBilling: { postPay: false, billingTest: true, paymentMethodState: 'valid', paymentMethodType: 'card' } }))
  }

  // ══ 9 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('9 · JPY: whole yen, rounded DOWN; under ¥1,000 carried')
  {
    const d = world(); const store = S.memoryBillingStore(d)
    order(d, 'jp', 'j1', '2026-10-10T03:00:00Z', 1515, { status: 'collected' })   // 1515 × 0.99% = 14.9985 → 14 (half-up would say 15)
    const proc = fakeProcessor(); NOW('2026-10-20T12:00:00Z'); await pm(d, store, proc, 'jp', 'pm_card_visa')
    const nov = await E.runMonthly(store, proc, CATALOG, { truckId: 'jp', period: '2026-11-01', now: NOW('2026-11-01T12:00:00Z'), by: 'h' })
    t('1 November: ¥14 (rounded down), carried (under ¥1,000)', nov.charge.usageFeeMinor === 14 && nov.outcome === 'carried', nov.charge)
    order(d, 'jp', 'j2', '2026-11-10T03:00:00Z', 120000, { status: 'collected' })
    const dec = await E.runMonthly(store, proc, CATALOG, { truckId: 'jp', period: '2026-12-01', now: NOW('2026-12-01T12:00:00Z'), by: 'h' })
    t('1 December: ¥1,188 + ¥14 = ¥1,202 invoiced in JPY', dec.outcome === 'invoiced' && dec.charge.chargedMinor === 1202 && dec.invoice.currency === 'JPY', dec.charge)
    t('the Tokyo month is Tokyo\'s: 31 Oct 23:30 JST is October, 31 Oct 15:30 UTC', R.periodOf('2026-10-31T14:30:00Z', 'Asia/Tokyo') === '2026-10-01' && R.periodOf('2026-10-31T15:30:00Z', 'Asia/Tokyo') === '2026-11-01')
  }

  // ══ 10 ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('10 · the trial: trialling, ended without a method → paused, the walk-up untouched')
  {
    const d = world(); const store = S.memoryBillingStore(d)
    const c = await ctxFor(store, 'gb-trial', NOW('2026-11-10T12:00:00Z'))
    t('during the trial: trialling, Pay at Hatch allowed, nothing paused — no method needed yet (decision 4)', R.billingStatusOf(c).status === 'trialling' && R.payAtHatchAllowedByBilling(c) && !R.onlineOrderingPausedByBilling(c))
    const g1 = await gate(store, 'gb-trial', NOW('2027-01-01T09:00:00Z'))
    t('1 January 2027, trial over, no method → ONLINE ordering paused, Pay at Hatch off', g1.onlineOrderingPaused === true && g1.payAtHatchAllowed === false, g1)
    const proc = fakeProcessor(); NOW('2027-01-01T10:00:00Z'); await pm(d, store, proc, 'gb-trial', 'pm_card_visa')
    const g2 = await gate(store, 'gb-trial', NOW('2027-01-01T10:01:00Z'))
    t('a card added → resumed at once (not post-pay: online only)', g2.onlineOrderingPaused === false && g2.payAtHatchAllowed === false, g2)
    const dec = await E.runMonthly(store, proc, CATALOG, { truckId: 'gb-trial', period: '2026-12-01', now: NOW('2026-12-01T12:00:00Z'), by: 'h' })
    t('December\'s charge (in the trial): nothing', dec.outcome === 'nothing' && dec.charge.planMinor === 0, dec)
    t('a trial ending in the month\'s last second leaves nothing for the rest of the month (0 days)', (await E.settleMidMonth(store, proc, CATALOG, { truckId: 'gb-trial', now: NOW('2027-01-01T00:30:00Z'), by: 'h' })).length === 0)
    // ⚠️ RE-PINNED (billing-3, 11 November 2026, item 5): during the trial a plan choice is STORED as the plan the trial ends into
    // (truck_billing.trial_end_plan_key) — nothing charged now. Reset afterwards so the rest of this world is unchanged.
    {
      const chargesBefore = (await store.listCharges('gb-trial')).length
      const ch = await E.requestPlanChange(store, proc, CATALOG, { truckId: 'gb-trial', planKey: 'pro', now: NOW('2026-11-10T12:00:00Z'), by: 'h' })
      t('requestPlanChange during the trial → trial_choice: stored as the plan the trial ends into, nothing charged', ch.outcome === 'trial_choice' && ch.planKey === 'pro'
        && (await store.truckBilling('gb-trial')).trialEndPlanKey === 'pro' && (await store.listCharges('gb-trial')).length === chargesBefore, ch)
      await store.upsertTruckBilling('gb-trial', { trialEndPlanKey: null }, 'h')
    }
    const action = read('app/api/dashboard/action/route.ts')
    t('walk-ups and the kitchen screen never ask billing (no billing import on the dashboard/KDS paths)', !/lib\/billing/.test(action) && !/lib\/billing/.test(read('app/(app)/dashboard/[token]/kds/page.tsx')))
  }

  // ══ 11 ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('11 · upgrade and downgrade mid-month (plan history)')
  {
    const d = world(); const store = S.memoryBillingStore(d)
    const proc = fakeProcessor(); NOW('2026-10-20T12:00:00Z'); await pm(d, store, proc, 'gb-up', 'pm_card_visa')
    const nov = await E.runMonthly(store, proc, CATALOG, { truckId: 'gb-up', period: '2026-11-01', now: NOW('2026-11-01T12:00:00Z'), by: 'h' })
    t('1 November on Pay as you go: nothing in advance', nov.outcome === 'nothing')
    order(d, 'gb-up', 'u1', '2026-11-05T12:00:00Z', 100000, { status: 'collected' })   // Pay as you go: 0.99% of all
    const up = await E.requestPlanChange(store, proc, CATALOG, { truckId: 'gb-up', planKey: 'pro', now: NOW('2026-11-11T12:00:00Z'), by: 'h' })
    t('11 November → Pro: applied at once; the difference for 20 of 30 days = floor(2900 × 20 / 30) = 1933 GBP invoiced now',
      up.outcome === 'changed' && up.charges.length === 1 && up.charges[0].kind === 'upgrade' && up.charges[0].outcome === 'invoiced' && up.charges[0].charge.planMinor === 1933 && d.trucks.find(x => x.id === 'gb-up').plan === 'pro', up)
    t('the history records the change (and the state before it)', J(d.history.filter(h => h.truckId === 'gb-up').map(h => [h.planKey, h.changedAt])) === J([['payg', '-infinity'], ['pro', '2026-11-11T12:00:00.000Z']]))
    order(d, 'gb-up', 'u2', '2026-11-15T12:00:00Z', 100000, { status: 'collected' })   // Pro: inside the allowance
    const up2 = await E.requestPlanChange(store, proc, CATALOG, { truckId: 'gb-up', planKey: 'unlimited', now: NOW('2026-11-21T12:00:00Z'), by: 'h' })
    t('21 November → Unlimited: (6900 − 2900) × 10 / 30 = 1333 more', up2.outcome === 'changed' && up2.charges.filter(c => c.outcome === 'invoiced').map(c => c.charge.planMinor).join() === '1333', up2.charges.map(c => [c.kind, c.outcome, c.charge && c.charge.planMinor]))
    order(d, 'gb-up', 'u3', '2026-11-23T12:00:00Z', 500000, { status: 'collected' })   // Unlimited: no fee
    const down = await E.requestPlanChange(store, proc, CATALOG, { truckId: 'gb-up', planKey: 'payg', now: NOW('2026-11-25T12:00:00Z'), by: 'h' })
    t('25 November → Pay as you go: a DOWNGRADE waits for 1 December; still Unlimited now; nothing refunded', down.outcome === 'scheduled' && down.from === '2026-12-01' && d.trucks.find(x => x.id === 'gb-up').plan === 'unlimited' && proc.P.created === 2, down)
    const dec = await E.runMonthly(store, proc, CATALOG, { truckId: 'gb-up', period: '2026-12-01', now: NOW('2026-12-01T12:00:00Z'), by: 'h' })
    t('1 December: the downgrade applied — Pay as you go £0 in advance, and the waiting plan cleared', d.trucks.find(x => x.id === 'gb-up').plan === 'payg' && dec.charge.planKey === 'payg' && dec.charge.planMinor === 0 && (await store.truckBilling('gb-up')).pendingPlanKey === null, dec.charge)
    t('November\'s usage at each order\'s own plan: Pay as you go 990 · Pro (inside £4,000) 0 · Unlimited 0 → 990 billed on 1 December',
      dec.outcome === 'invoiced' && dec.charge.usageFeeMinor === 990 && J(d.usageLines.filter(l => l.truckId === 'gb-up').map(l => [l.planKey, l.feeMinor])) === J([['payg', 990], ['pro', 0], ['unlimited', 0]]), d.usageLines.filter(l => l.truckId === 'gb-up'))
    const up3 = await E.requestPlanChange(store, proc, CATALOG, { truckId: 'gb-up', planKey: 'pro', now: NOW('2026-12-10T12:00:00Z'), by: 'h' })
    t('🔴 10 December → Pro again: charged from what December was PAID (£0), not from the old plan — 2900 × 22 / 31 = 2058',
      up3.outcome === 'changed' && up3.charges.filter(c => c.outcome === 'invoiced' && c.period === '2026-12-01').map(c => c.charge.planMinor).join() === '2058', up3.charges.map(c => [c.period, c.kind, c.outcome, c.charge && c.charge.planMinor]))
    t('a downgrade that cannot be charged yet (no method) keeps waiting', await (async () => {
      const d2 = world(); const s2 = S.memoryBillingStore(d2); const p2 = fakeProcessor()
      d2.trucks.find(x => x.id === 'gb-up').plan = 'pro'
      await s2.upsertTruckBilling('gb-up', { pendingPlanKey: 'payg', pendingPlanFrom: '2026-12-01' }, 'h')
      order(d2, 'gb-up', 'v1', '2026-11-05T12:00:00Z', 1000000, { status: 'collected' })   // owes 0.99% above £4,000
      const r = await E.runMonthly(s2, p2, CATALOG, { truckId: 'gb-up', period: '2026-12-01', now: NOW('2026-12-01T12:00:00Z'), by: 'h' })
      return r.outcome === 'no_payment_method' && d2.trucks.find(x => x.id === 'gb-up').plan === 'pro' && (await s2.truckBilling('gb-up')).pendingPlanKey === 'payg'
    })())
  }

  // ══ 12 ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('12 · a failed payment → past due → paused at 00:00 after 5 full days (+ the late fee) → paid → resumed')
  {
    const d = world(); const store = S.memoryBillingStore(d)
    d.countryBilling.find(x => x.countryCode === 'GB').lateFeeMinor = 300   // 🔴 A TEST VALUE ONLY — every country's real fee is 0
    const proc = fakeProcessor(); NOW('2026-10-20T12:00:00Z'); await pm(d, store, proc, 'gb-fail', 'pm_card_chargeCustomerFail')
    const out = await E.runMonthly(store, proc, CATALOG, { truckId: 'gb-fail', period: '2026-11-01', now: NOW('2026-11-01T12:00:00Z'), by: 'h' })
    t('November\'s Pro fee is invoiced in advance (open)', out.outcome === 'invoiced' && out.invoice.status === 'open', out)
    const attempt = await proc.payInvoice(out.invoice.stripeInvoiceId)
    await E.applyInvoiceUpdate(store, CATALOG, attempt, NOW('2026-11-01T13:00:00Z'))
    t('the provider\'s attempt declines → our row: failed, 1 attempt', (await store.invoiceForCharge(out.charge.id)).status === 'failed')
    // ⚠️ RE-PINNED (billing-2, 11 November 2026): the 5-FULL-DAY rule — failed 1 Nov (London) → last day to pay 6 Nov → paused
    // from 00:00 on 7 Nov; the late fee at that same instant.
    t('6 Nov 23:59 London (the last full day): past due, still taking online orders; no late fee yet', R.billingStatusOf(await ctxFor(store, 'gb-fail', NOW('2026-11-06T23:59:00Z'))).status === 'past_due'
      && (await gate(store, 'gb-fail', NOW('2026-11-06T23:59:00Z'))).onlineOrderingPaused === false && (await E.applyLateFees(store, proc, CATALOG, { truckId: 'gb-fail', now: globalThis.__now, by: 'h' })).length === 0)
    const g5 = await gate(store, 'gb-fail', NOW('2026-11-07T00:00:00Z'))
    t('00:00 on 7 Nov: ONLINE ordering paused (the existing "not taking orders" state)', g5.onlineOrderingPaused === true)
    const late = await E.applyLateFees(store, proc, CATALOG, { truckId: 'gb-fail', now: NOW('2026-11-07T00:00:00Z'), by: 'h' })
    const row = await store.invoiceForCharge(out.charge.id)
    const reissued = proc.P.invoices[row.stripeInvoiceId]
    t('with a (test) late fee of £3: ADDED TO THAT INVOICE — voided and re-issued at 3200 with a "Late payment fee" line, same due date',
      late.length === 1 && late[0].outcome === 'added' && row.lateFeeMinor === 300 && row.amountMinor === 3200 && row.replacedStripeInvoiceId === out.invoice.stripeInvoiceId
      && proc.P.invoices[out.invoice.stripeInvoiceId].status === 'void' && reissued.amountDueMinor === 3200 && reissued.lines.at(-1).key === 'late_fee' && row.dueAt === out.invoice.dueAt, { row, late })
    t('…still paused (the re-issued invoice is unpaid)', (await gate(store, 'gb-fail', NOW('2026-11-07T01:00:00Z'))).onlineOrderingPaused === true)
    t('ONCE per invoice: the next run adds nothing', (await E.applyLateFees(store, proc, CATALOG, { truckId: 'gb-fail', now: NOW('2026-11-07T08:00:00Z'), by: 'h' })).length === 0 && proc.P.created === 2)
    t('the voided original\'s webhook is ignored (unknown — the row now carries the new invoice)', (await E.applyInvoiceUpdate(store, CATALOG, proc.P.invoices[out.invoice.stripeInvoiceId], globalThis.__now)) === 'unknown')
    NOW('2026-11-07T09:00:00Z'); await pm(d, store, proc, 'gb-fail', 'pm_card_visa')
    const paidInv = await proc.payInvoice(row.stripeInvoiceId, (await store.truckBilling('gb-fail')).stripePaymentMethodId)
    await E.applyInvoiceUpdate(store, CATALOG, paidInv, NOW('2026-11-07T09:01:00Z'))
    t('a new card, paid → our row paid; online ordering RESUMED automatically; status active', (await store.invoiceForCharge(out.charge.id)).status === 'paid'
      && (await gate(store, 'gb-fail', NOW('2026-11-07T09:02:00Z'))).onlineOrderingPaused === false && (await store.truckBilling('gb-fail')).status === 'active')
    // …and the real setting: 0 — the decision is recorded, nothing is added, nothing is re-issued.
    const d0 = world(); const s0 = S.memoryBillingStore(d0); const p0 = fakeProcessor()
    t('every country\'s late fee in this harness\'s world is 0 unless a test sets it', d0.countryBilling.every(c => c.lateFeeMinor === 0))
    NOW('2026-10-20T12:00:00Z'); await pm(d0, s0, p0, 'gb-fail', 'pm_card_chargeCustomerFail')
    const o0 = await E.runMonthly(s0, p0, CATALOG, { truckId: 'gb-fail', period: '2026-11-01', now: NOW('2026-11-01T12:00:00Z'), by: 'h' })
    await E.applyInvoiceUpdate(s0, CATALOG, await p0.payInvoice(o0.invoice.stripeInvoiceId), NOW('2026-11-01T13:00:00Z'))
    const l0 = await E.applyLateFees(s0, p0, CATALOG, { truckId: 'gb-fail', now: NOW('2026-11-07T00:30:00Z'), by: 'h' })
    const r0 = await s0.invoiceForCharge(o0.charge.id)
    t('late fee 0 (the real setting): paused, recorded as 0, NOTHING added or re-issued', l0.length === 1 && l0[0].outcome === 'none' && r0.lateFeeMinor === 0 && r0.amountMinor === 2900 && p0.P.created === 1 && !p0.P.calls.includes('voidInvoice'))
    const whDir = fs.readdirSync(path.join(REPO, 'app/api/webhooks')).find(n => n.endsWith('-billing'))   // the billing webhook's folder
    const wh = read(`app/api/webhooks/${whDir}/route.ts`)
    t('the billing webhook: verified first, recorded before handling, live events ignored, only billing-1 invoices', /verifyStripeSignature/.test(wh) && wh.indexOf("from('stripe_webhook_events').insert") < wh.indexOf('await handle(event)') && /if \(event\.livemode\) return 'ignored_live/.test(wh) && /hatchgrab !== 'billing-1'/.test(wh))
  }

  // ══ 12b ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('12b · never billed twice')
  {
    const d = world(); const store = S.memoryBillingStore(d)
    const proc = fakeProcessor({ failCreateOnce: new Set(['billing:gb-a:2026-11-01:monthly']) }); NOW('2026-10-20T12:00:00Z'); await pm(d, store, proc, 'gb-a', 'pm_card_visa')
    order(d, 'gb-a', 'o1', '2026-10-03T12:00:00Z', 500000, { status: 'collected' })
    const run = () => E.runMonthly(store, proc, CATALOG, { truckId: 'gb-a', period: '2026-11-01', now: NOW('2026-11-01T12:00:00Z'), by: 'h' })
    const first = await run()
    t('a crash half-way: failed; the charge stays "invoicing", its invoice claim "creating"', first.outcome === 'failed' && first.charge.state === 'invoicing' && (await store.invoiceForCharge(first.charge.id)).status === 'creating', first)
    const second = await run()
    t('the next run completes it — under the same key', second.outcome === 'invoiced' && proc.P.created === 1, second)
    const third = await run()
    t('a third run: already — nothing new at the provider', third.outcome === 'already' && proc.P.created === 1 && d.charges.filter(c => c.truckId === 'gb-a').length === 1, third)
    const all = await E.runBillingAll(store, proc, CATALOG, NOW('2026-11-02T12:00:00Z'))
    t('the hourly run the next day does not bill gb-a again', d.invoices.filter(i => i.truckId === 'gb-a').length === 1 && all.outcomes.filter(o => o.truckId === 'gb-a' && o.outcome === 'invoiced').length === 0, all.outcomes.filter(o => o.truckId === 'gb-a').map(o => [o.kind, o.outcome]))
    t('one invoice per charge: a second claim is refused', (await store.claimInvoice({ chargeId: second.charge.id, truckId: 'gb-a', period: '2026-11-01', currency: 'GBP', amountMinor: 1, livemode: false })).claimed === false)
    t('a billed usage month is never recomputed', (await store.replaceUsage({ ...(await store.usage('gb-a', '2026-10-01')), state: 'open' }, [])) === false)
    const d2 = world(); const s2 = S.memoryBillingStore(d2); const p2 = fakeProcessor(); NOW('2026-10-20T12:00:00Z'); await pm(d2, s2, p2, 'gb-a', 'pm_card_visa')
    const lv = await E.runMonthly(s2, { ...p2, livemode: true }, CATALOG, { truckId: 'gb-a', period: '2026-11-01', now: NOW('2026-11-01T12:00:00Z'), by: 'h' })
    t('a LIVE processor is refused: nothing claimed, nothing created', lv.outcome === 'failed' && lv.reason === 'live_processor_refused' && p2.P.created === 0 && d2.charges.length === 0, lv)
    const d3 = world(); const s3 = S.memoryBillingStore(d3)
    const noPm = await E.runMonthly(s3, fakeProcessor(), CATALOG, { truckId: 'gb-a', period: '2026-11-01', now: NOW('2026-11-01T12:00:00Z'), by: 'h' })
    t('owed but no method on file → no_payment_method: nothing claimed, the usage left open for the next run', noPm.outcome === 'no_payment_method' && d3.charges.length === 0)
    let refusedTest = null
    try { d2.truckBilling.find(x => x.truckId === 'gb-a').billingTest = false; await E.attachTestPaymentMethod(s2, p2, CATALOG, { truckId: 'gb-a', testToken: 'pm_card_visa', now: globalThis.__now, by: 'h' }) } catch (e) { refusedTest = e.message }
    t('a test payment method only on a billing TEST truck', /billing TEST truck/.test(String(refusedTest)), refusedTest)
  }

  // ══ 13 ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('13 · the processor key: the billing TEST key only, never the live one')
  {
    const saveB = process.env.STRIPE_BILLING_TEST_SECRET_KEY, saveL = process.env.STRIPE_SECRET_KEY
    delete process.env.STRIPE_BILLING_TEST_SECRET_KEY; process.env.STRIPE_SECRET_KEY = 'sk_live_harness_not_a_key'
    let e1 = null; try { K.stripeBillingProcessor() } catch (e) { e1 = e.message }
    t('no billing key → refused before any network call (and the live STRIPE_SECRET_KEY is never used)', /not set/.test(String(e1)) && K.billingKeyState() === 'missing', e1)
    process.env.STRIPE_BILLING_TEST_SECRET_KEY = 'sk_live_harness_not_a_key'
    let e2 = null; try { K.stripeBillingProcessor() } catch (e) { e2 = e.message }
    t('a live key in the billing variable → refused', /not a test key/.test(String(e2)) && K.billingKeyState() === 'refused', e2)
    process.env.STRIPE_BILLING_TEST_SECRET_KEY = 'sk_test_harness_not_a_key'
    t('a test key → accepted (no call is made here)', K.billingSecretKey() === 'sk_test_harness_not_a_key' && K.billingKeyState() === 'test' && K.stripeBillingProcessor().livemode === false)
    if (saveB === undefined) delete process.env.STRIPE_BILLING_TEST_SECRET_KEY; else process.env.STRIPE_BILLING_TEST_SECRET_KEY = saveB
    if (saveL === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = saveL
    const proc = read('lib/billing/processor.ts')
    t('processor.ts never reads STRIPE_SECRET_KEY', !/process\.env\.STRIPE_SECRET_KEY\b/.test(strip(proc)))
    const L = l => R.stripeLocaleFor(l)
    t('the truck\'s language for the provider\'s emails: pt-BR, es-419 (MX), ja, fr, en-GB, de (CH), nb, zh-HK; Arabic → en-GB',
      J(['pt-BR', 'es-MX', 'ja-JP', 'fr-FR', 'en-GB', 'de-CH', 'nb-NO', 'zh-HK', 'ar-AE', 'en-US'].map(L)) === J(['pt-BR', 'es-419', 'ja', 'fr', 'en-GB', 'de', 'nb', 'zh-HK', 'en-GB', 'en']))
  }

  // ══ 14 ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('14 · the live paths read the gate (constructs)')
  {
    const menu = strip(read('app/api/menu/[truckId]/route.ts')), sub = strip(read('app/api/orders/submit/route.ts')), cap = strip(read('lib/payments/capture.ts'))
    t('menu: Pay at Hatch = the plan\'s rule AND billing\'s; billing\'s pause → ordering unavailable', /const payAtHatchOffered = payAtHatchOn\(truck, planCatalog\) && billingGate\.payAtHatchAllowed/.test(menu) && /if \(billingGate\.onlineOrderingPaused\) orderingAvailable = false/.test(menu))
    t('submit: a paused truck refuses with the existing sentence; Pay at Hatch needs billing\'s yes too',
      /if \(billingGate\.onlineOrderingPaused\) \{\s*return NextResponse\.json\(customerErrorBody\(locale, 'truck_not_taking_orders'/.test(sub) && /payAtHatchOn\(truck, planCatalog\) && billingGate\.payAtHatchAllowed/.test(sub))
    t('submit: the gate runs before any booking (before the event lookup)', sub.indexOf('billingGateForTruck(truck, planCatalog)') > 0 && sub.indexOf('billingGateForTruck(truck, planCatalog)') < sub.indexOf("const eventCols ="))
    t('capture: the fee is computed only inside `if (await billingSwitchOn())`, and asks platformFeeOn itself',
      /if \(await billingSwitchOn\(\)\) \{[\s\S]{0,400}applicationFeeAtCapture[\s\S]{0,400}platformFeeOn\(/.test(cap))
    t('capture: application_fee_amount only through the conditional spread; the key unchanged without a fee',
      (cap.match(/application_fee_amount:/g) || []).length === 1 && /\.\.\.\(applicationFeeMinor !== null \? \{ application_fee_amount: applicationFeeMinor \} : \{\}\)/.test(cap)
      && /idempotencyKey: `op_capture:\$\{piId\}:\$\{captureMinor\}\$\{applicationFeeMinor !== null \? `:fee\$\{applicationFeeMinor\}` : ''\}`/.test(cap))
    const gate = strip(read('lib/billing/gate.ts'))
    t('gate: the switch is asked FIRST in both entry points', /export async function billingGateForTruck[\s\S]{0,200}if \(!\(await billingSwitchOn\(\)\)\) return BILLING_GATE_OFF/.test(gate) && /export async function applicationFeeAtCapture[\s\S]{0,200}if \(!\(await billingSwitchOn\(\)\)\) return null/.test(gate))
    t('35.an-17 still holds: every file that sends application_fee_amount asks platformFeeOn', ['lib/payments/capture.ts'].every(f => /platformFeeOn/.test(read(f))))
    const vj = JSON.parse(read('vercel.json'))
    t('the cron runs HOURLY (each truck\'s 1st, trial end and day-5 pause handled within the hour, in its own zone)', vj.crons.some(c => c.path === '/api/cron/billing' && c.schedule === '5 * * * *'))
    t('the cron does nothing with the switch off', /if \(!\(await store\.switches\(\)\)\.enabled\) return NextResponse\.json\(\{ ok: true, skipped: 'switch_off' \}\)/.test(strip(read('app/api/cron/billing/route.ts'))))
    const lib = fs.readdirSync(path.join(REPO, 'lib/billing')).map(f => read(`lib/billing/${f}`)).join('\n')
    t('no billing file names a truck (no gusto, no slug)', !/gusto/i.test(lib))
    const reg = JSON.parse(read('scripts/harnesses.json'))
    t('this harness is in the sweep list', reg.harnesses.includes('billing-1.cjs'))
  }

  // ══ 15 ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('15 · the migration')
  {
    const sql = read('supabase/migrations/20261085_billing_1.sql'), code = sql.replace(/--[^\n]*/g, '')
    const PROTECTED = /\b(update|delete\s+from|truncate(\s+table)?)\s+(only\s+)?(public\.)?"?(trucks|orders|plans|plan_prices|plan_features|country_settings)"?\b/i
    t('updates or deletes no existing row of a protected table; names no truck', !PROTECTED.test(code) && !/pizzeria-gusto/i.test(sql))
    t('the switch is added FALSE', /add column if not exists billing_enabled boolean not null default false/.test(code))
    t('six tables, RLS on, nothing granted to anon or authenticated',
      ['country_billing', 'operator_billing', 'truck_billing', 'billing_usage', 'billing_usage_orders', 'billing_invoices'].every(x => new RegExp(`alter table public\\.${x} enable row level security`).test(code)) && /revoke all on public\.country_billing[\s\S]*from anon, authenticated, public/.test(code))
    t('one invoice per truck per month (the unique key)', /unique \(truck_id, period\)/.test(code))
    t('(b) seeded where the application fee is not allowed; (a) elsewhere; (c) nowhere', /case when cs\.platform_fee_allowed then 'fee_from_payment' else 'billed_online' end/.test(code) && !/'billed_at_truck',\s*$/m.test(code))
    const sql2 = read('supabase/migrations/20261086_billing_1_correction.sql'), code2 = sql2.replace(/--[^\n]*/g, '')
    t('the correction: updates or deletes no existing row of a protected table; names no truck; refuses to run on non-empty billing tables',
      !PROTECTED.test(code2) && !/pizzeria-gusto/i.test(sql2) && /raise exception 'billing-1 correction: the billing tables are not empty/.test(code2))
    t('the late fee: a column defaulting to 0 (none in any country)', /add column if not exists late_fee_minor integer not null default 0/.test(code2))
    t('charges: unique (truck, month, kind, ref); one invoice per charge', /unique \(truck_id, period, kind, ref\)/.test(code2) && /add column if not exists charge_id uuid not null unique references public\.billing_charges\(id\)/.test(code2))
    t('plan history: recorded by a trigger only while billing is on (or for a billing test truck); a failure never blocks a plan change',
      /create trigger trucks_record_plan_history after insert or update of plan, trial_expires_at on public\.trucks/.test(code2) && /exception when others then/.test(code2)
      && /if not coalesce\(\(select ps\.billing_enabled from public\.platform_switches ps where ps\.id\), false\)/.test(code2)
      && /and not exists \(select 1 from public\.truck_billing tb where tb\.truck_id = new\.id and tb\.billing_test\) then\s+return new;/.test(read('supabase/migrations/20261087_billing_1_history_test_trucks.sql').replace(/--[^\n]*/g, '')))
    t('a minimum for every one of the 22 registry currencies', ['GBP', 'EUR', 'USD', 'CAD', 'AUD', 'NZD', 'CHF', 'CZK', 'DKK', 'HUF', 'NOK', 'SEK', 'PLN', 'RON', 'BRL', 'MXN', 'JPY', 'SGD', 'HKD', 'MYR', 'AED', 'THB'].every(c => new RegExp(`when '${c}' then \\d+`).test(code)))
  }

  // ══ 16 ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('16 · Admin\'s two screens use only classes the code already has (the public stylesheet does not change)')
  {
    const mine = ['components/admin/CountryBillingPanel.tsx', 'app/(app)/admin/billing/page.tsx']
    const tokens = new Set()
    for (const f of mine) {
      const src = read(f)
      for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g)) for (const tok of (m[1] ?? m[2] ?? m[3]).replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) if (tok) tokens.add(tok)
      for (const m of src.matchAll(/'((?:[a-z0-9:[\]/.-]+-[a-z0-9:[\]/.%-]+ ?)+)'/g)) for (const tok of m[1].split(/\s+/)) if (tok && /-/.test(tok)) tokens.add(tok)
    }
    const files = []
    const walk = dir => { for (const e of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) { const p = `${dir}/${e.name}`; if (e.isDirectory()) walk(p); else if (/\.(tsx|ts)$/.test(e.name) && !mine.includes(p)) files.push(p) } }
    walk('app'); walk('components')
    const corpus = files.map(read).join('\n')
    const esc = s => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
    const missing = [...tokens].filter(tok => !new RegExp(`(^|[\\s'"\`])${esc(tok)}($|[\\s'"\`])`, 'm').test(corpus))
    t(`every class (${tokens.size}) already exists elsewhere in app/ or components/`, missing.length === 0, missing)
  }

  console.log(`\n${fail === 0 ? '✅' : '🔴'} billing-1: ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})().catch(e => { console.error('🔴 harness crashed:', e); process.exit(1) })
