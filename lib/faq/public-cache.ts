// lib/faq/public-cache.ts — perf-1 (5 November 2026, docs/perf-1-report.md): THE PUBLIC FAQ'S READS IN THE MARKETING PAGES' TAGGED
// SHARED CACHE (lib/marketing-cache.ts — the same rules: Next 16 data cache, tagged, 5-minute expiry, expired at once on a write, keyed
// by country and locale only, never a failed read). In lib/faq so that the country and plan readers never pull the FAQ code in.
// Read only by lib/faq/public.ts, and only while a marketing page is rendering (lib/marketing-render.ts).
import 'server-only'
import { shared } from '@/lib/marketing-cache'
import { MARKETING_TAGS } from '@/lib/marketing-tags'

const ALL = [MARKETING_TAGS.countries, MARKETING_TAGS.plans, MARKETING_TAGS.faq]

/** The published FAQ rows (lib/faq/public.ts readPublished, strict: an unreadable translations table throws instead of reading empty). */
export const marketingFaqRows = shared('faq-rows', [MARKETING_TAGS.faq], async () => {
  const { readPublished } = await import('@/lib/faq/public')
  return readPublished(true)
})

/** One country's resolved FAQ page, by its code and locale. Strict: a failed read throws (the reader then answers as before). */
export const marketingFaqPage = shared('faq-page', ALL, async (code: string, locale: string) => {
  const { computeFaqPage } = await import('@/lib/faq/public')
  return computeFaqPage(code, locale)
})

/** The FAQ pages' hreflang set and the sitemap's FAQ list: every switched-on country whose FAQ has content. Strict. */
export const marketingFaqCountries = shared('faq-countries', ALL, async () => {
  const { computeFaqCountries } = await import('@/lib/faq/public')
  return computeFaqCountries()
})
