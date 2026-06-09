// scripts/verify-stage2-availability.ts
// STAGE 2 verification — availability + dots now read the BACKWARD occupancy map.
// Proves the founding scenario for BOTH audiences (operator dots + customer availability),
// the partial-spare / run-off-front fit, and that nothing MUTATES the stored input
// (storage/writers untouched — read-side only).
//
// Run:  npx tsx scripts/verify-stage2-availability.ts
//
// Founding scenario: a 10-pizza order already booked for collection 19:00 (batch 4, prep 5,
// kitchen ceiling 6). productionSlotUnits stores it in the 19:00 collection bucket.

import { buildSlotAvailability, fitOrderBackward, projectBackwardOccupancy } from '@/lib/slot-availability'
import { buildSlotIndicators } from '@/lib/slot-display'
import type { CatConfig } from '@/lib/prep-utils'

const PIZZA: Record<string, CatConfig> = { pizza: { secs: 300, batch: 4 } }
const EVENT_START = 17 * 60 // 17:00
const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const SLOTS = ['18:45', '18:50', '18:55', '19:00', '19:05'].map(t => ({ collection_time: t, production_slot: t }))
// 10 pizzas booked for 19:00 → stored in the 19:00 collection bucket.
const STORED = { '19:00': { pizza: 10 } }

let failures = 0
function expect(label: string, cond: boolean, got: string) {
  console.log(`   ${cond ? '✅' : '❌'} ${label}  →  ${got}`)
  if (!cond) failures++
}

// ── TEST 1 — operator dots read backward windows ────────────────────────────
console.log('\nTEST 1 — operator dots (10 pizzas @19:00):')
{
  const ind = buildSlotIndicators(SLOTS, STORED, PIZZA, 6, EVENT_START)
  const d = (t: string) => ind.get(t)!
  expect('18:45 red "Pizza 4/4"', d('18:45').tone === 'red' && d('18:45').label === 'Pizza 4/4', `${d('18:45').tone} "${d('18:45').label}"`)
  expect('18:50 red "Pizza 4/4"', d('18:50').tone === 'red' && d('18:50').label === 'Pizza 4/4', `${d('18:50').tone} "${d('18:50').label}"`)
  expect('18:55 amber "Pizza 2/4"', d('18:55').tone === 'amber' && d('18:55').label === 'Pizza 2/4', `${d('18:55').tone} "${d('18:55').label}"`)
  expect('19:00 green', d('19:00').tone === 'green', d('19:00').tone)
  expect('19:05 green', d('19:05').tone === 'green', d('19:05').tone)
}

// ── TEST 2 — customer availability (no basket: window-at-S not full) ─────────
console.log('\nTEST 2 — customer availability (10 pizzas @19:00):')
{
  const rows = buildSlotAvailability({
    times: SLOTS, productionSlotUnits: STORED, catConfigs: PIZZA, kitchenCapacity: 6,
    date: '2099-01-01', nowMins: 0, earliestCollectionMins: 0, eventStartMins: EVENT_START,
  })
  const a = (t: string) => rows.find(r => r.collection_time === t)!
  expect('18:45 HIDDEN', a('18:45').available === false, `available=${a('18:45').available} tone=${a('18:45').tone}`)
  expect('18:50 HIDDEN', a('18:50').available === false, `available=${a('18:50').available} tone=${a('18:50').tone}`)
  expect('18:55 OFFERED', a('18:55').available === true, `available=${a('18:55').available} tone=${a('18:55').tone}`)
  expect('19:00 OFFERED', a('19:00').available === true, `available=${a('19:00').available} tone=${a('19:00').tone}`)
  expect('19:05 OFFERED', a('19:05').available === true, `available=${a('19:05').available} tone=${a('19:05').tone}`)
}

// ── TEST 3 — partial-spare basket-aware fit (customer overlay / operator) ────
console.log('\nTEST 3 — partial spare @18:55 (2 free):')
{
  const back = projectBackwardOccupancy(STORED, PIZZA, EVENT_START, 6)
  const fit2 = fitOrderBackward(back, toMins('18:55'), { pizza: 2 }, PIZZA, 6, EVENT_START)
  const fit3 = fitOrderBackward(back, toMins('18:55'), { pizza: 3 }, PIZZA, 6, EVENT_START)
  expect('2-pizza @18:55 FITS', fit2.fits === true, `fits=${fit2.fits} tone=${fit2.tone}`)
  expect('3-pizza @18:55 does NOT fit', fit3.fits === false, `fits=${fit3.fits} tone=${fit3.tone} (${fit3.bound_by})`)
}

// ── TEST 4 — run-off-front: order needs windows before event start ──────────
console.log('\nTEST 4 — run-off-front (10 pizzas, slot just after start):')
{
  const back = projectBackwardOccupancy({}, PIZZA, EVENT_START, 6) // empty existing load
  const fit = fitOrderBackward(back, toMins('17:05'), { pizza: 10 }, PIZZA, 6, EVENT_START)
  expect('10-pizza @17:05 (start 17:00) does NOT fit', fit.fits === false, `fits=${fit.fits} tone=${fit.tone} (${fit.bound_by})`)
}

// ── TEST 6/7 — Add Order modal fit (operator): doesn't-fit ⇒ red (warns) ─────
console.log('\nTEST 7 — Add Order modal fit (operator, basket folded):')
{
  // 10 pizzas with ample lead (slot 19:30, start 17:00) → fits ⇒ green ⇒ silent.
  const ample = buildSlotAvailability({
    times: [{ collection_time: '19:30', production_slot: '19:30' }], productionSlotUnits: {}, catConfigs: PIZZA,
    kitchenCapacity: 6, date: '2099-01-01', nowMins: 0, earliestCollectionMins: 0, eventStartMins: EVENT_START,
    basketByCat: { pizza: 10 },
  })[0]
  expect('10 pizzas @19:30 ample lead FITS (silent)', ample.tone !== 'red', `tone=${ample.tone}`)
  // 10 pizzas no lead (slot 17:05) → run-off-front ⇒ red ⇒ warns.
  const noLead = buildSlotAvailability({
    times: [{ collection_time: '17:05', production_slot: '17:05' }], productionSlotUnits: {}, catConfigs: PIZZA,
    kitchenCapacity: 6, date: '2099-01-01', nowMins: 0, earliestCollectionMins: 0, eventStartMins: EVENT_START,
    basketByCat: { pizza: 10 },
  })[0]
  expect('10 pizzas @17:05 no lead WARNS (red)', noLead.tone === 'red', `tone=${noLead.tone} (${noLead.bound_by})`)
}

// ── TEST 8 — no storage mutation (read-side only) ───────────────────────────
console.log('\nTEST 8 — stored productionSlotUnits is NOT mutated:')
{
  const stored = { '19:00': { pizza: 10 } }
  const before = JSON.stringify(stored)
  buildSlotAvailability({ times: SLOTS, productionSlotUnits: stored, catConfigs: PIZZA, kitchenCapacity: 6, date: '2099-01-01', nowMins: 0, earliestCollectionMins: 0, eventStartMins: EVENT_START, basketByCat: { pizza: 5 } })
  buildSlotIndicators(SLOTS, stored, PIZZA, 6, EVENT_START)
  fitOrderBackward(projectBackwardOccupancy(stored, PIZZA, EVENT_START, 6), toMins('18:55'), { pizza: 3 }, PIZZA, 6, EVENT_START)
  expect('input unchanged after all read calls', JSON.stringify(stored) === before, `${JSON.stringify(stored)}`)
}

console.log('\n' + '─'.repeat(60))
if (failures === 0) { console.log('✅ ALL STAGE 2 CHECKS PASS'); process.exit(0) }
else { console.log(`❌ ${failures} check(s) FAILED`); process.exit(1) }
