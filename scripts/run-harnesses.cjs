#!/usr/bin/env node
// scripts/run-harnesses.cjs — runs EXACTLY the files named in scripts/harnesses.json, in order, and
// nothing else. Usage:
//   node scripts/run-harnesses.cjs                    # run them all
//   node scripts/run-harnesses.cjs --list=<file.json> # run a different list (used by the broken variant)
//   node scripts/run-harnesses.cjs --dry-run          # screen every listed file, run none
//
// ── 🔴 WHY THIS EXISTS ────────────────────────────────────────────────────────────────────────────────
// On 17 September 2026 a verification sweep written as `ls scripts/*.cjs | grep -v '/_'` ran
// scripts/migrate-from-sheets.cjs against the LIVE database with the service role: 132 rows of
// public.discovery_trucks overwritten from a Google Sheet and 19 inserted, in 1.2 seconds, with no
// confirmation and no audit trail. docs/discovery-upsert-incident-report.md has the full account.
// A glob cannot tell a proof from a migration. This runner does two independent things about that:
//   1. it runs a COMMITTED LIST, never a glob — a new file is invisible to it until someone lists it;
//   2. it SCREENS every listed file's source before running it, so listing the wrong file is still safe.
// (2) is the one that matters: a list is only as good as the hand that edits it, and the incident was
// caused by exactly such a hand. The screen is a property of the FILE, not of anyone's intent.
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const REPO = path.resolve(__dirname, '..')
const argv = process.argv.slice(2)
const DRY = argv.includes('--dry-run')
const listArg = argv.find(a => a.startsWith('--list='))
const LIST_PATH = path.resolve(REPO, listArg ? listArg.slice('--list='.length) : 'scripts/harnesses.json')

// ── THE SCREEN ───────────────────────────────────────────────────────────────────────────────────────
// Five markers. The first four are plain substrings — any occurrence is disqualifying, including one in
// a comment, because a file that so much as discusses building a production client is not a file this
// runner should execute unattended. `stripe` is matched case-insensitively as a WHOLE WORD so that a
// harness may still be named after, say, a striped layout without being refused.
// The fifth is `fetch(` to anywhere but the loopback: a harness may talk to a local fixture server
// (scripts/dev-virtual-printer.cjs is one), but never to the network.
const BANNED = [
  { name: 'createClient',              test: s => s.includes('createClient') },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', test: s => s.includes('SUPABASE_SERVICE_ROLE_KEY') },
  { name: 'googleapis',                test: s => s.includes('googleapis') },
  { name: 'stripe',                    test: s => /\bstripe\b/i.test(s) },
]
/**
 * Every `fetch(` whose target is not provably the loopback.
 * 🔴 UNPROVABLE MEANS REFUSED. `fetch(url)` where `url` is a variable is rejected, not allowed: the
 * whole point is that the runner decides from the source text alone, and a variable could hold
 * anything. A harness that genuinely needs a local fetch writes the literal and passes.
 */
function badFetches(src) {
  const out = []
  const re = /\bfetch\s*\(/g
  let m
  while ((m = re.exec(src)) !== null) {
    const arg = src.slice(m.index + m[0].length, m.index + m[0].length + 160)
    const lit = arg.match(/^\s*(['"`])([^'"`]*)\1/)
    const line = src.slice(0, m.index).split('\n').length
    if (!lit) { out.push(`line ${line}: fetch(<non-literal>) — cannot prove it is local`); continue }
    const url = lit[2]
    const local = /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(url) || url.startsWith('/')
    if (!local) out.push(`line ${line}: fetch('${url.slice(0, 60)}') — not localhost`)
  }
  return out
}
function screen(file, src) {
  const hits = BANNED.filter(b => b.test(src)).map(b => b.name).concat(badFetches(src))
  return hits
}

// ── LOAD THE LIST ────────────────────────────────────────────────────────────────────────────────────
let doc
try { doc = JSON.parse(fs.readFileSync(LIST_PATH, 'utf8')) }
catch (e) { console.error(`🔴 cannot read the harness list ${path.relative(REPO, LIST_PATH)}: ${e.message}`); process.exit(2) }
const listed = Array.isArray(doc) ? doc : doc.harnesses
if (!Array.isArray(listed) || listed.length === 0) { console.error('🔴 the list is empty or malformed'); process.exit(2) }
console.log(`list: ${path.relative(REPO, LIST_PATH)} — ${listed.length} harnesses`)

// ── DRIFT: is every scripts/*.cjs accounted for? Informational, never fatal. ──────────────────────────
{
  const onDisk = fs.readdirSync(path.join(REPO, 'scripts')).filter(f => f.endsWith('.cjs')).sort()
  const excluded = new Set()
  for (const group of Object.values((Array.isArray(doc) ? {} : doc.excluded) || {}))
    if (group && Array.isArray(group.files)) for (const f of group.files) excluded.add(f)
  const known = new Set([...listed, ...excluded, 'run-harnesses.cjs'])
  const unregistered = onDisk.filter(f => !known.has(f))
  if (unregistered.length) {
    console.log(`\n⚠️  ${unregistered.length} file(s) in scripts/ are in neither the list nor the excluded groups:`)
    for (const f of unregistered) console.log(`      ${f}   ← add it to scripts/harnesses.json, or to an excluded group with a reason`)
  }
}

// ── SCREEN EVERYTHING FIRST, THEN RUN ────────────────────────────────────────────────────────────────
// Deliberately two passes: if any listed file is disqualified the runner refuses the WHOLE run rather
// than running the safe ones first. A list containing a production script is a broken list, and a
// broken list should be fixed before any of it is trusted.
console.log('\n── SCREENING ────────────────────────────────────────────────────────────────────────────')
const refused = []
const missing = []
for (const name of listed) {
  const file = path.join(REPO, 'scripts', name)
  if (!fs.existsSync(file)) { missing.push(name); console.log(`  🔴 ${name} — LISTED BUT NOT ON DISK`); continue }
  const hits = screen(name, fs.readFileSync(file, 'utf8'))
  if (hits.length) { refused.push({ name, hits }); console.log(`  🔴 REFUSED ${name} — ${hits.join('; ')}`) }
}
if (missing.length || refused.length) {
  console.log(`\n🔴 REFUSING THE ENTIRE RUN. ${refused.length} file(s) failed the screen, ${missing.length} missing.`)
  for (const r of refused) console.log(`   ${r.name}: ${r.hits.join('; ')}`)
  console.log('   Nothing was executed. A listed file that can reach production is a bug in the list.')
  process.exit(3)
}
console.log(`  ✓ all ${listed.length} listed files pass the screen (no createClient, no service-role key, no googleapis, no stripe, no non-local fetch)`)
if (DRY) { console.log('\n--dry-run: nothing executed.'); process.exit(0) }

console.log('\n── RUNNING ──────────────────────────────────────────────────────────────────────────────')
const results = []
for (const name of listed) {
  const t0 = Date.now()
  const r = spawnSync(process.execPath, [path.join('scripts', name)], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  // 🔴 THE TRUE EXIT CODE. A signal death (SIGKILL on an OOM, say) has a null status and MUST NOT be
  // read as 0 — that is how a failing sweep reports success. Signals are reported as 128+n, as a shell does.
  const code = r.status === null ? (r.signal ? 128 : 1) : r.status
  const out = (r.stdout || '') + (r.stderr || '')
  const last = out.split('\n').filter(l => /^(✅|🔴)/.test(l)).pop() || (r.signal ? `killed by ${r.signal}` : '')
  results.push({ name, code, signal: r.signal || null, secs: ((Date.now() - t0) / 1000).toFixed(1), last, out })
  console.log(`  ${code === 0 ? '✓' : '🔴'} rc=${String(code).padEnd(3)} ${String(results[results.length - 1].secs).padStart(5)}s  ${name.padEnd(46)} ${last.slice(0, 84)}`)
}

console.log('\n── SUMMARY ──────────────────────────────────────────────────────────────────────────────')
const failed = results.filter(r => r.code !== 0)
for (const r of results) console.log(`  rc=${String(r.code).padEnd(3)} ${r.name}`)
console.log(`\n  ${results.length} run · ${results.length - failed.length} passed · ${failed.length} failed`)
if (failed.length) {
  console.log('\n🔴 FAILURES, with their output:')
  for (const f of failed) {
    console.log(`\n── ${f.name} (rc=${f.code}${f.signal ? ', ' + f.signal : ''}) ──`)
    console.log(f.out.split('\n').slice(-25).join('\n'))
  }
}
console.log(failed.length ? `\n🔴 ${failed.length} HARNESS(ES) FAILED` : '\n✅ every listed harness passed')
process.exit(failed.length ? 1 : 0)
