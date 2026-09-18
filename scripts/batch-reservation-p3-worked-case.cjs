#!/usr/bin/env node
// scripts/batch-reservation-p3-worked-case.cjs — Dominic's worked case, end to end, switch ON.
//   node scripts/batch-reservation-p3-worked-case.cjs
// 🔴 FAILURE MODE: 9 @17:30 refused (or admitted with the wrong split), 9 @18:45 / 9 @19:30 admitted,
// a 4-item order split, `why` not naming the windows, the stored record not matching the admission,
// or the redraw (projection + dots) not showing the reserved windows. FIXTURE figures throughout.
const fs = require('fs'), os = require('os'), path = require('path')
const { load, REPO, fmt, mins, NEG, m2o, grid, Sim } = require('./_batch-reservation-sim.cjs')
let fails = 0; const check = (ok, l) => { console.log(`  ${ok ? '✓' : '🔴'} ${l}`); if (!ok) fails++ }
const CX = { cfg: { pizza: { secs: 900, batch: 8, countsToCapacity: true } }, kc: null, cw: 5, iv: 15, start: 17 * 60, end: 21 * 60 }
const windowsOf = rec => rec.cats.pizza.windows.map(w => `${fmt(w.startMins)}-${fmt(w.endMins)}:${w.items}`).join(' ')

console.log('── BROKEN VARIANT: MUST report FAILURE ──────────────────────────────────────────────────')
{
  // V1: today's split used for admission — the engine with the switch ignored inside fitOrderBackward.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p3wc-v1-')); fs.cpSync(path.join(REPO, 'lib'), path.join(tmp, 'lib'), { recursive: true }); fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules'))
  // The admission ALONE runs today's rule: the switch is forced off at the top of fitOrderBackward, while
  // the projection still seats the reservations (so the state is the same as the real run).
  const f = path.join(tmp, 'lib/slot-availability.ts'); const src = fs.readFileSync(f, 'utf8'); const needle = '  const orderLoad = new Map<number, Record<string, number>>()\n  const batchOf: Record<string, number> = {}\n  const orderCookIntervals: CookInterval[] = []'
  if (src.split(needle).length !== 2) { console.log('🔴 could not patch fitOrderBackward'); process.exit(1) }
  fs.writeFileSync(f, src.replace(needle, '  batchReservations = false\n' + needle))
  const V = load(tmp, 'p3wcV1'); const sim = Sim(V, CX); sim.place('17:00', { pizza: 8 }); sim.place('17:15', { pizza: 1 })
  const r = sim.place('17:30', { pizza: 9 })
  console.log(`  ${!r.placed ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 today's split for admission: 9 @17:30 ${r.placed ? 'admitted' : 'REFUSED (' + r.fit.bound_by + ')'}`)
  fs.rmSync(tmp, { recursive: true, force: true }); if (r.placed) process.exit(1)
}
const X = load(REPO, 'p3wc')
console.log('\n── THE WORKED CASE: 8 @17:00, 1 @17:15, then 9 @17:30 ─────────────────────────────────')
{
  const sim = Sim(X, CX)
  const a = sim.place('17:00', { pizza: 8 }), b = sim.place('17:15', { pizza: 1 })
  check(a.placed && windowsOf(a.record) === '16:45-17:00:8', `8 @17:00 → reserved ${windowsOf(a.record)} (the pre-open run-up)`)
  check(b.placed && windowsOf(b.record) === '17:00-17:15:1', `1 @17:15 → reserved ${windowsOf(b.record)}`)
  const r = sim.place('17:30', { pizza: 9 })
  check(r.placed && r.fit.fits, `9 @17:30 FITS (tone ${r.fit.tone}, ${r.fit.bound_by})`)
  check(windowsOf(r.record) === '17:00-17:15:1 17:15-17:30:8', `…reserving ${windowsOf(r.record)} — 8 nearest, 1 earlier, source '${r.record.source}'`)
  check(r.fit.reserved && r.fit.reserved.pizza && r.fit.reserved.pizza.map(w => w.items).join('+') === '1+8', `fitOrderBackward.reserved carries the same windows (${JSON.stringify(r.fit.reserved.pizza.map(w => `${fmt(w.startMins)}:${w.items}`))})`)
  check(r.fit.why.length === 0, 'why is empty on a fit')
  // the redraw: projection with the three records seats them verbatim
  const back = sim.back()
  const w1700 = back.byStart.get(17 * 60), w1715 = back.byStart.get(17 * 60 + 15)
  check(w1700 && w1700.byCat.pizza === 2 && w1715 && w1715.byCat.pizza === 8, `redraw: window 17:00→17:15 holds 1 + 1 = ${w1700?.byCat.pizza}, window 17:15→17:30 holds ${w1715?.byCat.pizza}`)
  check(w1715.tone === 'red' && w1700.tone === 'amber', `tones: 17:15 window ${w1715.tone} (8/8), 17:00 window ${w1700.tone} (2/8)`)
  const dots = m2o(X.D.buildSlotIndicators(grid(X, CX.start, CX.end, CX.iv), sim.units(), CX.cfg, CX.kc, CX.start, ['pizza'], CX.cw, CX.iv, sim.reservations(), true))
  check(dots['17:30'].tone === 'red' && /8 Pizza/.test(dots['17:30'].label) && dots['17:15'].tone === 'amber', `dots: 17:30 ${dots['17:30'].emoji} "${dots['17:30'].label}", 17:15 ${dots['17:15'].emoji} "${dots['17:15'].label}"`)
  const br = X.B.detectCapacityBreaches({ intervalMins: 15, times: grid(X, CX.start, CX.end, CX.iv), productionSlotUnits: sim.units(), catConfigs: CX.cfg, kitchenCapacity: null, eventStartMins: CX.start, capacityWindowMins: 5, orders: [], reservations: sim.reservations(), batchReservations: true })
  check(br.length === 0, `no breach — nothing is over (${br.length})`)
  // and a customer probe now: 1 more pizza @17:30 → ONE window (ceil(1/8) = 1), the nearest, which is full →
  // REFUSED even though the earlier window has 6 free. Dominic's rule: exactly ceil(items/B) windows ending
  // at T, never more — a ≤B order is never pushed earlier to find room.
  const p = sim.place('17:30', { pizza: 1 }); const pw = p.fit.why[0]
  check(!p.placed && p.fit.tone === 'red' && pw && pw.windows.length === 1 && pw.windows[0].existing === 8 && pw.windows[0].free === 0, `then 1 @17:30 → REFUSED (${p.fit.bound_by}): one window ${pw ? fmt(pw.windows[0].startMins) + '–' + fmt(pw.windows[0].endMins) + ' existing ' + pw.windows[0].existing + ' free ' + pw.windows[0].free : '?'} — never pushed into the earlier window's 6 free`)
  const q = sim.place('17:45', { pizza: 1 }); check(q.placed && windowsOf(q.record) === '17:30-17:45:1', `…while 1 @17:45 → ${q.placed ? windowsOf(q.record) : 'REFUSED'} (its own nearest window is empty)`)
}
console.log('\n── REFUSALS AND THE NEVER-SPLIT RULE ───────────────────────────────────────────────────')
{
  const sim = Sim(X, CX); for (const [T, n] of [['18:15', 8], ['18:30', 8], ['19:00', 8], ['19:15', 8]]) sim.place(T, { pizza: n })
  for (const T of ['18:45', '19:30']) { const r = sim.place(T, { pizza: 9 }); check(!r.placed && r.fit.tone === 'red', `9 @${T} REFUSED (${r.fit.bound_by})`)
    const w = r.fit.why[0]; check(w && w.kind === 'batch' && w.windows.length === 2 && w.windows[0].free === 0 && w.windows[1].free === 8, `…why: ${w.windows.map(x => `${fmt(x.startMins)}–${fmt(x.endMins)} existing ${x.existing} free ${x.free}`).join(' · ')}`) }
  // (the 6 sit at the SAME time, so they occupy the 4's one and only window, 18:00–18:15)
  const four = Sim(X, CX); four.place('18:15', { pizza: 6 }); const r4 = four.place('18:15', { pizza: 4 })
  check(!r4.placed && r4.fit.why[0].windows.length === 1, `4 pizzas with 6 in the nearest window: ONE window, 2 free < 4 → refused, never split (${r4.fit.why[0].windows.length} window)`)
  const four2 = Sim(X, CX); four2.place('18:15', { pizza: 4 }); const r5 = four2.place('18:15', { pizza: 4 })
  check(r5.placed && windowsOf(r5.record) === '18:00-18:15:4', `4 pizzas with 4 in the nearest window → ${windowsOf(r5.record)} — one window, all four`)
}
console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ the worked case holds end to end'}`)
process.exit(fails ? 1 : 0)
