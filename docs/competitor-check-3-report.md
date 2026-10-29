# competitor-check-3 — report

**29 October 2026.** Written for Dominic.

- Nothing was committed, pushed or deployed.
- No database change was run. Only the read-only queries in §8 were used.
- **No real Claude API call was made:** every proof uses fixtures.
- No `.env*` file was opened, no `outreach_templates` row was touched, and no live truck was used.

**Nothing in the brief arrived garbled, and I found no instruction that contradicts another.** Three things to know:
- **The batch path:**
  - competitor-check-1's STEP 0a recorded that Message Batches supports the web fetch and web search tools ("Tool use,
    including all server tools (web search, web fetch, code execution …)"), so **the pass runs through the Batch API**.
  - A dry run, or a checker built without the batch API, runs the same checks one by one.
  - The Claude API reference confirms 50% off tokens, results within 24 hours (most within one hour), and custom IDs that
    must be unique per batch.
- **Prompt caching** is on for the system prompt and the country's feature list, the stable prefix. But the cached prefix
  starts with the tool definitions, and each competitor's tools carry its own `allowed_domains`, so the cache can only
  hit within one competitor's requests, never across competitors. I kept the domain lock, because it is what keeps every
  read on the competitor's own site. Haiku 5.5's 512-token minimum is met.
- **Haiku has no refusal fallback, and batches reject the parameter,** so the checker now sends the fallback only for the
  Sonnet, Opus and Fable models.

## 1 · The quick pass (new mode `pass`)

**Coverage** (`lib/competitor-check/core.ts`, `passItems`):
- every **active** competitor × each of its countries:
  - its current plans' countries;
  - the countries recorded for a candidate or a POS player;
  - minus `not_in_countries`;
- country by country in the deep-check queue's order, from the picked country onwards (or all of them);
- each **candidate** first gets **one classification read**: one page, no search, no features. Only a relevant candidate
  (food-truck or restaurant ordering, or a POS player) then gets its checks. For the rest, the "not relevant"
  classification finding waits for you to accept.

**What a check reads** (`lib/competitor-check/pass.ts`, `passRequest`; the prompts in `prompts.ts`):
- each plan's price and fees, the card rate, new and gone plans, the minimum term, the set-up fee and the free trial;
- **only the features shown on that country's comparison page** (`show_scope` `all`, or `some` naming it). A hidden
  feature is never asked, and neither is a price row that is read from the plans;
- one "not sold here" availability finding, when that applies.

**Settings** (§7, NOT RUN):
- `pass_extractor_model` / `pass_verifier_model` (default `claude-haiku-5-5`);
- `pass_per_day` (40), `pass_requested_at`, `pass_country`;
- `pass_max_fetches` (3), `pass_max_searches` (1), `pass_max_page_tokens` (6000);
- `pass_batch` (the batch in flight).

`extractor_model` / `verifier_model` stay the deep check's.

**Hard limits per check:**
- `max_uses` 3 pages and 1 search;
- `max_content_tokens` 6,000 per page;
- **no request reaches 100,000 input tokens:**
  - before sending, the worst case (prompt + every page at the cap + each search + output) must stay under 100,000;
    pages, then the search, are taken away until it does;
  - during a check, no further turn is sent once the next would come within 2,000 tokens of 100,000; the check fails and
    is retried later;
- at most three turns.

**The second check:**
- the quote check runs on every finding;
- **the verifier only on** prices, fees, plans, the minimum term, the trial, and feature answers that differ from what is
  stored (`needsSecondCheck`);
- the verifier is asked directly, at full price.

**Findings and resuming:** findings are written exactly as the routine and deep checks write them, and you accept each.
`competitors.pass_state` records the classification read and each country done, so a stopped pass resumes where it
stopped.

**The batch flow, nightly or on Run workflow:**
1. Collect the batch in flight, once it has ended:
   - each result becomes findings, at half the token price (the search fee in full);
   - an item that needs another turn continues directly;
   - an errored or expired item is left for the next share.
2. Submit the next share: as many checks as `pass_per_day` allows **and** the caps allow, at 1.5 × the per-check estimate.
3. The submitted estimate is reserved against today's spend, so the deep and routine shares that follow see less room.

**Order and caps:** in the nightly job the pass comes first, then the deep share, then the routine share. The daily and
monthly caps cover all three.

**Accepting pass findings:** an unchanged answer whose quote is found has no second check, so it is not counted among the
"confirmed unchanged by both checks". You accept those one by one.

## 2 · Admin › Automatic checks

- **Next to the country picker:** "Start quick pass" (all countries, or from the picked country onwards) and "Start deep
  check" (as before). Both need their SQL first, and say so.
- **The pass tile:** "Quick pass · N of M checks · about X a day · cost so far $Y · estimated total $Z", with "A batch of N
  is out — collected next run" or the date it should be done.
  - The cost is the pass runs' cost since the start.
  - The estimated total uses the measured cost per check once there is one, otherwise the estimate.
- **Settings** has a "Quick pass" section: both models, checks per day, pages, searches and page length, all validated.

## 3 · Tidy: 20261048

`supabase/migrations/20261048_comparison_features_data.sql` already has two self-contained statements with a CTE each,
and no temporary table. It is committed that way in `a21e868a`. The temporary-table version was never committed, and
Cursor's own text is in neither git history nor this conversation, so I can't diff against it. The repo file is the
rewrite. The read-only check after your run showed that what ran produced exactly the expected 219 rows. A harness test
now pins the file's shape.

## 4 · Files changed

| File | What |
|---|---|
| `supabase/migrations/20261049_competitor_check_3.sql` (new) | NOT RUN — §7 |
| `lib/competitor-check/pass.ts` (new) | the quick pass: requests with hard limits and caching, the batch and one-by-one paths, the second-check rule, resume |
| `lib/competitor-check/core.ts` | `passItems` / `passTargets` / `passProgress`, `PassState`, `scaleTokens` (batch pricing) |
| `lib/competitor-check/checker.ts` | mode `pass`; `converse` (seed from a batch result, input guard, fallback only where it applies); `rowsFrom` / `secondCheck` split out; the pass first in the nightly job; reserved batch estimate |
| `lib/competitor-check/prompts.ts` | the pass's cached feature block, competitor block and classification read; `CheckFeature` scope |
| `lib/competitor-check/store-supabase.ts` | pass settings (read tolerantly), `pass_state`, `setPassBatch`, features with scope |
| `lib/competitor-check/overview.ts` | the pass tile |
| `lib/admin/competitor-check-actions.ts`, `competitor-check-store.ts`, `app/api/admin/competitor-check/route.ts` | `start_pass`, pass settings validation, `pass_state` read |
| `components/admin/AutomaticChecks.tsx` | "Start quick pass", the tile, the Settings section |
| `scripts/competitor-check/main.ts`, `.github/workflows/competitor-check.yml` | `--mode pass`, the SDK's batch API (`client.beta.messages.batches`) |
| `scripts/competitor-check-1.cjs`, `scripts/_competitor-check-1-fixtures.cjs` | section 17 |

## 5 · Estimate of the full pass

The number of checks comes from read-only SQL (§8). Today:
- **155 competitor-country checks** for 132 active competitors (128 with a country);
- **70 candidate classification reads.**

Per-check cost uses fixture token counts at Haiku 5.5 prices: $0.10 / $0.50 per million tokens, $0.01 a search, batch
tokens at half price.

| | Per item | Items | × 1.2 (the measured overrun) |
|---|---|---|---|
| A check: batch read (30k in, 2.5k out, 3 pages, 1 search) + 4 second checks (14k in, 0.5k out each, full price) | $0.0187 | 155 | **$3.48** |
| A classification read (8k in, 0.3k out, 1 page) | $0.0005 | 70 | $0.04 |
| **Full pass today** | | 225 | **≈ $3.52** |

- **After the global players are imported** (not imported yet: the feature list and the POS file arrive with the next
  deploy's run): 5 more classification reads. If all six POS players prove relevant, up to about 216 more checks (6 × 36
  countries) add about $4.85, for **about $8.4 in all**.
- **Duration:** at 40 a day, about 6 nightly shares. A batch is collected the night after it is submitted, so allow about 7
  nights.
- **The caps:** this is well inside $8 a day and $90 a month, alongside the deep and routine checks. $1.14 has been spent
  this month so far.
- **Where the money goes:** the $0.01 search fee is over half of a check. Setting "Searches per check" to 0 would roughly
  halve the pass, at the risk of missing a moved pricing page.

## 6 · Harness results

| Run | Result |
|---|---|
| `npx tsc --noEmit -p .` | clean |
| `npx eslint` on the changed files | clean |
| `node scripts/competitor-check-1.cjs` | **180 passed, 0 failed** (153 before; sections 1–16 unchanged) |

**Section 17 proves:**
- **Coverage:**
  - each competitor once per country, in queue order;
  - starting from a country covers only that country and the ones after it;
  - nothing runs before the pass is started.
- **Features:** a check asks only about features shown on that country's page. PayPal is asked in DE, not PL; PL's local
  payments in PL, not DE; never the hidden ASAP; never a plan-read price as a feature.
- **Limits and requests:**
  - 3 pages, 1 search and 6,000-token pages on Haiku, with no fallback sent;
  - the cache marks are on a byte-identical feature block across competitors in one country;
  - an oversized request is shrunk under 100,000.
- **Classification reads:**
  - the read comes first (one page, no search);
  - a relevant candidate then gets its checks;
  - a not-relevant one gets only its classification finding.
- **The second check:** the verifier runs on the price findings only; an unchanged pre-orders answer gets none.
  `needsSecondCheck` covers term, trial and changed answers.
- **Caps and resume:**
  - the daily cap stops the pass part-way;
  - the next run resumes with only what was left, nothing twice;
  - the monthly cap stops it too;
  - a response whose next turn would come within 2,000 tokens of 100,000 is the last; the check fails and is retried.
- **The batch path:**
  - it is used only when the docs allow it and the batch API is there; never for a dry run;
  - run 1 submits one batch of `pass_per_day` requests (unique custom IDs of 64 characters or fewer, no fallback) and
    records it in flight;
  - while it is processing, nothing happens;
  - once it has ended, its results become findings, items are marked done, the cost is exactly batch tokens at half price
    plus second checks at full price, and the next share is submitted;
  - the caps stop a batch before it goes in.
- **SQL:** the migration's shape, and that 20261048 has no temporary table.
- **The estimate:** the figures in §5.

**Not run (outside "affected harnesses only"):** the other harnesses and the screenshots.

## 7 · NOT RUN SQL

`supabase/migrations/20261049_competitor_check_3.sql`:

```sql
begin;
alter table public.competitor_check_settings
  add column if not exists pass_extractor_model text not null default 'claude-haiku-5-5',
  add column if not exists pass_verifier_model  text not null default 'claude-haiku-5-5',
  add column if not exists pass_per_day         integer not null default 40,
  add column if not exists pass_requested_at    timestamptz,
  add column if not exists pass_country         text,
  add column if not exists pass_max_fetches     integer not null default 3,
  add column if not exists pass_max_searches    integer not null default 1,
  add column if not exists pass_max_page_tokens integer not null default 6000,
  add column if not exists pass_batch           jsonb;
alter table public.competitor_check_settings drop constraint if exists competitor_check_settings_pass_chk;
alter table public.competitor_check_settings add constraint competitor_check_settings_pass_chk check (
  pass_per_day between 0 and 500 and pass_max_fetches between 1 and 10 and pass_max_searches between 0 and 5
  and pass_max_page_tokens between 1000 and 20000 and (pass_country is null or pass_country ~ '^[A-Z]{2}$')
  and (pass_batch is null or jsonb_typeof(pass_batch) = 'object'));
alter table public.competitors add column if not exists pass_state jsonb not null default '{}'::jsonb;
alter table public.competitors drop constraint if exists competitors_pass_state_chk;
alter table public.competitors add constraint competitors_pass_state_chk check (jsonb_typeof(pass_state) = 'object');
alter table public.competitor_check_runs drop constraint if exists competitor_check_runs_mode_check;
alter table public.competitor_check_runs add constraint competitor_check_runs_mode_check check (mode in ('deep', 'routine', 'single', 'pass'));
commit;
```

## 8 · Read-only SQL that was run

```sql
with enabled as (select country_code from public.country_settings where enabled),
plan_cc as (select distinct competitor_id, country_code from public.competitor_plans where superseded_at is null),
active as (select id, focus, coalesce(not_in_countries, '{}') as notin, notes from public.competitors where lifecycle = 'active'),
pairs as (
  select a.id, p.country_code from active a join plan_cc p on p.competitor_id = a.id
  union
  select a.id, e.country_code from active a cross join enabled e where a.focus = 'pos' and a.notes ~ 'countries:\s*all switched-on'
  union
  select a.id, trim(x) from active a cross join lateral regexp_split_to_table(substring(a.notes from 'countries:\s*([A-Z]{2}(?:\s*,\s*[A-Z]{2})*)'), ',') x where a.focus = 'pos' and a.notes ~ 'countries:\s*[A-Z]{2}'
)
select (select count(*) from pairs p join active a on a.id = p.id where not (p.country_code = any(a.notin))) as active_checks,
       (select count(distinct id) from pairs) as active_competitors_with_country,
       (select count(*) from active) as active_competitors,
       (select count(*) from public.competitors where lifecycle = 'candidate') as candidates,
       (select count(*) from enabled) as enabled_countries,
       (select count(*) from public.comparison_features) as features_seeded,
       (select count(*) from public.competitor_check_runs) as runs,
       (select coalesce(sum(cost_usd), 0) from public.competitor_check_runs where started_at >= date_trunc('month', now())) as spent_this_month;
```
```sql
select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.competitor_check_runs'::regclass and contype = 'c' and conname like '%mode%';
```

**What they showed:**
- 155 checks; 132 active competitors (128 with a country); 70 candidates; 36 switched-on countries.
- The feature list is not seeded yet (0 rows).
- 4 runs, $1.14 spent this month.
- The mode constraint's name matches the migration.

## 9 · What you do

1. **Run the SQL** in §7 (`supabase/migrations/20261049_competitor_check_3.sql`).
2. **Deploy.** The next run also imports the feature list and the global players (earlier workstreams).
3. **In Admin › Automatic checks,** pick **All countries** (or a country) and press **Start quick pass**.
4. **The next nightly run submits the first batch,** or press Run workflow with mode `pass`. The run after that collects
   it and submits the next share. The tile shows N of M, the cost so far and the estimated total.
5. **Accept or reject the findings as usual.** Candidates' classification findings come first.

## Undo (only if Dominic asks)

```sql
begin;
alter table public.competitor_check_settings drop constraint if exists competitor_check_settings_pass_chk;
alter table public.competitor_check_settings drop column if exists pass_extractor_model, drop column if exists pass_verifier_model,
  drop column if exists pass_per_day, drop column if exists pass_requested_at, drop column if exists pass_country,
  drop column if exists pass_max_fetches, drop column if exists pass_max_searches, drop column if exists pass_max_page_tokens, drop column if exists pass_batch;
alter table public.competitors drop constraint if exists competitors_pass_state_chk;
alter table public.competitors drop column if exists pass_state;
delete from public.competitor_check_runs where mode = 'pass';
alter table public.competitor_check_runs drop constraint if exists competitor_check_runs_mode_check;
alter table public.competitor_check_runs add constraint competitor_check_runs_mode_check check (mode in ('deep', 'routine', 'single'));
commit;
```

This report is docs/competitor-check-3-report.md.
