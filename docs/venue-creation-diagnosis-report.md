# Venue creation — 🔴 MY PREVIOUS REPORT WAS WRONG. THE CREATOR EXISTS.

**7 September 2026. 🔴 NOTHING WAS CHANGED. No file edited, no commit, no push, no deploy, nothing staged, no script run. Production is `main` at `08ac368`. `git add -A` / `git add .` never run.**

**Method:** 🔎 SOURCE-READ · 🧪 EXECUTED. ⚠️ **No span of the prompt arrived garbled, and no instruction contradicted another.**

---

# 🔴 THE CORRECTION, AT THE TOP, BECAUSE IT WAS MINE

**`docs/scraper-diagnosis-report.md` states: *"NOTHING IN THE CODEBASE EVER CREATES A VENUE ROW. All four `from('venues')` references are reads."* THAT IS FALSE.**

**The creator is `scripts/run-scraper.js:1616`:**
```js
supabase.from('venues').upsert({
  name: v.name, village: v.village || null,
  latitude: v.lat || null, longitude: v.lng || null,
}, { onConflict: 'name', ignoreDuplicates: true })
```

🔴 **AND IT IS NOT IN A SEPARATE PROJECT. IT IS IN THIS REPOSITORY, AND MY GREP EXCLUDED IT.** I ran:
```
grep -rn "from('venues')" app lib scripts --include="*.ts" --include="*.tsx"
```
**`run-scraper.js` is a `.js` file.** The `--include` filter dropped it from the listing *and* from the write-verb filter, so I reported "all four are reads" — true of the four TypeScript files I looked at, false of the codebase. 🧪 **Reproduced:** with the filter, 4 matches; without it, **7**.

⚠️ **The operator is right and the data is right.** Something did create those 51 venues in June, automatically, and it is still in the run path.

🔴 **AND A PRIOR REPORT ALREADY FOUND IT.** `docs/venue-pipeline-report.md` names `run-scraper.js:1616` and `daily_scrape.yml` explicitly. **I did not read it before writing my own.** Reading the existing reports is the cheapest step available and I skipped it.

🟢 **What survives from the previous report:** the *measured* symptom — 639 events, 69 pinnable, 39 trucks, 7 on the map, 123 unmatched venues. Those were executed against the live API and stand.

---

# PART A — THE CREATOR

## A1 — Patterns searched, so an empty result is evidence

🧪 **Machine-wide** across `~/dev`, `~/Desktop`, `~/Documents`, excluding `node_modules`, `.next`, `.git`:

`from('venues')` · `from("venues")` · `insert into venues` · `INSERT INTO venues` · `table('venues')` · `createVenue` · `addVenue` · `newVenue` — **no file-type filter this time**, across `.js .ts .mjs .cjs .py .rb .sql .json .ipynb .sh`.

🟢 **RESULT: there is no separate scraper project.** `~/dev/village-foodie` is the only git repository on this machine besides `~/.nvm`. `~/Desktop/village-foodie` is empty; `~/Desktop/Village Foodie` holds PDFs and images, no code.

**Every venue writer on the machine — two, both in this repo:**

| Writer | File:line | Op | Trigger |
|---|---|---|---|
| 🔴 **The automated creator** | `scripts/run-scraper.js:1616` | `upsert` | Pass A of the scraper, **GitHub Actions `daily_scrape.yml`**, `cron: '0 6 * * *'` |
| One-time migration | `scripts/migrate-from-sheets.cjs:111` | `upsert` | Hand-run. **This is the 523 rows on 22 May.** |

## A2 — What it does, and it is still wired in

1. **Detection** (`:858-866`) — when the scraper cannot match a scraped venue against the Sheet's venue list, it sets `isNewVenue = true` and queues it in `newVenuesDetected`, keyed `name|village`.
2. **Geocoding** (`:1576-1589`) — 🔴 **the geocoder is Gemini, not a maps API.** `generateContentWithRetry(modelLite, geoPrompt)` asks `gemini-2.5-flash-lite` for postcode, lat and lng as JSON.
3. **Sheet append** (`:1607`) — writes the new venues to the Google Sheet's Venues tab, tagged `[⚠️ NEW FROM SCRAPER]`. **This is `await`ed.**
4. **DB mirror** (`:1616`) — the upsert above, described in its own comment as *"DB mirror — parallel run"*.

🟢 **Still wired:** `daily_scrape.yml` sets `SCRAPE_MODE: discovery`, and `RUN_DISCOVERY = MODE !== 'hatchgrab'` (`:399`) is therefore **true**, so Pass A and its venue block are in the run path today. 🧪 Verified against the committed workflow.

## 🔴 A2b — THREE DEFECTS IN THAT BLOCK, ANY OF WHICH STOPS CREATION SILENTLY

**These are new findings. The prior report quoted the upsert but did not flag them.**

### 🔴 (1) The `onConflict` key contradicts the documented constraint — this is the strongest candidate

**Code:** `{ onConflict: 'name', ignoreDuplicates: true }`
**The manual, in THREE places:**
> *"**UNIQUE CONSTRAINT (V6.2)** — venues uniqueness is **(name, village)**, not name alone. **Upserts MUST use `onConflict: 'name,village'`.**"* (`reference-manual.md:12000`, restated at `:9431` and `:12235`)

🔴 **Postgres rejects `ON CONFLICT (name)` when no unique index matches it — error 42P10, "there is no unique or exclusion constraint matching the ON CONFLICT specification".** Every upsert would fail, every time.

⚠️ **And the table as created has NO unique constraint at all** — `supabase/migrations/20260522_discovery_schema.sql:8-27` creates `venues` with two **plain** indexes, `idx_venues_name` and `idx_venues_village`. Neither is unique. So `onConflict: 'name'` had nothing to match **from the day the table was created**, unless a unique index was added by hand afterwards — which is exactly how V6.2's `(name, village)` constraint would have arrived.

🔴 **THAT FITS THE TIMELINE.** While a name-only unique index existed, the upsert worked — the June trickle. The moment `(name, village)` replaced it, every write began failing with 42P10, silently. **SQL query 3 settles this in one line.**

### 🔴 (2) A venue with no village is never queued at all

`:863` — `if (finalVenue && extractedVillage) { newVenuesDetected.set(...) }`

**A new venue whose village the AI did not extract is marked `[⚠️ NEW VENUE]` in the Sheet notes and then dropped.** It never reaches the geocoder and never becomes a row. 🧪 **Corroborated in the live data:** of the 123 unmatched names, several carry village `Unknown`, and others repeat the name as the village (*"Barracks — Barracks"*, *"Near the Co op Store — Near the Co op Store"*) — the signature of village extraction failing.

### 🔴 (3) The DB write is fire-and-forget and can be abandoned at process exit

```js
for (const v of geoResult) {
  supabase.from('venues').upsert({...}).then(({ error }) => { ... })   // ← not awaited
}
```
🔎 It is the **last thing Pass A does**; the block ends and `main()` returns. **Node can exit with those HTTP requests still in flight.** The Sheet append immediately above it *is* awaited — which is why **the Sheet keeps gaining venues while the database does not**, and would look exactly like the symptom.

⚠️ **All three failures are console-only.** `console.warn('[DB] Venue write failed:', error.message)` and `console.error("❌ Geocoder Failed:", ...)` go to the GitHub Actions log and nowhere else. **Nothing is written to a table, and no run goes red** — `main().catch()` only fires on an unhandled throw, which none of these is.

---

# PART B — WHAT CHANGED AROUND 11 JUNE

## B1 — The window, read from git

| Date | Commit | What it touched |
|---|---|---|
| **10 Jun** | `924434d` "scraper" | 🔴 **`daily_scrape.yml` rewritten (53 lines)** + `run-scraper.js` (+7) |
| 11 Jun | `9c21e0f` "updates" | `run-scraper.js` (+1) |
| 11 Jun | `9433a4c` "updates" | `run-scraper.js` (+11), new `scripts/reresolve-event-venues.ts` |

🟢 **The 10 June workflow change was Chrome-install plumbing** — it replaced a broken Puppeteer Chrome download with `browser-actions/setup-chrome`. That change **fixed** the scraper rather than breaking it.

🔴 **The venue upsert block itself did not change on 11 June.** 🧪 `git diff 924434d 9433a4c -- scripts/run-scraper.js` filtered for `venues|onConflict|newVenuesDetected|geoPrompt|extractedVillage` returns **nothing**.

⚠️ **A COMMIT DATE IS NOT A CONTENT-CHANGE DATE, AND I AM READING BOTH.** `git log -L` on lines 1610-1625 shows the venue block was last *content-changed* on **22 May 2026** (`03d788f`, "Phase 3: switch discovery map and events API from Sheets CSV to Supabase") — **three weeks before creation stopped.**

🔴 **SO THE CAUSE IS NOT IN THE REPOSITORY.** The code that creates venues has been byte-identical since 22 May and kept working until 11 June. **Something outside git changed on or around 11 June** — and the candidates are exactly the three in A2b plus the environment:
- a **hand-applied unique constraint** on `venues` (V6.2's `(name, village)`) — 🔴 **my leading hypothesis**;
- a GitHub Actions secret expiring (`GEMINI_API_KEY`, `SPREADSHEET_ID`, the Google service account);
- the Gemini geocode beginning to fail or return unparseable JSON.

⚠️ **Also on the record:** `hatchgrab_scrape.yml` carries a comment about a *different* silent stop — *"scheduled runs land late… the exact-hour match almost never held and **scheduled scraping silently stopped (06-28 regression)**"*. **Same failure shape, later date.** This pipeline has stopped silently at least twice.

## B2 — Where coordinates come from, and whether anything would tell us

| | |
|---|---|
| **Geocoder** | 🔴 **Gemini `gemini-2.5-flash-lite`**, prompted for `{postcode, lat, lng}` JSON. Not Google Maps, not Nominatim, not Mapbox. |
| **Credential** | `GEMINI_API_KEY`, a **GitHub Actions secret**, passed in `daily_scrape.yml` |
| 🔴 **Would anything tell us it stopped?** | **NO.** A geocode failure is caught at `:1628` and logged `"❌ Geocoder Failed"` to the Actions log. **No table row, no email, no alert, and the workflow still exits 0.** |

🔴 **A separate Gemini key lives in Vercel** and is confirmed working (the operator geocoder at `app/api/manage/geocode/route.ts`). **They are different secret stores.** "Gemini works in production" is true of Vercel and proves nothing about the Actions runner.

## B3 — SQL

🔴 **`information_schema` first — migrations here are applied by hand, so a listing is a photograph.**

```sql
-- 1. WHAT COLUMNS EXIST. Confirm before trusting any name below.
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name in ('venues','discovery_events')
order by table_name, ordinal_position;

-- 2. EVERY INDEX AND CONSTRAINT ON venues.
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'venues';

-- 3. 🔴 THE ONE THAT SETTLES IT — is there a unique index the code's onConflict can match?
--    The code says onConflict:'name'. If the only unique index is (name, village), or if there is
--    no unique index at all, EVERY venue upsert fails with 42P10 and always has since it changed.
select
  i.relname                                   as index_name,
  ix.indisunique                              as is_unique,
  array_agg(a.attname order by k.ord)         as columns
from pg_index ix
join pg_class i  on i.oid  = ix.indexrelid
join pg_class t  on t.oid  = ix.indrelid
join lateral unnest(ix.indkey) with ordinality as k(attnum, ord) on true
join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum
where t.relname = 'venues' and ix.indisunique
group by 1, 2;

-- 4. WHEN CREATION STOPPED, and the trickle shape the operator described.
select date(created_at) as day, count(*) as venues_created
from public.venues
group by 1 order by 1 desc limit 30;

-- 5. ARE EXISTING VENUES THEMSELVES PINNABLE? A row with no coordinates joins and still yields no pin.
select
  count(*)                                                      as total_venues,
  count(*) filter (where latitude is null or longitude is null) as missing_coords,
  count(*) filter (where postcode is null or btrim(postcode)='') as missing_postcode
from public.venues;

-- 6. 🔴 DOES THE NAME-ONLY CONFLICT KEY COLLAPSE DISTINCT PUBS? (Part C2)
--    Same name, different village = different venue. onConflict:'name' would merge them.
select name, count(*) as rows, array_agg(distinct village) as villages
from public.venues
group by name having count(*) > 1
order by rows desc;

-- 7. IS venue_match_confidence ACTUALLY POPULATED? (Part C3)
select venue_id_source, venue_match_confidence, count(*)
from public.truck_events
group by 1,2 order by 3 desc;
```

---

# PART C — WHAT THE BACKFILL ACTUALLY NEEDS

## C1 — Diary entries: ~6 of 123, and 🔴 keyword matching is the wrong recogniser

🧪 I ran a keyword classifier (`haircut|physio|mot|visit|dog show|garage|school|hospital…`) over the 123 unmatched names. It flagged **10** — **and four of those are real trading pitches**:

| Flagged | Verdict |
|---|---|
| Transit Mot · Transit Mot due · Physio · Haircut · Dionne visit · Dog show | 🔴 **Genuine diary entries** |
| **Samkin's Garage** · **Auto Shack at the Corner Garage** · **The Old School** · **foodPark at … Royal Papworth Hospital …** | 🟢 **REAL VENUES** — a garage forecourt is a common food-truck pitch |

🔴 **So keyword matching over-triggers at 40% and would delete real pitches.** **The reliable signal in this data is the village field**, not the name: five of the six genuine diary entries carry village **`Unknown`**, and *"Dog show — Norfolk"* names a county rather than a village.

🟢 **Better rule, from the evidence:** quarantine for human review anything whose village is `Unknown`/blank or is a county name — **do not auto-delete, and do not auto-create.** ⚠️ Defect (2) in A2b already excludes village-less entries from creation, so **these are the one class currently failing safe.**

## C2 — 🔴 Duplicates, AND the opposite problem, in the same list

🧪 **8 names appear under more than one village, covering 18 of the 123 strings.** They are **two different problems**:

| | Example | Right answer |
|---|---|---|
| 🔴 **True duplicate** — one place, inconsistent village | `Incleboro Fields Caravan and Motorhome Club Campsite` — **Cromer** *and* **West Runton** | **ONE** venue row |
| 🔴 **Genuinely distinct venues sharing a name** | `The Bull` — **Bottisham** *and* **Langley**; `The Plough` — **Great Shelford** *and* **Birdbrook**; `The Street` — **Capel St. Mary** *and* **Whatfield** | **TWO** rows. Merging puts one pub's customers at another's coordinates, ~30 miles away |
| ⚠️ **Judgement** | `foodPark` ×4 — Milton, Cambridge, CB1, Biomedical Campus | One brand, several pitches. **Yours to decide.** |

🔴 **`onConflict: 'name'` gets this exactly backwards.** If it ever matched a name-only unique index it would **collapse `The Bull` (Bottisham) into `The Bull` (Langley)** — silently, via `ignoreDuplicates: true`. **The manual's `(name, village)` is correct and the code is wrong in both directions: it errors against the documented constraint, and it would mis-merge against the one it asks for.**

**How matching works today — 🔴 TWO different implementations:**

| | Where | Method |
|---|---|---|
| Scraper (against the **Sheet**) | `run-scraper.js:830-852` | Hand-rolled scoring: fuzzy name +100, substring +10, village present in event text +50, village mismatch **−20** |
| App (against the **DB**) | `lib/venue-matcher.ts` `findVenue` | Normalised name, stopword-stripped **token overlap**, ranked by village agreement, **best-pick on ambiguity, never bails to null** |

⚠️ **Neither is an exact string match** — both normalise and both use the village to disambiguate, so both would *usually* keep `The Bull` (Bottisham) and `The Bull` (Langley) apart. **The exact-match risk is only at the database upsert key.** ⚠️ **Two implementations of one question is itself a drift risk** the manual already records for this matcher.

## C3 — `venue_match_confidence` / `venue_id_source` are populated, by one writer

🔎 `app/api/inbound-schedule/route.ts:231-232`:
```js
venue_id_source:        matchedVenue ? 'scraper' : null,
venue_match_confidence: matchedVenue ? match.confidence : null,
```
🟢 **Written on `truck_events` only, by the inbound route, from `findVenue`'s `high | low | none`.** So the nuance exists at the *event-link* layer.

🔴 **But nothing reads `venue_match_confidence` anywhere** — 🧪 grep returns only this write plus the migration. The manual records the same: *"the approval UI flags low-confidence guesses… was never built."* ⚠️ **And `discovery_events` — the table the map actually reads — gets no confidence column at all.** **SQL 7 shows whether these are populated in practice.**

---

# PART D — WHAT ONLY YOU CAN DO, IN ORDER

1. 🔴 **Run SQL 2 and 3.** Is there a unique index on `venues`, and on which columns? **This is the single highest-value action in the report** — if it is `(name, village)` while the code says `onConflict:'name'`, the cause is found and it is one word.
2. 🔴 **Open the GitHub Actions run log for `Daily Food Truck Scrape`** (last few days). Search the output for: `Asking AI to locate and add N new venues`, `Successfully added N new locations`, `[DB] Venue write failed`, `❌ Geocoder Failed`. **This is the only surface where any of the three defects is visible**, and it distinguishes them: geocode failure vs DB rejection vs never-detected.
3. **Check the Google Sheet's Venues tab** for rows tagged `[⚠️ NEW FROM SCRAPER]` after 11 June. 🔴 **If the Sheet has them and the DB does not, that proves the failure is in the DB mirror (defect 1 or 3), not in detection or geocoding.**
4. **Confirm the Actions secrets are still set** — `GEMINI_API_KEY`, `SPREADSHEET_ID`, the Google service-account JSON. A rotated or expired key is invisible from here.
5. **Run SQL 4** to confirm the trickle-then-stop shape against the DB itself.
6. **Run SQL 6 and 7** before any backfill — 6 tells you whether name collisions already exist, 7 whether the confidence fields carry anything.

---

# VERIFICATION

| Finding | Method | Failure mode if it proved nothing, and how ruled out |
|---|---|---|
| **The creator at `run-scraper.js:1616`** | 🧪 Executed grep, **no file-type filter** | 🔴 **This is the exact failure that produced my wrong report** — `--include="*.ts"` hid a `.js` file. **Ruled out by re-running with no filter and comparing counts: 4 with, 7 without.** |
| No separate scraper project | 🧪 Executed, machine-wide over `~/dev`, `~/Desktop`, `~/Documents` | An empty result could mean a bad path list. **Ruled out by first enumerating every `.git` directory on the machine — only two exist.** |
| `SCRAPE_MODE: discovery` ⇒ Pass A runs | 🧪 Executed against the **committed** workflow | Reading the working copy would describe an unshipped file. **Committed file read.** |
| Venue block unchanged since 22 May | 🧪 Executed `git log -L` on the line range | A commit date is not a content date. **`-L` reports content changes to those lines specifically.** |
| `onConflict:'name'` vs documented `(name,village)` | 🔎 Source-read code + manual, both quoted | ⚠️ **The actual database constraint is NOT verified — SQL 3 is required.** The contradiction is between code and documentation; whether it *fires* is unproven. |
| 123 unmatched, 8 duplicated names, 6 diary entries | 🧪 Executed over the live API payload | Sampling one row would miss keys JS omits. **Ruled out by scanning all 639 and deduplicating explicitly.** |
| Keyword classifier over-triggers | 🧪 Executed, then read every hit | A classifier reporting 10 hits looks successful. **Ruled out by inspecting each — 4 of 10 were real venues.** |
| `venue_match_confidence` unread | 🧪 Executed grep | — |

---

# THE TREE

🟢 **Branch `main`. HEAD `08ac368`. `origin/main` `08ac368` — production unchanged. 0 staged. Nothing committed, pushed or deployed. No script run, no venue created, nothing built.**

🟢 **NOT ONE FILE WAS MODIFIED.** 23 modified and 72 untracked files remain exactly as they were. The only artefact is this report.

**The six-file `git add -p` set is unmoved:** `lib/custom-domain/copy.ts`, `app/manage/[token]/page.tsx`, `app/api/manage/route.ts`, `app/landing/page.tsx`, `lib/plan-features.ts`, `lib/landing-table.ts`.

---

# WHAT I COULD NOT READ OR VERIFY

- 🔴 **The actual unique constraint on `venues`.** My leading hypothesis rests on it and **SQL 3 is the only way to settle it.** Until then it is a documented contradiction, not a proven cause.
- 🔴 **The GitHub Actions run logs.** They hold the one line that names which of the three defects is firing. **I cannot reach them.** The prior report reached the same wall.
- 🔴 **The Google Sheet.** Whether new venues are still being appended there — the test that separates a detection failure from a DB failure — needs your Google account.
- 🔴 **Whether the Actions secrets are still valid.** A different store from Vercel's; unreadable from here.
- 🔴 **No database read at all.** Every count came from the public API, which is filtered to `show_on_vf = true` and future dates. **The venue-creation dates in your prompt are yours, not mine** — I have not verified them.
- ⚠️ **Why creation stopped on 11 June specifically remains unproven.** I can show the code did not change, name three defects that would each stop it silently, and rank them — but the deciding evidence is in the database and the Actions log.
- ⚠️ **I did not run the scraper**, as instructed. Its behaviour is read, not observed.

# FLAGS

- 🔴 **MY PREVIOUS REPORT WAS WRONG** — a `--include="*.ts"` filter hid the `.js` creator. The operator was right.
- 🔴 **I did not read `docs/venue-pipeline-report.md`, which had already found it.** Reading the existing reports first would have cost one command.
- 🔴 **`onConflict: 'name'` contradicts the manual's `(name, village)` in three places** — 42P10 on every upsert if the documented constraint exists. **Leading hypothesis. SQL 3 settles it.**
- 🔴 **A venue with no extracted village is never queued for creation** — silent, and it matches the `Unknown`-village rows in the live data.
- 🔴 **The DB upsert is fire-and-forget and unawaited at process exit**, while the Sheet append above it *is* awaited — which would look exactly like "the Sheet fills, the database does not".
- 🔴 **Every one of these fails silently.** Console-only, workflow still exits 0.
- ⚠️ **A name-only conflict key would merge distinct pubs** — `The Bull` in Bottisham and Langley are different venues.
- ⚠️ **Keyword-based diary detection over-triggers at 40%** and would delete real pitches. Use the village field, and quarantine rather than delete.
- ⚠️ **This pipeline has stopped silently at least twice** — the 06-28 cron regression is recorded in `hatchgrab_scrape.yml` itself.

*Nothing committed. Nothing staged. Nothing modified. Production = `08ac368`.*
