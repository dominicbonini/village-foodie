// scripts/verify-ceiling-mixed.ts
// STAGE A — no-prep-ticked categories count toward the SHARED kitchen_capacity ceiling.
// Prep-bearing (Pizza) behaviour is unchanged; a ticked no-prep category (Sides) contributes
// its items to the COLLECTION-ADJACENT window's total (ceiling-only — no backward windows, no
// per-category tone, no run-off-front). Unticked no-prep contributes nothing.
//
// Run:  npx tsx scripts/verify-ceiling-mixed.ts

import { projectBackwardOccupancy, fitOrderBackward } from '@/lib/slot-availability'
import type { CatConfig } from '@/lib/prep-utils'

const EVENT_START = 17 * 60
const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
// Pizza: 5-min prep, batch 4 (prep-bearing). Sides: instant (secs 0), ticked → counts to ceiling.
const PIZZA_SIDES_TICKED: Record<string, CatConfig> = {
  pizza: { secs: 300, batch: 4 },
  sides: { secs: 0, batch: 1, countsToCapacity: true },
}
const PIZZA_SIDES_UNTICKED: Record<string, CatConfig> = {
  pizza: { secs: 300, batch: 4 },
  sides: { secs: 0, batch: 1, countsToCapacity: false },
}
const CAP = 6

let failures = 0
const ok = (label: string, cond: boolean, got = '') => {
  console.log(`   ${cond ? '✅' : '❌'} ${label}${got ? `  →  ${got}` : ''}`)
  if (!cond) failures++
}

// Pizza @19:00 (batch 4, prep 5) seats its remainder window at 18:55 (= 19:00 − step). Sides
// @19:00 (ticked) land at 19:00 − step(5) = 18:55 too → they share the 18:55 ceiling window.
function winAt(stored: Record<string, Record<string, number>>, cfgs: Record<string, CatConfig>, hhmm: string) {
  const back = projectBackwardOccupancy(stored, cfgs, EVENT_START, CAP)
  return back.byStart.get(toMins(hhmm)) ?? null
}

// ── TEST 1 — 4 pizzas + 2 sides = 6 → ceiling full (red); 1 side = 5 → 1 spare ──
console.log('\nTEST 1 — 4 pizzas + sides share the ceiling (cap 6):')
{
  // 4 pizzas @19:00 (1 batch → window 18:55 = pizza 4) + 2 sides @19:00 (→ 18:55).
  const w = winAt({ '19:00': { pizza: 4, sides: 2 } }, PIZZA_SIDES_TICKED, '18:55')!
  ok('18:55 total = 6 (4 pizza + 2 sides)', w.total === 6, `total=${w.total} byCat=${JSON.stringify(w.byCat)}`)
  ok('18:55 ceiling RED (full)', w.tone === 'red' && w.bound_by === 'global ceiling', `${w.tone} "${w.bound_by}"`)
  ok('NO per-category "Sides x/y" tone', !String(w.bound_by).toLowerCase().includes('sides'), `bound_by=${w.bound_by}`)

  // 4 pizza + 1 side = total 5: the side IS counted, the CEILING is not yet hit (5<6). The
  // window is still red because the PIZZA batch is full (4/4) — a per-category fact, NOT the
  // ceiling. The "1 ceiling spare for sides" is what fitOrderBackward uses (Test 6).
  const w1 = winAt({ '19:00': { pizza: 4, sides: 1 } }, PIZZA_SIDES_TICKED, '18:55')!
  ok('4 pizza + 1 side → total 5 (side counted), ceiling NOT the binding reason',
    w1.total === 5 && w1.bound_by !== 'global ceiling' && String(w1.bound_by).includes('Pizza'),
    `total=${w1.total} ${w1.tone} "${w1.bound_by}"`)
}

// ── TEST 2 — 2 pizzas + 4 sides = 6 (alternative mix); no per-cat Sides red ──
console.log('\nTEST 2 — 2 pizzas + 4 sides = 6 (mix):')
{
  const w = winAt({ '19:00': { pizza: 2, sides: 4 } }, PIZZA_SIDES_TICKED, '18:55')!
  ok('18:55 total = 6 (2 pizza + 4 sides)', w.total === 6, `total=${w.total} byCat=${JSON.stringify(w.byCat)}`)
  ok('ceiling RED, bound_by global ceiling (not Sides 4/4)', w.tone === 'red' && w.bound_by === 'global ceiling', `${w.tone} "${w.bound_by}"`)
}

// ── TEST 3 — ticked sides ALONE (no pizzas in the order): fill ceiling, no backward windows ──
console.log('\nTEST 3 — sides only, ticked (cap 6):')
{
  // The config still has a pizza category (5-min cadence) → step = 5, so sides @19:00 land at
  // the collection-adjacent window 18:55 (19:00 − step). They feed `total` for the ceiling.
  const back = projectBackwardOccupancy({ '19:00': { sides: 6 } }, PIZZA_SIDES_TICKED, EVENT_START, CAP)
  const w = back.byStart.get(toMins('18:55'))!
  ok('6 sides → total 6, ceiling red', !!w && w.total === 6 && w.tone === 'red', `total=${w?.total} ${w?.tone}`)
  ok('exactly ONE window (no backward seating for sides)', back.windows.length === 1, `${back.windows.length} windows`)
  ok('batchByCat has NO sides entry (no batch rule)', back.batchByCat.sides === undefined, `batchByCat=${JSON.stringify(back.batchByCat)}`)
  const w7 = projectBackwardOccupancy({ '19:00': { sides: 7 } }, PIZZA_SIDES_TICKED, EVENT_START, CAP).byStart.get(toMins('18:55'))!
  ok('7 sides → over ceiling (red)', !!w7 && w7.total === 7 && w7.tone === 'red', `total=${w7?.total}`)
}

// ── TEST 4 — UNticked sides contribute NOTHING (today's behaviour) ──
console.log('\nTEST 4 — sides UNticked → ignored:')
{
  const back = projectBackwardOccupancy({ '19:00': { sides: 100 } }, PIZZA_SIDES_UNTICKED, EVENT_START, CAP)
  ok('100 unticked sides → no windows, nothing toward ceiling', back.windows.length === 0, `${back.windows.length} windows`)
}

// ── TEST 5 — sides land in the COLLECTION-ADJACENT window, shared with pizzas ──
console.log('\nTEST 5 — sides land at P−step (collection-adjacent), shared with pizza:')
{
  // Pizza @12:30 → window 12:25 (12:30 − step 5). Side @12:30 (ticked) → 12:25 too.
  const back = projectBackwardOccupancy({ '12:30': { pizza: 4, sides: 2 } }, PIZZA_SIDES_TICKED, 11 * 60, CAP)
  const w = back.byStart.get(toMins('12:25'))!
  ok('12:25 holds pizza 4 + sides 2 (shared adjacent window)', w && w.byCat.pizza === 4 && w.byCat.sides === 2, `byCat=${JSON.stringify(w?.byCat)}`)
  ok('no side load at 12:30 (collection slot itself)', !back.byStart.get(toMins('12:30')), 'none')
}

// ── TEST 6 — fitOrderBackward: sides blocked when ceiling full, offered when spare, never run-off ──
console.log('\nTEST 6 — fitOrderBackward for a sides order:')
{
  // Existing: 4 pizzas @19:00 → window 18:55 = pizza 4 (total 4, 2 ceiling spare).
  const back = projectBackwardOccupancy({ '19:00': { pizza: 4 } }, PIZZA_SIDES_TICKED, EVENT_START, CAP)
  // New 2-sides order collected @19:00 → its ceiling window = 19:00 − step = 18:55 (existing total 4) → 4+2=6 → fits (==cap, amber).
  const fit2 = fitOrderBackward(back, toMins('19:00'), { sides: 2 }, PIZZA_SIDES_TICKED, CAP, EVENT_START)
  ok('2-sides @19:00 fits (4+2=6 == cap)', fit2.fits === true, `fits=${fit2.fits} ${fit2.tone}`)
  // 3-sides → 4+3=7 > 6 → blocked (ceiling).
  const fit3 = fitOrderBackward(back, toMins('19:00'), { sides: 3 }, PIZZA_SIDES_TICKED, CAP, EVENT_START)
  ok('3-sides @19:00 blocked (4+3=7 > cap)', fit3.fits === false && fit3.bound_by === 'global ceiling', `fits=${fit3.fits} (${fit3.bound_by})`)
  // sides at the opening slot never run-off-front (instant) — empty event, cap 6.
  const emptyBack = projectBackwardOccupancy({}, PIZZA_SIDES_TICKED, EVENT_START, CAP)
  const fitOpen = fitOrderBackward(emptyBack, EVENT_START, { sides: 2 }, PIZZA_SIDES_TICKED, CAP, EVENT_START)
  ok('2-sides @event-start fits (instant, no run-off-front)', fitOpen.fits === true, `fits=${fitOpen.fits} (${fitOpen.bound_by})`)
}

console.log('\n' + '─'.repeat(60))
if (failures === 0) { console.log('✅ ALL MIXED-CEILING CHECKS PASS'); process.exit(0) }
else { console.log(`❌ ${failures} check(s) FAILED`); process.exit(1) }
