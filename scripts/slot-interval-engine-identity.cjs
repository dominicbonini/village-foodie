#!/usr/bin/env node
// scripts/slot-interval-engine-identity.cjs
//
// Proof that the CAPACITY ENGINE is byte-identical before and after the slot-interval build (D4).
//   node scripts/slot-interval-engine-identity.cjs
//
// 🔴 WHAT A FAILURE LOOKS LIKE: projectBackwardOccupancy / fitOrderBackward / earliestBackwardFitSlot
// produce a DIFFERENT map, tone, fit or slot for a §31 worked example than the same functions compiled
// from a clean checkout of HEAD. That would mean the build changed capacity, which it must never do.
//
// ── RE-SCOPED 17 September 2026 (the rolling batch fix) ─────────────────────────────────────────────
// fitOrderBackward and projectBackwardOccupancy are NO LONGER byte-identical to HEAD: their per-category
// batch check became ROLLING (categoryLoadOver). Their contract is now "identical OUTPUT on every
// ALIGNED fixture" (prep ≤ collection step), which scripts/batch-rolling-identity.cjs proves against the
// COMMITTED golden file scripts/fixtures/batch-rolling-golden.json (pre-fix baseline outputs: the §31
// examples, 300 Gusto-shaped states, a 20,000-state seeded 15/15 sweep, 240 seeded aligned cases and
// Gusto's six live events). The ten cases below are all aligned (prep 5 on a 5-minute grid, or prep 5 stored on a 15 grid),
// so the JSON comparison here STILL holds for them — it is kept as the fast local check. The other
// SEVEN symbols remain byte-identical and are asserted as bytes below — SIX since 18 September 2026:
// windowScopedPeak is output-identical (scripts/peak-ceiling-rule.cjs), not byte-identical.
//
// HOW: the engine is compiled TWICE — once from a `git worktree` of HEAD, once from the working tree —
// and run on identical FIXTURE inputs; the JSON outputs are compared byte for byte. Not "tsc-clean",
// not "the diff looked small": the same inputs through both binaries.

const path = require('path'); const fs = require('fs')
const { compile, headWorktree } = require('./_slot-interval-compile.cjs')
const REPO = path.resolve(__dirname, '..')
const FILES = ['lib/slot-availability.ts']

// 🔴 PINNED TO THE LAST PRE-FIX COMMIT, NOT HEAD (19 September 2026). This harness strips the two
// parameters the V13.5 work ADDED to earliestBackwardFitSlot and expects the rest to equal the old
// engine byte for byte. When that work was committed (5f70e07 "kitchen capacity"), HEAD stopped being
// the old engine and the comparison inverted — it started failing on a tree with no engine change at
// all. fc0fddc is the last commit before the V13.5 engine changes; the check means what it always did.
const PRE_FIX_ENGINE_COMMIT = 'fc0fddc'
const head = headWorktree('engine', PRE_FIX_ENGINE_COMMIT)
const A = compile(head.wt, FILES, 'engineHEAD').req('lib/slot-availability.js')
const B = compile(REPO, FILES, 'engineNOW').req('lib/slot-availability.js')

const times = (from, to, iv = 5) => { const o = []; for (let m = from; m <= to; m += iv) o.push({ collection_time: `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`, production_slot: `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}` }); return o }
const PIZZA = { pizza: { secs: 300, batch: 2 } }
const PIZZA_DESSERT = { pizza: { secs: 300, batch: 2 }, dessert: { secs: 300, batch: 3 } }
const PIZZA4 = { pizza: { secs: 300, batch: 4 } }
// Gusto-shaped: drinks have no prep but are TICKED to count toward the ceiling — the only load the
// ceiling's own cadence (capacity_window_mins) seats. Without such a case, a variant that took the
// cadence from the display interval would be invisible.
const GUSTO = { pizza: { secs: 300, batch: 2 }, drink: { secs: 0, batch: 1, countsToCapacity: true } }

// §31 worked examples, as FIXTURES. Each names its inputs; the OUTPUT is whatever the engine says.
const CASES = [
  ['§31 backward spread: 3 pizzas @17:05, batch 2, prep 5', { units: { '17:05': { pizza: 3 } }, cfg: PIZZA, start: 17*60, cap: null, cw: 5, order: { pizza: 1 }, slots: times(17*60, 17*60+30) }],
  ['§31 two ceilings: 2 pizzas + 2 desserts @17:05, cap 4', { units: { '17:05': { pizza: 2, dessert: 2 } }, cfg: PIZZA_DESSERT, start: 17*60, cap: 4, cw: 5, order: { pizza: 1 }, slots: times(17*60, 17*60+30) }],
  ['§31 kitchen ceiling: 2 pizzas + 3 desserts @17:05, cap 4 (over)', { units: { '17:05': { pizza: 2, dessert: 3 } }, cfg: PIZZA_DESSERT, start: 17*60, cap: 4, cw: 5, order: { dessert: 1 }, slots: times(17*60, 17*60+30) }],
  ['§31 pre-open pile: 6 pizzas @16:30 event start, batch 4', { units: { '16:30': { pizza: 6 } }, cfg: PIZZA4, start: 16*60+30, cap: null, cw: 5, order: { pizza: 2 }, slots: times(16*60+30, 17*60) }],
  ['§31 pile + later: 6 @16:30 and 8 @16:35, batch 4', { units: { '16:30': { pizza: 6 }, '16:35': { pizza: 8 } }, cfg: PIZZA4, start: 16*60+30, cap: null, cw: 5, order: { pizza: 1 }, slots: times(16*60+30, 17*60) }],
  ['§31 ready-around: 17:00 & 17:05 full, add 2 pizzas + 7 desserts, cap 4', { units: { '17:00': { pizza: 2, dessert: 2 }, '17:05': { pizza: 2, dessert: 2 } }, cfg: PIZZA_DESSERT, start: 17*60, cap: 4, cw: 5, order: { pizza: 2, dessert: 7 }, slots: times(17*60, 17*60+40) }],
  ['Gusto-shaped ceiling: 1 pizza + 3 ticked drinks @17:05, cap 2', { units: { '17:05': { pizza: 1, drink: 3 } }, cfg: GUSTO, start: 17*60, cap: 2, cw: 5, order: { drink: 1 }, slots: times(17*60, 17*60+30) }],
  ['Gusto-shaped, cap 2, ticked drinks @17:00 and @17:05', { units: { '17:00': { drink: 2 }, '17:05': { pizza: 2, drink: 2 } }, cfg: GUSTO, start: 17*60, cap: 2, cw: 5, order: { pizza: 1 }, slots: times(17*60, 17*60+30) }],
  ['C1 fixture: 3 pizzas @18:10, batch 2', { units: { '18:10': { pizza: 3 } }, cfg: PIZZA, start: 18*60, cap: null, cw: 5, order: { pizza: 1 }, slots: times(18*60, 18*60+30) }],
  ['off-grid stored key 18:05 with a 15 grid', { units: { '18:05': { pizza: 3 } }, cfg: PIZZA, start: 18*60, cap: null, cw: 5, order: { pizza: 1 }, slots: times(18*60, 18*60+45, 15) }],
]
const mapToObj = (m) => Object.fromEntries([...m.entries()].map(([k, v]) => [k, v]))
function run(E, c, stepFromInterval) {
  const cw = stepFromInterval ? 15 : c.cw   // the broken variant: capacity cadence taken from the display interval
  const back = E.projectBackwardOccupancy(c.units, c.cfg, c.start, c.cap, cw)
  const fit = E.fitOrderBackward(back, c.start + 10, c.order, c.cfg, c.cap, c.start, cw, Number.NEGATIVE_INFINITY, {})
  const asap = E.earliestBackwardFitSlot(c.slots, c.units, c.cfg, c.cap, c.start, c.order, Number.NEGATIVE_INFINITY, cw, Number.NEGATIVE_INFINITY)
  // 🔴 `why` IS STRIPPED, AND ONLY `why` (18 September 2026). fitOrderBackward gained a purely
  // descriptive `why` for the Add Order popup; HEAD predates it, so comparing raw results would report
  // a difference that is not a behaviour change. Every field HEAD had is still compared byte for byte,
  // and scripts/batch-rolling-identity.cjs separately asserts `why` is the ONLY key that appeared.
  const { why, ...fitFields } = fit
  void why
  return JSON.stringify({ byStart: mapToObj(back.byStart), pile: mapToObj(back.pileByStart), cantFit: back.cantFit, batchByCat: back.batchByCat, fit: fitFields, asap, step: E.backwardWindowStepMins(c.cfg) })
}

console.log('── BROKEN VARIANT: MUST report FAILURE ──────────────────────────────────────────────────')
{
  let diff = 0
  for (const [label, c] of CASES) if (run(A, c, false) !== run(B, c, true)) diff++
  console.log(`  ${diff > 0 ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 the engine's cadence taken from the display interval (15) — ${diff}/${CASES.length} cases differ`)
  if (diff === 0) { head.remove(); process.exit(1) }
}

console.log('\n── HEAD vs WORKING TREE, identical FIXTURE inputs ───────────────────────────────────────')
let fails = 0
for (const [label, c] of CASES) {
  const a = run(A, c, false), b = run(B, c, false)
  const same = a === b
  if (!same) fails++
  console.log(`  ${same ? '✓' : '🔴'} ${label}  (${a.length} bytes${same ? ', identical' : ' vs ' + b.length})`)
}
// ── THE SEVEN BYTE-IDENTICAL SYMBOLS (the two rolling ones are output-identical instead) ──────────
{
  const { execFileSync } = require('child_process')
  const body = (src, name) => {
    const m = src.match(new RegExp('^(?:export )?(?:async )?function ' + name + '\\b', 'm')); if (!m) return null
    let depth = 0, started = false
    for (let j = m.index; j < src.length; j++) { if (src[j] === '{') { depth++; started = true } else if (src[j] === '}') { depth--; if (started && depth === 0) return src.slice(m.index, j + 1) } }
    return null
  }
  // ── RE-SCOPED AGAIN, 18 September 2026 (batch reservations P1) ─────────────────────────────────
  // earliestBackwardFitSlot gained ONE optional trailing parameter, `reservations`, forwarded to
  // projectBackwardOccupancy and defaulting to []. Its walk is unchanged and its OUTPUT is compared
  // against HEAD on the ten cases above; its BYTES are compared below with that one parameter removed,
  // so any other edit to it still fails here. The remaining six symbols stay byte-identical.
  // ── RE-SCOPED, 18 September 2026 (the peak ceiling) ────────────────────────────────────────────
  // windowScopedPeak's BODY now delegates to peakLoadOver — the one implementation every ceiling and
  // batch reader shares — so its bytes differ from HEAD. Its OUTPUT is unchanged: scripts/peak-ceiling-
  // rule.cjs compiles the old body verbatim and proves 21,520 verdicts (fits, tone, bound_by, why) identical.
  // The remaining five symbols stay byte-identical here.
  const SEVEN = [['lib/slot-availability.ts', ['backwardWindowStepMins', 'loadRunsOffFront', 'placeInstantPoints']], ['lib/slot-bookings.ts', ['buildUnitsFromOrders', 'rebuildProductionSlotUsage']]]
  {
    // Same pinned commit as the worktree above — the byte comparison read `HEAD:` directly and so did not
    // follow the pin, which is how it kept failing after HEAD moved onto the committed engine work.
    const headSrc = execFileSync('git', ['show', `${PRE_FIX_ENGINE_COMMIT}:lib/slot-availability.ts`], { cwd: REPO }).toString(), nowSrc = fs.readFileSync(path.join(REPO, 'lib/slot-availability.ts'), 'utf8')
    const a = body(headSrc, 'earliestBackwardFitSlot'), b = body(nowSrc, 'earliestBackwardFitSlot')
    // P1 added `reservations`; P3 added `batchReservations` (forwarded to the projection AND the fit).
    const stripped = b && b
      .replace(/\n  \/\/ P1: forwarded to the projection; empty ⇒ today's walk exactly\.\n  reservations: EngineReservation\[\] = \[\],/, '')
      .replace(/\n  batchReservations: boolean = false,/, '')
      .replace(/, capacityWindowMins, reservations, batchReservations\)/, ', capacityWindowMins)')
      .replace(/ \|\| \{\}, batchReservations\)\.fits\)/, ' || {}).fits)')
    const ok = !!a && stripped === a; if (!ok) fails++
    console.log(`  ${ok ? '✓ byte-identical up to the two added parameters' : '🔴 DIFFERS beyond the two added parameters'}  lib/slot-availability.ts::earliestBackwardFitSlot`)
  }
  for (const [f, names] of SEVEN) {
    const headSrc = execFileSync('git', ['show', 'HEAD:' + f], { cwd: REPO }).toString(), nowSrc = fs.readFileSync(path.join(REPO, f), 'utf8')
    for (const n of names) { const a = body(headSrc, n), b = body(nowSrc, n); const ok = !!a && a === b; if (!ok) fails++; console.log(`  ${ok ? '✓ byte-identical' : '🔴 DIFFERS'}  ${f}::${n}`) }
  }
  const nowSrc = fs.readFileSync(path.join(REPO, 'lib/slot-availability.ts'), 'utf8')
  const pileBlock = nowSrc.slice(nowSrc.indexOf('const pileByStart = new Map'), nowSrc.indexOf('return { windows, byStart, pileByStart'))
  const headSrc = execFileSync('git', ['show', 'HEAD:lib/slot-availability.ts'], { cwd: REPO }).toString()
  const headPile = headSrc.slice(headSrc.indexOf('const pileByStart = new Map'), headSrc.indexOf('return { windows, byStart, pileByStart'))
  const pileOk = pileBlock === headPile; if (!pileOk) fails++
  console.log(`  ${pileOk ? '✓ byte-identical' : '🔴 DIFFERS'}  pileByStart's construction`)
  console.log('  ℹ fitOrderBackward / projectBackwardOccupancy: output-identical on aligned fixtures — see scripts/batch-rolling-identity.cjs')
}
// The frozen §31 facts, asserted on the NEW build too — so identity is not identity-with-a-shared-bug.
const b1 = B.projectBackwardOccupancy({ '17:05': { pizza: 3 } }, PIZZA, 17*60, null, 5)
const w1700 = b1.byStart.get(17*60), w1655 = b1.byStart.get(16*60+55)
const okSpread = w1655 && Math.round(w1655.byCat.pizza) === 2 && w1655.tone === 'red' && w1700 && Math.round(w1700.byCat.pizza) === 1 && w1700.tone === 'amber'
console.log(`  ${okSpread ? '✓' : '🔴'} §31 spread holds on the new build: window→17:00 = 2 pizzas RED, window→17:05 = 1 pizza AMBER`)
if (!okSpread) fails++
const b2 = B.projectBackwardOccupancy({ '16:30': { pizza: 6 } }, PIZZA4, 16*60+30, null, 5)
const pile = b2.pileByStart.get(16*60+30)
const okPile = pile && Math.round(pile.total) === 6 && pile.tone === 'red' && pile.bound_by === 'over capacity at event-start'
console.log(`  ${okPile ? '✓' : '🔴'} §31 pile holds on the new build: 16:30 = 6, RED, "over capacity at event-start"`)
if (!okPile) fails++
head.remove()
console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ engine byte-identical on all ' + CASES.length + ' cases; §31 facts hold'}`)
process.exit(fails ? 1 : 0)
