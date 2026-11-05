// scripts/_perf-1-tables.cjs — perf-1 (5 November 2026, docs/perf-1-report.md): THE STAND-IN DATABASE'S TABLES. A MODULE.
//
// The same tables scripts/tidy-2.cjs renders all 44 landing pages and the FAQ from — no new fixture data:
//   • country_settings: the world rows (scripts/_world-countries-1-fixtures.cjs) with the live snapshot's flags, locale, currency,
//     enabled and comparison status overlaid (scripts/fixtures/tidy-2-live-rows.json, read after 20261063 ran);
//   • plans / plan_prices / plan_features: the world catalogue (the same module);
//   • faq_sections / faq_items / faq_translations: scripts/fixtures/faq-3-rows.json and faq-2-translations.json, each translation
//     stamped with the CURRENT source hash (so it shows, as on the live site);
//   • everything else the pages read (comparison data, trucks…): what the LP1E context's tables carry, or empty.
// Nothing here reads a database, the network or any .env file.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const WF = require('./_world-countries-1-fixtures.cjs')
const FIX = require('./fixtures/faq-3-rows.json')
const TR = require('./fixtures/faq-2-translations.json')
const LIVE = require('./fixtures/tidy-2-live-rows.json')
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))

const liveOf = Object.fromEntries(LIVE.rows.map(r => [r[0], Object.fromEntries(LIVE.columns.map((c, i) => [c, r[i]]))]))
/** The 44 country rows in the loader's camelCase, as tidy-2 builds them. */
const ROWS = () => WF.rowsWith(WF.WORLD).map(r => {
  const l = liveOf[r.countryCode]
  return l ? { ...r, enabled: l.enabled, locale: l.locale, currency: l.currency, comparisonStatus: l.comparison_status, iosAppAvailable: l.ios_app_available, androidAppAvailable: l.android_app_available } : r
})

/** Every table, snake_case. `kit` is a render kit (scripts/_render-kit.cjs), used only to compute the FAQ source hashes. */
async function tables(kit) {
  const H = await kit.bundle('perf-1-hash', "export { itemSourceHash, sectionSourceHash } from '@/lib/faq/source-hash'")
  const english = Object.fromEntries(FIX.faq_items.map(i => [i.id, { questionEn: i.question_en, answerEn: i.answer_en, answerSinglePlanEn: i.answer_single_plan_en }]))
  const titles = Object.fromEntries(FIX.faq_sections.map(s => [s.id, s.title_en]))
  const hashOf = id => (titles[id] ? H.sectionSourceHash({ titleEn: titles[id] }) : H.itemSourceHash(english[id]))
  const TRANS = TR.rows.map(r => ({ item_id: titles[r.id] ? null : r.id, section_id: titles[r.id] ? r.id : null, locale: r.locale, question: r.question ?? null, answer: r.answer ?? null,
    answer_single_plan: r.answer_single_plan ?? null, title: r.title ?? null, source_hash: hashOf(r.id), model: 'fixture', translated_at: '2026-11-02T12:00:00Z', status: 'ok', reason: null }))
  const wf = WF.renderer(kit, 'perf-1-tables')
  return {
    country_settings: ROWS().map(snake),
    trucks: [],
    ...require('./_lp1c-fixtures.cjs').planTables(),
    ...wf.tables,
    faq_sections: FIX.faq_sections, faq_items: FIX.faq_items, faq_translations: TRANS,
  }
}
module.exports = { tables, ROWS }
