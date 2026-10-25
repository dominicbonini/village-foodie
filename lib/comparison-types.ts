// lib/comparison-types.ts — a country's comparison switches (compare-de-1, 24 October 2026). PURE, client-safe:
// Admin › Countries, proxy.ts and lib/comparison.ts share them.
export type ComparisonStatus = 'off' | 'admin' | 'live'
export const COMPARISON_STATUSES: readonly ComparisonStatus[] = ['off', 'admin', 'live']
export const isComparisonStatus = (v: unknown): v is ComparisonStatus => typeof v === 'string' && (COMPARISON_STATUSES as readonly string[]).includes(v)

/** A country's comparison switches (country_settings, 20261042). Before that migration runs every country reads as 'off'
 *  with no apps — the page does not exist anywhere, which is the state the migration starts in too. */
export interface ComparisonFlags { countryCode: string; status: ComparisonStatus; iosApp: boolean; androidApp: boolean }
