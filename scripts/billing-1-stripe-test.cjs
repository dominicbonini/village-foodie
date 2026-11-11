#!/usr/bin/env node
// scripts/billing-1-stripe-test.cjs — billing-1 (10 November 2026): THE SAME ENGINE AGAINST STRIPE TEST MODE. BY HAND ONLY
// (harnesses.json `operational_read_only`: it talks to Stripe). It never touches the database: the trucks are fixtures in the
// in-memory store (lib/billing/memory-store.ts); only the processor is real (lib/billing/processor.ts), and that REFUSES anything
// but a `sk_test_` key in STRIPE_BILLING_TEST_SECRET_KEY — so it can create nothing live and charge nobody.
//   node scripts/billing-1-stripe-test.cjs
// What it proves on Stripe's own test mode: a Customer per owner (found again, never duplicated); invoices in GBP, EUR, BRL, MXN and
// JPY on Stripe's test cards; a declining card (pm_card_chargeCustomerFail) → a failed attempt, then a good card → paid; the same
// month twice → the same invoice (idempotency); a Pix Automático SetupIntent for Brazil (created; confirming it needs a payer).
// The environment is loaded by Next's own loader (@next/env), the app's config loading; no value is ever printed.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const path = require('path')
const REPO = path.resolve(__dirname, '..')
require(path.join(REPO, 'node_modules/@next/env')).loadEnvConfig(REPO, false, { info() {}, error() {} })
const kit = require('./_render-kit.cjs')({ cacheTag: 'billing-1-stripe-test' })

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 900)}` : '')) } }

;(async () => {
  const key = process.env.STRIPE_BILLING_TEST_SECRET_KEY || ''
  if (!key.startsWith('sk_test_')) {
    console.log(`🔴 STRIPE_BILLING_TEST_SECRET_KEY is ${key ? 'not a test key — refused' : 'not set'}. Add the TEST secret key (Stripe › Developers › API keys, test mode) to .env.local as STRIPE_BILLING_TEST_SECRET_KEY and run again.`)
    process.exit(2)
  }
  const { R, E, S, K } = await kit.bundle('billing-1-stripe-test', [
    "export * as R from '@/lib/billing/rules'", "export * as E from '@/lib/billing/engine'", "export * as S from '@/lib/billing/memory-store'", "export * as K from '@/lib/billing/processor'",
  ].join('\n'))
  const proc = K.stripeBillingProcessor()
  // billing-1 Stripe run (11 November 2026): every invoice the ENGINE asks for is recorded, so the idempotency check below replays the
  // engine's own request byte for byte — Stripe (rightly) refuses a reused key with different parameters.
  const created = {}
  { const orig = proc.createInvoice.bind(proc); proc.createInvoice = async a => { created[a.truckId] = created[a.truckId] ?? a; return orig(a) } }
  t('the processor is test mode', proc.livemode === false)
  const run = `b1-${Date.now().toString(36)}`   // a fresh owner per run, so Stripe's idempotency window never replays an old run
  const plan = (key, sortOrder, o = {}) => ({ key, name: key === 'payg' ? 'Pay as you go' : key[0].toUpperCase() + key.slice(1), description: '', sortOrder, isPublic: true, isInternal: false, isTrial: false,
    isSignupDefault: false, isExpiryFallback: false, isDemo: false, payAtHatchAllowed: true, active: true, includedVans: 1, trialMonths: null, isHighlighted: false, subtitle: null, ...o })
  const CATALOG = { plans: [plan('payg', 1, { isExpiryFallback: true }), plan('pro', 2), plan('unlimited', 3)], features: [], prices: [
    ['GB', 2900, 400000], ['FR', 2900, 400000], ['BR', 5900, 800000], ['MX', 34900, 5000000], ['JP', 1980, 250000],
  ].flatMap(([cc, pro, inc]) => [
    { planKey: 'payg', countryCode: cc, monthlyMinor: 0, includedOnlineMinor: 0, feeBps: 99, extraVanMonthlyMinor: 0, offered: true, trialEnd: false },
    { planKey: 'pro', countryCode: cc, monthlyMinor: pro, includedOnlineMinor: inc, feeBps: 99, extraVanMonthlyMinor: pro, offered: true, trialEnd: false },
    { planKey: 'unlimited', countryCode: cc, monthlyMinor: pro * 2, includedOnlineMinor: null, feeBps: 0, extraVanMonthlyMinor: pro * 2, offered: true, trialEnd: false },
  ]) }
  const d = S.emptyMemoryData()
  d.switches = { enabled: true, pauseAfterDays: 5 }
  const C = { GB: ['GBP', 'en-GB', 'Europe/London', 'fee_from_payment', 500], FR: ['EUR', 'fr-FR', 'Europe/Paris', 'fee_from_payment', 600], BR: ['BRL', 'pt-BR', 'America/Sao_Paulo', 'billed_online', 3500],
    MX: ['MXN', 'es-MX', 'America/Mexico_City', 'billed_online', 13000], JP: ['JPY', 'ja-JP', 'Asia/Tokyo', 'fee_from_payment', 1000] }
  for (const [cc, [cur, loc, , model, min]] of Object.entries(C)) {
    d.countryFacts.push({ countryCode: cc, currency: cur, locale: loc, platformFeeEnabled: false, platformFeeAllowed: !['BR', 'MX'].includes(cc) })
    d.countryBilling.push({ countryCode: cc, paymentModel: model, postPaySurchargeBps: 0, postPaySurchargeFixedMinor: 0, minChargeMinor: min, lateFeeMinor: 0 })
  }
  for (const cc of Object.keys(C)) {
    const id = `${run}-${cc.toLowerCase()}`
    d.trucks.push({ id, name: `billing-1 test ${cc}`, slug: id, country: cc, currency: C[cc][0], timezone: C[cc][2], plan: 'pro', trial_expires_at: null, is_customer: false, operator_id: `${run}-op` })
    d.truckBilling.push({ truckId: id, postPay: cc === 'FR', billingTest: true, paymentMethodState: 'none', paymentMethodType: null, stripePaymentMethodId: null, stripeSetupIntentId: null,
      paymentMethodLabel: null, paymentMethodUpdatedAt: null, paymentMethodLivemode: null, status: null, statusReason: null, statusChangedAt: null, pendingPlanKey: null, pendingPlanFrom: null })
  }
  d.operators.push({ id: `${run}-op`, email: null, name: `billing-1 harness ${run}` })   // no email: test mode, nobody to write to
  const store = S.memoryBillingStore(d)
  const now = new Date('2026-11-01T12:00:00Z')
  const LATE = 'GB'   // the GB truck's declined invoice also proves the late-fee re-issue (a TEST value; every real fee is 0)
  const T = cc => `${run}-${cc.toLowerCase()}`

  // Cards and invoices in five currencies (1 November: November's Pro fee in advance; no orders in October).
  for (const cc of Object.keys(C)) {
    await E.attachTestPaymentMethod(store, proc, CATALOG, { truckId: T(cc), testToken: cc === 'GB' ? 'pm_card_chargeCustomerFail' : 'pm_card_visa', now, by: 'harness' })
    const out = await E.runMonthly(store, proc, CATALOG, { truckId: T(cc), period: '2026-11-01', now, by: 'harness' })
    const inv = out.invoice?.stripeInvoiceId ? await proc.retrieveInvoice(out.invoice.stripeInvoiceId) : null
    t(`${cc}: invoiced ${out.charge?.chargedMinor} ${C[cc][0]} — Stripe invoice ${inv?.id} is ${inv?.status}, amount_due ${inv?.amountDueMinor}`,
      out.outcome === 'invoiced' && inv && inv.amountDueMinor === out.charge.chargedMinor && inv.status === 'open', out)
  }
  t('one Stripe Customer for the owner of all five trucks', d.customers.length === 1)

  // GB: the declining card → a failed attempt; then a good card → paid; the gate resumes.
  const gb = (await store.listInvoices(T('GB')))[0]
  const a1 = await proc.payInvoice(gb.stripeInvoiceId)
  await E.applyInvoiceUpdate(store, CATALOG, a1, now)
  t(`GB: the declining test card fails (attempts ${a1.attemptCount}, "${a1.lastError}")`, a1.status === 'open' && a1.attemptCount >= 1, a1)
  // billing-2: the pause instant of the 5-full-day rule (00:00 London, the day after the last full day to pay).
  const fresh = (await store.listInvoices(T('GB')))[0]
  const day5 = new Date(R.failureTimeline(fresh.firstFailedAt ?? new Date().toISOString(), 'Europe/London', 5).pauseAt)
  t('GB: paused at the pause instant (00:00 after 5 full days)', R.billingStatusOf(await E.billingContextFor(store, await store.truck(T('GB')), CATALOG, day5)).status === 'paused')
  d.countryBilling.find(c => c.countryCode === LATE).lateFeeMinor = 300
  const late = await E.applyLateFees(store, proc, CATALOG, { truckId: T('GB'), now: day5, by: 'harness' })
  const gbRow = (await store.listInvoices(T('GB')))[0]
  const voidedOld = await proc.retrieveInvoice(gb.stripeInvoiceId)
  t(`GB: day 5 with a (test) £3 late fee → the invoice voided (${voidedOld.status}) and re-issued at ${gbRow.amountMinor} (${gbRow.stripeInvoiceId})`,
    late[0]?.outcome === 'added' && voidedOld.status === 'void' && gbRow.amountMinor === gb.amountMinor + 300, late)
  d.countryBilling.find(c => c.countryCode === LATE).lateFeeMinor = 0
  const good = await E.attachTestPaymentMethod(store, proc, CATALOG, { truckId: T('GB'), testToken: 'pm_card_visa', now: day5, by: 'harness' })
  const a2 = await proc.payInvoice(gbRow.stripeInvoiceId, good.stripePaymentMethodId)
  await E.applyInvoiceUpdate(store, CATALOG, a2, day5)
  t('GB: a good card → paid → active again (online ordering resumes)', a2.status === 'paid' && R.billingStatusOf(await E.billingContextFor(store, await store.truck(T('GB')), CATALOG, day5)).status === 'active', a2)

  // Idempotency at Stripe: creating the same month's invoice again returns the first one.
  const fr = (await store.listInvoices(T('FR')))[0]
  const frCharge = (await store.listCharges(T('FR')))[0]
  const first = created[T('FR')]
  t('FR: the engine’s request was keyed on the charge (chargeKeyOf)', first && first.idempotencyBase === E.chargeKeyOf(frCharge), first && first.idempotencyBase)
  const again = await proc.createInvoice({ ...first })   // the same request again, as the engine sends it when a run is retried
  t('FR: the same month again → Stripe replays the SAME invoice (idempotency key)', again.id === fr.stripeInvoiceId, { first: fr.stripeInvoiceId, again: again.id })

  // Pix Automático: a SetupIntent with a monthly mandate in BRL (confirming it needs the payer's bank app).
  try {
    const s = await E.startPaymentMethodSetup(store, proc, CATALOG, { truckId: T('BR'), type: 'pix', now, by: 'harness' })
    t(`BR: a Pix Automático SetupIntent is created (${s.setupIntentId})`, /^seti_/.test(s.setupIntentId))
  } catch (e) {
    t('BR: a Pix Automático SetupIntent is created', false, `Stripe refused: ${e.message} — see the report's hand steps (enable Pix in Settings › Payment methods)`)
  }

  // ══ billing-3 (11 November 2026): the billing-2 flows on Stripe's own test mode, and who retries a failed payment ══════════════
  // Checkout in setup mode (Manage › Billing "Add card" / "Update card" / "Use a different card") — the hosted card page.
  const custId = d.customers[0].stripeCustomerId
  const cs = await proc.createSetupCheckout({ customerId: custId, truckId: T('GB'), currency: 'GBP', locale: 'en-GB', successUrl: 'https://example.test/manage?tab=billing&setup={CHECKOUT_SESSION_ID}', cancelUrl: 'https://example.test/manage?tab=billing' })
  const csBack = await proc.retrieveSetupCheckout(cs.id)
  t(`Checkout set-up: a hosted Stripe page (${cs.url.slice(0, 32)}…), tagged with the truck, not complete until the owner finishes it`,
    /^https:\/\/checkout\.stripe\.com\//.test(cs.url) && /^cs_test_/.test(cs.id) && csBack.truckId === T('GB') && csBack.complete === false, { url: cs.url.slice(0, 40), back: csBack })
  // The hosted invoice page ("Pay now" / "Pay {amount}") and the invoice PDF ("Download"), as Stripe serves them.
  const frInv = await proc.retrieveInvoice(fr.stripeInvoiceId)
  const page = frInv.hostedUrl ? await fetch(frInv.hostedUrl, { redirect: 'follow' }) : null
  t(`Pay now: the open invoice's hosted page answers ${page?.status} (invoice.stripe.com)`, !!page && page.status === 200 && /^https:\/\/invoice\.stripe\.com\//.test(frInv.hostedUrl), frInv.hostedUrl)
  const paidInv = await proc.retrieveInvoice(gbRow.stripeInvoiceId)
  const pdf = paidInv.pdfUrl ? await fetch(paidInv.pdfUrl, { redirect: 'follow' }) : null
  const pdfHead = pdf && pdf.status === 200 ? Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString('latin1') : ''
  t(`Download: the paid invoice's PDF answers ${pdf?.status} and is a PDF file ("${pdfHead}")`, !!pdf && pdf.status === 200 && pdfHead === '%PDF-', paidInv.pdfUrl)

  // Who retries? Stripe's own automatic attempt on our ONE-OFF invoices (auto_advance) — on a test clock, 2 hours and 5 days on.
  {
    const Stripe = require(path.join(REPO, 'node_modules/stripe'))
    const raw = new (Stripe.default || Stripe)(key)
    const wait = ms => new Promise(r => setTimeout(r, ms))
    const advance = async (clock, to) => { await raw.testHelpers.testClocks.advance(clock, { frozen_time: to }); for (let i = 0; i < 90; i++) { if ((await raw.testHelpers.testClocks.retrieve(clock)).status === 'ready') return; await wait(2000) } throw new Error('test clock stuck') }
    const t0 = Math.floor(Date.now() / 1000)
    const clock = await raw.testHelpers.testClocks.create({ frozen_time: t0, name: `billing-3 ${run}` })
    try {
      const c = await raw.customers.create({ name: `billing-3 retry check ${run}`, test_clock: clock.id, metadata: { hatchgrab: 'billing-3-harness' } })
      const pm = await raw.paymentMethods.attach('pm_card_chargeCustomerFail', { customer: c.id })
      const inv = await raw.invoices.create({ customer: c.id, currency: 'gbp', collection_method: 'charge_automatically', auto_advance: true, default_payment_method: pm.id, pending_invoice_items_behavior: 'exclude', payment_settings: { payment_method_types: ['card'] } })
      await raw.invoiceItems.create({ customer: c.id, invoice: inv.id, currency: 'gbp', amount: 2900, description: 'billing-3 retry check' })
      await raw.invoices.finalizeInvoice(inv.id, { auto_advance: true })
      await advance(clock.id, t0 + 2 * 3600)
      const r1 = await raw.invoices.retrieve(inv.id)
      await advance(clock.id, t0 + 5 * 86400)
      const r2 = await raw.invoices.retrieve(inv.id)
      t(`Smart Retries DO apply to our one-off invoices after Stripe's own attempt: attempts ${r1.attempt_count} → ${r2.attempt_count} in 5 days, next retry scheduled`,
        r1.attempt_count >= 1 && r2.attempt_count > r1.attempt_count && !!r2.next_payment_attempt, { r1: [r1.attempt_count, r1.next_payment_attempt], r2: [r2.attempt_count, r2.next_payment_attempt] })
    } finally { await raw.testHelpers.testClocks.del(clock.id).catch(() => {}) }
  }

  // …and after a FAILED MANUAL attempt (invoices.pay — what "Update card" does) Stripe schedules its next Smart Retry a few seconds
  // later, so the hourly run leaves it to Stripe. Only when Stripe has NO retry scheduled (Smart Retries switched off — simulated
  // here by turning automatic collection off on this one test invoice) does the hourly run retry it itself (engine.ts
  // retryUnpaidInvoices): once a truck-local day from 08:00, the day after the failure on.
  {
    const id = `${run}-ie`
    d.countryBilling.push({ countryCode: 'IE', paymentModel: 'fee_from_payment', postPaySurchargeBps: 0, postPaySurchargeFixedMinor: 0, minChargeMinor: 600, lateFeeMinor: 0 })
    d.countryFacts.push({ countryCode: 'IE', currency: 'EUR', locale: 'en-IE', platformFeeEnabled: false, platformFeeAllowed: true })
    for (const pl of ['payg', 'pro', 'unlimited']) { const fr2 = CATALOG.prices.find(x => x.planKey === pl && x.countryCode === 'FR'); CATALOG.prices.push({ ...fr2, countryCode: 'IE' }) }
    d.trucks.push({ id, name: 'billing-3 retry IE', slug: id, country: 'IE', currency: 'EUR', timezone: 'Europe/Dublin', plan: 'pro', trial_expires_at: null, is_customer: false, operator_id: `${run}-op` })
    d.truckBilling.push({ ...d.truckBilling.find(x => x.truckId === T('FR')), truckId: id, postPay: false, paymentMethodState: 'none', paymentMethodType: null, stripePaymentMethodId: null, paymentMethodLabel: null })
    await E.attachTestPaymentMethod(store, proc, CATALOG, { truckId: id, testToken: 'pm_card_chargeCustomerFail', now, by: 'harness' })
    const out = await E.runMonthly(store, proc, CATALOG, { truckId: id, period: '2026-11-01', now, by: 'harness' })
    const row = (await store.listInvoices(id))[0]
    const failedNow = await proc.payInvoice(row.stripeInvoiceId)
    await E.applyInvoiceUpdate(store, CATALOG, failedNow, now)
    let scheduled = null
    for (let i = 0; i < 15 && !scheduled; i++) { await new Promise(r => setTimeout(r, 2000)); scheduled = (await proc.retrieveInvoice(row.stripeInvoiceId)).nextPaymentAttempt }
    t(`IE: after a failed manual attempt Stripe schedules its own Smart Retry (next ${scheduled})`, out.outcome === 'invoiced' && failedNow.status === 'open' && !!scheduled, { failedNow, scheduled })
    const leaves = await E.retryUnpaidInvoices(store, proc, CATALOG, { truckId: id, now: new Date('2026-11-02T09:00:00Z'), by: 'harness' })
    t('IE: …so the hourly run leaves it to Stripe (waiting_for_stripe)', leaves[0]?.outcome === 'waiting_for_stripe', leaves)
    {
      const Stripe = require(path.join(REPO, 'node_modules/stripe'))
      const raw = new (Stripe.default || Stripe)(key)
      await raw.invoices.update(row.stripeInvoiceId, { auto_advance: false })   // simulate Smart Retries off: Stripe schedules nothing
    }
    t('IE: with Stripe retrying nothing (simulated), next_payment_attempt is null', (await proc.retrieveInvoice(row.stripeInvoiceId)).nextPaymentAttempt === null)
    const sameDay = await E.retryUnpaidInvoices(store, proc, CATALOG, { truckId: id, now: new Date('2026-11-01T20:00:00Z'), by: 'harness' })
    t('IE: the hourly run does not retry on the failure day itself', sameDay.every(x => x.outcome === 'not_due'), sameDay)
    const early = await E.retryUnpaidInvoices(store, proc, CATALOG, { truckId: id, now: new Date('2026-11-02T07:30:00Z'), by: 'harness' })
    t('IE: …nor before 08:00 the next day', early.every(x => x.outcome === 'not_due'), early)
    const stillDeclined = await E.retryUnpaidInvoices(store, proc, CATALOG, { truckId: id, now: new Date('2026-11-02T09:00:00Z'), by: 'harness' })
    t(`IE: 09:00 the next day → the hourly run retries it itself (${stillDeclined[0]?.status}; the card still declines)`, stillDeclined[0]?.outcome === 'retried' && stillDeclined[0]?.status === 'open', stillDeclined)
    const StripeC = require(path.join(REPO, 'node_modules/stripe'))
    const rawC = new (StripeC.default || StripeC)(key)
    const chargesOf = async () => (await rawC.charges.list({ customer: d.customers[0].stripeCustomerId, limit: 100 })).data.length
    const before = await chargesOf()
    const again = await E.retryUnpaidInvoices(store, proc, CATALOG, { truckId: id, now: new Date('2026-11-02T10:00:00Z'), by: 'harness' })
    const after = await chargesOf()
    t(`IE: a second run the same day replays the first (idempotency key per day): charge attempts at Stripe ${before} → ${after}`, again[0]?.outcome === 'retried' && after === before, { again, before, after })
    await E.attachTestPaymentMethod(store, proc, CATALOG, { truckId: id, testToken: 'pm_card_visa', now, by: 'harness' })
    const next = await E.retryUnpaidInvoices(store, proc, CATALOG, { truckId: id, now: new Date('2026-11-03T09:00:00Z'), by: 'harness' })
    const st = R.billingStatusOf(await E.billingContextFor(store, await store.truck(id), CATALOG, new Date('2026-11-03T09:00:00Z')))
    t(`IE: the next day, on a good card → paid, online ordering active (${next[0]?.status}, ${st?.status})`, next[0]?.outcome === 'retried' && next[0]?.status === 'paid' && st?.status === 'active', { next, st })
  }

  console.log(`\n${fail === 0 ? '✅' : '🔴'} billing-1 (Stripe test mode): ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})().catch(e => { console.error('🔴 crashed:', e.message); process.exit(1) })
