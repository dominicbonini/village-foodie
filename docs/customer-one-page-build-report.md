# Customer order page — two bug fixes, then one continuous scroll

Date: 14 August 2026
Status: BUILT. **One file changed: `app/trucks/[slug]/order/page.tsx`.**
`tsc --noEmit` clean. Non-ASCII census **39 → 39**, none gained or lost. **0 NUL bytes.**

No `next dev`, no `next build`, no commit, no deploy, no migration. No API, dashboard, KDS or
`ScrollMenuSections` change.

🔴 **This is the page Pizzeria Gusto takes real money through.** `docs/customer-one-page-review.md` was
re-read in full before any edit, and the two bugs it identified are fixed and reported **before** Part B,
as asked.

**Nothing in the prompt arrived garbled. No instruction contradicted another.**

⚠️ **`git status` lists eight other modified files — all from earlier turns.** This task's diff, isolated
against a pre-task snapshot of the file, is **+250 / −62 lines in one file**.

---

# PART A — THE TWO PRE-EXISTING BUGS

## A1 — the pinned band, and the banner that ate the chip bar

### Before

```tsx
const HEADER_H = 60
const TABBAR_H = 61
const stickyTop = HEADER_H + (isDemo ? demoBannerH : 0)
```

Four things pinned, **two of them uncounted**:

| Element | Pinned at | z | In `stickyTop`? |
|---|---|---|---|
| Page header | `top-0`, `h-[60px]` | 50 | ✅ |
| Demo banner | `top-[60px]`, measured | 40 | ✅ |
| 🔴 **Status banners** (closed / paused / time-not-set) | `stickyTop` | **40** | 🔴 **NO** |
| Category chip bar | `stickyTop` | **30** | — |

**The chip bar and the status banners pinned at the identical offset, and the banners won on z-index.**
So on a paused, closed or time-not-set event — with the menu still rendered, because
`isOrderingBlocked` only disables the Add buttons — **the chips were drawn over and invisible.**

### After

**Three pin lines, each the one above it plus what that one occupies:**

```tsx
stickyTop   = HEADER_H + (isDemo ? demoBannerH : 0)      // where the STATUS BANNERS pin — UNCHANGED
chipBarTop  = stickyTop + statusBannerH                  // where the CHIP BAR pins        — the fix
pinnedTop   = chipBarTop + (hasChipBar ? tabBarH : 0)    // the readable top
```

🔴 **`stickyTop` had to stay exactly as it was.** Folding the banners' own height into it would pin them
below themselves — a feedback loop, not a fix. The bug was one level down.

**Behaviour change, stated as a customer would see it:**

| State | Before | After |
|---|---|---|
| Normal (no banner) | chips pin below the header | ✅ **identical — `statusBannerH` is 0** |
| Demo | chips pin below header + demo banner | ✅ identical |
| 🔴 **Paused / closed / time-not-set** | 🔴 **chips hidden behind the banner** | ✅ **chips pin below the banner and stay visible** |

### `scroll-margin-top` vs JS arithmetic — what I chose and why

🔴 **BOTH, from ONE number — and that is the point rather than a hedge.**

- **The jump uses `scroll-margin-top`.** Each section carries `style={{ scrollMarginTop: pinnedTop }}`
  and the chip calls `el.scrollIntoView({ block: 'start' })`. **The browser applies the margin**, so
  there is no `getBoundingClientRect().top + window.scrollY − offset` arithmetic to go stale between a
  re-measure and a paint. This is section 2e of the review, taken.
- **The spy still needs the number in JS**, because a pin line is not something CSS can report. It reads
  the same `pinnedTop`.

**So the choice was not "CSS or JS" but "how many places compute the offset" — and the answer is one.**
A re-measure moves the landing position and the spy's pin line together, and they cannot disagree.

**Everything in that number is now measured except the header:**

| Term | Source |
|---|---|
| `HEADER_H = 60` | ⚠️ still a constant — but the header is `h-[60px]`, a hard px height that OS text scaling cannot move |
| `demoBannerH` | measured (pre-existing `ResizeObserver`) |
| 🔴 `statusBannerH` | **NEW — measured** |
| 🔴 `tabBarH` | **NEW — measured.** `TABBAR_H = 61` is now only the first-paint fallback. Its button is `min-h-[44px]` and its padding is rem, so text scaling moved it and the constant did not |

**Measured in a `useLayoutEffect` with no dep array**, the same shape the footer height already uses in
this file — a banner mounting is a render, so this catches every appearance without enumerating the
conditions (which are computed hundreds of lines below the hook).

⚠️ **THREE REFS, NOT ONE WRAPPER, AND THAT WAS FORCED.** Wrapping the banners in a div would make that
div their sticky containing block, so each would stop sticking once the wrapper scrolled past — **it
would break the banners in order to measure them.** They are measured individually and summed.

⚠️ **A PRE-EXISTING DEFECT I FOUND AND DID NOT FIX:** the three banners all pin at the same offset, so if
two are ever live at once (time-not-set **and** paused is reachable) **they overlap each other.** Summing
over-estimates in that case. **The over-estimate is the safe direction** — it leaves a gap above a
heading rather than hiding it behind a banner — and banner-on-banner overlap is out of scope here.

## A2 — the clamp that cancelled itself exactly when it was needed

### Before

```tsx
const menuMinHeight = Math.max(0, viewportH - 121)   // 121 = header 60 + tab bar 61
…
<div style={{ minHeight: menuMinHeight }}>           // on the WHOLE list
```

Its own comment called it *"self-cancelling — inert once the category's content exceeds it"*. **That was
correct for tabs, where one category rendered at a time.** With every category in one list the combined
list **always** exceeds a viewport, so the padding silently becomes 0 — **precisely when the last
category needs it.** The final category could then never be scrolled to the pin line: unreachable by
tap, and with a spy, permanently unlit.

### After — the floor moved from the list to the last section

```tsx
const lastSectionMinHeight = `calc(100dvh - ${Math.round(pinnedTop)}px - ${Math.round(footerHeight)}px)`
…
style={{ scrollMarginTop: pinnedTop, ...(isLastCategory ? { minHeight: lastSectionMinHeight } : {}) }}
```

**The LAST section is at least as tall as the readable area, so there is always a screen's worth of
scroll beneath its heading.** Still self-cancelling — a long last category exceeds it and the min-height
is inert — but **it can no longer be cancelled by the categories above it.**

| | Before | After |
|---|---|---|
| Short single category (tabs era) | padded to a viewport ✅ | n/a — no tabs |
| Combined list, short last category | 🔴 **0 padding; last heading cannot reach the top** | ✅ **last section floored; heading reaches the pin line** |
| Combined list, long last category | 0 padding (fine) | ✅ min-height inert, no blank gap |

🔴 **It is `dvh`, not JS** — see B6.

---

# PART B — ONE CONTINUOUS SCROLL

## B1 — every category renders; the chips jump

**The filter is gone:**
```diff
- {groupedMenu.filter(([category]) => selectedCategory == null || category === selectedCategory).map(…)}
+ {groupedMenu.map(([category, items], catIndex) => {
```
**The chip is unchanged except its handler and its offset:**
```diff
- <div style={{ top: stickyTop }} className="sticky z-30 -mx-2 px-2 sm:-mx-4 sm:px-4 py-2 mb-2 …">
+ <div ref={tabBarRef} style={{ top: chipBarTop }} className="sticky z-30 -mx-2 px-2 sm:-mx-4 sm:px-4 py-2 mb-2 …">
-     onClick={() => setActiveCategory(cat)}
+     onClick={() => jumpToCategory(cat)}
```
**Same classes, same `min-h-[44px]`, same horizontal scroll, same negative-margin mirror, same orange
selected state.** The bar is in the same place doing a different job.

🔴 **The old `window.scrollTo` pin was removed, not adapted.** It existed *because* the tabs filtered:
every category started at the same place, so one shared anchor (`menuTopRef`) served them all. With one
list they start at different places, so the jump targets the tapped **section**. Its demo fix is not
lost — it scrolled to `stickyTop`, and `pinnedTop` is that same number plus the two bands it never
counted. `menuTopRef` and `categoryScrollMounted` were **deleted**, not left dangling.

## B2 — 🔴 ONE ARRAY, AND IT IS `groupedMenu`

**Both the chips and the sections map `menuCategories`, which is `groupedMenu.map(([cat]) => cat)`.**
`menu.categories` is never iterated for either. Recorded in a comment at the derivation, naming the
failure it prevents:

> The server drops a whole category when it is disabled, and in per-dish allergen mode it drops items
> whose allergens are unconfirmed, so a category can hold items for the operator and none for the
> customer. `groupByCategory` only emits categories that HAVE items, so Pizzeria Gusto's empty
> `Specials` has never had a chip and must never gain a heading. Two derivations would put an empty
> heading in the list and shift every jump target after it.

⚠️ **The only remaining `menu.categories` uses are unrelated and were checked:** the sub-category lookup
inside a section (`…find(c => c.name === category)?.subcategories`) and a prop on the allergen modal.
**Neither produces a section or a chip.**

## B3 — category headings NOT sticky; sub-category headings still are

**New, non-sticky:**
```tsx
{hasChipBar && (
  <p className="text-sm font-black text-orange-600 uppercase tracking-wider pt-1 pb-2">{cap(category)}</p>
)}
```
**Sub-category headings keep their `sticky z-20`, now offset by `pinnedTop`** — which *is* the old
expression with the two missing bands added:
```diff
- style={{ top: menuCategories.length > 1 ? stickyTop + TABBAR_H : stickyTop }}
+ style={{ top: pinnedTop }}     // = stickyTop + statusBannerH + (hasChipBar ? tabBarH : 0)
```

**The decision is recorded in the code**, as asked: the highlighted chip is the parent indicator and
names the section while showing its neighbours, which a pinned heading does not; two pinned levels plus
the page header would eat roughly a third of a phone viewport before any food. **A sticky child under a
non-sticky parent is intended here.**

⚠️ **TWO STRUCTURAL CONSEQUENCES I HAD TO HANDLE, both of which would have shipped as visible defects:**

1. **`divide-y` moved off the section onto an inner wrapper.** `divide-y` borders between *siblings*, so
   leaving it in place would have made the new heading a sibling and **drawn a rule under it that has
   never been there.** Same children, same borders between them as before.
2. **The category name would have printed twice.** The pre-order block already renders
   `<span>{cap(category)}</span>`. That span is now gated `{!hasChipBar && …}` — so the name appears
   once from the heading when there is more than one category, and once from the pre-order block on a
   single-category menu where no heading renders.

## B4 — the scroll-spy, both directions, on the existing listener

**The page's existing `window` scroll listener was extended, not duplicated:**
```tsx
const onScroll = () => {
  setIsScrolled(window.scrollY > 120)      // pre-existing, unchanged
  onScrollSpy()                            // added
}
```
**The listener still mounts once with stable deps.** The values it needs — the category list and the
measured pin line — are fed through `spyStateRef`, synced by an effect after every render, so the
handler is never torn down and re-attached as the menu loads or a band is re-measured.

**Lock released on all four, carried over from the operator panel:**

| Exit | Implementation |
|---|---|
| 🔴 **ARRIVAL** | `Math.abs(window.scrollY - target) <= 2` — the normal exit |
| 🔴 **…or the bottom** | `innerHeight + scrollY >= scrollHeight - 2` — a target past the end can never be reached |
| 🔴 **The customer takes over** | `touchstart` / `wheel` on `window` release immediately |
| `scrollend` | where supported; never relied on |
| Timer | `SPY_LOCK_SAFETY_MS = 2000`, **a net only** |

**Plus the guard the operator build needed:** a tap on the section already at the top emits no scroll
event, so **no lock is taken when there is nowhere to go** — otherwise it would sit until the net
expired, which is the mis-highlight the design exists to remove.

**And a bottom clamp on the spy itself**, so the last chip lights at the end of the page even if its
section is short. (A2's floor makes that rare; it does not make it impossible.)

## B5 — the single-category branch, preserved

```tsx
const hasChipBar = menuCategories.length > 1
const pinnedTop  = chipBarTop + (hasChipBar ? tabBarH : 0)
```
**One flag, three consumers** — whether the chip bar renders, whether headings are offset by it, and
whether a category heading renders at all. A one-category menu gets **no chip bar, no chip-bar offset,
and no category heading** (a single category needs no divider), so it looks as it does today.

## B6 — nothing is computed from `window.innerHeight` any more

🔴 **`viewportH` is deleted.** Its only reader was `menuMinHeight`, and A2 replaced that with `dvh` in
CSS. `100dvh` is the **dynamic** viewport height: the browser tracks the iOS address bar itself, so the
value is right through a collapse instead of being recomputed from a stale `innerHeight` mid-gesture.

**The resize/orientationchange listener is kept but repointed** — it now forces a render so the layout
effect **re-measures the real elements**. Measuring beats computing: an element's height is whatever the
address bar has just done to it.

⚠️ **The spy does read `window.innerHeight`**, in the at-bottom test — but only compared against
`scrollHeight` **in the same frame**, so a mid-gesture change cannot leave a stale value behind.

---

# WHAT WAS NOT TOUCHED

| Fenced | Status |
|---|---|
| Item selection, modifiers | ✅ `openItemModal` / `addItem` not in the diff |
| The cart | ✅ untouched |
| `basketByCat` category caps | ✅ still `basketByCat[item.category?.toLowerCase() \|\| 'mains']` — keyed off the **item's own** category, never the selection |
| Collection-time picker | ✅ untouched |
| Submission | ✅ untouched |
| Dashboard / KDS / `ScrollMenuSections` / any API | ✅ **not in this task's diff** |

### Nothing on the order path reads the category selection

Grepped each order-path symbol for a reference to `activeCategory` / `selectedCategory`:

`addItem` **0** · `removeItem` **0** · `openItemModal` **0** · `basketByCat` **0** · `submitOrder` **0** ·
`handleSubmit` **0** · `availableSlots` **0** · `slotHour` **0** · `slotMinute` **0** · `calcTotals` **0**

**The complete reader set is six lines:** the state declaration, the resolver, the spy sync, the chip
highlight, and the jump. ⚠️ **`selectedCategory` is now a HIGHLIGHT, not a filter** — it no longer
decides what renders. **The self-heal is kept**: a category that disappears on a menu reload must not
leave a chip lit that no longer exists.

---

# TRACES

### Single-category truck

| | |
|---|---|
| `menuCategories` | 1 entry → `hasChipBar = false` |
| Chip bar | **not rendered** (unchanged gate) |
| `pinnedTop` | `chipBarTop + 0` — **no dead space above headings** |
| Category heading | **not rendered** — a lone category needs no divider |
| Pre-order block's name span | **renders** (`!hasChipBar`), so the name is not lost |
| Sub-category headings | pin at `chipBarTop`, which is `stickyTop` when no banner shows — **today's value** |
| Spy | `cats.length < 2` → returns immediately; **no work, no highlight** |
| A2 floor | applies to the only section |
| **Net** | 🔴 **visually as today, plus the A1 banner fix** |

### Pizzeria Gusto — 5 visible categories, 46 items, 23 in one, `Specials` empty

| | |
|---|---|
| `groupedMenu` | **5** entries — `Specials` (0 items) is not emitted, so **no chip and no heading**, exactly as today |
| Chips | 5, jumping |
| Sections | 5, in `sort_order`, each with a non-sticky orange heading |
| Pizza | 23 rows, **one item per row** — the review estimates ~6 screens; the Desserts heading is that far down |
| Last section (`Dough Balls`, 6 items) | 🔴 **floored to `calc(100dvh - pinnedTop - footerHeight)`** — reachable, and its chip lights |
| Paused / closed | 🔴 **chips now visible below the banner** (A1) — today they are hidden |
| Order path | unchanged |

⚠️ **Gusto is the truck this helps least** — the review's judgement, unchanged by building it. Half the
scroll is Pizza, and the chips become primary navigation rather than a convenience.

### Tikka Tonic — 4 categories, 12 items

| | |
|---|---|
| `groupedMenu` | 4 entries, all non-empty |
| Whole menu | roughly 1.5 screens — **the case the change is for**: no tap needed to see almost everything |
| Stored order | Starters, Sides, **Mains**, Dips — ⚠️ **a scroll makes that visible**; Mains is third and a customer scrolls past two categories to reach it. **Nothing here reorders it** — that is `menu_categories.sort_order`, operator-controlled in Manage |
| Last section (`Dips & Sauces`, 2 items) | floored by A2 — without it, that chip would be unreachable |

---

# VERIFICATION

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ **clean, exit 0** |
| Non-ASCII census, `app/trucks/[slug]/order/page.tsx` | ✅ **39 → 39**, class list byte-identical, **GAINED none, LOST none** |
| Byte scan after writing the source | ✅ **0 NUL bytes** (Python, byte-level — not grep) |
| `file(1)` | ✅ `Unicode text, UTF-8 text` |
| Files changed by this task | ✅ **one** |
| Migration / API / dashboard / KDS | ✅ none |
| Order path reads the selection | ✅ **zero references** |

### Byte scan of the report, post-write

Section at the end, because a pre-write check cannot inspect a file that does not exist — and three
reports in this series have reproduced a NUL while documenting one.

---

# 🔴 WHAT I HAVE NOT EXERCISED

**I cannot render this page, scroll it, or open it on a phone. Nothing below was observed.**

1. **🔴 NOT ONE PIXEL WAS RENDERED.** Every claim about where a heading lands, whether the chips clear a
   banner, and how the spy behaves is reasoning over code. `tsc` proves it compiles.
2. **🔴 THE A1 FIX IS UNVERIFIED AGAINST THE BUG IT FIXES.** I never loaded a paused or closed truck's
   page to see the chips hidden, and I have not seen them clear the banner afterwards. **The overlap
   itself was INFERRED from the z-order and the equal `top` — it is still inferred.**
3. **The A2 floor has never been scrolled to.** That `calc(100dvh - …)` produces the intended height,
   and that the last heading therefore reaches the pin line, is arithmetic.
4. **`dvh` support was not tested.** It is iOS Safari 15.4+; on an older engine the `calc` is invalid and
   the min-height is dropped, which **fails back to today's behaviour** (last category short of the top)
   rather than to something worse — but I did not verify that fallback.
5. **The spy has never run.** No lock taken, arrived, or interrupted. The `touchstart` release depends on
   the touch reaching `window` — **plausible for a document-level listener, unobserved.**
6. **`scrollIntoView` + `scrollMarginTop` was not observed landing anywhere**, and it is the mechanism
   the whole jump rests on.
7. **The `<= 2` tolerances are judgements** guarding sub-pixel scroll positions, untested on a device.
8. **No data was read.** Gusto's 5/46/23/0 and Tikka Tonic's 4/12 come from
   `docs/add-order-view-report.md`; I queried nothing this turn.
9. **The two structural consequences in B3 were caught by reading, not by looking.** That the rule under
   the heading is now absent, and the name printed once, are claims about `divide-y` and JSX I have not
   seen rendered.
10. **The measurement effect runs after every render** — a cheap `getBoundingClientRect` × 4 — but
    **I did not profile it**, and this page re-renders on every basket change.
11. **I did not test with two status banners at once**, the case where the summed `statusBannerH`
    over-estimates.
12. **No test suite was run**; I did not look for one covering this page.
