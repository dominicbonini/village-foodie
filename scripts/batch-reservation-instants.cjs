#!/usr/bin/env node
// scripts/batch-reservation-instants.cjs — the grill never exceeds the batch (or kc) at any minute.
//   node scripts/batch-reservation-instants.cjs
// 🔴 FAILURE MODE: after a NON-override admission, some minute carries more of a category than its batch,
// or more in total than the kitchen ceiling — on fine grids where windows overlap by minutes, with
// several categories, instant items and the pre-open run-up.
const fs = require('fs'), os = require('os'), path = require('path')
const { load, REPO, fmt, grid, rng, Sim } = require('./_batch-reservation-sim.cjs')
let fails = 0; const check = (ok, l) => { console.log(`  ${ok ? '✓' : '🔴'} ${l}`); if (!ok) fails++ }
const SHAPES = [
  { name: 'prep 15 / batch 8 / 5-min grid', cfg: { pizza: { secs: 900, batch: 8, countsToCapacity: true } }, kc: null, cw: 5, iv: 5 },
  { name: 'prep 15 / batch 8 / 15-min grid / kc 8', cfg: { pizza: { secs: 900, batch: 8, countsToCapacity: true } }, kc: 8, cw: 5, iv: 15 },
  { name: 'prep 10 / batch 4 / 5-min grid', cfg: { pizza: { secs: 600, batch: 4, countsToCapacity: true } }, kc: null, cw: 5, iv: 5 },
  { name: 'three cats (10/4, 15/6, instant) / kc 9 / 5-min grid', cfg: { pizza: { secs: 600, batch: 4, countsToCapacity: true }, burger: { secs: 900, batch: 6, countsToCapacity: true }, side: { secs: 0, batch: 1, countsToCapacity: true } }, kc: 9, cw: 5, iv: 5 },
  { name: 'Gusto 5/2/kc 2', cfg: { pizza: { secs: 300, batch: 2, countsToCapacity: true } }, kc: 2, cw: 5, iv: 5 },
]
function sweep(X, seqs) { const r = rng(31415); let admitted = 0, viol = 0, first = null, checks = 0
  for (let s = 0; s < seqs; s++) { const cx = { ...SHAPES[s % SHAPES.length], start: 17 * 60, end: 20 * 60 }, sim = Sim(X, cx), times = grid(X, cx.start, cx.end, cx.iv), cats = Object.keys(cx.cfg)
    for (let step = 0; step < 14; step++) { const qty = {}; for (const c of cats) if (r() < 0.7) qty[c] = 1 + Math.floor(r() * 2 * Math.max(1, cx.cfg[c].batch)); if (!Object.keys(qty).length) qty[cats[0]] = 1
      const res = sim.place(times[Math.floor(r() * times.length)].collection_time, qty); if (!res.placed) continue; admitted++
      for (const m of sim.loadByMinute()) { checks++
        for (const [c, n] of Object.entries(m.per)) if (cx.cfg[c].secs > 0 && n > cx.cfg[c].batch + 1e-9) { viol++; if (!first) first = { shape: cx.name, t: fmt(m.t), cat: c, n } }
        if (cx.kc != null && m.tot > cx.kc + 1e-9) { viol++; if (!first) first = { shape: cx.name, t: fmt(m.t), tot: m.tot } } } } }
  return { admitted, viol, first, checks } }
console.log('── BROKEN VARIANT: MUST report FAILURE ──────────────────────────────────────────────────')
{
  // V1: a closed-left overlap — a batch ending exactly as the window begins is NOT counted (the
  // 17 September off-by-one inverted): two batches then share a minute.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'inst-v1-')); fs.cpSync(path.join(REPO, 'lib'), path.join(tmp, 'lib'), { recursive: true }); fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules'))
  const f = path.join(tmp, 'lib/slot-availability.ts'); const src = fs.readFileSync(f, 'utf8'); const needle = 'if (iv.endMins > iv.startMins) { if (iv.startMins <= t && t < iv.endMins) c += iv.items }'
  if (src.split(needle).length !== 2) { console.log('🔴 could not patch categoryLoadOver'); process.exit(1) }
  // an interval that overlaps only the window's first five minutes is not counted — on a 5-minute grid
  // with a 15-minute prep that is a real batch on the grill, invisibly.
  fs.writeFileSync(f, src.replace(needle, 'if (iv.endMins > iv.startMins) { if (iv.startMins + 5 <= t && t < iv.endMins) c += iv.items }'))
  const V = load(tmp, 'instV1'); const r = sweep(V, 150)
  console.log(`  ${r.viol > 0 ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 overlap that ignores an interval's first five minutes: ${r.viol} minute-violations over ${r.admitted} admissions${r.first ? ' — first ' + JSON.stringify(r.first) : ''}`)
  fs.rmSync(tmp, { recursive: true, force: true }); if (!r.viol) process.exit(1)
}
const X = load(REPO, 'inst')
console.log('\n── EVERY MINUTE, AFTER EVERY NON-OVERRIDE ADMISSION ─────────────────────────────────────')
{ const t0 = Date.now(); const r = sweep(X, 600)
  check(r.viol === 0, `${r.admitted} admissions across ${SHAPES.length} shapes, ${r.checks} minute-checks: ${r.viol} over the batch or kc${r.first ? ' — first ' + JSON.stringify(r.first) : ''}`)
  console.log(`  ℹ ${((Date.now() - t0) / 1000).toFixed(1)} s`) }
console.log('\n── THE PRE-OPEN RUN-UP ─────────────────────────────────────────────────────────────────')
{ const cx = { ...SHAPES[0], iv: 15, start: 17 * 60, end: 20 * 60 }, sim = Sim(X, cx)
  const a = sim.place('17:00', { pizza: 8 }); check(a.placed && a.record.cats.pizza.windows[0].startMins === 16 * 60 + 45, `8 @17:00 (opening) → reserved in the run-up 16:45–17:00`)
  const b = sim.place('17:00', { pizza: 1 }); check(!b.placed, '1 more @17:00 → refused: the only pre-open window is full and there is no earlier one')
  const c = sim.place('17:00', { pizza: 9 }); check(!c.placed && c.fit.why.some(w => w.kind === 'preopen' || w.kind === 'batch'), `9 @17:00 → refused (${c.fit.why.map(w => w.kind).join(', ')})`)
  const m = sim.loadByMinute().filter(x => x.t < 17 * 60 && x.tot > 0); check(m.every(x => x.tot <= 8) && m.length === 15, `pre-open minutes 16:45–16:59 carry exactly the run-up batch (${m.length} minutes, max ${Math.max(...m.map(x => x.tot))})`) }
console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ the grill never exceeds the batch or the ceiling at any minute'}`)
process.exit(fails ? 1 : 0)
