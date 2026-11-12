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
import type { AllergenSet } from '@/lib/allergens'

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
  /** world-countries-1 (31 October 2026): MAY HatchGrab take a platform fee here at all? False where Stripe does not let a platform
   *  outside the country collect an application fee on its connected accounts (Brazil, Mexico, Malaysia, Singapore, Thailand).
   *  🔴 It overrides `platformFeeEnabled` (platformFeeOn below), and the database refuses enabled without allowed
   *  (country_settings_platform_fee_allowed_chk) — so switching the fee on later can never break card payments there. */
  platformFeeAllowed: boolean
  /** Whether the service fee and card surcharge are taxed (D8). Default false. */
  feesTaxed: boolean
  allergenSet: AllergenSet   // anz-1: Australia / New Zealand (lib/allergens.ts ANZ); canada-1: Canada (CA); world-countries-1: jp, br, codex
  /** allergen-card-country (21 October 2026): may a truck here show its allergens as ONE card for the whole menu
   *  (allergen_display_mode 'card')? True everywhere except where the law requires allergens per dish (Ireland, FSAI). */
  allergenCardOnlyAllowed: boolean
  /** faq-1 (1 November 2026): is the iPad app / the Android app in this country's App Store / Google Play
   *  (country_settings.ios_app_available / android_app_available, 20261042 — the flags the comparison pages read through
   *  lib/comparison-flags.ts)? ⚠️ SET ONLY BY THE ADMIN COUNTRIES STORE (lib/admin/country-store.ts): the public loader never
   *  reads them, so no public page's data changes. Absent = not read, and a save then leaves the columns as they are. */
  iosAppAvailable?: boolean
  androidAppAvailable?: boolean

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

  /** pricing-copy-4 (12 November 2026, docs/pricing-copy-4-report.md): the country's public.country_billing.payment_model, read by
   *  the loader with the row (lib/country-settings.ts). null = the country has NO country_billing row. Absent (undefined) = not
   *  read — a harness fixture, or an object built before this field existed. Ask offersOnlineCardPayments() below, never this. */
  paymentModel?: CountryPaymentModel | null
}

/** pricing-copy-4: public.country_billing.payment_model's three values — the same union as lib/billing/rules.ts PaymentModel (written
 *  here, not imported, so this module keeps no import beyond the pure ones: some harnesses compile it on its own). */
export type CountryPaymentModel = 'fee_from_payment' | 'billed_online' | 'billed_at_truck'
/** The same three, as a list (scripts/pricing-copy-4.cjs checks it equals lib/billing/rules.ts PAYMENT_MODELS). */
export const COUNTRY_PAYMENT_MODELS: readonly CountryPaymentModel[] = ['fee_from_payment', 'billed_online', 'billed_at_truck']

/**
 * pricing-copy-4 (12 November 2026, Dominic; docs/pricing-copy-4-report.md): 🔴 THE ONE ANSWER TO "IS THIS A CARD COUNTRY?" — can a
 * truck here take ONLINE CARD PAYMENTS? Yes when its country's payment model offers online payments (country_billing.payment_model
 * 'fee_from_payment' or 'billed_online': today's 44 live Stripe countries, and any country switched on later with one of those
 * models, e.g. Puerto Rico). No when the model is 'billed_at_truck' ("monthly billing only": customers pay at the truck, the truck's
 * card is billed monthly) or when the country has no country_billing row at all.
 * Every pricing surface asks this, never its own list: the landing's banner, Pay as you go's fee line, Pro's asterisk and the
 * card-fee footnote (components/pricing/PricingSection.tsx), the plan table's fee row (components/pricing/PlanTable.tsx), /features'
 * and Manage › Billing's footnote, the plans PDF (lib/plans-pdf.ts) and /llms.txt's card sentence (lib/llms-text.ts).
 * ⚠️ A settings object the loader did not build (paymentModel absent — a harness fixture) answers YES, i.e. it renders as every
 * live country renders today; the loader always sets the field (null when there is no row), so a real page never takes that path.
 */
export function offersOnlineCardPayments(s: Pick<CountrySettings, 'paymentModel'>): boolean {
  if (s.paymentModel === undefined) return true
  return s.paymentModel === 'fee_from_payment' || s.paymentModel === 'billed_online'
}

/**
 * world-countries-1 (31 October 2026): 🔴 THE ONE ANSWER TO "IS THE PLATFORM FEE ON IN THIS COUNTRY?" — switched on AND allowed.
 * Every path that would compute, store or send a platform (application) fee asks this, never `platformFeeEnabled` alone
 * (lib/order-charge-rules.ts today; the capture path when the fee lands — scripts/world-countries-1.cjs fails if any file sends
 * an application fee without it).
 */
export function platformFeeOn(s: Pick<CountrySettings, 'platformFeeEnabled'> & { platformFeeAllowed?: boolean }): boolean {
  return s.platformFeeEnabled === true && s.platformFeeAllowed !== false
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
export function currencyLineOf(s: Pick<CountrySettings, 'currency'> & { locale?: string | null }): { currency: string; code: string } | null {
  const c = currencyInfo(s.currency)
  if (!c?.symbolShared) return null
  // europe-languages-1 (22 October 2026): the registry's names are English ("Swedish kronor"), so a page in another language
  // names the currency in its own words — Intl's display name ("svensk krona"), framed by that language's message. Every
  // English locale keeps the registry's plural, exactly as before.
  if (s.locale && !/^en(-|$)/i.test(s.locale)) {
    try { const name = new Intl.DisplayNames([s.locale], { type: 'currency' }).of(c.code); if (name) return { currency: name, code: c.code } } catch { /* the registry's name below */ }
  }
  return { currency: c.namePlural, code: c.code }
}
