#!/usr/bin/env node
// scripts/compare-autopublish-1.cjs — compare-autopublish-1 (7 November 2026; docs/compare-autopublish-1-report.md). Comparison pages that
// publish themselves from evidence-backed data. Proves, against the real modules (bundled) and fixture rows — no network, no database:
//   1 · the finding rules (addendum A, B): price agreement, currency, placeholders, the 50% hold, yes / no / not mentioned evidence, the
//       consistency rule, Admin's verified rows kept, a category Admin set kept, the newest finding of an item decided, older ones replaced
//   2 · the publish rules (§3): a plan publishable only with both checks confirming its current price on its own site in the country's
//       currency; ≥ 2 competitors to go live; AE never; no website never (addendum E); the take-downs (two failed checks; interval + 30
//       days); a held price change (kept within its interval, hidden after); Admin's verify / undo-verify / Off win
//   3 · the switches: country_settings 'live' OR (auto-publish AND auto-live AND not Admin's Off); AE never
//   4 · the evidence rule for a cell, "pages complete" = features + pricing (addendum C), android / ipad out of absence-means-no
//   5 · the run (lib/comparison-publish-run.ts) on in-memory stores: findings applied through acceptFinding, check pages saved (addendum D),
//       marks and verdicts written, the pages told (revalidate) when something changed and not otherwise; the weekly summary (null when
//       nothing changed; never an outreach template)
//   6 · the real page route on fixtures: an auto-published competitor is public; an unchecked row is hidden publicly (an admin sees it,
//       marked); a competitor without a website is never shown; "Report an error" opens the comparison-correction topic; the methodology
//   7 · the source: the checker's post-run hook, the Admin route records an explicit Off, the contact topic in every language base, the cron
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'compare-autopublish-1' })
const REPO = kit.REPO

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

;(async () => {
  const L = await kit.bundle('ap1-lib', [
    "export { decideOne, decideFindings, evaluateCountry, planVerdict, priceConfirmed, ownSource, weeklySummary, MAX_PRICE_MOVE, NEVER_AUTO } from '@/lib/comparison-publish'",
    "export { runPublish, guessKind } from '@/lib/comparison-publish-run'",
    "export { flagsFromRows } from '@/lib/comparison-flags'",
    "export { evidenceValue, passesEvidence, pagesComplete, cellState } from '@/lib/comparison-features'",
    "export { memory } from '@/scripts/compare-autopublish-1/memory'",
    "export { CONTACT_TOPICS, topicFromParam } from '@/lib/contact'",
  ].join('\n'))

  // ── fixtures ──
  const C1 = 'c1', C2 = 'c2', C3 = 'c3'
  const comp = (id, o = {}) => ({ id, name: `Comp ${id}`, website: `https://${id}.example`, focus: 'food_truck', lifecycle: 'active', addedAsCandidate: false, featuresVerifiedAt: null,
    checkUrls: [], checkIntervalDays: 90, checkFailures: 0, category: 'food_truck', categoryBy: 'auto', ...o })
  const plan = (id, cid, o = {}) => ({ id, competitorId: cid, countryCode: 'GB', planName: 'Basic', currency: 'GBP', priceHidden: false, monthlyMinor: 2900, status: 'counted', unclear: false,
    sourceUrl: `https://${cid}.example/pricing`, checkedOn: '2026-11-01', verifiedAt: null, verifiedBy: null, supersededAt: null, autoVerifiedAt: null, autoBlocked: false, ...o })
  const entry = (id, cid, pid, o = {}) => ({ id, countryCode: 'GB', competitorId: cid, primaryPlanId: pid, sortOrder: 1, verifiedAt: null, pinned: false, hidden: false, autoVerifiedAt: null, autoBlocked: false, ...o })
  const ev = (cid, amount, o = {}) => ({ competitor_id: cid, country_code: 'GB', plan_id: null, found: { plan_name: 'Basic', amount, currency: 'GBP', period: 'month' }, ...o })
  const country = (o = {}) => ({ code: 'GB', currency: 'GBP', hasPage: true, autoPublish: true, adminOff: false, today: '2026-11-07', competitors: [comp(C1), comp(C2), comp(C3)],
    plans: [plan('p1', C1), plan('p2', C2), plan('p3', C3)], entries: [entry('e1', C1, 'p1'), entry('e2', C2, 'p2'), entry('e3', C3, 'p3')], values: [],
    priceEvidence: [ev(C1, 29), ev(C2, 29), ev(C3, 29)], heldPlanIds: new Set(), ...o })
  const f = (o = {}) => ({ id: 'f1', competitor_id: C1, field: 'feature', outcome: 'changed', country_code: null, plan_id: null, quote: 'We offer pre-orders.', source_url: 'https://c1.example/features',
    quote_in_page: true, second_check: 'confirmed', created_at: '2026-11-07T10:00:00Z', found: { feature_key: 'preorder', feature: 'yes' }, ...o })
  const rawComp = (id, o = {}) => ({ id, name: `Comp ${id}`, website: `https://${id}.example`, category_by: 'auto', check_urls_by: null, ...o })
  const ctx = (o = {}) => ({ competitors: new Map([[C1, rawComp(C1)], [C2, rawComp(C2, { category_by: 'admin' })]]),
    plans: new Map([['p1', { id: 'p1', competitor_id: C1, country_code: 'GB', currency: 'GBP', monthly_minor: 2900, superseded_at: null, verified_by: null, auto_blocked: false }],
      ['pv', { id: 'pv', competitor_id: C1, country_code: 'GB', currency: 'GBP', monthly_minor: 2900, superseded_at: null, verified_by: 'admin-1', auto_blocked: false }]]),
    values: [], currencyOf: c => ({ GB: 'GBP', US: 'USD' }[c] ?? null), ...o })
  const d = (finding, c = ctx()) => L.decideOne(finding, c)

  // ══ 1 · findings ══
  head('1 · findings, decided automatically (addendum A, B)')
  const price = o => f({ field: 'monthly_price', plan_id: 'p1', country_code: 'GB', found: { plan_name: 'Basic', amount: 31, currency: 'GBP', period: 'month' }, ...o })
  t('PRICE: both checks agree, on its own site, in the country\'s currency → accepted', d(price()).action === 'accept')
  t('…the second check only "unclear" → rejected (the two checks must agree)', d(price({ second_check: 'unclear' })).action === 'reject')
  t('…its quote not on the page → rejected', d(price({ quote_in_page: false })).action === 'reject')
  t('…in USD on a GB plan → rejected (currency)', d(price({ found: { plan_name: 'Basic', amount: 31, currency: 'USD', period: 'month' } })).action === 'reject')
  t('…an amount that is not a number → rejected (placeholder)', d(price({ found: { plan_name: 'Basic', amount: '[…]', currency: 'GBP', period: 'month' } })).action === 'reject')
  const big = d(price({ found: { plan_name: 'Basic', amount: 49, currency: 'GBP', period: 'month' } }))
  t('…a move of more than 50% (29 → 49) → HELD for the weekly summary, not accepted', big.action === 'hold' && /69%/.test(big.reason), big)
  t('…exactly 50% (29 → 43.50) is still accepted', d(price({ found: { plan_name: 'Basic', amount: 43.5, currency: 'GBP', period: 'month' } })).action === 'accept' && L.MAX_PRICE_MOVE === 0.5)
  t('…a plan Admin verified → rejected (Admin\'s verification kept)', d(price({ plan_id: 'pv' })).action === 'reject')
  t('FEATURE "yes" with a quote found on its page and the URL → accepted; without the quote → rejected', d(f()).action === 'accept' && d(f({ quote: null })).action === 'reject' && d(f({ quote_in_page: false })).action === 'reject')
  t('…"yes" against a disagreeing second check → rejected', d(f({ second_check: 'disagreed' })).action === 'reject')
  const no = o => f({ found: { feature_key: 'whatsapp', feature: 'no' }, quote: 'WhatsApp is not supported.', ...o })
  t('FEATURE "no": its own quote AND the second check confirming → accepted; second check unclear → rejected (it shows "doesn\'t say")', d(no()).action === 'accept' && d(no({ second_check: 'unclear' })).action === 'reject')
  const nm = o => f({ outcome: 'not_stated', found: { feature_key: 'schedule', feature: 'not_mentioned' }, quote: null, quote_in_page: false, second_check: 'not_run', ...o })
  t('"not mentioned" without a quote → accepted', d(nm()).action === 'accept')
  t('B · "not mentioned" that carries a quote (it contradicts itself) → rejected', d(nm({ quote: 'If you have a weekly location you can click "recurring"' })).action === 'reject')
  t('…"not mentioned" never replaces an answer that has evidence', d(nm(), ctx({ values: [{ competitor_id: C1, feature_key: 'schedule', country_code: null, value: 'yes', quote: 'q', source_url: 'https://c1.example/x', verified_by: null }] })).action === 'reject')
  t('…an answer Admin verified is kept (the finding rejected)', d(f(), ctx({ values: [{ competitor_id: C1, feature_key: 'preorder', country_code: null, value: 'no', verified_by: 'admin-1' }] })).action === 'reject')
  const cl = o => f({ field: 'classification', outcome: 'classification', found: { classification: 'restaurant_ordering' }, ...o })
  t('CLASSIFICATION: applied (its quote on the page) — unless Admin set the category', d(cl()).action === 'accept' && d(cl({ competitor_id: C2 })).action === 'reject')
  const items = L.decideFindings([f({ id: 'old', created_at: '2026-11-05T10:00:00Z' }), f({ id: 'new', created_at: '2026-11-07T10:00:00Z', quote: null })], ctx())
  t('the NEWEST finding of an item is decided by its rules; older ones are rejected as replaced', items.find(x => x.id === 'new')?.action === 'reject' && /replaced/.test(items.find(x => x.id === 'old')?.reason ?? ''), items)
  t('Admin\'s explicit decisions (B, F) win over the rules', L.decideOne(f({ quote: null }), { ...ctx(), forceAccept: new Map([['f1', 'F']]) }).action === 'accept'
    && L.decideOne(f(), { ...ctx(), forceReject: new Map([['f1', 'B']]) }).action === 'reject')

  // ══ 2 · publish ══
  head('2 · a country: who is publishable, and live with ≥ 2 (§3, §4, addendum E)')
  const v0 = L.evaluateCountry(country())
  t('three confirmed competitors → all publishable, live', v0.live && v0.shown.length === 3 && v0.competitors.every(c => c.publishable), v0)
  const one = L.evaluateCountry(country({ priceEvidence: [ev(C1, 29)] }))
  t('only one with its price confirmed by both checks → NOT live (2 needed); the others say why', !one.live && one.shown.length === 1 && /not been confirmed/.test(one.competitors[1].reason), one)
  t('a confirmation of a DIFFERENT price does not count', !L.priceConfirmed(plan('p1', C1), [ev(C1, 35)]) && L.priceConfirmed(plan('p1', C1), [ev(C1, 29)]))
  t('the source must be on its own site', !L.ownSource('https://elsewhere.example/p', comp(C1)) && L.ownSource('https://www.c1.example/pricing', comp(C1, { website: 'https://c1.example' })))
  t('the price in the wrong currency → not publishable', /not GBP/.test(L.planVerdict(plan('p1', C1, { currency: 'USD' }), comp(C1), country()).reason))
  t('a price marked unclear, a hidden price, a plan not counted → not publishable', [{ unclear: true }, { priceHidden: true }, { status: 'hidden' }].every(o => !L.planVerdict(plan('p1', C1, o), comp(C1), country()).ok))
  const ae = L.evaluateCountry(country({ code: 'AE', currency: 'GBP' }))
  t('AE is NEVER live, whatever its data', !ae.live && ae.reason === 'never auto-published' && L.NEVER_AUTO.has('AE'))
  t('no page in its language, auto-publish off, or Admin set it Off → not live', [{ hasPage: false }, { autoPublish: false }, { adminOff: true }].every(o => !L.evaluateCountry(country(o)).live))
  const nw = L.evaluateCountry(country({ competitors: [comp(C1, { website: null }), comp(C2), comp(C3)] }))
  t('E · a competitor with no website is never selected', !nw.shown.some(s => s.competitorId === C1) && /no website/.test(nw.competitors[0].reason))
  const fails = L.evaluateCountry(country({ competitors: [comp(C1, { checkFailures: 2 }), comp(C2), comp(C3)] }))
  t('TAKE-DOWN: two failed checks in a row → hidden until a good check', !fails.shown.some(s => s.competitorId === C1) && /failed/.test(fails.competitors[0].reason))
  const old = L.evaluateCountry(country({ plans: [plan('p1', C1, { checkedOn: '2026-07-01' }), plan('p2', C2), plan('p3', C3)] }))
  t('TAKE-DOWN: a price older than its interval (90) + 30 days → hidden', !old.shown.some(s => s.competitorId === C1) && /taken down/.test(old.competitors[0].reason))
  const heldIn = L.planVerdict(plan('p1', C1, { checkedOn: '2026-10-01' }), comp(C1), country({ heldPlanIds: new Set(['p1']) }))
  const heldOut = L.planVerdict(plan('p1', C1, { checkedOn: '2026-07-20' }), comp(C1), country({ heldPlanIds: new Set(['p1']) }))
  t('HELD price change: the old price stays while within its interval, hidden after', heldIn.ok && /held/.test(heldIn.reason) && !heldOut.ok, { heldIn, heldOut })
  const adminWins = L.evaluateCountry(country({ plans: [plan('p1', C1, { verifiedAt: '2026-11-01T00:00:00Z' }), plan('p2', C2, { autoBlocked: true }), plan('p3', C3)], priceEvidence: [] }))
  t('ADMIN WINS: a plan Admin verified needs no automatic evidence; one Admin un-verified (blocked) is never published', adminWins.competitors[0].publishable && !adminWins.competitors[1].publishable && /took back/.test(adminWins.competitors[1].reason), adminWins)
  t('…an entry Admin un-verified (blocked) is never published automatically', !L.evaluateCountry(country({ entries: [entry('e1', C1, 'p1', { autoBlocked: true }), entry('e2', C2, 'p2'), entry('e3', C3, 'p3')] })).competitors[0].publishable)
  const pinHide = L.evaluateCountry(country({ entries: [entry('e1', C1, 'p1', { hidden: true }), entry('e2', C2, 'p2'), entry('e3', C3, 'p3', { pinned: true, sortOrder: 9 })] }))
  t('…Admin\'s hide and pin decide who shows (the four-cap)', !pinHide.shown.some(s => s.competitorId === C1) && pinHide.shown[0].competitorId === C3, pinHide)

  // ══ 3 · switches ══
  head('3 · the switches: live = country_settings live OR (auto-publish AND auto-live AND not Off)')
  const cs = code => ({ country_code: code, comparison_status: 'off', ios_app_available: false, android_app_available: false })
  const fl = L.flagsFromRows([cs('GB'), cs('US'), cs('AE'), { ...cs('DE'), comparison_status: 'live' }, cs('IE')],
    [{ country_code: 'GB', auto_publish: true, auto_live: true }, { country_code: 'US', auto_publish: false, auto_live: true }, { country_code: 'AE', auto_publish: true, auto_live: true },
     { country_code: 'IE', auto_publish: true, auto_live: true, admin_off: true }])
  t('GB: off in Admin, auto-publish on and auto-live → LIVE (autoLive marked)', fl.get('GB').status === 'live' && fl.get('GB').autoLive === true && fl.get('GB').autoPublish === true)
  t('US: auto-publish off → stays off', fl.get('US').status === 'off')
  t('AE: never auto-published, even with a row saying live', fl.get('AE').status === 'off' && fl.get('AE').autoPublish === false)
  t('IE: Admin set Off → off (it always wins)', fl.get('IE').status === 'off' && fl.get('IE').autoPublish === false)
  t('DE: Admin\'s own "live" is live as before; no publish rows at all → exactly the old behaviour', fl.get('DE').status === 'live' && L.flagsFromRows([cs('GB')]).get('GB').status === 'off' && L.flagsFromRows([cs('GB')]).get('GB').autoPublish === undefined)

  // ══ 4 · cells ══
  head('4 · what an automatically published answer may say; "pages complete" (addendum C)')
  const val = o => ({ value: 'yes', quote: 'q', sourceUrl: 'https://x.example', verifiedAt: null, autoBlocked: false, ...o })
  t('"yes" / "no" with quote and page → as stored; without the quote → "doesn\'t say" (unknown)', L.evidenceValue(val()) === 'yes' && L.evidenceValue(val({ value: 'no' })) === 'no' && L.evidenceValue(val({ quote: null })) === 'unknown' && L.evidenceValue(val({ value: 'no', sourceUrl: null })) === 'unknown')
  t('"not mentioned" with no quote → kept (it may become "not listed"); with a quote → "doesn\'t say"', L.evidenceValue(val({ value: 'not_mentioned', quote: null })) === 'not_mentioned' && L.evidenceValue(val({ value: 'not_mentioned' })) === 'unknown')
  t('an answer Admin verified is shown as it is; one Admin blocked never', L.evidenceValue(val({ quote: null, verifiedAt: '2026-11-01' })) === 'yes' && L.evidenceValue(val({ autoBlocked: true })) === 'unknown')
  t('passesEvidence marks only unverified, unblocked answers that pass as they are', L.passesEvidence(val()) && !L.passesEvidence(val({ quote: null })) && !L.passesEvidence(val({ verifiedAt: 'x' })) && !L.passesEvidence(val({ value: 'unknown' })))
  const pg = (kinds, help) => ({ pages: kinds.map(k => ({ url: `https://x.example/${k}`, kind: k, ok: true, status: 'fetched', fetchedAt: null })), helpCentre: help, checkedAt: '' })
  t('C · pages complete = the features AND pricing pages read; the help centre is not required', L.pagesComplete(pg(['features', 'pricing'], 'linked_not_fetched')) && !L.pagesComplete(pg(['features'], 'none_found')) && !L.pagesComplete(pg(['pricing'], 'fetched')))
  t('C · android and ipad leave absence-means-no (the migration)', /update public\.comparison_features set absence_means_no = false where key in \('android', 'ipad'\)/.test(read('supabase/migrations/20261078_compare_autopublish_1.sql')))

  // ══ 5 · the run ══
  head('5 · the run on in-memory stores: applied, marked, check pages saved, the pages told (§4, addendum D)')
  const NOW = new Date('2026-11-07T21:00:00Z')
  const rc = (id, o = {}) => ({ id, name: `Comp ${id}`, website: `https://${id}.example`, focus: 'food_truck', lifecycle: 'active', added_as_candidate: false, features_verified_at: null, check_urls: [], check_urls_by: null,
    check_interval_days: 90, check_failures: 0, category: 'food_truck', category_by: 'auto', not_in_countries: [], ...o })
  const rp = (id, cid, o = {}) => ({ id, competitor_id: cid, country_code: 'GB', plan_name: 'Basic', currency: 'GBP', price_hidden: false, monthly_minor: 2900, yearly_only: false, setup_minor: 0, truck_fee_bps: 0, truck_fee_fixed_minor: 0,
    customer_fee_bps: 0, customer_fee_fixed_minor: 0, card_mode: 'unknown', card_bps: null, card_fixed_minor: null, card_rate_assumed: true, order_cap: null, included_orders: null, overage_fixed_minor: null, vat: 'incl', status: 'counted', unclear: false,
    second_hand: false, source: 'research', source_url: `https://${cid}.example/pricing`, checked_on: '2026-11-01', verified_at: null, verified_by: null, notes: null, superseded_at: null, created_at: '2026-10-01T00:00:00Z', auto_verified_at: null, auto_blocked: false, ...o })
  const re = (id, cid, pid) => ({ id, country_code: 'GB', competitor_id: cid, primary_plan_id: pid, choose_when: null, sort_order: 1, verified_at: null, verified_by: null, created_at: '2026-10-01T00:00:00Z', group_label: null, pinned: false, hidden: false, auto_verified_at: null, auto_blocked: false })
  const rf = (id, o = {}) => ({ id, run_id: 'r', competitor_id: C1, plan_id: null, country_code: null, field: 'feature', stored_value: null, found_value: 'yes', found: { feature_key: 'preorder', feature: 'yes' }, quote: 'Pre-orders.', quote_en: null,
    source_url: 'https://c1.example/features', outcome: 'changed', quote_in_page: true, second_check: 'confirmed', second_value: null, second_quote: null, review_status: 'pending', created_at: '2026-11-07T10:00:00Z', ...o })
  const baseRows = (o = {}) => ({
    countries: [{ code: 'GB', currency: 'GBP', locale: 'en-GB', enabled: true, comparisonStatus: 'off' }, { code: 'AE', currency: 'AED', locale: 'ar-AE', enabled: true, comparisonStatus: 'off' }],
    publish: [{ country_code: 'GB', auto_publish: true, auto_live: false, admin_off: false, shown: [] }, { country_code: 'AE', auto_publish: false, auto_live: false, admin_off: false, shown: [] }],
    competitors: [rc(C1), rc(C2), rc(C3)], plans: [rp('p1', C1), rp('p2', C2), rp('p3', C3)], entries: [re('e1', C1, 'p1'), re('e2', C2, 'p2'), re('e3', C3, 'p3')],
    checks: [{ competitor_id: C2, checked_on: '2026-11-07', pages_checked: { pages: [{ url: 'https://c2.example/pricing', kind: 'other', ok: false, status: 'url_not_in_prior_context', fetchedAt: null }, { url: 'https://c2.example/features', kind: 'features', ok: true, status: 'fetched', fetchedAt: null }], helpCentre: 'none_found', checkedAt: '2026-11-07T10:00:00Z' } }],
    evidence: [ev(C1, 29), ev(C2, 29)], exported_at: NOW.toISOString(), ...o })
  const run = async (b, pending, o = {}) => {
    const m = L.memory(b, [], pending, NOW)
    let told = 0
    const r = await L.runPublish({ pricing: m.pricing, checks: m.checks, store: m.store, now: () => NOW, log: () => {}, hasPage: (code, loc) => /^(en|de)/.test(loc), revalidate: async () => { told++; return true }, ...o })
    return { m, r, told }
  }
  const a = await run(baseRows(), [rf('fy'), rf('fq', { found: { feature_key: 'schedule', feature: 'not_mentioned' }, outcome: 'not_stated', quote: 'click recurring' })])
  t('the finding with evidence is ACCEPTED through acceptFinding (a new answer, its quote and page), the contradicted one REJECTED — both marked automatic with the reason',
    a.m.T.competitor_check_findings.get('fy').review_status === 'accepted' && a.m.T.competitor_check_findings.get('fy').auto_reviewed === true
    && a.m.T.competitor_check_findings.get('fq').review_status === 'rejected' && /contradicts/.test(a.m.T.competitor_check_findings.get('fq').auto_reason)
    && [...a.m.T.competitor_feature_values.values()].some(v => v.feature_key === 'preorder' && v.value === 'yes' && v.quote === 'Pre-orders.' && v.auto_verified_at))
  t('…accepted automatically, reviewed_by is empty (no admin id)', a.m.T.competitor_check_findings.get('fy').reviewed_by === null)
  t('GB goes live with the two whose prices both checks confirmed; the third says why; entries and plans marked auto-verified',
    a.r.verdicts.find(v => v.code === 'GB').live && a.m.T.comparison_publish.get('GB').auto_live === true && a.m.T.comparison_entries.get('e1').auto_verified_at && !a.m.T.comparison_entries.get('e3').auto_verified_at
    && a.m.T.competitor_plans.get('p1').auto_verified_at && !a.m.T.competitor_plans.get('p3').auto_verified_at)
  t('AE: never live, its row untouched by auto-publish', a.m.T.comparison_publish.get('AE').auto_live === false && !a.r.verdicts.find(v => v.code === 'AE').live)
  t('D · the pricing page the check was refused (kind "other", /pricing) is added to check_urls, marked auto', JSON.stringify(a.m.T.competitors.get(C2).check_urls) === '["https://c2.example/pricing"]' && a.m.T.competitors.get(C2).check_urls_by === 'auto')
  const adminUrls = await run(baseRows({ competitors: [rc(C1), rc(C2, { check_urls: ['https://c2.example/x'], check_urls_by: 'admin' }), rc(C3)] }), [])
  t('D · …never when Admin set the check pages by hand', JSON.stringify(adminUrls.m.T.competitors.get(C2).check_urls) === '["https://c2.example/x"]')
  t('TRIGGER: something changed (a country went live) → the pages are told (revalidate called once)', a.told === 1 && a.m.events.some(e => e.kind === 'country_live') && a.m.events.some(e => e.kind === 'published'))
  const again = await run({ ...baseRows(), publish: [...a.m.T.comparison_publish.values()], entries: [...a.m.T.comparison_entries.values()], plans: [...a.m.T.competitor_plans.values()],
    competitors: [...a.m.T.competitors.values()] }, [])
  t('…the same state again → no change events and the pages are NOT told', again.told === 0 && !again.m.events.length, again.m.events)
  const failing = await run({ ...baseRows(), publish: [...a.m.T.comparison_publish.values()], entries: [...a.m.T.comparison_entries.values()], plans: [...a.m.T.competitor_plans.values()],
    competitors: [...a.m.T.competitors.values()].map(c => (c.id === C1 ? { ...c, check_failures: 2 } : c)) }, [])
  t('…a take-down (two failed checks) unpublishes C1, takes GB off (1 left) and tells the pages', failing.m.events.some(e => e.kind === 'taken_down' && e.competitor_id === C1) && failing.m.events.some(e => e.kind === 'country_not_live') && failing.told === 1
    && !failing.m.T.comparison_entries.get('e1').auto_verified_at)
  const fx = await run({ ...baseRows(), publish: [{ country_code: 'GB', auto_publish: true, auto_live: true, admin_off: true, shown: [] }, baseRows().publish[1]] }, [])
  t('Admin\'s Off: the evaluation says not live', !fx.r.verdicts.find(v => v.code === 'GB').live && fx.m.T.comparison_publish.get('GB').auto_live === false)
  t('L · a refused page\'s kind from its address', L.guessKind('https://x.example/de/preise') === 'pricing' && L.guessKind('https://x.example/features/') === 'features' && L.guessKind('https://x.example/blog') === null)
  const sum = L.weeklySummary(a.m.events, ['GB'], new Map([[C1, 'Comp c1']]), 'https://www.hatchgrab.com/admin?tab=pricing')
  t('the weekly summary lists the countries live and every change with its reason; findings counted by reason', !!sum && /Live now: GB/.test(sum.text) && /Competitors newly published/.test(sum.text) && /Findings accepted automatically/.test(sum.text) && /Findings rejected automatically/.test(sum.text), sum && sum.text)
  t('…and is skipped when nothing changed', L.weeklySummary([], ['GB'], new Map(), 'x') === null)

  // ══ 6 · the page ══
  head('6 · the real page route on fixtures (an auto-published DE page)')
  const FX = require('./_compare-de-1-fixtures.cjs')
  const R = await FX.renderer(kit, 'ap1r')
  const cmp = FX.CMP_TABLES()
  // Nothing verified by Admin; A and C auto-verified (entry and plan); B auto-verified but without a website.
  const unver = x => ({ ...x, verified_at: null, verified_by: null })
  const tables = {
    competitors: cmp.competitors.map(c => ({ ...unver(c), features_verified_at: null, lifecycle: 'active', added_as_candidate: false, ...(c.id === FX.B ? { website: null } : {}) })),
    competitor_plans: cmp.competitor_plans.map(p => ({ ...unver(p), auto_verified_at: '2026-11-07T21:00:00Z', auto_blocked: false })),
    comparison_entries: cmp.comparison_entries.map(e => ({ ...unver(e), auto_verified_at: '2026-11-07T21:00:00Z', auto_blocked: false, pinned: false, hidden: false })),
    competitor_feature_values: cmp.competitor_feature_values.map(v => ({ ...unver(v), quote: v.feature_key === 'preorder' ? 'Vorbestellungen möglich.' : null })),
    // A check record for every feature of A and C except "domain" for C — so the domain row is unchecked for a shown competitor.
    competitor_feature_checks: [FX.A, FX.C].flatMap(cid => JSON.parse(read('data/comparison-features/features.json')).features.filter(x => !(cid === FX.C && x.key === 'domain'))
      .map(x => ({ competitor_id: cid, feature_key: x.key, country_code: '', checked_on: '2026-11-07', rejudge: false, pages_checked: null }))),
    competitor_check_findings: [],
    comparison_publish: [{ country_code: 'DE', auto_publish: true, auto_live: true, admin_off: false, shown: [] }],
  }
  const pub = await R.page({ status: 'off', tables })
  const html = pub.html || ''
  const tools = [...html.matchAll(/<th scope="col"[^>]*data-tool="([^"]+)"/g)].map(m => m[1])
  t('Admin left DE "off", auto-publish says live → the page is PUBLIC (no admin needed)', !pub.notFound && !!html, pub.notFound)
  t('the auto-verified competitors with a website are shown; the one without a website never is', tools.includes('Testanbieter A') && tools.includes('Testanbieter C') && !tools.includes('Testanbieter B'), tools)
  t('an unchecked row (C\'s "domain" never checked) is hidden publicly — not shown as "doesn\'t say"', !/data-row="domain"/.test(html) && /data-row="preorder"/.test(html))
  const rowCells = key => { const m = new RegExp(`data-row="${key}"[\\s\\S]*?</tr>`).exec(html); return m ? [...m[0].matchAll(/<td[^>]*data-value="([a-z_]+)"/g)].map(x => x[1]) : [] }
  t('the evidence rule in the table: A\'s and C\'s "yes" WITH a quote stay "yes"; their stored "yes" WITHOUT one shows "not stated"', rowCells('preorder').join() === 'yes,yes,yes' && rowCells('capacity').join() === 'yes,unknown,unknown', [rowCells('preorder'), rowCells('capacity')])
  const adm = await R.page({ status: 'off', admin: true, tables })
  t('an admin sees the unchecked row, marked, and the auto-verified badge', /data-row="domain"[\s\S]{0,300}data-unchecked/.test(adm.html || '') && /data-auto-verified/.test(adm.html || ''))
  t('…and is told why B is not shown (no website)', /keine Website/.test(adm.html || ''))
  const deCmp = JSON.parse(read('messages/de-DE.json')).comparison
  t('"Fehler melden" (Report an error) next to the methodology, opening the contact form with the comparison topic', /data-report-error="true"><a href="\/contact\?topic=comparison">Fehler melden<\/a>/.test(html) && html.indexOf('data-report-error') > html.indexOf('id="methodik"'), html.slice(html.indexOf('data-report-error') - 40, html.indexOf('data-report-error') + 200))
  const esc = x => String(x).replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;')
  t('the methodology says the checks are automatic, and no longer "we review" (German)', html.includes(esc(deCmp.method.review)) && /automatisch/.test(deCmp.method.review) && !/Wir prüfen die Angaben mindestens/.test(html))
  const md = await R.twin('md', { status: 'off', tables }), js = await R.twin('json', { status: 'off', tables })
  t('the Markdown and JSON twins are public too, with the report link', md.status === 200 && /topic=comparison/.test(md.body) && js.status === 200 && JSON.parse(js.body).reportError.endsWith('/contact?topic=comparison'))
  const offPage = await R.page({ status: 'off', tables: { ...tables, comparison_publish: [{ country_code: 'DE', auto_publish: true, auto_live: true, admin_off: true, shown: [] }] } })
  t('Admin\'s Off wins: the same data with admin_off → 404', offPage.notFound === true)

  // ══ 7 · source ══
  head('7 · the hook, the Admin route, the contact topic, the cron')
  const main = read('scripts/competitor-check/main.ts')
  t('the checker runs the publishing step after every run that wrote, and counts failed checks; a failure there never fails the run', /runPublish\(/.test(main) && /check_failures/.test(main) && /publish step failed \(the check results are saved\)/.test(main) && /if \(!dryRun\) \{\s*try \{/.test(main))
  t('…the semi-deep list is started by the new code only, never in a dry run', /if \(!dryRun\) \{ try \{ await startSemiDeep/.test(main))
  t('the workflow passes REVALIDATE_SECRET (missing → a warning)', /REVALIDATE_SECRET: \$\{\{ secrets\.REVALIDATE_SECRET \}\}/.test(read('.github/workflows/competitor-check.yml')))
  const route = read('app/api/admin/countries/comparison/route.ts')
  t('Admin › Countries: an explicit Off is recorded (admin_off) and other statuses lift it; AE can never be switched to auto-publish', /admin_off: off/.test(route) && /never published automatically/.test(route))
  t('the contact form has the "comparison" topic, chosen by ?topic=comparison', L.CONTACT_TOPICS.includes('comparison') && L.topicFromParam('comparison') === 'comparison' && L.topicFromParam('Cost Comparison') === 'question')
  // ⚠️ RE-PINNED (languages-world-1, 10 November 2026): "29" was en-GB + the 28 bases of the day. The files with the contact form must
  // be exactly en-GB + lib/i18n/locales.ts's live LANGUAGE_BASES (36 then, more may follow), never a typed count.
  const BASES = read('lib/i18n/locales.ts').match(/export const LANGUAGE_BASES[^=]*= \[([^\]]*)\]/)[1].match(/'([a-z]{2}-[A-Z]{2})'/g).map(x => x.slice(1, -1))
  const langFiles = fs.readdirSync(path.join(REPO, 'messages')).filter(x => x.endsWith('.json')).map(x => [x.slice(0, -5), JSON.parse(read(`messages/${x}`))]).filter(([, m]) => m.contactPage?.form?.topics?.other)
  const langs = langFiles.map(([, m]) => m), langNames = langFiles.map(([l]) => l).sort().join()
  t(`…its words in every language base that has the contact form (${1 + BASES.length}: en-GB and the ${BASES.length} bases)`, BASES.length >= 28 && langNames === ['en-GB', ...BASES].sort().join() && langs.every(m => typeof m.contactPage.form.topics.comparison === 'string' && m.contactPage.form.topics.comparison.length > 3), { files: langFiles.map(([l]) => l), noComparisonTopic: langFiles.filter(([, m]) => !(typeof m.contactPage.form.topics.comparison === 'string' && m.contactPage.form.topics.comparison.length > 3)).map(([l]) => l) })
  t('the weekly summary is a cron, through the admin email path, never an outreach template', /"path": "\/api\/cron\/comparison-summary",\s*"schedule": "0 8 \* \* 1"/.test(read('vercel.json'))
    && /sendConfirmationEmail/.test(read('app/api/cron/comparison-summary/route.ts')) && !/outreach_templates/.test(read('app/api/cron/comparison-summary/route.ts') + read('lib/comparison-publish.ts') + read('lib/comparison-publish-run.ts')))
  t('newer check wins is proven in compare-suits-1 (re-pinned there, both directions)', /newer check wins/.test(read('scripts/compare-suits-1.cjs')))

  console.log(`\n${fail ? '🔴' : '✅'} compare-autopublish-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
