// scripts/linking-guards.ts
// TWO REFUSAL GUARDS for the venue-linking scripts. They sit AROUND lib/venue-matcher.ts and refuse its
// output; they do not change how it matches. 🔴 lib/venue-matcher.ts is NOT modified by this file and must
// not be — V1.1 records a draft that quietly restructured its two-stage test being caught and reverted.
//
// WHY ONE SHARED MODULE AND NOT A COPY IN EACH SCRIPT: both backfill scripts need identical refusals, and
// V1.2 §5.6 records what a byte-mirror costs when the two copies drift (lib/venue-signature.ts mirrors
// run-scraper.js's normalizeName and has to be kept in step by hand). One implementation, two importers.
//
// Nothing here writes to the database, creates a venue, deletes anything, or applies a link.

import { toks, normName, type VenueRow } from '../lib/venue-matcher'

export type GuardVerdict =
  | { ok: true; coordState: 'GOOD' | 'UNCHECKABLE' }
  | { ok: false; guard: 'CATEGORY' | 'BAD_COORD'; reason: string; coordState?: 'BAD' }

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const r = (x: number) => (x * Math.PI) / 180
  const dLat = r(lat2 - lat1), dLng = r(lng2 - lng1)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/* ══ GUARD ONE — CATEGORY-NAME TARGETS ═══════════════════════════════════════════════════════════════
 *
 * 🔴 THE HARM, MEASURED: 50 HIGH links today point at the generic `foodPark` row, and the Pizza Mondo
 * case put an event 5.64 km from where it happened — a distance the 15 km ceiling passes without comment.
 *
 * 🔴 THE LIST IS DERIVED FROM THE DATA, NOT TYPED IN. A "category head" is a venue whose significant-token
 * set is a PROPER subset of at least one other venue's — i.e. its name is the generic root that more
 * specific rows extend ("foodPark" ⊊ "FoodPark Science Park"). That is the same containment test the
 * matcher itself uses at lib/venue-matcher.ts:170-171, so it identifies exactly the rows the matcher can
 * collapse a family onto.
 *
 * ⚠️ A PROPER SUBSET ALONE IS NOT ENOUGH, AND THIS IS THE WHOLE DESIGN. "The Bell" [Bottisham] is also a
 * proper subset of "Buxhall Bell" [Ipswich] — but it is a real pub, and the arbitration validation proved
 * that link CORRECT. Refusing it would trade a wrong pin for a lost right one. What separates the two:
 *
 *   • foodPark [Cambridge] has more-specific branches IN CAMBRIDGE (Science Park, CB1, Biomedical, …),
 *     so the village cannot tell the head from its branches. Picking the head means "somewhere in the
 *     family", which is not a place.
 *   • The Bell [Bottisham]'s only more-specific sibling is in Ipswich, so the village DOES separate them.
 *
 * 🔴 THE RULE: refuse only when the target is a generic root AND at least one of its more-specific
 * branches shares its village. Structural, needs no statistics, and no threshold to tune.
 */
export type CategoryIndex = Map<string, { branches: number; sameVillage: string[]; spreadKm: number }>

export function buildCategoryIndex(allVenues: VenueRow[]): CategoryIndex {
  const idx: CategoryIndex = new Map()
  for (const v of allVenues) {
    const t = toks(v.name)
    if (t.length === 0) continue
    // strictly-more-specific rows: every token of v, plus at least one more
    const kids = allVenues.filter(w => {
      if (w.id === v.id) return false
      const wt = new Set(toks(w.name))
      return wt.size > t.length && t.every(x => wt.has(x))
    })
    if (kids.length === 0) continue
    const sameVillage = kids.filter(k => normName(k.village) && normName(k.village) === normName(v.village))
    let spreadKm = 0
    const grp = [v, ...kids]
    for (let i = 0; i < grp.length; i++) for (let j = i + 1; j < grp.length; j++) {
      const a = grp[i], b = grp[j]
      if (a.latitude != null && a.longitude != null && b.latitude != null && b.longitude != null) {
        spreadKm = Math.max(spreadKm, haversineKm(Number(a.latitude), Number(a.longitude), Number(b.latitude), Number(b.longitude)))
      }
    }
    if (sameVillage.length > 0) idx.set(v.id, { branches: kids.length, sameVillage: sameVillage.map(k => k.name), spreadKm })
  }
  return idx
}

/* ══ GUARD TWO — BAD-COORDINATE TARGETS ══════════════════════════════════════════════════════════════
 *
 * 🔴 A CORRECT LINK TO A WRONG VENUE IS STILL A WRONG PIN. 14 venues fail this gauntlet today — 2 carrying
 * placeholder decimals, 12 sitting on the GB centroid — and 54 links currently point at one of them.
 *
 * ⚠️ THE SENTINEL SET IS BUILT AT RUNTIME FROM THE TABLE, exactly as V1.1's geocoder gauntlet does, so it
 * finds a bad shared point WITHOUT being told which one. Hard-coding 55.3781,-3.4360 would have found that
 * point and missed the next one.
 *
 * 🔴 THREE STATES, DELIBERATELY NOT COLLAPSED INTO TWO:
 *   GOOD        — has a coordinate, passes every check.
 *   BAD         — placeholder / sentinel / outside the UK box. REFUSED.
 *   UNCHECKABLE — has a coordinate that passes, but NO postcode, so it cannot be checked against an
 *                 outside witness. 21 venues, 56 HIGH links.
 * ⚠️ UNCHECKABLE IS NOT GOOD. V1.1 records the village-anchor check reporting zero problems on 7 genuinely
 * broken venues because a village holding one venue anchors to itself — absence of evidence read as a pass.
 * These are held separately and reported, never folded into the approved set as though verified.
 */
export const SENTINEL_MIN_ROWS = 5

/** Points shared by >= minRows venues cannot be real addresses. Derived from the data, not hard-coded. */
export function buildSentinelSet(allVenues: VenueRow[], minRows = SENTINEL_MIN_ROWS): Set<string> {
  const count = new Map<string, number>()
  for (const v of allVenues) {
    if (v.latitude == null || v.longitude == null) continue
    const k = `${Number(v.latitude).toFixed(4)},${Number(v.longitude).toFixed(4)}`
    count.set(k, (count.get(k) ?? 0) + 1)
  }
  return new Set([...count].filter(([, n]) => n >= minRows).map(([k]) => k))
}

/** Same test as V1.1's: identical short decimal fractions on both axes ("52.1234, 0.1234"). */
function isPlaceholder(lat: number, lng: number): boolean {
  const frac = (x: number) => (String(x).split('.')[1] ?? '')
  return frac(lat).length > 0 && frac(lat).length <= 4 && frac(lat) === frac(lng)
}

function outsideUK(lat: number, lng: number): boolean {
  return lat < 49.8 || lat > 60.9 || lng < -8.2 || lng > 1.9
}

export function coordState(v: VenueRow, sentinels: Set<string>): { state: 'GOOD' | 'BAD' | 'UNCHECKABLE'; reason?: string } {
  if (v.latitude == null || v.longitude == null) return { state: 'BAD', reason: 'no coordinate — a venue_id with no lat/long buys no map pin' }
  const lat = Number(v.latitude), lng = Number(v.longitude)
  if (isPlaceholder(lat, lng)) return { state: 'BAD', reason: `placeholder decimals (${lat},${lng})` }
  if (sentinels.has(`${lat.toFixed(4)},${lng.toFixed(4)}`)) return { state: 'BAD', reason: `sentinel coordinate — shared by >= ${SENTINEL_MIN_ROWS} venues (${lat},${lng})` }
  if (outsideUK(lat, lng)) return { state: 'BAD', reason: `outside the UK bounding box (${lat},${lng})` }
  if (!v.postcode) return { state: 'UNCHECKABLE', reason: 'no postcode — coordinate cannot be checked against an outside witness' }
  return { state: 'GOOD' }
}

/** Both guards, in order. Returns the first refusal, or ok with the coordinate state carried through. */
export function applyGuards(target: VenueRow, categories: CategoryIndex, sentinels: Set<string>): GuardVerdict {
  const cat = categories.get(target.id)
  if (cat) {
    return {
      ok: false, guard: 'CATEGORY',
      reason: `target "${target.name}" is a category root: ${cat.branches} more-specific branch(es), ` +
              `${cat.sameVillage.length} of them in the same village (${cat.sameVillage.slice(0, 3).join('; ')}` +
              `${cat.sameVillage.length > 3 ? '; …' : ''}) — the village cannot tell the head from its branches`,
    }
  }
  const cs = coordState(target, sentinels)
  if (cs.state === 'BAD') return { ok: false, guard: 'BAD_COORD', reason: cs.reason!, coordState: 'BAD' }
  return { ok: true, coordState: cs.state }
}

/* ══ GUARD THREE — POSTCODE DISAGREEMENT (FLAG ONLY) ══════════════════════════════════════════════════
 *
 * 🔴 THIS GUARD DOES NOT DECIDE. It refuses nothing, substitutes nothing, and writes nothing. It marks a
 * link for a human to look at. The other two guards return a refusal; this one returns an opinion.
 *
 * 🔴 WHY IT MUST NOT DECIDE, WITH THE CASE THAT PROVES IT: `Thirsty` [Cambridge] carries the postcode
 * CB11 4RY, which resolves to Clavering in Uttlesford — 24 km from the Cambridge venue whose stored
 * coordinate is CORRECT. There the postcode is the wrong half, lifted from elsewhere on the page. A rule
 * that let the postcode win would have moved a correct pin. Disagreement means ONE of the two is wrong;
 * it does not say which, and nothing here pretends to know.
 *
 * 🔴 FOUR STATES, AND UNCHECKED IS NOT A PASS. Coverage is structural, not random: 1,100 of the 1,104
 * postcodes in `ai_notes` come from `URL:` scrapes, and `Drive Screenshot`, `hg_scraper`,
 * `hatchesup_scraper` and `Manual Entry` produce ZERO. A row with no postcode has not been checked and
 * must never be counted as confirmed — that is the degenerate-anchor mistake (V1.2 §5.1: a village
 * holding one venue anchors to itself and passes 7 broken venues).
 *
 * ⚠️ Partial postcodes are counted apart and never guessed at. `CB1` is a district of Cambridge; `CB21`
 * spans villages. An outward code cannot place a pitch, and expanding one would be inventing a location —
 * the exact demotion V1.1 applied to the model when it was acting as a geocoder.
 */

/** Under this, the postcode CONFIRMS the match. */
export const POSTCODE_CONFIRM_KM = 0.5
/** Over this, FLAG for review. Between the two: noted, not flagged. */
export const POSTCODE_FLAG_KM = 2

export type PostcodeVerdict =
  | { state: 'CONFIRMED' | 'NOTED' | 'FLAGGED'; postcode: string; km: number; pcLat: number; pcLng: number }
  | { state: 'UNCHECKED'; reason: string; postcode?: string }

/** Outward+inward, and outward-only-with-nothing-following. Both anchored on word boundaries. */
const PC_FULL = /\b([A-Z]{1,2}\d{1,2}[A-Z]?)\s*(\d[A-Z]{2})\b/i
const PC_OUTWARD_ONLY = /\b([A-Z]{1,2}\d{1,2}[A-Z]?)\b(?!\s*\d[A-Z]{2})/i

export const pcKey = (s: string) => String(s).toUpperCase().replace(/\s+/g, '')

/** What kind of postcode, if any, this text carries. Never expands a partial. */
export function extractPostcode(text: string | null): { full: string | null; partial: string | null } {
  const t = String(text ?? '')
  const f = t.match(PC_FULL)
  if (f) return { full: pcKey(f[0]), partial: null }
  const p = t.match(PC_OUTWARD_ONLY)
  return { full: null, partial: p ? pcKey(p[0]) : null }
}

export type PostcodeIndex = {
  resolved: Map<string, { lat: number; lng: number }>
  stats: { distinct: number; resolved: number; unresolved: string[]; apiCalls: number; outage: boolean }
}

/**
 * Resolve every DISTINCT full postcode once, in bulk. 🧪 There are 146 distinct postcodes across 1,104
 * rows today, so a full run is 2 calls to postcodes.io rather than 1,104.
 *
 * 🔴 AN OUTAGE IS "UNCHECKED", NEVER "NO". If postcodes.io cannot be reached the index comes back empty
 * and every row becomes UNCHECKED — the same rule geo-validate.js already states. It must never fall
 * through to treating an unresolvable postcode as agreement.
 */
export async function buildPostcodeIndex(
  aiNotesTexts: (string | null)[],
  fetchImpl: typeof fetch = fetch,
): Promise<PostcodeIndex> {
  const distinct = [...new Set(aiNotesTexts.map(t => extractPostcode(t).full).filter((x): x is string => !!x))]
  const resolved = new Map<string, { lat: number; lng: number }>()
  const unresolved: string[] = []
  let apiCalls = 0, outage = false
  for (let i = 0; i < distinct.length; i += 100) {
    const batch = distinct.slice(i, i + 100)
    try {
      const r = await fetchImpl('https://api.postcodes.io/postcodes', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ postcodes: batch }),
      })
      apiCalls++
      const j = await r.json() as { result?: { query: string; result: { latitude: number; longitude: number } | null }[] }
      for (const it of (j.result ?? [])) {
        if (it.result) resolved.set(pcKey(it.query), { lat: it.result.latitude, lng: it.result.longitude })
        else unresolved.push(it.query)
      }
    } catch {
      outage = true                       // 🔴 leaves this batch UNRESOLVED, i.e. UNCHECKED, not confirmed
    }
  }
  return { resolved, stats: { distinct: distinct.length, resolved: resolved.size, unresolved, apiCalls, outage } }
}

/** The verdict for one candidate link. Pure; the index is passed in. */
export function checkPostcode(aiNotes: string | null, target: VenueRow, idx: PostcodeIndex): PostcodeVerdict {
  const { full, partial } = extractPostcode(aiNotes)
  if (!full) return { state: 'UNCHECKED', reason: partial ? `outward-only postcode "${partial}" — cannot place a point` : 'no postcode in ai_notes', postcode: partial ?? undefined }
  if (target.latitude == null || target.longitude == null) return { state: 'UNCHECKED', reason: 'target venue has no coordinate', postcode: full }
  const hit = idx.resolved.get(full)
  if (!hit) return { state: 'UNCHECKED', reason: 'postcode did not resolve at postcodes.io', postcode: full }
  const km = haversineKm(hit.lat, hit.lng, Number(target.latitude), Number(target.longitude))
  const state = km < POSTCODE_CONFIRM_KM ? 'CONFIRMED' : km <= POSTCODE_FLAG_KM ? 'NOTED' : 'FLAGGED'
  return { state, postcode: full, km, pcLat: hit.lat, pcLng: hit.lng }
}
