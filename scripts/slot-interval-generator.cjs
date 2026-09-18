#!/usr/bin/env node
// scripts/slot-interval-generator.cjs
//
// Proof for the clock-anchored grid (lib/slot-generation.ts) and the customer fallback picker's minutes.
//   node scripts/slot-interval-generator.cjs
//
// 🔴 WHAT A FAILURE LOOKS LIKE: at interval 5, the new generator emits a DIFFERENT list from HEAD's for
// some start/end/grace — which would change what every 5-minute truck (Gusto) offers. Or at 15, a time
// that is not a clock multiple (a 17:50 start yielding 17:50 rather than 18:00). Or the customer
// fallback picker's minute list disagreeing with the server's grid — the V11.15 outage class.
//
// 🔴 THE ORACLE IS A FROZEN COPY OF HEAD'S GENERATOR, kept verbatim below. Do not "tidy" it to call the
// new function; if the two agree only because the oracle was rewritten, this harness proves nothing.
//
// ⚠️ It compiles the TypeScript with the repo's own tsc — this repo has no test framework. Same alias
// hook as scripts/whatsapp-*.cjs, because tsc leaves `@/` in the emitted require() calls.

const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const REPO = path.resolve(__dirname, '..')
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'slot-gen-'))
const cfg = path.join(out, 'tsconfig.json')
fs.writeFileSync(cfg, JSON.stringify({
  compilerOptions: {
    module: 'commonjs', target: 'es2020', outDir: out, rootDir: REPO, skipLibCheck: true,
    esModuleInterop: true, moduleResolution: 'node', baseUrl: REPO, paths: { '@/*': ['./*'] },
    types: ['node'], typeRoots: [path.join(REPO, 'node_modules/@types')],
  },
  files: [path.join(REPO, 'lib/slot-generation.ts')],
}))
try { execFileSync(path.join(REPO, 'node_modules/.bin/tsc'), ['-p', cfg], { stdio: 'pipe' }) }
catch (e) { console.log('🔴 COMPILE FAILED:\n' + (e.stdout ? e.stdout.toString() : e.message)); process.exit(1) }
const Module = require('module')
const realResolve = Module._resolveFilename
Module._resolveFilename = function (req, ...rest) {
  if (req.startsWith('@/')) return realResolve.call(this, path.join(out, req.slice(2)), ...rest)
  return realResolve.call(this, req, ...rest)
}
const GEN = require(path.join(out, 'lib/slot-generation.js'))

// ── THE ORACLE: HEAD's generateCollectionTimes, frozen verbatim (start-anchored) ───────────────────
const toMins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const toStr = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
function generateCollectionTimesHEAD(startTime, endTime, intervalMins, slotDurationMins, graceAfterEndMins = 0) {
  const start = toMins(startTime), end = toMins(endTime), result = []
  for (let mins = start; mins <= end + graceAfterEndMins; mins += intervalMins) {
    const prodMins = Math.floor(mins / slotDurationMins) * slotDurationMins
    result.push({ collection_time: toStr(mins), production_slot: toStr(prodMins) })
  }
  return result
}
// The OLD hardcoded customer minute list, frozen.
const MINUTES_HEAD = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']

/** The fallback picker's list for an event, exactly as the page composes it: hours start→end, minutes
 *  from the minute list, first hour narrowed ≥ startM, last hour narrowed ≤ endM. */
function fallbackList(minuteList, start, end) {
  const [sH, sM] = start.split(':').map(Number); const [eH, eM] = end.split(':').map(Number)
  const outL = []
  for (let h = sH; h <= eH; h++) {
    for (const m of minuteList) {
      const mm = Number(m)
      if (h === sH && mm < sM) continue
      if (h === eH && mm > eM) continue
      outL.push(`${String(h).padStart(2, '0')}:${m}`)
    }
  }
  return outL
}

function runSuite(impl) {
  const ok = [], fails = []
  const t = (n, c) => (c ? ok : fails).push(n)
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

  // ── 1. AT 5, IDENTICAL TO HEAD for every start 00:00–23:55, several ends incl. 23:59, grace 30 ────
  let compared = 0, mismatches = 0, firstMismatch = null
  const ENDS = ['12:00', '17:59', '20:00', '22:30', '23:59']
  for (let s = 0; s < 24 * 60; s += 5) {
    const start = toStr(s)
    for (const end of ENDS) {
      if (toMins(end) < s) continue
      for (const dur of [5, 10]) {
        for (const grace of [0, 30]) {
          compared++
          const a = impl.generate(start, end, 5, dur, grace), b = generateCollectionTimesHEAD(start, end, 5, dur, grace)
          if (!eq(a, b)) { mismatches++; if (!firstMismatch) firstMismatch = `${start}→${end} dur ${dur} grace ${grace}` }
        }
      }
    }
  }
  t(`🔴 at interval 5: IDENTICAL to HEAD over ${compared} FIXTURE (start,end,dur,grace) combos${mismatches ? ` — ${mismatches} differ, first ${firstMismatch}` : ''}`, mismatches === 0)

  // ── 2. CLOCK ANCHORING at 10/15/20/30 ─────────────────────────────────────────────────────────────
  const times = (r) => r.map(x => x.collection_time)
  t('17:50 start at 15 → 18:00, 18:15, 18:30 … (never 17:50)', eq(times(impl.generate('17:50', '18:45', 15, 10, 0)), ['18:00', '18:15', '18:30', '18:45']))
  t('12:05 start at 15 → 12:15 first', times(impl.generate('12:05', '13:00', 15, 10, 0))[0] === '12:15')
  t('16:35 start at 15 → 16:45 first', times(impl.generate('16:35', '17:30', 15, 10, 0))[0] === '16:45')
  t('12:00 start at 15 → 12:00 first (already a multiple)', times(impl.generate('12:00', '12:45', 15, 10, 0))[0] === '12:00')
  for (const iv of [10, 15, 20, 30]) {
    const all = times(impl.generate('17:50', '21:00', iv, 10, 30))
    t(`every time at ${iv} is a clock multiple of ${iv}`, all.every(x => toMins(x) % iv === 0))
    t(`no time at ${iv} precedes the start`, all.every(x => toMins(x) >= toMins('17:50')))
  }
  // grace stays in MINUTES beyond the end, on the interval
  t('grace 30 at 15 with end 20:00 → last time 20:30', times(impl.generate('17:00', '20:00', 15, 10, 30)).slice(-1)[0] === '20:30')
  t('grace 30 at 15 with end 20:10 → last time 20:30 (20:40 > 20:10+30)', times(impl.generate('17:00', '20:10', 15, 10, 30)).slice(-1)[0] === '20:30')
  // production_slot derivation unchanged (floor to slot_duration)
  const r15 = impl.generate('18:00', '18:30', 15, 10, 0)
  t('production_slot still floors to slot_duration_mins (18:15 → 18:10)', r15.find(x => x.collection_time === '18:15')?.production_slot === '18:10')

  // ── 3. THE FALLBACK PICKER EQUALS THE SERVER at 5 and 15 ──────────────────────────────────────────
  for (const [iv, start, end] of [[5, '12:00', '14:00'], [5, '12:05', '14:00'], [5, '16:35', '18:00'], [15, '12:00', '14:00'], [15, '12:05', '14:00'], [15, '16:35', '18:00'], [15, '17:50', '19:00']]) {
    const server = times(impl.generate(start, end, iv, 10, 0))
    const picker = fallbackList(impl.minutes(iv), start, end)
    t(`fallback picker == server grid at ${iv}, ${start}→${end}`, eq(server, picker))
  }
  return { ok, fails }
}

const REAL = { generate: GEN.generateCollectionTimes, minutes: GEN.clockGridMinutes }
const VARIANTS = [
  ['V1', 'event-start anchoring (HEAD\'s walk) at every interval', { generate: generateCollectionTimesHEAD, minutes: GEN.clockGridMinutes }],
  ['V2', 'the old hardcoded 5-minute MINUTES list as the picker\'s minutes', { generate: GEN.generateCollectionTimes, minutes: () => MINUTES_HEAD }],
]
console.log('── BROKEN VARIANTS: each MUST report FAILURE ────────────────────────────────────────────')
let allFailed = true
for (const [k, label, impl] of VARIANTS) {
  const r = runSuite(impl)
  const detected = r.fails.length > 0
  if (!detected) allFailed = false
  console.log(`  ${detected ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  ${k} ${label}`)
  for (const f of r.fails.slice(0, 3)) console.log(`        caught: ${f}`)
}
if (!allFailed) { console.log('\n🔴 A VARIANT PASSED.'); process.exit(1) }

console.log('\n── THE REAL CODE ───────────────────────────────────────────────────────────────────────')
const r = runSuite(REAL)
for (const n of r.ok) console.log('  ✓ ' + n)
for (const n of r.fails) console.log('  🔴 ' + n)
console.log(`\n${r.fails.length ? '🔴 ' + r.fails.length + ' FAILED' : '✅ all ' + r.ok.length + ' passed'}`)
fs.rmSync(out, { recursive: true, force: true })
process.exit(r.fails.length ? 1 : 0)
