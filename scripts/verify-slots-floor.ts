// scripts/verify-slots-floor.ts
// FIX verification — slots TIME floor no longer adds the retired cumulative queue-push.
// Reproduces the route's earliestCollectionMins formula and proves: a future event with a
// big existing queue floors to EVENT START (not eventStart+push), so opening slots are
// neither too_soon (A) nor spuriously amber (B); today's now+prep guard is kept; backward
// capacity is unchanged.
//
// Run:  npx tsx scripts/verify-slots-floor.ts

import { buildSlotAvailability, fitOrderBackward, projectBackwardOccupancy } from '@/lib/slot-availability'
import { buildSlotIndicators } from '@/lib/slot-display'
import { calcMinReadyMins, type CatConfig } from '@/lib/prep-utils'

const PIZZA: Record<string, CatConfig> = { pizza: { secs: 300, batch: 4 } }
const EVENT_START = 17 * 60 // 17:00 = 1020
const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const STORED = { '19:00': { pizza: 10 } } // backward → 18:45/18:50 red, 18:55 amber
// 17:00 … 19:05 every 5 min.
const SLOTS = Array.from({ length: 26 }, (_, i) => { const m = 17 * 60 + i * 5; const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; return { collection_time: t, production_slot: t } })

let failures = 0
function expect(label: string, cond: boolean, got: string) {
  console.log(`   ${cond ? '✅' : '❌'} ${label}  →  ${got}`)
  if (!cond) failures++
}

// The NEW floor formula (mirrors app/api/slots/[truckId]/route.ts after the fix).
function earliestFloor(date: string, today: string, nowMins: number, queueByCat: Record<string, number>, extraWaitMins = 0): number {
  return Math.max(
    EVENT_START,
    date === today ? nowMins + calcMinReadyMins(queueByCat, PIZZA) + extraWaitMins : 0,
  )
}

// ── (A) future event + 10-pizza queue → floor = event start (17:00), NOT 17:10 ──
console.log('\n(A) future-event floor (10-pizza queue booked):')
{
  const floor = earliestFloor('2099-01-01', '2026-06-09', 9 * 60, { pizza: 10 })
  expect('floor = 17:00 (1020), no +10 queue push', floor === EVENT_START, `floor=${floor} (${Math.floor(floor / 60)}:${String(floor % 60).padStart(2, '0')})`)
  const emptyFloor = earliestFloor('2099-01-01', '2026-06-09', 9 * 60, {})
  expect('empty-queue future floor also 17:00 (baseline)', emptyFloor === EVENT_START, `floor=${emptyFloor}`)
}

// ── today's now+prep guard is KEPT ──────────────────────────────────────────
console.log('\n(today guard kept) today event, now 17:05:')
{
  const floor = earliestFloor('2026-06-09', '2026-06-09', toMins('17:05'), {})
  // now(1025) + calcMinReadyMins({})=2 → 1027; max(1020,1027)=1027 ≈ 17:07.
  expect('today floor = now+prep (1027), protects past/too-soon', floor === 1027, `floor=${floor}`)
  expect('past slot 17:00 is below today floor (excluded)', toMins('17:00') < floor, `17:00=${toMins('17:00')} < ${floor}`)
}

// ── (A)+(B) engine: with floor=eventStart, 17:00/17:05 not too_soon, available ──
console.log('\n(A/B) availability with corrected floor (future, floor=17:00):')
{
  const rows = buildSlotAvailability({
    times: SLOTS, productionSlotUnits: STORED, catConfigs: PIZZA, kitchenCapacity: 6,
    date: '2099-01-01', nowMins: 9 * 60, earliestCollectionMins: EVENT_START, eventStartMins: EVENT_START,
  })
  const r = (t: string) => rows.find(x => x.collection_time === t)!
  expect('17:00 NOT too_soon, available', r('17:00').too_soon === false && r('17:00').available === true, `too_soon=${r('17:00').too_soon} available=${r('17:00').available}`)
  expect('17:05 NOT too_soon, available', r('17:05').too_soon === false && r('17:05').available === true, `too_soon=${r('17:05').too_soon} available=${r('17:05').available}`)
  // (3) backward capacity cohort — collectability (window ENDING at T), post off-by-one fix:
  // 18:45 free (window 18:40), 18:50/18:55 blocked (windows 18:45/18:50 full), 19:00 = 2 spare.
  expect('18:45 green (window 18:40 free)', r('18:45').tone === 'green', r('18:45').tone)
  expect('18:50 red (window 18:45 full)', r('18:50').tone === 'red', r('18:50').tone)
  expect('18:55 red (window 18:50 full)', r('18:55').tone === 'red', r('18:55').tone)
  expect('19:00 amber (window 18:55 = 2/4)', r('19:00').tone === 'amber', r('19:00').tone)
}

// ── (B) operator dots: 17:00/17:05 GREEN (no labelless amber) ───────────────
console.log('\n(B) operator dots with corrected floor:')
{
  // Slots carry too_soon=false now (≥ floor) → no fold.
  const slotsWithFlags = SLOTS.map(s => ({ ...s, too_soon: false }))
  const ind = buildSlotIndicators(slotsWithFlags, STORED, PIZZA, 6, EVENT_START)
  const d = (t: string) => ind.get(t)!
  expect('17:00 GREEN (no spurious amber)', d('17:00').tone === 'green' && d('17:00').label === '', `${d('17:00').tone} "${d('17:00').label}"`)
  expect('17:05 GREEN', d('17:05').tone === 'green', d('17:05').tone)
  // 19:00 collection slot reads the cohort's partial window (18:55 = 2 pizza) post-shift.
  expect('19:00 amber "2 Pizza" (window 18:55)', d('19:00').tone === 'amber' && d('19:00').label === '2 Pizza', `${d('19:00').tone} "${d('19:00').label}"`)
}

// ── Floor consistency (Option A): no-basket view AND a real basket AGREE at 17:00 ──
console.log('\n(floor consistency) no-basket 17:00 available AND 4-pizza basket books at 17:00:')
{
  const rows = buildSlotAvailability({
    times: [{ collection_time: '17:00', production_slot: '17:00' }], productionSlotUnits: {}, catConfigs: PIZZA,
    kitchenCapacity: 6, date: '2099-01-01', nowMins: 0, earliestCollectionMins: EVENT_START, eventStartMins: EVENT_START,
  })
  const noBasket1700 = rows[0].available
  const back = projectBackwardOccupancy({}, PIZZA, EVENT_START, 6)
  const basket1700 = fitOrderBackward(back, EVENT_START, { pizza: 4 }, PIZZA, 6, EVENT_START).fits
  expect('no-basket 17:00 available === 4-pizza basket fits 17:00 (both true, no inconsistency)',
    noBasket1700 === true && basket1700 === true, `noBasket=${noBasket1700} basket=${basket1700}`)
}

console.log('\n' + '─'.repeat(60))
if (failures === 0) { console.log('✅ ALL FLOOR-FIX CHECKS PASS'); process.exit(0) }
else { console.log(`❌ ${failures} check(s) FAILED`); process.exit(1) }
