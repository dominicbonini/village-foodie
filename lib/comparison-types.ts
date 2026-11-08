// lib/comparison-types.ts — a country's comparison switches (compare-de-1, 24 October 2026). PURE, client-safe:
// Admin › Countries, proxy.ts and lib/comparison.ts share them.
export type ComparisonStatus = 'off' | 'admin' | 'live'
export const COMPARISON_STATUSES: readonly ComparisonStatus[] = ['off', 'admin', 'live']
export const isComparisonStatus = (v: unknown): v is ComparisonStatus => typeof v === 'string' && (COMPARISON_STATUSES as readonly string[]).includes(v)

/** A country's comparison switches (country_settings, 20261042). Before that migration runs every country reads as 'off'
 *  with no apps — the page does not exist anywhere, which is the state the migration starts in too. */
export interface ComparisonFlags { countryCode: string; status: ComparisonStatus; iosApp: boolean; androidApp: boolean
  /** compare-autopublish-1 (20261078): the country's auto-publish switch is on (and Admin has not set it off) — its page shows data the
   *  automatic rules verified (lib/comparison-publish.ts) as well as Admin's. Absent (false) before the table exists. */
  autoPublish?: boolean
  /** The status is 'live' because the automatic evaluation found ≥ 2 publishable competitors (country_settings itself says less). */
  autoLive?: boolean
}
/** compare-autopublish-1: never auto-published. */
export const NEVER_AUTO_PUBLISH: readonly string[] = ['AE']
