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
// ⚠️ RE-PINNED (Language Phase 1d): Manage's line now takes its sentence from the message
// manageSettings.collection.misaligned — `t('collection.misaligned', { name: mc.name, mins: mc.prepMins })` — instead
// of collectionTimesHint(mc); the dashboard still calls collectionTimesHint. Manage's LINE is the same line with that
// one expression swapped; that the two expressions render the SAME sentence is proven below.
const MSG_CALL = "{t('collection.misaligned', { name: mc.name, mins: mc.prepMins })}"
const LINE_MANAGE = new RegExp(LINE.source.replace('\\{collectionTimesHint\\(mc\\)\\}', "\\{t\\('collection\\.misaligned', \\{ name: mc\\.name, mins: mc\\.prepMins \\}\\)\\}"))
if (LINE_MANAGE.source === LINE.source) { console.log('🔴 harness error: Manage LINE re-pin did not apply'); process.exit(1) }
for (const [name, src, cats, line] of [['Manage', manage, 'categories', LINE_MANAGE], ['dashboard', dash, 'truckMenu?.categories ?? []', LINE]]) {
  const LINE = line
  const m = src.match(new RegExp(LINE.source, 'g')) || []
  check(m.length === 1, `${name}: exactly one hint line (${m.length})`)
  check(new RegExp(LINE.source).exec(src)?.[1] === cats, `${name}: it reads the categories the page already holds (${cats}) — no new read`)
  check(/misalignedCookingCategory\(overrideOn \? operator : customer/.test(src), `${name}: it follows the ticked "your" interval, else the customers'`)
  // ⚠️ RE-PINNED (Language Phase 1d): Manage imports only the RULE (misalignedCookingCategory) from lib/slot-interval —
  // its sentence is the message; the dashboard still imports both.
  check(name === 'Manage'
    ? /import \{[^}]*misalignedCookingCategory[^}]*\} from '@\/lib\/slot-interval'/.test(src) && /const t = useT\('manageSettings'\)/.test(src)
    : /import \{[^}]*misalignedCookingCategory, collectionTimesHint[^}]*\} from '@\/lib\/slot-interval'/.test(src),
    `${name}: ${name === 'Manage' ? 'the rule comes from lib/slot-interval, the sentence from manageSettings' : 'both come from lib/slot-interval (the shared rule)'}`)
}
const strip = s => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
// ⚠️ RE-PINNED (Language Phase 1d): Manage's line is matched with LINE_MANAGE and its sentence expression is normalised
// to the dashboard's before comparing; the sentence itself is then proven equal below, so "identical" still holds.
const mLine = strip(manage).match(LINE_MANAGE)[0].replace('categories', 'CATS').replace(MSG_CALL, '{collectionTimesHint(mc)}'), dLine = strip(dash).match(LINE)[0].replace('truckMenu?.categories ?? []', 'CATS')
check(mLine === dLine, 'the line is identical on Manage and the dashboard (only the categories expression — and where the sentence is read from — differ)')
{
  // ⚠️ RE-PINNED (Language Phase 1d): the sentence Manage shows is manageSettings.collection.misaligned (en-GB), rendered
  // here by next-intl exactly as useT does. It must equal collectionTimesHint for every prep the rule can name — prep 2
  // to 120 minutes (a prep of 1 divides every interval, so it is never named; the message's named GB fix — "1 minute",
  // language-phase-1d-gb-named.json — is therefore unreachable here and accepted).
  const GB = JSON.parse(fs.readFileSync(path.join(REPO, 'messages/en-GB.json'), 'utf8'))
  const { createTranslator } = require(require.resolve('next-intl', { paths: [REPO] }))
  const tS = createTranslator({ locale: 'en-GB', messages: GB, namespace: 'manageSettings' })
  const diffs = []
  for (let prepMins = 2; prepMins <= 120; prepMins++) for (const nm of ['Pizza', 'Roast & Veg']) {
    const a = tS('collection.misaligned', { name: nm, mins: prepMins }), b = I.collectionTimesHint({ name: nm, prepMins })
    if (a !== b) diffs.push(`${nm}/${prepMins}: "${a}" ≠ "${b}"`)
  }
  check(diffs.length === 0, `Manage's message renders the SAME sentence as collectionTimesHint for every reachable prep (238 cases)${diffs.length ? ' — ' + diffs.slice(0, 3).join('; ') : ''}`)
  check(I.misalignedCookingCategory(5, [{ name: 'X', prep_secs: 60 }]) === null && I.misalignedCookingCategory(7, [{ name: 'X', prep_secs: 30 }]) === null,
    'a 1-minute prep is never named (so the "1 minute" plural fix is never shown on this line)')
}
// ⚠️ RE-PINNED (Language Phase 1d): label only — Manage's sentence now comes from manageSettings.collection.misaligned.
check(!/takes \$\{|minutes to cook/.test(manage + dash), 'neither page spells the sentence itself — it comes from collectionTimesHint (dashboard) / manageSettings.collection.misaligned (Manage)')
console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ the hint appears exactly when a cooking prep does not divide the interval'}`)
process.exit(fails ? 1 : 0)
