# Retiring the Google Sheet — the plan

**Date:** 8 September 2026 (evening) · **Mode:** READ-ONLY PLANNING. No code changed, no migration written or applied, no row inserted/updated/deleted, no Sheet cell modified, nothing staged. The only file written is this one.

**Evidence tags:** 🔎 SOURCE-READ (file:line quoted) · 🧪 EXECUTED (query or script output quoted) · ⚠️ inference, stated as such · 🔴 danger.

**Extensions searched:** none scoped. Every repo sweep was `grep -rn -I … .` / `find` with only `node_modules`, `.next`, `.git`, `docs`, `ios`, `android` excluded, so `.js`, `.cjs`, `.mjs`, `.ts`, `.tsx`, `.sql`, `.yml`, `.txt`, `.json` were all in scope. Each sweep's exit code and hit list is quoted below; one sweep (`--include=*`) failed on zsh globbing, printed `no matches found`, and **was re-run without the flag** — recorded in §9.

**The Sheet was read with the `spreadsheets.readonly` scope** (🔎 my scratch scripts declared only that scope), so a write was impossible from this session by construction.

---

## 0. Row counts and working tree — START and END

| | START (17:0x UTC) | END (17:37 UTC) |
|---|---|---|
| `discovery_events` | **4,300** | **4,300** |
| `discovery_trucks` | 231 | 231 |
| `venues` | 559 | 559 |
| `excluded_terms` | **0** | **0** |
| `scraper_run_log` | 415 | 415 |
| `discovery_run_log` | **404 — table does not exist** | 404 |
| `trucks` | 9 | 9 |

🧪 All via PostgREST `Prefer: count=exact` with the service-role key (RLS bypassed). *What a null result would look like:* a role subject to RLS would under-count identically at both ends. Ruled out: the same call reports `discovery_events` at 4,300 where the audit this morning saw 4,283 — the count moves when rows move.

⚠️ **Three counts differ from the manuals, correctly:** `discovery_events` 4,300 (V1.3 says 4,301 — one row fewer now; not this session), `venues` 559 (V1.3 §9.1 says 558 — one added since), `trucks` 9 (V12.4 says "ten trucks"). **Recorded, not investigated — out of scope.**

**`git status --short` START:**
```
 M app/admin/outreach/page.tsx
 M app/admin/page.tsx
 M docs/reference-manual.md
 M docs/scraper-reference-manual.md
?? components/admin/
?? docs/manual-update-2-report.md
```
**END:** identical, plus `?? docs/sheet-retirement-plan-report.md`. `HEAD` = `origin/main` = `6fe8634` throughout. Nothing staged.

**The Sheet, read live at 17:2x UTC (all `A2:Z`, non-empty rows):**

| Tab | gid | rows | headers (index) |
|---|---|---|---|
| Events | 0 | **725** | DateStart[0] TimeStart TimeEnd TruckName[3] VenueName[4] Village EventNotes EventSource[7] AINotes[8] **Status[9]** |
| Logs | 1208712248 | 506 | Timestamp Status Message |
| Trucks | 28504033 | **152** | TruckName[0] … Website[6] … ScheduleURL[8] LogoURL[9] … AIInstructions[14] Strategy[15] Photo Alias[17] IsMeal Exclude?[19] **SheetID[20]** |
| Venues | 1190852063 | **936** | VenueName[0] Village[1] Postcode[2] Lat[3] Lng[4] OwnerEmail Phone Premium Website ScheduleURL[9] AIInstructions[10] Strategy[11] PhotoURL[12] ScraperAliases[13] |
| Subscribers | 604913431 | 164 | SubmissionID RespondentID SubmittedAt YourPostcode postcode distance PreferredDistance Email Lat Lng Village |
| Unsubscribes | 1559605312 | 0 | SubmissionID RespondentID SubmittedAt Email |
| Vendor Ingest | 1189450474 | 1 (`#N/A`) | DateStart TimeStart TimeEnd TruckName VenueName |
| Manual Checks | 284103188 | 13 | Truck/Venue Link WhenToCheck |
| Facebook Posts | 1926055272 | 3 | Date Group Size Private/Public |
| Exclusions | 945651453 | **143** | ExcludedTerms |

🧪 Sheet properties: `locale: en_GB`, `timeZone: Europe/London`. **Ten tabs, confirmed.**

---

## 1. THE "ESTABLISHED" CLAIMS — EACH VERIFIED, THREE MOVED, ONE IS WRONG ABOUT THE CODE

| Claim in the prompt | Verified today | Verdict |
|---|---|---|
| The scraper reads four of ten tabs | 🔎 `run-scraper.js:38` `TABS = {EVENTS, TRUCKS, VENUES, EXCLUSIONS}`; `:436-440` one `Promise.all` of `getTabData` × 4; 🧪 ten tabs enumerated | ✅ |
| They drive the site list, matching, exclusions, dedup | 🔎 site list `:480-514`; truck matching `:888` (`validTrucks`); **venue matching `:928`, `:943` reads `venueData` rows directly**; exclusions `:453`/`:860`; dedup `:465-472`/`:1002` | ✅ — **but see the correction below** |
| 81 of 109 sites lack `schedule_url` | 🧪 109 sites enter `sitesToScrape`, 109 match a DB row, **81 Sheet-set/DB-null, 0 differ** | ✅ unchanged |
| 146 exclusion terms, `excluded_terms` 0 rows | 🧪 **143** in the tab now (146 → 143 this afternoon, `exclusions-provenance-report.md`); `excluded_terms` **0** | ⚠️ **143** |
| 345 venues the DB never received | 🧪 Sheet 936 rows / **897** distinct (name, village); DB 559 / 555 distinct; **Sheet-only 348, DB-only 6** | ⚠️ **348** (+3 since the audit) |
| aliases/strategy/instructions read from Sheet cols 17/15/14, DB copies 21/21, 42/42, 29/30 | 🔎 `:457` `r[17]`, `:484` `row[14]`, `:485` `row[15]` ✅. 🧪 today: **aliases 20/21 agree, strategy 41/42, instructions 30/30** | ⚠️ one alias row and one strategy row now disagree; instructions now fully agree |
| Six tabs are Apps-Script or human-only | 🧪 headers above; 🔎 no repo file names any of the six (§7 of the audit, re-swept below) | ✅ |

### 🔴 CORRECTION TO THE AUDIT AND TO V1.3 §3.3 — `validVenues` IS DEAD CODE; VENUE MATCHING READS THREE SHEET COLUMNS, NOT ONE

🔎 `:462` builds `validVenues = venueData.map(r => r[0])`. 🧪 `grep -n validVenues scripts/run-scraper.js` → **one hit, line 462. It is never read.** The scraper's venue matcher reads the raw rows: `:928` `venueData.filter(v => v[2] …)` (**postcode**, col C), `:943` `venueData.filter(v => … v[0])` (name), `:951` `match[1]` (**village**, col B).

**Why it matters for the migration:** the audit's R3 row says the DB equivalent of venue matching is `venues.name`. It is `venues.name + village + postcode`. 🧪 **The Sheet holds a postcode on 698 venue rows; the DB holds one on 400.** A name-only import would leave the postcode-first branch of the matcher (`:927-938`) with fewer targets than it has today. §3 carries that forward.

*What the "one hit" grep would look like if it proved nothing:* a grep that failed to run prints nothing and exits non-zero. It printed the `:462` line and the `venueData` lines around it in the same command, so it ran.

---

## 2. 🔴 THE TWO THINGS THAT MAKE THIS DANGEROUS

### 2.1 THE TOMBSTONE — measured today, designed here

**What the Sheet is doing for you right now.** 🧪 Fresh measurement using the scraper's **own** `normalizeName` / `isFuzzyMatch` / `standardizeDate` (copied verbatim from `:48`, `:60`, `:378`) and its exact `isDup` predicate (`:1002-1006`):

| | count |
|---|---|
| Sheet Events rows | 725 |
| …that enter the dedup set (date+truck+venue all present) | **698** |
| DB `discovery_events` with `event_date >= 2026-09-08` | **723** |
| DB future rows the Sheet set already calls DUPLICATE | **689** |
| DB future rows **invisible** to the Sheet set | **34** (`Manual Entry` 18, `URL:` 12, `hg_scraper` 2, `Manual entry 2026-09-07` 2) |
| 🔴 **Sheet-only future rows — THE TOMBSTONES** | **9** |

The nine, verbatim from the Sheet:

```
10/09/2026 | Buffalo Joe's     | Off The Beaten Truck - The Railway Arms
10/09/2026 | Guerrilla Kitchen | Off The Beaten Truck - The Railway Arms
10/09/2026 | Nomadough         | Off The Beaten Truck - The Railway Arms
10/09/2026 | Pizza Mondo       | Off The Beaten Truck - The Railway Arms
10/09/2026 | Tikka Tonic       | Off The Beaten Truck - The Railway Arms
10/09/2026 | Buffalo Joe's     | Saffron Walden (The Common)
11/09/2026 | Pimp My FIsh      | foodPark
11/09/2026 | Pimp My FIsh      | King Bill IV Pub, Histon
11/09/2026 | Pizza Mondo       | Alconbury Weald
```

That is the six Saffron Walden rows, **two** (not four — see below) Pimp My Fish rows, and **one new one** (`Pizza Mondo @ Alconbury Weald`) that was not in this morning's audit. ⚠️ **The prompt says "4 Pimp My Fish rows deleted on 8 September". 🧪 Two PMF rows are Sheet-only today, and V1.3 §9.3 records that the four `Manual entry` PMF rows are NOT deleted (all four present, `created_at = updated_at`). The audit's §4 item 3 listed three PMF Sheet-only rows this morning; one has since acquired a DB twin. So the figure is 2, and the "deleted on 8 September" part is not established for PMF — the manual already carries that as UNRESOLVED.** Whatever the history, the mechanism is the same: **every one of these nine returns on the first scrape after `DEDUP_FROM=db` unless something else remembers them.**

*What this measurement would look like if it proved nothing:* using the audit's stricter exact-string join would over-count invisibility and could mislabel a fuzzy-equal row as a tombstone. I used the scraper's fuzzy predicate in both directions, so a row is "Sheet-only" only if the **scraper itself** would not call it a duplicate — which is exactly the operational definition of "will return".

#### The design: a suppression table, not `deleted_at`

**Three shapes were considered. One is recommended.**

| Shape | How the scraper uses it | Why not / why |
|---|---|---|
| **A. `discovery_events.deleted_at`** | dedup set = future rows **including** soft-deleted | ❌ Every reader must add `deleted_at is null`: 🔎 the public feed `app/api/discovery/events/route.ts`, the admin unified table, the outreach `futureEventCount`, `backfill-venue-id.ts`, `linking-guards.ts`, the venue consolidation packs. **That is the "hand-picked subset" landmine class the app manual's standing rule exists for** (V8.9 item 2) — a documented class with instances still to sweep. And the row you want to suppress **may not be the row you deleted**: 🧪 the two PMF tombstones are the *as-scraped* names (`foodPark`, `King Bill IV Pub, Histon`); the DB rows carry hand-normalised names. A `deleted_at` on the normalised row does not match the scraped form. |
| **B. Sentinel row in `discovery_events` with a "suppressed" visibility** | same as A | ❌ Same reader sweep, plus it occupies the unique key with a row that means "do not exist". |
| **C. `discovery_event_suppressions` — a separate table of AS-SCRAPED triples** | dedup set = **union**(future `discovery_events`, all suppressions with `event_date >= today`), both rendered through the same builder | ✅ **Recommended.** No reader changes: nothing but the scraper reads it. It records **intent** (`reason`, `created_by`, `created_at`), which the Sheet never did. It stores the **as-scraped** form, which is what the scraper will produce again. And 🔎 **it is the shape this codebase already chose for the identical problem on the operator side:** `supabase/migrations/20260613_rejected_event_signatures.sql` — *"a rejected-then-deleted event stays suppressed because the signature persists here"* — read at `app/api/inbound-schedule/route.ts:163-171` **before** dedup. Same problem, same answer, already proven in production. |

**Shape of C (proposed; not written):**

```
discovery_event_suppressions
  id              uuid pk
  event_date      date        not null          -- ISO, like discovery_events
  truck_name_raw  text        not null          -- exactly as the Sheet/scrape carried it
  venue_name_raw  text        not null
  truck_key       text        not null          -- normalizeName(truck_name_raw), stored so SQL can match too
  venue_key       text        not null
  reason          text        not null          -- 'double-assignment' | 'duplicate-of:<id>' | 'wrong-venue' | free text
  suppressed_row  jsonb                         -- snapshot of the discovery_events row if one was deleted (reversal aid)
  created_by      text        not null          -- 'admin:<email>' | 'sheet-import-2026-09' | 'scraper'
  created_at      timestamptz not null default now()
  unique (event_date, truck_key, venue_key)
RLS on, service-role only, anon/authenticated revoked — the same three defences as discovery_run_log.
```

**Two rules that make C safe:**

1. 🔴 **The scraper matches suppressions with the SAME `isDup` predicate it uses for events** (`:1002` — string-equal date, fuzzy truck, fuzzy venue). A suppression that is compared any other way (exact match, SQL `=`) will let a one-character spelling variant through, and the scraper *produces* one-character variants (`Pimp My FIsh`). The union-then-`isDup` design gets this for free; a separate SQL-side check would not.
2. 🔴 **Deleting a discovery event in the new admin view MUST write the suppression in the same request** (delete + tombstone, one action) — otherwise the view recreates today's trap with a shorter fuse. The Sheet gave you a tombstone by accident; the app must give you one on purpose. A "delete without tombstone" needs to be a separate, labelled action ("remove and allow it to come back").

**Backfill before the flag flips:** the nine rows above → `created_by = 'sheet-import-2026-09'`, `reason = 'sheet-only at migration'`. 🧪 **The control run for `DEDUP_FROM` (step 5) then has a precise pass condition: the number of events the DB set calls NEW but the Sheet set calls DUPLICATE must be 0.** Any non-zero is a missing tombstone, named in the log.

**Window alignment:** 🧪 the Events tab holds rows from `2026-09-08` (today) to `2027-02-01`, none past. 🔎 The scraper itself drops anything `< todayZeroed` before dedup (`:840-846`). So the DB set is `event_date >= today` **in Europe/London** (the Sheet's `timeZone`), using the same `todayZeroed` the scraper already computes — not `now()` in UTC on the Actions runner, which crosses midnight an hour early in BST.

### 2.2 THE DATE FORMAT — where the conversion goes, and how a wrong one is caught before it ships

🔴 **The hidden dependency first, because nobody has written it down:** 🧪 `Events!A2:A6` with `valueRenderOption: UNFORMATTED_VALUE` returns **`[[46276],[46292],[46304],[46339],[46367]]`** — serial day numbers. **The cells are dates, not strings. `DD/MM/YYYY` is what the Sheet renders them as because its locale is `en_GB`.** The scraper reads with the default `FORMATTED_VALUE` and has never seen anything but that rendering. **So the `DD/MM/YYYY` the dedup relies on is a property of the spreadsheet's locale setting, not of the data, and it would change if the Sheet's locale did.** That is an argument *for* the migration, and a warning: there is no string in the pipeline today that the DB can copy — the DB has ISO and must render.

🔎 The comparison is `ex.date === cleanDate` (`:1003`), where `cleanDate = standardizeDate(event.DateStart)` (`:840`) — the model's `DD/MM/YYYY` output, zero-padded. The write path converts the other way: `event_date: toISODate(r[0])` (`:1710`, function `:28-35`).

🧪 **The failure mode, demonstrated on today's data:** with the DB set rendered `DD/MM/YYYY`, **689 of 723** DB future rows match the Sheet set. With no conversion — ISO string against `DD/MM/YYYY` — **0 of 723 match.** Not "some". Zero. Every event new, every run green.

**Where the conversion goes — ONE place, and not the two tempting ones:**

- ✅ **In the function that builds `existingEvents` from the DB** — a sibling of the `eventData.forEach` at `:466-472`, producing the identical `{ date, truck, venue }` shape, with `date` = `isoToDDMM(event_date)` (**`${d}/${m}/${y}`** from the ISO parts — the exact inverse of `toISODate`). Nothing downstream changes: `isDup`, `newRowsToAdd`, the Sheet append and `toISODate` at the DB write are untouched. **The flag selects which builder runs; the consumer cannot tell them apart.**
- ❌ **Not by converting `cleanDate` to ISO** — that is the value written to the Sheet (`:1011`) and pushed into `existingEvents` for same-run dedup (`:1024`); changing it touches the write path and the Sheet column at once.
- ❌ **Not in SQL** (`to_char(event_date, 'DD/MM/YYYY')`) — it works, but it puts the format contract in a query string the scraper cannot type-check and that a future `.select()` edit silently drops. Keep it in the one JS function whose inverse (`toISODate`) sits 8 lines away.

**How a wrong conversion is DETECTED rather than shipped — three independent catches, in order of when they fire:**

| # | Catch | Fires when | What it would miss |
|---|---|---|---|
| 1 | **Shape assertion at build time**: every DB-derived `date` must match `/^\d{2}\/\d{2}\/\d{4}$/`, and if the DB returned N ≥ 1 future rows the set must hold N entries. Throw → red run. | The runner, before a single page is fetched | A conversion that produces the right *shape* with day and month swapped (`MM/DD/YYYY`). Catch 2 exists for that. |
| 2 | 🔴 **The in-run control (step 5)**: build BOTH sets, evaluate every extracted event against both, and assert the two verdict lists are identical. **A swapped day/month agrees on the ~12 dates each month where `d == m` and disagrees on the rest — the diff is large and specific, and the log names each disagreeing row with both verdicts.** | The first control run, which ships with the flag defaulting to `sheet` | Nothing in this class. A date that both sources get wrong the same way is not a conversion error. |
| 3 | **Post-flip invariant, permanent**: across a whole run, `duplicates == 0 && extracted > 0 && sitesAttempted > 5` → throw. 🧪 Today 689 of 723 future events are already known, so a healthy run's duplicate count is in the hundreds. **Zero duplicates on a real run has exactly one cause.** | Every run, forever | A partial failure (some dates converting, some not) — but catch 1 refuses a mixed-shape set, so partial is not reachable. |

*What "689 match" would look like if it proved nothing:* if my `isoToDDMM` were wrong in the same way as a future scraper bug, the number would still be 689 against a wrong rendering. It cannot be: the 689 were produced by the **Sheet's** `DD/MM/YYYY` strings on one side, which I did not generate, and the mismatch case produced 0, which a wrong-both-ways bug could not produce.

---

## 3. THE TARGET SCHEMA — Q1

Principle: **the DB must be complete before it is authoritative**, and each tab maps to a table that already exists except where the prompt's own constraint forbids it (exclusions) or where nothing exists yet (suppressions, the explicit site list).

### 3.1 Trucks tab → `discovery_trucks` (exists, 28 columns)

| Sheet col | Read by scraper? | DB column | State today | Backfill |
|---|---|---|---|---|
| `[0]` Truck Name | ✅ `:456`, `:480` | `name` (unique — the upsert key `:1690`) | 🧪 109/109 sites match a row; 19 Sheet-only rows (all `Exclude?=Yes`, no URL — never scraped); **97 DB-only** | none for the 109; the 19 stay behind (they were never sites) |
| `[8]` Schedule URL ∥ `[6]` Website | ✅ `:483` `row[8] \|\| row[6]` | `schedule_url`, `website` | 🧪 `schedule_url` set on **26**; **81 Sheet-set/DB-null**; `website` set on 102 | 🔴 **81 rows** — and the DB site-list rule must reproduce `schedule_url ?? website`, or the trucks whose Sheet had only a Website drop out |
| `[14]` AI Instructions | ✅ `:484` | `ai_instructions` | 🧪 30 set, **30/30 agree** | none |
| `[15]` Strategy | ✅ `:485` (lower-cased, comma-split) | `scraper_strategy` | 🧪 43 set, **41/42 agree**, 1 differs; Sheet carries `Manual` ×3 (capital M) | 1 row; store lower-cased |
| `[17]` Alias | ✅ `:457` | `aliases text[]` | 🧪 21 non-empty, **20/21 agree** | 1 row |
| `[19]` Exclude? | ❌ **never read** (audit R-table; 🔎 only a write at `:906` `newTruckRow[19]='Yes'`) | `exclude_reason` (18 set) / `excluded` (55 true) | different meanings (audit §3) | none — do not conflate; the admin toggle is `excluded` |
| `[9]` Logo URL | ❌ by the scraper — ✅ **by `app/trucks/[slug]/page.tsx:24`** | `logo_url` | not measured | see §6 step 7 |
| `[20]` Sheet ID | ❌ outside the `A2:T` range | none | 🧪 1 row (Pizzeria Gusto → a **published CSV URL** of the operator's own sheet) | ⚠️ **UNKNOWN purpose** — nothing in the repo reads column U; possibly the retired `menu-loader` input. Flag, do not import |

🔴 **Missing column: an explicit site-list membership.** Today "is this a site" is the implicit rule at `:487-489` (`hasUrl || instructions.length > 10`). Recommend **`scrape_enabled boolean not null default false`**, backfilled `true` for exactly the 109, so the list is a column a person can read and toggle rather than a side-effect of two other fields. (Otherwise the spreadsheet view has to explain why editing an instruction to 11 characters starts scraping a truck.)

### 3.2 Venues tab → `venues` (exists, 17 columns)

| Sheet col | Read by scraper? | DB column | State today | Backfill |
|---|---|---|---|---|
| `[0]` Name, `[1]` Village | ✅ `:943`, `:951` | `name`, `village` (unique `(name, village)`) | 🧪 **348 (name, village) Sheet-only; 6 DB-only** (yesterday's hand inserts/consolidation targets) | 🔴 **348 minus the 16 consolidated losers** (V1.3 §9.1 — importing them re-creates the merge's losers) |
| `[2]` Postcode | ✅ **`:928`** — the postcode-first matcher | `postcode` | 🧪 **Sheet 698, DB 400** | 🔴 the postcode is a **matching target**, not decoration — import it for every row that has one |
| `[3]` `[4]` Lat/Lng | ❌ by the scraper (🔎 no `v[3]`/`v[4]` in the loop) — ✅ by the map via `venue_id` | `latitude`, `longitude` | 5 Sheet rows have none; ~1 in 5 Sheet coordinates are wrong (`geocoder-validation-report.md`) | 🔴 **through `scripts/geo-validate.js`**, postcodes.io first, gauntlet-refused ones land coordinate-less (the manage page shows "No location yet") |
| `[9]` Schedule URL | ✅ `:504` (venue-page sites) | `schedule_url` | 🧪 7 venue-page sites, 7 in DB, **1 with null `schedule_url`** | 1 row |
| `[10]` AI Instructions | ✅ `:505` | `ai_instructions` | 6 set | verify the 7 |
| `[11]` Strategy | ✅ `:503` | `scraper_strategy` | 🧪 107 set in DB; **but in the Sheet this column holds `[⚠️ NEW FROM SCRAPER]` on 342 rows** (the scraper writes its marker there, `:1806-1808`, and the code comment at `:1799-1802` records the collision) | 🔴 **must not be imported as a strategy.** Import `scroll_lazy` (7 rows) only; the marker becomes a `source = 'scraper'` value, not a strategy |
| `[13]` Scraper Aliases | ❌ never read (audit) | `aliases` | 18 non-empty in DB | optional |
| `[12]` Photo URL | ❌ by the scraper — ✅ **by `app/venues/[slug]/page.tsx:56`** | `photo_url` | not measured | see §6 step 7 |

### 3.3 Events tab → `discovery_events` (exists) **+ `discovery_event_suppressions` (new, §2.1)**

🔎 The append writes 9 columns A–I (`:1011-1021`) and the DB mirror maps all nine (`:1709-1719`). **Every Sheet column has a DB column.** `[9] Status` is 🧪 blank on all 725 rows — nothing writes it; **drop**.

🧪 The DB is the *fuller* record for events: 723 future vs 698 in the set; 34 DB rows the Sheet cannot see (Pass B, `Manual Entry`, hand rows). The Sheet is fuller only by the 9 tombstones. ⚠️ **Do not import the Events tab.** Import the **nine suppressions**, nothing else.

**Missing today, outside this plan's scope but named because the view will expose it:** `venue_id` and `discovery_truck_id` are never set by Pass A (V1.3 §2.5; 🧪 2,229 null, 316 of them future). The spreadsheet view will show 2,229 blank cells in that column. That is the truth, not a bug in the view.

### 3.4 Exclusions tab → 🔴 NOT `excluded_terms`. A NEW TABLE.

🔎 `supabase/migrations/20260604_exclusion_terms.sql:1-9` — `drop table if exists excluded_terms cascade;` then `truck_id text not null references trucks(id) on delete cascade`, `unique(truck_id, term)`. 🧪 The live OpenAPI agrees: `truck_id` NOT NULL, FK → `trucks.id`. 🔎 The scraper writes `{ term }` with `onConflict: 'term'` (`:792-794`) → **42P10 and 23502, every run since 4 June**, into `dbWriteFailures` (`:795`).

**What shape the global list needs, and why the two features must be SEPARATED, not shared:**

| | Operator feature (`app/api/manage/route.ts:2158-2182`) | Scraper global list |
|---|---|---|
| Meaning | *"**this truck** does not want events at venues matching this term"* | *"this string **is not a food truck**"* |
| Keyed by | `truck_id` (NOT NULL, FK, cascade on truck delete) | nothing — global |
| Normaliser | 🔎 `lib/schedule-extract.ts:13` — lower-case, strip punctuation, **keep spaces** | 🔎 `run-scraper.js:48` — strip stop-words (`the/street/st/food/ltd/co/company/and`), **strip spaces**, strip trailing `s` |
| Match | 🔎 `:21` `normVenue.includes(normTerm)` — substring | 🔎 `:860` `isFuzzyMatch` — 1-edit Levenshtein on the smashed string |
| Applied to | venue names of one truck's incoming events | **extracted truck names**, every site |

Three of the four rows differ. **Sharing the table would mean one column holding two normalisations and two match rules with nothing on the row saying which** — the exact anti-pattern the app manual records for `order_url` (V12.2). The sentinel-truck idea (a fake `trucks` row to satisfy the FK) puts a phantom operator into every `trucks` join and `lib/delete-truck.ts`'s cascade list. A nullable `truck_id` with a partial unique index re-admits the null-distinct trap of V1.1 §5.3 into the table that already has a working key.

**Recommended:**

```
discovery_exclusion_terms
  id          uuid pk
  term        text not null                  -- as written in the tab / by the model
  term_key    text not null unique           -- normalizeName(term), the value the scraper actually compares
  source      text not null                  -- 'sheet-import-2026-09' | 'scraper' | 'admin'
  hits_truck  text                           -- populated at import/insert when term_key fuzzy-matches a discovery_trucks.name — the poison flag
  created_by  text, created_at timestamptz default now()
RLS on, service-role only.
```

🧪 **Import guard, measured today: 5 of the 143 terms fuzzy-match a Sheet Trucks-tab name** — `Axle & Hop`, `Dessert MK`, `Just Baked by Sophie`, `The Linton Kitchen`, `Off The Beaten Truck`. Those five are the poisoned entries (the class that silenced Steak & Honour, `exclusion-check-position-report.md`). **Import them with `hits_truck` set and let the view show them red; do not silently drop them and do not silently keep them.** The same check becomes the guard the scraper's own `exclusionsToAdd` append still lacks (V1.3 §11.2 — STILL OPEN; its guard position collides with the awaited-writes hunk and waits for that commit).

---

## 4. THE SPREADSHEET-LIKE VIEW — Q2

### 4.1 What you actually do in the Sheet today (established from the data, not assumed)

🧪 The Sheet has **no formulas** in any scraper-read tab (only `Vendor Ingest` carries one), **no conditional formatting, no protected ranges, no data validation** on the columns a human edits (sampled `Trucks!M:T`, `Venues!L`, `Events!J`), and **basic filters on Events, Trucks, Venues** — i.e. you sort and filter. The whole "spreadsheet" you rely on is: **a grid, sort/filter, type-in-a-cell, paste a row, delete a row.** Nothing you rely on visually is computed. That makes the minimum honest.

From the reports and the tabs, the edits that happen are:

| Edit | Tab | Frequency | Replaces with |
|---|---|---|---|
| Add / fix a truck's schedule URL, strategy, instructions, aliases | Trucks | the main one | inline edit, 5 columns |
| Mark a new truck admitted (clear `Exclude?`) | Trucks | per new truck | the existing `excluded` toggle (already on `/admin`) |
| Fix a venue's village / postcode / coordinates; merge duplicates | Venues | weekly, hand SQL lately | inline edit 3 columns; merge stays a tool (`venue-consolidation` packs) |
| Delete a wrong event | Events | occasional, high stakes | **delete-with-tombstone** action |
| Add / remove an exclusion term | Exclusions | occasional | add/remove with the poison flag |
| Look at what the scraper produced last night | Events (sort by date) | daily | the same grid, plus `discovery_run_log` once it exists |

### 4.2 The surface — a fourth `/admin` tab, built like the outreach tab

**Carry it on `/admin`.** 🔎 `app/admin/page.tsx` already holds `adminTab: 'trucks' | 'features' | 'domains' | 'outreach'`, and as of this afternoon the Outreach console is a **tab rendered from `components/admin/OutreachPanel.tsx`** in its own wide container — a client table with sort, search, per-row optimistic patch through an **allow-listed** `PATCH` on `app/api/admin/outreach/route.ts:200-247`, `React.memo` rows, a modal for the long fields. **That is the spreadsheet pattern, already built and already used by you.** The new tab is *four of those*, one per table, with a sub-tab strip.

| Sub-tab | Table | Inline-editable (allow-list) | Read-only | Row actions |
|---|---|---|---|---|
| Trucks | `discovery_trucks` | `schedule_url`, `website`, `scraper_strategy` (select from `STRATEGIES`), `aliases`, `scrape_enabled`, `excluded`, `show_on_vf/hg` | `name`, `ai_instructions` (modal editor, not a cell), counts from events | "Scrape now" (→ `workflow_dispatch` with `TARGET_NAME` — later) |
| Venues | `venues` | `village`, `postcode`, `latitude`/`longitude` (**guarded**: must pass the gauntlet, else refused with the reason), `schedule_url`, `scraper_strategy`, `ai_instructions` (modal), `aliases` | `name` (🔴 renaming breaks the natural key of every event pointing at it by name and the `(name, village)` unique key — rename is a tool, not a cell), `created_at`, event count | "Merge into…" (later; today's packs) |
| Events | `discovery_events` | `show_on_vf`, `show_on_hg` | everything else — **the scraper's output is evidence, not a draft** | 🔴 **Delete + tombstone** (one action, asks for a reason); "Delete and allow it to return" as a separate labelled action |
| Exclusions | `discovery_exclusion_terms` | add / remove | `term_key`, `source`, `hits_truck` shown **red** | — |
| Suppressions | `discovery_event_suppressions` | — | all | "Lift" (delete the suppression — the event may return) |

**Width:** the same lesson as this afternoon — these tables need their own container outside `max-w-6xl`; the Trucks grid alone is ~12 columns.

**Bulk paste, CSV import, column filters, undo history, keyboard navigation, cell-range selection — NICE LATER, not the minimum.** The minimum is: see every row, sort, search, edit the ten columns above, delete an event safely, add a term. That replaces every edit in §4.1.

### 4.3 What "no test admin, sole admin" means for proof

🔎 Every admin route runs `verifyAdmin` server-side; the panel defers to it (`OutreachPanel.tsx` header). 🔴 **From this machine, the only reachable state of any admin surface is the gate** — 🧪 this afternoon's curl of `/admin` returned the gate HTML with zero tab labels in it (`outreach-tab` work). So:

- **What CAN be proven before you look:** the route handlers' allow-lists and validation as pure functions (import the module, call the reducer that builds `patch` from a body, assert unknown keys are ignored and bad enums 400) — the outreach route's `patch` builder is already that shape; `tsc -p tsconfig.json`; the unauthenticated response is 401/404 and **leaks nothing**; and, for reads, the **same query the panel runs** executed with the service key from a script, row counts compared to §0.
- **What CANNOT:** that a cell edit lands, that sort is right, that the delete-with-tombstone does both halves, that the table fits. **Those are proven only when you click.**
- **So the build order is dictated by that:** ship the **read-only** grid first (zero write risk; if it is wrong you see wrong numbers, nothing changes), you verify against the Sheet side-by-side, **then** enable edits **one column at a time**, each with its route returning the **post-write row from the DB** (not the optimistic value) so what you see after an edit is what is stored. And every write route logs `(table, id, column, before, after, who)` to a small `admin_edit_log` — the Sheet had version history; the app must not have less.
- ⚠️ **Cost:** I can estimate the read-only grid (it is the outreach panel with a different column list — under a day) and the per-column edits (an hour each with route + log). **I cannot estimate the guarded coordinate edit** — it depends on wiring `geo-validate.js`'s gauntlet into a Vercel route, and that module runs on Actions today; **unknown until tried.**

---

## 5. THE SIX NON-SCRAPER TABS — Q3

🧪 Repo sweep for each tab's name and its column headers, all extensions, exit 0: **no repo file names any of the six** except `migrate-from-sheets.cjs:175` (Subscribers, one-off, May). 🔎 The audit's `Logs` evidence and today's re-read agree.

| Tab | Who writes it (evidence) | What depends on it | Verdict | Outside-repo work |
|---|---|---|---|---|
| **Logs** (506 rows, 2026-09-07 23:38 → 2026-09-08 18:30) | 🧪 the Apps Script — two jobs: **"Started processing Vendor Emails" every ~5 min (227 in 19 h)** and **"Started processing Google Drive screenshots" (19 runs)**; also `Auto-Created & Geocoded New Venue from Screenshot` ×5 and `Mirrored N event(s) to Supabase` ×3 | nothing in repo; it is the only window onto the Apps Script | **STAYS until the script is retired or moved in-repo; then DROP.** Its successor is a `discovery_run_log`-shaped table the moved script writes | the script must be read: Sheet → Extensions → Apps Script. Its triggers and its **Supabase key location** (Script Properties, ⚠️ inferred) cannot be seen from here |
| **Subscribers** (164, first 2026-03-09, **last 2026-09-04**) | ⚠️ a form — Tally-shaped `Submission ID / Respondent ID / Submitted at` columns; `postcode/distance/lat/lng/village` are derived, **by whom is UNKNOWN** (a form add-on or the Apps Script) | 🧪 `subscribers` table 153 rows, **read by nothing in the repo** (only the one-off migrate script writes it) | 🔴 **STILL LIVE — submissions arrived four days ago.** MIGRATE: repoint the form's destination to an API route (`/api/subscribe`, service-role insert, honeypot + rate limit per §28), backfill the 11-row delta. Or explicitly declare the mailing list out of scope and say so on the form | the form's provider and destination setting — not visible from here |
| **Unsubscribes** (0 rows) | same form | nothing | goes with Subscribers; **0 rows means nobody has ever unsubscribed through it, or it is broken** — cannot tell which | same |
| **Vendor Ingest** (1 row, `#N/A`) | 🧪 a `LET/IMPORTRANGE` formula pulling `'My Schedule'!A2:G` from **another spreadsheet, `1VBNkjwk…`** — a vendor self-service schedule sheet; it currently resolves to `#N/A` (source unshared, moved, or empty) | ⚠️ possibly the "Vendor Emails / Process Schedule" Apps Script job; **nothing in the repo** | **DROP** — the operator schedule now lives in `/manage` (`truck_events`, Pass B). But **confirm the Apps Script does not read it first** | read the script; open `1VBNkjwk…` (I have no access to it) |
| **Manual Checks** (13 rows: truck, Facebook URL, weekday) | human | 🔴 **this is the Facebook-wall cohort from the silent-trucks finding** (33 of 57 silent trucks are logged-out Facebook walls, V1.3) — the tab is your manual workaround for the scraper's blind spot | **MIGRATE** — two columns on `discovery_trucks` (`manual_check_url`, `manual_check_cadence`) or a filter in the new view; trivially small | none |
| **Facebook Posts** (3 rows, Apr 2026: group, size, private/public) | human — an outreach log of community-group posts | nothing | **DROP or keep as a note** — it is about groups, not trucks; `outreach_prospects` is per-truck and does not fit. Low value | none |

🔴 **The one that matters is the Apps Script**, because 🧪 it holds a Supabase write key (the `Drive Screenshot` rows land in `discovery_events` at :30 past the hour with a source string the scraper cannot emit; **12 today**) and it **creates venues** (5 in 19 hours). Every step in §6 that touches dedup or venues is downstream of a writer I cannot read. **What has to happen to it:** (1) read it; (2) make it DB-only for events and venues; (3) stop it pruning the Events tab; (4) move it into this repo as a scheduled job so it stops being a second, unversioned copy of the extraction prompt (the app manual's backlog already lists this: "the two Apps Script paths AND the scraper's inline hgPrompt can move in-repo", `:13733`). **What I cannot determine:** its code, its triggers, its pruning predicate, whether it writes the Sheet or the DB first (which decides what happens on the day the Sheet is read-only), and where its key lives.

---

## 6. THE CUTOVER, STEP BY STEP — Q4

**Principles.** Additive first. One read moves at a time, behind a flag defaulting to `sheet`. **The control is run INSIDE one scrape, not across two:** pages change between runs and the page text differs even at `temperature: 0`, so two separate runs are not comparable. A `SCRAPE_CONTROL=1` mode builds **both** sources, fetches and extracts **once**, evaluates each decision against both, prints the diff, and **fails the run if the diff is non-empty** — while the flag still defaults to `sheet`, so production behaviour is unchanged until the diff is empty and you flip it. Each step leaves the pipeline working if the next never ships.

| Step | What changes | Must exist first | Rollback | **Proof in production** | Cost |
|---|---|---|---|---|---|
| **0. Open the eyes** | Apply `20260907_discovery_run_log.sql` by hand (🧪 404 today); add a reader — the run's red/green already goes to Actions, so at minimum a GitHub notification to you on failure, and a "last run" strip on the new admin tab | nothing | `drop table` | 🧪 the table exists in the OpenAPI spec; the 06:00 run writes one row per site (109 expected) | 1 h |
| **1. Backfill `discovery_trucks.schedule_url` (81) + add `scrape_enabled` (109 true)** | SQL pack from the Sheet's `[8] \|\| [6]`; store the pre-image | step 0 (so step 5's control has a log to point at) | UPDATE from the stored pre-image | 🧪 re-run today's divergence script → `Sheet-set/DB-null = 0`; `count(scrape_enabled) = 109` | 1–2 h |
| **2. `discovery_exclusion_terms` + import 143 + repoint the scraper's WRITE** | new table (§3.4); import with `hits_truck` set on the 5; change `:792` to write the new table **(this write has failed since 4 June, so repointing it cannot make production worse)**; keep the Sheet append | — | drop table; revert the one-line write | 🧪 143 rows; next run's `dbWriteFailures` no longer carries `excluded_terms` — visible because step 0 made the run log readable | 2–3 h |
| **3. Import the 348 Sheet-only venues minus the 16 consolidated losers, with postcodes, through the gauntlet** | SQL pack in tiers (resolved / held / no-coords) tagged `source = 'sheet-import-2026-09'`; **col L marker NOT imported as strategy**; postcodes imported for all 698 Sheet rows that carry one where the DB row lacks one | steps 0–1; a decision on the PROBABLE tier (V1.3 §9.1 — still open; importing a loser of an un-applied merge is harmless, importing a loser of an applied one is not) | DELETE where `source = 'sheet-import-2026-09'` (nothing else carries it) | 🧪 divergence script → Sheet-only (name, village) = 16 (the known losers), DB postcodes ≥ 698; §2.5's "matches only a Sheet-only venue" future column → 0 | half a day + review; 348 postcodes.io calls; **cannot estimate the review** |
| **4. `discovery_event_suppressions` + the 9 tombstones + the admin delete-with-tombstone action** | new table (§2.1); import the nine; the Events sub-tab's delete action writes both halves | step 0; the read-only view (so you can see what you are deleting) | drop table (the Sheet still holds the nine until step 8) | 🧪 9 rows; and the **`DEDUP` control in step 5 reports 0 "DB-new / Sheet-dup"** — that number IS the tombstone test | 3–4 h |
| **5. The four flags, one at a time, each through the in-run control** | `SITES_FROM`, `MATCH_FROM`, `EXCLUSIONS_FROM`, `DEDUP_FROM`, each `sheet\|db`, default `sheet`; a second builder per read producing the identical in-memory shape (§2.2 for dates); `SCRAPE_CONTROL=1` computes both and diffs. Order: **SITES → MATCH → EXCLUSIONS → DEDUP** (each later read depends on the earlier being right) | steps 1–4 | flip the flag back; the Sheet is still being written (step 8 has not run) so it is still complete | **Per flag, on a real 06:00 run:** control diff = 0 rows for ≥ 2 consecutive runs, printed in the log and in `discovery_run_log.notes`; then flip the default; then **the post-flip invariant (§2.2 catch 3) holds** and `duplicates` stays in the hundreds. For `SITES`: 109 = 109 with identical URL/strategy pairs. For `MATCH`: identical `finalTruck`/`finalVenue` per event. For `EXCLUSIONS`: identical skip list. For `DEDUP`: identical `newRowsToAdd` | 1–2 days for the builders + control; **the calendar cost is 8+ mornings of control runs**, not code |
| **6. Repoint the Apps Script** | outside repo: DB-only writes for events and venues, stop the Events-tab prune, stop writing the Events tab | step 5 `DEDUP=db` (else its rows vanish from dedup); reading the script | re-enable its Sheet writes | 🧪 `Drive Screenshot` rows keep arriving in `discovery_events` at :30 with no Sheet twin; the Events tab stops growing; venues it creates carry a `source` | **unknown — the script is unread** |
| **7. Replace the two published-CSV readers** | `app/trucks/[slug]/page.tsx:6,11` and `app/venues/[slug]/page.tsx:6,37` read the **master Sheet's** Trucks (gid 28504033) and Venues (gid 1190852063) tabs for `generateMetadata` (name + logo/photo). Read `discovery_trucks.logo_url` / `venues.photo_url` instead. Delete `lib/menu-loader.ts` (🧪 no consumer in the repo — dead) | nothing; independent of every other step | revert | 🧪 curl the two pages' served `<head>` — title and `og:image` unchanged for a known truck and venue | 2 h |
| **8. Stop the four Sheet appends; drop the two secrets from both workflows; drop `googleapis` from the scraper** | delete W1–W4 (`:784`, `:1677`, `:1703`, `:1812`) and the `getTabData` path; **both** workflows lose `SPREADSHEET_ID` and `GOOGLE_SHEETS_CREDENTIALS` | steps 5, 6, 7; the Subscribers decision (§5) | revert the commit; the secrets are still in GitHub until deleted separately | 🧪 both crons green **without** the two env vars; `discovery_run_log` shows 109 sites attempted | 2 h |
| **9. Archive, then revoke** | export the Sheet to XLSX into `docs/` (its version history does not export — accept that); remove `scraper-bot@village-foodie-maps.iam.gserviceaccount.com` from the share list; leave the file in Drive read-only | step 8 shipped and one week clean | re-share | the SA cannot read it (a scratch read fails 403) | 30 min |

**The dependency that is easy to miss:** 🔎 the Sheet read at `:436` is **unconditional** — it runs before `SCRAPE_MODE` is consulted for anything but logging. **The hourly Pass B (operator trucks) reads all four tabs and uses none of them.** Step 5's `SITES_FROM` builder should also gate the Sheet read itself on "any flag still says `sheet`", so that by the end of step 5 Pass B no longer touches the Sheet at all, a full step before step 8. Today, a Sheet outage stops operator schedule updates within the hour (§7).

---

## 7. WHAT BREAKS IF THE SHEET VANISHES TOMORROW — Q5

Blunt, in order of blast radius. "Vanishes" = the service account cannot read it (deleted, unshared, moved, ID rotated).

1. 🔴 **Both scraper crons go red on the first line of work and stay red.** 🔎 `getTabData` throws (`:394-395`); it runs unconditionally at `:436`. **That includes the hourly `hatchgrab_scrape.yml`**, so the three operator trucks' schedules stop updating within the hour — although Pass B never uses a byte of the Sheet.
2. 🔴 **No site list.** 🧪 81 of 109 sites' URLs exist nowhere else. Even after a code change to read the DB, 81 trucks are un-scrapeable until someone re-finds their URLs.
3. 🔴 **No venue matching targets.** 348 venues and **298 postcodes** exist only in the Sheet. Events at those venues would be written as `[⚠️ NEW VENUE]` and re-created (coordinate-less, under `ON CONFLICT DO NOTHING`) — and the venue-consolidation work re-runs.
4. 🔴 **No exclusion set.** 143 terms, 0 in the DB. Quiz nights and `TBC` become trucks.
5. 🔴 **No dedup set** — and **no tombstones**. If the DB set were built in a hurry without §2.1, the 9 suppressed rows return on the first run; if it were built without §2.2, 100% of events are new and the run is green.
6. **Social share cards break** for every `/trucks/<slug>` and `/venues/<slug>`: 🔎 both pages return `null` → generic title, no logo (`app/trucks/[slug]/page.tsx:30-33`). The page bodies (DB-driven) keep working. `/trucks/` is `Disallow`ed in robots.txt anyway, so no ranking is lost — but WhatsApp previews are.
7. **The Apps Script's screenshot pipeline** loses its Sheet writes. ⚠️ Whether it still writes `discovery_events` depends on the order of operations inside code I cannot read. **12 events arrived that way today.**
8. **The vendor-email job's log** (`Logs`) is gone; it may or may not keep running. Its output has no reader in the repo either way.
9. **Subscriber sign-ups are lost** — the form writes to the Sheet, the DB copy is a May snapshot, and 🧪 nothing in the app reads `subscribers` at all.
10. **The Manual Checks list** (13 Facebook pages and their check days) is gone.
11. **`Pizzeria Gusto`'s `Sheet ID` cell** — a published-CSV URL whose purpose is unknown — is gone; if something outside the repo uses it, that something breaks.

**What does NOT break:** the public map, ordering, the operator dashboards, KDS, payments, the outreach console, the admin console — all DB-only. 🔎 No file under `app/api/` or `lib/` reads the Sheet except the two share-card pages.

---

## 8. WHAT I CANNOT DETERMINE FROM HERE — Q6

Plainly, with no estimate attached:

- 🔴 **The Apps Script.** Its code, its two (or more) triggers, its Events-tab pruning predicate, whether it writes the Sheet or the DB first, where its Supabase key lives, whether it reads `Vendor Ingest`, and whether the `Auto-Created & Geocoded New Venue` path writes `venues` in the DB, the Sheet, or both. **Every venue and dedup step in §6 is downstream of it.** Sheet → Extensions → Apps Script is the only way in.
- **The Drive revision history** — who edited what, when. The Drive API is disabled on project `227274860029` (`exclusions-provenance-report.md`); the Sheets API exposes no history.
- **The subscription form** — provider, destination configuration, what fills `postcode/distance/lat/lng/village`, and whether `Unsubscribes` is empty because it works or because it is broken.
- **The `1VBNkjwk…` spreadsheet** behind `Vendor Ingest` — I have no access; whether it is a live vendor's sheet or an abandoned experiment.
- **`Trucks!U` "Sheet ID"** — one cell, a published CSV of the operator's own sheet; no reader in the repo. Purpose unknown.
- **Data validation outside the cells I sampled.** I read validation on `Trucks!P2:T3`, `Venues!L2:L3`, `Events!J2:J3`, `Trucks!M2:N3` (none) and conditional formats / protected ranges for every tab (none). A dropdown on a cell I did not sample would not show. Formulas were checked on rows 2–4 of every tab only.
- **`pg_indexes`, `pg_trigger`, `cron.job`** — unreachable through PostgREST (V1.3 §8.7). The `excluded_terms` unique key is known from the migration file and the OpenAPI `required` list, not from the catalogue.
- **The values of the GitHub Actions secrets**, and whether the repository secret `GEMINI_API_KEY` matches the Apps Script's (the app manual's own backlog item).
- **Costs** for step 3's review, step 6 entirely, and the guarded coordinate edit in §4.3.

---

## 9. METHOD NOTES — a failed command and a true negative must not print the same line

- 🧪 `grep -rn … --include=*` under zsh printed `no matches found: --include=*` and **did not run**. It was re-run without the flag (`menu-loader` consumers → 3 hits, all inside `lib/menu-loader.ts` itself). Recorded because 8 September already produced two false negatives from this exact shape.
- 🧪 `git rev-parse HEAD origin/main` as one call fails ("Needed a single revision"); run as two calls → both `6fe8634`.
- 🧪 The first Sheet-metadata read asked for a `dataValidation` field on `sheets(...)` that the API rejects (400) — the tab list and headers above came from the **first** call in that script, which had already printed before the second failed. The validation check was re-issued via `includeGridData` on specific ranges and succeeded.
- 🧪 The scratch Sheet reader could not resolve `googleapis` from the scratchpad path; it was copied into the repo root, run, and **deleted in the same command** (`rm -f`). `git status` at END confirms nothing of it remains.
- Every "none found" in this report names the command, its scope and its exit code.

---

## 10. WHERE THE DOCUMENTS ARE CONTRADICTED BY THE CODE OR THE DATA

| Document says | Actual | Consequence for the plan |
|---|---|---|
| Audit §1 R3, V1.3 §3.3: venue matching ← `validVenues` / `venues.name` | 🔎 `validVenues` is dead (`:462`, never read); matching reads name **+ village + postcode** from the Sheet rows (`:928`, `:943`, `:951`) | §3.2: import postcodes and villages, not names |
| Prompt / V1.2: 146 exclusion terms, 345 venues, 713 events | 🧪 143, 348, 725 today | numbers only |
| Prompt: aliases 21/21, instructions 29/30 | 🧪 20/21, **30/30** | two single-row backfills |
| Prompt: "4 Pimp My Fish rows deleted on 8 September" | 🧪 2 PMF rows are Sheet-only today; V1.3 §9.3 records the 4 `Manual entry` rows as **not** deleted | §2.1 — the tombstone list is 9, and PMF's deletion history stays UNRESOLVED as the manual has it |
| Audit §7: `lib/menu-loader.ts` is a published-CSV reader | it is, and 🧪 **nothing calls it** | step 7 deletes it; it is not a dependency |
| Audit §2: "No Sheet delete or update exists in this repo" | ✅ still true; 🧪 and the Events tab still holds 0 past rows — the external pruner is still running | §5, §6 step 6 |
| V12.2: "No API route and no admin page creates a venue" | true of the repo; 🧪 the Apps Script created **5 venues in the last 19 hours** (`Logs`) | the sentence is repo-scoped and reads as absolute; §5 |
| V1.3 §5.6: `excluded_terms` unique key "read from the live schema" | the OpenAPI exposes NOT NULL and the FK; the **unique** key comes from `20260604_exclusion_terms.sql:8` — `pg_indexes` is unreachable (§8.7) | none; both sources agree |

**No span of the prompt arrived garbled. No instruction contradicted another.** The one tension — "DB holds complete copies of everything except…" versus the postcode finding — is a completeness claim the prompt asked me to verify rather than assume, and it is answered in §1.
