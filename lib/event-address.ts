// lib/event-address.ts — an event's address line, with its state when one is known. Client-safe: pure helpers only.
//
// 19 October 2026 (US dress rehearsal Finding 6): a US event read "Pier A Park, Hoboken, 07030" because no event
// carried a state. `truck_events.region` (20261019_truck_events_region.sql — NOT APPLIED until Dominic runs it) holds
// the two-letter state, saved only by the US (zip_state) Add/Edit event form and the importer's `state`.
// 🔴 A STATE IS NEVER INVENTED: not from the truck's base town, not from a guess. No region → the line is EXACTLY
// the join every caller wrote before ([venue, town, postcode] with ", "), so every GB line is byte-identical.

/** A stored region as written on a line: two letters, upper-cased; anything else is no region. */
export const normaliseRegion = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim().toUpperCase() : ''
  return /^[A-Z]{2}$/.test(s) ? s : null
}

export interface EventAddressParts {
  venueName?: string | null
  town?: string | null
  region?: string | null
  postcode?: string | null
}

/** "Pier A Park, Hoboken, NJ 07030" with a state; without one, `[venue, town, postcode].filter(Boolean).join(', ')`. */
export function eventAddressLine(p: EventAddressParts): string {
  const region = normaliseRegion(p.region)
  if (!region) return [p.venueName, p.town, p.postcode].filter(Boolean).join(', ')
  return [p.venueName, p.town, [region, p.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ')
}

/** The line under a venue on an event card: "Hoboken, NJ 07030". Null without a state — the card keeps its own line. */
export function eventAreaLineWithRegion(p: Omit<EventAddressParts, 'venueName'>): string | null {
  const region = normaliseRegion(p.region)
  if (!region) return null
  return [p.town, [region, p.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ')
}
