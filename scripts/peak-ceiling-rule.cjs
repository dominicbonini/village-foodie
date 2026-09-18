#!/usr/bin/env node
// scripts/peak-ceiling-rule.cjs — the kitchen ceiling is judged by the PEAK in the kitchen, like the batch.
//   node scripts/peak-ceiling-rule.cjs
//
// 🔴 FAILURE MODE (18 September 2026, docs/peak-load-rule-report.md §4/§10): a 10-minute-prep truck with cap
// 6 and two batches that do not overlap (5 cooking 18:20–18:30, 4 cooking 18:30–18:40) showed 18:35 as
// ceiling-RED "5 Pizzas" and refused one more pizza — the ceiling SUMMED every real interval touching the
// span (9) while never more than 5 were in the kitchen. kitchenLoadOver, reserveBatches' per-window total
// and the window's own `conc` now read peakLoadOver — the ONE implementation windowScopedPeak and
// categoryLoadOver also use — so the dot, the label, admission and the breach detector name one number.
const fs = require('fs'), os = require('os'), path = require('path')
const { load, REPO, fmt, mins, NEG, grid, rng, Sim } = require('./_batch-reservation-sim.cjs')
let fails = 0; const check = (ok, l) => { console.log(`  ${ok ? '✓' : '🔴'} ${l}`); if (!ok) fails++ }
const P10 = { pizza: { secs: 600, batch: 8, countsToCapacity: true } }
const TEN = { '18:30': { pizza: 5 }, '18:40': { pizza: 4 } }          // §10: 5 cook 18:20–18:30, 4 cook 18:30–18:40
function look(X, cfg, units, T, n, kc, on, iv = 5) {
  const times = grid(X, 17 * 60, 20 * 60, iv)
  const ind = X.D.buildSlotIndicators(times, units, cfg, kc, 17 * 60, Object.keys(cfg), 5, iv, [], on).get(T)
  const back = X.E.projectBackwardOccupancy(units, cfg, 17 * 60, kc, 5, [], on)
  const fit = X.E.fitOrderBackward(back, mins(T), { pizza: n }, cfg, kc, 17 * 60, 5, NEG, units[T] || {}, on)
  const read = X.E.dotOccupancyAt(back, mins(T), mins(T) - iv, X.E.backwardWindowStepMins(cfg), 17 * 60, cfg, kc, iv, on)
  return { tone: ind.tone, label: ind.label, fits: fit.fits, kitchen: read.kitchen, line: `${T} ${ind.emoji} "${ind.label}" · kitchen ${read.kitchen ? read.kitchen.used + '/' + read.kitchen.cap : '-'} · ${n} fits? ${fit.fits}` }
}
function variant(tag, patches) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `ceil-${tag}-`)); fs.cpSync(path.join(REPO, 'lib'), path.join(tmp, 'lib'), { recursive: true }); fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules'))
  const f = path.join(tmp, 'lib/slot-availability.ts'); let src = fs.readFileSync(f, 'utf8')
  for (const [a, b] of patches) { if (src.split(a).length !== 2) { console.log(`🔴 ${tag}: patch anchor not found exactly once: ${a.slice(0, 80)}`); process.exit(1) } src = src.replace(a, b) }
  fs.writeFileSync(f, src); const X = load(tmp, `ceil${tag}`); X.tmp = tmp; return X
}
const CONC = 'if (iv.endMins > iv.startMins) { if (iv.startMins <= t && t < iv.endMins) c += iv.items }'
const KLO_NEW = '  return peakLoadOver(intervals, fromMins, toMins, false)\n}'
const KLO_SUM = '  let total = 0; for (const iv of intervals) if (iv.items > 0 && iv.endMins > iv.startMins && iv.startMins < toMins && fromMins < iv.endMins) total += iv.items; return total\n}'
const RB_NEW = '      const total = peakLoadOver(intervals, ws, ws + P, true)'
const RB_SUM = '      let total = 0; for (const iv of intervals) if (iv.items > 0 && iv.endMins > iv.startMins && iv.startMins < ws + P && ws < iv.endMins) total += iv.items'
const CONC_NEW = '      const conc = spanMins > 0 ? peakLoadOver(intervals, startMins, startMins + spanMins, false) : concurrencyAt(intervals, startMins)'
const CONC_OLD = '      const conc = concurrencyAt(intervals, startMins)'
const WSP_NEW = `function windowScopedPeak(allIntervals: CookInterval[], focus: CookInterval[]): number {
  let peak = 0
  let any = false
  for (const f of focus) {
    if (f.items <= 0) continue
    any = true
    const c = f.endMins > f.startMins
      ? peakLoadOver(allIntervals, f.startMins, f.endMins, true)   // the span: its start, every start inside, points inside
      : concurrencyAt(allIntervals, f.startMins)                    // the order's own point, at its instant
    if (c > peak) peak = c
  }
  return any ? peak : 0
}`
const WSP_OLD = `function windowScopedPeak(allIntervals: CookInterval[], focus: CookInterval[]): number {
  if (!focus.length) return 0
  const instants = new Set<number>()
  const cookingSpans: Array<[number, number]> = []
  for (const f of focus) {
    if (f.items <= 0) continue
    instants.add(f.startMins)
    if (f.endMins > f.startMins) cookingSpans.push([f.startMins, f.endMins])
  }
  if (!instants.size) return 0
  for (const iv of allIntervals) {
    if (iv.items <= 0) continue
    for (const [oS, oE] of cookingSpans) {
      if (iv.startMins >= oS && iv.startMins < oE) { instants.add(iv.startMins); break }
    }
  }
  let peak = 0
  for (const t of instants) { const c = concurrencyAt(allIntervals, t); if (c > peak) peak = c }
  return peak
}`

console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')
{ // V1 — the old ceiling SUM restored in the dot read, the window read and admission: §10 must be red and refused again.
  const X = variant('v1', [[KLO_NEW, KLO_SUM], [RB_NEW, RB_SUM], [CONC_NEW, CONC_OLD]]); const r = look(X, P10, TEN, '18:35', 1, 6, true)
  const bad = r.tone === 'red' && !r.fits; console.log(`  ${bad ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 ceiling sum restored — §10 at 18:35: ${r.line}`); fs.rmSync(X.tmp, { recursive: true, force: true }); if (!bad) process.exit(1) }
{ // V2 — a closed-left overlap in the one membership test: a batch ending at an instant still counts there.
  const X = variant('v2', [[CONC, 'if (iv.endMins > iv.startMins) { if (iv.startMins <= t && t <= iv.endMins) c += iv.items }']])
  const r = look(X, { pizza: { secs: 900, batch: 8, countsToCapacity: true } }, { '18:25': { pizza: 6 } }, '18:40', 1, 6, true)   // 6 cook 18:10–18:25; one more for 18:40 cooks 18:25–18:40 — touching
  const bad = !r.fits || r.tone !== 'green'; console.log(`  ${bad ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V2 closed-left — 6 @18:25 (cap 6) then 1 at 18:40, touching: ${r.line}`); fs.rmSync(X.tmp, { recursive: true, force: true }); if (!bad) process.exit(1) }
{ // V3 — PEAK for the ceiling tone but SUM for ceiling admission: the dot says room, the picker refuses.
  const X = variant('v3', [[RB_NEW, RB_SUM]]); const r = look(X, P10, TEN, '18:35', 1, 6, true)
  const bad = r.tone !== 'red' && !r.fits; console.log(`  ${bad ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V3 peak tone, sum admission — §10 at 18:35: ${r.line} (amber, refused ⇒ DISPLAY ≠ PICKER)`); fs.rmSync(X.tmp, { recursive: true, force: true }); if (!bad) process.exit(1) }

const X = load(REPO, 'ceilReal')
const OLD = variant('old', [[KLO_NEW, KLO_SUM], [RB_NEW, RB_SUM], [CONC_NEW, CONC_OLD]])   // the tree before this task (batch already peak)
console.log('\n── THE §10 CASE (prep 10, batch 8, cap 6, 5-minute grid) ─────────────────────────────────')
for (const on of [true, false]) {
  const a = look(X, P10, TEN, '18:35', 1, 6, on), b = look(OLD, P10, TEN, '18:35', 1, 6, on)
  // The LABEL totals the stretch (9 = both batches); the KITCHEN read — what this harness is about — is
  // still the peak, 5 of 6, which is why one more pizza fits.
  check(a.fits && a.tone === 'amber' && a.label === '9 Pizzas' && a.kitchen && a.kitchen.used === 5, `switch ${on ? 'ON ' : 'OFF'} · 5 @18:30 + 4 @18:40 · 18:35 amber, kitchen peak 5/6, 1 pizza FITS: ${a.line} (the sum said: ${b.line})`)
  const c = look(X, P10, TEN, '18:35', 2, 6, on)
  check(!c.fits, `switch ${on ? 'ON ' : 'OFF'} · …and 2 pizzas there do NOT (5 + 2 > cap 6): ${c.line}`)
}

console.log('\n── windowScopedPeak: the old body and the new give identical verdicts ─────────────────────')
{ const W = variant('wsp', [[WSP_NEW, WSP_OLD]]); const r = rng(4242); let n = 0, diff = 0; let ex = null
  for (let s = 0; s < 400; s++) {
    const prep = [5, 10, 15][s % 3], batch = [2, 4, 8][(s >> 1) % 3], kc = [2, 4, 6, 8][(s >> 2) % 4], cw = [5, 10][s % 2], iv = [5, 10, 15][(s >> 3) % 3]
    const cfg = { pizza: { secs: prep * 60, batch, countsToCapacity: true }, burger: { secs: 900, batch: 6, countsToCapacity: true }, side: { secs: 0, batch: 1, countsToCapacity: true } }
    const times = grid(X, 17 * 60, 20 * 60, iv); const units = {}
    for (let i = 0; i < 6; i++) { const T = times[Math.floor(r() * times.length)].collection_time; units[T] = units[T] || {}; const c = ['pizza', 'burger', 'side'][Math.floor(r() * 3)]; units[T][c] = (units[T][c] || 0) + 1 + Math.floor(r() * 3) }
    for (const on of [true, false]) {
      const bN = X.E.projectBackwardOccupancy(units, cfg, 17 * 60, kc, cw, [], on), bW = W.E.projectBackwardOccupancy(units, cfg, 17 * 60, kc, cw, [], on)
      for (const t of times) { const qty = { pizza: 1 + Math.floor(r() * 3), side: Math.floor(r() * 3) }
        const a = X.E.fitOrderBackward(bN, mins(t.collection_time), qty, cfg, kc, 17 * 60, cw, NEG, units[t.collection_time] || {}, on)
        const b = W.E.fitOrderBackward(bW, mins(t.collection_time), qty, cfg, kc, 17 * 60, cw, NEG, units[t.collection_time] || {}, on); n++
        const ja = JSON.stringify([a.fits, a.tone, a.bound_by, a.why]), jb = JSON.stringify([b.fits, b.tone, b.bound_by, b.why])
        if (ja !== jb) { diff++; ex = ex || { prep, batch, kc, cw, iv, on, t: t.collection_time, qty, a: ja.slice(0, 120), b: jb.slice(0, 120) } } } }
  }
  check(diff === 0, `${n} verdicts (fits, tone, bound_by, why) on states with instants and caps 2–8: old windowScopedPeak body vs the shared peakLoadOver — ${diff} differ${ex ? ' — ' + JSON.stringify(ex) : ''}`)
  fs.rmSync(W.tmp, { recursive: true, force: true }) }

console.log('\n── INSTANT SAFETY and SUPERSET over seeded states, kitchen cap SET ───────────────────────')
const SHAPES = []
for (const iv of [5, 10, 15]) for (const [secs, batch] of [[300, 2], [600, 4], [900, 8]]) for (const kc of [2, 4, 6, 8]) {
  SHAPES.push({ name: `prep ${secs / 60} / batch ${batch} / ${iv}-min grid / cap ${kc}`, cfg: { pizza: { secs, batch, countsToCapacity: true }, side: { secs: 0, batch: 1, countsToCapacity: true } }, kc, cw: 5, iv })
  SHAPES.push({ name: `two cats (${secs / 60}/${batch}, 15/6) + instant / ${iv}-min grid / cap ${kc}`, cfg: { pizza: { secs, batch, countsToCapacity: true }, burger: { secs: 900, batch: 6, countsToCapacity: true }, side: { secs: 0, batch: 1, countsToCapacity: true } }, kc, cw: 5, iv })
}
const concAt = (ivs, t) => { let c = 0; for (const iv of ivs) { if (iv.items <= 0) continue; if (iv.endMins > iv.startMins) { if (iv.startMins <= t && t < iv.endMins) c += iv.items } else if (iv.startMins === t) c += iv.items } return c }
{ const r = rng(1414); let states = 0, admitted = 0, viol = 0, first = null, checks = 0, oldAccepted = 0, lost = 0, gained = 0, firstLost = null
  for (let s = 0; s < 216; s++) {
    const cx = { ...SHAPES[s % SHAPES.length], start: 17 * 60, end: 20 * 60 }
    const sim = Sim(OLD, cx), times = grid(X, cx.start, cx.end, cx.iv), cats = Object.keys(cx.cfg)
    for (let step = 0; step < 12; step++) {
      const qty = {}; for (const c of cats) if (r() < 0.7) qty[c] = 1 + Math.floor(r() * Math.max(1, Math.min(cx.cfg[c].secs ? cx.cfg[c].batch : 2, cx.kc))); if (!Object.keys(qty).length) qty[cats[0]] = 1
      const T = times[Math.floor(r() * times.length)].collection_time
      const u = sim.units(), res = sim.reservations()
      const bNew = X.E.projectBackwardOccupancy(u, cx.cfg, cx.start, cx.kc, cx.cw, res, true)
      const fitNew = X.E.fitOrderBackward(bNew, mins(T), qty, cx.cfg, cx.kc, cx.start, cx.cw, NEG, u[T] || {}, true)
      const placedOld = sim.place(T, qty); states++
      if (placedOld.placed) { oldAccepted++; if (!fitNew.fits) { lost++; if (!firstLost) firstLost = { shape: cx.name, T, qty, why: JSON.stringify(fitNew.why).slice(0, 140) } } } else if (fitNew.fits) gained++
      if (fitNew.fits) { admitted++
        const adm = X.E.buildAdmittedReservation({ back: bNew, slotLabel: T, qtyByCat: qty, catConfigs: cx.cfg, kitchenCapacity: cx.kc, eventStartMins: cx.start, capacityWindowMins: cx.cw, nowMins: NEG, gridIntervalMins: cx.iv })
        const u2 = JSON.parse(JSON.stringify(u)); u2[T] = u2[T] || {}; for (const [c, n] of Object.entries(qty)) u2[T][c] = (u2[T][c] || 0) + n
        const res2 = adm.record ? [...res, { orderKey: 'cand', slot: T, source: adm.record.source, cats: adm.record.cats }] : res
        const b2 = X.E.projectBackwardOccupancy(u2, cx.cfg, cx.start, cx.kc, cx.cw, res2, true)
        for (let t = cx.start - 30; t <= cx.end; t++) { checks++
          const per = {}; for (const iv of b2.intervals) if (iv.items > 0 && iv.endMins > iv.startMins && iv.startMins <= t && t < iv.endMins) per[iv.cat] = (per[iv.cat] || 0) + iv.items
          for (const [c, n] of Object.entries(per)) if (cx.cfg[c].secs > 0 && n > cx.cfg[c].batch + 1e-9) { viol++; if (!first) first = { shape: cx.name, t: fmt(t), cat: c, n, T, qty } }
          const tot = concAt(b2.intervals, t); if (tot > cx.kc + 1e-9) { viol++; if (!first) first = { shape: cx.name, t: fmt(t), tot, cap: cx.kc, T, qty } } }
      }
    }
  }
  check(states >= 2000, `${states} seeded states over ${SHAPES.length} shapes (caps 2/4/6/8, preps 5/10/15, grids 5/10/15, two cooking categories + an instant, the pre-open run-up)`)
  check(viol === 0, `INSTANT SAFETY: ${admitted} admissions, ${checks} minute-checks (points counted at their instant): ${viol} minutes over a batch or the cap${first ? ' — first ' + JSON.stringify(first) : ''}`)
  check(lost === 0, `SUPERSET: ${oldAccepted} candidates the SUM ceiling accepted — ${lost} refused now${firstLost ? ' — first ' + JSON.stringify(firstLost) : ''}; ${gained} it refused now fit`)
}

console.log('\n── ONE NUMBER for the ceiling: window tone, dot, admission and breach ────────────────────')
{ const r = rng(2727); let windows = 0, mism = 0, admEq = 0, admDiff = 0, breaches = 0, bmism = 0, labels = 0, lmism = 0, aligned = 0, alignedDiff = 0; let ex = null, lex = null
  for (let s = 0; s < 300; s++) {
    const cx = { ...SHAPES[s % SHAPES.length], start: 17 * 60, end: 20 * 60 }, times = grid(X, cx.start, cx.end, cx.iv), cats = Object.keys(cx.cfg).filter(c => cx.cfg[c].secs > 0)
    const single = cats.length === 1, withInstants = s % 3 !== 0
    const units = {}; for (let i = 0; i < 6; i++) { const T = times[Math.floor(r() * times.length)].collection_time; units[T] = units[T] || {}; const c = cats[Math.floor(r() * cats.length)]; units[T][c] = (units[T][c] || 0) + 1 + Math.floor(r() * cx.cfg[c].batch); if (withInstants && r() < 0.5) units[T].side = (units[T].side || 0) + 1 + Math.floor(r() * 2) }
    const back = X.E.projectBackwardOccupancy(units, cx.cfg, cx.start, cx.kc, cx.cw, [], true)
    const ind = X.D.buildSlotIndicators(times, units, cx.cfg, cx.kc, cx.start, Object.keys(cx.cfg), cx.cw, cx.iv, [], true)
    const br = X.B.detectCapacityBreaches({ times, productionSlotUnits: units, catConfigs: cx.cfg, kitchenCapacity: cx.kc, eventStartMins: cx.start, capacityWindowMins: cx.cw, intervalMins: cx.iv, orders: [], reservations: [], batchReservations: true })
    const step = X.E.backwardWindowStepMins(cx.cfg); const isAligned = cats.every(c => cx.iv % Math.round(cx.cfg[c].secs / 60) === 0)
    const ordered = times.map(t => mins(t.collection_time)); const prevOf = m => { const i = ordered.indexOf(m); return i > 0 ? ordered[i - 1] : null }
    for (const w of back.windows) { if (w.beforeEventStart) continue
      let span = 0; for (const c of cats) if (w.byCat[c] != null) span = Math.max(span, Math.round(cx.cfg[c].secs / 60)); if (!span) continue
      windows++
      const viaTone = cx.kc - w.remainingTotal                                          // the window tone's ceiling number
      const helper = X.E.peakLoadOver(back.intervals, w.startMins, w.startMins + span, false)
      if (Math.abs(viaTone - helper) > 1e-9) { mism++; ex = ex || { shape: cx.name, w: fmt(w.startMins), viaTone, helper } }
      // the dot ending here (5-minute grid, single cooking category: the same span)
      if (cx.iv === 5 && single) { const T = w.startMins + span; const read = X.E.dotOccupancyAt(back, T, prevOf(T), step, cx.start, cx.cfg, cx.kc, cx.iv, true)
        if (read.kitchen && Math.abs(read.kitchen.used - helper) > 1e-9) { mism++; ex = ex || { shape: cx.name, dot: fmt(T), dotKitchen: read.kitchen.used, helper } }
        // the label of a dot red BY THE CEILING carries the ceiling's number (no instants seated: the categories are all there is)
        const d = ind.get(fmt(T)); if (d && d.tone === 'red' && !withInstants && read.window && read.window.bound_by === 'global ceiling' && !back.pileByStart.has(T)) { labels++; const n = (d.label.match(/(\d+) /g) || []).reduce((a, m) => a + Number(m), 0); if (n !== Math.round(helper)) { lmism++; lex = lex || { shape: cx.name, dot: fmt(T), label: d.label, ceiling: helper } } } }
      // admission's per-window ceiling read (points inside included) — equal unless a point sits strictly inside
      const adm = X.E.peakLoadOver(back.intervals, w.startMins, w.startMins + span, true); if (Math.abs(adm - helper) > 1e-9) admDiff++; else admEq++
      if (isAligned && single) { aligned++; const old = concAt(back.intervals, w.startMins); if (Math.abs(old - helper) > 1e-9) alignedDiff++ }
    }
    for (const b of br) { if (!(b.over_total > 0)) continue; const T = mins(b.collection_time)
      const w = cx.iv > 5 ? X.E.coverDotWindows(back, T, prevOf(T), step, cx.start) : (back.pileByStart.get(T) ?? back.byStart.get(T - step) ?? null); if (!w) continue
      breaches++; if (Math.round(-w.remainingTotal) !== b.over_total) bmism++ }
  }
  check(mism === 0, `${windows} windows with a cap: the tone's ceiling number == peakLoadOver over the window's span == the dot's kitchen read: ${mism} disagree${ex ? ' — ' + JSON.stringify(ex) : ''}`)
  check(bmism === 0, `${breaches} ceiling breach entries: over_total is that same number minus the cap: ${bmism} disagree`)
  check(lmism === 0, `${labels} single-category dots red BY THE CEILING (no instants): the label's number == the ceiling peak: ${lmism} disagree${lex ? ' — ' + JSON.stringify(lex) : ''}`)
  console.log(`  ℹ admission's per-window read (points inside counted) equals the display read on ${admEq} windows and exceeds it on ${admDiff} — only where an instant point sits strictly inside a window at no cooking start (windowScopedPeak always counted those; the dot never did)`)
  check(alignedDiff === 0, `ALIGNED, single prep: ${aligned} windows where the grid is a multiple of the prep — the span peak == today's concurrency at the window's start in ${aligned - alignedDiff}, differ ${alignedDiff}`)
}

console.log('\n── ALIGNED IDENTITY against the sum-ceiling tree: dots, verdicts, /api/slots, breaches ─────')
{ const r = rng(2727); let states = 0, single = 0, mixed = 0, dots = 0, verdicts = 0, avail = 0, breaches = 0; const ex = []
  for (let s = 0; s < 300; s++) {
    const cx = { ...SHAPES[s % SHAPES.length], start: 17 * 60, end: 20 * 60 }, times = grid(X, cx.start, cx.end, cx.iv), cats = Object.keys(cx.cfg).filter(c => cx.cfg[c].secs > 0)
    const withInstants = s % 3 !== 0
    const units = {}; for (let i = 0; i < 6; i++) { const T = times[Math.floor(r() * times.length)].collection_time; units[T] = units[T] || {}; const c = cats[Math.floor(r() * cats.length)]; units[T][c] = (units[T][c] || 0) + 1 + Math.floor(r() * cx.cfg[c].batch); if (withInstants && r() < 0.5) units[T].side = (units[T].side || 0) + 1 + Math.floor(r() * 2) }
    // 🔴 ALIGNED MEANS GRID == PREP (19 September 2026). "prep divides the grid" also admitted a 5-minute
    // cook on a 15-minute grid, where one dot covers three cooking windows. Such a dot is a COVER, and a
    // cover now reports its own stretch instead of the fullest window it covers, so it changes by design
    // (docs/cover-dot-own-window-report.md). Grid == prep is the case where cover and window coincide.
    if (!cats.every(c => cx.iv === Math.round(cx.cfg[c].secs / 60))) continue
    states++; if (cats.length === 1) single++; else mixed++
    for (const on of [true, false]) {
      const pick = ind => JSON.stringify([...ind].map(([t, i]) => [t, i.tone, i.label]))
      if (pick(X.D.buildSlotIndicators(times, units, cx.cfg, cx.kc, cx.start, Object.keys(cx.cfg), cx.cw, cx.iv, [], on)) !== pick(OLD.D.buildSlotIndicators(times, units, cx.cfg, cx.kc, cx.start, Object.keys(cx.cfg), cx.cw, cx.iv, [], on))) { dots++; if (ex.length < 3) ex.push({ kind: 'dots', shape: cx.name, on }) }
      const bN = X.E.projectBackwardOccupancy(units, cx.cfg, cx.start, cx.kc, cx.cw, [], on), bO = OLD.E.projectBackwardOccupancy(units, cx.cfg, cx.start, cx.kc, cx.cw, [], on)
      const v = (E, b) => JSON.stringify(times.map(t => E.fitOrderBackward(b, mins(t.collection_time), { pizza: 1 }, cx.cfg, cx.kc, cx.start, cx.cw, NEG, units[t.collection_time] || {}, on).fits))
      if (v(X.E, bN) !== v(OLD.E, bO)) { verdicts++; if (ex.length < 3) ex.push({ kind: 'verdicts', shape: cx.name, on }) }
      const a = (E) => JSON.stringify(E.buildSlotAvailability({ times, productionSlotUnits: units, catConfigs: cx.cfg, kitchenCapacity: cx.kc, eventStartMins: cx.start, capacityWindowMins: cx.cw, displayIntervalMins: cx.iv, reservations: [], batchReservations: on }).map(x => [x.collection_time, x.available, x.tone, x.remaining]))
      if (a(X.E) !== a(OLD.E)) { avail++; if (ex.length < 3) ex.push({ kind: '/api/slots', shape: cx.name, on }) }
      const b = (B) => JSON.stringify(B.detectCapacityBreaches({ times, productionSlotUnits: units, catConfigs: cx.cfg, kitchenCapacity: cx.kc, eventStartMins: cx.start, capacityWindowMins: cx.cw, intervalMins: cx.iv, orders: [], reservations: [], batchReservations: on }).map(x => [x.collection_time, x.reason, x.over_total]))
      if (b(X.B) !== b(OLD.B)) { breaches++; if (ex.length < 3) ex.push({ kind: 'breaches', shape: cx.name, on }) }
    }
  }
  check(dots === 0 && verdicts === 0 && avail === 0 && breaches === 0, `${states} aligned states, grid == prep (${single} single-category, ${mixed} multi-category) × ON/OFF: dots differ ${dots} · one-pizza verdicts differ ${verdicts} · /api/slots (available, tone, remaining) differ ${avail} · breaches differ ${breaches}${ex.length ? ' — ' + JSON.stringify(ex) : ''}`)
}

console.log('\n── GUSTO-SHAPED: prep 5 / batch 2 / cap 2 / window 5 / 5-minute grid — unchanged ────────────')
{ const r = rng(5150); const cfg = { pizza: { secs: 300, batch: 2, countsToCapacity: true }, drink: { secs: 0, batch: 1, countsToCapacity: true } }; let n = 0, diff = 0
  const times = grid(X, 17 * 60, 20 * 60, 5)
  for (let s = 0; s < 300; s++) { const units = {}; for (let i = 0; i < 8; i++) { const T = times[Math.floor(r() * times.length)].collection_time; units[T] = units[T] || {}; units[T].pizza = (units[T].pizza || 0) + 1 + Math.floor(r() * 2); if (r() < 0.4) units[T].drink = (units[T].drink || 0) + 1 }
    for (const on of [true, false]) {
      const a = JSON.stringify([...X.D.buildSlotIndicators(times, units, cfg, 2, 17 * 60, ['pizza', 'drink'], 5, 5, [], on)].map(([t, i]) => [t, i.tone, i.label]))
      const b = JSON.stringify([...OLD.D.buildSlotIndicators(times, units, cfg, 2, 17 * 60, ['pizza', 'drink'], 5, 5, [], on)].map(([t, i]) => [t, i.tone, i.label]))
      const bN = X.E.projectBackwardOccupancy(units, cfg, 17 * 60, 2, 5, [], on), bO = OLD.E.projectBackwardOccupancy(units, cfg, 17 * 60, 2, 5, [], on)
      const fa = times.map(t => X.E.fitOrderBackward(bN, mins(t.collection_time), { pizza: 1 }, cfg, 2, 17 * 60, 5, NEG, units[t.collection_time] || {}, on).fits)
      const fb = times.map(t => OLD.E.fitOrderBackward(bO, mins(t.collection_time), { pizza: 1 }, cfg, 2, 17 * 60, 5, NEG, units[t.collection_time] || {}, on).fits)
      n++; if (a !== b || JSON.stringify(fa) !== JSON.stringify(fb)) diff++ } }
  check(diff === 0, `${n} Gusto-shaped states (ON and OFF): dots and one-pizza verdicts identical to the sum-ceiling tree in ${n - diff}, differ ${diff}`) }
fs.rmSync(OLD.tmp, { recursive: true, force: true })
console.log(fails ? `\n🔴 ${fails} FAILED` : '\n✅ the ceiling is judged by the peak in the kitchen, through the one implementation every reader shares')
process.exit(fails ? 1 : 0)
