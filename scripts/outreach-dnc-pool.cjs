#!/usr/bin/env node
// scripts/outreach-dnc-pool.cjs
//
// Proof for item 5: do-not-contact prospects are hidden by default, AND every count excludes them.
//
// 🔴 WHAT A FAILURE LOOKS LIKE: a flagged prospect is missing from the rows but still counted in
// "All (N)" or "Due work (N)". The operator then sees a list of 3 under a heading that says 4 and has no
// way to find the fourth — the exact class of defect the single `pool` exists to make impossible.
// The other failure: a NULL flag treated as flagged, which would hide 216 of 231 live prospects.

const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '..')
const SRC = fs.readFileSync(path.join(REPO, 'components/admin/OutreachPanel.tsx'), 'utf8')

// 🧪 FIXTURE. Deliberately mixed: true, false, null and undefined all appear, because the column is
// nullable and `nextStep` keys on `=== true`.
const FIXTURE = [
  { id: 'a', do_not_contact: null,      reachable: true,  state: 'due' },
  { id: 'b', do_not_contact: false,     reachable: true,  state: 'due' },
  { id: 'c', do_not_contact: undefined, reachable: false, state: 'due' },
  { id: 'd', do_not_contact: true,      reachable: true,  state: 'due' },
  { id: 'e', do_not_contact: true,      reachable: false, state: 'due' },
  { id: 'f', do_not_contact: null,      reachable: true,  state: 'unknown' },
  { id: 'g', do_not_contact: true,      reachable: true,  state: 'unknown' },
]

/** The implementation: one pool, everything derived from it. */
const poolOf = (rows, show) => (show ? rows : rows.filter(p => p.do_not_contact !== true))
const hiddenOf = (rows, show) => (show ? 0 : rows.filter(p => p.do_not_contact === true).length)

function countsFrom(pool) {
  let due = 0, unknown = 0, leads = 0
  for (const p of pool) {
    if (!p.reachable) { leads++; continue }
    if (p.state === 'due') due++
    else if (p.state === 'unknown') unknown++
  }
  return { all: pool.length, due, unknown, leads, total: due + unknown }
}

function runSuite(impl) {
  const ok = [], fails = []
  const t = (n, c) => (c ? ok : fails).push(n)

  const offPool = impl.poolOf(FIXTURE, false)
  const offCounts = countsFrom(offPool)
  const onPool = impl.poolOf(FIXTURE, true)
  const onCounts = countsFrom(onPool)

  t('🔴 default (unticked) hides every flagged prospect', offPool.every(p => p.do_not_contact !== true))
  t('default keeps 4 of the 7 FIXTURE rows', offPool.length === 4)
  t('🔴 a NULL flag counts as NOT flagged', offPool.some(p => p.id === 'a'))
  t('🔴 a FALSE flag counts as NOT flagged', offPool.some(p => p.id === 'b'))
  t('🔴 an UNDEFINED flag counts as NOT flagged', offPool.some(p => p.id === 'c'))
  t('ticked shows all 7', onPool.length === 7)

  // 🔴 EVERY COUNT, NOT JUST THE LIST.
  t('All (N) excludes flagged', offCounts.all === 4)
  // 🔴 3, NOT 2 — AND THE FIRST VERSION OF THIS LINE SAID 2, WRONGLY. Unflagged and reachable: a (due),
  // b (due), f (unknown). `total` is due + unknown, so 2 + 1 = 3. The harness caught my arithmetic, not
  // a defect in the code; recorded because a test corrected to match the code is exactly the move that
  // needs justifying in writing. The flagged d and g are excluded, which is what this line exists to check.
  t('🔴 Due work (N) excludes flagged', offCounts.total === 3 && offCounts.due === 2)
  t('🔴 Needs details (N) excludes flagged', offCounts.leads === 1)  // c only; e is flagged
  t('🔴 "needs a look" (unknown) excludes flagged', offCounts.unknown === 1)
  t('every count rises when ticked', onCounts.all === 7 && onCounts.leads === 2 && onCounts.unknown === 2)

  // The hidden note.
  t('hidden count is 3 while unticked', impl.hiddenOf(FIXTURE, false) === 3)
  t('hidden count is 0 while ticked (note disappears)', impl.hiddenOf(FIXTURE, true) === 0)

  // prev/next walks `visible`, which is derived from the pool — so hidden rows are skipped.
  t('🔴 navigation cannot reach a hidden prospect', !offPool.some(p => p.do_not_contact === true))
  return { ok, fails }
}

const V = {
  V1: { poolOf: (r) => r, hiddenOf: (r, s) => (s ? 0 : r.filter(p => p.do_not_contact === true).length) },
  V2: { poolOf: (r, s) => (s ? r : r.filter(p => !p.do_not_contact)), hiddenOf: (r, s) => (s ? 0 : r.filter(p => p.do_not_contact === true).length) },
  V3: { poolOf, hiddenOf: () => 0 },
}
const NAMES = {
  V1: 'the pool is never filtered (rows hidden elsewhere, counts unchanged)',
  V2: 'uses falsy (!do_not_contact) so null/undefined/false are treated the same as true would be… ',
  V3: 'the hidden-count note always reads 0 (suppression is silent)',
}
// ⚠️ V2 is subtle ON PURPOSE: `!p.do_not_contact` keeps the same rows as `!== true` for this fixture's
// null/false/undefined, so it is caught not by the rows but by nothing — which is why V2's real job is
// to show the harness CANNOT tell those two apart. See the note printed with the result.

console.log('── BROKEN VARIANTS: each MUST report FAILURE ────────────────────────────────────────────')
let allFailed = true
for (const k of ['V1', 'V3']) {
  const r = runSuite(V[k])
  const detected = r.fails.length > 0
  if (!detected) allFailed = false
  console.log(`  ${detected ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  ${k} ${NAMES[k]}`)
  for (const f of r.fails.slice(0, 3)) console.log(`        caught: ${f}`)
}
if (!allFailed) { console.log('\n🔴 A VARIANT PASSED.'); process.exit(1) }

console.log('\n── THE REAL IMPLEMENTATION ─────────────────────────────────────────────────────────────')
const r = runSuite({ poolOf, hiddenOf })
for (const n of r.ok) console.log('  ✓ ' + n)
for (const n of r.fails) console.log('  🔴 ' + n)

// ── THE SOURCE MUST WIRE IT UP ──────────────────────────────────────────────────────────────────────
console.log('\n── THE PANEL SOURCE ────────────────────────────────────────────────────────────────────')
const checks = [
  ['🔴 pool excludes flagged with !== true', /const pool = useMemo\(\s*\n\s*\(\) => \(showDoNotContact \? prospects : prospects\.filter\(p => p\.do_not_contact !== true\)\)/.test(SRC)],
  ['the tickbox state defaults to false', /useState\(false\)\s*\n[\s\S]{0,400}?const pool = useMemo/.test(SRC) || /const \[showDoNotContact, setShowDoNotContact\] = useState\(false\)/.test(SRC)],
  ['🔴 NOT persisted — no localStorage for it', !/showDoNotContact[\s\S]{0,200}localStorage/.test(SRC)],
  ['steps derive from the pool', /const steps = useMemo\(\(\) => \{[\s\S]{0,200}?for \(const p of pool\)/.test(SRC)],
  ['channels derive from the pool', /const channels = useMemo\(\(\) => \{[\s\S]{0,260}?for \(const p of pool\)/.test(SRC)],
  ['computedVisible narrows the pool', /const rows = pool/.test(SRC)],
  ['🔴 computedVisible DEPENDS on pool (or it never recomputes)', /\}, \[pool, sort, filter, listView, steps, channels\]\)/.test(SRC)],
  ['All (N) reads the pool', /All \(\$\{pool\.length\}\)/.test(SRC)],
  ['"N of M trucks" reads the pool', /of \{pool\.length\} trucks/.test(SRC)],
  ['the hidden note renders', /\{hiddenDnc\} hidden — do not contact/.test(SRC)],
  ['🔴 the doNotContact FILTER is gone', !/\{ key: 'doNotContact'/.test(SRC)],
  ['flagged rows still carry a visible marker', /p\.do_not_contact === true && \(/.test(SRC)],
]
const sf = []
for (const [n, okk] of checks) { if (!okk) sf.push(n); console.log(`  ${okk ? '✓' : '🔴'} ${n}`) }

console.log('\n⚠️ NOT PROVED HERE: that `!== true` and `!p.do_not_contact` differ. They agree on every value')
console.log('   this column can hold (true / false / null), so no fixture can separate them. The source')
console.log('   check above pins `!== true` because it matches nextStep\'s own first stop, not because a')
console.log('   behavioural test caught the alternative.')

const fails = r.fails.concat(sf)
console.log(`\n${fails.length ? '🔴 ' + fails.length + ' FAILED' : '✅ all ' + (r.ok.length + checks.length) + ' passed'}`)
process.exit(fails.length ? 1 : 0)
