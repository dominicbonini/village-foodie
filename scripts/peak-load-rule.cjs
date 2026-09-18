#!/usr/bin/env node
// scripts/peak-load-rule.cjs — the per-category batch is judged by the PEAK in the oven, not the sum of
// batches touching a window.
//   node scripts/peak-load-rule.cjs
//
// 🔴 FAILURE MODE (18 September 2026, Dominic's board): 5 pizzas cooking 21:55–22:10 and 8 cooking
// 22:10–22:25 are back to back — never more than 8 in the oven — yet the window [22:00, 22:15) SUMMED
// them to 13; two back-to-back batches of 4 summed to 8 and a single pizza at 22:15 was REFUSED though only
// 5 would ever cook at once. categoryLoadOver now returns the most items of the category on the grill at any
// one instant of the span, and that ONE number feeds admission (reserveBatches / fitOrderBackward), the
// window tone, the dot label and detectCapacityBreaches. Peak ≤ sum, so admission is a SUPERSET of before;
// on an aligned grid every overlapping batch starts at the span's start, so peak == sum and nothing moves.
const fs = require('fs'), os = require('os'), path = require('path')
const { load, REPO, fmt, mins, NEG, grid, rng, Sim } = require('./_batch-reservation-sim.cjs')
let fails = 0; const check = (ok, l) => { console.log(`  ${ok ? '✓' : '🔴'} ${l}`); if (!ok) fails++ }
const P15 = { pizza: { secs: 900, batch: 8, countsToCapacity: true } }
const FOUR = { '22:10': { pizza: 4 }, '22:25': { pizza: 4 } }
const BOARD = { '17:15': { pizza: 9 }, '18:15': { pizza: 8 }, '19:00': { pizza: 8 }, '19:15': { pizza: 8 }, '20:55': { pizza: 16 }, '21:05': { pizza: 4 }, '21:15': { pizza: 2 }, '21:20': { pizza: 1 }, '21:25': { pizza: 1 }, '21:45': { pizza: 8 }, '21:50': { pizza: 2 }, '21:55': { pizza: 2 }, '22:00': { pizza: 1 }, '22:10': { pizza: 5 }, '22:25': { pizza: 8 } }
const BOARD_RES = [{ orderKey: 'k21', slot: '22:25', source: 'fit', cats: { pizza: { items: 8, batch: 8, prepMins: 15, windows: [{ startMins: 1330, endMins: 1345, items: 8 }] } } }]
/** One dot and one verdict for a (units, reservations) state on a 5-minute grid, 17:00–23:00, kc null. */
function look(X, units, res, T, n, on) {
  const times = grid(X, 17 * 60, 23 * 60, 5)
  const ind = X.D.buildSlotIndicators(times, units, P15, null, 17 * 60, ['pizza'], 10, 5, res, on).get(T)
  const back = X.E.projectBackwardOccupancy(units, P15, 17 * 60, null, 10, res, on)
  const fit = X.E.fitOrderBackward(back, mins(T), { pizza: n }, P15, null, 17 * 60, 10, NEG, units[T] || {}, on)
  return { tone: ind.tone, label: ind.label, fits: fit.fits, line: `${T} ${ind.emoji} "${ind.label}" · ${n} fits? ${fit.fits}` }
}
function variant(tag, patches) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `peak-${tag}-`)); fs.cpSync(path.join(REPO, 'lib'), path.join(tmp, 'lib'), { recursive: true }); fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules'))
  const f = path.join(tmp, 'lib/slot-availability.ts'); let src = fs.readFileSync(f, 'utf8')
  for (const [a, b] of patches) { if (src.split(a).length !== 2) { console.log(`🔴 ${tag}: patch anchor not found exactly once: ${a.slice(0, 70)}`); process.exit(1) } src = src.replace(a, b) }
  fs.writeFileSync(f, src); const X = load(tmp, `peak${tag}`); X.tmp = tmp; return X
}
const SUM_PATCH = ['  return peakLoadOver(batches, fromMins, toMins, false)\n}', '  let load = 0; for (const b of batches) if (b.startMins < toMins && fromMins < b.endMins) load += b.items; return load\n}']

console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')
{ // V1 — the old SUM restored: the 4 + 4 case must be refused again.
  const X = variant('v1', [SUM_PATCH]); const r = look(X, FOUR, [], '22:15', 1, true)
  const bad = !r.fits; console.log(`  ${bad ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 sum restored — 4 @22:10 + 4 @22:25, 1 pizza at 22:15: ${r.line}`); fs.rmSync(X.tmp, { recursive: true, force: true }); if (!bad) process.exit(1) }
{ // V2 — a closed-left overlap (a batch ending exactly as the span begins counts, in the filter and at the instant).
  const X = variant('v2', [['if (iv.endMins > iv.startMins) { if (iv.startMins <= t && t < iv.endMins) c += iv.items }', 'if (iv.endMins > iv.startMins) { if (iv.startMins <= t && t <= iv.endMins) c += iv.items }']])
  const r = look(X, { '22:25': { pizza: 8 } }, [], '22:40', 1, true)   // 8 cook 22:10–22:25; a pizza for 22:40 cooks 22:25–22:40 — back to back
  const bad = !r.fits || r.tone !== 'green'; console.log(`  ${bad ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V2 closed-left — 8 @22:25 then 1 pizza at 22:40 (touching): ${r.line}`); fs.rmSync(X.tmp, { recursive: true, force: true }); if (!bad) process.exit(1) }
{ // V3 — PEAK for the tone but SUM for admission: display and picker must disagree.
  const X = variant('v3', [['    const existing = categoryLoadOver(intervals, cat, ws, ws + P)\n', '    let existing = 0; for (const iv of intervals) if (iv.cat === cat && iv.items > 0 && iv.endMins > iv.startMins && iv.startMins < ws + P && ws < iv.endMins) existing += iv.items\n']])
  const r = look(X, FOUR, [], '22:15', 1, true)
  const bad = r.tone !== 'red' && !r.fits; console.log(`  ${bad ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V3 peak for the tone, sum for admission — 4 + 4 at 22:15: ${r.line} (amber dot, refused ⇒ DISPLAY ≠ PICKER)`); fs.rmSync(X.tmp, { recursive: true, force: true }); if (!bad) process.exit(1) }

const X = load(REPO, 'peakReal')
const OLD = variant('old', [SUM_PATCH])
console.log('\n── THE TWO NAMED CASES (prep 15, batch 8, kc NULL, 5-minute grid) ─────────────────────────')
for (const on of [true, false]) {
  const a = look(X, FOUR, [], '22:15', 1, on), b = look(OLD, FOUR, [], '22:15', 1, on)
  // The LABEL is the span total (19 September 2026): 22:15's fifteen minutes cover both back-to-back
  // batches, so it reads 8 — while the COLOUR, which this harness is about, is still the peak of 4.
  check(a.fits && a.tone === 'amber' && a.label === '8 Pizzas', `switch ${on ? 'ON ' : 'OFF'} · 4 @22:10 + 4 @22:25 · 1 pizza at 22:15 FITS, and the dot is AMBER on a peak of 4 (its label totals the stretch): ${a.line} (sum said fits? ${b.fits})`)
  const res = on ? BOARD_RES : []
  const d = look(X, BOARD, res, '22:15', 1, on), e = look(X, BOARD, res, '22:20', 1, on), f = look(X, BOARD, res, '22:10', 1, on)
  check(!d.fits && d.tone === 'red' && d.label === '13 Pizzas' && !e.fits && e.label === '13 Pizzas', `switch ${on ? 'ON ' : 'OFF'} · Dominic's board (5 @22:10, 8 @22:25) · 22:15 still RED and refused; its label totals the stretch (13), its colour is the peak (8 = the batch): ${d.line} · 22:20: ${e.line}`)
  check(f.fits && f.label === '6 Pizzas', `switch ${on ? 'ON ' : 'OFF'} · …and 22:10 totals 6 over its stretch (5 + the 1 @22:00) and takes one more: ${f.line}`)
}

console.log('\n── INSTANT SAFETY and SUPERSET over seeded states ───────────────────────────────────────')
const SHAPES = []
for (const iv of [5, 10, 15]) for (const [secs, batch] of [[300, 2], [600, 4], [900, 8]]) for (const kc of [null, 9]) {
  SHAPES.push({ name: `prep ${secs / 60} / batch ${batch} / ${iv}-min grid / kc ${kc}`, cfg: { pizza: { secs, batch, countsToCapacity: true }, side: { secs: 0, batch: 1, countsToCapacity: true } }, kc, cw: 5, iv })
  SHAPES.push({ name: `two cats (${secs / 60}/${batch}, 15/6) + instant / ${iv}-min grid / kc ${kc}`, cfg: { pizza: { secs, batch, countsToCapacity: true }, burger: { secs: 900, batch: 6, countsToCapacity: true }, side: { secs: 0, batch: 1, countsToCapacity: true } }, kc, cw: 5, iv })
}
{ const r = rng(2718); let states = 0, admitted = 0, viol = 0, first = null, checks = 0, oldAccepted = 0, lost = 0, gained = 0, firstLost = null
  for (let s = 0; s < 180; s++) {
    const cx = { ...SHAPES[s % SHAPES.length], start: 17 * 60, end: 20 * 60 }
    const sim = Sim(OLD, cx), times = grid(X, cx.start, cx.end, cx.iv), cats = Object.keys(cx.cfg)
    for (let step = 0; step < 14; step++) {
      const qty = {}; for (const c of cats) if (r() < 0.7) qty[c] = 1 + Math.floor(r() * 2 * Math.max(1, cx.cfg[c].batch)); if (!Object.keys(qty).length) qty[cats[0]] = 1
      const T = times[Math.floor(r() * times.length)].collection_time
      // SUPERSET: the SAME state (built by the old rule's admissions), the same candidate, both engines.
      const u = sim.units(), res = sim.reservations()
      const bNew = X.E.projectBackwardOccupancy(u, cx.cfg, cx.start, cx.kc, cx.cw, res, true)
      const fitNew = X.E.fitOrderBackward(bNew, mins(T), qty, cx.cfg, cx.kc, cx.start, cx.cw, NEG, u[T] || {}, true)
      const placedOld = sim.place(T, qty); states++
      if (placedOld.placed) { oldAccepted++; if (!fitNew.fits) { lost++; if (!firstLost) firstLost = { shape: cx.name, T, qty, why: JSON.stringify(fitNew.why).slice(0, 120) } } }
      else if (fitNew.fits) gained++
      // INSTANT SAFETY under the NEW rule: admit the same candidate into a NEW-rule copy of the state and read every minute.
      if (fitNew.fits) { admitted++
        const adm = X.E.buildAdmittedReservation({ back: bNew, slotLabel: T, qtyByCat: qty, catConfigs: cx.cfg, kitchenCapacity: cx.kc, eventStartMins: cx.start, capacityWindowMins: cx.cw, nowMins: NEG, gridIntervalMins: cx.iv })
        const u2 = JSON.parse(JSON.stringify(u)); u2[T] = u2[T] || {}; for (const [c, n] of Object.entries(qty)) u2[T][c] = (u2[T][c] || 0) + n
        const res2 = adm.record ? [...res, { orderKey: 'cand', slot: T, source: adm.record.source, cats: adm.record.cats }] : res   // an instant-only order carries no record
        const b2 = X.E.projectBackwardOccupancy(u2, cx.cfg, cx.start, cx.kc, cx.cw, res2, true)
        for (let t = cx.start - 30; t <= cx.end; t++) { const per = {}; let tot = 0
          for (const iv of b2.intervals) if (iv.items > 0 && iv.endMins > iv.startMins && iv.startMins <= t && t < iv.endMins) { per[iv.cat] = (per[iv.cat] || 0) + iv.items; tot += iv.items }
          checks++
          for (const [c, n] of Object.entries(per)) if (cx.cfg[c].secs > 0 && n > cx.cfg[c].batch + 1e-9) { viol++; if (!first) first = { shape: cx.name, t: fmt(t), cat: c, n, T, qty } }
          if (cx.kc != null && tot > cx.kc + 1e-9) { viol++; if (!first) first = { shape: cx.name, t: fmt(t), tot, T, qty } } }
      }
    }
  }
  check(states >= 2000, `${states} seeded states over ${SHAPES.length} shapes (preps 5/10/15, batches 2/4/8, grids 5/10/15, two categories + an instant, kc null/9, the pre-open run-up)`)
  check(viol === 0, `INSTANT SAFETY: ${admitted} admissions under the peak rule, ${checks} minute-checks: ${viol} minutes over the batch or the ceiling${first ? ' — first ' + JSON.stringify(first) : ''}`)
  check(lost === 0, `SUPERSET: ${oldAccepted} candidates the SUM rule accepted — ${lost} refused by the peak rule${firstLost ? ' — first ' + JSON.stringify(firstLost) : ''}; ${gained} the sum refused now fit`)
}

console.log('\n── ONE NUMBER: tone, label, admission and breach read the same peak ──────────────────────')
{ const r = rng(1618); let windows = 0, mism = 0, breaches = 0, bmism = 0, aligned = 0, alignedDiff = 0; let ex = null
  for (let s = 0; s < 240; s++) {
    const cx = { ...SHAPES[s % SHAPES.length], start: 17 * 60, end: 20 * 60 }, times = grid(X, cx.start, cx.end, cx.iv), cats = Object.keys(cx.cfg).filter(c => cx.cfg[c].secs > 0)
    const units = {}; for (let i = 0; i < 6; i++) { const T = times[Math.floor(r() * times.length)].collection_time; units[T] = units[T] || {}; const c = cats[Math.floor(r() * cats.length)]; units[T][c] = (units[T][c] || 0) + 1 + Math.floor(r() * cx.cfg[c].batch) }
    const back = X.E.projectBackwardOccupancy(units, cx.cfg, cx.start, cx.kc, cx.cw, [], true)
    const ind = X.D.buildSlotIndicators(times, units, cx.cfg, cx.kc, cx.start, Object.keys(cx.cfg), cx.cw, cx.iv, [], true)
    const br = X.B.detectCapacityBreaches({ times, productionSlotUnits: units, catConfigs: cx.cfg, kitchenCapacity: cx.kc, eventStartMins: cx.start, capacityWindowMins: cx.cw, intervalMins: cx.iv, orders: [], reservations: [], batchReservations: true })
    const isAligned = cats.every(c => cx.iv % Math.round(cx.cfg[c].secs / 60) === 0)
    const step = X.E.backwardWindowStepMins(cx.cfg)
    for (const w of back.windows) {
      for (const c of cats) { if (w.byCat[c] == null) continue; windows++
        const prep = Math.round(cx.cfg[c].secs / 60), batch = Math.max(1, cx.cfg[c].batch)
        const helper = X.E.categoryLoadOver(back.intervals, c, w.startMins, w.startMins + prep)
        const viaTone = batch - w.remainingByCat[c]
        const adm = X.E.reserveBatches({ intervals: back.intervals, cat: c, slotMins: w.startMins + prep, items: 1, batch, prepMins: prep, kitchenCapacity: null, floorMins: -1e9 }).windows[0].existing
        if (Math.abs(helper - viaTone) > 1e-9 || Math.abs(helper - adm) > 1e-9) { mism++; ex = ex || { shape: cx.name, w: fmt(w.startMins), c, helper, viaTone, adm } }
        // the dot at the window's end, on a 5-minute grid with a single cooking category, labels the same number
        // 🔴 THE DOT'S LABEL IS NO LONGER THIS NUMBER, BY DESIGN (19 September 2026). It is the TOTAL
        // cooked in the stretch the dot covers; this identity is about the PEAK, which the tone and
        // admission share. The label's own rule is asserted in scripts/dot-overlap-labels.cjs and
        // scripts/slot-interval-dots.cjs — including that a red dot never reads below the peak.
        void ind
        if (isAligned) { aligned++; let sum = 0; for (const iv of back.intervals) if (iv.cat === c && iv.items > 0 && iv.endMins > iv.startMins && iv.startMins < w.startMins + prep && w.startMins < iv.endMins) sum += iv.items; if (Math.abs(sum - helper) > 1e-9) alignedDiff++ }
      }
    }
    // the detector's own window read: the pile or the window ending here at 5; the covering read on a 10–30 grid
    const ordered = times.map(t => mins(t.collection_time)); const prevOf = m => { const i = ordered.indexOf(m); return i > 0 ? ordered[i - 1] : null }
    for (const b of br) { const T = mins(b.collection_time)
      const w = cx.iv > 5 ? X.E.coverDotWindows(back, T, prevOf(T), step, cx.start) : (back.pileByStart.get(T) ?? back.byStart.get(T - step) ?? null)
      const m = (b.reason || '').match(/(\d+)\/(\d+)/); if (!m || !w) continue   // a ceiling or pile reason names no per-category number
      breaches++; const bound = m[0]; let ok = false
      for (const [c, rem] of Object.entries(w.remainingByCat || {})) if (`${Math.round(Math.max(1, cx.cfg[c].batch) - rem)}/${Math.max(1, cx.cfg[c].batch)}` === bound) ok = true
      if (!ok) bmism++ }
  }
  check(mism === 0, `${windows} (window, category) reads: categoryLoadOver == batch − remainingByCat (the tone) == reserveBatches' existing (admission): ${mism} disagree${ex ? ' — ' + JSON.stringify(ex) : ''}`)
  check(bmism === 0, `${breaches} breach entries: the reason's "n/batch" is the same number: ${bmism} disagree`)
  check(alignedDiff === 0, `ALIGNED: ${aligned} (window, category) reads where the grid is a multiple of every prep — peak == sum in ${aligned - alignedDiff}, differ ${alignedDiff}`)
}
fs.rmSync(OLD.tmp, { recursive: true, force: true })
console.log(fails ? `\n🔴 ${fails} FAILED` : '\n✅ the batch is judged by the peak in the oven, and every reader reads it')
process.exit(fails ? 1 : 0)
