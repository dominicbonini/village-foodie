#!/usr/bin/env node
// scripts/competitor-check-1-screens.cjs — competitor-check-1 (25 October 2026, docs/competitor-check-1-report.md):
// Admin › Pricing check › Automatic checks, rendered for real in WebKit and Chromium at 1512 and 390, FIXTURE DATA ONLY.
//   node scripts/competitor-check-1-screens.cjs      (needs Playwright's Chromium and WebKit; no build, no network, no API)
//
// The REAL component (components/admin/AutomaticChecks.tsx) is bundled for the browser with esbuild; its one fetch
// (/api/admin/competitor-check) is answered with fixtures — findings produced by the REAL checker
// (lib/competitor-check/checker.ts) over scripts/_competitor-check-1-fixtures.cjs's hand-built responses, plus a blocked
// page, a gone page, a new plan and a candidate's classification. The CSS is app/globals.css compiled by the repo's own
// Tailwind (so it is never older than the component). Writes docs/competitor-check-1/<engine>-<width>.png and FAILS if
// the page scrolls sideways or the findings table spills out of its own box.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS script, like every scripts/*.cjs */
'use strict'
const fs = require('fs'); const os = require('os'); const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'competitor-check-1-screens' })
const FX = require('./_competitor-check-1-fixtures.cjs')
const { REPO } = kit
const OUT = path.join(REPO, 'docs/competitor-check-1')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 600)}` : '')) } }

async function css() {
  const postcss = (await import(path.join(REPO, 'node_modules/postcss/lib/postcss.mjs'))).default
  const tw = (await import(require.resolve('@tailwindcss/postcss', { paths: [REPO] }))).default
  const from = path.join(REPO, 'app/globals.css')
  const r = await postcss([tw({ base: REPO })]).process(fs.readFileSync(from, 'utf8').replace(/@import "leaflet[^"]*";/, ''), { from })
  return r.css
}

async function fixtureData() {
  const L = await kit.bundle('cc1s-lib', "export { runChecker } from '@/lib/competitor-check/checker'\nexport { overviewOf } from '@/lib/competitor-check/overview'")
  const NOW = new Date('2026-10-26T02:10:00Z')
  const comps = Array.from({ length: 6 }, (_, i) => FX.competitor(i + 1))
  const store = FX.memoryCheckerStore({ settings: () => FX.SETTINGS({ deepRequestedAt: '2026-10-25T10:00:00Z' }), competitors: comps })
  const script = n => ({ '001': 'ok:29', '002': 'madeup', '003': 'ok:49', '004': 'ok:29', '005': 'injection', '006': 'ok:35' })[n.slice(-3)]
  await L.runChecker({ api: FX.fakeApi(script), store, now: () => NOW, log: () => {}, dryRun: false }, { mode: 'deep', trigger: 'manual', limit: 6 })
  const extra = [
    { competitor_id: 'c-004', field: 'url', outcome: 'blocked', source_url: 'https://tt4.example/preise', found: {}, stored_value: 'https://tt4.example/preise', found_value: 'HTTP 403', quote: null, quote_en: null, quote_in_page: false, second_check: 'not_run' },
    { competitor_id: 'c-006', field: 'url', outcome: 'page_gone', source_url: 'https://tt6.example/agb', found: {}, stored_value: 'https://tt6.example/agb', found_value: 'not found (404)', quote: null, quote_en: null, quote_in_page: false, second_check: 'not_run' },
    { competitor_id: 'c-001', field: 'plan', outcome: 'new_plan', country_code: 'DE', source_url: 'https://tt1.example/preise', found: { plan_name: 'Unlimited', amount: 79, currency: 'EUR', period: 'month', vat: 'excl' }, stored_value: null, found_value: '79 € pro Monat zzgl. MwSt.', quote: 'Unlimited: 79 € pro Monat zzgl. MwSt.', quote_en: 'Unlimited: €79 per month plus VAT.', quote_in_page: true, second_check: 'confirmed' },
    { competitor_id: 'c-007', field: 'classification', outcome: 'classification', source_url: 'https://gustoco.example/food-truck-bestellsystem/', found: { classification: 'food_truck_ordering' }, stored_value: 'candidate', found_value: 'food_truck_ordering', quote: 'Das Bestellsystem für Ihren Foodtruck: Gäste bestellen vorab per Handy.', quote_en: 'The ordering system for your food truck: guests order ahead by phone.', quote_in_page: true, second_check: 'confirmed' },
  ].map(f => ({ run_id: 'run-1', plan_id: null, country_code: null, second_value: null, second_quote: null, review_status: 'pending', ...f }))
  const findings = [...store.findings, ...extra].map((f, i) => ({ ...f, id: `f-${i}`, created_at: NOW.toISOString() }))
  const settings = { paused: false, daily_cap_usd: 8, monthly_cap_usd: 90, deep_per_day: 15, check_interval_days: 90, deep_requested_at: '2026-10-25T10:00:00Z', extractor_model: 'claude-sonnet-5-5', verifier_model: 'claude-sonnet-5-5', prices: FX.PRICES }
  // A plausible list behind the tiles: 132 competitors and 70 candidates, 6 deep-checked so far, routine dates spread.
  const competitors = [
    ...Array.from({ length: 132 }, (_, i) => ({ id: `c-${String(i + 1).padStart(3, '0')}`, name: i < 6 ? `Testtruck Ordering ${String(i + 1).padStart(3, '0')}` : `Competitor ${i + 1}`, lifecycle: 'active', check_urls: ['https://x.example'], check_interval_days: 90,
      next_check_at: new Date(Date.UTC(2026, 9, 27 + Math.floor(i / 1.5))).toISOString().slice(0, 10), deep_checked_at: i < 6 ? '2026-10-26T02:20:00Z' : null })),
    ...Array.from({ length: 70 }, (_, i) => ({ id: `cand-${i}`, name: `Candidate ${i}`, lifecycle: 'candidate', check_urls: ['https://y.example'], check_interval_days: 90, next_check_at: null, deep_checked_at: null })),
  ]
  competitors[6] = { ...competitors[6], id: 'c-007', name: 'Gustoco (candidate)', lifecycle: 'candidate' }
  const runs = [store.runs[0], { id: 'run-0', mode: 'routine', trigger: 'schedule', started_at: '2026-10-25T02:10:00Z', competitors_checked: 2, cost_usd: 0.31, stopped_reason: 'done' },
    { id: 'run-00', mode: 'deep', trigger: 'manual', started_at: '2026-10-24T18:02:00Z', competitors_checked: 3, cost_usd: 2.14, stopped_reason: 'daily_cap' }]
  return { settings, runs, findings, today: '2026-10-26', competitors: competitors.map(c => ({ id: c.id, name: c.name, lifecycle: c.lifecycle })),
    overview: L.overviewOf({ settings, competitors, runs, findings, today: '2026-10-26' }) }
}

async function browserBundle(data) {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-cc1s-'))
  const entry = path.join(dir, 'entry.tsx')
  fs.writeFileSync(entry, `import { createRoot } from 'react-dom/client'
import AutomaticChecks from '@/components/admin/AutomaticChecks'
const DATA = ${JSON.stringify(data)}
window.fetch = async () => new Response(JSON.stringify(DATA), { status: 200, headers: { 'Content-Type': 'application/json' } })
createRoot(document.getElementById('root')!).render(<div className="mx-auto w-full max-w-[1800px] px-4 py-4 sm:px-8"><AutomaticChecks /></div>)
setTimeout(() => document.documentElement.setAttribute('data-ready', '1'), 300)`)
  const r = await esbuild.build({
    entryPoints: [entry], bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', target: 'es2020', logLevel: 'error',
    alias: { '@': REPO }, nodePaths: [path.join(REPO, 'node_modules')], define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'stubs', setup(b) {
      b.onResolve({ filter: /^@\/lib\/native\/session$/ }, () => ({ path: 'session', namespace: 'stub' }))
      b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export async function nativeAuthHeader() { return {} }', loader: 'js' }))
    } }],
  })
  return r.outputFiles[0].text
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const [styles, data] = await Promise.all([css(), fixtureData()])
  const js = await browserBundle(data)
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style><style>body{background:#F9F9F9;margin:0;font-family:-apple-system,system-ui,sans-serif}</style></head><body><div id="root"></div><script>${js.replace(/<\/script>/g, '<\\/script>')}</script></body></html>`
  const pw = require(path.join(REPO, 'node_modules/playwright'))
  for (const engine of ['webkit', 'chromium']) {
    const browser = await pw[engine].launch()
    try {
      for (const width of [1512, 390]) {
        const ctx = await browser.newContext({ viewport: { width, height: width > 500 ? 945 : 844 } })
        const page = await ctx.newPage()
        const errors = []; page.on('pageerror', e => errors.push(e.message))
        await page.setContent(html, { waitUntil: 'load' })
        await page.waitForSelector('html[data-ready]'); await page.waitForSelector('[data-findings]')
        const m = await page.evaluate(() => {
          const box = document.querySelector('[data-findings] .overflow-x-auto')
          const table = box && box.querySelector('table')
          return { sideways: document.documentElement.scrollWidth > innerWidth + 1, boxScrolls: box ? box.scrollWidth > box.clientWidth + 1 : null,
            spills: table ? table.getBoundingClientRect().width > innerWidth && !box : null, rows: document.querySelectorAll('[data-finding]').length,
            tiles: document.querySelectorAll('[data-tile]').length, text: document.body.innerText }
        })
        t(`${engine} ${width}: no page error; four tiles; findings rows`, !errors.length && m.tiles === 4 && m.rows >= 5, { errors, tiles: m.tiles, rows: m.rows })
        t(`${engine} ${width}: the page never scrolls sideways${width === 390 ? '; the findings table scrolls inside its own box' : ''}`, !m.sideways && (width > 500 || m.boxScrolls === true), m)
        t(`${engine} ${width}: "Couldn't confirm", "Confirmed" chips and the unchanged footer show`, /Couldn.t confirm/.test(m.text) && /confirmed unchanged by both checks/.test(m.text))
        await page.screenshot({ path: path.join(OUT, `${engine}-${width}.png`), fullPage: true })
        await ctx.close()
      }
    } finally { await browser.close() }
  }
  console.log(`\n${fail ? '🔴' : '✅'} competitor-check-1-screens: ${pass} passed, ${fail} failed — ${OUT}`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
