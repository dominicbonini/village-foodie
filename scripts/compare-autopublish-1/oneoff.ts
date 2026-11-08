// scripts/compare-autopublish-1/oneoff.ts — THE ONE-OFF AUTOMATIC PUBLISHING RUN (compare-autopublish-1, 7 November 2026, Dominic's Q3 = A).
// Runs the SAME code the checker runs after every run (lib/comparison-publish-run.ts → acceptFinding, evaluateCountry) against an
// IN-MEMORY copy of a read-only export, and writes the difference as ONE migration: every write guarded (a finding still pending, a row
// still current), every count checked — anything changed since the export and the whole file rolls back. It never connects to anything.
//
//   node scripts/competitor-check/run.mjs scripts/compare-autopublish-1/oneoff.ts <export dir> <out.sql> <out-report.json>
//
// The export dir holds base.json (countries, publish, competitors, plans, entries, checks, evidence, exported_at), values.json (current
// answers) and pending.json (the pending findings of every competitor on a comparison page).
// Admin's explicit decisions in the brief: addendum B — Best Food Trucks' seven contradicted "not mentioned" findings are rejected;
// addendum F — gastro25 and Grafterr are restaurant tools (their newest classification findings accepted, category restaurant).
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { runPublish } from '@/lib/comparison-publish-run'
import { memory } from './memory'
import { COUNTRY_PATH_SEGMENTS } from '@/lib/marketing-country'

type Row = Record<string, unknown>
const [dir, outSql, outJson] = process.argv.slice(2)
if (!dir || !outSql || !outJson) throw new Error('usage: oneoff.ts <export dir> <out.sql> <out-report.json>')
const base = JSON.parse(readFileSync(path.join(dir, 'base.json'), 'utf8'))
const valuesIn: Row[] = JSON.parse(readFileSync(path.join(dir, 'values.json'), 'utf8'))
const pendingIn: Row[] = JSON.parse(readFileSync(path.join(dir, 'pending.json'), 'utf8'))
const NOW = new Date(process.env.AP1_NOW ?? new Date().toISOString())

const { T, BEFORE, events, pricing, checks, store } = memory(base, valuesIn, pendingIn, NOW)

// ── Admin's explicit decisions in the brief ──
const BFT_SEVEN = ['b2d1af19-4424-4030-8a13-99b81ddf11d5', '788aecfd-d304-4482-be55-698a1d22cccd', '991536da-9145-4e4d-8ea4-ac08e0772bcc', '9dbe8b85-9df7-469e-9703-3c2f2f306337',
  '1f5a027c-06d3-41e8-91b7-43af0439136a', '7614f1d1-1f97-4ccf-b05f-e31649af03f3', 'b187ef90-1278-461b-b534-51f4fc405fe2']
const forceReject = new Map(BFT_SEVEN.map(id => [id, 'addendum B: says "not mentioned" while its own quote shows the feature (or carries no evidence) — rejected by Dominic’s decision of 7 November 2026']))
const F = { gastro25: 'cb0a5ab3-b54b-4f34-a9b7-a739b544decf', Grafterr: '606e69c9-b663-4c44-884c-091f3d271437' }
const forceAccept = new Map(Object.values(F).map(id => [id, 'addendum F: a restaurant tool — accepted by Dominic’s decision of 7 November 2026']))

async function main() {
  const report = await runPublish({ pricing, checks, store, now: () => NOW, log: l => console.log(l), forceAccept, forceReject,
    hasPage: (code, locale) => !!COUNTRY_PATH_SEGMENTS[code] && /^(de|en)(-|$)/i.test(locale) })
  // Addendum F's category: restaurant (acceptFinding sets it from the focus; this makes it explicit for both, whatever came before).
  for (const name of Object.keys(F)) {
    const c = [...T.competitors.values()].find(x => x.name === name)
    if (c && c.category !== 'restaurant') { c.category = 'restaurant'; c.category_by = c.category_by === 'admin' ? 'admin' : 'auto' }
  }
  writeFileSync(outSql, sqlOf())
  writeFileSync(outJson, JSON.stringify({ report: { ...report, decisions: undefined }, decisions: report.decisions, events }, null, 1))
  const n = (a: string) => report.decisions.filter(d => d.action === a).length
  console.log(`one-off: ${report.decisions.length} decisions (${n('accept')} accept, ${n('reject')} reject, ${n('hold')} hold), ${report.failedAccepts.length} could not be saved, ${events.length} events → ${outSql}`)
}

// ── the migration ──
const q = (s: string) => `'${s.replace(/'/g, "''")}'`
const js = (r: Row) => `${q(JSON.stringify(r))}::json`
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
function sqlOf(): string {
  const out: string[] = []
  let expect = 0
  const step = (sql: string, n: number, what: string) => { expect += n; out.push(`  ${sql}\n  get diagnostics k = row_count; if k <> ${n} then raise exception 'compare-autopublish-1 one-off: ${what.replace(/'/g, "''")} — expected ${n}, got %', k; end if;`) }
  // Findings: grouped by what is written (the review and the reason), each guarded by "still pending".
  const groups = new Map<string, { cols: Row; ids: string[] }>()
  for (const [id, r] of T.competitor_check_findings) {
    const b = BEFORE.competitor_check_findings.get(id)!
    const cols: Row = {}
    for (const k of ['review_status', 'reviewed_by', 'reviewed_at', 'auto_reviewed', 'auto_reason']) if (!same(r[k], b[k])) cols[k] = r[k]
    if (!Object.keys(cols).length) continue
    const key = JSON.stringify(cols)
    groups.set(key, { cols, ids: [...(groups.get(key)?.ids ?? []), id] })
  }
  for (const { cols, ids } of groups.values()) {
    const set = Object.keys(cols).map(k => `${k} = r.${k}`).join(', ')
    for (let i = 0; i < ids.length; i += 500) {
      const part = ids.slice(i, i + 500)
      step(`update public.competitor_check_findings x set ${set} from json_populate_record(null::public.competitor_check_findings, ${js(cols)}) r where x.id in (${part.map(q).join(', ')}) and x.review_status = 'pending';`, part.length, 'findings reviewed')
    }
  }
  // Rows inserted, updated and deleted, table by table (plans and answers: the old row superseded only while it is still current).
  const tables: (keyof typeof T)[] = ['competitors', 'competitor_plans', 'competitor_feature_values', 'comparison_entries']
  for (const t of tables) {
    for (const [id, r] of T[t]) {
      const b = BEFORE[t].get(id)
      // Only the row's own columns: any other column keeps its default.
      if (!b) { const cs = Object.keys(r).join(', '); step(`insert into public.${t} (${cs}) select ${cs} from json_populate_record(null::public.${t}, ${js(r)});`, 1, `${t} insert`); continue }
      const cols = Object.keys(r).filter(k => !same(r[k], b[k]))
      if (!cols.length) continue
      const guard = cols.includes('superseded_at') ? ' and x.superseded_at is null' : ''
      const sub: Row = Object.fromEntries(cols.map(k => [k, r[k]]))
      step(`update public.${t} x set ${cols.map(k => `${k} = r.${k}`).join(', ')} from json_populate_record(null::public.${t}, ${js(sub)}) r where x.id = ${q(id)}${guard};`, 1, `${t} ${id}`)
    }
    for (const id of BEFORE[t].keys()) if (!T[t].has(id)) step(`delete from public.${t} where id = ${q(id)};`, 1, `${t} delete`)
  }
  for (const [code, r] of T.comparison_publish) {
    const b = BEFORE.comparison_publish.get(code)
    const cols = Object.keys(r).filter(k => k !== 'country_code' && (!b || !same(r[k], b[k])))
    if (!cols.length) continue
    if (!b) { const cs = Object.keys(r).join(', '); step(`insert into public.comparison_publish (${cs}) select ${cs} from json_populate_record(null::public.comparison_publish, ${js(r)});`, 1, `publish ${code}`) }
    else step(`update public.comparison_publish x set ${cols.map(k => `${k} = r.${k}`).join(', ')} from json_populate_record(null::public.comparison_publish, ${js(Object.fromEntries(cols.map(k => [k, r[k]])))}) r where x.country_code = ${q(code)};`, 1, `publish ${code}`)
  }
  for (let i = 0; i < events.length; i += 200) {
    const part = events.slice(i, i + 200)
    step(`insert into public.comparison_publish_events (at, country_code, competitor_id, kind, detail) select (e->>'at')::timestamptz, e->>'country_code', (e->>'competitor_id')::uuid, e->>'kind', e->>'detail' from json_array_elements(${q(JSON.stringify(part))}::json) e;`, part.length, 'events')
  }
  return [
    `-- supabase/migrations/20261081_compare_autopublish_1_oneoff.sql — compare-autopublish-1 §4, THE ONE-OFF AUTOMATIC PUBLISHING RUN (Dominic's Q3 = A).`,
    `-- GENERATED by scripts/compare-autopublish-1/oneoff.ts from a read-only export taken ${String(base.exported_at)}, at ${NOW.toISOString()}.`,
    `-- The same code the checker runs after every run (lib/comparison-publish-run.ts): the pending findings of every competitor on an`,
    `-- auto-publish country's page decided and applied through Admin's own Accept path (addendum A, B — with Best Food Trucks' seven`,
    `-- contradicted findings rejected — and F — gastro25 and Grafterr restaurant tools), check pages saved (addendum D), every switched-on`,
    `-- country evaluated (auto_verified_at, comparison_publish.auto_live / shown, events). ${expect} guarded writes. No protected table.`,
    `-- 🔴 GUARDED: every finding must still be pending, every superseded row still current, every count exact — anything changed since the`,
    `-- export (a checker run, an Admin click) and the whole file rolls back with the reason. Re-export and regenerate in that case.`,
    '', 'begin;', '', 'do $ap1$', 'declare k integer;', 'begin', ...out, 'end $ap1$;', '', 'commit;', '',
  ].join('\n')
}

main().catch(e => { console.error(e instanceof Error ? e.stack : e); process.exit(1) })
