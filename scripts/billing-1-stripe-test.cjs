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
  const day5 = new Date(Date.parse(gb.dueAt) + 5 * 86_400_000)
  t('GB: paused on day 5', R.billingStatusOf(await E.billingContextFor(store, await store.truck(T('GB')), CATALOG, day5)).status === 'paused')
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
  const again = await proc.createInvoice({ customerId: d.customers[0].stripeCustomerId, truckId: T('FR'), period: '2026-11-01', currency: 'EUR', idempotencyBase: E.chargeKeyOf(frCharge),
    lines: [{ key: 'plan', amountMinor: 2900, description: 'x' }], paymentMethodId: (await store.truckBilling(T('FR'))).stripePaymentMethodId, paymentMethodType: 'card', description: 'x' })
  t('FR: the same month again → Stripe replays the SAME invoice (idempotency key)', again.id === fr.stripeInvoiceId, { first: fr.stripeInvoiceId, again: again.id })

  // Pix Automático: a SetupIntent with a monthly mandate in BRL (confirming it needs the payer's bank app).
  try {
    const s = await E.startPaymentMethodSetup(store, proc, CATALOG, { truckId: T('BR'), type: 'pix', now, by: 'harness' })
    t(`BR: a Pix Automático SetupIntent is created (${s.setupIntentId})`, /^seti_/.test(s.setupIntentId))
  } catch (e) {
    t('BR: a Pix Automático SetupIntent is created', false, `Stripe refused: ${e.message} — see the report's hand steps (enable Pix in Settings › Payment methods)`)
  }

  console.log(`\n${fail === 0 ? '✅' : '🔴'} billing-1 (Stripe test mode): ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})().catch(e => { console.error('🔴 crashed:', e.message); process.exit(1) })
