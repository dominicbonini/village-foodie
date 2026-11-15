#!/usr/bin/env node
// scripts/capacity-one-source-1-screens.cjs (capacity-one-source-1, 13 November 2026): the screens half. BY HAND, NOT SWEPT —
// it needs local browsers. Writes docs/capacity-one-source-1/*.png.
//   node scripts/capacity-one-source-1-screens.cjs
// ⚠️ MOUNTED, NOT OPENED (as scripts/allergen-kitchen-1-live.cjs): Manage refuses without a signed-in owner. The REAL MenuTab
// and KitchenCapacitySection are bundled and mounted over ONE in-memory store holding Pizza Kitchen's rows as they are after
// the sync (Pizza 5m / 4 on Van1 and on the category). `upsert_van_category` / `upsert_category` / `get_vans` are answered
// from that store by the REAL server functions' pure parts (`resolveForFirstVan`), so an edit made on one screen is what the
// other screen loads. Nothing is written to any database.
//   §1 Pizza Kitchen: Items and Kitchen capacity show the same numbers (390 and 1280).
//   §2 Items › batch 6 → Kitchen capacity shows 6 (and the write is upsert_van_category for Van1); Kitchen capacity › prep
//      10m → the Items chips show 10m.
//   §3 a two-van truck whose vans differ: the Items card's one line, en-GB and fr-FR.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
require('./_disk-guard.cjs').guard(__filename) // disk-cleanup-1: refuses below 40 GB free, stops below 20 GB (docs/reference-manual.md, "Disk space")
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http')
const REPO = path.resolve(__dirname, '..')
const OUT = path.join(REPO, 'docs/capacity-one-source-1')
fs.mkdirSync(OUT, { recursive: true })
let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 700)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const MSG = l => JSON.parse(fs.readFileSync(path.join(REPO, `messages/${l}.json`), 'utf8'))
const W = { 'en-GB': MSG('en-GB'), 'fr-FR': MSG('fr-FR') }
const L = (lang, k) => k.split('.').reduce((a, b) => a?.[b], W[lang])

async function css() {
  const postcss = require(require.resolve('postcss', { paths: [REPO] }))
  const tw = require(require.resolve('@tailwindcss/postcss', { paths: [REPO] }))
  const src = fs.readFileSync(path.join(REPO, 'app/(app)/globals.css'), 'utf8').replace(/@import "leaflet[^"]*";\n?/, '')
  return (await postcss([tw({ base: REPO })]).process(src, { from: path.join(REPO, 'app/(app)/globals.css') })).css
}
const STUBS = {
  'next/navigation': "export const useRouter = () => ({ push(){}, replace(){}, refresh(){}, back(){}, prefetch(){} }); export const usePathname = () => '/manage'; export const useSearchParams = () => new URLSearchParams(); export const useParams = () => ({})",
  'next/link': "import React from 'react'; export default function Link(p) { const { href, children, prefetch, replace, scroll, ...rest } = p; return React.createElement('a', { href: typeof href === 'string' ? href : '#', ...rest }, children) }",
  'next/image': "import React from 'react'; export default function Image(p) { const { src, alt, fill, priority, quality, placeholder, blurDataURL, unoptimized, loader, ...rest } = p; return React.createElement('img', { src: typeof src === 'string' ? src : '', alt, ...rest }) }",
}
async function bundle(entrySrc) {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-cap1-'))
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
      b.onLoad({ filter: /app\/\(app\)\/manage\/\[token\]\/page\.tsx$/ }, a => (a.path === MANAGE
        ? { contents: fs.readFileSync(MANAGE, 'utf8') + '\nexport { MenuTab }\n', loader: 'tsx', resolveDir: path.dirname(MANAGE) } : undefined))
    } }],
  })
  return fs.readFileSync(path.join(dir, 'bundle.js'), 'utf8')
}

// Pizza Kitchen (test-truck) after the sync: menu_categories and Van1's row agree, Pizza 5m / 4. Item names as stored.
const PK = {
  categories: [
    { id: '0662c2a3-73c6-4101-a132-a6a06d301de7', name: 'Pizza', prep_secs: 300, batch_size: 4, counts_toward_capacity: true },
    { id: '474f31d6-7fba-4373-a0e3-e78111e77675', name: 'Desserts', prep_secs: 0, batch_size: 0, counts_toward_capacity: false },
    { id: 'cb2845fd-4ee2-4b2a-98ee-1fc87202a2b5', name: 'Drinks', prep_secs: 0, batch_size: 0, counts_toward_capacity: false },
  ],
  vans: [{ id: '8e38901e-113f-42fc-ac60-11cf1360212b', name: 'Van1', created_at: '2026-05-25T14:37:59Z', active: true, kitchen_capacity: null, capacity_window_mins: 10, capacity_same_as_first_van: false }],
  rows: [{ van_id: '8e38901e-113f-42fc-ac60-11cf1360212b', category_id: '0662c2a3-73c6-4101-a132-a6a06d301de7', prep_secs: 300, batch_size: 4, counts_toward_capacity: true }],
  items: ['Focaccia Pizza', 'Marinara', 'Margherita', 'Pepperoni', 'Ham & Shroom', 'Genovese'],
}
// A two-van truck whose Van 2 runs Pizza at 10m / 6 (fixture: the shape §3 is about; no real truck has it today).
const TWO = {
  ...PK,
  vans: [...PK.vans, { id: 'van-2', name: 'Van2', created_at: '2026-07-30T13:43:41Z', active: true, kitchen_capacity: null, capacity_window_mins: 10, capacity_same_as_first_van: false }],
  rows: [...PK.rows, { van_id: 'van-2', category_id: '0662c2a3-73c6-4101-a132-a6a06d301de7', prep_secs: 600, batch_size: 6, counts_toward_capacity: true }],
}

const ENTRY = `import { createRoot } from 'react-dom/client'
import { useState, useCallback } from 'react'
import { MenuTab } from '@/app/(app)/manage/[token]/page'
import { KitchenCapacitySection } from '@/components/manage/KitchenCapacitySection'
import { resolveForFirstVan } from '@/lib/category-capacity-write'
import { CountrySettingsProvider } from '@/components/CountrySettingsProvider'
import { TruckTimeContext } from '@/components/TruckTimeContext'
import { I18nContext } from '@/lib/i18n/use-t'
import { ensureLanguage } from '@/lib/i18n/registry'
import { LEGACY_UK_TIME_SETTINGS } from '@/lib/time-utils'
const q = new URLSearchParams(location.search)
const lang = q.get('lang') || 'en-GB'
const FIX = q.get('fx') === 'two' ? ${JSON.stringify(TWO)} : ${JSON.stringify(PK)}
// THE STORE: the three tables, as the server holds them.
const store = window.__store = {
  cats: FIX.categories.map((c, i) => ({ ...c, slug: c.name.toLowerCase(), sort_order: i + 1, allow_notes: false, default_stock: null, is_active: true })),
  vans: FIX.vans, rows: FIX.rows.map(r => ({ ...r })),
}
const byVan = () => new Map(store.vans.map(v => [v.id, store.rows.filter(r => r.van_id === v.id)]))
const view = () => resolveForFirstVan(store.cats, store.vans, byVan())
window.__calls = []
// The server's writer, over the store: upsert the van row seeded from what the van resolves, and mirror when it is the first van.
const writeVan = (vanId, categoryId, patch) => {
  const cat = store.cats.find(c => c.id === categoryId)
  const own = store.rows.find(r => r.van_id === vanId && r.category_id === categoryId)
  const base = own ?? { prep_secs: cat.prep_secs, batch_size: cat.batch_size, counts_toward_capacity: !!cat.counts_toward_capacity }
  const next = { prep_secs: patch.prep_secs ?? base.prep_secs, batch_size: patch.batch_size ?? base.batch_size, counts_toward_capacity: patch.counts_toward_capacity ?? base.counts_toward_capacity }
  if (own) Object.assign(own, next); else store.rows.push({ van_id: vanId, category_id: categoryId, ...next })
  const first = view().firstVanId
  if (vanId === first) Object.assign(cat, next)
  return { ok: true, fannedTo: [], mirrored: vanId === first }
}
const api = async (action, body = {}) => {
  window.__calls.push({ action, body })
  if (action === 'get_vans') return { vans: store.vans.map(v => ({ ...v, categorySettings: store.rows.filter(r => r.van_id === v.id) })), firstVanId: view().firstVanId, perVanCategoriesAvailable: true }
  if (action === 'upsert_van_category') return writeVan(body.vanId, body.categoryId, body)
  if (action === 'upsert_category') return { category: store.cats.find(c => c.id === body.id) }
  if (action === 'get_upsell_rules') return { rules: [] }
  return { ok: true }
}
const truck = { id: 'test-truck', name: 'Pizza Kitchen', slug: 'pizza-kitchen', plan: 'pro', country: lang === 'fr-FR' ? 'FR' : 'GB', currency: lang === 'fr-FR' ? 'EUR' : 'GBP', feature_overrides: {},
  allergen_display_mode: 'per_dish', allergen_info_text: null, allergen_info_url: null, allergen_kitchen_extra: [], preorders_enabled: true, time: LEGACY_UK_TIME_SETTINGS }
const items = FIX.items.map((name, i) => ({ id: 'it-' + i, name, description: null, price: 10, category_id: FIX.categories[0].id, allergens: [], dietary_info: [], allergens_verified: true, sort_order: i, is_available: true, spiciness: null, subcategory_id: null, stock_count: null, default_stock: null, image_path: null, auto_accept: true }))
const showToast = () => {}
const noop = () => {}
const settings = { countryCode: lang === 'fr-FR' ? 'FR' : 'GB', currency: lang === 'fr-FR' ? 'EUR' : 'GBP', locale: lang, pricesIncludeTax: true, taxLabel: 'VAT', dateOrder: 'dmy', timeFormat: '24h', weekStart: 'monday', allergenSet: 'uk14', allergenCardOnlyAllowed: true }
function Shell() {
  const [section, setSection] = useState(q.get('view') || 'items')
  const [snap, setSnap] = useState(() => view())
  const reload = useCallback(() => setSnap(view()), [])
  window.__go = s => { reload(); setSection(s) }
  const capView = { firstVanId: snap.firstVanId, vanCount: snap.vanCount, vansDiffer: snap.vansDiffer }
  return section === 'items'
    ? <MenuTab truck={truck} categories={snap.categories} capacityView={capView} onCategoriesPatch={reload} items={items} subcategories={[]} token="harness" modifierGroups={[]} modifierOptions={[]} itemModGroups={[]}
        setItemModGroups={noop} api={api} reload={reload} showToast={showToast} allergenWizardOpen={false} onCloseAllergenWizard={noop} onOpenAllergenWizard={noop} canEditAllergens
        onWalkthroughChoice={noop} onVerifySuccess={noop} canSeeCosts />
    : <KitchenCapacitySection categories={snap.categories} api={api} showToast={showToast} onFirstVanCategoryChange={reload} />
}
;(async () => {
  if (lang !== 'en-GB') await ensureLanguage(lang)
  document.documentElement.lang = lang.slice(0, 2)
  createRoot(document.getElementById('root')).render(
    <I18nContext.Provider value={{ locale: lang, setLocale() {} }}>
      <CountrySettingsProvider settings={settings}>
        <TruckTimeContext.Provider value={LEGACY_UK_TIME_SETTINGS}>
          <div className="min-h-screen bg-slate-50 px-4 py-6 max-w-3xl mx-auto"><Shell /></div>
        </TruckTimeContext.Provider>
      </CountrySettingsProvider>
    </I18nContext.Provider>)
})()
`

function serve(styles, js) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${styles}</style></head><body class="bg-slate-50"><div id="root"></div><script src="/bundle.js"></script></body></html>`
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/bundle.js')) { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(js) }
    if (req.url.startsWith('/api/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{}') }
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(html)
  })
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)))
}

;(async () => {
  const pw = require(path.join(REPO, 'node_modules/playwright'))
  const [styles, js] = await Promise.all([css(), bundle(ENTRY)])
  const server = await serve(styles, js)
  const base = `http://127.0.0.1:${server.address().port}`
  const browser = await pw.chromium.launch()
  const open = async (query, { w = 390, h = 844, lang = 'en-GB' } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    const errors = []; page.on('pageerror', e => errors.push(String(e).slice(0, 200))); page.on('dialog', d => d.dismiss())
    await page.goto(`${base}/?lang=${lang}&${query}`)
    await page.waitForSelector('#root > *', { timeout: 20000 }); await page.waitForTimeout(500)
    return { page, ctx, errors }
  }
  const shot = (page, name, full = false) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full })
  /** The Items card header's chips for a category. */
  const chips = async (page, name) => (await page.locator('div.flex.items-center.gap-2.flex-wrap', { has: page.getByText(name, { exact: true }) }).first().locator('span.rounded-full').allTextContents()).map(s => s.trim())
  /** Kitchen capacity's two selects for a category row: [items, prep] values. */
  const kcRow = async (page, name) => page.locator(`select[aria-label*="${name}"]`).evaluateAll(els => els.map(e => ({ label: e.getAttribute('aria-label'), value: e.value })))
  const expand = async (page, name) => { await page.getByText(name, { exact: true }).first().click(); await page.waitForTimeout(400) }
  const fieldSelect = (page, label) => page.locator('label', { hasText: label }).first().locator('xpath=..').locator('select').first()

  head('§1 · Pizza Kitchen: Items and Kitchen capacity show the same numbers')
  for (const w of [390, 1280]) {
    const h = w === 1280 ? 900 : 844
    const a = await open('view=items', { w, h }); await expand(a.page, 'Pizza')
    const ch = await chips(a.page, 'Pizza')
    const prepV = await fieldSelect(a.page, L('en-GB', 'manageMenu.category.prepTime')).inputValue()
    const batchV = await fieldSelect(a.page, L('en-GB', 'manageMenu.category.batchSize')).inputValue()
    t(`${w}px Items: Pizza chips ${JSON.stringify(ch)}; fields prep ${prepV}s, batch ${batchV}`, ch.some(s => /\b5\s?m/.test(s)) && ch.some(s => /\b4\b/.test(s)) && prepV === '300' && batchV === '4', { ch, prepV, batchV })
    t(`${w}px Items: no "other vans" line on a one-van truck`, await a.page.locator('[data-other-vans-line]').count() === 0)
    await shot(a.page, `01-items-pizza-kitchen-${w}`); t(`${w}px Items: no page error`, !a.errors.length, a.errors); await a.ctx.close()
    const b = await open('view=capacity', { w, h })
    const row = await kcRow(b.page, 'Pizza')
    t(`${w}px Kitchen capacity: Pizza ${JSON.stringify(row.map(r => r.value))}`, row.length === 2 && row.map(r => r.value).sort().join(',') === '300,4', row)
    await shot(b.page, `02-kitchen-capacity-pizza-kitchen-${w}`); t(`${w}px Kitchen capacity: no page error`, !b.errors.length, b.errors); await b.ctx.close()
  }

  head('§2 · an edit on one screen is what the other shows')
  {
    const { page, ctx, errors } = await open('view=items', { w: 390 })
    await expand(page, 'Pizza')
    await fieldSelect(page, L('en-GB', 'manageMenu.category.batchSize')).selectOption('6'); await page.waitForTimeout(500)
    const calls = await page.evaluate(() => window.__calls.filter(c => c.action === 'upsert_van_category' || c.action === 'upsert_category'))
    t('Items › batch 6 writes upsert_van_category for Van1 (no upsert_category carrying prep / batch)', calls.length === 1 && calls[0].action === 'upsert_van_category' && calls[0].body.vanId === PK.vans[0].id && calls[0].body.batch_size === 6 && calls[0].body.prep_secs === undefined, calls)
    t('…the Items chips show "6"', (await chips(page, 'Pizza')).some(s => /\b6\b/.test(s)))
    await page.evaluate(() => window.__go('capacity')); await page.waitForTimeout(600)
    const row = await kcRow(page, 'Pizza')
    t(`…and Kitchen capacity shows Pizza ${JSON.stringify(row.map(r => r.value))}`, row.map(r => r.value).sort().join(',') === '300,6', row)
    await shot(page, '03-after-items-edit-kitchen-capacity-390')
    // Kitchen capacity › prep 10m
    const prepSel = page.locator('select[aria-label*="Pizza"]').filter({ has: page.locator('option[value="600"]') }).first()
    await prepSel.selectOption('600'); await page.waitForTimeout(500)
    await page.evaluate(() => window.__go('items')); await page.waitForTimeout(600)
    await expand(page, 'Pizza')
    const ch = await chips(page, 'Pizza')
    t(`Kitchen capacity › prep 10m → the Items chips ${JSON.stringify(ch)}`, ch.some(s => /\b10\s?m/.test(s)) && ch.some(s => /\b6\b/.test(s)), ch)
    await shot(page, '04-after-capacity-edit-items-390')
    t('no page error', !errors.length, errors); await ctx.close()
  }

  head('§3 · two vans that differ: the Items card says so in one line')
  for (const lang of ['en-GB', 'fr-FR']) {
    const { page, ctx, errors } = await open('view=items&fx=two', { w: 390, lang })
    const line = await page.locator('[data-other-vans-line]').allTextContents()
    t(`${lang}: "${line[0]}"`, line.length === 1 && line[0] === L(lang, 'manageMenu.category.otherVans'), line)
    const ch = await chips(page, 'Pizza')
    t(`${lang}: the chips are Van 1's (5m / 4), not Van 2's`, ch.some(s => /\b5\s?m/.test(s)) && ch.some(s => /\b4\b/.test(s)), ch)
    await shot(page, `05-two-vans-differ-items-${lang}-390`)
    t(`${lang}: no page error`, !errors.length, errors); await ctx.close()
  }

  await browser.close(); server.close()
  console.log(`\n${fail ? '🔴' : '✅'} capacity-one-source-1 screens: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.log('🔴 threw: ' + (e.stack || e)); process.exit(1) })
