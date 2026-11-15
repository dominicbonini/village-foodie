#!/usr/bin/env node
// scripts/app-fixes-2-screens.cjs — app-fixes-2 (15 November 2026, docs/app-fixes-2-report.md). BY HAND, NOT SWEPT: it needs a
// running server and Playwright's WebKit (iOS's engine). Screenshots to docs/app-fixes-2/. No truck token is needed and no data
// is read or written: "Access denied" is a made-up token, and every POST that would send an email or change a password is
// answered by the harness.
//   BASE=http://localhost:3000 node scripts/app-fixes-2-screens.cjs
// THE APP CONTEXT is app-fixes-1-screens.cjs's: the shell's user-agent marker (HatchGrabNativeApp) + a stub of Capacitor's iOS
// bridge, so @capacitor/core reports 'ios'.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const { webkit, devices } = require(path.join(REPO, 'node_modules/playwright'))
const BASE = process.env.BASE || 'http://localhost:3000'
const OUT = path.join(REPO, 'docs/app-fixes-2')
fs.mkdirSync(OUT, { recursive: true })
let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${String(detail).slice(0, 800)}` : ''}`) } }
const head = s => console.log(`\n── ${s}`)
// ── the plugin methods each installed plugin declares (its definitions.d.ts), for the bridge's PluginHeaders ───────────────
const PLUGINS = { Preferences: '@capacitor/preferences', App: '@capacitor/app', Network: '@capacitor/network', StatusBar: '@capacitor/status-bar', LocalNotifications: '@capacitor/local-notifications', PushNotifications: '@capacitor/push-notifications', KeepAwake: '@capacitor-community/keep-awake', BluetoothLe: '@capacitor-community/bluetooth-le' }
const METHODS = [...new Set(Object.values(PLUGINS).flatMap(p => [...fs.readFileSync(path.join(REPO, 'node_modules', p, 'dist/esm/definitions.d.ts'), 'utf8').matchAll(/^\s+([a-zA-Z]+)\(/gm)].map(m => m[1])))].filter(m => m !== 'constructor').concat(['checkBiometry', 'internalAuthenticate'])
function BRIDGE({ methods, seed }) {
  const prefs = { ...(seed || {}) }
  const reply = (plugin, method, o) => {
    switch (`${plugin}.${method}`) {
      case 'Preferences.get': return { value: prefs[o.key] ?? null }
      case 'Preferences.set': prefs[o.key] = o.value; return {}
      case 'Preferences.remove': delete prefs[o.key]; return {}
      case 'Preferences.keys': return { keys: Object.keys(prefs) }
      case 'Network.getStatus': return { connected: true, connectionType: 'wifi' }
      case 'App.getInfo': return { name: 'HatchGrab', id: 'com.hatchgrab.app', build: '1', version: '1.0' }
      case 'App.getState': return { isActive: true }
      case 'KeepAwake.isSupported': return { isSupported: true }
      case 'KeepAwake.isKeptAwake': return { isKeptAwake: false }
      case 'LocalNotifications.checkPermissions': case 'LocalNotifications.requestPermissions': return { display: 'granted' }
      case 'PushNotifications.checkPermissions': case 'PushNotifications.requestPermissions': return { receive: 'granted' }
      case 'BluetoothLe.isEnabled': return { value: true }
      default: return {}
    }
  }
  const header = name => ({ name, methods: { find: pred => { for (const m of methods.concat(['addListener', 'removeListener', 'removeAllListeners'])) { const h = { name: m, rtype: m === 'addListener' ? 'callback' : 'promise' }; if (pred(h)) return h } return undefined } } })
  window.webkit = { messageHandlers: { bridge: { postMessage() {} } } }
  let cb = 0
  window.Capacitor = {
    PluginHeaders: ['Preferences', 'App', 'Network', 'StatusBar', 'LocalNotifications', 'PushNotifications', 'KeepAwake', 'BluetoothLe', 'BiometricAuthNative'].map(header),
    nativePromise: (plugin, method, options = {}) => Promise.resolve(reply(plugin, method, options)),
    nativeCallback: () => String(++cb),
  }
}

async function context(browser, { app = false, device = 'iPhone 13', viewport, locale = 'fr-FR', prefs = {} } = {}) {
  const d = viewport ? { viewport, deviceScaleFactor: 2, isMobile: viewport.width < 640, hasTouch: true } : devices[device]
  const ua = (d.userAgent || devices['iPhone 13'].userAgent) + (app ? ' HatchGrabNativeApp' : '')
  const ctx = await browser.newContext({ ...d, userAgent: app || d.userAgent ? ua : undefined, locale })
  if (app) await ctx.addInitScript(BRIDGE, { methods: METHODS, seed: prefs })
  return ctx
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name), fullPage: true })
const text = page => page.evaluate(() => document.body.innerText)

;(async () => {
  const browser = await webkit.launch()
  head('§1 · "Log in" on the auth screens (en-GB, web)')
  {
    const ctx = await context(browser, { device: 'Desktop Safari', locale: 'en-GB' }); const page = await ctx.newPage()
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
    const s = await text(page)
    t('login: "Log in to your kitchen" + a "Log in" button, no "Sign in"', s.includes('Log in to your kitchen') && await page.locator('button[type=submit]').innerText() === 'Log in' && !/sign in/i.test(s), s.slice(0, 300))
    await shot(page, 'login-web.png')
    await page.route(u => new URL(u).pathname.startsWith('/api/auth/forgot'), r => r.fulfill({ status: 200, json: { ok: true } }))
    await page.goto(`${BASE}/forgot-password`, { waitUntil: 'networkidle' })
    t('forgot: "Back to log in"', (await text(page)).includes('Back to log in'))
    await page.goto(`${BASE}/reset-password`, { waitUntil: 'networkidle' })
    const r = await text(page)
    t('reset (no link): "Send a new link" + "Back to log in"', r.includes('Send a new link') && r.includes('Back to log in') && !/sign in/i.test(r))
    await shot(page, 'reset-invalid-web.png')
    await ctx.close()
  }
  head('§2 · "Access denied" has "Back to log in" (web + app)')
  // The WEBSITE sends a visitor with no session from /dashboard/<token> to /login before the page loads (proxy.ts's session
  // gate), so on the web "Access denied" is reached by a signed-in operator with a bad / expired token, or by a demo link
  // (/dashboard/demo-…, the gate's one exception). The shot uses a made-up demo link; the app (native session, no cookie
  // gate) a made-up token. Both answer "invalid access link" from /api/dashboard.
  for (const [label, opts, tok] of [['web', { device: 'Desktop Safari', locale: 'en-GB' }, 'demo-zzznotreal0af2'], ['app', { app: true, locale: 'en-GB' }, 'not-a-real-token-af2']]) {
    const ctx = await context(browser, opts); const page = await ctx.newPage()
    await page.goto(`${BASE}/dashboard/${tok}`, { waitUntil: 'networkidle', timeout: 90000 }); await page.waitForTimeout(1500)
    await page.waitForSelector('[data-gate-next="login"]', { timeout: 30000 }).catch(() => {})
    const s = await text(page)
    const btn = page.locator('[data-gate-next="login"]')
    t(`${label}: Access denied shows "Back to log in"`, s.includes('Access denied') && await btn.count() === 1 && (await btn.innerText()).trim() === 'Back to log in', s.slice(0, 300))
    await shot(page, `access-denied-${label}.png`)
    if (await btn.count()) { await btn.click(); await page.waitForURL(u => new URL(u).pathname === '/login', { timeout: 20000 }).catch(() => {}) }
    t(`${label}: it goes to /login`, new URL(page.url()).pathname === '/login', page.url())
    await ctx.close()
  }
  head('§3 · /dev in the app goes to /app; /signup stays')
  {
    const ctx = await context(browser, { app: true, locale: 'en-GB' }); const page = await ctx.newPage()
    const res = await page.goto(`${BASE}/dev/ticket-preview`, { waitUntil: 'domcontentloaded', timeout: 90000 })
    const hops = []; for (let q = res?.request(); q; q = q.redirectedFrom()) hops.unshift(new URL(q.url()).pathname)
    t('app: /dev/ticket-preview → /app', hops[0] === '/dev/ticket-preview' && hops.includes('/app'), hops.join(' → '))
    // /app then sends a device with no session to /login; let that finish before the next address.
    await page.waitForURL(u => new URL(u).pathname === '/login', { timeout: 30000 }).catch(() => {})
    await page.goto(`${BASE}/signup`, { waitUntil: 'domcontentloaded', timeout: 90000 })
    t('app: /signup stays', new URL(page.url()).pathname === '/signup', page.url())
    await ctx.close()
    const web = await context(browser, { device: 'Desktop Safari', locale: 'en-GB' }); const wp = await web.newPage()
    await wp.goto(`${BASE}/dev/ticket-preview`, { waitUntil: 'domcontentloaded', timeout: 90000 })
    t('website: /dev/ticket-preview unchanged (no redirect)', new URL(wp.url()).pathname === '/dev/ticket-preview', wp.url())
    await web.close()
  }
  await browser.close()
  console.log(`\n${fail ? '🔴' : '✅'} app-fixes-2-screens: ${pass} passed, ${fail} failed (screenshots in docs/app-fixes-2/)`)
  process.exit(fail ? 1 : 0)
})()
