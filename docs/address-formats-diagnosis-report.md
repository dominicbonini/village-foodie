# address-formats-diagnosis — every address surface, a per-country address format in data, allergen display modes, and trader details

**Date:** 21 October 2026. **READ-ONLY.** No code, config or data was changed; the only file written is this report.
**Branch:** `main` (HEAD `fcde8b09`, with the uncommitted work of earlier workstreams).

**The prompt** arrived intact. Nothing was garbled and nothing contradicted.

**Changed since this morning (read-only check, 21 Oct):**
- AU and NZ `country_settings` rows now exist, both switched off.
- `country_settings_allergen_set_chk` now allows `anz`.
- So anz-1 blocks A and B have been run since manual V16.3 recorded them as not run. §82.2 and §49 of the manual
  should say so at the next manual update. Not edited here, because this workstream is read-only.

## Summary

1. **Address surfaces (§1).** About 90 places read, write, label, validate, geocode, format or print an address. They
   assume one of two shapes:
   - **`postcode`** (GB: a free street line, one town, a UK postcode);
   - **`zip_state`** (US: city, a **two-letter** state, a 5-digit ZIP).

   Every new country falls into `postcode`, with UK labels, UK examples and UK-only geocoding.
   - **What breaks for Australia:**
     - **The State box cuts "NSW" to "NS" and saves it** (`app/manage/[token]/page.tsx:10302`).
     - Every region check is `^[A-Z]{2}$`, so NSW, VIC, QLD, TAS and ACT are dropped elsewhere.
     - Places stores the **council**, not the state, as the region.
     - A 4-digit postcode (one whole suburb) makes two pitches look like "the same venue".
   - **NZ:** there's nowhere to hold suburb *and* city.
   - **Ireland:** the field says "Postcode", not "Eircode".
   - **Canada:** it must choose between UK and US wording; neither fits.
2. **Proposed design (§2).** A per-country **address spec as jsonb on `country_settings`**, plus a
   **`country_regions` table** for state, province and county lists, both editable in Admin › Countries. The spec holds:
   - ordered fields, with required/optional;
   - which label word each field uses (the words stay in `messages/`, keyed by field type and variant);
   - the postcode pattern and a named normaliser;
   - display templates;
   - the geocoder and Places mapping;
   - the AI prompt rules;
   - whether a postcode identifies one premises.

   GB and US specs reproduce today's output **byte for byte**. The migration is about **6 stages**.
3. **Allergen display modes (§3).** No country's rule requires removing "card" mode, provided the card names each dish
   and its allergens.
   - **UK, Ireland and US Food Code states** need allergen information **per dish**. FSAI explicitly rejects "Our food
     contains…".
   - **Australia and New Zealand** allow "on request", so a card that invites the question is enough.
   - **Canada** has no federal duty for non-prepacked food (unconfirmed).

   Proposed data:
   - `allergen_display_modes` (default all three), restricted for no country;
   - `allergen_card_requirement` = `per_dish_listing` for GB, IE and US, and `any` for AU, NZ and CA.
4. **Trader details (§4).** UK and Irish law, Ontario above $50, and California require before an online order:
   - the seller's identity;
   - a **geographic address**;
   - contact details (Ireland: **phone and email**);
   - the total price.

   **Today the order page shows only the truck's name and the venue.** No address, phone or email reaches the order
   page; the confirmation email shows one contact method, and only if the truck chose one. There is no "no right to
   cancel" statement. The button says "Place order", which a lawyer should check against the "order with obligation to
   pay" rule.
   - **Missing data:** the trucks table has no legal name, business address or tax number.
   - **Proposal:** a "Sold by" block driven by per-country data, which reuses the §2 address spec for the truck's
     business address.

---

## 1 · Address surface map

**How it was gathered:** a read-only code sweep (sub-agents), with the five most serious findings spot-checked by me
(marked ✔ checked). `MP` = `app/manage/[token]/page.tsx`.

**The country columns** say what breaks for:
- **IE:** Eircode "D02 X963"; county optional.
- **AU:** "Bondi Beach NSW 2026" (suburb, 2–3 letter state, 4-digit postcode).
- **NZ:** street, suburb, city and a 4-digit postcode.
- **CA:** "Toronto ON M5V 3L9" (city, province, A1A 1A1).

### 1.1 Operator — Manage › Schedule, places, imports

| Surface | file:line | Assumes today | What breaks (IE / AU / NZ / CA) |
|---|---|---|---|
| Address style | `lib/copy/addressPlaceholders.ts:16-18` `addressStyleOf` | Anything not `zip_state` is `postcode` | Every new country gets the GB style |
| Postcode upper-casing | `addressPlaceholders.ts:21-23` | Upper-case under `postcode` only | Harmless for IE/AU/NZ. CA under `zip_state` stays lower-case |
| Add/Edit event fields | MP:10290-10307 (comment at 10291: "UK format… Future: addressFieldConfig(locale)") | Address (free) → Area → [State + ZIP] or Postcode | ✔ checked: **State input `v.toUpperCase().slice(0, 2)` (MP:10302) saves "NSW" as "NS"**, a wrong but valid-looking state. IE has no county. NZ has one Area for suburb *or* city. CA under `postcode` has no province |
| Event form validation | MP:8302-8319 | Postcode never validated | Nothing rejected (free text) |
| Save event / geocode | MP:8361-8366, 8392-8395, 7387-7404 | Geocodes `venue, town, postcode, country short name`; `region` sent only for `zip_state` | No region reaches the geocoder |
| Import saves (setup, Manage) | MP:4185-4202, 8496-8517 | `region` only if `normaliseRegion` (2 letters) | AU states lost |
| Import review | MP:9505-9512, 9587, 9630, 9718 | Area + Postcode/ZIP; **no State column** | The importer's state can't be seen or corrected. Label "Postcode" for IE (should be Eircode) and CA (Postal code); placeholder "CB22 5EJ" |
| Schedule card | MP:8802-8805 | `town · postcode` | AU "Bondi Beach · 2026" reads like a year; the region is never shown |
| Venue picker, fill from a place | MP:10221-10279; `lib/schedule-graphics/places.ts:486-540, 577-583, 670-696` | Place area → town; postcode; address | `truck_places` has **no region column**, so a state is never carried |
| Places editor | `components/manage/SchedulePlaces.tsx:426-506` | Address / Area / Postcode | Nowhere for a state, province or suburb |
| `upsert_event` | `app/api/manage/route.ts:1158, 1183, 1269, 1317-1326` | No server validation; `region = normaliseRegion(...)` | AU "NSW" stored as null |
| Event conflicts | `lib/event-conflicts.ts:66-72, 89-120` | ✔ checked: same date + same **normalised postcode = same venue** | AU/NZ 4-digit codes and US ZIPs cover a suburb, giving false "duplicate" / "Same venue and date, different time". IE Eircode (one per address) and CA codes are fine |
| Guessed / no-location banners | MP:8971-8984 | `{style}` words | Say "postcode" for IE and CA |
| CSV export | MP:14851, 15107 | "venue, town" | — |

### 1.2 Signup, setup and "Where you trade"

| Surface | file:line | Assumes | What breaks |
|---|---|---|---|
| Town box | `components/setup/WhereBasedStep.tsx:23-175`; used by `app/setup/page.tsx:33`, `components/DemoGetStarted.tsx:57`, `components/manage/WhereYouTrade.tsx:14-53` | Places suggestions, else free text | — |
| Places suggest | `lib/places.ts:45-72` | types `locality`, `postal_town` | NZ suburbs (`sublocality`) can't be picked |
| Places details | `lib/places.ts:84-97` | ✔ checked: `postcode` style uses region = admin level 2 ?? level 1; `zip_state` style uses level 1 + a 2-letter code | **AU: level 2 is the council** ("Waverley Council"), stored as `base_region` and fed to the importer prompt. IE: "County Dublin". CA under `postcode`: "Toronto Division" |
| Trade-area check | `lib/trade-area.ts:53-78` | `base_region_code` only for `zip_state`, 2 letters | AU states dropped. **DB CHECK `trucks_base_region_code_chk ~ '^[A-Z]{2}$'`** (live) blocks 3-letter codes |
| Signup / Manage save / provisioning | `app/api/setup/route.ts:100-110`; `app/api/manage/route.ts:2023-2034`; `lib/provision-truck.ts:505-517`; `app/api/admin/create-truck/route.ts:101-116` | — | Changing a truck's country leaves a stale `base_region_code`. Admin-created trucks get no `base_*` |

### 1.3 Geocoding and AI prompts

| Surface | file:line | Assumes | What breaks |
|---|---|---|---|
| Manage geocoder | `app/api/manage/geocode/route.ts:4-22` | Gemini on `[venue, town, postcode, country \|\| 'UK']`; example coordinates are UK | No region in the query; the answer is never checked against the country |
| Importer prompt | `lib/schedule-extract.ts:68-175`; branches at 92 (`zip_state`), **95-97 `code !== 'GB'`**, GB lines 123-135 | Three hard branches | IE: no county slot. AU/NZ: no state or suburb/city slot. CA under `zip_state` is told "ZIP codes are five digits" (211-212) |
| Importer parse | `schedule-extract.ts:327-330` | State kept only if 2 letters | AU states dropped |
| Screenshot tool | `lib/admin/screenshot-events.ts:118-148` (**124 `code !== 'GB'`**), parse 197-200, 266-281 | Same as the importer | Same gaps |
| Scraper Pass B prompt | `scripts/scraper-prompts.js:86-125`; `scripts/run-scraper.js:1889-1897` | `zip_state` or UK; **no neutral branch** | IE/AU/NZ get UK wording |
| WhatsApp replies | `lib/whatsapp-classifier.ts:91, 448-450`; `lib/whatsapp/upcoming-events.ts:51` | `[venue, town, postcode]` | State never named |

### 1.4 Customers, emails, tickets, kitchen

| Surface | file:line | Assumes | What breaks |
|---|---|---|---|
| The line formatter | `lib/event-address.ts:10-34` | `normaliseRegion` `^[A-Z]{2}$`; "Venue, Town, ST ZIP", else `[venue, town, postcode].join(', ')` | AU convention "Bondi Beach NSW 2026" has no comma, and NSW is dropped anyway. CA is right only under `zip_state` |
| Event card (order chooser, truck page, embed) | `components/TruckListCard.tsx:142-148, 162-168, 216-218`; `app/trucks/[slug]/order/page.tsx:226-240`; `TruckClient.tsx:377`; `app/embed/[slug]/EmbedSchedule.tsx:80` | `eventAreaLineWithRegion`, else `town · postcode` | AU "Bondi Beach · 2026"; NZ suburb only; CA without a province |
| Directions link | `components/EventListCard.tsx:254-258` | ✔ checked: `[venue - village, postcode]` | **Bug for every country:** the Google link is `…destination=$?q=…` (stray `$?q=`). It has no region or country |
| Calendar location | `lib/utils.ts:119-125` | `[venue, town, postcode]` | No region or country. (A "duplicated town" claim from the sweep was **not** confirmed: the join is correct) |
| Maps, distance, VF search | `components/MapView.tsx:139, 207-210`; `hooks/useVillageData.ts:130-136`; `lib/utils.ts:26-37` (postcodes.io); `app/page.tsx:141-237` | Suffolk centre, miles, UK postcode search | Every foreign postcode fails ("Could not find that postcode"). Events without coordinates are dropped once a radius is set |
| Venue page | `app/venues/[slug]/VenueClient.tsx:46-53, 170-186`; `page.tsx:48-103` (`en_GB`) | UK | No region |
| Customer emails | `lib/email.ts:382, 531` (confirmation / ready), `:597` / `:617` (operator), `:948` (event cancelled); callers in `app/api/orders/submit/route.ts`, `app/api/dashboard/action/route.ts`, `lib/payments/promote-draft.ts` | "📍 " + `eventAddressLine` | AU "…, Bondi Beach, 2026"; NZ "…, Ponsonby, 1011"; CA has no province |
| Tickets, SMS, push | `lib/printing/*`, `lib/twilio.ts` | No location printed | No impact |
| KDS / dashboard | `lib/event-display.ts:17-23` "Venue — Town"; used at `app/dashboard/[token]/kds/page.tsx:2777` and 5 more | Venue and town | NZ city lost |
| Posters / captions | `lib/weekly-post/week-data.ts:116-145, 303-313`; `lib/schedule-graphics/event-preview.ts:120-131` | "Name, Town"; GB/US samples only | AU/IE/NZ previews show Suffolk samples; the add-event preview drops the US state |

### 1.5 Outreach, discovery, scraper, venues, Village Foodie

- **Outreach has no postal fields.** `discovery_trucks` and `outreach_prospects` have none, and
  `app/api/admin/outreach/route.ts:89, 125` defaults the country to GB.
- **The scraper and venue pipeline are GB-only by design.** Each of these assumes the UK:
  - Pass A is GB only (`scripts/run-scraper.js:409` `SOURCE_COUNTRY='GB'`);
  - the UK postcode regex (`:1471-1472`);
  - the UK bounding box and postcodes.io (`scripts/geo-validate.js:46, 100, 117-121, 261-432`);
  - a "UK POSTCODE" Gemini geocoder (`run-scraper.js:2340-2351`);
  - the matcher's ASCII-only names (`lib/venue-matcher.ts:29-31, 52-54`: "Dún Laoghaire" → "d n laoghaire");
  - UK postcode sector rules (`lib/discovery-gate.ts:109-160`).
- **The venue gate** creates foreign venues with no coordinates and stores the region **raw** (`discovery-gate.ts:270-275`).
  So AU "NSW" and IE "Co. Cork" survive on `venues` but are dropped on `truck_events`, which is inconsistent.
- **The backfill and re-resolve scripts** (`scripts/backfill-venue-id*.ts`, `backfill-discovery-dedup.mjs`,
  `reresolve-event-venues.ts`) match **with no country filter**. An Irish "Red Lion" could be linked to a GB venue's
  coordinates and postcode.
- **Village Foodie:** the feed is GB-only (`app/api/discovery/events/route.ts:70-79`, `VILLAGE_FOODIE_COUNTRY`), and
  slugs strip non-ASCII (`lib/utils.ts:183-204`).
- **JSON-LD:** the only `PostalAddress` is the company's `addressCountry: 'GB'` (`lib/structured-data.ts:41`). That is
  correct; there is no Event or Place markup.

### 1.6 Admin, types and messages

- **Admin › Countries:**
  - `components/admin/CountriesTab.tsx:217, 411` offers two choices: "Town and postcode" and "City, state and ZIP";
  - `lib/admin/country-form.ts:63, 95, 158, 322, 338, 374` refuses anything else;
  - the loader `lib/country-settings.ts:41, 115` (`oneOf`) **throws** on any other value;
  - the type is at `lib/country-settings-types.ts:38`;
  - a new country copies another's settings (`lib/admin/country-actions.ts:130-148`), so IE, AU and NZ inherited
    `postcode`.
- **Messages:** all address words are ICU `{style, select, zip_state {…} other {…}}` in en-GB. en-IE, en-AU and en-NZ
  override none of them; en-US overrides two. The keys:
  - **`manageScheduleEvent`:** `address`, `addressDetails`, `addressPlaceholder`, `area`, `areaPlaceholder`,
    `postcode`, `postcodePlaceholder`, `state`, `statePlaceholder`, `venuePlaceholder`;
  - **`manageScheduleImport`:** `pastePlaceholder`, `review.area`, `review.postcode`, `review.postcodeExample`;
  - **`schedulePlaces`:** `searchPlaceholder`, `address`, `area`, `postcode`;
  - **`manageSchedule`:** `guessed.body`, `noLocation.body`, `conflict.review`;
  - **elsewhere:** `privateEvents.form.previewNote`, `whereYouTrade.townLabel` / `townQuestion`, and
    `tradeArea.town_missing` / `town_too_long`.

  There is no Eircode, Province, County or Suburb label anywhere.

### 1.7 Where country code, not data, decides address behaviour

1. `lib/schedule-extract.ts:95-97` and `lib/admin/screenshot-events.ts:124` use `code !== 'GB'` to switch on the
   neutral postal-code prompt lines.
2. Hard-wired GB:
   - the scraper, geo-validate and linking guards;
   - `lib/utils.ts:26-37` (postcodes.io);
   - `app/api/manage/geocode/route.ts:10` (`country || 'UK'`);
   - the VF feed.
3. GB defaults for a missing country:
   - `lib/venue-matcher.ts:200-210`;
   - `lib/discovery-country.ts:13, 25-28`;
   - `app/api/inbound-schedule/route.ts:53`;
   - `lib/schedule-context.ts:26`;
   - the admin screenshot and discovery-events routes;
   - outreach.
4. **Everything else branches on the data value `zip_state`, never on `'US'`.** That is the hook the design below
   generalises.

### 1.8 Address columns (live)

| Table | Columns | Constraint |
|---|---|---|
| `trucks` | `base_place_id`, `base_place_name`, `base_region`, `base_region_code`, `base_lat`, `base_lng` | `base_region_code ~ '^[A-Z]{2}$'` |
| `truck_events` | `venue_name`, `address`, `venue_address`, `town`, `postcode`, `region`, `latitude`, `longitude` | `region` has no CHECK (2 letters by code convention) |
| `truck_places` | `address`, `postcode`, `area` | **no region column** |
| `venues` | `village`, `postcode`, `region` (raw), `latitude`, `longitude`, `country` | unique `(country, name, village)` |
| `discovery_events` | `village` only | — |
| `subscribers` | `postcode`, `village`, `latitude`, `longitude` | — |
| `country_settings` | `address_format` | **CHECK `address_format in ('postcode', 'zip_state')`** |

## 2 · Proposed data model

### 2.1 The recommendation

**One `address_spec jsonb` column on `country_settings`, plus a `country_regions` table.** Both are edited in Admin ›
Countries.

**Why the spec belongs on the row, not in an `address_formats` table:**
- Dominic decided every country has **its own** format, so a shared table would buy no reuse.
- The country loader already caches the row (60 s) and every surface already reads it. A spec on the row reaches every
  surface with no new join, no second save path and no new cache.
- Admin › Countries already saves one row per country.

**Why the regions get a table:**
- The lists are long (US 51, Ireland 26, Canada 13, Australia 8).
- Stored values point at them by code (`truck_events.region`, `trucks.base_region_code`), so they want row-level
  editing and a validity check.
- One table serves every country.

**Labels stay in `messages/`, keyed by field type and variant. The spec stores only the variant:**
- postal code: `postcode | eircode | zip | postalCode`;
- region: `state | stateTerritory | province | county`;
- locality: `townOrArea | city | suburb | townOrCity`.

This follows §77.5: words are in messages and translatable, and display text is never a key. Admin picks a variant
from a list, and a new word is a messages change.

**Examples, patterns and templates are data**, because they're facts about a country's addresses, not translatable
words. "CB8 8PD" is the same in every language.

**One parser** (`lib/address-spec.ts`) validates a spec: known field keys, a regex that compiles, template tokens that
exist, region references that exist. The loader treats an unreadable spec like an unusable currency (35.ak-2): the row
is left out of lists, named in a red notice on Admin › Countries, and a direct read throws.

### 2.2 The spec's shape

```jsonc
{
  "fields": [                                  // the order the form shows them
    { "key": "street",     "required": false },
    { "key": "suburb",     "required": false },                     // a dependent locality (NZ); a new column
    { "key": "locality",   "required": true,  "label": "townOrArea" },
    { "key": "region",     "required": false, "label": "county", "store": "code", "display": "name" },
    { "key": "postalCode", "required": false, "label": "postcode" }
  ],
  "postalCode": {
    "pattern": "^…$",                         // after normalising; checked on entry, warn-only at first
    "normaliser": "gb",                       // a NAMED function in code: gb | eircode | digits | zip | ca | none
    "example": "CB8 8PD",
    "identifiesPremises": true                // false → same postcode ≠ same venue (event-conflicts)
  },
  "examples": { "street": "123 High St", "locality": "Wickhambrook", "venue": "…" },  // placeholders
  "templates": {                              // a part whose tokens are all empty is dropped; spaces collapse
    "line": "{venue}, {locality}, {postalCode}",                 // emails, calendar, WhatsApp
    "area": ["{locality} · {postalCode}"],                       // cards; first alternative whose ! tokens exist
    "geocode": "{venue}, {locality}, {postalCode}, {country}"
  },
  "places": { "localityTypes": ["locality", "postal_town"], "regionFrom": "administrative_area_level_2", "regionAs": "long" },
  "ai": { "postalCodeRules": "…English prompt lines, verbatim…", "regionRules": "…" }
}
```

**Normalisers are code, chosen by data.** There are six named, finite functions: `gb`, `eircode`, `digits`, `zip`,
`ca`, `none`. No country code appears in code. The two `code !== 'GB'` prompt branches become `ai.postalCodeRules`,
with GB's current lines kept verbatim so GB prompts stay byte-identical.

**`country_regions`:**
- columns: `country_code` FK, `code`, `name`, `sort_order`, `active`; primary key (`country_code`, `code`);
- service role only, like `country_settings`;
- stored codes are validated against it in the app;
- the 2-letter regex is retired (`normaliseRegion` becomes "in this country's list").

### 2.3 Proposed values for the six countries

| | GB | US | IE | AU | NZ | CA |
|---|---|---|---|---|---|---|
| Fields (in order) | street?, locality*, postalCode? | street?, locality*, region?, postalCode? | street?, locality*, region? (county), postalCode? | street?, locality* (suburb), region*, postalCode* | street?, suburb?, locality* (city), postalCode? | street?, locality* (city), region*, postalCode? |
| Locality label | townOrArea ("Area (village, town or city)") | townOrArea (today's US text) | townOrArea | suburb | townOrCity | city |
| Region label · list | — · none | state · 50 states + DC | county · 26 counties | stateTerritory · NSW VIC QLD SA WA TAS NT ACT | — · none | province · AB BC MB NB NL NS NT NU ON PE QC SK YT |
| Region stored · shown | — | code · code | code (ISO 3166-2 without "IE-", e.g. KY, D, CO) · name ("Co. Kerry") | code · code | — | code · code |
| Postal label | postcode | zip | **eircode** | postcode | postcode | **postalCode** |
| Pattern | `^([A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}\|GIR 0AA)$` | `^\d{5}(-\d{4})?$` | `^([AC-FHKNPRTV-Y]\d{2}\|D6W) [0-9AC-FHKNPRTV-Y]{4}$` | `^\d{4}$` | `^\d{4}$` | `^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] \d[ABCEGHJ-NPRSTV-Z]\d$` |
| Normaliser | gb (upper, one space before the last 3) | zip | eircode (upper, space after 3) | digits | digits | ca (upper, space after 3) |
| Example | CB8 8PD | 78701 | D02 X963 | 2026 | 1011 | M5V 3L9 |
| Postcode = one premises? | yes | no | yes | no | no | no (safer) |
| `line` template | `{venue}, {locality}, {postalCode}` | `{venue}, {locality}, {region} {postalCode}` | `{venue}, {locality}, {postalCode}` | `{venue}, {locality} {region} {postalCode}` | `{venue}, {suburb}, {locality} {postalCode}` | `{venue}, {locality}, {region} {postalCode}` |
| `area` template | `{locality} · {postalCode}` | `{locality}, {region!} {postalCode}` then `{locality} · {postalCode}` | `{locality} · {postalCode}` | `{locality} {region} {postalCode}` | `{suburb}, {locality}` | `{locality}, {region} {postalCode}` |
| Places locality types · region from | locality, postal_town · level 2, long | locality, postal_town · level 1, short | locality · level 1, long (the county) | locality · level 1, short | locality, sublocality_level_1 → suburb · none | locality · level 1, short |

**Notes on the table:**
- `*` = required; `?` = optional.
- `{region!}` means that template alternative is used only when a region exists. That reproduces today's US card
  ("Hoboken, NJ 07030" with a state, the GB-style line without one).

**GB/US byte-identity, checked against the code:**
- GB `line` = today's `[venue, town, postcode].join(', ')` (`lib/event-address.ts:23-27`).
- US `line` = today's "Pier A Park, Hoboken, NJ 07030", and "Pier A Park, Hoboken, 07030" without a state.
- GB/US labels and examples come from the same message branches as today (`other` and `zip_state` become variants).
- GB keeps `ai.postalCodeRules` verbatim from `lib/schedule-extract.ts:123-135` and `screenshot-events.ts:141-148`.
- GB `places` = today's `postcode`-style mapping; US = today's `zip_state` mapping.
- The geocode template reproduces today's query exactly.

**Region list notes:**
- Ireland's county is optional, and the Eircode does the locating.
- The US list could add PR and the territories if wanted.
- Today's US data stays valid: the only stored US region code is NJ.

**Columns the design needs** (stage S3):
- `truck_events.suburb`, `truck_places.suburb`, `truck_places.region`;
- `trucks.base_region_code`'s CHECK replaced by validation against `country_regions`;
- and for later, VF/scraper: `venues.suburb` and a country filter in the backfill scripts.

### 2.4 Migration path and stages

**Existing data stays valid with no rewrite.** Live, read-only, 21 Oct:
- GB: 178 events (134 with town, 86 with postcode, 0 with region), 884 venues, 51 places;
- US: 2 events, 1 truck with region NJ;
- no IE, AU or NZ events, trucks or venues.

**The stages:**

| Stage | Contents | Proof | Size |
|---|---|---|---|
| S1 | Add `address_spec jsonb` (nullable) and `country_regions`; seed GB, US, IE, AU and NZ (CA when its row exists); `lib/address-spec.ts` parser; the loader reads the spec. A NULL spec is treated as unreadable once seeded, so there's no code fallback | Harness: every GB/US formatter, label, example, prompt and Places mapping **byte-identical** to `address_format`'s output | 1 session |
| S2 | Display: `event-address.ts` from templates; cards, emails, calendar, WhatsApp, the directions link (fix `$?q=`), the KDS line, poster previews | GB/US byte-identical renders; IE/AU/NZ/CA fixture renders | 1 session |
| S3 | Entry: the Manage event form, import review (with a region column), places editor, Where you trade; region pickers from `country_regions`; labels from messages variants; columns `suburb` and `truck_places.region`; `base_region_code` check moved to the app; normalisers on save (warn-only) | GB/US byte-identical forms; AU "NSW" round-trips | 1–2 sessions |
| S4 | Geocoder query and Places mapping from the spec; AI prompts from `ai.*` (the `code !== 'GB'` branches removed); event-conflicts uses `identifiesPremises` | GB/US prompts byte-identical; AU council → state | 1 session |
| S5 | Admin › Countries editor: fields, labels, pattern (test box), templates (live preview), region list editor, red notice for an unreadable spec | Admin harness, Ireland column only | 1 session |
| S6 | Retire `address_format` (commented RETIRED, never read); drop its CHECK. Out of scope until Village Foodie goes abroad: the scraper, geo-validate, VF postcode search and country filters on the backfills | Legacy-imports guard | ½ session |

**About 6 sessions.** S1–S4 are needed before AU or NZ is switched on. Ireland can go on with today's `postcode`
style, plus a small "Eircode" label override if wanted.

## 3 · Allergen display modes

**Our modes:**
- **per dish:** chips on each item;
- **card:** one verbatim card (`trucks.allergen_info_text` / `allergen_info_url`), shown on the order page before
  ordering;
- **both.**

**Live, 21 Oct:** of 11 GB trucks, 5 use card (3 have card content), 4 per dish and 2 unset (= both). The US test truck
uses card.

| Country | Rule (official) | Per dish required? | Card mode OK? |
|---|---|---|---|
| **UK** (England, Wales, NI; Scotland the same law) | FSA: "you must supply allergen information for every item that contains any of the 14 allergens". Buffets: "provide allergen information for each food item separately… not… for the buffet as a whole". Distance selling: "before the purchase of the food is completed" and "when the food is delivered" (writing or speech by law; best practice is written both times). [FSA allergen guidance](https://www.gov.uk/government/publications/allergen-guidance-for-food-businesses/allergen-guidance-for-food-businesses) · [best practice](https://www.gov.uk/government/publications/allergen-information-for-non-prepacked-foods-best-practice/allergen-information-for-non-prepacked-foods-best-practice) | **Yes** | **Only if the card lists each dish and its allergens.** A generic "may contain, ask staff" card doesn't work for online orders |
| **US** | FDA Food Code 2022 ¶3-602.12(C): written notice of major allergens in unpackaged food, binding only where a state adopts it ([FDA](https://www.fda.gov/food/fda-food-code/summary-changes-2022-fda-food-code); [Virginia 2VAC5-585-910](https://law.lis.virginia.gov/admincode/title2/agency5/chapter585/section910/): "notify consumers by written notification of the presence of major allergens"). Illinois: "Each food item should have a written notification" ([IDPH](https://dph.illinois.gov/topics-services/food-safety/retail-food/allergen-requirements-faq.html)). MA and RI require a menu notice only. California SB 68 (chains of 20+, per item) reportedly exempts food trucks. MA, RI, CA and NY are **unconfirmed** (official sites blocked) | Effectively yes in Food Code states | **Unclear.** A per-dish chart passes as a "placard"; a generic card meets only MA/RI-style notice laws |
| **Ireland** | FSAI: "must indicate food allergens in writing"; "must not have to ask"; "It is not acceptable to say 'Our food contains…'"; may be "alongside each menu item or centrally"; distance selling: "available before the purchase is concluded" and again at delivery. Law: S.I. 489/2014 as amended by S.I. 656/2024. [FSAI](https://www.fsai.ie/business-advice/running-a-food-business/allergens/allergen-information-for-non-prepacked-food) | **Yes** | **Only as a per-dish chart.** A generic statement is explicitly rejected |
| **Australia** | Food Standards Code s1.2.1—9(6): "displayed in connection with the display of the food; or provided to the purchaser on request"; PEAL names apply. [FSANZ](https://www.foodstandards.gov.au/business/labelling/allergen-labelling) · [Code text](https://www.legislation.gov.au/F2015L00386/2021-06-03/2021-06-03/text/original/epub/OEBPS/document_1/document_1.html) | Info must relate to the food, but can be given on request | **Yes**, as the on-request route, if staff can then give per-dish answers using PEAL names. Online-specific rule: unconfirmed |
| **New Zealand** | The same Code. MPI: "must be displayed with the food such as listed on the menu, or provided to the customer on request". [MPI](https://www.mpi.govt.nz/news/media-releases/plain-english-allergen-labelling-good-news-for-consumers) | As for Australia | **Yes**, as the on-request route |
| **Canada** | Federal allergen declarations apply to **prepackaged** food; even commissary servings sold in mobile canteens are exempt. [CFIA](https://inspection.canada.ca/en/food-labels/labelling/industry/list-ingredients-and-allergens) · [Health Canada](https://www.canada.ca/en/health-canada/services/food-allergies-intolerances/avoiding-allergens-food/allergen-labelling.html). No restaurant rule found (**unconfirmed**) | No | **Yes** (nothing required) |

**What this means for the decision** ("same options everywhere unless a country's law requires otherwise"):
- **No country requires removing card mode.**
- **Three require something of the card's *content*:** GB, IE and US Food Code states. Each dish must be named with its
  allergens.

So the proposed data has two parts:

```sql
-- PROPOSAL ONLY (not run): on country_settings
allergen_display_modes text[] not null default '{per_dish,card,both}'
  check (allergen_display_modes <@ array['per_dish','card','both'] and cardinality(allergen_display_modes) > 0),
allergen_card_requirement text not null default 'any'
  check (allergen_card_requirement in ('any', 'per_dish_listing'))
```

**How the app would use it:**
- **Manage › Menu** offers only the allowed modes.
- **A truck whose saved mode is no longer allowed** is shown as `both` with a notice.
- **When the requirement is `per_dish_listing`,** the card editor shows a requirement line and a confirm tick: "My card
  names every dish and its allergens". The words go in messages. The existing card-text AI extraction could also warn
  when the card names no dishes.

**Proposed values:**

| | GB | US | IE | AU | NZ | CA |
|---|---|---|---|---|---|---|
| `allergen_display_modes` | all three | all three | all three | all three | all three | all three |
| `allergen_card_requirement` | `per_dish_listing` | `per_dish_listing` (safe, given the Food Code) | `per_dish_listing` | `any` | `any` | `any` |

**For Dominic:** 5 live GB trucks use card mode, 3 of them with a saved card. Worth checking that each card names its
dishes. I didn't read the card content here.

## 4 · Trader details on the order page

### 4.1 What each country requires before an online order

| Country | Identity | Geographic address | Phone | Email | Total price | Also | Source |
|---|---|---|---|---|---|---|---|
| **UK** | Yes: trading name (CCR 2013 Sch 2(b); DMCC 2024 s230(2)(d)) | Yes (Sch 2(c); E-Commerce Regs 2002 reg 6; DMCC "business address") | "where available" | Yes (E-Commerce reg 6 "including his electronic mail address"; DMCC "any business email") | Yes, incl. taxes and mandatory fees (Sch 2(f); DMCC s230(4)) | (a) Sch 2(o): say there is **no right to cancel**. (b) Reg 14: button must say "order with obligation to pay" or an unambiguous equivalent. (c) Reg 16: confirmation on a durable medium (email) with the Sch 2 info. (d) VAT number if registered | [CCR Sch 2](https://www.legislation.gov.uk/uksi/2013/3134/schedule/2), [reg 14](https://www.legislation.gov.uk/uksi/2013/3134/regulation/14), [reg 16](https://www.legislation.gov.uk/uksi/2013/3134/regulation/16), [E-Commerce reg 6](https://www.legislation.gov.uk/uksi/2002/2013/regulation/6), [DMCC s230](https://www.legislation.gov.uk/ukpga/2024/13/section/230) |
| **Ireland** | Yes: "trading name and legal identity" (CRA 2022 Sch 3(b)) | Yes (Sch 3(d)) | **Yes, required** | **Yes, required** | Yes, incl. taxes (Sch 3(f)) | (a) Sch 3(p): no right to cancel. (b) s108: "order with obligation to pay" button, **pay-at-truck included**. (c) s109: durable-medium confirmation. (d) s106 breaches are offences. (e) SI 68/2003 reg 7: VAT number | [CRA Sch 3](https://www.irishstatutebook.ie/2022/en/act/pub/0037/sched3.html), [s106](https://www.irishstatutebook.ie/2022/en/act/pub/0037/sec0106.html), [s108](https://www.irishstatutebook.ie/2022/en/act/pub/0037/sec0108.html), [s109](https://www.irishstatutebook.ie/2022/en/act/pub/0037/sec0109.html), [SI 68/2003](https://www.irishstatutebook.ie/eli/2003/si/68/made/en/print) |
| **US (federal)** | No general rule found | — | — | — | The FTC Fees Rule covers only tickets and lodging | — | [16 CFR 464](https://www.ecfr.gov/api/versioner/v1/full/2026-10-01/title-16.xml?part=464) |
| **US (California)** | Legal name, before payment (B&P §17538(d)) | **Complete street address** | — | Copy by email on request | All-in price (SB 478); restaurant fees may be shown separately if conspicuous (SB 1524) | Whether "goods" covers prepared food is **unconfirmed**; §17538 text is from a secondary site | [CA AG hidden fees](https://oag.ca.gov/hiddenfees) |
| **Australia** | No pre-order duty found | — | — | — | **Single total price**, prominent (ACL s48); per-transaction charges near the price from 1 Jul 2027 (s48A) | Proof of transaction for A$75+: supplier, **ABN**, date, price (s100) | [ACL](https://www.legislation.gov.au/C2004A00109/latest/text) |
| **New Zealand** | **"In trade" status** shown where the customer buys (Commerce Commission; Fair Trading Act s28B, statute text **unconfirmed**) | Not found | — | — | GST-inclusive; surcharges disclosed upfront | — | [ComCom: in trade](https://www.comcom.govt.nz/business/your-obligations-as-a-business/what-is-being-in-trade/), [selling online](https://comcom.govt.nz/business/dealing-with-typical-situations/selling-goods-and-services/selling-online/) |
| **Canada: Ontario** (> C$50) | Name and business name | Yes, business premises | Yes | "if any" | Itemised plus total, incl. taxes | Chance to correct and accept; a copy within 15 days | [O. Reg. 17/05](https://www.ontario.ca/laws/regulation/050017) |
| **Canada: BC, Quebec** | BC: name; total price; copy within 15 days. Address and phone **unconfirmed**. Quebec **unconfirmed** (site blocked) | | | | | | [BC BPCPA](https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/04002_04) |

**Exemptions:** the UK (CCR reg 28(1)(h)) and Ireland (CRA s111) remove only the **cancellation right** for catering on
a specific date. The information duties still apply.

### 4.2 What HatchGrab shows today

| Surface | file:line | Shows |
|---|---|---|
| Order page truck data | `app/api/menu/[truckId]/route.ts:843-897` | `name`, `logo`, `venue_name`, allergen card, payment flags. **No address, phone, email or legal name is sent to the page** |
| Order page | `app/trucks/[slug]/order/page.tsx:377` (truck name), 226-240 (event venue/area), 4024/4037/4055 (button `order.placeOrder` = "Place order"), 3984/4067 ("Pay now by card"), 4029/4046 ("Pay at the truck on collection · No card details needed") | The truck's name, the event's place, the basket total. **No trader block, no "no right to cancel" line**, and no link to the truck's or HatchGrab's terms |
| Confirmation / status page | `app/order/[id]/page.tsx` | Order details. **No truck contact or address** |
| Confirmation and ready emails | `lib/email.ts:382` (venue line), `:387-420` (contact block) | Truck name, venue line, totals, and **one** contact method (`preferred_contact_method`: phone, WhatsApp, Facebook, Instagram or email), **only if the truck chose one** |

**Which truck fields hold the data** (live counts, 21 Oct; no personal data read):

| Field | Holds | Filled |
|---|---|---|
| `trucks.name` | Trading name | All |
| `trucks.contact_email` | Email | GB 9 of 11; US 1 of 1 |
| `trucks.contact_phone` | Phone | GB 7 of 11; US 1 of 1 |
| `preferred_contact_method` | Which contact the email shows | GB 4; US 1 |
| `trucks.base_place_name` | Base town only | GB 0; US 1 |
| `operators.first_name` / `last_name`, `phone`, `email` | The account holder | — |

**Not held anywhere:** a **legal name** (identity, if different from the trading name), a **geographic business
address**, or a **VAT / ABN / GST number**.

### 4.3 Missing, per country

- **UK:**
  - a geographic address;
  - the email (E-Commerce reg 6 makes it mandatory);
  - the phone where the truck has one;
  - the legal identity if it differs from the trading name;
  - a "no right to cancel (catering for a set date)" statement before ordering;
  - the same details in the confirmation email;
  - a check on "Place order" against reg 14. CJEU case law (Fuhrmann-2, 2022) reads this strictly, and it matters most
    for a pay-at-the-truck order, where nothing says "pay". **For a lawyer.**
- **Ireland:** everything the UK needs, plus **both** phone and email (no "where available"). The button rule covers
  pay-at-truck orders too, and s106 breaches are offences.
- **US:** nothing federally. In California, show the legal name and complete street address before payment, if
  §17538(d) covers food (**for a lawyer**). Prices are already all-in apart from tax.
- **Australia:** the total is already shown as one figure. For orders of A$75 or more, the confirmation email must
  carry the supplier's **ABN**; we hold no ABN.
- **New Zealand:** an "in trade" statement on the order page (for example "Sold by {truck}, a business"). Prices
  already include GST.
- **Canada (later):** for Ontario orders over C$50, the business name, premises address and phone, an itemised total
  and an emailed copy within 15 days. Our email is the copy once it carries the details.

### 4.4 Proposal (for decision; nothing built)

1. **Truck fields:**
   - `legal_name` (nullable; shown only if it differs from `name`);
   - `business_address`, **structured by the country's §2 address spec**, so one address editor serves events and the
     trader;
   - `tax_number` (VAT / ABN / GST; already in the backlog, §27);
   - a rule that `contact_email` (and, in Ireland, `contact_phone`) must be filled before go-live.
2. **Country data** (`country_settings.trader_disclosure jsonb`), with each flag set from §4.1:
   - which items must show before ordering: identity, address, phone, email;
   - `in_trade_statement`;
   - `no_cancellation_notice`;
   - `tax_number_on_receipt_from_minor` (AU: 7500);
   - `order_button_variant`.
3. **One "Sold by" block** rendered from that data on the order page (before the button), the confirmation page and
   both emails. The words go in messages.
4. **A decision for Dominic:** many sole traders' business address is their home. UK and Irish law still ask for "the
   geographical address at which the trader is established". **For a lawyer:** can a correspondence or service address
   be used instead?

---

## 5 · Read-only SQL run for this workstream

```sql
select country_code, enabled, address_format, locale, phone_country_code from public.country_settings order by country_code;
```
```sql
select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid) as def from pg_constraint where contype = 'c' and (pg_get_constraintdef(oid) ilike '%address_format%' or pg_get_constraintdef(oid) ilike '%postcode%' or pg_get_constraintdef(oid) ilike '%region%') order by 1, 2;
```
```sql
select table_name, column_name, data_type from information_schema.columns where table_schema = 'public' and (column_name ilike '%address%' or column_name ilike '%postcode%' or column_name ilike '%zip%' or column_name ilike '%town%' or column_name ilike '%city%' or column_name ilike '%region%' or column_name ilike '%county%' or column_name ilike '%state%' or column_name ilike '%locality%' or column_name ilike '%suburb%' or column_name in ('lat','lng','latitude','longitude','base_lat','base_lng')) and table_name not like 'pg_%' order by 1, 2;
```
```sql
select table_name, string_agg(column_name, ', ' order by ordinal_position) as cols from information_schema.columns where table_schema = 'public' and table_name in ('venues', 'discovery_trucks', 'discovery_events', 'truck_places', 'subscribers', 'outreach_prospects') group by 1 order by 1;
```
```sql
select pg_get_constraintdef(oid) as allergen_chk from pg_constraint where conname = 'country_settings_allergen_set_chk';
```
```sql
select t.country, count(*) as events,
  count(*) filter (where nullif(trim(e.address), '') is not null) as with_address,
  count(*) filter (where nullif(trim(e.venue_address), '') is not null) as with_venue_address,
  count(*) filter (where nullif(trim(e.town), '') is not null) as with_town,
  count(*) filter (where nullif(trim(e.postcode), '') is not null) as with_postcode,
  count(*) filter (where nullif(trim(e.region), '') is not null) as with_region,
  count(*) filter (where e.latitude is not null and e.longitude is not null) as with_latlng
from public.truck_events e join public.trucks t on t.id = e.truck_id group by 1 order by 1;
```
```sql
select coalesce(country, '(null)') as country, count(*) as venues,
  count(*) filter (where nullif(trim(village), '') is not null) as with_village,
  count(*) filter (where nullif(trim(postcode), '') is not null) as with_postcode,
  count(*) filter (where nullif(trim(region), '') is not null) as with_region,
  count(*) filter (where latitude is not null and longitude is not null) as with_latlng
from public.venues group by 1 order by 1;
```
```sql
select t.country, count(*) as trucks,
  count(*) filter (where nullif(trim(t.base_place_name), '') is not null) as with_base_name,
  count(*) filter (where t.base_place_id is not null) as with_place_id,
  count(*) filter (where nullif(trim(t.base_region), '') is not null) as with_region,
  count(*) filter (where t.base_region_code is not null) as with_region_code,
  count(*) filter (where t.base_lat is not null) as with_latlng,
  (select count(*) from public.truck_places p where p.truck_id in (select id from public.trucks t2 where t2.country = t.country)) as places,
  (select count(*) from public.truck_places p where nullif(trim(p.postcode), '') is not null and p.truck_id in (select id from public.trucks t2 where t2.country = t.country)) as places_with_postcode,
  (select count(*) from public.truck_places p where nullif(trim(p.address), '') is not null and p.truck_id in (select id from public.trucks t2 where t2.country = t.country)) as places_with_address
from public.trucks t group by t.country order by 1;
```
```sql
select 'discovery_events' as tbl, coalesce(country, '(null)') as country, count(*) as n, count(*) filter (where nullif(trim(village), '') is not null) as with_village, count(*) filter (where venue_id is not null) as with_venue from public.discovery_events group by 2
union all select 'discovery_trucks', coalesce(country, '(null)'), count(*), null, null from public.discovery_trucks group by 2
union all select 'subscribers', '(n/a)', count(*), count(*) filter (where nullif(trim(postcode), '') is not null), count(*) filter (where latitude is not null) from public.subscribers
order by 1, 2;
```
```sql
select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = 'trucks' and (column_name ilike any (array['%name%','%email%','%phone%','%legal%','%business%','%company%','%abn%','%vat%','%tax_number%','%address%','%social%','%website%','%contact%','%whatsapp%'])) order by 1;
```
```sql
select country,
  count(*) as trucks,
  count(*) filter (where nullif(trim(contact_email), '') is not null) as with_contact_email,
  count(*) filter (where nullif(trim(contact_phone), '') is not null) as with_contact_phone,
  count(*) filter (where nullif(trim(base_place_name), '') is not null) as with_base_town
from public.trucks group by 1 order by 1;
```
```sql
select country, coalesce(allergen_display_mode, '(null = both)') as mode, count(*) as trucks, count(*) filter (where nullif(trim(allergen_info_text), '') is not null or nullif(trim(allergen_info_url), '') is not null) as with_card_content, count(*) filter (where nullif(trim(preferred_contact_method), '') is not null) as with_preferred_contact from public.trucks group by 1, 2 order by 1, 2;
```

**What they returned:**
- **`address_format`:** GB `postcode` (on), US `zip_state` (on), IE / AU / NZ `postcode` (all off).
  - **CHECK:** `address_format in ('postcode', 'zip_state')`.
  - Other address checks: `trucks_base_region_code_chk ~ '^[A-Z]{2}$'`. (`discovery_events_superseded_reason_check`
    merely lists 'postcode' as a reason.)
- **Allergen CHECK:** `uk14 | us9 | anz`.
- **Events:** GB 178 (address 1, town 134, postcode 86, region 0, coordinates 115); US 2 (all filled except region).
- **Venues:** GB 884 (village 842, postcode 593, region 0, coordinates 735).
- **Trucks and places:**
  - GB 11 trucks, no base fields; 51 places (30 with postcode, 0 with address);
  - US 1 truck with every base field.
- **Discovery:** events GB 870; trucks GB 267. **Subscribers:** 153, all with postcode and coordinates.
- **Trucks fields:** no legal-name, business-address or tax-number column.
  - Contact email: GB 9 of 11, US 1 of 1. Contact phone: GB 7 of 11, US 1 of 1. Base town: GB 0, US 1.
- **Allergen modes:** GB card 5 (3 with content), per dish 4, unset 2; US card 1.

## 6 · Bugs found on the way (not fixed: read-only)

1. **AU state truncated:** MP:10302 saves "NSW" as "NS" (✔ checked). It only matters if AU ever uses `zip_state`, but
   it's the one place a **wrong** value is written, not just a missing one.
2. **Google directions link** is malformed for every country: `…destination=$?q=…` (`components/EventListCard.tsx:258`,
   ✔ checked).
3. **Event conflicts** treat one postcode as one venue (`lib/event-conflicts.ts:66-72`, ✔ checked). US ZIPs already
   produce false "same venue" warnings.
4. **Places stores the council, not the state, as the AU region** (`lib/places.ts:87-89`, ✔ checked), and it feeds the
   importer prompt.
5. **The backfill and re-resolve scripts have no country filter.** They could link an Irish event to a GB venue.

## 7 · Decisions for Dominic

1. **The address design:** jsonb spec on the row plus a `country_regions` table, labels in messages (recommended), or
   another shape. Also approve the §2.3 values (especially AU suburb + state required; Irish county optional; NZ suburb
   + city).
2. **Order:** S1–S4 before AU and NZ switch on. Ireland can go on with today's `postcode` style plus an optional
   "Eircode" label override.
3. **Allergens:** `allergen_card_requirement` per country as in §3 (GB/IE/US `per_dish_listing`), and a review of the 5
   GB trucks' cards.
4. **Trader details:**
   - the new truck fields and the "Sold by" block;
   - whether a home address may be replaced by a service address (**lawyer**);
   - the "Place order" wording for pay-at-the-truck orders (**lawyer**);
   - Ireland requiring both phone and email before go-live.
