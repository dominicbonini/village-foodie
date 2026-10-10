// lib/admin/country-actions.ts — what the admin Countries routes DO: list, save one country, add, remove.
//
// The database is reached only through a CountryStore, so the SAME code runs in the route (against the
// service-role store in lib/admin/country-store.ts) and in scripts/countries-api.cjs (against an in-memory
// table that mimics it, including the stale-save condition). Every rule is checked here before any write
// with the plain sentence the page shows; the database CHECKs stay behind them as a second line.
//
// 🔴 ONE ROW PER SAVE. A save writes only the country it names; nothing here ever writes two rows.
// 🔴 A STALE SAVE IS REFUSED, NOT MERGED: the page sends the `updated_at` it loaded, and the store writes
// only WHERE updated_at still equals it. Someone else's save in between → nothing is written, and the
// admin is told to reload. What they typed stays on their screen.
// ⚠️ After every successful write the caller clears the loader's cache (lib/country-settings.ts), so the
// landing page, /features, /compare, Billing and Payments pick the change up within a minute — this
// instance at once, every other within the 60-second TTL.

import type { CountrySettings } from '@/lib/country-settings-types'
import {
  formToValues, checkNewCountry, asCountryForm, STALE_SAVE, PLAN_PRICE_FIELDS_STORED, type FieldError, type CountryValues,
} from '@/lib/admin/country-form'

// ── 🔴 THE ONLY PLACE THE PAGE'S FIELDS MEET COLUMN NAMES — kept here, server-side, so no column name is
// ever shipped to a browser in the page's bundle (lib/admin/country-form.ts is client-safe and has none).
/** Stored values → the database's own column names. The ONE place the page's fields meet column names. */
export function valuesToColumns(v: CountryValues): Record<string, unknown> {
  return {
    name: v.name, enabled: v.enabled,
    currency: v.currency, locale: v.locale, time_format: v.timeFormat, date_order: v.dateOrder, week_start: v.weekStart,
    phone_country_code: v.phoneCountryCode, short_name: v.shortName, phone_example: v.phoneExample, phone_check: v.phoneCheck,
    address_format: v.addressFormat,
    timezones: v.timezones, default_timezone: v.defaultTimezone,
    prices_include_tax: v.pricesIncludeTax, tax_label: v.taxLabel,
    card_surcharge_allowed: v.cardSurchargeAllowed, card_surcharge_cap_pct: v.cardSurchargeCapPct,
    card_surcharge_credit_only: v.cardSurchargeCreditOnly, card_surcharge_excluded_regions: v.cardSurchargeExcludedRegions,
    service_fee_allowed: v.serviceFeeAllowed, tipping_enabled_default: v.tippingEnabledDefault, tip_presets_pct: v.tipPresetsPct,
    allergen_set: v.allergenSet,
    starter_monthly_minor: v.starterMonthlyMinor, pro_monthly_minor: v.proMonthlyMinor, max_monthly_minor: v.maxMonthlyMinor,
    pro_allowance_minor: v.proAllowanceMinor, max_allowance_minor: v.maxAllowanceMinor, platform_fee_pct: v.platformFeePct,
    card_fee_online_pct: v.cardFeeOnlinePct, card_fee_online_fixed_minor: v.cardFeeOnlineFixedMinor,
    card_fee_in_person_pct: v.cardFeeInPersonPct, card_fee_in_person_fixed_minor: v.cardFeeInPersonFixedMinor,
    tap_to_pay_fixed_minor: v.tapToPayFixedMinor, card_fee_region_label: v.cardFeeRegionLabel,
    support_hours: v.supportHours,
  }
}

/** A brand-new country: copied from an existing one, switched OFF, with all six plan prices EMPTY — and its
 *  short name and example phone number empty too (Phase 2C). */
export function newCountryValues(code: string, name: string, from: CountrySettings): CountryValues {
  const v: CountryValues = { ...from } as CountryValues
  delete (v as Partial<CountrySettings>).countryCode
  delete (v as Partial<CountrySettings>).updatedAt
  delete (v as Partial<CountrySettings>).updatedBy
  for (const k of PLAN_PRICE_FIELDS_STORED) (v as Record<string, unknown>)[k] = null
  // Phase 2C: the short name and example phone number are the COUNTRY's own words — copying another
  // country's ("UK", "07700 900123") would be wrong on day one, so they start empty, like the plan prices.
  return { ...v, name: name.trim(), enabled: false, shortName: null, phoneExample: null }
}

export interface CountryStore {
  list(): Promise<CountrySettings[]>
  get(code: string): Promise<CountrySettings | null>
  /** Trucks per country code, for every code asked about (0 where none). */
  truckCounts(codes: string[]): Promise<Record<string, number>>
  /** Write `columns` to ONE row only where its updated_at still equals `expectedUpdatedAt`. Null when no
   *  row matched — it changed, or it is gone. */
  update(code: string, expectedUpdatedAt: string, columns: Record<string, unknown>): Promise<CountrySettings | null>
  insert(columns: Record<string, unknown>): Promise<CountrySettings>
  /** Delete ONE row. Returns how many were deleted. */
  remove(code: string): Promise<number>
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; errors?: FieldError[] }

const refuse = <T>(status: number, error: string, errors?: FieldError[]): ActionResult<T> => ({ ok: false, status, error, errors })

/** The page's first read: every country, the marketing one first then by name, with its truck count. */
export async function listCountries(store: CountryStore, firstCode: string):
  Promise<ActionResult<{ countries: CountrySettings[]; truckCounts: Record<string, number> }>> {
  const rows = await store.list()
  rows.sort((a, b) => (a.countryCode === firstCode ? -1 : b.countryCode === firstCode ? 1 : a.name.localeCompare(b.name)))
  const truckCounts = await store.truckCounts(rows.map(r => r.countryCode))
  return { ok: true, data: { countries: rows, truckCounts } }
}

/** Save one country's column. */
export async function saveCountry(
  store: CountryStore,
  body: { code?: unknown; expectedUpdatedAt?: unknown; form?: unknown },
  stamp: { by: string; at: string },
): Promise<ActionResult<{ country: CountrySettings }>> {
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
  const expected = typeof body.expectedUpdatedAt === 'string' ? body.expectedUpdatedAt : ''
  const form = asCountryForm(body.form)
  if (!code || !expected || !form) return refuse(400, 'That save was incomplete. Reload the page and try again.')
  // 🔴 THE CODE IS THE ROW'S IDENTITY AND CANNOT CHANGE — there is no field for it in the form, and a
  // `countryCode` smuggled into one is refused rather than ignored.
  if ('countryCode' in (body.form as Record<string, unknown>)) {
    return refuse(400, "The country code can't change after the country is created.", [{ field: 'countryCode', message: "The country code can't change after the country is created." }])
  }

  const stored = await store.get(code)
  if (!stored) return refuse(404, 'That country no longer exists. Reload to see the latest.')
  if (stored.updatedAt !== expected) return refuse(409, STALE_SAVE)
  const trucks = (await store.truckCounts([code]))[code] ?? 0

  const parsed = formToValues(form, { truckCount: trucks, storedCurrency: stored.currency, countryCode: stored.countryCode })
  if (!parsed.ok) return refuse(400, parsed.errors[0].message, parsed.errors)

  const saved = await store.update(code, expected, { ...valuesToColumns(parsed.values), updated_at: stamp.at, updated_by: stamp.by })
  if (!saved) return refuse(409, STALE_SAVE)
  return { ok: true, data: { country: saved } }
}

/** Add a country: copied from an existing one, switched OFF, all six plan prices EMPTY. */
export async function addCountry(
  store: CountryStore,
  body: { code?: unknown; name?: unknown; copyFrom?: unknown },
  stamp: { by: string; at: string },
): Promise<ActionResult<{ country: CountrySettings }>> {
  const input = {
    code: typeof body.code === 'string' ? body.code : '',
    name: typeof body.name === 'string' ? body.name : '',
    copyFrom: typeof body.copyFrom === 'string' ? body.copyFrom.trim().toUpperCase() : '',
  }
  const existing = (await store.list()).map(r => r.countryCode)
  const errors = checkNewCountry(input, existing)
  if (errors.length) return refuse(400, errors[0].message, errors)
  const from = await store.get(input.copyFrom)
  if (!from) return refuse(400, 'Choose a country to copy the settings from.')
  const code = input.code.trim().toUpperCase()
  const values = newCountryValues(code, input.name, from)
  const country = await store.insert({ country_code: code, ...valuesToColumns(values), updated_at: stamp.at, updated_by: stamp.by })
  return { ok: true, data: { country } }
}

/**
 * Remove a country. 🔴 THE ONLY ROW DELETE THIS PAGE CAN MAKE, and only for a country that NO truck uses
 * and that is switched OFF — it exists so a test country can be cleaned up. The marketing country (the
 * public pages' prices) can never be removed. trucks.country's foreign key refuses it too.
 */
export async function removeCountry(
  store: CountryStore,
  body: { code?: unknown },
  protectedCodes: string[],
): Promise<ActionResult<{ code: string }>> {
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
  if (!code) return refuse(400, 'Say which country to remove.')
  if (protectedCodes.includes(code)) return refuse(400, `${code} can't be removed: the public pricing pages use it.`)
  const row = await store.get(code)
  if (!row) return refuse(404, 'That country no longer exists. Reload to see the latest.')
  const trucks = (await store.truckCounts([code]))[code] ?? 0
  if (trucks > 0) return refuse(400, `${row.name} can't be removed while ${trucks} ${trucks === 1 ? 'truck uses' : 'trucks use'} it.`)
  if (row.enabled) return refuse(400, `Switch ${row.name} off before removing it.`)
  const n = await store.remove(code)
  if (n !== 1) return refuse(409, 'That country was not removed. Reload to see the latest.')
  return { ok: true, data: { code } }
}
