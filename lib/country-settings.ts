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
import { COUNTRY_PAYMENT_MODELS, type CountrySettings, type CountryPaymentModel } from '@/lib/country-settings-types'
import { CURRENCY_CODES } from '@/lib/currencies'
import { ACCEPTED_ADDRESS_FORMAT_VALUES, addressFormatKeyOf, type AddressFormatKey } from '@/lib/address-formats'
import { ALLERGEN_SETS } from '@/lib/allergens'
import { isMarketingRender } from '@/lib/marketing-render'   // perf-1: a marketing page's render reads the tagged shared cache

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
// ⛔ NOR ARE THE SIX OLD PLAN PRICE COLUMNS (starter/pro/max monthly, pro/max allowance, platform_fee_pct): retired by
// plans-data-model Stage A, and their last reader — the frozen display copy — was deleted in Stage B
// (docs/pricing-pages-report.md). Plans and prices are public.plans / plan_prices (lib/plans.ts). The columns stay.
const BASE_COLUMNS = [
  'country_code', 'name', 'enabled',
  'currency', 'locale', 'time_format', 'date_order', 'week_start',
  'phone_country_code', 'short_name', 'phone_example', 'phone_check', 'address_format', 'timezones', 'default_timezone',
  'prices_include_tax', 'tax_label',
  'card_surcharge_allowed', 'card_surcharge_cap_pct', 'card_surcharge_credit_only', 'card_surcharge_excluded_regions',
  'service_fee_allowed', 'tipping_enabled_default', 'tip_presets_pct', 'allergen_set',
  // allergen-card-country (21 October 2026, 20261029_allergen_card_only.sql — must run BEFORE this code: a named select).
  'allergen_card_only_allowed',
  'card_fee_online_pct', 'card_fee_online_fixed_minor',
  'card_fee_in_person_pct', 'card_fee_in_person_fixed_minor',
  'tap_to_pay_fixed_minor', 'card_fee_region_label',
  // Phase 3 (20261010_17) — a NAMED select, so that migration must run before this code.
  'service_fee_recipient', 'service_fee_hatchgrab_bps', 'service_fee_hatchgrab_fixed_minor',
  'service_fee_truck_max_bps', 'service_fee_truck_max_fixed_minor', 'platform_fee_enabled', 'fees_taxed',
  'support_hours', 'updated_at', 'updated_by',
]
/** world-countries-1 (31 October 2026, docs/world-countries-1-report.md §1): may HatchGrab take a platform fee in this country
 *  (20261054)? Read by name like every column — but TOLERANTLY: until 20261054 runs, the select that names it fails with 42703
 *  and `selectWithFallback` reads the columns without it, and mapCountryRow takes its absence as `true` (every existing row's
 *  value). So this code may deploy before the SQL, and nothing changes until it runs. */
// world-countries-5 (12 November 2026, 20261096): + menu_currency — read just as tolerantly (absent → the read without these; the menu is
// then priced in `currency`, as before).
const WC1_COLUMNS = ['platform_fee_allowed', 'menu_currency']
/** pricing-copy-4 (12 November 2026, docs/pricing-copy-4-report.md): the country's payment model, from public.country_billing
 *  (billing-1, 20261085; one row per country, its primary key a foreign key to this table), EMBEDDED in the same read — so every
 *  settings object the loader builds says whether the country takes online card payments (offersOnlineCardPayments in
 *  lib/country-settings-types.ts). No row = null. Read with the service role like the rest (country_billing has RLS on, no policy). */
const PC4_EMBED = 'country_billing(payment_model)'
export const COUNTRY_SETTINGS_COLUMNS = [...BASE_COLUMNS, ...WC1_COLUMNS, PC4_EMBED].join(', ')
/** The column list without the payment model — what a database before billing-1 (20261085) can answer. */
export const COUNTRY_SETTINGS_COLUMNS_BEFORE_PC4 = [...BASE_COLUMNS, ...WC1_COLUMNS].join(', ')
/** The column list without world-countries-1's columns — what a database before 20261054 can answer. */
export const COUNTRY_SETTINGS_COLUMNS_BEFORE_WC1 = BASE_COLUMNS.join(', ')

/** world-countries-1: runs a read with COUNTRY_SETTINGS_COLUMNS; if the database has no world-countries-1 column yet (Postgres
 *  42703, "column … does not exist"), runs it again with the columns before it. Any other error is returned as it came.
 *  pricing-copy-4: if the database has no country_billing table to embed yet, the read runs again without it (the objects then carry
 *  no paymentModel, which renders exactly as before pricing-copy-4). */
export async function selectWithFallback<R extends { error: { message: string; code?: string } | null }>(run: (columns: string) => PromiseLike<R>): Promise<R> {
  let first = await run(COUNTRY_SETTINGS_COLUMNS)
  if (first.error && first.error.message.includes('country_billing')) first = await run(COUNTRY_SETTINGS_COLUMNS_BEFORE_PC4)
  const e = first.error
  if (e && (e.code === '42703' || WC1_COLUMNS.some(c => e.message.includes(c)))) return run(COUNTRY_SETTINGS_COLUMNS_BEFORE_WC1)
  return first
}

/** pricing-copy-4: the embedded country_billing row → its payment model; null when the country has no row. PostgREST sends a
 *  one-to-one embed as an object (or null); an array is accepted too. An unknown model is refused like any other value. */
function paymentModelOf(code: string, v: unknown): CountryPaymentModel | null {
  const row = Array.isArray(v) ? (v.length > 1 ? fail(code, 'country_billing', v) : v[0] ?? null) : v
  if (row === null || row === undefined) return null
  const m = (row as Row).payment_model
  if (typeof m !== 'string' || !(COUNTRY_PAYMENT_MODELS as readonly string[]).includes(m)) fail(code, 'country_billing.payment_model', m)
  return m as CountryPaymentModel
}

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
    // currency-registry (21 October 2026): only a currency lib/currencies.ts lists (the database CHECK holds the same
    // codes) — refused like an unknown allergen set; a list skips the row (readAllCountryRows below).
    currency: oneOf(c, r, 'currency', CURRENCY_CODES),
    // world-countries-5 (12 November 2026, 20261096): the money truck menus are priced in — `menu_currency`, else `currency` (NULL = the
    // same, so every country without one is unchanged). Only a registry currency, like `currency`.
    menuCurrency: r.menu_currency === null || r.menu_currency === undefined ? oneOf(c, r, 'currency', CURRENCY_CODES) : oneOf(c, r, 'menu_currency', CURRENCY_CODES),
    locale: str(c, r, 'locale'),
    timeFormat: oneOf(c, r, 'time_format', ['24h', '12h'] as const),
    dateOrder: oneOf(c, r, 'date_order', ['dmy', 'mdy'] as const),
    weekStart: oneOf(c, r, 'week_start', ['monday', 'sunday'] as const),
    phoneCountryCode: str(c, r, 'phone_country_code'),
    shortName: strOrNull(c, r, 'short_name'),
    phoneExample: strOrNull(c, r, 'phone_example'),
    phoneCheck: oneOf(c, r, 'phone_check', ['length', 'strict', 'off'] as const),
    // address-formats-1 (21 October 2026): a key of lib/address-formats.ts, or a legacy value ('postcode' → gb,
    // 'zip_state' → us) until the "run after deploy" SQL maps them. Anything else is refused like an unknown currency:
    // a list skips the row (readAllCountryRows) and Admin › Countries names it; a direct read throws.
    addressFormat: addressFormatKeyOf(oneOf(c, r, 'address_format', ACCEPTED_ADDRESS_FORMAT_VALUES)) as AddressFormatKey,
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
    allergenSet: oneOf(c, r, 'allergen_set', ALLERGEN_SETS),   // canada-1: 'ca'; world-countries-1: 'jp', 'br', 'codex' (lib/allergens.ts)
    allergenCardOnlyAllowed: bool(c, r, 'allergen_card_only_allowed'),
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
    // world-countries-1: absent before 20261054 runs — every existing row's value is true (the column's default).
    platformFeeAllowed: r.platform_fee_allowed === undefined ? true : bool(c, r, 'platform_fee_allowed'),
    feesTaxed: bool(c, r, 'fees_taxed'),
    supportHours: strOrNull(c, r, 'support_hours'),
    updatedAt: str(c, r, 'updated_at'),
    updatedBy: strOrNull(c, r, 'updated_by'),
    // pricing-copy-4: only when the read embedded country_billing (null = no row) — a row built without it carries no field.
    ...(r.country_billing === undefined ? {} : { paymentModel: paymentModelOf(c, r.country_billing) }),
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
  const { data, error } = await selectWithFallback(cols => supabase.from('country_settings').select(cols).eq('country_code', key).maybeSingle())
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
/** anz-1 (21 October 2026): the truck's allergen list, or null when its country cannot be read — NEVER THROWS (a WhatsApp
 *  reply must not fail over it; null keeps the guard's base behaviour). */
export async function allergenSetForTruck(truck: { country?: string | null } | null | undefined): Promise<CountrySettings['allergenSet'] | null> {
  try { return (await countrySettingsForTruck(truck)).allergenSet } catch { return null }
}

/** address-formats-1 (21 October 2026): the truck's address format key, or undefined when its country cannot be read —
 *  NEVER THROWS (an email or a WhatsApp reply must not fail over it; undefined keeps every line as it was before). */
export async function addressFormatForTruck(truck: { country?: string | null } | null | undefined): Promise<AddressFormatKey | undefined> {
  try { return (await countrySettingsForTruck(truck)).addressFormat } catch { return undefined }
}

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
  return (await readAllCountryRows()).countries
}

/**
 * 🔴 ONE UNREADABLE ROW NEVER TAKES THE OTHERS DOWN (currency-registry, 21 October 2026). A row mapCountryRow refuses — a
 * currency the registry does not list, an allergen set it does not know, any unusable value — is LEFT OUT of every list
 * (the marketing pages' country menu and router, the signup list, the admin Countries page) and reported here and in
 * the server log. Until then one such row made every list throw, so the menu, the router and signup failed for everyone.
 * A direct read of THAT country (getCountrySettings) still throws, loudly, as before: its own pages and trucks fail
 * rather than run on a guessed currency. The read itself failing still throws.
 */
export async function readAllCountryRows(): Promise<{ countries: CountrySettings[]; unreadable: { code: string; reason: string }[] }> {
  const { supabase } = await import('@/lib/supabase')
  const { data, error } = await selectWithFallback(cols => supabase.from('country_settings').select(cols).order('name'))
  if (error) throw new Error(`[country-settings] could not list countries: ${error.message}`)
  const countries: CountrySettings[] = []
  const unreadable: { code: string; reason: string }[] = []
  for (const r of (data ?? []) as unknown as Row[]) {
    try { countries.push(mapCountryRow(r)) }
    catch (e) {
      const code = typeof r.country_code === 'string' ? r.country_code : '?'
      const reason = e instanceof Error ? e.message : String(e)
      console.error(`[country-settings] ${code} is left out of every country list: ${reason}`)
      unreadable.push({ code, reason })
    }
  }
  return { countries, unreadable }
}

/**
 * Every country, CACHED like getCountrySettings (60s) — for the public pages that list countries on every
 * request (the marketing pages' country menu, the signup step's list). The admin page keeps the uncached read.
 */
export async function listCountrySettingsCached(): Promise<CountrySettings[]> {
  // perf-1 (5 November 2026): a marketing page's render reads the tagged shared cache (lib/marketing-cache.ts); every other caller,
  // the proxy included, keeps the 60-second copy below exactly as before.
  if (isMarketingRender()) return (await import('@/lib/marketing-cache')).marketingCountryList()
  if (listCache && Date.now() - listCache.at < TTL_MS) return listCache.value
  const value = await listCountrySettings()
  listCache = { at: Date.now(), value }
  return value
}
