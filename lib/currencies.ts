// lib/currencies.ts — 🔴 THE ONE LIST OF CURRENCIES HATCHGRAB SUPPORTS (currency-registry, 21 October 2026;
// docs/currency-registry-report.md). Pure, client-safe, no imports: the admin Countries page, the money formatter, the
// loader and the harness all read it.
//
// A country_settings row may only name a currency listed here — the database CHECK `country_settings_currency_chk`
// (supabase/migrations/20261028_currency_registry.sql) holds the same codes, and scripts/currency-registry.cjs fails if
// the two lists ever differ. ⚠️ ADDING A CURRENCY IS THEREFORE TWO EDITS: an entry here, and the CHECK.
//
// What each entry decides, and who reads it:
//   symbol        the symbol OUR PLAN PRICES show (pricing pages, /features, /compare, the plans PDF, Billing): "£29",
//                 "A$39". A truck's own menu prices keep its country's everyday symbol (Intl, moneyFormatOf).
//   decimals      the minor unit's decimal places AS STRIPE TAKES AMOUNTS (docs.stripe.com/currencies: "Currencies are
//                 two-decimal currencies unless otherwise specified"). ⚠️ NOT Intl's: Intl gives HUF 0 decimals, but
//                 Stripe charges HUF in two-decimal minor units (its "special cases": only HUF PAYOUTS are whole forints),
//                 so 2900 minor units is HUF 29.00 — reading Intl would have sent a 100× wrong amount.
//   minorSign     the minor unit's sign beside an admin box that is typed in minor units ("25c", "20p", "30¢").
//   shortFee      how a small fixed fee is written in a sentence: 'minor' → "20p", "30¢", "30c"; 'amount' → "€0.25".
//                 EUR is 'amount' (ireland-1, decided: the euro pages quote Stripe's fee as "1.5% + €0.25").
//   planLocale    plan prices are formatted in this locale instead of the country's — for a currency whose everyday
//                 symbol another listed currency shares ("$", "kr"), so the price names which one it is ("A$", "SEK").
//                 The US dollar keeps "$" (it is the "$" of the site). Absent = the country's own locale.
//   locale        the currency's home locale — what the harness checks the symbol in.
//   eftposNotice  the order page shows Stripe's dual-network debit notice (eftpos, Australia; anz-1 §5).

export interface CurrencyInfo {
  code: string
  name: string
  symbol: string
  decimals: number
  minorSign: string
  shortFee: 'minor' | 'amount'
  planLocale?: string
  locale: string
  eftposNotice?: boolean
}

export const CURRENCIES: readonly CurrencyInfo[] = [
  { code: 'GBP', name: 'British pound', symbol: '£', decimals: 2, minorSign: 'p', shortFee: 'minor', locale: 'en-GB' },
  { code: 'USD', name: 'US dollar', symbol: '$', decimals: 2, minorSign: '¢', shortFee: 'minor', locale: 'en-US' },
  { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'en-IE' },
  { code: 'CAD', name: 'Canadian dollar', symbol: 'CA$', decimals: 2, minorSign: '¢', shortFee: 'minor', planLocale: 'en', locale: 'en-CA' },
  { code: 'AUD', name: 'Australian dollar', symbol: 'A$', decimals: 2, minorSign: 'c', shortFee: 'minor', planLocale: 'en', locale: 'en-AU', eftposNotice: true },
  { code: 'NZD', name: 'New Zealand dollar', symbol: 'NZ$', decimals: 2, minorSign: 'c', shortFee: 'minor', planLocale: 'en', locale: 'en-NZ' },
  // ── Not yet used by any country: the non-euro European currencies we may open later. Their minor signs and the "kr"
  //    qualification are proposals (docs/currency-registry-report.md §1) — nothing renders them until a row uses them.
  { code: 'CHF', name: 'Swiss franc', symbol: 'CHF', decimals: 2, minorSign: 'Rp', shortFee: 'amount', locale: 'de-CH' },
  { code: 'SEK', name: 'Swedish krona', symbol: 'SEK', decimals: 2, minorSign: 'öre', shortFee: 'amount', planLocale: 'en', locale: 'sv-SE' },
  { code: 'NOK', name: 'Norwegian krone', symbol: 'NOK', decimals: 2, minorSign: 'øre', shortFee: 'amount', planLocale: 'en', locale: 'nb-NO' },
  { code: 'DKK', name: 'Danish krone', symbol: 'DKK', decimals: 2, minorSign: 'øre', shortFee: 'amount', planLocale: 'en', locale: 'da-DK' },
  { code: 'PLN', name: 'Polish złoty', symbol: 'zł', decimals: 2, minorSign: 'gr', shortFee: 'amount', locale: 'pl-PL' },
  { code: 'CZK', name: 'Czech koruna', symbol: 'Kč', decimals: 2, minorSign: 'h', shortFee: 'amount', locale: 'cs-CZ' },
  { code: 'HUF', name: 'Hungarian forint', symbol: 'Ft', decimals: 2, minorSign: 'f', shortFee: 'amount', locale: 'hu-HU' },
  { code: 'RON', name: 'Romanian leu', symbol: 'RON', decimals: 2, minorSign: 'bani', shortFee: 'amount', locale: 'ro-RO' },
]

/** Every supported ISO 4217 code, in the list's order — what the database CHECK allows. */
export const CURRENCY_CODES: readonly string[] = CURRENCIES.map(c => c.code)

const BY_CODE = new Map(CURRENCIES.map(c => [c.code, c]))

/** The registry entry for a code (any case), or null when the currency is not supported. */
export function currencyInfo(code: string | null | undefined): CurrencyInfo | null {
  return typeof code === 'string' ? BY_CODE.get(code.trim().toUpperCase()) ?? null : null
}

/** True for a code the registry lists. */
export function isSupportedCurrency(code: string | null | undefined): boolean {
  return currencyInfo(code) !== null
}
