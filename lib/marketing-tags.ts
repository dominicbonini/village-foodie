// lib/marketing-tags.ts — perf-1 (5 November 2026, docs/perf-1-report.md): THE CACHE TAGS OF THE MARKETING PAGES' DATA, and the one
// allow-list /api/revalidate accepts. PURE (no import), so the endpoint, the cached readers and the tests share one list.
//   marketing-countries  country_settings — the country list, its switches (on/off), locales, comparison status and app flags
//   marketing-plans      plans, plan_prices, plan_features — the plan catalogue
//   marketing-faq        faq_sections, faq_items, faq_translations — the published FAQ and its translations
// A resolved FAQ page (per country) and the FAQ pages' hreflang set depend on all three, so they carry all three.
export const MARKETING_TAGS = {
  countries: 'marketing-countries',
  plans: 'marketing-plans',
  faq: 'marketing-faq',
} as const
export type MarketingTag = (typeof MARKETING_TAGS)[keyof typeof MARKETING_TAGS]
export const MARKETING_TAG_LIST: readonly MarketingTag[] = Object.values(MARKETING_TAGS)
export const isMarketingTag = (t: unknown): t is MarketingTag => typeof t === 'string' && (MARKETING_TAG_LIST as readonly string[]).includes(t)
/** The cached data's expiry: a change made where nothing calls the endpoint (the Supabase dashboard) shows within 5 minutes. */
export const MARKETING_REVALIDATE_SECONDS = 300
