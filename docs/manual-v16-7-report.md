# manual-v16-7 — report

**29 October 2026.** Written for Dominic. `~/Downloads/reference-manual-delta-v16-7.md` is applied to
`docs/reference-manual.md` as its HOW TO APPLY section says. Only read-only SQL, `git` (`fetch`, `log`, `status`, `show`)
and `curl` of public pages were used. No `.env*` file was opened, and nothing was committed or pushed.

## 1 · Checks before starting

- **The manual was at V16.6** in both places (the header and the `**Version 16.6**` front matter), so the delta applied.
- **Nothing in the brief or the delta arrived garbled, and no instruction contradicted another.**
- **One small inconsistency, settled by the reports:** the delta's tooling part calls `compare-de-1-screens` a
  registered harness. It is in the needs-a-browser group (compare-de-1 report), so the manual says that.
- **A copy of the V16.6 manual** is in the session scratchpad
  (`/private/tmp/claude-501/-Users-dominicbonini-dev-village-foodie/b202fcf6-9b60-4397-8c7b-3f4a71421f5f/scratchpad/manual167/reference-manual.v16-6.md`).

## 2 · What was applied, and where

| Delta part | In the manual |
|---|---|
| Version (header and front matter) | V16.7 / **Version 16.7**; the grep shows both agree |
| A — Changelog | New top entry V16.7, with a "where it went" table, SWEEP STATUS, and OBSERVED WHEN APPLYING |
| B — new section | **§86** (86.1 live state, 86.2 search research, 86.3 the German page, 86.4 the checker, 86.5 mockups), after §85, before the closing note |
| B — pricing after V16.6 | **§85.7**, a dated block at the end of §85 |
| C — corrections | Struck in place with "⛔ Corrected V16.7" (§3) |
| D — sweep | §4; counts in the Changelog's SWEEP STATUS line |
| E — invariants | **§35.an** (35.an-1 … 35.an-9), after 35.am |
| F — backlog | **"Added V16.7"** at the end of §27, plus what was observed when applying |
| G — deploy posture | A new current block at the top of §49 (heading now "current at V16.7"). V16.5's posture and V16.6's §85.1 stay as dated history |
| H — tooling | At the end of §79 |

## 3 · Corrections in place (27)

- **C1 · §21 "Eurozone":** "no Hatches Up-style specialist; Vev … the nearest" is struck. The NL, DE and FR rivals are
  listed, with pointers to the reports.
- **C2 · France (15 lines):** France's row is **OBSERVED live** (written 23 Oct 21:21 UTC by dominic@hatchgrab.com; fr-FR,
  EUR, 3 `plan_prices` rows; switched on; `/fr` 200 and in the sitemap). Every "no row / switched off / Planned / 302"
  line outside the Changelog is struck: §27 ×2, §48 ×2, §49, §76, §77, §83 ×4 (including the §83.9 heading), §84 ×2 and
  §85 ×2 (§85.1, §85.6).
- **C3 · the apps' availability:**
  - §11 gets a note that the iOS app is UK App Store only and Android UK-only;
  - §36's Android availability line gets the iOS fact;
  - §85.6's "iPhone app … not recorded" is struck.
- **C4 · §82 JSON-LD:** `operatingSystem: "Web, iOS, Android"` is marked as a known gap outside the UK (and in the
  backlog).
- **C5 · §48 sitemap:** "lastmod from `MARKETING_COPY_UPDATED`" is marked incomplete. lastmod is the latest of the copy
  date, the plan data and the country row's change. The move-it rule stands.
- **C6 · `/llms.txt` and robots:**
  - §82 gets the 24 / 29 Oct observation (200, 426 lines, 36 countries; robots.txt allows the named AI bots) and the known
    gaps (each country's card sentence in its own language and home number form; no features section);
  - §48's 21 Oct "AI search is not live" observation is struck.
- **C7 · §12 admin tabs:** Countries' "Comparison pages" panel, and Pricing check's "Comparison page" area and "Automatic
  checks" view.
- **C8 · euro prices:** "eurozone pricing (€0/€29/€69) planned later" (§81.1) is struck. §27's "Eurozone launch" backlog
  line is marked done, except iDEAL.
- **C9 · de-DE `manageSettings.getApp.body`:** recorded as a known false statement in the backlog.
- **Not in the delta, OBSERVED, corrected:** §83.7's About page content ("Hi, I'm Dominic.", the old story). The live
  `/about` now shows "Built around the way food trucks actually work" (commit `b01d0f66`, 29 Oct).

## 4 · The sweep (Part D)

Each pattern was run over the whole manual, and every hit read.

| Pattern | Hits | Corrected | History (changelog) | Not stale |
|---|---|---|---|---|
| 1 `Vev.*nearest\|no Hatches Up-style specialist` | 1 | 1 | 0 | 0 |
| 2 France "no row" (and wider forms) | 17 | 15 | 2 (V16.5, V16.4) | 0 |
| 3 `llms\.txt.*404\|blocks GPTBot\|blocks ClaudeBot` | 5 | 1 | 1 (V16.3) | 3 (a dated 21 Oct posture already superseded in §49; one V16.4 already struck; "404 on Village Foodie" is true) |
| 4 `MARKETING_COPY_UPDATED` as the only lastmod source | 2 | 1 | 0 | 1 (§35.ak-8's rule is true) |
| 5 `slot throttling\|throttl` | 6 | 0 | 0 | 6 (rate limits and log throttles; none is marketing wording) |
| 6 iOS everywhere / App Store / "iPhone app … not recorded" | 1 | 1 | 0 | 0 |
| **Total** | **32** | **19** | **3** | **10** |

**Also corrected outside the patterns: 8** (§11, §36, §82 ×2, §12, §81.1, §27, §83.7). **Outstanding: 0.** After applying,
the patterns were run again: every remaining hit outside the Changelog is struck, corrected, or one of the not-stale
lines above.

## 5 · Observed when applying (where the live system differs from or adds to the delta)

- **France's row exists and is switched on**, and all 36 `country_settings` rows are enabled. So C2 applied in full.
- **DE `comparison_status` is `admin`.** The delta expected that only if the separate update had been run; it has been.
  The DE app flags are false, GB's true; AT and FR are `off`.
- **The German comparison research is not imported:** DE has 7 current plans, and `comparison_entries` is empty. This is
  consistent with the failing import button.
- **Counts:** 202 competitors (70 candidates); 242 plans, all current; 39 findings, all pending.
- **Checker settings:** not paused, $8 / $90 caps, 15 deep a day, 90 days, `deep_requested_at` null, both models
  `claude-sonnet-5-5`.
- **Checker runs: four.**
  - Two manual routine runs on 27 Oct, 0 checked.
  - Scheduled runs on 28 Oct (4 checked, $0.8361) and 29 Oct (2 checked, $0.3020), all `done`.
  - The scheduled runs started at 08:21 and 08:23 UTC, not 02:10 (GitHub's cron delay).
  - **Measured routine cost:** ≈ $0.19 a competitor, against the $0.16 estimate.
  - No run lasted over 4 minutes, so token renewal past 10 minutes is still unproven.
- **Git:** `origin/main` = HEAD = `b01d0f66` "about us" (29 Oct), and the tree is clean. compare-de-1 is in `7d879790`,
  the checker in `a8883fe6` and the federation login in `f99a88e5`, all pushed.
- **Public (curl, 29 Oct):**
  - `/de/vergleich/foodtruck-bestellsystem` → 404, `X-Robots-Tag: noindex, nofollow`, a private no-store
    `Cache-Control`; its `.md` twin the same;
  - `/llms.txt` 200 (426 lines, no "Comparisons", no features section);
  - the sitemap has no comparison page, and has `/fr`;
  - `/fr` 200;
  - robots.txt allows GPTBot, ClaudeBot, OAI-SearchBot, PerplexityBot, CCBot and others by name;
  - the apex `hatchgrab.com` → 307.
- **STATED, not observable from here:** the federation rule and its successful test, the four repository variables, the
  Console workspace and any spend limit.

## 6 · Read-only SQL that was run

```sql
select country_code, name, enabled, comparison_status, ios_app_available, android_app_available from public.country_settings where country_code in ('FR','DE','GB','AT') order by country_code;
```
```sql
select table_name, count(*) as columns from information_schema.columns where table_schema = 'public' and table_name in ('comparison_entries','competitor_check_runs','competitor_check_findings','competitor_check_settings') group by table_name order by table_name;
```
```sql
select (select count(*) from public.competitors) as competitors, (select count(*) from public.competitors where lifecycle = 'candidate') as candidates, (select count(*) from public.competitor_plans) as plans, (select count(*) from public.competitor_plans where superseded_at is null) as current_plans, (select count(*) from public.competitor_plans where country_code = 'DE' and superseded_at is null) as de_plans, (select count(*) from public.comparison_entries) as comparison_entries, (select count(*) from public.competitor_check_findings) as findings, (select count(*) from public.competitor_check_findings where review_status = 'pending') as pending_findings, (select count(*) from public.country_settings) as country_rows, (select count(*) from public.country_settings where enabled) as enabled_rows;
```
```sql
select mode, trigger, started_at, finished_at, competitors_checked, cost_usd, stopped_reason from public.competitor_check_runs order by started_at;
```
```sql
select paused, daily_cap_usd, monthly_cap_usd, deep_per_day, check_interval_days, deep_requested_at, extractor_model, verifier_model from public.competitor_check_settings;
```
```sql
select cs.country_code, cs.enabled, cs.locale, cs.currency, cs.updated_at, cs.updated_by, (select count(*) from public.plan_prices pp where pp.country_code = 'FR') as fr_plan_prices from public.country_settings cs where cs.country_code = 'FR';
```

## 7 · git and curl that were run

- `git status`, `git fetch origin` (to read `origin/main`), `git log origin/main -1`, `git log -6`,
  `git rev-list --left-right --count origin/main...HEAD` (0 0), `git log -- <file>` for the workstreams' files, and
  `git show HEAD:.github/workflows/competitor-check.yml`.
- `curl` (anonymous, headers and bodies):
  - `https://www.hatchgrab.com/de/vergleich/foodtruck-bestellsystem` and `.md`;
  - `/llms.txt`, `/sitemap.xml`, `/robots.txt`, `/fr`, `/about`;
  - `https://hatchgrab.com/`.

## 8 · Not done

- **Nothing outside `docs/reference-manual.md` (and this report) was changed.** The backlog items the delta records
  (re-pinning `competitor-check-1.cjs`, the failing import, the green tick on a failed login) are recorded, not fixed.

This report is docs/manual-v16-7-report.md.
