# Photo-delete guard, confirmation dialog, and filter persistence

**9 September 2026.** Two files changed: `app/api/admin/outreach/route.ts` (the `delete_media` action only)
and `components/admin/OutreachPanel.tsx`. **No schema change, no migration, no new route action, nothing
installed.** Nothing staged or committed.

🔴 **NOTHING WAS RENDERED, CLICKED OR DELETED.** No admin session is obtainable. §6 separates the evidence
classes. **No deletion, refusal or dialog was exercised.**

---

## 1. `git status`, verbatim, before any edit

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   app/api/admin/outreach/route.ts
	modified:   components/admin/OutreachPanel.tsx

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	docs/outreach-filter-ux-report.md
	docs/outreach-inline-edit-report.md
	docs/outreach-media-build-report.md
	docs/outreach-media-delete-report.md
	docs/outreach-media-report.md
	docs/outreach-modal-layout-report.md
	docs/outreach-table-report.md
	lib/outreach-filter.ts
```

🧪 Scoped `git status --short` over `app/manage`, `app/order`, `app/trucks`, `app/o`, `app/api/menu`,
`app/api/discovery`, `components/dashboard`, `lib/truck-logo.ts`, `public/`, `package.json` and the
lockfile returns **nothing**. **No customer- or operator-facing surface touched.**

---

## 2. 🔴 THE SERVER-SIDE REFUSAL

### 2.1 The condition, mirrored from the feed rather than paraphrased

🔎 The discovery feed gates operator events at `app/api/discovery/events/route.ts:252-257`:

```js
if (!truck.active) return false
if (truck.excluded) return false            // master hide
if (!truck[showCol]) return false           // showCol = isHG ? 'show_on_hg' : 'show_on_vf'
```

⚠️ **`showCol` depends on which SITE is being served**, so the same row is public if it passes for
**either** — hence `show_on_vf || show_on_hg` in the guard. The refusal fires when **all** hold, every one
re-read from the database inside the request:

1. the discovery row has a `hatchgrab_truck_id`;
2. that operator truck is `active`, **not** `excluded`, and `show_on_vf || show_on_hg`;
3. `trucks.cover_image_path` **IS NULL**;
4. the column being deleted is `photo_url` and it is non-null.

🔴 **No future-event test, as instructed.** The condition is structural — *is this column the live fallback
for a publicly visible truck* — so it cannot flicker as the schedule changes.

🔴 **Nothing the client sends is trusted.** The prospect id is the only input; the truck, its flags and its
cover image are all fetched server-side.

### 2.2 The 409 wording, verbatim

> `Refused: this photo is live on the public map. {truck} is a linked HatchGrab truck with no cover image of its own, so the discovery feed renders THIS photo for its events. Deleting it would change what visitors see. Set a cover image on the operator dashboard first, or delete the logo instead.`

Body also carries `refused: 'public_photo_fallback'` and `truck: <name>` for the UI.

### 2.3 🔴 PROOF — it matches the rows it should, and NOT the rows it should not

**Failure mode first:** *a condition that never matches is indistinguishable from one that works, because
both let every delete you try succeed.* So the predicate line was **extracted verbatim from the route** and
run against every one of the 231 rows.

🧪 Re-derived today. **Refused on 3 of 231 — a proper subset, neither nothing nor everything:**

| linked truck | active | excluded | vf | hg | cover_image_path | photo_url | photo delete |
|---|---|---|---|---|---|---|---|
| 🔴 **Pizzeria Gusto** | ✔ | ✘ | ✔ | ✔ | **NULL** | SET | 🔴 **REFUSED** |
| 🔴 **Real Thai Food** | ✔ | ✘ | ✔ | ✔ | **NULL** | SET | 🔴 **REFUSED** |
| 🔴 **Tikka Tonic** | ✔ | ✘ | ✔ | ✘ | **NULL** | SET | 🔴 **REFUSED** |
| Test Kitchen | ✔ | ✘ | ✘ | ✘ | NULL | null | **allowed** — fails the gate |

- **227 unlinked rows: none refused** (they have no `hatchgrab_truck_id`, so the branch cannot fire).
- **228 of 231 photo deletes still work.** The guard is narrow.

✅ **Test Kitchen is the useful negative**: it is linked and has no cover image, but `show_on_vf` and
`show_on_hg` are both false, so it fails the gate and is correctly allowed. **A guard that ignored the gate
would have refused it too** — that row is what distinguishes the two.

### 2.4 ⚠️ Why there is no LOGO refusal — and when that would change

🧪 Re-checked with `logo_storage_path` actually selected (my first pass omitted the column and wrongly
printed NULL for all four — **the query was wrong, not the data**):

| truck | publicly visible | `logo_storage_path` | logo is a live fallback |
|---|---|---|---|
| Pizzeria Gusto | yes | **SET** | no |
| Real Thai Food | yes | **SET** | no |
| Tikka Tonic | yes | **SET** | no |
| Test Kitchen | no | NULL | no (not public) |

**No logo refusal is needed today, and none was added.** ⚠️ **But this is a DATA-dependent conclusion, not a
structural one:** if any of those three ever cleared its operator logo, `discovery_trucks.logo_url` would
become the live public source and there would be no guard. **Flagged, not built** — you scoped it out.

---

## 3. THE CONFIRMATION DIALOG

Out of the 44px thumbnail and into a centred `role="alertdialog"` above the prospect modal.

- **Names both**: *"Delete the photo for Pizzeria Gusto?"*
- 🔴 **"This cannot be undone."** — the strict line, no per-row variation, as instructed.
- **Cancel is focused on open** (`cancelRef.current?.focus()`), so Enter or Space does the harmless thing.
- **Backdrop click cancels**; the panel stops propagation so a click inside does not.
- **Nothing is deleted without pressing the red confirm.**

### 3.1 🔴 How Escape is stopped from closing the prospect modal

🔎 The modal listens with `window.addEventListener('keydown', onKey)` — **bubble phase at window**. The
dialog listens on the **same target with `{ capture: true }`**. The capture phase at `window` runs **before
any bubble-phase listener on window, regardless of registration order**, so the dialog always sees Escape
first and calls `stopPropagation()`, ending the event before the modal's listener is reached.

⚠️ **Registration order is deliberately not relied on** — two bubble listeners on `window` would be a coin
toss decided by mount order.

### 3.2 🔴 The 409 is surfaced in place

`deleteMedia` throws `new Error(data?.error)` on a non-OK response; the dialog catches it and renders **the
route's own sentence verbatim** in a red panel inside the dialog, leaving it open. **Not a generic
"failed", not a silent close.** ⚠️ This is the path least likely to ever be exercised — it fires only for
three rows — which is exactly why it renders the real reason rather than a toast.

---

## 4. FILTER PERSISTENCE

Persisted to `localStorage` under `hg.outreach.filter.v1`; restored on mount; **validated before use**.

🔴 **`FILTER_CONTROLS` is the authority** — the same array the bar and the chips render from — so a stored
value can only survive if a control could actually have produced it. **Missing keys** fall back to their
default (a blob written before a filter existed stays usable); an **unknown key or an illegal value
rejects the whole object** and the blob is deleted so it is not re-read every load.

### 4.1 🔴 Restored in an effect, NOT in the `useState` initialiser

This is a `'use client'` component, but Next still renders it on the **server** for the initial HTML.
Reading `localStorage` in the initialiser would throw there, and seeding from it would make server and
client markup disagree. Restoring after mount costs one extra render and avoids both.

⚠️ **`restored` is state, not a ref, on purpose.** A ref set inside the restore effect would already be
true when the persist effect ran **later in the same commit**, writing the empty default over the stored
value before the restore had landed.

### 4.2 PROOF — both directions

**Failure mode:** *"always returns null" (nothing ever restores) and "always returns the input" (no
validation) each look correct if only one direction is tested.* The validator was **extracted verbatim
from source** and run on 11 blobs — **11/11 pass**:

| accepted | rejected |
|---|---|
| a full legal blob | unknown key (`bogusFilter`) |
| a partial blob (missing → defaults) | illegal value (`logo: 'maybe'`) |
| `{}` | a legal value on the **wrong** key (`stage: 'yes'`) |
| | non-string value, non-string search, `[]`, `null`, a bare string |

**8 rejects rule out "always accepts"; 3 accepts rule out "always rejects".**

### 4.3 ✅ CHIPS ON LOAD — confirmed specifically

The chips are gated on `isFilterActive(filter)`. 🧪 A restored non-default filter differs from
`EMPTY_OUTREACH_FILTER`, so `isFilterActive` is **true on the first render after restore** and the chips —
and the "n of N trucks" count — render **without any interaction**. **A restored filter can never open a
silently-shortened list with nothing saying why.** ⚠️ **Structural, from source; not observed.**

---

## 5. STYLING — checked that it can TAKE EFFECT, not that it is written

Applying both inertness findings from this session:

- 🧪 **The unlayered `!important` rule in `globals.css` targets `input[type=…]`, `select` and `textarea`.**
  The dialog contains **none of those** — only `button`s and text — so **it cannot reach the dialog**.
- 🧪 **Centring uses `flex items-center justify-center` on the backdrop**, which centres any child whatever
  its `display`. **`text-center` is not used anywhere in the dialog** — the mechanism that could not centre
  a block-level child is deliberately absent.
- 🧪 **Stacking: modal `z-50` < toast `z-[60]` < dialog `z-[70]`**, so the dialog paints above both.
  ⚠️ `z-[70]` is an arbitrary Tailwind value; it is present in source and generated on demand, but **I
  could not confirm it in the built CSS — the `.next` tree is a stale production build**.

---

## 6. EVIDENCE CLASS

- ✅ **Compiler-confirmed:** `npx tsc --noEmit` → **0 errors**. ⚠️ **No `next build`** — your dev server is
  live and I have already written production output into its `.next` five times this session.
- ✅ **Executed against real data:** §2.3 (the refusal over all 231 rows, predicate extracted verbatim),
  §2.4 (the logo re-check), §4.2 (11 validator cases). All figures re-derived today.
- ✅ **Structural, extracted from source:** the 20 checks behind §2–§5, the mirrored gate, the capture-phase
  listener, the chips-on-load reasoning, the styling checks in §5.
- 🔴 **Reasoned only, NOT OBSERVED:** that the dialog opens and looks right, that Cancel really holds focus,
  that Escape behaves as analysed in a browser, that the 409 renders legibly, and that a restored filter
  paints chips on load. **No control was clicked and no deletion or refusal was exercised.**

---

## 7. NOT TOUCHED

`update_prospect`, `log_contact`, `delete_contact`; the inline phone/email fields; the media upload path;
`matchesOutreachFilter`, the chips and every filter control; the modal layout beyond adding the dialog.
