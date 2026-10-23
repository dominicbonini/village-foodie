#!/usr/bin/env node
// scripts/pricing-check-screenshots.cjs — Admin › Pricing check, rendered for real, photographed and measured
// (pricing-check-1, 23 October 2026).
//   node scripts/pricing-check-screenshots.cjs      (needs `npx next build` for the app CSS, and Playwright's Chromium and WebKit)
//
// The REAL admin page (app/admin/page.tsx, which mounts components/admin/PricingCheckTab.tsx) is bundled for a browser
// with esbuild and served from a tiny local server. Every /api/* call is answered by Playwright with FIXTURES — the
// research payload in data/pricing-research-1/*.json as if imported (two GB plans marked verified, so the badges and
// the Customer preview have something to show), the plan catalogue as its migrations seed it, and the plan prices and
// card rates OBSERVED live on 23 Oct 2026 (read-only). Nothing reaches a database or the network.
//
// Writes docs/pricing-check-1/<engine>-<width>-<view>.png at 1512 and 390 wide in Chromium and WebKit, and FAILS if the
// page scrolls sideways, a table spills out of its own box, or the page logs an error.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS script, like every scripts/*.cjs */

const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http')
const REPO = path.resolve(__dirname, '..')
const { seedCatalog } = require('./_plans-catalog-fixture.cjs')
const OUT = path.join(REPO, 'docs/pricing-check-1')
fs.mkdirSync(OUT, { recursive: true })

const ok = [], bad = []
const t = (name, cond, detail) => { (cond ? ok : bad).push(name); if (!cond && detail) console.log('      ' + detail) }

function appCss() {
  const root = path.join(REPO, '.next/static')
  if (!fs.existsSync(root)) throw new Error('no .next/static — run `npx next build` first')
  const files = []
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith('.css')) files.push(f) } }
  walk(root)
  const css = files.map(f => fs.readFileSync(f, 'utf8')).join('\n')
  if (!css.includes('16\\.5rem_minmax')) throw new Error('the compiled CSS predates the Pricing check tab — run `npx next build`')
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

// ── fixtures ──
const camel = s => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
const rowOf = r => Object.fromEntries(Object.entries(r).map(([k, v]) => [camel(k), v]))
const read = f => JSON.parse(fs.readFileSync(path.join(REPO, 'data/pricing-research-1', f), 'utf8'))
// Plan prices and online card rates OBSERVED live, 23 Oct 2026 (read-only): [pro, pro included, unlimited, card bps, card fixed].
const EUR_ROW = [2900, 400000, 6900, 150, 25]
const LIVE = {
  GB: [2900, 400000, 6900, 150, 20], GI: [2900, 400000, 6900, 150, 20], US: [2900, 400000, 6900, 290, 30],
  CA: [3900, 550000, 9900, 290, 30], AU: [3900, 550000, 9900, 165, 30], NZ: [4900, 700000, 11900, 265, 30],
  CH: [2700, 370000, 6500, 290, 30], LI: [2700, 370000, 6500, 150, 30], CZ: [69900, 10000000, 169000, 150, 650],
  DK: [21900, 3000000, 51900, 150, 180], HU: [1099000, 150000000, 2499000, 150, 8500], NO: [29900, 4200000, 72900, 240, 200],
  PL: [12900, 1750000, 29900, 150, 100], RO: [14900, 2150000, 36900, 150, 100], SE: [32900, 4500000, 76900, 150, 180],
  ...Object.fromEntries('AT BE BG CY DE EE ES FI GR HR IE IT LT LU LV MT NL PT SI SK'.split(' ').map(c => [c, EUR_ROW])),
}
function fixtureState({ empty = false } = {}) {
  const benchmarks = read('benchmarks.json').map(b => ({ ...rowOf(b), supersededAt: null, createdAt: '2026-10-23T09:00:00Z' }))
  const catalog = seedCatalog(REPO)
  const keys = catalog.plans.filter(p => p.isPublic && p.active).sort((a, b) => a.sortOrder - b.sortOrder).map(p => p.key)
  catalog.prices = Object.entries(LIVE).flatMap(([code, [pro, incl, unl]]) => [
    { planKey: keys[0], countryCode: code, monthlyMinor: 0, includedOnlineMinor: 0, feeBps: 99, extraVanMonthlyMinor: 0 },
    { planKey: keys[1], countryCode: code, monthlyMinor: pro, includedOnlineMinor: incl, feeBps: 99, extraVanMonthlyMinor: pro },
    { planKey: keys[2], countryCode: code, monthlyMinor: unl, includedOnlineMinor: null, feeBps: 0, extraVanMonthlyMinor: unl }])
  const cur = Object.fromEntries(benchmarks.map(b => [b.countryCode, b.currency]))
  const countries = Object.entries(LIVE).map(([code, [, , , bps, fix]]) => ({
    countryCode: code, name: new Intl.DisplayNames(['en-GB'], { type: 'region' }).of(code), enabled: true, currency: cur[code],
    cardFeeOnlinePct: bps / 100, cardFeeOnlineFixedMinor: fix }))
  const plans = read('plans.json').map(p => ({ ...rowOf(p), verifiedAt: null, verifiedBy: null, supersededAt: null, createdAt: '2026-10-23T09:00:00Z' }))
  const competitors = read('competitors.json').map(rowOf)
  const verifiedTools = new Set(competitors.filter(c => c.name === 'Aphelios' || c.name === 'Order Tiger').map(c => c.id))
  for (const p of plans) if (p.countryCode === 'GB' && verifiedTools.has(p.competitorId)) p.verifiedAt = '2026-10-23T10:00:00Z'
  if (empty) return { empty: true, importable: true, competitors: [], plans: [], benchmarks: [], catalog, countries, today: '2026-10-23' }
  return { empty: false, importable: false, competitors, plans, benchmarks, catalog, countries, today: '2026-10-23' }
}

;(async () => {
  const css = appCss()
  const js = await bundle(fs.mkdtempSync(path.join(os.tmpdir(), 'hg-pricing-check-')))
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/bundle.js')) { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(js) }
    const pub = path.join(REPO, 'public', decodeURIComponent(req.url.split('?')[0]))
    if (pub.startsWith(path.join(REPO, 'public') + path.sep) && fs.existsSync(pub) && fs.statSync(pub).isFile()) {
      const type = { '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }[path.extname(pub)] || 'application/octet-stream'
      res.writeHead(200, { 'content-type': type }); return res.end(fs.readFileSync(pub))
    }
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(html)
  })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}`
  const pw = require('playwright')
  const shots = []
  try {
    for (const engine of ['chromium', 'webkit']) {
      const browser = await pw[engine].launch()
      try {
        for (const [w, h] of [[1512, 945], [390, 844]]) {
          for (const mode of ['admin', 'preview', 'import']) {
            if (mode === 'import' && w !== 1512) continue
            const page = await browser.newPage({ viewport: { width: w, height: h } })
            const errors = []
            page.on('pageerror', e => errors.push(String(e)))
            page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
            const state = fixtureState({ empty: mode === 'import' })
            await page.route('**/api/**', route => {
              const u = new URL(route.request().url())
              const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
              if (u.pathname === '/api/admin/pricing-check') return json(state)
              if (u.pathname === '/api/admin') {
                const s = u.searchParams.get('section')
                if (s === 'check_admin') return json({ isAdmin: true })
                if (s === 'discovery') return json({ discoveryTrucks: [] })
                if (s === 'demo_cleanup') return json({ lastRun: null })
                return json({ trucks: [], operators: [], countrySettings: {}, plans: state.catalog })
              }
              if (u.pathname === '/api/auth/me') return json({ first_name: 'Dominic' })
              return json({})
            })
            await page.goto(`${base}/admin?tab=pricing`)
            const tag = `${engine}-${w}-${mode}`
            try { await page.waitForSelector(mode === 'import' ? '[data-import]' : '[data-detail] [data-country-header], [data-preview]', { timeout: 20000 }) }
            catch { throw new Error(`the tab never rendered (${tag}).\n  errors: ${errors.slice(0, 5).join('\n          ')}\n  page: ${(await page.evaluate(() => document.body.innerText.slice(0, 500)))}`) }
            if (mode === 'preview') {
              // GB: the fixture's two verified rivals, so the bars and the "What's included" table have something to show.
              await page.click('[data-country="GB"]')
              await page.getByRole('tab', { name: 'Customer preview' }).click()
              await page.waitForSelector('[data-preview]')
            }
            await page.waitForTimeout(300)
            const m = await page.evaluate(() => {
              const boxes = [...document.querySelectorAll('[data-pricing-check] .overflow-x-auto')]
              return {
                sideways: document.documentElement.scrollWidth > window.innerWidth + 1,
                wide: [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1 && !e.parentElement?.closest('.overflow-x-auto, .overflow-auto, .overflow-hidden, .overflow-y-auto'))
                  .slice(0, 6).map(e => `${e.tagName}.${(e.className || '').toString().slice(0, 60)} r=${Math.round(e.getBoundingClientRect().right)} "${(e.textContent || '').slice(0, 30)}"`),
                boxesContained: boxes.every(b => b.getBoundingClientRect().right <= window.innerWidth + 1),
                selected: document.querySelector('[data-country-header] p')?.textContent ?? '',
                lastTabVisible: (() => { const b = [...document.querySelectorAll('button')].find(x => /Pricing check/.test(x.textContent || '')); if (!b) return false
                  const r = b.getBoundingClientRect(), bar = b.parentElement.getBoundingClientRect(); return r.right <= bar.right + 1 })(),
                bars: document.querySelectorAll('[data-preview] li').length,
                verdict: document.querySelector('[data-verdict-box]')?.textContent ?? '',
                cards: [...document.querySelectorAll('[data-win-card]')].map(c => c.textContent),
                listBesideDetail: (() => {
                  const l = document.querySelector('[data-country-list]')?.getBoundingClientRect(), d = document.querySelector('[data-detail]')?.getBoundingClientRect()
                  return l && d ? d.left >= l.right - 1 : null
                })(),
              }
            })
            t(`${tag}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '))
            t(`${tag}: the page never scrolls sideways`, !m.sideways, m.wide.join('\n      '))
            t(`${tag}: every table box fits the screen (its table scrolls inside it)`, m.boxesContained)
            if (w > 1000) t(`${tag}: the "Pricing check" tab is in view in the tab bar`, m.lastTabVisible)
            if (mode === 'preview') t(`${tag}: GB preview shows our bar and the two verified rivals`, m.bars === 3, String(m.bars))
            if (mode === 'admin') {
              t(`${tag}: opens on the first live country by name, Australia`, /Australia/.test(m.selected), m.selected)
              t(`${tag}: ${w > 1000 ? 'list beside the country' : 'list stacked above the country'}`, w > 1000 ? m.listBesideDetail === true : m.listBesideDetail === false)
            }
            const file = `${tag}.png`
            await page.screenshot({ path: path.join(OUT, file), fullPage: mode !== 'import' })
            shots.push(file)
            // GB, medium: the brief's example — and the price that would win.
            if (mode === 'admin') {
              await page.click('[data-country="GB"]')
              await page.waitForTimeout(200)
              const gb = await page.evaluate(() => [...document.querySelectorAll('[data-win-card]')].map(c => c.textContent))
              t(`${tag}: GB medium cards read £29 / £39 / £59`, gb.length === 3 && /£29/.test(gb[0]) && /£39/.test(gb[1]) && /£59/.test(gb[2]), gb.join(' | '))
              await page.screenshot({ path: path.join(OUT, `${engine}-${w}-gb.png`), fullPage: true })
              shots.push(`${engine}-${w}-gb.png`)
            }
            await page.close()
          }
        }
      } finally { await browser.close() }
    }
  } finally { server.close() }
  fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify({ shots, ok, bad }, null, 1))
  console.log(`\npricing-check-screenshots: ${ok.length} passed, ${bad.length} failed — ${shots.length} PNGs in docs/pricing-check-1/`)
  for (const b of bad) console.log('  ✗ ' + b)
  process.exit(bad.length ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
