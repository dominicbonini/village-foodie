// lib/admin/screenshot-events.ts
//
// The extraction + filtering core for the ADMIN event-screenshot upload. Pure functions, no I/O except
// the one Gemini call, so every rule below is testable WITHOUT an admin session — which matters, because
// V12.6 records that no agent session as an admin is obtainable and the page itself cannot be exercised
// here.
//
// ── 🔴 WHY THIS IS NOT `lib/schedule-extract.ts` ────────────────────────────────────────────────────
// That module is the OPERATOR path (/manage → process-schedule). Its `ExtractedEvent` has NO truck_name
// and its prompt's output schema never asks for one, because there the truck is already known from the
// token. A venue's schedule screenshot names SEVERAL trucks and that is the whole point of this surface,
// so the prompt had to gain a truck field. It is a separate module rather than an edit to the shared one
// PRECISELY so the operator path cannot regress: nothing here is imported by /manage.
// ⚠️ `callGeminiWithRetry` in that module is not exported, so the call is rebuilt here rather than
// reached into.

import { normalizeVenue, venuesFuzzyMatch } from '@/lib/venue-signature'

/**
 * 🔴 THE RECONCILED INVALID-VENUE LIST — the APPS SCRIPT'S NINE, not the app's five.
 * `lib/schedule-extract.ts:11` INVALID_VENUES holds 5 entries and matches by EXACT equality
 * (`:187`, `ev.venue_name.trim().toLowerCase() === v.toLowerCase()`).
 * The Apps Script (v6.57 orig :672) holds NINE and matches `venue === iv || venue.startsWith(iv)`.
 * Using the app's list on this path would silently let through "TBA", "No event today", "No service",
 * "None" — every one of which the Drive path drops today. This path replaces the Drive path, so it
 * takes the Drive path's list and its prefix rule.
 * ⚠️ The shared INVALID_VENUES is deliberately NOT edited: /manage depends on it.
 */
export const ADMIN_INVALID_VENUES = [
  'closed', 'n/a', 'tba', 'tbc', 'unavailable', 'cancelled', 'no event', 'no service', 'none',
]

/** Apps Script parity: equality OR prefix, on the lower-cased trimmed name. */
export function isInvalidVenueName(venueName: string | null | undefined): boolean {
  const v = String(venueName ?? '').toLowerCase().trim()
  if (!v) return true
  return ADMIN_INVALID_VENUES.some(iv => v === iv || v.startsWith(iv))
}

/**
 * 🔴 THE EXCLUSION CHECK — WHICH OF THE THREE, AND WHY.
 * There are three incompatible exclusion matchers in this codebase and picking one is a decision, not a
 * detail:
 *   1. scraper      run-scraper.js — normalizeName + 1-edit Levenshtein, applied to the TRUCK name
 *   2. Apps Script  v6.57:1240 — normalizeTruckKey + CONTAINMENT, applied to the TRUCK name
 *   3. app          lib/schedule-extract.ts:17 — keeps spaces + SUBSTRING, applied to the VENUE name
 *
 * THIS PATH USES (1): the scraper's normaliser and matcher, against the TRUCK name.
 *   • The list is the GLOBAL "this string is not a food truck" set, and `discovery_exclusion_terms.term_key`
 *     is defined as the value the scraper compares — so comparing it any other way reads the column
 *     against a rule it was not built for.
 *   • (3) is the wrong SUBJECT — it tests the venue name, which on a screenshot is the pitch, not the truck.
 *   • (2) is looser: manual V1.5 §16.3 measured the same 143 terms hitting 5 trucks under Levenshtein and
 *     7 under containment.
 * 🔴 SO THIS PATH IS STRICTER THAN THE DRIVE PATH IT REPLACES, and that is a deliberate behaviour change,
 * not an accident: two trucks the Drive path would silence, this one will not. Stated in the report.
 *
 * ⚠️ NO FOURTH IMPLEMENTATION. normalizeVenue/venuesFuzzyMatch (lib/venue-signature.ts) are documented in
 * their own header as BYTE-FOR-BYTE mirrors of run-scraper.js's normalizeName and isFuzzyMatch. The names
 * say "venue"; the functions are the scraper's generic name comparison.
 */
export function isExcludedTruckName(truckName: string | null | undefined, termKeys: string[]): string | null {
  const key = normalizeVenue(String(truckName ?? ''))
  if (!key) return null
  for (const t of termKeys) {
    if (t && venuesFuzzyMatch(t, key)) return t
  }
  return null
}

export type ScreenshotEvent = {
  event_date: string      // DD/MM/YYYY — the format /api/inbound-schedule's toISODate expects
  start_time: string
  end_time: string
  truck_name: string
  venue_name: string
  village: string
  postcode: string
}

export type DroppedEvent = { event: Partial<ScreenshotEvent>; reason: string }

/**
 * 🔴 THE TWO-WEEK DATE REFERENCE AND THE PAST-YEAR BAN, reproduced from the Apps Script (orig :565-578,
 * :590-613) rather than summarised. Both the Drive prompt and lib/schedule-extract.ts build a 14-day
 * day-name → DD/MM/YYYY table and tell the model not to calculate; that discipline is what keeps
 * "Monday" from becoming last Monday, so it is carried across verbatim in intent.
 * ⚠️ KEPT FROM THE APP PROMPT AND NOT FROM THE DRIVE ONE: the POSTCODE. The Drive prompt never asks for
 * one and 🧪 0 of its 511 rows carry one; the postcode is the one signal that LOCATES an event rather
 * than naming it (manual §14), so this prompt asks for it.
 * 🔴 ADDED, present in neither: `truck_name`. A venue screenshot names several trucks.
 */
export function buildScreenshotPrompt(now: Date = new Date()): string {
  const currentYear = now.getFullYear()
  const dateRef = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now.getTime() + i * 86400000)
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()]
    return `${dayName} = ${dd}/${mm}/${d.getFullYear()}`
  }).join('\n')

  return `CRITICAL CONTEXT: Today is ${now.toDateString()}.
Extract the food truck schedule from this image.

THIS WEEK AND NEXT WEEK DATE REFERENCE — use ONLY these exact dates when you see a day name:
${dateRef}

CRITICAL DATE RULES:
- ALWAYS use the exact DD/MM/YYYY from the reference above when you see a day name like 'Monday', 'Tuesday' etc. Do not calculate independently.
- The current year is ${currentYear}. Never output a year earlier than ${currentYear}.
- If a date is written explicitly (e.g. '3rd June') convert it to DD/MM/YYYY using the year ${currentYear}.
- If no time is listed, use empty string "". Never use "00:00".
- IMPORTANT: If a venue or day shows as 'Closed', 'N/A', 'TBA', 'TBC', 'No event', 'No service', 'None', 'Unavailable' or similar — skip it entirely. Do not include it in the output.

TRUCK AND VENUE RULES:
- Each row names a FOOD TRUCK and the VENUE it is parked at. Put the trader in "Truck Name" and the pitch in "Venue Name".
- Extract ONLY the pub/venue name into "Venue Name" — never include the village, town or postcode in it.
- Put the town or village in "Village", and the postcode, if one is shown, in "Postcode".
- UK postcodes look like "CB25 0BA", "CO10 7BQ", "PE28 2SB". If no postcode is shown, use "".

Date format MUST be "DD/MM/YYYY". Times MUST be "HH:MM".

JSON FORMAT ONLY — no markdown, no explanation:
{
  "events": [{ "DateStart": "DD/MM/YYYY", "TimeStart": "HH:MM", "TimeEnd": "HH:MM", "Truck Name": "Name", "Venue Name": "Name", "Village": "Town", "Postcode": "CB25 0BA" }]
}`
}

/** Strips the ``` fences a model sometimes adds, mirroring the Apps Script's cleanGeminiResponse (orig :132). */
export function cleanModelJson(raw: string): string {
  const bt = String.fromCharCode(96, 96, 96)
  return String(raw ?? '').replace(new RegExp(bt + 'json', 'gi'), '').replace(new RegExp(bt, 'g'), '').trim()
}

/** Parse the model's reply. Returns [] rather than throwing on unparseable JSON — the caller decides. */
export function parseScreenshotEvents(raw: string): Partial<ScreenshotEvent>[] {
  let parsed: any
  try { parsed = JSON.parse(cleanModelJson(raw)) } catch { return [] }
  const arr = Array.isArray(parsed) ? parsed : (parsed?.events ?? [])
  if (!Array.isArray(arr)) return []
  return arr.map((e: any) => ({
    event_date: String(e?.['DateStart'] ?? e?.event_date ?? '').trim(),
    start_time: String(e?.['TimeStart'] ?? e?.start_time ?? '').trim(),
    end_time: String(e?.['TimeEnd'] ?? e?.end_time ?? '').trim(),
    truck_name: String(e?.['Truck Name'] ?? e?.truck_name ?? '').trim(),
    venue_name: String(e?.['Venue Name'] ?? e?.venue_name ?? '').trim(),
    village: String(e?.['Village'] ?? e?.village ?? '').trim(),
    postcode: String(e?.['Postcode'] ?? e?.postcode ?? '').toUpperCase().trim(),
  }))
}

/**
 * The Apps Script's validEvents filter (orig :672-681), reproduced with the reconciled list — and every
 * drop is RETURNED WITH ITS REASON rather than silently discarded, so the page can show what happened.
 * 🔴 A silent drop is indistinguishable from the model not seeing the row, which is the fault this whole
 * surface exists to fix.
 */
export function filterScreenshotEvents(
  events: Partial<ScreenshotEvent>[],
  exclusionTermKeys: string[],
): { kept: ScreenshotEvent[]; dropped: DroppedEvent[] } {
  const kept: ScreenshotEvent[] = []
  const dropped: DroppedEvent[] = []
  for (const e of events) {
    if (!e.truck_name) { dropped.push({ event: e, reason: 'no truck name' }); continue }
    const hit = isExcludedTruckName(e.truck_name, exclusionTermKeys)
    if (hit) { dropped.push({ event: e, reason: `excluded: truck name matches the term "${hit}"` }); continue }
    if (isInvalidVenueName(e.venue_name)) {
      dropped.push({ event: e, reason: e.venue_name ? `invalid venue name "${e.venue_name}"` : 'no venue name' })
      continue
    }
    if (!e.event_date) { dropped.push({ event: e, reason: 'no date' }); continue }
    kept.push({
      event_date: e.event_date!, start_time: e.start_time ?? '', end_time: e.end_time ?? '',
      truck_name: e.truck_name!, venue_name: e.venue_name!, village: e.village ?? '', postcode: e.postcode ?? '',
    })
  }
  return { kept, dropped }
}

/**
 * Shape the kept events for /api/inbound-schedule.
 * 🔴 THE POSTCODE GOES INTO `ai_notes`, AND THAT IS DELIBERATE. The route strips `postcode` before the
 * discovery_events upsert (`const { postcode, ...discoveryRow } = row`) because that table has no such
 * column — so a postcode passed only as a field is DISCARDED. `ai_notes` is where the `URL:` path already
 * carries postcodes and where §14 measures them, so putting it there makes this path's postcodes readable
 * by exactly the same query. It is still passed as `postcode` as well, because truck_events uses it.
 * ⚠️ `source` is 'Admin Screenshot', NOT 'Drive Screenshot' — the two paths must stay separable in the data
 * while the Apps Script trigger is still running.
 */
export function toInboundEvents(kept: ScreenshotEvent[], fileLabel: string) {
  return kept.map(e => ({
    event_date: e.event_date,
    start_time: e.start_time || null,
    end_time: e.end_time || null,
    truck_name: e.truck_name,
    venue_name: e.venue_name,
    village: e.village || null,
    postcode: e.postcode || null,
    event_notes: null,
    source: 'Admin Screenshot',
    ai_notes: `[🖼️ Admin upload: ${fileLabel}]${e.postcode ? ` | ${e.postcode}` : ''}`,
  }))
}
