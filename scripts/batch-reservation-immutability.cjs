#!/usr/bin/env node
// scripts/batch-reservation-immutability.cjs — once reserved, an order never moves.
//   node scripts/batch-reservation-immutability.cjs
// 🔴 FAILURE MODE: placing, overriding, editing or cancelling one order changing ANOTHER order's stored
// reservation or its displayed windows — including pre-switch orders (null reservation, today's split).
const fs = require('fs'), os = require('os'), path = require('path')
const { load, REPO, fmt, mins, NEG, grid, rng, Sim } = require('./_batch-reservation-sim.cjs')
let fails = 0; const check = (ok, l) => { console.log(`  ${ok ? '✓' : '🔴'} ${l}`); if (!ok) fails++ }
const SHAPES = [
  { cfg: { pizza: { secs: 900, batch: 8, countsToCapacity: true } }, kc: null, cw: 5, iv: 15 },
  { cfg: { pizza: { secs: 300, batch: 2, countsToCapacity: true } }, kc: 2, cw: 5, iv: 5 },
  { cfg: { pizza: { secs: 900, batch: 8, countsToCapacity: true } }, kc: null, cw: 5, iv: 5 },
  { cfg: { pizza: { secs: 600, batch: 4, countsToCapacity: true }, dessert: { secs: 300, batch: 3, countsToCapacity: true } }, kc: 6, cw: 5, iv: 10 },
]
/** The displayed windows attributable to each order: its record verbatim, or (pre-switch) today's split of its own items. */
function displayed(X, sim, o) {
  if (o.record) return JSON.stringify(o.record.cats)
  const b = X.E.projectBackwardOccupancy({ [o.slot]: o.qty }, sim.cx.cfg, sim.cx.start, sim.cx.kc, sim.cx.cw)
  return JSON.stringify(b.intervals.map(iv => [iv.cat, iv.startMins, iv.items]))
}
function run(X, seqs, label) {
  const r = rng(99177); let steps = 0, moved = 0, first = null, shared = 0, pre = 0
  for (let s = 0; s < seqs; s++) {
    const cx = { ...SHAPES[s % SHAPES.length], start: 17 * 60, end: 21 * 60 }, sim = Sim(X, cx), times = grid(X, cx.start, cx.end, cx.iv), cats = Object.keys(cx.cfg)
    for (let step = 0; step < 12; step++) {
      const before = new Map(sim.orders.filter(o => o.counting).map(o => [o.key, [JSON.stringify(o.record), displayed(X, sim, o)]]))
      const x = r(); let acted = null
      if (x < 0.6 || sim.orders.length === 0) {
        const qty = {}; for (const c of cats) if (r() < 0.8) qty[c] = 1 + Math.floor(r() * 2 * cx.cfg[c].batch); if (!Object.keys(qty).length) qty[cats[0]] = 1
        const T = times[Math.floor(r() * times.length)].collection_time
        const res = sim.place(T, qty, { override: r() < 0.3, preSwitch: r() < 0.15 })
        if (res.placed) { acted = res.order.key; if (!res.order.record) pre++ }
      } else if (x < 0.85) { const o = sim.orders[Math.floor(r() * sim.orders.length)]; if (o.counting) { const c = cats[Math.floor(r() * cats.length)]; sim.edit(o, { ...o.qty, [c]: 1 + Math.floor(r() * 2 * cx.cfg[c].batch) }, r() < 0.4 ? times[Math.floor(r() * times.length)].collection_time : o.slot); acted = o.key } }
      else { const o = sim.orders[Math.floor(r() * sim.orders.length)]; if (o.counting) { sim.cancel(o); acted = o.key } }
      const bySlot = {}; for (const o of sim.orders) if (o.counting) bySlot[o.slot] = (bySlot[o.slot] || 0) + 1; if (Object.values(bySlot).some(n => n > 1)) shared++
      steps++
      for (const o of sim.orders) { if (!o.counting || o.key === acted || !before.has(o.key)) continue
        const now = [JSON.stringify(o.record), displayed(X, sim, o)]; const was = before.get(o.key)
        if (now[0] !== was[0] || now[1] !== was[1]) { moved++; if (!first) first = { s, step, key: o.key } } }
    }
  }
  return { steps, moved, first, shared, pre }
}
console.log('── BROKEN VARIANT: MUST report FAILURE ──────────────────────────────────────────────────')
{
  // V1: the projection re-seating reserved orders — i.e. an engine where a stored record is recomputed
  // on every placement (the record follows the current fit rather than staying put).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'imm-v1-')); fs.cpSync(path.join(REPO, 'lib'), path.join(tmp, 'lib'), { recursive: true }); fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules'))
  const V = load(tmp, 'immV1')
  // model the re-seat: after every action, every reserved order's record is rebuilt from the current state
  const r = rng(5); let moved = 0
  for (let s = 0; s < 60; s++) { const cx = { ...SHAPES[0], start: 17 * 60, end: 21 * 60 }, sim = Sim(V, cx), times = grid(V, cx.start, cx.end, cx.iv)
    for (let step = 0; step < 10; step++) { const T = times[Math.floor(r() * times.length)].collection_time; sim.place(T, { pizza: 1 + Math.floor(r() * 16) }, { override: r() < 0.3 })
      for (const o of sim.orders) if (o.counting && o.record) { const was = JSON.stringify(o.record); const b = V.E.projectBackwardOccupancy(sim.units(), cx.cfg, cx.start, cx.kc, cx.cw, sim.reservations(o.key), true); o.record = V.E.buildAdmittedReservation({ back: b, slotLabel: o.slot, qtyByCat: o.qty, catConfigs: cx.cfg, kitchenCapacity: cx.kc, eventStartMins: cx.start, capacityWindowMins: cx.cw }).record; if (JSON.stringify(o.record) !== was) moved++ } } }
  console.log(`  ${moved > 0 ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 projection re-seating reserved orders: ${moved} reservations moved after a neighbour was placed`)
  fs.rmSync(tmp, { recursive: true, force: true }); if (!moved) process.exit(1)
}
const X = load(REPO, 'imm')
console.log('\n── 1,200 RANDOM SEQUENCES: place · override · edit · cancel · shared slots · pre-switch orders ─')
{
  const t0 = Date.now(); const r = run(X, 1200, 'real')
  check(r.moved === 0, `${r.steps} steps (${r.shared} with a shared slot, ${r.pre} pre-switch placements): ${r.moved} times another order's reservation or displayed windows changed${r.first ? ' — first ' + JSON.stringify(r.first) : ''}`)
  console.log(`  ℹ ${((Date.now() - t0) / 1000).toFixed(1)} s`)
}
console.log('\n── THE RULE, STATED ON A FIXTURE ───────────────────────────────────────────────────────')
{
  const cx = { ...SHAPES[0], start: 17 * 60, end: 21 * 60 }, sim = Sim(X, cx)
  const a = sim.place('17:30', { pizza: 9 }); const wasA = JSON.stringify(a.record)
  const b = sim.place('17:30', { pizza: 6 }); const c = sim.place('17:15', { pizza: 8 }, { override: true })
  check(JSON.stringify(a.record) === wasA, `9 @17:30's record is byte-identical after a 6 @17:30 (${b.placed ? 'placed' : 'refused'}) and an 8 @17:15 placed anyway`)
  const wasB = JSON.stringify(b.record); sim.edit(a.order, { pizza: 2 }, '18:00'); sim.cancel(c.order)
  check(JSON.stringify(b.record) === wasB, `6 @17:30's record is byte-identical after the 9 is edited away and the override is cancelled`)
  const pre = sim.place('19:00', { pizza: 9 }, { preSwitch: true }); const pv = X.E.projectBackwardOccupancy({ '19:00': { pizza: 9 } }, cx.cfg, cx.start, null, 5).intervals.map(i => [i.startMins, i.items])
  sim.place('19:00', { pizza: 5 }); const b2 = sim.back(); const nine = b2.intervals.filter(i => i.startMins >= 18 * 60 + 30 && i.startMins < 19 * 60)
  check(pre.record === null && nine.some(i => i.startMins === 18 * 60 + 30 && i.items === 8), `a PRE-SWITCH 9 @19:00 (no record) keeps today's split ${JSON.stringify(pv)} after a 5 @19:00 is reserved beside it`)
}
console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ reservations never move'}`)
process.exit(fails ? 1 : 0)
