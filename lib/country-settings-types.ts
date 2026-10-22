// lib/country-settings-types.ts — the SHAPE of one public.country_settings row, as the app uses it.
//
// ✅ CLIENT-SAFE: types and pure helpers only; the one import is the pure currency registry (lib/currencies.ts). A client component may import this module;
// it carries no data. The data itself is read ONLY by lib/country-settings.ts (server-only, service role)
// and reaches a client component as a prop from a server component, or inside an existing authenticated
// API response (/api/manage, /api/admin). The table is never fetched from a browser — see the table
// comment in supabase/migrations/20261010_02_country_settings.sql and the V12.1 incident.
//
// ⚠️ camelCase here, snake_case in the database. The mapping is done once, in the loader. Client code
// therefore never names a column, which is also how the build check finds no column name in a client
// chunk.

import type { AddressFormatKey } from '@/lib/address-formats'   // address-formats-1: the pure address-format config
import { currencyInfo } from '@/lib/currencies'
import type { MoneyFormat } from '@/lib/money-format'

/** How a country's phone numbers are checked: 'length' — a plausible length (libphonenumber "possible",
 *  the default); 'strict' — real numbers only (libphonenumber "valid"); 'off' — anything not empty. */
export type PhoneCheck = 'length' | 'strict' | 'off'
export const PHONE_CHECKS: readonly PhoneCheck[] = ['length', 'strict', 'off']

export interface CountrySettings {
  countryCode: string
  name: string
  enabled: boolean

  currency: string
  locale: string
  timeFormat: '24h' | '12h'
  dateOrder: 'dmy' | 'mdy'
  weekStart: 'monday' | 'sunday'
  phoneCountryCode: string
  /** How the country is named inside a sentence: "a valid UK mobile". Nullable (20261010_11) — a screen
   *  that needs it and finds null says so and drops the word rather than guessing. */
  shortName: string | null
  /** The example number for placeholders and phone errors, written the country's way: "07700 900123". */
  phoneExample: string | null
  /** How strictly this country's phone numbers are checked (20261010_12; lib/phone.ts isPlausiblePhone). */
  phoneCheck: PhoneCheck
  /** address-formats-1 (21 October 2026): a key of lib/address-formats.ts (gb, us, ie, au, nz, ca). The loader maps the
   *  legacy column values ('postcode' → gb, 'zip_state' → us) until the "run after deploy" SQL rewrites them. */
  addressFormat: AddressFormatKey
  timezones: string[]
  defaultTimezone: string

  pricesIncludeTax: boolean
  taxLabel: string

  cardSurchargeAllowed: boolean
  cardSurchargeCapPct: number | null
  cardSurchargeCreditOnly: boolean
  cardSurchargeExcludedRegions: string[]
  serviceFeeAllowed: boolean
  tippingEnabledDefault: boolean
  tipPresetsPct: number[]
  // ── Phase 3 (20261010_17): who keeps the online service fee, its amounts, the platform-fee switch and
  //    whether fees are taxed. Data only — no Countries page rows yet. Every one defaults to OFF. Read by
  //    lib/order-charge-rules.ts and nothing else.
  /** Who keeps the online service fee: the truck (default) or HatchGrab. */
  serviceFeeRecipient: 'truck' | 'hatchgrab'
  /** HatchGrab's service fee when HatchGrab keeps it, basis points / minor units. Trucks cannot change it. */
  serviceFeeHatchgrabBps: number | null
  serviceFeeHatchgrabFixedMinor: number | null
  /** The most a truck may set when the truck keeps it. NULL = that part is not allowed. */
  serviceFeeTruckMaxBps: number | null
  serviceFeeTruckMaxFixedMinor: number | null
  /** The platform fee switched on (the rate is the truck's plan's plan_prices.fee_bps). Default OFF; nothing sends it this phase. */
  platformFeeEnabled: boolean
  /** Whether the service fee and card surcharge are taxed (D8). Default false. */
  feesTaxed: boolean
  allergenSet: 'uk14' | 'us9' | 'anz' | 'ca'   // anz-1: Australia / New Zealand (lib/allergens.ts ANZ); canada-1: Canada (CA)
  /** allergen-card-country (21 October 2026): may a truck here show its allergens as ONE card for the whole menu
   *  (allergen_display_mode 'card')? True everywhere except where the law requires allergens per dish (Ireland, FSAI). */
  allergenCardOnlyAllowed: boolean

  // ⛔ THE SIX OLD PLAN PRICE COLUMNS ARE NOT ON THIS TYPE (pricing-pages, Stage B): retired by plans-data-model Stage A
  // and no longer read anywhere. Plans and their prices are public.plans / public.plan_prices, read through lib/plans.ts.

  // Stripe's card fees as we quote them. Percent as written (1.5 = 1.5%); fixed parts in minor units of
  // `currency`. THEIRS, not ours — every rendered string carries a "currently" hedge.
  cardFeeOnlinePct: number
  cardFeeOnlineFixedMinor: number
  cardFeeInPersonPct: number
  cardFeeInPersonFixedMinor: number
  tapToPayFixedMinor: number
  /** "UK cards" / "US cards". Online sentences say "standard " + this; in-person sentences say this. */
  cardFeeRegionLabel: string

  supportHours: string | null
  updatedAt: string
  updatedBy: string | null
}

/** The two things a money formatter needs, taken from a settings row. */
export function moneyFormatOf(s: Pick<CountrySettings, 'currency' | 'locale'>): { currency: string; locale: string } {
  return { currency: s.currency, locale: s.locale }
}

/**
 * native-prices (22 October 2026, docs/native-prices-report.md; decided by Dominic, 21 Oct): HATCHGRAB'S PLAN PRICES ON A
 * COUNTRY'S OWN PAGES ARE WRITTEN THE WAY LOCALS WRITE THEM — the pricing section, /features, /compare, the plans PDF,
 * Manage › Billing, the van modal and the plan prompts: "$49" in New Zealand, "$39" in Australia, "29 kr" in Sweden, "£29",
 * "$29", "€29". That is Intl in the country's own locale (moneyFormatOf, the form a truck's menu already uses), plus the
 * currency registry's override where Intl's home form is not the native one (lib/currencies.ts `homeDisplay`: RON).
 * GB, US and IE get exactly moneyFormatOf, as before. Where the home symbol is shared ("$", "kr"), the page names the
 * currency once instead (currencyLineOf).
 * ⛔ It was anz-1's "name the dollar" rule (A$39, NZ$49 on Australia's and New Zealand's own pages; the registry's
 * `planLocale` from currency-registry). That form now lives only where currencies sit side by side: intlMoneyFormatOf.
 */
export function planMoneyFormatOf(s: Pick<CountrySettings, 'currency' | 'locale'>): MoneyFormat {
  const own = moneyFormatOf(s)
  const display = currencyInfo(own.currency)?.homeDisplay
  return display ? { ...own, currencyDisplay: display } : own
}

/**
 * native-prices: THE INTERNATIONAL FORM — for the places several countries' prices can sit side by side (Admin, /llms.txt).
 * A currency whose home symbol is shared (lib/currencies.ts `symbolShared`: CAD, AUD, NZD, SEK, NOK, DKK) is written in
 * international English, so it names itself: "NZ$49", "A$39", "SEK 29". Every other currency is its home form
 * (planMoneyFormatOf) — "£29", "$29", "€29". Machine-readable data keeps ISO codes (JSON-LD priceCurrency) and needs neither.
 */
export function intlMoneyFormatOf(s: Pick<CountrySettings, 'currency' | 'locale'>): MoneyFormat {
  return currencyInfo(s.currency)?.symbolShared ? { currency: s.currency, locale: 'en' } : planMoneyFormatOf(s)
}

/** The currency line a country's pricing carries when its home symbol is shared — the registry's plural name and code
 *  for `pricing.currencyLine` ("Prices in New Zealand dollars (NZD)") — or null (GB, US, IE: no line). */
export function currencyLineOf(s: Pick<CountrySettings, 'currency'>): { currency: string; code: string } | null {
  const c = currencyInfo(s.currency)
  return c?.symbolShared ? { currency: c.namePlural, code: c.code } : null
}
