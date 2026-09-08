# Migration steps 1–3 — the three data backfills, prepared for hand review

**Date:** 9 September 2026 · **Mode:** READ AND PROPOSE. No database row inserted, updated or deleted. No migration applied. No Sheet or Apps Script cell touched. Nothing staged, committed, pushed; `git add` not run. Every database call was a `select` or a `head:true` count; every Sheet call used the `spreadsheets.readonly` scope; the only outbound writes were **GET/POST to postcodes.io**, which stores nothing.

**Tags:** 🔎 SOURCE-READ (file:line) · 🧪 EXECUTED (output quoted) · ⚠️ inference, labelled · 🔴 danger.

**Extensions searched:** none scoped. Repo reads were by explicit path (`scripts/run-scraper.js` — **JavaScript** — `docs/apps-script/village-foodie-v6.57.js`, `supabase/migrations/*.sql`, `docs/venue-consolidation-report.md`); sweeps used `grep -rn -I` with only `node_modules/.next/.git` excluded. **Every search's exit code was read** — a failed `grep` exits 2 and prints nothing, a true negative exits 1 and prints nothing; the one negative I rely on (§2, the merge-loser names) is backed by a *positive* control instead, described there.

---

## 0. Row counts and working tree — START and END

| | START 20:00:46Z | END 20:08:47Z |
|---|---|---|
| `discovery_events` | 4,300 | 4,300 |
| `discovery_trucks` | 231 | 231 |
| `venues` | **559** | **559** |
| `excluded_terms` | **0** | **0** |
| `scraper_run_log` | **418** | 418 |
| `trucks` | 9 | 9 |
| `truck_events` | 137 | 137 |
| `discovery_exclusion_terms` | **404 — does not exist** | **404 — still does not exist** |

🧪 PostgREST `Prefer: count=exact` with the service-role key (RLS bypassed). *If this proved nothing:* an RLS-limited role would under-count identically at both ends; the service role bypasses RLS, and these same calls have tracked real movement all week.

⚠️ **`scraper_run_log` was 415 at the end of the last session and is 418 now.** Not mine — the hourly `hatchgrab_scrape.yml` cron ran in between and wrote three rows (one per operator truck). Recorded so the delta is not read as this session's.

**`git status --short` START** — 5 `M`, 6 `??`, `HEAD` = `origin/main` = `6fe8634`, nothing staged.
**END** — identical, plus four new untracked paths, nothing modified that was not already:
```
?? docs/sql/migration-step-1-20260909/
?? docs/sql/migration-step-2-20260909/
?? docs/sql/migration-step-3-20260909/
?? supabase/migrations/20260909_discovery_exclusion_terms.sql
```
**No tracked file changed.** `HEAD` unchanged. Nothing staged.

---

## 🔴 THE HEADLINE: STEP 1 IS NOT A BACKFILL. THERE IS NOTHING MISSING.

**The premise given was:** *"81 of 109 site-list entries have a `schedule_url` in the Sheet's Trucks tab and null in `discovery_trucks`."*

🧪 **Measured live, both sides:**

| | count |
|---|---|
| Sheet `Trucks!I` (**Schedule URL**) non-empty | **26** |
| `discovery_trucks.schedule_url` non-null | **26** |
| of those 26, DB value **byte-identical** to the Sheet's | **26 — all of them** |
| DB value **differs** from the Sheet's | **0** |

🔴 **`discovery_trucks.schedule_url` is already 100% complete with respect to the Sheet's Schedule URL column. Not one value is missing.**

**Where "81" came from, and why it is not a data gap.** 🔎 The site list is built at `run-scraper.js:483` as `const targetUrl = row[8] || row[6] || 'about:blank'` — **Schedule URL (col I) ELSE Website (col G).** For 80 of the 81, `row[8]` is *empty* and the URL the scraper uses is `row[6]`, the **website**. Comparing that composite against `schedule_url` alone produces the 81. 🧪 **All 80 of those website values are already in `discovery_trucks.website` — 80 identical, 0 null, 0 different.**

🧪 **The definitive test.** For every URL-bearing site row, compare the Sheet's `row[8] || row[6]` against the database's `coalesce(schedule_url, website)`:

```
IDENTICAL: 106      MISMATCH: 0      unmatched: 0      multi-match: 1 (La Piazza)
```

**The database can already reproduce the entire site list.** The gap is a **code rule** — the DB query must be `coalesce(schedule_url, website)`, mirroring `row[8] || row[6]` — and that belongs to `SITES_FROM=db` (retirement plan step 5), not to a data backfill.

🔴 **And performing the backfill as specified would be actively harmful**, which is why I am proposing zero rows rather than proposing them with a caveat:

1. **It duplicates 80 values across two columns** with no shared source of truth. They drift, and nothing checks them — the exact failure class the app manual's standing rule exists for.
2. 🔴 **It destroys the Sheet's own preference.** `row[8]` is preferred over `row[6]` *because a schedule page is better than a homepage*. Collapse both into `schedule_url` and you can no longer distinguish **"this truck has a real schedule page" (26)** from **"this truck has only a homepage" (80)**. That distinction is currently recoverable and would become unrecoverable.
3. **It makes the column name false** for 80 of 106 rows.

*What this evidence would look like if it were proving nothing:* a name-matcher loose enough to match everything produces a high match rate whether or not it is right. **Ruled out three ways:** the matcher is the scraper's own `normalizeName`, copied verbatim from `:55-64`, not a lookalike; it produced **0 unmatched and exactly 1 multi-match**, so it is neither over- nor under-matching; and the comparison is **string equality on the URL**, not on the name — a wrong name-match would have produced a URL *mismatch*, and there were none in 106.

### The one ambiguous row — reported, nothing proposed

🧪 Sheet row 47 **"La Piazza"** normalises to `lapiazza`, and **two** `discovery_trucks` rows share that key: `fa09b6c8… "La Piazza"` (website set, correct) and `5a9bbae8… "La Piazza Street Food"` (website null). 🔎 `normalizeName` strips `street` and `food` (`:58`), so the two names collapse — documented behaviour (manual §4.1), not a data error. **The Sheet cannot say which row it means, so nothing is proposed.** If they are one truck the fix is a *merge*, not a backfill. `docs/sql/migration-step-1-20260909/01-la-piazza.sql` has the inspection query.

⚠️ **Two site rows are instructions-only** (`Louigi's Pizza`, `MumTas` — over 10 characters of `ai_instructions`, no URL). Nothing to backfill; they are sites without a page.

⚠️ **One genuine defect found, out of scope for a DB migration:** Sheet row 86 **`Shika Shack`** has `shikashack.co.uk` with **no `http://` scheme**. 🔎 It is passed to `page.goto(site.url, …)` at `:649`, which requires a scheme. **That is a Sheet cell to fix, not a database row** — and it means one site has probably never loaded.

### Step 1 deliverables

`docs/sql/migration-step-1-20260909/` — **verification only, no writes:**
- `00-NO-BACKFILL-REQUIRED.sql` — the proof query and the full reasoning above.
- `01-la-piazza.sql` — the inspection query for the ambiguous row.

**Rollback: not applicable. Nothing is changed, so there is nothing to reverse.**

---

## STEP 2 — 143 exclusion terms into a new table

### What exists today

🔎 `supabase/migrations/20260604_exclusion_terms.sql:3-9` — `excluded_terms` is `truck_id text NOT NULL references trucks(id) on delete cascade`, `unique (truck_id, term)`; confirmed against the live PostgREST schema (`truck_id` in `required`). 🔎 `run-scraper.js:792-794` sends `{ term }` with `onConflict: 'term'` → **42P10** (no such constraint) **and 23502** (null in NOT NULL). 🧪 **The table holds 0 rows against 143 terms in the Sheet**, and has since 4 June 2026. The failures land in `dbWriteFailures` (`:795`), a GitHub Actions log nobody reads.

**Why a separate table rather than sharing** — the two features differ in three of four properties:

| | operator feature (`app/api/manage/route.ts:2158-2182`) | scraper feature |
|---|---|---|
| means | "**this truck** does not want this term" | "this string **is not a food truck at all**" |
| keyed by | `truck_id` (NOT NULL, FK) | nothing — global |
| normaliser | 🔎 `lib/schedule-extract.ts:13` — keeps spaces | 🔎 `run-scraper.js:55-64` — strips stop-words **and** spaces |
| match | substring | 1-edit Levenshtein |

### The numbered proposal

🧪 **143 non-empty rows on the Exclusions tab → 143 distinct `term_key`.** No two spellings collapse to one key; **0 terms normalise to empty** (so none is silently dropped by the scraper's own `:453` filter).

**1. Create the table** — `supabase/migrations/20260909_discovery_exclusion_terms.sql`, **written, NOT applied.** Columns exactly as the retirement plan §3.4 proposed: `id`, `term`, `term_key` (**UNIQUE** — the value the scraper compares), `source`, `hits_truck`, `created_by`, `created_at`; RLS on, one service-role policy, `anon`/`authenticated`/`public` revoked.

⚠️ **One deliberate deviation from the plan:** the plan wrote `term_key text not null unique` and also implied `term` might be unique. **Only `term_key` is unique.** 🧪 `'AXLE + HOP'` and `'Axle and Hop'` are different `term` values with the *same* key — storing both would apply the same rule twice. The unique key must be the thing the code compares.

**2. Import all 143** — `docs/sql/migration-step-2-20260909/02-import.sql`, `on conflict (term_key) do nothing`.

**3. 🔴 Flag the poisoned terms rather than dropping or silently keeping them.** 🧪 **Re-derived independently; my list matches the one given exactly — 5 terms, 5 trucks:**

| term (as written in the Sheet) | `term_key` | truck it silences |
|---|---|---|
| `AXLE + HOP` | `axlehop` | **Axle & Hop** |
| `Off The Beaten Truck` | `offbeatentruck` | **Off The Beaten Truck** |
| `Dessert MK` | `dessertmk` | **Dessert MK** |
| `JUST BAKED BY SOPHIE` | `justbakedbysophie` | **Just Baked by Sophie** |
| `The Linton Kitchen` | `lintonkitchen` | **The Linton Kitchen** |

**Which matcher I used, and why: the SCRAPER's 1-edit Levenshtein** (`run-scraper.js:66-92`). `hits_truck` describes *what the scraper will do with this term* once `EXCLUSIONS_FROM=db` — so it must be computed with the matcher the scraper applies at `:860`. Using the Apps Script's rule would over-flag against a matcher the scraper never runs.

⚠️ **Both counts, as asked.** §16.3 recorded "5 vs 7"; those were **distinct trucks**. Measured on both axes:

| | terms that hit | distinct trucks hit |
|---|---|---|
| scraper — Levenshtein | **5** | **5** |
| Apps Script — containment | **9** | **7** |

The extra two trucks are **`Azahar`** (term `Azahar Spanish Food`) and **`Wintringham`** (terms `WINTRINGHAM COMMUNITY DAY`, `We Are Wintringham`); the ninth term is `OFF THE BEATEN TRUCK SUMMER PARTY`. **§16.3's "5 vs 7" was right about trucks and silent about terms; both are now recorded.** The four containment-only terms are listed in `04-containment-extra.sql` — 🔴 **they are the terms whose Apps Script retro-delete (`v6.57:245`) would erase a real truck's future events from the Sheet even though the scraper itself would not silence it.**

*If this derivation proved nothing:* a matcher loose enough to flag everything would flag far more than 5 of 143. **Ruled out:** both matchers were copied verbatim from their source files and executed on the same 143 × 152 product; they returned **different** answers (5 vs 9), which a broken-in-the-same-way pair could not do. And the Levenshtein list reproduces the five names given to me independently.

### What Step 2 does NOT do

🔴 **Nothing reads `discovery_exclusion_terms`.** 🔎 `run-scraper.js:453` still builds `excludedTerms` from the Sheet's Exclusions tab, and `:860` still applies that set. **Behaviour is completely unchanged.** This closes a data gap; the read switch is `EXCLUSIONS_FROM=db`, a later step. It also does not repoint the scraper's *write* at `:792` (still failing), and it does not touch `excluded_terms`, whose 0 rows and operator feature are left exactly as they are.

### Rollback

`05-rollback.sql` — `delete from discovery_exclusion_terms where created_by = 'migration-step-2'`, or `drop table` to reverse the migration entirely. **Total and safe, because nothing reads it.**

---

## STEP 3 — the Sheet-only venues

### How 348 became 256 proposed, 36 held, 56 refused

🧪 **348** distinct `(name, village)` pairs exist in the Sheet's Venues tab and not in `venues` (a figure that reproduces the manual's). 🧪 **All 348 are also new on the RAW unique key** — `0` would collide with an existing `(name, village)`, so no proposal can violate the index.

| gate | out | left |
|---|---|---|
| Sheet-only, distinct | — | **348** |
| 🔴 **REFUSED — no village** (blank or `TBC`) | **38** | 310 |
| 🔴 **HELD — near-duplicate of an existing venue** | **36** | **274** |
| ⚠️ *(of which recovered as genuinely different places)* | *(−18 re-admitted)* | — |
| **PROPOSED** | | **256** |

**Refusal 1 — no village: 38 rows.** ⚠️ The unique key is `(name, village)` and **nulls are DISTINCT in a unique index** (manual §5.3, proven there with two identical upserts producing two rows). A row with no village **can never conflict and would duplicate for ever**. Refused, listed in full in the report's appendix file. They include `Tharp Arms`, `Mariners Compass`, `Essex Foodies Market`, `Trumpington Meadows`, `Wintringham Plaza` — several of which are *also* merge-set names, so they are caught twice.

**Refusal 2 — near-duplicates, and the merge-loser check.** ⚠️ 15 CERTAIN merges were applied on 8 September and **16 loser rows deleted**; the Sheet was never pruned, so those losers are still in it and an unfiltered import would **recreate them and silently undo the merge.**

🔴 **I got this check wrong twice before it was right, and both mistakes are worth recording:**

1. **First attempt — village-aware name match.** It missed the two Trumpington Meadows losers, because the loser's village text (`Trumpington Meadows`, `Trumpington`) differs from the keeper's (`Cambridge`).
2. **Second attempt — village-blind name match.** It caught them, but flagged **`The Street` [Capel St. Mary]** against `Trumpington Meadows`. 🔎 **`normalizeName("The Street")` returns the empty string** — the normaliser strips both `the` and `street` (manual §4.1 records exactly this) — and `"anything".includes("")` is `true`, so an empty key matches **every** venue. It also flagged `The Rose & Crown [Stansted Mountfitchet]`, a different pub 40 km from the Histon one.
3. **Final — fixed both:** a minimum key length so an empty or 1–3 character key can never containment-match, and **distance** rather than village text as the decider (≤ 5 km from the existing row = same place).

🧪 **Result: 36 held.** The four CERTAIN losers that have coordinates are caught at tight distances — **Hoveton Village Hall [Wroxham] 1.15 km**, **The Rose and Crown [Impington] 0.27 km**, **Trumpington Meadows, Kestrel Rise 0.50 km**, **Trumpington Meadows Food Vans 0.50 km** — plus `Market Square [Huntington]` (loser `c378327e`) held in the no-coordinate group. **That is the positive control for this check**: it independently rediscovered rows I knew from the consolidation report to be deleted losers, so its silence elsewhere is informative rather than merely empty. **This is why I did not rely on a "no match found" negative** — the loser names are not all recoverable from the deleted rows, so a bare negative would have proved nothing.

⚠️ **The other 31 held rows are mostly *probably* different pubs sharing a name** — `The Boot [Dullinghan]` vs `The Boot [Dullingham]`, `The Cross Keys [Henley]` vs `[Hatfield Peverel]`. They are held because **neither side has a coordinate**, so they cannot be separated — not because they are known duplicates. `04-held-for-review.sql` says so per row. **Deciding them needs a postcode, and that is your call, not mine.**

🧪 **27 name-matches were re-admitted** because the distance says a different place: `The Bull [Burrough Green]` is **28.2 km** from `The Bull Pub [Saffron Walden]`; `The King's Head [Pebmarsh]` is **25.2 km** from the Fen Ditton one. **A name-only rule would have wrongly refused all 27** — which is the manual's standing warning (*"The Bull exists in Bottisham and Langley"*) applied in the opposite direction.

### 🔴 Coordinates: postcodes.io only, and the measurement that justifies it

🔎 The Apps Script geocodes with `https://maps.googleapis.com/maps/api/geocode/json?address=<name>, <village>, UK` at **four** sites (`v6.57:368-374`, `:694-700`, `:1406-1410`, `:780-793`) and writes the **first result** into the Sheet — no postcode check, no gauntlet, no sentinel test, no `partial_match` test.

🧪 **Measured: the Sheet's coordinate against postcodes.io, on the 177 rows where both exist:**

| | |
|---|---|
| **> 1 km apart** | **141 of 177 — 80%** |
| > 5 km apart | **78** |
| > 20 km apart | **6** |
| **median disagreement** | **4.13 km** |
| worst | `Salen` 29.4 km · `Meet Mike` 29.3 km · `Frog's Farm` 27.0 km · `foodPark Biomedical Campus` 24.5 km |

⚠️ **A large distance means the two sources disagree, not automatically that the Sheet is wrong** — guard three's `Thirsty [Cambridge]` case (manual §13.3) is precisely one where the *postcode* was the wrong half. **But a 4 km median across 177 rows is the signature of village-centroid resolution**, which is exactly what `"<name>, <village>, UK"` returns when Google cannot find the name. **Using postcodes.io is the right default and the instruction is followed; the Sheet coordinate is imported for nothing.**

**The three buckets:**

| bucket | rule | count |
|---|---|---|
| **A** | postcode present **and resolved by postcodes.io** → import **with the postcodes.io coordinate** | **168** |
| **B** | postcode present but **unresolvable** → import with **NO coordinate** | **30** |
| **C** | **no postcode** in the Sheet → import with **NO coordinate** | **58** |
| | **total proposed** | **256** |

🧪 **Of 185 distinct postcodes, 31 did not resolve — and 16 of those are TERMINATED (retired) postcodes**, retirement years 1994–2021 (`CB1 2JE` 1995, `SG13 7LP` 1994, `CB2 15BQ` 2021, …). ⚠️ **A terminated postcode still has a coordinate in the terminated-postcodes endpoint, and I deliberately did not use it** — a postcode retired in 1994 is not evidence of where a food van parks in 2026. Those rows go in with no coordinate.

🔴 **A venue with no coordinate is SAFE, by construction:** 🔎 the discovery feed maps `venue.latitude ? … : undefined` and MapView pins only `venueLat && venueLong`, so the event **lists without a marker rather than getting a wrong one.**

**Post-generation checks, all passing:** 🧪 154 distinct coordinates for 168 venues, and **every shared coordinate traces to a shared postcode** (no sentinel/placeholder clustering); **0 outside UK bounds**; **every proposed row has a village**.

⚠️ **Three names an operator may want to eyeball** — `Meet Mike [Norwich]`, `8.55 appointment @ dr [Unknown]`, `dr appointment [Great Yarmouth]`. 🔴 **They are proposed, not refused.** Manual §6 item 8 **withdrew** the keyword classification that read unusual venue names as bad data — *"Pitches are routinely named after the landmark they park beside"* — and the operator corrected that reading once already. Flagging without rejecting respects both.

### What Step 3 does NOT do

🔴 **It links no event.** `discovery_events.venue_id` is untouched; 🧪 **2,229 rows stay unlinked, 316 of them future.** Importing a venue does not attach anything to it — linking is `scripts/backfill-venue-id.ts`, emit-only, run by hand, afterwards. ⚠️ It also does not re-run the gauntlet over the **158 existing** `venues` rows that carry a coordinate and no postcode (the Apps Script's shape) — those are pre-existing and out of this step's scope.

### Rollback

`05-rollback.sql` — **ids are pre-generated in the INSERT**, so the rollback is `delete from venues where id in (…256 explicit ids…)`, exact and affecting nothing else. ⚠️ It first counts `discovery_events` linked to those ids: `venues.id` is referenced `ON DELETE SET NULL`, so if anything has been linked in the meantime those events lose the link rather than being deleted. `00-snapshot.sql` also takes a full `venues_backup_20260909` copy first.

---

## 4. THE FILES — all written, none applied

| path | what | applied? |
|---|---|---|
| `supabase/migrations/20260909_discovery_exclusion_terms.sql` | creates `discovery_exclusion_terms` | ⛔ **NO** — 🧪 the table still 404s at END |
| `docs/sql/migration-step-1-20260909/00-NO-BACKFILL-REQUIRED.sql` | proof query + reasoning | verification only |
| `docs/sql/migration-step-1-20260909/01-la-piazza.sql` | the ambiguous row | inspection only |
| `docs/sql/migration-step-2-20260909/01-verify-before.sql` | expect table empty, `excluded_terms` still 0 | ⛔ |
| `…/02-import.sql` | 143 terms, 5 with `hits_truck` | ⛔ |
| `…/03-verify-after.sql` | 143/143, the 5 poisoned listed, old table untouched | ⛔ |
| `…/04-containment-extra.sql` | the 4 containment-only terms — reference, not an import | ⛔ |
| `…/05-rollback.sql` | delete by `created_by`, or drop table | ⛔ |
| `docs/sql/migration-step-3-20260909/00-snapshot.sql` | `venues_backup_20260909` | ⛔ |
| `…/01-verify-before.sql` | expect 0 of the 256 pairs already present | ⛔ |
| `…/02-import.sql` | 256 venues, explicit ids, `on conflict (name, village) do nothing` | ⛔ |
| `…/03-verify-after.sql` | 256 added, 0 null villages, 168/88 coordinate split | ⛔ |
| `…/04-held-for-review.sql` | the 36 held, with the reason per row | reference |
| `…/05-rollback.sql` | delete by explicit id, after a link check | ⛔ |

🧪 **SQL sanity:** 399 generated value rows checked for quote balance — **0 malformed**; apostrophes correctly doubled (`'Frog''s Farm'`).

**Suggested order:** step 2's migration → 2's verify-before → import → verify-after; then step 3's snapshot → verify-before → import → verify-after. **Step 1 runs nothing.** Each step is independent; neither depends on the other.

---

## 5. WHAT ALL THREE STEPS DO NOT DO — stated plainly

🔴 **These are gap-closing steps, not cutover steps. After all three, the pipeline behaves EXACTLY as it does today.**

- **No code reads `discovery_exclusion_terms`.** The scraper still reads the Sheet's Exclusions tab (`:453`) and applies it at `:860`.
- **No code reads a backfilled `schedule_url`** — and Step 1 backfills nothing anyway. The site list still comes from the Sheet (`:480-514`).
- **Importing venues links no event.** `venue_id` stays null on 2,229 rows.
- **The Sheet remains the source of truth for all four reads.** Nothing here moves a read.
- **The scraper's own broken write at `:792` is not repointed** — it will keep failing into `dbWriteFailures` until `EXCLUSIONS_FROM=db` ships.
- **The Apps Script is untouched.** Its four triggers, its retro-delete and its Sheet-only deletes all still run.

**Rollbacks, in one line each:** Step 1 — nothing to reverse. Step 2 — `delete … where created_by = 'migration-step-2'`, or `drop table`. Step 3 — `delete from venues where id in (…)`, the 256 explicit ids, after the link check.

---

## 6. WHERE I CONTRADICT THE BRIEF OR THE DOCUMENTS

| Claim | What is true | Evidence |
|---|---|---|
| "81 of 109 have a `schedule_url` in the Sheet and null in the DB" | 🔴 **False.** 26 Sheet Schedule URLs, all 26 already in the DB. The 80 are **websites**, already in `discovery_trucks.website`. **No backfill exists to do.** | 🧪 106 identical / 0 mismatch on `coalesce(schedule_url, website)` |
| retirement plan §6 step 1: *"Backfill `discovery_trucks.schedule_url` for the 81 sites … ~1 h; 81 rows"* | 🔴 **Withdrawn.** It would duplicate 80 values and destroy the schedule-page/homepage distinction. | as above |
| "5 of the 143 terms fuzzy-match a Trucks-tab name" | ✅ **Confirmed exactly**, same five names | 🧪 re-derived with the scraper's matcher |
| manual §16.3 "5 under Levenshtein, 7 under containment" | ✅ correct **about trucks**; ⚠️ incomplete about **terms** — 5 vs **9** | 🧪 both axes measured |
| "348 Sheet-only venues, 298 carry a postcode the DB lacks" | ✅ 348 confirmed. ⚠️ **209 of the 292 that survive the first two gates carry a postcode**, of which **185 distinct** and **154 resolvable** | 🧪 postcodes.io bulk |
| "at most 145 are the Apps Script's" | ✅ consistent — of the 292 clean, 201 carry the scraper's marker and 91 are unmarked | 🧪 marker census |
| "16 loser rows deleted — check no import recreates one" | ✅ **5 recreations caught and held**; my first two check designs missed or over-caught them | 🧪 §3, with the two bugs recorded |

**No span of the prompt arrived garbled. No instruction contradicted another** — the closest was "produce the SQL and the migration files" against "Do NOT apply a migration", which are compatible (write, do not run) and are what I did.

---

# APPENDIX — THE FULL NUMBERED PROPOSAL, STEP 3

### A — postcode resolved, coordinate FROM postcodes.io (168)

| # | name | village | postcode | lat, lng (postcodes.io) |
|---|---|---|---|---|
| 1 | The Bell Inn | Balsham | CB21 4DS | 52.133173, 0.316593 |
| 2 | The Bull | Burrough Green | CB8 9NH | 52.174552, 0.393394 |
| 3 | The Greyhound | Chevington | IP29 5QS | 52.201513, 0.607978 |
| 4 | The King's Head | Pebmarsh | CO9 2NH | 51.968973, 0.695745 |
| 5 | The Bull | Borrough Green | CB8 9NH | 52.174552, 0.393394 |
| 6 | The Swan | Lavenham | CO10 9PZ | 52.108446, 0.795481 |
| 7 | The Street | Capel St. Mary | IP9 2EP | 52.003842, 1.049835 |
| 8 | Meet Mike | Norwich | NR30 3PY | 52.583929, 1.733251 |
| 9 | Lingwood England Football | Lingwood | NR13 4AZ | 52.621255, 1.490534 |
| 10 | Fordham British Legion | Fordham | CB7 5NJ | 52.311041, 0.391946 |
| 11 | Fardons at The Swan | The Swan | NR13 3AA | 52.637569, 1.549537 |
| 12 | Welwyn Garden City Town Centre Street Food Heroes | Welwyn Garden City | AL8 6TP | 51.803246, -0.206904 |
| 13 | BAR HILL | CAMBRIDGE | CB23 8ES | 52.253222, 0.024624 |
| 14 | The Jerk Chicken Man | Hertford | SG14 1BW | 51.796536, -0.077109 |
| 15 | Hop Fields | Saffron Walden | CB11 3AY | 52.016683, 0.249821 |
| 16 | Crumble King of Northstowe | Northstowe | CB24 1EU | 52.279113, 0.062337 |
| 17 | Letchworth store | Letchworth | SG6 1AB | 51.988763, -0.219555 |
| 18 | Banbury Show | Banbury | OX16 0AA | 52.060139, -1.339541 |
| 19 | Jesus Green | Cambridge | CB4 3BD | 52.212510, 0.120702 |
| 20 | Rainbow Rocket | Cambridge | CB1 7ED | 52.192868, 0.139270 |
| 21 | Smile Jamaica | NEWMARKET | CB8 0AA | 52.247570, 0.401394 |
| 22 | EAT Street MK | Milton Keynes | MK1 1QB | 52.007010, -0.730974 |
| 23 | Street Food Heroes | Ashwell | SG7 5NX | 52.041388, -0.153802 |
| 24 | Poss leave | Norfolk | NR1 1AA | 52.626674, 1.309363 |
| 25 | TBC Black Dog Music Project | Norwich | NR3 4DY | 52.651022, 1.309294 |
| 26 | Gosfield Village Fete | Gosfield | CO9 1PR | 51.927212, 0.592287 |
| 27 | Bures Music Festival | Bures | CO8 5JE | 51.974624, 0.776466 |
| 28 | Kings Forest Car Park | Bury Saint Edmunds | IP28 6UT | 52.330890, 0.681562 |
| 29 | 48 Clifton Road | Cambridge | CB1 7ED | 52.192868, 0.139270 |
| 30 | Newton Flotman Social club | Newton Flotman | NR15 1RF | 52.537669, 1.255993 |
| 31 | Trowse village fete | Trowse | NR14 8AX | 52.557847, 1.236135 |
| 32 | Father's Day | Haverhill | CB9 7AA | 52.071146, 0.435504 |
| 33 | The Live Lounge | Stowmarket | IP14 1BB | 52.185487, 0.999517 |
| 34 | The Lounge | Stowmarket | IP14 1BB | 52.185487, 0.999517 |
| 35 | Fairfield park | Stotfold | SG5 4FA | 51.997688, -0.246893 |
| 36 | Sawasdee Melford, Nethergate Brewery & Distillery | Nethergate Brewery & Distillery | NR9 5SE | 52.721459, 1.108452 |
| 37 | The Brickmakers | Norwich | NR3 4DY | 52.651022, 1.309294 |
| 38 | Prep for Armour fest | Ludham | NR29 5NY | 52.702094, 1.514576 |
| 39 | The Shannon Inn | Bucklesham | IP10 0DR | 52.030469, 1.268545 |
| 40 | Felixstowe Carnival | Felixstowe | IP11 2AU | 51.957656, 1.343603 |
| 41 | BTYFC Baldock Town Youth | Baldock | SG7 5AU | 51.993850, -0.196951 |
| 42 | Armourfest 26 | Forncett St Peter | NR16 1HZ | 52.495275, 1.193225 |
| 43 | The White Hart | Campton | SG17 5PE | 52.029864, -0.356206 |
| 44 | Fen Edge Festival | Cottenham | CB24 8UA | 52.282510, 0.124804 |
| 45 | Trinity College | Cambridge | CB2 1TQ | 52.206938, 0.117524 |
| 46 | King's Affair | Cambridge | CB2 1ST | 52.204343, 0.117268 |
| 47 | Stapleford Feast | Stapleford | CB22 5BG | 52.148914, 0.142761 |
| 48 | Hi Park Primary Summer Fair | Cambridge | CB1 3QW | 52.193699, 0.144065 |
| 49 | Black Horse Rampton | Rampton | CB24 8QB | 52.291195, 0.090657 |
| 50 | Histon and Impington Recreation Ground | Histon and Impington | CB24 9LU | 52.245511, 0.112621 |
| 51 | Wootton Community Centre | Wootton | MK43 9EJ | 52.078648, -0.529344 |
| 52 | Biggleswade Market | Biggleswade | SG18 8AL | 52.085043, -0.261967 |
| 53 | Tyres | Lingwood | NR13 4BG | 52.617504, 1.491772 |
| 54 | Southery Village Hall | Southery | PE38 0NB | 52.526148, 0.384507 |
| 55 | Shuttleworth Festival of flight | Shuttleworth | SG18 9NY | 52.053972, -0.269604 |
| 56 | Village Hall and playing field | Newton Flotman | NR15 1RF | 52.537669, 1.255993 |
| 57 | The Norfolk Tank Museum | Forncett St Peter | NR16 1HZ | 52.495275, 1.193225 |
| 58 | Little Thetford - Open Group | Little Thetford | CB6 1LX | 52.456107, 0.309436 |
| 59 | Marham Park | Felixstowe | IP11 2XP | 51.961706, 1.322895 |
| 60 | Belchamp Community House | Belchamp | CO10 7BG | 52.044568, 0.626218 |
| 61 | Relay for Life | Bury St Edmunds | IP33 3TU | 52.248405, 0.686811 |
| 62 | Rougham Estate Pumpkin Patch | Rougham | IP30 9LZ | 52.235429, 0.797815 |
| 63 | Milton Country Park | Milton | CB24 6AZ | 52.237163, 0.158039 |
| 64 | Marky D's | Norfolk | NR1 1AA | 52.626674, 1.309363 |
| 65 | Todd In The Hole Festival | Todd In The Hole Festival | SG18 9DT | 52.085306, -0.300402 |
| 66 | Chilfest | Chilfest | AL5 1AA | 51.811043, -0.334760 |
| 67 | Northstowe Town | Northstowe | CB24 1DB | 52.289656, 0.058472 |
| 68 | Zaket Potato | Norwich | NR2 3AA | 52.628105, 1.274085 |
| 69 | King's College Chapel | Cambridge | CB2 1ST | 52.204343, 0.117268 |
| 70 | PIE Performance Porsche | Ipswich | IP1 5PB | 52.081085, 1.112673 |
| 71 | THE MANGER | Bradfield Combust | IP30 0LW | 52.179298, 0.765237 |
| 72 | Bailey Hills Vineyard | Wickham Hall | CM23 1JG | 51.886456, 0.140701 |
| 73 | Ampthill Big Tent Weekend | Ampthill | MK45 2GU | 52.031511, -0.501924 |
| 74 | Rushden Party in The Park | Rushden | NN10 0RU | 52.292117, -0.598039 |
| 75 | St John's College | Cambridge | CB2 1TP | 52.207777, 0.117827 |
| 76 | Inclecboro Fields Campsite | West Runton | NR27 9QG | 52.935248, 1.247730 |
| 77 | Hadleigh high street | Hadleigh | IP7 5AP | 52.042122, 0.955279 |
| 78 | Unit 8A, The Grip Industrial Estate | Linton | CB21 4XN | 52.093455, 0.272619 |
| 79 | Culford Classic Car Show | Culford | IP29 5NX | 52.214720, 0.704000 |
| 80 | Dog Day Fairhaven | Unknown | NR32 4TT | 52.489878, 1.739272 |
| 81 | Helmingham Gardens | Helmingham Estate | IP14 6EF | 52.174126, 1.196699 |
| 82 | 8.55 appointment @ dr | Unknown | IP33 1EQ | 52.247302, 0.713761 |
| 83 | No RWE | Unknown | NR13 3AA | 52.637569, 1.549537 |
| 84 | Ranworth beer festival | Unknown | NR13 3AA | 52.637569, 1.549537 |
| 85 | Ashdon Village Hall Car Park | Ashdon | CB10 2HB | 52.054212, 0.311921 |
| 86 | Cancer Research UK Cambridge Institute | Cambridge | CB2 0RE | 52.176902, 0.135578 |
| 87 | Audley End Enchanted Railway | Audley End | CB11 4JB | 52.018884, 0.220548 |
| 88 | White Hart Pub | Attleborough | NR17 1TP | 52.532021, 0.934632 |
| 89 | FY Camp | Wendling | NR19 2LT | 52.673364, 0.861446 |
| 90 | dr appointment | Great Yarmouth | NR29 5NY | 52.702094, 1.514576 |
| 91 | Incleboro Fields Caravan and Motorhome Club Campsite | West Runton | NR27 9QG | 52.935248, 1.247730 |
| 92 | Estuary Park | Melford | CO10 9BB | 52.102367, 0.723250 |
| 93 | Rookswood club | March | PE15 0PR | 52.575800, 0.080903 |
| 94 | Audley End Miniature Railway | Audley End | CB10 2XJ | 51.993875, 0.332672 |
| 95 | Puckeridge Pony Club | Brent Pelham | SG10 6AJ | 51.847286, 0.068773 |
| 96 | Corporate Lunch | Haverhill | CB9 7XF | 52.068356, 0.474035 |
| 97 | West Suffolk Classic Show | Haverhill | CB9 7XF | 52.068356, 0.474035 |
| 98 | RHS Sandringham Flower Show | Sandringham | PE31 6PE | 52.864743, 0.511044 |
| 99 | Sandringham Estate | Sandringham | PE35 6EN | 52.826389, 0.516345 |
| 100 | Churro Boyz | Letchworth | SG6 1AE | 51.990448, -0.215061 |
| 101 | Royal Air Force Day Event 2026 | Ipswich | IP3 9QA | 52.035856, 1.192215 |
| 102 | Down By The River | BURY ST EDMUNDS | IP33 2AA | 52.240095, 0.719415 |
| 103 | BigDaySmallCountry Festival | Nayland | CO6 4AY | 51.989254, 0.894940 |
| 104 | Mid-Suffolk Light Railway | Mid-Suffolk | IP14 6NU | 52.241895, 1.166745 |
| 105 | The Framsden Greyhound | Framsden | IP14 6HG | 52.192389, 1.215703 |
| 106 | Great Blakenham Village Hall | Great Blakenham | IP6 0NJ | 52.115102, 1.093467 |
| 107 | Worlingworth Community Centre | Woodbridge | IP13 7HX | 52.269444, 1.253328 |
| 108 | Jive Swing Festival | Watford | WD17 1BN | 51.661107, -0.400599 |
| 109 | Transit Mot due | Cromer | NR27 9HY | 52.930654, 1.295980 |
| 110 | 46 Chesterton Rd | Cambridge | CB4 1EN | 52.214260, 0.126348 |
| 111 | 135-163 Galton Rd | Cambridge | CB3 0UL | 52.224832, 0.099853 |
| 112 | Brookside | Dalham | CB8 8TG | 52.226066, 0.520149 |
| 113 | Unit 2, Convent Drive | Waterbeach | CB25 9QT | 52.270805, 0.181848 |
| 114 | Gentleman Jacks | Acle | NR13 3DY | 52.638453, 1.547967 |
| 115 | Norfolk Broads Caravan and Motorhome Club Campsite | Ludham | NR29 5NY | 52.702094, 1.514576 |
| 116 | River Nights Event | Audley End | CB10 1JD | 52.023214, 0.241651 |
| 117 | Connaught Hall | Norwich | NR4 7UG | 52.622703, 1.219858 |
| 118 | music on the green | long melford | CO10 9LQ | 52.073960, 0.716135 |
| 119 | Rendlesham Campsite | Rendlesham | IP12 2SZ | 52.124187, 1.404916 |
| 120 | AFRICA ALIVE | Norwich | NR3 1AU | 52.630670, 1.296065 |
| 121 | Cantly Fun Day | Cantley | NR13 3UF | 52.561584, 1.570506 |
| 122 | Salen | Salen | PA72 6JJ | 56.521104, -5.941077 |
| 123 | Mezzoforte | Cambridge | CB2 8AA | 52.189577, 0.131329 |
| 124 | Lord Nelson | Norfolk | NR1 1AA | 52.626674, 1.309363 |
| 125 | Armour fest | Norwich | NR1 1AA | 52.626674, 1.309363 |
| 126 | Beetle Juice Event | Jimmy Farm | IP14 1AA | 52.186371, 0.997660 |
| 127 | Cambourne Cricket Pavilion | Cambourne | CB23 6FY | 52.220296, -0.065054 |
| 128 | Little Thetford Village Hall | Little Thetford | CB6 3HG | 52.365341, 0.245034 |
| 129 | Great Waldingfield | Great Waldingfield | CO10 2RW | 52.038263, 0.741896 |
| 130 | Body Funk | Cambridge | CB2 1TN | 52.205118, 0.116208 |
| 131 | Dog show | Norfolk | NR1 1AA | 52.626674, 1.309363 |
| 132 | Sudbury Street Food Festival | Sudbury | CO10 2EU | 52.038163, 0.727599 |
| 133 | Frog's Farm | Sundowner | NR31 0FF | 52.607153, 1.718429 |
| 134 | Westerfield Horse Show | Westerfield | IP6 0AJ | 52.097693, 1.116868 |
| 135 | Hylands Park | Chelmsford | CM2 8WQ | 51.711473, 0.435957 |
| 136 | Biomedical Campus Cambridge | Cambridge | CB2 0AW | 52.176792, 0.136685 |
| 137 | Bristol International Balloon Fiesta | Bristol | BS40 5TT | 51.366894, -2.700824 |
| 138 | Hylands Estate | Chelmsford | CM2 8WQ | 51.711473, 0.435957 |
| 139 | Dunstable | Dunstable | LU5 4HR | 51.885488, -0.514802 |
| 140 | Playbox | Cambridge | CB2 8AA | 52.189577, 0.131329 |
| 141 | St Neots | St Neots | PE19 1AE | 52.228754, -0.269248 |
| 142 | The Orchard Gardens | Thetford | IP24 1BB | 52.416268, 0.744949 |
| 143 | Co ob Barking rd | Needham Market | IP6 8EQ | 52.149590, 1.056005 |
| 144 | The Bell Bar | Buxhall | IP14 3BU | 52.188941, 0.967514 |
| 145 | Lannock Farm | Hitchin | SG4 7JE | 51.931180, -0.232282 |
| 146 | Wootton Food and music festival | Wootton | MK43 9DU | 52.098533, -0.528355 |
| 147 | The Green Barn Farm Shop | Cambridge | CB22 3AD | 52.164938, 0.161955 |
| 148 | Hitchin Food Festival | Hitchin | SG4 9RU | 51.947521, -0.268729 |
| 149 | Moreton Hall Community Centre | Bury St Edmunds | IP32 7EW | 52.245213, 0.742641 |
| 150 | Ridgewell Village Hall | Ridgewell | CO9 4PT | 52.018842, 0.560693 |
| 151 | The Royal British Legion, Fordham | Fordham | CB7 5NJ | 52.311041, 0.391946 |
| 152 | Bury Food & Drink Festival | Bury | PE32 2AA | 52.702664, 0.684208 |
| 153 | Brecks Vineyard | Hockwold cum Wilton | IP26 4JN | 52.466738, 0.505412 |
| 154 | University of Suffolk | Ipswich | IP4 1QJ | 52.052374, 1.163356 |
| 155 | The Great Feast | Euston Hall | IP24 2QW | 52.373242, 0.786639 |
| 156 | Christening | Thetford | IP24 1AA | 52.415029, 0.746828 |
| 157 | Bennington Chilli Festival | Bennington | SG2 7DJ | 51.882825, -0.095299 |
| 158 | Ashwell Show | Ashwell | SG7 5NX | 52.041388, -0.153802 |
| 159 | The White Swan | Bluntisham | PE28 3LD | 52.352608, 0.006725 |
| 160 | Elmsfest | Elmswell | IP30 9GN | 52.239951, 0.780374 |
| 161 | IVO Brewery | St. Ives | PE27 3LY | 52.345474, -0.057068 |
| 162 | Cock Inn | Werrington | PE4 5AU | 52.623374, -0.275684 |
| 163 | freethorpe village hall | Freethorpe | NR13 3NX | 52.591992, 1.558018 |
| 164 | Newton Flotman Quiz Night | Unknown | NR16 1QQ | 52.472607, 1.133528 |
| 165 | BNatural Music Festival | BNatural | SW1A 0AA | 51.499842, -0.124638 |
| 166 | foodPark Biomedical Campus | Langley | CB11 4SB | 51.990681, 0.091064 |
| 167 | Big Olney Food Festival | Olney | MK46 4AA | 52.151982, -0.701908 |
| 168 | alumasc water management | halstead | CO9 1JQ | 51.943124, 0.630661 |

### B — postcode present but UNRESOLVABLE, NO coordinate (30)

| # | name | village | postcode (unresolvable) | coordinate |
|---|---|---|---|---|
| 1 | east bergholt village summer fair | East Bergholt | CO8 7AA | — none — |
| 2 | Suffolk Aviation Heritage Group | Great Cornard | CO10 0JU | — none — |
| 3 | Steak & Honour | Cambridge | CB2 3PH | — none — |
| 4 | CB1 Station Road | Cambridge | CB1 2JE | — none — |
| 5 | Charity Music Festival | Hertford Heath | SG13 7LP | — none — |
| 6 | Brandon | Brandon | IP27 0 | — none — |
| 7 | Holbrook | Holbrook | IP9 2 | — none — |
| 8 | Hilton Feast | Hilton | PE28 9 | — none — |
| 9 | Culford School | Bury St. Edmunds | IP28 6TG | — none — |
| 10 | Rushbanks Farm Caravan and Camping Site | Bures | CO8 5HU | — none — |
| 11 | West Bergholt Cricket Club Juniors | West Bergholt | CO6 3BS | — none — |
| 12 | The Ship | Great Yarmouth | NR30 1DT | — none — |
| 13 | The Gog | Cambridge | CB2 9HN | — none — |
| 14 | The Cake Shed | Great Waldingfield | CO10 2QW | — none — |
| 15 | Eddington, North West Cambridge Development | Cambridge | CB3 0GA | — none — |
| 16 | Electric Paradise | Letchworth | SG6 1 | — none — |
| 17 | Chalkstone Fun Day | Haverhill | CB9 0 | — none — |
| 18 | Shudy Rocks | Shudy Camps | PE14 0 | — none — |
| 19 | Reggae Land | Letchworth | SG6 2HR | — none — |
| 20 | Lochbuie | Lochbuie | PA71 6XU | — none — |
| 21 | Bunessan Show | Bunessan | PA69 6DZ | — none — |
| 22 | Old Goat Brewery | Stansfield | CO10 2PF | — none — |
| 23 | The Half Moon 1746 | Felixstowe | IP11 7BD | — none — |
| 24 | Camlife,Fulbourn | Fulbourn | CB21 5BQ | — none — |
| 25 | Higher Life | BURY ST EDMUND’S | IP30 0PG | — none — |
| 26 | Physio | Unknown | NR1 3AQ | — none — |
| 27 | 10 Dereham Road | Norwich | NR2 4AA | — none — |
| 28 | Daisy’s Milk Shed | Cambridge | CB2 9HN | — none — |
| 29 | Ipswich Town FC Fanzone | Ipswich | IP1 3BG | — none — |
| 30 | Drina Bakes | Sudbury | CO10 2XL | — none — |

### C — no postcode, NO coordinate (58)

| # | name | village | postcode | coordinate |
|---|---|---|---|---|
| 1 | The Black Horse | Brent Pelham | — | — none — |
| 2 | Halo Car Park | Stowmarket | — | — none — |
| 3 | @Fashionthriftsociety | Peck'nam | — | — none — |
| 4 | Crafty Bear Sip N Paint | Witham High Street | — | — none — |
| 5 | The Village Club Farcet | Farcet | — | — none — |
| 6 | Ramsey Neighbourhoods Trust | Ramsey | — | — none — |
| 7 | Ely Fest | Ely | — | — none — |
| 8 | George Iv | Sawbridgeworth | — | — none — |
| 9 | Naama African Kitchen | Edwardstone White Horse | — | — none — |
| 10 | Authentic Turkish Kebabs | Edwardstone White Horse | — | — none — |
| 11 | Noodles, Bao Buns, Curries | Edwardstone White Horse | — | — none — |
| 12 | Suffolk Spice Fusion Curries And Naan Wraps | Edwardstone White Horse | — | — none — |
| 13 | Authentic Thai Food | Edwardstone White Horse | — | — none — |
| 14 | Jerk Chicken Loaded Fries | Edwardstone White Horse | — | — none — |
| 15 | School Event | Milton Keynes | — | — none — |
| 16 | Corporate Party For @Uk Power Network | Stratford | — | — none — |
| 17 | Unit 21 Wolseley Business Park | Oulton Broad | — | — none — |
| 18 | Zaket Trailer | Norwich | — | — none — |
| 19 | Ely Arts Festival | Ely | — | — none — |
| 20 | Felixstowe (Opposite Car Shop & Library) | Felixstowe | — | — none — |
| 21 | Milton Foot Golf @Kinnerz Coaching | Milton | — | — none — |
| 22 | West End Fete | Surrey | — | — none — |
| 23 | Highfield Academy Summer Fete | Ely | — | — none — |
| 24 | Hadleigh Lay By At Beestons | Beestons | — | — none — |
| 25 | Belstead Arms, Ipswich Ip2 9qu | Ipswich | — | — none — |
| 26 | Festival Silver Street | Godmanchester | — | — none — |
| 27 | Festival Barford Road | Blunham | — | — none — |
| 28 | Soham Prom, Soham Village College | Soham | — | — none — |
| 29 | Chatteris Midsummer Festival | Chatteris | — | — none — |
| 30 | Dereham Town Football Club | Dereham | — | — none — |
| 31 | Junior School | White Woman Lane | — | — none — |
| 32 | North Motherwell | Motherwell | — | — none — |
| 33 | Old Forgewood & Forgewood | Forgewood | — | — none — |
| 34 | Ascensos Motherwell (Car Park) | Motherwell | — | — none — |
| 35 | Craigneuk (Behind Farmfoods) | Craigneuk | — | — none — |
| 36 | Muirhouse (Beside Uppercrust) | Muirhouse | — | — none — |
| 37 | Torrence Park (Panton Ave) | Torrence Park | — | — none — |
| 38 | Cambridge Botanic Garden | Cambridge | — | — none — |
| 39 | Krazy Horse Late Nights | Bury St Edmunds | — | — none — |
| 40 | Nene Park, Peterborough- Nene Park Trust | Peterborough | — | — none — |
| 41 | Gala Day Godmanchester | Godmanchester | — | — none — |
| 42 | Picnic In The Park Godmanchester | Godmanchester | — | — none — |
| 43 | Long Road College Open Evening | Cambridge | — | — none — |
| 44 | West Hub Summer Party | Cambridge | — | — none — |
| 45 | Stowmarket Food & Drinks Festival | Stowmarket | — | — none — |
| 46 | Clare- Platform 1 | Clare | — | — none — |
| 47 | Stowmarket Food Festival | Stowmarket | — | — none — |
| 48 | Isleham Gala | Isleham | — | — none — |
| 49 | Shefford Market | Shefford | — | — none — |
| 50 | Felixstowe Charity Event | Felixstowe | — | — none — |
| 51 | The Waggon & Horses | Milton | — | — none — |
| 52 | Transit Mot | Unknown | — | — none — |
| 53 | Haircut | Unknown | — | — none — |
| 54 | G’s Family Day | G's Family Day | — | — none — |
| 55 | Dionne visit | Unknown | — | — none — |
| 56 | California Social Club | California | — | — none — |
| 57 | Little Wings Of Hope Event | Essex | — | — none — |
| 58 | Hare And Hounds | East Bergholt | — | — none — |
---

## APPENDIX B — REFUSED: no village (38)

🔴 A null/blank village can never conflict in the `(name, village)` unique index — nulls are DISTINCT — so each of these would duplicate for ever on every future run. Manual §5.3.

| # | Sheet row | name | postcode |
|---|---|---|---|
| 1 | 514 | Tharp Arms | — |
| 2 | 517 | Edwardstone White Horse | — |
| 3 | 536 | Mariners Compass | — |
| 4 | 546 | Essex Foodies Market | — |
| 5 | 586 | The Pod | — |
| 6 | 591 | Sudbury Town Market | — |
| 7 | 592 | Beach Street Food Festival | — |
| 8 | 596 | Private Wedding | — |
| 9 | 597 | Ely Market | — |
| 10 | 600 | The Dog Inn | — |
| 11 | 601 | Great Ellingham Recreation Centre | — |
| 12 | 602 | Mattishall Sports & Social Club | — |
| 13 | 606 | Honington | — |
| 14 | 607 | Peterborough Market | — |
| 15 | 608 | Sutton | — |
| 16 | 609 | Newmarket | — |
| 17 | 612 | Littlehey | — |
| 18 | 613 | Wintringham Plaza | — |
| 19 | 614 | Great Paxton | — |
| 20 | 621 | Closed | — |
| 21 | 623 | Trumpington Meadows | — |
| 22 | 624 | Chesterwell | — |
| 23 | 625 | Arcade Street Tavern | — |
| 24 | 626 | Woodbridge Beer Festival | — |
| 25 | 627 | Sprites | — |
| 26 | 666 | Coach And Horses Public House | — |
| 27 | 671 | Felsham Six Bells | — |
| 28 | 672 | Wattisfield Village Hall | — |
| 29 | 704 | The Yew Tree | — |
| 30 | 705 | Saffron Grange | — |
| 31 | 764 | The Flintknappers | — |
| 32 | 765 | Downham Cider | — |
| 33 | 766 | The Cavendish Five Bells | — |
| 34 | 775 | Dinky Drinky Box | — |
| 35 | 789 | The Live Lounge | — |
| 36 | 812 | West Suffolk Athletics Club | — |
| 37 | 930 | Suffolk Distillery | — |
| 38 | 931 | Old Goat Brewery | — |

---

## APPENDIX C — HELD for review (36)

Group 1 — **near-duplicate of an existing venue** (name matches, coordinates agree). 🔴 Five are rows deleted by the 8 September CERTAIN merge; importing them would silently undo it.

| # | Sheet row | name | village | why |
|---|---|---|---|---|
| 1 | 43 | Hoveton Village Hall | Wroxham | name~ and 1.15km from "Hoveton Village Hall [Hoveton]" |
| 2 | 235 | Community Car Park | Holbrook | name~ and 2.51km from "Community Car Park [Stutton]" |
| 3 | 254 | Toftwood Social Club | Dereham | name~ and 0.04km from "Toftwood Social Club [Toftwood]" |
| 4 | 297 | Hoveton Village Hall & Park | Wroxham | name~ and 1.15km from "Hoveton Village Hall [Hoveton]" |
| 5 | 312 | The Rose and Crown | Impington | name~ and 0.27km from "The Rose & Crown [Histon]" |
| 6 | 376 | Trumpington Meadows, Kestrel Rise | Trumpington Meadows | name~ and 0.50km from "Trumpington Meadows [Cambridge]" |
| 7 | 437 | Trumpington Meadows Food Vans | Trumpington | name~ and 0.50km from "Trumpington Meadows [Cambridge]" |
| 8 | 693 | Milton Community Centre | Cambridge | name~ and 1.75km from "Milton Community Centre [Milton]" |
| 9 | 699 | Foodpark CamLife | Fulbourn | name~ and 3.63km from "foodPark [Cambridge]" |

Group 2 — name matches an existing venue and **neither side has a coordinate**, so they cannot be separated. ⚠️ Most are probably different pubs sharing a name; they are held for want of a postcode, not because they are known duplicates.

| # | Sheet row | name | village | matches |
|---|---|---|---|---|
| 1 | 743 | Star Wing Events ( Tap Room ) | Diss | The Star [Lidgate] |
| 2 | 893 | Brettenham Village Hall | Brettenham | Village Hall [Troston] |
| 3 | 503 | Cavendish Five Bells | Sudbury | The Five Bells [Colne Engaine] |
| 4 | 582 | Market Square | Huntington | Huntingdon Market Square [Huntingdon] |
| 5 | 585 | The Rose & Crown | Stansted Mountfitchet | The Rose & Crown [Histon] |
| 6 | 589 | @Essexfoodiesmarket | Wittle Green | @Essexfoodiesmarket [Leigh On Sea] |
| 7 | 598 | Fordham Rbl Royal British Legion | Fordham | Royal British Legion [Upwell] |
| 8 | 603 | The Horseshoes | Blunham | The Three Horseshoes [Comberton] |
| 9 | 605 | The Red Lion | Blewbury | The Red Lion [Stretham] |
| 10 | 611 | The Boot | Dullinghan | The Boot [Dullingham] |
| 11 | 661 | The Royal Oak | Warboys | The Royal Oak [Dovercourt] |
| 12 | 675 | Needham Market Co-op, Barking Road | Needham Market | Co-op [Alconbury Weald] |
| 13 | 703 | Off The Beaten Truck | Winthringam | Off The Beaten Truck [Northstowe] |
| 14 | 706 | The Green Man | Colne | The Green [Northstowe] |
| 15 | 713 | Summer Fayre | Hellesdon | Lindsell Summer Fayre [Lindsell] |
| 16 | 714 | The Bell Pub | Hemsby | The Bell [Kesgrave] |
| 17 | 776 | Rendlesham Community Centre | Woodbridge | Rendlesham Community Centre [Rendlesham] |
| 18 | 777 | Station Square- Outside Gail's | Cb1 | Station Square [Cambridge] |
| 19 | 778 | Foodpark, Biological Campus - The Green & The Gardens | Foodpark | foodPark [Cambridge] |
| 20 | 788 | Haverhill Show, Haverhill Recreation Ground | Haverhill | Recreation Ground [Bures] |
| 21 | 801 | Fox Inn | Garboldisham | The Fox Inn [Honington] |
| 22 | 802 | Western Park Pavilion | Northstowe | The Lion [Stoke by Clare] |
| 23 | 852 | Wine-boutique, Felixstowe | Felixstowe | Wine-Boutique [Sudbury] |
| 24 | 853 | The Greyhound, Botesdale | Botesdale | The Greyhound [Wickhambrook] |
| 25 | 932 | The Cross Keys | Henley | The Cross Keys [Hatfield Peverel] |
| 26 | 933 | Northstowe | Cambridge | Northstowe Food Truck Park [Northstowe] |
| 27 | 934 | Fest Lion | Sawston | The Lion [Stoke by Clare] |
