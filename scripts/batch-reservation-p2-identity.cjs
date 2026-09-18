#!/usr/bin/env node
// scripts/batch-reservation-p2-identity.cjs — P1/P2 change NOTHING anyone can see.
//   node scripts/batch-reservation-p2-identity.cjs
// 🔴 FAILURE MODE: any reader — projectBackwardOccupancy, fitOrderBackward (incl. `why`),
// earliestBackwardFitSlot, buildSlotAvailability, buildSlotIndicators, detectCapacityBreaches — giving a
// different answer WITH the P2-written reservations than WITHOUT them, at any step of any sequence.
// The one way that happens is a shared slot: two orders of 5 at 17:30 are seated by today's rule as
// 8 + 2 across two windows; their per-order reservations say 5 + 5 in the nearest window (R4). The
// engine must therefore use a reservation only when it is the SOLE one at its slot and equals the
// stored total (cachedReservationWindows) — the broken variant below drops that rule and must fail.
const fs = require('fs'), os = require('os'), path = require('path')
const { compile, REPO } = require('./_slot-interval-compile.cjs')
let fails = 0; const check = (ok, l) => { console.log(`  ${ok ? '✓' : '🔴'} ${l}`); if (!ok) fails++ }
const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`, mins = t => parseInt(t.slice(0, 2)) * 60 + parseInt(t.slice(3)), NEG = -Infinity
const FILES = ['lib/slot-availability.ts', 'lib/slot-display.ts', 'lib/capacity-breach.ts', 'lib/slot-generation.ts', 'lib/orders/cooking-reservation.ts']
function load(root, tag) {
  const c = compile(root, FILES, tag)
  // the writer module imports lib/supabase (env) transitively via place-in-slot; stub the client module
  const stub = path.join(c.out, 'lib', 'supabase.js'); fs.writeFileSync(stub, 'module.exports = { supabase: null }')
  return { E: c.req('lib/slot-availability.js'), D: c.req('lib/slot-display.js'), B: c.req('lib/capacity-breach.js'), G: c.req('lib/slot-generation.js'), W: c.req('lib/orders/cooking-reservation.js') }
}
const m2o = m => Object.fromEntries([...m.entries()])
const grid = (X, s, e, iv) => X.G.generateCollectionTimes(fmt(s), fmt(e), iv, iv, 30).map(t => ({ collection_time: t.collection_time, production_slot: t.collection_time, production_window_key: t.collection_time }))

/** The P2 writer, simulated with the REAL buildReservationForOrder for every counting order. */
const reservationsFor = (X, orders, cx) => orders.filter(o => o.counting).map(o => {
  const r = X.W.buildReservationForOrder({ slot: o.slot, qtyByCat: o.qty, catConfigs: cx.cfg, eventStartMins: cx.start, kitchenCapacity: cx.kc, capacityWindowMins: cx.cw, gridIntervalMins: cx.iv, source: o.override ? 'override' : 'fit' })
  return r ? { orderKey: o.key, slot: r.slot, cats: r.cats } : null
}).filter(Boolean)
/** units = what buildUnitsFromOrders would store: each counting order's full load at its own slot. */
const unitsFor = orders => { const u = {}; for (const o of orders) if (o.counting) { u[o.slot] = u[o.slot] || {}; for (const [c, n] of Object.entries(o.qty)) u[o.slot][c] = (u[o.slot][c] || 0) + n } return u }
/** Everything the six readers say, as one string. `res` = [] is "without". */
function snapshot(X, cx, units, res, times, order) {
  const back = X.E.projectBackwardOccupancy(units, cx.cfg, cx.start, cx.kc, cx.cw, res)
  const fits = times.slice(0, 12).map(t => X.E.fitOrderBackward(back, mins(t.collection_time), order, cx.cfg, cx.kc, cx.start, cx.cw, NEG, units[t.collection_time] || {}))
  const asap = X.E.earliestBackwardFitSlot(times, units, cx.cfg, cx.kc, cx.start, order, NEG, cx.cw, NEG, res)
  const avail = X.E.buildSlotAvailability({ times, productionSlotUnits: units, catConfigs: cx.cfg, kitchenCapacity: cx.kc, capacityWindowMins: cx.cw, date: '2099-01-01', nowMins: 0, earliestCollectionMins: 0, eventStartMins: cx.start, displayIntervalMins: cx.iv, reservations: res })
  const dots = m2o(X.D.buildSlotIndicators(times, units, cx.cfg, cx.kc, cx.start, Object.keys(cx.cfg), cx.cw, cx.iv, res))
  const br = X.B.detectCapacityBreaches({ intervalMins: cx.iv, times, productionSlotUnits: units, catConfigs: cx.cfg, kitchenCapacity: cx.kc, eventStartMins: cx.start, capacityWindowMins: cx.cw, orders: [], reservations: res })
  return JSON.stringify({ windows: back.windows, byStart: m2o(back.byStart), pile: m2o(back.pileByStart), cantFit: back.cantFit, intervals: back.intervals, fits, asap, avail, dots, br })
}
const SHAPES = [
  { name: 'Gusto: pizza 5/2, kc 2, 5-min grid', cfg: { pizza: { secs: 300, batch: 2, countsToCapacity: true } }, kc: 2, cw: 5, iv: 5 },
  { name: 'Dominic: pizza 15/8, kc null, 15-min grid', cfg: { pizza: { secs: 900, batch: 8, countsToCapacity: true } }, kc: null, cw: 5, iv: 15 },
  { name: 'prep 15 on a 5-min grid, batch 8', cfg: { pizza: { secs: 900, batch: 8, countsToCapacity: true } }, kc: null, cw: 5, iv: 5 },
  { name: 'two cats + kc 6, 10-min grid', cfg: { pizza: { secs: 600, batch: 4, countsToCapacity: true }, dessert: { secs: 300, batch: 3, countsToCapacity: true } }, kc: 6, cw: 5, iv: 10 },
]
const R4 = [
  ['R4: two orders of 5 @17:30 (today 8 + 2)', [{ slot: '17:30', qty: { pizza: 5 } }, { slot: '17:30', qty: { pizza: 5 }, override: true }]],
  ['R4: 8 + 1 @17:30 (today 8 + 1 across two windows)', [{ slot: '17:30', qty: { pizza: 8 } }, { slot: '17:30', qty: { pizza: 1 } }]],
  ['R4: 3 + 4 @17:30 (identical either way)', [{ slot: '17:30', qty: { pizza: 3 } }, { slot: '17:30', qty: { pizza: 4 } }]],
  ['R4: 8 + 8 @17:30 (today 8 + 8; per-order 16 nearest)', [{ slot: '17:30', qty: { pizza: 8 } }, { slot: '17:30', qty: { pizza: 8 } }]],
  ['R4: an off-list 17:37 shared by 6 + 6', [{ slot: '17:37', qty: { pizza: 6 } }, { slot: '17:37', qty: { pizza: 6 } }]],
]
function runR4(X, label, list, cx) {
  const orders = list.map((o, i) => ({ key: 'o' + i, counting: true, ...o }))
  const units = unitsFor(orders), res = reservationsFor(X, orders, cx), times = grid(X, cx.start, cx.start + 240, cx.iv)
  return snapshot(X, cx, units, [], times, { pizza: 9 }) === snapshot(X, cx, units, res, times, { pizza: 9 })
}
const NOW = load(REPO, 'p2NOW')
const DOM = { ...SHAPES[1], start: 17 * 60 }

console.log('── BROKEN VARIANT: MUST report FAILURE ──────────────────────────────────────────────────')
{
  // V1: the engine trusting EVERY per-order reservation verbatim — no sole-at-slot, no equals-the-total.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p2-v1-')); fs.cpSync(path.join(REPO, 'lib'), path.join(tmp, 'lib'), { recursive: true }); fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules'))
  const f = path.join(tmp, 'lib/slot-availability.ts'); let src = fs.readFileSync(f, 'utf8')
  const a = src.indexOf('export function cachedReservationWindows('), b = src.indexOf('\n}\n', a) + 3
  if (a < 0 || b < 3) { console.log('🔴 could not patch cachedReservationWindows'); process.exit(1) }
  src = src.slice(0, a) + `export function cachedReservationWindows(reservations: EngineReservation[] | undefined, slot: string, cat: string, totalItems: number, batch: number, prepMins: number): CookingReservationWindow[] | null {
  if (!reservations || !reservations.length) return null
  const ws: CookingReservationWindow[] = []
  for (const r of reservations) if (r.slot === slot && r.cats?.[cat]) ws.push(...(r.cats[cat].windows || []))
  return ws.length ? ws.sort((x, y) => x.startMins - y.startMins) : null   // every order's own split, verbatim
}
` + src.slice(b)
  fs.writeFileSync(f, src)
  const V1 = load(tmp, 'p2V1')
  const same = runR4(V1, R4[0][0], R4[0][1], DOM)
  console.log(`  ${!same ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 per-order reservations without shared-slot handling on "${R4[0][0]}": ${!same ? 'readers DIFFER (5 + 5 → 10 nearest ≠ 8 + 2)' : 'no difference'}`)
  fs.rmSync(tmp, { recursive: true, force: true })
  if (same) process.exit(1)
}

console.log("\n── R4's SHARED-SLOT FIXTURES, explicitly ────────────────────────────────────────────────")
for (const [label, list] of R4) check(runR4(NOW, label, list, DOM), label)

console.log('\n── 5,000 RANDOM SEQUENCES: place · override · off-list · edit · cancel ──────────────────')
{
  let seed = 20260918; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
  let seqs = 0, steps = 0, diffs = 0, firstDiff = null, shared = 0, t0 = Date.now()
  for (let s = 0; s < 5000; s++) {
    const shape = SHAPES[s % SHAPES.length], cx = { ...shape, start: 17 * 60 }, end = cx.start + 240
    const times = grid(NOW, cx.start, end, cx.iv), cats = Object.keys(cx.cfg), orders = []; let k = 0
    for (let step = 0; step < 10; step++) {
      const r = rnd()
      if (r < 0.55 || orders.length === 0) {                       // PLACE (fit or override) / OFF-LIST
        const qty = {}; for (const c of cats) if (rnd() < 0.8) qty[c] = 1 + Math.floor(rnd() * 2 * cx.cfg[c].batch); if (!Object.keys(qty).length) qty[cats[0]] = 1
        const offList = rnd() < 0.12
        const T = offList ? fmt(cx.start + 5 + Math.floor(rnd() * 200)) : times[Math.floor(rnd() * times.length)].collection_time
        const units = unitsFor(orders), back = NOW.E.projectBackwardOccupancy(units, cx.cfg, cx.start, cx.kc, cx.cw, reservationsFor(NOW, orders, cx))
        const fit = NOW.E.fitOrderBackward(back, mins(T), qty, cx.cfg, cx.kc, cx.start, cx.cw, NEG, units[T] || {})
        if (fit.fits || rnd() < 0.35 || offList) orders.push({ key: 'o' + (k++), slot: T, qty, counting: true, override: !fit.fits })
      } else if (r < 0.8) {                                         // EDIT: change items, maybe the slot
        const o = orders[Math.floor(rnd() * orders.length)]; const c = cats[Math.floor(rnd() * cats.length)]
        o.qty = { ...o.qty, [c]: 1 + Math.floor(rnd() * 2 * cx.cfg[c].batch) }; if (rnd() < 0.3) o.slot = times[Math.floor(rnd() * times.length)].collection_time
      } else {                                                      // CANCEL: leaves the counting set
        orders[Math.floor(rnd() * orders.length)].counting = false
      }
      const units = unitsFor(orders), res = reservationsFor(NOW, orders, cx)
      const bySlot = {}; for (const o of orders) if (o.counting) bySlot[o.slot] = (bySlot[o.slot] || 0) + 1; if (Object.values(bySlot).some(n => n > 1)) shared++
      const probe = {}; for (const c of cats) probe[c] = 1 + Math.floor(rnd() * cx.cfg[c].batch)
      const a = snapshot(NOW, cx, units, [], times, probe), b = snapshot(NOW, cx, units, res, times, probe)
      steps++; if (a !== b) { diffs++; if (!firstDiff) firstDiff = { s, step, shape: shape.name, orders: JSON.stringify(orders) } }
    }
    seqs++
  }
  check(seqs === 5000, `${seqs} sequences across ${SHAPES.length} shapes`)
  check(diffs === 0, `${steps} steps compared with vs without reservations (${shared} with a shared slot): ${diffs} differ${firstDiff ? ' — first: ' + JSON.stringify(firstDiff).slice(0, 200) : ''}`)
  console.log(`  ℹ ${((Date.now() - t0) / 1000).toFixed(1)} s`)
}
console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ P2 reservations are invisible to every reader'}`)
process.exit(fails ? 1 : 0)
