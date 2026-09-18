#!/usr/bin/env node
// scripts/breach-banner-dismiss.cjs — a dismissed over-capacity warning stays dismissed.
//   node scripts/breach-banner-dismiss.cjs
//
// 🔴 FAILURE MODE (Dominic, 19 September 2026, test-truck "Bures Music Festival"): the banner warned about
// six over-capacity slots. He dismissed it, then CANCELLED the order that had pushed one of them over —
// exactly what the banner asked for — and was warned again, about the five he had just reviewed. Dismissal
// was keyed to the whole set's signature compared for EQUALITY, so any change to the set re-showed it,
// including the set getting smaller.
// A dismissal now covers each slot at the severity it was reviewed at: the banner returns only for a slot
// that was never dismissed, or one that is FURTHER over than when it was.
const fs = require('fs'), os = require('os'), path = require('path')
const { compile, REPO } = require('./_slot-interval-compile.cjs')
let fails = 0
const check = (ok, label) => { console.log(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }
const load = (root, tag) => {
  const c = compile(root, ['components/dashboard/CapacityBreachBanner.tsx', 'lib/capacity-breach.ts'], tag,
    { jsx: 'react-jsx', skipLibCheck: true, noImplicitAny: false })
  // the emitted module imports react/jsx-runtime, so the OUTPUT dir needs the repo's node_modules
  const nm = path.join(c.out, 'node_modules')
  if (!fs.existsSync(nm)) fs.symlinkSync(path.join(REPO, 'node_modules'), nm)
  return c.req('components/dashboard/CapacityBreachBanner.js')
}

/** A breach as detectCapacityBreaches emits it. */
const B = (time, overTotal, cats = [], keys = []) => ({
  collection_time: time, reason: cats.length ? `Pizza ${cats[0].over + 2}/2` : 'global ceiling',
  over_total: overTotal, over_cats: cats, order_keys: keys, order_ids: keys, override_orders: [],
})
// Dominic's board: six slots over the Pizza batch, one of them (12:15) held by the order he cancelled.
const SIX = [
  B('12:15', 0, [{ cat: 'pizza', over: 1 }], ['k11']),
  B('12:30', 0, [{ cat: 'pizza', over: 2 }], ['k10', 'k18']),
  B('12:45', 0, [{ cat: 'pizza', over: 2 }], ['k14']),
  B('13:45', 0, [{ cat: 'pizza', over: 2 }], ['k17', 'k24']),
  B('14:00', 0, [{ cat: 'pizza', over: 2 }], ['k16', 'k26']),
  B('14:15', 0, [{ cat: 'pizza', over: 2 }], ['k20', 'k23']),
]
const AFTER_CANCEL = SIX.filter(b => b.collection_time !== '12:15')      // the cancelled order's slot clears
const WORSE = SIX.map(b => b.collection_time === '12:30' ? B('12:30', 0, [{ cat: 'pizza', over: 5 }], ['k10', 'k18']) : b)
const LESS = SIX.map(b => b.collection_time === '12:30' ? B('12:30', 0, [{ cat: 'pizza', over: 1 }], ['k10']) : b)
const NEW_SLOT = [...AFTER_CANCEL, B('15:00', 0, [{ cat: 'pizza', over: 3 }], ['k31'])]
const NEW_CAT = SIX.map(b => b.collection_time === '12:45' ? B('12:45', 0, [{ cat: 'pizza', over: 2 }, { cat: 'burger', over: 1 }], ['k14']) : b)
const CEILING_WORSE = SIX.map(b => b.collection_time === '13:45' ? B('13:45', 3, [{ cat: 'pizza', over: 2 }], ['k17']) : b)

function variant(tag, from, to) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `bbd-${tag}-`))
  for (const d of ['components', 'lib']) fs.cpSync(path.join(REPO, d), path.join(tmp, d), { recursive: true })
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules'))
  const f = path.join(tmp, 'components/dashboard/CapacityBreachBanner.tsx'); const src = fs.readFileSync(f, 'utf8')
  if (src.split(from).length !== 2) { console.log(`🔴 ${tag}: anchor not found exactly once`); process.exit(1) }
  fs.writeFileSync(f, src.replace(from, to))
  const M = load(tmp, `bbd${tag}`); M.tmp = tmp; return M
}
/** Would the banner show, given this set and this dismissal? */
const shows = (M, breaches, dismissedSig) => M.unreviewedBreaches(breaches, dismissedSig).length > 0

console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')
{
  // V1 — TODAY'S RULE: the whole set's signature, compared for equality.
  const M = variant('v1', `export function unreviewedBreaches(breaches: CapacityBreach[], dismissedSig: string | null): CapacityBreach[] {`,
    `export function unreviewedBreaches(breaches: CapacityBreach[], dismissedSig: string | null): CapacityBreach[] {
  return breachSignature(breaches || []) === dismissedSig ? [] : (breaches || [])`)
  const sig = M.breachSignature(SIX)
  const bad = shows(M, AFTER_CANCEL, sig)
  console.log(`  ${bad ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 whole-set equality — after cancelling the 12:15 order the banner returns: shows=${bad}`)
  fs.rmSync(M.tmp, { recursive: true, force: true }); if (!bad) process.exit(1)
}
{
  // V2 — a dismissal that swallows EVERYTHING, so a genuinely new breach is never shown.
  const M = variant('v2', `    const seen = reviewed.get(b.collection_time)
    if (!seen) return true`, `    const seen = reviewed.get(b.collection_time)
    if (!seen) return false`)
  const sig = M.breachSignature(SIX)
  const bad = !shows(M, NEW_SLOT, sig)
  console.log(`  ${bad ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V2 a dismissal that covers slots it never saw — a NEW slot at 15:00 stays hidden: shows=${!bad}`)
  fs.rmSync(M.tmp, { recursive: true, force: true }); if (!bad) process.exit(1)
}
{
  // V3 — severity ignored: a slot already dismissed can get much worse and never say so.
  const M = variant('v3', `    if ((b.over_total ?? 0) > seen.overTotal) return true              // further over the kitchen ceiling
    return (b.over_cats || []).some(c => (c.over ?? 0) > (seen.byCat[c.cat] ?? 0))   // further over a batch`,
    `    return false`)
  const sig = M.breachSignature(SIX)
  const bad = !shows(M, WORSE, sig) && !shows(M, CEILING_WORSE, sig)
  console.log(`  ${bad ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V3 severity ignored — 12:30 going from 2 over to 5 over stays hidden: shows=${!bad}`)
  fs.rmSync(M.tmp, { recursive: true, force: true }); if (!bad) process.exit(1)
}

const M = load(REPO, 'bbdReal')
const SIG = M.breachSignature(SIX)
console.log("\n── DOMINIC'S SEQUENCE ───────────────────────────────────────────────────────────────────")
check(shows(M, SIX, null), 'six slots over capacity, nothing dismissed yet: the banner shows')
check(!shows(M, SIX, SIG), '…he dismisses it: the banner hides')
check(!shows(M, AFTER_CANCEL, SIG), '…he CANCELS the order holding 12:15, leaving the other five: the banner STAYS HIDDEN')
check(!shows(M, LESS, SIG), '…and a slot that becomes LESS over than when it was dismissed stays hidden too')

console.log('\n── IT STILL WARNS WHEN SOMETHING IS NEW OR WORSE ────────────────────────────────────────')
check(shows(M, NEW_SLOT, SIG), 'a NEW slot goes over (15:00): the banner returns')
check(M.unreviewedBreaches(NEW_SLOT, SIG).map(b => b.collection_time).join() === '15:00',
  '…and only that slot is unreviewed — the five already seen are not counted again')
check(shows(M, WORSE, SIG), 'an already-dismissed slot goes FURTHER over its batch (12:30: 2 → 5): the banner returns')
check(shows(M, CEILING_WORSE, SIG), 'an already-dismissed slot goes further over the KITCHEN CEILING (13:45: over_total 0 → 3): the banner returns')
check(shows(M, NEW_CAT, SIG), 'a SECOND category goes over at an already-dismissed slot (12:45 gains burgers): the banner returns')
check(!shows(M, [], SIG) && !shows(M, [], null), 'no breaches at all: nothing to show, dismissed or not')

console.log('\n── THE RECORD FOLLOWS WHAT IS ACTUALLY OVER ─────────────────────────────────────────────')
{
  // After the cancel the banner re-acknowledges the reduced set (the effect in the component), so the
  // SAME breach coming back later is new again rather than silently swallowed by a stale signature.
  const reduced = M.breachSignature(AFTER_CANCEL)
  check(reduced !== SIG, 'the reduced set has its own signature')
  check(!shows(M, AFTER_CANCEL, reduced), '…which covers the five that remain')
  check(shows(M, SIX, reduced), '…and 12:15 going over AGAIN, after the re-acknowledgement, warns once more')
}

console.log(fails ? `\n🔴 ${fails} FAILED` : '\n✅ a dismissed over-capacity warning stays dismissed; only a new or worse breach returns')
process.exit(fails ? 1 : 0)
