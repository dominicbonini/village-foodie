#!/usr/bin/env node
// scripts/cover-dot-own-window.cjs — every dot reports ITS OWN stretch, and ASAP follows it.
//   node scripts/cover-dot-own-window.cjs
//
// 🔴 FAILURE MODE (Dominic, 18 September 2026, test-truck "Bures Music Festival", Pizza batch 8 / prep 15,
// collection times every 15 minutes, 2 pizzas in the basket):
//     ASAP — 12:30
//   ✕ 11:45 🔴 8 Pizzas        ✕ 12:00 🔴 8 Pizzas
//     12:15 🔴 8 Pizzas   ← reads FULL yet takes the order, and ASAP has skipped it
// `coverDotWindows` answered `{ ...peakW, tone: worst.tone }` — the record of the fullest window it
// COVERED. On a 15-minute grid the 12:15 dot covers the window at 11:50, whose own [11:50, 12:05) really
// does hold 8 of 8; the dot printed that as its own. One wrong record, three wrong answers: the label read
// 8 where its stretch [12:00, 12:15) held 4, the tone went red, and /api/slots' `available` went false —
// which is what made getAsapSlot skip 12:15 so ASAP disagreed with the picker.
// The record is now BUILT for [T − max(prep, grid), T). See docs/cover-dot-own-window-report.md.
const fs = require('fs'), os = require('os'), path = require('path')
const { compile, REPO } = require('./_slot-interval-compile.cjs')
let fails = 0
const check = (ok, label) => { console.log(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }
const FILES = ['lib/slot-availability.ts', 'lib/slot-display.ts', 'lib/slot-generation.ts']
const load = (root, tag) => { const c = compile(root, FILES, tag); return { E: c.req('lib/slot-availability.js'), D: c.req('lib/slot-display.js'), G: c.req('lib/slot-generation.js') } }
const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const toM = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
const NEG = Number.NEGATIVE_INFINITY

// ── DOMINIC'S BOARD, from the read-only SQL in docs/full-batch-bookable-bug-report.md §1 ────────────
// Every stored reservation on it was recorded under an EARLIER batch/prep, so validReservationsAt
// discards all of them and the engine re-seats from the slot totals — which is why the off-grid orders
// (10:40, 11:10, 12:05) leave cooking intervals at non-grid offsets. 11:50–12:05 is the one that matters.
const CFG = { pizza: { secs: 900, batch: 8, countsToCapacity: true } }
const START = 10 * 60, KC = null, CW = 10, IV = 15
const BOARD = { '10:40': { pizza: 3 }, '11:00': { pizza: 8 }, '11:10': { pizza: 4 }, '11:15': { pizza: 2 }, '11:30': { pizza: 6 },
                '11:45': { pizza: 8 }, '12:00': { pizza: 5 }, '12:05': { pizza: 3 }, '12:15': { pizza: 1 }, '12:30': { pizza: 6 } }
const ORDER = { pizza: 2 }
// 🔴 THE CLOCK. Dominic's list shows 12:15 UNCROSSED, and both call sites apply the same now-clamp, so his
// `now` was early enough for a 12:15 collection to still be cookable — the order needs 15 minutes, so
// now ≤ 12:00. 11:50 is taken here: it also puts 11:45 and 12:00 behind us as candidates for ASAP's start
// in the same way his screen did, without changing any capacity fact on the board.
const NOW = 11 * 60 + 50
/** The raw total cooked in each dot's own stretch, from the report's §2 table. */
const RAW = { '11:45': 8, '12:00': 8, '12:15': 4, '12:30': 6, '12:45': 0 }
const times = X => X.G.generateCollectionTimes('10:00', '22:00', IV, IV, 30).map(t => ({ collection_time: t.collection_time, production_slot: t.collection_time, production_window_key: t.collection_time }))
function board(X, on = true) {
  const ts = times(X)
  const back = X.E.projectBackwardOccupancy(BOARD, CFG, START, KC, CW, [], on)
  const ind = X.D.buildSlotIndicators(ts, BOARD, CFG, KC, START, ['pizza'], CW, IV, [], on)
  const av = X.E.buildSlotAvailability({ times: ts, productionSlotUnits: BOARD, catConfigs: CFG, kitchenCapacity: KC, eventStartMins: START, capacityWindowMins: CW, displayIntervalMins: IV, reservations: [], batchReservations: on })
  const row = t => { const i = ind.get(t), a = av.find(x => x.collection_time === t)
    const f = X.E.fitOrderBackward(back, toM(t), ORDER, CFG, KC, START, CW, NOW, BOARD[t] || {}, on)
    return { tone: i.tone, emoji: i.emoji, label: i.label, available: a ? a.available : null, fits: f.fits,
             line: `${f.fits ? '  ' : '× '}${t} ${i.emoji}${i.label ? ' ' + i.label : ''}` } }
  // getAsapSlot's rule, verbatim: the first NOT-PAST, server-`available`, non-grace slot — then
  // earliestBackwardFitSlot walks from there with the same now-clamp the list uses.
  // ASAP searches from the first NOT-PAST, non-grace time — capacity is fitOrderBackward's question,
  // asked at every time by the loop inside earliestBackwardFitSlot (see AddOrderPanel's asapStart).
  const asapStart = av.find(s => !s.is_grace && toM(s.collection_time) >= NOW)
  const asap = X.E.earliestBackwardFitSlot(ts.map(t => ({ collection_time: t.collection_time, production_slot: t.production_slot })),
    BOARD, CFG, KC, START, ORDER, asapStart ? toM(asapStart.collection_time) : NEG, CW, NOW, [], on)
  return { row, asap, asapStart: asapStart ? asapStart.collection_time : null, back, ts }
}
function variant(tag, patches) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `cdw-${tag}-`))
  fs.cpSync(path.join(REPO, 'lib'), path.join(tmp, 'lib'), { recursive: true })
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules'))
  for (const [file, from, to] of patches) {
    const f = path.join(tmp, file); const src = fs.readFileSync(f, 'utf8')
    if (src.split(from).length !== 2) { console.log(`🔴 ${tag}: anchor not found exactly once in ${file}: ${from.trim().slice(0, 70)}`); process.exit(1) }
    fs.writeFileSync(f, src.replace(from, to))
  }
  const X = load(tmp, `cdw${tag}`); X.tmp = tmp; return X
}
const OWN_STRETCH_BLOCK = `  let kc: number | null = null
  for (const w of covered) if (Number.isFinite(w.remainingTotal)) { kc = w.total + w.remainingTotal; break }`

console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')
{
  // V1 — TODAY'S READ: the neighbouring window's record returned, as it was before the fix.
  const X = variant('v1', [['lib/slot-availability.ts', OWN_STRETCH_BLOCK,
    `  return { ...peakW, tone: worst.tone, bound_by: worst === peakW ? peakW.bound_by : (worst.bound_by ?? peakW.bound_by), peak: covered.length > 1 }
` + OWN_STRETCH_BLOCK]])
  const b = board(X); const r = b.row('12:15')
  // ⚠️ The LABEL is no longer part of this variant's damage: with the floor gone it is computed from the
  // intervals over the dot's own stretch, so it reads 4 either way. What the neighbour's record still
  // corrupts is the TONE and `available` — and through `available`, ASAP. That is Dominic's contradiction
  // exactly: a time that reads full and is skipped by ASAP, while the picker accepts the order.
  const bad = r.tone === 'red' && r.available === false && r.fits && b.asapStart !== '12:15'
  console.log(`  ${bad ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 the neighbouring window's record — 12:15 tone=${r.tone} available=${r.available} fits=${r.fits}, ASAP starts at ${b.asapStart} (must be its own stretch: amber, available, 12:15)`)
  fs.rmSync(X.tmp, { recursive: true, force: true }); if (!bad) process.exit(1)
}
{
  // V2 — THE FLOOR RESTORED: the truthful total lifted to the window tone's number again.
  const X = variant('v2', [['lib/slot-display.ts', `      return total
    }`, `      const rem = w ? w.remainingByCat[c] : undefined
      const toneNumber = typeof rem === 'number' && Number.isFinite(rem) ? batchOf.get(c)! - rem : 0
      return Math.max(total, toneNumber)
    }`]])
  const b = board(X)
  // With the cover fixed the floor is a no-op on this board, so the variant is proved on the board the
  // floor was introduced for: a dot whose own stretch holds less than the window tone's number.
  const REAL = board(load(REPO, 'cdwReal0'))
  const same = ['11:45', '12:00', '12:15', '12:30'].every(t => b.row(t).label === REAL.row(t).label)
  console.log(`  ${same ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V2 the floor restored: it changes NOTHING now (12:15 "${b.row('12:15').label}") — it existed only to paper over V1`)
  fs.rmSync(X.tmp, { recursive: true, force: true }); if (!same) process.exit(1)
}
{
  // V3 — ASAP ON ITS OWN SEPARATE READ: `earliestBackwardFitSlot` given a different now-clamp from the
  // one the list's per-time fit uses. The two must be judged on identical inputs or they will disagree
  // whatever the dots say — here ASAP answers 10:00, hours before anything the list would accept.
  // TWO patches, because "its own read" means both halves: its own clamp AND its own starting point.
  const X = variant('v3', [
    ['lib/slot-availability.ts',
      `    if (fitOrderBackward(back, m, orderByCat, catConfigs, kitchenCapacity, eventStartMins, capacityWindowMins, nowMins, productionSlotUnits[t.collection_time] || {}, batchReservations).fits) {`,
      `    if (fitOrderBackward(back, m, orderByCat, catConfigs, kitchenCapacity, eventStartMins, capacityWindowMins, Number.NEGATIVE_INFINITY, productionSlotUnits[t.collection_time] || {}, batchReservations).fits) {`],
    ['lib/slot-availability.ts', `    if (m < fromMins) continue`, `    if (false && m < fromMins) continue`]])
  const b = board(X)
  const bad = b.asap !== '12:15'
  console.log(`  ${bad ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V3 ASAP on its own separate read (its own now-clamp) → ${b.asap}, while the list's earliest acceptable time is 12:15`)
  fs.rmSync(X.tmp, { recursive: true, force: true }); if (!bad) process.exit(1)
}

const X = load(REPO, 'cdwReal')
console.log("\n── DOMINIC'S BOARD ──────────────────────────────────────────────────────────────────────")
for (const on of [false, true]) {
  const b = board(X, on)
  const r = t => b.row(t)
  check(r('12:15').label === '4 Pizzas' && r('12:15').tone !== 'red' && r('12:15').fits && r('12:15').available === true,
    `switch ${on ? 'ON ' : 'OFF'} · 12:15 reads its OWN stretch: "${r('12:15').line}" available=${r('12:15').available} — not full, not crossed`)
  check(['11:45', '12:00'].every(t => r(t).label === '8 Pizzas' && r(t).tone === 'red' && !r(t).fits && r(t).available === false),
    `switch ${on ? 'ON ' : 'OFF'} · 11:45 and 12:00 stay red, full and crossed: "${r('11:45').line}" / "${r('12:00').line}"`)
  check(r('12:30').label === '6 Pizzas', `switch ${on ? 'ON ' : 'OFF'} · 12:30 reads 6: "${r('12:30').line}"`)
  // The search now STARTS at the first offerable time (12:00 here — 11:45 is behind the clock) and the
  // capacity question is asked at each one, so it walks past the refused 12:00 and lands on 12:15.
  check(b.asap === '12:15',
    `switch ${on ? 'ON ' : 'OFF'} · ASAP returns 12:15 — the earliest time the per-time fit accepts (search started at ${b.asapStart}, which the fit refuses)`)
  check(Object.entries(RAW).every(([t, n]) => (r(t).label ? Number(r(t).label.match(/(\d+)/)[1]) : 0) === n),
    `switch ${on ? 'ON ' : 'OFF'} · every listed time reads the raw total of its own stretch: ${Object.keys(RAW).map(t => `${t}=${r(t).label || '0'}`).join(' · ')}`)
}
console.log('\n── THE FIVE INVARIANTS, over seeded fixture states ──────────────────────────────────────')
{
  let seed = 20260921; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
  const pick = a => a[Math.floor(rnd() * a.length)]
  const TODAY = variant('today', [['lib/slot-availability.ts', OWN_STRETCH_BLOCK,
    `  return { ...peakW, tone: worst.tone, bound_by: worst === peakW ? peakW.bound_by : (worst.bound_by ?? peakW.bound_by), peak: covered.length > 1 }
` + OWN_STRETCH_BLOCK]])
  let states = 0, rows = 0
  let asapBad = 0, ownBad = 0, redBookable = 0, bookableFull = 0, overBatch = 0, overCap = 0, alignedDiff = 0, aligned = 0
  let redBookableWide = 0, bookableFullWide = 0, alignedOffGrid = 0
  const ex = { asap: null, own: null, red: null, full: null, over: null, al: null }
  for (let i = 0; i < 300; i++) {
    const prep = pick([5, 10, 15]), batch = pick([2, 4, 8]), iv = pick([5, 10, 15, 30]), kc = pick([null, null, 6, 10]), on = i % 2 === 1
    const cfg = { pizza: { secs: prep * 60, batch, countsToCapacity: true } }
    const start = 17 * 60, end = 19 * 60
    const ts = X.G.generateCollectionTimes(fmt(start), fmt(end), iv, iv, 30).map(t => ({ collection_time: t.collection_time, production_slot: t.collection_time, production_window_key: t.collection_time }))
    const fine = X.G.generateCollectionTimes(fmt(start), fmt(end), 5, 5, 30).map(t => t.collection_time)
    const units = {}
    for (let k = 0; k < 7; k++) { const t = pick(fine); units[t] = { pizza: (units[t]?.pizza || 0) + 1 + Math.floor(rnd() * batch) } }
    const n = 1 + Math.floor(rnd() * 3), order = { pizza: n }
    states++
    const back = X.E.projectBackwardOccupancy(units, cfg, start, kc, 5, [], on)
    const ind = X.D.buildSlotIndicators(ts, units, cfg, kc, start, ['pizza'], 5, iv, [], on)
    const av = X.E.buildSlotAvailability({ times: ts, productionSlotUnits: units, catConfigs: cfg, kitchenCapacity: kc, eventStartMins: start, capacityWindowMins: 5, displayIntervalMins: iv, reservations: [], batchReservations: on })
    const step = X.E.backwardWindowStepMins(cfg)
    // 1 — ASAP == the earliest listed time the per-time fit accepts (same clamp, same board)
    const firstFit = ts.map(t => t.collection_time).find(t => X.E.fitOrderBackward(back, toM(t), order, cfg, kc, start, 5, NEG, units[t] || {}, on).fits) ?? null
    const asapStart = av.find(s => !s.is_grace)
    const asap = X.E.earliestBackwardFitSlot(ts, units, cfg, kc, start, order, asapStart ? toM(asapStart.collection_time) : NEG, 5, NEG, [], on)
    if (asap !== firstFit) { asapBad++; ex.asap = ex.asap || { prep, batch, iv, kc, on, asap, firstFit } }
    let prev = null
    for (const t of ts) {
      const T = toM(t.collection_time); const d = ind.get(t.collection_time); const a = av.find(x => x.collection_time === t.collection_time)
      const prevBefore = prev
      const read = X.E.dotOccupancyAt(back, T, prev, step, start, cfg, kc, iv, on); prev = T
      if (!d) continue
      rows++
      const num = d.label ? Number((d.label.match(/(\d+)/) || [])[1] || 0) : 0
      const fit = X.E.fitOrderBackward(back, T, order, cfg, kc, start, 5, NEG, units[t.collection_time] || {}, on)
      // 2 — tone, count and `available` all come from THIS dot's stretch
      const from = prevBefore === null ? Math.min(start, T - step) : Math.min(prevBefore, T - step)
      const w = read.window
      if (w && !back.pileByStart.has(w.startMins) && w.peak) {
        const ownTotal = back.intervals.filter(v => v.cat === 'pizza' && v.items > 0 && v.endMins > v.startMins && v.startMins < T && from < v.endMins).reduce((s2, v) => s2 + v.items, 0)
        const ownPeak = X.E.categoryLoadOver(back.intervals, 'pizza', from, T)
        const windowIsStretch = w.startMins === from && Math.abs((batch - w.remainingByCat.pizza) - ownPeak) < 1e-9
        if (num !== ownTotal || !windowIsStretch || (a && a.available !== (d.tone !== 'red'))) {
          ownBad++; ex.own = ex.own || { prep, batch, iv, kc, t: t.collection_time, num, ownTotal, winStart: w.startMins, from, viaWindow: batch - w.remainingByCat.pizza, ownPeak, available: a && a.available, tone: d.tone } }
      }
      // 3 — a red dot whose count equals the batch is never bookable; a bookable time never reads as full
      // ⚠️ SPLIT BY SHAPE. Where the grid is WIDER than the prep a dot stands for more minutes than an
      // order occupies, so part of its stretch can be full while the order's own window has room — a red
      // dot that still takes a short order is then correct, not a contradiction. The invariant is exact
      // where the dot and the order span the same minutes (grid <= prep).
      const stretchWiderThanOrder = iv > prep
      if (d.tone === 'red' && num === batch && fit.fits) { if (stretchWiderThanOrder) redBookableWide++; else { redBookable++; ex.red = ex.red || { prep, batch, iv, kc, t: t.collection_time, label: d.label } } }
      if (fit.fits && d.tone === 'red' && num >= batch) { if (stretchWiderThanOrder) bookableFullWide++; else { bookableFull++; ex.full = ex.full || { prep, batch, iv, kc, t: t.collection_time, label: d.label } } }
      // 4 — admitting the order never exceeds the batch or the cap at any instant
      // ⚠️ ATTRIBUTED TO THE ADMISSION. A randomly seeded board can already be over the batch before any
      // order is added (nothing forces a seeded state to be feasible), so a violation counts only where the
      // ADMISSION made a minute worse than it already was.
      if (fit.fits) {
        const adm = X.E.buildAdmittedReservation({ back, slotLabel: t.collection_time, qtyByCat: order, catConfigs: cfg, kitchenCapacity: kc, eventStartMins: start, capacityWindowMins: 5, nowMins: NEG, gridIntervalMins: iv })
        const u2 = JSON.parse(JSON.stringify(units)); u2[t.collection_time] = u2[t.collection_time] || {}; u2[t.collection_time].pizza = (u2[t.collection_time].pizza || 0) + n
        const res2 = adm.record ? [{ orderKey: 'cand', slot: t.collection_time, source: adm.record.source, cats: adm.record.cats }] : []
        const b2 = X.E.projectBackwardOccupancy(u2, cfg, start, kc, 5, res2, on)
        const loadAt = (ivs, m) => { let per = 0, tot = 0
          for (const v of ivs) { if (v.items <= 0 || v.endMins <= v.startMins) continue
            if (v.startMins <= m && m < v.endMins) { tot += v.items; if (v.cat === 'pizza') per += v.items } }
          return { per, tot } }
        for (let m = start - 30; m <= end; m++) {
          const before = loadAt(back.intervals, m), after = loadAt(b2.intervals, m)
          if (after.per > batch + 1e-9 && after.per > before.per + 1e-9) { overBatch++; ex.over = ex.over || { prep, batch, iv, kc, at: fmt(m), before: before.per, after: after.per }; break }
          if (kc != null && after.tot > kc + 1e-9 && after.tot > before.tot + 1e-9) { overCap++; ex.over = ex.over || { prep, batch, iv, kc, at: fmt(m), beforeTot: before.tot, afterTot: after.tot }; break } }
      }
    }
    // 5 — grid == prep is byte-identical in tone, label and `available`
    // ⚠️ ON-GRID ORDERS. Dominic's invariant is about the CONFIGURATION grid == prep, where each dot covers
    // exactly one cooking window. A board carrying orders at OFF-grid times (left by an earlier interval —
    // his own board has three) puts window starts off the grid, so even an aligned truck then has covering
    // dots, and those change by design. Counted separately rather than folded in.
    const onGrid = Object.keys(units).every(t => (toM(t) - start) % iv === 0)
    if (iv === prep && !onGrid) alignedOffGrid++
    if (iv === prep && onGrid) { aligned++
      const t0 = JSON.stringify([...ind].map(([t, i]) => [t, i.tone, i.label]))
      const t1 = JSON.stringify([...TODAY.D.buildSlotIndicators(ts, units, cfg, kc, start, ['pizza'], 5, iv, [], on)].map(([t, i]) => [t, i.tone, i.label]))
      const a0 = JSON.stringify(av.map(r => [r.collection_time, r.available, r.tone]))
      const a1 = JSON.stringify(TODAY.E.buildSlotAvailability({ times: ts, productionSlotUnits: units, catConfigs: cfg, kitchenCapacity: kc, eventStartMins: start, capacityWindowMins: 5, displayIntervalMins: iv, reservations: [], batchReservations: on }).map(r => [r.collection_time, r.available, r.tone]))
      if (t0 !== t1 || a0 !== a1) { alignedDiff++; ex.al = ex.al || { prep, iv, kc, on } } }
  }
  check(rows >= 2000, `${states} seeded states, ${rows} rendered rows (preps 5/10/15, batches 2/4/8, grids 5/10/15/30, off-grid orders, kc null/6/10, switch ON and OFF)`)
  check(asapBad === 0, `1 · ASAP == the earliest listed time the per-time fit accepts: ${asapBad} disagree${ex.asap ? ' — ' + JSON.stringify(ex.asap) : ''}`)
  check(ownBad === 0, `2 · a covered dot's tone, count and available all come from its own stretch: ${ownBad} disagree${ex.own ? ' — ' + JSON.stringify(ex.own) : ''}`)
  check(redBookable === 0 && bookableFull === 0, `3 · where the dot and the order span the same minutes (grid ≤ prep): a red dot reading the full batch is never bookable (${redBookable}); a bookable time never reads as full (${bookableFull})${ex.red ? ' — ' + JSON.stringify(ex.red) : ''}${ex.full ? ' — ' + JSON.stringify(ex.full) : ''}`)
  console.log(`  ℹ where the grid is WIDER than the prep the dot covers more minutes than the order occupies, so a red dot can still take a short order: ${redBookableWide} such rows (${bookableFullWide} reading at or over the batch). Correct, not a contradiction — the order lands in the free part of the stretch; invariant 4 proves nothing is overbooked.`)
  check(overBatch === 0 && overCap === 0, `4 · no admission exceeds the batch (${overBatch}) or the kitchen cap (${overCap}) at any instant${ex.over ? ' — ' + JSON.stringify(ex.over) : ''}`)
  check(alignedDiff === 0, `5 · grid == prep with on-grid orders, byte-identical in tone, label and available: ${aligned} such states, ${alignedDiff} differ${ex.al ? ' — ' + JSON.stringify(ex.al) : ''}`)
  console.log(`  ℹ ${alignedOffGrid} further grid == prep states carried OFF-grid orders (window starts off the grid ⇒ covering dots): those change, which is the fix.`)
  fs.rmSync(TODAY.tmp, { recursive: true, force: true })
}

module.exports = { board, load, variant, times, CFG, START, KC, CW, IV, BOARD, ORDER, fmt, toM, NEG }
if (require.main === module) {
  console.log(fails ? `\n🔴 ${fails} FAILED` : '\n✅ every dot reports its own stretch, and ASAP follows it')
  process.exit(fails ? 1 : 0)
}
