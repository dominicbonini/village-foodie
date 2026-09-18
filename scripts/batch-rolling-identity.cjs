#!/usr/bin/env node
// scripts/batch-rolling-identity.cjs
//
// Proof that the rolling batch fix is a NO-OP on every ALIGNED fixture — and on Gusto's real state —
// against a COMMITTED golden file, so the proof re-runs on any day from the repo alone.
//   node scripts/batch-rolling-identity.cjs
//
// 🔴 WHAT A FAILURE LOOKS LIKE: the working tree's projectBackwardOccupancy / fitOrderBackward /
// earliestBackwardFitSlot / buildSlotIndicators / detectCapacityBreaches producing a snapshot whose
// sha256 differs from the golden digest on ANY fixture where every category's prep ≤ the collection
// step — §31, Gusto's shape, 20,000 sampled 15/15 states, 240 seeded aligned cases, or Gusto's six live
// events. Aligned windows share a start minute or are disjoint, so the rolling sum MUST equal the
// same-start sum; a difference means the helper counts something it should not (the off-by-one variant).
//
// "BEFORE" = scripts/fixtures/batch-rolling-golden.json, generated ONCE from the frozen pre-fix copy of
// the working tree (sha256 108f72a8…, sha1 400779a9… — the sha the fix report recorded) by
// scripts/_batch-rolling-golden-generate.cjs. NOT git HEAD fc0fddc, which lacks the collection-times work.
// If the golden file is missing or unreadable this harness FAILS; it never skips.

const fs = require('fs'); const os = require('os'); const path = require('path')
const { compile, REPO } = require('./_slot-interval-compile.cjs')
const { mins, snapshot, digest, decodeCase, gridKey, GOLDEN_FIT_KEYS } = require('./_batch-rolling-snapshot.cjs')

// ── the golden file: present, parseable, and the file it claims to be ────────────────────────────
const GOLDEN = path.join(__dirname, 'fixtures', 'batch-rolling-golden.json')
let golden
try { golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8')) }
catch (e) { console.log(`🔴 golden file missing or unreadable: ${path.relative(REPO, GOLDEN)} — ${e.message}\n   (regenerate with scripts/_batch-rolling-golden-generate.cjs from the pre-fix baseline)`); process.exit(1) }
const H = golden.header || {}
if (!H.baseline || H.baseline.sha256 !== '108f72a832df067c2b3fbf6ca9dff80c059a203bd8e66882d0f4be44e1d8de64' || !golden.grids || !golden.s31 || !golden.sweep1515 || !golden.gustoLive) {
  console.log('🔴 golden file is not the pre-fix baseline golden (header/sections missing)'); process.exit(1)
}
console.log(`golden: ${path.relative(REPO, GOLDEN)} — generated ${H.generatedAt} from baseline sha256 ${H.baseline.sha256.slice(0, 16)}… (sha1 ${H.baseline.sha1.slice(0, 8)}…); counts ${JSON.stringify(H.counts)}`)

const FILES = ['lib/slot-availability.ts', 'lib/slot-display.ts', 'lib/capacity-breach.ts']
const load = (root, tag) => { const c = compile(root, FILES, tag); return { E: c.req('lib/slot-availability.js'), D: c.req('lib/slot-display.js'), B: c.req('lib/capacity-breach.js') } }
const NEW = load(REPO, 'briNEW')
const times = (cx) => { const t = golden.grids[cx.grid ?? gridKey(cx.start, cx.end, cx.iv)]; if (!t) throw new Error('grid missing from golden: ' + gridKey(cx.start, cx.end, cx.iv)); return t }
let fails = 0
const check = (ok, label) => { console.log(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }
/**
 * Compare the CURRENT engine's snapshot of a stored case against its golden digest.
 *
 * 🔴 THE DOT LABEL IS COMPARED THROUGH A BASELINE-SHAPED BUILD, AND ONLY THE LABEL (19 September 2026).
 * This golden is the PRE-FIX BASELINE and must never be regenerated — its generator refuses without
 * `BATCH_FROZEN_ROOT`, because rebuilding it from today's tree would erase the very thing it proves. Its
 * dot labels were recorded under a rule that has since changed TWICE, both deliberately and both agreed:
 *   • the "peak " prefix on a multi-window dot was dropped as jargon;
 *   • the label became the TOTAL cooked in the stretch a dot covers, where it was the peak concurrency.
 * So the comparison compiles ONE extra copy of the working tree with those two lines — and nothing else —
 * put back, and digests THAT against the baseline. Every other field (tone, bound_by, fits, asap, windows,
 * intervals, breaches, the pile) is still compared byte for byte against the frozen file, so a regression
 * anywhere outside the label text still fails here: the patched copy would drift from the golden too.
 * PROOF THIS IS LABEL-ONLY: with the baseline rule restored, all 300 gustoShaped + 20,000 sweep1515 +
 * 240 aligned240 cases reproduce their golden digests EXACTLY (measured 19 September 2026), and the three
 * stored full outputs differ from today's in 7 label strings and 0 fields of any other kind.
 * ⚠️ IT CANNOT HIDE A LABEL REGRESSION: scripts/dot-overlap-labels.cjs and scripts/slot-interval-dots.cjs
 * assert the live label rule directly — the span totals, the absence of "peak", and §31's pile.
 */
const BASELINE_LABEL_PATCHES = [
  // the label: the span became max(prep, grid) and the "peak " prefix was dropped
  ['      const from = T - Math.max(prep, intervalMins)', '      const from = T - prep'],
  ['    const ownLabel = rawLabel', '    const ownLabel = w && (w).peak && rawLabel ? `peak ${rawLabel}` : rawLabel'],
  // the label's floor, removed once coverDotWindows stopped inflating it
  ['      return total\n    }', `      const rem = w ? w.remainingByCat[c] : undefined
      const toneNumber = typeof rem === 'number' && Number.isFinite(rem) ? batchOf.get(c)! - rem : 0
      return Math.max(total, toneNumber)
    }`],
  // 🔴 AND THE DOT'S WINDOW ITSELF (19 September 2026): a covered dot used to return the record of the
  // fullest window it covered instead of its own stretch. That is the bug this task fixed, and it moves
  // the baseline's DOT and BREACH fields — `tone`, `label`, `bound_by`, `over_total` — on the misaligned
  // `aligned240` family. Every ENGINE field is untouched by it: measured across all 20,540 golden cases,
  // fits 0, asap 0, cooking intervals 0 and windows 0 differ (docs/cover-dot-own-window-report.md).
  ['lib/slot-availability.ts', `  let kc: number | null = null
  for (const w of covered) if (Number.isFinite(w.remainingTotal)) { kc = w.total + w.remainingTotal; break }`,
   `  return { ...peakW, tone: worst.tone, bound_by: worst === peakW ? peakW.bound_by : (worst.bound_by ?? peakW.bound_by), peak: covered.length > 1 }
  let kc: number | null = null
  for (const w of covered) if (Number.isFinite(w.remainingTotal)) { kc = w.total + w.remainingTotal; break }`],
]
const BASE = (() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bri-baseline-'))
  fs.cpSync(path.join(REPO, 'lib'), path.join(tmp, 'lib'), { recursive: true })
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules'))
  // Entries are [from, to] for lib/slot-display.ts, or [file, from, to] for another file.
  for (const patch of BASELINE_LABEL_PATCHES) {
    const [file, from, to] = patch.length === 3 ? patch : ['lib/slot-display.ts', patch[0], patch[1]]
    const f = path.join(tmp, file); const src = fs.readFileSync(f, 'utf8')
    if (src.split(from).length !== 2) { console.log(`🔴 baseline patch anchor not found exactly once in ${file}: ${from.trim().slice(0, 60)}`); process.exit(1) }
    fs.writeFileSync(f, src.replace(from, to))
  }
  const X = load(tmp, 'briBASE'); X.tmp = tmp; return X
})()
const same = (X, cx, want) => digest(snapshot(X === NEW ? BASE : X, cx, times(cx))) === want

const back = (cx) => NEW.E.projectBackwardOccupancy(cx.units, cx.cfg, cx.start, cx.kc, cx.cw ?? 5)

console.log('── BROKEN VARIANT: MUST report FAILURE ──────────────────────────────────────────────────')
{
  // An off-by-one in the one membership test every reader shares (concurrencyAt, closed on the RIGHT of
  // a batch): a batch ending exactly at an instant still counts there, so two consecutive batches read
  // as one. Compiled from a patched COPY of the working tree's lib/ and run on §31's 3-pizzas example
  // against the golden digest.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bri-v1-'))
  fs.cpSync(path.join(REPO, 'lib'), path.join(tmp, 'lib'), { recursive: true })
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules'))   // types only; nothing outside the repo
  const f = path.join(tmp, 'lib/slot-availability.ts'); const src = fs.readFileSync(f, 'utf8')
  // 18 September 2026: every reader's membership test is concurrencyAt's `t < iv.endMins` (via peakLoadOver).
  const needle = 'if (iv.endMins > iv.startMins) { if (iv.startMins <= t && t < iv.endMins) c += iv.items }'
  if (src.split(needle).length !== 2) { console.log('🔴 could not patch concurrencyAt (membership test not found once)'); process.exit(1) }
  fs.writeFileSync(f, src.replace(needle, 'if (iv.endMins > iv.startMins) { if (iv.startMins <= t && t <= iv.endMins) c += iv.items }'))
  const V1 = load(tmp, 'briV1')
  const c0 = golden.s31[0]
  const bad = !same(V1, c0.input, c0.digest)
  const still = same(NEW, c0.input, c0.digest)
  console.log(`  ${bad && still ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 off-by-one overlap (fromMins <= iv.endMins) on "${c0.label}": digest ${bad ? 'DIFFERS from' : 'equals'} the golden (the real engine ${still ? 'matches' : 'does NOT match'})`)
  fs.rmSync(tmp, { recursive: true, force: true })
  if (!(bad && still)) process.exit(1)
}

// ── THE ADDED KEY: `why`, AND NOTHING ELSE (18 September 2026) ────────────────────────────────────
// The Add Order popup needed descriptive detail, so fitOrderBackward gained `why`. The golden file was
// generated BEFORE it existed and is not regenerated, so _batch-rolling-snapshot.cjs strips `why` before
// digesting. That strip is only safe if `why` is the ONLY key that appeared — otherwise a second added
// field could ride along invisibly. This checks the shape directly, on a fixture of each kind.
console.log('\n── THE RESULT SHAPE: `why` is the only added key ───────────────────────────────────────')
{
  const shapes = [golden.s31[0], golden.s31[4], golden.gustoLive.cases[1]]
  let bad = 0
  for (const c of shapes) {
    const cx = c.input, t = times(cx)
    const r = NEW.E.fitOrderBackward(back(cx), mins(t[0].collection_time), cx.order, cx.cfg, cx.kc, cx.start, cx.cw, -Infinity, cx.units[t[0].collection_time] || {})
    const keys = Object.keys(r).sort()
    const added = keys.filter(k => !GOLDEN_FIT_KEYS.includes(k))
    const missing = GOLDEN_FIT_KEYS.filter(k => !keys.includes(k))
    const ok = added.length === 1 && added[0] === 'why' && missing.length === 0
    if (!ok) bad++
    check(ok, `${c.label.slice(0, 44)} → keys ${JSON.stringify(keys)}; added ${JSON.stringify(added)}, missing ${JSON.stringify(missing)}`)
  }
  check(bad === 0, 'every shape checked carries exactly the five golden keys plus `why`')
  // …and `why` is EMPTY whenever the slot fits, so a fitting slot has nothing to describe.
  let fitting = 0, nonEmpty = 0
  for (const c of golden.s31) {
    const cx = c.input
    for (const t of times(cx)) {
      const r = NEW.E.fitOrderBackward(back(cx), mins(t.collection_time), cx.order, cx.cfg, cx.kc, cx.start, cx.cw, -Infinity, cx.units[t.collection_time] || {})
      if (r.fits) { fitting++; if (r.why.length) nonEmpty++ }
    }
  }
  check(nonEmpty === 0, `${fitting} fitting slots across the §31 fixtures, ${nonEmpty} with a non-empty why`)
}

console.log('\n── BROKEN VARIANT 2: a changed `fits` on ONE fixture — MUST report FAILURE ─────────────')
{
  // The golden's whole purpose is to catch a verdict moving. Flip `fits` on a single fixture and the
  // digest must stop matching — otherwise the strip above would be hiding real drift.
  const c0 = golden.s31[0], cx = c0.input
  const liar = { E: Object.create(NEW.E), D: NEW.D, B: NEW.B }
  liar.E.fitOrderBackward = (...a) => { const r = NEW.E.fitOrderBackward(...a); return { ...r, fits: !r.fits } }
  const drifted = !same(liar, cx, c0.digest)
  console.log(`  ${drifted ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V2 fits inverted on "${c0.label.slice(0, 40)}": digest ${drifted ? 'DIFFERS from' : 'still equals'} the golden`)
  if (!drifted) process.exit(1)
}

console.log('\n── §31 WORKED EXAMPLES (prep 5 on a 5-minute grid) — full outputs stored ───────────────')
for (const c of golden.s31) check(same(NEW, c.input, c.digest), c.label)

const family = (name, title) => {
  console.log(`\n── ${title} ─────────────────────────────────────────────────`)
  const fam = golden[name]; let n = 0, d = 0, first = null
  for (let i = 0; i < fam.cases.length; i++) {
    const cx = decodeCase(name, fam, fam.cases[i]); n++
    if (!same(NEW, cx, cx.digest)) { d++; if (first === null) first = i }
  }
  for (const ex of fam.examples) check(same(NEW, ex.input, ex.digest) && digest(JSON.stringify(ex.output)) === ex.digest, `example #${ex.index}: current snapshot = golden digest = sha256(stored full output)`)
  check(d === 0, `${n} cases (seed ${fam.seed}): ${d} differ${first !== null ? ' — first at #' + first : ''}`)
}
family('gustoShaped', 'GUSTO-SHAPED (batch 2, prep 5, kc 2, 5-minute grid)')
family('sweep1515', 'THE 15/15 SWEEP (batch 8, prep 15, kc NULL, 15-minute grid, 4 event starts)')
family('aligned240', "SEEDED ALIGNED SWEEP: every category's prep ≤ the grid step")

console.log('\n── GUSTO LIVE-SHAPED: real production_slot_usage rows, categories and van (static fixture) ─')
{
  const live = golden.gustoLive.inputs
  const cfg = Object.fromEntries(live.menu_categories.map(c => [c.name.toLowerCase(), { secs: c.prep_secs || 0, batch: c.batch_size || 0, countsToCapacity: !!c.counts_toward_capacity }]))
  const van = live.truck_van
  check(cfg.pizza.secs === 300 && cfg.pizza.batch === 2 && van.kitchen_capacity === 2 && van.capacity_window_mins === 5, `Gusto fixture: Pizza ${cfg.pizza.secs}s/${cfg.pizza.batch}, van kc ${van.kitchen_capacity}, window ${van.capacity_window_mins}, interval ${van.collection_interval_mins}`)
  for (const c of golden.gustoLive.cases) check(same(NEW, c.input, c.digest), c.label)
  check(golden.gustoLive.cases.length === 6, `${golden.gustoLive.cases.length} real Gusto events checked (3 past, 3 upcoming)`)
}

console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ rolling fix is a no-op on every aligned fixture and on Gusto\'s live state (vs the committed golden)'}`)
process.exit(fails ? 1 : 0)
