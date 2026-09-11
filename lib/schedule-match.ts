// lib/schedule-match.ts
//
// 🔴 THE SCHEDULE COUNT'S MATCHER — ONE DEFINITION, TWO CALLERS, SO THEY CANNOT DISAGREE.
//
// The outreach table's Schedule cell shows `Y (n)`, where n counts `discovery_events` rows whose
// `truck_name`, trimmed and lowercased, EXACTLY equals the truck's name or one of its aliases. The popup
// launched from that number must list exactly those rows. If the popup used a different rule, clicking
// "5" would show a number of rows that is not 5.
//
// 🔴 THIS IS NOT A SIXTH NORMALISER. It is the outreach route's existing `norm` (trim + lowercase),
// MOVED here verbatim so the events route can call the SAME function. The five documented normalisers
// (run-scraper `normalizeName`, outreach `norm`, discovery/events `normalize`, venue-matcher `normName`,
// venue-signature `normalizeVenue`) are unchanged in number and in behaviour — one of them now lives in a
// module instead of inside a route file.
//
// 🔴 IT IS DELIBERATELY NOT THE FUZZY ONE. `venue-signature`'s `normalizeVenue` + `venuesFuzzyMatch` —
// which the Events tab's ORPHAN flag correctly uses — strips filler words, chops plurals and then matches
// on Levenshtein-1 plus substring containment. 🧪 Measured over all 231 prospects and 903 events, the two
// rules disagree on 5 trucks, e.g. `Between Buns` (this rule 5 rows, the fuzzy rule 10) and
// `The Shack Street Food` (0 vs 3, where the 3 belong to `The Foodie Shack` — a different business).
// The orphan flag WANTS the permissive rule, because "orphan" must mean invisible to every matcher. The
// count wants the strict one. Both are right; they must not be swapped.

/** Trim + lowercase. The outreach route's schedule key rule, verbatim. */
export const scheduleNorm = (s: string | null | undefined): string => (s ?? '').trim().toLowerCase()

/**
 * The set of normalised keys a truck's events may be filed under: its own name plus every alias.
 * Empty strings are dropped so a truck with a blank alias cannot match rows with a blank truck_name.
 */
export function scheduleKeys(name: string | null | undefined, aliases: string[] | null | undefined): Set<string> {
  const keys = new Set<string>()
  const n = scheduleNorm(name)
  if (n) keys.add(n)
  for (const a of aliases ?? []) {
    const k = scheduleNorm(a)
    if (k) keys.add(k)
  }
  return keys
}

/** True if this event row belongs to the truck those keys describe. Exact membership, never fuzzy. */
export function eventMatchesKeys(truckName: string | null | undefined, keys: Set<string>): boolean {
  const k = scheduleNorm(truckName)
  return k ? keys.has(k) : false
}
