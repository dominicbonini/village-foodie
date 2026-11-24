# compare-fix-2: the failed import repaired, the importer made all-or-nothing, and the import and publish re-run

**24 November 2026 · branch france-vat-1 · commits 1223de95, e6c3b6c8, a44db765 · competitor and comparison data only · nothing deployed or pushed**

## 0 · Result

- ✅ **Step 1, the repair (your B), is done and checked.** The failed import's 500 inserted answers were deleted and its 500 superseded
  answers made current again. That leaves 8,012 current answers and no feature without a current answer. Its competitor changes stay.
- ✅ **Steps 2–5 are done.**
  - Each file now imports in **one Postgres transaction**: on any error nothing is kept, and only the `data_imports` error row is
    written.
  - New answers are written before the old ones are superseded.
  - The validation matches every unique index and constraint in the database.
  - Owner.com and MENU TIGER are each one competitor in the data file.
  - Both entry points take the connection string only through `scripts/db-migrate.cjs`.
- ✅ **Step 6: imported and published.**
  - The live dry runs matched the real runs exactly.
  - **28 countries are live** (5 before). AE is not live.
  - All 18 price corrections are in (the 16 from compare-research-1 plus Spevdo's 2), and no current plan is 100× too high.
  - Every answer has exactly one current row.
- ✅ All 11 comparison harnesses pass, before and after. The new harness `scripts/compare-fix-2.cjs` passes 79 of 79. tsc and ESLint
  are clean on the changed files.
- ⚠️ **The live line-up changed in US and IT, by your rules.** US now shows four food-truck tools: Food Truck ONE is "beyond the four
  shown". IT shows Qromo, MenuForma, Software Food Good and Tilby; xMenu was taken down as "not needed: food-truck tools come first". See §7.

## 1 · Step 1: the repair (Dominic's B)

**What it changed** (shown before it ran), all in one table, `competitor_feature_values`:
- deleted the 500 rows the failed import inserted (created between 17:17:50.512 and 17:19:00 UTC);
- made current again the 500 rows it superseded in that window.

Nothing else changed: competitors, plans and entries were untouched.

**The migration** `supabase/migrations/20261128_compare_fix_2_repair.sql` (commit 1223de95) is one transaction with guards:
- **before:** exactly 500 rows inserted, none changed since; exactly 500 superseded, none with another current answer; 8,012 current;
- **after:** 8,012 current, and nothing left from the window.

**The rolled-back proof** (`scripts/compare-db-proofs.cjs --preflight-repair …`):

| | current answers | all answers | inserted in window | superseded in window | pairs without a current answer | live-page answers current |
|---|---|---|---|---|---|---|
| before | 8,012 | 11,977 | 500 | 500 | 322 | 210 / 248 |
| inside the rolled-back transaction | 8,012 | 11,477 | 0 | 0 | 0 | 248 / 248 |
| after the rollback | identical to before | | | | | |

The migration then ran through db-migrate.cjs: one transaction, no error.

**Verified read-only** (`--repair-check` and the MCP): 8,012 current, 0 rows in the window, 0 pairs without a current answer, and the
four live-page competitors (Food Truck ONE, xMenu, Mobaregi, Chuzmonster) with every answer current.

## 2 · Step 2: the importer is all-or-nothing

- **`lib/data-import/importer.ts`** `runImports` takes two new options:
  - `transaction(fn, { rollback })`: each file's reads, writes and its `ok` row run inside one transaction. On any error it is rolled
    back, and only the `error` row is written, outside the transaction.
  - `dryRun`: the same import inside a transaction that **always** rolls back. It reports the counts and records nothing, not even an
    error row. A dry run without a transaction is refused.
- **The write order** (`lib/data-import/research.ts`):
  - **Answers:** new rows are inserted "pending" (`superseded_at = PENDING_AT`, 9999-12-31, which keeps them outside the one-current-answer
    index). Then the old rows are superseded. Then the new rows are made current; only rows still at `PENDING_AT` can be.
  - **Plans:** new plans are inserted before the corrected ones are superseded.
- **The Postgres store** `lib/data-import/store-pg.ts` makes the same reads and writes as the Supabase store, over one connection.
  - Rows travel as JSON and are typed by the table itself (`json_populate_recordset`; `lib/pg-rows.ts`).
  - Reads come back exactly as the REST client returns them.
  - A refused write carries the database's own message and detail.
- **Re-running is safe:** a failed file leaves nothing behind, so the next run starts from the same state. A file already imported is
  skipped ("unchanged").
- **Harness cases** (`scripts/compare-fix-2.cjs` §1–2), on a transactional in-memory store that enforces the database's unique indexes
  after every write:
  - a failure at each of the 8 write steps leaves competitors, plans, entries, answers and checks **exactly as before**, plus the one
    error row;
  - the re-run succeeds and a third run does nothing;
  - the dry run keeps nothing;
  - the write order is pending → supersede → activate.

## 3 · Step 3: the validation matches the database

- **`docs/compare-fix-2/db-rules.json`** is a snapshot of every unique index (10) and every constraint (64 names in all) on the tables
  the importer writes. It was read from `pg_indexes` and `pg_constraint`, read-only.
- **`MIRRORED_DB_RULES`** in `research.ts` says, for each of those names, where it is enforced before anything is written: by the
  validator, by the importer, or "not written by the importer". The harness fails if any database rule is missing from it, or if it
  names a rule the database doesn't have.
- **`researchProblems`** now also refuses:
  - **a competitor appearing twice in one file:** by id, by name (lower-case and trimmed, as `competitors_name_ci_key`) or by website
    domain ("— merge them");
  - **competitor values the CHECKs forbid:** a check interval outside 7–365, the category, category_by and check_urls_by values, and
    check_urls that isn't a list;
  - **plan and entry ids:** missing, or appearing twice;
  - **entries:** the country format, the group label (1–60 characters), and the same (country, competitor) twice;
  - **answers:** a source address that isn't http(s).
- **The real dry run** is §6a. `docs/compare-fix-1/simulate.cjs` now enforces the unique indexes as well.

## 4 · Step 4: the data file

- **The fix:** `docs/compare-research-1/build.cjs` now makes a **prepass** over every raw file and learns each stored competitor's
  website host and name. A row without a stored id is then merged into that stored competitor wherever it comes in the files. Before,
  it was merged only when the stored row came first.
  - Merged now: **Owner (CA) → Owner.com `1a32fe8f`**, and **MENU TIGER (GR, NO) → `d00d6bfd`**.
  - A merged vendor keeps the stored row's name.
  - A first version of this fix also renamed SumUp and changed two websites (Jamezz, Flipdish). I caught it in the diff before
    committing and fixed it.
- **The rebuilt `data/compare-research-1/competitors.json`, compared with the committed one:**
  - **competitors:** 161 → 159. The two new-id rows (`ca13ac16`, `e8beb753`) are gone. Only Owner.com and MENU TIGER change: merged
    notes, check pages and answers. MENU TIGER keeps not-sold-in HK, RO and TH.
  - **plans:** 8 re-keyed under the stored ids (Owner CA ×2, MENU TIGER GR ×3 and NO ×3).
  - **entries:** 3 re-keyed (Owner CA, MENU TIGER GR and NO).
- **Spevdo's prices are kept:** €60 / €120 / €230 a month excl. VAT.
- **`--check` passes,** including the new uniqueness rules. Every competitor appears once by id, name and domain.

## 5 · Step 5: credentials

**`scripts/comparison-db.ts`** is used by both entry points (`scripts/data-import/main.ts` and `scripts/comparison-publish/main.ts`):

```ts
const m = createRequire(path.join(process.cwd(), 'package.json'))('./scripts/db-migrate.cjs') as Migrate
const url = process.env.SUPABASE_DB_URL || m.dbUrl()          // db-migrate.cjs's own reader; the secret in GitHub Actions
const scrub = (msg: unknown) => m.scrub(msg instanceof Error ? msg.message : String(msg), url)
const { Client } = m.loadPg()
const client = new Client({ connectionString: m.withoutSslmode(url), ssl: { rejectUnauthorized: false }, … })
```

- **No other file is read.** There is no `readFileSync`, no dotenv and no `.env` path of its own; the harness checks this. No value is
  ever printed: every message is scrubbed, and a failure message is scrubbed of any connection string.
- **Every statement is printed** before it is sent: its text, and for each parameter only its size, never row values.
- **The old route is gone.** Before, both entry points read `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the
  environment and used the REST client. That client cannot hold a transaction.
- **The publish step** runs in one transaction too:
  - `--dry-run` rolls back;
  - it evaluates countries only (`skipFindings`);
  - it refuses if AE comes out live, and the database refuses that too (`comparison_publish_never_ae`);
  - it refuses if any country fails;
  - it asks the site to refresh only after the commit.
  - Its prices-and-answers stores are read-only subsets: any write method throws, which rolls the transaction back.
- **Run with:** `npx -y -p pg@8.13.1 node scripts/competitor-check/run.mjs scripts/data-import/main.ts [--dry-run]`, and the same for
  `scripts/comparison-publish/main.ts`.

## 6 · Step 6: the runs on the live database

Every statement each run sent is printed in its log (scratchpad `cf2-import-dry.log`, `cf2-import-real.log`, `cf2-pub-dry.log` and
`cf2-pub-real.log`).

### a · Import dry run (rolled back)

The other 4 registered files were already imported ("nothing to do"). For `data/compare-research-1/competitors.json`:

| | before | inside the transaction (then rolled back) |
|---|---|---|
| plans (current) | 311 (298) | 537 (506): +226 added, 18 corrections superseded |
| entries | 153 | 226 (+73) |
| answers (current) | 11,477 (8,012) | 12,621 (8,656): +1,144 added, 500 superseded |
| check records | 14,213 | 14,627 (+414; 1,144 recorded, the rest updates) |
| competitors | 221 | 221: 139 updated (only `check_requested_at`), 0 added |
| pending answers / pairs without a current answer | 0 / 0 | 0 / 0 |

**After the rollback: no change.**

**The 73 entries added, by country:**
- **AT:** Liefersoft, GastroDok, FoxiFood, gastro25
- **AU:** Asky, Wollopit, Y wait, Square
- **BE:** Payli, Fritzy, Restomax, DigiCommerce
- **BG:** SumUp
- **CA:** iShopo, Owner.com, OrderEatRepeat
- **CH:** Pikit, Ordero, Rent-a-Shop, SwissPOS
- **CY:** SumUp, Storekit
- **CZ:** DISH Professional Order
- **DE:** Liefersoft, Menuthere
- **DK:** Truckly
- **EE:** SumUp, Poster
- **FI:** SumUp
- **FR:** Vroomeat, LivePepper, bonappli, L'Addition, Feadys
- **GB:** GloriaFood (see §7)
- **GI:** Order Tiger
- **GR:** SumUp, Worldline, MENU TIGER
- **HK:** Eats365
- **HR:** SumUp
- **HU:** Orderly, QRM.hu, eSystem, StandMágus
- **IT:** MenuForma, Software Food Good, Tilby
- **LT:** SumUp, Refektorius, ared
- **LU:** SumUp
- **LV:** SumUp
- **MT:** Storekit
- **MY:** StoreHub, Qashier
- **NL:** iButler
- **NO:** SumUp, MENU TIGER
- **NZ:** SmakSpace
- **PL:** Frivo, Restaumatic, restauracja.online, GoPOS, Foodeliver
- **PT:** SumUp
- **RO:** MenuForma, 4SaleFood
- **SE:** Yabie
- **SI:** SumUp
- **TH:** StoreHub, Wongnai POS
- **US:** Order Tiger

**The statements** (each distinct one; counts in brackets):

```sql
begin;
select coalesce(json_agg(x), '[]'::json) as rows from (select file_path, sha256, imported_at, result, counts, message from public.data_imports order by imported_at desc limit 500) x;
select coalesce(json_agg(x), '[]'::json) as rows from (select key, checked, tier, checked_by, scope_by, updated_by from public.comparison_features) x;
select coalesce(json_agg(x), '[]'::json) as rows from (select id, name, website, lifecycle, added_as_candidate, notes, focus, payment_providers, features_checked_on, not_in_countries, check_failures from public.competitors) x;
select coalesce(json_agg(x), '[]'::json) as rows from (select id, competitor_id, country_code, plan_name, superseded_at from public.competitor_plans) x;
select coalesce(json_agg(x), '[]'::json) as rows from (select id, country_code, competitor_id from public.comparison_entries) x;
select coalesce(json_agg(x), '[]'::json) as rows from (select id, competitor_id, feature_key, country_code, value, note, quote, source_url, superseded_at, verified_at, auto_blocked from public.competitor_feature_values where superseded_at is null) x;
update public."competitors" t set "check_requested_at" = r."check_requested_at" from json_populate_record(null::public."competitors", $1::json) r where t."id" = $2;   -- [139]
insert into public."competitor_plans" (…every column the file gives…) select … from json_populate_recordset(null::public."competitor_plans", $1::json);   -- 226 rows
update public.competitor_plans set superseded_at = $2 where id = any($1::uuid[]) and superseded_at is null;   -- the 18 corrected
insert into public."comparison_entries" ("choose_when", "competitor_id", "country_code", "id", "primary_plan_id", "sort_order", "verified_at", "verified_by") select … from json_populate_recordset(null::public."comparison_entries", $1::json);   -- 73 rows
insert into public."competitor_feature_values" ("checked_on", "competitor_id", "country_code", "feature_key", "id", "note", "quote", "source_url", "superseded_at", "value", "verified_at", "verified_by") select … from json_populate_recordset(null::public."competitor_feature_values", $1::json);   -- [3 batches] 1,144 rows, all pending
update public.competitor_feature_values set superseded_at = $2 where id = any($1::uuid[]) and superseded_at is null;   -- 500 old
update public.competitor_feature_values set superseded_at = null where id = any($1::uuid[]) and superseded_at = $2;   -- the 1,144 pending made current
insert into public."competitor_feature_checks" ("checked_on", "competitor_id", "country_code", "feature_key", "pages_checked", "rejudge") select … from json_populate_recordset(null::public."competitor_feature_checks", $1::json) on conflict ("competitor_id", "feature_key", "country_code") do update set "checked_on" = excluded."checked_on", "pages_checked" = excluded."pages_checked", "rejudge" = excluded."rejudge";   -- [3 batches]
rollback;
```

Before, inside and after the run, the tables' row counts were read with one `select (select count(*) from public.competitors)::int …`
(`scripts/comparison-db.ts` `comparisonTally`).

### b · The real import

- The same statements, ending in `commit` instead of `rollback`, plus:
  `insert into public.data_imports (file_path, sha256, imported_at, result, counts, message) values ($1, $2, $3, $4, $5::jsonb, $6)`.
- **Its counts are identical to the dry run's:** competitors 159 (0 added, 139 updated), plans +226 (18 corrected), entries +73,
  answers +1,144 (8,012 → 8,656 current), check records 1,144. `data_imports` 6 → 7.

### c · Publish dry run (rolled back)

- **28 countries would be live**, and the same 4 one short. Inside the transaction: live countries 5 → 28, events +99, marked
  entries 18 → 74.
- **After the rollback: no change.**
- **The statements:**
  - **reads:** `country_settings`, `comparison_publish`, the competitors / plans / benchmarks / entries / current answers selects
    (Admin's pricing store columns), the price evidence, the feature checks and the pending findings;
  - **upserts:** `insert into public."comparison_publish" (…) select … from json_populate_recordset(…) on conflict ("country_code") do update set …`
    ([209] countries);
  - **marks:** `update public."comparison_entries" | "competitor_plans" | "competitor_feature_values" set auto_verified_at = $2 where id = any($1::uuid[])`
    ([2] each: set, and cleared on those taken down);
  - **plan pointers:** `update public.comparison_entries set primary_plan_id = $2 where id = $1` ([3]);
  - **events:** `insert into public."comparison_publish_events" ("at", "competitor_id", "country_code", "detail", "kind") select … from json_populate_recordset(…)`;
  - then `rollback`.

### d · The real publish (every enabled country)

The same statements ending in `commit`, with the same result as the dry run. `REVALIDATE_SECRET` isn't set locally, so the pages pick
the change up when their cache expires (5 minutes).

### e · Verified read-only (MCP)

**Live countries and AE:**

```sql
select p.country_code, p.auto_publish, p.auto_live, p.admin_off, p.evaluated_at, (select string_agg(x->>'name', ' · ') from jsonb_array_elements(p.shown) x) shown
from public.comparison_publish p where p.auto_live or p.country_code in ('AE','IE','IT','US') order by p.auto_live desc, p.country_code;
```

| Country | Shown |
|---|---|
| AT | Liefersoft · gastro25 · GastroDok · FoxiFood |
| AU | Y wait · Square |
| BE | Payli · Restomax |
| BR | VexMenu · Food Pronto |
| CA | iShopo · Owner.com |
| CH | Yoveletta · Rent-a-Shop |
| CY | Wiiz Eat · SumUp |
| CZ | Menu55 · DISH |
| DE | Liefersoft · gastro25 · GastroDok · FoxiFood |
| DK | Truckly · NemTakeAway |
| ES | pidopago · TopEstrellas (Pedidos module) |
| FI | Food4you · SumUp |
| FR | Nomad (nomadcaisse.fr) · Place à emporter · Beau Camion · Eatch |
| GB | Ordea · Order Tiger · Perkss · Grafterr |
| GR | Spevdo · Worldline All-in-One Platform Ordering |
| HU | Orderly · QRM.hu · StandMágus / OnlineMágus |
| **IE** | **Order Tiger · Click & Collection** (unchanged) |
| **IT** | **Qromo · MenuForma · Software Food Good · Tilby** |
| JP | Mobaregi · Chuzmonster (unchanged) |
| LT | ared · SumUp |
| MY | Klikit · StoreHub |
| NL | Digitale Menukaart · Qrder · Foodticket |
| NO | Favrit · Superb |
| NZ | HungryTrucks · SmakSpace |
| PL | Frivo · UpMenu |
| RO | 4SaleFood · MenuForma |
| TH | Klikit · StoreHub |
| **US** | **Goodfynd · Where's The Foodtruck · Food Truck Pub · Moonrise** |
| **AE** | **not live:** `auto_publish` false, `auto_live` false, nothing shown |

**Every live country's shown competitors are marked, and only those:**

```sql
select p.country_code, jsonb_array_length(p.shown) shown_n,
 (select count(*) from public.comparison_entries e where e.country_code=p.country_code and e.auto_verified_at is not null) marked_entries,
 (select count(*) from jsonb_array_elements(p.shown) x join public.comparison_entries e on e.country_code=p.country_code and e.competitor_id=(x->>'competitorId')::uuid where e.auto_verified_at is not null) shown_and_marked
from public.comparison_publish p where p.auto_live order by 1;
```

→ in all 28 countries, shown = marked = shown and marked.

**Why US and IT changed:**

```sql
select e.country_code, e.kind, c.name, left(e.detail, 220) detail from public.comparison_publish_events e left join public.competitors c on c.id=e.competitor_id
where e.at > '2026-11-24 17:55' and e.country_code in ('US','IT','IE','AE') order by e.country_code, e.kind, c.name;
```

- **US:** Food Truck ONE was taken down as "beyond the four shown". Four food-truck tools now qualify.
- **IT:** xMenu was taken down as "not needed: food-truck tools come first; others only make up 2".
- **IE:** both competitors published again, unchanged.
- **AE:** no events.

**Every answer current, and the import recorded once:**

```sql
select (select count(*) from public.competitor_feature_values where superseded_at is null) current_answers,
 (select count(*) from public.competitor_feature_values where superseded_at = '9999-12-31T00:00:00Z') pending_answers,
 (select count(*) from (select distinct competitor_id, feature_key, coalesce(country_code,'') cc from public.competitor_feature_values s where not exists (select 1 from public.competitor_feature_values v where v.competitor_id=s.competitor_id and v.feature_key=s.feature_key and coalesce(v.country_code,'')=coalesce(s.country_code,'') and v.superseded_at is null)) x) pairs_without_current,
 (select count(*) from (select competitor_id, feature_key, coalesce(country_code,'') from public.competitor_feature_values where superseded_at is null group by 1,2,3 having count(*)>1) x) duplicate_current,
 (select string_agg(result||' '||to_char(imported_at,'HH24:MI:SS')||' '||left(sha256,12), ' | ' order by imported_at) from public.data_imports where file_path='data/compare-research-1/competitors.json') imports,
 (select count(*) from public.competitors where name ~* '^owner' or website ~* 'owner\.com') owner_rows,
 (select count(*) from public.competitors where name ~* 'menu ?tiger') menutiger_rows;
```

- **Answers:** 8,656 current, 0 pending, 0 pairs without a current answer, 0 duplicates.
- **Import records:** `error 17:17:50 f58d7f1e8807 | ok 17:54:49 00e11a1afa13`.
- **Duplicates:** one Owner.com competitor and one MENU TIGER.

**The corrections** (the 18 plans the file corrects; the current value against the file's):

```sql
with fix(cid, cc, plan, want) as (values /* the 18 (competitor, country, plan, monthly_minor) of the file's corrected plans */)
select c.name, f.cc, f.plan, f.want, (select string_agg(p.monthly_minor::text||' '||p.currency, ',') from public.competitor_plans p where p.competitor_id=f.cid and p.country_code=f.cc and lower(p.plan_name)=lower(f.plan) and p.superseded_at is null) current_value,
 (select count(*) from public.competitor_plans p where p.competitor_id=f.cid and p.country_code=f.cc and lower(p.plan_name)=lower(f.plan) and p.superseded_at is not null) superseded
from fix f join public.competitors c on c.id=f.cid order by c.name, f.plan;
```

All 18 are current at the file's value, each with its old row superseded:

| Competitor | Plan | Now |
|---|---|---|
| The Foody Gram US | Growth | $199 |
| The Foody Gram US | Starter | $159 |
| Order Tiger US | Online Ordering + EPOS | $109 |
| Order Tiger US | EPOS | $49 |
| Wiiz Eat CY | Own app | €85 |
| Eatch FR | Fondateur | €44.50 |
| Beau Camion FR | Vitrine | €29 |
| Ordinalo IT | WhatsApp module | €19 |
| Klikit SG | Core | S$19 |
| Digitale Menukaart NL | Menu | €12 |
| FoodTruck POS NL | Starter | €12.99 |
| Storekit GB | Grow | £99 |
| OrderFront DE | Starter / Premium / Multi | €49 / €69 / €149 |
| Bestelly NL | Compleet | €59 |
| Spevdo GR | Growth / Pro | €120 / €230 |

**No current plan is 100× too high:**

```sql
with ceil(cur, mx) as (values ('USD',1500),('EUR',1500),('GBP',1200),('CHF',1400),('CAD',2000),('AUD',2300),('NZD',2500),('SGD',2000),('HKD',12000),('MYR',7000),('THB',55000),('JPY',230000),('BRL',8000),('MXN',27000),('DKK',11000),('SEK',16000),('NOK',16000),('PLN',6000),('CZK',35000),('HUF',550000),('RON',7000),('BGN',2700),('AED',5500),('INR',125000),('IDR',24000000))
select count(*) filter (where p.monthly_minor / (case when p.currency in ('JPY','IDR') then 1.0 else 100.0 end) > ceil.mx) over_ceiling, count(*) current_priced_plans,
 (select count(*) from public.competitor_plans where superseded_at is null and monthly_minor is not null and currency not in (select cur from ceil)) other_currency
from public.competitor_plans p join ceil on ceil.cur=p.currency where p.superseded_at is null and p.monthly_minor is not null;
```

→ 0 of 436 current priced plans are over their ceiling, and none is in another currency. The full named list (Foody Gram, Order Tiger
US, Wiiz Eat, Eatch, Beau Camion, Ordinalo, Klikit SG, Digitale Menukaart, FoodTruck POS) was also read plan by plan. Every one is at
its corrected value.

**Workflow:** `gh workflow list --all` → `Competitor check  disabled_manually` (unchanged).

## 7 · Flags

- **US and IT line-ups changed by your rules:** food-truck tools first, at most 4.
  - **US:** Food Truck ONE (on the live page since compare-autopublish) is no longer shown. Four other food-truck tools outrank it.
  - **IT:** xMenu is replaced by MenuForma, Software Food Good and Tilby, with Qromo.
  - If you want either kept, it's a decision for you (pinning, or the ranking rule).
- **GloriaFood GB:** the file adds a GB entry and plans for GloriaFood. The database already lists GB as a country where it isn't sold,
  so the publish skips it there ("not sold in this country"). It's harmless, but the raw research and the not-sold-in list disagree.
  This came from compare-research-1's data, not from this change.
- **"The 16 corrections" are now 18:** compare-research-1c added Spevdo's Growth and Pro corrections. All 18 are in.
- **My earlier 100× query was wrong for HUF.** The query in `docs/compare-fix-1-verify-report.md` §3 treated HUF as having no minor
  unit. `lib/money-format` gives it two, so the four HU plans it would flag (6,990–16,800 Ft) are right. The query above uses the
  correct rule.
- **Before you re-enable the Competitor check workflow:**
  - it runs origin/main's code, which is the old non-transactional importer;
  - once this branch is merged, the import and publish need a **`SUPABASE_DB_URL` repository secret** and
    `npx -y -p pg@8.13.1` in the workflow step.
  - It stays disabled; I didn't touch it.
- **compare-fix-1's harness was re-pinned in one check.** Its dry-run assertion expected every write replaced by a no-op; the dry run
  is now one transaction that rolls back.
- **Another session's changes were left alone:** its uncommitted france-privacy hunks in `scripts/harnesses.json` were not committed
  (only my two lines were staged).
- **Garbled or contradictory instructions:** nothing in the prompt arrived garbled. The one contradiction (step 1's 322 against 8,012)
  was settled by your B.
- **What wasn't done:** no deploy, no push, no customer-facing wording or layout change, nothing outside the competitor and comparison
  tables (`country_settings` only read), no `.env` file opened.

## 8 · Checks

| Harness | Before (HEAD 1223de95, clean worktree) | After |
|---|---|---|
| compare-fix-1 | 65 / 65 | 65 / 65 (one check re-pinned, §7) |
| competitor-check-1 | 227 / 227 | 227 / 227 |
| competitor-wtt-1 | 42 / 42 | 42 / 42 |
| competitor-features-2 | 79 / 79 | 79 / 79 |
| compare-no-system | 54 / 54 | 54 / 54 |
| compare-de-1 | 93 / 93 | 93 / 93 |
| competitor-check-8 | 51 / 51 | 51 / 51 |
| compare-suits-1 | 72 / 72 | 72 / 72 |
| compare-autopublish-1 | 75 / 75 | 75 / 75 |
| compare-languages-1 | 24 / 24 | 24 / 24 |
| compare-ux-1 | 39 / 39 | 39 / 39 |
| **compare-fix-2 (new)** | — | **79 / 79** |

- `npx tsc --noEmit`: 0 errors.
- ESLint on every changed file: clean.
- `node docs/compare-research-1/build.cjs --check`: passes.

**Files:**
- **new:** `lib/pg-rows.ts`, `lib/data-import/store-pg.ts`, `lib/comparison-publish-store-pg.ts`, `scripts/comparison-db.ts`,
  `scripts/compare-fix-2.cjs`, `scripts/compare-db-proofs.cjs`, `docs/compare-fix-2/db-rules.json`,
  `supabase/migrations/20261128_compare_fix_2_repair.sql`;
- **changed:** `lib/data-import/importer.ts`, `lib/data-import/research.ts`, `scripts/data-import/main.ts`,
  `scripts/comparison-publish/main.ts`, `docs/compare-research-1/build.cjs`, `docs/compare-fix-1/simulate.cjs`,
  `data/compare-research-1/competitors.json`, `scripts/compare-fix-1.cjs`, `scripts/harnesses.json` (2 lines).

## Undo (only if Dominic asks)

- **Taking the countries down:** use Admin's switch per country (`admin_off`), or have the next publish run evaluate again. The publish
  wrote only `comparison_publish`, its events (from 17:55:20 UTC) and the marks.
- **Undoing the import:** its rows are all dated by `created_at` / `superseded_at` at 17:54:49–17:55 UTC. It can be reversed the way
  migration 20261128 reversed the failed one: delete what it inserted, and make current again what it superseded. That would need its
  own migration, with a rolled-back proof first.
