#!/usr/bin/env node
// scripts/batch-reservation-display-equals-picker.cjs — what the picker reserved is what the board shows.
//   node scripts/batch-reservation-display-equals-picker.cjs
// 🔴 FAILURE MODE: the projection seating an admitted order's items in windows other than the ones the
// admission (fitOrderBackward.reserved / why.windows) chose — the dot and the popup disagreeing.
const fs = require('fs'), os = require('os'), path = require('path')
const { load, REPO, fmt, mins, NEG, grid, rng, Sim } = require('./_batch-reservation-sim.cjs')
let fails = 0; const check = (ok, l) => { console.log(`  ${ok ? '✓' : '🔴'} ${l}`); if (!ok) fails++ }
const SHAPES = [
  { cfg: { pizza: { secs: 900, batch: 8, countsToCapacity: true } }, kc: null, cw: 5, iv: 15 },
  { cfg: { pizza: { secs: 900, batch: 8, countsToCapacity: true } }, kc: null, cw: 5, iv: 5 },
  { cfg: { pizza: { secs: 300, batch: 2, countsToCapacity: true } }, kc: 2, cw: 5, iv: 5 },
  { cfg: { pizza: { secs: 600, batch: 4, countsToCapacity: true }, dessert: { secs: 300, batch: 3, countsToCapacity: true } }, kc: 6, cw: 5, iv: 10 },
]
/** The windows the PROJECTION attributes to order o: with o alone reserved on top of everything else,
 *  the per-window difference between the full board and the board without o. */
function projectedWindowsOf(X, sim, o) {
  const withO = sim.back()
  const unitsWithout = {}; for (const x of sim.orders) if (x.counting && x !== o) { unitsWithout[x.slot] = unitsWithout[x.slot] || {}; for (const [c, n] of Object.entries(x.qty)) unitsWithout[x.slot][c] = (unitsWithout[x.slot][c] || 0) + n }
  const without = X.E.projectBackwardOccupancy(unitsWithout, sim.cx.cfg, sim.cx.start, sim.cx.kc, sim.cx.cw, sim.reservations(o.key), true)
  // without o's reservation the projection would re-split its items with today's rule; so instead read the
  // reserved intervals it emitted for o directly: those are the intervals whose (start,cat,items) came from o.
  const mine = {}
  for (const [cat, c] of Object.entries(o.record.cats)) mine[cat] = c.windows.map(w => [w.startMins, w.items])
  const seated = {}
  for (const iv of withO.intervals) { seated[iv.cat] = seated[iv.cat] || {}; seated[iv.cat][iv.startMins] = (seated[iv.cat][iv.startMins] || 0) + iv.items }
  // every reserved window of o must be present in the full board's load at that start, and the load
  // without o must be smaller by exactly o's share there
  const seatedWithout = {}
  for (const iv of without.intervals) { seatedWithout[iv.cat] = seatedWithout[iv.cat] || {}; seatedWithout[iv.cat][iv.startMins] = (seatedWithout[iv.cat][iv.startMins] || 0) + iv.items }
  return { mine, seated, seatedWithout }
}
function run(X, seqs) { const r = rng(2718); let admitted = 0, bad = 0, first = null
  for (let s = 0; s < seqs; s++) { const cx = { ...SHAPES[s % SHAPES.length], start: 17 * 60, end: 20 * 60 }, sim = Sim(X, cx), times = grid(X, cx.start, cx.end, cx.iv), cats = Object.keys(cx.cfg)
    for (let step = 0; step < 10; step++) { const qty = {}; for (const c of cats) if (r() < 0.75) qty[c] = 1 + Math.floor(r() * 2 * cx.cfg[c].batch); if (!Object.keys(qty).length) qty[cats[0]] = 1
      const res = sim.place(times[Math.floor(r() * times.length)].collection_time, qty, { override: r() < 0.2 }); if (!res.placed || !res.record) continue; admitted++
      // (1) the admission's own answer equals the stored record (fit ⇒ reserved; override ⇒ the record's windows)
      if (res.fit.fits) for (const [cat, ws] of Object.entries(res.fit.reserved || {})) { const rec = res.record.cats[cat]; if (!ws || !rec || JSON.stringify(ws.map(w => [w.startMins, w.items])) !== JSON.stringify(rec.windows.map(w => [w.startMins, w.items]))) { bad++; if (!first) first = { s, step, why: 'reserved≠record', cat } } }
      // (2) the projection seats exactly those windows for this order
      const p = projectedWindowsOf(X, sim, res.order)
      for (const [cat, ws] of Object.entries(p.mine)) for (const [start, items] of ws) { const full = (p.seated[cat] || {})[start] || 0, rest = (p.seatedWithout[cat] || {})[start] || 0
        if (full - rest !== items) { bad++; if (!first) first = { s, step, why: 'projection≠record', cat, start: fmt(start), items, full, rest } } } } }
  return { admitted, bad, first } }
console.log('── BROKEN VARIANT: MUST report FAILURE ──────────────────────────────────────────────────')
{
  // V1: the projection using today's split for reserved orders (ignoring the reservation's windows).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-v1-')); fs.cpSync(path.join(REPO, 'lib'), path.join(tmp, 'lib'), { recursive: true }); fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules'))
  const f = path.join(tmp, 'lib/slot-availability.ts'); const src = fs.readFileSync(f, 'utf8'); const needle = '        const v = validReservationsAt(reservations, ps, cat, batch, prepMins)\n'
  if (src.split(needle).length !== 2) { console.log('🔴 could not patch the ON seating'); process.exit(1) }
  fs.writeFileSync(f, src.replace(needle, '        const v = { windows: [], items: 0 }   // V1: reservations ignored, today\'s split for everything\n'))
  const V = load(tmp, 'depV1'); const r = run(V, 80)
  console.log(`  ${r.bad > 0 ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 projection ignoring reservations: ${r.bad} disagreements over ${r.admitted} admissions${r.first ? ' — first ' + JSON.stringify(r.first) : ''}`)
  fs.rmSync(tmp, { recursive: true, force: true }); if (!r.bad) process.exit(1)
}
const X = load(REPO, 'dep'); const t0 = Date.now(); const r = run(X, 800)
console.log('\n── EVERY ADMITTED ORDER, FIT AND OVERRIDE ──────────────────────────────────────────────')
check(r.bad === 0, `${r.admitted} admissions: reserved == stored record, and the board seats exactly the record's windows — ${r.bad} disagreements${r.first ? ' — first ' + JSON.stringify(r.first) : ''}`)
console.log(`  ℹ ${((Date.now() - t0) / 1000).toFixed(1)} s`)
console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ DISPLAY == PICKER'}`)
process.exit(fails ? 1 : 0)
