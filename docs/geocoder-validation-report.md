# Geocoder Validation & Confidence Surfacing — Build Report

**7 September 2026 · scraper project + app · nothing committed, nothing pushed, nothing deployed · the scraper was not run against production data**

Follows `docs/scraper-audit-report.md`. **No venue row was created, updated or deleted.** Every live call in this report is a `select`, a `postcodes.io` lookup, or a Gemini call that touched no database.

**Marking.** 🔎 source-read · 🧪 executed. For each proof I state what it would look like **if it were proving nothing**.

🔴 **THE CORRECTION IS CARRIED.** Nothing here treats an unusual venue name as bad data. *Haircut*, *Physio*, *Near the Co op Store*, *Transit Mot* are pitches named by the landmark the trucks park beside, and the new code geocodes them exactly like any other venue — one of them (`Near the Co op Store`) is a worked example below. The scraper's existing matching, exclusion and dedup rules are untouched. **This task is only about coordinates being wrong.**

---

# WHAT CHANGED, IN FOUR FILES

| Project | File | Change | Lines |
|---|---|---|---|
| **scraper** | `scripts/geo-validate.js` | 🆕 **new** — authoritative geocoding, the validator gauntlet, and the loud-failure assertions | 497 |
| **scraper** | `scripts/run-scraper.js` | geocoder replaced; 3 fire-and-forget writes awaited; every silent-exit-0 path made red | +295 / −111 |
| **app** | `app/manage/[token]/page.tsx` | approval card surfaces a guessed or missing location | **+34** |
| **app** | `components/dashboard/types.ts` | `venue_match_confidence`, `venue_id_source`, `latitude`, `longitude` on `TruckEvent` | +13 |

🔎 **Why a new file.** `run-scraper.js` calls `main()` at import, so **no test can ever import it** — which is precisely how a `throw` was once added *inside the geocoder's own catch* and still exited 0. Every validator and every assertion now lives in a module a test imports **by absolute path**, so the code proved is the code that runs. 🧪 sha256 of the module the suite imported: `a4d02f02…850af7d4`, printed by the suite itself at run time and identical to the file on disk.

---

# TASK 1 — VALIDATE BEFORE STORING

Every coordinate passes `validateCoordinate()` before it can be written. In order: **type → null island → bounding box → sentinel → corroboration-or-pattern.**

## 1.1 Placeholder patterns — the rule, and how it avoids rejecting genuine values

🔎 The rule is deliberately narrow: **the fractional digits must be a strictly consecutive run of length ≥ 4, ascending or descending** — `1234`, `2345`, `5678`, `8765`, `9876`, `0123`. Nothing else.

⚠️ **A broader rule was measured and rejected.** "Repeated two-digit block" (`…9292`, `…1515`) flags *The Crown Inn, Elsenham* and *Engledow Drive, Cambridge*, which 🧪 sit **0.6 km** and **1.1 km** from their own postcodes. Real values. Dropped from the rule.

🔴 **And the pattern is never the sole ground for rejection — that is the whole answer to "how did you avoid rejecting genuine nearby values".** It fires only on an **uncorroborated** coordinate. A coordinate that agrees with a gazetteer within the distance threshold is accepted *however its digits look*.

🧪 **Independent agreement test** (does the pattern actually select wrong rows, or is it superstition?). Every venue with a postcode, checked against postcodes.io:

| | rows | median error | > 5 km |
|---|---|---|---|
| **Flagged** by the pattern | 15 | **6.7 km** | 10 (67%) |
| **Not flagged** | 374 | **0.7 km** | 44 (11.8%) |

A ten-fold separation — the rule picks out genuinely wrong rows. But 4 of the 15 flagged rows sit **within 2 km** of their postcode (*Nayland* 0.56 km, *The railway arms* 0.72 km, *Wintringham Primary* 1.21 km, *Framsden* 1.33 km). Those are real coordinates that happen to land on counting digits, and **corroboration outranks the pattern, so all four are accepted.** 🧪 Proven directly: `52.1234,0.1234` uncorroborated → REJECTED; **the same value** corroborated 0.47 km away → ACCEPTED.
*Failure mode if this proved nothing:* if the rule flagged everything, the "not flagged" median would not be 0.7 km — and the mutation test below shows an always-accept validator turns the suite red.

## 1.2 The recurring point — derived from the data, not hard-coded

🧪 Histogram of "how many venues share one exact coordinate pair": **{2 venues: 13 pairs, 3 venues: 1 pair, 13 venues: 1 pair}**. The 2s are one pub written twice; the single 3 is Wintringham/St Neots — the same place under two names. The **13** is `55.378051,-3.435973`, **the centroid of Great Britain**, used as "somewhere in the UK": *Private Event*, *Your Mums House*, *Latitude Festival*, *Wilderness Festival*, *Lakeside Caravan Park*.

🔎 `SENTINEL_MIN_ROWS = 5` sits in the empty gap between 3 and 13. **The set is built at run time from the live table** (`buildSentinelSet`), so a *new* sentinel at some other coordinate is caught with no code edit. 🧪 Against production today it derives exactly one pair: `55.378051,-3.435973`.

## 1.3 The bounding box — and why it is the UK, not East Anglia

🔴 **A tight operating-area box was measured and rejected as unsafe.** 🧪 Excluding the sentinel rows, real venues span **lat 50.69→56.45, lng −5.95→1.78**, because the trucks genuinely travel: *Isle of Mull*, *Isle of Wight Festival*, *Warwick*, *Silverstone*, *Lancaster*, *South Shields*, *Welwyn Garden City* — **19 venues outside East Anglia, all real bookings.** An East Anglia box would reject them.

🔎 So `UK_BOUNDS` = **49.8–61.0 N, −8.7–1.9 E** — the UK's actual extent (Scilly to Shetland), padded. ⚠️ **Stated plainly: zero current venues violate it; on its own it would have caught none of today's bad rows.** It is the backstop for the fabrication class that lands in the sea or in France. The postcode check is the sharp instrument.

## 1.4 Distance from its own postcode — 5 km

🧪 Measured over all **409** venues carrying a postcode:

| p50 | p75 | p90 | p95 | p99 | max |
|---|---|---|---|---|---|
| 0.76 km | 2.22 km | 7.08 km | 10.98 km | 16.46 km | 76.8 km |

`>1km 42.7% · >2km 27.2% · >3km 19.0% · >5km 13.9% · >8km 9.0% · >10km 7.2% · >15km 2.6%`

🔎 **`POSTCODE_MAX_KM = 5`.** Reasoning: it sits **well above p75**, so the ordinary case — a rural postcode centroid one to three kilometres from the pitch — passes; and it catches **every failure the audit named**: 🧪 Hinchingbrooke 76.8 km → REJECTED, Trumpington's longitude sign-flip 15.2 km → REJECTED, a genuine 3.9 km rural offset → ACCEPTED.
🔴 **10 km would pass all five Trumpington/Cambridge sign-flips.** That is why it is not 10.

## 1.5 🔴 A DEFECT I FOUND IN MY OWN FIX: same-name villages

The first draft resolved a village by taking postcodes.io's **first** result. 🧪 The live test resolved **`Near the Co op Store`, village *Barrow*, to Barrow in LANCASHIRE.**

🧪 Measured: **"Newton" returns 20 places of that exact name spread over 576 km. "Barrow" 8 over 305 km. "Bradfield" 3 over 231 km. "Hadleigh" 2 over 59 km** — Suffolk and Essex, both plausible for these trucks.

🔎 Fixed: only places whose name **is** the village count; several places > `AMBIGUITY_MAX_KM` (10 km) apart is an **ambiguity**, and only a postcode may break the tie — after which the chosen place must still agree with that postcode, so an anchor cannot smuggle a wrong place through. **With no postcode, an ambiguous village yields no coordinate.**

⚠️ **The cost, stated honestly: 🧪 of the 314 distinct village names in production, 228 resolve, 65 (21%) are refused as ambiguous, 21 have no match.** That 21% is a deliberate trade — no pin rather than a possibly-300-km-wrong pin — and it shrinks whenever a postcode is present, which is the normal case. **I cannot measure the real-world rate without running the scraper, which I did not do.**

## 1.6 What happens to a rejected coordinate

🔴 **The coordinate is not stored. The row is** — `name`, `village`, and the postcode if one verified, with `latitude`/`longitude` **NULL**.

**Which does the rest of the pipeline handle correctly? The null-coordinate row, and only that one:**
- 🔎 `app/api/discovery/events/route.ts:163` — `venue.latitude ? parseFloat(…) : undefined`.
- 🔎 `components/MapView.tsx:144` — pins only `venueLat && venueLong`; the event **lists without a marker rather than getting a wrong one**.
- 🔎 `lib/venue-matcher.ts` still matches on name + village, so the venue remains a useful matching target.
- 🧪 One venue already has null coordinates in production and nothing is broken by it.

Refusing the **row** would instead break matching and re-queue the same venue on every future run.

🔴 **"Must not become an unpinnable event that looks like a success" is answered by making it loud, not by refusing the row.** 🔎 The run prints `💾 Venues written: N — X with coordinates, Y WITHOUT`, then a per-venue warning naming each one and why, and the Sheet row is marked `[⚠️ NEW FROM SCRAPER — NO COORDINATES]` instead of the plain marker. ⚠️ It is **not** a run failure: a village postcodes.io does not carry is a legitimate, recurring situation, and failing the run would make the common case red and train everyone to ignore it.

---

# TASK 2 — GEMINI DEMOTED

## 2.1 Where postcodes are available today, and where they are not

🔴 **At geocode time the scraper has no postcode of its own** — it is asking for one. Three sources exist:

| Source | Available? |
|---|---|
| **The venue's hints** (event notes; the extraction prompt already asks for postcodes to go there) | Sometimes — 🔴 **unmeasurable without running the scraper**, because the queue is built during a scrape. 🧪 Of *stored* venues, **409 of 573 (71%)** carry a postcode. |
| **Gemini's suggestion** | Usually — but 🧪 unreliable: *Great Paxton* → `PE4 7EY`, which is **Peterborough, 38.9 km away**; *Stambourne* → `CO9 2ND`, **not a real postcode**; 🧪 20 of 409 stored postcodes do not exist. |
| **The village name** | 🧪 **93.6%** of village names return a postcodes.io place (228/314 after the ambiguity guard). |

## 2.2 The restructure

🔎 Gemini is now a **postcode suggester**, because a postcode is *checkable* and a coordinate is not. Order:

1. **Postcode from the hints**, else Gemini's suggestion → `postcodes.io/postcodes`.
2. **Village** → `postcodes.io/places` (ambiguity-guarded).
3. If both resolve and disagree by more than **10 km**, the postcode is wrong for this village → **use the village point, discard the postcode**.
4. Prefer the postcode point (precise) over the village point (coarse).
5. **Gemini's own lat/lng: last resort only**, and only when the gazetteer actually *answered*.
6. Otherwise: no coordinate.

🔎 The prompt changed too — it now asks for the postcode as the thing that matters, says the answer is verified against an official database, **permits `null`**, and marks lat/lng optional. The old wording ("Find the Postcode, Latitude, and Longitude") gave the model no way to decline, which is why it returned the format example's own digits.

## 2.3 🧪 Live, read-only, against the real postcodes.io

| Venue | Was | Now |
|---|---|---|
| The Bull, **Great Paxton** | `52.3456,0.2345` fabricated | **`52.26032,-0.22845`** — wrong-town postcode distrusted at 38.9 km, village point used |
| The Plough, **Great Shelford** | `52.1234,0.1234` fabricated | **`52.150169,0.139985`** `CB22 5LD` — postcode agreed with village (0.3 km) |
| Village Hall, **Stambourne** | `CO9 2ND` is not a postcode | **`52.02140,0.50542`** — invalid postcode discarded, village point used |
| Trumpington Meadows | `52.171,-0.115` (15.2 km sign flip) | **`52.169785,0.107847`** `CB2 9FT` |
| The Lion, **Ickleton** *(on the map today)* | `52.1234,0.1234` (6.8 km out) | **`52.070875,0.174465`** `CB10 1SS` |
| **Near the Co op Store**, Barrow *(a real pitch)* | — | ⚠️ **refused** — "Barrow" names 8 places up to 358 km apart and there is no postcode to choose between them |

*Failure mode if this proved nothing:* these call the real network, so a stubbed or cached response would be the risk — each result carries postcodes.io's own district/parish and matches an independent lookup of the same postcode.

## 2.4 🔴 postcodes.io failure behaviour — no silent fall-through

🔎 Every lookup distinguishes **three** outcomes and never conflates them: `found` · `not found` (the service answered "no such postcode") · `error` (unreachable, non-2xx, or a 10-second timeout).

🔴 **An `error` is treated as UNKNOWN, not as "no".** An unreachable gazetteer is exactly when a fabricated coordinate would sail through unchecked, so on error **the resolver stores no coordinate at all** rather than falling back to the model.

🧪 Proven: `postcodes.io OUTAGE → NO coordinates` — **and a perfectly valid model coordinate was still refused**, with the trail line `🔴 gazetteer unreachable — refusing to fall through to an unvalidated model guess`. 🧪 Also proven that a *partial* outage still works: postcode lookup errored, `/places` answered → village point used.

---

# TASK 3 — THE THREE WRITES AND THE GREEN-ON-FAILURE RUNS

## 3.1 The three fire-and-forget writes, each now awaited

| Write | Was | Now |
|---|---|---|
| `excluded_terms` (`:688`) | 🔴 `.then()` **inside `forEach(async …)`** — two independent reasons it might never happen. 🧪 The table holds **0 rows**, consistent with this never landing. | `for…of` with an **awaited** upsert; failure collected |
| `discovery_trucks` (`:1540`) | 🔴 `.then()`, no await, as the last thing Pass A does | **awaited**; failure collected |
| `discovery_events` (`:1568`) | 🔴 `.then()`, no await — the mirror carrying the entire map feed | **awaited**; failure collected |

🧪 Verified none remain: a grep for `.then(({ error` / `console.warn('[DB]` / the old `catch { return [] }` returns **nothing**.

## 3.2 Every path that exited 0 on failure

| # | Path | Was | Now |
|---|---|---|---|
| 1 | **Sheet read** (`getTabData`) | 🔴 `catch → return []`. A revoked account, unshared sheet, renamed tab or wrong `SPREADSHEET_ID` became "0 sites, exit 0". **Audit rank 1.** | **throws** |
| 2 | **All four tabs empty, no API error** (wrong-but-readable sheet) | nothing | `assertSheetTabsLoaded` **throws** (a single empty tab — Exclusions — is still fine) |
| 3 | **Zero sites to scrape** | silent | `assertSitesToScrape` **throws** (discovery mode, no target name) |
| 4 | **Every site failing** (dead Gemini key, no network, broken Chrome) | a page of ❌ lines, exit 0 | `assertSomeSiteSucceeded` **throws** when *not one* site extracted. ⚠️ One site failing is still fine — that is Tuesday |
| 5 | **`inbound-schedule` returns 401/500** | 🔴 status never checked; `0 bridged` printed and a **success row** written. **Audit rank 2** | `assertInboundOk` **throws**, and the per-truck catch records a `crash` row naming the truck — visible in SQL |
| 6 | **Trucks Sheet append fails** | `console.error`, carry on | **re-throws** |
| 7 | **Any Pass-A DB write fails** | `console.warn` on an unawaited promise | collected → `assertNoWriteFailures` **throws** |
| 8 | Venue geocode / Sheet append / DB mirror | already re-thrown (7 Sep) | unchanged |

## 3.3 🔴 PROVEN BY EXECUTION, NOT ASSERTED

**Constructed failure, real file, real Google API, read-only** (`SCRAPE_MODE=discovery` so Pass B never runs; the tab reads are the first thing after auth, so nothing can be written before the throw):

| Run | Code | Exit |
|---|---|---|
| **(a) control** — the behaviour *before* this change (throw reverted, both assertions removed) | same file, three reversions | 🔴 **0** — and it printed `💤 No new events found.` |
| **(b) control** — `getTabData` reverted, `assertSheetTabsLoaded` kept | defence in depth | ✅ **1** — `Every Google Sheet tab came back empty` |
| **(c) current** | as shipped | ✅ **1** — `💥 SCRAPER RUN FAILED: Could not read the "Events" tab…` with the stack through `main()` |

**(a) is the proof that matters: a dead credential really did exit 0 and report a quiet day, and now does not.**

🧪 **Happy path also executed:** the current file, the real Sheet, a target name matching no truck → **exit 0**, `ℹ️ Loaded 641 existing unique events`, `📊 Pass A sites: 0 extracted, 0 failed, 0 attempted`, nothing written. This traverses the whole Pass A path *including the appends block and every new assertion*, and incidentally establishes that **the Google Sheets credential is alive today** — which the audit could not.

## 3.4 🔴 THE CONTROL EXPERIMENT CAUGHT A BUG IN MY OWN FIX

Control run (a) first failed with **`ReferenceError: dbWriteFailures is not defined`**. Pass A is split across **two separate `if (RUN_DISCOVERY)` blocks** — the scrape loop and, ~150 lines later, the append block. I had declared the failure collector inside the first, and asserted it in the second.

🔴 **`node --check` passes this. Reading it passes this. Only running it fails.** The declaration moved beside the three accumulators that are already deliberately outside the gate, and the comment there records why. This is the same class as the throw-inside-the-catch, and it is the reason the controls exist.

## 3.5 Throw propagation

🔎 `main().catch(err => { …; process.exit(1) })` is the only entry point, and run (c) shows a stack from `getTabData` through `Promise.all` to `main` ending in exit 1. Each new assertion sits **outside** the per-site `try` (528/911) that deliberately swallows one site's failure; `assertSomeSiteSucceeded` is placed after `browser.close()`, and `assertNoWriteFailures` after the appends. The venue block's own catch **re-throws**, so validator throws inside it still reach `main()`.

---

# TASK 4 — CONFIDENCE ON THE APPROVAL SCREEN

## 4.1 What the screen showed today

🔎 The card (`app/manage/[token]/page.tsx`) shows venue name, status badge, **area · postcode**, time, van, notes, and Approve / Edit / Reject — plus a conflict banner. **It never showed where the pin will be, or that the location was a guess.**

🔎 `venue_match_confidence` and `venue_id_source` are written by exactly one place — `app/api/inbound-schedule/route.ts:229-232`, from `lib/venue-matcher.ts` `findVenue` — and until now were 🧪 **read by nothing in the codebase.** `findVenue` never bails to null when it has candidates: with several same-named venues it picks one deterministically and stamps `'low'`. That guess becomes a public map pin on approval. *The Bull* exists in Bottisham and Langley; *The Plough* in Great Shelford and Birdbrook.

## 4.2 What it shows now

🔎 Two banners on the pending card, in the same warn-with-friction style as the existing conflict warning, **above** the Approve button:

- **📍 "We guessed this location"** — `status='unconfirmed' && source='scraper' && venue_match_confidence==='low'`. Names the venue and town, and points at **Edit** to correct the area or postcode.
- **📍 "No location yet"** — a scraped event with no `latitude`: it will be listed but will never show a map pin. Silent until now.

🔴 **Nothing is auto-rejected and nothing is blocked.** Approving is still one click. A confidently-matched or operator-entered event shows neither banner.

## 4.3 Files, and the `git add -p` set

**Two app files.**
- 🔴 `app/manage/[token]/page.tsx` — **already in the six-file `git add -p` set**, and already carried 289 lines from earlier workstreams. **My contribution is 34 lines, one contiguous hunk at `@@ -7299,0 +7328,34 @@`.** Anyone staging this file gets the other workstream's changes too.
- 🆕 `components/dashboard/types.ts` — **was not modified before; it is a new entry in the working tree** and is **not** in the six-file set.

🧪 `npx tsc --noEmit` — **exit 0**. 🧪 eslint on both files: **0 messages in lines 7330-7370**; the file's 361 pre-existing problems are unchanged, and I added no `any`.

---

# TASK 5 — THE KNOWN-BAD VENUES (SCOPE ONLY — NOTHING MODIFIED)

🧪 **40, not 39.** 27 placeholder + 13 sentinel. ⚠️ The audit said 26 because it used six hard-coded digit sequences; the generic consecutive-run rule finds one more (*Chattisham Church*). Recorded rather than quietly restated.

| | |
|---|---|
| `discovery_events` linked to them, all time | **51** |
| **Future events** | **2** |
| **Future AND `show_on_vf` — i.e. on the public map today** | 🔴 **2** |
| Future operator `truck_events` linked | **0** |

🔴 **Both are live right now:** *The Lion* (Ickleton) at `52.1234,0.1234` — **6.8 km out**; and *Bailey Hills Estate* at `54.8765,-1.4407`.

**What correcting them would involve** — `ignoreDuplicates` means no scraper re-run will ever touch them, so it is an explicit `UPDATE`, not a re-scrape. 🧪 Read-only simulation of the new resolver over all 40: **28 would get an authoritative coordinate, 12 would end with none** (11 have a null village — *Private Event*, *Latitude Festival*, *Wilderness Festival*; *Littlehey* is not a place postcodes.io knows).

⚠️ **The simulation is a proposal, not an answer.** Two moves are far too large to apply unreviewed: *Bailey Hills Estate* would move **116.8 km** and *Lakeside Caravan Park* **398 km** (off the GB centroid to Denver, Norfolk — plausible, but not something to run unattended). A correction should be staged as reviewable SQL with a reversal snapshot, exactly as `scripts/backfill-venue-id.ts` does. **I built none of it.**

### SQL — list the bad venues
```sql
SELECT v.id, v.name, v.village, v.postcode, v.latitude, v.longitude, v.created_at,
       CASE WHEN (v.latitude, v.longitude) = (55.378051, -3.435973) THEN 'sentinel'
            ELSE 'placeholder' END AS defect
FROM venues v
WHERE (v.latitude, v.longitude) = (55.378051, -3.435973)
   OR split_part(rtrim(v.latitude::text, '0'),  '.', 2) IN ('0123','1234','2345','3456','4567','5678','6789','9876','8765','7654','6543','5432','4321','3210')
   OR split_part(rtrim(v.longitude::text, '0'), '.', 2) IN ('0123','1234','2345','3456','4567','5678','6789','9876','8765','7654','6543','5432','4321','3210')
ORDER BY defect, v.village, v.name;
```

### SQL — derive the sentinel set from the data (do not hard-code a pair)
```sql
SELECT latitude, longitude, count(*) AS venues,
       count(DISTINCT coalesce(village, '(null)')) AS distinct_villages,
       array_agg(name ORDER BY name) AS venue_names
FROM venues
WHERE latitude IS NOT NULL
GROUP BY latitude, longitude
HAVING count(*) >= 5
ORDER BY venues DESC;
```

### SQL — which of them are on a public map right now
```sql
SELECT e.event_date, e.truck_name, e.venue_name, v.village, v.latitude, v.longitude, e.show_on_vf, e.show_on_hg
FROM discovery_events e
JOIN venues v ON v.id = e.venue_id
WHERE e.event_date >= current_date
  AND ( (v.latitude, v.longitude) = (55.378051, -3.435973)
     OR split_part(rtrim(v.latitude::text, '0'),  '.', 2) IN ('1234','2345','3456','4567','5678','6789','9876','8765')
     OR split_part(rtrim(v.longitude::text, '0'), '.', 2) IN ('1234','2345','3456','4567','5678','6789','9876','8765') )
ORDER BY e.event_date;
```

### SQL — every event that would be affected by a correction
```sql
SELECT v.name AS venue, v.village, count(*) FILTER (WHERE e.event_date >= current_date) AS future_events,
       count(*) AS all_events, min(e.event_date) AS first_event, max(e.event_date) AS last_event
FROM venues v
LEFT JOIN discovery_events e ON e.venue_id = v.id
WHERE (v.latitude, v.longitude) = (55.378051, -3.435973)
   OR split_part(rtrim(v.latitude::text, '0'),  '.', 2) IN ('1234','2345','3456','4567','5678','6789','9876','8765')
   OR split_part(rtrim(v.longitude::text, '0'), '.', 2) IN ('1234','2345','3456','4567','5678','6789','9876','8765')
GROUP BY v.name, v.village ORDER BY future_events DESC, all_events DESC;
```

### SQL — operator events carrying a guessed location (what Task 4 now surfaces)
```sql
SELECT t.name AS truck, e.event_date, e.venue_name, e.town, e.postcode,
       e.venue_match_confidence, e.venue_id_source, e.latitude, e.longitude, e.status
FROM truck_events e JOIN trucks t ON t.id = e.truck_id
WHERE e.source = 'scraper' AND e.event_date >= current_date
  AND (e.venue_match_confidence = 'low' OR e.latitude IS NULL)
ORDER BY e.event_date;
```

---

# VERIFICATION

## The suite

🧪 **52 assertions, 52 passed, exit 0**, importing `scripts/geo-validate.js` by absolute path with its sha256 printed at run time.

🔴 **Every rejection is paired with an acceptance through the same code path**, so a validator that refused everything could not pass. Proven rejections: placeholder-uncorroborated · GB centroid · lat 62 · lng 3.5 (Netherlands) · Trumpington sign-flip · Hinchingbrooke 76.8 km · `null` · `"N/A"` · `NaN` · `0,0` · gazetteer outage · ambiguous village with no postcode · fuzzy-neighbour-only place names. Proven acceptances: the *same* placeholder value once corroborated · a 1-row coordinate from the same census · Cambridge · the correct Trumpington point · a genuine 3.9 km rural offset · numeric strings · two records of one settlement 1.4 km apart · an ambiguous village *with* a postcode.

## 🔴 Mutation test — proof the suite is not vacuously green

Each mutation was applied to a **copy**; the suite was pointed at the mutant:

| Mutation | Result |
|---|---|
| `validateCoordinate` always accepts | 🔴 **11 failed** |
| sentinel check disabled | 🔴 **1 failed** |
| postcode-distance check disabled | 🔴 **2 failed** |

*Failure mode if this proved nothing:* if all three had stayed green, the suite would be testing nothing. They went red.

## What each proof would look like if it were proving nothing

| Proof | Would-be-hollow signature | Why it is not |
|---|---|---|
| 52-assertion suite | validators that reject everything | acceptance cases pass; mutants go red |
| Placeholder agreement (6.7 km vs 0.7 km) | the rule flagging everything | 27 of 573 flagged; unflagged median 0.7 km |
| Exit-code controls | the file failing for an unrelated reason | control (a) exits **0** with the *old* message; (c) exits 1 with the *new* one and a stack |
| Live postcodes.io resolve | a cached or stubbed response | real network; results carry postcodes.io's own parish/district |
| Happy-path run | failing silently before doing anything | it read the real Sheet — `Loaded 641 existing unique events` |
| Gemini stability (audit) | 4 calls sharing a model revision | ⚠️ still true; unchanged, and now irrelevant since model coordinates are last-resort |

---

# THE TREE

🧪 `HEAD = 08ac368`, `origin/main = 08ac368`, **0 staged, 0 committed, nothing pushed, nothing deployed.** `git add -A` / `git add .` were not run. **25 modified** (24 pre-existing + `components/dashboard/types.ts`, new) and **79 untracked** (78 + `scripts/geo-validate.js`; this report replaces an existing filename).

**Scraper project:** `scripts/geo-validate.js` (untracked, new) · `scripts/run-scraper.js` (modified).
**App:** `app/manage/[token]/page.tsx` (modified — already in the six-file set, my part is 34 lines) · `components/dashboard/types.ts` (modified — new to the tree).

Every other uncommitted workstream is untouched. 🔴 **No venue row was created, updated or deleted; every database call in this work was a `select`.** The scraper was never run against production data — the two live runs used a deliberately broken spreadsheet ID and a target name matching no truck.

---

# WHAT I COULD NOT READ OR VERIFY

- 🔴 **The new code has never run a real scrape.** Its geocoding path is proven against the real postcodes.io with real venue names, and its whole Pass A path is proven end-to-end on a 0-site run — but **no venue has been written by it**, because the prompt forbade running the scraper and creating venues. The first genuine run is still unproven.
- 🔴 **How often a postcode is actually present in the hints at geocode time.** Only measurable during a scrape. The 71% figure is for *stored* venues, which is not the same population.
- 🔴 **The real-world cost of the ambiguity guard.** 21% of *stored* village names are ambiguous; how many of those arrive with a postcode (and so still resolve) is unmeasurable without a run.
- 🔴 **GitHub Actions run history and the secret store** — `gh` is not installed on this machine, so I still cannot see whether recent scheduled runs were red or green, nor confirm the workflow secrets. The new exit-1 paths will only be *visible* if someone is watching Actions.
- ⚠️ **`assertSitesToScrape`, `assertSomeSiteSucceeded`, `assertNoWriteFailures` and `assertInboundOk` are proven to throw by unit execution, and the throw-to-exit-1 mechanism is proven end-to-end by run (c)** — but I could not construct a live scrape that reaches each of those four call sites without running the scraper for real.
- ⚠️ **`excluded_terms` still has 0 rows,** so whether that write now lands is unproven — it needs a run in which the model returns `exclusionsToAdd`.
- ⚠️ **postcodes.io's own accuracy** is taken as authoritative. It is an ONS-derived open dataset; a postcode centroid is not a building.
- ⚠️ **Whether the 12 unresolvable bad venues should exist at all** (*Private Event*, *Your Mums House*) is a data question I deliberately did not touch, per the standing correction about unusual names.
- ⚠️ **The Sheet's column L collision** (the new-venue marker is written into the column read as the venue's scraper strategy) is **noted in code and left unfixed** — out of scope for this prompt.
