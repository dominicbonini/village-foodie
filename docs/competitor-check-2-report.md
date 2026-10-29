# competitor-check-2 — report

**29 October 2026.** Written for Dominic.

- Nothing was committed, pushed or deployed.
- No database change was run. Only the read-only queries in §9 were used.
- **No real Claude API call was made.** Every proof uses fixtures.
- No `.env*` file was opened, and no `outreach_templates` row was touched.
- **Nothing in the brief arrived garbled.** No instruction contradicted another.
- One thing to know: the brief says "as in the approved mockup", but **no mockup is in the repo** (as competitor-check-1c
  already noted). The deep-check controls and tile were built from the brief's own words: the picker, "Start deep check",
  and the tile's "Deep check · <country>", "N of M competitors" and "Then: …".

## 1 · Why the German import failed

**The cause:** five plans in `data/compare-de-1/competitors.json` broke a database rule. Each one hides its price
(`price_hidden: true`, `monthly_minor: null`) but was marked `status: 'counted'`. The rule
`competitor_plans_counted_has_price` is `CHECK (status <> 'counted' OR monthly_minor IS NOT NULL)`, so the database
refused them.

The five plans:
- OrderFront Starter, Premium and Multi;
- gastro25 "Business & Ketten";
- Jamezz "Webshop (Abonnement pro Standort)".

The app inserts a batch of plans in one statement, so all 19 plans were refused. The route caught the error and showed
its generic message.

**That message was wrong, too.** "Nothing was changed" was not true. The import wrote the competitors *before* the
plans:
- The first press (25 Oct, 10:06 UTC) added four competitors under the file's own ids: OrderFront, gastro25, FoxiFood
  and GastroDok. It added no plans and no entries.
- The press on 27 Oct matched those four and failed on the same rule.

The live state confirms this:
- 0 of the file's 19 plan ids are in the database;
- `comparison_entries` is empty;
- DE still has its 7 earlier plans.

**The fix:**
1. **The data file:** the five plans are now `status: "hidden"`, which is how the pricing research records a price on
   request. Each one still has `price_hidden: true` and no price. The diff is those five lines plus the file's
   `$comment`.
2. **The importer checks every row before it writes anything.** It uses the same rules as the database's CHECKs. A file
   with a problem writes nothing, and the reason names the row, for example: *Plan "OrderFront · Multi" (DE): status
   counted needs a monthly price — a price on request is status "hidden".*
3. **The importer can be safely re-run row by row** (§2), so a run that stops half-way is finished by the next one.
4. **The error messages now say what failed.** Both admin routes (`pricing-check` and `competitor-check`) return "That
   failed — <step>: <the database's reason>. Reload to see what was saved." They no longer say "Nothing was changed —
   try again".

## 2 · Automatic imports (the button is gone)

**Removed:**
- the "Import German comparison research" card and button (`components/admin/PricingCheckTab.tsx`);
- the `import_compare_de` action (`app/api/admin/pricing-check/route.ts`);
- `importCompareResearch` and the `compareImportable` flag (`lib/admin/pricing-check-actions.ts`).

**Added:**
- **`public.data_imports`** (NOT RUN SQL, §7). It records one row per attempt: file path, sha256, `imported_at`,
  `result` ok or error, `counts` (jsonb) and `message`.
  - A partial unique index allows one `ok` row per path and sha256.
  - RLS is on, with no policies, and grants are revoked: service role only.
- **`lib/data-import/importer.ts`**:
  - `DATA_FILES` is the registry. It starts with `data/compare-de-1/competitors.json` ("German research"). To import
    another data file, add it here.
  - `runImports` skips a file whose path and sha256 already have an `ok` row. Otherwise it imports the file and
    records the result.
  - `importLines` writes Admin's line.
- **`lib/data-import/research.ts`** (`researchProblems`, `importResearch`):
  - **Competitors** are matched by id, then by name, then by domain (the website's host without `www.`; app stores
    never count). Candidates are included in the matching.
  - A match gets only its **empty** fields filled: `unknown` features, and empty website, focus, payment providers,
    payment methods and minimum term. `features_checked_on` moves only forward.
  - **A matching candidate is upgraded, not duplicated.** It becomes `lifecycle` active and `added_as_candidate` false,
    and its notes get "upgraded from candidate by <file> (<date>)".
    - *Why `added_as_candidate` is cleared:* the research read it on the vendor's own site, like the file's other
      competitors. Those are counted at once, still unverified. With the flag kept, Pricing check would hide it until its
      features are verified.
  - **Plans** are skipped when the id is already in the table, or when the competitor has a current plan with the same
    name in the same country.
  - **Entries** are skipped when the id, or an entry for the same country and competitor, is already there.
  - Every plan and entry arrives source `research` and unverified.
- **`lib/data-import/store-supabase.ts`** (service role) and **`scripts/data-import/main.ts`**. These need only
  `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. A failed file makes the run exit non-zero.
- **`scripts/competitor-check/run.mjs`**: if its first argument is a `.ts` file, it runs that file instead of the checker.
- **The workflow** (`.github/workflows/competitor-check.yml`) has a new step, "Import new data files", right after
  `npm ci`. It runs before the OIDC token step and before any API call, with no Claude login. It therefore also runs when
  you press Run workflow.
  - The token step and "Check competitors" carry `if: !cancelled()`, so the check still runs after a failed import. The
    job still ends with a red cross.
- **Admin › Pricing check** shows a read-only line where the button was:
  - after an import: "German research imported 30 Oct: 9 competitors, 19 plans, 8 entries (…)";
  - after a failure: what failed;
  - before the SQL: that it waits for 20261045.

**What the first live import should do** (predicted from the read-only queries, §9):
- **Competitors:** all 9 already exist. Four match by id (the partial rows from 25 Oct) and five by name. So **0 are
  added**, and only empty fields are filled.
- **Plans:** **14 are added.** Five are already there under the same names: Bestelltheke Start, FoodsHero Start and
  Business, and GASTRODIGITAL's two plans.
- **Entries:** **8 are added.**
- **The line will read:** "German research imported <date>: 9 competitors, 19 plans, 8 entries (9 matched existing
  competitors; 5 plans were already there)".
- **DE current plans** go from 7 to 21.
- **No candidate matches** any of the nine (checked by name and domain).
- **The file's sha256 starts `1ce255d7edd7a24a`.**

## 3 · A failed login fails the run

**`lib/competitor-check/checker.ts`:**
- **`loginFailure(e)`** recognises a failed login:
  - the SDK's `WorkloadIdentityError` (the federation token exchange, including an unreadable or empty token file);
  - `AuthenticationError` or `PermissionDeniedError`;
  - any 401 or 403.

  A rate limit, a timeout or a model refusal is *not* treated as a failed login.
- **On a failed login, the run stops at once:**
  - `stopped_reason` is `'error'`, and the run's `notes` say "The Claude API login failed (<kind>): <message> — the run
    stopped before checking anything else";
  - no other competitor is tried;
  - in a scheduled job, no routine run follows.

  This applies to any failed login, including one mid-run (for example an expired token), because every later call
  would fail the same way. A verifier's failed login is re-raised; it is no longer logged as one claim's problem.
- **When every competitor in a run fails** (for any reason), the run becomes `'error'` with "Every competitor in this run
  failed (N)". One competitor failing still lets the run continue and stay `'done'`.
- **`exitCodeOf(reports)`** returns 1 when any run is `'error'`. `scripts/competitor-check/main.ts` sets the process exit
  code from it, so Actions shows a red cross.

**The token-refresh loop** now logs each re-fetch with a UTC time and a running count, for example
`2026-10-30T02:12:10Z token refreshed (2)` or `… token re-fetch FAILED (3); keeping the last one`. The first fetch is
logged as `(0)`. A final step, "Token refresh log" (`if: always()`), prints the log.

## 4 · The deep check, country by country

**Settings** gain `deep_country` (nullable) and `deep_queue` (`text[]`, empty means the default order). Both are NOT RUN
SQL in §7, and both are read tolerantly until the SQL runs.

**The rules** (`lib/competitor-check/core.ts`):
- **A competitor's countries** are its current plans' countries. While it is a candidate, they also include the
  countries recorded in its notes by 20261044 ("… · countries: DE, AT").
- **The default queue (`defaultDeepQueue`):**
  1. switched-on countries with a comparison page (`admin` or `live`; today DE);
  2. then AT, CZ, PL;
  3. then the other switched-on countries, by number of competitors (most first; ties by code).

  A stored queue (Settings) replaces the default.
- **`selectDeepByCountry`** picks the competitors in `deep_country` that have not been deep-checked since
  `deep_requested_at`. "Check now" requests come first, then by name, up to `deep_per_day`. When that country runs out,
  the rest of the day's share comes from the next countries in the queue. A competitor in two countries is checked once.
- **After each run, `nextDeepCountry`** moves `deep_country` on to the first country (from the current one onwards) that
  still has someone to check. At the end of the queue it sets `deep_country` to null.
  - A day's share can finish several small countries, so the country can jump (for example AT → FR).
  - A dry run never moves it.
- **The checker's only settings write** is `setDeepCountry`. It reads `country_settings` and never writes it.
- **The scheduled deep share runs only while a country is set.** The old "full deep check" request with no country no
  longer runs on the schedule. (`deep_requested_at` is null live, so nothing was in progress.) A manual `deep` run with
  no country still takes everyone by name, as before.
- **The routine 90-day checks carry on** alongside, and the daily and monthly caps still stop any run.

**Admin › Automatic checks:**
- **The controls:**
  - a "Deep check" picker: "All countries, in order", then every switched-on country, with " (has a comparison page)"
    added for admin or live ones;
  - a "Start deep check" button (`start_deep`, with `country` set to a code or `ALL`).

  "All countries" starts at the first country in the queue. A picked country starts there and carries on through the
  countries after it in the queue.
- **The tile** shows "Deep check · Germany", "N of M competitors" and "Then: Austria, Czechia, Poland, France and 3
  more", plus about how many a day and the date it should all be done. With no country running, it shows "Finished" (or
  "Not running").
- **Settings** has an editable "Deep check order" field (country codes; empty means the default, which is shown). It is
  validated: switched-on codes only, each once.
- **Before 20261045 runs,** the picker and button are disabled and say to run it.

**Limits to know:**
- A competitor with no current plan and no recorded country is not in any country, so the country deep check never
  reaches it. Today that covers active competitors with no plan.
- A competitor that fails every day keeps its country "current", although the rest of each day's share moves on to the
  next countries.

## 5 · Leftovers

- **`scripts/competitor-check-1.cjs` is re-pinned** to the federation login, with a dated note (29 Oct 2026). The test
  now expects:
  - the four `vars.ANTHROPIC_*` variables;
  - `id-token: write`;
  - `ANTHROPIC_IDENTITY_TOKEN_FILE: /tmp/gha-jwt`;
  - **no** `secrets.ANTHROPIC_API_KEY`.

  Its deep-schedule test is also re-pinned to need a country.
- **`docs/competitor-check-1-report.md`** has a note at the top: its login steps are superseded by
  `docs/competitor-check-1c-report.md`.
- **`scripts/pricing-check-1.cjs` is registered** in `scripts/harnesses.json`. Two other files are added to excluded
  groups, so the runner no longer reports them as unregistered:
  - `pricing-check-build-data.cjs` (fixture generators: it writes the committed data);
  - `pricing-check-screenshots.cjs` (needs a browser).

  The runner's screen passes all 170 listed files. It still reports 12 *other* unregistered files (`_midnight-*`,
  `_lp-*` and others), which existed before this work and are not touched.
- **`compare-de-1.cjs` and its fixtures** now prove the import through `lib/data-import/research.ts`, with a new check
  that the five price-hidden plans are status "hidden".
- **Not in the repo:** the scratchpad generator from compare-de-1 (`build-data.py`) still writes `status: 'counted'` for
  every plan. Fix it before rebuilding the file (or fix the rebuilt file). The importer would refuse a regenerated file
  and name the rows.

## 6 · Files changed

| File | What |
|---|---|
| `data/compare-de-1/competitors.json` | 5 hidden-price plans → status "hidden"; `$comment` updated |
| `lib/data-import/importer.ts` (new) | registry, sha256 once-per-version, records, Admin lines |
| `lib/data-import/research.ts` (new) | checks every row; matches by id, name or domain (candidates too); fills only empty fields; can be re-run |
| `lib/data-import/store-supabase.ts` (new) | the importer's database access |
| `scripts/data-import/main.ts` (new) | the import step's entry point |
| `supabase/migrations/20261045_competitor_check_2.sql` (new) | NOT RUN — §7 |
| `scripts/competitor-check/run.mjs` | optional `.ts` entry argument |
| `.github/workflows/competitor-check.yml` | import step first; `!cancelled()`; refresh log with time and count; log printed at the end |
| `lib/competitor-check/checker.ts` | `loginFailure`, `exitCodeOf`, all-failed → error, country deep check and moving to the next country |
| `lib/competitor-check/core.ts` | candidate countries, default queue, `selectDeepByCountry`, `nextDeepCountry` |
| `lib/competitor-check/store-supabase.ts` | settings read tolerantly, competitor countries, `countries()`, `setDeepCountry` |
| `lib/competitor-check/overview.ts` | the deep tile's country, progress and "Then:"; the queue |
| `scripts/competitor-check/main.ts` | exit code from `exitCodeOf`; the reason printed |
| `lib/admin/competitor-check-actions.ts` | `startDeep`, `deep_queue` validation, countries in `loadChecks` |
| `lib/admin/competitor-check-store.ts` | `countries()`, `planCountries()`, notes |
| `app/api/admin/competitor-check/route.ts` | `start_deep` with a country; queue validated against switched-on countries; specific errors |
| `components/admin/AutomaticChecks.tsx` | the picker, Start deep check, the country tile, the Settings order field |
| `app/api/admin/pricing-check/route.ts` | import action removed; `imports` lines; specific errors |
| `lib/admin/pricing-check-actions.ts` | `importCompareResearch` and `compareImportable` removed |
| `lib/admin/pricing-check-store.ts` | `readDataImports()` |
| `components/admin/PricingCheckTab.tsx` | the card replaced by the read-only line |
| `scripts/competitor-check-1.cjs`, `scripts/_competitor-check-1-fixtures.cjs` | re-pin, plus sections 11–14 |
| `scripts/compare-de-1.cjs`, `scripts/_compare-de-1-fixtures.cjs` | import proofs moved to the new importer |
| `scripts/competitor-check-1-screens.cjs` | the country fixture; shots now go to `docs/competitor-check-2/` |
| `scripts/harnesses.json` | `pricing-check-1.cjs` registered; two exclusions |
| `docs/competitor-check-1-report.md` | the superseded-login note |

(`docs/reference-manual.md` and `docs/manual-v16-7-report.md` were already uncommitted from manual-v16-7. They are not
part of this work.)

## 7 · NOT RUN SQL

`supabase/migrations/20261045_competitor_check_2.sql`:

```sql
begin;

create table if not exists public.data_imports (
  id           uuid primary key default gen_random_uuid(),
  file_path    text not null check (length(btrim(file_path)) > 0),
  sha256       text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  imported_at  timestamptz not null default now(),
  result       text not null check (result in ('ok', 'error')),
  counts       jsonb not null default '{}'::jsonb,
  message      text
);
create index if not exists data_imports_path_at_idx on public.data_imports (file_path, imported_at desc);
create unique index if not exists data_imports_ok_once on public.data_imports (file_path, sha256) where result = 'ok';

alter table public.data_imports enable row level security;
revoke all on table public.data_imports from anon, authenticated, public;
comment on table public.data_imports is 'competitor-check-2: each import of a registered data file, by sha256 (lib/data-import). Service role only.';

alter table public.competitor_check_settings
  add column if not exists deep_country text,
  add column if not exists deep_queue   text[] not null default '{}';
alter table public.competitor_check_settings drop constraint if exists competitor_check_settings_deep_country_chk;
alter table public.competitor_check_settings add constraint competitor_check_settings_deep_country_chk check (deep_country is null or deep_country ~ '^[A-Z]{2}$');

commit;
```

## 8 · Proof

| Run | Result |
|---|---|
| `npx tsc --noEmit -p .` | clean (rc 0) |
| `npx eslint` on the changed `lib/`, `app/`, `components/` files and `scripts/data-import/main.ts` | clean |
| `node scripts/competitor-check-1.cjs` | **109 passed, 0 failed** (63 before; 46 new or re-pinned) |
| `node scripts/pricing-check-1.cjs` | **55 passed, 0 failed** |
| `node scripts/compare-de-1.cjs` | **65 passed, 0 failed** |
| `node scripts/competitor-check-1-screens.cjs` | **16 passed, 0 failed** |
| `node scripts/run-harnesses.cjs --dry-run` | all 170 listed files pass the screen |

**What the new sections of `competitor-check-1.cjs` prove** (fixtures only, no API, no database):

- **11 · The importer.**
  - **The first run imports and records:** 9 competitors, 19 plans (1 already there), 8 entries.
  - **Candidates are upgraded, not duplicated:** one matched by name (FoodsHero) and one by **domain only**
    (gastrodok.de under another name). Each is upgraded with its id kept; there is no second row.
  - **Only empty fields are filled.**
  - **A rerun of the same file is a no-op:** zero writes, not even a record.
  - **A changed file is imported again,** adding only the one new plan.
  - **A file with a price-hidden plan marked "counted"** (what broke the button) writes nothing, records the reason and
    names the row.
  - **Before 20261045,** it says to run it.
  - **The Admin line's wording** is checked.
  - **The button is gone** from the tab and the route, and both routes' errors say what failed.
  - **In the workflow,** the import step comes after `npm ci` and before the OIDC step, with no Anthropic setting.
  - **The migration** matches the design.
- **12 · A failed login.**
  - `AuthenticationError` 401, `WorkloadIdentityError` and `PermissionDeniedError` 403: in each case **one** API call,
    then the run stops. No competitor is checked or failed, nothing is written, the run is `'error'` with the reason, and
    `exitCodeOf` is 1.
  - A scheduled job stops before its routine share.
  - Two of two failing → `'error'`, exit 1. One of three failing → `'done'`, exit 0.
  - `main.ts` uses `exitCodeOf`.
  - The refresh log has the time and count and is printed with `always()`.
- **13 · The country deep check.**
  - Candidate countries come from the notes.
  - The default queue is DE, AT, CZ, PL, FR, GB, IE, NL; switched-off US is never in it.
  - A stored queue wins.
  - Selection takes only `deep_country`'s competitors, and the next country's only once DE runs out.
  - **Over six simulated days:** 4 a day; DE finishes on day 2 → AT; day 3 → FR; the end → null. All 13 are checked
    exactly once, with no deep run afterwards.
  - The daily and monthly caps still stop a country run, and the country stays.
  - A dry run never moves the country.
  - `startDeep`: "All" starts at DE, a pick starts there, a switched-off country is refused, and it waits for 20261045.
  - The Settings order is validated.
- **14 · The tab** renders the tile, "Then:", the picker with the comparison-page label, "Start deep check" and
  "Finished".

**Screenshots** (Automatic checks, fixture data, a deep check on Germany):
- `docs/competitor-check-2/webkit-1512.png`
- `docs/competitor-check-2/webkit-390.png`
- `docs/competitor-check-2/chromium-1512.png`
- `docs/competitor-check-2/chromium-390.png`

At every size there are no page errors, four tiles, and no sideways scroll. At 390 the findings table scrolls inside its
own box.

## 9 · Read-only SQL that was run

```sql
select name, lifecycle, added_as_candidate, website, created_at, updated_at, features_checked_on, capacity_slots, payment_methods, min_term from public.competitors where name in ('gastro25','GastroDok','FoxiFood','Bestelltheke','GASTRODIGITAL','OrderFront','FoodsHero','Jamezz','Vev') order by created_at;
```
```sql
select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.competitor_plans'::regclass and contype = 'c' and conname like '%price%';
```
```sql
select (select count(*) from public.competitor_plans where id in ('c43e319a-0eb8-58d5-8d7b-e390a97a455f','2a856281-d68b-5c7f-9e7b-7ae9f2353fd7','e9ace262-113b-5808-843a-9ac2d2f955e9','b3e0e175-40fa-570b-9c91-aced30deaf9a','5d9341a1-21db-5246-9d82-a788adee3c3f','6a840462-d167-5373-9a6e-71568ed1aa86','5e722239-c387-58ba-89bb-80f6311f7d3b','5e107a65-52de-59a7-922c-cd03af84f2e8','d9ea8ad3-b849-5caa-b536-5b379aa03872','cb4689d1-094b-50da-94b1-76e7713f5617','59ab7ff0-fba7-586d-8a56-36e2db0f74de','85ffec03-6540-5cd3-8c25-67f30057ecb5','11790f3d-5305-57e5-9d71-86259cbbf868','6f073e79-5d2c-5196-b7fb-0f4146f4fc1b','03873780-f4ee-53ce-a569-4ada54ad5464','cb3aa027-8473-54d4-9727-124a8f2f12be','c316ff83-c9cb-5283-bb72-1fa2cbb38ed7','9867747d-a938-584f-b2e3-606b24367a58','8679861f-2c6b-5d3e-b714-9f3242405911')) as file_plans_live,
(select count(*) from public.comparison_entries) as entries,
(select count(*) from public.competitor_plans where country_code='DE' and superseded_at is null) as de_current_plans,
(select string_agg(c.name || ' · ' || p.plan_name || ' · ' || p.status, ' | ') from public.competitor_plans p join public.competitors c on c.id=p.competitor_id where p.country_code='DE' and p.superseded_at is null) as de_plans,
(select string_agg(id::text || '=' || name, ', ') from public.competitors where name in ('OrderFront','gastro25','FoxiFood','GastroDok')) as partial_ids;
```
```sql
select name, lifecycle, website, notes from public.competitors where lifecycle = 'candidate' and (website ilike any (array['%orderfront%','%gastro25%','%jamezz%','%gastro.digital%','%vev.co%','%foxifood%','%bestelltheke%','%foodshero%','%gastrodok%']) or lower(name) in ('orderfront','gastro25','jamezz','gastrodigital','vev','foxifood','bestelltheke','foodshero','gastrodok'));
```
```sql
select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid in ('public.competitor_plans'::regclass, 'public.comparison_entries'::regclass, 'public.competitors'::regclass) and contype in ('c','u','f') order by 1, 2;
```

**What they showed:**
- The CHECK is exactly as above.
- OrderFront, gastro25, FoxiFood and GastroDok were created on 25 Oct between 10:06:23.33 and 10:06:23.81 UTC, under the
  file's own ids. The other five date from 23 Oct.
- 0 of the file's plans are live, there are 0 entries, and DE has 7 current plans.
- No candidate matches any of the nine.

## 10 · What you do

1. **Run the SQL** in §7 (`supabase/migrations/20261045_competitor_check_2.sql`) in the Supabase SQL editor.
2. **Deploy** (merge to the default branch). The import step and the new checks run only from there.
3. **Press Run workflow** (Actions › Competitor check; mode `routine` is fine), or wait for the nightly run. The first
   step, "Import new data files", should log `data/compare-de-1/competitors.json: imported — {…}`. On a second run it
   should log `already imported`.
4. **Verify:**
   - Admin › Pricing check shows "German research imported <date>: 9 competitors, 19 plans, 8 entries (9 matched
     existing competitors; 5 plans were already there)".
   - Germany shows the new plans (21 current DE plans).
   - **At least two German competitors** are verified in the country view, for example OrderFront and gastro25. Check
     their plans, features and comparison entry against their websites, then press Mark verified. Nothing is public
     until verified.
5. **When you want the deep check,** pick Germany (or All countries) and press Start deep check. The tile should show
   "Deep check · Germany". On the next run, check that "Token refresh log" shows timed refreshes with a growing count.

## Undo (only if Dominic asks)

```sql
-- Removes what 20261045 adds. The German import's own rows (plans source 'research' with the file's ids, the 8
-- comparison_entries) would need removing separately, by id, from data/compare-de-1/competitors.json.
begin;
alter table public.competitor_check_settings drop constraint if exists competitor_check_settings_deep_country_chk;
alter table public.competitor_check_settings drop column if exists deep_queue, drop column if exists deep_country;
drop table if exists public.data_imports;
commit;
```

This report is docs/competitor-check-2-report.md.
