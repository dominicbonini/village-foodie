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
  // ⚠️ europe-languages-2 (23 October 2026): + Noto_Sans — app/layout.tsx's Greek / Cyrillic fallback.
  'next/font/google': ['Archivo', 'Public_Sans', 'Courier_Prime', 'Geist', 'Geist_Mono', 'Noto_Sans'].map(n => `export const ${n} = () => ({ variable: 'font-${n}', className: 'font-${n}', style: {} })`).join('\n'),
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
// ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): lib/legacy-pricing-display.ts and
// components/landing/FeatureComparison.tsx are DELETED (docs/pricing-pages-report.md). The views they produced (plan
// prices / labels / allowances, transaction rows, footnotes, sections, the price mask over their words, the landing
// feature table) have no producer any more: §2 records each as RETIRED (the file gone, the view not rendered) — the one
// plan table that replaced them is proven by scripts/pricing-pages.cjs. The plans PDF takes the plan catalogue
// (buildPlansPdfHtml(settings, catalog)) and /compare's calculator a `catalog` prop: both are rendered on the migration's
// own seed (scripts/_plans-catalog-fixture.cjs) and compared through Stage B's scoped named change (scripts/_lp-stage-b.cjs).
const LEGACY_DISPLAY = fs.existsSync(path.join(REPO, 'lib/legacy-pricing-display.ts'))
const STAGE_B = require('./_lp-stage-b.cjs')
const STAGE_B_RETIRED = ['planPrices', 'planPriceLabels', 'planAllowances', 'transactionRows', 'footnotes', 'sections', 'mask', 'featureComparison']
const STAGE_B_SCOPED = { pdfHtml: STAGE_B.plansPdf, costComparison: STAGE_B.calcProof }
async function keyViews() {
  const m = await kit.bundle('lp0-keys', [
    // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): lib/plan-features.ts and lib/landing-table.ts are deleted;
    // their content moved, unchanged and frozen, into lib/legacy-pricing-display.ts — both handles read that one file.
    ...(LEGACY_DISPLAY ? ["export * as PF from '@/lib/legacy-pricing-display'", "export * as LT from '@/lib/legacy-pricing-display'", "export { FeatureComparison } from '@/components/landing/FeatureComparison'"] : ["export * as FT from '@/lib/feature-table'"]),
    "export * as PR from '@/lib/pricing'",
    "export * as PDF from '@/lib/plans-pdf'", "export * as FE from '@/lib/features'", "export * as DA from '@/lib/demo-assumptions'",
    "export * as HE from '@/components/dashboard/helpers'", "export * as TK from '@/lib/printing/ticket'",
    "export { default as CostComparison } from '@/app/compare/CostComparison'",
    "export { default as Footer } from '@/components/Footer'", "export { DemoModalProvider } from '@/components/landing/DemoUpload'", "export { LandingFooter } from '@/components/landing/LandingFooter'",
  ].join('\n'), { stubs: STUBS })
  kit.setNow(NOW)
  const out = {}
  const catalog = STAGE_B.catalog()
  for (const [k, s] of [['GB', GB], ['US', US_ON]]) {
    const v = out[k] = {}
    if (LEGACY_DISPLAY) {
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
      v.featureComparison = kit.renderStatic(kit.h(m.FeatureComparison, { settings: s }))
    }
    v.pdfHtml = LEGACY_DISPLAY ? m.PDF.buildPlansPdfHtml(s) : m.PDF.buildPlansPdfHtml(s, catalog)
    v.costComparison = kit.renderStatic(kit.h(m.DemoModalProvider, {}, kit.h(m.CostComparison, LEGACY_DISPLAY ? { settings: s } : { settings: s, catalog })))
  }
  // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): findPlanParityViolations (the tier cells vs the tiered
  // gates) is deleted with the tiered gates. Its premise is replaced by the new state, recorded here and checked in §2:
  // the frozen display exports no drift guard, and every plan-table row that is a Feature is gated by override only.
  out.parity = {
    // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): the frozen display is deleted — no drift guard can exist in it.
    guardGone: LEGACY_DISPLAY ? !('findPlanParityViolations' in m.PF) && !('ROW_FEATURE_MAP' in m.PF) : !fs.existsSync(path.join(REPO, 'lib/legacy-pricing-display.ts')),
    // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): canAccess takes a REQUIRED third argument, the truck's
    // effective-plan switch. The override-only premise is asserted under a plan that has every feature ON (`on`), and two
    // more answers are recorded under a plan with the feature OFF (`off`): no override → denied, override true → allowed.
    // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): the plan table's rows are lib/feature-table.ts FEATURE_TABLE now;
    // a row's gate is its `feature` (one Feature may gate two rows — each Feature once).
    overrideOnly: (LEGACY_DISPLAY ? m.PF.FEATURE_SECTIONS.flatMap(sec => sec.rows).filter(r => typeof r.id === 'string') : [...new Set(m.FT.FEATURE_TABLE.map(r => r.feature).filter(Boolean))].map(id => ({ id }))).map(r => { const on = () => true, off = () => false; return [r.id, m.FE.canAccess(r.id, null, on), m.FE.canAccess(r.id, { [r.id]: false }, on), m.FE.canAccess(r.id, { [r.id]: true }, on), m.FE.canAccess(r.id, null, off), m.FE.canAccess(r.id, { [r.id]: true }, off)] }),
  }
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
    // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): the landing's #pricing reads the plan catalogue — the
    // migration's seed rows (scripts/_lp1c-fixtures.cjs planTables), fixture input like the country rows.
    globalThis.__harnessDb = kit.fakeDb({ country_settings: [snake(GB), snake(US_ON)], ...(LEGACY_DISPLAY ? {} : require('./_lp1c-fixtures.cjs').planTables()) }); m.clearCountrySettingsCache?.()
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
  if (process.env.HG_LP0_DUMP) fs.writeFileSync(process.env.HG_LP0_DUMP, JSON.stringify({ keys: got.keys, landing: got.landing }))   // a debugging aid: the AFTER answers, for reading a diff

  head('1 · date words — every answer byte-identical to BEFORE, on the server and in the browser bundle')
  for (const engine of ['server', 'chromium', 'webkit']) {
    for (const sec of Object.keys(before.dates[engine])) {
      const d = diffJson(before.dates[engine][sec], got.dates[engine][sec])
      t(`${engine} · ${sec} (${Object.keys(before.dates[engine][sec]).length} answers)`, d === null, d)
    }
  }
  t('the browser bundle answers exactly what the server answers (Chromium)', JSON.stringify(got.dates.chromium) === JSON.stringify(got.dates.server), diffJson(got.dates.server, got.dates.chromium))
  t('the browser bundle answers exactly what the server answers (WebKit)', JSON.stringify(got.dates.webkit) === JSON.stringify(got.dates.server), diffJson(got.dates.server, got.dates.webkit))

  // ══ ⚠️ RE-PINNED (Language Phase 1e): LANGUAGE PHASE 1e'S NAMED CODE CHANGES, each a PRECISE transform of the BEFORE value
  // (scripts/language-phase-1e.cjs proves the same changes against eb7ed44). Everything else stays byte-identical.
  //   transaction-row-id (GB, US)  the fee rows carry their id first (`walkup`, `onlineIncluded`, `feeAfter`) — words read by id
  //   us-long-dates (US)           footnote 4's WhatsApp dates through formatLongDate: "1 October 2026" → "October 1, 2026"
  //   us-letter (US)               the plans PDF's @page size is letter for a US country (A4 for GB, unchanged)
  //   us-cents (US)                /compare's small-fee unit is the country's minor-unit suffix: "p" → "¢" ("30p" → "30¢")
  //   html-text-separators (GB, US) React's empty <!-- --> between adjacent text nodes, removed from BOTH sides (a JSX text
  //                                run became one message — "Nadia <!-- -->&amp;<!-- --> Bogdan" → "Nadia &amp; Bogdan")
  //   us-landing (US)              the -us screenshots (lib/landing-screens.ts), the Pizzeria Gusto testimonial GB-only (its
  //                                <section class="quote-sec"> and the logo's preload link), the locale-free App Store link
  const ROW_IDS = ['walkup', 'onlineIncluded', 'feeAfter']
  const usDates = x => x.replace(/From 1 October 2026/g, 'From October 1, 2026').replace(/Correct at 16 September 2026/g, 'Correct at September 16, 2026')
  const mapStr = (v, fn) => (typeof v === 'string' ? fn(v) : Array.isArray(v) ? v.map(x => mapStr(x, fn)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapStr(x, fn)])) : v)
  const SEP = /<!-- -->/g
  const NAMED_1E = {
    transactionRows: (cc, v) => (Array.isArray(v) && got.keys[cc].transactionRows?.[0]?.id ? v.map((r, i) => ({ id: ROW_IDS[i], ...r })) : v),
    // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): each footnote now carries an `id` (Billing masks the fee
    // footnote by id, PRICE_FOOTNOTE_ID) — added first, by number; number and text stay byte-identical.
    footnotes: (cc, v) => { const ids = { 1: 'walkupFees', 2: 'onlineFees', 3: 'kitchenDevice', 4: 'autoReplies', 5: 'printing' }; const x = cc === 'US' ? mapStr(v, usDates) : v; return Array.isArray(x) ? x.map(f => ({ id: ids[f.number], ...f })) : x },
    featureComparison: (cc, v) => (cc === 'US' ? usDates(v) : v),
    pdfHtml: (cc, v) => (cc === 'US' ? usDates(v).replace('@page { size: A4;', '@page { size: letter;') : v),
    costComparison: (cc, v) => (cc === 'US' ? v.replace('<span class="pl-1 text-lg font-bold text-slate-400">p</span>', '<span class="pl-1 text-lg font-bold text-slate-400">¢</span>').replace(/(of [0-9.]+% \+ )([0-9]+)p( per order)/g, '$1$2¢$3') : v),
  }
  const landing1e = (cc, v) => {
    let x = v.replace(SEP, '')
    // ⚠️ RE-PINNED, 16 October 2026: the testimonial's small line sits below the award — Phase 1e's ONE named transform
    // ('testimonial-order', scripts/_lp1e-named.cjs), reused rather than restated. It must apply: a no-op throws.
    if (cc !== 'US') {
      const order = require('./_lp1e-named.cjs').NAMED.find(e => e.id === 'testimonial-order')
      const y = order.apply('pages/landing|GB|html', x)
      if (y === x) throw new Error('testimonial re-pin: the stored GB landing HTML no longer holds the old order')
      return y
    }
    x = x.replace(/\/screenshots\/(kitchen|dashboard-v4|customer-order)\.png/g, '/screenshots/$1-us.png').replace('<link rel="preload" as="image" href="/gusto-logo.png"/>', '')
    const q = x.match(/<section class="quote-sec">(?:(?!<section)[\s\S])*?Pizzeria Gusto[\s\S]*?<\/section>/)
    if (q) x = x.replace(q[0], '')
    x = x.replace(/https:\/\/apps\.apple\.com\/gb\/app\/hatchgrab\/id6803543106/g, 'https://apps.apple.com/app/id6803543106')
    // ⚠️ RE-PINNED, 18 October 2026: us-layout-fix-13-us-landing-bands (the US landing, testimonial hidden: pricing loses
    // `band`, the final CTA gains it, `.switch-block` an inline wash) — the ONE named transform in scripts/_lp1e-named.cjs
    // (US_LAYOUT_FIX_13), reused rather than restated. It must apply: a no-op throws. GB stays byte-identical.
    const fix13 = require('./_lp1e-named.cjs').US_LAYOUT_FIX_13
    const y = fix13.apply(`pages/landing|${cc}|html`, x)
    if (y === x) throw new Error('us-layout-fix-13 re-pin: the stored US landing HTML no longer holds the old bands')
    return y
  }

  // ⚠️ RE-PINNED (seo-fixes, 20 October 2026): seo-fixes's named markup changes, PRECISE, one copy in scripts/_lp-seo-fixes.cjs —
  //   seo-s7-badges-lazy (the landing footer and the landing): both store badges gain loading="lazy", their preload links go;
  //   seo-m1-country-menu (the landing, GB and US): the closed country menu is rendered after each trigger (both countries
  //     switched on in this fixture, so two options; hrefs /uk and /us — the render has no pathname);
  //   seo-m5-s9-json-ld (the landing): the JSON-LD is one @graph (Organization, WebSite, BEFORE's SoftwareApplication with
  //     url = /uk or /us, publisher by @id, the seed catalogue's Offers in GBP / USD).
  // Each must apply (a no-op throws). Nothing else in these views moves.
  const SEO = require('./_lp-seo-fixes.cjs')
  const seoFooter = SEO.must('seo-s7-badges-lazy', SEO.badgesLazy)
  // ⚠️ RE-PINNED (copy, Dominic, 20 October 2026): + copy-trust-line — the landing trust line names the trial length.
  // ⚠️ RE-PINNED (about-page, 22 October 2026, docs/about-page-report.md): the footer's About link, the Organization's founder and
  // the country menu leaving the nav (Dominic) — verified on AFTER and mapped back (scripts/_lp-about-page.cjs viewBack); a view
  // that does not carry EXACTLY those changes is compared as it is, and fails.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS harness module (about-page)
  const AP = require('./_lp-about-page.cjs')
  const aboutBack = (got, exp) => { if (!AP.LANDED) return [got, exp]; const r = AP.viewBack(got, exp); return r ? [r[0], r[1]] : [got, exp] }
  // ⚠️ RE-PINNED (country-picker-1, 23 October 2026, docs/country-picker-1-report.md): PICKER-footer — BEFORE's footer menu
  // (<div class="cc cc-foot">) and AFTER's picker (<span class="cc cc-foot">) cut whole from their sides, verified first: one
  // each, inside the footer, AFTER's the link row's last item, both listing the same countries with the same one current.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS harness module (country-picker-1)
  const PICKER = require('./_lp-country-picker.cjs')
  const pickerBack = ([got, exp]) => (PICKER.LANDED && PICKER.find(got)?.kind === 'new' && PICKER.find(exp)?.kind === 'old' && PICKER.inLinkRow(got) && PICKER.sameCountries(exp, got)
    ? [PICKER.cut(got), PICKER.cut(exp)] : [got, exp])
  const seoLanding = (cc, v) => SEO.must('copy-trust-line', SEO.trustLine)(SEO.must('seo-m5-s9-json-ld', x => SEO.jsonLdHtml(x, cc))(SEO.must('seo-m1-country-menu', x => SEO.countryMenu(x, { options: ['GB', 'US'] }))(seoFooter(v))))

  head('2 · keys separated from labels — every output byte-identical to BEFORE (GB and US), apart from Phase 1e’s named changes')
  for (const k of Object.keys(before.keys)) {
    if (k === 'contactLinks') continue   // the source changes by design; §2b of the AFTER module rebuilds the same links from ids
    if (k === 'GB' || k === 'US') {
      for (const kk of Object.keys(before.keys[k])) {
        const exp = NAMED_1E[kk] ? NAMED_1E[kk](k, before.keys[k][kk]) : before.keys[k][kk]
        // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): the views whose code Stage B DELETED are retired (the file is
        // gone and nothing renders them; scripts/pricing-pages.cjs proves the plan table that replaced them); the plans PDF
        // and /compare's calculator are compared through Stage B's scoped proofs (scripts/_lp-stage-b.cjs) — outside the
        // regions Stage B replaced, byte-identical to BEFORE + Phase 1e's named changes.
        if (!LEGACY_DISPLAY && STAGE_B_RETIRED.includes(kk)) { t(`${k} · ${kk}: retired with Stage B — its code is deleted (lib/legacy-pricing-display.ts, components/landing/FeatureComparison.tsx) and nothing renders it`, !(kk in got.keys[k]) && !fs.existsSync(path.join(REPO, 'lib/legacy-pricing-display.ts')) && !fs.existsSync(path.join(REPO, 'components/landing/FeatureComparison.tsx'))); continue }
        if (!LEGACY_DISPLAY && STAGE_B_SCOPED[kk]) { const r = STAGE_B_SCOPED[kk](exp, got.keys[k][kk]); t(`${k} · ${kk}: BEFORE + Phase 1e's named changes, apart from Stage B's regions (${kk === 'pdfHtml' ? 'pricing-b-plans-pdf' : 'pricing-b-compare-calc'})`, r.ok, r.problems.join(' · ')); continue }
        const d = diffJson(exp, got.keys[k][kk]); t(`${k} · ${kk}`, d === null, d)
      }
    } else if (k === 'parity') {
      // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): BEFORE was "the drift guard finds nothing" ([]). The
      // guard and the tiered gates it compared are gone; the check is now the new state (see keyViews).
      const p = got.keys.parity
      t('parity: BEFORE’s drift guard found nothing', JSON.stringify(before.keys.parity) === '[]')
      t('parity → new state: the frozen display exports no drift guard (findPlanParityViolations / ROW_FEATURE_MAP gone)', p.guardGone === true)
      const bad = p.overrideOnly.filter(([, none, off, on]) => !(none === true && off === false && on === true))
      t(`parity → new state: every plan-table row's feature is override-only — no override allowed, false denied, true allowed (${p.overrideOnly.length} rows)`, p.overrideOnly.length > 20 && bad.length === 0, JSON.stringify(bad))
      // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): the plan switch is consulted when no override —
      // a plan with the feature off denies it, and an override `true` still wins over that plan.
      const badPlan = p.overrideOnly.filter(([, , , , planOff, planOffGrant]) => !(planOff === false && planOffGrant === true))
      t(`parity → Stage A2: with no override the plan's switch decides (off → denied); an override true wins over it (${p.overrideOnly.length} rows)`, p.overrideOnly.length > 20 && badPlan.length === 0, JSON.stringify(badPlan))
    } else if (k === 'landingFooter') { const [g, e] = aboutBack(got.keys[k], seoFooter(before.keys[k])); const d = diffJson(e, g); t(`${k} (+ seo-s7-badges-lazy${AP.LANDED ? ', about-page ABOUT-link' : ''})`, d === null, d) }   // ⚠️ RE-PINNED (seo-fixes, 20 October 2026; about-page, 22 October 2026)
    else { const d = diffJson(before.keys[k], got.keys[k]); t(k, d === null, d) }
  }
  for (const k of Object.keys(before.landing)) {
    // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): #pricing is Stage B's (banner → cards → cheapest bar → footnote)
    // — scripts/_lp-stage-b.cjs landingPricing: the section's region cut from both, the rest byte-identical.
    // ⚠️ RE-PINNED (seo-fixes, 20 October 2026): + seo-fixes's named items (seoLanding, above), outside #pricing.
    if (!LEGACY_DISPLAY) { const [g, e] = pickerBack(aboutBack(got.landing[k].replace(SEP, ''), seoLanding(k, landing1e(k, before.landing[k])))); const r = STAGE_B.landingPricing(e, g); t(`landing page (${k}) rendered HTML, apart from Stage B's #pricing (pricing-b-landing-pricing), seo-fixes's named items${PICKER.LANDED ? ' and the footer picker (PICKER-footer)' : ''}`, r.ok, r.problems.join(' · ')); continue }
    const d = diffJson(landing1e(k, before.landing[k]), got.landing[k].replace(SEP, '')); t(`landing page (${k}) rendered HTML`, d === null, d)
  }

  if (AFTER_CODE) await require('./_language-phase-0-after.cjs')({ kit, t, head, read, REPO, before, got, STUBS, GB, US_ON, snake })
  console.log(`\n${fail ? '✗' : '✓'} language-phase-0: ${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
}
main().catch(e => { console.error(e); process.exit(1) })
