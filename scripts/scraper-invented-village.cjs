#!/usr/bin/env node
// scripts/scraper-invented-village.cjs — the invented-village assertion, and its wiring in the scraper.
//   node scripts/scraper-invented-village.cjs   (< 1s: NO NETWORK, NO SHEET, NO DATABASE)
//
// ── 🔴 WHY THIS EXISTS ────────────────────────────────────────────────────────────────────────────────
// `assertNoInventedVillages` shipped with a 12-case proof that lived in a REPORT and not in a file, so
// nothing re-ran it. On 1 October 2026 the assertion stopped the daily scrape on `"Holbrook" [Holbrook]`
// — a CORRECT row: Holbrook is a Suffolk village and an approved venue in this system. The premise
// `village === venue_name ⇒ invented` has two causes and only one is the bug.
//
// 🔴 THE FAILURE MODE THIS GUARDS, in the order it would hurt:
//    the assertion stops firing on a real invention — the behaviour it exists for returns unseen;
//    the assertion fires on correct data again — a red run every morning gets the guard switched off,
//    and then the first failure mode arrives silently;
//    the corroboration becoming CIRCULAR — a self-named venue vouching for itself would exempt exactly
//    the shape the assertion is for;
//    `villageAudit` drifting out of step with `newRowsToAdd`, so the rows checked are not the rows written.

const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')

const REPO = path.resolve(__dirname, '..')
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8')

let fails = 0
const ok = [], bad = []
const t = (n, c) => (c ? ok : bad).push(n)

/** Did `assertNoInventedVillages` throw for these inputs? */
function threw(fn, rows, settlements) {
  try { fn(rows, 'Pass A', settlements); return false } catch { return true }
}

;(async () => {
  const mod = await import(pathToFileURL(path.join(REPO, 'scripts/geo-validate.js')).href)
  const A = mod.assertNoInventedVillages
  t('🔴 the assertion is exported and callable', typeof A === 'function')

  // ── THE ORIGINAL 12 CASES, UNCHANGED ───────────────────────────────────────────────────────────
  // 🔴 THEY MUST STILL HOLD WITH NO CORROBORATION PASSED. The added argument is optional, and a caller
  // that supplies no evidence must get the STRICT guard — never a silent pass. That is what makes the
  // change safe: the only way to be exempt is to hand over a reason.
  t('🔴 village === venue name, exact → THROWS',
    threw(A, [{ venue_name: 'Church View Campsite', village: 'Church View Campsite' }]))
  t('🔴 …differing only by CASE → THROWS',
    threw(A, [{ venue_name: 'Church View Campsite', village: 'church view campsite' }]))
  t('🔴 …differing only by PUNCTUATION/SPACING → THROWS',
    threw(A, [{ venue_name: 'Church View Campsite', village: 'church-view  campsite' }]))
  t('🔴 …one bad row hidden among 99 clean ones → THROWS', threw(A, [
    ...Array.from({ length: 99 }, (_, i) => ({ venue_name: `The Plough ${i}`, village: 'Shepreth' })),
    { venue_name: 'Church View Campsite', village: 'Church View Campsite' },
  ]))
  t('⚠️ a normal row passes', !threw(A, [{ venue_name: 'The Plough', village: 'Shepreth' }]))
  /* 🔴 AN EMPTY VILLAGE IS THE OUTCOME THE PROMPT FIX WANTS. `norm('')` is `''` on both sides, so a
   * naive equality test would flag every honestly-blank row and turn the fix into a permanent red run. */
  t('🔴 an EMPTY village passes — the length check is load-bearing',
    !threw(A, [{ venue_name: 'Church View Campsite', village: '' }]))
  t('⚠️ …and so do null, undefined and both-empty', !threw(A, [
    { venue_name: 'A', village: null }, { venue_name: 'B' }, { venue_name: '', village: '' },
  ]))
  t('⚠️ a village that is a SUBSTRING, not equal, passes',
    !threw(A, [{ venue_name: 'Debenham Vets', village: 'Debenham' }]))
  t('⚠️ no rows and a null argument pass', !threw(A, []) && !threw(A, null))

  // ── 🔴 THE FALSE POSITIVE THAT STOPPED THE SCRAPE ──────────────────────────────────────────────
  // 🧪 The real row, and the real venue record behind it:
  //    docs/sql/migration-step-3-20260909/02-import.sql → ('Holbrook', 'Holbrook', 'IP9 2')
  const HOLBROOK = { venue_name: 'Holbrook', village: 'Holbrook', venueVillage: 'Holbrook' }
  t('🔴 THE REPORTED FAILURE: "Holbrook" [Holbrook] matched to the approved Holbrook venue PASSES',
    !threw(A, [HOLBROOK]))
  t('🔴 …and it is the CORROBORATION doing that, not a loosened comparison — strip the evidence and it throws',
    threw(A, [{ venue_name: 'Holbrook', village: 'Holbrook' }]))
  t('⚠️ …case and punctuation in the approved record still corroborate',
    !threw(A, [{ venue_name: 'St Neots', village: 'St. Neots', venueVillage: 'st-neots' }]))

  // ── 🔴 THE BUG IS STILL CAUGHT, INCLUDING ON AN EXISTING VENUE ─────────────────────────────────
  // This is the case the narrower fix — "exempt anything that matched a venue" — would have missed.
  t('🔴 an echoed village on an EXISTING venue recorded elsewhere still THROWS',
    threw(A, [{ venue_name: 'Church View Campsite', village: 'Church View Campsite', venueVillage: 'Shepreth' }]))
  t('🔴 a BRAND-NEW venue whose village echoes its name still THROWS — nothing corroborates it',
    threw(A, [{ venue_name: 'Chilfest', village: 'Chilfest', venueVillage: null }]))

  // ── 🔴 THE SETTLEMENT SET, AND THE EXCLUSION THAT KEEPS IT HONEST ──────────────────────────────
  t('🔴 a village other, DIFFERENTLY-named venues sit in corroborates it',
    !threw(A, [{ venue_name: 'Debenham', village: 'Debenham' }], ['Debenham', 'Shepreth']))
  /* 🔴 THE CIRCULARITY TEST, AND THE MOST IMPORTANT CHECK HERE. If the settlement set were built from
   * every venue's village, a self-named `Chilfest [Chilfest]` row would put "Chilfest" in the set and
   * exempt the very shape the assertion exists to catch. The scraper's builder excludes rows whose name
   * equals their village; this proves the assertion still throws when that exclusion is honoured. */
  t('🔴 a self-named venue does NOT vouch for itself — the exclusion is what makes this non-circular',
    threw(A, [{ venue_name: 'Chilfest', village: 'Chilfest' }], ['Shepreth', 'Debenham']))
  t('⚠️ an empty or blank entry in the settlement set exempts nothing',
    threw(A, [{ venue_name: 'Chilfest', village: 'Chilfest' }], ['', '   ', null, undefined]))

  // ── 🔴 THE MESSAGE STILL NAMES THE ROWS, AND SAYS WHAT A NON-REPORT MEANS ──────────────────────
  t('🔴 the failure names every offending row, and only those', (() => {
    try {
      A([
        { venue_name: 'The Plough', village: 'Shepreth' },
        { venue_name: 'Chilfest', village: 'Chilfest' },
        HOLBROOK,
      ], 'Pass A')
      return false
    } catch (e) {
      return /1 Pass A row/.test(e.message) && e.message.includes('"Chilfest" [Chilfest]')
        && !e.message.includes('Holbrook') && !e.message.includes('The Plough')
    }
  })())
  t('⚠️ …and says a venue named after its own village is not reported, so a reader is not left guessing', (() => {
    try { A([{ venue_name: 'Chilfest', village: 'Chilfest' }], 'Pass A'); return false }
    catch (e) { return /genuinely named after its own village is NOT reported/.test(e.message) }
  })())

  // ── 🔴 THE WIRING IN THE SCRAPER ───────────────────────────────────────────────────────────────
  const S = read('scripts/run-scraper.js')
  t('🔴 the assertion is called with the AUDIT rows, not with the Sheet payload',
    /assertNoInventedVillages\(villageAudit, 'Pass A', settlementVillages\)/.test(S)
    && !/assertNoInventedVillages\(newRowsToAdd/.test(S))
  /* 🔴 ONE AUDIT ENTRY PER WRITTEN ROW. If these two ever differ in length the assertion is checking a
   * different set of rows from the one being written — and it would still be green. Counted rather than
   * asserted in prose: exactly one `villageAudit.push(` for the one `newRowsToAdd.push(`. */
  t('🔴 villageAudit is pushed exactly once per newRowsToAdd push',
    (S.match(/newRowsToAdd\.push\(/g) || []).length === 1
    && (S.match(/villageAudit\.push\(/g) || []).length === 1)
  t('⚠️ …and it is NOT a tenth element of the Sheet row, which would append a stray column',
    /Col I: AI Notes/.test(S) && !/Col J/.test(S))
  t('🔴 the settlement set EXCLUDES self-named venues — the non-circularity, in the source',
    /normalizeName\(v\[1\]\) !== normalizeName\(v\[0\] \|\| ''\)/.test(S))
  t('🔴 …and it is built from `venueMatchRows` — the set the matcher used, already floor-guarded',
    /const settlementVillages = venueMatchRows/.test(S))
  t('⚠️ the matcher itself is untouched — resolveVenueFrom still returns a NAME',
    /confirmedVenue = resolveVenueFrom\(venueMatchRows, normVenue, eventTextToSearch, eventPostcode\)/.test(S)
    && /if \(bestMatch && highestScore > 0\) confirmedVenue = bestMatch;/.test(S))
  t('🔴 the two VILLAGE prompt rules still permit an empty string and forbid repeating the venue',
    (S.match(/use "" \(an empty string\) — do NOT repeat the venue name and do NOT guess/g) || []).length === 2)

  // ── 🔴 BROKEN VARIANTS: the checks above must be shown catching these ──────────────────────────
  //
  // 🔴 W1 IS A SOURCE MUTATION, NOT A BEHAVIOURAL ONE, AND THE FIRST DRAFT OF THIS HARNESS GOT IT WRONG.
  // It tried to prove non-circularity by handing the assertion a polluted settlement set — but every row
  // the assertion examines has `village === venue_name` by definition, so a self-vouching entry is
  // indistinguishable from a genuine one AT THAT LAYER. The assertion cannot verify how the set was
  // built; the exclusion lives in the scraper's builder and must be pinned THERE. Keeping the original
  // W1 would have meant either a permanently red harness or deleting the settlement route to make a
  // mis-aimed test pass. The test moved to the layer that owns the property.
  console.log('── BROKEN VARIANTS: MUST be caught ─────────────────────────────────────────────────────')
  const variants = [
    ['W1 🔴 the scraper stops excluding self-named venues from the settlement set', () => {
      const broken = S.replace(
        ".filter(v => v[1] && normalizeName(v[1]) !== normalizeName(v[0] || ''))",
        '.filter(v => v[1])')
      if (broken === S) return { applied: false }
      // The source check that owns this property must reject the mutated source.
      const caught = !/normalizeName\(v\[1\]\) !== normalizeName\(v\[0\] \|\| ''\)/.test(broken)
      return { applied: true, caught }
    }],
    ['W2 🔴 the audit array is replaced by the Sheet payload again', () => {
      const broken = S.replace(
        "assertNoInventedVillages(villageAudit, 'Pass A', settlementVillages)",
        "assertNoInventedVillages(newRowsToAdd.map(r => ({ venue_name: r[4], village: r[5] })), 'Pass A')")
      if (broken === S) return { applied: false }
      const caught = !/assertNoInventedVillages\(villageAudit, 'Pass A', settlementVillages\)/.test(broken)
        || /assertNoInventedVillages\(newRowsToAdd/.test(broken)
      return { applied: true, caught }
    }],
    ['W3 🔴 a VILLAGE prompt rule loses its empty-string escape clause', () => {
      const broken = S.replace(
        '6. VILLAGE: Extract the town, village, or city into a separate "village" field. If the town or village truly cannot be determined from the text, use "" (an empty string) — do NOT repeat the venue name and do NOT guess.',
        '6. VILLAGE (MANDATORY): Always extract the town, village, or city into a separate "village" field.')
      if (broken === S) return { applied: false }
      const caught = (broken.match(/use "" \(an empty string\) — do NOT repeat the venue name and do NOT guess/g) || []).length !== 2
      return { applied: true, caught }
    }],
  ]
  for (const [label, run] of variants) {
    const { applied, caught } = run()
    /* 🔴 A VARIANT THAT DID NOT APPLY PROVES NOTHING AND LOOKS LIKE A PASS — `String.replace` returns the
     * same string when it finds nothing, so the anchor is checked separately from the outcome. */
    if (!applied) { console.log(`  🔴 ${label}: THE PATCH DID NOT APPLY — its anchor has drifted`); fails += 1; continue }
    console.log(`  ${caught ? '✓ caught as required' : '🔴 NOT CAUGHT — THE HARNESS PROVES NOTHING'}  ${label}`)
    if (!caught) fails += 1
  }

  // ── 🔴 AND THE BEHAVIOURAL PAIR THE ASSERTION ITSELF OWNS ──────────────────────────────────────
  // Each names a WRONG behaviour; the assertion must not exhibit it.
  for (const [label, exhibits] of [
    ['B1 🔴 the Holbrook false positive returns (corroboration ignored)', () => threw(A, [HOLBROOK])],
    ['B2 🔴 an echoed village on an existing venue is let through',
      () => !threw(A, [{ venue_name: 'Church View Campsite', village: 'Church View Campsite', venueVillage: 'Shepreth' }])],
    ['B3 🔴 a brand-new echoed village is let through',
      () => !threw(A, [{ venue_name: 'Chilfest', village: 'Chilfest', venueVillage: null }])],
  ]) {
    const broken = exhibits()
    console.log(`  ${broken ? '🔴 EXHIBITED — THE FIX IS WRONG' : '✓ not exhibited'}  ${label}`)
    if (broken) fails += 1
  }

  console.log('\n── THE ASSERTION AND ITS WIRING ────────────────────────────────────────────────────────')
  for (const n of ok) console.log('  ✓ ' + n)
  for (const n of bad) console.log('  🔴 ' + n)
  fails += bad.length
  console.log(`\n${fails === 0 ? `✅ all ${ok.length} passed` : `🔴 ${fails} CHECK(S) FAILED`}`)
  process.exit(fails === 0 ? 0 : 1)
})()
