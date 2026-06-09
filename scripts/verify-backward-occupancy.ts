// scripts/verify-backward-occupancy.ts
// STAGE 1 verification harness for projectBackwardOccupancy (capacity model rewrite —
// backward cohort attribution). Proves the per-window occupancy map against known
// scenarios BEFORE any consumer trusts it. No consumer changes; nothing in the live app
// uses projectBackwardOccupancy yet.
//
// Run:  npx tsx scripts/verify-backward-occupancy.ts
//
// Each case feeds a KNOWN productionSlotUnits (the stored per-collection-bucket aggregate)
// into projectBackwardOccupancy and asserts the resulting per-(window,category) load and
// the run-off-front flags. Pizza: batch 4, prep 5min throughout.

import {
  projectBackwardOccupancy,
  type BackwardOccupancy,
} from '@/lib/slot-availability'
import type { CatConfig } from '@/lib/prep-utils'

const PIZZA: Record<string, CatConfig> = { pizza: { secs: 300, batch: 4 } } // 5-min prep, batch 4

const toMins = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

let failures = 0
const fails: string[] = []

/** Assert the per-(window,cat) load map. `expected` keyed by "HH:MM" → { cat: items }. */
function assertMap(
  name: string,
  occ: BackwardOccupancy,
  expected: Record<string, Record<string, number>>,
) {
  const actual: Record<string, Record<string, number>> = {}
  for (const w of occ.windows) actual[w.start] = w.byCat

  const expKeys = Object.keys(expected).sort()
  const actKeys = occ.windows.map(w => w.start).sort()
  let ok = JSON.stringify(expKeys) === JSON.stringify(actKeys)
  if (ok) {
    for (const k of expKeys) {
      if (JSON.stringify(expected[k]) !== JSON.stringify(actual[k])) { ok = false; break }
    }
  }
  printCase(name, occ, ok, JSON.stringify(expected))
  if (!ok) { failures++; fails.push(name) }
}

function printCase(name: string, occ: BackwardOccupancy, ok: boolean, expectedNote?: string) {
  console.log(`\n${ok ? '✅' : '❌'} ${name}`)
  if (expectedNote) console.log(`   expected: ${expectedNote}`)
  console.log('   per-window load (start → byCat | spare/cat | total | beforeStart):')
  if (!occ.windows.length) console.log('     (no windows)')
  for (const w of occ.windows) {
    const spare = Object.entries(w.remainingByCat).map(([c, r]) => `${c} ${r}`).join(', ')
    console.log(
      `     ${w.start}  ${JSON.stringify(w.byCat)}  spare:[${spare}]  total:${w.total}` +
      `  remTotal:${w.remainingTotal === Infinity ? '∞' : w.remainingTotal}` +
      (w.beforeEventStart ? '  ⚠BEFORE-START' : ''),
    )
  }
  if (occ.cantFit.length) {
    console.log('   cantFit:')
    for (const f of occ.cantFit) {
      console.log(`     ${f.productionSlot} ${f.cat} x${f.qty} → needs window @${f.earliestWindowMins}m < start ${f.eventStartMins}m`)
    }
  }
}

function expect(name: string, cond: boolean, detail: string) {
  const ok = cond
  console.log(`   ${ok ? '✅' : '❌'} ${detail}`)
  if (!ok) { failures++; fails.push(`${name}: ${detail}`) }
}

const START = toMins('17:00') // generous event start for cases 1-4,6,7a

// ── Case 1: 1 pizza @ 19:00 → {18:55: pizza 1} ──────────────────────────────
assertMap('Case 1 — 1 pizza @ 19:00',
  projectBackwardOccupancy({ '19:00': { pizza: 1 } }, PIZZA, START, null),
  { '18:55': { pizza: 1 } },
)

// ── Case 2: 10 pizzas @ 19:00 → {18:45:4, 18:50:4, 18:55:2}; spare 18:55 = 2 ─
{
  const occ = projectBackwardOccupancy({ '19:00': { pizza: 10 } }, PIZZA, START, 6)
  assertMap('Case 2 — 10 pizzas @ 19:00', occ,
    { '18:45': { pizza: 4 }, '18:50': { pizza: 4 }, '18:55': { pizza: 2 } })
  const w1855 = occ.byStart.get(toMins('18:55'))!
  expect('Case 2', w1855.remainingByCat.pizza === 2, `spare @18:55 = 2 (got ${w1855.remainingByCat.pizza})`)
  expect('Case 2', !occ.byStart.has(toMins('19:00')), '19:00 window is free (no load)')
}

// ── Case 3: 4 pizzas @ 19:00 → {18:55:4}; spare 18:55 = 0; only ONE window ──
{
  const occ = projectBackwardOccupancy({ '19:00': { pizza: 4 } }, PIZZA, START, null)
  assertMap('Case 3 — 4 pizzas @ 19:00', occ, { '18:55': { pizza: 4 } })
  const w1855 = occ.byStart.get(toMins('18:55'))!
  expect('Case 3', w1855.remainingByCat.pizza === 0, `spare @18:55 = 0 (got ${w1855.remainingByCat.pizza})`)
  expect('Case 3', occ.windows.length === 1, `exactly one window (got ${occ.windows.length})`)
  expect('Case 3', !occ.byStart.has(toMins('18:50')), '18:50 untouched (full batch free)')
}

// ── Case 4: 4 @ 19:00 + 4 @ 19:05 (distinct buckets) seat into own windows ──
{
  const occ = projectBackwardOccupancy({ '19:00': { pizza: 4 }, '19:05': { pizza: 4 } }, PIZZA, START, null)
  assertMap('Case 4 — 4 @ 19:00 + 4 @ 19:05', occ,
    { '18:55': { pizza: 4 }, '19:00': { pizza: 4 } })
  expect('Case 4', occ.byStart.get(toMins('18:55'))!.remainingByCat.pizza === 0, 'spare @18:55 = 0')
  expect('Case 4', occ.byStart.get(toMins('19:00'))!.remainingByCat.pizza === 0, 'spare @19:00 = 0')
}

// ── Case 5: run-off-front — 10 pizzas @ 17:05, event start 17:00 → FLAGGED ──
{
  const occ = projectBackwardOccupancy({ '17:05': { pizza: 10 } }, PIZZA, toMins('17:00'), null)
  printCase('Case 5 — 10 pizzas @ 17:05, start 17:00 (run-off-front)', occ, occ.cantFit.length > 0)
  // ceil(10/4)=3 windows back from 17:05 → 16:50, 16:55, 17:00; 16:50 & 16:55 < 17:00.
  expect('Case 5', occ.cantFit.length === 1, `one cantFit flag (got ${occ.cantFit.length})`)
  expect('Case 5', occ.cantFit[0]?.earliestWindowMins === toMins('16:50'),
    `earliest needed window = 16:50 (got ${occ.cantFit[0]?.earliestWindowMins})`)
  expect('Case 5', occ.windows.some(w => w.beforeEventStart), 'at least one window flagged beforeEventStart')
}

// ── Case 6a: literal "two 6-pizza @ 19:00" — aggregates to 12, spreads CLEAN ─
// (Documented: same-bucket orders sum, so 12 → 3 full windows; no false over-full.)
{
  const occ = projectBackwardOccupancy({ '19:00': { pizza: 12 } }, PIZZA, START, null)
  assertMap('Case 6a — two 6-pizza @ 19:00 (aggregate 12, clean 3-window spread)', occ,
    { '18:45': { pizza: 4 }, '18:50': { pizza: 4 }, '18:55': { pizza: 4 } })
  expect('Case 6a', occ.windows.every(w => w.remainingByCat.pizza === 0), 'all three windows exactly full (no over-full)')
}

// ── Case 6b: HONEST over-subscription via overlapping buckets (override) ─────
// 6 @ 19:00 → {18:50:4, 18:55:2}; 6 @ 19:05 → {18:55:4, 19:00:2}. 18:55 = 6 > batch 4,
// shown honestly over-full, NOT re-packed.
{
  const occ = projectBackwardOccupancy({ '19:00': { pizza: 6 }, '19:05': { pizza: 6 } }, PIZZA, START, 4)
  assertMap('Case 6b — over-subscription 6@19:00 + 6@19:05 (honest over-full, no re-pack)', occ,
    { '18:50': { pizza: 4 }, '18:55': { pizza: 6 }, '19:00': { pizza: 2 } })
  const w1855 = occ.byStart.get(toMins('18:55'))!
  expect('Case 6b', w1855.byCat.pizza === 6, `18:55 honestly shows 6 (got ${w1855.byCat.pizza})`)
  expect('Case 6b', w1855.remainingByCat.pizza === -2, `18:55 spare = −2 (over-full, got ${w1855.remainingByCat.pizza})`)
  expect('Case 6b', w1855.remainingTotal === -2, `18:55 ceiling remainder = −2 (got ${w1855.remainingTotal})`)
}

// ── Case 7: scale — 1000 pizzas @ 19:00 → 250 windows, run-off-front flagged ─
{
  const t0 = Date.now()
  const occ = projectBackwardOccupancy({ '19:00': { pizza: 1000 } }, PIZZA, START, null)
  const ms = Date.now() - t0
  console.log(`\n${occ.windows.length === 250 ? '✅' : '❌'} Case 7 — 1000 pizzas @ 19:00 (scale)`)
  console.log(`   windows: ${occ.windows.length}  computed in ${ms}ms  cantFit: ${occ.cantFit.length}`)
  console.log(`   earliest window: ${occ.windows[0]?.start} (@${occ.windows[0]?.startMins}m)  latest: ${occ.windows[occ.windows.length - 1]?.start}`)
  const totalItems = occ.windows.reduce((s, w) => s + w.total, 0)
  expect('Case 7', occ.windows.length === 250, `250 windows (got ${occ.windows.length})`)
  expect('Case 7', totalItems === 1000, `load sums to 1000 (got ${totalItems})`)
  expect('Case 7', occ.cantFit.length === 1, 'flagged run-off-front (needs windows before 17:00)')
  expect('Case 7', ms < 1000, `no perf explosion (<1s, took ${ms}ms)`)
}

// ── Summary ─────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(60))
if (failures === 0) {
  console.log('✅ ALL CASES PASS — backward occupancy map verified.')
  process.exit(0)
} else {
  console.log(`❌ ${failures} assertion(s) FAILED:`)
  for (const f of fails) console.log(`   - ${f}`)
  process.exit(1)
}
