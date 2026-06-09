// scripts/verify-stage3-asap.ts
// STAGE 3 verification — ASAP / auto-placement reconciled to the BACKWARD model.
// Proves earliestBackwardFitSlot (ASAP + auto-confirm placement) agrees EXACTLY with what
// the backward picker offers (buildSlotAvailability / fitOrderBackward) — one fit model.
//
// Run:  npx tsx scripts/verify-stage3-asap.ts

import { buildSlotAvailability, fitOrderBackward, projectBackwardOccupancy, earliestBackwardFitSlot } from '@/lib/slot-availability'
import type { CatConfig } from '@/lib/prep-utils'

const PIZZA: Record<string, CatConfig> = { pizza: { secs: 300, batch: 4 } }
const EVENT_START = 17 * 60
const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
// 18:30 … 19:30 every 5 min.
const TIMES = Array.from({ length: 13 }, (_, i) => { const m = 18 * 60 + 30 + i * 5; const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; return { collection_time: t, production_slot: t } })
const STORED = { '19:00': { pizza: 10 } } // 10 pizzas booked for 19:00 → backward 18:45/18:50/18:55

let failures = 0
function expect(label: string, cond: boolean, got: string) {
  console.log(`   ${cond ? '✅' : '❌'} ${label}  →  ${got}`)
  if (!cond) failures++
}

// The picker's earliest OFFER for an order: first slot ≥ fromMins whose backward fit isn't red.
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

// ── TEST 1+2 — ASAP == picker offer (coupling), 2-pizza order vs 10-booked ───
console.log('\nTEST 1/2 — ASAP agrees with picker (2-pizza order, 10 pizzas @19:00 booked):')
{
  // Floor at 18:45 so the full windows 18:45/18:50 are in range — ASAP must skip them.
  const from = toMins('18:45')
  const asap = earliestBackwardFitSlot(TIMES, STORED, PIZZA, 6, EVENT_START, { pizza: 2 }, from)
  const picker = pickerEarliestOffer({ pizza: 2 }, from)
  expect('ASAP resolves to 18:55 (skips full 18:45/18:50)', asap === '18:55', `asap=${asap}`)
  expect('ASAP === picker earliest offer', asap === picker, `asap=${asap} picker=${picker}`)
  expect('ASAP never 18:45/18:50 (full)', asap !== '18:45' && asap !== '18:50', `asap=${asap}`)
  // And the resolved slot genuinely fits (backward).
  const back = projectBackwardOccupancy(STORED, PIZZA, EVENT_START, 6)
  expect('resolved slot backward-FITS', fitOrderBackward(back, toMins(asap!), { pizza: 2 }, PIZZA, 6, EVENT_START).fits, `slot=${asap}`)
}

// ── Earliest empty slot when no floor (2-pizza can cook earlier than the 19:00 cohort) ──
console.log('\nTEST 1b — ASAP with no floor picks earliest EMPTY slot (not the busy window):')
{
  const asap = earliestBackwardFitSlot(TIMES, STORED, PIZZA, 6, EVENT_START, { pizza: 2 }, 0)
  const picker = pickerEarliestOffer({ pizza: 2 }, 0)
  expect('ASAP === picker offer', asap === picker, `asap=${asap} picker=${picker}`)
  expect('ASAP is an empty early slot (18:30)', asap === '18:30', `asap=${asap}`)
}

// ── TEST 4 — auto-placement: chosen slot is one the picker accepts ───────────
console.log('\nTEST 4 — auto-placement lands on a backward-fitting slot:')
{
  // Simulate submit ASAP: fromMins = now-floor (say 18:40), order 3 pizzas.
  const from = toMins('18:40')
  const placement = earliestBackwardFitSlot(TIMES, STORED, PIZZA, 6, EVENT_START, { pizza: 3 }, from)
  const picker = pickerEarliestOffer({ pizza: 3 }, from)
  const back = projectBackwardOccupancy(STORED, PIZZA, EVENT_START, 6)
  expect('placement === picker offer', placement === picker, `placement=${placement} picker=${picker}`)
  expect('placement is a fitting slot (not a hidden full window)', !!placement && fitOrderBackward(back, toMins(placement), { pizza: 3 }, PIZZA, 6, EVENT_START).fits, `placement=${placement}`)
  // 3 pizzas don't fit 18:55's 2 spare (2+3>4) → must be 19:00+ (empty) or an early empty slot.
  expect('3-pizza @from=18:40 not placed in a busy window', placement !== '18:45' && placement !== '18:50' && placement !== '18:55', `placement=${placement}`)
}

// ── TEST 6 — run-off-front via ASAP: too big for lead ⇒ later slot ───────────
console.log('\nTEST 6 — run-off-front: 10 pizzas, empty event, start 17:00:')
{
  const times = Array.from({ length: 12 }, (_, i) => { const m = 17 * 60 + i * 5; const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; return { collection_time: t, production_slot: t } })
  const asap = earliestBackwardFitSlot(times, {}, PIZZA, 6, EVENT_START, { pizza: 10 }, EVENT_START)
  // 10 pizzas need 3 windows; earliest slot whose 3 windows are all ≥ 17:00 is 17:10.
  expect('ASAP resolves to 17:10 (not impossible-early 17:00/17:05)', asap === '17:10', `asap=${asap}`)
}

// ── TEST 7 — no storage mutation ─────────────────────────────────────────────
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
