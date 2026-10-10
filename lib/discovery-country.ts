// lib/discovery-country.ts — the country rules for discovery data (Phase 2D-2 Part A,
// docs/schedules-country-report.md). Client-safe: constants and pure helpers only.
//
// 🔴 ONE COUNTRY PER ROW, AND MATCHING NEVER CROSSES IT. discovery_trucks, venues, discovery_events and
// discovery_exclusion_terms each carry `country` (20261010_15). A truck, a venue, an exclusion term or a
// HatchGrab link is only ever compared with rows of the SAME country — so a US "Pizzeria Gusto" can never
// attach to, bridge into or email the UK one.
// 🔴 VILLAGE FOODIE IS UK-ONLY. It shows rows of its market (MARKETING_COUNTRY) and nothing else; every row
// written for any other country is hidden on both sites (show_on_vf = show_on_hg = false) and feeds outreach.
import { MARKETING_COUNTRY } from '@/lib/marketing-country'

/** The column default (20261010_15): the automated UK sources write without a country. */
export const DISCOVERY_DEFAULT_COUNTRY = 'GB'
/** The one market Village Foodie serves. */
export const VILLAGE_FOODIE_COUNTRY = MARKETING_COUNTRY

/** A row's country — a row read before 20261010_15 (or a fixture without the column) is the default. */
export const countryOf = (row: { country?: string | null } | null | undefined): string =>
  (row?.country || DISCOVERY_DEFAULT_COUNTRY).toUpperCase()

export const inCountry = <T extends { country?: string | null }>(rows: T[], country: string): T[] =>
  rows.filter(r => countryOf(r) === country.toUpperCase())

/** A code as sent by a caller: two letters, upper-cased; anything else is the default. */
export const normaliseCountry = (v: unknown): string => {
  const s = typeof v === 'string' ? v.trim().toUpperCase() : ''
  return /^[A-Z]{2}$/.test(s) ? s : DISCOVERY_DEFAULT_COUNTRY
}

/** Visibility for a row written in `country`: only Village Foodie's own market is ever public. */
export const discoveryVisibility = (country: string): { show_on_vf: boolean; show_on_hg: boolean } =>
  country.toUpperCase() === VILLAGE_FOODIE_COUNTRY ? { show_on_vf: true, show_on_hg: true } : { show_on_vf: false, show_on_hg: false }
