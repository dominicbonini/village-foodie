#!/usr/bin/env node
// scripts/batch-reservation-lock.cjs — the reservation is written INSIDE the lock, so a concurrent
// admission sees it.
//   node scripts/batch-reservation-lock.cjs
// 🔴 FAILURE MODE: two customers admitted for adjacent windows at the same moment, each seeing a board
// without the other, and the grill overbooked — which is exactly what happens if the reservation is
// written AFTER the per-event lock is released. Modelled with a real async mutex over the real engine:
// each "request" acquires the lock, reads the board, admits, [writes], releases. FIXTURE figures.
const { load, REPO, fmt, mins, NEG } = require('./_batch-reservation-sim.cjs')
let fails = 0; const check = (ok, l) => { console.log(`  ${ok ? '✓' : '🔴'} ${l}`); if (!ok) fails++ }
const X = load(REPO, 'lock')
const CX = { cfg: { pizza: { secs: 900, batch: 8, countsToCapacity: true } }, kc: null, cw: 5, iv: 15, start: 17 * 60, end: 21 * 60 }
/** A per-event mutex. */
function mutex() { let p = Promise.resolve(); return { run: (fn) => { const next = p.then(fn, fn); p = next.then(() => {}, () => {}); return next } } }
/** The "database": stored orders (slot totals) and their reservations. */
function db() { const orders = []; return { orders,
  units: () => { const u = {}; for (const o of orders) { u[o.slot] = u[o.slot] || {}; for (const [c, n] of Object.entries(o.qty)) u[o.slot][c] = (u[o.slot][c] || 0) + n } return u },
  reservations: () => orders.filter(o => o.record).map(o => ({ orderKey: o.key, slot: o.record.slot, source: o.record.source, cats: o.record.cats })) } }
const tick = () => new Promise(r => setTimeout(r, 2))
/** One customer request: under the lock, read → admit → insert → [write the record: inside or after]. */
async function request(store, lock, key, T, qty, writeInsideLock) {
  let record = null, fits = false
  await lock.run(async () => {
    const back = X.E.projectBackwardOccupancy(store.units(), CX.cfg, CX.start, CX.kc, CX.cw, store.reservations(), true)
    const fit = X.E.fitOrderBackward(back, mins(T), qty, CX.cfg, CX.kc, CX.start, CX.cw, NEG, store.units()[T] || {}, true)
    fits = fit.fits; if (!fits) return
    record = X.E.buildAdmittedReservation({ back, slotLabel: T, qtyByCat: qty, catConfigs: CX.cfg, kitchenCapacity: CX.kc, eventStartMins: CX.start, capacityWindowMins: CX.cw }).record
    await tick()                                   // the insert (place_order_atomic)
    store.orders.push({ key, slot: T, qty, record: writeInsideLock ? record : null })   // P3: the record is written here
    await tick()
  })
  if (fits && !writeInsideLock) { await tick(); const o = store.orders.find(x => x.key === key); if (o) o.record = record }   // V1: written after release
  return fits
}
const maxLoad = (store) => { const back = X.E.projectBackwardOccupancy(store.units(), CX.cfg, CX.start, CX.kc, CX.cw, store.reservations(), true); let m = 0; for (let t = CX.start - 15; t <= CX.end; t++) { let l = 0; for (const iv of back.intervals) if (iv.items > 0 && iv.startMins <= t && t < iv.endMins) l += iv.items; m = Math.max(m, l) } return m }
;(async () => {
  console.log('── BROKEN VARIANT: MUST report FAILURE ──────────────────────────────────────────────────')
  {
    // V1: the record written AFTER the lock is released. Two 9-pizza orders for adjacent windows (17:30
    // and 17:45) arrive together on a board holding 8 @17:00 and 1 @17:15. Under the real rule the first
    // takes 8 in 17:15–17:30 + 1 in 17:00–17:15; the second (17:45) needs 17:30–17:45 (8) + 17:15–17:30 —
    // which the first has just filled, so it may take only 1 there… unless it never saw it.
    const store = db(); const lock = mutex()
    store.orders.push({ key: 'a', slot: '17:00', qty: { pizza: 8 }, record: { v: 1, source: 'fit', slot: '17:00', cats: { pizza: { items: 8, batch: 8, prepMins: 15, windows: [{ startMins: 16 * 60 + 45, endMins: 17 * 60, items: 8 }] } } } })
    store.orders.push({ key: 'b', slot: '17:15', qty: { pizza: 1 }, record: { v: 1, source: 'fit', slot: '17:15', cats: { pizza: { items: 1, batch: 8, prepMins: 15, windows: [{ startMins: 17 * 60, endMins: 17 * 60 + 15, items: 1 }] } } } })
    // the second request must read while the first's lock section is over but its record is not yet written:
    // V1 releases, then writes after a tick — start the second request in that gap.
    const p1 = request(store, lock, 'c1', '17:30', { pizza: 9 }, false)
    await new Promise(r => setTimeout(r, 3)); const p2 = request(store, lock, 'c2', '17:45', { pizza: 9 }, false)
    const [f1, f2] = await Promise.all([p1, p2]); const m = maxLoad(store)
    const over = m > 8
    console.log(`  ${over ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 record written after release: c1 ${f1 ? 'fits' : 'refused'}, c2 ${f2 ? 'fits' : 'refused'}, peak load on the grill ${m} (batch 8)`)
    if (!over) process.exit(1)
  }
  console.log('\n── THE REAL ORDER OF OPERATIONS: written inside the lock ───────────────────────────────')
  {
    const store = db(); const lock = mutex()
    store.orders.push({ key: 'a', slot: '17:00', qty: { pizza: 8 }, record: { v: 1, source: 'fit', slot: '17:00', cats: { pizza: { items: 8, batch: 8, prepMins: 15, windows: [{ startMins: 16 * 60 + 45, endMins: 17 * 60, items: 8 }] } } } })
    store.orders.push({ key: 'b', slot: '17:15', qty: { pizza: 1 }, record: { v: 1, source: 'fit', slot: '17:15', cats: { pizza: { items: 1, batch: 8, prepMins: 15, windows: [{ startMins: 17 * 60, endMins: 17 * 60 + 15, items: 1 }] } } } })
    const p1 = request(store, lock, 'c1', '17:30', { pizza: 9 }, true)
    await new Promise(r => setTimeout(r, 3)); const p2 = request(store, lock, 'c2', '17:45', { pizza: 9 }, true)
    const [f1, f2] = await Promise.all([p1, p2]); const m = maxLoad(store)
    check(f1 === true, 'c1 (9 @17:30) fits — 8 in 17:15–17:30, 1 in 17:00–17:15')
    check(f2 === false, `c2 (9 @17:45), waiting on the lock, SEES c1's reservation: 17:30–17:45 has 8 free, 17:15–17:30 has 0 → 8 < 9 → refused (${f2 ? 'admitted' : 'refused'})`)
    check(m <= 8, `peak load on the grill ${m} ≤ batch 8 — never overbooked`)
    const c1 = store.orders.find(o => o.key === 'c1'); check(!!c1?.record, "c1's record exists before c2 ran — written inside the lock")
  }
  console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ the reservation is visible to the next admission'}`)
  process.exit(fails ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
