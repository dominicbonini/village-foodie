#!/usr/bin/env node
// docs/compare-fix-1/simulate.cjs — compare-fix-1 (24 November 2026): what step 6 WOULD do, on an IN-MEMORY copy of a read-only export.
// No database connection, no network, no write anywhere. It runs the real code: lib/data-import/research.ts importResearch (the fixed
// importer) with data/compare-research-1/competitors.json, then lib/comparison-publish.ts evaluateCountry (Dominic's rules) for every
// switched-on country.
//
//   node docs/compare-fix-1/simulate.cjs <snapshot.json>
//
// The snapshot is the JSON of three read-only SELECTs (docs/compare-fix-1-report.md §6): competitors, country_settings and
// comparison_publish; current competitor_plans and every comparison_entries row; the current ahead / preorder answers.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS script, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const ROOT = path.resolve(__dirname, '../..')
const jiti = require(path.join(ROOT, 'node_modules/jiti'))(__filename, { alias: { '@': ROOT }, interopDefault: true })
const { importResearch, PENDING_AT } = jiti(path.join(ROOT, 'lib/data-import/research.ts'))
const { evaluateCountry, NEVER_AUTO } = jiti(path.join(ROOT, 'lib/comparison-publish.ts'))
const { competitorOut, planOut, entryOut } = jiti(path.join(ROOT, 'lib/admin/pricing-check-actions.ts'))
const { valueOut } = jiti(path.join(ROOT, 'lib/comparison-features.ts'))
const { COUNTRY_PATH_SEGMENTS } = jiti(path.join(ROOT, 'lib/marketing-country.ts'))
const { NO_COMPARISON_PAGE } = jiti(path.join(ROOT, 'lib/comparison-types.ts'))

const snap = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const file = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/compare-research-1/competitors.json'), 'utf8'))
const KEYS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/comparison-features/features.json'), 'utf8')).features.map(f => f.key)
const NOW = '2026-11-24T22:00:00.000Z'

const S = { competitors: snap.competitors.map(r => ({ ...r })), plans: snap.plans.map(r => ({ ...r })), entries: snap.entries.map(r => ({ ...r })), values: snap.values.map(r => ({ ...r })), checks: [] }
let n = 0
// compare-fix-2: the database's UNIQUE indexes, enforced after every write (the compare-fix-1 simulation did not, so it showed a clean
// import the database then refused — docs/compare-fix-1-verify-report.md §1). A duplicate throws, as Postgres would.
function unique(rows, key, index) {
  const seen = new Set()
  for (const r of rows) { const k = key(r); if (k === null) continue; if (seen.has(k)) throw new Error(`duplicate key value violates unique constraint "${index}" (${k})`); seen.add(k) }
}
function enforce() {
  unique(S.competitors, r => r.id, 'competitors_pkey'); unique(S.competitors, r => String(r.name).trim().toLowerCase(), 'competitors_name_ci_key')
  unique(S.plans, r => r.id ?? null, 'competitor_plans_pkey')
  unique(S.entries, r => r.id ?? null, 'comparison_entries_pkey'); unique(S.entries, r => `${r.country_code}|${r.competitor_id}`, 'comparison_entries_country_code_competitor_id_key')
  unique(S.values, r => r.id, 'competitor_feature_values_pkey')
  unique(S.values, r => (r.superseded_at ? null : `${r.competitor_id}|${r.feature_key}|${r.country_code ?? ''}`), 'competitor_feature_values_current')
  unique(S.checks, r => `${r.competitor_id}|${r.feature_key}|${r.country_code ?? ''}`, 'competitor_feature_checks_pkey')
}
const store = {
  competitors: async () => S.competitors.map(r => ({ ...r })), plans: async () => S.plans.map(r => ({ ...r })), entries: async () => S.entries.map(r => ({ ...r })),
  insertCompetitor: async r => { S.competitors.push({ lifecycle: 'active', added_as_candidate: false, check_urls: [], check_interval_days: 90, check_failures: 0, not_in_countries: [], category: null, ...r }); enforce() },
  updateCompetitor: async (id, cols) => { Object.assign(S.competitors.find(x => x.id === id), cols) },
  insertPlans: async rows => { for (const r of rows) S.plans.push({ superseded_at: null, auto_verified_at: null, auto_blocked: false, created_at: NOW, ...r }); enforce() },
  insertEntries: async rows => { for (const r of rows) S.entries.push({ pinned: false, hidden: false, auto_verified_at: null, auto_blocked: false, group_label: null, created_at: NOW, ...r }); enforce() },
  featureValues: async () => S.values.filter(v => !v.superseded_at).map(r => ({ ...r })),
  insertFeatureValues: async rows => { for (const r of rows) S.values.push({ id: `sim-${n++}`, superseded_at: null, auto_verified_at: null, auto_blocked: false, created_at: NOW, ...r }); enforce() },
  supersedeFeatureValues: async (ids, at) => { for (const v of S.values) if (ids.includes(v.id) && !v.superseded_at) v.superseded_at = at },
  activateFeatureValues: async ids => { for (const v of S.values) if (ids.includes(v.id) && v.superseded_at === PENDING_AT) v.superseded_at = null; enforce() },
  supersedePlans: async (ids, at) => { for (const p of S.plans) if (ids.includes(p.id) && !p.superseded_at) p.superseded_at = at },
  upsertFeatureChecks: async rows => { for (const r of rows) { const i = S.checks.findIndex(x => x.competitor_id === r.competitor_id && x.feature_key === r.feature_key && (x.country_code ?? '') === (r.country_code ?? '')); if (i >= 0) S.checks[i] = { ...S.checks[i], ...r }; else S.checks.push(r) } enforce() },
}

;(async () => {
  const counts = await importResearch(store, file, { today: '2026-11-24', path: 'data/compare-research-1/competitors.json', featureKeys: KEYS, nowIso: NOW })
  console.log(`IMPORT (simulated): ${JSON.stringify(counts)}`)
  const competitors = S.competitors.map(competitorOut), plans = S.plans.filter(p => !p.superseded_at).map(planOut), entries = S.entries.map(entryOut), values = S.values.map(valueOut)
  const pub = new Map((snap.publish ?? []).map(p => [p.country_code, p]))
  const out = []
  for (const c of snap.countries.filter(x => x.enabled)) {
    const p = pub.get(c.code)
    const v = evaluateCountry({ code: c.code, currency: c.currency, hasPage: !!COUNTRY_PATH_SEGMENTS[c.code] && !NO_COMPARISON_PAGE.includes(c.code),
      autoPublish: !NEVER_AUTO.has(c.code) && (p?.auto_publish ?? true) !== false, adminOff: p?.admin_off === true, today: '2026-11-24',
      competitors, plans, entries, values, priceEvidence: [], heldPlanIds: new Set() })
    out.push(v)
  }
  const live = out.filter(v => v.live), short = out.filter(v => !v.live && v.shown.length === 1)
  console.log(`\nLIVE (${live.length}):`)
  for (const v of live.sort((a, b) => a.code.localeCompare(b.code))) console.log(`  ${v.code}: ${v.shown.map(s => s.name).join(' · ')}`)
  console.log(`\nONE SHORT (${short.length}):`)
  for (const v of short.sort((a, b) => a.code.localeCompare(b.code))) console.log(`  ${v.code}: ${v.shown[0].name} — ${v.reason}`)
  if (process.argv.includes('--why')) for (const code of process.argv.slice(process.argv.indexOf('--why') + 1)) {
    const v = out.find(x => x.code === code); if (!v) continue
    console.log(`\n${code}: ${v.live ? 'LIVE' : 'not live'} — ${v.reason}`)
    for (const c of v.competitors) console.log(`  ${c.publishable ? '✓' : '·'} ${c.name}: ${c.reason}`)
  }
  fs.writeFileSync(path.join(path.dirname(process.argv[2]), 'simulated-verdicts.json'), JSON.stringify(out, null, 1))
})().catch(e => { console.error('simulate failed:', e); process.exit(1) })
