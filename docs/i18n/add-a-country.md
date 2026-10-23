# Adding a country (and its language) in one prompt

*languages-1, 22 October 2026. The recipe each country prompt follows. Written for the agent running that prompt, and for
Dominic reviewing it. Where a step says "data", it is NOT RUN SQL for Dominic; where it says "code", it is a change on the
branch.*

**The rule this recipe exists for:** a new country is ONE prompt. It brings:

- its country settings and prices as **data**, switched **off**;
- **one** language file;
- the few data files the language needs: glossary table, allergen-guard words and back-translation.

It must not need code beyond the short list in step 3. If it does, stop and say so: that is a gap in the groundwork, not
part of the country.

**One language per country** (decided 22 October 2026). There is no per-truck or per-customer language yet. A multilingual
country (BE, CH) is a separate decision with a mockup (europe-readiness §B.4).

## Europe: the country is already there, so a prompt is just the language

*europe-settings, 22 October 2026 (docs/europe-settings-report.md).* Every Stripe-supported European country already has
its data and code, switched off: AT BE BG HR CY CZ DK EE FI DE GI GR HU IT LV LI LT LU MT NL NO PL PT RO SK SI ES SE CH.
That covers:

- the `country_settings` row and `plan_prices`, NOT RUN SQL in `supabase/migrations/20261036_europe_rows.sql`, after block A
  `20261035`. The non-euro prices await Dominic's approval;
- the address format with its takeaway VAT as data (`lib/address-formats.ts` EUROPE_ROWS);
- the URL (`COUNTRY_PATH_SEGMENTS`, the ISO code);
- the currency (all in the registry);
- the terms (one "European Economic Area and Switzerland" section, plus Gibraltar's own).

**Steps 1–3 and 5–7 below are therefore done.** A later language prompt for one of these countries is ONLY:

1. **The language file:** `messages/<locale>.json` (§4), its back-translation (§5), and the locale in `lib/i18n/locales.ts`:
   `LOCALES` + `LANGUAGE_BASES`, or `LOCALE_PARENT` for a regional variant. Then `node scripts/split-messages.cjs`.
   Use the locale the row already names: de-DE, de-AT, de-CH, de-LI, nl-NL, nl-BE, it-IT, es-ES, pt-PT, pl-PL, sv-SE,
   da-DK, nb-NO, fi-FI, cs-CZ, sk-SK, hu-HU, ro-RO, bg-BG, hr-HR, sl-SI, el-GR, el-CY, et-EE, lv-LV, lt-LT, fr-LU.
   - fr-LU is a sparse override of fr-FR.
   - de-AT, de-CH and de-LI: built (europe-languages-1). de-AT and de-CH over de-DE, de-LI over de-CH (CH and LI write "ss" for "ß").
   - nl-BE is a sparse override of nl-NL (built, europe-languages-1).
   - el-CY is a sparse override of el-GR.
2. **The allergen-guard words:** `lib/allergen-guard/<lang>.json` and its one import (§6).
3. **The lean checks** (europe-languages-1, 22 October 2026 — the standard from now on; §7b):
   - translation-check at **0 structural** for the base and every regional variant (blocking), and a short plain-English
     flag table in the report;
   - its countries switched on **in fixtures**: `scripts/europe-languages-1.cjs` (add the language to its `LANGS` list —
     the order button's statutory words, plan names, WhatsApp questions) proves the landing page loads in the language with
     no en-GB sentence left, native prices from the rows, og:locale and JSON-LD, hreflang reciprocal, the sitemap, the guard,
     the decimal separator, and the demo's five-step bar;
   - an order-page spot check: `node scripts/languages-1-e2e.cjs --locale <tag> --currency <ISO> --time 24h,dmy,monday
     --areas 1a --out <scratch>` — English left must be only the explained fixture and API residue (§10 of france-1);
   - **no screenshots and no full e2e**, except for a **new alphabet** (Greek, Bulgarian): then one page each, at 390 and
     1280 in Chromium, to confirm the fonts (`--shots --engines chromium --failures-only` writes only failing shots).
4. **Switch on:** NOT RUN SQL `update country_settings set enabled = true where country_code = '<CC>'`, for Dominic. It needs
   the prices approved and blocks A and B run, and is a separate decision after Connect and an end-to-end test (§9).

Malta (en-MT) and Gibraltar (en-GI) need no language: they are sparse English overrides of en-IE and can be switched on
once their rows are in. Until a country's language lands, its pages would show English words under a non-English
`hreflang`, so **do not switch on a non-English country before its language.**

---

## 0 · Read first

- this file;
- `docs/i18n/seo-glossary-eu.md`: the locked terms for DE, NL, FR, ES and IT, and the traps;
- `docs/reference-manual.md` §82.3 (the country recipe as it stood for IE/AU/NZ/CA) and §82.4 (locales);
- `docs/languages-1-report.md`: what the language groundwork does, and its known limits (§7).

Never open any `.env*` file. Never touch `outreach_templates`. Never test against a live truck. Read-only SQL only, and
listed.

## 1 · Decide (or ask) before writing anything

| Decision | Example (France) | Where it lands |
|---|---|---|
| Country code and URL segment | FR, `/fr` | `country_settings.country_code`, `lib/marketing-country.ts` |
| Locale tag (language-REGION) | `fr-FR` | `country_settings.locale`, `lib/i18n/locales.ts` |
| Currency | EUR (already in the registry) | `country_settings.currency`, `lib/currencies.ts` |
| Allergen set | EU 14, labels in French | `country_settings.allergen_set`, `lib/allergens.ts` |
| Address format | `postcode_town` | `country_settings.address_format`, `lib/address-formats.ts` |
| Tax, tips, service fee, card fees | TVA 10 % (restaurant) … | `country_settings` |
| "Pay at Hatch" wording and plan names | from the glossary's recommendations row | the language file |

Anything legal (terms section, consumer rules, the service fee: see canada-1's drip-pricing note) is a decision for
Dominic, with sources. Never decide it silently.

## 2 · Data: NOT RUN SQL, switched OFF

In this order (foreign keys):

1. **`country_settings` row** with `enabled = false`. Every column, as §82.3 lists:
   - `currency`, `locale`, `short_name` (required: a null breaks sentence frames and geocoding);
   - `phone_code` and a `phone_example` that passes `isPlausiblePhone`;
   - `timezones` (default first), `time_format`, `date_order`, `week_start`;
   - `allergen_set`, `card_fee_*` and `card_fee_region_label`;
   - surcharge, service fee and tipping;
   - `address_format`;
   - the retired plan columns NULL;
   - `platform_fee_enabled = false`.
2. **`plan_prices`** rows, one per public plan, in the country's currency (minor units).

Put both in the report under "NOT RUN SQL", with the order stated. Undo SQL goes only in the report, under "Undo (only if
Dominic asks)".

## 3 · Code: the short, known list

1. **The URL:** `COUNTRY_PATH_SEGMENTS` in `lib/marketing-country.ts` (`FR: 'fr'`). Switched-off countries 302 to `/uk`,
   so nothing shows yet.
2. **The locale:** one line in `lib/i18n/locales.ts`, the ONLY list:
   - add the tag to `LOCALES`;
   - a non-English language: add it to `LANGUAGE_BASES`. Its file is then a full base, loaded in the browser only on its own
     pages;
   - a regional variant of a language already there (`fr-BE` over `fr-FR`): `LOCALE_PARENT`, plus a sparse file.
   - An English country is a sparse override of en-GB, as IE/AU/NZ/CA are.
3. **Run `node scripts/split-messages.cjs`.** It generates the catalogue, every namespace file and `lib/i18n/locale-files.ts`.
   Never edit generated files.
4. **Currency:** only if new. Add it to `lib/currencies.ts`, plus the DB CHECK (data).
5. **Allergen set:** only if new. Add it to `lib/allergens.ts` with the labels **in the country's language** (they are what
   the menu stores and shows), plus the loader, the CHECK, the generic → specific replacements and both AI prompts' lists
   (§82.3 item 4). **Every other set's output must be proved byte-identical.**
6. **Address format:** only if new, in `lib/address-formats.ts` (address-formats-2).
7. **Hero screenshots:** fixture trucks only, never a live truck. Recipes are in `scripts/screenshots/`; map them in
   `lib/landing-screens.ts`.
8. **The allergen-guard words:** the import of `lib/allergen-guard/<lang>.json` into `GUARD_WORDS` in
   `lib/allergen-guard.ts` (one line; step 6).

**Nothing else.** Dates, times, numbers and money come from Intl in the locale. `<html lang>`, hreflang and `og:locale`
follow the locale. Posters and captions word themselves in the language. Plan names come from the language file. The
WhatsApp guard reads its own data file. If any of these needs code, it is a groundwork bug: report it.

## 4 · The language file: `messages/<locale>.json`

- **Every key en-GB has.** A missing key shows English: the last resort, and the check lists every one.
- **Same ICU structure as en-GB:**
  - same placeholders and tags;
  - same `select` options;
  - `plural` keeps en-GB's exact cases (`=0`, `=1`) and an `other`. The language's own categories (`one`, `few`, `many`)
    are added as it needs them.
- **Never** decline a placeholder that holds a name ("{plan} plan"). Each language's message owns its frame: apposition, a
  colon, or a construction that doesn't inflect the name.
- **Plan names:** `planNames.<plan key>.name / .description / .subtitle` for every active plan. These are the ONE set of keys
  en-GB doesn't hold (`lib/plan-names.ts`). **"Pro" stays "Pro"**: give it a description but no name. Use the glossary's
  recommendations row for Pay as you go, Unlimited and Free trial.
- **"Pay at Hatch"** is translated, using the glossary's feature name and short label. The word "hatch" must never appear.
- **Brand and product names stay verbatim:** HatchGrab, WhatsApp, Stripe, Apple, Google Play, iPhone, Tap to Pay, Meta.
- **Numbers, prices, percentages and URLs stay as they are.**
- Leave room: German runs about 30 % longer; check the screenshots in step 8.

## 5 · The back-translation: `docs/i18n/back/<locale>.json`

For **every** key, write an English back-translation of your own translation: what the translated sentence actually says,
not the en-GB original. The check compares it with en-GB and lists every key whose meaning drifts, in a short table for
Dominic. No human reviewer is planned, so this table is the review.

## 6 · Glossary and allergen-guard words

- **Glossary:** if the language isn't in `docs/i18n/seo-glossary-eu.md`, add its table in the same shape (Concept | Use |
  Alternatives | B2B/B2C | Conf. | Notes). Then run `node scripts/glossary-build.cjs`, which writes
  `lib/i18n/glossary/<lang>.json`. Low-confidence rows stay in and are flagged for a native check.
- **Allergen guard:** add `lib/allergen-guard/<lang>.json` in the shape of `en.json`:
  - `"normalise": "unicode"`;
  - **absence / safety** stems and tokens: "free from", "intolerance", "allergy", "coeliac", "safe for", the language's
    "-frei" / "sans" / "senza" forms. NOT the bare allergen names: a presence question may reach the AI, which answers only
    from the tags;
  - `caveatWords` for the allergen set's labels.

  Import it into `GUARD_WORDS` in `lib/allergen-guard.ts`; that line is the one code change this step needs. **Without
  the file the guard FAILS SAFE:** every menu question gets the allergen reply, and the AI never answers. That is safe but
  useless, and the check flags it.

## 7 · Run the checks

| Command | Must be |
|---|---|
| `node scripts/split-messages.cjs --check` | ✓ |
| `node scripts/translation-check.cjs --locale <tag> --report docs/<name>-translation-flags.md` | **0 structural** (exit 0). Read every flag; the drift table goes in the report for Dominic |
| `node scripts/glossary-build.cjs --check` | ✓ |
| `node scripts/messages-split.cjs` / `node scripts/messages-parity.cjs` | ✓ |
| `node scripts/languages-1.cjs` | ✓ (the engine, guard, glossary and checker) |
| `npx tsc --noEmit`, `npm run build`, `npx eslint .` | no errors; no new lint problems |
| `node scripts/run-harnesses.cjs` | all pass. Re-pin only what this country changes on purpose, and name each re-pin |

Flags never block the build. Structural problems (missing keys, broken ICU) always do.

## 8 · See it: every surface, both engines

```
npm run build
node scripts/languages-1-e2e.cjs --locale <tag> --currency <ISO> --time <24h|12h>,<dmy|mdy>,<monday|sunday> --out docs/<name> --shots --dump
```

This renders every surface the language phases capture, in the new language:
- the order page, status page, customer emails and WhatsApp replies;
- dashboard, KDS, tickets and operator emails;
- setup, sign-in and demo;
- every Manage tab;
- landing, /features, /compare, the plans PDF and Billing.

It does three things:

- lists any English word left, with the view it is in;
- writes screenshots at 390 and 1280 in WebKit and Chromium to `docs/languages-1/<tag>/`;
- measures **every** HTML view at 390 in Chromium against its GB twin, and lists each overflow the language causes (as
  opposed to one English has too, which is a capture artefact).

Look at the screenshots for clipped text and wrapping buttons. On the pseudo run, also look for a "⟧" cut off.

**Fix the words** (shorter wording), not the layout, unless a layout really can't hold a normal sentence.

When it can't, the fix must leave English byte-identical. Do it in CSS scoped to non-English pages, so no class name in
the HTML changes. languages-1's rules in `app/landing/landing.css` and `app/globals.css` are the pattern:

```css
:root:not(:lang(en)) .hg-landing .nav-r .btn { white-space: normal; }
```

## 7b · The lean per-language checks (europe-languages-1, 22 October 2026)

What a European language prompt now runs, in this order, and nothing more unless the alphabet is new:

| Check | Command | Must be |
|---|---|---|
| Structure | `node scripts/translation-check.cjs --locale <tag>` (each locale; regional variants are merged over their base) | 0 structural |
| Countries on (fixtures) | `node scripts/europe-languages-1.cjs` | all pass |
| Order page | `node scripts/languages-1-e2e.cjs --locale <base> --currency <ISO> --time 24h,dmy,monday --areas 1a --out <scratch>` | English left = explained residue only |
| Glossary | `node scripts/glossary-build.cjs --check` | ✓ |
| The sweep, once per batch | `node scripts/run-harnesses.cjs`, tsc, build, lint | as §7 |

**Translating in parts:** ten parts against one brief (`STYLE-common.md` + a per-language `STYLE.md`: voice, currency, the
glossary's Use terms, the statutory order-button words, sample places), each checked on its own, then a consistency pass
(quoted button names must match the buttons; one word for "Powered by"; the demo stepper no longer than English).

**Regional variants** (`LOCALE_PARENT`, e.g. de-AT/de-CH over de-DE, de-LI over de-CH, nl-BE over nl-NL) are generated by rule
from the base and hold only what differs. `scripts/split-messages.cjs` registers them lazily with their base, so English pages
never carry them.

**The order button** must state the obligation to pay in the statute's own words where the country has one (BGB § 312j,
FAGG § 8, TRLGDCU 98.2, Codice del Consumo 51, DL 24/2014 art. 5, BW 6:230v, WER VI.46, forbrugeraftaleloven § 12,
angrerettloven § 16; Sweden and Switzerland have no fixed phrase). `order.placeOrder` is shown in card mode too (before the card
form), so its words must fit both modes.

**`short_name`** is shown inside the language's sentences ("HatchGrab {country}"), so it must be in the language
(NOT RUN SQL), and every message puts `{country}` where no article or case ending is needed.

## 8b · What France taught (france-1, 22 October 2026)

- **Translate in parts, against one brief.** France was ten parallel parts, each given the same `STYLE.md`: the term base,
  « vous » or its equivalent, the typographic apostrophe ’ (a straight ' breaks ICU), spacing rules and kept brands. Then a
  **consistency pass**, written as rules in a fix layer. Parts disagree on words the glossary doesn't fix: "van", "map"
  (« plan », because « carte » was the menu), quoted button names.
- **Same-spelled words:** list the language's reviewed words that look English (« page », « planning ») in
  `docs/i18n/same-words/<lang>.json`. translation-check and the e2e read it.
- **Allergen names:** the labels stay stored in English, the set's own. Add nothing per language except the language
  file's `menuBadges.allergen.*`. `lib/allergen-label.ts` shows them.
- **Card-region label:** stays English in the row. Its words are `planFeatures.cardRegion.<id>` in the language file.
- **Tax included and worded on receipts** ("Dont TVA 10 %"): put `includedTax: { label, milli }` on the country's address
  format. The truck can override it in Manage › Payments. Nothing is added to a price.
- **The order button:** check the country's law on the wording that places an order (France: L. 221-14, "commande avec
  obligation de paiement").
- **The e2e fixture is the US truck** in the new language. Pass `--currency` and `--time` so its money and clock are the
  country's. Its charge rules stay US-shaped, so prove the country's own rules in the country's harness.
- **Hero images:** `scripts/screenshots/anz-screens.cjs <cc>`, with a fixture entry carrying the country's own dish names
  and `timeFormat`.

## 9 · What a country prompt must NOT do

- Switch the country on. That is Admin › Countries, after Stripe Connect is confirmed for the country, the legal section
  is in, and an end-to-end run with a hidden test truck has passed. Each is a separate decision.
- Translate the legal pages. They are en-GB documents (`content/legal/`); a language version needs a lawyer.
- Add a language to an English country, or a second language to any country.
- Change any English locale's output. Every GB/US/IE/AU/NZ/CA byte must stay identical (the language-phase harnesses
  prove it).

## 10 · The report

Write it to `docs/<name>-report.md`, with:

- the decisions and their sources;
- the NOT RUN SQL, in order;
- the code list (step 3);
- translation-check's summary;
- the **drift table**;
- the glossary low-confidence terms, for a native check;
- the English-left list (it should be empty, or every item explained);
- the screenshots;
- the checks.

In chat: the two-line summary, ending with the report filename.
