# Venue coordinates, and making the 51 silent trucks diagnosable

**7 September 2026 · SQL prepared for you · Part 2 built · nothing applied, nothing committed**

**Marking.** 🔎 source-read · 🧪 executed. 🔴 **Every call I made was a `select` or a read-only `postcodes.io` lookup. I wrote to no table and applied no migration.**

🧪 Confirmed first: **Pimp My Fish now has 9 future events.** The manual insert landed.

---

## 🔴 THE FINDING THAT CHANGES PART 3, UP FRONT

You asked me to look for date clustering among the 51. **There is almost none — the stops are spread over 33 separate days from 22 May to 6 September, never more than 4 on one day.** So it is not one broken run.

**But there is clustering, by host, and it is severe:**

| Host | Zero future | Working | Success |
|---|---|---|---|
| 🔴 **facebook.com** | **30** | 11 | **27%** |
| offthebeatentruck.co.uk | 21 | 15 | 42% |
| nethergate.co.uk | 9 | 5 | 36% |

🔴 **30 of the 51 are Facebook pages, and 73% of every Facebook-sourced truck is failing.** And the second signal is sharper still:

| Strategy | Zero future | Working |
|---|---|---|
| `scroll_lazy` | 🔴 **51 (all of them)** | 33 |
| `manual` | **0** | **9** |
| `click_next` | 0 | 3 |
| `scrape_rules` | 0 | 1 |

🎯 **Every single failing truck is `scroll_lazy`. Every `manual` and `scrape_rules` truck works — because those strategies never load a page at all.** This is not 51 individual mysteries. It is one dominant cause (reading Facebook with a browser) plus a long tail of genuine idleness.

*Failure mode if this proved nothing:* if `scroll_lazy` were simply the overwhelming majority, "all failures are scroll_lazy" would be vacuous. It is not — `scroll_lazy` is 84 of 95 trucks, and 39% of them work, while 13 of 13 `manual`/`click_next`/`scrape_rules` trucks work. The split is real.

---

# PART 1 — BAD VENUE COORDINATES

## 1a. The list, re-derived live — 103, not 40

🔴 **The earlier "40 known-bad" figure was too low, and the reason matters.** It came from the village-anchor check, which compares a venue against the median of *other venues in the same village* — so a village holding exactly one venue anchors to itself and scores zero. That check passed 7 broken venues, Hinchingbrooke among them.

🧪 Re-derived from the live table using signals that do **not** depend on village anchors:

| Signal | Venues |
|---|---|
| Placeholder decimals (`…1234`, `…5678`) | **27** |
| Sentinel coordinate — the GB centroid `55.378051,-3.435973` | **13** |
| **> 5 km from its own postcode** (postcodes.io, all 409 postcode-carrying venues) | **54** |
| Postcode string is not a real postcode | **20** |
| **Total distinct venues flagged** | 🔴 **103 of 573** |

## 1b. Which can be corrected, and from what

🧪 Each flagged venue run through `resolveCoordinates` — which **cross-checks the postcode against the village and refuses a postcode that disagrees by more than 10 km.** That guard is what stops a "correction" toward a wrong-town postcode.

| Tier | Basis | Count | Move p50 | Max |
|---|---|---|---|---|
| **A** | valid postcode that **agrees** with the village → the postcode's own point | **54** | 8.48 km | 16.7 km |
| **B** | no usable postcode → **village centroid** (`/places`) | **27** | 4.83 km | 398 km |
| **Held** | no postcode *and* no resolvable village | **22** | — | — |

🔴 **Gemini was not used and no fallback to it exists.** The 22 held back are held back, exactly as instructed: 11 have a null village (*Private Event*, *Latitude Festival*, *Wilderness Festival*), and 11 more have an invalid postcode plus an ambiguous village name (*"Linton" names 8 places up to 516 km apart*).

⚠️ **One held-back row deserves naming: `Wylde Skye` [Linton].** It was flagged only because its **postcode string** `CB21 4YD` is invalid — 🧪 **its coordinate is fine, 0.06 km from CB21 4XN.** Holding it back is correct: the flag is on the postcode field, not the position. **A bad postcode is not the same as a bad coordinate**, and conflating them would have moved a good pin.

## 1c. 🔴 EVERY MOVE OVER 20 KM — read these before running

All five are **Tier B** (village centroid), which means the evidence is weakest exactly where the move is largest. They are in their own opt-in file and are **not** in Tier A or B.

| Move | Venue | Old → New | Future events | Why flagged |
|---|---|---|---|---|
| 🔴 **398.0 km** | **Lakeside Caravan Park** [Denver] | `55.378051,-3.435973` → `52.588136,0.381031` | 0 | GB centroid |
| 🔴 **116.8 km** | **Bailey Hills Estate** [Bailey Hills] | `54.8765,-1.4407` → `53.852123,-1.841124` | **1 (on VF)** | placeholder decimals; postcode NE33 2QB invalid |
| **29.9 km** | We Are Wintringham [Wintringham] | `52.4797,-0.3409` → `52.221272,-0.218070` | 0 | 16.0 km from PE8 6HX |
| **27.4 km** | Hinchingbrooke house events | `52.37,0.2` → `52.328714,-0.197026` | 0 | 76.8 km from PE20 3RW |
| **20.9 km** | The 'Case is Altered' pub [Bentley] | `52.0798,0.7998` → `51.991344,1.068594` | 0 | 18.7 km from CO10 8BG |

**My reading, for what it is worth:** the Denver, Wintringham, Hinchingbrooke and Bentley moves all land the venue in the village it is named after, and all four current positions are demonstrably wrong. 🔴 **Bailey Hills is the one I would not run.** Its village name resolves to somewhere near Leeds, its postcode is invalid, and **it is the only one of the five carrying a live event on the public map.** A 117 km move on that evidence is a guess.

## 1d. Event impact

🧪 Of all 81 proposed corrections:

| | |
|---|---|
| Venues touching a **future** event | **3** |
| Future events affected | **6** |
| Of those, **live on Village Foodie today** | 🔴 **6** |

| Venue | Move | Future events |
|---|---|---|
| Wylde Sky Brewery [Linton] | 6.82 km | **4** (all on VF) |
| The Lion [Ickleton] | 6.80 km | **1** (on VF) |
| Bailey Hills Estate | 116.8 km | **1** (on VF) |

🎯 The first two are Tier A, postcode-backed, and both currently pin ~7 km from the pub. **Those two files fix five live wrong pins.**

## 1e. The SQL

📁 **`docs/sql/venue-coords-20260907/`** — visible in Cursor:

| File | UPDATEs |
|---|---|
| `00-snapshot.sql` | 0 — **run first**, captures all 574 venues' coordinates |
| `01-verify-before.sql` | 0 |
| `02/03/04-tierA-chunk-*.sql` | **18 + 18 + 18 = 54** |
| `05-tierB-review.sql` | **22** — village centroid, review first |
| `06-BIG-MOVES-opt-in.sql` | **5** — each annotated, delete any line you reject |
| `07-verify-after.sql` | 0 |
| `08-rollback.sql` | restores from the snapshot |

🧪 Verified mechanically: **81 `UPDATE` statements across the runnable files, 81 distinct venue ids, 0 `INSERT`, 0 `DELETE` anywhere** (the only `DROP` is a commented-out cleanup line in the rollback). Every statement sets `latitude` and `longitude` only.

## ⚠️ Would anything overwrite these corrections?

🎯 **No — nothing in the codebase can.** 🔎 Verified by reading every writer of `venues`:
- The scraper's venue creation uses `ignoreDuplicates: true` → `ON CONFLICT DO NOTHING`. It **cannot** update an existing row.
- `scripts/migrate-from-sheets.cjs` upserts on `name` — which would now raise 42P10 against the real `(name, village)` constraint, so it cannot run at all.
- `scripts/reresolve-event-venues.ts` writes `truck_events`, never `venues`.

🔴 **So a hand-fix is permanent until another hand-fix — which cuts both ways.** It will not be undone; it also will not be corrected if I have got one wrong. That is the argument for running Tier A freely, Tier B after reading, and the five big moves one at a time.

---

# PART 2 — THE RUN LOG (BUILT, NOT APPLIED)

## 2a. The shape

🎯 **One row per site per run**, shaped to read like `scraper_run_log`: a `run_at`, a per-subject key, counters, a free-text `notes`.

🔴 **Zero-found versus never-attempted is structural, not a flag:**

| Question | How the table answers it |
|---|---|
| Attempted, found nothing | a row exists for `(run_id, site_name)` with `events_extracted = 0` |
| **Never attempted** | 🔴 **no row at all under the latest `run_id`** |

So "which sites did this run skip?" is an anti-join against the previous run, and "which sites are read but yield nothing?" is a filter. **Neither is answerable today, and that is the whole point.**

Columns: `run_id`, `run_at`, `site_name`, `source_type`, `url`, `strategy`, `outcome`, `page_chars`, `events_extracted`, `events_filtered`, `events_new`, `duplicates`, `error`, `notes`.
Outcomes: `ok` · `empty_page` · `ai_error` · `site_error` · `manual`.

🔎 A **separate table** from `scraper_run_log`, not an extension of it: Pass A keys on a **Sheet row** (name + URL + strategy), not on `trucks.id`, and most discovery sites have no `trucks` row, so the existing FK could not hold them.

## 2b. The migration — written, NOT applied

📄 **`supabase/migrations/20260907_discovery_run_log.sql`** (89 lines). Idempotent, RLS on, one service-role policy, anon/authenticated grants revoked, two indexes, `notify pgrst` at the end. **I have not run it.**

## 2c. Where it is written in `scripts/run-scraper.js`

🔎 Three edits, all in Pass A:

1. **`DISCOVERY_RUN_ID = randomUUID()`** — one id per invocation, declared beside the other Pass-A accumulators (outside the `if (RUN_DISCOVERY)` gate, because Pass A spans two separate blocks — the scope bug that a control run caught last time).
2. **`logDiscoverySite(row)`** — 🔴 **`await`ed, never fire-and-forget.** Three writes in this file were `.then()` with no await and that is why venue creation failed silently for three months.
3. **Called in the per-site `finally`** — so every exit path leaves a row, including the `continue` on an empty page and any throw. 🔴 **That placement is what makes "no row" mean "never attempted".**

⚠️ **One deliberate carve-out, and only one.** A `42P01` (relation does not exist) is warned **once** and tolerated, because migrations here are applied by hand and the code may deploy first — without it, shipping before the migration would turn every run red. **Any other error is collected into `dbWriteFailures` and turns the run red.** The precedent is the `signup_promo_code` handling in `app/api/admin/route.ts`.

🧪 **Verified:** `node --check` passes, and a real 0-site run (real Sheet, a target name matching no truck) exits **0** and prints the run id — so there is no module- or `main()`-scope reference error.
⚠️ *Failure mode if this proved nothing:* **it partly does.** A 0-site run never enters the loop, so **the per-site write path itself is unexercised.** I could not exercise it without either running a real scrape (writes events) or attempting an insert (a write). **The first real run is the test.**

## 2d. The alert, with N derived

🧪 **N derived from data, not chosen.** For trucks that currently have future events — the healthy population — the gap between consecutive write days is:

`p50 2d · p75 5d · p90 8d · p95 13d · p99 30d · max 106d`

| N | Healthy trucks falsely alerted today |
|---|---|
| 3 d | 11 |
| 7 d | 7 |
| **14 d** | **3** |
| 21 d | 3 |

🎯 **N = 14 consecutive daily runs.** It sits just above the healthy p95 (13 days), and 21 buys no further reduction. ⚠️ **Honest caveat: that is derived from *write* gaps, which is the only proxy available today.** The alert should fire on `events_extracted = 0` — "the page yielded nothing", a stronger signal than "nothing new was written" — and **N for that must be re-derived after two weeks of real log data.** I am giving you a defensible starting value, not a final one.

**Where it goes, and how it avoids becoming noise:**
🎯 The admin console, as a section beside the existing `demo_cleanup` staleness badge — the pattern already in `app/api/admin/route.ts`, which the manual describes as *"a human seeing a stale timestamp in the console they already use is the detector"*. Not email.
🔴 **Noise control: alert on the transition, not the state.** A truck that has been silent for 40 days must not appear every day for 40 days. The established pattern in this codebase is the custom-domain once-per-transition alert; the same applies — surface a truck when it *crosses* 14 consecutive zero runs, and again only if it recovers and crosses again. 🧪 Without that, today's list would be 51 rows every single day, which is exactly how a detector gets ignored.

## 2e. What the first logged run tells us, and when

**The first run — tomorrow, ~06:00 UTC — answers the biggest question immediately**, because never-attempted is visible from a single run:

| After 1 run | What you learn |
|---|---|
| Sites with **no row** | 🔴 **Not in the Sheet's site list at all.** This is the Pimp My Fish hypothesis, and one query settles it for all 51. |
| `outcome = 'empty_page'` | The page rendered nothing — the expected verdict for most of the 30 Facebook trucks |
| `outcome = 'ai_error'` | Extraction failing, not fetching |
| `events_extracted > 0, events_new = 0` | 🔴 **Working, but everything deduped — the Sheet has events the database does not.** The venue-outage shape. |

**One run: attempted-vs-not, and the failure mode of every attempted site. Two weeks: a defensible N and the consecutive-zero alert.** Nothing needs 51 individual investigations.

**Files changed for Part 2 — scraper project only:**
- `supabase/migrations/20260907_discovery_run_log.sql` 🆕 (not applied)
- `scripts/run-scraper.js` (instrumented)

**No app files were changed.**

---

# PART 3 — WHAT THE DATA ALREADY SAYS

## 3a / 3b. Stops, and where the clustering really is

🧪 51 URL-scraped trucks with zero future events (was 52; Pimp My Fish now has 9). Their last-write dates spread over **33 distinct days**, maximum 4 on any one day — 🔴 **no date clustering, so no single broken run.** The host and strategy clustering above is the real answer.

**Actively scraped but finding nothing forward** — written within 7 days, forward gap ≤ 2 days. These are being read and the page yields nothing ahead:

`Naked Fish` (68 events, 1d ago) · `Churro Boyz` (65, 1d) · `Suffolk Spice Fusion` (12, 1d) · `Suffolk Pig Roast` (15, 1d) · `The Pizza Vault` (9, 2d) · `Real Thai Food` (14, 2d) · `Little Red` (6, 2d) · `Wok Wraps` (58, 3d) · `Dolly's Pizza Van` (37, 4d) · `Pizza Passione` (16, 7d) · `Hotaco` (13, 7d)

🧪 **10 of those 11 are Facebook.**

**Stale — no write for over 14 days**, 29 trucks, from 16 days (*Slingers*) to 108 days (*Burger Art*). These are the trail-off group: the site is gone, the truck stopped, or the row left the Sheet. `Between Buns` (79 events, 13 days) and `Suffolk Mermaid` (36 events, 24 days) are the largest histories in this group.

## 3c. Shape differences

Covered in the headline: **100% of failures are `scroll_lazy`; every `manual`, `click_next` and `scrape_rules` truck works.** 🧪 Also: the failing set is concentrated on **7 distinct hosts** against **26** among working trucks — the failures are not spread across the web, they are piled on Facebook and two venue sites.

## 3d. SQL for you to read yourself

```sql
-- Every URL-scraped truck: URL, strategy, staleness, and whether it has anything upcoming.
WITH parsed AS (
  SELECT truck_name,
         substring(source from 'URL:\s*(\S+)')             AS url,
         btrim(substring(source from 'Strategy:\s*(.*)$')) AS strategy,
         event_date, created_at
  FROM discovery_events WHERE source LIKE 'URL:%'
)
SELECT truck_name, url, strategy,
       count(*) AS all_events,
       count(*) FILTER (WHERE event_date >= CURRENT_DATE) AS future_events,
       max(event_date) AS last_event_date,
       max(created_at)::date AS last_written,
       CURRENT_DATE - max(created_at)::date AS days_since_written,
       max(event_date) - max(created_at)::date AS forward_gap_days
FROM parsed
GROUP BY truck_name, url, strategy
ORDER BY future_events, days_since_written;
```

```sql
-- 3b — do the stops cluster on a date? (They do not; run it and see.)
WITH parsed AS (
  SELECT truck_name, event_date, created_at FROM discovery_events WHERE source LIKE 'URL:%'
), per AS (
  SELECT truck_name, max(created_at)::date AS last_written,
         count(*) FILTER (WHERE event_date >= CURRENT_DATE) AS future_events
  FROM parsed GROUP BY truck_name
)
SELECT last_written, count(*) AS trucks, string_agg(truck_name, ' | ' ORDER BY truck_name) AS which
FROM per WHERE future_events = 0
GROUP BY last_written ORDER BY last_written DESC;
```

```sql
-- 3c — success rate by host and by strategy. This is where the real cluster is.
WITH parsed AS (
  SELECT truck_name,
         lower(regexp_replace(substring(source from 'URL:\s*https?://([^/]+)'), '^www\.', '')) AS host,
         btrim(substring(source from 'Strategy:\s*(.*)$')) AS strategy,
         event_date
  FROM discovery_events WHERE source LIKE 'URL:%'
), per AS (
  SELECT truck_name, host, strategy,
         max((event_date >= CURRENT_DATE)::int) AS has_future
  FROM parsed GROUP BY truck_name, host, strategy
)
SELECT host, strategy, count(*) AS trucks,
       sum(has_future) AS working,
       count(*) - sum(has_future) AS zero_future,
       round(100.0 * sum(has_future) / count(*)) AS success_pct
FROM per GROUP BY host, strategy ORDER BY trucks DESC;
```

```sql
-- After the migration is applied and one run has completed:
-- 🔴 which sites were NEVER ATTEMPTED in the latest run. This is the query that does not exist today.
WITH latest AS (SELECT run_id FROM discovery_run_log ORDER BY run_at DESC LIMIT 1),
     prev   AS (SELECT DISTINCT site_name FROM discovery_run_log
                WHERE run_id <> (SELECT run_id FROM latest))
SELECT p.site_name AS attempted_before_but_not_in_the_latest_run
FROM prev p
WHERE NOT EXISTS (
  SELECT 1 FROM discovery_run_log l
  WHERE l.run_id = (SELECT run_id FROM latest) AND l.site_name = p.site_name)
ORDER BY 1;
```

```sql
-- And: attempted, but the page yielded nothing.
SELECT site_name, url, strategy, outcome, page_chars, events_extracted, events_new, error
FROM discovery_run_log
WHERE run_id = (SELECT run_id FROM discovery_run_log ORDER BY run_at DESC LIMIT 1)
  AND coalesce(events_extracted, 0) = 0
ORDER BY outcome, site_name;
```

---

# THE TREE

🧪 `HEAD = 08ac368` = `origin/main`. **0 staged · 0 committed · nothing pushed · nothing deployed.** `git add -A` / `git add .` not run. **No table was written; no migration was applied.**

**Scraper-project files:**
- `scripts/run-scraper.js` — modified (run-log instrumentation)
- `supabase/migrations/20260907_discovery_run_log.sql` — 🆕 new, **not applied**
- `docs/sql/venue-coords-20260907/` — 🆕 nine SQL files for you to run

**App files:** **none changed.**

Tree: **26 modified / 88 untracked**. Every other uncommitted workstream untouched; the six-file `git add -p` set is unchanged and not added to.

---

# WHAT I COULD NOT READ OR VERIFY

- 🔴 **The per-site run-log write has never executed.** `node --check` passes and a 0-site run exits 0, but that run never enters the loop. **The first real scrape is the test**, and I could not do better without writing.
- 🔴 **Whether the 81 corrections are right — only that they are better-evidenced than what is stored.** Tier A rests on postcodes.io being right about the postcode and the venue actually being at that postcode. Tier B rests only on a village name.
- 🔴 **Bailey Hills Estate.** I do not know where it is. Its postcode is invalid, its village resolves near Leeds, and it carries a live event. **The 117 km move is a guess and I have separated it out rather than bury it.**
- 🔴 **Why the 51 stopped.** Facebook is heavily implicated by association — 30 of 51, 73% failure rate — but **I did not fetch a single Facebook page to confirm what the scraper sees there.** That would have settled it, and it is the obvious next read.
- ⚠️ **N = 14 is derived from write gaps, not from zero-extraction runs**, because the latter data does not exist yet. It must be re-derived after two weeks.
- ⚠️ **The 22 held-back venues stay wrong.** Nothing in this report improves them, and `ignoreDuplicates` means nothing ever will without a hand-fix.
- ⚠️ **The alert is specified, not built.** No code writes it and no admin surface reads it.
- ⚠️ **Whether `discovery_run_log` will conflict with an existing table of that name** — 🧪 no migration in the repo creates one, but I could not query `information_schema` through PostgREST to be certain.
