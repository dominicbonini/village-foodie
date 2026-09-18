#!/usr/bin/env node
// scripts/batch-rolling-check.cjs
//
// Proof that the per-category batch is a ROLLING ceiling: never more than a category's batch on the
// grill at any instant, whatever collection times are offered.
//   node scripts/batch-rolling-check.cjs
//
// 🔴 WHAT A FAILURE LOOKS LIKE: A=8 @18:15 stored (cooking [18:00,18:15)) and B=8 @18:20 (cooking
// [18:05,18:20)) both accepted — 16 burgers on an 8-batch grill from 18:05 to 18:15 — because the batch
// check looked only at batches STARTING at the same minute. Or the picker refusing it while the dot
// still says 8/8 (DISPLAY ≠ PICKER). Or two batches that merely touch end-to-start being refused.
//
// "BEFORE" = the pre-fix baseline's verdicts on these MISALIGNED fixtures, RECORDED in
// scripts/fixtures/batch-rolling-golden.json (section checkFixtures) by scripts/_batch-rolling-golden-generate.cjs
// from the frozen pre-fix copy of the working tree (sha256 108f72a8…, sha1 400779a9…). Nothing here
// depends on anything outside the repo; if the golden file is missing this harness FAILS, never skips.

const fs = require('fs'); const os = require('os'); const path = require('path')
const { compile, REPO } = require('./_slot-interval-compile.cjs')
const GOLDEN = path.join(__dirname, 'fixtures', 'batch-rolling-golden.json')
let CF
try { CF = JSON.parse(fs.readFileSync(GOLDEN, 'utf8')).checkFixtures } catch (e) { console.log(`🔴 golden file missing or unreadable: ${path.relative(REPO, GOLDEN)} — ${e.message}`); process.exit(1) }
if (!CF || !CF.v1_overlap || !CF.sweeps) { console.log('🔴 golden file has no checkFixtures section'); process.exit(1) }
const NEW = compile(REPO, ['lib/slot-availability.ts'], 'brcNEW').req('lib/slot-availability.js')
const ND  = compile(REPO, ['lib/slot-display.ts', 'lib/slot-availability.ts'], 'brcNEWd').req('lib/slot-display.js')
const NB  = compile(REPO, ['lib/capacity-breach.ts', 'lib/slot-availability.ts', 'lib/slot-display.ts'], 'brcNEWb').req('lib/capacity-breach.js')
const G   = compile(REPO, ['lib/slot-generation.ts'], 'brcG').req('lib/slot-generation.js')

const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const mins = t => parseInt(t.slice(0, 2)) * 60 + parseInt(t.slice(3))
const NEG = Number.NEGATIVE_INFINITY
const grid = (start, end, iv) => G.generateCollectionTimes(fmt(start), fmt(end), iv, iv, 30).map(t => ({ collection_time: t.collection_time, production_slot: t.collection_time, production_window_key: t.collection_time }))
const BURG = { burgers: { secs: 900, batch: 8, countsToCapacity: true } }
const START = 18 * 60
let fails = 0
const check = (ok, label) => { console.log(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }
// 🔴 `why` IS STRIPPED HERE, AND ONLY `why` (18 September 2026). The baseline verdicts recorded in the
// golden's checkFixtures predate the descriptive `why` field that fitOrderBackward gained for the Add
// Order popup, so a raw comparison would report a difference where no behaviour changed. Every field
// the baseline recorded is still compared in full.
const fit = (E, units, kc, order, slot, cfg = BURG, start = START) => {
  const { why, ...rest } = E.fitOrderBackward(E.projectBackwardOccupancy(units, cfg, start, kc, 5), slot, order, cfg, kc, start, 5, NEG, units[fmt(slot)] || {})
  void why
  return rest
}
const dot = (units, kc, iv, cfg = BURG, start = START) => {
  const ind = ND.buildSlotIndicators(grid(start, start + 120, iv), units, cfg, kc, start, Object.keys(cfg), 5, iv)
  return Object.fromEntries([...ind.entries()].map(([k, v]) => [k, `${v.tone}${v.label ? ' "' + v.label + '"' : ''}`]))
}

console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')
{
  // V1 — the pre-fix same-start lookup: the BASELINE's recorded verdict on this fixture.
  const r = CF.v1_overlap.fit
  console.log(`  ${r.fits ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 same-start lookup (baseline, recorded): A=8 @18:15 stored, B=8 @18:20 → fits=${r.fits} (${r.bound_by}) — 16 on an 8 grill`)
  if (!r.fits) process.exit(1)

  // V2 — fit fixed but tone not: the NEW picker's count vs the OLD projection's label for the same window.
  const both = { '18:15': { burgers: 8 }, '18:20': { burgers: 8 } }
  const oldW = CF.v2_window_1805.window   // the baseline's 18:05 window, recorded
  const newFit = fit(NEW, both, null, { burgers: 1 }, mins('18:20'))
  const disagree = /8\/8/.test(oldW.bound_by) && /17\/8/.test(newFit.bound_by)
  console.log(`  ${disagree ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V2 fit fixed, tone not: the 18:05 window's dot says "${oldW.bound_by}" while the picker says "${newFit.bound_by}" — DISPLAY ≠ PICKER`)
  if (!disagree) process.exit(1)

  // V3 — touching windows counted as overlapping (closed instead of half-open).
  const closedLoad = (ivs, cat, from, to) => ivs.filter(iv => iv.cat === cat && iv.endMins > iv.startMins && iv.startMins <= to && from <= iv.endMins).reduce((s, iv) => s + iv.items, 0)
  const back = NEW.projectBackwardOccupancy({ '18:15': { burgers: 8 } }, BURG, START, null, 5)
  const closed = closedLoad(back.intervals, 'burgers', mins('18:15'), mins('18:30'))   // B @18:30 cooks [18:15,18:30)
  const real = NEW.categoryLoadOver(back.intervals, 'burgers', mins('18:15'), mins('18:30'))
  console.log(`  ${closed === 8 && real === 0 ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V3 closed-interval overlap counts A's [18:00,18:15) against a window starting 18:15 (${closed}); the real helper counts ${real}`)
  if (!(closed === 8 && real === 0)) process.exit(1)
}

console.log('\n── THE OVERLAP CASE: batch 8, prep 15, kc NULL, 5-minute grid ───────────────────────────')
{
  const units = { '18:15': { burgers: 8 } }
  const r = fit(NEW, units, null, { burgers: 8 }, mins('18:20'))
  check(r.tone === 'red' && r.fits === false, `A=8 @18:15 stored, B=8 @18:20 → ${r.tone}, fits=${r.fits}`)
  check(/Burgers 16\/8/.test(r.bound_by || ''), `…with a rolling label: "${r.bound_by}"`)
  const asap = NEW.earliestBackwardFitSlot(grid(START, 20 * 60, 5), units, BURG, null, START, { burgers: 8 }, mins('18:20'), 5, NEG)
  check(asap === '18:30', `…and the walk from 18:20 lands on ${asap} (the first window that does not overlap A's)`)
}

console.log('\n── customer 15 / operator 5: the operator\'s 18:20 is refused ─────────────────────────────')
{
  const units = { '18:15': { burgers: 8 } }
  const r = fit(NEW, units, null, { burgers: 8 }, mins('18:20'))
  check(!r.fits, `operator B=8 @18:20 on the 5 grid → fits=${r.fits}`)
  const asapOp = NEW.earliestBackwardFitSlot(grid(START, 20 * 60, 5), units, BURG, null, START, { burgers: 8 }, mins('18:20'), 5, NEG)
  check(asapOp === '18:30', `…offered ${asapOp} instead`)
}

console.log('\n── both stored as an override: the 18:20 window\'s dot and the breach detector ──────────')
{
  const both = { '18:15': { burgers: 8 }, '18:20': { burgers: 8 } }
  const back = NEW.projectBackwardOccupancy(both, BURG, START, null, 5)
  const w = back.byStart.get(mins('18:05'))
  check(w && w.tone === 'red' && /Burgers 16\/8/.test(w.bound_by), `window 18:05→18:20: ${w && w.tone} "${w && w.bound_by}" (rolling count 16)`)
  check(w && w.byCat.burgers === 8, `…while its LABEL byCat stays this start minute's own 8`)
  check(w && w.remainingByCat.burgers === -8, `…and remainingByCat = batch − rolling = ${w && w.remainingByCat.burgers}`)
  const d = dot(both, null, 5)
  check(/^red "16 Burgers"|^red/.test(d['18:20'] || ''), `the 18:20 dot reads ${d['18:20']}`)
  const br = NB.detectCapacityBreaches({ intervalMins: 5, times: grid(START, 20 * 60, 5), productionSlotUnits: both, catConfigs: BURG, kitchenCapacity: null, eventStartMins: START, capacityWindowMins: 5, orders: [] })
  check(br.some(b => b.collection_time === '18:20' && b.over_cats.some(c => c.cat === 'burgers' && c.over === 8)), `detectCapacityBreaches flags 18:20 with NO kitchen ceiling: ${JSON.stringify(br.map(b => [b.collection_time, b.reason, b.over_cats]))}`)
}

console.log('\n── kc 8: the verdict is unchanged ──────────────────────────────────────────────────────')
{
  const o = CF.kc8.fit
  const n = fit(NEW, { '18:15': { burgers: 8 } }, 8, { burgers: 8 }, mins('18:20'))
  check(o.fits === false && n.fits === false && o.tone === n.tone, `before: ${o.tone}/${o.fits} (${o.bound_by}) · after: ${n.tone}/${n.fits} (${n.bound_by})`)
}

console.log('\n── customer 10 / operator 10: A=8 @18:20, B=8 @18:30 → refused (was accepted) ──────────')
{
  const units = { '18:20': { burgers: 8 } }
  const o = CF.c10_op10.fit
  const n = fit(NEW, units, null, { burgers: 8 }, mins('18:30'))
  check(o.fits === true && n.fits === false, `before fits=${o.fits}; after fits=${n.fits} (${n.bound_by})`)
}

console.log('\n── 15/15 and 30/30: every verdict unchanged; 20/20 only for single-batch orders ─────────')
// 🔴 CORRECTED WHILE WRITING THIS HARNESS. The brief expected 20/20 to be unchanged too. It is not, and
// the fix is RIGHT to differ: with a 15-minute cook on a 20-minute grid a multi-batch order's earlier
// window starts OFF the grid (12 @18:20 cooks [17:50,18:05) + [18:05,18:20)), and an 8 @18:00 cooks
// [17:45,18:00) — 16 on the grill from 17:50 to 18:00, which the same-start check accepted. The aligned
// condition is "the step is a MULTIPLE of the prep" (15, 30), not "the step is at least the prep" (20).
for (const iv of [15, 30]) {
  let diffs = 0, n = 0
  for (const row of CF.sweeps[`${iv}/${iv}`].rows) {
    const nn = fit(NEW, { [row.ta]: { burgers: row.a } }, null, { burgers: row.b }, mins(row.tb))
    n++; if (JSON.stringify(row.fit) !== JSON.stringify(nn)) diffs++
  }
  check(diffs === 0 && n === 480, `${iv}/${iv}: ${n} recorded baseline fit verdicts, ${diffs} differ`)
}
{
  let diffs = 0, n = 0, multi = 0
  for (const row of CF.sweeps['20/20'].rows) {
    const nn = fit(NEW, { [row.ta]: { burgers: row.a } }, null, { burgers: row.b }, mins(row.tb))
    n++; if (JSON.stringify(row.fit) !== JSON.stringify(nn)) diffs++
  }
  check(diffs === 0 && n === 270, `20/20 with every order ≤ one batch: ${n} recorded baseline fit verdicts, ${diffs} differ`)
  // …and the multi-batch case it now catches:
  const o = CF.multi_2020.fit, nn = fit(NEW, { '18:20': { burgers: 12 } }, null, { burgers: 8 }, mins('18:00'))
  multi = (o.fits === true && nn.fits === false) ? 1 : 0
  check(multi === 1, `20/20, 12 @18:20 then 8 @18:00: before fits=${o.fits}, after fits=${nn.fits} (${nn.bound_by}) — a real overlap the old check missed`)
}

console.log('\n── touching windows do NOT overlap ─────────────────────────────────────────────────────')
{
  const r = fit(NEW, { '18:15': { burgers: 8 } }, null, { burgers: 8 }, mins('18:30'))
  check(r.fits === true, `A=8 @18:15 [18:00,18:15) then B=8 @18:30 [18:15,18:30) → fits=${r.fits}`)
  const back = NEW.projectBackwardOccupancy({ '18:15': { burgers: 8 }, '18:30': { burgers: 8 } }, BURG, START, null, 5)
  check(back.byStart.get(mins('18:00')).tone === 'red' && back.byStart.get(mins('18:15')).tone === 'red' && back.byStart.get(mins('18:15')).remainingByCat.burgers === 0, 'both windows read 8/8, neither over')
}

console.log('\n── batch 4, prep 10 ────────────────────────────────────────────────────────────────────')
{
  const CFG = { mains: { secs: 600, batch: 4, countsToCapacity: true } }
  const units = { '18:30': { mains: 3 } }
  const r1 = fit(NEW, units, null, { mains: 3 }, mins('18:30'), CFG)
  const r2 = fit(NEW, units, null, { mains: 3 }, mins('18:40'), CFG)
  check(r1.fits === false && /Mains 6\/4/.test(r1.bound_by), `10-minute grid: A=3 @18:30; B=3 @18:30 → refused (${r1.bound_by})`)
  check(r2.fits === true, `B=3 @18:40 → fits (${r2.tone})`)
  const d = dot({ '18:30': { mains: 3 }, '18:40': { mains: 3 } }, null, 10, CFG)
  check(/amber "3 Mains"/.test(d['18:30']) && /amber "3 Mains"/.test(d['18:40']), `dots read ${d['18:30']} and ${d['18:40']} (3/4 and 3/4)`)
  const r3 = fit(NEW, units, null, { mains: 3 }, mins('18:35'), CFG)
  const r4 = fit(NEW, units, null, { mains: 3 }, mins('18:40'), CFG)
  const o3 = CF.batch4_prep10_1835.fit   // baseline, recorded
  check(r3.fits === false && o3.fits === true, `5-minute grid: B=3 @18:35 → refused (was ${o3.fits} before: [18:25,18:35) overlaps A's [18:20,18:30))`)
  check(r4.fits === true, 'B=3 @18:40 → fits')
}

console.log('\n── the off-list branch is UNCHANGED (asserted, not fixed — Dominic\'s decision) ──────────')
// Durable, in two parts: (1) the branch is present VERBATIM in the source; (2) placeOrderInSlotLocked, compiled
// from a copy of lib/ whose lib/supabase.ts is a stub that records which tables are read, confirms a FIXTURE
// off-grid time as requested, having read nothing but collection_times — i.e. no capacity check ran.
const BRANCH = /if \(!startEntry\) \{\s*\n\s*return \{ finalSlot: startSlot, booked: true \}\s*\n\s*\}/
const STUB = `// harness stub: records every table read; every query resolves to no rows
function chain(): any { const p: any = new Proxy(function () {}, { get: (_t, prop) => prop === 'then' ? (res: any) => res({ data: [], error: null }) : () => p, apply: () => p }); return p }
export const supabase: any = { from: (t: string) => { ((globalThis as any).__pisCalls as string[]).push(t); return chain() } }
`
function pisRoot(patch) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brc-pis-'))
  fs.cpSync(path.join(REPO, 'lib'), path.join(tmp, 'lib'), { recursive: true })
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules'))
  fs.writeFileSync(path.join(tmp, 'lib/supabase.ts'), STUB)
  if (patch) { const f = path.join(tmp, 'lib/orders/place-in-slot.ts'); fs.writeFileSync(f, patch(fs.readFileSync(f, 'utf8'))) }
  return tmp
}
async function offGrid(root, tag, slot) {
  const P = compile(root, ['lib/orders/place-in-slot.ts'], tag).req('lib/orders/place-in-slot.js')
  globalThis.__pisCalls = []
  let res, err = null
  try { res = await P.placeOrderInSlotLocked('test-truck', '2026-09-17', 'ev-fixture', slot, [{ name: 'Burger', quantity: 8 }], { Burger: 'burgers' }, BURG, '18:00:00', '21:00:00', 15, 15, null, 5, null) } catch (e) { err = e.message }
  return { res, err, calls: [...globalThis.__pisCalls] }
}
;(async () => {
  {
    // 🔴 BROKEN VARIANT: the branch altered (booked: false) — the verbatim check fails AND the fixture is no
    // longer confirmed.
    const root = pisRoot(src => src.replace('if (!startEntry) {\n      return { finalSlot: startSlot, booked: true }', 'if (!startEntry) {\n      return { finalSlot: startSlot, booked: false }'))
    const vsrc = fs.readFileSync(path.join(root, 'lib/orders/place-in-slot.ts'), 'utf8')
    const v = await offGrid(root, 'brcPisV4', '18:20'); fs.rmSync(root, { recursive: true, force: true })
    const caught = !BRANCH.test(vsrc) && !(v.res && v.res.booked === true)
    console.log(`  ${caught ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V4 the branch altered to booked:false — verbatim check ${BRANCH.test(vsrc) ? 'still passes' : 'fails'}; fixture 18:20 → ${JSON.stringify(v.res)}`)
    if (!caught) process.exit(1)
  }
  const src = fs.readFileSync(path.join(REPO, 'lib/orders/place-in-slot.ts'), 'utf8')
  check(BRANCH.test(src), 'placeOrderInSlotLocked: `if (!startEntry) { return { finalSlot: startSlot, booked: true } }` is present verbatim')
  const root = pisRoot(null)
  const off = await offGrid(root, 'brcPis', '18:20')       // 18:20 is OFF a 15-minute grid from 18:00
  check(off.err === null && off.res && off.res.finalSlot === '18:20' && off.res.booked === true, `FIXTURE off-grid 18:20 on a 15-minute grid (18:00–21:00) → ${JSON.stringify(off.res)}${off.err ? ' error: ' + off.err : ''}`)
  check(off.calls.length === 1 && off.calls[0] === 'collection_times', `…having read only [${off.calls.join(', ')}] — no production_slot_usage read, so NO capacity check ran`)
  const on = await offGrid(root, 'brcPisOn', '18:15')       // 18:15 is ON the grid: the walk proceeds past the branch
  check(on.calls.length > 1 || on.err !== null, `control: on-grid 18:15 goes past the branch (reads [${on.calls.join(', ')}]${on.err ? '; stub stopped it: ' + on.err.slice(0, 60) : ''})`)
  fs.rmSync(root, { recursive: true, force: true })
  console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ rolling batch check proven (baseline verdicts from the committed golden)'}`)
  process.exit(fails ? 1 : 0)
})()
