# Google Sheet → Supabase migration audit

**Date:** 2026-09-08 · **Mode:** read-only. No table written, no migration written or applied, no Sheet cell modified, scraper not run.
**Tags:** 🔎 = source-read (file:line quoted) · ▶ = executed (query/script output quoted) · ⚠ = inference from evidence, stated as such.

Extensions searched for every repo-wide claim: `*` (no extension scoping) via `grep -rI` over `app lib scripts components .github supabase docs`, excluding `node_modules .next .git`.

## 0. Row counts and working tree — START and END

| | START | END |
|---|---|---|
| taken at (UTC) | 2026-09-08T10:03:22 | 2026-09-08T10:11:34 |
| `venues` | 558 | 558 |
| `discovery_events` | 4,283 | 4,283 |
| `discovery_trucks` | 231 | 231 |

▶ Both via `select('*',{count:'exact',head:true})` with the service-role key. Failure mode if this proved nothing: a count taken through a role subject to RLS would under-report identically at both ends; the service-role key bypasses RLS, and the same script produced 574→558 across yesterday's consolidation, so it does move when rows move.

`git status --short` at START: 27 `M`, 95 `??`, 0 staged, HEAD `801de1c` (local, ahead of `origin/main` `08ac368` by 1). END status is in §11.

The Sheet was read once, with the `spreadsheets.readonly` OAuth scope (▶ `othertabs.mjs`, `sheet.mjs` — scope string `https://www.googleapis.com/auth/spreadsheets.readonly`), so a write was impossible from this session by construction.

---

## 1. Every Sheet read, with tab, columns and database equivalent

▶ The Sheet has **ten** tabs, not four: Events, Logs, Trucks, Venues, Subscribers, Unsubscribes, Vendor Ingest, Manual Checks, Facebook Posts, Exclusions. The scraper reads four.

🔎 One read function, `getTabData` (`scripts/run-scraper.js:390-396`), range `${tab}!A2:T`, called for the four tabs in a `Promise.all` at `:436-440`, guarded by `assertSheetTabsLoaded` at `:448`. It throws on failure (V1.1 change). Everything below is derived from those four arrays.

| # | Line | Tab · column(s) read | Feeds | DB equivalent | DB population today (▶) | Verdict |
|---|---|---|---|---|---|---|
| R1 | `:453` | Exclusions · `A` (146 rows) | `excludedTerms` set; applied to each extracted truck name at `:851`, extended at `:790` | `excluded_terms.term` | **0 rows** | 🔴 no DB equivalent in practice |
| R2 | `:455-458` | Trucks · `A` name, `R` (`[17]`) aliases (152 rows) | `validTrucks` name/alias matching (`:871` region) | `discovery_trucks.name`, `.aliases` | 231 rows; aliases on 21 — **all 21 Sheet alias rows agree, 0 missing** | 🟢 DB equivalent complete for aliases |
| R3 | `:462` | Venues · `A` name (933 rows) | `validVenues` venue matching | `venues.name` | 558 rows vs 897 distinct Sheet (name,village) — **345 Sheet venues absent from DB** | 🔴 DB is the smaller set |
| R4 | `:466-472` | Events · `A` date, `D` truck, `E` venue (713 rows) | `existingEvents` dedup set | `discovery_events (event_date, truck_name, venue_name)` | 706 future DB rows; 699 visible to the Sheet set, 7 not | 🟡 near-equivalent, see §4 |
| R5 | `:483` | Trucks · `I` (`[8]`) Schedule URL, else `G` (`[6]`) Website | `sitesToScrape[].url` — **the site list** | `discovery_trucks.schedule_url` | 26 of 109 scraped sites have it; **81 have a Sheet URL and a null `schedule_url`** | 🔴 site list cannot be rebuilt from DB today |
| R6 | `:484` | Trucks · `O` (`[14]`) AI Instructions | `sitesToScrape[].instructions` | `discovery_trucks.ai_instructions` | 30 set; 29 byte-identical to Sheet, 1 differs by one byte (Marleys Pie & Mash, 586 vs 587 chars); **0 Sheet-set/DB-null** | 🟢 complete |
| R7 | `:485` | Trucks · `P` (`[15]`) Strategy | `sitesToScrape[].strategy` (default applied when blank; 67 of 109 blank) | `discovery_trucks.scraper_strategy` | 42 set, 42 agree case-insensitively, **0 missing** | 🟢 complete |
| R8 | `:504` | Venues · `J` (`[9]`) Schedule URL | venue-page sites | `venues.schedule_url` | not measured per-site (see §3) | 🟡 |
| R9 | `:505` | Venues · `L` (`[11]`) Strategy | venue-page strategy | `venues.scraper_strategy` | 107 of 558 | 🟡 |
| R10 | `:509` | Venues · `K` (`[10]`) AI Instructions | venue-page instructions | `venues.ai_instructions` | not measured | 🟡 |

Columns the scraper **does not read** although V1.1 or the migrate script implies otherwise: Trucks `T` (`[19]` *Exclude?*) — ▶ grep for `[19]` / `Exclude?` across all extensions finds one **write** (`:894`, `newTruckRow[19] = 'Yes'`) and no read in the scraper; the only reader is the one-off `scripts/migrate-from-sheets.cjs:72` (→ `exclude_reason`). So flagging a Sheet row *Exclude?* changes nothing about scraping; only removing its URL/instructions does. Venues `D/E` (lat/lng), `N` (`[13]` Scraper Aliases): not read by the scraper (🔎 no `row[3]`, `row[4]`, `row[13]` in the Venues loop `:500-512`).

Failure mode of the "DB population" column if it proved nothing: name-join by `[a-z0-9]`-normalised name between Sheet row and `discovery_trucks`; 109 of 109 scraped sites matched a DB row, so no site was dropped by the join.

## 2. Every Sheet write, and whether it is awaited

| # | Line | Tab | What | `await`? | DB mirror | mirror `await`? |
|---|---|---|---|---|---|---|
| W1 | `:784` | Exclusions | AI-proposed `exclusionsToAdd` (one append per term, inside `for…of`) | ✅ | `excluded_terms.upsert({term},{onConflict:'term',ignoreDuplicates:true})` `:792` | ✅ (error → `dbWriteFailures`) |
| W2 | `:1663` | Trucks | new truck rows (with `[19]='Yes'` set at `:894`) | ✅ | `discovery_trucks.upsert` `:1673` | ✅ |
| W3 | `:1689` | Events | `newRowsToAdd`, 9 columns A–I, date as `DD/MM/YYYY` | ✅ | `discovery_events.upsert(batch,{onConflict:'event_date,truck_name,venue_name'})` `:1708`, date via `toISODate` `:1696` | ✅ |
| W4 | `:1798` | Venues | new venue rows | ✅ | `venues.upsert({name,village,latitude,longitude,postcode},{onConflict:'name,village',ignoreDuplicates:true})` `:1833` | ✅ |

🔎 All four Sheet appends and all four DB mirrors are `await`ed as of the uncommitted working tree (`grep -n -B1 "from('…').upsert"` shows `await` on `:792`, `:1673`, `:1708`, `:1833`). V1.1 §3.2 ("two of the three DB mirrors are not") describes the pre-7-Sep code and is now wrong — §9.

**Ordering matters for the migration:** in every pair the Sheet append runs first and the DB mirror second. A DB failure after a Sheet success leaves the Sheet ahead (the shape observed for three months on venues). No write path goes DB-first.

**No Sheet delete or update exists in this repo.** ▶ `grep -n "clear\|batchUpdate\|deleteDimension\|values.update"` in the scraper: no hits (the two `clear` hits are `clearInterval`). Yet ▶ the Events tab holds **0 rows dated before today** while `discovery_events` holds 3,577. Something outside this repository prunes the Events tab. That pruner defines the dedup window (§4).

## 3. Divergence, measured (▶ `diverge.mjs`, `diverge2.mjs`, normalised-name join)

| Object | Sheet | DB | In Sheet, not DB | In DB, not Sheet | Notes |
|---|---|---|---|---|---|
| Trucks | 152 | 231 | **19** | **98** (39 `excluded`) | The 19 are all *Exclude?=Yes* with **no URL** (venues/events mis-added as trucks: *The Fox Inn, The Chequers, Trumpington Meadows Food Vans…*) — never scraped, no loss. Of the 98 DB-only: 55 have no event at all; 42 have events sourced `hatchesup_scraper`; 1 `hg_scraper`. ⚠ So the Hatches-Up path and Pass B write `discovery_trucks` without appending to the Sheet — the Sheet has already stopped being the complete truck register. |
| Site list (Trucks with URL or >10-char instructions) | 109 | 109 matched | — | — | `schedule_url` null for 81; strategy/instructions/aliases complete (§1 R5–R7). |
| *Exclude?* flag | 37 | `excluded=true` 56 | 24 flagged-in-Sheet not excluded in DB (19 no row + 5 rows with `excluded=false`) | 43 excluded-in-DB not flagged | Two independent flags that mean different things: Sheet = "auto-added, unverified" (`:894`); DB = admin master-hide gating the public API (🔎 `app/api/discovery/events/route.ts:146,254,339`). Neither is read by the scraper. |
| Venues | 933 rows / 897 distinct (name,village) | 558 / 557 distinct | **345** | **5** | 36 Sheet rows are exact (name,village) repeats; 5 have no lat/lng; 340 of the 345 have Sheet coordinates. 327 of the 345 are named by at least one `discovery_events` row, **62 by a future row**; 44 share a name with a DB venue under a different village text. The 5 DB-only are yesterday's hand inserts/consolidation targets (*Farndons at The Swan/Shefford, Great Paxton Village, Milton Community Centre, The Bell/Great Paxton, The Bell Inn/Castle Hedingham*). |
| Exclusions | 146 | 0 | 146 | 0 | Table also has a `truck_id` column and a second writer with a different conflict target (`app/api/manage/route.ts:2171` `onConflict:'truck_id,term'` vs scraper `:794` `onConflict:'term'`). Which unique index actually exists is unknowable through PostgREST; with 0 rows, neither writer has demonstrably succeeded. |
| Events | 713 (all future; dates `DD/MM/YYYY`, 713/713) | 4,283 (706 future) | 9 | 7 future / 3,577 past | §4. |
| Subscribers | 164 | `subscribers` 153 | ≥11 | — | Only reader of the table is `migrate-from-sheets.cjs` (▶ grep, all extensions). The form still lands in the Sheet; DB copy is a May snapshot. Out of scraper scope, listed for completeness. |

**Why the venue gap is 345 and not 0:** the migrate script (🔎 `scripts/migrate-from-sheets.cjs`, last commit `03d788f` 2026-05-22) copied Venues→`venues` once; ▶ `created_at` of the oldest imported events is 2026-05-22T14:58. After that, the venue mirror was fire-and-forget until 7 Sep and the `42P10`/`ON CONFLICT` failures documented in V1.1 §3.2 dropped every new venue on the DB side while the Sheet append succeeded. ⚠ Yesterday's consolidation deleted 16 DB venues, which are still in the Sheet, so the gap also contains rows the DB was *meant* to lose. A migration that blindly imports the 345 re-creates those 16 (§8, step 3).

## 4. The dedup set `existingEvents`

🔎 `:466-472`: for every Events-tab row, key = `standardizeDate(row[0])` (🔎 `:378-383`: zero-pads `DD/MM/YYYY`, otherwise returns input unchanged) + `normalizeName(row[3])` + `normalizeName(row[4])`. 🔎 `:988-992`: a scraped event is a duplicate if `ex.date === cleanDate` (string equality on `DD/MM/YYYY`) **and** `isFuzzyMatch` on truck **and** `isFuzzyMatch` on venue. 🔎 `:1010`: each accepted event is pushed so a run cannot duplicate itself.

**What it contains today (▶):** 713 rows, every one dated ≥ today (`2026-09-08 → 2027-02-01`), none in the past. So the set is *"every future event anyone has ever recorded in the Sheet"*, and its lower bound is maintained by the external pruner (§2), not by the scraper.

**What changes if it is built from `discovery_events`:**

1. **Date format.** DB stores ISO; the comparison at `:989` is on `DD/MM/YYYY`. A DB-sourced set must be re-rendered to `DD/MM/YYYY` (or `cleanDate` converted). Getting this wrong makes *every* event look new — the silent failure mode is 100 % duplicates with a green run.
2. **Window.** A DB query must reproduce "future only" (`event_date >= today`) or the set grows to 4,283 and the `some()` at `:988` becomes O(n·m) with fuzzy matching — fine at 4k, but past-dated rows should not be in the set anyway.
3. **Deletions stop sticking.** Today, deleting a row from the DB does **not** remove it from the Sheet, so the scraper never re-adds it. ▶ The 9 Sheet-only future rows are exactly that shape: 5 *Off The Beaten Truck – The Railway Arms* rows and 1 *Buffalo Joe's @ Saffron Walden (The Common)* dated 2026-09-10 (⚠ consistent with the 6 deletions applied from the Hatches Up comparison), plus 3 *Pimp My FIsh* rows under the scraped venue names (*The Affleck Arms*, *foodPark*, *King Bill IV Pub, Histon*) whose DB rows carry the hand-normalised names. **Once the set comes from the DB, any row deleted from `discovery_events` is re-inserted at the next scrape unless there is a tombstone.** This is the single biggest behavioural change of the migration and it is not a code-shape question — it needs a `discovery_event_suppressions` (or `deleted_at`) decision.
4. **Rows invisible to it today** (▶ 7 of 706 future DB rows are not in the Sheet):
   - 3 × `hg_scraper` (Pass B: *Pizzeria Gusto/Village Spice @ MSC, Wickhambrook MSC* 2026-09-18) — Pass B writes DB only, so Pass A can duplicate Pass B events with a different venue string;
   - 1 × `URL:` (*Elder Street Food @ The Common* 2026-09-17) — ⚠ a DB row whose Sheet twin was pruned or renamed;
   - **3 × `Manual entry 2026-09-07`** (Pimp My FIsh @ Affleck Arms / FoodPark CB1 / King Bill IV Pub). The prompt asked for the hand-inserted rows: 4 such rows exist in the DB (`Manual entry 2026-09` prefix, all created 2026-09-07T10:52), of the 9 the PMF pack inserted; 3 of the 4 are invisible to dedup and the scraper has already re-found them under different venue spellings (the 3 Sheet-only PMF rows above). **Flag:** 9 were inserted, 4 remain — 5 were deleted by something since; this session did not delete them (END = START counts across this audit), but the discrepancy is real and unexplained here.
   A DB-built set makes all 7 visible. It also makes the Pass A/Pass B duplicate pair (item 4a) visible *only if* the venue fuzzy match accepts `MSC` ≈ `Wickhambrook MSC`, which `isFuzzyMatch` token containment does.

Failure mode of the 699/7 measurement if it proved nothing: the join uses exact date + `[a-z0-9]` name equality, stricter than the scraper's fuzzy match, so it can only *over*-count invisibility; 7 is an upper bound.

## 5. Source-string conventions (▶ all 4,283 rows, prefix before first `:`)

| Prefix | Rows | Latest `created_at` | Producer | Reaches Sheet? |
|---|---|---|---|---|
| `URL: … \| Strategy: …` | 2,942 | 2026-09-07 11:41 | scraper Pass A, URL sites (🔎 `:984`) | yes (W3) |
| `Manual Entry` | 581 | 2026-09-07 11:41 | **scraper Pass A**, sites whose strategy is `manual`/`manual_single` (🔎 `:983`) — *not* a hand entry | yes |
| `Drive Screenshot` | 511 | **2026-09-08 06:31** | **not in this repo** (▶ string absent from all files, all extensions) | yes — 55 future rows on both sides |
| `hg_scraper:<strategy>` | 109 | 2026-09-08 02:21 | Pass B (hourly) | **no** |
| `hatchesup_scraper` | 108 | 2026-06-05 | one-off import | no |
| `Mobile Screenshot` | 9 | 2026-05-22 (migration) | external | yes (1 future row) |
| `Email Scheduler` | 6 | 2026-05-22 (migration) | external Apps Script (Logs tab row 1: *"Started processing Vendor Em…"*) | yes |
| `Manual entry 2026-09-07: …` | 4 | 2026-09-07 10:52 | hand SQL (this workstream) | no |
| `` (empty) | 12 | 2026-05-22 | migration residue | — |
| `manual` | 1 | 2026-06-04 | unknown | — |

**An external writer holds a Supabase write key.** ▶ `Drive Screenshot` rows were created in `discovery_events` at 2026-09-07 11:30–11:31 (10 rows) and 2026-09-08 06:30–06:31 (12 rows); the scraper cannot emit that string (🔎 only two source literals, `:983-984`) and has no Sheet→DB copy path (🔎 `eventData` is used once, `:466`, to build the dedup set). Both batches land at :30 past the hour, while every scraper write in the same window lands at :21, :41, :57, :58. ⚠ This is the Apps Script screenshot pipeline V1.1 §11 listed as unknown, and it writes to **both** stores itself. Any migration plan that "turns the Sheet off" must first find and repoint that script, or its rows keep flowing into a tab nothing reads and — more importantly — its DB writes prove it can be repointed with no scraper change.

The staleness/`Strategy:` parsing elsewhere in the app depends on the `URL:` prefix only through docs SQL; ▶ no runtime file contains `LIKE 'URL:%'`.

## 6. The unlinked backlog as a migration constraint (▶)

2,219 of 4,283 rows have `venue_id IS NULL` (306 of the 706 future rows). Split by where the venue name lives:

| The unlinked row's `venue_name`… | all | future |
|---|---|---|
| …matches a `venues.name` exactly (normalised) — link findable now | 1,563 | 263 |
| …matches only a **Sheet-only** venue (the 345 of §3) | 729 | 84 |
| …matches neither | 116 | — |

(rows can match both, so columns overlap.) Constraint: **84 future events can only be linked after the 345 Sheet venues are in the DB**, and 340 of those carry Sheet coordinates produced by the old geocoder that `geocoder-validation-report.md` found wrong for ~1 in 5 venues. Importing them "as is" imports that error rate into the map; importing them through `scripts/geo-validate.js` costs one postcodes.io call per venue and puts the un-resolvable ones (5 with no coords + whatever fails the gauntlet) into the "No location yet" state the manage page now shows. Either way the import must happen **before** the matching switch (§8 step 4), or the scraper will re-create these venues from the events it finds, under the ON-CONFLICT-DO-NOTHING rule at `:1833`, and yesterday's coordinate corrections will not apply to them.

## 7. What else touches the Sheet (▶ repo-wide grep, all extensions; ▶ tab read)

**In this repo**
- `scripts/run-scraper.js` — the four reads and four appends above; both workflows (`.github/workflows/daily_scrape.yml:43-57`, `hatchgrab_scrape.yml:51-64`) pass `GOOGLE_SHEETS_CREDENTIALS` and `SPREADSHEET_ID`; the hourly Pass B run therefore also reads all four tabs even though it writes none.
- `scripts/migrate-from-sheets.cjs` — one-off (2026-05-22), reads Trucks/Venues/Events/Exclusions/Subscribers, writes five tables; not scheduled.
- Published-CSV readers: `app/trucks/[slug]/page.tsx`, `app/venues/[slug]/page.tsx`, `lib/menu-loader.ts` (from the earlier sweep; unchanged).
- Nothing reads Logs, Subscribers, Unsubscribes, Vendor Ingest, Manual Checks or Facebook Posts.

**Outside this repo (evidenced, not readable from here)**
- Apps Script *Email Scheduler*: writes Logs (506 rows, latest 2026-09-07 16:13), Vendor Ingest (1 row, `#N/A`), and historically `Email Scheduler` events.
- Apps Script *Drive/Mobile Screenshot*: writes Events tab **and** `discovery_events` directly (§5).
- The Events-tab pruner (§2).
- A form (Tally-shaped IDs) writing Subscribers/Unsubscribes.
- Human-only tabs: Manual Checks (13 rows: truck, link, weekday), Facebook Posts (2 rows: outreach log).

## 8. The plan — independently shippable steps, each with a rollback

Ordering principle: **make the DB complete before making it authoritative**, and switch one read at a time so a failure is one symptom, not four.

| Step | What ships | Cost | Proof it worked | Rollback | Blocks |
|---|---|---|---|---|---|
| **1. Backfill `discovery_trucks.schedule_url`** for the 81 sites | one SQL pack from the Sheet (`[8]||[6]`), UPDATE where null | ~1 h; 81 rows | Sheet-vs-DB site list equal (re-run §3 join: 0 Sheet-set/DB-null) | UPDATE back to null | nothing |
| **2. Import Exclusions → `excluded_terms`** (146 terms) | SQL pack; needs the unique-index question answered first (`term` vs `truck_id,term`) — a one-line `pg_indexes` query run by hand | ~1 h | `count(*) = 146`, scraper `:792` upsert stops erroring | DELETE where `truck_id IS NULL` | nothing |
| **3. Import the 345 Sheet-only venues, minus the 16 consolidated losers, through `geo-validate.js`** | SQL pack in three tiers as before (resolved / held / no-coords) | ~half a day incl. review; 340 postcodes.io calls | §3 venue gap → 0 except the 16; §6 "Sheet-only" column → 0 | DELETE by a `venue_id_source='sheet-import-2026-09'` marker | step 4 |
| **4. Switch the four reads to the DB, one flag each** (`SITES_FROM=db`, `MATCH_FROM=db`, `EXCLUSIONS_FROM=db`, `DEDUP_FROM=db`), default `sheet` | scraper change; `existingEvents` from `discovery_events where event_date >= today`, rendered `DD/MM/YYYY`; **plus the tombstone decision (§4 item 3)** | 1–2 days incl. a control run per flag | Control run with flag on and off produces identical `newRowsToAdd` (log diff) | flip flag | steps 1–3 |
| **5. Repoint the screenshot Apps Script** to DB-only and stop pruning the Events tab | outside repo | unknown; needs the script | `Drive Screenshot` rows keep appearing in DB with no Sheet twin | re-enable Sheet append in the script | step 4 (dedup) |
| **6. Stop the four Sheet appends** (keep reads off) | delete W1–W4; drop the two secrets from both workflows | 1 h | workflows run without `GOOGLE_SHEETS_CREDENTIALS` | revert commit | steps 4, 5 |
| **7. Migrate Subscribers** or declare it out of scope | separate | — | — | — | none |

Not proposed: any change to `venue-matcher`, `geo-validate`, or the `venues` unique constraint — they are not Sheet dependencies.

**Cost summary:** steps 1–3 are data only and can ship this week by hand; step 4 is the only scraper change and carries the two silent-failure modes named in §4 (date format; deletions reappearing); step 5 is the unknown, because the script is not in this repo.

## 9. Where `docs/scraper-reference-manual.md` (V1.1) is now wrong

| Line | Says | Actual |
|---|---|---|
| `:172` | "SUPABASE mirrors ← 2 of 3 NOT AWAITED" | all four mirrors awaited (`:792`, `:1673`, `:1708`, `:1833`) |
| `:262` | reads at `:422-427` | `:436-440` (calls), `:390-396` (function), `:453-509` (column reads) |
| `:264` | writes at `:1550`, `:1530`, `:1607`, `:672` | `:1689`, `:1663`, `:1798`, `:784` |
| `:266-270` (§3.2) | "Two of the three DB mirrors are not [awaited]" | none un-awaited; the *observed* three-month gap is real and is the 345-venue divergence in §3 |
| `:262`, `:279` | "all four tabs" | the Sheet has ten tabs; the scraper reads four; six are Apps-Script/human tabs |
| `:280` | aliases/strategy/instructions "not from the database" | true, **but** the DB copies are complete (21/21, 42/42, 29/30 agree); the only incomplete field is `schedule_url` (26/109) |
| `:310` | truck matching at `:762-792` | `:871` region |
| `:324` | dedup at `:881` | `:988-992`; and the set is *future-only* because an external pruner empties the tab of past rows |
| `:348` | exclusions normalised `:430`, applied `:744`, upsert `:688` | `:453`, `:851`, `:792` |
| `:399` | `excluded_terms` — "UNREAD" | unread by the scraper, correct; but it is **written** by the scraper (`:792`) and read+written by `app/api/manage/route.ts:2160-2180` with a different conflict key; 0 rows |
| `:448` | "`excluded_terms` (which the app's manage route also reads)" | it reads per-`truck_id` terms — a different feature from the scraper's global list; sharing the table is a latent conflict |
| `:461` | Apps Script pipeline "not in this repository… whether it creates venues itself [unknown]" | still not in the repo, but ▶ it writes `discovery_events` directly (§5) — it holds a write key |
| §5 source conventions (wherever `Manual Entry` is described as manual) | — | `Manual Entry` is emitted by the scraper for `manual`/`manual_single` sites (`:983`) |
| `:455` | "The Google Sheet… uncounted" | counted here: 152/933/713/146 rows |

## 10. Things flagged, not resolved

- 9 PMF `Manual entry` rows inserted on 7 Sep; 4 remain. Not deleted by this session (counts unchanged START→END). Unexplained.
- The 6 rows removed after the Hatches Up comparison are still in the Sheet's dedup set — which is *why* they have not come back. They will come back at step 4 without a tombstone.
- `excluded_terms` unique index: cannot be determined through PostgREST; needs a hand query before step 2.
- The `created_at` timestamps of `Drive Screenshot` rows prove a direct DB writer exists; its identity and key are inferred (⚠), not read.
- No instruction in the prompt contradicted another; no span arrived garbled.

## 11. `git status --short` at END

```
 M .gitignore
 M app/admin/page.tsx
 M app/api/cron/custom-domain-check/route.ts
 M app/api/manage/route.ts
 M app/landing/page.tsx
 M app/manage/[token]/page.tsx
 M app/o/[slug]/page.tsx
 M components/EventListCard.tsx
 M components/dashboard/CustomDomainSetup.tsx
 M components/dashboard/DemoWelcome.tsx
 M components/dashboard/types.ts
 M components/landing/LandingFooter.tsx
 M docs/reference-manual.md
 M ios/App/App.xcodeproj/project.pbxproj
 M lib/custom-domain/copy.ts
 M lib/custom-domain/dns.ts
 M lib/custom-host.ts
 M lib/landing-table.ts
 M lib/meta/webhook-signature.ts
 M lib/plan-features.ts
 M lib/ratelimit.ts
 M lib/venue-matcher.ts
 M lib/whatsapp/connection-state.ts
 M proxy.ts
 M public/badges/README.md
 M scripts/run-scraper.js
 M vercel.json
?? app/admin/outreach/
?? app/api/admin/outreach/
?? app/api/manage/whatsapp-signup/
?? app/order/[id]/page.tsx
?? components/StoreBadges.tsx
?? components/dashboard/CopyButton.tsx
?? docs/android-golive-landing-report.md
?? docs/copy-button-report.md
?? docs/custom-domain-404-report.md
?? docs/custom-domain-fixes-report.md
?? docs/custom-domain-verification-report.md
?? docs/demo-provisioning-report.md
?? docs/geocoder-validation-report.md
?? docs/hatches-up-comparison-report.md
?? docs/hatches-up-import-report.md
?? docs/hatches-up-recheck-report.md
?? docs/hatches-up-reconciliation-report.md
?? docs/hatches-up-source-report.md
?? docs/hatchesup-events.csv
?? docs/hatchesup-online-ordering.csv
?? docs/hatchesup-online-ordering.md
?? docs/hatchesup-ordering.csv
?? docs/hatchesup-trucks-tagged.md
?? docs/hu-columns-build-report.md
?? docs/hu-columns-report.md
?? docs/hu-reconciliation-report.md
?? docs/local-dev-host-report.md
?? docs/order-link-outage-report.md
?? docs/order-route-rename-report.md
?? docs/order-url-routes-report.md
?? docs/outreach-manual-dates-report.md
?? docs/outreach-modal-report.md
?? docs/outreach-modal-v2-report.md
?? docs/outreach-page-report.md
?? docs/outreach-phone-and-sort-report.md
?? docs/outreach-phone-column-report.md
?? docs/outreach-platform-edit-report.md
?? docs/outreach-tab-report.md
?? docs/outreach-ui-fixes-report.md
?? docs/pimp-my-fish-manual-events-report.md
?? docs/pimp-my-fish-source-report.md
?? docs/platform-detection-report.md
?? docs/privacy-policy-processors-report.md
?? docs/rls-policy-report.md
?? docs/rls-verification-report.md
?? docs/scraper-audit-report.md
?? docs/scraper-diagnosis-queries.sql
?? docs/scraper-diagnosis-report.md
?? docs/scraper-reference-manual.md
?? docs/sheet-migration-audit-report.md
?? docs/sql/
?? docs/store-badges-report.md
?? docs/trucklist.txt
?? docs/venue-consolidation-report.md
?? docs/venue-coords-and-run-log-report.md
?? docs/venue-creation-diagnosis-report.md
?? docs/venue-creation-fix-report.md
?? docs/venue-link-apply-report.md
?? docs/venue-linking-report.md
?? docs/venue-linking-scope-report.md
?? docs/venue-matcher-fix-report.md
?? docs/venue-pipeline-report.md
?? docs/vf-map-events-report.md
?? docs/whatsapp-connections-build-report.md
?? docs/whatsapp-connections-fk-fix-report.md
?? docs/whatsapp-embedded-signup-s4-s5-report.md
?? docs/whatsapp-embedded-signup-scope-report.md
?? docs/whatsapp-embedded-signup-v4-report.md
?? docs/whatsapp-extraction-report.md
?? docs/whatsapp-golive-build-report.md
?? docs/whatsapp-golive-copy-report.md
?? docs/whatsapp-golive-decision-report.md
?? docs/whatsapp-golive-heading-report.md
?? docs/whatsapp-threshold-report.md
?? docs/whatsapp-token-expiry-report.md
?? docs/whatsapp-token-issued-at-report.md
?? docs/whatsapp-v4-landed-report.md
?? lib/app-badges.ts
?? lib/clipboard.ts
?? lib/custom-domain/alert.ts
?? lib/custom-domain/check.ts
?? lib/outreach.ts
?? lib/whatsapp-hint.ts
?? lib/whatsapp/connection-read.ts
?? lib/whatsapp/embedded-signup.ts
?? lib/whatsapp/token-crypto.ts
?? public/badges/GetItOnGooglePlay_Badge_Web_color_English.svg
?? scripts/geo-validate.js
?? supabase/migrations/20260903_hu_presence_flags.sql
?? supabase/migrations/20260903_outreach_contact_name.sql
?? supabase/migrations/20260903_outreach_dnc_entity.sql
?? supabase/migrations/20260903_outreach_tracking.sql
?? supabase/migrations/20260903_whatsapp_confirmed_nullable.sql
?? supabase/migrations/20260904_whatsapp_connections.sql
?? supabase/migrations/20260904_whatsapp_connections_token_issued_at.sql
?? supabase/migrations/20260907_discovery_run_log.sql
```

Summary: 27 modified, 96 untracked (the 95 at START plus this report), 0 staged; HEAD `801de1c`, ahead of `origin/main` by 1. No file was staged, committed or pushed by this audit.

Row counts END = START (§0): venues 558, discovery_events 4,283, discovery_trucks 231.
