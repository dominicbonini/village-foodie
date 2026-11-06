#!/usr/bin/env node
// scripts/costs-accounts-1-screens.cjs — costs-accounts-1 (4 November 2026, docs/costs-accounts-1-report.md): Manage › Menu's item
// editor ("Cost to make") and Reports (the period presets and the "For your accountant" card) in WEBKIT, at 390 px and laptop width.
//   node scripts/costs-accounts-1-screens.cjs      (needs a local WebKit — playwright; NO build: the stylesheet is compiled from
//                                                   app/globals.css with Tailwind's own PostCSS plugin)
// The REAL ReportsTab and MenuTab from app/manage/[token]/page.tsx are bundled for the browser and mounted with the truck's clock
// and country; every /api/manage call is answered by the page's own `api` stub from fixtures (nothing reaches a database). The
// report's accounts rows are made by the real lib/accounts/ledger.ts in the browser. Not a registered harness (it photographs);
// scripts/costs-accounts-1.cjs proves. Writes docs/costs-accounts-1/: item-editor-390, item-editor-1280, reports-390, reports-1280,
// and the two downloaded CSVs as seen by the browser (accounts-orders.csv, accounts-events.csv).
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http')
const REPO = path.resolve(__dirname, '..')
const OUT = path.join(REPO, 'docs/costs-accounts-1')
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-ca1-'))
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
      // Neither tab is exported by the Manage page; expose both for this photograph only.
      b.onLoad({ filter: /app\/\(app\)\/manage\/\[token\]\/page\.tsx$/ }, a => (a.path === MANAGE
        ? { contents: fs.readFileSync(MANAGE, 'utf8') + '\nexport { ReportsTab, MenuTab }\n', loader: 'tsx', resolveDir: path.dirname(MANAGE) } : undefined))
    } }],
  })
  return fs.readFileSync(path.join(dir, 'bundle.js'), 'utf8')
}

const ENTRY = `import { createRoot } from 'react-dom/client'
import { ReportsTab, MenuTab } from '@/app/(app)/manage/[token]/page'
import { CountrySettingsProvider } from '@/components/CountrySettingsProvider'
import { TruckTimeContext } from '@/components/TruckTimeContext'
import { LEGACY_UK_TIME_SETTINGS } from '@/lib/time-utils'
import { accountRows } from '@/lib/accounts/ledger'
const which = new URLSearchParams(location.search).get('view')
const truck = { id: 'test-truck', name: 'Pizza Kitchen', plan: 'pro', country: 'GB', currency: 'GBP', feature_overrides: {} }
const ev = { a: { id: 'ev-a', venue_name: 'The Green', town: 'Testville', van_id: null, event_date: '2026-10-17' }, b: { id: 'ev-b', venue_name: 'Market Square', town: 'Ely', van_id: null, event_date: '2026-10-24' } }
const mk = (n, e, items, total, over = {}) => ({ order_key: 'k' + n, id: String(n), customer_name: 'Ann', customer_email: n % 3 ? 'ann@example.test' : null, status: 'collected', slot: '12:30', total, discount_amt: 0,
  created_at: e.event_date + 'T1' + (n % 9) + ':1' + (n % 6) + ':00.000Z', items, deals: [], event_date: e.event_date, event_id: e.id, currency: 'GBP', ...over })
const M = q => ({ name: 'Margherita', quantity: q, unit_price: 12 }), G = q => ({ name: 'Garlic Bread', quantity: q, unit_price: 4.5 }), T = q => ({ name: 'Tiramisu', quantity: q, unit_price: 5 })
const orders = [mk(1, ev.a, [M(2), G(1)], 28.5), mk(2, ev.a, [M(1)], 12), mk(3, ev.a, [M(1), T(1)], 17), mk(4, ev.a, [G(2)], 9), mk(5, ev.b, [M(3)], 36), mk(6, ev.b, [M(1), G(1)], 16.5), mk(7, ev.b, [T(2)], 10)]
const refunded = mk(8, ev.b, [M(1)], 12, { status: 'cancelled' })
const payments = [{ order_key: 'k1', kind: 'charge', channel: 'online', amount_minor: 2850, state: 'succeeded' }, { order_key: 'k2', kind: 'charge', channel: 'online', amount_minor: 1200, state: 'succeeded' },
  { order_key: 'k8', kind: 'charge', channel: 'online', amount_minor: 1200, state: 'succeeded' }, { order_key: 'k8', kind: 'refund', channel: 'online', amount_minor: 1200, state: 'succeeded' }]
const costs = [{ item_id: 'i1', cost_minor: 320, currency: 'GBP', effective_from: '2026-10-01' }, { item_id: 'i2', cost_minor: 90, currency: 'GBP', effective_from: '2026-10-01' }]
const rows = accountRows({ orders: [...orders, refunded], payments, costs, itemIdByName: { Margherita: 'i1', 'Garlic Bread': 'i2', Tiramisu: 'i3' }, tax: { inclusive: true, rateMilli: null }, timeZone: 'Europe/London', currency: 'GBP' })
const report = { totalOrders: orders.length, orders, eventsMap: { 'ev-a': ev.a, 'ev-b': ev.b }, eventsByDate: {}, itemCategories: { Margherita: 'Pizzas', 'Garlic Bread': 'Sides', Tiramisu: 'Desserts' }, categoryOrder: ['Pizzas', 'Sides', 'Desserts'],
  topItems: [{ name: 'Margherita', qty: 8, revenue: 96 }, { name: 'Garlic Bread', qty: 4, revenue: 18 }, { name: 'Tiramisu', qty: 3, revenue: 15 }], accounts: { rows, currency: 'GBP', taxLabel: 'VAT', taxInclusive: true } }
const calls = []; window.__calls = calls
const api = async (action, body) => {
  calls.push({ action, body })
  if (action === 'get_vans') return { vans: [] }
  if (action === 'get_recent_events') return { events: [ev.b, ev.a].map(e => ({ id: e.id, venue_name: e.venue_name, event_date: e.event_date, status: 'confirmed' })) }
  if (action === 'get_accounts_settings') return { ok: true, taxYearStart: { month: 4, day: 6 } }
  if (action === 'get_report') return { ok: true, report }
  if (action === 'get_item_cost') return { ok: true, cost: 3.2, currency: 'GBP' }
  if (action === 'set_item_cost') return { ok: true, written: true }
  return {}
}
const settings = { countryCode: 'GB', currency: 'GBP', locale: 'en-GB', pricesIncludeTax: true, taxLabel: 'VAT', dateOrder: 'dmy', timeFormat: '24h', weekStart: 'monday' }
const noop = () => {}
const items = [{ id: 'i1', name: 'Margherita', description: 'Tomato, mozzarella, basil', price: 12, category_id: 'c1', is_available: true, is_active: true, sort_order: 1, allergens: ['Gluten', 'Milk'], dietary_info: ['Vegetarian'], allergens_verified: true, default_stock: null }]
createRoot(document.getElementById('root')).render(
  <CountrySettingsProvider settings={settings}>
    <TruckTimeContext.Provider value={LEGACY_UK_TIME_SETTINGS}>
      <div className="min-h-screen bg-slate-50 px-4 py-6 max-w-5xl mx-auto">
        {which === 'reports'
          ? <ReportsTab truck={truck} api={api} />
          : <MenuTab truck={truck} categories={[{ id: 'c1', name: 'Pizzas', sort_order: 1, is_active: true }]} items={items} subcategories={[]} token="tok" modifierGroups={[]} modifierOptions={[]} itemModGroups={[]}
              setItemModGroups={noop} api={api} reload={noop} showToast={noop} allergenWizardOpen={false} onCloseAllergenWizard={noop} onOpenAllergenWizard={noop} canEditAllergens
              onWalkthroughChoice={noop} onVerifySuccess={noop} canSeeCosts />}
      </div>
    </TruckTimeContext.Provider>
  </CountrySettingsProvider>)
`

function serve(styles, js) {
  const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${styles}</style></head><body class="bg-slate-50"><div id="root"></div><script src="/bundle.js"></script></body></html>`
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/bundle.js')) { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(js) }
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(html)
  })
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)))
}

;(async () => {
  const [styles, js] = await Promise.all([css(), bundle(ENTRY)])
  const server = await serve(styles, js)
  const base = `http://127.0.0.1:${server.address().port}`
  const { webkit } = require('playwright')
  const browser = await webkit.launch()
  for (const [w, h] of [[390, 844], [1280, 800]]) {
    // ── the item editor ──
    {
      const page = await browser.newPage({ viewport: { width: w, height: h } })
      const errors = []; page.on('pageerror', e => errors.push(String(e)))
      await page.goto(base + '/?view=menu')
      await page.waitForSelector('text=Pizzas', { timeout: 20000 })
      await page.locator('text=Pizzas').first().click()                       // the category opens collapsed
      await page.waitForSelector('text=Margherita', { timeout: 10000 })
      await page.locator('button:has-text("✏️")').first().click()
      await page.waitForSelector('[data-cost-to-make] input', { timeout: 10000 })
      await page.waitForFunction(() => document.querySelector('[data-cost-to-make] input')?.value === '3.2', null, { timeout: 5000 }).catch(() => {})
      await page.locator('[data-cost-to-make]').scrollIntoViewIfNeeded()
      const seen = await page.evaluate(() => ({ text: document.querySelector('[data-cost-to-make]')?.innerText ?? '', value: document.querySelector('[data-cost-to-make] input')?.value, wide: document.documentElement.scrollWidth > innerWidth + 1 }))
      await page.screenshot({ path: path.join(OUT, `item-editor-${w}.png`) })
      t(`item editor ${w}px: "Cost to make", the help text, the dish's cost read back (3.2), nothing scrolls sideways, no error`, /Cost to make/.test(seen.text) && /Optional\. What one portion costs you in ingredients and packaging\. Used only in your reports; customers never see it\./.test(seen.text)
        && seen.value === '3.2' && !seen.wide && !errors.length, { seen, errors })
      await page.fill('[data-cost-to-make] input', '3.45'); await page.locator('[data-cost-to-make] input').blur(); await page.waitForTimeout(200)
      const calls = await page.evaluate(() => window.__calls.filter(c => c.action.includes('item_cost')))
      t(`item editor ${w}px: blur saves through set_item_cost (never upsert_item)`, calls.some(c => c.action === 'set_item_cost' && c.body.itemId === 'i1' && c.body.cost === '3.45')
        && !(await page.evaluate(() => window.__calls.some(c => c.action === 'upsert_item' && 'cost' in (c.body || {})))), calls)
      await page.close()
    }
    // ── Reports ──
    {
      const page = await browser.newPage({ viewport: { width: w, height: h }, acceptDownloads: true })
      const errors = []; page.on('pageerror', e => errors.push(String(e)))
      await page.goto(base + '/?view=reports')
      await page.waitForSelector('[data-accounts]', { timeout: 20000 })
      const seen = await page.evaluate(() => ({ card: document.querySelector('[data-accounts]').innerText, presets: [...document.querySelectorAll('[data-report-preset]')].filter(s => s.offsetParent).map(s => [...s.options].map(o => o.text)), wide: document.documentElement.scrollWidth > innerWidth + 1 }))
      await page.screenshot({ path: path.join(OUT, `reports-${w}.png`), fullPage: true })
      t(`Reports ${w}px: the presets beside the range (Custom dates, This month, Last month, Last quarter, Last tax year)`, seen.presets.length === 1 && JSON.stringify(seen.presets[0]) === JSON.stringify(['Custom dates', 'This month', 'Last month', 'Last quarter', 'Last tax year']), seen.presets)
      const CARD_WORDS = ['For your accountant', 'Gross sales', 'Refunds', 'VAT', 'Net sales', 'Gross sales by channel', 'Gross sales by payment', 'Card online', 'Pay at Hatch', 'Cost of dishes sold', 'Profit', 'Cost set for 12 of 15 dishes sold', 'Refunds\n−£12.00', 'Cost of dishes sold\n−£29.20', 'Net sales\n£129.00', 'higher than it really is', 'By event', 'The Green', 'Market Square', 'No tax rate is set']
      t(`Reports ${w}px: the card — gross, refunds, VAT, net, channel, payment, cost, profit, "Cost set for 12 of 15 dishes sold", the warning, by event, deductions as −£`, ['For your accountant', 'Gross sales', 'Refunds', 'VAT', 'Net sales', 'Gross sales by channel', 'Gross sales by payment', 'Card online', 'Pay at Hatch', 'Cost of dishes sold', 'Profit', 'Cost set for 12 of 15 dishes sold', 'Refunds\n−£12.00', 'Cost of dishes sold\n−£29.20', 'Net sales\n£129.00', 'higher than it really is', 'By event', 'The Green', 'Market Square', 'No tax rate is set']
        .every(x => seen.card.toLowerCase().includes(x.toLowerCase())) && !seen.wide && !errors.length, { missing: CARD_WORDS.filter(x => !seen.card.toLowerCase().includes(x.toLowerCase())), wide: seen.wide, errors })
      // A preset loads the report for its range (the GB tax year from the country's data: 6 April).
      await page.locator('[data-report-preset]:visible').selectOption('lastTaxYear'); await page.waitForTimeout(200)
      const last = await page.evaluate(() => window.__calls.filter(c => c.action === 'get_report').pop()?.body)
      t(`Reports ${w}px: "Last tax year" loads 2025-04-06 … 2026-04-05`, last && last.dateFrom === '2025-04-06' && last.dateTo === '2026-04-05', last)
      if (w === 1280) {
        for (const kind of ['orders', 'events']) {
          const [dl] = await Promise.all([page.waitForEvent('download'), page.locator(`[data-accounts-download="${kind}"]`).click()])
          const file = path.join(OUT, `accounts-${kind}.csv`); await dl.saveAs(file)
          const buf = fs.readFileSync(file)
          t(`the ${kind} CSV as the browser saves it: UTF-8 BOM, a header row, CRLF, no £ (file ${dl.suggestedFilename()})`, buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF && buf.includes('\r\n') && !buf.toString('utf8').includes('£') && /^accounts-(orders|events)-2025-04-06-to-2026-04-05\.csv$/.test(dl.suggestedFilename()), dl.suggestedFilename())
        }
      }
      await page.close()
    }
  }
  await browser.close(); server.close()
  console.log(`\ncosts-accounts-1-screens: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
