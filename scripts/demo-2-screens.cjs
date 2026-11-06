#!/usr/bin/env node
// scripts/demo-2-screens.cjs — demo-2 (30 October 2026, docs/demo-2-report.md): the new demo in a real browser, FIXTURE
// DATA ONLY, in WebKit and Chromium at 390 and 1512.
//   1 · start the ONE dev server:  npm run dev   (http://hatchgrab.localhost:3000)
//   2 · node scripts/demo-2-screens.cjs
//
// The REAL pages are opened on the dev server — the landing page's upload modal, the demo order page and the walkthrough
// (/try/<slug>) — and EVERY /api request is answered here from fixtures: a sample pizza truck "demo-shot" in GB, its
// live event, its slots, and the walkthrough's orders. Any other /api call, and anything that would leave the machine
// (Supabase, Stripe, PostHog), is aborted — nothing reaches a database or the network. Admin › Demos sits behind an
// admin session, so the REAL tab (components/admin/DemosTab.tsx) is bundled for the browser and fed a fixture answer,
// as scripts/comparison-features-1-screens.cjs does for Pricing check.
// Writes docs/demo-2/<engine>-<shot>-<width>.png, and FAILS if a page scrolls sideways, logs an error, or a shot's
// marker is missing.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS script, like every scripts/*.cjs */
'use strict'
const fs = require('fs'); const os = require('os'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const OUT = path.join(REPO, 'docs/demo-2')
const BASE = process.env.HG_DEV_URL || 'http://hatchgrab.localhost:3000'
const SLUG = 'demo-shot'
const KEY = '11111111-2222-4333-8444-555555555555'

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 600)}` : '')) } }

// ── fixtures ──
const london = (d, opts) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', ...opts }).format(d)
const now = new Date()
const ymd = london(now, { year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-')
const hm = d => london(d, { hour: '2-digit', minute: '2-digit', hour12: false })
const startD = new Date(now.getTime() - 30 * 60_000), endD = new Date(now.getTime() + 3 * 3600_000)
const START = `${hm(startD)}:00`, END = hm(endD) < hm(startD) ? '23:59:00' : `${hm(endD)}:00`
const TIME = { timeZone: 'Europe/London', locale: 'en-GB', timeFormat: '24h', dateOrder: 'dmy', weekStart: 'monday' }
const slotTimes = []
for (let m = 15; m <= 150; m += 5) { const d = new Date(now.getTime() + m * 60_000); const s = hm(d); if (s > hm(now)) slotTimes.push(`${s}:00`) }
const EVENT = { id: 'ev-shot', date: ymd.split('-').reverse().join('/'), date_iso: ymd, date_friendly: 'Today', start_time: START, end_time: END,
  venue_name: 'Market Square', village: 'Royston', postcode: 'SG8 7AA', notes: '', status: 'open', collection_interval_mins: 5, opened_at: now.toISOString() }
const ITEMS = [
  ['Margherita', 'Tomato, mozzarella, basil', 9.5, 'Pizza'], ['Pepperoni', 'Tomato, mozzarella, pepperoni', 11, 'Pizza'],
  ['Nduja & Honey', 'Spicy nduja, hot honey, mozzarella', 12, 'Pizza'], ['Garlic Bread', 'With rosemary salt', 4.5, 'Sides'],
  ['San Pellegrino', 'Lemon or blood orange', 2.5, 'Drinks'],
].map(([name, description, price, category]) => ({ name, description, price, category, available: true, stock_remaining: null, allergens: [], dietary: [], spiciness: null, modifierGroups: [] }))
const MENU = {
  truck: { id: 'demo-shot-truck', name: 'Demo Kitchen (shot01)', money: { currency: 'GBP', locale: 'en-GB' }, time: TIME,
    phone: { phoneCountry: 'GB', short_name: 'UK', phone_example: '07700 900123' }, logo: null, mode: 'village', venue_name: null, time_selection_enabled: true,
    paused: false, pauseReason: null, extra_wait_mins: 0, plan: 'demo', preordering_on: true, pay_at_hatch_on: true, allergen_info_url: null, allergen_info_text: null,
    allergen_display_mode: 'both', preorder_open_rule: null, ordering_available: true, card_payments_ready: false, allergensVerified: true },
  menu: { categories: ['Pizza', 'Sides', 'Drinks'].map((n, i) => ({ id: `cat-${i}`, name: n, prep_secs: i === 0 ? 300 : 0, batch_size: i === 0 ? 4 : null, allowNotes: false, modifierGroups: [], subcategories: [] })),
    items: ITEMS, upsell_rules: [], bundles: [] },
}
const SLOTS = { slots: slotTimes.map(c => ({ collection_time: c, available: true, remaining: 4, is_past: false, too_soon: false, is_grace: false })),
  queueByCat: {}, catConfigs: {}, tz: 'Europe/London', queryDate: ymd, capacityInputs: null }
const ORDER = (status) => ({ orderKey: KEY, number: '1', name: 'Alex', slot: slotTimes[3] ?? slotTimes[0] ?? '12:30:00', status,
  items: [{ name: 'Margherita', quantity: 1 }, { name: 'Garlic Bread', quantity: 1 }], deals: [], createdAt: now.toISOString() })

/** Answers every /api call from fixtures; aborts anything that would leave the machine. */
async function wire(page, state) {
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route('**/*', async route => {
    const u = new URL(route.request().url())
    const local = u.hostname.endsWith('localhost') || u.hostname === '127.0.0.1'
    if (!local) return route.abort()
    if (!u.pathname.startsWith('/api/')) return route.continue()
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (u.pathname === '/api/events') return json({ truck_slug: SLUG, truck_name: MENU.truck.name, events: [EVENT], next_event: EVENT, time: TIME })
    if (u.pathname.startsWith(`/api/menu/`)) return json(MENU)
    if (u.pathname.startsWith(`/api/slots/`)) return json(SLOTS)
    if (u.pathname === '/api/demo/walkthrough') {
      if (route.request().method() === 'GET') return json({ ok: true, orders: state.order ? [ORDER(state.order)] : [] })
      const body = JSON.parse(route.request().postData() || '{}')
      if (body.action === 'open') return json({ ok: true, restarted: false, source: 'landing', trialMonths: 3, time: TIME, truckName: 'Demo Kitchen' })
      if (body.action === 'start_cooking') { state.order = 'cooking'; return json({ ok: true, status: 'cooking' }) }
      if (body.action === 'ready') { state.order = 'ready'; return json({ ok: true, status: 'ready' }) }
      return json({ ok: true })
    }
    return json({ ok: false, error: 'not in the fixtures' }, 404)
  })
  return errors
}
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)

async function css() {
  const postcss = (await import(path.join(REPO, 'node_modules/postcss/lib/postcss.mjs'))).default
  const tw = (await import(require.resolve('@tailwindcss/postcss', { paths: [REPO] }))).default
  const from = path.join(REPO, 'app/(app)/globals.css')
  const r = await postcss([tw({ base: REPO })]).process(fs.readFileSync(from, 'utf8').replace(/@import "leaflet[^"]*";/, ''), { from })
  return r.css
}
const ADMIN_DATA = {
  from: '2026-10-01', to: '2026-10-30', source: 'all', funnelAvailable: true,
  funnel: { build_started: 41, build_ok: 37, build_failed: 4, sample_used: 6, menu_viewed: 35, order_placed: 22, cooking_started: 19, ready_pressed: 17, signup_started: 6, signup_done: 3 },
  demos: [
    { truckId: 'demo-a1', createdAt: '2026-10-30T10:12:00Z', expiresAt: '2026-10-31T10:12:00Z', source: 'landing', email: 'sam@sams-pizza.co.uk', marketingOptIn: true, country: 'GB', truckName: null, itemsFound: 23, extraction: 'upload',
      files: [{ path: 'demo-a1/1761819120000-menu-board.jpg', name: 'menu-board.jpg', size: 2400000 }], ordered: true, finishedWalkthrough: true, startedSignup: true, signedUp: false },
    { truckId: 'demo-a2', createdAt: '2026-10-30T09:40:00Z', expiresAt: '2026-10-31T09:40:00Z', source: 'landing', email: 'kim@example.com', marketingOptIn: false, country: 'IE', truckName: null, itemsFound: 4, extraction: 'template',
      files: [], ordered: true, finishedWalkthrough: false, startedSignup: false, signedUp: false },
    { truckId: 'demo-a3', createdAt: '2026-10-29T15:05:00Z', expiresAt: '2026-11-28T15:05:00Z', source: 'outreach', email: null, marketingOptIn: false, country: 'GB', truckName: 'Between Buns', itemsFound: 31, extraction: 'upload',
      files: [{ path: 'demo-a3/1761750300000-menu.pdf', name: 'menu.pdf', size: 820000 }, { path: 'demo-a3/1761750300001-menu.txt', name: 'menu.txt', size: 900 }], ordered: false, finishedWalkthrough: false, startedSignup: false, signedUp: false },
  ],
}
async function adminBundle() {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-demo2s-'))
  const entry = path.join(dir, 'entry.tsx')
  fs.writeFileSync(entry, `import { createRoot } from 'react-dom/client'
import DemosTab from '@/components/admin/DemosTab'
const DATA = ${JSON.stringify(ADMIN_DATA)}
window.fetch = async () => new Response(JSON.stringify(DATA), { status: 200, headers: { 'Content-Type': 'application/json' } })
createRoot(document.getElementById('root')!).render(<div className="w-full px-3 sm:px-6 lg:px-8 py-6"><DemosTab /></div>)
setTimeout(() => document.documentElement.setAttribute('data-ready', '1'), 400)`)
  const r = await esbuild.build({ entryPoints: [entry], bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', target: 'es2020', logLevel: 'error',
    alias: { '@': REPO }, nodePaths: [path.join(REPO, 'node_modules')], define: { 'process.env.NODE_ENV': '"production"' }, banner: { js: 'window.process = window.process || { env: {} };' } })
  fs.rmSync(dir, { recursive: true, force: true })
  return r.outputFiles[0].text
}

;(async () => {
  try { const r = await fetch(BASE, { method: 'HEAD' }); if (!r.ok && r.status >= 500) throw new Error(String(r.status)) }
  catch (e) { console.error(`🔴 no dev server at ${BASE} — start ONE with \`npm run dev\` first (${e.message})`); process.exit(1) }
  fs.mkdirSync(OUT, { recursive: true })
  const [styles, adminJs] = await Promise.all([css(), adminBundle()])
  const adminHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style><style>body{background:#F9F9F9;margin:0;font-family:-apple-system,system-ui,sans-serif}</style></head><body><div id="root"></div><script>${adminJs.replace(/<\/script>/g, '<\\/script>')}</script></body></html>`
  const pw = require(path.join(REPO, 'node_modules/playwright'))
  for (const engine of ['webkit', 'chromium']) {
    const browser = await pw[engine].launch()
    try {
      for (const width of [390, 1512]) {
        const phone = width < 1024
        const shot = (name) => path.join(OUT, `${engine}-${name}-${width}.png`)
        const ctx = await browser.newContext({ viewport: { width, height: phone ? 844 : 945 }, deviceScaleFactor: phone ? 2 : 1 })
        const state = { order: null }
        // ── 1 · the upload modal with the email step ──
        {
          const page = await ctx.newPage(); const errors = await wire(page, state)
          await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
          await page.locator('button:has-text("Upload my menu"):visible').first().click()   // the nav CTA hides on a phone; the hero's shows
          await page.waitForSelector('[data-demo-email]')
          await page.fill('#demo-upload-email', 'sam@sams-pizza.co.uk')
          const m = await page.evaluate(() => ({ field: !!document.querySelector('#demo-upload-email[required]'), box: !!document.querySelector('[data-demo-email] input[type=checkbox]:not(:checked)'),
            privacy: !!document.querySelector('[data-demo-email] a[href="/privacy"]') }))
          t(`${engine} ${width} upload modal: a required email, the privacy link, the unticked tips box; no sideways scroll`, m.field && m.box && m.privacy && !(await sideways(page)) && !errors.length, { ...m, errors })
          await page.locator('[data-demo-email]').scrollIntoViewIfNeeded()   // the privacy line and tips box in the shot
          await page.screenshot({ path: shot('upload-modal') })
          await page.close()
        }
        // ── 2 · step 1 — the visitor's own menu as a customer (phone: the order page; laptop: the walkthrough) ──
        {
          const page = await ctx.newPage(); const errors = await wire(page, state)
          await page.goto(phone ? `${BASE}/trucks/${SLUG}/order` : `${BASE}/try/${SLUG}`, { waitUntil: 'networkidle' })
          if (phone) {
            await page.waitForSelector('[data-demo-step]')
            const s = await page.evaluate(() => ({ step: document.querySelector('[data-demo-step]')?.textContent, banner: document.querySelector('[data-demo-banner-message]')?.textContent }))
            const overlap = await page.evaluate(() => { const m = document.querySelector('[data-demo-banner-message]')?.getBoundingClientRect(); const b = document.querySelector('[data-demo-banner-message]')?.nextElementSibling?.getBoundingClientRect(); return !!(m && b && m.right > b.left + 1) })
            t(`${engine} ${width} step 1: the banner sentence never runs under its button`, !overlap)
            t(`${engine} ${width} step 1: the step label and the banner sentence on the real order page`, /Step 1 of 3/.test(s.step || '') && /this is your menu/.test(s.banner || '') && !(await sideways(page)) && !errors.length, { ...s, errors })
          } else {
            await page.waitForSelector('[data-kitchen-empty]')
            const frame = page.frameLocator('iframe'); await frame.locator('[data-demo-step]').waitFor()
            t(`${engine} ${width} step 1: the order page in the phone frame, the three-step bar, and the kitchen "Waiting for orders"`, !!(await page.$('[data-step-bar] [data-state="current"]')) && !(await sideways(page)) && !errors.length, { errors })
          }
          await page.screenshot({ path: shot('step1-menu') })
          await page.close()
        }
        // ── 3 · the order has arrived: the kitchen, the speech bubble (phone) — then Start cooking, Ready ──
        {
          state.order = 'confirmed'
          const page = await ctx.newPage(); const errors = await wire(page, state)
          await page.addInitScript(([slug, key]) => { try { sessionStorage.setItem(`hg_demo_walk_orders_${slug}`, JSON.stringify([key])) } catch {} }, [SLUG, KEY])
          await page.goto(phone ? `${BASE}/try/${SLUG}?view=kitchen` : `${BASE}/try/${SLUG}`, { waitUntil: 'networkidle' })
          await page.waitForSelector('[data-kitchen-card="confirmed"]')
          if (phone) t(`${engine} ${width} kitchen: the order card with its collection time, and the white speech bubble "This is your kitchen screen"`,
            /This is your kitchen screen/.test(await page.locator('[data-speech-bubble]').textContent()) && !(await sideways(page)) && !errors.length, { errors })
          else t(`${engine} ${width} kitchen: the visitor's order on the right, step 2 current`, !!(await page.$('[data-step-bar] li:nth-child(2)[data-state="current"]')) && !(await sideways(page)) && !errors.length, { errors })
          t(`${engine} ${width} the collection time reads HH:MM, never with seconds`, !/\d\d:\d\d:\d\d/.test(await page.locator('[data-kitchen-card]').first().textContent()))
          await page.screenshot({ path: shot('kitchen') })
          await page.click('[data-kitchen-action="start"]'); await page.waitForSelector('[data-kitchen-card="cooking"]')
          if (phone) t(`${engine} ${width} after Start cooking: the bubble says to tap Ready`, /tap Ready/.test(await page.locator('[data-speech-bubble]').textContent()))
          await page.click('[data-kitchen-action="ready"]')
          await page.waitForSelector(phone ? '[data-walk-sheet]' : '[data-walk-band]')
          if (phone) {
            const sh = await page.locator('[data-walk-sheet]').textContent()
            t(`${engine} ${width} the bottom sheet: Step 3 of 3 · done, Alex told, Start free (or Save my menu while signup is off), Try another order`,
              /Step 3 of 3/.test(sh) && /Alex has just been told/.test(sh) && /(Start free for 3 months|Save my menu)/.test(sh) && /Try another order/.test(sh), sh)
          } else {
            const band = await page.locator('[data-walk-band]').textContent()
            t(`${engine} ${width} the band, and the phone side reads "Your order is ready"`, /That’s HatchGrab/.test(band) && /Order again/.test(band) && !!(await page.$('[data-phone-ready]')), band)
            const inView = await page.evaluate(() => { const r = document.querySelector('[data-walk-band]').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1 })
            t(`${engine} ${width} …the band is on screen without scrolling`, inView)
          }
          t(`${engine} ${width} …no sideways scroll, no error, and no token anywhere in the page's addresses`, !(await sideways(page)) && !errors.length && !/dashboard/.test(page.url()), { errors, url: page.url() })
          await page.screenshot({ path: shot('final') })
          await page.close()
        }
        // ── 4 · Admin › Demos ──
        {
          const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message))
          await page.setContent(adminHtml, { waitUntil: 'load' }); await page.waitForSelector('html[data-ready]'); await page.waitForSelector('[data-demos-funnel]')
          const a = await page.evaluate(w => ({ rows: document.querySelectorAll(w < 768 ? '[data-demo-card]' : '[data-demo-row]').length, sideways: document.documentElement.scrollWidth > innerWidth + 1 }), width)
          t(`${engine} ${width} Admin › Demos: the funnel and three demos (${phone ? 'cards' : 'a table'}); no sideways scroll`, a.rows === 3 && !a.sideways && !errors.length, { ...a, errors })
          await page.screenshot({ path: shot('admin-demos'), fullPage: true })
          await page.close()
        }
        await ctx.close()
      }
    } finally { await browser.close() }
  }
  console.log(`\n${fail ? '🔴' : '✅'} demo-2-screens: ${pass} passed, ${fail} failed — ${OUT}`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
