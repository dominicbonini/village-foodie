#!/usr/bin/env node
// scripts/app-fixes-1-screens.cjs — app-fixes-1 (14 November 2026, docs/app-fixes-1-report.md). BY HAND, NOT SWEPT: it needs a
// running server (a PRODUCTION build for §3 — `next build && next start -p 3100` — because the Paramètres crash only ever
// existed in production bundles) and Playwright's WebKit (iOS's engine). It writes screenshots to docs/app-fixes-1/.
//
//   BASE=http://localhost:3100 TEST_TRUCK_TOKEN=… FR_DEMO_TOKEN=… node scripts/app-fixes-1-screens.cjs
//   (+ BEFORE_BASE=https://www.hatchgrab.com to also shoot the deployed "before" of each screen — read-only; every POST that
//    would send an email or change a password is answered by the harness and never reaches a server.)
//
// TOKENS COME FROM THE ENVIRONMENT, never from this file: TEST_TRUCK_TOKEN = the dashboard_token of `test-truck` (Pizza Kitchen,
// a test truck); FR_DEMO_TOKEN = a French demo truck's (`demo-…`). Never Pizzeria Gusto or Le Roi du Churrasco.
//
// THE APP CONTEXT: the user-agent marker the shell appends (HatchGrabNativeApp) + a stub of Capacitor's iOS bridge
// (window.webkit.messageHandlers.bridge and window.Capacitor with PluginHeaders), so @capacitor/core reports 'ios' and every
// plugin call answers like the native side would. This is how §3's crash was reproduced against the deployed site.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
require('./_disk-guard.cjs').guard(__filename) // disk-cleanup-1: refuses below 40 GB free, stops below 20 GB (docs/reference-manual.md, "Disk space")
require('./_harness-tmp.cjs') // tmp-cleanup-1: temp goes under $TMPDIR/hatchgrab-harness/ and is removed on exit ("Disk space")
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const { webkit, devices } = require(path.join(REPO, 'node_modules/playwright'))
const BASE = process.env.BASE || 'http://localhost:3100'
const BEFORE = process.env.BEFORE_BASE || null
const OUT = path.join(REPO, 'docs/app-fixes-1')
const TT = process.env.TEST_TRUCK_TOKEN, FR = process.env.FR_DEMO_TOKEN
if (!TT || !FR) { console.error('Set TEST_TRUCK_TOKEN (test-truck\'s dashboard_token) and FR_DEMO_TOKEN (a French demo truck\'s).'); process.exit(2) }
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
const watch = page => {
  const errors = []
  page.on('pageerror', e => errors.push('pageerror: ' + e.message))
  page.on('console', m => { if (m.type() === 'error' && /MISSING_MESSAGE|is not a function|TypeError|ReferenceError/.test(m.text())) errors.push('console: ' + m.text().slice(0, 300)) })
  return errors
}
/** French settings on Pizza Kitchen, taken from the French demo truck's own /api/dashboard answer (time + money), applied
 *  to Pizza Kitchen's answer in the browser only — no data is changed. Le Roi's shape: FR, trial plan, two presses. */
async function frenchPizzaKitchen(page, extra = {}) {
  const fr = await (await fetch(`${BASE}/api/dashboard?token=${encodeURIComponent(FR)}`)).json().catch(() => null)
  const over = { time: fr?.truck?.time, money: fr?.truck?.money, country: 'FR', currency: 'EUR', timezone: 'Europe/Paris', completion_presses: 'two', ...extra }
  await page.route(u => new URL(u).pathname === '/api/dashboard', async route => {
    const res = await route.fetch(); const body = await res.json().catch(() => null)
    if (body?.truck) Object.assign(body.truck, over)
    await route.fulfill({ response: res, json: body })
  })
}
const shot = (page, name, full = true) => page.screenshot({ path: path.join(OUT, name), fullPage: full })

;(async () => {
  const browser = await webkit.launch()

  // ══ §1 · AUTH END STATES — web (desktop) and app (iPhone, the app's user agent + bridge) ════════════════════════════════
  head('§1 · auth end states (web + app)')
  const forgotOk = route => route.fulfill({ status: 200, json: { ok: true } })
  const resetAnswer = code => route => route.fulfill(code ? { status: 400, json: { error: code === 'reset_link_expired' ? 'This reset link has expired. Please request a new one.' : 'This reset link has already been used. Please request a new one.', code, params: {} } } : { status: 200, json: { ok: true } })
  for (const [label, base] of [['after', BASE], ...(BEFORE ? [['before', BEFORE]] : [])]) {
    for (const app of [false, true]) {
      const where = app ? 'app' : 'web'
      const ctx = await context(browser, app ? { app: true, locale: 'en-GB' } : { viewport: { width: 1280, height: 800 }, locale: 'en-GB' })
      const page = await ctx.newPage()
      const name = s => `${label}-auth-${s}-${where}.png`
      // login
      await page.goto(`${base}/login`, { waitUntil: 'networkidle' }); await shot(page, name('01-login'))
      // forgot → email sent (the POST is answered here: no email is sent)
      await page.route('**/api/auth/forgot-password', forgotOk)
      await page.goto(`${base}/forgot-password`, { waitUntil: 'networkidle' }); await shot(page, name('02-forgot'))
      await page.fill('input[type=email]', 'nobody@example.invalid'); await page.click('button[type=submit]')
      await page.waitForTimeout(800); await shot(page, name('03-email-sent'))
      const sentLink = await page.$('a[href="/login"]')
      if (label === 'after') t(`${where}: "email sent" has "Back to log in" → /login`, !!sentLink && /Back to log in/.test(await sentLink.innerText()))
      // reset with no token → invalid
      await page.goto(`${base}/reset-password`, { waitUntil: 'networkidle' }); await shot(page, name('04-invalid-link'))
      if (label === 'after') t(`${where}: no-token link → "Send a new link" + "Back to log in"`, (await page.$('[data-auth-end="invalid"] a[href="/forgot-password"]')) !== null && (await page.$('[data-auth-end="invalid"] a[href="/login"]')) !== null)
      // reset form, expired, used, done
      for (const [state, code] of [['05-expired', 'reset_link_expired'], ['06-used', 'reset_link_used'], ['07-done', null]]) {
        await page.unroute('**/api/auth/reset-password').catch(() => {})
        await page.route('**/api/auth/reset-password', resetAnswer(code))
        await page.goto(`${base}/reset-password?token=harness-not-a-token`, { waitUntil: 'networkidle' })
        if (state === '05-expired') await shot(page, name('04b-reset-form'))
        await page.fill('input[autocomplete="new-password"] >> nth=0', 'harness-pass-1'); await page.fill('input[autocomplete="new-password"] >> nth=1', 'harness-pass-1')
        await page.click('button[type=submit]'); await page.waitForTimeout(1500)
        await shot(page, name(state))
        if (label === 'after') {
          if (code) t(`${where}: ${code} → a card with "Send a new link" + "Back to log in"`, (await page.$('[data-auth-end="link-error"] a[href="/forgot-password"]')) !== null && (await page.$('[data-auth-end="link-error"] a[href="/login"]')) !== null)
          else {
            const btn = await page.$('[data-auth-end="done"] a[href="/login"]')
            t(`${where}: success → "Log in" → /login`, !!btn && /Log in/.test(await btn.innerText()))
            if (btn) { await btn.click(); await page.waitForLoadState('networkidle').catch(() => {}); t(`${where}: "Log in" lands on the login page (never the landing page)`, new URL(page.url()).pathname === '/login', page.url()) }
          }
        }
      }
      // callback invalid link
      await page.goto(`${base}/login?error=invalid_link`, { waitUntil: 'networkidle' }); await shot(page, name('08-callback-invalid'))
      if (label === 'after') t(`${where}: /login?error=invalid_link says so`, (await page.$('[data-auth-end="callback-invalid"]')) !== null)
      await ctx.close()
    }
  }

  // ══ §2 · CARTE & STOCK — 320 / 375 / 390 / 430 / iPad / desktop, French demo truck, long names, a category limit ═══════
  head('§2 · Carte & stock')
  const LONG = ['Picanha grelhada com farofa e vinagrete', 'Supercalifragilisticexpialidocious', 'Feijoada completa à brasileira (pour deux)']
  for (const [w, h] of [[320, 700], [375, 760], [390, 844], [430, 932], [820, 1180], [1280, 900]]) {
    const ctx = await context(browser, { viewport: { width: w, height: h } })
    const page = await ctx.newPage()
    await page.route(u => /\/api\/menu\//.test(new URL(u).pathname), async route => {
      const res = await route.fetch(); const body = await res.json()
      const byCat = {}; for (const it of body?.menu?.items || []) (byCat[it.category] ||= []).push(it)
      const cats = Object.keys(byCat)
      if (byCat[cats[0]]?.[0]) byCat[cats[0]][0].name = LONG[0]
      if (byCat[cats[1]]?.[0]) byCat[cats[1]][0].name = LONG[1]
      if (byCat[cats[1]]?.[1]) byCat[cats[1]][1].name = LONG[2]
      await route.fulfill({ response: res, json: body })
    })
    await page.route(u => new URL(u).pathname === '/api/dashboard/action', async route => {
      const res = await route.fetch(); let body; try { body = await res.json() } catch { return route.fulfill({ response: res }) }
      if (Array.isArray(body?.categoryStocks)) { body.categoryStocks = body.categoryStocks.filter(c => c.category !== 'Mains'); body.categoryStocks.push({ category: 'Mains', stock_count: 30, default_stock: null, orders_count: 4, available: true }) }
      await route.fulfill({ response: res, json: body })
    })
    await page.goto(`${BASE}/dashboard/${FR}?tab=stock`, { waitUntil: 'networkidle', timeout: 90000 }); await page.waitForTimeout(2500)
    const m = await page.evaluate(() => {
      const de = document.documentElement
      const rows = [...document.querySelectorAll('[data-stock-row]')].filter(e => e.offsetParent)
      const col = (r, c) => r.querySelector(`[data-stock-col="${c}"]`)?.getBoundingClientRect()
      const limitR = new Set(rows.map(r => Math.round(col(r, 'limit')?.right ?? -1)))
      const onC = new Set(rows.map(r => { const b = col(r, 'on'); return b ? Math.round(b.left + b.width / 2) : -1 }))
      let overlap = 0
      for (const r of rows.filter(r => r.dataset.stockRow === 'item')) { const n = r.querySelector('p'); const p = col(r, 'price'); if (n && p && n.getBoundingClientRect().right > p.left + 0.5) overlap++ }
      const card = rows[0]?.closest('.rounded-2xl')?.getBoundingClientRect()
      const outside = rows.filter(r => card && r.getBoundingClientRect().right > card.right + 0.5).length
      const catLines = [...document.querySelectorAll('[data-stock-cat-name]')].map(el => { const ps = el.querySelectorAll('p'); return ps.length < 2 || ps[1].getBoundingClientRect().top >= ps[0].getBoundingClientRect().bottom - 1 })
      return { hscroll: de.scrollWidth > de.clientWidth, rows: rows.length, limitR: [...limitR], onC: [...onC], overlap, outside, catLines }
    })
    t(`${w}px: ${m.rows} rows, no horizontal scroll`, m.rows > 3 && !m.hscroll)
    t(`${w}px: every limit box on one vertical line`, m.limitR.length === 1 && m.limitR[0] > 0, m.limitR.join('/'))
    t(`${w}px: every switch on one vertical line`, m.onC.length === 1 && m.onC[0] > 0, m.onC.join('/'))
    t(`${w}px: no item name runs into its price; no row leaves the card`, m.overlap === 0 && m.outside === 0, JSON.stringify(m))
    t(`${w}px: "Reste : N" is on the line under the category name`, m.catLines.every(Boolean))
    try { await page.locator('[data-stock-head]').scrollIntoViewIfNeeded({ timeout: 3000 }) } catch {}
    await shot(page, `after-stock-${w}.png`, w < 640)
    await ctx.close()
  }

  // ══ §3 · PARAMÈTRES IN THE APP (production build), the error page's button, one broken card contained ═════════════════
  head('§3 · Paramètres in the app')
  for (const [device, tag] of [['iPhone 13', 'iphone'], ['iPad Pro 11', 'ipad']]) {
    for (const [label, base] of [['after', BASE], ...(BEFORE ? [['before', BEFORE]] : [])]) {
      const ctx = await context(browser, { app: true, device, prefs: { hg_print_enabled: 'true' } })
      const page = await ctx.newPage(); const errors = watch(page)
      const fetchBase = base
      const fr = await (await fetch(`${fetchBase}/api/dashboard?token=${encodeURIComponent(FR)}`)).json().catch(() => null)
      await page.route(u => new URL(u).pathname === '/api/dashboard', async route => {
        const res = await route.fetch(); const body = await res.json().catch(() => null)
        if (body?.truck) Object.assign(body.truck, { time: fr?.truck?.time, money: fr?.truck?.money, country: 'FR', currency: 'EUR', completion_presses: 'two' })
        await route.fulfill({ response: res, json: body })
      })
      // 'load', not 'networkidle': the deployed dashboard keeps a realtime connection open, so it is never idle.
      await page.goto(`${base}/dashboard/${TT}?tab=settings`, { waitUntil: 'load', timeout: 90000 }); await page.waitForTimeout(8000)
      const body = await page.locator('body').innerText()
      if (label === 'after') {
        t(`${tag}: Paramètres loads in the app (no error page)`, !/Une erreur est survenue/.test(body) && /Paramètres/.test(body), body.slice(0, 200))
        t(`${tag}: the printing card is in French, no raw keys`, /Impression des tickets cuisine/.test(body) && !/printing\.card\./.test(body))
        t(`${tag}: no MISSING_MESSAGE / "is not a function"`, errors.length === 0, errors.join(' | '))
      } else console.log(`  (before, ${tag}: ${/Une erreur est survenue/.test(body) ? 'the error page' : 'loaded'}; ${errors.length} error(s): ${errors.slice(0, 2).join(' | ')})`)
      try { await page.getByText(/Impression des tickets cuisine/).first().scrollIntoViewIfNeeded({ timeout: 3000 }) } catch {}
      await shot(page, `${label}-parametres-app-${tag}.png`, false)
      await ctx.close()
    }
  }
  // printing labels, en-GB and fr-FR, the settings opened (iPad, app)
  for (const lang of ['en-GB', 'fr-FR']) {
    const ctx = await context(browser, { app: true, device: 'iPad Pro 11', locale: lang, prefs: { hg_print_enabled: 'true' } })
    const page = await ctx.newPage(); const errors = watch(page)
    if (lang === 'fr-FR') await frenchPizzaKitchen(page)
    await page.goto(`${BASE}/dashboard/${TT}?tab=settings`, { waitUntil: 'networkidle', timeout: 90000 }); await page.waitForTimeout(3000)
    const card = page.locator('div.rounded-2xl', { has: page.getByText(lang === 'fr-FR' ? /Impression des tickets cuisine/ : /Kitchen ticket printing/) }).last()
    try { await card.locator('button[aria-expanded]').last().click({ timeout: 4000 }); await page.waitForTimeout(600) } catch {}
    const txt = await card.innerText().catch(() => '')
    t(`printing (${lang}): proper labels, no raw keys (a.b.c)`, txt.length > 40 && !/\b[a-z]+\.[a-z]+\.[a-zA-Z]+\b/.test(txt), txt.slice(0, 300))
    t(`printing (${lang}): no MISSING_MESSAGE`, errors.length === 0, errors.join(' | '))
    try { await card.scrollIntoViewIfNeeded({ timeout: 3000 }); await card.screenshot({ path: path.join(OUT, `after-printing-${lang}.png`) }) } catch (e) { t(`printing (${lang}): screenshot`, false, e.message) }
    await ctx.close()
  }
  // one broken card: a date that is not a date in the online-payments card → that card only is replaced
  {
    const ctx = await context(browser, { app: true, device: 'iPhone 13' })
    const page = await ctx.newPage()
    await frenchPizzaKitchen(page, { stripe_charges_enabled: true, online_payments_paused_at: 'not-a-date' })
    await page.goto(`${BASE}/dashboard/${TT}?tab=settings`, { waitUntil: 'networkidle', timeout: 90000 }); await page.waitForTimeout(3000)
    const failed = await page.$('[data-section-failed]'); const body = await page.locator('body').innerText()
    t('one card that throws is replaced by "Cette section ne s’est pas chargée." and the rest of Paramètres stays', !!failed && /Cette section ne s’est pas chargée/.test(body) && /Acceptation auto des commandes/.test(body) && !/Une erreur est survenue/.test(body), body.slice(0, 300))
    if (failed) { await failed.scrollIntoViewIfNeeded(); await shot(page, 'after-section-contained-app.png', false) }
    await ctx.close()
  }
  // the error page's second button: a render that throws above the tabs (the truck's name is not text)
  for (const app of [false, true]) {
    const where = app ? 'app' : 'web'
    const ctx = await context(browser, app ? { app: true, device: 'iPhone 13' } : { viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()
    // App: Pizza Kitchen in French; from the SECOND /api/dashboard answer (the 60s poll) the operator's name is not text, so
    // the user menu throws AFTER the page is in French. Web: the French demo truck (token-only) whose event's venue is not
    // text — the header throws on the first render, before the truck's language is applied, so that page is in English.
    // Either way the button is errorPage.backToDashboard in the page's language and goes to /dashboard/<that token>.
    const tok = app ? TT : FR
    if (app) {
      const fr = await (await fetch(`${BASE}/api/dashboard?token=${encodeURIComponent(FR)}`)).json().catch(() => null)
      let n = 0
      await page.route(u => new URL(u).pathname === '/api/dashboard', async route => {
        const res = await route.fetch(); const b = await res.json().catch(() => null)
        if (b?.truck) Object.assign(b.truck, { time: fr?.truck?.time, money: fr?.truck?.money, country: 'FR', currency: 'EUR' })
        if (++n >= 2 && b) b.currentUserName = { not: 'text' }
        await route.fulfill({ response: res, json: b })
      })
    } else {
      await page.route(u => new URL(u).pathname === '/api/events/manage', async route => { const res = await route.fetch(); const b = await res.json().catch(() => null); for (const e of b?.events || []) e.venue_name = { not: 'text' }; await route.fulfill({ response: res, json: b }) })
    }
    await page.goto(`${BASE}/dashboard/${tok}?tab=settings`, { waitUntil: 'networkidle', timeout: 90000 })
    await page.waitForSelector('a[data-error-next="dashboard"]', { timeout: app ? 80000 : 20000 }).catch(() => {})
    const btn = await page.$('a[data-error-next="dashboard"]')
    const href = btn ? await btn.getAttribute('href') : null
    const label = btn ? (await btn.innerText()).trim() : ''
    t(`${where}: the error page's button is "Back to dashboard" / "Retour au tableau de bord" and goes to /dashboard/<that token>`, (label === 'Back to dashboard' || label === 'Retour au tableau de bord') && href === `/dashboard/${tok}`, `label=${label} href=${href}`)
    if (app) t('app: the error page is in French once the truck\'s language is set ("Retour au tableau de bord")', label === 'Retour au tableau de bord', label)
    await shot(page, `after-error-page-${where}.png`, false)
    await ctx.close()
  }

  // ══ §4 · IN THE APP, THE LANDING PAGE GOES TO /app; A CUSTOMER LINK LEAVES FOR THE BROWSER ═══════════════════════════════
  head('§4 · the app never shows the landing page')
  {
    const ctx = await context(browser, { app: true, device: 'iPhone 13', locale: 'en-GB' })
    const page = await ctx.newPage()
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
    t('app: opening "/" lands on /app (→ dashboard or login), not the landing page', new URL(page.url()).pathname !== '/', page.url())
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
    const navs = []
    page.on('request', r => { if (r.isNavigationRequest() && r.frame() === page.mainFrame()) navs.push(r.url()) })
    await page.evaluate(() => { for (const [id, href] of [['l1', '/'], ['l2', '/trucks/pizza-kitchen/order'], ['l3', '/dashboard/x']]) { const a = document.createElement('a'); a.id = id; a.href = href; a.textContent = id; document.body.appendChild(a) } })
    await page.click('#l1'); await page.waitForLoadState('networkidle').catch(() => {})
    t('app: a link to "/" goes to /app', navs.some(u => new URL(u).pathname === '/app') && !navs.some(u => new URL(u).pathname === '/'), navs.join(', '))
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' }); navs.length = 0
    await page.evaluate(() => { const a = document.createElement('a'); a.id = 'l2'; a.href = '/trucks/pizza-kitchen/order'; a.textContent = 'l2'; document.body.appendChild(a) })
    await page.click('#l2'); await page.waitForTimeout(1500)
    const firstNav = navs[0] ? new URL(navs[0]) : null
    // On www this is hatchgrab.com/… (which both shells hand to the phone's browser); on localhost the host is unchanged, so the
    // proxy then sends the in-app request to /app. Either way, the order page never renders inside the app.
    t('app: a customer link is handed off (bare domain on www), never rendered in the app', !!firstNav && firstNav.pathname === '/trucks/pizza-kitchen/order' && (BASE.includes('www.') ? !firstNav.hostname.startsWith('www.') : new URL(page.url()).pathname !== '/trucks/pizza-kitchen/order'), `${navs.join(', ')} → ${page.url()}`)
    await ctx.close()
    const web = await context(browser, { viewport: { width: 1280, height: 800 }, locale: 'en-GB' })
    const wp = await web.newPage(); await wp.goto(`${BASE}/`, { waitUntil: 'networkidle' })
    t('web: "/" is still the website (unchanged)', new URL(wp.url()).pathname === '/', wp.url())
    await web.close()
  }

  await browser.close()
  console.log(`\n${fail ? '🔴' : '✅'} app-fixes-1-screens: ${pass} passed, ${fail} failed (screenshots in docs/app-fixes-1/)`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
