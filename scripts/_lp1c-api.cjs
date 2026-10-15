// scripts/_lp1c-api.cjs — Language Phase 1c, area `api` (docs/language-phase-1c-report.md): every onboarding route —
// app/api/setup (POST, GET), app/api/setup/countries, app/api/signup, app/api/auth/* (cancel-email-change,
// change-email, forgot-password, me, post-login, resend-verification, reset-password, update-profile, verify-signup),
// app/api/demo (POST), app/api/demo/{build-request,restart,return,save-email} and app/api/account/request-deletion
// (GET, POST) — for a GB and a US case, as status, body, the Location of a redirect, Retry-After, every email the
// route composes itself (Brevo, recorded — nothing is sent), the arguments it hands the signup-email senders (stubbed)
// and every write it makes to the fake database.
//
// 🔴 NAMED DIFFERENCE 1 (this phase): a refusal whose `error` is OUR sentence gains "code" and "params", LAST; the
// `error` text and every other field are unchanged. `compare` proves it per field, as Phase 1b's `api` area did: the
// BEFORE body is the exact text prefix of the AFTER body, the only fields added are `code` and `params`, the code is an
// `errorsOnboarding` message, and that message with its params is today's `error`, in en-GB and en-US. A body that
// does not change (a success, a redirect, or a pass-through of text that is not ours — Supabase's, the database's, an
// exception's) must be byte-identical, and so must every email, write and stub call.
// ⚠️ NOTHING REAL: Supabase is scripts/_fake-pg.cjs, the auth client is a stand-in, the truck and demo provisioners,
// the signup-email senders, the rate limiter and the admin check are stubs, and Brevo is a recorder. No email leaves.
const path = require('path')
const { makeFakePg } = require('./_fake-pg.cjs')
const SEEDS = require('./_country-settings-gb.cjs')
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))

const HG = 'https://hatchgrab.test'
const rec = name => `(...a) => { (globalThis.__calls ||= []).push([${JSON.stringify(name)}, JSON.parse(JSON.stringify(a[a.length - 1] ?? null))]) }`

function stubs() {
  return {
    '@/lib/supabase/server': `export async function createSupabaseServerClient() {
  return { auth: { getUser: async () => ({ data: { user: globalThis.__harnessUser ?? null }, error: null }) } }
}`,
    '@/lib/ratelimit': `const lim = name => ({ async limit() { const r = (globalThis.__rl || {})[name]; if (r === 'throw') throw new Error('limiter down'); return { success: r !== 'deny' } } })
export const signupRatelimit = lim('signup'), signupEmailRatelimit = lim('signupEmail'), demoRatelimit = lim('demo')`,
    // firstNameFrom as lib/email-signup.ts has it (a stub module cannot import the real one); only its result is recorded.
    '@/lib/email-signup': `export function firstNameFrom(name) { const first = (name ?? '').trim().split(/\\s+/)[0]; return first || null }
export const sendSignupVerificationEmail = async ${rec('sendSignupVerificationEmail')}
export const sendOperatorWelcomeEmail = async ${rec('sendOperatorWelcomeEmail')}`,
    '@/lib/provision-truck': `export async function provisionTruck(_db, opts) {
  ;(globalThis.__calls ||= []).push(['provisionTruck', JSON.parse(JSON.stringify(opts))])
  const m = globalThis.__provision
  if (m === 'throwError') throw new Error('That truck name is taken.')
  if (m === 'throwString') throw 'boom'
  return { truck: { id: 'new-truck', dashboard_token: 'tok-new', name: opts.name }, warnings: [] }
}`,
    '@/lib/self-serve-discovery-link': 'export async function linkDiscoveryRowForSelfServe() { return null }',
    '@/lib/signup-countries': `export async function signupCountries() { if (globalThis.__countries === 'throw') throw new Error('no countries'); return [{ code: 'GB', name: 'United Kingdom' }, { code: 'US', name: 'United States' }] }
export function guessSignupCountry(list, ip) { return { code: ip === 'US' ? 'US' : 'GB', fromLocation: !!ip } }`,
    '@/lib/demo-templates': "export function getDemoTemplate(id) { return id === 'pizza' ? { id: 'pizza', name: 'Pizza' } : null }",
    '@/lib/provision-demo': `export class ProvisionDemoError extends Error { constructor(m, truckId) { super(m); this.truckId = truckId } }
export async function provisionDemo(_db, input) {
  ;(globalThis.__calls ||= []).push(['provisionDemo', { file: input.file ? input.file.name : null, text: input.text ?? null, template: input.template ? input.template.id : null, existingTruckId: input.existingTruckId ?? null }])
  const m = globalThis.__provisionDemo
  if (m === 'throwDemo') throw new ProvisionDemoError('gemini said no', 'demo-x')
  if (m === 'throw') throw new Error('unexpected')
  if (m === 'failed') return { truckId: 'demo-failed', dashboardToken: 'demo-tok-f', menu: { kind: 'failed', reason: 'We couldn’t read a menu from that.' }, warnings: ['x'] }
  return { truckId: 'demo-new', dashboardToken: 'demo-tok-new', menu: m === 'template' ? { kind: 'template', inserted: 12 } : { kind: 'imported', inserted: 9, partial: true }, warnings: [] }
}`,
    '@/lib/demo-restart': `export async function restartDemoService(_db, id) {
  if (globalThis.__restart === 'throw') throw new Error('restart broke')
  return { ordersDeleted: 3, eventsDeleted: 1, seededOrders: 8, warnings: [], event: { id: 'ev-new', event_date: '2026-10-09', start_time: '18:00', end_time: '20:00' } }
}`,
    '@/lib/demo-session': `export async function claimDemoFirstOpen() { const c = globalThis.__claim || 'claimed'; return c === 'claimed' ? { claimed: true, at: '2026-10-09T17:20:00.000Z' } : { claimed: false, reason: c } }
export async function saveDemoEmail(_db, id, email) { ;(globalThis.__calls ||= []).push(['saveDemoEmail', [id, email]]); return globalThis.__save || { ok: true, expiresAt: '2026-10-23T17:20:00.000Z' } }
export async function markReturnEmailSent(_db, id) { ;(globalThis.__calls ||= []).push(['markReturnEmailSent', id]) }`,
    '@/lib/auth/admin': "export async function verifyAdmin() { if (globalThis.__admin === 'throw') throw new Error('no'); return globalThis.__admin === true }",
    // Tokens are random in production; fixed here so a link in an email is the same on every run.
    crypto: "import * as real from 'node:crypto'\nexport * from 'node:crypto'\nexport function randomBytes(n) { return { toString: () => 'f'.repeat(n * 2) } }\nexport default { ...real, randomBytes }",
  }
}

function baseTables(C, o = {}) {
  const gb = snake(SEEDS.gbFromSeed()), us = snake({ ...SEEDS.usFromSeed(), enabled: true })
  if (o.countryOff) (C.cc === 'US' ? us : gb).enabled = false
  return {
    country_settings: [gb, us],
    operators: [{ id: 'op-1', auth_user_id: 'u-1', email: 'owner@example.test', name: 'Olive Owner', first_name: 'Olive', last_name: 'Owner', phone: null, is_admin: false, deletion_requested_at: null, deletion_due_at: null },
      { id: 'op-admin', auth_user_id: 'u-admin', email: 'admin@example.test', name: 'Ada Admin', is_admin: true }],
    truck_users: [{ id: 'tu-1', auth_user_id: 'u-staff', email: 'staff@example.test', name: 'Stan Staff', truck_id: 'test-truck', role: 'staff' }],
    trucks: [], orders: [], demo_sessions: [], operator_email_changes: [], operator_email_verifications: [], password_reset_tokens: [],
  }
}

async function views(ctx) {
  const { kit } = ctx
  const { NextRequest } = require(path.join(ctx.REPO, 'node_modules/next/server'))
  process.env.NEXT_PUBLIC_HATCHGRAB_URL = HG
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL = 'support@hatchgrab.test'
  const ST = stubs()
  const cache = "\nexport { clearCountrySettingsCache } from '@/lib/country-settings'"
  const M = await kit.bundle('lp1c-api', `
export { POST as setupPOST, GET as setupGET } from '@/app/api/setup/route'
export { GET as countriesGET } from '@/app/api/setup/countries/route'
export { POST as signupPOST } from '@/app/api/signup/route'
export { POST as cancelChangePOST } from '@/app/api/auth/cancel-email-change/route'
export { POST as changeEmailPOST } from '@/app/api/auth/change-email/route'
export { POST as forgotPOST } from '@/app/api/auth/forgot-password/route'
export { GET as meGET } from '@/app/api/auth/me/route'
export { GET as postLoginGET } from '@/app/api/auth/post-login/route'
export { POST as resendPOST } from '@/app/api/auth/resend-verification/route'
export { POST as resetPOST } from '@/app/api/auth/reset-password/route'
export { POST as profilePOST } from '@/app/api/auth/update-profile/route'
export { GET as verifySignupGET } from '@/app/api/auth/verify-signup/route'
export { POST as restartPOST } from '@/app/api/demo/restart/route'
export { GET as returnGET } from '@/app/api/demo/return/route'
export { POST as saveEmailPOST } from '@/app/api/demo/save-email/route'
export { GET as deletionGET, POST as deletionPOST } from '@/app/api/account/request-deletion/route'` + cache, { stubs: ST })
  // The demo upload and build-request routes skip their rate limit outside production; built as production so the
  // limited branch is reachable (a request with no x-forwarded-for is still loopback and skips it).
  const P = await kit.bundle('lp1c-api-prod', `
export { POST as demoPOST } from '@/app/api/demo/route'
export { POST as buildPOST } from '@/app/api/demo/build-request/route'` + cache, { stubs: ST, define: { 'process.env.NODE_ENV': '"production"' } })

  const out = {}
  const ENV_KEYS = ['BREVO_API_KEY', 'SIGNUP_PUBLIC']
  const call = async (key, o, fn) => {
    const base = makeFakePg(o.tables, { keys: o.keys || {}, defaults: o.defaults || {} })
    const fail = o.fail || {}
    const errChain = () => { const e = { data: null, error: { message: 'harness: the database refused the write', code: 'XX000' }, count: null }; const p = new Proxy(function () {}, { get: (_, k) => (k === 'then' ? res => res(e) : () => p) }); return p }
    const from = t => { const c = base.from(t); const ops = fail[t]; if (!ops) return c; return new Proxy(c, { get: (x, k) => (ops.includes(k) ? () => errChain() : x[k]) }) }
    const authCalls = []
    const users = { 'jwt-owner': { id: 'u-1', email: 'owner@example.test' }, 'jwt-staff': { id: 'u-staff', email: 'staff@example.test' } }
    globalThis.__harnessDb = {
      ...base, from,
      auth: {
        getUser: async jwt => ({ data: { user: users[jwt] ?? null }, error: null }),
        admin: {
          createUser: async a => { authCalls.push(['createUser', a]); return o.createUser || { data: { user: { id: 'u-new' } }, error: null } },
          deleteUser: async id => { authCalls.push(['deleteUser', id]); return { error: null } },
          updateUserById: async (id, a) => { authCalls.push(['updateUserById', id, a]); return o.updateFails ? { error: { message: 'auth refused' } } : { error: null } },
        },
      },
    }
    globalThis.__harnessUser = o.user ?? null
    globalThis.__calls = []
    globalThis.__rl = o.rl || {}
    for (const k of ['provision', 'countries', 'provisionDemo', 'restart', 'claim', 'save', 'admin']) globalThis['__' + k] = o[k]
    const sends = []
    const realFetch = globalThis.fetch, realEnv = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]))
    if (o.noBrevo) delete process.env.BREVO_API_KEY; else process.env.BREVO_API_KEY = 'harness-not-a-key'
    if (o.signupPublic) process.env.SIGNUP_PUBLIC = 'true'; else delete process.env.SIGNUP_PUBLIC
    globalThis.fetch = async (u, init) => {
      if (String(u).includes('brevo')) {
        const b = JSON.parse(init.body)
        sends.push({ from: b.sender, to: b.to, replyTo: b.replyTo ?? null, subject: b.subject, html: b.htmlContent, text: b.textContent ?? null })
        if (o.brevo === 'throw') throw new Error('network down')
        if (o.brevo === 'fail') return { ok: false, status: 502, text: async () => 'bad gateway', json: async () => ({}) }
      }
      return { ok: true, status: 200, text: async () => '{}', json: async () => ({}) }
    }
    M.clearCountrySettingsCache?.(); P.clearCountrySettingsCache?.()
    try {
      const res = await kit.quietAsync(fn)
      out[key] = { status: res.status, body: await res.text(), location: res.headers.get('location'), retryAfter: res.headers.get('retry-after'),
        cacheControl: res.headers.get('cache-control'), sends, calls: globalThis.__calls, auth: authCalls, writes: base.writes }
    } catch (e) { out[key] = 'ERROR ' + String(e && e.message || e).slice(0, 200) }
    finally {
      globalThis.fetch = realFetch
      for (const k of ENV_KEYS) { if (realEnv[k] === undefined) delete process.env[k]; else process.env[k] = realEnv[k] }
      for (const k of ['harnessDb', 'harnessUser', 'calls', 'rl', 'provision', 'countries', 'provisionDemo', 'restart', 'claim', 'save', 'admin']) delete globalThis['__' + k]
    }
  }
  const req = (url, { method = 'GET', body, headers = {} } = {}) => new NextRequest(`http://127.0.0.1${url}`, {
    method, headers: body instanceof FormData ? headers : { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: body instanceof FormData || typeof body === 'string' ? body : JSON.stringify(body) }),
  })
  const post = (url, body, headers) => req(url, { method: 'POST', body, headers })
  const OWNER = { id: 'u-1', email: 'owner@example.test' }
  const XFF = { 'x-forwarded-for': '203.0.113.7' }

  for (const C of [ctx.GB, ctx.US]) {
    const cc = C.cc
    const T = (o = {}) => ({ ...baseTables(C, o), ...(o.extra || {}) })
    const phone = cc === 'US' ? '(201) 555-0123' : '07700 900123'
    const zone = cc === 'US' ? 'America/Chicago' : 'Europe/London'
    const truck = (over = {}) => ({ id: 'test-truck', name: 'Pizza Kitchen', dashboard_token: 'tok-real', operator_id: 'op-1', setup_step: null, country: cc, timezone: zone, created_at: '2026-01-01T00:00:00.000Z', ...over })
    const demoTruck = (over = {}) => ({ id: 'demo-abc', name: 'Demo Pizza', slug: 'demo-abc', dashboard_token: 'demo-tok', country: cc, timezone: zone, ...over })
    const ct = (over = {}) => ({ action: 'create_truck', name: 'Harness Pizza', contact_phone: phone, country: cc, timezone: zone, base_place_name: 'Harnessville', ...over })

    // ── /api/setup POST ──
    const setup = (k, body, o = {}) => call(`${cc}|setup|${k}`, { user: OWNER, tables: T(o), ...o }, () => M.setupPOST(post('/api/setup', body)))
    await setup('noUser', ct(), { user: null })
    await setup('noOperator', ct(), { user: { id: 'u-nobody' } })
    await setup('badJson', '{not json')
    await setup('nameShort', ct({ name: 'A' }))
    await setup('phoneMissing', ct({ contact_phone: '  ' }))
    await setup('countryMissing', ct({ country: '' }))
    await setup('countryUnknown', ct({ country: 'ZZ' }))
    await setup('countryOff', ct(), { countryOff: true })
    await setup('zoneBad', ct({ timezone: 'Mars/Base' }))
    await setup('townMissing', ct({ base_place_name: ' ' }))
    await setup('townLong', ct({ base_place_name: 'x'.repeat(121) }))
    await setup('phoneBad', ct({ contact_phone: '12' }))
    await setup('resumed', ct(), { extra: { trucks: [truck({ setup_step: 'menu' })] } })
    await setup('created', ct({ phone_is_whatsapp: true }))
    await setup('provisionThrows', ct(), { provision: 'throwError' })
    await setup('provisionThrowsString', ct(), { provision: 'throwString' })
    await setup('stepUnknown', { action: 'set_step', step: 'party', truck_id: 'test-truck' })
    await setup('stepOk', { action: 'set_step', step: 'event', truck_id: 'test-truck' }, { extra: { trucks: [truck({ setup_step: 'menu' })] } })
    await setup('stepDbError', { action: 'set_step', step: 'event', truck_id: 'test-truck' }, { fail: { trucks: ['update'] } })
    await setup('unknownAction', { action: 'explode' })
    // ── /api/setup GET ──
    const sget = (k, q, o = {}) => call(`${cc}|setupGet|${k}`, { user: OWNER, tables: T(o), ...o }, () => M.setupGET(req(`/api/setup${q}`)))
    await sget('noUser', '', { user: null })
    await sget('noOperator', '', { user: { id: 'u-nobody' } })
    await sget('checkNone', '?check=truck')
    await sget('checkTruck', '?check=truck', { extra: { trucks: [truck()] } })
    await sget('noClaim', '')
    await sget('noExtraction', '', { extra: { demo_sessions: [{ truck_id: 'demo-abc', claimed_by_operator_id: 'op-1', extraction: null, created_at: '2026-10-01' }] } })
    await sget('templateWithheld', '', { extra: { demo_sessions: [{ truck_id: 'demo-abc', claimed_by_operator_id: 'op-1', extraction: { items: [1] }, extraction_source: 'template', created_at: '2026-10-01' }] } })
    await sget('extraction', '', { extra: { demo_sessions: [{ truck_id: 'demo-abc', claimed_by_operator_id: 'op-1', extraction: { items: [{ name: 'Margherita' }] }, extraction_source: 'upload', created_at: '2026-10-01' }] } })
    // ── /api/setup/countries ──
    await call(`${cc}|countries|ok`, { tables: T() }, () => M.countriesGET(req('/api/setup/countries', { headers: { 'x-vercel-ip-country': cc } })))
    await call(`${cc}|countries|throws`, { tables: T(), countries: 'throw' }, () => M.countriesGET(req('/api/setup/countries')))

    // ── /api/signup ──
    const su = { email: 'New@Example.test', password: 'longenough', first_name: 'Nia', last_name: 'New', signup_code: 'SUMMER', demo: 'demo-tok' }
    const signup = (k, body, o = {}) => call(`${cc}|signup|${k}`, { signupPublic: true, tables: T(o), ...o }, () => M.signupPOST(post('/api/signup', body, XFF)))
    await signup('badJson', '{nope')
    await signup('badEmail', { ...su, email: 'nope' })
    await signup('shortPassword', { ...su, password: 'short' })
    await signup('gateClosed', su, { signupPublic: false })
    await signup('gateAdmin', su, { signupPublic: false, user: { id: 'u-admin' }, extra: { trucks: [demoTruck()], demo_sessions: [{ id: 'ds-1', truck_id: 'demo-abc' }] } })
    await signup('rateLimitedIp', su, { rl: { signup: 'deny' } })
    await signup('rateLimitedEmail', su, { rl: { signupEmail: 'deny' } })
    await signup('limiterDown', su, { rl: { signup: 'throw' } })
    await signup('existing', su, { createUser: { data: null, error: { message: 'A user with this email address has already been registered' } } })
    await signup('authError', su, { createUser: { data: null, error: { message: 'Password is known to be weak' } } })
    await signup('authNoUser', su, { createUser: { data: { user: null }, error: null } })
    await signup('operatorInsertFails', su, { fail: { operators: ['insert'] } })
    await signup('verifyRowFails', su, { fail: { operator_email_verifications: ['insert'] } })
    await signup('ok', su, { extra: { trucks: [demoTruck()], demo_sessions: [{ id: 'ds-1', truck_id: 'demo-abc' }] } })
    await signup('okPlain', { email: 'plain@example.test', password: 'longenough' })

    // ── /api/auth/* ──
    const A = (route, fn, k, body, o = {}) => call(`${cc}|${route}|${k}`, { user: OWNER, tables: T(o), ...o }, () => fn(post(`/api/auth/${route}`, body, o.headers)))
    const change = { id: 'chg-1', operator_id: 'op-1', new_email: 'new@example.test', token: 'tok-chg', expires_at: '2026-10-10T00:00:00.000Z', verified_at: null }
    // cancel-email-change
    await A('cancel-email-change', M.cancelChangePOST, 'noUser', { changeId: 'chg-1' }, { user: null })
    await A('cancel-email-change', M.cancelChangePOST, 'bearer', { changeId: 'chg-1' }, { user: null, headers: { authorization: 'Bearer jwt-owner' }, extra: { operator_email_changes: [change] } })
    await A('cancel-email-change', M.cancelChangePOST, 'noChangeId', {})
    await A('cancel-email-change', M.cancelChangePOST, 'noOperator', { changeId: 'chg-1' }, { user: { id: 'u-nobody' } })
    await A('cancel-email-change', M.cancelChangePOST, 'deleteFails', { changeId: 'chg-1' }, { fail: { operator_email_changes: ['delete'] } })
    await A('cancel-email-change', M.cancelChangePOST, 'ok', { changeId: 'chg-1' }, { extra: { operator_email_changes: [change] } })
    // change-email
    await A('change-email', M.changeEmailPOST, 'noUser', { newEmail: 'x@example.test' }, { user: null })
    await A('change-email', M.changeEmailPOST, 'noEmail', { newEmail: '  ' })
    await A('change-email', M.changeEmailPOST, 'noOperator', { newEmail: 'x@example.test' }, { user: { id: 'u-nobody' } })
    await A('change-email', M.changeEmailPOST, 'same', { newEmail: ' OWNER@example.test ' })
    await A('change-email', M.changeEmailPOST, 'takenOperator', { newEmail: 'admin@example.test' })
    await A('change-email', M.changeEmailPOST, 'takenStaff', { newEmail: 'staff@example.test' })
    await A('change-email', M.changeEmailPOST, 'insertFails', { newEmail: 'fresh@example.test' }, { fail: { operator_email_changes: ['insert'] } })
    await A('change-email', M.changeEmailPOST, 'brevoFails', { newEmail: 'fresh@example.test' }, { brevo: 'fail', defaults: { operator_email_changes: { token: 'tok-db' } } })
    await A('change-email', M.changeEmailPOST, 'ok', { newEmail: 'fresh@example.test' }, { defaults: { operator_email_changes: { token: 'tok-db' } } })
    // forgot-password
    await A('forgot-password', M.forgotPOST, 'noEmail', {})
    await A('forgot-password', M.forgotPOST, 'unknown', { email: 'nobody@example.test' })
    await A('forgot-password', M.forgotPOST, 'brevoFails', { email: ' Owner@Example.test ' }, { brevo: 'fail' })
    await A('forgot-password', M.forgotPOST, 'ok', { email: 'owner@example.test' }, { extra: { password_reset_tokens: [{ id: 'prt-old', operator_id: 'op-1', token: 'old', used_at: null }] } })
    // me
    const me = (k, o = {}) => call(`${cc}|me|${k}`, { user: OWNER, tables: T(o), ...o }, () => M.meGET(req('/api/auth/me', { headers: o.headers || {} })))
    await me('noUser', { user: null })
    await me('bearer', { user: null, headers: { authorization: 'Bearer jwt-owner' } })
    await me('operator')
    await me('staff', { user: { id: 'u-staff', email: 'staff@example.test' } })
    await me('bare', { user: { id: 'u-nobody', email: 'nobody@example.test' } })
    // post-login
    const pl = (k, o = {}) => call(`${cc}|post-login|${k}`, { user: OWNER, tables: T(o), ...o }, () => M.postLoginGET(req('/api/auth/post-login')))
    await pl('noUser', { user: null })
    await pl('noTrucks')
    await pl('settled', { extra: { trucks: [truck()] } })
    await pl('midSetup', { extra: { trucks: [truck({ setup_step: 'menu' })] } })
    await pl('repair', { user: { id: 'u-orphan', email: 'orphan@example.test' } })
    // resend-verification
    await A('resend-verification', M.resendPOST, 'noUser', { changeId: 'chg-1' }, { user: null })
    await A('resend-verification', M.resendPOST, 'noChangeId', {})
    await A('resend-verification', M.resendPOST, 'notFound', { changeId: 'chg-x' })
    await A('resend-verification', M.resendPOST, 'verified', { changeId: 'chg-1' }, { extra: { operator_email_changes: [{ ...change, verified_at: '2026-10-01' }] } })
    await A('resend-verification', M.resendPOST, 'notOwner', { changeId: 'chg-1' }, { extra: { operator_email_changes: [{ ...change, operator_id: 'op-admin' }] } })
    await A('resend-verification', M.resendPOST, 'brevoFails', { changeId: 'chg-1' }, { brevo: 'fail', extra: { operator_email_changes: [change] } })
    await A('resend-verification', M.resendPOST, 'ok', { changeId: 'chg-1' }, { extra: { operator_email_changes: [change] } })
    // reset-password
    const tokRow = (over = {}) => ({ id: 'prt-1', operator_id: 'op-1', token: 'tok-reset', expires_at: '2026-10-09T18:00:00.000Z', used_at: null, ...over })
    await A('reset-password', M.resetPOST, 'missing', { token: 'tok-reset' })
    await A('reset-password', M.resetPOST, 'short', { token: 'tok-reset', password: 'short' })
    await A('reset-password', M.resetPOST, 'invalid', { token: 'nope', password: 'longenough' })
    await A('reset-password', M.resetPOST, 'used', { token: 'tok-reset', password: 'longenough' }, { extra: { password_reset_tokens: [tokRow({ used_at: '2026-10-09T17:00:00.000Z' })] } })
    await A('reset-password', M.resetPOST, 'expired', { token: 'tok-reset', password: 'longenough' }, { extra: { password_reset_tokens: [tokRow({ expires_at: '2026-10-09T17:00:00.000Z' })] } })
    await A('reset-password', M.resetPOST, 'noAccount', { token: 'tok-reset', password: 'longenough' }, { extra: { password_reset_tokens: [tokRow({ operator_id: 'op-gone' })] } })
    await A('reset-password', M.resetPOST, 'updateFails', { token: 'tok-reset', password: 'longenough' }, { updateFails: true, extra: { password_reset_tokens: [tokRow()] } })
    await A('reset-password', M.resetPOST, 'ok', { token: 'tok-reset', password: 'longenough' }, { extra: { password_reset_tokens: [tokRow()] } })
    // update-profile
    await A('update-profile', M.profilePOST, 'noUser', { name: 'X' }, { user: null })
    await A('update-profile', M.profilePOST, 'nothing', {})
    await A('update-profile', M.profilePOST, 'ok', { name: ' Olive O ', phone: phone }, { extra: { truck_users: [{ id: 'tu-o', auth_user_id: 'u-1', name: 'Olive' }] } })
    // verify-signup (redirects; the welcome email is the auth area's builder — its arguments are recorded)
    const vrow = (over = {}) => ({ id: 'v-1', operator_id: 'op-1', email: 'owner@example.test', token: 'tok-v', expires_at: '2026-11-01T00:00:00.000Z', verified_at: null, ...over })
    const vs = (k, q, o = {}) => call(`${cc}|verify-signup|${k}`, { tables: T(o), ...o }, () => M.verifySignupGET(req(`/api/auth/verify-signup${q}`)))
    await vs('noToken', '')
    await vs('unknown', '?token=nope')
    await vs('okNoTruck', '?token=tok-v', { extra: { operator_email_verifications: [vrow()] } })
    await vs('okTruck', '?token=tok-v', { extra: { operator_email_verifications: [vrow()], trucks: [truck({ setup_step: 'menu' })] } })
    await vs('already', '?token=tok-v', { extra: { operator_email_verifications: [vrow({ verified_at: '2026-10-01' })], trucks: [truck()] } })
    await vs('expired', '?token=tok-v', { extra: { operator_email_verifications: [vrow({ expires_at: '2026-10-01T00:00:00.000Z' })] } })

    // ── /api/demo (POST, multipart) ──
    const form = (parts) => { const f = new FormData(); for (const [k, v] of Object.entries(parts)) f.append(k, v); return f }
    const demo = (k, body, o = {}) => call(`${cc}|demo|${k}`, { tables: T(o), ...o }, () => P.demoPOST(post('/api/demo', body, o.headers)))
    await demo('badForm', '{"not":"a form"}')
    await demo('tooBig', form({ file: new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'menu.jpg', { type: 'image/jpeg' }) }))
    await demo('badType', form({ file: new File(['hello'], 'menu.txt', { type: 'text/plain' }) }))
    await demo('textLong', form({ text: 'x'.repeat(20_001) }))
    await demo('nothing', form({ text: '   ' }))
    await demo('rateLimited', form({ text: 'Margherita 9.50' }), { headers: XFF, rl: { demo: 'deny' } })
    await demo('limiterDown', form({ text: 'Margherita 9.50' }), { headers: XFF, rl: { demo: 'throw' } })
    await demo('menuFailed', form({ file: new File(['%PDF'], 'menu.pdf', { type: 'application/pdf' }) }), { provisionDemo: 'failed' })
    await demo('imported', form({ text: 'Margherita 9.50' }))
    await demo('template', form({ template: 'pizza' }), { provisionDemo: 'template' })
    await demo('provisionError', form({ text: 'Margherita 9.50' }), { provisionDemo: 'throwDemo' })
    await demo('unexpected', form({ text: 'Margherita 9.50' }), { provisionDemo: 'throw' })
    // ── /api/demo/build-request ──
    const build = (k, body, o = {}) => call(`${cc}|build-request|${k}`, { tables: T(o), ...o }, () => P.buildPOST(post('/api/demo/build-request', body, o.headers)))
    await build('badJson', '{nope')
    await build('badEmail', { email: 'nope' })
    await build('rateLimited', { email: 'cook@example.test' }, { headers: XFF, rl: { demo: 'deny' } })
    await build('ok', { email: 'cook@example.test', truckId: 'demo-abc' })
    await build('okNoTruck', { email: 'cook@example.test' })
    await build('noBrevo', { email: 'cook@example.test' }, { noBrevo: true })
    // ── /api/demo/restart ──
    const restart = (k, body, o = {}) => call(`${cc}|restart|${k}`, { tables: T(o), ...o }, () => M.restartPOST(post('/api/demo/restart', body)))
    const withDemo = { extra: { trucks: [demoTruck()] } }
    await restart('badJson', '{nope')
    await restart('notDemoToken', { token: 'tok-real' })
    await restart('notFound', { token: 'demo-missing' })
    await restart('notDemoTruck', { token: 'demo-tok' }, { extra: { trucks: [truck({ dashboard_token: 'demo-tok' })] } })
    await restart('adminPreview', { token: 'demo-tok', claimFirstOpen: true }, { ...withDemo, admin: true })
    await restart('notClaimed', { token: 'demo-tok', claimFirstOpen: true }, { ...withDemo, claim: 'already-opened' })
    await restart('claimed', { token: 'demo-tok', claimFirstOpen: true }, withDemo)
    await restart('restarted', { token: 'demo-tok' }, withDemo)
    await restart('fails', { token: 'demo-tok' }, { ...withDemo, restart: 'throw' })
    // ── /api/demo/return (redirects) ──
    const ret = (k, q, o = {}) => call(`${cc}|return|${k}`, { tables: T(o), ...o }, () => M.returnGET(req(`/api/demo/return${q}`)))
    await ret('invalid', '?t=tok-real')
    await ret('expired', '?t=demo-gone')
    await ret('ok', '?t=demo-tok', withDemo)
    await ret('provisionFails', '?t=demo-tok', { ...withDemo, provisionDemo: 'throw' })
    // ── /api/demo/save-email ──
    const save = (k, body, o = {}) => call(`${cc}|save-email|${k}`, { tables: T(o), ...o }, () => M.saveEmailPOST(post('/api/demo/save-email', body)))
    await save('badJson', '{nope')
    await save('badEmail', { token: 'demo-tok', email: 'nope' })
    await save('notDemo', { token: 'tok-real', email: 'cook@example.test' })
    await save('notFound', { token: 'demo-missing', email: 'cook@example.test' })
    await save('notDemoTruck', { token: 'demo-tok', email: 'cook@example.test' }, { extra: { trucks: [truck({ dashboard_token: 'demo-tok' })] } })
    await save('saveFails', { token: 'demo-tok', email: 'cook@example.test' }, { ...withDemo, save: { ok: false } })
    await save('ok', { token: 'demo-tok', email: 'cook@example.test' }, withDemo)
    await save('okBySlug', { slug: 'demo-abc', email: 'cook@example.test' }, withDemo)
    await save('okOneDay', { token: 'demo-tok', email: 'cook@example.test' }, { ...withDemo, save: { ok: true, expiresAt: '2026-10-10T09:00:00.000Z' } })
    await save('okOutreach', { token: 'demo-tok', email: 'cook@example.test' }, { ...withDemo, save: { ok: true, expiresAt: '2026-11-08T17:20:00.000Z' } })
    await save('brevoThrows', { token: 'demo-tok', email: 'cook@example.test' }, { ...withDemo, brevo: 'throw' })
    await save('noBrevo', { token: 'demo-tok', email: 'cook@example.test' }, { ...withDemo, noBrevo: true })

    // ── /api/account/request-deletion ──
    const owned = [truck(), truck({ id: 'second-truck', name: 'Second Kitchen', dashboard_token: 'tok-2' })]
    const orders = [{ id: 'o1', truck_id: 'test-truck', status: 'pending', event_date: '2026-10-09' }, { id: 'o2', truck_id: 'second-truck', status: 'collected', event_date: '2026-10-09' },
      { id: 'o3', truck_id: 'second-truck', status: 'confirmed', event_date: '2026-10-20' }, { id: 'o4', truck_id: 'test-truck', status: 'confirmed', event_date: '2026-10-01' }]
    const delTables = { extra: { trucks: owned, orders, truck_users: [{ id: 'tu-co', truck_id: 'second-truck', role: 'owner', email: 'co@example.test' }, { id: 'tu-st', truck_id: 'test-truck', role: 'staff', email: 'st@example.test' }] } }
    const dget = (k, o = {}) => call(`${cc}|deletion|get|${k}`, { user: OWNER, tables: T(o), ...o }, () => M.deletionGET(req('/api/account/request-deletion', { headers: o.headers || {} })))
    await dget('notOwner', { user: { id: 'u-staff' } })
    await dget('noUser', { user: null })
    await dget('summary', delTables)
    await dget('bearer', { ...delTables, user: null, headers: { authorization: 'Bearer jwt-owner' } })
    const dpost = (k, body, o = {}) => call(`${cc}|deletion|post|${k}`, { user: OWNER, tables: T(o), ...o }, () => M.deletionPOST(post('/api/account/request-deletion', body, o.headers)))
    await dpost('noUser', { confirm: 'DELETE' }, { user: null })
    await dpost('notOwner', { confirm: 'DELETE' }, { user: { id: 'u-staff' } })
    await dpost('pending', { confirm: 'DELETE' }, { tables: (() => { const t = T(delTables); t.operators[0] = { ...t.operators[0], deletion_requested_at: '2026-10-01T00:00:00.000Z', deletion_due_at: '2026-10-31T00:00:00.000Z' }; return t })() })
    await dpost('mismatch', { confirm: 'delete it' }, delTables)
    await dpost('opFails', { confirm: 'DELETE' }, { ...delTables, fail: { operators: ['update'] } })
    await dpost('trucksFail', { confirm: 'DELETE' }, { ...delTables, fail: { trucks: ['update'] } })
    await dpost('ok', { confirm: ' delete ' }, delTables)
    await dpost('okNoTrucks', { confirm: 'DELETE' })
  }
  return out
}

/** NAMED DIFFERENCE 1, per view. Returns true when it handled the view (the runner then skips its own diff). */
function compare(key, B, A, ctx) {
  const { t } = ctx
  if (!ctx.AFTER) return false
  if (typeof B === 'string' || typeof A === 'string') { t(`api · ${key}: ran`, B === A, `${B} · ${A}`); return true }
  t(`api · ${key}: status unchanged (${B.status})`, A.status === B.status, A.status)
  for (const f of ['location', 'retryAfter', 'cacheControl']) t(`api · ${key}: same ${f}`, A[f] === B[f], `${B[f]} · ${A[f]}`)
  t(`api · ${key}: every email it composes is byte-identical (subject, HTML, sender)`, JSON.stringify(A.sends) === JSON.stringify(B.sends), ctx.diffJson(B.sends, A.sends))
  // The signup emails (lib/email-signup.ts, the auth area's builders) now take the truck's `locale` from these routes —
  // the only change allowed in a call: an added `locale`, last, that is the demo or operator truck's language
  // (en-GB for GB, en-US for US), or absent when there is no truck. Everything else in each call is unchanged.
  const SENDERS = ['sendSignupVerificationEmail', 'sendOperatorWelcomeEmail']
  const want = key.startsWith('US|') ? 'en-US' : 'en-GB'
  const localeOk = (A.calls || []).every(([n, a]) => !SENDERS.includes(n) || !a || !('locale' in a)
    || (a.locale === want && Object.keys(a).pop() === 'locale' && !(B.calls || []).some(([m, b]) => m === n && b && 'locale' in b)))
  const noLocale = (A.calls || []).map(([n, a]) => (SENDERS.includes(n) && a && 'locale' in a ? [n, Object.fromEntries(Object.entries(a).filter(([k]) => k !== 'locale'))] : [n, a]))
  t(`api · ${key}: the same calls to the stubbed senders and provisioners (apart from the truck's locale)`, JSON.stringify(noLocale) === JSON.stringify(B.calls), ctx.diffJson(B.calls, noLocale))
  if ((A.calls || []).some(([n, a]) => SENDERS.includes(n) && a && 'locale' in a)) t(`api · ${key}: the signup email is handed the truck's locale (${want}), last`, localeOk, JSON.stringify(A.calls))
  t(`api · ${key}: the same auth-admin calls`, JSON.stringify(A.auth) === JSON.stringify(B.auth), ctx.diffJson(B.auth, A.auth))
  t(`api · ${key}: the same database writes`, JSON.stringify(A.writes) === JSON.stringify(B.writes), ctx.diffJson(B.writes, A.writes))
  let b, a
  try { b = JSON.parse(B.body); a = JSON.parse(A.body) } catch { t(`api · ${key}: body byte-identical`, A.body === B.body, `${B.body} · ${A.body}`); return true }
  const ours = b && typeof b.error === 'string' && !('code' in b) && a && 'code' in a
  if (!ours) { t(`api · ${key}: not one of our new refusal codes — body byte-identical`, A.body === B.body, `BEFORE ${B.body}\n      AFTER  ${A.body}`); return true }
  const MESSAGES = require('./_lp2-frozen.cjs').enGBForNode()   // the frozen words under HG_MESSAGES_FROZEN (Language Phase 2 re-pin)
  const { createTranslator } = require(path.join(ctx.REPO, 'node_modules/next-intl'))
  const tr = l => createTranslator({ locale: l, messages: MESSAGES, namespace: 'errorsOnboarding' })
  t(`api · ${key}: the BEFORE body is the exact prefix of the AFTER body`, A.body.startsWith(B.body.slice(0, -1) + ','), `BEFORE ${B.body}\n      AFTER  ${A.body}`)
  t(`api · ${key}: every BEFORE field unchanged, in its place`, JSON.stringify(Object.keys(a).slice(0, Object.keys(b).length)) === JSON.stringify(Object.keys(b))
    && Object.keys(b).every(k => JSON.stringify(a[k]) === JSON.stringify(b[k])), A.body)
  t(`api · ${key}: the only fields added are code and params, last`, JSON.stringify(Object.keys(a).slice(Object.keys(b).length)) === '["code","params"]', Object.keys(a).join(','))
  const known = typeof a.code === 'string' && MESSAGES.errorsOnboarding && a.code in MESSAGES.errorsOnboarding
  t(`api · ${key}: "${a.code}" is an errorsOnboarding message`, known)
  t(`api · ${key}: params is an object of strings and numbers`, a.params && typeof a.params === 'object' && !Array.isArray(a.params) && Object.values(a.params).every(v => typeof v === 'string' || typeof v === 'number'))
  if (known) t(`api · ${key}: the words for the code are today's error, en-GB and en-US`, tr('en-GB')(a.code, a.params) === b.error && tr('en-US')(a.code, a.params) === b.error, `${tr('en-GB')(a.code, a.params)} · ${b.error}`)
  return true
}

const ROUTES = ['app/api/setup/route.ts', 'app/api/setup/countries/route.ts', 'app/api/signup/route.ts',
  ...['cancel-email-change', 'change-email', 'forgot-password', 'me', 'post-login', 'resend-verification', 'reset-password', 'update-profile', 'verify-signup'].map(r => `app/api/auth/${r}/route.ts`),
  'app/api/demo/route.ts', ...['build-request', 'restart', 'return', 'save-email'].map(r => `app/api/demo/${r}/route.ts`), 'app/api/account/request-deletion/route.ts']

/** AFTER only: no refusal of OURS is left without a code in the onboarding routes, and no sentence of ours is left in
 *  an email a route composes for an operator or a prospect. What remains is listed: text that is not ours (Supabase's,
 *  the database's, an exception's — passed on as it came, held in a variable, so it never matches a literal) and the
 *  two staff-only notifications that go to HatchGrab's own inbox. */
async function after(ctx) {
  const { t, head, read } = ctx
  head('api · every literal refusal in the onboarding routes carries a code; the emails read their words')
  const strip = s => s.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
  for (const f of ROUTES) {
    const src = strip(read(f))
    const bare = [...src.matchAll(/\berror:\s*(['"`])((?:(?!\1).)*)\1/g)].map(m => m[0])
    t(`${f}: no literal refusal without a code`, bare.length === 0, bare.join(' · '))
    const sentences = [...src.matchAll(/(warning|subject|reason):\s*(['"`])[A-Z][^'"`]*\2/g)].map(m => m[0])
    t(`${f}: no literal user-facing sentence in a response or a subject`, sentences.length === 0, sentences.join(' · '))
  }
  // The operator- and prospect-facing emails a route composes read every sentence from a namespace.
  const EMAILS = {
    'app/api/auth/change-email/route.ts': ['Verify your email address', 'Verify email address', 'safely ignore'],
    'app/api/auth/resend-verification/route.ts': ['Verify your email address', 'Click below to verify', 'ignore this email'],
    'app/api/auth/forgot-password/route.ts': ['Reset your password', 'Reset password', 'safely ignore', 'expires in 1 hour'],
    'app/api/demo/save-email/route.ts': ['Your demo is saved', 'Open my demo', 'fresh day', 'delete it and the menu'],
    'app/api/account/request-deletion/route.ts': ['We have received a request', 'Online ordering has stopped', 'cannot be cancelled', 'anonymous accounting', 'scheduled for deletion'],
  }
  for (const [f, words] of Object.entries(EMAILS)) {
    const src = strip(read(f))
    const left = words.filter(w => src.includes(w))
    t(`${f}: the email's sentences come from the message file`, left.length === 0, left.join(' · '))
  }
  const msgs = require('./_lp2-frozen.cjs').enGBForNode()   // the frozen words under HG_MESSAGES_FROZEN (Language Phase 2 re-pin)
  t('errorsOnboarding.phone_invalid is word for word the phone box\'s own sentence (phone.invalidPhoneNumber)',
    msgs.errorsOnboarding?.phone_invalid === msgs.phone?.invalidPhoneNumber, `${msgs.errorsOnboarding?.phone_invalid} · ${msgs.phone?.invalidPhoneNumber}`)
  t('lib/i18n/onboarding-errors.ts is a wrapper over the one helper (lib/i18n/error-body.ts)',
    /errorBody\('errorsOnboarding'/.test(read('lib/i18n/onboarding-errors.ts')) && /import '@\/lib\/i18n\/catalog\/errorsOnboarding'/.test(read('lib/i18n/onboarding-errors.ts')))
}

module.exports = { views, compare, after }
