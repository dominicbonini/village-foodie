# Schedule screenshots and imports: country and area awareness (read-only audit)

**Branch `main` · HEAD `f4bd277` (9 Oct 2026) plus the uncommitted Phase 2A/2B working tree · written 10 October 2026**

Nothing was changed except this file:
- no migration, SQL, install or git change;
- no `.env*` file opened;
- no external API called; nothing sent; `outreach_templates` not touched.

Line numbers refer to the current working tree. Six of the files cited carry uncommitted Phase 2B (truck-time) edits: `lib/schedule-extract.ts`, `process-schedule`, `verify-schedule-url`, `inbound-schedule`, `app/api/manage/route.ts` and `app/manage/[token]/page.tsx`. None of those edits changed a location line in any prompt.

Nothing in the brief arrived garbled, and no instruction contradicted another.

---

## Summary: the biggest blockers

1. **No country exists anywhere on the discovery side.** `discovery_trucks`, `discovery_events`, `venues` and `outreach_prospects` have no country, state or region column (`supabase/migrations/20260522_discovery_schema.sql:8-26, 35-60, 68-83`; `20260903_outreach_tracking.sql:38-49`). Only `trucks.country` (`20261010_01…:29`) and `orders.country` exist. So nothing can be scoped, filtered or held by country today.
2. **A US row would be public on Village Foodie the moment it is written.**
   - The `show_on_vf` columns default to `true`, and the gate writes `show_on_vf: true` on every event (`lib/discovery-gate.ts:285-291`).
   - The one public data API, `/api/discovery/events`, has no country, bounding-box or postcode filter.
   - With no visitor location set, the home list shows every event in the next 14 days and the map frames all pins (`hooks/useVillageData.ts:89-91`, `components/MapView.tsx:88-95`).
3. **Truck-name matching would link a US truck to a same-named UK truck — nothing in code stops it.**
   - **Unbounded containment either way**, with no minimum length:
     - the gate (`lib/discovery-gate.ts:234-237`);
     - the bridge into `truck_events` (`app/api/inbound-schedule/route.ts:115-122`).
     - So "Gusto" from a US schedule would match Pizzeria Gusto. It would write unconfirmed events into the UK operator's portal and email them.
   - **The live normalised-name unique index** `discovery_trucks_norm_name_uniq` means a US truck with the same name as a UK truck **cannot have its own row** (manual §33; definition in `scripts/backfill-output/dedupe-pmf-and-grababurger.sql:104-105`).
   - **Venues are unique on `(name, village)`**, so a US "Red Lion, Cambridge" collapses onto the UK one. The 15 km village-anchor check then measures against the *UK* Cambridge and passes.
4. **Every extraction prompt is UK-shaped, and none is told a country.**
   - The UK assumption is written into:
     - the operator importer (`lib/schedule-extract.ts:47, 74-77, 87-88`);
     - the screenshot prompt (`lib/admin/screenshot-events.ts:120`);
     - the HatchGrab scraper pass (`scripts/run-scraper.js:2111-2121`);
     - the Hatches Up importer (`scripts/import-hatchesup-schedule.js:523`).
   - The operator importer is the only path that receives anything derived from country, and that is only the truck's time zone and day-name locale (`lib/truck-time.ts`).
   - The admin screenshot prompt gets **no** context at all: no truck, no country, server UTC clock (`lib/admin/screenshot-events.ts:93-103`).
5. **Geocoding is UK-only, and one path always appends "UK".**
   - The dashboard geocoder (`app/api/manage/geocode/route.ts:10`) builds `[venueName, town, postcode, country || 'UK']`. Its only client, `geocodeLocation` (`app/manage/[token]/page.tsx:7248-7265`), sends `{ venueName, town, postcode }` and **never sends `country`**, so every operator-imported or hand-added event is geocoded as UK. Gemini's answer is stored with no validation.
   - The scraper's resolver is UK-only by design: a UK bounding box plus postcodes.io (`scripts/geo-validate.js:46, 100`).
   - There is **no geocoding or maps key** in the Vercel code (§7).
6. **The "truck radius" exists only on paper.** The 25/50/100 km review rule ("hold below 2 anchors") is in the manuals and `docs/truck-radius-report.md`, but **nothing implements it**. Every distance rule in code is centred on a **village**, not a truck.
   - No table stores a truck's base, home town, centre or radius.
   - An area can only be derived from past events, and those are thin:
     - in the 8 September measurement, 61% of discovery trucks had 0 or 1 clean anchor;
     - on HatchGrab trucks, `truck_events.venue_id` is never set by manual events.
7. **The admin screenshot panel has no picker of any kind**, no session persistence and no idle timer. The truck comes only from the name the AI reads off the image. There is a clean place to add a country dropdown and a "held" outcome (§2.2), and the confirm/dismiss pattern to copy already exists ("Needs a look").

---

## 1. Every path that turns a schedule into events

### 1.0 The count — the manual is wrong

§51.2 (`docs/reference-manual.md:26846-26860`) is headed "six paths, eight prompts", but its own table has **8 rows (A–H)**, and rows D and E share one prompt.

**The code today has 9 paths and 8 distinct schedule-extraction prompts.** The hatchesup.co.uk importer (I) is missing from §51 and from §53.1's list of gate callers (`:27238-27242`).

| # | Path | Entry point | Schedule prompt | Model | Goes through | Writes |
|---|---|---|---|---|---|---|
| A | Scraper Pass A, event branch (incl. `manual_single`) | `.github/workflows/daily_scrape.yml` (cron 06:00, `SCRAPE_MODE: discovery`) | `scripts/run-scraper.js:1238-1270` | `gemini-2.5-flash-lite` (flash only for a site name containing "howe", :1274-1277) | POST `/api/discovery/ingest` (:2341-2367) → gate | `discovery_events`, Google Sheet; new venues → `venues` (:2490-2496); new trucks → `discovery_trucks` (:2292-2311) |
| B | Scraper Pass A, rule branch (`manual`, `scrape_rules`, auto "weekly") | as A | `run-scraper.js:1206-1236` | as A | rule expanded to dates (:1403-1422), then as A | as A |
| C | Scraper Pass B, HatchGrab-linked trucks | `.github/workflows/hatchgrab_scrape.yml` (hourly; `workflow_dispatch` with `scrape_truck_id`) | `run-scraper.js:2104-2124` (`buildHgPrompt`) | `gemini-2.5-flash` (:2129) | POST `/api/inbound-schedule` (:2226) | `discovery_events` (gate), `truck_events` (bridge), operator email |
| D | Operator importer, file or text | `/manage/[token]`: wizard `schedProcessPhoto` (:4034-4052) and Schedule tab `processUpload` (:8216-8245) → `app/api/manage/process-schedule/route.ts:11-45` | `lib/schedule-extract.ts:26-108` | flash (:162) | browser review → `upsert_event` | `truck_events` (`source: 'manual'`), `truck_places` |
| E | Operator importer, URL | wizard (:3991), Settings (:11161) → `app/api/manage/verify-schedule-url/route.ts:157-239` (Puppeteer) | same as D | flash | browser review → `upsert_event` | as D; also sets `trucks.scraper_rule` (:226-229); the wizard sets `scraper_preference: 'auto'` (:4001), which enrols the truck in C |
| F | Admin screenshot upload | `/admin` → `components/admin/ScreenshotsPanel.tsx` → `app/api/admin/screenshot-events/route.ts:310-489` | `lib/admin/screenshot-events.ts:93-128` (gated by the classifier `lib/admin/truck-details.ts:44-64`) | flash (route :71) | POST `/api/inbound-schedule` (:370-382) | as C, plus `screenshot_log` |
| G | Apps Script, vendor email ("Process Schedule" label) | `processVendorEmails` (`docs/apps-script/village-foodie-v6.57.js:166`, reference copy) | `v6.57.js:516-531` | flash (:511) | Sheet → `mirrorEventsToSupabase` (:55-86, called :458) → `/api/inbound-schedule` | Sheet; then as C |
| H | Apps Script, Drive screenshots | `processFoodTruckScreenshots` (:571) | `v6.57.js:620-634` | flash (:618) | Sheet → mirror (:767) | Sheet; then as C |
| **I** | **hatchesup.co.uk importer (not in §51)** | by hand, `node scripts/import-hatchesup-schedule.js` | `import-hatchesup-schedule.js:509-536` | flash (:501-504) | POST `/api/discovery/ingest` (:719-731) | `discovery_events` |

The Apps Script line numbers are this reference copy's; the original script's lines are 26 lower (stated in the file header).

**These are not schedule-to-event paths:**
- the WhatsApp classifier and both WhatsApp webhooks (customer replies, read-only on `truck_events`);
- the Messenger and Instagram webhooks (TODO);
- the menu and allergen extractors;
- `scripts/extract-menus-preview.js` and `scripts/seed-hatchesup-trucks.js` (they list names and write no events);
- `scripts/migrate-from-sheets.cjs:158-161`. This one-off inserts straight into `discovery_events`, bypassing the gate, which contradicts the gate's header claim.

**Prompts on these paths that are not schedule extraction:**
- F's classifier (`truck-details.ts:44`);
- F's truck-details prompt (`truck-details.ts:105-133`);
- Pass A's postcode-suggester (`run-scraper.js:2392-2402`);
- the dashboard geocoder (`app/api/manage/geocode/route.ts:14-22`).

### 1.1 Shared machinery

**The discovery gate — `lib/discovery-gate.ts` `admitDiscoveryEvents` (:196-309).** A, B and I reach it through `app/api/discovery/ingest/route.ts:48`; C, F, G and H through `app/api/inbound-schedule/route.ts:88-91`. It is the only writer of `discovery_events` (apart from the one-off migration above).

- **Truck match (:234-237):**
  - First an exact trim+lowercase match on the name and every alias (`lib/schedule-match.ts:25-46`).
  - Otherwise `normName` (`lib/venue-matcher.ts:25-27`, which strips everything but a–z0–9) with **exact-or-containment either way, no minimum length**. The result goes to `discovery_events.discovery_truck_id`.
- **Venue match:**
  - `findVenue` (`lib/venue-matcher.ts:181-251`): token-overlap candidates, then village agreement, then a deterministic best pick. A 15 km ceiling (`VENUE_MATCH_MAX_KM`, :73) measured from the **village anchor** (the median of the village's venues, :89-107) can downgrade high to low (:122-129).
  - Then **R5** (`r5Accept`, :120-141):
    - a postcode sector found in `venue_name + village + ai_notes` must agree, using the UK regex `/\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i` (:103);
    - `high` is accepted;
    - otherwise the venue must be within 15 km of the village anchor (`R5_ANCHOR_MAX_KM`, :46);
    - on failure `venue_id` stays NULL.
  - With no candidate but a village, a **venue is created with no coordinates**: `upsert({ name, village, latitude: null, longitude: null, postcode: null }, { onConflict: 'name,village' })` (:246-252).
- **Duplicates (:144-193, :257-305):** same full postcode, within 500 m, identical coordinates, or name+time within 1,500 m. The newest wins; the loser gets `superseded_by` and `show_on_vf/hg = false`.
- **Write (:285-291):** upsert on `event_date, truck_name, venue_name` with `visibility: 'public', show_on_vf: true, show_on_hg: true`. `IncomingEvent` has **no postcode field** (:62-72), and neither does the table.

**The bridge — `/api/inbound-schedule` (route.ts:99-246), used by C, F, G and H.**

- **Truck match (:101-124):**
  - `discovery_trucks.select('hatchgrab_truck_id, name')` where linked;
  - `normName` exact-or-containment either way, on the **name only, not aliases**, with no minimum length;
  - the first match wins. No truck id is ever passed in, not even by C, which already knows `hgTruck.id`.
- **Gates:**
  - `scraper_preference === 'manual'` is skipped (:127-132);
  - reject memory on `rejected_event_signatures` (:143-151);
  - duplicate check on `venue_id` or a fuzzy name (:166-175).
- **Venue:** `findVenue` **without R5** (:77, :137). Coordinates come from the matched venue at any confidence, including `low` (:179-183).
- **Write:** `truck_events` insert (:191-231) with `status: 'unconfirmed'`, `source: 'scraper'`, `town: row.village`, `postcode: row.postcode || venuePostcode`, `venue_id`, `venue_id_source: 'scraper'` and `venue_match_confidence`.
- **Email:** one per bridged truck (:252-338). It selects `trucks.country` (:256), but only to format dates and times.

### 1.2 Per path — location lines, context, geocoder, validation, matching

**A — Scraper Pass A, events**
- **Location lines** (no "UK", "British" or "county" in this prompt):
  - :1253 `5. **VENUE NAME:** Extract ONLY the Business Name (e.g., 'The Plough'). DO NOT append the village.`
  - :1254 `6. **VILLAGE:** Extract the town, village, or city name. If it truly cannot be determined from the text, use "" …`
  - :1255 `7. **NOTES:** Postcodes, addresses, or extra event details go into the "Notes" field.`
- **Context given to the AI:**
  - `You are extracting food truck events for: "${site.name}".` (:1239). This is a truck **or** a venue name.
  - The site's `site.instructions` (:1243) and the runner's date.
  - **No country, no home area.**
- **Geocoder — only for venues judged new** (`newVenuesDetected`, :1532-1539):
  - Gemini acts as a **postcode suggester**. Prompt :2392-2402, verbatim opening: `You are a UK Geography data assistant. For each location below, give its UK POSTCODE.`
  - `resolveCoordinates` (`scripts/geo-validate.js:348-433`) then calls postcodes.io `/postcodes` (:261-276) and `/places?q=` (:283-331).
- **Validation** (`validateCoordinate`, :193-231):
  - `UK_BOUNDS {49.8–61.0, −8.7–1.9}` (:46);
  - null island rejected;
  - sentinel coordinates (shared by 5 or more venues);
  - fabricated decimals;
  - place ambiguity 10 km;
  - postcode vs village more than 10 km apart → the postcode is distrusted.
- **Venue match:**
  - The site is the venue, when the site is a venue page (:1515-1517).
  - Otherwise `resolveVenueFrom` (:637-686): a UK postcode regex first (:1520-1521), then a normalised name with 1-edit/containment and a village bonus.
  - Then the gate.
- **Truck match:**
  - The site is the truck, when the site is a truck page (:1485).
  - Otherwise `matchTruckIn` (:620-631): normalised name, 1-edit or containment, on names and aliases.
  - If nothing matches, a new truck is minted (`exclude_reason 'Yes - New Truck'`, :2306-2309).
- ⚠️ **Probable ordering bug (inferred from the code):** the gate POST (:2343) runs before the geocoder (:2382+), and creates `(name, village)` with null coordinates. The geocoder's `upsert(…, ignoreDuplicates: true)` (:2490-2496) then silently does nothing, so validated coordinates may never land.

**B — Scraper Pass A, rules**
- No UK lines.
  - :1208 `TRUCK NAME: "${site.name}"`
  - :1224 `6. VILLAGE: Extract the town, village, or city into a separate "village" field …`
  - example :1229 `"Wickhambrook MSC" / "Wickhambrook"`
- Context: truck name, year, hint text. No postcode is requested. Downstream is as A.

**C — Scraper Pass B (HatchGrab-linked trucks)**
- **UK lines, verbatim:**
  - :2111-2115: `TOWN RULES (IMPORTANT): ALWAYS populate "town". If the town/village is EMBEDDED inside the venue name, SPLIT it out — put the place-name in "town" and keep "venue_name" as just the pub/venue name. A UK place-name sitting next to a generic pub name (Bells/Star/Bell/Lion/Swan/Arms/Crown/Anchor, etc.) is the town, not part of the venue name.`
  - Examples :2117-2119: Cavendish, Lidgate, Long Melford.
  - :2121 `"postcode":"Postcode or empty"`.
- **Context:**
  - An `en-GB` date on the runner clock (:1978).
  - **Not even the truck's name.** It is attached afterwards (:2215).
  - The `hgTrucks` query (:1918-1924) selects `timezone` but **not `country`**.
- **Geocoder:** none. Coordinates come only from the bridge's venue match.
- **Postcodes are dropped on the discovery side:**
  - The payload sends `postcode` and no `ai_notes` (:2212-2224).
  - The gate never receives the postcode (inbound :88-90).
  - So R5 cannot use it, and it reaches only `truck_events.postcode`.
  - This also means §51.3's "C captures 0% postcodes because of its prompt" is a **data-plumbing** effect, not prompt wording.

**D/E — Operator importer (file, text or URL)**
- **UK lines, verbatim** (`lib/schedule-extract.ts`):
  - :47 `2. ENRICH missing fields using your knowledge of UK venues and locations`
  - :67 `- Extract ONLY the pub/venue name — never include village, town, or postcode in venue_name`
  - :68-70 examples: "The Fox Burwell", "The Red Lion Belchamp Otten CO10 7BQ", "Five Bells, Burwell, CB25 0EJ"
  - :74 `- UK postcodes follow the format: letters+numbers SPACE number+letters (e.g. "CB25 0BA", "CO10 7BQ", "PE28 2SB")`
  - :77 `- If you see a full valid UK postcode anywhere in the text for that event, extract it`
  - :87 `- If you have a venue name and town but no postcode → look up the UK postcode for that venue and provide it`
  - :88 `- If you have a venue name but no town → determine the town/village from your knowledge of that UK venue`
  - :94-104 examples (Belchamp Otten, Burwell, Wickhambrook)
  - :55 `Date format MUST be "DD/MM/YYYY"`. This is the output contract to the model, kept in every country (Phase 2B).
- **Context:**
  - Only `truckTimeSettings(truck)`: the zone for "today", and the locale for day names in the 14-day table (:31-41).
  - **No truck name, no country name, no area.**
  - The route already selects `id, timezone, country` (`process-schedule/route.ts:21-25`), so country is to hand.
- **After extraction:** a 5-entry `INVALID_VENUES` list (:12, exact match at :191-194). The venue-name exclusion `isExcluded` runs only in the Schedule-tab review (`page.tsx:8953-9007`). **The wizard's save (:4053-4072) skips it.**
- **Geocoder:** `geocodeLocation` (`page.tsx:7248-7265`) → `/api/manage/geocode`.
  - It sends Gemini (prompt :14-22) the string `[venueName, town, postcode, country || 'UK']` (:10).
  - **'UK' is always appended**, because the client never sends `country` (:7257).
  - **There is no validation at all:** no postcodes.io, no bounding box, no sentinel check. The client drops `confidence` (:7261), and the only warning is a `console.warn` (:8262).
  - Called at :4061 (wizard), :8126 (single edit) and :8258 (import save).
- **Write:** `upsert_event` → `app/api/manage/route.ts:1039`. The insert is at :1151 and the update at :1065, with `source: 'manual'` and Gemini's lat/lng.
- **Venue match:** **none against `venues`** (`venue_id` is never set). `resolveEventPlaceId` (:229-267) upserts `truck_places` on `(truck_id, name_key)` with `venue_id: null`, `area: town`.
- **Truck match:** none needed — the truck comes from the dashboard token.

**F — Admin screenshot.** Covered in §2.

**G — Apps Script, vendor email**
- No UK or postcode lines; :528 `"Venue Name": "Name", "Village": "Town"`. No postcode field.
- **Context:** the sender's existing upcoming events, as `dd/MM/yyyy (time) @ venue, village` (:219-242, :519). **This is the only path that shows the model a truck's prior locations.** It is the precedent for plan (d).
- **Geocoder:** Google Geocoding, :380 `address=… + eV + ", " + eVi + ", UK"`, takes `results[0]` with no validation. It writes the Sheet's Venues tab only.
- **Matching:**
  - `normalizeTruckKey` + containment `isFuzzyMatch` (:1261-1271) against the Sheet's Trucks tab (col 0 + aliases col 17) and Venues tab.
  - Village containment (:335-353).
  - Then the mirror → `/api/inbound-schedule`, fire-and-forget (:73-78).

**H — Apps Script, Drive screenshots**
- No UK or postcode lines; :633 `"Venue Name": "Name", "Village": "Town"`. :626 hard-codes `Never output 2023, 2024, or 2025.`
- **Context:** none apart from the date table.
- **Geocoder:** Google + ", UK" (:746), unvalidated, Sheet only.
- **Matching:** as G. Source `"Drive Screenshot"`.

**I — hatchesup.co.uk importer**
- **UK and location lines:**
  - :521 `"venue_name": "Venue or location name only — no town or postcode",`
  - :522 `"town": "Town or village name",`
  - :523 `"postcode": "UK postcode if present, else empty string"`
  - :531 `- venue_name: business name only — never include town or postcode.`
- **Context:** `en-GB` date and year only (:507).
- **Geocoder:** none.
- **Postcode never sent:** the rows at :698-712 carry no postcode and `ai_notes: null`.
- **Matching:** the gate only. The script also upserts `discovery_trucks` with `onConflict 'name'` (:685-686), using 1-edit + containment for names over 5 characters (:68-80).

### 1.3 Where §51 is out of date (beyond the count)

- **§51.2 row A** says Pass A writes `discovery_events` directly (:2312). It now POSTs to `/api/discovery/ingest`. §53.1 already says so, so §51 and §53 contradict each other.
- **§51.3 "same model"** is wrong: A uses flash-lite and C uses flash (`run-scraper.js:1042-1050, 1274, 2129`).
- **Many anchors have moved.** For example:
  - `geocodeLocation` :6563 → :7248;
  - geocode callers :3384/:6982/:7045 → :4061/:8126/:8258;
  - C's prompt :2075 → :2104;
  - `schedule-extract` :25 → :26;
  - inbound insert :212 → :191.
- **§51.7** lists four modules for F; the route now also imports `lib/email`, `lib/outreach-events`, `lib/admin/truck-details`, `truck-details-write` and `screenshot-log` (route :27-47).
- **Stale code comments:** `lib/admin/screenshot-events.ts:21-22, :185` cite lines in `schedule-extract` and `inbound-schedule` that have moved. The behaviour they describe (the postcode is dropped) still holds.

---

## 2. The admin screenshot upload as it stands

The flow is `components/admin/ScreenshotsPanel.tsx` (511 lines) → `app/api/admin/screenshot-events/route.ts` (578) → `lib/admin/screenshot-events.ts` (205) → `/api/inbound-schedule`. Logging is in `lib/admin/screenshot-log.ts`; truck details in `lib/admin/truck-details.ts` and `truck-details-write.ts`.

The panel is mounted at `app/admin/page.tsx:899` and **unmounts when the admin switches tab** (comment :891-898), so all of its state is lost then.

### 2.1 UI flow and state

**State**
- **Hooks (:97-106):**
  - `items: Item[]`, `dragOver`, `fatal`, `banner`, `paused`;
  - `logRows`, `migrationNotes`, `hasLog`, `lastProcessedAt`;
  - `filter: 'all' | ScreenshotOutcome`.
- **Refs:** `runningRef` (:107) is the concurrency gate; `consecutiveRef` (:109) counts non-content failures.
- **`Item` (:64-74):** `{ id, file, name, previewUrl, status: 'queued'|'running'|'done'|'error', result: FileResult|null, error, decided: string|null }`.
- **`FileResult` (:51-63):** `fileName, kind, outcome, summary, extracted, kept, dropped, written, bridged, prospectId, truckId, candidates, details, error, warnings`.

**Two layers of status**
- **Queue status:**
  - `queued`: "Waiting", chip "Queued"
  - `running`: "Reading…", chip "Reading"
  - `done`
  - `error`
- **Outcome** (`ScreenshotOutcome`, `screenshot-log.ts:22-24`; chips at `OUTCOME_CHIP` :28-35):
  - `schedule`: "Schedule"
  - `updated`: "Updated"
  - `new_truck`: "New truck"
  - `nothing_new`: "Nothing new"
  - `needs_a_look`: "Needs a look"
  - `failed`: "Failed"
- **Also:**
  - Colours are in `CHIP_CLASS` (:77-84) and filters in `FILTERS` (:86-88).
  - `decided` acts as a third state: `null` → `'working'` ("Saving…", :444) → the summary.
  - A parallel union `Outcome` with `'reading'` exists in `truck-details.ts:578-588` and is unused by the panel.

**Input**
- `add()` (:126-136) is the **single entry point** for:
  - drag-and-drop (:309-316);
  - the hidden file input (:330-336);
  - window paste (:206-213).
- It keeps `image/*` files over 0 bytes. Adding a file starts processing; there is no Upload button.

**Queue (:154-202)**
- One file at a time. FormData `files`, `waiting`, `consecutiveNonContent` → POST `/api/admin/screenshot-events`.
- **On failure:**
  - 401 / 5xx → `fatal`;
  - `data.paused` → a paused banner;
  - the row becomes `error`.
- **Retries:**
  - No automatic client retry. `retry()` (:229-233) re-queues error rows, and is reachable only from the paused banner (:284-293).
  - The server retries Gemini on 429/503 three times (route :64-87).

**What the admin sees**
- Intro lines (:274-281).
- Progress line ("Processing 3 of 12 · 9 waiting", "Last processed 22:51").
- Filter chips with counts from the server log.
- Rows in flight; finished rows with:
  - thumbnail;
  - name, linked to the prospect;
  - outcome chip and summary;
  - the "Needs a look" actions;
  - **dropped events with their reasons**;
  - warnings.
- A 7-day server log ("Today" / "Earlier").

**Persistence and controls**
- **None in the panel:**
  - no sessionStorage or localStorage;
  - no idle timer;
  - no `<select>`, dropdown or truck picker.
  - The only persistence is the server's `screenshot_log`.
  - The only other window listener is `beforeunload` while work is pending (:222-227).
- **Patterns to reuse:**
  - sessionStorage read after mount (`ProspectWorkspace.tsx:152-158`);
  - validated localStorage (`OutreachPanel.tsx:393-404`).
- **Existing confirm/dismiss pattern:** `decide(item, 'same_truck' | 'add_as_new', prospectId?)` (:235-256) → the route's `decide()` (:502-578). Its buttons render only when `outcome === 'needs_a_look' && !item.decided` (:428-443).

### 2.2 Where (a) the country dropdown and (b) a "held — another country" state would fit (not built)

**(a) A required, sticky Country dropdown**

- **Render it** between the intro (:274-281) and the drop zone (:303/:309). Block the zone until a country is chosen. One guard in `add()` (:126) covers drop, pick and paste.
- **State:** a new `country` beside the hooks at :97-106.
- **Sticky:**
  - Because the panel unmounts on a tab switch, React state alone will not survive. Use sessionStorage read after mount, in an effect near :124.
  - For the 30-minute idle reset: store a last-activity timestamp, bump it in `add()`, `decide()`, the queue effect and on change, and clear after 30 minutes. It sits with the listener effects at :206-227. Nothing like it exists yet.
- **Stamp the country on each `Item` at enqueue** (:130-135), so changing the dropdown mid-batch does not relabel queued files. Send it with `fd.append('country', …)` at :165-168; the route reads it beside `waiting`/`consecutive` (route :325-326).
- **Options** can come from `GET /api/admin/countries` (`app/api/admin/countries/route.ts`, via `lib/admin/country-actions.ts:72-78`; the marketing country comes first; client usage in `CountriesTab.tsx:47-57`). It returns every row, enabled or not. The US is `enabled = false` today, so Dominic must decide whether the dropdown lists disabled countries (see "Facts only Dominic can confirm").

**(b) A held outcome**

- **Status union:** add, e.g., `'held_country'` to:
  - `SCREENSHOT_OUTCOMES` (`screenshot-log.ts:22-24`);
  - `OUTCOME_CHIP` (:28-35);
  - `chipCounts` (:85-91, which lists its keys explicitly);
  - the panel's `CHIP_CLASS` (:77-84, literal Tailwind) and `FILTERS` (:86-88).
- **Constraint risk:** `screenshot_log.outcome` may carry a CHECK constraint. Its DDL is **not in `supabase/migrations`**, so this cannot be verified from the repo (SQL Q7 below checks it).
- **Server decision point:** after extraction and `filterScreenshotEvents` (route :364-369), and **before** the `/api/inbound-schedule` POST (:370-382). That POST writes `discovery_events` and emails operators.
  - The route returns no kept events today (only counts plus `dropped`).
  - A hold must therefore return them in `FileResult` (as `details`/`candidates` are for needs_a_look, route :266-285), so the client can send them back on confirm. Nothing is stored server-side.
- **Row rendering:**
  - Extend the amber border test (:401-402).
  - Add an action block beside :428-443 (Confirm as {country} / Dismiss), reusing the `decided` mechanics.
- **Handler:**
  - Extend the client `decide()`. It currently returns early unless `item.result?.details` (:236-237).
  - Add a route branch before `'Unknown action'` (:577). Note that `decide()` returns 409 from `socialColumnsReady()` (:507-508) **before** any branch, so a country action must come first or skip that check.

### 2.3 What the prompt returns per event today

**Three Gemini calls per file.** All use `gemini-2.5-flash`, temperature 0, JSON response (route :64-73).

1. **Classifier** (`truck-details.ts:44-64`). Returns `{ "kind": "schedule" | "truck_details" | "both" | "neither" }`; anything unparseable becomes `neither`.

2. **Schedule** (`screenshot-events.ts:93-128`, built once per request at route :344).
   - **Date context:**
     - `Today is ${now.toDateString()}`;
     - a 14-day `Monday = 13/10/2026` table on the **server's** clock (:95-103);
     - DD/MM/YYYY rules (:110-112, :122).
   - **Location rules, verbatim:**
     - :117 `- Each row names a FOOD TRUCK and the VENUE it is parked at. Put the trader in "Truck Name" and the pitch in "Venue Name".`
     - :118 `- Extract ONLY the pub/venue name into "Venue Name" — never include the village, town or postcode in it.`
     - :119 `- Put the town or village in "Village", and the postcode, if one is shown, in "Postcode".`
     - :120 `- UK postcodes look like "CB25 0BA", "CO10 7BQ", "PE28 2SB". If no postcode is shown, use "".`
   - **Per-event JSON:** `{ "DateStart", "TimeStart", "TimeEnd", "Truck Name", "Venue Name", "Village", "Postcode" }`. There is no country, state or confidence field.
   - **Parsing:** `parseScreenshotEvents` (:137-151) maps these to `{ event_date, start_time, end_time, truck_name, venue_name, village, postcode }`, with the postcode upper-cased.
   - **Filtering:** `filterScreenshotEvents` (:159-180) drops events with no truck, an excluded truck name (`discovery_exclusion_terms`, fuzzy :62-69), an invalid venue (:29-38) or no date.

3. **Truck details** (`truck-details.ts:105-133`).
   - Returns `{ name, email, phone, website, facebook, instagram, area }`.
   - UK lines:
     - :112 `keep +44, spaces, 0s`;
     - :120 `"area" — the town, city or area it says it serves (e.g. "Brighton and Hove")`.
   - **`normaliseUkPhone` (:162-185) discards any non-UK number**, so a +1 number is lost.
   - `area` and `website` go only into `outreach_prospects.notes` (`newTruckNotes`, :546-551).

**The hand-off** (`toInboundEvents`, `screenshot-events.ts:192-205`):
```
{ event_date: 'DD/MM/YYYY', start_time, end_time, truck_name, venue_name, village, postcode,
  event_notes: null, source: 'Admin Screenshot',
  ai_notes: `[🖼️ Admin upload: ${file}]${postcode ? ` | ${postcode}` : ''}` }
```
The postcode is copied into `ai_notes` on purpose, so R5 can see it.

**Back to the UI:** `{ fileName, kind, outcome, summary: "${written} events added", extracted, kept, dropped[], written, bridged, … }`.
- `written` is `inserted` from inbound, which is the number of rows **submitted**, not the number actually written (inbound :345).
- The kept events themselves are not returned.

**Truck identity in this flow:** only the AI-read "Truck Name", matched by the gate and the bridge (§1.1).

**Country in this flow:** there is none. The one touchpoint is the inbound email step selecting `trucks.country` for date and time formatting.

---

## 3. What we know about a truck's area today

### 3.1 Fields

| Table | Location columns | Country / state |
|---|---|---|
| `trucks` | **none**, apart from country. `provisionTruck` writes no location (`lib/provision-truck.ts:442-460`); `timezone` is null on all trucks | `country text not null default 'GB'`, FK to `country_settings` (`20261010_01…:29`, `…_05…:31-40`). No state |
| `operators` | none (13 columns, manual :11774) | none |
| `discovery_trucks` | none (`20260522_discovery_schema.sql:35-60`); `excluded` added in `20260703…:10` | none |
| `venues` | `village`, `postcode`, `latitude numeric(10,7)`, `longitude numeric(10,7)` (:8-26); unique `(name, village)` | none |
| `discovery_events` | `village`, `venue_id`, `discovery_truck_id` (:68-83); **no postcode or coordinates** (a postcode sometimes appears in `ai_notes`) | none |
| `truck_events` | `venue_name`, `town`, `postcode`, `address`, `venue_address`, `latitude`, `longitude` (base table, manual :11784); `venue_id`, `venue_id_source`, `venue_match_confidence` (`20260612…:5-12`); `truck_place_id` | none |
| `truck_places` | `name`, `address`, `postcode`, `area` (seeded from `truck_events.town`), `venue_id`; **no coordinates** (`20261003…:37-75`, `20261004…:44, 58`) | none |
| `subscribers` | `postcode`, `latitude`, `longitude`, `village`, `preferred_distance_miles default 20` (a **consumer's** radius) | none |

No home town, base location, service area, trading area, county or region field exists anywhere. `country_settings` already holds what a country-aware prompt would need (`address_format` 'postcode' | 'zip_state', `phone_country_code`, `date_order`, `default_timezone`, `timezones`; `lib/country-settings-types.ts:13-62`).

### 3.2 The truck-radius rule: documented, measured, not implemented

**The manual, verbatim** (`docs/reference-manual.md:17678`; also :2205, and `docs/scraper-reference-manual.md:1312-1318, :333`):
> 🔴 **TRUCK-RADIUS IS A REVIEW TRIGGER, NEVER AN AUTO-REJECT** — COMPACT 25 km / REGIONAL 50 km / WIDE 100 km. 🧪 **It catches 15 of 21 known-bad links and ACCEPTS the 44.1 km Swan mislink.** 🧪 **61% of trucks (105 of 173) have 0 or 1 anchor point** — a radius derived from one point is not a radius — **so those must HOLD, never accept and never reject.**

**The source is `docs/truck-radius-report.md` (8 Sept 2026, "No code proposed").**

**Anchors** are the distinct `venues` a discovery truck reached through **linked `discovery_events`**, after a coordinate check (§1.1 :37-45). The check removes:
- placeholder decimals;
- "sentinels" shared by 5 or more venues (12 venues sit on the GB centroid 55.3781, −3.4360);
- points outside the UK box;
- venues more than 5 km from their own postcode.

539 of 559 venues passed.

**Segment** is set by the median pairwise distance between a truck's venues (§2.3 :121-131; :265-270):

| Segment | Median pair distance | Ceiling | False-flag on today's links | Known-bad caught |
|---|---|---|---|---|
| COMPACT | ≤ 15 km | 25 km | 3.3% | 3/6 |
| REGIONAL | 15–45 km | 50 km | 5.1% | 7/10 |
| WIDE | > 45 km | 100 km | 3.4% | 5/5 |
| 0–1 anchor | — | none — **HOLD** | — | — |

**How it would work:**
- The distance is measured from the **venue centroid**. The report does not say whether that is a mean or a median.
- Anything beyond the ceiling is **flagged for review, never rejected**, and runs behind the postcode path (:263, :279).
- Of the low-anchor trucks, 64 have 0 anchors and 41 have 1. Together they hold only 11% of events (:139-153).
- Flagged cases were to go into a proposed `discovery_venue_candidates` table (§5). **That table does not exist.**

**Where it runs: nowhere.** No code contains COMPACT/REGIONAL/WIDE, `truckRadius`, `anchor_count` or `discovery_venue_candidates`. The distance rules that do exist are **village-centred**:
- `lib/venue-matcher.ts:73, 89-129` (15 km downgrade);
- `lib/discovery-gate.ts:46, 107-141` (R5, 15 km);
- duplicate checks at 500 m and 1,500 m;
- `scripts/linking-guards.ts` (offline backfill only: postcode 0.5/2 km, UK box);
- `scripts/geo-validate.js` (5/10/10 km, UK box);
- consumer distance in `lib/utils.ts:13`, `app/page.tsx:326`, `MapView.tsx:79-81`, `hooks/useVillageData.ts:126`.

**A related idea for HatchGrab trucks** — "history prior", needing 2 or more `venue_id_source IN ('operator','manual')` visits (manual :14550, :16212) — is scoped but not built. **Nothing writes `'operator'` or `'manual'`.** The bridge writes `'scraper'` (inbound :228-230), so validated anchors are zero by construction.

### 3.3 Can past events describe an area?

- **Towns:** yes.
  - `truck_events.town` comes from the manual form's "Area" (`app/api/manage/route.ts:1151`) and from the bridge (`town: row.village`).
  - `discovery_events.village` comes from the scrapers.
  - Caveat: about 70 village values are place descriptions, and 33 venues have a village equal to their own name (scraper manual :123).
- **Postcodes:** partial.
  - `truck_events.postcode`: on bridged rows, the scraped or venue postcode; on manual rows, what the operator typed, often blank.
  - `venues.postcode`: some partials (20 of 359 invalid at the time); gate-created venues have null.
  - `discovery_events` has no column; 1,104 of 4,300 rows carry a postcode inside `ai_notes`, mainly URL sources. Screenshot, manual-entry, hg_scraper and hatchesup rows carry none (manual :17667-17673).
- **Coordinates:** the weakest field.
  - Bridged `truck_events` copy the matched venue at any confidence.
  - Manual and imported `truck_events` carry **unvalidated Gemini guesses with "UK" appended**.
  - `venues` have postcodes.io-checked coordinates since 7 September, but gate-created venues have none (and see the ordering bug in §1.2 A).
  - `truck_places` has no coordinates.
- **Counties / states:** not stored anywhere. They would need a lookup (postcodes.io returns them for the UK, but they are only used as log labels in `geo-validate.js:274`).

**Conclusion.** A **towns list** is derivable for most trucks. A **centre plus radius** is derivable for roughly 2 in 5 discovery trucks, and for HatchGrab trucks only where scraper-bridged venue coordinates exist or by trusting Gemini coordinates. Run Q4/Q5 below for today's numbers.

---

## 4. Name matching across countries

Nothing in any matcher looks at country, phone prefix, domain or location.

| # | Where | How names are compared | US/UK same-name outcome |
|---|---|---|---|
| 1 | Ingest gate `lib/discovery-gate.ts:234-237` (A, B, C, F, G, H, I) | exact name/alias (trim+lower), else `normName` containment either way, no minimum length | US events attach to the UK `discovery_trucks` row |
| 2 | Bridge `app/api/inbound-schedule/route.ts:115-122` | `normName` containment either way, name only, first match wins | **US events written as unconfirmed `truck_events` into the UK operator's portal, plus an email** |
| 3 | Scraper `run-scraper.js:56-90, 620-631, 1491` | normalise (drops filler words and a trailing 's'), Levenshtein 1, containment, names and aliases; else mints a truck via `upsert(onConflict 'name')` (:2306-2309) | matched to UK, or the mint collides |
| 4 | Live unique index `discovery_trucks_norm_name_uniq` on `regexp_replace(lower(name),'[^a-z0-9]','','g')` | — | **a same-named US truck cannot have its own row**; inserts fail (scraper `dbWriteFailures`; screenshot `insertTruck`) |
| 5 | Public feed orphan fallback `app/api/discovery/events/route.ts:138-157` | exact normalised name | US orphan events borrow the UK truck's profile and visibility |
| 6 | Public name gate `app/page.tsx:65-74`; profile slug `createSlug` (`lib/utils.ts:177-186`, `TruckClient.tsx:46, 61`) | `washTruckName` + Levenshtein ≤ 1; slug equality | one page for both trucks, merged events |
| 7 | Graduation `app/api/admin/create-operator/route.ts:97` | `.ilike('name', shadowName)`, with `%`/`_` unescaped | excludes **every** same-named `discovery_trucks` row, UK or US |
| 8 | Outreach schedule tokens `app/api/admin/outreach/route.ts:43-80`, `lib/schedule-match.ts` | exact name/alias | shared `next_event_*` |
| 9 | Orphan flag `app/api/admin/discovery-events/route.ts:137-144` | `normalizeVenue` + `venuesFuzzyMatch` | most permissive |
| 10 | Screenshot → prospect `lib/admin/truck-details.ts:391-433` | Facebook, then website domain, then phone digits (+44 → 0), then email, then exact normalised name = **definite** | a US screenshot carrying only a name equal to a UK prospect's is merged with no prompt |
| 11 | Screenshot exclusions `lib/admin/screenshot-events.ts:62-69` | fuzzy against `discovery_exclusion_terms` | a UK exclusion term silences a US truck |
| 12 | Hatches Up importer `scripts/import-hatchesup-schedule.js:48, 68-80, 685-686` | normalise + 1-edit + containment (> 5 chars); `upsert onConflict 'name'` | merges |
| 13 | Apps Script `normalizeTruckKey` / `isFuzzyMatch` (`v6.57.js:1261-1271`); venue village optional (:949) | containment | merges |

**Only the id-keyed paths are safe:** `create-truck` promote with `discoveryTruckId` guarded by `.is('hatchgrab_truck_id', null)` (`app/api/admin/create-truck/route.ts:122-165`), and `lib/self-serve-discovery-link.ts:55-77`.

**For (c), what would stop the cross-country link:**
- A country on `discovery_trucks` included in every matcher above.
- The unique index changed to `(country, normalised name)`.
- The bridge given the truck id instead of a name. C already has `hgTruck.id`, and F could have it once a truck or country is chosen.
- Venue uniqueness extended beyond `(name, village)`.

---

## 5. Village Foodie exposure

**Every Village Foodie surface reads one API**, `app/api/discovery/events/route.ts`, through `hooks/useVillageData.ts:34`.

**Scraped events (:29-68, :92-96)**
- Reads `discovery_events`, joined to `discovery_trucks!discovery_truck_id` and `venues!venue_id` (including latitude and longitude).
- Filters: `show_on_vf = true` (:79), `event_date >= today`, `superseded_by is null`, limit 1000.
- Per-row gates: `excluded`, `show_on_vf` (:162, :165).

**Trucks list (:108-112, :377-396)**
- `discovery_trucks` where `show_on_vf` and not excluded.
- Orphan name fallback at :138-157.

**Operator events (:211-247)**
- `truck_events` joined to `trucks`.
- **`trucks.country` is not selected.**

**On HatchGrab hosts** scraped events are dropped entirely (:363).

**There is no country, bounding-box or postcode filter.** The defaults `show_on_vf = true` (`20260702_discovery_visibility_booleans.sql`), and the gate's explicit `show_on_vf: true`, make a US row public immediately.

| Surface | Reads | Would a US row appear today? |
|---|---|---|
| Home list (`app/page.tsx`) | the API; name gate `isEventVerified` / `washTruckName` + Levenshtein 1 (:54-74), drops `exclude_reason` containing "y" | **Yes**. With no visitor location, every event in the next 14 days (`useVillageData.ts:89-91`); a UK visitor with a location filters it out by distance (:123-130) |
| Map (`components/MapView.tsx`) | the API, never distance-filtered (`useVillageData.ts:152`) | **Yes**. `fitBounds` over all pins (:88-95) would stretch across the Atlantic. Default centre Suffolk `[52.24, 0.55]` (:139), which corrects J-04's "no fixed UK centre". OSM tiles are global |
| Postcode box | `getCoordsFromPostcode` → postcodes.io (`lib/utils.ts:24-36`) | A US visitor cannot set a location: "Could not find that postcode" (`app/page.tsx:157`) |
| `/trucks` (`app/trucks/page.tsx:9-15`) | the trucks list | **Yes** |
| `/trucks/[slug]` (`TruckClient.tsx:46, 61`) | slug from the name | **Yes**, and same-named trucks share a page. Metadata and OG come from the **Google Sheets** Trucks CSV, `locale: 'en_GB'` (`page.tsx:6-31`). `/trucks/` is disallowed in robots and noindex |
| `/venues/[slug]` (`VenueClient.tsx:16-24`) | API events by `getVenueSlug(name, village)`; metadata from the Sheets Venues CSV | **Yes**, merged with any same-named UK venue (unique `(name, village)`) |
| Sitemap (`app/sitemap.ts:30-42`) | only the home URL on Village Foodie hosts | No |
| Embed (`app/api/embed/events/route.ts:51-87`) and custom domains (`proxy.ts:150-172` → `app/domain/page.tsx:58-75`) | `trucks` + `truck_events` only | No discovery rows |
| Newsletter (Apps Script `runEmailJob`, `v6.57.js:840`) | `discovery_events` with the **anon key** (:874), **no `show_on_vf`, `excluded` or `superseded` filter**; venue fuzzy match where `vilMatch` is true if the village is empty or "tbc" (:949); subscribers geocoded `postcode + ", UK"` (:806); radius filter (:999) | Only if mis-pinned onto a UK venue — but then **yes**, with UK coordinates |
| RSS / OG image routes | none exist | — |

For (e), the minimum filter is `discovery_events` and `discovery_trucks` restricted to the site's market country, in this API and in the Apps Script newsletter query. It needs a country column (§8) and default visibility for non-GB rows set to false.

---

## 6. Outreach

**How prospects are created**
1. **A one-time backfill** (`20260903_outreach_tracking.sql:93-116`): one prospect per `discovery_trucks` row, `platform` derived from the `order_url` host. It is not re-run for later trucks.
2. **The admin Screenshots tab, truck-details path** (`app/api/admin/screenshot-events/route.ts:202-205` → `lib/admin/truck-details-write.ts:141-146`):
   - `hiddenTruckInsert` (`truck-details.ts:528-540`) creates `discovery_trucks` with `show_on_vf/hg = false`, contact email, mobile/phone (UK-normalised), Facebook and Instagram;
   - then `outreach_prospects { discovery_truck_id, stage: 'not_contacted' }`;
   - `area` and `website` go into `notes` only.
3. **No other inserter exists.** Everything else reads through the join `truck:discovery_trucks!outreach_prospects_discovery_truck_id_fkey(...)` (`app/api/admin/outreach/route.ts:152-155`).

**Linking and claiming**
- `create-truck` pre-fill copies name, cuisine and email (:44-45) and calls `provisionTruck` with **`country: 'GB'` hard-coded** (:102-103).
- `lib/provision-demo.ts:145-146` hard-codes `country: 'GB'`.
- Self-serve link by id (`lib/self-serve-discovery-link.ts:55-77`).
- Graduation by `ilike` name (§4 #7).

**Where a country would have to flow**

| Area | Code that assumes UK today |
|---|---|
| Send windows / "today" / snooze | `OUTREACH_TZ = 'Europe/London'` (`lib/outreach-mail-config.ts:62`), `OUTREACH_TIMEZONE` (`lib/outreach-attention.ts:67`, snooze at 08:00 London), `lib/outreach-sequence.ts:174`, `lib/outreach-timeline.ts:186`, `lib/outreach-workspace.ts:45, 59, 68`, `components/admin/OutreachPanel.tsx:682`, `lib/outreach-mail-message.ts:74-75`. No daily cap (`outreach-send-rules.ts:14`) |
| Template choice | `chooseTemplate` (`lib/outreach-sequence.ts:100-122`), keyed on channel × step × lead type. `LEAD_TYPES` (`lib/outreach-step.ts:29`). `on_vf` comes from `show_on_vf`, so a US prospect would be called "On the Village Foodie map". No country dimension |
| Tokens | `lib/outreach-template-render.ts:370-394`: no price or country token, `en-GB` dates (:111-115), `COMPARE_LINK` fixed (:831-832). `next_event_*` from an exact-name index (shared across same-named trucks) |
| Plans PDF | `generatePlansPdf('GB')` (`app/api/admin/outreach/attachments/route.ts:92-95`), with a comment to pass the prospect's country later |
| Phone / WhatsApp | `lib/whatsapp-hint.ts:35-44` (leading 0 → 44; only 447 counts as a mobile), used at `ProspectWorkspace.tsx:1578`; `normaliseUkPhone` discards +1 numbers |
| Sender / legal | `lib/outreach-mail-config.ts` (env names `OUTREACH_MAIL_USER`, `OUTREACH_MAIL_PASSWORD`, `OUTREACH_TEST_RECIPIENT` — set/missing, Dominic to confirm). Signature and opt-out are `outreach_settings` data (`lib/outreach-signature.ts`); opt-out by reply, no List-Unsubscribe; **no postal-address token** (CAN-SPAM, audit N-04) |

The manual's outreach section says "OUTREACH DATA MUST NOT HANG OFF `discovery_trucks`" (it has public read). So a prospect-level country may belong on `outreach_prospects`, derived from the truck — see §8.

---

## 7. Geocoding for the US

| # | Call site | What is sent | UK assumption | US address today |
|---|---|---|---|---|
| 1 | `lib/utils.ts:24-36` `getCoordsFromPostcode` (Village Foodie postcode box) | `api.postcodes.io/postcodes/{pc}`, no key | UK-only service | null, then an alert |
| 2 | `app/api/manage/geocode/route.ts:3-62` (Gemini 2.5-flash) | `[venueName, town, postcode, country \|\| 'UK']` (:10) | **'UK' always appended**, because the client (`page.tsx:7257`) never sends `country` | guessed or wrong coordinates, unvalidated, written to `truck_events` |
| 3 | `scripts/geo-validate.js` `resolveCoordinates` (scraper new venues), Gemini postcode suggester `run-scraper.js:2392-2402` | postcodes.io `/postcodes`, `/places` | UK prompt, UK postcode regex (:100), `UK_BOUNDS` (:46, :206-209) | usually no coordinates; but `/places?q=Cambridge` returns **UK** Cambridge, so a US town sharing a UK name gets a UK pin |
| 4 | `lib/discovery-gate.ts:246-252` | — (creates a venue, no coordinates) | UK postcode regex for R5 (:103) | no coordinates, or linked to a same-named UK venue |
| 5 | `app/api/inbound-schedule/route.ts:177-215` | copies venue coordinates | — | inherits the match |
| 6 | `scripts/linking-guards.ts:115, 214` | postcodes.io bulk; UK box | UK | UNCHECKED |
| 7 | Apps Script :380, :746, :806, :1435 | Google Geocoding `address=… + ", UK"` | **", UK" hard-coded** | biased to the UK; misplaced |
| 8 | Apps Script :1385-1389 | Google Places find / details / photo | none | would work |
| 9 | Directions links `components/EventListCard.tsx:257`, `VenueClient.tsx:52` | Google / Apple maps | none | work |

**Keys the code expects (names only; set/missing — Dominic to confirm):**
- `GEMINI_API_KEY`: Vercel `process.env`, 16 uses, including the geocode route :31. Also a GitHub Actions secret and an Apps Script property.
- `GOOGLE_API_KEY`: an **Apps Script property only** (Geocoding and Places). No Vercel code reads it.
- Related but not geocoding: `GOOGLE_SHEETS_CREDENTIALS`, `SPREADSHEET_ID`, `INBOUND_SCHEDULE_SECRET`, `HATCHGRAB_API_URL`.
- **There is no `GOOGLE_MAPS_API_KEY`, Mapbox key, or Nominatim/Mapbox call anywhere.** postcodes.io and OSM tiles are keyless.

**What could geocode a US address today:**
- **In the Vercel app:** only the Gemini route, and only if the client passed `country`. The route already accepts it; that is a one-line client change. It would still be unvalidated, and is the method the scraper abandoned for placeholder and centroid errors (`run-scraper.js:2370-2380`).
- **Real Google Geocoding** exists only in the Apps Script, with ", UK" hard-coded.
- **No US equivalent of postcodes.io** (ZIP centroid, place lookup) and no US bounding box exist in code.

---

## 8. Schema options (for discussion — nothing decided, no SQL files)

### 8.1 Where country (and US state) could live

**Option A — country on `discovery_trucks` only** (plus `state` nullable)
- *Pros:*
  - One field drives scoped name matching (c), the Village Foodie filter (e) and outreach.
  - The unique index can become `(country, normalised name)`.
  - Easy backfill: every existing row is GB.
- *Cons:*
  - A truck that trades in two countries is rare but possible.
  - Events and venues still have no country, so venue matching remains `(name, village)` and can cross borders.
  - It sits on a public-read table — fine for a country, unlike outreach data.

**Option B — country on `venues`** (plus `state`/region, and `postal_code` replacing or alongside `postcode`)
- *Pros:*
  - Location is a property of the place.
  - Fixes the `(name, village)` collision, by making the key `(country, name, village)` or `(country, state, name, village)`.
  - Lets the geocoder and validation choose a per-country path (UK box and postcodes.io vs a US box and ZIP).
  - `discovery_events` inherits country through `venue_id`.
- *Cons:*
  - The unique key change touches every venue upsert (`discovery-gate.ts:249`, `run-scraper.js:2490-2496`, the Apps Script).
  - Events with no venue still carry no country.

**Option C — country on `discovery_events`** (copied from the screenshot's chosen country or the source)
- *Pros:*
  - Records what the admin or source asserted at intake.
  - Lets the Village Foodie filter work even when `venue_id` is null (about half of rows).
  - Required to hold a single event that disagrees.
- *Cons:*
  - Duplicates truck and venue country; it can disagree with them, so it needs a rule for which wins.
  - One more column on a hot table.

**Option D — `truck_events` gets nothing new; use `trucks.country`**
- *Pros:*
  - HatchGrab events already belong to a truck with a country (FK to `country_settings`).
  - The bridge can enforce "discovery truck country = HatchGrab truck country".
- *Cons:*
  - If a US truck ever travels abroad, its events carry the wrong country.
  - A per-event `state` may still be wanted for US addresses (`address_format = 'zip_state'`).

**Option E — country on `outreach_prospects`** (derived from the discovery truck at creation, editable)
- *Pros:*
  - Matches the manual's rule that outreach data should not hang off `discovery_trucks`.
  - Drives send windows, templates, the plans PDF, phone formatting and the CAN-SPAM footer.
- *Cons:*
  - A second copy to keep in step with the truck.

The combinations usually considered are **A + B (+ E)**, with C optional for intake provenance and holds, or **A + C**, if venues stay UK-shaped for now. All need the `discovery_trucks_norm_name_uniq` index revisited.

### 8.2 How a truck's usual area could be stored or derived (for (d) and a future radius check)

**Option 1 — derive on read, no storage.** Compute towns, a centre, a radius or segment, and the anchor count from linked venues and events whenever a prompt or check needs them (the queries in Q4/Q5).
- *Pros:* always current; no new columns; follows the report's method exactly.
- *Cons:* query cost on every import; needs clean coordinates; HatchGrab manual events have no `venue_id`.

**Option 2 — cached summary columns or a side table**, e.g. `truck_area` (`truck_id` / `discovery_truck_id`, `anchor_count`, `centre_lat`, `centre_lng`, `median_pair_km`, `segment`, `radius_km`, `towns[]`, `admin_areas[]` such as counties or states, `computed_at`), refreshed nightly or after imports.
- *Pros:* cheap to read in prompts; the HOLD state (fewer than 2 anchors) is explicit; can be shown to the admin.
- *Cons:* goes stale; needs a refresh job; another table to keep honest.

**Option 3 — operator-declared base area on `trucks`** (`base_town`, `base_postal_code`, `service_radius_km`, optional coordinates), asked at signup or in Settings, used as a seed anchor until history exists.
- *Pros:* solves the cold start (61% of trucks have 0–1 anchors); the truck's own statement; works for a brand-new US truck.
- *Cons:* self-reported; needs a validated geocode per country; a new onboarding step.

**Option 4 — hybrid:** declared base (3) as a fallback, plus derived history (1 or 2) once 2 or more clean anchors exist.

All options must keep the documented rule: **far-away places are flagged for review, never rejected; fewer than 2 anchors means HOLD**.

For the AI prompt in (d), the inputs available today are:
- `trucks.country`;
- the towns list (`truck_events.town`, `truck_places.area`);
- the most recent N venues.

A pattern already exists in the Apps Script vendor-email prompt (G), which injects the truck's upcoming events (`v6.57.js:219-242`).

---

## Facts only Dominic can confirm

1. Whether `discovery_trucks_norm_name_uniq` is live, and its exact definition. It was applied directly to the database; the repo has only a script copy. (Q6)
2. Whether `screenshot_log.outcome` has a CHECK constraint. Its DDL is not in `supabase/migrations`. (Q7)
3. The `truck_events.latitude/longitude` column types (the base table predates the migrations folder). (Q1)
4. Which env vars are **set** in each environment (names only here):
   - `GEMINI_API_KEY`, `INBOUND_SCHEDULE_SECRET`, `HATCHGRAB_API_URL` and the `OUTREACH_MAIL_*` vars (Vercel);
   - `GEMINI_API_KEY` (GitHub Actions);
   - `GOOGLE_API_KEY`, `SPREADSHEET_ID` (Apps Script).

   For each: set/missing — Dominic to confirm.
5. Whether the deployed Apps Script matches `docs/apps-script/village-foodie-v6.57.js`. It is a reference copy; G, H and the newsletter run outside the repo.
6. Whether the hatchesup.co.uk importer (path I) is still in use, and whether `scripts/migrate-from-sheets.cjs` (gate bypass) can be retired.
7. Whether the admin country dropdown should list countries with `enabled = false` (the US today). `GET /api/admin/countries` returns all rows.
8. Whether US discovery data should go on a separate Village Foodie surface or be hidden until one exists. This shapes the defaults for (e).
9. Whether any truck already trades in more than one country (relevant to options A vs C).

---

## Read-only SQL (SELECT and catalog reads only)

Verified against the migrations:
- `trucks.id` is text; `truck_events.truck_id` → `trucks.id`; `truck_events.venue_id` → `venues.id` (uuid);
- `truck_places.truck_id` (text) → `trucks.id`; `truck_places.merged_into_id`;
- `discovery_trucks.hatchgrab_truck_id` (text) → `trucks.id`; `discovery_trucks.excluded`;
- `discovery_events.discovery_truck_id` → `discovery_trucks.id`; `discovery_events.venue_id` → `venues.id`; `discovery_events.superseded_by`.

**Q1 — location and country columns per table**
```sql
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('trucks','operators','discovery_trucks','venues','truck_places',
                     'discovery_events','truck_events','outreach_prospects','subscribers','country_settings')
  AND column_name ~* '(lat|lng|long|postcode|postal|zip|town|village|area|county|region|state|country|address|radius|location|home|base|city)'
ORDER BY table_name, column_name;
```

**Q2 — how often truck_events location fields are filled**
```sql
SELECT source, status,
  count(*) AS n,
  count(*) FILTER (WHERE nullif(btrim(town),'') IS NOT NULL)     AS has_town,
  count(*) FILTER (WHERE nullif(btrim(postcode),'') IS NOT NULL) AS has_postcode,
  count(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) AS has_coords,
  count(*) FILTER (WHERE venue_id IS NOT NULL)                   AS has_venue_id,
  count(*) FILTER (WHERE venue_match_confidence = 'low')         AS low_conf
FROM truck_events
GROUP BY source, status
ORDER BY source, status;
```

**Q3 — the same for discovery_events and venues**
```sql
SELECT count(*) AS n,
  count(*) FILTER (WHERE nullif(btrim(village),'') IS NOT NULL) AS has_village,
  count(*) FILTER (WHERE venue_id IS NOT NULL)                  AS linked_venue,
  count(*) FILTER (WHERE discovery_truck_id IS NOT NULL)        AS linked_truck,
  count(*) FILTER (WHERE ai_notes ~* '[A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2}') AS ai_notes_uk_postcode,
  count(*) FILTER (WHERE superseded_by IS NOT NULL)             AS superseded
FROM discovery_events;

SELECT count(*) AS n,
  count(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) AS has_coords,
  count(*) FILTER (WHERE nullif(btrim(postcode),'') IS NOT NULL)        AS has_postcode,
  count(*) FILTER (WHERE nullif(btrim(village),'') IS NOT NULL)         AS has_village
FROM venues;
```

**Q4 — anchors per HatchGrab truck.** This uses the report's clean-coordinate checks, minus the postcodes.io one. The UK box is in `good_venue`; widen or drop it for US rows.
```sql
WITH sentinel AS (
  SELECT round(latitude,4) AS la, round(longitude,4) AS lo
  FROM venues WHERE latitude IS NOT NULL AND longitude IS NOT NULL
  GROUP BY 1,2 HAVING count(*) >= 5
),
good_venue AS (
  SELECT v.id, v.latitude::float8 AS lat, v.longitude::float8 AS lng
  FROM venues v
  WHERE v.latitude IS NOT NULL AND v.longitude IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM sentinel s WHERE s.la = round(v.latitude,4) AND s.lo = round(v.longitude,4))
    AND v.latitude BETWEEN 49.8 AND 60.9 AND v.longitude BETWEEN -8.2 AND 1.9
),
te AS (
  SELECT e.truck_id, e.venue_id, e.town, e.venue_id_source,
         coalesce(gv.lat, CASE WHEN e.venue_id IS NULL THEN e.latitude::float8 END)  AS lat,
         coalesce(gv.lng, CASE WHEN e.venue_id IS NULL THEN e.longitude::float8 END) AS lng
  FROM truck_events e
  LEFT JOIN good_venue gv ON gv.id = e.venue_id
  WHERE e.status IN ('confirmed','open','closed')
),
anchors AS (
  SELECT truck_id,
         coalesce(venue_id::text, round(lat::numeric,3) || ',' || round(lng::numeric,3)) AS anchor_key
  FROM te WHERE lat IS NOT NULL AND lng IS NOT NULL
  GROUP BY 1,2
),
shadow AS (
  SELECT dt.hatchgrab_truck_id AS truck_id, count(DISTINCT gv.id) AS disc_anchor_venues
  FROM discovery_trucks dt
  JOIN discovery_events de ON de.discovery_truck_id = dt.id AND de.superseded_by IS NULL
  JOIN good_venue gv ON gv.id = de.venue_id
  WHERE dt.hatchgrab_truck_id IS NOT NULL
  GROUP BY 1
)
SELECT t.id, t.name, t.country, t.active,
  (SELECT count(*) FROM te WHERE te.truck_id = t.id)                         AS trading_events,
  (SELECT count(*) FROM anchors a WHERE a.truck_id = t.id)                   AS geocoded_anchors,
  (SELECT count(DISTINCT venue_id) FROM te WHERE te.truck_id = t.id
     AND te.venue_id_source IN ('operator','manual'))                        AS validated_venue_anchors,
  (SELECT count(*) FROM truck_places p JOIN good_venue gv ON gv.id = p.venue_id
     WHERE p.truck_id = t.id AND p.merged_into_id IS NULL)                   AS place_anchors,
  coalesce(s.disc_anchor_venues, 0)                                          AS shadow_discovery_anchors,
  (SELECT string_agg(DISTINCT initcap(btrim(town)), ', ') FROM te
     WHERE te.truck_id = t.id AND nullif(btrim(town),'') IS NOT NULL)        AS towns,
  CASE WHEN (SELECT count(*) FROM anchors a WHERE a.truck_id = t.id) < 2
       THEN 'HOLD (0/1 anchor)' ELSE 'measurable' END                        AS radius_status
FROM trucks t
LEFT JOIN shadow s ON s.truck_id = t.id
ORDER BY geocoded_anchors DESC, t.name;
```

**Q5 — anchors, centre, spread and segment per discovery truck**
```sql
WITH sentinel AS (
  SELECT round(latitude,4) AS la, round(longitude,4) AS lo
  FROM venues WHERE latitude IS NOT NULL AND longitude IS NOT NULL
  GROUP BY 1,2 HAVING count(*) >= 5
),
good_venue AS (
  SELECT v.id, v.latitude::float8 AS lat, v.longitude::float8 AS lng
  FROM venues v
  WHERE v.latitude IS NOT NULL AND v.longitude IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM sentinel s WHERE s.la = round(v.latitude,4) AND s.lo = round(v.longitude,4))
    AND v.latitude BETWEEN 49.8 AND 60.9 AND v.longitude BETWEEN -8.2 AND 1.9
),
dv AS (
  SELECT DISTINCT de.discovery_truck_id AS dtid, gv.id AS venue_id, gv.lat, gv.lng
  FROM discovery_events de JOIN good_venue gv ON gv.id = de.venue_id
  WHERE de.discovery_truck_id IS NOT NULL AND de.superseded_by IS NULL
),
cnt AS (SELECT dtid, count(*) AS n_anchors, avg(lat) AS c_lat, avg(lng) AS c_lng FROM dv GROUP BY dtid),
pairs AS (
  SELECT a.dtid,
    2*6371*asin(sqrt(power(sin(radians(b.lat-a.lat)/2),2)
      + cos(radians(a.lat))*cos(radians(b.lat))*power(sin(radians(b.lng-a.lng)/2),2))) AS km
  FROM dv a JOIN dv b ON a.dtid = b.dtid AND a.venue_id < b.venue_id
),
med AS (SELECT dtid, percentile_cont(0.5) WITHIN GROUP (ORDER BY km) AS med_pair_km FROM pairs GROUP BY dtid)
SELECT dt.id, dt.name, dt.hatchgrab_truck_id, dt.excluded,
  (SELECT count(*) FROM discovery_events de
     WHERE de.discovery_truck_id = dt.id AND de.superseded_by IS NULL)   AS events,
  coalesce(c.n_anchors, 0)                                               AS geocoded_anchors,
  round(c.c_lat::numeric, 5) AS centre_lat, round(c.c_lng::numeric, 5)   AS centre_lng,
  round(m.med_pair_km::numeric, 1)                                       AS median_pair_km,
  CASE WHEN coalesce(c.n_anchors, 0) < 2 THEN 'HOLD'
       WHEN m.med_pair_km <= 15 THEN 'COMPACT (25 km)'
       WHEN m.med_pair_km <= 45 THEN 'REGIONAL (50 km)'
       ELSE 'WIDE (100 km)' END                                          AS segment,
  (SELECT string_agg(DISTINCT initcap(btrim(de.village)), ', ') FROM discovery_events de
     WHERE de.discovery_truck_id = dt.id AND nullif(btrim(de.village),'') IS NOT NULL) AS villages
FROM discovery_trucks dt
LEFT JOIN cnt c ON c.dtid = dt.id
LEFT JOIN med m ON m.dtid = dt.id
ORDER BY geocoded_anchors DESC, dt.name;
```

**Q5b — the anchor distribution, to compare with the report's 64 / 41 / 68 of 173**
```sql
WITH sentinel AS (
  SELECT round(latitude,4) AS la, round(longitude,4) AS lo
  FROM venues WHERE latitude IS NOT NULL AND longitude IS NOT NULL
  GROUP BY 1,2 HAVING count(*) >= 5
),
good_venue AS (
  SELECT v.id FROM venues v
  WHERE v.latitude IS NOT NULL AND v.longitude IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM sentinel s WHERE s.la = round(v.latitude,4) AND s.lo = round(v.longitude,4))
    AND v.latitude BETWEEN 49.8 AND 60.9 AND v.longitude BETWEEN -8.2 AND 1.9
),
per_truck AS (
  SELECT de.discovery_truck_id AS dtid, count(DISTINCT gv.id) AS anchors
  FROM discovery_events de LEFT JOIN good_venue gv ON gv.id = de.venue_id
  WHERE de.discovery_truck_id IS NOT NULL AND de.superseded_by IS NULL
  GROUP BY 1
)
SELECT CASE WHEN anchors = 0 THEN '0' WHEN anchors = 1 THEN '1' ELSE '2+' END AS anchor_band,
       count(*) AS trucks
FROM per_truck GROUP BY 1 ORDER BY 1;
```

**Q6 — the normalised-name unique index, and any same-name collisions today**
```sql
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'discovery_trucks';

SELECT regexp_replace(lower(name), '[^a-z0-9]', '', 'g') AS norm, count(*) AS n, array_agg(name) AS names
FROM discovery_trucks GROUP BY 1 HAVING count(*) > 1;
```

**Q7 — `screenshot_log` columns and constraints**
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'screenshot_log'
ORDER BY ordinal_position;

SELECT tc.constraint_name, tc.constraint_type, cc.check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.check_constraints cc
  ON cc.constraint_name = tc.constraint_name AND cc.constraint_schema = tc.constraint_schema
WHERE tc.table_schema = 'public' AND tc.table_name = 'screenshot_log';
```

**Q8 — linked HatchGrab trucks whose names contain another linked truck's name (bridge-collision risk)**
```sql
WITH linked AS (
  SELECT id, name, hatchgrab_truck_id, regexp_replace(lower(name), '[^a-z0-9]', '', 'g') AS norm
  FROM discovery_trucks WHERE hatchgrab_truck_id IS NOT NULL
)
SELECT a.name AS name_a, b.name AS name_b
FROM linked a JOIN linked b ON a.id <> b.id AND position(a.norm IN b.norm) > 0;
```
