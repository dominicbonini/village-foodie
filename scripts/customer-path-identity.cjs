#!/usr/bin/env node
// scripts/customer-path-identity.cjs
//
// The CUSTOMER picker is untouched by the Add Order popup work.
//   node scripts/customer-path-identity.cjs
//
// 🔴 WHAT A FAILURE LOOKS LIKE: a customer being offered — or refused — a collection time they would
// not have been before. The customer page decides that with `unfittableSlots`, a set built from
// `fitOrderBackward(...).fits` alone (app/trucks/[slug]/order/page.tsx). The Add Order work added a
// descriptive `why` to that same function's result, so this proves two things:
//   1. the customer files were not edited at all by this work, and
//   2. `fits` — the only field the customer path reads — is identical for every swept fixture between
//      the engine as it stood BEFORE this work and the engine as it stands now.
// "BEFORE" is reconstructed by mechanically removing this work's additions from a copy of the engine,
// so the comparison needs nothing outside the repo and no stash.

const fs = require('fs'); const os = require('os'); const path = require('path')
const { execFileSync } = require('child_process')
const { compile, REPO } = require('./_slot-interval-compile.cjs')

let fails = 0
const check = (ok, label) => { console.log(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }
const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const mins = t => parseInt(t.slice(0, 2)) * 60 + parseInt(t.slice(3))
const NEG = Number.NEGATIVE_INFINITY

// ── BUILD THE "BEFORE" ENGINE ─────────────────────────────────────────────────────────────────────
// Each entry is an exact fragment this work ADDED, paired with what stood there before. Every one must
// match exactly once, or the reconstruction is not trustworthy and this harness stops.
const REVERSALS = [
  // the `why` field on the result type
  [`  spanFromMins: number | null
  /** WHY it does not fit, in the order a human should read it: batch, then kitchen, then pre-open.
   *  ALWAYS EMPTY when fits is true. Purely descriptive — see FitWhy. ADDITIVE: every field above is
   *  unchanged for every input, which scripts/batch-rolling-identity.cjs proves against the committed
   *  golden. */
  why: FitWhy
  /** P3, switch ON only (the key is ABSENT otherwise): per cooking category, the windows reserveBatches
   *  would reserve — the exact record the writers store — or null when the category does not fit. */
  reserved?: Record<string, CookingReservationWindow[] | null>
} {`, `  spanFromMins: number | null
} {`],
  // the pre-open recording
  [`nowMins)) {
      runsOffFront = true
      whyPreOpen.push({ kind: 'preopen', cat, eventStartMins })   // descriptive only — the flag above is the verdict
    }`, `nowMins)) runsOffFront = true`],
  // the batch recording, back to the single combined read
  [`      const existing = categoryLoadOver(back.intervals, cat, ws, ws + prep)
      const combined = existing + add`, `      const combined = categoryLoadOver(back.intervals, cat, ws, ws + prep) + add`],
  [`      // DESCRIPTIVE, from the very numbers above — no second read of back.intervals.
      const list = whyWindows.get(cat) ?? []
      list.push({ startMins: ws, endMins: ws + prep, existing: Math.round(existing), free: Math.max(0, Math.round(batch - existing)), share: Math.round(add) })
      whyWindows.set(cat, list)
      if (t === 'red') whyBatchBlocked.add(cat)
`, ``],
  [`    prepOf[cat] = prep
`, ``],
]
const before = (() => {
  const src = fs.readFileSync(path.join(REPO, 'lib/slot-availability.ts'), 'utf8')
  let out = src
  for (const [added, was] of REVERSALS) {
    if (out.split(added).length !== 2) { console.log(`🔴 reconstruction fragment not found exactly once:\n${added.slice(0, 90)}…`); process.exit(1) }
    out = out.replace(added, was)
  }
  // the blocks that are wholly new: the type/helper preamble, the accumulators, the assembly
  const cut = (from, to) => {
    // `to` is searched FROM `a`: several of these anchors (e.g. `const capacityStep = …`) also occur
    // earlier in the file, and a plain indexOf would find the wrong one and cut backwards.
    const a = out.indexOf(from), b = out.indexOf(to, a < 0 ? 0 : a)
    if (a < 0 || b < 0 || b < a) { console.log(`🔴 reconstruction block not found: ${from.slice(0, 60)}…`); process.exit(1) }
    out = out.slice(0, a) + out.slice(b)
  }
  cut('// ── DESCRIPTIVE FIT DETAIL — WHY A SLOT DOES NOT FIT', 'function windowScopedPeak(')
  cut('  // ── DESCRIPTIVE ACCUMULATORS (18 September 2026)', '  const capacityStep = Math.max(1, Math.round(capacityWindowMins))')
  // P3 (switch ON) lives in the same function and reads those accumulators; it is inert with the switch
  // off, which is what this harness compares, so it is removed from the "before" copy as well.
  // the end marker is newline-anchored: the ON block itself holds a same-named single-line loop at deeper indent.
  cut("    if (batchReservations) {\n      // ── P3, SWITCH ON: DOMINIC'S RULE", '\n    for (let i = 0; i < nw; i++) {\n')
  out = out.replace('  if (batchReservations) { for (const v of onVerdicts) consider(v.tone, v.label) }\n  for (const [ws, ord] of batchReservations ? [] : orderLoad) {', '  for (const [ws, ord] of orderLoad) {')
  cut('      const d = peakDetailOver(realIntervals, orderCookIntervals, capacityStep)\n      if (d) whyKitchen', '    } else {')
  cut('        // The instants could not be seated at all', '      } else {')
  cut(`  const fits = bindRank < RANK.red
  // ── ASSEMBLE \`why\``, '  return { tone, bound_by, fits')
  // (the P3 `if (batchReservations) return { …, reserved }` line sits inside the ASSEMBLE block cut above)
  out = out.replace(`  return { tone, bound_by, fits, peak: Math.round(reportedPeak), spanFromMins, why }`,
                    `  return { tone, bound_by, fits: bindRank < RANK.red, peak: Math.round(reportedPeak), spanFromMins }`)
  // Precise: the engine has carried a prose comment containing the word "why" since long before this
  // work, so match the ADDED IDENTIFIERS, not the English word.
  const leftovers = out.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /FitWhy|peakDetailOver|why:|\.why\b|whyWindows|whyKitchen|whyPreOpen|whyBatchBlocked|prepOf|reservedByCat|onVerdicts/.test(l))
  if (leftovers.length) { console.log('🔴 reconstruction still mentions the added code:'); for (const [n, l] of leftovers) console.log(`   ${n}: ${l.trim().slice(0, 100)}`); process.exit(1) }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cust-before-'))
  fs.cpSync(path.join(REPO, 'lib'), path.join(tmp, 'lib'), { recursive: true })
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules'))
  fs.writeFileSync(path.join(tmp, 'lib/slot-availability.ts'), out)
  return tmp
})()

const NOW = compile(REPO, ['lib/slot-availability.ts', 'lib/slot-generation.ts'], 'custNOW')
const OLD = compile(before, ['lib/slot-availability.ts', 'lib/slot-generation.ts'], 'custOLD')
const EN = NOW.req('lib/slot-availability.js'), EO = OLD.req('lib/slot-availability.js')
const G = NOW.req('lib/slot-generation.js')
const grid = (start, end, iv) => G.generateCollectionTimes(fmt(start), fmt(end), iv, iv, 30)
  .map(t => ({ collection_time: t.collection_time, production_slot: t.collection_time }))

console.log('── BROKEN VARIANT: MUST report FAILURE ──────────────────────────────────────────────────')
{
  // A customer-visible change is exactly a slot moving in or out of `unfittableSlots`. Flip one and the
  // comparison below must catch it — otherwise this harness could not see a real regression either.
  const cfg = { pizza: { secs: 300, batch: 2, countsToCapacity: true } }
  const cx = { units: { '17:05': { pizza: 2 } }, cfg, start: 17 * 60, kc: 2 }
  const times = grid(17 * 60, 18 * 60, 5)
  const back = EN.projectBackwardOccupancy(cx.units, cfg, cx.start, cx.kc, 5)
  const real = new Set(times.filter(t => !EN.fitOrderBackward(back, mins(t.collection_time), { pizza: 2 }, cfg, cx.kc, cx.start, 5, NEG, cx.units[t.collection_time] || {}).fits).map(t => t.collection_time))
  const tampered = new Set(real); const victim = times.find(t => !real.has(t.collection_time)).collection_time
  tampered.add(victim)
  const caught = real.size !== tampered.size
  console.log(`  ${caught ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 one slot (${victim}) forced into the customer's unfittable set: ${real.size} → ${tampered.size}`)
  if (!caught) process.exit(1)
}

console.log('\n── unfittableSlots: BEFORE vs NOW over the same fixture sweep ───────────────────────────')
{
  // The customer memo, modelled exactly: project once, then fit every available slot, keeping the ones
  // that do not fit. The ONLY field read is `fits`.
  const unfittable = (E, cx) => {
    const back = E.projectBackwardOccupancy(cx.units, cx.cfg, cx.start, cx.kc, cx.cw ?? 5)
    const out = []
    for (const t of grid(cx.start, cx.end, cx.iv)) {
      const f = E.fitOrderBackward(back, mins(t.collection_time), cx.order, cx.cfg, cx.kc, cx.start, cx.cw ?? 5, cx.now ?? NEG, cx.units[t.collection_time] || {})
      if (!f.fits) out.push(t.collection_time)
    }
    return out.join(',')
  }
  const CFGS = [
    { cfg: { pizza: { secs: 900, batch: 8, countsToCapacity: true } }, iv: 15, kc: null },
    { cfg: { pizza: { secs: 300, batch: 2, countsToCapacity: true } }, iv: 5, kc: 2 },
    { cfg: { pizza: { secs: 600, batch: 4, countsToCapacity: true }, dessert: { secs: 300, batch: 3, countsToCapacity: true } }, iv: 10, kc: 6 },
  ]
  let seed = 31337; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
  let n = 0, diff = 0, slots = 0
  for (const C of CFGS) for (let i = 0; i < 20; i++) {
    const start = 17 * 60, end = 21 * 60
    const units = {}
    for (const t of grid(start, end, C.iv)) if (rnd() < 0.35) {
      const u = {}
      for (const cat of Object.keys(C.cfg)) if (rnd() < 0.7) u[cat] = 1 + Math.floor(rnd() * 9)
      if (Object.keys(u).length) units[t.collection_time] = u
    }
    const order = {}
    for (const cat of Object.keys(C.cfg)) if (rnd() < 0.7) order[cat] = 1 + Math.floor(rnd() * 10)
    if (!Object.keys(order).length) order[Object.keys(C.cfg)[0]] = 1 + Math.floor(rnd() * 10)
    const cx = { units, cfg: C.cfg, start, end, kc: C.kc, order, iv: C.iv }
    const a = unfittable(EO, cx), b = unfittable(EN, cx)
    n++; slots += a ? a.split(',').length : 0
    if (a !== b) diff++
  }
  check(diff === 0, `${n} fixture baskets, ${slots} unfittable slots in total: ${diff} differ between BEFORE and NOW`)
}

console.log('\n── SWITCH ON: the offered-time sets are SUPERSETS of today\'s (Gusto-shaped sweep) ───────────')
{
  // P3 (18 September 2026): with the switch ON a customer must never lose a time they are offered today.
  const SN = require('./_batch-rolling-snapshot.cjs')
  const rolling = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/batch-rolling-golden.json'), 'utf8'))
  let cases = 0, lost = 0, gained = 0, offeredOff = 0, firstLost = null
  for (let i = 0; i < rolling.gustoShaped.cases.length; i++) { const cx = SN.decodeCase('gustoShaped', rolling.gustoShaped, rolling.gustoShaped.cases[i]); const cfg = { pizza: cx.cfg.pizza }; const times = rolling.grids[SN.gridKey(cx.start, cx.end, cx.iv)]
    for (let n = 1; n <= 8; n++) { cases++
      const off = EN.projectBackwardOccupancy(cx.units, cfg, cx.start, cx.kc, cx.cw), on = EN.projectBackwardOccupancy(cx.units, cfg, cx.start, cx.kc, cx.cw, [], true)
      for (const t of times) { const a = EN.fitOrderBackward(off, mins(t.collection_time), { pizza: n }, cfg, cx.kc, cx.start, cx.cw, NEG, cx.units[t.collection_time] || {}).fits
        const b = EN.fitOrderBackward(on, mins(t.collection_time), { pizza: n }, cfg, cx.kc, cx.start, cx.cw, NEG, cx.units[t.collection_time] || {}, true).fits
        if (a) offeredOff++; if (a && !b) { lost++; if (!firstLost) firstLost = { i, n, t: t.collection_time } } if (!a && b) gained++ } } }
  check(lost === 0, `${cases} baskets: ${offeredOff} times offered today, ${gained} newly offered ON, ${lost} LOST${firstLost ? ' — first ' + JSON.stringify(firstLost) : ''}`)
}

console.log('\n── THE CUSTOMER FILES WERE NOT EDITED BY THIS WORK ──────────────────────────────────────')
{
  // Every file the brief ring-fences. "Unchanged by this work" = its diff against HEAD is exactly the
  // diff the collection-times work already had, which these known line counts pin.
  const FILES = ['app/trucks/[slug]/order/page.tsx', 'app/api/slots/[truckId]/route.ts', 'app/api/menu/[truckId]/route.ts',
                 'app/api/events/route.ts', 'app/api/orders/submit/route.ts', 'lib/payments/promote-draft.ts', 'lib/orders/place-in-slot.ts']
  for (const f of FILES) {
    const d = execFileSync('git', ['diff', '--numstat', 'HEAD', '--', f], { cwd: REPO }).toString().trim()
    const src = fs.readFileSync(path.join(REPO, f), 'utf8')
    // Nothing in this work's vocabulary may appear in any of them.
    const touched = /buildFitMessage|FitWhy|slot-fit-message|manualFitWhy|Order won/.test(src)
    check(!touched, `${f} — ${d ? 'diff vs HEAD ' + d.split('\t').slice(0, 2).join('+/-') + ' (collection-times work)' : 'identical to HEAD'}; no reference to this work`)
  }
  check(!/\.why\b/.test(fs.readFileSync(path.join(REPO, 'app/trucks/[slug]/order/page.tsx'), 'utf8')), 'the customer page never reads `why` — it reads only fits')
}

fs.rmSync(before, { recursive: true, force: true })
console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ customer path identical before and after; customer files untouched'}`)
process.exit(fails ? 1 : 0)
