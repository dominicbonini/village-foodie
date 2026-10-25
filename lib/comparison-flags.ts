// lib/comparison-flags.ts — every country's comparison switches (compare-de-1, 24 October 2026). SERVER ONLY.
// Its own small module so proxy.ts can read them without loading the comparison builder. lib/comparison-server.ts
// re-exports it; its header explains the tolerant read.
import 'server-only'
import { isComparisonStatus, type ComparisonFlags } from '@/lib/comparison-types'
import { countryOfSegment } from '@/lib/marketing-country'

const TTL_MS = 60_000
let flagsCache: { at: number; value: Map<string, ComparisonFlags> } | null = null

/** Forget the cached flags — Admin › Countries calls this after it changes a comparison status. */
export function clearComparisonCache(): void { flagsCache = null }

const OFF = (countryCode: string): ComparisonFlags => ({ countryCode, status: 'off', iosApp: false, androidApp: false })

/** Every country's comparison switches. Never throws: a failed read is logged and every country reads 'off'. */
export async function comparisonFlags(): Promise<Map<string, ComparisonFlags>> {
  if (flagsCache && Date.now() - flagsCache.at < TTL_MS) return flagsCache.value
  const value = new Map<string, ComparisonFlags>()
  try {
    const { supabase } = await import('@/lib/supabase')
    const { data, error } = await supabase.from('country_settings').select('country_code, comparison_status, ios_app_available, android_app_available')
    if (error) {
      // 42703: 20261042 has not run — every country is off, which is not an error.
      if (error.code !== '42703' && !/column .* does not exist/i.test(error.message)) console.error('[comparison] could not read the comparison switches:', error.message)
    } else {
      for (const r of (data ?? []) as { country_code: string; comparison_status: unknown; ios_app_available: unknown; android_app_available: unknown }[]) {
        value.set(r.country_code, {
          countryCode: r.country_code, status: isComparisonStatus(r.comparison_status) ? r.comparison_status : 'off',
          iosApp: r.ios_app_available === true, androidApp: r.android_app_available === true,
        })
      }
    }
  } catch (e) { console.error('[comparison] could not read the comparison switches:', e instanceof Error ? e.message : e) }
  flagsCache = { at: Date.now(), value }
  return value
}

export async function comparisonFlagsOf(code: string): Promise<ComparisonFlags> {
  return (await comparisonFlags()).get(code.toUpperCase()) ?? OFF(code.toUpperCase())
}

/** A comparison address or its twin — '/de/vergleich/foodtruck-bestellsystem', '….md', '….json' — taken apart, or null.
 *  The section and slug are not checked here (the page compares them with the country's messages and 404s). */
export function comparisonAddressOf(pathname: string): { code: string; section: string; slug: string; format: 'html' | 'md' | 'json' } | null {
  const m = /^\/([a-z]{2})\/([a-z0-9-]+)\/([a-z0-9-]+?)(?:\.(md|json))?$/.exec(pathname)
  const code = m && countryOfSegment(m[1])
  if (!m || !code || m[2] === 'features' || m[2] === 'compare') return null
  return { code, section: m[2], slug: m[3], format: (m[4] as 'md' | 'json' | undefined) ?? 'html' }
}
