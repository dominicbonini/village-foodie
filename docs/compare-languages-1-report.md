# compare-languages-1: the comparison page in every language

*8 November 2026. Nothing is deployed. No database write and no migration: the only database access was two read-only exports.*

## Summary

- **The page's strings in every language base:**
  - the comparison page's 262 strings (`comparison` namespace) are now translated into all 28 language bases;
  - each base has back-translations in `docs/i18n/back`;
  - overrides were written where a variant's copy differs: en-US, en-CA, es-MX, fr-LU, de-CH, de-LI.
- **Which countries get a page:** every country with an address except AE now has a comparison page address in its own language. AE has none.
- **"Which suits your food truck?"** was already in every language (compare-suits-1).
- **When a page goes public:** only when it is live, through Admin or through auto-publish (compare-autopublish-1).
  - Today that is GB and DE.
  - Other countries go live by themselves once at least 2 of their competitors pass the automatic checks after your push.
- **SEO:**
  - a live page's hreflang names every live comparison page;
  - the canonical is the page itself;
  - the sitemap lists live pages only, each with the same hreflang set;
  - the Markdown and JSON twins come in the page's language.
- **Proofs:**
  - translation check: **Structural 0** in all 28 languages;
  - admin previews for FR, ES, IT, JP, PL and BR: **0 English page strings**;
  - **278 of 280 other pages unchanged**. The sitemap differs only by the new hreflang links; /contact differs only by its per-request form token;
  - `compare-languages-1` passes 24/24, and the typecheck is clean;
  - full sweep: 198 of 202 passed; 3 failures re-pinned and passing, 1 not caused by this brief (§6).
- **⚠️ Flags (§5):**
  - the source copy is written for Germany in places: the TSE fiscal-till lines, and "Uber Eats … in Germany, Lieferando" in the delivery-platforms card;
  - competitor notes from the checker are English data;
  - the US page's VAT line has no US equivalent.

## 0 · Pre-check

- **compare-autopublish-1 is committed on main** (`8c1f1f70`, `dd316d42`), and the tree was clean.
- **One other session exists** (village-foodie-f5). It was idle throughout, and no file changed after the last commit. I took that as "not editing".
- **No span of the brief arrived garbled.** No instructions contradicted each other.

## 1 · Diagnosis

| What | Where | Languages before | Now |
|---|---|---|---|
| Page copy, table, costs, FAQ, methodology, "Report an error", address words, admin words (262 keys) | `comparison` | en-GB, de-DE (+ 1 de-CH, 1 en-CA override) | all 28 bases + overrides (en-US 34, es-MX 56, fr-LU 9, de-CH 10, de-LI 9, en-CA 4) |
| "Which suits your food truck?" patterns and methodology (68 keys) | `comparisonSuits` | all 28 bases (compare-suits-1) | unchanged |

**Code that limited the pages to English and German** (all changed):
- `lib/comparison-server.ts` `comparisonPath`: `/^(de|en)(-|$)/`. It now returns an address for every country with one, except those in `NO_COMPARISON_PAGE` (`lib/comparison-types.ts`: AE).
- `scripts/competitor-check/main.ts` (the publish step's "has a page" test): the same regex. It now uses the same rule.
- `docs/i18n/scoped-namespaces.json`: `comparison` was scoped to en/de. It is no longer scoped, so it is checked like every namespace.
- **Admin › Countries › Comparison pages:** it now lists every country with a page. The route already filtered on the address.

**Already per-language, unchanged:** the twins, the JSON-LD `inLanguage`, the footer column, the sitemap and llms entries, and every amount, date and percentage, which come from the formatters with each country's own settings.

## 2 · The translations

- **Who translated:** eight translator agents, three or four languages each, from one brief.
- **The brief's rules:**
  - natural rather than word-for-word;
  - the project glossaries in `lib/i18n/glossary`;
  - the same words as each language's existing `comparisonSuits` for the same states ("Not listed", "Doesn't say");
  - tokens, ICU and markup exact, with each language's own plural categories (few/many/two/zero);
  - no number, price or currency typed in;
  - product names verbatim.
- **Validation:** a validator checked every file against en-GB (keys, placeholders, select options and exact cases, tags, parse, address words) before it was merged.
- **Translation check** (`scripts/translation-check.cjs`): Structural 0 in every language.
- **New flags from this brief**, all advisory:

| Language | English-word flags | Drift flags | Notes |
|---|---|---|---|
| fr, es, it, pt-PT, pt-BR, nl, ro, ms, da | 21–60 | 33–69 | mostly loan words the market uses (food truck, KDS, POS, iPad) |
| the other 19 | 5–20 | 33–72 | |

The six previews confirm none of this shows as an English sentence (§4).

### 2.1 Addresses (`/<country>/<section>/<slug>`)

| Country | Address |
|---|---|
| GB, US, IE, AU, NZ, CA, SG, MT, GI | /…/comparison/food-truck-ordering-system |
| DE, AT, CH, LI | /…/vergleich/foodtruck-bestellsystem |
| FR, LU | /fr/comparatif/logiciel-de-commande-food-truck · /lu/… |
| ES · MX | /es/comparativa/sistema-de-pedidos-food-truck · /mx/comparativo/sistema-de-pedidos-food-truck |
| IT | /it/confronto/sistema-di-ordini-food-truck |
| PT · BR | /pt/comparacao/sistema-de-encomendas-food-truck · /br/comparativo/sistema-de-pedidos-food-truck |
| NL, BE | /nl/vergelijking/bestelsysteem-foodtruck · /be/… |
| SE · DK · NO · FI | /se/jamforelse/bestallningssystem-foodtruck · /dk/sammenligning/bestillingssystem-foodtruck · /no/sammenligning/bestillingssystem-matbil · /fi/vertailu/ruokarekan-tilausjarjestelma |
| PL · CZ · SK · HU | /pl/porownanie/system-zamowien-dla-food-truckow · /cz/srovnani/objednavkovy-system-pro-food-trucky · /sk/porovnanie/objednavkovy-system-pre-food-trucky · /hu/osszehasonlitas/food-truck-rendelesi-rendszer |
| RO · HR · SI | /ro/comparatie/sistem-de-comenzi-food-truck · /hr/usporedba/sustav-za-narudzbe-food-truck · /si/primerjava/sistem-za-narocanje-food-truck |
| EE · LV · LT | /ee/vordlus/toiduauto-tellimissusteem · /lv/salidzinajums/food-truck-pasutijumu-sistema · /lt/palyginimas/food-truck-uzsakymu-sistema |
| MY | /my/perbandingan/sistem-pesanan-food-truck |
| GR, CY, BG, JP, HK, TH | /…/comparison/food-truck-ordering-system (English words: not Latin script) |
| AE | none (404, admins too) |

All addresses are lowercase ASCII, and no section collides with another page (features, compare, faq, privacy, terms).

### 2.2 Variants and country-name grammar

- **en-US (34 keys):**
  - pickup, POS, card reader, setup, one-time, advisor, trucks, combos;
  - "excl./incl. sales tax".
  - `costs.vat`, HatchGrab's UK reverse-charge statement, is left as en-GB on purpose (§5).
- **en-CA (+3):** "card terminal" where en-US says card reader (Canadian house rule, canada-1).
- **es-MX (56):** celular, platillos, punto de venta, renta, costo, programa de lealtad, "hora para recoger"; section `comparativo`.
- **fr-LU (9):** "au {country}" (au Luxembourg) where French says "en {country}".
- **de-CH (10):** "in der {country}" / "für die {country}" (die Schweiz).
- **de-LI (9):** "in {country}" again, because Liechtenstein takes no article and de-LI inherits de-CH.
- **English:** "the United Kingdom" / "the United States" on English pages (`lib/comparison-server.ts`). Every English line says "in/for {country}". **This changes the live GB page's wording** ("in the United Kingdom"), which is a comparison page.
- **Languages where the country name can't take a case ending:** Polish, Croatian, Slovenian, Latvian, Finnish and Greek put it in brackets or after "country" ("w kraju: …", "({country})"). Correct, but a little formal.

### 2.3 Translators' notable choices

- **Fiscal-till lines** (TSE in the English): every language says "a certified till that meets the country's tax rules" and names no national standard (no NF525, RT, kasa fiskalna, eKasa, SAT…). `features.fiscal.label` keeps "(TSE, EET, kassaregister…)".
- **"Not stated":** matched to `comparisonSuits`' "Doesn't say" word, or kept apart where that word is already "Not listed" (sv, da, cs, sk, hr, sl, ro chose a distinct word to avoid two states sharing one). Each choice is noted by its translator.
- **Tax words:** VAT became each market's word: TVA/HT/TTC, IVA, btw, moms, mva., alv, ΦΠΑ, 消費税, 增值稅, ภาษีมูลค่าเพิ่ม. Malay uses "cukai (VAT)", since Malaysia has SST; Hong Kong and Brazil have no VAT in the European sense, so those lines read a little oddly (§5).
- **Form of address:** each language follows its existing site: formal fr, de, ro, bg, lv, lt, el, hu; informal nl, pl, et, es "tú".
- **Things worth a native check:**
  - Finnish "({country})" frames;
  - pt-BR "no {country}" (right for Brasil only, which is the only pt-BR country);
  - ms "Kesetiaan" (loyalty);
  - zh-HK 會員獎賞 / 取餐器;
  - sv "Summrar" (buzzers);
  - hu "Morzsamenü".
- **Lost notes:** the per-language notes files were in the session scratchpad, which was cleared when the session restarted. The points above are from the translators' reports. The translations and back-translations themselves are in the repository.

## 3 · SEO and AI outputs (§4)

- **hreflang:** a live page names every live comparison page, locale → address (`liveComparisonAlternates`, `lib/comparison-server.ts`). A page that is not live has no hreflang and `noindex`, and is a 404 for the public. On the new build, /uk/comparison/… lists `en-GB` and `de-DE`.
- **Canonical:** the page itself; `og:locale` is its locale.
- **Sitemap:** live pages only, each with the whole live hreflang set (`app/sitemap.ts`).
- **Twins:** /….md and /….json are in the page's language. The JSON says `"language": "<locale>"`, and the JSON-LD `inLanguage`.

## 4 · Proofs (§5)

- **Split check in step:** `split-messages --check` passes, 119 namespaces.
- **Admin previews** (real rows, read-only export; status 'admin' in the stand-in only), `scripts/compare-languages-1-render.cjs`, evidence in `docs/compare-languages-1/`:

| Country | Address | English page strings left | Competitor notes shown (English data) |
|---|---|---|---|
| FR | /fr/comparatif/logiciel-de-commande-food-truck | **0** | 28 |
| ES | /es/comparativa/sistema-de-pedidos-food-truck | **0** | 9 |
| IT | /it/confronto/sistema-di-ordini-food-truck | **0** | 4 |
| JP | /jp/comparison/food-truck-ordering-system | **0** | 3 |
| PL | /pl/porownanie/system-zamowien-dla-food-truckow | **0** | 0 |
| BR | /br/comparativo/sistema-de-pedidos-food-truck | **0** | 14 |

- **The English check:** every en-GB string of the page's own words (comparison and comparisonSuits, two words or more once placeholders and tags are out) was searched for in the page, its Markdown and its JSON. None was found, and admin-only words were 0 as well.
- **Headings rendered:** "Comparatif 2026 des logiciels de commande pour food trucks", "キッチンカー向け注文システム比較 2026", "Porównanie systemów zamówień dla food trucków 2026" and so on.
- **Right-to-left:** the only right-to-left language is Arabic, and its only country, AE, has no comparison page, so no comparison page renders right-to-left. ar-AE is translated anyway (all 28 bases), with all six Arabic plural forms.
- **Other pages, byte for byte:** production builds of HEAD (before) and of this work (after), 280 pages served against the same database.
  - 207 are byte-identical and 71 identical apart from the order Next streams its page data.
  - 2 differ:
    - the sitemap: the two live comparison entries now carry each other's hreflang link;
    - /contact: only its anti-bot form token, a timestamp and signature that change on every request.
  - Stylesheets are identical, and no status or redirect changed.
  - On the new build: /uk/… and /de/… answer 200; /fr/comparatif/… answers 404 (not live); /ae/… answers 404.
- **`scripts/compare-languages-1.cjs`: 24/24.** It covers:
  - every base whole and well-formed, with back-translations;
  - variants well-formed, with their country grammar;
  - no longer scoped; no typed currency;
  - every address but AE, ASCII, never colliding, in the language's words;
  - the checker's rule, with no en/de limit left;
  - an Italian page live on fixtures: Italian words, address, "Segnala un errore" (Report an error), Italian amounts;
  - hreflang = exactly the live set; canonical; title and description;
  - Italian Markdown and JSON twins;
  - the sitemap with the live set only;
  - a page not live is a 404 and absent;
  - AE is a 404 for admins too.
- **Typecheck:** clean.

## 5 · Flags (no decision needed now, but worth a look)

1. **The source copy is written for Germany in places, and these lines show on every country's page:**
   - **The fiscal till.** `faq.tseQ` / `faq.tseA`, `fit.tillsBody`, `fit.oursNotBody`: the English says "TSE", and so does the live GB page. The translations use "a certified till that meets the country's tax rules".
   - **Delivery platforms.** `fit.marketplacesBody` names "Uber Eats 14% / 30% in Germany, Wolt, Lieferando". It is translated as written in every language.

   Both want a per-country or a neutral rewrite of the English.
2. **Competitor notes are English data.** The checker writes them in English (e.g. "Partly, Dishes can be marked sold out…"). They are not page strings, so every page string is translated, but a French reader still sees English notes in some cells. Options for a later brief: ask the checker for notes in the country's language, or hide notes outside English pages.
3. **Tax lines for the US, HK, BR and MY.** `costs.vat` is HatchGrab's UK reverse-charge statement; the US has sales tax, and HK, BR and MY have no VAT as Europe has it. They are translated faithfully, but the statement itself may need a tax-adviser's version for those countries before their pages go live.
4. **Country-name grammar** is handled for English (the UK, the US), fr-LU and de-CH / de-LI, and by brackets in languages with cases. pt-PT and es-ES say "en/em {country}", which is right for their own countries.
5. **The scratchpad was cleared mid-brief** (session restart). The translators' notes files were lost; their content is summarised in §2.3. Exports and previews were redone.

## 6 · Check suite

- **Full sweep** (`node scripts/run-harnesses.cjs`, 202 listed): **198 passed, 4 failed.**

| Harness | Why | Now |
|---|---|---|
| `canada-1` | en-CA inherits en-US, whose new comparison words say "card reader"; Canada's rule is "card terminal" | **fixed in the words:** 3 en-CA overrides. 85/85 |
| `europe-languages-1` | de-LI was pinned to one key; it now also puts "in {country}" back for 9 comparison lines | **re-pinned:** those lines allowed, nothing else. 427/427 |
| `admin-countries-1` | fr-LU was pinned to 20 keys; +9 comparison "au {country}" lines | **re-pinned:** 29, the 9 named. 47/47 |
| `event-types-render` | two measurements of the dashboard event-types dialog at 820px (a dropdown's text 16px vs a row label's 14px), measured against the compiled stylesheet | **not caused by this brief:** it changes no style, class or dashboard file (the one component it touches is a comment line). The stylesheet it measures is built from HEAD's code. Flagged, not re-pinned. It was not re-run on a pre-brief build |

- **Re-run after the fixes:** compare-languages-1, compare-autopublish-1, compare-suits-1, compare-de-1, canada-1, admin-countries-1 and messages-split all pass.
- **Re-pinned or extended for this brief:**
  - `scripts/europe-languages-1.cjs`, `scripts/admin-countries-1.cjs` (above);
  - `scripts/_compare-de-1-fixtures.cjs` (an optional `enable` list of countries switched on in the stand-in; additive).

## 7 · Files

- **Words:**
  - `messages/<28 bases>.json` (+ `comparison`);
  - `messages/{en-US,en-CA,es-MX,fr-LU,de-CH,de-LI}.json` (overrides);
  - `messages/ns/*/comparison.json` and `lib/i18n/catalog/comparison.ts` (generated by split-messages);
  - `docs/i18n/back/<27>.json` (de-DE's back-translation file was not part of this brief);
  - `docs/i18n/scoped-namespaces.json`.
- **Code:**
  - `lib/comparison-server.ts` (address for every country but AE, the hreflang set, "the" for the UK and US);
  - `lib/comparison-types.ts` (`NO_COMPARISON_PAGE`);
  - `app/(public)/[country]/[section]/[slug]/page.tsx` (hreflang);
  - `app/sitemap.ts`;
  - `scripts/competitor-check/main.ts`;
  - `app/api/admin/countries/comparison/route.ts` and `components/admin/ComparisonStatusPanel.tsx` (comments).
- **Proofs:**
  - `scripts/compare-languages-1.cjs`, `scripts/compare-languages-1-render.cjs`, `scripts/harnesses.json`;
  - `docs/compare-languages-1/` (the six previews' Markdown and the summary).

No deploy, no database write, no migration. No `.env*` file was opened.
