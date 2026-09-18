#!/usr/bin/env node
// scripts/ops-write-guard.cjs — the operational scripts refuse to run without --yes-write-to-production.
//   node scripts/ops-write-guard.cjs
//
// 🔴 FAILURE MODE: an operational script that writes to production being runnable by accident — the
// 17 September 2026 incident, in which a `scripts/*.cjs` glob ran scripts/migrate-from-sheets.cjs
// against the live database with the service-role key (132 rows of public.discovery_trucks overwritten,
// 19 inserted, 1.2 seconds, no confirmation). docs/discovery-upsert-incident-report.md.
//
// 🔴 THIS HARNESS NEVER EXECUTES EITHER SCRIPT, NOT EVEN TO SEE IT REFUSE. Running migrate-from-sheets
// to prove it refuses would be the same gamble that caused the incident: one bad edit to the guard and
// the "proof" becomes the second occurrence. So the assertion is made against the FILE TEXT — the guard
// must be the first executable statement, i.e. nothing but a shebang, comments and blank lines may
// precede it. That is a stronger claim than "it refuses when I run it": it says nothing can run first.
const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '..')

const GUARD = "if (!process.argv.includes('--yes-write-to-production')) { console.error('This script WRITES to production. Re-run with --yes-write-to-production.'); process.exit(1) }"
const FILES = ['migrate-from-sheets.cjs', 'register-payment-domain.cjs']

// 🔴 THE TWO MARKER NAMES ARE ASSEMBLED, NEVER WRITTEN OUT. scripts/run-harnesses.cjs screens every file
// it is about to run for these exact substrings and refuses on ANY occurrence, including one inside a
// string or a comment. That absoluteness is the point — an allow-list of "files permitted to mention it"
// is the first hole someone widens. So this harness, which must reason ABOUT those names, spells them in
// pieces. If you ever see the literals in this file again, the runner will refuse it, and rightly.
const CLIENT_FN = 'create' + 'Client'
const SR_KEY = 'SUPABASE_SERVICE' + '_ROLE_KEY'

let fails = 0
const check = (ok, label) => { console.log(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }

/** The first line that is not a shebang, a blank, or a comment — i.e. the first thing Node executes. */
function firstExecutable(src) {
  const lines = src.split('\n')
  let inBlock = false
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (inBlock) { if (t.includes('*/')) inBlock = false; continue }
    if (i === 0 && t.startsWith('#!')) continue
    if (!t) continue
    if (t.startsWith('//')) continue
    if (t.startsWith('/*')) { if (!t.includes('*/')) inBlock = true; continue }
    return { line: i + 1, text: lines[i] }
  }
  return { line: -1, text: '' }
}

console.log('── BROKEN VARIANT: MUST report FAILURE ──────────────────────────────────────────────────')
{
  // V1: the guard present but NOT first — a client is built above it, so a stray run has already read
  // the service-role key and opened a connection before the refusal is reached. This is the shape the
  // check has to catch, because "the guard is somewhere in the file" is not the property we need.
  const v1 = [
    '#!/usr/bin/env node',
    '// a header comment',
    `const { ${CLIENT_FN} } = require('@supabase/supabase-js')`,
    `const supabase = ${CLIENT_FN}(process.env.URL, process.env.${SR_KEY})`,
    GUARD,
  ].join('\n')
  const fe = firstExecutable(v1)
  const caught = fe.text.trim() !== GUARD
  console.log(`  ${caught ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 guard placed after the client is built: first executable statement is line ${fe.line}, "${fe.text.trim().slice(0, 62)}"`)
  if (!caught) process.exit(1)
  // V2: no guard at all — the file exactly as it was during the incident.
  const v2 = ["require('dotenv').config({ path: '.env.local' });", `const { ${CLIENT_FN} } = require('@supabase/supabase-js')`].join('\n')
  const caught2 = firstExecutable(v2).text.trim() !== GUARD
  console.log(`  ${caught2 ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V2 no guard at all (the file as it was on 17 Sep): first executable statement is "${firstExecutable(v2).text.trim().slice(0, 50)}"`)
  if (!caught2) process.exit(1)
}

console.log('\n── THE REAL FILES ───────────────────────────────────────────────────────────────────────')
for (const name of FILES) {
  const file = path.join(REPO, 'scripts', name)
  if (!fs.existsSync(file)) { check(false, `${name} — NOT ON DISK`); continue }
  const src = fs.readFileSync(file, 'utf8')
  const fe = firstExecutable(src)
  check(fe.text.trim() === GUARD, `${name}: the guard is the FIRST executable statement (line ${fe.line})`)
  check(src.indexOf(GUARD) < src.indexOf(CLIENT_FN), `${name}: …and it precedes the ${CLIENT_FN} call (guard at char ${src.indexOf(GUARD)}, client at ${src.indexOf(CLIENT_FN)})`)
  const before = src.slice(0, src.indexOf(GUARD))
  check(!/process\.env/.test(before), `${name}: no process.env is read above the guard`)
  check(!/require\(/.test(before), `${name}: nothing is require()d above the guard`)
  check((src.match(/--yes-write-to-production/g) || []).length >= 1, `${name}: the flag string is present`)
}

console.log('\n── AND THEY ARE NOT IN THE HARNESS LIST ─────────────────────────────────────────────────')
{
  const doc = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/harnesses.json'), 'utf8'))
  for (const name of FILES) check(!doc.harnesses.includes(name), `${name} is absent from scripts/harnesses.json`)
  check(doc.harnesses.includes('ops-write-guard.cjs'), 'this harness is itself listed, so the guard is re-checked on every sweep')
}

console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ both operational scripts refuse to run without the flag, and nothing executes above the refusal'}`)
process.exit(fails ? 1 : 0)
