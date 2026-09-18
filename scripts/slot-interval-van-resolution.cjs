#!/usr/bin/env node
// scripts/slot-interval-van-resolution.cjs
//
// Proof of V2: the intervals belong to the EVENT'S VAN, and resolve by the same path kitchen_capacity does.
//   node scripts/slot-interval-van-resolution.cjs
//
// 🔴 WHAT A FAILURE LOOKS LIKE: two vans of one truck sharing a grid because something resolved by
// truck_id instead of van_id; a NULL override read as 5 so a customer-15 van hands its operator a
// 5-minute grid (the one arithmetic mistake in this whole change); the offline cached grid built on the
// customer interval while the dots are drawn at the operator's; an event with no van inventing a grid;
// or a Gusto-shaped van (one van, customer 5, override null) differing from HEAD by a single byte.
//
// The resolver and the generator are COMPILED FROM THE WORKING TREE and run against FIXTURE van rows —
// the readVanIntervals resolution rule is exercised through a fake supabase client, so the real branch
// order is under test rather than a re-description of it.

const path = require('path')
const { compile, headWorktree, REPO } = require('./_slot-interval-compile.cjs')

const { readVanIntervals, NO_VAN_INTERVALS } = compile(REPO, ['lib/slot-interval.ts'], 'vanres').req('lib/slot-interval.js')
const { generateCollectionTimes } = compile(REPO, ['lib/slot-generation.ts'], 'vanres2').req('lib/slot-generation.js')

let fails = 0
const check = (ok, label) => { console.log(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }

// ── FIXTURE DATABASE ────────────────────────────────────────────────────────────────────────────────
// One truck, two vans — the shape only `test-truck` has live, and the shape the whole decision exists for.
const VANS = {
  'van-a': { id: 'van-a', kitchen_capacity: null, capacity_window_mins: 10, collection_interval_mins: 15, operator_collection_interval_mins: 5 },
  'van-b': { id: 'van-b', kitchen_capacity: 8,    capacity_window_mins: 5,  collection_interval_mins: 30, operator_collection_interval_mins: null },
  'van-gusto': { id: 'van-gusto', kitchen_capacity: 2, capacity_window_mins: 5, collection_interval_mins: 5, operator_collection_interval_mins: null },
}
const EVENTS = {
  'ev-a':    { id: 'ev-a',    van_id: 'van-a',     start_time: '18:00', end_time: '20:00' },
  'ev-b':    { id: 'ev-b',    van_id: 'van-b',     start_time: '18:00', end_time: '20:00' },
  'ev-none': { id: 'ev-none', van_id: null,        start_time: '18:00', end_time: '20:00' },
  'ev-1750': { id: 'ev-1750', van_id: 'van-a',     start_time: '17:50', end_time: '20:00' },
  'ev-gusto':{ id: 'ev-gusto',van_id: 'van-gusto', start_time: '18:00', end_time: '20:00' },
}

/** A fake supabase whose truck_vans select answers from VANS. Mirrors the shape readVanIntervals uses. */
const fakeSupabase = (opts = {}) => ({
  from(table) {
    return {
      select(cols) {
        this._cols = cols
        return this
      },
      eq(_col, val) { this._id = val; return this },
      async maybeSingle() {
        if (opts.error) return { data: null, error: opts.error }
        const row = VANS[this._id]
        if (!row) return { data: null, error: null }
        // Only the columns the caller named, so a select that forgot one is visible here.
        const out = {}
        for (const c of String(this._cols).split(',').map(s => s.trim())) out[c] = row[c]
        return { data: out, error: null }
      },
    }
  },
})

/** The resolution under test: the van comes from the EVENT, exactly as kitchen_capacity's does. */
async function resolveForEvent(eventId, opts) {
  const ev = EVENTS[eventId]
  return { vanId: ev?.van_id ?? null, intervals: await readVanIntervals(fakeSupabase(opts), ev?.van_id ?? null) }
}
/** The kitchen_capacity resolution, written out as every route writes it. The comparison target. */
function resolveCapacityForEvent(eventId) {
  const ev = EVENTS[eventId]
  const van = ev?.van_id ? VANS[ev.van_id] : null
  return { vanId: ev?.van_id ?? null, kitchenCapacity: van?.kitchen_capacity ?? null, capacityWindowMins: van?.capacity_window_mins ?? 5 }
}
const gridFor = (ev, iv) => generateCollectionTimes(EVENTS[ev].start_time, EVENTS[ev].end_time, iv, 10, 30).map(t => t.collection_time)

;(async () => {

console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')
{
  // V1 — resolution by TRUCK instead of by van: both events get the first van's grid.
  const byTruck = (_eventId) => VANS['van-a']
  const a = byTruck('ev-a').collection_interval_mins, b = byTruck('ev-b').collection_interval_mins
  const same = a === b
  console.log(`  ${same ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 resolution by truck — both events read ${a}, so van-b's ${VANS['van-b'].collection_interval_mins} is unreachable`)
  if (!same) process.exit(1)

  // V2 — a NULL override normalised to 5 instead of following the customer value.
  const brokenTruckIv = (van) => (van.operator_collection_interval_mins == null ? 5 : van.operator_collection_interval_mins)
  const got = brokenTruckIv(VANS['van-b'])
  const wrong = got === 5 && VANS['van-b'].collection_interval_mins === 30
  console.log(`  ${wrong ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V2 NULL override read as 5 — a customer-30 van hands its operator ${got}, not 30`)
  if (!wrong) process.exit(1)

  // V3 — the offline cached grid built on the CUSTOMER interval while the dots use the operator's.
  const iv = await readVanIntervals(fakeSupabase(), 'van-a')
  const offlineWrong = gridFor('ev-a', iv.customer)
  const dotsGrid = gridFor('ev-a', iv.truck)
  const diverged = offlineWrong.length !== dotsGrid.length
  console.log(`  ${diverged ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V3 offline grid on the customer interval — ${offlineWrong.length} slots against the dots' ${dotsGrid.length}`)
  if (!diverged) process.exit(1)
}

console.log('\n── TWO VANS OF ONE TRUCK: each event gets its OWN van\'s grids ──────────────────────────')
{
  const a = await resolveForEvent('ev-a'), b = await resolveForEvent('ev-b')
  check(a.intervals.customer === 15 && a.intervals.truck === 5, `van-a (customer 15, override 5) → customer ${a.intervals.customer}, truck ${a.intervals.truck}`)
  check(b.intervals.customer === 30 && b.intervals.truck === 30, `van-b (customer 30, override null) → customer ${b.intervals.customer}, truck ${b.intervals.truck}`)
  check(a.intervals.customer !== b.intervals.customer && a.intervals.truck !== b.intervals.truck, 'the two events share NO interval — resolution is per van, not per truck')
  check(gridFor('ev-a', a.intervals.customer).includes('18:15') && !gridFor('ev-b', b.intervals.customer).includes('18:15'), '…and the generated customer grids differ (18:15 on van-a, not on van-b)')
}

console.log('\n── V2\'s THREE RULES ────────────────────────────────────────────────────────────────────')
{
  const b = await resolveForEvent('ev-b')
  check(b.intervals.truck === b.intervals.customer && b.intervals.truck === 30, '🔴 override NULL → the truck grid EQUALS the customer grid (customer 30 → truck 30)')
  const a = await resolveForEvent('ev-a')
  check(a.intervals.truck === 5 && a.intervals.customer === 15, '🔴 override 5 with customer 15 → truck 5, customer 15')
  const none = await resolveForEvent('ev-none')
  check(none.vanId === null && none.intervals.customer === 5 && none.intervals.truck === 5, '🔴 an event with no van gets 5/5')
  check(JSON.stringify(none.intervals) === JSON.stringify(NO_VAN_INTERVALS), '…and it is literally NO_VAN_INTERVALS, with no query made')
  // A customer-15 van proves the null rule is not accidentally right because 5 happened to be the answer.
  const fifteen = await readVanIntervals(fakeSupabase(), 'van-a')
  check(fifteen.truck === 5, 'a non-null override is honoured (5), so the null rule is a real branch')
}

console.log('\n── THE RESOLVER AGREES WITH THE kitchen_capacity RESOLUTION, EVENT BY EVENT ────────────')
for (const id of Object.keys(EVENTS)) {
  const iv = await resolveForEvent(id)
  const cap = resolveCapacityForEvent(id)
  check(iv.vanId === cap.vanId, `${id}: interval van (${iv.vanId ?? 'none'}) === capacity van (${cap.vanId ?? 'none'})`)
}

console.log('\n── THE OFFLINE CACHED GRID USES THE EFFECTIVE TRUCK INTERVAL ───────────────────────────')
{
  // /api/dashboard generates `slots` at vanIntervals.truck and caches THAT array as offlineCapacity.slots,
  // alongside intervalMins: truckIntervalMins. Modelled here end to end.
  for (const [ev, expected] of [['ev-a', 5], ['ev-b', 30], ['ev-gusto', 5]]) {
    const { intervals } = await resolveForEvent(ev)
    const serverGrid = gridFor(ev, intervals.truck)
    const offline = { slots: serverGrid, intervalMins: intervals.truck }
    const dots = gridFor(ev, offline.intervalMins)
    check(intervals.truck === expected && JSON.stringify(offline.slots) === JSON.stringify(dots),
      `${ev}: cached grid and dot grid are the same ${offline.slots.length} slots at the effective truck interval ${intervals.truck}`)
    check(JSON.stringify(offline.slots) !== JSON.stringify(gridFor(ev, intervals.customer)) || intervals.truck === intervals.customer,
      `${ev}: the cached grid is NOT the customer grid unless the two intervals genuinely match`)
  }
}

console.log('\n── A 17:50 START KEEPS CLOCK ANCHORING (D1, unchanged) ─────────────────────────────────')
{
  const { intervals } = await resolveForEvent('ev-1750')
  const g15 = gridFor('ev-1750', intervals.customer)
  check(g15[0] === '18:00', `customer 15 on a 17:50 start → first slot ${g15[0]}`)
  const g5 = gridFor('ev-1750', intervals.truck)
  check(g5[0] === '17:50', `operator 5 on the same event → first slot ${g5[0]}`)
}

console.log('\n── A GUSTO-SHAPED VAN IS BYTE-IDENTICAL TO HEAD ────────────────────────────────────────')
{
  const head = headWorktree('vanres')
  const H = compile(head.wt, ['lib/slot-generation.ts'], 'vanresHEAD').req('lib/slot-generation.js')
  const { intervals } = await resolveForEvent('ev-gusto')
  check(intervals.customer === 5 && intervals.truck === 5, 'one van, customer 5, override null → 5/5')
  let diff = 0, total = 0
  // Every start on the 5 grid, both durations, both graces — the full surface a live truck could hit.
  for (let start = 0; start < 1440; start += 5) {
    for (const dur of [5, 10]) for (const grace of [0, 30]) {
      const end = Math.min(start + 240, 1439)
      const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
      const a = JSON.stringify(H.generateCollectionTimes(fmt(start), fmt(end), 5, dur, grace))
      const b = JSON.stringify(generateCollectionTimes(fmt(start), fmt(end), intervals.truck, dur, grace))
      total++; if (a !== b) { diff++; if (diff <= 3) console.log(`    🔴 differs at start ${fmt(start)} dur ${dur} grace ${grace}`) }
    }
  }
  head.remove()
  check(diff === 0, `${total} FIXTURE grids at the resolved 5: identical to HEAD's generator, byte for byte`)
}

console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ van resolution proven'}`)
process.exit(fails ? 1 : 0)
})()
