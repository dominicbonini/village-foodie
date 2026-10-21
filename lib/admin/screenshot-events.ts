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
  /** Two-letter state, for a zip_state country (Phase 2D-2). Present only when the model gave one. */
  state?: string
}

/** The country the admin chose, as the prompt needs it (Phase 2D-2) — from country_settings, never guessed. */
export type ScreenshotCountry = {
  code: string
  name: string
  addressFormat: 'postcode' | 'zip_state'
  dateOrder: 'dmy' | 'mdy'
}

/** What the model says about the screenshot's own country (once per screenshot). */
export type CountryVerdict = { country: string | null; confidence: 'high' | 'medium' | 'low' | null; reasons: string }

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
export function buildScreenshotPrompt(now: Date = new Date(), country?: ScreenshotCountry): string {
  const currentYear = now.getFullYear()
  const dateRef = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now.getTime() + i * 86400000)
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()]
    return `${dayName} = ${dd}/${mm}/${d.getFullYear()}`
  }).join('\n')

  // ── 🔴 PHASE 2D-2: THE CHOSEN COUNTRY. With no country the prompt is exactly what it always was. ──────────
  // GB keeps every line below byte for byte and gains only TWO things (Dominic, Q1 option A): the one line
  // naming the chosen country, and Country / CountryConfidence / CountryReasons in the JSON. A zip_state
  // country swaps the location lines for city / state / ZIP ones; an mdy country adds one line saying how a
  // numbers-only date reads. Output stays DD/MM/YYYY in every country — it is the data contract.
  const zip = country?.addressFormat === 'zip_state'
  // ireland-1 (20 October 2026): a 'postcode' country that is not the UK (Ireland) names its own postal codes instead of
  // the UK's — no UK examples. No country, or GB, keeps the UK lines byte for byte.
  const otherPostcode = !zip && !!country && country.code.toUpperCase() !== 'GB'
  const countryLine = country
    ? `These screenshots are from ${country.name} (${country.code}), as the person uploading them says. In "Country" give the two-letter code of the country this screenshot itself shows — from its prices, place names, phone numbers and the way dates are written — with "CountryConfidence" high, medium or low, and "CountryReasons" in a few short words (e.g. "prices in $, 'Austin, TX', dates like 10/12").
`
    : ''
  const mdyLine = country?.dateOrder === 'mdy'
    ? `- Dates written with numbers only are MONTH first in ${country.name}: "10/12" is 12 October, never 10 December.
`
    : ''
  const locationLines = zip
    ? `- Extract ONLY the venue name into "Venue Name" — never include the city, state or ZIP code in it.
- Put the city or town in "Village", the two-letter state in "State" (e.g. "TX"), and the ZIP code, if one is shown, in "Postcode".
- ZIP codes look like "78701". If no ZIP code is shown, use "".`
    : otherPostcode
      ? `- Extract ONLY the pub/venue name into "Venue Name" — never include the village, town or postal code in it.
- Put the town or village in "Village", and the postal code, if one is shown, in "Postcode".
- "Postcode" is a postal code of ${country!.name}, copied exactly as shown — never a UK postcode. If none is shown, use "".`
      : `- Extract ONLY the pub/venue name into "Venue Name" — never include the village, town or postcode in it.
- Put the town or village in "Village", and the postcode, if one is shown, in "Postcode".
- UK postcodes look like "CB25 0BA", "CO10 7BQ", "PE28 2SB". If no postcode is shown, use "".`
  const eventShape = zip
    ? `{ "DateStart": "DD/MM/YYYY", "TimeStart": "HH:MM", "TimeEnd": "HH:MM", "Truck Name": "Name", "Venue Name": "Name", "Village": "City", "State": "TX", "Postcode": "78701" }`
    : otherPostcode
      ? `{ "DateStart": "DD/MM/YYYY", "TimeStart": "HH:MM", "TimeEnd": "HH:MM", "Truck Name": "Name", "Venue Name": "Name", "Village": "Town", "Postcode": "POSTAL CODE" }`
      : `{ "DateStart": "DD/MM/YYYY", "TimeStart": "HH:MM", "TimeEnd": "HH:MM", "Truck Name": "Name", "Venue Name": "Name", "Village": "Town", "Postcode": "CB25 0BA" }`
  const countryFields = country ? `  "Country": "${country.code}", "CountryConfidence": "high|medium|low", "CountryReasons": "short words",
` : ''

  return `CRITICAL CONTEXT: Today is ${now.toDateString()}.
Extract the food truck schedule from this image.
${countryLine}
THIS WEEK AND NEXT WEEK DATE REFERENCE — use ONLY these exact dates when you see a day name:
${dateRef}

CRITICAL DATE RULES:
- ALWAYS use the exact DD/MM/YYYY from the reference above when you see a day name like 'Monday', 'Tuesday' etc. Do not calculate independently.
- The current year is ${currentYear}. Never output a year earlier than ${currentYear}.
- If a date is written explicitly (e.g. '3rd June') convert it to DD/MM/YYYY using the year ${currentYear}.
- If no time is listed, use empty string "". Never use "00:00".
- IMPORTANT: If a venue or day shows as 'Closed', 'N/A', 'TBA', 'TBC', 'No event', 'No service', 'None', 'Unavailable' or similar — skip it entirely. Do not include it in the output.
${mdyLine}
TRUCK AND VENUE RULES:
- Each row names a FOOD TRUCK and the VENUE it is parked at. Put the trader in "Truck Name" and the pitch in "Venue Name".
${locationLines}

Date format MUST be "DD/MM/YYYY". Times MUST be "HH:MM".

OUTPUT LANGUAGE: copy truck names, venue names and towns exactly as the screenshot writes them — never translate them. Write anything else (e.g. "CountryReasons") in English.

JSON FORMAT ONLY — no markdown, no explanation:
{
${countryFields}  "events": [${eventShape}]
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
    // Only when the model gave one, so a GB row's shape is exactly what it was.
    ...(() => { const st = String(e?.['State'] ?? e?.state ?? '').toUpperCase().trim(); return /^[A-Z]{2}$/.test(st) ? { state: st } : {} })(),
  }))
}

/** The model's verdict on the screenshot's own country (Phase 2D-2). Unreadable or absent → no verdict,
 *  which is never a hold. */
export function parseCountryVerdict(raw: string): CountryVerdict {
  const none: CountryVerdict = { country: null, confidence: null, reasons: '' }
  let p: unknown
  try { p = JSON.parse(cleanModelJson(raw)) } catch { return none }
  if (!p || typeof p !== 'object' || Array.isArray(p)) return none
  const parsed = p as Record<string, unknown>
  const code = String(parsed.Country ?? '').trim().toUpperCase()
  const conf = String(parsed.CountryConfidence ?? '').trim().toLowerCase()
  const reasons = String(parsed.CountryReasons ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
  return {
    country: /^[A-Z]{2}$/.test(code) ? code : null,
    confidence: conf === 'high' || conf === 'medium' || conf === 'low' ? conf : null,
    reasons,
  }
}

/** 🔴 THE HOLD RULE: a CONFIDENT mismatch only. Low confidence, no answer, or the same country goes through. */
export function shouldHoldForCountry(chosen: string, v: CountryVerdict): boolean {
  return !!v.country && v.country !== chosen.toUpperCase() && (v.confidence === 'high' || v.confidence === 'medium')
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
      ...(e.state ? { state: e.state } : {}),
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
    // The state, for a US venue this event creates (venues.region). Only when there is one.
    ...(e.state ? { region: e.state } : {}),
    event_notes: null,
    source: 'Admin Screenshot',
    ai_notes: `[🖼️ Admin upload: ${fileLabel}]${e.postcode ? ` | ${e.postcode}` : ''}`,
  }))
}
