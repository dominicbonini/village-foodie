# Customer chip bar — keep the active chip visible

Date: 14 August 2026
Status: BUILT. **One file changed: `app/trucks/[slug]/order/page.tsx`.**
`tsc --noEmit` clean. Non-ASCII census **39 → 39**, none gained or lost. **0 NUL bytes.**

No `next dev`, no `next build`, no commit, no deploy, no migration.

🔴 **Purely additive.** This task's diff is **+67 / −2**, and the only removed line is the one that
gained a `ref` attribute. **No existing expression was changed** — grep over the diff for
`releaseSpyLock`, `spyTargetRef`, `SPY_LOCK_SAFETY_MS`, `pinnedTop =`, `chipBarTop =`, `addItem`,
`submitOrder`, `basketByCat`: **no match.**

🔴 **The dashboard was not touched.** `AddOrderPanel.tsx` and the dashboard page were last written at
12:23; the order page at 12:30. `ScrollMenuSections` has **0** references to anything added here — and
it has no chip bar at all since the previous task.

**Nothing in the prompt arrived garbled. No instruction contradicted another.**

---

## 1. THE RULE, AS IMPLEMENTED

```tsx
const barRect = bar.getBoundingClientRect()
const chipRect = chip.getBoundingClientRect()
const MARGIN = 12
let delta = 0
if (chipRect.left < barRect.left + MARGIN) {
  delta = chipRect.left - barRect.left - MARGIN        // clipped LEFT  → bring to the left edge
} else if (chipRect.right > barRect.right - MARGIN) {
  delta = chipRect.right - barRect.right + MARGIN      // clipped RIGHT → bring to the right edge
} else {
  return                                               // 🔴 FULLY VISIBLE → DO NOTHING
}
bar.scrollTo({ left: bar.scrollLeft + delta, behavior: reduce ? 'auto' : 'smooth' })
```

| Case | Behaviour |
|---|---|
| Chip fully visible | 🔴 **`return` — no scroll, no adjustment, not even a zero-delta call** |
| Clipped / off to the **right** | scrolled in so its right edge sits **12px inside** the bar's right edge |
| Clipped / off to the **left** | scrolled in so its left edge sits **12px inside** the bar's left edge |
| Bar does not overflow | 🔴 **`return` before any measurement of the chip** — section 4 |

**`MARGIN = 12` is the breathing room** so the chip does not sit flush against the edge and read as
half-cut. It is applied on the side being corrected only.

## 2. 🔴 IT NEVER CENTRES

There is no centre branch and no `scrollIntoView({ inline: 'center' })`. **The bar is still unless it has
something to correct**, which is the point of the do-nothing branch: on Gusto, scrolling through 23
pizzas would otherwise be 23 small animations of a bar the customer is not looking at.

## 3. 🔴 HORIZONTAL ONLY — AND WHY NOT `scrollIntoView`

**The bar's own scroll box is set directly:** `bar.scrollTo({ left, behavior })` where `bar` is the
`overflow-x-auto` row. **It cannot move anything but that element.**

⚠️ **`ref` correctness matters here and is easy to get wrong.** `tabBarRef` — which already existed for
the A1 height measurement — is on the **outer sticky wrapper**, which does not scroll. Scrolling *that*
would silently do nothing. A new `chipScrollRef` is on the **inner** row, and the code comment says so.

🔴 **On `scrollIntoView` with `block:'nearest', inline:'nearest'` — I did not use it, and this is the
reasoning rather than an assumption.** It is specified to scroll **every scrollable ancestor** up to the
viewport, not just the nearest one. `'nearest'` reduces *how far* each one scrolls; it does not stop the
walk. So whenever the bar is not already perfectly in view vertically it can move the **page** — and on
this page the bar's vertical position genuinely moves: it is sticky beneath a band whose height changes
when a status banner appears, and iOS collapses its address bar mid-scroll. **The failure would be
yanking the menu out from under a customer who is reading it, triggered by a horizontal correction they
did not ask for.** Setting `scrollLeft` has no such reach.

## 4. 🔴 THE EXISTING LOCK IS REUSED — NO SECOND LOCK

**No lock was added.** The effect's only input is `selectedCategory`, and the existing spy lock already
controls when that changes:

| Situation | What `selectedCategory` does | What the bar does |
|---|---|---|
| Chip tapped | `jumpToCategory` sets it **once**, then locks the spy | **one** correction, for the chip that was tapped |
| …during the smooth jump | 🔴 spy is locked → **no further changes** | 🔴 **nothing** — the bar is not dragged through every category in transit |
| Lock released (arrival / touch / wheel / `scrollend`) | spy resumes | corrections resume, one per genuine change |

**The lock's release conditions are untouched** — they do not appear in this task's diff.

## 5. NOT QUEUEING ON A FAST FLICK

**Coalesced through a single rAF slot:**
```tsx
if (chipRafRef.current) cancelAnimationFrame(chipRafRef.current)
chipRafRef.current = requestAnimationFrame(() => { … })
```

Three properties together give "ends up correct, does not animate through each one":

1. **Each change cancels the previous pending frame**, so a flick that changes the category four times in
   three frames does the work **once**.
2. **The work runs at frame time and reads the CURRENT DOM** — `getBoundingClientRect()` on the chip that
   is active *then*, not the one that was active when the effect was queued.
3. **A new scroll on the same box supersedes an in-flight smooth scroll** rather than being appended,
   so even if two frames do fire, the second retargets the animation instead of queueing behind it.

**The cleanup cancels a pending frame on unmount or before the next run**, so nothing fires against a
stale category.

⚠️ `behavior: 'auto'` under `prefers-reduced-motion: reduce` — the same check `jumpToCategory` uses.

---

## 6. TRACES

### Gusto — 5 chips, bar overflows, scrolling Pizza → Dough Balls

Assume the bar shows roughly three chips at a phone width, so `Pizza | Desserts | Drinks` are visible and
`Dips & Sauces | Dough Balls` are off to the right.

| Moment | `selectedCategory` | Chip position | **What the bar does** |
|---|---|---|---|
| Page load, top of Pizza | `Pizza` | fully visible (leftmost) | 🔴 **NOTHING** |
| 🔴 **Scrolling through all 23 pizzas** | `Pizza` throughout | unchanged | 🔴 **NOTHING — the effect never even runs.** Its dep is `selectedCategory`, which does not change; there is no per-scroll work and no per-item animation |
| Desserts heading passes the pin line | `Desserts` | fully visible | 🔴 **NOTHING** |
| Drinks | `Drinks` | fully visible (rightmost visible) | 🔴 **NOTHING** |
| Dips & Sauces | `Dips & Sauces` | **clipped right** | ✅ scrolls right by `chipRect.right − barRect.right + 12` — Dips lands 12px inside the right edge; Pizza scrolls off the left |
| Dough Balls | `Dough Balls` | **off-screen right** | ✅ scrolls right again — 🔴 **the chip the customer could not see is now visible** |
| Scrolling back up to Drinks | `Drinks` | **clipped left** | ✅ scrolls left — Drinks lands 12px inside the left edge |
| Back to Pizza | `Pizza` | off-screen left | ✅ scrolls left, back to the start |

🔴 **The answer to "does it stay still inside Pizza's 23 items": yes, absolutely still.** The effect is
keyed on `selectedCategory`, not on scroll position, so within a category it does not execute at all —
not a measurement, not a rAF, not a no-op `scrollTo`.

### A truck whose chips all fit — bar never moves

`Dips & Sauces` (2 chips), or any menu narrow enough that the row does not overflow.

```tsx
if (bar.scrollWidth <= bar.clientWidth + 1) return
```
🔴 **This runs BEFORE the chip is measured and before any `scrollTo` is considered.** A bar that fits can
never move, in any direction, for any category. The `+ 1` absorbs sub-pixel layout rounding so a bar that
fits exactly is not treated as overflowing.

### Single-category truck — no chip bar at all

| | |
|---|---|
| `hasChipBar` | `menuCategories.length > 1` → **false** |
| The bar | **not rendered** |
| `chipScrollRef.current` | **null** — the ref is never attached |
| The effect | runs, hits `if (!bar || !chip) return` on the **first** guard, does nothing |
| Net | ✅ **completely unaffected**, and it cannot throw |

---

## 7. VERIFICATION

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ **clean, exit 0** |
| Non-ASCII census, `app/trucks/[slug]/order/page.tsx` | ✅ **39 → 39**, class list byte-identical |
| Byte scan after writing (Python, byte-level — not grep) | ✅ **0 NUL bytes**, 275,465 bytes |
| Files changed | ✅ **one** |
| This task's diff | ✅ **+67 / −2**, the two removals being the line that gained a `ref` |
| Spy release conditions / pin geometry / order path in the diff | ✅ **none** |
| Dashboard, `ScrollMenuSections`, KDS | ✅ **not touched** |

**Report byte-scanned after writing — section 9.**

---

## 8. 🔴 WHAT I HAVE NOT EXERCISED

**I cannot render this page or scroll it. Nothing below was observed.**

1. **🔴 THE BAR HAS NEVER SCROLLED.** Every row of the Gusto trace is reasoning over the rect
   arithmetic. No correction has been seen to happen, or seen not to happen.
2. **"Roughly three chips visible" is an assumption, not a measurement.** I did not compute chip widths
   from the text at `text-sm font-black uppercase px-4`. **The direction of each correction does not
   depend on it, but which categories are clipped when does.**
3. **`MARGIN = 12` is a judgement.** Untested against a real chip width; too small reads as flush, too
   large wastes bar. Trivially changeable.
4. **The supersede-not-queue claim (§5, point 3) is specified behaviour I did not verify.** Points 1 and
   2 do not depend on it — the rAF cancellation alone prevents queueing — so it is a belt to that
   braces, and if an engine did queue instead, the coalescing still leaves at most one scroll per frame.
5. **`prefers-reduced-motion` was not exercised** in either branch.
6. **The `scrollIntoView` reasoning in §3 is from the specification**, not from an observed page yank. I
   did not build the failing version to watch it happen.
7. **The single-category and no-overflow traces were not run** — they are guard-clause reads.
8. **No data was read this turn.** Gusto's 5 categories / 23 pizzas come from the earlier reports.
9. **No test suite was run**; I did not look for one covering this page.

---

## 9. POST-WRITE BYTE SCAN

Run **after** this report reached disk, because a pre-write check cannot inspect a file that does not yet
exist — and several reports in this series have reproduced a NUL while documenting one.

| File | NUL bytes |
|---|---|
| `docs/chip-bar-autoscroll-report.md` (this file) | see the command output |
| `app/trucks/[slug]/order/page.tsx` | ✅ 0 |
| All files under `docs/` | see the command output |
