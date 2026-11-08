#!/usr/bin/env node
// scripts/compare-suits-1.cjs — compare-suits-1 (6 November 2026, docs/compare-suits-1-report.md): at most four competitors per country,
// "absence means no" only on complete evidence, the pages each check read, and "Which suits your food truck?" built from checked data
// only, with its wording rules.   node scripts/compare-suits-1.cjs   (swept; NO NETWORK, NO DATABASE — pure functions, fixtures and
// the real page route rendered on the render kit's in-memory stand-in)
//   1 · selection: hidden never; pinned first; verified pricing; category order; ties by verified features; at most four
//   2 · the page record: fetched / failed / named-but-not-fetched; the record tool's two new fields; a "no" needs its quote and page
//   3 · "not listed": only absence_means_no + features AND pricing fetched AND the help centre read or none seen; a pending finding
//       or a failed fetch keeps it "not mentioned"; the raw answer is never changed
//   4 · the answers: each situation with known and unknown inputs; the wording per state; "none of the other products compared lists
//       it" only when every other is a no; ties; strengths (never a never_competitor_strength feature); commission only with a
//       marketplace; HatchGrab never named when its data says no; the price answers' volume, inclusions and the Unlimited wording
//   5 · every language: the section's messages exist in all 28 language bases with en-GB's tokens, and name no card reader, till,
//       card machine or payment terminal; the source never says "best overall", "the only", "doesn't have", "unlimited capacity"
//   6 · the real page route (fixture data): the section below the table, "Nicht aufgeführt" in the table, no FAQPage/QAPage for it,
//       the Markdown and JSON twins carry the same answers, at most four columns
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'compare-suits-1' })
const REPO = kit.REPO

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

/** Each language's words for the things the section must never name (from the translators' reports, compare-suits-1). */
const CARD_WORDS = require('./_compare-suits-1-words.cjs')

;(async () => {
  const L = await kit.bundle('cs1-lib', [
    "export { selectShown, selectionOrder, MAX_SHOWN, CATEGORY_RANK } from '@/lib/comparison-selection'",
    "export { cellState, pagesComplete, pagesCheckedOut, featureCheckOf, isQuotedNo } from '@/lib/comparison-features'",
    "export { pagesCheckedFrom, fetchAttempts } from '@/lib/competitor-check/core'",
    "export { validateRecordFindings, mergeRecorded, RECORD_FINDINGS_TOOL } from '@/lib/competitor-check/model'",
    "export { pagesTask, passCompetitorBlock, extractorMessage } from '@/lib/competitor-check/prompts'",
    "export { buildSuits } from '@/lib/comparison-suits'",
    "export { translatorFor } from '@/lib/i18n/translator'",
    "import '@/lib/i18n/catalog/comparisonSuits'",
    "export { categoryOfFocus } from '@/lib/admin/competitor-check-actions'",
  ].join('\n'))
  const T = L.translatorFor('en-GB', 'comparisonSuits')

  // ══ 1 · selection ════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · at most four, by the rule')
  const cand = (name, o = {}) => ({ entry: name, name, pinned: false, hidden: false, sortOrder: 1, category: null, pricingVerified: false, verifiedFeatures: 0, ...o })
  const pool = [
    cand('Rest', { category: 'restaurant', pricingVerified: true, sortOrder: 1 }), cand('Pos', { category: 'general_pos', pricingVerified: true, sortOrder: 2 }),
    cand('Market', { category: 'marketplace', pricingVerified: true, sortOrder: 3 }), cand('TruckA', { category: 'food_truck', pricingVerified: true, verifiedFeatures: 3, sortOrder: 4 }),
    cand('TruckB', { category: 'food_truck', pricingVerified: true, verifiedFeatures: 9, sortOrder: 5 }), cand('Unpriced', { category: 'food_truck', sortOrder: 6 }),
    cand('Hidden', { category: 'food_truck', pricingVerified: true, hidden: true, pinned: true, sortOrder: 7 }), cand('PinnedRest', { category: 'restaurant', pinned: true, sortOrder: 8 }),
  ]
  const sel = L.selectShown(pool)
  t('the four: pinned first, then verified pricing by category (food_truck → general_pos → marketplace → restaurant), food-truck ties by verified features',
    sel.shown.map(c => c.name).join() === 'PinnedRest,TruckB,TruckA,Pos', sel.shown.map(c => c.name))
  t('hidden never shows, even pinned; the rest are named with their reason', sel.notShown.find(n => n.candidate.name === 'Hidden')?.reason === 'hidden'
    && ['Market', 'Rest', 'Unpriced'].every(n => sel.notShown.find(x => x.candidate.name === n)?.reason === 'beyond_four'))
  t('verified pricing outranks category (an unpriced food-truck tool comes after a priced restaurant tool)', L.selectionOrder(pool).map(c => c.name).indexOf('Rest') < L.selectionOrder(pool).map(c => c.name).indexOf('Unpriced'))
  t('unknown category ranks after restaurant; ties then by the entry order, then the name', L.selectionOrder([cand('Z', { sortOrder: 2 }), cand('Y', { category: 'restaurant', sortOrder: 9 }), cand('X', { sortOrder: 2 })]).map(c => c.name).join() === 'Y,X,Z')
  t('never more than four', L.selectShown(Array.from({ length: 9 }, (_, i) => cand(`C${i}`, { category: 'food_truck' }))).shown.length === 4 && L.MAX_SHOWN === 4)
  t('category from the checker\'s focus where clear: food_truck, pos → general_pos, nearest_local → restaurant; pop_up / markets / none → null',
    L.categoryOfFocus('food_truck') === 'food_truck' && L.categoryOfFocus('pos') === 'general_pos' && L.categoryOfFocus('nearest_local') === 'restaurant'
    && [L.categoryOfFocus('pop_up'), L.categoryOfFocus('street_food_markets'), L.categoryOfFocus(null)].every(x => x === null))

  // ══ 2 · the page record ═══════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · which pages a check read')
  const use = (id, url) => ({ type: 'server_tool_use', id, name: 'web_fetch', input: { url } })
  const ok = (id, url) => ({ type: 'web_fetch_tool_result', tool_use_id: id, content: { type: 'web_fetch_result', url, retrieved_at: '2026-11-06T09:00:00Z', content: { source: { type: 'text', data: 'x' } } } })
  const err = (id, code) => ({ type: 'web_fetch_tool_result', tool_use_id: id, content: { type: 'web_fetch_tool_result_error', error_code: code } })
  const contents = [[use('a', 'https://www.x.example/features/'), ok('a', 'https://www.x.example/features/'), use('b', 'https://x.example/pricing'), err('b', 'url_not_accessible'),
    use('c', 'https://x.example/blog'), ok('c', 'https://x.example/blog')]]
  const rec = L.pagesCheckedFrom(contents, [{ url: 'https://x.example/features', kind: 'features' }, { url: 'https://x.example/pricing', kind: 'pricing' }, { url: 'https://help.x.example/', kind: 'help' }], 'fetched', '2026-11-06T09:01:00Z')
  const by = k => rec.pages.find(p => p.kind === k)
  t('a fetched page: ok, status fetched, its retrieved_at (www. and the trailing slash do not matter)', by('features')?.ok === true && by('features').status === 'fetched' && by('features').fetchedAt === '2026-11-06T09:00:00Z')
  t('a failed fetch: not ok, with the API\'s error code (the URL from its server_tool_use)', by('pricing')?.ok === false && by('pricing').status === 'url_not_accessible')
  t('a page the model names but never fetched: not ok, "not_fetched"', by('help')?.ok === false && by('help').status === 'not_fetched')
  t('a fetched page the model did not name: kind "other"', rec.pages.some(p => p.url === 'https://x.example/blog' && p.kind === 'other' && p.ok))
  t('…so this check is NOT complete (pricing failed, the help centre was not read)', !L.pagesComplete(rec))
  const schema = L.RECORD_FINDINGS_TOOL.input_schema
  t('record_findings asks for pages_checked (url + features / pricing / help / other) and help_centre (fetched / linked_not_fetched / none_found)',
    schema.required.includes('pages_checked') && schema.required.includes('help_centre') && schema.properties.pages_checked.items.properties.kind.enum.join() === 'features,pricing,help,other'
    && schema.properties.help_centre.enum.join() === 'fetched,linked_not_fetched,none_found')
  const vr = L.validateRecordFindings({ findings: [], pages_read: [], notes: null, more: false, pages_checked: [{ url: 'https://x.example/p', kind: 'pricing' }, { url: 7, kind: 'pricing' }, { url: 'https://x.example/q', kind: 'menu' }], help_centre: 'maybe' })
  t('the validator keeps only well-formed pages and drops an unknown help_centre (never "complete" by accident)', vr.ok && vr.value.pages_checked.length === 1 && vr.value.help_centre === null)
  const old = L.validateRecordFindings({ findings: [], pages_read: [], notes: null, more: false })
  t('an answer without the new fields (an older fixture): accepted, no pages — never complete', old.ok && old.value.pages_checked === undefined && !L.pagesComplete(L.pagesCheckedOut(null)))
  const merged = L.mergeRecorded({ findings: [], pages_read: [], notes: null, pages_checked: [{ url: 'u1', kind: 'features' }], help_centre: 'none_found' },
    { findings: [], pages_read: [], notes: null, pages_checked: [{ url: 'u1', kind: 'other' }, { url: 'u2', kind: 'pricing' }], help_centre: 'fetched' })
  t('two record_findings calls merge: one entry per URL, the help centre read in either is read', merged.pages_checked.length === 2 && merged.help_centre === 'fetched')
  t('the prompts ask for the features and pricing pages, and the help centre only when the help fetch is on (it is off by default)',
    /features page and its pricing page for GB \(do not read its help centre\)/.test(L.pagesTask('GB', false)) && /and its help centre/.test(L.pagesTask('GB', true))
    && L.passCompetitorBlock({ name: 'X', website: 'https://x.example', lifecycle: 'active', focus: 'food_truck', check_urls: [], features: {}, plans: [] }, 'GB', '2026-11-06', 3, 1).includes('PAGES:')
    && L.extractorMessage({ name: 'X', website: 'https://x.example', lifecycle: 'active', focus: 'food_truck', check_urls: [], features: {}, plans: [] }, 'routine', '2026-11-06').includes('PAGES:'))
  const F = (o) => ({ field: 'feature', plan_name: null, country_code: 'GB', outcome: 'changed', found_value: null, amount: null, currency: null, period: null, vat: null, percent: null,
    feature_key: 'kds', feature: 'no', note: null, classification: null, url: null, quote: 'No kitchen display', quote_en: null, source_url: 'https://x.example/f', ...o })
  t('a checker "no" needs its verbatim quote AND its page: without either it is refused',
    L.validateRecordFindings({ findings: [F()], pages_read: [], notes: null }).ok
    && !L.validateRecordFindings({ findings: [F({ quote: null })], pages_read: [], notes: null }).ok
    && !L.validateRecordFindings({ findings: [F({ source_url: null })], pages_read: [], notes: null }).ok)
  t('the store writes the pages with every feature the check asked about (competitor_feature_checks.pages_checked)', /pages_checked: pages/.test(read('lib/competitor-check/store-supabase.ts'))
    && /markFeaturesChecked\?\.\(item\.row\.id, item\.country, out\.asked, .*, out\.pages\)/.test(read('lib/competitor-check/pass.ts'))
    && /markFeaturesChecked\?\.\(c\.id, country, r\.asked, ymd\(now\), r\.pagesChecked\)/.test(read('lib/competitor-check/checker.ts')))
  t('accepting a finding stores its quote and page (writeAnswer gets f.quote and f.source_url)', /quote: typeof f\.quote === 'string' \? f\.quote : null, sourceUrl: typeof f\.source_url === 'string' \? f\.source_url : null/.test(read('lib/admin/competitor-check-actions.ts')))

  // ══ 3 · "not listed" ══════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · "not listed" only on complete evidence')
  const page = (kind, okk = true) => ({ url: `https://x.example/${kind}`, kind, ok: okk, status: okk ? 'fetched' : 'url_not_accessible', fetchedAt: null })
  const check = (pages, help) => ({ competitorId: 'c1', featureKey: 'whatsapp', countryCode: 'GB', checkedOn: '2026-11-06', pages: { pages, helpCentre: help, checkedAt: '' } })
  const nm = { id: 'v1', competitorId: 'c1', featureKey: 'whatsapp', countryCode: null, value: 'not_mentioned', note: null, quote: null, sourceUrl: null, checkedOn: '2026-11-01', verifiedAt: null, verifiedBy: null, supersededAt: null, createdAt: null }
  const snap = JSON.stringify(nm)
  const full = check([page('features'), page('pricing')], 'none_found')
  t('absence_means_no + features and pricing read + no help centre → not_listed', L.cellState(nm, { absenceMeansNo: true }, full) === 'not_listed')
  t('absence_means_no + the help centre read → not_listed', L.cellState(nm, { absenceMeansNo: true }, check([page('features'), page('pricing'), page('help')], 'fetched')) === 'not_listed')
  t('absence_means_no false → stays not_mentioned', L.cellState(nm, { absenceMeansNo: false }, full) === 'not_mentioned')
  t('the features page failed → stays not_mentioned', L.cellState(nm, { absenceMeansNo: true }, check([page('features', false), page('pricing')], 'none_found')) === 'not_mentioned')
  t('the pricing page was not fetched → stays not_mentioned', L.cellState(nm, { absenceMeansNo: true }, check([page('features')], 'none_found')) === 'not_mentioned')
  // ⚠️ RE-PINNED (compare-autopublish-1, addendum C, 7 November 2026): complete = the features AND pricing pages read; the help centre is not required.
  t('a help centre linked but not read (the help fetch is off) → not_listed (addendum C: help not required)', L.cellState(nm, { absenceMeansNo: true }, check([page('features'), page('pricing')], 'linked_not_fetched')) === 'not_listed')
  t('help centre "fetched" but no help page fetched → not_listed (addendum C)', L.cellState(nm, { absenceMeansNo: true }, check([page('features'), page('pricing'), page('help', false)], 'fetched')) === 'not_listed')
  t('no record of the pages (every answer before this change) → stays not_mentioned', L.cellState(nm, { absenceMeansNo: true }, null) === 'not_mentioned')
  t('a newer finding waiting for review → stays not_mentioned', L.cellState(nm, { absenceMeansNo: true }, full, true) === 'not_mentioned')
  t('the raw answer is never changed by any of this', JSON.stringify(nm) === snap)
  t('a "no" with quote and page is quoted; one without either is not', L.cellState({ ...nm, value: 'no', quote: 'We do not offer WhatsApp', sourceUrl: 'https://x.example/f' }, {}, null) === 'no_quoted'
    && L.cellState({ ...nm, value: 'no' }, {}, null) === 'no_unquoted' && L.cellState({ ...nm, value: 'no', quote: 'q' }, {}, null) === 'no_unquoted')
  // ⚠️ RE-PINNED (compare-autopublish-1, 7 November 2026): the NEWER of the country's own and the every-country record wins; a tie → the country's own.
  const own = { ...full, checkedOn: '2026-11-05' }, every = { ...full, countryCode: null, checkedOn: '2026-11-07' }
  t('newer check wins: an every-country record newer than the country\'s own is used', L.featureCheckOf([own, every], 'c1', 'whatsapp', 'GB') === every)
  t('…a country\'s own record newer than the every-country one is used', L.featureCheckOf([{ ...own, checkedOn: '2026-11-08' }, every], 'c1', 'whatsapp', 'GB').countryCode === 'GB')
  t('…a tie (same day) goes to the country\'s own; only one record → that one', L.featureCheckOf([{ ...own, checkedOn: '2026-11-07' }, every], 'c1', 'whatsapp', 'GB').countryCode === 'GB'
    && L.featureCheckOf([every], 'c1', 'whatsapp', 'GB') === every && L.featureCheckOf([own], 'c1', 'whatsapp', 'GB') === own && L.featureCheckOf([], 'c1', 'whatsapp', 'GB') === null)

  // ══ 4 · the answers ═══════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · "Which suits your food truck?" — the answers')
  const HG = { key: 'hatchgrab', name: 'HatchGrab', us: true, unverified: false, category: 'food_truck' }
  const col = (key, o = {}) => ({ key, name: key, us: false, unverified: false, category: 'food_truck', ...o })
  const cell = (state, o = {}) => ({ state, source: 'https://x.example/f', checkedOn: '2026-11-02', quote: state === 'no_quoted' ? 'Not available' : null, pages: null, helpCentre: null, ...o })
  const yes = { value: 'yes', fromPlan: null, soon: false }, no = { value: 'no', fromPlan: null, soon: false }
  const feat = (key, ours, cells, o = {}) => ({ key, label: `${key} label`, group: 'ordering', neverStrength: false, ours, cells, ...o })
  const base = (o = {}) => ({ locale: 'en-GB', today: '2026-11-06', columns: [HG, col('Alpha'), col('Beta')], features: [], offlinePause: no, offline: null, priceLow: null, priceHigh: null,
    commission: null, money: (m, c) => `${c} ${(m / 100).toFixed(2)}`, date: d => d, ...o })
  const run = (o) => L.buildSuits(base(o), T)
  const one = (o, key) => run(o).find(a => a.key === key)

  let a = one({ features: [feat('preorder', yes, { Alpha: cell('no_quoted'), Beta: cell('not_listed') })] }, 'preorder')
  t('1 · quoted no + not listed → "none of the other products compared lists it", "best fit among the products compared"',
    a && /^HatchGrab lets customers order ahead/.test(a.answer) && /None of the other products compared lists it, so HatchGrab is the best fit among the products compared\./.test(a.answer), a?.answer)
  a = one({ features: [feat('preorder', yes, { Alpha: cell('no_quoted'), Beta: cell('not_mentioned') })] }, 'preorder')
  t('1 · with one "website doesn\'t say": no "none of the others"; the quoted no "doesn\'t offer this"; the other "website doesn\'t say"',
    a && !/None of the other/.test(a.answer) && /Alpha doesn’t offer this\./.test(a.answer) && /Beta’s website doesn’t say\./.test(a.answer), a?.answer)
  a = one({ features: [feat('preorder', yes, { Alpha: cell('not_listed'), Beta: cell('yes') })] }, 'preorder')
  t('1 · ties name every product with it, and every other is a no → "none of the other products compared lists it", "are the best fit"',
    a && /^HatchGrab and Beta let customers/.test(a.answer) && /None of the other products compared lists it, so HatchGrab and Beta are the best fit among the products compared\./.test(a.answer), a?.answer)
  a = one({ columns: [HG, col('Alpha'), col('Beta'), col('Gamma')], features: [feat('preorder', yes, { Alpha: cell('not_listed'), Beta: cell('yes'), Gamma: cell('not_mentioned') })] }, 'preorder')
  t('1 · with a "website doesn\'t say" among them: each named by its state — a not-listed one "doesn\'t list collection times on its website"',
    a && /Alpha doesn’t list collection times on its website\./.test(a.answer) && /Gamma’s website doesn’t say\./.test(a.answer) && !/None of the other/.test(a.answer), a?.answer)
  t('1 · unknown, partly or an unquoted "no" anywhere → no answer at all', ['unknown', 'partial', 'no_unquoted'].every(s => !one({ features: [feat('preorder', yes, { Alpha: cell(s), Beta: cell('yes') })] }, 'preorder')))
  t('1 · no competitor shown → no answer (HatchGrab alone compares nothing)', !one({ columns: [HG], features: [feat('preorder', yes, {})] }, 'preorder'))
  a = one({ features: [feat('preorder', no, { Alpha: cell('yes'), Beta: cell('not_mentioned') })] }, 'preorder')
  t('1 · HatchGrab\'s data says no: it is never named as having it — named only as not offering it',
    a && /^Alpha lets customers/.test(a.answer) && !/HatchGrab lets|HatchGrab and/.test(a.answer) && /HatchGrab doesn’t offer this\./.test(a.answer), a?.answer)
  a = one({ features: [feat('preorder', no, { Alpha: cell('yes'), Beta: cell('no_quoted') })] }, 'preorder')
  t('1 · HatchGrab no and the other a quoted no → Alpha is the best fit; HatchGrab is not named as having it', a && /^Alpha lets customers/.test(a.answer) && !/HatchGrab/.test(a.answer), a?.answer)
  t('1 · HatchGrab from a plan is named with it: "HatchGrab (from Pro)"', /^HatchGrab \(from Pro\), Alpha and Beta let customers/.test(one({ features: [feat('preorder', { ...yes, fromPlan: 'Pro' }, { Alpha: cell('yes'), Beta: cell('yes') })] }, 'preorder')?.answer ?? ''))
  t('2 · capacity: "website doesn\'t say" allowed (situations 1, 2 and 9)', !!one({ features: [feat('capacity', yes, { Alpha: cell('not_mentioned'), Beta: cell('yes') })] }, 'capacity'))
  t('3, 4, 5 · WhatsApp, graphics, schedule: "not mentioned" is not known → no answer', ['whatsapp', 'social', 'schedule'].every(k => !one({ features: [feat(k, yes, { Alpha: cell('not_mentioned'), Beta: cell('yes') })] }, k)))
  t('3 · WhatsApp with every input known → an answer', /answers customers’ WhatsApp messages automatically/.test(one({ features: [feat('whatsapp', yes, { Alpha: cell('not_listed'), Beta: cell('no_quoted') })] }, 'whatsapp')?.answer ?? ''))
  // 9 · the signal drops
  const offline = feat('offline', { value: 'partial', fromPlan: null, soon: false }, { Alpha: cell('no_quoted'), Beta: cell('not_mentioned') })
  a = one({ offlinePause: yes, offline }, 'offline')
  t('9 · HatchGrab\'s pause stated; a quoted no compared; a not-mentioned one "doesn\'t say"',
    a && /^HatchGrab can pause online ordering automatically when the truck loses signal/.test(a.answer) && /Alpha doesn’t offer working without a connection\./.test(a.answer)
    && /Beta’s website doesn’t say what happens when the signal drops\./.test(a.answer), a?.answer)
  t('9 · shows with HatchGrab alone; never when HatchGrab\'s plan switch says no', !!one({ columns: [HG], offlinePause: yes }, 'offline') && !one({ offlinePause: no, offline }, 'offline'))
  t('9 · a competitor that says yes, or partly, is left out of the sentence', !/Beta/.test(one({ offlinePause: yes, offline: feat('offline', yes, { Alpha: cell('yes'), Beta: cell('partial') }) }, 'offline')?.answer ?? 'Beta'))
  // 10 · strengths
  const strengths = run({ features: [feat('delivery', no, { Alpha: cell('yes'), Beta: cell('yes') }), feat('terminal', no, { Alpha: cell('yes'), Beta: cell('no_quoted') }, { neverStrength: true }),
    feat('setup', no, { Alpha: cell('yes'), Beta: cell('yes') }), feat('kds', yes, { Alpha: cell('yes'), Beta: cell('yes') }), feat('loyalty', { value: 'no', fromPlan: null, soon: true }, { Alpha: cell('yes'), Beta: cell('not_listed') })] }).filter(x => x.key.startsWith('strength.'))
  t('10 · every competitor strength: a shown competitor yes and HatchGrab no; ties name both; "coming soon" says "doesn\'t yet"',
    strengths.map(x => x.key).join() === 'strength.delivery,strength.loyalty' && /Alpha and Beta say they offer “delivery label”; HatchGrab doesn’t\./.test(strengths[0].answer)
    && /HatchGrab doesn’t yet\./.test(strengths[1].answer), strengths.map(x => x.answer))
  t('10 · never a never_competitor_strength feature (card readers, tills, card payments); never a price row (a set-up fee is not a strength)', !strengths.some(x => /terminal|setup/.test(x.key)))
  // 6, 7 · prices
  const line = (key, total, o = {}) => ({ key, name: key, us: key === 'HatchGrab', plan: 'P', unlimitedFlat: false, currency: 'GBP', subMinor: total, setupMinor: 0, feesMinor: 0, overageMinor: 0, totalMinor: total, customerFees: false, checkedOn: '2026-11-01', source: null, ...o })
  const calc = (lines, lowest, orders = 150) => ({ country: 'GB', currency: 'GBP', orders, orderMinor: 2080, revenueMinor: 2080 * orders, date: '2026-11-06', lines, lowest })
  a = one({ priceLow: calc([line('HatchGrab', 0), line('Alpha', 2999), line('Beta', 0)], ['HatchGrab', 'Beta']) }, 'priceLow')
  t('6 · the volume stated; ties name both; what is included and that card processing is not',
    a && /^At 150 online orders a month, HatchGrab \(P\) and Beta have the lowest monthly software cost among the products compared: GBP 0\.00 a month each\./.test(a.answer)
    && /card-processing fees are not included/.test(a.answer) && a.evidence.kind === 'price', a?.answer)
  a = one({ priceHigh: calc([line('HatchGrab', 9900, { plan: 'Unlimited', unlimitedFlat: true }), line('Alpha', 20000)], ['HatchGrab'], 2000) }, 'priceHigh')
  t('7 · Unlimited is "a flat price with no per-order fee from HatchGrab" — never "unlimited capacity"',
    a && /HatchGrab \(Unlimited, a flat price with no per-order fee from HatchGrab\)/.test(a.answer) && !/unlimited capacity/i.test(a.answer) && /At 2,000 online orders/.test(a.answer), a?.answer)
  t('6/7 · no calculation (a cost not known) → no answer', !one({ priceLow: null }, 'priceLow'))
  t('6/7 · the evidence lists every component, the exclusions and the date', (one({ priceLow: calc([line('HatchGrab', 0), line('Alpha', 2999)], ['HatchGrab']) }, 'priceLow')?.evidenceLines ?? []).map(l => l.text).join(' | ')
    .match(/Worked out for 150 online orders.*subscription .* \+ set-up fee spread over 12 months .* \+ fees per order .* \+ extra orders .* = .*Card-processing fees and fees paid by customers are not included.*Worked out on 2026-11-06/) !== null)
  // 8 · commission
  const comm = [{ name: 'HatchGrab', fee: '0.99% (Starter)', unverified: false, source: null, checkedOn: null }, { name: 'Alpha', fee: '30% of each order', unverified: false, source: null, checkedOn: null }]
  t('8 · commission only with a marketplace among the shown competitors', !one({ commission: comm }, 'commission')
    && /What each product charges on an order: HatchGrab: 0\.99% \(Starter\) and Alpha: 30% of each order\./.test(one({ columns: [HG, col('Alpha', { category: 'marketplace' }), col('Beta')], commission: comm }, 'commission')?.answer ?? ''))
  // evidence and dates
  a = one({ features: [feat('preorder', yes, { Alpha: cell('no_quoted', { checkedOn: '2026-10-30' }), Beta: cell('not_listed', { checkedOn: '2026-11-03', pages: [page('features'), page('pricing')], helpCentre: 'none_found' }) })] }, 'preorder')
  t('the answer is "Checked" on its newest evidence date, with each row\'s source, quote and pages checked',
    a.checkedOn === '2026-11-03' && a.checkedLabel === 'Checked 2026-11-03' && a.evidenceLines.some(l => /Alpha — preorder label: says it doesn’t offer this\. Quote: “Not available”\./.test(l.text) && l.url)
    && a.evidenceLines.some(l => /Pages checked: features page and pricing page\. No help centre was found\./.test(l.text)), a.evidenceLines)

  // ══ 5 · every language ════════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · the words, in every language')
  const { LANGUAGE_BASES } = await kit.bundle('cs1-loc', "export { LANGUAGE_BASES } from '@/lib/i18n/locales'")
  const flat = (o, p = '', out = {}) => { for (const [k, v] of Object.entries(o)) { if (v && typeof v === 'object') flat(v, `${p}${k}.`, out); else out[`${p}${k}`] = v } return out }
  const en = flat(JSON.parse(read('messages/en-GB.json')).comparisonSuits, 'comparisonSuits.')
  // The message's real arguments (the ICU parser's), never the words inside plural branches.
  const { parse: icu } = require(path.join(REPO, 'node_modules/@formatjs/icu-messageformat-parser'))
  const args = (els, out = new Set()) => { for (const e of els) { if (e.value && typeof e.value === 'string' && [1, 2, 3, 4, 5, 6].includes(e.type)) out.add(e.value)
    if (e.options) for (const o of Object.values(e.options)) args(o.value, out); if (e.children) args(e.children, out) } return out }
  const tokens = s => { try { return [...args(icu(s, { ignoreTag: true }))].sort().join() } catch (e) { return `PARSE ERROR ${e.message}` } }
  t(`28 language bases (${LANGUAGE_BASES.length})`, LANGUAGE_BASES.length === 28)
  const missing = [], tokenDiff = [], cardHits = [], ascii = []
  for (const loc of ['en-GB', ...LANGUAGE_BASES]) {
    const m = JSON.parse(read(`messages/${loc}.json`)).comparisonSuits
    if (!m) { missing.push(`${loc}: no comparisonSuits`); continue }
    const f = flat(m, 'comparisonSuits.')
    for (const k of Object.keys(en)) { if (!(k in f)) missing.push(`${loc} ${k}`); else if (tokens(f[k]) !== tokens(en[k])) tokenDiff.push(`${loc} ${k}: ${tokens(f[k])} ≠ ${tokens(en[k])}`) }
    const words = CARD_WORDS[loc] ?? CARD_WORDS[loc.split('-')[0]] ?? []
    for (const [k, v] of Object.entries(f)) {
      for (const w of words) {
        // At the start of a word (a stem catches its inflections); five letters or fewer only as a whole word.
        const e = w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const re = CARD_WORDS.NO_SPACES.test(w) ? new RegExp(e, 'iu') : new RegExp(`(?<![\\p{L}\\p{N}])${e}${w.length <= 5 ? '(?![\\p{L}\\p{N}])' : ''}`, 'iu')
        if (re.test(v)) cardHits.push(`${loc} ${k}: “${w}”`)
      }
      if (/'/.test(v)) ascii.push(`${loc} ${k}`)
    }
  }
  t('every key in en-GB and all 28 language bases', !missing.length, missing.slice(0, 12))
  t('every translation keeps en-GB\'s tokens', !tokenDiff.length, tokenDiff.slice(0, 12))
  t(`no card reader, card machine, till, payment terminal or POS in the section, in any language (${Object.keys(CARD_WORDS).filter(k => k !== 'NO_SPACES').length} word lists)`, !cardHits.length && Object.keys(CARD_WORDS).filter(k => k !== 'NO_SPACES').length === 29, cardHits.slice(0, 12))
  t('no plain apostrophe (an ICU escape) in any language', !ascii.length, ascii.slice(0, 12))
  const enAll = Object.values(en).join(' \n ')
  t('the English never says "best overall", "the only", "doesn\'t have", "unlimited capacity" or "unlimited orders"; "best" only as "best fit among the products compared"',
    !/best overall|the only|doesn.t have|unlimited capacity|unlimited orders/i.test(enAll) && (enAll.match(/\bbest\b/g) || []).length === (enAll.match(/best fit among the products compared/g) || []).length)
  t('"doesn\'t offer" only in the quoted-no patterns; "doesn\'t list … on its website" only in the not-listed one', Object.entries(en).filter(([, v]) => /n’t[^.]*\boffer\b/.test(v)).map(([k]) => k).sort().join() === 'comparisonSuits.ev.state.no_quoted,comparisonSuits.offline.noQuoted,comparisonSuits.others.noQuoted'
    && Object.entries(en).filter(([, v]) => /list \{feature\} on (its|their) website/.test(v)).map(([k]) => k).join() === 'comparisonSuits.others.notListed')
  t('the methodology sentences, and the table word "Not listed" (en-GB and de-DE, the comparison page\'s languages)',
    /up to four alternatives/.test(en['comparisonSuits.method.covers']) && /“Not listed” means/.test(en['comparisonSuits.method.notListed'])
    && JSON.parse(read('messages/en-GB.json')).comparison.cell.not_listed === 'Not listed' && !!JSON.parse(read('messages/de-DE.json')).comparison.cell.not_listed)

  // ══ 6 · the real page route on fixtures ═══════════════════════════════════════════════════════════════════════════════
  head('6 · the page, the Markdown and the JSON (fixture data, the real route)')
  const FX = require('./_compare-de-1-fixtures.cjs')
  const R = await FX.renderer(kit, 'cs1r')
  const FILE = JSON.parse(read('data/comparison-features/features.json')).features
  const flags = { whatsapp: true, social: true, schedule: true, ipad: true, android: true, kds: true, perorder: true, domain: true, qr: true, delivery: true, loyalty: true }
  const features = FILE.map(f => ({ ...f, show_countries: f.show_countries ?? [], labels: {}, explanations: {}, never_competitor_strength: ['terminal', 'hardware', 'fiscal', 'cards', 'paymethods', 'cardfee'].includes(f.key), absence_means_no: !!flags[f.key] }))
  // Testanbieter A: WhatsApp not mentioned on its site, and the check that last asked read its features and pricing pages (no help centre).
  const cmp = FX.CMP_TABLES()
  const values = cmp.competitor_feature_values.map(v => (v.competitor_id === FX.A && v.feature_key === 'whatsapp' ? { ...v, value: 'not_mentioned', quote: null, verified_at: v.verified_at ?? '2026-10-25T00:00:00Z' } : v))
  const checks = [{ competitor_id: FX.A, feature_key: 'whatsapp', country_code: 'DE', checked_on: '2026-11-05', rejudge: false,
    pages_checked: { pages: [{ url: 'https://a.example/funktionen', kind: 'features', ok: true, status: 'fetched', fetchedAt: '2026-11-05T08:00:00Z' }, { url: 'https://a.example/preise', kind: 'pricing', ok: true, status: 'fetched', fetchedAt: '2026-11-05T08:00:05Z' }], helpCentre: 'none_found', checkedAt: '2026-11-05T08:01:00Z' } }]
  const tables = { comparison_features: features, competitor_feature_values: values, competitor_feature_checks: checks, competitor_check_findings: [] }
  const adm = await R.page({ status: 'admin', admin: true, tables })
  const pub = await R.page({ status: 'live', tables })
  const html = adm.html || ''
  t('the admin view renders, with at most four competitor columns', !!html && (html.match(/<th scope="col"[^>]*data-tool=/g) || []).length <= 5)
  t('the table says "Nicht aufgeführt" for A\'s WhatsApp (raw answer not_mentioned; absence means no; features and pricing read)', /data-row="whatsapp"[\s\S]*?data-value="not_listed"[^>]*><span class="cmp-tri cmp-tri-not_listed">Nicht aufgeführt/.test(html))
  const iTable = html.indexOf('data-table'), iSuits = html.indexOf('data-suits'), iMethod = html.indexOf('id="methodik"')
  t('"Which suits" sits below the table and above the methodology (when it has an answer)', iSuits === -1 || (iTable < iSuits && iSuits < iMethod), { iTable, iSuits, iMethod })
  t('no QAPage, and the only FAQPage is the existing FAQ\'s (one)', !/QAPage/.test(html) && (html.match(/"FAQPage"/g) || []).length === 1)
  const deSuits = JSON.parse(read('messages/de-DE.json')).comparisonSuits ?? {}, deCmp = JSON.parse(read('messages/de-DE.json')).comparison
  const esc = x => String(x ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const iReview = html.indexOf(esc(deCmp.method.review)), iCovers = html.indexOf(esc(deSuits.method?.covers)), iNot = html.indexOf(esc(deSuits.method?.notListed))
  t('the methodology keeps every sentence and adds the two new ones after them (German)', iMethod > -1 && iReview > iMethod && iCovers > iReview && iNot > iCovers
    && ['checked', 'prices', 'meaning', 'vendor'].every(k => html.indexOf(esc(deCmp.method[k]).split('{')[0]) > iMethod), { iMethod, iReview, iCovers, iNot })
  const md = await R.twin('md', { status: 'admin', admin: true, query: 'view=admin', tables })
  const js = await R.twin('json', { status: 'admin', admin: true, query: 'view=admin', tables })
  const j = JSON.parse(js.body)
  const cellA = j.rows.find(r => r.key === 'whatsapp')?.cells.find(c => c.value === 'not_listed')
  t('the JSON twin: "not_listed" with raw "not_mentioned" and the pages checked', !!cellA && cellA.raw === 'not_mentioned' && cellA.pagesChecked.length === 2 && cellA.helpCentre === 'none_found', cellA)
  t('the twins carry the same answers as the page (questions in the Markdown and in the JSON)', (j.suits?.answers ?? []).every(a => md.body.includes(`### ${a.question}`) && html.includes(a.question.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/</g, '&lt;'))), j.suits)
  t('the public view (anonymous) never names an entry beyond the four or an unverified one', !!pub.html && !/data-shown/.test(pub.html))

  console.log(`\n${fail ? '🔴' : '✅'} compare-suits-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
