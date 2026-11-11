# world-countries-4: where HatchGrab can be sold

*11 November 2026. Research only.*
- *Nothing in the app or database was changed: no code, no database writes, no message-file changes. Nothing was deployed.*
- *The only files added are this report and `docs/world-countries-4/countries.csv`, committed by path.*
- *The database was only read (§13). No `.env*` file was opened.*

**The full list is [`docs/world-countries-4/countries.csv`](world-countries-4/countries.csv).** It has one row per ISO 3166-1 code (all 249) and 36 columns. Each row has its decision, payment model, billing currency, launch language, tax flag, app stores, proposed prices, region and source links.

## Summary

| | Countries | What it means |
|---|---|---|
| **Offer: online + monthly** | **51** | The 44 live today, plus 7 territories that Stripe onboards under a parent country: Puerto Rico as the US; Guadeloupe, Martinique, French Guiana, Réunion, Mayotte and Saint-Martin as France. The 7 use their parent's entry, not one of their own. |
| **Offer: monthly billing only** | **184** | Customers pay at the truck. We charge the truck's card monthly through our UK Stripe account. This includes **Ukraine** and **Georgia**, offered with occupied regions blocked (§3). |
| **Exclude** | **14** | 5 sanctioned (Cuba, Iran, North Korea, Russia, Belarus); Syria (Stripe still prohibits it); mainland China (legal requirements we can't meet, **your decision**); 7 uninhabited territories. |
| **Total** | **249** | |

The offered countries by region:
- Africa: 58
- Asia Pacific: 57
- Europe: 55
- Americas: 53
- Middle East: 12

**Decisions for you** (each is in the CSV and in §2):
1. **Mainland China:** recommended exclusion.
2. **Afghanistan, Somalia, Yemen, Sudan:** offered, but marked high risk. Terrorist or sanctioned groups control territory or tax businesses there.
3. **Transnistria (Moldova):** whether to block it.
4. **Belarus:** excluded, which is cautious. The EU ban is narrower than for Russia, and I found no UK equivalent.
5. **Malaysia (already live):** Stripe's Connect tools don't offer Malaysian accounts to a UK platform (§5).
6. **Prices:** 108 of the proposed prices rest on an estimated meal price, not a measured one (§8).

## 0 · Flags

- **No span of the prompt arrived garbled. No instructions contradicted each other.**
- **The workstream was renamed mid-way, as you told me.** It is world-countries-4, written to the new paths. `docs/world-countries-2-report.md` was never touched; `git diff` shows it identical to HEAD.
- **"Today's 44" is confirmed three ways:**
  - exactly 44 `country_settings` rows are enabled;
  - stripe.com/global lists exactly the same 44 as "available";
  - these are the only countries where a truck can open a standard Stripe account.
- **"The 47 prepared by languages-world-1" are locales, not countries in the database.** That work added language files only. None of the 47 countries has a `country_settings` or `plan_prices` row yet. The CSV marks them `prepared (<locale>)`.
- **Numbeo blocked the meal-price scrape** (HTTP 429, too many requests) after 46 country pages. Measured prices exist for 89 countries: the 54 in its by-country table plus those 46 pages. The rest use a stated estimate (§8).

## 1 · Method and sources

| Column | Source (read 11 Nov 2026) |
|---|---|
| The 249 codes | Debian iso-codes `iso_3166-1.json`. |
| Live, prepared or new | The live database (read only), docs/languages-world-1-report.md and `lib/i18n/locales.ts`. |
| Offer or exclude | OFAC programme pages, UK sanctions guidance on gov.uk and legislation.gov.uk, the EU sanctions map and EUR-Lex. Every exclusion or flag row cites specific pages. |
| Stripe account, charging, currency | stripe.com/global, Stripe's support page on outlying territories, the Restricted Businesses list, the sanctions FAQ, and docs.stripe.com/currencies (the GB presentment list, 134 currencies). |
| Tax flag | Mostly PwC Worldwide Tax Summaries. Also EY and KPMG guides, VAT trackers (VATCalc, Avalara, Fonoa) and national tax authority pages. |
| App stores | Apple's App Store Connect territory list (175) and support.apple.com/118205; Google's play.google.com/supported-locations (2026/01). |
| Languages | Unicode CLDR 46 territory language data, mapped to our 36 bases and 91 locales. |
| Prices | pricing-research-1's rule (§8); Numbeo; World Bank PPP factor (PA.NUS.PPP) and official exchange rate (PA.NUS.FCRF); exchange rates from open.er-api.com, 11 Nov 2026 00:02 UTC. |

The research was split across seven agents (sanctions, Stripe, stores, and tax in four regions). I checked their outputs for completeness: every file has all of its codes, and every non-plain row has a source. I spot-checked the two most surprising 2026 claims at their sources and both hold:
- **Syria:** the US rescinded its State Sponsor of Terrorism listing on 24 Aug 2026 (Thompson Hine SmarTrade).
- **Cuba:** OFAC's Cuba page now lists EO 14404 (1 May 2026) and the new 31 CFR Part 516.

## 2 · Exclusions (14)

| Code | Country | Why excluded | Main source |
|---|---|---|---|
| CU | Cuba | Full US embargo (31 CFR 515, the new 31 CFR 516, EO 14404). Stripe prohibits it. ⚠ The UK has no Cuba embargo, and the UK's anti-US-sanctions rule (SI 2020/1660) bars UK firms from *complying* with the US measures. So present this as "our payment processor can't serve Cuba", not as obeying US law. | ofac.treasury.gov/…/cuba-sanctions |
| IR | Iran | Full US embargo (31 CFR 560). Stripe prohibits it. The same UK point applies. | ofac.treasury.gov/…/iran-sanctions |
| KP | North Korea | Full US embargo (31 CFR 510), plus UN/UK/EU bans on services. Stripe prohibits it. | ofac.treasury.gov/…/north-korea-sanctions |
| RU | Russia | IT and software services bans: EU Reg 833/2014 Art 5n; UK Russia Regs reg 54C and the business-software ban (SI 2025/504); OFAC's IT/software determination under EO 14071 (from 12 Sep 2024). Stripe prohibits it. | legislation.gov.uk/uksi/2025/504 |
| BY | Belarus | EU Reg 765/2006 (amended by 2024/1865) bans IT consultancy to Belarus, and enterprise software to public bodies. Stripe "restricted". **Cautious:** I found no UK equivalent of the software ban, and US measures are list-based. Excluded because you named it and it is in line with Russia. | sanctionsmap.eu; support.stripe.com/questions/sanctions-on-russia-and-belarus |
| SY | Syria | **Stripe still prohibits Syria** (Restricted Businesses list), so there is no way to take payment. The sanctions themselves have largely gone: US programme revoked (EO 14312), Caesar Act repealed, terrorism listing rescinded 24 Aug 2026, UK/EU trade measures lifted in 2025. **Revisit when Stripe updates.** | stripe.com/legal/restricted-businesses |
| CN | China (mainland) | **Not a sanctions ban. These are legal requirements we can't meet today:** China's privacy law (PIPL Art 53) requires a foreign processor of Chinese residents' data to name a representative in China; serving from China needs an ICP licence; foreign SaaS sold there is a telecoms-licensing grey area; and the Great Firewall may block access. **Recommended exclusion; your decision.** Hong Kong and Macao are separate and offered. | (sources in the CN row) |
| AQ BV HM TF GS IO UM | Antarctica, Bouvet, Heard & McDonald, French Southern Territories, South Georgia, British Indian Ocean Territory, US Minor Outlying Islands | No permanent population and no businesses. | CIA World Factbook archive (discontinued in 2026) |

**Offered, but marked high risk. Your decision:**
- **AF:** the Taliban are listed and control the state.
- **SO:** al-Shabaab taxes businesses in the areas it holds.
- **YE:** the Houthis have been a US-designated terrorist organisation since 5 Mar 2025.
- **SD:** army- and RSF-linked companies are sanctioned, and there is active conflict.

None of these is under a comprehensive embargo. The risk is unknowingly paying or supporting a listed group. Stripe screens payers against sanctions lists, but we would also need to screen at signup.

**Offered with a sanctions flag:** Stripe and our own signup must screen against the sanctions lists. 22 countries:
- **Medium risk:** VE (government and state companies blocked by EO 13884; private businesses fine), MM (military and state companies), LY, IQ, LB, ML, CF, CD (M23-held areas), SS, HT, PS (Gaza: Hamas).
- **Lower risk:** NI, ZW, BI, GW, GN, NE, GT, BA, MD.
- **Not sanctions:** ID (must register as a foreign online service provider, §12). UA's flag is Stripe's restriction on the occupied regions (§3).

## 3 · Regions inside offered countries

| Country | Block | How |
|---|---|---|
| **Ukraine** (offer) | Crimea (UA-43), Sevastopol (UA-40), all of Luhansk oblast (UA-09), and the occupied parts of Donetsk (UA-14), Zaporizhzhia (UA-23) and Kherson (UA-65). Grounds: OFAC (EO 13685, EO 14065), EU Regs 692/2014 and 2022/263, and UK rules on "non-government controlled Ukrainian territory". Stripe also prohibits these regions. | At signup and when a truck adds an address:<br>• block those oblasts outright, or block Crimea, Sevastopol and Luhansk and check addresses by hand in government-held parts of Donetsk, Zaporizhzhia and Kherson;<br>• reject +7 (Russian) phone numbers and Russian-issued cards on Ukrainian accounts.<br>The front line moves, so recheck every quarter. |
| **Georgia** (offer) | Abkhazia and South Ossetia (Tskhinvali region). There are no UK/EU/US sanctions, but Georgia's Law on Occupied Territories (Art 6) makes unauthorised economic activity there a crime, and both regions are Russian-controlled. | Block those regions' addresses at signup. |
| **Moldova** (offer) | Transnistria: no sanctions on the region itself. It is Russian-backed and its banks are largely cut off. | **Your decision.** Blocking it is the cautious option. |
| **Cyprus** (live) | Northern Cyprus: no sanctions and no legal block found. | Nothing needed. Addresses may use the Turkish "Mersin 10" format. |

## 4 · The countries you named

| Country | Status found (Nov 2026) | Decision |
|---|---|---|
| Syria | US programme revoked (EO 14312); terrorism listing rescinded 24 Aug 2026; UK/EU trade measures lifted in 2025; only targeted listings remain. **Stripe still prohibits it.** | EXCLUDE (Stripe) |
| Venezuela | No embargo. EO 13884 still blocks the government and state companies, despite many 2026 OFAC general licences. | OFFER, flagged. Not to government or state customers. Bill in USD. |
| Myanmar | Targeted: the military and state companies. | OFFER, flagged |
| Afghanistan | Targeted: the Taliban (UN/UK/EU/US). | OFFER, **high risk: your decision** |
| Sudan | Targeted: army- and RSF-linked companies. The US embargo ended in 2017. | OFFER, **high risk: your decision** |
| South Sudan | Targeted plus an arms embargo. | OFFER, flagged |
| Somalia | Targeted; al-Shabaab. | OFFER, **high risk: your decision** |
| Yemen | Targeted; the Houthis are a designated terrorist organisation (Mar 2025). | OFFER, **high risk: your decision** |
| Libya | Targeted plus an arms embargo. | OFFER, flagged |
| Iraq | Targeted (former regime figures, militias). | OFFER, flagged |
| Lebanon | Targeted; Hezbollah. | OFFER, flagged |
| Nicaragua | Targeted (government figures). | OFFER, flagged |
| Mali | Targeted (junta figures, Wagner links). | OFFER, flagged |
| Central African Republic | Targeted plus an arms embargo. | OFFER, flagged |
| DR Congo | Targeted; M23-held areas. | OFFER, flagged |
| Zimbabwe | US programme ended (EO 14118, 2024). A UK asset-freeze regime remains. | OFFER, flagged (low) |

## 5 · Payment model and Stripe

- **Online + monthly (51).** The 44 live countries are the only ones where a business can open a standard Stripe account. On top of those:
  - **Puerto Rico** onboards as the US.
  - **Guadeloupe, Martinique, French Guiana, Réunion, Mayotte and Saint-Martin** onboard as France.

  Stripe explicitly does **not** cover: the US Virgin Islands, Guam, American Samoa and the Northern Marianas; French Polynesia, New Caledonia, Wallis & Futuna, Saint-Barthélemy and Saint-Pierre-et-Miquelon; the Dutch Caribbean; and the British Overseas Territories other than Gibraltar. Source: support.stripe.com/questions/stripe-availability-for-outlying-territories-of-supported-countries.
- **Jersey, Guernsey and the Isle of Man are not covered by Stripe UK.** Stripe's words: "A business must be located in the United Kingdom of Great Britain and Northern Ireland to sign up with Stripe as a UK business." They are monthly billing only, in GBP, at UK prices.
- **India and Indonesia** are invite-only at Stripe ("Preview"). Monthly billing only until Stripe invites us.
- **South Africa, Kenya, Nigeria, Ghana and Côte d'Ivoire** are Stripe's "extended network" through Paystack, not standard Stripe accounts. Monthly billing only. Paystack is a separate integration if you ever want online payments there.
- **Åland:** Stripe doesn't say whether it onboards as Finland. It is its own entry, monthly only, until Stripe support confirms.
- **What Stripe flagged in the live 44** (not changed; for you to know):
  - 🔴 **Malaysia:** Stripe's Connect requirements tool offers no Malaysian connected accounts to a UK platform, and Stripe support says platforms outside Malaysia can't collect fees there. **Check that Malaysian trucks can actually onboard before relying on online payments there.**
  - A UK platform can only send transfers to US, UK, EEA, Canadian and Swiss accounts. That rules out destination charges and separate transfers for AE, AU, BR, HK, JP, MX, MY, NZ, SG, TH and GI. Direct charges on the truck's own Standard account (today's model) are unaffected.
  - BR and TH: no application fee from a foreign platform (already handled as "Unlimited only").
  - AE: connected accounts need a UAE trade licence.
  - No American Express on AE, BR, MY and TH accounts.

## 6 · Billing currency

**The rule:** bill in the local currency when a UK Stripe account can charge in it (134 currencies), and otherwise in USD or EUR. This applies to **18** offered countries:

| Local currency (country) | Bill in | Why |
|---|---|---|
| BHD (BH), JOD (JO), KWD (KW), OMR (OM) | USD | Three-decimal currencies only a UAE Stripe account can charge. All are pegged to the USD or a USD-heavy basket. |
| TND (TN) | EUR | Three-decimal, UAE only. The EU is Tunisia's main trading partner. |
| STN (ST) | EUR | Pegged to the EUR. Stripe lists only the retired STD code. |
| IQD (IQ), ERN (ER), LYD (LY), MRU (MR), SDG (SD), SSP (SS), TMT (TM), BTN (BT) | USD | Not chargeable. USD is the usual currency for foreign invoices (BTN is pegged to INR; USD avoids a third currency). |
| GHS (GH) | USD | Not on Stripe's GB list (to my surprise). |
| VES (VE), ZWG (ZW) | USD | Both economies largely use USD. |

**Other rules to know** (in the `currency_rules` column):
- **Zero-decimal currencies:** JPY, KRW, VND, CLP, PYG, UGX, XOF, XAF, XPF and others.
- **ISK and UGX** are sent with "00" added.
- **HUF and TWD** are charged with two decimals but paid out in whole units.
- **No American Express** for about 27 currencies.

## 7 · Territories

| Treatment | Codes |
|---|---|
| **Use the parent** (Stripe onboards them as the parent) | PR → US; GP, MQ, GF, RE, YT, MF → FR |
| **Own entry, monthly only** (Stripe doesn't cover them) | US: VI, GU, AS, MP · France: BL, PM, NC, PF, WF · Netherlands: AW, CW, SX, BQ · UK: AI, BM, VG, KY, FK, MS, PN, SH, TC · Crown Dependencies: JE, GG, IM · Denmark: FO, GL · Norway: SJ · Australia: CX, CC, NF · NZ realm: CK, NU, TK · Finland: AX (until Stripe confirms) |
| **Own entry, already live** | GI (Gibraltar) |
| **Own entry, offered** | HK, MO (separate from mainland China), TW, PS, EH (disputed, run largely by Morocco; no legal block found; tiny market) |
| **Excluded** (uninhabited) | AQ, BV, HM, TF, GS, IO, UM |

## 8 · Prices

### The rule

This is pricing-research-1 §2 ("proposed-price rules"), the rule world-countries-1 used for BR, MX, JP, SG, HK, MY, TH and AE:

1. **Start from the ladder:** €29 Pro (includes €4,000 of online orders) and €69 Unlimited. Pay as you go is 0 a month + 0.99%.
   - For USD and GBP billing, use $29 / $69 and £29 / £69, as for the US and UK.
   - Any other currency is converted from the euro ladder (rates of 11 Nov 2026) and rounded to a native price point.
2. **Affordability.** Measure Pro in local meals ("Meal, Inexpensive Restaurant", Numbeo). The UK's Pro is £29, or 1.81 meals.
   - If Pro costs more than 1.25 × 1.81 = **2.27 meals**, scale Pro to about **1.8 meals** and Unlimited to about **4.3 meals**.
   - Pro's included amount stays at about **138 × Pro**, rounded to a round number.
3. **Price points** end in 9 at the right scale: 29, 349, 1,990, 54,900, 199,000. The lowest is 9. Unlimited is always at least 1.5 × Pro.
4. **Not applied:** pricing-research-1's competitor step (cut Unlimited to beat a cheaper local rival). It needs competitor research per country; do that per country before launch.
5. **Unchanged:** live prices, and territories using their parent's price.

### Meal prices

- **Measured (Numbeo):** 47 of the new and prepared offered countries. As a check, the Numbeo table gives UK $21.33 ≈ £16, US $20 and Germany ≈ €15, the same figures pricing-research-1 used.
- **Estimated:** 108. Numbeo blocked the scrape, so the meal price is estimated from the World Bank price level (the PPP factor ÷ the official exchange rate, latest year, mostly 2024/25).
  - Fitted on the 84 countries that have both figures: meal (USD) = 24.19 × price level^1.443.
  - R² 0.67; a typical estimate is off by about ±57%.
  - **Read these prices as a starting point, not a final figure.** The `meal_source` column says which kind each row is.
- **No meal price at all:** 36, mostly small territories. These rows use the plain ladder, marked "affordability not checked".

### Examples (Pro / Pro includes / Unlimited a month)

| | Pro | Includes | Unlimited | Basis |
|---|---|---|---|---|
| India (INR) | ₹349 | ₹50,000 | ₹849 | Numbeo; was 14.9 meals |
| Indonesia (IDR) | Rp54,900 | Rp7,500,000 | Rp119,000 | Numbeo |
| Vietnam (VND) | ₫89,900 | ₫10,000,000 | ₫199,000 | Numbeo |
| South Korea (KRW) | ₩19,900 | ₩2,500,000 | ₩44,900 | Numbeo |
| Taiwan (TWD) | NT$249 | NT$30,000 | NT$649 | Numbeo |
| Türkiye (TRY) | ₺899 | ₺100,000 | ₺1,990 | Numbeo |
| Chile (CLP) | $14,900 | $2,000,000 | $34,900 | Numbeo |
| South Africa (ZAR) | R299 | R40,000 | R749 | Numbeo |
| Israel (ILS) | ₪99 | ₪15,000 | ₪249 | Numbeo; affordable as converted |
| Nigeria (NGN) | ₦2,990 | ₦400,000 | ₦7,490 | estimate |
| Kenya (KES) | KSh1,190 | KSh150,000 | KSh2,990 | estimate |
| Saudi Arabia (SAR) | 54 | 7,500 | 119 | estimate |
| Tunisia (EUR) | €9 | €1,000 | €14 | estimate. **This is the floor; check it.** |
| Jersey (GBP) | £29 | £4,000 | £69 | UK ladder |

**Note for monthly-only countries:** Stripe's international-card and currency-conversion fees on our UK account take a bigger share of a small charge (for example €9). Check the margin before setting floors.

## 9 · Languages

The `launch_locale` column is the closest of our 91 locales. The rules:
- A country's own locale wins (all 91, including the 47 prepared).
- Otherwise, the most-spoken language we have, if it is official there or spoken by at least 20%.
- Then regional English and French variants:
  - **en-JM** for the Caribbean, **en-KE** for East Africa, **en-ZA** for Southern Africa, **en-GH** for West Africa;
  - **en-AU / en-NZ / en-US** for the Pacific and the US territories;
  - **fr-SN** for sub-Saharan francophone Africa (where "retrait" means a cash-out), **fr-MA** for Algeria (as for Morocco and Tunisia);
  - **es-MX / pt-BR** for the Americas, **pt-AO** for Lusophone Africa;
  - **ar-EG** (Egypt, Sudan, Libya), **ar-JO** (Levant, Iraq), **ar-AE** (elsewhere).

**Overrides I chose:**
- **North Macedonia: en-GB.** Bulgarian is close, but it is not a language for Macedonian customers.
- **Bosnia: hr-HR** and **Montenegro: sr-RS.** These are mutually intelligible languages in Latin script.
- **Andorra: es-ES**, for Catalan.
- **Greenland and the Faroes: da-DK.**
- **Somalia and South Sudan: en-KE.**
- **Djibouti and Comoros: fr-SN.**

New launches use these locales most: en-GB 28, fr-SN 16, en-JM 15, fr-FR 12, en-AU 12, en-KE 11.

**Real language gaps** (26 countries where our launch language is not official): Ukrainian (UA), Persian (AF), Bangla (BD), Burmese (MM), Khmer (KH), Lao (LA), Sinhala (LK), Nepali (NP), Mongolian (MN), Kazakh/Russian (KZ), Uzbek (UZ), Kyrgyz (KG), Tajik (TJ), Turkmen (TM), Georgian (GE), Armenian (AM), Azerbaijani (AZ), Albanian (AL), Macedonian (MK), Catalan (AD), Amharic (ET), Somali (SO), Dhivehi (MV), Dzongkha (BT), Faroese (FO), Greenlandic (GL).
- **By likely market size:** Ukrainian, Bangla, Persian (but Afghanistan is high risk), Amharic, Uzbek and Kazakh first.

**Optional later** (we launch in an official language, but most people speak another): Hindi (IN), Urdu (PK), Swahili (KE, TZ, UG, CD), Wolof (SN), Afrikaans (NA), Shona (ZW), Kinyarwanda (RW), Malagasy (MG), Haitian Creole (HT), Papiamento (CW, BQ), Maltese (MT), Bosnian (BA) and the Pacific languages (Samoan, Tongan, Tok Pisin, Bislama, Tuvaluan, Palauan).

## 10 · Tax flags, for your accountant

**The question:** does the country make a foreign seller of SaaS register for or collect tax on **B2B** sales, or make the business customer withhold tax from our fee?
- HatchGrab Ltd is UK-based and not VAT-registered (UK threshold £90,000). B2B services to overseas businesses are outside the scope of UK VAT.
- Across the 235 offered countries: **85 yes, 60 no, 90 unclear.**
- The CSV gives each row's mechanism, rates, the UK treaty rate where there is one, and sources.

**Yes: we must register or collect even on B2B (or for business customers who aren't VAT-registered), 14 countries:**
- **ZA South Africa:** register above R1m (reported R2.3m from 1 Apr 2026) unless every customer is a VAT vendor.
- **KE Kenya:** 16% VAT on all B2B e-services, no threshold.
- **UG Uganda, TZ Tanzania:** register for sales to customers who aren't VAT-registered.
- **GH Ghana:** no threshold; a B2B carve-out is not confirmed.
- **MU Mauritius:** register regardless of turnover from 1 Jan 2026.
- **AE UAE, BH Bahrain, OM Oman:** the customer reverse-charges only if VAT-registered; for an unregistered truck, we must register (UAE: no threshold for non-residents). Oman also has 10% withholding.
- **BB Barbados:** VAT registration on B2B digital supplies.
- **AM Armenia:** register when the customer isn't a VAT payer.
- **KG Kyrgyzstan:** 12% VAT, no threshold.
- **MX Mexico:** 16% VAT registration from the first sale, no B2B exemption.
- **MY Malaysia (live):** service tax above RM500k, B2B included.

**Yes: US, Canadian and Puerto Rican sales taxes.**
- **US:** SaaS is taxed in about 20–25 states once a state's sales threshold is passed (usually $100k; $500k in TX and NY).
- **Canada:** provincial sales tax on B2B SaaS. Saskatchewan from the first sale, Manitoba, and BC above C$10k. GST/HST and Quebec's QST are not charged to registered customers.
- **Puerto Rico:** 11.5% IVU above $100k or 200 transactions.

**Yes: the business customer withholds tax from our fee** (66 countries; the truck pays us less unless the price is grossed up). The UK treaty rate is given where one exists.
- **Asia:** IN 20%+ (treaty 15%; SaaS is disputed); ID 20% (treaty 10%); TH 15% (a 2025 ruling treats cloud fees as business profits); VN about 10% foreign contractor tax; TW 20% (approved ratios cut it to about 3%); PK 5–20%; BD 20%/10%; KH 14%; LA about 13%; MN 20%; PG 10–15%.
- **Middle East:** SA 5%/15%; QA 5%; JO 10%; LB about 8.5%; PS 10%; OM 10%.
- **Latin America:**
  - BR (15% income tax + 10% CIDE + PIS/COFINS + ISS; the UK treaty is not yet in force);
  - CO 20% (treaty 10%); PE 30% (the treaty takes effect in Peru from 2027); EC 25% (+5% currency-exit tax); PY 10% VAT + 4.5%;
  - DO 27%, CR 25–30%, GT 15–25%, HN 25%, NI 20%, SV 20% (no treaties); BO 12.5%; PA 12.5%; VE 34% on a deemed base.
- **Caribbean "technical fees":** AG 25% (0% under the 1947 treaty), BZ 25%, DM 15%, GD 15%, KN 15%, LC 25%, VC 20%; BB also VAT. Whether SaaS counts as a technical fee is untested.
- **Africa:**
  - NG 10%, EG 20%, MA 10%, TN 15%, DZ 30%, CI about 20%, SN 20%, MW 15%;
  - ZW 15.5% at the bank plus 15%; MZ 10% (a digital-specific rate);
  - AO 6.5%, CV 15%, CD 14%, GQ 10%, GA 25%, CM 15%, CG 20%, TD 25%, LR 15–20%, MG 10%, MR 15%, RW 15%;
  - from secondary sources only: TG, BF, GN, GM, SL, BI.
- **Europe:** ES 24%, FR (Art 182 B), PT 25%. Under domestic law the customer withholds. **The UK treaty takes it to 0%**, but only with paperwork: a UK certificate of residence, and Portugal's Form 21-RFI before payment. Qatar works the same way (pay, then reclaim).

**Unclear: 90 countries.** Most have a withholding tax on royalties or technical fees, but no source says whether SaaS falls under it. Examples:
- PH (25% if SaaS counts as a royalty);
- KZ, UZ, LK, TR (rulings reportedly exempt off-the-shelf software);
- PL (conflicting rulings), CZ, HR, RO, SK, SI, BG, LT;
- IL (23% unless the Israel Tax Authority grants an exemption);
- AR, UY, JM, TT;
- most small islands and territories.

**Digital or presence taxes that could hit a small company:**
- **KE:** Significant Economic Presence tax of about 3% of gross; the threshold was removed in 2025.
- **UG:** DST 5% of gross, cloud included, no threshold.
- **TZ:** DST 3% (aimed at payments by individuals).
- **CM:** presence tax from 2026, above XAF 50m (about £65k) or 1,000 users.
- **CI:** about 3%, above XOF 50m.
- **RW:** DST 1.5%; the threshold isn't set yet.
- **GN:** a 1.5–7% levy by decree in May 2026 (unverified).
- **MZ, ZW:** their gross withholdings work like a DST.
- **NP:** 2% above NPR 3m, with B2B reportedly exempt.

Every other DST (FR, IT, ES, AT, TR, UK, CO, the old Indian levies) needs €750m+ worldwide revenue or has been repealed (Canada 2025, India 2024/25).

## 11 · App Store and Google Play

**App Store:** 174 ISO countries have a storefront. These 23 offered countries have **none**: AD, BD, BI, CF, DJ, EH, ER, ET, GN, GQ, HT, KI, KM, LS, MH, PS, SD, SO, SS, TG, TL, TV, WS. Trucks there would use the web version only.

**Google Play** is available almost everywhere. The offered exceptions are MH and PW.

**Territories** missing from Apple's list (and some from Google's) are marked `parent:XX?`, because neither store says whether the parent's storefront serves them. 47 rows for Apple and 21 for Google. Puerto Rico and the French overseas departments are common examples.

## 12 · What I couldn't confirm

1. **Meal prices** for 108 countries are estimates (§8). With 36 having no figure at all, about half the proposed new prices need checking before launch.
2. **The Belarus IT ban:** the exact article, and whether it covers private firms; and whether the UK has any equivalent. EUR-Lex wouldn't load.
3. **Whether an ordering SaaS counts as "IT consultancy" or "enterprise management software"** under the EU/UK rules. This only matters if you revisit Belarus.
4. **China:** the telecoms-licensing point is a grey area, not a confirmed ban (§2).
5. **Indonesia:** whether its foreign online-service registration rule (MR 5/2020) applies to a small B2B SaaS. It is being enforced against unregistered platforms in 2026.
6. **The UK anti-US-sanctions rule** as it applies to excluding Cuba and Iran. Needs legal advice on wording.
7. **Stripe:**
   - whether Åland onboards as Finland;
   - whether transfers to Gibraltar work from a UK platform;
   - **Malaysian Connect onboarding** from a UK platform (§5).
8. **App stores:** whether territories are served by the parent's storefront.
9. **Tax:** 90 "unclear" rows. Several Caribbean, West African and Central African rates come from secondary guides (noted in the detail column).
10. **Canada's DST repeal:** confirmed only from an industry source. I found no royal assent date.

## 13 · SQL (read only)

```sql
select column_name from information_schema.columns where table_name='plan_prices' order by ordinal_position;

select cs.country_code, cs.name, cs.enabled, cs.currency, cs.locale,
  (select string_agg(pp.plan_key||':'||pp.monthly_minor||'/'||pp.included_online_minor||case when pp.offered then '' else '(off)' end, ' ' order by pp.plan_key)
     from plan_prices pp where pp.country_code = cs.country_code) as prices
from country_settings cs order by cs.enabled desc, cs.country_code;
-- 44 rows, every one enabled

select country_code, plan_key, monthly_minor, included_online_minor, offered, is_trial_end
from plan_prices where plan_key not in ('payg','pro') order by country_code;
-- Unlimited for the 44
```

A first attempt at the second query failed (it named a column, `allowance_minor`, that doesn't exist). No other SQL was run.

## 14 · Files

- `docs/world-countries-4/countries.csv`: 249 rows. The columns, in order:
  - `alpha2, name, region, today, decision, decision_reason, regions_excluded, region_handling, sanctions_or_legal_flag`
  - `payment_model, stripe_account, stripe_charge_from, territory_treatment`
  - `local_currency, billing_currency, billing_currency_reason, currency_rules`
  - `launch_locale, main_language, main_language_needed_later, launch_language_official_there`
  - `tax_flag_b2b, tax_mechanism, tax_detail, digital_services_tax`
  - `app_store, google_play, stores_note`
  - `meal_usd, meal_source, pro_monthly, pro_includes, unlimited_monthly, price_basis`
  - `stripe_notes, sources`
- `docs/world-countries-4-report.md`: this report.
- The research inputs (the agents' CSVs, the merge script and the downloaded data) stayed in the session scratchpad and are not committed.
