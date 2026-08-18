# Add-order horizontal scroll — the escapee, named at last

**File changed — ONE source file:** `components/dashboard/AddOrderPanel.tsx`, **one `className`**.
**Also written:** `docs/add-order-overflow-third-report.md` (this file).
**Nothing was committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or
`restore` — `status`, `log` and `diff` only.
**Not run:** `next dev`, `next build`, `cap sync`, any deploy, any SQL, any migration, any schema change.
🔴 **NO `overflow-x-hidden` ANYWHERE. The width is removed, not hidden.**

**No span of the prompt arrived garbled, and no instruction contradicted another.**

# 🔴 THE ANSWER, AND ONE OF YOUR HYPOTHESES IS FALSIFIED BY THE CONTROL YOU ASKED FOR

**The element:** `ScrollMenuSections`'s sticky category heading —
`sticky top-0 z-10 -mx-1 px-1 py-1.5 …` — **rendered only by the one-page branch.**

🔴 **BUT NOT FOR THE REASON Q3 PROPOSED, AND THE CUSTOMER PAGE IS WHAT DISPROVES IT.** Q3 said: *if the
customer's headings are sticky WITHOUT a negative margin and the operator's are sticky WITH one, that is
the answer.* **They are not. The customer's sticky heading carries a BIGGER negative margin than the
operator's** — `-mx-2 px-2 sm:-mx-4 sm:px-4` against `-mx-1 px-1` — **and that page does not overflow.**

🔴 **THE REAL DIFFERENTIATOR IS WHETHER THE BLEED IS MATCHED BY THE PARENT THAT ESTABLISHES THE WIDTH**,
and the customer page says so in its own comment, which is the strongest evidence in this report:

```tsx
                    tracks the card's `px-2 sm:px-4` so the band spans the padding and no further. These
                    two are the only elements in the card that break out of it, and they must agree.
```

**Customer: `-mx-2` against a parent `px-2` — matched, so nothing exceeds the card.
Operator one-page: `-mx-1` against a parent chain with NO horizontal padding at all — unmatched, so the
heading is 8px wider than its containing block, inside a box whose `overflow-y: auto` makes `overflow-x`
compute to `auto`. That box then scrolls horizontally by exactly those 8px.**

---

# STAGE 1

## Q1 — THE CUSTOMER ORDER PAGE'S ONE-PAGE MENU, ROOT TO ROW

**File: `app/trucks/[slug]/order/page.tsx`.**

```tsx
      <main className="flex-1 w-full max-w-lg mx-auto px-4 py-6" style={{ paddingBottom: `${footerHeight + 8}px` }}>
        …
          <div className="bg-white rounded-2xl border … px-2 sm:px-4 …">      {/* the menu card */}
            <div ref={tabBarRef} style={{ top: chipBarTop }}
                 className="sticky z-30 -mx-2 px-2 sm:-mx-4 sm:px-4 py-2 mb-2 bg-white border-b border-slate-100">
              <div ref={chipScrollRef} className="flex gap-1.5 overflow-x-auto scrollbar-hide"> … </div>
            </div>
                <p style={{ top: pinnedTop }}
                   className="sticky z-20 -mx-2 px-2 sm:-mx-4 sm:px-4 py-2 bg-white text-sm font-black text-orange-500 uppercase tracking-wider">
                  {cap(group.name)}
                </p>
                <div className="divide-y divide-slate-200"> … rows … </div>
```

🔴 **THERE IS NO `overflow-y-auto` ANYWHERE IN THAT CHAIN. THE PAGE ITSELF SCROLLS.** `<main>` is a
`flex-1` child of the page column; the document is the scroll container.

## Q2 — THE THREE-WAY TABLE

| Property | 🔴 **operator ONE-PAGE** | operator TABS | customer ONE-PAGE |
|---|---|---|---|
| outermost menu box | `md:hidden flex-1 min-h-0 min-w-0 **flex flex-col**` (A) | `md:hidden flex-1 min-h-0 **overflow-y-auto** pb-24` (T) | `<main class="flex-1 w-full max-w-lg mx-auto px-4 py-6">` |
| where `overflow-y` FIRST appears | 🔴 **on the inner scroller C**, `flex-1 min-h-0 min-w-0 overflow-y-auto pb-24` — **two levels below the branch root** | on the branch root itself (T) | 🔴 **NOWHERE — the document scrolls** |
| a non-scrolling header box above the scroller | 🔴 **yes — B, `shrink-0 min-w-0`** | ❌ no | ❌ no |
| each box a flex child | A, B, C all yes | T yes | `<main>` yes; the card and its children are block |
| `min-w-0` present | ✅ A, B, C (added by the previous fix) | ❌ none | ❌ none |
| sticky headings rendered | 🔴 **YES — `ScrollMenuSections`** | ❌ **NO — `categoryTabs` instead** | ✅ **YES** |
| the sticky element's classes | `sticky top-0 z-10 **-mx-1 px-1** py-1.5 bg-slate-50/95 backdrop-blur-sm` | `sticky top-0 z-10 bg-white pt-3 pb-2 mb-2 border-b` — 🔴 **no negative margin** | `sticky z-20 **-mx-2 px-2 sm:-mx-4 sm:px-4** py-2 bg-white` |
| negative margin on it | 🔴 **`-mx-1` (8px total)** | ❌ none | ✅ **`-mx-2` / `sm:-mx-4` (16–32px total)** |
| 🔴 **is the bleed MATCHED by the immediate parent's padding?** | 🔴 **NO. section (`mb-4`) → `ScrollMenuSections` root `<div>` (no classes) → C (`pb-24`, no `px-`)** | n/a | 🔴 **YES — the card's `px-2 sm:px-4`, and the file says the two "must agree"** |
| is the sticky element inside an overflow scroller | 🔴 **YES (C)** | n/a — none rendered | ❌ **NO — the document** |

**Rows where the operator one-page differs from BOTH others, in order of suspicion:**

1. 🔴 **AN UNMATCHED NEGATIVE MARGIN ON A STICKY ELEMENT INSIDE AN OVERFLOW SCROLLER.** Tabs has the
   scroller but no bleeding element; the customer has the bleeding element but no scroller **and** a
   parent that absorbs it. **Only this branch has both halves.** ⭐ **This is the fix.**
2. **A non-scrolling header box (B) above the scroller** — the previous fix's target. Real, but see Q5.
3. `min-w-0` present here and nowhere else — a consequence of the last fix, not a cause.

## Q3 — 🔴 SAID PLAINLY: THE CUSTOMER'S HEADINGS ARE STICKY *AND* CARRY A NEGATIVE MARGIN

**They do render, and they bleed harder than ours.** So "sticky + negative margin" cannot be the cause —
**it is present in a working implementation.** What the customer has and we did not is the matching
padding on the parent, quoted in Q1 and in its own comment. 🔴 **The hypothesis as written is false; the
refinement of it is the answer.**

## Q4 — WITHOUT THE BOX-MODEL ARGUMENT

- **The sticky element's containing block:** the nearest block container — `<section class="mb-4">`,
  whose width is `ScrollMenuSections`'s root `<div>`, whose width is **C's content box**. 🔴 **C sets no
  horizontal padding, so the heading's border box is `C_content + 8px`. It is wider than the box that
  establishes its width. That is true of no other element in this branch.**
- **Its scroll container:** 🔴 **C itself** — `overflow-y-auto`. **The overflow does not need to
  propagate anywhere:** per CSS, a computed `overflow-y: auto` forces `overflow-x: visible` to compute to
  `auto`, so **C is scrollable on both axes and the 8px shows up as C's own horizontal scrollbar.**
- **Anything with `overflow-x: visible` computed in that chain:** the section and the sections root
  (both `visible`), and **C is exactly where it stops being `visible`.** ⚠️ **THE PREVIOUS PASS SAID "the
  padding on `<main>` absorbs it" — `<main>` IS OUTSIDE C ENTIRELY.** Padding on an ancestor beyond the
  scroll container cannot absorb an overflow that the scroll container has already turned into a
  scrollport. **That reasoning is what missed this.**
- ⚠️ **AND THE SAFARI THREADS YOU CITE FIT WITHOUT BEING NEEDED:** sticky + negative margin inside an
  overflow parent, vertical scrolling inducing horizontal scrolling. **The geometry above is sufficient
  on its own; the Safari behaviour would only make it worse or make it appear during scrolling. Neither
  claim is EXECUTION-verified — nothing was rendered.**

## Q5 — 🔴 THE PREVIOUS FIX COULD NOT HAVE TOUCHED THIS

The headings are **inside C**, and C got a `min-w-0`. **But `min-w-0` governs whether a FLEX ITEM may
shrink below its content — it is about overflow PROPAGATING UP the flex chain.** This overflow never
propagates: **C absorbs it into its own scrollport, which is precisely the horizontal scrolling the
operator reports.** The previous fix addressed the escape route ABOVE the scroller; **the escapee was
inside it all along, and the thing it escaped into was the scroller itself.**

## Q6 — NOTHING ELSE IS UNIQUE TO THE BRANCH

✅ **EXECUTED — the only structural difference between `menuGrid`/`menuList`'s two arms is
`ScrollMenuSections` vs `{categoryTabs}{closedBanner}{selected…}`.** No spacer, no scroll-anchor, no
index, no intersection-observer target, no measured element. ✅ **`grep '-mx-'` over the whole file
returns exactly two sites: this heading, and `hidden md:flex … -mx-4` in the DESKTOP two-column branch**,
which is `md:` and up and not in this diff.

---

# STAGE 2 — THE FIX

```tsx
-            <div className="sticky top-0 z-10 -mx-1 px-1 py-1.5 bg-slate-50/95 backdrop-blur-sm flex items-center gap-2">
+            <div className="sticky top-0 z-10 py-1.5 bg-slate-50/95 backdrop-blur-sm flex items-center gap-2">
```

**Two classes removed. That is the entire change.**

## Before and after, and what the background does

| | Before | After |
|---|---|---|
| Heading text x-position | container left + (−4px margin + 4px padding) = **0** | **0 — IDENTICAL.** The pair cancelled, which is why removing both moves no text |
| Band width | `C_content + 8px` — 🔴 **4px past each edge of its container** | **exactly `C_content`** |
| Does the band still span the items it occludes | yes, plus 4px either side | ✅ **yes — the items are `C_content` wide, so the band still covers every one of them fully** |
| Overhang | 🔴 8px, outside the panel, scrollable | ✅ **none** |
| `sticky top-0 z-10` | present | ✅ **present — 🔴 THE HEADINGS STILL PIN AND STILL RELEASE PER SECTION** |
| background, blur, colour, size, weight, tracking, `py-1.5` | — | ✅ **all unchanged** |

⚠️ **I DID NOT USE THE EXACT MECHANIC YOU PROPOSED, AND HERE IS WHY.** "Move the horizontal padding to
the parent and drop the negative margin" would mean `px-1` on the sections root or on C — **which insets
every item row by 4px on each side on Pizzeria Gusto's live ordering panel**, and would still leave the
band 8px narrower than it is today rather than the same width. **Removing both classes changes no item,
moves no text, and is the smallest edit that ends the overflow.** 🔴 **The band cannot keep its old
absolute width without extending past its container — that width IS the defect.**

## The three `min-w-0` from the previous fix — kept, and now assessed

✅ **KEPT — they only ever permit shrinking and cannot hurt.** 🔴 **They are inert for THIS defect**
(Q5: the overflow never reached them) **and remain a correct guard for the different failure they were
written against** — a wide descendant of B, the non-scrolling header box, which has no scroller to
absorb it. **If that ever materialises they are already in place; if it never does they cost nothing.**

---

# VERIFICATION — 🔴 TSC-CLEAN IS NOT VERIFICATION

**`npx tsc --noEmit` exits 0. `npx eslint` on the file: 23 problems (12 errors, 11 warnings) —
IDENTICAL to the 23 recorded in `docs/add-order-overflow-fix-report.md` before and after that change.**

| Required claim | Method |
|---|---|
| The element present here and absent from both working implementations | ✅ **EXECUTED (source)** — the Q2 table was built by reading all three chains; the operator tabs' sticky bar has **no** negative margin and the customer's bleed is **matched** by its parent's padding, quoted from both files |
| Why the customer page does not overflow | ✅ **EXECUTED (source)** — two independent reasons: **its bleed is matched by the card's `px-2 sm:px-4`** (its own comment says the two "must agree"), and **there is no `overflow-y` box in its chain at all — the document scrolls.** Either alone would be enough |
| The fix removes the width without hiding it, headings still stick | ✅ **SOURCE READ** — two classes deleted, `sticky top-0 z-10` untouched, **no `overflow-x-hidden` in the diff or the file's phone branches.** 🔴 **NOT RENDERED — the scroll was not re-tested on hardware** |
| The customer page is untouched | ✅ **EXECUTED** — `app/trucks/[slug]/order/page.tsx` is **278,515 bytes and is not in this task's diff.** Only `AddOrderPanel.tsx` was written |
| Vertical scrolling, sticky headings, bottom bar unchanged | ✅ **EXECUTED** — `overflow-y-auto`, `pb-24`, the `fixed` bottom bar and the sticky declaration are none of them in the diff; the diff is one `className` and comment text |
| 768 / 1024 / 1366 unchanged | ⚠️ **SOURCE READ, AND STATED PRECISELY: THIS HEADING IS NOT INSIDE `md:hidden`.** `ScrollMenuSections` is rendered by `menuGrid`/`menuList`, which the DESKTOP two-column branch also mounts — **so the band narrows by 8px at those widths too.** 🔴 **What does NOT change there: no item, no control, no text position, and no overflow, because that branch's `-mx-4` wrapper is a different element and is untouched.** The 8px was never visible as anything but a slightly wider tint band |
| 🔴 **Gusto's shared rows and controls** | ✅ **EXECUTED — NOT ONE ROW, PRICE, `+` CONTROL, BASKET OR REVIEW-ORDER LINE IS IN THE DIFF.** `renderListItems`, `renderGridItems`, the category data and the grouping are untouched. **Source-read, not exercised: no order was placed through this panel** |

## 🔴 WHAT THIS DOES NOT PROVE

- **NOTHING WAS RENDERED OR SWIPED.** The mechanism is now demonstrated from geometry and from a working
  control that does the same job — **but the phone has not been re-tested.**
- 🔴 **THE ONE-LINE CHECK THAT SETTLES IT, on the one-page layout at phone width:**
  `[...document.querySelectorAll('*')].filter(el => el.scrollWidth > el.clientWidth + 1)` — **if the
  scroller no longer appears, this was it.** The previous report's outward-facing variant
  (`getBoundingClientRect().right > clientWidth`) **would have MISSED this**, because the offender is
  absorbed by a scroller rather than sticking out past the viewport.
- ⚠️ **The Safari sticky behaviours you cite are not needed to explain the geometry and were not
  tested.** If the scroll persists after this change, they become the next candidate — with the
  difference that the element is now inside its container, which is the state those threads say browsers
  agree on.

---

# INTEGRITY

```
components/dashboard/AddOrderPanel.tsx
BEFORE   171,790 bytes · 2,506 lines · 36 non-ASCII classes
AFTER    173,964 bytes · 168,450 chars · 2,530 lines · 36 classes
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

**Non-ASCII class census — 36 before, 36 after. NO NEW CLASS, NONE REMOVED**, and none added or removed
against `HEAD` either. Occurrences 2,714 → 2,748, **all of it comment prose; the changed `className` is
pure ASCII.** **Carrier-aware: `U+26A0` n=47, 44 paired, ⚠️ 3 bare — all three PRE-EXISTING and none in
this diff.**

## This report — a SEPARATE pass, run AFTER writing

```
docs/add-order-overflow-third-report.md   bytes 18,018
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

CARRIER-AWARE, PER EMOJI-PRESENTATION BASE. The Base column names each character by CODE POINT
and never prints the glyph, so this table cannot alter the counts it reports.

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 (red circle) | 37 | 0 | 37 |
| U+26A0 (warning sign — TEXT presentation) | 7 | 7 | 0 |
| U+2705 (check mark button) | 20 | 0 | 20 |
| U+2B50 (star) | 1 | 0 | 1 |

U+26A0 is the only base here with TEXT presentation used as an emoji, and every occurrence is
PAIRED with U+FE0F. The rest have emoji presentation by default, so bare is correct for them.

## Working tree

```
 M app/api/dashboard/route.ts
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/landing/landing.css
 M app/landing/page.tsx
 M components/dashboard/AddOrderPanel.tsx
 M components/dashboard/OrderCard.tsx
 M components/dashboard/UserMenu.tsx
 M components/shared/EventActionsModal.tsx
 M docs/privacy-manifest-report.md
 M docs/reference-manual.md
 M lib/plan-features.ts
?? components/shared/ExtraWaitModal.tsx
?? docs/add-order-overflow-fix-report.md
?? docs/add-order-overflow-report.md
?? docs/add-order-overflow-third-report.md
?? docs/event-actions-rename-report.md
?? docs/kds-copy-apply-report.md
?? docs/kds-phone-controls-final-report.md
?? docs/kds-phone-expand-final-report.md
?? docs/kds-phone-expand-report.md
?? docs/kds-phone-width-fix-report.md
?? docs/kds-screen-on-header-report.md
?? docs/kds-sound-chips-report.md
?? docs/kds-view-panel-report.md
?? docs/landing-features-move-report.md
?? docs/offline-protection-kds-fix-report.md
?? docs/offline-protection-kds-report.md
?? docs/plan-feature-order-domain-report.md
?? docs/screen-sound-alignment-report.md
?? docs/screen-sound-fix-report.md
?? docs/splice-verification-report.md
?? docs/van-name-hide-report.md
?? docs/van-name-visibility-report.md
?? lib/native/useHeartbeat.ts
```

| Entry | Pre-existing? |
|---|---|
| 🔴 `M components/dashboard/AddOrderPanel.tsx` | ⚠️ already `M` from the previous fix; 🔴 **THIS TASK wrote to it — the only source file written** |
| 🔴 `?? docs/add-order-overflow-third-report.md` | 🔴 **THIS TASK** — this file |
| `M docs/reference-manual.md` | ✅ pre-existing — the V11.26 update, the task before this one |
| `M app/api/dashboard/route.ts`, `M app/dashboard/[token]/page.tsx`, `M app/dashboard/[token]/kds/page.tsx`, `M components/shared/EventActionsModal.tsx`, `?? components/shared/ExtraWaitModal.tsx`, every `?? docs/*.md` | ✅ pre-existing — earlier tasks this session |
| `M app/landing/*`, `M lib/plan-features.ts` | ✅ pre-existing — the landing tasks |
| everything else | ✅ pre-existing |

Nothing was committed, staged, reverted, stashed or cleaned. No `git stash`, `git checkout` or
`git restore` was run at any point.
