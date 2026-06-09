// scripts/verify-stage3-asap.ts
// STAGE 3 (+ off-by-one fix) — ASAP / auto-placement agree EXACTLY with the corrected
// backward picker (collection slot T ⟷ cooking window ending at T). One fit model:
// earliestBackwardFitSlot and buildSlotAvailability both go through fitOrderBackward.
//
// Run:  npx tsx scripts/verify-stage3-asap.ts

import { buildSlotAvailability, fitOrderBackward, projectBackwardOccupancy, earliestBackwardFitSlot } from '@/lib/slot-availability'
import type { CatConfig } from '@/lib/prep-utils'

const PIZZA: Record<string, CatConfig> = { pizza: { secs: 300, batch: 4 } }
const EVENT_START = 17 * 60
const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const TIMES = Array.from({ length: 13 }, (_, i) => { const m = 18 * 60 + 30 + i * 5; const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; return { collection_time: t, production_slot: t } })
const STORED = { '19:00': { pizza: 10 } } // windows 18:45/18:50/18:55

let failures = 0
function expect(label: string, cond: boolean, got: string) {
  console.log(`   ${cond ? '✅' : '❌'} ${label}  →  ${got}`)
  if (!cond) failures++
}

// Picker's earliest OFFER: first slot ≥ fromMins whose backward fit (window ending at it) isn't red.
function pickerEarliestOffer(order: Record<string, number>, fromMins: number): string | null {
  const rows = buildSlotAvailability({
    times: TIMES, productionSlotUnits: STORED, catConfigs: PIZZA, kitchenCapacity: 6,
    date: '2099-01-01', nowMins: 0, earliestCollectionMins: 0, eventStartMins: EVENT_START,
    basketByCat: order,
  })
  const offer = rows.filter(r => toMins(r.collection_time) >= fromMins && r.tone !== 'red')
    .sort((a, b) => toMins(a.collection_time) - toMins(b.collection_time))[0]
  return offer?.collection_time ?? null
}

// ── TEST 1/2 — ASAP == picker (2-pizza, 10 booked @19:00), floor 18:45 ──────
console.log('\nTEST 1/2 — ASAP agrees with picker (2-pizza, 10 pizzas @19:00 booked):')
{
  const from = toMins('18:45')
  const asap = earliestBackwardFitSlot(TIMES, STORED, PIZZA, 6, EVENT_START, { pizza: 2 }, from)
  const picker = pickerEarliestOffer({ pizza: 2 }, from)
  // 18:45 collection uses cooking window 18:40 (free) → earliest fitting from 18:45 is 18:45.
  expect('ASAP resolves to 18:45 (window 18:40 free)', asap === '18:45', `asap=${asap}`)
  expect('ASAP === picker earliest offer', asap === picker, `asap=${asap} picker=${picker}`)
  expect('ASAP not a BLOCKED slot (18:50/18:55)', asap !== '18:50' && asap !== '18:55', `asap=${asap}`)
  const back = projectBackwardOccupancy(STORED, PIZZA, EVENT_START, 6)
  expect('resolved slot backward-FITS', fitOrderBackward(back, toMins(asap!), { pizza: 2 }, PIZZA, 6, EVENT_START).fits, `slot=${asap}`)
}

// ── TEST 1b — no floor → earliest empty slot ────────────────────────────────
console.log('\nTEST 1b — ASAP with no floor picks earliest free slot:')
{
  const asap = earliestBackwardFitSlot(TIMES, STORED, PIZZA, 6, EVENT_START, { pizza: 2 }, 0)
  const picker = pickerEarliestOffer({ pizza: 2 }, 0)
  expect('ASAP === picker offer', asap === picker, `asap=${asap} picker=${picker}`)
  expect('ASAP is the earliest slot 18:30 (window 18:25 free)', asap === '18:30', `asap=${asap}`)
}

// ── TEST 4 — auto-placement lands on a backward-fitting slot ────────────────
console.log('\nTEST 4 — auto-placement (3-pizza, from 18:40):')
{
  const from = toMins('18:40')
  const placement = earliestBackwardFitSlot(TIMES, STORED, PIZZA, 6, EVENT_START, { pizza: 3 }, from)
  const picker = pickerEarliestOffer({ pizza: 3 }, from)
  const back = projectBackwardOccupancy(STORED, PIZZA, EVENT_START, 6)
  expect('placement === picker offer', placement === picker, `placement=${placement} picker=${picker}`)
  expect('placement backward-FITS', !!placement && fitOrderBackward(back, toMins(placement), { pizza: 3 }, PIZZA, 6, EVENT_START).fits, `placement=${placement}`)
  expect('placement not a busy slot (18:50/18:55/19:00)', placement !== '18:50' && placement !== '18:55' && placement !== '19:00', `placement=${placement}`)
}

// ── TEST 6 — run-off-front via ASAP: 10 pizzas, empty event, start 17:00 ─────
console.log('\nTEST 6 — run-off-front (10 pizzas, empty event, start 17:00):')
{
  const times = Array.from({ length: 12 }, (_, i) => { const m = 17 * 60 + i * 5; const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; return { collection_time: t, production_slot: t } })
  const asap = earliestBackwardFitSlot(times, {}, PIZZA, 6, EVENT_START, { pizza: 10 }, EVENT_START)
  // 10 pizzas need 3 windows ENDING at T: T−5,T−10,T−15. One pre-open window allowed
  // (earliest ≥ eventStart − prep = 16:55) ⇒ earliest T = 17:10 (windows 16:55/17:00/17:05).
  expect('ASAP resolves to 17:10 (one pre-open window allowed)', asap === '17:10', `asap=${asap}`)
}

// ── TEST 6b — opening-edge ASAP (Option A): 4-pizza → 17:00, 8-pizza → 17:05 ─
console.log('\nTEST 6b — opening-edge ASAP (empty event, start 17:00):')
{
  const times = Array.from({ length: 12 }, (_, i) => { const m = 17 * 60 + i * 5; const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; return { collection_time: t, production_slot: t } })
  // 4 pizzas (1 batch) → one pre-open window 16:55–17:00 allowed ⇒ collectable AT 17:00.
  const asap4 = earliestBackwardFitSlot(times, {}, PIZZA, 6, EVENT_START, { pizza: 4 }, EVENT_START)
  expect('4-pizza ASAP → 17:00 (one pre-open window)', asap4 === '17:00', `asap=${asap4}`)
  // 8 pizzas (2 batches) → @17:00 needs 16:50 & 16:55 (two pre-open) → blocked; @17:05 needs
  // 16:55 (one pre-open) & 17:00 → allowed ⇒ earliest 17:05.
  const asap8 = earliestBackwardFitSlot(times, {}, PIZZA, 6, EVENT_START, { pizza: 8 }, EVENT_START)
  expect('8-pizza ASAP → 17:05 (one pre-open + one in-window)', asap8 === '17:05', `asap=${asap8}`)
}

// ── TEST 7 — no storage mutation ────────────────────────────────────────────
console.log('\nTEST 7 — stored productionSlotUnits NOT mutated by ASAP search:')
{
  const stored = { '19:00': { pizza: 10 } }
  const before = JSON.stringify(stored)
  earliestBackwardFitSlot(TIMES, stored, PIZZA, 6, EVENT_START, { pizza: 5 }, 0)
  expect('input unchanged', JSON.stringify(stored) === before, JSON.stringify(stored))
}

console.log('\n' + '─'.repeat(60))
if (failures === 0) { console.log('✅ ALL STAGE 3 CHECKS PASS'); process.exit(0) }
else { console.log(`❌ ${failures} check(s) FAILED`); process.exit(1) }
