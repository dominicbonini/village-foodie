# Hatches Up as a Discovery Data Source — Investigation

**7 September 2026 · report and recommendation · nothing built, nothing written, nothing committed**

**Marking.** 🔎 source-read · 🧪 executed. Every call was a `select`, a public `GET`, or a read-only GraphQL `query`. **No table was written. The scraper was not run.**

⚠️ **Premise flagged:** the prompt states 24 modified / 78 untracked. 🧪 The tree is **26 modified / 84 untracked** — all of it my own earlier work in this workstream (`lib/venue-matcher.ts`, `components/dashboard/types.ts`, `scripts/geo-validate.js`, five reports, and `docs/sql/`). No unknown change.

---

## 🔴 THE ANSWER TO PART D, FIRST — IT DOES NOT DEPEND ON ANYTHING ELSE

**Our scraper is failing. Pimp My Fish is not idle.**

🧪 Hatches Up lists **9 upcoming Pimp My Fish events**, 8–12 September, every one `available: true`:

| Date | Window | Location |
|---|---|---|
| 08 Sep | 16:45–19:45 | Mandeville Hall Burwell |
| 09 Sep | 16:45–19:45 | Great Shelford Memorial Hall |
| 09 Sep | 17:00–19:45 | Great Abington Post Office |
| 10 Sep | 16:45–19:45 | Great Bradley village hall |
| 10 Sep | 17:15–20:15 | Affleck Arms, Dalham |
| 11 Sep | 11:45–13:45 | FoodPark CB1 |
| 11 Sep | 16:45–19:45 | King Bill IV Pub, Histon |
| 11 Sep | 16:45–19:45 | Fordham British Legion |
| 12 Sep | 16:45–19:45 | Wylde Skye |

🧪 Our database: `Pimp My Fish` — **177 all-time events, 0 future**, latest 5 September, nothing created since 1 September.

🔴 **And the probable cause is visible in our own data.** Every one of our PMF events carries:

```
source = "URL: https://order.pimp-my-fish.co.uk/basket/new | Strategy:"
```

Two things are wrong there. **The URL is the ordering basket, not a schedule page** — a checkout page has no forward schedule to read. And **`Strategy:` is empty**, so the Sheet's strategy cell for this truck is blank and the scraper fell through to its default. ⚠️ I cannot confirm the Sheet's contents (I cannot read it), but the `source` string is written from `site.url` and `site.strategy` at scrape time, so it reflects what the Trucks tab held.

**The fix for Pimp My Fish is a Sheet edit, not a code change** — point it at a schedule URL. That is independent of everything below.

---

# PRIOR WORK — FOUND, AND SUBSTANTIAL

🧪 I had looked at Hatches Up before. The record is spread across eight files, none of which the scraper reports referenced:

| File | What it holds |
|---|---|
| `docs/hatchesup-events.csv` | 🎯 **326 events captured 3 Sept, WITH `lat`/`lng`** — columns `date, truck, window, location, lat, lng, flags, window_open, available_now, order_host, order_link` |
| `docs/trucklist.txt` | 81 map trader names |
| `docs/hatchesup-online-ordering.csv` | 92 trucks with `online_ordering` status (19 `uses`, 68 `listed_only`, 5 `unknown`) |
| `docs/hu-reconciliation-report.md` | HU ↔ `discovery_trucks` reconciliation (176 rows, 58 `*.hatchesup.app` order URLs) |
| `docs/hu-columns-report.md` / `-build-report.md` | The `hu_map` / `hu_ordering` columns on `outreach_prospects` — **proposed, then applied** |
| `supabase/migrations/20260903_hu_presence_flags.sql` | that migration |
| `scripts/seed-hatchesup-trucks.js`, `scripts/import-hatchesup-schedule.js` | June 2026 Puppeteer importers |
| `data/hatchesup-trucks.json` | 36 truck entries, all `processed: true`, unchanged since 9 June |

🔴 **What that prior work did *not* establish, and this report does:** the access method (it was a Cursor-driven browser capture, not a documented API), and **whether the coordinates are any good.** Nobody had measured them.

---

# PART A — WHAT IS ACTUALLY THERE

## A1. It is a public, unauthenticated GraphQL API

🧪 The page at `/find-food/?view=map&when=7days` is a **Next.js shell** (23 KB, `/_next/static/chunks/…`) with **no embedded data** — the RSC payload contains no coordinates, so HTML scraping would return nothing. The data is client-fetched.

🧪 Found in the JS bundle:

```
https://api.prod.hatchesup.app/graphql?version=2026-03-02
```
POST, `mode: cors`, **no Authorization header of any kind**. 🧪 Confirmed live: it answers an arbitrary query from curl with no credentials.

🧪 The exact operation the site sends, recovered verbatim from the Relay artifact:

```graphql
query loadGqlBoundedQuery($first: Int!, $after: String, $bounds: BoundingBoxInput, $sort: PlatformCollectionsSortInput) {
  publicCollections(first: $first, after: $after, bounds: $bounds, sort: $sort) {
    edges { cursor node {
      __typename id link windowOpen available date
      trader { name id setup tileImage { url(width: 500) } roundLogoImage { url(width: 100) } }
      ... on ServiceAtLocation { location { id roughPosition title } }
      flags collectionWindowStart collectionWindowEnd collectionWindowEndAt
    } }
    pageInfo { hasNextPage endCursor }
  } }
```

🧪 `BoundingBoxInput` is `{ sw: {lat, lon}, ne: {lat, lon} }` — discovered from the API's own validation errors, which name the expected fields.

**What it exposes, per collection:**

| Field | Value |
|---|---|
| `date` | ISO date |
| `collectionWindowStart` / `End` | `"16:45"` / `"19:45"` |
| `trader { name, id, setup }` | truck identity + logo/tile image URLs |
| `location { id, title, roughPosition }` | 🎯 venue name + `[lat, lon]` |
| `flags` | `["HIDE_PRICES","COLLECTION","SLOTTED"]` |
| `available`, `windowOpen` | live ordering state |
| `link` | signed basket URL |
| 🔴 **postcode** | **NOT EXPOSED** — see B3 |

🧪 **One request with `first: 1000` and a UK-wide bounding box returned the entire forward set: 306 collections, 71 traders, 119 distinct locations, 7–14 September, `hasNextPage: false`.**

**Stability:** ⚠️ Mixed. 🟢 It is a versioned, cursor-paginated, server-side API — far more stable than HTML scraping, and it is the same call the public site makes. 🔴 But `?version=2026-03-02` is pinned in *their* bundle, introspection is **disabled**, and Relay persisted-query ids mean they could stop accepting raw query text at any time. **Nothing is contractual.** It would need a canary: if the query errors, fail loudly rather than record zero.

## A2. Coverage against our trucks

🧪 Live, matched on normalised name **and our `aliases` column**:

| | |
|---|---|
| HU traders with forward collections | **71** |
| Already in our `discovery_trucks` | **68** |
| 🔴 New to us | **3** — *Bangkok Box*, *Dirty Chicks Hummus*, *Safari Shack* |
| Our trucks with any future event | 44 |
| Of those, also on HU | 11 |
| 🎯 **HU traders we already hold but have NO future events for** | **57** |

🔴 **The value is not new trucks — it is 57 trucks we already know about whose forward schedule we are not getting.** Pimp My Fish is one of them, alongside *Kerbside Kitchen*, *Al Chile*, *Spudalicious*, *Tacoman*, *Charlie's Chippy*, *Broadside Pizza* and fifty more.

## A3. 🔴 Terms, robots.txt, rate limiting

- 🧪 **`robots.txt`: `User-agent: * / Allow: /`** — no `Disallow`, plus a sitemap. Fully permissive.
- 🔴 **There is NO terms-of-use page.** `/terms`, `/terms-and-conditions`, `/terms-of-use`, `/legal` all redirect to a **404**. 🧪 The footer offers exactly one legal link — **Privacy** — and a copyright line: *"© Copyright 2026. All rights reserved."*
- 🧪 **No rate limiting observed** in ~10 requests. No `Retry-After`, no 429. **Absence of an observed limit is not absence of one** — I did not probe for a limit and should not.

**My honest position:** nothing *prohibits* automated reading — the endpoint is named `publicCollections`, is unauthenticated, and serves the public site under a permissive robots.txt. But **"no terms" is not the same as "permission"**, and the footer asserts copyright over the content. 🔴 **This is a commercial decision, not a technical one, and it is yours.** The lowest-risk path is an email to `support@hatchesup.co.uk` (01223 608083) asking for permission or a feed — they are a Cambridge company operating in your area, and a listing site usually *wants* referral traffic. **I am not recommending covert scraping of a competitor-adjacent commercial API.**

---

# PART B — 🔴 ARE ITS COORDINATES BETTER THAN OURS? YES, DECISIVELY

I did not assume this. I measured it exactly as I measured ours.

## B1. Error distribution — reverse-geocoded against postcodes.io

🧪 All **119** distinct locations, bulk reverse-geocoded (nearest real postcode within 2 km):

| | Hatches Up | **Ours** (previous measurement) |
|---|---|---|
| p50 | **42 m** | 760 m |
| p75 | **65 m** | 2 220 m |
| p90 | **106 m** | 7 080 m |
| p95 | **117 m** | 10 980 m |
| **max** | **127 m** | **76 800 m** |
| > 250 m | **0** | — |
| No postcode within 2 km (offshore/implausible) | **0** | — |

🔴 **Their worst coordinate is 127 metres out. Our p90 is 7 kilometres.** That is roughly two orders of magnitude, and it is not a fluke of sampling: it is every location they publish.

🧪 **Corroborating signal — precision profile:** median **14 decimal places**, min 4, max 15. That is float noise from a real geocoding system. Ours carried `52.1234` — four digits copied from a prompt's format example. **Different provenance, visible in the digits.**

🧪 **Semantic check:** the location title shares a word with the postcode's parish/ward/district in **76** cases, no overlap in **41**. ⚠️ The no-overlap cases are **not errors** — they are city-centre venues whose name is not a ward name (*Grainger Market* → Newcastle, *Old Spitalfields Market* → Tower Hamlets, *Station Square* → Cambridge). I checked before reporting them as failures.

## B2. The geo-validate gauntlet

🧪 All 119 through the same validator built for our own geocoder:

| Check | Result |
|---|---|
| **PASS** | 🎯 **119 / 119** |
| Placeholder decimals (`…1234`, `…5678`) | **0** |
| Sentinel coordinate (GB centroid etc.) | **0** |
| Outside the UK bounding box | **0** |
| Null island / non-finite | **0** |
| Coordinate pairs shared by > 1 location | **0** |

For comparison, ours: **27 placeholders, 13 GB centroids** out of 573.

## B2b. Head-to-head where both name the same place

🧪 20 locations matched an existing venue of ours by exact normalised name:

| Disagreement | |
|---|---|
| p50 | **90 m** |
| p90 | 720 m |
| max | **12.5 km** |
| > 1 km apart | 2 |

🔴 **The 12.5 km outlier is `"The bull"` — ours is in Lower Green, theirs is a different Bull.** That is our ambiguous-name problem, not their error. 🎯 Where both are unambiguous they agree to **90 metres**, which is independent confirmation that our *good* coordinates are good and theirs are too.

## B3. 🔴 It does NOT expose postcodes — and that changes the recommendation

⚠️ **I nearly reported the opposite.** `postcode` appears 15 times in their JS bundle, and my first read was "the API exposes postcodes". It does not: those are the **postcode search box** (`/find-food/s/{POSTCODE}/10/`), a user input. 🧪 The payload's only positional field is **`roughPosition`** — named "rough" by its own authors.

🎯 **But this does not matter, and the reason is the finding:** because their coordinates land within ~50 m of a real postcode, **a reverse geocode against postcodes.io turns their coordinate into an authoritative postcode.** That is strictly better than either source alone — their positional accuracy plus the ONS gazetteer's authority — and it is exactly the pattern the geocoder work already established: *never store a coordinate somebody guessed; store one a gazetteer confirms.*

---

# PART C — HOW IT WOULD FIT

## C1. Bypass the join, or feed venue creation?

🔴 **Feed venue creation. Do not bypass.**

| | Bypass — put coordinates straight on `discovery_events` | **Feed `venues`** |
|---|---|---|
| Change needed | New columns on `discovery_events`; the map route reads them *instead of* the join | None to the schema |
| Cost | 🔴 **Two coordinate paths = two ways to be wrong**, and a HU event and a scraped event at the same pub would render as two pins in slightly different places |
| Cost | 🔴 The venue matcher, the dedup rules and the approval flow all key on `venue_id`; an event with coordinates but no `venue_id` is invisible to every one of them | Everything downstream keeps working unchanged |
| Benefit | Faster to ship | 🎯 One coordinate path; HU's accuracy *improves the venues everyone else uses* |

**The decisive argument is the one already paid for:** the entire map depends on `venue_id → venues`, and the last week has been spent making that one path trustworthy. Adding a second path re-opens exactly the class of problem just closed.

🎯 **Recommended shape:** HU location → reverse-geocode to a postcode → `resolveCoordinates` → `venues` row (postcodes.io coordinate, HU's title as the name, the embedded town as the village) → then the ordinary `findVenue` link. **HU becomes a high-quality venue *seeder*, and the map path stays single.**

## C2. Matching, duplicates, and the Sheet

🧪 Running HU's 119 locations through the fixed `findVenue` (splitting the title on a comma to recover the town, which 🧪 **53 of 119 titles carry**):

| | |
|---|---|
| Match an existing venue at **high** | 19 |
| Match at **low** — ambiguous, would need review | **37** |
| 🔴 No match → **would create a new venue** | **63** |

🔴 **So a naive import creates 63 venues, and 37 more links are guesses.** Many of the 63 are genuinely new because they are **outside East Anglia** — *Grainger Market* (Newcastle), *Westfield Stratford*, *Camden Stables Market*, *Darley Street Market* (Bradford), *MK1 Shopping Park*. HU is a national platform; our discovery map is regional. **An unfiltered import would drag the map nationwide.**

🧪 **Truck duplicates: low risk.** `discovery_trucks` holds 231 rows with **0 normalised-name collisions today**, and 68 of the 71 HU traders already match by name or alias. Only 3 would be new rows.

🔴 **What would have to change in the Sheet.** The manual records the Sheet as the source of truth for the site list, matching data, exclusions and dedup. A HU feed writing directly to the database would **bypass all four**, creating the split-brain the venue outage already demonstrated — the Sheet filling while the database does not, or now the reverse. So either:
- HU rows are appended to the **Trucks / Venues tabs** like any other discovery (keeps one source of truth, needs a writer), **or**
- HU is treated as a **separate, clearly-labelled source** with its own `source` prefix — and the manual is updated to say the Sheet is no longer the sole source. **That is a documentation decision as much as a code one.**

## C3. Replacement, supplement, or fallback?

🎯 **SUPPLEMENT — specifically, a venue-and-schedule supplement for trucks our own scraper cannot read.** Not a replacement, not a pure fallback.

**Why not a replacement:** 🧪 HU covers **71 traders over 8 days**; we hold **231 discovery trucks** and 669 forward events. It is a subset — only the trucks that use their ordering platform. Replacing our scraper would lose most of the map.

**Why not merely a fallback:** a fallback runs only when the primary fails, and 🔴 **our primary fails silently** — that is the whole finding of the audit. We would never know to invoke it. 🧪 Pimp My Fish is the proof: 0 future events for six days and nothing in `scraper_run_log`, because the discovery pass writes no run log at all.

**Why supplement:** 🎯 it contributes three things our pipeline is measurably bad at —
1. **Coordinates two orders of magnitude better**, which feed `venues` and fix the map's real bottleneck.
2. **Forward schedules for 57 trucks we already track but currently show nothing for.**
3. **An independent check on our own scraper** — a truck with HU events and no events of ours is a scraper failure, detectable automatically. That is the missing detector the audit called for.

⚠️ **Conditioned on Part A3.** If you would rather not read their API without asking, use it as (3) alone — a manual health check — which needs no import and no schema change.

---

# THE TREE

🧪 `HEAD = 08ac368` = `origin/main`. **0 staged · 0 committed · nothing pushed · nothing deployed.** `git add -A` / `git add .` not run. **No file in the repository was created or edited in this task** except this report. Tree: **26 modified / 84 untracked**, unchanged otherwise. **No table was written; every database call was a `select`.** All Hatches Up and postcodes.io calls were `GET` or read-only `query`; working files went to `/tmp`.

---

# WHAT I COULD NOT READ OR VERIFY

- 🔴 **The Google Sheet.** I infer Pimp My Fish's Trucks-tab row from the `source` string our own scraper wrote (`basket/new`, empty strategy). **I have not seen the cell.** That inference is the basis of the "Sheet edit, not code change" recommendation and should be checked before acting.
- 🔴 **Whether reading their API is acceptable to Hatches Up.** No terms exist to consult. This is a commercial judgement I cannot make for you.
- 🔴 **Their rate limits.** ~10 requests drew no throttling; I deliberately did not probe for a limit.
- 🔴 **Whether `roughPosition` is a venue pin or a deliberately fuzzed point.** The name says "rough", yet it lands within 127 m of a real postcode. **The name and the measurement disagree, and I cannot resolve which their intent is** — they may fuzz to a street rather than a door. At ~50 m that is irrelevant for a map pin, but it is unverified.
- ⚠️ **Longevity of raw-query access.** Introspection is disabled and Relay persisted ids are in use; they could reject ad-hoc queries at any time without notice.
- ⚠️ **Coverage beyond 14 September.** The bounded query returned 8 days; whether a wider window is available was not tested.
- ⚠️ **Whether the 3 "new" traders are genuinely new** or near-spellings of trucks we hold — matched on normalised name and aliases only, not reviewed by eye.
- ⚠️ **The 41 no-semantic-overlap locations** were spot-checked, not individually verified.
