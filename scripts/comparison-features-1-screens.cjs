#!/usr/bin/env node
// scripts/comparison-features-1-screens.cjs — comparison-features-1 (29 October 2026, docs/comparison-features-1-report.md):
// Admin › Pricing check rendered for real in WebKit at 1512 and 390, FIXTURE DATA ONLY — the Feature list tab and the
// Customer preview's cost block for Germany.
//   node scripts/comparison-features-1-screens.cjs      (needs Playwright's WebKit; no build, no network, no database)
//
// The REAL tab (components/admin/PricingCheckTab.tsx) is bundled for the browser with esbuild; its one fetch
// (/api/admin/pricing-check) is answered with fixtures: the pricing research (data/pricing-research-1) as if imported, its
// German plans marked verified (so the cost block has rivals), the plan catalogue as its migrations seed it, the master
// feature list as shipped (data/comparison-features/features.json, with its en-GB words) and a few German answers. The CSS
// is app/globals.css compiled by the repo's own Tailwind (never older than the component).
// Writes docs/comparison-features-1/webkit-features-<w>.png and webkit-cost-block-<w>.png, and FAILS if the page scrolls
// sideways, logs an error, or a bar's two parts do not add up to its total.
// The German comparison page's admin view: scripts/compare-de-1-screens.cjs --comparison-features.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS script, like every scripts/*.cjs */
'use strict'
const fs = require('fs'); const os = require('os'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const { seedCatalog } = require('./_plans-catalog-fixture.cjs')
const OUT = path.join(REPO, 'docs/comparison-features-1')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 700)}` : '')) } }

async function css() {
  const postcss = (await import(path.join(REPO, 'node_modules/postcss/lib/postcss.mjs'))).default
  const tw = (await import(require.resolve('@tailwindcss/postcss', { paths: [REPO] }))).default
  const from = path.join(REPO, 'app/globals.css')
  const r = await postcss([tw({ base: REPO })]).process(fs.readFileSync(from, 'utf8').replace(/@import "leaflet[^"]*";/, ''), { from })
  return r.css
}

// ── fixtures ──
const camel = s => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
const rowOf = r => Object.fromEntries(Object.entries(r).map(([k, v]) => [camel(k), v]))
const research = f => JSON.parse(fs.readFileSync(path.join(REPO, 'data/pricing-research-1', f), 'utf8'))
function fixtureState() {
  const benchmarks = research('benchmarks.json').map(b => ({ ...rowOf(b), supersededAt: null, createdAt: '2026-10-23T09:00:00Z' }))
  const catalog = seedCatalog(REPO)
  const keys = catalog.plans.filter(p => p.isPublic && p.active).sort((a, b) => a.sortOrder - b.sortOrder).map(p => p.key)
  // Plan prices and card rates OBSERVED live (pricing-check-1): the euro row for DE, the UK's for GB.
  const LIVE = { DE: [2900, 400000, 6900, 150, 25, 'EUR'], GB: [2900, 400000, 6900, 150, 20, 'GBP'] }
  catalog.prices = Object.entries(LIVE).flatMap(([code, [pro, incl, unl]]) => [
    { planKey: keys[0], countryCode: code, monthlyMinor: 0, includedOnlineMinor: 0, feeBps: 99, extraVanMonthlyMinor: 0 },
    { planKey: keys[1], countryCode: code, monthlyMinor: pro, includedOnlineMinor: incl, feeBps: 99, extraVanMonthlyMinor: pro },
    { planKey: keys[2], countryCode: code, monthlyMinor: unl, includedOnlineMinor: null, feeBps: 0, extraVanMonthlyMinor: unl }])
  const countries = Object.entries(LIVE).map(([code, [, , , bps, fix, cur]]) => ({
    countryCode: code, name: code === 'DE' ? 'Germany' : 'United Kingdom', enabled: true, currency: cur, cardFeeOnlinePct: bps / 100, cardFeeOnlineFixedMinor: fix,
    iosAppAvailable: code === 'GB', androidAppAvailable: code === 'GB', comparisonStatus: code === 'DE' ? 'admin' : 'off', charges: { tips: false, serviceFee: false } }))
  const plans = research('plans.json').map(p => ({ ...rowOf(p), verifiedAt: p.country_code === 'DE' ? '2026-10-24T10:00:00Z' : null, verifiedBy: null, supersededAt: null, createdAt: '2026-10-23T09:00:00Z' }))
  const competitors = research('competitors.json').map(c => ({ ...rowOf(c), lifecycle: 'active', addedAsCandidate: false, checkUrls: [], checkIntervalDays: 90, nextCheckAt: null,
    lastCheckedAt: null, deepCheckedAt: null, checkRequestedAt: null, featuresVerifiedAt: '2026-10-24T10:00:00Z' }))
  const en = JSON.parse(fs.readFileSync(path.join(REPO, 'messages/ns/en-GB/comparison.json'), 'utf8')).features
  const file = JSON.parse(fs.readFileSync(path.join(REPO, 'data/comparison-features/features.json'), 'utf8')).features
  const features = file.map(f => ({ key: f.key, groupKey: f.group_key, sortOrder: f.sort_order, checked: f.checked, showScope: f.show_scope, showCountries: f.show_countries,
    hatchgrabSource: f.hatchgrab_source, labels: {}, explanations: {}, updatedAt: null, label: en[f.key].label, explain: en[f.key].explain, ours: en[f.key].ours ?? null }))
  features.find(f => f.key === 'asap').checked = false   // one unticked, as Admin might
  const deTools = [...new Set(plans.filter(p => p.countryCode === 'DE').map(p => p.competitorId))]
  const values = deTools.flatMap((cid, i) => [['preorder', i % 2 ? 'yes' : 'no', null], ['kds', 'partial', 'add-on, 10 € a month'], ['whatsapp', 'no', null]]
    .map(([k, v, note], j) => ({ id: `v-${i}-${j}`, competitorId: cid, featureKey: k, countryCode: null, value: v, note, quote: null, sourceUrl: 'https://example.test/' + k,
      checkedOn: '2026-10-24', verifiedAt: i === 0 ? null : '2026-10-24T10:00:00Z', verifiedBy: null, supersededAt: null, createdAt: null })))
  return { empty: false, importable: false, competitors, plans, benchmarks, catalog, countries, today: '2026-10-29', entries: [], entriesReady: true,
    features, featuresFromFile: false, values, imports: [] }
}

async function browserBundle(data) {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-cf1s-'))
  const entry = path.join(dir, 'entry.tsx')
  fs.writeFileSync(entry, `import { createRoot } from 'react-dom/client'
import PricingCheckTab from '@/components/admin/PricingCheckTab'
const DATA = ${JSON.stringify(data)}
window.fetch = async (u) => new Response(JSON.stringify(String(u).includes('competitor-check') ? { overview: { toReview: 0 } } : DATA), { status: 200, headers: { 'Content-Type': 'application/json' } })
createRoot(document.getElementById('root')!).render(<div className="mx-auto w-full max-w-[1800px] px-4 py-4 sm:px-8"><PricingCheckTab /></div>)
setTimeout(() => document.documentElement.setAttribute('data-ready', '1'), 400)`)
  const STUBS = {
    session: 'export async function nativeAuthHeader() { return {} }',
    nav: "export const useRouter = () => ({ push(){}, replace(){}, refresh(){} }); export const usePathname = () => '/admin'; export const useSearchParams = () => new URLSearchParams(); export const useParams = () => ({})",
  }
  const r = await esbuild.build({
    entryPoints: [entry], bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', target: 'es2020', logLevel: 'error',
    alias: { '@': REPO }, nodePaths: [path.join(REPO, 'node_modules')], define: { 'process.env.NODE_ENV': '"production"' },
    banner: { js: 'window.process = window.process || { env: {} };' },
    plugins: [{ name: 'stubs', setup(b) {
      b.onResolve({ filter: /^@\/lib\/native\/session$/ }, () => ({ path: 'session', namespace: 'stub' }))
      b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'nav', namespace: 'stub' }))
      b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: STUBS[a.path], loader: 'js' }))
    } }],
  })
  return r.outputFiles[0].text
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const [styles, js] = await Promise.all([css(), browserBundle(fixtureState())])
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style><style>body{background:#F9F9F9;margin:0;font-family:-apple-system,system-ui,sans-serif}</style></head><body><div id="root"></div><script>${js.replace(/<\/script>/g, '<\\/script>')}</script></body></html>`
  const pw = require(path.join(REPO, 'node_modules/playwright'))
  const browser = await pw.webkit.launch()
  try {
    for (const width of [1512, 390]) {
      const ctx = await browser.newContext({ viewport: { width, height: width > 500 ? 945 : 844 } })
      const page = await ctx.newPage()
      const errors = []; page.on('pageerror', e => errors.push(e.message))
      await page.setContent(html, { waitUntil: 'load' })
      await page.waitForSelector('html[data-ready]'); await page.waitForSelector('[data-sections]')
      // 1 · the Feature list tab
      await page.click('[data-section="features"]'); await page.waitForSelector('[data-feature-list]')
      const fl = await page.evaluate(() => ({ sideways: document.documentElement.scrollWidth > innerWidth + 1, groups: document.querySelectorAll('[data-feature-group]').length,
        rows: document.querySelectorAll('[data-feature]').length, badges: [...new Set([...document.querySelectorAll('[data-our-badge]')].map(e => e.getAttribute('data-our-badge')))],
        ticks: document.querySelectorAll('[data-check-tick]').length, scopes: document.querySelectorAll('[data-scope]').length, add: !!document.querySelector('[data-add-feature]') }))
      t(`webkit ${width} Feature list: six groups, 45 features, each with HatchGrab's badge, a Check tick and Show on website; Add feature; no sideways scroll`,
        !errors.length && !fl.sideways && fl.groups === 6 && fl.rows === 45 && fl.ticks === 45 && fl.scopes === 45 && fl.add && ['yes', 'no', 'coming soon'].every(b => fl.badges.includes(b)), { errors, ...fl })
      await page.screenshot({ path: path.join(OUT, `webkit-features-${width}.png`), fullPage: true })
      // 2 · the Customer preview's cost block (Germany)
      await page.click('[data-section="prices"]'); await page.waitForSelector('[data-country="DE"]')
      await page.click('[data-country="DE"]')
      await page.click('[role="tab"]:has-text("Customer preview")'); await page.waitForSelector('[data-cost-block]')
      const cb = await page.evaluate(() => ({ sideways: document.documentElement.scrollWidth > innerWidth + 1,
        bars: [...document.querySelectorAll('[data-cost-bar]')].map(b => ({ s: +b.getAttribute('data-software'), c: +b.getAttribute('data-card'), t: +b.getAttribute('data-total') })),
        lead: document.querySelector('[data-cost-lead]')?.textContent ?? '', summary: document.querySelector('[data-cost-summary]')?.textContent ?? '',
        legend: document.querySelector('[data-cost-legend]')?.textContent ?? '', foot: document.querySelector('[data-cost-footnote]')?.textContent ?? '' }))
      t(`webkit ${width} cost block: bars split into software fee + card fees adding up to the total; the lead, legend, summary and footnote in German`,
        !errors.length && !cb.sideways && cb.bars.length >= 2 && cb.bars.every(b => Math.abs(b.s + b.c - b.t) <= 1) && /^Für einen Truck mit .+ Online-Bestellungen pro Monat \(etwa .+ Bestellungen\)\./.test(cb.lead)
        && /Stripe-Satz für Deutschland/.test(cb.foot) && /Softwaregebühr/.test(cb.legend) && /Kartengebühren/.test(cb.legend) && /HatchGrab/.test(cb.summary) && /Durchschnittliche Bestellung/.test(cb.foot), { errors, ...cb })
      await page.locator('[data-preview]').screenshot({ path: path.join(OUT, `webkit-cost-block-${width}.png`) })
      await ctx.close()
    }
  } finally { await browser.close() }
  console.log(`\n${fail ? '🔴' : '✅'} comparison-features-1-screens: ${pass} passed, ${fail} failed — ${OUT}`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
