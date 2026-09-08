# Why few trucks appear on the map — 🔴 IT IS NOT THE SCRAPER

**7 September 2026. 🔴 NOTHING WAS CHANGED. No file edited, no commit, no push, no deploy, nothing staged. Production is `main` at `08ac368`. `git add -A` / `git add .` never run.**

**Method:** 🔎 SOURCE-READ · 🧪 **EXECUTED** — every count below came from fetching the live production API and measuring the payload. ⚠️ **No span of the prompt arrived garbled, and no instruction contradicted another.**

---

# 🔴 YOUR PREMISE IS WRONG. SAYING SO AT THE TOP, AS ASKED.

**The scraper is working. It is producing 639 future events across 39 trucks and 98 distinct dates, stretching into February 2027.** That is not a scraper that has stopped picking sites up.

🔴 **THE LOSS IS ENTIRELY DOWNSTREAM, AND IT IS ONE JOIN:**

| Measured on the live API | Count |
|---|---|
| Events returned | **639** |
| 🔴 **Events that can be pinned** (carry `venueLat`/`venueLong`) | **69** — **10.8%** |
| Distinct trucks in the payload | **39** |
| 🔴 **Distinct trucks that can appear on the map** | **7** — **18%** |
| Distinct venues that can pin | 31 |
| 🔴 **Distinct venues that CANNOT pin** | **123** |

**Seven trucks on the map out of thirty-nine scraped. That is your symptom, exactly, and the scraper delivered all thirty-nine.**

🔴 **THE CAUSE, IN ONE SENTENCE: an event only gets coordinates by joining to a `venues` row, and NOTHING IN THIS CODEBASE EVER CREATES ONE.** 🧪 Verified: every `from('venues')` reference in `app/`, `lib/` and `scripts/` is a `select`. **There is not a single insert, upsert or update.** A venue the scraper has never seen before gets `venue_id: null` — permanently — and `venue_id: matchedVenue?.id ?? null` is the line that decides it (`app/api/inbound-schedule/route.ts:230`).

🟢 **This confirms what the manual already recorded at V12.2** — *"VENUE-ROW CREATION STOPPED ON 11 JUNE 2026"* and *"THE VILLAGE FOODIE MAP DID NOT BREAK; IT DRAINED."* **The drain has continued and is now at 89%.**

---

# PART A — IS THE SCRAPER RUNNING?

## A1 — It is running, but **not in production, and not on a schedule**

🔎 **What I looked for, so an empty result is evidence rather than silence:**

| Looked for | Found |
|---|---|
| A cron entry for it in `vercel.json` (the committed version) | 🔴 **NONE.** Six crons exist — `demo-cleanup`, `account-deletion-due`, `cancel-stale-authorizations`, `capture-stranded-authorizations`, `auto-reject-offline-orders`, `custom-domain-check`. **No scraper among them.** Searched `scrape`, `discovery`, `inbound`, `harvest`. |
| A deployed scraper route under `app/api/` | 🔴 **NONE.** Only `app/api/inbound-schedule` (a **receiver**) and `app/api/discovery/events` (a **reader**). |
| A scraper in the repo | ✅ **`scripts/run-scraper.js`, 1,638 lines.** A **local Playwright script**, run by hand, reading credentials from `.env.local`. Its own header calls it *"PASS A: global Google-Sheets discovery scrape (every truck + venue website)"*. |

🔴 **So the architecture is: a human runs a script on a laptop, which POSTs to `/api/inbound-schedule` with a shared secret.** Nothing in production initiates it, and nothing in production can tell you it has not run.

🟢 **Evidence it HAS run, and recently:** 639 future-dated events are live right now, spanning to **1 February 2027**. 🧪 **Executed against production.** ⚠️ **What that does not tell me is WHEN.** The API filters `event_date >= today`, so a future event proves the data exists, **not that it was written this week.** Only SQL answers that — A2.

## A2 — SQL to establish when it last ran and what it wrote

🔴 **`information_schema` first, because migrations here are applied by hand and a listing is a photograph, not a schema.**

```sql
-- 1. WHAT COLUMNS ACTUALLY EXIST. Run this before trusting any column name below.
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('discovery_events','discovery_trucks','venues','truck_events','scraper_run_log')
order by table_name, ordinal_position;

-- 2. DOES scraper_run_log EXIST AT ALL? The manual names it; nothing in app/ or lib/ reads it.
select table_name
from information_schema.tables
where table_schema = 'public' and table_name like '%scraper%';
```

```sql
-- 3. 🔴 WHEN DID THE SCRAPER LAST WRITE? The decisive question.
--    (If `created_at` is absent from query 1, substitute whatever timestamp column it does have.)
select
  max(created_at)                          as last_write,
  now() - max(created_at)                  as ago,
  count(*)                                 as total_rows,
  count(*) filter (where created_at > now() - interval '24 hours') as written_last_24h,
  count(*) filter (where created_at > now() - interval '7 days')   as written_last_7d
from public.discovery_events;

-- 4. WRITES PER DAY over the last fortnight — a scraper that ran shows a row per run day.
select date(created_at) as day, count(*) as rows_written
from public.discovery_events
where created_at > now() - interval '14 days'
group by 1 order by 1 desc;
```

```sql
-- 5. 🔴 THE ROOT CAUSE, COUNTED IN THE DATABASE RATHER THAN INFERRED FROM THE API.
select
  count(*)                                              as future_events,
  count(*) filter (where venue_id is null)              as no_venue_row,
  count(*) filter (where venue_id is not null)          as has_venue_row,
  round(100.0 * count(*) filter (where venue_id is null) / nullif(count(*),0), 1) as pct_unpinnable
from public.discovery_events
where event_date >= current_date and show_on_vf = true;

-- 6. THE MISSING VENUES, RANKED — this is your work list. Each row is one venue
--    row that would restore every event under it to the map.
select venue_name, village, count(*) as lost_events
from public.discovery_events
where event_date >= current_date and show_on_vf = true and venue_id is null
group by 1,2
order by lost_events desc;

-- 7. WHEN DID VENUE CREATION ACTUALLY STOP? (the manual says 11 June 2026)
select date(created_at) as day, count(*) as venues_created
from public.venues
group by 1 order by 1 desc limit 20;
```

## A3 — It has run in production, so the rest of this report matters

🟢 **Not stopping.** The data is there; the pins are not.

---

# PART B — WHERE THE ROWS GO MISSING, COUNTED

| # | Stage | Count | What filters it |
|---|---|---|---|
| 1 | Sites scraped | 🔴 **UNKNOWN FROM HERE** | The site list lives in a **Google Sheet**, outside this repository. See Part C. |
| 2 | Rows written to `discovery_events` | 🔴 **UNKNOWN** — needs SQL 3/4 | Dedup on `(truck_id, event_date, venue_id)` with a name fallback; `scraper_preference = 'manual'` trucks skipped (`inbound-schedule:152`) |
| 3 | **Rows the discovery API returns** | 🧪 **639** | `show_on_vf = true` · `event_date >= today` · `.limit(1000)` — ⚠️ **the cap is NOT binding at 639** |
| 4 | Rows the client receives | 🧪 **639** | No further server filter |
| 5 | 🔴 **Pins rendered** | 🧪 **69** | **`venueLat`/`venueLong` must both exist** — `MapView` guards on them (`app/page.tsx:79`) |

## 🔴 THE STAGE WITH THE LARGEST PROPORTIONAL LOSS: stage 4 → 5

**639 → 69. An 89.2% loss in one step**, and it is the last one. In trucks it is **39 → 7, an 82% loss**.

Every earlier stage is either healthy or not the problem: the API cap is not reached, the date filter is correct (future events only), and `show_on_vf` is doing its job.

## Why the coordinates are absent — the exact mechanism

🔎 `app/api/discovery/events/route.ts:55-64` selects `venues!venue_id (name, village, postcode, latitude, longitude, …)` — **a join on `discovery_events.venue_id`.** Then at `:163-164`:
```js
venueLat:  venue.latitude  ? parseFloat(String(venue.latitude))  : undefined,
venueLong: venue.longitude ? parseFloat(String(venue.longitude)) : undefined,
```
**`venue_id` null ⇒ empty join ⇒ both undefined ⇒ no pin.**

## 🔴 AND THERE IS NO FALLBACK. THIS IS THE PART THAT SURPRISED ME.

🧪 **Measured:** of the 639 events, only **46 carry a non-empty postcode** — and **all 46 are among the 69 that already pin.** The other **593 carry an empty string**.

🔎 Because `postcode: venue.postcode || ''` (`:162`) **also comes from the venue join.** So the unpinnable events have **no coordinates and no postcode** — nothing to geocode from as a second chance. **The venue row is the only path to a map pin, and there is exactly one of it.**

⚠️ **This corrects my own earlier statement in this session.** I reported "639/639 have a postcode" from a null-check; the honest number is **46**, because 593 are the empty string. A presence check on a key is not a check on a value.

## The venues carrying the most lost events — 🧪 your work list

| Lost events | Venue |
|---|---|
| **42** | The Bull Pub — Great Paxton |
| **29** | Blackpit Brewery — Stow-Bridgwater |
| **26** | Wintringham Plaza — Wintringham |
| **24** | Church View Campsite — Church View |
| 17 | The Street — Capel St. Mary |
| 16 | Market Square — Bildeston |
| 14 | Haverhill Town Centre — Haverhill |
| 12 | Nethergate Brewery — Long Melford |
| 9 | Barracks · Six Bells (Felsham) · The Chestnut Horse (Great Finborough) · Near the Co op Store |

🟢 **The top four venues alone account for 121 of the 570 lost events — 21% — from four rows.** ⚠️ **"Near the Co op Store — Near the Co op Store"** is a scraped string that is not a venue at all; some of these need better extraction rather than a venue row.

---

# PART C — WHAT IS BEING SCRAPED

## C1 — The source list is NOT in this repository

🔴 **`scripts/run-scraper.js:515` — *"PASS A: global Google-Sheets discovery scrape (every truck + venue website)."*** The list of sites is a **Google Sheet**. I cannot read it, so **I cannot tell you which sites are covered, how many there are, or which have ever succeeded.** That is Part D.

**What I can say from the code:** it drives Playwright over each site, extracts schedule text, runs an AI extraction pass, and POSTs the results to `/api/inbound-schedule` with a shared secret. Per-truck it honours `scraper_preference = 'manual'` (skipped entirely) and writes exclusion terms back to `excluded_terms`.

## C2 — 🔴 FAILURES ARE EFFECTIVELY SILENT, AND THAT IS THE SECOND FINDING

🔎 The script logs failures — `console.error("❌ Error on ${site.name}:", error.message)` (`:912`), `console.log("⚠️ Navigation warning.")` (`:545`), and one bare `catch (error) { return []; }` at `:382` that swallows a failure into an empty result with **no message at all**.

🔴 **But that console only exists on the laptop that ran it.** Nothing is written to a table, nothing reaches Vercel's logs, and `scraper_run_log` — which the manual names — **is read by nothing in `app/` or `lib/`.**

🔴 **SO YES: "few trucks" and "few sources working" ARE INDISTINGUISHABLE FROM PRODUCTION.** You cannot tell, from anything the platform stores, whether a site failed, was skipped, or simply had no events. ⚠️ **In this instance it does not matter — the 639 events prove the sources are working — but it is why the premise was reasonable and unfalsifiable.**

## C3 — Required fields, and the one that is missing

| Field | Needed for | Populated? |
|---|---|---|
| `truck_id`, `event_date`, `venue_name` | the event to exist and list | 🟢 Yes |
| `show_on_vf = true` | to reach the API | 🟢 Yes — all 639 passed |
| `event_date >= today` | to reach the API | 🟢 Yes |
| 🔴 **`venue_id`** → `venues.latitude` / `.longitude` | **to render a pin** | 🔴 **NO for 570 of 639** |

🔴 **CONFIRMED STILL TRUE: the enrichment step is designed and not built.** Nothing creates a venue row. `findVenue` (`lib/venue-matcher.ts`) *matches* against the existing directory and returns null when there is no match; `inbound-schedule:230` then writes `venue_id: matchedVenue?.id ?? null` and moves on. **What enrichment would have supplied is exactly the missing piece: a venue row with coordinates for a name the directory has never seen.**

⚠️ **And note the second-order effect the manual already warned about:** `findVenue` best-guesses on ambiguity, so a *wrong* match is possible too — V12.2 records the Suffolk Show mislink at ~30 miles. **Creating venue rows carelessly would trade invisible trucks for mispinned ones.**

---

# PART D — WHAT ONLY YOU CAN CHECK, IN ORDER

1. 🔴 **Run SQL 3 and 4.** When did `discovery_events` last receive a write? This is the one question that separates "the scraper ran last night" from "the scraper last ran in July and these are old future-dated events". **Everything else in this report assumes the data is current.**
2. 🔴 **Run SQL 7.** Confirm venue creation stopped, and when. The manual says 11 June 2026.
3. **Run SQL 6.** That is your work list — the ranked venues to create.
4. **Open the Google Sheet the scraper reads.** How many sites are on it? That is the only place stage 1 can be counted.
5. **Run `scripts/run-scraper.js` locally and watch the console.** It is the only surface where a per-site failure is visible. Note which sites error.
6. **Open the map in a browser** at a postcode near one of the top-four venues, and confirm those trucks are absent — the visual confirmation of the 89% figure.
7. **Decide the fix.** Creating the 123 venue rows restores 570 events; it is a data task, not a code one. **Building automatic venue creation is the code task, and it carries the mispinning risk above.**

---

# VERIFICATION

| Finding | Method | Failure mode if it proved nothing, and how it is ruled out |
|---|---|---|
| 639 events, HTTP 200 | 🧪 Executed | — |
| **69/639 pinnable** | 🧪 **Executed over ALL rows** | 🔴 Sampling one event would miss that JS omits unset keys entirely — my first probe did exactly that and reported "0 coordinates". **Ruled out by taking the union of keys across all 639 rows and counting per key.** |
| **39 trucks → 7 pinnable** | 🧪 Executed | Counting events rather than distinct trucks would overstate the loss. **Ruled out by deduplicating on `truckName`.** |
| 46 non-empty postcodes | 🧪 Executed | 🔴 A null-check said 639 and was wrong — 593 are the empty string. **Ruled out by testing the value, not the key.** |
| Nothing writes to `venues` | 🧪 Executed grep across `app`, `lib`, `scripts` | An empty grep is not absence. **Ruled out by first listing all four `from('venues')` sites, then filtering for write verbs — all four are `select`.** |
| No scraper cron | 🧪 Executed against **committed** `vercel.json` | The working copy is dirty; reading it would describe an unshipped file. **Ruled out by `git show HEAD:vercel.json`.** |
| Coordinates come from the venue join | 🔎 Source-read, quoted | — |
| Failures are console-only | 🔎 Source-read | — |

---

# THE TREE

🟢 **Branch `main`. HEAD `08ac368`. `origin/main` `08ac368` — production unchanged. 0 staged. Nothing committed, nothing pushed, nothing deployed.**

🟢 **NOT ONE FILE WAS MODIFIED.** 23 modified and 72 untracked files remain exactly as they were — `app/o/[slug]/page.tsx`, `components/EventListCard.tsx`, `proxy.ts`, `vercel.json`, the `ios/` project file and the rest, all still uncommitted. The only artefact of this task is this report.

**The six-file `git add -p` set is unmoved:** `lib/custom-domain/copy.ts`, `app/manage/[token]/page.tsx`, `app/api/manage/route.ts`, `app/landing/page.tsx`, `lib/plan-features.ts`, `lib/landing-table.ts`.

---

# WHAT I COULD NOT READ OR VERIFY

- 🔴 **When the scraper last ran.** The API filters to future events, so live data proves existence, not recency. **SQL 3/4 is the only answer**, and it is the assumption everything here rests on.
- 🔴 **Stage 1 — how many sites are scraped, and which fail.** The list is a **Google Sheet outside this repository**. I cannot count what I cannot read.
- 🔴 **Whether `scraper_run_log` exists in production.** The manual names it; **nothing in `app/` or `lib/` reads it**, so I cannot tell whether it is a live table, a dead one, or was never created. SQL 2.
- 🔴 **No database read at all.** Every count came from the public API payload. **The API is a filtered view** — `show_on_vf = true`, future dates — so rows suppressed or past-dated are invisible to me. The true `discovery_events` count could be much larger.
- ⚠️ **I did not open the map in a browser.** The 69-pin figure is what the API can support, not what was observed rendering. A client-side filter could reduce it further — the distance filter defaults to 11 miles and needs a user postcode.
- ⚠️ **I did not run `scripts/run-scraper.js`.** It drives Playwright against live sites and would write to production through the inbound webhook.
- ⚠️ **Whether the 123 unmatched names are all real venues.** At least one — *"Near the Co op Store"* — is clearly an extraction artefact, so the work list needs a human pass before it becomes 123 inserts.

# FLAGS

- 🔴 **THE PREMISE IS WRONG: the scraper is working.** 639 events, 39 trucks, dates into February 2027.
- 🔴 **89.2% of events and 82% of trucks are lost at ONE join** — `discovery_events.venue_id → venues.latitude/longitude`.
- 🔴 **NOTHING IN THE CODEBASE EVER CREATES A VENUE ROW.** All four `from('venues')` references are reads. A new venue name is unpinnable permanently.
- 🔴 **There is no fallback:** the unpinnable events have no postcode either, because that also comes from the venue join.
- 🔴 **123 venue rows are missing. The top four would restore 121 events on their own.**
- 🔴 **Scraper failures are invisible in production** — console-only, on a laptop. "Few trucks" and "few sources working" cannot be told apart from the platform.
- ⚠️ **The scraper is a hand-run local script, not a deployed cron.** Nothing in production initiates it or reports that it has not run.
- ⚠️ **Automatic venue creation would trade invisible trucks for mispinned ones** unless the matcher's ambiguity handling is fixed first — V12.2 records a 30-mile mislink.

*Nothing committed. Nothing staged. Nothing modified. Production = `08ac368`.*
