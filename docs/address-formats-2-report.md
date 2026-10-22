# address-formats-2: entry forms, geocoding, Places, AI prompts and event conflicts read the address config

**Date:** 21–22 October 2026 · **Branch:** `main` (uncommitted, on top of `7fcd4fc9`) · nothing pushed or deployed ·
no database change run (the SQL in §6 is **NOT RUN**).

**The prompt** arrived intact; nothing was garbled.

**Choices I made where the brief left room** (none contradicted another instruction; each is flagged here):

1. **The "Customers see:" line, the as-you-type postal check, the save normaliser and the required asterisks are switched
   off for GB and the US.** Showing them would change GB/US forms, which must stay byte-identical. They are per-format
   flags in the config (`entry`), on for IE/AU/NZ/CA.
2. **The US State box stays a free-text box.** It is limited to the list's longest code (2), as before. IE, AU and CA get
   the dropdown.
3. **The street field keeps today's label, "Full address (optional)", in every country.** The approved look said
   "Address"; I read that as shorthand for the existing field.
4. **The US geocode query does not include the state.** It never did, so the US template leaves the region out (like
   the US calendar line in stage 1). Adding it would change every US query.
5. **A region written as a name is not saved for formats shown as codes (US, AU, CA).** Only a code is kept, any case:
   "nj" → "NJ", but "New Jersey" → nothing. This is exactly the old US two-letter rule, so US saves are unchanged
   (`us-polish-batch` proves it). Ireland's counties are shown as names, so "Kerry" or "Co. Kerry" → "KY".
6. **The import review and the Places editor show region and suburb only for IE/AU/NZ/CA.** Before this, the US review
   had no State column and the US Places editor had no State box. Adding them would break US byte-identity. The US state
   is still saved from the importer and the event form, as before.

**Your mid-task instruction (22 Oct):** "no changes for allergens need to be made for the demo". Item 6 of the brief
(demo writes `per_dish` where card-only is not allowed) was written, then **reverted**. `lib/provision-truck.ts` carries
no allergen change.

## Summary

- **Entry forms read the format.** One component, `components/manage/AddressFields.tsx`, renders the address part of:
  - Manage › Schedule › Add/Edit event;
  - the Places editor;
  - the import review's columns.

  What it takes from the config:
  - fields, order and required marks;
  - labels: `address.*` messages keyed by field type and variant;
  - examples;
  - the region dropdown;
  - the postal check and its tidy-up;
  - the "Customers see:" line.

  The following also follow the format:
  - Where you trade / signup (the town label);
  - the venue picker sublines;
  - the conflict detail line;
  - the guessed / no-location banners.
- **The State box no longer cuts "NSW" to "NS".** AU picks from a dropdown. The text box (US only) is as long as the
  list's longest code.
- **Columns:** `truck_events.suburb`, `truck_places.suburb` and `truck_places.region`.
  - The `trucks_base_region_code_chk` CHECK is replaced by an app-side check against the format's list.
  - Safe whether code or SQL comes first (§6).
- **Geocoding and Places** take the query and the mapping from the format. AU Places stores the **state**
  ("New South Wales" / "NSW"), not the council.
- **AI prompts** (`lib/schedule-extract.ts`, `lib/admin/screenshot-events.ts`) take every location rule from the config.
  - The `code !== 'GB'` and `zip_state` branches are gone.
  - GB and US prompts are **byte-identical**.
  - IE, AU, NZ and CA have their own rules.
- **Event conflicts:** a shared postcode means "same venue" only where `identifiesPremises` is true (GB, IE). Elsewhere
  the venue name must match too (§5).
- **GB and US are byte-identical** in forms, labels, saves, geocode queries, Places answers, prompts and the
  trade area. A harness compares 28 outputs against a capture of the code before this stage. The only named
  differences are the two US conflict results the brief asked to change (§5).
- **Proof:**
  - new harness `address-formats-2`: **89/89**;
  - tsc clean;
  - build passes;
  - **no new lint** in app code (409 → 409);
  - full sweep **154/154** (152 in the last full run; the other two were fixed and re-run, along with all 34 harnesses that use the changed module — §8);
  - re-pins named in §8;
  - 48 screenshots in `docs/address-formats-2/`.
- **Two things for you (§9):**
  - the scraper's US prompt has used the UK lines since address-formats-1's SQL ran;
  - AU, IE and NZ are `enabled = true` in the database.

## 1 · Read-only SQL (run)

```sql
select c.country_code, c.enabled, c.address_format, (select pg_get_constraintdef(oid) from pg_constraint where conname = 'country_settings_address_format_chk') as address_format_check, (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'country_settings' and column_name = 'allergen_card_only_allowed') as has_card_only_col from public.country_settings c order by c.country_code;
```

```sql
select table_name, column_name from information_schema.columns where table_schema = 'public' and ((table_name = 'truck_events' and column_name in ('suburb','region')) or (table_name = 'truck_places' and column_name in ('suburb','region'))) order by 1, 2;
```

Result: only `truck_events.region`. None of the three new columns exist yet.

```sql
select conname, pg_get_constraintdef(oid) as def from pg_constraint where conname = 'trucks_base_region_code_chk';
```

Result: `CHECK ((base_region_code ~ '^[A-Z]{2}$'::text))`.

```sql
select country_code, enabled, address_format, allergen_card_only_allowed from public.country_settings order by country_code;
```

Result:

| country | enabled | address_format | allergen_card_only_allowed |
|---|---|---|---|
| AU | **true** | au | true |
| GB | true | gb | true |
| IE | **true** | ie | false |
| NZ | **true** | nz | true |
| US | true | us | true |

The first query's rows are the same rows as the last one: address-formats-1's SQL has run, and the allergen column
exists.

## 2 · The config (`lib/address-formats.ts`)

New in each format:

| Part | What it is | GB / US | IE / AU / NZ / CA |
|---|---|---|---|
| `entry.customersSee` | "Customers see:" line under the form | off | on |
| `entry.postalCheck` | Live postal check (warns, never blocks) and the tidy on blur and save | off | on |
| `entry.requiredMarks` | Red asterisks on required fields | off | on |
| `entry.regionInput` | Region box | `text` (US: 2 chars) | `select` |
| `entry.sublines` | Picker and conflict subline | `legacy` (as before) | `area` (the format's area line) |
| `entry.reviewAndPlaces` | Region / suburb in the import review and the Places editor | off | on |
| `examples` | `venue`, `addressLine`, `locality`, `suburb`, `region`, `importPostalCode`, `paste` | GB "The Crown", "123 High St, Wickhambrook", "Wickhambrook", "CB22 5EJ"; US "Main Street Brewery", "123 Main St, Austin, TX 78701", "Austin", "NJ", "78701", "Zilker Park, Austin" (the old message branches' text) | the country's own |
| `places` | Town types, region levels (first present wins), region code `exact` / `match` / none | GB: locality + postal_town, level 2 then 1, no code. US: level 1, code exact | AU level 1, exact (NSW). IE level 1, match ("County Kerry" → KY). NZ none. CA exact |
| `ai.importer` / `ai.screenshot` | Every location rule in the two prompts | The prompts' own lines, moved verbatim | Written for each format |

**Locality variants.** A new variant, `area`, is GB/US's "Area (village, town or city)" (en-US "City or town"). Ireland
keeps `townOrArea` ("Town or area").

**Helpers:**
- `DEFAULT_ADDRESS_FORMAT = 'gb'`;
- `addressFormatOrDefault`, `fieldOf`, `postalLabelOf`, `fillAiText`.

**Removed:** `messagesStyle` and `messagesStyleOf`.

**The validator also checks:**
- the examples;
- each region example is in its own list;
- a Places region code has a list and a level;
- no AI rule is empty or holds `${` or a backtick.

**Messages.**
- A new `address` namespace holds:
  - the label variants;
  - the short labels;
  - the in-sentence forms and the forms with an article ("an Eircode");
  - the town words for Where you trade and signup;
  - "e.g. {example}", "Customers see:", the postal warning and "Choose…".
- The GB/US words moved from the `{style, select, zip_state …}` branches with identical text.
- Four sentences now take the word as a value:
  - the guessed banner;
  - the no-location banner;
  - the Places search placeholder;
  - the paste box (`{place}`).
- No `zip_state` remains in any message file.
- The namespace is added to the five surfaces whose pages reach the signup step or the forms
  (`lib/i18n/namespaces.ts`).

## 3 · Where each piece reads it

| Surface | file:line | Now |
|---|---|---|
| Add/Edit event address fields | `app/manage/[token]/page.tsx:10375` → `components/manage/AddressFields.tsx:129` | Fields, order, labels, examples, asterisks, region dropdown / text, live Eircode check, tidy on blur and save, "Customers see:" |
| Event save | `page.tsx` saveEdit | `region` only when the format has the field (checked against its list); `suburb` only when it has one; postal code tidied only where the format checks |
| Import review (cards and table) | `page.tsx:7781` | Region and suburb columns where `reviewAndPlaces`; labels and the postal example from the format |
| Import saves (Manage, setup wizard) | `page.tsx` saveExtractedEvents, schedSaveExtracted | Region normalised with the truck's format; suburb where the format has one |
| Places editor | `components/manage/SchedulePlaces.tsx` PlaceDetail | Labels from the format; suburb and region dropdown where `reviewAndPlaces`; postal check; "Customers see:" |
| Places list search box | SchedulePlaces | "Name, area or {postal}" |
| Venue picker sublines, conflict detail line, event card area line | `page.tsx` (`placeSubline`, `AddressFields.tsx:65`) | The format's area line where `sublines: 'area'`; GB/US unchanged |
| Guessed / no-location banners | `page.tsx` | The postal word by variant ("postcode", "ZIP code", "an Eircode") |
| Where you trade | `components/manage/WhereYouTrade.tsx` | Town label by variant (AU "Suburb") |
| Signup | `components/setup/WhereBasedStep.tsx`, `lib/signup-countries.ts` | "… you're based in" by the chosen country's variant; each signup country now carries `addressFormat` |
| Geocoder | `app/api/manage/geocode/route.ts:15`, client `geocodeLocation` | Query from `templates.geocode`. The client sends `addressFormat`, plus region and suburb when present |
| Places lookup | `lib/places.ts:80`, `/api/places/{suggest,details}` | Town types, region and region code from `places` |
| Trade area | `lib/trade-area.ts:69` | `base_region_code` kept only if it is exactly a code in the format's list (replaces the CHECK) |
| AI importer | `lib/schedule-extract.ts:100`, `lib/schedule-context.ts` | Rules from `ai.importer`. Date lines from the truck's date order. Parsed state checked against the format; a suburb parsed for NZ |
| AI screenshot | `lib/admin/screenshot-events.ts:128`, its route | Rules and JSON shape from `ai.screenshot`; parsed state checked against the chosen country's format |
| Inbound schedule bridge | `app/api/inbound-schedule/route.ts` | Region written where the format has a list, as the format's code |
| Event conflicts | `lib/event-conflicts.ts:95`, `page.tsx:8762` | Below |
| Manage route | `app/api/manage/route.ts:1331`, `:3612`, `:3742`, `:2040` | Event region with the truck's format; event suburb, place suburb and region, each in its own update; trade-area code split (§6) |

**Screenshots** (in `docs/address-formats-2/`):
- each of `ie`, `au`, `nz`, `ca`, `gb`, `us`;
- the form and the Places editor;
- at 390 and 1280;
- in WebKit and Chromium (`-chromium`).

The screenshot script types into the real component:
- IE: "d02x963" → **D02 X963**, Co. Kerry;
- AU: **NSW** chosen;
- NZ: suburb and town;
- CA: "m6j1a1" → M6J 1A1.

The dropdown is 41px, the same as the text boxes, in both engines. It is the app's shared `Select`, with a fixed height
because WebKit ignores `min-height` on a select.

## 4 · AI prompts

- **GB and US are byte-identical** to the capture: the importer (with and without text, and with no context) and the
  screenshot prompt (no country, GB, US).
- The US date lines ("MONTH first") come from the truck's date order, not the address format.

**IE / AU / NZ / CA:**

| Format | Rules | Output shape | Screenshot |
|---|---|---|---|
| IE | Eircode (7 characters, routing key, space, 4 characters; never a UK postcode); county in `state` | `"state":"Co. County","postcode":"EIRCODE"` | Eircode and county lines |
| AU | Suburb in `town` (not the council); state or territory as NSW/VIC/…; 4-digit postcode | `"town":"Suburb","state":"NSW"` | Same |
| NZ | Town or city in `town`, suburb in `suburb`; 4-digit postcode | `"suburb":"Suburb","town":"Town or city"` | Town or city only (the screenshot event has no suburb field) |
| CA | Two-letter province; A1A 1A1 postal code | `"state":"ON","postcode":"POSTAL CODE"` | Same |

- **Left as it is (as asked):** `scripts/scraper-prompts.js`. Its `buildHgPrompt` still branches on
  `addressFormat === 'zip_state'`. See §9, question 1.

## 5 · Event conflicts

- `detectEventConflicts(candidate, events, addressFormat)`.
- A shared postcode is "same venue" only when the format's `postalCode.identifiesPremises` is true (GB, IE). Otherwise
  the venue names must also match, using the scraper's comparison (`lib/venue-signature.ts`).
- With no format, the GB rule applies, as before.

| Case | Before | After |
|---|---|---|
| **US:** Pier A Park 12:00–14:00 vs Hoboken Farmers Market 17:00–21:00, both 07030 | `review` ("Same venue and date, different time") | **none** |
| **US:** Pier A Park 17:00–20:00 vs Hoboken Farmers Market 18:00–21:00, both 07030 | `review` | **`overlap`** (one van, two places) |
| **US:** Pier A Park vs Pier A Park, 07030, same times | `duplicate` | `duplicate` |
| **AU:** Bondi Pavilion 12:00–14:00 vs Bondi Farmers Market 17:00–21:00, both 2026 | `review` | **none** |
| **AU:** Bondi Pavilion vs Bondi Pavilion, 2026, same times | `duplicate` | `duplicate` |
| **IE:** The Swan vs People's Park, same Eircode V94 X2T6 | `review` | `review` (an Eircode is one premises) |
| **GB:** every case | | Identical (captured) |

## 6 · Columns and safety — NOT RUN SQL

**Run now** (before or after the deploy — both are safe). This is `supabase/migrations/20261030_address_suburb_region.sql`:

```sql
alter table public.truck_events add column if not exists suburb text;
alter table public.truck_places add column if not exists suburb text;
alter table public.truck_places add column if not exists region text;
alter table public.trucks drop constraint if exists trucks_base_region_code_chk;
```

**If the code is deployed first, nothing that works today can fail. Only the new values are lost until the SQL runs:**
- the event suburb and the place suburb/region are written in their **own** updates, after the main write. A failure is
  logged and the event or place still saves (the harness runs this against a database without the columns);
- the place suburb/region are read in a **separate probed read**. If it fails, the list loads as before, and the keys
  appear only when a place holds a value, so GB/US answers are unchanged;
- a region code the old CHECK would refuse ("NSW", Ireland's "D") is written **after** the main write, in its own update
  (`lib/trade-area.ts:92 splitRegionCodeWrite`). This applies to Where you trade, signup and provisioning. All US codes
  are two letters, so a US write is exactly what it was.

**Why this matters now:** AU, IE and NZ are already `enabled = true` (§1). An Australian signup before the SQL would
otherwise have failed on the CHECK.

**If the SQL runs first:** the old code never reads or writes the new columns. Dropping the CHECK only removes a limit
that the old code always satisfied.

## 7 · GB and US, byte for byte

`scripts/address-formats-2.cjs` captured 28 outputs from the code **before** this stage
(`scripts/fixtures/address-formats-2-before.json`). The current code gives the same answers for:
- the importer prompts (4) and screenshot prompts (3);
- the geocode prompt for GB/US, with and without country or postcode (4);
- the Places request and the stored details for GB/US (4);
- the trade area for GB/US and a bad "nj" code (4);
- the Places editor HTML for GB/US (2);
- every conflict case except the two US ones in §5.

The language harnesses render every GB/US Manage view against their frozen catalogues and pass. These include the
Schedule tab, the Add/Edit form, the import review, the Places pane, the banners, signup and Where you trade.

**Small differences, all invisible to customers:**
- the geocode **request body** to our own route gains `addressFormat` (the query sent to Gemini is identical);
- each signup country in the page data gains `addressFormat`;
- a US state typed as garbage ("XX") is no longer saved (the old rule kept any two letters);
- the geocode query trims stray spaces inside a part.

## 8 · Proof and named re-pins

- **New:** `scripts/address-formats-2.cjs` + `scripts/_address-formats-2-after.cjs` — **89/89**. It covers:
  - the config;
  - GB/US against the capture;
  - the IE/AU/NZ/CA forms;
  - "NSW" round-trip;
  - "d02x963" → "D02 X963" and the warning;
  - AU Places stores the state, and IE "County Kerry" → KY;
  - the geocode queries;
  - the prompts and the parsed states;
  - conflicts;
  - the write paths after **and before** the SQL (a fake database without the columns and with the old CHECK);
  - the signup format.
- **Screenshots:** `scripts/address-formats-2-screens.cjs` (needs a build; listed under `needs_a_browser`).
- tsc clean.
- `next build` passes.
- No new lint: the changed `.ts`/`.tsx` files have 409 findings before and after, none new by rule. The new `.cjs`
  harnesses add only `require()`-style findings, like every harness script.
- **Full sweep:** **154/154**.
  - The last full run passed 152. The other two (language-phase-0 and 1a) failed on my frozen-catalogue overlay: their
    frozen en-US must be empty.
  - Fixed: the overlay applies to en-US only when a run has a frozen en-US file.
  - Then both passed, and so did every one of the 34 harnesses that use the frozen catalogues or the language checks.
  - The runner still warns about 12 helper files that are in neither list. They were there before this stage; this
    stage's files are all registered.

**Re-pinned for this change only**, each marked `⚠️ RE-PINNED (address-formats-2, 21 October 2026)`:

| Harness (file) | Why |
|---|---|
| address-formats-1 (`_address-formats-1-after.cjs`) | GB's AI lines live in the config's `ai` slots; `messagesStyleOf` is replaced by the postal label variant |
| ireland-1 | Ireland's prompt is asked with its key `ie` and carries its Eircode rules |
| outreach-schema-census | `truck_places` declares 28 columns (+ suburb, region) |
| places-tab, weekly-post | The Places editor's Area / Postcode labels are the format's (`w.localityShort`, `w.postal`) |
| schedules-country-parity | The geocoder body carries the format; the route builds from the template |
| us-rehearsal-fixes | The event form sends `region` where the format has the field |
| screenshot-truck-details (+ `fixtures/address-formats-2-named-lines.json`) | The lines this stage changed in the two prompt modules and the bridge, named, with expiry |
| schedule-graphics-places | Field words, address examples, geocoder body, `EditingEvent` type and four replaced page lines |
| us-readiness (`_us-readiness-us.cjs`) | Placeholders from the format's examples |
| language-phase-1c (`_lp1c-setup.cjs`) | Signup countries carry `addressFormat` (set aside; the step views are identical) |
| language-phase-1d (`_lp1d-copy.cjs`) | The address example adapters read the format |
| language-phase-1e (`_lp1e-checks.cjs`) | The rewordings recorded here show at their new text in frozen catalogues |
| messages-parity (`_messages-parity-1e.cjs`) | The new variants' words are named (Eircode, Suburb, Province, State or territory) |
| shared: `_lp2-frozen.cjs` + `fixtures/address-formats-2-messages.json` | This stage's message changes as a fifth recorded stage (as Stage A / A2 / B / tidy). Frozen catalogues show its four reworded sentences and the en-US `address.label.area` at their new text, because their arguments changed with the code |

**Real code fix found by the sweep:** `lib/i18n/namespaces.ts` now includes `address` for order, dashboard, KDS, manage
and setup (their demo signup step reads it).

## 9 · Questions for you

1. **The scraper's US prompt.** `scripts/run-scraper.js:1893` reads `country_settings.address_format` and passes it to
   `buildHgPrompt` (`scripts/scraper-prompts.js:86`), which only knows `'zip_state'`. Since address-formats-1's SQL set
   the US row to `'us'`, **live US trucks get the UK prompt lines** ("UK place-name" rules, postcode output, no state).
   You asked me to leave this file alone, so I have. The smallest fix is one line:
   `if (addressFormat === 'zip_state' || addressFormat === 'us')`. Should I make it (or move it onto the config) in the
   next workstream?
2. **AU, IE and NZ are switched on** (`enabled = true`). My notes said Ireland was switched off with no trucks. Is
   that intended? It matters for the SQL order above (§6 makes it safe either way).

## Files

- **App:**
  - `lib/address-formats.ts`, `components/manage/AddressFields.tsx` (new);
  - `app/manage/[token]/page.tsx`, `components/manage/SchedulePlaces.tsx`, `components/manage/WhereYouTrade.tsx`,
    `components/setup/WhereBasedStep.tsx`;
  - `app/api/manage/route.ts`, `app/api/manage/geocode/route.ts`, `app/api/places/{suggest,details}/route.ts`,
    `app/api/inbound-schedule/route.ts`, `app/api/admin/screenshot-events/route.ts`;
  - `lib/schedule-extract.ts`, `lib/schedule-context.ts`, `lib/admin/screenshot-events.ts`, `lib/event-conflicts.ts`,
    `lib/event-address.ts`, `lib/places.ts`, `lib/trade-area.ts`, `lib/provision-truck.ts` (region-code split only),
    `lib/copy/addressPlaceholders.ts`, `lib/signup-countries.ts`, `lib/signup-country-types.ts`,
    `lib/i18n/namespaces.ts`;
  - `messages/en-GB.json`, `messages/en-US.json` (and the generated `messages/ns/*`, `lib/i18n/catalog/address.ts`).
- **SQL (NOT RUN):** `supabase/migrations/20261030_address_suburb_region.sql`.
- **Harnesses:** above, plus `scripts/harnesses.json` (registered).

## Follow-up (22 October 2026): your answers to §9

**1 · The scraper now takes its location lines from the config.** Nothing is pushed: the scrape workflows run from
GitHub, so live US scrapes keep the UK lines until this is deployed.

- **What changed:**
  - `scripts/scraper-prompts.js` imports `lib/address-formats.ts` directly.
  - `buildHgPrompt` takes the VENUE RULES line, the TOWN RULES block, the examples and the output's location keys
    from the format's new **`ai.scraper`** rules.
  - No format value or country code is named in its code. The default is `DEFAULT_ADDRESS_FORMAT`.
  - A legacy value (`postcode`, `zip_state`) still maps through the config, and anything unknown is GB, as before.
  - `scripts/run-scraper.js` is unchanged. Its fallback when the settings read fails is still `'postcode'`, which the
    config reads as GB.
- **The clean import works, so the one-line fallback wasn't needed.**
  - Node strips the TypeScript itself (on by default from Node 22.18).
  - The config has no imports, so nothing else needs resolving.
  - It loads with no warning on Node 22.22 here. Both scrape workflows run Node 24.
- **Why a new `ai.scraper` slot, and not the existing `ai` rules:** `importer` and `screenshot` hold the lines of two
  other prompts. The scraper's GB lines are different (the pub-name rule, the Cavendish examples), so GB couldn't stay
  byte-identical built from those. GB's and US's scraper lines moved into the config verbatim, extracted by script
  from the old file.
- **IE, AU, NZ and CA get their own scraper rules** (new text; before this they got the UK lines):
  - IE: Eircode, county;
  - AU: suburb, not the council; state as NSW…;
  - NZ: town or city, not the suburb;
  - CA: province.

  Each asks only for keys the scraper sends on to the bridge: `town`, `state` (as the event's region) and
  `postcode`. NZ isn't asked for a suburb, because the scraper doesn't send one.
- **The one other difference:** the month-first line now follows the truck's date order rather than the `zip_state`
  branch. Only the US is `mdy` (read-only SQL below), so no live prompt changes except the US fix.
- **Proof:** `scripts/scraper-prompts-format.cjs` passes **49/49**. It compares against
  `scripts/fixtures/scraper-prompts-before.json`: 20 prompts from the file at `7fcd4fc9`, written once by
  `scripts/_scraper-prompts-capture.mjs` (listed under `fixture_generators`). It shows:
  - **GB is byte-identical:** for `postcode`, `gb`, no format and an unknown value.
  - **US:** `us` gives exactly what `zip_state` built before address-formats-1's SQL ran, in both date orders. The
    legacy value still does too.
  - **The bug:** the prompt the live US row got after the SQL was byte for byte GB's.
  - **The other formats:** each carries its own lines and none of the UK's. Everything outside the location lines is
    GB's prompt unchanged.
  - **The validator** covers the new slot.
  - **Controls:** a one-character change to GB's rule fails 8 checks. Putting the old `zip_state` branch back fails 12.
- **Re-pin:** `_address-formats-2-after.cjs` now includes `scripts/scraper-prompts.js` in its "no country-code or
  legacy-style branch" list.
- **Checks:**
  - related harnesses: address-formats-1 53/53, address-formats-2 89/89, schedules-country-parity 73/73,
    scraper-invented-village 27/27, ireland-1 55/55;
  - `tsc` passes, and so does the build;
  - lint is unchanged at 2,445 errors and 378 warnings, and no file has more errors than before;
  - full sweep **156 run · 156 passed · 0 failed**.
- **Read-only SQL (run):** `select country_code, enabled, address_format, date_order from public.country_settings
  order by country_code;`

  | country | enabled | address_format | date_order |
  |---|---|---|---|
  | AU | true | au | dmy |
  | GB | true | gb | dmy |
  | IE | true | ie | dmy |
  | NZ | true | nz | dmy |
  | US | true | us | mdy |

**2 · AU, IE and NZ switched on: intended** (you switched them on on 21 Oct so search engines can start indexing).
Nothing to change. §6's SQL is safe in either order, as it says.

My ireland-3 report had wrongly said "Ireland is still OFF", and had doubted the allergen column was there. I've
corrected both in `docs/ireland-3-report.md` (a dated note at the top and the two lines).

**Files:**
- `lib/address-formats.ts`: the `ai.scraper` slot, six formats' rules, and the validator.
- `scripts/scraper-prompts.js`.
- `scripts/scraper-prompts-format.cjs`, `scripts/_scraper-prompts-capture.mjs`,
  `scripts/fixtures/scraper-prompts-before.json` (all new).
- `scripts/_address-formats-2-after.cjs`, `scripts/harnesses.json`.
- `docs/ireland-3-report.md` (the corrections).

## Undo (only if Dominic asks)

Only if the SQL has run and needs reversing. Drop the columns only if nothing written to them is wanted. Re-adding the
CHECK fails if any truck has a code other than two capital letters (for example "NSW").

```sql
alter table public.truck_events drop column if exists suburb;
alter table public.truck_places drop column if exists suburb;
alter table public.truck_places drop column if exists region;
alter table public.trucks add constraint trucks_base_region_code_chk check (base_region_code ~ '^[A-Z]{2}$');
```
