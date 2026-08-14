# Scroll mode — chip bar removed, headings pinned

Date: 14 August 2026
Status: BUILT. **Two files changed.** `tsc --noEmit` clean.
Non-ASCII census **36 → 36** and **53 → 53**, none gained or lost. **0 NUL bytes.**

No `next dev`, no `next build`, no commit, no deploy, no migration.

🔴 **Pizzeria Gusto is on `add_order_layout = 'tabs'` and is untouched** — every symbol removed here
lives inside `ScrollMenuSections`, which the tabs path never mounts. Section 6.

🔴 **The customer order page was not touched** — verified: its own chip bar and `jumpToCategory` are
intact (2 references, `hasChipBar` gates at `:2586` and `:2640`).

**Nothing in the prompt arrived garbled.** ⚠️ **One premise needs a correction before the rest, and it
does not change the outcome — section 2.**

**This task's diff, isolated against a pre-task snapshot:**

| File | + | − |
|---|---|---|
| `components/dashboard/AddOrderPanel.tsx` | 51 | **221** |
| `app/dashboard/[token]/page.tsx` | 2 | 2 |

---

## 1. THE CHIP BAR IS GONE IN SCROLL MODE

`ScrollMenuSections` no longer renders a bar at all. It is now a map over `cats`, each producing a
`<section>` with a sticky heading, an optional closed notice, and the caller's items.

**And everything the chips needed went with them**, rather than being left running against nothing:

| Removed | Survivors |
|---|---|
| `CHIP_BAR_CLASS`, `CHIP_ROW_CLASS`, `chipClass` | 0 |
| `SPY_LOCK_SAFETY_MS` | 0 |
| `nearestScrollParent`, `scrollerRef` | 0 (1 mention, in a comment naming what was removed) |
| `prefersReducedMotion` | 0 |
| `handleChip`, `releaseLock`, `lockRef`, `lockTargetRef` | 0 |
| `activeCat`, `barH`, `sectionRefs`, `catsKey` | 0 |

**The component now has no state, no refs, no effects and no listeners.** The hidden pane (one of the
two is always inside a `display:none` subtree) costs a render and nothing else.

---

## 2. ⚠️ A CORRECTION TO THE BRIEF'S PREMISE — THE HEADINGS WERE ALREADY STICKY

Item 2 reads *"MAKE THE CATEGORY HEADINGS STICKY in scroll mode"*. **On the dashboard they already
were** — `<div style={{ top: barH }} className="sticky z-[9] …">`, pinned at the measured chip-bar
height since the layout shipped.

🔴 **The non-sticky headings are on the CUSTOMER order page**, where B3 of the previous build made them
non-sticky deliberately because the chips carried position there. **The two surfaces had opposite
arrangements and the brief looks to have carried one across.**

**This changes nothing about what was built.** The instruction's *intent* — the heading must be the
pinned positional signal now that the bar is gone — is exactly right, and the work it implies is real:

| | Before | After |
|---|---|---|
| Sticky? | ✅ already | ✅ still |
| Pinned at | `top: barH` — the **measured chip-bar height** | 🔴 **`top-0`** — the top of the scrolling pane |
| Why | had to clear the bar above it | **nothing is above it any more** |
| z-index | `z-[9]` — to slide **under** the bar's `z-10` | `z-10` — nothing left to slide under |
| Measurement it needed | a `ResizeObserver` on the bar | 🔴 **none** |

**Reported rather than silently "done", because a reader of the brief would otherwise expect a
sticky-vs-not change that was not the change.**

**Colour, size, weight, tracking and spacing are untouched, as instructed:** `text-xs font-black
uppercase tracking-wide text-orange-600`, `-mx-1 px-1 py-1.5`, the translucent backdrop. **Only the pin
offset and the z-index moved**, and both moved because the thing they were positioned against no longer
exists.

⚠️ **The heading's colour comment was amended, not the colour.** It justified `orange-600` partly as
*"matching the active chip"* — a chip that no longer exists in this layout. That half is now marked
historical; the colour still matches the primary buttons, which is why it stands, and the AA shortfall
recorded there is unchanged and still flagged.

---

## 3. THE SPY IS GONE — AND THE LISTENER WAS NOT SHARED

**Checked before removing, because item 3 said to.** Every listener in the block was attached by
`ScrollMenuSections` itself, on the scroller it resolved, and every handler was the spy's:

```
sc.addEventListener('scroll',     onScroll,     { passive: true })   → compute() (the spy) + lock release
sc.addEventListener('touchstart', releaseLock,  { passive: true })   → lock release only
sc.addEventListener('wheel',      releaseLock,  { passive: true })   → lock release only
sc.addEventListener('scrollend',  releaseLock)                       → lock release only
```

🔴 **Nothing else on the panel used them**, and the pane's scroll position is not read anywhere else in
this component. **So the whole listener block was removed** — the tap-lock, its 2s safety net, the
arrival / touchstart / wheel / scrollend releases, the rAF throttle, the bottom clamp and the
`ResizeObserver` that measured the bar.

**Nothing was left orphaned and nothing else lost behaviour.**

---

## 4. THE SPACE IS RECLAIMED

The bar carried `pt-3 pb-2 mb-2 border-b border-slate-100` — roughly **44px of button plus ~28px of
padding and margin, and a rule**. All of it went with the element; **no spacer, no placeholder, no
residual margin was left behind.**

**The item list now starts where the chips were.** The first section's heading is the first thing in the
scroller, pinned at `top-0`. The pane's own padding is unchanged (`px-4 pb-4` on the scroller, `px-4
pt-4` on the `shrink-0` header above it), so there is no gap between the pane header and the first
heading.

---

## 5. THE HELP TEXT

`app/dashboard/[token]/page.tsx:3617`, the exact replacement asked for:

> "Show every item in one scrolling list, with a heading for each category. **There are no category
> buttons - you scroll to move around.** Best for shorter menus, where you can see most of it at once."

⚠️ **The `'tabs'` option is byte-identical** — label and help both unchanged, verified at `:3616`.
⚠️ **The hyphen in "buttons - you" is a plain ASCII hyphen**, exactly as supplied. Not "corrected" to an
em dash: it is your copy, and changing it would also have risked the census.

---

## 6. 🔴 A TRUCK ON `'tabs'` RENDERS BYTE-IDENTICALLY

**Not "the change is small" — the code is unreachable.**

| Step | Value |
|---|---|
| Gusto's column | `add_order_layout = 'tabs'` |
| `AddOrderPanel` | `truck?.add_order_layout === 'scroll' ? 'scroll' : 'tabs'` → **`'tabs'`** |
| `menuGrid` / `menuList` | take the **else** branch: `{categoryTabs}{closedBanner}{selectedMenuCat && render…}` |
| `<ScrollMenuSections>` | 🔴 **never mounted** — every deletion in this task is inside it |
| `categoryTabs` (the tabs chip bar) | ✅ **byte-identical**, still at `:1706-1707` with its own `sticky top-0 z-10 bg-white pt-3 pb-2 mb-2 border-b border-slate-100` |

**Grep over this task's diff for `categoryTabs`, `closedBanner`, `selectedMenuCat`, `renderGridItems`,
`renderListItems`, `cartLines`, `submitPanel`, `eventBanner`: no match.** The tabs render path, the item
cards, the cart, the submission path and Start Event are not in the diff.

⚠️ **The tabs bar and the removed scroll bar were deliberate duplicates** — the scroll one carried a
comment saying "restyle one, restyle both". **That obligation is now void**: the tabs bar is the only
one left, and the comment went with the code it described.

---

## 7. TRACES

### 4 categories / 12 items — Tikka Tonic, the truck actually on `'scroll'`

| | |
|---|---|
| Renders | 4 sections, headings **Starters / Sides / Mains / Dips & Sauces** in `sort_order` |
| Pinned | the current section's heading at `top-0`; nothing else inside the scroller |
| Reaching the last category | **scroll — roughly one to one-and-a-half panes.** Dips & Sauces is a short flick away |
| Verdict | ✅ **this is the case the layout is for.** 12 items is less than two screens; a chip bar cost 44px of every screen to save a scroll nobody needed |

### 5 categories / 46 items, 23 in one — Gusto's shape

⚠️ **Gusto is on `'tabs'`, so this describes the shape, not Gusto.** Its `Specials` (0 items) is dropped
by `menuCats` and produces no section, as always.

| | |
|---|---|
| Renders | 5 sections; **Pizza is 23 tiles** — at 3 tiles per row in the tablet pane, ~8 rows |
| Pinned | the heading of whichever section you are in |
| **Reaching the last category (`Dough Balls`)** | 🔴 **BY SCROLLING, AND ONLY BY SCROLLING. There is no longer any way to jump.** Past ~8 rows of Pizza and three further sections — several pane-heights of flicking |
| Verdict | 🔴 **this is the cost of the change, stated plainly.** On a menu this size the chips were doing real work, and removing them makes the last category meaningfully harder to reach |

🔴 **SO THE HONEST SUMMARY: this change is good for short menus and bad for long ones, and the setting is
what decides which a truck gets.** The help text now says so ("There are no category buttons - you scroll
to move around"), and the `'tabs'` option's own text already says it is "Best for longer menus". **A
46-item truck should be on `'tabs'`, which is where Gusto already is.**

---

## 8. VERIFICATION

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ **clean, exit 0** |
| Census, `components/dashboard/AddOrderPanel.tsx` | ✅ **36 → 36**, GAINED none, LOST none |
| Census, `app/dashboard/[token]/page.tsx` | ✅ **53 → 53**, GAINED none, LOST none |
| Byte scan after writing (Python, byte-level — not grep) | ✅ `AddOrderPanel.tsx` **0 NUL**, `page.tsx` **0 NUL** |
| Files changed | ✅ **two** |
| Removed symbols still referenced | ✅ **none** (one comment mention, named as removed) |
| Customer order page | ✅ **not touched** — its chips and `jumpToCategory` intact |
| KDS, APIs, migrations | ✅ none |

**Report byte-scanned after writing — section 10.**

---

## 9. 🔴 WHAT I HAVE NOT EXERCISED

**I cannot render this panel or scroll it. Nothing below was observed.**

1. **🔴 NOTHING WAS RENDERED.** That the heading pins at the top of the pane, that the space closes with
   no gap, and that the list starts where the chips were — all read from classes, none seen.
2. **`sticky top-0` inside that pane has never been observed.** It is the same mechanism the removed bar
   used at the same offset, which is the strongest argument available without looking, **but the bar and
   the heading are different elements with different backgrounds** (`bg-white/95 backdrop-blur-sm` vs the
   bar's opaque `bg-white`). ⚠️ **A translucent pinned heading over scrolling tiles is the thing to look
   at first** — it was previously pinned below an opaque bar, so it has never been the topmost pinned
   element before.
3. **The reclaimed space is arithmetic**, not a measurement. ~72px is inferred from `pt-3 pb-2 mb-2` plus
   a 44px button.
4. **No truck on `'scroll'` was opened.** Tikka Tonic's Add order screen has never been loaded in either
   configuration.
5. **The removals are grep-verified, not exercised.** Zero references is a strong check; **it does not
   prove nothing depended on a side effect of those listeners** — though they only wrote to state that
   also went.
6. **I did not verify the help text renders** in the Settings card, only that the string is correct in
   source.
7. **The 46-item trace is a shape, not an observation** — Gusto is on `'tabs'` and I did not switch it,
   query it, or read any data this turn.
8. **No test suite was run**; I did not look for one covering this panel.

---

## 10. POST-WRITE BYTE SCAN OF THIS REPORT

Run **after** this file reached disk, because a pre-write check cannot inspect a file that does not yet
exist — and four reports in this series have now reproduced a NUL while documenting one.

| File | NUL bytes |
|---|---|
| `docs/scroll-mode-no-chips-report.md` (this file) | see below |
| `components/dashboard/AddOrderPanel.tsx` | ✅ 0 |
| `app/dashboard/[token]/page.tsx` | ✅ 0 |
| All files under `docs/` | see below |
