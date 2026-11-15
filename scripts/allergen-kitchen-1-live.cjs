// scripts/allergen-kitchen-1-live.cjs — allergen-kitchen-1 (13 November 2026, docs/allergen-kitchen-1-report.md): the BROWSER half
// of the proof (the swept half is scripts/allergen-kitchen-1.cjs). BY HAND, NOT SWEPT — it needs local browsers, and §C needs
// `next start` on :3100. Writes docs/allergen-kitchen-1/*.png.
//   node scripts/allergen-kitchen-1-live.cjs            §A–§B (Manage, mounted — no server, no database)
//   npx next start -p 3100 &   then   node scripts/allergen-kitchen-1-live.cjs --live      …and §C (the customer order page)
//
// ⚠️ MANAGE IS MOUNTED, NOT OPENED (as scripts/costs-accounts-1-screens.cjs / allergen-screens-1): Manage refuses without a signed-in
// owner and there is no session for App Tester's. The REAL MenuTab and AllergenWizardModal are bundled and mounted; every api() call
// goes to an in-memory stand-in that records it, and the import's three server calls (process-menu, process-allergens, commit-menu)
// are answered by example responses whose BODIES are recorded — so "what would be written" is checked without writing anything.
// Fixtures: App Tester's dishes as stored, plus two staged ones for the 10+ warning ("Kitchen Sink" with 10 of the UK 14, "Nine
// Lives" with 9) and one extra ("Truffle mayo": Eggs).
//   §A the 10+ warning — list, table, item editor: at 10 and not at 9; it never blocks Confirm or saving.
//   §B the last page — locked (dishes/extras) vs added chips, "Customers will see:", Done disabled until the confirmation is ticked,
//      what Done saves; the card page's info line (translated) with no checkbox; the import end to end (a card's blanket and the
//      menu's "may contain" reach the kitchen list and NEVER a dish); the fixed footers at 390 px; the Menu tab's "Kitchen also
//      handles: … · Edit" line opening the last page.
//   §C the customer (localhost, App Tester): the pop-up's kitchen list = /api/menu kitchen_allergens, translated, with the new note
//      and severe line; card mode unchanged but for the severe line; an extra's allergens in the dish pop-up only when it has some
//      and only per dish (the extra is added to the BROWSER's copy of the menu — App Tester has no extras; nothing is written).
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
require('./_disk-guard.cjs').guard(__filename) // disk-cleanup-1: refuses below 40 GB free, stops below 20 GB (docs/reference-manual.md, "Disk space")
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http')
const REPO = path.resolve(__dirname, '..')
const OUT = path.join(REPO, 'docs/allergen-kitchen-1')
fs.mkdirSync(OUT, { recursive: true })
let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 700)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const MSG = l => JSON.parse(fs.readFileSync(path.join(REPO, `messages/${l}.json`), 'utf8'))
const W = { 'en-GB': MSG('en-GB'), 'fr-FR': MSG('fr-FR') }
const L = (lang, k) => k.split('.').reduce((a, b) => a?.[b], W[lang])
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k]))

async function css() {
  const postcss = require(require.resolve('postcss', { paths: [REPO] }))
  const tw = require(require.resolve('@tailwindcss/postcss', { paths: [REPO] }))
  const src = fs.readFileSync(path.join(REPO, 'app/(app)/globals.css'), 'utf8').replace(/@import "leaflet[^"]*";\n?/, '')
  return (await postcss([tw({ base: REPO })]).process(src, { from: path.join(REPO, 'app/(app)/globals.css') })).css
}
const STUBS = {
  'next/navigation': "export const useRouter = () => ({ push(){}, replace(){}, refresh(){}, back(){}, prefetch(){} }); export const usePathname = () => '/manage'; export const useSearchParams = () => new URLSearchParams(''); export const useParams = () => ({ token: 'harness' }); export const notFound = () => {}; export const redirect = () => {}",
  'next/link': "import React from 'react'; export default function Link(p) { const { href, children, prefetch, replace, scroll, ...rest } = p; return React.createElement('a', { href: typeof href === 'string' ? href : '#', ...rest }, children) }",
  'next/image': "import React from 'react'; export default function Image(p) { const { src, alt, fill, priority, quality, placeholder, blurDataURL, unoptimized, loader, ...rest } = p; return React.createElement('img', { src: typeof src === 'string' ? src : '', alt, ...rest }) }",
}
async function bundle(entrySrc) {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-ak1-'))
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
        ? { contents: fs.readFileSync(MANAGE, 'utf8') + '\nexport { MenuTab, AllergenWizardModal }\n', loader: 'tsx', resolveDir: path.dirname(MANAGE) } : undefined))
    } }],
  })
  return fs.readFileSync(path.join(dir, 'bundle.js'), 'utf8')
}

// App Tester's categories and dishes as stored (allergens, dietary, confirmed), plus the two staged 10+/9 dishes and one extra.
const C = { Specials: 'a52d18d4', Pizza: '68b4ff77', Drinks: '745a08f9', Desserts: '4cd10cad' }
const GDL = ['Gluten', 'Dairy', 'Lactose']
const FIX = {
  categories: Object.entries(C).map(([name, id], i) => ({ id, name, slug: name.toLowerCase(), sort_order: i + 1 })),
  items: [
    ['Honey Goat', 'Specials', GDL, ['Vegetarian']], ['Margherita', 'Pizza', GDL, ['Vegetarian']], ['Genovese', 'Pizza', ['Gluten', 'Dairy', 'Tree nuts', 'Lactose'], ['Vegetarian']],
    ['Tonno Delight', 'Pizza', ['Gluten', 'Dairy', 'Fish', 'Lactose'], []], ['Kitchen Sink', 'Pizza', ['Gluten', 'Crustaceans', 'Eggs', 'Fish', 'Peanuts', 'Soy', 'Dairy', 'Tree nuts', 'Celery', 'Mustard'], []],
    ['Nine Lives', 'Pizza', ['Gluten', 'Crustaceans', 'Eggs', 'Fish', 'Peanuts', 'Soy', 'Dairy', 'Tree nuts', 'Celery'], []],
    ['Coca-cola', 'Drinks', [], []], ['Tiramisu', 'Desserts', [], []],
  ].map(([name, cat, allergens, dietary], i) => ({ id: `it-${i}`, name, description: null, price: 10, category_id: C[cat], allergens, dietary_info: dietary, allergens_verified: true, sort_order: i, is_available: true, spiciness: null })),
  options: [{ id: 'op-1', group_id: 'g-1', name: 'Truffle mayo', price_adjustment: 1, type: 'add', sort_order: 1, allergens: ['Eggs'], dietary_info: [], available: true }],
  extraction: { categories: ['Pizza', 'Drinks'], existing_categories: [], may_contain: ['Mustard'], items: [
    { name: 'Margherita', price: 10, category: 'Pizza', description: '', allergens: ['Gluten', 'Dairy'], dietary: ['Vegetarian'], spiciness: null },
    { name: 'Diavola', price: 12, category: 'Pizza', description: '', allergens: ['Gluten', 'Dairy'], dietary: [], spiciness: 2 },
    { name: 'Coca-cola', price: 1.5, category: 'Drinks', description: '', allergens: [], dietary: [], spiciness: null }] },
  card: { summary: '', contains: ['Gluten', 'Dairy'], may_contain: ['Tree nuts'], free_from: [], dietary_options: [], additional_notes: '', formatted_text: 'Contains: Gluten, Milk. May contain: Tree nuts, Sesame.',
    entries: [{ name: 'Margherita', allergens: ['Gluten', 'Dairy'], confidence: 'high' }], blanket: ['Sesame'], cross_contamination: [] },
}

const ENTRY = `import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { MenuTab, AllergenWizardModal } from '@/app/(app)/manage/[token]/page'
import { CountrySettingsProvider } from '@/components/CountrySettingsProvider'
import { TruckTimeContext } from '@/components/TruckTimeContext'
import { I18nContext } from '@/lib/i18n/use-t'
import { ensureLanguage } from '@/lib/i18n/registry'
import { LEGACY_UK_TIME_SETTINGS } from '@/lib/time-utils'
const FIX = ${JSON.stringify(FIX)}
const q = new URLSearchParams(location.search)
const view = q.get('view'), lang = q.get('lang') || 'en-GB'
const extra = (q.get('extra') || '').split(',').filter(Boolean)
window.__calls = []; window.__toasts = []
const cats = FIX.categories.map(c => ({ ...c, prep_secs: 0, batch_size: 0, allow_notes: false, default_stock: null, is_active: true }))
const unconfirmed = (q.get('unconfirmed') || '').split(',').filter(Boolean)
const items = FIX.items.map(i => ({ ...i, subcategory_id: null, stock_count: null, default_stock: null, image_path: null, auto_accept: true, allergens_verified: !unconfirmed.includes(i.name) }))
const truck = { id: 'test-truck-3-2', name: 'App Tester', slug: 'app-tester', plan: 'pro', country: lang === 'fr-FR' ? 'FR' : 'GB', currency: lang === 'fr-FR' ? 'EUR' : 'GBP', feature_overrides: {},
  allergen_display_mode: q.get('mode') || 'per_dish', allergen_info_text: null, allergen_info_url: null, allergen_kitchen_extra: extra, preorders_enabled: true, time: LEGACY_UK_TIME_SETTINGS }
const api = async (action, body) => { window.__calls.push({ action, body }); if (action === 'get_vans') return { vans: [] }; if (action === 'get_upsell_rules') return { rules: [] }; return { ok: true, success: true, item: body } }
const showToast = (m, kind) => window.__toasts.push({ m, kind: kind || 'ok' })
const noop = () => {}
const settings = { countryCode: lang === 'fr-FR' ? 'FR' : 'GB', currency: lang === 'fr-FR' ? 'EUR' : 'GBP', locale: lang, pricesIncludeTax: true, taxLabel: 'VAT', dateOrder: 'dmy', timeFormat: '24h', weekStart: 'monday', allergenSet: 'uk14', allergenCardOnlyAllowed: true }
function Wizard() {
  const [its, setIts] = useState(items)
  const w = (it, a, d, v) => setIts(list => list.map(x => x.id === it.id ? { ...x, allergens: a, dietary_info: d, allergens_verified: v } : x))
  return <AllergenWizardModal items={its} categories={cats} canEdit={q.get('staff') !== '1'} onClose={() => { window.__closed = true }}
    onConfirmRow={async (it, a, d) => { await api('upsert_item', { id: it.id, allergens: a, allergens_verified: true }); w(it, a, d, true) }}
    onUndoRow={async (it, a, d, v) => w(it, a, d, v)} onEditUnverify={async it => w(it, it.allergens, it.dietary_info, false)}
    showToast={showToast} cardText="" cardUrl="" cardProcessing={false} onAddCard={noop} onSetDisplayMode={async m => { await api('update_settings', { allergen_display_mode: m }) }}
    initialMode={Number(q.get('wmode') || 0)} initialReviewView={q.get('rv') || 'list'}
    onProcessCard={async () => FIX.card} onCardMerge={async (it, union) => w(it, union, it.dietary_info, false)}
    kitchenOptions={FIX.options} kitchenExtra={extra} onSaveKitchen={async e => { await api('update_settings', { allergen_kitchen_extra: e, allergens_confirmed_at: true }) }} />
}
function Menu() {
  const [open, setOpen] = useState(false)
  return <MenuTab truck={truck} categories={cats} items={items} subcategories={[]} token="harness" modifierGroups={[]} modifierOptions={FIX.options} itemModGroups={[]}
    setItemModGroups={noop} api={api} reload={noop} showToast={showToast} allergenWizardOpen={open} onCloseAllergenWizard={() => setOpen(false)} onOpenAllergenWizard={() => setOpen(true)} canEditAllergens={q.get('staff') !== '1'}
    onWalkthroughChoice={noop} onVerifySuccess={noop} canSeeCosts />
}
;(async () => {
  if (lang !== 'en-GB') await ensureLanguage(lang)
  document.documentElement.lang = lang.slice(0, 2)
  createRoot(document.getElementById('root')).render(
    <I18nContext.Provider value={{ locale: lang, setLocale() {} }}>
      <CountrySettingsProvider settings={settings}>
        <TruckTimeContext.Provider value={LEGACY_UK_TIME_SETTINGS}>
          <div className="min-h-screen bg-slate-50 px-4 py-6 max-w-3xl mx-auto">{view === 'wizard' ? <Wizard /> : <Menu />}</div>
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
  const live = process.argv.includes('--live')
  const pw = require(path.join(REPO, 'node_modules/playwright'))
  const [styles, js] = await Promise.all([css(), bundle(ENTRY)])
  const server = await serve(styles, js)
  const base = `http://127.0.0.1:${server.address().port}`
  const browser = await pw.chromium.launch()
  const open = async (query, { w = 390, h = 844, lang = 'en-GB' } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    const errors = []; page.on('pageerror', e => errors.push(String(e).slice(0, 200))); page.on('dialog', d => d.dismiss())
    const bodies = {}
    for (const [route, json] of [['process-menu', FIX.extraction], ['process-allergens', { ok: true, allergens: FIX.card }], ['commit-menu', { ok: true, skipped: 0 }]])
      await page.route(`**/api/manage/${route}`, r => { bodies[route] = r.request().postData(); return r.fulfill({ json }) })
    await page.goto(`${base}/?lang=${lang}&${query}`)
    await page.waitForSelector('#root > *', { timeout: 20000 }); await page.waitForTimeout(400)
    return { page, ctx, errors, bodies }
  }
  const shot = (page, name, full = false) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full })
  const click = async (page, name, exact = false) => { await page.getByRole('button', { name, exact }).first().click(); await page.waitForTimeout(350) }

  head('A · the 10+ warning (list, table, item editor)')
  for (const lang of ['en-GB', 'fr-FR']) {
    const warn10 = fill(L(lang, 'manageAllergens.wizard.tooMany'), { count: 10 })
    // LIST
    {
      const { page, ctx, errors } = await open('view=wizard&wmode=1&rv=list&unconfirmed=Kitchen Sink,Nine Lives', { lang })
      const card = n => page.locator('div.border.rounded-xl.p-3', { has: page.getByText(n, { exact: true }) }).first()
      const w10 = await card('Kitchen Sink').locator('[data-too-many]').allTextContents()
      const w9 = await card('Nine Lives').locator('[data-too-many]').count()
      t(`${lang} list: "Kitchen Sink" (10 ticked) shows the warning — "${w10[0]?.slice(0, 60)}…" — and "Nine Lives" (9) does not`, w10.length === 1 && w10[0] === warn10 && w9 === 0, { w10, w9 })
      const helper = await card('Kitchen Sink').getByText(L(lang, 'manageAllergens.wizard.recipeOnly'), { exact: true }).count()
      t(`${lang} list: the helper line "${L(lang, 'manageAllergens.wizard.recipeOnly')}" under "Allergens"`, helper === 1)
      await card('Kitchen Sink').scrollIntoViewIfNeeded(); await shot(page, `01-review-list-10plus-${lang}-390`)
      // it never blocks: Confirm is enabled and confirms
      const btn = card('Kitchen Sink').getByRole('button', { name: L(lang, 'manageAllergens.wizard.confirm.confirm'), exact: true })
      t(`${lang} list: Confirm is NOT blocked by the warning`, await btn.isEnabled())
      await btn.click(); await page.waitForTimeout(300)
      const calls = await page.evaluate(() => window.__calls.filter(c => c.action === 'upsert_item'))
      t(`${lang} list: …and confirms (upsert_item, allergens_verified true, the 10 allergens kept)`, calls.length === 1 && calls[0].body.allergens_verified === true && calls[0].body.allergens.length === 10, calls)
      // 9 → 10 on "Nine Lives" makes it appear
      await card('Nine Lives').getByRole('button', { name: lang === 'fr-FR' ? 'Moutarde' : 'Mustard', exact: true }).click(); await page.waitForTimeout(200)
      t(`${lang} list: ticking a 10th on "Nine Lives" brings the warning up`, await card('Nine Lives').locator('[data-too-many]').count() === 1)
      t(`${lang} list: no page error`, !errors.length, errors); await ctx.close()
    }
    // TABLE
    for (const w of [1280, 390]) {
      const { page, ctx } = await open('view=wizard&wmode=1&rv=table&unconfirmed=Kitchen Sink,Nine Lives', { lang, w, h: w === 1280 ? 900 : 844 })
      const row = n => page.locator('tr', { has: page.getByText(n, { exact: true }) }).first()
      const inDish10 = await row('Kitchen Sink').locator('td').first().locator('[data-too-many]').allTextContents()
      const inDish9 = await row('Nine Lives').locator('[data-too-many]').count()
      t(`${lang} table ${w}px: the warning sits under "Kitchen Sink" in the Dish column, not under "Nine Lives"`, inDish10.length === 1 && inDish10[0] === warn10 && inDish9 === 0, { inDish10, inDish9 })
      t(`${lang} table ${w}px: the helper line under the ALLERGENS column group`, await page.locator('thead th', { hasText: L(lang, 'manageAllergens.wizard.recipeOnly') }).count() === 1)
      t(`${lang} table ${w}px: Confirm on that row is enabled`, await row('Kitchen Sink').getByRole('button', { name: L(lang, 'manageAllergens.wizard.confirm.confirm'), exact: true }).isEnabled())
      await row('Kitchen Sink').scrollIntoViewIfNeeded(); await shot(page, `02-review-table-10plus-${lang}-${w}`)
      await ctx.close()
    }
    // ITEM EDITOR
    {
      const { page, ctx } = await open('view=menu', { lang, h: 1300 })
      await page.getByText('Pizza', { exact: true }).first().click(); await page.waitForTimeout(300)
      const edit = async n => { const r = page.locator('div', { has: page.getByText(n, { exact: true }) }).filter({ has: page.locator('button') }).last(); await r.locator('button', { hasText: '✏️' }).first().click(); await page.waitForTimeout(400) }
      await edit('Nine Lives')
      const nine = await page.locator('[data-too-many]').count()
      await page.getByRole('button', { name: lang === 'fr-FR' ? 'Moutarde' : 'Mustard', exact: true }).click(); await page.waitForTimeout(300)
      const ten = await page.locator('[data-too-many]').allTextContents()
      const save = await page.evaluate(() => window.__calls.filter(c => c.action === 'upsert_item').at(-1))
      t(`${lang} item editor: no warning at 9; at 10 "${ten[0]?.slice(0, 50)}…"`, nine === 0 && ten.length === 1 && ten[0] === fill(L(lang, 'manageMenu.item.tooMany'), { count: 10 }), { nine, ten })
      t(`${lang} item editor: saving is unchanged — the tap saved at once with allergens_verified true (10 allergens)`, save && save.body.allergens_verified === true && save.body.allergens.length === 10, save)
      t(`${lang} item editor: the helper line under "Allergens"`, await page.getByText(L(lang, 'manageMenu.item.recipeOnly'), { exact: true }).count() === 1)
      await page.locator('[data-too-many]').scrollIntoViewIfNeeded(); await page.evaluate(() => scrollBy(0, 120)); await shot(page, `03-item-editor-10plus-${lang}-390`)
      await ctx.close()
    }
  }

  head('B · the last page, the card page, the import, the footers, the Menu tab line')
  for (const lang of ['en-GB', 'fr-FR']) for (const w of [390, 1280]) {
    // standalone: Done (all confirmed) → the kitchen page
    const { page, ctx } = await open('view=wizard&wmode=1&rv=list&extra=Sesame', { lang, w })
    await click(page, L(lang, 'manageAllergens.wizard.nav.done'), true)
    const k = await page.evaluate(() => ({
      dish: [...document.querySelectorAll('[data-kitchen-chip="dish"]')].map(b => b.textContent.trim()), added: [...document.querySelectorAll('[data-kitchen-chip="added"]')].map(b => b.textContent.trim()),
      off: document.querySelectorAll('[data-kitchen-chip="off"]').length, preview: document.querySelector('[data-kitchen-preview]')?.innerText ?? '', agreed: document.querySelector('[data-kitchen-confirm]')?.checked }))
    const done = () => page.getByRole('button', { name: L(lang, 'manageAllergens.wizard.nav.done'), exact: true })
    if (w === 390) {
      t(`${lang}: "Done" on the review opens the last page (not close); ${k.dish.length} locked (the confirmed dishes' 10 — the extra's Eggs among them), ${k.added.length} added (Sesame), ${k.off} others`,
        k.dish.length === 10 && k.added.length === 1 && k.off === 3 && /Sesame ✓|Sésame ✓/.test(k.added[0]) && k.agreed === false, k)
      t(`${lang}: "Customers will see:" quotes the pop-up — heading, the 11 names, the note`, k.preview.includes(L(lang, 'manageAllergens.kitchen.customersSee')) && k.preview.includes(L(lang, 'order.kitchenHeading')) && k.preview.includes(L(lang, 'order.kitchenNote')), k.preview)
      t(`${lang}: Done is disabled until the confirmation is ticked`, !(await done().isEnabled()))
    }
    await shot(page, `04-kitchen-page-${lang}-${w}`)
    await page.locator('[data-kitchen-confirm]').scrollIntoViewIfNeeded(); await shot(page, `04-kitchen-page-bottom-${lang}-${w}`)
    await page.locator('[data-kitchen-confirm]').check(); await page.waitForTimeout(150)
    if (w === 390) {
      t(`${lang}: …and enabled once ticked`, await done().isEnabled())
      await page.locator('[data-kitchen-chip="off"]').first().click(); await page.waitForTimeout(150)
      await done().click(); await page.waitForTimeout(400)
      const calls = await page.evaluate(() => window.__calls.filter(c => c.action === 'update_settings').map(c => c.body))
      t(`${lang}: Done saves the truck's own list + the confirmation, then the display mode, and closes`, calls.length === 2 && calls[0].allergens_confirmed_at === true && calls[0].allergen_kitchen_extra.length === 2 && calls[0].allergen_kitchen_extra.includes('Sesame') && calls[1].allergen_display_mode === 'per_dish'
        && await page.evaluate(() => window.__closed === true), calls)
    } else await shot(page, `04b-kitchen-page-ticked-${lang}-${w}`)
    await ctx.close()
  }
  {
    // staff: read-only with Close
    const { page, ctx } = await open('view=wizard&wmode=4&staff=1&extra=Sesame')
    t('staff: the last page is read-only (chips disabled, no confirmation) with Close', await page.locator('[data-kitchen-confirm]').count() === 0
      && await page.locator('[data-kitchen-chip="off"]').first().isDisabled() && await page.getByRole('button', { name: L('en-GB', 'manageAllergens.wizard.nav.close'), exact: true }).count() === 1)
    await ctx.close()
  }
  for (const lang of ['en-GB', 'fr-FR']) {
    // the standalone card page: the info line (translated), no checkbox; its blanket + may_contain pre-ticked on the last page
    const { page, ctx } = await open('view=wizard&wmode=0', { lang })
    await click(page, L(lang, 'managePrimitives.allergenMode.perDishTitle')); await click(page, L(lang, 'manageAllergens.wizard.nav.next'))
    await page.getByRole('button', { name: L(lang, 'manageAllergens.cardUpload.yes'), exact: true }).click(); await page.waitForTimeout(250)
    await page.getByPlaceholder(L(lang, 'manageAllergens.cardUpload.pastePlaceholder')).fill('Everything may contain sesame.')
    await click(page, L(lang, 'manageAllergens.cardUpload.process')); await page.waitForTimeout(400)
    const info = await page.locator('[data-blanket-info]').innerText()
    const sesame = lang === 'fr-FR' ? 'Sésame' : 'Sesame'
    t(`${lang} card page: the info line, translated ("${info.slice(0, 70)}…"), and no checkbox`, info === fill(L(lang, 'manageAllergens.cardUpload.blanketInfo'), { list: sesame }) && await page.locator('input[type=checkbox]').count() === 0, info)
    await page.locator('[data-blanket-info]').scrollIntoViewIfNeeded(); await shot(page, `05-card-page-info-line-${lang}-390`)
    await click(page, L(lang, 'manageAllergens.wizard.nav.next'))
    const dishAllergens = await page.evaluate(() => window.__calls.filter(c => c.action === 'upsert_item').map(c => c.body))
    await click(page, L(lang, 'manageAllergens.wizard.nav.done'), true)
    const added = await page.evaluate(() => [...document.querySelectorAll('[data-kitchen-chip="added"]')].map(b => b.textContent.trim()))
    t(`${lang}: the card's blanket (Sesame) and may_contain (Tree nuts, already locked by Genovese) are on the last page — ${added.join(', ')}`, added.length === 1 && added[0].startsWith(sesame), added)
    t(`${lang}: …and the blanket went into NO dish (no dish write carries Sesame)`, !dishAllergens.some(b => (b.allergens || []).includes('Sesame')), dishAllergens)
    await ctx.close()
  }
  for (const lang of ['en-GB', 'fr-FR']) {
    // the IMPORT end to end: menu "may contain" + card blanket → the kitchen list at commit, never a dish; the fixed footer
    const { page, ctx, bodies } = await open('view=menu&extra=', { lang })
    await click(page, L(lang, 'manageMenu.importMenu'))
    await page.locator('textarea').first().fill('Margherita 10\nDiavola 12\nCoca-cola 1.50\nMay contain mustard.')
    await click(page, L(lang, 'manageMenuImport.upload.process')); await page.waitForTimeout(600)
    await page.getByRole('button', { name: L(lang, 'manageMenuImport.next') }).last().click(); await page.waitForTimeout(400)
    await click(page, L(lang, 'managePrimitives.allergenMode.perDishTitle'))
    const nextBox = await page.getByRole('button', { name: L(lang, 'manageMenuImport.next') }).last().boundingBox()
    const skipBox = await page.getByRole('button', { name: L(lang, 'manageMenuImport.allergens.skip') }).boundingBox()
    t(`${lang} import footer at 390 px: Next is fully on screen (${Math.round(nextBox.x + nextBox.width)} ≤ 390) and Skip is a centred link under it`, nextBox.x + nextBox.width <= 390 && skipBox.y > nextBox.y + nextBox.height - 1 && Math.abs((skipBox.x + skipBox.width / 2) - 195) < 40, { nextBox, skipBox })
    await shot(page, `06-import-footer-fixed-${lang}-390`)
    await page.getByRole('button', { name: L(lang, 'manageMenuImport.next') }).last().click(); await page.waitForTimeout(300)
    await page.getByRole('button', { name: L(lang, 'manageAllergens.cardUpload.yes'), exact: true }).click(); await page.waitForTimeout(200)
    await page.getByPlaceholder(L(lang, 'manageAllergens.cardUpload.pastePlaceholder')).fill('Margherita: gluten, milk. All dishes may contain sesame.')
    await click(page, L(lang, 'manageAllergens.cardUpload.process')); await page.waitForTimeout(500)
    await page.locator('[data-blanket-info]').scrollIntoViewIfNeeded(); await shot(page, `07-import-card-info-line-footer-${lang}-390`)
    await page.getByRole('button', { name: L(lang, 'manageMenuImport.next') }).last().click(); await page.waitForTimeout(500)
    // the review (table): confirm every dish, then Next → the last page
    const confirmBtn = page.getByRole('button', { name: L(lang, 'manageAllergens.wizard.confirm.confirm'), exact: true })
    for (let i = 0; i < 10 && await confirmBtn.count() > 0; i++) { await confirmBtn.first().click(); await page.waitForTimeout(150) }   // each turns into Confirmed
    const revNext = await page.getByRole('button', { name: L(lang, 'manageAllergens.wizard.nav.next') }).last().boundingBox()
    t(`${lang} import review footer at 390 px: Next on screen`, revNext.x + revNext.width <= 390, revNext)
    await page.getByRole('button', { name: L(lang, 'manageAllergens.wizard.nav.next') }).last().click(); await page.waitForTimeout(400)
    const kk = await page.evaluate(() => ({ added: [...document.querySelectorAll('[data-kitchen-chip="added"]')].map(b => b.textContent.trim()), dish: [...document.querySelectorAll('[data-kitchen-chip="dish"]')].map(b => b.textContent.trim()) }))
    // Mustard (the menu's "may contain") and Tree nuts (the card's may_contain) are already in the truck's EXISTING dishes ("Kitchen
    // Sink"), so they show LOCKED; Sesame (the card's blanket) is in no dish, so it shows ADDED — pre-ticked, tappable.
    const sesame = lang === 'fr-FR' ? 'Sésame' : 'Sesame', mustard = lang === 'fr-FR' ? 'Moutarde' : 'Mustard', nuts = lang === 'fr-FR' ? 'Fruits à coque' : 'Tree nuts'
    t(`${lang} import: the last page pre-ticks the card's blanket as ADDED (${kk.added.join(', ')}); the menu's "may contain" and the card's may_contain already show as LOCKED (in existing dishes)`,
      kk.added.length === 1 && kk.added[0].startsWith(sesame) && kk.dish.some(d => d.startsWith(mustard)) && kk.dish.some(d => d.startsWith(nuts)), kk)
    await shot(page, `08-import-kitchen-page-${lang}-390`)
    await page.locator('[data-kitchen-confirm]').scrollIntoViewIfNeeded(); await shot(page, `08-import-kitchen-page-bottom-${lang}-390`)
    await page.locator('[data-kitchen-confirm]').check()
    await page.getByRole('button', { name: L(lang, 'manageAllergens.wizard.nav.next') }).last().click(); await page.waitForTimeout(400)
    await page.getByRole('button', { name: L(lang, 'manageMenuImport.kitchen.saveAdd') }).click(); await page.waitForTimeout(900)
    const commit = JSON.parse(bodies['commit-menu'] || '{}')
    const settings = await page.evaluate(() => window.__calls.filter(c => c.action === 'update_settings').map(c => c.body))
    const dishSets = (commit.items || []).map(i => `${i.name}:${(i.allergens || []).join('+')}`)
    t(`${lang} import commit: NO dish carries the blanket (Sesame) or a "may contain" (Mustard, Tree nuts) — ${dishSets.join(' · ')}`, (commit.items || []).length === 3 && !(commit.items || []).some(i => ['Sesame', 'Mustard', 'Tree nuts'].some(a => (i.allergens || []).includes(a))), dishSets)
    const k = settings.find(b => 'allergen_kitchen_extra' in b)
    t(`${lang} import commit: the kitchen list gets them, with the confirmation — ${k ? k.allergen_kitchen_extra.join(', ') : 'none'}`, k && ['Mustard', 'Sesame', 'Tree nuts'].every(a => k.allergen_kitchen_extra.includes(a)) && k.allergens_confirmed_at === true, settings)
    await ctx.close()
  }
  for (const lang of ['en-GB', 'fr-FR']) {
    // the wizard review footer at 390 (standalone, not all confirmed → "Save & finish later" on the row, Skip underneath)
    const { page, ctx } = await open('view=wizard&wmode=1&rv=list&unconfirmed=Margherita', { lang })
    const b = await page.getByRole('button', { name: L(lang, 'manageAllergens.wizard.nav.saveLater') }).boundingBox()
    t(`${lang} wizard review footer at 390 px: "${L(lang, 'manageAllergens.wizard.nav.saveLater')}" fully on screen`, b.x + b.width <= 390, b)
    await shot(page, `09-review-footer-fixed-${lang}-390`)
    await ctx.close()
  }
  for (const lang of ['en-GB', 'fr-FR']) {
    // the Menu tab line → Edit → the last page
    const { page, ctx } = await open('view=menu&extra=Sesame', { lang })
    const line = await page.locator('[data-kitchen-line]').innerText()
    t(`${lang} Menu tab: "${line.slice(0, 90)}…"`, line.startsWith(fill(L(lang, 'manageMenu.allergens.kitchenLine'), { list: '' }).trim().slice(0, 12)) && line.includes(lang === 'fr-FR' ? 'Sésame' : 'Sesame') && line.includes(L(lang, 'manageMenu.allergens.kitchenEdit')), line)
    await page.locator('[data-kitchen-line]').scrollIntoViewIfNeeded(); await page.evaluate(() => scrollBy(0, 150)); await shot(page, `10-menu-kitchen-line-${lang}-390`)
    await page.locator('[data-kitchen-edit]').click(); await page.waitForTimeout(400)
    t(`${lang} Menu tab: Edit opens the wizard straight on the last page`, await page.locator('[data-kitchen-page]').count() === 1)
    await ctx.close()
  }
  {
    const { page, ctx } = await open('view=menu&extra=Sesame&staff=1')
    t('staff: the Menu tab line is shown without Edit', await page.locator('[data-kitchen-line]').count() === 1 && await page.locator('[data-kitchen-edit]').count() === 0)
    await ctx.close()
  }
  await browser.close(); server.close()

  if (live) {
    head('C · the customer order page (localhost, App Tester)')
    const BASE = 'http://localhost:3100', SLUG = 'app-tester'
    const ev = (await (await fetch(`${BASE}/api/events?truck=${SLUG}`)).json()).events[0]
    const real = await (await fetch(`${BASE}/api/menu/${SLUG}?event_id=${ev.id}`)).json()
    const b2 = await pw.chromium.launch()
    for (const mode of ['per_dish', 'card']) for (const lang of ['en-GB', 'fr-FR']) for (const w of [390, 1280]) {
      if (w === 1280 && lang === 'fr-FR') continue
      const ctx = await b2.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 })
      const page = await ctx.newPage()
      await page.route(`**/api/events?truck=${SLUG}*`, async r => { const res = await r.fetch(); const j = await res.json(); if (j.time) j.time = { ...j.time, locale: lang }; await r.fulfill({ response: res, json: j }) })
      await page.route(`**/api/menu/${SLUG}*`, async r => { const res = await r.fetch(); const j = await res.json()
        if (j.truck?.time) j.truck.time = { ...j.truck.time, locale: lang }
        if (mode === 'card' && j.truck) { j.truck.allergen_display_mode = 'card'; j.truck.allergen_info_text = 'Test allergens'; j.truck.kitchen_allergens = [] }
        // App Tester has no extras: give Margherita one group in the BROWSER's copy — one extra with an allergen, one without.
        const m = (j.menu?.items || []).find(i => i.name === 'Margherita')
        if (m) m.modifierGroups = [{ id: 'g-x', name: 'Extras', hide_name: false, is_required: false, min_choices: 0, max_choices: 2, options: [
          { id: 'o-1', name: 'Pesto drizzle', price_adjustment: 1, allergens: ['Tree nuts', 'Dairy'], dietary: [], available: true, stock_count: null },
          { id: 'o-2', name: 'Fresh basil', price_adjustment: 0.5, allergens: [], dietary: [], available: true, stock_count: null }] }]
        await r.fulfill({ response: res, json: j }) })
      await page.goto(`${BASE}/trucks/${SLUG}/order?event_id=${ev.id}`, { waitUntil: 'networkidle' })
      await page.waitForSelector('[data-menu]', { timeout: 30000 }); await page.waitForTimeout(500)
      await page.getByRole('button', { name: L(lang, 'order.allergenInfo') }).click(); await page.waitForTimeout(300)
      const pop = await page.evaluate(() => { const k = document.querySelector('[data-kitchen-allergens]'); return { kitchen: k ? [...k.querySelectorAll('span')].map(s => s.textContent) : null, text: document.querySelector('.fixed.inset-0')?.innerText ?? '' } })
      const sev = L(lang, 'order.allergenSevere')
      if (mode === 'per_dish' && w === 390) {
        // the server's own list (/api/menu kitchen_allergens), named and sorted as the customer reads it (lib/allergen-kitchen.ts kitchenNames)
        const label = a => (lang === 'en-GB' ? a : (W[lang].menuBadges?.allergen?.[a.replace(/[^A-Za-z]/g, '')] ?? a))
        const shown = [...new Set(real.truck.kitchen_allergens)].sort().map(label)
        const want = lang === 'en-GB' ? shown : shown.sort((x, y) => x.localeCompare(y, 'fr-FR'))
        t(`${lang} pop-up: "${L(lang, 'order.kitchenHeading')}" = the server's kitchen list, translated (${pop.kitchen?.join(', ')})`, JSON.stringify(pop.kitchen) === JSON.stringify(want) && pop.text.includes(L(lang, 'order.kitchenNote')), { kitchen: pop.kitchen, want })
      }
      if (w === 390) t(`${lang} ${mode} pop-up: the new severe line "${sev}"`, pop.text.includes(sev))
      if (mode === 'card' && w === 390) t(`${lang} card mode: no kitchen list (the card shows instead)`, pop.kitchen === null && pop.text.includes('Test allergens'))
      await page.screenshot({ path: path.join(OUT, `${mode === 'per_dish' ? '11' : '12'}-customer-popup-${mode}-${lang}-${w}.png`) })
      await page.keyboard.press('Escape'); await page.locator('.fixed.inset-0 button', { hasText: '×' }).first().click().catch(() => {})
      // the dish pop-up: Margherita's extras
      // a dish with extras opens its pop-up from its Add button
      const dishRow = page.locator('[data-menu] div', { has: page.getByText('Margherita', { exact: true }) }).filter({ has: page.getByRole('button', { name: L(lang, 'order.add'), exact: true }) }).last()
      await dishRow.getByRole('button', { name: L(lang, 'order.add'), exact: true }).click(); await page.waitForTimeout(600)
      const opts = await page.evaluate(() => [...document.querySelectorAll('[data-option-allergens]')].map(s => s.textContent))
      if (w === 390) {
        if (mode === 'per_dish') t(`${lang} dish pop-up: "Pesto drizzle" shows its allergens (${opts.join(' | ')}); "Fresh basil" (none) shows nothing`, opts.length === 1 && opts[0] === (lang === 'fr-FR' ? 'Fruits à coque, Lait' : 'Tree nuts, Dairy'), opts)
        else t(`${lang} card mode: no extra shows allergens`, opts.length === 0, opts)
      }
      await page.screenshot({ path: path.join(OUT, `${mode === 'per_dish' ? '13' : '14'}-dish-popup-extras-${mode}-${lang}-${w}.png`) })
      await ctx.close()
    }
    await b2.close()
  }

  console.log(`\n${fail ? '🔴 ' + fail + ' FAILED, ' + pass + ' passed' : '✅ allergen-kitchen-1-live: all ' + pass + ' passed'}`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
