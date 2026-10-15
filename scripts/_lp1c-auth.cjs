// scripts/_lp1c-auth.cjs — Language Phase 1c, area `auth` (run by scripts/language-phase-1c.cjs;
// docs/language-phase-1c-report.md). THE ACCOUNT PAGES AND THE SIGNUP EMAILS, byte for byte, for a GB and a US fixture:
//   • /signup, /login, /forgot-password, /reset-password — full HTML in every state (empty, typing, errors, busy /
//     sending, sent, the first-login form, the invalid link, the two login banners and both brand names);
//   • 🔴 THE HANDLERS: each page's form is SUBMITTED with a stubbed fetch / auth client, and every value the handler
//     hands `setError` is recorded — so the fallback sentences a handler writes (not only the ones a render shows)
//     are proven to be the same bytes;
//   • /verify-email (a server component) in every outcome — no token, unknown token, already verified, expired,
//     operator missing, address taken, either write failing, success — on an in-memory database;
//   • lib/email-signup.ts's two emails (verification and welcome) — subject, HTML and text, captured from the Brevo
//     request with fetch stubbed (NO EMAIL IS SENT) — with and without a first name and a truck name, and a name
//     that needs escaping.
// ⚠️ AFTER, the emails take an optional `locale` in their params, and a US fixture passes en-US (BEFORE ignores it);
// the client pages are wrapped, for the US, in the en-US locale (its message file is empty, so the words must match).
const path = require('path')
const { makeFakePg } = require('./_fake-pg.cjs')
const SEEDS = require('./_country-settings-gb.cjs')
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))

const SUPA_STUB = 'export function createSupabaseBrowserClient() { return globalThis.__lpSupa }'
// Each page's `error` setter is wrapped so a handler's every write is recorded (the line is the same at BEFORE and AFTER).
const recordError = file => ({
  file,
  from: 'const [error, setError] = useState<string | null>(null)',
  to: 'const [error, __lpSetError] = useState<string | null>(null)\n  const setError = (v: string | null) => { (globalThis as any).__lpErr?.push(v); __lpSetError(v) }',
})

/** Records each <form>'s onSubmit while `fn` renders. */
function withForms(REPO, fn) {
  const rt = require(path.join(REPO, 'node_modules/react/jsx-runtime'))
  const orig = { jsx: rt.jsx, jsxs: rt.jsxs }
  const forms = []
  const wrap = f => (type, props, key) => { if (type === 'form' && props && props.onSubmit) forms.push(props.onSubmit); return f(type, props, key) }
  rt.jsx = wrap(orig.jsx); rt.jsxs = wrap(orig.jsxs)
  try { const html = fn(); return { html, forms } } finally { rt.jsx = orig.jsx; rt.jsxs = orig.jsxs }
}

// AFTER only: the locale /verify-email hands its success screen, per fixture — the operator's truck's (see `after`).
const SUCCESS_LOCALE = {}

async function views(ctx) {
  const { kit, h, html, AFTER, REPO } = ctx
  const ctxExport = AFTER ? "export { I18nContext } from '@/lib/i18n/use-t'\n" : ''
  const P = {
    signup: 'app/signup/page.tsx', login: 'app/login/page.tsx', forgot: 'app/forgot-password/page.tsx', reset: 'app/reset-password/page.tsx',
  }
  const pages = await kit.bundle('lp1c-auth-pages', [
    `export { default as Signup } from '@/${P.signup}'`,
    `export { default as Login } from '@/${P.login}'`,
    `export { default as Forgot } from '@/${P.forgot}'`,
    `export { default as Reset } from '@/${P.reset}'`,
    "export { default as VerifySuccess } from '@/app/verify-email/VerifyEmailSuccess'",
  ].join('\n') + '\n' + ctxExport, {
    stubs: { '@/lib/supabase/client': SUPA_STUB },
    patches: [
      recordError(P.signup), { file: P.signup, states: ['email', 'password', 'marketing', 'promoCode', 'busy', 'error', 'existing'] },
      recordError(P.login), { file: P.login, states: ['email', 'password', 'loading', 'error', 'showResetSuccess'] },
      { file: P.forgot, states: ['email', 'sent', 'loading'] },
      recordError(P.reset), { file: P.reset, states: ['password', 'confirm', 'loading', 'error'] },
    ],
  })
  const verify = await kit.bundle('lp1c-auth-verify', "export { default as VerifyEmailPage } from '@/app/verify-email/page'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'", {
    stubs: { '@/lib/supabase/client': SUPA_STUB },
  })
  const mail = await kit.bundle('lp1c-auth-mail', "export * from '@/lib/email-signup'")

  const out = {}
  for (const C of [ctx.GB, ctx.US]) {
    const cc = C.cc
    const wrap = el => (pages.I18nContext && cc === 'US' ? h(pages.I18nContext.Provider, { value: { locale: 'en-US', setLocale() {} } }, el) : el)
    const put = (key, Comp, state, search, props) => { out[`${cc}|${key}`] = html(state || null, wrap(h(Comp, props || {})), search ?? '') }

    // ══ /signup ═══════════════════════════════════════════════════════════════════════════════════════
    const S = pages.Signup
    const typed = { email: 'sam@example.test', password: 'correct horse' }
    put('signup|empty', S, null)
    put('signup|empty|demo', S, null, '?demo=demo-abc')
    put('signup|typing|noAt', S, { email: 'sam', password: 'correct horse' })
    put('signup|typing|short', S, { email: 'sam@example.test', password: 'short' })
    put('signup|typing|ready', S, typed)
    put('signup|typing|marketing', S, { ...typed, marketing: true })
    put('signup|typing|promo', S, { ...typed, promoCode: 'SUMMER' })
    put('signup|busy', S, { ...typed, busy: true })
    put('signup|error', S, { ...typed, error: 'That email address is already registered.' })
    put('signup|error|existing', S, { ...typed, error: 'That email address is already registered.', existing: true })

    // ══ /login ════════════════════════════════════════════════════════════════════════════════════════
    const L = pages.Login
    put('login|empty', L, null)
    put('login|typing', L, { email: 'sam@example.test', password: 'secret' })
    put('login|loading', L, { email: 'sam@example.test', password: 'secret', loading: true })
    put('login|error', L, { error: 'Invalid login credentials' })
    put('login|passwordReset', L, null, '?message=password_reset')
    put('login|passwordReset|dismissed', L, { showResetSuccess: false }, '?message=password_reset')
    put('login|emailChanged', L, null, '?message=email_changed')
    put('login|signedUp', L, null, '?message=signed_up')
    put('login|both', L, { showResetSuccess: true }, '?message=email_changed')
    // the brand line reads the host: HatchGrab on a hatchgrab host, Village Foodie anywhere else (and on the server)
    for (const [hk, host] of [['hatchgrab', 'www.hatchgrab.com'], ['other', 'localhost']]) {
      globalThis.window = { location: { hostname: host } }
      try { put(`login|host|${hk}`, L, null) } finally { delete globalThis.window }
    }

    // ══ /forgot-password ══════════════════════════════════════════════════════════════════════════════
    const F = pages.Forgot
    put('forgot|empty', F, null)
    put('forgot|typing', F, { email: 'sam@example.test' })
    put('forgot|sending', F, { email: 'sam@example.test', loading: true })
    put('forgot|sent', F, { sent: true })

    // ══ /reset-password ═══════════════════════════════════════════════════════════════════════════════
    const R = pages.Reset
    put('reset|invalidLink', R, null, '')
    put('reset|invalidLink|falseFlag', R, null, '?firstLogin=no')
    for (const [mk, search] of [['token', '?token=tok-1'], ['firstLogin', '?firstLogin=true']]) {
      put(`reset|${mk}|empty`, R, null, search)
      put(`reset|${mk}|typing`, R, { password: 'correct horse', confirm: 'correct horse' }, search)
      put(`reset|${mk}|saving`, R, { password: 'correct horse', confirm: 'correct horse', loading: true }, search)
      put(`reset|${mk}|error`, R, { error: 'Passwords do not match' }, search)
    }
    put('reset|both', R, null, '?token=tok-1&firstLogin=true')

    // ══ /verify-email's success screen, on its own ══════════════════════════════════════════════════
    put('verifySuccess|plain', pages.VerifySuccess, null, '', { newEmail: 'new@example.test' })
    put('verifySuccess|escaped', pages.VerifySuccess, null, '', { newEmail: 'a<b>&"c"@example.test' })

    // ══ 🔴 THE HANDLERS: submit each form and record what reaches setError ═════════════════════════════
    const submit = async (key, Comp, state, search, env) => {
      const errs = []
      const realFetch = globalThis.fetch
      globalThis.__lpErr = errs
      globalThis.__lpSupa = env.supa
      globalThis.fetch = env.fetch
      try {
        globalThis.__ms = state; globalThis.__msSearch = search
        let forms
        try { ({ forms } = withForms(REPO, () => kit.quiet(() => kit.renderStatic(wrap(h(Comp)))))) } finally { delete globalThis.__ms; delete globalThis.__msSearch }
        if (!forms.length) { out[`${cc}|submit|${key}`] = 'ERROR no form'; return }
        await kit.quietAsync(() => forms[0]({ preventDefault() {} }))
        out[`${cc}|submit|${key}`] = JSON.stringify(errs)
      } catch (e) { out[`${cc}|submit|${key}`] = 'ERROR ' + String(e && e.message || e).slice(0, 200) + ' ' + JSON.stringify(errs) }
      finally { globalThis.fetch = realFetch; delete globalThis.__lpErr; delete globalThis.__lpSupa }
    }
    const reply = body => async () => ({ ok: !!body.ok, status: body.ok ? 200 : 400, json: async () => body, text: async () => JSON.stringify(body) })
    const offline = async () => { throw new TypeError('Failed to fetch') }
    const noAuth = { auth: { signInWithPassword: async () => ({ data: {}, error: { message: 'x' } }), signOut: async () => ({}), updateUser: async () => ({ error: null }) } }
    await submit('signup|apiError', S, typed, '', { fetch: reply({ ok: false, error: 'That email address is already registered.', existing: true }), supa: noAuth })
    await submit('signup|noMessage', S, typed, '', { fetch: reply({ ok: false }), supa: noAuth })
    await submit('signup|offline', S, typed, '', { fetch: offline, supa: noAuth })
    const authErr = message => ({ auth: { signInWithPassword: async () => ({ data: { user: null }, error: { message } }) } })
    await submit('login|supabaseMessage', L, { email: 'sam@example.test', password: 'secret' }, '', { fetch: offline, supa: authErr('Invalid login credentials') })
    await submit('login|noMessage', L, { email: 'sam@example.test', password: 'secret' }, '', { fetch: offline, supa: authErr('') })
    await submit('reset|mismatch', R, { password: 'correct horse', confirm: 'correct horsf' }, '?token=tok-1', { fetch: offline, supa: noAuth })
    await submit('reset|short', R, { password: 'short', confirm: 'short' }, '?token=tok-1', { fetch: offline, supa: noAuth })
    await submit('reset|apiError', R, { password: 'correct horse', confirm: 'correct horse' }, '?token=tok-1', { fetch: reply({ error: 'This reset link has expired.' }), supa: noAuth })
    await submit('reset|apiNoMessage', R, { password: 'correct horse', confirm: 'correct horse' }, '?token=tok-1', { fetch: async () => ({ ok: false, status: 500, json: async () => ({}) }), supa: noAuth })
    await submit('reset|firstLoginError', R, { password: 'correct horse', confirm: 'correct horse' }, '?firstLogin=true',
      { fetch: offline, supa: { auth: { updateUser: async () => ({ error: { message: 'New password should be different from the old password.' } }) } } })
    await submit('reset|firstLoginMismatch', R, { password: 'correct horse', confirm: 'nope nope' }, '?firstLogin=true', { fetch: offline, supa: noAuth })

    // ══ /verify-email (server component) on an in-memory database ═════════════════════════════════════
    const future = '2026-10-10T17:20:00.000Z', past = '2026-10-08T17:20:00.000Z'
    const change = { id: 'chg-1', token: 'tok-ok', operator_id: 'op-1', old_email: 'old@example.test', new_email: 'new@example.test', expired_at: future, verified_at: null }
    const vTables = (over = {}) => ({
      operator_email_changes: [{ ...change, ...(over.change || {}) }],
      operators: over.noOperator ? [] : [{ id: 'op-1', auth_user_id: 'au-1', email: 'old@example.test' }],
      trucks: [{ id: 'test-truck', operator_id: 'op-1', country: cc, created_at: '2026-01-01T00:00:00Z', setup_step: 'done', dashboard_token: 'harness', name: 'Pizza Kitchen' }],
      truck_users: [],
      country_settings: [snake(SEEDS.gbFromSeed()), snake({ ...SEEDS.usFromSeed(), enabled: true })],
    })
    const vcall = async (key, token, over = {}) => {
      const db = makeFakePg(vTables(over))
      const users = over.conflict ? [{ id: 'au-2', email: 'new@example.test' }, { id: 'au-1', email: 'old@example.test' }] : [{ id: 'au-1', email: 'old@example.test' }]
      const from = t => {
        const q = db.from(t)
        if (over.failUpdate === t) {
          const upd = q.update.bind(q)
          q.update = p => { const r = upd(p); const thenable = Object.create(r); thenable.eq = () => thenable; thenable.then = (res, rej) => Promise.resolve({ data: null, error: { message: 'harness: update failed' } }).then(res, rej); return thenable }
        }
        return q
      }
      globalThis.__harnessDb = { ...db, from, rpc: async () => ({ data: null, error: null }),
        auth: { admin: { listUsers: async () => ({ data: { users }, error: null }), updateUserById: async () => ({ data: null, error: over.failAuth ? { message: 'harness: auth failed' } : null }) } } }
      verify.clearCountrySettingsCache?.()
      try {
        const el = await kit.quietAsync(() => verify.VerifyEmailPage({ searchParams: Promise.resolve(token == null ? {} : { token }) }))
        out[`${cc}|verify|${key}`] = html(null, el)
        if (el && el.props && 'locale' in el.props) SUCCESS_LOCALE[`${cc}|${key}`] = el.props.locale
        // the rows it writes (the same at BEFORE and AFTER: the words never reach the database)
        out[`${cc}|verify|${key}|writes`] = JSON.stringify(db.writes)
      } catch (e) { out[`${cc}|verify|${key}`] = 'THREW ' + String(e && e.message || e).slice(0, 200) }
      finally { delete globalThis.__harnessDb }
    }
    await vcall('noToken', null)
    await vcall('unknown', 'nope')
    await vcall('verified', 'tok-ok', { change: { verified_at: past } })
    await vcall('expired', 'tok-ok', { change: { expired_at: past } })
    await vcall('noOperator', 'tok-ok', { noOperator: true })
    await vcall('conflict', 'tok-ok', { conflict: true })
    await vcall('operatorWriteFailed', 'tok-ok', { failUpdate: 'operators' })
    await vcall('authWriteFailed', 'tok-ok', { failAuth: true })
    await vcall('success', 'tok-ok')
    await vcall('success|truckUsersFailed', 'tok-ok', { failUpdate: 'truck_users' })

    // ══ the signup emails (lib/email-signup.ts) — captured from the Brevo request; nothing is sent ═════════════
    const capture = async (key, fn) => {
      const sends = []
      const realFetch = globalThis.fetch, realKey = process.env.BREVO_API_KEY
      process.env.BREVO_API_KEY = 'harness-not-a-key'
      globalThis.fetch = async (u, init) => {
        if (String(u).includes('brevo')) { const b = JSON.parse(init.body); sends.push({ to: b.to?.[0]?.email, replyTo: b.replyTo?.email, senderName: b.sender?.name, subject: b.subject, html: b.htmlContent, text: b.textContent ?? null }) }
        return { ok: true, status: 200, text: async () => '{}', json: async () => ({}) }
      }
      try { await kit.quietAsync(fn); out[`${cc}|mail|${key}`] = sends.length === 1 ? sends[0] : { sends } }
      catch (e) { out[`${cc}|mail|${key}`] = 'ERROR ' + String(e && e.message || e).slice(0, 200) }
      finally {
        globalThis.fetch = realFetch
        if (realKey === undefined) delete process.env.BREVO_API_KEY; else process.env.BREVO_API_KEY = realKey
      }
    }
    const locale = C.fmt.locale
    const names = { named: 'Sam', none: null }
    const trucks = { truck: 'Pizza Kitchen', escaped: 'Pizza <Kitchen> & "Co"', none: null }
    for (const [nk, firstName] of Object.entries(names)) {
      for (const [tk, truckName] of Object.entries(trucks)) {
        await capture(`verify|${nk}|${tk}`, () => mail.sendSignupVerificationEmail({ to: 'sam@example.test', firstName, truckName, verifyUrl: 'https://www.hatchgrab.com/api/auth/verify-signup?token=abc&x=1', locale }))
        await capture(`welcome|${nk}|${tk}`, () => mail.sendOperatorWelcomeEmail({ to: 'sam@example.test', firstName, truckName, manageUrl: 'https://www.hatchgrab.com/manage/harness', locale }))
      }
    }
    await capture('welcome|escapedName', () => mail.sendOperatorWelcomeEmail({ to: 'sam@example.test', firstName: 'S<a>m', truckName: null, manageUrl: 'https://www.hatchgrab.com/manage/harness', locale }))
    await capture('verify|escapedName', () => mail.sendSignupVerificationEmail({ to: 'sam@example.test', firstName: 'S<a>m', truckName: null, verifyUrl: 'https://www.hatchgrab.com/api/auth/verify-signup?token=abc', locale }))
    out[`${cc}|mail|firstNameFrom`] = JSON.stringify(['Sam Harness', '  ', null, undefined, 'sam.h'].map(x => mail.firstNameFrom(x)))
    // ⚠️ GREETING_FALLBACK / TRUCK_FALLBACK ('there' / 'your truck') were exported at BEFORE and imported by nothing;
    // they are whole sentences in emailSignup now, and every email above proves the words did not change.
    out[`${cc}|mail|replyTo`] = mail.HATCHGRAB_REPLY_TO
  }
  return out
}

/** AFTER only: the words are the same bytes (above); this proves WHICH language each fixture reads — the GB operator's
 *  page is en-GB and the US operator's en-US (from the truck's country, through localeForTruck). */
function after({ t, head }) {
  head('auth · /verify-email reads the operator\'s truck\'s locale')
  for (const [k, want] of [['GB|success', 'en-GB'], ['US|success', 'en-US'], ['GB|success|truckUsersFailed', 'en-GB'], ['US|success|truckUsersFailed', 'en-US']])
    t(`verify-email ${k}: the success screen is given ${want}`, SUCCESS_LOCALE[k] === want, `got ${SUCCESS_LOCALE[k]}`)
}

module.exports = { views, after }
