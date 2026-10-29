# global-players-1 — report

**29 October 2026.** Written for Dominic.

Square, SumUp, Zettle, Lightspeed, Toast and Clover are now added as competitors. They come in through a data file that
the nightly import loads, and the checker then decides country by country where each one sells. Comparison pages show a
group label under each tool's name, and the tills card names the till systems that are verified in the table.

- Nothing was committed, pushed or deployed. No database change was run; only the read-only queries in §9 were used.
- **No real Claude API call was made**: every proof uses fixtures.
- No `.env*` file was opened, and no `outreach_templates` row was touched.
- **Nothing in the brief arrived garbled.** I found no instruction that contradicts another. Two things to know:
  - **There is no "approved German mockup" in the repo**, as earlier reports also noted. The group label, the tills card
    and the POS badge were built from the brief's words. The screenshots in §7 show the result.
  - **"Only a two-line summary" in chat versus "every query and all NOT RUN SQL in chat":** I followed your last brief's
    order. The query and SQL blocks come first, then the two-line summary.
- **Interpretations of the brief**, each built as stated:
  1. **"Upgrade rather than duplicate"** means a match keeps its row and id and gets focus `pos` (even over another focus)
     and "countries: all switched-on". Its lifecycle is never lowered: an active row stays active and a candidate stays a
     candidate.
     - **A row marked `not_relevant`** (a POS ruled out before 29 Oct) becomes a candidate again, because your decision
       reverses that exclusion.
  2. **"Drops out of X's deep check"** needs a record of where it does not sell. A candidate's countries come from its
     notes, not from plans, so "has no plans in X" alone would not take it out. That record is the new
     `competitors.not_in_countries`.
  3. **"One country at a time"** needs a per-country deep-check date. That is the new `competitors.deep_checked_in`, a
     scheduling column the checker may write. It applies to **every** competitor in several countries, as the brief
     says, not only POS players.

## 1 · Data

- **`supabase/migrations/20261046_global_players_1.sql` (NOT RUN, §8):**
  - focus `pos` in the competitors CHECK;
  - `not_in_countries` and `deep_checked_in` on competitors;
  - the `availability` field's outcomes `in_country` and `not_in_country` in the findings CHECK;
  - `comparison_entries.group_label`.

  The live constraint names were checked first (§9).
- **`data/global-players/competitors.json`** holds six rows, each with fixed uuid5 ids and only:
  - name (Square, SumUp, Zettle (PayPal), Lightspeed, Toast, Clover);
  - main website;
  - `focus: "pos"`;
  - `lifecycle: "candidate"`;
  - notes "global-players-1 candidate · countries: all switched-on", the same notes format 20261044 uses.

  It has no prices, features or availability.
- **Registered in `lib/data-import/importer.ts`** as "Global POS players" (kind `players`). The existing nightly first
  step imports it once per version.
- **Matching** is by id, name or domain, candidates included (`lib/data-import/research.ts`):
  - **Square already exists live** as a GB candidate (§9). It keeps its row and id, and gets focus `pos` and "countries:
    all switched-on" in place of GB.
  - **The other five are added** as candidates, with `added_as_candidate` set and no features checked date.
- **Admin's read-only line:** "Global POS players imported <date>: 6 competitors (5 added, 1 matched an existing row) —
  the checker finds where each sells, its plans and features".
- **"countries: all switched-on"** means every switched-on country (36 today). For a `pos` competitor it keeps counting
  after the competitor becomes active, minus `not_in_countries` (`lib/competitor-check/core.ts`, `countriesOf`).

## 2 · The checker: one country at a time

- **A competitor in several countries is checked for one country per deep check.** It is picked for the country the deep
  check is on (`deepTargets`). Its extractor message starts with a COUNTRY CHECK for that country only
  (`prompts.ts countryTask`). The task asks for:
  - (a) one `availability` finding: `in_country` or `not_in_country`, with a quote;
  - (b) its plans and prices for that country as advertised;
  - (c) its features as offered there, including any online-ordering or pre-order add-on (pickup times, kitchen
    display, online store), each with a quote.
- **The stored data it sees is that country's plans only.**
- **Its reading is capped:** at most `COUNTRY_MAX_FETCHES` = 8 pages and 4 searches. A full deep check allows 12 and 6.
- **Findings about another country are dropped.** Untagged ones are tagged with the country.
- **`deep_checked_in.<country>` is stamped**, so the same competitor comes up again for the next country in the queue.
  The existing daily and monthly caps apply unchanged.
- **A competitor in one country** gets the whole deep check, exactly as before.

**What Accept now does** (`lib/admin/competitor-check-actions.ts`):
- **Not sold here (`not_in_country`):**
  - the country is added to `not_in_countries`;
  - its current plans there are closed (each as a new version, under the history rule);
  - its comparison entry there is removed.

  So it drops out of that country's deep check and table. Before 20261046 runs, this accept is refused with the file to
  run.
- **Sold here (`in_country`):** the country is taken off `not_in_countries`.
- **The first accepted plan of a `pos` competitor** in a country whose `comparison_status` is admin or live also adds it
  to that country's `comparison_entries`. The new entry is unverified, last in the order, and shows that plan.
- **Classification:** a `pos` competitor classified "POS or card reader" stays, as active with focus pos. Any other POS
  is still set to not relevant, as before.

## 3 · Pricing check and comparison pages

- **Pricing check:**
  - `pos` competitors carry a **POS** badge, both in the rivals table and on comparison entries.
  - "Food-truck tools only" (on by default) leaves them out (`isFoodTruckTool`).
  - A POS player still being checked that has a comparison entry is shown, so you can verify it (`isPendingPos`).
  - Each entry has a "Group label" field for the override (60 characters at most). Like any entry edit, saving it clears
    the entry's verification.
- **Comparison pages** (`lib/comparison.ts`, the page, `.md` and `.json`):
  - **Under each tool's name** is a group label from messages, chosen by focus:

    | Focus | de-DE | en-GB |
    |---|---|---|
    | food truck, markets, pop-ups | Bestellsystem für Foodtrucks | Food truck ordering system |
    | `nearest_local` | Bestellsystem | Ordering system |
    | `pos` | Kassensystem | Till system |

    The entry's `group_label` overrides it (e.g. "Kasse mit Online-Shop"). HatchGrab's own column shows the food-truck
    label.
  - **`.md`** writes it as "Name (Group)" in the table header. **`.json`** gives each tool a `group`.
  - **The "Kassensysteme und Kartenleser" card** names the POS players that are public in that country's table, and says
    they are also in the table ("Testkasse P und Testkasse R stehen auch in der Tabelle oben"). With none, it names none.
    The fixed example names (SumUp, Zettle, orderbird, ready2order) and the unverified SumUp pre-order claim are removed,
    from de-DE and en-GB. The German back-translation is updated.
- **Same rules as before:**
  - Publicly, a column needs its entry, plan and features verified **and** a counted competitor. A POS player that is
    still a candidate never shows publicly. An admin sees it, badged.
  - There is no Product, Review or Rating markup.

## 4 · Files changed

| File | What |
|---|---|
| `supabase/migrations/20261046_global_players_1.sql` (new) | NOT RUN — §8 |
| `data/global-players/competitors.json` (new) | the six players |
| `lib/data-import/importer.ts`, `research.ts` | registry entry; candidate rows (focus pos, countries mark, lifecycle never lowered); the Admin line |
| `lib/competitor-check/core.ts` | `COUNTRIES_MARK`, "all switched-on", `countriesOf` with focus and `notIn`, per-country pending, `deepTargets`, `afterCheck` stamps the country |
| `lib/competitor-check/model.ts`, `prompts.ts` | `availability`, `in_country` / `not_in_country`, the country task |
| `lib/competitor-check/checker.ts`, `store-supabase.ts` | country-mode extraction, the fetch cap, dropping other countries' findings, `deep_checked_in`; new columns read tolerantly |
| `lib/competitor-check/overview.ts` | per-country progress |
| `lib/admin/competitor-check-actions.ts`, `competitor-check-store.ts` | the Accept paths, `not_in_countries`, the POS classification |
| `lib/pricing-check.ts` | focus `pos`, `isFoodTruckTool`, `isPendingPos`, `ComparisonEntry.groupLabel` |
| `lib/admin/pricing-check-actions.ts`, `pricing-check-store.ts` | the `group_label` column (read tolerantly) and its edit |
| `lib/comparison.ts`, `lib/comparison-server.ts` | group labels, the tills card, the public gate, pending POS shown to admins |
| `app/[country]/[section]/[slug]/page.tsx`, `comparison.css` | the label under the name |
| `app/api/admin/pricing-check/route.ts` | pending POS players with an entry |
| `components/admin/PricingCheckTab.tsx`, `AutomaticChecks.tsx` | POS badge, group-label field, "Sold here" / "Not sold here" |
| `messages/de-DE.json`, `messages/en-GB.json`, `messages/ns/{de-DE,en-GB}/comparison.json`, `docs/i18n/back/de-DE.json` | the labels and the tills card |
| `scripts/competitor-check-1.cjs`, `_competitor-check-1-fixtures.cjs` | section 15, plus re-pins (dated) |
| `scripts/compare-de-1.cjs`, `_compare-de-1-fixtures.cjs`, `compare-de-1-screens.cjs` | section 9, `GLOBAL_TABLES`, `--global-players` |

## 5 · Harness results

| Run | Result |
|---|---|
| `npx tsc --noEmit -p .` | clean |
| `node scripts/competitor-check-1.cjs` | **135 passed, 0 failed** (109 before) |
| `node scripts/compare-de-1.cjs` | **77 passed, 0 failed** (65 before) |
| `node scripts/pricing-check-1.cjs` | **55 passed, 0 failed** |
| `node scripts/compare-de-1-screens.cjs --global-players` | **6 passed, 0 failed** |
| `node scripts/translation-check.cjs --locale de-DE` | **Structural: 0** (flags only, as before) |
| `npx eslint` on the changed `lib/`, `app/` and `components/` files | none of its errors is in a file this work changed (the 21 are in `app/api/admin/{backfill-usage,discovery-events,outreach,outreach-templates}`, `app/api/admin/route.ts` and `lib/admin/screenshot-events.ts`) |

**What the new tests prove:**
- **Section 15 of `competitor-check-1.cjs`:**
  - **The file:** its shape, registered, and passes the import's row checks.
  - **The import:**
    - Square (a GB candidate) is upgraded by name: same row, still a candidate, countries replaced.
    - An *active* SumUp row is upgraded to pos and never lowered.
    - A not-relevant "iZettle" is matched **by domain only** and becomes a candidate again, with its name kept.
    - The three new rows are candidates.
    - A rerun is a no-op.
    - The Admin line's wording is checked.
  - **"All switched-on"** expands to every switched-on country, minus the ruled-out ones.
  - **A deep check of DE** for a competitor in DE, AT and FR:
    - the message says "COUNTRY CHECK: DE ONLY", with only its DE plans;
    - 8 pages and 4 searches;
    - a single-country competitor still gets the whole deep check.
  - **Day 2 (AT):** the same competitor again, for AT only; DE-tagged findings are dropped; the deep check moves DE → AT
    → FR.
  - **The validator** pairs `availability` with `in_country` / `not_in_country` only.
  - **Accept paths:**
    - "Not sold in AT": AT is recorded, the AT plan is closed as a new version, the AT entry is removed, and it is gone
      from AT's deep check.
    - The first DE plan of a POS player adds **one** unverified DE entry. A second plan adds none. FR (no page) and a
      food-truck tool get no entry.
    - A POS player stays when classified as a POS.
    - "Not sold here" is refused before 20261046 runs.
  - **The UI labels** are checked, and the cost figures in §6.
- **Section 9 of `compare-de-1.cjs`:**
  - The group labels in the HTML, `.md` and `.json` (by focus and by override).
  - An unverified, still-candidate POS player is nowhere public, but an admin sees it.
  - The tills card names only verified POS players: plural, singular, and none. Never the unverified one, in either view.
  - There is still no Product, Review or Rating markup.
  - The English base labels and the migration's shape are checked.
- **Re-pinned (dated 29 Oct 2026):**
  - Section 11 imports the German file alone, because the registry now has two files.
  - Section 13: c-006 (in DE and AT) is now deep-checked once per country, so 14 checks instead of 13, and the queue moves
    AT → PL.

## 6 · Estimate of the extra checker cost

These figures use fixture-style token counts, which are guesses. The real routine cost was measured at about $0.19
against a $0.16 estimate, so expect about 20% more.

- **A country check:**
  - where it sells: **≈ $0.50** (extractor up to 8 pages, plus 10 second checks);
  - where it does not: **≈ $0.10** (a short read, plus one second check).
- **The six players in 36 countries** is 216 country checks. If each sells in about 12 countries, the first full pass
  costs **≈ $51** (72 × $0.50 + 144 × $0.10). The worst case, where all six sell everywhere, is ≈ $108.
- **Existing competitors in several countries**, now checked once per country (§9):
  - 13 active competitors cover 40 countries: about 40 × $0.50 = $20, instead of 13 × $0.72 = $9.4, so **+≈ $11**;
  - 10 candidates recorded for two countries: **+≈ $3**.
- **The first pass in total is ≈ $65 extra, one-off.** Routine 90-day checks add about 6 × $0.16 every 90 days, which is
  negligible.
- **The caps decide the pace.** At 15 deep checks a day it takes about 15 days for the players. Together with a first full
  deep check of everyone (≈ $142 estimated earlier), the $90 monthly cap will stop it, and it carries on the next month.
  Raise the monthly cap for the first month if you want it sooner.

## 7 · Screenshots

The German page's admin view, fixture data, WebKit:
- `docs/global-players-1/webkit-admin-1512.png`
- `docs/global-players-1/webkit-admin-390.png`

They show:
- a group label under every name;
- the unverified POS player badged;
- the tills card naming Testkasse P and R.

At 390 the page never scrolls sideways; only the table's own box does.

## 8 · NOT RUN SQL

`supabase/migrations/20261046_global_players_1.sql`:

```sql
begin;

alter table public.competitors drop constraint if exists competitors_focus_check;
alter table public.competitors add constraint competitors_focus_check
  check (focus in ('food_truck', 'street_food_markets', 'nearest_local', 'pop_up', 'pos'));

alter table public.competitors
  add column if not exists not_in_countries text[] not null default '{}',
  add column if not exists deep_checked_in  jsonb  not null default '{}'::jsonb;
alter table public.competitors drop constraint if exists competitors_not_in_countries_chk;
alter table public.competitors add constraint competitors_not_in_countries_chk
  check (array_to_string(not_in_countries, ',') ~ '^([A-Z]{2}(,[A-Z]{2})*)?$');
alter table public.competitors drop constraint if exists competitors_deep_checked_in_chk;
alter table public.competitors add constraint competitors_deep_checked_in_chk check (jsonb_typeof(deep_checked_in) = 'object');

alter table public.competitor_check_findings drop constraint if exists competitor_check_findings_outcome_check;
alter table public.competitor_check_findings add constraint competitor_check_findings_outcome_check
  check (outcome in ('changed', 'unchanged', 'new_plan', 'plan_gone', 'new_url', 'classification', 'blocked', 'page_gone', 'not_stated',
                     'in_country', 'not_in_country'));

alter table public.comparison_entries add column if not exists group_label text;
alter table public.comparison_entries drop constraint if exists comparison_entries_group_label_chk;
alter table public.comparison_entries add constraint comparison_entries_group_label_chk
  check (group_label is null or length(btrim(group_label)) between 1 and 60);

commit;
```

**Run it before the deploy's first workflow run.** Until it has run:
- the import of the players' file is refused by the focus CHECK, records why, and retries the next night;
- every new column is read tolerantly.

## 9 · Read-only SQL that was run

```sql
select id, name, website, lifecycle, focus, added_as_candidate, notes, (select string_agg(distinct p.country_code, ',') from public.competitor_plans p where p.competitor_id = c.id and p.superseded_at is null) as plan_countries from public.competitors c where name ~* '(square|sumup|zettle|izettle|lightspeed|toast|clover)' or website ~* '(squareup|square\.com|sumup|zettle|lightspeedhq|toasttab|clover\.com)' order by name;
```
```sql
select (select count(*) from public.country_settings where enabled) as enabled_countries, (select string_agg(country_code || ':' || comparison_status, ',' order by country_code) from public.country_settings where comparison_status <> 'off') as comparison_countries, (select pg_get_constraintdef(oid) from pg_constraint where conname = 'competitors_focus_check') as focus_check, (select count(*) from public.data_imports) as data_imports_rows;
```
```sql
select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.competitor_check_findings'::regclass and contype = 'c' order by 1;
```
```sql
select column_name, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='competitors' and column_name in ('features_checked_on','focus','notes','website','added_as_candidate','lifecycle','pre_orders') order by 1;
```
```sql
select count(*) filter (where n > 1) as multi_country, count(*) as with_plans, coalesce(sum(n) filter (where n > 1), 0) as country_checks_for_multi from (select competitor_id, count(distinct country_code) as n from public.competitor_plans where superseded_at is null group by competitor_id) x;
```
```sql
select count(*) filter (where notes ~ 'countries: [A-Z]{2}\s*,') as multi_country_candidates, count(*) as candidates from public.competitors where lifecycle = 'candidate';
```

**What they showed:**
- **Square** exists, as a GB candidate (`squareup.com`, no focus, no plans). None of the other five exist.
- **Countries:** 36 are switched on. Only DE has a comparison page (`admin`).
- **`data_imports` exists with 0 rows**, so 20261045 has run and the German import has not yet happened.
- **The constraint names match** the migration, and `features_checked_on` is nullable.
- **Competitors in several countries:** 13 competitors have plans in more than one country (40 country slots), and 10
  candidates are recorded for more than one country.

## 10 · Limits to know

- **Routine 90-day checks** still read a multi-country competitor as a whole. Only the deep check goes one country at a
  time.
- **Features are stored per competitor, not per country.** The latest accepted feature finding sets the value for every
  country. Its finding carries the country it was read in.
- **Country sites on other domains are not reachable yet.** Web tools are limited to the competitor's own domain (and its
  subdomains) plus the app stores. A country site on another domain (for example a separate national domain) is outside
  that, and a `new_url` finding pointing there is dropped. Toast's website is `pos.toasttab.com`. Adding such domains
  needs a way to edit `check_urls` by hand, which does not exist yet.
- **A gap from competitor-check-1 remains for non-POS competitors.** A former candidate hidden until its features are
  verified still cannot be verified from Pricing check unless it has a comparison entry. POS players get round this
  through their auto-added entry.
- **`docs/reference-manual.md` is not updated** (not asked). §86 and 35.an should get the 29 Oct decision.

## 11 · What you do

1. **Run the SQL** in §8 (`supabase/migrations/20261046_global_players_1.sql`).
2. **Deploy** (merge to the default branch).
3. **Wait for the next workflow run, or press Run workflow.** Its first step imports `data/global-players/competitors.json`.
   Admin › Pricing check should then show "Global POS players imported <date>: 6 competitors (5 added, 1 matched an
   existing row) — …".
4. **When you want them checked,** pick Germany (or All countries) in Automatic checks and press Start deep check. For
   each POS player and country, accept or reject "Sold here" or "Not sold here", the plans and the features.
   - The first accepted DE plan puts the player on the German page, unverified.
   - Verify it in Pricing check like any other entry. You can set a "Group label" there if "Kassensystem" is not right.

## Undo (only if Dominic asks)

```sql
-- Reverses 20261046. Rows with focus 'pos' must be changed first, or the old CHECK will refuse.
begin;
update public.competitors set focus = null where focus = 'pos';
alter table public.competitors drop constraint if exists competitors_focus_check;
alter table public.competitors add constraint competitors_focus_check check (focus in ('food_truck', 'street_food_markets', 'nearest_local', 'pop_up'));
alter table public.competitors drop constraint if exists competitors_not_in_countries_chk, drop constraint if exists competitors_deep_checked_in_chk;
alter table public.competitors drop column if exists not_in_countries, drop column if exists deep_checked_in;
delete from public.competitor_check_findings where outcome in ('in_country', 'not_in_country');
alter table public.competitor_check_findings drop constraint if exists competitor_check_findings_outcome_check;
alter table public.competitor_check_findings add constraint competitor_check_findings_outcome_check
  check (outcome in ('changed', 'unchanged', 'new_plan', 'plan_gone', 'new_url', 'classification', 'blocked', 'page_gone', 'not_stated'));
alter table public.comparison_entries drop constraint if exists comparison_entries_group_label_chk;
alter table public.comparison_entries drop column if exists group_label;
commit;
```

This report is docs/global-players-1-report.md.
