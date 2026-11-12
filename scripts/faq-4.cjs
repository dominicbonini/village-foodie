// scripts/faq-4.cjs — faq-4's proof (2 November 2026; docs/faq-4-report.md): THE FAQ ON ITS OWN PAGE, AND ONE FRESHNESS RULE.
//
//   1 · Admin's count equals public visibility: for DE, FR, JP, AR (and US, English), a base counts as covered exactly when every
//       page in that language shows the question (lib/faq/translation.ts coveredBases — shownRow, the public rule)
//   2 · one shared hash function (lib/faq/source-hash.ts) for the website (admin and public) and the translator
//   3 · /uk, /us, /de, /jp landing pages: no FAQ section and no FAQPage — identical to before faq-3 (a92f983a) apart from the later
//       named changes (seo-geo-2's operatingSystem, store-badges-1's badges) and faq-4's footer FAQ link
//   4 · /uk/faq and /de/faq: the questions in their language, self-canonical, hreflang only between FAQ pages with content, the
//       FAQPage JSON-LD equal to the visible text; /features byte-identical to HEAD (a97c2a58) through the shared frame, apart from
//       the footer FAQ link
//   5 · a country with nothing to show: /it/faq is a 404, absent from the sitemap and the hreflang; the sitemap's lastmod
//   6 · the footer's FAQ link only where that country's /faq has content; nothing in the header
//   7 · /faq routes like /features; /llms.txt links /uk/faq and keeps its English FAQ; IndexNow names the FAQ pages
//   8 · translation-check: the new keys in en-GB and all 28 bases, structural 0
// The HEAD sides are scripts/fixtures/faq-4-identity.json, written by THIS script in two worktrees:
//   (at a92f983a) node scripts/faq-4.cjs capture-landing <file>   ·   (at a97c2a58) node scripts/faq-4.cjs capture-features <file>
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS script, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const kit = require('./_render-kit.cjs')({ cacheTag: 'faq-4' })
const LP1E = require('./_lp1e-fixtures.cjs')
const WF = require('./_world-countries-1-fixtures.cjs')
const SG2 = require('./_lp-seo-geo-2.cjs')
const SB1 = require('./_lp-store-badges-1.cjs')
const FL1 = require('./_lp-features-list-1.cjs')   // ⚠️ RE-PINNED (features-list-1): see §4
const FIX = require('./fixtures/faq-3-rows.json')
const TR = require('./fixtures/faq-2-translations.json')
const IDENTITY = path.join(REPO, 'scripts/fixtures/faq-4-identity.json')

let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${detail === undefined ? '' : ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 500)}`) } }
const head = s => console.log(`\n── ${s}`)
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex')
const SCX = h => require('./_lp-site-chrome-1.cjs').asCopyTruth(require('./_lp-jp-nav-1.cjs').noBreak(h))   // eslint-disable-line @typescript-eslint/no-require-imports -- ⚠️ RE-PINNED (jp-nav-1, 9 November 2026): the Japanese nav label's one zero-width space taken out (scripts/_lp-jp-nav-1.cjs; scripts/jp-nav-1.cjs proves it)
// ⚠️ RE-PINNED earlier (site-chrome-1): today's offline sentence written as copy-truth-1 wrote it (scripts/_lp-site-chrome-1.cjs asCopyTruth)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const FAQ = () => JSON.parse(JSON.stringify({ faq_sections: FIX.faq_sections, faq_items: FIX.faq_items }))
/** The footer's FAQ link (faq-4), taken out — for comparing with a tree that had none (scripts/_lp-faq-4.cjs, shared). */
const { noFaqLink } = require('./_lp-faq-4.cjs')
/** A landing page as before faq-3 would render it, apart from the later named changes (both sides). */
// ⚠️ RE-PINNED (pricing-copy-1, 11 November 2026): the landing pages (seg given) have pricing-copy-1's wording put back first, in the page's
// language (scripts/_lp-pricing-copy-1.cjs asBefore — the banner sentence and the Pay as you go fee line; scripts/pricing-copy-1.cjs proves them).
const PC1_LOCALE = { uk: 'en-GB', us: 'en-US', de: 'de-DE', jp: 'ja-JP' }
// ⚠️ RE-PINNED (pricing-copy-4, 12 November 2026; docs/pricing-copy-4-report.md): a card country's wording taken back first (scripts/_lp-pricing-copy-4.cjs pc1After4 — the banner's card sentence and Pay as you go's asterisk; scripts/pricing-copy-4.cjs proves them), then pricing-copy-1's.
// ⚠️ RE-PINNED (world-countries-5, 12 November 2026): the country list's markup put back first (scripts/_lp-world-countries-5.cjs pc1After4AsBefore → asBefore, then pc1After4).
const N = (h, seg) => SB1.strip(SG2.asBefore(noFaqLink(SCX(seg ? require('./_lp-world-countries-5.cjs').pc1After4AsBefore(h, PC1_LOCALE[seg]) : h))))   // eslint-disable-line @typescript-eslint/no-require-imports -- CommonJS harness module
/** FAQ4_DUMP=<dir>: write each compared page (normalised) there, for a diff. */
const dump = (key, h) => { if (process.env.FAQ4_DUMP) { fs.mkdirSync(process.env.FAQ4_DUMP, { recursive: true }); fs.writeFileSync(path.join(process.env.FAQ4_DUMP, key.replace(':', '-') + '.html'), String(h).replace(/></g, '>\n<')) } }

/** The fixture translations as table rows (fresh: hashed from the fixture English). */
function translationRows(hashOf) {
  const titles = new Set(FIX.faq_sections.map(s => s.id))
  return TR.rows.map(r => ({ item_id: titles.has(r.id) ? null : r.id, section_id: titles.has(r.id) ? r.id : null, locale: r.locale, question: r.question ?? null, answer: r.answer ?? null,
    answer_single_plan: r.answer_single_plan ?? null, title: r.title ?? null, source_hash: hashOf(r.id), model: 'fixture', translated_at: '2026-11-02T12:00:00Z', status: 'ok', reason: null }))
}
const ROWS = () => WF.rowsWith(WF.WORLD)

async function renderer(ctx, tag, entry) {
  const M = await ctx.bundle(tag, entry)
  const wf = WF.renderer(kit, `${tag}-tables`)
  return { M, wf }
}
/** Render a page module's default export at a country segment; null + notFound when it 404s. */
async function renderPage(ctx, M, Def, seg, tables) {
  const info = console.info; console.info = () => {}
  try {
    return await kit.quietAsync(() => ctx.withReq({ rows: ROWS(), tables }, async () => {
      M.__p?.(); M.__cmp?.(); M.__faq?.()
      const args = { params: Promise.resolve({ country: seg }), searchParams: Promise.resolve({}) }
      let meta = null, html = null, notFound = false
      try { if (M.generateMetadataFor) meta = await M.generateMetadataFor(args) } catch (e) { if (e?.message === 'notFound') notFound = true; else throw e }
      if (!notFound) { try { html = await ctx.prerender(kit.h(Def, args)) } catch (e) { if (e?.message === 'notFound') notFound = true; else throw e } }
      return { meta, html, notFound }
    }))
  } finally { console.info = info }
}

// ── the HEAD captures ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const mode = process.argv[2]
if (mode === 'capture-landing' || mode === 'capture-features') {
  (async () => {
    const ctx = LP1E.context(kit, REPO)
    const page = mode === 'capture-landing' ? '@/app/(public)/[country]/page' : '@/app/(public)/[country]/features/page'
    const { M, wf } = await renderer(ctx, `faq4-${mode}`, `export { default as Page } from '${page}'\nexport { clearPlanCatalogCache as __p } from '@/lib/plans-server'\nexport { clearComparisonCache as __cmp } from '@/lib/comparison-flags'`)
    const tables = { ...wf.tables, ...FAQ(), faq_translations: [] }
    const out = fs.existsSync(process.argv[3]) ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : { $why: 'faq-4: sha256 of pages at the commits before faq-3 (landing, a92f983a) and before faq-4 (features, a97c2a58), by scripts/faq-4.cjs.', pages: {} }
    for (const seg of mode === 'capture-landing' ? ['uk', 'us', 'de', 'jp'] : ['uk', 'de']) {
      const r = await renderPage(ctx, M, M.Page, seg, tables)
      const key = `${mode === 'capture-landing' ? 'landing' : 'features'}:${seg}`
      dump(key, mode === 'capture-landing' ? N(r.html) : noFaqLink(r.html))
      out.pages[key] = { sha256: sha(mode === 'capture-landing' ? N(r.html) : noFaqLink(r.html)), commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO }).toString().trim() }
    }
    fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1) + '\n')
    console.log(`captured ${mode}`)
  })().catch(e => { console.error(e); process.exit(1) })
  return
}

const ents = s => s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const pairsOf = html => [...String(html).matchAll(/<details class="faq-q"><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)].map(m => ({ q: ents(m[1]), a: ents(m[2]) }))
const faqLd = html => { const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(String(html)); return m ? (JSON.parse(m[1])['@graph'] || []).find(n => n['@type'] === 'FAQPage') || null : null }
const footerOf = html => (/<footer[\s\S]*?<\/footer>/.exec(String(html)) || [''])[0]
const navOf = html => (/<nav[\s\S]*?<\/nav>/.exec(String(html)) || [''])[0]

;(async () => {
  const ctx = LP1E.context(kit, REPO)
  const { M, wf } = await renderer(ctx, 'faq4', [
    "export { default as FaqPageView, generateMetadata as generateMetadataFor } from '@/app/(public)/[country]/faq/page'",
    "export { default as Landing } from '@/app/(public)/[country]/page'",
    "export { default as Features } from '@/app/(public)/[country]/features/page'",
    "export { default as sitemap } from '@/app/sitemap'",
    "export { GET as llmsGET } from '@/app/llms.txt/route'",
    "export { clearPublicFaqCache as __faq, faqPage, faqCountries, faqHrefFor } from '@/lib/faq/public'",
    "export { clearPlanCatalogCache as __p } from '@/lib/plans-server'",
    "export { clearComparisonCache as __cmp } from '@/lib/comparison-flags'",
    "export { getCountrySettings } from '@/lib/country-settings'",
    "export { coveredBases, translationStatus, VISITOR_LOCALES_OF, TRANSLATED_BASES } from '@/lib/faq/translation'",
    "export { itemSourceHash, sectionSourceHash } from '@/lib/faq/source-hash'",
    "export { faqUrlsFor } from '@/lib/indexnow'",
    "export { marketingRedirect, countryPagePath, COUNTRY_PATH_SEGMENTS } from '@/lib/marketing-country'",
    "export { translatorFor } from '@/lib/i18n/translator'",
    "export { LANGUAGE_BASES } from '@/lib/i18n/locales'",
  ].join('\n'))
  const english = Object.fromEntries(FIX.faq_items.map(i => [i.id, { questionEn: i.question_en, answerEn: i.answer_en, answerSinglePlanEn: i.answer_single_plan_en }]))
  const titles = Object.fromEntries(FIX.faq_sections.map(s => [s.id, s.title_en]))
  const hashOf = id => (titles[id] ? M.sectionSourceHash({ titleEn: titles[id] }) : M.itemSourceHash(english[id]))
  const TRANS = translationRows(hashOf)
  const tablesWith = translations => ({ ...wf.tables, ...FAQ(), faq_translations: translations })
  const withReq = (tables, fn) => { const info = console.info; console.info = () => {}; return ctx.withReq({ rows: ROWS(), tables, host: 'www.hatchgrab.com' }, async () => { M.__p(); M.__cmp(); M.__faq(); return fn() }).finally(() => { console.info = info }) }
  const camel = r => ({ itemId: r.item_id, sectionId: r.section_id, locale: r.locale, question: r.question, answer: r.answer, answerSinglePlan: r.answer_single_plan, title: r.title, sourceHash: r.source_hash, model: r.model, translatedAt: r.translated_at, status: r.status, reason: r.reason })

  head('1 · Admin\'s count equals public visibility (DE, FR, JP, AR, US)')
  const ID4 = 'fa000002-0000-4000-8000-000000000004'
  // A stale de-AT row for …0004: the Austrian page hides it, so German is not covered.
  const staleAT = [...TRANS, { ...TRANS.find(r => r.item_id === ID4 && r.locale === 'de-DE'), locale: 'de-AT', source_hash: 'a'.repeat(64) }]
  for (const [label, translations] of [['fixture translations', TRANS], ['plus a stale de-AT row for …0004', staleAT]]) {
    const tables = tablesWith(translations)
    const pageShows = await withReq(tables, async () => {
      const out = {}
      const codes = { 'de-DE': 'DE', 'de-AT': 'AT', 'de-CH': 'CH', 'de-LI': 'LI', 'fr-FR': 'FR', 'fr-LU': 'LU', 'ja-JP': 'JP', 'ar-AE': 'AE', 'en-US': 'US' }
      for (const [l, cc] of Object.entries(codes)) {
        const p = await M.faqPage(await M.getCountrySettings(cc))
        out[l] = new Set((p?.sections ?? []).flatMap(s => s.items.map(i => i.q)))
      }
      return out
    })
    const rowsOf = id => translations.filter(r => r.item_id === id).map(camel)
    for (const item of FIX.faq_items.filter(i => i.status === 'published')) {
      const covered = M.coveredBases(rowsOf(item.id), hashOf(item.id))
      for (const base of ['de-DE', 'fr-FR', 'ja-JP', 'ar-AE']) {
        const qIn = l => { const tr = translations.find(r => r.item_id === item.id && (r.locale === l || r.locale === base) && r.status === 'ok'); return tr ? pageShows[l]?.has(tr.question) : false }
        const everyPage = M.VISITOR_LOCALES_OF[base].filter(l => pageShows[l]).every(l => qIn(l))
        if (covered.includes(base) !== everyPage) t(`${label}: …${item.id.slice(-4)} ${base}: admin ${covered.includes(base) ? 'covered' : 'not covered'} — every page in that language ${everyPage ? 'shows' : 'does not show'} it`, false)
      }
      if (!pageShows['en-US'].has(item.question_en) && item.show_in === 'all') t(`${label}: …${item.id.slice(-4)} shows on the English US page`, false)
    }
    t(`${label}: for every published question, DE / FR / JP / AR covered in Admin ⇔ shown on every page in that language; US (English) shows them all`, true)
  }
  const st = M.translationStatus(staleAT.filter(r => r.item_id === ID4).map(camel), hashOf(ID4))
  t('the stale de-AT row takes German out of …0004\'s count (3/28, not 4/28) — as the Austrian page hides it', st.fresh === 3, st)
  t('every regional variant is counted with its base (de-DE serves de-AT, de-CH, de-LI; fr-FR fr-LU; es-ES es-MX)', JSON.stringify(M.VISITOR_LOCALES_OF['de-DE']) === '["de-DE","de-AT","de-CH","de-LI"]' && M.VISITOR_LOCALES_OF['fr-FR'].includes('fr-LU') && M.VISITOR_LOCALES_OF['es-ES'].includes('es-MX') && !Object.values(M.VISITOR_LOCALES_OF).flat().some(l => l.startsWith('en-')))

  head('2 · one shared hash function')
  for (const f of ['lib/faq/public.ts', 'lib/admin/faq-actions.ts', 'scripts/faq-translate/main.ts'])
    t(`${f} hashes with lib/faq/source-hash.ts`, /import \{ itemSourceHash, sectionSourceHash \} from '@\/lib\/faq\/source-hash'/.test(read(f)))
  t('no other code hashes the FAQ\'s English (one createHash, in source-hash.ts)', ['lib/faq/public.ts', 'lib/faq/translation.ts', 'lib/faq/translator.ts', 'lib/admin/faq-actions.ts', 'lib/admin/faq-store.ts', 'scripts/faq-translate/main.ts'].every(f => !/createHash/.test(read(f))) && /createHash\('sha256'\)/.test(read('lib/faq/source-hash.ts')))
  t('the hash takes the raw strings (no trim, no normalisation): a trailing space or another quote is a different English', M.itemSourceHash({ questionEn: 'Q?', answerEn: 'A’s', answerSinglePlanEn: null }) !== M.itemSourceHash({ questionEn: 'Q?', answerEn: "A's", answerSinglePlanEn: null }) && M.itemSourceHash({ questionEn: 'Q?', answerEn: 'A ', answerSinglePlanEn: null }) !== M.itemSourceHash({ questionEn: 'Q?', answerEn: 'A', answerSinglePlanEn: null }))

  head('3 · the landing pages: no FAQ, no FAQPage, as before faq-3 apart from the later named changes')
  const want = fs.existsSync(IDENTITY) ? JSON.parse(fs.readFileSync(IDENTITY, 'utf8')).pages : null
  t('scripts/fixtures/faq-4-identity.json exists (captured at a92f983a and a97c2a58)', !!want)
  for (const seg of ['uk', 'us', 'de', 'jp']) {
    const r = await renderPage(ctx, M, M.Landing, seg, tablesWith(TRANS))
    t(`/${seg}: no FAQ section, no FAQ heading, no FAQPage`, !/id="faq"|class="faq-q"|faq-title/.test(r.html) && !faqLd(r.html))
    dump(`landing:${seg}`, N(r.html, seg))
    if (want) t(`/${seg}: identical to a92f983a (before faq-3), the date aside — after the later named changes (operatingSystem, badges) and faq-4's footer FAQ link`, sha(N(r.html, seg)) === want[`landing:${seg}`]?.sha256, { now: sha(N(r.html)), head: want[`landing:${seg}`] })
  }
  t('the landing page module no longer reads the FAQ section or builds a FAQPage', !/FaqDetails|landingFaq|faq\.css/.test(read('app/(public)/(site)/landing/page.tsx')) && !/faq\?: FaqPair/.test(read('lib/structured-data.ts')))

  head('4 · /uk/faq and /de/faq')
  for (const [seg, locale] of [['uk', 'en-GB'], ['de', 'de-DE']]) {
    const r = await renderPage(ctx, M, M.FaqPageView, seg, tablesWith(TRANS))
    t(`/${seg}/faq renders`, !r.notFound && !!r.html)
    if (!r.html) continue
    const pairs = pairsOf(r.html), ld = faqLd(r.html)
    const heading = M.translatorFor(locale, 'landing')('faq.title')
    t(`/${seg}/faq: heading "${heading}" (landing.faq.title), ${pairs.length} questions`, r.html.includes(`<h1>${heading}</h1>`) && pairs.length === (seg === 'uk' ? 24 : 3))
    t(`/${seg}/faq: title "${M.translatorFor(locale, 'landing')('faq.metaTitle')}" and its description (the new keys)`, r.meta.title.absolute === M.translatorFor(locale, 'landing')('faq.metaTitle') && r.meta.description === M.translatorFor(locale, 'landing')('faq.metaDescription'))
    t(`/${seg}/faq: self-canonical`, r.meta.alternates.canonical === `https://www.hatchgrab.com/${seg}/faq`)
    t(`/${seg}/faq: FAQPage "<canonical>#faq", its questions and answers the visible text exactly`, !!ld && ld['@id'] === `https://www.hatchgrab.com/${seg}/faq#faq` && JSON.stringify(ld.mainEntity.map(e => ({ q: e.name, a: e.acceptedAnswer.text }))) === JSON.stringify(pairs))
    const langs = r.meta.alternates.languages
    t(`/${seg}/faq: hreflang only between FAQ pages with content (de-DE, fr-FR, ja-JP, ar-AE, the English ones; no it-IT, no es-ES) + x-default /faq`, langs['de-DE'] === 'https://www.hatchgrab.com/de/faq' && langs['fr-FR'] && langs['ja-JP'] && langs['ar-AE'] && langs['en-GB'] && !langs['it-IT'] && !langs['es-ES'] && langs['x-default'] === 'https://www.hatchgrab.com/faq', langs)
  }
  for (const seg of ['uk', 'de']) {
    const r = await renderPage(ctx, M, M.Features, seg, tablesWith(TRANS))
    dump(`features:${seg}`, noFaqLink(r.html))
    // ⚠️ RE-PINNED (features-list-1, 4 November 2026): the table's three new rows are put back to the old "Advanced reporting" row
    // (PRECISE, scripts/_lp-features-list-1.cjs featuresRowsBack) before the comparison; every other byte is still compared.
    // ⚠️ RE-PINNED (pricing-copy-2, 11 November 2026): the plan table's fee row put back first (scripts/_lp-pricing-copy-2.cjs asBefore —
    // "…on online orders*" was "…on online card orders*"; scripts/pricing-copy-2.cjs proves it).
    // ⚠️ RE-PINNED (world-countries-5, 12 November 2026): the country list's markup put back first (scripts/_lp-world-countries-5.cjs asBefore).
    const pc2 = require('./_lp-pricing-copy-2.cjs').asBefore(require('./_lp-world-countries-5.cjs').asBefore(r.html, { locale: seg === 'uk' ? 'en-GB' : 'de-DE' }), seg === 'uk' ? 'en-GB' : 'de-DE')   // eslint-disable-line @typescript-eslint/no-require-imports -- CommonJS harness module
    const asBefore = FL1.LANDED ? FL1.featuresRowsBack(noFaqLink(SCX(pc2)), seg === 'uk' ? 'en-GB' : 'de-DE') : noFaqLink(SCX(pc2))
    if (want) t(`/${seg}/features: byte-identical to a97c2a58 through the shared frame (MarketingFrame), apart from the footer FAQ link${FL1.LANDED ? ' and features-list-1\'s rows' : ''}`, sha(asBefore) === want[`features:${seg}`]?.sha256, { now: sha(asBefore), head: want[`features:${seg}`] })
  }
  t('/features and /faq share one frame (components/landing/MarketingFrame.tsx), not a copy', /<MarketingFrame visitor=\{visitor\}>/.test(read('app/(public)/(site)/features/page.tsx')) && /<MarketingFrame visitor=\{visitor\}>/.test(read('app/(public)/(site)/faq/page.tsx')) && !/Archivo\(/.test(read('app/(public)/(site)/features/page.tsx')) && /<FaqDetails items=\{sec\.items\} className="faq-q" \/>/.test(read('app/(public)/(site)/faq/page.tsx')))

  head('5 · a country with nothing to show; the sitemap')
  const it = await renderPage(ctx, M, M.FaqPageView, 'it', tablesWith(TRANS))
  t('/it/faq (no Italian translation) is a 404', it.notFound)
  const none = await renderPage(ctx, M, M.FaqPageView, 'uk', { ...tablesWith(TRANS), faq_items: FAQ().faq_items.map(i => ({ ...i, status: 'draft' })) })
  t('/uk/faq with nothing published is a 404 too', none.notFound)
  const sm = await withReq(tablesWith(TRANS), () => M.sitemap())
  const faqUrls = sm.filter(e => /\/faq$/.test(e.url))
  t(`the sitemap lists the FAQ pages with content (${faqUrls.length}) and not /it/faq`, faqUrls.some(e => e.url.endsWith('/uk/faq')) && faqUrls.some(e => e.url.endsWith('/de/faq')) && faqUrls.some(e => e.url.endsWith('/jp/faq')) && !faqUrls.some(e => e.url.endsWith('/it/faq')) && !faqUrls.some(e => e.url.endsWith('/es/faq')))
  const de = faqUrls.find(e => e.url.endsWith('/de/faq'))
  t('lastmod = the newest publish or translation time the page shows (/de/faq: the fixture translations\' 2 November 12:00)', de && new Date(de.lastModified).toISOString() === '2026-11-02T12:00:00.000Z', de)
  t('the sitemap\'s FAQ hreflang names only FAQ pages with content', faqUrls.every(e => !e.alternates.languages['it-IT']) && de.alternates.languages['fr-FR'] === 'https://www.hatchgrab.com/fr/faq')

  head('6 · the footer\'s FAQ link, only where it has content; nothing in the header')
  const linkIn = async (Page, seg) => { const r = await renderPage(ctx, M, Page, seg, tablesWith(TRANS)); return { foot: footerOf(r.html), nav: navOf(r.html) } }
  for (const [seg, has] of [['uk', true], ['de', true], ['jp', true], ['it', false], ['es', false]]) {
    const l = await linkIn(M.Landing, seg)
    t(`/${seg}: the footer ${has ? 'links' : 'does not link'} /${seg}/faq; the header never does`, l.foot.includes(`href="/${seg}/faq"`) === has && !l.nav.includes('/faq'))
  }
  const fl = await linkIn(M.Features, 'uk')
  t('/uk/features: the footer links /uk/faq (every marketing page through the frame)', fl.foot.includes('href="/uk/faq"') && /<a href="\/uk\/faq">FAQ<\/a>/.test(fl.foot))
  // 🔁 RE-PINNED (compare-ux-1, 8 November 2026): the same slot also carries the "Compare" link after FAQ where a comparison is live; with
  // none, each branch renders exactly what it did (Pricing and FAQ / Pricing alone), so React's ids are unchanged.
  t('the link sits beside Features and Pricing, in Pricing\'s slot (React\'s ids after it unchanged)', /\{faqHref\s*\? \(compareLink\s*\? <><a href=\{`\$\{landingHref\}#pricing`\}>\{t\('pricing'\)\}<\/a><a href=\{faqHref\}>\{t\('faq'\)\}<\/a>\{compareLink\}<\/>\s*: <><a href=\{`\$\{landingHref\}#pricing`\}>\{t\('pricing'\)\}<\/a><a href=\{faqHref\}>\{t\('faq'\)\}<\/a><\/>\)\s*: \(compareLink \? <><a href=\{`\$\{landingHref\}#pricing`\}>\{t\('pricing'\)\}<\/a>\{compareLink\}<\/> : <a href=\{`\$\{landingHref\}#pricing`\}>\{t\('pricing'\)\}<\/a>\)\}/.test(read('components/landing/LandingFooter.tsx')))

  head('7 · /faq routes like /features; /llms.txt; IndexNow')
  const codes = Object.keys(M.COUNTRY_PATH_SEGMENTS)
  t('/faq → 302 to the visitor\'s country\'s /faq (a German visitor → /de/faq), as /features', M.marketingRedirect('/faq', '', codes, { ip: 'DE' })?.location === '/de/faq' && M.marketingRedirect('/features', '', codes, { ip: 'DE' })?.location === '/de/features')
  t('a switched-off country\'s /faq → 302 to /uk/faq', M.marketingRedirect('/it/faq', '', codes.filter(c => c !== 'IT'), {})?.location === '/uk/faq')
  const llms = await withReq(tablesWith(TRANS), async () => (await M.llmsGET()).text())
  t('/llms.txt links /uk/faq and keeps its English FAQ', llms.includes('FAQ page: https://www.hatchgrab.com/uk/faq') && llms.includes('**How much does HatchGrab cost?**'))
  const urls = M.faqUrlsFor([{ countryCode: 'DE', locale: 'de-DE', enabled: true }, { countryCode: 'AT', locale: 'de-AT', enabled: true }, { countryCode: 'FR', locale: 'fr-FR', enabled: true }], ['de-DE'])
  t('IndexNow names the FAQ pages (a de-DE translation → /de/faq, /at/faq), not the landing pages', JSON.stringify(urls) === '["https://www.hatchgrab.com/de/faq","https://www.hatchgrab.com/at/faq"]')
  t('the Admin route submits only FAQ pages that still have content', /const withContent = new Set\(\(await faqCountries\(\)\)\.map\(c => c\.code\)\)/.test(read('app/api/admin/faq/route.ts')) && /faqUrlsFor\(countries, report\.okLocales\)/.test(read('scripts/faq-translate/main.ts')))

  head('8 · translation-check: the new keys')
  const en = JSON.parse(read('messages/en-GB.json'))
  t('en-GB: "Frequently asked questions | HatchGrab", the description, the footer "FAQ"', en.landing.faq.metaTitle === 'Frequently asked questions | HatchGrab' && en.landing.faq.metaDescription === "Straight answers for food trucks about HatchGrab's prices, setting up, taking orders and payments." && en.landingFooter.faq === 'FAQ')
  for (const l of M.LANGUAGE_BASES) {
    const m = JSON.parse(read(`messages/${l}.json`))
    let o; try { o = execFileSync('node', ['scripts/translation-check.cjs', '--locale', l, '--back', `docs/i18n/back/${l}.json`], { cwd: REPO }).toString() } catch (e) { o = String(e.stdout) }
    t(`${l}: the three keys translated, structural 0, no flag on them`, m.landing.faq.metaTitle && m.landing.faq.metaDescription && m.landingFooter.faq && m.landing.faq.metaDescription !== en.landing.faq.metaDescription && /\*\*Structural: 0\*\*/.test(o) && !/landing\.faq\.meta|landingFooter\.faq/.test(o))
  }

  console.log(`\nfaq-4: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
