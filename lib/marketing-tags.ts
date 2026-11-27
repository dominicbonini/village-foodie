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

/** compare-cache-1 (Dominic, 27 November 2026; docs/compare-cache-1-report.md): ONE COUNTRY'S COMPARISON PAGE and its .md / .json twins —
 *  `comparison-GB`. The comparison pages are cached for 30 days and carry ONLY this tag (never marketing-countries, so a migration
 *  refreshes none of them). Expired by the publish step for the countries whose page changed in that run, and by an Admin › Countries
 *  save for the country it saved. /api/revalidate accepts it (same secret). */
export type ComparisonTag = `comparison-${string}`
export const comparisonTag = (code: string): ComparisonTag => `comparison-${code.trim().toUpperCase()}`
export const isComparisonTag = (t: unknown): t is ComparisonTag => typeof t === 'string' && /^comparison-[A-Z]{2}$/.test(t)
/** Every tag /api/revalidate accepts: the three marketing tags and any country's comparison tag. */
export type RefreshTag = MarketingTag | ComparisonTag
export const isRefreshTag = (t: unknown): t is RefreshTag => isMarketingTag(t) || isComparisonTag(t)
/** The most tags one request may name: the marketing tags and one per country code (there are fewer than 300). */
export const MAX_REFRESH_TAGS = 300
/** compare-cache-1: how long a comparison page is kept when nothing refreshes it — 30 days (the page's own `revalidate`). */
export const COMPARISON_REVALIDATE_SECONDS = 2592000
/** The cached data's expiry. perf-1 had 300 seconds (a change made where nothing calls the endpoint — the Supabase dashboard — showed
 *  within 5 minutes). vercel-cost-1 (23 November 2026, docs/vercel-cost-1-report.md): NONE. A numeric expiry here also shortened the
 *  pages' own (unstable_cache lowers the page's revalidate to it), and the 5-minute rebuilds were a third of the Vercel bill. The data
 *  and the pages are kept until a tag is expired: an app write (revalidateMarketing), the FAQ translator and the competitor check
 *  (POST /api/revalidate), scripts/db-migrate.cjs after a migration, or by hand: `node scripts/revalidate-pages.cjs`. */
export const MARKETING_REVALIDATE = false
