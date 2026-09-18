#!/usr/bin/env node
// scripts/_batch-reservation-golden-on-generate.cjs — writes scripts/fixtures/batch-reservation-golden-on.json
// from the VERIFIED P3 build (switch ON). Same fixture families as the rolling golden (their inputs are
// read from that file), snapshotted with the switch ON and, for a `reserved` family, with reservations
// created by admitting each stored slot in turn. Re-run only to regenerate from a build the P3 harnesses
// have passed. The engine file's sha256 is recorded so a later regeneration is traceable.
//   node scripts/_batch-reservation-golden-on-generate.cjs
const fs = require('fs'), path = require('path'), crypto = require('crypto')
const { load, REPO, mins, NEG, m2o, grid, rng } = require('./_batch-reservation-sim.cjs')
const SN = require('./_batch-rolling-snapshot.cjs')
const X = load(REPO, 'goldON')
const rolling = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/batch-rolling-golden.json'), 'utf8'))
const digest = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 24)
/** ON-mode snapshot of the six readers + why + reserved. */
function snapshotOn(cx, units, res, times, order) {
  const back = X.E.projectBackwardOccupancy(units, cx.cfg, cx.start, cx.kc, cx.cw ?? 5, res, true)
  const fits = times.slice(0, 8).map(t => X.E.fitOrderBackward(back, mins(t.collection_time), order, cx.cfg, cx.kc, cx.start, cx.cw ?? 5, NEG, units[t.collection_time] || {}, true))
  const asap = X.E.earliestBackwardFitSlot(times, units, cx.cfg, cx.kc, cx.start, order, NEG, cx.cw ?? 5, NEG, res, true)
  const dots = SN.projectDots(m2o(X.D.buildSlotIndicators(times, units, cx.cfg, cx.kc, cx.start, Object.keys(cx.cfg), cx.cw ?? 5, cx.iv ?? 5, res, true)))   // the golden's five dot fields; additive fields projected away (see GOLDEN_DOT_KEYS)
  const br = X.B.detectCapacityBreaches({ intervalMins: cx.iv ?? 5, times, productionSlotUnits: units, catConfigs: cx.cfg, kitchenCapacity: cx.kc, eventStartMins: cx.start, capacityWindowMins: cx.cw ?? 5, orders: [], reservations: res, batchReservations: true })
  return JSON.stringify({ windows: back.windows, pile: m2o(back.pileByStart), intervals: back.intervals, fits, asap, dots, br })
}
/** Reservations by admitting each stored slot's total in ascending time (one order per slot), ON. */
function reserveStored(cx, units) {
  const res = []
  for (const slot of Object.keys(units).sort((a, b) => mins(a) - mins(b))) {
    const others = {}; for (const s2 of Object.keys(units)) if (mins(s2) < mins(slot)) others[s2] = units[s2]
    const back = X.E.projectBackwardOccupancy(others, cx.cfg, cx.start, cx.kc, cx.cw ?? 5, res, true)
    const rec = X.E.buildAdmittedReservation({ back, slotLabel: slot, qtyByCat: units[slot], catConfigs: cx.cfg, kitchenCapacity: cx.kc, eventStartMins: cx.start, capacityWindowMins: cx.cw ?? 5 }).record
    if (rec) res.push({ orderKey: 'k' + slot, slot, source: rec.source, cats: rec.cats })
  }
  return res
}
const times = cx => rolling.grids[SN.gridKey(cx.start, cx.end, cx.iv)]
const out = { header: { generator: 'scripts/_batch-reservation-golden-on-generate.cjs', generatedAt: new Date().toISOString(), engineSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(REPO, 'lib/slot-availability.ts'))).digest('hex'), mode: 'batchReservations ON', inputsFrom: 'scripts/fixtures/batch-rolling-golden.json', note: 'digests of the ON-mode snapshot; fixture inputs are read from the rolling golden (not repeated)' }, s31: [], gustoShaped: [], aligned240: [], gustoLive: [], reserved: [] }
for (const c of rolling.s31) out.s31.push({ label: c.label, digest: digest(snapshotOn(c.input, c.input.units, [], times(c.input), c.input.order)) })
for (let i = 0; i < rolling.gustoShaped.cases.length; i++) { const cx = SN.decodeCase('gustoShaped', rolling.gustoShaped, rolling.gustoShaped.cases[i]); out.gustoShaped.push(digest(snapshotOn(cx, cx.units, [], times(cx), cx.order))) }
for (let i = 0; i < rolling.aligned240.cases.length; i++) { const cx = SN.decodeCase('aligned240', rolling.aligned240, rolling.aligned240.cases[i]); out.aligned240.push(digest(snapshotOn(cx, cx.units, [], times(cx), cx.order))) }
for (const c of rolling.gustoLive.cases) out.gustoLive.push({ label: c.label, digest: digest(snapshotOn(c.input, c.input.units, [], times(c.input), c.input.order)) })
for (let i = 0; i < rolling.gustoShaped.cases.length; i++) { const cx = SN.decodeCase('gustoShaped', rolling.gustoShaped, rolling.gustoShaped.cases[i]); const res = reserveStored(cx, cx.units); out.reserved.push({ reservations: res.length, digest: digest(snapshotOn(cx, cx.units, res, times(cx), cx.order)) }) }
out.header.counts = { s31: out.s31.length, gustoShaped: out.gustoShaped.length, aligned240: out.aligned240.length, gustoLive: out.gustoLive.length, reserved: out.reserved.length }
const file = path.join(REPO, 'scripts/fixtures/batch-reservation-golden-on.json')
fs.writeFileSync(file, JSON.stringify(out, null, 1))
console.log(`wrote ${path.relative(REPO, file)} (${(fs.statSync(file).size / 1024).toFixed(0)} KB) — ${JSON.stringify(out.header.counts)}`)
