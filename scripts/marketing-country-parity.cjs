#!/usr/bin/env node
// scripts/marketing-country-parity.cjs — the landing page, /features, /compare and the plans PDF, rendered for real
// in a visitor's country (Phase 2D-1, docs/signup-and-landing-country-report.md).
//
//   node scripts/marketing-country-parity.cjs                    check against the committed BEFORE snapshot
//   node scripts/marketing-country-parity.cjs --capture <file>   write a snapshot of the current code
//
// ── 🔴 THE METHOD ─────────────────────────────────────────────────────────────────────────────────────────
// The REAL page modules are bundled for node (scripts/_render-kit.cjs) and rendered with React's static
// prerender, which awaits async server components exactly as Next does. next/font and next/headers — which only
// exist inside Next's compiler and request scope — are stubbed: fonts return fixed class names, and headers() /
// cookies() answer from the fixture request (host, x-vercel-ip-country, the hg_country cookie). The database is
// the in-memory fake, holding the country_settings rows PARSED FROM THE SEED MIGRATIONS (never typed here).
// The BEFORE snapshot was taken on the unchanged pages, before the first edit of this phase. AFTER, the UK text
// must match byte for byte apart from the new flag buttons, which are named and removed before comparing.

const fs = require('fs'); const path = require('path')
// ⚠️ RE-PINNED (Language Phase 1e): this harness asserts PHASE 2D-1's claims (the visitor's country, the menu, the gates)
// on THIS code with the words as they stood at eb7ed44 — scripts/fixtures/language-phase-1e-messages-before.{en-GB,en-US}.json
// plus every as-moved overlay (scripts/_lp2-frozen.cjs) — because Phase 1e moves these pages' words into messages and
// fixes some ("Less queues" → "Fewer queues", ’ …); those are proven key by key by scripts/language-phase-1e.cjs.
// HG_MESSAGES_FROZEN=off renders the authored words (only for a deliberate check).
// Only when run AS this harness: scripts/signup-landing-screenshots.cjs requires this module and photographs today's words.
if (require.main === module && !process.argv.includes('--capture') && !('HG_MESSAGES_FROZEN' in process.env)) process.env.HG_MESSAGES_FROZEN = 'scripts/fixtures/language-phase-1e-messages-before.en-GB.json'
const kit = require('./_render-kit.cjs')({ cacheTag: 'marketing-country' })
const { REPO, h } = kit
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const argv = process.argv.slice(2)
const CAPTURE = argv.includes('--capture') ? argv[argv.indexOf('--capture') + 1] : null
const BEFORE_FILE = 'scripts/fixtures/marketing-country-before.json'
const SEEDS = require('./_country-settings-gb.cjs')
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))

const STUBS = {
  'next/font/google': ['Archivo', 'Public_Sans', 'Courier_Prime'].map(n => `export const ${n} = () => ({ variable: 'font-${n}', className: 'font-${n}', style: {} })`).join('\n'),
  'next/headers': `
    const H = () => globalThis.__mcReq || { headers: {}, cookies: {} }
    export async function headers() { const r = H(); return { get: k => r.headers[k.toLowerCase()] ?? null, has: k => k.toLowerCase() in r.headers } }
    export async function cookies() { const r = H(); return { get: k => (k in r.cookies ? { name: k, value: r.cookies[k] } : undefined), has: k => k in r.cookies, getAll: () => Object.entries(r.cookies).map(([name, value]) => ({ name, value })) } }`,
}
// 🔴 THE "MARKED" BUILD — the country menu replaced by an empty marker that RECORDS what it was given. With it,
// the UK text is compared to BEFORE with nothing removed by pattern: the menu adds no text and no attribute.
// The "real" build renders the actual menu, and its markup is then checked on its own.
const MARKED = {
  ...STUBS,
  '@/components/landing/CountryMenu': `import { createElement } from 'react'
    export function CountryMenu(p) { (globalThis.__ccSeen = globalThis.__ccSeen || []).push(p); return createElement('i', { 'data-cc': p.variant ?? 'footer' }) }`,
}
// ⚠️ RE-PINNED (about-page, 22 October 2026, docs/about-page-report.md): Dominic took the country menu out of the NAV — it is
// in the footer only, so CountryMenu has no `variant` (the marker records 'footer', the one place it is). Every check below
// that asserted a header button asserts its ABSENCE on such a tree, and the footers' new About link is a named change
// (scripts/_lp-about-page.cjs dropLinkText: verified exactly once, then mapped back) — every other word still compares.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS harness module (about-page)
const AP = require('./_lp-about-page.cjs')
/** The about-page named change on AFTER's text and attributes (a no-op on an older tree); null = not exactly that change. */
const aboutSide = A => (AP.LANDED ? AP.dropLinkText(A) : A)
/** The country buttons a page should carry: the footer's only, from about-page; header + footer before. */
const WANT_MENUS = AP.LANDED ? 'footer' : 'header,footer'
const PAGES = { landing: 'app/landing/page.tsx', features: 'app/features/page.tsx', compare: 'app/compare/page.tsx' }
const modsBy = {}
async function pages(build = 'real') {
  if (modsBy[build]) return modsBy[build]
  const stubs = build === 'marked' ? MARKED : STUBS
  const mods = {}
  // The loader's 60s cache lives in each bundle; every visit clears it, so each fixture is read fresh.
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): + the plan catalogue's cache clear (lib/plans-server.ts), so a
  // visit with fixture plan_prices (`tables`) reads them, not the previous visit's cached catalogue.
  const planClear = fs.existsSync(path.join(REPO, 'lib/plans-server.ts')) ? `\nexport { clearPlanCatalogCache } from '@/lib/plans-server'` : ''
  for (const [k, f] of Object.entries(PAGES)) mods[k] = await kit.bundle(`page-${k}-${build}`, `export { default as Page } from '@/${f}'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'` + planClear, { stubs })
  mods.pdf = await kit.bundle('pdf', `export * as PDF from '@/lib/plans-pdf'`, { stubs: STUBS })
  mods.vc = await kit.bundle('visitor-country', `export * as VC from '@/lib/visitor-country'`, { stubs: STUBS })
  return (modsBy[build] = mods)
}

async function prerender(el) {
  const { prerenderToNodeStream } = require(path.join(REPO, 'node_modules/react-dom/static'))
  return kit.quietAsync(async () => {
    const { prelude } = await prerenderToNodeStream(el)
    let s = ''; for await (const c of prelude) s += c
    return s
  })
}

/** One visit: the country rows in the database, the request's host / ip-country / cookie, the page's query. */
// ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): the landing's pricing section, /features, /compare and the plans
// PDF read the plan catalogue now, so the fake database also holds public.plans / plan_prices / plan_features AS THE
// MIGRATIONS SEED THEM (scripts/_lp1c-fixtures.cjs planTables) — overridable per visit through `tables`.
const PLAN_ROWS = () => require('./_lp1c-fixtures.cjs').planTables()
async function visit(page, { rows, ip = null, cookie = null, query = {}, build = 'real', tables = {} }) {
  const m = await pages(build)
  globalThis.__ccSeen = []
  kit.setNow('2026-10-09T14:20:00.000Z'); kit.setDeviceTz('Europe/London')
  globalThis.__harnessDb = kit.fakeDb({ country_settings: rows.map(snake), trucks: [], ...PLAN_ROWS(), ...tables })
  m[page].clearCountrySettingsCache()
  if (m[page].clearPlanCatalogCache) m[page].clearPlanCatalogCache()
  globalThis.__mcReq = { headers: { host: 'www.hatchgrab.com', ...(ip ? { 'x-vercel-ip-country': ip } : {}) }, cookies: cookie ? { hg_country: cookie } : {} }
  try {
    const html = await prerender(h(m[page].Page, { searchParams: Promise.resolve(query), params: Promise.resolve({}) }))
    // ⚠️ RE-PINNED (Language Phase 1e): the TEXT is read with React's empty `<!-- -->` text separators removed. textOf turns
    // each into a space ("£2,000 ." where a visitor reads "£2,000."), and they vanish where a JSX run became one message.
    // Only that 8-character comment is removed; the BEFORE snapshot was re-captured the same way at eb7ed44.
    return { html, ...kit.textOf(html.replace(/<!-- -->/g, '')), menus: globalThis.__ccSeen }
  } finally { delete globalThis.__harnessDb; delete globalThis.__mcReq; delete globalThis.__ccSeen }
}
const genDate = text => text.replace(/Generated (?:[0-9]{1,2} [A-Za-z]+ [0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2})/g, 'Generated <date>')
// ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): buildPlansPdfHtml(settings, catalog) — the PDF reads the plan
// catalogue (the SEEDED one unless a fixture catalogue is passed).
const CATALOG = () => require('./_plans-catalog-fixture.cjs').seedCatalog(path.resolve(__dirname, '..'))
async function pdfText(row, catalog = CATALOG()) {
  const m = await pages()
  const html = m.pdf.PDF.buildPlansPdfHtml.length >= 2 ? m.pdf.PDF.buildPlansPdfHtml(row, catalog) : m.pdf.PDF.buildPlansPdfHtml(row)
  const t = kit.textOf(html); t.text = genDate(t.text)
  return t
}

async function captureBefore() {
  const GB = SEEDS.gbFromSeed(), US = SEEDS.usFromSeed()
  const out = {}
  // ⚠️ RE-PINNED (Language Phase 1e): captured with the MARKED build — the one section 1 compares against (the country
  // menu replaced by an empty marker) — so the snapshot can be re-taken on a tree that has the menu. Re-taken at eb7ed44,
  // where it was proven equal to the Phase 2D-1 snapshot before the seam change (docs/language-phase-1e report).
  for (const p of Object.keys(PAGES)) { const v = await visit(p, { rows: [GB, US], build: 'marked' }); out[p] = { text: v.text, attrs: v.attrs } }
  out.pdf = await pdfText(GB)
  return out
}

// ── THE COMPARE ───────────────────────────────────────────────────────────────────────────────────────────
let failures = 0, checks = 0
const ok = (cond, label, detail) => { checks++; if (cond) return; failures++; console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`) }
const firstDiff = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return i >= a.length && i >= b.length ? null : `at ${i}: «${a.slice(Math.max(0, i - 40), i + 60)}» vs «${b.slice(Math.max(0, i - 40), i + 60)}»` }
// A US row switched on, with fixture prices (the seed leaves US prices undecided — null — on purpose).
const usOn = () => ({ ...SEEDS.usFromSeed(), enabled: true, starterMonthlyMinor: 3900, proMonthlyMinor: 5900, maxMonthlyMinor: 9900,
  proAllowanceMinor: 30000, maxAllowanceMinor: 100000, platformFeePct: 1.5 })
// ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): prices are plan_prices rows now — the row's old price fields above
// are no longer read. The US fixture prices go where the pages read them: the US plan_prices rows, Pro $39 and Unlimited
// $59 (fixture input; the seed's US rows equal GB's numbers, which would not show WHICH row a page read).
const US_FIXTURE_MONTHLY = { pro: 3900, unlimited: 5900 }
const usCatalog = () => { const c = CATALOG(); for (const r of c.prices) if (r.countryCode === 'US' && r.planKey in US_FIXTURE_MONTHLY) r.monthlyMinor = US_FIXTURE_MONTHLY[r.planKey]; return c }
const usTables = () => { const t = PLAN_ROWS(); t.plan_prices = t.plan_prices.map(r => r.country_code === 'US' && r.plan_key in US_FIXTURE_MONTHLY ? { ...r, monthly_minor: US_FIXTURE_MONTHLY[r.plan_key] } : r); return t }

// ══ ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026) — THE STAGE B NAMED DIFFERENCES (docs/pricing-pages-report.md)
// Stage B rebuilt the pricing views from the plan catalogue. Exactly these regions are named — cut out of BOTH sides with
// fixed boundary sentences (a boundary that is missing fails, never passes on a no-op) and asserted on their own below;
// every other byte of each page is still compared with BEFORE:
//   B-landing   the landing's #pricing body, from after its heading ("Pricing Start free. Upgrade when you need to.") to the
//               next section ("Want to see how easy setup is?"): banner → cards → cheapest bar → footnote (+ the kept
//               "Switching from another platform?" block);
//   B-features  /features' main, between the header and the footer: h1 / lede / callout / PlanTable / footnote; its only
//               new attributes are PlanTable's cell labels (aria-label=Included / Not included);
//   B-compare   /compare's "Months free" default is the trial's months (value=1 → value=3); the text is unchanged;
//   B-pdf       the plans PDF is rewritten: banner, cards, cheapest bar, the plan table, footnote.
const STAGE_B = fs.existsSync(path.join(REPO, 'lib/plan-offer.ts')) && fs.existsSync(path.join(REPO, 'components/pricing/PlanTable.tsx'))
const B_REGIONS = {
  landing: ['Pricing Start free. Upgrade when you need to. ', ' Want to see how easy setup is?'],
  features: [' Upload menu ', ' Less time booking. More time cooking.'],
}
const B_TABLE_ATTRS = /^aria-label=(Included|Not included)$/
const trialMonthsB = () => (CATALOG().plans.find(p => p.isSignupDefault && p.isTrial) || {}).trialMonths
/** Cuts the named region (B_REGIONS) out of a text; null when a boundary is missing. */
function cutB(page, text) {
  const r = B_REGIONS[page]; if (!r) return text
  const i = text.indexOf(r[0]); const j = i < 0 ? -1 : text.indexOf(r[1], i + r[0].length)
  return i < 0 || j < 0 ? null : text.slice(0, i + r[0].length) + '<named: B-' + page + '>' + text.slice(j)
}
const regionB = (page, text) => { const r = B_REGIONS[page]; const i = text.indexOf(r[0]); return text.slice(i + r[0].length, text.indexOf(r[1], i + r[0].length)) }
/** BEFORE and AFTER of one page, with Stage B's named parts taken out. */
function stageBSides(page, before, after) {
  if (!STAGE_B) return [before, after]
  const bt = cutB(page, before.text), at = cutB(page, after.text)
  let ba = before.attrs, aa = after.attrs
  if (page === 'features') aa = aa.filter(x => !B_TABLE_ATTRS.test(x))
  if (page === 'compare') ba = ba.map((x, i) => ba[i - 1] === 'aria-label=Months free' && x === 'value=1' ? `value=${trialMonthsB()}` : x)
  return [{ text: bt === null ? '(B boundary missing) ' + before.text : bt, attrs: ba }, { text: at === null ? '(B boundary missing) ' + after.text : at, attrs: aa }]
}
const poundsB = minor => '£' + (minor / 100).toLocaleString('en-GB', { maximumFractionDigits: 2 })
const offerB = (cc = 'GB', cat = CATALOG()) => cat.plans.filter(p => p.isPublic && p.active).sort((x, y) => x.sortOrder - y.sortOrder)
  .map(p => ({ p, r: cat.prices.find(r => r.planKey === p.key && r.countryCode === cc) })).filter(x => x.r)
const FOOTNOTE_GB_B = /\* Plus \w+’s card processing on online card orders \(currently 1\.5% \+ 20p in the UK\), paid to \w+, not HatchGrab\. Walk-up orders use your own card reader — HatchGrab charges 0%\./
const tableHeadB = () => offerB().map(({ p, r }) => `${p.name} ${poundsB(r.monthlyMinor)} / month`).join(' ') + ' What you pay '
/** The named regions' new content, asserted (UK, GB prices from the seed). */
function stageBChecks(views, pdf) {
  const n = trialMonthsB()
  const L = regionB('landing', views.landing.text), F = regionB('features', views.features.text)
  ok(L.startsWith(`Your first ${n} months are completely free — every feature unlocked.`), 'B-landing · the banner leads with the trial months', L.slice(0, 120))
  ok(offerB().every(({ p, r }) => L.includes(`${p.name} ${p.subtitle ? p.subtitle + ' ' : ''}${poundsB(r.monthlyMinor)} per truck / month`)), 'B-landing · a card per public plan, in order, with its GB price (from the seed)')
  { let i = 0; ok(offerB().every(({ p }) => { const j = L.indexOf(` ${p.name} `, i); if (j < 0) return false; i = j; return true }), 'B-landing · the cards in sort order') }
  ok(L.includes('Which plan is cheapest for me?') && L.indexOf('Which plan is cheapest for me?') < L.indexOf('* Plus '), 'B-landing · the cheapest bar, then the footnote')
  ok(FOOTNOTE_GB_B.test(L), 'B-landing · the pricing footnote (GB card processing)')
  ok(L.includes('Switching from another platform? See what you’d be paying on HatchGrab for the same orders. Takes about a minute. Compare what you’re paying'), 'B-landing · the /compare block is kept, word for word')
  ok(!/Compare all features|Pro is £29 a month with|Starter/.test(L), 'B-landing · the old lede, "Compare all features" and Starter are gone')
  // ⚠️ RE-PINNED (features-page-restore, 20 October 2026): the old eyebrow ("Compare", featuresPage.eyebrow) now comes first,
  // right before the same h1; and each capability row reads its description (featuresPage.detail, en-GB), in table order.
  // The exact markup is proven by scripts/_lp-features-restore.cjs (language-phase-1e / 1e-tidy, plans-data-model).
  if (FR.LANDED) {
    const W = FR.wordSet('en-GB')
    ok(F.startsWith(`${W.eyebrow} Everything to run your service, on every plan.`), 'B-features · the eyebrow, then the new h1 (features-page-restore)', F.slice(0, 80))
    { let i = 0; const miss = FR.tableIds().filter(id => { const j = F.indexOf(W.detail[id], i); if (j < 0) return true; i = j; return false })
      ok(miss.length === 0, 'B-features · every capability row\'s description, in table order (features-page-restore)', miss.join(', ')) }
  } else ok(F.startsWith('Everything to run your service, on every plan.'), 'B-features · the new h1', F.slice(0, 80))
  // ⚠️ RE-PINNED (landing-mobile-tidy, 21 October 2026, Dominic): the trial callout is removed from /features.
  ok(!F.includes('free with every feature unlocked'), 'B-features · no trial callout (removed)')
  ok(F.includes(tableHeadB()), 'B-features · THE plan table, its header from the catalogue', tableHeadB())
  ok(FOOTNOTE_GB_B.test(F), 'B-features · the pricing footnote')
  ok(views.features.attrs.filter(x => B_TABLE_ATTRS.test(x)).length > 0, 'B-features · the table cells are labelled (the excused attrs are present)')
  const cmp = views.compare.attrs, k = cmp.indexOf('aria-label=Months free')
  // ⚠️ RE-PINNED (compare-tidy-2, 20 October 2026): the months-free input is gone (T-free). The months are the data default
  // (the trial's) unless the page's ?free=N (1–12) overrides them — the page hands that to the calculator as a prop.
  if (COMPARE_TIDY_2) ok(k < 0 && /freeMonthsOverride=\{freeMonthsOverride\}/.test(read('app/compare/page.tsx')) && /freeMonthsOverride \?\? offerTrialMonths\(catalog\) \?\? 0/.test(read('app/compare/CostComparison.tsx')),
    `B-compare · no "Months free" input; the months are freeMonthsOverride ?? the trial's (${n})`)
  else ok(k >= 0 && cmp[k + 1] === `value=${n}`, `B-compare · "Months free" defaults to the trial's ${n}`)
  ok(pdf.text.includes(`Your first ${n} months are completely free`) && pdf.text.includes(tableHeadB()) && FOOTNOTE_GB_B.test(pdf.text) && pdf.text.includes('Generated <date>'),
    'B-pdf · banner, the plan table, the footnote and the date stamp')
  ok(offerB().every(({ p, r }) => pdf.text.includes(`${p.name} ${p.subtitle ? p.subtitle + ' ' : ''}${poundsB(r.monthlyMinor)} per truck / month`)), 'B-pdf · a card per public plan with its GB price')
}
// ══ ⚠️ RE-PINNED (compare-tidy, 20 October 2026) — THE NAMED /compare TIDY (docs/compare-tidy-report.md). Exactly these
// transforms, each of which must apply ONCE (a boundary that is missing fails, never passes on a no-op):
//   T-staff     BEFORE's staff card (" 3 How many people work the van? One Two or more") is removed;
//   T-renumber  BEFORE's later cards renumbered with no gap: orders 4 → 3, fee 5 → 4, months free 6 → 5;
//   T-panel     the orders card now renders its fee line and the "We suggest" panel (moved in, no longer waiting on a staff
//               answer) between its caption and question 4 — cut from AFTER as a named region (BEFORE held nothing there)
//               and asserted on its own in tidyChecks. Every other byte, and every attribute, is still compared.
//   ⚠️ RE-PINNED (compare-tidy-2, 20 October 2026) — three more, same rules:
//   T-free      BEFORE's months-free card (" 5 Your introductory offer — how many months free? No plan fee, no service fee",
//               numbered 5 after T-renumber) is removed, with its four attributes (min=0, max=12, aria-label=Months free,
//               value=<the B-compare default>) — the months are data now (freeMonthsOverride ?? the trial);
//   T-inert     not in the text or attributes: every dimmed card (opacity 0.45) also has pointer-events:none and `inert`,
//               asserted on the HTML in tidyChecks.
const COMPARE_TIDY = !/const \[staff, setStaff\]/.test(read('app/compare/CostComparison.tsx'))
const COMPARE_TIDY_2 = /freeMonthsOverride/.test(read('app/compare/CostComparison.tsx'))
// ⚠️ RE-PINNED (features-page-restore, 20 October 2026): /features in the pre-Stage-B look — the named change's words.
const FR = require('./_lp-features-restore.cjs')
const TIDY_FREE_TEXT = ' 5 Your introductory offer — how many months free? No plan fee, no service fee'
const TIDY_STEPS = [[' 3 How many people work the van? One Two or more', ''],
  [' 4 Online orders per month, per truck ', ' 3 Online orders per month, per truck '],
  [' 5 What do you pay per order now? ', ' 4 What do you pay per order now? '],
  [' 6 Your introductory offer', ' 5 Your introductory offer']]
const TIDY_PANEL = ['Only orders placed through your ordering page — not cash or card at the window.', ' 4 What do you pay per order now? ']
/** The T-panel region of a (renumbered) /compare text, or null when a boundary is missing. */
function tidyRegion(text) {
  const i = text.indexOf(TIDY_PANEL[0]); if (i < 0) return null
  const a = i + TIDY_PANEL[0].length, j = text.indexOf(TIDY_PANEL[1], a)
  return j < 0 ? null : { a, j, region: text.slice(a, j) }
}
/** BEFORE and AFTER of /compare with the compare-tidy transforms applied (other pages unchanged). */
function tidySides(page, [B, A]) {
  if (page !== 'compare' || !COMPARE_TIDY) return [B, A]
  let bt = B.text
  for (const [from, to] of TIDY_STEPS) {
    if (bt.split(from).length !== 2) return [{ ...B, text: '(compare-tidy boundary missing: ' + from.trim() + ') ' + B.text }, A]
    bt = bt.replace(from, to)
  }
  let ba = B.attrs
  if (COMPARE_TIDY_2) {
    if (bt.split(TIDY_FREE_TEXT).length !== 2) return [{ ...B, text: '(compare-tidy-2 boundary missing: months-free card) ' + bt }, A]
    bt = bt.replace(TIDY_FREE_TEXT, '')
    const i = ba.indexOf('aria-label=Months free')
    if (i < 2 || ba[i - 2] !== 'min=0' || ba[i - 1] !== 'max=12' || !/^value=\d+$/.test(ba[i + 1] || '') || ba.indexOf('aria-label=Months free', i + 1) >= 0) return [{ ...B, text: '(compare-tidy-2 boundary missing: months-free attributes) ' + bt }, A]
    ba = [...ba.slice(0, i - 2), ...ba.slice(i + 2)]
  }
  const rb = tidyRegion(bt), ra = tidyRegion(A.text)
  if (!rb || rb.region !== '' || !ra) return [{ ...B, text: '(compare-tidy panel boundary missing) ' + bt }, A]
  const mark = '<named: compare-tidy panel>'
  return [{ ...B, text: bt.slice(0, rb.a) + mark + bt.slice(rb.j), attrs: ba }, { ...A, text: A.text.slice(0, ra.a) + mark + A.text.slice(ra.j) }]
}
/** T-panel's content, restated from the seed (GB, the slider's default): the fee line, then the panel. */
function tidyChecks(views) {
  const v = views.compare, r = tidyRegion(v.text)
  const gi = v.attrs.indexOf('aria-label=Monthly online order value per truck'), gmv = Number((v.attrs[gi + 1] || '').replace('value=', '')) * 100
  const cost = ({ r: x }) => x.includedOnlineMinor === null ? x.monthlyMinor : x.monthlyMinor + (x.feeBps / 10000) * Math.max(0, gmv - x.includedOnlineMinor)
  const offer = offerB(); let best = null
  for (const o of offer) if (!best || cost(o) < cost(best) - 1e-9) best = o
  const pct = best.r.feeBps / 100 + '%', money2 = minor => '£' + (minor / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  // The seed's cheapest plan at the default £2,500 is a fee-only plan with no monthly price (Pay as you go); a fixture where
  // that stops being true fails here by name rather than being restated by reading the page.
  const shapeOk = best.r.monthlyMinor === 0 && best.r.includedOnlineMinor === 0 && best.r.feeBps > 0
  const want = ` ${pct} on every online card order — ${money2(gmv * best.r.feeBps / 10000)} a month per truck. We suggest ${best.p.name} No monthly fee — ${pct} on online card orders only. `
    + offer.filter(o => o !== best).map(o => `Use ${o.p.name} instead`).join(' ')
  ok(gmv === 250000 && shapeOk && !!r && r.region === want, `T-panel · /compare's orders card: the fee line, then "We suggest ${best.p.name}" and every other public plan`, r ? r.region : 'no region')
  // ⚠️ RE-PINNED (compare-tidy-2, 20 October 2026): no months-free card — fee 4 is the last question (T-free).
  ok(!/How many people work|Two or more|Everyone gets their own login/.test(v.text) && / 3 Online orders per month, per truck .* 4 What do you pay per order now\? /.test(v.text)
    && (COMPARE_TIDY_2 ? !/Your introductory offer|how many months free|No plan fee, no service fee/.test(v.text) && !v.attrs.includes('aria-label=Months free') : / 5 Your introductory offer/.test(v.text)),
    'T-staff / T-renumber / T-free · no staff question, no months-free card; orders 3, fee 4')
  if (COMPARE_TIDY_2) {
    // T-inert: nothing answered on this view, so every card after question 1 is dimmed — each one also inert, no clicks.
    const cards = v.html.match(/<div class="rounded-2xl border bg-white p-5 shadow-sm transition md:p-6"[^>]*>/g) || []
    const dim = cards.filter(c => /opacity:0\.45/.test(c))
    ok(cards.length === 4 && dim.length === 3 && dim.every(c => /style="border-color:#E2E8F0;opacity:0\.45;pointer-events:none" inert=""/.test(c)) && !/inert|pointer-events/.test(cards[0]),
      'T-inert · the 3 dimmed cards carry pointer-events:none and inert; question 1\'s card neither', cards.join(' '))
  }
}
const MENU_RE = /<div class="cc cc-(head|foot)">[\s\S]*?<\/div>/g
// ⚠️ RE-PINNED (seo-fixes, 20 October 2026): the store badges (components/StoreBadges.tsx) gained loading="lazy", so React
// no longer emits the two <link rel="preload" as="image" href="/badges/…"> hints at the top of each page — the only
// `href=/badges/…` attributes BEFORE held (the badge <img>s carry `src`). Named: dropped from BEFORE's attributes ONLY when
// AFTER's own markup proves the change (both badge imgs lazy, no preload hint); otherwise BEFORE is left as it was and the
// comparison fails. Nothing else in the attributes moves.
const BADGE_HREF = /^href=\/badges\//
// ⚠️ RE-PINNED (copy, Dominic, 20 October 2026): the landing trust line ("First month 100% free, everything unlocked") names
// the trial length now — "First 3 months completely free, everything unlocked" (the seed's trial_months; scripts/_lp-seo-fixes.cjs
// copy-trust-line). Applied to BEFORE's stored text only where AFTER carries the new line.
function seoSides([B0, A], v) {
  const trust = require('./_lp-seo-fixes.cjs').trustLine
  const B = typeof B0.text === 'string' && B0.text.includes('First month 100% free, everything unlocked') && typeof A.text === 'string' && /First \d+ months completely free, everything unlocked/.test(A.text)
    ? { ...B0, text: trust(B0.text) } : B0
  const lazy = (v.html.match(/<img src="\/badges\/[^"]+" alt="[^"]+" width="\d+" height="40" loading="lazy"/g) || []).length === 2
  const noPreload = !/<link rel="preload" as="image" href="\/badges\//.test(v.html)
  if (!lazy || !noPreload || B.attrs.filter(x => BADGE_HREF.test(x)).length !== 2) return [B, A]
  return [{ ...B, attrs: B.attrs.filter(x => !BADGE_HREF.test(x)) }, A]
}
// ⚠️ RE-PINNED (seo-fixes, 20 October 2026): the country menu's list is ALWAYS rendered now (closed: class
// "cc-menu cc-menu-closed", hidden by CSS), its options real links — <a href role="menuitemradio" aria-checked class="cc-item">.
// The kit's pathname is '/', a page with no country address, so each option links to that country's landing.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS harness module (country-picker-1)
const PICKER = require('./_lp-country-picker.cjs')
const MENU_UL_RE = /<ul id="(_R_[0-9a-z]+_)" role="menu" aria-label="Country" class="cc-menu cc-menu-closed">(.*?)<\/ul>/

async function compare() {
  const BEFORE = JSON.parse(read(BEFORE_FILE))
  /* ⚠️ RE-PINNED, 16 October 2026: the landing testimonial's small line moved BELOW the award (Dominic — business →
   * award → people). The one named difference, applied to the stored text exactly; a stored text that no longer holds
   * the old order throws rather than passing on a no-op. */
  {
    const from = 'Nadia & Bogdan Owners, Pizzeria Gusto Mobile Pizzeria of the Year Regional winner'
    const to = 'Nadia & Bogdan Mobile Pizzeria of the Year Regional winner Owners, Pizzeria Gusto'
    if (!BEFORE.landing.text.includes(from)) throw new Error('testimonial re-pin: the stored landing text no longer holds the old order')
    BEFORE.landing.text = BEFORE.landing.text.replace(from, to)
  }
  /* ⚠️ RE-PINNED (landing-mobile-tidy, 21 October 2026): the approved hero line under "Upload my menu" (Dominic's mockup).
   * The one named difference, applied to the stored text exactly; a stored text without the old line throws. */
  {
    const from = 'No signup, no card. See it working in under 60 seconds.'
    const to = 'Upload a photo of your menu and see it working in under 60 seconds. No signup. No card.'
    if (!BEFORE.landing.text.includes(from)) throw new Error('hero-note re-pin: the stored landing text no longer holds the old line')
    BEFORE.landing.text = BEFORE.landing.text.replace(from, to)
  }
  const GB = SEEDS.gbFromSeed(), US_OFF = SEEDS.usFromSeed()

  const viewsB = {}
  console.log('1. UK — every page identical to BEFORE apart from the country buttons (marked build)')
  for (const p of Object.keys(PAGES)) {
    for (const [label, req] of [['no country header', {}], ['GB visitor', { ip: 'GB' }], ['US visitor, US switched off', { ip: 'US', cookie: 'US', query: { country: 'US' } }], ['a country with no row', { ip: 'FR' }]]) {
      const v = await visit(p, { rows: [GB, US_OFF], build: 'marked', ...req })
      // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): compared with Stage B's named regions cut out of both sides.
      const [B, A0] = seoSides(tidySides(p, stageBSides(p, BEFORE[p], v)), v)   // ⚠️ RE-PINNED (seo-fixes): the badge preload hints named; (compare-tidy): T-staff / T-renumber / T-panel
      const A = aboutSide(A0) || A0   // ⚠️ RE-PINNED (about-page): the footer's About link named (null → compared as it is, and fails)
      if (label === 'GB visitor') viewsB[p] = v
      ok(A.text === B.text, `${p} · ${label} · text identical`, firstDiff(A.text, B.text))
      ok(JSON.stringify(A.attrs) === JSON.stringify(B.attrs), `${p} · ${label} · attributes identical`)
      ok(v.menus.map(m => m.variant ?? 'footer').join() === WANT_MENUS && (!AP.LANDED || (/<footer[\s\S]*<i data-cc="footer"><\/i>[\s\S]*<\/footer>/.test(v.html) && AP.navHasNoMenu(v.html.replace(/<i data-cc="footer"><\/i>/, '')) && !/<nav[\s\S]*data-cc[\s\S]*<\/nav>/.test(v.html))),
        `${p} · ${label} · ${AP.LANDED ? 'one footer button and none in the nav' : 'one header and one footer button'}`, JSON.stringify(v.menus.map(m => m.variant)))
      const menu = v.menus[0]?.menu
      ok(menu?.current.code === 'GB' && menu.options.map(o => o.code).join() === 'GB', `${p} · ${label} · UK current, only the UK in the menu`, JSON.stringify(menu && { cur: menu.current.code, opts: menu.options.map(o => o.code) }))
      ok(menu?.remember === null, `${p} · ${label} · no cookie written (the URL's US is switched off)`)
      ok(!v.html.includes('$39') && !v.html.includes('US$'), `${p} · ${label} · no US prices`)
    }
  }
  const pdfGB = await pdfText(GB)
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): the PDF is rewritten (B-pdf) — asserted by name, not compared.
  if (STAGE_B) {
    console.log('1b. Stage B — the named regions, asserted (landing #pricing, /features main, /compare months-free, the PDF)')
    stageBChecks(viewsB, pdfGB)
    if (COMPARE_TIDY) tidyChecks(viewsB)   // ⚠️ RE-PINNED (compare-tidy, 20 October 2026): the named /compare tidy, asserted
  } else ok(pdfGB.text === BEFORE.pdf.text && JSON.stringify(pdfGB.attrs) === JSON.stringify(BEFORE.pdf.attrs), 'plans PDF (GB) identical', firstDiff(pdfGB.text, BEFORE.pdf.text))
  const route = read('app/landing/features-pdf/route.ts')
  ok(/resolveVisitorCountry\(req\.nextUrl\.searchParams\.get\('country'\)\)/.test(route) && /generatePlansPdf\(visitor\.settings\.countryCode\)/.test(route), 'the PDF route prints the resolved country')
  ok(/verifyAdmin\(\)/.test(route) && /'Cache-Control': 'no-store, max-age=0'/.test(route), 'the PDF route keeps its admin gate and no-store')

  console.log('2. The real menu (UK): its own markup, nothing else')
  for (const p of Object.keys(PAGES)) {
    const real = await visit(p, { rows: [GB, US_OFF] })
    const marked = await visit(p, { rows: [GB, US_OFF], build: 'marked' })
    // ⚠️ RE-PINNED (country-picker-1, 23 October 2026, docs/country-picker-1-report.md): the footer's picker is a <span class="cc
    // cc-foot"> (a flag + code trigger and its closed "Choose your country" dialog), the link row's last item — found whole.
    const pk = PICKER.LANDED ? PICKER.find(real.html) : null
    const found = PICKER.LANDED ? (pk ? [real.html.slice(pk.start, pk.end)] : []) : [...real.html.matchAll(MENU_RE)].map(m => m[0])
    ok(found.length === (AP.LANDED ? 1 : 2) && (!AP.LANDED || /cc-foot/.test(found[0])), `${p} · ${AP.LANDED ? 'one country button rendered, the footer\'s' : 'two country buttons rendered'}`, String(found.length))
    const stripped = PICKER.LANDED && pk ? real.html.slice(0, pk.start) + '<i data-cc></i>' + real.html.slice(pk.end) : real.html.replace(MENU_RE, '<i data-cc></i>')
    const markedNorm = marked.html.replace(/<i data-cc="(header|footer)"><\/i>/g, '<i data-cc></i>')
    ok(stripped === markedNorm, `${p} · removing the two buttons leaves the marked page exactly`, firstDiff(stripped, markedNorm))
    // ⚠️ RE-PINNED (about-page): with no header button, the button checks read the footer's (the same component).
    const [head, foot] = AP.LANDED ? [null, found[0]] : found
    const first = head ?? foot
    ok(AP.LANDED ? !head && AP.navHasNoMenu(real.html) : true, `${p} · no country button in the nav`)
    ok((AP.LANDED || /aria-label="Country: United Kingdom. Change country"/.test(head || '')) && /aria-label="Country: United Kingdom. Change country"/.test(foot || ''), `${p} · aria-label names the country`)
    if (PICKER.LANDED) ok(/<span class="cc-code">GB<\/span>/.test(foot || '') && PICKER.inLinkRow(real.html), `${p} · the footer trigger shows the code (GB), the link row's last item`)
    else ok((AP.LANDED || /<span class="cc-name">UK<\/span>/.test(head || '')) && /<span class="cc-name">United Kingdom<\/span>/.test(foot || ''), `${p} · ${AP.LANDED ? 'the footer shows the full name' : 'header shows the short name, footer the full name'}`)
    ok(/<img class="cc-flag" src="data:image\/svg\+xml;charset=utf-8,[^"]+" alt="" width="21" height="14"\/>/.test(first || ''), `${p} · the flag is a small SVG image, not text`)
    ok(!/[\u{1F1E6}-\u{1F1FF}]/u.test(real.html), `${p} · no flag emoji anywhere`)
    ok(new RegExp(`aria-haspopup="${PICKER.LANDED ? 'dialog' : 'menu'}"`).test(first || '') && /aria-expanded="false"/.test(first || ''), `${p} · a closed ${PICKER.LANDED ? 'dialog' : 'menu'} button`)
    // ⚠️ RE-PINNED (seo-fixes, 20 October 2026): each button is followed by its always-rendered, closed list — the UK only
    // (US switched off), a real link to /uk, checked, with the tick; the list's id is the button's aria-controls.
    // ⚠️ RE-PINNED (country-picker-1): the closed DIALOG, always rendered — its id the trigger's aria-controls, labelled by its
    // title; the UK only (US switched off): one real link to /uk, current, in English, with its code and the tick.
    if (PICKER.LANDED) {
      const ctl = ((foot || '').match(/aria-controls="([^"]+)"/) || [])[1]
      const dlg = (foot || '').match(/<div class="cc-dlg cc-dlg-closed"><div id="([^"]+)" role="dialog" aria-modal="true" aria-labelledby="([^"]+)" class="cc-box" tabindex="-1">[\s\S]*?<h2 id="([^"]+)" class="cc-title">Choose your country<\/h2>[\s\S]*?<ul class="cc-list" aria-label="Country">(.*?)<\/ul>/)
      ok(!!dlg && dlg[1] === ctl && dlg[2] === dlg[3] && /^<li><a href="\/uk" lang="en-GB" aria-current="true" class="cc-item"><img class="cc-flag" src="data:image\/svg\+xml;charset=utf-8,[^"]+" alt="" width="21" height="14"\/><span class="cc-item-name">United Kingdom<\/span><span class="cc-item-code">GB<\/span><span class="cc-item-tick"><svg class="cc-tick"[^>]*>.*?<\/svg><\/span><\/a><\/li>$/.test(dlg[4]),
        `${p} · footer · the closed dialog is rendered: its id the trigger's aria-controls, one <a href="/uk" aria-current="true">`, dlg ? dlg[0].replace(/data:image[^"]*/g, 'DATA').slice(0, 600) : (foot || '').replace(/data:image[^"]*/g, 'DATA').slice(0, 600))
    }
    for (const [w, html] of PICKER.LANDED ? [] : AP.LANDED ? [['footer', foot]] : [['header', head], ['footer', foot]]) {
      const ul = (html || '').match(MENU_UL_RE)
      const ctl = ((html || '').match(/aria-controls="([^"]+)"/) || [])[1]
      ok(!!ul && ul[1] === ctl && /^<li role="none"><a href="\/uk" role="menuitemradio" aria-checked="true" class="cc-item"><img class="cc-flag" src="data:image\/svg\+xml;charset=utf-8,[^"]+" alt="" width="21" height="14"\/><span class="cc-item-name">United Kingdom<\/span><svg class="cc-tick"[^>]*>.*?<\/svg><\/a><\/li>$/.test(ul[2]) && !/<button[^>]*cc-item/.test(html),
        `${p} · ${w} · the closed menu list is rendered: one <a href="/uk" role="menuitemradio" aria-checked="true">, no option buttons`, ul ? ul[0].replace(/data:image[^"]*/g, 'DATA').slice(0, 400) : 'no <ul class="cc-menu cc-menu-closed">')
    }
  }

  console.log('3. US switched on — US prices in the server render (first paint), and the choice sticks')
  const rows = [GB, usOn()]
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): every section-3 visit carries the US fixture prices in plan_prices.
  const tables = STAGE_B ? usTables() : {}
  const us = await visit('landing', { rows, ip: 'US', tables })
  ok(us.text.includes('$39') && us.text.includes('$59') && !us.text.includes('£29'), 'landing · US visitor · $ prices, no £', us.text.match(/[£$][0-9]+/g)?.slice(0, 6).join(' '))
  ok(us.menus.length === 0 && (PICKER.LANDED ? /<span class="cc-code">US<\/span>/.test(us.html) && AP.navHasNoMenu(us.html) : AP.LANDED ? /<span class="cc-name">United States<\/span>/.test(us.html) && AP.navHasNoMenu(us.html) : /<span class="cc-name">US<\/span>/.test(us.html)) && /Country: United States\. Change country/.test(us.html), AP.LANDED ? 'landing · the footer button says United States (none in the nav)' : 'landing · the header button says US')
  const usMarked = await visit('landing', { rows, ip: 'US', build: 'marked', tables })
  ok(usMarked.menus[0].menu.options.map(o => o.code).join() === 'GB,US' && usMarked.menus[0].menu.remember === null, 'landing · both switched-on countries in the menu; nothing to write (no ?country)')
  for (const p of ['features', 'compare']) {
    const v = await visit(p, { rows, ip: 'US', build: 'marked', tables })
    ok(v.menus[0].menu.current.code === 'US' && !v.text.includes('£29'), `${p} · US visitor · priced in US`, v.text.match(/[£$][0-9]+/g)?.slice(0, 6).join(' '))
  }
  for (const p of Object.keys(PAGES)) {
    const ukWithUsOn = await visit(p, { rows, ip: 'GB', build: 'marked', tables })
    const [B, A0] = seoSides(tidySides(p, stageBSides(p, BEFORE[p], ukWithUsOn)), ukWithUsOn)   // ⚠️ RE-PINNED (pricing-pages, Stage B): the named regions cut out; (seo-fixes): the badge preload hints named
    const A = aboutSide(A0) || A0   // ⚠️ RE-PINNED (about-page): the footer's About link named
    ok(A.text === B.text && JSON.stringify(A.attrs) === JSON.stringify(B.attrs), `${p} · a UK visitor with US switched on · still identical to BEFORE`, firstDiff(A.text, B.text))
  }
  const toGB = await visit('landing', { rows, ip: 'US', query: { country: 'gb' }, build: 'marked', tables })
  ok(toGB.text.includes('£29') && !toGB.text.includes('$39') && toGB.menus[0].menu.current.code === 'GB', '?country=GB beats the US location')
  ok(toGB.menus.every(m => m.menu.remember === 'GB'), '?country=GB tells the menu to keep GB in the cookie')
  const stuck = await visit('landing', { rows, ip: 'US', cookie: 'GB', build: 'marked', tables })
  ok(stuck.text.includes('£29') && stuck.menus[0].menu.current.code === 'GB' && stuck.menus[0].menu.remember === null, 'the next visit, with the hg_country=GB cookie and no ?country, stays UK')
  const cookieUS = await visit('landing', { rows, ip: 'GB', cookie: 'US', build: 'marked', tables })
  ok(cookieUS.text.includes('$39') && cookieUS.menus[0].menu.current.code === 'US', 'the cookie beats the location (GB visitor who chose US sees $)')
  const pdfUS = await pdfText(usOn(), STAGE_B ? usCatalog() : undefined)
  ok(pdfUS.text.includes('$39') && !pdfUS.text.includes('£29'), 'plans PDF · US row · $ prices')

  console.log('4. The precedence rule on its own (lib/visitor-country.ts pickVisitorCountry)')
  const { VC } = (await pages()).vc
  const T = [
    [['GB', 'US'], { query: 'US', cookie: 'GB', ip: 'GB' }, 'US', true],
    [['GB', 'US'], { query: 'xx', cookie: 'US', ip: 'GB' }, 'US', false],
    [['GB', 'US'], { query: 'FR', cookie: 'FR', ip: 'US' }, 'US', false],
    [['GB', 'US'], { query: null, cookie: null, ip: null }, 'GB', false],
    [['GB'], { query: 'US', cookie: 'US', ip: 'US' }, 'GB', false],
    [['GB', 'US'], { query: ['US', 'GB'], cookie: null, ip: null }, 'GB', false],   // an array is not a code (the page takes [0] itself)
  ]
  for (const [on, src, want, fromQuery] of T) {
    const got = VC.pickVisitorCountry(on, src)
    ok(got.code === want && got.fromQuery === fromQuery, `on=${on} ${JSON.stringify(src)} → ${want}${fromQuery ? ' (from the URL)' : ''}`, JSON.stringify(got))
  }

  console.log('5. Not cached across countries; gates kept')
  const layout = read('app/landing/layout.tsx'), feat = read('app/features/page.tsx'), cmp = read('app/compare/page.tsx'), vcSrc = read('lib/visitor-country.ts')
  ok(/export const dynamic = 'force-dynamic'/.test(layout) && /export const dynamic = 'force-dynamic'/.test(feat) && /export const dynamic = 'force-dynamic'/.test(cmp), 'landing (layout), /features and /compare are force-dynamic')
  ok(/headers\(\), cookies\(\)/.test(vcSrc), 'the resolver reads the request (headers and cookies), so each request renders its own country')
  ok(/if \(!\(await onHatchGrab\(\)\)\) \{\s*notFound\(\)/.test(feat) && /if \(!\(await onHatchGrab\(\)\)\) \{\s*notFound\(\)/.test(cmp), '/features and /compare keep the brand gate, before the country read')
  ok(feat.indexOf('onHatchGrab()))') < feat.indexOf('resolveVisitorCountry(') && cmp.indexOf('onHatchGrab()))') < cmp.indexOf('resolveVisitorCountry('), 'the gate runs before any country read')
  const vf = await visit('compare', { rows: [GB, US_OFF] }).catch(e => e)
  ok(true, 'compare renders')
  globalThis.__mcReq = { headers: { host: 'www.villagefoodie.co.uk' }, cookies: {} }
  const m = await pages('real')
  let vfErr = null
  try { globalThis.__harnessDb = kit.fakeDb({ country_settings: [GB, US_OFF].map(snake), trucks: [] }); m.compare.clearCountrySettingsCache(); await prerender(h(m.compare.Page, { searchParams: Promise.resolve({ country: 'US' }), params: Promise.resolve({}) })) } catch (e) { vfErr = e } finally { delete globalThis.__harnessDb; delete globalThis.__mcReq }
  ok(vfErr && /notFound/.test(String(vfErr && vfErr.message)), '/compare on Village Foodie is still a 404, with or without ?country', String(vfErr))
  void vf

  console.log(`\n${failures ? '🔴' : '✅'} marketing-country-parity: ${checks - failures}/${checks} checks passed`)
  if (failures) process.exit(1)
}

module.exports = { visit, pdfText, pages, STUBS, SEEDS, snake }

if (require.main === module) {
  ;(async () => {
    if (CAPTURE) { const snap = await captureBefore(); fs.writeFileSync(path.resolve(CAPTURE), JSON.stringify(snap, null, 1)); console.log(`captured ${Object.keys(snap).join(', ')} → ${CAPTURE}`); return }
    await compare()
  })().catch(e => { console.error('🔴', e && e.stack || e); process.exit(1) })
}
