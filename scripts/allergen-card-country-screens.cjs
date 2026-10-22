#!/usr/bin/env node
// scripts/allergen-card-country-screens.cjs — the screenshots of allergen-card-country (docs/allergen-card-country-report.md).
//   node scripts/allergen-card-country-screens.cjs      (needs `npx next build` for the app CSS, and Playwright)
//
// Like scripts/countries-screenshots.cjs: the REAL components are bundled for a browser with esbuild, served from a tiny
// local server, and every /api/* call is answered with fixtures (the GB and US rows parsed from the seed migrations, and an
// Ireland row — switched off, allergen card on its own OFF). Nothing reaches a database or the network. Not a registered
// harness: it photographs; scripts/allergen-card-country.cjs proves. Writes into docs/allergen-card-country/:
//   ie-wizard-page2-<w>.png   the allergen wizard for an Irish truck: it opens on page 2 (no page 1, no Back)
//   gb-wizard-page1-<w>.png   the same wizard for a UK truck: page 1, as before (for comparison)
//   admin-row-<w>.png         Admin › Countries, the "Allergen card on its own" row (GB / IE / US)
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http')
const REPO = path.resolve(__dirname, '..')
const { gbFromSeed, usFromSeed } = require('./_country-settings-gb.cjs')
const OUT = path.join(REPO, 'docs/allergen-card-country')
fs.mkdirSync(OUT, { recursive: true })

function appCss() {
  const root = path.join(REPO, '.next/static')
  if (!fs.existsSync(root)) throw new Error('no .next/static — run `npx next build` first')
  const files = []
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith('.css')) files.push(f) } }
  walk(root)
  return files.map(f => fs.readFileSync(f, 'utf8')).join('\n')
}

const STUBS = {
  'next/navigation': "export const useRouter = () => ({ push(){}, replace(){}, refresh(){}, back(){}, prefetch(){} }); export const usePathname = () => '/admin'; export const useSearchParams = () => new URLSearchParams(location.search); export const useParams = () => ({ token: 'harness' }); export const notFound = () => {}; export const redirect = () => {}",
  'next/link': "import React from 'react'; export default function Link(p) { const { href, children, prefetch, replace, scroll, ...rest } = p; return React.createElement('a', { href: typeof href === 'string' ? href : '#', ...rest }, children) }",
  'next/image': "import React from 'react'; export default function Image(p) { const { src, alt, fill, priority, quality, placeholder, blurDataURL, unoptimized, loader, ...rest } = p; return React.createElement('img', { src: typeof src === 'string' ? src : '', alt, ...rest }) }",
}

async function bundle(dir, entrySrc) {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const entry = path.join(dir, 'entry.tsx')
  fs.writeFileSync(entry, entrySrc)
  const MANAGE = path.join(REPO, 'app/manage/[token]/page.tsx')
  await esbuild.build({
    entryPoints: [entry], bundle: true, outfile: path.join(dir, 'bundle.js'), format: 'iife', platform: 'browser',
    jsx: 'automatic', target: 'es2020', logLevel: 'error', alias: { '@': REPO }, nodePaths: [path.join(REPO, 'node_modules')],
    banner: { js: 'window.process = window.process || { env: {} };' },
    loader: { '.svg': 'text', '.png': 'empty' },
    define: {
      'process.env.NODE_ENV': '"production"',
      'process.env.NEXT_PUBLIC_SUPABASE_URL': '"http://127.0.0.1:9"', 'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': '"harness"',
      'process.env.NEXT_PUBLIC_PRICING_PUBLISHED': '"true"',
    },
    plugins: [{ name: 'stubs', setup(b) {
      b.onResolve({ filter: /^next\/(navigation|link|image)$/ }, a => ({ path: a.path, namespace: 'stub' }))
      b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: STUBS[a.path], loader: 'js', resolveDir: REPO }))
      // The wizard is not exported by the Manage page; expose it for this photograph only.
      b.onLoad({ filter: /app\/manage\/\[token\]\/page\.tsx$/ }, a => (a.path === MANAGE
        ? { contents: fs.readFileSync(MANAGE, 'utf8') + '\nexport { AllergenWizardModal }\n', loader: 'tsx', resolveDir: path.dirname(MANAGE) } : undefined))
    } }],
  })
  return fs.readFileSync(path.join(dir, 'bundle.js'), 'utf8')
}

function serve(css, js, settings) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style></head><body class="bg-slate-50"><script id="settings" type="application/json">${JSON.stringify(settings || null)}</script><div id="root"></div><script src="/bundle.js"></script></body></html>`
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/bundle.js')) { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(js) }
    const pub = path.join(REPO, 'public', decodeURIComponent(req.url.split('?')[0]))
    if (pub.startsWith(path.join(REPO, 'public') + path.sep) && fs.existsSync(pub) && fs.statSync(pub).isFile()) { res.writeHead(200); return res.end(fs.readFileSync(pub)) }
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(html)
  })
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)))
}

const WIZARD_ENTRY = `import { createRoot } from 'react-dom/client'
import { AllergenWizardModal } from '@/app/manage/[token]/page'
import { CountrySettingsProvider } from '@/components/CountrySettingsProvider'
const settings = JSON.parse(document.getElementById('settings').textContent)
const noop = () => {}, api = async () => ({})
const items = [{ id: 'i1', name: 'Margherita', category_id: 'c1', price: 12, allergens: ['Gluten', 'Dairy'], dietary: [], allergens_verified: false, is_available: true },
  { id: 'i2', name: 'Spicy Chicken Wings', category_id: 'c1', price: 9, allergens: [], dietary: [], allergens_verified: false, is_available: true }]
createRoot(document.getElementById('root')).render(
  <CountrySettingsProvider settings={settings}>
    <AllergenWizardModal items={items} categories={[{ id: 'c1', name: 'Mains', sort_order: 0 }]} canEdit onClose={noop} onConfirmRow={api} onUndoRow={api}
      onEditUnverify={api} showToast={noop} cardText="" cardUrl="" cardProcessing={false} onAddCard={noop} onSetDisplayMode={api}
      onProcessCard={api} onCardMerge={api} />
  </CountrySettingsProvider>)
`
const ADMIN_ENTRY = `import { createRoot } from 'react-dom/client'\nimport AdminPage from '@/app/admin/page'\ncreateRoot(document.getElementById('root')).render(<AdminPage />)\n`

;(async () => {
  const css = appCss()
  const stamp = { updatedAt: '2026-10-21T08:12:00.000000+00:00', updatedBy: 'migration' }
  const GB = { ...gbFromSeed(), ...stamp, addressFormat: 'gb' }
  const US = { ...usFromSeed(), ...stamp, addressFormat: 'us', enabled: true }
  const IE = { ...gbFromSeed(), ...stamp, countryCode: 'IE', name: 'Ireland', shortName: 'Ireland', currency: 'EUR', locale: 'en-IE', enabled: false,
    addressFormat: 'ie', allergenCardOnlyAllowed: false, cardFeeOnlineFixedMinor: 25, cardFeeRegionLabel: 'EEA cards', defaultTimezone: 'Europe/Dublin', timezones: ['Europe/Dublin'] }
  const { chromium, webkit } = require('playwright')
  const shots = []

  // ── the wizard: Ireland (page 2 first) and the UK (page 1, for comparison) ──────────────────────────────────────────
  const wjs = await bundle(fs.mkdtempSync(path.join(os.tmpdir(), 'hg-acc-wiz-')), WIZARD_ENTRY)
  for (const [tag, settings] of [['ie-wizard-page2', IE], ['gb-wizard-page1', GB]]) {
    const server = await serve(css, wjs, settings)
    const base = `http://127.0.0.1:${server.address().port}`
    for (const [engine, launcher] of [['webkit', webkit], ['chromium', chromium]]) {
      const browser = await launcher.launch()
      for (const [w, h] of [[390, 844], [1280, 800]]) {
        const page = await browser.newPage({ viewport: { width: w, height: h } })
        const errors = []; page.on('pageerror', e => errors.push(String(e)))
        await page.goto(base + '/')
        await page.waitForSelector('h2', { timeout: 20000 })
        await page.waitForTimeout(300)
        const seen = await page.evaluate(() => document.body.innerText)
        const file = `${tag}-${w}${engine === 'chromium' ? '-chromium' : ''}.png`
        await page.screenshot({ path: path.join(OUT, file) })
        shots.push({ file, errors: errors.length, page2: /Do you have an allergen card to upload\?/.test(seen), page1: /Show an allergen card/.test(seen), back: /\bBack\b/.test(seen) })
        await page.close()
      }
      await browser.close()
    }
    server.close()
  }

  // ── Admin › Countries: the new row ────────────────────────────────────────────────────────────────────────────
  const ajs = await bundle(fs.mkdtempSync(path.join(os.tmpdir(), 'hg-acc-admin-')), ADMIN_ENTRY)
  const server = await serve(css, ajs, null)
  const base = `http://127.0.0.1:${server.address().port}`
  for (const [engine, launcher] of [['webkit', webkit], ['chromium', chromium]]) {
    const browser = await launcher.launch()
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const errors = []; page.on('pageerror', e => errors.push(String(e)))
    await page.route('**/api/**', route => {
      const u = new URL(route.request().url())
      const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
      if (u.pathname === '/api/admin/countries') return json({ countries: [GB, IE, US], truckCounts: { GB: 11, IE: 0, US: 1 }, unreadable: [] })
      if (u.pathname === '/api/admin') {
        const s = u.searchParams.get('section')
        if (s === 'check_admin') return json({ isAdmin: true })
        if (s === 'discovery') return json({ discoveryTrucks: [] })
        if (s === 'demo_cleanup') return json({ lastRun: null })
        return json({ trucks: [], operators: [], countrySettings: { GB } })
      }
      if (u.pathname === '/api/auth/me') return json({ first_name: 'Dominic' })
      return json({})
    })
    await page.goto(`${base}/admin?tab=countries`)
    await page.waitForSelector('[data-country-head="IE"]', { timeout: 30000 })
    await page.waitForTimeout(300)
    // Lift the grid's height cap and un-pin the page chrome (as countries-screenshots does), then frame the row.
    const box = await page.evaluate(() => {
      const b = document.querySelector('[data-countries-grid]'); b.style.maxHeight = 'none'; b.style.overflow = 'visible'
      for (const el of document.querySelectorAll('.sticky')) if (!b.contains(el)) el.style.position = 'static'
      const label = [...b.querySelectorAll('p, span, div')].find(e => e.children.length === 0 && e.textContent.trim() === 'Allergen card on its own')
      if (!label) return null
      label.scrollIntoView({ block: 'center' })
      const cell = label.closest('.sticky') || label
      const r = cell.getBoundingClientRect(), g = b.getBoundingClientRect()
      const toggles = [...b.querySelectorAll('[aria-label^="Allergen card on its own"]')].map(x => ({ label: x.getAttribute('aria-label'), checked: x.getAttribute('aria-checked') ?? x.getAttribute('aria-pressed') ?? String(x.checked) }))
      return { x: g.left, y: r.top - 8, width: g.width, height: r.height + 16, toggles }
    })
    if (!box) throw new Error('the "Allergen card on its own" row did not render')
    const file = `admin-row-1440${engine === 'chromium' ? '-chromium' : ''}.png`
    await page.screenshot({ path: path.join(OUT, file), clip: { x: Math.max(0, box.x), y: Math.max(0, box.y), width: Math.min(1440, box.width), height: box.height } })
    shots.push({ file, errors: errors.length, toggles: box.toggles })
    await page.close(); await browser.close()
  }
  server.close()
  console.log(JSON.stringify(shots, null, 1))
  const bad = shots.filter(s => s.errors || (s.file.startsWith('ie-') && (!s.page2 || s.page1 || s.back)) || (s.file.startsWith('gb-') && !s.page1))
  if (bad.length) { console.error('🔴 unexpected:', JSON.stringify(bad)); process.exit(1) }
  console.log(`✅ ${shots.length} screenshots in docs/allergen-card-country/`)
})().catch(e => { console.error(e); process.exit(1) })
