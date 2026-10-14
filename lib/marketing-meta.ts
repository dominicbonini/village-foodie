// lib/marketing-meta.ts — 🔴 HOW A MARKETING PAGE'S SEARCH AND SHARE TAGS NAME THE VISITOR'S COUNTRY (US readiness
// sweep, D37; docs/us-readiness-sweep-report.md).
//
// PURE. The landing and /features titles, descriptions, Open Graph and Twitter tags, and the landing's JSON-LD,
// name the country the visitor resolved to (lib/visitor-country.ts) from its country_settings row. For GB every
// value is the literal the pages carried before ("UK", "United Kingdom", en-GB, en_GB) — proven byte-identical by
// scripts/us-readiness.cjs and scripts/marketing-country-parity.cjs.
import type { CountrySettings } from '@/lib/country-settings-types'

export interface MarketingCountry {
  /** Inside a sentence and after the brand: "UK" / "US" (short_name, else the full name). */
  short: string
  /** The full name, for schema.org areaServed: "United Kingdom" / "United States". */
  name: string
  /** BCP 47, for JSON-LD inLanguage: "en-GB" / "en-US". */
  lang: string
  /** Open Graph's form of the same locale: "en_GB" / "en_US". */
  ogLocale: string
}

export function marketingCountry(s: Pick<CountrySettings, 'shortName' | 'name' | 'locale'>): MarketingCountry {
  return { short: s.shortName ?? s.name, name: s.name, lang: s.locale, ogLocale: s.locale.replace('-', '_') }
}
