# address-formats-1 — one backend config of address formats, and every display reads it

**Date:** 21 October 2026. **Branch:** `main` (uncommitted, on top of `fcde8b09`). Nothing pushed or deployed. No
database change was run: the SQL in §6 is **NOT RUN**.

**The prompt** arrived intact; nothing was garbled and nothing contradicted. Six points where I had to make a call are
listed under "Points to know" below; none needed to stop the work.

## Summary

- **The config: `lib/address-formats.ts`.**
  - It holds six formats (`gb`, `us`, `ie`, `au`, `nz`, `ca`). Each one has:
    - ordered fields, required or optional;
    - a label variant per field;
    - an inline region list where the country uses one: US 51, Ireland 26 counties, Australia 8, Canada 13;
    - a postal pattern, a named normaliser, an example and `identifiesPremises`;
    - line, area, calendar and geocode templates;
    - the Places mapping;
    - the AI rules (GB's are today's prompt lines, verbatim);
    - the `messagesStyle` the existing words select on until stage 2.
  - A validator, lookups and a small template renderer sit beside it. Like `lib/currencies.ts`, it is pure,
    client-safe and the one place this lives. **No country code appears in it.**
- **The country row.** `country_settings.address_format` now holds a config key.
  - **The loader accepts both kinds of value:** the six keys, and the two legacy values (`postcode` → gb,
    `zip_state` → us). So this deploys safely before the SQL runs.
  - **An unknown value is refused like an unusable currency:** it's left out of every list, named in Admin ›
    Countries' red notice, and a direct read throws.
  - **Admin › Countries' "Addresses" is a dropdown of the config's formats:** "United Kingdom — postcode",
    "United States — city, state, ZIP code", "Ireland — Eircode", "Australia — suburb, state, postcode",
    "New Zealand — suburb, city, postcode", "Canada — city, province, postal code".
  - **The SQL** (NOT RUN, "run after deploy") maps GB→gb, US→us, IE→ie, AU→au, NZ→nz and makes the CHECK exactly
    the config's keys. The harness proves the CHECK lists exactly the keys.
- **Every display surface reads the format:**
  - emails: confirmation, ready, operator new-order (HTML and text) and event cancelled;
  - event cards: order chooser, truck page, embed, and Manage's Add-event preview;
  - Manage's schedule card line;
  - the calendar location;
  - WhatsApp prompt lines.

  `/api/events`, `/api/embed/events` and `/api/discovery/events` now carry each event's `addressFormat`. Each event's
  region is read in that format's own list, so **NSW, VIC and "Co. Kerry" survive** and junk is dropped.
  `addressStyleOf` is retired.
- **GB and US are byte-identical.** 113 GB/US outputs (formatter lines, card HTML, four emails, calendar lines,
  WhatsApp prompt lines, the Add-event preview) equal a **snapshot taken from the code before this stage**, captured
  before any edit. A mutation test shows the check fails when a template changes.
- **The fixture lines all render as asked:**
  - "People's Park, Limerick, V94 X2T6";
  - "Bondi Pavilion, Bondi Beach NSW 2026";
  - "Western Park, Ponsonby, Auckland 1011";
  - "Trinity Bellwoods Park, Toronto, ON M5V 3L9".

  They show in emails and on cards, plus "…, Listowel, Co. Kerry, …" and "Federation Square, Melbourne VIC 3000"
  (from "victoria").
- **Proof:**
  - new harness `address-formats-1`: **53/53**;
  - tsc clean;
  - build passes;
  - **no new lint findings**;
  - full sweep **152/152**;
  - **10 harness files re-pinned by name** for the approved change (§5).

### Points to know

1. **NZ suburbs aren't stored anywhere yet.** No column holds a suburb (stage 3 adds one). The NZ format, the
   formatter and the fixture line support it, so a caller that has a suburb gets "…, Ponsonby, Auckland 1011". Today's
   events still write one town.
2. **Ireland's county shows on the line only when one is given:** "People's Park, Limerick, V94 X2T6" without,
   "…, Listowel, Co. Kerry, V31 F2K4" with. The diagnosis §2.3 had no county in the IE line; I added it so that
   "Co. Kerry" displays, as the brief asks.
3. **Three US lines keep today's behaviour exactly**, because "no visible change for GB or US" decides it. Each is
   recorded in the config or at the call, ready to change on purpose:
   - **the calendar line has no state today**, so the US `calendar` template has none (a comment marks where to add
     it);
   - **Manage's schedule card and the Add-event preview pass no state** (stage 2 moves the form that saves it);
   - **WhatsApp prompt lines carry no state**, because the select never read the column.
4. **Canada's `messagesStyle` is `zip_state`** until stage 2 moves the labels. So a Canadian form would say "State" /
   "ZIP code": the closer of the two shapes, because it has a province field. Canada has no country row, so nothing
   shows this.
5. **Admin › Countries saves between the deploy and the SQL.** A save writes the format key (e.g. "gb"), which the
   live CHECK still refuses. The save fails with a CHECK error and changes nothing. §6 gives an optional "run now"
   step that widens the CHECK first, which closes that window.
6. **Write paths keep the old region rule until stage 2.** `normaliseRegion` with no format is the old rule (two
   letters, upper-cased). Manage's save, the importer saves and the inbound bridge still call it that way. With a
   format it reads that format's list, which the displays and the feeds now do.

---

## 1 · The config (`lib/address-formats.ts`)

| | gb | us | ie | au | nz | ca |
|---|---|---|---|---|---|---|
| Admin label | United Kingdom — postcode | United States — city, state, ZIP code | Ireland — Eircode | Australia — suburb, state, postcode | New Zealand — suburb, city, postcode | Canada — city, province, postal code |
| Fields (`*` required) | street, locality* (townOrArea), postalCode (postcode) | street, locality* (townOrArea), region (state), postalCode (zip) | street, locality* (townOrArea), region (county), postalCode (eircode) | street, locality* (suburb), region* (stateTerritory), postalCode* (postcode) | street, suburb (suburb), locality* (townOrCity), postalCode (postcode) | street, locality* (city), region* (province), postalCode (postalCode) |
| Regions | — | 50 states + DC, shown as code | 26 counties (ISO codes without "IE-"), shown as name "Co. Kerry", typed as code, "Kerry" or "County Kerry" | NSW VIC QLD SA WA TAS NT ACT, code | — | AB BC MB NB NL NS NT NU ON PE QC SK YT, code |
| Pattern | `^([A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}\|GIR 0AA)$` | `^\d{5}(-\d{4})?$` | `^([AC-FHKNPRTV-Y]\d{2}\|D6W) [0-9AC-FHKNPRTV-Y]{4}$` | `^\d{4}$` | `^\d{4}$` | `^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] \d[ABCEGHJ-NPRSTV-Z]\d$` |
| Normaliser · example | gb · CB8 8PD | zip · 78701 | eircode · D02 X963 | digits · 2026 | digits · 1011 | ca · M5V 3L9 |
| Postcode = one premises | yes | no | yes | no | no | no |
| `line` | venue, locality, postalCode | venue, locality, region postalCode | venue, locality, region, postalCode | venue, locality region postalCode | venue, suburb, locality postalCode | venue, locality, region postalCode |
| `area` (first that fits) | locality · postalCode | [region needed] locality, region postalCode → locality · postalCode | locality · postalCode | locality region postalCode | suburb, locality postalCode | locality, region postalCode |
| `calendar` | = line | venue, locality, postalCode (today's, no state) | = line | = line | = line | = line |
| Places | locality, postal_town · admin level 2, long | locality, postal_town · level 1, short | locality, postal_town · level 1, long | locality · level 1, short | locality, sublocality_level_1 · none | locality · level 1, short |
| `messagesStyle` | postcode | zip_state | postcode | postcode | postcode | zip_state |

**Helpers:**
- **lookups:** `ADDRESS_FORMAT_KEYS`, `addressFormatKeyOf` / `addressFormatOf` (keys and legacy values);
  `messagesStyleOf`;
- **regions:** `regionOf` / `regionDisplay` (code, name or alias, any case);
- **postal codes:** `normalisePostalCode`, `isValidPostalCode`;
- **templates:** `renderTemplate` / `renderFirst`. A part whose tokens are all empty is dropped, and spaces collapse.
  That is exactly the old `filter(Boolean).join` behaviour.
- **`validateAddressFormats`:** checks that patterns compile and match their example, tokens exist and have a field,
  a region field has a list (and the reverse), and regions are unique and well formed.
  - The harness proves it catches a broken pattern and an unknown token.
  - Writing that test exposed a crash: the validator threw on a bad pattern instead of reporting it. Now fixed.

**GB's AI lines** (`ai.importerPostalRules`, `ai.screenshotLocationLines`) are today's lines from
`lib/schedule-extract.ts` and `lib/admin/screenshot-events.ts`, verbatim. The harness checks both files still contain
them. The prompts don't read the config until stage 2.

## 2 · The country row

| Where | Change |
|---|---|
| `lib/country-settings-types.ts` | `addressFormat: AddressFormatKey` |
| `lib/country-settings.ts` `mapCountryRow` | Accepts the keys and the two legacy values, and maps the legacy ones. Anything else throws, so `readAllCountryRows` skips the row and Admin › Countries names it (the currency-registry path, unchanged) |
| `lib/country-settings.ts` | New `addressFormatForTruck(truck)`: never throws; undefined keeps every line as before |
| `components/admin/CountriesTab.tsx` | "Addresses" lists `ADDRESS_FORMAT_KEYS` with their admin labels |
| `lib/admin/country-form.ts` | The form holds a key and refuses anything else. `rowToForm` reads a legacy value as its key, as the loader does |
| `lib/copy/addressPlaceholders.ts` | **`addressStyleOf` is retired.** Its callers (Manage, SchedulePlaces) use `messagesStyleOf(format)`, which gives the same `{style}` for GB and US. `upperCasesPostcode` / `pasteExampleValues` take that style |
| Stage-2 paths moved onto `messagesStyleOf`, behaviour unchanged | `lib/trade-area.ts`, `lib/schedule-context.ts`, `app/api/places/details/route.ts`, `app/api/admin/screenshot-events/route.ts`, `app/api/inbound-schedule/route.ts` |

## 3 · Display surfaces that now read the format

| Surface | Where | How |
|---|---|---|
| The formatter | `lib/event-address.ts` | `eventAddressLine` (line), `eventAreaLine` (the whole card line), `eventCalendarLine`, `normaliseRegion(v, format)`. **With no format, each keeps its old code verbatim** (the legacy path). `eventAreaLineWithRegion` is unchanged |
| Region read | `lib/event-region-read.ts` | `readEventRegions(…, format)`: one format, or one per event. A region is kept when it's in that format's list, as its code |
| Confirmation / ready email | `lib/email.ts:382` | `eventAddressLine(…, params.addressFormat)` |
| Operator new-order email | `lib/email.ts:597` (HTML), `:617` (text, no postcode as before) | Same, with `addressFormat` |
| Event cancelled email | `lib/email.ts:948` | Same |
| Email callers | `app/api/orders/submit/route.ts` ×2, `lib/payments/promote-draft.ts` ×2, `app/api/dashboard/action/route.ts` ×5, `app/api/events/action/route.ts` ×1 | Pass `addressFormat: await addressFormatForTruck(truck)` and read the region in it |
| Event card | `components/TruckListCard.tsx:146-149` | `eventAreaLine(…, event.addressFormat)` |
| Order chooser | `app/trucks/[slug]/order/page.tsx` (`EventData`, `eventToVillage`) | Carries `addressFormat` from `/api/events` |
| Feeds | `app/api/events/route.ts`, `app/api/embed/events/route.ts`, `app/api/discovery/events/route.ts` | Each event gains `addressFormat` (its truck's format; scraped rows take Village Foodie's country's), and regions are read in it |
| Calendar location | `lib/utils.ts` `getFullLocation` | `eventCalendarLine(…, event.addressFormat)` |
| WhatsApp prompts | `lib/whatsapp-classifier.ts` `formatEventForPrompt`; callers `app/api/manage/whatsapp-preview/route.ts`, `app/api/webhooks/whatsapp/route.ts`, `app/api/webhooks/meta/whatsapp/route.ts` | The format's line (no state: the select has none). Callers pass `addressFormatForTruck(truck)` |
| Add-event preview | `lib/schedule-graphics/event-preview.ts`; `app/manage/[token]/page.tsx` | The preview event carries the format |
| Manage › Schedule card, line 2 | `app/manage/[token]/page.tsx` (≈8803) | `eventAreaLine({ town, postcode }, tabSettings.addressFormat)`. No state yet; GB/US identical |
| Types | `types.ts` `VillageEvent.addressFormat` | — |

**Display surfaces left as they are, because they print no postcode or region** (venue or town only, the same in
every format):
- the KDS / dashboard venue line, `lib/event-display.ts` `fmtVenue`, "Venue — Town" (6 sites);
- posters and captions: `lib/weekly-post/week-data.ts` `townLine`, `locale.ts` `joinNameTown`, `caption.ts`;
- the inbound-schedule operator email's "venue, town" (`app/api/inbound-schedule/route.ts:315, 339`);
- the CSV export.

## 4 · Not touched: next stage (listed as asked)

- **Entry forms:**
  - Manage › Schedule Add/Edit event fields (`app/manage/[token]/page.tsx` ≈10290-10307, including the State box that
    cuts "NSW" to "NS");
  - the import review (≈9505-9718);
  - the places editor (`components/manage/SchedulePlaces.tsx`);
  - Where you trade / signup (`components/setup/WhereBasedStep.tsx`, `lib/trade-area.ts`);
  - the venue picker sublines;
  - the conflict detail line (≈9011);
  - the guessed / no-location banners.
- **Geocoding and Places:** `app/api/manage/geocode/route.ts`, `lib/places.ts` (still the `messagesStyle` mapping),
  and the Manage geocode calls.
- **AI prompts:** `lib/schedule-extract.ts` (and its `code !== 'GB'` branch), `lib/admin/screenshot-events.ts`
  (likewise), `scripts/scraper-prompts.js`.
- **Event conflicts:** `lib/event-conflicts.ts` (postcode = venue; `identifiesPremises` is ready for it).
- **Write paths' region rule:** `app/api/manage/route.ts:1323`, `app/api/inbound-schedule/route.ts:137`, Manage's
  import saves.
- **Village Foodie and the scraper** (GB-only by design): `scripts/run-scraper.js`, `scripts/geo-validate.js`,
  `lib/discovery-gate.ts`, `lib/venue-matcher.ts`, the venue pages, the postcode search, the directions link (which
  builds its own text, `lib/maps-links.ts`).
- **Columns:** `suburb` (events, places), `truck_places.region`, and the `trucks.base_region_code` 2-letter CHECK.

## 5 · Proof

- **`scripts/address-formats-1.cjs`** (registered; 152 harnesses), with `scripts/_address-formats-1-after.cjs`:
  **53/53**.
  - **§1 the config:**
    - six keys;
    - the validator is clean and can fail;
    - the region counts;
    - the normalisers and patterns;
    - premises only in GB and Ireland;
    - GB's AI lines verbatim;
    - no country-code comparisons.
  - **§2 the country row:**
    - the migration's CHECK equals the keys in order;
    - it maps before it constrains;
    - the loader reads both legacy values and every key, and refuses unknown values;
    - the `{style}` per format;
    - the Admin dropdown and form;
    - `addressStyleOf` retired.
  - **§3 GB and US byte-identical:**
    - 113 outputs compared with `scripts/fixtures/address-formats-1-before.json`, written by
      `node scripts/address-formats-1.cjs --capture` against the code before any edit of this stage (21 Oct);
    - plus Manage's schedule line (13 GB/US inputs).
    - The Add-event preview's event object gains one key (`addressFormat`); its card HTML is compared byte for byte.
  - **§4 IE/AU/NZ/CA:**
    - the fixture lines;
    - regions from each format's list (NSW, "victoria" → VIC, "Kerry" → "Co. Kerry"; NSW refused by the US format);
    - junk dropped;
    - the legacy rule without a format;
    - the card and email renders;
    - a card with no format keeps the old rule.
  - **§5 the feeds:** `/api/events`, `/api/embed/events` and `/api/discovery/events` carry the right key per truck,
    keep "NSW" and drop "XYZ".
- **Mutation test:** changing the shared " · " separator to " - " turned §3 (cards, preview) and §4 red. Restored,
  53/53.
- **tsc:** exit 0.
- **Build:** `next build` exit 0, no errors.
- **Lint** (ESLint counts against HEAD, all 32 changed product files):
  - every file matches HEAD;
  - `lib/address-formats.ts` (new) is 0/0;
  - the two findings this stage first added (an unused parameter, one `any`) were removed.
- **Full sweep:** `node scripts/run-harnesses.cjs` → **152 run · 152 passed · 0 failed** on the final tree. The first run, before the re-pins, had exactly the 10 listed in the next bullet failing.
- **Re-pins.** Each is marked `⚠️ RE-PINNED (address-formats-1, 21 October 2026)` and covers only this approved
  change:
  - **`countries-api`:**
    - the store holds rows as the loader returns them (legacy → key);
    - its CHECK mirror is the migration's keys.
  - **`us-readiness`** (`_us-readiness-us.cjs`): `addressStyleOf` → `messagesStyleOf` (same answers), and the
    page-source check names the new line.
  - **`language-phase-1d`** (`_lp1d-copy.cjs`, `_lp1d-named.cjs`):
    - the retired helper's rule is inlined;
    - three named changes (`address-formats-1-country-key`, `-events-format-gb`, `-events-format-us`) via the new
      shared `scripts/_lp-address-formats-1.cjs`.
  - **`language-phase-1d2`:**
    - the two `addressStyleOf` smoke views are named removals: they must be absent;
    - `address-formats-1-country-key-2`.
  - **`event-types`:** `lib/address-formats.ts` joins its compile list (a leaf imported by the types file).
  - **`screenshot-truck-details`:** the inbound bridge's "seventh build", with the import and the one replaced line
    (old form in `TOLERATED_REMOVED`).
  - **`schedule-graphics-places`:**
    - the schedule card's old line 2 is in the "lost line" allowlist;
    - the preview call's pinned form gains `addressFormat`.
  - **`us-rehearsal-fixes`:**
    - the card anchors are the new lines;
    - the email-caller regexes allow the format argument;
    - the feed comparisons set `addressFormat` aside;
    - a new check requires "gb"/"us".
  - **`schedules-country-parity`:** the VF feed comparison sets `addressFormat` aside and requires "gb".
  - **`phase3-screens`** needed no edit: its two failures came from the form, fixed by `rowToForm`.

## 6 · SQL

**Read-only, run for this workstream:**

```sql
select c.country_code, c.enabled, c.address_format, (select pg_get_constraintdef(oid) from pg_constraint where conname = 'country_settings_address_format_chk') as address_format_check from public.country_settings c order by c.country_code;
```

It returned AU / GB / IE / NZ `postcode`, US `zip_state`; GB and US switched on; the CHECK is
`address_format = ANY (ARRAY['postcode', 'zip_state'])`.

**Optional, NOT RUN — "run now"** (before the deploy; closes the Admin-save window in point 5). It only widens what a
row may hold, every row passes, and the old code is unaffected because no value changes:

```sql
-- NOT RUN — optional, "run now". Lets both the legacy values and the new keys through until the after-deploy SQL tightens it.
begin;
alter table public.country_settings drop constraint if exists country_settings_address_format_chk;
alter table public.country_settings add constraint country_settings_address_format_chk
  check (address_format in ('postcode', 'zip_state', 'gb', 'us', 'ie', 'au', 'nz', 'ca'));
commit;
```

**NOT RUN — "run AFTER deploy"** (`supabase/migrations/20261028_address_formats.sql`). The live loader refuses any
other value, so this must not run first:

```sql
-- 20261028_address_formats.sql — address-formats-1 (21 October 2026; docs/address-formats-1-report.md).
begin;

alter table public.country_settings drop constraint if exists country_settings_address_format_chk;

update public.country_settings set address_format = 'gb', updated_at = now(), updated_by = 'address-formats-1'
  where country_code = 'GB' and address_format = 'postcode';
update public.country_settings set address_format = 'us', updated_at = now(), updated_by = 'address-formats-1'
  where country_code = 'US' and address_format = 'zip_state';
update public.country_settings set address_format = 'ie', updated_at = now(), updated_by = 'address-formats-1'
  where country_code = 'IE' and address_format = 'postcode';
update public.country_settings set address_format = 'au', updated_at = now(), updated_by = 'address-formats-1'
  where country_code = 'AU' and address_format = 'postcode';
update public.country_settings set address_format = 'nz', updated_at = now(), updated_by = 'address-formats-1'
  where country_code = 'NZ' and address_format = 'postcode';

alter table public.country_settings add constraint country_settings_address_format_chk
  check (address_format in ('gb', 'us', 'ie', 'au', 'nz', 'ca'));

commit;

-- verify — after the commit: every row on a key, none left on a legacy value
select country_code, enabled, address_format, updated_by from public.country_settings order by country_code;
```

**After it runs:**
- **IE, AU and NZ** (all switched off) start using their own formats.
- **GB and US** keep identical output; only the stored value changes.

**Deploy order:** (optional "run now" block) → deploy → the after-deploy block.

## 7 · Files

- **New:**
  - `lib/address-formats.ts`
  - `supabase/migrations/20261028_address_formats.sql`
  - `scripts/address-formats-1.cjs`, `scripts/_address-formats-1-after.cjs`
  - `scripts/fixtures/address-formats-1-before.json`
  - `scripts/_lp-address-formats-1.cjs`
- **Changed (product):**
  - `lib/event-address.ts`, `lib/event-region-read.ts`
  - `lib/country-settings.ts`, `lib/country-settings-types.ts`
  - `lib/copy/addressPlaceholders.ts`, `lib/schedule-context.ts`, `lib/trade-area.ts`
  - `lib/admin/country-form.ts`, `components/admin/CountriesTab.tsx`
  - `lib/email.ts`, `lib/utils.ts`
  - `lib/whatsapp-classifier.ts`, `lib/schedule-graphics/event-preview.ts`
  - `lib/payments/promote-draft.ts`
  - `components/TruckListCard.tsx`, `components/manage/SchedulePlaces.tsx`
  - `types.ts`
  - `app/manage/[token]/page.tsx`, `app/trucks/[slug]/order/page.tsx`
  - API routes:
    - `app/api/events/route.ts`, `app/api/embed/events/route.ts`, `app/api/discovery/events/route.ts`
    - `app/api/orders/submit/route.ts`, `app/api/dashboard/action/route.ts`, `app/api/events/action/route.ts`
    - `app/api/inbound-schedule/route.ts`, `app/api/places/details/route.ts`, `app/api/admin/screenshot-events/route.ts`
    - `app/api/manage/whatsapp-preview/route.ts`, `app/api/webhooks/whatsapp/route.ts`,
      `app/api/webhooks/meta/whatsapp/route.ts`
- **Changed (harnesses):**
  - `scripts/harnesses.json` (+1)
  - the re-pins in §5: `countries-api.cjs`, `_us-readiness-us.cjs`, `_lp1d-copy.cjs`, `_lp1d-named.cjs`,
    `language-phase-1d2.cjs`, `_lp1d2-named.cjs`, `event-types.cjs`, `screenshot-truck-details.cjs`,
    `schedule-graphics-places.cjs`, `us-rehearsal-fixes.cjs`, `schedules-country-parity.cjs`

## Undo (only if Dominic asks)

- **New files:** delete them (§7).
- **Product and harness files:** many also carry other uncommitted workstreams (currency-registry, ai-search-1,
  directions-link-fix, ireland-2). So revert only this stage's hunks, each marked `address-formats-1`. Don't check
  those files out.
- **The SQL, if it has run:** map back and restore the old CHECK.

  ```sql
  begin;
  alter table public.country_settings drop constraint if exists country_settings_address_format_chk;
  update public.country_settings set address_format = 'postcode' where address_format in ('gb', 'ie', 'au', 'nz');
  update public.country_settings set address_format = 'zip_state' where address_format in ('us', 'ca');
  alter table public.country_settings add constraint country_settings_address_format_chk check (address_format in ('postcode', 'zip_state'));
  commit;
  ```
