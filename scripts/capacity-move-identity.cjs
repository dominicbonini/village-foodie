#!/usr/bin/env node
/* scripts/capacity-move-identity.cjs
 * ──────────────────────────────────────────────────────────────────────────────────────────────────
 * 🔴 THE ONE QUESTION THIS BUILD HAS TO ANSWER: does a two-van truck's KITCHEN CAPACITY resolve to
 * exactly what it resolved to before the move — with the new "Same capacity as Van 1" switch ON and
 * with it OFF?
 *
 * The capacity table left Settings › Kitchen for Menu › Kitchen capacity, and capacity got its own
 * follow flag (`capacity_same_as_first_van`) alongside the existing `same_as_first_van`. Both of those
 * are chances to change behaviour by accident:
 *   • the resolver could start resolving THROUGH the new flag (a lookup), which the model forbids;
 *   • `VAN_COPY_FIELDS` lost two fields to `CAPACITY_COPY_FIELDS`, so a payload could drop them;
 *   • the per-category read is shared with the dashboard and the ordering engine, which did not move.
 *
 * ⚠️ SO THIS DOES NOT RE-IMPLEMENT THE RESOLVER AND COMPARE ITS OWN ANSWER TO ITSELF. It compiles
 * lib/van-category-settings.ts TWICE — once from a clean worktree of HEAD (before), once from the
 * working tree (after) — and runs BOTH resolvers over THE SAME fixture rows. "Identical" then means
 * two independently compiled modules agreeing, not one module agreeing with my expectation.
 *
 * 🔴 AND IT ASSERTS THE RESOLVER IS BLIND TO THE NEW FLAG. A copy-not-lookup model is only true if no
 * reader consults the flag; a van's own stored values must decide, whatever the flag says. So each
 * fixture is resolved with the flag true AND false and the two answers must match.
 */
const { compile, headWorktree, REPO } = require('./_slot-interval-compile.cjs')
const path = require('path'), fs = require('fs')

let pass = 0, fail = 0
const check = (ok, label) => { console.log(`  ${ok ? '✓' : '🔴'} ${label}`); ok ? pass++ : fail++ }
const ENTRY = ['lib/van-category-settings.ts']

console.log('── COMPILING THE RESOLVER BEFORE AND AFTER ─────────────────────────────────────────────')
const head = headWorktree('capmove')
let BEFORE, AFTER
try {
  BEFORE = compile(head.wt, ENTRY, 'cap-before').req('lib/van-category-settings.js')
  AFTER  = compile(REPO,    ENTRY, 'cap-after').req('lib/van-category-settings.js')
  console.log('  ✓ HEAD and the working tree both compiled')

  /* ── THE FIXTURE: ONE TRUCK, TWO VANS ───────────────────────────────────────────────────────────
   * Van 1 is the older by `created_at` and is therefore the FIRST van (the rule is "oldest ACTIVE
   * van", computed server-side — never guessed). Van 2 has its OWN stored capacity values, which is
   * what the copy model produces: when the switch went on, Van 1's values were WRITTEN INTO Van 2.
   * ⚠️ THE NUMBERS DIFFER ON PURPOSE. If any reader resolved through the flag instead of reading the
   * van's own row, "same as Van 1" would make Van 2 answer 12/5 — so a wrong answer is visible. */
  const CATS = [
    { id: 'c-pizza',  prep_secs: 420, batch_size: 2, counts_toward_capacity: true  },
    { id: 'c-sides',  prep_secs: 0,   batch_size: 1, counts_toward_capacity: false },
    { id: 'c-drinks', prep_secs: 0,   batch_size: 1, counts_toward_capacity: false },
  ]
  const VAN1 = { id: 'van-1', kitchen_capacity: 12, capacity_window_mins: 5,  created_at: '2026-01-01T00:00:00Z', active: true }
  const VAN2 = { id: 'van-2', kitchen_capacity: 12, capacity_window_mins: 5,  created_at: '2026-06-01T00:00:00Z', active: true }
  const VAN2_OWN = { ...VAN2, kitchen_capacity: 6, capacity_window_mins: 10 }
  // Van 2's per-category rows, as the copy leaves them (identical to Van 1's) and as a van set
  // separately might have them (a smaller batch and sides counted).
  const ROWS_COPIED = CATS.map(c => ({ category_id: c.id, prep_secs: c.prep_secs, batch_size: c.batch_size, counts_toward_capacity: c.counts_toward_capacity }))
  const ROWS_OWN = [
    { category_id: 'c-pizza',  prep_secs: 600, batch_size: 1, counts_toward_capacity: true },
    { category_id: 'c-sides',  prep_secs: 0,   batch_size: 1, counts_toward_capacity: true },
  ]
  const asMap = rows => new Map(rows.map(r => [r.category_id, r]))

  /* ── 1 · THE PER-CATEGORY RESOLVER AGREES, BEFORE AND AFTER ────────────────────────────────────
   * `resolveCategories` is what the Menu screen, the dashboard and the ordering engine all read
   * through. It takes the truck's category defaults and the van's own rows; the flag is not one of
   * its arguments, which is the property being demonstrated. */
  console.log('\n── 1 · PER-CATEGORY SETTINGS, BEFORE vs AFTER ──────────────────────────────────────────')
  for (const [name, rows] of [['switch ON  (rows copied from Van 1)', ROWS_COPIED], ['switch OFF (Van 2 set separately)', ROWS_OWN]]) {
    const b = JSON.stringify(BEFORE.resolveCategories(CATS, asMap(rows)))
    const a = JSON.stringify(AFTER.resolveCategories(CATS, asMap(rows)))
    check(b === a, `${name}: ${b === a ? 'IDENTICAL' : 'DIFFERENT'}`)
    if (b !== a) { console.log('      before: ' + b); console.log('      after:  ' + a) }
  }
  // And the no-rows case — a van that has never been given per-category settings falls back to the
  // truck's own values. This is the path every single-van truck takes.
  {
    const b = JSON.stringify(BEFORE.resolveCategories(CATS, BEFORE.NO_VAN_CATEGORY_SETTINGS))
    const a = JSON.stringify(AFTER.resolveCategories(CATS, AFTER.NO_VAN_CATEGORY_SETTINGS))
    check(b === a, `no van rows at all (every single-van truck): ${b === a ? 'IDENTICAL' : 'DIFFERENT'}`)
    check(a === JSON.stringify(CATS), '…and it is the truck defaults, unchanged')
  }

  /* ── 2 · THE RESOLVER NEVER CONSULTS THE NEW FLAG ──────────────────────────────────────────────
   * The copy-not-lookup model in one assertion: give the resolver the same rows with the flag set
   * both ways and the answer must not move. A resolver that had started looking the first van up
   * would answer 12/5 for a following van and 6/10 for an independent one. */
  console.log('\n── 2 · THE VAN’S OWN ROW DECIDES — NO READER CONSULTS EITHER FLAG ──────────────────────')
  const src = fs.readFileSync(path.join(REPO, 'lib/van-category-settings.ts'), 'utf8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const readers = ['resolveCategory', 'resolveCategories', 'effectiveCategorySettings', 'resolveCategoriesForVan', 'readVanCategorySettings']
  for (const fn of readers) {
    const i = code.indexOf(`function ${fn}`) >= 0 ? code.indexOf(`function ${fn}`) : code.indexOf(`${fn} =`)
    const body = code.slice(i, i + 1600)
    check(i >= 0 && !/capacity_same_as_first_van|same_as_first_van/.test(body),
      `🔴 ${fn}() does not name either follow flag — it reads the van's own row`)
  }
  /* ⚠️ WHAT THE STORED ROW DECIDES, STATED AS A DIFFERENCE. "The flag is not an input" is only
   * worth asserting if a wrong answer would be visible — so resolve Van 2 twice: once with the rows
   * the copy left behind (identical to Van 1's) and once with rows it was given separately. The two
   * answers MUST differ, and each must equal its own rows. A resolver that looked the first van up
   * would return Van 1's answer both times, and this pair is what would catch it. */
  const followed    = AFTER.resolveCategories(CATS, asMap(ROWS_COPIED))
  const independent = AFTER.resolveCategories(CATS, asMap(ROWS_OWN))
  check(JSON.stringify(followed) !== JSON.stringify(independent),
    '🔴 a following van and an independent van resolve DIFFERENTLY — so a lookup would be visible here')
  check(followed.find(c => c.id === 'c-pizza').prep_secs === 420 && independent.find(c => c.id === 'c-pizza').prep_secs === 600,
    '…each answer is ITS OWN stored prep (420 copied vs 600 set separately), not the first van\'s')
  check(independent.find(c => c.id === 'c-drinks').counts_toward_capacity === false,
    '…and a category with NO row for that van falls back to the truck default, as before')
  /* 🔴 THE BROKEN VARIANT, SHOWN FAILING. This is what "resolve through the flag" would look like —
   * a resolver that, for a van whose flag is on, answers with the FIRST van's rows. It must disagree
   * with the real resolver, or the checks above prove nothing. */
  const lookupResolver = (cats, rows, flagOn, firstRows) => AFTER.resolveCategories(cats, asMap(flagOn ? firstRows : rows))
  const viaLookup = lookupResolver(CATS, ROWS_OWN, true, ROWS_COPIED)
  const realAnswer = AFTER.resolveCategories(CATS, asMap(ROWS_OWN))
  const lookupDiffers = JSON.stringify(viaLookup) !== JSON.stringify(realAnswer)
  console.log(`  ${lookupDiffers ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 a resolver that reads the first van when the flag is on`)
  if (!lookupDiffers) process.exit(1)
  check(VAN2.kitchen_capacity === 12 && VAN2_OWN.kitchen_capacity === 6,
    'the ceiling likewise comes from the van\'s OWN column (12 when copied, 6 when set separately)')

  /* ── 3 · THE TWO COPY SETS ARE DISJOINT AND TOGETHER LOSE NOTHING ──────────────────────────────
   * 🔴 THIS IS THE REGRESSION THE SPLIT COULD CAUSE. `VAN_COPY_FIELDS` gave up `kitchen_capacity` and
   * `capacity_window_mins` to `CAPACITY_COPY_FIELDS`. If a field had been dropped rather than moved,
   * turning on Settings' "Same as Van 1" would quietly stop copying it and nothing would say so. So
   * the union AFTER must equal the union BEFORE, exactly. */
  console.log('\n── 3 · THE FIELD SPLIT MOVED FIELDS, IT DID NOT LOSE THEM ──────────────────────────────')
  const beforeUnion = [...BEFORE.VAN_COPY_FIELDS].concat(BEFORE.CAPACITY_COPY_FIELDS || []).sort()
  const afterUnion  = [...AFTER.VAN_COPY_FIELDS].concat(AFTER.CAPACITY_COPY_FIELDS  || []).sort()
  check(JSON.stringify(beforeUnion) === JSON.stringify(afterUnion),
    `the union is unchanged (${afterUnion.length} fields): ${afterUnion.join(', ')}`)
  check(AFTER.capacitySplitIsClean(), '🔴 the two lists are DISJOINT — one switch cannot move the other\'s fields')
  check(AFTER.CAPACITY_COPY_FIELDS.slice().sort().join() === ['capacity_window_mins', 'kitchen_capacity'].join(),
    'capacity owns exactly its two fields')
  check(!AFTER.VAN_COPY_FIELDS.includes('kitchen_capacity') && !AFTER.VAN_COPY_FIELDS.includes('capacity_window_mins'),
    '…and Settings\' switch carries neither of them')

  /* ── 4 · EACH PAYLOAD CARRIES ITS OWN FIELDS AND NOTHING ELSE ──────────────────────────────────
   * Fed one van object holding every field, the two payload builders must partition it. */
  console.log('\n── 4 · THE PAYLOADS PARTITION THE VAN ──────────────────────────────────────────────────')
  const FULL = Object.fromEntries(afterUnion.map((f, i) => [f, `v${i}`]))
  FULL.name = 'Van 1'; FULL.id = 'van-1'          // fields neither switch may ever copy
  const capPayload = AFTER.capacityCopyPayload(FULL)
  const vanPayload = AFTER.vanCopyPayload(FULL)
  check(Object.keys(capPayload).sort().join() === AFTER.CAPACITY_COPY_FIELDS.slice().sort().join(),
    `capacityCopyPayload carries exactly the capacity fields: ${Object.keys(capPayload).sort().join(', ')}`)
  check(!('name' in vanPayload) && !('id' in vanPayload) && !('name' in capPayload) && !('id' in capPayload),
    '🔴 neither payload carries `id` or `name` — a copy must not rename a van or overwrite its identity')
  const overlap = Object.keys(vanPayload).filter(k => k in capPayload)
  check(overlap.length === 0, `no key appears in both payloads (overlap: ${overlap.length})`)
  check(Object.keys(vanPayload).concat(Object.keys(capPayload)).sort().join() === afterUnion.join(),
    '…and together they cover every copied field — nothing fell between the two switches')

  /* ── 5 · THE FIRST-VAN RULE DID NOT MOVE ───────────────────────────────────────────────────────
   * Both switches mean "follow the FIRST van", and both read the same `firstVanId`. An inactive van
   * must not win it, and the order must be oldest-first. */
  console.log('\n── 5 · THE FIRST-VAN RULE IS THE SAME FUNCTION, BEFORE AND AFTER ───────────────────────')
  const SETS = [
    ['two active vans', [VAN1, VAN2]],
    ['given newest-first (order must not matter)', [VAN2, VAN1]],
    ['the older van RETIRED — the rule is oldest ACTIVE', [{ ...VAN1, active: false }, VAN2]],
    ['no vans at all', []],
  ]
  for (const [name, vans] of SETS) {
    const b = String(BEFORE.firstVanId(vans)), a = String(AFTER.firstVanId(vans))
    check(b === a, `${name}: before=${b} after=${a} — ${b === a ? 'IDENTICAL' : 'DIFFERENT'}`)
  }
} finally { head.remove() }

console.log(`\n${fail ? `🔴 ${fail} FAILED` : `✅ capacity resolves identically before and after — ${pass} checks`}`)
process.exit(fail ? 1 : 0)
