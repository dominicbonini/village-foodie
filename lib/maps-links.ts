// lib/maps-links.ts — a directions link to an event's place. Client-safe: pure helpers only.
//
// directions-link-fix (21 October 2026, docs/directions-link-fix-report.md): the event card's Google link carried a
// stray "$" and "?q=" between "destination=" and the address, so Google was asked for a place whose name began with
// them. This is the one builder, in Google's documented form
// (https://developers.google.com/maps/documentation/urls/get-started#directions-action):
//   • coordinates when the event has them ("52.2399,0.4568"), which put the pin exactly where the truck is;
//   • otherwise the address text the card already wrote (venue, area, postcode) plus the country's short name
//     ("UK", "Ireland", "US" — country_settings.short_name), so a town that exists in two countries resolves.

export interface DirectionsTarget {
  lat?: number | null
  lng?: number | null
  /** The address text, already joined by the caller ("Red Lion - Wickhambrook, CB8 8PD"). */
  query?: string | null
  /** The event's country, as `country_settings.short_name`. Absent → nothing appended. */
  countryName?: string | null
}

const isCoord = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** What Google is asked for: "lat,lng", else "query, country", else "Event Location" (the card's old fallback). */
export function directionsDestination(t: DirectionsTarget): string {
  // 0,0 is in the Gulf of Guinea, not a pitch: a stored zero is a missing coordinate (the card's own distance test
  // treats it the same way).
  if (isCoord(t.lat) && isCoord(t.lng) && !(t.lat === 0 && t.lng === 0)) return `${t.lat},${t.lng}`
  // The country only qualifies an address: with no address text it would send directions to the middle of the country.
  const query = t.query?.trim()
  if (!query) return 'Event Location'
  return [query, t.countryName?.trim()].filter(Boolean).join(', ')
}

/** Google Maps directions to the place: https://www.google.com/maps/dir/?api=1&destination=<url-encoded>. */
export function googleDirectionsUrl(t: DirectionsTarget): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(directionsDestination(t))}`
}
