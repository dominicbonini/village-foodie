// scripts/migration-function-grants.cjs — NO FUNCTION IN A MIGRATION IS CALLABLE WITH THE PUBLIC KEY (US polish batch,
// 19 October 2026; docs/us-polish-batch-report.md, docs/reference-manual.md §35).
//
// A new function in `public` gets EXECUTE for PUBLIC, anon and authenticated by default (pg_default_acl), so the public
// (anon) key can call it over /rest/v1/rpc. On 12 October three were closed by hand; they were reopened by a hand-run
// `grant … to public, anon, authenticated` (the reports' own rollback lines) and nobody noticed for a week. This is the
// static guard, over every file in supabase/migrations:
//   1. every `create [or replace] function` is followed, IN THE SAME FILE, by a revoke of EXECUTE (or ALL) on that exact
//      signature from public, anon AND authenticated — unless the function is on ALLOW below, with its reason;
//   2. no statement grants a function to public, anon or authenticated — unless that grant is on ALLOW.
// Comments and dollar-quoted bodies are stripped first, so a function's body or a commented-out block never counts.
// Then the guard is turned on itself: the creating files as they stood at git HEAD (before 19 October) must FAIL, and
// so must a file holding the reports' rollback line, and a file whose revoke names the wrong signature or role.
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const DIR = path.join(REPO, 'supabase/migrations')

/** Functions meant to be callable by a public role: `name(identity types)` → { roles, reason }. Keep it short. */
const ALLOW = {
  // (none — every function in supabase/migrations is called by server code on the service role, 19 October 2026)
}

const strip = sql => {
  let out = '', i = 0
  while (i < sql.length) {
    if (sql.startsWith('--', i)) { const e = sql.indexOf('\n', i); i = e < 0 ? sql.length : e; continue }
    if (sql.startsWith('/*', i)) { const e = sql.indexOf('*/', i + 2); i = e < 0 ? sql.length : e + 2; continue }
    const dq = /^\$[A-Za-z_]*\$/.exec(sql.slice(i, i + 40))
    if (dq) { const e = sql.indexOf(dq[0], i + dq[0].length); out += ' $body$ '; i = e < 0 ? sql.length : e + dq[0].length; continue }
    if (sql[i] === "'") { let j = i + 1; while (j < sql.length && !(sql[j] === "'" && sql[j + 1] !== "'")) j += sql[j] === "'" ? 2 : 1; out += "''"; i = j + 1; continue }
    out += sql[i++]
  }
  return out
}
const TYPE_ALIAS = { int: 'integer', int4: 'integer', int2: 'smallint', int8: 'bigint', bool: 'boolean', float8: 'double precision', float4: 'real',
  timestamptz: 'timestamp with time zone', timestamp: 'timestamp without time zone', time: 'time without time zone', varchar: 'character varying' }
const TYPE_WORDS = new Set(['integer', 'int', 'int2', 'int4', 'int8', 'smallint', 'bigint', 'text', 'uuid', 'jsonb', 'json', 'date', 'time', 'timestamp', 'timestamptz',
  'boolean', 'bool', 'numeric', 'double', 'real', 'character', 'varchar', 'char', 'bytea', 'float4', 'float8', 'interval', 'inet', 'regclass', 'name'])
const normType = t => {
  let s = t.toLowerCase().replace(/\s+/g, ' ').trim()
  const arr = s.endsWith('[]'); if (arr) s = s.slice(0, -2).trim()
  s = TYPE_ALIAS[s] ?? s
  return s + (arr ? '[]' : '')
}
const splitTop = s => { const out = []; let d = 0, cur = ''; for (const c of s) { if (c === '(') d++; if (c === ')') d--; if (c === ',' && d === 0) { out.push(cur); cur = '' } else cur += c } if (cur.trim()) out.push(cur); return out }
/** A create's argument list → its identity types (names, defaults and OUT arguments dropped). */
const identity = args => splitTop(args).map(a => a.replace(/\s+(default\b|=)[\s\S]*$/i, '').trim()).filter(Boolean)
  .filter(a => !/^(out)\s/i.test(a))
  .map(a => {
    const w = a.replace(/^(in|inout|variadic)\s+/i, '').split(/\s+/)
    return normType(w.length > 1 && !TYPE_WORDS.has(w[0].toLowerCase().replace(/\[\]$/, '')) ? w.slice(1).join(' ') : w.join(' '))
  }).join(',')
const sigOf = (name, types) => `${name.toLowerCase()}(${types})`
const balanced = (s, from) => { let d = 0; for (let i = from; i < s.length; i++) { if (s[i] === '(') d++; else if (s[i] === ')') { d--; if (d === 0) return i } } return -1 }

/** One file's problems: [] when it passes. */
function check(file, sql) {
  const s = strip(sql), problems = []
  const creates = [], revokes = [], grants = []
  for (const m of s.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?("?[a-z_0-9]+"?)\s*\(/gi)) {
    const open = m.index + m[0].length - 1, close = balanced(s, open)
    creates.push({ at: m.index, sig: sigOf(m[1].replace(/"/g, ''), identity(s.slice(open + 1, close))) })
  }
  for (const m of s.matchAll(/\b(revoke|grant)\s+(execute|all(?:\s+privileges)?)\s+on\s+function\s+(?:public\.)?("?[a-z_0-9]+"?)\s*\(/gi)) {
    const open = m.index + m[0].length - 1, close = balanced(s, open)
    const types = splitTop(s.slice(open + 1, close)).map(x => normType(x)).filter(Boolean).join(',')
    const rest = s.slice(close + 1, s.indexOf(';', close) < 0 ? s.length : s.indexOf(';', close))
    const rm = /^\s*(?:from|to)\s+([\s\S]*)$/i.exec(rest)
    const roles = new Set((rm ? rm[1] : '').split(',').map(r => r.trim().toLowerCase().replace(/"/g, '')).filter(Boolean))
    ;(m[1].toLowerCase() === 'revoke' ? revokes : grants).push({ at: m.index, sig: sigOf(m[3].replace(/"/g, ''), types), roles })
  }
  for (const c of creates) {
    if (ALLOW[c.sig]) continue
    const ok = revokes.some(r => r.at > c.at && r.sig === c.sig && ['public', 'anon', 'authenticated'].every(x => r.roles.has(x)))
    if (!ok) problems.push(`${file}: creates ${c.sig} but never revokes it from public, anon and authenticated after the create`)
  }
  for (const g of grants) {
    const open = [...g.roles].filter(r => ['public', 'anon', 'authenticated'].includes(r))
    if (open.length && !(ALLOW[g.sig] && open.every(r => ALLOW[g.sig].roles.includes(r)))) problems.push(`${file}: GRANTS ${g.sig} to ${open.join(', ')} — reopens it to the public key`)
  }
  return { creates: creates.length, problems }
}

let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`) } }

console.log('── every migration in supabase/migrations')
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()
let creates = 0, withCreates = 0
const all = []
for (const f of files) {
  const r = check(f, fs.readFileSync(path.join(DIR, f), 'utf8'))
  creates += r.creates; if (r.creates) withCreates++
  all.push(...r.problems)
}
t(`${files.length} files, ${creates} function creates in ${withCreates} files: each revoked from public, anon and authenticated in its own file; none granted back`, all.length === 0, all.join('\n      '))
t(`the allow-list is short and every entry gives its reason (${Object.keys(ALLOW).length})`, Object.keys(ALLOW).length <= 5 && Object.values(ALLOW).every(a => a && a.reason && a.reason.length > 20 && Array.isArray(a.roles)))
t('the dated record of the live revokes exists: 20261012_revoke_public_functions.sql, marked "already applied — file only, do not run"',
  /ALREADY APPLIED — FILE ONLY, DO NOT RUN/.test(fs.readFileSync(path.join(DIR, '20261012_revoke_public_functions.sql'), 'utf8')))

console.log('\n── the guard turned on itself — each must FAIL')
// The files as they stood before 19 October: pinned to 8a5c4b5a (not "HEAD", which moves once this is committed).
const headOf = f => { try { return execFileSync('git', ['show', `8a5c4b5a:supabase/migrations/${f}`], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) } catch { return null } }
for (const f of ['20260804_place_order_atomic_placed_at.sql', '20260814_purge_order_drafts_display_note.sql', '20260816_find_stranded_authorisations_settled.sql', '20260819_claim_order_for_auto_reject.sql']) {
  const before = headOf(f)
  if (before === null || /NOT CALLABLE WITH THE PUBLIC KEY/.test(before)) { t(`${f} at 8a5c4b5a (before 19 October) — not available to test`, true); continue }
  const r = check(f, before)
  t(`${f} as it stood at 8a5c4b5a (a create with no revoke — how a fresh database left it open): FAILS`, r.problems.length > 0, 'it passed')
}
const ROLLBACK = "begin;\ngrant execute on function public.find_stranded_authorisations(integer, integer) to public, anon, authenticated;\ngrant execute on function public.purge_order_drafts()                          to public, anon, authenticated;\ncommit;\n"
t('a file holding the definer report\'s rollback line (what undid the 12 Oct revokes): FAILS', check('rollback.sql', ROLLBACK).problems.length === 2)
t('…and place-order-grant-report\'s: FAILS', check('rollback2.sql', 'grant execute on function public.place_order_atomic(jsonb, text, text, uuid, text, date, jsonb) to public, anon, authenticated;').problems.length === 1)
const fn = "create or replace function public.f(p_a integer default 1, p_b uuid) returns int language sql as $$ select 1 $$;\n"
t('a revoke naming the WRONG signature: FAILS', check('w.sql', fn + 'revoke execute on function public.f(integer) from public, anon, authenticated;').problems.length === 1)
t('a revoke that leaves out authenticated: FAILS', check('w.sql', fn + 'revoke execute on function public.f(integer, uuid) from public, anon;').problems.length === 1)
t('a revoke BEFORE the create (the create re-grants by default): FAILS', check('w.sql', 'revoke execute on function public.f(int, uuid) from public, anon, authenticated;\n' + fn).problems.length === 1)
t('a create only inside a comment or a function body is not a create', check('w.sql', "-- create or replace function public.g() returns int\ncreate function public.h() returns int language plpgsql as $$ begin execute 'create function x()'; return 1; end $$;\nrevoke all on function public.h() from public, anon, authenticated;").problems.length === 0)
t('the correct form passes (int ≡ integer, names and defaults dropped, revoke all ≡ revoke execute)', check('w.sql', fn + 'revoke all on function public.f(int, uuid) from public, anon, authenticated;').problems.length === 0)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
