# europe-settings — the rest of Europe as data, switched off

*22 October 2026. Written for Dominic. 29 countries: AT BE BG HR CY CZ DK EE FI DE GI GR HU IT LV LI LT LU MT NL NO PL PT RO SK SI
ES SE CH. No new languages.*

## 0 · ⚠️ Read first: blocks A and B are ALREADY in the live database

A read-only check at 19:39 UTC found both blocks of this workstream's SQL already applied:

- **Block A** ("run now"): the live `country_settings_address_format_chk` lists gb, us, ie, au, nz, ca, fr and the 29 new keys,
  exactly as `20261035_europe_address_formats.sql` writes it. At 16:21 UTC the same query showed the six live keys only.
- **Block B** ("run after deploy"): 29 `country_settings` rows, all `enabled = false`, `updated_by = 'europe-settings draft'`,
  `updated_at` 19:34:02 UTC, and 87 `plan_prices` rows (3 per country). They are **byte-identical to the file**: an md5 of
  every one of the 51 columns of each row matches, and every price matches.
- **This was not run from this session.** Every SQL call it made was a read-only `select` (all 15 are listed in §12). The
  writes came from elsewhere, between 16:21 and 19:34 UTC.

What that means:

1. **The non-euro prices are live in the table without approval.** CHF, CZK, DKK, GBP (Gibraltar), HUF, NOK, PLN, RON and
   SEK all hold the §8 proposal. Every country is switched off, so no one sees or pays them. If you choose different
   prices, §9.3 has the NOT RUN `update` to use. Re-running block B's insert would fail on the existing keys.
2. **Block B ran before this code was deployed.** The deployed code (HEAD 2d725e3e "france", which is on origin/main)
   does not know the 29 address-format keys, so its `mapCountryRow` refuses those rows. Its `readAllCountryRows` was
   built for exactly this case (currency-registry, 21 October): it **leaves each unreadable row out of every list** (country
   menu, router, signup, Admin › Countries) and logs one `console.error` per row per list read. Nothing customer-facing
   changes: none of the 29 has a page address in HEAD, and every live country loads as before. Expect those log lines
   until this branch is deployed. Admin › Countries will not show the 29 until then.
3. **Nothing is left to run except §9.3, and only if you change the prices.** Switching a country on stays a separate
   decision (§14).

## 1 · Summary

- **29 country rows and 87 prices:** all switched off. Every row passes every live CHECK. Every value is sourced in §2
  and §8.
- **29 address formats:** in `lib/address-formats.ts`. Each one's example passes its own pattern. The takeaway VAT is data
  on each format; Gibraltar has none.
- **Pages:** `COUNTRY_PATH_SEGMENTS` now has an address for every country, at its ISO code. Switched off, each one
  302s to /uk.
- **Malta and Gibraltar can go live in English:** en-MT and en-GI are sparse overrides of en-IE.
- **A money fix for Gibraltar:** Intl wrote "GB£29". The registry's new `narrowIn` makes it "£29" everywhere in
  en-GI, and "lei", not "RON", in ro-RO.
- **Terms:** one "European Economic Area and Switzerland" section listing every regulator, plus a Gibraltar section.
  `TERMS_VERSION` is unchanged (still 22 October 2026).
- **`docs/i18n/add-a-country.md`:** a later language prompt for these countries is now just the language file, the
  allergen-guard words, translation-check and switching on.
- **Proof:** the europe-settings harness passes 67/67. Every live country's output is byte-identical: 8,890 captured
  views, the six-locale messages, the 2,850-answer grid and the marketing pages. The country-terms page is the one
  exception, and its change is a pure insertion.
- **Checks:** tsc is clean, lint has no new problems, the build passes, and the full sweep passes (§13).

## 2 · Per country

All rows: 24-hour clock, day-month-year, Monday week start, km, phone check `length`, allergen set uk14 (the EU 14),
prices include VAT, no card surcharge, no service fee, tipping off with no presets, no platform fee, retired plan columns
NULL. The phone example is libphonenumber's own mobile example for the country; Lithuania's was replaced with
"0612 34567", the form locals write.

| Country | Currency | Locale | Time zones | Phone code · example | Example address | VAT incl. (takeaway) | Allergen card alone | Card fees: online · in person · Tap to Pay | Region label |
|---|---|---|---|---|---|---|---|---|---|
| AT Austria | EUR | de-AT | Europe/Vienna | +43 · 0664 123456 | Stephansplatz, 1010 Wien | USt. 10 % | yes | 1.5% + €0.25 · 1.4% + €0.10 · €0.10 | EEA cards |
| BE Belgium | EUR | nl-BE | Europe/Brussels | +32 · 0450 00 12 34 | Grand-Place, 1000 Bruxelles | btw 6 % | yes | 1.5% + €0.25 · 1.4% + €0.10 · €0.10 | EEA cards |
| BG Bulgaria | EUR | bg-BG | Europe/Sofia | +359 · 043 012 345 | Ploshtad Nezavisimost, 1000 Sofia | ДДС 20 % | yes | 1.5% + €0.25 · 1.4% + €0.10 · €0.10 | EEA cards |
| HR Croatia | EUR | hr-HR | Europe/Zagreb | +385 · 092 123 4567 | Trg bana Jelačića, 10000 Zagreb | PDV 13 % | yes | 1.5% + €0.25 · 1.4% + €0.10 · €0.10 | EEA cards |
| CY Cyprus | EUR | el-CY | Asia/Nicosia | +357 · 96 123456 | Eleftheria Square, 1010 Nicosia | ΦΠΑ 5 % | yes | 1.5% + €0.25 · 1.4% + €0.10 · €0.10 | EEA cards |
| CZ Czech Republic | CZK | cs-CZ | Europe/Prague | +420 · 601 123 456 | Staroměstské náměstí, 110 00 Praha | DPH 12 % | yes | 1.5% + 6.50 Kč · 1.4% + 2.25 Kč · 2.20 Kč | EEA cards |
| DK Denmark | DKK | da-DK | Europe/Copenhagen | +45 · 34 41 23 45 | Aarhus Street Food, 8000 Aarhus | moms 25 % | yes | 1.5% + 1.80 kr. · 1.4% + 0.75 kr. · 0.70 kr. | EEA cards |
| EE Estonia | EUR | et-EE | Europe/Tallinn | +372 · 5123 4567 | Raekoja plats, 10146 Tallinn | km 24 % | yes | 1.5% + €0.25 · 1.4% + €0.10 · €0.10 | EEA cards |
| FI Finland | EUR | fi-FI | Europe/Helsinki | +358 · 041 2345678 | Kauppatori, 00100 Helsinki | ALV 13.5 % | yes | 1.5% + €0.25 · 1.4% + €0.10 · €0.10 | EEA cards |
| DE Germany | EUR | de-DE | Europe/Berlin | +49 · 01512 3456789 | Gendarmenmarkt, 10117 Berlin | MwSt. 7 % | yes | 1.5% + €0.25 · 1.4% + €0.10 · €0.10 | EEA cards |
| GI Gibraltar | GBP | en-GI | Europe/Gibraltar | +350 · 57123456 | Casemates Square, Gibraltar GX11 1AA | none (no VAT) | yes | 1.5% + £0.20 · 1.4% + £0.10 · £0.10 | Gibraltar cards |
| GR Greece | EUR | el-GR | Europe/Athens | +30 · 691 234 5678 | Plateia Syntagmatos, 105 57 Athens | ΦΠΑ 13 % | yes | 1.5% + €0.25 · 1.4% + €0.10 · €0.10 | EEA cards |
| HU Hungary | HUF | hu-HU | Europe/Budapest | +36 · 06 20 123 4567 | Vörösmarty tér, 1051 Budapest | ÁFA 27 % | yes | 1.5% + 85 Ft · 1.4% + 20 Ft · 40 Ft | EEA cards |
| IT Italy | EUR | it-IT | Europe/Rome | +39 · 312 345 6789 | Piazza del Duomo, 20122 Milano MI | IVA 10 % | yes | 1.5% + €0.25 · 1.4% + €0.10 · €0.10 | EEA cards |
| LV Latvia | EUR | lv-LV | Europe/Riga | +371 · 21 234 567 | Doma laukums, Rīga, LV-1050 | PVN 21 % | **no** | 1.5% + €0.25 · 1.4% + €0.10 · €0.10 | EEA cards |
| LI Liechtenstein | CHF | de-LI | Europe/Vaduz | +423 · 660 234 567 | Peter-Kaiser-Platz, 9490 Vaduz | MWST 2.6 % | yes | 1.5% + CHF 0.30 · 1.4% + CHF 0.10 · CHF 0.10 | EEA cards |
| LT Lithuania | EUR | lt-LT | Europe/Vilnius | +370 · 0612 34567 | Katedros aikštė, LT-01143 Vilnius | PVM 21 % | yes | 1.5% + €0.25 · 1.4% + €0.10 · €0.10 | EEA cards |
| LU Luxembourg | EUR | fr-LU | Europe/Luxembourg | +352 · 628 123 456 | Place Guillaume II, L-1648 Luxembourg | TVA 3 % | yes | 1.5% + €0.25 · 1.4% + €0.10 · €0.10 | EEA cards |
| MT Malta | EUR | en-MT | Europe/Malta | +356 · 9696 1234 | St George’s Square, Valletta VLT 1117 | VAT 18 % | yes | 1.5% + €0.25 · 1.4% + €0.10 · €0.10 | EEA cards |
| NL Netherlands | EUR | nl-NL | Europe/Amsterdam | +31 · 06 12345678 | Dam, 1012 JS Amsterdam | btw 9 % | yes | 1.5% + €0.25 · 1.4% + €0.10 · €0.10 | EEA cards |
| NO Norway | NOK | nb-NO | Europe/Oslo | +47 · 40 61 23 45 | Rådhusplassen, 0150 Oslo | MVA 15 % | yes | 2.4% + 2 kr · 1.4% + 1 kr · 1.05 kr | Norwegian and EEA cards |
| PL Poland | PLN | pl-PL | Europe/Warsaw | +48 · 512 345 678 | Rynek Główny, 31-042 Kraków | VAT 8 % | **no** | 1.5% + 1 zł · 1.4% + 0 zł · 0.40 zł | EEA cards |
| PT Portugal | EUR | pt-PT | Europe/Lisbon, Atlantic/Madeira, Atlantic/Azores | +351 · 912 345 678 | Praça do Comércio, 1100-148 Lisboa | IVA 13 % | yes | 1.5% + €0.25 · 1.4% + €0.10 · €0.10 | EEA cards |
| RO Romania | RON | ro-RO | Europe/Bucharest | +40 · 0712 034 567 | Piața Universității, 030167 București | TVA 11 % | **no** | 1.5% + 1 lei · 1.4% + 0.25 lei · 0.50 lei | EEA cards |
| SK Slovakia | EUR | sk-SK | Europe/Bratislava | +421 · 0912 123 456 | Hlavné námestie, 811 01 Bratislava | DPH 19 % | **no** | 1.5% + €0.25 · 1.4% + €0.10 · €0.10 | EEA cards |
| SI Slovenia | EUR | sl-SI | Europe/Ljubljana | +386 · 031 234 567 | Prešernov trg, 1000 Ljubljana | DDV 9.5 % | yes | 1.5% + €0.25 · 1.4% + €0.10 · €0.10 | EEA cards |
| ES Spain | EUR | es-ES | Europe/Madrid, Atlantic/Canary | +34 · 612 34 56 78 | Plaza Mayor, 28012 Madrid | IVA 10 % | yes | 1.5% + €0.25 · 1.4% + €0.10 · €0.10 | EEA cards |
| SE Sweden | SEK | sv-SE | Europe/Stockholm | +46 · 070-123 45 67 | Stortorget, 111 29 Stockholm | moms 6 % | yes | 1.5% + 1.80 kr · 1.4% + 1 kr · 1.05 kr | EEA cards |
| CH Switzerland | CHF | de-CH | Europe/Zurich | +41 · 078 123 45 67 | Paradeplatz, 8001 Zürich | MWST 2.6 % | yes | 2.9% + CHF 0.30 · 2.9% + CHF 0.10 · CHF 0.10 | Swiss cards |

**Currency.** Each matches the registry and the card-fee pricing page's currency.
- **Bulgaria is EUR.** It joined the euro area on 1 January 2026 at BGN 1.95583, and BGN stopped being legal tender on 1
  February 2026 (ecb.europa.eu/euro/changeover/bulgaria).
- **Gibraltar is GBP.** Its own pound (GIP) is at par with sterling, UK notes circulate, and stripe.com/gi/pricing quotes in
  pence. Whether Bank of England notes are formally legal tender there is UNVERIFIED (the Currency Notes Act 2011 PDF could
  not be read).
- **Liechtenstein is CHF.**

**Sources per country** (the full quotes and links are in the research files the report was built from):

| Country | VAT source | Allergen rule | Price-display / service-fee rule | Tipping | Postcode source | Card-fee source |
|---|---|---|---|---|---|---|
| AT | usp.gv.at/themen/steuern-finanzen/umsatzsteuer-ueberblick/steuersaetze | Allergeninformationsverordnung (AIV), BGBl. II Nr. 175/2014, § 3 | Preisauszeichnungsgesetz (PrAG) - prices shown to consumers must be gross prices including VAT and a… | Not expected at takeaway/counter service; rounding up appreciated. Tab… | upu.int/UPU/media/upu/PostalEntitiesFiles/addressingUnit/autEn.pdf | stripe.com/en-at/pricing |
| BE | bx1.be/categories/news/le-gouvernement-annule-la-hausse-de-la-tva-sur- | Arrêté royal / Koninklijk besluit du 17 juillet 2014 (allergen information for non-prepack… | Code of Economic Law (WER/CDE) Book VI, art. VI.3-VI.4: price indicated must be the total price incl… | Service included by law in bills; tipping optional (round up / 5-10% a… | upu.int/UPU/media/upu/PostalEntitiesFiles/addressingUnit/belEn.pdf | stripe.com/en-be/pricing |
| BG | taxsummaries.pwc.com/bulgaria/corporate/other-taxes | EU Reg. 1169/2011 art. 9(1)(c) and 44; no specific Bulgarian national measure on the FORM … | Consumer Protection Act (Закон за защита на потребителите) - price indication incl. VAT and all taxe… | ~10% at sit-down restaurants; not expected at counter/takeaway. | upu.int/UPU/media/upu/PostalEntitiesFiles/addressingUnit/bgrEn.pdf | stripe.com/en-bg/pricing |
| HR | taxsummaries.pwc.com/croatia/corporate/other-taxes | Pravilnik o informiranju potrošača o nepretpakiranoj hrani (NN 144/14, as amended NN 64/20… | Zakon o zaštiti potrošača (Consumer Protection Act, NN 19/22) - retail price must include VAT and al… | 5-10% at table service in tourist areas; leave change for coffee; not … | upu.int/UPU/media/upu/PostalEntitiesFiles/addressingUnit/hrvEn.pdf | stripe.com/en-hr/pricing |
| CY | rightax.com.cy/cyprus-vat-rates-and-regulations/ | EU Reg. 1169/2011 art. 9, 21, 44; no Cypriot national measure on form found. Cyprus Court … | Cypriot price-indication law transposing Dir. 98/6/EC (selling price incl. VAT and all taxes) plus C… | ~10% at restaurants (even with service charge, a few euros appreciated… | upu.int/UPU/media/upu/PostalEntitiesFiles/addressingUnit/cypEn.pdf | stripe.com/en-cy/pricing |
| CZ | zakonyprolidi.cz/cs/2004-235 | Vyhláška 417/2016 Sb. § 7(3): "Informace o výskytu látky vymezené v čl. 9 odst. 1 písm. c) | Advertised price must be the full price payable. EU Directive 98/6/EC (price indication) and Directi… | Not customary at counter service/takeaway. At table service, rounding … | upu.int/UPU/media/upu/PostalEntitiesFiles/addressingUnit/czeEn.pdf | stripe.com/en-cz/pricing |
| DK | tax.dk/jv/da/D_A_9.htm | Fødevarestyrelsen: "Oplysninger om allergene ingredienser kan gives enten skriftligt eller | EU Directive 98/6/EC and 2005/29/EC art. 7(4)(c): advertised price must include all taxes and compul… | Not customary; service is built into prices and wages. Not expected at… | upu.int/UPU/media/upu/PostalEntitiesFiles/addressingUnit/dnkEn.pdf | stripe.com/en-dk/pricing |
| EE | emta.ee/ariklient/maksud-ja-tasumine/kaibemaks | "See teave tuleb esitada müügikohas paberil (silt, menüü), elektrooniliselt (tahvel, tablo | EU Directive 98/6/EC and 2005/29/EC art. 7(4)(c): advertised price must include all taxes and compul… | Not customary at counters/takeaway; ~10% at sit-down restaurants for g… | upu.int/UPU/media/upu/PostalEntitiesFiles/addressingUnit/estEn.pdf | stripe.com/en-ee/pricing |
| FI | vero.fi/yritykset-ja-yhteisot/verot-ja-maksut/arvonlisaverotus/arvonli | "MMMa 834/2014 8 §:n mukaisesti pakkaamattomista elintarvikkeista vaadittavat tiedot voida | EU Directive 98/6/EC and 2005/29/EC art. 7(4)(c): advertised price must include all taxes and compul… | Not customary or expected; service is included. Rounding up or 5-10% a… | upu.int/UPU/media/upu/PostalEntitiesFiles/addressingUnit/finEn.pdf | stripe.com/en-fi/pricing |
| DE | gesetze-im-internet.de/ustg_1980/__12.html | LMIDV § 4 Abs. 3: info may be given "auf einem Schild auf dem Lebensmittel oder in der Näh | Preisangabenverordnung (PAngV 2022): § 3 requires the Gesamtpreis (total price incl. VAT and all oth… | Not customary at counters/takeaway/food trucks (a tip jar or rounding … | upu.int/UPU/media/upu/PostalEntitiesFiles/addressingUnit/deuEn.pdf | stripe.com/en-de/pricing |
| GI | gibraltar.gov.gi/press-releases/technical-notice-basic-features-of-the | UNVERIFIED - no Gibraltar text found to quote. EU 1169/2011 Art. 44(1)(a): 'the provision  | Consumer Protection (Unfair Trading) Act 2008, Gibraltar's transposition of the EU Unfair Commercial… | Not customary at counters or for takeaway; around 10% at table-service… | upu.int/UPU/media/upu/PostalEntitiesFiles/addressingUnit/gibEn.pdf | stripe.com/en-gi/pricing |
| GR | europa.eu/youreurope/business/taxation/vat/vat-rules-rates/index_en.ht | «Η δήλωση των ενδείξεων ... επιτρέπεται να δίνεται προφορικά αν πληρούνται σωρευτικά οι τρ | EU Directive 98/6/EC (price indication) and Directive 2005/29/EC (unfair commercial practices), tran… | Not customary for counter or takeaway food. At sit-down tavernas peopl… | upu.int/UPU/media/upu/PostalEntitiesFiles/addressingUnit/grcEn.pdf | stripe.com/en-gr/pricing |
| HU | nav.gov.hu/sajtoszoba/hirek/Az_ettermi_szoftver_nem_hazudik | §5(1): «Az allergiát vagy intoleranciát okozó anyagok és termékek késztermékben való jelen | EU Directive 98/6/EC, transposed by Joint Decree 4/2009 (I. 30.) NFGM-SZMM on price indication, and … | Not customary at counters or for street food. At table-service restaur… | upu.int/UPU/media/upu/PostalEntitiesFiles/addressingUnit/hunEn.pdf | stripe.com/hu/pricing |
| IT | europa.eu/youreurope/business/taxation/vat/vat-rules-rates/index_en.ht | Art. 19 c. 8: «Tale indicazione deve essere fornita, in modo che sia riconducibile a ciasc | Codice del Consumo (D.Lgs. 206/2005), arts. 13-17, transposing Directive 98/6/EC: the selling price … | Not customary for counter or street food. At restaurants a 'coperto' (… | upu.int/UPU/media/upu/PostalEntitiesFiles/addressingUnit/itaEn.pdf | stripe.com/en-it/pricing |
| LV | vid.gov.lv/lv/print/pdf/node/453 | As reported by LV portāls (2015): «ēdienkartē rakstveidā obligāti jānorāda ēdiena nosaukum | EU Directive 98/6/EC, transposed by Cabinet Regulation No. 178 (2014) on the procedure for indicatin… | Not customary at counters or for street food. Around 10% at table-serv… | upu.int/UPU/media/upu/PostalEntitiesFiles/addressingUnit/lvaEn.pdf | stripe.com/lv/pricing |
| LI | llv.li/en/national-administration/fiscal-authority/value-added-tax/vat | "Allergene müssen grundsätzlich schriftlich deklariert werden. Darauf kann verzichtet werd | Preisbekanntgabeverordnung (PBV), LGBl. 1996 Nr. 142, made under the UWG. It implements Directive 98… | Not customary for counter or street food. Service is included in price… | upu.int/UPU/media/upu/PostalEntitiesFiles/addressingUnit/lieEn.pdf | stripe.com/en-li/pricing |
| LT | lrs.lt/sip/portal.show?p_r=35435&p_t=292096&printVersion=1 | Informacija ... turi būti pateikiama raštu arba elektroninėmis priemonėmis bent vienoje in | EU Directive 98/6/EC (selling price = final price including VAT and all other taxes), as amended by … | Not customary at counters, takeaways or street food. About 10% is comm… | upu.int/UPU/media/upu/PostalEntitiesFiles/addressingUnit/ltuEn.pdf | stripe.com/en-lt/pricing |
| LU | pfi.public.lu/dam-assets/pdf/legislation/tva/loi/loi-tva-2024-01-01.pd | "Les mesures nationales prévoient que la déclaration des allergènes doit se faire sous for | EU Directive 98/6/EC, transposed in the Code de la consommation, art. L.112-2 (selling price = final… | Not customary at counters or for takeaway. Rounding up or about 5-10% … | upu.int/UPU/media/upu/PostalEntitiesFiles/addressingUnit/luxEn.pdf | stripe.com/en-lu/pricing |
| MT | legislation.mt/eli/cap/406/eng/pdf | Reg. (EU) 1169/2011 art. 44(1)(a): "the provision of the particulars specified in point (c | EU Directive 98/6/EC, transposed by Malta's Price Indication Regulations under the Consumer Affairs … | Not customary at counters, kiosks or for takeaway. About 5-10% is usua… | upu.int/UPU/media/upu/PostalEntitiesFiles/addressingUnit/mltEn.pdf | stripe.com/en-mt/pricing |
| NL | belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakeli | Art. 3: "In afwijking van artikel 2 mag de allergeneninformatie op de plaats van verkoop v | EU Directive 98/6/EC, transposed by the Besluit prijsaanduiding producten (made under the Prijzenwet… | Not customary at counters, snack bars or street food. Service is inclu… | upu.int/UPU/media/upu/PostalEntitiesFiles/addressingUnit/nldEn.pdf | stripe.com/en-nl/pricing |
| NO | skatteetaten.no/en/rettskilder/type/kunngjoringer/mva-pa-omsetning-ell | "Ikke-ferdigpakkede matvarer skal merkes skriftlig med tydelig varebetegnelse og allergene | Price Information Regulation (prisopplysningsforskriften, FOR-2012-11-14-1066) § 3: all prices given… | Not customary at counters or for takeaway. Service is included at rest… | upu.int/UPU/media/upu/PostalEntitiesFiles/addressingUnit/norEn.pdf | stripe.com/en-no/pricing |
| PL | infakt.pl/blog/?p=827 | § 19 ust. 1: for food offered without packaging "podaje się: 1) nazwę środka spożywczego . | EU Directive 98/6/EC, transposed by the Act of 9 May 2014 on price information for goods and service… | Not customary at counters or for street food (small change in a tip ja… | upu.int/UPU/media/upu/PostalEntitiesFiles/addressingUnit/polEn.pdf | stripe.com/en-pl/pricing |
| PT | info.portaldasfinancas.gov.pt/pt/informacao_fiscal/informacoes_vincula | DL 26/2016 art. 4.º n.º 1: food supplied by 'estabelecimentos de restauração coletiva' mus | EU Directive 98/6/EC, transposed by Decreto-Lei 138/90 (republished by DL 162/99; consolidated to 20… | Not customary at counters or for takeaway. Rounding up or about 5-10% … | upu.int/UPU/media/upu/PostalEntitiesFiles/addressingUnit/prtEn.pdf | stripe.com/en-pt/pricing |
| RO | noulcodfiscal.ro/titlu-7/capitol-8/articol-291.html | Order 163/2021 (as reported): food must be "însoțite, la vânzare, în mod obligatoriu, de i | EU Directive 98/6/EC, transposed by HG 947/2000 (republished 2008) on price indication. The sale pri… | Not customary at counters or for street food. About 10% is the norm at… | upu.int/UPU/media/upu/PostalEntitiesFiles/addressingUnit/rouEn.pdf | stripe.com/ro/pricing |
| SK | financnasprava.sk/_img/pfsedit/Dokumenty_PFS/Zverejnovanie_dok/Aktualn | Vyhláška 243/2015 § 3a (as inserted by 81/2018): "(2) Ak ide o nebalenú potravinu, pokrm a | EU Directive 98/6/EC, transposed by Zákon 108/2024 Z. z. o ochrane spotrebiteľa (consumer protection… | Not customary at counters or for street food. Rounding up to about 10%… | upu.int/UPU/media/upu/PostalEntitiesFiles/addressingUnit/svkEn.pdf | stripe.com/sk/pricing |
| SI | fu.gov.si/en/taxes_and_other_duties/areas_of_work/value_added_tax_vat | "Alergeni morajo biti določeni glede na njihovo vsebnost v posameznem živilu in pisno ozna | Prices must be shown including VAT, in euros (ZVPot-1 art. 14, Uradni list RS 130/2022), transposing… | Not customary at counters/takeaway; tipping in general is 'appreciated… | posta.si/zasebno-site/Documents/Priro%C4%8Dniki/Prirocnik-za-pravilno- | stripe.com/si/pricing |
| ES | sede.agenciatributaria.gob.es/static_files/Sede/Tema/IVA/IVA_reperc/Ti | "podrá facilitarse de forma oral, siempre y cuando ... se registre de forma escrita o elec | Real Decreto Legislativo 1/2007 (TRLGDCU) art. 20.1.c: commercial offers must state the complete fin… | UNVERIFIED (search budget exhausted). Default: not customary at counte… | correos.es/es/es/herramientas/codigos-postales/detalle | stripe.com/es/pricing |
| SE | skatteverket.se/omoss/pressochmedia/nyheter/2026/nyheter/livsmedelsmom | "Information om allergena ingredienser, eller en upplysning om att informationen finns att | Prisinformationslag (2004:347) § 2 defines 'pris' as the final price including VAT and other taxes; … | UNVERIFIED (search budget exhausted). Default: not customary at counte… | geopostcodes.com/country/sweden/address-format/ | stripe.com/en-se/pricing |
| CH | estv.admin.ch/estv/de/home/mehrwertsteuer/mwst-steuersaetze.html | LIV art. 5 para. 1 let. d: Angaben über Zutaten, die Allergien ... auslösen können, dürfen | Preisbekanntgabeverordnung (PBV / OIP, SR 942.211) art. 4 para. 1: passed-on public charges and any … | Not customary at counters/takeaway; service is included in prices (sin… | post.ch/en/sending-letters/addressing-and-designing/addressing-consign | stripe.com/en-ch/pricing |

**Decisions that override or go beyond the research (each one open to change):**
- **Norway:** card on its own allowed (true). The research read Norway's rule as "written for each dish", but a written
  notice covering every dish is accepted. Flagged.
- **Latvia:** card on its own NOT allowed (false). The rule ("must be written in the menu") is reported by a secondary
  source only. Unverified.
- **Lithuania and Luxembourg:** written information is required, but one table for the whole menu counts, so true.
- **Slovenia:** borderline; true.
- **Poland, Romania and Slovakia:** per-dish written information required, so false.
- **Switzerland:** the in-person fee is the cautious non-EEA rate (2.9 % + CHF 0.10). The Swiss pricing page lists Swiss
  cards online at 2.9 % + CHF 0.30.
- **Greece:** the processor offers no in-person payments (Terminal, Tap to Pay). The in-person columns hold the EEA rate,
  but a Greek truck can take card payments online only. **Flag before switching Greece on.**
- **Liechtenstein:** MWST 2.6 %, as Switzerland. That rate applies to counter-only sales; 8.1 % applies with seating.
- **Hungary:** the 40 Ft Tap to Pay fee should be re-checked against the Hungarian pricing page.
- **Spain:** the Canary Islands use IGIC, not IVA. A Canary truck sets its own rate (Manage › Payments).
- **Gibraltar:** the card-fee page has no UK-card rate. "Standard Gibraltar cards" cost 1.5 % + 20p, but UK cards may be
  billed as international (3.15 %). Test with a real charge.

## 3 · Address formats

One per country in `lib/address-formats.ts` (`EUROPE_ROWS`, built by `europeFormat`):
- **Fields:** street, town (required), postal code. Italy alone adds a region: 107 province codes after the town
  ("20122 Milano MI"), read from Places' level 2.
- **Where the code goes:**
  - before the town everywhere except Gibraltar and Malta ("Valletta VLT 1117", after the town);
  - Latvia: after the town, with a comma ("Rīga, LV-1050", the UPU form). This is a new `comma` flag; without a code the
    line leaves no stray comma.
- **Normalisers** write a typed code the local way:
  - "11000" → "110 00" (CZ, SE, GR, SK);
  - "31042" → "31-042" (PL);
  - "1100148" → "1100-148" (PT);
  - "1012js" → "1012 JS" (NL);
  - "1648" → "L-1648" (LU);
  - "1050" → "LV-1050";
  - "01143" → "LT-01143";
  - "vlt1117" → "VLT 1117";
  - "gx111aa" → "GX11 1AA".
- **Liechtenstein** accepts 9485–9498 only. A postal code never identifies one premises.
- **Admin label:** each format has one in the country's terms ("Germany — Postleitzahl, Ort").
- **Postal-code label:** "postcode" for Malta and Gibraltar; "postal code" everywhere else.
- **AI rules:** the importer, screenshot and scraper rules are written per country. They name its postal-code shape and
  position, the language schedules arrive in, and how it writes times ("18 Uhr", "18.30", "kl. 18").
- **Order:** `ADDRESS_FORMAT_KEYS` is in the CHECK's order (address-formats-1's rule): gb us ie au nz ca fr, then the 29.
- **Validator:** `validateAddressFormats()` reports nothing.

## 4 · VAT, surcharges, service fee, tips

- **VAT is included in every price.** The takeaway hot-food rate is **data on the country's format** (`includedTax`), as
  France's is. Receipts and tickets show the « Dont … » line in the country's own label ("MwSt. 7 %"). Nothing is ever
  added. A truck's own rate wins (Manage › Payments). Gibraltar has no VAT and so no line; its Transaction Tax (since 15
  July 2026) applies to goods at import, at 0 % on food.
- **The rates and labels** are in the §2 table:
  - Germany: 7 % on food from 2026; drinks stay at 19 %.
  - Finland: 13.5 % from 1 January 2026.
  - Sweden: 6 % from 1 April 2026 to 31 December 2027 (12 % to eat in).
  - Switzerland: 2.6 % takeaway (8.1 % on site).
  - Hungary: 27 % takeaway (5 % on site).
  - Malta: 18 % on all ready-to-eat food.
  - Belgium: 6 % (the 12 % takeaway plan was withdrawn on 13 February 2026).
  - Cyprus: 5 % takeaway (9 % on site).
  - Romania: 11 % since August 2025.
  - Norway: 15 % takeaway (25 % with seating).
  - Portugal: 13 %.
  - Bulgaria: 20 % (the 9 % restaurant rate ended in 2024).
  - Poland: 8 %, but 5 % is argued for some takeaway food. Flag.
  - Slovakia: 19 %, from a secondary source.
  - Croatia: drinks are 25 % plus a local consumption tax.
- **No card surcharge anywhere:**
  - EU/EEA: PSD2 art. 62(4) bans surcharges on consumer cards;
  - Switzerland: PBV art. 3(1) and 4(1), the price shown must be the price paid;
  - Norway: prisopplysningsforskriften § 3.
- **No service fee anywhere:** a compulsory charge must be in the advertised price. Sources: Directive 98/6/EC art. 2(a),
  CRD art. 6(1)(e), Germany's PAngV § 13(5), Switzerland's PBV, Norway's § 3, and each country's transposition (§2
  sources).
- **Tipping is off:** the research found it customary at no counter or takeaway. Spain and Sweden are UNVERIFIED (the
  research ran out of budget), so the default applies.

## 5 · Allergens

- **uk14 everywhere.** It is the EU's 14 (FIC 1169/2011 Annex II; art. 44(1)(a) makes them mandatory for non-prepacked
  food). Switzerland's are the same 14 (LIV art. 5(1)(d)).
- **`allergen_card_only_allowed`** is per country, as in §2: false for PL, RO, SK and LV, true elsewhere.
- **Country notes:**
  - Denmark requires the allergen notice online too.
  - Greek allergen information must be in Greek.
  - Gibraltar has no instrument by name; the retained EU 1169/2011 is assumed (UNVERIFIED).

## 6 · Card fees

The online, in-person and Tap to Pay fees are in the §2 table, in each currency's minor units, from each country's
pricing page.
- **Euro countries:** 1.5 % + €0.25 online, 1.4 % + €0.10 in person, €0.10 Tap to Pay, labelled "EEA cards".
- **Other region labels:** Switzerland "Swiss cards", Norway "Norwegian and EEA cards", Gibraltar "Gibraltar cards".
  france-1 keeps the label in English in the row; a language file words it (`planFeatures.cardRegion.*`).

## 7 · Locales and languages

- **Each row names its main language's locale.** Until that language lands, the words resolve to en-GB.
  **Recommendation: do not switch on a non-English country before its language.** Its hreflang would otherwise name a
  language the page isn't in.
- **Malta (en-MT) and Gibraltar (en-GI)** are sparse English overrides over en-IE (`LOCALE_PARENT`):
  - en-MT is `{}`: euros, cents, "Pay at the truck".
  - en-GI has one key: "Pence per order" (en-IE says "Cents").
  - Both can go live in English once they are switched on.
- **The Gibraltar money fix.** Intl's en-GI treats sterling as foreign ("GB£29", because Gibraltar's own pound is GIP).
  - `lib/currencies.ts` gains `narrowIn`: the locales where a currency is written with its narrow symbol. GBP has
    ['en-GI'] and RON has ['ro-RO'].
  - `lib/money-format.ts` applies it to every amount in those locales: menus, orders, emails, plan prices.
  - The order page's tip-box symbol now comes from the same formatter.
  - Every other locale's Intl options are untouched; the byte-identity snapshot proves it.
  - It also fixes Romania's truck menus ("8,50 lei", not "8,50 RON").
- **Belgium, Switzerland and Luxembourg** (europe-readiness §B.4; one language per country for now):
  - **Belgium: nl-BE**, the Dutch-speaking majority (about 58 %). A second language (fr-BE) needs per-truck or
    per-visitor language choice, which is a separate decision with a mockup. In the meantime, Brussels and Wallonia trucks
    would get Dutch pages.
  - **Switzerland: de-CH**, about 62 % German. A second language (fr-CH, then it-CH) has the same need. de-CH is a sparse
    override of de-DE ("ss" for "ß", CHF).
  - **Luxembourg: fr-LU**, because French is the language of business and of most consumer information. It is a sparse
    override of fr-FR, so it can follow France's language with almost no work. German would be the second language.

**Dominant payment methods** (a NOTE only; nothing built):

| Country | Dominant payment methods (NOTE only — nothing built) |
|---|---|
| AT | cash (still >60% of POS transactions); eps-Überweisung (online bank transfer); Apple Pay / Google Pay; open invoice / Klarna (online) (dnb.nl/en/general-news/news-2025/cash-remains-a-key-payment-method-in-) |
| BE | Bancontact (cards + Bancontact Pay app QR); Payconiq (being merged into Bancontact Pay / Wero in 2026); Wero; cash (bancontact.com/en/payconiq-evolves) |
| BG | cash (dominant for small purchases); cards; cash on delivery (online); ePay.bg / EasyPay (bill-pay / cash-in networks) |
| HR | cash; cards; cash on delivery (online - ~half of shoppers); KEKS Pay (Erste wallet) / Aircash - UNVERIFIED share (adyen.com/payment-methods-guides/europe/croatia) |
| CY | cards (75% of non-cash transactions - highest card share in euro area H2 2025); cash (older customers, small purchases); bank transfer; mobile wallets (Apple/Google Pay, Revolut) - growing (cyprus-mail.com/2026/02/02/cyprus-sees-largest-drop-in-cash-use-across) |
| CZ | Cards dominate (incl. Apple Pay/Google Pay); QR bank-transfer payments ('QR platba') and online bank transfers are the main local alternatives; cash on delivery still common in e-commerce. No single dominant Czech wallet. (help.comgate.cz/docs/en/about-payment-methods) |
| DK | MobilePay (dominant Danish wallet; Stripe supports it for DK customers, presentment DKK/EUR/NOK/SEK; MobilePay charges DK-registered businesses a 35 DKK monthly fee via Stripe) and Dankort (national debit card, usually co-badged Visa). (docs.stripe.com/payments/mobilepay) |
| EE | Bank links / pay-by-bank (Swedbank, SEB, LHV, also Luminor, Coop, Citadele, Revolut) dominate e-commerce; cards plus Apple Pay/Google Pay in person. (montonio.com/?p=3923) |
| FI | MobilePay (wallet used in Denmark and Finland, supported by Stripe) and online bank payments ('verkkopankkimaksu', usually via Paytrail/Checkout Finland) in e-commerce; cards/contactless in person. (docs.stripe.com/payments/mobilepay) |
| DE | Cash still 45% of transactions (2025); girocard (national debit card) is the most-used cashless method in person; mobile payments 10%. Online: PayPal, SEPA direct debit, Klarna, and Wero (EPI) - online shares UNVERIFIED. (bundesbank.de/en/press/press-releases/payment-behaviour-in-germany-in-) |
| GI | ['cards (Visa/Mastercard, contactless)', 'Apple Pay / Google Pay', 'cash (GIP/GBP; euros widely accepted in shops)'] (stripe.com/en-gi/pricing) |
| GR | ['cards (contactless; card acceptance is mandatory for most retail and catering businesses)', 'Apple Pay / Google Pay', 'IRIS (instant account-to-account via DIAS, used for P2P and increasingly for merchants)', 'cash'] |
| HU | ['cards (contactless very widespread)', 'Apple Pay / Google Pay', "SZÉP kártya (employer-funded leisure card whose 'vendéglátás' (hospitality) pocket is widely used to pay at restaurants and street-food stalls)", 'Qvik (central-bank-backed instant-payment QR/N |
| IT | ['cards (incl. domestic PagoBANCOMAT debit)', "Satispay (Stripe: 'a digital wallet popular with Italian customers'; online only via Stripe, not Terminal)", 'Apple Pay / Google Pay', 'Bancomat Pay', 'buoni pasto / meal vouchers (Ticket Restaurant, Edenred etc.) (docs.stripe.com/payments/satispay) |
| LV | ['cards (contactless dominant)', 'Apple Pay / Google Pay', 'bank-link / instant SEPA transfers (Swedbank, SEB, Citadele, Luminor)', 'cash'] |
| LI | ['TWINT'] |
| LT | ['bank links / pay-by-bank (Swedbank, SEB, Luminor via Paysera/Montonio-type aggregators)', 'Revolut'] |
| LU | ['Wero (replacing Payconiq)', 'Payconiq (until 30 Sep 2026)'] (worldline.com/en-lu/home/main-navigation/resources/blogs/2026/what-hap) |
| MT | ['cards (contactless, Apple/Google Pay)', 'Revolut', 'cash still common at kiosks/pastizzerias'] |
| NL | ["iDEAL (now branded 'iDEAL / Wero')", 'Wero'] (ideal.nl/en/ideal-vanaf-2026-stapsgewijs-over-naar-wero) |
| NO | ['Vipps (Vipps MobilePay), the dominant mobile wallet with about 4.68m users at end-2025', 'BankAxept (domestic debit scheme: 70% of card payments at physical terminals in 2025)'] (norges-bank.no/en/news-events/publications/retail-payment-services/ret) |
| PL | ['BLIK', 'Przelewy24 (bank transfer aggregator)'] (docs.stripe.com/payments/blik) |
| PT | ['MB WAY (mobile wallet)', 'Multibanco (ATM/online-banking reference vouchers)'] (docs.stripe.com/payments/mb-way) |
| RO | ['Cards (debit-heavy, contactless)', 'Cash still widely used', 'RoPay (instant account-to-account payments, mainly P2P)'] (thepaypers.com/expert-opinion/romania-2025-analysis-of-payments-and-ec) |
| SK | ['Cards (contactless debit dominant)', 'Apple Pay / Google Pay'] (wise.com/gb/hub/payment-methods/slovakia) |
| SI | ['Flik (bank-backed instant payments: phone at POS terminal, Flik QR code, online by phone number)', 'cards (Visa/Mastercard, Maestro)', 'cash'] (flik.si/) |
| ES | ['Bizum (31.5M active users; in-store NFC via Bizum Pay or bank app; ~120,000 online merchants)', 'cards', 'cash (still the main in-store method for 57% of consumers in 2025)'] (bizum.com/es/) |
| SE | ['Swish (bank-backed mobile payments, since 2012; widely used for P2P and small merchants incl. market stalls and food trucks via QR/phone number)', 'cards (dominant)', 'cash is rare'] (swish.nu/) |
| CH | ['TWINT (dominant Swiss mobile payment; >6 million regular users, 901M transactions in 2025 per TWINT)', 'debit/credit cards', 'cash (still top in-store at 28.1% per Swiss Payment Monitor 2025)'] (twint.ch/en/company/) |

Payconiq has shut down and been replaced by Wero (BE and LU); iDEAL is moving to Wero (NL). MobilePay costs Danish businesses
35 DKK a month. SZÉP cards can't be taken through the processor.

## 8 · Prices — ⚠️ AWAITING DOMINIC'S APPROVAL (non-euro)

The brief fixes the euro prices: **€29 Pro (including €4,000 of online orders) and €69 Unlimited**, with Pay as you go free
at 0.99 %. For every other currency, these are local prices proposed from the **ECB reference rates of 22 October 2026**
(ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml). Each is rounded to a price locals would expect, close to the euro
figure. An extra van costs the plan's own price.

| Currency (countries) | ECB rate (1 €) | Pro | Unlimited | Pro includes | ≈ € (Pro / Unlimited / included) |
|---|---|---|---|---|---|
| EUR (20 countries) | — | €29 | €69 | €4,000 | — (the brief's prices) |
| CHF (CH, LI) | 0.9211 | CHF 27 | CHF 65 | CHF 3,700 | €29.31 / €70.57 / €4,017 |
| CZK (CZ) | 24.26 | 699 Kč | 1 690 Kč | 100 000 Kč | €28.81 / €69.66 / €4,122 |
| DKK (DK) | 7.4747 | 219 kr. | 519 kr. | 30.000 kr. | €29.30 / €69.43 / €4,014 |
| HUF (HU) | 366.43 | 10 990 Ft | 24 990 Ft | 1 500 000 Ft | €29.99 / €68.20 / €4,094 |
| NOK (NO) | 10.488 | 299 kr | 729 kr | 42 000 kr | €28.51 / €69.51 / €4,005 |
| PLN (PL) | 4.3695 | 129 zł | 299 zł | 17 500 zł | €29.52 / €68.43 / €4,005 |
| RON (RO) | 5.345 | 149 lei | 369 lei | 21 500 lei | €27.88 / €69.04 / €4,022 |
| SEK (SE) | 11.112 | 329 kr | 769 kr | 45 000 kr | €29.61 / €69.20 / €4,050 |
| GBP (GI) | 0.8377 | £29 | £69 | £4,000 | €34.62 / €82.37 / €4,775 — the UK's live prices, so Gibraltar matches the UK; flagged |

- **HUF:** the processor takes HUF in two-decimal minor units (currency-registry), so 10 990 Ft is stored as 1099000.
- **Gibraltar** is priced as the UK. At the euro rate, £25 / £59 would be the "same" price. Choose either.
- **The native forms** above are as the pages render them (the harness checks them: §13).

## 9 · The SQL

### 9.1 Block A — "run now" — ⚠️ ALREADY APPLIED (§0)

Widens the address-format CHECK. It includes France's `fr` (a superset of france-1's 20261033). The currency CHECK already
allowed every currency these rows use, and no other CHECK changes.

```sql
-- europe-settings (22 October 2026, docs/europe-settings-report.md §9) — BLOCK A, "RUN NOW" (before or after the deploy; either
-- is safe). ⚠️ NOT RUN when written. Widens the address-format CHECK to the 29 European formats (lib/address-formats.ts
-- EUROPE_ROWS). No row holds any of them yet, so nothing changes for anyone. It must run BEFORE block B
-- (20261036_europe_rows.sql). It also keeps France's 'fr' (france-1's block A, 20261033 — run either first; this one is a superset).
-- The currency CHECK already allows every currency these rows use (EUR, CHF, CZK, DKK, GBP, HUF, NOK, PLN, RON, SEK); the
-- allergen-set CHECK already allows 'uk14'. No other CHECK changes.
begin;
alter table public.country_settings drop constraint country_settings_address_format_chk;
alter table public.country_settings add constraint country_settings_address_format_chk
  check (address_format in ('gb', 'us', 'ie', 'au', 'nz', 'ca', 'fr', 'at', 'be', 'bg', 'hr', 'cy', 'cz', 'dk', 'ee', 'fi', 'de', 'gi', 'gr', 'hu', 'it', 'lv', 'li', 'lt', 'lu', 'mt', 'nl', 'no', 'pl', 'pt', 'ro', 'sk', 'si', 'es', 'se', 'ch'));
commit;

-- Check: select pg_get_constraintdef(oid) from pg_constraint where conname = 'country_settings_address_format_chk';
```

### 9.2 Block B — "run after deploy", after block A — ⚠️ ALREADY APPLIED (§0), byte-identical to this file

```sql
-- europe-settings (22 October 2026, docs/europe-settings-report.md §9) — BLOCK B, "RUN AFTER DEPLOY", after block A
-- (20261035_europe_address_formats.sql). ⚠️ NOT RUN when written.
-- Every remaining Stripe-supported European country (stripe.com/global), SWITCHED OFF (enabled = false): each /<code> keeps
-- redirecting to /uk and the country is in no router pick, hreflang set, sitemap, menu, /llms.txt or signup list until it is
-- switched on in Admin › Countries — and a country whose language is not built yet should stay off until it is.
-- After the deploy because the deployed code is what reads each address format (and its included VAT), en-MT and en-GI.
-- Rows before prices (plan_prices references country_settings).
--
-- Common to every row (each sourced in the report): 24-hour, day-month-year, weeks start Monday, km, phone check 'length'
-- (each example is libphonenumber's own mobile example, which the app's check accepts) · prices INCLUDE VAT — the takeaway
-- food rate is data on the country's address format (lib/address-formats.ts includedTax), the truck may set its own ·
-- allergen set uk14 (the EU 14; Switzerland's are the same 14) · NO CARD SURCHARGE (EU PSD2 art. 62(4); CH/NO: the price shown
-- must be the price paid) · NO SERVICE FEE: the advertised price must include every compulsory charge (Directive 98/6/EC art.
-- 2(a); Swiss PBV art. 3-4; Norway's prisopplysningsforskriften § 3) · tipping off, no presets (not customary for counter food).
-- Card fees: each country's stripe.com/<cc>/pricing page (online, in person, Tap to Pay per authorisation), in the currency's
-- minor units.
begin;

insert into public.country_settings (
  country_code, name, enabled, currency, locale, time_format, date_order, week_start,
  phone_country_code, address_format, timezones, default_timezone,
  prices_include_tax, tax_label,
  card_surcharge_allowed, card_surcharge_cap_pct, card_surcharge_credit_only, card_surcharge_excluded_regions,
  service_fee_allowed, tipping_enabled_default, tip_presets_pct, allergen_set,
  starter_monthly_minor, pro_monthly_minor, max_monthly_minor, pro_allowance_minor, max_allowance_minor, platform_fee_pct,
  card_fee_online_pct, card_fee_online_fixed_minor, card_fee_in_person_pct, card_fee_in_person_fixed_minor,
  tap_to_pay_fixed_minor, card_fee_region_label,
  competitor_name, competitor_pct, competitor_fixed_minor, support_hours, updated_by,
  short_name, phone_example, phone_check, distance_unit,
  service_fee_recipient, service_fee_hatchgrab_bps, service_fee_hatchgrab_fixed_minor,
  service_fee_truck_max_bps, service_fee_truck_max_fixed_minor,
  platform_fee_enabled, fees_taxed, allergen_card_only_allowed
) values
  -- Austria: EUR, de-AT, USt. 10 % on takeaway food (data on the format), allergen card on its own allowed
  ('AT', 'Austria', false, 'EUR', 'de-AT', '24h', 'dmy', 'monday', '43', 'at', array['Europe/Vienna'], 'Europe/Vienna', true, 'USt.', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Austria', '0664 123456', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Belgium: EUR, nl-BE, btw 6 % on takeaway food (data on the format), allergen card on its own allowed
  ('BE', 'Belgium', false, 'EUR', 'nl-BE', '24h', 'dmy', 'monday', '32', 'be', array['Europe/Brussels'], 'Europe/Brussels', true, 'btw', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Belgium', '0450 00 12 34', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Bulgaria: EUR, bg-BG, ДДС 20 % on takeaway food (data on the format), allergen card on its own allowed
  ('BG', 'Bulgaria', false, 'EUR', 'bg-BG', '24h', 'dmy', 'monday', '359', 'bg', array['Europe/Sofia'], 'Europe/Sofia', true, 'ДДС', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Bulgaria', '043 012 345', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Croatia: EUR, hr-HR, PDV 13 % on takeaway food (data on the format), allergen card on its own allowed
  ('HR', 'Croatia', false, 'EUR', 'hr-HR', '24h', 'dmy', 'monday', '385', 'hr', array['Europe/Zagreb'], 'Europe/Zagreb', true, 'PDV', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Croatia', '092 123 4567', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Cyprus: EUR, el-CY, ΦΠΑ 5 % on takeaway food (data on the format), allergen card on its own allowed
  ('CY', 'Cyprus', false, 'EUR', 'el-CY', '24h', 'dmy', 'monday', '357', 'cy', array['Asia/Nicosia'], 'Asia/Nicosia', true, 'ΦΠΑ', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Cyprus', '96 123456', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Czech Republic: CZK, cs-CZ, DPH 12 % on takeaway food (data on the format), allergen card on its own allowed
  ('CZ', 'Czech Republic', false, 'CZK', 'cs-CZ', '24h', 'dmy', 'monday', '420', 'cz', array['Europe/Prague'], 'Europe/Prague', true, 'DPH', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 650, 1.40, 225, 220, 'EEA cards', null, null, null, null, 'europe-settings draft', 'the Czech Republic', '601 123 456', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Denmark: DKK, da-DK, moms 25 % on takeaway food (data on the format), allergen card on its own allowed
  ('DK', 'Denmark', false, 'DKK', 'da-DK', '24h', 'dmy', 'monday', '45', 'dk', array['Europe/Copenhagen'], 'Europe/Copenhagen', true, 'moms', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 180, 1.40, 75, 70, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Denmark', '34 41 23 45', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Estonia: EUR, et-EE, km 24 % on takeaway food (data on the format), allergen card on its own allowed
  ('EE', 'Estonia', false, 'EUR', 'et-EE', '24h', 'dmy', 'monday', '372', 'ee', array['Europe/Tallinn'], 'Europe/Tallinn', true, 'km', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Estonia', '5123 4567', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Finland: EUR, fi-FI, ALV 13.5 % on takeaway food (data on the format), allergen card on its own allowed
  ('FI', 'Finland', false, 'EUR', 'fi-FI', '24h', 'dmy', 'monday', '358', 'fi', array['Europe/Helsinki'], 'Europe/Helsinki', true, 'ALV', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Finland', '041 2345678', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Germany: EUR, de-DE, MwSt. 7 % on takeaway food (data on the format), allergen card on its own allowed
  ('DE', 'Germany', false, 'EUR', 'de-DE', '24h', 'dmy', 'monday', '49', 'de', array['Europe/Berlin'], 'Europe/Berlin', true, 'MwSt.', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Germany', '01512 3456789', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Gibraltar: GBP, en-GI, no VAT, allergen card on its own allowed
  ('GI', 'Gibraltar', false, 'GBP', 'en-GI', '24h', 'dmy', 'monday', '350', 'gi', array['Europe/Gibraltar'], 'Europe/Gibraltar', true, 'Tax', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 20, 1.40, 10, 10, 'Gibraltar cards', null, null, null, null, 'europe-settings draft', 'Gibraltar', '57123456', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Greece: EUR, el-GR, ΦΠΑ 13 % on takeaway food (data on the format), allergen card on its own allowed
  ('GR', 'Greece', false, 'EUR', 'el-GR', '24h', 'dmy', 'monday', '30', 'gr', array['Europe/Athens'], 'Europe/Athens', true, 'ΦΠΑ', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Greece', '691 234 5678', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Hungary: HUF, hu-HU, ÁFA 27 % on takeaway food (data on the format), allergen card on its own allowed
  ('HU', 'Hungary', false, 'HUF', 'hu-HU', '24h', 'dmy', 'monday', '36', 'hu', array['Europe/Budapest'], 'Europe/Budapest', true, 'ÁFA', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 8500, 1.40, 2000, 4000, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Hungary', '06 20 123 4567', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Italy: EUR, it-IT, IVA 10 % on takeaway food (data on the format), allergen card on its own allowed
  ('IT', 'Italy', false, 'EUR', 'it-IT', '24h', 'dmy', 'monday', '39', 'it', array['Europe/Rome'], 'Europe/Rome', true, 'IVA', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Italy', '312 345 6789', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Latvia: EUR, lv-LV, PVN 21 % on takeaway food (data on the format), allergen card on its own NOT allowed (per-dish written information required)
  ('LV', 'Latvia', false, 'EUR', 'lv-LV', '24h', 'dmy', 'monday', '371', 'lv', array['Europe/Riga'], 'Europe/Riga', true, 'PVN', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Latvia', '21 234 567', 'length', 'km', 'truck', null, null, null, null, false, false, false),
  -- Liechtenstein: CHF, de-LI, MWST 2.6 % on takeaway food (data on the format), allergen card on its own allowed
  ('LI', 'Liechtenstein', false, 'CHF', 'de-LI', '24h', 'dmy', 'monday', '423', 'li', array['Europe/Vaduz'], 'Europe/Vaduz', true, 'MWST', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 30, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Liechtenstein', '660 234 567', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Lithuania: EUR, lt-LT, PVM 21 % on takeaway food (data on the format), allergen card on its own allowed
  ('LT', 'Lithuania', false, 'EUR', 'lt-LT', '24h', 'dmy', 'monday', '370', 'lt', array['Europe/Vilnius'], 'Europe/Vilnius', true, 'PVM', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Lithuania', '0612 34567', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Luxembourg: EUR, fr-LU, TVA 3 % on takeaway food (data on the format), allergen card on its own allowed
  ('LU', 'Luxembourg', false, 'EUR', 'fr-LU', '24h', 'dmy', 'monday', '352', 'lu', array['Europe/Luxembourg'], 'Europe/Luxembourg', true, 'TVA', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Luxembourg', '628 123 456', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Malta: EUR, en-MT, VAT 18 % on takeaway food (data on the format), allergen card on its own allowed
  ('MT', 'Malta', false, 'EUR', 'en-MT', '24h', 'dmy', 'monday', '356', 'mt', array['Europe/Malta'], 'Europe/Malta', true, 'VAT', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Malta', '9696 1234', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Netherlands: EUR, nl-NL, btw 9 % on takeaway food (data on the format), allergen card on its own allowed
  ('NL', 'Netherlands', false, 'EUR', 'nl-NL', '24h', 'dmy', 'monday', '31', 'nl', array['Europe/Amsterdam'], 'Europe/Amsterdam', true, 'btw', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'the Netherlands', '06 12345678', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Norway: NOK, nb-NO, MVA 15 % on takeaway food (data on the format), allergen card on its own allowed
  ('NO', 'Norway', false, 'NOK', 'nb-NO', '24h', 'dmy', 'monday', '47', 'no', array['Europe/Oslo'], 'Europe/Oslo', true, 'MVA', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 2.40, 200, 1.40, 100, 105, 'Norwegian and EEA cards', null, null, null, null, 'europe-settings draft', 'Norway', '40 61 23 45', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Poland: PLN, pl-PL, VAT 8 % on takeaway food (data on the format), allergen card on its own NOT allowed (per-dish written information required)
  ('PL', 'Poland', false, 'PLN', 'pl-PL', '24h', 'dmy', 'monday', '48', 'pl', array['Europe/Warsaw'], 'Europe/Warsaw', true, 'VAT', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 100, 1.40, 0, 40, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Poland', '512 345 678', 'length', 'km', 'truck', null, null, null, null, false, false, false),
  -- Portugal: EUR, pt-PT, IVA 13 % on takeaway food (data on the format), allergen card on its own allowed
  ('PT', 'Portugal', false, 'EUR', 'pt-PT', '24h', 'dmy', 'monday', '351', 'pt', array['Europe/Lisbon', 'Atlantic/Madeira', 'Atlantic/Azores'], 'Europe/Lisbon', true, 'IVA', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Portugal', '912 345 678', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Romania: RON, ro-RO, TVA 11 % on takeaway food (data on the format), allergen card on its own NOT allowed (per-dish written information required)
  ('RO', 'Romania', false, 'RON', 'ro-RO', '24h', 'dmy', 'monday', '40', 'ro', array['Europe/Bucharest'], 'Europe/Bucharest', true, 'TVA', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 100, 1.40, 25, 50, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Romania', '0712 034 567', 'length', 'km', 'truck', null, null, null, null, false, false, false),
  -- Slovakia: EUR, sk-SK, DPH 19 % on takeaway food (data on the format), allergen card on its own NOT allowed (per-dish written information required)
  ('SK', 'Slovakia', false, 'EUR', 'sk-SK', '24h', 'dmy', 'monday', '421', 'sk', array['Europe/Bratislava'], 'Europe/Bratislava', true, 'DPH', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Slovakia', '0912 123 456', 'length', 'km', 'truck', null, null, null, null, false, false, false),
  -- Slovenia: EUR, sl-SI, DDV 9.5 % on takeaway food (data on the format), allergen card on its own allowed
  ('SI', 'Slovenia', false, 'EUR', 'sl-SI', '24h', 'dmy', 'monday', '386', 'si', array['Europe/Ljubljana'], 'Europe/Ljubljana', true, 'DDV', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Slovenia', '031 234 567', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Spain: EUR, es-ES, IVA 10 % on takeaway food (data on the format), allergen card on its own allowed
  ('ES', 'Spain', false, 'EUR', 'es-ES', '24h', 'dmy', 'monday', '34', 'es', array['Europe/Madrid', 'Atlantic/Canary'], 'Europe/Madrid', true, 'IVA', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Spain', '612 34 56 78', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Sweden: SEK, sv-SE, moms 6 % on takeaway food (data on the format), allergen card on its own allowed
  ('SE', 'Sweden', false, 'SEK', 'sv-SE', '24h', 'dmy', 'monday', '46', 'se', array['Europe/Stockholm'], 'Europe/Stockholm', true, 'moms', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 180, 1.40, 100, 105, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Sweden', '070-123 45 67', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Switzerland: CHF, de-CH, MWST 2.6 % on takeaway food (data on the format), allergen card on its own allowed
  ('CH', 'Switzerland', false, 'CHF', 'de-CH', '24h', 'dmy', 'monday', '41', 'ch', array['Europe/Zurich'], 'Europe/Zurich', true, 'MWST', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 2.90, 30, 2.90, 10, 10, 'Swiss cards', null, null, null, null, 'europe-settings draft', 'Switzerland', '078 123 45 67', 'length', 'km', 'truck', null, null, null, null, false, false, true);

-- Plans: euro countries at €29 / €69, Pro including €4,000 of online orders (the brief). Every other currency: the PROPOSED
-- local prices (ECB reference rates of 22 October 2026), ⚠️ AWAITING DOMINIC'S APPROVAL — change the numbers here before running
-- if he picks others. Extra van = the plan's price.
insert into public.plan_prices (plan_key, country_code, monthly_minor, included_online_minor, fee_bps, extra_van_monthly_minor) values
  ('payg', 'AT', 0, 0, 99, 0),
  ('pro', 'AT', 2900, 400000, 99, 2900),
  ('unlimited', 'AT', 6900, null, 0, 6900),
  ('payg', 'BE', 0, 0, 99, 0),
  ('pro', 'BE', 2900, 400000, 99, 2900),
  ('unlimited', 'BE', 6900, null, 0, 6900),
  ('payg', 'BG', 0, 0, 99, 0),
  ('pro', 'BG', 2900, 400000, 99, 2900),
  ('unlimited', 'BG', 6900, null, 0, 6900),
  ('payg', 'HR', 0, 0, 99, 0),
  ('pro', 'HR', 2900, 400000, 99, 2900),
  ('unlimited', 'HR', 6900, null, 0, 6900),
  ('payg', 'CY', 0, 0, 99, 0),
  ('pro', 'CY', 2900, 400000, 99, 2900),
  ('unlimited', 'CY', 6900, null, 0, 6900),
  ('payg', 'CZ', 0, 0, 99, 0),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('pro', 'CZ', 69900, 10000000, 99, 69900),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('unlimited', 'CZ', 169000, null, 0, 169000),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('payg', 'DK', 0, 0, 99, 0),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('pro', 'DK', 21900, 3000000, 99, 21900),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('unlimited', 'DK', 51900, null, 0, 51900),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('payg', 'EE', 0, 0, 99, 0),
  ('pro', 'EE', 2900, 400000, 99, 2900),
  ('unlimited', 'EE', 6900, null, 0, 6900),
  ('payg', 'FI', 0, 0, 99, 0),
  ('pro', 'FI', 2900, 400000, 99, 2900),
  ('unlimited', 'FI', 6900, null, 0, 6900),
  ('payg', 'DE', 0, 0, 99, 0),
  ('pro', 'DE', 2900, 400000, 99, 2900),
  ('unlimited', 'DE', 6900, null, 0, 6900),
  ('payg', 'GI', 0, 0, 99, 0),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('pro', 'GI', 2900, 400000, 99, 2900),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('unlimited', 'GI', 6900, null, 0, 6900),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('payg', 'GR', 0, 0, 99, 0),
  ('pro', 'GR', 2900, 400000, 99, 2900),
  ('unlimited', 'GR', 6900, null, 0, 6900),
  ('payg', 'HU', 0, 0, 99, 0),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('pro', 'HU', 1099000, 150000000, 99, 1099000),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('unlimited', 'HU', 2499000, null, 0, 2499000),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('payg', 'IT', 0, 0, 99, 0),
  ('pro', 'IT', 2900, 400000, 99, 2900),
  ('unlimited', 'IT', 6900, null, 0, 6900),
  ('payg', 'LV', 0, 0, 99, 0),
  ('pro', 'LV', 2900, 400000, 99, 2900),
  ('unlimited', 'LV', 6900, null, 0, 6900),
  ('payg', 'LI', 0, 0, 99, 0),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('pro', 'LI', 2700, 370000, 99, 2700),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('unlimited', 'LI', 6500, null, 0, 6500),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('payg', 'LT', 0, 0, 99, 0),
  ('pro', 'LT', 2900, 400000, 99, 2900),
  ('unlimited', 'LT', 6900, null, 0, 6900),
  ('payg', 'LU', 0, 0, 99, 0),
  ('pro', 'LU', 2900, 400000, 99, 2900),
  ('unlimited', 'LU', 6900, null, 0, 6900),
  ('payg', 'MT', 0, 0, 99, 0),
  ('pro', 'MT', 2900, 400000, 99, 2900),
  ('unlimited', 'MT', 6900, null, 0, 6900),
  ('payg', 'NL', 0, 0, 99, 0),
  ('pro', 'NL', 2900, 400000, 99, 2900),
  ('unlimited', 'NL', 6900, null, 0, 6900),
  ('payg', 'NO', 0, 0, 99, 0),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('pro', 'NO', 29900, 4200000, 99, 29900),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('unlimited', 'NO', 72900, null, 0, 72900),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('payg', 'PL', 0, 0, 99, 0),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('pro', 'PL', 12900, 1750000, 99, 12900),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('unlimited', 'PL', 29900, null, 0, 29900),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('payg', 'PT', 0, 0, 99, 0),
  ('pro', 'PT', 2900, 400000, 99, 2900),
  ('unlimited', 'PT', 6900, null, 0, 6900),
  ('payg', 'RO', 0, 0, 99, 0),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('pro', 'RO', 14900, 2150000, 99, 14900),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('unlimited', 'RO', 36900, null, 0, 36900),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('payg', 'SK', 0, 0, 99, 0),
  ('pro', 'SK', 2900, 400000, 99, 2900),
  ('unlimited', 'SK', 6900, null, 0, 6900),
  ('payg', 'SI', 0, 0, 99, 0),
  ('pro', 'SI', 2900, 400000, 99, 2900),
  ('unlimited', 'SI', 6900, null, 0, 6900),
  ('payg', 'ES', 0, 0, 99, 0),
  ('pro', 'ES', 2900, 400000, 99, 2900),
  ('unlimited', 'ES', 6900, null, 0, 6900),
  ('payg', 'SE', 0, 0, 99, 0),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('pro', 'SE', 32900, 4500000, 99, 32900),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('unlimited', 'SE', 76900, null, 0, 76900),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('payg', 'CH', 0, 0, 99, 0),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('pro', 'CH', 2700, 370000, 99, 2700),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('unlimited', 'CH', 6500, null, 0, 6500);   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)

commit;

-- Check: select country_code, enabled, currency, locale, address_format, allergen_card_only_allowed from public.country_settings
--   where updated_by = 'europe-settings draft' order by country_code;
--        select country_code, count(*) from public.plan_prices where country_code in ('AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'DE', 'GI', 'GR', 'HU', 'IT', 'LV', 'LI', 'LT', 'LU', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'CH') group by 1 order by 1;
```

### 9.3 NOT RUN — only if you change a non-euro price (one statement per plan; run after you pick)

```sql
-- Example: Gibraltar at £25 / £59 instead of £29 / £69 (Pro including £3,400). Replace the numbers with your choice.
begin;
update public.plan_prices set monthly_minor = 2500, extra_van_monthly_minor = 2500, included_online_minor = 340000 where country_code = 'GI' and plan_key = 'pro';
update public.plan_prices set monthly_minor = 5900, extra_van_monthly_minor = 5900 where country_code = 'GI' and plan_key = 'unlimited';
commit;
```

If you approve the §8 prices as they are, nothing needs to run.

## 10 · Code

| File | Change |
|---|---|
| `lib/address-formats.ts` | `EuropeKey`; 8 new postal normalisers; `EUROPE_ROWS` (29, each with its VAT as `includedTax`), `europeAi`, `europeFormat`, the Italian provinces; Latvia's `comma` |
| `lib/marketing-country.ts` | `COUNTRY_PATH_SEGMENTS`: AT 'at' … CH 'ch' (no route collisions) |
| `lib/i18n/locales.ts` | `LOCALES` + en-MT, en-GI; `LOCALE_PARENT` en-MT and en-GI → en-IE |
| `messages/en-MT.json`, `messages/en-GI.json` | `{}`; "Pence per order". Then `split-messages` (catalogue, namespaces, `locale-files.ts`) |
| `lib/currencies.ts`, `lib/money-format.ts` | `narrowIn` (GBP en-GI, RON ro-RO), applied in the one Intl options builder |
| `app/trucks/[slug]/order/page.tsx` | the tip box's currency symbol from `currencySymbol` (same formatter; same output for every live locale) |
| `content/legal/country-specific-terms.md` | "European Economic Area and Switzerland" and "Gibraltar" sections (§11) |
| `docs/i18n/add-a-country.md` | "Europe: the country is already there, so a prompt is just the language" |
| `supabase/migrations/20261035_…`, `20261036_…` | blocks A and B |
| `scripts/europe-settings.cjs`, `scripts/_europe-settings-fixtures.cjs`, `scripts/fixtures/country-settings-checks-2026-10-22.json` | the harness, its fixtures (parses the SQL), the live CHECKs |

No hero screenshots (as the brief says).

## 11 · Terms

`content/legal/country-specific-terms.md` has one **"European Economic Area and Switzerland"** section, applied directly.
- **It names the 28 countries it covers.**
- **For food truck operators:**
  - the truck as seller under its country's consumer law;
  - card payments in local currency into the truck's own account, card-brand choice for co-badged cards, no surcharge;
  - no service fee;
  - the EU 14 allergens (Regulation (EU) No 1169/2011; Switzerland's Ordinance on Food Information);
  - VAT included and shown on receipts;
  - language;
  - our prices in local currency, with the reverse charge;
  - local-law rights;
  - GDPR / Swiss FADP processor terms;
  - notices; governing law (England and Wales, without removing mandatory protections).
- **Privacy:**
  - GDPR, FADP and UK law;
  - UK adequacy, both the Commission's and Switzerland's;
  - allergy notes;
  - requests;
  - complaints: the EDPB members list linked, and **a table of all 28 regulators** (Switzerland's FDPIC, edoeb.admin.ch;
    Germany "the authority of your Land, federal bfdi.bund.de");
  - marketing; contact.
- **Malta:** the Language paragraph says pages are in English, one of Malta's official languages.

Gibraltar is not in the EEA, so it has **its own "Gibraltar" section**, the same shape:
- pounds sterling;
- no VAT, so no tax line unless the truck sets one;
- the 14 allergens;
- a note that UK cards may be billed at a different card fee;
- English pages;
- data protection law including the GDPR as it applies in Gibraltar (reinstated 15 July 2026);
- complaints to the Gibraltar Regulatory Authority (www.gra.gi);
- England and Wales law.

`TERMS_VERSION` and the page date stay **22 October 2026**: the same day as France's amendment, so already current.

**Open questions for a lawyer:**
1. **The regulators' domains** are as the EDPB members page lists them (read by a fetch tool, not visited one by one).
   Germany's private-sector supervision is by Land. Check each link before switching a country on.
2. **One section for 28 countries** names each country's consumer law only generically. Some countries add duties the
   section does not name:
   - mandatory mediator details (as France has);
   - Greek-language allergen information;
   - Denmark's online allergen notice.
   Decide country by country before switching each on.
3. **Gibraltar's allergen rules** are assumed to be the retained EU rules (no Gibraltar instrument found).
4. **The reverse-charge wording** assumes trucks are VAT-registered businesses. Small businesses below the threshold
   would be charged VAT by us, and HatchGrab is not registered for it. Same as France.

## 12 · Read-only SQL run in this workstream

The first query was run earlier in the workstream; the other five were run at 19:39 UTC.

```sql
select plan_key, country_code, monthly_minor, included_online_minor, fee_bps, extra_van_monthly_minor from plan_prices where country_code in ('GB','FR') order by country_code, plan_key;
```
```sql
select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid) as def from pg_constraint where contype = 'c' and conrelid in ('country_settings'::regclass, 'plan_prices'::regclass) order by 1, 2;
```
```sql
select country_code, enabled, updated_by, address_format from country_settings where country_code not in ('GB','US','IE','AU','NZ','CA') order by 1;
```
```sql
select country_code, count(*) as plans from plan_prices where country_code not in ('GB','US','IE','AU','NZ','CA') group by 1 order by 1;
```
```sql
select json_agg(t order by country_code) as rows from (select * from country_settings where country_code not in ('GB','US','IE','AU','NZ','CA')) t;
```
```sql
select json_agg(json_build_array(country_code, plan_key, monthly_minor, included_online_minor, fee_bps, extra_van_monthly_minor) order by country_code, plan_key) as prices from plan_prices where country_code not in ('GB','US','IE','AU','NZ','CA');
```
```sql
select country_code, md5(row_to_json(t)::text) as h from (select <the 51 columns block B inserts> from country_settings where country_code not in ('GB','US','IE','AU','NZ','CA')) t order by 1;
```
```sql
select row_to_json(t)::text as j from (select <AT's columns, in two halves> from country_settings where country_code = 'AT') t;
```

The CHECK definitions the harness evaluates (`scripts/fixtures/country-settings-checks-2026-10-22.json`) were first read
by france-1's same query at 16:21 UTC (which also listed `trucks`). They were refreshed from the 19:39 read.

## 13 · Proof

**`node scripts/europe-settings.cjs`: 67 passed, 0 failed.** Localhost only: the rows and prices are parsed from the SQL
file itself.
1. **The rows:**
   - 29 rows; every row and price passes all 25 live CHECKs, each read in full;
   - negative controls fail (a bad format, BGN, a time zone outside the list, a Friday week, a 120 % tip, an unknown
     allergen set);
   - every row loads through `mapCountryRow`, and every value is as decided;
   - every time zone is real; every phone example passes the app's own check, and its first three characters do not;
   - card fees; segments.
2. **Formats:**
   - the validator is clean, and the key order matches the CHECK;
   - each example passes its own pattern and normalises to itself;
   - the normalisers; Liechtenstein's range; the code's position; Latvia's comma; Italy's province;
   - `includedTax` per country (none for Gibraltar), with GB and IE unchanged;
   - the AI rules.
3. **Charges:**
   - each country inclusive at its rate, nothing added, no surcharge, service fee or tip;
   - "MwSt." on the receipt line; a truck's own rate wins; Gibraltar has no line.
4. **Switched on (fixture), one country per currency:**
   - landing pages: DE 29 € / 69 € · CH CHF 27 / 65 · CZ 699 Kč / 1 690 Kč · DK 219 kr. / 519 kr. · HU 10 990 Ft / 24 990 Ft ·
     NO 299 kr / 729 kr · PL 129 zł / 299 zł · RO 149 lei / 369 lei · SE 329 kr / 769 kr · GI £29 / £69;
   - the currency line exactly where the symbol is shared: "Prices in Danish kroner (DKK)", "Prices in Norwegian kroner
     (NOK)", "Prices in Swedish kronor (SEK)", once each, before the first price, and nowhere else;
   - JSON-LD in the ISO code; no "GB£", "EUR 29" or "RON";
   - the Swiss plans PDF; de-DE hreflang when on.
5. **Switched off (the SQL as written):**
   - all 29 /<code> → /uk, and /ch/compare → /uk/compare;
   - /uk's hreflang is the live six plus x-default;
   - in no sitemap or /llms.txt.
6. **Malta and Gibraltar:**
   - en-MT and en-GI over en-IE; "Cents per order" in Malta, "Pence per order" in Gibraltar;
   - "£8.50" and "£" in en-GI, where Intl alone writes "GB£8.50";
   - "8,50 lei" in ro-RO; en-GB and en-MT exactly as Intl writes them.
7. **The SQL:**
   - block A's list equals the format keys, and it changes nothing else;
   - block B is wrapped in begin/commit, rows before prices, all off;
   - 87 prices; the euro ones at €29 / €69 / €4,000; all 30 non-euro lines marked "AWAITING DOMINIC'S APPROVAL" and no
     euro line marked.
8. **The terms:**
   - the section, its 28 countries and its points;
   - 28 regulator rows, rendered as a table;
   - Gibraltar's section;
   - the version and date unchanged.

**Every live country byte-identical**, using the language phases' captures plus the extras, before and after this
change:
- **Captured views:** 8,890; 8,890 identical, 0 different.
- **Messages, six locales (en-GB, en-US, en-IE, en-AU, en-NZ, en-CA):** 5,042 keys each; 0 changed, removed or added.
- **The grid:** 475 answers × 6 locales; 0 differ.
- **Marketing pages:** landing, /features and /compare for GB/US/IE/AU/NZ/CA, the six PDFs, /llms.txt, both hosts'
  sitemaps, contact and legal are identical. The one exception is `/country-terms`, a **pure insertion**: 37,461 bytes of
  shared prefix and 189 of shared suffix, nothing removed, and the two new sections inserted.

**Checks:**
- **`npx tsc --noEmit`:** clean.
- **`npx eslint .`:** 2,445 errors and 378 warnings, exactly the baseline. The 3 warnings the new files first added
  were fixed.
- **`npm run build`:** passes, with no warning or error lines.
- **`node scripts/run-harnesses.cjs`:** **164 run · 164 passed · 0 failed.** The first run had one failure: address-formats-1, which pins the format list; it was re-pinned, below.

**Re-pins** (each for this approved change only, and each marked "⚠️ RE-PINNED (europe-settings)" in the file):
- **`scripts/languages-1.cjs`:** the pinned `LOCALES` line now includes en-MT and en-GI.
- **`scripts/_address-formats-1-after.cjs`** (run by address-formats-1): the format list has 36 keys (France's seven,
  then the 29), and the postal-label list adds 'postalCode' for the 29, except 'postcode' for Gibraltar and Malta.
- **`scripts/_native-prices-fixtures.cjs`:** Sweden now has its real address (/se), so the harness's segment patch
  is gone (its line no longer exists to patch).
- **`scripts/us-legal-draft.cjs` and `scripts/canada-2.cjs`:** the terms headings now end with "European Economic Area
  and Switzerland" and "Gibraltar".
- **`scripts/france-1.cjs` and `scripts/canada-1.cjs`:** the `COUNTRY_PATH_SEGMENTS` regex now allows the entries
  after FR and CA.
- **`scripts/currency-registry.cjs`:** a Romanian truck's own form is now "29 lei" (`narrowIn`), not "29 RON".
  `homeDisplay` is still RON's alone.

## 14 · Open questions and next steps

1. **The §0 state.** Blocks A and B were applied before deploy and before price approval. Approve the §8 prices or pick
   others (§9.3).
2. **Deploy this branch** to stop the "left out of every country list" log lines and show the 29 in Admin › Countries.
   They stay switched off either way.
3. **Before switching any country on:**
   - its language (§7; not needed for MT and GI);
   - the processor's Connect confirmed for that country;
   - its regulator links and country-specific duties checked (§11);
   - an end-to-end test with a hidden test truck.
   Greece also needs a decision on in-person payments (§2).
4. **Facts to verify:**
   - Latvia's allergen rule, Poland's 5 % vs 8 % takeaway rate and Slovakia's 19 % (secondary sources);
   - Hungary's Tap to Pay fee;
   - Gibraltar's UK-card fee and legal tender;
   - tipping in Spain and Sweden.
5. **Belgium, Switzerland and Luxembourg's second languages** need the per-truck language decision (europe-readiness §B.4).

## Undo (only if Dominic asks)

Only if you want the 29 countries out of the database again. Prices go before rows (foreign key). The CHECK goes back to
France's state (gb … ca, fr); drop `'fr'` too to return to the list as it was at 16:21 UTC.

```sql
begin;
delete from public.plan_prices where country_code in ('AT','BE','BG','HR','CY','CZ','DK','EE','FI','DE','GI','GR','HU','IT','LV','LI','LT','LU','MT','NL','NO','PL','PT','RO','SK','SI','ES','SE','CH');
delete from public.country_settings where updated_by = 'europe-settings draft' and enabled = false
  and country_code in ('AT','BE','BG','HR','CY','CZ','DK','EE','FI','DE','GI','GR','HU','IT','LV','LI','LT','LU','MT','NL','NO','PL','PT','RO','SK','SI','ES','SE','CH');
alter table public.country_settings drop constraint country_settings_address_format_chk;
alter table public.country_settings add constraint country_settings_address_format_chk
  check (address_format in ('gb', 'us', 'ie', 'au', 'nz', 'ca', 'fr'));
commit;
```

**Code:** revert the files in §10 (`git checkout -- <file>` for the modified ones; delete the new ones). Then re-run
`node scripts/split-messages.cjs`.
