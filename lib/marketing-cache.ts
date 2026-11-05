// lib/marketing-cache.ts — perf-1 (5 November 2026, docs/perf-1-report.md): THE MARKETING PAGES' SHARED, TAGGED DATA CACHE.
//
// Read ONLY while lib/marketing-render.ts says a marketing page is rendering (the shared readers send that one caller here). The FAQ's
// own cached reads are lib/faq/public-cache.ts (so nothing that reads countries or plans pulls the FAQ code in). Next 16's
// data cache (`unstable_cache`), so it is shared by every server instance and outlives a cold start:
//   • TAGGED (lib/marketing-tags.ts) — an app write calls revalidateMarketing(), which EXPIRES the tag at once
//     (`revalidateTag(tag, { expire: 0 })`): the very next request reads the database, never a stale copy;
//   • a 5-minute expiry (MARKETING_REVALIDATE_SECONDS) for a change nothing announces (the Supabase dashboard);
//   • KEYED BY COUNTRY/LOCALE ONLY — never a host, header, cookie, visitor, truck or order;
//   • NEVER A FAILED READ: each read here THROWS on a database error (unstable_cache keeps nothing that throws); the reader that
//     called it then answers exactly as it did before perf-1, uncached;
//   • deduplicated within one render by React `cache` (the page, its metadata and its footer read the same data once).
import 'server-only'
import { unstable_cache, revalidateTag } from 'next/cache'
import { cache } from 'react'
import { MARKETING_TAGS, MARKETING_REVALIDATE_SECONDS, type MarketingTag } from '@/lib/marketing-tags'
import type { CountrySettings } from '@/lib/country-settings-types'
import type { PlanCatalog } from '@/lib/plans'
import type { ComparisonFlags } from '@/lib/comparison-types'

const { countries, plans } = MARKETING_TAGS

/** A read through the shared cache, under `key` (+ its arguments, which Next adds to the key), with `tags`. */
export function shared<A extends unknown[], R>(key: string, tags: MarketingTag[], read: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return cache(unstable_cache(read, ['perf-1', key], { tags, revalidate: MARKETING_REVALIDATE_SECONDS }))
}

/** Expire these tags NOW, so the next request reads the database (an app write; /api/revalidate). Never throws. */
export function revalidateMarketing(tags: readonly MarketingTag[], why: string): void {
  for (const t of tags) {
    try { revalidateTag(t, { expire: 0 }) } catch (e) { console.error(`[marketing-cache] could not expire ${t} (${why}):`, e instanceof Error ? e.message : e) }
  }
}

// ── the four reads ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Every country (lib/country-settings.ts listCountrySettings — throws on a failed read). */
export const marketingCountryList = shared('country-list', [countries], async (): Promise<CountrySettings[]> => {
  const { listCountrySettings } = await import('@/lib/country-settings')
  return listCountrySettings()
})

/** The plan catalogue (lib/plans-server.ts readPlanCatalog — throws on a failed read). */
export const marketingPlanCatalog = shared('plan-catalog', [plans], async (): Promise<PlanCatalog> => {
  const [{ supabase }, { readPlanCatalog }] = await Promise.all([import('@/lib/supabase'), import('@/lib/plans-server')])
  return readPlanCatalog(supabase)
})

/** The comparison and app switches, as entries (a Map does not survive the cache). A database without the columns (20261042 not
 *  run, 42703) is every country off, as before — that answer is real, so it is kept; any other failure throws. */
export const marketingComparisonEntries = shared('comparison-flags', [countries], async (): Promise<[string, ComparisonFlags][]> => {
  const [{ supabase }, { flagsFromRows }] = await Promise.all([import('@/lib/supabase'), import('@/lib/comparison-flags')])
  const { data, error } = await supabase.from('country_settings').select('country_code, comparison_status, ios_app_available, android_app_available')
  if (error) {
    if (error.code === '42703' || /column .* does not exist/i.test(error.message)) return []
    throw new Error(`comparison switches: ${error.message}`)
  }
  return [...flagsFromRows(data ?? []).entries()]
})
