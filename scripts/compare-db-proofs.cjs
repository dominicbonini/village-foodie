#!/usr/bin/env node
// scripts/compare-db-proofs.cjs — 🔴 compare-fix-2 (24 November 2026; docs/compare-fix-2-report.md): PROOFS AGAINST THE LIVE DATABASE THAT
// NEVER COMMIT, for the comparison data (competitor tables only — never trucks, orders, menus, payments or customers). It is in
// harnesses.json's `operational_refused` group: no sweep ever runs it.
//
//   npx -y -p pg@8.13.1 node scripts/compare-db-proofs.cjs --preflight-repair supabase/migrations/20261128_compare_fix_2_repair.sql
//        ONE transaction, ending in ROLLBACK: the migration's statements (its begin / commit taken out), then the checks it must pass —
//        the current-answer count, no answer left without a current value by the failed import, the four live-page competitors'
//        answers — then the counts after the rollback, which must equal the counts before.
//   npx -y -p pg@8.13.1 node scripts/compare-db-proofs.cjs --preflight supabase/migrations/<competitor-data migration>.sql
//        compare-research-3: any competitor-data migration, rolled back (its guards must pass; counts and checksums equal after).
//   npx -y -p pg@8.13.1 node scripts/compare-db-proofs.cjs --repair-check
//        After the migration ran: the same checks, read-only (rolled back too).
//
// The SAME safeguards as scripts/db-rollback-proofs.cjs: there is no COMMIT in the SQL it sends (checked on every statement); every
// transaction ends in ROLLBACK in a finally; statement_timeout 5 s, lock_timeout 3 s; every statement printed with its parameters.
// The connection string comes from scripts/db-migrate.cjs's own reader (never printed; scrubbed from every message).
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS operational script, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const { dbUrl, scrub, loadPg, withoutSslmode } = require('./db-migrate.cjs')
const REPO = path.resolve(__dirname, '..')

let URL_ = null
let failed = 0
const say = (...a) => console.log(...a)
const ok = (label, cond, detail) => { if (cond) say(`  ✓ ${label}`); else { failed++; say(`  🔴 ${label}${detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 800)}` : ''}`) } }
function die(msg) { console.error(`compare-db-proofs: ${URL_ ? scrub(msg, URL_) : msg}`); process.exit(2) }
/** Every statement goes through here: printed, then sent. A COMMIT is refused before it can be sent. */
async function q(c, tag, sql, params = []) {
  if (/\bcommit\b/i.test(sql.replace(/--[^\n]*/g, ''))) die(`refusing to send a COMMIT (${tag})`)
  say(`SQL [${tag}]> ${sql.replace(/\s+/g, ' ').trim().slice(0, 1600)}${params.length ? `   -- params ${JSON.stringify(params)}` : ''}`)
  return c.query(sql, params)
}
async function connect(tag) {
  const { Client } = loadPg()
  const c = new Client({ connectionString: withoutSslmode(URL_), ssl: { rejectUnauthorized: false }, application_name: `compare-db-proofs ${tag} (Claude Code)` })
  c.on('notice', n => say(`  notice [${tag}]: ${scrub(n.message, URL_)}`))
  await c.connect()
  await q(c, tag, "set statement_timeout = '5s'")
  await q(c, tag, "set lock_timeout = '3s'")
  return c
}
async function inRollback(tag, fn) {
  const c = await connect(tag)
  try { await q(c, tag, 'begin'); return await fn(c) }
  finally {
    try { await q(c, tag, 'rollback') } catch (e) { say(`  (rollback on ${tag}: ${scrub(e.message, URL_)})`) }
    try { await c.end() } catch { /* closed */ }
  }
}

const W = ["'2026-11-24 17:17:50.512+00'", "'2026-11-24 17:19:00+00'"]
const LIVE_PAGE = ['b7b74ca7-3b6b-5f15-beaa-0c85b1fa5131' /* Food Truck ONE (US) */, '2e7c69aa-380a-5d74-ba24-63e5f9671e87' /* xMenu (IT) */,
  'e6a09d6e-dc3b-5e07-9d53-e5c2fadfa7ec' /* Mobaregi (JP) */, 'da91c9a7-4479-5fa8-ba19-b82c6fbe9f51' /* Chuzmonster (JP) */]
/** The state the repair is judged on. */
async function stateOf(c, tag) {
  const r = await q(c, tag, `select
     (select count(*) from public.competitor_feature_values where superseded_at is null)::int as current_answers,
     (select count(*) from public.competitor_feature_values)::int as all_answers,
     (select count(*) from public.competitor_feature_values where created_at >= ${W[0]} and created_at < ${W[1]})::int as inserted_in_window,
     (select count(*) from public.competitor_feature_values where superseded_at >= ${W[0]} and superseded_at < ${W[1]})::int as superseded_in_window,
     (select count(*) from (select distinct competitor_id, feature_key, coalesce(country_code, '') cc from public.competitor_feature_values s
        where not exists (select 1 from public.competitor_feature_values v where v.competitor_id = s.competitor_id and v.feature_key = s.feature_key
          and coalesce(v.country_code, '') = coalesce(s.country_code, '') and v.superseded_at is null)) x)::int as pairs_without_current,
     (select count(*) from public.competitor_feature_values where competitor_id = any($1) and superseded_at is null)::int as live_page_current,
     (select count(*) from (select distinct competitor_id, feature_key, coalesce(country_code, '') from public.competitor_feature_values where competitor_id = any($1)) x)::int as live_page_pairs,
     (select count(*) from public.competitors)::int as competitors, (select count(*) from public.competitor_plans)::int as plans,
     (select count(*) from public.comparison_entries)::int as entries`, [LIVE_PAGE])
  say(`  state ${tag}: ${JSON.stringify(r.rows[0])}`)
  return r.rows[0]
}

async function preflightRepair(file) {
  const rel = path.relative(REPO, path.resolve(REPO, file))
  if (!/^supabase\/migrations\/[^/]+\.sql$/.test(rel)) die('the pre-flight takes one supabase/migrations/*.sql file')
  const sql = fs.readFileSync(path.join(REPO, rel), 'utf8')
  // its own transaction control is taken out: the pre-flight's transaction is the one that rolls back
  const body = sql.replace(/^\s*begin\s*;\s*$/gim, '').replace(/^\s*commit\s*;\s*$/gim, '')
  if (/\bcommit\b/i.test(body.replace(/--[^\n]*/g, ''))) die('the migration still contains a COMMIT after stripping — refusing')
  say(`\n══ before (read-only, rolled back)`)
  const before = await inRollback('before', async c => { await q(c, 'before', 'set transaction read only'); return stateOf(c, 'before') })
  say(`\n══ the migration inside ONE transaction that ROLLBACKs (${rel})`)
  const inside = await inRollback('preflight', async c => { await q(c, 'preflight', body); return stateOf(c, 'inside') })
  say(`\n══ after the rollback (read-only)`)
  const after = await inRollback('after', async c => { await q(c, 'after', 'set transaction read only'); return stateOf(c, 'after') })
  say(`\n══ checks`)
  ok(`inside: ${inside.current_answers} current answers = the 8,012 before the failed import`, inside.current_answers === 8012, inside)
  ok('inside: the failed import\'s window is empty (nothing inserted, nothing superseded by it remains)', inside.inserted_in_window === 0 && inside.superseded_in_window === 0, inside)
  ok(`inside: no (competitor, feature, country) left without a current answer (was ${before.pairs_without_current})`, inside.pairs_without_current === 0, inside)
  ok('inside: the four live-page competitors (Food Truck ONE, xMenu, Mobaregi, Chuzmonster) have every answer current', inside.live_page_current === inside.live_page_pairs, inside)
  ok('inside: competitors, plans and entries untouched', inside.competitors === before.competitors && inside.plans === before.plans && inside.entries === before.entries, { before, inside })
  ok('after the ROLLBACK: every count exactly as before', JSON.stringify(after) === JSON.stringify(before), { before, after })
}
/** compare-research-3: ANY competitor-data migration, inside ONE transaction that ROLLBACKs — the migration's own guards (its do-blocks)
 *  must pass; the tables' counts and the competitor rows' check pages / plan flags are printed before, inside and after, and the
 *  state after the rollback must equal the state before. */
async function generalState(c, tag) {
  const r = await q(c, tag, `select (select count(*) from public.competitors)::int competitors, (select count(*) from public.competitor_plans)::int plans,
     (select count(*) from public.competitor_plans where superseded_at is null and unclear)::int current_unclear_plans,
     (select count(*) from public.comparison_entries)::int entries, (select count(*) from public.competitor_feature_values where superseded_at is null)::int current_answers,
     (select md5(string_agg(id::text || coalesce(array_to_string(check_urls, ','), '') || coalesce(website, ''), '|' order by id)) from public.competitors) competitors_md5,
     (select md5(string_agg(id::text || unclear::text || coalesce(monthly_minor::text, '') || coalesce(notes, ''), '|' order by id)) from public.competitor_plans) plans_md5`)
  say(`  state ${tag}: ${JSON.stringify(r.rows[0])}`)
  return r.rows[0]
}
async function preflightGeneral(file) {
  const rel = path.relative(REPO, path.resolve(REPO, file))
  if (!/^supabase\/migrations\/[^/]+\.sql$/.test(rel)) die('the pre-flight takes one supabase/migrations/*.sql file')
  const body = fs.readFileSync(path.join(REPO, rel), 'utf8').replace(/^\s*begin\s*;\s*$/gim, '').replace(/^\s*commit\s*;\s*$/gim, '')
  if (/\bcommit\b/i.test(body.replace(/--[^\n]*/g, ''))) die('the migration still contains a COMMIT after stripping — refusing')
  if (/\b(trucks|orders|plan_prices|plan_features|country_settings)\b|pizzeria-gusto/i.test(body.replace(/--[^\n]*/g, ''))) die('this pre-flight is for competitor data only')
  say(`\n══ before (read-only, rolled back)`)
  const before = await inRollback('before', async c => { await q(c, 'before', 'set transaction read only'); return generalState(c, 'before') })
  say(`\n══ the migration inside ONE transaction that ROLLBACKs (${rel})`)
  const inside = await inRollback('preflight', async c => { await q(c, 'preflight', body); return generalState(c, 'inside') })
  say(`\n══ after the rollback (read-only)`)
  const after = await inRollback('after', async c => { await q(c, 'after', 'set transaction read only'); return generalState(c, 'after') })
  say(`\n══ checks`)
  ok('inside: the migration ran, its own guards passed', !!inside)
  ok('inside: competitors, plans, entries and answers counts unchanged (it only updates rows)', inside.competitors === before.competitors && inside.plans === before.plans && inside.entries === before.entries && inside.current_answers === before.current_answers, { before, inside })
  ok('after the ROLLBACK: every count and checksum exactly as before', JSON.stringify(after) === JSON.stringify(before), { before, after })
}
async function repairCheck() {
  const s = await inRollback('check', async c => { await q(c, 'check', 'set transaction read only'); return stateOf(c, 'now') })
  ok(`${s.current_answers} current answers = 8,012`, s.current_answers === 8012, s)
  ok('the failed import\'s window is empty', s.inserted_in_window === 0 && s.superseded_in_window === 0, s)
  ok('no (competitor, feature, country) without a current answer', s.pairs_without_current === 0, s)
  ok('the four live-page competitors have every answer current', s.live_page_current === s.live_page_pairs, s)
}

;(async () => {
  URL_ = dbUrl()
  const args = process.argv.slice(2)
  if (args[0] === '--preflight-repair' && args[1]) await preflightRepair(args[1])
  else if (args[0] === '--repair-check') await repairCheck()
  else if (args[0] === '--preflight' && args[1]) await preflightGeneral(args[1])
  else die('usage: --preflight-repair <migration.sql> | --repair-check | --preflight <competitor-data migration.sql>')
  say(failed ? `\n🔴 compare-db-proofs: ${failed} check(s) failed` : '\n✓ compare-db-proofs: every check passed — nothing was committed')
  process.exit(failed ? 1 : 0)
})().catch(e => die(e && e.message ? e.message : String(e)))
