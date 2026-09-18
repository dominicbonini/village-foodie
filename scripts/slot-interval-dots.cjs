#!/usr/bin/env node
// scripts/slot-interval-dots.cjs
//
// Proof of the DISPLAY read: at 5 nothing changed; at 10–30 every cooking window lands on exactly one dot.
//   node scripts/slot-interval-dots.cjs
//
// 🔴 WHAT A FAILURE LOOKS LIKE: at interval 5 a dot (operator buildSlotIndicators, or the customer
// buildSlotAvailability no-basket row) differs in any byte from the same inputs through HEAD; at 15 the
// C1 fixture's 18:15 dot shows GREEN because the single-window read looked only at 18:10 (a window no
// order occupies) while the RED window at 18:05 vanished between dots; a 17:50 event start at 15 losing
// its pre-open pile because no dot sits at 17:50; a window counted on two dots, or on none.
//
// The HEAD readers are compiled from a clean `git worktree` of HEAD, not reconstructed.

const path = require('path')
const { compile, headWorktree } = require('./_slot-interval-compile.cjs')
const REPO = path.resolve(__dirname, '..')
const FILES = ['lib/slot-display.ts', 'lib/slot-availability.ts']
const head = headWorktree('dots')
const H = compile(head.wt, FILES, 'dotsHEAD'); const N = compile(REPO, FILES, 'dotsNOW')
const Hd = H.req('lib/slot-display.js'), Ha = H.req('lib/slot-availability.js')
const Nd = N.req('lib/slot-display.js'), Na = N.req('lib/slot-availability.js')

const fmt = (m) => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`
const grid = (from, to, iv) => { const o = []; for (let m = Math.ceil(from/iv)*iv; m <= to; m += iv) o.push({ collection_time: fmt(m), production_slot: fmt(m) }); return o }
const PIZZA = { pizza: { secs: 300, batch: 2 } }
const PIZZA4 = { pizza: { secs: 300, batch: 4 } }
const PIZZA_DESSERT = { pizza: { secs: 300, batch: 2 }, dessert: { secs: 300, batch: 3 } }
const GUSTO = { pizza: { secs: 300, batch: 2 }, drink: { secs: 0, batch: 1, countsToCapacity: true } }
const mapToObj = (m) => Object.fromEntries([...m.entries()].map(([k, v]) => [k, v]))
let fails = 0
const check = (ok, label) => { console.log(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }

// ── FIXTURES: the §31 worked examples + a seeded sweep ──────────────────────────────────────────────
const CASES = [
  ['§31 spread 3 pizzas @17:05', { units: { '17:05': { pizza: 3 } }, cfg: PIZZA, start: 17*60, end: 17*60+30, cap: null, cw: 5 }],
  ['§31 two ceilings @17:05 cap 4', { units: { '17:05': { pizza: 2, dessert: 2 } }, cfg: PIZZA_DESSERT, start: 17*60, end: 17*60+30, cap: 4, cw: 5 }],
  ['§31 kitchen ceiling over @17:05', { units: { '17:05': { pizza: 2, dessert: 3 } }, cfg: PIZZA_DESSERT, start: 17*60, end: 17*60+30, cap: 4, cw: 5 }],
  ['§31 pre-open pile 6 @16:30', { units: { '16:30': { pizza: 6 } }, cfg: PIZZA4, start: 16*60+30, end: 17*60, cap: null, cw: 5 }],
  ['§31 pile + 8 @16:35', { units: { '16:30': { pizza: 6 }, '16:35': { pizza: 8 } }, cfg: PIZZA4, start: 16*60+30, end: 17*60, cap: null, cw: 5 }],
  ['§31 ready-around full 17:00/17:05', { units: { '17:00': { pizza: 2, dessert: 2 }, '17:05': { pizza: 2, dessert: 2 } }, cfg: PIZZA_DESSERT, start: 17*60, end: 17*60+40, cap: 4, cw: 5 }],
  ['Gusto-shaped ticked drinks cap 2', { units: { '17:00': { drink: 2 }, '17:05': { pizza: 2, drink: 2 } }, cfg: GUSTO, start: 17*60, end: 17*60+30, cap: 2, cw: 5 }],
  ['test-truck shape cw 10', { units: { '18:10': { pizza: 3 }, '18:20': { pizza: 2, dessert: 4 } }, cfg: PIZZA_DESSERT, start: 18*60, end: 18*60+40, cap: 4, cw: 10 }],
]
let seed = 20260916; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
for (let i = 0; i < 60; i++) {
  const start = 16*60 + 5 * Math.floor(rnd() * 24)           // 16:00–17:55, on the 5 grid
  const end = start + 30 + 5 * Math.floor(rnd() * 12)
  const cfg = [PIZZA, PIZZA4, PIZZA_DESSERT, GUSTO][i % 4]
  const units = {}
  for (const s of grid(start, end, 5)) if (rnd() < 0.5) {
    const u = {}; for (const cat of Object.keys(cfg)) if (rnd() < 0.7) u[cat] = 1 + Math.floor(rnd() * 5)
    if (Object.keys(u).length) units[s.collection_time] = u
  }
  CASES.push([`sweep #${i} ${fmt(start)}–${fmt(end)}`, { units, cfg, start, end, cap: i % 3 === 0 ? null : 2 + (i % 4), cw: i % 5 === 0 ? 10 : 5 }])
}
// 18 September 2026: a SlotIndicator gained ADDITIVE fields (overlap, ownLabel, multiCat, nextFree — the overlap
// reason). HEAD's indicator has five; the identity claimed here is about THOSE (tone, emoji, label, overTotal,
// occ), so both sides are projected onto them — the same projection the goldens use (GOLDEN_DOT_KEYS).
const DOT_KEYS = ['tone', 'emoji', 'label', 'overTotal', 'occ']
const projectInd = (o) => Object.fromEntries(Object.entries(o).map(([t, d]) => [t, Object.fromEntries(DOT_KEYS.map(k => [k, d[k]]))]))
function indicators(D, c, iv) { return JSON.stringify(projectInd(mapToObj(D.buildSlotIndicators(grid(c.start, c.end + 30, iv), c.units, c.cfg, c.cap, c.start, Object.keys(c.cfg), c.cw, ...(iv === 5 && D === Hd ? [] : [iv]))))) }
function rows(A, c, iv, extra) { return JSON.stringify(A.buildSlotAvailability({ times: grid(c.start, c.end + 30, iv), productionSlotUnits: c.units, catConfigs: c.cfg, kitchenCapacity: c.cap, capacityWindowMins: c.cw, date: '2099-01-01', nowMins: Number.NEGATIVE_INFINITY, earliestCollectionMins: 0, eventStartMins: c.start, eventEndMins: c.end, ...extra })) }

// ── C1 fixture (the failure the build exists to fix) ─────────────────────────────────────────────────
const C1 = { units: { '18:10': { pizza: 3 } }, cfg: PIZZA, start: 18*60, end: 19*60, cap: null, cw: 5 }
// V2 fixture: two orders whose cooking windows fold onto the 18:15 dot at 15 — sum 6, true peak 2.
// §31 spreads the FULL batch earlier and the remainder nearest the deadline (3 @17:05 → 16:55 = 2, 17:00 = 1),
// so a 3-pizza order here would sum to 5, not 6 (a first draft of this fixture got that wrong). 4 @18:05 →
// 17:55 = 2, 18:00 = 2; 4 @18:15 → 18:05 = 2, 18:10 = 2. Dot 18:15 covers 18:00 + 18:05 + 18:10 = 2+2+2.
const V2F = { units: { '18:05': { pizza: 4 }, '18:15': { pizza: 4 } }, cfg: PIZZA, start: 18*60, end: 19*60, cap: null, cw: 5 }

console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')
{
  // V1: the single-window read (HEAD's) applied to a 15 grid on C1.
  const back = Na.projectBackwardOccupancy(C1.units, C1.cfg, C1.start, C1.cap, C1.cw)
  const step = Na.backwardWindowStepMins(C1.cfg)
  const v1 = back.pileByStart.get(18*60+15) ?? back.byStart.get(18*60+15 - step) ?? null
  const v1Green = !v1 || v1.tone === 'green'
  console.log(`  ${v1Green ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 single-window read at 15: C1's 18:15 dot shows ${v1 ? v1.tone : 'nothing (green)'} — the RED 18:05 window fell between dots`)
  if (!v1Green) { head.remove(); process.exit(1) }
  // V2: a SUMMED count across the covered windows (18:00, 18:05, 18:10 → 2+2+2 = 6) instead of the peak window.
  const back2 = Na.projectBackwardOccupancy(V2F.units, V2F.cfg, V2F.start, V2F.cap, V2F.cw)
  let summed = 0; for (const ws of [18*60, 18*60+5, 18*60+10]) summed += back2.byStart.get(ws)?.total ?? 0
  const real = Na.coverDotWindows(back2, 18*60+15, 18*60, step, V2F.start)
  console.log(`  ${summed === 6 && real && real.total === 2 ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V2 summed count shows ${summed} on the 18:15 dot; the real read shows the peak window's ${real && real.total} (a 2-batch oven never holds 6 at once)`)
  if (!(summed === 6 && real && real.total === 2)) { head.remove(); process.exit(1) }
}

console.log('\n── AT 5: both readers byte-identical to HEAD ────────────────────────────────────────────')
{
  let diffInd = 0, diffRows = 0
  for (const [label, c] of CASES) {
    if (indicators(Hd, c, 5) !== indicators(Nd, c, 5)) { diffInd++; console.log(`    🔴 indicators differ: ${label}`) }
    if (rows(Ha, c, 5, {}) !== rows(Na, c, 5, { displayIntervalMins: 5 })) { diffRows++; console.log(`    🔴 rows differ: ${label}`) }
  }
  check(diffInd === 0, `operator buildSlotIndicators identical to HEAD on all ${CASES.length} cases at 5`)
  check(diffRows === 0, `customer buildSlotAvailability rows identical to HEAD on all ${CASES.length} cases at 5 (no basket)`)
  // And with a basket the fit path is untouched at any interval (D4: fitOrderBackward is per-slot, not per-dot).
  let diffBasket = 0
  for (const [, c] of CASES) if (rows(Ha, c, 5, { basketByCat: { pizza: 2 } }) !== rows(Na, c, 5, { basketByCat: { pizza: 2 }, displayIntervalMins: 5 })) diffBasket++
  check(diffBasket === 0, 'with a basket, rows identical to HEAD at 5 (fit path untouched)')
}

console.log('\n── AT 15: the C1 fixture ────────────────────────────────────────────────────────────────')
{
  const ind = Nd.buildSlotIndicators(grid(C1.start, C1.end, 15), C1.units, C1.cfg, C1.cap, C1.start, ['pizza'], C1.cw, 15)
  const d = ind.get('18:15')
  console.log(`    18:15 → ${JSON.stringify(d)}`)
  check(d && d.tone === 'red', 'C1 at 15: the 18:15 dot is RED (worst covered window, 18:05, 2 pizzas in a 2-batch)')
  // 19 September 2026: the "peak " prefix is gone, and the label is the SPAN TOTAL — every batch the dot
  // covers, counted once. C1 seats 3 pizzas collected 18:10 on a 5-minute cook: batch 2 fills 18:00–18:05
  // and the remaining 1 cooks 18:05–18:10, and the 18:15 dot on a 15-minute grid covers both windows. So
  // it reads 3 — the food that comes out of that stretch — where the peak across them is 2.
  check(d && /^3 pizza/i.test(d.label || ''), `C1 at 15: label reads the SPAN TOTAL "3 Pizzas" (the dot's two covered windows), no "peak" prefix (got ${JSON.stringify(d && d.label)})`)
  const d18 = ind.get('18:00')
  check(!d18 || d18.tone === 'green', 'C1 at 15: the 18:00 dot stays green (nothing before 18:00)')
  // The customer row at 15 agrees.
  const r = Na.buildSlotAvailability({ times: grid(C1.start, C1.end, 15), productionSlotUnits: C1.units, catConfigs: C1.cfg, kitchenCapacity: null, capacityWindowMins: 5, date: '2099-01-01', nowMins: Number.NEGATIVE_INFINITY, earliestCollectionMins: 0, eventStartMins: C1.start, eventEndMins: C1.end, displayIntervalMins: 15 }).find(x => x.collection_time === '18:15')
  check(r && r.tone === 'red', `C1 at 15: customer no-basket row 18:15 is RED too (got ${r && r.tone})`)
}

console.log('\n── AT 15: a 17:50 start keeps its pre-open pile on the first dot (18:00) ────────────────')
{
  const c = { units: { '17:50': { pizza: 6 } }, cfg: PIZZA4, start: 17*60+50, end: 19*60, cap: null, cw: 5 }
  const ind = Nd.buildSlotIndicators(grid(c.start, c.end, 15), c.units, c.cfg, c.cap, c.start, ['pizza'], c.cw, 15)
  const d = ind.get('18:00')
  console.log(`    18:00 → ${JSON.stringify(d)}`)
  check([...ind.keys()][0] === '18:00', 'first dot is 18:00 (clock-anchored)')
  check(d && d.tone === 'red' && /6/.test(d.label || ''), '18:00 carries the 17:50 pile: RED, 6 pizzas')
}

console.log('\n── AT 10/15/20/30: every non-empty window lands on exactly ONE dot ───────────────────────')
{
  let bad = 0, total = 0
  for (const iv of [10, 15, 20, 30]) for (const start of [17*60, 17*60+50, 16*60+35]) {
    const end = start + 90
    for (let k = start; k <= end; k += 5) {         // one order at each possible stored 5-min key
      const units = { [fmt(k)]: { pizza: 1 } }
      const ind = Nd.buildSlotIndicators(grid(start, end + 30, iv), units, PIZZA, null, start, ['pizza'], 5, iv)
      const lit = [...ind.values()].filter(x => x && x.tone !== 'green').length
      total++; if (lit !== 1) { bad++; if (bad <= 5) console.log(`    🔴 iv ${iv} start ${fmt(start)} order @${fmt(k)} lit ${lit} dots`) }
    }
  }
  check(bad === 0, `${total} single-window fixtures across 10/15/20/30 × three starts: each lit exactly one dot`)
}
head.remove()
console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ dots proven'}`)
process.exit(fails ? 1 : 0)
