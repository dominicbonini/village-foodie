# `discovery_run_log` — migration recovered, verified against the writer, and the guard that never matched

**9 September 2026 · DIAGNOSIS AND RETRIEVAL ONLY.** 🔴 **NO CODE CHANGED. NO MIGRATION APPLIED. NO
DATABASE WRITE.** Nothing installed. Nothing staged or committed. The only file this task creates is this
report.

✅ **THE MIGRATION WAS FOUND, NOT RECONSTRUCTED.** It is on disk and tracked in git. **Nothing was rewritten
and no new SQL was authored.**

---

## 1. `git status`, verbatim, before any edit

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   app/api/admin/outreach/route.ts
	modified:   components/admin/OutreachPanel.tsx

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	docs/outreach-delete-guard-report.md
	docs/outreach-filter-ux-report.md
	docs/outreach-inline-edit-report.md
	docs/outreach-media-build-report.md
	docs/outreach-media-delete-report.md
	docs/outreach-media-report.md
	docs/outreach-modal-layout-report.md
	docs/outreach-table-report.md
	lib/outreach-filter.ts
```

---

## 2. THE FILE — FOUND, INTACT, UNCHANGED

| | |
|---|---|
| path | `supabase/migrations/20260907_discovery_run_log.sql` |
| 🧪 **byte count, re-derived three ways** | `wc -c` **5469** · `stat %z` **5469** · `len(open(…,'rb').read())` **5469** |
| manual's recorded figure | **5,469** ✅ **matches exactly** |
| mtime | 07 Sep 2026 11:59 ✅ matches |
| lines | 88 |
| sha256 | `5c091b03c68a02a598729b80e1a961c9ad3e606d97ed78a21bc8e90e096b8586` |
| tracked in git | ✅ yes — added in **`6fe8634` "landing and SEO"** |
| 🧪 `git diff` against HEAD | **empty — the working copy is byte-identical to the committed version** |
| 🧪 stash | empty; no recovery needed |

**It is the original. It was written and simply never run.** The SQL is reproduced verbatim in §7 — I have
not edited a character of it.

---

## 3. 🔴 THE MIGRATION vs THE WRITER — COLUMN BY COLUMN

🔎 **One insert site only:** `scripts/run-scraper.js:1081`, inside `logDiscoverySite(row)`. 🧪 A repo-wide
sweep (no extension scoping) finds `discovery_run_log` in exactly **two files** — the migration and the
scraper.

Both sides were **extracted programmatically** — the writer's keys from the insert object, the columns from
the `create table` body — and compared. **This is the comparison, not a claim that they agree:**

| column | sent by the writer | in SQL | type | NOT NULL | verdict |
|---|---|---|---|---|---|
| `run_id` | `DISCOVERY_RUN_ID` | yes | uuid | **yes** | ok — a `randomUUID()`, never null |
| `site_name` | `row.siteName` | yes | text | **yes** | ok — no `?? null` fallback |
| `source_type` | `row.sourceType ?? null` | yes | text | no | ok |
| `url` | `row.url ?? null` | yes | text | no | ok |
| `strategy` | `row.strategy ?? null` | yes | text | no | ok |
| `outcome` | `row.outcome` | yes | text | **yes** | ok — see below |
| `page_chars` | `row.pageChars ?? null` | yes | integer | no | ok |
| `events_extracted` | `row.extracted ?? null` | yes | integer | no | ok |
| `events_filtered` | `row.filtered ?? null` | yes | integer | no | ok |
| `events_new` | `row.newCount ?? null` | yes | integer | no | ok |
| `duplicates` | `row.duplicates ?? null` | yes | integer | no | ok |
| `error` | `row.error ? String(row.error).slice(0,500) : null` | yes | text | no | ok — `text` is unbounded, so the 500-char truncation cannot overflow it |
| `notes` | `row.notes ?? null` | yes | text | no | ok |

**Writer sends 13 columns; the SQL defines 15.** The two it does not send are safe:

| column | notnull | default | verdict |
|---|---|---|---|
| `id` | — | `gen_random_uuid()` | ok — defaulted |
| `run_at` | yes | `now()` | ok — **NOT NULL but defaulted**, so omitting it is fine |

🔴 **The `outcome` NOT NULL is the one that could have bitten, and it does not.** It is the only required
column sent without a `?? null` fallback, so an absent value would be a `23502` violation on every row.
🔎 It cannot be absent: `siteLog` is initialised at `run-scraper.js:1132-1135` with
**`outcome: 'site_error'`** and is only ever overwritten with `'manual'`, `'empty_page'`, `'ok'` or
`'ai_error'`. **The default is the pessimistic one**, so a path that fell over before setting it still
writes a truthful row.

### 3.1 The check the column comparison would NOT have caught

⚠️ **Matching columns is not sufficient for the insert to succeed.** The migration is service-role-only:

```sql
alter table public.discovery_run_log enable row level security;
create policy "service_role only" … for all to service_role using (true) with check (true);
revoke all on public.discovery_run_log from anon, authenticated, public;
```

🔎 The scraper's client is `createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`
(`run-scraper.js:23-26`), and 🔎 `.github/workflows/daily_scrape.yml:52` passes
`SUPABASE_SERVICE_ROLE_KEY`. ✅ **The writer holds the one role the policy admits.** Had it used the anon
key, every column would still have matched and every insert would still have failed.

**🔴 VERDICT: applying this file as-is should turn the run green. Every column the writer names exists,
no NOT NULL column can receive null, and the writer's role is the one the policy grants.**

---

## 4. 🔴 THE ERROR-CODE MISMATCH — CONFIRMED

### 4.1 (a) Exactly which code the guard tests

🔎 `scripts/run-scraper.js:1097`:

```js
if (error.code === '42P01') {
```

**One code, exact string equality, no fallback.** The comment above it (`:1075`) states the intent:
*"ONE tolerated failure, and only one: 42P01 (relation does not exist), because migrations here are applied
BY HAND and the code may deploy first."*

✅ **Your account is correct, and the manual's wording is correct about the code while wrong about the
consequence.** PostgREST answers a missing table with **`PGRST205`** ("Could not find the table
'public.discovery_run_log' in the schema cache"), not the Postgres code `42P01`. `'PGRST205' === '42P01'`
is false, so the carve-out never fired, execution fell through to `:1104`
`dbWriteFailures.push(...)`, and `assertNoWriteFailures` threw at the end of `main`.

⚠️ **So the survivable-warning design is real in the source and inert in practice.** The manual's §15 line —
*"warns once on 42P01 and continues… designed to be survivable"* — describes a guard that has never once
matched. **A thing being present is not the same as it being able to take effect.**

### 4.2 (b) The sweep — every other site

🧪 Swept every file (no extension scoping; `node_modules`, `.next`, `.git`, `docs` excluded) for `42P01`
and `PGRST`. **How I distinguished a true negative from a failed grep:** the same sweep returned **34
matches across 24 files** and its exit code was **0**; a control grep for `discovery_run_log` returned
**2 files**. A grep that errored would have exited **2** and a true negative **1**. Both were checked.

🔴 **EXECUTING guards comparing an error code — the whole repo:**

| site | code tested | same mistake? |
|---|---|---|
| 🔴 `scripts/run-scraper.js:1097` | `'42P01'` | **YES — the one in question** |
| `app/api/dashboard/action/route.ts:1616` | `'23505'` (unique violation) | no — a real Postgres code |
| `app/api/manage/whatsapp-signup/route.ts:386` | `'23505'` | no |
| `lib/provision-truck.ts:508` | `'23505'` | no |
| `lib/payments/ledger.ts:522`, `:599` | `'23514'`, `'23505'` | no |
| `app/api/dashboard/action/route.ts:219` | `.startsWith('22')` (data exceptions) | no |
| `app/admin/page.tsx`, `create-truck/route.ts` | application-defined strings | no |

✅ **`scripts/run-scraper.js:1097` is the ONLY executing 42P01 guard in the repository.**

⚠️ **But the same ASSUMPTION is written down in two more places, and would reproduce the bug if acted on:**

- 🔎 `lib/payments/order-drafts.ts:36` — *"PostgREST answers a named select on a missing relation with
  42P01 and fails the whole statement."* **Not executing** — the header itself says *"Nothing calls it
  today, so today it is inert"* — but it is the belief, sitting in a file whose whole purpose is deploy
  coupling.
- 🔎 `supabase/migrations/20260812_order_drafts.sql:11` — the same sentence.

🔴 **AND THE CORRECT KNOWLEDGE ALREADY EXISTS IN THIS REPO, IN QUANTITY.** 🧪 At least **five** migrations
document the right code for a missing table:
`20260729_order_payments_ledger.sql:7`, `20260729_action_audit_log.sql:7`,
`20260807_stripe_webhook_events.sql:8`, `20260728_device_notification_prefs.sql:5`,
`20260730_truck_events_takes_cash_override.sql:8` — each saying **PostgREST returns PGRST205 for a table it
cannot see**. **The scraper's guard is the outlier, not the house view.**

**I have changed nothing. The choice between survivable-warning and red-on-failure is yours** — §6 sets out
what each would cost.

---

## 5. CARDINALITY — ONE ROW PER SITE, PER RUN

🔎 **Intended and actual are the same: one row per (run_id, site_name).** The migration's own header states
the design — *"attempted and found nothing → a row exists for that (run_id, site_name) with
events_extracted = 0; never attempted → NO ROW for that site under the latest run_id"* — and the index
`discovery_run_log_run (run_id, site_name)` is built for exactly that anti-join.

🔎 The writer is called **once per site**, from the per-site `finally` at `run-scraper.js:1600`:
*"AWAITED, and in `finally` so no exit path can skip it — an absent row must mean 'never attempted', which
is only true if every attempted site writes one."* **One call site; no batching.**

🧪 **Re-derived rather than taken from the failure count.** Rebuilding the DB-side site list with the
scraper's own rule (a truck enters if it has `schedule_url || website` or >10 chars of `ai_instructions`;
a venue only if its `schedule_url` starts with `http`; one entry **per comma-separated strategy**):

| source | entries |
|---|---|
| `discovery_trucks` | **109** |
| `venues` | **7** |
| **total** | 🧪 **116** |

✅ **116 — exactly the number of failures this morning.** ⚠️ The 06:00 run reads the **Sheet** by default,
which I cannot read from here; this is the DB-side equivalent, and the manual records the two lists
differing by a couple of entries. **That it lands on 116 independently is corroboration, not proof of
identity.**

**Cost of a green run: ~116 rows/day → ~42,340 rows/year**, one run/day on `daily_scrape.yml`. ⚠️ There is
**no retention or pruning** in the migration — worth a decision, not a defect.

### 5.1 The scrape itself, re-derived

🧪 `discovery_events` created today: **39** ✅ · `venues`: **815** ✅ (up one from 814) ·
`discovery_events` total: **4,339**. **The scrape worked. The only thing that failed was recording that it
worked.**

---

## 6. WHAT THE TWO CHOICES COST (stated, not chosen)

- **Survivable warning** (fix the guard to match `PGRST205`, or both codes): the run goes green today
  without applying anything, and the run log stays empty. ⚠️ **Which is the state you have been in since
  7 September without noticing** — the manual already flagged that *"a survivable warning is one that is
  easy to stop noticing."*
- **Red on failure** (leave the guard as it is, apply the migration): today's red run becomes green because
  the table exists, and any *future* run-log failure is loud. ⚠️ Cost: a run-log outage fails a scrape that
  otherwise succeeded — which is precisely what happened this morning.

⚠️ **These are not exclusive.** Applying the migration fixes today either way; the guard only decides what
happens the *next* time the table is unreachable.

---

## 7. THE ORIGINAL SQL, VERBATIM

🔴 **Recovered, not authored. Not one character changed. 5,469 bytes, sha256 `5c091b03…6b8586`.**

```sql
-- 20260907_discovery_run_log.sql
-- Per-site run log for the DISCOVERY pass (Pass A) of scripts/run-scraper.js.
--
-- ⛔ NOT APPLIED. Run by hand in the Supabase SQL editor. Idempotent (`if not exists`).
--    After applying: `notify pgrst, 'reload schema';` (last line).
--
-- ── 🔴 WHY THIS EXISTS ──────────────────────────────────────────────────────────────────────────────
-- Pass B (the three HatchGrab operator trucks) writes `scraper_run_log`. Pass A — the ~95 URL-scraped
-- discovery trucks that produce the public map — writes NOTHING. Every per-site failure is caught,
-- printed to stdout in a GitHub Actions log nobody reads, and skipped.
--
-- The cost, measured 7 September 2026: 51 URL-scraped trucks have ZERO future events, and there is no
-- way to tell an idle truck from a broken one. Pimp My Fish sat at zero for six days and was found only
-- because the operator happened to look at the map.
--
-- ── 🔴 THE ONE DISTINCTION THIS TABLE EXISTS TO MAKE ────────────────────────────────────────────────
-- ZERO-FOUND must be distinguishable from NEVER-ATTEMPTED. That is structural here, not a flag:
--   • attempted and found nothing  → a row exists for that (run_id, site_name) with events_extracted = 0
--   • never attempted              → NO ROW for that site under the latest run_id
-- So "which sites did this run skip entirely?" is an anti-join against the previous run, and
-- "which sites are being read but yield nothing?" is a filter. Neither question is answerable today.
--
-- Shaped to read like `scraper_run_log` (20260604_scraper_adaptive.sql): a `run_at`, a per-subject key,
-- counters, and a free-text `notes`. It is a SEPARATE table because the subject is different — Pass A
-- keys on a SHEET ROW (a name + a URL + a strategy), not on `trucks.id`, and most discovery sites have
-- no `trucks` row at all, so the existing FK could not hold them.

set lock_timeout = '3s';

begin;

create table if not exists public.discovery_run_log (
  id                uuid primary key default gen_random_uuid(),

  -- One id per invocation of the scraper, so a whole run can be selected, compared with the previous
  -- run, and anti-joined to find sites that vanished from the Sheet.
  run_id            uuid        not null,
  run_at            timestamptz not null default now(),

  -- The Sheet row this attempt came from. NOT a foreign key: the site list lives in the Google Sheet,
  -- and a name here may have no `discovery_trucks` row (a brand-new truck) or no `trucks` row at all.
  site_name         text        not null,
  source_type       text,                     -- 'truck' | 'venue' (which tab the row came from)
  url               text,
  strategy          text,

  -- 🔴 THE OUTCOME VOCABULARY. Fixed strings so a query can group on them; a CHECK is deliberately
  -- omitted (V12.1: PostgREST cannot expose a CHECK to a UI, and an unknown future outcome must be
  -- storable rather than fatal).
  --   'ok'            — page read, AI returned, events extracted (may still be 0 after filtering)
  --   'empty_page'    — page text below the 50-character floor; nothing to send to the model
  --   'ai_error'      — Gemini failed or returned unparseable JSON after its retries
  --   'site_error'    — anything thrown for this site (navigation, browser, unexpected)
  --   'manual'        — a manual/manual_single row: no page load by design
  outcome           text        not null,

  page_chars        integer,                  -- length of the text handed to the model
  events_extracted  integer,                  -- what the model returned, before our filters
  events_filtered   integer,                  -- dropped by the historical/exclusion/private filters
  events_new        integer,                  -- appended after dedup — what actually reached the Sheet
  duplicates        integer,                  -- suppressed by dedup against the Events tab

  error             text,                     -- message, truncated by the writer
  notes             text
);

-- "How has this site behaved lately?" — the alert query's access path.
create index if not exists discovery_run_log_site_run
  on public.discovery_run_log (site_name, run_at desc);

-- "What did run X do?" and the previous-run anti-join.
create index if not exists discovery_run_log_run
  on public.discovery_run_log (run_id, site_name);

-- ── RLS + GRANTS — SERVICE ROLE ONLY ────────────────────────────────────────────────────────────────
-- Same three defences as every other operational table here: RLS on, one service-role policy, and the
-- default anon/authenticated grants REVOKED (enabling RLS alone leaves the capability in place).
alter table public.discovery_run_log enable row level security;

drop policy if exists "service_role only" on public.discovery_run_log;
create policy "service_role only" on public.discovery_run_log
  for all to service_role using (true) with check (true);

revoke all on public.discovery_run_log from anon, authenticated, public;

commit;

notify pgrst, 'reload schema';
```

---

## 8. EVIDENCE CLASS

- ✅ **Executed:** the byte count (three independent methods), the sha256, `git diff`/`git log`/`git stash`,
  the 116-entry site-list rebuild, today's row counts, and the repo-wide sweeps with their exit codes
  checked.
- ✅ **Structural, extracted from source:** the column-by-column table in §3 (both sides parsed
  programmatically, not transcribed), the single insert site, the `finally` placement, the `outcome`
  default, the service-role client and workflow secret.
- 🔴 **NOT verified, and cannot be from here:** that applying the migration actually turns the run green.
  **No migration was applied, no write attempted, and the scraper was not run.** The claim in §3 is that
  the SQL satisfies every constraint the writer's insert imposes — **which is a strong prediction, not an
  observation.**
- ⚠️ **The Sheet was not read**, so §5's 116 is the DB-side list, not the list the 06:00 run used.
