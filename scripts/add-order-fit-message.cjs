#!/usr/bin/env node
// scripts/add-order-fit-message.cjs
//
// The Add Order "Can't be ready by {T}" popup and the time-list label, through the REAL engine on FIXTURES.
//   node scripts/add-order-fit-message.cjs
//
// 🔴 WHAT A FAILURE LOOKS LIKE — THE ONE THAT SENT DOMINIC HERE. Nine pizzas at 18:45 on an 8-batch,
// 15-minute grill with 8 already cooking into 18:30. The old popup said:
//     "Pizza can be made 8 at a time. Around 18:15–18:45 it would need 16."
// SIXTEEN PIZZAS IS NOT A THING. It is two separate batches summed into a number no oven holds and no
// operator can act on — and it buried the actual answer, which is that ONE of the two batches this order
// needs has room and the other is full. So: the popup must print per-window figures only, never a
// combined total, and the time list must say "Not enough time" on exactly the times the popup would
// fire on — no more (a slot that fits must never be labelled) and no fewer.
//
// Everything below runs the REAL fitOrderBackward and the REAL lib/slot-fit-message.ts. The only thing
// modelled is the React memo, and its argument list is asserted against the source at the end.

const fs = require('fs'); const os = require('os'); const path = require('path')
const { compile, REPO } = require('./_slot-interval-compile.cjs')

const c = compile(REPO, ['lib/slot-availability.ts', 'lib/slot-fit-message.ts', 'lib/slot-generation.ts', 'lib/slot-display.ts'], 'aofm')
const E = c.req('lib/slot-availability.js')
const MSG = c.req('lib/slot-fit-message.js')
const G = c.req('lib/slot-generation.js')
const D = c.req('lib/slot-display.js')

let fails = 0
const check = (ok, label) => { console.log(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }
const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const mins = t => parseInt(t.slice(0, 2)) * 60 + parseInt(t.slice(3))
const NEG = Number.NEGATIVE_INFINITY
const grid = (start, end, iv) => G.generateCollectionTimes(fmt(start), fmt(end), iv, iv, 30)
  .map(t => ({ collection_time: t.collection_time, production_slot: t.collection_time, production_window_key: t.collection_time }))

/** The real fit for one candidate time — the exact call the popup and the label both make. */
function fitAt(cx, timeLabel) {
  const back = E.projectBackwardOccupancy(cx.units, cx.cfg, cx.start, cx.kc, cx.cw ?? 5)
  return E.fitOrderBackward(back, mins(timeLabel), cx.order, cx.cfg, cx.kc, cx.start, cx.cw ?? 5, cx.now ?? NEG, cx.units[timeLabel] || {})
}
/** The popup, end to end: engine → why → words. `labels` maps the engine key to the stored name. */
function popup(cx, timeLabel, labels = { pizza: 'Pizza' }) {
  const fit = fitAt(cx, timeLabel)
  const m = MSG.buildFitMessage({ slotLabel: timeLabel, why: fit.why, catLabel: k => labels[k] || '' })
  return { fit, ...m, text: [m.title, ...m.lines].join('\n') }
}

// ── DOMINIC'S CASE ────────────────────────────────────────────────────────────────────────────────
const PIZZA8 = { pizza: { secs: 900, batch: 8, countsToCapacity: true } }
const DOMINIC = { units: { '18:30': { pizza: 8 }, '19:00': { pizza: 8 } }, cfg: PIZZA8, start: 17 * 60, kc: null, order: { pizza: 9 }, iv: 15, end: 21 * 60 }
const EXPECTED = [
  'Can\u2019t be ready by 18:45',
  'Pizza: 8 at a time, every 15 minutes.',
  'This order needs 2 batches to be ready by 18:45, but only 1 has room.',
  '18:15–18:30 · Pizza · Full',
  '18:30–18:45 · Pizza · 8 free',
].join('\n')

console.log('── BROKEN VARIANTS: EACH MUST report FAILURE ───────────────────────────────────────────')
{
  // V1 — the popup computing its own total instead of reading `why`. This is the OLD code's shape:
  // take bound_by's "Pizza 16/8" and print the 16. It must fail the no-16 assertion.
  const fit = fitAt(DOMINIC, '18:45')
  const m = fit.bound_by.match(/^(.+?) (\d+)\/(\d+)$/)
  const v1 = `Pizza can be made ${m[3]} at a time. Around ${fmt(fit.spanFromMins)}–18:45 it would need ${m[2]}.`
  const caught = /\b16\b/.test(v1)
  console.log(`  ${caught ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 popup re-deriving its own total: "${v1}"`)
  if (!caught) process.exit(1)
}
{
  // V2 — the label driven by the basket-agnostic DOT instead of the fit. Dominic's 18:45 is not busy
  // at all on the board (nothing is stored there); only the ORDER makes it impossible. A dot-driven
  // label therefore misses it, which is precisely today's behaviour and the bug being fixed.
  const ind = D.buildSlotIndicators(grid(DOMINIC.start, DOMINIC.end, DOMINIC.iv), DOMINIC.units, DOMINIC.cfg, DOMINIC.kc, DOMINIC.start, ['pizza'], 5, DOMINIC.iv)
  const dotSaysWontFit = (ind.get('18:45')?.tone ?? 'green') === 'red'
  const fitSaysWontFit = !fitAt(DOMINIC, '18:45').fits
  const caught = !dotSaysWontFit && fitSaysWontFit
  console.log(`  ${caught ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V2 label from the no-basket dot: 18:45 dot='${ind.get('18:45')?.tone}' ⇒ no label, while the real fit refuses it`)
  if (!caught) process.exit(1)
}
{
  // V3 — a label shown when there is no capacity data. The memo must return early; a variant that
  // skips that guard labels every time off an empty projection, inventing verdicts from nothing.
  const noData = { units: {}, cfg: PIZZA8, start: 17 * 60, kc: null, order: { pizza: 9 }, iv: 15, end: 21 * 60 }
  const labelled = grid(noData.start, noData.end, noData.iv).filter(t => !fitAt(noData, t.collection_time).fits)
  const caught = labelled.length > 0
  console.log(`  ${caught ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V3 no guard, empty inputs: ${labelled.length} time(s) would be labelled from data that does not exist`)
  if (!caught) process.exit(1)
}

console.log("\n── DOMINIC'S CASE: 8 @18:30, 8 @19:00, order 9 pizzas at 18:45 ────────────────────────")
{
  const p = popup(DOMINIC, '18:45')
  check(!p.fit.fits, `the engine refuses 18:45 (bound_by "${p.fit.bound_by}")`)
  check(p.text === EXPECTED, 'the popup is EXACTLY the five expected lines')
  if (p.text !== EXPECTED) { console.log('    expected:\n' + EXPECTED.split('\n').map(l => '      ' + l).join('\n')); console.log('    actual:\n' + p.text.split('\n').map(l => '      ' + l).join('\n')) }
  check(!/\b16\b/.test(p.text), `no "16" anywhere in the popup (the old copy's phantom total)`)
  // 🔴 THE RULE: never print a total bigger than one batch (or the kitchen cap). Strip the CLOCK first
  // — "18:15–18:30" is four digits that mean a time, not a quantity — then every remaining number must
  // be ≤ the batch size. Under the old copy this failed on the 16.
  // Strip the two things that are numbers but not quantities of food: clock times ("18:15–18:30") and
  // the cadence ("every 15 minutes"). What remains is batch sizes, batch counts and free/needed items —
  // every one of which must be ≤ one batch. The old copy's 16 landed squarely here.
  const quantities = (p.text.replace(/\d{1,2}:\d{2}/g, '').replace(/every \d+ minutes/g, '').match(/\d+/g) || []).map(Number)
  check(quantities.every(n => n <= 8), `every printed quantity of food ≤ the batch of 8: ${JSON.stringify(quantities)}`)
}

console.log('\n── THE OTHER SHAPES ────────────────────────────────────────────────────────────────────')
{
  // N = 1, and the single batch is full.
  const cx = { units: { '18:45': { pizza: 8 } }, cfg: PIZZA8, start: 17 * 60, kc: null, order: { pizza: 4 }, iv: 15, end: 21 * 60 }
  const p = popup(cx, '18:45')
  check(p.lines[1] === "This order needs 1 batch to be ready by 18:45, and it doesn't have room.", `N=1: "${p.lines[1]}"`)
  check(p.lines[2] === '18:30–18:45 · Pizza · Full', `…and its window line: "${p.lines[2]}"`)
}
{
  // N > 1 and NONE has room: both windows already full.
  const cx = { units: { '18:30': { pizza: 8 }, '18:45': { pizza: 8 } }, cfg: PIZZA8, start: 17 * 60, kc: null, order: { pizza: 9 }, iv: 15, end: 21 * 60 }
  const p = popup(cx, '18:45')
  check(p.lines[1] === 'This order needs 2 batches to be ready by 18:45, and none has room.', `N>1, M=0: "${p.lines[1]}"`)
  check(p.lines.filter(l => l.endsWith('· Full')).length === 2, 'both window lines read Full')
}
{
  // 0 < free < share ⇒ the "needs {share}" line. 3 already cooking in the earlier window, this order
  // wants 8 there, so 5 are free and 8 are needed.
  const cx = { units: { '18:30': { pizza: 3 }, '19:00': { pizza: 8 } }, cfg: PIZZA8, start: 17 * 60, kc: null, order: { pizza: 9 }, iv: 15, end: 21 * 60 }
  const p = popup(cx, '18:45')
  const line = p.lines.find(l => / free, needs /.test(l))
  check(line === '18:15–18:30 · Pizza · 5 free, needs 8', `partial room: "${line}"`)
  check(p.lines[1] === 'This order needs 2 batches to be ready by 18:45, but only 1 has room.', `…with M=1: "${p.lines[1]}"`)
}
{
  // KITCHEN CEILING, Gusto-shaped: batch 2, kc 2, a second category already cooking.
  const GUSTO = { pizza: { secs: 300, batch: 2, countsToCapacity: true }, dessert: { secs: 300, batch: 3, countsToCapacity: true } }
  const cx = { units: { '17:05': { dessert: 2 } }, cfg: GUSTO, start: 17 * 60, kc: 2, order: { pizza: 2 }, iv: 5, end: 19 * 60 }
  const p = popup(cx, '17:05', { pizza: 'Pizza', dessert: 'Dessert' })
  const k = p.fit.why.find(w => w.kind === 'kitchen')
  check(!!k, `the ceiling is the blocking reason (bound_by "${p.fit.bound_by}")`)
  check(p.lines.some(l => l === 'Your kitchen cooks up to 2 items at a time. Between 17:00 and 17:05 it’s already cooking 2, and this order needs 2 more.'.replace('’', "'")), `kitchen sentence: "${p.lines.find(l => l.startsWith('Your kitchen'))}"`)
  // 🔴 THE DRIFT GUARD: the descriptive split must reconstruct the verdict's own peak, exactly.
  check(k.existing + k.add === p.fit.peak, `existing ${k.existing} + add ${k.add} === fit.peak ${p.fit.peak}`)
}
{
  // PRE-OPEN: 6 pizzas at the 17:00 opening on a 2-batch, 5-minute grill needs three windows, the
  // earliest starting 16:45 — two windows before the doors open.
  const P2 = { pizza: { secs: 300, batch: 2, countsToCapacity: true } }
  const cx = { units: {}, cfg: P2, start: 17 * 60, kc: null, order: { pizza: 6 }, iv: 5, end: 19 * 60 }
  const p = popup(cx, '17:00')
  check(p.fit.why.some(w => w.kind === 'preopen'), `pre-open recorded (bound_by "${p.fit.bound_by}")`)
  check(p.lines.some(l => l === 'Pizza for 17:00 would need to start cooking before your event opens.'), `pre-open sentence: "${p.lines.find(l => l.includes('before your event opens'))}"`)
}
{
  // TWO REASONS, and the order must be batch → kitchen.
  const P2 = { pizza: { secs: 300, batch: 2, countsToCapacity: true } }
  const cx = { units: { '17:05': { pizza: 2 } }, cfg: P2, start: 17 * 60, kc: 2, order: { pizza: 2 }, iv: 5, end: 19 * 60 }
  const p = popup(cx, '17:05')
  const kinds = p.fit.why.map(w => w.kind)
  check(kinds.length === 2 && kinds[0] === 'batch' && kinds[1] === 'kitchen', `reasons in order: ${JSON.stringify(kinds)}`)
  check(p.lines[0].startsWith('Pizza:') && p.lines.findIndex(l => l.startsWith('Your kitchen')) > 0, 'the batch sentence is printed before the kitchen one')
}
{
  // FITTING slots carry nothing to say.
  const cx = { units: {}, cfg: PIZZA8, start: 17 * 60, kc: null, order: { pizza: 4 }, iv: 15, end: 21 * 60 }
  const p = popup(cx, '18:45')
  check(p.fit.fits && p.fit.why.length === 0 && p.lines.length === 0, 'a slot that fits ⇒ why empty ⇒ no lines')
}

console.log('\n── THE LABEL APPEARS ON EXACTLY THE TIMES THE POPUP WOULD ──────────────────────────────')
{
  // The memo, modelled: no capacity data or an empty basket ⇒ no labels; otherwise one fit per time.
  const labelSet = (cx, hasInputs) => {
    const out = new Set()
    if (!hasInputs) return out
    if (!Object.keys(cx.order).length) return out
    for (const t of grid(cx.start, cx.end, cx.iv)) if (!fitAt(cx, t.collection_time).fits) out.add(t.collection_time)
    return out
  }
  const CFGS = [
    { name: 'burgers 8/15 on a 15 grid', cfg: PIZZA8, iv: 15, kc: null },
    { name: 'pizza 2/5 kc 2 on a 5 grid', cfg: { pizza: { secs: 300, batch: 2, countsToCapacity: true } }, iv: 5, kc: 2 },
    { name: 'two cats, kc 6, 10 grid', cfg: { pizza: { secs: 600, batch: 4, countsToCapacity: true }, dessert: { secs: 300, batch: 3, countsToCapacity: true } }, iv: 10, kc: 6 },
  ]
  let seed = 31337; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
  let combos = 0, times = 0, mismatched = 0, labelled = 0, t0 = Date.now()
  for (const C of CFGS) {
    for (let i = 0; i < 20; i++) {
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
      const labels = labelSet(cx, true)
      combos++
      for (const t of grid(start, end, C.iv)) {
        times++
        const wouldPopup = !fitAt(cx, t.collection_time).fits
        const isLabelled = labels.has(t.collection_time)
        if (wouldPopup !== isLabelled) mismatched++
        if (isLabelled) labelled++
      }
    }
  }
  check(combos >= 50, `${combos} fixture order/basket combinations swept (≥ 50 required)`)
  check(mismatched === 0, `${times} times checked, ${labelled} labelled, ${mismatched} where the label and the popup disagree`)
  console.log(`  ℹ cost: ${combos} combos × ~${Math.round(times / combos)} times = ${times} fits in ${Date.now() - t0} ms (${((Date.now() - t0) / combos).toFixed(2)} ms per recompute of a whole list)`)

  const empty = { units: { '18:30': { pizza: 8 } }, cfg: PIZZA8, start: 17 * 60, end: 21 * 60, kc: null, order: {}, iv: 15 }
  check(labelSet(empty, true).size === 0, 'an EMPTY order labels nothing — the list is unchanged')
  check(labelSet(DOMINIC, false).size === 0, 'NO capacity data labels nothing — never a verdict without inputs')
  check(labelSet(DOMINIC, true).has('18:45'), "…and with data, Dominic's 18:45 IS labelled")
}

console.log('\n── THE SHIPPED CODE MATCHES WHAT WAS MODELLED (source-level) ───────────────────────────')
{
  const panel = fs.readFileSync(path.join(REPO, 'components/dashboard/AddOrderPanel.tsx'), 'utf8')
  check(/const manualFitWhy = useMemo\(/.test(panel), 'the per-time memo exists (manualFitWhy)')
  check(/if \(!capacityInputs \|\| !manualSlots\.length\) return out/.test(panel), 'it returns early with no capacity inputs ⇒ no label')
  check(/if \(!Object\.keys\(basketByCat\)\.length\) return out/.test(panel), 'it returns early with an empty basket ⇒ no label')
  check(/if \(!fit\.fits\) out\.set\(s\.collection_time, fit\.why\)/.test(panel), 'it labels exactly the times the engine refuses')
  // 19 September 2026: the wording, the separators AND the red rule live in ONE shared formatter —
  // formatFitSuffix (lib/slot-display) — which the option calls with the dot's tone. The panel no longer
  // spells the string at all, so the assertion is on the call and on the formatter's own text.
  check(/\{formatFitSuffix\(ind\.tone, wontFit, !!label\)\}/.test(panel), 'the option appends the shared fit suffix, passing the dot\'s tone')
  check(!/Order won|Won\u2019t fit|Not enough time/.test(panel.replace(/\/\/[^\n]*/g, '')), '…and the panel spells no fit wording of its own (comments aside)')
  {
    const disp = fs.readFileSync(path.join(REPO, 'lib/slot-display.ts'), 'utf8')
    const fn = disp.slice(disp.indexOf('export function formatFitSuffix'), disp.indexOf('interface SlotInput'))
    check(/if \(!doesNotFit \|\| tone === 'red'\) return ''/.test(fn), 'the formatter renders nothing on a red dot, and nothing when the order fits')
    check(/hasLabel \? ' · Not enough time' : ' Not enough time'/.test(fn), '…" · Not enough time" after a label, " Not enough time" after a bare dot (no dash)')
  }
  check(/buildFitMessage\(\{ slotLabel: effectiveSlot, why: fit\.why, catLabel: catLabelFor \}\)/.test(panel), 'the popup is built from fit.why alone')
  // The popup and the label must feed the engine the SAME arguments, or they could disagree.
  for (const arg of ['basketByCat', 'capacityInputs.kitchenCapacity ?? null', 'capacityInputs.eventStartMins', 'capacityInputs.capacityWindowMins ?? 5'])
    check(panel.includes(arg), `the memo passes ${arg}`)
  // Comments are where this file RECORDS what was removed and why, so judge the code with them stripped.
  const panelCode = panel.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
  check(!/contributingProductionSlots|thisOrderQty|unitWord|it would need/.test(panelCode), 'the re-derived figures, the contributor rows and "it would need" are gone from the CODE')
  check(!/capacityConfirm\.(bind|unitWord|contributors|thisOrderQty|windowFrom)/.test(panelCode), 'and nothing reads the removed state fields')
  const msg = fs.readFileSync(path.join(REPO, 'lib/slot-fit-message.ts'), 'utf8')
  check(!/[+\-*/]\s*(batch|cap|existing|share|free)\b/.test(msg.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')), 'lib/slot-fit-message.ts does no arithmetic on the capacity figures')
}

console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ popup and label proven against the real engine'}`)
process.exit(fails ? 1 : 0)
