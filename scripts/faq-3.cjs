// scripts/faq-3.cjs — faq-3's proof (2 November 2026; docs/faq-3-report.md): the FAQ on the English landing pages.
//
//   1 · GB, US and IE show the FAQ, each with its own prices (every amount in the cost answer is one the page's pricing cards print);
//       the FAQPage JSON-LD sits in the page's @graph as "<canonical>#faq" and its questions and answers equal the visible ones exactly
//   2 · every English page (the switched-on English-locale countries, read from the locale config): …0010 absent, no banned wording in
//       the FAQ or its JSON-LD; the section sits between pricing and the final CTA, in the white/wash sequence
//   3 · the rules: a show_in-hidden question, a question failing the check and an empty section are left out (and logged); nothing
//       published → no section and no FAQPage; the published fixture rows carry no banned wording; the check refuses to publish it
//   4 · an Admin publish / unpublish (the real route) refreshes the English landing page; nothing else does inside the cache's minute
//   5 · DE, FR, BR and JP landing pages and every comparison page (and its twins) byte-identical to HEAD, with the FAQ rows present;
//       GB and US landing pages byte-identical to HEAD when nothing is published
//   6 · translation-check: landing.faq.title in en-GB and all 28 bases, structural unchanged (the three faq.phrases keys)
//
// The FAQ rows are scripts/fixtures/faq-3-rows.json (read live, read-only, after 20261059 ran). §5's HEAD side is
// scripts/fixtures/faq-3-identity.json, written by THIS script in a worktree of the commit before faq-3's code:
//   git worktree add --detach <dir> a92f983a && cp scripts/faq-3.cjs scripts/fixtures/faq-3-rows.json into it && (in <dir>)
//   HG_KIT_CACHE_SUFFIX=faq3head node scripts/faq-3.cjs capture <this repo>/scripts/fixtures/faq-3-identity.json
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS script, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const kit = require('./_render-kit.cjs')({ cacheTag: 'faq-3' })
const LP1E = require('./_lp1e-fixtures.cjs')
const WF = require('./_world-countries-1-fixtures.cjs')
const CDE = require('./_compare-de-1-fixtures.cjs')
const FIX = require('./fixtures/faq-3-rows.json')
// ⚠️ RE-PINNED (seo-geo-2 B3, 2 November 2026): the landing pages are hashed as HEAD rendered them — the JSON-LD's operatingSystem
// set back to "Web, iOS, Android" where seo-geo-2 made it "Web" (scripts/_lp-seo-geo-2.cjs asBefore; seo-geo-2.cjs proves the value).
// ⚠️ RE-PINNED (store-badges-1, 2 November 2026): hashed with the footer's store badges and the Play URL's &hl=en taken out (scripts/
// _lp-store-badges-1.cjs strip, both sides; the badges follow the app flags now and are proven by scripts/store-badges-1.cjs).
const SB1 = require('./_lp-store-badges-1.cjs')
const SG2 = require('./_lp-seo-geo-2.cjs')
const IDENTITY = path.join(REPO, 'scripts/fixtures/faq-3-identity.json')
// ⚠️ RE-PINNED (faq-4, 2 November 2026): the FAQ left the landing pages for its own page, /<country>/faq (app/faq/page.tsx — the same
// rules, the same <FaqDetails> list, the same FAQPage builder). §1–§4 read that page now: the section's place on the landing page and
// its white/wash band are replaced by "the landing page carries no FAQ"; nothing published, or no translation, is a 404. §6 reads
// faq-4's two new landing.faq keys beside the title. scripts/faq-4.cjs proves the page, its frame and the landing pages without it.
// §5's comparison pages are hashed without faq-4's footer FAQ link (scripts/_lp-faq-4.cjs noFaqLink, both sides; faq-4 §6 proves
// where it shows).
const { noFaqLink } = require('./_lp-faq-4.cjs')
// ⚠️ RE-PINNED (competitor-features-2, 3 November 2026): §5's comparison pages are rendered with the feature list as it was — no
// "notify" row, "payattruck" still shown (scripts/_lp-competitor-features-2.cjs tables; competitor-features-2.cjs proves both).
const CF2 = require('./_lp-competitor-features-2.cjs')

let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${detail === undefined ? '' : ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400)}`) } }
const head = s => console.log(`\n── ${s}`)
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex')
const SCX = h => require('./_lp-site-chrome-1.cjs').asCopyTruth(h)   // eslint-disable-line @typescript-eslint/no-require-imports -- ⚠️ RE-PINNED (site-chrome-1): today's offline sentence written as copy-truth-1 wrote it (scripts/_lp-site-chrome-1.cjs asCopyTruth)
const FAQ = () => JSON.parse(JSON.stringify({ faq_sections: FIX.faq_sections, faq_items: FIX.faq_items }))

// ── §5's set: rendered identically at HEAD (capture) and here ──────────────────────────────────────────────────────────────────
async function identitySet() {
  const out = {}
  // Landing pages over world-countries-1's renderer (every live country plus the eight world rows, all on).
  const wf = WF.renderer(kit, 'faq3-wf')
  const rows = WF.rowsWith(WF.WORLD)
  // GB and US first, with NO FAQ rows: the empty FAQ renders nothing, so the page is HEAD's.
  for (const seg of ['uk', 'us']) {
    const r = await kit.quietAsync(() => wf.page('landing', seg, rows))
    out[`landing:${seg}:no-faq`] = { html: sha(SB1.strip(SG2.asBefore(SCX(r.html)))), meta: sha(JSON.stringify(r.meta)), redirectedTo: r.redirectedTo }
  }
  Object.assign(wf.tables, FAQ())   // the renderer's own tables object — every request after this holds the FAQ rows
  for (const seg of ['de', 'fr', 'br', 'jp']) {
    const r = await kit.quietAsync(() => wf.page('landing', seg, rows))
    out[`landing:${seg}`] = { html: sha(SB1.strip(SG2.asBefore(SCX(r.html)))), meta: sha(JSON.stringify(r.meta)), redirectedTo: r.redirectedTo }
  }
  // Comparison pages over compare-de-1's renderer: every visibility and view, the till players, the app flags, the twins, with the
  // FAQ rows in the database too.
  const cmp = await CDE.renderer(kit, 'faq3-cmp')
  const faqT = { ...FAQ(), ...CF2.tables() }
  const pages = {
    'de:live': { status: 'live' },
    'de:live:apps': { status: 'live', apps: true },
    'de:live:global': { status: 'live', tables: CDE.GLOBAL_TABLES() },
    'de:admin:admin': { status: 'admin', admin: true },
    'de:admin:admin:public-view': { status: 'admin', admin: true, search: { view: 'public' } },
    'de:admin:visitor': { status: 'admin' },
    'de:off': { status: 'off' },
  }
  for (const [k, o] of Object.entries(pages)) {
    const r = await kit.quietAsync(() => cmp.page({ ...o, tables: { ...faqT, ...(o.tables || {}) } }))
    out[`comparison:${k}`] = { html: sha(SB1.strip(SG2.asBefore(SCX(r.html)))), meta: sha(JSON.stringify(r.meta)), notFound: r.notFound, empty: !r.html }
  }
  for (const f of ['md', 'json']) {
    const r = await kit.quietAsync(() => cmp.twin(f, { status: 'live', tables: faqT }))
    out[`comparison:de:live.${f}`] = { status: r.status, body: sha(r.body) }
  }
  // An English comparison page: GB's, live (its address from en-GB's comparison.path), no competitors.
  const gbRows = CDE.rowsWith('off').map(r => (r.countryCode === 'GB' ? { ...r, comparisonStatus: 'live' } : r))
  const gb = await kit.quietAsync(() => cmp.ctx.withReq({ rows: gbRows, tables: { ...faqT, plans: cmp.catalog.plans.map(LP1E.snake), plan_prices: cmp.catalog.prices.map(LP1E.snake), plan_features: cmp.catalog.features.map(LP1E.snake) } }, async () => {
    cmp.M.__p(); cmp.M.__cmp()
    const args = { params: Promise.resolve({ country: 'uk', section: 'comparison', slug: 'food-truck-ordering-system' }), searchParams: Promise.resolve({}) }
    const meta = await cmp.M.generateMetadata(args)
    return { meta, html: await cmp.ctx.prerender(kit.h(cmp.M.default, args)) }
  }))
  out['comparison:gb:live'] = { html: sha(SB1.strip(noFaqLink(SCX(gb.html)))), meta: sha(JSON.stringify(gb.meta)) }
  return out
}

if (process.argv[2] === 'capture') {
  (async () => {
    const out = await identitySet()
    fs.writeFileSync(process.argv[3], JSON.stringify({ $why: 'faq-3 §5: sha256 of each page as rendered at the commit before faq-3 (a92f983a), by scripts/faq-3.cjs capture.', commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO }).toString().trim(), pages: out }, null, 1) + '\n')
    console.log(`captured ${Object.keys(out).length} pages`)
  })().catch(e => { console.error(e); process.exit(1) })
  return
}

// ── HTML helpers ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const ents = s => s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const sectionOf = (html, id) => { const m = new RegExp(`<section id="${id}"[^>]*>[\\s\\S]*?</section>`).exec(html); return m ? m[0] : null }
function visibleFaq(html) {
  // ⚠️ RE-PINNED (faq-4): the FAQ page's section (the /features frame's band), its heading the page's <h1>.
  const sec = html && /<div class="faq">/.test(html) ? (/<section class="band features-page">[\s\S]*?<\/section>/.exec(html) || [])[0] : null
  if (!sec) return null
  const groups = []
  for (const g of sec.split('<div class="faq-group">').slice(1)) {
    const label = ents(/<p class="faq-label">([\s\S]*?)<\/p>/.exec(g)[1])
    const items = [...g.matchAll(/<details class="faq-q"><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)].map(m => ({ q: ents(m[1]), a: ents(m[2]) }))
    groups.push({ label, items })
  }
  return { sec, groups, pairs: groups.flatMap(g => g.items), title: ents((/<h1>([\s\S]*?)<\/h1>/.exec(sec) || [])[1] || '') }
}
function graphOf(html) {
  const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)
  return m ? JSON.parse(m[1]) : null
}
const faqLd = g => (g?.['@graph'] || []).find(n => n['@type'] === 'FAQPage') || null
const sectionOrder = html => [...html.matchAll(/<section(?: id="([a-z-]+)")?(?: class="([a-z ]+)")?/g)].map(m => `${m[1] || '-'}:${m[2] || 'white'}`)

;(async () => {
  // ── the FAQ bundle: the landing page, the Admin route (admin stubbed) and the libraries, sharing ONE public-FAQ cache ──
  const ctx = LP1E.context(kit, REPO)
  const ADMIN_STUB = "export async function adminUser() { return globalThis.__faqAdmin ? { id: 'admin-1', email: 'admin@example.test' } : null }\nexport async function verifyAdmin() { return !!globalThis.__faqAdmin }"
  const M = await ctx.bundle('faq3-live', [
    "export { default as Landing, generateMetadata } from '@/app/(public)/[country]/page'",
    "export { default as FaqPage, generateMetadata as faqMetadata } from '@/app/(public)/[country]/faq/page'",   // ⚠️ RE-PINNED (faq-4)
    "export { POST } from '@/app/api/admin/faq/route'",
    "export { clearPublicFaqCache as __faq, landingFaq } from '@/lib/faq/public'",
    "export { clearPlanCatalogCache as __p } from '@/lib/plans-server'",
    "export { clearComparisonCache as __cmp } from '@/lib/comparison-flags'",
    "export { checkItem, bannedWordingIn, BANNED_WORDING } from '@/lib/faq/check'",
    "export { serviceFaqStore } from '@/lib/admin/faq-store'",
    "export { faqAction } from '@/lib/admin/faq-actions'",
    "export { isEnglish } from '@/lib/i18n/locales'",
    "export { getCountrySettings } from '@/lib/country-settings'",
    "export { COUNTRY_PATH_SEGMENTS } from '@/lib/marketing-country'",
  ].join('\n'), { stubs: { '@/lib/auth/admin': ADMIN_STUB } })
  const wf = WF.renderer(kit, 'faq3-wf-tables')
  // The app flags as live: the iPad and Android app in the UK stores only (country_settings, 20261042).
  const ROWS = WF.rowsWith(WF.WORLD).map(r => ({ ...r, iosAppAvailable: r.countryCode === 'GB', androidAppAvailable: r.countryCode === 'GB' }))
  const logs = []
  // ⚠️ RE-PINNED (faq-4): `landing` renders the country's FAQ page (/<seg>/faq; notFound → { notFound: true, html: null });
  // `landingPage` the landing page itself, for its prices and for "no FAQ here".
  async function landingPage(seg, faqTables) {
    return ctx.withReq({ rows: ROWS, tables: { ...wf.tables, ...faqTables } }, async () => {
      M.__p(); M.__cmp(); M.__faq()
      const args = { params: Promise.resolve({ country: seg }), searchParams: Promise.resolve({}) }
      return kit.quietAsync(async () => ({ meta: await M.generateMetadata(args), html: await ctx.prerender(kit.h(M.Landing, args)) }))
    })
  }
  async function landing(seg, faqTables, { clear = true } = {}) {
    return ctx.withReq({ rows: ROWS, tables: { ...wf.tables, ...faqTables } }, async () => {
      M.__p(); M.__cmp(); if (clear) M.__faq()
      const args = { params: Promise.resolve({ country: seg }), searchParams: Promise.resolve({}) }
      const q = [console.info, console.warn, console.error]
      console.info = (...a) => logs.push(['info', a.join(' ')]); console.warn = (...a) => logs.push(['warn', a.join(' ')]); console.error = (...a) => logs.push(['error', a.join(' ')])
      try {
        // The page's own renderer silences console.warn (LP1E prerender), so the FAQ is resolved here first — logged, and cached —
        // and the page below reads that cache entry: the same call the page makes, with the same result.
        if (clear) await M.landingFaq(await M.getCountrySettings(codeOf(seg)))
        try {
          const meta = await M.faqMetadata(args)
          return { meta, html: await ctx.prerender(kit.h(M.FaqPage, args)) }
        } catch (e) { if (e?.message === 'notFound') return { notFound: true, meta: null, html: null }; throw e }
      } finally { [console.info, console.warn, console.error] = q }
    })
  }
  const segOf = { ...M.COUNTRY_PATH_SEGMENTS }
  const codeOf = seg => Object.keys(segOf).find(c => segOf[c] === seg)
  const ENGLISH = ROWS.filter(r => r.enabled && M.isEnglish(r.locale) && segOf[r.countryCode]).map(r => r.countryCode).sort()

  head('1 · GB, US and IE show the FAQ with their own prices; the FAQPage JSON-LD equals the visible text (faq-4: on /<country>/faq)')
  const pages = {}
  for (const cc of ['GB', 'US', 'IE']) pages[cc] = await landing(segOf[cc], FAQ())
  const CUR = { GB: '£', US: '$', IE: '€' }
  for (const [cc, p] of Object.entries(pages)) {
    const v = visibleFaq(p.html)
    t(`${cc}: the FAQ section renders`, !!v && v.pairs.length > 0)
    if (!v) continue
    t(`${cc}: heading "Frequently asked questions", no sub-line`, v.title === 'Frequently asked questions' && !/class="lede"/.test(v.sec), v.title)
    t(`${cc}: section labels in Admin order`, JSON.stringify(v.groups.map(g => g.label)) === JSON.stringify(FIX.faq_sections.map(s => s.title_en)), v.groups.map(g => g.label))
    const cost = v.pairs.find(x => x.q === 'How much does HatchGrab cost?')
    const amounts = cost ? cost.a.match(/[£$€]\d+(?:,\d{3})*(?:\.\d{2})?/g) || [] : []
    const pricing = sectionOf((await landingPage(segOf[cc], FAQ())).html, 'pricing') || ''   // ⚠️ RE-PINNED (faq-4): the landing page's cards
    t(`${cc}: the cost answer is in ${CUR[cc]} and every amount in it is one the pricing cards print`, amounts.length >= 3 && amounts.every(a => a.startsWith(CUR[cc]) && ents(pricing).includes(a)), { amounts, answer: cost?.a })
    t(`${cc}: no token left unfilled`, !v.pairs.some(x => /[{}]/.test(x.q + x.a)))
    const ld = faqLd(graphOf(p.html))
    const canonical = p.meta.alternates.canonical
    t(`${cc}: FAQPage in the FAQ page's @graph, @id = canonical + "#faq" (${canonical}#faq)`, !!ld && ld['@id'] === `${canonical}#faq`, ld?.['@id'])
    const ldPairs = ld ? ld.mainEntity.map(e => ({ q: e.name, a: e.acceptedAnswer.text })) : []
    t(`${cc}: every JSON-LD question and answer equals the visible one, in order (${ldPairs.length})`, JSON.stringify(ldPairs) === JSON.stringify(v.pairs))
    t(`${cc}: answers are in the HTML while closed (no <details open>)`, !/<details[^>]* open/.test(v.sec) && v.pairs.every(x => x.a.length > 20))
  }
  t('US and GB answers differ only where their values do (the cost answers are not the same text)', visibleFaq(pages.GB.html).pairs[0].a !== visibleFaq(pages.US.html).pairs[0].a)
  const gbPairs = visibleFaq(pages.GB.html).pairs, usPairs = visibleFaq(pages.US.html).pairs
  const appsQ = gbPairs.find(x => x.q.startsWith('Do I need an iPad'))?.a ?? '', appsQUs = usPairs.find(x => x.q.startsWith('Do I need an iPad'))?.a ?? ''
  t('…0007: Dominic\'s wording; the apps sentence in GB (apps in the stores) and not in the US', appsQ.startsWith('No. HatchGrab runs in the web browser') && appsQ.includes('customers can pay for pre-orders online by card') && appsQ.length > appsQUs.length && appsQUs.endsWith('the card machine you already have.'), { appsQ, appsQUs })
  const trialQ = gbPairs.find(x => x.q.startsWith('Is there a free trial'))?.a ?? ''
  t('…0003: the card-payments sentence is gone', trialQ.length > 0 && !/Connect online card payments/.test(trialQ), trialQ)

  head(`2 · every English page (${ENGLISH.join(', ')}): …0010 absent, no banned wording; the landing page carries no FAQ (faq-4)`)
  t('the English pages are the switched-on English-locale countries with a page (9, as live)', ENGLISH.join(',') === 'AU,CA,GB,GI,IE,MT,NZ,SG,US', ENGLISH)
  const BANNED = /pay at hatch|pay at the truck|pay when they collect|\{payAtTruck\}/i
  const q10 = FIX.faq_items.find(i => i.id.endsWith('0010'))
  for (const cc of ENGLISH) {
    const p = pages[cc] || await landing(segOf[cc], FAQ())
    const v = visibleFaq(p.html)
    const ld = faqLd(graphOf(p.html))
    t(`${cc}: FAQ shown, FAQPage present`, !!v && !!ld)
    t(`${cc}: …0010 ("${q10.question_en}") absent from the page and the JSON-LD`, !p.html.includes(q10.question_en.replace(/'/g, '&#x27;')) && !JSON.stringify(ld).includes(q10.question_en))
    t(`${cc}: no banned wording in the FAQ or its JSON-LD`, !!v && !BANNED.test(ents(v.sec)) && !BANNED.test(JSON.stringify(ld)))
    // ⚠️ RE-PINNED (faq-4): was "between pricing and the final CTA" and its white/wash band — the landing page has no FAQ now.
    const lp = await landingPage(segOf[cc], FAQ())
    const order = sectionOrder(lp.html).map(s => s.split(':')[0])
    t(`${cc}: the landing page carries no FAQ section and no FAQPage; pricing is followed by the final CTA again`, !/id="faq"/.test(lp.html) && !faqLd(graphOf(lp.html)) && order[order.indexOf('pricing') + 1] === 'try', order)
  }
  const de = await landing('de', FAQ())
  // ⚠️ RE-PINNED (faq-4): /de/faq with no German translation is a 404; the /de landing page shows no FAQ either.
  const deLanding = await landingPage('de', FAQ())
  t('DE (a German page, no translations): /de/faq is a 404, and /de shows no FAQ, no heading, no FAQPage — even with every row published', de.notFound && !/id="faq"/.test(deLanding.html) && !faqLd(graphOf(deLanding.html)) && !deLanding.html.includes('Frequently asked questions'))

  head('3 · the rules: show_in, the check, empty sections, nothing published')
  const S = FIX.faq_sections[0].id
  const extra = (id, over) => ({ id, section_id: S, position: 50, question_en: `Synthetic ${id}?`, answer_en: 'A plain answer for the harness.', answer_single_plan_en: null, show_in: 'all', status: 'published', ...over })
  const withExtra = FAQ()
  withExtra.faq_items.push(
    extra('x-apps', { question_en: 'Synthetic apps-only question?', show_in: 'apps' }),
    extra('x-token', { question_en: 'Synthetic unknown-token question?', answer_en: 'From {nope.price}.' }),
    extra('x-banned', { question_en: 'Synthetic banned-wording question?', answer_en: 'Yes, customers can pay at the truck.' }),
    extra('x-draft', { question_en: 'Synthetic draft question?', status: 'draft', section_id: 'x-empty' }),
  )
  withExtra.faq_sections.push({ id: 'x-empty', position: 9, title_en: 'Synthetic empty section' })
  logs.length = 0
  const gbX = visibleFaq((await landing('uk', withExtra)).html), usX = visibleFaq((await landing('us', withExtra)).html)
  const qs = v => v.pairs.map(x => x.q)
  t('show_in "apps": shown in GB (apps in the stores), absent in the US', qs(gbX).includes('Synthetic apps-only question?') && !qs(usX).includes('Synthetic apps-only question?'))
  t('…and the US hiding is logged server-side', logs.some(([l, m]) => l === 'info' && /US: "Synthetic apps-only question\?" \(x-apps\) is hidden here by show_in 'apps'/.test(m)))
  t('fixture …0005 (show_in plan:payg) follows the plan: shown in GB, hidden where Pay as you go isn\'t offered', qs(gbX).includes('What if I only trade part of the year?'))
  t('a question failing the check (an unknown token) is left out, and logged', !qs(gbX).includes('Synthetic unknown-token question?') && logs.some(([l, m]) => l === 'warn' && /GB: "Synthetic unknown-token question\?" \(x-token\) is left out — it fails the check/.test(m)))
  t('a published answer with banned wording is left out, and logged', !qs(gbX).includes('Synthetic banned-wording question?') && logs.some(([l, m]) => l === 'warn' && /x-banned.*Published answers can't mention Pay at Hatch/.test(m)))
  t('a section with nothing visible is left out (no label)', !gbX.groups.some(g => g.label === 'Synthetic empty section'))
  const none = FAQ(); none.faq_items.forEach(i => { i.status = 'draft' })
  const gbNone = await landing('uk', none)
  // ⚠️ RE-PINNED (faq-4): nothing published → /uk/faq is a 404 (no section, no FAQPage); the landing's final CTA as before faq-3.
  t('nothing published: no FAQ section and no FAQPage (/uk/faq is a 404)', gbNone.notFound && !gbNone.html)
  t('…and the final CTA keeps its HEAD band (GB white)', /<section id="try">/.test((await landingPage('uk', none)).html))
  t('the fixture: 24 published, …0010 the only draft, …0017 and …0022 absent', FIX.faq_items.filter(i => i.status === 'published').length === 24 && FIX.faq_items.filter(i => i.status === 'draft').map(i => i.id.slice(-4)).join() === '0010' && !FIX.faq_items.some(i => /00(17|22)$/.test(i.id)))
  const toText = i => ({ questionEn: i.question_en, answerEn: i.answer_en, answerSinglePlanEn: i.answer_single_plan_en, showIn: i.show_in })
  const bannedPublished = FIX.faq_items.filter(i => i.status === 'published' && M.bannedWordingIn(toText(i)).length)
  t('no published answer contains {payAtTruck}, "Pay at Hatch", "pay at the truck" or "pay when they collect"', bannedPublished.length === 0, bannedPublished.map(i => i.id))
  t('…0010 (the draft) does — which is why it is a draft', M.bannedWordingIn(toText(q10)).join() === '{payAtTruck},pay when they collect', M.bannedWordingIn(toText(q10)))
  // The check and the Admin action, over the fixtures' world.
  const world = await ctx.withReq({ rows: ROWS, tables: { ...wf.tables, ...FAQ() } }, async () => { M.__p(); return M.serviceFaqStore.world() })
  t(`the fixtures' world: ${world.countries.length} switched-on countries, as live`, world.countries.length === 44, world.countries.length)
  for (const i of FIX.faq_items.filter(r => r.status === 'published')) {
    const c = M.checkItem(toText(i), world)
    t(`the check, every switched-on country: …${i.id.slice(-4)} "${i.question_en}" reads correctly where it shows (${c.shownCount})`, c.ok && c.shownCount > 0, c.sentences)
  }
  for (const [label, text] of [['{payAtTruck}', 'With {payAtTruck}, sure.'], ['Pay at Hatch', 'Use Pay at Hatch.'], ['pay at the truck', 'They can Pay At The Truck.'], ['pay when they collect', 'Customers pay when they collect.']]) {
    const c = M.checkItem({ questionEn: 'Q?', answerEn: text, answerSinglePlanEn: null, showIn: 'all' }, world)
    t(`the check fails an answer with "${label}" (any case), with a plain sentence`, !c.ok && c.sentences.some(s => /Published answers can't mention Pay at Hatch, paying at the truck or paying when customers collect\./.test(s)), c.sentences)
  }
  t('…in the single-plan answer too', !M.checkItem({ questionEn: 'Q?', answerEn: 'Fine.', answerSinglePlanEn: 'Pay at Hatch.', showIn: 'all' }, world).ok)
  t('…and passes the same answer without it', M.checkItem({ questionEn: 'Q?', answerEn: 'Customers pay online by card.', answerSinglePlanEn: null, showIn: 'all' }, world).ok)
  const draftItem = { id: 'x1', sectionId: S, position: 1, questionEn: 'Q?', answerEn: 'Customers can pay at the truck.', answerSinglePlanEn: null, showIn: 'all', status: 'draft', note: null, noteDone: false, publishedAt: null, createdAt: '', updatedAt: '', updatedBy: null }
  const writes = []
  const store = { items: async () => [draftItem], world: async () => world, updateItem: async (...a) => { writes.push(a); return null } }
  const pub = await M.faqAction(store, { action: 'item.publish', id: 'x1' }, { by: 'admin', at: '2026-11-02T12:00:00Z' })
  t('Admin: publishing it is refused (400) with the plain message, and nothing is written', !pub.ok && pub.status === 400 && /Published answers can't mention Pay at Hatch/.test(pub.error) && writes.length === 0, pub)
  const pubItem = { ...draftItem, answerEn: 'Customers pay online.', status: 'published' }
  const save = await M.faqAction({ ...store, items: async () => [pubItem] }, { action: 'item.update', id: 'x1', patch: { answerEn: 'Or Pay at Hatch.' } }, { by: 'admin', at: '2026-11-02T12:00:00Z' })
  t('Admin: saving a PUBLISHED question with it is refused too, and nothing is written', !save.ok && save.status === 400 && /Published answers can't mention/.test(save.error) && writes.length === 0, save)

  head('4 · an Admin publish / unpublish refreshes the English FAQ page (the real route, no deploy; faq-4: /uk/faq)')
  const live = FAQ()
  const Q4 = 'Is there a contract? Can I cancel anytime?'
  const row4 = live.faq_items.find(i => i.question_en === Q4)
  const shows = async () => (visibleFaq((await landing('uk', live, { clear: false })).html)?.pairs || []).some(x => x.q === Q4)
  async function post(body, admin = true) {
    return ctx.withReq({ rows: ROWS, tables: { ...wf.tables, ...live } }, async () => {
      globalThis.__faqAdmin = admin
      try { const r = await kit.quietAsync(() => M.POST({ json: async () => body })); return r.status } finally { delete globalThis.__faqAdmin }
    })
  }
  await landing('uk', live)   // warm the cache
  t('before: the question shows', await shows())
  row4.status = 'draft'        // what the database holds once Admin has unpublished it
  t('the cache holds for its minute: the database changed, the page did not (no route call yet)', await shows())
  const st1 = await post({ action: 'item.unpublish', id: row4.id })
  t(`after POST item.unpublish (answered ${st1}): the question is gone from /uk/faq`, !(await shows()))
  row4.status = 'published'
  t('…republished in the database: still gone until the route runs', !(await shows()))
  const st2 = await post({ action: 'item.publish', id: row4.id })
  t(`after POST item.publish (answered ${st2}): the question is back`, await shows())
  row4.question_en = 'Is there a contract?'
  await post({ action: 'item.move', id: row4.id, dir: 1 })
  t('a reorder / save (any POST) refreshes too: the renamed question shows', (visibleFaq((await landing('uk', live, { clear: false })).html)?.pairs || []).some(x => x.q === 'Is there a contract?'))
  const src = fs.readFileSync(path.join(REPO, 'app/api/admin/faq/route.ts'), 'utf8')
  // ⚠️ RE-PINNED (seo-geo-2 B6): the finally also schedules the IndexNow submission after the clear.
  t('the route clears the cache in a finally after EVERY POST (save, publish, unpublish, reorder, delete)', /finally \{\s*clearPublicFaqCache\(\)/.test(src))

  head('5 · DE, FR, BR, JP landing and every comparison page byte-identical to HEAD (GB/US too with nothing published)')
  if (!fs.existsSync(IDENTITY)) t('scripts/fixtures/faq-3-identity.json exists (captured at HEAD)', false)
  else {
    const want = JSON.parse(fs.readFileSync(IDENTITY, 'utf8'))
    const got = await identitySet()
    t(`the same ${Object.keys(want.pages).length} pages`, JSON.stringify(Object.keys(got).sort()) === JSON.stringify(Object.keys(want.pages).sort()), Object.keys(got))
    // ⚠️ RE-PINNED (compare-suits-1, 6 November 2026): the comparison pages change ON PURPOSE — at most four competitors, "Not listed",
    // "Which suits your food truck?" and two methodology sentences (docs/compare-suits-1-report.md; scripts/compare-suits-1.cjs and
    // compare-de-1.cjs prove what they now say). Here they must still render; a 404 (off, an anonymous visitor on an admin page) and every other page stay byte-identical to the capture.
    for (const [k, v] of Object.entries(want.pages)) {
      if (k.startsWith('comparison:') && !v.notFound) t(`${k}: changed on purpose by compare-suits-1 — still renders (status and metadata as captured)`, !!got[k] && !got[k].empty && got[k].notFound === v.notFound
        && (v.meta === undefined || got[k].meta === v.meta) && (v.status === undefined || got[k].status === v.status), { want: v, got: got[k] })
      else t(`${k} identical to ${want.commit}`, JSON.stringify(got[k]) === JSON.stringify(v), { want: v, got: got[k] })
    }
    t('the comparison pages really rendered (live DE, admin DE, GB) — not empty on both sides', !want.pages['comparison:de:live'].empty && !want.pages['comparison:de:admin:admin'].empty && want.pages['comparison:gb:live'].html !== sha('null'))
  }
  const cmpSrc = fs.readFileSync(path.join(REPO, 'app/(public)/[country]/[section]/[slug]/page.tsx'), 'utf8')
  // ⚠️ RE-PINNED (compare-suits-1): the only other <details> is each "Which suits" answer's evidence (class cmp-suit-ev) — not an FAQ.
  t('the comparison page renders the shared component (no <details> of its own for its FAQ)', /<FaqDetails items=\{v\.faq\} className="cmp-faq" \/>/.test(cmpSrc)
    && !/<details/.test(cmpSrc.replace(/<details className="cmp-suit-ev">[\s\S]*?<\/details>/g, '')))
  t('lib/comparison.ts builds its FAQPage with the shared builder', /faqPageLd\(`\$\{page\}#faq`, v\.faq\)/.test(fs.readFileSync(path.join(REPO, 'lib/comparison.ts'), 'utf8')))
  // ⚠️ RE-PINNED (seo-geo-2 B4): /llms.txt was rebuilt later, on purpose — faq-3's own commits (a92f983a..78e16437) did not touch it.
  t('/llms.txt\'s builder is untouched by faq-3', execFileSync('git', ['diff', '--stat', 'a92f983a', '78e16437', '--', 'lib/llms-text.ts', 'app/llms.txt'], { cwd: REPO }).toString().trim() === '')

  head('6 · translation-check: landing.faq.title in en-GB and all 28 bases')
  const en = JSON.parse(fs.readFileSync(path.join(REPO, 'messages/en-GB.json'), 'utf8'))
  // ⚠️ RE-PINNED (faq-4): beside the title, the FAQ page's <title> and description (faq-4 §8 checks them in every base).
  t('en-GB landing.faq = { title: "Frequently asked questions", metaTitle, metaDescription } (no sub-line, Dominic)', en.landing.faq.title === 'Frequently asked questions' && JSON.stringify(Object.keys(en.landing.faq)) === '["title","metaTitle","metaDescription"]', en.landing.faq)
  const src2 = fs.readFileSync(path.join(REPO, 'lib/i18n/locales.ts'), 'utf8')
  const BASES = /export const LANGUAGE_BASES[^=]*=\s*\[([^\]]*)\]/.exec(src2)[1].match(/'[^']+'/g).map(s => s.slice(1, -1))
  t('28 language bases', BASES.length === 28, BASES.length)
  for (const l of BASES) {
    const m = JSON.parse(fs.readFileSync(path.join(REPO, `messages/${l}.json`), 'utf8'))
    // It exits 1 while any structural line remains (the three English-only faq.phrases keys, by Dominic's decision) — read its report.
    let out
    try { out = execFileSync('node', ['scripts/translation-check.cjs', '--locale', l, '--back', `docs/i18n/back/${l}.json`], { cwd: REPO }).toString() } catch (e) { out = String(e.stdout) }
    // ⚠️ RE-PINNED (faq-2): faq.phrases.* translated in every base — structural 0 now.
    t(`${l}: "${m.landing?.faq?.title}" — present, structural 0 (faq-2 translated faq.phrases), no flag on landing.faq`, typeof m.landing?.faq?.title === 'string' && m.landing.faq.title.length > 0 && m.landing.faq.title !== en.landing.faq.title && /\*\*Structural: 0\*\*/.test(out) && !out.includes('landing.faq'), out.split('\n').filter(x => /Structural|landing\.faq/.test(x)).join(' | '))
  }

  console.log(`\nfaq-3: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
