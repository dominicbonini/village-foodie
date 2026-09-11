// lib/discovery-gate.ts
//
// 🔴 THE ONE WAY INTO `discovery_events`. Every writer calls `admitDiscoveryEvents`; nothing else in the
// repository upserts or inserts into that table any more (census in docs/dedup-gate-build-report.md).
//
// 🔴 IT IS A LIBRARY, NOT A ROUTE, AND IT IS NOT INSIDE /api/inbound-schedule's BRIDGE LOOP. That route
// calls this function to perform its DISCOVERY write and then runs its bridge over the SAME `rows`
// array it always did. This function never removes a row from the caller's list — it returns one
// outcome per row — so a duplicate marked here cannot stop an operator being asked to approve an
// event. docs/trading-truck-rules-review.md §6 records why that placement is the one that must not
// happen; this is the placement that satisfies it.
//
// WHAT IT DOES, IN ORDER, PER ROW
//   1. TRUCK — `scheduleKeys`/`eventMatchesKeys` (lib/schedule-match: the EXISTING name+aliases matcher,
//      exact after trim/lowercase), then the route's existing `normName` containment as the fallback the
//      route always had. No sixth normaliser: both are imported.
//   2. VENUE — `findVenue` (lib/venue-matcher, UNMODIFIED), then the R5 ACCEPTANCE CHECK on its output:
//        accept if the matcher said `high` (village agrees);
//        else the venue must lie within 15 km of the event's village anchor (median of the other venues
//        in that village — the matcher's own construction, re-derived here because its helper is private);
//        AND if the scraped text carries a postcode, its SECTOR must match the venue's.
//      🔴 WHERE R5 FAILS, `venue_id` STAYS NULL. A wrong link is invisible; a missing one is a gap the
//      admin table shows. The rejection reason is returned so the caller can log it.
//      If the matcher found NO candidate and the row carries a village, a venue is CREATED on
//      (name, village) with no coordinates — the same shape the scraper has always written for an
//      un-geocodable venue — so the next scrape resolves it instead of minting it again.
//   3. DUPLICATE — same event_date, same truck (resolved id when both have one, else the scraper-mirror
//      normaliser `normalizeVenue` on the name), then `duplicateVerdict`: same full postcode, OR venues
//      ≤ 500 m, OR identical coordinates, OR contained venue names at the same start time within
//      1,500 m. The start-time gap is always recorded, and is part of the rule only in that last case. NEWEST WINS: the incoming row is
//      written and the older row is marked superseded_by it. A row whose (date, truck, venue) key already
//      exists is an UPDATE of itself, never its own duplicate.
//   4. INSERT — upsert on the existing unique key, then mark the losers.
//
// ⚠️ THE `superseded_*` COLUMNS COME FROM supabase/migrations/20260911_discovery_events_superseded.sql.
// Until that is applied, the marking UPDATE fails with PGRST204; it is caught, counted and returned as
// `markFailed` rather than thrown, so the scraper keeps working before the migration runs — but nothing
// is hidden until it does. The fresh-row INSERT never names those columns, so it cannot fail for lack
// of them.
import type { SupabaseClient } from '@supabase/supabase-js'
import { findVenue, normName, type VenueRow } from '@/lib/venue-matcher'
import { normalizeVenue } from '@/lib/venue-signature'
import { scheduleKeys, eventMatchesKeys } from '@/lib/schedule-match'

export const DUP_DISTANCE_M = 500
export const R5_ANCHOR_MAX_KM = 15
/** Ceiling for the NAME+TIME rule. Bounded by measurement on both sides: it must clear 1,111 m (the
 *  widest pair judged a true duplicate, `Dog show` / `Dog show (CXD)`) and stay under 2,581 m
 *  (`The Street` / `The Street - By Post Office`, two real pitches). Every value from 1,200 to 2,500 m
 *  produces the identical result set, so the choice is insensitive inside those bounds. */
export const DUP_NAME_CEILING_M = 1500
/** 🔴 LOAD-BEARING, NOT COSMETIC. `normalizeVenue` strips the filler words `the` and `street`, so
 *  "The Street" normalises to the EMPTY STRING — and every string contains the empty string. Without a
 *  floor, containment accepts 59 of the 197 future pairs instead of 22 and merges two real pitches
 *  2,581 m apart. ⚠️ It costs "MSC" (3 chars), a genuine duplicate — which the postcode rule catches. */
export const DUP_NAME_MIN_CHARS = 4

/** Which half of which rule fired. Stored in `superseded_reason`, which has a CHECK constraint —
 *  the last two values need supabase/migrations/20260912_superseded_reason_values.sql APPLIED first. */
export type DupRule = 'postcode' | 'distance' | 'identical-coords' | 'name-time'

export type IncomingEvent = {
  event_date: string            // ISO YYYY-MM-DD
  start_time?: string | null
  end_time?: string | null
  truck_name: string
  venue_name?: string | null
  village?: string | null
  event_notes?: string | null
  source?: string | null
  ai_notes?: string | null
}

export type TruckRow = { id: string; name: string; aliases: string[] | null }
type ExistingEvent = {
  id: string; event_date: string; start_time: string | null; truck_name: string; venue_name: string | null
  village: string | null; source: string | null; venue_id: string | null; discovery_truck_id: string | null
  created_at: string; superseded_by?: string | null
}

export type Outcome = {
  key: string
  truck: { id: string | null; how: 'alias-exact' | 'containment' | 'none' }
  venue: { id: string | null; name: string | null; how: 'high' | 'r5-accepted' | 'r5-rejected' | 'created' | 'none'; reason: string }
  /** `supersedes` is the LOSER's id when the incoming row won; when the incoming row is the OLDER of the two it loses instead, and this carries the winner's id (dry run: `SELF-by-<winner>`). */
  duplicate: null | { supersedes: string; rule: DupRule; metres: number | null; postcode: string | null; timeGapMin: number | null; otherSource: string | null }
  wrote: 'inserted-or-updated' | 'failed'
  error?: string
}

// ── geometry ─────────────────────────────────────────────────────────────────────────────────────
export function haversineM(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6371000, r = (x: number) => (x * Math.PI) / 180
  const dLat = r(b.latitude - a.latitude), dLng = r(b.longitude - a.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.latitude)) * Math.cos(r(b.latitude)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
const hasXY = (v: VenueRow | null | undefined): v is VenueRow & { latitude: number; longitude: number } =>
  !!v && v.latitude != null && v.longitude != null
export const normPostcode = (p: string | null | undefined): string | null => (p || '').toUpperCase().replace(/\s+/g, '') || null
/** "CB12GA" → "CB12": outward code + inward digit. Adjacent units share a sector; a different town does not. */
export const postcodeSector = (p: string | null | undefined): string | null => { const n = normPostcode(p); return n ? n.slice(0, -2) : null }
const POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i
export const postcodeInText = (t: string): string | null => { const m = POSTCODE_RE.exec(t); return m ? (m[1] + m[2]).toUpperCase() : null }
const mins = (t: string | null | undefined): number | null => { const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return m ? +m[1] * 60 + +m[2] : null }

/** Median position of the venues in each village — the matcher's own anchor, re-derived (its helper is private). */
export function villageAnchors(allVenues: VenueRow[]): Map<string, { latitude: number; longitude: number; n: number }> {
  const g = new Map<string, { la: number[]; lo: number[] }>()
  for (const v of allVenues) { if (!hasXY(v)) continue; const k = normName(v.village); if (!k) continue
    const e = g.get(k) ?? { la: [], lo: [] }; e.la.push(Number(v.latitude)); e.lo.push(Number(v.longitude)); g.set(k, e) }
  const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor((s.length - 1) / 2)] }
  const out = new Map<string, { latitude: number; longitude: number; n: number }>()
  for (const [k, e] of g) out.set(k, { latitude: med(e.la), longitude: med(e.lo), n: e.la.length })
  return out
}

// ── R5 ───────────────────────────────────────────────────────────────────────────────────────────
/** The acceptance check on the matcher's output. Pure. Never changes which venue was proposed. */
export function r5Accept(
  row: Pick<IncomingEvent, 'venue_name' | 'village' | 'ai_notes'>,
  venue: VenueRow, confidence: 'high' | 'low' | 'none',
  anchors: Map<string, { latitude: number; longitude: number; n: number }>,
): { ok: boolean; reason: string } {
  const pcEvent = postcodeInText(`${row.venue_name || ''} ${row.village || ''} ${row.ai_notes || ''}`)
  const pcVenue = normPostcode(venue.postcode)
  // sector test applies to BOTH branches — it is the check that caught the matcher choosing the wrong foodPark
  if (pcEvent && pcVenue && postcodeSector(pcEvent) !== postcodeSector(pcVenue))
    return { ok: false, reason: `event postcode sector ${postcodeSector(pcEvent)} ≠ venue ${postcodeSector(pcVenue)}` }
  // 🔴 "VILLAGE AGREES" MEANS THE MATCHER SAID `high`, NOTHING WIDER. Re-testing villageAgrees() here
  // accepted one extra row (39 of 71) that the measured, decided rule (38 of 71) rejected — the matcher
  // returns `low` for a multi-candidate village tie it broke by pickBest, and that is a guess, not an
  // agreement. The decision was made on the matcher's verdict; the gate honours the verdict.
  if (confidence === 'high') return { ok: true, reason: 'village agrees (matcher high)' }
  const a = anchors.get(normName(row.village ?? null))
  if (!a) return { ok: false, reason: `no anchor for village "${row.village || '—'}"` }
  if (!hasXY(venue)) return { ok: false, reason: 'venue has no coordinates to check against the anchor' }
  const km = haversineM(a, venue) / 1000
  return km <= R5_ANCHOR_MAX_KM ? { ok: true, reason: `${km.toFixed(1)} km from ${row.village} anchor (n=${a.n})` }
                                : { ok: false, reason: `${km.toFixed(1)} km from ${row.village} anchor (n=${a.n}) > ${R5_ANCHOR_MAX_KM} km` }
}

// ── duplicate rule ───────────────────────────────────────────────────────────────────────────────
export function isDuplicate(a: VenueRow | null, b: VenueRow | null): null | { rule: 'postcode' | 'distance'; metres: number | null; postcode: string | null } {
  if (!a || !b) return null
  const pa = normPostcode(a.postcode), pb = normPostcode(b.postcode)
  const metres = hasXY(a) && hasXY(b) ? haversineM(a, b) : null
  if (pa && pb && pa === pb) return { rule: 'postcode', metres, postcode: pa }
  if (metres != null && metres <= DUP_DISTANCE_M) return { rule: 'distance', metres, postcode: null }
  return null
}

/**
 * The full event-level verdict: the venue rules above, then the two added rules, in priority order.
 * 🔴 ONE DEFINITION. The live gate below and scripts/backfill-discovery-dedup.mjs both call THIS, so a
 * backfill can never judge by rules the ingest path does not have. Pure; takes two events and their
 * resolved venues.
 *
 * Order — postcode → distance → identical coordinates → name+time:
 *   1-2. `isDuplicate` (same full postcode, or venues ≤ 500 m).
 *   3. IDENTICAL COORDINATES — both venues at exactly the same point. 🔴 STATED PLAINLY: in this order
 *      it is UNREACHABLE, and not merely "subsumed today". Identical coordinates means both venues have
 *      coordinates, so `isDuplicate` measures 0 m, and 0 ≤ 500 always returns `distance` first. It is
 *      kept because it costs nothing and becomes live the moment DUP_DISTANCE_M is tightened below the
 *      precision of a coordinate pair, or the order is changed to put it first. 🧪 Measured: it fires
 *      on 0 of the 197 future pairs; the 5 identical-coordinate pairs all return `postcode` or
 *      `distance` from the branch above.
 *   4. NAME + TIME — same start time (BOTH known), venue names contained either way after the existing
 *      `normalizeVenue`, and the venues within DUP_NAME_CEILING_M. 🔴 An unverifiable distance is NOT a
 *      small one: if either venue lacks coordinates the rule does not fire. Missing start times do not
 *      fire either — a blank is an unread field, not an agreement.
 */
export function duplicateVerdict(
  a: Pick<IncomingEvent, 'start_time' | 'venue_name'>,
  b: { start_time?: string | null; venue_name?: string | null },
  va: VenueRow | null, vb: VenueRow | null,
): null | { rule: DupRule; metres: number | null; postcode: string | null } {
  const base = isDuplicate(va, vb)
  if (base) return base
  if (!va || !vb) return null

  if (hasXY(va) && hasXY(vb) && Number(va.latitude) === Number(vb.latitude) && Number(va.longitude) === Number(vb.longitude))
    return { rule: 'identical-coords', metres: 0, postcode: null }

  const ta = mins(a.start_time), tb = mins(b.start_time)
  if (ta == null || tb == null || ta !== tb) return null
  const na = normalizeVenue(a.venue_name || ''), nb = normalizeVenue(b.venue_name || '')
  if (na.length < DUP_NAME_MIN_CHARS || nb.length < DUP_NAME_MIN_CHARS) return null
  if (!na.includes(nb) && !nb.includes(na)) return null
  const metres = hasXY(va) && hasXY(vb) ? haversineM(va, vb) : null
  if (metres == null || metres > DUP_NAME_CEILING_M) return null
  return { rule: 'name-time', metres, postcode: null }
}

// ── the gate ─────────────────────────────────────────────────────────────────────────────────────
export async function admitDiscoveryEvents(
  supabase: SupabaseClient,
  incoming: IncomingEvent[],
  opts: { dryRun?: boolean; lookups?: { trucks: TruckRow[]; venues: VenueRow[] } } = {},
): Promise<{ outcomes: Outcome[]; created: number; superseded: number; markFailed: number; rejectedByR5: number }> {
  const dry = !!opts.dryRun
  let trucks = opts.lookups?.trucks, venues = opts.lookups?.venues
  if (!trucks || !venues) {
    const [{ data: t }, { data: v }] = await Promise.all([
      supabase.from('discovery_trucks').select('id, name, aliases'),
      supabase.from('venues').select('id, name, village, latitude, longitude, postcode'),
    ])
    trucks = (t ?? []) as TruckRow[]; venues = (v ?? []) as VenueRow[]
  }
  const truckKeys = trucks.map(t => ({ t, keys: scheduleKeys(t.name, t.aliases) }))
  const anchors = villageAnchors(venues)
  const outcomes: Outcome[] = []
  let created = 0, superseded = 0, markFailed = 0, rejectedByR5 = 0

  // existing same-day rows, fetched once for the dates in this batch
  const dates = [...new Set(incoming.map(r => r.event_date))]
  // Same-day rows carry `superseded_by` so an already-marked row is never chosen as a counterpart and
  // never resurrected. ⚠️ Tolerant of the column not existing yet (migration 20260911): on a 42703 the
  // select is retried without it and every row is treated as unmarked.
  const BASE_COLS = 'id, event_date, start_time, truck_name, venue_name, village, source, venue_id, discovery_truck_id, created_at'
  let sameDay: ExistingEvent[] = []
  if (dates.length) {
    let r: { data: unknown; error: { message?: string } | null } = await supabase.from('discovery_events').select(BASE_COLS + ', superseded_by').in('event_date', dates)
    if (r.error && /superseded_by/.test(r.error.message || '')) r = await supabase.from('discovery_events').select(BASE_COLS).in('event_date', dates)
    sameDay = ((r.data as unknown[] | null) ?? []) as ExistingEvent[]
  }
  const venueById = new Map(venues.map(v => [v.id, v]))

  for (const row of incoming) {
    const key = `${row.event_date}|${row.truck_name}|${row.venue_name ?? ''}`
    const out: Outcome = { key, truck: { id: null, how: 'none' }, venue: { id: null, name: null, how: 'none', reason: '' }, duplicate: null, wrote: 'failed' }

    // 1 ── truck
    const byAlias = truckKeys.find(({ keys }) => eventMatchesKeys(row.truck_name, keys))
    if (byAlias) out.truck = { id: byAlias.t.id, how: 'alias-exact' }
    else { const ni = normName(row.truck_name); const m = trucks.find(t => { const nd = normName(t.name); return !!nd && !!ni && (nd === ni || nd.includes(ni) || ni.includes(nd)) })
      if (m) out.truck = { id: m.id, how: 'containment' } }

    // 2 ── venue: match → R5 → (create)
    let venue: VenueRow | null = null
    const match = findVenue(row.venue_name ?? null, row.village ?? null, venues)
    if (match.venue) {
      const r5 = r5Accept(row, match.venue, match.confidence, anchors)
      if (r5.ok) { venue = match.venue; out.venue = { id: venue.id, name: venue.name, how: match.confidence === 'high' ? 'high' : 'r5-accepted', reason: r5.reason } }
      else { rejectedByR5++; out.venue = { id: null, name: match.venue.name, how: 'r5-rejected', reason: `${match.venue.name} [${match.venue.village ?? '—'}]: ${r5.reason}` } }
    } else if (row.venue_name && row.village && !dry) {
      // no candidate at all → create on (name, village), no coordinates (the scraper's own shape)
      const { data: nv, error: cErr } = await supabase.from('venues')
        .upsert({ name: row.venue_name, village: row.village, latitude: null, longitude: null, postcode: null }, { onConflict: 'name,village', ignoreDuplicates: false })
        .select('id, name, village, latitude, longitude, postcode').single()
      if (!cErr && nv) { venue = nv as VenueRow; venues.push(venue); venueById.set(venue.id, venue); created++; out.venue = { id: venue.id, name: venue.name, how: 'created', reason: 'no candidate; created on (name, village), no coordinates' } }
      else out.venue = { id: null, name: row.venue_name, how: 'none', reason: `create failed: ${cErr?.message ?? 'unknown'}` }
    } else if (row.venue_name && row.village && dry) {
      out.venue = { id: null, name: row.venue_name, how: 'created', reason: 'DRY RUN: would create on (name, village)' }
    } else out.venue = { id: null, name: row.venue_name ?? null, how: 'none', reason: match.venue ? '' : 'no candidate and no village — cannot create' }

    // 3 ── duplicate against same-day rows for the same truck
    // 🔴 "NEWEST WINS" IS DECIDED BY created_at, NOT BY WHO ARRIVED LAST. A daily re-scrape re-posts an
    // existing key, which is an UPDATE of that row — its created_at is unchanged, so it is exactly as
    // old as it was. Without this, two sources re-posting one pair every day would supersede each other
    // in turn. So: the self row (if the key already exists) keeps its created_at; a brand-new key is
    // newest by construction; the older of the two is the loser, whichever direction that is.
    // A row already superseded is skipped as a counterpart, and a self row already superseded STAYS
    // superseded — a re-scrape never resurrects a duplicate.
    const myTruckKey = normalizeVenue(row.truck_name)
    const selfRow = sameDay.find(ex => `${ex.event_date}|${ex.truck_name}|${ex.venue_name ?? ''}` === key) ?? null
    const selfCreatedAt = selfRow?.created_at ?? '9999-12-31T00:00:00Z'      // a new key is newer than anything stored
    let counterpart: ExistingEvent | null = null, verdict: ReturnType<typeof duplicateVerdict> = null
    if (!selfRow?.superseded_by) for (const ex of sameDay) {
      if (ex.event_date !== row.event_date || ex === selfRow || ex.superseded_by) continue
      const sameTruck = (out.truck.id && ex.discovery_truck_id) ? out.truck.id === ex.discovery_truck_id : normalizeVenue(ex.truck_name) === myTruckKey
      if (!sameTruck) continue
      const v = duplicateVerdict(row, ex, venue, ex.venue_id ? venueById.get(ex.venue_id) ?? null : null)
      if (v) { counterpart = ex; verdict = v; break }
    }
    let selfIsLoser = false
    if (counterpart && verdict) {
      selfIsLoser = counterpart.created_at > selfCreatedAt
      const ta = mins(row.start_time), tb = mins(counterpart.start_time)
      out.duplicate = { supersedes: selfIsLoser ? 'SELF' : counterpart.id, rule: verdict.rule, metres: verdict.metres == null ? null : Math.round(verdict.metres), postcode: verdict.postcode, timeGapMin: ta != null && tb != null ? Math.abs(ta - tb) : null, otherSource: counterpart.source }
    }

    // 4 ── write, then mark the loser (newest wins: the incoming row is the newest by construction)
    if (dry) { if (out.duplicate && selfIsLoser && counterpart) out.duplicate.supersedes = `SELF-by-${counterpart.id}`; out.wrote = 'inserted-or-updated'; outcomes.push(out); if (out.duplicate) superseded++; continue }
    const { data: ins, error: wErr } = await supabase.from('discovery_events').upsert({
      event_date: row.event_date, start_time: row.start_time || null, end_time: row.end_time || null,
      truck_name: row.truck_name, venue_name: row.venue_name || null, village: row.village || null,
      event_notes: row.event_notes || null, source: row.source || null, ai_notes: row.ai_notes || null,
      visibility: 'public', show_on_vf: true, show_on_hg: true,
      discovery_truck_id: out.truck.id, venue_id: venue?.id ?? null,
    }, { onConflict: 'event_date,truck_name,venue_name', ignoreDuplicates: false }).select('id').single()
    if (wErr || !ins) { out.wrote = 'failed'; out.error = wErr?.message ?? 'no id returned'; outcomes.push(out); continue }
    out.wrote = 'inserted-or-updated'
    if (out.duplicate && counterpart) {
      const loserId = selfIsLoser ? ins.id : counterpart.id, winnerId = selfIsLoser ? counterpart.id : ins.id
      if (selfIsLoser) out.duplicate.supersedes = counterpart.id   // report the real winner's id, not the placeholder
      const { error: mErr } = await supabase.from('discovery_events').update({
        superseded_by: winnerId, superseded_reason: out.duplicate.rule, superseded_at: new Date().toISOString(),
        superseded_meta: { metres: out.duplicate.metres, postcode: out.duplicate.postcode, time_gap_min: out.duplicate.timeGapMin,
          winner_source: selfIsLoser ? counterpart.source : (row.source ?? null), loser_source: selfIsLoser ? (row.source ?? null) : counterpart.source,
          winner_key: selfIsLoser ? `${counterpart.event_date}|${counterpart.truck_name}|${counterpart.venue_name ?? ''}` : key, self_was_loser: selfIsLoser },
        show_on_vf: false, show_on_hg: false,
      }).eq('id', loserId).is('superseded_by', null)
      if (mErr) { markFailed++; out.error = `marked=no: ${mErr.message}` } else superseded++
    }
    outcomes.push(out)
  }
  return { outcomes, created, superseded, markFailed, rejectedByR5 }
}
