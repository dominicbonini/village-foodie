#!/usr/bin/env node
// scripts/compare-calc-fix-1.cjs — compare-calc-fix-1 (26 Nov 2026; docs/compare-calc-fix-1-report.md): lib/admin/pricing-check-store.ts
// pages every read that can pass Supabase's "Max rows" cap (1,000 by default). Before it, listAll read competitor_plans unpaged, so at
// 1,057 plans the newest 57 never reached the comparison pages (Square, What The Truck, Hatches Up…) — compare-calc-check-1 §4.
//   1 · behaviour: the REAL store against an in-memory database that, like PostgREST, never returns more than 1,000 rows in one
//       response — every multi-row read returns every row, once, in a stable order;
//   2 · the same database against the store as it was (BASE): listAll stops at 1,000 plans — so this harness catches the bug;
//   3 · static: every multi-row read in the store goes through pageAll (or a chunked .in), none is left unpaged;
//   4 · scope: no other file under lib/, app/ or components/ changed since BASE.
// Nothing reaches a database or the network (scripts/_render-kit.cjs stubs @/lib/supabase).
require('./_harness-tmp.cjs') // tmp-cleanup-1
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const kit = require('./_render-kit.cjs')({ cacheTag: 'compare-calc-fix-1' })
const REPO = kit.REPO
const BASE = 'bbc8c4b3' // the commit before compare-calc-fix-1
const STORE = 'lib/admin/pricing-check-store.ts'

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

// ── a PostgREST-like database: filters, several .order() keys, .range(), and a hard cap of MAX_ROWS rows per response ──
const MAX_ROWS = 1000
function cappedDb(tables, log) {
  const cmp = (a, b) => (a == null && b == null ? 0 : a == null ? 1 : b == null ? -1 : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0)
  return {
    from(table) {
      const filters = [], orders = []; let range = null, limitN = null, single = null
      const c = {
        select() { return c },
        eq(k, v) { filters.push(r => String(r[k]) === String(v)); return c },
        is(k, v) { filters.push(r => (r[k] ?? null) === v); return c },
        in(k, vs) { filters.push(r => vs.map(String).includes(String(r[k]))); return c },
        or() { return c },
        ilike() { return c },
        order(k) { orders.push(k); return c },
        range(a, b) { range = [a, b]; return c },
        limit(n) { limitN = n; return c },
        maybeSingle() { single = 'maybe'; return c },
        single() { single = 'one'; return c },
        then(res, rej) {
          let rows = (tables[table] || []).filter(r => filters.every(f => f(r)))
          if (orders.length) rows = rows.slice().sort((a, b) => { for (const k of orders) { const d = cmp(a[k], b[k]); if (d) return d } return 0 })
          if (range) rows = rows.slice(range[0], range[1] + 1)
          if (limitN != null) rows = rows.slice(0, limitN)
          rows = rows.slice(0, MAX_ROWS)   // ← Supabase's Max rows
          log.push({ table, orders: orders.slice(), range, n: rows.length })
          return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(res, rej)
        },
      }
      return c
    },
  }
}
const N = { competitors: 1234, competitor_plans: 2345, country_benchmarks: 1100, comparison_entries: 1500, competitor_check_findings: 1200, comparison_features: 1050, competitor_feature_values: 3100 }
const pad = i => String(i).padStart(5, '0')
const tables = {
  competitors: Array.from({ length: N.competitors }, (_, i) => ({ id: `c${pad(i)}`, name: `Comp ${pad(N.competitors - i)}`, lifecycle: 'active', next_check_at: null })),
  // created_at with ties (as 56 real plans share one): the id breaks them, so a page boundary never repeats or skips a row.
  competitor_plans: Array.from({ length: N.competitor_plans }, (_, i) => ({ id: `p${pad(i)}`, created_at: `2026-11-${String(10 + Math.floor(i / 300)).padStart(2, '0')}` })),
  country_benchmarks: Array.from({ length: N.country_benchmarks }, (_, i) => ({ id: `b${pad(i)}`, created_at: `2026-10-${String(1 + (i % 20)).padStart(2, '0')}` })),
  comparison_entries: Array.from({ length: N.comparison_entries }, (_, i) => ({ id: `e${pad(i)}`, sort_order: i % 7 })),
  competitor_check_findings: Array.from({ length: N.competitor_check_findings }, (_, i) => ({ id: `f${pad(i)}`, field: 'feature', review_status: 'pending', competitor_id: 'c1', country_code: null, found: { feature_key: 'ahead' } })),
  comparison_features: Array.from({ length: N.comparison_features }, (_, i) => ({ key: `k${pad(i)}` })),
  competitor_feature_values: Array.from({ length: N.competitor_feature_values }, (_, i) => ({ id: `v${pad(i)}`, competitor_id: `c${pad(i % N.competitors)}`, feature_key: 'ahead', country_code: null, superseded_at: null })),
}
const unique = rows => new Set(rows.map(r => r.id ?? r.key)).size === rows.length

;(async () => {
  head('1 · the store as it is now, against a database that caps every response at 1,000 rows')
  const S = await kit.bundle('ccf1-store', `export { servicePricingStore } from '@/${STORE.replace(/\.ts$/, '')}'`)
  const log = []
  globalThis.__harnessDb = cappedDb(tables, log)
  const all = await S.servicePricingStore.listAll()
  t(`listAll: every plan (${N.competitor_plans}), once each`, all.plans.length === N.competitor_plans && unique(all.plans), all.plans.length)
  t(`listAll: every competitor (${N.competitors}) and every benchmark (${N.country_benchmarks}), once each`,
    all.competitors.length === N.competitors && unique(all.competitors) && all.benchmarks.length === N.country_benchmarks && unique(all.benchmarks), [all.competitors.length, all.benchmarks.length])
  const planLog = log.filter(l => l.table === 'competitor_plans')
  t('listAll: plans are read in pages of 1,000 ordered by created_at, then id (3 pages for 2,345 rows)',
    planLog.length === 3 && planLog.every(l => l.orders.join(',') === 'created_at,id' && l.range && l.range[1] - l.range[0] === 999), planLog)
  t('listAll: plans come back in created_at, id order (ties broken by the id across page boundaries)',
    all.plans.every((p, i, a) => !i || `${a[i - 1].created_at}|${a[i - 1].id}` < `${p.created_at}|${p.id}`))
  t('listAll: competitors keep their name order (then id)', all.competitors.every((c, i, a) => !i || a[i - 1].name <= c.name) && log.filter(l => l.table === 'competitors').every(l => l.orders.join(',') === 'name,id'))
  const entries = await S.servicePricingStore.listEntries()
  t(`listEntries: every entry (${N.comparison_entries}), once each, by sort_order then id`, entries.length === N.comparison_entries && unique(entries)
    && log.filter(l => l.table === 'comparison_entries').every(l => l.orders.join(',') === 'sort_order,id'), entries.length)
  const pend = await S.servicePricingStore.pendingFeatureFindings('GB')
  t(`pendingFeatureFindings: every pending finding (${N.competitor_check_findings}) — the old .limit(5000) was still capped at 1,000`, pend.length === N.competitor_check_findings, pend.length)
  const feats = await S.servicePricingStore.features()
  t(`features: every feature row (${N.comparison_features})`, (feats ?? []).length === N.comparison_features, (feats ?? []).length)
  const vals = await S.servicePricingStore.featureValues()
  t(`featureValues (already paged): every current answer (${N.competitor_feature_values})`, vals.length === N.competitor_feature_values, vals.length)
  const ids = tables.competitor_plans.slice(0, 1700).map(p => p.id)
  const got = await S.servicePricingStore.existingIds('plans', ids)
  t('existingIds: 1,700 ids asked → 1,700 found (asked in chunks of 500, so no response reaches the cap)', got.length === 1700 && new Set(got).size === 1700, got.length)
  // markFeatureDue reads every active competitor and the key's answers, then writes; the writes go to a recorder.
  const writes = []
  const base = cappedDb(tables, log)
  globalThis.__harnessDb = { from(t2) { const q = base.from(t2); const w = p => { writes.push({ table: t2, n: Array.isArray(p) ? p.length : 1 }); return { in: () => Promise.resolve({ error: null }), then: (r) => Promise.resolve({ error: null }).then(r) } }; q.insert = w; q.update = w; return q } }
  const marked = await S.servicePricingStore.markFeatureDue('newkey', '2026-11-26')
  t(`markFeatureDue: every active competitor (${N.competitors}) gets its row for a new feature — none lost past 1,000`, marked === N.competitors, marked)
  globalThis.__harnessDb = cappedDb(tables, log)

  head('2 · the store as it was (BASE), against the same database — the bug this fixes')
  const oldSrc = execSync(`git show ${BASE}:${STORE}`, { cwd: REPO, encoding: 'utf8' })
  const oldDir = path.join(REPO, 'node_modules/.cache/compare-calc-fix-1-base'); fs.mkdirSync(oldDir, { recursive: true })
  const oldFile = path.join(oldDir, 'pricing-check-store-base.ts'); fs.writeFileSync(oldFile, oldSrc)
  const O = await kit.bundle('ccf1-store-base', `export { servicePricingStore } from '${oldFile.replace(/\.ts$/, '')}'`)
  const oldAll = await O.servicePricingStore.listAll()
  t(`BASE listAll returns only 1,000 of ${N.competitor_plans} plans (the newest dropped) — so section 1 would fail on the old code`, oldAll.plans.length === 1000, oldAll.plans.length)
  t('BASE listAll also stops at 1,000 competitors and 1,000 benchmarks', oldAll.competitors.length === 1000 && oldAll.benchmarks.length === 1000, [oldAll.competitors.length, oldAll.benchmarks.length])
  delete globalThis.__harnessDb

  head('3 · static: no multi-row read in the store is left unpaged')
  const src = read(STORE)
  const scan = text => {
    const lines = text.split('\n')
    return lines.map((l, i) => {
      let j = i + 1; const parts = [l]
      while (j < lines.length && /^\s+\./.test(lines[j])) parts.push(lines[j++])
      if (/^\s+\./.test(l) && i > 0) parts.unshift(lines[i - 1])
      return { l: parts.join(' '), n: i + 1, raw: l }
    }).filter(x => !/^\s*\/\//.test(x.raw) && /\.select\(/.test(x.raw)).filter(x => !/\.(insert|update|delete)\(/.test(x.l) && !/head: true/.test(x.l))
      .filter(x => !(/pageAll\(/.test(x.l) || /\.range\(/.test(x.l) || /\.maybeSingle\(\)|\.single\(\)/.test(x.l) || /\.limit\((1|200)\)/.test(x.l) || /\.in\('id', ids\.slice\(/.test(x.l)))
  }
  const oldLoose = scan(oldSrc)
  t(`the same scan on BASE finds its unpaged reads (${oldLoose.length}: listAll's three, listEntries, features, pendingFeatureFindings, markFeatureDue's two, existingIds)`,
    oldLoose.length >= 8 && oldLoose.some(x => /TABLE\.plans\)\.select\(COLUMNS\.plans\)\.order\('created_at'\),/.test(x.l)), oldLoose.map(x => `${x.n}: ${x.raw.trim()}`))
  // Each statement as one string: a line with .select( plus its continuation lines (indented, starting with ".") and the line before
  // when the statement starts there — so a write by id split over two lines, or a .range on the next line, is read whole.
  const lines = src.split('\n')
  const code = lines.map((l, i) => {
    let j = i + 1; const parts = [l]
    while (j < lines.length && /^\s+\./.test(lines[j])) parts.push(lines[j++])
    if (/^\s+\./.test(l) && i > 0) parts.unshift(lines[i - 1])
    return { l: parts.join(' '), n: i + 1, raw: l }
  }).filter(x => !/^\s*\/\//.test(x.raw) && /\.select\(/.test(x.raw))
  const reads = code.filter(x => !/\.(insert|update|delete)\(/.test(x.l) && !/head: true/.test(x.l))
  const bounded = x => /pageAll\(/.test(x.l) || /\.range\(/.test(x.l) || /\.maybeSingle\(\)|\.single\(\)/.test(x.l) || /\.limit\((1|200)\)/.test(x.l) || /\.in\('id', ids\.slice\(/.test(x.l)
  const loose = reads.filter(x => !bounded(x))
  t(`every one of the store's ${reads.length} read lines is paged (pageAll / .range), single-row, chunked, or limited to ≤ 200`, loose.length === 0, loose.map(x => `${x.n}: ${x.l.trim()}`))
  t('pageAll is the one helper: pages of 1,000 (PAGE), stopping at the first short page', /const PAGE = 1000/.test(src) && /if \(rows\.length < PAGE\) return \{ data: out, error: null \}/.test(src))
  t('listAll reads all three tables through pageAll; plans ordered by created_at then id',
    /pageAll\(\(a, z\) => s\.from\(TABLE\.plans\)\.select\(COLUMNS\.plans\)\.order\('created_at'\)\.order\('id'\)\.range\(a, z\)\)/.test(src)
    && /readCompetitors\(cols => pageAll\(/.test(src) && /pageAll\(\(a, z\) => s\.from\(TABLE\.benchmarks\)/.test(src))
  t('no ".limit(5000)" (a limit above the cap is still capped)', !/\.limit\(5000\)/.test(src))

  head('4 · scope: only the store changed in lib/, app/ and components/ since BASE')
  const changed = execSync(`git diff --name-only ${BASE} -- lib app components`, { cwd: REPO, encoding: 'utf8' }).split('\n').filter(Boolean)
  t(`changed since ${BASE}: ${STORE} only`, changed.length === 1 && changed[0] === STORE, changed)
  const d = execSync(`git diff ${BASE} -- ${STORE}`, { cwd: REPO, encoding: 'utf8' })
  t('the column lists (COLUMNS, VALUE_COLUMNS, ENTRY_COLUMNS_*) are unchanged — only how rows are fetched', !/^[-+].*(VALUE_COLUMNS =|ENTRY_COLUMNS_BASE =|ENTRY_COLUMNS_AUTO =|FEATURE_COLUMNS =)/m.test(d))

  console.log(`\n${fail ? '🔴' : '✓'} compare-calc-fix-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
