# compare-fix-1-verify — what step 6 actually did (read-only check)

**24 November 2026, checked from 17:40 UTC · READ-ONLY (SELECTs, `gh workflow list`, a public GET of `/llms.txt`) · nothing changed**

## 0 · Result

- 🔴 **The import FAILED part-way, and the publish wrote nothing.**
  - `data_imports` records `data/compare-research-1/competitors.json` with result **error** at 17:17:50 UTC: *"Feature answers: add 1151
    feature answer(s) refused by the database: duplicate key value violates unique constraint "competitor_feature_values_current""*.
  - No country has been evaluated since this morning's nightly run (12:24 UTC). There are no publish events and no new marks.
- **What is live is unchanged: the same 5 countries as before.**

| Country | Shown (stored) | Note |
|---|---|---|
| FR | Eatch · Heustach · Restaurant-internet.com | |
| IE | Order Tiger · Click & Collection | |
| IT | DineEasy · xMenu | DineEasy is now not relevant, so the page shows xMenu only |
| JP | Mobaregi · Chuzmonster | |
| US | Food Truck ONE · Owner.com | the page shows Food Truck ONE only, as before |

  `/llms.txt` lists the same 5. **AE is not live**: its row is untouched, `auto_publish` false.
- ✅ **The competitor stage completed as the data file says:**
  - 18 not relevant;
  - 5 back to active;
  - 15 not-sold-in countries;
  - 13 new competitors added;
  - failure counts reset.
- 🔴 **The plan stage was never reached**, so none of the 16 corrections was applied. **8 stored plans are still 100× too high** (§3).
  No new plans and no entries were written.
- 🔴 **The answers are half-written.** 500 old answers were superseded and 500 new ones inserted (the first batch of 500). The rest were
  refused. **322 (competitor, feature) pairs now have no current answer**: 207 were empty placeholders, and 115 had a value (the 23 Oct
  quoteless answers). **64 of them belong to competitors on public pages** (Food Truck ONE, xMenu, Mobaregi, Chuzmonster), which now show
  "doesn't say" for those features.
- ✅ The "Competitor check" workflow is **disabled_manually**.

## 1 · Why the import failed (my error)

- **Two pairs of file rows land on the same stored competitor, each with its own 14 answers:**
  - **Owner.com** (`1a32fe8f`): the CA row "Owner" (new id, www.owner.com) and the US row "Owner.com" (stored id);
  - **MENU TIGER** (`d00d6bfd`): the GR row (new id, menutiger.com/el) and the stored row.
- The importer maps both rows of a pair to the same competitor and inserts both sets of answers. The unique index (one current answer
  per competitor, feature and country) refuses the second set, and the whole remaining batch fails with it.
- **How it got through:**
  - `build.cjs` merges vendors by stored id or website host. A new-id row seen first (CA before US; GR before the stored row) wasn't
    merged with the stored row of the same website.
  - My simulation's in-memory store did not enforce that unique index, so the dry run in compare-fix-1 §4 showed a clean import.
- **The importer also supersedes the placeholders BEFORE inserting the new answers.** When the insert failed, those answers were left
  with no current row.

## 2 · Do NOT re-run the import with this file

**A second run of the same file would fail at the same point** (the two duplicates are still in it).
- Before failing, it would supersede the next set of placeholders, leaving more features without an answer.
- The file's sha matches the failed attempt, so the importer would try again.

**What is needed** (a code change, not made here, since this check changes nothing):
1. `build.cjs` merges a new row with the stored competitor that has the same website host, so there is one row per competitor.
2. The importer de-duplicates answers per competitor, feature and country within one import.
3. It inserts the new answers first and supersedes the old ones only after the insert succeeds.
4. The simulation enforces the unique index.

Then:
- **Re-run:** the import (a new sha) and the publish.
- **Already done:** the competitor stage is idempotent and its changes are in.
- **Still to write:** the 322 orphaned pairs have no current row, so they get their new answers; plans, corrections, entries and check
  records are written for the first time.

## 3 · Checks, with results

**Import record:**
```sql
select file_path, result, imported_at, left(coalesce(message,''),200) message, counts::text from public.data_imports
 where file_path like 'data/compare-research-1%' order by imported_at desc limit 5;
```
→ one row: `error`, 2026-11-24 17:17:50 UTC, the duplicate-key message above, counts `{}`.

**What is live, and AE:**
```sql
select p.country_code, p.auto_publish, p.auto_live, p.admin_off, p.evaluated_at, p.live_since::date,
 (select string_agg(x->>'name', ' · ') from jsonb_array_elements(p.shown) x) shown
from public.comparison_publish p where p.auto_live or p.country_code in ('AE','IE','IT','US') order by p.auto_live desc, p.country_code;
```
→
- **live:** FR, IE, IT, JP, US, each evaluated at 12:24:18 UTC (the nightly run), with the competitors in §0;
- **AE:** `auto_publish` false, `auto_live` false, last evaluated 7 Nov.

**What was written after 17:00:**
```sql
select (select count(*) from public.comparison_publish) publish_rows, (select max(evaluated_at) from public.comparison_publish) last_eval,
 (select count(*) from public.comparison_publish where evaluated_at > '2026-11-24 17:00') evaluated_since_17,
 (select count(*) from public.comparison_publish_events where at > '2026-11-24 12:00') events_today,
 (select count(*) from public.comparison_entries where auto_verified_at > '2026-11-24 17:00') entries_marked_since_17,
 (select count(*) from public.competitors where created_at > '2026-11-24 17:00') competitors_added_since_17,
 (select count(*) from public.competitor_plans where created_at > '2026-11-24 17:00') plans_added_since_17,
 (select count(*) from public.competitor_plans where superseded_at > '2026-11-24 17:00') plans_superseded_since_17,
 (select count(*) from public.comparison_entries where created_at > '2026-11-24 17:00') entries_added_since_17,
 (select count(*) from public.competitor_feature_values where created_at > '2026-11-24 17:00') answers_added_since_17,
 (select count(*) from public.competitor_feature_values where superseded_at > '2026-11-24 17:00') answers_superseded_since_17,
 (select count(*) from public.competitor_feature_checks where checked_on = '2026-11-24') checks_24nov;
```

| What | Count |
|---|---|
| publish rows | 44 (no new ones) |
| countries evaluated since 17:00 | 0 |
| publish events today | 0 |
| entries marked since 17:00 | 0 |
| competitors added | 13 |
| plans added / superseded | 0 / 0 |
| entries added | 0 |
| answers added / superseded | 500 / 500 |
| check records dated 24 Nov | 0 |

**Not relevant, restored and not sold in, against the file:**
```sql
select left(id::text,8) pre, name, lifecycle, not_in_countries, check_failures, focus, (notes like '%compare-research-1%') has_research_note
from public.competitors where left(id::text,8) in (/* the 18 not relevant, the 5 restored, the 10 with not_sold_in */) order by lifecycle, name;
```
→ every row is as the file says, each with its research note:
- **not_relevant (18):** ABS POS, AdvaNceD IoT, apetitio, Aphelios, Creavo Order, Dine360, DineEasy, Food Truck Concept, FoodTruck POS,
  Gustoco, Liven, Moduurn, Ordeno App, Orsys, POSbistro, Soften Food, VirtualLine, Zettle;
- **active again (5):** Qromo, Yoveletta, WEIQ, Digitaste, Superb (failure count 0);
- **not_in_countries:**

| Competitor | Countries |
|---|---|
| Ordering.co | AU |
| EatSelf | ES |
| MENU TIGER | HK, RO, TH |
| GloriaFood | GB, IE, PT, TH (GB was already there) |
| Take App | TH |
| SumUp | MT, SE |
| Flipdish | PT |
| UpMenu | PT |
| Order Tiger | PT |
| Pikit | LI |

**New competitors (13):**
```sql
select name, website, lifecycle, focus, created_at from public.competitors where created_at > '2026-11-24 17:00' order by name;
```
→ ared, Eats365, Frivo, OrderEatRepeat, Payli, Poster, Qashier, Refektorius, StoreHub, Truckly, Wongnai POS, Worldline, Yabie. All are
active and none has a plan or an entry yet.

**Plans still 100× too high** (above the plausible monthly ceiling, `lib/price-units.ts`):
```sql
with ceil(cur, mx) as (values ('USD',1500),('EUR',1500),('GBP',1200),('CHF',1400),('CAD',2000),('AUD',2300),('NZD',2500),('SGD',2000),('HKD',12000),('MYR',7000),('THB',55000),('JPY',230000),('BRL',8000),('MXN',27000),('DKK',11000),('SEK',16000),('NOK',16000),('PLN',6000),('CZK',35000),('HUF',550000),('RON',7000),('BGN',2700),('AED',5500),('INR',125000),('IDR',24000000))
select c.name, p.country_code, p.plan_name, p.monthly_minor, p.currency, p.status
from public.competitor_plans p join public.competitors c on c.id=p.competitor_id join ceil on ceil.cur=p.currency
where p.superseded_at is null and p.monthly_minor is not null and p.monthly_minor / (case when p.currency in ('JPY','HUF','IDR') then 1.0 else 100.0 end) > ceil.mx
order by p.monthly_minor desc;
```

| Competitor | Plan | Stored | Should be |
|---|---|---|---|
| The Foody Gram (US) | Growth | $19,900 | $199 |
| The Foody Gram (US) | Starter | $15,900 | $159 |
| Order Tiger (US) | Online Ordering + EPOS | $10,900 | $109 |
| Wiiz Eat (CY) | Own app | €8,500 | €85 |
| Order Tiger (US) | EPOS | $4,900 | $49 |
| Eatch (FR) | Fondateur | €4,450 | €44.50 |
| Beau Camion (FR) | Vitrine | €2,900 | €29 |
| Ordinalo (IT) | WhatsApp module | €1,900 | €19 |

Three more from the 100× list sit just under their currency's ceiling, so this query doesn't show them. They are still stored at their
wrong values too: Klikit SG Core (S$1,900), Digitale Menukaart Menu (€1,200) and FoodTruck POS Starter (€1,299).

**Answers left without a current row:**
```sql
with sup as (select s.competitor_id, s.feature_key, s.value, s.quote from public.competitor_feature_values s where s.superseded_at > '2026-11-24 17:00'
  and not exists (select 1 from public.competitor_feature_values v where v.competitor_id=s.competitor_id and v.feature_key=s.feature_key and coalesce(v.country_code,'')=coalesce(s.country_code,'') and v.superseded_at is null))
select count(*) filter (where value='unknown' and coalesce(quote,'')='') placeholders, count(*) filter (where value<>'unknown') with_a_value, count(distinct competitor_id) competitors,
 count(*) filter (where exists (select 1 from public.comparison_entries e where e.competitor_id=sup.competitor_id and e.auto_verified_at is not null)) on_public_pages, …
from sup;
```
→ 322 pairs in total: 207 placeholders and 115 with a value, across 54 competitors. 64 of the pairs belong to competitors with marked
entries: Flipdish, Food Truck ONE, Klikit, Menu55, Ordea, xMenu, Chuzmonster and Mobaregi. Of these, only the US, IT and JP ones are on
live pages.

**The duplicates** (offline, the importer's own match rule on the export of compare-fix-1 §8): Owner.com ← "Owner" (CA) + "Owner.com"
(US); MENU TIGER ← "MENU TIGER" (GR, menutiger.com/el) + "MENU TIGER" (stored).

**Workflow:** `gh workflow list --all` → `Competitor check  disabled_manually`.

## 4 · Flags

- Nothing in the prompt arrived garbled. Nothing contradicts.
- Nothing was changed: no SQL write, no file change except this report, no workflow change, no push.
- **Correction to compare-fix-1:** its §4 "simulated result" (28 live) assumed an import that would succeed. It can't with this file
  (§1). The prediction still holds once the duplicates are fixed and the import re-run.
