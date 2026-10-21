// lib/i18n/locales.ts — 🔴 THE ONE LANGUAGE RESOLVER (Language Phase 0, docs/language-phase-0-report.md §1).
//
// PURE AND CLIENT-SAFE. Which message file a screen, ticket, email or PDF reads:
//   • a truck's own surfaces (Manage, dashboard, KDS, tickets, setup, its emails) and its customers' (the order
//     page, confirmation and status) → the truck's COUNTRY's `country_settings.locale`;
//   • marketing pages → the visitor's resolved country (lib/visitor-country.ts) → its locale;
//   • anything unknown, missing or not yet supported → en-GB.
// There is no language column and no truck-level override yet (docs/language-readiness-audit-report.md §3).
// ⚠️ en-GB, en-US, en-IE, en-AU AND en-NZ ARE VALID TODAY. A new locale is added here, in lib/i18n/messages.ts (OVERRIDES), in
// scripts/split-messages.cjs (OVERRIDE_FILES) and as messages/<locale>.json — each an override merged over en-GB.
// ireland-1 (20 October 2026): en-IE is a SPARSE override — only the few sentences whose English frame needs another
// shape for Ireland ("in Ireland", not "in the Ireland"); everything else is en-GB.

// anz-1 (21 October 2026): en-AU and en-NZ, sparse overrides on en-GB like en-IE.
export const LOCALES = ['en-GB', 'en-US', 'en-IE', 'en-AU', 'en-NZ'] as const
export type AppLocale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: AppLocale = 'en-GB'

/** A BCP 47 tag (or nothing) → a supported locale. Exact match only; everything else is en-GB. */
export function resolveLocale(tag: string | null | undefined): AppLocale {
  return (LOCALES as readonly string[]).includes(tag ?? '') ? (tag as AppLocale) : DEFAULT_LOCALE
}

/** A country's settings (or a truck's TimeSettings, which carry the same locale) → its supported locale. */
export const localeOfCountry = (s: { locale?: string | null } | null | undefined): AppLocale => resolveLocale(s?.locale)
