#!/usr/bin/env node
// scripts/whatsapp-golive-parity-harness.cjs
//
// Proof for the WhatsApp go-live parity rule (lib/plan-features.ts, findPlanParityViolations).
//   node scripts/whatsapp-golive-parity-harness.cjs
//
// 🔴 THE REAL STATE MUST REPORT ZERO VIOLATIONS, AND THREE BROKEN VARIANTS MUST EACH REPORT AT LEAST
// ONE. A checker that cannot fail is the thing this file exists to rule out — and that is not a
// hypothetical here: until 16 September 2026 this row passed VACUOUSLY, because the check only ever
// inspected cells that were literally `true` and the row read 'coming_soon'.
//
// ── HOW THE VARIANTS ARE BUILT, AND WHY NO REPO FILE IS EVER TOUCHED ────────────────────────────────
// FEATURE_SECTIONS and the flag are read at MODULE LOAD, so a variant cannot be injected as an
// argument the way the other harnesses do it. Instead the repo is compiled ONCE into a temp directory,
// each variant is a COPY of that compiled tree with a literal swapped, and each case runs in its own
// CHILD PROCESS so no module registry is shared. Nothing under the repo is written, mutated or
// restored — a harness that edits source files can leave them edited when it crashes.

const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const REPO = path.resolve(__dirname, '..')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-parity-'))
const base = path.join(tmp, 'base')
fs.mkdirSync(base, { recursive: true })

// ── COMPILE ONCE ────────────────────────────────────────────────────────────────────────────────────
const cfg = path.join(tmp, 'tsconfig.json')
fs.writeFileSync(cfg, JSON.stringify({
  compilerOptions: {
    module: 'commonjs', target: 'es2020', outDir: base, rootDir: REPO, skipLibCheck: true,
    esModuleInterop: true, moduleResolution: 'node', baseUrl: REPO, paths: { '@/*': ['./*'] },
    // 🔴 typeRoots IS EXPLICIT BECAUSE THE TSCONFIG LIVES IN A TEMP DIRECTORY. Without it tsc walks up
    // from /tmp looking for node_modules/@types, finds nothing, and fails on `process` in the drift guard.
    types: ['node'], typeRoots: [path.join(REPO, 'node_modules/@types')],
  },
  files: [path.join(REPO, 'lib/plan-features.ts')],
}))
try {
  execFileSync(path.join(REPO, 'node_modules/.bin/tsc'), ['-p', cfg], { stdio: 'pipe' })
} catch (e) {
  console.log('🔴 COMPILE FAILED:\n' + (e.stdout ? e.stdout.toString() : e.message))
  process.exit(1)
}

const PF = 'lib/plan-features.js'
const WL = 'lib/whatsapp-live.js'

// ── THE RUNNER, WHICH EACH CHILD PROCESS EXECUTES ───────────────────────────────────────────────────
// ⚠️ NODE_ENV=production is set by the parent. The module-level drift guard THROWS in any other
// environment, which would make a variant crash rather than report — and a variant that crashes has
// not demonstrated that the CHECKER caught anything.
const runner = path.join(tmp, 'runner.cjs')
fs.writeFileSync(runner, `
const path = require('path')
const dir = process.argv[2]
const Module = require('module')
const real = Module._resolveFilename
// tsc resolves the \`@/\` alias for type-checking but leaves it in the emitted require() calls.
Module._resolveFilename = function (req, ...rest) {
  if (req.startsWith('@/')) return real.call(this, path.join(dir, req.slice(2)), ...rest)
  return real.call(this, req, ...rest)
}
const pf = require(path.join(dir, 'lib/plan-features.js'))
const wl = require(path.join(dir, 'lib/whatsapp-live.js'))
const row = []
for (const s of pf.FEATURE_SECTIONS) for (const r of s.rows) {
  if (r.name === 'WhatsApp auto-replies' || r.name === 'Messenger & Instagram auto-replies') {
    row.push({ name: r.name, footnote: r.footnote, starter: r.starter, pro: r.pro, max: r.max })
  }
}
process.stdout.write(JSON.stringify({
  flag: wl.WHATSAPP_LIVE,
  violations: pf.findPlanParityViolations(),
  rows: row,
  footnotes: pf.FOOTNOTES.map(f => f.number),
  footnote4: (pf.FOOTNOTES.find(f => f.number === '4') || {}).text || null,
  // 🔴 null MEANS ABSENT, which is the expected state — footnote 6 was retired on 16 September 2026.
  footnote6: (pf.FOOTNOTES.find(f => f.number === '6') || {}).text || null,
}))
`)

function runCase(name, mutate) {
  const dir = path.join(tmp, name)
  fs.cpSync(base, dir, { recursive: true })
  if (mutate) {
    const applied = mutate(dir)
    if (!applied) { console.log(`🔴 ${name}: THE MUTATION DID NOT APPLY — the variant is not broken, so it proves nothing.`); process.exit(1) }
  }
  const out = execFileSync(process.execPath, [runner, dir], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'production' },
  }).toString()
  return JSON.parse(out)
}

/** Swap text inside one file of a variant tree. Returns false if the target was not found. */
function swap(dir, file, from, to) {
  const p = path.join(dir, file)
  const s = fs.readFileSync(p, 'utf8')
  if (!s.includes(from)) return false
  fs.writeFileSync(p, s.replace(from, to))
  return true
}

// The live (footnote 6) row object, exactly as tsc emits it.
// ⚠️ footnote '4' SINCE 16 September 2026 — it was '6' until the two auto-reply rows were merged onto
// one footnote. A stale '6' here makes every mutation silently fail to apply, which the runner treats as
// a hard error rather than a pass (see runCase).
const LIVE_ROW = `footnote: '4', detail: 'Auto-reply to WhatsApp enquiries about your menu and schedule.', starter: false, pro: true, max: true`
const SOON_ROW = `footnote: '4', detail: 'Auto-reply to WhatsApp enquiries about your menu and schedule.', starter: false, pro: 'coming_soon', max: 'coming_soon'`

// 🔴 BOTH AUTO-REPLY ROWS NOW CARRY footnote '4', so LIVE_ROW and SOON_ROW are distinguished ONLY by
// their cells. Keep the full cell list in each — truncating either would make `swap` hit the wrong one.
// The tail of footnote 5, used to append a bogus footnote 6 after it (F1).
const FN5_TAIL = `        text: 'Kitchen ticket printing requires the HatchGrab kitchen app and a compatible thermal printer (neither supplied). Compatible printers listed in our help centre.',
    },`
// The OFF branch of footnote 4's conditional text (F3).
const FN4_OFF = `'Auto-replies require a Business account on each platform. Replies are AI-generated and can occasionally be wrong.'`

const CASES = [
  ['V1', 'flag TRUE but the WhatsApp matrix cell still says coming_soon',
    d => swap(d, PF, LIVE_ROW, `footnote: '4', detail: 'Auto-reply to WhatsApp enquiries about your menu and schedule.', starter: false, pro: 'coming_soon', max: 'coming_soon'`)],
  ['V2', 'flag TRUE and a plan cell says live where canAccess denies whatsapp_replies (starter)',
    d => swap(d, PF, LIVE_ROW, `footnote: '4', detail: 'Auto-reply to WhatsApp enquiries about your menu and schedule.', starter: true, pro: true, max: true`)],
  // ⚠️ NOT REQUIRED BY THE BRIEF — the other half of the same rule, included because a one-directional
  // proof of a two-directional check is the vacuous pass all over again.
  ['V3', 'flag FALSE but a plan cell still says live',
    d => swap(d, WL, 'exports.WHATSAPP_LIVE = true', 'exports.WHATSAPP_LIVE = false') &&
         swap(d, PF, SOON_ROW, `footnote: '4', detail: 'Auto-reply to WhatsApp enquiries about your menu and schedule.', starter: false, pro: true, max: true`)],

  // ── THE FOOTNOTE-MERGE VARIANTS ───────────────────────────────────────────────────────────────────
  // ⚠️ NAMED F1-F3, NOT V1-V3. The brief numbers them V1-V3, but those labels were already taken by the
  // parity variants above; renaming those would make the previous report's captured output unmatchable.
  // F1 = the brief's V1, F2 = V2, F3 = V3.
  ['F1', 'footnote 6 still present (the retired footnote reinstated)',
    d => swap(d, PF, FN5_TAIL, FN5_TAIL + `
    {
        number: '6',
        text: 'Auto-replies need a WhatsApp Business account.',
    },`), 'footnote', true],
  ['F2', 'the WhatsApp row still points at footnote 6',
    d => swap(d, PF, LIVE_ROW, LIVE_ROW.replace(`footnote: '4'`, `footnote: '6'`)), 'footnote', true],
  ['F3', 'footnote 4 carries the billing sentences even when the flag is FALSE',
    d => swap(d, WL, 'exports.WHATSAPP_LIVE = true', 'exports.WHATSAPP_LIVE = false') &&
         swap(d, PF, FN4_OFF, `'Auto-replies require a Business account on each platform. Meta, not HatchGrab, bills your WhatsApp account for replies. From 1 October 2026 the first 1,000 a month are free. Correct at 16 September 2026; Meta may change its prices, so check with Meta. Replies are AI-generated and can occasionally be wrong.'`), 'footnote', false],
]

/**
 * 🔴 THE FOOTNOTE RULES, AS A REUSABLE DETECTOR. They are NOT part of findPlanParityViolations() — that
 * function compares advertised cells against the gate and knows nothing about footnote text. So the
 * footnote variants (F1-F3) have to be judged by THIS, and the parity variants (V1-V3) by the
 * violations list. Judging every variant by the violations list is how F1-F3 first "passed" while
 * being demonstrably broken: the check was looking somewhere else entirely.
 *
 * @param r         one runCase() result
 * @param expectLive whether this tree has WHATSAPP_LIVE true — the billing sentences belong in footnote
 *                   4 in that state and MUST NOT appear in the other.
 * @returns [name, ok] pairs
 */
function footnoteChecks(r, expectLive) {
  const c = []
  const p = (n, ok) => c.push([n, !!ok])
  p('footnote 6 does not exist', r.footnote6 === null)
  p('footnote numbering stops at 5', r.footnotes.join(',') === '1,2,3,4,5')
  p('footnote 4 exists', r.footnote4 !== null)
  p('BOTH auto-reply rows point at footnote 4', r.rows.length === 2 && r.rows.every(x => x.footnote === '4'))
  // True of both rows in both states — the clause that makes ONE shared footnote possible at all.
  p('footnote 4 — platform-neutral opener',
    r.footnote4 && r.footnote4.includes('Auto-replies require a Business account on each platform.'))
  p('footnote 4 — AI disclosure',
    r.footnote4 && r.footnote4.includes('Replies are AI-generated and can occasionally be wrong.'))
  // 🔴 `${undefined}` COMPILES AND TYPE-CHECKS HAPPILY. Rendered text is the only place it shows up.
  p('footnote 4 has no unrendered interpolation', r.footnote4 && !/undefined|\$\{/.test(r.footnote4))
  p('footnote 4 says nothing about "unlimited"', r.footnote4 && !/unlimited/i.test(r.footnote4))
  p('footnote 4 no longer says "Auto-replies need a WhatsApp Business account."',
    r.footnote4 && !r.footnote4.includes('Auto-replies need a WhatsApp Business account.'))
  p('footnote 4 no longer says "bills you directly"', r.footnote4 && !r.footnote4.includes('bills you directly'))
  p('footnote 4 no longer says "Responses are AI-generated"', r.footnote4 && !r.footnote4.includes('Responses are AI-generated'))

  if (expectLive) {
    p('LIVE: footnote 4 — who bills',
      r.footnote4 && r.footnote4.includes('Meta, not HatchGrab, bills your WhatsApp account for replies.'))
    p('LIVE: footnote 4 — allowance start date, rendered',
      r.footnote4 && r.footnote4.includes('From 1 October 2026 the first 1,000 a month are free.'))
    p('LIVE: footnote 4 — checked-on date, rendered',
      r.footnote4 && r.footnote4.includes('Correct at 16 September 2026; Meta may change its prices, so check with Meta.'))
  } else {
    // 🔴 THE OFF BRANCH MUST CLAIM NOTHING ABOUT MONEY. A conditional string with only its live branch
    // asserted is how the off branch quietly acquires a billing claim for a feature that is not live.
    p('OFF: footnote 4 is exactly the plain two-sentence version',
      r.footnote4 === 'Auto-replies require a Business account on each platform. Replies are AI-generated and can occasionally be wrong.')
    p('OFF: footnote 4 claims nothing about billing',
      r.footnote4 && !/bills|free|pricing|Meta may change/.test(r.footnote4))
    p('OFF: no date appears in footnote 4', r.footnote4 && !/2026/.test(r.footnote4))
  }
  return c
}

/** A variant is "detected" when the check that OWNS its rule reports a problem. */
const DETECTORS = {
  parity:   r => r.violations.length > 0 ? r.violations : [],
  footnote: (r, live) => footnoteChecks(r, live).filter(([, ok]) => !ok).map(([n]) => n),
}

console.log('── BROKEN VARIANTS: each MUST be caught by the check that owns its rule ─────────────────')
let allFailed = true
for (const [key, label, mutate, kind, live] of CASES) {
  const r = runCase(key, mutate)
  const caught = DETECTORS[kind || 'parity'](r, live === undefined ? true : live)
  const detected = caught.length > 0
  if (!detected) allFailed = false
  console.log(`  ${detected ? '✓ FAILED as required' : '🔴 PASSED — THE CHECK PROVES NOTHING'}  ${key} ${label}`)
  for (const v of caught.slice(0, 3)) console.log(`        caught: ${v}`)
}
if (!allFailed) { console.log('\n🔴 A VARIANT PASSED. The check is decorative.'); process.exit(1) }

console.log('\n── THE REAL STATE ─────────────────────────────────────────────────────────────────────')
const real = runCase('real', null)
console.log(`  WHATSAPP_LIVE = ${real.flag}`)
for (const r of real.rows) {
  console.log(`  row "${r.name}"  footnote ${r.footnote}  starter=${r.starter}  pro=${r.pro}  max=${r.max}`)
}
console.log(`  footnotes present: ${real.footnotes.join(', ')}`)
console.log(`  footnote 4: ${real.footnote4}`)
console.log(`  footnote 6: ${real.footnote6 === null ? 'absent ✓ (retired 16 September 2026)' : '🔴 ' + real.footnote6}`)
console.log(`  violations: ${real.violations.length === 0 ? 'none ✓' : '🔴 ' + JSON.stringify(real.violations)}`)

// ── CONTENT ASSERTIONS ON THE REAL STATE ────────────────────────────────────────────────────────────
const checks = []
const t = (name, cond) => checks.push([name, !!cond])
const wa = real.rows.find(r => r.name === 'WhatsApp auto-replies')
const mi = real.rows.find(r => r.name === 'Messenger & Instagram auto-replies')
t('flag is true', real.flag === true)
t('no parity violations', real.violations.length === 0)
t('WhatsApp row ticks pro', wa && wa.pro === true)
t('WhatsApp row ticks max', wa && wa.max === true)
t('🔴 WhatsApp row does NOT tick starter (canAccess denies it)', wa && wa.starter === false)
// ⚠️ THESE TWO WERE `footnote === '6'` AND `footnotes.includes('6')` UNTIL 16 September 2026. They are
// changed, not deleted: the same two facts are now asserted the other way round, and `footnoteChecks`
// below additionally asserts that footnote 6 is ABSENT — so the retired state cannot come back quietly.
t('WhatsApp row points at footnote 4', wa && wa.footnote === '4')
t('footnote 4 exists in the rendered list', real.footnotes.includes('4'))
t('🔴 Messenger & Instagram STILL coming_soon on pro', mi && mi.pro === 'coming_soon')
t('🔴 Messenger & Instagram STILL coming_soon on max', mi && mi.max === 'coming_soon')
// 🔴 THE SAME FUNCTION THAT JUDGED THE VARIANTS NOW JUDGES THE REAL CODE. One definition of the rule,
// applied to the broken trees and the real one — so a variant cannot be caught by a check the real state
// is never held to, and vice versa.
for (const [n, ok] of footnoteChecks(real, true)) t(n, ok)

// ── THE OFF STATE, RUN FOR REAL ─────────────────────────────────────────────────────────────────────
// A conditional string needs BOTH branches exercised.
const off = runCase('offstate', d => swap(d, WL, 'exports.WHATSAPP_LIVE = true', 'exports.WHATSAPP_LIVE = false'))
console.log(`\n  [flag false] footnote 4: ${off.footnote4}`)
console.log(`  [flag false] footnotes: ${off.footnotes.join(', ')}`)
for (const [n, ok] of footnoteChecks(off, false)) t('OFF-STATE · ' + n, ok)

console.log('\n── ASSERTIONS ─────────────────────────────────────────────────────────────────────────')
for (const [n, ok] of checks) console.log(`  ${ok ? '✓' : '🔴'} ${n}`)
const failed = checks.filter(([, ok]) => !ok)
console.log(`\n${failed.length ? '🔴 ' + failed.length + ' FAILED' : '✅ all ' + checks.length + ' passed'}`)
fs.rmSync(tmp, { recursive: true, force: true })
process.exit(failed.length ? 1 : 0)
