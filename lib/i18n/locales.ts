// lib/i18n/locales.ts — 🔴 THE ONE LANGUAGE RESOLVER, AND THE ONE LIST OF LOCALES (Language Phase 0, docs/language-phase-0-report.md §1;
// languages-1, 22 October 2026, docs/languages-1-report.md §1).
//
// PURE AND CLIENT-SAFE. Which message file a screen, ticket, email or PDF reads:
//   • a truck's own surfaces (Manage, dashboard, KDS, tickets, setup, its emails) and its customers' (the order
//     page, confirmation and status) → the truck's COUNTRY's `country_settings.locale`;
//   • marketing pages → the visitor's resolved country (lib/visitor-country.ts) → its locale;
//   • anything unknown, missing or not yet supported → en-GB.
// There is no language column and no truck-level override yet (docs/language-readiness-audit-report.md §3): ONE language
// per country (Dominic, 22 October 2026).
//
// 🔴 languages-1: THIS FILE IS THE ONLY LIST. scripts/split-messages.cjs reads LOCALES, LOCALE_PARENT and LANGUAGE_BASES from
// it (and generates lib/i18n/locale-files.ts, which lib/i18n/messages.ts loads), so a new locale is: its line here and its
// messages/<locale>.json — nothing else (docs/i18n/add-a-country.md).
//   • An ENGLISH locale (en-US, en-IE, en-AU, en-NZ, en-CA) is a SPARSE override of en-GB (or of LOCALE_PARENT's locale): only
//     the sentences whose English differs.
//   • A NON-ENGLISH locale (e.g. fr-FR) is a FULL BASE file of its own — listed in LANGUAGE_BASES. en-GB is only its LAST
//     RESORT for a key it lacks, and scripts/translation-check.cjs lists every such key so none ships unnoticed. In the
//     browser its words load only when a page is in that language (lib/i18n/registry.ts); English pages never carry them.
// ireland-1 (20 October 2026): en-IE is a SPARSE override — only the few sentences whose English frame needs another
// shape for Ireland ("in Ireland", not "in the Ireland"); everything else is en-GB.

// anz-1 (21 October 2026): en-AU and en-NZ, sparse overrides on en-GB like en-IE.
// canada-1 (22 October 2026, docs/canada-1-report.md §4): en-CA, a sparse override written over en-US (LOCALE_PARENT).
// france-1 (22 October 2026): fr-FR, the first language base — a full file of its own (messages/fr-FR.json).
// europe-settings (22 October 2026): en-MT and en-GI, sparse English overrides written over en-IE (LOCALE_PARENT) — Malta and
// Gibraltar go live in English.
// europe-languages-1 (22 October 2026): German — de-DE, a full base; de-AT and de-CH sparse overrides over it, de-LI over de-CH
// (Liechtenstein writes as Switzerland does). Then es-ES (Spain), it-IT (Italy) and pt-PT (Portugal), full bases; nl-NL (the
// Netherlands) with nl-BE (Belgium's primary language, Flemish) a sparse override over it; sv-SE (Sweden); da-DK (Denmark); nb-NO (Norway, Bokmål).
// europe-languages-2 (23 October 2026): pl-PL (Poland), cs-CZ (Czechia), sk-SK (Slovakia), hu-HU (Hungary), ro-RO (Romania), hr-HR
// (Croatia), sl-SI (Slovenia), fi-FI (Finland), et-EE (Estonia), lv-LV (Latvia), lt-LT (Lithuania), el-GR (Greece) with el-CY
// (Cyprus) a sparse override over it, and bg-BG (Bulgaria) — full bases, each added here as its translation is merged.
// admin-countries-1 (23 October 2026): fr-LU (Luxembourg), a sparse override over fr-FR — its +352 phone example, .lu example
// addresses and Luxembourg sample places; its TVA (3 %, food and restaurant services) is data on the `lu` address format.
export const LOCALES = ['en-GB', 'en-US', 'en-IE', 'en-AU', 'en-NZ', 'en-CA', 'fr-FR', 'en-MT', 'en-GI', 'de-DE', 'de-AT', 'de-CH', 'de-LI', 'es-ES', 'it-IT', 'pt-PT', 'nl-NL', 'nl-BE', 'sv-SE', 'da-DK', 'nb-NO', 'pl-PL', 'cs-CZ', 'hu-HU', 'sk-SK', 'ro-RO', 'hr-HR', 'sl-SI', 'fi-FI', 'et-EE', 'lv-LV', 'lt-LT', 'el-GR', 'el-CY', 'bg-BG', 'fr-LU'] as const
export type AppLocale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: AppLocale = 'en-GB'

/** canada-1: the override a locale is WRITTEN OVER, when it is not en-GB itself. Canadian English shares US usage — truck,
 *  pickup, window, cart, -ize — and differs in a short list (colour, centre, cancelled, "in {country}", postal code), so
 *  messages/en-CA.json holds only that list and is merged over en-US, which is merged over en-GB. Every other locale has no
 *  parent: its chain is itself alone, exactly as before. (languages-1: a regional variant of a language — fr-BE, de-AT — is
 *  written over its language's base the same way.) */
export const LOCALE_PARENT: Partial<Record<AppLocale, AppLocale>> = { 'en-CA': 'en-US', 'en-MT': 'en-IE', 'en-GI': 'en-IE', 'de-AT': 'de-DE', 'de-CH': 'de-DE', 'de-LI': 'de-CH', 'nl-BE': 'nl-NL', 'el-CY': 'el-GR', 'fr-LU': 'fr-FR' }

/** languages-1: the NON-ENGLISH locales — each a full base file (see the header). france-1: fr-FR (France's country row decides when anyone sees it); a country
 *  prompt adds its locale here (docs/i18n/add-a-country.md). */
export const LANGUAGE_BASES: readonly AppLocale[] = ['fr-FR', 'de-DE', 'es-ES', 'it-IT', 'pt-PT', 'nl-NL', 'sv-SE', 'da-DK', 'nb-NO', 'pl-PL', 'cs-CZ', 'hu-HU', 'sk-SK', 'ro-RO', 'hr-HR', 'sl-SI', 'fi-FI', 'et-EE', 'lv-LV', 'lt-LT', 'el-GR', 'bg-BG']

/** The override files a locale reads, outermost last: [] for en-GB, ['en-US'] for en-US, ['en-US', 'en-CA'] for en-CA,
 *  ['fr-FR'] for a language base (merged over en-GB, which is then only its fallback). */
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

/** languages-1: a locale's language — "en", "fr", "de" — the key the glossary and the allergen-guard word lists are filed
 *  under. Any tag, supported or not (an unknown tag still has a language). */
export function languageOf(tag: string | null | undefined): string {
  return String(tag ?? '').trim().split(/[-_]/)[0].toLowerCase() || 'en'
}

/** languages-1: true for English — every rule that stays exactly as it was (hand-built English ordinals and short months,
 *  the English allergen guard) asks this. */
export const isEnglish = (tag: string | null | undefined): boolean => languageOf(tag) === 'en'

/** languages-1: true when the locale (or a locale in its chain) is a non-English base — its words load lazily in the
 *  browser. */
export function isLanguageBase(tag: string | null | undefined): boolean {
  const l = resolveLocale(tag)
  return overrideChain(l).some(x => (LANGUAGE_BASES as readonly string[]).includes(x))
}
