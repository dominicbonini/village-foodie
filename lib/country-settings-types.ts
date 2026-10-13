// lib/country-settings-types.ts — the SHAPE of one public.country_settings row, as the app uses it.
//
// ✅ CLIENT-SAFE: types and pure helpers only, no imports. A client component may import this module;
// it carries no data. The data itself is read ONLY by lib/country-settings.ts (server-only, service role)
// and reaches a client component as a prop from a server component, or inside an existing authenticated
// API response (/api/manage, /api/admin). The table is never fetched from a browser — see the table
// comment in supabase/migrations/20261010_02_country_settings.sql and the V12.1 incident.
//
// ⚠️ camelCase here, snake_case in the database. The mapping is done once, in the loader. Client code
// therefore never names a column, which is also how the build check finds no column name in a client
// chunk.

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
  addressFormat: 'postcode' | 'zip_state'
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
  /** The platform fee (platformFeePct of food) switched on. Default OFF; nothing sends it this phase. */
  platformFeeEnabled: boolean
  /** Whether the service fee and card surcharge are taxed (D8). Default false. */
  feesTaxed: boolean
  allergenSet: 'uk14' | 'us9'

  // 🔴 NULL = NOT DECIDED (the US row today). Read through requirePlanPrice(), never directly: a NULL
  // on a row being used for prices is a LOUD failure, never a fallback to another country's figure.
  starterMonthlyMinor: number | null
  proMonthlyMinor: number | null
  maxMonthlyMinor: number | null
  proAllowanceMinor: number | null
  maxAllowanceMinor: number | null
  platformFeePct: number | null

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

/** The six plan price columns. The enabled-needs-prices CHECK names exactly these. */
export type PlanPriceField =
  | 'starterMonthlyMinor' | 'proMonthlyMinor' | 'maxMonthlyMinor'
  | 'proAllowanceMinor' | 'maxAllowanceMinor' | 'platformFeePct'

/**
 * 🔴 THE ONLY WAY A PLAN PRICE IS READ. Throws on NULL rather than returning a number to render — an
 * undecided price must stop the surface, not quietly borrow GB's (manual, "Currency and country": an
 * unknown (country, plan) is a loud failure, never a silent fallback to the UK number).
 */
export function requirePlanPrice(s: CountrySettings, field: PlanPriceField): number {
  const v = s[field]
  if (v === null || v === undefined || !Number.isFinite(v)) {
    throw new Error(`[country-settings] ${s.countryCode}.${field} is not set — plan prices for ${s.name} have not been decided. Refusing to show or charge a price.`)
  }
  return v
}

/** The two things a money formatter needs, taken from a settings row. */
export function moneyFormatOf(s: Pick<CountrySettings, 'currency' | 'locale'>): { currency: string; locale: string } {
  return { currency: s.currency, locale: s.locale }
}
