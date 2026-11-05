# Manual V16.11: applying `reference-manual-delta-v16-11.md`

*5 November 2026, about 07:05–07:45 UTC. `docs/reference-manual.md` is now at **V16.11**.*

- **Read-only checks only:** SQL through the read-only connection, `git fetch` / `git log` / `git reflog` / `git status`,
  and curl of public pages.
- **No `.env*` file was opened, parsed, listed or tested.**
- **The manual edit is not committed.** Neither the prompt nor the delta asks for a commit, as at V16.10. Say if you want
  it committed.

## Flagged before applying

- **No garbled spans** in the prompt or the delta.
- **No contradictions,** so nothing was put to you.
  - The delta's step 10 ("queries go in the report") and the prompt's two-line chat agree. Every query is in §6.
  - The delta's precedence rules ("the report wins … the live system wins") settled every difference between the delta,
    the reports and the live system. Each is recorded under OBSERVED WHEN APPLYING (§4).
- **Precondition met:** the manual was at V16.10 (header and front matter), applied 3 Nov.
- **One wording note, not a conflict:** Part H calls the two parallel sessions "Cursor sessions". The reports name them
  as Claude Code sessions (`village-foodie-ce`, `village-foodie-57`). The manual calls the agent "Cursor" throughout, so
  Part H was applied as written.

## 1 · What was applied

| Part | Done | Where |
|---|---|---|
| Version | header `· V16.11` and front matter `**Version 16.11**` | lines 1 and 9 |
| A · Changelog | new top entry, with a "where it went" table, a SWEEP STATUS line and OBSERVED WHEN APPLYING | top of the Changelog (line 53) |
| B · New subsections | What The Truck | **§86.16** (new); a pointer in §21's competitor research |
| | the feature import that keeps Admin's choices | **§86.17** (new) |
| | Manage › Documents | **§50** (new subsection at its end) |
| | cost per dish, profit and accountant reports | **§19** (new subsection) and **§17** (a dish's cost never reaches the menu API) |
| | the tax year per country | **§76.10** (new; the "plans-as-data and countries" part of step 3) |
| | the /features list after features-list-1 | **§81.8** (new) and a pointer in **§48** (the marketing site) |
| | growth and trust (planning decisions) | **§44**, a dated subsection at its end (no go-to-market section exists; §44 is the closest commercial section) |
| | the new tables in one place | **§16** (dated subsection at its end) |
| | the FAQ check's ordinary words (Czech "pro") | **§82.12** (added to its rejection rules) |
| C · Corrections | C1 and C3 struck or annotated in place, marked "⛔ Corrected V16.11"; C2, C4 and C5 not in the manual (§2) | §27 ×3, §86.15 |
| D · Sweep | 5 patterns over the whole manual: 15 hits; 4 corrected, 7 left as history, 4 a different meaning or still true, **0 outstanding**; 2 more outside the patterns (§3) | the SWEEP STATUS line |
| E · Invariants | **35.ao-9 … 35.ao-12**, appended to 35.ao (its heading now names V16.11 too) | §35 |
| F · Backlog | new "Added V16.11" block (15 items); struck as done: the Advanced reporting row ×2, the import that undid Admin's ticks, the Czech FAQ failure | §27 |
| G · Deploy posture | a new current block at the top of §49; V16.10's stays as dated history; the heading says "current at V16.11" | §49 |
| H · Tooling | at the end of §79: two sessions at once, a referenced report must exist, `country_settings` writes, the faq-1 pin lesson, the new harnesses | §79 |

**Size and integrity:**
- The manual grew from 3,582,396 to 3,625,875 characters: 636 lines added, 12 rewritten.
- Every rewritten line's text is still there (struck through, or annotated), apart from the two version strings and
  §49's "current at" heading. This was checked mechanically.
- No insertion lands inside a code block.

```
$ grep -nE "V16\.(10|11)|Version 16\.(10|11)" docs/reference-manual.md | head -3
1:HatchGrab Engineering Reference Manual · V16.11
9:**Version 16.11**
53:## V16.11 — 5 November 2026 — **DOCUMENTS IN MANAGE, COST PER DISH WITH PROFIT AND ACCOUNTANT REPORTS, …
```

## 2 · Part C, correction by correction

| # | Claim | What was done |
|---|---|---|
| C1 | "Advanced reporting — coming soon" on /features | §27 Added V16.8's line and §27 Added V16.10's open decision struck as done (features-list-1, §81.8) |
| C2 | Loyalty, paperwork and profit are not offered | not in the manual (patterns 2 and 3: 0 hits; also searched "certificate", "accountant", "COGS", "recipe"). Recorded in the changelog, §50, §19 and §86.16 |
| C3 | The feature import re-applies the seed's ticks | §27 Added V16.10's import line struck as done; §86.15's "it will re-tick" annotated; §86.17 new |
| C4 | Reminders reach the apps by push | not in the manual; §50 and the backlog say email only |
| C5 | "Tax year" is the calendar year everywhere | not in the manual (pattern 5: 0 hits); §76.10 records GB, AU, NZ and HK as set (OBSERVED) |

## 3 · Part D, the sweep

| Pattern | Hits | Corrected | History | Different meaning / still true |
|---|---|---|---|---|
| `Advanced reporting\|advanced_reporting.*coming` | 9 | 2 | 4 | 3 |
| `paperwork\|Paperwork` | 0 | — | — | — |
| `cost per dish\|recipe cost\|profit per` | 0 | — | — | — |
| `re-tick\|seed.*checked` | 6 | 2 | 3 | 1 |
| `tax year` | 0 | — | — | — |
| **Total** | **15** | **4** | **7** | **4** |

**Outstanding: 0.** Hits inside the new V16.11 text itself are excluded.

**What was left, and why:**
- **Pattern 1:**
  - history: a V6.5 changelog line, and three already-struck V6–V11 lines in §4;
  - different meaning or still true:
    - §27's "advanced reporting visualisations" (a later idea);
    - §35's gate post-mortem (the `advanced_reporting` gate, which still exists);
    - §86.10's "advanced reporting is not compared" (still true).
- **Pattern 4:**
  - history: the V16.10 changelog's OBSERVED line, §49's V16.10 posture and §86.10's OBSERVED 30 Oct line;
  - different meaning: §64's "Unticked by default".

**Outside the patterns:**
- **Corrected:** §27 Added V16.10's cs-CZ line, struck as done. It is fixed in code and pushed; the row itself clears on
  the next hourly run.
- **Added:** the new tables in §16.

## 4 · OBSERVED WHEN APPLYING (where the live system differs from the delta or the reports, or adds to them)

1. **Pushed and deployed, though every report says "not pushed".**
   - `git reflog` shows `origin/main` moved from `0287d619` to **`bf71b9c3` by a push at 07:06:13 UTC on 5 Nov**.
   - `/uk/features` (07:10) shows the three new rows and no Advanced reporting. `/de/features` no longer has
     "Erweiterte Auswertungen".
2. ⚠️ **Migration 20261069 has run.** costs-accounts-1 says it was not run, waiting for your yes.
   - Live: GB 4/6, AU 7/1, NZ 4/1, **and HK 4/1**.
   - HK's value comes from **20261071**, the costs-accounts-1 follow-up (your Q2 → A). It is committed **locally only**
     as `032086f4` (07:09 UTC), not pushed, and already run.
   - The delta's Part G expected 20261069 to be waiting.
3. ⚠️ **What The Truck is not in the database yet.**
   - No competitor matches, and there is no `data_imports` row for its file.
   - The importer runs from GitHub's `main`, and the push came after 4 Nov's run.
   - The 5 Nov scheduled run had not started by 07:15 UTC: 4 Nov's "02:10" run started at 09:02 UTC.
   - **The GB deep check is still current** (`deep_country` GB). So whether What The Truck gets a deep or a routine check
     depends on whether GB finishes first (competitor-wtt-1, flag 3).
4. ⚠️ **The Czech FAQ question is still hidden.**
   - The row is `failed`, with the same reason; its last try was 03:35 UTC, before the push.
   - No hourly retry is recorded since then (GitHub's scheduled runs start late).
   - The next run should pass it (UNVERIFIED).
5. **The ticks are as decided:**
   - asap, options and staff are unchecked; walkup is checked; all four are 'admin';
   - allergens is off tier, unchecked, 'admin', shown everywhere.
6. **Nothing used yet:** `truck_documents` 0, `document_shares` 0, `menu_item_costs` 0.
7. **Another session is still working in the repo.** It has an uncommitted `scripts/costs-accounts-1.cjs` and the local
   commit `032086f4`. Neither was touched.
8. **Where a report refines the delta:**
   - **Invariant 35.ao-9:** a past order's profit uses the cost on or before its event date. An order from before a
     dish's first cost uses that first cost (costs-accounts-1 §2).
   - **Part H's "untranslated strings":** in the shared tree the failures were the other session's unregistered new keys
     and its Manage views, and both passed on HEAD plus one session's work alone.
9. **Delta facts with no report behind them, recorded as stated or recommended:**
   - the growth and trust observations;
   - the year-one estimates;
   - the agents decision;
   - the review and weather plan;
   - the slowness report;
   - the parked list.

## 5 · Part G, the deploy posture

**Git:**
- `origin/main` = **`bf71b9c3`** (pushed 5 Nov 07:06:13 UTC; before that `0287d619`, 4 Nov 08:54).
- Local `main` is **1 ahead** (`032086f4`, the HK migration), 0 behind.
- The working tree has one uncommitted file of the other session's, plus this edit.

**Migrations, judged from their effects** (`db-migrate.cjs` keeps no run ledger):

| Migration | Run? | Evidence |
|---|---|---|
| 20261066 (paperwork-1) | **yes** | four tables; types GB 11, general 10 |
| 20261068 (costs-accounts-1) | **yes** | `menu_item_costs` exists; two tax-year columns |
| 20261069 (GB / AU / NZ tax years) | **yes** | GB 4/6, AU 7/1, NZ 4/1 |
| 20261070 (Q1 unticks) | **yes** | asap, options, staff unchecked, 'admin' (updated 4 Nov 20:45) |
| 20261067 (import-and-cs-fix) | yes | `checked_by`, `scope_by` exist |
| 20261071 (HK, local only) | **yes** | HK 4/1 |

**Other checks:**
- **What The Truck:** not in `competitors`; still only in the import file.
- **Row counts (no contents):** `truck_documents` 0; `menu_item_costs` 0.
- **Live:** `/uk/features` has the three rows and no Advanced reporting (curl, after the deploy).

## 6 · Every query run (all read-only)

**1 · Migrations and row counts**
```sql
select
 (select to_regclass('public.truck_documents') is not null) as m66_truck_documents_exists,
 (select string_agg(coalesce(country_code,'*')||':'||n, ', ') from (select country_code, count(*) n from paperwork_document_types group by 1 order by 1) x) as m66_types,
 (select count(*) from truck_documents) as truck_documents_rows,
 (select count(*) from document_shares) as document_shares_rows,
 (select (select count(*) from information_schema.columns where table_name='comparison_features' and column_name in ('checked_by','scope_by'))) as m67_cols,
 (select to_regclass('public.menu_item_costs') is not null) as m68_menu_item_costs_exists,
 (select count(*) from menu_item_costs) as menu_item_costs_rows,
 (select count(*) from information_schema.columns where table_name='country_settings' and column_name like 'tax_year_start%') as m68_cs_cols,
 (select coalesce(string_agg(country_code||' '||tax_year_start_month||'/'||tax_year_start_day, ', ' order by country_code), 'none') from country_settings where tax_year_start_month is not null) as m69_m71_tax_years;
```
| m66 tables | m66 types | truck_documents | document_shares | m67 cols | m68 table | menu_item_costs | m68 cols | tax years |
|---|---|---|---|---|---|---|---|---|
| true | GB:11, *:10 | 0 | 0 | 2 | true | 0 | 2 | AU 7/1, GB 4/6, HK 4/1, NZ 4/1 |

**2 · The five features**
```sql
select key, checked, checked_by, show_scope, scope_by, tier, to_char(updated_at,'YYYY-MM-DD HH24:MI') as updated from comparison_features where key in ('asap','options','staff','walkup','allergens') order by key;
```
| key | checked | checked_by | show_scope | scope_by | tier | updated |
|---|---|---|---|---|---|---|
| allergens | false | admin | all | admin | off | 2026-11-04 09:02 |
| asap | false | admin | hidden | admin | core | 2026-11-04 20:45 |
| options | false | admin | hidden | admin | secondary | 2026-11-04 20:45 |
| staff | false | admin | hidden | admin | secondary | 2026-11-04 20:45 |
| walkup | true | admin | all | admin | core | 2026-11-04 09:02 |

**3 · What The Truck, the imports and the Czech FAQ**
```sql
select
 (select count(*) from competitors where name ilike '%what%truck%' or website ilike '%whatthetruck%') as wtt_competitors,
 (select json_agg(json_build_object('at', imported_at, 'result', result, 'counts', counts)) from data_imports where file_path = 'data/competitor-wtt-1/competitors.json') as wtt_import,
 (select json_agg(json_build_object('file', file_path, 'at', imported_at, 'result', result) order by imported_at desc) from (select * from data_imports order by imported_at desc limit 4) d) as latest_imports,
 (select string_agg(locale||' '||status||' '||n, ', ') from (select locale, status, count(*) n from faq_translations where locale='cs-CZ' group by 1,2) x) as cs_faq;
```
- `wtt_competitors` 0; `wtt_import` null.
- **Latest imports:** `features.json` 4 Nov 09:02 (ok); `features.json` 30 Oct; `global-players` 30 Oct;
  `compare-de-1` 30 Oct.
- **cs-CZ:** 28 ok, 1 failed.

```sql
select
 (select json_agg(row_to_json(t)) from (select * from faq_translations where locale='cs-CZ' and status='failed') t) as cs_failed_row_cols,
 (select json_build_object('paused', paused, 'deep_country', deep_country, 'deep_requested_at', deep_requested_at, 'queue', deep_queue[1:4]) from competitor_check_settings) as checker;
```
- **cs-CZ:** item `fa000002-…0007`, `translated_at` 2026-11-05 03:35:47 UTC, reason "answer: the plan name "Pro" typed
  in (plan names come from live values)".
- **The checker:** not paused; `deep_country` GB, requested 2026-11-03 13:20 UTC; queue GB, DE, CZ, AT.

(A first version of this query asked for a non-existent `updated_at` column and errored; nothing ran.)

**4 · The checker's last runs**
```sql
select table_name from information_schema.tables where table_schema='public' and table_name like 'competitor_check%' order by 1;
select (select json_agg(t) from (select * from competitor_check_runs order by 1 desc limit 1) t) as last_run_row;
select mode, trigger, started_at, finished_at, competitors_checked, round(cost_usd::numeric,2) as cost, stopped_reason from competitor_check_runs order by started_at desc limit 4;
```
- The second query (ordered by id) returned an older 30 Oct row and was superseded by the third.

| mode | started | finished | checked | cost | stopped |
|---|---|---|---|---|---|
| routine | 4 Nov 11:35 | 11:52 | 4 | $0.23 | done |
| deep | 4 Nov 09:39 | 11:35 | 15 | $1.90 | done |
| pass | 4 Nov 09:03 | 09:39 | 37 | $0.54 | done |
| routine | 3 Nov 11:14 | 11:30 | 4 | $0.17 | done |

**Git and curl (as run):**
```
git fetch -q origin
git log -1 --format='%h %ad %s' --date=iso origin/main   → bf71b9c3 2026-11-05 03:01:23 +0000 costs-accounts-1: report (…)
git rev-list --left-right --count main...origin/main     → 1 0
git log --oneline origin/main..main                      → 032086f4 costs-accounts-1: migration 20261071 — Hong Kong's tax year starts 1 April (Dominic's Q2 → A)
git reflog show --date=iso origin/main | head -2          → bf71b9c3 …@{2026-11-05 07:06:13 +0000}: update by push · 0287d619 …@{2026-11-04 08:54:41 +0000}: update by push
git status --short                                       →  M scripts/costs-accounts-1.cjs   (the other session's)
curl -s https://www.hatchgrab.com/uk/features            → 200; "Documents and reminders" ×2, "Profit per event" ×2, "Reports for your accountant" ×2, "Advanced reporting" ×0
curl -s https://www.hatchgrab.com/de/features            → 200; "Erweiterte Auswertungen" ×0
```

## 7 · Not done / for Dominic

- **Commit:** the manual edit is uncommitted. Say if you want it committed.
- **Push `032086f4`** (20261071, Hong Kong's tax year). It is already run, but the file is not on GitHub.
- **After the next "Competitor check" run:**
  - What The Truck's row: one competitor, 42 answers (25 quoted), the plan "GB No monthly fee (fee per payment) 0/395";
  - whether it got a deep or a routine check.
- **After the next hourly FAQ run:** the Czech question should be `ok` and show on `/cz/faq`.
