#!/usr/bin/env node
// scripts/slot-interval-generator.cjs
//
// Proof for the START-ANCHORED grid (lib/slot-generation.ts; collection-anchor-1, 12 November 2026 — it was clock-anchored
// from 16 September to 12 November).
//   node scripts/slot-interval-generator.cjs
//
// 🔴 WHAT A FAILURE LOOKS LIKE: at any interval, the generator emits a DIFFERENT list from the frozen start-anchored walk for
// some start/end/grace — a time that is not the start + a multiple of the interval (a 19:00 start at 45 yielding 19:15), or
// a first time that is not the start. The customer page's backup picker builds from this same function (it has no list of
// its own any more), so the picker ≡ server proof lives in scripts/longer-intervals-1.cjs and slot-interval-grid-routing.cjs.
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
function runSuite(impl) {
  const ok = [], fails = []
  const t = (n, c) => (c ? ok : fails).push(n)
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

  // ── 1. ⚠️ RE-PINNED (collection-anchor-1, 12 November 2026): the grid is START-ANCHORED again at EVERY interval, which
  //    is exactly the frozen walk above — so it must be IDENTICAL to it for every interval, every start 00:00–23:55 (on and off
  //    the interval), several ends incl. 23:59, two durations and grace 0/30. (Until today this held at 5 only.)
  let compared = 0, mismatches = 0, firstMismatch = null
  const ENDS = ['12:00', '17:59', '20:00', '22:30', '23:59']
  for (const iv of [5, 10, 15, 20, 30, 45, 60]) {
    for (let s = 0; s < 24 * 60; s += 5) {
      const start = toStr(s)
      for (const end of ENDS) {
        if (toMins(end) < s) continue
        for (const dur of [5, 10]) {
          for (const grace of [0, 30]) {
            compared++
            const a = impl.generate(start, end, iv, dur, grace), b = generateCollectionTimesHEAD(start, end, iv, dur, grace)
            if (!eq(a, b)) { mismatches++; if (!firstMismatch) firstMismatch = `${iv} ${start}→${end} dur ${dur} grace ${grace}` }
          }
        }
      }
    }
  }
  t(`🔴 every interval: IDENTICAL to the start-anchored walk over ${compared} (interval,start,end,dur,grace) combos${mismatches ? ` — ${mismatches} differ, first ${firstMismatch}` : ''}`, mismatches === 0)

  // ── 2. START ANCHORING, by example ────────────────────────────────────────────────────────────────
  const times = (r) => r.map(x => x.collection_time)
  t('19:00 start at 45 → 19:00, 19:45, 20:30, 21:15 (the brief\'s example)', eq(times(impl.generate('19:00', '21:30', 45, 45, 0)), ['19:00', '19:45', '20:30', '21:15']))
  t('17:50 start at 15 → 17:50, 18:05, 18:20 … (the start itself first)', eq(times(impl.generate('17:50', '18:35', 15, 10, 0)), ['17:50', '18:05', '18:20', '18:35']))
  t('17:10 start at 15 → 17:10 first', times(impl.generate('17:10', '18:00', 15, 10, 0))[0] === '17:10')
  t('19:45 start at 60 → 19:45, 20:45', eq(times(impl.generate('19:45', '21:00', 60, 60, 0)), ['19:45', '20:45']))
  t('12:00 start at 15 → the clock list it always gave (a start on a multiple)', eq(times(impl.generate('12:00', '12:45', 15, 10, 0)), ['12:00', '12:15', '12:30', '12:45']))
  for (const iv of [10, 15, 20, 30, 45, 60]) {
    const all = times(impl.generate('17:50', '21:00', iv, 10, 30))
    t(`every time at ${iv} is the start + a multiple of ${iv}`, all.every(x => (toMins(x) - toMins('17:50')) % iv === 0))
    t(`no time at ${iv} precedes the start, and the first IS the start`, all[0] === '17:50' && all.every(x => toMins(x) >= toMins('17:50')))
  }
  // grace stays in MINUTES beyond the end, on the interval
  t('grace 30 at 15 with end 20:00 → last time 20:30', times(impl.generate('17:00', '20:00', 15, 10, 30)).slice(-1)[0] === '20:30')
  t('grace 30 at 15, start 17:10, end 20:10 → last time 20:40 (on the start\'s grid)', times(impl.generate('17:10', '20:10', 15, 10, 30)).slice(-1)[0] === '20:40')
  // production_slot derivation unchanged (floor to slot_duration)
  const r15 = impl.generate('18:00', '18:30', 15, 10, 0)
  t('production_slot still floors to slot_duration_mins (18:15 → 18:10)', r15.find(x => x.collection_time === '18:15')?.production_slot === '18:10')
  // the one rounding helper (the seeder, the order page's estimate)
  if (impl.first) {
    t('firstGridTimeAtOrAfter: before the start → the start; on the grid → itself; between → the next', impl.first(1030, 1000, 15) === 1030 && impl.first(1030, 1045, 15) === 1045 && impl.first(1030, 1046, 15) === 1060)
  }
  return { ok, fails }
}

const REAL = { generate: GEN.generateCollectionTimes, first: GEN.firstGridTimeAtOrAfter }
// The old D1 rule — multiples of the interval from MIDNIGHT — kept here only as the variant that must fail.
function generateClockAnchored(startTime, endTime, intervalMins, slotDurationMins, graceAfterEndMins = 0) {
  const start = toMins(startTime), end = toMins(endTime), result = []
  for (let mins = Math.ceil(start / intervalMins) * intervalMins; mins <= end + graceAfterEndMins; mins += intervalMins) {
    const prodMins = Math.floor(mins / slotDurationMins) * slotDurationMins
    result.push({ collection_time: toStr(mins), production_slot: toStr(prodMins) })
  }
  return result
}
const VARIANTS = [
  ['V1', 'clock anchoring from midnight (the old D1 rule)', { generate: generateClockAnchored }],
  ['V2', 'a walk that starts one interval after the start', { generate: (s, e, iv, d, g) => generateCollectionTimesHEAD(toStr(toMins(s) + iv), e, iv, d, g) }],
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
