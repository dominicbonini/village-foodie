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
//   printedSymbol world-countries-2 (1 November 2026, Dominic): the symbol PRINTED in place of the one Intl gives, in every
//                 locale — JPY's normal-width "¥" where ja-JP's Intl writes the full-width "￥". lib/money-format.ts applies it to
//                 every amount (menus, orders, emails, plan prices). Absent = Intl's own symbol.
//   symbolTight   world-countries-2: no space between the symbol and the figure, in every locale — MYR "RM29" where ms-MY's
//                 Intl writes "RM 29". lib/money-format.ts applies it to every amount. Absent = Intl's own spacing.
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
  printedSymbol?: string
  symbolTight?: boolean
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
  // ── world-countries-1 (31 October 2026, docs/world-countries-1-report.md §1): Brazil, Mexico, Japan, Singapore, Hong Kong,
  //    Malaysia, the UAE and Thailand. Each home form is Intl's in the country's locale (native-prices), but for two printing
  //    overrides world-countries-2 added (JPY's "¥", MYR's "RM29").
  //    Small fees are written as amounts ("R$ 0,39"), as each country's Stripe pricing page writes them.
  // R$: the real's alone (pt-BR "R$ 59").
  { code: 'BRL', name: 'Brazilian real', namePlural: 'Brazilian reais', symbol: 'R$', intlSymbol: 'R$', symbolShared: false, decimals: 2, minorSign: 'centavos', shortFee: 'amount', locale: 'pt-BR' },
  // $: Mexico writes its peso "$349", the US dollar's sign — so the page names the currency (es-MX); side by side it is "MX$".
  { code: 'MXN', name: 'Mexican peso', namePlural: 'Mexican pesos', symbol: '$', intlSymbol: 'MX$', symbolShared: true, decimals: 2, minorSign: 'centavos', shortFee: 'amount', locale: 'es-MX' },
  // ¥: world-countries-2 (Dominic, 1 November 2026) — the NORMAL-WIDTH sign everywhere ("¥1,980"). ja-JP's Intl writes the
  // full-width "￥", so printedSymbol replaces it on every amount. (world-countries-1 had kept Intl's "￥".) English writes "¥1,980", and
  // the yuan writes itself "CN¥" beside it, so the yen's sign names one currency here. 🔴 ZERO-DECIMAL AT STRIPE: an amount in
  // JPY is whole yen ("minor unit" = 1 yen), never ×100 (docs.stripe.com/currencies#zero-decimal).
  { code: 'JPY', name: 'Japanese yen', namePlural: 'Japanese yen', symbol: '¥', intlSymbol: '¥', symbolShared: false, printedSymbol: '¥', decimals: 0, minorSign: '¥', shortFee: 'amount', locale: 'ja-JP' },
  // $: Singapore writes "$29" — also the US, Canadian, Australian and New Zealand dollars' sign; side by side international English
  // writes it "SGD 29" (as it does SEK), which is what the international form prints.
  { code: 'SGD', name: 'Singapore dollar', namePlural: 'Singapore dollars', symbol: '$', intlSymbol: 'SGD', symbolShared: true, decimals: 2, minorSign: '¢', shortFee: 'amount', locale: 'en-SG' },
  // HK$: zh-HK writes "HK$119" — the letters name it, so no line is needed.
  { code: 'HKD', name: 'Hong Kong dollar', namePlural: 'Hong Kong dollars', symbol: 'HK$', intlSymbol: 'HK$', symbolShared: false, decimals: 2, minorSign: '¢', shortFee: 'amount', locale: 'zh-HK' },
  // RM: the ringgit's alone, written against the figure — "RM29" (world-countries-2, Dominic, 1 November 2026: ms-MY's Intl
  // writes "RM 29", so symbolTight drops the space on every amount).
  { code: 'MYR', name: 'Malaysian ringgit', namePlural: 'Malaysian ringgit', symbol: 'RM', intlSymbol: 'RM', symbolShared: false, symbolTight: true, decimals: 2, minorSign: 'sen', shortFee: 'amount', locale: 'ms-MY' },
  // د.إ.: the dirham's own sign, after the number in ar-AE ("59 د.إ."); it names one currency, so the side-by-side form is the same.
  { code: 'AED', name: 'UAE dirham', namePlural: 'UAE dirhams', symbol: 'د.إ.', intlSymbol: 'د.إ.', symbolShared: false, decimals: 2, minorSign: 'fils', shortFee: 'amount', locale: 'ar-AE' },
  // ฿: the baht's alone (th-TH "฿199").
  { code: 'THB', name: 'Thai baht', namePlural: 'Thai baht', symbol: '฿', intlSymbol: '฿', symbolShared: false, decimals: 2, minorSign: 'satang', shortFee: 'amount', locale: 'th-TH' },
  // ── world-countries-5 (12 November 2026): the 94 currencies of the 167 new countries (billing_currency in docs/world-countries-4/
  // go-live.csv), from Intl/CLDR in the home locale named on each; decimals are Stripe's (zero-decimal: BIF CLP DJF GNF KMF KRW MGA PYG
  // VUV XAF XOF XPF; ISK and UGX two-decimal as Stripe takes them). Generated by world-countries-5's currency step; each line's comment
  // gives its symbol's reason. minorSign 'c' and shortFee 'amount' throughout (a fee is written as an amount: "₴5.00").
  // Lekë: the Albanian Lek's own sign. world-countries-5 (Albania; Intl in sq-AL).
  { code: 'ALL', name: 'Albanian Lek', namePlural: 'Albanian lekë', symbol: 'Lekë', intlSymbol: 'Lekë', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'sq-AL' },
  // ֏: the Armenian Dram's own sign. world-countries-5 (Armenia; Intl in hy-AM).
  { code: 'AMD', name: 'Armenian Dram', namePlural: 'Armenian drams', symbol: '֏', intlSymbol: '֏', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'hy-AM' },
  // ₼: the Azerbaijani Manat's own sign. world-countries-5 (Azerbaijan; Intl in az-AZ).
  { code: 'AZN', name: 'Azerbaijani Manat', namePlural: 'Azerbaijani manats', symbol: '₼', intlSymbol: '₼', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'az-AZ' },
  // KM: the Bosnia-Herzegovina Convertible Mark's own sign. world-countries-5 (Bosnia & Herzegovina; Intl in bs-BA).
  { code: 'BAM', name: 'Bosnia-Herzegovina Convertible Mark', namePlural: 'Bosnia-Herzegovina convertible marks', symbol: 'KM', intlSymbol: 'KM', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'bs-BA' },
  // ₾: the Georgian Lari's own sign. world-countries-5 (Georgia; Intl in ka-GE).
  { code: 'GEL', name: 'Georgian Lari', namePlural: 'Georgian laris', symbol: '₾', intlSymbol: '₾', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'ka-GE' },
  // kr.: shared (also another currency's sign) — side by side it is "ISK". world-countries-5 (Iceland; Intl in is-IS).
  { code: 'ISK', name: 'Icelandic Króna', namePlural: 'Icelandic krónur', symbol: 'kr.', intlSymbol: 'ISK', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'is-IS' },
  // L: shared (also another currency's sign) — side by side it is "MDL". world-countries-5 (Moldova; Intl in ro-MD).
  { code: 'MDL', name: 'Moldovan Leu', namePlural: 'Moldovan lei', symbol: 'L', intlSymbol: 'MDL', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'ro-MD' },
  // ден.: the Macedonian Denar's own sign. world-countries-5 (North Macedonia; Intl in mk-MK).
  { code: 'MKD', name: 'Macedonian Denar', namePlural: 'Macedonian denari', symbol: 'ден.', intlSymbol: 'ден.', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'mk-MK' },
  // RSD: the Serbian Dinar's own sign. world-countries-5 (Serbia; Intl in sr-RS).
  { code: 'RSD', name: 'Serbian Dinar', namePlural: 'Serbian dinars', symbol: 'RSD', intlSymbol: 'RSD', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'sr-RS' },
  // ₺: the Turkish Lira's own sign. world-countries-5 (Türkiye; Intl in tr-TR).
  { code: 'TRY', name: 'Turkish Lira', namePlural: 'Turkish Lira', symbol: '₺', intlSymbol: '₺', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'tr-TR' },
  // ₴: the Ukrainian Hryvnia's own sign. world-countries-5 (Ukraine; Intl in uk-UA).
  { code: 'UAH', name: 'Ukrainian Hryvnia', namePlural: 'Ukrainian hryvnias', symbol: '₴', intlSymbol: '₴', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'uk-UA' },
  // $: shared (also another currency's sign) — side by side it is "EC$". world-countries-5 (Anguilla; Intl in en-AI).
  { code: 'XCD', name: 'East Caribbean Dollar', namePlural: 'East Caribbean dollars', symbol: '$', intlSymbol: 'EC$', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'en-AI' },
  // $: shared (also another currency's sign) — side by side it is "ARS". world-countries-5 (Argentina; Intl in es-AR).
  { code: 'ARS', name: 'Argentine Peso', namePlural: 'Argentine pesos', symbol: '$', intlSymbol: 'ARS', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'es-AR' },
  // Afl.: the Aruban Florin's own sign. world-countries-5 (Aruba; Intl in nl-AW).
  { code: 'AWG', name: 'Aruban Florin', namePlural: 'Aruban florin', symbol: 'Afl.', intlSymbol: 'Afl.', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'nl-AW' },
  // $: shared (also another currency's sign) — side by side it is "BSD". world-countries-5 (Bahamas; Intl in en-BS).
  { code: 'BSD', name: 'Bahamian Dollar', namePlural: 'Bahamian dollars', symbol: '$', intlSymbol: 'BSD', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'en-BS' },
  // $: shared (also another currency's sign) — side by side it is "BZD". world-countries-5 (Belize; Intl in en-BZ).
  { code: 'BZD', name: 'Belize Dollar', namePlural: 'Belize dollars', symbol: '$', intlSymbol: 'BZD', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'en-BZ' },
  // $: shared (also another currency's sign) — side by side it is "BMD". world-countries-5 (Bermuda; Intl in en-BM).
  { code: 'BMD', name: 'Bermudan Dollar', namePlural: 'Bermudan dollars', symbol: '$', intlSymbol: 'BMD', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'en-BM' },
  // Bs: shared (also another currency's sign) — side by side it is "BOB". world-countries-5 (Bolivia; Intl in es-BO).
  { code: 'BOB', name: 'Bolivian Boliviano', namePlural: 'Bolivian bolivianos', symbol: 'Bs', intlSymbol: 'BOB', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'es-BO' },
  // $: shared (also another currency's sign) — side by side it is "KYD". world-countries-5 (Cayman Islands; Intl in en-KY).
  { code: 'KYD', name: 'Cayman Islands Dollar', namePlural: 'Cayman Islands dollars', symbol: '$', intlSymbol: 'KYD', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'en-KY' },
  // $: shared (also another currency's sign) — side by side it is "CLP". world-countries-5 (Chile; Intl in es-CL).
  { code: 'CLP', name: 'Chilean Peso', namePlural: 'Chilean pesos', symbol: '$', intlSymbol: 'CLP', symbolShared: true, decimals: 0, minorSign: 'c', shortFee: 'amount', locale: 'es-CL' },
  // $: shared (also another currency's sign) — side by side it is "COP". world-countries-5 (Colombia; Intl in es-CO).
  { code: 'COP', name: 'Colombian Peso', namePlural: 'Colombian pesos', symbol: '$', intlSymbol: 'COP', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'es-CO' },
  // ₡: the Costa Rican Colón's own sign. world-countries-5 (Costa Rica; Intl in es-CR).
  { code: 'CRC', name: 'Costa Rican Colón', namePlural: 'Costa Rican colóns', symbol: '₡', intlSymbol: '₡', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'es-CR' },
  // Cg.: the Caribbean guilder's own sign. world-countries-5 (Curaçao; Intl in pap-CW).
  { code: 'XCG', name: 'Caribbean guilder', namePlural: 'Caribbean guilders', symbol: 'Cg.', intlSymbol: 'Cg.', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'pap-CW' },
  // RD$: shared (also another currency's sign) — side by side it is "DOP". world-countries-5 (Dominican Republic; Intl in es-DO).
  { code: 'DOP', name: 'Dominican Peso', namePlural: 'Dominican pesos', symbol: 'RD$', intlSymbol: 'DOP', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'es-DO' },
  // £: shared (also another currency's sign) — side by side it is "FKP". world-countries-5 (Falkland Islands; Intl in en-FK).
  { code: 'FKP', name: 'Falkland Islands Pound', namePlural: 'Falkland Islands pounds', symbol: '£', intlSymbol: 'FKP', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'en-FK' },
  // Q: shared (also another currency's sign) — side by side it is "GTQ". world-countries-5 (Guatemala; Intl in es-GT).
  { code: 'GTQ', name: 'Guatemalan Quetzal', namePlural: 'Guatemalan quetzals', symbol: 'Q', intlSymbol: 'GTQ', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'es-GT' },
  // $: shared (also another currency's sign) — side by side it is "GYD". world-countries-5 (Guyana; Intl in en-GY).
  { code: 'GYD', name: 'Guyanaese Dollar', namePlural: 'Guyanaese dollars', symbol: '$', intlSymbol: 'GYD', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'en-GY' },
  // L: shared (also another currency's sign) — side by side it is "HNL". world-countries-5 (Honduras; Intl in es-HN).
  { code: 'HNL', name: 'Honduran Lempira', namePlural: 'Honduran lempiras', symbol: 'L', intlSymbol: 'HNL', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'es-HN' },
  // $: shared (also another currency's sign) — side by side it is "JMD". world-countries-5 (Jamaica; Intl in en-JM).
  { code: 'JMD', name: 'Jamaican Dollar', namePlural: 'Jamaican dollars', symbol: '$', intlSymbol: 'JMD', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'en-JM' },
  // C$: shared (also another currency's sign) — side by side it is "NIO". world-countries-5 (Nicaragua; Intl in es-NI).
  { code: 'NIO', name: 'Nicaraguan Córdoba', namePlural: 'Nicaraguan córdobas', symbol: 'C$', intlSymbol: 'NIO', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'es-NI' },
  // B/.: shared (also another currency's sign) — side by side it is "PAB". world-countries-5 (Panama; Intl in es-PA).
  { code: 'PAB', name: 'Panamanian Balboa', namePlural: 'Panamanian balboas', symbol: 'B/.', intlSymbol: 'PAB', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'es-PA' },
  // PYG: the Paraguayan Guarani's own sign. world-countries-5 (Paraguay; Intl in gn-PY).
  { code: 'PYG', name: 'Paraguayan Guarani', namePlural: 'Paraguayan guaranis', symbol: 'PYG', intlSymbol: 'PYG', symbolShared: false, decimals: 0, minorSign: 'c', shortFee: 'amount', locale: 'gn-PY' },
  // S/: shared (also another currency's sign) — side by side it is "PEN". world-countries-5 (Peru; Intl in es-PE).
  { code: 'PEN', name: 'Peruvian Sol', namePlural: 'Peruvian soles', symbol: 'S/', intlSymbol: 'PEN', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'es-PE' },
  // $: shared (also another currency's sign) — side by side it is "SRD". world-countries-5 (Suriname; Intl in nl-SR).
  { code: 'SRD', name: 'Surinamese Dollar', namePlural: 'Surinamese dollars', symbol: '$', intlSymbol: 'SRD', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'nl-SR' },
  // $: shared (also another currency's sign) — side by side it is "TTD". world-countries-5 (Trinidad & Tobago; Intl in en-TT).
  { code: 'TTD', name: 'Trinidad & Tobago Dollar', namePlural: 'Trinidad & Tobago dollars', symbol: '$', intlSymbol: 'TTD', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'en-TT' },
  // $: shared (also another currency's sign) — side by side it is "UYU". world-countries-5 (Uruguay; Intl in es-UY).
  { code: 'UYU', name: 'Uruguayan Peso', namePlural: 'Uruguayan pesos', symbol: '$', intlSymbol: 'UYU', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'es-UY' },
  // ৳: the Bangladeshi Taka's own sign. world-countries-5 (Bangladesh; Intl in bn-BD).
  { code: 'BDT', name: 'Bangladeshi Taka', namePlural: 'Bangladeshi takas', symbol: '৳', intlSymbol: '৳', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'bn-BD' },
  // $: shared (also another currency's sign) — side by side it is "BND". world-countries-5 (Brunei; Intl in ms-BN).
  { code: 'BND', name: 'Brunei Dollar', namePlural: 'Brunei dollars', symbol: '$', intlSymbol: 'BND', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'ms-BN' },
  // ៛: the Cambodian Riel's own sign. world-countries-5 (Cambodia; Intl in km-KH).
  { code: 'KHR', name: 'Cambodian Riel', namePlural: 'Cambodian riels', symbol: '៛', intlSymbol: '៛', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'km-KH' },
  // $: shared (also another currency's sign) — side by side it is "FJD". world-countries-5 (Fiji; Intl in en-FJ).
  { code: 'FJD', name: 'Fijian Dollar', namePlural: 'Fijian dollars', symbol: '$', intlSymbol: 'FJD', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'en-FJ' },
  // FCFP: the CFP Franc's own sign. world-countries-5 (French Polynesia; Intl in fr-PF).
  { code: 'XPF', name: 'CFP Franc', namePlural: 'CFP francs', symbol: 'FCFP', intlSymbol: 'FCFP', symbolShared: false, decimals: 0, minorSign: 'c', shortFee: 'amount', locale: 'fr-PF' },
  // ₹: the Indian Rupee's own sign. world-countries-5 (India; Intl in hi-IN).
  { code: 'INR', name: 'Indian Rupee', namePlural: 'Indian rupees', symbol: '₹', intlSymbol: '₹', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'hi-IN' },
  // Rp: the Indonesian Rupiah's own sign. world-countries-5 (Indonesia; Intl in id-ID).
  { code: 'IDR', name: 'Indonesian Rupiah', namePlural: 'Indonesian rupiahs', symbol: 'Rp', intlSymbol: 'Rp', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'id-ID' },
  // ₸: the Kazakhstani Tenge's own sign. world-countries-5 (Kazakhstan; Intl in ru-KZ).
  { code: 'KZT', name: 'Kazakhstani Tenge', namePlural: 'Kazakhstani tenges', symbol: '₸', intlSymbol: '₸', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'ru-KZ' },
  // ₩: the South Korean Won's own sign. world-countries-5 (South Korea; Intl in ko-KR).
  { code: 'KRW', name: 'South Korean Won', namePlural: 'South Korean won', symbol: '₩', intlSymbol: '₩', symbolShared: false, decimals: 0, minorSign: 'c', shortFee: 'amount', locale: 'ko-KR' },
  // сом: the Kyrgyz Som's own sign. world-countries-5 (Kyrgyzstan; Intl in ky-KG).
  { code: 'KGS', name: 'Kyrgyz Som', namePlural: 'Kyrgyz soms', symbol: 'сом', intlSymbol: 'сом', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'ky-KG' },
  // ₭: the Laotian Kip's own sign. world-countries-5 (Laos; Intl in lo-LA).
  { code: 'LAK', name: 'Laotian Kip', namePlural: 'Laotian kips', symbol: '₭', intlSymbol: '₭', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'lo-LA' },
  // MOP$: the Macanese Pataca's own sign. world-countries-5 (Macao SAR China; Intl in zh-MO).
  { code: 'MOP', name: 'Macanese Pataca', namePlural: 'Macanese patacas', symbol: 'MOP$', intlSymbol: 'MOP$', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'zh-MO' },
  // MVR: the Maldivian Rufiyaa's own sign. world-countries-5 (Maldives; Intl in dv-MV).
  { code: 'MVR', name: 'Maldivian Rufiyaa', namePlural: 'Maldivian rufiyaas', symbol: 'MVR', intlSymbol: 'MVR', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'dv-MV' },
  // ₮: the Mongolian Tugrik's own sign. world-countries-5 (Mongolia; Intl in mn-MN).
  { code: 'MNT', name: 'Mongolian Tugrik', namePlural: 'Mongolian tugriks', symbol: '₮', intlSymbol: '₮', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'mn-MN' },
  // नेरू: the Nepalese Rupee's own sign. world-countries-5 (Nepal; Intl in ne-NP).
  { code: 'NPR', name: 'Nepalese Rupee', namePlural: 'Nepalese rupees', symbol: 'नेरू', intlSymbol: 'नेरू', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'ne-NP' },
  // Rs: shared (also another currency's sign) — side by side it is "PKR". world-countries-5 (Pakistan; Intl in ur-PK).
  { code: 'PKR', name: 'Pakistani Rupee', namePlural: 'Pakistani rupees', symbol: 'Rs', intlSymbol: 'PKR', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'ur-PK' },
  // PGK: the Papua New Guinean Kina's own sign. world-countries-5 (Papua New Guinea; Intl in tpi-PG).
  { code: 'PGK', name: 'Papua New Guinean Kina', namePlural: 'Papua New Guinean kina', symbol: 'PGK', intlSymbol: 'PGK', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'tpi-PG' },
  // WST: the Samoan Tala's own sign. world-countries-5 (Samoa; Intl in sm-WS).
  { code: 'WST', name: 'Samoan Tala', namePlural: 'Samoan tala', symbol: 'WST', intlSymbol: 'WST', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'sm-WS' },
  // $: shared (also another currency's sign) — side by side it is "SBD". world-countries-5 (Solomon Islands; Intl in en-SB).
  { code: 'SBD', name: 'Solomon Islands Dollar', namePlural: 'Solomon Islands dollars', symbol: '$', intlSymbol: 'SBD', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'en-SB' },
  // රු.: the Sri Lankan Rupee's own sign. world-countries-5 (Sri Lanka; Intl in si-LK).
  { code: 'LKR', name: 'Sri Lankan Rupee', namePlural: 'Sri Lankan rupees', symbol: 'රු.', intlSymbol: 'රු.', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'si-LK' },
  // $: shared (also another currency's sign) — side by side it is "NT$". world-countries-5 (Taiwan; Intl in zh-TW).
  { code: 'TWD', name: 'New Taiwan Dollar', namePlural: 'New Taiwan dollars', symbol: '$', intlSymbol: 'NT$', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'zh-TW' },
  // сом.: the Tajikistani Somoni's own sign. world-countries-5 (Tajikistan; Intl in tg-TJ).
  { code: 'TJS', name: 'Tajikistani Somoni', namePlural: 'Tajikistani somonis', symbol: 'сом.', intlSymbol: 'сом.', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'tg-TJ' },
  // T$: shared (also another currency's sign) — side by side it is "TOP". world-countries-5 (Tonga; Intl in to-TO).
  { code: 'TOP', name: 'Tongan Paʻanga', namePlural: 'Tongan paʻanga', symbol: 'T$', intlSymbol: 'TOP', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'to-TO' },
  // soʻm: the Uzbekistani Som's own sign. world-countries-5 (Uzbekistan; Intl in uz-UZ).
  { code: 'UZS', name: 'Uzbekistani Som', namePlural: 'Uzbekistani som', symbol: 'soʻm', intlSymbol: 'soʻm', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'uz-UZ' },
  // VUV: the Vanuatu Vatu's own sign. world-countries-5 (Vanuatu; Intl in bi-VU).
  { code: 'VUV', name: 'Vanuatu Vatu', namePlural: 'Vanuatu vatus', symbol: 'VUV', intlSymbol: 'VUV', symbolShared: false, decimals: 0, minorSign: 'c', shortFee: 'amount', locale: 'bi-VU' },
  // ₪: the Israeli New Shekel's own sign. world-countries-5 (Israel; Intl in he-IL).
  { code: 'ILS', name: 'Israeli New Shekel', namePlural: 'Israeli new shekels', symbol: '₪', intlSymbol: '₪', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'he-IL' },
  // ر.ق.: the Qatari Riyal's own sign. world-countries-5 (Qatar; Intl in ar-QA).
  { code: 'QAR', name: 'Qatari Riyal', namePlural: 'Qatari riyals', symbol: 'ر.ق.', intlSymbol: 'ر.ق.', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'ar-QA' },
  // ر.س.: the Saudi Riyal's own sign. world-countries-5 (Saudi Arabia; Intl in ar-SA).
  { code: 'SAR', name: 'Saudi Riyal', namePlural: 'Saudi riyals', symbol: 'ر.س.', intlSymbol: 'ر.س.', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'ar-SA' },
  // د.ج.: the Algerian Dinar's own sign. world-countries-5 (Algeria; Intl in ar-DZ).
  { code: 'DZD', name: 'Algerian Dinar', namePlural: 'Algerian dinars', symbol: 'د.ج.', intlSymbol: 'د.ج.', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'ar-DZ' },
  // Kz: the Angolan Kwanza's own sign. world-countries-5 (Angola; Intl in pt-AO).
  { code: 'AOA', name: 'Angolan Kwanza', namePlural: 'Angolan kwanzas', symbol: 'Kz', intlSymbol: 'Kz', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'pt-AO' },
  // F CFA: the West African CFA Franc's own sign. world-countries-5 (Benin; Intl in fr-BJ).
  { code: 'XOF', name: 'West African CFA Franc', namePlural: 'West African CFA francs', symbol: 'F CFA', intlSymbol: 'F CFA', symbolShared: false, decimals: 0, minorSign: 'c', shortFee: 'amount', locale: 'fr-BJ' },
  // P: shared (also another currency's sign) — side by side it is "BWP". world-countries-5 (Botswana; Intl in en-BW).
  { code: 'BWP', name: 'Botswanan Pula', namePlural: 'Botswanan pulas', symbol: 'P', intlSymbol: 'BWP', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'en-BW' },
  // FBu: the Burundian Franc's own sign. world-countries-5 (Burundi; Intl in rn-BI).
  { code: 'BIF', name: 'Burundian Franc', namePlural: 'Burundian francs', symbol: 'FBu', intlSymbol: 'FBu', symbolShared: false, decimals: 0, minorSign: 'c', shortFee: 'amount', locale: 'rn-BI' },
  // CVE: the Cape Verdean Escudo's own sign. world-countries-5 (Cape Verde; Intl in en-CV).
  { code: 'CVE', name: 'Cape Verdean Escudo', namePlural: 'Cape Verdean escudos', symbol: 'CVE', intlSymbol: 'CVE', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'en-CV' },
  // FCFA: the Central African CFA Franc's own sign. world-countries-5 (Central African Republic; Intl in sg-CF).
  { code: 'XAF', name: 'Central African CFA Franc', namePlural: 'Central African CFA francs', symbol: 'FCFA', intlSymbol: 'FCFA', symbolShared: false, decimals: 0, minorSign: 'c', shortFee: 'amount', locale: 'sg-CF' },
  // CF: the Comorian Franc's own sign. world-countries-5 (Comoros; Intl in ar-KM).
  { code: 'KMF', name: 'Comorian Franc', namePlural: 'Comorian francs', symbol: 'CF', intlSymbol: 'CF', symbolShared: false, decimals: 0, minorSign: 'c', shortFee: 'amount', locale: 'ar-KM' },
  // Fdj: the Djiboutian Franc's own sign. world-countries-5 (Djibouti; Intl in fr-DJ).
  { code: 'DJF', name: 'Djiboutian Franc', namePlural: 'Djiboutian francs', symbol: 'Fdj', intlSymbol: 'Fdj', symbolShared: false, decimals: 0, minorSign: 'c', shortFee: 'amount', locale: 'fr-DJ' },
  // ج.م.: the Egyptian Pound's own sign. world-countries-5 (Egypt; Intl in ar-EG).
  { code: 'EGP', name: 'Egyptian Pound', namePlural: 'Egyptian pounds', symbol: 'ج.م.', intlSymbol: 'ج.م.', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'ar-EG' },
  // E: shared (also another currency's sign) — side by side it is "SZL". world-countries-5 (Eswatini; Intl in en-SZ).
  { code: 'SZL', name: 'Swazi Lilangeni', namePlural: 'Swazi emalangeni', symbol: 'E', intlSymbol: 'SZL', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'en-SZ' },
  // ብር: the Ethiopian Birr's own sign. world-countries-5 (Ethiopia; Intl in am-ET).
  { code: 'ETB', name: 'Ethiopian Birr', namePlural: 'Ethiopian birrs', symbol: 'ብር', intlSymbol: 'ብር', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'am-ET' },
  // D: the Gambian Dalasi's own sign. world-countries-5 (Gambia; Intl in en-GM).
  { code: 'GMD', name: 'Gambian Dalasi', namePlural: 'Gambian dalasis', symbol: 'D', intlSymbol: 'D', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'en-GM' },
  // FG: the Guinean Franc's own sign. world-countries-5 (Guinea; Intl in fr-GN).
  { code: 'GNF', name: 'Guinean Franc', namePlural: 'Guinean francs', symbol: 'FG', intlSymbol: 'FG', symbolShared: false, decimals: 0, minorSign: 'c', shortFee: 'amount', locale: 'fr-GN' },
  // M: the Lesotho Loti's own sign. world-countries-5 (Lesotho; Intl in st-LS).
  { code: 'LSL', name: 'Lesotho Loti', namePlural: 'Lesotho lotis', symbol: 'M', intlSymbol: 'M', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'st-LS' },
  // $: shared (also another currency's sign) — side by side it is "LRD". world-countries-5 (Liberia; Intl in en-LR).
  { code: 'LRD', name: 'Liberian Dollar', namePlural: 'Liberian dollars', symbol: '$', intlSymbol: 'LRD', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'en-LR' },
  // Ar: the Malagasy Ariary's own sign. world-countries-5 (Madagascar; Intl in mg-MG).
  { code: 'MGA', name: 'Malagasy Ariary', namePlural: 'Malagasy ariaries', symbol: 'Ar', intlSymbol: 'Ar', symbolShared: false, decimals: 0, minorSign: 'c', shortFee: 'amount', locale: 'mg-MG' },
  // MK: the Malawian Kwacha's own sign. world-countries-5 (Malawi; Intl in en-MW).
  { code: 'MWK', name: 'Malawian Kwacha', namePlural: 'Malawian kwachas', symbol: 'MK', intlSymbol: 'MK', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'en-MW' },
  // Rs: shared (also another currency's sign) — side by side it is "MUR". world-countries-5 (Mauritius; Intl in fr-MU).
  { code: 'MUR', name: 'Mauritian Rupee', namePlural: 'Mauritian rupees', symbol: 'Rs', intlSymbol: 'MUR', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'fr-MU' },
  // د.م.: the Moroccan Dirham's own sign. world-countries-5 (Morocco; Intl in ar-MA).
  { code: 'MAD', name: 'Moroccan Dirham', namePlural: 'Moroccan dirhams', symbol: 'د.م.', intlSymbol: 'د.م.', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'ar-MA' },
  // MTn: the Mozambican Metical's own sign. world-countries-5 (Mozambique; Intl in pt-MZ).
  { code: 'MZN', name: 'Mozambican Metical', namePlural: 'Mozambican meticals', symbol: 'MTn', intlSymbol: 'MTn', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'pt-MZ' },
  // $: shared (also another currency's sign) — side by side it is "NAD". world-countries-5 (Namibia; Intl in af-NA).
  { code: 'NAD', name: 'Namibian Dollar', namePlural: 'Namibian dollars', symbol: '$', intlSymbol: 'NAD', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'af-NA' },
  // ₦: the Nigerian Naira's own sign. world-countries-5 (Nigeria; Intl in en-NG).
  { code: 'NGN', name: 'Nigerian Naira', namePlural: 'Nigerian nairas', symbol: '₦', intlSymbol: '₦', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'en-NG' },
  // £: shared (also another currency's sign) — side by side it is "SHP". world-countries-5 (St. Helena; Intl in en-SH).
  { code: 'SHP', name: 'St. Helena Pound', namePlural: 'St. Helena pounds', symbol: '£', intlSymbol: 'SHP', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'en-SH' },
  // SR: the Seychellois Rupee's own sign. world-countries-5 (Seychelles; Intl in fr-SC).
  { code: 'SCR', name: 'Seychellois Rupee', namePlural: 'Seychellois rupees', symbol: 'SR', intlSymbol: 'SR', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'fr-SC' },
  // Le: shared (also another currency's sign) — side by side it is "SLE". world-countries-5 (Sierra Leone; Intl in en-SL).
  { code: 'SLE', name: 'Sierra Leonean Leone', namePlural: 'Sierra Leonean leones', symbol: 'Le', intlSymbol: 'SLE', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'en-SL' },
  // R: shared (also another currency's sign) — side by side it is "ZAR". world-countries-5 (South Africa; Intl in en-ZA).
  { code: 'ZAR', name: 'South African Rand', namePlural: 'South African rand', symbol: 'R', intlSymbol: 'ZAR', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'en-ZA' },
  // TSh: the Tanzanian Shilling's own sign. world-countries-5 (Tanzania; Intl in sw-TZ).
  { code: 'TZS', name: 'Tanzanian Shilling', namePlural: 'Tanzanian shillings', symbol: 'TSh', intlSymbol: 'TSh', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'sw-TZ' },
  // USh: the Ugandan Shilling's own sign. world-countries-5 (Uganda; Intl in sw-UG).
  { code: 'UGX', name: 'Ugandan Shilling', namePlural: 'Ugandan shillings', symbol: 'USh', intlSymbol: 'USh', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'sw-UG' },
  // K: shared (also another currency's sign) — side by side it is "ZMW". world-countries-5 (Zambia; Intl in en-ZM).
  { code: 'ZMW', name: 'Zambian Kwacha', namePlural: 'Zambian kwachas', symbol: 'K', intlSymbol: 'ZMW', symbolShared: true, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'en-ZM' },
  // ── world-countries-5 (12 November 2026, Dominic: "menus use local money in all 11"): the MENU currencies of the 11 countries billed in
  // USD or EUR (country_settings.menu_currency, migration 20261096) — a truck there prices its menu in these; HatchGrab still bills it in
  // USD/EUR (plan_prices). BHD JOD KWD OMR TND are THREE-decimal, as the card processor takes them (and as menus there are written).
  // د.ب.: the Bahraini Dinar's own sign. world-countries-5 menu currency (Bahrain; Intl in ar-BH; three-decimal).
  { code: 'BHD', name: 'Bahraini Dinar', namePlural: 'Bahraini dinars', symbol: 'د.ب.', intlSymbol: 'د.ب.', symbolShared: false, decimals: 3, minorSign: 'c', shortFee: 'amount', locale: 'ar-BH' },
  // د.أ.: the Jordanian Dinar's own sign. world-countries-5 menu currency (Jordan; Intl in ar-JO; three-decimal).
  { code: 'JOD', name: 'Jordanian Dinar', namePlural: 'Jordanian dinars', symbol: 'د.أ.', intlSymbol: 'د.أ.', symbolShared: false, decimals: 3, minorSign: 'c', shortFee: 'amount', locale: 'ar-JO' },
  // د.ك.: the Kuwaiti Dinar's own sign. world-countries-5 menu currency (Kuwait; Intl in ar-KW; three-decimal).
  { code: 'KWD', name: 'Kuwaiti Dinar', namePlural: 'Kuwaiti dinars', symbol: 'د.ك.', intlSymbol: 'د.ك.', symbolShared: false, decimals: 3, minorSign: 'c', shortFee: 'amount', locale: 'ar-KW' },
  // ر.ع.: the Omani Rial's own sign. world-countries-5 menu currency (Oman; Intl in ar-OM; three-decimal).
  { code: 'OMR', name: 'Omani Rial', namePlural: 'Omani rials', symbol: 'ر.ع.', intlSymbol: 'ر.ع.', symbolShared: false, decimals: 3, minorSign: 'c', shortFee: 'amount', locale: 'ar-OM' },
  // DT: the Tunisian Dinar's own sign. world-countries-5 menu currency (Tunisia; Intl in fr-TN; three-decimal).
  { code: 'TND', name: 'Tunisian Dinar', namePlural: 'Tunisian dinars', symbol: 'DT', intlSymbol: 'DT', symbolShared: false, decimals: 3, minorSign: 'c', shortFee: 'amount', locale: 'fr-TN' },
  // BTN: the code itself (Intl has no native sign in a Latin-digit locale). world-countries-5 menu currency (Bhutan; Intl in en-BT).
  { code: 'BTN', name: 'Bhutanese Ngultrum', namePlural: 'Bhutanese ngultrums', symbol: 'BTN', intlSymbol: 'BTN', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'en-BT' },
  // TMT: the code itself (Intl has no native sign in a Latin-digit locale). world-countries-5 menu currency (Turkmenistan; Intl in en-TM).
  { code: 'TMT', name: 'Turkmenistani Manat', namePlural: 'Turkmenistani manats', symbol: 'TMT', intlSymbol: 'TMT', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'en-TM' },
  // Nfk: the Eritrean Nakfa's own sign. world-countries-5 menu currency (Eritrea; Intl in en-ER).
  { code: 'ERN', name: 'Eritrean Nakfa', namePlural: 'Eritrean nakfas', symbol: 'Nfk', intlSymbol: 'Nfk', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'en-ER' },
  // أ.م.: the Mauritanian Ouguiya's own sign. world-countries-5 menu currency (Mauritania; Intl in ar-MR).
  { code: 'MRU', name: 'Mauritanian Ouguiya', namePlural: 'Mauritanian ouguiyas', symbol: 'أ.م.', intlSymbol: 'أ.م.', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'ar-MR' },
  // Db: the São Tomé and Príncipe Dobra's own sign. world-countries-5 menu currency (São Tomé and Príncipe; Intl in pt-ST).
  { code: 'STN', name: 'São Tomé and Príncipe Dobra', namePlural: 'São Tomé and Príncipe dobras', symbol: 'Db', intlSymbol: 'Db', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'pt-ST' },
  // ZWG: the code itself (Intl has no native sign in a Latin-digit locale). world-countries-5 menu currency (Zimbabwe; Intl in en-ZW).
  { code: 'ZWG', name: 'Zimbabwe Gold', namePlural: 'Zimbabwe gold', symbol: 'ZWG', intlSymbol: 'ZWG', symbolShared: false, decimals: 2, minorSign: 'c', shortFee: 'amount', locale: 'en-ZW' },
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
