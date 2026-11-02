// scripts/faq-2.cjs — faq-2's proof, Part A (2 November 2026; docs/faq-2-seo-geo-2-report.md): THE FAQ IN EVERY LANGUAGE.
//
//   1 · the checks a translation must pass (fixtures): every {token} as often as in the English and none added, no typed digit,
//       currency symbol or plan name, no paying-at-the-truck wording (English or the locale's own), a sane length; a refused text is
//       stored 'failed' with its reason, never shown, and retried
//   2 · which locales a run asks for: the 28 bases; the model-decided variants (a row only where the wording differs — left out → no
//       row, an old one removed); de-CH derived from de-DE (ß → ss)
//   3 · a translator run with a fake model: nothing stale → no call; the spend cap; the cost from the model's own prices
//   4 · the freshness rule: an English edit hides that question in every other language until it is re-translated; English pages
//       show the new English at once; a failed row is never shown
//   5 · DE, FR, JP and AR render their own language (heading, section labels, questions, answers with live values in the page's
//       words), and the FAQPage JSON-LD equals the visible text exactly; Arabic pages are dir="rtl" (app/layout.tsx)
//   6 · English landing pages (GB, US, IE) and DE/FR/JP/AE with no translation byte-identical to HEAD (78e16437)
//   7 · a dry run of the workflow's own script against fixtures: no model call, no network, nothing written; nothing stale → seconds
//   8 · the workflow: hourly + manual, the competitor check's keyless login, no API key, the spend cap
//   9 · Admin › FAQ: "✓ Translations 28/28 up to date" / "● Translating — within the hour (n/28)" / "✕ n failed" (reasons on hover) /
//       "○ Translates when published", the summary's languages and translations, Preview as in the country's own language
//  10 · translation-check: 0 structural in all 28 bases (faq.phrases.* translated)
//
// §6's HEAD side is scripts/fixtures/faq-2-identity.json, written by THIS script in a worktree of 78e16437:
//   (in <dir>) HG_KIT_CACHE_SUFFIX=faq2head node scripts/faq-2.cjs capture <this repo>/scripts/fixtures/faq-2-identity.json
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS script, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync, spawnSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const kit = require('./_render-kit.cjs')({ cacheTag: 'faq-2' })
const LP1E = require('./_lp1e-fixtures.cjs')
const WF = require('./_world-countries-1-fixtures.cjs')
const FIX = require('./fixtures/faq-3-rows.json')
const TR = require('./fixtures/faq-2-translations.json')
const IDENTITY = path.join(REPO, 'scripts/fixtures/faq-2-identity.json')
const HEAD_COMMIT = '78e16437'

let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${detail === undefined ? '' : ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 500)}`) } }
const head = s => console.log(`\n── ${s}`)
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex')
const FAQ = () => JSON.parse(JSON.stringify({ faq_sections: FIX.faq_sections, faq_items: FIX.faq_items }))
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

// ── §6's set (also rendered at HEAD) ─────────────────────────────────────────────────────────────────────────────────────────────
async function identitySet() {
  const wf = WF.renderer(kit, 'faq2-wf')
  const rows = WF.rowsWith(WF.WORLD)
  Object.assign(wf.tables, FAQ(), { faq_translations: [] })
  const out = {}
  const info = console.info; console.info = () => {}
  for (const seg of ['uk', 'us', 'ie', 'de', 'fr', 'jp', 'ae']) {
    const r = await kit.quietAsync(() => wf.page('landing', seg, rows))
    out[`landing:${seg}`] = { html: sha(r.html), meta: sha(JSON.stringify(r.meta)), redirectedTo: r.redirectedTo }
  }
  console.info = info
  return out
}
if (process.argv[2] === 'capture') {
  (async () => {
    const out = await identitySet()
    fs.writeFileSync(process.argv[3], JSON.stringify({ $why: `faq-2 §6: sha256 of each landing page (the faq-3 FAQ rows, no translations) at ${HEAD_COMMIT}, by scripts/faq-2.cjs capture.`, commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO }).toString().trim(), pages: out }, null, 1) + '\n')
    console.log(`captured ${Object.keys(out).length} pages`)
  })().catch(e => { console.error(e); process.exit(1) })
  return
}

const ents = s => s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const sectionOf = (html, id) => { const m = new RegExp(`<section id="${id}"[^>]*>[\\s\\S]*?</section>`).exec(html); return m ? m[0] : null }
function visibleFaq(html) {
  const sec = sectionOf(html, 'faq')
  if (!sec) return null
  const groups = sec.split('<div class="faq-group">').slice(1).map(g => ({
    label: ents(/<p class="faq-label">([\s\S]*?)<\/p>/.exec(g)[1]),
    items: [...g.matchAll(/<details class="faq-q"><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)].map(m => ({ q: ents(m[1]), a: ents(m[2]) })),
  }))
  return { sec, groups, pairs: groups.flatMap(g => g.items), title: ents((/<h2 id="faq-title">([\s\S]*?)<\/h2>/.exec(sec) || [])[1] || '') }
}
const faqLd = html => { const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html); return m ? (JSON.parse(m[1])['@graph'] || []).find(n => n['@type'] === 'FAQPage') || null : null }

;(async () => {
  const ctx = LP1E.context(kit, REPO)
  const M = await ctx.bundle('faq2-live', [
    "export { default as Landing, generateMetadata } from '@/app/[country]/page'",
    "export { clearPublicFaqCache as __faq, landingFaq } from '@/lib/faq/public'",
    "export { clearPlanCatalogCache as __p } from '@/lib/plans-server'",
    "export { clearComparisonCache as __cmp } from '@/lib/comparison-flags'",
    "export { getCountrySettings } from '@/lib/country-settings'",
    "export * from '@/lib/faq/translation'",
    "export { runTranslator, rowsFromReply, buildRequest, localeWords, TRANSLATOR_MODEL, TRANSLATOR_TOOL } from '@/lib/faq/translator'",
    "export { itemSourceHash, sectionSourceHash } from '@/lib/faq/source-hash'",
    "export { listFaq } from '@/lib/admin/faq-actions'",
    "export { localizePlans } from '@/lib/plan-names'",
    "export { priceText } from '@/lib/price-text'",
    "export { PRICE_WORD } from '@/lib/price-words'",
    "export { translatorFor } from '@/lib/i18n/translator'",
    "export { LANGUAGE_BASES, LOCALES } from '@/lib/i18n/locales'",
  ].join('\n'))
  const wf = WF.renderer(kit, 'faq2-wf-tables')
  const catalog = wf.catalog
  const ROWS = WF.rowsWith(WF.WORLD).map(r => ({ ...r, iosAppAvailable: r.countryCode === 'GB', androidAppAvailable: r.countryCode === 'GB' }))
  const english = Object.fromEntries(FIX.faq_items.map(i => [i.id, { questionEn: i.question_en, answerEn: i.answer_en, answerSinglePlanEn: i.answer_single_plan_en }]))
  const titles = Object.fromEntries(FIX.faq_sections.map(s => [s.id, s.title_en]))
  const hashOf = id => (titles[id] ? M.sectionSourceHash({ titleEn: titles[id] }) : M.itemSourceHash(english[id]))
  const trRow = (r, over = {}) => ({ item_id: titles[r.id] ? null : r.id, section_id: titles[r.id] ? r.id : null, locale: r.locale, question: r.question ?? null, answer: r.answer ?? null,
    answer_single_plan: r.answer_single_plan ?? null, title: r.title ?? null, source_hash: hashOf(r.id), model: 'fixture', translated_at: '2026-11-02T12:00:00Z', status: 'ok', reason: null, ...over })
  const TRANSLATIONS = () => TR.rows.map(r => trRow(r))
  const rules = l => ({ planNames: [...new Set([...catalog.plans.map(p => p.name), ...M.localizePlans(catalog, l).plans.map(p => p.name)])], bannedLocal: [M.priceText(M.PRICE_WORD.payAtHatch, l)].filter(w => w !== 'Pay at Hatch'), minRatio: M.minRatioOf(l) })
  const logs = []
  async function landing(seg, tables) {
    return ctx.withReq({ rows: ROWS, tables: { ...wf.tables, ...tables } }, async () => {
      M.__p(); M.__cmp(); M.__faq()
      const args = { params: Promise.resolve({ country: seg }), searchParams: Promise.resolve({}) }
      const q = [console.info, console.warn, console.error]
      console.info = (...a) => logs.push(a.join(' ')); console.warn = (...a) => logs.push(a.join(' ')); console.error = (...a) => logs.push(a.join(' '))
      try {
        const meta = await M.generateMetadata(args)
        return { meta, html: await ctx.prerender(kit.h(M.Landing, args)) }
      } finally { [console.info, console.warn, console.error] = q }
    })
  }

  head('1 · what a translation must pass')
  const E1 = english['fa000002-0000-4000-8000-000000000001'], E6 = english['fa000002-0000-4000-8000-000000000006']
  const de = rules('de-DE'), ja = rules('ja-JP')
  const good = TR.rows.find(r => r.locale === 'de-DE' && r.id === 'fa000002-0000-4000-8000-000000000001')
  t('the fixture German cost answer passes', M.itemProblem(E1, good, de) === null, M.itemProblem(E1, good, de))
  const cases = [
    ['a token missing', { ...good, answer: good.answer.replace('{pro.fee}', 'die Gebühr') }, /\{pro\.fee\} must appear exactly once \(found 0\)/],
    ['a token doubled where the English has it once', { ...good, answer: good.answer + ' {pro.fee}' }, /\{pro\.fee\} must appear exactly once \(found 2\)/],
    ['a token used fewer times than the English (which has {payg.name} twice)', { ...good, answer: good.answer.replace('{payg.name} berechnet', 'Er berechnet') }, /\{payg\.name\} must appear exactly 2 times/],
    ['a token added', { ...good, answer: good.answer + ' {card.fee}' }, /\{card\.fee\} is not in the English/],
    ['a misspelt token', { ...good, answer: good.answer.replace('{pro.fee}', '{pro.Fee}') }, /\{pro\.fee\} must appear exactly once/],
    ['a typed price', { ...good, answer: good.answer + ' Ab 29 €.' }, /typed number "29"/],
    ['a typed number', { ...good, answer: good.answer + ' Seit 2024.' }, /typed number "2024"/],
    ['a number in another script (Arabic-Indic)', { ...good, answer: good.answer + ' ٢٩' }, /typed number "٢٩"/],
    ['a currency symbol', { ...good, answer: good.answer + ' Kein $.' }, /currency symbol "\$"/],
    ['a plan name typed in', { ...good, answer: good.answer.replace('{unlimited.name} hat', 'Unlimited hat') }, /\{unlimited\.name\} must appear|plan name "Unlimited"/],
    ['"Pay at Hatch"', { ...good, answer: good.answer + ' Mit Pay at Hatch.' }, /mentions paying at the truck \("Pay at Hatch"\)/],
    ['{payAtTruck} (a token the English lacks, and banned)', { ...good, answer: good.answer + ' {payAtTruck}' }, /\{payAtTruck\} is not in the English|mentions paying/],
    ['"pay when they collect" in English words', { ...good, answer: good.answer + ' they pay when they collect' }, /mentions paying at the truck/],
    ['far too long', { ...good, answer: good.answer.repeat(4) }, /outside 0\.25–3×|must appear/],
    ['far too short', { ...good, question: 'Was?' }, /question: length 4 against the English 29 — outside 0\.25–3×/],
    ['a single-plan answer missing where the English has one', { ...good, answer_single_plan: '' }, /single-plan answer: missing/],
    ['a token in the question', { ...good, question: 'Was kostet {pro.name}?' }, /question: live values work in answers only/],
    ['an empty answer', { ...good, answer: '  ' }, /answer: missing/],
  ]
  for (const [label, tr, re] of cases) { const p = M.itemProblem(E1, tr, de); t(`refused: ${label}${p ? ` — "${p}"` : ''}`, !!p && re.test(p), p) }
  const deLocal = M.priceText(M.PRICE_WORD.payAtHatch, 'de-DE')
  t(`refused: the locale's own "Pay at Hatch" words ("${deLocal}")`, deLocal !== 'Pay at Hatch' ? /mentions paying/.test(M.itemProblem(E1, { ...good, answer: `${good.answer} ${deLocal}.` }, de) || '') : true)
  t('allowed: the English\'s own figure ("60 seconds" in question 6), in ASCII', M.fieldProblem('answer', E6.answerEn, 'Laden Sie ein Foto Ihrer Speisekarte hoch und sehen Sie es in unter 60 Sekunden laufen. Wenn Sie bereit sind, registrieren Sie sich für Ihre {trial.months}-monatige kostenlose Testphase, prüfen Ihre Speisekarte, tragen ein, wo und wann Sie verkaufen, und verbinden Ihr Zahlungskonto, damit Kunden online bezahlen können. Danach schalten wir Ihre Bestellseite frei.', de) === null)
  t('…but not that figure in another script (٦٠)', /typed number "٦٠"/.test(M.fieldProblem('answer', E6.answerEn, 'جرّب في أقل من ٦٠ ثانية مع {trial.months}.', rules('ar-AE')) || ''))
  t('a short Japanese title passes (集客 for "Reaching customers": the 0.1× floor for Japanese and Chinese)', M.titleProblem('Reaching customers', '集客', ja) === null && M.titleProblem('Reaching customers', '集', rules('de-DE')) !== null)
  t('a title with a token is refused', /no live values in a title/.test(M.titleProblem('Pricing', 'Preise {pro.price}', de) || ''))

  head('2 · which locales a run asks for, and what it stores')
  t(`28 language bases; model-decided variants: ${M.MODEL_VARIANTS.join(', ')}`, M.TRANSLATED_BASES.length === 28 && M.MODEL_VARIANTS.includes('en-US') && M.MODEL_VARIANTS.includes('es-MX') && !M.MODEL_VARIANTS.includes('de-CH') && !M.MODEL_VARIANTS.includes('de-LI') && !M.MODEL_VARIANTS.includes('en-GB'))
  t('de-CH is derived from de-DE (ß → ss); de-LI reads de-CH', JSON.stringify(M.DERIVED) === '{"de-CH":{"from":"de-DE","rule":"eszett"}}' && M.eszett('schließen') === 'schliessen')
  const ID4 = 'fa000002-0000-4000-8000-000000000004', ID1 = 'fa000002-0000-4000-8000-000000000001'
  const src4 = { kind: 'item', id: ID4, hash: hashOf(ID4) }
  const job0 = M.jobFor(src4, [])
  t('never translated → a full job: every base and every model variant', job0.full && job0.locales.length === 28 + M.MODEL_VARIANTS.length)
  const freshAll = M.TRANSLATED_BASES.map(l => ({ itemId: ID4, sectionId: null, locale: l, question: 'q', answer: 'a', answerSinglePlan: null, title: null, sourceHash: src4.hash, model: 'x', translatedAt: '', status: 'ok', reason: null }))
  t('every base fresh → nothing to do', M.jobFor(src4, freshAll) === null)
  const oneFailed = freshAll.map(r => (r.locale === 'ja-JP' ? { ...r, status: 'failed', reason: 'x' } : r))
  const j1 = M.jobFor(src4, oneFailed)
  t('one failed base → retried alone (not a full job)', j1 && !j1.full && JSON.stringify(j1.locales) === '["ja-JP"]', j1)
  const j2 = M.jobFor({ ...src4, hash: 'f'.repeat(64) }, freshAll)
  t('the English changed (hash) → a full job again', j2 && j2.full && j2.locales.length === 28 + M.MODEL_VARIANTS.length)
  const ctxOf = l => ({ locale: l, language: l, glossary: [], samples: [], rules: rules(l) })
  const job = { ...src4, locales: ['de-DE', 'fr-FR', 'ja-JP', 'es-MX', 'en-US'], full: true }
  const deRow = TR.rows.find(r => r.locale === 'de-DE' && r.id === ID4), frRow = TR.rows.find(r => r.locale === 'fr-FR' && r.id === ID4)
  const existing = [{ itemId: ID4, sectionId: null, locale: 'en-US', sourceHash: 'old', status: 'ok' }, { itemId: ID4, sectionId: null, locale: 'de-CH', sourceHash: 'old', status: 'ok' }]
  const res = M.rowsFromReply(job, english[ID4], [
    { locale: 'de-DE', question: deRow.question, answer: deRow.answer },
    { locale: 'fr-FR', question: frRow.question, answer: frRow.answer + ' 2024' },
    { locale: 'xx-XX', question: 'stray', answer: 'stray' },
  ], ctxOf, existing, 'claude-sonnet-5-5', '2026-11-02T12:00:00Z')
  const by = Object.fromEntries(res.rows.map(r => [r.locale, r]))
  t('a passing text is stored ok with the hash, model and time', by['de-DE']?.status === 'ok' && by['de-DE'].source_hash === src4.hash && by['de-DE'].model === 'claude-sonnet-5-5' && by['de-DE'].reason === null)
  t('a refused text is stored failed, with its reason', by['fr-FR']?.status === 'failed' && /typed number "2024"/.test(by['fr-FR'].reason), by['fr-FR'])
  t('a base the model did not return is stored failed ("not returned by the model")', by['ja-JP']?.status === 'failed' && by['ja-JP'].reason === 'not returned by the model')
  t('a variant the model left out (wording the same) gets no row, and its old row is removed', !by['es-MX'] && !by['en-US'] && res.remove.includes('en-US'))
  t('a locale the job did not ask for is ignored', !by['xx-XX'])
  t('de-CH derived from de-DE where de-DE has a ß ("schließen" → "schliessen")', by['de-CH']?.status === 'ok' && /schliessen/.test(by['de-CH'].answer) && !/ß/.test(by['de-CH'].answer))
  const res2 = M.rowsFromReply({ ...job, locales: ['de-DE'] }, english[ID4], [{ locale: 'de-DE', question: deRow.question, answer: deRow.answer.replace('schließen', 'beenden') }], ctxOf, existing, 'm', 'now')
  t('…and no de-CH row where de-DE has no ß (the old one removed: de-CH reads de-DE)', !res2.rows.some(r => r.locale === 'de-CH') && res2.remove.includes('de-CH'))
  t('a failed row is never shown, and is retried next run', M.shownRow('fr-FR', [{ ...freshAll[0], locale: 'fr-FR', status: 'failed', reason: 'x' }], src4.hash) === null && !!M.jobFor(src4, [...freshAll.filter(r => r.locale !== 'fr-FR'), { ...freshAll[0], locale: 'fr-FR', status: 'failed', reason: 'x' }]))

  head('3 · a translator run (fake model)')
  const sources = FIX.faq_items.map(i => ({ id: i.id, sectionId: i.section_id, questionEn: i.question_en, answerEn: i.answer_en, answerSinglePlanEn: i.answer_single_plan_en, status: i.status, hash: M.itemSourceHash(english[i.id]) }))
  const secSources = FIX.faq_sections.map(s => ({ id: s.id, titleEn: s.title_en, hash: M.sectionSourceHash({ titleEn: s.title_en }) }))
  const allFresh = [...sources.filter(s => s.status === 'published'), ...secSources].flatMap(s => M.TRANSLATED_BASES.map(l => ({ itemId: s.titleEn ? null : s.id, sectionId: s.titleEn ? s.id : null, locale: l, question: 'q', answer: 'a', answerSinglePlan: null, title: 't', sourceHash: s.hash, model: 'x', translatedAt: '', status: 'ok', reason: null })))
  let calls = 0
  const out = []
  const repNothing = await M.runTranslator({ read: async () => ({ items: sources, sections: secSources, translations: allFresh }), contextOf: ctxOf, call: async () => { calls++; return { translations: [], usage: null } }, now: () => 'now', log: s => out.push(s) }, { dryRun: false, maxUsd: 1 })
  t('nothing stale → no model call, one line, and the run ends', calls === 0 && repNothing.jobs === 0 && /^Nothing to translate: 24 published questions and 5 sections, every translation up to date\. No model call\.$/.test(out[0]), out)
  const prices = { web_search_per_search: 0.01, models: { 'claude-sonnet-5-5': { input_per_mtok: 2, output_per_mtok: 10, cache_write_per_mtok: 2.5, cache_read_per_mtok: 0.1 } } }
  const written = [], removed = []
  const stale = allFresh.filter(r => r.itemId !== ID1)   // …0001 has no rows at all
  const lines = []
  const rep = await M.runTranslator({
    read: async () => ({ items: sources, sections: secSources, translations: stale }), contextOf: ctxOf, prices,
    call: async req => { calls++; return { translations: req.locales.filter(l => !M.MODEL_VARIANTS.includes(l)).map(l => ({ locale: l, question: 'Frage?', answer: 'x', answer_single_plan: 'y' })), usage: { input_tokens: 10000, output_tokens: 5000, cache_read_input_tokens: 20000 } } },
    write: async rows => { written.push(...rows) }, remove: async (k, id, ls) => { removed.push(...ls) }, now: () => '2026-11-02T12:00:00Z', log: s => lines.push(s),
  }, { dryRun: false, maxUsd: 0.05 })
  const cost = (10000 * 2 + 5000 * 10 + 20000 * 0.1) / 1e6
  t(`one stale question → one call, its cost from the prices ($${cost.toFixed(4)}), logged`, calls === 1 && Math.abs(rep.usd - cost) < 1e-9 && lines.some(l => l.includes(`$${cost.toFixed(4)}`)), lines)
  t('…its texts checked (the fake one-word answers are refused) and all 28 stored failed, each with its reason', written.length === 28 && written.every(r => r.status === 'failed' && /length|must appear/.test(r.reason)), written.slice(0, 2))
  calls = 0
  const many = allFresh.filter(r => !r.itemId)   // every question unstarted
  const capLines = []
  const rep2 = await M.runTranslator({ read: async () => ({ items: sources, sections: secSources, translations: many }), contextOf: ctxOf, prices,
    call: async () => { calls++; return { translations: [], usage: { input_tokens: 20000, output_tokens: 10000 } } }, write: async () => {}, remove: async () => {}, now: () => 'now', log: s => capLines.push(s) }, { dryRun: false, maxUsd: 0.25 })
  t(`the spend cap: no call starts once the run has spent $0.25 (each call $0.14 → 2 calls; ${rep2.skippedForCap} left for the next run)`, calls === 2 && rep2.skippedForCap === 22 && capLines.some(l => /Spend cap \$0\.25 reached: 22 left for the next run/.test(l)), capLines.slice(-3))
  t('a dry run calls nothing and writes nothing', await (async () => { let c = 0, w = 0; await M.runTranslator({ read: async () => ({ items: sources, sections: secSources, translations: [] }), contextOf: ctxOf, call: async () => { c++; return { translations: [], usage: null } }, write: async () => { w++ }, now: () => 'now', log: () => {} }, { dryRun: true, maxUsd: 5 }); return c === 0 && w === 0 })())
  const req = M.buildRequest({ ...src4, locales: ['de-DE', 'es-MX', 'en-US'], full: true }, english[ID4], ctxOf, {})
  t('the request: the rules and every locale\'s words as the (cached) system prompt; the English and the locales asked as the message', /Keep every \{token\} exactly/.test(req.system[0]) && /Never mention paying at the truck/.test(req.system[0]) && req.system[1].includes('"locale":"th-TH"') && JSON.parse(req.user).english.question === english[ID4].questionEn && JSON.parse(req.user).locales.find(l => l.locale === 'es-MX').parent === 'es-ES')
  t('the model is claude-sonnet-5-5, through the one save_translations tool', M.TRANSLATOR_MODEL === 'claude-sonnet-5-5' && M.TRANSLATOR_TOOL.name === 'save_translations')

  head('4 · the freshness rule')
  const base = { ...FAQ(), faq_translations: TRANSLATIONS() }
  const qOf = async (seg, tables) => (visibleFaq((await landing(seg, tables)).html)?.pairs ?? []).map(p => p.q)
  const deQ4 = 'Gibt es einen Vertrag? Kann ich jederzeit kündigen?'
  t('before: /de shows the German contract question', (await qOf('de', base)).includes(deQ4))
  const edited = JSON.parse(JSON.stringify(base))
  edited.faq_items.find(i => i.id === ID4).answer_en = 'There’s no contract and no minimum term. You can close your account from your settings at any time.'
  t('an English edit hides that question on /de (the translation is out of date) …', !(await qOf('de', edited)).includes(deQ4))
  t('… on /fr, /jp and /ae too', !(await qOf('fr', edited)).some(q => q.startsWith('Y a-t-il')) && !(await qOf('jp', edited)).includes('契約はありますか？いつでも解約できますか？') && !(await qOf('ae', edited)).some(q => q.startsWith('هل يوجد عقد')))
  t('… and is logged (one line per page)', logs.some(l => /^\[faq\] DE: \d+ question\(s\) have no up-to-date de-DE translation — hidden here: .*…0004/.test(l)))
  t('the other German questions stay', (await qOf('de', edited)).includes('Was kostet HatchGrab?'))
  const ukEdited = visibleFaq((await landing('uk', edited)).html)
  t('the English page shows the new English at once', ukEdited.pairs.some(p => p.a.startsWith('There’s no contract and no minimum term. You can close your account from your settings')))
  const retranslated = JSON.parse(JSON.stringify(edited))
  for (const r of retranslated.faq_translations) if (r.item_id === ID4) r.source_hash = M.itemSourceHash({ questionEn: 'Is there a contract? Can I cancel anytime?', answerEn: edited.faq_items.find(i => i.id === ID4).answer_en, answerSinglePlanEn: null })
  t('re-translated (rows made from the new English) → shown again', (await qOf('de', retranslated)).includes(deQ4))
  const failedTables = JSON.parse(JSON.stringify(base))
  failedTables.faq_translations.find(r => r.item_id === ID4 && r.locale === 'de-DE').status = 'failed'
  failedTables.faq_translations.find(r => r.item_id === ID4 && r.locale === 'de-DE').reason = 'answer: a typed number'
  t('a failed translation is never shown (and never replaced by English)', !(await qOf('de', failedTables)).includes(deQ4) && !(await qOf('de', failedTables)).includes('Is there a contract? Can I cancel anytime?'))
  const enVariant = JSON.parse(JSON.stringify(base))
  enVariant.faq_translations.push(trRow({ id: ID4, locale: 'en-US', question: 'Is there a contract? Can I cancel any time?', answer: 'There’s no contract and no minimum term. You can close your account at any time from your settings, or by emailing us.' }))
  t('an English variant\'s fresh row shows on its page (en-US) …', (await qOf('us', enVariant)).includes('Is there a contract? Can I cancel any time?') && (await qOf('uk', enVariant)).includes('Is there a contract? Can I cancel anytime?'))
  enVariant.faq_translations.at(-1).source_hash = 'a'.repeat(64)
  t('… and while out of date the page shows the English (English pages behave as before)', (await qOf('us', enVariant)).includes('Is there a contract? Can I cancel anytime?'))
  const esVariant = JSON.parse(JSON.stringify(base))
  esVariant.faq_translations.push(trRow({ id: ID4, locale: 'es-ES', question: '¿Hay permanencia? ¿Puedo cancelar cuando quiera?', answer: 'No hay contrato ni permanencia mínima. Puedes cerrar tu cuenta en cualquier momento desde tus ajustes o escribiéndonos.' }))
  t('a variant with no row reads its parent (es-MX → es-ES), via shownRow', M.shownRow('es-MX', esVariant.faq_translations.filter(r => r.item_id === ID4).map(r => ({ itemId: r.item_id, sectionId: null, locale: r.locale, question: r.question, answer: r.answer, answerSinglePlan: null, title: null, sourceHash: r.source_hash, model: null, translatedAt: '', status: r.status, reason: null })), hashOf(ID4))?.locale === 'es-ES')
  t('…a stale variant row hides rather than fall through (non-English)', M.shownRow('es-MX', [{ itemId: ID4, locale: 'es-MX', sourceHash: 'b'.repeat(64), status: 'ok' }, { itemId: ID4, locale: 'es-ES', sourceHash: hashOf(ID4), status: 'ok' }], hashOf(ID4)) === null)

  head('5 · DE, FR, JP and AR in their own language, with matching JSON-LD')
  const LOC = { de: 'de-DE', fr: 'fr-FR', jp: 'ja-JP', ae: 'ar-AE' }
  for (const [seg, locale] of Object.entries(LOC)) {
    const p = await landing(seg, base)
    const v = visibleFaq(p.html)
    const want = TR.rows.filter(r => r.locale === locale)
    const heading = M.translatorFor(locale, 'landing')('faq.title')
    t(`/${seg}: the FAQ renders, heading "${heading}" (landing.faq.title in ${locale})`, !!v && v.title === heading && heading !== 'Frequently asked questions')
    if (!v) continue
    t(`/${seg}: the section labels are the ${locale} titles (${v.groups.map(g => g.label).join(', ')})`, JSON.stringify(v.groups.map(g => g.label)) === JSON.stringify(want.filter(r => r.title).map(r => r.title)))
    t(`/${seg}: exactly the three translated questions, in Admin order; every untranslated one hidden`, JSON.stringify(v.pairs.map(x => x.q)) === JSON.stringify(['0001', '0004', '0008'].map(n => want.find(r => r.id === `fa000002-0000-4000-8000-00000000${n}`).question)))
    t(`/${seg}: no English question or answer on the page's FAQ`, !v.pairs.some(x => Object.values(english).some(e => e.questionEn === x.q || e.answerEn === x.a)))
    t(`/${seg}: live values filled, in the page's words (no token left; the plan names as the page's catalogue names them)`, !v.pairs.some(x => /[{}]/.test(x.a)) && M.localizePlans(catalog, locale).plans.filter(pl => pl.isPublic).some(pl => v.pairs[0].a.includes(pl.name)))
    const pricing = ents(sectionOf(p.html, 'pricing') || '')
    const amounts = (v.pairs[0].a.match(/(?:[€$¥£]|AED|د\.إ)\s?[\d.,]+|[\d.,]+\s?(?:€|¥|円|AED|د\.إ)/g) || [])
    t(`/${seg}: every amount in the cost answer is one the pricing cards print (${amounts.slice(0, 3).join(' · ')})`, amounts.length > 0 && amounts.every(a => pricing.includes(a)), { amounts, answer: v.pairs[0].a })
    const ld = faqLd(p.html)
    t(`/${seg}: FAQPage "<canonical>#faq", every question and answer equal to the visible text`, !!ld && ld['@id'] === `${p.meta.alternates.canonical}#faq` && JSON.stringify(ld.mainEntity.map(e => ({ q: e.name, a: e.acceptedAnswer.text }))) === JSON.stringify(v.pairs))
  }
  t('Arabic pages are dir="rtl" (app/layout.tsx, as already set — 35.an-24)', /\{\.\.\.\(isRtl\(lang\) \? \{ dir: 'rtl' \} : \{\}\)\}/.test(read('app/layout.tsx')))
  const deNone = await landing('de', { ...FAQ(), faq_translations: [] })
  t('a language with no translation shows no FAQ at all (no heading, no FAQPage)', !/id="faq"/.test(deNone.html) && !faqLd(deNone.html))

  head(`6 · English pages, and pages with no translation, byte-identical to HEAD (${HEAD_COMMIT})`)
  if (!fs.existsSync(IDENTITY)) t('scripts/fixtures/faq-2-identity.json exists (captured at HEAD)', false)
  else {
    const want = JSON.parse(fs.readFileSync(IDENTITY, 'utf8'))
    const got = await identitySet()
    for (const [k, v] of Object.entries(want.pages)) t(`${k} identical to ${want.commit}`, JSON.stringify(got[k]) === JSON.stringify(v), { want: v, got: got[k] })
    t(`the same ${Object.keys(want.pages).length} pages`, JSON.stringify(Object.keys(got).sort()) === JSON.stringify(Object.keys(want.pages).sort()))
  }
  const ukWith = visibleFaq((await landing('uk', base)).html), ukWithout = visibleFaq((await landing('uk', FAQ())).html)
  t('the translations change nothing on the English page', JSON.stringify(ukWith.pairs) === JSON.stringify(ukWithout.pairs))

  head('7 · a dry run of the workflow\'s own script against fixtures — no model call, no network')
  const tmp = path.join(REPO, 'scripts/fixtures/.faq-2-dry-run.json')
  const runDry = translations => {
    fs.writeFileSync(tmp, JSON.stringify({ faq_items: FIX.faq_items, faq_sections: FIX.faq_sections, faq_translations: translations, catalog }))
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ANTHROPIC|NEXT_PUBLIC_SUPABASE|SUPABASE)/.test(k)))
    const t0 = Date.now()
    const r = spawnSync(process.execPath, ['scripts/competitor-check/run.mjs', 'scripts/faq-translate/main.ts', '--dry-run', '--fixtures', 'scripts/fixtures/.faq-2-dry-run.json'], { cwd: REPO, env, encoding: 'utf8' })
    return { ...r, ms: Date.now() - t0 }
  }
  try {
    const d1 = runDry(TRANSLATIONS())
    t('exit 0, with no login and no database variables in the environment', d1.status === 0, d1.stderr)
    t('it plans the work: 29 jobs (5 titles, 24 questions), DRY RUN, nothing called', /29 to translate \(5 section titles, 24 questions\)/.test(d1.stdout) && /DRY RUN: no model call, nothing written/.test(d1.stdout) && (d1.stdout.match(/would ask/g) || []).length === 29, d1.stdout.slice(0, 600))
    t('the fixture\'s fresh German, French, Japanese and Arabic rows are not asked again (…0004: the 24 missing bases only — the English did not change)', /…0004 "Is there a contract\? Can I cancel anytime\?": would ask 24 locales \(retrying failed or missing\)/.test(d1.stdout), d1.stdout.split('\n').find(l => l.includes('…0004')))
    const fresh = [...FIX.faq_items.filter(i => i.status === 'published'), ...FIX.faq_sections].flatMap(s => M.TRANSLATED_BASES.map(l => ({ item_id: s.title_en ? null : s.id, section_id: s.title_en ? s.id : null, locale: l, question: 'q', answer: 'a', answer_single_plan: null, title: 't', source_hash: hashOf(s.id), model: 'x', translated_at: 'now', status: 'ok', reason: null })))
    const d2 = runDry(fresh)
    t(`nothing stale → it ends in seconds (${d2.ms} ms) with "Nothing to translate … No model call."`, d2.status === 0 && d2.ms < 10000 && /Nothing to translate: 24 published questions and 5 sections, every translation up to date\. No model call\./.test(d2.stdout), d2.stdout)
  } finally { fs.rmSync(tmp, { force: true }) }
  const main = read('scripts/faq-translate/main.ts')
  t('the script checks the login only when there is work, refuses an API key, and reads prices from the data', /The login is checked only now/.test(main) && /ANTHROPIC_API_KEY is set\. Remove it/.test(main) && /competitor_check_settings/.test(main) && /cache_control: \{ type: 'ephemeral' \}/.test(main))

  head('8 · the workflow')
  const wfy = read('.github/workflows/faq-translate.yml')
  t('hourly and manual dispatch', /cron: '25 \* \* \* \*'/.test(wfy) && /workflow_dispatch:/.test(wfy))
  t('the competitor check\'s keyless login: id-token write, the four repository variables, the OIDC audience, no API key', /id-token: write/.test(wfy) && ['ANTHROPIC_FEDERATION_RULE_ID', 'ANTHROPIC_ORGANIZATION_ID', 'ANTHROPIC_SERVICE_ACCOUNT_ID', 'ANTHROPIC_WORKSPACE_ID'].every(v => wfy.includes(`\${{ vars.${v} }}`)) && /audience=https:\/\/api\.anthropic\.com/.test(wfy) && !/ANTHROPIC_API_KEY/.test(wfy))
  t('runs the translator through run.mjs, with the spend cap and dry run as inputs (never pasted into the shell line)', /node scripts\/competitor-check\/run\.mjs "\$\{args\[@\]\}"/.test(wfy) && /--max-usd "\$\{MAX_USD:-2\}"/.test(wfy) && /concurrency:\s*\n\s*group: faq-translate/.test(wfy))

  head('9 · Admin › FAQ: the translation indicators, the summary, Preview as')
  const T = await kit.bundle('faq2-tab', "export { default as FaqTab } from '@/components/admin/FaqTab'", {
    patches: [{ file: 'components/admin/FaqTab.tsx', states: ['sections', 'items', 'world', 'translations', 'previewCode'] }],
    stubs: { '@/lib/native/session': 'export async function nativeAuthHeader() { return {} }' },
  })
  const storeTables = { ...wf.tables, ...FAQ(), faq_translations: TRANSLATIONS() }
  // The list the route answers: the fake store over the fixtures, through listFaq (hashes on the server).
  const itemsRows = FIX.faq_items.map(i => ({ id: i.id, sectionId: i.section_id, position: i.position, questionEn: i.question_en, answerEn: i.answer_en, answerSinglePlanEn: i.answer_single_plan_en, showIn: i.show_in, status: i.status, note: null, noteDone: false, publishedAt: null, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z', updatedBy: null }))
  const sectionRows = FIX.faq_sections.map(s => ({ id: s.id, position: s.position, titleEn: s.title_en }))
  const trRows = [...TRANSLATIONS(), ...allFresh.filter(r => r.itemId === 'fa000002-0000-4000-8000-000000000008' && !['de-DE', 'fr-FR', 'ja-JP', 'ar-AE'].includes(r.locale)).map(r => ({ item_id: r.itemId, section_id: null, locale: r.locale, question: 'q', answer: 'a', answer_single_plan: null, title: null, source_hash: r.sourceHash, model: 'x', translated_at: 'now', status: 'ok', reason: null })),
    trRow({ id: 'fa000002-0000-4000-8000-000000000012', locale: 'ja-JP', question: 'x', answer: 'y' }, { status: 'failed', reason: 'answer: a typed number "3"' })]
  const fw = await ctx.withReq({ rows: ROWS, tables: storeTables }, async () => { M.__p(); const S = await kit.bundle('faq2-store2', "export { serviceFaqStore } from '@/lib/admin/faq-store'"); return S.serviceFaqStore.world() })
  const list = await M.listFaq({ sections: async () => sectionRows, items: async () => itemsRows, world: async () => fw,
    translations: async () => trRows.map(r => ({ itemId: r.item_id, sectionId: r.section_id, locale: r.locale, question: r.question, answer: r.answer, answerSinglePlan: r.answer_single_plan, title: r.title, sourceHash: r.source_hash, model: r.model, translatedAt: r.translated_at, status: r.status, reason: r.reason })) })
  const summaries = list.data.translations
  t('listFaq: each question\'s summary against its current English (…0008: 28/28; …0001: 4/28; …0012: 1 failed)', summaries['fa000002-0000-4000-8000-000000000008'].fresh === 28 && summaries[ID1].fresh === 4 && summaries['fa000002-0000-4000-8000-000000000012'].failed.length === 1)
  const tabItems = itemsRows.map(i => (i.id.endsWith('0010') ? i : { ...i, status: 'published' }))
  globalThis.__ms = { sections: sectionRows, items: tabItems, world: fw, translations: summaries, previewCode: 'DE' }
  let page = ''
  try { page = kit.renderStatic(kit.h(T.FaqTab)) } finally { delete globalThis.__ms }
  const plain = ents(page.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ')
  t('"✓ Translations 28/28 up to date" (…0008)', plain.includes('✓ Translations 28/28 up to date'))
  t('"● Translating — within the hour (4/28)" (…0001, …0004)', plain.includes('● Translating — within the hour (4/28)'))
  t('"✕ 1 failed", the reason on hover', plain.includes('✕ 1 failed') && /title="ja-JP: answer: a typed number &quot;3&quot;"/.test(page))
  t('"○ Translates when published" (the draft …0010)', plain.includes('○ Translates when published'))
  t('the summary: "44 countries · 28 languages", and the translations\' state', /🌍 44 countries · 28 languages/.test(plain) && /✓ 24 published · ● \d+ translating · ✕ 1 with failed translations/.test(plain), plain.slice(0, 400))
  t('Preview as names each country\'s language in its own words ("Germany · Deutsch", "Brazil · Português", "Japan · 日本語")', plain.includes('Germany · Deutsch') && plain.includes('Brazil · Português') && plain.includes('Japan · 日本語'))
  t('the German preview shows the German translation …', plain.includes('Germany preview: Gibt es einen Vertrag?') || plain.includes('Germany preview: Es gibt keinen Vertrag'))
  t('… and a question with no up-to-date German says it is hidden there', plain.includes('no up-to-date Deutsch translation yet, so it is hidden on Germany’s page'))
  t('Admin text stays English (35.an-20): the indicators and labels', !/Übersetz|Vorschau/.test(plain.replace(/Germany preview:.*?(?=Germany preview:|$)/g, '')))

  head('10 · translation-check: 0 structural in all 28 bases')
  for (const l of M.LANGUAGE_BASES) {
    let o
    try { o = execFileSync('node', ['scripts/translation-check.cjs', '--locale', l, '--back', `docs/i18n/back/${l}.json`], { cwd: REPO }).toString() } catch (e) { o = String(e.stdout) }
    const m = JSON.parse(read(`messages/${l}.json`)).faq?.phrases
    t(`${l}: structural 0; faq.phrases translated (3)`, /\*\*Structural: 0\*\*/.test(o) && m && Object.keys(m).length === 3 && m.appsSentence !== JSON.parse(read('messages/en-GB.json')).faq.phrases.appsSentence, o.split('\n').find(x => /Structural/.test(x)))
  }

  console.log(`\nfaq-2: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
