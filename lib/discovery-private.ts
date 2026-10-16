// lib/discovery-private.ts — 🔴 A DISCOVERY ROW THAT IS NEVER PUBLIC (16 October 2026, docs/private-discovery-rows-report.md).
//
// A scraped schedule line that names no public place — a private booking ("Private Hire", "Private Event") or a
// generic title ("Closed", "TBC", "Event") — is not something a customer can go to. It still belongs in
// discovery_events: the email bridge turns it into the operator's own (private) truck event, and outreach counts it.
// It must never be on Village Foodie's map, lists, truck or venue pages. (The HatchGrab host's feed serves operator events
// only, never scraped rows; show_on_hg is set false too, so the row is non-public on both flags.)
//
// ONE RULE, MADE OF THE TWO THAT ALREADY EXIST — nothing new is decided here:
//   • isGenericVenueName (lib/venue-matcher, lib/generic-venue-names.json) — the title is not a place;
//   • looksPrivate (lib/private-events/detect) — the same "is it private?" test the bridge stores as truck_events.is_private
//     (the whole word "private" in the venue or the notes).
// Written by lib/discovery-gate.ts (every insert into discovery_events) and read again by app/api/discovery/events as a
// second guard, so a row stored public before this rule existed is still never served.
import { isGenericVenueName } from '@/lib/venue-matcher'
import { looksPrivate } from '@/lib/private-events/detect'
import { discoveryVisibility } from '@/lib/discovery-country'

/** True when the row names no public place: a generic title, or private by the truck_events.is_private rule. */
export function isNonPublicDiscoveryRow(row: { venue_name?: string | null; event_notes?: string | null }): boolean {
  return isGenericVenueName(row.venue_name) || looksPrivate(row.venue_name, row.event_notes)
}

/**
 * The visibility columns for a row being written in `country`.
 * 🔴 NON-PUBLIC IS ALL THREE COLUMNS, WITH VALUES THEY ALREADY HOLD: `visibility` 'hidden' (one of the CHECK's
 * 'public' | 'hg_only' | 'hidden') AND `show_on_vf` / `show_on_hg` false. The two booleans are what the feed actually
 * filters on (`visibility` is not read by any public surface); 'hidden' keeps the legacy column truthful.
 * Otherwise unchanged: 'public' with the country's own flags (only Village Foodie's market is ever shown).
 */
export function discoveryRowVisibility(
  row: { venue_name?: string | null; event_notes?: string | null }, country: string,
): { visibility: 'public' | 'hidden'; show_on_vf: boolean; show_on_hg: boolean } {
  if (isNonPublicDiscoveryRow(row)) return { visibility: 'hidden', show_on_vf: false, show_on_hg: false }
  return { visibility: 'public', ...discoveryVisibility(country) }
}
