// lib/i18n/locales.ts — 🔴 THE ONE LANGUAGE RESOLVER (Language Phase 0, docs/language-phase-0-report.md §1).
//
// PURE AND CLIENT-SAFE. Which message file a screen, ticket, email or PDF reads:
//   • a truck's own surfaces (Manage, dashboard, KDS, tickets, setup, its emails) and its customers' (the order
//     page, confirmation and status) → the truck's COUNTRY's `country_settings.locale`;
//   • marketing pages → the visitor's resolved country (lib/visitor-country.ts) → its locale;
//   • anything unknown, missing or not yet supported → en-GB.
// There is no language column and no truck-level override yet (docs/language-readiness-audit-report.md §3).
// ⚠️ en-GB, en-US, en-IE, en-AU, en-NZ AND en-CA ARE VALID TODAY. A new locale is added here, in lib/i18n/messages.ts (OVERRIDES), in
// scripts/split-messages.cjs (OVERRIDE_FILES) and as messages/<locale>.json — each an override merged over en-GB.
// ireland-1 (20 October 2026): en-IE is a SPARSE override — only the few sentences whose English frame needs another
// shape for Ireland ("in Ireland", not "in the Ireland"); everything else is en-GB.

// anz-1 (21 October 2026): en-AU and en-NZ, sparse overrides on en-GB like en-IE.
// canada-1 (22 October 2026, docs/canada-1-report.md §4): en-CA, a sparse override written over en-US (LOCALE_PARENT).
export const LOCALES = ['en-GB', 'en-US', 'en-IE', 'en-AU', 'en-NZ', 'en-CA'] as const
export type AppLocale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: AppLocale = 'en-GB'

/** canada-1: the override a locale is WRITTEN OVER, when it is not en-GB itself. Canadian English shares US usage — truck,
 *  pickup, window, cart, -ize — and differs in a short list (colour, centre, cancelled, "in {country}", postal code), so
 *  messages/en-CA.json holds only that list and is merged over en-US, which is merged over en-GB. Every other locale has no
 *  parent: its chain is itself alone, exactly as before. */
export const LOCALE_PARENT: Partial<Record<AppLocale, AppLocale>> = { 'en-CA': 'en-US' }

/** The override files a locale reads, outermost last: [] for en-GB, ['en-US'] for en-US, ['en-US', 'en-CA'] for en-CA. */
export function overrideChain(locale: AppLocale): AppLocale[] {
  if (locale === DEFAULT_LOCALE) return []
  const parent = LOCALE_PARENT[locale]
  return parent ? [...overrideChain(parent), locale] : [locale]
}

/** A BCP 47 tag (or nothing) → a supported locale. Exact match only; everything else is en-GB. */
export function resolveLocale(tag: string | null | undefined): AppLocale {
  return (LOCALES as readonly string[]).includes(tag ?? '') ? (tag as AppLocale) : DEFAULT_LOCALE
}

/** A country's settings (or a truck's TimeSettings, which carry the same locale) → its supported locale. */
export const localeOfCountry = (s: { locale?: string | null } | null | undefined): AppLocale => resolveLocale(s?.locale)
