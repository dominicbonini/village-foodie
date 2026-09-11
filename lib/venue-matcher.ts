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
 * 🔴 THE VILLAGE-AGREEMENT RULE, HOISTED — NOT A NEW RULE.
 *
 * This is verbatim the test that step 2 of findVenue already applied when there were ≥2 candidates:
 * bidirectional token-subset (so "Clare" agrees with "Clare Castle Country Park"), then the
 * embedded-town fallback (the candidate's village appears inside the scraped name, e.g.
 * "The Cavendish Five Bells" agreeing with a venue whose village is Cavendish).
 *
 * It was hoisted because the SINGLE-candidate branch never called it. Nothing about the test changed;
 * it is simply now applied in both places.
 */
export function villageAgrees(
  eventVillage: string | null,
  venueVillage: string | null,
  scrapedName: string | null,
): boolean {
  const cvT = toks(venueVillage)
  if (cvT.length === 0) return false                       // a venue with no village can never agree
  const evT = toks(eventVillage)
  if (evT.length > 0 && (cvT.every(t => evT.includes(t)) || evT.every(t => cvT.includes(t)))) return true
  const sTok = new Set(toks(scrapedName))                  // embedded-town fallback (step 2's own)
  return cvT.every(t => sTok.has(t))
}

/**
 * 🔴 THE DISTANCE CEILING — 15 km — DERIVED FROM THE LIVE TABLE, NOT CHOSEN.
 *
 * 🧪 Measured over today's 600 unlinked future events, using the village-token rule to split them:
 *   • matches whose villages AGREE (the known-good population, n=320):
 *       p50 0.16km · p90 3.36km · p95 4.04km · p99 5.55km · max 13.5km
 *   • matches whose villages DISAGREE (n=74): p50 36.3km · max 185.8km
 * At 15km, **zero** agreeing matches are wrongly blocked and 70 of the 74 disagreeing ones are caught.
 * At 12km one genuine match would be blocked; at 8km, one; at 5km, ten. 15km is the point where the
 * false-rejection count reaches zero while still catching almost every disagreement — a 2.7× margin
 * over the known-good p99.
 */
export const VENUE_MATCH_MAX_KM = 15

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const r = (x: number) => (x * Math.PI) / 180
  const dLat = r(lat2 - lat1), dLng = r(lng2 - lng1)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * A village's own position, taken from the OTHER venues already recorded in it — so the check needs no
 * network, no geocoder and no new input, and stays a pure function of `allVenues`. The MEDIAN is used,
 * not the mean, so one badly-geocoded row in a village cannot drag the anchor.
 * Memoised per `allVenues` array so a caller resolving hundreds of rows builds it once.
 */
const anchorCache = new WeakMap<object, Map<string, { lat: number; lng: number }>>()
function villageAnchors(allVenues: VenueRow[]): Map<string, { lat: number; lng: number }> {
  const hit = anchorCache.get(allVenues as unknown as object)
  if (hit) return hit
  const groups = new Map<string, { lat: number[]; lng: number[] }>()
  for (const v of allVenues) {
    if (v.latitude == null || v.longitude == null) continue
    const k = normName(v.village)
    if (!k) continue
    const g = groups.get(k) ?? { lat: [], lng: [] }
    g.lat.push(Number(v.latitude)); g.lng.push(Number(v.longitude))
    groups.set(k, g)
  }
  const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor((s.length - 1) / 2)] }
  const out = new Map<string, { lat: number; lng: number }>()
  for (const [k, g] of groups) out.set(k, { lat: med(g.lat), lng: med(g.lng) })
  anchorCache.set(allVenues as unknown as object, out)
  return out
}

/**
 * 🔴 DISTANCE CAN ONLY DOWNGRADE, NEVER UPGRADE — AND A MISSING COORDINATE IS NOT A FREE PASS.
 *
 * Three distinct outcomes, deliberately not collapsed into two:
 *   • too far            → downgrade to 'low'
 *   • within the ceiling → leave the verdict alone (it does NOT promote anything to 'high')
 *   • UNKNOWN — the venue has no coordinates, or no other venue in that village gives an anchor →
 *     also leaves the verdict alone. Absence of distance evidence is absence of evidence, so it can
 *     never turn a 'low' into a 'high'; the village rule above is what earns 'high', and it has
 *     already run. 🧪 174 of today's 600 events have no anchor — including "The White Swan"
 *     [Bluntisham], which is caught by the VILLAGE rule instead. Distance is the second net, not the
 *     first.
 */
function applyDistanceCeiling(m: VenueMatch, eventVillage: string | null, allVenues: VenueRow[]): VenueMatch {
  if (!m.venue || m.confidence !== 'high') return m
  if (m.venue.latitude == null || m.venue.longitude == null) return m       // UNKNOWN → unchanged
  const anchor = villageAnchors(allVenues).get(normName(eventVillage))
  if (!anchor) return m                                                     // UNKNOWN → unchanged
  const d = haversineKm(anchor.lat, anchor.lng, Number(m.venue.latitude), Number(m.venue.longitude))
  return d > VENUE_MATCH_MAX_KM ? { venue: m.venue, confidence: 'low' } : m
}

/**
 * Deterministic tie-break among candidates, ranked by, in order:
 *   (a) exact normName match with the scraped name,
 *   (b) largest significant-token overlap with the scraped name,
 *   (c) lexicographically smallest id.
 * No randomness, no "first in array" — so re-scrapes are stable.
 */
function pickBest(cands: VenueRow[], scrapedName: string, eventVillage: string | null, allVenues: VenueRow[]): VenueRow {
  const normScraped = normName(scrapedName)
  const sTok = new Set(toks(scrapedName))
  const overlap = (v: VenueRow) => toks(v.name).filter(t => sTok.has(t)).length
  // 🔴 DISTANCE IS NOW THE TIE-BREAK, AND IT USED TO BE THE UUID (12 September 2026).
  // Two venues sharing a name tie on (a) and (b), so the winner was decided by whichever id sorted
  // first — an arbitrary string. 🧪 That chose "The Bull" [Lower Green], 26.9 km from Bottisham, over
  // "The Bull" [Burrough Green] at 8.8 km, and "The Plough" [Birdbrook] at 26.7 km over [Shepreth] at
  // 8.2 km. The anchor needed to separate them was already being computed one function away, in
  // applyDistanceCeiling, and simply was not consulted here.
  //
  // 🔴 IT IS A TIE-BREAK, NOT A RE-RANKING. It sits BELOW exact-name and token-overlap, so a candidate
  // that matches the name better still wins — distance only decides candidates that were otherwise
  // indistinguishable. This cannot make the matcher pick a WORSE-named venue than it used to.
  //
  // ⚠️ WHAT IT DOES WHEN THERE IS NO DISTANCE, STATED RATHER THAN LEFT TO THE READER:
  //   • NEITHER candidate measurable (the event's village has no anchor, or neither venue has
  //     coordinates) → both score Infinity, the comparison ties, and it falls through to (d) the
  //     smallest id — byte-for-byte today's behaviour. The fallback is the OLD rule, not a new one.
  //   • EXACTLY ONE measurable → the measurable one wins. A venue we can place near the event beats
  //     one we cannot place at all, and it is also the only one R5 can later accept: r5Accept refuses
  //     a venue with no coordinates outright, so preferring it strictly widens what can be linked.
  const anchor = villageAnchors(allVenues).get(normName(eventVillage))
  const km = (v: VenueRow): number =>
    anchor && v.latitude != null && v.longitude != null
      ? haversineKm(anchor.lat, anchor.lng, Number(v.latitude), Number(v.longitude))
      : Number.POSITIVE_INFINITY
  return [...cands].sort((a, b) => {
    const ax = normName(a.name) === normScraped ? 1 : 0
    const bx = normName(b.name) === normScraped ? 1 : 0
    if (ax !== bx) return bx - ax                 // (a) exact-name first
    const ao = overlap(a), bo = overlap(b)
    if (ao !== bo) return bo - ao                 // (b) most token overlap
    const ad = km(a), bd = km(b)
    if (ad !== bd) return ad - bd                 // (c) nearer the event's village anchor
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0 // (d) smallest id — only when (c) cannot separate them
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
  // ── 🔴 THE DEFECT, FIXED (7 September 2026). WAS:
  //        if (cands.length === 1) return { venue: cands[0], confidence: 'high' }
  //    One surviving token-containment candidate was called 'high' WITHOUT EVER CONSULTING THE VILLAGE.
  //    That is not a tie-break subtlety — it is the whole check being skipped, and it is the mechanism
  //    behind every large mislink in the emitted backfill SQL:
  //      "The White Swan" [Bluntisham] → "The Swan" [Monks Eleigh]  — 65.5km, stamped HIGH
  //         toks("The White Swan") = ["white","swan"]; the only candidate is "The Swan" (["swan"] ⊆),
  //         so it was the sole candidate and shipped as high-confidence into the .sql.
  //      "Wine-Boutique" [Felixstowe] → [Sudbury] 43.4km · "Busy" [West Runton] → [Norwich] 34.8km.
  //    The village now participates in the decision for ONE candidate exactly as it always did for two
  //    or more. A lone candidate that agrees on village is still 'high'; one that does not, or one we
  //    cannot check because the event carries no village, is 'low' — returned, not discarded, so
  //    callers keep the information and the review CSV keeps the row.
  if (cands.length === 1) {
    return applyDistanceCeiling(
      { venue: cands[0], confidence: villageAgrees(village, cands[0].village, venueName) ? 'high' : 'low' },
      village, allVenues,
    )
  }

  // 2) Rank by village agreement (bidirectional token-subset, so "Clare" agrees with "Clare Castle
  //    Country Park"), then the embedded-town fallback (candidate's village appears in the scraped name).
  // ⚠️ RESTORED VERBATIM. An earlier draft of this fix replaced the two STAGES below with a single
  // combined predicate, which is NOT the same rule: staged, the embedded-town fallback runs only when
  // village-token agreement yields nothing; combined, both sets are unioned and `agree.length` can grow
  // from 1 to 2, flipping a legitimate 'high' to 'low'. The operator's position is that these rules
  // work — so this branch is byte-for-byte what it was, and only the single-candidate branch above,
  // which consulted the village not at all, has changed.
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
  if (agree.length === 1) return applyDistanceCeiling({ venue: agree[0], confidence: 'high' }, village, allVenues)
  if (agree.length > 1) {
    // Multiple in the agreeing village: exact name → high; else deterministic best-pick → low.
    const exact = agree.find(c => normName(c.name) === normScraped)
    return exact
      ? applyDistanceCeiling({ venue: exact, confidence: 'high' }, village, allVenues)
      : { venue: pickBest(agree, venueName, village, allVenues), confidence: 'low' }
  }
  // 3) ≥2 candidates, none agree on village (the old bail) → deterministic best-pick across all → low.
  return { venue: pickBest(cands, venueName, village, allVenues), confidence: 'low' }
}
