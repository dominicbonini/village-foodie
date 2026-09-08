# What deletes from `discovery_events`, `discovery_trucks` and `venues`

**8 September 2026 · READ-ONLY.** No row inserted, updated or deleted. No migration written or applied. Nothing staged, committed, pushed; `git add` not run in any form. Every database call was a `select` or a `head:true` count; every Sheet call used the `spreadsheets.readonly` scope; every Vercel/HTTP call was a `GET`.

**Tags:** 🔎 source-read (file:line quoted) · ▶ executed (output quoted) · ⚠ inference, labelled.

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 0. ROW COUNTS — START AND END

| | START 10:29:47Z | END 10:35:34Z |
|---|---|---|
| `discovery_events` | **4,283** | **4,283** |
| `venues` | **558** | **558** |
| `discovery_trucks` | **231** | **231** |

▶ Both taken with the service-role key via `select('*', { count:'exact', head:true })`, which bypasses RLS — a policy-filtered role would under-report identically at both ends, which is why the service key is used. `git status --short` at END is in §9.

---

## 🔴 THE HEADLINE: NEITHER "DELETION EVENT" WAS A DELETION

Both were investigated against the live rows, and both dissolve.

| Event | What was believed | What actually happened |
|---|---|---|
| **9 PMF rows inserted, 4 remain** | 5 rows were deleted | **5 were never inserted.** They collided with rows that already existed on the natural key, and the pack's `ON CONFLICT … DO NOTHING` silently skipped them. All 5 events are still in the table today, under a different `source`. **Nothing was deleted.** §3.1 |
| **16 `venues` rows disappeared, 574 → 558** | an unattributable deleter | **A deliberate, hand-executed merge of exactly the report's CERTAIN tier.** Proven by the 125 events being *repointed to the keepers* — a bare `DELETE` could not have done that, because the FK is `ON DELETE SET NULL` and would have left them `NULL`. §3.2 |

And the premise behind the question:

🔴 **THERE IS NO DUPLICATE RULE AND NO OLD-EVENT RULE ACTING ON THESE THREE TABLES. NOT IN THE REPOSITORY, AND NOT IN THE DATABASE.** The behaviour that looks like one is real, but it acts on **the Google Sheet's Events tab**, not on Supabase, and it lives outside this repository. §2.

---

## 1. EVERY DELETE PATH

### 1.1 What was searched, and how

Extensions present in the searched tree (git-tracked **and** untracked, excluding `node_modules/`, `.next/`, `.git/`): ▶ `.md .ts .jpg .sql .tsx .png .xml .svg .json .js .gradle .gitignore .mjs .jpeg .webp .txt .swift .yml .java .csv .cjs .storyboard .properties .plist .entitlements .css .avif .xcscheme .xcprivacy .xcconfig .toml .resolved .pro .pbxproj .log .jar .iml .ico .html .example .bat`. **No search in this report was scoped by extension.** `scripts/run-scraper.js` is `.js` and was covered by every sweep.

Six independent spellings were swept, because a single grep proves nothing on its own:

| Sweep | Spelling | Result |
|---|---|---|
| A | `.delete(` chained after `from('<table>')` (±3 lines) | **0** for all three tables |
| B | every `.delete(` anywhere, all extensions | 90 hits — **none names any of the three tables** |
| C | `DELETE FROM` / `TRUNCATE`, case-insensitive | only the two hand-run rollback packs (§1.3) |
| D | raw REST `method: 'DELETE'` | 1 hit — `lib/custom-domain/vercel.ts:141`, the Vercel domains API, not Supabase |
| E | `.rpc(` — a function could delete server-side | 8 call sites, all order/buzzer/stranded-authorisation; **none touches the three tables** |
| F | foreign keys, read from the **live** schema | §1.2 |

### 1.2 Cascades — read from the live database, not from migration files

▶ The PostgREST OpenAPI document (63 tables) gives every foreign key as declared **in production**:

**Every FK pointing INTO the three tables — the complete list:**
```
discovery_events.discovery_truck_id  → discovery_trucks.id
discovery_events.venue_id            → venues.id
outreach_prospects.discovery_truck_id→ discovery_trucks.id
truck_events.venue_id                → venues.id
```

🔴 **Nothing anywhere references `discovery_events`. No cascade can delete an event, by construction.**

And the delete rules on the four, 🔎 from the migrations that created them:

| FK | Rule | Source | Effect of deleting the parent |
|---|---|---|---|
| `discovery_events.venue_id` | **ON DELETE SET NULL** | `supabase/migrations/20260522_discovery_schema.sql:80` | event survives, loses its link |
| `discovery_events.discovery_truck_id` | **ON DELETE SET NULL** | `…20260522_discovery_schema.sql:79` | event survives |
| `truck_events.venue_id` | **ON DELETE SET NULL** | `…20260612_truck_events_venue_id.sql:6` | operator event survives |
| `outreach_prospects.discovery_truck_id` | **no clause ⇒ NO ACTION**, and `unique` | `…20260903_outreach_tracking.sql:40` | 🔴 **blocks** the delete — a `discovery_trucks` row with a prospect cannot be deleted at all |

**No cascade removes a row from any of the three tables. One FK actively prevents a deletion.**

*If this proved nothing:* migration files can diverge from the live schema. That is exactly why the FK list was taken from the **live** OpenAPI document rather than from `supabase/migrations/`; the delete-rules column is the only part read from files, and it can only be wrong in the direction of a cascade existing that OpenAPI does not expose — which would still have to appear as an FK in that list, and the list is complete.

### 1.3 The two hand-run rollback packs — the ONLY `DELETE FROM` on these tables in the repository

Both live under `docs/sql/`, which ▶ **git does not track** (`git ls-files docs/sql` → 0 files). They are runbooks for a human to paste, not code anything executes.

| File | Statement | Predicate |
|---|---|---|
| `docs/sql/pmf-events-20260907/05-rollback.sql:18-26` | `DELETE FROM discovery_events` | `truck_name = 'Pimp My FIsh' AND source = 'Manual entry 2026-09-07: order.pimp-my-fish.co.uk' AND (event_date, venue_name) IN (…nine pairs…)` |
| `docs/sql/hatches-up-import-20260907/07-rollback.sql:8` | `DELETE FROM discovery_events` | `source = 'Manual import 2026-09-07: hatchesup.co.uk'` |
| `…/07-rollback.sql:15` | `DELETE FROM venues` — 🔴 **commented out**, three ids | requires a human to uncomment |

▶ **Neither has been run.** The PMF rollback would have removed all 9 rows; 4 remain. The Hatches-Up rollback targets a source string that ▶ matches **0 rows** — because that import was never applied either (▶ its 3 venue ids are absent, and ▶ `venues.created_at` is non-null on all 558 rows with a maximum of **2026-06-11**, so no venue has been created since 11 June).

### 1.4 The one scheduled delete in the pipeline — and it is not on these tables

🔎 `scripts/run-scraper.js:1268-1274`:
```js
async function pruneScraperRunLog(supabase) {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from('scraper_run_log').delete().lt('run_at', cutoff);
```
🔎 Called once, `:1641`, on every scraper run. **Table: `scraper_run_log`. 90-day retention. Not one of the three.** This is the only `.delete()` the scraper issues, and it is worth recording in the manual because it is the closest thing to an "old rows" rule that exists anywhere in the pipeline — and it does not touch events, trucks or venues.

### 1.5 Truck-deletion sweepers — checked, and all miss

▶ `lib/delete-truck.ts`, `lib/account-deletion.ts`, `lib/demo-restart.ts`, `lib/menu-commit.ts`, `app/api/cron/demo-cleanup/route.ts` were each read for the three table names: **no match**. 🔎 `lib/delete-truck.ts:54` states the intent — *"SET NULL (correct — deliberately NOT deleted): `discovery_trucks.hatchgrab_truck_id`"* — and ▶ §1.2 confirms the live FK matches the comment. **Deleting an operator truck does not delete its discovery shadow.**

### 1.6 Scheduled jobs

| Runner | Jobs | Any delete on the three tables? |
|---|---|---|
| **GitHub Actions** | ▶ `daily_scrape.yml` (06:00), `hatchgrab_scrape.yml` (hourly), `process-next-truck.yml` | **No.** All three run `node scripts/run-scraper.js` or `process-next-truck.js`; ▶ neither script contains a delete verb against the three tables (only `.upsert` ×8, `.update` ×2, `.insert` ×1) |
| **Vercel crons** | 🔎 `vercel.json` — `demo-cleanup`, `account-deletion-due`, `cancel-stale-authorizations`, `capture-stranded-authorizations`, `auto-reject-offline-orders`, `custom-domain-check` | **No.** All order/account/domain scoped |
| **pg_cron** | ▶ no `cron.schedule` anywhere in `supabase/` | none defined in the repo — ⚠ a job created in the Supabase dashboard would not appear here (§2.4) |
| **Triggers** | ▶ one `create trigger` in the whole repo: `orders_set_updated_at` | not on these tables |

### 1.7 RLS

🔎 There is **no** `enable row level security` and **no** `create policy` for `venues`, `discovery_events` or `discovery_trucks` in any migration — the only discovery-family RLS is `excluded_terms` (`20260604_exclusion_terms.sql:14`, service-role only). ⚠️ **Whether RLS is enabled on the three tables in production cannot be read through PostgREST**, and I did not attempt a write to find out. What can be said: no policy in this repository grants `DELETE` on them to any role, and the anon key is never used server-side for these tables.

---

## 2. THE DUPLICATE RULE AND THE OLD-EVENT RULE

### 2.1 The old-event rule does not act on the database — proven by the rows that are still there

▶ `discovery_events` holds **3,577 rows dated before today**, oldest `2026-05-22` — the very first day of the migration from Sheets:

```
past rows by month: 2026-05: 312 | 2026-06: 1050 | 2026-07: 1072 | 2026-08: 955 | 2026-09: 188
```

🔴 **Every past event ever written is still present. Nothing has ever deleted an old event from Supabase.** A retention rule of any age — 7 days, 30, 90 — would have left a visible cliff in that distribution. There is none.

*If this proved nothing:* a rule installed recently would not yet have removed anything. Ruled out by the shape — the oldest row is from day one and the monthly counts are flat, so no rule has ever run, at any point in the table's life.

### 2.2 The duplicate rule does not act on the database either — and is not needed

▶ **0 exact duplicates** on `(event_date, truck_name, venue_name)` across all 4,283 rows, and **0 rows with a NULL `venue_name`** (which would be the constraint's blind spot, since nulls are distinct in a unique index). ▶ **0 exact `(name, village)` duplicates** across all 558 `venues`.

🔎 The scraper's own writes rely on that key existing — `scripts/run-scraper.js:1708`, `upsert(batch, { onConflict: 'event_date,truck_name,venue_name' })`. ⚠️ **The absence of duplicates is explained by the unique index refusing them at insert time, not by anything removing them afterwards.** Those two causes are indistinguishable from the row counts alone; what separates them is that a *remover* would leave the 3,577 past rows deduplicated too and would have to run on a schedule nothing in §1.6 provides.

### 2.3 The rule that DOES exist acts on the Google Sheet, and it is real

▶ Read live from the Sheet this session (`spreadsheets.readonly`):

```
Events tab: 713 data rows · range 2026-09-08 → 2027-02-01 · rows dated before today: 0
```

🔴 **The Sheet's Events tab holds no past events at all, while the database holds 3,577.** 🔎 The scraper only ever appends to that tab (`scripts/run-scraper.js:1689`, `values.append`) and ▶ contains no `values.clear`, `batchUpdate`, `deleteDimension` or `values.update` anywhere. **Something outside this repository prunes the Events tab of past-dated rows.**

That pruner matters far more than its size suggests: 🔎 `scripts/run-scraper.js:466-472` builds `existingEvents` — the dedup set — from that tab. **The pruner therefore defines the dedup window.** It is the reason the dedup set is "every future event" rather than "every event ever".

### 2.4 Where the outside actor is, and what the evidence is

▶ The Sheet's **Logs** tab, read live, holds 506 rows spanning only `2026-09-07 16:43:27 → 2026-09-08 11:33:29` — **about 19 hours**, which means the Logs tab is itself rotated. Every distinct message shape in that window:

```
227 × INFO    Started processing Vendor Emails from Smart Inbox.
227 × INFO    No new emails found with 'Process Schedule' label.
 19 × INFO    Started processing Google Drive screenshots.
 18 × INFO    No screenshots found in Drive folder.
  5 × INFO    Auto-Created & Geocoded New Venue from Screenshot: …
  3 × INFO    Mirrored # event(s) to Supabase.
  3 × SUCCESS Successfully extracted # events from Screenshot ….png. File trashed
  1 × INFO    Found file …
  1 × INFO    Finished processing Drive screenshots.
```

Four things follow:

1. 🔴 **`Mirrored # event(s) to Supabase.`** — the Apps Script **writes `discovery_events` directly**, confirming the migration audit's finding independently and from a second source.
2. 🔴 **`Auto-Created & Geocoded New Venue from Screenshot`** — **it creates `venues` rows too.** That is new, and it means a second, unversioned venue creator exists alongside `run-scraper.js:1833`.
3. **No message in 19 hours mentions deleting, pruning or de-duplicating anything** except `File trashed`, which refers to a Google Drive file.
4. ⚠️ **The Logs tab covers 19 hours and is rotated, so it cannot prove the absence of a deleter.** It is consistent with the pruner being unlogged, or run on a separate trigger, or done by hand.

**Conclusion for §2, stated as the finding it is:**

🔴 **THE DUPLICATE AND OLD-EVENT RULES CANNOT BE FOUND. They are not in this repository — six independent sweeps across every extension found nothing — and the database's own contents prove they have never run against Supabase. A rule that prunes past rows from the Sheet's Events tab demonstrably exists and its author is an Apps Script project outside this repository that also writes `discovery_events` and `venues`. Its predicate, its schedule and its code are unread and unreadable from here. That is an undocumented deleter nobody can name, and it is the finding.**

**To read it:** open the Sheet → Extensions → Apps Script, and read the project's triggers and its `Events`-tab handler. Nothing in this repository can substitute for that.

---

## 3. CAN EITHER RULE EXPLAIN THE TWO EVENTS?

**No — and neither event needs a deleter, because neither was a deletion.**

### 3.1 The PMF rows: 5 were never inserted

🔎 All three chunks of the pack end `ON CONFLICT (event_date, truck_name, venue_name) DO NOTHING` (`01-chunk-1.sql:20`, `02-chunk-2.sql:19`, `03-chunk-3.sql:21`), with the header *"ON CONFLICT DO NOTHING on the natural key makes a re-run a no-op, never a duplicate."*

▶ Every `Pimp My FIsh` row dated 8–12 September in the database today, with `created_at`:

| Date | Venue | `source` | created |
|---|---|---|---|
| 09-08 | Mandeville Hall | `URL: https://order.pimp-my-fish.co.uk/basket/new \| S…` | **10:51:55** |
| 09-09 | Great Shelford Memorial Hall | `URL: …` | **10:51:55** |
| 09-09 | Great Abington Post Office | `URL: …` | **10:51:55** |
| 09-10 | Great Bradley village hall | `Manual entry 2026-09-07: …` | 10:52:04 |
| 09-10 | Affleck Arms | `Manual entry 2026-09-07: …` | 10:52:04 |
| 09-11 | FoodPark CB1 | `Manual entry 2026-09-07: …` | 10:52:04 |
| 09-11 | King Bill IV Pub | `Manual entry 2026-09-07: …` | 10:52:12 |
| 09-11 | Fordham British Legion | `URL: …` | **10:52:12** |
| 09-12 | Wylde Skye | `URL: …` | **10:52:12** |

🔴 **All nine events exist. Five of them carry the `URL:` source because a row with that exact `(event_date, truck_name, venue_name)` was already there when the pack ran, so `DO NOTHING` skipped the manual insert.** The five "missing" rows are the five with `URL:` sources, and they are the same five events.

🔎 The pack's own `00-verify-before.sql:9-16` contains the check that would have caught this — *"None of the nine may already exist on the unique key. Expect 0 rows."* ⚠️ Either it was not run, or it returned 5 and the delta was not reconciled afterwards. **The fault is a skipped pre-check, not a deletion.**

⚠️ **This also corrects `docs/sheet-migration-audit-report.md`**, which recorded *"9 were inserted, 4 remain — 5 were deleted by something since"* (§10). **Nothing was deleted. 4 were inserted, 5 were refused.**

*If this proved nothing:* identical `created_at` timestamps could be coincidence, or the `URL:` rows could have been written *after* a deletion. Ruled out on ordering — the three `URL:` rows at **10:51:55** predate the first `Manual entry` insert at **10:52:04** by nine seconds, so they were present when the pack ran; and ▶ `updated_at` equals `created_at` on all 4,283 rows, so no row was rewritten afterwards.

### 3.2 The 16 venues: a hand-run merge of exactly the CERTAIN tier

▶ Tested against `docs/venue-consolidation-report.md`'s own proposal list (`:278-296`):

| Test | Result |
|---|---|
| The 16 CERTAIN **losers** still present | **0 of 16** |
| The 15 CERTAIN **keepers** still present | **15 of 15** |
| 10 sampled **PROBABLE**-tier losers still present | **10 of 10** — none missing |
| Events pointing at a CERTAIN **loser** id | **0** |
| Events pointing at a CERTAIN **keeper** id | **125** — exactly the "blast radius" the report predicted |

🔴 **The 125 events were repointed, not orphaned.** The FK is `ON DELETE SET NULL` (§1.2), so a bare `DELETE FROM venues` would have left those 125 rows with `venue_id = NULL`. They are attached to the keepers instead. **An `UPDATE discovery_events SET venue_id = <keeper>` ran before the `DELETE`.** That is a two-statement merge, executed deliberately, matching one specific tier of one specific report — 15 merges, 16 losers, because set 1 drops two.

**No rule did this. No code path in this repository can do this** — ▶ there is no `DELETE FROM venues` outside a commented-out line in an unrun rollback, and ▶ the only `UPDATE … SET venue_id` sites are `scripts/backfill-venue-id.ts`, `scripts/backfill-venue-id-low.ts` and `scripts/reresolve-event-venues.ts`, none of which deletes anything.

*If this proved nothing:* a deleter that happened to select 16 rows could coincide with the list. Ruled out by three independent facts — the keepers all survived, the PROBABLE tier was untouched, and the repointing requires an `UPDATE` no automatic deleter would issue. A rule cannot know which row is the keeper.

⚠️ **The 574 → 558 arithmetic is exact, and it also fixes a stale number:** `docs/venue-consolidation-report.md` was written against 574; the migration audit later recorded 558 and flagged the difference as unexplained. It is the merge.

### 3.3 Would either §2 rule have selected those rows?

Stated plainly, without reaching for a fit:

- **An "old events" rule** would not have selected the PMF rows: every one is dated **8–12 September 2026, in the future**. It could not select them under any retention predicate.
- **A "duplicate events" rule** would not have selected them either: after the pack ran, the nine `(date, truck, venue)` keys were **distinct**, so none was a duplicate of another. And a duplicate-remover keeping one of a pair would have left a *different* source distribution than the timestamp ordering shows.
- **Neither rule can touch `venues` at all** — both are described as event rules, and no venue rule of any kind is evidenced anywhere.

---

## 4. WHAT IS UNRECOVERABLE

| Path | Logged? | Recoverable? |
|---|---|---|
| The 16 merged venues | ❌ **Nothing.** No audit table, no soft-delete column, no `deleted_at`; ▶ `venues` has no such column. The Supabase Postgres log retains statements only for its retention window. | ⚠️ **Partly.** `docs/venue-consolidation-report.md` records the 16 loser **ids** and their keepers, and the earlier venue reports hold names and coordinates for some. **The rows themselves are gone and the ids cannot be reissued.** |
| The PMF "missing" 5 | n/a | ✅ **Nothing was lost** — all five events are present under the `URL:` source. |
| `scraper_run_log` prune (`:1274`) | ▶ logs `✅ scraper_run_log pruned to 90 days` to stdout, i.e. to a GitHub Actions run log with its own retention | ❌ not recoverable, by design |
| The Sheet Events-tab pruner | ❌ nothing in the Logs tab (§2.4) | ❌ **and the DB is the backup here** — the DB keeps all 3,577 past rows the Sheet has dropped |

### 4.1 🔴 Why a re-run does not undo a wrong venue delete

🔎 `scripts/run-scraper.js:1833`:
```js
await supabase.from('venues').upsert({ name, village, latitude, longitude, postcode },
  { onConflict: 'name,village', ignoreDuplicates: true });
```
`ignoreDuplicates: true` ⇒ `ON CONFLICT DO NOTHING`. **The row does come back** if a scraped event names that venue again — there is no conflict once it is deleted, so the insert succeeds. 🔴 **But it comes back with whatever coordinates the scraper resolves, and any hand-applied correction is permanently lost, because a later run can never overwrite an existing row.** For the 16 merged venues that is the intended outcome; for a wrong delete it is silent data loss that looks like success.

⚠️ **V1.1 records `ignoreDuplicates: true` as "retained deliberately, meaning a re-run never restores a wrong delete." That is half right and the half it gets wrong matters:** a re-run *does* restore the **row**; what it never restores is the **corrected coordinate**. The manual should say the second thing.

---

## 5. THE TOMBSTONE CONSEQUENCE

**The loop the question describes would not exist, because the rule half of it does not exist.**

A delete/re-insert loop needs two things: something that deletes duplicates, and a dedup set that re-inserts them. §2 establishes that **no duplicate-deleting rule acts on `discovery_events`** — not in the repo, and never in the table's history. So after step 4 of the migration plan there is no automatic loop.

**What does change at step 4, measured:**

Today the dedup set is the Sheet, and the Sheet is not updated when a DB row is deleted — which is precisely why hand-deleted rows have stayed deleted. ▶ Six such rows exist right now: rows present in the Sheet's Events tab and absent from `discovery_events`, all dated **2026-09-10**:

```
Buffalo Joe's      @ Off The Beaten Truck - The Railway Arms
Guerrilla Kitchen  @ Off The Beaten Truck - The Railway Arms
Nomadough          @ Off The Beaten Truck - The Railway Arms
Pizza Mondo        @ Off The Beaten Truck - The Railway Arms
Tikka Tonic        @ Off The Beaten Truck - The Railway Arms
Buffalo Joe's      @ Saffron Walden (The Common)
```

🔴 **Those six are the Hatches-Up comparison deletions, and they are held down only by the Sheet. After step 4 they return on the next scrape that sees them.** Deleting them again achieves nothing; they return again. **That is the loop — and its engine is a human, not a rule.** It is a tombstone requirement, exactly as the audit stated.

⚠️ **This corrects `docs/sheet-migration-audit-report.md` §4**, which attributed these six rows to *Elder Street Food*. That was wrong — ▶ Elder Street Food has 12 future rows in the database including every date the audit listed as missing. The six are the trucks named above.

The other three Sheet-only rows are **not** deletions: ▶ `Pimp My FIsh` at `The Affleck Arms` / `foodPark` / `King Bill IV Pub, Histon` in the Sheet are the same three events the database holds as `Affleck Arms` / `FoodPark CB1` / `King Bill IV Pub` — hand-normalised venue names, not missing rows. ⚠️ **After step 4 these will look like three new events to a DB-sourced dedup set unless the fuzzy venue match catches the rename**, which is a second, separate risk at step 4 that the audit did not name.

**And one loop that step 4 removes:** ▶ three `hg_scraper` rows (Pass B, DB-only) are invisible to today's Sheet-based dedup, so Pass A can duplicate them under a different venue string. A DB-sourced set makes them visible. **Step 4 is net positive for duplication; its cost is entirely the tombstone.**

---

## 6. `excluded_terms` — the scraper's write cannot ever succeed

### 6.1 The live shape

▶ Read from the **live** schema (PostgREST OpenAPI, not a migration file):

```
excluded_terms: columns = id, truck_id, term, created_at
                required (NOT NULL, no default) = ["id","truck_id","term","created_at"]
                foreign keys = truck_id → trucks.id
                row count = 0
```

🔎 The live shape is `supabase/migrations/20260604_exclusion_terms.sql`, which **replaces** the original:
```sql
drop table if exists excluded_terms cascade;          -- :1
create table excluded_terms (
  truck_id text not null references trucks(id) on delete cascade,   -- :5
  term text not null,                                               -- :6
  unique(truck_id, term)                                            -- :8
);
alter table excluded_terms enable row level security;               -- :14
```
It supersedes `20260522_discovery_schema.sql:94-98`, which had `term text not null unique` and **no `truck_id` at all**. ⚠️ **Anyone reading only the schema migration would conclude the scraper's `onConflict: 'term'` is correct. It was — until 4 June.**

### 6.2 What the scraper supplies

🔎 `scripts/run-scraper.js:792-794`:
```js
const { error: exErr } = await supabase.from('excluded_terms').upsert({
  term: ex,
}, { onConflict: 'term', ignoreDuplicates: true });
```

🔴 **It supplies no `truck_id` at all.** So every attempt fails, and it fails twice over:

1. `onConflict: 'term'` names a unique constraint that **no longer exists** → `42P10 there is no unique or exclusion constraint matching the ON CONFLICT specification`.
2. Even without that, `truck_id` is **NOT NULL** → `23502 null value in column "truck_id" violates not-null constraint`.

▶ **0 rows, and the count has never been anything else.**

### 6.3 The premise in the question is wrong, and the difference matters

The question supposes: *"If it is null, nulls are distinct in a unique index, so the constraint cannot dedupe and every run inserts afresh — the same family of fault as `onConflict: 'name'`."*

🔴 **That is not what happens here, and the distinction is the whole point.** `truck_id` is `NOT NULL`, so a null is not *stored as a distinct value* — it is **refused**. This is the opposite failure mode from `onConflict: 'name'`:

| | `venues` `onConflict:'name,village'` | `excluded_terms` `onConflict:'term'` |
|---|---|---|
| Failure | wrong row silently **kept** | insert **rejected outright** |
| Visible? | ❌ invisible — looked like success for three months | ✅ every run pushes an error into `dbWriteFailures` (🔎 `:795`) |
| Result | 345 divergent venues | 0 rows, and a loud message |

**The scraper's exclusion mirror has been failing loudly since 4 June 2026 and the failure was routed to `dbWriteFailures` rather than being read.** It is a broken write, not a silent-duplicate fault.

### 6.4 The manage route, and whether the two features can share the table

🔎 `app/api/manage/route.ts:2171-2173`:
```js
const { data: upserted } = await supabase.from('excluded_terms').upsert(
  { truck_id: truck.id, term: normalised },
  { onConflict: 'truck_id,term' }
).select('id').single()
```
Also 🔎 `:2160-2163` reads `select('id, term, created_at').eq('truck_id', truck.id)`, and `:2180` deletes `.eq('id', id).eq('truck_id', truck.id)`. **The operator feature is correct and matches the live constraint exactly.**

🔴 **The two features cannot share this table as it stands, and the obstacle is semantic, not technical.**

- The operator feature means *"this **truck** does not want this term"* — every row is owned by a truck, scoped by `truck_id`, and its RLS and its `on delete cascade` both assume that ownership.
- The scraper's exclusion set means *"this string is **not a food truck** at all"* — it is global. ▶ The Sheet's Exclusions tab holds 146 such terms (`TBC`, `live music`, `quiz nights`, `Ram Inn Karaoke`), and 🔎 the scraper applies them globally at `:851`, `isFuzzyMatch(ex, normRawTruck)` across every extracted name.

**A global term has no `truck_id` to put in a `NOT NULL` column.** Any shared-table scheme needs a sentinel truck row or a nullable `truck_id` with a partial unique index — and a nullable `truck_id` reintroduces exactly the nulls-are-distinct fault the question describes, this time for real. ⚠️ **Two tables, or one table with an explicit scope column, is the only shape that works — but this pass proposes nothing.**

---

## 7. FOR THE SCRAPER MANUAL — PASTE-READY

> ## Deletion and retention — what removes rows, and what does not
>
> **Verified 8 September 2026 against the live schema and the live row set.**
>
> ### Nothing in this repository deletes from `discovery_events`, `discovery_trucks` or `venues`.
> Six independent sweeps across **every file extension** (`.js` included — `run-scraper.js` is `.js`) found no `.delete()`, no `DELETE FROM`, no `TRUNCATE`, no `method:'DELETE'` and no `.rpc()` that removes a row from any of the three. The only `DELETE FROM` statements naming them are two **rollback runbooks** under the untracked `docs/sql/`, and neither has been run.
>
> ### No cascade can delete one either.
> Complete list of FKs pointing in: `discovery_events.venue_id` → `venues` (**SET NULL**), `discovery_events.discovery_truck_id` → `discovery_trucks` (**SET NULL**), `truck_events.venue_id` → `venues` (**SET NULL**), `outreach_prospects.discovery_truck_id` → `discovery_trucks` (**NO ACTION — it blocks the delete**). **Nothing references `discovery_events` at all.** Deleting an operator truck sets `discovery_trucks.hatchgrab_truck_id` to null and deletes nothing.
>
> ### There is no old-event rule and no duplicate rule on the database.
> `discovery_events` holds **3,577 rows dated before today, oldest 2026-05-22** — every past event ever written. **0** duplicates exist on `(event_date, truck_name, venue_name)`, and that is because the unique index refuses them at insert, not because anything removes them.
>
> ### The pruning that does exist acts on the Google Sheet, and it is outside this repository.
> The Sheet's **Events** tab holds **713 rows, all future, none past** — while the DB holds 3,577 past ones. The scraper only appends to that tab. 🔴 **An Apps Script project outside this repo prunes it, and because `existingEvents` (`run-scraper.js:466-472`) is built from that tab, that pruner defines the dedup window.** The same project also writes `discovery_events` (`"Mirrored N event(s) to Supabase"`) and **creates `venues`** (`"Auto-Created & Geocoded New Venue from Screenshot"`) — both observed in the Sheet's Logs tab. **Its code, predicate and schedule are unread. Read it at Extensions → Apps Script.**
>
> ### The one scheduled delete in the pipeline
> `run-scraper.js:1268-1274` `pruneScraperRunLog()` — `delete from scraper_run_log where run_at < now() - 90 days`, called at `:1641` on every run. **Not one of the three tables.**
>
> ### `ignoreDuplicates: true` and a deleted venue
> `venues` upsert (`:1833`) is `ON CONFLICT DO NOTHING`. After a venue is deleted, a later scrape **does** recreate the row — but with the scraper's own geocode. **Any hand-applied coordinate correction is permanently lost, and the run reports success.**
>
> ### `excluded_terms` — the scraper's write has been failing since 4 June 2026
> The live table is `truck_id text NOT NULL references trucks(id)`, `unique(truck_id, term)` (`20260604_exclusion_terms.sql`, which **dropped and replaced** the `term unique` version in `20260522_discovery_schema.sql`). The scraper (`:792`) supplies `{ term }` only with `onConflict:'term'` — **42P10 on the missing constraint, 23502 on the NOT NULL**. **0 rows, always.** The operator feature (`app/api/manage/route.ts:2171`) supplies `{ truck_id, term }` with `onConflict:'truck_id,term'` and is correct. The scraper's terms are **global** ("live music", "TBC") and have no truck to own them; the two features cannot share this table without a scope column or a sentinel row.

---

## 8. WHAT REMAINS UNKNOWN — stated, not papered over

- 🔴 **The Apps Script's code.** Its triggers, its Events-tab predicate, whether it deletes from Supabase as well as writing to it. Unreadable from this repository; a grep here proves nothing about it. **Read it in the Sheet.**
- 🔴 **Whether a `pg_cron` job or a database trigger exists that no migration file records.** `cron.job` and `pg_trigger` are not reachable through PostgREST. **One SQL query in the Supabase editor settles it:** `select * from cron.job;` and `select tgname, tgrelid::regclass from pg_trigger where not tgisinternal;`
- ⚠️ **Whether RLS is enabled on the three tables in production**, and what policies exist. No policy in this repo grants delete on them.
- ⚠️ **The Logs tab covers 19 hours and rotates**, so it cannot prove no deletion happened before 2026-09-07 16:43.
- ⚠️ **Postgres statement logs** would name the session that ran the venue merge and the PMF pack. Not read; available in the Supabase dashboard within its retention window.

---

## 9. STATE AT END

Row counts: `discovery_events` **4,283**, `venues` **558**, `discovery_trucks` **231** — **identical to START** (§0).

`git status --short`:

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
?? docs/deletion-rules-report.md
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
?? docs/pricing-suppression-report.md
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

**27 modified, 98 untracked (the 97 at START plus this report), 0 staged.** `HEAD = 801de1c`, `origin/main = 08ac368`, local ahead 1 with the previously-committed demo-layout change, still unpushed. Nothing was staged, committed, pushed or added by this pass.
