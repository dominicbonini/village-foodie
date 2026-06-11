// scripts/verify-venue-signature.ts
// Unit test for the Stage-2 scraped-signature dedup (lib/venue-signature.ts).
// Run:  npx tsx scripts/verify-venue-signature.ts
//
// The bridge dedup = same truck_id AND same event_date (exact) AND fuzzy(venue). venuesFuzzyMatch
// only covers the venue; the date/truck are exact SQL filters — modelled here as `sigMatch`.

import { normalizeVenue, venuesFuzzyMatch } from '@/lib/venue-signature'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`   ✅ ${name}${detail ? `  →  ${detail}` : ''}`) }
  else { fail++; console.log(`   ❌ ${name}${detail ? `  →  ${detail}` : ''}`) }
}

// Full bridge-equivalent signature match: truck_id + event_date exact, venue fuzzy.
function sigMatch(
  a: { truck: string; date: string; venue: string },
  b: { truck: string; date: string; venue: string },
): boolean {
  return a.truck === b.truck && a.date === b.date &&
    venuesFuzzyMatch(normalizeVenue(a.venue), normalizeVenue(b.venue))
}

console.log('\nVENUE SIGNATURE — dedup match cases\n')

// 1. Typo: Fardons ↔ Farndons (same truck/date) → MATCH (the whole point)
check(
  'Fardons ↔ Farndons (same truck/date) MATCH',
  sigMatch(
    { truck: 'gusto', date: '2026-06-14', venue: 'Fardons at The Swan' },
    { truck: 'gusto', date: '2026-06-14', venue: 'Farndons at The Swan' },
  ),
  `${normalizeVenue('Fardons at The Swan')} ~ ${normalizeVenue('Farndons at The Swan')}`,
)

// 2. Distinct venues, different date → NO MATCH (must not collapse genuine events)
check(
  'Wickhambrook MSC (12 Jun) ↔ Party In The Park, Clare (13 Jun) NO MATCH',
  !sigMatch(
    { truck: 'gusto', date: '2026-06-12', venue: 'Wickhambrook MSC' },
    { truck: 'gusto', date: '2026-06-13', venue: 'Party In The Park' },
  ),
)
// also venue-only must not match
check(
  '… and venue-only is not fuzzy-equal',
  !venuesFuzzyMatch(normalizeVenue('Wickhambrook MSC'), normalizeVenue('Party In The Park')),
)

// 3. Minor variation: "The Cavendish Five Bells" ↔ "Cavendish Five Bells" (same date) → MATCH
check(
  '"The Cavendish Five Bells" ↔ "Cavendish Five Bells" (same date) MATCH',
  sigMatch(
    { truck: 'gusto', date: '2026-06-06', venue: 'The Cavendish Five Bells' },
    { truck: 'gusto', date: '2026-06-06', venue: 'Cavendish Five Bells' },
  ),
  `${normalizeVenue('The Cavendish Five Bells')} ~ ${normalizeVenue('Cavendish Five Bells')}`,
)

// 4. Same venue, different date → NO MATCH (different event instances)
check(
  'Same venue, different date NO MATCH',
  !sigMatch(
    { truck: 'gusto', date: '2026-06-06', venue: 'The Five Bells' },
    { truck: 'gusto', date: '2026-06-29', venue: 'The Five Bells' },
  ),
)

console.log('\n' + '─'.repeat(60))
if (fail === 0) console.log(`✅ VENUE SIGNATURE CASES PASS — ${pass} checks.`)
else { console.log(`❌ ${fail} FAILED (${pass} passed).`); process.exit(1) }
