// scripts/deals-order-1-live.cjs — deals-order-1 (13 November 2026, docs/deals-order-1-report.md): drag to reorder the formules in
// Manage › Menu › Deals, on the test truck App Tester. BY HAND, NOT SWEPT (it needs local browsers, and §3 needs `next start`).
//   node scripts/deals-order-1-live.cjs                        §1 + §2 (no server, no database)
//   npx next start -p 3100 &   then   node scripts/deals-order-1-live.cjs --live "<name 1>|<name 2>|<name 3>"   …and §3
//
// ⚠️ WHY MANAGE IS MOUNTED, NOT OPENED: Manage refuses without a signed-in owner (lib/truck-access.ts — deny by default), and this
// script has no session for App Tester's owner and must not mint one. So, as scripts/costs-accounts-1-screens.cjs does, the REAL
// DealsTab and MenuTab from app/(app)/manage/[token]/page.tsx are bundled for the browser and mounted; their `api` is answered by a
// small stand-in that saves exactly what app/api/manage/route.ts saves (update_bundle_order / update_category_order: that row's
// sort_order) and lists in the route's order (sort_order, then created_at). It keeps its rows in the page's localStorage, so a
// RELOAD of the page reads back what was saved — the stand-in for the database. Seeded with App Tester's three test formules
// (migration 20261099: the real ids, names, prices and categories).
//   §1 MOUSE, desktop (Chromium and WebKit, 1280 px): the six-dot handle on every formule; drag "Pizza + Dessert" onto the top row →
//      it becomes first; the calls are one update_bundle_order per formule, 1, 2, 3, in the new order; "Deal updated"; after a
//      reload the order is still the new one. The CATEGORY list (moved onto the same mechanism) still reorders and saves the same way.
//   §2 iPAD AND PHONE WIDTHS ON A TOUCH SCREEN (Chromium and WebKit, 820 and 390 px, hasTouch): the handle is on screen and is what a
//      finger lands on, nothing scrolls sideways, and a drag reorders and saves. ⚠️ A REAL FINGER DRAG CANNOT BE AUTOMATED HERE (§2's
//      comment); it is the category list's own native drag, and needs a real iPad / phone to see.
//   §3 THE REAL DATABASE, localhost (--live, App Tester): the order page's Formules tab and the dashboard's deal list (/api/menu?
//      dashboard=1) list the formules in exactly the order given (the truck's sort_order in the database).
// Writes docs/deals-order-1/*.png.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http')
const REPO = path.resolve(__dirname, '..')
const OUT = path.join(REPO, 'docs/deals-order-1')
fs.mkdirSync(OUT, { recursive: true })
let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 900)}` : '')) } }

async function css() {
  const postcss = require(require.resolve('postcss', { paths: [REPO] }))
  const tw = require(require.resolve('@tailwindcss/postcss', { paths: [REPO] }))
  const src = fs.readFileSync(path.join(REPO, 'app/(app)/globals.css'), 'utf8').replace(/@import "leaflet[^"]*";\n?/, '')
  return (await postcss([tw({ base: REPO })]).process(src, { from: path.join(REPO, 'app/(app)/globals.css') })).css
}
const STUBS = {
  'next/navigation': "export const useRouter = () => ({ push(){}, replace(){}, refresh(){}, back(){}, prefetch(){} }); export const usePathname = () => '/manage'; export const useSearchParams = () => new URLSearchParams(location.search); export const useParams = () => ({ token: 'harness' }); export const notFound = () => {}; export const redirect = () => {}",
  'next/link': "import React from 'react'; export default function Link(p) { const { href, children, prefetch, replace, scroll, ...rest } = p; return React.createElement('a', { href: typeof href === 'string' ? href : '#', ...rest }, children) }",
  'next/image': "import React from 'react'; export default function Image(p) { const { src, alt, fill, priority, quality, placeholder, blurDataURL, unoptimized, loader, ...rest } = p; return React.createElement('img', { src: typeof src === 'string' ? src : '', alt, ...rest }) }",
}
async function bundle(entrySrc) {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-do1-'))
  const entry = path.join(dir, 'entry.tsx'); fs.writeFileSync(entry, entrySrc)
  const MANAGE = path.join(REPO, 'app/(app)/manage/[token]/page.tsx')
  await esbuild.build({
    entryPoints: [entry], bundle: true, outfile: path.join(dir, 'bundle.js'), format: 'iife', platform: 'browser',
    jsx: 'automatic', target: 'es2020', logLevel: 'error', alias: { '@': REPO }, nodePaths: [path.join(REPO, 'node_modules')],
    banner: { js: 'window.process = window.process || { env: {} };' }, loader: { '.svg': 'text', '.png': 'empty' },
    define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_SUPABASE_URL': '"http://127.0.0.1:9"', 'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': '"harness"' },
    plugins: [{ name: 'stubs', setup(b) {
      b.onResolve({ filter: /^next\/(navigation|link|image)$/ }, a => ({ path: a.path, namespace: 'stub' }))
      b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: STUBS[a.path], loader: 'js', resolveDir: REPO }))
      // Neither tab is exported by the Manage page; expose both for this check only.
      b.onLoad({ filter: /app\/\(app\)\/manage\/\[token\]\/page\.tsx$/ }, a => (a.path === MANAGE
        ? { contents: fs.readFileSync(MANAGE, 'utf8') + '\nexport { DealsTab, MenuTab }\n', loader: 'tsx', resolveDir: path.dirname(MANAGE) } : undefined))
    } }],
  })
  return fs.readFileSync(path.join(dir, 'bundle.js'), 'utf8')
}

// App Tester's three test formules (migration 20261099) and three of its categories, as the stand-in's starting rows.
const ENTRY = `import { createRoot } from 'react-dom/client'
import { useState, useCallback } from 'react'
import { DealsTab, MenuTab } from '@/app/(app)/manage/[token]/page'
import { CountrySettingsProvider } from '@/components/CountrySettingsProvider'
import { TruckTimeContext } from '@/components/TruckTimeContext'
import { LEGACY_UK_TIME_SETTINGS } from '@/lib/time-utils'
const SEED = {
  bundles: [
    { id: 'd0000001-0000-4000-8000-00000000a001', name: 'Pizza + Drink', description: 'Any pizza and any drink', bundle_price: 14.5, original_price: 16.5, is_available: true, apply_to_new_events: true, start_time: null, end_time: null, slot_1_category: 'pizza', slot_2_category: 'drinks', slot_3_category: null, slot_4_category: null, slot_5_category: null, slot_6_category: null, sort_order: 1, created_at: '2026-11-13T10:00:00Z' },
    { id: 'd0000001-0000-4000-8000-00000000a002', name: 'Dough Balls + Drink', description: 'Dough balls and any drink', bundle_price: 7.5, original_price: 8.5, is_available: true, apply_to_new_events: true, start_time: null, end_time: null, slot_1_category: 'dough-balls', slot_2_category: 'drinks', slot_3_category: null, slot_4_category: null, slot_5_category: null, slot_6_category: null, sort_order: 2, created_at: '2026-11-13T10:00:00Z' },
    { id: 'd0000001-0000-4000-8000-00000000a003', name: 'Pizza + Dessert', description: 'Any pizza and any dessert', bundle_price: 16, original_price: 18.5, is_available: true, apply_to_new_events: true, start_time: null, end_time: null, slot_1_category: 'pizza', slot_2_category: 'desserts', slot_3_category: null, slot_4_category: null, slot_5_category: null, slot_6_category: null, sort_order: 3, created_at: '2026-11-13T10:00:00Z' },
  ],
  categories: [
    { id: 'c-pizza', name: 'Pizza', slug: 'pizza', sort_order: 1, is_active: true, prep_secs: 0, batch_size: 0, allow_notes: false },
    { id: 'c-drinks', name: 'Drinks', slug: 'drinks', sort_order: 2, is_active: true, prep_secs: 0, batch_size: 0, allow_notes: false },
    { id: 'c-desserts', name: 'Desserts', slug: 'desserts', sort_order: 3, is_active: true, prep_secs: 0, batch_size: 0, allow_notes: false },
  ],
}
// THE STAND-IN FOR THE DATABASE: localStorage, so a page reload reads back what was saved.
const load = () => { try { return JSON.parse(localStorage.getItem('do1') || 'null') || SEED } catch { return SEED } }
const store = load()
const persist = () => localStorage.setItem('do1', JSON.stringify(store))
// app/api/manage/route.ts's order: sort_order, then created_at.
const ordered = rows => [...rows].sort((a, b) => (a.sort_order - b.sort_order) || String(a.created_at || '').localeCompare(String(b.created_at || '')))
window.__calls = []; window.__toasts = []
const api = async (action, body) => {
  window.__calls.push({ action, body })
  if (action === 'update_bundle_order') { const r = store.bundles.find(b => b.id === body.id); if (r) r.sort_order = body.sort_order; persist(); return { success: true } }
  if (action === 'update_category_order') { const r = store.categories.find(c => c.id === body.id); if (r) r.sort_order = body.sort_order; persist(); return { success: true } }
  return {}
}
const showToast = (m, kind) => window.__toasts.push({ m, kind: kind || 'ok' })
const settings = { countryCode: 'GB', currency: 'GBP', locale: 'en-GB', pricesIncludeTax: true, taxLabel: 'VAT', dateOrder: 'dmy', timeFormat: '24h', weekStart: 'monday' }
const noop = () => {}
const truck = { id: 'test-truck-3-2', name: 'App Tester', plan: 'pro', country: 'GB', currency: 'GBP', feature_overrides: {} }
function App() {
  const view = new URLSearchParams(location.search).get('view')
  const [bundles, setBundles] = useState(() => ordered(store.bundles))
  const [cats, setCats] = useState(() => ordered(store.categories))
  // reload(): what the page's refresh does — read the rows again, in the route's order.
  const reload = useCallback(() => { setBundles(ordered(store.bundles)); setCats(ordered(store.categories)) }, [])
  return view === 'menu'
    ? <MenuTab truck={truck} categories={cats} items={[]} subcategories={[]} token="tok" modifierGroups={[]} modifierOptions={[]} itemModGroups={[]}
        setItemModGroups={noop} api={api} reload={reload} showToast={showToast} allergenWizardOpen={false} onCloseAllergenWizard={noop} onOpenAllergenWizard={noop} canEditAllergens
        onWalkthroughChoice={noop} onVerifySuccess={noop} />
    : <DealsTab categories={cats} bundles={bundles} setBundles={setBundles} api={api} reload={reload} showToast={showToast} />
}
createRoot(document.getElementById('root')).render(
  <CountrySettingsProvider settings={settings}>
    <TruckTimeContext.Provider value={LEGACY_UK_TIME_SETTINGS}>
      <div className="min-h-screen bg-slate-50 px-4 py-6 max-w-3xl mx-auto"><App /></div>
    </TruckTimeContext.Provider>
  </CountrySettingsProvider>)
`
const ID = { drink: 'd0000001-0000-4000-8000-00000000a001', dough: 'd0000001-0000-4000-8000-00000000a002', dessert: 'd0000001-0000-4000-8000-00000000a003' }
const NAME = { [ID.drink]: 'Pizza + Drink', [ID.dough]: 'Dough Balls + Drink', [ID.dessert]: 'Pizza + Dessert' }

function serve(styles, js) {
  const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${styles}</style></head><body class="bg-slate-50"><div id="root"></div><script src="/bundle.js"></script></body></html>`
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/bundle.js')) { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(js) }
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(html)
  })
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)))
}

const dealOrder = page => page.evaluate(() => [...document.querySelectorAll('[data-deal-row]')].map(r => r.getAttribute('data-deal-row')))
const catOrder = page => page.evaluate(() => [...document.querySelectorAll('div[draggable="true"]')].map(r => r.querySelector('span.font-black')?.textContent))
const handleBox = (page, sel) => page.locator(`${sel} [title="Drag to reorder"]`).first().boundingBox()

async function checkSaved(page, tag, wantIds) {
  const calls = await page.evaluate(() => window.__calls.filter(c => c.action === 'update_bundle_order'))
  const toasts = await page.evaluate(() => window.__toasts)
  t(`${tag}: saved like the categories — one update_bundle_order per formule, sort_order 1, 2, 3 in the new order; "Deal updated"`,
    calls.length === 3 && wantIds.every((id, i) => calls.some(c => c.body.id === id && c.body.sort_order === i + 1)) && toasts.some(x => x.m === 'Deal updated' && x.kind === 'ok'), { calls, toasts })
  await page.reload(); await page.waitForSelector('[data-deal-row]')
  const after = await dealOrder(page)
  t(`${tag}: after a reload the order is still ${after.map(id => NAME[id]).join(' · ')}`, JSON.stringify(after) === JSON.stringify(wantIds), after.map(id => NAME[id]))
}

;(async () => {
  const live = process.argv.indexOf('--live')
  const [styles, js] = await Promise.all([css(), bundle(ENTRY)])
  const server = await serve(styles, js)
  const base = `http://127.0.0.1:${server.address().port}`
  const pw = require(path.join(REPO, 'node_modules/playwright'))

  console.log('\n── 1 · mouse, desktop (Chromium and WebKit, 1280 px) ─────────────────────────────────────')
  for (const engine of ['chromium', 'webkit']) {
    const browser = await pw[engine].launch()
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    const errors = []; page.on('pageerror', e => errors.push(String(e)))
    await page.goto(base + '/?view=deals'); await page.evaluate(() => localStorage.clear()); await page.reload()
    await page.waitForSelector('[data-deal-row]')
    const start = await dealOrder(page)
    const handles = await page.locator('[data-deal-row] [title="Drag to reorder"]').count()
    const look = await page.evaluate(() => { const h = document.querySelector('[data-deal-row] [title="Drag to reorder"]'); const s = getComputedStyle(h); return { text: h.textContent.trim(), cursor: s.cursor, size: s.fontSize, draggableRow: h.closest('[data-deal-row]').getAttribute('draggable'), handleDraggable: h.getAttribute('draggable') } })
    t(`${engine}: the starting order is the stored one (${start.map(id => NAME[id]).join(' · ')}); a six-dot handle on each of the ${handles} formules ("${look.text}", ${look.cursor} cursor, ${look.size}), the ROW is what drags`,
      JSON.stringify(start) === JSON.stringify([ID.drink, ID.dough, ID.dessert]) && handles === 3 && look.text === '⋮⋮' && look.cursor === 'grab' && look.draggableRow === 'true' && look.handleDraggable === 'false', look)
    await page.screenshot({ path: path.join(OUT, `manage-deals-${engine}-1280-before.png`), fullPage: true })
    // the lifted row while it is dragged: the category list's dashed orange border and half opacity. Chromium: a real mouse
    // (down, move, up) — photographed mid-drag. WebKit: Playwright starts an HTML5 drag there only through dragTo.
    if (engine === 'chromium') {
      const hb = await handleBox(page, `[data-deal-row="${ID.dessert}"]`), tb = await page.locator(`[data-deal-row="${ID.drink}"]`).boundingBox()
      await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down()
      await page.mouse.move(tb.x + tb.width / 2, tb.y + 20, { steps: 12 })
      const lifted = await page.evaluate(id => { const r = document.querySelector(`[data-deal-row="${id}"]`); return { opacity: r.style.opacity, side: r.style.borderLeft } }, ID.dessert)
      await page.screenshot({ path: path.join(OUT, `manage-deals-${engine}-1280-dragging.png`), fullPage: true })
      await page.mouse.up(); await page.waitForTimeout(400)
      t(`${engine}: while dragging, the row is lifted — opacity ${lifted.opacity}, border ${lifted.side} — as the categories`, lifted.opacity === '0.5' && /dashed/.test(lifted.side), lifted)
    } else {
      await page.locator(`[data-deal-row="${ID.dessert}"] [title="Drag to reorder"]`).dragTo(page.locator(`[data-deal-row="${ID.drink}"]`))
      await page.waitForTimeout(400)
    }
    const now = await dealOrder(page)
    t(`${engine}: "Pizza + Dessert" dropped on the top row → ${now.map(id => NAME[id]).join(' · ')}`, JSON.stringify(now) === JSON.stringify([ID.dessert, ID.drink, ID.dough]), now.map(id => NAME[id]))
    await page.screenshot({ path: path.join(OUT, `manage-deals-${engine}-1280-after.png`), fullPage: true })
    await checkSaved(page, engine, [ID.dessert, ID.drink, ID.dough])
    // the CATEGORY list, on the same (moved) mechanism
    await page.goto(base + '/?view=menu'); await page.evaluate(() => localStorage.clear()); await page.reload()
    await page.waitForSelector('div[draggable="true"]')
    await page.evaluate(() => { window.__calls.length = 0; window.__toasts.length = 0 })
    const c0 = await catOrder(page)
    await page.locator('div[draggable="true"]').nth(2).locator('[title="Drag to reorder"]').dragTo(page.locator('div[draggable="true"]').nth(0))
    await page.waitForTimeout(400)
    const c1 = await catOrder(page)
    const cc = await page.evaluate(() => ({ calls: window.__calls.filter(c => c.action === 'update_category_order').map(c => c.body), toasts: window.__toasts }))
    t(`${engine}: the CATEGORY list still reorders the same way (${c0.join(' · ')} → ${c1.join(' · ')}), saving update_category_order 1, 2, 3 and "Category order updated"`,
      JSON.stringify(c1) === JSON.stringify(['Desserts', 'Pizza', 'Drinks']) && cc.calls.length === 3 && ['c-desserts', 'c-pizza', 'c-drinks'].every((id, i) => cc.calls.some(b => b.id === id && b.sort_order === i + 1)) && cc.toasts.some(x => x.m === 'Category order updated'), { c0, c1, cc })
    if (engine === 'chromium') await page.screenshot({ path: path.join(OUT, `manage-categories-chromium-1280-after.png`), fullPage: true })
    t(`${engine}: no page error`, !errors.length, errors)
    await browser.close()
  }

  console.log('\n── 2 · iPad and phone widths, touch screens (Chromium and WebKit, hasTouch) ──────────────────')
  // ⚠️ A FINGER DRAG CANNOT BE AUTOMATED ON THIS MAC: an HTML5 drag starts from a long press only in the browser's own touch handling
  // (Safari on iPad/iPhone, Chrome on Android); neither Playwright's WebKit nor desktop Chromium (even with --enable-touch-drag-drop)
  // turns emulated touch events into a drag. So this section proves what can be proved at those widths on a touch screen — the
  // handle is there and not covered, nothing scrolls sideways, and a drag (the pointer) reorders and saves — and the report says
  // the finger itself needs a real device.
  for (const engine of ['chromium', 'webkit']) {
    const browser = await pw[engine].launch()
    for (const [label, w, h] of [['ipad', 820, 1180], ['phone', 390, 844]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, deviceScaleFactor: 2 })
      const page = await ctx.newPage()
      await page.goto(base + '/?view=deals'); await page.evaluate(() => localStorage.clear()); await page.reload()
      await page.waitForSelector('[data-deal-row]')
      const lay = await page.evaluate(() => ({ wide: document.documentElement.scrollWidth > innerWidth + 1,
        handles: [...document.querySelectorAll('[data-deal-row] [title="Drag to reorder"]')].map(h => { const r = h.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { w: Math.round(r.width), h: Math.round(r.height), hit: h === top || h.contains(top) } }) }))
      t(`${engine} ${label} ${w}px: every handle is on screen and is what a finger lands on (${lay.handles.map(x => x.w + '×' + x.h).join(', ')}), nothing scrolls sideways`, !lay.wide && lay.handles.length === 3 && lay.handles.every(x => x.hit), lay)
      await page.screenshot({ path: path.join(OUT, `manage-deals-${engine}-${label}-${w}-before.png`), fullPage: true })
      await page.locator(`[data-deal-row="${ID.dough}"] [title="Drag to reorder"]`).dragTo(page.locator(`[data-deal-row="${ID.drink}"]`))
      await page.waitForTimeout(400)
      const now = await dealOrder(page)
      t(`${engine} ${label} ${w}px: "Dough Balls + Drink" dragged onto the top row → ${now.map(id => NAME[id]).join(' · ')}`, JSON.stringify(now) === JSON.stringify([ID.dough, ID.drink, ID.dessert]), now.map(id => NAME[id]))
      await page.screenshot({ path: path.join(OUT, `manage-deals-${engine}-${label}-${w}-after.png`), fullPage: true })
      await checkSaved(page, `${engine} ${label} ${w}px`, [ID.dough, ID.drink, ID.dessert])
      await ctx.close()
    }
    await browser.close()
  }
  server.close()

  if (live > 0) {
    console.log('\n── 3 · the real database on localhost (App Tester) ───────────────────────────────────────')
    const want = String(process.argv[live + 1] || '').split('|')
    const BASE = process.env.BASE || 'http://localhost:3100'
    const browser = await pw.chromium.launch()
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
    const evs = await (await fetch(`${BASE}/api/events?truck=app-tester`)).json()
    const ev = (evs.events || [])[0]
    await page.goto(`${BASE}/trucks/app-tester/order?event_id=${ev.id}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-formules] [data-formule]', { timeout: 30000 })
    const shown = await page.evaluate(() => [...document.querySelectorAll('[data-formules] [data-formule] p.font-bold')].map(p => p.textContent.trim()))
    const tab = await page.evaluate(() => [...document.querySelectorAll('[data-menu] .sticky.z-30 button')].map(b => b.textContent.trim())[0])
    t(`the order page (event ${ev.date}): the Formules tab is first ("${tab}") and lists ${shown.join(' · ')} — the database's order`, JSON.stringify(shown) === JSON.stringify(want), { shown, want })
    await page.locator('[data-formules]').scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(OUT, 'order-page-app-tester-390.png') })
    const dash = await (await fetch(`${BASE}/api/menu/app-tester?dashboard=1&event_id=${ev.id}`)).json()
    const dn = (dash.menu?.bundles || []).map(b => b.name)
    t(`the dashboard's deals (/api/menu?dashboard=1, what Add order and the deals pop-up list): ${dn.join(' · ')}`, JSON.stringify(dn) === JSON.stringify(want), { dn, want })
    await browser.close()
  }

  console.log(`\n${fail ? '🔴 ' + fail + ' FAILED, ' + pass + ' passed' : '✅ deals-order-1-live: all ' + pass + ' passed'}`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
