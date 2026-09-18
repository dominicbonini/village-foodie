#!/usr/bin/env node
// scripts/batch-reservation-helper.cjs — reserveBatches, Dominic's rule, pinned before anything uses it.
//   node scripts/batch-reservation-helper.cjs
// 🔴 FAILURE MODE: the helper splitting an order that fits one batch, using more (or fewer) windows than
// ceil(items/batch), filling an earlier window before the nearest one, or refusing when the free space
// adds up. P3 will make the picker trust this function; today nothing does, which is when to prove it.
const { compile, REPO } = require('./_slot-interval-compile.cjs')
const c = compile(REPO, ['lib/slot-availability.ts'], 'brh'); const E = c.req('lib/slot-availability.js')
let fails = 0; const check = (ok, l) => { console.log(`  ${ok ? '✓' : '🔴'} ${l}`); if (!ok) fails++ }
const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`, mins = t => parseInt(t.slice(0, 2)) * 60 + parseInt(t.slice(3))
const iv = (s, e, items) => ({ startMins: s, endMins: e, items, cat: 'pizza' })
const call = (intervals, T, items, batch = 8, prep = 15, kc = null, start = 17 * 60) =>
  E.reserveBatches({ intervals, cat: 'pizza', slotMins: mins(T), items, batch, prepMins: prep, kitchenCapacity: kc, floorMins: start - prep })
const shape = r => r.windows.map(w => `${fmt(w.startMins)}-${fmt(w.endMins)}:${w.share}`).join(' ')

console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')
{
  // V1 — a splittable 4-item order spread over TWO windows (2 + 2). Dominic: an order that fits one batch
  // is never split. Modelled as a helper that always uses ceil(items/batch)+1 windows when items > 1.
  const v1 = (items, batch) => Math.max(1, Math.ceil(items / batch)) + (items > 1 ? 1 : 0)
  const bad1 = v1(4, 8) !== 1
  console.log(`  ${bad1 ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 4 items on an 8-batch spread over ${v1(4, 8)} windows`)
  if (!bad1) process.exit(1)
  // V2 — 9 items over THREE windows (3 + 3 + 3): the rule says exactly ceil(9/8) = 2.
  const v2 = (items, batch) => Math.ceil(items / batch) + 1
  const bad2 = v2(9, 8) !== 2
  console.log(`  ${bad2 ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V2 9 items over ${v2(9, 8)} windows`)
  if (!bad2) process.exit(1)
}
console.log("\n── THE WORKED CASE (batch 8, prep 15, event 17:00) ──────────────────────────────────────")
{
  const stored = [iv(16 * 60 + 45, 17 * 60, 8), iv(17 * 60, 17 * 60 + 15, 1)]   // 8 @17:00 (run-up), 1 @17:15
  const r = call(stored, '17:30', 9)
  check(r.fits && r.reason === 'ok', `9 @17:30 fits (${r.reason})`)
  check(shape(r) === '17:15-17:30:8 17:00-17:15:1', `…reserving 8 in 17:15–17:30 and 1 in 17:00–17:15 → ${shape(r)}`)
  check(r.windows[0].existing === 0 && r.windows[0].free === 8 && r.windows[1].existing === 1 && r.windows[1].free === 7, 'the windows report existing 0/1 and free 8/7')
  const full = [iv(18 * 60, 18 * 60 + 15, 8), iv(18 * 60 + 15, 18 * 60 + 30, 8), iv(18 * 60 + 45, 19 * 60, 8), iv(19 * 60, 19 * 60 + 15, 8)]
  const a = call(full, '18:45', 9), b = call(full, '19:30', 9)
  check(!a.fits && a.reason === 'batch' && !b.fits && b.reason === 'batch', `9 @18:45 and 9 @19:30 refused (${a.reason}, ${b.reason}) — free 0 + 8 < 9`)
}
console.log('\n── THE RULE, PROPERTY BY PROPERTY ─────────────────────────────────────────────────────')
{
  for (const n of [1, 3, 7, 8]) { const r = call([], '18:00', n); check(r.windows.length === 1 && r.windows[0].share === n, `${n} items (≤ batch) → exactly ONE window, never split → ${shape(r)}`) }
  for (const n of [9, 16, 17, 25]) { const r = call([], '18:00', n); check(r.windows.length === Math.ceil(n / 8), `${n} items → exactly ceil(${n}/8) = ${Math.ceil(n / 8)} windows`) }
  const r = call([iv(17 * 60 + 45, 18 * 60, 3)], '18:00', 9)   // the NEAREST window [17:45,18:00) has 3 already
  check(shape(r) === '17:45-18:00:5 17:30-17:45:4', `nearest-first: 9 with 3 already in the nearest window → ${shape(r)} (5 nearest, 4 earlier)`)
  const r0 = call([iv(17 * 60 + 30, 17 * 60 + 45, 3)], '18:00', 9)   // 3 in the EARLIER window: nearest takes all 8
  check(shape(r0) === '17:45-18:00:8 17:30-17:45:1', `…and with the 3 in the earlier window instead → ${shape(r0)} (8 nearest, 1 earlier)`)
  const r2 = call([iv(17 * 60 + 45, 18 * 60, 8)], '18:00', 9); check(!r2.fits, 'nearest full, earlier empty: free 0 + 8 = 8 < 9 → refused')
  const r3 = call([iv(17 * 60 + 45, 18 * 60, 7)], '18:00', 9); check(r3.fits && shape(r3) === '17:45-18:00:1 17:30-17:45:8', `nearest has 1 free: 1 there, 8 earlier → ${shape(r3)}`)
  const pre = call([], '17:00', 9); check(!pre.fits && pre.reason === 'preopen', `9 @17:00 (opening): earliest window 16:30 < floor 16:45 → ${pre.reason}`)
  // 🔴 NEVER SPLIT: 4 items fit one batch, so they use exactly ONE window even though 1 + 3 across two
  // windows would physically fit. Kitchen cap 6 with 5 cooking leaves 1 free in that window ⇒ refused.
  const kc = call([iv(17 * 60 + 45, 18 * 60, 5)], '18:00', 4, 8, 15, 6); check(!kc.fits && kc.reason === 'batch' && kc.windows.length === 1 && kc.windows[0].free === 1, `kitchen cap 6 with 5 cooking, 4 items: one window, 1 free < 4 → refused, never split (${kc.reason}, free ${kc.windows[0].free})`)
  // …and the cap applies to EVERY window: with kc 6 the empty earlier window offers only 6, so 1 + 6 < 9.
  const kc6 = call([iv(17 * 60 + 45, 18 * 60, 5)], '18:00', 9, 8, 15, 6); check(!kc6.fits && kc6.windows[1].free === 6, `9 items under kc 6: nearest 1 free + earlier 6 free (capped) = 7 < 9 → refused`)
  const kc8 = call([iv(17 * 60 + 45, 18 * 60, 5)], '18:00', 9, 8, 15, 8); check(kc8.fits && shape(kc8) === '17:45-18:00:3 17:30-17:45:6', `9 items under kc 8: 3 nearest (min(8−5, 8−5)), 6 earlier → ${shape(kc8)}`)
  const now = E.reserveBatches({ intervals: [], cat: 'pizza', slotMins: mins('18:00'), items: 9, batch: 8, prepMins: 15, kitchenCapacity: null, floorMins: 0, nowMins: 17 * 60 + 40 }); check(!now.fits && now.reason === 'now', `now-clamp 17:40: earliest window 17:30 is in the past → ${now.reason}`)
}
console.log('\n── GREEDY NEVER FAILS WHEN THE FREE SPACE ADDS UP (sweep) ───────────────────────────────')
{
  let seed = 777; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
  let n = 0, mismatch = 0, fits = 0
  for (let i = 0; i < 20000; i++) {
    const batch = 2 + Math.floor(rnd() * 8), prep = [5, 10, 15][i % 3], items = 1 + Math.floor(rnd() * 3 * batch)
    const T = 18 * 60 + 5 * Math.floor(rnd() * 24), ivs = []
    for (let k = 0; k < 6; k++) { const s = T - 5 * (1 + Math.floor(rnd() * 12)); ivs.push(iv(s, s + prep, 1 + Math.floor(rnd() * batch))) }
    const kc = rnd() < 0.5 ? null : batch + Math.floor(rnd() * 4)
    const r = call(ivs, fmt(T), items, batch, prep, kc, 0)
    const sumFree = r.windows.reduce((s, w) => s + w.free, 0)
    const rule3 = sumFree >= items && r.reason !== 'preopen' && r.reason !== 'now'
    n++; if (rule3 !== r.fits) mismatch++; if (r.fits) fits++
    if (r.fits) { const sumShare = r.windows.reduce((s, w) => s + w.share, 0); if (sumShare !== items || r.windows.some(w => w.share > w.free)) mismatch++ }
  }
  check(mismatch === 0, `${n} random calls (${fits} fit): fits ⇔ Σfree ≥ items, every share ≤ free, shares sum to items — ${mismatch} mismatches`)
}
console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ reserveBatches implements the rule'}`)
process.exit(fails ? 1 : 0)
