# manual-v16-8 — report

**30 October 2026.** Written for Dominic. `~/Downloads/reference-manual-delta-v16-8.md` is applied to
`docs/reference-manual.md` as its HOW TO APPLY section says.
- Only read-only SQL, `git` (`fetch`, `log`, `show`, `status`) and `curl` of public pages were used.
- No `.env*` file was opened, and nothing was committed or pushed.

## 1 · Checks before starting

- **The manual was at V16.7** in both places (the header and the `**Version 16.7**` front matter), so the delta applied.
- **Nothing in the brief or the delta arrived garbled, and no instruction contradicted another.**
- **Two differences, settled as the delta says (the report wins; the live system wins over a report):**
  1. **The deep-check cost on Sonnet with 45 features.**
     - The delta gives about $1.80 a competitor.
     - comparison-features-1 §6 gives +$0.93 on top of the $0.72 deep check: about $1.65, or about $2 with the measured
       20% overrun.
     - The manual gives the report's figure and names the delta's.
  2. **`deep_country`.** The delta says GB first (stated). The stored queue is exactly that, but the live `deep_country` is
     **DE**. It is recorded as OBSERVED, with the reason UNVERIFIED.
- **The delta covers 29 Oct only.**
  - Three later workstreams (competitor-check-4, -5 and -7, 30 Oct) are committed and pushed, and their migrations 20261050
    and 20261051 are run.
  - They are recorded only as OBSERVED (the changelog and §49), plus one line they made untrue (§86.4, the second check's
    labels).
- **A copy of the V16.7 manual** is in the session scratchpad:
  `/private/tmp/claude-501/-Users-dominicbonini-dev-village-foodie/b202fcf6-9b60-4397-8c7b-3f4a71421f5f/scratchpad/manual168/reference-manual.v16-7.md`.
  The script that applied every change is beside it (`apply.py`). Each replacement had to match exactly once.

## 2 · What was applied, and where

| Delta part | In the manual |
|---|---|
| Version (header and front matter) | V16.8 / **Version 16.8**. The delta's grep shows both agree. |
| A — Changelog | A new top entry V16.8, with a "where it went" table, SWEEP STATUS, and OBSERVED WHEN APPLYING |
| B — new subsections | **§86.6–§86.13** at the end of §86, after §86.5 and before the closing note. §86's heading names them. |
| C — corrections | Struck in place, with "⛔ Corrected V16.8" (§3) |
| D — sweep | §4; the counts are in the Changelog's SWEEP STATUS line |
| E — invariants | **35.an-10 … 35.an-16**, appended to §35.an |
| F — backlog | Six V16.7 items struck "✅ Done V16.8"; a new **"Added V16.8"** block at the end of §27 |
| G — deploy posture | A new current block at the top of §49 (the heading now says "current at V16.8"). V16.7's stays as dated history. |
| H — tooling | At the end of §79 |

**The new subsections:**
- 86.6 Imports
- 86.7 The login fails loudly
- 86.8 Deep checks country by country
- 86.9 The big POS players
- 86.10 The master comparison feature list (with the cost block and HatchGrab's code-confirmed answers)
- 86.11 The quick pass
- 86.12 Measured so far
- 86.13 Search Console, Bing and the firewall

## 3 · Corrections in place (14)

- **C1 · the German import:**
  - §86.3's "not imported … the import button fails" is struck. The button is gone; the research was imported on 30 Oct
    at 08:32 UTC (9 matched, 14 plans, 8 entries), and DE now has 21 plans and 8 entries.
  - §27's backlog line is struck as done.
- **C2 · the green tick:**
  - §86.4's "known defect" is struck: fixed, and the run now exits non-zero.
  - §27's backlog line is struck as done.
- **C3 · the retired feature columns:**
  - §85.3's six key feature columns, and §86.3's `capacity_slots` / `multi_location_schedule` / `kds` / `pay_at_truck` /
    `payment_methods` / `min_term`, are struck.
  - The answers now live in `competitor_feature_values`.
- **C4 · the benchmarks' app columns:** struck in §85.3, with a note on §85.6's line. `country_settings` is the one source.
- **C5 · "iPhone and iPad app":** none in the manual.
- **C6 · the deep check:**
  - §86.4's `deep` = "every competitor" is struck: the scheduled deep check goes through the country queue.
  - The ≈ $142 all-at-once estimate is marked as history.
- **C7 · the POS giants:**
  - the three "excluded" lines are the pricing research's scope (the V16.6 changelog, §84.10, §85.2) and stay as
    history;
  - §85.2 gets a pointer to §86.9.
- **C8 · HatchGrab's claims:**
  - §21 "Real differentiators": offline protection now carries the apps-only qualifier, and ticket printing "in the iPad
    and Android app; printer not supplied".
  - §86.2's "printed tickets" gets the same qualifier.
  - No line claims HatchGrab triggers buzzers or offers table ordering.
- **Not in Part C, found while applying:**
  - §86.4 "It writes only …": the checker also writes `deep_checked_in` and `pass_state`, and in its settings only
    `deep_country` and `pass_batch`.
  - §86.4 "Disagreements show as 'Couldn't confirm'": since competitor-check-7 (OBSERVED, 30 Oct), a real disagreement
    shows as "Disagrees", and "Couldn't confirm" is for `unclear`.

## 4 · The sweep (Part D)

The patterns were run over the whole V16.7 manual, before any edit. The totals: **219 hits**; 5 corrected; 5 left as
history; 209 not stale; 0 outstanding. Separately, **9 found outside the patterns** were corrected.

| # | Pattern | Found | Corrected | History | Not stale |
|---|---|---|---|---|---|
| 1 | `Import German comparison research` | 2 | 1 (§27, struck as done) | 1 (V16.7 changelog) | 0 |
| 2 | `green tick` | 2 | 0 | 0 | 2 (Meta webhooks, a different meaning) |
| 3 | `pre_orders\|capacity_slots\|multi_location_schedule\|own_domain` | 2 | 2 (§85.3, §86.3) | 0 | 0 |
| 4 | `country_benchmarks.*(ios\|android)_app` | 0 | — | — | — |
| 5 | `iPhone and iPad app\|iPhone-/iPad-App` | 0 | — | — | — |
| 6 | `full deep check` | 3 | 1 (§86.4 estimate) | 1 (V16.7 changelog) | 1 (§86.4 "Why", the stated goal) |
| 7 | POS giants excluded | 3 | 0 (§85.2 gets a pointer) | 3 (research scope) | 0 |
| 8 | `offline protection` / `buzzer` / `QR` / `table ordering` | 33 + 88 + 86 + 0 = 207 | 1 (§21) | 0 | 206 |

- **What pattern 8's "not stale" hits are:** they document the operator features as built:
  - a van's offline protection;
  - buzzer numbers recorded by staff;
  - QR codes that open the order page.
- **Found outside the patterns (9):**
  - §86.3: not imported;
  - §86.4: the green-tick defect;
  - §27: the green-tick line;
  - §85.3 and §85.6: the benchmarks' app columns;
  - §86.4: the `deep` mode;
  - §86.4: what the checker writes;
  - §86.4: "Couldn't confirm";
  - §86.2: printed tickets.

## 5 · OBSERVED when applying (30 Oct, about 20:30 UTC)

**Git:**
- `origin/main` = HEAD = `c7242ad8` "comp" (30 Oct 14:18 UTC), with a clean tree.
- **Commits since V16.7:**
  - `8fd3ba83` (competitor-check-2 and the V16.7 manual);
  - `2c78c934` (global-players-1);
  - `a21e868a` (comparison-features-1);
  - `d6237c17` (competitor-check-3);
  - `e188faf2` (-4), `18681218` (-5) and `c7242ad8` (-7).
- All pushed. Which commit Vercel serves is UNVERIFIED.

**Migrations:** 20261045–20261051 are all present. The query checked the columns, the `focus` / `mode` / `outcome` CHECKs,
and the `second_check` CHECK, which allows `unclear`.

**Imports:** three `ok` rows, all on 30 Oct at 08:32 UTC:
- German research: 9 matched, 14 plans added, 5 existing, 8 entries;
- POS players: 5 added, 1 updated;
- the features: 45 added, 5,721 marked due.

**Data:**
- **Competitors:** 207. 132 active; 75 candidates, 6 of them `pos`. None has `not_in_countries`.
- **The feature list:** 45 features, all checked: 28 shown everywhere, 4 in some countries, 13 hidden.
- **Answers:** 5,940 current, none verified.
- **DE:** 21 plans; 8 entries, 0 verified.

**Settings:**
- all four models Haiku;
- `deep_queue` exactly as stated;
- **`deep_country` DE**;
- `pass_batch` `msgbatch_01Jb6Zv1SGfDfDEsQPh49oqp` (40 items) still in flight;
- `max_output_tokens` 128,000 for both models.

**Runs:**
- 5 in all, $1.1381 this month.
- The 30 Oct 08:33 deep run had all 15 checks refused (the 17-union schema, which competitor-check-4 fixed).
- No `pass` run yet.
- 39 findings, all pending.

**Public:**
- the DE page, `.md` and `.json` are 404 with `noindex, nofollow` and a private `Cache-Control`;
- the sitemap (77 URLs) and `/llms.txt` name no comparison page.

## 6 · Every query and command that was run

**Git:**
```
git fetch --quiet origin
git log origin/main -1 --format='%h %ci %s'
git log -1 --format='%h %ci %s'
git status --short
git log --format='%h %ci %s' b01d0f66..origin/main
git show --stat <commit>   (for 8fd3ba83, 2c78c934, a21e868a, d6237c17, e188faf2, 18681218, c7242ad8)
git log --format='%h %cs' -- supabase/migrations/2026104{5..9}_*.sql supabase/migrations/2026105{0,1}_*.sql
```

**Curl (public pages):**
```
curl -sS -o /dev/null -D - https://www.hatchgrab.com/de/vergleich/foodtruck-bestellsystem   (and .md, .json)
curl -sS -o /dev/null -D - https://www.hatchgrab.com/sitemap.xml
curl -sS -o /dev/null -D - https://www.hatchgrab.com/llms.txt
curl -sS https://www.hatchgrab.com/sitemap.xml | grep -c "<loc>"
curl -sS https://www.hatchgrab.com/sitemap.xml | grep -ci "vergleich\|comparison"
curl -sS https://www.hatchgrab.com/llms.txt | grep -ci "Comparisons"
```

**Read-only SQL:**
```sql
select table_name, column_name from information_schema.columns where table_schema = 'public' and ((table_name = 'data_imports') or (table_name = 'competitor_check_settings' and column_name in ('deep_country','deep_queue','pass_extractor_model','pass_verifier_model','pass_per_day','pass_requested_at','pass_country','pass_max_fetches','pass_max_searches','pass_max_page_tokens','pass_batch','max_output_tokens')) or (table_name = 'competitors' and column_name in ('not_in_countries','deep_checked_in','pass_state')) or (table_name = 'comparison_entries' and column_name = 'group_label') or (table_name in ('comparison_features','competitor_feature_values') and column_name in ('id','key','competitor_id'))) order by 1, 2;
```
```sql
select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid) as def from pg_constraint where contype = 'c' and conrelid in ('public.competitors'::regclass, 'public.competitor_check_runs'::regclass, 'public.competitor_check_findings'::regclass) and (pg_get_constraintdef(oid) ilike '%focus%' or pg_get_constraintdef(oid) ilike '%mode%' or pg_get_constraintdef(oid) ilike '%second_check%' or pg_get_constraintdef(oid) ilike '%outcome%') order by 1, 2;
```
```sql
select file_path, left(sha256, 16) as sha, imported_at, result, counts, left(message, 200) as message from public.data_imports order by imported_at;
```
```sql
select lifecycle, coalesce(focus, '(none)') as focus, count(*) from public.competitors group by 1, 2 order by 1, 2;
```
```sql
select (select count(*) from public.comparison_features) as features, (select count(*) from public.comparison_features where checked) as features_checked, (select count(*) from public.comparison_features where show_scope = 'all') as shown_all, (select count(*) from public.comparison_features where show_scope = 'some') as shown_some, (select count(*) from public.comparison_features where show_scope = 'hidden') as hidden, (select count(*) from public.competitor_feature_values where superseded_at is null) as current_values, (select count(*) from public.competitor_feature_values where superseded_at is null and verified_at is not null) as current_verified, (select count(*) from public.comparison_entries where country_code = 'DE') as de_entries, (select count(*) from public.comparison_entries where country_code = 'DE' and verified_at is not null) as de_entries_verified, (select count(*) from public.competitor_plans where country_code = 'DE' and superseded_at is null) as de_current_plans, (select count(*) from public.competitors where cardinality(not_in_countries) > 0) as with_not_in;
```
```sql
select paused, daily_cap_usd, monthly_cap_usd, deep_per_day, check_interval_days, extractor_model, verifier_model, deep_country, deep_queue, deep_requested_at, pass_extractor_model, pass_verifier_model, pass_per_day, pass_requested_at, pass_country, pass_max_fetches, pass_max_searches, pass_max_page_tokens, pass_batch->>'id' as pass_batch_id, pass_batch->>'submittedAt' as pass_batch_submitted, jsonb_array_length(coalesce(pass_batch->'items', '[]'::jsonb)) as pass_batch_items, max_output_tokens from public.competitor_check_settings;
```
```sql
select mode, trigger, stopped_reason, count(*) as runs, sum(competitors_checked) as checked, round(sum(cost_usd)::numeric, 4) as cost_usd, min(started_at) as first_run, max(started_at) as last_run from public.competitor_check_runs group by 1, 2, 3 order by 1, 2, 3;
```
```sql
select (select round(coalesce(sum(cost_usd), 0)::numeric, 4) from public.competitor_check_runs where started_at >= date_trunc('month', now())) as cost_this_month, (select count(*) from public.competitor_check_runs) as runs_total, (select count(*) from public.competitor_check_findings where review_status = 'pending') as findings_pending, (select count(*) from public.competitor_check_findings) as findings_total, (select count(*) from public.competitors where pass_state <> '{}'::jsonb) as with_pass_state, now() as checked_at;
```
The next query failed, because the column is named `country_code`, not `code`. It was run again corrected:
```sql
select code, enabled, comparison_status, ios_app_available, android_app_available from public.country_settings where comparison_status <> 'off' or ios_app_available or android_app_available or code in ('DE', 'GB') order by code;
```
```sql
select count(*) as countries, count(*) filter (where enabled) as enabled from public.country_settings;
```
```sql
select country_code, enabled, comparison_status, ios_app_available, android_app_available from public.country_settings where comparison_status <> 'off' or ios_app_available or android_app_available or country_code in ('DE', 'GB') order by country_code;
```
```sql
select mode, started_at, finished_at, competitors_checked, stopped_reason, left(notes, 240) as notes from public.competitor_check_runs where started_at >= '2026-10-29' order by started_at;
```

## 7 · For you to note

- **`deep_country` is DE.** If GB should go first, as stated, pick GB in Admin › Automatic checks › "Start deep check".
- **The next nightly run** collects the refused batch, which shows one red cross, and resubmits its 40 checks. The deep
  share on DE runs with the fixed schema.
- **The manual is not committed.** `git diff --stat`: `docs/reference-manual.md`, 497 insertions and 30 deletions, plus
  this report.
