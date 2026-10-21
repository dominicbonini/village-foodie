// lib/event-address.ts — an event's address line, with its state when one is known. Client-safe: pure helpers only.
//
// 19 October 2026 (US dress rehearsal Finding 6): a US event read "Pier A Park, Hoboken, 07030" because no event
// carried a state. `truck_events.region` (20261019_truck_events_region.sql — NOT APPLIED until Dominic runs it) holds
// the two-letter state, saved only by the US (zip_state) Add/Edit event form and the importer's `state`.
// 🔴 A STATE IS NEVER INVENTED: not from the truck's base town, not from a guess. No region → the line is EXACTLY
// the join every caller wrote before ([venue, town, postcode] with ", "), so every GB line is byte-identical.
//
// ── address-formats-1 (21 October 2026, docs/address-formats-1-report.md) ──────────────────────────────────────────
// 🔴 EVERY LINE COMES FROM THE EVENT'S ADDRESS FORMAT (lib/address-formats.ts): its templates and its region list. A
// caller passes the format key (or a legacy 'postcode' / 'zip_state'); the GB and US formats write exactly what these
// functions wrote before (scripts/address-formats-1.cjs pins every GB/US output against a snapshot of the old code).
// With NO format — a caller or a cached payload from before this stage — each function keeps its old behaviour, byte
// for byte (the `legacy…` paths below), so nothing changes until a format arrives.
import { addressFormatOf, regionDisplay, regionOf, renderTemplate, renderFirst, type AddressFormat, type TemplateValues } from '@/lib/address-formats'

/** The old rule, kept for callers with no format: two letters, upper-cased; anything else is no region. */
const legacyRegion = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim().toUpperCase() : ''
  return /^[A-Z]{2}$/.test(s) ? s : null
}

/** A stored or typed region, as its code in the format's own region list ("nsw" → "NSW", "Kerry" → "KY"); null when
 *  the format has no list or the value is not in it. With no format: the old rule (two letters, upper-cased). */
export const normaliseRegion = (v: unknown, format?: unknown): string | null => {
  const f = addressFormatOf(format)
  return f ? (regionOf(f, v)?.code ?? null) : legacyRegion(v)
}

export interface EventAddressParts {
  venueName?: string | null
  town?: string | null
  /** A dependent locality (NZ "Ponsonby"); no column holds it yet (stage 3), so only a caller that has one passes it. */
  suburb?: string | null
  region?: string | null
  postcode?: string | null
}

const valuesOf = (p: EventAddressParts, f: AddressFormat): TemplateValues => ({
  venue: p.venueName, locality: p.town, suburb: p.suburb, region: regionDisplay(f, p.region), postalCode: p.postcode,
})

/** "Pier A Park, Hoboken, NJ 07030" with a state; without one, `[venue, town, postcode].filter(Boolean).join(', ')`.
 *  With a format: its `line` template ("Bondi Pavilion, Bondi Beach NSW 2026"). Leave `postcode` out where a line never
 *  had one (the operator's text email, the cancellation email). */
export function eventAddressLine(p: EventAddressParts, format?: unknown): string {
  const f = addressFormatOf(format)
  if (f) return renderTemplate(f.templates.line, valuesOf(p, f))
  const region = legacyRegion(p.region)
  if (!region) return [p.venueName, p.town, p.postcode].filter(Boolean).join(', ')
  return [p.venueName, p.town, [region, p.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ')
}

/** The line under a venue on an event card: "Hoboken, NJ 07030". Null without a state — the card keeps its own line.
 *  ⚠️ The old helper, unchanged (it ignores any format): callers with a format use `eventAreaLine`. */
export function eventAreaLineWithRegion(p: Omit<EventAddressParts, 'venueName'>): string | null {
  const region = legacyRegion(p.region)
  if (!region) return null
  return [p.town, [region, p.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ')
}

/** The whole area line on an event card ('' when there is nothing to show). With a format: its first `area`
 *  alternative that qualifies ("Bondi Beach NSW 2026", "Hoboken, NJ 07030", "Castle Hedingham · CO9 3EJ"). Without:
 *  the card's old rule — the state line, else town · postcode. */
export function eventAreaLine(p: Omit<EventAddressParts, 'venueName'>, format?: unknown): string {
  const f = addressFormatOf(format)
  if (f) return renderFirst(f.templates.area, valuesOf(p, f))
  return eventAreaLineWithRegion(p) ?? [p.town, p.postcode].filter(Boolean).join(' · ')
}

/** A calendar invite's location. With a format: its `calendar` template. Without: the old join (no state). */
export function eventCalendarLine(p: EventAddressParts, format?: unknown): string {
  const f = addressFormatOf(format)
  if (f) return renderTemplate(f.templates.calendar, valuesOf(p, f))
  return [p.venueName, p.town, p.postcode].filter(Boolean).join(', ')
}
