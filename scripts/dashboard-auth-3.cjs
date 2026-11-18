#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
// scripts/dashboard-auth-3.cjs — dashboard-auth-3 (docs/dashboard-auth-3-report.md): "Sign out" ends THIS device's session
// only; a password reset still ends every session; the email change keeps its screens and ends only the confirming device's.
//
// The REAL auth client (@supabase/supabase-js, as installed) runs against an IN-MEMORY stand-in for Supabase's auth server
// (sessions, rotating refresh tokens, /logout with scope local / global / others, /user) — no network, no database. The
// app's sign-out (lib/native/session.ts nativeSignOut) and the shared control (lib/native/signOut.ts operatorSignOut) are
// bundled from the repo with only their device/storage seams stubbed.
//   A · static — the four call sites name their scope; app lock untouched; the intent flag still set before signing out
//   B · two devices on ONE account: the app signs out → the other device's session still refreshes and still reads its user
//   C · the web Sign out, the same; the app offline (logout unreachable) still clears its stored session
//   D · the contrast: a password reset (global) DOES end the other device; the old default would have too
require('./_harness-tmp.cjs')
const path = require('path'); const fs = require('fs')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${String(detail).slice(0, 600)}` : ''}`) } }
const head = s => console.log(`\n── ${s}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const code = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

// ── THE AUTH SERVER STAND-IN ───────────────────────────────────────────────────────────────────────────────────────────
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
function authServer() {
  const USER = { id: 'u-owner', aud: 'authenticated', role: 'authenticated', email: 'owner@pizza-kitchen.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
  const sessions = new Map()   // sid -> { uid, revoked, refresh }
  const byRefresh = new Map()  // refresh token -> sid
  const logouts = []
  let n = 0
  let offline = false
  const json = (status, body) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const issue = sid => {
    const exp = Math.floor(Date.now() / 1000) + 3600
    const rt = `rt-${++n}`
    byRefresh.set(rt, sid); sessions.get(sid).refresh = rt
    return { access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, session_id: sid, exp, aud: 'authenticated', role: 'authenticated', email: USER.email })}.sig`,
      token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: rt, user: USER }
  }
  const sidOf = auth => { try { return JSON.parse(Buffer.from(String(auth).replace(/^Bearer /, '').split('.')[1], 'base64url')).session_id } catch { return null } }
  async function fetch(input, init = {}) {
    const url = new URL(typeof input === 'string' ? input : input.url)
    const headers = new Headers(init.headers)
    const body = init.body ? JSON.parse(init.body) : {}
    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
      const sid = `s-${++n}`; sessions.set(sid, { uid: USER.id, revoked: false }); return json(200, issue(sid))
    }
    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') {
      const sid = byRefresh.get(body.refresh_token)
      const s = sid && sessions.get(sid)
      if (!s || s.revoked || s.refresh !== body.refresh_token) return json(400, { code: 'refresh_token_not_found', error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' })
      return json(200, issue(sid))
    }
    if (url.pathname === '/auth/v1/logout') {
      if (offline) throw new TypeError('Failed to fetch')
      const scope = url.searchParams.get('scope') || 'global'
      const sid = sidOf(headers.get('authorization'))
      logouts.push(scope)
      for (const [id, s] of sessions) {
        if (scope === 'local' && id === sid) s.revoked = true
        if (scope === 'global') s.revoked = true
        if (scope === 'others' && id !== sid) s.revoked = true
      }
      return json(204, null)
    }
    if (url.pathname === '/auth/v1/user') {
      const s = sessions.get(sidOf(headers.get('authorization')))
      return s && !s.revoked ? json(200, USER) : json(403, { code: 'session_not_found', error_code: 'session_not_found', msg: 'Session from session_id claim in JWT does not exist' })
    }
    return json(404, { msg: `not handled: ${url.pathname}` })
  }
  return { fetch, logouts, sessions, setOffline: v => { offline = v } }
}
const memStorage = () => { const m = new Map(); return { m, getItem: async k => (m.has(k) ? m.get(k) : null), setItem: async (k, v) => { m.set(k, v) }, removeItem: async k => { m.delete(k) } } }

// ── THE APP'S AND THE WEB'S SIGN-OUT, BUNDLED FROM THE REPO ────────────────────────────────────────────────────────────
async function bundle() {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const STUB = {
    device: "export const isNativeApp = () => !!globalThis.__native; export const getDeviceId = () => 'dev-test'",
    prefs: "export const Preferences = { async get({ key }) { const m = globalThis.__prefs; return { value: m.has(key) ? m.get(key) : null } }, async set({ key, value }) { globalThis.__prefs.set(key, value) }, async remove({ key }) { globalThis.__prefs.delete(key) }, async keys() { return { keys: [...globalThis.__prefs.keys()] } } }",
    webClient: 'export function createSupabaseBrowserClient() { return globalThis.__webClient }',
    observer: 'export function beginUserSignOut() { globalThis.__intentAt = globalThis.__step++ }',
  }
  const res = await esbuild.build({
    stdin: { contents: "export { nativeSignOut, getNativeSupabase, NATIVE_AUTH_STORAGE_KEY } from '@/lib/native/session'\nexport { operatorSignOut } from '@/lib/native/signOut'", resolveDir: REPO, loader: 'ts' },
    bundle: true, write: false, platform: 'node', format: 'cjs', target: 'node20', logLevel: 'silent',
    external: ['@supabase/supabase-js'],
    plugins: [{ name: 'da3', setup(b) {
      b.onResolve({ filter: /^@\/lib\/native\/device$|^\.\/device$/ }, () => ({ path: 'device', namespace: 'stub' }))
      b.onResolve({ filter: /^@capacitor\/preferences$/ }, () => ({ path: 'prefs', namespace: 'stub' }))
      b.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: 'webClient', namespace: 'stub' }))
      b.onResolve({ filter: /^@\/lib\/auth\/session-observer$/ }, () => ({ path: 'observer', namespace: 'stub' }))
      b.onResolve({ filter: /^@\// }, a => {
        const base = path.join(REPO, a.path.slice(2))
        const hit = ['', '.ts', '.tsx', '.js', '/index.ts', '/index.tsx'].map(x => base + x).find(f => fs.existsSync(f) && fs.statSync(f).isFile())
        return hit ? { path: hit } : undefined
      })
      b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: STUB[a.path], loader: 'js' }))
    } }],
  })
  const out = path.join(require('os').tmpdir(), `da3-${process.pid}.cjs`)
  // The bundle lives in a temp folder: point its one external at the installed package (the same instance this script uses).
  const supa = require.resolve('@supabase/supabase-js', { paths: [REPO] })
  fs.writeFileSync(out, res.outputFiles[0].text.split('require("@supabase/supabase-js")').join(`require(${JSON.stringify(supa)})`))
  try { return require(out) } finally { fs.rmSync(out, { force: true }) }
}

;(async () => {
  head('A · static: every sign-out names its scope')
  const so = code(read('lib/native/signOut.ts')), ss = code(read('lib/native/session.ts'))
  t('the Sign out control, web: signOut({ scope: \'local\' })', /await supabase\.auth\.signOut\(\{ scope: 'local' \}\)/.test(so) && !/auth\.signOut\(\)/.test(so))
  t('the Sign out control, app: nativeSignOut → signOut({ scope: \'local\' }), stored session cleared if that fails', /getNativeSupabase\(\)\.auth\.signOut\(\{ scope: 'local' \}\)/.test(ss) && /preferencesAuthStorage\.removeItem\(NATIVE_AUTH_STORAGE_KEY\)/.test(ss) && !/auth\.signOut\(\)/.test(ss))
  t('the intent flag is still set BEFORE signing out (no "signed out" banner on the way out)', so.indexOf('beginUserSignOut()') < so.indexOf('await nativeSignOut()') && so.indexOf('beginUserSignOut()') < so.indexOf("signOut({ scope: 'local' })"))
  t('the email change: the same screens, signOut({ scope: \'local\' }) then /login?message=email_changed', /supabase\.auth\.signOut\(\{ scope: 'local' \}\)\.then\(\(\) => \{\s*window\.location\.href = '\/login\?message=email_changed'/.test(code(read('app/(app)/verify-email/VerifyEmailSuccess.tsx'))))
  t('the password reset: still EVERYWHERE — signOut({ scope: \'global\' }), stated', /auth\.signOut\(\{ scope: 'global' \}\)/.test(code(read('app/(app)/reset-password/page.tsx'))))
  let grepOut = ''; try { grepOut = execFileSync('grep', ['-rnE', '\\.auth\\.signOut\\(\\)', 'app', 'lib', 'components'], { cwd: REPO, encoding: 'utf8' }) } catch (e) { if (e.status !== 1) throw e }   // grep exits 1 for "no match"
  const bare = grepOut.trim().split('\n').filter(l => l && !/^\S+:\d+:\s*(\/\/|\*)/.test(l.replace(/^([^:]+:\d+:)\s*/, '$1')))
  t('no sign-out anywhere is left on the default scope', bare.length === 0, bare.join('\n      '))
  const lockChanged = execFileSync('git', ['diff', '--name-only', 'HEAD', '--', 'lib/native/appLock.ts', 'components/native/AppLockGate.tsx'], { cwd: REPO, encoding: 'utf8' }).trim()
  t('Face ID / Touch ID app lock: its files are unchanged, and sign-out does not touch it', lockChanged === '' && !/appLock|AppLock/.test(so + ss))

  const srv = authServer()
  globalThis.fetch = srv.fetch
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://auth.test'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test'
  const { createClient } = require(require.resolve('@supabase/supabase-js', { paths: [REPO] }))
  const device = () => { const storage = memStorage(); return { storage, client: createClient('http://auth.test', 'anon-test', { auth: { storage, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false } }) } }
  const stillSignedIn = async c => { const r = await c.auth.refreshSession(); const u = await c.auth.getUser(); return !r.error && !!r.data.session && !u.error && u.data.user?.id === 'u-owner' }
  const M = await bundle()
  const signIn = c => c.auth.signInWithPassword({ email: 'owner@pizza-kitchen.test', password: 'pw' })

  head('B · the app signs out — the kitchen iPad on the same account stays signed in')
  {
    globalThis.__native = true; globalThis.__prefs = new Map(); globalThis.__step = 0
    const app = M.getNativeSupabase()
    const iPad = device()
    const a = await signIn(app), b = await signIn(iPad.client)
    t('both devices signed in to ONE account, each with its own session', !a.error && !b.error && srv.sessions.size === 2)
    t('the app keeps its session in its own store', globalThis.__prefs.has(M.NATIVE_AUTH_STORAGE_KEY))
    const routed = []
    await M.operatorSignOut({ replace: h => { routed.push([h, globalThis.__step++]) } })
    t('Sign out in the app asked the server for scope=local', srv.logouts.at(-1) === 'local', JSON.stringify(srv.logouts))
    t('the app\'s stored session is gone, and it is signed out', !globalThis.__prefs.has(M.NATIVE_AUTH_STORAGE_KEY) && !(await app.auth.getSession()).data.session)
    t('…the intent was declared first, then the app went to /login', globalThis.__intentAt === 0 && routed[0]?.[0] === '/login')
    t('🔴 the OTHER device (the kitchen iPad) still refreshes its session and reads its user', await stillSignedIn(iPad.client))
  }

  head('C · the web Sign out, and the app signing out with no connection')
  {
    globalThis.__native = false; globalThis.__step = 0
    const web = device(), iPad = device()
    await signIn(web.client); await signIn(iPad.client)
    globalThis.__webClient = web.client
    globalThis.window = { location: { href: '' } }
    await M.operatorSignOut({ replace: () => {} })
    t('Sign out on the web asked the server for scope=local', srv.logouts.at(-1) === 'local')
    t('the web session is gone and the page goes to /login', !(await web.client.auth.getSession()).data.session && globalThis.window.location.href === '/login')
    t('🔴 the kitchen iPad on the same account is still signed in', await stillSignedIn(iPad.client))
  }
  {
    globalThis.__native = true; globalThis.__prefs = new Map()
    const app = M.getNativeSupabase()
    await signIn(app)
    srv.setOffline(true)
    const before = srv.logouts.length
    await M.nativeSignOut()
    srv.setOffline(false)
    t('offline: the server could not be told (no logout reached it)…', srv.logouts.length === before)
    t('…but Sign out still cleared this device\'s stored session — the app is signed out', !globalThis.__prefs.has(M.NATIVE_AUTH_STORAGE_KEY) && !globalThis.__prefs.has(`${M.NATIVE_AUTH_STORAGE_KEY}-code-verifier`))
  }

  head('D · the contrast: what still signs out everywhere, and what used to')
  {
    const phone = device(), iPad = device()
    await signIn(phone.client); await signIn(iPad.client)
    await phone.client.auth.signOut({ scope: 'global' })
    t('a password reset (scope global) DOES end the kitchen iPad\'s session — as asked', !(await stillSignedIn(iPad.client)))
  }
  {
    const phone = device(), iPad = device()
    await signIn(phone.client); await signIn(iPad.client)
    await phone.client.auth.signOut()
    t('the OLD default (signOut() with no options) would have ended it too — the change matters', srv.logouts.at(-1) === 'global' && !(await stillSignedIn(iPad.client)))
  }
  {
    const phone = device(), iPad = device()
    await signIn(phone.client); await signIn(iPad.client)
    await phone.client.auth.signOut({ scope: 'local' })
    t('the email change (scope local): the confirming device is signed out, the kitchen iPad stays signed in', !(await phone.client.auth.getSession()).data.session && await stillSignedIn(iPad.client))
  }

  console.log(`\n${fail ? '🔴' : '✅'} dashboard-auth-3: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
