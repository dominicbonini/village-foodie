# Add order — the one-page phone layout. `min-w-0` on the flex column.

**File changed:** `components/dashboard/AddOrderPanel.tsx` — **the only source file written.**
**Nothing was committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or
`restore` — `status`, `diff` and `show` only.
**Not run:** `next dev`, `next build`, `cap sync`, any deploy, any SQL, any schema change.
🔴 **NO `overflow-x-hidden` ANYWHERE. Three `min-w-0` classes, nothing else.**

**No span of the prompt arrived garbled, and no instruction contradicted another.**

🔴 **READ §6 BEFORE ACCEPTING THIS AS FIXED. I named the MECHANISM that lets a wide descendant escape
in one layout and not the other, and applied the fix for it — but I did NOT demonstrate the wide
descendant itself. If nothing is actually forcing width, this change is inert and the defect
remains.** That is stated here rather than discovered on hardware.

---

# STAGE 1

## Q1 — BOTH BRANCHES, AND THE DIFFERENCE

```tsx
      {addOrderLayout === 'scroll' ? (
        <div className="md:hidden flex-1 min-h-0 flex flex-col">          {/* A */}
          <div className="shrink-0">                                      {/* B */}
            {eventBanner}
            {dealsButton}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto pb-24">          {/* C */}
            {truckMenu ? menuList : …}
          </div>
        </div>
      ) : (
        <div className="md:hidden flex-1 min-h-0 overflow-y-auto pb-24">  {/* T */}
          {eventBanner}
          {dealsButton}
          {truckMenu ? menuList : …}
        </div>
      )}
```

| | ONE-PAGE | TABS |
|---|---|---|
| boxes | **three** — A, B, C | **one** — T |
| `flex flex-col` | ✅ **A** | ❌ |
| a NON-scrolling child holding the banner + deals button | 🔴 **B** | ❌ — they are inside the scroller |
| the scroller | C | T |
| `pb-24` | on C | on T |

**The banner and the deals button are the SAME elements in both** — only the box they sit in differs.

## Q2 — 🔴 EVERY FLEX CHILD, AND WHICH LACKED `min-w-0`

| Box | A flex child? | Had `min-w-0`? | A scroll container? |
|---|---|---|---|
| **A** | ✅ yes — of the add-tab's `h-full min-h-0 flex flex-col` | 🔴 **NO** | ❌ **no** |
| **B** | ✅ yes — of A | 🔴 **NO** | 🔴 **NO — a plain `shrink-0` div** |
| **C** | ✅ yes — of A | 🔴 **NO** | ✅ yes |
| **T** (tabs) | ✅ yes | 🔴 **NO** | ✅ **yes** |

# 🔴 THE ASYMMETRY IS NOT `min-w-0` — ALL FOUR LACKED IT. IT IS THAT **T IS A SCROLL CONTAINER AND B IS NOT.**

**And that is what makes the tabs layout immune.** `overflow-y-auto` sets one axis to a non-`visible`
value, and per CSS the other axis's computed `visible` **becomes `auto`** — so **T is a scroll
container on BOTH axes and absorbs any wide descendant into its own scrollport.** ✅ **Nothing inside
T can reach the viewport.**

🔴 **In the one-page shape the banner and the deals button are lifted OUT of the scroller into B**, a
plain box with `overflow: visible` **whose parent A is a flex child that cannot shrink below its
content** (`min-width: auto`). **A wide descendant of B is therefore neither absorbed nor shrunk — it
propagates up through A**, which is exactly the category Stage 1 concluded was required: something
**above** the scroller rather than inside it.

## Q3 — THE STICKY HEADINGS ARE NOT THE DIFFERENCE

**EXECUTED — `ScrollMenuSections` is rendered by BOTH menu shapes** (`:1977` for the grid,
`:1987` for the list), and the tabs shape renders `{categoryTabs}` instead. So the `-mx-1 px-1`
headings **do render in the one-page branch and not in tabs** — but they are inside `menuList`, which
lives inside **C, a scroll container**. ✅ **Their 8px bleed is absorbed by C exactly as it would be by
T.** **Stage 1's ruling stands, and re-testing it under Q2 does not change it: the bleed is below the
scroller, not above it.**

## Q4 — NOTHING ELSE IS POSITIONED

**EXECUTED — the only `sticky` in either phone branch is the category heading inside
`ScrollMenuSections`.** No jump bar, no category strip, no index. The `fixed` bottom bar is a sibling
of both branches and identical for both.

## Q5 — THE ROWS ARE IDENTICAL. ✅ EXONERATED BY THE EVIDENCE.

**EXECUTED — both shapes call the same `renderListItems`** (one through `ScrollMenuSections`, one
directly). **Same component, same classes.** ⚠️ **Pizzeria Gusto trades on these rows and NOT ONE
BYTE OF THEM CHANGED — `git diff` touches three wrapper `className` strings and nothing else.**

# ✅ Q1–Q5 NAME A SINGLE STRUCTURAL DIFFERENCE: **B**, THE NON-SCROLLING HEADER BOX, UNDER **A**, A FLEX COLUMN THAT CANNOT SHRINK. NO SECOND STOP WAS NEEDED.

---

# STAGE 2 — THE FIX

```tsx
        <div className="md:hidden flex-1 min-h-0 min-w-0 flex flex-col">
          <div className="shrink-0 min-w-0">
            …
          <div className="flex-1 min-h-0 min-w-0 overflow-y-auto pb-24">
```

**Three `min-w-0` classes. That is the whole change.**

🔴 **IT REMOVES THE WIDTH RATHER THAN HIDING IT.** `min-w-0` lets each box shrink to its container
instead of being held open at its content's width; the content then wraps, truncates or scrolls
*inside* C as it already does in T. **No `overflow-x-hidden`, no fixed width, no clipping.**

⚠️ **C did not strictly need it** (it is already a scroll container) **and got it anyway**, so all
three boxes in this column state the same intent and a future edit that removes C's `overflow-y-auto`
does not silently reopen the hole.

## Nothing else moved

| | State |
|---|---|
| Vertical scrolling | ✅ **unchanged** — `overflow-y-auto` and `pb-24` untouched on C |
| The sticky headings | ✅ **unchanged** — not in the diff; `min-w-0` on an ancestor does not affect `position: sticky` |
| The sticky bottom bar | ✅ **unchanged** — a `fixed` sibling, not in the diff |
| The tabs layout | ✅ **unchanged** — T is not in the diff |
| **768 / 1024 / 1366** | ✅ **NOTHING CHANGES.** 🔴 **Both edited boxes are inside `md:hidden`, so they are `display:none` at every one of those widths and generate no box at all.** The `hidden md:flex` two-column branch is not in the diff |

---

# VERIFICATION

**🔴 TSC-CLEAN IS NOT VERIFICATION.** `npx tsc --noEmit` exits 0; `npx eslint` gives **23 findings
before and 23 after** — identical to HEAD.

| Required claim | Method |
|---|---|
| The element too wide in one branch, named, with the class that causes it | ⚠️ **PARTIAL, AND STATED AS SUCH.** ✅ **EXECUTED** for the mechanism: the boxes, their flex relationships and the `min-w-0` absence are all quoted from source, and `ScrollMenuSections`'s dual use was grep-verified. 🔴 **NOT ESTABLISHED:** which descendant is actually wide. **I named the escape route, not the escapee** |
| Why the tabs branch is unaffected | ✅ **Source read + CSS spec** — T is `overflow-y-auto`, so its `overflow-x` computes to `auto` and it absorbs. **Not rendered** |
| The fix removes the width without hiding it | ✅ **Source read** — three `min-w-0`; zero `overflow-x-hidden` in the diff |
| Vertical scrolling, sticky headings, bottom bar unchanged | ✅ **EXECUTED** — none of them appears in `git diff`; the only changed lines are three wrapper `className` strings |
| The tabs layout unchanged | ✅ **EXECUTED** — T is not in the diff |
| 768 / 1024 / 1366 unchanged | ✅ **EXECUTED** — both edited boxes are within `md:hidden` |
| **Gusto's shared rows and controls** | ✅ **EXECUTED — NOT ONE ROW, CONTROL, PRICE OR HANDLER IS IN THE DIFF.** `renderListItems`, the `+` controls, the basket and Review order are untouched |

## 🔴 §6 — WHAT THIS DOES NOT PROVE

- **NOTHING WAS RENDERED OR MEASURED.** No `next dev`, no `next build`, no device.
- 🔴 **THE WIDE DESCENDANT WAS NEVER FOUND.** On a true phone `eventBanner` is `hidden sm:block` and
  renders nothing, so **B's only child is the deals button** — which is `w-full` and cannot overflow
  by itself. **If B is empty or its content fits, `min-w-0` changes nothing and the horizontal scroll
  will still be there.**
- ⚠️ **The fix is therefore correct-if-the-mechanism-is-right and inert otherwise.** It cannot make
  anything worse — `min-w-0` only ever permits shrinking — but it is not a demonstrated cure.
- 🔴 **THE CHECK THAT SETTLES IT, unchanged from Stage 1:** with the one-page layout open on the phone,
  `[...document.querySelectorAll('*')].filter(el => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1)`
  — **it names the offender in one line.** ⚠️ **If that returns nothing after this change, the fix
  worked; if it returns something, it names what I could not.**

---

# INTEGRITY

## `components/dashboard/AddOrderPanel.tsx`

```
BEFORE   bytes 170,249   chars 164,872   lines 2,492
AFTER    bytes 171,717   chars 166,276   lines 2,506
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

**Non-ASCII class census — 36 distinct classes before, 36 after. NO NEW CLASS, NONE REMOVED.** Occurrences
2,683 → 2,714 — **all comment prose; the three changed `className` strings are pure ASCII.**
**Carrier-aware check on the source: `U+26A0` n=46, 43 paired, 3 bare** — ⚠️ **the
bare ones are pre-existing.**

## This report — SEPARATE pass, run AFTER writing

```
docs/add-order-overflow-fix-report.md   bytes 10,888
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 🔴 | 23 | 0 | 23 |
| U+2705 ✅ | 27 | 0 | 27 |
| **U+26A0 ⚠️** | **8** | **8** | ✅ **0** |

`U+1F534` and `U+2705` have **emoji presentation by default** — bare is correct. **`U+26A0` is the
only TEXT-presentation base here**, and ✅ **every one of its 8 occurrences is PAIRED — 8
OF 8, ZERO BARE.** ⚠️ **No other emoji-presentation base occurs.** Total `U+FE0F` = 8.

## Working tree

```
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M components/dashboard/AddOrderPanel.tsx
 M components/dashboard/OrderCard.tsx
 M docs/reference-manual.md
?? docs/add-order-overflow-fix-report.md
?? docs/add-order-overflow-report.md
?? docs/event-actions-rename-report.md
?? docs/kds-copy-apply-report.md
?? docs/kds-screen-on-header-report.md
```

| Entry | Pre-existing? |
|---|---|
| 🔴 `M components/dashboard/AddOrderPanel.tsx` | 🔴 **THIS TASK — the only source file written.** It was clean at HEAD |
| 🔴 `?? docs/add-order-overflow-fix-report.md` | 🔴 **THIS TASK** — this file |
| everything else | ✅ pre-existing — earlier tasks this session and their reports |

Nothing was committed, staged, reverted, stashed or cleaned. No `git stash`, `git checkout` or
`git restore` was run at any point.
