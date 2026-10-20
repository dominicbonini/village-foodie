// lib/marketing-meta.ts — 🔴 HOW A MARKETING PAGE'S SEARCH AND SHARE TAGS NAME THE VISITOR'S COUNTRY (US readiness
// sweep, D37; docs/us-readiness-sweep-report.md).
//
// PURE. The landing and /features titles, descriptions, Open Graph and Twitter tags, and the landing's JSON-LD,
// name the country the visitor resolved to (lib/visitor-country.ts) from its country_settings row. For GB every
// value is the literal the pages carried before ("UK", "United Kingdom", en-GB, en_GB) — proven byte-identical by
// scripts/us-readiness.cjs and scripts/marketing-country-parity.cjs.
import type { CountrySettings } from '@/lib/country-settings-types'
import { HATCHGRAB_ORIGIN, ROUTER_PATH, countryPagePath, type MarketingPage } from '@/lib/marketing-country'

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

// ══ 🔴 A COUNTRY PAGE'S ADDRESSES (Language Phase 1e) ══════════════════════════════════════════════════════
// /uk, /us/features, … (app/[country]/…). canonical and og:url are the page's OWN country address; hreflang names
// every switched-on country that has an address (its locale → its address: en-GB → /uk…, en-US → /us…) plus
// x-default → the router address of the same page ('/', '/features', '/compare'), which sends a visitor to theirs.
// One host throughout — HATCHGRAB_ORIGIN, the www host app/layout.tsx's metadataBase also names.
// ⚠️ A switched-off country is not in `alternates` (lib/visitor-country.ts builds it from the switched-on list), so
// it never appears in hreflang — its address 302s to the GB page.
export function countryPageAlternates(page: MarketingPage, code: string, alternates: { code: string; locale: string }[]):
  { canonical: string; languages: Record<string, string> } {
  const url = (c: string) => HATCHGRAB_ORIGIN + countryPagePath(c, page)
  const languages: Record<string, string> = {}
  for (const a of alternates) if (countryPagePath(a.code, page)) languages[a.locale] = url(a.code)
  languages['x-default'] = HATCHGRAB_ORIGIN + ROUTER_PATH[page]
  return { canonical: url(code), languages }
}

/**
 * seo-fixes S5 (20 October 2026): the date the country landing and /features COPY last changed (Stage B rebuilt both on
 * 20 October 2026). The sitemap's lastmod for those pages is the later of this and the plan data they show
 * (lib/plans-server.ts planDataUpdatedAt) and the country's settings row. 🔴 MOVE IT WHEN THAT COPY CHANGES — the same
 * discipline as lib/legal.ts's *_UPDATED dates.
 */
export const MARKETING_COPY_UPDATED = '2026-10-20'
