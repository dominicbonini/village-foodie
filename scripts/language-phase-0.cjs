#!/usr/bin/env node
// scripts/language-phase-0.cjs — Language Phase 0 (docs/language-phase-0-report.md): next-intl in, keys separated
// from labels, one date-word path, no visible change.
//
//   node scripts/language-phase-0.cjs                    compare against the committed BEFORE snapshot
//   node scripts/language-phase-0.cjs --capture <file>   snapshot the current code's answers (gzipped JSON)
//
// ── 🔴 THE METHOD ─────────────────────────────────────────────────────────────────────────────────────────
// BEFORE was captured on the checkpoint 234b6a2, before any edit of this phase. It holds, for GB AND US:
//   1. every date-word output this phase rewires (scripts/_language-date-fixtures.ts: ~45,000 answers over
//      every day of 2026, four time settings, both countries, every poster style) — computed on the SERVER
//      (Node) and in the BROWSER (the same fixtures bundled for the browser, run in Chromium and WebKit);
//   2. every output whose code this phase moves from "English label as key" to "id as key": the plan
//      tables and their cells, the price mask, the plans PDF, the landing feature table, the landing and
//      compare pages, both footers, the demo kitchen assumptions, the cook-time default category, ticket
//      bytes for walk-up orders, and every contact-form link.
// AFTER, each is byte-identical. The i18n framework's own checks live in scripts/_language-phase-0-after.cjs.
// (Reports, the CSVs, the dashboard, KDS, Manage and every email stay pinned by money-sweep-parity,
// phase3-screens, order-charges and the rest of the sweep, which this phase must leave passing unchanged.)

const fs = require('fs'); const path = require('path'); const zlib = require('zlib')
// ── RE-PINNED FOR LANGUAGE PHASE 2 (docs/language-phase-2-report.md) ─────────────────────────────────────────
// This harness proves that separating keys from labels was invisible. Phase 2 then changes words on purpose (en-US
// is filled; the wrong-English fixes), proven by scripts/language-phase-2.cjs — so the comparison renders with the
// words as they stood before Phase 2 (HG_MESSAGES_FROZEN, scripts/_lp2-frozen.cjs), and asserts what it asserted.
if (!process.argv.includes('--capture') && !('HG_MESSAGES_FROZEN' in process.env)) process.env.HG_MESSAGES_FROZEN = 'scripts/fixtures/language-phase-2-messages-before.json'
const kit = require('./_render-kit.cjs')({ cacheTag: 'language-phase-0' })
const { REPO } = kit
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const argv = process.argv.slice(2)
const CAPTURE = argv.includes('--capture') ? argv[argv.indexOf('--capture') + 1] : null
const BEFORE_FILE = 'scripts/fixtures/language-phase-0-before.json.gz'
const SEEDS = require('./_country-settings-gb.cjs')
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
const AFTER_CODE = fs.existsSync(path.join(REPO, 'lib/i18n'))
const NOW = '2026-10-14T11:00:00.000Z'

let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${String(detail).slice(0, 600)}` : ''}`) } }
const head = s => console.log(`\n── ${s}`)

const GB = SEEDS.gbFromSeed()
const US_ON = { ...SEEDS.usFromSeed(), enabled: true, starterMonthlyMinor: 0, proMonthlyMinor: 3900, maxMonthlyMinor: 6900, proAllowanceMinor: 200000, maxAllowanceMinor: 300000, platformFeePct: 0.99 }
const STUBS = {
  'next/font/google': ['Archivo', 'Public_Sans', 'Courier_Prime', 'Geist', 'Geist_Mono'].map(n => `export const ${n} = () => ({ variable: 'font-${n}', className: 'font-${n}', style: {} })`).join('\n'),
  'next/headers': `
    export async function headers() { return { get: k => (k === 'host' ? 'www.hatchgrab.com' : null), has: () => false } }
    export async function cookies() { return { get: () => undefined, has: () => false, getAll: () => [] } }`,
}

/* ── 1 · date words: server ── */
async function serverDates() {
  const m = await kit.bundle('lp0-dates', "export { runDateFixtures } from '@/scripts/_language-date-fixtures'")
  kit.setNow(NOW); kit.setDeviceTz('Europe/London')
  return m.runDateFixtures()
}

/* ── 1 · date words: the browser bundle, run in Chromium and WebKit ── */
async function browserBundle() {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const res = await esbuild.build({
    stdin: { contents: "import { runDateFixtures } from '@/scripts/_language-date-fixtures'\nglobalThis.__runDateFixtures = runDateFixtures", resolveDir: REPO, loader: 'ts' },
    bundle: true, write: false, platform: 'browser', format: 'iife', target: 'es2020', logLevel: 'silent',
    tsconfig: path.join(REPO, 'tsconfig.json'),
    // ⚠️ RE-PINNED (Language Phase 1d Part 2): the poster's caption words (CANCELLED / CANCELED, "Week commencing") are
    // messages now, read in the truck's locale. The browser bundle must read the SAME frozen catalogue as the server side
    // (scripts/_lp2-frozen.cjs, the switch the render kit already applies), or a US answer would carry today's US words
    // in the browser and the frozen words on the server.
    plugins: [{ name: 'lp2-frozen', setup(b) { b.onResolve({ filter: /(^|\/)messages\/(ns\/)?en-(GB|US)(\/[A-Za-z0-9]+)?\.json$/ }, a => { const abs = require('./_lp2-frozen.cjs').resolveMessages(a.path); return abs ? { path: abs } : undefined }) } }],
  })
  return res.outputFiles[0].text
}
async function browserDates(engine) {
  const pw = require(path.join(REPO, 'node_modules/playwright'))
  const code = await browserBundle()
  const browser = await pw[engine].launch()
  try {
    const ctx = await browser.newContext({ timezoneId: 'Europe/London', locale: 'en-GB' })
    const page = await ctx.newPage()
    await page.clock.setFixedTime(new Date(NOW))
    await page.setContent('<!doctype html><html><body></body></html>')
    await page.addScriptTag({ content: code })
    const json = await page.evaluate(() => JSON.stringify(globalThis.__runDateFixtures()))
    return { result: JSON.parse(json), ua: await page.evaluate(() => navigator.userAgent) }
  } finally { await browser.close() }
}

/* ── 2 · outputs whose code moves from label-as-key to id-as-key ── */
async function keyViews() {
  const m = await kit.bundle('lp0-keys', [
    "export * as PF from '@/lib/plan-features'", "export * as LT from '@/lib/landing-table'", "export * as PR from '@/lib/pricing'",
    "export * as PDF from '@/lib/plans-pdf'", "export * as FE from '@/lib/features'", "export * as DA from '@/lib/demo-assumptions'",
    "export * as HE from '@/components/dashboard/helpers'", "export * as TK from '@/lib/printing/ticket'",
    "export { FeatureComparison } from '@/components/landing/FeatureComparison'",
    "export { default as CostComparison } from '@/app/compare/CostComparison'",
    "export { default as Footer } from '@/components/Footer'", "export { DemoModalProvider } from '@/components/landing/DemoUpload'", "export { LandingFooter } from '@/components/landing/LandingFooter'",
  ].join('\n'), { stubs: STUBS })
  kit.setNow(NOW)
  const out = {}
  for (const [k, s] of [['GB', GB], ['US', US_ON]]) {
    const v = out[k] = {}
    v.planPrices = m.PF.planPrices(s)
    v.planPriceLabels = m.LT.planPriceLabels(s)
    v.planAllowances = m.PF.planAllowances(s)
    v.transactionRows = m.PF.transactionRows(s)
    v.footnotes = m.PF.footnotes(s)
    v.sections = m.PF.FEATURE_SECTIONS.map(sec => ({
      title: sec.title,
      visible: m.LT.visibleRows(sec).map(r => r.name),
      rows: sec.rows.map(r => ({ name: r.name, shown: m.LT.rowName(r), detail: m.LT.rowDetail(r), trial: m.LT.trialFeatureValue(r), cells: m.LT.TABLE_PLANS.map(p => m.LT.cellLabel(p === 'trial' ? m.LT.trialFeatureValue(r) : r[p])) })),
    }))
    const words = [...Object.values(v.planPrices), ...Object.values(v.planPriceLabels), ...v.transactionRows.flatMap(r => Object.values(r.cells ?? {}))]
    v.mask = words.map(w => [w, m.PR.maskPrice(w), m.PR.maskPriceFor(w, false), m.PR.maskPriceFor(w, true)])
    v.pdfHtml = m.PDF.buildPlansPdfHtml(s)
    v.featureComparison = kit.renderStatic(kit.h(m.FeatureComparison, { settings: s }))
    v.costComparison = kit.renderStatic(kit.h(m.DemoModalProvider, {}, kit.h(m.CostComparison, { settings: s })))
  }
  out.parity = m.PF.findPlanParityViolations()
  out.footer = kit.renderStatic(kit.h(m.Footer, { onOpenTally() {} }))
  out.landingFooter = kit.renderStatic(kit.h(m.LandingFooter, {}))
  const CATS = [['Mains', 'Sides', 'Drinks'], ['Burgers', 'Dips & Sauces', 'Desserts'], ['Pizza', 'Specials', 'Other'], ['Specials', 'Other'], ['Wraps & Sandwiches', 'Starters'], ['Weird', 'Other']]
  out.demoAssumptions = CATS.map(cats => m.DA.buildDemoAssumptions(cats, cats.flatMap((c, i) => Array.from({ length: i + 1 }, () => ({ category: c })))))
  const catConfigs = { mains: { secs: 300, batch: 4 }, pizza: { secs: 240, batch: 2 }, sides: { secs: 0, batch: 0 } }
  out.cookSecs = [[{ name: 'A', quantity: 2 }], [{ name: 'B', quantity: 5 }], [{ name: 'Unknown', quantity: 3 }]].map(items => m.HE.getOrderCookSecs(items, { A: 'Pizza', B: 'Sides' }, catConfigs))
  out.tickets = {}
  for (const [cc, money] of [['GB', { currency: 'GBP', locale: 'en-GB' }], ['US', { currency: 'USD', locale: 'en-US' }]]) for (const name of ['', 'Walk-up', 'Sam']) for (const w of [58, 80]) {
    out.tickets[`${cc}|${name || '(none)'}|${w}`] = Array.from(m.TK.renderTicket({ id: '17', customer_name: name, collection_time: '18:45', items: [{ name: 'Margherita', quantity: 2, unit_price: 9.5 }], total: 19, paymentStatus: 'unpaid', money }, { paper_width: w })).join(',')
  }
  // Every /contact?topic= link, as the source writes it today (AFTER builds the same strings from ids).
  out.contactLinks = {}
  for (const f of ['components/Footer.tsx', 'components/landing/LandingFooter.tsx', 'app/compare/CostComparison.tsx', 'app/trucks/[slug]/TruckClient.tsx', 'app/venues/[slug]/VenueClient.tsx']) {
    out.contactLinks[f] = (read(f).match(/\/contact\?topic=[^"`\s&]+/g) || [])
  }
  return out
}

async function landingViews() {
  const m = await kit.bundle('lp0-landing', "export { default as Page } from '@/app/landing/page'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'", { stubs: STUBS })
  const { prerenderToNodeStream } = require(path.join(REPO, 'node_modules/react-dom/static'))
  const out = {}
  for (const [k, q] of [['GB', null], ['US', 'US']]) {
    globalThis.__harnessDb = kit.fakeDb({ country_settings: [snake(GB), snake(US_ON)] }); m.clearCountrySettingsCache?.()
    try {
      out[k] = await kit.quietAsync(async () => {
        const { prelude } = await prerenderToNodeStream(kit.h(m.Page, { searchParams: Promise.resolve(q ? { country: q } : {}) }))
        let s = ''; for await (const c of prelude) s += c; return s
      })
    } finally { delete globalThis.__harnessDb }
  }
  return out
}

function diffJson(a, b, p = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return null
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = diffJson(a[k], b[k], `${p}.${k}`); if (d) return d }
  }
  if (typeof a === 'string' && typeof b === 'string') {
    let i = 0; while (i < a.length && a[i] === b[i]) i++
    return `${p} @${i}: BEFORE …${JSON.stringify(a.slice(Math.max(0, i - 60), i + 80))} · AFTER …${JSON.stringify(b.slice(Math.max(0, i - 60), i + 80))}`
  }
  return `${p}: BEFORE ${JSON.stringify(a)?.slice(0, 220)} · AFTER ${JSON.stringify(b)?.slice(0, 220)}`
}

async function main() {
  const server = await serverDates()
  const chromium = await browserDates('chromium')
  const webkit = await browserDates('webkit')
  const keys = await keyViews()
  const landing = await landingViews()
  const got = { dates: { server, chromium: chromium.result, webkit: webkit.result }, keys, landing }
  if (CAPTURE) {
    fs.writeFileSync(path.resolve(REPO, CAPTURE), zlib.gzipSync(JSON.stringify({ captured_on: 'checkpoint 234b6a2, before any edit of this phase', engines: { chromium: chromium.ua, webkit: webkit.ua }, views: got })))
    const n = Object.values(server).reduce((s, sec) => s + Object.keys(sec).length, 0)
    console.log(`  date answers per engine: ${n}`)
    console.log(`  server = chromium: ${JSON.stringify(server) === JSON.stringify(chromium.result)} · server = webkit: ${JSON.stringify(server) === JSON.stringify(webkit.result)}`)
    console.log(`captured → ${CAPTURE}`)
    return
  }
  const before = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(REPO, BEFORE_FILE)))).views

  head('1 · date words — every answer byte-identical to BEFORE, on the server and in the browser bundle')
  for (const engine of ['server', 'chromium', 'webkit']) {
    for (const sec of Object.keys(before.dates[engine])) {
      const d = diffJson(before.dates[engine][sec], got.dates[engine][sec])
      t(`${engine} · ${sec} (${Object.keys(before.dates[engine][sec]).length} answers)`, d === null, d)
    }
  }
  t('the browser bundle answers exactly what the server answers (Chromium)', JSON.stringify(got.dates.chromium) === JSON.stringify(got.dates.server), diffJson(got.dates.server, got.dates.chromium))
  t('the browser bundle answers exactly what the server answers (WebKit)', JSON.stringify(got.dates.webkit) === JSON.stringify(got.dates.server), diffJson(got.dates.server, got.dates.webkit))

  head('2 · keys separated from labels — every output byte-identical to BEFORE (GB and US)')
  for (const k of Object.keys(before.keys)) {
    if (k === 'contactLinks') continue   // the source changes by design; §2b of the AFTER module rebuilds the same links from ids
    if (k === 'GB' || k === 'US') {
      for (const kk of Object.keys(before.keys[k])) { const d = diffJson(before.keys[k][kk], got.keys[k][kk]); t(`${k} · ${kk}`, d === null, d) }
    } else { const d = diffJson(before.keys[k], got.keys[k]); t(k, d === null, d) }
  }
  for (const k of Object.keys(before.landing)) { const d = diffJson(before.landing[k], got.landing[k]); t(`landing page (${k}) rendered HTML`, d === null, d) }

  if (AFTER_CODE) await require('./_language-phase-0-after.cjs')({ kit, t, head, read, REPO, before, got, STUBS, GB, US_ON, snake })
  console.log(`\n${fail ? '✗' : '✓'} language-phase-0: ${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
}
main().catch(e => { console.error(e); process.exit(1) })
