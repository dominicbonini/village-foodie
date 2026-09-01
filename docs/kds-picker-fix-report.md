# The KDS event picker — scroll the list, not the card

**Date:** 1 September 2026
**Diagnosis:** `docs/kds-event-picker-report.md`
**Scope:** the event-picker modal in `app/dashboard/[token]/kds/page.tsx`. Nothing else in that file, no
other file. Not committed, not deployed.

🔴 **THIS IS A SOURCE CHANGE ONLY. IT IS NOT VERIFIED BEHAVIOUR.** See §6 — nothing here has been seen
on a device.

---

## 1. The card element, before and after

**BEFORE**

```jsx
<div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
```

**AFTER**

```jsx
<div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl max-h-[85dvh] flex flex-col" onClick={e => e.stopPropagation()}>
```

| | Before | After |
|---|---|---|
| height cap | none | **`max-h-[85dvh]`** |
| layout | block | **`flex flex-col`** |
| padding | `p-5` on the card | **removed** — moved to the three children (§2) |
| click-stop | none | **`onClick={e => e.stopPropagation()}`** |

🔴 **`dvh`, NOT `vh` — the reason from the diagnosis.** `vh` resolves against the *largest* viewport and
ignores a webview's dynamic toolbars, so a `vh` cap would leave the bottom of the card under the browser
chrome on exactly the iOS and Android shells this screen runs in. `dvh` tracks the visible viewport.

⚠️ **The overlay is untouched.** Its `fixed inset-0 … items-end sm:items-center … p-4` and its dismiss
handler (`e.target === e.currentTarget`) are byte-identical — **the existing overlay dismiss behaviour
is unchanged**, as required. The new `stopPropagation` only stops a tap on the card's own padding from
reaching it, matching the dashboard picker.

## 2. The list element, before and after

**BEFORE**

```jsx
<div className="flex flex-col gap-2">
```

**AFTER**

```jsx
<div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto px-5">
```

🔴 **`min-h-0` IS LOAD-BEARING AND IS THE PART THAT IS EASY TO OMIT.** A flex child defaults to
`min-height: auto`, which refuses to shrink below its content — so `flex-1 overflow-y-auto` **alone**
would leave the card growing exactly as it does today and the fix would look applied while changing
nothing.

### Where the padding went (step 2)

`p-5` came off the card so it could not pad the *outside* of the scroll region — which would have made
rows clip against a 20px gap rather than the card edge, and left a dead strip that looks like the list
has ended. **The spacing is preserved exactly:**

| | Before | After |
|---|---|---|
| card top | `p-5` → 20px | header `pt-5` → 20px |
| header → list gap | header `mb-4` → 16px | header `pb-4` → 16px |
| left/right on every child | `p-5` → 20px | `px-5` on header, list and footer → 20px |
| list → Cancel gap | button `mt-3` → 12px | button `mt-3` → 12px (unchanged) |
| card bottom | `p-5` → 20px | footer `pb-5` → 20px |

## 3. The heading and Cancel are outside the scrolling region

**Three siblings inside the flex column; only the middle one scrolls:**

```jsx
<div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl max-h-[85dvh] flex flex-col" onClick={e => e.stopPropagation()}>

  <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">     ← PINNED header
    <h3 className="font-semibold text-slate-900">Change event</h3>
    <button onClick={() => setShowEventPicker(false)} …>×</button>
  </div>

  <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto px-5">       ← SCROLLS
    {events.map(event => { … })}
  </div>

  <div className="px-5 pb-5 shrink-0">                                            ← PINNED footer
    <button onClick={() => setShowEventPicker(false)} … >Cancel</button>
  </div>

</div>
```

✅ **`shrink-0` on both**, so a long list cannot compress the header or squeeze the Cancel button out.
**The `×` and Cancel are reachable at every scroll position** — which the previous layout could not
guarantee, since on a phone (`items-end`) the header was the first thing pushed off-screen.

## 4. Nothing else in the modal changed

**READ — the full code-only diff, three hunks:**

```diff
- <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
- <div className="flex items-center justify-between mb-4">
+ <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl max-h-[85dvh] flex flex-col" onClick={e => e.stopPropagation()}>
+ <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">

- <div className="flex flex-col gap-2">
+ <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto px-5">

- <button onClick={() => setShowEventPicker(false)} className="mt-3 w-full …">Cancel</button>
+ <div className="px-5 pb-5 shrink-0">
+   <button onClick={() => setShowEventPicker(false)} className="mt-3 w-full …">Cancel</button>
+ </div>
```

**Untouched, verbatim:**

- ✅ `switchEvent(event)` and the confirm it fires — the row's `onClick` is character-for-character the
  same.
- ✅ The `!isDemo` guard on the whole modal.
- ✅ The `●` open indicator, `isCurrent`, `dayLabel`, `localTodayIso()`, `formatTime`.
- ✅ Row classes — `py-2.5 px-3 rounded-xl border text-sm` — so **row height, font size, colours and
  spacing are unchanged.**
- ✅ `events.map` — no slice, no filter, no sort. **The query, the API route and the number of events
  fetched are untouched**, as required.

**File: 3,154 → 3,173 lines** (+19: four class/structure changes plus a 16-line comment recording the
diagnosis and the two traps — `dvh` and `min-h-0`).

⚠️ **`AddOrderPanel.tsx` was not opened.** No shared component was extracted.

## 5. Scope

🔴 **`git status` shows a dirty tree from earlier work, so it cannot prove scope on its own.** Quoted as
asked:

```
 M app/dashboard/[token]/kds/page.tsx
 M docs/reference-manual.md
?? docs/aab-currency-check-report.md
?? docs/auto-open-provenance-report.md
?? docs/kds-event-picker-report.md
?? docs/order-seeding-approach-report.md
?? docs/truck-rename-impact-report.md
```

**The proof is modification time.** Files written since a marker set at 12:00 today, when this
workstream began:

```
./app/dashboard/[token]/kds/page.tsx     ← the only source file
./docs/kds-event-picker-report.md        ← the diagnosis, from earlier today
./docs/aab-currency-check-report.md      ← earlier today
./docs/order-seeding-approach-report.md  ← earlier today
./tsconfig.tsbuildinfo                   ← the tsc cache, written by my typecheck (gitignored)
```

✅ **`components/dashboard/AddOrderPanel.tsx` — mtime `2026-08-18 22:58:49`. Untouched.**

### Typecheck and lint

- `npx tsc --noEmit` — **clean.**
- `npx eslint` on this file — **21 problems (18 errors, 3 warnings) BEFORE and AFTER, identical.**
  ⚠️ **All 18 are pre-existing** React-Compiler and `no-explicit-any` findings between lines 725 and
  1587. **I verified this rather than assuming it**, by linting a copy of the pre-edit file through a
  temporary path in the project and comparing counts. **No finding falls inside my edited range
  (2796–2839), and my change introduced none.** The probe file was removed.

## 6. 🔴 This is a source change, not a fix

**NOT VERIFIED BEHAVIOUR. Nothing here has been seen on a device, at any viewport, on any platform.**

I did not load the page, did not measure a viewport, and did not scroll the list. **What is established
is that the classes now express the intended layout and that nothing outside the modal moved.** Whether
the list actually scrolls, whether `85dvh` leaves the card comfortably inside the shells' chrome, and
whether the pinned footer reads correctly on a short phone are **all unobserved.**

⚠️ **It needs to be seen on a real device at a real viewport before it counts as fixed** — and this is
a live operator's kitchen screen, so that check is worth doing before it goes anywhere near production.

**Worth checking specifically when you do:**
1. That all 17 events are reachable, and the **last one (Test Event 28)** can be selected.
2. That the header and Cancel stay put while the list moves.
3. **Phone, where the overlay is `items-end`** — the bottom-sheet case, which had the worst behaviour.
4. That tapping a row's padding no longer dismisses the modal, and that tapping the **backdrop** still
   does.

---

**No span of this prompt arrived garbled, and no instruction contradicted another.** ⚠️ One judgement
worth naming: step 2 said to keep "visual spacing equivalent to now", which required moving `p-5` onto
three children rather than deleting it — the mapping is set out in §2 so you can check I have not
quietly changed a gap.
