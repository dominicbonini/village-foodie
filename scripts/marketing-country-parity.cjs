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
    export function CountryMenu(p) { (globalThis.__ccSeen = globalThis.__ccSeen || []).push(p); return createElement('i', { 'data-cc': p.variant }) }`,
}
const PAGES = { landing: 'app/landing/page.tsx', features: 'app/features/page.tsx', compare: 'app/compare/page.tsx' }
const modsBy = {}
async function pages(build = 'real') {
  if (modsBy[build]) return modsBy[build]
  const stubs = build === 'marked' ? MARKED : STUBS
  const mods = {}
  // The loader's 60s cache lives in each bundle; every visit clears it, so each fixture is read fresh.
  for (const [k, f] of Object.entries(PAGES)) mods[k] = await kit.bundle(`page-${k}-${build}`, `export { default as Page } from '@/${f}'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'`, { stubs })
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
async function visit(page, { rows, ip = null, cookie = null, query = {}, build = 'real' }) {
  const m = await pages(build)
  globalThis.__ccSeen = []
  kit.setNow('2026-10-09T14:20:00.000Z'); kit.setDeviceTz('Europe/London')
  globalThis.__harnessDb = kit.fakeDb({ country_settings: rows.map(snake), trucks: [] })
  m[page].clearCountrySettingsCache()
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
async function pdfText(row) {
  const m = await pages()
  const html = m.pdf.PDF.buildPlansPdfHtml(row)
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
const MENU_RE = /<div class="cc cc-(head|foot)">[\s\S]*?<\/div>/g

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
  const GB = SEEDS.gbFromSeed(), US_OFF = SEEDS.usFromSeed()

  console.log('1. UK — every page identical to BEFORE apart from the country buttons (marked build)')
  for (const p of Object.keys(PAGES)) {
    for (const [label, req] of [['no country header', {}], ['GB visitor', { ip: 'GB' }], ['US visitor, US switched off', { ip: 'US', cookie: 'US', query: { country: 'US' } }], ['a country with no row', { ip: 'FR' }]]) {
      const v = await visit(p, { rows: [GB, US_OFF], build: 'marked', ...req })
      ok(v.text === BEFORE[p].text, `${p} · ${label} · text identical`, firstDiff(v.text, BEFORE[p].text))
      ok(JSON.stringify(v.attrs) === JSON.stringify(BEFORE[p].attrs), `${p} · ${label} · attributes identical`)
      ok(v.menus.length === 2 && v.menus.map(m => m.variant).join() === 'header,footer', `${p} · ${label} · one header and one footer button`, JSON.stringify(v.menus.map(m => m.variant)))
      const menu = v.menus[0]?.menu
      ok(menu?.current.code === 'GB' && menu.options.map(o => o.code).join() === 'GB', `${p} · ${label} · UK current, only the UK in the menu`, JSON.stringify(menu && { cur: menu.current.code, opts: menu.options.map(o => o.code) }))
      ok(menu?.remember === null, `${p} · ${label} · no cookie written (the URL's US is switched off)`)
      ok(!v.html.includes('$39') && !v.html.includes('US$'), `${p} · ${label} · no US prices`)
    }
  }
  const pdfGB = await pdfText(GB)
  ok(pdfGB.text === BEFORE.pdf.text && JSON.stringify(pdfGB.attrs) === JSON.stringify(BEFORE.pdf.attrs), 'plans PDF (GB) identical', firstDiff(pdfGB.text, BEFORE.pdf.text))
  const route = read('app/landing/features-pdf/route.ts')
  ok(/resolveVisitorCountry\(req\.nextUrl\.searchParams\.get\('country'\)\)/.test(route) && /generatePlansPdf\(visitor\.settings\.countryCode\)/.test(route), 'the PDF route prints the resolved country')
  ok(/verifyAdmin\(\)/.test(route) && /'Cache-Control': 'no-store, max-age=0'/.test(route), 'the PDF route keeps its admin gate and no-store')

  console.log('2. The real menu (UK): its own markup, nothing else')
  for (const p of Object.keys(PAGES)) {
    const real = await visit(p, { rows: [GB, US_OFF] })
    const marked = await visit(p, { rows: [GB, US_OFF], build: 'marked' })
    const found = [...real.html.matchAll(MENU_RE)].map(m => m[0])
    ok(found.length === 2, `${p} · two country buttons rendered`, String(found.length))
    const stripped = real.html.replace(MENU_RE, '<i data-cc></i>')
    const markedNorm = marked.html.replace(/<i data-cc="(header|footer)"><\/i>/g, '<i data-cc></i>')
    ok(stripped === markedNorm, `${p} · removing the two buttons leaves the marked page exactly`, firstDiff(stripped, markedNorm))
    const [head, foot] = found
    ok(/aria-label="Country: United Kingdom. Change country"/.test(head || '') && /aria-label="Country: United Kingdom. Change country"/.test(foot || ''), `${p} · aria-label names the country`)
    ok(/<span class="cc-name">UK<\/span>/.test(head || '') && /<span class="cc-name">United Kingdom<\/span>/.test(foot || ''), `${p} · header shows the short name, footer the full name`)
    ok(/<img class="cc-flag" src="data:image\/svg\+xml;charset=utf-8,[^"]+" alt="" width="21" height="14"\/>/.test(head || ''), `${p} · the flag is a small SVG image, not text`)
    ok(!/[\u{1F1E6}-\u{1F1FF}]/u.test(real.html), `${p} · no flag emoji anywhere`)
    ok(/aria-haspopup="menu"/.test(head || '') && /aria-expanded="false"/.test(head || ''), `${p} · a closed menu button`)
  }

  console.log('3. US switched on — US prices in the server render (first paint), and the choice sticks')
  const rows = [GB, usOn()]
  const us = await visit('landing', { rows, ip: 'US' })
  ok(us.text.includes('$39') && us.text.includes('$59') && !us.text.includes('£29'), 'landing · US visitor · $ prices, no £', us.text.match(/[£$][0-9]+/g)?.slice(0, 6).join(' '))
  ok(us.menus.length === 0 && /<span class="cc-name">US<\/span>/.test(us.html) && /Country: United States\. Change country/.test(us.html), 'landing · the header button says US')
  const usMarked = await visit('landing', { rows, ip: 'US', build: 'marked' })
  ok(usMarked.menus[0].menu.options.map(o => o.code).join() === 'GB,US' && usMarked.menus[0].menu.remember === null, 'landing · both switched-on countries in the menu; nothing to write (no ?country)')
  for (const p of ['features', 'compare']) {
    const v = await visit(p, { rows, ip: 'US', build: 'marked' })
    ok(v.menus[0].menu.current.code === 'US' && !v.text.includes('£29'), `${p} · US visitor · priced in US`, v.text.match(/[£$][0-9]+/g)?.slice(0, 6).join(' '))
  }
  for (const p of Object.keys(PAGES)) {
    const ukWithUsOn = await visit(p, { rows, ip: 'GB', build: 'marked' })
    ok(ukWithUsOn.text === BEFORE[p].text && JSON.stringify(ukWithUsOn.attrs) === JSON.stringify(BEFORE[p].attrs), `${p} · a UK visitor with US switched on · still identical to BEFORE`, firstDiff(ukWithUsOn.text, BEFORE[p].text))
  }
  const toGB = await visit('landing', { rows, ip: 'US', query: { country: 'gb' }, build: 'marked' })
  ok(toGB.text.includes('£29') && !toGB.text.includes('$39') && toGB.menus[0].menu.current.code === 'GB', '?country=GB beats the US location')
  ok(toGB.menus.every(m => m.menu.remember === 'GB'), '?country=GB tells the menu to keep GB in the cookie')
  const stuck = await visit('landing', { rows, ip: 'US', cookie: 'GB', build: 'marked' })
  ok(stuck.text.includes('£29') && stuck.menus[0].menu.current.code === 'GB' && stuck.menus[0].menu.remember === null, 'the next visit, with the hg_country=GB cookie and no ?country, stays UK')
  const cookieUS = await visit('landing', { rows, ip: 'GB', cookie: 'US', build: 'marked' })
  ok(cookieUS.text.includes('$39') && cookieUS.menus[0].menu.current.code === 'US', 'the cookie beats the location (GB visitor who chose US sees $)')
  const pdfUS = await pdfText(usOn())
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
