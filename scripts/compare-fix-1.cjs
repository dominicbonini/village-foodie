#!/usr/bin/env node
// scripts/compare-fix-1.cjs — compare-fix-1 (24 November 2026; docs/compare-fix-1-report.md). The comparison pages working and live.
// Against the real modules (bundled) and fixture rows — NO network, NO database:
//   1 · the publish step's UAE crash: AE plus three countries → all three evaluated, AE's row written with auto_publish false and never
//       live; one country's failure never stops the loop (logged, reported, the marks still written)
//   2 · the price units end to end: planColsOf reads the printed price ("a partir de R$79,00", "59€ /mois", "99€ /mois", ¥), an amount
//       already in minor units is never multiplied again, an implausible one is not stored (marked unclear); the prompt shows major units;
//       the schema says so; the importer's monthly_major
//   3 · the importer's instructions: not relevant (with reason and page), back to active, not sold in, focus, a corrected plan (superseded
//       + inserted, idempotent), a quoted answer replacing a quoteless one, check records
//   4 · Dominic's rules in evaluateCountry: eligible only with a quoted order-ahead answer on its own site (Aphelios-style never shown);
//       food-truck tools first, others only to make up 2; SumUp only as the single fallback; Anolla never; one check of the price is
//       enough; EUR also in RO; ≥ 2 to go live, at most 4; AE never; features may be "not stated"
//   5 · the run marks only the competitors shown, and points an entry at the plan chosen
//   6 · the source: the publish-only entry point makes no API call; the workflow is unchanged
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
require('./_harness-tmp.cjs') // tmp-cleanup-1
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const kit = require('./_render-kit.cjs')({ cacheTag: 'compare-fix-1' })
const REPO = kit.REPO

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

;(async () => {
  const L = await kit.bundle('cf1-lib', [
    "export { evaluateCountry, planVerdict, eligibleOf, decideOne, NEVER_AUTO, GENERIC_SHOP_DOMAINS, EXCLUDED_DOMAINS } from '@/lib/comparison-publish'",
    "export { runPublish } from '@/lib/comparison-publish-run'",
    "export { planColsOf } from '@/lib/admin/competitor-check-actions'",
    "export { resolveAmountMinor, implausibleMonthly, PLAUSIBLE_MONTHLY_MAX } from '@/lib/price-units'",
    "export { plansForPrompt, extractorMessage } from '@/lib/competitor-check/prompts'",
    "export { RECORD_FINDINGS_TOOL, isAccountError } from '@/lib/competitor-check/model'",
    "export { importResearch, researchProblems } from '@/lib/data-import/research'",
    "export { memory } from '@/scripts/compare-autopublish-1/memory'",
  ].join('\n'))

  // ══ 1 · the UAE crash ══
  head('1 · the publish step: AE plus three countries — all three evaluated, AE never live; one failure never stops the loop')
  const NOW = new Date('2026-11-24T21:00:00Z')
  const rc = (id, o = {}) => ({ id, name: `Comp ${id}`, website: `https://${id}.example`, focus: 'food_truck', lifecycle: 'active', added_as_candidate: false, features_verified_at: null, check_urls: [], check_urls_by: null,
    check_interval_days: 90, check_failures: 0, category: 'food_truck', category_by: 'auto', not_in_countries: [], ...o })
  const rp = (id, cid, cc, o = {}) => ({ id, competitor_id: cid, country_code: cc, plan_name: 'Basic', currency: { GB: 'GBP', FR: 'EUR', DE: 'EUR', AE: 'AED' }[cc], price_hidden: false, monthly_minor: 2900, yearly_only: false, setup_minor: 0, truck_fee_bps: 0, truck_fee_fixed_minor: 0,
    customer_fee_bps: 0, customer_fee_fixed_minor: 0, card_mode: 'unknown', card_bps: null, card_fixed_minor: null, card_rate_assumed: true, order_cap: null, included_orders: null, overage_fixed_minor: null, vat: 'incl', status: 'counted', unclear: false,
    second_hand: false, source: 'research', source_url: `https://${cid}.example/pricing`, checked_on: '2026-11-20', verified_at: null, verified_by: null, notes: null, superseded_at: null, created_at: '2026-10-01T00:00:00Z', auto_verified_at: null, auto_blocked: false, ...o })
  const re = (id, cid, cc, pid, o = {}) => ({ id, country_code: cc, competitor_id: cid, primary_plan_id: pid, choose_when: null, sort_order: 1, verified_at: null, verified_by: null, created_at: '2026-10-01T00:00:00Z', group_label: null, pinned: false, hidden: false, auto_verified_at: null, auto_blocked: false, ...o })
  const rv = (id, cid, key = 'preorder', o = {}) => ({ id, competitor_id: cid, feature_key: key, country_code: null, value: 'yes', note: null, quote: 'Order ahead and collect at the van.', source_url: `https://${cid}.example/features`,
    checked_on: '2026-11-24', verified_at: null, verified_by: null, superseded_at: null, created_at: '2026-11-24T00:00:00Z', auto_verified_at: null, auto_blocked: false, ...o })
  const countries = ['AE', 'GB', 'FR', 'DE']
  const ids = cc => [1, 2, 3].map(i => `${cc.toLowerCase()}${i}`)
  const base = (o = {}) => ({
    countries: countries.map(code => ({ code, currency: { GB: 'GBP', FR: 'EUR', DE: 'EUR', AE: 'AED' }[code], locale: { GB: 'en-GB', FR: 'fr-FR', DE: 'de-DE', AE: 'ar-AE' }[code], enabled: true, comparisonStatus: 'off' })),
    publish: [{ country_code: 'AE', auto_publish: false, auto_live: false, admin_off: false, shown: [] }],   // the other three have no row yet
    competitors: countries.flatMap(cc => ids(cc).map(id => rc(id))), plans: countries.flatMap(cc => ids(cc).map(id => rp(`p-${id}`, id, cc))),
    entries: countries.flatMap(cc => ids(cc).map(id => re(`e-${id}`, id, cc, `p-${id}`))), checks: [], evidence: [], ...o })
  const values = countries.flatMap(cc => ids(cc).map(id => rv(`v-${id}`, id)))
  // The real table's CHECK, as Postgres applies it to an upsert's INSERT half (the column default auto_publish = true).
  const pgSave = (m, failOn) => async (code, cols) => {
    if (code === failOn) throw new Error(`simulated failure for ${code}`)
    const inserted = { auto_publish: true, auto_live: false, admin_off: false, ...cols }
    if (code === 'AE' && (inserted.auto_publish !== false || inserted.auto_live !== false)) throw new Error('new row for relation "comparison_publish" violates check constraint "comparison_publish_never_ae"')
    m.T.comparison_publish.set(code, { ...(m.T.comparison_publish.get(code) ?? { country_code: code, auto_publish: true, admin_off: false }), ...JSON.parse(JSON.stringify(cols)) })
  }
  const run = async (b, vals, o = {}) => {
    const m = L.memory(b, vals, [], NOW)
    const logs = [], plansSet = []
    const store = { ...m.store, savePublish: pgSave(m, o.failOn), setEntryPlan: async (e, p) => { plansSet.push([e, p]); const r = m.T.comparison_entries.get(e); if (r) r.primary_plan_id = p } }
    const r = await L.runPublish({ pricing: m.pricing, checks: m.checks, store, now: () => NOW, log: l => logs.push(l), hasPage: code => code !== 'AE', revalidate: async () => true, skipFindings: true })
    return { m, r, logs, plansSet }
  }
  const a = await run(base(), values)
  t('AE + GB + FR + DE: no country fails — AE\'s row is written with auto_publish false (the CHECK holds)', (a.r.countryErrors ?? []).length === 0 && a.m.T.comparison_publish.get('AE').auto_publish === false, a.r.countryErrors)
  t('…all three others evaluated (a row each, evaluated now) and live with their three competitors', ['GB', 'FR', 'DE'].every(cc => a.m.T.comparison_publish.get(cc)?.evaluated_at === NOW.toISOString() && a.m.T.comparison_publish.get(cc).auto_live === true && a.m.T.comparison_publish.get(cc).shown.length === 3),
    ['GB', 'FR', 'DE'].map(cc => a.r.verdicts.find(v => v.code === cc)))
  t('…AE never live, whatever its data', a.m.T.comparison_publish.get('AE').auto_live === false && !a.r.verdicts.find(v => v.code === 'AE').live && a.r.verdicts.find(v => v.code === 'AE').reason === 'never auto-published')
  t('…the marks, events and the refresh still run after the loop (entries marked, events written)', a.m.T.comparison_entries.get('e-gb1').auto_verified_at && a.m.events.some(e => e.kind === 'country_live'))
  const f = await run(base(), values, { failOn: 'FR' })
  t('ONE country failing (FR) never stops the loop: GB and DE still evaluated, FR reported and logged', (f.r.countryErrors ?? []).map(x => x.code).join() === 'FR' && f.m.T.comparison_publish.get('GB')?.auto_live === true && f.m.T.comparison_publish.get('DE')?.auto_live === true
    && f.logs.some(l => /FR FAILED/.test(l)), f.r.countryErrors)
  // the old code's behaviour, to prove the harness's CHECK is the real one: the AE upsert without auto_publish refuses
  let refused = ''
  try { await pgSave(L.memory(base(), [], [], NOW), null)('AE', { auto_live: false, shown: [] }) } catch (e) { refused = e.message }
  t('…(the old upsert — without auto_publish — is refused by the simulated CHECK, as it was live from 10 Nov)', /comparison_publish_never_ae/.test(refused))

  // ══ 2 · units ══
  head('2 · the price units: printed price decides; minor never multiplied again; implausible not stored; major units in the prompt and the importer')
  const pc = (found, cur, words = []) => L.planColsOf('monthly_price', found, cur, words)
  t('"a partir de R$79,00" with amount 79 → 7900 BRL minor', pc({ amount: 79, currency: 'BRL', period: 'month', found_value: 'a partir de R$79,00 mensal' }, 'BRL').cols.monthly_minor === 7900)
  t('…the same with amount 7900 (already minor) → 7900, NOT 790000', pc({ amount: 7900, currency: 'BRL', period: 'month', found_value: 'a partir de R$79,00 mensal' }, 'BRL').cols.monthly_minor === 7900)
  t('"59€ /mois": amount 59 → 5900; amount 5900 → 5900', pc({ amount: 59, currency: 'EUR', found_value: '59€ /mois' }, 'EUR').cols.monthly_minor === 5900 && pc({ amount: 5900, currency: 'EUR', found_value: '59€ /mois' }, 'EUR').cols.monthly_minor === 5900)
  t('"99€ /mois": amount 99 → 9900 (the Nomad Pro case)', pc({ amount: 99, currency: 'EUR', found_value: '99€ /mois' }, 'EUR').cols.monthly_minor === 9900)
  t('¥: "月額3,980円" amount 3980 → 3980 (JPY has no minor digits); "3,980円" in the quote only → 3980', pc({ amount: 3980, currency: 'JPY', found_value: '月額3,980円' }, 'JPY').cols.monthly_minor === 3980
    && pc({ amount: 3980, currency: 'JPY', found_value: null }, 'JPY', ['キッチンカー 月額 3,980円']).cols.monthly_minor === 3980)
  const imp1 = pc({ amount: 445000, currency: 'EUR', found_value: null }, 'EUR'), imp2 = pc({ amount: 4450, currency: 'EUR', found_value: '' }, 'EUR')
  t('IMPLAUSIBLE: 445,000 € or 4,450 € a month → not stored, the plan only marked unclear', imp1.implausible === true && imp1.cols.unclear === true && !('monthly_minor' in imp1.cols) && imp2.implausible === true, [imp1, imp2])
  t('…the Eatch case: "44,50 € HT" with amount 4450 → 4450 minor (read as minor from the printed 44,50), stored', pc({ amount: 4450, currency: 'EUR', found_value: '44,50 € HT / mois' }, 'EUR').cols.monthly_minor === 4450)
  t('a yearly price is checked per month: 990 € a year → 8250 a month, plausible', pc({ amount: 990, currency: 'EUR', period: 'year', found_value: '990 € / an' }, 'EUR').cols.monthly_minor === 8250)
  t('a decision on a 100× price finding: rejected as not plausible', /not plausible/.test(L.decideOne({ id: 'x', competitor_id: 'c', field: 'monthly_price', outcome: 'changed', country_code: 'US', plan_id: 'p', quote: null, quote_in_page: true, second_check: 'confirmed', created_at: '2026-11-24T00:00:00Z',
    found: { plan_name: 'Starter', amount: 1590000, currency: 'USD', period: 'month' } }, { competitors: new Map([['c', { id: 'c', website: 'https://c.example', category_by: 'auto' }]]), plans: new Map([['p', { id: 'p', competitor_id: 'c', country_code: 'US', currency: 'USD', monthly_minor: 15900, superseded_at: null }]]), values: [], currencyOf: () => 'USD' }).reason))
  const pp = L.plansForPrompt([{ id: 'p', plan_name: 'Pro', country_code: 'FR', currency: 'EUR', price_hidden: false, monthly_minor: 2900, yearly_only: false, vat: 'excl', setup_minor: 25000, truck_fee_bps: 250, truck_fee_fixed_minor: 0, customer_fee_bps: 0, customer_fee_fixed_minor: 0, card_mode: 'unknown', card_bps: null, card_fixed_minor: null, source_url: null },
    { id: 'j', plan_name: 'M', country_code: 'JP', currency: 'JPY', price_hidden: false, monthly_minor: 3980, yearly_only: false, vat: 'incl', setup_minor: 0, truck_fee_bps: 0, truck_fee_fixed_minor: 0, customer_fee_bps: 0, customer_fee_fixed_minor: 0, card_mode: 'unknown', card_bps: null, card_fixed_minor: null, source_url: null }])
  t('the PROMPT shows stored prices in MAJOR units (29 €, set-up 250 €, 2.5 %; ¥3,980 as 3980) — never minor', pp[0].monthly === 29 && pp[0].setup === 250 && pp[0].truck_fee_percent === 2.5 && pp[1].monthly === 3980 && !('monthly_minor' in pp[0]))
  const promptSrc = read('lib/competitor-check/prompts.ts')
  t('…and no prompt says "smallest unit" any more; the price rule says "79 for R$79,00, never 7900"', !/smallest unit/.test(promptSrc) && /never 7900/.test(promptSrc))
  const amt = L.RECORD_FINDINGS_TOOL.input_schema.properties.findings.items.properties.amount
  t('the SCHEMA says amount is as printed, in normal units, never cents (still one union: anyOf number | null)', /Never in cents/.test(amt.description) && Array.isArray(amt.anyOf) && amt.anyOf.length === 2)

  // ══ 3 · the importer ══
  head('3 · the importer: not relevant, back to active, not sold in, focus, a corrected plan, units, a quoted answer, check records')
  const KEYS = JSON.parse(read('data/comparison-features/features.json')).features.map(x => x.key)
  const mem = (competitors, plans = [], values = []) => {
    const S = { competitors: competitors.map(x => ({ ...x })), plans: plans.map(x => ({ ...x })), entries: [], values: values.map(x => ({ ...x })), checks: [], updates: [] }
    return { S, store: {
      competitors: async () => S.competitors.map(x => ({ ...x })), plans: async () => S.plans.map(x => ({ ...x })), entries: async () => S.entries.map(x => ({ ...x })),
      insertCompetitor: async r => { S.competitors.push({ ...r, lifecycle: r.lifecycle ?? 'active' }) },
      updateCompetitor: async (id, cols) => { S.updates.push([id, cols]); Object.assign(S.competitors.find(x => x.id === id), cols) },
      insertPlans: async rows => { for (const r of rows) S.plans.push({ ...r, superseded_at: null }) },
      insertEntries: async rows => { S.entries.push(...rows) },
      featureValues: async () => S.values.filter(v => !v.superseded_at).map(x => ({ ...x })),
      insertFeatureValues: async rows => { S.values.push(...rows.map((r, i) => ({ ...r, id: `nv${S.values.length + i}`, superseded_at: null }))) },
      supersedeFeatureValues: async (ids2, at) => { for (const v of S.values) if (ids2.includes(v.id)) v.superseded_at = at },
      supersedePlans: async (ids2, at) => { for (const p of S.plans) if (ids2.includes(p.id) && !p.superseded_at) p.superseded_at = at },
      upsertFeatureChecks: async rows => { for (const r of rows) { const i = S.checks.findIndex(c => c.competitor_id === r.competitor_id && c.feature_key === r.feature_key && c.country_code === r.country_code); if (i >= 0) S.checks[i] = r; else S.checks.push(r) } },
    } }
  }
  const stamp = { today: '2026-11-24', path: 'data/x.json', featureKeys: KEYS, nowIso: '2026-11-24T12:00:00Z' }
  const P = (o = {}) => ({ id: 'np1', competitor_id: 's1', country_code: 'US', plan_name: 'Starter', currency: 'USD', price_hidden: false, yearly_only: false, setup_minor: 0, truck_fee_bps: 0, truck_fee_fixed_minor: 0, customer_fee_bps: 0, customer_fee_fixed_minor: 0,
    card_mode: 'unknown', card_bps: null, card_fixed_minor: null, card_rate_assumed: false, order_cap: null, included_orders: null, overage_fixed_minor: null, vat: 'unknown', status: 'counted', unclear: false, second_hand: false,
    source: 'research', source_url: 'https://s1.example/pricing', checked_on: '2026-11-24', verified_at: null, verified_by: null, notes: 'x', ...o })
  const file = (competitors, plans = [], entries = []) => ({ id: 'x', checked_on: '2026-11-24', competitors, plans, entries })
  const stored = [{ id: 's1', name: 'Foody', website: 'https://s1.example', lifecycle: 'active', notes: null, focus: 'nearest_local', not_in_countries: [], check_failures: 5 },
    { id: 's2', name: 'Aph', website: 'https://s2.example', lifecycle: 'active', notes: 'old note', focus: 'food_truck', not_in_countries: [] },
    { id: 's3', name: 'Qromo', website: 'https://s3.example', lifecycle: 'not_relevant', notes: null, focus: null, not_in_countries: [] },
    { id: 's4', name: 'Cand', website: 'https://s4.example', lifecycle: 'candidate', notes: null, focus: null, not_in_countries: [] }]
  const m1 = mem(stored, [{ id: 'old1', competitor_id: 's1', country_code: 'US', plan_name: 'Starter', currency: 'USD', monthly_minor: 1590000, superseded_at: null }],
    [{ id: 'q0', competitor_id: 's1', feature_key: 'preorder', country_code: null, value: 'yes', note: null, quote: null, source_url: null, superseded_at: null, verified_at: null, auto_blocked: false },
     { id: 'q1', competitor_id: 's1', feature_key: 'kds', country_code: null, value: 'yes', note: null, quote: 'Has a KDS.', source_url: 'https://s1.example/f', superseded_at: null, verified_at: null, auto_blocked: false },
     { id: 'q2', competitor_id: 's1', feature_key: 'social', country_code: null, value: 'no', note: null, quote: null, source_url: null, superseded_at: null, verified_at: '2026-11-01', auto_blocked: false }])
  const F1 = file([
    { id: 's1', name: 'Foody', website: 'https://s1.example', focus: 'food_truck', set_focus: true, lifecycle: 'active', check_urls: ['https://s1.example/pricing', 'https://s1.example/features'], request_check: true,
      not_sold_in: [{ country: 'TH', reason: 'no Thai presence', source_url: 'https://s1.example/' }],
      answers: [{ key: 'preorder', value: 'yes', quote: 'Pre-order for tomorrow.', source_url: 'https://s1.example/features' }, { key: 'kds', value: 'partial', quote: 'A screen.', source_url: 'https://s1.example/f' }, { key: 'social', value: 'yes', quote: 'Posts.', source_url: 'https://s1.example/f' }] },
    { id: 's2', name: 'Aph', set_lifecycle: { value: 'not_relevant', reason: 'QR table ordering only', source_url: 'https://s2.example/qr' }, request_check: false },
    { id: 's3', name: 'Qromo', lifecycle: 'active', set_lifecycle: { value: 'active', reason: 'pre-orders shown', source_url: 'https://s3.example/' }, request_check: true },
    { id: 's4', name: 'Cand', set_lifecycle: { value: 'not_relevant', reason: 'tablet table ordering', source_url: 'https://s4.example/' } },
    { id: 'n1', name: 'NewNR', website: 'https://n1.example', lifecycle: 'active', set_lifecycle: { value: 'not_relevant', reason: 'marketplace', source_url: 'https://n1.example/' } },
  ], [P({ id: 'np1', monthly_major: 159, correct: true }), P({ id: 'np2', plan_name: 'Growth', monthly_major: 199 }), P({ id: 'np3', plan_name: 'Huge', monthly_major: 4450, currency: 'EUR', country_code: 'FR' }),
    P({ id: 'np4', competitor_id: 'n1', plan_name: 'X', monthly_major: 10 })], [{ id: 'ne1', country_code: 'US', competitor_id: 'n1', primary_plan_id: null, sort_order: 1, verified_at: null }])
  t('the file passes the importer\'s own validation', L.researchProblems(F1, { featureKeys: KEYS }).length === 0, L.researchProblems(F1, { featureKeys: KEYS }))
  const c1 = await L.importResearch(m1.store, F1, stamp)
  const S = m1.S, comp = id => S.competitors.find(x => x.id === id)
  t('NOT RELEVANT: a stored active competitor → not_relevant, its reason and page in the notes (old notes kept)', comp('s2').lifecycle === 'not_relevant' && /not relevant \(data\/x\.json, 2026-11-24\): QR table ordering only — https:\/\/s2\.example\/qr/.test(comp('s2').notes) && /^old note/.test(comp('s2').notes), comp('s2'))
  t('…a candidate marked not relevant is NOT upgraded to active on the way', comp('s4').lifecycle === 'not_relevant' && !/upgraded from candidate/.test(comp('s4').notes ?? ''), comp('s4'))
  t('…a NEW competitor found not relevant is never added — nor its plans or entries', !comp('n1') && !S.plans.some(p => p.competitor_id === 'n1') && !S.entries.some(e => e.competitor_id === 'n1'))
  t('BACK TO ACTIVE: a stored not-relevant competitor → active, with its reason and page', comp('s3').lifecycle === 'active' && /back to active .*pre-orders shown — https:\/\/s3\.example\//.test(comp('s3').notes))
  t('NOT SOLD IN: TH added to not_in_countries, with its reason', JSON.stringify(comp('s1').not_in_countries) === '["TH"]' && /not sold in TH .*no Thai presence/.test(comp('s1').notes))
  t('SET FOCUS: the file\'s focus replaces the stored one', comp('s1').focus === 'food_truck')
  t('CORRECT: the stored "Starter" (1,590,000) is SUPERSEDED (kept as history), the corrected one (15,900 from monthly_major 159) inserted', S.plans.find(p => p.id === 'old1').superseded_at === '2026-11-24T12:00:00Z' && S.plans.find(p => p.id === 'np1').monthly_minor === 15900 && !S.plans.find(p => p.id === 'np1').correct && !('monthly_major' in S.plans.find(p => p.id === 'np1')))
  t('UNITS: monthly_major 199 → monthly_minor 19900', S.plans.find(p => p.id === 'np2').monthly_minor === 19900)
  const huge = S.plans.find(p => p.id === 'np3')
  t('IMPLAUSIBLE: 4,450 € a month is NOT stored — the plan arrives hidden and unclear, and counted', huge.monthly_minor === null && huge.status === 'hidden' && huge.unclear === true && /NOT STORED/.test(huge.notes) && c1.implausible === 1, huge)
  t('ANSWERS: a quoted answer replaces a QUOTELESS one; a quoted one and Admin\'s verified one are kept', S.values.find(v => v.id === 'q0').superseded_at && S.values.some(v => !v.superseded_at && v.feature_key === 'preorder' && v.quote === 'Pre-order for tomorrow.')
    && !S.values.find(v => v.id === 'q1').superseded_at && !S.values.find(v => v.id === 'q2').superseded_at && c1.answersReplaced === 1, S.values)
  t('CHECKS: the answers written record their check (every country = \'\'), with the pages read', S.checks.some(c => c.competitor_id === 's1' && c.feature_key === 'preorder' && c.country_code === '' && c.pages_checked.pages.some(p => p.kind === 'pricing')) && c1.checksRecorded >= 1, S.checks)
  t('…a check is requested for the counted ones only (not for one just marked not relevant)', !!comp('s1').check_requested_at && !comp('s2').check_requested_at && !!comp('s3').check_requested_at)
  t('…a competitor re-read today is a GOOD check: its failed-check count (5, from the API outage) starts again', comp('s1').check_failures === 0 && c1.failuresReset === 1)
  const c2 = await L.importResearch(m1.store, F1, stamp)
  t('IDEMPOTENT: the same file again changes no plan (the corrected one is already in), adds no answer, marks nothing again', c2.plansCorrected === undefined && S.plans.filter(p => !p.superseded_at && p.competitor_id === 's1' && p.plan_name === 'Starter').length === 1 && (c2.notRelevant ?? 0) === 0 && (c2.revived ?? 0) === 0, c2)
  const bad = L.researchProblems(file([{ id: 'z', name: 'Z', set_lifecycle: { value: 'gone' }, not_sold_in: [{ country: 'x' }] }], [P({ competitor_id: 'z', monthly_major: 59, monthly_minor: 59 })]), { featureKeys: KEYS })
  t('VALIDATION refuses: a bad lifecycle value, a missing reason or page, a bad country, monthly_major and monthly_minor that disagree', ['set_lifecycle.value', 'not_sold_in needs a two-letter', 'needs its reason', 'disagree'].every(w => bad.some(b => b.includes(w))), bad)

  // ══ 4 · Dominic's rules ══
  head('4 · Dominic\'s rules in evaluateCountry (24 Nov)')
  const cc = (id, o = {}) => ({ id, name: `C-${id}`, website: `https://${id}.example`, focus: 'food_truck', lifecycle: 'active', addedAsCandidate: false, featuresVerifiedAt: null, checkUrls: [], checkIntervalDays: 90, checkFailures: 0, category: 'food_truck', categoryBy: 'auto', notInCountries: [], ...o })
  const pl = (id, cid, o = {}) => ({ id, competitorId: cid, countryCode: 'GB', planName: 'Basic', currency: 'GBP', priceHidden: false, monthlyMinor: 2900, status: 'counted', unclear: false, sourceUrl: `https://${cid}.example/pricing`, checkedOn: '2026-11-20',
    verifiedAt: null, verifiedBy: null, supersededAt: null, autoVerifiedAt: null, autoBlocked: false, ...o })
  const en = (id, cid, pid, o = {}) => ({ id, countryCode: 'GB', competitorId: cid, primaryPlanId: pid, sortOrder: 1, verifiedAt: null, pinned: false, hidden: false, autoVerifiedAt: null, autoBlocked: false, ...o })
  const va = (cid, o = {}) => ({ id: `va-${cid}-${o.featureKey ?? 'ahead'}`, competitorId: cid, featureKey: 'ahead', countryCode: null, value: 'partial', note: null, quote: 'Order online, collect at the truck.', sourceUrl: `https://${cid}.example/order`, checkedOn: '2026-11-24',
    verifiedAt: null, verifiedBy: null, supersededAt: null, createdAt: null, autoVerifiedAt: null, autoBlocked: false, ...o })
  const X = (comps, o = {}) => ({ code: 'GB', currency: 'GBP', hasPage: true, autoPublish: true, adminOff: false, today: '2026-11-24', competitors: comps, plans: comps.map(c => pl(`p-${c.id}`, c.id)),
    entries: comps.map(c => en(`e-${c.id}`, c.id, `p-${c.id}`)), values: comps.filter(c => !c.noAnswer).map(c => va(c.id)), priceEvidence: [], heldPlanIds: new Set(), ...o })
  const shownNames = v => v.shown.map(s => s.competitorId).join(',')
  const two = L.evaluateCountry(X([cc('a'), cc('b')]))
  t('ONE CHECK IS ENOUGH: two eligible food-truck tools with a price on their own site — no "both checks" evidence — → live', two.live && shownNames(two) === 'a,b', two)
  const aph = L.evaluateCountry(X([cc('a'), cc('b'), cc('aph', { noAnswer: true })], { values: [va('a'), va('b'), va('aph', { featureKey: 'qr', value: 'yes', quote: 'Scan the QR at your table.' })] }))
  t('APHELIOS-STYLE (no online ordering ahead, only QR at the table) → never shown, with the reason', !aph.shown.some(s => s.competitorId === 'aph') && /no quote on its own site showing customers can order online ahead/.test(aph.competitors.find(c => c.competitorId === 'aph').reason))
  const off = L.evaluateCountry(X([cc('a'), cc('b')], { values: [va('a'), va('b', { sourceUrl: 'https://reviews.example/b' })] }))
  t('…an order-ahead quote that is NOT on its own site does not count', !off.live && off.shown.length === 1)
  const unq = L.evaluateCountry(X([cc('a'), cc('b')], { values: [va('a'), va('b', { quote: null })] }))
  t('…nor an order-ahead "yes" without a quote (the 23 Oct legacy answers)', !unq.live)
  const ft3r2 = L.evaluateCountry(X([cc('a'), cc('b'), cc('c'), cc('r1', { focus: 'nearest_local', category: 'restaurant' }), cc('r2', { focus: 'nearest_local', category: 'restaurant' })]))
  t('FOOD-TRUCK FIRST: three food-truck tools + two restaurant tools → only the three food-truck tools shown', ft3r2.live && shownNames(ft3r2) === 'a,b,c' && /others only make up 2/.test(ft3r2.competitors.find(c => c.competitorId === 'r1').reason), ft3r2)
  const ft1r2 = L.evaluateCountry(X([cc('a'), cc('r1', { focus: 'nearest_local', category: 'restaurant' }), cc('r2', { focus: 'nearest_local', category: 'restaurant' })]))
  t('…one food-truck tool + two restaurant tools → the food-truck tool and ONE restaurant tool (to make up 2)', ft1r2.live && ft1r2.shown.length === 2 && ft1r2.shown[0].competitorId === 'a')
  const r2 = L.evaluateCountry(X([cc('r1', { focus: 'nearest_local' }), cc('p1', { focus: 'pos' })]))
  t('…no food-truck tool: a restaurant and a pos tool make up 2 → live', r2.live && r2.shown.length === 2)
  const sumup = (id = 'su') => cc(id, { focus: 'pos', website: 'https://www.sumup.com/fi-fi/', category: 'general_pos' })
  const suA = L.evaluateCountry(X([cc('a'), sumup()], { plans: [pl('p-a', 'a'), pl('p-su', 'su', { sourceUrl: 'https://www.sumup.com/fi-fi/verkkokauppa/' })], values: [va('a'), va('su', { sourceUrl: 'https://www.sumup.com/fi-fi/x' })] }))
  t('SUMUP: one food-truck tool + SumUp → SumUp is the single fallback → 2 shown, live', suA.live && suA.shown.length === 2, suA)
  const suR = L.evaluateCountry(X([cc('r', { focus: 'nearest_local' }), sumup()], { plans: [pl('p-r', 'r'), pl('p-su', 'su', { sourceUrl: 'https://www.sumup.com/fi-fi/v' })], values: [va('r'), va('su', { sourceUrl: 'https://www.sumup.com/fi-fi/x' })] }))
  t('…one restaurant tool + SumUp → live too', suR.live)
  const suOnly = L.evaluateCountry(X([sumup(), cc('p2', { focus: 'pos' })].slice(0, 1), { plans: [pl('p-su', 'su', { sourceUrl: 'https://www.sumup.com/fi-fi/v' })], values: [va('su', { sourceUrl: 'https://www.sumup.com/fi-fi/x' })] }))
  t('…SumUp alone (no eligible food-truck or restaurant tool) → not shown, not live', !suOnly.live && suOnly.shown.length === 0)
  const su2 = L.evaluateCountry(X([cc('a'), cc('b'), sumup()], { plans: [pl('p-a', 'a'), pl('p-b', 'b'), pl('p-su', 'su', { sourceUrl: 'https://www.sumup.com/fi-fi/v' })], values: [va('a'), va('b'), va('su', { sourceUrl: 'https://www.sumup.com/fi-fi/x' })] }))
  t('…two food-truck tools + SumUp → SumUp not shown (it is a fallback only)', su2.shown.length === 2 && !su2.shown.some(s => s.competitorId === 'su') && /single fallback/.test(su2.competitors.find(c => c.competitorId === 'su').reason))
  const ano = L.evaluateCountry(X([cc('a'), cc('an', { website: 'https://anolla.com/hr' })], { plans: [pl('p-a', 'a'), pl('p-an', 'an', { sourceUrl: 'https://anolla.com/hr/cijene' })], values: [va('a'), va('an', { sourceUrl: 'https://anolla.com/hr/x' })] }))
  t('ANOLLA never counts (a booking tool)', !ano.live && !ano.shown.some(s => s.competitorId === 'an') && /booking tool/.test(ano.competitors.find(c => c.competitorId === 'an').reason))
  const cur = L.evaluateCountry(X([cc('a'), cc('b')], { plans: [pl('p-a', 'a'), pl('p-b', 'b', { currency: 'USD' })] }))
  t('PRICE: a price in the wrong currency → not publishable', !cur.live && /not GBP/.test(cur.competitors.find(c => c.competitorId === 'b').reason))
  const ro = (curr) => L.evaluateCountry(X([cc('a'), cc('b')], { code: 'RO', currency: 'RON', plans: [pl('p-a', 'a', { countryCode: 'RO', currency: curr }), pl('p-b', 'b', { countryCode: 'RO', currency: curr })], entries: [en('e-a', 'a', 'p-a', { countryCode: 'RO' }), en('e-b', 'b', 'p-b', { countryCode: 'RO' })] }))
  t('…EUR also counts in RO (its vendors price in EUR); USD does not', ro('EUR').live && !ro('USD').live)
  const un = L.evaluateCountry(X([cc('a'), cc('b')], { plans: [pl('p-a', 'a'), pl('p-b', 'b', { unclear: true })] }))
  const hid = L.evaluateCountry(X([cc('a'), cc('b')], { plans: [pl('p-a', 'a'), pl('p-b', 'b', { priceHidden: true, monthlyMinor: null, status: 'hidden' })] }))
  const old = L.evaluateCountry(X([cc('a'), cc('b')], { plans: [pl('p-a', 'a'), pl('p-b', 'b', { checkedOn: '2026-07-01' })] }))
  t('…unclear, hidden, or checked longer ago than its interval + 30 days → not publishable', !un.live && !hid.live && !old.live && /taken down/.test(old.competitors.find(c => c.competitorId === 'b').reason))
  const adm = L.evaluateCountry(X([cc('a'), cc('b')], { plans: [pl('p-a', 'a'), pl('p-b', 'b', { verifiedAt: '2026-11-01', sourceUrl: 'https://elsewhere.example' })] }))
  t('…an Admin-verified plan still counts', adm.live)
  const fb = L.evaluateCountry(X([cc('a'), cc('b')], { plans: [pl('p-a', 'a'), pl('p-b', 'b', { priceHidden: true, monthlyMinor: null, status: 'hidden' }), pl('p-b2', 'b', { planName: 'Pro', monthlyMinor: 4900 })] }))
  t('PLAN: where the entry\'s own plan has no price, the competitor\'s qualifying plan in the country is chosen', fb.live && fb.competitors.find(c => c.competitorId === 'b').planId === 'p-b2')
  const nic = L.evaluateCountry(X([cc('a'), cc('b', { notInCountries: ['GB'] })]))
  t('NOT SOLD HERE (not_in_countries) → never shown there', !nic.live && /not sold in this country/.test(nic.competitors.find(c => c.competitorId === 'b').reason))
  const one = L.evaluateCountry(X([cc('a')]))
  t('LIVE needs 2: one eligible priced competitor → not live, with the reason', !one.live && /only 1 eligible competitor/.test(one.reason))
  const six = L.evaluateCountry(X(['a', 'b', 'c', 'd', 'e', 'f'].map(i => cc(i))))
  t('…at most four shown', six.live && six.shown.length === 4)
  const ae = L.evaluateCountry(X([cc('a'), cc('b')], { code: 'AE', currency: 'GBP' }))
  t('…AE never live, whatever its data', !ae.live && ae.reason === 'never auto-published')
  t('…a page, auto-publish on and Admin not off are all needed', [{ hasPage: false }, { autoPublish: false }, { adminOff: true }].every(o => !L.evaluateCountry(X([cc('a'), cc('b')], o)).live))
  t('FEATURES may be "not stated": competitors with only their order-ahead answer → live', two.live)

  // ══ 5 · marks ══
  head('5 · the run marks only the competitors shown, and points an entry at the plan chosen')
  const five = ['g1', 'g2', 'g3', 'g4', 'g5']
  const b5 = { countries: [{ code: 'GB', currency: 'GBP', locale: 'en-GB', enabled: true, comparisonStatus: 'off' }], publish: [], competitors: five.map(i => rc(i)), plans: [...five.map(i => rp(`p-${i}`, i, 'GB')), rp('p-g1b', 'g1', 'GB', { plan_name: 'Pro', monthly_minor: 4900 })],
    entries: five.map(i => re(`e-${i}`, i, 'GB', `p-${i}`)), checks: [], evidence: [] }
  b5.plans[0] = rp('p-g1', 'g1', 'GB', { price_hidden: true, monthly_minor: null, status: 'hidden' })
  const r5 = await run(b5, five.map(i => rv(`v-${i}`, i)))
  const marked = five.filter(i => r5.m.T.comparison_entries.get(`e-${i}`).auto_verified_at)
  t('five eligible food-truck tools → exactly the FOUR shown are marked (the page picks from the marked ones)', marked.length === 4 && r5.m.T.comparison_publish.get('GB').shown.length === 4, marked)
  t('…g1\'s own plan has no price: its entry is pointed at its qualifying plan (Pro) and that plan marked', r5.plansSet.some(([e, p]) => e === 'e-g1' && p === 'p-g1b') && r5.m.T.competitor_plans.get('p-g1b').auto_verified_at)

  // ══ 6 · source ══
  head('6 · the source: the publish-only entry point, the workflow, the deployed page')
  const pub = read('scripts/comparison-publish/main.ts')
  t('scripts/comparison-publish/main.ts runs runPublish with no Claude API (no Anthropic import, no checker)', /runPublish/.test(pub) && !/anthropic/i.test(pub.replace(/\/\/.*$/gm, '')) && !/runChecker/.test(pub))
  // compare-fix-2 (24 Nov 2026): the dry run is now the real run inside ONE transaction that always ROLLBACKs (scripts/compare-fix-2.cjs §6)
  t('…its --dry-run keeps nothing (one transaction that rolls back) and skips the findings', /inTransaction\(db\.client/.test(pub) && /\{ rollback: dryRun \}/.test(pub) && /skipFindings: true/.test(pub))
  let wf = ''
  try { wf = execSync('git diff --name-only 2f0e763a -- .github/workflows/competitor-check.yml', { cwd: REPO }).toString().trim() } catch { wf = 'error' }
  t('the workflow (.github/workflows/competitor-check.yml) is unchanged', wf === '')
  t('ACCOUNT errors (credit balance, workspace usage limit, login) are never a competitor\'s failed check — a real one still is',
    L.isAccountError('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}')
    && L.isAccountError('400 ... You have reached your specified workspace API usage limits. You will regain access on 2026-12-01 at 00:00 UTC.')
    && !L.isAccountError('record_findings was malformed twice') && !L.isAccountError('the page timed out'))
  t('…and the checker\'s failure count uses that rule (scripts/competitor-check/main.ts)', /f\.kind !== 'incomplete' && !isAccountError\(f\.error\)/.test(read('scripts/competitor-check/main.ts')))
  t('the page code (lib/comparison.ts) is unchanged — it shows what the stored marks say', execSync('git diff --name-only 2f0e763a -- lib/comparison.ts lib/comparison-flags.ts lib/comparison-selection.ts', { cwd: REPO }).toString().trim() === '')

  console.log(`\n${fail ? '🔴' : '✅'} compare-fix-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error('🔴 the harness threw:', e); process.exit(1) })
