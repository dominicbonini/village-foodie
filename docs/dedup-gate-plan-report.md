# One gate, one dry run, one delete job — diagnosis (Part A) and dry run (Part B)

**Parts A and B only.** No production code, no schema change, no migration, no database write, no
deletion. `truck_events` was neither read nor written. The scraper was not run. Nothing outside `docs/`
changed (the seven modified files in `git status` are the same seven as at the start).

Nothing in the brief arrived garbled and no instruction contradicted another.

---

## 🔴 WHERE THE MANUALS AND MY OWN REPORTS ARE WRONG

1. **My `dedup-rules-review-report.md` said `foodPark` and `FoodPark Biomedical` are "1.8 km apart". They
   are 512 m apart.** Measured today from the stored coordinates (52.1751, 0.1415 vs 52.1740, 0.1342). I
   did not compute the distance in that report; I eyeballed it. The correct figure matters here because
   **512 m is 12 m outside your 500 m rule** — see B2.
2. **The brief's "normal is about 39 rows a day" is the peak, not the norm.** Re-derived over the last 14
   days of `discovery_events.created_at`: **4 – 44 rows/day, mean 17.8**; only 7 Sep (41) and 9 Sep (44)
   reached 39. The count floor in C3 should be set from that distribution, not from 39.
3. **My `trading-truck-rules-review.md` claim that the bridge acts on in-flight rows — re-confirmed
   verbatim**: the loop is `for (const row of rows)` and the only `discovery_events` reference in the route
   is its own upsert. Placement constraint holds (A2).
4. The scraper manual's "116 rows per run, ~42,000 a year" for `discovery_run_log` **holds**: two runs in
   the table, 116 rows each.

---

# PART ONE — PLAIN ENGLISH

## What the dry run found (Part B)

I ran your rule — same date, same truck by the scraper's own normaliser, venues within 500 m, newest wins —
over the **690 future-dated events** in the table today. It produced **181 same-day pairs** for the same
truck. Of those:

- **104 could be judged** (both venues have coordinates). **6 are duplicates** under the rule; **98 are
  genuinely different pitches**, most of them tens of kilometres apart.
- **77 could not be judged** because one or both rows have no venue link at all — and that is **43% of the
  pairs**. This is the number that matters most, and it is not a coordinate problem: it is a *linking*
  problem. Every one of the 75 unlinked rows has `venue_id` empty; not one links to a venue lacking
  coordinates.

**The six it would mark** are all at 0–26 m and are all unambiguous: Pig-Casso's at the Biomedical Campus
(three dates, two spellings of one pitch 26 m apart), Elder Street Food at The Common (two spellings, 0 m),
Gusto at Wickhambrook MSC (Pass A vs Pass B, 0 m), and The Forge Kitchen at Debenham (screenshot vs
website, 0 m). **Positive control:** the Gusto `Wickhambrook MSC` / `MSC` pair is the one from my earlier
report; it is caught. **Negative control:** Pig-Casso's `foodPark` vs `Cambridge Science Park`, 6.6 km,
correctly kept apart.

**The band you asked about (400–600 m) contains exactly one venue pair, seen on three dates: `foodPark`
[CB2 0AA] against the two Biomedical Campus rows, at 512 m.** The threshold is currently deciding nothing
*except* this pair, and it decides it the wrong way if — as the shared postcode suggests — they are the
same pitch. Two things you can do: move the line to ~550 m, or (better) fix the `foodPark` venue's
coordinates, which sit 512 m from the postcode's other rows.

**The 77 unjudgeable pairs are where the real duplicates are hiding.** The known Nomadough pair — the
long "foodPark at The Green & The Gardens…" name against `FoodPark Biomedical`, which I reported as ~100 m
apart — **is in the table and did not surface**, because the long-name row has no `venue_id` even though a
venue row with that exact name exists. Same for Pig-Casso's `foodPark` vs `FoodPark CB1` on 11 November.
If the existing matcher (`findVenue`) were run over the 75 unlinked rows, **71 would resolve to a venue
with coordinates (35 at high confidence)**. I have not applied it; I am reporting that it would make most of
the blind spot judgeable.

## What I would do with the unjudgeable rows

Not guess. Resolve first, judge second: the gate's own venue step (C1) should run `findVenue` on every
incoming row and — for the one-off pass — on the 326 future rows that have no link today. Only after that
does the distance rule get a fair run. Rows that *still* cannot be resolved should be left unmarked and
counted, not treated as distinct.

## The writers, and where the gate must not go (A1, A2)

There are **four producers and two doors**. The website scraper (Pass A) writes to the database **directly**
and is **82% of all rows** and 213 of the last 14 days' 249. Everything else — Pass B, the Google Apps
Script, your admin screenshot upload — posts to `/api/inbound-schedule`, which resolves the venue and truck
and then bridges linked trucks into `truck_events`. Two maintenance scripts also write (the Hatches-Up
import, the venue backfill) and the admin events editor updates and deletes single rows.

**The gate must not sit inside `/api/inbound-schedule` before its bridge loop.** That loop reads the
request's rows, not the table; anything that trims those rows would also stop an operator being asked to
approve an event. Put the gate in a shared library the route calls *for the discovery write only*, and leave
the bridge reading the untrimmed rows. That is the whole constraint, and it is easy to honour.

## Making the scraper post to the app instead (A3)

It is a small change with one real cost. Pass B already posts to the same endpoint from GitHub Actions
with the shared secret, and already treats a non-2xx as a crash. Pass A would do the same, in batches.
**The cost:** today, if the database is down, the run still succeeds at the Sheet and fails loudly at the
end; if the endpoint is down instead, the same thing happens — except the fix is now a Vercel deploy, not
just Supabase being up, and the route runs one upsert per request, so a bad day of 750 rows needs to be
chunked (the route has no timeout override; the default applies). **Not a bad idea** — it is the only way
to get one write path — but the run must chunk, must keep `assertInboundOk`, and must not need the app to
be healthy for the Sheet write to succeed.

## Venue data coverage (A4)

Of **819 venues**: **728 have coordinates (89%)**, 599 have a postcode, 569 both, **61 neither**. Among the
**92 venues that future events actually point at: all 92 have coordinates.** So a distance rule is not
blind on the venues that are linked — it is blind on the **326 of 690 future events (47%) that are not
linked to any venue at all.** Coverage is a linking problem, not a coordinate problem.

## Excluding the four linked trucks from a delete (A5)

**Name catches everything the FK catches, and more; the FK misses rows on three of the four.** Pizzeria
Gusto has 87 rows by name and only 73 by FK; Real Thai Food 17 vs 13; Tikka Tonic 9 vs 3; Test Kitchen 50
vs 50. **No row is FK-only.** Each truck has exactly one spelling in the table, no aliases, and **no other
truck's name contains a linked truck's name**, so a name rule would not over-catch today. Your "both, not
either" rule is right — and the FK is the weaker half.

---

# PART TWO — THE NUMBERS (all re-derived today, asserted against `content-range`)

| | |
|---|---|
| `discovery_events` | **920** — 690 future (≥ 2026-09-11), 230 past |
| `venues` | **819** |
| `discovery_trucks` | **231**, 4 linked |
| `discovery_run_log` | **232** rows — 2 runs (9 Sep, 10 Sep), **116 each** |
| Future events with `venue_id` NULL | **326 of 690 (47.2%)** |
| Visibility in use | `public`/vf✓/hg✓ **913**; `hg_only`/vf✗/hg✓ **7**; `hidden` **0** |
| Past-dated rows a delete job would take on its first run | **230** |

---

# PART THREE — DETAIL BY QUESTION

## A1. Every writer of `discovery_events`

| # | writer | how it writes | enrichment | last 14 days |
|---|---|---|---|---|
| 1 | **Scraper Pass A** (`scripts/run-scraper.js`, `URL:` + `Manual Entry`) | direct upsert on `event_date,truck_name,venue_name` in batches of 100, **DO UPDATE** | **none** — no `venue_id`, no `discovery_truck_id`, no visibility flags | **213** |
| 2 | **`/api/inbound-schedule`** — one door, three producers | single upsert of the whole request on the same key, `ignoreDuplicates:false` | `findVenue` → `venue_id`; truck by `normName` containment → `discovery_truck_id`; `visibility:'public'`, `show_on_vf/hg:true` | — |
| 2a | · Pass B (`hg_scraper:`) | POST | (route's) | 4 |
| 2b | · Apps Script (`Drive`/`Mobile Screenshot`) | POST | (route's) | 21 |
| 2c | · admin screenshot upload (`Admin Screenshot`) | POST | (route's) | 8 |
| 3 | `scripts/import-hatchesup-schedule.js` | direct upsert, same key | none | 0 (one-off) |
| 4 | `scripts/backfill-venue-id.ts` | `update venue_id` only (emit-only by default) | — | 0 |
| 5 | `scripts/migrate-from-sheets.cjs` | insert (May migration) | — | 0 |
| 6 | admin events editor (`app/api/admin/discovery-events/route.ts`) | `update` / `delete` by id | — | edits only |
| 7 | hand SQL | — | — | 3 (`Manual entry 2026-09`) |

**Correction to "four":** four *producers of new rows in normal operation* (1, 2a, 2b, 2c) is right; there
are also two one-off scripts, one backfill and one editor. The gate needs to cover 1 and 2; the scripts
should be pointed at it too but are not running.

## A2. The placement constraint — re-confirmed

`app/api/inbound-schedule/route.ts`: the discovery upsert is the **only** reference to `discovery_events` in
the file; the bridge is `for (const row of rows)` over the parsed request body. A gate that filters
`enrichedRows` before the upsert is safe; a gate that filters `rows` before the loop is not. **The new gate
must NOT go anywhere that shortens `rows`.** Cleanest: a library function the route calls in place of its
upsert, returning the rows it inserted or superseded — the bridge keeps reading `rows`.

## A3. Scraper → endpoint

**What exists already.** Pass B posts `{ secret: INBOUND_SCHEDULE_SECRET, events }` to
`${HATCHGRAB_API_URL}/api/inbound-schedule`; both values come from GitHub secrets in both workflows;
`assertInboundOk` (in `scripts/geo-validate.js`) throws on any non-2xx with a 401-specific message; the
throw is caught per truck and recorded as a `crash` row in `scraper_run_log`. Pass A does none of this — it
calls `assertInboundOk` nowhere.

**What Pass A would change.** Replace the `discovery_events` upsert loop with the same POST in chunks
(≤ 100 rows is the existing batch size), `assertInboundOk` on each, and push failures into
`dbWriteFailures` so `assertNoWriteFailures('Pass A database', …)` still exits 1 at the end. `truck_name`,
`venue_name`, `village`, times, `source`, `ai_notes` are already the fields the route accepts.

**Auth:** the shared secret; no user session. **Failure handling:** today the Sheet append is awaited
*before* the mirror, so a failed mirror never loses the Sheet row — keep that order. **If the endpoint is
down:** the Sheet still gets the rows; every chunk fails; the run exits red at the end (same as a DB
outage today). Difference: recovery needs the *app* up, not just the database, and the run cannot retry
itself.

**🔴 The reasons to hesitate.** (i) The route does **one upsert per request** and has **no `maxDuration`**
(`vercel.json` sets 60 s for the verify route only) — a 750-row day must be chunked or it will time out.
(ii) The route **500s the whole request** on any upsert error, and then **does not bridge** — a bad row from
Pass A could stop that batch's Pass-A rows and its bridging; today Pass A's errors are per-batch and never
touch bridging. (iii) The route stamps `show_on_vf/hg: true` and `visibility:'public'` on every row; Pass
A's rows currently arrive without those (and are public by column default) — same outcome, but worth
knowing the flags become explicit. **Net: worth doing, with chunking and per-chunk error isolation.**

## A4. Venue data

| | count |
|---|---|
| venues total | 819 |
| with coordinates | **728 (88.9%)** |
| with postcode | 599 (73.1%) |
| both | 569 |
| **neither** | **61 (7.4%)** |
| coords, no postcode | 159 |
| postcode, no coords | 30 |
| venues referenced by future events | 92 — **all 92 have coordinates**, 68 have a postcode |
| future events with `venue_id` | 364 of 690 |
| future events with `venue_id` **NULL** | **326 of 690 (47.2%)** |
| future events linked to a venue **without** coordinates | **0** |

A distance rule is fully usable on every linked future event. It is unusable on the 326 unlinked ones —
and only linking, not geocoding, fixes that.

## A5. The four linked trucks

| truck | discovery id | FK rows | name rows | union | FK-only | name-only | past / future | spellings | aliases |
|---|---|---|---|---|---|---|---|---|---|
| Pizzeria Gusto | `729fc2b2` | 73 | 87 | 87 | 0 | **14** | 84 / 3 | 1 | none |
| Real Thai Food | `5f42611d` | 13 | 17 | 17 | 0 | **4** | 15 / 2 | 1 | none |
| Tikka Tonic | `0259e042` | 3 | 9 | 9 | 0 | **6** | 9 / 0 | 1 | none |
| Test Kitchen | `a5f7273b` | 50 | 50 | 50 | 0 | 0 | 50 / 0 | 1 | none |

Name-containment (via the scraper's `normalizeName`) is a superset of the FK on all four. No other truck
name in the table contains any of these four, so name-based exclusion does not over-catch today. **A
delete that excluded by FK alone would take 24 rows belonging to linked trucks.** Your "both" rule
protects against either half breaking.

## B1. The rule, and what it would mark

**Rule as executed:** group future rows by `event_date` + `normalizeName(truck_name)` — the scraper's own
function, extracted from `run-scraper.js` and executed, not rewritten; for each pair, distance by haversine
between the two rows' *linked venues'* stored coordinates; **≤ 500 m → duplicate; newest `created_at`
wins**; start-time gap recorded, not used. Pairs where either row has no linked venue with coordinates are
counted separately as unjudgeable.

**181 candidate pairs → 104 judged → 6 duplicates, 98 distinct → 77 unjudgeable.**

| date | truck | loser (older) | winner (newest) | distance | sources | time gap |
|---|---|---|---|---|---|---|
| 2026-09-11 | Pig-Casso's | `FoodPark Biomedical` (07-07) | `Biomedical Campus Cambridge` (08-08) | **26 m** | URL / URL | 0 |
| 2026-10-09 | Pig-Casso's | `FoodPark Biomedical` | `Biomedical Campus Cambridge` | 26 m | URL / URL | 0 |
| 2026-11-13 | Pig-Casso's | `FoodPark Biomedical` | `Biomedical Campus Cambridge` | 26 m | URL / URL | 0 |
| 2026-09-17 | Elder Street Food | `Off The Beaten Truck - The Common` (05-22) | `The Common` (06-11) | **0 m** | URL / URL | 0 |
| 2026-09-18 | **Pizzeria Gusto** ✔ control | `Wickhambrook MSC` (09-07) | `MSC` (09-08) | **0 m** | URL Pass A / **Pass B** | unknown (no times) |
| 2026-09-20 | The Forge Kitchen | `Debenham Vets` (08-27) | `Debenham` (09-08) | **0 m** | URL / **Drive Screenshot** | 0 |

Distance distribution of the 104 judged pairs: **≤100 m: 6 · 100–500 m: 0 · 500–2000 m: 6 · >2 km: 92.**
The rule is separating clean populations — nothing sits between 26 m and 512 m.

**Negative controls (kept apart, correctly):** Pig-Casso's `foodPark` vs `Cambridge Science Park` 6.6 km;
Pizza Mondo `Off The Beaten Truck - Alconbury` vs `The Fox` 37.7 km; Pigs In 42.1 km; Howe & Co
`Hundon Village Hall` vs `The Street - By Post Office` 31.9 km (three dates).

⚠️ On "newest wins": in the Gusto pair the winner is the **Pass-B** row (`MSC`, `venue_id` set) over the
Pass-A row; in the Forge Kitchen pair the winner is the **screenshot** row. Both happen to be the better-
linked row, but that is luck, not the rule — see C2.

## B2. The 400–600 m band — 6 pairs, one cause

All six are **`foodPark` [Cambridge, CB2 0AA, 52.1751/0.1415] against `FoodPark Biomedical` / `Biomedical
Campus Cambridge` at 512 m**, on 11 Sep, 9 Oct and 13 Nov for Pig-Casso's. Two rows sharing postcode
CB2 0AA sit 512 m apart, which is more likely a bad coordinate on `foodPark` than two pitches. **The 500 m
line is doing exactly one job today, and it is probably the wrong call on that job.** Options, for you:
raise to 550 m; or correct `foodPark`'s coordinates and leave 500. I would not move the threshold to fit one
suspect row.

## B3. Unjudgeable — 77 pairs, 75 rows, and what I would do

- **75 distinct rows lack coordinates. All 75 have `venue_id` NULL; 0 link to a coordinate-less venue.**
- **If `findVenue` (the existing matcher) were run on those 75: 71 resolve to a venue with coordinates,
  35 at high confidence.** Reported, not applied.
- **Two known duplicates are hiding in here:** Nomadough 11 Sep, `foodPark at The Green & The Gardens…`
  (no `venue_id`, though venue `ea19437c` carries that exact name) vs `FoodPark Biomedical` (`f4c1c940`) —
  ~100 m apart when linked; and Pig-Casso's 11 Nov, `foodPark` [no `venue_id`] vs `FoodPark CB1`.
- **What I would do:** link first — run the matcher as the first step of both the gate and the one-off
  pass, then judge. What is still unresolvable after that is reported as *unresolved*, never as *distinct*,
  and never marked.

## What Part C will be — described, not built

**C1. The shared gate.** A library function — call it `admitDiscoveryEvent(row, { source })` — in `lib/`,
called by the scraper (after the Sheet append), by `/api/inbound-schedule` in place of its upsert (bridge
untouched), and by the two scripts if they are ever run again. Steps: (1) resolve `discovery_truck_id` by
the existing containment rule; (2) resolve the venue with `findVenue`; if none, **create** it on
`(name, village)` *only after* a postcode/coordinate check against the village's other venues — that is
where the 500 m distance and the postcode go, so `foodPark` can never be minted a fifth time within 500 m
of itself; (3) run the duplicate rule against same-date, same-truck rows; (4) upsert.

**C2. Superseded, not deleted.** `visibility`/`show_on_vf`/`show_on_hg` **can carry the *hiding*** — the
public feed filters events on `show_on_vf`/`show_on_hg` directly (`.eq(showCol, true)` on the
`discovery_events` query), and `hidden` is a legal `visibility` value with **zero rows using it today**. But
they **cannot carry the *why***: no column can hold which rule fired, the distance, the winner's id, the
sources or the time gap, and `hidden` is already reserved to mean "operator-suppressed". **A migration is
needed** — `superseded_by uuid references discovery_events(id)`, `superseded_reason text`,
`superseded_meta jsonb` (rule, metres, sources, time gap), `superseded_at timestamptz` — applied by hand,
with the feed additionally filtering `superseded_by is null`. Also decide "newest wins" vs "best-linked
wins": twice in B1 the newer row was the better one by chance.

**C3. The delete job.** A separate workflow file with its own cron and its own `if: failure()` step —
nothing inherited from the scraper. Exclusion: `discovery_truck_id IN (four ids)` **OR** `normalizeName
(truck_name)` matches one of the four names — both evaluated, a row excluded if *either* fires. **Floor:**
compute the candidate count, compare against the last 14 days' *daily* creation rate (**mean 17.8, max
44**); refuse and exit non-zero above a ceiling. ⚠️ **The first run must be explicit:** there are **230**
past-dated rows today, far above any daily figure, so the job needs a one-off `ALLOW_BACKLOG=230`-style
override or a hand-run SQL for the first pass, then the floor governs.

**C4. `discovery_run_log`.** 232 rows in 2 days, 116 per run, no retention anywhere (grep exit 1 on any
delete against it). Yes, prune it in the same job — but as a **separate step with its own count and its own
floor** (rows older than N days), so a broken exclusion on events cannot be masked by a successful log prune
in the same green run.

---

# HOW I CHECKED

**Executed:** the dry run over the pulled snapshot with the scraper's own `normalizeName`; `findVenue` from
`lib/venue-matcher.ts` over the 75 unlinked rows (resolvability only — nothing written); every count above,
asserted against `content-range`.

**Structural (read, not run):** the writer census (`grep -rn -A3 "from('discovery_events')"` over `app`,
`lib`, `scripts`, `supabase`, no extension filter); the bridge loop's iteration source; `assertInboundOk`
and the workflow secrets; `vercel.json`; the visibility migrations and the feed's filter; the absence of
any `discovery_run_log` retention.

**Reasoned:** that `foodPark`'s 512 m is a bad coordinate rather than a second pitch; that resolve-then-
judge is the right order for the one-off pass.

**Search method:** no extension scoping. Each grep's exit status was printed: **1** = ran and found nothing
(the run-log retention and admin-filter searches), **0** = found; no grep errored.
