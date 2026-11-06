#!/usr/bin/env node
// scripts/competitor-features-2.cjs — competitor-features-2 (3 November 2026, docs/competitor-features-2-report.md).
//   node scripts/competitor-features-2.cjs        (NO NETWORK, NO DATABASE, NO CLAUDE API — fixture responses only)
//
// A leaner, fairer competitor checker, proven with fixtures:
//   1 · the importer gives every feature its tier (core / commercial / secondary / off), adds "notify", turns the four OFF
//       features' Check tick off (answers kept), and is a no-op on a rerun; Admin's later choices stay;
//   2 · each tier is asked on its own interval (settings, not code): a check asks only the features that are DUE; a new
//       feature is due at once; a street-food market only discovery and the commercial features; off never; the deep
//       check every feature that applies; the quick pass the same; the next check after the most frequent tier's interval;
//   3 · "not mentioned": a page that does not mention a feature gives not_mentioned (never "no"); a "no" without a quote in
//       which the competitor says it does not offer it is rejected; old "no" answers are judged again; Admin's accept
//       writes not_mentioned;
//   4 · the DE admin comparison says "Auf der Website nicht erwähnt" (neutral, never Nein), and a market is never marked
//       down for a feature that does not apply to it;
//   5 · notify's own answer comes from what the code does (the order-ready email, the order page; no SMS, WhatsApp, push);
//   6 · the migration, the store's tolerant reads, the words in both languages.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const kit = require('./_render-kit.cjs')({ cacheTag: 'competitor-features-2' })
const { REPO } = kit
const FX = require('./_competitor-check-1-fixtures.cjs')
const CDE = require('./_compare-de-1-fixtures.cjs')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const sha = b => crypto.createHash('sha256').update(b).digest('hex')
const dec = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
const text = html => dec(String(html).replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/[\s  ]+/g, ' ')

;(async () => {
  const L = await kit.bundle('cf2-lib', [
    "export { runChecker, checkCompetitor, answersFor, applicableFeatures } from '@/lib/competitor-check/checker'",
    "export { dueFeatures, nextIntervalFor, routineIntervalOf, tierIntervalsOut, featureCheckFor, featureCheckKey, DEFAULT_TIER_INTERVALS } from '@/lib/competitor-check/core'",
    "export { validateRecordFindings, saysNotOffered, FEATURE_ANSWERS, RECORD_FINDINGS_TOOL } from '@/lib/competitor-check/model'",
    "export { EXTRACTOR_SYSTEM, extractorMessage } from '@/lib/competitor-check/prompts'",
    "export { passRequest } from '@/lib/competitor-check/pass'",
    "export { settingsOut, competitorForCheck } from '@/lib/competitor-check/store-supabase'",
    "export { acceptFinding } from '@/lib/admin/competitor-check-actions'",
    "export { importFeatures, featuresProblems } from '@/lib/data-import/features'",
    "export { runImports, DATA_FILES, importLines } from '@/lib/data-import/importer'",
    "export { FEATURE_TIERS, FEATURE_VALUES, FOCUS_ONLY, appliesToFocus, tierOf } from '@/lib/comparison-features'",
    "export { FILE_FEATURES } from '@/lib/comparison-features-file'",
  ].join('\n'))
  const raw = read('data/comparison-features/features.json')
  const doc = JSON.parse(raw)
  const TODAY = '2026-11-03'
  const NOW = new Date(`${TODAY}T02:10:00Z`)

  // ── 1 · the importer ────────────────────────────────────────────────────────────────────────────────────────────────
  head('1 · the importer gives each feature its tier, adds notify, turns the four OFF ticks off — once; a rerun is a no-op')
  {
    const byKey = Object.fromEntries(doc.features.map(f => [f.key, f]))
    const tiers = k => doc.features.filter(f => f.tier === k).map(f => f.key)
    t('the file: 46 features — core 25, commercial 6, secondary 11, off 4; checked exactly when not off (42)', doc.features.length === 46 && tiers('core').length === 25 && tiers('commercial').length === 6
      && tiers('secondary').length === 11 && tiers('off').length === 4 && doc.features.every(f => f.checked === (f.tier !== 'off')) && L.featuresProblems(doc).length === 0, L.featuresProblems(doc))
    const CORE = ['preorder', 'capacity', 'ahead', 'schedule', 'walkup', 'stock', 'menuphoto', 'cards', 'localpay', 'paypal', 'kds', 'tickets', 'offline', 'vans', 'domain', 'whatsapp', 'social', 'discovery', 'ipad', 'android', 'hardware', 'terminal', 'asap', 'custfee', 'notify']
    t('CORE as the brief lists it (asap and custfee checked but hidden; notify new)', JSON.stringify(tiers('core').sort()) === JSON.stringify([...CORE].sort())
      && byKey.asap.show_scope === 'hidden' && byKey.custfee.show_scope === 'hidden' && byKey.asap.checked && byKey.custfee.checked, tiers('core'))
    t('COMMERCIAL: monthly, perorder, cardfee, term, setup, trial', JSON.stringify(tiers('commercial').sort()) === JSON.stringify(['cardfee', 'monthly', 'perorder', 'setup', 'term', 'trial']))
    t('SECONDARY: options, tips, staff, reports, loyalty, private, igmsg, paymethods, payattruck (all hidden) + fiscal ("some") and delivery (shown, "collection only")',
      JSON.stringify(tiers('secondary').sort()) === JSON.stringify(['delivery', 'fiscal', 'igmsg', 'loyalty', 'options', 'paymethods', 'payattruck', 'private', 'reports', 'staff', 'tips'].sort())
      && ['options', 'tips', 'staff', 'reports', 'loyalty', 'private', 'igmsg', 'paymethods', 'payattruck'].every(k => byKey[k].show_scope === 'hidden')
      && byKey.fiscal.show_scope === 'some' && byKey.delivery.show_scope === 'all' && byKey.delivery.hatchgrab_source === 'fixed:no:note')
    t('OFF: allergens, deals, qr, buzzers — checked false, still in the list (nothing deleted)', JSON.stringify(tiers('off').sort()) === JSON.stringify(['allergens', 'buzzers', 'deals', 'qr']) && tiers('off').every(k => byKey[k].checked === false))
    t('notify: ordering group, shown everywhere, core, a fixed Partly with its note', byKey.notify && byKey.notify.group_key === 'ordering' && byKey.notify.show_scope === 'all' && byKey.notify.tier === 'core' && byKey.notify.hatchgrab_source === 'fixed:partial:note')

    // The database as it is today: the 45 features, no tier, every one checked (the HEAD file's rows).
    const before = doc.features.filter(f => f.key !== 'notify').map(f0 => { const f = { ...f0 }; delete f.tier; return f }).map(f => ({ ...f, checked: true, show_scope: f.key === 'payattruck' ? 'all' : f.show_scope }))
    const comps = [{ id: 'a1', name: 'Active One', lifecycle: 'active', next_check_at: '2027-01-10' }, { id: 'c1', name: 'A Candidate', lifecycle: 'candidate', next_check_at: null }]
    const store = FX.memoryImportStore({ competitors: comps, features: before, values: [{ id: 'kept-no', competitor_id: 'a1', feature_key: 'allergens', country_code: null, value: 'no', note: null, superseded_at: null }] })
    const files = { 'data/comparison-features/features.json': Buffer.from(raw) }
    const deps = { store, read: p => files[p], sha256: sha, now: () => NOW, log: () => {} }
    const FILE = [L.DATA_FILES.find(f => f.kind === 'features')]
    const o1 = await L.runImports(deps, FILE)
    const F = k => store.db.features.find(f => f.key === k)
    t('first run on today\'s database: notify added, the 45 others re-tiered', o1[0].status === 'imported' && o1[0].counts.added === 1 && o1[0].counts.retiered === 45 && store.db.features.length === 46, o1)
    t('…every stored feature carries the file\'s tier; the OFF ones are no longer checked, payattruck is hidden', doc.features.every(f => F(f.key).tier === f.tier && F(f.key).checked === f.checked)
      && F('allergens').checked === false && F('payattruck').show_scope === 'hidden')
    t('…the OFF features\' answers are kept (allergens\' "no" still there)', store.db.values.some(v => v.id === 'kept-no' && v.value === 'no' && v.superseded_at === null))
    t('…notify is DUE at once for every ACTIVE competitor (an "unknown" answer, next check today), not for a candidate',
      store.db.values.some(v => v.competitor_id === 'a1' && v.feature_key === 'notify' && v.value === 'unknown') && !store.db.values.some(v => v.competitor_id === 'c1')
      && store.db.competitors.find(c => c.id === 'a1').next_check_at === TODAY && store.db.competitors.find(c => c.id === 'c1').next_check_at === null && o1[0].counts.markedDue === 1, { values: store.db.values.filter(v => v.feature_key === 'notify'), comps: store.db.competitors })
    const w = store.writes.length
    t('a rerun of the same file is a no-op (the file\'s sha256 is recorded)', (await L.runImports(deps, FILE))[0].status === 'unchanged' && store.writes.length === w)
    const direct = await L.importFeatures(store, doc, { today: TODAY })
    t('…and even run again by hand: nothing added, nothing re-tiered, nothing written', direct.added === 0 && direct.retiered === 0 && store.writes.length === w, direct)
    // Admin ticks allergens back on; a later file version (a new feature) leaves that choice alone — the tier did not change.
    F('allergens').checked = true
    files['data/comparison-features/features.json'] = Buffer.from(JSON.stringify({ ...doc, features: [...doc.features, { key: 'giftcards', group_key: 'payments', sort_order: 99, tier: 'secondary', checked: true, show_scope: 'hidden', show_countries: [], hatchgrab_source: 'confirm' }] }))
    const o2 = await L.runImports(deps, FILE)
    t('a later file: only the new key is added; Admin\'s choice on an unchanged tier stays (allergens ticked again)', o2[0].counts.added === 1 && o2[0].counts.retiered === 0 && F('allergens').checked === true, o2)
    const bad = L.featuresProblems({ ...doc, features: [{ ...doc.features[0], tier: 'sometimes' }, { ...doc.features[1], tier: 'off', checked: true }] })
    t('the file is refused when a tier is not one of the four, or checked does not match the tier', bad.length === 2 && bad.every(p => /tier|checked/.test(p)), bad)
    t('Admin\'s import line still reads the counts', /Comparison feature list imported 3 Nov: 46 features \(1 added, 45 already in the list\)/.test(L.importLines([{ file_path: 'data/comparison-features/features.json', sha256: 'a'.repeat(64), imported_at: '2026-11-03T02:11:00Z', result: 'ok', counts: o1[0].counts, message: null }])[2].text),
      L.importLines([{ file_path: 'data/comparison-features/features.json', sha256: 'a'.repeat(64), imported_at: '2026-11-03T02:11:00Z', result: 'ok', counts: o1[0].counts, message: null }])[2].text)
  }

  // ── 2 · due features ────────────────────────────────────────────────────────────────────────────────────────────────
  head('2 · each tier on its own interval — only the DUE features are asked; a market only discovery + commercial; off never')
  const FEATS = [
    { key: 'preorder', label: 'Pre-orders with a chosen collection time', explain: 'Customers order in advance.', tier: 'core', showScope: 'all', showCountries: [] },
    { key: 'whatsapp', label: 'WhatsApp auto-replies', explain: 'Messages answered automatically.', tier: 'core', showScope: 'all', showCountries: [] },
    { key: 'term', label: 'Minimum contract', explain: 'How long the business is tied in.', tier: 'commercial', showScope: 'all', showCountries: [] },
    { key: 'discovery', label: 'Listed on a discovery map', explain: 'Customers find the truck on a map.', tier: 'core', showScope: 'all', showCountries: [] },
    { key: 'loyalty', label: 'Loyalty', explain: 'Stamps and rewards.', tier: 'secondary', showScope: 'all', showCountries: [] },
    { key: 'qr', label: 'QR codes', explain: 'A QR code opens the order page.', tier: 'off', showScope: 'all', showCountries: [] },
  ]
  const CHECKS = {
    '|preorder': { checkedOn: '2026-10-01', rejudge: false },   // core, 33 days ago → not due (90)
    '|whatsapp': { checkedOn: '2026-08-01', rejudge: true },    // core, 94 days ago → due; its "no" is judged again
    '|term': { checkedOn: '2026-10-01', rejudge: false },       // commercial, 33 days ago → due (30)
    // discovery: never asked → due at once
    '|loyalty': { checkedOn: '2026-06-01', rejudge: false },    // secondary, 155 days ago → not due (180)
    '|qr': { checkedOn: '2025-01-01', rejudge: false },         // off → never
  }
  const I = L.DEFAULT_TIER_INTERVALS
  const keysOf = fs_ => fs_.map(f => f.key).join(',')
  {
    t('the defaults are the migration\'s: commercial 30, core 90, secondary 180', I.commercial === 30 && I.core === 90 && I.secondary === 180)
    const truck = { focus: 'food_truck', featureChecks: CHECKS }, market = { focus: 'street_food_markets', featureChecks: CHECKS }
    t('a food-truck tool: whatsapp (core, 94 days), term (commercial, 33 days), discovery (never asked) — not preorder (33 of 90), loyalty (155 of 180), qr (off)',
      keysOf(L.dueFeatures(FEATS, truck, null, TODAY, I)) === 'whatsapp,term,discovery', keysOf(L.dueFeatures(FEATS, truck, null, TODAY, I)))
    t('a street-food market: only discovery and the commercial features — term, discovery', keysOf(L.dueFeatures(FEATS, market, null, TODAY, I)) === 'term,discovery', keysOf(L.dueFeatures(FEATS, market, null, TODAY, I)))
    t('…every other focus (pos, pop-up, local restaurants) is asked core and secondary too', ['pos', 'pop_up', 'nearest_local'].every(f => keysOf(L.dueFeatures(FEATS, { focus: f, featureChecks: CHECKS }, null, TODAY, I)) === 'whatsapp,term,discovery'))
    t('exactly on the day its interval ends, a feature is due (core checked 2026-08-05 → due 2026-11-03)', keysOf(L.dueFeatures([FEATS[0]], { focus: 'food_truck', featureChecks: { '|preorder': { checkedOn: '2026-08-05', rejudge: false } } }, null, TODAY, I)) === 'preorder'
      && keysOf(L.dueFeatures([FEATS[0]], { focus: 'food_truck', featureChecks: { '|preorder': { checkedOn: '2026-08-06', rejudge: false } } }, null, TODAY, I)) === '')
    t('the intervals are settings: with core at 30 days, preorder is due too', keysOf(L.dueFeatures(FEATS, truck, null, TODAY, { ...I, core: 30 })) === 'preorder,whatsapp,term,discovery')
    t('no row at all (before the migration, or a new competitor): every feature but the off one is due', keysOf(L.dueFeatures(FEATS, { focus: 'food_truck' }, null, TODAY, I)) === 'preorder,whatsapp,term,discovery,loyalty')
    const perCountry = { '|term': { checkedOn: '2026-09-01', rejudge: false }, 'DE|term': { checkedOn: '2026-11-01', rejudge: false } }
    t('a country check reads that country\'s row first (DE asked 2 days ago → not due), the every-country row otherwise (due)',
      keysOf(L.dueFeatures([FEATS[2]], { focus: 'food_truck', featureChecks: perCountry }, 'DE', TODAY, I)) === '' && keysOf(L.dueFeatures([FEATS[2]], { focus: 'food_truck', featureChecks: perCountry }, 'AT', TODAY, I)) === 'term')
    t('a feature not tiered yet (Admin-added, tier null) is core', L.tierOf({ tier: null }) === 'core' && L.appliesToFocus({ key: 'x', tier: null }, 'food_truck') && !L.appliesToFocus({ key: 'x', tier: null }, 'street_food_markets'))
    t('the next check comes after the most frequent tier that applies — 30 days (commercial); 90 for a list with no commercial feature',
      L.nextIntervalFor(FEATS, 'food_truck', I, 77) === 30 && L.nextIntervalFor(FEATS.filter(f => f.tier !== 'commercial'), 'food_truck', I, 77) === 90 && L.nextIntervalFor([], 'food_truck', I, 77) === 77)
    t('the routine quota is sized for the most frequent tier (30)', L.routineIntervalOf(I) === 30 && L.routineIntervalOf({ commercial: 45, core: 20, secondary: 180 }) === 20)
    t('tier_intervals read tolerantly: a bad value (0, 1.5, "30", 9999) falls back to its default', JSON.stringify(L.tierIntervalsOut({ commercial: 0, core: 1.5, secondary: '30' })) === JSON.stringify(I)
      && JSON.stringify(L.tierIntervalsOut({ commercial: 14, core: 9999, secondary: 365 })) === JSON.stringify({ commercial: 14, core: 90, secondary: 365 }) && JSON.stringify(L.tierIntervalsOut(null)) === JSON.stringify(I))
    t('settingsOut: tier_intervals present → read; absent (before 20261062) → none, and the checker keeps the one interval',
      JSON.stringify(L.settingsOut({ tier_intervals: { commercial: 30, core: 90, secondary: 180 }, prices: {} }).tierIntervals) === JSON.stringify(I) && !('tierIntervals' in L.settingsOut({ prices: {} })))
    t('competitorForCheck carries its feature checks (none → every feature due)', JSON.stringify(L.competitorForCheck({ id: 'x', name: 'X', lifecycle: 'active' }, [], [], [], { x: CHECKS }).featureChecks) === JSON.stringify(CHECKS)
      && JSON.stringify(L.competitorForCheck({ id: 'y', name: 'Y', lifecycle: 'active' }, [], [], [], { x: CHECKS }).featureChecks) === '{}')
  }

  // A checker world with the tiers: the fixture API, the features above, the feature checks recorded.
  const world = ({ settings = { tierIntervals: I }, competitors, features = FEATS, api }) => {
    const store = FX.memoryCheckerStore({ settings: () => FX.SETTINGS(settings), competitors })
    store.features = async () => features.map(f => ({ ...f }))
    store.marked = []
    store.markFeaturesChecked = async (id, country, keys, today) => { store.marked.push({ id, country, keys: [...keys], today }) }
    const calls = []
    const lines = []
    return { store, calls, lines, deps: { api: api ? async p => { calls.push(JSON.parse(JSON.stringify(p))); return api(p) } : FX.fakeApi(() => 'ok:29', calls), store, now: () => NOW, log: l => lines.push(l), dryRun: false } }
  }
  const userOf = p => { const c = p.messages[0].content; return typeof c === 'string' ? c : c.map(b => b.text || '').join('\n') }
  const asked = msg => (msg.slice(msg.indexOf('Features to check'), msg.indexOf('Stored data')).match(/^- ([a-z0-9_]+) —/gm) || []).map(l => l.slice(2, -2)).join(',')
  {
    const c = FX.competitor(51, { nextCheckAt: '2026-11-01', featureChecks: CHECKS, deepCheckedAt: '2026-10-01T00:00:00Z', lastCheckedAt: '2026-10-01T00:00:00Z' })
    const W = world({ competitors: [c] })
    await L.runChecker(W.deps, { mode: 'routine', trigger: 'manual' })
    const msg = W.calls.filter(p => !p.tools.some(x => x.name === 'record_verdict')).map(userOf)[0] || ''
    t('a routine check asks ONLY the due features: whatsapp, term, discovery', asked(msg) === 'whatsapp,term,discovery', asked(msg) || W.lines.join('\n'))
    t('…its stored "no" for WhatsApp, recorded before the rule, is marked "rejudge": true in the message', /"whatsapp": \{\s*"value": "no",\s*"note": null,\s*"rejudge": true/.test(msg) && !/"term": \{[^}]*rejudge/.test(msg))
    t('…the features it asked are recorded as checked today (competitor_feature_checks — scheduling only)', W.store.marked.length === 1 && W.store.marked[0].keys.join(',') === 'whatsapp,term,discovery' && W.store.marked[0].today === TODAY, W.store.marked)
    const sched = W.store.schedule.find(([id]) => id === c.id)
    t('…and its next check is in 30 days (the commercial tier), not the old 90', sched && sched[1].next_check_at === '2026-12-03', sched)
    const W2 = world({ competitors: [FX.competitor(52, { featureChecks: CHECKS, nextCheckAt: null })] })
    await L.runChecker(W2.deps, { mode: 'single', trigger: 'manual', competitor: 'Testtruck Ordering 052' })
    const m2 = W2.calls.filter(p => !p.tools.some(x => x.name === 'record_verdict')).map(userOf)[0] || ''
    t('the DEEP check (the full check) asks every feature that applies — not the off one', /FULL DEEP CHECK/.test(m2) && asked(m2) === 'preorder,whatsapp,term,discovery,loyalty', asked(m2))
    const W3 = world({ competitors: [FX.competitor(53, { focus: 'street_food_markets', featureChecks: {}, nextCheckAt: null })] })
    await L.runChecker(W3.deps, { mode: 'single', trigger: 'manual', competitor: 'Testtruck Ordering 053' })
    const m3 = W3.calls.filter(p => !p.tools.some(x => x.name === 'record_verdict')).map(userOf)[0] || ''
    t('a street-food market\'s deep check: discovery and the commercial features only', asked(m3) === 'term,discovery', asked(m3))
    const W4 = world({ settings: {}, features: FEATS.map(f0 => { const f = { ...f0 }; delete f.tier; return f }), competitors: [FX.competitor(54, { nextCheckAt: '2026-11-01', deepCheckedAt: '2026-10-01T00:00:00Z' })] })
    await L.runChecker(W4.deps, { mode: 'routine', trigger: 'manual' })
    const m4 = W4.calls.filter(p => !p.tools.some(x => x.name === 'record_verdict')).map(userOf)[0] || ''
    const s4 = W4.store.schedule.find(([id]) => id === 'c-054')
    t('before the migration (no tiers, no checks table): every checked feature, and the competitor\'s own 90 days — as before', asked(m4) === 'preorder,whatsapp,term,discovery,loyalty,qr' && s4 && s4[1].next_check_at === '2027-02-01', { asked: asked(m4), s4 })
    // The quick pass: the features shown on the country's page that apply and are due.
    const r = L.passRequest({ ...FX.competitor(55), featureChecks: CHECKS }, { kind: 'check', country: 'DE' }, FX.SETTINGS({ features: FEATS, tierIntervals: I }), TODAY)
    const rm = L.passRequest({ ...FX.competitor(56), focus: 'street_food_markets', featureChecks: CHECKS }, { kind: 'check', country: 'DE' }, FX.SETTINGS({ features: FEATS, tierIntervals: I }), TODAY)
    t('the quick pass asks the same: whatsapp, term, discovery (a market: term, discovery)', r.keys.join(',') === 'whatsapp,term,discovery' && rm.keys.join(',') === 'term,discovery', { truck: r.keys, market: rm.keys })
    const passSrc = read('lib/competitor-check/pass.ts')
    t('…and records them as checked once the item is written (not when it is incomplete)', /if \(out\.incomplete\) return[\s\S]{0,400}markFeaturesChecked\?\.\(item\.row\.id, item\.country, out\.asked/.test(passSrc))
    const ckSrc = read('lib/competitor-check/checker.ts')
    t('an incomplete (timed-out) check records nothing as asked — its features stay due', /asked: incomplete \? \[\] : keys/.test(ckSrc) && /if \(!r\.incomplete && r\.asked\.length\) await deps\.store\.markFeaturesChecked/.test(ckSrc))
    t('the caps and 35.an-15/16 are untouched: budgetStop, the daily and monthly caps, deep_per_day still guard every check', /budgetStop/.test(ckSrc) && /dailyCapUsd/.test(ckSrc) && /monthlyCapUsd/.test(ckSrc) && /deepPerDay/.test(ckSrc))
  }

  // ── 3 · not mentioned ──────────────────────────────────────────────────────────────────────────────────────────────
  head('3 · "not mentioned": a page that does not mention a feature → not_mentioned; a "no" needs the competitor\'s own words')
  {
    t('the stored values and the tool\'s answers include not_mentioned', L.FEATURE_VALUES.includes('not_mentioned') && L.FEATURE_ANSWERS.includes('not_mentioned')
      && JSON.stringify(L.RECORD_FINDINGS_TOOL.input_schema.properties.findings.items.properties.feature).includes('not_mentioned'))
    t('the prompt: "no" ONLY with a quote saying they do not offer it; not_mentioned when the site does not mention it; unknown when the pages could not be read',
      /"no" ONLY with a verbatim quote in which the competitor itself says it does not offer it/.test(L.EXTRACTOR_SYSTEM) && /Never answer "no" because a page does not mention it/.test(L.EXTRACTOR_SYSTEM)
      && /"not_mentioned": you read its site and it does not mention the feature — outcome "not_stated", no quote/.test(L.EXTRACTOR_SYSTEM) && /"unknown": the pages that would say could not be read/.test(L.EXTRACTOR_SYSTEM)
      && /"rejudge": true was recorded before these rules: answer it again/.test(L.EXTRACTOR_SYSTEM))
    const U = 'https://tt60.example/preise'
    const feat = o => FX.F({ field: 'feature', outcome: 'unchanged', source_url: U, ...o })
    const v = findings => L.validateRecordFindings({ findings, pages_read: [U], notes: null })
    const noQuote = v([feat({ feature_key: 'loyalty', feature: 'no', quote: 'Treueprogramm', quote_en: 'Loyalty programme' })])
    t('a "no" whose quote does not say they do not offer it is REJECTED (the model is told why)', !noQuote.ok && /needs a verbatim quote in which the competitor says it does not offer this/.test(noQuote.errors.join(' ')), noQuote)
    const noNoQuote = v([feat({ feature_key: 'loyalty', feature: 'no', outcome: 'changed', quote: null, quote_en: null })])
    t('…as is a "no" with no quote at all', !noNoQuote.ok)
    const okNo = v([feat({ feature_key: 'whatsapp', feature: 'no', quote: 'WhatsApp: nicht verfügbar.', quote_en: 'WhatsApp: not available.' })])
    t('a "no" with the competitor\'s own negative ("WhatsApp: nicht verfügbar.") is kept', okNo.ok && okNo.value.findings.length === 1)
    t('the negation is read in the quote or its translation, in the list\'s languages', ['Keine Mindestlaufzeit', 'No kitchen display', "We don't offer delivery", 'Pas de livraison', 'Sin permanencia', 'Geen bezorging', 'Bez umowy'].every(q => L.saysNotOffered(q, null))
      && L.saysNotOffered('Brak', 'Not available') && !L.saysNotOffered('Kitchen display included', '') && !L.saysNotOffered('Treueprogramm', 'Loyalty programme'))
    const nm = v([feat({ feature_key: 'loyalty', feature: 'not_mentioned', outcome: 'unchanged', quote: null })])
    t('not_mentioned needs no quote — whatever outcome came with it, it is recorded as not_stated', nm.ok && nm.value.findings[0].outcome === 'not_stated' && nm.value.findings[0].feature === 'not_mentioned', nm)
    const ns = v([feat({ feature_key: 'loyalty', feature: null, outcome: 'not_stated', quote: null })])
    t('a feature the site does "not state" IS not mentioned', ns.ok && ns.value.findings[0].feature === 'not_mentioned')
    const mix = v([feat({ feature_key: 'loyalty', feature: 'no', quote: 'Treueprogramm', quote_en: 'Loyalty programme' }), feat({ feature_key: 'whatsapp', feature: 'not_mentioned', outcome: 'not_stated' })])
    t('a bad "no" beside a good finding: the "no" is left out, the rest kept', mix.ok && mix.value.findings.length === 1 && mix.value.ignored.unusable.length === 1)

    // The fixture page mentions prices, pre-orders, the term and WhatsApp — not loyalty or a discovery map.
    const page = FX.PAGE('Testtruck Ordering 060', 29)
    const api = async p => {
      if (p.tools.some(x => x.name === 'record_verdict')) return FX.msg([...FX.fetchPair(U, page), FX.toolUse('record_verdict', { verdict: 'confirmed', value: 'x', quote: 'Keine Mindestlaufzeit, monatlich kündbar.', quote_en: '' })], 'tool_use', FX.USAGE.verifier)
      return FX.msg([...FX.fetchPair(U, page), FX.toolUse('record_findings', { pages_read: [U], notes: null, findings: [
        feat({ feature_key: 'loyalty', feature: 'not_mentioned', outcome: 'not_stated', quote: null }),
        feat({ feature_key: 'discovery', feature: 'no', outcome: 'changed', quote: 'Starter: 29 € pro Monat zzgl. MwSt.', quote_en: 'Starter: €29 per month plus VAT.' }),
        feat({ feature_key: 'whatsapp', feature: 'no', quote: 'WhatsApp: nicht verfügbar.', quote_en: 'WhatsApp: not available.' }),
      ] })], 'tool_use', FX.USAGE.deep)
    }
    const W = world({ competitors: [FX.competitor(60, { checkUrls: [U], website: 'https://tt60.example', featureChecks: {} })], api })
    await L.runChecker(W.deps, { mode: 'single', trigger: 'manual', competitor: 'Testtruck Ordering 060' })
    const lo = W.store.findings.find(f => f.found.feature_key === 'loyalty')
    t('the fixture page does not mention loyalty → a not_mentioned finding (outcome not_stated, no quote, nothing to verify)', lo && lo.outcome === 'not_stated' && lo.found.feature === 'not_mentioned' && lo.quote === null && lo.second_check === 'not_run', lo)
    t('…the model\'s "no" for the discovery map, quoting a price line, never reaches Admin (left out, logged)', !W.store.findings.some(f => f.found.feature_key === 'discovery') && W.lines.some(l => /1 unusable finding left out/.test(l)), W.lines.filter(l => /Testtruck/.test(l)))
    t('…its "no" for WhatsApp, quoting "nicht verfügbar", does', W.store.findings.some(f => f.found.feature_key === 'whatsapp' && f.found.feature === 'no'))
    // Admin accepts the not_mentioned finding: the answer becomes not_mentioned (never "no", never "unknown").
    const values = []
    const pricing = {
      async getCompetitor(id) { return { id, name: 'Testtruck Ordering 060', focus: 'food_truck', lifecycle: 'active' } },
      async updateCompetitor(id, cols) { return { id, ...cols } },
      async featureValues() { return values.map(r => ({ ...r })) },
      async insertFeatureValue(r) { const row = { id: `nv-${values.length}`, superseded_at: null, created_at: null, ...r }; values.push(row); return { ...row } },
      async supersedeFeatureValue(id, at) { const r = values.find(x => x.id === id && !x.superseded_at); if (!r) return false; r.superseded_at = at; return true },
      async unsupersedeFeatureValue(id) { values.find(x => x.id === id).superseded_at = null },
    }
    const finding = { ...lo, id: 'fm1', review_status: 'pending' }
    const checks = { async getFinding(id) { return id === 'fm1' ? finding : null }, async reviewFinding(id, cols) { Object.assign(finding, cols); return { ...finding } }, async competitors() { return [] }, async countries() { return [] } }
    const acc = await L.acceptFinding(pricing, checks, 'fm1', { by: 'admin-1', at: '2026-11-03T09:00:00Z', today: TODAY })
    t('Admin accepts it: the stored answer is not_mentioned', acc.ok && values.length === 1 && values[0].feature_key === 'loyalty' && values[0].value === 'not_mentioned' && values[0].note === null, { acc, values })
    const old = { ...finding, id: 'fm2', review_status: 'pending', found: { ...finding.found, feature: null } }
    checks.getFinding = async id => (id === 'fm2' ? old : null); checks.reviewFinding = async (id, cols) => { Object.assign(old, cols); return { ...old } }
    const acc2 = await L.acceptFinding(pricing, checks, 'fm2', { by: 'admin-1', at: '2026-11-03T09:05:00Z', today: TODAY })
    t('…an older not_stated finding (from before the rule, no answer in it) still saves "unknown"', acc2.ok && values[values.length - 1].value === 'unknown')
    // The migration's handling of the "no" answers already stored.
    const sql = read('supabase/migrations/20261062_competitor_features_2.sql')
    t('existing "no" answers are LEFT AS THEY ARE and marked rejudge — due again at their tier\'s next check (no row of competitor_feature_values changed)',
      /select competitor_id, feature_key, coalesce\(country_code, ''\), checked_on, value = 'no'\s+from public\.competitor_feature_values\s+where superseded_at is null and checked_on is not null/.test(sql)
      && !/update public\.competitor_feature_values|delete from public\.competitor_feature_values/i.test(sql))
    const a = L.answersFor({ id: 'z', featureValues: [{ id: 'v1', competitorId: 'z', featureKey: 'whatsapp', countryCode: null, value: 'yes', note: null }], featureChecks: { '|whatsapp': { checkedOn: '2026-08-01', rejudge: true } } }, ['whatsapp'], null)
    t('…a rejudge mark on an answer that is no longer "no" (Admin changed it) is not shown to the model', !('rejudge' in a.whatsapp))
  }

  // ── 4 · the DE admin comparison ────────────────────────────────────────────────────────────────────────────────────
  head('4 · the DE admin comparison: "Auf der Website nicht erwähnt" (never Nein); a market is not marked down for what does not apply')
  {
    const cmp = await CDE.renderer(kit, 'cf2-cmp')
    const M = 'c0000000-0000-4000-8000-0000000000f1'
    const base = CDE.CMP_TABLES()
    const values = base.competitor_feature_values.map(v => (v.competitor_id === CDE.A && v.feature_key === 'whatsapp' ? { ...v, value: 'not_mentioned' } : v))
    const tables = {
      competitors: [...base.competitors, CDE.comp(M, 'Testmarkt M', { focus: 'street_food_markets' })],
      competitor_plans: [...base.competitor_plans, CDE.plan('pm', M, 'Markt', { monthly_minor: 2900 })],
      comparison_entries: [...base.comparison_entries, CDE.entry('em', M, 'pm', 4)],
      competitor_feature_values: [...values, ...CDE.answers(M, '2026-10-21T09:00:00Z', { whatsapp: 'no' })],
    }
    const r = await kit.quietAsync(() => cmp.page({ status: 'admin', admin: true, tables }))
    const html = r.html || ''
    const row = key => { const m = new RegExp(`<tr data-row="${key}">[\\s\\S]*?</tr>`).exec(html); return m ? m[0] : '' }
    const wa = row('whatsapp')
    const cellsOf = tr => [...tr.matchAll(/<td[^>]*data-value="([a-z_]+)"[^>]*>([\s\S]*?)<\/td>/g)].map(m => ({ value: m[1], text: text(m[2]).trim() }))
    const waCells = cellsOf(wa)
    t('DE admin view renders, with Testanbieter A and the market', !r.notFound && /Testanbieter A/.test(text(html)) && /Testmarkt M/.test(text(html)))
    t('Testanbieter A\'s WhatsApp cell: "Auf der Website nicht erwähnt" — value not_mentioned, its own neutral class, not "Nein"',
      waCells[1] && waCells[1].value === 'not_mentioned' && waCells[1].text.startsWith('Auf der Website nicht erwähnt') && /cmp-tri cmp-tri-not_mentioned/.test(wa) && !/^Nein/.test(waCells[1].text), waCells)
    t('…and the stylesheet gives it the neutral grey of "Nicht angegeben", never the red of Nein', /\.hg-landing \.cmp-tri-unknown, \.hg-landing \.cmp-tri-not_mentioned \{ color: var\(--ink-soft\); \}/.test(read('app/[country]/[section]/[slug]/comparison.css')))
    // ⚠️ RE-PINNED (compare-suits-1, 6 November 2026): the columns are in the four-cap's order now (lib/comparison-selection.ts), so a
    // competitor's cell is found by its column header, not by position.
    const tools = [...html.matchAll(/<th scope="col"[^>]*data-tool="([^"]+)"/g)].map(m => m[1])
    const cellOf = (cells, name) => cells[tools.indexOf(name)]
    const mk = cellOf(waCells, 'Testmarkt M')
    t('the market\'s WhatsApp cell (stored "no") says it does not apply — "gilt nicht für einen Markt", not Nein', mk && mk.value === 'unknown' && mk.text.startsWith('gilt nicht für einen Markt'), waCells)
    const price = cellsOf(row('monthly'))
    t('…its price rows still show its plan (the commercial features apply to a market)', price.length && /29/.test(cellOf(price, 'Testmarkt M')?.text ?? ''), price)
    const twin = JSON.parse((await cmp.twin('json', { status: 'admin', admin: true, query: 'view=admin', tables })).body)
    t('the .json twin carries the machine value not_mentioned for that cell', JSON.stringify(twin).includes('"not_mentioned"'))
    const notifyRow = row('notify')
    const nc = cellsOf(notifyRow)
    t('the new notify row is on the page (ordering group): HatchGrab "Teilweise" with the note from the code', nc[0] && nc[0].value === 'partial' && /^Teilweise, E-Mail, wenn der Schritt „Bestellung fertig“ an ist, und eine Statusseite zur Bestellung; keine SMS, kein WhatsApp, kein Push/.test(nc[0].text), nc[0])
  }

  // ── 5 · notify's answer comes from the code ────────────────────────────────────────────────────────────────────────
  head('5 · notify: HatchGrab\'s answer is what the code does — the order-ready email, the order page; no SMS, WhatsApp or push')
  {
    const action = read('app/api/dashboard/action/route.ts')
    t('the order-ready email: the Ready step sends the customer the "ready" email (KDS at once, the dashboard after its 4-second undo)',
      /async function deliverReadyEmail\(order: any, truck: any\) \{\s*if \(!order\.customer_email\) return/.test(action) && /if \(action === 'ready'\)[\s\S]{0,1400}deliverReadyEmail\(order, truck\)/.test(action)
      && /if \(action === 'send_ready_email'\)[\s\S]{0,500}deliverReadyEmail\(order, truck\)/.test(action))
    t('…only where the order-ready step is on: it is a service setting (order_ready), per event type', /'order_ready'/.test(read('lib/event-types/types.ts')) && /order_ready: boolean \| null/.test(read('lib/event-types/types.ts')))
    const status = read('app/order/[id]/manage/page.tsx')
    t('the order page shows the order\'s status (ready in green) — read when it is opened, not pushed', /order\.status === 'ready' \? 'text-green-500'/.test(status) && /fetch\(`\/api\/orders\/\$\{id\}`\)/.test(status) && !/setInterval|EventSource/.test(status))
    const tw = read('lib/twilio.ts')
    const twUsers = require('child_process').execFileSync('git', ['grep', '-l', "from '@/lib/twilio'", '--', 'app', 'lib', 'components'], { cwd: REPO }).toString().trim().split('\n')
    t('no SMS: nothing sends one (lib/twilio has WhatsApp and a log only)', !/messages\.create\([^)]*sms|sendSms|sendSMS/i.test(tw) && !/sendSms|sendSMS|send_sms/.test(action))
    t('no WhatsApp to the customer: sendWhatsApp is used only by the inbound webhook (the truck\'s auto-replies)', JSON.stringify(twUsers) === '["app/api/webhooks/whatsapp/route.ts"]', twUsers)
    // git grep exits 1 when nothing matches — that is the answer wanted here.
    const pushHits = require('child_process').spawnSync('git', ['grep', '-l', '-E', 'web-push|webpush|PushManager|pushManager\\.subscribe|showNotification', '--', 'app', 'lib', 'components'], { cwd: REPO }).stdout.toString().trim()
      .split('\n').filter(Boolean)
    t('no push: no web-push library, no push subscription, no notification anywhere in the app', pushHits.length === 0, pushHits)
    const en = JSON.parse(read('messages/ns/en-GB/comparison.json')), de = JSON.parse(read('messages/ns/de-DE/comparison.json'))
    t('the words, en-GB: "Customers told when their order is ready", the brief\'s explanation, and the code\'s answer', en.features.notify.label === 'Customers told when their order is ready'
      && en.features.notify.explain === 'How customers hear their order is ready: SMS, WhatsApp, email, push or a live order-status page.'
      && en.features.notify.ours === 'email when the order-ready step is on, and an order-status page; no SMS, WhatsApp or push')
    t('…de-DE the same', de.features.notify.label === 'Gäste erfahren, wann ihre Bestellung fertig ist' && /SMS, WhatsApp, E-Mail, Push oder eine Live-Statusseite/.test(de.features.notify.explain) && /^E-Mail, wenn der Schritt „Bestellung fertig“ an ist/.test(de.features.notify.ours))
    t('"Not mentioned on their website" / "Auf der Website nicht erwähnt" in both languages; "No" is still "No"', en.cell.not_mentioned === 'Not mentioned on their website' && de.cell.not_mentioned === 'Auf der Website nicht erwähnt' && en.cell.no === 'No' && de.cell.no === 'Nein')
    const tab = read('components/admin/PricingCheckTab.tsx')
    t('Admin\'s Pricing check shows it in the same words, in neutral grey', /not_mentioned: 'Not mentioned on their website'/.test(tab) && /not_mentioned: 'bg-slate-/.test(tab))
  }

  // ── 6 · the migration and the store ────────────────────────────────────────────────────────────────────────────────
  head('6 · the migration (20261062) and the store\'s tolerant reads')
  {
    const sql = read('supabase/migrations/20261062_competitor_features_2.sql')
    t('one transaction: tier (null or one of four), tier_intervals (defaults 30/90/180), not_mentioned allowed, competitor_feature_checks',
      /^begin;$/m.test(sql) && /^commit;$/m.test(sql) && /check \(tier is null or tier in \('core', 'commercial', 'secondary', 'off'\)\)/.test(sql)
      && /tier_intervals jsonb not null default '\{"commercial": 30, "core": 90, "secondary": 180\}'::jsonb/.test(sql) && /check \(value in \('yes', 'no', 'partial', 'unknown', 'not_mentioned'\)\)/.test(sql)
      && /create table if not exists public\.competitor_feature_checks/.test(sql))
    t('competitor_feature_checks: RLS on, no access for anon or authenticated (the service role only)', /alter table public\.competitor_feature_checks enable row level security/.test(sql) && /revoke all on public\.competitor_feature_checks from anon, authenticated, public/.test(sql))
    t('no row of any existing table is updated or deleted', !/^\s*(update|delete)\b/im.test(sql))
    const st = read('lib/competitor-check/store-supabase.ts')
    t('the store: markFeaturesChecked upserts competitor_feature_checks only (35.an-3); a missing table is tolerated', /async markFeaturesChecked[\s\S]{0,1200}from\('competitor_feature_checks'\)[\s\S]{0,300}\.upsert\(/.test(st)   /* ⚠️ RE-PINNED (compare-suits-1): the rows now also carry pages_checked, built before the upsert */ && /record the features checked/.test(st))
    t('…reads the tier with a fallback when the column is missing, and the checks table paged, tolerating its absence', /missingColumn\(t\.error\) \? await db\.from\('comparison_features'\)\.select\(cols\)/.test(st) && /from\('competitor_feature_checks'\)\.select\([\s\S]{0,200}range\(from, from \+ 999\)/.test(st))
    const imp = read('lib/data-import/store-supabase.ts')
    t('the importer\'s store says to run 20261062 first when the tier column is missing (nothing written)', /20261062/.test(imp))
  }

  console.log(`\n${fail ? '🔴' : '✅'} competitor-features-2: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
