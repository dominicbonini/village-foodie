# manual-v16-9 — report

**1 November 2026.** Written for Dominic. `~/Downloads/reference-manual-delta-v16-9.md` is applied to
`docs/reference-manual.md` as its HOW TO APPLY section says.
- Only read-only SQL, `git` (`fetch`, `log`, `show`, `status`) and `curl` GETs of public pages were used.
- No `.env*` file was opened, and nothing was committed or pushed.

## ⚠️ At the top: three things the live system shows that the delta does not say

1. **Migrations 20261052 and 20261053 are both run** (every column, the bucket, the table, the `time_up` value), so there
   is no NOT RUN SQL. 20261054 and 20261055 are run too.
2. **All eight new countries are switched ON, the UAE included.**
   - The delta (and world-countries-1) say they were inserted off and that the UAE stays off (stated, 31 Oct).
   - Live: `enabled = true` for all eight, written one by one through Admin between 17:25:36 and 17:25:55 UTC on 1 Nov
     (`updated_by` set), four minutes after the deploy commit.
   - `/ae` answers 200 in Arabic, right to left.
   - The manual records this as live and asks whether the UAE is meant to be on (§27 Added V16.9). If not, switch AE off
     in Admin › Countries.
3. **The client signup flag is not in the build being served.**
   - The live demo order page's chunk reads `env.NEXT_PUBLIC_SIGNUP_PUBLIC` unresolved: the sign demo-2 used to show the
     flag was unset at build. The build itself is current, because world-countries-3's wording is live.
   - So the demo still offers "Save my menu", not "Start free".
   - The server flag could not be checked: the validation-failing `POST /api/signup` I tried was refused by this
     session's permission rules (it was not sent). `SIGNUP_PUBLIC` is UNVERIFIED.
   - **To fix:** redeploy Production without the build cache, then check that a demo shows "Start free for 3 months, keep
     my menu".

## 1 · Checks before starting

- **The manual was at V16.8** in both places (the header and the `**Version 16.8**` front matter), so the delta applied.
- **A copy of the V16.8 manual** is in the session scratchpad:
  `/private/tmp/claude-501/-Users-dominicbonini-dev-village-foodie/ca22c535-d1ad-44a9-b881-1d15addf2739/scratchpad/manual169/reference-manual.v16-8.md`.
  The script that applied every change is beside it (`apply.py`). Each of its 37 replacements had to match exactly once,
  or the run would stop.
- **Nothing in the brief or the delta arrived garbled.**
- **One apparent contradiction, already settled by you:**
  - The delta's HOW TO APPLY #10 says "every query in your chat reply as fenced blocks and in the report".
  - The brief's FINALLY says the chat holds only the two-line summary and NOT RUN SQL.
  - You decided this at world-countries-1 (option B: the summary and the NOT RUN SQL only, with the filename last), and
    the delta's own Part H sets that ending. So the read-only queries are in this report (§6), not in the chat. Recorded
    in §79.
- **Where the delta and the reports differ, the report won:**
  - **The checker's quick-pass cause:** the delta says "~85% sure". It is now CONFIRMED from the 31 Oct run's notes (the
    17-union refusal).
  - **The demo-2c wording:** the counts sentence is the report's final text ("once your demo is deleted they can no
    longer be linked to you").
  - **Harness counts:** taken from the latest report (world-countries-1 178 after world-countries-2; legal-languages-1
    220 after world-countries-3).

## 2 · What was applied, and where

| Delta part | In the manual |
|---|---|
| Version (header and front matter) | V16.9 / **Version 16.9**; month line November 2026. The delta's grep shows both agree. |
| A — Changelog | A new top entry V16.9, with a "where it went" table, SWEEP STATUS, and OBSERVED WHEN APPLYING. The delta's title is kept verbatim; its first bullet says which two title claims the live system does not show. |
| B — new subsections | **§55** "The demo, as rebuilt" (end of §55); **§43** "Signup and email", "The demo in the Privacy Policy", "The legal documents in every language" (end of §43); **§77.12** every user in their own language; **§81.6** offered plans and the trial-end plan; **§82.11** the eight new countries; **§86.14** the checker after competitor-check-8 (and §86's heading) |
| C — corrections | Struck in place with "⛔ Corrected V16.9" (§3) |
| D — sweep | §4; the counts are in the Changelog's SWEEP STATUS line |
| E — invariants | **35.an-17 … 35.an-25**, appended to §35.an |
| F — backlog | A new **"Added V16.9"** block at the end of §27; three §27 items struck "✅ Done V16.9"; the two signup-variable lines annotated, not struck; §53.8 item 17 corrected (G11 closed; the flag still open) |
| G — deploy posture | A new current block at the top of §49 (the heading now says "current at V16.9"). V16.8's stays as dated history. |
| H — tooling | At the end of §79, plus one line from this application (a `NEXT_PUBLIC_*` variable needs a new build; check the live chunk) |

**Placement:**
- No section owned "the demo" as a whole. §55 (the outreach demo) is the closest, and its flow is now shared, so the
  rebuilt demo went there.
- Email, signup and legal share §43 ("Legal, email and domain").
- The diff is 558 lines added and 36 removed, in `docs/reference-manual.md` only.

## 3 · Corrections in place

**From Part C:**
- **C1 · signup off:** §53.8 item 17 corrected. The sender is fixed and G11 is closed. Both variables are set (stated),
  but the client flag is OBSERVED unset in the live build, so the item is still 🔴 open. §27's two "BOTH `SIGNUP_PUBLIC`
  VARIABLES" lines are annotated, not struck.
- **C2 · the sender:** §27's V11.14 item is struck "✅ Done V16.9".
- **C3 · seeding:**
  - §56 "re-seeds via `seedDemoOrders`" → seeds nothing;
  - §56 T2 "DemoUpload navigates the visitor to the dashboard … seeded" → `/try/<slug>`, nothing seeded;
  - §55's V13.6 browser flags → retired with DemoWelcome / DemoLoopComplete.
- **C4 · `/demo/<ref>`:** §55 now says it redirects to `/try/<slug>`.
- **C5 · demo orders need an email:** §56 "Seeded vs visitor-placed … `/api/orders/submit` requires it" → no email,
  "Alex", told apart by order keys.
- **C6 · legal pages en-GB:** §83.8 and §84.2.
- **C7 · the tagline:** §38's canonical wording and its hero/footer line.
- **C8 · 600 s / whole-answer rejection:** **nothing to strike.** The manual never recorded the deep check's 600 s limit
  or the rejection; the only "600 s" is the login token's lifetime. §86.14 states the behaviour now.
- **C9 · Pay as you go everywhere:** §81.1 "When any plan ends" and §81.2 `is_expiry_fallback`.
- **C10 · 14 codes, four allergen sets:** §82.6 (22 codes), §76.6 and §83.4 (seven sets: + jp, br, codex). Both
  OBSERVED in the live CHECKs.
- **C11 · Terms §4:** §43's summary ("one plan has no monthly fee" / "the no-fee plan").
- **C12 · G11:** closed, in §53.8 item 17.

**Not in Part C, found while applying:**
- §27 "Outside Europe (no rows yet): Singapore, Hong Kong, …" struck as done (all eight have rows; OBSERVED switched on).
- §27 "Terms and privacy in each country's language" struck as done.

## 4 · The sweep (Part D)

The patterns were run over the whole V16.8 manual, before any edit. The totals: **30 hits**; 6 corrected; 17 left as
history; 7 not stale; 0 outstanding. Separately, **15 were found outside the patterns** and corrected (21 corrections in
all).

| # | Pattern | Found | Corrected | History | Not stale |
|---|---|---|---|---|---|
| 1 | `Less time booking\|more time cooking` | 4 | 2 (§38) | 2 (V9.9 changelog; §48's dated colour observation) | 0 |
| 2 | `seedDemoOrders\|DemoWelcome\|DemoLoopComplete\|busy Saturday\|busy service` | 11 | 1 (§56) | 10 (V13.1/13.5/13.6 changelogs ×6, §35 anecdotes ×3, the capability-parity fix record) | 0 |
| 3 | `/demo/<ref>.*dashboard\|dashboard/<token>` | 3 | 0 | 0 | 3 (not demo: native navigation, PostHog) |
| 4 | `signup_closed\|Save my menu` | 2 | 1 (§53.8) | 1 (V13.1 changelog) | 0 |
| 5 | `legal pages stay en-GB\|legal.*English only\|en-GB only` | 2 | 0 | 0 | 2 (a different "en-GB only") |
| 6 | `600 s\|600s` | 2 | 0 | 0 | 2 (token lifetimes) |
| 7 | `is_expiry_fallback` | 1 | 1 (§81.2) | 0 | 0 |
| 8 | `14 codes\|'RON'\)` | 5 | 1 (§82.6) | 4 (V16.3 changelog, older §49 posture, §82.2, §83.1) | 0 |
| 9 | `'uk14', 'us9', 'anz', 'ca'\)` | 0 | — | — | — |
| 10 | `plan with no monthly fee` | 0 | — | — | — |

**Found outside the patterns (15):**
- §55 `/demo/<ref>`, and §55's browser flags;
- §56 T2 landing, and §56 seeded vs visitor;
- §83.8 and §84.2 legal en-GB;
- §76.6 and §83.4 allergen sets;
- §81.1 the expiry fallback;
- §43 Terms §4;
- §27 the sender, the terms-in-each-language line and "Outside Europe";
- §27 the two signup-variable lines (annotated).

**After applying:** the patterns were run again. Every unmarked hit is either dated history or the new V16.9 text itself.

## 5 · OBSERVED when applying (1 Nov, about 17:30–18:30 UTC)

**Git:**
- `origin/main` = HEAD = `2b625a66` "additional countries" (1 Nov 17:21 UTC), with a clean tree.
- **Commits since V16.8:**
  - `4492717b` "compete fix" (31 Oct 19:50): DemoWelcome, DemoLoopComplete and `demo-welcome-open.cjs` deleted;
  - `3240c536` "competitor check 8" (31 Oct 19:50): demo-2, -2b, -2c and competitor-check-8, with 20261052 / 20261053;
  - `2b625a66` (1 Nov 17:21): world-countries-1, -2, -3 and legal-languages-1, with 20261054 / 20261055.
- The site serves the newest build.

**Public:**
- `/uk` 200, no tagline;
- `/fr/privacy` 200, French, `lang="fr-FR"`, the governing-English line and "31 octobre 2026";
- `/try/<a slug that does not exist>` 200 with `noindex, nofollow`;
- `/ae` 200, `lang="ar-AE" dir="rtl"`;
- `/signup` 200;
- `/terms` and `/country-terms` carry world-countries-3's three sentences;
- the client signup flag is unresolved in the live chunk (top of this report);
- the signup POST was not sent.

**Migrations:** 20261052–20261055 all run. U1 is not visible (`check_requested_at` null for Clover and Lightspeed).

**Countries:**
- 44 rows, all enabled, including the eight (top of this report);
- 132 `plan_prices` rows (24 for the eight);
- `platform_fee_allowed = false` for BR, MX, MY, SG, TH, where Pay as you go and Pro are not offered and Unlimited is the
  trial-end plan;
- currency CHECK 22 codes; allergen CHECK 7 sets;
- no truck in any of the eight.

**Checker:**
- settings: `deep_time_limit_seconds` 1800; one batch re-read; `deep_country` **CZ** (DE at V16.8); 11 runs; October
  $3.1851, November so far $1.9241;
- the 1 Nov pass checked 40 for $0.0196, and its deep run checked 15 for $1.70;
- 1,262 findings, all pending;
- the 31 Oct pass's notes confirm the 17-union cause.

**Demo:**
- 3 `demo_sessions` (newest 27 Oct), none with a visitor email;
- `demo_events` 0 rows;
- no stored menu files;
- no operator created since 1 Nov.

## 6 · Every query and command that was run

**Git:**
```
git fetch --quiet origin
git log origin/main -1 --format='%h %ci %s'
git log -1 --format='%h %ci %s'
git status --short
git log --format='%h %ci %s' c7242ad8..origin/main
git show --stat 2b625a66            (filtered for the reports)
git log --format='%h %cs' -- supabase/migrations/2026105{2,3,4,5}_*.sql
git log --format='%h %cs' --diff-filter=A -- docs/<each source report>
git show --stat --format='%h %s' 4492717b
git show --stat --format='' 3240c536
git show 2b625a66:docs/reference-manual.md | head -1
git diff --stat docs/reference-manual.md
```

**Curl (GET, public pages only):**
```
curl -sS https://www.hatchgrab.com/uk | grep -ciE "less time booking|more time cooking"
curl -sS -o /dev/null -w "%{http_code}" https://www.hatchgrab.com/uk
curl -sS https://www.hatchgrab.com/fr/privacy        (html lang, the translation line, title, date)
curl -sS -D - https://www.hatchgrab.com/try/v169-readonly-check   (status, robots meta)
curl -sS https://www.hatchgrab.com/signup
curl -sS https://www.hatchgrab.com/trucks/demo-xqgxma7hexysse3qwx0714vxc7/order, then its 26 /_next/static chunks
   (grep NEXT_PUBLIC_SIGNUP_PUBLIC)
curl -sS https://www.hatchgrab.com/ae
curl -sS https://www.hatchgrab.com/country-terms     (grep the Secretaría sentence and the Canada line)
curl -sS https://www.hatchgrab.com/terms             (grep "Section 10 sets out")
```
- **Refused by the session's permission rules, and so not sent:** `POST https://www.hatchgrab.com/api/signup` with the
  body `{}` (no email, so it could not have created an account).
- One response-header file was briefly written to `/tmp/h.txt` and deleted at once. Every other file went to the
  scratchpad.

**Read-only SQL:**
```sql
select table_name, column_name from information_schema.columns where table_schema = 'public' and ((table_name = 'demo_sessions' and column_name in ('visitor_email','email_given_at','marketing_opt_in','marketing_opt_in_at')) or (table_name = 'demo_cleanup_log' and column_name = 'files_deleted') or (table_name = 'competitor_check_settings' and column_name in ('deep_time_limit_seconds','pass_batches_reread')) or (table_name = 'competitors' and column_name = 'deep_progress') or (table_name = 'country_settings' and column_name = 'platform_fee_allowed') or (table_name = 'plan_prices' and column_name in ('offered','is_trial_end'))) order by 1, 2;
```
```sql
select (select to_regclass('public.demo_events') is not null) as demo_events_exists, (select count(*) from public.demo_events) as demo_events_rows, (select json_build_object('id', id, 'public', public, 'size', file_size_limit, 'mime', allowed_mime_types) from storage.buckets where id = 'demo-menus') as demo_menus_bucket, (select pg_get_constraintdef(oid) from pg_constraint where conname = 'competitor_check_runs_stopped_reason_check') as stopped_reason_check, (select json_agg(json_build_object('name', name, 'check_requested_at', check_requested_at)) from public.competitors where name in ('Clover', 'Lightspeed')) as u1;
```
```sql
select (select array_agg(tgname order by tgname) from pg_trigger where tgname in ('country_settings_world_guard', 'plan_prices_world_guard')) as triggers, (select json_agg(json_build_object('cc', country_code, 'enabled', enabled, 'locale', locale, 'currency', currency, 'fee_allowed', platform_fee_allowed, 'allergens', allergen_set) order by country_code) from public.country_settings where country_code in ('BR','MX','JP','SG','HK','MY','TH','AE')) as eight, (select count(*) from public.plan_prices where country_code in ('BR','MX','JP','SG','HK','MY','TH','AE')) as eight_plan_prices, (select array_agg(country_code order by country_code) from public.country_settings where not platform_fee_allowed) as fee_not_allowed, (select json_agg(json_build_object('cc', country_code, 'plan', plan_key, 'offered', offered, 'trial_end', is_trial_end) order by country_code, plan_key) from public.plan_prices where not offered or is_trial_end) as not_offered_or_trial_end, (select count(*) from public.country_settings) as countries, (select count(*) from public.country_settings where enabled) as enabled;
```
```sql
select column_name from information_schema.columns where table_schema='public' and table_name='country_settings' and (column_name ilike '%updated%' or column_name ilike '%enabled%' or column_name ilike '%created%') order by 1;
```
```sql
select country_code, enabled, updated_at, case when updated_by is null then null else 'set' end as updated_by_present from public.country_settings where country_code in ('BR','MX','JP','SG','HK','MY','TH','AE') order by updated_at;
```
```sql
select slug from public.trucks where id like 'demo-%' order by created_at desc limit 1;
```
```sql
select column_name from information_schema.columns where table_schema='public' and table_name in ('competitor_check_runs','competitor_check_findings') order by table_name, ordinal_position;
```
```sql
select (select json_agg(json_build_object('started', started_at, 'mode', mode, 'trigger', trigger, 'stopped', stopped_reason, 'checked', competitors_checked, 'cost', cost_usd) order by started_at) from public.competitor_check_runs where started_at >= '2026-10-30') as runs_since_30oct, (select count(*) from public.competitor_check_runs) as runs_total, (select round(sum(cost_usd)::numeric, 4) from public.competitor_check_runs where started_at >= date_trunc('month', now() at time zone 'utc')) as cost_this_month_utc, (select round(sum(cost_usd)::numeric, 4) from public.competitor_check_runs where started_at >= '2026-10-01' and started_at < '2026-11-01') as cost_october, (select count(*) from public.competitor_check_findings) as findings, (select json_object_agg(coalesce(review_status, 'null'), n) from (select review_status, count(*) n from public.competitor_check_findings group by 1) x) as findings_by_status;
```
```sql
select deep_time_limit_seconds, jsonb_array_length(pass_batches_reread) as batches_reread, pass_batch->>'id' as pass_batch_id, pass_batch->>'submittedAt' as pass_batch_submitted, deep_country, deep_requested_at, paused, daily_cap_usd, monthly_cap_usd, deep_per_day, (select count(*) from public.competitors where deep_progress <> '{}'::jsonb) as competitors_with_progress from public.competitor_check_settings;
```
```sql
select (select count(*) from public.demo_sessions) as demo_sessions, (select count(*) from public.demo_sessions where visitor_email is not null) as with_visitor_email, (select count(*) from public.demo_sessions where marketing_opt_in) as tips_ticked, (select max(created_at) from public.demo_sessions) as newest_demo, (select count(*) from storage.objects where bucket_id = 'demo-menus') as stored_menu_files, (select count(*) from public.operators where created_at >= '2026-11-01') as operators_created_since_1nov, (select count(*) from public.plan_prices) as plan_prices_total, (select count(*) from public.trucks where country in ('BR','MX','JP','SG','HK','MY','TH','AE')) as trucks_in_new_countries;
```
```sql
select started_at, left(notes, 700) as notes from public.competitor_check_runs where mode = 'pass' and started_at >= '2026-10-31' and started_at < '2026-11-01';
```
```sql
select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.country_settings'::regclass and conname in ('country_settings_currency_chk', 'country_settings_allergen_set_chk', 'country_settings_platform_fee_allowed_chk') order by conname;
```

One query failed and changed nothing: it named a column `outcome` that `competitor_check_runs` does not have. It was
re-run without it (the runs query above).

## 7 · Decisions needed from Dominic

```
1. The UAE (and the other seven) are live since 1 Nov 17:25 UTC. Is AE meant to be on? If not, switch it off in
   Admin › Countries. The RTL conversion was deferred on the basis that it stays off.
2. The client signup flag is not in the live build. Redeploy Production without the build cache, then confirm the
   demo shows "Start free for 3 months, keep my menu".
```

## Undo (only if Dominic asks)

No SQL. The V16.8 manual is in the scratchpad copy named in §1; restoring it is a file copy over
`docs/reference-manual.md`.
