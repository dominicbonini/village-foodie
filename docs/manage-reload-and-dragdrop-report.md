# Manage — the refresh split, the staleness bar, and drag-and-drop on every image slot

**Built. NOT deployed, NOT committed. No SQL, no migrations.**
**Changed: `app/manage/[token]/page.tsx` (+105 −35). New: `components/manage/ImageDropSlot.tsx`.**

---

## VERIFICATION

**EXECUTION, and 🔴 I must be precise about WHAT was executed.**

| | |
|---|---|
| **The collapse mechanism** | ✅ **MEASURED IN A BROWSER** (puppeteer, React 18 UMD) — §"The measurement" |
| 🔴 **The real manage screen** | ❌ **COULD NOT BE MEASURED.** `proxy.ts:305` protects `/manage` behind a Supabase session. I stubbed `/api/manage` and navigated to `/manage/harnesstoken`; **the proxy served the login page — 0 calls reached the stub.** I have no credentials and will not invent any |
| Typecheck | `npx tsc --noEmit` clean — **SANITY ONLY, not verification.** It caught **two real errors I introduced**, one of them serious (§4) |

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 1 · The initial-load / refresh split

**`load` is now `load(silent = false)`; `setLoading` is called only when `!silent`.** A new zero-argument
`refresh = useCallback(() => { void load(true) }, [load])` is what the tabs receive.

🔴 **`reload={refresh}`, never `reload={load}`.** If a call site ever became `onClick={reload}` the
`MouseEvent` would land in `silent` and coerce to `true` by accident. **A dedicated wrapper makes that
unexpressible.** (Every current call site is `reload()` with no arguments — this is prevention.)

**The initial load is untouched:** `useEffect(() => { void load() }, [load])` still spinners, because the
gate protects exactly one moment — the first load, when `truck` is null and `MenuTab` would dereference
`truck.plan`.

### Which pattern, and where it came from

> ⚠️ **HONEST ANSWER: THE MIGRATED TABS DO NOT USE A SPLIT. THERE WAS NO EXISTING PATTERN TO COPY.**

Schedule, Settings and Team did not make `reload()` safe — **they stopped calling it.** They patch the
parent optimistically via `onItemsPatch` / `onCategoriesPatch` / `onTruckUpdate`, the **§23 "iPhone"
rule**, and the file states it four times (`:8717`, `:8831`, `:9307`, `:9325` — *"NO reload() (reload→
Spinner→unmounts this tab, the §23 'iPhone' violation)"*). The manual carries it as a standing rule.

**So I did both, and did not invent a third thing:**

- **The split** is the general fix underneath that migration, for the ten callers MenuTab and DealsTab
  have not converted. **I searched for an existing silent-refresh flag before writing one — there is
  none in either page.**
- **Where I touched a call site** (the inline upload, §6) I used **the §23 pattern the file already
  uses** — optimistic `setLocalItems` + rollback, the shape of `toggleItem` (`:3770`),
  `confirmDeleteItem` (`:3781`) and `saveItemPatch` (`:3640`).

---

## 2 · 🔴 The staleness bar — a condition of shipping, and it is in

**What shows:** a standing amber bar above the tab content, `staleBar`, rendered whenever
`refreshFailedAt` is set.

**When it sets:** in `load`'s `catch`, **only when `silent`** — a failed *initial* load still takes the
existing error path.
**When it clears:** on the next successful load (`setRefreshFailedAt(null)` alongside
`setLastLoadedAt(new Date())`). 🔴 **Not by time, not by a tap, and it does not fade.** A toast that
disappears is exactly the mechanism that lets out-of-date data pass as current.

### The wording — proposed, for your approval

> **Couldn't refresh. Showing what was saved at 14:32. Changes you make are still saved.**

**Written to the `OfflineBanner.tsx` conventions:** no "server", no "sync", no "retry", no status codes.

- **"Couldn't refresh"** — what happened.
- **"Showing what was saved at 14:32"** — 🔴 **the operative half.** It names a **time**, not an age:
  *"14:32"* is something an operator can judge against their own day; *"3 minutes ago"* is arithmetic.
  The time is omitted entirely if no load has ever succeeded, rather than printing a guess.
- **"Changes you make are still saved"** — true, and the thing they most need to know: writes go through
  `api()` independently of this refetch, so the bar must not read as "the screen is frozen".

⚠️ **It is in the code as working text so the path renders. Say the word and I will change it.**

---

## 3 · The workaround at 3689 — left alone

✅ **Untouched.** Now at **`:3757`**, byte-identical:
`setEditingItem(null); await reload(); if (catId) handleExpandCat(catId)`.
**Line 3753's sibling calls `handleExpandCat` on the success path where there is no reload at all**,
which is what established it reveals the new item's category rather than repairing a collapse.

---

## 4 · The dead `reload` props — removed, and it was NOT a clean no-op

**Removed from `ScheduleTab`, `SettingsTab` and `TeamTab`** — prop type, destructured signature and call
site. Verified dead first: in all three the **only** non-comment mention of `reload` was the type
declaration itself.

> 🔴 **BUT THE REMOVAL WAS NOT SAFE AS I FIRST WROTE IT, AND THE TYPECHECK CAUGHT IT.**
> The prop-type line `api: (…) => Promise<any>; reload: () => void; showToast: ShowToast` is **byte-
> identical in SIX components**, so a global replace also stripped `reload` from **MenuTab, ModifiersTab
> and DealsTab — which use it.** Restored by walking the file and matching each line to the function that
> precedes it. **Reported because "if it is genuinely a no-op" was the condition, and the first attempt
> was not.**

---

## 5 · Every `reload()` caller

**Ten real call sites (the other eight `reload` hits in the file are comments). All now reach `refresh`,
so none unmounts the tree.**

| Line | Action | Expansion | Scroll | Open modal |
|---|---|---|---|---|
| **3686** | Save category settings | ✅ kept | ✅ kept | ✅ the inline panel stays |
| **4008** | Category reorder | ✅ kept | ✅ kept | n/a |
| **3832** | Delete category | ✅ kept | ✅ kept | n/a |
| **3757** | Add item — fallback branch | ✅ kept **and re-expanded** (§3) | ✅ kept | closes deliberately |
| **3551** | Import wizard commit (2500ms timeout) | ✅ kept | ✅ kept | `resetImportState()` closes it deliberately |
| **6012 / 6017 / 6022** | Walkthrough now / later / never | ✅ kept | ✅ kept | closes deliberately |
| **6379 / 6386** | DealsTab save / delete | ✅ kept | ✅ kept | ✅ |
| ~~4083~~ | 🔴 **Item image upload — the reported symptom** | **GONE** — no longer calls `reload()` at all (§6) | | |

⚠️ **"Kept" is a claim about the mechanism, measured in the reproduction below — NOT observed on the real
screen**, which I could not authenticate to.

---

## 6 · 🔴 Every photo path — there are FOUR, not two

**Enumerated by `get_upload_url` call sites, not by looking where I expected them.**

| # | Path | Line | Optimistic? | `reload()`? | Collapse affected it? | Takes a `File`? |
|---|---|---|---|---|---|---|
| **P1** | **Edit modal** — `uploadItemPhoto` | `:3578` | ✅ **Yes** → `saveItemPatch` | ❌ No | ❌ **No** | ✅ Yes |
| **P2** | 🔴 **Inline slot** in the expanded list | `:4118` | ❌ No | 🔴 **Yes** | 🔴 **Yes** | ❌ **Coupled to the input** |
| **P3** | **Truck logo** — `uploadLogo` (Settings) | `:9211` | ✅ **Yes** → `setForm` before the write | ❌ No | ❌ No | ✅ Yes |
| **P4** | Allergen card — `handleAllergenUploadAndProcess` | `:3599` | n/a — feeds a wizard, not a slot | ❌ No | ❌ No | ✅ Yes |

### What made the modal different — confirmed

**`uploadItemPhoto` (`:3578-3588`) ends in `await saveItemPatch({ image_path: path })`**, and
`saveItemPatch` (`:3640-3649`) is optimistic with rollback: snapshot `localItems`, patch, write, revert
on error. **No refetch, no spinner, no remount.** ✅ **It was already correct before any of this work,
and P3 independently is too.** **P2 was the only outlier**, and it was the only one that also had no
named function.

### The fix to P2

**`uploadItemImage(item, file)`** — a named function both entry points call. Optimistic
`setLocalItems` + rollback, **and `reload()` is gone**.

⚠️ **It now sends a FULL-OBJECT upsert, not the sparse `{ id, image_path }` it used to.**
`saveItemPatch`'s own comment records why: *"upsert_item coerces absent fields to null/default"* — **the
sparse write was silently blanking the rest of the row.** **A behaviour fix riding along, stated rather
than buried.**

---

## 7 · Drag and drop on every image slot

**New `components/manage/ImageDropSlot.tsx`** — a presentational tap-or-drop slot wrapping the existing
`useDragDrop` hook (`lib/useDragDrop.ts`, already used by `MenuUploadFields`, the allergen upload and the
Schedule tab).

**Wired to all three image slots:** **P2** (inline, 40px thumbnail), **P1** (edit modal), **P3** (logo).
**P4 is left alone** — it is a document dropzone that also accepts PDFs and already has its own drag
handling.

### Could the existing upload take a `File` from a drop event?

| | |
|---|---|
| **P1 `uploadItemPhoto(file: File)`** | ✅ **Yes, unchanged** — it already took a File |
| **P3 `uploadLogo(file: File)`** | ✅ **Yes, unchanged** |
| 🔴 **P2** | ❌ **NO.** It was an inline arrow reading `e.target.files?.[0]` — **there was no function for a drop to call.** Extracting `uploadItemImage` is what made drop possible at all |

### The structural reason this needed a component

🔴 **Hooks cannot be called inside the `.map()` that renders the item list.** Each slot needs its own
`isDragging`, so the inline slot had to become a component before it could accept a drop. **That is the
bulk of the work, not the drop handler itself.**

**One control, one upload call per slot** — so the drop path and the tap path are byte-identical after
`onFile`, and the failure mode where one entry point quietly gains a fix the other misses cannot happen.
⚠️ `e.target.value = ''` after a tap, so **re-selecting the same file fires `onChange` again**.

---

## 8 · Does drag-and-drop depend on Part One?

> 🔴 **FOR P2, YES — AND BUILDING IT FIRST WOULD HAVE SHIPPED THE BUG TWICE.**

The drop handler calls the same body the tap handler does. Before Part One that body ended in
`reload()`, so **a drop would have collapsed the category exactly as the file picker did — and worse**,
because the operator's pointer is over the slot rather than in a file dialog, so the jump is more
jarring. **Order: Part One, then P2's extraction, then the drop wiring.** That is the order built.

**P1 and P3 did not depend on it** — both were already optimistic. Their drop support could have shipped
any time.

---

## The measurement

🔴 **WHAT THIS IS: a faithful reproduction of the gate's SHAPE — a parent with
`if (loading) return <Spinner/>` and a child holding `expandedCat` in `useState`, in a real browser, with
the two `load` variants differing ONLY in whether a refresh sets `loading`.**
🔴 **WHAT IT IS NOT: the real `MenuTab`.** `proxy.ts:305` put that out of reach (see VERIFICATION).

**Method:** expand category `c2`, scroll to y=600, fire the refetch, re-read.

```
BEFORE  reload() — unconditional spinner
  expanded: "c2" -> null   category still open: NO    🔴 COLLAPSED
  scrollY : 600  -> 0                                 🔴 SCROLL LOST

AFTER   refresh() — silent
  expanded: "c2" -> "c2"   category still open: YES   PASS
  scrollY : 600  -> 600                               PASS
```

> ✅ **The failing case is shown failing**, which is what makes the passing case worth anything. **It
> proves the mechanism and that the split addresses it. It does not prove the real screen behaves the
> same — T1 below does.**

---

## 9 · Risk, and what must be verified where

| Change | Risk on a live operator surface |
|---|---|
| **The split** | 🔴 **Screen-wide — every action on Manage changes behaviour.** A modal, the import wizard and inline edits now SURVIVE a refresh where they used to be wiped. **Intended, but it is the largest blast radius here** |
| **Removing dead props** | **Low, and it already bit once** (§4). Typecheck-verifiable |
| **P2 optimistic + full-object upsert** | **Medium.** The payload changes shape — a full row instead of two fields. **The sparse write was blanking fields, so this is a fix, but it is a WRITE change on a live menu** |
| **`ImageDropSlot`** | **Medium.** It replaces three working `<label>`+`<input>` pairs. 🔴 **The risk is the TAP path**: `onDragOver`/`onDrop` call `preventDefault`, and the label→input relationship is what makes tap work on a touch device |
| **The staleness bar** | Low — additive |

### Must be on the physical tablet

| # | Test | Pass condition |
|---|---|---|
| 🔴 **T1** | **The real thing.** Expand a category, scroll into it, upload a photo to an item | 🔴 **Category still open, scroll unmoved, new image in place.** **This is what my reproduction could not settle** |
| 🔴 **T2** | **Tap still opens the picker** on all three slots after `ImageDropSlot` | Picker opens. **`preventDefault` on a touch device is the specific risk** |
| **T3** | Save category settings, and reorder categories, with a category expanded | No collapse, no scroll jump |
| **T4** | Open the edit modal, trigger a refresh from elsewhere | Modal survives and is coherent |
| **T5** | Kill the network, trigger a save | 🔴 **The amber bar appears and STAYS.** Restore the network → it clears on the next good load |
| **T6** | Upload to an item that has other fields set (allergens, stock), then reopen it | 🔴 **Nothing else was blanked** — the full-object upsert fix |
| **T7** | Both bars at arm's length in daylight | Legible |

### The laptop settled

The collapse mechanism and the fix (above), the typecheck, and that ten call sites now route through
`refresh`.

---

## What I could not establish

1. 🔴 **Anything about the real manage screen.** **`proxy.ts:305` requires a session I do not have.**
   T1 and T2 are the tests that matter and both are open.
2. **Whether drag-and-drop works at all on the tablet** — Android WebView drag support for external files
   is not something I can assume. ⚠️ **The drop path may be desktop-only in practice; the tap path is
   unchanged either way.**
3. **Whether any of the ten callers has a second dependency on the remount** I have not found. §5 is
   reasoned from the mechanism, not observed per-caller.
4. **The full-object upsert's effect on a real row** — T6.
