#!/usr/bin/env node
// scripts/billing-2.cjs — billing-2 (11 November 2026, docs/billing-2-report.md): the Billing screens' data, the notices, the email
// schedule and the words, built switched off. NO NETWORK, NO DATABASE, NEVER A LIVE TRUCK: the REAL lib/billing view, email schedule,
// composer, email run and screen loader over the in-memory store (lib/billing/memory-store.ts) and a fake Mailer.
//   1 · the 5-full-day rule: month ends, the year end, three time zones, the pause instant to the millisecond, paying clears it
//   2 · suspend_warning_date = the pause date + 6      3 · the email schedule, hour by hour: which email, which day, stops on payment
//   4 · the notices: A–E, one at a time, most urgent first       5 · the plan-change wording (up / down)
//   6 · the wording rule in every locale (no walk-up / kitchen-screen "keeps working" line)   7 · every locale: the words exist
//   8 · switch off (and not a billing_test truck) = nothing shown, nothing sent      9 · the live paths and the screens (constructs)
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '..')
const kit = require('./_render-kit.cjs')({ cacheTag: 'billing-2' })

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
const PRICES = []
for (const cc of ['GB', 'JP', 'US']) PRICES.push(price('payg', cc, 0, 0, 99), price('pro', cc, cc === 'JP' ? 1980 : 2900, cc === 'JP' ? 250000 : 400000, 99), price('unlimited', cc, cc === 'JP' ? 2980 : 6900, null, 0))
PRICES.push(price('payg', 'BR', 0, 0, 99, { offered: false }), price('pro', 'BR', 5900, 800000, 99, { offered: false }), price('unlimited', 'BR', 14900, null, 0, { trialEnd: true }))
const CATALOG = { plans: PLANS, prices: PRICES, features: [] }

;(async () => {
  const B = await kit.bundle('billing-2', [
    "export * as R from '@/lib/billing/rules'", "export * as V from '@/lib/billing/view'", "export * as E from '@/lib/billing/engine'",
    "export * as S from '@/lib/billing/memory-store'", "export * as M from '@/lib/billing/emails'", "export * as N from '@/lib/billing/notify'",
    "export * as SS from '@/lib/billing/screen-server'", "export * as G from '@/lib/billing/gate'",
  ].join('\n'), { stubs: { '@/lib/billing/store': 'export async function serverBillingStore() { if (!globalThis.__billingStore) throw new Error("no store"); return globalThis.__billingStore }' } })
  const { R, V, E, S, M, N, SS, G } = B

  function world({ on = true, test = true } = {}) {
    const d = S.emptyMemoryData()
    d.switches = { enabled: on, pauseAfterDays: 5, suspendWarningDays: 6 }
    d.countryFacts = [
      { countryCode: 'GB', currency: 'GBP', locale: 'en-GB', platformFeeEnabled: false, platformFeeAllowed: true },
      { countryCode: 'JP', currency: 'JPY', locale: 'ja-JP', platformFeeEnabled: false, platformFeeAllowed: true },
      { countryCode: 'US', currency: 'USD', locale: 'en-US', platformFeeEnabled: false, platformFeeAllowed: true },
      { countryCode: 'BR', currency: 'BRL', locale: 'pt-BR', platformFeeEnabled: false, platformFeeAllowed: false },
    ]
    const cb = (countryCode, paymentModel, minChargeMinor) => ({ countryCode, paymentModel, postPaySurchargeBps: 0, postPaySurchargeFixedMinor: 0, minChargeMinor, lateFeeMinor: 0, updatedAt: 'x' })
    d.countryBilling = [cb('GB', 'fee_from_payment', 500), cb('JP', 'fee_from_payment', 1000), cb('US', 'fee_from_payment', 700), cb('BR', 'billed_online', 3500)]
    const TZ = { GB: 'Europe/London', JP: 'Asia/Tokyo', US: 'America/Los_Angeles', BR: 'America/Sao_Paulo' }
    const CUR = { GB: 'GBP', JP: 'JPY', US: 'USD', BR: 'BRL' }
    const truck = (id, country, planKey, trialEnd, tb = {}) => {
      d.trucks.push({ id, name: `Truck ${id}`, slug: id, country, currency: CUR[country], timezone: TZ[country], plan: planKey, trial_expires_at: trialEnd, is_customer: false, operator_id: `op-${id}` })
      d.operators.push({ id: `op-${id}`, email: `${id}@example.test`, name: `Sam ${id}`, firstName: 'Sam' })
      d.truckBilling.push({ truckId: id, postPay: false, billingTest: test, paymentMethodState: 'none', paymentMethodType: null, stripePaymentMethodId: null, stripeSetupIntentId: null,
        paymentMethodLabel: null, paymentMethodUpdatedAt: null, paymentMethodLivemode: null, status: null, statusReason: null, statusChangedAt: null, pendingPlanKey: null, pendingPlanFrom: null, ...tb })
    }
    truck('gb', 'GB', 'pro', null, { paymentMethodState: 'valid', paymentMethodType: 'card', stripePaymentMethodId: 'pm_1', paymentMethodLabel: 'visa •••• 4242' })
    truck('jp', 'JP', 'pro', null, { paymentMethodState: 'valid', paymentMethodType: 'card', stripePaymentMethodId: 'pm_2', paymentMethodLabel: 'jcb •••• 0005' })
    truck('us', 'US', 'pro', null, { paymentMethodState: 'valid', paymentMethodType: 'card', stripePaymentMethodId: 'pm_3', paymentMethodLabel: 'mastercard •••• 4444' })
    truck('br', 'BR', 'unlimited', null, { paymentMethodState: 'valid', paymentMethodType: 'pix', stripePaymentMethodId: 'pm_4', paymentMethodLabel: 'Pix Automático' })
    truck('trial', 'GB', 'trial', '2027-01-31T23:59:59.000Z')   // 31 Jan 2027 23:59:59 London (GMT)
    return d
  }
  let invSeq = 0
  const failedInvoice = (d, truckId, firstFailedAt, amountMinor = 2900, o = {}) => {
    const id = `inv-${++invSeq}`
    d.charges.push({ id: `c-${id}`, truckId, period: '2027-01-01', kind: 'monthly', ref: '', currency: 'GBP', planKey: 'pro', fromPlanKey: null, planMinor: amountMinor, planDays: 31, periodDays: 31,
      vansMinor: 0, usagePeriod: '2026-12-01', usageFeeMinor: 0, surchargeMinor: 0, carriedInMinor: 0, amountDueMinor: amountMinor, chargedMinor: amountMinor, carriedOutMinor: 0, carriedInto: null,
      minChargeMinor: 500, state: 'invoiced', inputsDigest: 'x', computedAt: firstFailedAt })
    d.invoices.push({ id, chargeId: `c-${id}`, truckId, period: '2027-01-01', currency: 'GBP', amountMinor, livemode: false, stripeInvoiceId: `in_${id}`, status: 'failed', dueAt: firstFailedAt,
      attemptCount: 1, lastError: 'declined', hostedInvoiceUrl: `https://pay.example/${id}`, createdAt: firstFailedAt, finalizedAt: firstFailedAt, paidAt: null, lateFeeMinor: null,
      replacedStripeInvoiceId: null, firstFailedAt, invoicePdfUrl: `https://pay.example/${id}.pdf`, ...o })
    return id
  }
  const screen = async (d, truckId, nowIso) => {
    const store = S.memoryBillingStore(d)
    return SS.loadBillingScreen(store, CATALOG, truckId, new Date(nowIso))
  }
  const ctxOf = async (d, truckId, nowIso) => E.billingContextFor(S.memoryBillingStore(d), d.trucks.find(x => x.id === truckId), CATALOG, new Date(nowIso), { forceSwitch: true })

  // ══ 1 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · the 5-full-day rule: the failure day, then 5 full days; paused from 00:00 truck time on the 7th day')
  {
    const tl = R.failureTimeline('2027-01-01T10:00:00Z', 'Europe/London', 5, 6)
    t('fails 1 Jan → last day to pay 6 Jan → paused from 00:00 on 7 Jan (London)', tl.failDay === '2027-01-01' && tl.lastDay === '2027-01-06' && tl.pauseDay === '2027-01-07' && tl.pauseAt === '2027-01-07T00:00:00.000Z', tl)
    const feb = R.failureTimeline('2027-02-28T09:00:00Z', 'Europe/London', 5, 6)
    t('across a month end: fails 28 Feb 2027 → last day 5 Mar → paused 6 Mar', feb.lastDay === '2027-03-05' && feb.pauseDay === '2027-03-06', feb)
    const leap = R.failureTimeline('2028-02-27T09:00:00Z', 'Europe/London', 5, 6)
    t('a leap year: fails 27 Feb 2028 → last day 3 Mar (29 Feb counted)', leap.lastDay === '2028-03-03', leap)
    const ye = R.failureTimeline('2026-12-29T09:00:00Z', 'Europe/London', 5, 6)
    t('across the year end: fails 29 Dec 2026 → last day 3 Jan 2027 → paused 4 Jan', ye.lastDay === '2027-01-03' && ye.pauseDay === '2027-01-04', ye)
    const at = '2026-11-30T23:30:00Z'
    const lon = R.failureTimeline(at, 'Europe/London', 5, 6), tok = R.failureTimeline(at, 'Asia/Tokyo', 5, 6), la = R.failureTimeline(at, 'America/Los_Angeles', 5, 6)
    t('the same instant is a different failure day by zone: London 30 Nov, Tokyo 1 Dec, Los Angeles 30 Nov', lon.failDay === '2026-11-30' && tok.failDay === '2026-12-01' && la.failDay === '2026-11-30', [lon.failDay, tok.failDay, la.failDay])
    t('…and the pause is 00:00 in each zone: London 6 Dec 00:00Z, Tokyo 7 Dec 00:00 JST (= 6 Dec 15:00Z), Los Angeles 6 Dec 00:00 PST (= 08:00Z)',
      lon.pauseAt === '2026-12-06T00:00:00.000Z' && tok.pauseAt === '2026-12-06T15:00:00.000Z' && la.pauseAt === '2026-12-06T08:00:00.000Z', [lon.pauseAt, tok.pauseAt, la.pauseAt])
    const summer = R.failureTimeline('2027-06-10T09:00:00Z', 'Europe/London', 5, 6)
    t('in British Summer Time the pause is 00:00 BST (23:00Z the day before)', summer.pauseAt === '2027-06-15T23:00:00.000Z', summer.pauseAt)
    const d = world(); failedInvoice(d, 'gb', '2027-01-01T10:00:00Z')
    t('1 ms before the pause instant: past due', R.billingStatusOf(await ctxOf(d, 'gb', '2027-01-06T23:59:59.999Z')).status === 'past_due')
    t('at the pause instant: paused (unpaid)', J(R.billingStatusOf(await ctxOf(d, 'gb', '2027-01-07T00:00:00.000Z'))) === J({ status: 'paused', reason: 'unpaid' }))
    const dj = world(); failedInvoice(dj, 'jp', '2026-11-30T23:30:00Z')
    t('Tokyo: paused at 00:00 JST on 7 Dec, not before', R.billingStatusOf(await ctxOf(dj, 'jp', '2026-12-06T14:59:59Z')).status === 'past_due' && R.billingStatusOf(await ctxOf(dj, 'jp', '2026-12-06T15:00:00Z')).status === 'paused')
    const dn = world(); dn.invoices.push({ ...dn.invoices[0], id: 'not-yet', status: 'open', attemptCount: 0, firstFailedAt: null, chargeId: 'none', truckId: 'gb' })
    t('an invoice not yet attempted is just being collected (active)', R.billingStatusOf(await ctxOf(dn, 'gb', '2027-01-20T00:00:00Z')).status === 'active')
    const dp = world(); const id = failedInvoice(dp, 'gb', '2027-01-01T10:00:00Z'); dp.invoices.find(i => i.id === id).status = 'paid'
    t('paying clears it at once: active, no notice, no email due', R.billingStatusOf(await ctxOf(dp, 'gb', '2027-01-08T00:00:00Z')).status === 'active'
      && (await screen(dp, 'gb', '2027-01-08T00:00:00Z')).view.notice === null
      && V.emailsDue({ view: (await screen(dp, 'gb', '2027-01-08T09:00:00Z')).view, ctx: await ctxOf(dp, 'gb', '2027-01-08T09:00:00Z'), invoices: dp.invoices, sent: [] }).length === 0)
    const eng = read('lib/billing/engine.ts')
    t('the late fee is applied at the same pause instant (engine construct)', /if \(a\.now\.getTime\(\) < Date\.parse\(failureTimeline\(inv\.firstFailedAt, tzOf\(truck\), ctx\.pauseAfterDays, ctx\.suspendWarningDays\)\.pauseAt\)\) continue/.test(strip(eng)))
    t('the first failure is stamped once, never moved by a retry', /\.\.\.\(status === 'failed' && !row\.firstFailedAt \? \{ firstFailedAt: now\.toISOString\(\) \} : \{\}\)/.test(strip(eng)))
  }

  // ══ 2 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · suspend_warning_date = the pause date + 6 days (wording only; nothing locks)')
  {
    t('paused 7 Jan → "pay by 13 January"', R.failureTimeline('2027-01-01T10:00:00Z', 'Europe/London', 5, 6).suspendWarningDate === '2027-01-13')
    const d = world(); failedInvoice(d, 'gb', '2027-01-01T10:00:00Z')
    const v = (await screen(d, 'gb', '2027-01-07T08:00:00Z')).view
    t('the screen data carries it (failure.suspendWarningDate, notice E)', v.failure.suspendWarningDate === '2027-01-13' && v.notice.kind === 'paused' && v.notice.suspendWarningDate === '2027-01-13', v.failure)
    t('no lock: no billing file suspends anything (no "suspend" in any code path)', !fs.readdirSync(path.join(REPO, 'lib/billing')).some(f => /suspended?\s*[:=(]|lockAccount|suspendAccount/.test(strip(read(`lib/billing/${f}`)).replace(/suspendWarning\w*/g, ''))))
  }

  // ══ 3 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · the email schedule — a dry run, hour by hour, from the failure to after the pause')
  {
    const run = async (payAt) => {
      const d = world(); const id = failedInvoice(d, 'gb', '2027-01-01T10:00:00Z')
      const store = S.memoryBillingStore(d)
      const sent = []
      const mailer = { async send(e) { sent.push({ at: globalThis.__clock, subject: e.subject, to: e.to }); return { ok: true, id: `m${sent.length}` } } }
      for (let h = 10; h <= 24 * 9; h++) {
        const now = new Date(Date.parse('2027-01-01T00:00:00Z') + h * 3600_000)
        if (payAt && now.toISOString() === payAt) d.invoices.find(i => i.id === id).status = 'paid'
        globalThis.__clock = now.toISOString()
        await N.runBillingEmails(store, mailer, CATALOG, { truckId: 'gb', now, base: 'https://hatchgrab.example' })
      }
      return sent
    }
    const all = await run(null)
    t('five emails, each once, on its day: failed (1 Jan, at once) · 2 days left (4 Jan) · tomorrow (5 Jan) · last day (6 Jan) · paused (7 Jan)',
      J(all.map(e => [e.at.slice(0, 13), e.subject])) === J([
        ['2027-01-01T10', 'Your HatchGrab payment didn’t go through'], ['2027-01-04T08', '2 days left to update your card'],
        ['2027-01-05T08', 'Update your card by tomorrow'], ['2027-01-06T08', 'Last day to update your card'], ['2027-01-07T08', 'Online ordering is paused'],
      ]), all.map(e => [e.at, e.subject]))
    t('to the truck owner\'s address', all.every(e => e.to === 'gb@example.test'))
    const paidMidway = await run('2027-01-05T10:00:00.000Z')
    t('paid on 5 Jan at 10:00 → nothing after it (no last-day or paused email)', J(paidMidway.map(e => e.subject)) === J(['Your HatchGrab payment didn’t go through', '2 days left to update your card', 'Update your card by tomorrow']), paidMidway.map(e => e.subject))
    // The trial emails
    const d = world(); const store = S.memoryBillingStore(d); const sent = []
    const mailer = { async send(e) { sent.push({ at: globalThis.__clock, subject: e.subject }); return { ok: true, id: null } } }
    for (let h = 0; h <= 24 * 40; h += 1) {
      const now = new Date(Date.parse('2027-01-01T00:00:00Z') + h * 3600_000); globalThis.__clock = now.toISOString()
      await N.runBillingEmails(store, mailer, CATALOG, { truckId: 'trial', now, base: 'https://hatchgrab.example' })
    }
    t('trial (ends 31 Jan, no card): "ends in 7 days" on 24 Jan 08:00 and "ends tomorrow" on 30 Jan 08:00 — once each', J(sent.map(e => [e.at.slice(0, 13), e.subject])) === J([['2027-01-24T08', 'Your free trial ends in 7 days'], ['2027-01-30T08', 'Your free trial ends tomorrow']]), sent)
    const d2 = world(); d2.truckBilling.find(x => x.truckId === 'trial').paymentMethodState = 'valid'; d2.truckBilling.find(x => x.truckId === 'trial').stripePaymentMethodId = 'pm_9'
    const s2 = S.memoryBillingStore(d2); const sent2 = []
    const m2 = { async send(e) { sent2.push(e); return { ok: true, id: null } } }
    for (const iso of ['2027-01-24T09:00:00Z', '2027-01-30T09:00:00Z']) await N.runBillingEmails(s2, m2, CATALOG, { truckId: 'trial', now: new Date(iso), base: 'https://x' })
    t('with a card on file: no "7 days" email; the "tomorrow" email says "You’re all set"', sent2.length === 1 && /You’re all set: Pay as you go starts on 1 February\./.test(sent2[0].text), sent2.map(e => e.text))
    const failingMailer = { async send() { return { ok: false, id: null } } }
    const d3 = world(); failedInvoice(d3, 'gb', '2027-01-01T10:00:00Z'); const s3 = S.memoryBillingStore(d3)
    const r1 = await N.runBillingEmails(s3, failingMailer, CATALOG, { truckId: 'gb', now: new Date('2027-01-01T11:00:00Z'), base: 'https://x' })
    const r2 = await N.runBillingEmails(s3, failingMailer, CATALOG, { truckId: 'gb', now: new Date('2027-01-01T12:00:00Z'), base: 'https://x' })
    t('a failed send is reported and NEVER repeated (the claim stays)', r1[0].outcome === 'failed' && r2.length === 0, [r1, r2])
  }

  // ══ 4 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · the notices: one at a time, most urgent first')
  {
    const n = async (d, truckId, iso) => (await screen(d, truckId, iso)).view.notice
    const d = world()
    t('trial ends in 8 days: no notice', (await n(d, 'trial', '2027-01-23T12:00:00Z')) === null)
    const a = await n(d, 'trial', '2027-01-24T12:00:00Z')
    t('A — 7 days, no card: trial_ends_soon (31 Jan), dismissible', a.kind === 'trial_ends_soon' && a.date === '2027-01-31' && a.dismissible === true, a)
    t('A — still on 29 Jan (2 days)', (await n(d, 'trial', '2027-01-29T12:00:00Z')).kind === 'trial_ends_soon')
    const b = await n(d, 'trial', '2027-01-30T12:00:00Z')
    t('B — tomorrow, no card: trial_ends_tomorrow, NOT dismissible', b.kind === 'trial_ends_tomorrow' && b.dismissible === false, b)
    const dc = world(); Object.assign(dc.truckBilling.find(x => x.truckId === 'trial'), { paymentMethodState: 'valid', stripePaymentMethodId: 'pm_9', paymentMethodType: 'card' })
    const c = await n(dc, 'trial', '2027-01-30T12:00:00Z')
    t('C — trial ending, card added: all_set — Pay as you go starts on 1 Feb, dismissible (green)', c.kind === 'all_set' && c.planKey === 'payg' && c.date === '2027-02-01' && c.dismissible, c)
    const dd = world(); failedInvoice(dd, 'gb', '2027-01-01T10:00:00Z')
    const nd = await n(dd, 'gb', '2027-01-03T12:00:00Z')
    t('D — payment failed: payment_failed, update by 6 Jan, card', nd.kind === 'payment_failed' && nd.lastDay === '2027-01-06' && nd.method === 'card', nd)
    const ne = await n(dd, 'gb', '2027-01-07T00:00:00Z')
    t('E — paused: paused, £29.00 by 13 Jan', ne.kind === 'paused' && ne.amountMinor === 2900 && ne.suspendWarningDate === '2027-01-13', ne)
    const db = world(); const ib = failedInvoice(db, 'br', '2027-01-01T10:00:00Z', 14900); void ib
    t('Brazil with Pix: "payment method", not "card" (D)', (await n(db, 'br', '2027-01-02T12:00:00Z')).method === 'payment_method')
    t('one at a time: E wins over D (two failed invoices, one past its pause)', await (async () => {
      const dx = world(); failedInvoice(dx, 'gb', '2027-01-01T10:00:00Z'); failedInvoice(dx, 'gb', '2027-01-05T10:00:00Z')
      return (await n(dx, 'gb', '2027-01-07T12:00:00Z')).kind === 'paused'
    })())
    t('nothing to say: no notice (a paying truck with a card, nothing failed)', (await n(world(), 'gb', '2027-01-07T12:00:00Z')) === null)
    const src = strip(read('app/(app)/manage/[token]/page.tsx'))
    t('every Manage tab except Billing; links open Manage › Billing', /\{billingNotice && activeTab !== 'billing' && <BillingNoticeStrip notice=\{billingNotice\} onOpen=\{\(\) => setActiveTab\('billing'\)\} \/>\}/.test(src))
    t('the truck owner only — the route answers { visible: false } to crew (construct)', /if \(access\.role !== 'owner'\) return json\(\{ visible: false \}\)/.test(strip(read('app/api/manage/billing/route.ts'))))
    t('never the kitchen screen: the KDS imports nothing of billing', !/billing/i.test(read('app/(app)/dashboard/[token]/kds/page.tsx').match(/^import .*$/gm).join('\n')))
  }

  // ══ 5 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · the plan-change wording (up / down), from the same rule the engine charges by')
  {
    const tr = (await kit.bundle('billing-2-t', "export { translatorFor } from '@/lib/i18n/translator'\nimport '@/lib/i18n/catalog/billing'")).translatorFor
    const tb = tr('en-GB', 'billing')
    const d = world(); d.trucks.find(x => x.id === 'gb').plan = 'payg'
    const loaded = await screen(d, 'gb', '2026-11-11T12:00:00Z')
    const up = V.planChangePreview({ ...loaded.input, toPlanKey: 'pro' })
    t('up (Pay as you go → Pro on 11 Nov): £19.33 today for 20 of 30 days', up.direction === 'up' && up.amountMinor === 1933 && up.month === '2026-11-01' && up.nextFirst === '2026-12-01', up)
    t('"We’ll charge £19.33 today for the rest of November. Then £29 on 1 December."',
      tb('changePlan.chargeToday', { amount: '£19.33', month: 'November', price: '£29', nextFirst: '1 December' }) === 'We’ll charge £19.33 today for the rest of November. Then £29 on 1 December.')
    const d2 = world()
    const l2 = await screen(d2, 'gb', '2026-11-11T12:00:00Z')
    const down = V.planChangePreview({ ...l2.input, toPlanKey: 'payg' })
    t('down (Pro → Pay as you go): from 1 December, nothing charged', down.direction === 'down' && down.amountMinor === 0 && down.nextFirst === '2026-12-01', down)
    t('"Starts on 1 December. You keep Pro until then."', tb('changePlan.startsLater', { nextFirst: '1 December', plan: 'Pro' }) === 'Starts on 1 December. You keep Pro until then.')
    const up2 = V.planChangePreview({ ...l2.input, toPlanKey: 'unlimited' })
    const trialInput = (await screen(world(), 'trial', '2027-01-10T12:00:00Z')).input
    t('up from Pro to Unlimited: only the difference (£40 × 20/30 = £26.66)', up2.direction === 'up' && up2.amountMinor === 2666, up2)
    // ⚠️ RE-PINNED (billing-3 item 5): the button IS offered during the trial now; the preview says the plan starts at the trial's end.
    t('the trial: in_trial — starts when the trial ends, nothing charged now', (() => { const pv = V.planChangePreview({ ...trialInput, toPlanKey: 'pro' }); return pv.direction === 'in_trial' && pv.amountMinor === 0 && typeof pv.trialEndDate === 'string' })())
    t('the modal\'s title, line and buttons', tb('changePlan.title') === 'Change plan' && tb('changePlan.current', { plan: 'Pro' }) === 'You’re on Pro.' && tb('changePlan.switchTo', { plan: 'Unlimited' }) === 'Switch to Unlimited' && tb('changePlan.cancel') === 'Cancel')
  }

  // ══ 6 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('6 · the wording rule: no billing screen, notice or email says walk-ups or the kitchen screen keep working — every locale')
  {
    const en = JSON.parse(read('messages/en-GB.json'))
    const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, `${p}${k}.`) : [[`${p}${k}`, String(v)]]))
    const enKeys = [...flat(en.billing, 'billing.'), ...flat(en.emailBilling, 'emailBilling.')]
    t('en-GB: no "keep(s) working", "still work", "kitchen screen" in any billing or email string', !enKeys.some(([, v]) => /keeps? working|still works?|carry on working|kitchen screen|kitchen display/i.test(v)), enKeys.filter(([, v]) => /working|kitchen/i.test(v)))
    t('en-GB: walk-ups appear only as "Walk-up orders — Free" and "Walk-up orders are always free."', enKeys.filter(([, v]) => /walk-up/i.test(v)).map(([k]) => k).join() === 'billing.tab.whatYouPay.walkUps,billing.tab.next.walkUps')
    const bases = ['fr-FR', 'de-DE', 'es-ES', 'it-IT', 'pt-PT', 'nl-NL', 'sv-SE', 'da-DK', 'nb-NO', 'pl-PL', 'cs-CZ', 'hu-HU', 'sk-SK', 'ro-RO', 'hr-HR', 'sl-SI', 'fi-FI', 'et-EE', 'lv-LV', 'lt-LT', 'el-GR', 'bg-BG',
      'pt-BR', 'ms-MY', 'ja-JP', 'zh-HK', 'th-TH', 'ar-AE', 'id-ID', 'vi-VN', 'is-IS', 'sr-RS', 'tr-TR', 'ko-KR', 'zh-TW', 'he-IL']
    const sameKeys = [], walkLeak = [], extra = []
    for (const loc of bases) {
      const m = JSON.parse(read(`messages/${loc}.json`))
      const keys = [...flat(m.billing || {}, 'billing.'), ...flat(m.emailBilling || {}, 'emailBilling.')]
      if (J(keys.map(([k]) => k)) !== J(enKeys.map(([k]) => k))) sameKeys.push(loc)
      // The locale's own word for walk-up orders (its "Walk-up orders" row) appears nowhere else in its billing copy.
      const walk = (m.billing?.tab?.whatYouPay?.walkUps || '').trim()
      if (walk && keys.some(([k, v]) => !/walkUps$/.test(k) && v.toLowerCase().includes(walk.toLowerCase()))) walkLeak.push(loc)
      // …and its kitchen-screen word (dashboard / KDS names already in the file) appears in none of it.
      const kds = [m.manageShell?.tabs?.kds, m.kds?.title].filter(x => typeof x === 'string' && x.length > 3)
      if (kds.some(w => keys.some(([, v]) => v.includes(w)))) extra.push(loc)
    }
    t(`all ${bases.length} language bases carry exactly en-GB's billing keys — no extra line in any of them`, sameKeys.length === 0, sameKeys)
    t('in every base, the walk-up words appear only in the two "free" lines', walkLeak.length === 0, walkLeak)
    t('in every base, no billing string names the kitchen screen', extra.length === 0, extra)
    const drafts = read('docs/billing-1-report.md')
    t('billing-1\'s drafts are superseded here (the new report carries the emails; nothing published)', fs.existsSync(path.join(REPO, 'lib/billing/emails.ts')) && typeof drafts === 'string')
  }

  // ══ 7 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('7 · the words: en-GB exactly as asked; every locale composes every email; right to left stays clean')
  {
    const ctx = locale => ({ locale, timeZone: 'Europe/London', money: { currency: 'GBP', locale }, truckName: 'Pizza Kitchen', firstName: 'Sam', billingUrl: 'https://hatchgrab.example/manage?tab=billing', planName: M.planNameIn(locale, CATALOG) })
    const due = (kind, method = 'card') => ({ kind, ref: 'r', params: { amountMinor: 2900, lastDay: '2027-01-06', suspendWarningDate: '2027-01-13', method, payUrl: 'https://pay.example/x',
      trialEnd: '2027-01-31', planKey: 'pro', monthlyMinor: 2900, feeBps: 99, restAmountMinor: 0, restMonth: '2027-01-01', nextFirst: '2027-02-01', hasPaymentMethod: false } })
    const e1 = M.composeBillingEmail(due('payment_failed'), ctx('en-GB'), 'a@b')
    t('email 1 (en-GB): subject, greeting, the two lines, Update card, sign-off', e1.subject === 'Your HatchGrab payment didn’t go through'
      && e1.text === 'Hi Sam,\n\nWe couldn’t take £29.00 for Pizza Kitchen today. We’ll try again.\nPlease update your card by 6 January to keep online ordering on. If it stays unpaid, your account may be suspended.\n\nUpdate card: https://hatchgrab.example/manage?tab=billing\n\nQuestions? Just reply.\nThe HatchGrab team', e1.text)
    const e5 = M.composeBillingEmail(due('paused'), ctx('en-GB'), 'a@b')
    t('email 5 (pause day): the suspension date and "Pay now" to the hosted invoice', /Online ordering for Pizza Kitchen is paused because £29\.00 is unpaid\. Pay now and it comes straight back on\. Pay by 13 January or your account may be suspended\./.test(e5.text) && /Pay now: https:\/\/pay\.example\/x/.test(e5.text), e5.text)
    const e4 = M.composeBillingEmail(due('last_day'), ctx('en-GB'), 'a@b')
    t('email 4: "Today is the last day … at midnight …"', /Today is the last day to pay £29\.00 for Pizza Kitchen\. If it’s still unpaid at midnight, online ordering pauses until you pay\. If it stays unpaid, your account may be suspended\./.test(e4.text))
    const pix = M.composeBillingEmail(due('two_days_left', 'payment_method'), ctx('en-GB'), 'a@b')
    t('Brazil with Pix: "payment method" in the subject, the line and the button', pix.subject === '2 days left to update your payment method' && /Update your payment method by 6 January/.test(pix.text) && /Update payment method: /.test(pix.text), pix.text)
    const locales = ['fr-FR', 'de-DE', 'es-ES', 'pt-BR', 'ja-JP', 'ar-AE', 'he-IL', 'zh-TW', 'ko-KR', 'tr-TR', 'en-US', 'es-MX']
    const kinds = ['payment_failed', 'two_days_left', 'one_day_left', 'last_day', 'paused', 'trial_7_days', 'trial_1_day']
    const broken = []
    for (const loc of locales) for (const k of kinds) {
      const e = M.composeBillingEmail(due(k), ctx(loc), 'a@b')
      if (/emailBilling\.|\{[a-zA-Z]+\}/.test(e.text + e.subject) || (loc !== 'en-US' && loc !== 'es-MX' && e.subject === M.composeBillingEmail(due(k), ctx('en-GB'), 'a@b').subject)) broken.push(`${loc}:${k}`)
    }
    t(`${locales.length} locales × 7 emails: every one composed in its own language (no key, no raw placeholder, not English)`, broken.length === 0, broken)
    const rtl = ['ar-AE', 'he-IL'].map(l => M.composeBillingEmail(due('paused'), ctx(l), 'a@b').text)
    const rtlWords = ['ar-AE', 'he-IL'].map(l => { const m = JSON.parse(read(`messages/${l}.json`)); return JSON.stringify([m.billing, m.emailBilling]) })
    // (A formatted AMOUNT carries Intl's own right-to-left mark; the rule is about the words, which are checked here.)
    t('Arabic and Hebrew: the emails in their own script; the billing words carry no bidi control characters',
      /[\u0600-\u06FF]/.test(rtl[0]) && /[\u0590-\u05FF]/.test(rtl[1]) && !/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/.test(rtlWords.join('')))
    const us = M.composeBillingEmail(due('payment_failed'), { ...ctx('en-US'), money: { currency: 'USD', locale: 'en-US' } }, 'a@b')
    t('en-US: "card" and "$" forms', /We couldn’t take \$29\.00 /.test(us.text) && /update your card/.test(us.text), us.text)
    t('sender: hello@hatchgrab.com through Brevo (the house sender)', /HATCHGRAB_SENDER\.email/.test(read('lib/billing/mailer.ts')) && /api\.brevo\.com\/v3\/smtp\/email/.test(read('lib/billing/mailer.ts')))
  }

  // ══ 8 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('8 · switch off (and not a billing_test truck): nothing shown, nothing sent')
  {
    const d = world({ on: false, test: false }); failedInvoice(d, 'gb', '2027-01-01T10:00:00Z')
    t('the Billing screen: { visible: false } (today\'s tab renders)', (await screen(d, 'gb', '2027-01-07T12:00:00Z')).visible === false)
    const store = S.memoryBillingStore(d); const sent = []
    const r = await N.runBillingEmails(store, { async send(e) { sent.push(e); return { ok: true, id: null } } }, CATALOG, { truckId: 'gb', now: new Date('2027-01-07T12:00:00Z'), base: 'https://x' })
    t('no email is due or sent, and nothing written', r.length === 0 && sent.length === 0 && d.writes.length === 0, { r, writes: d.writes })
    const dt = world({ on: false, test: true }); failedInvoice(dt, 'gb', '2027-01-01T10:00:00Z')
    t('a billing_test truck with the switch off: shown (for testing)', (await screen(dt, 'gb', '2027-01-07T12:00:00Z')).visible === true)
    globalThis.__billingStore = S.memoryBillingStore(dt); G.__resetBillingSwitchCache()
    t('…but the live gate stays switch-only: nothing is paused and card payment stays allowed for it', J(await G.billingGateForTruck({ id: 'gb' }, CATALOG, new Date('2027-01-07T12:00:00Z'))) === J(G.BILLING_GATE_OFF))
    const cron = strip(read('app/api/cron/billing/route.ts'))
    t('the cron sends emails only after the switch check (switch off → returns before any email)', cron.indexOf("skipped: 'switch_off'") > 0 && cron.indexOf("skipped: 'switch_off'") < cron.indexOf('runBillingEmails('))
    const dpp = world(); dpp.truckBilling.find(x => x.truckId === 'gb').postPay = true
    globalThis.__billingStore = S.memoryBillingStore(dpp); G.__resetBillingSwitchCache()
    t('billing on + post-pay ("At the truck, when they collect"): no card payment online', (await G.billingGateForTruck({ id: 'gb' }, CATALOG, new Date('2026-11-11T12:00:00Z'))).cardPaymentsAllowed === false)
  }

  // ══ 9 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('9 · the live paths and the screens (constructs)')
  {
    const page = strip(read('app/(app)/manage/[token]/page.tsx'))
    t('Manage › Billing renders the new screen ONLY when the server says visible; otherwise today\'s tab', /if \(billingScreen\.state\.status === 'visible'\) \{\s*return \(/.test(page))
    t('the "Compare plans" table stays below the new screen (the same block today\'s tab renders)', /<BillingScreen token=\{token\} view=\{billingScreen\.state\.view\} setView=\{billingScreen\.setView\} \/>\s*\{compareBlock\}/.test(page) && (page.match(/\{compareBlock\}/g) || []).length === 2)
    const bs = strip(read('components/manage/BillingScreen.tsx'))
    t('iOS (3.1.1): every add-card / pay / change-plan action is behind purchaseCtaAllowed(); notices are not shown there', (bs.match(/\{cta && /g) || []).length >= 8 && /if \(dismissed \|\| !purchaseCtaAllowed\(\)\) return null/.test(bs))
    t('no card fields on our page: the card is added on the provider\'s hosted pages only', !/CardElement|PaymentElement|cardNumber|<input[^>]*cc-number/i.test(read('components/manage/BillingScreen.tsx')) && /mode: 'setup'/.test(read('lib/billing/processor.ts')))
    t('the pre-order choice writes the ONE existing setting (truck_billing.post_pay), and hides "online" where the country cannot take online payment',
      /upsertTruckBilling\(truckRow\.id, \{ postPay: value === 'at_truck' \}/.test(strip(read('app/api/manage/billing/route.ts'))) && /onlineAllowed: ctx\.countryBilling\?\.paymentModel !== 'billed_at_truck'/.test(strip(read('lib/billing/view.ts'))))
    t('the late fee shows only above 0 (the invoice line)', /inv\.lateFeeMinor > 0 && /.test(bs))
    t('the order page while paused: the existing "not taking orders" state, no billing word (the menu route only sets ordering_available)', !/billing/i.test(read('app/(app)/trucks/[slug]/order/page.tsx').match(/^import .*$/gm).join('\n')))
    t('the namespaces are registered for Manage', /'billing',/.test(read('lib/i18n/namespaces.ts')))
    const reg = JSON.parse(read('scripts/harnesses.json'))
    t('this harness is in the sweep list', reg.harnesses.includes('billing-2.cjs'))
  }

  console.log(`\n${fail === 0 ? '✅' : '🔴'} billing-2: ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})().catch(e => { console.error('🔴 harness crashed:', e); process.exit(1) })
