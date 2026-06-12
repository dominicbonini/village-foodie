// lib/venue-matcher.ts
// Single shared venue matcher (the manual's "single fuzzy matcher" — previously duplicated inline in
// app/api/inbound-schedule/route.ts and scripts/reresolve-event-venues.ts).
//
// Strategy: token-overlap candidates → village agreement → BEST-PICK on ambiguity (never bail to a
// silent null for a real candidate set). Returns a confidence signal so callers can stamp it and the
// approval UI can flag low-confidence guesses. Best-pick is DETERMINISTIC so a re-scrape of the same
// event never flips which venue (and therefore which map pin) it resolves to.

export type VenueRow = {
  id: string
  name: string
  village: string | null
  latitude: number | null
  longitude: number | null
  postcode: string | null
}

export type VenueMatch = {
  venue: VenueRow | null
  confidence: 'high' | 'low' | 'none'
}

/** Aggressive normalised name: lowercase, strip everything non-alphanumeric. */
export function normName(s: string | null): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Stopwords dropped from token comparison so "The Star" ≈ "Star Inn".
const STOP = new Set(['the', 'pub', 'inn', 'tavern', 'arms', 'bar', 'hotel', 'and', 'at', 'on', 'of'])

/** Significant tokens of a name (lowercased, split on non-alphanumerics, stopwords removed). */
export function toks(s: string | null): string[] {
  return (s || '').toLowerCase().split(/[^a-z0-9]+/).filter(t => t && !STOP.has(t))
}

/**
 * Deterministic tie-break among candidates, ranked by, in order:
 *   (a) exact normName match with the scraped name,
 *   (b) largest significant-token overlap with the scraped name,
 *   (c) lexicographically smallest id.
 * No randomness, no "first in array" — so re-scrapes are stable.
 */
function pickBest(cands: VenueRow[], scrapedName: string): VenueRow {
  const normScraped = normName(scrapedName)
  const sTok = new Set(toks(scrapedName))
  const overlap = (v: VenueRow) => toks(v.name).filter(t => sTok.has(t)).length
  return [...cands].sort((a, b) => {
    const ax = normName(a.name) === normScraped ? 1 : 0
    const bx = normName(b.name) === normScraped ? 1 : 0
    if (ax !== bx) return bx - ax                 // (a) exact-name first
    const ao = overlap(a), bo = overlap(b)
    if (ao !== bo) return bo - ao                 // (b) most token overlap
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0 // (c) smallest id
  })[0]
}

/**
 * Resolve a scraped venue name (+ optional town/village) to a known venue.
 * `allVenues` is passed in (the matcher closes over nothing).
 */
export function findVenue(
  venueName: string | null,
  village: string | null,
  allVenues: VenueRow[],
): VenueMatch {
  if (!allVenues || allVenues.length === 0 || !venueName) return { venue: null, confidence: 'none' }
  const sTok = new Set(toks(venueName))
  const normScraped = normName(venueName)

  // 1) Candidates by token containment (either direction), or exact normalised name.
  const cands = allVenues.filter(v => {
    if (normName(v.name) === normScraped) return true
    const vTok = new Set(toks(v.name))
    if (vTok.size === 0 || sTok.size === 0) return false
    const vSubS = [...vTok].every(t => sTok.has(t))   // venue name ⊆ scraped (e.g. "Five Bells")
    const sSubV = [...sTok].every(t => vTok.has(t))   // scraped ⊆ venue name (e.g. "Platform One")
    return vSubS || sSubV
  })
  if (cands.length === 0) return { venue: null, confidence: 'none' } // the ONLY null case
  if (cands.length === 1) return { venue: cands[0], confidence: 'high' }

  // 2) Rank by village agreement (bidirectional token-subset, so "Clare" agrees with "Clare Castle
  //    Country Park"), then the embedded-town fallback (candidate's village appears in the scraped name).
  const evVilToks = toks(village)
  let agree = evVilToks.length
    ? cands.filter(c => {
        const cvT = toks(c.village)
        return cvT.length > 0 && (cvT.every(t => evVilToks.includes(t)) || evVilToks.every(t => cvT.includes(t)))
      })
    : []
  if (agree.length === 0) {
    agree = cands.filter(c => {
      const cv = toks(c.village)
      return cv.length > 0 && cv.every(t => sTok.has(t))
    })
  }
  if (agree.length === 1) return { venue: agree[0], confidence: 'high' }
  if (agree.length > 1) {
    // Multiple in the agreeing village: exact name → high; else deterministic best-pick → low.
    const exact = agree.find(c => normName(c.name) === normScraped)
    return exact
      ? { venue: exact, confidence: 'high' }
      : { venue: pickBest(agree, venueName), confidence: 'low' }
  }
  // 3) ≥2 candidates, none agree on village (the old bail) → deterministic best-pick across all → low.
  return { venue: pickBest(cands, venueName), confidence: 'low' }
}
