#!/usr/bin/env node
// scripts/compare-fix-2.cjs — compare-fix-2 (24 November 2026; docs/compare-fix-2-report.md). The comparison data import made
// all-or-nothing, its validation matched to the database, the data file's duplicates merged, the entry points' credentials.
// Against the real modules (bundled), a TRANSACTIONAL in-memory store with the database's unique indexes, and fixture rows —
// NO network, NO database:
//   1 · all-or-nothing: a failure part-way through a file (at any write) leaves the store EXACTLY as before, apart from the one
//       data_imports 'error' row; a re-run then succeeds; a third run does nothing; a dry run keeps nothing and records nothing
//   2 · the write order: new answers written "pending" first, then the old ones superseded, then the new ones made current; new plans
//       inserted before the corrected ones are superseded; the unique index is never broken at any step
//   3 · validation = the database: a competitor twice in a file (by id, by name, by website domain) is refused before anything is
//       written; every unique index and constraint in docs/compare-fix-2/db-rules.json has an entry in MIRRORED_DB_RULES; the
//       mirrored CHECKs (check interval, group label, ids, source address)
//   4 · the data file: one Owner.com (1a32fe8f) with its CA and US plans and entries, one MENU TIGER (d00d6bfd), Spevdo's prices,
//       every competitor once by id / name / domain, the importer's validation passes
//   5 · the Postgres stores and helpers: identifiers checked, rows typed by the table, upsert on the key, activate only pending rows,
//       a transaction rolls back on error and always on a dry run, the publish store refuses other tables / columns
//   6 · the entry points: the connection string only through scripts/db-migrate.cjs (no .env read of their own, no value printed);
//       the publish's refresh only after the commit; the Competitor check workflow untouched
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
require('./_harness-tmp.cjs') // tmp-cleanup-1
const fs = require('fs')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'compare-fix-2' })
const REPO = kit.REPO

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const clone = x => JSON.parse(JSON.stringify(x))

/** A store like the Postgres one: the database's unique indexes enforced after every write, and a transaction (a snapshot restored on
 *  rollback). `failAt` makes the named method throw on its nth call (a refused write part-way through a file). */
function txStore(seed, { failAt = null } = {}) {
  let db = clone(seed)
  const calls = [], counter = {}
  let seq = 0
  const unique = (rows, key, index) => {
    const seen = new Set()
    for (const r of rows) { const k = key(r); if (k === null) continue; if (seen.has(k)) throw new Error(`duplicate key value violates unique constraint "${index}"`); seen.add(k) }
  }
  const enforce = () => {
    unique(db.competitors, r => r.id, 'competitors_pkey'); unique(db.competitors, r => String(r.name).trim().toLowerCase(), 'competitors_name_ci_key')
    unique(db.plans, r => r.id, 'competitor_plans_pkey'); unique(db.entries, r => r.id, 'comparison_entries_pkey')
    unique(db.entries, r => `${r.country_code}|${r.competitor_id}`, 'comparison_entries_country_code_competitor_id_key')
    unique(db.values, r => r.id, 'competitor_feature_values_pkey')
    unique(db.values, r => (r.superseded_at ? null : `${r.competitor_id}|${r.feature_key}|${r.country_code ?? ''}`), 'competitor_feature_values_current')
    unique(db.checks, r => `${r.competitor_id}|${r.feature_key}|${r.country_code ?? ''}`, 'competitor_feature_checks_pkey')
    unique(db.imports.filter(r => r.result === 'ok'), r => `${r.file_path}|${r.sha256}`, 'data_imports_ok_once')
    for (const p of db.plans) if (!db.competitors.some(c => c.id === p.competitor_id)) throw new Error('violates foreign key constraint "competitor_plans_competitor_id_fkey"')
  }
  const w = (name, fn) => async (...a) => {
    counter[name] = (counter[name] ?? 0) + 1
    calls.push([name, ...(name === 'insertFeatureValues' ? [a[0].map(r => r.superseded_at ?? null)] : [])])
    if (failAt && failAt.method === name && counter[name] === (failAt.nth ?? 1)) throw new Error(`${name} refused by the database: simulated failure`)
    const out = await fn(...a); enforce(); return out
  }
  const store = {
    imports: async () => clone(db.imports),
    recordImport: w('recordImport', async r => { db.imports.push(clone(r)) }),
    competitors: async () => clone(db.competitors), plans: async () => clone(db.plans), entries: async () => clone(db.entries),
    insertCompetitor: w('insertCompetitor', async r => { db.competitors.push({ lifecycle: 'active', added_as_candidate: false, check_failures: 0, not_in_countries: [], ...clone(r) }) }),
    updateCompetitor: w('updateCompetitor', async (id, cols) => { Object.assign(db.competitors.find(c => c.id === id), clone(cols)) }),
    insertPlans: w('insertPlans', async rows => { db.plans.push(...rows.map(r => ({ superseded_at: null, ...clone(r) }))) }),
    supersedePlans: w('supersedePlans', async (ids, at) => { for (const p of db.plans) if (ids.includes(p.id) && !p.superseded_at) p.superseded_at = at }),
    insertEntries: w('insertEntries', async rows => { db.entries.push(...clone(rows)) }),
    featureValues: async () => clone(db.values.filter(v => !v.superseded_at)),
    insertFeatureValues: w('insertFeatureValues', async rows => { db.values.push(...rows.map(r => ({ id: `new-${++seq}`, superseded_at: null, ...clone(r) }))) }),
    supersedeFeatureValues: w('supersedeFeatureValues', async (ids, at) => { for (const v of db.values) if (ids.includes(v.id) && !v.superseded_at) v.superseded_at = at }),
    activateFeatureValues: w('activateFeatureValues', async ids => { for (const v of db.values) if (ids.includes(v.id) && v.superseded_at === L.PENDING_AT) v.superseded_at = null }),
    upsertFeatureChecks: w('upsertFeatureChecks', async rows => {
      for (const r of rows) { const i = db.checks.findIndex(x => x.competitor_id === r.competitor_id && x.feature_key === r.feature_key && (x.country_code ?? '') === (r.country_code ?? '')); if (i >= 0) db.checks[i] = { ...db.checks[i], ...clone(r) }; else db.checks.push(clone(r)) }
    }),
    features: async () => clone(db.features),
  }
  const transaction = async (fn, { rollback }) => {
    const snap = clone(db)
    try { const out = await fn(); if (rollback) db = snap; return out } catch (e) { db = snap; throw e }
  }
  return { store, transaction, calls, get db() { return db } }
}

let L
;(async () => {
  L = await kit.bundle('cf2-lib', [
    "export { runImports } from '@/lib/data-import/importer'",
    "export { importResearch, researchProblems, MIRRORED_DB_RULES, PENDING_AT } from '@/lib/data-import/research'",
    "export { pgImportStore } from '@/lib/data-import/store-pg'",
    "export { ident, insertRows, updateRows, inTransaction, selectJson, refused } from '@/lib/pg-rows'",
    "export { pgPublishStore, pgPricingReads, noCheckStore, ENTRY_COLUMNS, VALUE_COLUMNS } from '@/lib/comparison-publish-store-pg'",
  ].join('\n'))

  const FILE = JSON.parse(read('data/compare-research-1/competitors.json'))
  const FEATURES = JSON.parse(read('data/comparison-features/features.json')).features
  const KEYS = FEATURES.map(f => f.key)
  const SPEVDO = '54b82bfa-66d7-53de-bbd8-d08ac2a02504'
  const PATH = 'data/compare-research-1/competitors.json'
  // the fixture: the real Spevdo rows of the data file, against a store where Spevdo is already a competitor with an empty
  // placeholder answer for every feature and one stored plan the file corrects (Growth)
  const fx = clone({ ...FILE, competitors: FILE.competitors.filter(c => c.id === SPEVDO), plans: FILE.plans.filter(p => p.competitor_id === SPEVDO), entries: FILE.entries.filter(e => e.competitor_id === SPEVDO),
    evidence: [], not_relevant: [], unreadable: [], not_needed: [] })
  const seed = {
    imports: [], features: FEATURES.map(f => ({ key: f.key, checked: true, tier: f.tier ?? null })), checks: [], entries: [],
    competitors: [{ id: SPEVDO, name: 'Spevdo', website: 'https://spevdo.gr', lifecycle: 'active', added_as_candidate: false, notes: null, focus: 'nearest_local', payment_providers: null, features_checked_on: null, not_in_countries: [], check_failures: 0 }],
    plans: [{ id: 'stored-growth', competitor_id: SPEVDO, country_code: 'GR', plan_name: 'Growth', monthly_minor: 11900, currency: 'EUR', superseded_at: null }],
    values: KEYS.map((k, i) => ({ id: `old-${i}`, competitor_id: SPEVDO, feature_key: k, country_code: null, value: 'unknown', note: null, quote: null, source_url: null, superseded_at: null, verified_at: null, auto_blocked: false })),
  }
  const bytes = Buffer.from(JSON.stringify(fx))
  const deps = (s, o = {}) => ({ store: s.store, transaction: s.transaction, read: () => bytes, sha256: () => 'a'.repeat(64), now: () => new Date('2026-11-24T23:00:00Z'), log: () => {}, ...o })
  const FILES = [{ path: PATH, label: 'fixture', kind: 'research' }]
  const sansImports = db => { const { imports: _i, ...rest } = db; void _i; return rest }

  t('fixture: the Spevdo rows of the real data file pass the importer\'s validation', L.researchProblems(fx, { featureKeys: KEYS }).length === 0, L.researchProblems(fx, { featureKeys: KEYS }))

  // ══ 1 · all-or-nothing ══
  head('1 · a failure part-way through a file leaves the store exactly as before; a re-run succeeds; a dry run keeps nothing')
  for (const failAt of [{ method: 'insertFeatureValues' }, { method: 'supersedeFeatureValues' }, { method: 'activateFeatureValues' }, { method: 'insertPlans' }, { method: 'supersedePlans' }, { method: 'insertEntries' }, { method: 'upsertFeatureChecks' }, { method: 'updateCompetitor' }]) {
    const s = txStore(seed, { failAt })
    const before = clone(s.db)
    const o = await L.runImports(deps(s), FILES)
    const imp = s.db.imports
    t(`fails at ${failAt.method}: the file is reported as an error`, o[0].status === 'error' && /simulated failure/.test(o[0].message), o)
    t(`fails at ${failAt.method}: competitors, plans, entries, answers and checks EXACTLY as before`, JSON.stringify(sansImports(s.db)) === JSON.stringify(sansImports(before)))
    t(`fails at ${failAt.method}: only one data_imports 'error' row is written (outside the rolled-back transaction)`, imp.length === 1 && imp[0].result === 'error' && /simulated failure/.test(imp[0].message), imp)
  }
  {
    // the same store after a failure: the re-run (the failure gone) imports the file; a third run does nothing
    const s = txStore(seed, { failAt: { method: 'activateFeatureValues', nth: 1 } })
    await L.runImports(deps(s), FILES)
    const o2 = await L.runImports(deps(s), FILES)
    const cur = s.db.values.filter(v => !v.superseded_at && v.competitor_id === SPEVDO)
    t('re-run after the failure: imported', o2[0].status === 'imported', o2)
    t('re-run: one current answer for every feature, none left pending, the 14 file answers in (quotes kept)',
      cur.length === KEYS.length && !s.db.values.some(v => v.superseded_at === L.PENDING_AT) && fx.competitors[0].answers.every(a => cur.some(v => v.feature_key === a.key && v.value === a.value && (v.quote ?? null) === (a.quote ?? null))),
      { cur: cur.length, keys: KEYS.length })
    t('re-run: the old placeholders are superseded (kept as history)', s.db.values.filter(v => v.id.startsWith('old-') && v.superseded_at).length === fx.competitors[0].answers.length)
    const curPlans = s.db.plans.filter(p => !p.superseded_at)
    t('re-run: Spevdo\'s plans are €60 / €120 / €230 and the stored Growth (€119) is superseded',
      ['Starter:6000', 'Growth:12000', 'Pro:23000'].every(x => curPlans.some(p => `${p.plan_name}:${p.monthly_minor}` === x)) && s.db.plans.find(p => p.id === 'stored-growth').superseded_at !== null && curPlans.length === 3, curPlans)
    t('re-run: the entry and the check records are in', s.db.entries.length === 1 && s.db.checks.length > 0)
    t('re-run: data_imports has the error row then the ok row', s.db.imports.map(r => r.result).join(',') === 'error,ok', s.db.imports)
    const snap = clone(s.db)
    const o3 = await L.runImports(deps(s), FILES)
    t('third run: "unchanged" and nothing written', o3[0].status === 'unchanged' && JSON.stringify(s.db) === JSON.stringify(snap), o3)
  }
  {
    const s = txStore(seed)
    const before = clone(s.db)
    const lines = []
    const o = await L.runImports(deps(s, { dryRun: true, log: l => lines.push(l) }), FILES)
    t('dry run: reported as dry_run with what would be written', o[0].status === 'dry_run' && o[0].counts && Object.keys(o[0].counts).length > 0 && lines.some(l => /DRY RUN/.test(l)), o)
    t('dry run: the store EXACTLY as before — no data_imports row either', JSON.stringify(s.db) === JSON.stringify(before))
    const sf = txStore(seed, { failAt: { method: 'insertEntries' } })
    const of = await L.runImports(deps(sf, { dryRun: true }), FILES)
    t('dry run that fails: an error, and nothing recorded (not even the error row)', of[0].status === 'error' && sf.db.imports.length === 0 && JSON.stringify(sf.db) === JSON.stringify(seed), of)
    let threw = ''
    try { await L.runImports({ ...deps(s, { dryRun: true }), transaction: undefined }, FILES) } catch (e) { threw = e.message }
    t('dry run without a transaction is refused before anything runs', /needs a store that holds a transaction/.test(threw), threw)
  }

  // ══ 2 · the write order ══
  head('2 · new answers pending → old superseded → new current; new plans before the corrected ones are superseded')
  {
    const s = txStore(seed)
    await L.runImports(deps(s), FILES)
    const names = s.calls.map(c => c[0])
    const ins = s.calls.find(c => c[0] === 'insertFeatureValues')
    const iIns = names.indexOf('insertFeatureValues'), iSup = names.indexOf('supersedeFeatureValues'), iAct = names.indexOf('activateFeatureValues')
    t('answers: insert, then supersede, then activate', iIns >= 0 && iIns < iSup && iSup < iAct, names)
    t('answers: every new row is inserted "pending" (superseded_at = PENDING_AT, outside the one-current-answer index)', ins && ins[1].length > 0 && ins[1].every(x => x === L.PENDING_AT), ins)
    t('plans: insert before supersede', names.indexOf('insertPlans') >= 0 && names.indexOf('insertPlans') < names.indexOf('supersedePlans'), names)
    // an import that still has an answer current where the file adds one for the same key never breaks the unique index (the
    // compare-research-1 failure): the txStore enforces it after every write, so reaching 'imported' proves it
    t('the unique index holds after every write (enforced by the store at each step)', s.db.imports.at(-1).result === 'ok')
  }

  // ══ 3 · validation = the database ══
  head('3 · each competitor once per file (id, name, domain); every database rule mirrored')
  {
    const one = fx.competitors[0]
    const twice = (o, label) => {
      const f = clone(fx); f.competitors.push({ ...clone(one), id: 'c0ffee00-0000-5000-8000-000000000001', name: 'Other', website: 'https://other.example', ...o })
      const p = L.researchProblems(f, { featureKeys: KEYS })
      t(`a competitor twice — ${label} — refused ("merge them")`, p.some(x => /appears twice/.test(x) && /merge/.test(x)), p)
    }
    twice({ id: SPEVDO }, 'same id')
    twice({ name: '  SPEVDO ' }, 'same name (case and spaces ignored, as competitors_name_ci_key)')
    twice({ website: 'https://www.spevdo.gr/el/' }, 'same website domain')
    // the duplicate is refused before anything is written, through the importer
    const f = clone(fx); f.competitors.push({ ...clone(one), id: 'c0ffee00-0000-5000-8000-000000000002' })
    const s = txStore(seed)
    const o = await L.runImports({ ...deps(s), read: () => Buffer.from(JSON.stringify(f)) }, FILES)
    t('through the importer: an error and nothing but the error row written', o[0].status === 'error' && JSON.stringify(sansImports(s.db)) === JSON.stringify(sansImports(seed)), o)

    const mut = (fn, re, label) => { const g = clone(fx); fn(g); const p = L.researchProblems(g, { featureKeys: KEYS }); t(label, p.some(x => re.test(x)), p) }
    mut(g => { g.competitors[0].check_interval_days = 3 }, /check_interval_days/, 'check interval outside 7–365 refused (competitors_check_interval_chk)')
    mut(g => { g.entries[0].group_label = 'x'.repeat(61) }, /group_label/, 'group label over 60 characters refused (comparison_entries_group_label_chk)')
    mut(g => { g.plans.push(clone(g.plans[0])) }, /plan id .*(twice|more than once)|twice.*plan/i, 'a plan id twice refused (competitor_plans_pkey)')
    mut(g => { g.entries.push({ ...clone(g.entries[0]), id: 'e0ffee00-0000-5000-8000-000000000003' }) }, /twice|more than once/i, 'an entry for the same country and competitor twice refused (comparison_entries_country_code_competitor_id_key)')
    mut(g => { g.competitors[0].answers[0].source_url = 'ftp://spevdo.gr' }, /source_url/, 'an answer\'s source address must be http(s) (competitor_feature_values_source_url_check)')

    const rules = JSON.parse(read('docs/compare-fix-2/db-rules.json'))
    const names = [...new Set([...rules.unique_indexes, ...rules.constraints])]
    const missing = names.filter(n => !L.MIRRORED_DB_RULES[n])
    t(`every database rule of the importer's tables (${names.length}, from pg_indexes / pg_constraint) has an entry in MIRRORED_DB_RULES`, missing.length === 0, missing)
    const extra = Object.keys(L.MIRRORED_DB_RULES).filter(n => !names.includes(n))
    t('MIRRORED_DB_RULES names no rule the database does not have', extra.length === 0, extra)
  }

  // ══ 4 · the data file ══
  head('4 · the data file: one Owner.com, one MENU TIGER, Spevdo\'s prices, every competitor once')
  {
    const p = L.researchProblems(FILE, { featureKeys: KEYS })
    t('the importer\'s validation passes on data/compare-research-1/competitors.json (uniqueness rules included)', p.length === 0, p)
    const owner = FILE.competitors.filter(c => /owner/i.test(c.name) || /owner\.com/.test(c.website ?? ''))
    t('Owner.com is ONE competitor, the stored 1a32fe8f', owner.length === 1 && owner[0].id.startsWith('1a32fe8f'), owner.map(c => `${c.name} ${c.id}`))
    const oid = owner[0]?.id
    t('… with its CA and US plans and entries', ['CA', 'US'].every(cc => FILE.plans.some(x => x.competitor_id === oid && x.country_code === cc) && FILE.entries.some(x => x.competitor_id === oid && x.country_code === cc)))
    const mt = FILE.competitors.filter(c => /menu ?tiger/i.test(c.name) || /menutiger/.test(c.website ?? ''))
    t('MENU TIGER is ONE competitor, the stored d00d6bfd (its not-sold-in HK, RO, TH kept)', mt.length === 1 && mt[0].id.startsWith('d00d6bfd') && ['HK', 'RO', 'TH'].every(cc => (mt[0].not_sold_in ?? []).some(x => x.country === cc)), mt.map(c => `${c.name} ${c.id}`))
    t('the two new-id rows are gone (ca13ac16 Owner, e8beb753 MENU TIGER) and nothing points at them',
      !FILE.competitors.some(c => /^(ca13ac16|e8beb753)/.test(c.id)) && !FILE.plans.some(x => /^(ca13ac16|e8beb753)/.test(x.competitor_id)) && !FILE.entries.some(x => /^(ca13ac16|e8beb753)/.test(x.competitor_id)))
    const sp = FILE.plans.filter(x => x.competitor_id === SPEVDO).map(x => `${x.plan_name}:${x.monthly_minor}:${x.currency}:${x.vat}`).sort()
    t('Spevdo (compare-research-1c): Starter €60, Growth €120, Pro €230 a month excl. VAT', JSON.stringify(sp) === JSON.stringify(['Growth:12000:EUR:excl', 'Pro:23000:EUR:excl', 'Starter:6000:EUR:excl']), sp)
    const host = u => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase() } catch { return null } }
    const dup = (k) => { const m = new Map(); for (const c of FILE.competitors) { const v = k(c); if (v) m.set(v, (m.get(v) ?? 0) + 1) } return [...m].filter(([, n]) => n > 1).map(([v]) => v) }
    t('every competitor once by id, by name and by website domain', !dup(c => c.id).length && !dup(c => c.name.trim().toLowerCase()).length && !dup(c => host(c.website)).length,
      { id: dup(c => c.id), name: dup(c => c.name.trim().toLowerCase()), domain: dup(c => host(c.website)) })
    const b = read('docs/compare-research-1/build.cjs')
    t('build.cjs merges a row without a stored id into the stored competitor with its website (or name), wherever it comes', /storedByHost/.test(b) && /storedByName/.test(b) && /PREPASS/.test(b))
  }

  // ══ 5 · the Postgres stores ══
  head('5 · the Postgres helpers and stores')
  {
    const sent = []
    const fake = (answer = () => ({ rows: [{ rows: [] }], rowCount: 1 })) => ({ query: async (sql, params) => { sent.push([sql.replace(/\s+/g, ' ').trim(), params]); return answer(sql, params) } })
    let bad = ''
    try { L.ident('competitors; drop table x') } catch (e) { bad = e.message }
    t('an identifier that is not plain is refused', /not a plain identifier/.test(bad))
    sent.length = 0
    await L.insertRows(fake(), 'competitor_plans', [{ id: 'a', plan_name: 'x' }, { id: 'b', plan_name: 'y' }, { id: 'c', plan_name: 'z', vat: 'incl' }])
    t('insertRows: one statement per set of columns (a column a row does not name keeps its default), typed by the table', sent.length === 2 && sent.every(([s]) => /json_populate_recordset\(null::public\."competitor_plans", \$1::json\)/.test(s)), sent)
    sent.length = 0
    await L.insertRows(fake(), 'competitor_feature_checks', [{ competitor_id: 'a', feature_key: 'k', country_code: '', checked_on: 'd', pages_checked: {} }], { onConflict: { target: ['competitor_id', 'feature_key', 'country_code'], update: 'all' } })
    t('upsert: on conflict on the key, every other column it carries updated', /on conflict \("competitor_id", "feature_key", "country_code"\) do update set "checked_on" = excluded."checked_on", "pages_checked" = excluded."pages_checked"/.test(sent[0][0]), sent[0][0])
    let msg = ''
    try { await L.insertRows({ query: async () => { const e = new Error('duplicate key value violates unique constraint "x"'); e.detail = 'Key (id)=(1) already exists.'; throw e } }, 'competitors', [{ id: '1' }]) } catch (e) { msg = e.message }
    t('a refused write carries the database\'s own words and detail', /refused by the database: duplicate key .* \(Key \(id\)=\(1\) already exists\.\)/.test(msg), msg)
    sent.length = 0
    const c1 = fake()
    await L.inTransaction(c1, async () => 1)
    await L.inTransaction(c1, async () => 1, { rollback: true })
    try { await L.inTransaction(c1, async () => { throw new Error('x') }) } catch { /* expected */ }
    t('inTransaction: begin/commit; begin/rollback on a dry run; begin/rollback on an error', sent.map(x => x[0]).join(',') === 'begin,commit,begin,rollback,begin,rollback', sent.map(x => x[0]))
    sent.length = 0
    const st = L.pgImportStore(fake())
    await st.activateFeatureValues(['a'])
    t('the import store makes current ONLY rows it wrote pending', /set superseded_at = null where id = any\(\$1::uuid\[\]\) and superseded_at = \$2/.test(sent[0][0]) && sent[0][1][1] === L.PENDING_AT, sent[0])
    sent.length = 0
    await st.supersedeFeatureValues(['a'], 'now')
    t('… and supersedes only current rows', /and superseded_at is null/.test(sent[0][0]))
    const ps = L.pgPublishStore(fake())
    let r1 = '', r2 = ''
    try { await ps.setAutoVerified('trucks', ['a'], null) } catch (e) { r1 = e.message }
    try { await ps.setCompetitor('a', { name: 'x' }) } catch (e) { r2 = e.message }
    t('the publish store refuses any other table and any competitor column but check_urls / check_urls_by / check_failures', /refused table/.test(r1) && /refused competitor columns: name/.test(r2), [r1, r2])
    let r3 = '', r4 = ''
    try { await L.pgPricingReads(fake()).updatePlan('a', {}) } catch (e) { r3 = e.message }
    try { await L.noCheckStore().reviewFinding('a', {}) } catch (e) { r4 = e.message }
    t('the publish step on its own can only READ prices and answers (any write method refuses → the transaction rolls back)', /not available/.test(r3) && /not available/.test(r4), [r3, r4])
    const pcs = read('lib/admin/pricing-check-store.ts')
    const vc = /const VALUE_COLUMNS = '([^']+)'/.exec(pcs)?.[1]
    const eb = /const ENTRY_COLUMNS_BASE = '([^']+)'/.exec(pcs)?.[1], ea = /const ENTRY_COLUMNS_AUTO = '([^']+)'/.exec(pcs)?.[1]
    t('the publish reads select exactly the columns Admin\'s pricing store selects', vc === L.VALUE_COLUMNS && `${eb}, group_label, pinned, hidden, ${ea}` === L.ENTRY_COLUMNS, { vc, eb, ea })
  }

  // ══ 6 · the entry points ══
  head('6 · the entry points: credentials only through scripts/db-migrate.cjs; the refresh after the commit')
  {
    const db = read('scripts/comparison-db.ts'), imp = read('scripts/data-import/main.ts'), pub = read('scripts/comparison-publish/main.ts')
    const code = s => s.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
    t('comparison-db.ts takes the connection string from db-migrate.cjs\'s own dbUrl() (or the SUPABASE_DB_URL secret in Actions)', /createRequire\(path\.join\(process\.cwd\(\), 'package\.json'\)\)\('\.\/scripts\/db-migrate\.cjs'\)/.test(db) && /process\.env\.SUPABASE_DB_URL \|\| m\.dbUrl\(\)/.test(db))
    t('… and reads no file of its own (no readFileSync, no ".env" path) and prints no value (every message scrubbed)', !/readFileSync|dotenv/.test(code(db)) && !/\.env\.local|['"`]\.env['"`]/.test(code(db)) && /m\.scrub\(/.test(db))
    for (const [f, s] of [['scripts/data-import/main.ts', imp], ['scripts/comparison-publish/main.ts', pub]]) {
      t(`${f}: connects through comparison-db.ts only — no Supabase REST client, no service-role key, no .env read`,
        /connectComparisonDb\(/.test(s) && !/createClient|SUPABASE_SERVICE_ROLE_KEY|dotenv/.test(code(s)) && !/\.env\.local/.test(code(s)))
      t(`${f}: a failure message is scrubbed of any connection string`, /postgres\(ql\)\?:\\\/\\\/\\S\+/.test(s))
    }
    t('the import: each file in a transaction, --dry-run rolls back and checks the tables after equal the tables before', /dryRun,/.test(imp) && /inTransaction\(db\.client/.test(imp) && /the dry run changed the tables/.test(imp))
    t('the publish: ONE transaction, the countries only (skipFindings), AE refused, the refresh only after a real run has committed',
      /inTransaction\(db\.client/.test(pub) && /skipFindings: true/.test(pub) && /AE came out live/.test(pub) && pub.indexOf('if (!dryRun && refresh.length) await revalidate(') > pub.indexOf('}, { rollback: dryRun })') /* ⚠️ RE-PINNED (compare-cache-1): only the changed countries */ && !/runPublish\(\{[^}]*revalidate/.test(pub))
    const wf = read('.github/workflows/competitor-check.yml')
    t('the Competitor check workflow file is unchanged by this work (it stays disabled on GitHub)', /scripts\/data-import\/main\.ts/.test(wf))
    const hj = JSON.parse(read('scripts/harnesses.json'))
    t('scripts/compare-db-proofs.cjs (live, rolled-back proofs) is never run by a sweep', (hj.excluded?.operational_refused?.files ?? []).includes('compare-db-proofs.cjs'))
  }

  console.log(`\n${fail ? '🔴' : '✓'} compare-fix-2: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error('compare-fix-2 harness crashed:', e); process.exit(1) })
