# Import review — the allergen fix and three UI corrections

**Date:** 4 August 2026.
**Migrations:** none. **SQL:** none. **`next dev` / `next build`:** not run.
**One file touched:** [app/manage/[token]/page.tsx](app/manage/[token]/page.tsx).

No garbled spans. Nothing in this change is `inSetup`-gated, and that is deliberate — stated per item.

---

## M1. 🔴 THE ALLERGEN CONFIRMATION FIX

### The change — one literal became a derivation

`makeGroupingRow()` ([:2403](app/manage/[token]/page.tsx#L2403)):

```diff
-      spiciness: base.spiciness ?? null, _allergensChecked: false,
+      spiciness: base.spiciness ?? null,
+      _allergensChecked: memberItems.length > 0 && memberItems.every(it => it._allergensChecked === true),
```

The parent is now derived from its members exactly as its `allergens` and `dietary` unions two lines
above already were. Nothing else on the object changed.

### 🔴 What a grouped parent's verified flag will now be, in each case

| Case | Flag | Why |
|---|---|---|
| **Every member confirmed** | **`true`** | `.every(… === true)` holds; a person confirmed each member individually |
| **Some confirmed, some not** | **`false`** | `.every()` is an AND — one unconfirmed member fails the whole thing |
| **No members confirmed** | **`false`** | same |
| **No members at all** | **`false`** | the explicit `memberItems.length > 0` guard runs first |

### (a) The empty-list guard

`memberItems.length > 0 &&` is written before the `.every()`, and it is load-bearing rather than
defensive padding. **`[].every(...)` returns `true` by definition**, so without it a group that somehow
arrived with no members would commit as verified — a confirmation asserted about nothing at all. This is
the one place where JavaScript's vacuous-truth default is exactly backwards from the safe answer, so the
guard is explicit rather than relying on `makeGroupingRow` never being called with an empty set.

### (b) Is `makeGroupingRow` called anywhere other than at commit? **Yes — and one fix covers both**

`makeGroupingRow` has exactly one caller, `computeGroupingRows`
([:2379](app/manage/[token]/page.tsx#L2379), [:2384](app/manage/[token]/page.tsx#L2384)), and that has
**two**:

| Call site | Purpose |
|---|---|
| [:2492](app/manage/[token]/page.tsx#L2492) — `const groupingRows = computeGroupingRows(importResult?.items \|\| [])` | **display** — drives `hasExtras` and the Extras-step matrix |
| inside `buildGroupedItems` ([:3054](app/manage/[token]/page.tsx#L3054)) | **commit** |

So my diagnosis's "recomputed at commit, not cached" was right about caching but incomplete about call
sites: it is also built on every render for display. **That costs nothing here** — there is a single
construction site for `groupedItem`, so the derivation is correct in both by construction. The display
path reads `row.options` / `row.separateItems` / `row.memberIdxs` and never reads `groupedItem
._allergensChecked`, so nothing on screen changes; only what the commit consumes does.

### (c) `commitMenu`'s mapping — untouched

`allergens_verified: (item._allergensChecked === true)` at
[lib/menu-commit.ts:273](lib/menu-commit.ts#L273) and [:309](lib/menu-commit.ts#L309) is unchanged.
`lib/menu-commit.ts` does not appear in the diff. The 24 standalone rows on "village spice" that
committed verified prove that expression correct; the defect was upstream of it.

### (d) The allergen step's gate — untouched

`confirmedCount` / `allDone` ([:1066-1067](app/manage/[token]/page.tsx#L1066-L1067)) and the
`disabled={finishing || !allDone}` on the import path are unchanged. Still every reviewed row, still
strict.

### (e) 🔴 The safety property, in my own words

**My implementation cannot mark a parent verified when any member was unconfirmed.**

The flag is an AND across every member — `memberItems.every(it => it._allergensChecked === true)` — and
each member's flag has exactly one origin: `stagedConfirm`, fired when a person pressed Confirm on that
row in the allergen step. So a `true` on the parent means *every* dish folded into it was individually
confirmed by a human. There is no branch, no fallback and no default that can produce `true` from
anything else:

* one member with `false` → the AND fails;
* one member whose flag is `undefined` (never reviewed) → `undefined === true` is false → the AND fails;
* zero members → the length guard short-circuits before `.every()` is reached.

The comparison is strict `=== true` rather than truthiness for precisely this reason. **The derivation
can only ever narrow, never invent** — it propagates confirmations that already exist and cannot
manufacture one.

### (f) Some members confirmed and not others

**The parent comes out unverified**, and therefore commits `allergens_verified = false`, and therefore
stays hidden from customers and shows in the "needs review" count — which is the correct and safe
outcome. A partially-reviewed dish is not a reviewed dish.

*(In practice the wizard's gate makes this state hard to reach on the import path, since it requires
every row confirmed before "Next" enables. It is reachable via "Skip Allergen setup for now", which is
exactly when the conservative answer matters.)*

### Gusto and RTF

**Before:** every grouped/variant dish they imported committed `allergens_verified = false` regardless of
the work they did in the allergen step — hidden from customers and counted as needing review.
**After:** a grouped dish whose members they all confirmed commits verified, like their standalone
dishes always did.

🔴 **Ungated on purpose, and this is the item where that matters most.** It is a correctness fix on a
food-safety flag, and the failure it removes hits them on every re-import exactly as it hit the signup
run. Gating it to setup would knowingly leave a live truck's confirmations being discarded. It also
cannot over-report: the change can only turn `false` into `true` where a human did the work, never the
reverse, so no dish becomes visible to customers that a person had not confirmed.

⚠️ **No backfill.** Rows already committed `false` stay `false` — including the five on "village spice",
which were corrected by hand. This fixes the write path only.

---

## M2. THE PER-ITEM CATEGORY DROPDOWN — REMOVED

The `<select>` slice I put on every review row is gone
([:4835](app/manage/[token]/page.tsx#L4835), where a comment now records why). On Dominic's 37-item menu
that was 37 dropdowns competing with the names and prices actually being reviewed.

### What a row looks like now

```
[✓]  Item name ______________  ✎          [free?]  £ 8.50
     description (if any)
     "Enter a name…" (manual rows only)
```

Checkbox · name input · edit pencil · description · price. **Exactly what it was before slice I added the
dropdown.** Nothing else on the row moved: the `flex items-center gap-3` row, the checkbox, the name
input, the `incomplete` hint, the description line, the `free?` control and the price input are all
untouched — the removal was a self-contained block between the description and the trailing comment.

### 🔴 The capability was kept, not deleted

Extracted as a named function, [:2802](app/manage/[token]/page.tsx#L2802):

```ts
const reassignImportItem = (fromCategory: string, toCategory: string) =>
  setImportResult(prev => prev ? {
    ...prev,
    items: prev.items.map(it => it.category === fromCategory ? { ...it, category: toCategory } : it),
  } : prev)
```

It has exactly one caller — M4's delete flow, the one moment an operator genuinely has to say where
dishes go.

**Gusto / RTF — before:** a category dropdown on every row of every import review.
**After:** no dropdown on any row. Ungated, because the clutter was theirs too.

---

## M3. THE EDIT AFFORDANCES — NOW VISIBLE

Colour and size only. Neither control's behaviour changed.

| | Before | After |
|---|---|---|
| **Category pencil** ([:4763](app/manage/[token]/page.tsx#L4763)) | `text-slate-300 hover:text-orange-600 text-xs` — a light-grey ✎ at 12px | `text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded px-1.5 py-0.5 text-base leading-none` — brand-orange at 16px with a hover background and a real hit area |
| **Item edit hint** ([:4802](app/manage/[token]/page.tsx#L4802)) | `text-slate-300 text-xs` | `text-orange-600 text-base leading-none` |

**Colour:** `text-orange-600` — an existing Tailwind orange this file already uses throughout (the
checkbox fill, the "+ Add item" and "+ Add category" links, the primary buttons). **No new colour was
invented, and `HATCHGRAB_ORANGE_HEX` was not used**: it is a raw hex for inline email styles, and Tailwind
purges dynamic class strings, so it cannot become a `className` here. The file's own orange is the right
match and keeps the review consistent with the buttons beside it.

**Do they now read as obviously clickable?** The category pencil: yes — orange, 16px, with a hover
background and padding, it is unambiguously a button. The item hint: it is **visible** rather than
clickable, and that is correct — it is a hint attached to an input that is *already* always editable, not
a control of its own (it carries `aria-hidden` and has no handler). Making it look like a button would
promise a click that does nothing. Both now share one visual idea, so the category one reads as the
actionable sibling.

**Gusto / RTF — before:** near-invisible grey pencils. **After:** both clearly visible. Ungated; the
affordance was equally hard to see for them.

---

## M4. DELETE A CATEGORY, WITH REASSIGNMENT ON DEMAND

A `✕` beside each category's rename pencil ([:4772](app/manage/[token]/page.tsx#L4772)).

* **Empty category** → a small confirm ("It has no items, so nothing is lost") → deletes.
* **Category with items** → an inline red panel: *"Where should N items go?"*, a `<select>` of the other
  categories, and **Move & delete** — disabled until a target is chosen. **This is the only place a
  category dropdown now appears.**

In-memory only: two `setImportResult` calls, no fetch, no RPC, nothing reaches the database before the
existing commit.

### 🔴 The last remaining category — NOT POSSIBLE, by choice

When `importResult.categories.length <= 1` the `✕` renders as an inert grey glyph with
`title="Your menu needs at least one category"`.

I chose prevention over explicit handling because **there is no safe version of the action**. `commitMenu`
drops any item whose category will not resolve — via a bare `continue` that never reaches `failed[]`
([lib/menu-commit.ts:8-11](lib/menu-commit.ts#L8-L11)) — so deleting the only category would discard the
entire menu with no error on any surface. And the with-items flow's whole safety mechanism is *"choose
where they go"*, which has no possible answer when there is nowhere else. Handling it explicitly would
mean either inventing a destination category or asking the operator to confirm losing their menu; not
offering the action is the honest option, and the tooltip says why.

### ⚠️ Also blocked: already-committed ("existing") categories

Same reasoning as slice I's rename block. This list is the import **payload** — removing an existing name
from it only stops *this import* touching that category; the committed category and its live items would
remain on the menu. A control labelled Delete that does not delete is worse than no control. For a new
signup there are no existing categories, so the feature is unrestricted there.

### 🔴 Interaction with M1 — flags are preserved; grouping *structure* may legitimately change

**No item's `_allergensChecked` is disturbed.** Both functions rebuild items with `{ ...it }` and write
`category` and nothing else. A confirmed dish stays confirmed when it moves category — verified by
reading the two updaters, which touch exactly one key.

**Grouping structure can change, and that is fine.** `computeGroupingRows`'s candidate path buckets by
`cand.category` ([:2437](app/manage/[token]/page.tsx#L2437)), and the AI path carries the category on its
bucket meta — so moving items between categories can split or merge a grouping row. **M1 makes that
safe:** the parent's flag is derived from whichever members it actually ends up with, at the moment it is
built, and `computeGroupingRows` is recomputed rather than cached. A regrouped parent whose members are
all confirmed comes out confirmed; one that gains an unconfirmed member comes out unconfirmed. The old
hardcoded `false` would have been wrong in both directions; the derivation is right in both.

Deleting a category also removes it from the grouping input for any row that referenced it, which is
correct — those items now group under their new category, or not at all.

**Gusto / RTF — before:** no way to delete a category during a review; a mis-extracted category had to be
committed and then cleaned up in the menu editor. **After:** they can delete one, and are made to say
where its dishes go first. Ungated, because the gap was theirs too.

---

## VERIFICATION

```
$ npx tsc --noEmit
TSC EXIT CODE: 0

$ npx eslint "app/manage/[token]/page.tsx"
✖ 371 problems (294 errors, 77 warnings)
```

**Baseline 371 (294 errors, 77 warnings); now 371 (294 errors, 77 warnings) — exactly the baseline.**
An interim run showed 372: my `.every((it: any) => …)` added a `no-explicit-any`. The annotation was
redundant (`memberItems` is already `any[]`), so it was removed rather than suppressed.

Mechanical checks after the change:

* **No per-row category dropdown survives** — `grep "Category for ${"` returns nothing.
* **Exactly one category `<select>` remains**, the M4 reassignment panel ([:4811](app/manage/[token]/page.tsx#L4811)).
* **The hardcoded parent flag is gone.** The four remaining `_allergensChecked: false` literals are all
  correct and were not touched: [:2134](app/manage/[token]/page.tsx#L2134) (items reconstructed by
  ungrouping — *"must be re-verified"*), [:2164](app/manage/[token]/page.tsx#L2164) (auto-split price
  conflicts), [:2326](app/manage/[token]/page.tsx#L2326) (a newly added modifier **option**, not an item)
  and [:4909](app/manage/[token]/page.tsx#L4909) (a blank manual row). Each is a *new* thing nobody has
  reviewed, so `false` is the safe and correct value; only the grouped parent was derived-but-hardcoded.

### Files touched

| File | Reason |
|---|---|
| [app/manage/[token]/page.tsx](app/manage/[token]/page.tsx) | M1 the derived parent flag; M2 dropdown removal + the extracted `reassignImportItem`; M3 both edit affordances; M4 the delete control, its reassignment panel and `deleteImportCategory`. |

Nothing else. `lib/menu-commit.ts` is **not** in the diff — the commit mapping is untouched, as required.

### Gusto and RTF — summary

| Item | Before | After | Gated? |
|---|---|---|---|
| M1 allergen fix | grouped dishes always committed unverified | confirmed when every member was confirmed | **No — intended.** A safety fix that applies to them equally |
| M2 dropdown | a `<select>` on every review row | none | **No — intended.** Same clutter for them |
| M3 affordances | grey ✎ at 12px | orange ✎ at 16px | **No — intended.** Same invisibility for them |
| M4 delete | not possible | possible, with reassignment required | **No — intended.** Same gap for them |

None of the four is setup-specific, and gating any of them would mean fixing a problem for new operators
while knowingly leaving it in place for the two trucks actually trading.
