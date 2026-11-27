# manual-v16-43 + deploy-prep-1: ready to push (Part B done); Part A still blocked: no v16-43 delta in ~/Downloads (27 Nov 2026)

## 1 · Summary

- **Part B is done, steps 1–7.** The stop at step 4 was cleared with Dominic's decisions (27 Nov):
  1. (a) the translation checker accepts the 15 English-only guide keys;
  2. the three scope proofs are re-pinned to their own last commits;
  3. run Part A.
- **The sweep is back to the known failures only: 19 harnesses**, all in the recorded baseline of 20, at the same counts. The 20th, event-types-render, now passes. The new harness deploy-prep-1 passes 8/0. `tsc` reports 0 errors and `npm run build` exits 0.
- **Every local production-server check passes** (§8): the GB, FR and GU comparison pages and the GB twins, /privacy, the 401, and the test-kitchen order page.
- **Local `main` has been fast-forwarded** to france-vat-1, the commit carrying this report. **Nothing was pushed.** The push command and the after-deploy list are in §10.
- **Part A still didn't run.** Dominic said the v16-43 delta is now in ~/Downloads, but it isn't there (§2). The manual stays at V16.42.
- **No deploy, no workflow change, no database writes, no .env file opened.**

## 2 · Part A: the manual (still blocked)

**Checked at 27 Nov.**

- ~/Downloads has no file newer than `reference-manual-delta-v16-41.md` (26 Nov 13:35). That file was already applied as V16.42 at Dominic's instruction.
- No file in ~/Downloads mentions "16.43".
- A search of the home folder outside the repo found no recently changed `.md`, `.txt` or `.docx` file.

So no section E SQL ran and nothing was committed for Part A.

**Needs:** the delta saved as `~/Downloads/reference-manual-delta-v16-43.md`. If the browser saved it under another name or folder, tell me where.

## 3 · Decision 1: the 15 English-only guide keys

**Dominic's decision:** option (a). "Let the translation checker accept the 15 English-only comparison.fit keys while the guide is hidden in that country (fit_off), with a dated note in the checker. Don't add any non-English text."

**What changed** (commit `068ddf7c`):

- **`docs/i18n/english-only-keys.json` (new)** holds one group, `comparison.fit`, with:
  - the 15 keys;
  - `since: 2026-11-27`;
  - why they're English only: compare-suits-fix-2, `97d47768`;
  - what hides them: `comparison_country_copy.fit_off`;
  - `notFor: []`.
  - Its note says: when a non-English country's guide is switched on, first translate these keys in its language, then add that language (or locale) to `notFor`. The checker then counts them as missing there again.
- **`scripts/translation-check.cjs`:**
  - a dated note, and an `englishOnly(key, locale)` test;
  - a listed key isn't counted as missing in a non-English language (unless it's in `notFor`);
  - English locales are never excused;
  - every other check still runs on these keys wherever a language has them (ICU, placeholders, flags);
  - `englishOnly` is exported.
- **`scripts/_lp-france-vat-1.cjs` `missingKeys`** (the unused-base set-aside that country-picker-1 and paperwork-1 use) now applies the same rule, with a dated note.
  - Without this, the 5 unused bases (vi-VN, hi-IN, ur-PK, fil-PH, ta-LK) stopped matching their exact set-aside list.
- **No non-English text added.** The new harness checks this: none of the 96 non-English message files carries any of the 15 keys.

**"While hidden", checked against live data** (read-only, §11): **non-English countries showing the guide: 0** (of 134 non-English country rows).

**New harness `scripts/deploy-prep-1.cjs`: 8/0.** It checks:

- the list holds exactly the 15, which are exactly the keys fr-FR lacks;
- fr-FR has 0 missing;
- control: an unlisted comparison key removed from fr-FR is still missing;
- control: an English locale is never excused;
- control: a listed key that a language does carry is still parsed (the ICU fault is caught);
- no non-English file carries the keys.

It's added to `scripts/harnesses.json`.

**The seven harnesses:**

| Harness | Before | Now |
|---|---|---|
| faq-2 | 59 failed | 173/0 |
| faq-3 | 59 failed | 198/0 |
| faq-4 | 59 failed | 111/0 |
| europe-languages-1 | 28 failed | 427/0 |
| world-countries-1 | 7 failed | 178/0 |
| country-picker-1 | 1 failed | 45/0 |
| paperwork-1 | 1 failed | 115/0 |

## 4 · Decision 2: the three scope proofs re-pinned

Each one now compares up to the harness's own last commit, which is hardcoded: the re-pin commit itself becomes each file's newest. Each has a dated ⚠️ note. **Only my own comparison commits touched the pinned files after those commits:** compare-suits-fix-2 `97d47768`, and compare-cache-1 `30ec10c5` and `5dcf78ce`.

| Harness | Check | Now compares | Result |
|---|---|---|---|
| till-pack-2 | section I: no screen, page, ticket or email file changed; the message files change by one key | START `2ae128bc` with **`ed05a575`** (its own last commit, till-pack-5-6's sweep), for both the file list and the message contents | **68/0** |
| countries-api | "…clears the loader's cache after every successful write" | the route **as at `0db83f8b`**. The two checks around it still read the working tree. compare-cache-1's added refresh line is proved by compare-cache-1 (53/0). | **85/0** |
| cwv-2 | "proxy.ts is otherwise exactly as before" | proxy.ts **as at `1e10844e`**, with the same undo chain (gsc-index-2, app-fixes-1, partners-2). compare-cache-1's host rule is proved by compare-cache-1. | **42/2**: back to its 2 baseline failures |

## 5 · Step 1: what's in the batch

- **`france-vat-1` is 620 commits ahead of `origin/main` (`5df925d8`, vercel-cost-1, 23 Nov) and 0 behind**, so it **fast-forwards**. That's 617 at the stop (its report `6c091892` included), plus `068ddf7c`, this report (`d41f667b`) and this count's correction.
- `origin/main` is unchanged after a fresh `git fetch`.

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
| compare-research-2 | 5 |
| compare-research-1, compare-fix-2 | 4 each |
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
| privacy-processors-1 | 3 (with the harness fix) |
| manual-v16-36 … v16-42 | 8 |
| deploy-prep-1 | 3 (the stop report, the decisions, this report) |

**Landing pages: none changed.** No file under `components/landing`, the landing routes, `app/(public)/[country]/page.tsx` or `components/pricing` differs from origin/main.

**Built but switched off or observe-only.** These go out with the deploy, as their reports say:

- **Enquiries:** intake and drafts are off (`enquiries_intake_enabled` false).
- **Inbox:** the alias From is off.
- **The till module:** observe mode; pack-3 enforcement not built; the screens need mockups; no signing key registered yet.
- **The comparison guide:** hidden in every non-English country.

## 6 · Step 2: the database

The project keeps **no migration run ledger** (`scripts/db-migrate.cjs` applies over `pg` and records nothing). So each migration was judged by its effects on the schema, as earlier deploy checks did.

- **The 31 migrations new since origin/main** (`20261123_enquiries_backend_1` … `20261150_till_pack_5_6`): every table, column, function, trigger and storage bucket they create, **135 distinct objects**, was checked read-only. **All exist; none is missing.** The query is in §11.
- **The data migrations' effects, spot-checked:**
  - checker tiers 90 / 180 / 365, monthly cap 50;
  - food_truck_class A 16 · B 34;
  - `comparison_country_copy` 96 rows;
  - Hatches Up's website;
  - What The Truck's plan "(online fee + VAT)" 395;
  - Chuzmonster's order.yapp.li;
  - 96 live comparison countries.
- **The deploy needs no migration.** Nothing new was written for it.

## 7 · Step 3: settings

**Vercel Production environment variables:** Dominic is checking these names himself; the Vercel CLI isn't installed here.

- **New since origin/main:**
  - `ANTHROPIC_API_KEY`: enquiries drafting and translation (switched off; needed before open item 41 is switched on);
  - `TILL_SIGNING_KEY`: till closes and archives are signed with it, or marked "signed later" without it.
- **Read by the batch and already read by origin/main** (should already be set): `REVALIDATE_SECRET` (the comparison and marketing refresh), `CRON_SECRET`, `BREVO_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`.

**GitHub Actions** (`gh secret list` / `gh variable list`, names only):

- **Present:** `SUPABASE_DB_URL`, `REVALIDATE_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` (plus GEMINI_API_KEY, GOOGLE_SHEETS_CREDENTIALS, HATCHGRAB_API_URL, INBOUND_SCHEDULE_SECRET, SPREADSHEET_ID).
- **Variables:** ANTHROPIC_FEDERATION_RULE_ID, ANTHROPIC_ORGANIZATION_ID, ANTHROPIC_SERVICE_ACCOUNT_ID, ANTHROPIC_WORKSPACE_ID.
- **Missing, optional:** `BREVO_API_KEY` and `EMAIL_FROM_ADDRESS`. Without them, the competitor-check workflow skips its summary email with a warning.
- **The site address for the refresh:** `REVALIDATE_BASE_URL` isn't set and isn't needed; the scripts default to `https://www.hatchgrab.com`.

**So nothing the workflow's publish needs is missing.**

## 8 · Step 4: checks (cleared)

- **`tsc --noEmit`: 0 errors.**
- **`npm run build`: exit 0.**
  - `/[country]/[section]/[slug]` and `/api/compare/[country]/[section]/[slug]/[format]` are **● (generateStaticParams, ISR)**.
  - `/api/compare/preview` and `/api/revalidate` are ƒ (dynamic), as they must be.
- **The sweep:** `run-harnesses.cjs` over `harnesses.json` minus compare-fix-2 and checker-prep-1, which is 247 harnesses including the new deploy-prep-1.
  - The runner's screen refuses the whole run if either of those two is listed, because they name the service-role key; both pass when run directly.
  - **19 failed**, all in the recorded baseline of 20 (till-pack-5-6's sweep, 25 Nov): billing-1, contact-1, costs-accounts-1, country-settings-parity, cwv-2, faq-1, france-1, inbox-2, language-phase-1b, -1c, -1d, -1d2, -1e, -2, legal-languages-1, loyalty-1, screenshot-truck-details, site-chrome-1, tidy-1.
  - **The counts match the baseline's recorded ones:** billing-1 130/1, costs-accounts-1 77/1, loyalty-1 80/1, cwv-2 42/2, legal-languages-1 407/1, language-phase-2 1770/404.
  - **event-types-render now passes.** It was the 20th; its failures came from stale build CSS, and the fresh build replaced that CSS.
  - inbox-2's one failure is its own check that the screen accepts every listed harness. It fails because compare-fix-2 and checker-prep-1 sit in harnesses.json; it's pre-existing and in the baseline.
  - **Nothing new fails.**
- vercel-cost-1 and compare-de-1-screens aren't in harnesses.json, so the sweep doesn't run them. Their known failures (3 and 2) are explained in compare-cache-1-report appendix 2.
- The sweep rewrites the inbox-1 screenshots, which another session has left modified. I restored them byte for byte from a copy taken before the sweep.

## 9 · Step 5: the local production server

`next start` ran on port 3911, reading live data read-only, with the host `hatchgrab.localhost`. GET only, except the one POST without a secret. No order was placed, and no live truck was loaded.

| Check | Result |
|---|---|
| **GB** `/uk/comparison/food-truck-ordering-system` | **200**: first render 9.5 s, then **4 ms, `x-nextjs-cache: HIT`, `s-maxage=2592000`**. "Which system suits whom?" shown; line-up Ordea · What The Truck · Hatches Up · Square; "What The Truck (online fee + VAT)" shown |
| **FR** `/fr/comparatif/logiciel-de-commande-food-truck` | **200**: 7.6 s, then 7 ms, HIT, `s-maxage=2592000`; **no guide** (fit_off) |
| **GU** `/gu/comparison/food-truck-ordering-system` | **200**: 1.4 s, then 5 ms, HIT, `s-maxage=2592000` |
| **GB `.md` / `.json` twins** | **200** `text/markdown` / `application/json`, both HIT; the .md starts "# Food truck ordering systems compared 2026 · Last checked: 26 November 2026" |
| GB on the villagefoodie host | **404** (proxy.ts host rule) |
| **/privacy** | **"Last updated: 27 November 2026"**; Anthropic (Claude) and Namecheap rows present |
| **POST /api/revalidate**, no secret / wrong secret | **401 / 401** |
| **GET /trucks/test-kitchen/order** | **200** in 0.12 s ("Order from Pizza Kitchen", test-kitchen's display name) |
| Server log | no error, no `DYNAMIC_SERVER_USAGE` |

The UK's address segment is `/uk`, not `/gb`. `/gb/…` correctly 404s.

## 10 · Steps 6 and 7: `main` and the deploy

**Step 6, done locally.** `main` was fast-forwarded to france-vat-1's HEAD, the commit carrying this report.

- It was done with `git fetch . france-vat-1:main`. That command only moves `main` by a fast-forward (it refuses anything else) and leaves the working tree alone.
- The prompt's `git checkout main && git merge --ff-only france-vat-1` gives the same `main`. But it would switch the checkout and carry the other session's 26 modified files across.
- Before the fast-forward, `main` was `59ae6161`, an ancestor of france-vat-1. **Nothing was pushed**: origin/main is still `5df925d8`.

**Step 7, the push (for Dominic to run):**

```
cd ~/dev/village-foodie
git log --oneline -1 main          # the deploy-prep-1 report commit
git push origin main
```

Optionally, `git push origin france-vat-1` keeps the branch on GitHub as well.

**Then the after-deploy list:**

1. **Before or with the deploy:** confirm Vercel Production has `ANTHROPIC_API_KEY` and `TILL_SIGNING_KEY` (Dominic is checking). Neither blocks the deploy: enquiries are off, and closes are "signed later" without the key.
2. **Wait for the Vercel deployment to be Ready.** Comparison pages start uncached: each country's first visit renders (about 1.5–10 s), and later visits are served from the cache for 30 days or until refreshed.
3. **Live checks:**
   - `https://www.hatchgrab.com/uk/comparison/food-truck-ordering-system` gives 200, and a second load is served from cache (`x-vercel-cache: HIT`). It shows the guide, Hatches Up and "What The Truck (online fee + VAT)".
   - The FR page has no guide.
   - `…/food-truck-ordering-system.md` gives 200.
   - `https://www.hatchgrab.com/privacy` says 27 November 2026.
   - `curl -X POST https://www.hatchgrab.com/api/revalidate` gives 401.
   - The comparison address on villagefoodie.co.uk gives 404.
   - The test-kitchen order page loads.
4. **Admin › Pricing check:** the newest plans (Square, What The Truck, Hatches Up) now appear, because the paging fix `e9626ca8` ships with this deploy. Supabase Max rows stays at 1,000; no change is needed.
5. **The refresh path, once live:** a save in Admin › Countries, Billing or Pricing check refreshes only the affected countries' comparison pages. The next comparison publish or competitor-check run posts `comparison-<CC>` tags.
   - **Don't trigger a publish run before the deploy is live:** the current live `/api/revalidate` doesn't accept those tags yet.
6. **Nobody is asked to accept the terms again.** `TERMS_VERSION 2026-11-27` is only recorded on new signups.
7. **Open items, carried over** (no deploy action):
   - the native-speaker check of the 54 privacy translations;
   - the comparison guide's words in other languages (translate them, then add the language to `notFor`, then set fit_off false);
   - till pack-3;
   - enquiries' Claude sign-in, retention and privacy points.

## 11 · SQL run (read-only)

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

**3. Which countries hide the guide** (decision 1's "while hidden"):

```sql
select count(*) filter (where cs.locale not ilike 'en-%') as non_english,
       count(*) filter (where cs.locale not ilike 'en-%' and coalesce(c.fit_off, true) = false) as non_english_shown,
       count(*) filter (where cs.locale ilike 'en-%' and coalesce(c.fit_off, false) = false) as english_shown
from public.country_settings cs left join public.comparison_country_copy c on c.country_code = cs.country_code;
```

The result: non_english 134, **non_english_shown 0**, english_shown 77. These counts cover every country_settings row, live or not.

## 12 · Other sessions' files, left alone

**Modified, not mine** (not in any commit):

- `docs/inbox-1/*.png` (16, restored after the sweep);
- `docs/plans-everywhere-5-report.md`;
- `docs/till-pack-1/{chain-check.jsonl,rows-check.json,timings.json}`;
- `docs/till-pack-2/{chain-check.jsonl,rows-check.json}`;
- `scripts/fixtures/language-phase-{1d,1d2,1e,2}-us-changed.txt`.

**Untracked, another session's:** `docs/manual-v16-37-report.md`, `docs/manual-v16-39-report.md`, `docs/till-law-1-report.md`, `docs/till-pack-0-report.md`.

**Untracked, mine:** read-only reports left uncommitted, as those prompts said. They are `docs/compare-calc-check-1-report.md`, `docs/compare-suits-fix-1-report.md` and `docs/manual-v16-42-report.md`.

## Undo (only if Dominic asks)

- **The local fast-forward of `main`:** `git branch -f main 59ae6161` (main's commit before step 6; run it while on france-vat-1). Nothing was pushed, so nothing remote needs undoing.
- **Decisions 1 and 2:** `git revert 068ddf7c`. The seven translation harnesses and the three scope proofs would fail again.

## Flags

- Nothing in either prompt arrived garbled, and no instructions contradicted each other.
- **Part A is blocked on a missing file.** The prompt says the v16-43 delta is in ~/Downloads; it isn't (§2).
- **One slip, fixed:** restoring the other session's files after the sweep also put back my pre-sweep copy of `scripts/translation-check.cjs`. That copy didn't yet export `englishOnly`, because the backup was taken before I added the export.
  - I re-added the line before committing, and reran deploy-prep-1, paperwork-1 and country-picker-1: all pass.
  - The sweep itself ran with the export in place.
- **No push, no deploy**, no workflow change, no database writes, no .env file opened.
