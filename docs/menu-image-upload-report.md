# Menu image upload — the category collapse, and drag-and-drop

**READ-ONLY. No files changed, no code written, nothing deployed, no migrations, no SQL.**
**This report is the only artefact.**

---

## VERIFICATION

**What I performed: SOURCE READ ONLY.**

🔴 **I have NOT run the manage screen, uploaded an image, or observed a collapse.** Every causal claim
below is traced through source and is marked **READ** or **INFERRED** accordingly. **No typecheck was
run, and none would be evidence here.**

**No span of the prompt arrived garbled. No instruction contradicted another.** ⚠️ *(Writing this report
is not a violation of "change no files" — it is the deliverable the prompt asks for.)*

⚠️ **ONE DETAIL OF THE SYMPTOM DIFFERS FROM THE SOURCE.** You describe a **"photo uploaded"** toast. The
string at `app/manage/[token]/page.tsx:4084` is **`'Photo updated'`**. **READ.** I take this as your
paraphrase, not a second code path — but if you saw those exact words, there is a slot I have not found.

---

## 1 · The upload path, file and line

**Surface:** `app/manage/[token]/page.tsx` — one 12,972-line client component. The menu editor is
`MenuTab`, declared at **line 1935**.

**There are TWO item-image slots. They behave differently, and only one is broken.**

### Slot A — inline, in the category's item list 🔴 **THE REPORTED SYMPTOM**

`app/manage/[token]/page.tsx:4072-4087` — a `<label>` wrapping a `sr-only` file input.

| Line | Step |
|---|---|
| **4077** | `<input type="file" accept="image/*">`, `onChange` is an **inline async arrow** |
| **4078** | `const file = e.target.files?.[0]; if(!file) return` |
| **4080** | `api('get_upload_url', { filename, content_type })` |
| **4081** | `fetch(upload_url, { method: 'PUT', body: file })` — direct to storage |
| **4082** | `api('upsert_item', { id: item.id, image_path: path })` — persists |
| 🔴 **4083** | **`reload()`** |
| **4084** | `showToast('Photo updated')` |

### Slot B — inside the edit modal ✅ **DOES NOT COLLAPSE**

`app/manage/[token]/page.tsx:4806-4817`, calling **`uploadItemPhoto`** at **3537-3548**:

```
3541  api('get_upload_url', …)
3542  fetch(upload_url, PUT)
3545  await saveItemPatch({ image_path: path })      ← NOT reload()
```

**`saveItemPatch` (3640-3649) is optimistic with rollback:**

```
3643  setEditingItem(next)
3646  setLocalItems(list => list.map(i => i.id === next.id ? next : i))
3647  try { await api('upsert_item', next); flashSaved() }
3648  catch { setLocalItems(prevLocal); showToast(…) }
```

> ✅ **No refetch, no spinner, no remount. The correct pattern already exists in this component, ten
> lines from the broken one.**

---

## 2 · 🔴 WHY THE CATEGORY COLLAPSES — IT IS A REMOUNT, NOT A STATE RESET

**You asked me to distinguish these. It is unambiguously a remount, and the distinction changes the fix.**

**What holds the state:** `app/manage/[token]/page.tsx:3549`

```
const [expandedCat, setExpandedCat] = useState<string | null>(null)
```

**Local to `MenuTab`.** Read at **3890** (`const isOpen = expandedCat === cat.id`) and gating the item
list at **4061** (`{isOpen && (`).

### The chain, every link READ

| # | Line | What happens |
|---|---|---|
| 1 | **4083** | `reload()` |
| 2 | **754** | `reload` is the prop `reload={load}` — 🔴 **`<MenuTab …/>` carries NO `key`**, so a key change is NOT the mechanism |
| 3 | **325** | `load()` begins `setLoading(true)` — **unconditional, before the fetch** |
| 4 | 🔴 **548** | **`if (loading) return (<div className="min-h-screen …"><Spinner/>…</div>)`** — an **early return in the page component**, ABOVE line 754 |
| 5 | — | **The entire tree below it is unmounted.** `MenuTab` is destroyed, and `expandedCat` with it |
| 6 | **349** | `finally { setLoading(false) }` |
| 7 | — | The page re-renders, `MenuTab` **mounts fresh**, `useState(null)` at **3549** runs again |
| 8 | **3890** | `isOpen` is false for every category → **collapsed** |

> 🔴 **THE EXACT LINE IS 548.** The upload's only fault is calling `reload()` at 4083; **line 548 is what
> makes any `reload()` destructive.**

**Why this matters for the fix:** the state is not reset by an assignment — **there is no
`setExpandedCat(null)` anywhere** (READ: `setExpandedCat` appears only at 3549 and 3744). **Nothing is
"closing" the category. The component holding the knowledge that it was open ceases to exist.**

⚠️ **INFERRED, not observed:** that step 5 actually paints. `setLoading(true)` is called from an event
handler before the first `await`, so React flushes it in that batch and the spinner commits before the
fetch resolves. **Consistent with the reported symptom, but I have not watched it happen.**

---

## 3 · Scroll position

🔴 **It is lost, and it is the SAME cause — not a separate one.**

**READ:** the manage screen has **no scroll save or restore for the menu list.** The only two scroll
calls in 12,972 lines are `wizardScrollRef.current?.scrollTo({top:0})` (**2094**, the import wizard) and
`scrollIntoView` on `#add-event-form` (**6835**, the Schedule tab). **Neither is on this path.**

**INFERRED from that absence plus line 549:** the spinner is a single `min-h-screen` flex box, so while
`loading` is true the document is roughly one viewport tall. **A browser cannot preserve a scroll offset
into a document that no longer extends that far**, and nothing restores it afterwards.

> **Same root cause, same fix.** ⚠️ **But note the asymmetry: lifting `expandedCat` out of `MenuTab`
> would fix the collapse and NOT the scroll.** Only removing the unmount fixes both.

---

## 4 · How the new image reaches the UI

🔴 **A FULL REFETCH OF THE ENTIRE MANAGE PAYLOAD.** Not optimistic, not targeted.

`load()` (**324-350**) does one `GET /api/manage?token=…` and replaces **twelve** pieces of state:

```
333 setTruck            338 setCategories        343 setCategoryModGroups
334 setUserRole         339 setItems             344 setItemModGroups
335 setCurrentUserId    340 setSubcategories     345 setBundles
336 setOwnerEmail       341 setModifierGroups    346 setUpsellRules
337 setOwnerAuthUserId  342 setModifierOptions   347 setPendingEmailChange
```

**What UI state depends on the replaced data:**

- **`localItems`** (**1969**) — `useState<Item[]>(items)`, resynced during render at **1971**
  (`if (prevItemsRef.current !== items) { …; setLocalItems(items) }`). **This is what the list actually
  renders** (**3889**: `const catItems = localItems.filter(…)`).
- **`localSubcats`** (**1975**) — same pattern at **1977**.
- 🔴 **And, because of line 548, every other piece of `MenuTab`'s local state** — the open category, any
  inline edit buffers, sub-category rename state, scroll.

> ⚠️ **THE REFETCH IS NOT NEEDED FOR THE IMAGE TO APPEAR.** `upsert_item` at 4082 has already persisted
> `image_path`, and the slot renders `item.image_path` from `localItems`. **A one-item optimistic update
> would show it immediately** — exactly what `saveItemPatch` does at 3646.

---

## 5 · 🔴 THIS IS ONE BUG AFFECTING SEVERAL ACTIONS, NOT AN UPLOAD BUG

**Every `reload()` inside `MenuTab` (READ — 12 call sites):**

| Line | Action | Collapses an open category? |
|---|---|---|
| **3618** | Save category settings (the inline panel shown at 3987 **while expanded**) | 🔴 **YES** |
| **3940** | Category reorder | 🔴 **YES** |
| **4083** | 🔴 **Item image upload** | 🔴 **YES — the reported symptom** |
| **3764** | Delete category | Yes, but the category is gone — not a defect |
| **3509** | Import wizard completion (in a `setTimeout`) | Yes; the wizard is closing anyway |
| **5946 / 5951 / 5956** | Walkthrough choice now/later/never | Yes; end of a flow |
| **3689** | Add item — **fallback branch only** | ⚠️ **NO — it is already worked around** |
| 6313 / 6320 | DealsTab | Different tab |

### 🔴 THE STRONGEST EVIDENCE THAT THIS IS KNOWN — line 3689

```
setEditingItem(null); await reload(); if (catId) handleExpandCat(catId)
```

**Someone already hit this on the add-item path and patched around it by re-expanding after the
reload.** **The image slot never got the same treatment.**

**And the codebase already states the general lesson.** `MenuTab`'s sibling tab, **6136-6140**:

> *"This tab is conditionally rendered → it UNMOUNTS on tab switch, which previously destroyed a local
> optimistic copy… The parent does NOT unmount, so writing optimistically to the parent here (**no
> reload(), no spinner**) keeps every create/edit/delete alive."*

**Meanwhile the item-level actions sitting in the same list row are all already optimistic and none of
them collapse anything:**

| Action | Line | Pattern |
|---|---|---|
| Toggle availability | **3770-3779** | `setLocalItems` + rollback ✅ |
| Delete item | **3781-3790** | `setLocalItems` + rollback ✅ |
| Any edit-modal field | **3640-3649** | `setLocalItems` + rollback ✅ |
| 🔴 **Image upload (inline)** | **4077-4086** | **`reload()`** ❌ |

> **The image slot is the ONLY item-level action in this list that refetches. It is the outlier, not the
> rule.**

---

## 6 · Drag and drop — what exists today

**What renders each slot:** `app/manage/[token]/page.tsx:4072-4087`, **inline JSX inside two nested
`.map()` calls** — `groupBySubcategory(...).map(group => …)` (**4066**) then `group.items.map(item => …)`
(**4069**).

**Drop handling already exists and is generic.** `lib/useDragDrop.ts` (64 lines, READ in full):

```ts
export function useDragDrop(onFileDrop: (file: File) => void, accept?: string[])
  → { isDragging, dragProps: { onDragEnter, onDragLeave, onDragOver, onDrop } }
```

It handles the enter/leave counter correctly (`dragCounter`, 5/10/19), calls `preventDefault` on all
four, and filters by an accept list (41-50). **Four existing call sites to follow as a pattern:**

| Site | Use |
|---|---|
| `components/menu/MenuUploadFields.tsx:51` | Menu import — the shared control |
| `app/manage/[token]/page.tsx:2215` | Allergen card upload |
| `app/manage/[token]/page.tsx:6718` | Schedule tab |

### Can the upload be called with a `File` from a drop event, as it stands?

| | |
|---|---|
| `get_upload_url` (`app/api/manage/route.ts:1430`) | ✅ **Item-agnostic** — takes `filename` + `content_type` only |
| **Slot B's `uploadItemPhoto(file: File)`** (3537) | ✅ **Already takes a `File`** — ⚠️ but is coupled to the modal: `if (!editingItem) return` (**3538**) |
| 🔴 **Slot A's handler** (4077) | ❌ **Coupled to the input element.** It is an inline arrow reading `e.target.files?.[0]`; there is **no named function to call** |

### 🔴 THE STRUCTURAL BLOCKER

**`useDragDrop` is a hook, and hooks cannot be called inside a `.map()` callback.** Each slot needs its
own `isDragging`, so **the slot must be extracted into its own component** — one `useDragDrop` per
mounted slot. **This is not optional and it is the bulk of the work.**

---

## 7 · The two proposals, separately

### A · The collapse — **remove the refetch, do not preserve the state**

**Change `4083` from `reload()` to the optimistic update the same file already uses everywhere else:**

```
setLocalItems(prev => prev.map(i => i.id === item.id ? { ...i, image_path: path } : i))
```

**Why this one and not the alternatives:**

| Option | Verdict |
|---|---|
| **Optimistic `setLocalItems`** | ✅ **Recommended.** Matches 3646 / 3772 / 3784. Fixes collapse **and** scroll. Smallest diff |
| Re-expand after reload — copy 3689 | ⚠️ Works for the collapse, **does not fix scroll**, and keeps a full refetch for a one-field change |
| Lift `expandedCat` to the page component | ⚠️ Survives the unmount, **but the scroll and every other local state still die** |
| Remove the `loading` gate at 548 | 🔴 **Fixes the whole class — and is the largest blast radius on this screen.** Worth doing, **separately and deliberately**, not inside an image-upload fix |

⚠️ **Rollback is needed for symmetry** — `upsert_item` at 4082 can fail after the PUT succeeds. Follow
3648: keep `prevLocal`, restore on error.
⚠️ **The toast at 4084 currently fires only on success.** Do not move it above the `api` call.

### B · Drag and drop — **extract the slot into a component**

1. New `ItemImageSlot({ item, onUploaded })` — the JSX now at 4072-4087.
2. Inside it: `const { isDragging, dragProps } = useDragDrop(f => upload(f), ['image/*'])`.
3. Lift the upload body out of the inline arrow into `uploadItemImage(item, file)`, so **both** the
   `<input onChange>` and the drop handler call one function. **This is the change that decouples it
   from the input element.**
4. Spread `{...dragProps}` on the `<label>`; use `isDragging` for the affordance, as
   `MenuUploadFields.tsx:59` does.

### 🔴 DOES B DEPEND ON A?

> **YES, and building B first would ship the bug twice.**

**The drop handler would call the same body that ends in `reload()` at 4083. A drop would collapse the
category exactly as the file picker does** — and worse, because the operator's pointer is over the slot
rather than in a file dialog, so the jump is more jarring. ⚠️ **Land A first. B then inherits the
correct behaviour for free**, because both entry points call the one extracted function.

---

## 8 · Risk, and what must be verified where

🔴 **This is a live operator surface. Pizzeria Gusto is a trading truck and uses this screen to manage a
real menu.**

| Change | Risk |
|---|---|
| **A — optimistic image update** | **Low.** One call site, a pattern used three times in the same component. 🔴 **The real risk is silent divergence: if `upsert_item` fails after the PUT, the slot would show an image the server does not have.** The rollback closes it |
| **B — extracting the slot** | **Medium.** It moves JSX out of a 12,972-line render inside two nested maps. 🔴 **A wrong `key`, or reading `item` from a stale closure, would put the WRONG IMAGE ON THE WRONG DISH** — a customer-visible error on a live menu |
| Removing the 548 gate | 🔴 **High, screen-wide.** Not in scope here |

### Must be verified on a real device (iPad, the operator's actual tool)

- 🔴 **That the category stays open and the scroll holds** — the whole point, and **not observable from a
  typecheck or a laptop resize**.
- 🔴 **That tap-to-upload still opens the picker after `dragProps` are added.** `onDragOver`/`onDrop`
  call `preventDefault` (26-27, 31); **on a touch device the `<label>`→`sr-only input` relationship is
  what makes the tap work, and that must be re-checked, not assumed.**
- **A slow/flaky connection** — the PUT at 4081 has **no timeout** (READ), consistent with the read-path
  finding in the manual. An optimistic update plus a hung PUT shows an image that may never land.

### Verifiable on a laptop

- Drag-and-drop itself (**there is no drag on iPadOS Safari for this case**), the accept-list filter, and
  the rollback path with the network throttled or the API forced to fail.

---

## What I could not establish

1. 🔴 **That any of this actually happens at runtime.** **Everything is a source read.** The chain
   4083 → 325 → 548 → remount is complete and unbroken in the source, **but I did not watch a category
   collapse.**
2. **Whether the operator's report is Slot A or Slot B.** **I inferred Slot A** because Slot B is inside
   a modal and cannot collapse a category behind it. ⚠️ **If the collapse happens after closing the edit
   modal, the cause is at 3689's sibling paths, not 4083.**
3. **The toast wording discrepancy** — `'Photo updated'` vs your *"photo uploaded"*. Noted at the top.
4. **Whether `MenuTab` also remounts for reasons other than line 548** — I confirmed **no `key`** at 754
   and no `setExpandedCat(null)` anywhere. **I did not audit all 12,972 lines for a conditional wrapper
   above it.**
