# Copying a menu between trucks — READ AND PLAN ONLY

**Nothing was created, inserted, updated or deleted. No menu was copied.** No SQL was written, no route
invoked, no database queried. The only file written is this report.

🔴 **`test-truck-3-2` ("Apple Tester") WAS NOT READ, QUERIED OR WRITTEN by this task**, and every step
proposed below that involves it is a **READ**. The final section lists them.

**Prompt integrity:** no span arrived garbled and no instruction contradicted another.

## Which of the three I did — plainly

**None of them.** No parse, no typecheck, no execution. File reads and greps only.

🔴 **AND IT MAKES ITEM 5 UNANSWERABLE IN ONE HALF.** I cannot query the database, so **what
`test-truck-2` currently holds is CANNOT DETERMINE.** §5 answers the half that *is* source-answerable —
exactly what happens if it is not empty — and names the read-only way to check.

⚠️ **The same limit applies to §6.** None of the menu tables has a `CREATE TABLE` in
`supabase/migrations/` — they predate the directory — so the constraint list is *what the code
demonstrably depends on*, not the authoritative schema.

---

## 1. The tables, the foreign keys, and the dependency order

**Seven tables.** Established by grepping every `from('…')` in `app/` and `lib/`, then reading each
writer.

| # | Table | Owning key | Depends on |
|---|---|---|---|
| 1 | `menu_categories` | **`truck_id`** | trucks |
| 2 | `menu_subcategories` | **`truck_id`** *and* `category_id` | ① |
| 3 | `modifier_groups` | **`truck_id`** | trucks |
| 4 | `modifier_options` | 🔴 **NO `truck_id`** — `group_id` only | ③ |
| 5 | `menu_items_db` | **`truck_id`**, `category_id`, `subcategory_id` | ①② |
| 6 | `item_modifier_groups` | 🔴 **NO `truck_id`** — `menu_item_id` + `group_id` | ③④⑤ |
| 7 | `category_modifier_groups` | 🔴 **NO `truck_id`** — `category_id` + `group_id` | ①③ |

**The two tables with no `truck_id` are the ones a copy can get wrong**, and the code says so —
`app/api/manage/route.ts:494-495`:

```ts
      // TRUCK-OWNERSHIP GATE (mirrors set_item_group_excluded_options :525): modifier_options has no
      // truck_id — ownership is via group_id → modifier_groups.truck_id. Fetch the EXISTING option's
```

and the route enforces it before every option insert, `:509-511`:

```ts
      // Verify the SUPPLIED group_id belongs to this truck before inserting (same gate as above).
      const { data: ownGrp } = await supabase.from('modifier_groups').select('id').eq('id', group_id).eq('truck_id', truck.id).maybeSingle()
      if (!ownGrp) return NextResponse.json({ error: 'Group not found for this truck' }, { status: 403 })
```

⚠️ **`category_modifier_groups` IS RETIRED ON THE CUSTOMER PATH** —
`app/api/menu/[truckId]/route.ts:119`: *"category_modifier_groups is RETIRED here —
item_modifier_groups(menu_item_id, group_id)"*, and `:398`: *"Each dish carries its OWN groups;
category_modifier_groups no longer participates."* **It is still read by Manage (`:93`) and still
written (`:536`), so a faithful copy should include it — but nothing a customer sees depends on it.**

### 🔴 THE FULL DEPENDENCY ORDER

```
1. menu_categories            (needs truck_id only)
2. menu_subcategories         (needs the NEW category_id)
3. modifier_groups            (needs truck_id only — independent of 1/2)
4. modifier_options           (needs the NEW group_id)
5. menu_items_db              (needs the NEW category_id + subcategory_id)
6. item_modifier_groups       (needs the NEW menu_item_id + group_id + option ids)
7. category_modifier_groups   (needs the NEW category_id + group_id)
```

**1–2 and 3–4 are independent chains; 5 joins the first, 6 joins all of them, 7 joins both.**

---

## 2. Per table: truck-scoped / regenerate / remap — and what a reused id would do

🔴 **THE ANSWER SPLITS CLEANLY, AND BOTH HALVES ARE BAD IN DIFFERENT WAYS:**

- **Tables with a `truck_id`** (①②③⑤): reusing a source **primary key** → **collision**, because the id
  is already taken by the source row.
- **Tables with NO `truck_id`** (④⑥⑦): reusing a source **foreign key** → 🔴 **NO ERROR AT ALL. The new
  truck's menu silently links back to Apple Tester's rows** — a write to `test-truck-2` that makes it
  point at `test-truck-3-2`'s data. **This is the failure mode to design against.**

| Table | Truck-scoped columns | Ids to REGENERATE | References to REMAP | Reusing a source id would… |
|---|---|---|---|---|
| **`menu_categories`** | `truck_id` | `id` | — | **collide** on PK |
| **`menu_subcategories`** | `truck_id` | `id` | `category_id` | collide on PK; **a stale `category_id` points at the source's category** |
| **`modifier_groups`** | `truck_id` | `id` | — | **collide** on PK |
| **`modifier_options`** | 🔴 none | `id` | **`group_id`** | collide on PK; 🔴 **a stale `group_id` attaches the option to Apple Tester's group — silently** |
| **`menu_items_db`** | `truck_id` | `id` | `category_id`, `subcategory_id` | collide on PK; **stale refs point at the source's categories** |
| **`item_modifier_groups`** | 🔴 none | — (composite key) | **`menu_item_id`**, **`group_id`**, and 🔴 **every uuid inside `excluded_option_ids`** | 🔴 **NO collision, NO error — the link row silently joins the new truck's item to the source truck's group** |
| **`category_modifier_groups`** | 🔴 none | — (composite key) | **`category_id`**, **`group_id`** | 🔴 **same silent cross-truck link** |

⚠️ **`excluded_option_ids` IS AN ARRAY OF OPTION UUIDs INSIDE A ROW, NOT AN FK** —
`app/api/manage/route.ts:597`:

```ts
    const { error } = await supabase.from('item_modifier_groups').upsert({ menu_item_id, group_id, excluded_option_ids: cleaned }, { onConflict: 'menu_item_id,group_id' })
```

**A copy that remaps FKs but forgets this array leaves per-item option exclusions pointing at the source
truck's option ids.** No constraint catches it; `:594-596` only validates the ids against the *supplied*
group at write time.

**Columns that must NOT be carried across at all:** anything trading-state rather than menu-shape —
`stock_count` (live per-service stock), `image_path` (a storage path prefixed with the **source** truck's
id, per `get_upload_url`), and `is_available` if the source has items switched off.

---

## 3. Does any existing code copy a menu between trucks? **NO.**

**INFERRED FROM ABSENCE, and here is the search:**
`grep -rniE "clone|duplicate|copy_menu|copyMenu|importMenu|exportMenu|template"` over `app/api/`,
`lib/`, `components/`, `--include=*.ts --include=*.tsx`, filtered to hits mentioning menu/item/category.
**Every surviving hit is either the WhatsApp `TemplateCategory` type or the demo template path below.**
There is **no admin route, no manage action, and no library function that reads one truck's menu and
writes it to another.**

### `provisionDemo`'s menu seeding — where the content comes from, and whether it can be pointed at a truck

**It seeds from ONE of two sources, and neither is another truck.**

`lib/provision-demo.ts:62-66`:

```ts
  /** The uploaded menu. Omit BOTH to build a template demo directly (the §11 fallback path). */
  …
  /** Fixed template menu, used when extraction fails or when no upload is supplied. Pizza first (§11). */
  template?: { name: string; categories: string[]; items: { name: string; price: number; category: string }[] } | null
```

1. **AI extraction of an uploaded photo or text** (`extractMenu`), or
2. **a hardcoded template** — `lib/demo-templates.ts:19-28`:

```ts
export interface DemoTemplate {
  /** Stable key used by the API and the UI. */
  id: 'pizza' | 'burgers' | 'curries'
  label: string
  name: string
  categories: string[]
  items: { name: string; price: number; category: string }[]
}
```

with the literal content beginning at `:31`:

```ts
export const DEMO_TEMPLATES: DemoTemplate[] = [
  {
    id: 'pizza',
    label: '🍕 Pizza van',
    name: 'Pizza',
    categories: ['Pizza', 'Sides', 'Drinks'],
    items: [
      { name: 'Margherita',            price: 9.00,  category: 'Pizza' },
```

🔴 **IT CANNOT BE POINTED AT AN ARBITRARY SOURCE TRUCK.** The parameter type carries **name, price and
category strings only** — no truck id, no row ids, no modifiers. The only caller supplying it is
`app/api/demo/route.ts:118`, from `DEMO_TEMPLATES`. There are exactly three templates, all literals in a
TypeScript module.

⚠️ **And it would be the wrong tool anyway:** `provisionDemo` **creates its own `demo-` truck**; the only
way to aim it at an existing one is `existingTruckId` (`app/api/admin/provision-demo/route.ts:58`), which
**re-provisions** — deleting and rebuilding events and orders (`lib/provision-demo-event.ts:112-122`).
**Not a copy, and destructive on the target.**

---

## 4. Any menu import/export in the operator UI? **NO — no CSV, no JSON, no duplicate-from-truck.**

The 48 actions on `app/api/manage/route.ts` are all single-entity upserts and deletes:
`upsert_category`, `upsert_subcategory`, `upsert_item`, `upsert_modifier_group`,
`upsert_modifier_option`, `assign_modifier_to_category`, `set_item_modifier_group`,
`set_item_modifier_groups_bulk`, `set_item_group_excluded_options`, `set_item_preorder_bulk`,
`bulk_delete_items`, `update_category_order`, `update_subcategory_order`, plus deletes.

🔴 **The three "bulk" actions are bulk-APPLY across existing items, not bulk-import.**
`set_item_modifier_groups_bulk` (`:575`) attaches one group to many items;
`set_item_preorder_bulk` (`:605`) *"Writes only those 4 columns."* **Neither creates items.**

**The only bulk creation path that exists is `commitMenu`** (`lib/menu-commit.ts`), and its input is an
**extraction result**, not a truck. It is reachable from Manage's menu-import (photo/text → AI), which is
a *different* front door to the same shape as the demo path.

⚠️ **So: a faithful 30-item, 5-category copy through the UI is 35+ individual form submissions**, plus
modifier groups, options and links.

---

## 5. What `test-truck-2` currently has — and what happens if it is not empty

🔴 **CANNOT DETERMINE. I did not query the database, and no source file records another truck's row
counts.** Anything I said about its contents would be invention.

**How to establish it read-only, without SQL:** open `/manage/<test-truck-2-dashboard-token>` and read
the Menu tab. `app/api/manage/route.ts:85-95` is the GET that populates it, and it is a pure read:

```ts
    supabase.from('menu_categories').select('*').eq('truck_id', truck.id).eq('is_active', true).order('sort_order'),
    supabase.from('menu_items_db').select('*').eq('truck_id', truck.id).eq('is_active', true).order('sort_order'),
    supabase.from('menu_subcategories').select('id, category_id, name, sort_order').eq('truck_id', truck.id).eq('is_active', true).order('sort_order'),
    supabase.from('modifier_groups').select('*').eq('truck_id', truck.id),
    supabase.from('modifier_options').select('*').in('group_id', …),
    supabase.from('category_modifier_groups').select('*'),
```

⚠️ **THAT READ IS `is_active`-FILTERED FOR FOUR OF THE SIX.** *"Empty in the UI" does not mean "empty in
the table"* — **soft-deleted rows are invisible there and are exactly what bites next.**

### What happens if it is NOT empty

**It depends entirely on which route does the writing, and the two behave differently:**

**(a) Through `commitMenu`** (the AI-import path) — it **reuses and reactivates rather than inserting**,
`lib/menu-commit.ts:134-142`:

```ts
    if (existing && existing.is_active) {
      // (a') ACTIVE row matches by slug under a different name-key → reuse it (avoid a slug-dup INSERT).
      categoryIdMap[catName] = existing.id
      continue
    }

    if (existing && !existing.is_active) {
      // (b) SOFT-DELETED same-key row → REACTIVATE + reuse its id; do NOT insert a new row (that's the
      // collision). Touches ONLY the category row — its old inactive items are NOT resurrected here.
```

🔴 **So a non-empty target does not error — it MERGES.** A pre-existing "Pizza" category is silently
reused, and its `prep_secs`/`batch_size` are whatever they already were. **The result would not be an
identical menu, and nothing would say so.**

**(b) Through `upsert_item` / `upsert_category`** (the manual path) — a second category with the same
name **inserts a duplicate**; `upsert_category` has no name check at all (`:266-271`). Only
`upsert_subcategory` dedupes, and it says so, `:299-301`:

```ts
    // Dedupe IN-APP (no DB unique): case-insensitive name match within this category+truck.
    // ACTIVE same-name → return it (no dup). SOFT-DELETED same-name → reactivate-and-reuse
```

**Either way, "a future fake-order script works unchanged against either truck" requires the item NAMES
to match exactly. A merge or a duplicate breaks that quietly.**

---

## 6. Constraints, ordering columns and triggers a copy could violate

⚠️ **No `CREATE TABLE` exists for any of the seven tables in `supabase/migrations/`.** What follows is
what the code depends on.

| Constraint / column | Evidence | Risk |
|---|---|---|
| **`item_modifier_groups` unique `(menu_item_id, group_id)`** | 🔴 **DB-ENFORCED — three `onConflict: 'menu_item_id,group_id'` upserts** at `manage:559`, `:575`, `:597` | a duplicate link → 23505 unless upserted |
| `menu_categories` `(truck_id, slug)` | ⚠️ **INFERRED** — `commitMenu:141-142` calls a second insert *"the collision"* and reactivates instead. **CANNOT DETERMINE whether DB-enforced or convention** | duplicate slug → 23505 **or** a silent duplicate |
| `menu_subcategories` name uniqueness | 🔴 **EXPLICITLY NOT a DB constraint** — `manage:299`: *"Dedupe IN-APP (no DB unique)"* | duplicates insert cleanly; **no error to catch** |
| `menu_categories.sort_order` | `manage:267-268` — `(max ?? 0) + 1` per truck | ties are legal; **only display order suffers** |
| `menu_items_db.sort_order` | `manage:409-410` — `(max ?? 0) + 1` **per `category_id`** | 🔴 **scoped per category, not per truck — a copy must restart numbering per category or the order drifts** |
| `menu_subcategories.sort_order` | `manage:319-322` — per `(truck_id, category_id)`, `is_active` only | as above |
| `modifier_options.sort_order` | `manage:514` — defaults to **`0`**, no max-lookup | **a straight copy must carry the source values or every option collapses to 0** |
| `menu_items_db.category_id` FK | `commitMenu:254-255` skips an item with no resolved category | orphan item silently dropped |
| `modifier_options.group_id` FK | `manage:509-511` gate | 🔴 **a stale id passes the FK and links cross-truck** |
| `category_modifier_groups` composite key | `manage:536` bare `.upsert({category_id, group_id})` | **INFERRED** composite PK/unique |
| **Triggers** | ✅ **grep for `create trigger` across `supabase/migrations/*.sql` returns exactly ONE**, `20260703_orders_updated_at_trigger.sql:32` on **`orders`** | **no menu table carries a trigger in the repo.** ⚠️ CANNOT DETERMINE for the live DB |

---

## 7. The proposed SEQUENCE — and whether it needs SQL

### 🔴 IT NEEDS SQL. Stating that plainly, because §3 and §4 establish there is no alternative.

There is **no copy route, no import/export, and no bulk-create action.** The two non-SQL options are:

- **Rebuild by hand in Manage** — 5 categories + 30 items + every modifier group, option and link, as
  individual form submissions. **Achievable, slow, and the most likely to drift** from an identical menu,
  which is the whole requirement.
- **Re-run the AI import** against the same source photo, if one exists. ⚠️ **Non-deterministic** —
  `commitMenu` writes `allergens_verified: (item._allergensChecked === true)` and the extraction may not
  reproduce identical names or prices. **Identical names are the requirement; this does not guarantee
  them.**

**So the realistic sequence is: READ through existing routes, WRITE with SQL.**

| Step | Surface | Does what | 🔴 Verify before continuing |
|---|---|---|---|
| **0** | `/manage/<test-truck-2-token>` → Menu | **Establish the target's state** (§5) | 🔴 **UI-empty ≠ table-empty** — the GET filters `is_active`. If anything at all shows, decide merge-vs-clean **before** step 4. |
| **1** | **`GET /api/menu/test-truck-3-2`** | 🔵 **READ Apple Tester's menu.** `app/api/menu/[truckId]/route.ts` selects all six tables (`:68,76,83,106,111,122`) and has **ZERO write calls** — verified by grep | The payload contains 5 categories and 30 items. ⚠️ It is the **customer-shaped** view; confirm it exposes the fields you need or use step 1b. |
| **1b** | **`GET /manage/<test-truck-3-2-token>`** (optional) | 🔵 **READ the operator-shaped menu** — `manage:85-95`, richer (`select('*')`, includes `category_modifier_groups`) | ⚠️ Requires that truck's dashboard_token. **Read-only: a GET, no action body.** |
| **2** | — | **Build the id map offline**: old→new uuid for every category, subcategory, group, option, item | 🔴 **Every id in §2's "remap" column has an entry, including each uuid inside `excluded_option_ids`.** |
| **3** | SQL | `menu_categories` — new ids, `truck_id = 'test-truck-2'`, source `sort_order` | Row count matches the source's 5. |
| **4** | SQL | `menu_subcategories` — new ids, **remapped `category_id`**, `truck_id` set | No `category_id` appears that is not in the step-3 map. |
| **5** | SQL | `modifier_groups` — new ids, `truck_id` set | — |
| **6** | SQL | `modifier_options` — new ids, **remapped `group_id`** | 🔴 **No `group_id` belongs to `test-truck-3-2`.** This table has no `truck_id`, so nothing else will catch it. |
| **7** | SQL | `menu_items_db` — new ids, **remapped `category_id` + `subcategory_id`**, `truck_id` set; `sort_order` restarted per category; **drop `stock_count` and `image_path`** | Count is 30. ⚠️ `image_path` carries the **source** truck's storage prefix. |
| **8** | SQL | `item_modifier_groups` — **remapped `menu_item_id`, `group_id`, and every uuid in `excluded_option_ids`** | 🔴 **The silent-cross-link table. Check every one of the three.** |
| **9** | SQL | `category_modifier_groups` — remapped `category_id` + `group_id` | Optional (retired on the customer path) but needed for a faithful copy. |
| **10** | `/manage/<test-truck-2-token>` | **Verify** — 5 categories, 30 items, modifiers attached | Compare item names and prices against step 1. |
| **11** | `/trucks/test-truck-2/order` | **Verify the customer view renders** | ⚠️ If `allergens_verified` is false and the truck's `allergen_display_mode` is `'per_dish'`, **the per-dish gate HIDES unverified items and the menu renders EMPTY** — the exact trap `lib/provision-truck.ts:192-194` records for demos. |
| **12** | — | **Cross-link audit** | 🔴 The decisive check: **no row now owned by `test-truck-2` references any id belonging to `test-truck-3-2`.** Tables ④⑥⑦ are where it would hide. |

⚠️ **NO SQL IS WRITTEN HERE**, as instructed. Steps 3–9 name what each statement must produce, not the
statement.

⚠️ **A note on the stated goal:** *"a future fake-order script works unchanged against either truck"*
needs the **item names and category names** to match, and the script to key on names or on
`truck_id`-scoped lookups — **never on menu item ids**, which are necessarily different by §2. Worth
settling before the copy, because it decides whether `sort_order` and modifier fidelity matter at all.

---

## 🔴 EVERY STEP THAT READS `test-truck-3-2` — AND NONE WRITES TO IT

**Two steps read it. Neither writes. No other step names it.**

| Step | Operation | Route | Writes? |
|---|---|---|---|
| **1** | `GET /api/menu/test-truck-3-2` | `app/api/menu/[truckId]/route.ts` | ✅ **NO** — grep for `.insert(`/`.update(`/`.upsert(`/`.delete(` in that file returns **0** |
| **1b** | `GET /manage/<its dashboard_token>` (optional) | `app/api/manage/route.ts` GET | ✅ **NO** — the GET branch at `:85-95` is six `select()`s. **Writes on that route require a POST with an `action`; step 1b sends none.** |

**Steps 0 and 3–12 operate on `test-truck-2` only.** Steps 3–9 are inserts whose `truck_id` is
`test-truck-2`; steps 10–12 are reads of `test-truck-2`.

⚠️ **THREE THINGS THAT COULD TURN A READ INTO A WRITE, all avoidable:**

1. 🔴 **`provisionDemo` with `existingTruckId` is NOT a copy tool and is destructive.**
   `lib/provision-demo-event.ts:112-122` deletes the target's existing events **and their orders** before
   rebuilding. **It must never be pointed at either truck here.**
2. 🔴 **The Manage surface is the same route for reads and writes.** Opening
   `/manage/<test-truck-3-2-token>` to read the menu puts an editable UI in front of you. **A stray save
   in that tab is a write to a truck under Apple review.** If step 1's customer-shaped payload is enough,
   **skip 1b entirely.**
3. ⚠️ **The id map in step 2 is the only thing standing between a correct copy and a silent cross-link.**
   A missed remap in tables ④⑥⑦ **does not write to `test-truck-3-2`** — but it makes `test-truck-2`
   depend on its rows, so a later change to Apple Tester's menu would alter the copy. **Step 12 exists
   for that.**

---

## What remains unobserved

1. **I ran nothing** — no parse, no typecheck, no execution. Nothing was created, copied or queried.
2. 🔴 **`test-truck-2`'s current contents are CANNOT DETERMINE** (§5). Step 0 exists to settle it, and
   the `is_active` filter means the UI alone is not sufficient evidence.
3. 🔴 **`test-truck-3-2`'s menu was not read** — the "30 items, 5 categories" figures are yours, carried
   forward unverified.
4. **The live schema was not inspected.** No `CREATE TABLE` exists for any of the seven tables, so §6's
   uniqueness entries are marked INFERRED where the code only implies them. **A trigger outside
   `supabase/migrations/` would be invisible here.**
5. **No SQL was written**, and the sequence names outcomes rather than statements, as instructed.
6. **`GET /api/menu` was read, not called** — its zero-write property is established by grep, not by
   running it.
