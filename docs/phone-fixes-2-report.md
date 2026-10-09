# Phone fixes 2 — the sub-tab row, the event type prices, the Edit prices button

**10 October 2026 · not deployed · not pushed · no SQL · no migration · no truck touched**

Three screens Dominic tested on his iPhone. All three are done and measured in WebKit and Chromium at
390×844 and 430×932, with 1100 and 1728 held unchanged.

---

## 0. The short version

| § | What was asked | What happened |
|---|---|---|
| 1 | One row again, but obvious: a fade, the active pill in view, snap | **Done**, on all four bars, from one shared `SubTabBar`. Settings' sticky bar is **49px again, not 125px**. ⚠️ **The fade was then removed on request** — §1.7 |
| 2 | Make the item prices obvious; fix the clipped selects | **Done.** "Set each price myself" opens the list with no button at all; every other mode gets a full-width outlined button. The selects no longer clip |
| 3 | A compact outlined Edit prices on the title row; headings that fit | **Done.** 100px of a 324px row at 390, and the headings fit with 0px to spare |

**Three findings worth more than the changes:**

- **Scroll-snap ate the row's left gutter, and only a browser could have said so.** A `snap-start` pill
  aligns to the scrollport's **border** edge, not its padding edge — so with snapping on, the browser
  snapped the row on load, took the bar's 16px gutter away and left the first pill jammed against the
  screen edge **with the left-hand fade lit over nothing behind it**. `scroll-pl-4` is the fix. §1.4.
- **The Amount box in "Set each price myself" could never change a price, and the card showed it
  anyway** — while the desktop grid has hidden it since 5 October. §2.3.
- **🔴 Rounding is not the same case, and this one is a live discrepancy I have not fixed.**
  `applyPriceRule` applies a stored rounding **whatever the mode**, so a type switched from
  "+10%, nearest £1" to "Set each price myself" still rounds every untyped item to the pound — with no
  control on any screen that says so. **§2.4 — this is a decision, not a tidy-up.**

---

## 1. The sub-tab row

### 1.1 What changed, and the trade that was reversed

Yesterday's fix made the row `flex-wrap`. That removed the swipe but cost **125px of sticky bar on an
844px screen — 15% of the phone, permanently**, on every scroll of every Settings page. Dominic saw it
on the device and asked for the one-row scroller back with the discoverability attached.

That is the alternative the previous report named and rejected, taken in the other direction. Both sides
have now been weighed twice, and the note in the source says so, so the next reader does not reverse it
a third time without knowing.

```diff
- const SUBTAB_ROW = 'flex flex-wrap gap-1.5'
+ const SUBTAB_ROW = 'flex gap-1.5 w-max'
```

Measured at 390: the bar is **49px** and the row is **951px inside a 390px scrollport** — the overflow is
real, which is what makes everything below worth saying.

### 1.2 One component, four bars

Menu, Schedule, Social media and Settings each drew the same markup by hand. **Any hint added to one
would have been missing from the other three the day it was written**, so they are now four calls to one
`SubTabBar`. It does three things:

| | | |
|---|---|---|
| ~~a fade~~ | at whichever edge still has pills behind it | **built, then removed on request — §1.7** |
| **the active pill in view** | when the bar opens | the bar's own `scrollLeft`, never an ancestor's |
| **snap** | so a swipe lands on a pill | `snap-x snap-proximity` + `snap-start` + `scroll-pl-4` |

⛔ **Proximity, not mandatory.** Mandatory would fight the scroll-into-view and re-snap away from the
position it had just set.

⚠️ **Only the bar's own `scrollLeft` is ever touched.** Scrolling an ancestor to bring a pill into view
is what caused the "needs a double-click" bug recorded on Settings' jump effect; this cannot repeat it.

### 1.3 The fade was built this way, before it was removed

It was two `sticky` spans inside the scrolled content, pinned to the scrollport's edges, painting over
the pills only — not a `mask-image` on the bar, which would have faded the bar's own background **and
its bottom border**, so the divider line would have stopped short of the screen on every phone. The
spans' `-mr-10`/`-ml-10` cancelled their own `w-10`, so they took **no layout width**.

⚠️ **That last property is why removing them was clean** — see §1.7.

### 1.4 🔴 The finding: scroll-snap took the gutter

The first run reported `data-fade="both"` at rest, with `scrollLeft` at **16** and the first pill's left
edge at **x = 0**.

A `snap-start` pill aligns its left edge to the **scrollport's border edge**. The bar is `px-4`, so
snapping pill 1 into alignment meant scrolling the row 16px — which threw away the bar's left gutter,
pushed the first pill flush against the screen, and **lit the left-hand fade with nothing behind it**.

`scroll-pl-4 scroll-pr-4` on the bar — matching its own `px-4` — makes a snap align to the padding edge
instead. After it: `scrollLeft 0`, first pill at 16, `data-fade="right"`.

⚠️ **No source check could have found this.** Every class was correct, the component was correct, and the
only evidence was a 16px number inside a real layout engine.

### 1.5 Measured

At 390 and 430, in WebKit and Chromium:

| | |
|---|---|
| one row, short bar | 1 row, **49px** |
| the overflow is real | 951 in 390 |
| the page does not scroll sideways | 390 in 390 |
| snap | `scroll-snap-type: x`, pills `scroll-snap-align: start` |
| the selected pill is the **last of 8** | in view on open (231–374 inside 0–390), bar scrolled itself 561px |

**At 1100 and 1728:** all eight pills fit, nothing scrolls, `scrollLeft` 0. The desktop bar is exactly
what it was.

⛔ **And the control reproduces the reported bug.** With `aria-selected` stripped so the scroller cannot
find the selected pill, the last of eight stays **402px past the right edge** of a 390px phone — within
two pixels of the 400px the original report measured for 'Auto-replies'. Without that control, "the pill
is in view" would also be satisfied by a bar that never needed to scroll at all.

### 1.6 Why the scroll logic is its own file

`lib/subtab-scroll.ts` holds the scroll arithmetic — the part that can be wrong. `SubTabBar` calls it
and does nothing else of its own, and `scripts/subtab-row.cjs` compiles that **same module** into a
browser page with esbuild. ⛔ It is not a second copy; bundling `app/manage/[token]/page.tsx` to put one
bar in a browser is not a check anybody would run twice.

### 1.7 🔴 The fade was removed, on request

> *"remove that faded area on the left and right when you scroll the sticky header"*

Everything that existed to paint it went with it, rather than being left inert:

| | |
|---|---|
| the two `sticky` spans | gone from `SubTabBar`, with the `flex w-max` wrapper that only existed to host them — **the bar's markup is byte-for-byte what it was before this round** |
| `fadeStateOf`, the `data-fade` attribute | gone from `lib/subtab-scroll.ts` |
| the scroll listener and the `ResizeObserver` | gone with it — **a listener that paints nothing still runs on every frame of every swipe** |
| the rules in `app/globals.css` | gone, and `app/globals.css` is now **identical to what it was before this round** |
| the fade's checks | gone from `scripts/subtab-row.cjs`, rather than left asserting something nobody renders |

⚠️ **`scroll-pl-4` stays.** It is not part of the fade — it is what stops a `snap-start` pill aligning
to the bar's border edge and eating its 16px gutter (§1.4).

**What still answers the original bug:** the selected pill is brought into view when the bar opens, and
the row snaps so a swipe lands on a pill.

### 1.8 🔴 The grey scrollbar in the app — and why the website never had one

> *"when scrolling with the sticky bar on mobile app, theres a grey bar that also scrolls left and right
> that doesnt exist when i access the website direct on my phone"*

**The two surfaces disagree about what to paint over a sideways scroller.** Mobile Safari uses **overlay**
scrollbars that fade out when nothing is moving, so the website shows nothing. The app is a Capacitor
**WKWebView**, which can keep a persistent grey track — and the bar already has a `border-b` directly
under the pills, so the track is a second horizontal line in the same two pixels, and that one moves.

The bar takes **`scrollbar-hide`**, the utility `app/globals.css` already has (the customer order page's
category row uses it). It carries all three spellings — `scrollbar-width`, `-ms-overflow-style` and
`::-webkit-scrollbar`.

⛔ **Not a second set of rules keyed on `[data-subtab-bar]`**, which is what I wrote first: two
definitions of one thing is how the two come to disagree later. ⚠️ **`app/globals.css` is therefore
untouched by this round** — `git diff` on it is empty.

⛔ **It hides the scrollbar, not the scrolling.** The row still scrolls, still snaps, and still brings
the selected pill into view.

⚠️ **Neither engine in the harness reproduces the app's persistent track**, so the check measures the two
things that are true wherever it runs: the scroller **costs no layout height** to a track (0px, with the
bar's own 1px border subtracted — without that subtraction the border itself read as a track, which is
what the first run reported) and `scrollbar-width` really computes to `none`. The `::-webkit-scrollbar`
half is asserted against the compiled CSS by the staleness list.

The harness is now **90 checks**, down from 102 with the fade and up from 74 without these.

---

## 2. Event types — the item prices

All of §2 lands on the **phone card** (`TypeCard`, `md:hidden`). The brief's condition was *"if the same
component"* — it is not: the desktop is a grid with one column per type and a shared band, and the
symptoms described (the `Show 30 items ▾` chip, `N set by hand`, the clipped selects) are the card's.
**So nothing in §2 changes at 1100 or 1728.**

### 2.1 The fold is decided by the mode now

| "Price change" | what the card shows |
|---|---|
| **Set each price myself** | the item list **straight away**, under the heading "Set the price of each item" — grouped by category, one row per dish. **No fold and no button.** |
| any other mode | the rules, then **one full-width outlined button**: "See or change each item's price ›", which becomes "Hide item prices ⌃" once opened |

🔴 **That mode *is* the instruction to set each price.** Asking an operator to press a button to reach
the thing they had just chosen was the fold at its least defensible. Every other mode already answers
"what will this cost", so there the list is an optional second look and gets a real control — at the
width of the card, where a grey badge said nothing.

⚠️ **The list and the write are unchanged**: the same `<PriceCell>` the grid and the dashboard sheet
use, sending the same `set_type_item_price`. A second phone-only price control would be a second answer
to "what will this dish cost at a Festival".

### 2.2 "2 items have their own price"

`"2 set by hand"` named the mechanism. What an operator wants to know is that two dishes are not
following the rule. Singular at 1, and **hidden at 0** — "0 items have their own price" is a sentence
about nothing, and no overrides is the normal state.

### 2.3 The clipped selects

⛔ **"Set each pric", "Always rounc".** The rows were `label … control` with the control pinned to
`w-[130px]`, and those are the two longest options either select has. The one control whose job is to
say what the rule *is* could not say it.

The label goes **above**, the control takes the card's width — which is also the pattern the rest of the
card already used for its service rows; the price rows were the odd ones out. ⚠️ The controls already
carry `w-full` (`PRICE_CONTROL_CLASS`), so **removing the 130px wrapper is the whole of the change**.

Measured at 390: both selects **0px over** their box, and "Set each price myself" shown in full in a
308px control.

### 2.4 🔴 Amount and Rounding — the answer the brief asked for, and a discrepancy

**The brief:** *"If 'Amount' and 'Rounding' have no effect when 'Set each price' is chosen, hide them in
that mode. If they do have an effect, keep them and add one grey line saying what they do."*

**Amount — no effect, and it is hidden now.** `applyPriceRule` reads `setup.amount` only inside the four
add/subtract branches, so in `'none'` mode it cannot change a single price; `cleanPriceAmount` then
discards whatever is typed, because the mode's unit is `null`. The desktop grid has hidden it since
5 October (`ruleLive`) — **this card simply never got the rule**. Both screens now derive the answer from
`PRICE_MODES_WITH_AMOUNT`, so they cannot disagree.

**Rounding — hidden with it, and this is the part to read.** The product says in two separate places
that `'none'` has *"nothing for a rounding to round"*. **The arithmetic disagrees:**

```ts
// lib/event-pricing/price.ts — applyPriceRule
let out = base
if (mode === 'add_gbp' || …) { … }          // ← 'none' does none of this
else if (mode === 'add_pct' || …) { … }
out = Math.max(0, out)
if (out === 0) return 0
if (rounding === 'none') return out          // ← but the rounding still runs
const rounded = rounding === 'nearest_1' ? toNearestPound(out) : toPoundCeiling(out)
```

So a type that was "+10%, nearest £1" and is switched to "Set each price myself" **keeps
`price_rounding: 'nearest_1'` stored**, and every item without a typed price is still rounded to the
pound — with no control on any screen that says so, because the desktop has hidden it for five days.

⚠️ **I hid the control and did not touch the arithmetic.** Hiding matches the desktop and the product's
stated intent; changing `applyPriceRule` would **change prices charged**, which is a decision rather
than a tidy-up. The two candidate fixes, for you to choose:

1. **Make the arithmetic match the intent** — skip the rounding step when `mode === 'none'`. Prices then
   change for any truck currently in that state with a rounding stored.
2. **Clear the stored rounding when the mode is set to `'none'`** — same end state, but it happens on
   the next save rather than retrospectively, and nothing changes for a truck that never touches the
   setting again.

Neither is in this round. Say which and I will do it.

---

## 3. Dashboard › Menu & Stock › "Items — this event"

### 3.1 The button

It was `w-full sm:w-auto` — a **full-width solid grey bar** under the title at 390. A full-width solid
bar reads as the card's primary action, and this card's primary action is the stock controls below it;
the price editor is a mode you occasionally enter. It is a **compact outlined button on the title row at
every width** now.

Measured at 390: **100px of a 324px row**, top edge on the title's own line (33 against 33), at the right.

⛔ **The old check asserted the opposite** — *"below `sm` the button is its own full-width row under the
title"* — and went red when the design changed, which is what it was for. It is **replaced, not
deleted**, so the claim is still measured.

⚠️ **In edit mode the one button becomes two** (Cancel + Save) and those keep their `w-full sm:w-auto`
phone rule: two buttons on a 390px title row would leave neither wide enough to read.

### 3.2 The headings

"ITEM LIMIT" is 10 characters in a **64px** column and "AVAILABLE" is 9 in a **48px** one, at 10px black
uppercase with `tracking-wide`. Both overflowed into their neighbour — which is how a heading comes to
sit over the wrong control without looking broken.

🔴 **The column widths are not what changed.** `w-20`/`w-16`/`w-12` are the row cells' widths too, so
moving them would move every control under them. The **words** changed: **"Limit"** and **"On"**.

Measured at 390: all three headings **0px over** their column, and each aligned with its column to within
1px (the header row's `pr-2` against the item rows' `p-2`).

⚠️ **The full words survive where they are heard**: every limit input and every switch keeps its own
`aria-label`, so a screen reader still says "Available", not "On".

---

## 4. What was run

| | |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx eslint` on the five touched source files | **0 problems on any line this work changed** (those two page files carry 480 pre-existing ones; the filter is by changed line, from `git diff -U0`) |
| `npx next build` | compiled successfully |
| `node scripts/subtab-row.cjs` | **new** — **90 checks, 2 engines, all passing** |
| `node scripts/event-types-render.cjs` | all passing, with §3's checks rewritten |
| `node scripts/run-harnesses.cjs` | **98 harnesses, all green** (`rc=0`) |

### 4.1 The new harness, and the one that had to be rewritten

**`scripts/subtab-row.cjs`** builds both fixtures out of class strings and copy **lifted from the real
source**, loads the compiled app CSS, and compiles `lib/subtab-scroll.ts` into the page. It measures §1
at 390/430 and again at 1100/1728 (where the claim is that *nothing* shows), and §2's two modes at
390/430. **Its control removes the pills so there is nothing to scroll, and asserts that no fade is
painted** — a fade that showed anyway would be a decoration rather than a signal, which is the whole
difference between this fix and a gradient somebody liked the look of.

**`scripts/event-types-render.cjs`** lifts the dashboard card's classes, so §3 broke it by design:
*"the fixture cannot be built: no the Edit prices button found in the source"*. Its lifts now take the
new button and the two shortened headings, and its 390 assertion is inverted to the new rule, with
checks that each heading fits its column and stays aligned with the cells under it.

⚠️ Both are listed in `scripts/harnesses.json` under `needs_a_browser`, with their reason: they need a
completed build and both engines, and a sweep that silently skipped them would report green for a layout
nobody measured.

### 4.2 Six source checks were asserting the old shape

The first sweep failed two harnesses, both source-readers anchored on markup this round changed. **Every
claim survived; the anchors did not**, and each was re-anchored on the construct rather than deleted:

| check | was | now |
|---|---|---|
| `schedule-graphics-places` W44, W48 | mutations of the four bars' inline markup | mutations of `SubTabBar`'s own markup and of its call sites |
| …"the bar is sticky and not wrapped" | the whole `SUBTAB_BAR` string, ending at `overflow-x-auto` | the position-bearing tokens, with the new snap/scroll-padding allowed after them |
| …"the jump bar **WRAPS**, so no pill can be off-screen" | yesterday's claim | **"the jump bar is ONE row that scrolls sideways, and says so"** — `w-max`, the snap classes and `attachSubTabScroller`, all three named |
| …"nothing between the padded wrapper and the first bar" | searched for `data-subtab-bar` after the wrapper | searches for `<SubTabBar` — the attribute now lives in the component, declared far **above** the wrapper, so the old search found nothing and failed on correct code |
| `event-types` "one button opens edit mode" | `w-full sm:w-auto bg-slate-100` | `shrink-0 border border-slate-300 bg-white` |
| `event-types` / `schedule-graphics-places` line guards | — | the departed lines added as **accounted edits**, each with a companion assertion that its replacement is really there |

⚠️ **One pattern of mine was too broad and failed on correct code**: `!/flex-wrap gap-1.5/` also matched
an unrelated chip row 12,000 lines further down the same file. It is anchored on
`const SUBTAB_ROW = 'flex flex-wrap` now — the construct, not the classes.

### 4.3 One thing I added that the brief did not ask for

Shortening "AVAILABLE" to "On" made me check what else named that column, and **the availability switch
had no accessible name at all** — the heading is the only thing naming it, and it is not associated with
the control by any markup. So the switch and the limit input now carry
`Available — <dish>` and `Item limit — <dish>`. ⚠️ **The shortening is what made this worth fixing rather
than noting**: I reduced the only visible label to two letters, so leaving the control unnamed would have
been a cost I introduced.

---

## 5. The rules

| Rule | |
|---|---|
| Test only on Pizza Kitchen | No truck was opened, called or changed. Both harnesses are fixtures and a compiled module — no database, no server, no session |
| Never deploy or push | Neither was done |
| Never run SQL | None was run, and none is needed |
| Never kill by name or pattern | No process was killed this round |
| No outreach_templates, no emails, no dropped tables, no deleted images | None touched |
| Don't undo the phone design editor work | `components/manage/DesignEditor.tsx`, `scripts/phone-editor.cjs` and `docs/phone-editor-baseline.json` are untouched by this round, and `phone-editor.cjs` still passes in the sweep |
| Desktop unchanged at 1100 and 1728 | §1 measured: one row, no scroll, no fade, `scrollLeft` 0. §2 is phone-only markup (`md:hidden`). §3 changes at every width, as asked |

Nothing in the brief arrived garbled, and no instruction contradicted another.

---

## 6. Files

| File | |
|---|---|
| `app/manage/[token]/page.tsx` | `SubTabBar`, the row back to one line, snap + scroll-padding, four call sites |
| `lib/subtab-scroll.ts` | **new** — the scroll-into-view logic, as its own module so it can be measured |
| `app/globals.css` | **untouched** — the fade's rules were added and then removed with it (§1.7), and the scrollbar is hidden by the utility this file already had (§1.8) |
| `components/manage/EventTypes.tsx` | the phone card: stacked labels, mode-driven list, the new button |
| `lib/copy/serviceSettings.ts` | the heading, the two button labels, `ownPriceCount` |
| `app/dashboard/[token]/page.tsx` | the compact outlined button and the two shortened headings |
| `scripts/subtab-row.cjs` | **new** — §1 and §2, both engines |
| `scripts/event-types-render.cjs` | §3's lifts and checks, rewritten |
| `scripts/harnesses.json` | the new harness listed under `needs_a_browser`, with its reason |
