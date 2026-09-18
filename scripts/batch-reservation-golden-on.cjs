#!/usr/bin/env node
// scripts/batch-reservation-golden-on.cjs — the switch-ON baseline is pinned: every reader's output on
// every fixture family, with and without reservations, digested from the verified P3 build.
//   node scripts/batch-reservation-golden-on.cjs
// 🔴 FAILURE MODE: any ON-mode output moving from the committed baseline — a verdict, a window, a dot, a
// breach — on any of the 854 fixtures. Inputs come from the rolling golden; the ON digests from
// scripts/fixtures/batch-reservation-golden-on.json. Missing/unreadable golden ⇒ FAIL, never skip.
const fs = require('fs'), path = require('path'), crypto = require('crypto')
const { load, REPO, mins, NEG, m2o } = require('./_batch-reservation-sim.cjs')
const SN = require('./_batch-rolling-snapshot.cjs')
let fails = 0; const check = (ok, l) => { console.log(`  ${ok ? '✓' : '🔴'} ${l}`); if (!ok) fails++ }
const G = path.join(REPO, 'scripts/fixtures/batch-reservation-golden-on.json')
let golden; try { golden = JSON.parse(fs.readFileSync(G, 'utf8')) } catch (e) { console.log(`🔴 ON golden missing or unreadable: ${path.relative(REPO, G)} — ${e.message}`); process.exit(1) }
if (!golden.header || golden.header.mode !== 'batchReservations ON' || !golden.reserved) { console.log('🔴 not the ON golden'); process.exit(1) }
const rolling = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/batch-rolling-golden.json'), 'utf8'))
const digest = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 24)
const times = cx => rolling.grids[SN.gridKey(cx.start, cx.end, cx.iv)]
function snapshotOn(X, cx, units, res, times, order) {
  const back = X.E.projectBackwardOccupancy(units, cx.cfg, cx.start, cx.kc, cx.cw ?? 5, res, true)
  const fits = times.slice(0, 8).map(t => X.E.fitOrderBackward(back, mins(t.collection_time), order, cx.cfg, cx.kc, cx.start, cx.cw ?? 5, NEG, units[t.collection_time] || {}, true))
  const asap = X.E.earliestBackwardFitSlot(times, units, cx.cfg, cx.kc, cx.start, order, NEG, cx.cw ?? 5, NEG, res, true)
  const dots = SN.projectDots(m2o(X.D.buildSlotIndicators(times, units, cx.cfg, cx.kc, cx.start, Object.keys(cx.cfg), cx.cw ?? 5, cx.iv ?? 5, res, true)))   // the golden's five dot fields; additive fields projected away (see GOLDEN_DOT_KEYS)
  const br = X.B.detectCapacityBreaches({ intervalMins: cx.iv ?? 5, times, productionSlotUnits: units, catConfigs: cx.cfg, kitchenCapacity: cx.kc, eventStartMins: cx.start, capacityWindowMins: cx.cw ?? 5, orders: [], reservations: res, batchReservations: true })
  return JSON.stringify({ windows: back.windows, pile: m2o(back.pileByStart), intervals: back.intervals, fits, asap, dots, br })
}
function reserveStored(X, cx, units) { const res = []
  for (const slot of Object.keys(units).sort((a, b) => mins(a) - mins(b))) { const others = {}; for (const s2 of Object.keys(units)) if (mins(s2) < mins(slot)) others[s2] = units[s2]
    const back = X.E.projectBackwardOccupancy(others, cx.cfg, cx.start, cx.kc, cx.cw ?? 5, res, true)
    const rec = X.E.buildAdmittedReservation({ back, slotLabel: slot, qtyByCat: units[slot], catConfigs: cx.cfg, kitchenCapacity: cx.kc, eventStartMins: cx.start, capacityWindowMins: cx.cw ?? 5 }).record
    if (rec) res.push({ orderKey: 'k' + slot, slot, source: rec.source, cats: rec.cats }) }
  return res }
const X = load(REPO, 'goldONchk')
console.log(`golden: ${path.relative(REPO, G)} — generated ${golden.header.generatedAt}, engine ${golden.header.engineSha256.slice(0, 12)}…, counts ${JSON.stringify(golden.header.counts)}`)
console.log('── BROKEN VARIANT: MUST report FAILURE ──────────────────────────────────────────────────')
{
  const c0 = rolling.s31[0]; const liar = { E: Object.create(X.E), D: X.D, B: X.B }
  liar.E.fitOrderBackward = (...a) => { const r = X.E.fitOrderBackward(...a); return { ...r, fits: !r.fits } }
  const drifted = digest(snapshotOn(liar, c0.input, c0.input.units, [], times(c0.input), c0.input.order)) !== golden.s31[0].digest
  console.log(`  ${drifted ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 fits inverted on "${c0.label.slice(0, 40)}": digest ${drifted ? 'DIFFERS' : 'unchanged'}`)
  if (!drifted) process.exit(1)
}
console.log('\n── ON MODE vs THE COMMITTED ON GOLDEN ──────────────────────────────────────────────────')
let d = 0, n = 0
for (let i = 0; i < rolling.s31.length; i++) { n++; if (digest(snapshotOn(X, rolling.s31[i].input, rolling.s31[i].input.units, [], times(rolling.s31[i].input), rolling.s31[i].input.order)) !== golden.s31[i].digest) d++ }
check(d === 0, `§31 examples: ${n} cases, ${d} differ`)
d = 0; n = 0; for (let i = 0; i < rolling.gustoShaped.cases.length; i++) { const cx = SN.decodeCase('gustoShaped', rolling.gustoShaped, rolling.gustoShaped.cases[i]); n++; if (digest(snapshotOn(X, cx, cx.units, [], times(cx), cx.order)) !== golden.gustoShaped[i]) d++ }
check(d === 0, `Gusto-shaped, no reservations: ${n} cases, ${d} differ`)
d = 0; n = 0; for (let i = 0; i < rolling.aligned240.cases.length; i++) { const cx = SN.decodeCase('aligned240', rolling.aligned240, rolling.aligned240.cases[i]); n++; if (digest(snapshotOn(X, cx, cx.units, [], times(cx), cx.order)) !== golden.aligned240[i]) d++ }
check(d === 0, `aligned 240: ${n} cases, ${d} differ`)
d = 0; n = 0; for (let i = 0; i < rolling.gustoLive.cases.length; i++) { const c = rolling.gustoLive.cases[i]; n++; if (digest(snapshotOn(X, c.input, c.input.units, [], times(c.input), c.input.order)) !== golden.gustoLive[i].digest) d++ }
check(d === 0, `Gusto's six live events: ${n} cases, ${d} differ`)
d = 0; n = 0; let rs = 0; for (let i = 0; i < rolling.gustoShaped.cases.length; i++) { const cx = SN.decodeCase('gustoShaped', rolling.gustoShaped, rolling.gustoShaped.cases[i]); const res = reserveStored(X, cx, cx.units); rs += res.length; n++; if (digest(snapshotOn(X, cx, cx.units, res, times(cx), cx.order)) !== golden.reserved[i].digest) d++ }
check(d === 0, `Gusto-shaped WITH reservations (${rs} records admitted in slot order): ${n} cases, ${d} differ`)
console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ the ON baseline holds'}`)
process.exit(fails ? 1 : 0)
