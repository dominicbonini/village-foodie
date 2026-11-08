// lib/comparison-flags.ts — every country's comparison switches (compare-de-1, 24 October 2026). SERVER ONLY.
// Its own small module so proxy.ts can read them without loading the comparison builder. lib/comparison-server.ts
// re-exports it; its header explains the tolerant read.
import 'server-only'
import { isComparisonStatus, NEVER_AUTO_PUBLISH, type ComparisonFlags } from '@/lib/comparison-types'
import { countryOfSegment } from '@/lib/marketing-country'
import { isMarketingRender, isBuiltAheadRender } from '@/lib/marketing-render'   // perf-1: a marketing page's render reads the tagged shared cache

const TTL_MS = 60_000
let flagsCache: { at: number; value: Map<string, ComparisonFlags> } | null = null

/** Forget the cached flags — Admin › Countries calls this after it changes a comparison status. */
export function clearComparisonCache(): void { flagsCache = null }

const OFF = (countryCode: string): ComparisonFlags => ({ countryCode, status: 'off', iosApp: false, androidApp: false })

/** perf-1: the switches from country_settings rows (the one mapping, shared by the read below and lib/marketing-cache.ts).
 *  compare-autopublish-1 (Dominic's Q1 = C): with the comparison_publish rows, a country is LIVE when country_settings says 'live' OR
 *  (its auto-publish switch is on AND the automatic evaluation says live AND Admin has not set it off). AE never auto-publishes. */
export function flagsFromRows(rows: unknown[], publish: unknown[] = []): Map<string, ComparisonFlags> {
  const pub = new Map((publish as { country_code: string; auto_publish?: unknown; auto_live?: unknown; admin_off?: unknown }[]).map(p => [p.country_code, p]))
  const value = new Map<string, ComparisonFlags>()
  for (const r of rows as { country_code: string; comparison_status: unknown; ios_app_available: unknown; android_app_available: unknown }[]) {
    const own = isComparisonStatus(r.comparison_status) ? r.comparison_status : 'off'
    const p = pub.get(r.country_code)
    const autoPublish = !!p && p.auto_publish !== false && p.admin_off !== true && !NEVER_AUTO_PUBLISH.includes(r.country_code)
    const autoLive = autoPublish && p!.auto_live === true && own !== 'live'
    value.set(r.country_code, {
      countryCode: r.country_code, status: autoLive ? 'live' : own,
      iosApp: r.ios_app_available === true, androidApp: r.android_app_available === true,
      ...(p ? { autoPublish, autoLive } : {}),
    })
  }
  return value
}

/** compare-autopublish-1: the comparison_publish rows, tolerantly — before 20261078 (no table) there are none. */
export async function readPublishRows(client: { from(t: string): { select(c: string): PromiseLike<{ data: unknown[] | null; error: { message: string; code?: string } | null }> } }): Promise<unknown[]> {
  const { data, error } = await client.from('comparison_publish').select('country_code, auto_publish, auto_live, admin_off')
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message)) return []
    throw new Error(`comparison publish switches: ${error.message}`)
  }
  return data ?? []
}

/** Every country's comparison switches. Never throws: a failed read is logged and every country reads 'off'. */
export async function comparisonFlags(): Promise<Map<string, ComparisonFlags>> {
  // perf-1 (5 November 2026): a marketing page's render reads the tagged shared cache (lib/marketing-cache.ts). A failed read there
  // is never kept; it falls through to the read below, which answers as it always has (logged, every country off).
  if (isMarketingRender()) {
    try { return new Map((await (await import('@/lib/marketing-cache')).marketingComparisonEntries())) } catch (e) { if (isBuiltAheadRender()) throw e /* cwv-2: never stored with a built-ahead page */ }
  }
  if (flagsCache && Date.now() - flagsCache.at < TTL_MS) return flagsCache.value
  let value = new Map<string, ComparisonFlags>()
  try {
    const { supabase } = await import('@/lib/supabase')
    const { data, error } = await supabase.from('country_settings').select('country_code, comparison_status, ios_app_available, android_app_available')
    if (error) {
      // 42703: 20261042 has not run — every country is off, which is not an error.
      if (error.code !== '42703' && !/column .* does not exist/i.test(error.message)) console.error('[comparison] could not read the comparison switches:', error.message)
    } else {
      // compare-autopublish-1: a failed read of the auto-publish switches is logged and counts as none (Admin's status alone).
      let publish: unknown[] = []
      try { publish = await readPublishRows(supabase as never) } catch (e) { console.error('[comparison] could not read the auto-publish switches:', e instanceof Error ? e.message : e) }
      value = flagsFromRows(data ?? [], publish)
    }
  } catch (e) { console.error('[comparison] could not read the comparison switches:', e instanceof Error ? e.message : e) }
  flagsCache = { at: Date.now(), value }
  return value
}

export async function comparisonFlagsOf(code: string): Promise<ComparisonFlags> {
  return (await comparisonFlags()).get(code.toUpperCase()) ?? OFF(code.toUpperCase())
}

/** store-badges-1 (2 November 2026): a country's two app flags, as the store badges, the FAQ and Settings' app card read them —
 *  `{ ios, android }`, from the same cached read. Unknown or unreadable → both false (never an app that is not flagged). */
export async function appsOf(code: string | null | undefined): Promise<{ ios: boolean; android: boolean }> {
  const f = await comparisonFlagsOf(code || 'GB')
  return { ios: f.iosApp, android: f.androidApp }
}

/** A comparison address or its twin — '/de/vergleich/foodtruck-bestellsystem', '….md', '….json' — taken apart, or null.
 *  The section and slug are not checked here (the page compares them with the country's messages and 404s). */
export function comparisonAddressOf(pathname: string): { code: string; section: string; slug: string; format: 'html' | 'md' | 'json' } | null {
  const m = /^\/([a-z]{2})\/([a-z0-9-]+)\/([a-z0-9-]+?)(?:\.(md|json))?$/.exec(pathname)
  const code = m && countryOfSegment(m[1])
  if (!m || !code || m[2] === 'features' || m[2] === 'compare') return null
  return { code, section: m[2], slug: m[3], format: (m[4] as 'md' | 'json' | undefined) ?? 'html' }
}
