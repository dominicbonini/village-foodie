# Slice I — wizard content and signup validation

**Date:** 4 August 2026
**Migrations:** none, and none were needed. **SQL:** none run. **`next dev` / `next build`:** not run.

No garbled spans in the brief. Two premises needed adjusting before building — the empty-category slug
risk in I1 (it does not exist) and the reuse instruction in I5 (the wording does not fit). Both are set
out under their items.

---

## I0. THE FOUR READS

### (a) How categories are represented in `importResult` — **both**

Verbatim, from the state declaration at
[app/manage/[token]/page.tsx:1763-1792](app/manage/[token]/page.tsx#L1763-L1792):

```ts
const [importResult, setImportResult] = useState<{
  categories: string[]
  items: Array<{
    name: string; description?: string; price: number; category: string; price_missing?: boolean; _skip?: boolean;
    …
  }>
  existing_categories: string[]
} | null>(null)
```

So there are **three** category-bearing fields:

* `categories: string[]` — the ordered list the review screen groups by and the commit iterates.
* `items[].category: string` — a **plain string, not an index or id**, expected to equal a member of
  `categories`.
* `existing_categories: string[]` — names already committed on this truck; drives the teal "existing"
  chip only.

**That "expected to" is the whole risk in I1**, and it is why the item is built the way it is below.

### (b) What the commit does with categories, and where `slug` comes from

**It reads the array, and it does not derive anything from the items.**
[lib/menu-commit.ts:127](lib/menu-commit.ts#L127) loops `for (const catName of categories)` and creates
or reuses one `menu_categories` row per entry. Items are resolved afterwards through
`categoryIdMap[item.category]` — an **exact string match**.

**`slug` is generated at [lib/menu-commit.ts:130](lib/menu-commit.ts#L130):**

```ts
const slug = catName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
```

**🔴 So the brief's stated risk does not exist: the slug is derived from the category NAME, not from its
items.** An empty category commits perfectly safely — it inserts a row with a valid slug and no items.
I have therefore **not** made add-then-assign the only path (though it is the natural one, since the new
section renders immediately and items move into it from any row).

Two facts from the same file that shape I1 more than the slug does:

* Resolution is by **exact name**, but *duplicate detection* is by **slug** and by **lower-cased name**
  ([:132](lib/menu-commit.ts#L132)). The UNIQUE constraint is `menu_categories_truck_id_slug_key`. So
  "Mains" and "mains " both slug to `mains` and would collide (23505).
* **An item whose category fails to resolve is dropped by a bare `continue`** and does **not** appear in
  `failed[]` — the file's own header says so ([:8-11](lib/menu-commit.ts#L8-L11)). It surfaces only as
  `unaccounted`, which the manage UI ignores. **A rename that misses an item loses that dish silently.**

### (c) The allergen list-vs-table view

| Question | Answer |
|---|---|
| Where does the mode live? | `const [reviewView, setReviewView] = useState<'list' \| 'table'>(…)` — [app/manage/[token]/page.tsx:960](app/manage/[token]/page.tsx#L960), local state inside `AllergenWizardModal`. |
| Default today | `'list'`. |
| Persists across steps? | **No.** The modal is an early `return` on `allergenSubStep === 'review'`, so leaving that sub-step unmounts it and the state is destroyed. |
| Persists across sessions? | **No.** No localStorage, no column, no prop — nothing writes it anywhere. |
| Can the operator switch freely? | **Yes**, either way, any time — the List ⇄ Table toggle at [:1232-1233](app/manage/[token]/page.tsx#L1232-L1233). Layout only; same data, same confirm actions. |

### (d) The kitchen-capacity help text, and what "no limit" shows

**Before**, from [lib/kitchen-capacity.ts](lib/kitchen-capacity.ts) (one source, three render sites):

> `KITCHEN_CAPACITY_DESC` — "The most items your kitchen can cook at once across the ticked categories —
> each cooked category's batch size still caps how many of that item fit in it."
> `KITCHEN_CAPACITY_EXAMPLE` — "Example: with a ceiling of 5 and pizzas in batches of 4, one window could
> be 4 pizzas + 1 side, or 3 pizzas + 2 sides — the batch (4) caps pizzas, the ceiling (5) caps the total."

Render sites: the import wizard's blue box ([app/manage/[token]/page.tsx:4608](app/manage/[token]/page.tsx#L4608),
the only one with the "How kitchen capacity works" heading), Manage Settings
([:8588](app/manage/[token]/page.tsx#L8588)), and the dashboard Menu & Stock card
([app/dashboard/[token]/page.tsx:3327](app/dashboard/[token]/page.tsx#L3327)).

**"No limit" is `null`, and the control renders it as the literal glyph `∞`** —
`<option value="">∞</option>`,
[components/manage/KitchenCapacityEdit.tsx:48](components/manage/KitchenCapacityEdit.tsx#L48). **So the
briefed wording is accurate and needed no substitution**, and I used it verbatim.

---

## I1. CATEGORY EDITING IN THE REVIEW STEP

### 🔴 How "renaming carries every item" is guaranteed

Not by ordering two updates correctly — by making it impossible for them to be separate.
[app/manage/[token]/page.tsx:1945-1954](app/manage/[token]/page.tsx#L1945-L1954):

```ts
const renameImportCategory = (from: string, to: string) =>
  setImportResult(prev => prev ? {
    ...prev,
    categories: prev.categories.map(c => c === from ? to : c),
    items: prev.items.map(it => it.category === from ? { ...it, category: to } : it),
  } : prev)
```

**One `setImportResult`, both arrays rebuilt from the same `prev`.** There is no intermediate state in
which the list has been renamed and the items have not, no second setter whose ordering could be got
wrong, and no partial-failure path. React commits both or neither.

This matters more than it looks, per I0b: commit-menu drops an unresolvable item with a bare `continue`
that never reaches `failed[]`. A rename that missed one item would not error — the dish would simply
never arrive on the menu, and the operator would have no way to see why.

### The three operations

| | Where | Behaviour |
|---|---|---|
| **Rename** | pencil ✎ on the category header ([:4430-4460](app/manage/[token]/page.tsx#L4430-L4460)) | Inline input. Enter or blur commits, Escape cancels. Validated before applying; on failure the input stays open with the reason. |
| **Add** | "+ Add category" after the last section ([:4545-4570](app/manage/[token]/page.tsx#L4545-L4570)) | Same inline input, same validator, same keys. The new (empty) section renders immediately above it. |
| **Reassign** | a compact `<select>` under each item's name ([:4479-4489](app/manage/[token]/page.tsx#L4479-L4489)) | Options come from `importResult.categories`, so a reassignment can never point at a name that does not exist. |

**In-memory only.** All three are `setImportResult` calls. No fetch, no RPC, no new write path — the
existing single commit at Kitchen "Save" remains the only thing that touches the database, exactly as
`_skip`, price edits and grouping already work.

**One supporting change: an empty category now renders.** The old guard `if (catItems.length === 0)
return null` hid it. It had to go — a category you have just added has no items yet, and a section you
cannot see is one you cannot move items into. It is also more honest for the pre-existing case: an
item-less extraction category *was always committed* (the commit iterates `categories`, not the items);
it was simply never shown.

### Duplicate prevention — including case and whitespace

Two helpers ([:1930-1943](app/manage/[token]/page.tsx#L1930-L1943)):

```ts
const normaliseCatName = (s: string) => s.trim().replace(/\s+/g, ' ')   // trim + collapse internal runs
const catKey = (s: string) => normaliseCatName(s).toLowerCase()          // identity for comparison
```

`validateCatName` rejects: empty/whitespace-only, over 60 characters, and any name whose `catKey`
matches an existing category (excluding the one being renamed). So **"Mains", `"mains "`, `"MAINS"` and
`"Mains  "` are all one category** and the second cannot be created.

This is not tidiness. Per I0b the slug is `name.toLowerCase().replace(/[^a-z0-9]+/g, '-')`, so "Mains"
and "mains " both slug to `mains` — creating both would collide on
`menu_categories_truck_id_slug_key` at commit and fail the category insert. The normalisation is
matched to the constraint, not chosen by taste.

⚠️ Not deduped against `existing_categories`: a name matching a category already on the truck but absent
from this extraction is **merged by commit-menu** (its `byName` lookup is case-insensitive and reuses
the row). That is correct and desirable — it is how "add a category that already exists" puts items into
the existing one rather than failing.

### Renaming to an existing name — **BLOCKED**, not merged

Chosen deliberately. Merging is irreversible in-memory: once two categories' items share a name there is
no record of which came from where, so an accidental merge cannot be undone without re-importing. A
block is recoverable in one keystroke, and the operator can still merge explicitly — reassign the items,
which is now a control on every row. Error: `There's already a category called "X".`

### Renaming an already-committed category — **BLOCKED**, and this one is a correctness guard

The ✎ is not rendered for a category in `existing_categories`. commit-menu has **no rename path** — it
matches by slug/name and *reuses*. So renaming "Sides" → "Snacks" here would create a second category
and leave the original, with its already-live items, behind. Renaming those belongs in the menu editor,
which can actually update the row. New categories rename freely.

`existing_categories` is deliberately **not** rewritten on rename, which is what makes the teal
"existing" chip disappear by itself when a category stops being one.

### 🔴 Gating: UNGATED

**Before —** Gusto and RTF could not rename, add or move a category during an import; the only fix was to
commit and then rearrange in the menu editor. A category with no items was invisible in review while
still being committed.

**After —** they get all three controls, on the same screen, in memory. Nothing else about their flow
changes: no new request, no change to what is sent to commit-menu, no change to the price gate, the
grouping step, or the commit itself. The reassign `<select>` is hidden when there is only one category,
so a single-category extraction renders exactly as before.

I kept it ungated because it changes nothing else, exactly as the brief specified. It is inline editing
in the existing review UI — there is no category manager screen.

---

## I2. ALLERGEN STEP — DEFAULT TO TABLE VIEW

A new optional prop, `initialReviewView?: 'list' | 'table'`, defaulting to `'list'`
([:907](app/manage/[token]/page.tsx#L907), [:960](app/manage/[token]/page.tsx#L960)). The import
wizard's per-dish review passes `"table"` ([:4666](app/manage/[token]/page.tsx#L4666)).

**Should the default also apply outside setup? Yes, and no preference is being overridden — because
there is no preference to override.** Per I0c, `reviewView` is component-local `useState` with no
localStorage, no column and no prop behind it; it resets to the default every single time the modal
opens. There is nothing stored for a non-setup operator, so the instruction "if a non-setup operator has
an existing preference, do not override it" is satisfied vacuously. I have therefore not gated it, and
say so explicitly rather than quietly.

**Card-only mode is unaffected** — structurally, not by a check. The card branch returns before the
`allergenSubStep === 'review'` block is reached, so it never constructs this component.

**The operator can still switch freely** — the existing List ⇄ Table toggle is untouched, one tap either
way.

**Before / after for Gusto and RTF:**

| Surface | Before | After |
|---|---|---|
| Menu tab → allergen wizard (the standalone one, their usual route) | opens in **list** | **unchanged — opens in list.** The default prop value is `'list'` and that call site passes nothing. |
| Import wizard → per-dish allergen review | opens in list | opens in **table** |

---

## I3. KITCHEN CAPACITY COPY

Replaced in [lib/kitchen-capacity.ts](lib/kitchen-capacity.ts), verbatim as briefed, with the file's own
conventions (em dash `—`, straight apostrophes, sentence case):

> **How kitchen capacity works**
> The most items your kitchen can turn out at once, across all the categories you've ticked. Each
> category's own batch size still applies on top.
>
> Example: with a ceiling of 5 and pizzas in batches of 4, one window could be 4 pizzas + 1 side, or 3
> pizzas + 2 sides — the batch caps pizzas, the ceiling caps the total.
>
> Leave at the infinity symbol for no limit.

**The last line names what the UI actually shows.** Per I0d the control renders `<option value="">∞</option>`,
so "the infinity symbol" is literally correct and the briefed wording needed no substitution. It is a new
constant, `KITCHEN_CAPACITY_NO_LIMIT`, carrying a comment tying it to that `<option>` so the two cannot
drift apart silently.

**Capacity logic, control and default: untouched.** `BatchSizeSelect`, `kitchenCapacityNeedsPrepWarning`,
`categoryNeedsPrepConfig`, `PREP_TIME_OPTIONS` and every default are exactly as they were. This is copy
only.

**Before / after for Gusto and RTF.** The first two paragraphs are the shared constants, so all three
surfaces change together — which is the point of the file (*"SINGLE SOURCE … so the two surfaces never
drift"*); forking it would have created the drift it exists to prevent.

| Surface | Effect |
|---|---|
| Manage → Settings → kitchen capacity | Both paragraphs reworded. No third line. |
| Dashboard → Menu & Stock capacity card | Both paragraphs reworded. No third line. |
| Import wizard → Kitchen setup blue box | Both paragraphs reworded, **plus** the new no-limit line. |

The third line renders **only in the wizard**: adding a line to Settings and the dashboard card would be
a UI change outside I3's scope. Flagging one redundancy rather than fixing it: the wizard already shows
"Set a total capacity … Leave at ∞ for no limit." beneath the control when capacity is null
([:4676](app/manage/[token]/page.tsx#L4676)), so that screen now says it twice in different words. Out of
scope here; say the word and it goes.

---

## I4. CONTACT PHONE MANDATORY AT SIGNUP

### Client-side

[components/DemoGetStarted.tsx](components/DemoGetStarted.tsx). The phone lives on the **details** step
(step 2), so the rule went into `validateDetailsStep()`, which `runSetup()` calls before any state flip
or server write:

```ts
if (!contactPhone.trim()) errs.phone = 'Add a phone number — customers and we both use it to reach you.'
else if (!isValidUKPhone(contactPhone)) errs.phone = 'Enter a valid UK phone number (e.g. 07700 900123).'
```

It runs in the same pass as email, password and terms, so all problems surface at once. The field
renders a red border and the message beneath, and typing clears it (`clearFieldErr('phone')`) — the same
pattern the name/truck/cuisine fields already use.

### Server-side

[app/api/setup/route.ts](app/api/setup/route.ts), inside `action: 'create_truck'`, beside the existing
name check. `contact_phone` now travels with that request and is written by the same scoped
post-provision update:

```ts
.update({ operator_id: operator.id, setup_step: 'menu', contact_phone: contactPhone })
```

**🔴 Why there and nowhere else.** The obvious home looks like `update_settings`
(`app/api/manage/route.ts`) — the action that actually writes `contact_phone`, and which the signup
modal's step (d) still calls. But that is the same action **Manage Settings saves through, for every
truck that already exists**. A required check there would reject a save from an operator whose phone is
blank today. `/api/setup` is reached only by an operator who has no truck yet.

**`app/api/manage/route.ts` is not in the diff** — verified mechanically. That is the guarantee that
nothing is retrofitted and no existing operator can be blocked from saving Settings: the route that
saves Settings was not opened. Manage's existing soft validation is also unchanged — `contactPhoneErr`
still fires only for a **non-empty** invalid value, so an existing truck with a blank phone still saves
silently, exactly as today.

Step (d)'s `update_settings` write is left in place: it also carries `whatsapp` and `phone_is_whatsapp`,
and per the brief this item touches one field only. It is best-effort and always was — which is
precisely why the mandatory check could not live there.

### 🔴 What is accepted and rejected

One validator on both sides — `isValidUKPhone`
([lib/contact-validation.ts:16-19](lib/contact-validation.ts#L16-L19)), the same function Manage Settings
already uses, so a number the client accepts cannot be rejected by the server:

```ts
const digits = (phone || '').replace(/[^\d+]/g, '')
return /^(\+?44|0)\d{9,11}$/.test(digits)
```

Everything except digits and `+` is stripped **before** the test, so spacing and punctuation are
irrelevant.

| Input | Result |
|---|---|
| `07123456789` | **accepted** (required by the brief) |
| `+447123456789` | **accepted** (required by the brief) |
| `07123 456789`, `+44 7123 456789`, `(07123) 456-789`, `07123-456-789` | **accepted** (required by the brief) |
| `447123456789` | accepted |
| `01234 567890` (landline) | accepted |
| `0000000000` | accepted — deliberately. This checks **shape, not correctness**. |
| empty / whitespace only | rejected — the only hard rejection that matters |
| `+1 415 555 0100` (non-UK) | rejected |
| `12345` (too short after the leading digit) | rejected |

Deliberately permissive, per the brief: a signup blocked by a fussy regex costs far more than a loosely
formatted number in a column. Nothing normalises the value — what the operator typed is what is stored
and what Settings shows.

**`whatsapp_sender` and `phone_is_whatsapp`: not touched.** `whatsapp_sender` is written by a different
action (`update_truck`) on a different screen and does not appear in this diff at all;
`phone_is_whatsapp` and its derived `whatsapp` are still set exactly as before by step (d).

### Label and error message

* **Label:** `Phone` — the `(optional)` qualifier is removed. No asterisk was added: this modal's other
  required fields (name, truck, cuisine, email, password) carry none either, so one here would read as
  the *only* required field.
* **Empty:** "Add a phone number — customers and we both use it to reach you."
* **Malformed:** "Enter a valid UK phone number (e.g. 07700 900123)."
* **Server, empty:** "A contact phone number is required."
* **Server, malformed:** "Enter a valid UK phone number (e.g. 07700 900123)."

**Before / after for Gusto and RTF: unaffected.** Neither has ever called `/api/setup` — it creates
trucks for operators who have none — and `DemoGetStarted` is the signup modal, which they are long past.
Their Settings phone field, its validation and their ability to save a blank one are unchanged.

---

## I5. "NOT VISIBLE TO CUSTOMERS" BANNER

### The exact condition tested

[app/manage/[token]/page.tsx:3206-3209](app/manage/[token]/page.tsx#L3206-L3209):

```ts
const hiddenCount = (truck.allergen_display_mode ?? null) !== 'card'
  ? items.filter(i => i.allergens_verified === false).length
  : 0
if (hiddenCount === 0) return null
```

**That is the server's own gate, restated.** [app/api/menu/[truckId]/route.ts:488-490](app/api/menu/[truckId]/route.ts#L488-L490):

```ts
const perDish = ((truck.allergen_display_mode ?? null) as string) !== 'card'
if (isDashboard || !perDish) return true
return (i as any).allergens_verified !== false
```

Same mode test (`null` is not `'card'`, so an unset mode is per-dish), same strict `=== false` so
legacy/null items are not counted. **The gate, the default and the commit are unchanged** — nothing in
this slice touches any of them.

**It clears itself** because it is derived from live props on every render: confirm the last dish, or
switch to card mode, and it stops rendering. Nothing is stored and there is nothing to dismiss.

**Reuses `onOpenAllergenWizard`**, the same entry point the Allergens section below already uses — no new
path.

### 🔴 The H0b constant does not fit — proposed wording instead

Slice H's `allergensNotSetNotice` reads:

> ⚠ Allergens & dietary aren't set yet — Review them before going live. Items are flagged "allergens not
> set" until you do.

It describes **the flag**. I5 exists to communicate **the consequence** — that the dishes are gone from
the ordering page. Reusing it would replace the one fact the operator is missing with the one they can
already see (the `(!)` markers, the amber box). So it is not reused, and no near-copy of it was written.
Proposed and built:

> **🚫 {n} items are not visible to customers**
> They won't appear on your ordering page until their allergens are confirmed — showing a dish with
> unchecked allergen info would read as "allergen-free". You can still see them here.
> **Confirm allergens →**

Singular handled throughout ("1 item is", "It won't appear", "its allergens", "see it here"). Red rather
than amber, so it is distinguishable at a glance from the existing amber "allergens not set" treatment.
`allergensNotSetNotice` remains exactly one copy in the repo — verified.

### 🔴 Is Gusto or RTF currently in that state? **I cannot tell you, and you need to check today**

Nothing in the codebase records either truck's `allergen_display_mode` or its items'
`allergens_verified` values, and I was instructed to run no SQL. **So this is unanswered, not answered
negatively.** It matters: if either is in this state, that truck's menu is invisible to customers right
now, and has been since the values were set.

Please run this:

```sql
select t.name,
       coalesce(t.allergen_display_mode, '(null → treated as per_dish)') as display_mode,
       count(*) filter (where i.allergens_verified is false)             as hidden_from_customers,
       count(*)                                                          as total_items
from trucks t
left join menu_items_db i on i.truck_id = t.id and i.is_active
where t.id not like 'demo-%'
group by t.id, t.name, t.allergen_display_mode
having count(*) filter (where i.allergens_verified is false) > 0
   and coalesce(t.allergen_display_mode, 'per_dish') <> 'card'
order by hidden_from_customers desc;
```

Any row returned is a truck with items missing from its customer menu. **An empty result means nobody is
affected.**

**Before / after for Gusto and RTF — deliberately ungated.** Before: if either is in this state, nothing
on their Menu tab says the items are *hidden*; the closest is the Allergens section at the bottom of the
page, which says "customers can't see allergen info until confirmed" — understating it, since customers
cannot see the **dish**. After: a red banner at the top of the Menu tab, only if they are actually in
that state, clearing itself the moment they are not. **If they are not in that state, they see nothing
new.**

**Report-only, built nothing:** that existing line at
[:3606](app/manage/[token]/page.tsx#L3606) is materially understated for the same reason, and its box is
below the entire menu rather than above it. Correcting its wording is a copy change to a live operator's
Menu tab and belongs in its own slice with its own decision.

---

## VERIFICATION

```
$ npx tsc --noEmit
TSC EXIT: 0

$ npx eslint "app/manage/[token]/page.tsx"
✖ 371 problems (294 errors, 77 warnings)

$ npx eslint components/DemoGetStarted.tsx app/api/setup/route.ts lib/kitchen-capacity.ts
(no output — clean)
```

**Baseline was 371 problems (294 errors, 77 warnings); it is 371 (294 errors, 77 warnings) — exactly the
baseline, nothing added.** The I5 banner initially added two `no-explicit-any` errors from copying the
`(truck as any)` / `(i as any)` casts used by the older code beside it; both casts were unnecessary
(`Truck` declares `allergen_display_mode`, `Item` declares `allergens_verified`) and were removed rather
than suppressed.

### Files touched

| File | Reason |
|---|---|
| [app/manage/[token]/page.tsx](app/manage/[token]/page.tsx) | I1 (category rename/add/reassign helpers, validator and review-step UI), I2 (`initialReviewView` prop + the import call site), I3 (renders the new no-limit line), I5 (the hidden-from-customers banner). |
| [lib/kitchen-capacity.ts](lib/kitchen-capacity.ts) | I3 — the two rewritten shared paragraphs and the new `KITCHEN_CAPACITY_NO_LIMIT` constant. |
| [components/DemoGetStarted.tsx](components/DemoGetStarted.tsx) | I4 — phone required client-side, label, error, and sending `contact_phone` with `create_truck`. |
| [app/api/setup/route.ts](app/api/setup/route.ts) | I4 — server-side requirement + permissive validation, and writing the value. |

**Not touched, and that is load-bearing:** `app/api/manage/route.ts` (the `update_settings` action
Settings saves through — I4), `app/api/menu/[truckId]/route.ts` (the visibility gate — I5),
`lib/menu-commit.ts` (I1 adds no write path), `components/manage/KitchenCapacityEdit.tsx` (I3 is copy
only). No migration, no SQL, no schema change was needed at any point.

### Gusto and RTF at a glance

| Item | Gating | Effect |
|---|---|---|
| I1 category editing | ungated | **Gain** three in-memory controls in the import review. Nothing else in their flow changes; no new request, same commit payload shape. |
| I2 table default | ungated, import call site only | Their **Menu-tab** allergen wizard is **unchanged** (still list). Their **import** per-dish review now opens as the table; one tap returns to list. |
| I3 capacity copy | ungated (shared constants) | Reworded help text on Settings and the dashboard card; the wizard also gains the no-limit line. Logic, control and defaults untouched. |
| I4 phone required | signup-only by construction | **Unaffected.** Neither calls `/api/setup`, and the Settings save path was not opened. |
| I5 hidden-items banner | deliberately ungated | **Nothing new unless they are actually in that state** — in which case they finally see that their menu is invisible. Whether they are is unverified; the query is above. |
