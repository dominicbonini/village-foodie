# europe-languages-2 — report

**23 October 2026.** Branch: main. I committed, pushed and deployed nothing; your two commits during the day (11:22 "european
launching", 13:01 "more euro countries") picked up work in progress. **No database change was made**: two read-only queries
were run (§12). Every country stays **switched off** in the database; they are switched on in fixtures only.

## Summary

- **Thirteen languages are built, completing 14 countries as their primary language.** Every new locale passes
  translation-check with **0 structural problems**, CLDR plural categories included:
  - pl-PL (Poland), cs-CZ (Czechia), sk-SK (Slovakia), hu-HU (Hungary), ro-RO (Romania), hr-HR (Croatia), sl-SI (Slovenia);
  - fi-FI (Finland), et-EE (Estonia), lv-LV (Latvia), lt-LT (Lithuania);
  - Greek: el-GR, with el-CY over it (Greece, Cyprus);
  - bg-BG (Bulgaria).
- **The lean checks all pass:**
  - `scripts/europe-languages-1.cjs` (now covering all 21 languages): **406 / 406**. With the countries switched on in
    fixtures:
    - each landing page is in its language with no en-GB sentence left, and shows native prices from the rows;
    - hreflang is reciprocal: /uk and all 26 European pages list the same 33 alternates (the live six, x-default and 26),
      and the sitemap lists every page;
    - the order buttons use each statute's words, the EU 14 allergens show in each language, and the plan names match;
    - each WhatsApp guard catches its safety questions and lets plain questions through.
  - The order page in each language (`languages-1-e2e --areas 1a`) shows only the residue already explained in the last
    report: fixture dish names, injected test notices, English API bodies.
- **Greek and Cyrillic** (`scripts/europe-languages-2-fonts.cjs`, after a build): **16 / 16**.
  - Noto Sans loads its Greek file on /gr and /cy and its Cyrillic file on /bg. On the English page it is never requested,
    and the font stacks never name it.
  - URLs stay Latin: /gr, /cy, /bg.
  - The WebKit 390 screenshots are in `docs/europe-languages-2/`.
  - **One real bug, found and fixed:** the first version put Noto after "Archivo Fallback". That fallback is a
    size-adjusted local Arial, which has Greek, so Noto never loaded. It now comes before the fallback.
- **Stage 0 is done (§2):**
  - de-DE/AT: the card button is now „Zahlungspflichtig bestellen" with no amount.
  - fr: « Commander avec obligation de paiement ».
  - Phone placeholders are localised in de, sv and nb. **The French one is held for you (§13 Q1).**
  - sv: "abonnemang"; da: "oversigt".
  - The flaky add-order harness is now deterministic.
- **Byte-identity:**
  - Every live country (GB, US, IE, AU, NZ, CA), and MT and GI, is identical: **19,894 / 19,894** captured values, **39 / 39**
    marketing pages, PDFs, sitemaps and /llms.txt. Every en-* message file has 0 changed keys.
  - **fr-FR changes in exactly 2 keys:** `order.placeOrder`, and `order.busyNotice`, which quotes the button.
  - The 12 europe-languages-1 locales change only by the Stage 0 decisions plus the plural-category fixes (§2).
- **Checks:**
  - tsc is clean, and the build passes.
  - Lint is identical to the baseline (2,445 errors / 378 warnings).
  - The sweep: **164 of 165 pass**. The one failure, `schedule-graphics-places.cjs`, comes from another session's new
    `lib/pricing-check.ts`, which names a plan-gate key; it is not this run's (§11).
- **For you:**
  - one NOT RUN SQL: the 14 short names (§9);
  - the non-euro prices: PLN, CZK, HUF, RON (§8);
  - a few legal and product questions (§13);
  - switching on is §10.

---

## 1 · Languages and countries

| Language | Locales | Countries completed (primary language) | Status | Decision needed from you |
|---|---|---|---|---|
| Polish | pl-PL | Poland | **done** | PLN prices (§8) |
| Czech | cs-CZ | Czechia | **done** | CZK prices (§8) |
| Slovak | sk-SK | Slovakia | **done** | — |
| Hungarian | hu-HU | Hungary | **done** | HUF prices (§8) |
| Romanian | ro-RO | Romania | **done** | RON prices (§8); the shortened button phrase (§13 Q3) |
| Croatian | hr-HR | Croatia | **done** | — |
| Slovenian | sl-SI | Slovenia | **done** | — |
| Finnish | fi-FI | Finland | **done** | The button wording; Finland has no fixed phrase (§13 Q3) |
| Estonian | et-EE | Estonia | **done** | — |
| Latvian | lv-LV | Latvia | **done** | The button comes from the Directive's own text; the national rule wasn't fetchable (§13 Q3) |
| Lithuanian | lt-LT | Lithuania | **done** | The same as Latvian (§13 Q3) |
| Greek | el-GR (base); el-CY (over el-GR, its phone example only) | Greece, Cyprus | **done** | — |
| Bulgarian | bg-BG | Bulgaria (EUR ✓) | **done** | — |

**Voice:**
- informal "ty" for Polish;
- "sinä" for Finnish and "sina" for Estonian, which is how their consumer apps speak;
- the formal plural for every other language. Bulgarian capitalises Вие/Ви.

**Second languages, in the backlog:**
- Finland: Swedish (sv-FI);
- Estonia and Latvia: Russian;
- Slovakia and Romania: Hungarian;
- Cyprus: Turkish and English;
- Luxembourg: French (fr-LU, not built) and German;
- Belgium and Switzerland: as in the last report.

## 2 · Stage 0 — fixes from europe-languages-1

1. **The German card button.**
   - de-DE (and de-AT, which reads it) now say „Zahlungspflichtig bestellen" and „Erneut zahlungspflichtig bestellen", with
     no amount. This follows BGB § 312j Abs. 3 and FAGG § 8: "nothing other than" the words.
   - de-CH and de-LI keep „Zahlungspflichtig bestellen · {amount}"; Switzerland has no button rule.
   - translation-check now accepts exactly this dropped placeholder. It is listed with its reason in
     `docs/i18n/placeholder-drops.json`, and nothing else may drop one.
2. **France:**
   - `order.placeOrder` is « Commander avec obligation de paiement ».
   - `order.busyNotice` quotes the button, so it changed too.
   - Those are France's only 2 changed keys. `scripts/france-1.cjs` is re-pinned to them and passes 74 / 74.
3. **Phone placeholders:**
   - de-DE "+49 1512 3456789", de-AT "+43 664 123456", de-CH "+41 78 123 45 67", de-LI "+423 660 234 567";
   - sv-SE "+46 70 123 45 67";
   - nb-NO "+47 40 61 23 45";
   - every new language has its own.
   - **French is held:** Stage 0 says localise it, while the final stage says France changes only in `placeOrder`. Those
     conflict, so I asked rather than chose (§13 Q1).
   - "six years, as UK law requires", "registered in England and Wales" and the DELETE word are kept everywhere, as asked.
4. **Swedish:**
   - "abonnemang" is the one word for a plan, in 7 strings.
   - It is the word Swedish subscription services use; "plan" read as English.
5. **Danish:**
   - "dashboard" → "oversigt" in 28 strings.
   - It is the word the Danish files already used for the overview screen.
6. **Voice:** unchanged. German is "Sie", and de-CH keeps „…".
7. **The flaky `add-order-refresh-inputs.cjs`:**
   - **Diagnosis:**
     - The panel's 10 s max-age backstop (SLOT_SNAPSHOT_MAX_AGE_MS, counted from mount) is correct app behaviour.
     - But it counted the real seconds a compile-and-first-render takes. On a loaded machine it fired inside a broken
       variant's short scenario and "rescued" it, so a mutation control passed: "PASSED — THE HARNESS PROVES NOTHING".
     - **It is not the time of day:** a fake 08:18 clock passes.
     - 24 busy loops did not reproduce it either. So the exact trigger that morning (07:40–08:20) is unconfirmed.
   - **Fix (harness only):** `Date.now()` now moves only while the script's own `sleep()` waits. A scenario lasts exactly its
     scripted sleeps whatever the load. The timers and waits stay real, so the throttle, the trailing read and the backstop
     are all still exercised.
   - **App:** no bug. It passes.
8. **Also from this stage: plurals are now enforced.**
   - translation-check fails a plural missing a CLDR category its locale uses.
   - This found 19 missing categories in 8 built languages. Three were real grammar bugs, now fixed:
     - Spanish « · # oculta »;
     - Italian "{changedCount} su {total} modificato";
     - Swedish « · # dold ».
   - The rest were `one` copies, added.

## 3 · The order button (consumer law, per country)

| Country | Statute | Statutory words | `order.placeOrder` | `order.payAmount` (card) |
|---|---|---|---|---|
| PL | Ustawa o prawach konsumenta art. 17 ust. 3 | „zamówienie z obowiązkiem zapłaty" | Zamówienie z obowiązkiem zapłaty | Zapłać {amount} |
| CZ | NOZ § 1826a odst. 2 | „Objednávka zavazující k platbě" | Objednávka zavazující k platbě | Zaplatit {amount} |
| SK | zákon 108/2024 Z. z. § 17 ods. 4 | „objednávka s povinnosťou platby" | Objednávka s povinnosťou platby | Zaplatiť {amount} |
| HU | 45/2014. Korm. r. 15. § (2) | „fizetési kötelezettséggel járó megrendelés" | Fizetési kötelezettséggel járó megrendelés | Fizetés: {amount} |
| RO | OUG 34/2014 art. 8 alin. (2) | „comandă ce implică o obligație de plată" | Comandă cu obligație de plată (§13 Q3) | Plătiți {amount} |
| HR | ZZP čl. 74 st. 3 | »narudžba s obvezom plaćanja« | Narudžba s obvezom plaćanja | Platite {amount} |
| SI | ZVPot-1 132. člen (3) | »naročilo z obveznostjo plačila« | Naročilo z obveznostjo plačila | Plačajte {amount} |
| FI | kuluttajansuojalaki 6 luku (no fixed phrase; express acceptance) | — | Tilaa ja sitoudu maksamaan | Maksa {amount} |
| EE | VÕS § 62² lg 3 | „tellimus koos maksekohustusega" | Tellimus koos maksekohustusega | Maksa {amount} |
| LV | the Directive's Latvian text (national rule not fetched) | "pasūtījums ar pienākumu maksāt" | Pasūtījums ar pienākumu maksāt | Maksāt {amount} |
| LT | the Directive's Lithuanian text (Civil Code article not fetched) | „užsakymas su mokėjimo pareiga" | Užsakymas su mokėjimo pareiga | Mokėti {amount} |
| GR, CY | Ν. 2251/1994 άρθ. 3δ (GR); Ν. 133(I)/2013 άρθ. 7(2) (CY) | «παραγγελία με υποχρέωση πληρωμής» | Παραγγελία με υποχρέωση πληρωμής | Πληρωμή {amount} |
| BG | ЗЗП чл. 48, ал. 2 | „поръчка със задължение за плащане" | Поръчка със задължение за плащане | Плащане {amount} |

**The card buttons:**
- They name the amount, as Spain's and Italy's do. Paying with the amount on the button is an unambiguous formulation
  (CJEU C-249/21 Fuhrmann-2; Commission 2014 guidance: "pay now" is acceptable).
- Hungarian puts the amount after a colon so it never takes a suffix.
- `order.tryAgainAmount` is the same phrase with "again".
- Every sentence that quotes a button quotes it exactly (`order.busyNotice` and the "Pay at the truck" errors).

## 4 · Glossary

**`docs/i18n/seo-glossary-eu.md`:**
- 13 new tables, splitting private hire from private event;
- the recommendation rows below;
- `lib/i18n/glossary/<lang>.json` rebuilt for 22 languages (`glossary-build --check` ✓).

| Lang | Pay at Hatch (feature / short) | payg / unlimited | Trial CTA |
|---|---|---|---|
| PL | Płatność przy odbiorze / Zapłać przy odbiorze | Bez abonamentu / Bez limitu | Wypróbuj za darmo |
| CS | Platba při vyzvednutí / Zaplatit při vyzvednutí | Bez měsíčního poplatku / Neomezený | Vyzkoušejte zdarma |
| SK | Platba pri vyzdvihnutí / Zaplatiť pri vyzdvihnutí | Bez mesačného poplatku / Neobmedzený | Vyskúšajte zadarmo |
| HU | Fizetés átvételkor | Havidíj nélkül / Korlátlan | Próbálja ki ingyen |
| RO | Plata la ridicare / Plătiți la ridicare | Fără abonament / Nelimitat | Încercați gratuit |
| HR | Plaćanje pri preuzimanju / Platite pri preuzimanju | Bez mjesečne pretplate / Neograničeno | Isprobajte besplatno |
| SL | Plačilo ob prevzemu / Plačajte ob prevzemu | Brez mesečne naročnine / Neomejeno | Preizkusite brezplačno |
| FI | Maksu noudettaessa / Maksa noudettaessa | Ilman kuukausimaksua / Rajaton | Kokeile ilmaiseksi |
| ET | Tasumine kättesaamisel / Maksa kättesaamisel | Kuutasuta / Piiramatu | Proovi tasuta |
| LV | Apmaksa saņemot / Maksājiet saņemot | Bez ikmēneša maksas / Neierobežots | Izmēģiniet bez maksas |
| LT | Mokėjimas atsiimant / Mokėkite atsiimdami | Be mėnesinio mokesčio / Neribotas | Išbandykite nemokamai |
| EL | Πληρωμή κατά την παραλαβή / Πληρώστε στην παραλαβή | Χωρίς μηνιαία συνδρομή / Απεριόριστο | Δοκιμάστε δωρεάν |
| BG | Плащане при вземане / Платете при вземане | Без месечна такса / Неограничен | Опитайте безплатно |

**"food truck":**
- It stays in Latin script in Greek, the usual Greek word.
- Bulgarian writes it "фуд трък" (count form "2 фуд тръка").
- Latvian and Lithuanian keep "food truck" for the business and use "busiņš" / "furgonas" for the vehicle.

## 5 · The languages

**How they were built:**
- Each language was translated in ten parts, against one brief: `STYLE-common.md` plus a per-language `STYLE.md` holding
  the voice, money, glossary Use terms, button words, EU 14 names and sample places.
- **New this run, a shared `TERMS.md` per language:**
  - Parallel parts had chosen three or four words for the same tab (Czech "Schedule" was Rozpis, Plán akcí, Kalendář akcí
    and Rozvrh).
  - Each part now reads the term sheet first and appends a line the moment it picks a word.
  - **One consistency agent per merged language** then unified the rest: tab and button names; quotes that must equal the
    real button key; "Powered by" = the poster's own words.
  - It changed 31 strings (Croatian) up to 199 (Bulgarian, mostly turning imperative buttons into the verbal-noun form
    Bulgarian UIs use).
- **The EU 14 (Annex II, Regulation 1169/2011)**, in the order Gluten, Crustaceans, Eggs, Fish, Peanuts, Soya, Milk, Tree
  nuts, Celery, Mustard, Sesame, Sulphites, Lupin, Molluscs:
  - PL: Gluten, Skorupiaki, Jaja, Ryby, Orzeszki ziemne, Soja, Mleko, Orzechy, Seler, Gorczyca, Sezam, Siarczyny, Łubin,
    Mięczaki;
  - CS: Lepek, Korýši, Vejce, Ryby, Arašídy, Sója, Mléko, Skořápkové plody, Celer, Hořčice, Sezam, Siřičitany, Vlčí bob,
    Měkkýši;
  - SK: Glutén, Kôrovce, Vajcia, Ryby, Arašidy, Sója, Mlieko, Orechy, Zeler, Horčica, Sezam, Siričitany, Vlčí bôb, Mäkkýše;
  - HU: Glutén, Rákfélék, Tojás, Hal, Földimogyoró, Szója, Tej, Diófélék, Zeller, Mustár, Szezámmag, Szulfitok,
    Csillagfürt, Puhatestűek;
  - RO: Gluten, Crustacee, Ouă, Pește, Arahide, Soia, Lapte, Fructe cu coajă lemnoasă, Țelină, Muștar, Susan, Sulfiți,
    Lupin, Moluște;
  - HR: Gluten, Rakovi, Jaja, Riba, Kikiriki, Soja, Mlijeko, Orašasto voće, Celer, Gorušica, Sezam, Sulfiti, Lupina,
    Mekušci;
  - SL: Gluten, Raki, Jajca, Ribe, Arašidi, Soja, Mleko, Oreški, Listna zelena, Gorčično seme, Sezam, Sulfiti, Volčji bob,
    Mehkužci;
  - FI: Gluteeni, Äyriäiset, Muna, Kala, Maapähkinä, Soija, Maito, Pähkinät, Selleri, Sinappi, Seesami, Sulfiitit, Lupiini,
    Nilviäiset;
  - ET: Gluteen, Koorikloomad, Munad, Kala, Maapähklid, Soja, Piim, Pähklid, Seller, Sinep, Seesam, Sulfitid, Lupiin,
    Molluskid;
  - LV: Lipeklis, Vēžveidīgie, Olas, Zivis, Zemesrieksti, Soja, Piens, Rieksti, Selerijas, Sinepes, Sezams, Sulfīti,
    Lupīna, Gliemji;
  - LT: Glitimas, Vėžiagyviai, Kiaušiniai, Žuvys, Žemės riešutai, Sojos, Pienas, Riešutai, Salierai, Garstyčios,
    Sezamas, Sulfitai, Lubinai, Moliuskai;
  - EL: Γλουτένη, Καρκινοειδή, Αυγά, Ψάρια, Αραχίδες, Σόγια, Γάλα, Καρποί με κέλυφος, Σέλινο, Σινάπι, Σησάμι, Θειώδη,
    Λούπινο, Μαλάκια;
  - BG: Глутен, Ракообразни, Яйца, Риба, Фъстъци, Соя, Мляко, Ядки, Целина, Синап, Сусам, Сулфити, Лупина, Мекотели.
- **Guard words (Option B):**
  - The stems are written accent-folded; the Unicode normaliser folds the customer's text the same way.
  - Count per language: pl 41, cs 34, sk 34, hu 35, ro 31, hr 34, sl 31, fi 32, et 31, lv 30, lt 36, el 33, bg 34.
  - **Proved:**
    - 10 safety questions per language reach the allergen reply;
    - 5 plain questions per language do not;
    - a tagged Dairy dish triggers each language's caveat.
  - **Four gaps found by those questions, fixed with inflection-safe stems:**
    - Polish "zanieczyszczenia krzyżowego";
    - Estonian "laktoosivabu";
    - Latvian "nepanesība", "piesārņošanas";
    - Lithuanian "be glitimo", "Netoleruoju", "užteršimo".
- **`{country}`** only ever sits after a colon, a dash or in brackets, never where a case ending is needed. No placeholder is
  inflected anywhere: apposition or a colon instead ("food truck {truck}", "Removed: {name}").
- **Percent spacing follows Intl** for each locale, which is what the app itself prints:
  - "20%": pl, hu, et, lv, el, bg;
  - "20 %" with a non-breaking space: cs, sk, ro, hr, sl, fi, lt.
- **Admin-only English labels:** "Insert opt-out", "Templates" and "Signature" are hard-coded in `components/admin/*`, so
  every new language quotes them in English.

## 6 · Numbers, currency and the rows

| Country | Locale | Money (the app's formatter) | Decimal input |
|---|---|---|---|
| PL | pl-PL | 129 zł · 27,50 zł | comma |
| CZ | cs-CZ | 699 Kč · 27,50 Kč | comma |
| HU | hu-HU | 10 990 Ft · 12,00 Ft | comma |
| RO | ro-RO | 149 lei · 12,00 lei (the registry's "lei", not Intl's "RON") | comma |
| SK, HR, SI, FI, EE, LV, LT, GR, CY, BG | own | 29 € · 27,50 € | comma |

- Every row has its language's locale, its currency and its phone example. **BG is EUR ✓.**
- HUF shows two decimals in amounts, as Stripe charges it (the registry's rule from native-prices). A whole-forint display
  for menu prices is a product question for later, not changed here.

## 7 · Proof

**`node scripts/europe-languages-1.cjs`: 406 passed, 0 failed.**
- §1, per locale: 0 structural; the order button; the demo stepper no longer than English; the plan names; the EU 14
  labels; no "hatch".
- §2, every country switched on: the language on its landing page; no en-GB sentence left; the native prices; og:locale,
  canonical, JSON-LD currency and inLanguage; the short name in the title. Then hreflang reciprocal, the sitemap, and every
  page redirecting to /uk when switched off.
- §3, the WhatsApp guard: all four checks per language.
- §4, decimals: comma or point from Intl.
- §5, both short-name SQL files are well-formed.

**`node scripts/europe-languages-2-fonts.cjs` (needs a build): 16 passed, 0 failed.**

**Order pages** (`languages-1-e2e --locale <l> --areas 1a --currency <ISO> --time 24h,dmy,monday`):
- Each locale has 213 views in its language.
- English left: the explained 11-word residue only: fixture dish names ("Dip", "Crispy"), injected test notices, the
  reject sentence captured without a locale, the stub AI reply and API bodies.
- Two extra words, both real in the language: Hungarian "most" ("now") and Romanian "maximum". They are in
  `docs/i18n/same-words/`.
- The Greek and Bulgarian order pages: WebKit 390 and 1280 with the real fonts (`--fonts`), no sideways scroll, no clipped
  text.
- The English "Pre-order by 16:30, Sat 10 Oct" chip in those shots is the e2e fixture's hard-coded string. The app words it
  in the truck's locale (`lib/preorder.ts` → «Προπαραγγελία έως τις …»).

**translation-check flags** (after the reviewed `docs/i18n/same-words/<lang>.json`):

| Locale | Structural | English* | Glossary | Numbers | Length | Drift |
|---|---|---|---|---|---|---|
| pl-PL | **0** | 96 | 0 | 1 | 174 | 924 |
| cs-CZ | **0** | 89 | 26 | 1 | 150 | 949 |
| sk-SK | **0** | 86 | 25 | 1 | 181 | 962 |
| hu-HU | **0** | 84 | 0 | 1 | 179 | 1,037 |
| ro-RO | **0** | 173 | 30 | 2 | 245 | 1,084 |
| hr-HR | **0** | 82 | 26 | 1 | 147 | 899 |
| sl-SI | **0** | 85 | 21 | 1 | 155 | 1,002 |
| fi-FI | **0** | 71 | 13 | 1 | 158 | 1,038 |
| et-EE | **0** | 76 | 21 | 1 | 95 | 888 |
| lv-LV | **0** | 70 | 4 | 1 | 230 | 859 |
| lt-LT | **0** | 75 | 1 | 1 | 269 | 889 |
| el-GR / el-CY | **0** | 75 | 34 | 2 | 360 | 864 |
| bg-BG | **0** | 62 | 26 | 1 | 235 | 993 |

\* **What the flags are:**
- **English:** what is left is English the product keeps on purpose: the registrar labels shown as those products show them,
  migration file paths, IDs, brand names, dish names, the DELETE word and the admin labels.
- **Glossary:** inflected or plural forms of a locked term ("časy vyzvednutí", "ώρες παραλαβής") that the matcher reads as
  misses.
- **Numbers:** the localised phone example.
- **Length:** longer languages.
- **Drift:** the back-translation wording, read per part by its translator.

## 8 · Prices (no new prices)

The rows' `plan_prices` are used unchanged (read-only check, §12).
- **Euro countries:** 29 / 69 €, and Pro includes 4,000 € of online orders.
- **Non-euro, still awaiting your approval from europe-settings §8:**

| Country | Pro / Unlimited per month | Pro includes (online orders) |
|---|---|---|
| PL | 129 / 299 zł | 17,500 zł |
| CZ | 699 / 1,690 Kč | 100,000 Kč |
| HU | 10,990 / 24,990 Ft | 1,500,000 Ft |
| RO | 149 / 369 lei | 21,500 lei |

The platform fee (`fee_bps` 99 on payg and Pro, 0 on Unlimited) is the same as every euro country's.

If you choose other prices, europe-settings §9.3 has the update.

## 9 · NOT RUN SQL — run AFTER the deploy, BEFORE switching a country on

`supabase/migrations/20261038_europe_language_short_names_2.sql`. It only touches rows that are still switched off:

```sql
begin;
update public.country_settings set short_name = 'Polska'       where country_code = 'PL' and enabled = false;
update public.country_settings set short_name = 'Česko'        where country_code = 'CZ' and enabled = false;
update public.country_settings set short_name = 'Slovensko'    where country_code = 'SK' and enabled = false;
update public.country_settings set short_name = 'Magyarország' where country_code = 'HU' and enabled = false;
update public.country_settings set short_name = 'România'      where country_code = 'RO' and enabled = false;
update public.country_settings set short_name = 'Hrvatska'     where country_code = 'HR' and enabled = false;
update public.country_settings set short_name = 'Slovenija'    where country_code = 'SI' and enabled = false;
update public.country_settings set short_name = 'Suomi'        where country_code = 'FI' and enabled = false;
update public.country_settings set short_name = 'Eesti'        where country_code = 'EE' and enabled = false;
update public.country_settings set short_name = 'Latvija'      where country_code = 'LV' and enabled = false;
update public.country_settings set short_name = 'Lietuva'      where country_code = 'LT' and enabled = false;
update public.country_settings set short_name = 'Ελλάδα'       where country_code = 'GR' and enabled = false;
update public.country_settings set short_name = 'Κύπρος'       where country_code = 'CY' and enabled = false;
update public.country_settings set short_name = 'България'     where country_code = 'BG' and enabled = false;
commit;
```

**Order:**
1. Deploy this branch.
2. Run `20261037` (europe-languages-1's 12 short names) if not yet run.
3. Run this, `20261038`.
4. Switch countries on (§10).

**Not in the SQL:**
- `name` (the English admin name) is unchanged.
- Luxembourg, Malta and Gibraltar already read correctly: "Luxembourg" is also the French name, and MT and GI are English.
  They are not in it.

## 10 · How to switch each completed country on

For **each** of PL, CZ, SK, HU, RO, HR, SI, FI, EE, LV, LT, GR, CY and BG:

1. **Deploy** this branch. Until then, the deployed code cannot read these locales.
2. **Run §9** once (all 14 short names).
3. **Prices:**
   - euro countries: nothing to do;
   - PL, CZ, HU and RO: approve the europe-settings §8 prices, or run its §9.3 update with yours.
4. **Stripe Connect check, in the Stripe dashboard:**
   - The country is enabled for connected accounts.
   - Create a test connected account and finish onboarding.
   - Make one test card payment in the currency (EUR, PLN, CZK, HUF, RON) with manual capture.
   - The card fee shown matches the row.
   - Local wallets are not built (europe-settings §7).
5. **Legal:** the "European Economic Area and Switzerland" terms section (europe-settings §11), plus §13 below.
6. **An end-to-end test with a hidden test truck** in the country: order, pay, collect, receipt email, WhatsApp question.
7. **Admin › Countries:** switch the country on. Its /<cc> page, hreflang, sitemap, menu entry and /llms.txt section appear at
   once.

**Every European country still off, and what each waits on:**

| Countries | Language | Waits on |
|---|---|---|
| PL, CZ, SK, HU, RO, HR, SI, FI, EE, LV, LT, GR, CY, BG | built (this run) | deploy; §9 SQL; PLN/CZK/HUF/RON price approval (PL, CZ, HU, RO); Connect check; legal; test truck; switch-on |
| DE, AT, CH, LI, ES, IT, PT, NL, BE, SE, DK, NO | built (europe-languages-1) | deploy; `20261037`; CHF/SEK/DKK/NOK price approval (CH, LI, SE, DK, NO); Connect check; legal; test truck; switch-on |
| FR | built (france-1) | france-1's own list (Connect, legal, test truck); now also §13 Q1 (the phone example) |
| MT, GI | English (en-MT, en-GI), ready | Connect check (GI: GBP); legal (Gibraltar's own terms section); test truck; switch-on |
| LU | **not built:** fr-LU, a sparse override of fr-FR | the fr-LU file (the French phone example, "+352"; Luxembourg's VAT wording); then as above |

Nothing outside the EU/EEA, Switzerland and Gibraltar has a row.

## 11 · Re-pins (only for approved changes) and tooling

| File | What changed | Why |
|---|---|---|
| `scripts/europe-languages-1.cjs` | The 13 languages added. de-DE/AT's button has no amount (per-locale `buttonBy`); de-AT's and de-LI's phone keys. Prices from the app's formatter (RON "lei", HUF decimals). Reads 20261037 and 20261038 | Stage 0.1, 0.3; the new languages |
| `scripts/languages-1.cjs` | The no-guard-list language is now tr-TR (Polish has a list) | the new languages |
| `scripts/_pseudo-locale.cjs` | The pseudo-language writes out every CLDR plural category eo-XA uses | the plural enforcement |
| `scripts/france-1.cjs` | The button test re-pinned to « Commander avec obligation de paiement » | Stage 0.2 |
| `scripts/_language-phase-0-after.cjs` | The unsupported-locale example is now tr-TR | the new languages |
| `scripts/_lp1e-fixtures.cjs`, `language-phase-0.cjs`, `us-polish-batch.cjs` | `Noto_Sans` added to their `next/font/google` stand-ins | the Greek/Cyrillic font in app/layout.tsx |
| `scripts/translation-check.cjs` | CLDR plural categories enforced (structural); `docs/i18n/placeholder-drops.json` read | Stage 0.1, plurals |
| `scripts/add-order-refresh-inputs.cjs` | Virtual clock | Stage 0.6 |
| `scripts/languages-1-e2e.cjs` | New `--fonts` (real built fonts in shots); default unchanged | el/bg screenshots |
| `scripts/glossary-build.cjs` | Reads the 13 new tables | glossary |
| `scripts/harnesses.json` | `_real-fonts.cjs` (a module); `europe-languages-2-fonts.cjs` with the by-hand, build-needing group | new files |

**The sweep** (`node scripts/run-harnesses.cjs`): **165 run · 164 passed · 1 failed**, after the re-pins above.

- **The first attempt was refused before running anything.** The screen refuses any harness containing the word "stripe".
  `europe-languages-1.cjs` had gained it in a comment; it is reworded.
- **`language-phase-0.cjs` failed:** its "unsupported locale" example was pl-PL. It is re-pinned to tr-TR
  (`_language-phase-0-after.cjs`) and passes 163 / 163.
- **The one failure, `schedule-graphics-places.cjs`, is not this run's.**
  - Its guard fails when a new file reads the `schedule_graphics` plan gate, so a human writes the new reader down.
  - The new reader is `lib/pricing-check.ts`: untracked, and part of another session's pricing-check work (the admin
    "Pricing check" tab), in the tree but not mine.
  - Whoever lands that work should add the file to the guard's EXPECTED list.

## 12 · Read-only SQL run

```sql
select country_code, name, short_name, enabled, locale, currency, phone_country_code, phone_example, updated_by from public.country_settings where country_code in ('PL','CZ','SK','HU','RO','HR','SI','FI','EE','LV','LT','GR','CY','BG','LU','MT','GI') order by country_code;
```
```sql
select country_code, plan_key, monthly_minor, included_online_minor, fee_bps from public.plan_prices where country_code in ('PL','CZ','SK','HU','RO','HR','SI','FI','EE','LV','LT','GR','CY','BG') order by country_code, plan_key;
```

**Results:**
- All 17 rows exist and are **switched off**. Each has the locale and currency the harness parses: BG is EUR; CY's locale is
  el-CY.
- The short names are English ("Poland", "the Czech Republic", …), which is why §9 is needed.
- The prices are exactly europe-settings' (§8).

## 13 · For you to decide (legal and product)

1. **The French phone example (held).**
   - Stage 0.3 says localise the +44 placeholder in fr. The final stage says France differs only in `order.placeOrder`.
   - I kept France at +44 and asked rather than chose.
   - Localising is one key (`manageTeam.phonePlaceholder` → "+33 6 12 34 56 78").
   - Say so and it is one line; France's byte-identity list would then be 3 keys.
2. **"Six years, as UK law requires" and "registered in England and Wales"** are kept in every new language, as asked.
   - Estonia's accounting law says 7 years; others vary.
   - Worth a legal look before these countries go live.
3. **Button phrases resting on a judgement:**
   - **RO:** the statute says „comandă ce implică o obligație de plată". The button uses the shorter „Comandă cu obligație de
     plată", the same obligation words, as Romanian shops write it. Use the full statutory phrase instead?
   - **FI:** no fixed phrase; the law requires express acceptance. „Tilaa ja sitoudu maksamaan" means "Order and commit to
     pay".
   - **LV and LT:** the phrases are the Directive's own Latvian and Lithuanian texts. likumi.lv timed out, and e-seimas and
     e-tar blocked automated access, so the national transpositions were not read. A local check before switch-on is worth
     it.
4. **Voice:**
   - informal "ty" for Polish, "sinä"/"sina" for Finnish/Estonian, formal everywhere else.
   - Confirm, or pick another per language.
5. **Labels a native speaker may want shorter:** "ASAP" in Estonian and Bulgarian ("Esimesel võimalusel", "Възможно
   най-скоро"), and the Greek and Lithuanian price words. They fit at 390px (no overflow, no clipping); they are just long.
6. **"Mark ready" quotes:**
   - Some languages' help texts named a button "Mark as ready". The real button only says "Ready" (`orderCard.ready`).
   - The consistency passes made the quotes match the real button ("Paruošta", "Έτοιμη", „Готова"…), as English does.
7. **The app's Canva and WhatsApp menu paths** are given in each language's labels where the translators knew them, and
   in English otherwise. A native check of those few strings helps before launch.

**Notes on this run:**
- Usage limits stopped running agents twice:
  - 20 at about 11:00;
  - 20 at about 16:30.
- Each was resumed from its own saved work; no part was redone. Every part was re-checked (0 structural) before merging.

## 14 · Sources (the order-button statutes)

- **PL:** lexlege.pl, art. 17 (official: isap.sejm.gov.pl, Dz.U. 2014 poz. 827).
- **CZ:** zakonyprolidi.cz, 89/2012 Sb. § 1826a.
- **SK:** slov-lex.sk, 108/2024 Z. z. (as first published).
- **HU:** net.jogtar.hu, 45/2014. Korm. r.
- **RO:** ANPC's copy of OUG 34/2014, checked against a second copy; ANPC returned 503.
- **HR:** zakon.hr, ZZP (NN 19/22, 59/23, 59/26).
- **SI:** racunovodstvo.net, ZVPot-1 132. člen.
- **FI:** finlex.fi, kuluttajansuojalaki 6 luku.
- **EE:** riigiteataja.ee, VÕS (text valid 01.09–31.12.2026).
- **LV:** not reached (likumi.lv timed out); the Directive's LV text.
- **LT:** not reached (e-seimas / e-tar blocked); the Directive's LT text.
- **GR:** taxheaven.gr, Ν. 5317/2026 άρθ. 83 rewriting Ν. 2251/1994 άρθ. 3δ.
- **CY:** cylaw.org, Ν. 133(I)/2013.
- **BG:** kik-info.com, ЗЗП (ДВ бр. 87/2026); lex.bg refused access.
- **EU:** CJEU C-249/21 Fuhrmann-2; the Commission's 2014 CRD guidance.
- **Annex II names:** the Cellar copy of CELEX 32011R1169, in each language.

## 15 · Files

**New:**
- `messages/{pl-PL,cs-CZ,sk-SK,hu-HU,ro-RO,hr-HR,sl-SI,fi-FI,et-EE,lv-LV,lt-LT,el-GR,el-CY,bg-BG}.json`;
- `docs/i18n/back/` (the same 14);
- `lib/allergen-guard/{pl,cs,sk,hu,ro,hr,sl,fi,et,lv,lt,el,bg}.json`;
- `lib/i18n/glossary/<the 13>.json`;
- `docs/i18n/same-words/<the 13>.json`;
- `docs/i18n/placeholder-drops.json`;
- the generated `messages/ns/<locale>/*` and catalog lines;
- `scripts/europe-languages-2-fonts.cjs`, `scripts/_real-fonts.cjs`;
- `supabase/migrations/20261038_europe_language_short_names_2.sql` (NOT RUN);
- `docs/europe-languages-2/`: landing at WebKit 390 for el-GR, el-CY and bg-BG; the el-GR and bg-BG order-page shots and
  findings;
- `docs/i18n/europe-languages-2-progress.md`.

**Changed:**
- `lib/i18n/locales.ts` (14 locales; el-CY over el-GR);
- `lib/allergen-guard.ts` (13 imports);
- `app/layout.tsx` (Noto Sans, greek + cyrillic, preload false, its class only on el/bg pages);
- `app/globals.css` and `app/landing/landing.css` (Noto in the stacks under :lang(el)/:lang(bg) only, before the metric
  fallback);
- `messages/{de-DE,de-AT,de-CH,de-LI,fr-FR,sv-SE,nb-NO,da-DK,es-ES,it-IT,pt-PT,nl-NL}.json` (§2);
- `docs/i18n/seo-glossary-eu.md`;
- `docs/i18n/add-a-country.md` (what the thirteen taught, under §7b);
- the scripts in §11.

**Not mine, left untouched:** `data/pricing-research-1/`, `scripts/pricing-check-build-data.cjs` and
`supabase/migrations/20261039_pricing_check.sql` (another session's pricing-check work).

## Undo (only if Dominic asks)

Nothing was run against the database. If §9 is run and needs undoing:

```sql
begin;
update public.country_settings set short_name = 'Poland' where country_code = 'PL' and enabled = false;
update public.country_settings set short_name = 'the Czech Republic' where country_code = 'CZ' and enabled = false;
update public.country_settings set short_name = 'Slovakia' where country_code = 'SK' and enabled = false;
update public.country_settings set short_name = 'Hungary' where country_code = 'HU' and enabled = false;
update public.country_settings set short_name = 'Romania' where country_code = 'RO' and enabled = false;
update public.country_settings set short_name = 'Croatia' where country_code = 'HR' and enabled = false;
update public.country_settings set short_name = 'Slovenia' where country_code = 'SI' and enabled = false;
update public.country_settings set short_name = 'Finland' where country_code = 'FI' and enabled = false;
update public.country_settings set short_name = 'Estonia' where country_code = 'EE' and enabled = false;
update public.country_settings set short_name = 'Latvia' where country_code = 'LV' and enabled = false;
update public.country_settings set short_name = 'Lithuania' where country_code = 'LT' and enabled = false;
update public.country_settings set short_name = 'Greece' where country_code = 'GR' and enabled = false;
update public.country_settings set short_name = 'Cyprus' where country_code = 'CY' and enabled = false;
update public.country_settings set short_name = 'Bulgaria' where country_code = 'BG' and enabled = false;
commit;
```
