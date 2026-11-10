#!/usr/bin/env node
// scripts/billing-1.cjs — billing-1 (10 November 2026, docs/billing-1-report.md): HatchGrab charging trucks, built switched off.
// NO NETWORK, NO DATABASE, NEVER A LIVE TRUCK. The REAL lib/billing code — the rules, the month-end engine and the live-path gate —
// runs over the in-memory BillingStore (lib/billing/memory-store.ts, same contract as the database store) and a FAKE payment
// processor that behaves like the provider's test mode (idempotent by key; a "charge fails" test method declines).
//   1 · the switch OFF: nothing read but the switch, nothing written, every answer today's      2 · who is billed
//   3 · GB (a): online + at-the-truck pre-orders, walk-ups ignored, the allowance, the fee taken at capture, never billed twice
//   4 · refunds: the counted value and the fee given back        5 · BR (b): card, carry-over in BRL; Pix Automático       6 · MX (b)
//   7 · a (c) country                                             8 · FR post-pay with a surcharge                          9 · JPY
//   10 · the trial: trialling, ended without a method, prorated   11 · a failed payment → past due → paused on day 5 → paid → resumed
//   12 · no double billing: twice, a crash half-way, the claim     13 · the payment-method key guard (test only)
//   14 · the live paths read the gate (constructs)                 15 · the migration                                        16 · Admin's classes
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
      const key = `${a.truckId}:${a.period}`
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
    const cb = (countryCode, paymentModel, minChargeMinor, o = {}) => ({ countryCode, paymentModel, postPaySurchargeBps: 0, postPaySurchargeFixedMinor: 0, minChargeMinor, updatedAt: '2026-11-10T00:00:00.000Z', ...o })
    d.countryBilling = [cb('GB', 'fee_from_payment', 500), cb('FR', 'fee_from_payment', 600, { postPaySurchargeBps: 50, postPaySurchargeFixedMinor: 100 }),
      cb('BR', 'billed_online', 3500), cb('MX', 'billed_online', 13000), cb('JP', 'fee_from_payment', 1000), cb('XC', 'billed_at_truck', 600)]
    const TZ = { GB: 'Europe/London', FR: 'Europe/Paris', BR: 'America/Sao_Paulo', MX: 'America/Mexico_City', JP: 'Asia/Tokyo', XC: 'Europe/Paris' }
    const CUR = { GB: 'GBP', FR: 'EUR', BR: 'BRL', MX: 'MXN', JP: 'JPY', XC: 'EUR' }
    const truck = (id, country, plan, trialEnd, o = {}) => {
      d.trucks.push({ id, name: id, slug: id, country, currency: CUR[country], timezone: TZ[country], plan, trial_expires_at: trialEnd, is_customer: false, operator_id: `op-${id}`, ...o })
      d.operators.push({ id: `op-${id}`, email: `${id}@example.test`, name: id })
      d.truckBilling.push({ truckId: id, postPay: false, billingTest: true, paymentMethodState: 'none', paymentMethodType: null, stripePaymentMethodId: null, stripeSetupIntentId: null,
        paymentMethodLabel: null, paymentMethodUpdatedAt: null, paymentMethodLivemode: null, status: null, statusReason: null, statusChangedAt: null, ...(o.tb || {}) })
    }
    truck('gb-a', 'GB', 'pro', null); truck('gb-fail', 'GB', 'pro', null); truck('br-card', 'BR', 'payg', null); truck('br-pix', 'BR', 'unlimited', null)
    truck('mx', 'MX', 'trial', '2026-10-16T05:59:59.000Z')   // 15 October 23:59:59 in Mexico City (UTC−6)
    truck('xc', 'XC', 'payg', null); truck('fr-pp', 'FR', 'pro', null, { tb: { postPay: true } }); truck('jp', 'JP', 'payg', null)
    truck('gb-trial', 'GB', 'trial', '2026-12-31T23:59:59.000Z')
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
    for (const id of ['gb-a', 'gb-fail', 'xc']) d.truckBilling.find(x => x.truckId === id).paymentMethodState = 'none'
    d.invoices.push({ id: 'old', truckId: 'gb-fail', period: '2026-09-01', currency: 'GBP', amountMinor: 2900, livemode: false, stripeInvoiceId: 'in_old', status: 'failed', dueAt: '2026-10-01T12:00:00Z',
      attemptCount: 3, lastError: 'declined', hostedInvoiceUrl: null, createdAt: '2026-10-01T12:00:00Z', finalizedAt: null, paidAt: null })
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
    const out = await E.runMonth(real, proc, CATALOG, { truckId: 'gb-a', period: '2026-10-01', now, by: 'harness' })
    t('month-end for one truck: skipped (switch_off)', out.outcome === 'skipped' && out.reason === 'switch_off', out)
    const all = await E.runMonthEndAll(real, proc, CATALOG, now)
    t('month-end for all: skipped (switch_off), no outcomes', all.skipped === 'switch_off' && all.outcomes.length === 0, all)
    t('NOTHING WRITTEN (store) and nothing sent (processor)', d.writes.length === 0 && proc.P.calls.length === 0, { writes: d.writes, calls: proc.P.calls })
    const ctx = await ctxFor(real, 'gb-fail', now)
    t('rules: not billable (switch_off) → status null, nothing paused, Pay at Hatch allowed',
      R.billableOf(ctx).reason === 'switch_off' && R.billingStatusOf(ctx) === null && !R.onlineOrderingPausedByBilling(ctx) && R.payAtHatchAllowedByBilling(ctx))
    // A failed read of the switch is OFF.
    const broken = { switches: async () => { throw new Error('db down') } }
    globalThis.__billingStore = { ...real, ...broken }; G.__resetBillingSwitchCache()
    t('a switch that cannot be read is OFF (the gate answers as before)', J(await G.billingGateForTruck({ id: 'gb-fail' }, CATALOG, now)) === J(G.BILLING_GATE_OFF))
    // Switch ON but billing's own reads fail → still never paused.
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
    const arr = cc => R.arrangementOf({ countryBilling: world().countryBilling.find(x => x.countryCode === cc), truckBilling: R.DEFAULT_TRUCK_BILLING,
      country: world().countryFacts.find(x => x.countryCode === cc) })
    t('GB (a): the fee is taken from the payment', arr('GB').feeFromPayment === true && arr('GB').postPay === false)
    t('BR (b): billed monthly, never from the payment', arr('BR').feeFromPayment === false && arr('BR').model === 'billed_online')
    t('XC (c): post-pay by definition', arr('XC').postPay === true && arr('XC').feeFromPayment === false)
    t('(a) with the country\'s platform fee switched OFF (today\'s GB) → billed monthly instead (platformFeeOn, 35.an-17)',
      R.arrangementOf({ countryBilling: world().countryBilling[0], truckBilling: R.DEFAULT_TRUCK_BILLING, country: { countryCode: 'GB', platformFeeEnabled: false, platformFeeAllowed: true } }).feeFromPayment === false)
    t('a post-pay truck in an (a) country: billed monthly', R.arrangementOf({ countryBilling: world().countryBilling[0], truckBilling: { ...R.DEFAULT_TRUCK_BILLING, postPay: true },
      country: world().countryFacts[0] }).feeFromPayment === false)
  }

  // ══ 3 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · GB (a): online and at-the-truck pre-orders, walk-ups ignored, the allowance, the fee at capture, never billed twice')
  let gbProc
  {
    const d = world(); const store = S.memoryBillingStore(d)
    order(d, 'gb-a', 'o1', '2026-10-03T12:00:00Z', 300000); paid(d, 'o1', 300000)                     // online, inside the £4,000
    order(d, 'gb-a', 'o2', '2026-10-05T12:00:00Z', 150000, { status: 'collected' })                    // AT THE TRUCK, straddles it
    order(d, 'gb-a', 'o3', '2026-10-07T12:00:00Z', 200000, { status: 'ready' })                        // online, all above
    order(d, 'gb-a', 'o4', '2026-10-08T12:00:00Z', 1000000, { source: 'manual', status: 'collected' }) // a WALK-UP
    order(d, 'gb-a', 'o5', '2026-10-09T12:00:00Z', 50000, { status: 'cancelled' })
    order(d, 'gb-a', 'o6', '2026-10-09T13:00:00Z', 50000, { status: 'pending' })
    order(d, 'gb-a', 'o7', '2026-10-09T14:00:00Z', 50000, { status: 'rejected' })
    // The capture of o3: the fee from the allocation over o1, o2 and itself.
    const f3 = await fee(store, 'o3', 'gb-a', 200000, NOW('2026-10-07T12:05:00Z'))
    t('capture of o3: application fee 1980 (0.99% of £2,000, all above the allowance after o1 + the at-the-truck o2)', f3 === 1980, f3)
    t('capture of o1: no fee (inside the allowance — absence, never zero)', (await fee(store, 'o1', 'gb-a', 300000, NOW('2026-10-03T12:05:00Z'))) === null)
    t('the fee is capped at what is being captured', (await fee(store, 'o3', 'gb-a', 1000, NOW('2026-10-07T12:05:00Z'))) === 1000)
    t('the walk-up is never an order the fee is computed for', (await fee(store, 'o4', 'gb-a', 1000000, NOW('2026-10-08T12:05:00Z'))) === null)
    paid(d, 'o3', 200000, 1980)
    gbProc = fakeProcessor()
    await pm(d, store, gbProc, 'gb-a', 'pm_card_visa')
    const now = NOW('2026-11-01T12:00:00Z')
    const out = await E.runMonth(store, gbProc, CATALOG, { truckId: 'gb-a', period: '2026-10-01', now, by: 'harness' })
    const u = out.usage
    t('invoiced', out.outcome === 'invoiced', out)
    t('counted: 3 pre-orders, £6,500 (online £5,000 + at the truck £1,500); walk-up, cancelled, pending, rejected ignored',
      u.preorderCount === 3 && u.countedMinor === 650000 && u.countedOnlineMinor === 500000 && u.countedAtTruckMinor === 150000, u)
    t('allowance used £4,000 of £4,000; fee due 495 + 1980 = 2475', u.allowanceMinor === 400000 && u.allowanceUsedMinor === 400000 && u.feeDueMinor === 2475, u)
    t('🔴 fee taken by application fee 1980 is NOT billed again; billed only the at-the-truck share 495', u.feeTakenMinor === 1980 && u.feeBilledMinor === 495, u)
    t('plan £29 for the whole month; charged 2900 + 495 = 3395 GBP', u.planFeeMinor === 2900 && u.planDays === 31 && u.chargedMinor === 3395 && out.invoice.currency === 'GBP', u)
    const lines = d.usageLines.filter(l => l.truckId === 'gb-a')
    t('the ledger lines: o1 none, o2 invoice 495, o3 application_fee 1980 (auditable per order)', J(lines.map(l => [l.orderKey, l.feeVia, l.feeMinor])) === J([['o1', 'none', 0], ['o2', 'invoice', 495], ['o3', 'application_fee', 1980]]), lines)
    const pinv = gbProc.P.invoices[out.invoice.stripeInvoiceId]
    t('the invoice: GBP, two lines (Pro plan, the fee on pre-orders), on the card on file', pinv.currency === 'GBP' && J(pinv.lines.map(l => [l.key, l.amountMinor])) === J([['plan', 2900], ['usage', 495]]) && pinv.pmType === 'card', pinv)
    t('the month is frozen (invoiced)', (await store.usage('gb-a', '2026-10-01')).state === 'invoiced')
    t('the period not yet ended is refused (November on 10 November)', (await E.runMonth(store, gbProc, CATALOG, { truckId: 'gb-a', period: '2026-11-01', now: NOW('2026-11-10T12:00:00Z'), by: 'h' })).reason === 'period_not_ended')
  }

  // ══ 4 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · refunds: the counted value falls in proportion, and so does the fee taken')
  {
    const d = world(); const store = S.memoryBillingStore(d)
    order(d, 'gb-a', 'o1', '2026-10-03T12:00:00Z', 300000); paid(d, 'o1', 300000)
    order(d, 'gb-a', 'o2', '2026-10-05T12:00:00Z', 150000, { status: 'collected' })
    order(d, 'gb-a', 'o3', '2026-10-07T12:00:00Z', 200000); paid(d, 'o3', 200000, 1980)
    d.payments.push({ order_key: 'o3', kind: 'refund', amount_minor: 100000, application_fee_refunded_minor: 990 })   // half refunded, half the fee back
    const proc = fakeProcessor(); NOW('2026-11-01T12:00:00Z'); await pm(d, store, proc, 'gb-a', 'pm_card_visa')
    const u = (await E.runMonth(store, proc, CATALOG, { truckId: 'gb-a', period: '2026-10-01', now: NOW('2026-11-01T12:00:00Z'), by: 'h' })).usage
    t('o3 counts £1,000 after a half refund; counted £5,500', u.countedMinor === 550000, u)
    t('fee taken is net of the fee given back (990); billed still only 495', u.feeTakenMinor === 990 && u.feeBilledMinor === 495 && u.chargedMinor === 3395, u)
    const r = read('lib/payments/refund.ts')
    t('refund.ts sends refund_application_fee ONLY when the charge carried a fee (construct)', /\.\.\.\(chargeFeeMinor > 0 \? \{ refund_application_fee: true \} : \{\}\)/.test(strip(r)) && (strip(r).match(/refund_application_fee/g) || []).length === 1)
    t('…and decides from the ledger row of the capture, every time (not only while the switch is on)', /from\('order_payments'\)\.select\('application_fee_minor'\)/.test(strip(r)) && !/billingSwitchOn/.test(strip(r)))
  }

  // ══ 5 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · BR (b): the fee billed monthly in BRL, never from the payment; carry-over; Pix Automático')
  {
    const d = world(); const store = S.memoryBillingStore(d)
    order(d, 'br-card', 'b1', '2026-10-10T15:00:00Z', 10000); paid(d, 'b1', 10000)     // R$100 online
    order(d, 'br-card', 'b2', '2026-10-11T15:00:00Z', 5000, { status: 'collected' })     // R$50 at the truck
    t('capture in Brazil: no application fee, ever ((b), and the provider forbids it there)', (await fee(store, 'b1', 'br-card', 10000, NOW('2026-10-10T15:05:00Z'))) === null)
    const proc = fakeProcessor(); NOW('2026-11-01T12:00:00Z'); await pm(d, store, proc, 'br-card', 'pm_card_visa')
    const oct = await E.runMonth(store, proc, CATALOG, { truckId: 'br-card', period: '2026-10-01', now: NOW('2026-11-01T12:00:00Z'), by: 'h' })
    t('October: fee 99 + 50 (half-up) = 149 centavos, all billed', oct.usage.feeDueMinor === 149 && oct.usage.feeBilledMinor === 149 && oct.usage.feeTakenMinor === 0, oct.usage)
    t('…under the R$35 minimum → CARRIED, nothing charged, no invoice', oct.outcome === 'carried' && oct.usage.carriedOutMinor === 149 && oct.usage.chargedMinor === 0 && proc.P.created === 0, oct)
    order(d, 'br-card', 'b3', '2026-11-12T15:00:00Z', 400000); paid(d, 'b3', 400000)   // R$4,000 in November
    const nov = await E.runMonth(store, proc, CATALOG, { truckId: 'br-card', period: '2026-11-01', now: NOW('2026-12-01T12:00:00Z'), by: 'h' })
    t('November: 3960 + 149 carried in = 4109 → invoiced in BRL', nov.outcome === 'invoiced' && nov.usage.carriedInMinor === 149 && nov.usage.chargedMinor === 4109 && nov.invoice.currency === 'BRL', nov.usage)
    t('the carried amount is its own invoice line', J(proc.P.invoices[nov.invoice.stripeInvoiceId].lines.map(l => [l.key, l.amountMinor])) === J([['usage', 3960], ['carried', 149]]))
    // Pix Automático on an Unlimited truck in Brazil
    const s = await E.startPaymentMethodSetup(store, proc, CATALOG, { truckId: 'br-pix', type: 'pix', now: NOW('2026-10-20T12:00:00Z'), by: 'h' })
    t('Pix set-up starts a SetupIntent for the truck (state pending)', s.setupIntentId === 'seti_br-pix_pix' && (await store.truckBilling('br-pix')).paymentMethodState === 'pending')
    let refused = null; try { await E.startPaymentMethodSetup(store, proc, CATALOG, { truckId: 'gb-a', type: 'pix', now: NOW('2026-10-20T12:00:00Z'), by: 'h' }) } catch (e) { refused = e.message }
    t('Pix is refused for a non-BRL truck', /BRL/.test(String(refused)), refused)
    await pm(d, store, proc, 'br-pix', 'pm_pix_test')
    const px = await E.runMonth(store, proc, CATALOG, { truckId: 'br-pix', period: '2026-10-01', now: NOW('2026-11-01T12:00:00Z'), by: 'h' })
    const pinv = proc.P.invoices[px.invoice.stripeInvoiceId]
    t('Unlimited R$149 invoiced in BRL on the Pix method (type pix)', px.outcome === 'invoiced' && px.usage.chargedMinor === 14900 && pinv.currency === 'BRL' && pinv.pmType === 'pix', px.usage)
  }

  // ══ 6 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('6 · MX (b): the trial ends mid-month → the country\'s trial-end plan (Unlimited), prorated, in MXN')
  {
    const d = world(); const store = S.memoryBillingStore(d)
    order(d, 'mx', 'm1', '2026-10-10T18:00:00Z', 900000); paid(d, 'm1', 900000)   // during the trial: never counted
    order(d, 'mx', 'm2', '2026-10-20T18:00:00Z', 900000); paid(d, 'm2', 900000)
    const proc = fakeProcessor(); NOW('2026-10-14T12:00:00Z')
    t('14 October: trialling', R.billingStatusOf(await ctxFor(store, 'mx', globalThis.__now)).status === 'trialling')
    await pm(d, store, proc, 'mx', 'pm_card_visa')
    const out = await E.runMonth(store, proc, CATALOG, { truckId: 'mx', period: '2026-10-01', now: NOW('2026-11-01T12:00:00Z'), by: 'h' })
    t('priced on Unlimited (MX\'s trial-end plan), 16 of 31 days: floor(84900 × 16 / 31) = 43819', out.usage.planKey === 'unlimited' && out.usage.planDays === 16 && out.usage.planFeeMinor === 43819, out.usage)
    t('only the pre-order after the trial counts (m2); Unlimited has no fee', out.usage.preorderCount === 1 && out.usage.feeDueMinor === 0)
    t('invoiced 43819 MXN (≥ the 13000 minimum)', out.outcome === 'invoiced' && out.invoice.currency === 'MXN' && out.usage.chargedMinor === 43819)
    t('the plan line says the days', /16 of 31 days/.test(proc.P.invoices[out.invoice.stripeInvoiceId].lines[0].description))
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
    const out = await E.runMonth(store, proc, CATALOG, { truckId: 'xc', period: '2026-10-01', now, by: 'h' })
    t('€1,000 at the truck → fee 594 + 396 = 990 billed in EUR', out.outcome === 'invoiced' && out.usage.feeBilledMinor === 990 && out.usage.countedAtTruckMinor === 100000 && out.invoice.currency === 'EUR', out.usage)
  }

  // ══ 8 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('8 · FR post-pay: no fee from the payment, the fee billed, the surcharge (0.5% + €1)')
  {
    const d = world(); const store = S.memoryBillingStore(d)
    order(d, 'fr-pp', 'f1', '2026-10-04T10:00:00Z', 300000, { status: 'collected' }); order(d, 'fr-pp', 'f2', '2026-10-05T10:00:00Z', 200000); paid(d, 'f2', 200000)
    t('capture for a post-pay truck: no application fee (FR\'s platform fee is on)', (await fee(store, 'f2', 'fr-pp', 200000, NOW('2026-10-05T10:05:00Z'))) === null)
    const proc = fakeProcessor(); NOW('2026-11-01T12:00:00Z'); await pm(d, store, proc, 'fr-pp', 'pm_card_visa')
    const c = await ctxFor(store, 'fr-pp', globalThis.__now)
    t('post-pay with a method → Pay at Hatch allowed after the trial', R.payAtHatchAllowedByBilling(c))
    const out = await E.runMonth(store, proc, CATALOG, { truckId: 'fr-pp', period: '2026-10-01', now: globalThis.__now, by: 'h' })
    t('fee 990 billed (€1,000 above the €4,000 allowance), surcharge 2500 + 100 = 2600, plan 2900 → 6490 EUR',
      out.usage.feeBilledMinor === 990 && out.usage.surchargeMinor === 2600 && out.usage.planFeeMinor === 2900 && out.usage.chargedMinor === 6490 && out.invoice.currency === 'EUR', out.usage)
    const d0 = world(); d0.countryBilling.find(x => x.countryCode === 'FR').postPaySurchargeBps = 0; d0.countryBilling.find(x => x.countryCode === 'FR').postPaySurchargeFixedMinor = 0
    const s0 = S.memoryBillingStore(d0); order(d0, 'fr-pp', 'f1', '2026-10-04T10:00:00Z', 300000, { status: 'collected' })
    await pm(d0, s0, fakeProcessor(), 'fr-pp', 'pm_card_visa')
    t('a surcharge of 0 is not applied (no line)', (await E.runMonth(s0, fakeProcessor(), CATALOG, { truckId: 'fr-pp', period: '2026-10-01', now: globalThis.__now, by: 'h' })).usage.surchargeMinor === 0)
    const g = { postPay: false, billingTest: true, paymentMethodState: 'valid', paymentMethodType: 'card' }
    const cNot = { ...c, truckBilling: g }
    t('NOT post-pay, with a method, after the trial → Pay at Hatch OFF (decision 9)', !R.payAtHatchAllowedByBilling(cNot))
  }

  // ══ 9 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('9 · JPY: whole yen, rounded DOWN; under ¥1,000 carried')
  {
    const d = world(); const store = S.memoryBillingStore(d)
    order(d, 'jp', 'j1', '2026-10-10T03:00:00Z', 1515, { status: 'collected' })   // 1515 × 0.99% = 14.9985 → 14 (half-up would say 15)
    const proc = fakeProcessor(); NOW('2026-11-01T12:00:00Z'); await pm(d, store, proc, 'jp', 'pm_card_visa')
    const oct = await E.runMonth(store, proc, CATALOG, { truckId: 'jp', period: '2026-10-01', now: globalThis.__now, by: 'h' })
    t('¥14 (rounded down), carried (under ¥1,000)', oct.usage.feeDueMinor === 14 && oct.outcome === 'carried', oct.usage)
    order(d, 'jp', 'j2', '2026-11-10T03:00:00Z', 120000, { status: 'collected' })
    const nov = await E.runMonth(store, proc, CATALOG, { truckId: 'jp', period: '2026-11-01', now: NOW('2026-12-01T12:00:00Z'), by: 'h' })
    t('November ¥1,188 + ¥14 = ¥1,202 invoiced in JPY', nov.outcome === 'invoiced' && nov.usage.chargedMinor === 1202 && nov.invoice.currency === 'JPY', nov.usage)
    t('the Tokyo month is Tokyo\'s: 31 Oct 23:30 JST is October, 31 Oct 15:30 UTC', R.periodOf('2026-10-31T14:30:00Z', 'Asia/Tokyo') === '2026-10-01' && R.periodOf('2026-10-31T15:30:00Z', 'Asia/Tokyo') === '2026-11-01')
  }

  // ══ 10 ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('10 · the trial: trialling, ended without a method → paused, the walk-up untouched')
  {
    const d = world(); const store = S.memoryBillingStore(d)
    let c = await ctxFor(store, 'gb-trial', NOW('2026-11-10T12:00:00Z'))
    t('during the trial: trialling, Pay at Hatch allowed, nothing paused — no method needed yet (decision 4)', R.billingStatusOf(c).status === 'trialling' && R.payAtHatchAllowedByBilling(c) && !R.onlineOrderingPausedByBilling(c))
    const g1 = await gate(store, 'gb-trial', NOW('2027-01-01T09:00:00Z'))
    t('1 January 2027, trial over, no method → ONLINE ordering paused, Pay at Hatch off', g1.onlineOrderingPaused === true && g1.payAtHatchAllowed === false, g1)
    const proc = fakeProcessor(); NOW('2027-01-01T10:00:00Z'); await pm(d, store, proc, 'gb-trial', 'pm_card_visa')
    const g2 = await gate(store, 'gb-trial', NOW('2027-01-01T10:01:00Z'))
    t('a card added → resumed at once (not post-pay: online only)', g2.onlineOrderingPaused === false && g2.payAtHatchAllowed === false, g2)
    const dec = await E.runMonth(store, proc, CATALOG, { truckId: 'gb-trial', period: '2026-12-01', now: NOW('2027-01-02T12:00:00Z'), by: 'h' })
    t('December (all trial) is never billed', dec.outcome === 'nothing' && dec.usage.planDays === 0, dec)
    const action = read('app/api/dashboard/action/route.ts')
    t('walk-ups and the kitchen screen never ask billing (no billing import on the dashboard/KDS paths)', !/lib\/billing/.test(action) && !/lib\/billing/.test(read('app/(app)/dashboard/[token]/kds/page.tsx')))
  }

  // ══ 11 ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('11 · a failed payment → retries → past due → paused on day 5 → paid → resumed')
  {
    const d = world(); const store = S.memoryBillingStore(d)
    const proc = fakeProcessor(); NOW('2026-10-20T12:00:00Z'); await pm(d, store, proc, 'gb-fail', 'pm_card_chargeCustomerFail')
    const out = await E.runMonth(store, proc, CATALOG, { truckId: 'gb-fail', period: '2026-10-01', now: NOW('2026-11-01T12:00:00Z'), by: 'h' })
    t('the Pro fee is invoiced (open)', out.outcome === 'invoiced' && out.invoice.status === 'open', out)
    const attempt = await proc.payInvoice(out.invoice.stripeInvoiceId)
    await E.applyInvoiceUpdate(store, CATALOG, attempt, NOW('2026-11-01T13:00:00Z'))
    t('the provider\'s attempt declines → our row: failed, 1 attempt, the reason kept', (await store.invoice('gb-fail', '2026-10-01')).status === 'failed' && (await store.invoice('gb-fail', '2026-10-01')).attemptCount === 1)
    const g4 = await gate(store, 'gb-fail', NOW('2026-11-05T11:59:00Z'))
    const c4 = await ctxFor(store, 'gb-fail', NOW('2026-11-05T11:59:00Z'))
    t('day 4: past due, still taking online orders', R.billingStatusOf(c4).status === 'past_due' && g4.onlineOrderingPaused === false)
    const g5 = await gate(store, 'gb-fail', NOW('2026-11-06T12:00:00Z'))
    t('day 5: ONLINE ordering paused (the existing "not taking orders" state)', g5.onlineOrderingPaused === true)
    await E.refreshTruckBillingStatus(store, CATALOG, 'gb-fail', NOW('2026-11-06T12:00:00Z'))
    t('the cached status says paused (unpaid) for Admin', (await store.truckBilling('gb-fail')).status === 'paused' && (await store.truckBilling('gb-fail')).statusReason === 'unpaid')
    NOW('2026-11-07T09:00:00Z'); await pm(d, store, proc, 'gb-fail', 'pm_card_visa')
    const paidInv = await proc.payInvoice(out.invoice.stripeInvoiceId, (await store.truckBilling('gb-fail')).stripePaymentMethodId)
    await E.applyInvoiceUpdate(store, CATALOG, paidInv, NOW('2026-11-07T09:01:00Z'))
    const g6 = await gate(store, 'gb-fail', NOW('2026-11-07T09:02:00Z'))
    t('a new card, paid → our row paid; online ordering RESUMED automatically', (await store.invoice('gb-fail', '2026-10-01')).status === 'paid' && g6.onlineOrderingPaused === false, g6)
    t('…and the cached status is active again', (await store.truckBilling('gb-fail')).status === 'active')
    t('an invoice that is not ours is ignored by the webhook path', (await E.applyInvoiceUpdate(store, CATALOG, { ...paidInv, id: 'in_someone_else' }, globalThis.__now)) === 'unknown')
    const whDir = fs.readdirSync(path.join(REPO, 'app/api/webhooks')).find(n => n.endsWith('-billing'))   // the billing webhook's folder
    const wh = read(`app/api/webhooks/${whDir}/route.ts`)
    t('the billing webhook: verified first, recorded before handling, live events ignored, only billing-1 invoices', /verifyStripeSignature/.test(wh) && wh.indexOf("from('stripe_webhook_events').insert") < wh.indexOf('await handle(event)') && /if \(event\.livemode\) return 'ignored_live/.test(wh) && /hatchgrab !== 'billing-1'/.test(wh))
  }

  // ══ 12 ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('12 · never billed twice')
  {
    const d = world(); const store = S.memoryBillingStore(d)
    const proc = fakeProcessor({ failCreateOnce: new Set(['gb-a:2026-10-01']) }); NOW('2026-10-20T12:00:00Z'); await pm(d, store, proc, 'gb-a', 'pm_card_visa')
    const run = () => E.runMonth(store, proc, CATALOG, { truckId: 'gb-a', period: '2026-10-01', now: NOW('2026-11-01T12:00:00Z'), by: 'h' })
    const quiet = console.error; console.error = () => {}
    const first = await run()
    console.error = quiet
    t('a crash half-way: failed, the claim kept as "creating", the month still open', first.outcome === 'failed' && (await store.invoice('gb-a', '2026-10-01')).status === 'creating' && (await store.usage('gb-a', '2026-10-01')).state === 'open', first)
    const second = await run()
    t('the next run completes it — under the same key', second.outcome === 'invoiced' && proc.P.created === 1, second)
    const third = await run()
    t('a third run: already — nothing new at the provider', third.outcome === 'already' && proc.P.created === 1 && d.invoices.length === 1, third)
    const all = await E.runMonthEndAll(store, proc, CATALOG, NOW('2026-11-02T12:00:00Z'))
    t('the all-trucks run (next day) does not bill gb-a again', proc.P.keys.size === all.outcomes.filter(o => o.outcome === 'invoiced').length + 1 && d.invoices.filter(i => i.truckId === 'gb-a').length === 1, all.outcomes.map(o => [o.truckId, o.outcome]))
    const claim = await store.claimInvoice({ truckId: 'gb-a', period: '2026-10-01', currency: 'GBP', amountMinor: 1, livemode: false })
    t('the claim refuses a second row for the same truck and month', claim.claimed === false)
    t('a frozen month is never recomputed', (await store.replaceUsage({ ...(await store.usage('gb-a', '2026-10-01')), state: 'open' }, [])) === false)
    const live = await E.runMonth(S.memoryBillingStore(world()), fakeProcessor({ livemode: true }), CATALOG, { truckId: 'gb-a', period: '2026-10-01', now: globalThis.__now, by: 'h' })
    t('a LIVE processor is refused by the engine (test mode only)', ['failed', 'no_payment_method'].includes(live.outcome))
    const d2 = world(); const s2 = S.memoryBillingStore(d2); const p2 = fakeProcessor(); NOW('2026-10-20T12:00:00Z'); await pm(d2, s2, p2, 'gb-a', 'pm_card_visa')
    const lv = await E.runMonth(s2, { ...p2, livemode: true }, CATALOG, { truckId: 'gb-a', period: '2026-10-01', now: NOW('2026-11-01T12:00:00Z'), by: 'h' })
    t('…with a method on file too: live_processor_refused, nothing created', lv.outcome === 'failed' && lv.reason === 'live_processor_refused' && p2.P.created === 0, lv)
    const noPm = await E.runMonth(S.memoryBillingStore(world()), fakeProcessor(), CATALOG, { truckId: 'gb-a', period: '2026-10-01', now: NOW('2026-11-01T12:00:00Z'), by: 'h' })
    t('owed but no method on file → no_payment_method, the month left open for the next run', noPm.outcome === 'no_payment_method' && noPm.usage.state === 'open')
    let refusedTest = null; try { await E.attachTestPaymentMethod(s2, p2, CATALOG, { truckId: 'gb-a', testToken: 'pm_card_visa', now: globalThis.__now, by: 'h' }); d2.truckBilling.find(x => x.truckId === 'gb-a').billingTest = false; await E.attachTestPaymentMethod(s2, p2, CATALOG, { truckId: 'gb-a', testToken: 'pm_card_visa', now: globalThis.__now, by: 'h' }) } catch (e) { refusedTest = e.message }
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
    t('the daily cron at 12:00 UTC (the month has ended in every zone)', vj.crons.some(c => c.path === '/api/cron/billing' && c.schedule === '0 12 * * *'))
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
