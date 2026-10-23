# europe-languages-1 — report

**22–23 October 2026 (overnight).** Branch: main. Nothing committed, pushed or deployed. **No database change was made**: two
read-only queries were run (§12). Every new country stays **switched off** in the database; they are switched on in fixtures only.

## Summary

- **Eight languages are built, completing 12 countries as their primary language.** Every new locale passes translation-check
  with **0 structural problems**:
  - German: de-DE, with de-AT, de-CH and de-LI (Germany, Austria, Switzerland, Liechtenstein);
  - es-ES (Spain), it-IT (Italy) and pt-PT (Portugal);
  - Dutch: nl-NL, with nl-BE (Netherlands, Belgium);
  - sv-SE (Sweden), da-DK (Denmark) and nb-NO (Norway).
- **The lean checks all pass** (`scripts/europe-languages-1.cjs`, new and in the sweep): **177 / 177**. With the countries
  switched on in fixtures:
  - each landing page loads in its language with no en-GB sentence left, and shows native prices from the rows;
  - hreflang is reciprocal across all 19 locales plus x-default, and the sitemap lists every new page;
  - the order buttons use each statute's words;
  - the EU 14 allergens are shown in each language;
  - each language's WhatsApp guard catches its safety questions and lets plain questions through;
  - Swiss German writes "CHF 27.50" with a decimal point.
- **The order page in each language** shows no English except the residue France already explained: fixture dish names,
  injected test notices and API bodies.
  - German had the full e2e run (Chromium, 390 and 1280): 3,548 German views.
  - It found one overflow: the demo's step bar, 80px too wide. It is fixed by shorter words; re-measured, 0 German screens
    overflow.
- **A groundwork gap, found and fixed:** the line naming a shared-symbol currency ("kr") used the registry's English name. The
  Swedish page would have read "Priser i Swedish kronor (SEK)", and Danish and Norwegian likewise. Now a non-English page takes
  Intl's name in its own language: "Valuta: svensk krona (SEK)" (`lib/country-settings-types.ts`, one function). English is
  unchanged.
- **Every live country (GB, US, IE, AU, NZ, CA) and France's fixtures are byte-identical:**
  - 19,894 / 19,894 captured values;
  - 39 / 39 marketing pages, PDFs, sitemaps and /llms.txt.
  The only additions are one en-GB key and one fr-FR key: the label for Swiss cards.
- **Stage 0 (editor memory):** the TypeScript project needs about 2 GB, close to the editor's 3 GB limit. The fix:
  - non-source folders are excluded from the project;
  - non-English whole message files are loaded untyped;
  - the editor's TypeScript server is given 6 GB.
  Type checking of app code is unchanged.
- **Checks:**
  - tsc is clean, and the build passes;
  - lint is identical to the baseline (2,445 / 378);
  - the full sweep: **164 of 165 pass** (re-pins named in §11). The one failure, `add-order-refresh-inputs.cjs`, is an
    existing timing flake: it fails the same way on the untouched commit (§11).
- **For you:** one NOT RUN SQL (the countries' names in their own language, §9). The non-euro price approval is still open
  from europe-settings. There are legal and product questions in §13. Switching on is §10.

---

## 1 · Languages and countries

| Language | Locales | Countries completed (primary language) | Status | Decision needed from you |
|---|---|---|---|---|
| German | de-DE (base); de-AT, de-CH (over de-DE); de-LI (over de-CH) | Germany, Austria, Switzerland, Liechtenstein | **done** | The order button with the amount (§13 Q1); CHF prices (§8) |
| Spanish | es-ES | Spain | **done** | — |
| Italian | it-IT | Italy | **done** | — |
| Portuguese | pt-PT | Portugal | **done** | — |
| Dutch | nl-NL (base); nl-BE (over nl-NL) | Netherlands, Belgium | **done** | Belgium in Dutch only (§13 Q4) |
| Swedish | sv-SE | Sweden | **done** | SEK prices (§8) |
| Danish | da-DK | Denmark | **done** | DKK prices (§8) |
| Norwegian | nb-NO (Bokmål) | Norway | **done** | NOK prices (§8) |

**Second languages skipped (backlog):** each needs a second language per country, which is not built yet (one language per
country, decided 22 October):
- French in Switzerland (fr-CH) and in Belgium (fr-BE). Belgium's row names nl-BE as primary, so French Belgium is second.
- Italian in Switzerland (it-CH); Romansh.
- German in Luxembourg (its primary is fr-LU).
- Swedish in Finland (sv-FI; Finland's primary is fi-FI).
- Nynorsk in Norway.

## 2 · Stage 0 — the editor's TypeScript memory

**Diagnosis:**
- `tsc --extendedDiagnostics` shows **~2.0 GB** for one full check: 2,315 files, 1.8 M symbols.
- Most of it is the app itself (the 1.1 MB Manage page alone needs ~650 MB when checked on its own) and next-intl's typed keys
  (~190 MB).
- The editor's TS server holds the program plus its own caches, so it sits at its default 3 GB limit.
- Each non-English language added ~25 MB of inferred JSON types: its 390 KB whole file was imported typed for a value
  declared `unknown`. Eight languages would have added ~200 MB.

**The fix** (smallest; app type checking unchanged; `tsc` and the build pass):
1. **`tsconfig.json`** excludes folders that hold no source: docs, android, ios, public, logs, data, assets, certificates,
   content and messages. Imported JSON is still checked where it is imported.
2. **`scripts/split-messages.cjs`** now writes the non-English whole files in the generated `lib/i18n/locale-files.ts` as
   `const deDE: unknown = require('@/messages/de-DE.json')`.
   - These are server-only files, and the value was already `unknown`.
   - English files keep their typed imports.
   - next-intl's typed keys (en-GB) are untouched, and `lib/i18n/typecheck.ts` still fails on a wrong key.
3. **`.vscode/settings.json`** (new; Cursor reads it):
   - `typescript.tsserver.maxTsServerMemory: 6144`;
   - `files.watcherExclude` for .next, docs, android, ios and public/screenshots.

## 3 · The order button (consumer law, per country)

Researched against each statute (quotes checked against the statute text; sources in §14):

| Country | Statute | Statutory words | `order.placeOrder` (pay at the truck, and the first press in card mode) | `order.payAmount` (card) |
|---|---|---|---|---|
| DE | BGB § 312j Abs. 3 | „zahlungspflichtig bestellen" | Zahlungspflichtig bestellen | Zahlungspflichtig bestellen · {amount} |
| AT | FAGG § 8 Abs. 2 | „zahlungspflichtig bestellen" | (as de-DE) | (as de-DE) |
| CH, LI | none (CH UWG has no button rule) | — | (as de-DE) | (as de-DE) |
| ES | TRLGDCU art. 98.2 | «pedido con obligación de pago» | Pedido con obligación de pago | Pagar {amount} |
| IT | Codice del Consumo art. 51 c. 2 | «ordine con obbligo di pagare» | Ordina con obbligo di pagamento | Paga {amount} |
| PT | DL 24/2014 art. 5.º n.º 4 | «encomenda com obrigação de pagar» | Encomendar com obrigação de pagar | Pagar {amount} |
| NL, BE | BW 6:230v lid 3; WER VI.46 §2 | «bestelling met betalingsverplichting» | Bestelling met betalingsverplichting | Betaal {amount} |
| SE | lag 2005:59 2 kap. 9 § (no fixed phrase) | — | Beställ med betalningsskyldighet | Betala {amount} |
| DK | forbrugeraftaleloven § 12 stk. 2 | »ordre med betalingsforpligtelse« | Bestil med betalingsforpligtelse | Betal {amount} |
| NO | angrerettloven § 16 annet ledd | «bestilling med forpliktelse til å betale» | Bestill med plikt til å betale | Betal {amount} |

- **"Pay €X" is acceptable**: the Commission's 2014 guidance gives "pay now" as an example. Germany is the exception; see
  §13 Q1.
- **The layout is unchanged; only the words differ.**
- **`placeOrder` is also the first button in card mode** (it opens the card form). So each language uses the neutral
  "order with obligation to pay", not "pay at the truck".
- This reveals a **France issue** (§13 Q2).

## 4 · Glossary

`docs/i18n/seo-glossary-eu.md` and `lib/i18n/glossary/*.json` (rebuilt; `glossary-build --check` ✓ for 9 languages; French
unchanged):
- **Private event split, as France did:**
  - "private hire" (hiring a truck): Foodtruck mieten/buchen · alquiler de food truck · noleggio food truck · foodtruck huren;
  - "private event" (the app's own: a date hidden from the map, with its own ordering link): **privates Event · evento privado ·
    evento privato · privé-evenement**.
  - Why "privates Event" over "geschlossene Veranstaltung": it is short enough for buttons and chips. It also matches the
    glossary's "Eventpreise" and how operators write. "Geschlossene Veranstaltung" stays as body-copy wording.
- **New tables** for PT, SV, DA and NB, in the same shape (Use / Alternatives-Avoid / B2B/B2C / Conf. / Notes, with reasons).
  Their "Pay at Hatch" and plan-name rows:
  - PT: Pagamento no levantamento / Pagar ao levantar / Sem mensalidade / Ilimitado;
  - SV: Betala vid upphämtning / Betala på plats / Utan månadsavgift / Obegränsad;
  - DA: Betaling ved afhentning / Betal ved afhentning / Uden månedsgebyr / Ubegrænset;
  - NB: Betaling ved henting / Betal ved henting / Uten månedsavgift / Ubegrenset.
- **Checker fixes:**
  - DE "vorbestellen / Vorbestellung" split into two Use terms, and "Provision" made a Use term, so the check can match them;
  - `scripts/glossary-build.cjs` reads PT, SV, DA and NB.
- **Low-confidence rows for a native check:**
  - walk-up order in every language;
  - event pricing in every language;
  - DE/IT event pricing;
  - ES schedule.

## 5 · The languages

**How they were translated** (as France):
- ten parts per language, each against one brief:
  - a shared `STYLE-common.md` (ICU rules, the typographic apostrophe, placeholders never inflected, no preposition before
    `{country}`, brands kept, UK samples localised);
  - a per-language `STYLE.md` (voice, currency, the glossary's Use terms, the statutory button, sample places);
- every part checked on its own;
- then a consistency pass per language, as rules:
  - one wording for "Powered by HatchGrab";
  - quoted button names that match the buttons (completion buttons, the masked-price word);
  - the demo step bar no longer than English's.

**Voice:**
- German: "Sie";
- Spanish: "tú";
- Italian: "tu";
- Portuguese: the European formal ("o seu"; never Brazilian);
- Dutch: "je";
- Swedish, Danish and Norwegian: "du".

**Each language:**

| Language | Pay at Hatch (feature / short) | Plan names (payg / unlimited / trial) | List of dishes vs combo | Guard stems |
|---|---|---|---|---|
| de-DE | Bezahlung bei Abholung / Vor Ort bezahlen | Pay-as-you-go („Ohne Grundgebühr." first) / Unlimited / Kostenlose Testphase; CTA „Kostenlos testen" (AT/CH „Gratis testen") | Speisekarte / Menü | 77 |
| es-ES | Pago al recoger / Paga al recoger | Pago por uso / Ilimitado / Prueba gratuita | carta / menú | 39 |
| it-IT | Paga al ritiro | A consumo / Illimitato / Prova gratuita | menu / menu combo | 39 |
| pt-PT | Pagamento no levantamento / Pagar ao levantar | Sem mensalidade / Ilimitado / Teste gratuito | ementa / menu | 40 |
| nl-NL | Betalen bij afhalen / Betaal bij de truck (BE: Ter plaatse betalen) | Pay as you go / Onbeperkt / Gratis proefperiode | menukaart / combideal | 42 |
| sv-SE | Betala vid upphämtning / Betala på plats | Utan månadsavgift / Obegränsad / Gratis provperiod | meny / måltid | 43 |
| da-DK | Betaling ved afhentning / Betal ved afhentning | Uden månedsgebyr / Ubegrænset / Gratis prøveperiode | menukort / menu | 49 |
| nb-NO | Betaling ved henting / Betal ved henting | Uten månedsavgift / Ubegrenset / Gratis prøveperiode | meny / måltid | 45 |

Pro keeps its name everywhere. The word "hatch" appears in no language.

**German regional variants** (generated by rule from de-DE, minimal):
- **de-CH, 95 keys:**
  - "ss" for every "ß";
  - "Rappen" for "Cent";
  - 💵 for the euro note;
  - the typed-decimal hints with a point ("3.5", "0.50", "8.875");
  - "4000 Zeichen";
  - „Gratis testen";
  - "MWST".
- **de-AT, 4 keys:** „Gratis testen", „ohne Anstellen" (the queue), and "USt." in the order card's charge summary.
  - "Jänner" comes from Intl's de-AT data; no message holds a month name.
  - No message used "Stellplatz", so "Standplatz" needed no override. The base uses the glossary's "Standort".
- **de-LI:** empty. Liechtenstein writes as Switzerland does.

**nl-BE** (28 keys, by rule from nl-NL):
- "Ter plaatse betalen" (the glossary's NL-BE row) for both the feature and the label;
- "betaalterminal" for "pinapparaat";
- "Kaart" and "met de kaart betalen" for "Pin" and "pinnen" ("pinnen" is Netherlands-only).

**Regional variants load lazily.** `scripts/split-messages.cjs` registers a regional variant of a language base lazily with
its base, so its words never ship in English pages. Until this run they would have been bundled like an English override.

**The EU 14 in each language** (the stored labels stay English; `menuBadges.allergen.*` words them). The official Annex II
names are used, for example "Schalenfrüchte", "Frutos de cáscara", "Frutta a guscio", "Frutos de casca rija", "Noten",
"Nötter", "Nødder" and "Nøtter". Austria's A–R letter codes are not shown; the EU names are, as everywhere.

**Allergen-guard words:** `lib/allergen-guard/{de,es,it,pt,nl,sv,da,nb}.json`, Option B (absence and safety words only).
- Each list covers: allergy, intolerance, coeliac, anaphylaxis, EpiPen, the "-free" / "without …" / "free from" forms,
  "suitable for" / "safe for", "may contain traces", cross-contamination.
- Spelling variants are included: Swiss and old "ss"/"ß" (Nuss/Nuß), the typed "ue"/"oe" forms, and æ/ø/å.
- Caveat words cover each language's dairy and nut words.
- Each list is imported in `lib/allergen-guard.ts`. Proved in §7.

## 6 · Numbers, currency and the rows

**Checked against what each language needs.**

| Country | Locale | Money (Intl, from the rows) | Decimal input |
|---|---|---|---|
| DE | de-DE | 29 € · 27,50 € | comma: "27,50" typed → 27.50 |
| AT | de-AT | € 29 · € 27,50 | comma |
| CH | de-CH | **CHF 27 · CHF 27.50** | **point**: "27.50" kept as typed, never read as 2750 |
| LI | de-LI | CHF 27 · CHF 27.50 | point |
| ES, IT, PT | es-ES, it-IT, pt-PT | 29 € · 27,50 € | comma |
| NL, BE | nl-NL, nl-BE | € 29 · € 27,50 | comma |
| SE | sv-SE | 329 kr · 27,50 kr | comma |
| DK | da-DK | 219 kr. · 27,50 kr. | comma |
| NO | nb-NO | 299 kr · 27,50 kr | comma |

**Every row holds the right locale, currency, 24-hour clock, day-first dates and Monday weeks.** The decimal separator comes
from Intl (`lib/decimal-input.ts`), so de-CH and de-LI get a number box exactly as English does.

**One value needs changing: `short_name`.** It is shown inside the language's own sentences ("HatchGrab {country}", the pricing
footnote, the phone hints), and every row has it in English ("Germany", "the Netherlands"). §9 holds the NOT RUN update.
Every message puts `{country}` where no article or case ending is needed: in brackets, after a colon, or in apposition. So
"Schweiz", "Nederland" and "België" all read correctly.

**Hero images:**
- /de: Berlin, Mauerpark;
- /at: Wien, Karlsplatz;
- /ch: Zürich, Sechseläutenplatz, in CHF;
- /li: shows the Swiss set.
The images are rendered from fixture trucks with local dishes (a German "Salami" is the pepperoni pizza), never a live truck.
Each file matches the GB image's pixel size (`lib/landing-screens.ts`, `public/screenshots/*-{de,at,ch}.png`).

## 7 · Proof — the lean checks (`node scripts/europe-languages-1.cjs`: 177 passed, 0 failed)

The rows are parsed from the europe-settings SQL (already in the live table, §12), with this run's short names applied, and
switched on in fixtures only.

1. **Each language:**
   - a full base, with its variants over it;
   - translation-check at 0 structural for every locale;
   - the statutory button;
   - the plan names;
   - the demo step bar no longer than English's;
   - the EU 14 in the language;
   - no "hatch".
2. **Each of the 12 countries switched on:**
   - /de /at /ch /li /es /it /pt /nl /be /se /dk /no render in the language;
   - **no en-GB sentence** of the page's own namespaces is left;
   - native prices from the rows (29 € · € 29 · CHF 27 · 329 kr · 219 kr. · 299 kr …);
   - og:locale, canonical, JSON-LD offers in the currency, inLanguage;
   - the short name in the title;
   - for SE, DK and NO, the currency line in the language ("Valuta: svensk krona (SEK)"), never the registry's English name.
   - **hreflang:** /uk and all 12 new pages list the same 19 alternates (the live six, the 12 new and x-default).
   - **Sitemap:** every new page, with its own locale.
   - **Switched off** (the database today): every /<cc> 302s to /uk, and none is in the sitemap or hreflang.
3. **WhatsApp guard, per language:**
   - 10–14 safety questions go to the allergen reply ("Ist das glutenfrei?", "¿Es apto para celíacos?", "Kan den indeholde
     spor af sesam?" …);
   - 5–6 plain questions do not (including a presence question, "Ist Käse auf der Margherita?", which reaches the AI as
     Option B intends);
   - through the real reply function, a safety question gets the fixed allergen reply **in the language**;
   - a plain question goes the menu path, with the price in the locale ("12,00 €");
   - English is unchanged.
4. **Numbers:** the table in §6, for all 12 locales.
5. **The SQL:** only `short_name` updates, each guarded by `enabled = false`.

**Order-page spot check** (`languages-1-e2e.cjs --areas 1a`, per base language; 213 views each):

| Language | English left (views) | What it is |
|---|---|---|
| es, it, pt, sv, da, nb | 11–13 words | The residue France explained: fixture dish names ("Dip", "Crispy"); the order page's injected English test notices and payment-failed text; the reject sentence captured without a locale; the stub AI reply; API bodies (an English `error` beside its `code`) |
| nl | 15 words | The same, plus real Dutch words ("bank", "planning", "updates", "Log in"), now in `docs/i18n/same-words/nl.json` |
| pt | 13 words | The same, plus "Menus" and "num" (Portuguese), now in `same-words/pt.json` |

**German e2e** (the one full run; Chromium only, at 390 and 1280; screenshots only for failures, in
`docs/europe-languages-1/de-DE/`):
- **Captured:** 7,368 views, 3,548 of them in German.
- **Overflow at 390px:** **9 of 2,008** German HTML views overflowed because of the language. All 9 were the demo's
  five-step bar (80px). "Kücheneinstellungen" became „Küche", and the harness now holds every language's bar to English's
  length. ES, PT, SV and DA were shortened the same way. **Re-measured after the fix: 0 of 2,008 German HTML views
  overflow because of the language.** 65 overflow in English too: capture artefacts, as for France.
- **Failing shots:**
  - manage-schedule: sideways at both widths; the GB twin does the same, so it is a capture artefact;
  - ticket: the fixed-width ticket, an artefact as for France;
  - dashboard: clipped at 390; the ellipsis on fixture customer names is by design.
- **English left:** 124 words, in 152 of 3,548 German views. None is a German product sentence left in English:
  - German words are now in `docs/i18n/same-words/de.json` ("optional", "Land", "Falls", "Stand", "plus");
  - the rest is the explained residue: API bodies (an English `error` beside its `code`), the `1d/copy` en-GB constant
    captures, fixture data, and the stub AI reply.

**Translation-check flags** (full tables: `docs/europe-languages-1/<locale>-translation-flags.md`):

| Locale | Structural | English* | Glossary | Numbers | Length | Drift |
|---|---|---|---|---|---|---|
| de-DE / de-AT / de-CH / de-LI | **0** | 87 | 7 | 1 / 1 / 0 / 0 | 286 / 285 / 285 / 285 | 1,159 |
| es-ES | **0** | 215 | 64 | 2 | 193 | 919 |
| it-IT | **0** | 291 | 31 | 2 | 160 | 1,040 |
| pt-PT | **0** | 217 | 17 | 1 | 204 | 851 |
| nl-NL / nl-BE | **0** | 413 / 404 | 34 / 38 | 1 | 148 | 993 / 1,016 |
| sv-SE | **0** | 160 | 1 | 0 | 120 | 964 |
| da-DK | **0** | 275 | 1 | 2 | 91 | 1,006 |
| nb-NO | **0** | 164 | 0 | 0 | 87 | 1,001 |

\* After the reviewed same-spelled words (`docs/i18n/same-words/<lang>.json`).

**What the flags are, in plain English:**
- **English:** words the language uses as they are. These are loanwords (link, dashboard, design, token, server), local words
  that look English (Dutch "open", "data"; Danish "side"; Italian "password"), registrar buttons quoted as those products
  show them ("Add record", "Save"), migration file paths and sample names. None is a product sentence left in English.
- **Glossary:** mostly the setting's own name ("Küchenkapazität", "capacidad de cocina", "capacità della cucina",
  "keukencapaciteit") where the glossary's feature phrase is too long for a label, and plurals the matcher misses.
- **Numbers:** a localised phone placeholder (+34, +39, +31, +45), the de-DE "4.000 Zeichen", and the Danish masked price.
- **Length:** longer languages. Measured, not guessed, for German (above).
- **Drift:** the back-translation uses different words for the same meaning. Read per part by its translator; none changes the
  meaning. The deliberate ones are the order button, sample places, the currency and "van" → the food-truck word.

## 8 · Prices (no new prices)

The rows' `plan_prices` are used unchanged (read-only check, §12).
- **Euro countries:** 29 / 69 (Pro includes 4,000 of online orders).
- **Non-euro countries, still awaiting your approval from europe-settings §8:**
  - CH and LI: CHF 27 / 65 (Pro includes CHF 3,700);
  - SE: 329 / 769 kr;
  - DK: 219 / 519 kr.;
  - NO: 299 / 729 kr.
- If you choose others, europe-settings §9.3 has the update.

## 9 · NOT RUN SQL — run AFTER the deploy, BEFORE switching a country on

`supabase/migrations/20261037_europe_language_short_names.sql`. It only touches rows that are still switched off:

```sql
begin;
update public.country_settings set short_name = 'Deutschland'   where country_code = 'DE' and enabled = false;
update public.country_settings set short_name = 'Österreich'    where country_code = 'AT' and enabled = false;
update public.country_settings set short_name = 'Schweiz'       where country_code = 'CH' and enabled = false;
update public.country_settings set short_name = 'Liechtenstein' where country_code = 'LI' and enabled = false;
update public.country_settings set short_name = 'España'        where country_code = 'ES' and enabled = false;
update public.country_settings set short_name = 'Italia'        where country_code = 'IT' and enabled = false;
update public.country_settings set short_name = 'Portugal'      where country_code = 'PT' and enabled = false;
update public.country_settings set short_name = 'Nederland'     where country_code = 'NL' and enabled = false;
update public.country_settings set short_name = 'België'        where country_code = 'BE' and enabled = false;
update public.country_settings set short_name = 'Sverige'       where country_code = 'SE' and enabled = false;
update public.country_settings set short_name = 'Danmark'       where country_code = 'DK' and enabled = false;
update public.country_settings set short_name = 'Norge'         where country_code = 'NO' and enabled = false;
commit;
```

**Order:**
1. Deploy this branch.
2. Run this.
3. Switch countries on (§10).

`name` (the English admin name) is unchanged.

## 10 · How to switch each completed country on

For **each** of DE, AT, CH, LI, ES, IT, PT, NL, BE, SE, DK and NO:

1. **Deploy** this branch (until then, the deployed code cannot read these locales).
2. **Run §9** once (all 12 short names).
3. **Prices:**
   - euro countries: nothing to do;
   - CH, LI, SE, DK and NO: approve the europe-settings §8 prices, or run its §9.3 update with yours.
4. **Stripe Connect check, in the Stripe dashboard:**
   - Connect › Settings: the country is enabled for connected accounts.
   - Create a test connected account for the country (Express/Standard, as live) and finish onboarding.
   - Make one test card payment in the currency (EUR, CHF, SEK, DKK, NOK) with manual capture.
   - Confirm the card fee shown matches the row: EEA 1.5 % + 0.25 online. CH uses its own Swiss rate (2.9 % + CHF 0.30); NO
     uses 2.4 % + 2 kr.
   - The local wallets are not built (europe-settings §7): TWINT (CH, LI), MobilePay (DK), Vipps (NO), Swish (SE), Bancontact
     and Wero (BE), iDEAL / Wero (NL), MB WAY (PT), Bizum (ES).
5. **Legal:** the "European Economic Area and Switzerland" terms section (europe-settings §11), with its open per-country
   questions (mediators, Danish online allergen notice), plus §13 below.
6. **An end-to-end test with a hidden test truck** in the country: order, pay, collect, receipt email, WhatsApp question.
7. **Admin › Countries:** switch the country on. Its /<cc> page, hreflang, sitemap, menu entry and /llms.txt section appear at
   once.

## 11 · Re-pins (only for these approved changes) and tooling

| File | What changed |
|---|---|
| `scripts/languages-1.cjs` | The locale lines are matched by shape (each language adds to them). The "no guard list → fail safe" proof uses Polish (Italian has a list now). The German guard proof uses the real `de.json`, not a fixture. The non-English whole file is a `require` |
| `scripts/_language-phase-0-after.cjs` | The "unsupported locale" example is pl-PL (de-DE is supported now) |
| `scripts/france-1.cjs` | LANGUAGE_BASES starts with fr-FR, then the later bases |
| `scripts/europe-settings.cjs` | Sweden's currency line is in Swedish; DK and NO read theirs from their files |
| `scripts/native-prices.cjs` | Sweden's currency line is sv-SE's own ("Valuta: svensk krona (SEK)"); AU, NZ and CA are exactly as before |
| `scripts/_messages-parity-1e.cjs` | `planFeatures.cardRegion.Swisscards` named as a deliberately new word (the one en-GB key added) |
| `scripts/translation-check.cjs` | A regional variant is checked merged over its base (de-AT, de-CH, de-LI, nl-BE) |
| `scripts/split-messages.cjs` | Regional variants are registered lazily; non-English whole files use `require` (§2) |
| `scripts/languages-1-e2e.cjs` | New `--engines` and `--failures-only` (defaults unchanged) |
| `scripts/glossary-build.cjs` | Reads PT, SV, DA and NB |
| `scripts/harnesses.json` | Adds `europe-languages-1.cjs` |
| `scripts/screenshots/anz-fixtures.cjs`, `anz-screens.cjs` | de, at, ch hero fixtures |

**The sweep** (`node scripts/run-harnesses.cjs`): **165 run · 164 passed · 1 failed.**

- **The failure is `add-order-refresh-inputs.cjs`.** It is not caused by this work:
  - its failing checks are mutation controls that "passed" by timing, and they change from run to run (V3 one run, V2 the
    next);
  - it **fails the same way on the untouched commit 0eb4ed19**, run in a separate worktree at 08:20;
  - it passed in this run's previous sweep, at night;
  - no dashboard or Add Order file was changed.
  It looks time-of-day dependent. Worth a look on its own.
- **Earlier sweeps:**
  - The first sweep, run while 20 agents were translating, also had two load-related timing failures (add-order-refresh,
    batch-reservation-edit-lock). Both passed in the next sweep.
  - Its real failures were the re-pins above, all fixed:
    - languages-1, france-1, europe-settings, language-phase-0;
    - native-prices (Swedish currency line);
    - messages-parity (the Swiss-cards key).

## 12 · Read-only SQL run

```sql
select country_code, name, short_name, enabled, locale, currency, updated_by from public.country_settings where country_code in ('DE','AT','CH','LI','ES','IT','PT','NL','BE','SE','DK','NO') order by country_code;
```
```sql
select country_code, plan_key, monthly_minor, included_online_minor, fee_bps from public.plan_prices where country_code in ('DE','AT','CH','LI','ES','IT','PT','NL','BE','SE','DK','NO') order by country_code, plan_key;
```

**Results:**
- All 12 rows exist and are **switched off** (`updated_by` "europe-settings draft"). Each has its locale and currency as the
  harness parses them.
- Their short names are English ("Germany", "the Netherlands"…), which is why §9 is needed.
- The prices are exactly europe-settings' (§8 above).

## 13 · For you to decide (legal and product)

1. **The German card button with the amount.** BGB § 312j and FAGG § 8 say the button carries "nothing other than" the words
   (or an equivalent).
   - The card button reads „Zahlungspflichtig bestellen · 23,50 €".
   - The amount reinforces the payment obligation, but a strict reading wants the words alone.
   - Dropping the amount for German needs a small code change: a message without `{amount}`.
   - Keep it, or remove the amount for DE and AT?
2. **France: the first order button says « Commander et payer au retrait » even when the customer chose to pay by card.**
   - The same key opens the card form in card mode (found while setting the button for Germany).
   - Change it to « Commander avec obligation de paiement »? That is one French string. Not changed here, to keep France
     byte-identical.
3. **Voice:**
   - "Sie" for German. German apps vary; many consumer apps use "du".
   - "tú" for Spanish, "tu" for Italian, "je" for Dutch, "du" for the Nordic languages.
   - The European formal for Portuguese.
   - Confirm, or pick another per language.
4. **Belgium and Switzerland are one language each for now.**
   - Belgian trucks get Dutch (Flemish) pages; Brussels and Wallonia trucks would see Dutch.
   - Swiss trucks get German; Romandie and Ticino would see German.
   - The second languages are in the backlog (§1).
5. **Things the translators kept, as France did:**
   - the UK phone placeholder (+44) in German, French, Swedish and Norwegian (Spanish, Italian, Portuguese, Dutch and Danish
     localised theirs);
   - "six years, as UK law requires" in account deletion (Germany often 10 years, Sweden 7);
   - "registered in England and Wales";
   - the typed confirmation word "DELETE" stays English (the server checks it).
6. **de-CH quotation marks:**
   - de-CH uses German „…" rather than Swiss «…», to keep the override minimal (95 keys).
   - Swiss usage prefers «…». Switching would add about 150 keys to de-CH (every German string with a quotation).
7. **Minor wording mixes inside a language:**
   - Swedish uses both "plan" and "abonnemang" for a plan;
   - Danish keeps "dashboard".
   - Both are understood. A native pass could unify them.

**Notes on this run:**
- A usage limit stopped 13 translator agents mid-part during the night. Each was resumed from its saved work, and every part was
  re-checked (0 structural) before merging.
- Early on, I mistakenly called the multi-agent Workflow tool once with an empty placeholder script. It ran no agents and
  changed nothing. The translation work used ordinary agents.

## 14 · Sources (the order-button statutes)

- **ES:** boe.es BOE-A-2007-20555 (TRLGDCU art. 98.2).
- **IT:** normattiva.it, D.Lgs. 206/2005 art. 51.
- **PT:** DL 24/2014 art. 5.º n.º 4. Read from the consolidated copy at fd.ulisboa.pt, updated to Lei 47/2014; DRE would not
  render.
- **NL:** wetten.overheid.nl BW 6:230v; Hoge Raad 4 Oct 2024 on "bestellen".
- **BE:** ejustice.just.fgov.be (WER VI.46 §2).
- **SE:** riksdagen.se, lag 2005:59.
- **DK:** danskelove.dk, LBK 1184/2025 § 12 (unofficial).
- **NO:** lovdata.no, LOV-2014-06-20-27 § 16.
- **AT:** jusline.at FAGG § 8; WKO guidance.
- **CH:** seco.admin.ch (UWG Art. 3 lit. s; no button rule).
- **EU:** the Commission's 2014 CRD guidance (via secondary sources); CJEU C-249/21 Fuhrmann-2; CJEU C-400/22 Conny.

## 15 · Files

**New:**
- `messages/{de-DE,de-AT,de-CH,de-LI,es-ES,it-IT,pt-PT,nl-NL,nl-BE,sv-SE,da-DK,nb-NO}.json`;
- `docs/i18n/back/` (the same 12);
- `lib/allergen-guard/{de,es,it,pt,nl,sv,da,nb}.json`;
- `lib/i18n/glossary/{pt,sv,da,nb}.json`;
- `docs/i18n/same-words/{de,pt,nl,sv,da,nb,es,it}.json`;
- the generated `messages/ns/<locale>/*` and catalog lines;
- `scripts/europe-languages-1.cjs`;
- `supabase/migrations/20261037_europe_language_short_names.sql` (NOT RUN);
- `public/screenshots/{kitchen,dashboard-v4,customer-order}-{de,at,ch}.png`;
- `.vscode/settings.json`;
- `docs/europe-languages-1/` (the German e2e failures and findings, and the flag tables);
- `docs/i18n/europe-languages-1-progress.md`.

**Changed:**
- `lib/i18n/locales.ts`;
- `lib/allergen-guard.ts`;
- `lib/landing-screens.ts`;
- `lib/country-settings-types.ts` (`currencyLineOf`: Intl's currency name on a non-English page);
- `tsconfig.json`;
- `messages/en-GB.json` and `messages/fr-FR.json` (+1 key each: Swiss cards);
- `docs/i18n/seo-glossary-eu.md`;
- `lib/i18n/glossary/{de,es,it,nl}.json`;
- `docs/i18n/add-a-country.md` (the lean checks are now the standard, §7b; e2e and screenshots only for a new alphabet);
- the scripts in §11.

## Undo (only if Dominic asks)

Nothing was run against the database. If §9 is run and needs undoing:

```sql
begin;
update public.country_settings set short_name = 'Germany' where country_code = 'DE' and enabled = false;
update public.country_settings set short_name = 'Austria' where country_code = 'AT' and enabled = false;
update public.country_settings set short_name = 'Switzerland' where country_code = 'CH' and enabled = false;
update public.country_settings set short_name = 'Spain' where country_code = 'ES' and enabled = false;
update public.country_settings set short_name = 'Italy' where country_code = 'IT' and enabled = false;
update public.country_settings set short_name = 'the Netherlands' where country_code = 'NL' and enabled = false;
update public.country_settings set short_name = 'Belgium' where country_code = 'BE' and enabled = false;
update public.country_settings set short_name = 'Sweden' where country_code = 'SE' and enabled = false;
update public.country_settings set short_name = 'Denmark' where country_code = 'DK' and enabled = false;
update public.country_settings set short_name = 'Norway' where country_code = 'NO' and enabled = false;
commit;
```

(Liechtenstein and Portugal are spelled the same in both, so they are not listed.)
