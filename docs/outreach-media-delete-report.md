# Media delete — DIAGNOSIS ONLY. Stop condition met; no code written.

**9 September 2026.** 🔴 **NOTHING WAS BUILT AND NO FILE WAS EDITED.** No confirmation dialog, no filter
persistence, no database write. The only file this task creates is this report.

**Your item 3 said: "IF DELETING A VALUE HERE WOULD CHANGE WHAT ANY VILLAGE FOODIE OR HATCHGRAB VISITOR
SEES FOR PIZZERIA GUSTO OR ANY OTHER LINKED TRUCK, STOP AND TELL ME BEFORE BUILDING ANYTHING." It would.**

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
	docs/outreach-media-report.md
	docs/outreach-modal-layout-report.md
	docs/outreach-table-report.md
	lib/outreach-filter.ts
```

---

## 2. 🔴 ITEM 3 — THE STOP. Deleting a PHOTO changes what visitors see for Pizzeria Gusto.

### 2.1 Which surfaces read the two columns

🧪 A repo-wide sweep for `logo_url` / `photo_url` outside admin code returns **one** public reader:
**`app/api/discovery/events/route.ts`** — the Village Foodie / HatchGrab discovery feed. ⚠️ The other hits
are false positives: `app/api/menu`, `app/trucks/[slug]/order` and `lib/basket-utils` all refer to **menu
item** photos on a different table.

**§14 is stale in BOTH directions, and here is what is true instead:**

| §14 claim | truth |
|---|---|
| the public profile `/trucks/[slug]` reads `discovery_trucks.logo_url` ONLY | 🔴 **It reads neither column.** 🧪 It does not appear in the sweep at all. |
| `resolveTruckLogo` falls back to `discovery_trucks.logo_url` | 🔴 **Already corrected earlier this session — no fallback; it returns `null`.** Order page and manage header are unaffected by these columns. |

### 2.2 🔴 The fallback that matters, and it is on the PHOTO

🔎 `app/api/discovery/events/route.ts:296-301`, the **operator-event** mapping:

```js
logoUrl: truck?.logo_storage_path
  ? `${supabaseUrl}/storage/v1/object/public/truck-media/${truck.logo_storage_path}`
  : formatImageUrl(linked.logo_url || null, 'logos'),
foodPhotoUrl: truck?.cover_image_path
  ? `${supabaseUrl}/storage/v1/object/public/truck-media/${truck.cover_image_path}`
  : formatImageUrl(linked.photo_url || null, 'photos'),
```

**The operator's own upload wins; the linked `discovery_trucks` row fills the gap when it is null.**

🔎 The gate at `:253-259` is the **operator truck's own** flags — `trucks.active`, `trucks.excluded`,
`trucks[show_on_vf|show_on_hg]` — **not** the discovery row's `excluded`. So a discovery row being
`excluded = true` does **not** keep its truck off the map when that truck is a live operator.

### 2.3 🧪 The measurement

| truck | passes gate | `cover_image_path` | discovery `photo_url` | future events | photo source today |
|---|---|---|---|---|---|
| 🔴 **Pizzeria Gusto** | **yes** (active, not excluded, vf ✔ hg ✔) | 🔴 **NULL** | **SET** | **1** | 🔴 **`discovery_trucks.photo_url`** |
| Real Thai Food | yes (vf ✔ hg ✔) | 🔴 NULL | SET | 0 | discovery row — **no live event today** |
| Tikka Tonic | yes (vf ✔) | 🔴 NULL | SET | 0 | discovery row — **no live event today** |
| Test Kitchen | no (vf ✘ hg ✘) | NULL | null | — | not public |

🔴 **Pizzeria Gusto has one future event on the map right now, no `cover_image_path`, and a populated
discovery `photo_url`. Deleting that photo from the outreach modal would remove the food photo every
Village Foodie and HatchGrab visitor sees for that event.**

⚠️ **Real Thai Food and Tikka Tonic are wired identically and are one event away from the same exposure.**

✅ **The LOGO side is safe for all three** — Gusto, Real Thai Food and Tikka Tonic each have
`logo_storage_path` SET, so their map logo comes from the operator upload and ignores the discovery column.
**The danger is specific to the photo.**

### 2.4 What I need from you

The delete control **already exists and already works** — it shipped last task. **This is not a
hypothetical about code I am about to write; it is a live capability.** Options as I see them:

1. **Refuse the delete server-side for linked trucks whose fallback is live** — i.e. `delete_media` returns
   409 when the row has a `hatchgrab_truck_id` whose operator truck passes the visibility gate and has no
   `cover_image_path`. Safest; needs a route change (this brief forbids one, so I am asking).
2. **Warn in the confirmation dialog** — build the dialog as briefed but have it say, for those rows,
   "this photo is currently shown on the public map for <truck>". Honest, but still one click from removal.
3. **Accept it** — it is your data and your map, and you are the only user.

**I did not choose. Nothing was built.**

---

## 3. ITEM 1 — THE DELETE BUTTON IS NOT A DEFECT

🧪 Extracted from source, `ModalThumb`:

| state | renders the ✕ badge |
|---|---|
| **PRESENT** (`src && !broken`) | **YES** |
| **BROKEN** (`src && broken`) | **YES** |
| **EMPTY** (fallthrough) | **NO** |

✅ **So the button vanishing after a successful delete is CORRECT.** The value became null, the slot became
the empty state, and an empty slot has nothing to delete — it is a drop target instead. **I have not
changed it.**

✅ **And it does reappear when a value is restored.** 🧪 The reset effect keys on **`value`**
(`useEffect(… , [value])`), so a new value clears `broken`/`confirming` and `src` becomes truthy again,
which re-enters the PRESENT branch and renders the badge. **No bug found; nothing to fix.**

---

## 4. ITEM 2 — WHAT `delete_media` ACTUALLY DOES

⚠️ **Correction to the brief: this IS described in a report in this series** — `outreach-media-build-report.md`
§6b, added at the end of the modal task in which I built it. It is not undocumented.

🔎 From source, `app/api/admin/outreach/route.ts`:

| | |
|---|---|
| **gate** | `verifyAdmin` at the top of `POST` (404 to a non-admin), **service-role** client |
| **nulls the column** | ✅ always — `.update({ [column]: null })`, **before** touching any file |
| **removes the object** | ✅ **only when the path is provably ours**: `firstSeg === truckId \|\| firstSeg === 'discovery-logos'` |
| **the 186 static `/logos/` rows** | ✅ handled — the value is not a `truck-media` URL, so the column clears and **the file is never touched** (a function cannot delete a file in `public/` anyway) |
| **foreign folders** | ✅ refused and logged — e.g. `Test Kitchen`'s value sits under `test-truck/`, an **operator truck's own folder** |
| **refuses** | a missing prospect (404), an invalid column (400); a already-empty column is a no-op returning `alreadyEmpty` |

🔴 **REVERSIBILITY — the answer your dialog must state.** It depends on the row:

- **`discovery-logos/…` or an upload from this surface** → the object **is deleted from storage**.
  🔴 **NOT reversible. There is no restore and no undo.**
- **`/logos/…` or `/photos/…`** (🧪 the majority) → only the column clears; the file stays in the repo, so
  the value could be typed back. **Reversible in practice, but not by any control that exists.**
- **A foreign folder** (e.g. `test-truck/…`) → column clears, file untouched. Same as above.

⚠️ **So a single reassuring sentence would be false for some rows and true for others.** A truthful dialog
has to either say the strict thing ("this cannot be undone") or vary its wording by row — which is a
decision for you, and is why I have not written it.

---

## 5. ⚠️ THE FILTER-PERSISTENCE REQUEST CONTRADICTS A CONSTRAINT IN THE SAME BRIEF

- **Trailing request:** *"i want the filter to save its last setting so if i go back the settings are
  already populated when i go in"*.
- **Constraints block:** *"Do not touch the filters, the chips, the inline phone/email fields or any other
  write path. The filter work is signed off and must not move."*

⚠️ **Persisting the selected values would mean changing how `filter` state is initialised in
`OutreachPanel.tsx` — which is touching the filters.** It would not change `matchesOutreachFilter`, the
chips, or any control, so the two may well be reconcilable — but **you told me to stop and ask rather than
choose when instructions conflict, so I have.**

**If you confirm, the shape I would build:** persist the `OutreachFilterState` object to `localStorage` on
change and seed `useState` from it on mount, with the stored value **validated against the known keys and
option values** before use (a stale or hand-edited entry must not put the page in an unreachable state) and
falling back to `EMPTY_OUTREACH_FILTER`. **No predicate change, no chip change, no control change.**
⚠️ One consequence worth deciding: the page would no longer open showing all 231 trucks — it would open
filtered, which is the point, but it is a change in what "opening the page" means.

---

## 6. EVIDENCE CLASS

- ✅ **Executed against live data:** every figure in §2.3 — the gate flags, `cover_image_path` NULL on all
  three, the discovery `photo_url` values, and Gusto's **1** future `truck_event`, all re-derived today.
  🧪 The anon/public reachability of the feed was not re-tested here; the gate was read from source.
- ✅ **Structural, extracted from source:** §3 (the three render branches and the effect's `[value]` dep),
  §4 (every row of the `delete_media` table), §2.1 (the sweep and its false positives), §2.2 (the fallback
  expression and the gate).
- 🔴 **NOT verified, because nothing was built or run:** no dialog exists, no deletion was attempted, no
  control was clicked. **No admin session is obtainable.** `tsc` was not run because **no file changed**.

---

## 7. THE TWO QUESTIONS

1. **Item 3 — the photo fallback.** Refuse server-side for at-risk rows, warn in the dialog, or accept it?
   **The delete already ships; this is live today, not a risk I am about to introduce.**
2. **Filter persistence vs "do not touch the filters".** Confirm and I will build it as described in §5.

**Once you answer, the confirmation dialog itself is straightforward and I will build it as briefed** —
centred above the prospect modal, naming the truck and which of logo/photo, Cancel focused on open,
Escape closing only the dialog (via a keydown listener that `stopPropagation`s before the modal's own
handler sees it), backdrop click cancelling, and a reversibility line matching whichever rule you pick.
