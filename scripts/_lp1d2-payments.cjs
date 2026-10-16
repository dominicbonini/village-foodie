// scripts/_lp1d2-payments.cjs — Language Phase 1d Part 2, area `payments`: Manage › Payments, rendered for a GB and a
// US truck in every state the tab can be in, plus the words the three components take from lib code.
//   pay|…      PaymentsTab: loading; the status read failing (the route's own words, "Request failed (500)", "Could not
//              reach Stripe"); not permitted (403); every Stripe state (not set up, requirements, pending, ready,
//              restricted, unsupported); trial / starter / pro / max plans while not set up; "Setting up…"; a platform
//              admin; test mode; the keys in different modes; the browser key missing; account management opened.
//              Stripe Connect JS is STUBBED (plain marker elements), so no Stripe script loads.
//   payToast|… the toasts "Set up online payments" raises — created, already existed, the route's refusal words, a
//              500 with no words, and a fetch that throws a non-Error — by calling the tab's own handler (exposed by
//              a patch) with `fetch` stubbed.
//   page|…     the tab as Manage mounts it: PaymentsTab (ready) with ChargesCard + TakingPaymentPanel in afterOnline.
//   charges|…  ChargesCard: GB (renders nothing — its prices include VAT), US as seeded (tax 8.25 %, tips on, a fee the
//              truck keeps with no maximum set), tips off / no rate, the truck's fee with % and fixed maximums, % only,
//              fixed only, a fee HatchGrab keeps, no fee allowed; and GB HYPOTHETICAL rows (a GB truck whose country
//              adds tax, so the card's en-GB words are seen). Each validation refusal is produced by the card's own
//              `save` (exposed by a patch); three of them (a rate's decimals, a fixed fee over the maximum, a failed save
//              that threw a non-Error) are then rendered in the card's error slot.
//   chargeErr| the refusal sentence `save` hands the card for each bad input (and the toast for a failed save).
//   taking|…   TakingPaymentPanel: paid step on/off, completion one/two/derived from the paid step, the truck-level cash row (shown only
//              when the per-van column is missing) on and off.
//   copy|…     lib/charge-settings.ts checkChargeSettings on every refusal (worded in the truck's locale — on the new
//              code a refusal is a CODE worded from `errorsManage`), feePhrase/pctText/shortMoney; lib/plan-features
//              card-fee labels the tab quotes.
// 🔴 RUNS ON BOTH CODES (826471a and this tree): every state through ctx.states; PaymentsTab's fetch error is a
// sentence at 826471a and a CODE now (its shape read from the tab's source).
const PAY = 'components/manage/PaymentsTab.tsx'
const CHG = 'components/manage/ChargesCard.tsx'
const TAK = 'components/manage/TakingPaymentPanel.tsx'

const STRIPE_JS = "export const loadConnectAndInitialize = (o) => ({ __stub: 'connect-instance', publishableKey: o && o.publishableKey })\nexport const loadConnect = async () => ({})"
const STRIPE_REACT = `import { createElement } from 'react'
const mk = name => function StripeStub() { return createElement('div', { 'data-stripe-stub': name }) }
export function ConnectComponentsProvider({ children }) { return children }
export const ConnectAccountOnboarding = mk('ConnectAccountOnboarding')
export const ConnectAccountManagement = mk('ConnectAccountManagement')
export const ConnectNotificationBanner = mk('ConnectNotificationBanner')
export const ConnectPayments = mk('ConnectPayments')
export const ConnectPayouts = mk('ConnectPayouts')`

/** The status the route sends, per Stripe state. */
const ST = {
  not_connected: { accountId: null, chargesEnabled: false, syncedAt: null, detailsSubmitted: false, cardPaymentsStatus: null, viewer: 'owner', livemode: true },
  requirements: { accountId: 'acct_harness', chargesEnabled: false, syncedAt: '2026-10-09T17:00:00Z', detailsSubmitted: false, cardPaymentsStatus: 'inactive', viewer: 'owner', livemode: true },
  pending: { accountId: 'acct_harness', chargesEnabled: false, syncedAt: '2026-10-09T17:00:00Z', detailsSubmitted: true, cardPaymentsStatus: 'pending', viewer: 'owner', livemode: true },
  ready: { accountId: 'acct_harness', chargesEnabled: true, syncedAt: '2026-10-09T17:00:00Z', detailsSubmitted: true, cardPaymentsStatus: 'active', viewer: 'owner', livemode: true },
  restricted: { accountId: 'acct_harness', chargesEnabled: false, syncedAt: '2026-10-09T17:00:00Z', detailsSubmitted: true, cardPaymentsStatus: 'inactive', viewer: 'owner', livemode: true },
  unsupported: { accountId: 'acct_harness', chargesEnabled: false, syncedAt: '2026-10-09T17:00:00Z', detailsSubmitted: true, cardPaymentsStatus: 'unsupported', viewer: 'owner', livemode: true },
}
const KEY_ENV = 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'

async function views(ctx) {
  const { kit, h, html, states, GB, US, inManage, PROVIDERS } = ctx
  const out = {}
  let M
  try {
    M = await kit.bundle('lp1d2-payments', [
      "export * as PAY from '@/components/manage/PaymentsTab'",
      "export * as CHG from '@/components/manage/ChargesCard'",
      "export * as TAK from '@/components/manage/TakingPaymentPanel'",
      "export * as CS from '@/lib/charge-settings'",
      "export * as PF from '@/lib/plan-features'",
      "export { translatorFor } from '@/lib/i18n/translator'",
      "import '@/lib/i18n/catalog/errorsManage'",
      PROVIDERS,
    ].join('\n'), {
      stubs: { '@stripe/connect-js': STRIPE_JS, '@stripe/react-connect-js': STRIPE_REACT },
      patches: [
        { file: PAY, states: states(PAY, ['status', 'loading', 'creating', 'fetchError', 'permissionError', 'showManagement']) },
        { file: PAY, from: 'const createAccount = async () => {', to: 'const createAccount = (globalThis as any).__payCreate = async () => {' },
        { file: CHG, states: states(CHG, ['rate', 'rateError', 'tipping', 'feeOn', 'feePct', 'feeFixed', 'feeError']) },
        { file: CHG, from: 'const save = async (input: ChargeSettingsInput', to: 'const save = (globalThis as any).__chargesSave = async (input: ChargeSettingsInput' },
        { file: TAK, states: states(TAK, ['vanCashAvailable']) },
      ],
    })
  } catch (e) { for (const cc of ['GB', 'US']) out[`${cc}|bundle`] = 'ERROR ' + String(e.message).slice(0, 300); return out }

  const noop = () => {}
  const origKey = process.env[KEY_ENV]
  const origFetch = globalThis.fetch
  /** The browser's publishable key for one render (undefined = not set). */
  const withKey = (key, fn) => {
    if (key === undefined) delete process.env[KEY_ENV]; else process.env[KEY_ENV] = key
    try { return fn() } finally { if (origKey === undefined) delete process.env[KEY_ENV]; else process.env[KEY_ENV] = origKey }
  }
  const withKeyAsync = async (key, fn) => {
    if (key === undefined) delete process.env[KEY_ENV]; else process.env[KEY_ENV] = key
    try { return await fn() } finally { if (origKey === undefined) delete process.env[KEY_ENV]; else process.env[KEY_ENV] = origKey }
  }
  /** A fetch that answers every call with `res` ({ ok, status, data } or a value to throw). */
  const stubFetch = res => async () => {
    if (res.throw !== undefined) throw res.throw
    return { ok: res.ok, status: res.status, json: async () => res.data }
  }

  for (const C0 of [GB, US]) {
    const cc = C0.cc
    const W = (el, C = C0) => inManage(M, C, el)
    const safe = (k, fn) => ctx.safe(out, `${cc}|${k}`, fn)
    const safeAsync = (k, fn) => ctx.safeAsync(out, `${cc}|${k}`, fn)
    const truck = { ...C0.truck }

    // ══ PaymentsTab ═══════════════════════════════════════════════════════════════════════════════════════
    const Tab = M.PAY && M.PAY.PaymentsTab
    // `key: null` = the browser key NOT SET (undefined would take the default).
    const tab = (state, { plan = 'max', key = 'pk_live_harness', afterOnline } = {}) =>
      withKey(key === null ? undefined : key, () => html({ loading: false, ...state }, W(h(Tab, { token: 'harness', plan, showToast: noop, afterOnline }))))
    if (Tab) {
      safe('pay|loading', () => tab({ loading: true }))
      // The status read failing: 826471a holds the sentence; this tree holds a code and words it at render.
      // The shape this code holds it in is read from its source (the tab's FetchFailure type), so the same view gives the
      // same failure on every code: a sentence (826471a), { kind, … } or { code, … } with the route's words as a string.
      const P = ctx.src(PAY)
      const shape = /kind: 'text'/.test(P) ? 'kind' : /code: 'requestFailed'/.test(P) ? 'code' : 'sentence'
      const failure = (sentence, kind, extra = {}) => ({ fetchError: shape === 'sentence' ? sentence
        : kind === 'text' ? (shape === 'kind' ? { kind, text: sentence } : sentence)
        : { [shape]: kind, ...extra } })
      safe('pay|fetchError|routeWords', () => tab(failure('Stripe is not configured on this server', 'text')))
      safe('pay|fetchError|requestFailed', () => tab(failure('Request failed (500)', 'requestFailed', { status: 500 })))
      safe('pay|fetchError|unreachable', () => tab(failure('Could not reach Stripe', 'unreachable')))
      safe('pay|notPermitted', () => tab({ permissionError: 'not_permitted' }))
      for (const s of Object.keys(ST)) safe(`pay|state|${s}`, () => tab({ status: ST[s] }))
      for (const plan of ['trial', 'starter']) safe(`pay|notConnected|${plan}`, () => tab({ status: ST.not_connected }, { plan }))
      safe('pay|notConnected|creating', () => tab({ status: ST.not_connected, creating: true }, { plan: 'trial' }))
      safe('pay|notConnected|admin', () => tab({ status: { ...ST.not_connected, viewer: 'platform_admin' } }))
      safe('pay|ready|admin', () => tab({ status: { ...ST.ready, viewer: 'platform_admin' } }))
      safe('pay|testMode', () => tab({ status: { ...ST.not_connected, livemode: false } }, { key: 'pk_test_harness' }))
      safe('pay|keyMismatch|serverLive', () => tab({ status: ST.not_connected }, { key: 'pk_test_harness' }))
      safe('pay|keyMismatch|serverTest', () => tab({ status: { ...ST.ready, livemode: false } }, { key: 'pk_live_harness' }))
      safe('pay|keyMissing', () => tab({ status: ST.requirements }, { key: null }))
      safe('pay|ready|managementOpen', () => tab({ status: ST.ready, showManagement: true }))

      // ── the toasts "Set up online payments" raises, through the tab's own handler, `fetch` stubbed ──
      const toastCase = (k, res) => safeAsync(`payToast|${k}`, () => withKeyAsync('pk_live_harness', async () => {
        const toasts = []
        delete globalThis.__payCreate
        html({ loading: false, status: ST.not_connected }, W(h(Tab, { token: 'harness', plan: 'max', showToast: (m, t) => toasts.push([m, t || null]) })))
        if (typeof globalThis.__payCreate !== 'function') return 'ERROR the handler was not exposed'
        globalThis.fetch = stubFetch(res)
        try { await kit.quietAsync(() => globalThis.__payCreate()) } finally { globalThis.fetch = origFetch; delete globalThis.__payCreate }
        return toasts
      }))
      await toastCase('created', { ok: true, status: 200, data: { accountId: 'acct_new', alreadyExisted: false } })
      await toastCase('alreadyExisted', { ok: true, status: 200, data: { accountId: 'acct_old', alreadyExisted: true } })
      await toastCase('routeWords', { ok: false, status: 400, data: { error: 'Stripe refused to create the account' } })
      await toastCase('noWords500', { ok: false, status: 500, data: {} })
      await toastCase('nonError', { throw: 'socket hang up' })
    }

    // ══ ChargesCard ═══════════════════════════════════════════════════════════════════════════════════════
    const Card = M.CHG && M.CHG.ChargesCard
    // The country facts the card reads — the seed's, and variants of it.
    const S = C0.settings
    const SET = {
      seed: S,
      capped: { ...S, pricesIncludeTax: false, serviceFeeAllowed: true, serviceFeeRecipient: 'truck', serviceFeeTruckMaxBps: 500, serviceFeeTruckMaxFixedMinor: 100 },
      pctOnly: { ...S, pricesIncludeTax: false, serviceFeeAllowed: true, serviceFeeRecipient: 'truck', serviceFeeTruckMaxBps: 400, serviceFeeTruckMaxFixedMinor: null },
      fixedOnly: { ...S, pricesIncludeTax: false, serviceFeeAllowed: true, serviceFeeRecipient: 'truck', serviceFeeTruckMaxBps: null, serviceFeeTruckMaxFixedMinor: 75 },
      hatchgrab: { ...S, pricesIncludeTax: false, serviceFeeAllowed: true, serviceFeeRecipient: 'hatchgrab', serviceFeeHatchgrabBps: 300, serviceFeeHatchgrabFixedMinor: 30 },
      noFee: { ...S, pricesIncludeTax: false, serviceFeeAllowed: false },
    }
    // GB's HYPOTHETICAL tax-adding country (the card never shows for a real GB truck): tips 10 / 12.5 / 15.
    const gbHypo = s => (cc === 'GB' ? { ...s, pricesIncludeTax: false, tipPresetsPct: [10, 12.5, 15], tippingEnabledDefault: true } : s)
    const withSet = s => ({ ...C0, settings: gbHypo(s) })
    const cardTruck = { tax_rate_milli: truck.tax_rate_milli, tipping_enabled: truck.tipping_enabled, service_fee_enabled: false, service_fee_bps: null, service_fee_fixed_minor: null }
    const card = (setName, t = {}, state = {}, C = withSet(SET[setName])) =>
      html(state, W(h(Card, { truck: { ...cardTruck, ...t }, api: async () => ({}), showToast: noop, onTruckUpdate: noop }), C))
    if (Card) {
      if (cc === 'GB') safe('charges|real', () => card('seed', {}, {}, C0))          // prices include VAT → nothing
      safe('charges|seed', () => card('seed', cc === 'GB' ? { tax_rate_milli: 8250, tipping_enabled: true } : {}))
      safe('charges|tipsOffNoRate', () => card('seed', { tax_rate_milli: null, tipping_enabled: false }))
      safe('charges|capped|off', () => card('capped', { tax_rate_milli: 8875 }))
      safe('charges|capped|on', () => card('capped', { tax_rate_milli: 8875, service_fee_enabled: true, service_fee_bps: 350, service_fee_fixed_minor: 30 }))
      safe('charges|pctOnly|on', () => card('pctOnly', { service_fee_enabled: true, service_fee_bps: 250 }))
      safe('charges|fixedOnly|on', () => card('fixedOnly', { service_fee_enabled: true, service_fee_fixed_minor: 50 }))
      safe('charges|hatchgrab', () => card('hatchgrab'))
      safe('charges|noFee', () => card('noFee'))

      // ── each refusal, from the card's own `save`, then shown in the card ──
      const saveCase = async (k, setName, input, slot, api) => safeAsync(`chargeErr|${k}`, async () => {
        const errs = [], toasts = []
        delete globalThis.__chargesSave
        const C = withSet(SET[setName])
        html({}, W(h(Card, { truck: cardTruck, api: api || (async () => ({})), showToast: (m, t) => toasts.push([m, t || null]), onTruckUpdate: noop }), C))
        if (typeof globalThis.__chargesSave !== 'function') return 'ERROR save was not exposed'
        const ok = await kit.quietAsync(() => globalThis.__chargesSave(input, e => errs.push(e)))
        delete globalThis.__chargesSave
        const error = errs.filter(e => e != null).pop() ?? null
        if (slot && error) safe(`charges|error|${k}`, () => card(setName, slot === 'feeError' ? { service_fee_enabled: true } : {}, { [slot]: error }))
        return { ok, error, toasts }
      })
      await saveCase('rateDecimals', 'capped', { taxRate: '8.8755' }, 'rateError')
      await saveCase('rateRange', 'capped', { taxRate: '25' })
      await saveCase('feePct', 'capped', { serviceFeePct: 'three' })
      await saveCase('feeOverPct', 'capped', { serviceFeePct: '6' })
      await saveCase('feeFixed', 'capped', { serviceFeeFixed: 'abc' })
      await saveCase('feeOverFixed', 'capped', { serviceFeeFixed: '2.00' }, 'feeError')
      await saveCase('feePartNotAllowed', 'pctOnly', { serviceFeeFixed: '0.50' })
      await saveCase('feeNotHere', 'noFee', { serviceFeeEnabled: true })
      await saveCase('feeHatchgrab', 'hatchgrab', { serviceFeeEnabled: true })
      await saveCase('chooseOnOff', 'capped', { tippingEnabled: 'yes' })
      await saveCase('nothingToSave', 'capped', {})
      await saveCase('saved', 'capped', { taxRate: '8.875' })
      await saveCase('apiError', 'capped', { taxRate: '8.875' }, null, async () => { throw new Error('The server refused this change.') })
      await saveCase('apiNonError', 'capped', { taxRate: '8.875' }, 'rateError', async () => { throw 'offline' })
    }

    // ══ TakingPaymentPanel ════════════════════════════════════════════════════════════════════════════════
    const Taking = M.TAK && M.TAK.TakingPaymentPanel
    const taking = (t, state = {}) => html(state, W(h(Taking, { truck: { show_paid_step: true, completion_presses: 'two', takes_cash: true, ...t }, api: async () => ({}), showToast: noop, onTruckUpdate: noop })))
    if (Taking) {
      safe('taking|default', () => taking({}))
      safe('taking|paidStepOff|onePress', () => taking({ show_paid_step: false, completion_presses: 'one' }))
      safe('taking|derived|one', () => taking({ show_paid_step: false, completion_presses: null }))
      safe('taking|cashRow|on', () => taking({}, { vanCashAvailable: false }))
      safe('taking|cashRow|off', () => taking({ takes_cash: false, show_paid_step: false, completion_presses: 'one' }, { vanCashAvailable: false }))
    }

    // ══ the tab as Manage mounts it ══════════════════════════════════════════════════════════════════════
    if (Tab && Card && Taking) {
      const after = h(require('react').Fragment, null,
        h(Card, { truck, api: async () => ({}), showToast: noop, onTruckUpdate: noop }),
        h(Taking, { truck, api: async () => ({}), showToast: noop, onTruckUpdate: noop }))
      safe('page|ready', () => tab({ status: ST.ready }, { afterOnline: after }))
    }

    // ══ lib words ═══════════════════════════════════════════════════════════════════════════════════════
    const CS = M.CS
    const money = minor => new Intl.NumberFormat(S.locale, { style: 'currency', currency: S.currency }).format(minor / 100)
    const errOf = M.translatorFor && M.translatorFor(C0.locale, 'errorsManage')
    const worded = r => (r.ok ? { ok: true, values: r.values } : { ok: false, error: r.error, worded: r.code && errOf ? errOf(r.code, r.params) : r.error })
    if (CS && CS.checkChargeSettings) {
      const cases = {
        rateNotHere: [{ taxRate: '5' }, { ...S, pricesIncludeTax: true }],
        // (the card's own `save` covers the rest — chargeErr|…; these are the refusals it cannot reach, and the server's
        // view of the same function: a rate where prices include tax, a non-boolean switch, a part of the fee not allowed)
        rateRange: [{ taxRate: '20.5' }, SET.capped], rateOk: [{ taxRate: '8.875' }, SET.capped],
        feeOnBad: [{ serviceFeeEnabled: 'on' }, SET.capped], feeOverPctDecimal: [{ serviceFeePct: '7.5' }, SET.pctOnly],
        pctNotAllowed: [{ serviceFeePct: '2' }, SET.fixedOnly], feeOk: [{ serviceFeeEnabled: true, serviceFeePct: '3.5', serviceFeeFixed: '0.30' }, SET.capped],
      }
      for (const [k, [input, c]] of Object.entries(cases)) safe(`copy|checkCharge|${k}`, () => worded(CS.checkChargeSettings(input, c, money)))
      safe('copy|feePhrase', () => ({
        both: CS.feePhrase(350, 30, S.currency, money), pct: CS.feePhrase(400, null, S.currency, money), fixed: CS.feePhrase(null, 50, S.currency, money),
        bigFixed: CS.feePhrase(250, 150, S.currency, money), none: CS.feePhrase(null, null, S.currency, money),
        pctText: [400, 350, 1, 1250, 0].map(CS.pctText), shortMoney: [30, 99, 100, 250].map(m => CS.shortMoney(m, S.currency, money)),
      }))
    }
    if (M.PF) safe('copy|cardFeeLabels', () => Object.fromEntries(['cardFeeOnlineLabel', 'cardFeeInPersonLabel', 'tapToPaySurchargeLabel', 'cardRegionOnline', 'cardRegionInPerson']
      .map(n => [n, typeof M.PF[n] === 'function' ? M.PF[n](S) : null])))
  }
  return out
}

module.exports = { views }
