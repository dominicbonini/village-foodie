// lib/country-settings.ts — THE ONE READER of public.country_settings. Server only.
//
// 🔴 SERVICE ROLE, SERVER ONLY, NEVER A BROWSER. The table has RLS on, NO policies and no grants to anon
// or authenticated (20261010_02, because of V12.1). `import 'server-only'` makes a client import of this
// file a BUILD ERROR rather than a runtime surprise. Values reach a client component only as a prop from
// a server component, or inside an existing authenticated API response (/api/manage, /api/admin).
//
// 🔴 LOUD, NEVER A FALLBACK. A missing row throws. A NULL plan price throws where it is used for a price
// (requirePlanPrice in lib/country-settings-types.ts, called by every price function). Nothing here ever
// substitutes GB's figures for a country it cannot read — the manual's rule for "Currency and country".
//
// ⚠️ CACHED IN MEMORY FOR AT MOST 60 SECONDS, per server instance. An admin edit (Part C) calls
// clearCountrySettingsCache() so its own instance shows the change at once; other instances catch up
// within the minute.

import 'server-only'
import type { CountrySettings } from '@/lib/country-settings-types'

const TTL_MS = 60_000
const cache = new Map<string, { at: number; value: CountrySettings }>()

/** Forget cached rows — one country, or all of them. The admin editor calls this after a save. */
export function clearCountrySettingsCache(code?: string): void {
  if (code) cache.delete(code.trim().toUpperCase())
  else cache.clear()
  listCache = null   // any change can change the list (a name, a switch) — always drop it
}
let listCache: { at: number; value: CountrySettings[] } | null = null

// 🔴 AN EXPLICIT COLUMN LIST, NOT '*'. A renamed or dropped column then fails this read (42703) instead of
// arriving as `undefined` and rendering "£NaN" — and mapRow below refuses anything it cannot type.
// ⚠️ competitor_name / competitor_pct / competitor_fixed_minor are NOT read: retired 10 October 2026
// (/compare no longer prefills a competitor) and NULLed by 20261010_10. The columns stay; nothing reads them.
export const COUNTRY_SETTINGS_COLUMNS = [
  'country_code', 'name', 'enabled',
  'currency', 'locale', 'time_format', 'date_order', 'week_start',
  'phone_country_code', 'short_name', 'phone_example', 'phone_check', 'address_format', 'timezones', 'default_timezone',
  'prices_include_tax', 'tax_label',
  'card_surcharge_allowed', 'card_surcharge_cap_pct', 'card_surcharge_credit_only', 'card_surcharge_excluded_regions',
  'service_fee_allowed', 'tipping_enabled_default', 'tip_presets_pct', 'allergen_set',
  'starter_monthly_minor', 'pro_monthly_minor', 'max_monthly_minor',
  'pro_allowance_minor', 'max_allowance_minor', 'platform_fee_pct',
  'card_fee_online_pct', 'card_fee_online_fixed_minor',
  'card_fee_in_person_pct', 'card_fee_in_person_fixed_minor',
  'tap_to_pay_fixed_minor', 'card_fee_region_label',
  // Phase 3 (20261010_17) — a NAMED select, so that migration must run before this code.
  'service_fee_recipient', 'service_fee_hatchgrab_bps', 'service_fee_hatchgrab_fixed_minor',
  'service_fee_truck_max_bps', 'service_fee_truck_max_fixed_minor', 'platform_fee_enabled', 'fees_taxed',
  'support_hours', 'updated_at', 'updated_by',
].join(', ')
const COLUMNS = COUNTRY_SETTINGS_COLUMNS

type Row = Record<string, unknown>

function fail(code: string, col: string, v: unknown): never {
  throw new Error(`[country-settings] ${code}.${col} has an unusable value (${JSON.stringify(v)}) — refusing to guess`)
}
// numeric(5,2) can arrive as a string from some drivers; integers arrive as numbers. Both are accepted,
// anything non-finite is refused.
const num = (code: string, r: Row, col: string): number => {
  const v = r[col]
  const n = typeof v === 'string' ? Number(v) : v
  if (typeof n !== 'number' || !Number.isFinite(n)) fail(code, col, v)
  return n
}
const numOrNull = (code: string, r: Row, col: string): number | null => (r[col] === null ? null : num(code, r, col))
const str = (code: string, r: Row, col: string): string => {
  const v = r[col]
  if (typeof v !== 'string') fail(code, col, v)
  return v
}
const strOrNull = (code: string, r: Row, col: string): string | null => (r[col] === null ? null : str(code, r, col))
const bool = (code: string, r: Row, col: string): boolean => {
  const v = r[col]
  if (typeof v !== 'boolean') fail(code, col, v)
  return v
}
const strArr = (code: string, r: Row, col: string): string[] => {
  const v = r[col]
  if (!Array.isArray(v) || v.some(x => typeof x !== 'string')) fail(code, col, v)
  return v as string[]
}
const numArr = (code: string, r: Row, col: string): number[] => {
  const v = r[col]
  if (!Array.isArray(v)) fail(code, col, v)
  return v.map(x => { const n = typeof x === 'string' ? Number(x) : x; if (typeof n !== 'number' || !Number.isFinite(n)) fail(code, col, v); return n })
}
function oneOf<T extends string>(code: string, r: Row, col: string, allowed: readonly T[]): T {
  const v = str(code, r, col)
  if (!(allowed as readonly string[]).includes(v)) fail(code, col, v)
  return v as T
}

/** One database row → the app's shape. Exported for the admin store (lib/admin/country-store.ts), which
 *  must read exactly what the loader reads. Refuses any value it cannot type. */
export function mapCountryRow(r: Row): CountrySettings {
  const c = str('?', r, 'country_code')
  return {
    countryCode: c,
    name: str(c, r, 'name'),
    enabled: bool(c, r, 'enabled'),
    currency: str(c, r, 'currency'),
    locale: str(c, r, 'locale'),
    timeFormat: oneOf(c, r, 'time_format', ['24h', '12h'] as const),
    dateOrder: oneOf(c, r, 'date_order', ['dmy', 'mdy'] as const),
    weekStart: oneOf(c, r, 'week_start', ['monday', 'sunday'] as const),
    phoneCountryCode: str(c, r, 'phone_country_code'),
    shortName: strOrNull(c, r, 'short_name'),
    phoneExample: strOrNull(c, r, 'phone_example'),
    phoneCheck: oneOf(c, r, 'phone_check', ['length', 'strict', 'off'] as const),
    addressFormat: oneOf(c, r, 'address_format', ['postcode', 'zip_state'] as const),
    timezones: strArr(c, r, 'timezones'),
    defaultTimezone: str(c, r, 'default_timezone'),
    pricesIncludeTax: bool(c, r, 'prices_include_tax'),
    taxLabel: str(c, r, 'tax_label'),
    cardSurchargeAllowed: bool(c, r, 'card_surcharge_allowed'),
    cardSurchargeCapPct: numOrNull(c, r, 'card_surcharge_cap_pct'),
    cardSurchargeCreditOnly: bool(c, r, 'card_surcharge_credit_only'),
    cardSurchargeExcludedRegions: strArr(c, r, 'card_surcharge_excluded_regions'),
    serviceFeeAllowed: bool(c, r, 'service_fee_allowed'),
    tippingEnabledDefault: bool(c, r, 'tipping_enabled_default'),
    tipPresetsPct: numArr(c, r, 'tip_presets_pct'),
    allergenSet: oneOf(c, r, 'allergen_set', ['uk14', 'us9'] as const),
    starterMonthlyMinor: numOrNull(c, r, 'starter_monthly_minor'),
    proMonthlyMinor: numOrNull(c, r, 'pro_monthly_minor'),
    maxMonthlyMinor: numOrNull(c, r, 'max_monthly_minor'),
    proAllowanceMinor: numOrNull(c, r, 'pro_allowance_minor'),
    maxAllowanceMinor: numOrNull(c, r, 'max_allowance_minor'),
    platformFeePct: numOrNull(c, r, 'platform_fee_pct'),
    cardFeeOnlinePct: num(c, r, 'card_fee_online_pct'),
    cardFeeOnlineFixedMinor: num(c, r, 'card_fee_online_fixed_minor'),
    cardFeeInPersonPct: num(c, r, 'card_fee_in_person_pct'),
    cardFeeInPersonFixedMinor: num(c, r, 'card_fee_in_person_fixed_minor'),
    tapToPayFixedMinor: num(c, r, 'tap_to_pay_fixed_minor'),
    cardFeeRegionLabel: str(c, r, 'card_fee_region_label'),
    serviceFeeRecipient: oneOf(c, r, 'service_fee_recipient', ['truck', 'hatchgrab'] as const),
    serviceFeeHatchgrabBps: numOrNull(c, r, 'service_fee_hatchgrab_bps'),
    serviceFeeHatchgrabFixedMinor: numOrNull(c, r, 'service_fee_hatchgrab_fixed_minor'),
    serviceFeeTruckMaxBps: numOrNull(c, r, 'service_fee_truck_max_bps'),
    serviceFeeTruckMaxFixedMinor: numOrNull(c, r, 'service_fee_truck_max_fixed_minor'),
    platformFeeEnabled: bool(c, r, 'platform_fee_enabled'),
    feesTaxed: bool(c, r, 'fees_taxed'),
    supportHours: strOrNull(c, r, 'support_hours'),
    updatedAt: str(c, r, 'updated_at'),
    updatedBy: strOrNull(c, r, 'updated_by'),
  }
}

/** One country's settings. Throws if the code is malformed, the read fails, or there is no row. */
export async function getCountrySettings(code: string): Promise<CountrySettings> {
  const key = String(code ?? '').trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(key)) throw new Error(`[country-settings] "${code}" is not an ISO country code`)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value

  // ⚠️ IMPORTED HERE, NOT AT THE TOP: lib/supabase.ts builds the service-role client at module load, and
  // modules that only NAME this loader (lib/plans-pdf.ts's renderer, the harnesses that render it) must
  // be loadable without a database.
  const { supabase } = await import('@/lib/supabase')
  const { data, error } = await supabase.from('country_settings').select(COLUMNS).eq('country_code', key).maybeSingle()
  if (error) throw new Error(`[country-settings] could not read ${key}: ${error.message}`)
  if (!data) throw new Error(`[country-settings] no settings row for ${key} — refusing to fall back to another country's figures`)

  const value = mapCountryRow(data as unknown as Row)
  cache.set(key, { at: Date.now(), value })
  return value
}

/**
 * The settings for a truck's own country. 🔴 THROWS if `country` is missing from the object — that is
 * almost always a select that left the column out, and reading the truck's country as "GB" because a
 * projection dropped it is exactly the silent fallback this module refuses.
 */
export async function countrySettingsForTruck(truck: { country?: string | null } | null | undefined): Promise<CountrySettings> {
  const code = truck?.country
  if (typeof code !== 'string' || !code) {
    throw new Error('[country-settings] this truck object has no `country` — was it left out of the select?')
  }
  return getCountrySettings(code)
}

/** Several countries at once, keyed by code. Each one is as loud as getCountrySettings. */
export async function getCountrySettingsMany(codes: Iterable<string>): Promise<Record<string, CountrySettings>> {
  const unique = [...new Set([...codes].map(c => String(c).trim().toUpperCase()))]
  const rows = await Promise.all(unique.map(c => getCountrySettings(c)))
  return Object.fromEntries(rows.map(r => [r.countryCode, r]))
}

/**
 * EVERY country, UNCACHED, for the admin Countries page — which must show what is in the table now, not
 * what this instance read a minute ago. Name order, as the page wants it (it puts the marketing country
 * first itself).
 */
export async function listCountrySettings(): Promise<CountrySettings[]> {
  const { supabase } = await import('@/lib/supabase')
  const { data, error } = await supabase.from('country_settings').select(COLUMNS).order('name')
  if (error) throw new Error(`[country-settings] could not list countries: ${error.message}`)
  return ((data ?? []) as unknown as Row[]).map(mapCountryRow)
}

/**
 * Every country, CACHED like getCountrySettings (60s) — for the public pages that list countries on every
 * request (the marketing pages' country menu, the signup step's list). The admin page keeps the uncached read.
 */
export async function listCountrySettingsCached(): Promise<CountrySettings[]> {
  if (listCache && Date.now() - listCache.at < TTL_MS) return listCache.value
  const value = await listCountrySettings()
  listCache = { at: Date.now(), value }
  return value
}
