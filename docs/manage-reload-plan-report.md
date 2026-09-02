# The manage-screen `reload()` unmount — full cost and fix plan

**PLANNING ONLY. Nothing built, nothing committed, nothing deployed. No SQL, no migrations.**

---

## VERIFICATION

**What I performed: SOURCE READ ONLY.** No build, no run, no device.

🔴 **I have not exercised this screen.** Every behavioural claim is traced through source and marked
**READ** or **INFERRED**. **No typecheck was run, and it would not be evidence.**

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 🔴 THE HEADLINE: THIS BUG IS ALREADY NAMED, DOCUMENTED, AND HALF-FIXED

**I did not know this when I wrote the upload report. It changes the plan.**

**Four comments in this same file already diagnose it exactly** (READ):

```
8651  // ...NO reload() (reload→Spinner→unmounts this tab, the §23 "iPhone" violation).
8765  // ...NO reload() (reload sets loading→Spinner→unmounts this tab, closing the popup)
9241  // ...NO reload() (reload→Spinner→unmounts this tab). Payload unchanged.
9259  // ...revert on error — NO reload().
```

**And `docs/reference-manual.md:11313` carries it as a STANDING RULE — the "iPhone" rule [V7.8]:**

> **SPECIFICALLY FORBIDDEN as the result of a single control interaction:** … *"A `reload()` that
> refetches + re-renders the whole tab when only one row changed — use a **local optimistic state
> update** around the write and reconcile via a **partial-merge callback** (like `onTruckUpdate`), NOT a
> full refetch that rebuilds the view and loses scroll / modal state."* … *"Any visible flash: a spinner
> over the whole page, a flash of re-mounting content, lost scroll position, or a closed/reset modal, in
> response to one click."*

**The manual even names the remaining `reload()` calls as a migration target:**

> *"some recently-built controls intentionally call `reload()` after a write … Per this rule those should
> be migrated to optimistic local state + a partial-merge … tracked as a **fix target, not a new pattern
> to copy**."*

> 🔴 **THE PROJECT ALREADY DECIDED THIS. THREE TABS HAVE ALREADY MIGRATED.** `ScheduleTab` (6672),
> `SettingsTab` (8638) and `TeamTab` (12425) **all still receive `reload` as a prop and NEVER CALL IT** —
> READ, zero `reload()` call sites above line 6400. **They are dead props: the evidence of a migration
> that stopped before it reached `MenuTab`.**

---

## 1 · Every caller, and what the operator loses

**`load()` is the only refetch. It reaches the tabs as `reload={load}` at lines 754, 755, 756, 758, 759,
777.** ⚠️ **Only `MenuTab` and `DealsTab` still call it.**

### What a remount destroys, measured

**`MenuTab` holds 🔴 72 `useState` declarations** (READ, lines 1935-6100). **A remount resets every one.**
The ones an operator would feel:

| State | Line | Lost |
|---|---|---|
| `expandedCat` | 3549 | 🔴 **The open category** |
| `editingCat` | 1959 | The inline category-settings panel (shown at 3987 *while expanded*) |
| `editingItem` | 1960 | 🔴 **The whole edit modal, mid-edit** |
| `deletingItem` | 1961 | An open delete confirmation |
| `subcatModalCat`, `editingSubcatId`, `editingSubcatName`, `newSubcatName` | 1978-1981 | The sub-category modal and a half-typed rename |
| `importStep` + ~30 wizard states | 2037-2147 | 🔴 **The entire import wizard**, including an uploaded file and parsed results |
| `allergenStep`, `allergenExtracted`, `showAllergenModal` | 3550-3556 | The allergen wizard mid-flow |
| `localItems`, `localSubcats` | 1969, 1975 | Re-seeded from the server (1971, 1977) |
| **Document scroll** | — | 🔴 **Lost — no save/restore exists.** Only two `scrollTo`/`scrollIntoView` calls in 12,972 lines (2094, 6835), **neither on this path** |

### The callers

| Line | Action | What the operator loses today |
|---|---|---|
| 🔴 **4083** | **Item image upload (inline slot)** | **Open category, scroll.** The reported symptom |
| 🔴 **3618** | **Save category settings** | **The category being edited collapses, and `editingCat` — the panel is open BECAUSE it is expanded (3987), so this closes the thing you just used.** Scroll |
| 🔴 **3940** | **Category reorder** | **Open category, scroll** — after a drag, which is the worst moment to jump |
| **3764** | Delete category | Expansion (the category is gone anyway), **scroll** |
| **3689** | Add item — **fallback branch only** | ⚠️ **Already worked around.** See §4 |
| **3509** | Import wizard commit (in a 2500ms `setTimeout`) | Wizard state — **intended**, `resetImportState()` runs alongside |
| **5946 / 5951 / 5956** | Walkthrough now / later / never | Wizard state — **intended** |
| **6313** | DealsTab — save deal | Deal editor state, **scroll** |
| **6320** | DealsTab — delete deal | **Scroll** |
| **754** | `onCloseAllergenWizard` → `load()` | Everything in MenuTab, on closing the allergen wizard |
| **352** | `useEffect(() => { load() })` | ✅ **The initial load. This one MUST keep the spinner** |

> **Six callers cause a loss the operator did not ask for (4083, 3618, 3940, 3764, 6313, 6320, plus 754).
> Four are flow-endings where the reset is harmless or intended.**

---

## 2 · The fix — your instinct is right, and it is not sufficient on its own

### What the spinner currently protects against

**READ, `load()` lines 324-350: it sets `loading = true` and then CLEARS NOTHING.** Every state slice
keeps its previous value until the twelve setters run at 333-347.

| Moment | What is in state | What the guard at 548 is for |
|---|---|---|
| **Initial mount** | `truck` is **`null`** (206); lists are `[]` | 🔴 **LOAD-BEARING.** `MenuTab` dereferences `truck.plan` at **1966** and the page reads `truck.truck_emoji` at **561**. Without the guard the first render **throws**. ⚠️ `if (!truck)` at **554** would catch it, but it renders *"Invalid or expired token"* — **wrong words for "not fetched yet"** |
| **Any refresh** | 🔴 **The complete previous payload** | ✅ **Nothing. It protects against nothing.** |

> ## 🔴 ANSWER TO YOUR QUESTION: A REFRESH WOULD RENDER A **STALE, COMPLETE, SELF-CONSISTENT** LIST.
> **Not empty, not partial.** `load()` never clears, and the twelve setters run together in one batch
> after `res.ok`, so the tree never sees a half-updated payload. **The spinner during a refresh is pure
> cost.**

### The plan — two changes, in order, and the first is not optional

**STEP 1 — separate INITIAL from REFRESH.** ✅ **Your preference is correct, and I checked rather than
assumed.**

```ts
const load = useCallback(async (silent = false) => {
  if (!silent) setLoading(true)
  … unchanged …
  finally { if (!silent) setLoading(false) }
}, [token])

const refresh = useCallback(() => load(true), [load])
// then: reload={refresh} at 754/755/756/758/759/777, and load() → refresh() at 754's onCloseAllergenWizard
```

⚠️ 🔴 **`reload={load}` MUST BECOME `reload={refresh}`, NOT `reload={(…) => load(true)}` inline.** If any
call site ever becomes `onClick={reload}`, the `MouseEvent` lands in the first parameter and **coerces to
`silent = true` by accident**. **A dedicated zero-argument `refresh` makes that unexpressible.** (READ:
every current call site is `reload()` with no arguments, so this is prevention, not a present bug.)

**STEP 2 — convert the six real callers to the §23 pattern.** **Step 1 stops the tree being destroyed;
Step 2 is what the standing rule actually requires**, and it removes a full 12-slice refetch for a
one-field change.

> **THEY ARE NOT ALTERNATIVES.** Step 1 is one edit that fixes every caller at once, including ones
> nobody has converted yet. Step 2 is per-caller and slower. **Ship Step 1 first; it is the general fix.**

---

## 3 · The edit modal's pattern, and whether it can serve the inline slot

**It can, and a nearer template than `saveItemPatch` already exists.**

**`saveItemPatch` (3640-3649) — READ:**

```ts
const saveItemPatch = async (patch) => {
  if (!editingItem) return                                            // 3641  ← the coupling
  const next = { ...editingItem, ...patch } as Item
  setEditingItem(next)                                                // 3643  modal mirror
  if (!next.id) return
  const prevLocal = localItems                                        // 3645  snapshot for rollback
  setLocalItems(list => list.map(i => i.id === next.id ? next : i))    // 3646  optimistic
  try { await api('upsert_item', next); flashSaved() }                // 3647  write after
  catch { setLocalItems(prevLocal); showToast(e.message, 'error') }    // 3648  revert
}
```

🔴 **The inline slot cannot call it — line 3641 returns early unless the edit modal is open.** But
**`writeItemAllergens` (3660-3667) is the same pattern for an ARBITRARY item**, which is exactly the
inline slot's shape:

```ts
const writeItemAllergens = async (item: Item, …) => {
  const next = { ...item, … } as Item
  const prevLocal = localItems
  setLocalItems(list => list.map(i => i.id === item.id ? next : i))
  try { await api('upsert_item', { ...next, … }) }
  catch { setLocalItems(prevLocal); showToast(…); throw e }
}
```

**And `toggleItem` (3770-3779) and `confirmDeleteItem` (3781-3790) are the same shape again — both on
the very row that holds the broken image slot.**

> ✅ **CONVERGE. Do not invent a second pattern.** The inline slot becomes a named
> `uploadItemImage(item, file)` that ends in the `writeItemAllergens` shape. **That also gives drag-and-
> drop a function to call** (see the upload report §6) — one function, two entry points.

⚠️ **One real difference to carry over: `saveItemPatch` sends the FULL merged object, and its comment at
3543-3544 says why — *"not a sparse `{id, image_path}` — that coerced other absent fields to
null/default"*.** 🔴 **The inline slot at 4082 sends exactly that sparse payload today.** **Converging on
the pattern means sending the full item, which is a behaviour fix hiding inside a layout-agnostic
refactor — worth landing deliberately and verifying, not silently.**

---

## 4 · The workaround at 3689, in full — and 🔴 it is NOT dead code

```ts
3672  const saveItem = async () => {                       // CREATE handler
3679    const result = await api('upsert_item', editingItem)
3680    const saved = result.item as Item | undefined
3681    showToast('Item added')
3682    if (saved?.id) {
3683      setLocalItems(prev => [...prev, saved])
3684      setEditingItem(saved)                             // → EDIT mode in place
3685      handleExpandCat(saved.category_id ?? null)        // ← ALSO HERE, with NO reload
3686      flashSaved()
3687    } else {
3688      const catId = editingItem.category_id
3689      setEditingItem(null); await reload(); if (catId) handleExpandCat(catId)
3690    }
```

**Does the general fix make it dead? 🔴 NO — and the proof is four lines above it.**

**Line 3685 calls `handleExpandCat` on the SUCCESS path, where there is no `reload()` and nothing has
collapsed.** ✅ **So the call's purpose is to REVEAL the category holding the newly created item — which
may never have been open — not to repair a collapse.**

**It also does a second thing:** `handleExpandCat` (3743-3751) sets `editingCat` as well as
`expandedCat`, seeding the inline settings panel.

> ⚠️ **REMOVING IT IS NOT SAFE.** After Step 1 the `await reload()` no longer destroys anything, but
> `handleExpandCat(catId)` must stay or **a newly added item lands in a category the operator cannot
> see.** **Leave the line exactly as it is.**

⚠️ **What Step 1 DOES change here: `setEditingItem(null)` at 3689 currently has a remount behind it, so
the modal was closing twice over. After the fix it closes once, explicitly. Same visible result.**

---

## 5 · Risk — and the one that matters

| What could regress | Who notices |
|---|---|
| 🔴 **A modal now SURVIVES a refresh.** `editingItem` (1960) previously died with the remount | **Intended** — but if the refresh returns data where that item was **deleted on another device**, the modal holds a phantom row and its per-field auto-save (`saveItemPatch`) would **re-create it** |
| **The import wizard now survives a refresh** | 3509 already calls `resetImportState()` alongside, so no change there. **Any OTHER refresh landing mid-wizard now leaves it open** — previously it was wiped |
| **No spinner = no signal.** An operator gets no feedback that anything is happening | On a slow connection a category-settings save would look inert. **Mitigate with the existing `saving` flag on the control, not a page spinner** |
| **`localItems` is re-seeded at 1971 when the `items` prop identity changes** | **Unchanged by Step 1** — it happens on remount today and on prop-change after. ⚠️ **But an optimistic edit made DURING an in-flight refresh would now be silently overwritten by the server echo.** Today the remount hid it |
| Behaviour of `DealsTab` (6313/6320) | Also changes — **it is the same `reload` prop.** In scope whether or not it is intended |

### 🔴 THE FAILURE CASE YOU NAMED — and it is a defect that ALREADY EXISTS

**READ, line 348:** `catch (e: any) { showToast(e.message || 'Failed to load', 'error') }`, then
**349** `finally { setLoading(false) }`.

> 🔴 **A FAILED REFRESH LEAVES THE PREVIOUS DATA ON SCREEN WITH NOTHING BUT A TRANSIENT TOAST. THAT IS
> TRUE TODAY.** The setters at 333-347 never run, the spinner clears, and the pre-refresh payload stands.

⚠️ **Step 1 does not create this. It makes it QUIETER** — today there is at least a spinner flash saying
*something happened*; afterwards a failed refresh is visually indistinguishable from a successful one
once the toast fades.

**So Step 1 must ship WITH a staleness signal, not after it:**

- A `refreshFailed` state set in the `catch`, cleared on the next success.
- A **persistent** inline banner — *"Couldn't refresh — showing data from HH:MM"* with a Retry — **not a
  toast.** **A toast that fades is exactly the mechanism that lets stale data pass as current.**
- 🔴 **This is the condition on which I would ship Step 1.** The screen must never silently show an
  operator data it knows is out of date, and today it does.

---

## 6 · Collision with the customer menu-row work — 🔴 NONE

| | Manage `reload()` work | Customer two-column row |
|---|---|---|
| File | **`app/manage/[token]/page.tsx`** | **`app/trucks/[slug]/order/page.tsx`** |
| Surface | Operator | Customer |
| Component shared? | ❌ **No.** The manage item thumbnails (4072, 4806) are its own markup; the customer row is inline JSX. **Verified last task: the class string `w-16 h-16 rounded-xl object-cover` occurred once in the repo, and `photo_url` renders in exactly one place** |

**The two files DO share nine imports** (READ): `@/components/MenuAllergenChips`, `@/components/SpiceLevel`,
`@/lib/basket-utils`, `@/lib/contact-validation`, `@/lib/demo`, `@/lib/features`, `@/lib/modifier-rules`,
`@/lib/preorder`, `@/lib/time-utils`.

> ✅ **NEITHER TASK MODIFIES ANY OF THEM.** The row change was 35 insertions of JSX in one file; this plan
> touches `load`, its prop wiring and six call sites in the other. **No shared file is in either diff.**

**ORDER: they are INDEPENDENT and can be built in either order or in parallel.** ⚠️ **If a sequence is
wanted, do the manage fix FIRST** — it is an operator-blocking defect on a live trading surface, and the
customer row change is already built and awaiting a device look.

---

## 7 · File-by-file change list

**One file: `app/manage/[token]/page.tsx`.**

| # | Lines | Change | Step |
|---|---|---|---|
| 1 | **324-350** | `load(silent = false)`; guard both `setLoading` calls | 1 |
| 2 | **new, after 350** | `const refresh = useCallback(() => load(true), [load])` | 1 |
| 3 | **348** | Set a `refreshFailed` / `lastLoadedAt` state in the `catch` | 1 |
| 4 | **new, near 548** | Persistent stale banner + Retry. 🔴 **NOT a toast** | 1 |
| 5 | **754, 755, 756, 758, 759, 777** | `reload={load}` → `reload={refresh}`; `onCloseAllergenWizard` `load()` → `refresh()` | 1 |
| 6 | **352** | `useEffect(() => { load() })` — ⚠️ **UNCHANGED.** The initial load keeps the spinner | 1 |
| 7 | **4077-4086** | Extract `uploadItemImage(item, file)`; optimistic `setLocalItems` + rollback; **full-object upsert** (§3) | 2 |
| 8 | **3618, 3940, 3764, 6313, 6320** | Convert to optimistic + partial-merge | 2 |
| 9 | **3689** | 🔴 **NO CHANGE.** Not dead code (§4) | — |

⚠️ **`app/api/manage/route.ts`, the data model and every upload/storage path are UNTOUCHED.**

### Verify on a real device (the operator's iPad)

1. 🔴 **The category stays open and the scroll holds** across image upload, category-settings save and
   reorder. **The entire point, and not observable from a typecheck.**
2. 🔴 **The stale banner.** Kill the network mid-save, confirm a **persistent** banner — *"the toast
   faded and I couldn't tell" is the failure this is for.*
3. 🔴 **The edit modal surviving a refresh.** Open it, trigger a refresh, confirm the modal is coherent
   and auto-save still targets the right row.
4. **The import wizard** — start it, trigger a refresh from elsewhere, confirm it is not wiped **and not
   left in a half-state**.
5. **No spinner flash** on any single control interaction — the §23 rule's own acceptance test.

### Enough on a laptop

The `silent` flag plumbing, that the initial load still spinners (hard-refresh with the network
throttled), the rollback path with the API forced to fail, and that `DealsTab` still saves.

---

## What I could not establish

1. 🔴 **That any of this behaves as described at runtime.** **Source read only. I have not run the manage
   screen once.**
2. **Whether `DealsTab`'s two callers matter to an operator** — I did not read its surrounding UI.
3. **Whether anything outside this file calls `/api/manage` and depends on the refetch cadence.**
4. **What the 2500ms `setTimeout` at 3507-3510 interacts with** if a refresh is already in flight —
   **concurrent `load()` calls are not guarded anywhere**, and Step 1 makes them invisible rather than
   fixing them. ⚠️ **Worth a look before Step 2.**
