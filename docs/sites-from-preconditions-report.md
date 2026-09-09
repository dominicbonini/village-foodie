# The three `SITES_FROM` preconditions — measured, with SQL to run by hand

**Date:** 9 September 2026 · **Mode:** READ AND PROPOSE. **No database row inserted, updated or deleted. No SQL applied. No Sheet cell modified. No code changed.** Nothing staged, committed or pushed; `git add` not run. Every database call was a `select` or a `head:true` count; the Sheet was read with the `spreadsheets.readonly` scope.

**Tags:** 🔎 SOURCE-READ (file:line) · 🧪 EXECUTED · ⚠️ inference · 🔴 danger.
**Extensions searched:** none scoped. `grep -rn -I … .` with only `node_modules`/`.next`/`.git` excluded (`.js`, `.cjs`, `.ts`, `.tsx`, `.sql`, `.yml`, `.md` all in scope), plus `grep -n` over `scripts/run-scraper.js` — **JavaScript** — by path. 🧪 **Exit codes read on every sweep:** the `NEW FROM SCRAPER`, `scraper_strategy` and `migrate-from-sheets` sweeps **exited 0 with hits**; the `.github/` sweep for `migrate-from-sheets` **exited 1** — a true negative, not a failed search (which would be 2).

---

## 0. Row counts and working tree — START and END

| | START 20:52:57Z | END 20:57:19Z |
|---|---|---|
| `discovery_trucks` | 231 | 231 |
| `venues` | 814 | 814 |
| `discovery_events` | 4,300 | 4,300 |
| `discovery_exclusion_terms` | 143 | 143 |
| `truck_events` | 137 | 137 |
| `outreach_prospects` | — | 231 |
| `scraper_run_log` | 418 | 418 |
| **`venues` still carrying the marker** | 100 | **100 — nothing was applied** |

**`git status --short`** — START: one untracked report. END: that plus the two new SQL directories. `HEAD` = `origin/main` = **`9e83a5e`**, nothing staged, **no tracked file modified**.

---

## 1. PRECONDITION 1 — the marker in `venues.scraper_strategy`

### Re-derived live

🧪 Distinct values across all 814 rows:

| value | rows |
|---|---|
| `(NULL)` | **707** |
| **`[⚠️ NEW FROM SCRAPER]`** | **100** |
| `scroll_lazy` | **7** |

🧪 **Marker rows that are sites (`schedule_url is not null`): 0.** 🧪 The 7 real-strategy rows are **all 7** of the venue sites. Your figures reproduce exactly.

### Exactly which rows change, and that none is a site

**The 100 rows holding `[⚠️ NEW FROM SCRAPER]`, and only those.** The proposed `UPDATE` carries `and schedule_url is null` — 🔴 **not decoration: it is what makes the statement structurally incapable of changing scraper behaviour.** 🔎 The venue site-list builder requires `row[9]` to start with `http`, so a row with no `schedule_url` is not a site and its strategy is never read. If one gained a URL between verification and execution, the guard skips it and the count comes back below 100 — a signal to stop, not to force.

### 🔴 What is lost — and the finding that the marker is already wrong

🧪 **Nothing in the runtime reads `venues.scraper_strategy`.** A repo-wide sweep (exit 0) finds exactly two writers and no runtime reader: `scripts/migrate-from-sheets.cjs:103` (venues, one-off) and `:68` (trucks, one-off). 🔎 The scraper's own venue upsert writes **only** `name, village, latitude, longitude, postcode` — **it has never written `scraper_strategy` at all.**

🔴 **And the DB marker is not the record it appears to be.** 🧪 All 100 marker rows were created in a **single 9-second burst on 2026-05-22T14:58:24–33** — the May migration — while `venues.created_at` spans 22 May → today. 🧪 **The Sheet holds the marker on 342 rows; the DB holds 100.** So **242 scraper-created venues since May carry the marker in the Sheet and NULL in the database.**

**Therefore what is lost by nulling it is a record that is already 71% incomplete and frozen in May** — it does not mean "the scraper created this venue", it means "this venue was marked in the Sheet as of 22 May 2026". ⚠️ **Better provenance already exists and is untouched:** 🧪 all 100 rows have a `created_at` of 2026-05-22 **and** a postcode **and** coordinates, and the Sheet's own column L remains the fuller record. `01-snapshot.sql` preserves the id + old value anyway, so the information is kept rather than discarded.

### 🔴 The Sheet still holds it — so is this a fix or a stopgap?

🧪 **The Sheet holds the marker on 342 of 936 venue rows**, and 🔎 `run-scraper.js:1981` writes `"[⚠️ NEW FROM SCRAPER]"` into column L on **every** new venue, every run.

**But — and this is the part that decides it — nothing mirrors column L into the database any more.** 🧪 The only writer of `venues.scraper_strategy` is the one-off migrate script, and 🧪 it is **not scheduled**: the `.github/` sweep for it exits 1 with no hits, and its own header says *"Run once"*. 🔎 The Apps Script writes venues to the **Sheet only** (v6.57 `:711`), and its `mirrorEventsToSupabase` carries events, not venues.

**So: the DB fix is durable, not a stopgap — with one named condition.** It holds unless someone re-runs `migrate-from-sheets.cjs` (which 🧪 would fail anyway: it upserts venues on `name`, and the live constraint is `(name, village)` → 42P10). 🔴 **The Sheet remains polluted, and the root fix is at `run-scraper.js:1981` — write the marker to a column that is not also the strategy.** That is a Sheet-schema change and is out of scope here, as instructed; it is recorded so the next pass has it.

⚠️ **The Sheet's own risk is unchanged and also currently zero:** 🧪 **0 of the 342 Sheet marker rows have a schedule URL in column J**, so no Sheet-sourced site reads a marker as a strategy today either.

### What this does NOT do, and the rollback

**It does not change any scraper behaviour today** — 0 affected rows are sites, and 🧪 nothing in the runtime reads the column. It does not touch the 7 real strategies, the Sheet, or any other column. **Rollback:** `04-rollback.sql` restores every nulled value from `venues_strategy_backup_20260909` by id.

**Files:** `docs/sql/precondition-1-venue-strategy-20260909/` — `00-verify-before` · `01-snapshot` · `02-null-the-markers` · `03-verify-after` · `04-rollback`.

---

## 2. PRECONDITION 2 — `La Piazza`, and the general rule

### (b) The sweep first, because it decides how general the problem is

🧪 **Every set of `discovery_trucks` rows collapsing to one `normalizeName` value, across all 231 rows:**

| | |
|---|---|
| distinct normalised keys | **230** |
| **colliding sets** | **1 — `lapiazza`** |
| rows normalising to the **empty string** | **0** |

🔴 **La Piazza is the only one.** ⚠️ The empty-string check matters independently: `normalizeName` strips `the`/`street`/`st`/`food` and all spaces, so a truck called "The Street Food Co" would normalise to `""` and collide with every other empty key — 🧪 zero rows do today, but the site-list builder must still refuse an empty key rather than group on it. (This is the same trap that produced a false positive in the step-3 venue dedup, manual §4.1.)

| row | url today | events | emits a site today? | would if a URL were added? |
|---|---|---|---|---|
| `fa09b6c8` **La Piazza** | `facebook.com/Lapiazzacambridge` (website) | **8** | ✅ **yes** | — |
| `5a9bbae8` **La Piazza Street Food** | both null | **7** | ❌ no | 🔴 **yes — duplicate** |

*What this sweep would look like if it proved nothing:* a normaliser that mapped everything to distinct keys would report 0 collisions whether or not duplicates existed. **Ruled out:** it is `normalizeName` copied verbatim from `:55-64`, and it **did** collapse the one known pair — so it is discriminating, not inert.

### (a) The duplicate rows themselves

🧪 Both rows in full:

| | `fa09b6c8` "La Piazza" | `5a9bbae8` "La Piazza Street Food" |
|---|---|---|
| created | **2026-05-22** (May migration) | **2026-06-05** (Hatches Up import) |
| website | `facebook.com/Lapiazzacambridge` | null |
| **order_url** | null | **`lapiazzastreetfood.hatchesup.app`** |
| contact | phone `07449 210002`, `lapiazza@signorellisdeli.com` | none |
| `scraper_strategy` | `manual` | null |
| `aliases` | `['la pizza']` | none |
| events | **8** (`Drive Screenshot` 7, `Mobile Screenshot` 1) | **7** (`Drive Screenshot` 5, `hatchesup_scraper` 2) |
| `outreach_prospects` | **1** (`not_contacted`, 0 contacts) | **1** (`not_contacted`, 0 contacts) |
| `hatchgrab_truck_id` | none | none |

⚠️ **They look like one operator captured twice** — once from the Sheet in May with the contact details, once from the Hatches Up import in June with the ordering page — and 🧪 **5 of the 7 events on `5a9bbae8` carry the truck_name "La Piazza"**, with `'la pizza'` already an alias on the keeper. 🔴 **I am not asserting it.** A name match is not identity, and the two rows carry disjoint contact data. **The merge is proposed for you to confirm, not applied.**

**Both FKs into `discovery_trucks`, read from the live schema:** `discovery_events.discovery_truck_id` (**ON DELETE SET NULL**) and `outreach_prospects.discovery_truck_id`. 🔎 The latter is `not null unique references discovery_trucks(id)` with **no on-delete clause** (`20260903_outreach_tracking.sql:40`) — **NO ACTION, so it blocks the delete**, and being **UNIQUE** it cannot be repointed to the keeper, which already has one. 🧪 Both prospects have **0 `outreach_contacts`**, so deleting the loser's loses no history.

🔴 **The merge order is the whole safety property.** `discovery_events` is ON DELETE SET NULL, so deleting the truck first would **silently orphan 7 events** — they would survive with a null link and no error. `02-merge.sql` therefore: carries `order_url` across (the outreach platform signal, app manual V12.2 — losing it would drop La Piazza off the Hatches Up list) → **repoints the 7 events** → deletes the loser's prospect → deletes the truck. 🧪 No unique-key collision is possible: a merge changes `discovery_truck_id` only, never `(event_date, truck_name, venue_name)`, and 🧪 the 15 events have 15 distinct natural keys.

### 🔴 But the merge is NOT what clears this precondition

**The precondition is that a DB-sourced site list could emit two entries for one truck. That is a property of the QUERY, and it is fixed in the query — with no data change at all.** The Sheet never needed a uniqueness rule because it had one row per truck; **the DB has 231 rows for 230 normalised names, so uniqueness must move from the source into the builder.**

`04-the-query-rule.sql` sets it out: select sites `order by created_at asc, id asc` and group by `normalizeName(name)` in **JavaScript**, taking the first. ⚠️ **Deliberately not reimplemented in SQL** — that would be a second implementation of a function that already exists in JS, free to drift, which is the divergence the manual records for the two `isFuzzyMatch` functions (§16.3). 🔴 **And the ordering is not cosmetic: "first wins" is only deterministic if the query is ordered.**

**Recommendation: ship the query rule; treat the merge as optional data hygiene.** The query rule makes the site list correct whatever the data does later — including if someone adds a website to `La Piazza Street Food` tomorrow.

### What this does NOT do, and the rollback

The merge **does not change scraper behaviour today** — 🧪 `5a9bbae8` emits no site entry (both URL columns null), so the Sheet-sourced list is unaffected either way. It does not touch the Sheet, which still holds one La Piazza row. **Rollback:** `05-rollback.sql` reverses in inverse order from three snapshot tables — truck, prospect, and the 7 event ids with their original `discovery_truck_id`.

**Files:** `docs/sql/precondition-2-lapiazza-20260909/` — `00-verify-before` · `01-snapshot` · `02-merge` · `03-verify-after` · **`04-the-query-rule`** · `05-rollback`.

---

## 3. PRECONDITION 3 — `coalesce` versus `||`

### The counts you expected to be zero — confirmed, not assumed

🧪 | column | empty-string / whitespace-only (not null) | leading/trailing whitespace |
|---|---|---|
| `discovery_trucks.schedule_url` | **0** | **0** |
| `discovery_trucks.website` | **0** | **0** |
| `venues.schedule_url` | **0** | **0** |

### The exact expression — and where it deliberately diverges from `||`

```sql
coalesce(nullif(btrim(schedule_url), ''), nullif(btrim(website), ''))
```

🔴 **It is NOT a faithful reproduction of `row[8] || row[6]`, and that is on purpose. The precise semantics, because "first truthy vs first non-null" is only half the story:**

| stored value | JS `\|\|` | plain `coalesce` | `coalesce(nullif(btrim(…),''))` |
|---|---|---|---|
| `NULL` | falls through | falls through | falls through |
| `''` (empty) | **falls through** | ❌ **returns `''`** | ✅ falls through — **matches JS** |
| `'   '` (whitespace) | ❌ **returns `'   '`** (a non-empty string is truthy in JS) | returns `'   '` | ⚠️ **falls through — DIVERGES from JS** |

⚠️ **So on whitespace-only the `btrim` version does not match the Sheet path — it behaves better.** The Sheet path would hand `'   '` to `page.goto` and fail; the `btrim` version falls through to the website. 🔴 **Recommended anyway, and the divergence stated rather than hidden.** 🧪 It affects **0 rows today** in either direction, so it changes nothing now and only ever differs on data that is already broken.

### Proof it reproduces the Sheet

🧪 Evaluated against the live Sheet and the live DB, per row:

| | plain `coalesce` | `nullif(btrim(…))` |
|---|---|---|
| truck rows with a URL, resolvable to one DB row (**106**) | **106 identical, 0 mismatch** | **106 identical, 0 mismatch** |
| venue sites (**7**) | — | **7 identical, 0 mismatch** |

⚠️ **106, not 109.** The 109 site-list *entries* comprise 107 URL-bearing rows + 2 instructions-only rows; of the 107, **La Piazza is excluded from this comparison** because its name resolves to two DB rows (§2). **The 2 instructions-only rows have no URL to compare** — 🔴 and they are the reason `SITES_FROM` was stopped in the first place (`docs/sites-from-switch-report.md` §3), so they cannot be closed by a URL expression.

*What this would look like if it proved nothing:* an expression loose enough to match anything would also report 106/106. **Ruled out:** the two expressions were evaluated **independently** and both compared by **string equality against the Sheet's own value** — a wrong name-match would have produced a URL mismatch, and there were none in 106.

### What this does NOT do, and the rollback

🔴 **Precondition 3 requires no SQL and no data change at all** — it is a decision about one expression in code that has not been written. **Nothing to roll back.** The verification query is embedded in `04-the-query-rule.sql`.

---

## 4. SUMMARY — and what still blocks `SITES_FROM`

| precondition | status | applied? | changes behaviour today? |
|---|---|---|---|
| **1** venue strategy marker | SQL ready — 100 rows, all non-sites | ⛔ no | 🟢 **no** — 0 are sites, nothing reads the column |
| **2** La Piazza / uniqueness | ✅ **cleared by the query rule (no data change)**; merge optional, SQL ready | ⛔ no | 🟢 **no** — the loser emits no site entry today |
| **3** `coalesce` vs `\|\|` | ✅ **cleared** — 0 rows affected either way; expression chosen and its one divergence stated | n/a | 🟢 **no** |

🧪 All 11 SQL files parse under a Postgres-dialect parser (`sqlglot`, in a throwaway venv outside the repo). 🔴 **None was executed. `venues` still holds 100 markers at END, and every row count is unchanged.**

🔴 **CLEARING THESE THREE DOES NOT UNBLOCK `SITES_FROM`.** The blocker from `docs/sites-from-switch-report.md` stands untouched: 🔎 the membership rule at `run-scraper.js:625-628` reads `ai_instructions`, so **2 trucks (`Louigi's Pizza`, `MumTas`) are sites only because of it**, and `strategy`/`instructions` are load-bearing on every entry. **These three preconditions clear the ground for the widened switch (Option A); they do not make the narrow one possible.**

**No span of the prompt arrived garbled. No instruction contradicted another** — "propose SQL" and "apply nothing" are compatible, and the one judgement call (that the query rule, not the merge, is what clears precondition 2) is argued in §2 rather than taken silently.
