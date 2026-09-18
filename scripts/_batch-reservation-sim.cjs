// Shared by the scripts/batch-reservation-*.cjs harnesses (P3). Compiles the REAL engine and drives it
// the way the routes do with the switch ON: admission via fitOrderBackward/buildAdmittedReservation,
// storage as per-order records, projection with reservations. Nothing here re-implements a rule.
const fs = require('fs'), path = require('path')
const { compile, REPO } = require('./_slot-interval-compile.cjs')
const FILES = ['lib/slot-availability.ts', 'lib/slot-display.ts', 'lib/capacity-breach.ts', 'lib/slot-generation.ts', 'lib/orders/cooking-reservation.ts']
function load(root, tag) {
  const c = compile(root, FILES, tag)
  fs.writeFileSync(path.join(c.out, 'lib', 'supabase.js'), 'module.exports = { supabase: null }')
  return { E: c.req('lib/slot-availability.js'), D: c.req('lib/slot-display.js'), B: c.req('lib/capacity-breach.js'), G: c.req('lib/slot-generation.js'), W: c.req('lib/orders/cooking-reservation.js'), out: c.out }
}
const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const mins = t => parseInt(t.slice(0, 2)) * 60 + parseInt(t.slice(3))
const NEG = Number.NEGATIVE_INFINITY
const m2o = m => Object.fromEntries([...m.entries()])
const grid = (X, s, e, iv) => X.G.generateCollectionTimes(fmt(s), fmt(e), iv, iv, 30).map(t => ({ collection_time: t.collection_time, production_slot: t.collection_time, production_window_key: t.collection_time }))
const rng = seed => { let s = seed; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff } }
/** A truck's event: cfg (per cat {secs,batch,countsToCapacity}), kc, cw, iv, start, end. */
function Sim(X, cx, on = true) {
  const orders = []; let k = 0
  const units = () => { const u = {}; for (const o of orders) if (o.counting) { u[o.slot] = u[o.slot] || {}; for (const [c, n] of Object.entries(o.qty)) u[o.slot][c] = (u[o.slot][c] || 0) + n } return u }
  const reservations = (excludeKey) => orders.filter(o => o.counting && o.record && o.key !== excludeKey).map(o => ({ orderKey: o.key, slot: o.record.slot, source: o.record.source, cats: o.record.cats }))
  const back = (excludeKey) => X.E.projectBackwardOccupancy(units(), cx.cfg, cx.start, cx.kc, cx.cw, reservations(excludeKey), on)
  /** Admit at T (or refuse). `override` ⇒ placed anyway. `preSwitch` ⇒ stored with NO reservation. */
  const place = (T, qty, opts = {}) => {
    const b = X.E.projectBackwardOccupancy(units(), cx.cfg, cx.start, cx.kc, cx.cw, reservations(), on)
    const fit = X.E.fitOrderBackward(b, mins(T), qty, cx.cfg, cx.kc, cx.start, cx.cw, opts.now ?? NEG, units()[T] || {}, on)
    if (!fit.fits && !opts.override) return { placed: false, fit }
    const adm = on ? X.E.buildAdmittedReservation({ back: b, slotLabel: T, qtyByCat: qty, catConfigs: cx.cfg, kitchenCapacity: cx.kc, eventStartMins: cx.start, capacityWindowMins: cx.cw, nowMins: opts.now ?? NEG, gridIntervalMins: cx.iv }) : { fits: fit.fits, record: null }
    const o = { key: 'o' + (k++), slot: T, qty, counting: true, record: opts.preSwitch ? null : adm.record, override: !fit.fits }
    orders.push(o); return { placed: true, fit, order: o, record: o.record }
  }
  const edit = (o, qty, T) => { const b = X.E.projectBackwardOccupancy(unitsWithout(o), cx.cfg, cx.start, cx.kc, cx.cw, reservations(o.key), on); const fit = X.E.fitOrderBackward(b, mins(T), qty, cx.cfg, cx.kc, cx.start, cx.cw, NEG, unitsWithout(o)[T] || {}, on)
    const adm = on ? X.E.buildAdmittedReservation({ back: b, slotLabel: T, qtyByCat: qty, catConfigs: cx.cfg, kitchenCapacity: cx.kc, eventStartMins: cx.start, capacityWindowMins: cx.cw, gridIntervalMins: cx.iv }) : { record: null }
    o.qty = qty; o.slot = T; o.record = adm.record; o.override = !fit.fits; return { fit, record: o.record } }
  const unitsWithout = (o) => { const u = {}; for (const x of orders) if (x.counting && x !== o) { u[x.slot] = u[x.slot] || {}; for (const [c, n] of Object.entries(x.qty)) u[x.slot][c] = (u[x.slot][c] || 0) + n } return u }
  const cancel = (o) => { o.counting = false }
  /** Per-minute load per category and in total, over [start−30, end]. */
  const loadByMinute = () => { const b = back(); const out = []
    for (let t = cx.start - 30; t <= cx.end; t++) { const per = {}; let tot = 0
      for (const iv of b.intervals) if (iv.items > 0 && iv.endMins > iv.startMins && iv.startMins <= t && t < iv.endMins) { per[iv.cat] = (per[iv.cat] || 0) + iv.items; tot += iv.items }
      out.push({ t, per, tot }) }
    return out }
  return { orders, units, reservations, back, place, edit, cancel, loadByMinute, cx }
}
module.exports = { load, REPO, fmt, mins, NEG, m2o, grid, rng, Sim, FILES }
