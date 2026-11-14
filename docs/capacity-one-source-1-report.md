# capacity-one-source-1: prep time and items per batch now agree everywhere

**13 November 2026.** Prep time, items per batch and "counts to total capacity" now come from one place:
- Menu › Items and Menu › Kitchen capacity show the same numbers.
- Both screens write through the same server function.
- Each Settings warning uses its van's numbers.
- An event with no van uses the same numbers as one with a van.

Data was synced on the two test trucks only (Pizza Kitchen and Pizza Kitchen US). No live truck was changed, and none has a mismatch.

Not deployed. Nothing is committed except the data-sync migration.

**Full sweep: 215 pass, 5 fail.** None of the five is this work; they are the same five that failed before it (§4).

---

## 1 · Diagnosis (read-only)

### Every truck where a category differs from its first van

The first van is the oldest active van by `created_at`. "Live" means the truck had real orders in the last 30 days.

| Truck | Slug | Live? | Vans | Category | menu_categories (prep / batch / counts) | First van's row (prep / batch / counts) |
|---|---|---|---|---|---|---|
| Pizza Kitchen | `test-truck` | **No**: 6 orders in 30 days, all staff "Walk-up" test orders | 1 active (Van1) + Van2 retired | Pizza | 900 s (15 min) / 8 / yes | 300 s (5 min) / 4 / yes |
| Pizza Kitchen US | `test-truck-us` | **No**: 5 orders, all "US Test" | 1 (Truck 1) | Pizza | 900 s (15 min) / 8 / yes | 300 s (5 min) / 4 / yes |

- These were the only two mismatches.
- Only these two trucks have any `van_category_settings` rows at all. Every other truck, live or test, has no per-van rows, so its vans already read menu_categories and nothing could disagree.
- Pizzeria Gusto and Le Roi du Churrasco have no per-van rows. They were not tested against and not changed.

### Pizza Kitchen exactly

| Where | Pizza | Desserts | Drinks |
|---|---|---|---|
| menu_categories (what Items showed: "15m prep", "8 at a time") | 15 min / 8 / counts | instant / ∞ | instant / ∞ |
| Van1 (active, first): `van_category_settings` (what Kitchen capacity showed) | **5 min / 4** / counts | no row → instant / ∞ | no row → instant / ∞ |
| Van2 (retired): `van_category_settings` | 5 min / 4 / counts | none | none |

- **The upcoming event** is 13 Nov 17:00–22:00 on Van1, so its orders used **5 min / 4**.
- **Before this change, an event with no van would have used 15 min / 8.**
- **The Settings warning** read menu_categories. At Van1's interval of every 5 minutes it said "Pizza takes 15 minutes…", about a prep time no order was using.

---

## 2 · One source of truth (code)

### The one writer: `lib/category-capacity-write.ts` (new)

**`writeVanCategoryCapacity(truck, van, category, patch)`** is the body of `upsert_van_category`, moved here unchanged in behaviour:
- it checks that both ids belong to this truck;
- it seeds the row from what the van already resolves, so fields not in the patch don't jump;
- it upserts on `(van_id, category_id)`;
- it fans out to vans that follow the first van's capacity.

It adds two steps when the van **is the first van**:
1. **Mirror into menu_categories.** The same three values are written there, so events with no van use the same numbers.
2. **Keep the other vans where they are.** A van that does *not* follow Van 1's capacity and has no row of its own for that category reads menu_categories. The mirror would silently move it. So before mirroring, that van gets its own row at the values it is using now. This only matters on a multi-van truck set to separate capacities. No truck has that shape today, but without this step the change would have been a silent behaviour change there.

**`writeCategoryCapacityForTruck(truck, category, patch)`** is for callers with no van in hand:
- a truck with a van writes **through its first van**, using the function above;
- only a truck with **no active van** writes menu_categories directly, because there is nothing to resolve through.

**`mirrorFirstVanToMenuCategories`** runs after `delete_van`. If the first van was removed, the next-oldest van becomes first, and menu_categories follows it.

**`readCategoriesForFirstVan` / `resolveForFirstVan`** are what Manage shows:
- the categories as the first van resolves them, using the existing resolver (`resolveCategories`);
- the number of active vans;
- the categories another active van runs differently.

### Routes

| Route / action | Before | Now |
|---|---|---|
| `GET /api/manage` | `categories` = raw menu_categories | `categories` resolved for the **first van**, plus `capacityView: { firstVanId, vanCount, vansDiffer }`. Fails open: if the per-van read fails, categories come back as stored. |
| `upsert_van_category` (Kitchen capacity, dashboard card) | wrote the van row and fan-out | delegates to `writeVanCategoryCapacity`. It now also mirrors and keeps independent vans. Response adds `mirrored`. |
| `upsert_category` (existing category) | wrote prep / batch / counts straight into menu_categories (**the second writer**) | writes only the menu fields (name, notes, stock, order). Prep, batch and counts, when sent, go through `writeCategoryCapacityForTruck`. A new category is still one insert: no van has a row for it, so nothing can disagree. |
| `delete_van` | soft delete | + `mirrorFirstVanToMenuCategories` |
| dashboard `update_category` | wrote prep / batch / counts into menu_categories | name and notes only; capacity fields go through `writeCategoryCapacityForTruck`. Its only client, `saveCatEdit`, is already unreachable: `openCatEdit` has no caller. |
| dashboard `save_prep_configs` | wrote menu_categories | through `writeCategoryCapacityForTruck`. It has no client caller. |

### Screens

**Menu › Items, category card** ([app/(app)/manage/[token]/page.tsx](../app/(app)/manage/[token]/page.tsx), `MenuTab.saveCat` and the card header)
- The header chips ("5m prep", "4 at a time", "counts") and the Prep and Batch fields show the first van's effective values, because the page's `categories` are now resolved that way.
- Editing Prep or Batch calls **`upsert_van_category` for the first van**: the same action and server function Kitchen capacity uses, including its fan-out. A truck with no van falls back to `upsert_category`, which the server routes through the same function.
- Name, notes and stock saves no longer send prep or batch at all.
- **Multi-van trucks whose vans differ** for that category get one line under the chips:

  | Locale | Line |
  |---|---|
  | en-GB | "Van 1. Other vans: Kitchen capacity tab." |
  | en-US | "Truck 1. Other trucks: Kitchen capacity tab." |
  | fr-FR | "Camion 1. Autres camions : onglet Capacité de la cuisine." |

**Menu › Kitchen capacity** ([components/manage/KitchenCapacitySection.tsx](../components/manage/KitchenCapacitySection.tsx))
- Writes unchanged.
- An edit to the first van now also patches the page's category list (`onFirstVanCategoryChange`), so the Items tab shows it without a reload.
- Its "half-configured category" warning now uses **each van's** values, not the truck row.

**Settings › Truck settings › Collection times warning** (Manage)
- Now `misalignedCookingCategory(interval, categories.map(c => ({ ...c, ...effectiveVanCat(van, c) })))`. That is **this van's** values, the same resolution the van card uses.

**Dashboard warning**
- Unchanged and already right. It reads `truckMenu.categories` from `/api/menu`, which resolves for the selected event's van. A no-van event reads menu_categories, which now mirrors the first van.

### The French term
- **The brief asked for "Véhicule 1. Autres véhicules…"**, but also said to check and reuse the existing French term.
- The app's French says **"camion" / "Camion 1"**, never "véhicule":
  - `kitchenCapacity.boxTitleAll` "Tous les camions · …"
  - `firstVanName` "Camion 1"
  - "Copier les réglages du Camion 1"
- The tab is **"Capacité de la cuisine"** (`manageShell.menuSections.capacity`).
- So the line is "**Camion 1. Autres camions : onglet Capacité de la cuisine.**" (non-breaking space before the colon, as elsewhere in fr-FR).
- Every other language reuses its own existing words for "Van 1" and the tab name, from its `firstVanName` and `manageShell.menuSections.capacity`.

### Messages (every locale, through the normal pipeline)
- New key `manageMenu.category.otherVans`:
  - in en-GB and all **49 other base languages**;
  - plus en-US's own wording ("Truck 1 … trucks", matching en-US's existing "All trucks");
  - each language's existing word for van, plural vans and the tab name reused.
- Back-translations added to `docs/i18n/back/<locale>.json` for all 48 non-English bases.
- `scripts/split-messages.cjs` regenerated `messages/ns/*`.
- Regionals (es-AR / es-PY / es-UY, de-CH, pt-AO …) inherit their base. Nothing in the line changes with voseo or Swiss spelling.
- messages-parity: **1,219,951 passed, 0 failed**.

### Every other reader of prep / batch

| Reader | What it is | Status |
|---|---|---|
| `/api/slots/[truckId]` | customer slot grid | resolver, per event van (unchanged) |
| `/api/dashboard` | board, KDS, dashboard capacity card | resolver, per selected event's van (unchanged) |
| `lib/prep-utils.ts` `buildCatConfigs` → `/api/orders/submit` | order acceptance | resolver (unchanged) |
| `/api/menu/[truckId]` | customer menu; the dashboard's `truckMenu`; `lib/native/menuSnapshot.ts` offline copy | resolver (unchanged) |
| `lib/seed-demo-orders.ts` | demo order seeding | resolver (unchanged) |
| Dashboard capacity card and misaligned warning | operator | from `/api/menu`, resolved for the event's van. Already correct. |
| Manage Items card, Kitchen capacity, Settings warning | operator | **changed** (above) |
| Manage `SettingsTab.updateCatField` / `toggleCatCapacity` | dead: no callers since capacity moved | left. If revived, `upsert_category` now routes their prep / batch / counts through the one writer. |
| `lib/go-live-checks.ts` | go-live gate | **unwired**: `checkGoLive` has zero call sites. It reads whatever categories it is given. If it is ever wired, pass it the first-van-resolved categories from the manage GET. Not changed. |
| `lib/menu-commit.ts` (import commit) | inserts new categories; **reactivates a soft-deleted same-name category with the import's prep / batch** | New categories have no van rows, so they agree. **Reactivation** writes menu_categories directly; if the first van still holds a row for that old category id, they would differ. Rare (delete a category, then re-import one with the same name); not changed. **Listed for a decision.** |
| `lib/provision-demo.ts` | sets cook time / batch on a new demo truck's cooking categories | demo trucks have no van rows at that point, so they agree. Not changed. |
| `lib/demo-assumptions.ts`, `lib/menu-import-review.ts`, Manage import kitchen step (`categoryPrep`) | defaults for categories not yet created | no existing rows; not changed |
| `lib/demo-menu-carry.ts` | fingerprint of category rows (carry-over check) | not a display; not changed |
| `lib/kitchen-capacity.ts` | pure helpers (labels, warning rule) | callers now pass per-van values |
| Seed scripts (`scripts/seed-thai-kitchen-screenshots.sql`, `seed-demo-grid.cjs`, `demo-*.cjs` …) | write test or demo data | not run; not changed |

**1-vs-999, left alone as asked.** `/api/slots` and `/api/dashboard` turn a 0 or null batch into **1**, while `buildCatConfigs` (order acceptance) turns it into **999**. It is pre-existing and documented in `lib/van-category-settings.ts`; it is not touched here.

---

## 3 · Data sync

- **Test trucks:** migration [supabase/migrations/20261103_capacity_one_source_1.sql](../supabase/migrations/20261103_capacity_one_source_1.sql), committed as `b5a748b8`.
  - Run once with `scripts/db-migrate.cjs --approved-by-dominic`, in one transaction.
  - Backup first: [docs/capacity-one-source-1/backup.json](capacity-one-source-1/backup.json).
  - Runner output: `menu_categories rows synced to the first van: 2` · `DONE, nothing left differing on test-truck / test-truck-us` · applied with no error. It also printed the usual unrelated `REVALIDATE_SECRET` warning.
  - **Result:** Pizza on Pizza Kitchen and on Pizza Kitchen US is now **5 min / 4 / counts** in menu_categories and on the van. Desserts and Drinks were already equal.
- **Live trucks:** nothing changed. **No live truck has a mismatch**, because no live truck has any per-van rows. There is nothing for you to decide.

---

## 4 · Tests

### §A, swept: [scripts/capacity-one-source-1.cjs](../scripts/capacity-one-source-1.cjs), **31 passed, 0 failed**

It compiles the real writer and drives it against an in-memory stand-in for the four tables, seeded with Pizza Kitchen's pre-sync rows plus two extra vans (one following Van 1, one independent).

- **A0, the bug as it stood:**
  - the stores disagree;
  - the old warning named a 15-minute prep;
  - a no-van event and a Van 1 event got different catConfigs.
- **A1, Items edit:** prep 10m via `upsert_van_category` for Van 1. Kitchen capacity shows Van 1 at 10m / 4, the following van at 10m / 4, menu_categories at 10m / 4 and the Items card at 10m / 4. The independent van keeps 15m / 8 on a row of its own. Drinks untouched.
- **A2, Kitchen capacity edit:** batch 6. The Items chips read 5m / 6, and so does menu_categories.
- **A3, a non-first van's edit:** stays on that van, with no mirror and no fan-out. The Items card flags the category.
- **A4, other paths:**
  - `upsert_category` with prep goes through the first van and mirrors;
  - a no-van truck writes menu_categories directly;
  - another truck's ids are refused;
  - prep 0 and counts false are settable;
  - a name-only save carries no capacity fields.
- **A5, the Settings warning:** none at 5m every 5. After Items sets 15m: "Pizza takes 15 minutes". Back to 5m from Kitchen capacity: gone.
- **A6, the slot inputs:** catConfigs for a no-van event and a Van 1 event are byte-identical after an edit.
- **A7, removing the first van:** the next van becomes first, and menu_categories follows it.
- **A7b, a truck answering "No":** Van 1's edit moves no other van, and menu_categories follows Van 1.
- **A8, broken variants (each fails as it must):**
  - no "keep the other vans" step: the independent van moves;
  - no mirror: the no-van event drifts;
  - Items reading the raw row: 15m / 8 shown.

### §B, live on a test truck through the running app: [scripts/capacity-one-source-1-live.cjs](../scripts/capacity-one-source-1-live.cjs), **15 passed, 0 failed**

**Why not Pizza Kitchen.** Manage refuses without a signed-in owner, except for `demo-…` trucks, and I have no owner session for Pizza Kitchen. So the live write test ran on **Demo Kitchen** (`demo-mk65q66spjck0g9mxt50btfxtr`): one van, no orders. It went through `localhost:3000` (`next dev`) against the shared database.

- **B1:** two events tomorrow, 12:00–14:00. **One on the van, one with no van**, asserted from the manage GET.
  - On a one-van truck, `upsert_event` gives a new event that van, so the no-van event is made by editing it with `van_id: null`.
  - **My first run missed this** and compared van against van. That run is discarded, and the check now proves which event is which.
- **B2, Items path:** `upsert_van_category` for the first van, Mains prep 10m. Saved and mirrored. Kitchen capacity (`get_vans`) shows 10m / 4, and so does the Items card (manage GET). The Settings warning at every 5 says "Mains takes 10 minutes". **The slot grid for the van event and the no-van event is identical: 31 slots each, same catConfigs, both 10m.**
- **B3, Kitchen capacity path:** batch 6. The Items card shows 10m / 6, and the slot grids are still identical, both with batch 6.
- **B4:** `upsert_category` with prep 5m lands on the van (Kitchen capacity 5m / 6), and the warning goes.
- **B5:** Mains is put back to 5m / 4 and the test events are deleted.
  - "Deleted" means the app's own soft delete (status cancelled).
  - Demo Kitchen now holds **8 cancelled "cap1 test" events** from the four runs, and one van row for Mains at 5m / 4, equal to its category.

### §C, screens: [scripts/capacity-one-source-1-screens.cjs](../scripts/capacity-one-source-1-screens.cjs), **21 passed, 0 failed**

The real `MenuTab` and `KitchenCapacitySection` are mounted, as earlier workstreams did, over one in-memory store holding **Pizza Kitchen's rows after the sync**. Item names are Pizza Kitchen's; prices are a fixed £10 fixture.

- Items: Pizza chips "5m prep" / "4 at a time", fields 5m / 4 items. Kitchen capacity: Pizza 4 items / 5m. Checked at 390 px and 1280 px.
- Items › batch 6 sends exactly one write, `upsert_van_category` for Van1 with `batch_size: 6` and no prep. Kitchen capacity then shows 6.
- Kitchen capacity › prep 10m: the Items chips then show "10m prep" / "6 at a time".
- Two vans that differ: the one line in en-GB and fr-FR, and the chips are Van 1's.

**Screenshots** in [docs/capacity-one-source-1/](capacity-one-source-1/):

| File | Shows |
|---|---|
| `01-items-pizza-kitchen-390.png`, `-1280.png` | Items: Pizza 5m prep · 4 at a time |
| `02-kitchen-capacity-pizza-kitchen-390.png`, `-1280.png` | Kitchen capacity: Pizza 4 items · 5m |
| `03-after-items-edit-kitchen-capacity-390.png` | after Items › batch 6 |
| `04-after-capacity-edit-items-390.png` | after Kitchen capacity › prep 10m |
| `05-two-vans-differ-items-en-GB-390.png`, `-fr-FR-390.png` | the one line |

### Harnesses re-pinned (precise, with the reason in each file)
- **`scripts/van-category-settings.cjs`** (74 passed):
  - §4's writer checks now read `lib/category-capacity-write.ts`, where the body moved, plus the handler's delegation;
  - the "no other select" allowlist includes the new file;
  - V4 / V5 retargeted;
  - new §4b checks for the mirror, `upsert_category`, the dashboard writers and Items' write path;
  - new variant V5b (no mirror) fails as required.
- **`scripts/collection-times-hint.cjs`:** Manage's warning line now passes per-van categories, so the capture allows parentheses and the expected expression is `categories.map(c => ({ ...c, ...effectiveVanCat(van, c) }))`. The dashboard's line is unchanged.
- Also re-pinned: `scripts/_lp1d-named.cjs`, `scripts/_lp1d2-named.cjs`, `scripts/schedule-graphics-places.cjs`, `scripts/slot-interval-settings.cjs` and `scripts/_moved-paths.cjs`, as described under the full sweep below.
- **`scripts/harnesses.json`:** `capacity-one-source-1.cjs` is swept. `-live` is listed under `server` and `-screens` under `needs_a_browser`.

### Full sweep (`node scripts/run-harnesses.cjs`, 220 files)
**215 pass, 5 fail. None of the five is this work.** They are the same five the allergen-kitchen-1 sweep reported:
- **paperwork-1, legal-languages-1, world-countries-3 and tidy-1** need `content/legal/ru-KZ/*.md`, which is missing (another session's unfinished ru-KZ legal work).
- **contact-1** pins the `planTable` message files to 3d6228b7. They were changed by pricing-copy-4.

**Eight other harnesses failed the first clean sweep because they pin files this work changed.** Each is now re-pinned to a precise, named change:
- **language-phase-1d / 1d2** (488/488, 692/692): new named changes in `scripts/_named-capacity-one-source-1.cjs`.
  - `capacity-one-source-1-manage-get` is STRUCTURAL: with `capacityView` taken out, the GET answer is byte-identical, and the key sits right after `categories`. The refusal views are unchanged and not claimed.
  - `capacity-one-source-1-menu-props` is PRECISE: MenuTab's new `capacityView` and `onCategoriesPatch`, and KitchenCapacitySection's `onFirstVanCategoryChange`.
  - Both harnesses regenerate their `scripts/fixtures/language-phase-1d*-us-changed.txt` lists to name the new change.
- **schedule-graphics-places** (270/270):
  - the costs-accounts-1 claims on MenuTab's signature and mount are re-pointed to the lines that now also carry `capacityView` and `onCategoriesPatch`;
  - the three `saveCat` lines from 719ac91 are named, each with its new form;
  - the places import's 10,000-character window is kept by putting the new import **below** it in `app/api/manage/route.ts`, so that check needed no change.
- **slot-interval-settings:** the one hint line now passes the van's own values (`effectiveVanCat`).
- **loyalty-1, cwv-2, costs-accounts-1:** these pin `app/api/dashboard/action/route.ts` byte for byte, as an order-path file.
  - My only edits there are the import and the two category handlers.
  - `scripts/_moved-paths.cjs changedSince` now puts exactly those three edits back (`undoCode`; null unless each is there exactly once), and every other byte is still compared.
  - Result: 81/81, 44/44 and 78/78.
- **event-types-render** failed once in the first clean sweep (the known intermittent font measurement) and passed alone and in the final sweep.

The two by-hand scripts were rerun after the last code change: screens 21/21 and live 15/15.

---

## 5 · Prompt check
- **Garbled spans:** none.
- **Contradictions:** none that needed a stop.
  - The French line in the brief ("Véhicule…") and the instruction to reuse the existing term pointed different ways. The brief itself said to check and reuse, so I used the existing "Camion" (§2).
  - "Prove on a test truck" vs Manage needing an owner session: the live proof used a demo test truck; the screenshots use Pizza Kitchen's rows (§4).
- **Rules followed:**
  - no .env read;
  - no deploy;
  - no landing-page or customer-facing change (the customer menu and slots routes are untouched);
  - Gusto and Le Roi not tested or changed;
  - the one write to the database is the committed migration, run with the runner.

**One slip, owned.** I ran `git stash` / `git stash pop` for a few seconds, to compare lint against HEAD, while the first full sweep was running. For those seconds the tracked files were back at HEAD.
- Everything was restored, and `git stash list` is empty.
- I stopped that sweep and ran it again cleanly. The numbers in §4 come from the clean sweep and the final one.

## 6 · SQL (all statements this workstream)

**Write.** The migration, run once:
```sql
-- see supabase/migrations/20261103_capacity_one_source_1.sql (committed b5a748b8), full text shown in chat
```

**Read-only, via the Supabase MCP:**
```sql
with first_van as (
  select distinct on (truck_id) truck_id, id as van_id, name as van_name
  from truck_vans where active is not false
  order by truck_id, created_at asc nulls last, id
), live as (
  select truck_id, count(*) n from orders
  where created_at > now() - interval '30 days' and coalesce(source,'') not in ('test','demo')
  group by truck_id
)
select t.id as slug, t.name as truck, coalesce(l.n,0) as orders_30d, fv.van_name,
       (select count(*) from truck_vans v where v.truck_id=t.id and v.active is not false) as vans,
       c.name as category, c.prep_secs mc_prep, c.batch_size mc_batch, c.counts_toward_capacity mc_counts,
       s.prep_secs v_prep, s.batch_size v_batch, s.counts_toward_capacity v_counts
from menu_categories c
join trucks t on t.id = c.truck_id
join first_van fv on fv.truck_id = c.truck_id
join van_category_settings s on s.van_id = fv.van_id and s.category_id = c.id
left join live l on l.truck_id = t.id
where c.is_active
  and (c.prep_secs is distinct from s.prep_secs or c.batch_size is distinct from s.batch_size
       or coalesce(c.counts_toward_capacity,false) is distinct from coalesce(s.counts_toward_capacity,false))
order by orders_30d desc, t.name, c.sort_order;
select column_name from information_schema.columns where table_schema='public' and table_name='trucks' and (column_name ilike '%test%' or column_name ilike '%demo%' or column_name ilike '%live%' or column_name ilike '%status%' or column_name ilike '%active%' or column_name ilike '%internal%');
select o.truck_id, o.source, o.status, o.payment_status, count(*), min(o.created_at), max(o.created_at), string_agg(distinct o.customer_name, ', ') names
from orders o where o.truck_id in ('test-truck','test-truck-us') and o.created_at > now() - interval '30 days'
group by 1,2,3,4 order by 1;
select t.id, t.name,
 (select count(*) from truck_vans v where v.truck_id=t.id and v.active is not false) vans,
 (select count(*) from van_category_settings s where s.truck_id=t.id) vcs_rows,
 (select count(*) from orders o where o.truck_id=t.id and o.created_at > now()-interval '30 days') orders_30d
from trucks t
where exists (select 1 from van_category_settings s where s.truck_id=t.id)
order by orders_30d desc;
select 'cat' k, c.id::text, c.name, c.prep_secs, c.batch_size, c.counts_toward_capacity, c.sort_order::text extra
  from menu_categories c where c.truck_id='test-truck' and c.is_active
union all
select 'vcs', s.category_id::text, (select name from menu_categories where id=s.category_id), s.prep_secs, s.batch_size, s.counts_toward_capacity, s.van_id::text
  from van_category_settings s where s.truck_id='test-truck'
union all
select 'van', v.id::text, v.name, v.kitchen_capacity, v.capacity_window_mins, v.active, v.created_at::text
  from truck_vans v where v.truck_id='test-truck'
order by 1, 3;
select id, event_date, start_time, end_time, status, van_id, collection_interval_mins
from truck_events where truck_id='test-truck' and event_date >= current_date order by event_date, start_time limit 20;   -- failed: no such column; rerun without it ↓
select id, event_date, start_time, end_time, status, van_id from truck_events where truck_id='test-truck' and event_date >= current_date order by event_date, start_time limit 20;
select json_build_object('taken_at', now(), 'menu_categories', (select json_agg(json_build_object('id',c.id,'truck_id',c.truck_id,'name',c.name,'prep_secs',c.prep_secs,'batch_size',c.batch_size,'counts_toward_capacity',c.counts_toward_capacity) order by c.truck_id, c.sort_order) from menu_categories c where c.truck_id in ('test-truck','test-truck-us') and c.is_active),
 'van_category_settings', (select json_agg(to_jsonb(s) order by s.truck_id, s.van_id) from van_category_settings s where s.truck_id in ('test-truck','test-truck-us')),
 'vans', (select json_agg(json_build_object('id',v.id,'truck_id',v.truck_id,'name',v.name,'active',v.active,'created_at',v.created_at,'kitchen_capacity',v.kitchen_capacity,'capacity_window_mins',v.capacity_window_mins) order by v.truck_id, v.created_at) from truck_vans v where v.truck_id in ('test-truck','test-truck-us'))) as backup;
select c.truck_id, c.name, c.prep_secs mc_prep, c.batch_size mc_batch, c.counts_toward_capacity mc_counts, s.van_id, s.prep_secs v_prep, s.batch_size v_batch, s.counts_toward_capacity v_counts
from menu_categories c left join van_category_settings s on s.category_id = c.id
where c.truck_id in ('test-truck','test-truck-us') and c.is_active order by 1,2,6;
select t.id, t.name, t.created_at,
 (select count(*) from truck_vans v where v.truck_id=t.id and v.active is not false) vans,
 (select count(*) from menu_categories c where c.truck_id=t.id and c.is_active and c.prep_secs>0) cooking_cats,
 (select count(*) from truck_events e where e.truck_id=t.id and e.event_date>=current_date) upcoming,
 (select count(*) from truck_events e where e.truck_id=t.id and e.event_date>=current_date and e.van_id is null) upcoming_novan,
 (select count(*) from orders o where o.truck_id=t.id) orders
from trucks t where t.id like 'demo-%' order by t.created_at desc limit 15;
select c.name cat, i.name, i.price from menu_items_db i join menu_categories c on c.id=i.category_id where i.truck_id='test-truck' and i.is_active order by c.sort_order, i.sort_order limit 12;
select t.dashboard_token, t.timezone, (select json_agg(json_build_object('id',v.id,'name',v.name,'kitchen_capacity',v.kitchen_capacity,'capacity_window_mins',v.capacity_window_mins,'collection_interval_mins',v.collection_interval_mins)) from truck_vans v where v.truck_id=t.id) vans,
(select json_agg(json_build_object('id',c.id,'name',c.name,'prep_secs',c.prep_secs,'batch_size',c.batch_size,'counts',c.counts_toward_capacity)) from menu_categories c where c.truck_id=t.id and c.is_active) cats,
(select count(*) from van_category_settings s where s.truck_id=t.id) vcs
from trucks t where t.id='demo-mk65q66spjck0g9mxt50btfxtr';
select 'event' k, id::text, venue_name, status, van_id::text from truck_events where truck_id='demo-mk65q66spjck0g9mxt50btfxtr'
union all select 'vcs', category_id::text, prep_secs||'/'||batch_size, counts_toward_capacity::text, van_id::text from van_category_settings where truck_id='demo-mk65q66spjck0g9mxt50btfxtr'
union all select 'cat', id::text, name, prep_secs||'/'||batch_size, counts_toward_capacity::text from menu_categories where truck_id='demo-mk65q66spjck0g9mxt50btfxtr' and name='Mains';
select venue_name, status, van_id is null as no_van, count(*) from truck_events where truck_id='demo-mk65q66spjck0g9mxt50btfxtr' group by 1,2,3 order by 1;
select v.name, v.collection_interval_mins, v.operator_collection_interval_mins, v.active from truck_vans v where v.truck_id='test-truck' order by v.created_at;
```
The Demo Kitchen writes in §B went through the app's own routes (`/api/manage` on localhost), not SQL.

## Undo (only if Dominic asks)

⛔ DO NOT RUN — reference only.

- **Data:** set Pizza back to 900 / 8 / true in menu_categories on `test-truck` (category `0662c2a3…`) and `test-truck-us` (category `96b6f6b4…`), from [backup.json](capacity-one-source-1/backup.json). It would be written as a new committed migration, only on request.
- **Code:** nothing is committed except the migration. Discarding the working-tree changes to the files listed in §2 and §4 reverts it.
