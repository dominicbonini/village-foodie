// scripts/_lp1c-setup.cjs — Language Phase 1c, area `setup` (docs/language-phase-1c-report.md): the setup wizard
// (app/setup/page.tsx) in every step and state, the "Where's your truck based?" step and its town box and zone list
// (components/setup/WhereBasedStep.tsx), the cuisine control (components/shared/CuisinePicker.tsx), the price controls
// (components/shared/PriceControls.tsx), the operator header (components/shared/AppHeader.tsx) — for a GB and a US
// signup, as full HTML — and THE ROWS A NEW TRUCK IS PROVISIONED WITH (lib/provision-truck.ts), as JSON from a fake db.
//
// 🔴 WHAT A PRESS STORES. The views `GB|press|…` / `US|press|…` press the wizard's buttons (Continue on each step) and
// record every state the handler sets (the phone error, the server's error, the zone / town errors, the stage) — so a
// sentence a handler now reads from the message file is proven to be the same bytes it held before.
// 🔴 THE ROWS. `GB|provision|…` / `US|provision|…` record every insert provisionTruck writes (trucks, truck_vans), its
// return value and its refusals, for an operator and a demo truck — byte-identical (the stored values are not
// translated in this phase). The random identity is made deterministic by a stubbed `randomBytes`.
//
// Nothing reaches a database or the network: the countries come from the seed migrations through the real
// lib/signup-countries.ts over an in-memory db, and `fetch` is a stand-in that answers each press.
const path = require('path')
const SEEDS = require('./_country-settings-gb.cjs')

const FILES = {
  page: 'app/setup/page.tsx',
  step: 'components/setup/WhereBasedStep.tsx',
  price: 'components/shared/PriceControls.tsx',
}
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
const GB_ROW = () => SEEDS.gbFromSeed()
const US_OFF = () => SEEDS.usFromSeed()
const US_ON = () => ({ ...SEEDS.usFromSeed(), enabled: true, starterMonthlyMinor: 3900, proMonthlyMinor: 5900, maxMonthlyMinor: 9900, proAllowanceMinor: 30000, maxAllowanceMinor: 100000, platformFeePct: 1.5 })

/** Records every <button>'s onClick and text (and every <form>'s onSubmit) while `fn` renders. */
function withButtons(REPO, fn) {
  const rt = require(path.join(REPO, 'node_modules/react/jsx-runtime'))
  const orig = { jsx: rt.jsx, jsxs: rt.jsxs }
  const buttons = []
  const text = c => (c == null || c === false || c === true ? '' : Array.isArray(c) ? c.map(text).join('') : typeof c === 'object' ? text(c.props && c.props.children) : String(c))
  const wrap = f => (type, props, key) => {
    if (type === 'button' && props && props.onClick) buttons.push({ text: text(props.children), disabled: !!props.disabled, onClick: props.onClick })
    if (type === 'form' && props && props.onSubmit) buttons.push({ text: '<form>', disabled: false, onClick: props.onSubmit })
    return f(type, props, key)
  }
  rt.jsx = wrap(orig.jsx); rt.jsxs = wrap(orig.jsxs)
  try { const html = fn(); return { html, buttons } } finally { rt.jsx = orig.jsx; rt.jsxs = orig.jsxs }
}

async function views(ctx) {
  const { kit, h, html, REPO } = ctx
  // ── the countries, as the real server builds them (lib/signup-countries.ts over the seed rows) ──
  const lib = await kit.bundle('lp1c-setup-lib', [
    "export { signupCountries, guessSignupCountry } from '@/lib/signup-countries'",
    "export { clearCountrySettingsCache } from '@/lib/country-settings'",
    "export { provisionTruck } from '@/lib/provision-truck'",
  ].join('\n'), {
    // a deterministic "random" identity for the demo profile and the operator token suffix
    stubs: { crypto: "export * from 'node:crypto'\nexport function randomBytes(n) { const b = Buffer.alloc(n); for (let i = 0; i < n; i++) b[i] = (i * 37 + 11 + (globalThis.__lpRandSeed || 0)) & 255; return b }" },
  })
  globalThis.__harnessDb = kit.fakeDb({ country_settings: [GB_ROW(), US_ON()].map(snake) })
  lib.clearCountrySettingsCache()
  let COUNTRIES
  try { COUNTRIES = await kit.quietAsync(() => lib.signupCountries()) } finally { delete globalThis.__harnessDb }

  // ── the screens ──
  const M = await kit.bundle('lp1c-setup-ui', [
    "export { default as SetupPage } from '@/app/setup/page'",
    "export { WhereBasedStep, TownInput, ZoneSelect, initialBaseAnswer, baseAnswerErrors, useSignupCountries } from '@/components/setup/WhereBasedStep'",
    "export { CuisinePicker } from '@/components/shared/CuisinePicker'",
    "export { Select, PriceModeSelect, PriceRoundingSelect, PriceAmountInput, PriceCell } from '@/components/shared/PriceControls'",
    "export { default as AppHeader } from '@/components/shared/AppHeader'",
    "export { I18nContext } from '@/lib/i18n/use-t'",
    "export { translatorFor } from '@/lib/i18n/translator'",
  ].join('\n'), {
    patches: [
      { file: FILES.page, states: ['name', 'busy', 'error', 'contactPhone', 'phoneIsWhatsapp', 'phoneError', 'stage', 'baseChoice', 'baseErrors', 'checking'] },
      // every state a handler sets is recorded when a view presses a button (globalThis.__lpRec)
      { file: FILES.page, from: /\bset(PhoneError|Error|Busy|Stage|BaseErrors)\(/g, to: '__lpSet("$1", set$1)(' },
      { file: FILES.page, append: 'function __lpSet(n, f) { return globalThis.__lpRec ? (v) => { globalThis.__lpRec.push([n, v]) } : f }' },
      { file: FILES.step, states: ['state', 'error', 'suggestions', 'open', 'unavailable'] },
      { file: FILES.price, states: ['draft', 'editing'] },
    ],
  })

  // ⚠️ RE-PINNED (Language Phase 1d, API agent): lib/trade-area.ts and baseAnswerErrors now hand back a REFUSAL —
  // { code, params } — and the step renders its words from `tradeArea`. Where a view records that value itself (the
  // baseAnswerErrors result, the BaseErrors a press sets), the new code's refusal is read back as its en-GB words, so
  // the view still proves the SAME sentence reaches the screen. Only when the code has refusals (TRADE_REFUSALS).
  const TRADE_REFUSALS = /TradeAreaRefusal/.test(ctx.read('components/setup/WhereBasedStep.tsx'))
  const refusalWords = v => (!TRADE_REFUSALS ? v : JSON.parse(JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) && typeof x.code === 'string' && x.params && Object.keys(x).length === 2
    ? M.translatorFor('en-GB', 'tradeArea')(x.code, x.params) : x))))
  const out = {}
  for (const C of [ctx.GB, ctx.US]) {
    const cc = C.cc
    const other = cc === 'GB' ? 'US' : 'GB'
    /** Wrap in the signup country's locale (the wizard's useTruckLocale; en-US's file is empty). */
    const wrap = el => (cc === 'US' ? h(M.I18nContext.Provider, { value: { locale: 'en-US', setLocale() {} } }, el) : el)
    const put = (key, el, state, search) => { out[`${cc}|${key}`] = html(state || null, wrap(el), search) }

    // ══ the wizard ═══════════════════════════════════════════════════════════════════════════════════
    const data = (guess, fromLocation) => ({ countries: COUNTRIES, guess: { code: guess, fromLocation } })
    const cData = data(cc, true)
    const answer = (country, over = {}) => {
      const c = COUNTRIES.find(x => x.code === country)
      return { country, timezone: c.defaultTimezone, place: { placeId: null, name: '', region: null, lat: null, lng: null }, ...over }
    }
    const town = (name, extra = {}) => ({ placeId: null, name, region: null, lat: null, lng: null, ...extra })
    const ready = { checking: false, state: cData }
    const page = (key, state, search) => put(`page|${key}`, h(M.SetupPage), state, search)

    page('checking', { state: cData })
    for (const v of ['', 'verify=ok', 'verify=expired', 'verify=invalid', 'verify=other']) {
      page(`based|${v || 'plain'}`, ready, v)
      page(`identity|${v || 'plain'}`, { ...ready, stage: 'identity' }, v)
    }
    page('based|loading', { checking: false })
    // the countries could not load: the fallback sentence, and the server's own words passed through
    page('based|countriesFailed', { checking: false, error: 'We couldn’t load the list of countries. Try again in a moment.', __after: { error: { server: null } } })
    page('based|countriesServerError', { checking: false, error: 'Signups are paused.', __after: { error: { server: 'Signups are paused.' } } })
    page('based|guessFallback', { checking: false, state: data(cc, false) })
    page('based|guessOther', { checking: false, state: data(other, true) })
    page('based|chosenOther', { ...ready, baseChoice: answer(other) })
    page('based|chosenUS|zone', { ...ready, baseChoice: answer('US', { timezone: 'America/Chicago' }) })
    page('based|chosenGB|town', { ...ready, baseChoice: answer('GB', { place: town('Sudbury', { placeId: 'p1', region: 'Suffolk', lat: 52.04, lng: 0.73 }) }) })
    // every error the step can show, in the words baseAnswerErrors returns (the server's own)
    const errs = (a) => M.baseAnswerErrors(a, COUNTRIES)
    const ERR_CASES = {
      noTown: answer(cc),
      townTooLong: answer(cc, { place: town('x'.repeat(130)) }),
      badZone: answer(cc, { timezone: 'Mars/Olympus' }),
      badZoneNoTown: answer('US', { timezone: 'Europe/London' }),
      noCountry: answer(cc, { country: 'ZZ' }),
      ok: answer(cc, { place: town('Sudbury') }),
    }
    for (const [k, a] of Object.entries(ERR_CASES)) {
      const shown = a.country === 'ZZ' ? answer(cc) : a
      page(`based|errors|${k}`, { ...ready, baseChoice: shown, baseErrors: errs(a) })
      out[`${cc}|baseAnswerErrors|${k}`] = JSON.stringify(refusalWords(errs(a)))
    }
    // the identity step, every state
    const id = { ...ready, stage: 'identity' }
    page('identity|named', { ...id, name: 'Harness Kitchen' })
    page('identity|oneChar', { ...id, name: 'H' })
    page('identity|phone', { ...id, name: 'Harness Kitchen', contactPhone: C.phone.phone_example })
    page('identity|whatsapp', { ...id, name: 'Harness Kitchen', contactPhone: C.phone.phone_example, phoneIsWhatsapp: true })
    page('identity|busy', { ...id, name: 'Harness Kitchen', busy: true })
    page('identity|phoneRequired', { ...id, phoneError: 'Add a phone number — customers and we both use it to reach you.' })
    page('identity|serverError', { ...id, name: 'Harness Kitchen', error: 'A contact phone number is required.' })
    page('identity|otherCountry', { ...id, baseChoice: answer(other) })
    page('identity|noCountries', { checking: false, stage: 'identity' })

    // 🔴 THE PRESSES — what each handler sets, recorded
    const press = async (key, state, label, fetchReply) => {
      const rec = []
      const { buttons } = withButtons(REPO, () => html(state, wrap(h(M.SetupPage))))
      const b = buttons.find(x => x.text === label)
      if (!b) { out[`${cc}|press|${key}`] = 'ERROR no button ' + label + ' in ' + JSON.stringify(buttons.map(x => x.text)); return }
      const realFetch = globalThis.fetch
      globalThis.fetch = async () => { if (fetchReply instanceof Error) throw fetchReply; return { json: async () => fetchReply } }
      globalThis.__ms = ctx.AFTER && state.__after ? { ...state, ...state.__after } : state
      globalThis.__lpRec = rec
      try { await kit.quietAsync(async () => { await b.onClick({ preventDefault() {} }) }) } catch (e) { rec.push(['THREW', String(e && e.message)]) } finally {
        globalThis.fetch = realFetch; delete globalThis.__lpRec; delete globalThis.__ms
      }
      out[`${cc}|press|${key}`] = JSON.stringify({ disabled: b.disabled, set: refusalWords(rec) })
    }
    const cont = 'Continue'
    for (const [k, a] of Object.entries(ERR_CASES)) {
      if (k === 'noCountry') continue
      await press(`based|${k}`, { ...ready, baseChoice: a }, cont)
    }
    const named = { ...id, name: 'Harness Kitchen' }
    await press('identity|empty', named, cont)
    await press('identity|blank', { ...named, contactPhone: '   ' }, cont)
    await press('identity|badPhone', { ...named, contactPhone: '12345' }, cont)
    await press('identity|badPhoneOther', { ...named, contactPhone: '12345', baseChoice: answer(other) }, cont)
    await press('identity|form|badPhone', { ...named, contactPhone: '12345' }, '<form>')
    const good = { ...named, contactPhone: C.phone.phone_example }
    await press('identity|serverRefused', good, cont, { ok: false, error: 'A contact phone number is required.' })
    await press('identity|serverRefusedNoText', good, cont, { ok: false })
    await press('identity|network', good, cont, new Error('offline'))
    await press('identity|created', good, cont, { ok: true, truck: { dashboard_token: 'harness' } })
    await press('identity|back', good, 'Back')

    // ══ the step alone (the demo modal renders it too) ═══════════════════════════════════════════════
    const step = (key, props, state) => put(`step|${key}`, h(M.WhereBasedStep, { countries: COUNTRIES, guessedCode: cc, value: answer(cc), onChange() {}, ...props }), state)
    step('plain', {})
    step('noGuess', { guessedCode: null })
    step('us', { value: answer('US') })
    step('usChicago', { value: answer('US', { timezone: 'America/Los_Angeles' }) })
    step('gb', { value: answer('GB') })
    // ⚠️ RE-PINNED (Language Phase 1d): the step takes REFUSALS now, so on that code this view passes three real ones;
    // the invented sentences BEFORE showed become those refusals' words — named in scripts/_lp2-named.cjs
    // (1d-setup-step-fixture), so the rest of the view is still compared byte for byte.
    step('allErrors', { value: answer('US', { timezone: 'Europe/London' }), errors: TRADE_REFUSALS
      ? { country: { code: 'country_missing', params: {} }, timezone: { code: 'zone_unknown', params: { country: 'United States' } }, town: { code: 'town_missing', params: {} } }
      : { country: 'Choose a country.', timezone: 'Bad zone.', town: 'Add your town.' } })
    step('realErrors', { value: answer(cc), errors: errs(answer(cc, { timezone: 'Mars/Olympus' })) })
    step('oneCountry', { countries: COUNTRIES.filter(x => x.code === cc) })
    step('noFlag', { countries: COUNTRIES.map(x => ({ ...x, flag: null })) })
    const sug = [{ placeId: 'p1', name: 'Sudbury', detail: 'Suffolk, UK' }, { placeId: 'p2', name: 'Sudbrook', detail: '' }]
    const ti = (key, props, state) => put(`town|${key}`, h(M.TownInput, { id: 'base-town', country: cc, value: town('Sud'), onChange() {}, ...props }), state)
    ti('closed', {})
    ti('open', {}, { suggestions: sug, open: true })
    ti('invalid', { invalid: true })
    ti('unavailable', {}, { unavailable: true })
    for (const c of COUNTRIES) put(`zones|${c.code}`, h(M.ZoneSelect, { id: 'base-zone', zones: c.timezones, value: c.defaultTimezone, onChange() {} }))
    out[`${cc}|countries`] = JSON.stringify(COUNTRIES)

    // ══ CuisinePicker ════════════════════════════════════════════════════════════════════════════════
    const cp = (key, slots, over = {}) => put(`cuisine|${key}`, h(M.CuisinePicker, { slots, onChange() {}, idPrefix: 'setup', ...over }))
    cp('empty', [{ value: '', other: '' }])
    cp('one', [{ value: 'Pizza', other: '' }])
    cp('other', [{ value: 'Other', other: '' }])
    cp('otherTyped', [{ value: 'Other', other: 'Jollof' }])
    cp('two', [{ value: 'Pizza', other: '' }, { value: 'Burgers', other: '' }])
    cp('three', [{ value: 'Pizza', other: '' }, { value: 'Other', other: 'Pie & Mash' }, { value: 'Thai', other: '' }])
    cp('dupes', [{ value: 'Pizza', other: '' }, { value: 'Pizza', other: '' }])
    cp('invalid', [{ value: '', other: '' }], { invalid: true })
    cp('disabled', [{ value: 'Pizza', other: '' }, { value: 'Burgers', other: '' }], { disabled: true, idPrefix: 'settings' })

    // ══ PriceControls ════════════════════════════════════════════════════════════════════════════════
    const money = C.fmt
    const sym = cc === 'US' ? '$' : '£'
    const pc = (key, el, state) => put(`price|${key}`, el, state)
    pc('select', h(M.Select, { value: 'b', onChange() {}, ariaLabel: 'Pick one', options: [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }] }))
    pc('select|full', h(M.Select, { value: 2, onChange() {}, ariaLabel: 'Pick', disabled: true, faded: true, title: 'Two', className: 'w-24', height: 28, options: [{ value: 1, label: 'One' }, { value: 2, label: 'Two' }] }))
    for (const mode of ['none', 'add_amount', 'add_pct', 'sub_amount', 'sub_pct']) {
      pc(`mode|${mode}`, h(M.PriceModeSelect, { value: mode, onChange() {}, label: 'Price rule', currencySymbol: sym }))
      pc(`amount|${mode}`, h(M.PriceAmountInput, { mode, value: 1.5, onCommit() {}, label: 'Amount', currencySymbol: sym }))
      pc(`amount|${mode}|empty`, h(M.PriceAmountInput, { mode, value: null, onCommit() {}, label: 'Amount', currencySymbol: sym, height: 28 }))
      pc(`amount|${mode}|draft`, h(M.PriceAmountInput, { mode, value: 1.5, onCommit() {}, label: 'Amount', currencySymbol: sym }), { draft: '15' })
    }
    for (const r of ['none', 'nearest_1', 'up_1']) {
      pc(`rounding|${r}`, h(M.PriceRoundingSelect, { value: r, onChange() {}, label: 'Rounding', currencySymbol: sym }))
      pc(`rounding|${r}|faded`, h(M.PriceRoundingSelect, { value: r, onChange() {}, label: 'Rounding', currencySymbol: sym, faded: true, disabled: true, height: 28 }))
    }
    const setup = (o = {}) => ({ mode: 'add_pct', amount: 10, rounding: 'none', typed: {}, ...o })
    const cell = (key, props, state) => pc(`cell|${key}`, h(M.PriceCell, { menuPrice: 11.5, setup: setup(), itemId: 'i1', typed: null, onType() {}, onClear() {}, label: 'Margherita', money, ...props }), state)
    cell('computed', {})
    cell('computed|diff', { showDiff: true })
    cell('computed|diffDown', { showDiff: true, setup: setup({ mode: 'sub_amount', amount: 1 }) })
    cell('computed|noDiff', { showDiff: true, setup: setup({ mode: 'none', amount: null }) })
    cell('computed|disabled', { disabled: true, showDiff: true })
    cell('typed', { typed: 13, setup: setup({ typed: { i1: 13 } }) })
    cell('typed|diff', { typed: 13, showDiff: true, setup: setup({ typed: { i1: 13 } }) })
    cell('typed|diffDown', { typed: 9, showDiff: true, setup: setup({ typed: { i1: 9 } }), height: 22 })
    cell('typed|disabled', { typed: 13, disabled: true, setup: setup({ typed: { i1: 13 } }) })
    cell('grey', { grey: true })
    cell('noSetup', { setup: null })
    cell('noMoney', { money: null, showDiff: true })
    cell('editing', {}, { editing: true, draft: '12.65' })
    cell('editing|noMoney', { money: null, height: 22 }, { editing: true, draft: '' })
    cell('big', { menuPrice: 1234.56, showDiff: true, setup: setup({ mode: 'add_amount', amount: 100 }) })

    // ══ AppHeader ════════════════════════════════════════════════════════════════════════════════════
    const hd = (key, props) => put(`header|${key}`, h(M.AppHeader, { truckName: 'Pizza Kitchen', truckLogoUrl: null, ...props }))
    hd('plain', {})
    hd('logo', { truckLogoUrl: 'https://example.test/logo.png' })
    hd('subtitle', { subtitle: 'Dashboard' })
    hd('children', { children: h('button', null, 'Menu') })
    hd('notSticky', { sticky: false, subtitle: 'Manage' })
    hd('noName', { truckName: null, truckLogoUrl: 'https://example.test/logo.png' })

    // ══ 🔴 THE ROWS A NEW TRUCK IS PROVISIONED WITH ══════════════════════════════════════════════════
    const rows = cc === 'US' ? [GB_ROW(), US_ON()] : [GB_ROW(), US_OFF()]
    const provision = async (key, opts, over = {}) => {
      const writes = []
      // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): provisioning reads the plan catalogue (getPlanCatalog) — the seeded
      // plans / plan_prices rows ride along as fixture input (scripts/_lp1c-fixtures.cjs planTables).
      globalThis.__harnessDb = kit.fakeDb({ country_settings: (over.rows || rows).map(snake), trucks: [], truck_vans: [], ...ctx.FIX.planTables() }, writes)
      globalThis.__lpRandSeed = over.seed || 0
      lib.clearCountrySettingsCache()
      let result = null, error = null
      try { result = await kit.quietAsync(() => lib.provisionTruck(globalThis.__harnessDb, { country: cc, ...opts })) } catch (e) { error = { name: e && e.name, code: e && e.code, message: e && e.message } } finally {
        delete globalThis.__harnessDb; delete globalThis.__lpRandSeed
      }
      out[`${cc}|provision|${key}`] = JSON.stringify({ writes, result, error })
    }
    const area = { base_place_id: 'p1', base_place_name: 'Sudbury', base_region: 'Suffolk', base_lat: 52.04, base_lng: 0.73 }
    const zone = cc === 'US' ? 'America/Chicago' : 'Europe/London'
    await provision('operator|minimal', { kind: 'operator', name: 'Harness Kitchen' })
    await provision('operator|signup', { kind: 'operator', name: 'Harness Kitchen', contactEmail: 'kitchen@example.test', contactPhone: ` ${C.phone.phone_example} `, phoneIsWhatsapp: false, timezone: zone, tradeArea: { ...area, timezone: zone } })
    await provision('operator|whatsapp', { kind: 'operator', name: 'Harness Kitchen', contactEmail: 'kitchen@example.test', contactPhone: C.phone.phone_example, phoneIsWhatsapp: true, cuisineType: 'Pizza, Burgers' })
    await provision('operator|regionCode', { kind: 'operator', name: 'Harness Kitchen', tradeArea: { ...area, base_region_code: cc === 'US' ? 'IL' : null } })
    await provision('operator|public', { kind: 'operator', name: 'Harness Kitchen', visibility: 'public', slug: 'harness-slug', plan: 'pro' })
    await provision('operator|van', { kind: 'operator', name: 'Harness Kitchen', contactEmail: 'k@example.test', van: { name: '  Big Van  ', kitchen_capacity: null, capacity_window_mins: 10 } })
    await provision('operator|noVan', { kind: 'operator', name: 'Harness Kitchen', contactEmail: 'k@example.test', van: false })
    await provision('operator|otherCuisine', { kind: 'operator', name: 'Harness Kitchen', cuisineType: 'Jollof' })
    await provision('demo', { kind: 'demo' })
    await provision('demo|seeded', { kind: 'demo', van: { kitchen_capacity: null } }, { seed: 5 })
    // the refusals, in the words they carry today
    await provision('refuse|kind', { kind: 'nope', name: 'Harness Kitchen' })
    await provision('refuse|noName', { kind: 'operator', name: '  ' })
    await provision('refuse|plan', { kind: 'operator', name: 'Harness Kitchen', plan: 'gold' })
    await provision('refuse|countryOff', { kind: 'operator', name: 'Harness Kitchen', country: 'US' }, { rows: [GB_ROW(), US_OFF()] })
    await provision('refuse|countryUnknown', { kind: 'operator', name: 'Harness Kitchen', country: 'ZZ' })
    await provision('refuse|zone', { kind: 'operator', name: 'Harness Kitchen', timezone: 'Mars/Olympus' })
    await provision('refuse|tradeArea', { kind: 'operator', name: 'Harness Kitchen', tradeArea: { base_place_name: '' } })
    await provision('refuse|reserved', { kind: 'operator', name: 'Demo Kitchen' })
  }
  return out
}

// ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): a truck provisioned on a TRIAL plan now gets a dated
// `trial_expires_at` — named ONCE, in Phase 2's shared table (scripts/_lp2-named.cjs plans-a2-trial-expires-at), which
// language-phase-1c applies to BEFORE before comparing (and language-phase-2 to its own copies of these views).
module.exports = { views }
