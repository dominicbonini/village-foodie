#!/usr/bin/env node
// scripts/collection-times-hint.cjs — the Collection times box says when a grid puts times between batches.
//   node scripts/collection-times-hint.cjs
// 🔴 FAILURE MODE: the hint missing when the effective interval is NOT a whole multiple of a cooking
// category's prep (the operator then meets "Full" dots with no explanation), or SHOWN when every cooking
// category lines up (Gusto: prep 5, every 5 — a line that would be false).
const fs = require('fs'); const path = require('path')
const { compile, REPO } = require('./_slot-interval-compile.cjs')
let fails = 0; const check = (ok, l) => { console.log(`  ${ok ? '✓' : '🔴'} ${l}`); if (!ok) fails++ }
const c = compile(REPO, ['lib/slot-interval.ts'], 'hint'); const I = c.req('lib/slot-interval.js')
const PIZZA = [{ name: 'Pizza', prep_secs: 900 }], GUSTO = [{ name: 'Pizza', prep_secs: 300 }, { name: 'Drinks', prep_secs: 0 }, { name: 'Desserts', prep_secs: 0 }]
const hint = (iv, cats) => { const m = I.misalignedCookingCategory(iv, cats); return m ? I.collectionTimesHint(m) : null }
console.log('── BROKEN VARIANT: MUST report FAILURE ──────────────────────────────────────────────────')
{ // V1: the hint shown when aligned — a rule that fires on "prep differs from the interval" instead of "does not divide it".
  const v1 = (iv, cats) => { const cs = cats.filter(x => x.prep_secs > 0 && Math.round(x.prep_secs / 60) !== iv); return cs.length ? cs[0] : null }
  const bad = v1(30, PIZZA) !== null
  console.log(`  ${bad ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 "prep ≠ interval" rule: prep 15 at every 30 → ${bad ? 'shows a hint (wrong: 30 is two batches)' : 'hidden'}`); if (!bad) process.exit(1) }
console.log('\n── THE RULE ────────────────────────────────────────────────────────────────────────────')
for (const iv of [5, 10, 20]) check(hint(iv, PIZZA) === 'Pizza takes 15 minutes to cook, so some times between batches will show as full.', `prep 15 at every ${iv}: "${hint(iv, PIZZA)}"`)
for (const iv of [15, 30]) check(hint(iv, PIZZA) === null, `prep 15 at every ${iv}: hidden`)
check(hint(5, GUSTO) === null, "Gusto's shape (prep 5, every 5; instant categories): hidden")
check(hint(5, []) === null && hint(5, [{ name: 'Drinks', prep_secs: 0 }]) === null, 'no cooking categories: hidden')
check(hint(10, [{ name: 'Burgers', prep_secs: 600 }, { name: 'Pizza', prep_secs: 900 }, { name: 'Roast', prep_secs: 1500 }]) === 'Roast takes 25 minutes to cook, so some times between batches will show as full.', 'the LONGEST misaligned category is named (Burgers lines up at 10; Pizza 15 and Roast 25 do not → Roast)')
console.log('\n── THE PAGES: one conditional line, the effective interval, identical on both ─────────────')
const manage = fs.readFileSync(path.join(REPO, 'app/manage/[token]/page.tsx'), 'utf8'), dash = fs.readFileSync(path.join(REPO, 'app/dashboard/[token]/page.tsx'), 'utf8')
const LINE = /\{\(\(\) => \{ const mc = misalignedCookingCategory\(overrideOn \? operator : customer, ([^)]*)\); return mc \? <p className="text-xs text-amber-700 mt-1">\{collectionTimesHint\(mc\)\}<\/p> : null \}\)\(\)\}/
for (const [name, src, cats] of [['Manage', manage, 'categories'], ['dashboard', dash, 'truckMenu?.categories ?? []']]) {
  const m = src.match(new RegExp(LINE.source, 'g')) || []
  check(m.length === 1, `${name}: exactly one hint line (${m.length})`)
  check(new RegExp(LINE.source).exec(src)?.[1] === cats, `${name}: it reads the categories the page already holds (${cats}) — no new read`)
  check(/misalignedCookingCategory\(overrideOn \? operator : customer/.test(src), `${name}: it follows the ticked "your" interval, else the customers'`)
  check(/import \{[^}]*misalignedCookingCategory, collectionTimesHint[^}]*\} from '@\/lib\/slot-interval'/.test(src), `${name}: both come from lib/slot-interval (the shared rule)`)
}
const strip = s => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
const mLine = strip(manage).match(LINE)[0].replace('categories', 'CATS'), dLine = strip(dash).match(LINE)[0].replace('truckMenu?.categories ?? []', 'CATS')
check(mLine === dLine, 'the line is identical on Manage and the dashboard (only the categories expression differs)')
check(!/takes \$\{|minutes to cook/.test(manage + dash), 'neither page spells the sentence itself — it comes from collectionTimesHint')
console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ the hint appears exactly when a cooking prep does not divide the interval'}`)
process.exit(fails ? 1 : 0)
