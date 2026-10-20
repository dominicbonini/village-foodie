// scripts/_lp1c-demo.cjs — Language Phase 1c, area `demo` (docs/language-phase-1c-report.md): the demo's own words —
// the "Save my menu / Set up my truck" modal (components/DemoGetStarted.tsx) in every variant, step and state, the
// landing page's "Upload your menu" modal (components/landing/DemoUpload.tsx) in every phase, the loop-complete card
// that carries the signup offer (components/dashboard/DemoLoopComplete.tsx) — for a GB and a US fixture, as full HTML —
// and THE ROWS A DEMO IS PROVISIONED WITH (lib/provision-demo.ts, provision-demo-event.ts, seed-demo-orders.ts,
// demo-restart.ts, demo-templates.ts), as JSON from an in-memory database.
//
// 🔴 WHAT A PRESS SHOWS. The views `GB|press|…` / `US|press|…` press the modals' buttons against a stand-in `fetch`
// (every answer the routes give: refused, refused with the server's words, unreachable, saved without the email,
// signed in or not, truck made with or without a token) and record (a) every request the press sent and (b) the
// full HTML the modal renders afterwards from the state the handlers set. A handler that now keeps a CODE in state
// instead of a sentence is proven to render the same bytes it did when it kept the sentence.
// 🔴 THE ROWS. `GB|rows|…` / `US|rows|…` run the REAL provisionDemo / restartDemoService over scripts/_fake-pg.cjs (which
// stores rows) and record every write, the result and the final tables — the sample menus, "Van 1", "Demo event",
// the seeded customers and orders. These are stored values; this phase does not translate them, and they must be
// byte-identical. The random identity and order keys are made deterministic by a stubbed `crypto`.
//
// Nothing reaches a database, storage or the network: the AI menu reader and the logo copy are stubbed, `fetch` is a
// stand-in, and the Supabase browser client is a stand-in whose sign-in answers as the press asks.
const path = require('path')
const SEEDS = require('./_country-settings-gb.cjs')
const { makeFakePg } = require('./_fake-pg.cjs')

const FILES = {
  gs: 'components/DemoGetStarted.tsx',
  up: 'components/landing/DemoUpload.tsx',
  loop: 'components/dashboard/DemoLoopComplete.tsx',
}
const GS_STATES = ['open', 'email', 'busy', 'savedUntil', 'error', 'justSaved', 'step', 'baseChoice', 'operatorFirstName', 'operatorLastName',
  'truckName', 'password', 'logoPreview', 'cuisineSlots', 'contactPhone', 'phoneIsWhatsapp', 'promoCode', 'termsAccepted', 'showEmailEdit',
  'showPassword', 'fieldErrors', 'accountCreated', 'existing', 'stages', 'readyToken']
const UP_STATES = ['open', 'phase', 'file', 'text', 'message', 'stepIdx', 'slowPrompt', 'sampleOffer', 'templateRun', 'failedTruckId',
  'buildEmail', 'buildSent', 'buildBusy']
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
const GB_ROW = () => SEEDS.gbFromSeed()
const US_ON = () => ({ ...SEEDS.usFromSeed(), enabled: true, starterMonthlyMinor: 3900, proMonthlyMinor: 5900, maxMonthlyMinor: 9900, proAllowanceMinor: 30000, maxAllowanceMinor: 100000, platformFeePct: 1.5 })

// useState patched so a view can START from a state (globalThis.__ms) AND a press can SEE what its handlers set
// (globalThis.__msSet) — the effective value of every state is left in globalThis.__msCur on each render.
const MS_USE_REC = "const __msUse = (k, p) => { const g = globalThis as any; const has = g.__ms && Object.prototype.hasOwnProperty.call(g.__ms, k); const v = has ? g.__ms[k] : p[0]; if (g.__msCur) g.__msCur[k] = v; return [v, (x: any) => (g.__msSet ? g.__msSet(k, x) : p[1](x))] as any };\n"
const recStates = (kit, file, names) => ({ file, from: /^[\s\S]*$/, to: src => kit.wrapStates(src, names, file) + '\n' + MS_USE_REC })

/** Records every <button>'s onClick and text while `fn` renders, so a press can find one. */
function withButtons(REPO, fn) {
  const rt = require(path.join(REPO, 'node_modules/react/jsx-runtime'))
  const orig = { jsx: rt.jsx, jsxs: rt.jsxs }
  const buttons = []
  const text = c => (c == null || c === false || c === true ? '' : Array.isArray(c) ? c.map(text).join('') : typeof c === 'object' ? text(c.props && c.props.children) : String(c))
  const wrap = f => (type, props, key) => { if (type === 'button' && props && props.onClick) buttons.push({ text: text(props.children), disabled: !!props.disabled, onClick: props.onClick }); return f(type, props, key) }
  rt.jsx = wrap(orig.jsx); rt.jsxs = wrap(orig.jsxs)
  try { const html = fn(); return { html, buttons } } finally { rt.jsx = orig.jsx; rt.jsxs = orig.jsxs }
}

const CRYPTO_STUB = [
  "import * as real from 'node:crypto'",
  "export * from 'node:crypto'",
  "export function randomBytes(n) { const g = globalThis; const s = (g.__lpRandN = (g.__lpRandN || 0) + 1); const b = Buffer.alloc(n); for (let i = 0; i < n; i++) b[i] = (i * 37 + 11 + s * 13) & 255; return b }",
  "export function randomUUID() { const g = globalThis; const s = (g.__lpUuidN = (g.__lpUuidN || 0) + 1); return '00000000-0000-4000-8000-' + String(s).padStart(12, '0') }",
  'export default { ...real, randomBytes, randomUUID }',
].join('\n')

async function views(ctx) {
  const { kit, h, html: render, AFTER, REPO } = ctx
  const ctxExport = AFTER ? "export { I18nContext } from '@/lib/i18n/use-t'\n" : ''

  // ── the countries, as the real server builds them (lib/signup-countries.ts over the seed rows) ──
  const lib = await kit.bundle('lp1c-demo-lib', [
    "export { signupCountries } from '@/lib/signup-countries'",
    "export { clearCountrySettingsCache } from '@/lib/country-settings'",
    "export { provisionDemo } from '@/lib/provision-demo'",
    "export { restartDemoService } from '@/lib/demo-restart'",
    "export { DEMO_TEMPLATES, getDemoTemplate } from '@/lib/demo-templates'",
    "export { parseDemoKitchen, DEMO_KITCHEN_MESSAGES } from '@/lib/demo-kitchen'",
  ].join('\n'), {
    stubs: {
      crypto: CRYPTO_STUB,
      '@/lib/demo-logo': `export async function copyDemoLogo() { return { logoStoragePath: null, source: { kind: 'none' }, error: null, cleared: false } }
        export function demoLogoUpToDate() { return true }`,
    },
    // the AI menu reader: a harness hook, so a "photo" reads without any network
    patches: [{ file: 'lib/menu-extract.ts', from: 'export async function extractMenu(', to: 'export async function extractMenu(...__a: any[]): Promise<any> { const f = (globalThis as any).__extract; if (f) return f(...__a); return (__realExtractMenu as any)(...__a) }\nasync function __realExtractMenu(' }],
  })
  globalThis.__harnessDb = kit.fakeDb({ country_settings: [GB_ROW(), US_ON()].map(snake) })
  lib.clearCountrySettingsCache()
  let COUNTRIES
  try { COUNTRIES = await kit.quietAsync(() => lib.signupCountries()) } finally { delete globalThis.__harnessDb }

  // ── the screens ──
  const ui = await kit.bundle('lp1c-demo-ui', [
    `export { DemoGetStarted } from '@/${FILES.gs}'`,
    `export { DemoModalProvider, DemoCta, DemoModal } from '@/${FILES.up}'`,
    `export { DemoLoopComplete } from '@/${FILES.loop}'`,
  ].join('\n') + '\n' + ctxExport, {
    stubs: { '@/lib/supabase/client': 'export const createSupabaseBrowserClient = () => globalThis.__lpSupa' },
    patches: [
      recStates(kit, FILES.gs, GS_STATES),
      // the modal portals into document.body, which a static render has no document for: the element itself is returned
      { file: FILES.gs, from: "{open && typeof document !== 'undefined' && createPortal(", to: '{open && ((el: any, _b: any) => el)(' },
      { file: FILES.gs, from: '        document.body,\n      )}', to: '        null,\n      )}' },
      // the countries list arrives by fetch in an effect: a view hands it in instead
      { file: FILES.gs, from: "const signupCountries = useSignupCountries(step !== 'landing')", to: "const signupCountries = ((s: any) => (globalThis as any).__lpSignup ?? s)(useSignupCountries(step !== 'landing'))" },
      recStates(kit, FILES.up, UP_STATES),
      { file: FILES.up, from: "if (!open || typeof document === 'undefined') return null", to: 'if (!open) return null' },
      { file: FILES.up, from: '  return createPortal(', to: '  return ((el: any, _b: any) => el)(' },
      { file: FILES.up, from: '    document.body,\n  )', to: '    null,\n  )' },
      { file: FILES.loop, states: ['visible', 'freshKeys'] },
    ],
  })

  const out = {}
  for (const C of [ctx.GB, ctx.US]) {
    const cc = C.cc
    /** On AFTER code, a US page carries the en-US locale (its file is empty, so every word is en-GB's). */
    const wrap = el => (AFTER && ui.I18nContext && cc === 'US' ? h(ui.I18nContext.Provider, { value: { locale: 'en-US', setLocale() {} } }, el) : el)
    const signup = { data: { countries: COUNTRIES, guess: { code: cc, fromLocation: true } }, error: null }
    const html = (state, el, signupData = signup) => {
      globalThis.__lpSignup = signupData
      try { return render(state, wrap(el)) } finally { delete globalThis.__lpSignup }
    }

    // ══ DemoGetStarted ══════════════════════════════════════════════════════════════════════════════
    const TOKEN = 'demo-harness-token'
    const P = {
      slug: { slug: 'demo-harness-slug', phone: C.phone },                       // the order page: save only
      tokenOnly: { token: TOKEN, phone: C.phone },                                // signup closed: save only
      upload: { token: TOKEN, phone: C.phone, isAdmin: true },
      uploadSrc: { token: TOKEN, phone: C.phone, isAdmin: true, extractionSource: 'upload' },
      sample: { token: TOKEN, phone: C.phone, isAdmin: true, extractionSource: 'template' },
      noPhone: { token: TOKEN, phone: null, isAdmin: true },
    }
    const gs = (key, p, state, signupData) => { out[`${cc}|gs|${key}`] = html(state || null, h(ui.DemoGetStarted, p), signupData) }
    const EMAIL = 'sam@example.test'
    const SAVED = cc === 'US' ? 'October 23, 2026' : '23 October 2026'
    // the codes each fallback sentence is now held as (AFTER) — see components/DemoGetStarted.tsx
    const E = {
      saveFailed: ['Couldn’t save that — try again.', { code: 'saveFailed' }],
      savedNoEmail: ['Saved — but we couldn’t email the link just now.', { code: 'savedNoEmail' }],
      unreachable: ['Couldn’t reach us just now — try again.', { code: 'unreachable' }],
      createAccount: ['Could not create your account.', { code: 'createAccountFailed' }],
      truckCreate: ['Your account’s ready, but we couldn’t create your truck. Try again.', { code: 'truckCreateFailed' }],
      truckUnreachable: ['Your account’s ready, but we couldn’t reach us to create your truck. Try again.', { code: 'truckUnreachable' }],
      noToken: ['Your truck is set up, but we couldn’t open it just now. Try again.', { code: 'truckNoToken' }],
    }
    const errState = (k, extra = {}) => ({ ...extra, error: E[k][0], __after: { error: E[k][1] } })

    // the trigger, closed
    for (const [pk, p] of Object.entries(P)) gs(`trigger|${pk}`, p)
    gs('trigger|label', { ...P.upload, label: 'Save my menu' })
    gs('trigger|className', { ...P.sample, className: 'big-button' })
    // saved, closed: the setup CTA, or the status label with and without a date
    gs('saved|upload', P.upload, { savedUntil: SAVED })
    gs('saved|slug', P.slug, { savedUntil: SAVED })
    gs('saved|slugNoDate', P.slug, { savedUntil: '' })
    gs('saved|tokenOnly', P.tokenOnly, { savedUntil: SAVED })
    // the landing view, per variant
    for (const pk of ['slug', 'tokenOnly', 'upload', 'sample']) {
      const p = P[pk]
      gs(`landing|${pk}`, p, { open: true })
      gs(`landing|${pk}|email`, p, { open: true, email: EMAIL })
      gs(`landing|${pk}|busy`, p, { open: true, email: EMAIL, busy: true })
      gs(`landing|${pk}|serverError`, p, { open: true, email: EMAIL, error: 'That doesn’t look like an email address.' })
      for (const k of ['saveFailed', 'unreachable']) gs(`landing|${pk}|${k}`, p, errState(k, { open: true, email: EMAIL }))
      // the confirmation, right after a save
      gs(`confirm|${pk}`, p, { open: true, email: EMAIL, savedUntil: SAVED, justSaved: true })
      gs(`confirm|${pk}|noDate`, p, { open: true, email: EMAIL, savedUntil: '', justSaved: true })
      gs(`confirm|${pk}|warning`, p, { open: true, email: EMAIL, savedUntil: SAVED, justSaved: true, error: 'Saved, but we couldn’t send the email just now.' })
      gs(`confirm|${pk}|savedNoEmail`, p, errState('savedNoEmail', { open: true, email: EMAIL, savedUntil: SAVED, justSaved: true }))
    }
    gs('landing|upload|reopenAfterSave', P.upload, { open: true, email: EMAIL, savedUntil: SAVED })
    // step "Where's your truck based?"
    const W = { open: true, email: EMAIL }
    gs('based', P.upload, { ...W, step: 'based' })
    gs('based|notGuessed', P.upload, { ...W, step: 'based' }, { ...signup, data: { ...signup.data, guess: { code: cc, fromLocation: false } } })
    gs('based|loading', P.upload, { ...W, step: 'based' }, { data: null, error: null })
    gs('based|loadError', P.upload, { ...W, step: 'based' }, { data: null, error: 'We couldn’t load the list of countries. Try again in a moment.' })
    gs('based|busy', P.upload, { ...W, step: 'based', busy: true })
    // step 1 "About your truck"
    const T1 = { ...W, step: 'truck' }
    const FILLED1 = { operatorFirstName: 'Sam', operatorLastName: 'Harness', truckName: 'Pizza Kitchen', cuisineSlots: [{ value: 'Pizza', other: '' }] }
    gs('truck', P.upload, T1)
    gs('truck|sample', P.sample, T1)
    gs('truck|filled', P.upload, { ...T1, ...FILLED1 })
    gs('truck|logo', P.upload, { ...T1, ...FILLED1, logoPreview: 'blob:harness-logo' })
    gs('truck|busy', P.upload, { ...T1, busy: true })
    const FE1 = {
      all: [{ firstName: 'Tell us your first name.', lastName: 'And your last name.', truck: 'Give your truck a name.', cuisine: 'Tell us what you cook.' },
        { firstName: 'firstName', lastName: 'lastName', truck: 'truck', cuisine: 'cuisine' }],
      lastName: [{ lastName: 'And your last name.' }, { lastName: 'lastName' }],
      truck: [{ truck: 'Give your truck a name.' }, { truck: 'truck' }],
    }
    for (const [k, [b, a]] of Object.entries(FE1)) gs(`truck|errors|${k}`, P.upload, { ...T1, fieldErrors: b, __after: { fieldErrors: a } })
    // step 2 "Finish setting up": the form
    const T2 = { ...W, step: 'details', ...FILLED1 }
    const FILLED2 = { contactPhone: C.phone.phone_example, phoneIsWhatsapp: true, password: 'longenough', promoCode: 'HARNESS', termsAccepted: true }
    gs('details', P.upload, T2)
    gs('details|noPhoneCopy', P.noPhone, T2)
    gs('details|filled', P.upload, { ...T2, ...FILLED2 })
    gs('details|emailEdit', P.upload, { ...T2, showEmailEdit: true })
    gs('details|showPassword', P.upload, { ...T2, ...FILLED2, showPassword: true })
    const phoneInvalid = cc === 'US' ? 'Enter a valid US phone number (e.g. (201) 555-0123).' : 'Enter a valid UK phone number (e.g. 07700 900123).'
    const FE2 = {
      all: [{ phone: 'Add a phone number — customers and we both use it to reach you.', email: 'Enter a valid email address.', password: 'Password must be at least 8 characters.', terms: 'Please accept the terms to continue.' },
        { phone: 'phoneMissing', email: 'email', password: 'password', terms: 'terms' }],
      phoneInvalid: [{ phone: phoneInvalid }, { phone: 'phoneInvalid' }],
      terms: [{ terms: 'Please accept the terms to continue.' }, { terms: 'terms' }],
    }
    for (const [k, [b, a]] of Object.entries(FE2)) {
      gs(`details|errors|${k}`, P.upload, { ...T2, showEmailEdit: !!b.email, fieldErrors: b, __after: { fieldErrors: a } })
      gs(`details|errors|${k}|filled`, P.upload, { ...T2, ...FILLED2, contactPhone: '123', fieldErrors: b, __after: { fieldErrors: a } })
    }
    gs('details|existing', P.upload, { ...T2, ...FILLED2, error: 'An account with that email already exists.', existing: true })
    gs('details|serverError', P.upload, { ...T2, ...FILLED2, error: 'Sign-ups are not open yet.' })
    for (const k of ['createAccount', 'unreachable', 'truckCreate', 'truckUnreachable', 'noToken']) gs(`details|${k}`, P.upload, errState(k, { ...T2, ...FILLED2 }))
    // step 2: the progress list, and the confirmation beat
    const ST = (account, truck, menu) => ({ account, truck, menu })
    gs('progress|account', P.upload, { ...T2, ...FILLED2, busy: true, stages: ST('active', 'pending', 'pending') })
    gs('progress|truck', P.upload, { ...T2, ...FILLED2, busy: true, stages: ST('done', 'active', 'pending') })
    gs('progress|menu', P.upload, { ...T2, ...FILLED2, busy: true, stages: ST('done', 'done', 'active') })
    gs('progress|existing', P.upload, { ...T2, ...FILLED2, stages: ST('error', 'pending', 'pending'), error: 'An account with that email already exists.', existing: true })
    gs('progress|serverError', P.upload, { ...T2, ...FILLED2, stages: ST('error', 'pending', 'pending'), error: 'Sign-ups are not open yet.' })
    gs('progress|createAccount', P.upload, errState('createAccount', { ...T2, ...FILLED2, stages: ST('error', 'pending', 'pending') }))
    gs('progress|unreachable', P.upload, errState('unreachable', { ...T2, ...FILLED2, stages: ST('error', 'pending', 'pending') }))
    for (const k of ['truckCreate', 'truckUnreachable', 'noToken']) gs(`progress|${k}`, P.upload, errState(k, { ...T2, ...FILLED2, accountCreated: true, stages: ST('done', 'error', 'pending') }))
    gs('progress|truckServerError', P.upload, { ...T2, ...FILLED2, accountCreated: true, stages: ST('done', 'error', 'pending'), error: 'Add a phone number.' })
    gs('ready', P.upload, { ...T2, ...FILLED2, stages: ST('done', 'done', 'done'), readyToken: 'harness-dash' })
    gs('ready|sample', P.sample, { ...T2, ...FILLED2, stages: ST('done', 'done', 'done'), readyToken: 'harness-dash' })

    // ══ DemoGetStarted: PRESSES ════════════════════════════════════════════════════════════════════════
    // Each press renders, finds the button by its words, presses it against the stand-in fetch, applies every
    // state its handler set, and renders again. The view is the requests sent and the HTML after.
    const press = async (key, el, start, steps, routes = {}, opts = {}) => {
      const calls = []
      const origFetch = globalThis.fetch
      globalThis.fetch = async (url, init = {}) => {
        let body = init.body
        if (body && typeof body === 'object' && typeof body.entries === 'function') body = [...body.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : `File:${v.name}`])
        calls.push({ url: String(url), method: init.method || 'GET', body })
        const r = routes[String(url).split('?')[0]]
        const ans = typeof r === 'function' ? r(body) : r
        if (ans === 'throw' || ans === undefined) throw new Error('unreachable (harness)')
        return { ok: (ans.status || 200) < 400, status: ans.status || 200, json: async () => ans.body }
      }
      globalThis.__lpSupa = { auth: { signInWithPassword: async () => ({ error: opts.signInFails ? { message: 'Invalid login' } : null }) } }
      const hadWindow = 'window' in globalThis
      globalThis.window = { location: { assign: u => calls.push({ assign: u }) } }
      let cur = { ...start }
      const renderNow = () => {
        globalThis.__msCur = {}
        let r
        try { r = withButtons(REPO, () => html(cur, el)) } finally { cur = { ...globalThis.__msCur, ...cur }; delete globalThis.__msCur }
        return r
      }
      try {
        for (const step of steps) {
          const { buttons } = renderNow()
          const matches = buttons.filter(b => b.text === step)
          const b = matches[matches.length - 1]
          if (!b) { calls.push({ missing: step, have: buttons.map(x => x.text) }); break }
          globalThis.__msSet = (k, x) => { cur[k] = typeof x === 'function' ? x(cur[k]) : x }
          try { await kit.quietAsync(async () => { await b.onClick({ preventDefault() {}, stopPropagation() {}, currentTarget: {} }); await new Promise(r => setTimeout(r, 0)) }) }
          finally { delete globalThis.__msSet }
        }
        out[`${cc}|press|${key}`] = JSON.stringify({ calls, html: renderNow().html })
      } finally {
        globalThis.fetch = origFetch
        delete globalThis.__lpSupa
        if (!hadWindow) delete globalThis.window
      }
    }
    const SAVE = '/api/demo/save-email'
    const gsEl = p => h(ui.DemoGetStarted, p)
    const L = { open: true, email: EMAIL }
    for (const pk of ['slug', 'upload']) {
      const btn = pk === 'slug' ? 'Send me the link' : 'Just email me a link to come back to this demo'
      await press(`save|${pk}|refused`, gsEl(P[pk]), L, [btn], { [SAVE]: { status: 500, body: { ok: false } } })
      await press(`save|${pk}|refusedWords`, gsEl(P[pk]), L, [btn], { [SAVE]: { status: 400, body: { ok: false, error: 'That doesn’t look like an email address.' } } })
      await press(`save|${pk}|unreachable`, gsEl(P[pk]), L, [btn], { [SAVE]: 'throw' })
      await press(`save|${pk}|saved`, gsEl(P[pk]), L, [btn], { [SAVE]: { body: { ok: true, emailSent: true, deletionDate: SAVED } } })
      await press(`save|${pk}|savedNoEmail`, gsEl(P[pk]), L, [btn], { [SAVE]: { body: { ok: true, emailSent: false, deletionDate: SAVED } } })
      await press(`save|${pk}|savedWarning`, gsEl(P[pk]), L, [btn], { [SAVE]: { body: { ok: true, emailSent: false, deletionDate: SAVED, warning: 'Saved, but we couldn’t send the email just now.' } } })
      await press(`save|${pk}|savedThenBack`, gsEl(P[pk]), L, [btn, 'Back to the demo'], { [SAVE]: { body: { ok: true, emailSent: true, deletionDate: SAVED } } })
    }
    // the wizard, step by step
    await press('wizard|enter', gsEl(P.upload), L, ['Set up my truck →'])
    await press('wizard|basedContinue', gsEl(P.upload), { ...L, step: 'based' }, ['Continue'])
    await press('wizard|truckEmpty', gsEl(P.upload), { ...L, step: 'truck' }, ['Continue →'])
    await press('wizard|truckOnlyFirst', gsEl(P.upload), { ...L, step: 'truck', operatorFirstName: 'Sam' }, ['Continue →'])
    await press('wizard|truckFilled', gsEl(P.upload), { ...L, step: 'truck', ...FILLED1 }, ['Continue →'])
    await press('wizard|detailsEmpty', gsEl(P.upload), { ...L, step: 'details', ...FILLED1 }, ['Create my account →'])
    await press('wizard|detailsBadEmail', gsEl(P.upload), { ...L, email: 'nope', step: 'details', ...FILLED1, ...FILLED2 }, ['Create my account →'])
    await press('wizard|detailsBadPhone', gsEl(P.upload), { ...L, step: 'details', ...FILLED1, ...FILLED2, contactPhone: '123' }, ['Create my account →'])
    await press('wizard|detailsNoPhoneCopy', gsEl(P.noPhone), { ...L, step: 'details', ...FILLED1, ...FILLED2, contactPhone: '123' }, ['Create my account →'])
    await press('wizard|back', gsEl(P.upload), { ...L, step: 'details', ...FILLED1 }, ['‹'])
    // the setup chain
    const D = { ...L, step: 'details', ...FILLED1, ...FILLED2 }
    const OK = { body: { ok: true } }
    const TRUCK_OK = { body: { ok: true, truck: { dashboard_token: 'harness-dash' } } }
    const CHAIN = (over = {}) => ({ '/api/signup': OK, '/api/auth/update-profile': OK, '/api/setup': TRUCK_OK, '/api/manage': OK, ...over })
    await press('setup|accountRefused', gsEl(P.upload), D, ['Create my account →'], CHAIN({ '/api/signup': { status: 403, body: { ok: false } } }))
    await press('setup|accountRefusedWords', gsEl(P.upload), D, ['Create my account →'], CHAIN({ '/api/signup': { status: 403, body: { ok: false, error: 'Sign-ups are not open yet.' } } }))
    await press('setup|accountExisting', gsEl(P.upload), D, ['Create my account →'], CHAIN({ '/api/signup': { status: 409, body: { ok: false, existing: true, error: 'An account with that email already exists.' } } }))
    await press('setup|accountUnreachable', gsEl(P.upload), D, ['Create my account →'], CHAIN({ '/api/signup': 'throw' }))
    await press('setup|signInFails', gsEl(P.upload), D, ['Create my account →'], CHAIN(), { signInFails: true })
    await press('setup|truckRefused', gsEl(P.upload), D, ['Create my account →'], CHAIN({ '/api/setup': { status: 400, body: { ok: false } } }))
    await press('setup|truckRefusedWords', gsEl(P.upload), D, ['Create my account →'], CHAIN({ '/api/setup': { status: 400, body: { ok: false, error: 'Add a phone number.' } } }))
    await press('setup|truckUnreachable', gsEl(P.upload), D, ['Create my account →'], CHAIN({ '/api/setup': 'throw' }))
    await press('setup|truckNoToken', gsEl(P.upload), D, ['Create my account →'], CHAIN({ '/api/setup': OK }))
    await press('setup|truckRetry', gsEl(P.upload), D, ['Create my account →', 'Try again'], CHAIN({ '/api/setup': (() => { let n = 0; return () => (n++ ? TRUCK_OK : { status: 400, body: { ok: false } }) })() }))
    await press('setup|ready', gsEl(P.upload), D, ['Create my account →'], CHAIN())
    await press('setup|readyContinue', gsEl(P.upload), D, ['Create my account →', 'Continue →'], CHAIN())
    await press('setup|bestEffortFail', gsEl(P.upload), D, ['Create my account →'], CHAIN({ '/api/auth/update-profile': 'throw', '/api/manage': 'throw' }))

    // ══ DemoUpload (the landing page's modal) ════════════════════════════════════════════════════════
    const upEl = (child = h(ui.DemoModal)) => h(ui.DemoModalProvider, null, child)
    const up = (key, state) => { out[`${cc}|up|${key}`] = html(state, upEl()) }
    out[`${cc}|up|cta`] = html(null, upEl(h('div', null, h(ui.DemoCta, { id: 'hero-cta', className: 'btn btn-lg' }, 'Try it with your menu'), h(ui.DemoModal))))
    up('closed', null)
    const O = { open: true }
    up('idle', O)
    up('idle|text', { ...O, text: 'Margherita 9.50' })
    up('idle|file', { ...O, file: new File(['x'], 'menu.jpg', { type: 'image/jpeg' }) })
    const UM = {
      somethingWrong: ['Something went wrong. Please try again.', { code: 'somethingWrong' }],
      unreachable: ['We couldn’t reach the server. Check your connection and try again.', { code: 'serverUnreachable' }],
      sendFailed: ['Couldn’t send that — try again.', { code: 'sendFailed' }],
    }
    up('error|server', { ...O, phase: 'error', text: 'Margherita 9.50', message: 'That file type isn’t supported — send a photo or a PDF of your menu.' })
    for (const k of ['somethingWrong', 'unreachable']) up(`error|${k}`, { ...O, phase: 'error', text: 'Margherita 9.50', message: UM[k][0], __after: { message: UM[k][1] } })
    up('error|noMessage', { ...O, phase: 'error' })
    for (let i = 0; i < 5; i++) {
      up(`working|${i}`, { ...O, phase: 'working', stepIdx: i })
      up(`working|template|${i}`, { ...O, phase: 'working', stepIdx: i, templateRun: true })
    }
    up('working|slow', { ...O, phase: 'working', stepIdx: 4, slowPrompt: true })
    up('working|slowSample', { ...O, phase: 'working', stepIdx: 4, slowPrompt: true, sampleOffer: true })
    up('working|sampleOnly', { ...O, phase: 'working', stepIdx: 2, sampleOffer: true })
    const F = { ...O, phase: 'menu_failed', failedTruckId: 'demo-failed' }
    up('failed', F)
    up('failed|text', { ...F, text: 'Margherita 9.50' })
    up('failed|email', { ...F, buildEmail: EMAIL })
    up('failed|busy', { ...F, buildEmail: EMAIL, buildBusy: true })
    up('failed|sent', { ...F, buildSent: true })
    up('failed|serverMessage', { ...F, message: 'That doesn’t look like an email address.' })
    up('failed|sendFailed', { ...F, message: UM.sendFailed[0], __after: { message: UM.sendFailed[1] } })
    // presses
    const DEMO = '/api/demo', BUILD = '/api/demo/build-request'
    const T = { ...O, text: 'Margherita 9.50' }
    await press('up|refused', upEl(), T, ['Build my demo →'], { [DEMO]: { status: 500, body: { ok: false } } })
    await press('up|refusedWords', upEl(), T, ['Build my demo →'], { [DEMO]: { status: 413, body: { error: 'That’s a lot of text — please paste just the menu.' } } })
    await press('up|unreachable', upEl(), T, ['Build my demo →'], { [DEMO]: 'throw' })
    await press('up|menuFailed', upEl(), T, ['Build my demo →'], { [DEMO]: { body: { ok: false, outcome: 'menu_failed', truckId: 'demo-failed' } } })
    await press('up|menuFailedRetry', upEl(), T, ['Build my demo →', 'Try this photo again'], { [DEMO]: { body: { ok: false, outcome: 'menu_failed', truckId: 'demo-failed' } } })
    await press('up|menuFailedOther', upEl(), T, ['Build my demo →', '← Upload another photo'], { [DEMO]: { body: { ok: false, outcome: 'menu_failed', truckId: 'demo-failed' } } })
    await press('up|sampleRefused', upEl(), O, ['See sample menu'], { [DEMO]: { status: 500, body: { ok: false } } })
    await press('up|buildRefused', upEl(), { ...F, buildEmail: EMAIL }, ['Send'], { [BUILD]: { status: 500, body: { ok: false } } })
    await press('up|buildRefusedWords', upEl(), { ...F, buildEmail: EMAIL }, ['Send'], { [BUILD]: { status: 400, body: { ok: false, error: 'That doesn’t look like an email address.' } } })
    await press('up|buildUnreachable', upEl(), { ...F, buildEmail: EMAIL }, ['Send'], { [BUILD]: 'throw' })
    await press('up|buildSent', upEl(), { ...F, buildEmail: EMAIL }, ['Send'], { [BUILD]: { body: { ok: true } } })
    await press('up|close', upEl(), { ...O, phase: 'error', message: 'x' }, ['×'])

    // ══ DemoLoopComplete — the card that carries the signup offer ══════════════════════════════════
    const loopOrders = [C.ORDERS.pay_at_hatch, C.ORDERS.card_paid]
    const loop = (key, state, over = {}) => { out[`${cc}|loop|${key}`] = html(state, h(ui.DemoLoopComplete, { token: TOKEN, orderKeys: loopOrders.map(o => o.order_key), orders: loopOrders, loaded: true, phone: C.phone, ...over })) }
    loop('hidden', null)
    loop('one', { visible: true, freshKeys: [loopOrders[0].order_key] })
    loop('admin', { visible: true, freshKeys: [loopOrders[0].order_key] }, { isAdmin: true })
    loop('sample', { visible: true, freshKeys: [loopOrders[0].order_key] }, { isAdmin: true, extractionSource: 'template' })
    loop('ambiguous', { visible: true, freshKeys: loopOrders.map(o => o.order_key) })

    // ══ 🔴 THE ROWS A DEMO IS PROVISIONED WITH (stored values — not translated in this phase) ════════════
    const KEYS = { demo_sessions: [['truck_id']], slot_capacity: [['truck_id', 'event_date', 'slot']], production_slot_usage: [['truck_id', 'event_id', 'production_slot']] }
    const PHOTO_MENU = { categories: ['Pizza', 'Sides', 'Drinks'], items: [
      { name: 'Margherita', description: 'Tomato, mozzarella, basil', price: 9.5, price_missing: false, category: 'Pizza', allergens: ['milk', 'gluten'], dietary: ['vegetarian'], spiciness: null },
      { name: 'Diavola', description: null, price: 11, price_missing: false, category: 'Pizza', allergens: [], dietary: [], spiciness: 2 },
      { name: 'Garlic bread', description: null, price: 4, price_missing: false, category: 'Sides', allergens: [], dietary: [], spiciness: null },
      { name: 'Lemonade', description: null, price: 2.5, price_missing: false, category: 'Drinks', allergens: [], dietary: [], spiciness: null },
    ], existing_categories: [] }
    const countryRows = () => [GB_ROW(), US_ON()].map(snake)
    const runRows = async (key, fn, seed = {}) => {
      // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): a demo is provisioned on the plan flagged is_demo, read through
      // getPlanCatalog — the seeded plans / plan_prices ride along as fixture input and are never recorded (PLAN_TABLES).
      const pg = makeFakePg({ country_settings: countryRows(), trucks: [], truck_vans: [], ...ctx.FIX.planTables(), ...seed }, { keys: KEYS, defaults: { menu_items_db: { is_active: true } } })
      // the seeder reads menu items with their category embedded (`menu_categories!category_id(…)`), which the fake
      // does not resolve: resolve that one embed from the stored categories, so the seeded orders are recorded too
      const from = pg.from.bind(pg)
      pg.from = t => {
        const c = from(t)
        if (t !== 'menu_items_db') return c
        let embed = false
        const select = c.select.bind(c), then = c.then.bind(c)
        c.select = (cols, ...rest) => { embed = /menu_categories/.test(String(cols || '')); return select(cols, ...rest) }
        c.then = (res, rej) => then(r => (embed && r && Array.isArray(r.data)
          ? { ...r, data: r.data.map(row => ({ ...row, menu_categories: (pg.tables.menu_categories || []).find(x => x.id === row.category_id) ?? null })) }
          : r)).then(res, rej)
        return c
      }
      globalThis.__harnessDb = pg
      globalThis.__lpRandN = 0; globalThis.__lpUuidN = 0
      lib.clearCountrySettingsCache()
      let result = null, error = null
      try { result = await kit.quietAsync(() => fn(pg)) } catch (e) { error = { name: e && e.name, message: e && e.message } } finally {
        delete globalThis.__harnessDb; delete globalThis.__extract
      }
      const tables = Object.fromEntries(Object.keys(pg.tables).sort().filter(t => t !== 'country_settings' && !ctx.FIX.PLAN_TABLES.includes(t)).map(t => [t, pg.tables[t]]))
      out[`${cc}|rows|${key}`] = JSON.stringify({ result, error, writes: pg.writes, tables })
      return pg
    }
    const NOW = new Date(ctx.FIX.NOW)
    const LATER = new Date('2026-10-10T11:00:00.000Z')
    if (cc === 'GB') {
      // the template list itself — what a sample demo is built from
      out[`${cc}|rows|templates`] = JSON.stringify(lib.DEMO_TEMPLATES)
      out[`${cc}|rows|kitchenMessages`] = JSON.stringify({ messages: lib.DEMO_KITCHEN_MESSAGES, parsed: [{ intervalMins: 7 }, { cookMins: 0 }, { batchSize: 99 }, { intervalMins: 10, cookMins: 6, batchSize: 3 }, {}].map(r => lib.parseDemoKitchen(r)) })
      // the landing page's three sample menus, as a brand-new demo
      for (const id of ['pizza', 'burgers', 'curries']) {
        await runRows(`sample|${id}`, pg => lib.provisionDemo(pg, { template: lib.getDemoTemplate(id), now: NOW }))
      }
      // a photo that reads
      await runRows('photo', pg => { globalThis.__extract = async () => PHOTO_MENU; return lib.provisionDemo(pg, { file: new File(['x'], 'menu.jpg', { type: 'image/jpeg' }), now: NOW }) })
      // a photo that cannot be read, with no sample to fall back on
      await runRows('photoFailed', pg => { globalThis.__extract = async () => { throw new Error('unreadable') }; return lib.provisionDemo(pg, { file: new File(['x'], 'menu.jpg', { type: 'image/jpeg' }), now: NOW }) })
      // an outreach demo (admin): the prospect's name, a discovery link and the three kitchen numbers
      await runRows('outreach', pg => lib.provisionDemo(pg, { template: lib.getDemoTemplate('pizza'), now: NOW, name: 'Harness Pizza Co', discoveryTruckId: 'dt-harness', kitchen: { intervalMins: 10, prepSecs: 360, batchSize: 3 } }))
      // a fresh demo, then the return visit and the first-open restart on the rows it left
      const built = await runRows('return|build', pg => lib.provisionDemo(pg, { template: lib.getDemoTemplate('pizza'), now: NOW }))
      const seedOf = pg => Object.fromEntries(Object.entries(pg.tables).filter(([t]) => t !== 'country_settings' && !ctx.FIX.PLAN_TABLES.includes(t)).map(([t, rows]) => [t, rows.map(r => ({ ...r }))]))
      const truckId = built.tables.trucks[0] && built.tables.trucks[0].id
      await runRows('return|visit', pg => lib.provisionDemo(pg, { existingTruckId: truckId, now: LATER }), seedOf(built))
      await runRows('return|restart', pg => lib.restartDemoService(pg, truckId, { now: LATER }), seedOf(built))
    } else {
      // demos are GB-built; a US-country demo truck's return visit and restart (fixture only)
      const built = await runRows('return|build', pg => lib.provisionDemo(pg, { template: lib.getDemoTemplate('burgers'), now: NOW }))
      const usSeed = Object.fromEntries(Object.entries(built.tables).filter(([t]) => t !== 'country_settings').map(([t, rows]) => [t, rows.map(r => (t === 'trucks' ? { ...r, country: 'US', currency: 'USD', timezone: 'America/Chicago' } : { ...r }))]))
      const truckId = built.tables.trucks[0] && built.tables.trucks[0].id
      await runRows('return|visit', pg => lib.provisionDemo(pg, { existingTruckId: truckId, now: LATER }), usSeed)
      await runRows('return|restart', pg => lib.restartDemoService(pg, truckId, { now: LATER, tz: 'America/Chicago' }), usSeed)
    }
  }
  return out
}

module.exports = { views }
