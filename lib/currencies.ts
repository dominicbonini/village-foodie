// lib/currencies.ts — 🔴 THE ONE LIST OF CURRENCIES HATCHGRAB SUPPORTS (currency-registry, 21 October 2026;
// docs/currency-registry-report.md). Pure, client-safe, no imports: the admin Countries page, the money formatter, the
// loader and the harness all read it.
//
// A country_settings row may only name a currency listed here — the database CHECK `country_settings_currency_chk`
// (supabase/migrations/20261028_currency_registry.sql) holds the same codes, and scripts/currency-registry.cjs fails if
// the two lists ever differ. ⚠️ ADDING A CURRENCY IS THEREFORE TWO EDITS: an entry here, and the CHECK.
//
// What each entry decides, and who reads it:
//   symbol        the currency's HOME symbol, as people in its own country write a price ("£29", "$49" in New Zealand,
//                 "29 kr" in Sweden). native-prices (22 October 2026, docs/native-prices-report.md, decided by Dominic on
//                 21 Oct): a country's OWN pages and screens show OUR plan prices in this home form — the pricing
//                 section, /features, /compare, the plans PDF, Manage › Billing and the plan prompts — exactly as a truck's
//                 own menu prices already are. Intl in the country's own locale gives it (country-settings-types
//                 planMoneyFormatOf); the harness checks it carries this symbol in the home locale.
//   intlSymbol    the INTERNATIONAL symbol — what a price shows where several currencies can sit side by side (Admin,
//                 /llms.txt): "NZ$49", "A$39", "SEK 29". Equal to `symbol` unless `symbolShared` (intlMoneyFormatOf).
//   symbolShared  the home symbol is SHARED with other currencies, so on its own it does not say which one it is ("$" is
//                 also the US dollar's; "kr" the Swedish, Norwegian, Danish and Icelandic crowns'). When true: the country's
//                 pages carry one line naming the currency ("Prices in New Zealand dollars (NZD)", `pricing.currencyLine`),
//                 and the side-by-side places use the international form. Each entry's value is justified beside it.
//   namePlural    the currency's name as the currency line says it ("New Zealand dollars"). English, like `name`.
//   homeDisplay   the ONE override, for a currency whose home locale Intl does not print the way locals write it:
//                 'narrowSymbol' (RON: ro-RO gives "29 RON", Romanians write "29 lei"). Absent = Intl's own form.
//   narrowIn      the locales where Intl writes the currency as a FOREIGN one but locals write its narrow symbol
//                 (europe-settings, 22 October 2026): en-GI gives "GB£29" because Gibraltar's own pound is GIP, but
//                 Gibraltar prices in sterling written "£29"; ro-RO's "29 RON" is "29 lei". lib/money-format.ts applies it
//                 to EVERY amount in that locale (menus, orders, emails), not only plan prices. Only those locales: a pound
//                 or a leu in any other locale is written exactly as before.
//   decimals      the minor unit's decimal places AS STRIPE TAKES AMOUNTS (docs.stripe.com/currencies: "Currencies are
//                 two-decimal currencies unless otherwise specified"). ⚠️ NOT Intl's: Intl gives HUF 0 decimals, but
//                 Stripe charges HUF in two-decimal minor units (its "special cases": only HUF PAYOUTS are whole forints),
//                 so 2900 minor units is HUF 29.00 — reading Intl would have sent a 100× wrong amount.
//   minorSign     the minor unit's sign beside an admin box that is typed in minor units ("25c", "20p", "30¢").
//   shortFee      how a small fixed fee is written in a sentence: 'minor' → "20p", "30¢", "30c"; 'amount' → "€0.25".
//                 EUR is 'amount' (ireland-1, decided: the euro pages quote Stripe's fee as "1.5% + €0.25").
//   locale        the currency's home locale — what the harness checks the home and international symbols in.
//   eftposNotice  the order page shows Stripe's dual-network debit notice (eftpos, Australia; anz-1 §5).
// ⛔ `planLocale` IS GONE (native-prices): it wrote a shared-symbol currency's plan prices in international English
// everywhere ("A$39" on Australia's own pages). The international form is now only for side-by-side places, and which
// currencies take it is `symbolShared`.

export interface CurrencyInfo {
  code: string
  name: string
  namePlural: string
  symbol: string
  intlSymbol: string
  symbolShared: boolean
  homeDisplay?: 'narrowSymbol'
  narrowIn?: readonly string[]
  decimals: number
  minorSign: string
  shortFee: 'minor' | 'amount'
  locale: string
  eftposNotice?: boolean
}

export const CURRENCIES: readonly CurrencyInfo[] = [
  // £: the pound sterling's. The other "£" pounds (Gibraltar, Falklands, St Helena) are local issues at par with it, and
  // the Egyptian, Lebanese and Syrian pounds write their own signs — so "£29" names one currency.
  { code: 'GBP', name: 'British pound', namePlural: 'British pounds', symbol: '£', intlSymbol: '£', symbolShared: false, narrowIn: ['en-GI'], decimals: 2, minorSign: 'p', shortFee: 'minor', locale: 'en-GB' },
  // $: shared in principle, but the bare "$" IS the US dollar wherever currencies are compared — every other dollar
  // qualifies itself against it (CA$, A$, NZ$: CLDR's international English), and the site's own "$" is the US one.
  { code: 'USD', name: 'US dollar', namePlural: 'US dollars', symbol: '$', intlSymbol: '$', symbolShared: false, decimals: 2, minorSign: '¢', shortFee: 'minor', locale: 'en-US' },
  // €: the euro's alone.
  { code: 'EUR', name: 'Euro', namePlural: 'euros', symbol: '€', intlSymbol: '€', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'en-IE' },
  // $: also the US, Australian and New Zealand dollars'.
  { code: 'CAD', name: 'Canadian dollar', namePlural: 'Canadian dollars', symbol: '$', intlSymbol: 'CA$', symbolShared: true, decimals: 2, minorSign: '¢', shortFee: 'minor', locale: 'en-CA' },
  // $: also the US, Canadian and New Zealand dollars'.
  { code: 'AUD', name: 'Australian dollar', namePlural: 'Australian dollars', symbol: '$', intlSymbol: 'A$', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'minor', locale: 'en-AU', eftposNotice: true },
  // $: also the US, Canadian and Australian dollars'.
  { code: 'NZD', name: 'New Zealand dollar', namePlural: 'New Zealand dollars', symbol: '$', intlSymbol: 'NZ$', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'minor', locale: 'en-NZ' },
  // ── Not yet used by any country: the non-euro European currencies we may open later. Their minor signs are proposals
  //    (docs/currency-registry-report.md §1) — nothing renders them until a row uses them.
  // "CHF": the franc is written with its own code at home (de-CH "CHF 29") — no other currency writes it.
  { code: 'CHF', name: 'Swiss franc', namePlural: 'Swiss francs', symbol: 'CHF', intlSymbol: 'CHF', symbolShared: false, decimals: 2, minorSign: 'Rp', shortFee: 'amount', locale: 'de-CH' },
  // kr: also the Norwegian, Danish and Icelandic crowns'.
  { code: 'SEK', name: 'Swedish krona', namePlural: 'Swedish kronor', symbol: 'kr', intlSymbol: 'SEK', symbolShared: true, decimals: 2, minorSign: 'öre', shortFee: 'amount', locale: 'sv-SE' },
  // kr: also the Swedish, Danish and Icelandic crowns'.
  { code: 'NOK', name: 'Norwegian krone', namePlural: 'Norwegian kroner', symbol: 'kr', intlSymbol: 'NOK', symbolShared: true, decimals: 2, minorSign: 'øre', shortFee: 'amount', locale: 'nb-NO' },
  // kr.: Danish writes the crown "kr." — the same letters as the Swedish, Norwegian and Icelandic "kr".
  { code: 'DKK', name: 'Danish krone', namePlural: 'Danish kroner', symbol: 'kr.', intlSymbol: 'DKK', symbolShared: true, decimals: 2, minorSign: 'øre', shortFee: 'amount', locale: 'da-DK' },
  // zł: the złoty's alone.
  { code: 'PLN', name: 'Polish złoty', namePlural: 'Polish złoty', symbol: 'zł', intlSymbol: 'zł', symbolShared: false, decimals: 2, minorSign: 'gr', shortFee: 'amount', locale: 'pl-PL' },
  // Kč: the Czech koruna's alone (the Slovak koruna, "Sk", ended with the euro in 2009).
  { code: 'CZK', name: 'Czech koruna', namePlural: 'Czech korunas', symbol: 'Kč', intlSymbol: 'Kč', symbolShared: false, decimals: 2, minorSign: 'h', shortFee: 'amount', locale: 'cs-CZ' },
  // Ft: the forint's alone.
  { code: 'HUF', name: 'Hungarian forint', namePlural: 'Hungarian forints', symbol: 'Ft', intlSymbol: 'Ft', symbolShared: false, decimals: 2, minorSign: 'f', shortFee: 'amount', locale: 'hu-HU' },
  // lei: Romania's. The Moldovan leu is also "lei" in Romanian speech, but writes "L" / "MDL" (CLDR) and is not one of ours,
  // so a Romanian page's "29 lei" is unambiguous. homeDisplay: ro-RO's standard symbol is the code ("29 RON").
  { code: 'RON', name: 'Romanian leu', namePlural: 'Romanian lei', symbol: 'lei', intlSymbol: 'lei', symbolShared: false, homeDisplay: 'narrowSymbol', narrowIn: ['ro-RO'], decimals: 2, minorSign: 'bani', shortFee: 'amount', locale: 'ro-RO' },
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
