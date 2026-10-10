#!/usr/bin/env node
// scripts/countries-screenshots.cjs — Admin › Countries, rendered for real, photographed and measured.
//   node scripts/countries-screenshots.cjs      (needs `npx next build` for the app CSS, and local Chromium)
//
// The REAL admin page (app/admin/page.tsx, which mounts components/admin/CountriesTab.tsx) is bundled for a
// browser with esbuild and served from a tiny local server. Every /api/* call is answered by Playwright
// with fixtures: the GB and US rows PARSED FROM THE SEED MIGRATIONS that were run, 14 GB trucks, 0 US.
// Nothing reaches a database or the network.
//
// It writes, at 1440×900 and 1920×1080, into docs/screenshots/:
//   countries-<w>-page.png        the full page as an admin first sees it
//   countries-<w>-grid.png        the whole grid, every row (the box's height cap lifted for the photo)
//   countries-<w>-us-column.png   the US column header, with the can't-switch-on note
//   countries-<w>-add-form.png    the Add country form, open
// …and FAILS if anything overlaps or is cut off: the page scrolling sideways, a cell's contents spilling
// out of it, a header's Save button overlapping its text, or the pinned header not staying put.

const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http')
const REPO = path.resolve(__dirname, '..')
const { gbFromSeed, usFromSeed } = require('./_country-settings-gb.cjs')
const OUT = path.join(REPO, 'docs/screenshots')
fs.mkdirSync(OUT, { recursive: true })

const ok = [], bad = []
const t = (name, cond) => (cond ? ok : bad).push(name)

function appCss() {
  const root = path.join(REPO, '.next/static')
  if (!fs.existsSync(root)) throw new Error('no .next/static — run `npx next build` first')
  const files = []
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith('.css')) files.push(f)
  } }
  walk(root)
  const css = files.map(f => fs.readFileSync(f, 'utf8')).join('\n')
  // Tailwind emits only the classes it found at build time — a build from before this page would lay it out
  // without its own box and every measurement would be about a screen nobody is served.
  if (!css.includes('max-h-\\[calc\\(100dvh-210px\\)\\]')) throw new Error('the compiled CSS predates the Countries page — run `npx next build`')
  return css
}

const STUBS = {
  'next/navigation': "export const useRouter = () => ({ push(){}, replace(){}, refresh(){}, back(){}, prefetch(){} }); export const usePathname = () => '/admin'; export const useSearchParams = () => new URLSearchParams(location.search); export const useParams = () => ({}); export const notFound = () => {}; export const redirect = () => {}",
  'next/link': "import React from 'react'; export default function Link(p) { const { href, children, prefetch, replace, scroll, ...rest } = p; return React.createElement('a', { href: typeof href === 'string' ? href : '#', ...rest }, children) }",
  'next/image': "import React from 'react'; export default function Image(p) { const { src, alt, fill, priority, quality, placeholder, blurDataURL, unoptimized, loader, ...rest } = p; return React.createElement('img', { src: typeof src === 'string' ? src : (src && src.src) || '', alt, ...rest }) }",
}

async function bundle(dir) {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const entry = path.join(dir, 'entry.tsx')
  fs.writeFileSync(entry, `import { createRoot } from 'react-dom/client'\nimport AdminPage from '@/app/admin/page'\ncreateRoot(document.getElementById('root')).render(<AdminPage />)\n`)
  await esbuild.build({
    entryPoints: [entry], bundle: true, outfile: path.join(dir, 'bundle.js'), format: 'iife', platform: 'browser',
    jsx: 'automatic', target: 'es2020', logLevel: 'error', alias: { '@': REPO }, nodePaths: [path.join(REPO, 'node_modules')],
    // Next inlines NEXT_PUBLIC_* at build time and leaves the rest undefined; a bare browser has no `process`.
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
    } }],
  })
  return fs.readFileSync(path.join(dir, 'bundle.js'), 'utf8')
}

;(async () => {
  const css = appCss()
  const js = await bundle(fs.mkdtempSync(path.join(os.tmpdir(), 'hg-countries-')))
  const GB = { ...gbFromSeed(), updatedAt: '2026-10-10T08:12:00.000000+00:00', updatedBy: 'migration 20261010_03' }
  const US = { ...usFromSeed(), updatedAt: '2026-10-10T08:12:00.000000+00:00', updatedBy: 'migration 20261010_04' }
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/bundle.js')) { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(js) }
    // public/ — so the header's wordmark and any icon load as they do in the app.
    const pub = path.join(REPO, 'public', decodeURIComponent(req.url.split('?')[0]))
    if (pub.startsWith(path.join(REPO, 'public') + path.sep) && fs.existsSync(pub) && fs.statSync(pub).isFile()) {
      const type = { '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.webp': 'image/webp' }[path.extname(pub)] || 'application/octet-stream'
      res.writeHead(200, { 'content-type': type }); return res.end(fs.readFileSync(pub))
    }
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(html)
  })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}`

  const { chromium } = require('playwright')
  const browser = await chromium.launch()
  try {
    for (const [w, h] of [[1440, 900], [1920, 1080]]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } })
      const errors = []
      page.on('pageerror', e => errors.push(String(e)))
      await page.route('**/api/**', route => {
        const u = new URL(route.request().url())
        const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
        if (u.pathname === '/api/admin/countries') return json({ countries: [GB, US], truckCounts: { GB: 14, US: 0 } })
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
      page.on('console', msg => { if (msg.type() === 'error') errors.push('console: ' + msg.text()) })
      try { await page.waitForSelector('[data-country-head="US"]', { timeout: 20000 }) }
      catch (e) {
        const body = await page.evaluate(() => document.body.innerText.slice(0, 600))
        throw new Error(`the Countries grid never rendered at ${w}px.\n  errors: ${errors.slice(0, 5).join('\n          ')}\n  page text: ${body}`)
      }
      await page.waitForTimeout(300)
      const tag = String(w)

      // ── the measurements ──────────────────────────────────────────────────────────────────────────
      const m = await page.evaluate(() => {
        const grid = document.querySelector('[data-countries-grid]')
        const cells = [...grid.firstElementChild.children]
        const spill = cells.filter(c => c.scrollWidth > c.clientWidth + 1).map(c => (c.textContent || '').slice(0, 40))
        const heads = [...document.querySelectorAll('[data-country-head]')].map(hd => {
          const btn = [...hd.querySelectorAll('button')].find(b => b.textContent.trim() === 'Save')
          const name = hd.querySelector('p')
          const a = btn.getBoundingClientRect(), b = name.getBoundingClientRect()
          const overlap = !(a.left >= b.right || b.left >= a.right || a.top >= b.bottom || b.top >= a.bottom)
          return { code: hd.getAttribute('data-country-head'), overlap, text: hd.textContent }
        })
        const tabs = [...document.querySelectorAll('button')].map(b => b.textContent.trim())
        return {
          pageScrollsSideways: document.documentElement.scrollWidth > window.innerWidth,
          spill, heads, gridW: grid.getBoundingClientRect().width,
          lastTab: tabs.filter(x => /Trucks|Features|Domains|Outreach|Events|Screenshots|Templates|Countries/.test(x)).pop(),
          rows: [...grid.querySelectorAll('.sticky.left-0 p.text-sm')].map(p => p.textContent),
        }
      })
      t(`${tag}: no page errors`, errors.length === 0); if (errors.length) console.log('      ' + errors.slice(0, 3).join('\n      '))
      t(`${tag}: "Countries" is the LAST tab in the bar`, /Countries/.test(m.lastTab || ''))
      t(`${tag}: the page never scrolls sideways`, !m.pageScrollsSideways)
      t(`${tag}: nothing spills out of a grid cell`, m.spill.length === 0); if (m.spill.length) console.log('      spills: ' + m.spill.join(' | '))
      t(`${tag}: no Save button overlaps its country's name`, m.heads.every(x => !x.overlap))
      t(`${tag}: each header shows name and code, pill, trucks, last saved, Save`, m.heads.length === 2
        && /United Kingdom\s*GB/.test(m.heads[0].text) && /Switched on/.test(m.heads[0].text) && /14 trucks/.test(m.heads[0].text)
        && /Last saved/.test(m.heads[0].text) && /United States\s*US/.test(m.heads[1].text) && /Off/.test(m.heads[1].text) && /0 trucks/.test(m.heads[1].text))
      t(`${tag}: GB first, then by name`, m.heads.map(x => x.code).join() === 'GB,US')
      t(`${tag}: the US header says it can't be switched on`, /Can't switch on until the 6 plan prices are filled in/.test(m.heads[1].text))
      t(`${tag}: no competitor row`, !m.rows.some(r => /compet/i.test(r)))
      t(`${tag}: the rows, in the approved order`, m.rows.join('|') === [
        'Switched on', 'Country name', 'Starter, per month', 'Pro, per month', 'Max, per month', 'Pro, online orders included',
        'Max, online orders included', 'Our fee above that', 'Extra van', 'Online card payments', 'In-person card payments',
        'Extra for Tap to Pay', 'Which cards these rates are for', 'Menu prices include tax', "Card fee can go on the customer's bill",
        'Card fee limits', 'Card fee not allowed in', 'Online service fee allowed', 'Tipping on for new trucks', 'Currency',
        'Language style', 'Times', 'Dates', 'Week starts', 'Phone country code', 'Short name', 'Example phone number',
        'Phone number check', 'Addresses', 'Time zones offered at signup',
        'Default time zone', 'Allergen list', 'Support hours'].join('|'))
      if (!ok.includes(`${tag}: the rows, in the approved order`)) console.log('      rows: ' + m.rows.join(' | '))
      // The pinned header: scroll the box down and the header row is still at its top.
      const pinned = await page.evaluate(() => {
        const box = document.querySelector('[data-countries-grid]'); const head = document.querySelector('[data-country-head="GB"]')
        const before = head.getBoundingClientRect().top; box.scrollTop = 600
        return Math.abs(head.getBoundingClientRect().top - before) < 1 && box.scrollTop > 0
      })
      t(`${tag}: the country headers stay pinned while the grid scrolls`, pinned)
      await page.evaluate(() => { document.querySelector('[data-countries-grid]').scrollTop = 0 })
      // The US amber: the six empty plan price boxes are amber.
      const amber = await page.evaluate(() => [...document.querySelectorAll('[data-countries-grid] input')].filter(i => i.closest('.bg-amber-50') || i.classList.contains('bg-amber-50')).length)
      t(`${tag}: the US column's 6 empty plan prices show amber`, amber === 6)

      // ── the photographs ───────────────────────────────────────────────────────────────────────────
      await page.screenshot({ path: path.join(OUT, `countries-${tag}-page.png`) })
      await page.locator('[data-country-head="US"]').screenshot({ path: path.join(OUT, `countries-${tag}-us-column.png`) })
      // ⚠️ FOR THIS ONE PHOTO the box's height cap is lifted, so every row is in frame — and the page's own
      // pinned header and tab bar are un-pinned, or they would sit over the grid's top row in the capture.
      await page.evaluate(() => {
        const b = document.querySelector('[data-countries-grid]'); b.style.maxHeight = 'none'; b.style.overflow = 'visible'
        for (const el of document.querySelectorAll('.sticky')) if (!b.contains(el)) el.style.position = 'static'
      })
      await page.locator('[data-countries-grid]').screenshot({ path: path.join(OUT, `countries-${tag}-grid.png`) })
      await page.evaluate(() => {
        const b = document.querySelector('[data-countries-grid]'); b.style.maxHeight = ''; b.style.overflow = ''
        for (const el of document.querySelectorAll('.sticky')) if (!b.contains(el)) el.style.position = ''
        window.scrollTo(0, 0)
      })
      await page.getByRole('button', { name: '+ Add country' }).click()
      await page.waitForSelector('[data-add-country]')
      const form = await page.evaluate(() => {
        const f = document.querySelector('[data-add-country]'); const r = f.getBoundingClientRect()
        const kids = [...f.querySelectorAll('input,select,button')].map(e => e.getBoundingClientRect())
        return { inView: r.top >= 0 && r.bottom <= window.innerHeight, fits: kids.every(k => k.right <= r.right + 1 && k.left >= r.left - 1),
          sideways: document.documentElement.scrollWidth > window.innerWidth }
      })
      t(`${tag}: the Add country form opens in view, nothing cut off, no sideways scroll`, form.inView && form.fits && !form.sideways)
      await page.screenshot({ path: path.join(OUT, `countries-${tag}-add-form.png`) })
      await page.close()
    }
  } finally { await browser.close(); server.close() }

  for (const n of ok) console.log('  ✓ ' + n)
  for (const n of bad) console.log('  ✗ ' + n)
  console.log(bad.length ? `\n🔴 ${bad.length} CHECK(S) FAILED` : `\n✅ all ${ok.length} passed — screenshots in docs/screenshots/`)
  process.exit(bad.length ? 1 : 0)
})().catch(e => { console.error('🔴', e && e.stack || e); process.exit(1) })
