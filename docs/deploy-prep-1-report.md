# manual-v16-43 + deploy-prep-1: STOPPED at step 4 (new harness failures); the manual delta is missing (27 Nov 2026)

## 1 · Summary

- **Part A (the manual) didn't run.** There's **no `reference-manual-delta-v16-43.md` in ~/Downloads**: the newest there is v16-41, which was applied as V16.42 on 26 Nov. The manual is still V16.42.
- **Part B stopped at step 4, as the prompt says.** The full sweep has **9 harnesses failing that aren't in the recorded baseline**, plus a third cwv-2 check.
  - **All of them trace to my own comparison work of 26–27 Nov** (compare-suits-fix-2 `97d47768`, compare-cache-1 `30ec10c5`). None comes from the other workstreams.
  - None is a runtime fault. They're translation-completeness checks and scope proofs.
  - I missed them because I ran only the comparison harnesses after those changes, not the full sweep.
- **Not done** because of the stop: step 5 (the local production server checks), step 6 (fast-forwarding `main`) and step 7 (the deploy instructions). Nothing was pushed, deployed, enabled or written to the database.
- **Checked and fine:** steps 1–3.
  - the batch fast-forwards and contains no landing-page change;
  - every schema object of the 31 new migrations exists in production;
  - nothing the workflow needs is missing from GitHub;
  - `tsc` reports 0 errors.

## 2 · Part A: the manual

`~/Downloads` holds `reference-manual-delta-v16-40.md` and `reference-manual-delta-v16-41.md` only, and both are already applied (V16.40; v16-41 as V16.42). So no section E SQL ran and nothing was committed for Part A.

**Needs:** the v16-43 delta saved to ~/Downloads.

## 3 · Step 1: what's in the batch

- **`france-vat-1` is 615 commits ahead of `origin/main` (`5df925d8`, vercel-cost-1, 23 Nov) and 0 behind**, so it **fast-forwards**.
- Local `main` (`59ae6161`) is 2 ahead of origin/main and is an ancestor of france-vat-1.

**By workstream** (commit counts):

| Workstream | Commits |
|---|---|
| compare-research-7 | 239 |
| compare-research-6 | 143 |
| compare-research-3 | 89 |
| compare-research-4 | 23 |
| compare-research-5 | 14 |
| compare-research-3b | 8 |
| compare-cache-1 | 7 |
| compare-research-1 | 4 |
| compare-fix-2 | 4 |
| compare-research-2 | 5 |
| compare-suits-fix-2, compare-calc-fix-1, hatches-up-1, checker-prep-1 | 3 each |
| compare-fix-1, compare-square-1, plan-names-1, checker-cadence-1 | 2 each |
| compare-research-1c, compare-territories-1, foodtruck-audit-1 | 1 each |
| till-pack-5-6, till-pack-2 | 5 each |
| till-pack-1 | 4 |
| till-pack-1b | 3 |
| till-pack-4 | 2 |
| france-vat-1, france-records-1, france-receipts-1, france-notes-1 | 4 each |
| vat-live-check-1 | 2 |
| france-privacy-1, france-privacy-2 | 1 each |
| inbox-1 | 3 |
| inbox-2, enquiries-backend-1 | 2 each |
| privacy-processors-1 | 3 (with today's harness fix) |
| manual-v16-36 … v16-42 | 8 |

**Landing pages: none.** No file under `components/landing`, the landing routes, `app/(public)/[country]/page.tsx` or `components/pricing` differs from origin/main.

**Built but switched off or observe-only.** These go out with the deploy, as their reports say:

- **Enquiries:** intake and drafts are off (`enquiries_intake_enabled` false).
- **Inbox:** the alias From is off.
- **The till module:** observe mode; pack-3 enforcement not built; screens need mockups; no signing key registered yet.
- **The comparison guide:** hidden in the 77 non-English countries.

## 4 · Step 2: the database

The project keeps **no migration run ledger** (`scripts/db-migrate.cjs` applies over `pg` and records nothing). So each migration was judged by its effects, as earlier deploy postures did.

- **The 31 migrations new since origin/main** (`20261123_enquiries_backend_1` … `20261150_till_pack_5_6`): every table, column, function, trigger and storage bucket they create, **135 distinct objects**, checked read-only. **All exist; none is missing.** The query is in §9.
- **The data migrations' effects, spot-checked:**
  - checker tiers 90 / 180 / 365, monthly cap 50;
  - food_truck_class A 16 · B 34;
  - `comparison_country_copy` 96 rows;
  - Hatches Up's website;
  - What The Truck's plan "(online fee + VAT)" 395;
  - Chuzmonster's order.yapp.li;
  - 96 live comparison countries.

## 5 · Step 3: settings

**Vercel Production environment variables:** the Vercel CLI isn't installed on this machine, so **Dominic, please check these names exist** in Vercel › Settings › Environment Variables › Production.

- **New since origin/main:**
  - `ANTHROPIC_API_KEY`: enquiries drafting and translation (switched off; needed before Open item 41 is switched on);
  - `TILL_SIGNING_KEY`: till closes and archives are signed with it, or "signed later" without it.
- **Read by the batch and already read by origin/main** (should already be set): `REVALIDATE_SECRET` (the comparison and marketing refresh), `CRON_SECRET`, `BREVO_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`.

**GitHub Actions** (`gh secret list` / `gh variable list`, names only):

- **Present:** `SUPABASE_DB_URL`, `REVALIDATE_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` (plus GEMINI_API_KEY, GOOGLE_SHEETS_CREDENTIALS, HATCHGRAB_API_URL, INBOUND_SCHEDULE_SECRET, SPREADSHEET_ID).
- **Variables:** ANTHROPIC_FEDERATION_RULE_ID, ANTHROPIC_ORGANIZATION_ID, ANTHROPIC_SERVICE_ACCOUNT_ID, ANTHROPIC_WORKSPACE_ID.
- **Missing, optional:** `BREVO_API_KEY` and `EMAIL_FROM_ADDRESS`. The competitor-check workflow's comment: "email, optional … without them the email is skipped with a warning".
- **The site URL for the refresh:** `REVALIDATE_BASE_URL` isn't set and isn't needed; the scripts default to `https://www.hatchgrab.com`.
- **So nothing the workflow's publish needs is missing.**

## 6 · Step 4: checks (STOP)

- **`tsc --noEmit`: 0 errors.**
- **`npm run build`:** not run in this prompt (the stop came first). The last full build, 27 Nov, exited 0, after compare-cache-1's runtime fix (`5dcf78ce`), with the page and its twins ● ISR. The only commits since are appendix code (`0a5f70d2`, `fb58b8ee`) and harness and report changes.
- **The sweep:** `run-harnesses.cjs` over `harnesses.json` minus compare-fix-2 and checker-prep-1 (246 harnesses). Those two name the service-role key, so the runner's screen refuses the whole run with either listed, as in till-pack-5-6's sweep. Both pass when run directly.
  - **One fix was needed first:** my **privacy-processors-1** harness named the payments processor, which the screen refuses, so no sweep could run at all. Fixed and committed (`bfab1a40`): it finds that table row by position; 9/0.
  - vercel-cost-1 and compare-de-1-screens aren't in harnesses.json, so the sweep doesn't run them. Their known failures (3 and 2) are explained in compare-cache-1-report appendix 2.

**The result: 29 failed.** The baseline is the 20 harnesses that failed on both sides of till-pack-5-6's sweep (25 Nov): billing-1, contact-1, costs-accounts-1, country-settings-parity, cwv-2, event-types-render, faq-1, france-1, inbox-2, language-phase-1b, -1c, -1d, -1d2, -1e, -2, legal-languages-1, loyalty-1, screenshot-truck-details, site-chrome-1, tidy-1.

**New: 9 harnesses, plus one more cwv-2 check.** All are mine.

| Harness | What fails | Cause |
|---|---|---|
| **faq-2** (59), **faq-3** (59), **faq-4** (59), **europe-languages-1** (28), **world-countries-1** (7), **country-picker-1** (1), **paperwork-1** (1) | the translation checker's "structural 0": every non-English base is "**missing 15**: each would show its English fallback" | compare-suits-fix-2 (`97d47768`) added **15 English-only `comparison.fit` keys** (the new guide). Dominic decided "non-English locales get no new text: their guide is hidden". I re-pinned compare-languages-1 for that, but these seven harnesses run the shared translation checker, which requires every key in every base. **At runtime nothing shows:** the 77 non-English countries' guide is hidden (`fit_off`), so those keys are never asked for there. |
| **till-pack-2** (2) | "no screen … file changed (every .tsx untouched)" → `app/(public)/[country]/[section]/[slug]/page.tsx`; "the 86 message files change by exactly one key" | its scope proof against `2ae128bc`; the comparison page (compare-suits-fix-2, compare-cache-1) and the guide's message keys changed after it |
| **countries-api** (1) | "…clears the loader's cache after every successful write (and, perf-1, expires the marketing pages' country data)" | its pin of `app/api/admin/countries/route.ts`; compare-cache-1 added the `code` argument and the per-country comparison refresh to `guarded()` |
| **cwv-2** (3 now, 2 in the baseline) | the new third: "proxy.ts is otherwise exactly as before" | compare-cache-1's host rule in proxy.ts |

**Their effect on the deploy:** none at runtime. The translation gap is never shown, since non-English guides are hidden. The others are frozen scope proofs of earlier work. But they are new failures, so **I stopped, as asked**.

## 7 · What needs you (to clear the stop)

1. **The 15 English-only guide keys**, which fail 7 harnesses. Two options:
   - **(a) Recommended:** make the translation checker accept a short **English-only key list** (the 15 `comparison.fit` guide keys) for every non-English base, as long as that country's guide is hidden. One small list file plus the checker reading it, and the seven harnesses pass unchanged. Non-English still gets no new text, as you decided.
   - **(b)** Add the 15 keys to every base now, unchecked and never shown, to satisfy the checker. That contradicts "non-English locales get no new text".
2. **The scope proofs** (till-pack-2's two, countries-api's one, cwv-2's third): re-pin each to compare up to its own last commit, or to set aside the named comparison changes, as done for compare-fix-1, compare-square-1, compare-calc-fix-1 and others. Each would get a dated ⚠️ note.
3. **The v16-43 manual delta:** save it to ~/Downloads, or confirm Part A is dropped for now.

Once 1 and 2 are in and the sweep is back to the baseline 20, steps 5–7 follow:

- the local production server checks: GB / FR / GU comparison pages, GB .md, /privacy 27 November, the 401, test-kitchen GET;
- fast-forwarding `main`. `git checkout main` would carry the other session's 26 modified files; they don't block the fast-forward, but `git fetch . france-vat-1:main` does the same without touching the working tree;
- the push command and the after-deploy steps.

## 8 · Other sessions' files, left alone

**Modified, not mine:**

- `docs/inbox-1/*.png` (16);
- `docs/plans-everywhere-5-report.md`;
- `docs/till-pack-1/{chain-check.jsonl,rows-check.json,timings.json}`;
- `docs/till-pack-2/{chain-check.jsonl,rows-check.json}`;
- `scripts/fixtures/language-phase-{1d,1d2,1e,2}-us-changed.txt`.

**Untracked, another session's:** `docs/manual-v16-37-report.md`, `docs/manual-v16-39-report.md`, `docs/till-law-1-report.md`, `docs/till-pack-0-report.md`.

**Untracked, mine:** read-only reports left uncommitted as those prompts said. They are `docs/compare-calc-check-1-report.md`, `docs/compare-suits-fix-1-report.md` and `docs/manual-v16-42-report.md`.

## 9 · SQL run (read-only)

**1. The 31 migrations' schema objects** (135 distinct). A `values` list of (migration, kind, object, column), generated from each file's `create table`, `add column`, `create function`, `create trigger` and storage bucket insert. Then:

```sql
select json_build_object('checked', (select count(*) from want), 'missing', (select coalesce(json_agg(…),'[]') from want w where not (
  (kind='table' and exists (select 1 from information_schema.tables where table_schema='public' and table_name=w.obj)) or
  (kind='column' and exists (select 1 from information_schema.columns where table_schema='public' and table_name=w.obj and column_name=w.col)) or
  (kind='function' and exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=w.obj)) or
  (kind='trigger' and exists (select 1 from pg_trigger where tgname=w.obj and not tgisinternal)) or
  (kind='bucket' and exists (select 1 from storage.buckets where id=w.obj)))))
```

The result: checked 135, missing []. The full statement, with its values list, is in the session's scratch folder (migcheck.sql).

**2. The data effects:**

```sql
select json_build_object('checker_settings', (select json_build_object('tiers', tier_intervals, 'monthly_cap', monthly_cap_usd) from competitor_check_settings),
 'food_truck_class', (select json_object_agg(coalesce(food_truck_class,'null'), n) from (select food_truck_class, count(*) n from competitors group by 1) x),
 'country_copy_rows', (select count(*) from comparison_country_copy), 'hatches_up', (select website from competitors where id='fbbf6c37-2dd0-5f11-9e68-a0be5d563629'),
 'wtt_plan', (select plan_name||' '||card_bps from competitor_plans where id='8c777139-ad56-5b20-93c1-b9f44dc8bb1c'),
 'chuzmonster', (select website from competitors where id::text like 'da91c9a7%'),
 'live', (select count(*) from comparison_publish where auto_publish and auto_live and not coalesce(admin_off,false)));
```

The result: tiers core 180 / secondary 365 / commercial 90, cap 50; A 16 · B 34 · null 234; 96 rows; https://hatchesup.co.uk; "What The Truck (online fee + VAT) 395"; https://order.yapp.li; 96 live.

## Flags

- Nothing in the prompt arrived garbled.
- **Two blockers.** Part A's input file is missing. Part B hit its own STOP rule at step 4.
- **No push, no deploy**, no workflow change, no database writes, no .env file opened. Only names were listed.
