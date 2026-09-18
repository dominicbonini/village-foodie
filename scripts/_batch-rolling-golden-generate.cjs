#!/usr/bin/env node
// scripts/_batch-rolling-golden-generate.cjs — writes scripts/fixtures/batch-rolling-golden.json from the
// PRE-FIX baseline of lib/slot-availability.ts (the copy of the working tree taken before the rolling batch
// fix on 17 September 2026 — NOT git HEAD, which lacks the collection-times work).
//   BATCH_FROZEN_ROOT=/path/to/frozen-before node scripts/_batch-rolling-golden-generate.cjs
// The baseline root must contain lib/ as it stood; its lib/slot-availability.ts MUST hash to the values
// below (sha256 108f72a8…, sha1 400779a9… — the sha the fix report recorded) or nothing is written.
// This is a ONE-TIME tool: once the golden file is committed, scripts/batch-rolling-identity.cjs needs
// only the repo. Re-run it only to regenerate the golden from the same baseline (e.g. to add a family).
const fs = require('fs'); const path = require('path'); const crypto = require('crypto')
const { compile, REPO } = require('./_slot-interval-compile.cjs')
const S = require('./_batch-rolling-snapshot.cjs')
const BASELINE_SHA256 = '108f72a832df067c2b3fbf6ca9dff80c059a203bd8e66882d0f4be44e1d8de64'
const BASELINE_SHA1 = '400779a9f67fa1bc5ef95628237459ed8bacd0f3'
const OUT = path.join(__dirname, 'fixtures', 'batch-rolling-golden.json')
const FROZEN = process.env.BATCH_FROZEN_ROOT
if (!FROZEN) { console.log('🔴 set BATCH_FROZEN_ROOT to the pre-fix baseline root'); process.exit(1) }
const basefile = path.join(FROZEN, 'lib/slot-availability.ts')
if (!fs.existsSync(basefile)) { console.log('🔴 no lib/slot-availability.ts under ' + FROZEN); process.exit(1) }
const bytes = fs.readFileSync(basefile)
const sha256 = crypto.createHash('sha256').update(bytes).digest('hex'), sha1 = crypto.createHash('sha1').update(bytes).digest('hex')
if (sha256 !== BASELINE_SHA256 || sha1 !== BASELINE_SHA1) { console.log(`🔴 baseline hash mismatch: sha256 ${sha256} sha1 ${sha1}`); process.exit(1) }
console.log(`baseline verified: sha256 ${sha256.slice(0, 16)}… sha1 ${sha1.slice(0, 16)}…`)

const FILES = ['lib/slot-availability.ts', 'lib/slot-display.ts', 'lib/capacity-breach.ts']
const c = compile(FROZEN, FILES, 'goldOLD')
const OLD = { E: c.req('lib/slot-availability.js'), D: c.req('lib/slot-display.js'), B: c.req('lib/capacity-breach.js') }
const G = compile(FROZEN, ['lib/slot-generation.ts'], 'goldG').req('lib/slot-generation.js')
const { fmt, mins, NEG, rng, gridFrom, gridKey, snapshot, digest, encUnits1, decodeCase } = S

const grids = {}
const grid = (start, end, iv) => { const k = gridKey(start, end, iv); if (!grids[k]) grids[k] = gridFrom(G, start, end, iv); return grids[k] }
/** A stored case: inputs (with a grid key) + digest; `full` keeps the parsed output too. */
function record(label, cx, full) {
  const end = cx.end ?? cx.start + 180, iv = cx.iv ?? 5
  const times = grid(cx.start, end, iv)
  const out = snapshot(OLD, cx, times)
  const row = { label, input: { units: cx.units, cfg: cx.cfg, start: cx.start, end, iv, cw: cx.cw ?? 5, kc: cx.kc, order: cx.order, grid: gridKey(cx.start, end, iv) }, digest: digest(out) }
  if (full) row.output = JSON.parse(out)
  return row
}
/** Seeded families: the compact row (see decodeCase) — and, for the first 3, a full example. The row is
 *  decoded back through decodeCase and re-snapshotted so the stored digest is PROVEN to belong to the row. */
function seeded(name, fam, row, i) {
  const cx = decodeCase(name, fam, row); const times = grid(cx.start, cx.end, cx.iv)
  const out = snapshot(OLD, cx, times); row.push(digest(out)); fam.cases.push(row)
  if (i < 3) fam.examples.push({ index: i, input: { ...cx, digest: undefined, grid: gridKey(cx.start, cx.end, cx.iv) }, digest: digest(out), output: JSON.parse(out) })
}

const PIZZA = { pizza: { secs: 300, batch: 2 } }
const PD = { pizza: { secs: 300, batch: 2 }, dessert: { secs: 300, batch: 3 } }
const PIZZA4 = { pizza: { secs: 300, batch: 4 } }
const GUSTO = { pizza: { secs: 300, batch: 2 }, drink: { secs: 0, batch: 0, countsToCapacity: false } }
const BURG = { burgers: { secs: 900, batch: 8, countsToCapacity: true } }

// ── §31 worked examples (full outputs) ────────────────────────────────────────────────────────────
const s31 = [
  ['3 pizzas @17:05 → 17:00=2 red, 17:05=1 amber', { units: { '17:05': { pizza: 3 } }, cfg: PIZZA, start: 17 * 60, kc: null, order: { pizza: 1 } }],
  ['2 pizzas + 2 desserts @17:05, cap 4 — full', { units: { '17:05': { pizza: 2, dessert: 2 } }, cfg: PD, start: 17 * 60, kc: 4, order: { pizza: 1 } }],
  ['1 pizza + 3 desserts @17:05, cap 4 — full', { units: { '17:05': { pizza: 1, dessert: 3 } }, cfg: PD, start: 17 * 60, kc: 4, order: { dessert: 1 } }],
  ['2 pizzas + 3 desserts — rejected by the ceiling', { units: { '17:05': { pizza: 2, dessert: 2 } }, cfg: PD, start: 17 * 60, kc: 4, order: { dessert: 1 } }],
  ['3 pizzas — rejected by batch', { units: { '17:05': { pizza: 2 } }, cfg: PD, start: 17 * 60, kc: 4, order: { pizza: 1 } }],
  ['6 @16:30 pile red/6', { units: { '16:30': { pizza: 6 } }, cfg: PIZZA4, start: 16 * 60 + 30, kc: null, order: { pizza: 2 } }],
  ['6 @16:30 + 8 @16:35 pile 10', { units: { '16:30': { pizza: 6 }, '16:35': { pizza: 8 } }, cfg: PIZZA4, start: 16 * 60 + 30, kc: null, order: { pizza: 1 } }],
  ['17:00 & 17:05 full, add 2 pizzas + 7 desserts → 17:15', { units: { '17:00': { pizza: 2, dessert: 2 }, '17:05': { pizza: 2, dessert: 2 } }, cfg: PD, start: 17 * 60, kc: 4, order: { pizza: 2, dessert: 7 }, end: 17 * 60 + 40 }],
].map(([l, cx]) => record(l, cx, true))

// ── Gusto-shaped: seed 7, 300 random states (digests; first 3 in full) ───────────────────────────
const gustoShaped = { seed: 7, encoding: '[start, units, orderPizza, digest]', defaults: { cfg: GUSTO, iv: 5, cw: 5, kc: 2, endOffset: 90 }, cases: [], examples: [] }
{ const r = rng(7)
  for (let i = 0; i < 300; i++) {
    const start = 17 * 60 + 5 * Math.floor(r() * 12); const units = {}
    for (const t of grid(start, start + 90, 5)) if (r() < 0.4) units[t.collection_time] = { pizza: 1 + Math.floor(r() * 5), ...(r() < 0.3 ? { drink: 1 + Math.floor(r() * 3) } : {}) }
    seeded('gustoShaped', gustoShaped, [start, units, 1 + Math.floor(r() * 3)], i)
  } }

// ── The 15/15 sweep: seed 20260917, 20,000 states accepted via the BASELINE placement walk ────────
const sweep1515 = { seed: 20260917, encoding: '[start, "HH:MM=n,…", orderBurgers, digest]', walk: 'states accepted via the BASELINE earliestBackwardFitSlot', defaults: { cfg: BURG, cat: 'burgers', iv: 15, cw: 5, kc: null, end: 21 * 60 }, cases: [], examples: [] }
{ const STARTS = [17 * 60, 17 * 60 + 5, 17 * 60 + 50, 18 * 60 + 10]; const r = rng(20260917)
  for (let i = 0; i < 20000; i++) {
    const start = STARTS[i % 4]; const T = grid(start, 21 * 60, 15); let units = {}
    const len = 1 + Math.floor(r() * 6)
    for (let k = 0; k < len; k++) {
      const sz = 1 + Math.floor(r() * 12); const req = r() < 0.2 ? NEG : mins(T[Math.floor(r() * T.length)].collection_time)
      const s = OLD.E.earliestBackwardFitSlot(T, units, BURG, null, start, { burgers: sz }, req, 5, NEG)
      if (s) units = { ...units, [s]: { burgers: (units[s]?.burgers || 0) + sz } }
    }
    seeded('sweep1515', sweep1515, [start, encUnits1(units, 'burgers'), 1 + Math.floor(r() * 12)], i)
  } }

// ── Seeded aligned sweep: seed 99, 240 cases, prep 5/10/15 on a grid of 1–3× the prep ────────────
const aligned240 = { seed: 99, encoding: '[start, step, cfg, units, kc, orderA, digest]', rule: 'prep 5/10/15 on a grid of 1–3× the prep (step a multiple of the prep)', cases: [], examples: [] }
{ const r = rng(99); const PREPS = [5, 10, 15]
  for (let i = 0; i < 240; i++) {
    const prep = PREPS[i % 3]; const step = prep * (1 + Math.floor(r() * 3))
    const cfg = { a: { secs: prep * 60, batch: 2 + Math.floor(r() * 7), countsToCapacity: true }, b: { secs: prep * 60, batch: 2 + Math.floor(r() * 4), countsToCapacity: true } }
    const start = 17 * 60 + step * Math.floor(r() * 4); const units = {}
    for (const t of grid(start, start + 120, step)) if (r() < 0.5) units[t.collection_time] = { a: 1 + Math.floor(r() * 9), ...(r() < 0.5 ? { b: 1 + Math.floor(r() * 5) } : {}) }
    const kc = r() < 0.5 ? null : 4 + Math.floor(r() * 6)
    seeded('aligned240', aligned240, [start, step, cfg, units, kc, 1 + Math.floor(r() * 4)], i)
  } }

// ── Gusto LIVE: static inputs copied from the fix report's read-only results (no personal data) ───
const LIVE = process.env.BATCH_GUSTO_INPUTS   // directory holding gusto-{psu,cats,van,past,events}.json
if (!LIVE) { console.log('🔴 set BATCH_GUSTO_INPUTS to the directory holding the five gusto-*.json inputs'); process.exit(1) }
const J = (n) => JSON.parse(fs.readFileSync(path.join(LIVE, n), 'utf8'))
const live = { production_slot_usage: J('gusto-psu.json'), menu_categories: J('gusto-cats.json'), truck_van: J('gusto-van.json')[0], events_past: J('gusto-past.json'), events_upcoming: J('gusto-events.json') }
for (const row of [...live.production_slot_usage, ...live.menu_categories, live.truck_van, ...live.events_past, ...live.events_upcoming])
  for (const k of Object.keys(row)) if (/name|email|phone|customer|address|note/i.test(k) && !/^name$/.test(k)) { console.log('🔴 personal-looking column in live inputs: ' + k); process.exit(1) }
const gustoLive = []
{ const cfg = Object.fromEntries(live.menu_categories.map(c => [c.name.toLowerCase(), { secs: c.prep_secs || 0, batch: c.batch_size || 0, countsToCapacity: !!c.counts_toward_capacity }]))
  const van = live.truck_van
  for (const ev of [...live.events_past, ...live.events_upcoming].filter(e => e.start_time)) {
    const units = {}; for (const r of live.production_slot_usage) if (r.event_id === ev.id) units[r.production_slot] = r.units_by_cat
    const start = mins(ev.start_time.slice(0, 5)), end = mins(ev.end_time.slice(0, 5))
    gustoLive.push(record(`Gusto event ${ev.event_date} ${ev.start_time.slice(0, 5)}–${ev.end_time.slice(0, 5)} (${Object.keys(units).length} stored slots)`, { units, cfg, start, end, kc: van.kitchen_capacity, cw: van.capacity_window_mins, iv: van.collection_interval_mins, order: { pizza: 1 } }, true))
  } }

// ── MISALIGNED "before" verdicts for scripts/batch-rolling-check.cjs (the fix is MEANT to differ) ──
const START = 18 * 60
const fitOld = (units, kc, order, slot, cfg = BURG, start = START) => OLD.E.fitOrderBackward(OLD.E.projectBackwardOccupancy(units, cfg, start, kc, 5), slot, order, cfg, kc, start, 5, NEG, units[fmt(slot)] || {})
const checkFixtures = {
  note: 'The BASELINE (pre-fix) verdicts on MISALIGNED fixtures. batch-rolling-check.cjs reads these as "before"; the current engine is expected to DIFFER where the report says so.',
  v1_overlap: { input: 'A=8 @18:15 stored, B=8 @18:20, batch 8, prep 15, kc null, 5-grid', fit: fitOld({ '18:15': { burgers: 8 } }, null, { burgers: 8 }, mins('18:20')) },
  v2_window_1805: { input: 'A=8 @18:15 + B=8 @18:20 stored; the window starting 18:05', window: (() => { const w = OLD.E.projectBackwardOccupancy({ '18:15': { burgers: 8 }, '18:20': { burgers: 8 } }, BURG, START, null, 5).byStart.get(mins('18:05')); return { tone: w.tone, bound_by: w.bound_by, byCat: w.byCat, remainingByCat: w.remainingByCat } })() },
  kc8: { input: 'A=8 @18:15, B=8 @18:20, kc 8', fit: fitOld({ '18:15': { burgers: 8 } }, 8, { burgers: 8 }, mins('18:20')) },
  c10_op10: { input: 'A=8 @18:20, B=8 @18:30, kc null', fit: fitOld({ '18:20': { burgers: 8 } }, null, { burgers: 8 }, mins('18:30')) },
  multi_2020: { input: '20/20: 12 @18:20 stored, 8 @18:00', fit: fitOld({ '18:20': { burgers: 12 } }, null, { burgers: 8 }, mins('18:00')) },
  batch4_prep10_1835: { input: 'mains batch 4 prep 10: A=3 @18:30, B=3 @18:35', fit: fitOld({ '18:30': { mains: 3 } }, null, { mains: 3 }, mins('18:35'), { mains: { secs: 600, batch: 4, countsToCapacity: true } }) },
  sweeps: {},
}
for (const iv of [15, 30, 20]) {
  const T = grid(START, 21 * 60, iv); const rows = []
  const A = iv === 20 ? [2, 5, 8] : [2, 5, 8, 12], Bv = iv === 20 ? [1, 4, 8] : [1, 4, 8, 9]
  for (const a of A) for (const ta of T.slice(0, 5)) for (const b of Bv) for (const tb of T.slice(0, 6)) rows.push({ a, ta: ta.collection_time, b, tb: tb.collection_time, fit: fitOld({ [ta.collection_time]: { burgers: a } }, null, { burgers: b }, mins(tb.collection_time)) })
  checkFixtures.sweeps[`${iv}/${iv}`] = { grid: gridKey(START, 21 * 60, iv), rows }
}

const golden = {
  header: {
    generator: 'scripts/_batch-rolling-golden-generate.cjs', generatedAt: new Date().toISOString(),
    baseline: { file: 'lib/slot-availability.ts', description: 'frozen copy of the working tree BEFORE the rolling batch fix (17 September 2026); NOT git HEAD fc0fddc, which lacks the collection-times work', sha256: BASELINE_SHA256, sha1: BASELINE_SHA1 },
    seeds: { gustoShaped: 7, sweep1515: 20260917, aligned240: 99, lcg: 's = (s * 1103515245 + 12345) & 0x7fffffff; s / 0x7fffffff' },
    counts: { s31: s31.length, gustoShaped: gustoShaped.cases.length, sweep1515: sweep1515.cases.length, aligned240: aligned240.cases.length, gustoLive: gustoLive.length, checkSweepRows: Object.values(checkFixtures.sweeps).reduce((n, s) => n + s.rows.length, 0) },
    outputs: 'full parsed output for s31, gustoLive, checkFixtures and the first 3 of each seeded family (examples); every case carries the first 24 hex of the sha256 of its canonical snapshot (scripts/_batch-rolling-snapshot.cjs). Full outputs for all 20,540 seeded cases would be ~90 MB.',
    personalData: 'none — the live inputs are event/van UUIDs, dates, times, per-slot unit totals, category settings and the van name "Van1"',
  },
  grids, s31, gustoShaped, sweep1515, aligned240, gustoLive: { inputs: live, cases: gustoLive }, checkFixtures,
}
// one case per line for the big families so diffs stay readable
const lines = (arr) => '[\n' + arr.map(x => JSON.stringify(x)).join(',\n') + '\n]'
const fam = (f) => '{"seed": ' + f.seed + ', "encoding": ' + JSON.stringify(f.encoding) + (f.walk ? ', "walk": ' + JSON.stringify(f.walk) : '') + (f.rule ? ', "rule": ' + JSON.stringify(f.rule) : '') + (f.defaults ? ', "defaults": ' + JSON.stringify(f.defaults) : '') + ',\n"examples": ' + JSON.stringify(f.examples) + ',\n"cases": ' + lines(f.cases) + '}'
const text = '{\n"header": ' + JSON.stringify(golden.header, null, 1) + ',\n"grids": ' + JSON.stringify(golden.grids) + ',\n"s31": ' + lines(s31) + ',\n"gustoShaped": ' + fam(gustoShaped) + ',\n"sweep1515": ' + fam(sweep1515) + ',\n"aligned240": ' + fam(aligned240) + ',\n"gustoLive": ' + JSON.stringify(golden.gustoLive) + ',\n"checkFixtures": ' + JSON.stringify(checkFixtures) + '\n}\n'
JSON.parse(text)
fs.writeFileSync(OUT, text)
console.log(`wrote ${path.relative(REPO, OUT)}: ${(text.length / 1024 / 1024).toFixed(2)} MB — ${JSON.stringify(golden.header.counts)}`)
