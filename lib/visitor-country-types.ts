// lib/visitor-country-types.ts — the country menu's props (Phase 2D-1). Client-safe: names and a flag image only,
// never a settings row.
// country-picker-1 (23 October 2026): `ownName` is the country's name IN ITS OWN LANGUAGE (Intl, in the row's locale —
// "Deutschland", "Ελλάδα", "United Kingdom"), and `lang` that locale, for the picker's list; `name` stays English (the
// list is sorted by it, so the order is the same for everyone).
export interface VisitorCountryOption { code: string; name: string; shortName: string; ownName: string; lang: string; flag: string | null }
export interface VisitorCountryMenu { current: VisitorCountryOption; options: VisitorCountryOption[]; remember: string | null }

/** The cookie a visitor's choice is kept in. Read on the server (lib/visitor-country.ts), written by the menu. */
export const VISITOR_COUNTRY_COOKIE = 'hg_country'
export const VISITOR_COUNTRY_MAX_AGE = 60 * 60 * 24 * 365
