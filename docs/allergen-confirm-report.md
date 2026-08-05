# Allergen confirmations lost on import — diagnosis

**Date:** 4 August 2026. **Read-only.** Nothing changed, no SQL run, no migration written.
No garbled spans in the prompt.

---

## THE ANSWER, PLAINLY

**It is "work never written", and the mechanism is settled by the code — not a hypothesis.**

Not lost, not two surfaces disagreeing about a column. The wizard recorded every confirmation correctly
on the items the operator reviewed. Then, at commit, those reviewed items were **discarded and replaced**
by merged "grouped" items constructed with the confirmation flag **hardcoded to `false`**:

```ts
// app/manage/[token]/page.tsx:2340-2358 — makeGroupingRow()
const groupedItem = {
  name: baseName, description: base.description || undefined, price: basePrice,
  category,
  allergens: [...new Set(memberItems.flatMap((it: any) => it.allergens || []))],
  dietary:   [...new Set(memberItems.flatMap((it: any) => it.dietary || []))],
  spiciness: base.spiciness ?? null, _allergensChecked: false,      // 🔴 HERE
  modifierGroups: [ … ],
}
```

`_allergensChecked: false` is a **literal**. It does not read the members' flags, and it is not
recomputed later. The commit then writes exactly what it is given:

```ts
// lib/menu-commit.ts:309 (insert) and :273 (reactivate)
allergens_verified: (item._allergensChecked === true)
```

So every grouped dish commits `allergens_verified = false` no matter how carefully its members were
confirmed. **The five dishes should be exactly the five grouped/variant parents.** A5's query settles it.

### Why the gate was satisfied anyway

The gate and the commit **operate on two different collections**, and neither is aware of the other:

| | Collection | Count |
|---|---|---|
| **Allergen step reviews / the gate counts** | `stagedItems` ← `importResult.items` — the **flat, un-grouped** rows | every row the operator saw |
| **The commit writes** | `buildGroupedItems(importResult.items)` — members **removed**, grouped parents **added** | fewer rows, and the new ones are unconfirmed |

The operator confirmed all of collection A. Collection B was then built from A, dropping the confirmed
members and inserting brand-new objects that had never been reviewed because they did not exist while
the review was open.

---

## A1. WHAT THE WIZARD HOLDS

### (a) The in-memory shape, and what sets it

The flag is `_allergensChecked?: boolean` on each `importResult.items[]` entry
([app/manage/[token]/page.tsx:1789](app/manage/[token]/page.tsx#L1789)). It is client-only and is what
the commit maps to `allergens_verified`.

Three setters, all per-item, all keyed on the item's stable `_uid`
([:2606-2610](app/manage/[token]/page.tsx#L2606-L2610)):

```ts
const patchStagedItem = (uid, patch) =>
  setImportResult(prev => prev ? { ...prev, items: prev.items.map(it => it._uid === uid ? { ...it, ...patch } : it) } : prev)

const stagedConfirm  = async (item, allergens, dietary) => patchStagedItem(item.id, { allergens, dietary, _allergensChecked: true })
const stagedUndo     = async (item, allergens, dietary, verified) => patchStagedItem(item.id, { allergens, dietary, _allergensChecked: verified })
const stagedUnverify = async (item) => patchStagedItem(item.id, { _allergensChecked: false })
```

**Can anything set it for a group of items at once?** Two things write it non-individually, and neither
is a "confirm all":

* **The blanket may-contain opt-in** (`handleCommitMenu`) rewrites every item with
  `_allergensChecked: false` — it *un*-confirms in bulk. Default off, and it would have un-confirmed
  everything, not five things.
* **`makeGroupingRow`** — writes the literal `false` on a *newly constructed* item. **This is the fault.**

There is **no confirm-all affordance anywhere** in the review. Every row is confirmed by hand.

### (b) The gate — quoted

[app/manage/[token]/page.tsx:1066-1067](app/manage/[token]/page.tsx#L1066-L1067):

```ts
const confirmedCount = items.filter(i => i.allergens_verified !== false).length
const allDone = items.length > 0 && confirmedCount === items.length
```

Applied at [:1605](app/manage/[token]/page.tsx#L1605): `disabled={finishing || !allDone}` on the import
path (`importStepper` present).

**It requires EVERY item confirmed — not a count, not a subset, not only the visible rows.** `items`
is the modal's full prop array, not a rendered slice. So the gate is strict and behaved correctly; it
was simply strict about the *wrong collection*.

⚠️ Two notes on the expression itself, neither causal here:
* `!== false` means undefined/null counts as confirmed. Harmless on the import path — `stagedItems` sets
  a strict boolean (`it._allergensChecked === true`) for every row.
* `stagedItems` ([:2600](app/manage/[token]/page.tsx#L2600)) applies **no `_skip` filter**, so a row the
  operator unticked on page 1 still appears in the allergen review and still has to be confirmed to pass
  the gate — while being excluded from the commit. That inflates the review's row count relative to what
  is written. Not the cause of the five, but it is part of why the two counts differ.

### (c) 🔴 List vs Table — same flag, and nothing can be off-screen

**Same flag, same handler.** Both views are the one `reviewTable` block; the file's own comment at
[:1217](app/manage/[token]/page.tsx#L1217) says *"only the wrapper differs. The List ⇄ Table toggle picks
the wrapper."* Every row in either view calls `onConfirmRow`, which is `stagedConfirm`.

**Nothing is paginated, filtered, collapsed or virtualised.** Both render
`groupedItems.map(g => g.rows.map(item => …))` ([:1330](app/manage/[token]/page.tsx#L1330) list,
[:1440](app/manage/[token]/page.tsx#L1440) table) — a full, unconditional render of every row grouped
into category sections. There is no `slice(`, no windowing library, no collapse state, and no filter
input. Grepped.

**So no item can be off-screen-and-unrendered, and there is no confirm-all to miss them if it could be.**
This path is ruled out.

---

## A2. WHAT THE COMMIT WRITES

### (a) The mapping — quoted

`handleCommitMenu` ([:3056](app/manage/[token]/page.tsx#L3056)):

```ts
let itemsToCommit = buildGroupedItems(importResult.items).filter(it => String(it.name || '').trim())
```

→ POST `/api/manage/commit-menu` → `commitMenu()` → per item, in **both** write paths:

```ts
// lib/menu-commit.ts:309  (insert)
allergens_verified: (item._allergensChecked === true),
// lib/menu-commit.ts:273  (reactivate a soft-deleted row)
allergens_verified: (item._allergensChecked === true),
```

⚠️ The comment beside both is **stale**: it says *"The import wizard no longer verifies allergens (the
allergen step was removed) … which the wizard never sets now → every imported item commits
verified=false."* The allergen step has since been re-added, so the comment describes a world that no
longer exists. **The expression is correct; only the comment is wrong.** Worth knowing because it
predicts the exact symptom for the wrong reason.

### (b) 🔴 Written for EVERY item, never omitted

`allergens_verified` is a key on the insert object and on the reactivate update object, on every
iteration. An unconfirmed item is written **explicitly `false`**, never left out and never NULL.

**So this is not the "omitted rather than written false" bug.** Ruled out.

### (c) One statement or batched, and what happens on partial failure

**Per-row, one `insert()` (or `update()`) per item**, inside `for (const item of items)`
([lib/menu-commit.ts:243](lib/menu-commit.ts#L243)). Deliberately not batched — the file's own note says
a per-row insert *"fails alone into `failed[]`; a batched insert would fail wholesale."*

**The failure is recorded server-side and swallowed by the UI.** `commitMenu` returns
`{ ok, inserted, skipped, failed[], submitted, unaccounted }`, and the route's header calls `submitted`
and `unaccounted` *"two ADDITIVE reconciliation fields the manage UI ignores."* Confirmed: the wizard
reads only `data.ok` and `data.skipped` ([:3072](app/manage/[token]/page.tsx#L3072),
[:3080](app/manage/[token]/page.tsx#L3080)). `failed[]` and `unaccounted` are never read or shown.

⚠️ Also from the module header: **an item whose category fails to resolve is dropped by a bare
`continue` and does NOT appear in `failed[]`** — invisible except as `unaccounted`. That is a *different*
silent-loss route which would produce *missing* dishes, not unconfirmed ones. A5's query distinguishes
them: if the five are present but unverified, this is not it.

### (d) modifier_options — no verification state, and the wizard does not confirm them

**`modifier_options` has no `allergens_verified` column.** Stated outright in
`supabase/migrations/20260628_allergen_vocab_14_reconfirm_and_casing.sql:43`: *"modifier_options has NO
allergens_verified column, so the re-confirm flag in (a) does not apply."*

Options carry an in-memory `_allergensChecked` in the wizard's type, but on the grouping path they are
created with **empty allergen and dietary arrays on purpose** — `makeGroupingRow`
([:2334-2338](app/manage/[token]/page.tsx#L2334-L2338)) records that copying the member's allergens onto
each option *"BLED the parent dish's tags onto every protein option (Chicken→Gluten/Molluscs/Vegetarian)"*.
The dish-level **union** of all members' allergens is what carries the safety information, and that union
**is** written correctly onto the grouped item. **So the allergen DATA survives grouping; only the
confirmation FLAG does not.** This matters: the five dishes are not missing their allergens, they are
missing their *verified* mark — which is why they are hidden from customers rather than shown wrongly.

---

## A3. GROUPED AND VARIANT ITEMS — the fault

### (a) Confirming a grouped row confirms nothing, because the grouped row did not exist during the review

The review operates on the **un-grouped** rows. `?import=demo` and `handleProcessMenu` both pass the
extraction through `ungroupAiVariantsForReview(...)`, so page 1 is *"a uniform FLAT list of individual
dishes"* ([:4349](app/manage/[token]/page.tsx#L4349)) and the allergen step sees that same flat list.

The merge happens **only at commit**, in `buildGroupedItems`
([:2999-3012](app/manage/[token]/page.tsx#L2999-L3012)):

```ts
const buildGroupedItems = (items: any[]): any[] => {
  const rows = computeGroupingRows(items)
  const toRemove = new Set<number>()
  const toAdd: any[] = []
  for (const row of rows) {
    const choice = groupingChoice[row.key] ?? 'grouped'      // 🔴 DEFAULTS TO 'grouped'
    if (choice === 'grouped') {
      row.memberIdxs.forEach(i => toRemove.add(i))            // confirmed members DISCARDED
      toAdd.push(row.groupedItem)                             // unconfirmed parent ADDED
    }
  }
  const kept = items.filter((_, i) => !toRemove.has(i))
  return [...kept, ...toAdd]
}
```

The members — carrying `_allergensChecked: true` — are removed. The parent, carrying the hardcoded
`false`, is added. **`'grouped'` is the default**, so this happens unless the operator explicitly chose
"keep separate" on the Extras step.

`groupedItem` is also **recomputed at commit time**, not cached ([:2308](app/manage/[token]/page.tsx#L2308)),
so there is no window in which a later confirmation could have been folded in.

### (b) N shown vs M written — they diverge in both directions

Not one number. Precisely:

* **Shown in the allergen step:** every entry in `importResult.items` — the flat rows, *including*
  `_skip`ped ones (no filter at [:2600](app/manage/[token]/page.tsx#L2600)).
* **Written:** `buildGroupedItems(...)` then `.filter(name non-empty)`, and `commitMenu` skips `_skip`
  and drops any item whose category will not resolve.

So for each grouping row with *k* members, the review shows **k rows** and the commit writes **1**.
`M < N` overall — the brief's "M > N" is not the shape here. The five are not extra rows appearing from
nowhere; they are **five parents replacing their confirmed members**.

### (c) Could a typical extraction produce exactly this shortfall? Yes — and the number is predictable

`groupingRows = computeGroupingRows(importResult.items)` ([:2437](app/manage/[token]/page.tsx#L2437)) and
`hasExtras = groupingRows.length > 0` ([:2553](app/manage/[token]/page.tsx#L2553)) — the Extras step only
appears when grouping rows exist, and Dominic's run passed through it.

**The prediction is exact: the number of dishes reported unconfirmed should equal the number of grouping
rows left on the default `'grouped'` choice.** Five reported ⇒ five grouped parents. On a 37-item menu
across four categories, five variant families (a pizza in three sizes, a curry in two proteins, and so
on) is an entirely ordinary shape — and each family collapses to one unconfirmed dish carrying a
`modifierGroups` array with `_inferredFromVariants: true`.

**A corroborating prediction, testable from the screenshots Dominic already has:** the wizard's own done
screen computes `allergensComplete` from the **staged flat** flags
([:5397](app/manage/[token]/page.tsx#L5397)), not from the DB. With every flat row confirmed it evaluates
**true**, so the done screen would have shown **no** allergen warning — and the Menu tab then showed
five. If that is what he saw, it is the same divergence surfacing twice.

---

## A4. WHAT THE POST-COMMIT SURFACE READS

### (a) The exact query and condition

There is no separate query — it counts the already-loaded `menu_items_db` rows for the truck.
[app/manage/[token]/page.tsx:3918](app/manage/[token]/page.tsx#L3918), inside the Menu tab's Allergens
section:

```ts
const unverifiedCount = localItems.filter(i => (i as any).allergens_verified === false).length
const needsReview = !cardMode && unverifiedCount > 0
```

rendered at [:3954](app/manage/[token]/page.tsx#L3954) as
*"{unverifiedCount} dishes need review — customers can't see allergen info until confirmed"*.

`localItems` is seeded from the page's `items`, loaded by `GET /api/manage?token=…` from
**`menu_items_db`**, filtered to this truck.

### (b) 🔴 Same table, same column — the surfaces do NOT disagree

The commit writes `menu_items_db.allergens_verified`; this reads `menu_items_db.allergens_verified`.
Same column, same table, and the same one the customer-visibility gate keys on
([app/api/menu/[truckId]/route.ts:490](app/api/menu/[truckId]/route.ts#L490)).

**So the "two surfaces disagree" explanation is ruled out.** It is not counting modifier options (they
have no such column), not counting empty allergen arrays (the grouped items have a populated union), and
not a derived state. It is reading, accurately, five rows that really are `false` in the database.

### (c) NULL vs false

`=== false` is **strict**: a NULL or missing `allergens_verified` is **not** counted. Only an explicit
`false` is. Since `commitMenu` always writes a boolean, no imported row can be NULL — so the NULL-vs-false
distinction cannot explain the five either.

*(For completeness: the cross-tab nudge at [:190](app/manage/[token]/page.tsx#L190) and the
hidden-from-customers banner at [:3206](app/manage/[token]/page.tsx#L3206) use the identical strict test,
so all three operator surfaces agree with each other and with the customer gate.)*

---

## A5. THE DECIDING QUERY

Run this for TT3. It is built to make the answer visually obvious: if the unverified rows are the ones
with `variant_options > 0`, the diagnosis above is confirmed; if they are scattered standalone dishes,
it is not.

```sql
select
  c.name                                            as category,
  i.name                                            as item,
  i.allergens_verified,
  array_length(i.allergens, 1)                      as allergen_count,
  count(mo.id)                                      as variant_options,
  string_agg(distinct mg.name, ', ')                as variant_groups,
  case when count(mo.id) > 0 then 'GROUPED (variant parent)' else 'standalone' end as shape
from menu_items_db i
join menu_categories c            on c.id = i.category_id
left join item_modifier_groups img on img.menu_item_id = i.id
left join modifier_groups mg       on mg.id = img.group_id
left join modifier_options mo      on mo.group_id = mg.id
where i.truck_id = 'TT3'
  and i.is_active
  and (i.allergens_verified is distinct from true)
group by c.name, i.name, i.allergens_verified, i.allergens
order by shape desc, c.name, i.name;
```

The control — the whole menu, so the five can be read against the other thirty-odd and the shown-vs-written
counts compared:

```sql
select
  case when count(mo.id) > 0 then 'GROUPED (variant parent)' else 'standalone' end as shape,
  i.allergens_verified,
  count(*) as items
from menu_items_db i
left join item_modifier_groups img on img.menu_item_id = i.id
left join modifier_groups mg       on mg.id = img.group_id
left join modifier_options mo      on mo.group_id = mg.id
where i.truck_id = 'TT3' and i.is_active
group by shape, i.allergens_verified
order by shape desc, i.allergens_verified;
```

And, to rule out the silent category-drop route from A2(c) — total committed vs the 37 submitted:

```sql
select count(*) as active_items,
       count(*) filter (where allergens_verified is true)  as verified_true,
       count(*) filter (where allergens_verified is false) as verified_false,
       count(*) filter (where allergens_verified is null)  as verified_null
from menu_items_db
where truck_id = 'TT3' and is_active;
```

**What each outcome means.** If query 1 returns five rows all marked `GROUPED (variant parent)` — the
diagnosis is confirmed and the five have everything in common. If they are `standalone` with
`variant_options = 0`, the grouping path is not the cause and the next thing to establish is whether
those five rows were *reactivated* rather than inserted (the `:273` path), which would point at a
pre-existing soft-deleted row rather than at grouping. If query 3 shows fewer than 37 active items, some
were dropped by the category-resolution `continue` as well, which is a separate silent loss.

---

## WHAT I DID NOT FIND

Stated so the ruled-out paths are on record rather than left open:

* **Not lost in the UI.** Both review views write the same flag through the same handler; nothing is
  paginated, virtualised, collapsed or filtered; there is no confirm-all that could miss rows.
* **Not omitted from the write.** `allergens_verified` is written explicitly, as a boolean, for every
  item on both the insert and reactivate paths.
* **Not a disagreement between surfaces.** The counter reads the same table and column the commit writes,
  with a strict `=== false` that excludes NULL.
* **Not modifier options.** They have no verification column at all, so they cannot be counted.

The one thing the code cannot tell me is which five rows they actually are. **A5 query 1 is the single
observation that settles it**, and its `shape` column is the whole answer: five `GROUPED (variant parent)`
rows confirms the diagnosis; anything else refutes it.
