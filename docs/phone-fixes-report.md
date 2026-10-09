# Phone fixes

**10 October 2026 · not deployed · no migration · no SQL run · one truck touched (`test-truck`)**

Four problems seen on an iPhone. **Three are fixed and measured. The fourth — §4, the phone design
editor — I did not build, and §4 of this report says exactly why and what it needs.**

---

## 0. The short version

| § | What was asked | What happened |
|---|---|---|
| 1 | Auto-replies can't be seen on a phone | **Fixed.** The cause was measured, not guessed: the pill row is **951px wide inside a 390px bar**. It scrolled; nothing said so. It wraps now — and needs no breakpoint, so 1100 and 1728 are byte-identical |
| 2 | The Event types price list is missing on a phone | **Fixed.** The cause was a **deliberate omission**, not a layout bug — the card printed *"set them on a bigger screen"*. The brief reverses that and names the shape; one row per dish, using the same `PriceCell` the desktop grid and the dashboard sheet use |
| 3 | Location settings on a phone | **Fixed.** Below 768px it is two screens — list, then one location — with a `›` per row, a "‹ All locations" link, three compact 72px cards and the tag field. The phone's own back gesture returns to the list |
| 4 | The phone design editor | **NOT DONE.** I started it, judged I could not finish it to a standard worth shipping in this session, and **reverted my scaffolding so the editor is byte-identical to before.** §4 below is the design I had settled on and the honest estimate |

**Two findings worth more than the fixes themselves:**

- **The stale-build trap caught me again, one day after I wrote it up.** §3's thumbnails measured
  **72×20 and 72×4** on correct source, because `h-[72px]` did not exist in a build made before the
  component. `scripts/social-tab-render.cjs` now refuses a build that is missing any arbitrary class its
  claims depend on — §5.1.
- **A deliberate product decision and a brief can disagree, and that is not a contradiction to stop
  for.** §2 was a recorded "no" with reasons. The reasons were about the *grid*; the brief asked for a
  different shape. §2.1.

---

## 1. Settings › Auto-replies on a phone

### 1.1 The cause, measured

The brief listed three candidates — an overflowing row, a breakpoint, a plan check. I ruled the last two
out with evidence before measuring the first:

- **Not a plan check.** The Auto-replies pill carries no condition at all: zero matches for
  `canAccess`, `isNativeApp`, `hidden`, `sm:` or `md:` in the pill row.
- **Not a native-app hide.** `isNativeApp()` is `Capacitor.isNativePlatform()` — false in mobile
  Safari. (The native hide that *does* exist is inside the section, on the app-store badges.)
- **Not a breakpoint.** `<section id="auto-replies">` is rendered for every plan on every platform.

Then I measured the row in WebKit and Chromium, with the bar's own lifted classes against the compiled
stylesheet:

| | 390×844 | 430×932 | 1100×800 |
|---|---|---|---|
| bar width | 390 | 430 | 1100 |
| **row width** | **951** | **951** | 951 (fits) |
| scrollable | yes | yes | no |
| last pill's right edge | **935** | **935** | 935 |
| last pill visible | **no** | **no** | yes |

**So the row scrolled sideways and nothing on the page said so.** Eight pills at ~119px each is 951px;
at 390px the operator sees the first three and a sliver of the fourth. 'Auto-replies' sat **400px past
the right edge** and 'Account deletion' **545px past it**. iOS Safari paints no persistent scrollbar, so
a row that starts flush at the left edge looks like a row that simply ends after "Order settings".

### 1.2 The fix is one class, and it needs no breakpoint

```diff
- const SUBTAB_ROW = 'flex gap-1.5 w-max'
+ const SUBTAB_ROW = 'flex flex-wrap gap-1.5'
```

`w-max` made the row as wide as its contents. `flex-wrap` wraps **only where the pills do not fit**, so
the fix applies itself at every width rather than at a line somebody chose:

| tab (pills) | 390 | 430 | 768 | 1100 |
|---|---|---|---|---|
| Settings (8) | 125px | 125px | 87px | **49px** |
| Menu (4) | 87px | 87px | 49px | **49px** |
| Schedule (3) | 49px | 49px | 49px | **49px** |
| Social (3) | 49px | 49px | 49px | **49px** |

**At 1100 and 1728 the bar is 49px and the last pill's right edge is 935 — exactly what it is today**,
because eight pills fit on one line there. `overflow-x-auto` stays on the bar as the belt: with wrapping
there is nothing to scroll, but a single pill wider than the bar would still have somewhere to go.

### 1.3 The option I rejected, and the cost I accepted

**125px of sticky bar on an 844px screen is 15% of the phone, permanently.** The alternative was to keep
the scroller and add a fade hint, which holds 49px — but it still relies on the operator discovering a
swipe, **and failing to discover that swipe is the reported bug**. A tab that is simply present cannot
be missed. The brief lists wrapping first; I took it, and the cost is named here rather than hidden.

---

## 2. Event types › the price list on a phone

### 2.1 The cause was a decision, with reasons, and the brief reverses it

This is not a hidden column, an overflow or a fixed width. The phone card **deliberately refused to show
the item prices** and said so in its own comment:

> *The switch, the mode, the amount and the rounding are four rows and fit; the per-item grid is one row
> per dish across every type's column, which is unreadable at 390px … IT IS NOT LOST ON A PHONE, AND THE
> LINE SAYS WHERE IT IS.*

and printed, instead of the list:

> *"N typed prices · set them on a bigger screen, or for one event on its dashboard."*

The brief reverses that and names the shape: *"fix it so the items and prices show and can be edited on a
phone. A stacked card per item is fine if a table can't fit."*

**I did not stop for this, and the rule about contradictions is why.** The instruction is to stop when
one instruction contradicts another — not when a brief overrides a decision the code recorded. And the
old reasoning was about **the grid**: one row per dish across *every type's columns*, which is still
unreadable at 390px. **One type at a time, one row per dish, is a different shape.**

### 2.2 What it does now

Under the price rules, a fold: **"Show 23 items ▾"**, with "N set by hand" beside it. Opened, a band per
category and one row per dish — the name on the left, wrapping; the price control on the right in a
fixed 130px block, the same width as the three rule controls above it, so the card has one right edge
rather than four.

**The control is `<PriceCell>` — the component the desktop grid and the dashboard's "Prices for this
event" sheet already use — and the write is the same `set_type_item_price` action.** A price typed on a
phone and one typed on a desktop are the same price through the same arithmetic. A phone-only price
control would have been a second answer to "what will this dish cost at a Festival", which is the one
question this screen exists to answer.

The fold is the **card's own** state, not the grid's `showItems`: this card shows one type, and an
operator who unfolds the items on Festival has not asked to unfold them on Market — and a shared flag
would mean opening the phone card changed the desktop grid.

### 2.3 Measured

In WebKit and Chromium, with the row's lifted classes:

| | 390×844 | 430×932 | 1100 |
|---|---|---|---|
| every price control fully on screen | **yes** | yes | yes |
| control width | 130px | 130px | 130px |
| a 30-character dish name | **wraps to 2 lines** | 1 line | 1 line |
| page scrolls sideways | **no** | no | no |

The name wrapping rather than pushing the control off the edge is the half that matters: *"Nduja & Honey
with Hot Peppers"* takes two lines and the price stays put.

---

## 3. Location settings on a phone

### 3.1 What was wrong

Stacked, the pane sat under a sixty-row table. Choosing a location scrolled the three picture boxes off
the bottom of the screen, so tapping a row appeared to do nothing.

### 3.2 Two screens, below 768px only

- **The list**, full width: the search box, the EVENT / WEEKLY / POSTER ✓ / – columns, and a **`›`** on
  the right of each row. The chevron column is `md:hidden`, so from 768px up the table is the four
  columns it has always been.
- **Tapping a row opens that location on its own screen**: a **"‹ All locations"** link, the name · area,
  the grey *"Name and area come from your schedule…"* line, then the three pictures as compact stacked
  cards, then the social media tag field.
- **The cards**, in the brief's order and with the brief's words:
  | | title | the one grey line |
  |---|---|---|
  | 1 | Picture for event posts | In your single event design's picture space |
  | 2 | Picture for weekly posts | On this location's line of your weekly post |
  | 3 | Location poster | Used instead of your single event design |

  Each has a **72px** thumbnail — `object-contain`, like the desktop preview, because `object-cover`
  showing a wide logo as its middle third is the bug the desktop box fixed and a smaller thumbnail is no
  reason to reintroduce it — or a **dashed empty square**, then the title, the line, and **Remove** or
  **Upload**. The **"Use the … picture" links stay on the empty cards**, beside Upload rather than under
  it, because a 72px card has no room for a third row.

### 3.3 The switch is CSS, and the breakpoint is 768 — not 900

`selectedId` already existed, so "which screen" is `selectedId ? detail : list`, expressed as
`hidden` / `md:block`. **No media-query hook**, which matters: a hook would mean guessing on the server,
so a phone would paint the desktop layout for a frame and risk a hydration mismatch.

**The two-pane grid still starts at 900 and is untouched**, so 768–899 keeps the stacked arrangement it
has today — which is what *"tablet (768px and up) stay exactly as they are"* asks for. The two numbers
are different on purpose, and both files say so where a reader would otherwise tidy them into one.

Both the cards and the boxes are in the tree at every width; CSS decides. **That is why the phone card's
file input id carries a `pic-phone-` prefix**: two `<label htmlFor>` pairs with one id would both bind to
the first input, so a tap on the phone card's Upload would open the desktop box's file picker.

### 3.4 The back gesture

Opening a location on a phone **pushes a history entry**; `popstate` clears the selection. One entry per
open, never two: **"‹ All locations" calls `history.back()`** rather than clearing the state itself, so
the link and the gesture leave the history in the same place. Clearing *and* pushing would strand an
entry and the operator's second back press would appear to do nothing.

The media query is read **at the moment of the tap**, not at render — it is an event handler, so there is
no server render to disagree with. On a desktop nothing is pushed: the list is beside the pane, so back
belongs to the page.

### 3.5 Measured

`scripts/social-tab-render.cjs`, in WebKit and Chromium, at **1100, 1280, 1728, 768, 430 and 390** —
768 and 430 are new, and **768 is the breakpoint itself**: a breakpoint with no measurement *on* it is a
breakpoint nobody has checked, and this repository has shipped four layout bugs past exactly that gap.

- one layout or the other, never both and never neither — **asserted on the computed `display`**, not on
  a rectangle, because a `display:none` element still answers `querySelectorAll` and measures as zeros
  that compare equal to other zeros;
- three cards, in the order event-photo · weekly · poster;
- each thumbnail **72×72**;
- every card inside the pane, and no sideways page scroll;
- at 768 and above: the three boxes, stacked between 768 and 900, as today.

Every one passed in both engines. The thumbnails read **72×72 72×72 72×72** at 390 and at 430, and
*"the three boxes are what is shown, and only one of the two"* holds at 768, 1100, 1280 and 1728 —
which is the "nothing changed on the desktop" half, measured rather than asserted.

---

## 4. The phone design editor — NOT DONE

**I did not build this, and the editor is byte-identical to what it was before this session.** `git diff`
on `components/manage/DesignEditor.tsx` is empty.

### 4.1 What I did, and why I undid it

I started with the piece the brief's last bullet asks for, because it is the part that decides whether
the rest can be trusted: *"use one shared settings component for the desktop panel and the phone sheet,
so they can't drift apart."*

The design I settled on, and still think is right: **`SettingsPanel` gains one optional `only` prop.**
With `only` undefined it renders every group in the order it has today — the desktop is unchanged *by
construction* — and with `only` set it renders one group, which is what a phone tab is. The groups are
not new blocks; they are the blocks the panel already has (`data-look`, the TEXT fields, MAKE IT EASIER
TO READ, MORE OPTIONS) plus two rows the branch already builds as named consts (`showsRow`, `sizeRow`).
A tab that rendered a *copy* of a block would be the drift the prop exists to prevent.

I applied it to the text-box branch and it worked. Then I counted the rest:

- **five more branches** to group (`All text`, nothing-selected, `The 7 days`, the picture, the rows),
  and two of them delegate wholly to `DaysPanel` and `PicturePanel`, so the brief's
  *Layout · Row · Days off · More* and *Picture · Darken* tabs mean grouping inside those components too;
- **the whole phone chrome**: a top bar with the leave guard, a poster pinned under it and sized to the
  space left above the bottom bar *or above the open sheet*, a sideways-scrolling row of square
  icon-and-label buttons with the selected one orange, the grey hint line, and a **draggable bottom
  sheet** — rounded top, handle, item name, ✕, drag up to grow, drag down to close — with tabs inside it.

That is a new screen, not an adjustment to an existing one, and the editor's desktop layout is intricate
enough that building a second layout branch hastily is how the desktop breaks. **Rather than leave a
half-refactored panel and a half-built sheet on the surface an operator uses most, I reverted every line
I had written for §4.** What remained after the text-branch work was `wrap` — dead code, which lint
named — and that was the signal to stop pretending the section was in progress.

### 4.2 One bullet is already true

**"Dragging boxes on the poster works with a finger: move, corner = text size, side = width."**
`DraggableBox` is built on pointer events with `setPointerCapture`, and `touch-action: none` on the box,
the corner handles and the side handles. Its own header says this was not incidental:

> *POINTER EVENTS, NOT MOUSE EVENTS. One set of handlers covers mouse, trackpad, pen and touch … its
> pointer handling took three fixes to get right **on touch** (pointer capture, the clamp to the image,
> the `data-mode` rule that avoids a ref inside a per-handle closure).*

So this bullet describes the editor as it already stands. ⚠️ **I did not add it and I have not measured
it on a device** — the code path is the one the desktop mouse uses, and "it is the same path" is an
argument, not a measurement.

### 4.3 What it needs

In the order I would do it:

1. `only?: SettingsGroup` on `SettingsPanel`, applied to all six branches, and the same prop threaded
   into `DaysPanel` and `PicturePanel`. Self-contained, desktop-identical, measurable on its own.
2. The phone chrome, behind `md:hidden` / `hidden md:block` so the desktop layout is not touched.
3. The sheet's drag, which is the only genuinely new interaction — and the one most worth a harness,
   because "drag the handle up to make it taller" has three failure modes and none of them is visible in
   source.
4. A bundled-editor measurement like `scripts/live-text-place.cjs`: the real `DesignEditor` in WebKit at
   390, asserting the poster is still visible with the sheet open, every tab has content, and the
   desktop at 1100 is unchanged.

---

## 5. What was run

| | |
|---|---|
| `npx tsc --noEmit` | clean |
| `eslint` on every touched file | **0 errors** on `EventTypes.tsx`, `SocialPosts.tsx` and `lib/copy/socialPosts.ts`. ⚠️ `app/manage/[token]/page.tsx` reports **283**, every one of them pre-existing `no-explicit-any` / `no-unused-vars` in a 16,000-line file: this round's change to it is **27 added lines and 1 removed**, and the added lines contain **no** `any` — checked by searching the diff |
| `npx next build` | **clean, "✓ Compiled successfully"**, after the last edit |
| `scripts/social-posts.cjs` | **111 passed** — four new §3 claims |
| `scripts/schedule-graphics-places.cjs` | **259 passed** — the sub-tab row's pin repointed to `flex-wrap` |
| `scripts/event-types.cjs` · `event-pricing.cjs` | 185 · 110 passed |
| `scripts/event-types-render.cjs` | measured in every available engine |
| `scripts/places-posts-gating.cjs` · `plan-feature-order.cjs` | 48 · 29 passed |
| `scripts/social-tab-render.cjs` | **every measurement passed**, WebKit + Chromium, now at **six** widths including 768 and 430. §3's thumbnails read **72×72 72×72 72×72** at both 390 and 430; the cards are what is shown below 768 and the boxes at 768, 1100, 1280 and 1728 |
| `scripts/check-plain-english.mjs` | 111/112, the same pre-existing known violation |
| `scripts/run-harnesses.cjs` | the full sweep, after the last edit — **98 run · 98 passed** |

### 5.0 One flaky harness, named rather than left in the log

`event-types-render.cjs` failed **once** in a sweep — `rc=1` in 40.0s with **no message at all** — and
passes standalone (exit 0, zero failed checks), as it did in two earlier sweeps at 9.8s and 40.8s. Its
six class lifts all still resolve against the file I changed, checked one by one. So this was a
browser/screenshot failure under load, not a finding: the harness prints *"shots disabled after the
first failure"* and a lost screenshot can take the process with it before anything is reported.

**Recorded rather than quietly re-run**, because a harness that can fail silently under load is worth
knowing about: the next person to see `rc=1` with an empty message column should re-run it on its own
before believing it.

### 5.1 The stale-build trap, one day later

§3's first measurement reported the thumbnails as **72×20 and 72×4**. The source was correct. `h-[72px]`
did not exist in `.next/static`, because **Tailwind emits only the utilities it finds at build time** and
the build predated the component — which is the exact failure
`docs/social-tab-7-report.md` §2b wrote up yesterday about `origin-top-left`, in those words: *"a
Tailwind class is only as present as the last build that scanned for it."*

An absent class does not fail; it lays out **differently**. So `appCss()` now refuses a build that is
missing any arbitrary class a claim depends on:

```js
const NEEDED = ['.h-\[72px\]', '.w-\[72px\]', '.h-\[132px\]', '.w-\[20px\]', '.max-h-\[30rem\]']
```

**Matched with `includes` on the selector exactly as it appears in the file, not with a regex** — the
compiled CSS escapes the brackets itself, so a regex has to escape the backslash *and* the bracket, which
I got wrong twice and which reported every class missing on a build that had them all.

### 5.2 Three prose-versus-code collisions, in one day

Worth recording together, because it is now a pattern rather than an incident. A check that reads source
can be satisfied — or broken — by a comment:

1. Yesterday: a claim that `draw.ts` imports no `next/og` failed because the file's own header says so.
2. Yesterday: a guard forbidding the `origin-top-left` class failed because the note explaining its
   removal names it.
3. **Today:** my comment above `SETTINGS_SECTIONS` quoted `id="auto-replies"`, which invented a ninth,
   earlier occurrence and broke a check that the eight section ids appear in the array's order.

The rule each time: **read the construct, not the string** — a `className=`, an `import`, an attribute.
Where that is not practical, the comment is written so as not to contain the literal, and says why.

---

## 6. Rules

- Only `test-truck` (Pizza Kitchen) was read. No other truck was opened, called or changed.
- Nothing was deployed and nothing was pushed.
- **No SQL was run and no migration was needed.**
- No `outreach_templates` row was created, edited, seeded or deactivated. No email was sent.
- No table, column or stored image was dropped or deleted.
- No process was killed.
- **Shared editor changes:** none. §4 is the section that would have touched the shared `DesignEditor`,
  and it is reverted — the file is byte-identical to before this session.
- **No span of the brief arrived garbled, and no instruction contradicted another.** §2 is the one worth
  naming: the code recorded a deliberate decision *not* to show the price list on a phone, with reasons.
  That is a brief overriding a product decision, not two instructions in conflict — so I did it, and
  §2.1 records the decision it reverses rather than quietly deleting it.
- **One section is not delivered and it is §4.** Nothing about it is half-applied: the editor is
  unchanged, and §4.3 is what it needs.
