// Shared by scripts/_batch-rolling-golden-generate.cjs (writes the golden file from the pre-fix baseline)
// and scripts/batch-rolling-identity.cjs (checks the working tree against it). The snapshot here is THE
// definition of "everything the five functions say about one fixture"; both sides must use this one.
const crypto = require('crypto')
const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const mins = t => parseInt(t.slice(0, 2)) * 60 + parseInt(t.slice(3))
const NEG = Number.NEGATIVE_INFINITY
/** The LCG every seeded family uses (same constants as the original harness). */
const rng = (seed) => { let s = seed; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff } }
const m2o = m => Object.fromEntries([...m.entries()])
/** A grid from the slot generator: collection_time = production_slot = production_window_key. */
const gridFrom = (G, start, end, iv) => G.generateCollectionTimes(fmt(start), fmt(end), iv, iv, 30).map(t => ({ collection_time: t.collection_time, production_slot: t.collection_time, production_window_key: t.collection_time }))
/** The dot fields the golden was recorded over. Additive fields added since (18 September 2026: overlap,
 *  ownLabel, multiCat, nextFree — the overlap reason) are projected away, exactly as GOLDEN_FIT_KEYS does
 *  for fitOrderBackward's `why`/`reserved`: the golden pins tone, emoji and label, not the object's shape. */
const GOLDEN_DOT_KEYS = ['tone', 'emoji', 'label', 'overTotal', 'occ']
const projectDots = (dots) => Object.fromEntries(Object.entries(dots).map(([t, d]) => [t, Object.fromEntries(GOLDEN_DOT_KEYS.map(k => [k, d[k]]))]))
const gridKey = (start, end, iv) => `${start}-${end}-${iv}`
/** Everything projectBackwardOccupancy / fitOrderBackward / earliestBackwardFitSlot / buildSlotIndicators /
 *  detectCapacityBreaches say about one fixture, as ONE canonical JSON string. The additive `cat` tag is
 *  stripped from `intervals` so the comparison is about VERDICTS, not the new field. */
function snapshot(X, c, times) {
  const cw = c.cw ?? 5, iv = c.iv ?? 5, order = c.order
  const back = X.E.projectBackwardOccupancy(c.units, c.cfg, c.start, c.kc, cw)
  // 🔴 `why` IS STRIPPED HERE, AND ONLY `why` (18 September 2026). fitOrderBackward gained a purely
  // descriptive `why` field for the Add Order popup; the golden file was generated before it existed and
  // MUST NOT be regenerated — it is the pre-fix baseline. Stripping the one added key keeps the
  // comparison over exactly the fields the golden holds. scripts/batch-rolling-identity.cjs separately
  // asserts that `why` is the ONLY key that appeared, so this strip can never hide a second change.
  const fits = times.slice(0, 8).map(t => { const { why, ...rest } = X.E.fitOrderBackward(back, mins(t.collection_time), order, c.cfg, c.kc, c.start, cw, NEG, c.units[t.collection_time] || {}); void why; return rest })
  const asap = X.E.earliestBackwardFitSlot(times, c.units, c.cfg, c.kc, c.start, order, NEG, cw, NEG)
  const dots = projectDots(m2o(X.D.buildSlotIndicators(times, c.units, c.cfg, c.kc, c.start, Object.keys(c.cfg), cw, iv)))
  const br = X.B.detectCapacityBreaches({ intervalMins: iv, times, productionSlotUnits: c.units, catConfigs: c.cfg, kitchenCapacity: c.kc, eventStartMins: c.start, capacityWindowMins: cw, orders: [] })
  const ivs = back.intervals.map(({ startMins, endMins, items }) => ({ startMins, endMins, items }))
  return JSON.stringify({ windows: back.windows, pile: m2o(back.pileByStart), cantFit: back.cantFit, batchByCat: back.batchByCat, intervals: ivs, fits, asap, dots, br })
}
/** 24 hex chars (96 bits) of the sha256 — any byte of difference changes it; short enough to store 20,000 times. */
const digest = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 24)
// ── COMPACT CASE ENCODING for the seeded families (family defaults + one small array per case) ──────
/** single-category units → "17:15=8,18:30=12" */
const encUnits1 = (units, cat) => Object.entries(units).map(([t, u]) => `${t}=${u[cat]}`).join(',')
const decUnits1 = (s, cat) => s ? Object.fromEntries(s.split(',').map(x => { const [t, n] = x.split('='); return [t, { [cat]: Number(n) }] })) : {}
/** A family's stored row → the fixture object snapshot() takes. Shapes:
 *   sweep1515  : [start, "HH:MM=n,…", orderN, digest]          defaults: cfg, cat, iv, cw, kc, end
 *   gustoShaped: [start, units, orderN, digest]                 defaults: cfg, iv, cw, kc, endOffset
 *   aligned240 : [start, step, cfg, units, kc, orderN, digest]  (cfg varies per case) */
function decodeCase(name, fam, row) {
  const d = fam.defaults || {}
  if (name === 'sweep1515') return { units: decUnits1(row[1], d.cat), cfg: d.cfg, start: row[0], end: d.end, iv: d.iv, cw: d.cw, kc: d.kc, order: { [d.cat]: row[2] }, digest: row[3] }
  if (name === 'gustoShaped') return { units: row[1], cfg: d.cfg, start: row[0], end: row[0] + d.endOffset, iv: d.iv, cw: d.cw, kc: d.kc, order: { pizza: row[2] }, digest: row[3] }
  if (name === 'aligned240') return { units: row[3], cfg: row[2], start: row[0], end: row[0] + 120, iv: row[1], cw: row[1], kc: row[4], order: { a: row[5] }, digest: row[6] }
  throw new Error('unknown family ' + name)
}
/** The KEYS fitOrderBackward returned before `why` was added — the golden file's shape. */
const GOLDEN_FIT_KEYS = ['tone', 'bound_by', 'fits', 'peak', 'spanFromMins']
module.exports = { fmt, mins, NEG, rng, m2o, gridFrom, gridKey, snapshot, digest, GOLDEN_FIT_KEYS, GOLDEN_DOT_KEYS, projectDots, encUnits1, decUnits1, decodeCase }
