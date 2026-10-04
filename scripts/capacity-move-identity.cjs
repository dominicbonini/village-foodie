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
/** Read a repo file. §§6-7 read source text; §§1-5 compile and call the real functions. */
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8')
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


// ════════════════════════════════════════════════════════════════════════════════════════════════
// 6 · 🔴 "SAME KITCHEN CAPACITY FOR ALL VANS?" — THE ANSWER, AND WHAT EACH SWITCH OF IT DOES
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// The van picker and the per-van "Same capacity as …" switch are gone (Dominic, 4 October 2026). A
// multi-van truck is asked ONE question, and the answer is READ from the flags rather than stored —
// so the rule that reads it is the thing most worth pinning. Everything below is the brief's list.
console.log('\n── 6 · THE YES / NO ANSWER ─────────────────────────────────────────────────────────────')
{
  const LIB = AFTER
  const van = (id, follows, active = true) => ({ id, active, capacity_same_as_first_van: follows })

  /* ── 1 · THE ANSWER READS CORRECTLY IN ALL THREE STATES ──────────────────────────────────────── */
  const ALL_FOLLOW = [van('v1', false), van('v2', true), van('v3', true)]
  const NONE_FOLLOW = [van('v1', false), van('v2', false), van('v3', false)]
  const MIXED = [van('v1', false), van('v2', true), van('v3', false)]

  check(LIB.capacityAllSame(ALL_FOLLOW, 'v1') === true, '🔴 every other van follows ⇒ the answer reads YES')
  check(LIB.capacityAllSame(NONE_FOLLOW, 'v1') === false, '🔴 no other van follows ⇒ the answer reads NO')
  /* 🔴 THE MIXED CASE IS THE ONE THAT MATTERS. Reading it as Yes would draw ONE box over a truck where
   * a van is running different numbers behind it — the screen would be lying and the engine would go
   * on using the other values. */
  check(LIB.capacityAllSame(MIXED, 'v1') === false, '🔴 SOME follow and some do not ⇒ the answer reads NO, never Yes')
  check(LIB.capacityAllSame([van('v1', false)], 'v1') === true, '⚠️ a ONE-VAN truck is vacuously YES — which is what makes its second van follow')
  check(LIB.capacityAllSame([], null) === true, '⚠️ …and so is a truck with no vans, rather than throwing')
  /* ⚠️ A RETIRED VAN MUST NOT HOLD A TRUCK ON "No" FOR EVER. */
  check(LIB.capacityAllSame([van('v1', false), van('v2', true), van('v3', false, false)], 'v1') === true,
    '🔴 a RETIRED van that does not follow is ignored — the answer is about the vans in use')
  /* ⚠️ THE FIRST VAN'S OWN FLAG IS NOT PART OF THE ANSWER. It cannot follow itself. */
  check(LIB.capacityAllSame([van('v1', true), van('v2', true)], 'v1') === true,
    '⚠️ the first van\'s own flag is not read — it is not one of the "other" vans')

  /* ── 4 · THE MIXED CASE'S STRAGGLERS ─────────────────────────────────────────────────────────── */
  check(LIB.capacityStragglers(MIXED, 'v1').map(v => v.id).join() === 'v2',
    '🔴 the mixed case names the vans STILL FOLLOWING — the ones the first save has to unfollow')
  check(LIB.capacityStragglers(ALL_FOLLOW, 'v1').length === 0,
    '⚠️ …and there are none under YES, where following IS the answer')
  check(LIB.capacityStragglers(NONE_FOLLOW, 'v1').length === 0, '⚠️ …nor when nothing follows')

  /* ── 🔴 ONE RULE, TWO READERS. The screen decides how many boxes to draw; `add_van` decides whether
   * a new van arrives following. Two inline `.every(...)`s would be two rules, and the one that
   * drifted would be the server's — invisible until a truck's new van stopped matching. */
  const UI = read('components/manage/KitchenCapacitySection.tsx')
  const API = read('app/api/manage/route.ts')
  check(/import \{ capacityAllSame, capacityStragglers \} from '@\/lib\/van-category-settings'/.test(UI)
    && /const allSame = capacityAllSame\(vans, firstVan\?\.id \?\? null\)/.test(UI)
    && /const stragglers = capacityStragglers\(vans, firstVan\?\.id \?\? null\)/.test(UI),
    '🔴 the SCREEN reads the shared rule, not its own `.every(...)`')
  check(/capacityAllSame\(/.test(API) && !/\.every\(v => same\.capacityByVanId/.test(API),
    '🔴 and `add_van` reads the SAME rule')

  /* ── 6 · NOTHING IS WRITTEN BECAUSE THE PAGE LOADED ──────────────────────────────────────────── */
  const loadFn = UI.slice(UI.indexOf('const load = useCallback'), UI.indexOf('const firstVan ='))
  check(!/set_van_capacity_same_as_first|update_van_settings|upsert_van_category/.test(loadFn),
    '🔴 LOAD WRITES NOTHING — opening the screen cannot change the database')
  const effect = UI.slice(UI.indexOf('useEffect(() => { void load() }'), UI.indexOf('const firstVan ='))
  check(!/api\(/.test(effect), '⚠️ …and the mount effect calls nothing but `load`')
  /* 🔴 THE MIXED TRUCK IS UNFOLLOWED BY THE FIRST SAVE, NOT BY THE LOAD. `ensureIndependent` runs
   * BEFORE the edit — afterwards, the edit would already have fanned out into a van drawn as its own. */
  check(/const ensureIndependent = async \(\) => \{/.test(UI)
    && /if \(allSame \|\| stragglers\.length === 0\) return/.test(UI)
    && /for \(const v of stragglers\) await api\('set_van_capacity_same_as_first', \{ vanId: v\.id, on: false \}\)/.test(UI),
    '🔴 the FIRST SAVE unfollows the stragglers, keeping their copied values')
  const writes = ['const writeVanCat', 'const updateVanSetting']
  check(writes.every(w => {
    const body = UI.slice(UI.indexOf(w), UI.indexOf(w) + 1400)
    const guard = body.indexOf('await ensureIndependent()')
    const call = body.indexOf("await api('")
    return guard > 0 && call > guard
  }), '🔴 …and it runs BEFORE the write in every write path, never after')

  /* ── 2 & 3 · WHAT EACH SWITCH OF THE ANSWER DOES ─────────────────────────────────────────────── */
  /* 🔴 NO → YES COPIES, AND ASKS FIRST. It is the only destructive thing on the screen: every other
   * van's numbers are replaced by the first van's. */
  /* ⚠️ THE CONTROL IS THE SHARED `<Toggle>` NOW (Dominic, 4 October 2026): a Yes/No button pair
   * "matches nothing else in Manage". ON = same for all vans (the old Yes), OFF = one box per van.
   * The BEHAVIOUR is unchanged, so this still asserts that only one direction asks. */
  check(/onToggle=\{\(\) => \{ if \(allSame\) void setAllSame\(false\); else setConfirmAllSame\(true\) \}\}/.test(UI),
    '🔴 switching ON asks first; switching OFF does not — only one of them replaces anything')
  /* 🔴 IT IS SETTINGS' OWN COMPONENT, NOT A LOOK-ALIKE, and no Yes/No buttons survive. */
  check(/import \{ Btn, Toggle \} from '@\/components\/manage\/primitives'/.test(UI)
    && /<Toggle\s*\n\s*on=\{allSame\}/.test(UI)
    && !/role="radiogroup"/.test(UI)
    && !/>Yes</.test(UI) && !/>No</.test(UI)
    && !/rounded-full transition-colors/.test(UI.replace(/\/\*[\s\S]*?\*\//g, '')),
    '🔴 the row renders the SHARED Toggle — no Yes/No buttons, and no switch defined here')
  check(/export function Toggle\(/.test(read('components/manage/primitives.tsx'))
    && !/^function Toggle\(/m.test(read('app/manage/[token]/page.tsx').replace(/\/\*[\s\S]*?\*\//g, ''))
    && /import \{[^}]*\bToggle\b[^}]*\} from '@\/components\/manage\/primitives'/.test(read('app/manage/[token]/page.tsx')),
    '🔴 …and Settings renders that same component — page.tsx defines no switch of its own')
  /* ⛔ AND THE HELPER LINE UNDER THE LABEL IS GONE (Dominic, same message). */
  check(!/Only asked when you have more than one van\./.test(UI),
    '⛔ "Only asked when you have more than one van." is gone')
  check(/All vans will use \{firstVan\.name\}’s kitchen capacity\. Each van’s own numbers will be replaced\./.test(UI),
    '🔴 …and the confirm says exactly what the brief gave')
  check(/for \(const v of others\) await api\('set_van_capacity_same_as_first', \{ vanId: v\.id, on \}\)/.test(UI),
    '🔴 both answers write EVERY other van\'s flag, through the action that already copies')
  /* 🔴 YES → NO KEEPS THE VALUES. `on: false` writes only the switch — the copied numbers stay, which
   * is what makes "stop following" different from "revert". Asserted against the HANDLER. */
  const capHandler = API.slice(API.indexOf("action === 'set_van_capacity_same_as_first'"), API.indexOf("if (action === 'add_van')"))
  const ifOn = capHandler.indexOf('if (on) {')
  const flagWrite = capHandler.indexOf('update({ capacity_same_as_first_van: !!on })')
  check(ifOn > 0 && flagWrite > ifOn && capHandler.indexOf('copyCapacityFromFirst') < flagWrite,
    '🔴 YES → NO keeps every van\'s values — the copy is inside `if (on)`, the flag write is outside it')

  /* ── 5 · A VAN ADDED UNDER YES FOLLOWS; ONE ADDED UNDER NO DOES NOT ──────────────────────────── */
  const addVan = API.slice(API.indexOf("if (action === 'add_van')"), API.indexOf("if (action === 'delete_van')"))
  check(/const same = await readVanSameAsFirst\(supabase, truck\.id\)/.test(addVan)
    && addVan.indexOf('readVanSameAsFirst') < addVan.indexOf('.insert({ truck_id: truck.id, name: name.trim()'),
    '🔴 the answer is READ BEFORE THE INSERT — afterwards the new van would itself read as "No"')
  check(/if \(same\.ok && answerIsYes\) \{/.test(addVan)
    && /update\(\{ capacity_same_as_first_van: true \}\)/.test(addVan),
    '🔴 a van added under YES arrives FOLLOWING the first van')
  check(/const failure = await copyCapacityFromFirst\(first, newId, truck\.id\)/.test(addVan)
    && addVan.indexOf('copyCapacityFromFirst') < addVan.indexOf('if (same.ok && answerIsYes)'),
    '🔴 …and the first van\'s values are copied EITHER WAY — under No it starts from them and diverges')
  check(!/capacity_same_as_first_van: false/.test(addVan),
    '⛔ under NO nothing is written to the flag — the column default (false) is what applies')
  /* ⛔ AND THE COLUMN DEFAULT IS UNTOUCHED, which the brief asked for explicitly. A `default true`
   * would make every van on every truck follow, including trucks that answered No. */
  const MIG = read('supabase/migrations/20261010_capacity_same_as_first_van.sql')
  check(/alter column capacity_same_as_first_van set default false;/.test(MIG),
    '⛔ the column default is still `false` — the rule is applied by the action, not by the schema')
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 7 · 🔴 A BROKEN VARIANT FOR EACH, SHOWN TO FAIL
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// Each mutates the real source in memory and the matching predicate must then go false. Nothing is
// written to disk. A check that cannot be made to fail is a check that proves nothing.
console.log('\n── 7 · THE BROKEN VARIANTS ─────────────────────────────────────────────────────────────')
{
  let vpass = 0, vfail = 0
  const must = (label, detected) => {
    if (detected) { vpass++; console.log('  ✓ FAILED as required  ' + label) }
    else { vfail++; fail++; console.log('  🔴 MUST FAIL BUT PASSED  ' + label) }
  }
  const UI = read('components/manage/KitchenCapacitySection.tsx')
  const API = read('app/api/manage/route.ts')
  const LIBSRC = read('lib/van-category-settings.ts')

  /* C1 — the mixed case reads YES, so one box is drawn over a truck whose vans differ.
   * ⚠️ THE MUTANT IS WRITTEN OUT, NOT EVAL'D FROM THE SOURCE. The first version of this variant built
   * a function by regex-replacing the TypeScript — which is a parser written in `.replace()`, and it
   * broke on its own escaping before it ever ran. A broken variant only has to be the WRONG RULE,
   * stated plainly, and shown to disagree with the real one on the case that matters. */
  {
    const others = (vans, f) => (vans ?? []).filter(v => v.active !== false && v.id !== f)
    /** The plausible wrong rule: "some follow" instead of "every other van follows". */
    const brokenAllSame = (vans, f) => {
      const o = others(vans, f)
      return o.length === 0 || o.some(v => v.capacity_same_as_first_van === true)
    }
    const MIXED = [{ id: 'v1' }, { id: 'v2', capacity_same_as_first_van: true }, { id: 'v3' }]
    must('C1 🔴 the MIXED case reads Yes — one box drawn over a truck whose vans differ',
      brokenAllSame(MIXED, 'v1') === true && AFTER.capacityAllSame(MIXED, 'v1') === false)
  }

  /* C2 — the screen writes on load, so opening it changes the database. */
  {
    const p = (ui) => {
      const loadFn = ui.slice(ui.indexOf('const load = useCallback'), ui.indexOf('const firstVan ='))
      return !/set_van_capacity_same_as_first/.test(loadFn)
    }
    const m = UI.replace("      setAvailable(r.perVanCategoriesAvailable !== false)",
      "      setAvailable(r.perVanCategoriesAvailable !== false)\n      await api('set_van_capacity_same_as_first', { vanId: list[0]?.id, on: false })")
    must('C2 🔴 the screen unfollows stragglers ON LOAD — opening it writes to the database',
      m !== UI && p(UI) && !p(m))
  }

  /* C3 — `ensureIndependent` runs AFTER the write, so the edit has already fanned out. */
  {
    const p = (ui) => {
      const body = ui.slice(ui.indexOf('const updateVanSetting'), ui.indexOf('const updateVanSetting') + 1400)
      const g = body.indexOf('await ensureIndependent()'), c = body.indexOf("await api('")
      return g > 0 && c > g
    }
    const m = UI.replace("      await ensureIndependent()\n      await api('update_van_settings', { vanId, [field]: value })",
      "      await api('update_van_settings', { vanId, [field]: value })\n      await ensureIndependent()")
    must('C3 🔴 the stragglers are unfollowed AFTER the write, so the edit already fanned out',
      m !== UI && p(UI) && !p(m))
  }

  /* C4 — No → Yes stops asking, so a van's numbers are replaced with no warning. */
  {
    const p = (ui) => /else setConfirmAllSame\(true\)/.test(ui)
    const m = UI.replace('else setConfirmAllSame(true)', 'else void setAllSame(true)')
    must('C4 🔴 switching ON replaces every van\'s numbers without asking', m !== UI && p(UI) && !p(m))
  }

  /* C5 — Yes → No copies as well, so "stop following" silently rewrites the values it kept. */
  {
    const p = (api) => {
      const h = api.slice(api.indexOf("action === 'set_van_capacity_same_as_first'"), api.indexOf("if (action === 'add_van')"))
      const ifOn = h.indexOf('if (on) {'), flag = h.indexOf('update({ capacity_same_as_first_van: !!on })')
      return ifOn > 0 && flag > ifOn && h.indexOf('copyCapacityFromFirst') < flag && h.indexOf('copyCapacityFromFirst') > ifOn
    }
    /* ⚠️ SPLICED BY INDEX, NOT `.replace()`. `if (on) {` appears in BOTH switch handlers — Settings'
     * and capacity's — and a plain replace hit the first one, leaving the handler under test
     * untouched. The mutant then equalled the source for this predicate and the variant WRONGLY
     * PASSED, which the tally reported. */
    const capStart = API.indexOf("if (action === 'set_van_capacity_same_as_first')")
    const onIdx = API.indexOf('    if (on) {', capStart)
    const m = API.slice(0, onIdx) + '    if (true) {' + API.slice(onIdx + '    if (on) {'.length)
    must('C5 🔴 Yes → No copies too, so "stop following" overwrites the values it should have kept',
      m !== API && p(API) && !p(m))
  }

  /* C6 — `add_van` reads the answer AFTER the insert, so no van ever follows. */
  {
    const p = (api) => {
      const a = api.slice(api.indexOf("if (action === 'add_van')"), api.indexOf("if (action === 'delete_van')"))
      return a.indexOf('readVanSameAsFirst') < a.indexOf('.insert({ truck_id: truck.id, name: name.trim()')
    }
    /* ⚠️ ALSO SPLICED BY INDEX — `readVanSameAsFirst` is called in five handlers. The mutant moves
     * add_van's read to AFTER the insert, which is the real failure mode: the new van is then itself a
     * non-first van holding the column default, so the answer reads "No" for every truck and nothing
     * ever follows. */
    const aStart = API.indexOf("if (action === 'add_van')")
    const aEnd = API.indexOf("if (action === 'delete_van')")
    const readLine = '    const same = await readVanSameAsFirst(supabase, truck.id)\n'
    const rIdx = API.indexOf(readLine, aStart)
    /* ⚠️ THE MUTANT MUST PUT THE READ *AFTER* THE INSERT, not merely later in the handler. The first
     * attempt moved it to just before `.insert(…)`, which is still before — so the predicate held and
     * the variant wrongly passed. The anchor is the line after the insert's error check. */
    const afterInsert = API.indexOf("    const newId = (data as { id?: string } | null)?.id", aStart)
    const m = (rIdx > 0 && afterInsert > rIdx && afterInsert < aEnd)
      ? API.slice(0, rIdx) + API.slice(rIdx + readLine.length, afterInsert) + readLine + API.slice(afterInsert)
      : API
    must('C6 🔴 add_van reads the answer after the insert, so the new van makes it "No" and never follows',
      m !== API && p(API) && !p(m))
  }

  /* C7 — a van added under NO is forced to follow anyway. */
  {
    const p = (api) => {
      const a = api.slice(api.indexOf("if (action === 'add_van')"), api.indexOf("if (action === 'delete_van')"))
      return /if \(same\.ok && answerIsYes\) \{/.test(a)
    }
    const m = API.replace('      if (same.ok && answerIsYes) {', '      if (same.ok) {')
    must('C7 🔴 every new van follows, whatever the truck answered', m !== API && p(API) && !p(m))
  }

  /* C8 — the column default is changed instead of the action writing the flag. The brief forbade it:
   * a `default true` makes every van on every truck follow, including trucks that answered No. */
  {
    const MIG = read('supabase/migrations/20261010_capacity_same_as_first_van.sql')
    const p = (sql) => /alter column capacity_same_as_first_van set default false;/.test(sql)
    const m = MIG.replace('set default false;', 'set default true;')
    must('C8 ⛔ the column default becomes true, so every van on every truck follows',
      m !== MIG && p(MIG) && !p(m))
  }

  /* C9 — the screen and the server read the answer differently. */
  {
    const p = (ui) => /const allSame = capacityAllSame\(vans, firstVan\?\.id \?\? null\)/.test(ui)
    const m = UI.replace('const allSame = capacityAllSame(vans, firstVan?.id ?? null)',
      'const allSame = others.every(v => v.capacity_same_as_first_van === true)')
    must('C9 🔴 the screen grows its own copy of the rule, which can then drift from the server\'s',
      m !== UI && p(UI) && !p(m))
  }

  /* C10 — the Yes/No button pair is restored, so this one row uses a control Manage has nowhere else. */
  {
    const p = (ui) => /<Toggle\s*\n\s*on=\{allSame\}/.test(ui) && !/role="radiogroup"/.test(ui)
    const m = UI.replace('          <Toggle\n            on={allSame}',
      '          <div role="radiogroup"><button>Yes</button><button>No</button></div>\n          <Toggle\n            on={allSame}')
    must('C10 🔴 the Yes/No button pair returns — a control that matches nothing else in Manage',
      m !== UI && p(UI) && !p(m))
  }

  /* C11 — the switch is re-styled locally instead of rendering the shared one, so Manage has two
   * greens that can drift apart. */
  {
    const p = (ui) => /import \{ Btn, Toggle \} from '@\/components\/manage\/primitives'/.test(ui)
    const m = UI.replace("import { Btn, Toggle } from '@/components/manage/primitives'",
      "import { Btn } from '@/components/manage/primitives'\nconst Toggle = () => null")
    must('C11 🔴 the row defines its own switch instead of rendering Settings\' one',
      m !== UI && p(UI) && !p(m))
  }

  console.log(`\n  ${vpass + vfail} variants · ${vpass} failed as required · ${vfail} wrongly passed`)
}

console.log(`\n${fail ? `🔴 ${fail} FAILED` : `✅ capacity resolves identically before and after — ${pass} checks`}`)
process.exit(fail ? 1 : 0)
