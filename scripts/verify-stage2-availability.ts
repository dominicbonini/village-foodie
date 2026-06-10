// scripts/verify-stage2-availability.ts
// STAGE 2 + slot→window off-by-one fix — availability/dots/fit now key a collection slot T
// to the cooking window ENDING at T (keyed T−prep), matching projectBackwardOccupancy.
// Validated as COLLECTABILITY (can I collect/book here), not as a cooking-interval timeline.
//
// Run:  npx tsx scripts/verify-stage2-availability.ts
//
// Founding scenario: 10 pizzas booked for collection 19:00 (batch 4, prep 5, ceiling 6) →
// projection seats cooking windows at 18:45/18:50/18:55. A collection at T needs the window
// ENDING at T, so: 18:45 collectable (window 18:40 free), 18:50/18:55 blocked (windows
// 18:45/18:50 full), 19:00 has 2 spare (window 18:55 = 2/4), 19:05 free (window 19:00).

import { buildSlotAvailability, fitOrderBackward, projectBackwardOccupancy } from '@/lib/slot-availability'
import { buildSlotIndicators } from '@/lib/slot-display'
import type { CatConfig } from '@/lib/prep-utils'

const PIZZA: Record<string, CatConfig> = { pizza: { secs: 300, batch: 4 } }
const EVENT_START = 17 * 60
const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const SLOTS = ['18:45', '18:50', '18:55', '19:00', '19:05'].map(t => ({ collection_time: t, production_slot: t }))
const STORED = { '19:00': { pizza: 10 } }

let failures = 0
function expect(label: string, cond: boolean, got: string) {
  console.log(`   ${cond ? '✅' : '❌'} ${label}  →  ${got}`)
  if (!cond) failures++
}

// ── TEST 1 — operator dots = COLLECTABILITY per slot (window ending at T) ────
console.log('\nTEST 1 — operator dots (10 pizzas @19:00), as collectability:')
{
  const ind = buildSlotIndicators(SLOTS, STORED, PIZZA, 6, EVENT_START)
  const d = (t: string) => ind.get(t)!
  expect('18:45 green (window 18:40 free)', d('18:45').tone === 'green', `${d('18:45').tone} "${d('18:45').label}"`)
  expect('18:50 red "4 Pizza" (window 18:45 full)', d('18:50').tone === 'red' && d('18:50').label === '4 Pizza', `${d('18:50').tone} "${d('18:50').label}"`)
  expect('18:55 red "4 Pizza" (window 18:50 full)', d('18:55').tone === 'red' && d('18:55').label === '4 Pizza', `${d('18:55').tone} "${d('18:55').label}"`)
  expect('19:00 amber "2 Pizza" (window 18:55 = 2)', d('19:00').tone === 'amber' && d('19:00').label === '2 Pizza', `${d('19:00').tone} "${d('19:00').label}"`)
  expect('19:05 green (window 19:00 free)', d('19:05').tone === 'green', d('19:05').tone)
}

// ── TEST 2 — customer availability (no basket: window ending at T not full) ──
console.log('\nTEST 2 — customer availability (10 pizzas @19:00):')
{
  const rows = buildSlotAvailability({
    times: SLOTS, productionSlotUnits: STORED, catConfigs: PIZZA, kitchenCapacity: 6,
    date: '2099-01-01', nowMins: 0, earliestCollectionMins: 0, eventStartMins: EVENT_START,
  })
  const a = (t: string) => rows.find(r => r.collection_time === t)!
  expect('18:45 OFFERED (window 18:40 free)', a('18:45').available === true, `available=${a('18:45').available} tone=${a('18:45').tone}`)
  expect('18:50 HIDDEN (window 18:45 full)', a('18:50').available === false, `available=${a('18:50').available} tone=${a('18:50').tone}`)
  expect('18:55 HIDDEN (window 18:50 full)', a('18:55').available === false, `available=${a('18:55').available} tone=${a('18:55').tone}`)
  expect('19:00 OFFERED (window 18:55 = 2/4)', a('19:00').available === true, `available=${a('19:00').available} tone=${a('19:00').tone}`)
  expect('19:05 OFFERED (window 19:00 free)', a('19:05').available === true, `available=${a('19:05').available} tone=${a('19:05').tone}`)
}

// ── TEST 3 — partial spare is at slot 19:00 (uses the 18:55 window's 2 remainder) ──
console.log('\nTEST 3 — partial spare at the CORRECT slot (19:00, not 18:55):')
{
  const back = projectBackwardOccupancy(STORED, PIZZA, EVENT_START, 6)
  const fit2at1900 = fitOrderBackward(back, toMins('19:00'), { pizza: 2 }, PIZZA, 6, EVENT_START)
  const fit3at1900 = fitOrderBackward(back, toMins('19:00'), { pizza: 3 }, PIZZA, 6, EVENT_START)
  const fit2at1855 = fitOrderBackward(back, toMins('18:55'), { pizza: 2 }, PIZZA, 6, EVENT_START)
  expect('2-pizza @19:00 FITS (window 18:55 has 2 spare)', fit2at1900.fits === true, `fits=${fit2at1900.fits} tone=${fit2at1900.tone}`)
  expect('3-pizza @19:00 does NOT fit (2+3>4)', fit3at1900.fits === false, `fits=${fit3at1900.fits} (${fit3at1900.bound_by})`)
  expect('2-pizza @18:55 does NOT fit (window 18:50 full)', fit2at1855.fits === false, `fits=${fit2at1855.fits} (${fit2at1855.bound_by})`)
}

// ── TEST 1' — THE 12:30 CASE, by ACTUAL BOOKING (the reported bug) ──────────
console.log("\nTEST 1' — 12:30 case (4 pizzas @12:30), by booking:")
{
  const START = 11 * 60
  const stored = { '12:30': { pizza: 4 } } // projection → window 12:25 = {pizza:4}
  const back = projectBackwardOccupancy(stored, PIZZA, START, 6)
  const at1225 = fitOrderBackward(back, toMins('12:25'), { pizza: 4 }, PIZZA, 6, START)
  const at1230 = fitOrderBackward(back, toMins('12:30'), { pizza: 4 }, PIZZA, 6, START)
  expect('new 4-pizza OFFERED at 12:25 (window 12:20 free)', at1225.fits === true, `fits=${at1225.fits} tone=${at1225.tone}`)
  expect('new 4-pizza BLOCKED at 12:30 (window 12:25 full)', at1230.fits === false, `fits=${at1230.fits} (${at1230.bound_by})`)
  const dots = buildSlotIndicators(
    ['12:20', '12:25', '12:30', '12:35'].map(t => ({ collection_time: t, production_slot: t })),
    stored, PIZZA, 6, START)
  expect('dot 12:25 green, 12:30 red', dots.get('12:25')!.tone === 'green' && dots.get('12:30')!.tone === 'red',
    `12:25=${dots.get('12:25')!.tone} 12:30=${dots.get('12:30')!.tone}`)
}

// ── TEST 2' — 8-PIZZA MODEL (operator's example): 8 @19:00 = 2 batches ──────
console.log("\nTEST 2' — 8 pizzas @19:00 (2 batches), by booking + dots:")
{
  const stored = { '19:00': { pizza: 8 } } // windows ending 18:55 & 19:00 → keys 18:50 & 18:55, each 4/4
  const back = projectBackwardOccupancy(stored, PIZZA, EVENT_START, 6)
  const fit = (t: string) => fitOrderBackward(back, toMins(t), { pizza: 4 }, PIZZA, 6, EVENT_START).fits
  expect('new 4-pizza OFFERED at 18:50 (window 18:45 free)', fit('18:50') === true, `${fit('18:50')}`)
  expect('new 4-pizza OFFERED at 19:05 (window 19:00 free)', fit('19:05') === true, `${fit('19:05')}`)
  expect('new 4-pizza BLOCKED at 18:55 (window 18:50 full)', fit('18:55') === false, `${fit('18:55')}`)
  expect('new 4-pizza BLOCKED at 19:00 (window 18:55 full)', fit('19:00') === false, `${fit('19:00')}`)
  const dots = buildSlotIndicators(
    ['18:50', '18:55', '19:00', '19:05'].map(t => ({ collection_time: t, production_slot: t })),
    stored, PIZZA, 6, EVENT_START)
  expect('dots: 18:55 & 19:00 red, 18:50 & 19:05 green',
    dots.get('18:55')!.tone === 'red' && dots.get('19:00')!.tone === 'red' && dots.get('18:50')!.tone === 'green' && dots.get('19:05')!.tone === 'green',
    `18:50=${dots.get('18:50')!.tone} 18:55=${dots.get('18:55')!.tone} 19:00=${dots.get('19:00')!.tone} 19:05=${dots.get('19:05')!.tone}`)
}

// ── TEST 5 — multi-batch: 19:05 free (needs 19:00 window, empty) ────────────
console.log('\nTEST 5 — multi-batch: new order at 19:05 fits (window 19:00 free):')
{
  const back = projectBackwardOccupancy(STORED, PIZZA, EVENT_START, 6)
  const at1905 = fitOrderBackward(back, toMins('19:05'), { pizza: 4 }, PIZZA, 6, EVENT_START)
  expect('4-pizza @19:05 FITS', at1905.fits === true, `fits=${at1905.fits} tone=${at1905.tone}`)
}

// ── TEST 4 — ONE-BATCH PRE-OPEN allowance (empty event, start 17:00) ────────
console.log('\nTEST 4 — one-batch pre-open (empty event, start 17:00, prep 5):')
{
  const back = projectBackwardOccupancy({}, PIZZA, EVENT_START, 6)
  const fit = (t: string, q: number) => fitOrderBackward(back, toMins(t), { pizza: q }, PIZZA, 6, EVENT_START)
  // 4-pizza @17:00: one window 16:55–17:00 (one pre-open window) → ALLOWED.
  expect('4-pizza @17:00 OFFERED (one pre-open window)', fit('17:00', 4).fits === true, `${fit('17:00', 4).fits}`)
  // 8-pizza @17:00: needs 16:50 AND 16:55 (two pre-open windows) → BLOCKED.
  expect('8-pizza @17:00 BLOCKED (needs two pre-open windows)', fit('17:00', 8).fits === false, `${fit('17:00', 8).fits} (${fit('17:00', 8).bound_by})`)
  // 4-pizza @17:05: window 17:00–17:05 (after open) → OFFERED.
  expect('4-pizza @17:05 OFFERED', fit('17:05', 4).fits === true, `${fit('17:05', 4).fits}`)
}

// ── TEST 8 — no storage mutation ─────────────────────────────────────────────
console.log('\nTEST 8 — stored productionSlotUnits NOT mutated:')
{
  const stored = { '19:00': { pizza: 10 } }
  const before = JSON.stringify(stored)
  buildSlotAvailability({ times: SLOTS, productionSlotUnits: stored, catConfigs: PIZZA, kitchenCapacity: 6, date: '2099-01-01', nowMins: 0, earliestCollectionMins: 0, eventStartMins: EVENT_START, basketByCat: { pizza: 5 } })
  buildSlotIndicators(SLOTS, stored, PIZZA, 6, EVENT_START)
  expect('input unchanged', JSON.stringify(stored) === before, JSON.stringify(stored))
}

console.log('\n' + '─'.repeat(60))
if (failures === 0) { console.log('✅ ALL CHECKS PASS'); process.exit(0) }
else { console.log(`❌ ${failures} check(s) FAILED`); process.exit(1) }
