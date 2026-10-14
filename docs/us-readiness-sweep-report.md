# US readiness sweep — allergens, marketing tags, placeholders, plans PDF, Items CSV

**Date:** 13 October 2026
**Sources:** `docs/phases-3-6-audit-report.md` (Part 6, D35, D37) and `docs/phase-3-screens-report.md` (§8 gap 5).
**Step 0 checkpoint:** `e54c7ea05b7491b14d0b8c13944680553bf7e26f` — "Phase 3 foundations and screens: tax, tips and fees (checkpoint)". Its parent is `3033a532b9d929d6db36f8ec397868a43a61f054`. Everything in this report is uncommitted on top of it.
**SQL:** none. No table, column, row or `outreach_templates` entry is touched.

---

## Summary

| # | Item | Result |
|---|---|---|
| 1 | Allergens by country (D35) | **Done.** Every place that offers, checks or prompts for allergens now uses the truck's country list: UK 14 or US 9. No data change was needed. |
| 2 | Landing and features tags by country (D37) | **Done.** The title, description, Open Graph, Twitter and landing JSON-LD (`areaServed`, `inLanguage`) follow the visitor's country. GB is byte-identical. |
| 3 | Manage placeholders by country | **Done.** One copy module, `lib/copy/addressPlaceholders.ts`, keyed by `address_format`. |
| 4 | Plans PDF by prospect country | **Done.** The country is read from `discovery_trucks.country` and falls back to GB. |
| 5 | Items CSV | **Left unchanged, deliberately.** Its columns have no per-item meaning for tax, tips or fees (§5). |

There are no layout changes. GB output is byte-identical to the BEFORE capture. The proof is in §6.

---

## 1 · Allergens by country (D35)

### Diagnosis

**Storage.** `menu_items_db.allergens` (and the modifier options' `allergens`) store the label strings themselves, for example `["Dairy", "Gluten"]`. There are no ids or codes. A US truck can therefore store US labels ("Milk", "Wheat") in the same column while UK trucks keep storing UK ones.

**Can the list follow `country_settings.allergen_set` without a data change? Yes.**
- `allergen_set` already exists (`uk14` / `us9`, migration `20261010_02`, with a check constraint). It is already read into `CountrySettings.allergenSet`.
- No US truck exists, so no stored row needs converting.
- Five labels are shared by both lists: Eggs, Fish, Peanuts, Tree nuts and Sesame.

**Every use, and what changed:**

| Place | What it does with the list | Change |
|---|---|---|
| `components/manage/primitives.tsx` — `ALLERGEN_VOCAB`, `AllergenToggles` | The chip toggles in the menu-item editor (`page.tsx` ~5570), the allergen review list (~2278) and the extras editor (`ExtrasEditor.tsx` ~546). | `AllergenToggles` reads `useAllergenVocab()`: the provider's country list, or the UK 14 with no provider. `ALLERGEN_VOCAB` now re-exports `UK_14`. |
| `app/manage/[token]/page.tsx` — `AllergenWizardModal` (the setup and import wizard's allergen step, and the Menu tab's standalone wizard) | The review list filters stored tags to the vocabulary (`isVocab`), flags generic tags ("Nuts", "Shellfish") and blocks with a warning until a precise pick is made. The table view's columns are the vocabulary. | The list, `isVocab` and the generic families are now built at the top of the component from the provider's `allergenSet`. The module-level UK-only copies are removed. |
| `app/api/manage/process-allergens/route.ts` — allergen-card AI prompt | Names the list and the example arrays. | Reads the truck's country (`select('id, name, country')` → `countrySettingsForTruck`) and builds the list lines, closing rule and examples from `lib/allergens.ts`. Falls back to the UK 14 if the settings read fails, as before. |
| Same route, **transcribe** mode | Asks the AI to copy the card's own words and map nothing. It names no list. | **Unchanged.** It is country-neutral by design; proven equal for a US truck. |
| `lib/menu-extract.ts` — menu importer AI prompt | Names the 14 and maps menu wording onto them. | Takes an optional `truck.allergenSet`; the lines come from `lib/allergens.ts`. Its callers (`app/api/manage/process-menu/route.ts`, `lib/provision-demo.ts`) pass the truck's set. |
| Customer order page (`app/trucks/[slug]/order/page.tsx`, `components/MenuAllergenChips.tsx`) | Shows the stored labels as chips. It holds no list. | None needed: it shows whatever the truck stored. |
| Kitchen tickets (`lib/printing/*`) | Do not carry allergens, by design (`ticket.ts` header). | None. |
| WhatsApp allergen guard (`lib/whatsapp-classifier.ts`) | Keys on "allergy", "intolerance", "coeliac"/"celiac", "free from" and similar. It names no allergen. | None: already country-neutral. |
| Go-live checks, allergen audit, menu commit, card match | Count, copy or compare stored tags. None holds a list. | None. |

**New module: `lib/allergens.ts`.** It is pure and client-safe. It holds:
- `UK_14`, copied verbatim and in order from the old `ALLERGEN_VOCAB`;
- `US_9`: Milk, Eggs, Fish, Crustacean shellfish, Tree nuts, Peanuts, Wheat, Soybeans, Sesame;
- `allergenVocab(set)`, where anything unrecognised returns the UK 14;
- `genericReplacements(set)`;
- the prompt helpers. Each UK string is the old prompt text, character for character.

**US generic families:**
- "Nuts" → Tree nuts / Peanuts.
- "Shellfish" → Crustacean shellfish. Molluscs are not one of the US 9.
- A bare "Gluten" → Wheat. Gluten is not itself a US major allergen. The operator picks Wheat, or leaves it unselected after the warning.

UK families are unchanged.

**Left as is (worth knowing):**
- The review warning says "Pick Wheat if this dish contains gluten — or leave them unselected". "them" reads slightly off when there is a single option. The UK text is shared, so it is left alone.
- The AI result's free-text summary is the operator's own card, so it is not normalised.

---

## 2 · Landing and features tags by country (D37)

**New module: `lib/marketing-meta.ts`.** `marketingCountry(settings)` returns:
- `short`: `short_name`, else the full name ("UK" / "US");
- `name`: "United Kingdom" / "United States";
- `lang`: the locale ("en-GB" / "en-US");
- `ogLocale`: "en_GB" / "en_US".

**`app/landing/page.tsx`:**
- The static `metadata` export is replaced by `generateMetadata({ searchParams })`. It resolves the visitor's country with the page's own resolver (`resolveVisitorCountry`: `?country`, then the cookie, then the request country, then GB; enabled countries only).
- Title (`absolute`), Open Graph title and Twitter title: "Food truck & mobile catering ordering system — HatchGrab {short}".
- Description (all three): "…software for {short} food trucks and mobile catering — not a POS."
- `og:locale`: `ogLocale`.
- JSON-LD:
  - `description`: "…for {short} food trucks…";
  - `inLanguage`: `lang`;
  - `areaServed.name`: `name`.
- Canonical, robots and images are unchanged.

**`app/features/page.tsx`:**
- Same treatment: title, OG and Twitter titles, `og:locale`. The page has no JSON-LD, and its description names no country.
- `generateMetadata` runs the page's brand gate (`onHatchGrab()` → `notFound()`) **before** reading any country, as the page itself does. `marketing-country-parity` checks this ordering.

**`app/1ng7n4p5omux2gdk9kqvwz/page.tsx`** (the unlisted landing preview) re-exported `metadata`. It now re-exports `generateMetadata`: same module, same tags.

**GB:** every value is the literal it was before ("— HatchGrab UK", en_GB, en-GB, United Kingdom), so GB is byte-identical (§6). A visitor asking for `?country=US` while the US is switched off gets the GB tags.

**Not changed: wording a US reader may find British** ("pitch", "mobile catering"). The brief limited this item to the country name and locale. Options:
- (a) leave as is;
- (b) add per-country SEO copy rows to `country_settings`;
- (c) a small copy map in `lib/marketing-meta.ts` keyed by country.

Recommendation: **(c)**, when the US marketing copy is written. It keeps the copy in code next to the page and needs no SQL.

**Not added: `hreflang` alternates.** Every country shares one canonical URL and switches by `?country`. Recommendation: add `alternates.languages` only if US pages get their own URLs.

### Screenshots that need US versions

The images in `public/screenshots/` show £ prices and UK date wording. They are left in place, as briefed:

| File | Used on | What is British in it |
|---|---|---|
| `customer-order.png` | Landing hero | £12.00 / £10.00 prices and the £12.00 basket total |
| `dashboard-v4.png` | Landing | £ prices throughout, "Take payment £50.00", "Tomorrow 2nd September" |
| `kitchen.png` | Landing | £ order totals and line prices, "Tomorrow 2nd September" |

---

## 3 · Manage placeholders by country

**New module: `lib/copy/addressPlaceholders.ts`**, keyed by `country_settings.address_format`. Anything unrecognised gets the UK copy.

| Field (Schedule tab) | `postcode` (GB — unchanged) | `zip_state` (US) |
|---|---|---|
| Full address (optional) | e.g. 123 High St, Wickhambrook | e.g. 123 Main St, Austin, TX 78701 |
| Area (village, town or city) | e.g. Wickhambrook | e.g. Austin |
| Paste schedule text | Paste your schedule here e.g. Saturday 14th June, The Crown, Wickhambrook, 5pm-9pm | Paste your schedule here e.g. Saturday 14th June, Zilker Park, Austin, 5pm-9pm |

`ScheduleTab` reads all three through its existing `tabSettings = useCountrySettings()`.

**Left unchanged (outside the brief's three), with options:**
- The paste example's **date part** ("Saturday 14th June") is shared, because the brief named only the venue segment. A US reader would write "Saturday, June 14". Recommendation: add a `pasteDate` to the same module when US dates are reviewed.
- **Venue name** ("e.g. The Crown", ~9888). It is a pub name and harmless in the US. Recommendation: leave, or add to the module as "e.g. Zilker Park".
- **The "Postcode" label and its "e.g. CB8 8PD" placeholder** (~9999), and the inline "Postcode" placeholder (~9222). For a US truck these should read "ZIP code" and "e.g. 78701". This is a label change, not just a placeholder, and the uppercase transform on ~9222 is UK-specific. Recommendation: the next copy pass adds `postcodeLabel` / `postcode` to this module, keyed by the same style.

---

## 4 · Plans PDF by prospect country

`app/api/admin/outreach/attachments/route.ts`, action `plans_pdf`:
- The new `prospectCountry(prospectId)` reads `outreach_prospects.discovery_truck_id`, then `discovery_trucks.country` (migration `20261010_15`).
- The code is trimmed and upper-cased, so "us" → US.
- Any of the following gives `'GB'`, which is what every prospect got before:
  - no prospect;
  - no linked discovery truck;
  - a read error;
  - anything that is not two letters.
- `generatePlansPdf(country)` then renders that country's prices. The generator, file name, size check, storage path and response are all unchanged.

For a GB prospect the call is `generatePlansPdf('GB')`, exactly as before. The generator is untouched, so the document is the same.

No `outreach_templates` row or template text is read or written. No email is sent.

**Note:** in the live database the US row's plan prices are null and the US is switched off. A US prospect's PDF will therefore fail into the existing refusal ("The plans PDF could not be generated just now…") until US prices are set. That is preferable to sending a US prospect a £ price list. With prices set, the fixture renders $39 / $69 and no £ (§6).

---

## 5 · Items CSV — left unchanged

The Orders CSV gained tax, tip and fee columns in Phase 3 because those are order-level facts. The Items CSV is one row per item sold. None of the three has a per-item value:
- **Tax** is rounded once per order (D3). Splitting it across lines would invent per-line figures that don't sum to what was charged.
- **Tips** and the **service fee** are charged on the order, not on any item.

Adding them would mean either repeating order totals on every item row (double-counting when summed) or an apportionment the product does not perform. The Orders CSV already carries all three. The Items CSV stays as is, and `money-sweep-parity` still proves it byte-identical for GB.

If a per-item tax view is ever wanted, the only honest version is a "taxable" yes/no per item. Recommendation: not now.

---

## 6 · Proof

**BEFORE** was captured on the checkpoint `e54c7ea` before any edit: `scripts/fixtures/us-readiness-before.json`. It holds:
- the allergen card prompt as sent (structure and transcribe);
- the importer prompt as sent;
- the landing and features metadata objects;
- the three placeholders;
- the country the plans PDF is generated for;
- the toggles as rendered, with and without a GB provider.

**New harness: `scripts/us-readiness.cjs`** (registered), plus `scripts/_us-readiness-us.cjs` (registered as a shared module). **50 / 50 pass:**

- **§1 GB, byte-identical to BEFORE:** both card prompts, the importer prompt, landing metadata, features metadata, the plans PDF country, and the toggles with and without a provider.
- **§2 allergens:**
  - the US 9 in order, and the UK 14 unchanged;
  - generic families for both countries;
  - toggles under a US provider show the US 9;
  - the review and table read the provider's set;
  - the US card prompt names the US 9 and US examples, with no UK list;
  - the transcribe prompt is unchanged for US;
  - the US importer prompt names the US 9;
  - the importer with `uk14` passed explicitly (as the routes now do) equals BEFORE;
  - both importer callers pass the set.
- **§3 metadata:**
  - `?country=US` gives "— HatchGrab US", "US food trucks" and en_US on the landing and features pages;
  - nothing else in the tags moves;
  - `?country=US` with the US switched off gives the GB tags, byte-identical;
  - the landing page's rendered JSON-LD for US is United States / en-US / "US food trucks", and for GB it is the old literals.
- **§4 placeholders:** GB copy equals BEFORE, the US copy is as briefed, no style falls back to the UK copy, and the page holds no literal.
- **§5 plans PDF:**
  - prospect country US → US, GB → GB;
  - missing → GB, "usa" → GB, "us" → US;
  - no discovery truck → GB, unknown prospect → GB;
  - the US plans PDF HTML shows $39 / $69 with no £;
  - the route never touches `outreach_templates`.
- **§6:** no Items CSV file changed.

**Existing pins, re-run:**
- `marketing-country-parity`: 121/121. The rendered landing, features and compare pages for GB, JSON-LD included, are byte-identical. One check caught `generateMetadata` reading the country before the features brand gate; that was fixed (§2).
- `money-sweep-parity`: all 3057 GB strings and byte streams identical, every CSV included.
- `plan-feature-order`: 29/29.
- `printing-copy`: pass.

**Checks:**
- `npx tsc --noEmit`: clean.
- eslint, per rule against HEAD, on every touched app file: no rule grew.
  - The two new harness files carry `@typescript-eslint/no-require-imports`, as every CommonJS harness does (for example `phase3-screens.cjs`: 7, `marketing-country-parity.cjs`: 5).
- `npx next build`: exit 0.
- Full sweep (`node scripts/run-harnesses.cjs`): 110 run, 107 passed, 3 failed. Each failure was a pin that named the exact old form of a line this sweep changed on purpose. Each pin was updated to name the new form, and all three were re-run green:
  - **`outreach-reply-attach`** asserted `generatePlansPdf('GB')` in the attach route. It now asserts `generatePlansPdf(country)`, the `prospectCountry` lookup and its `'GB'` fallback (§4). Result: all checks pass.
  - **`schedule-graphics-places`** ("no line of the page was lost") listed six lines that this sweep moved on purpose. These are the four module-level allergen lines (§1) and the two address and area placeholder lines (§3). Each is now a `movedEdits` entry with its new form and file, and the guard fails if that new form disappears. Result: 269/269.
  - **`phase3-screens`** §9 ("Taking payment" moved byte for byte; the rest of SettingsTab unchanged) compared against `HEAD`. It was written while Phase 3 was uncommitted. The Step 0 checkpoint folded that move into HEAD, so HEAD no longer held the moved block. It is now pinned to `3033a53`, the commit Phase 3 started from, with no change to what it asserts. Result: 86/86.
  - eslint on the three re-pinned harness files: no rule grew.
  - The other 107 harnesses, `us-readiness` included, passed in the same run.

---

## 7 · Files

**New:**
- `lib/allergens.ts`
- `lib/marketing-meta.ts`
- `lib/copy/addressPlaceholders.ts`
- `scripts/us-readiness.cjs`
- `scripts/_us-readiness-us.cjs`
- `scripts/fixtures/us-readiness-before.json`

**Changed:**
- `app/api/manage/process-allergens/route.ts`
- `lib/menu-extract.ts`
- `app/api/manage/process-menu/route.ts`
- `lib/provision-demo.ts`
- `components/CountrySettingsProvider.tsx`: adds `useOptionalCountrySettings()`, which returns null without a provider and is for shared controls only, never money.
- `components/manage/primitives.tsx`
- `app/manage/[token]/page.tsx`
- `app/landing/page.tsx`
- `app/features/page.tsx`
- `app/1ng7n4p5omux2gdk9kqvwz/page.tsx`
- `app/api/admin/outreach/attachments/route.ts`
- `scripts/harnesses.json`
- `scripts/outreach-reply-attach.cjs`, `scripts/schedule-graphics-places.cjs` and `scripts/_phase3-screens-us.cjs`: re-pinned (§6)

**Rules kept:**
- No SQL, deploy or push.
- No process killed.
- No `outreach_templates` change and no email.
- Pizzeria Gusto untouched; US checks on fixtures only.
- No `.env*` file read.
- No table, column or image removed.
