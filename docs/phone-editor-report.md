# The phone design editor

**10 October 2026 · not deployed · no migration · no SQL run · one truck touched (`test-truck`)**

§4 of the phone fixes is built, in the order §4.3 set out. **The desktop editor is unchanged, and that
is a measurement, not a claim:** every one of the 96 marked elements of the weekly editor and 90 of the
single event editor is in exactly the same place, to the pixel, at 768, 1100 and 1728, in WebKit and in
Chromium — compared against a fingerprint captured on the editor before any of this was written.

---

## 0. The short version

| Step | What was asked | What happened |
|---|---|---|
| 1 | `only?: SettingsGroup` on `SettingsPanel`, all six branches, threaded into `DaysPanel` and `PicturePanel` | **Done.** One component, two instances. With `only` undefined the desktop renders exactly as before — proven by the fingerprint |
| 2 | The phone layout below 768px: top bar, pinned poster, sideways item bar, hint line | **Done.** CSS only (`md:hidden` / `hidden md:block`); no server-side guessing, no width read during render |
| 3 | The bottom sheet: handle, name, ✕, tabs, drag to grow, drag to close, scrolls inside itself | **Done**, and it is **a section of the flex column, not an overlay** — §3.2 is why that mattered |
| 4 | A bundled-editor measurement in WebKit at 390×844 and 430×932, plus a control | **Done.** `scripts/phone-editor.cjs` — **259 checks, both engines, all passing** |

**Four findings worth more than the feature:**

- **A `md:` utility can silently beat a `min-[1100px]:` one.** Tailwind compiles the `md:` block *after*
  the `min-[1100px]:` block, so at 1100px both match and the later one wins. Writing the editor grid's
  column count as a `md:` utility dropped the settings panel below the poster at **every desktop size**.
  The fingerprint caught it. §5.1.
- **`hidden` loses to `inline-flex` on the same element, and nothing warns you.** `hidden md:inline-flex`
  on a button that already carried `TOOL_BTN` (which contains `inline-flex`) did nothing: Redo stayed on
  the phone bar and wrapped it onto a second row. It type-checks, it builds, it lints. **A screenshot is
  what found it.** §5.2.
- **A sheet laid *over* the poster is not the sheet the brief asked for.** The first build was
  `fixed inset-x-0 bottom-0`: the poster was not resized at all, only hidden from the middle down, and
  the sheet covered the item bar — so the selected button could not be the orange one. §3.2.
- **The harness can be wrong in the direction that reads as a product bug.** Three of the first run's
  failures were mine, not the editor's: `getComputedStyle` reports a child's own `display` even when its
  parent is `display:none`; React had not flushed when a synchronous `getBoundingClientRect` ran; and the
  leave guard lives in `SocialPosts`, not in the editor. §5.3.

---

## 1. Step 1 — one settings component, two instances

### 1.1 The prop

```ts
export type SettingsGroup =
  | 'words' | 'size' | 'style' | 'readable' | 'more'   // a text box, and All writing
  | 'layout' | 'row' | 'daysoff'                       // The 7 days
  | 'picture' | 'darken'                               // the background
```

`SettingsPanel` takes `only?: SettingsGroup`. Inside it, two helpers do all the work:

```ts
const show = (g: SettingsGroup) => only === undefined || only === g
const wrap = (body, title?, subtitle?) =>
  only === undefined ? shell(body, title, subtitle) : <div data-phone-sheet-body>{body}</div>
```

With `only` undefined every `show()` is true and `wrap` is the panel's own `shell` — **the desktop is
unchanged by construction, not by care.** With `only` set, one group renders, with no card chrome around
it, because the sheet supplies its own.

All six branches return `wrap(...)`. `DaysPanel` has its own `only` and its own `show()`.

### 1.2 The tabs are derived, never written down

`groupsFor(key)` returns the tabs for an item, and it returns **only tabs that will draw something**:

| Item | Tabs | Why those |
|---|---|---|
| 🖼 Picture (the background) | Picture · Darken | the two halves of the background card |
| The 7 days | Layout · Row · Days off · More | the four blocks `DaysPanel` already has |
| Aa All writing | Size · Style · Readable · More | no Words — it has no words of its own |
| A text box | Words · Size · Style · More | **Readable only when the box owns its style** |

That last row is the point of deriving rather than listing. The panel draws "Make it stand out" only for
a box with its own style (`show('readable') && owns`), so a following box would get an **empty tab**.
Style, by contrast, is always there: that tab holds the *Match the other writing / Style this one on its
own* switch, which is how a box comes to own its style in the first place.

⚠️ **I got this wrong first and the harness said so.** I had gated Style on `owns` too, which left a
following text box with three tabs; the check that every listed tab has at least one control in it is
what made the difference between "it looks finished" and "it is".

### 1.3 The picture card's two tabs are a partition

`pictureCard(only?)` shows the thumbnail, the size line and *Replace picture* under `'picture'`, and the
darken slider under `'darken'`. **It drew the picture block on both at first**, so the Darken tab
repeated the thumbnail and Replace above its slider and the two tabs stopped meaning different things.
A screenshot found it; a check now holds it (§4.2).

---

## 2. Step 2 — the phone layout

### 2.1 It is a shell, and that is what makes "never scrolls away" true

```
fixed inset-0, flex column          ← the shell IS the viewport, so there is no page to scroll
├─ top bar            shrink-0
├─ the editor grid    grow, min-h-0
│   └─ stage area     grow          ← the poster takes whatever is left
├─ the item bar       shrink-0
└─ the sheet          shrink-0      ← when it is open
```

A poster pinned with `sticky` inside a scrolling page still goes when the page goes. A shell that **is**
the viewport has no page to scroll — and the page not scrolling is asserted in both directions, at both
phone sizes, on every tab of every sheet.

The stage area being `grow` is also the whole of the sizing arithmetic: the editor already measures that
area and fits the poster to it, so **the phone needs no second calculation**. Measured at 390×844: taking
160px off the screen took 160px off the poster's area (622 → 462).

At 768px and up, `md:static md:block md:space-y-3 md:bg-transparent md:p-0` put the page back exactly as
it was.

### 2.2 The top bar is one bar, not two

The same element, the same `onBack`, the same Save. What changes is which parts show:

| | phone | desktop |
|---|---|---|
| back | `‹` (+ `sr-only` label) | `‹ Designs` |
| Preview with | — | the select |
| Preview post | 👁 (+ `sr-only` label) | 👁 Preview post |
| Undo | ↶ | Undo |
| Redo · Cancel | — | both |
| Save | orange, "Save design" | the same button |

⛔ **A second phone top bar would be a second "‹" to wire to the leave guard, and a second Save.** The
harness asserts there is exactly one back button in the editor.

Redo and Cancel are hidden rather than dropped: Redo is ⇧⌘Z on a keyboard, and **Cancel *is* "‹"** — the
back link asks about unsaved work, which is what Cancel did.

### 2.3 The item bar

The brief's lists, written down once in `phoneItems`:

- **weekly** — `Aa All writing · ¶ Week heading · ▤ The 7 days · ＋ Add text · 🖼 Picture`
- **single event** — `Aa All writing · 📅 Date · 📍 Venue · 🏘 Area · 🕒 Time · ＋ Add text · 🖼 Picture`

Measured: the weekly bar's five buttons fit 390px in one row; the event design's **seven come to 508px in
a 390px bar and really do scroll sideways**, with the page itself still not scrolling. That is why the bar
is a scroller, and it is asked where it has to be true.

Two decisions inside that list:

- **🖼 Picture is the *background*** — the truck's own artwork, Replace and Darken. That is what an
  operator means by "the picture" of their poster, and it matches the brief's two tabs exactly. The
  per-location picture box is reached by tapping it.
- **"＋ Add text" adds *and opens*, on the Words tab.** Adding without opening would leave an empty box
  on the poster and no way in. The new box's key is computed before the add, because the commit has not
  run when `openSheet` asks.

### 2.4 Tapping the poster opens the sheet too

One function, two call sites:

```ts
const pickOnPoster = (key: ItemKey) => { setSelected(key); openSheet(key) }
```

`selectPartAt` hit-tests the day cells and reports a part; every other box reports itself from
`DraggableBox`. **It is not guarded by a media query, deliberately** — the sheet is `md:hidden`, so on a
desktop this sets some state and renders nothing, which is cheaper and safer than asking the window how
wide it is on every tap, and leaves the desktop's fingerprint untouched.

Measured: tapping the words in a day row opens the sheet titled **"Place"** — an item that has no button
in the bar at all, which is the case that proves the two paths are not the same path.

---

## 3. Step 3 — the sheet

### 3.1 What it is

Rounded top, a drag handle, the item's own name (from the same `items` list the desktop panel names it
from, so the two cannot call one box two things), ✕, then the tab pills and a `min-h-0 grow overflow-y-auto`
body. It opens at half the screen, and its height is **a number in state** — a dragged size cannot be a
breakpoint.

### 3.2 ⛔ It is a section of the flex column, not a `fixed` overlay

This is the one real design correction in the session, and it came from a screenshot.

I built it first as `fixed inset-x-0 bottom-0 z-50`, which is the conventional bottom-sheet shape. Two
things were wrong with it, and the measurements had said neither:

1. **The poster was not resized — only hidden.** The brief asks for the poster *"sized to the space left
   above the bottom bar **or above the open sheet**"*. A `fixed` sheet takes no space in the flow, so the
   stage area kept its full height and the sheet covered its bottom half. What is hidden is wherever the
   operator was working.
2. **The sheet covered the item bar**, so the selected button could not be the orange one the brief asks
   for, and switching from Date to Venue meant closing the sheet first.

In the flow, the stage area's `grow` **is** that sentence of the brief. The sheet takes its height, the
poster gives up exactly that much, the ResizeObserver fires and the poster refits — smaller, and wholly
visible. ⚠️ **A spacer the sheet's height would have fixed the first fault only, and written the same
number in two places.**

Measured at 390×844 with the sheet open: **0px of overlap**, 236px of poster above it, and the item bar
on screen between the two (342–410, with the sheet from 422).

### 3.3 The handle, and what stops it

`clampSheet` expresses its ceiling as **what is left for the poster**, not as a share of the screen:

```ts
const POSTER_FLOOR = 380          // the poster's area AND the chrome above and below it
const clampSheet = px => Math.max(SHEET_MIN, Math.min(Math.max(SHEET_MIN, h - POSTER_FLOOR), px))
```

A percentage cannot say *"stop short of covering the poster completely"*: 72% of a short screen leaves
less than 72% of a tall one does. The first value I chose (300) let the handle squeeze the poster's area
to **54px** — the check is what said so, and 380 is the measured replacement (the chrome above and below
the poster came to 246px at 390×844).

Measured: dragging up grows the sheet and stops with 194px of poster left; dragging down closes it; ✕
closes it; and the page does not scroll on **any** tab of **any** of the three sheets.

---

## 4. Step 4 — how it is measured

`scripts/phone-editor.cjs` — 918 lines, listed in `scripts/harnesses.json` under `needs_a_browser`
(it needs a completed build and both engines, so it is run by hand, like `live-text-place.cjs`).

It bundles the **real `DesignEditor`** with esbuild and mounts it in WebKit and Chromium over a tiny local
HTTP server that answers the font request with the committed Oswald file. **259 checks, both engines, all
passing.**

### 4.1 The desktop half — a fingerprint, not a list of rules

`docs/phone-editor-baseline.json` records every `data-`marked element's rounded rectangle and computed
`display`, at 768 / 1100 / 1728 × weekly / single event × WebKit / Chromium — **captured on the editor
before any of this was written, and never to be regenerated to make a run pass.**

Every run compares and reports three ways an element can differ: **GONE**, **APPEARED**, **MOVED** (with
both rectangles). 96 elements on the weekly editor, 90 on the single event editor, and all of them
identical at all three widths in both engines.

⛔ **The phone's own markers are exempt one by one, by name — not by a `startsWith('phone')` prefix.** A
prefix match would also wave through a marker added later to a desktop element and never notice, which is
the one thing that section is for. Five of the exempt markers sit on elements the desktop also draws (the
top bar, the back/undo/save buttons, the stage area); those elements are still pinned by the baseline's
own markers on and around them — `previewPost=true` inside the top bar, `stageArea=true` on the stage area
itself.

Beside the fingerprint, two claims the fingerprint cannot make:

- the item bar, the hint and the sheet are **not rendered at all** at desktop widths (not merely pushed
  off-screen — `display:none`, so they cost the desktop no layout);
- the editor grid really has **two columns at 1100 and 1728, one at 768** — read off the element, because
  this is exactly where a cascade-order mistake hides (§5.1).

### 4.2 The phone half

At 390×844 and 430×932, in both engines: the three parts drawn and in order down the screen; the page
not scrolling in either direction; the poster's area sized to the space left (proven by shrinking the
screen 160px and watching it give up 160); the hint line with nothing selected; the brief's item list in
order; the bar a one-row sideways scroller; the sheet opening at about half the screen with no overlap and
the bar still between; **every tab of all three sheets holding at least one real control**; the picture
sheet's two tabs showing one thing each; the handle growing, stopping and closing; ✕ closing; tapping the
poster opening that item's sheet; a box dragged **with a finger** (real `PointerEvent`s with
`pointerType: 'touch'`, which is what `DraggableBox` is built on — a mouse drag would prove the desktop
path, which was never in doubt); Save handing the layout out; and the leave guard.

**The leave guard needed the harness to keep the real host's side of the contract.** The editor does not
own that dialog and must not: `SocialPosts` holds it and hands the editor an `onBack` that is already
guarded. So "the phone ‹ has the same guard" is a claim about *wiring*, and the harness's host now does
what `SocialPosts` does — asks the dirty flag, shows a dialog, does not navigate. The check asserts the
dialog appeared **and** `onBack` did not fire, and separately that the editor really was dirty first, so a
gesture that did nothing fails as "nothing to guard" rather than as "the guard is broken".

### 4.3 The control

The sheet is forced to the full height of the screen with a stylesheet rule — a CSS rule rather than a
patched component, so the control is over the real component's real geometry — and the claim refuses it:
**0px of poster left**, caught.

There is a second, quieter control in the file: a **source-construct guard** that fails if any `className`
in the editor puts `hidden` beside another display utility, with the shared class constants expanded
(§5.2). And a third: the build-staleness guard, now listing every arbitrary class these claims rest on,
including the 1100px two-column rule.

### 4.4 Screenshots

`node scripts/phone-editor.cjs --shots` writes 12 PNGs to `docs/screenshots/phone-editor/` — every sheet
and tab at 390, the event bar, the "All writing" sheet at 430, and the desktop at 1100 and 1728.
**They are for eyes, not for claims:** every claim in the file is a measurement, and the pictures exist so
a person can see the screen those numbers describe. Two of this session's four real bugs were found in
them and in nothing else.

---

## 5. The findings

### 5.1 A `md:` utility can beat a `min-[1100px]:` one

Tailwind compiles the `md:` block **after** the `min-[1100px]:` block (measured: offsets 102,930 and
98,479 in the same stylesheet). At 1100px both match, so the later one wins — the opposite of what reading
the class list suggests.

Writing the editor grid's column count as a `md:` utility therefore beat
`min-[1100px]:grid-cols-[minmax(0,1fr)_380px]`, and the settings panel dropped below the poster at every
width ≥1100. The fingerprint reported it as `stageArea` going 704→1100 wide and `stage` sliding 198px
right. **The column count is unprefixed now** — the base layer comes before every media query, which is
where the original had it, and it costs the phone nothing because the shell is `flex` there.

⚠️ **I first wrote this guard as a search of the compiled CSS for the offending class name — and it
matched my own comment about it.** Tailwind scans prose as well as code and had emitted the class *because
the comment mentioned it*. The guard is a measurement on the element now, and the note in the component
says not to spell the class name out.

### 5.2 `hidden` loses to `inline-flex`, silently

`hidden md:inline-flex` on the Redo button did nothing. `TOOL_BTN` already carries `inline-flex`; both are
base-layer utilities for `display`, and `.inline-flex` is compiled after `.hidden` (41,985 against 41,906),
so Redo stayed on the phone bar and wrapped it onto a second row — costing the poster 60px and showing the
full "👁 Preview post" beside it.

It type-checks. It builds. It lints. **The screenshot is what found it.** Cancel, two lines below, was
correct the whole time *because it was already written as a wrapper* — a `<span>` whose only classes are
the two display ones has nothing to argue with.

The harness now reads every `className` in the editor, expands the shared class constants, and fails if
`hidden` shares one with another display utility. **The construct, not the prose** — the same lesson as
§5.1, in the other direction.

### 5.3 Three of the first run's failures were the harness's, not the editor's

Worth recording, because each would have read as a product bug:

- **"no phone chrome is rendered" failed at every desktop width.** `getComputedStyle` on a child of a
  `display:none` parent still reports the child's *own* display, so a bar inside a hidden wrapper read as
  shown. Counting layout boxes (`getClientRects().length`) is the only honest answer to "is this on the
  screen". And the **top bar was never phone-only** — it is the bar the desktop has always had.
- **"a box can be dragged with a finger (moved 0,0)" on a drag that worked.** React batches the state the
  drag sets and flushes it in a microtask; the measurement was in the same synchronous block as the
  `pointerup`. The gesture and the measurement are two evaluates now, with a wait between.
- **"‹ with unsaved changes ASKS" on a guard that is correct.** The guard is the host's, not the editor's
  — §4.2.

A fourth was a flat mismatch: the harness had been written against item keys the design does not use
(`date` in the weekly bar, `place-picture` for the background). The brief governs, so the harness was
corrected to the brief's two lists.

### 5.4 The JSX comment inside `&& (`

For the second time in this workstream, `{cond && ( {/* … */} <div>` — which is not valid, and which the
parser reports a dozen lines later. The comment belongs above the guard. (And a comment that *contains*
`*/` closes early, which is how the first fix of it failed too.)

---

## 6. What was run

| | |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx eslint` on the two touched components | **0 errors**, 3 pre-existing `<img>` warnings |
| `npx next build` | compiled successfully |
| `node scripts/phone-editor.cjs` | **259 checks, 2 engines, all passing** |
| `node scripts/phone-editor.cjs --shots` | 12 screenshots |
| `node scripts/run-harnesses.cjs` | **98 harnesses, all green** (`rc=0`) |

### 6.1 Two harnesses read the editor's source, and both needed updating

`design-editor.cjs` and `place-pictures.cjs` are source-reading harnesses, and three of their assertions
were written against literals this work changed. **The claims survived; the strings did not.** Each was
rewritten to read the construct:

- **the two-column grid** was matched as one adjacent string, `grid-cols-1 min-[1100px]:grid-cols-[…]`,
  which broke the moment the element gained the phone's classes between them. It reads the element's
  class list as **tokens** now, and the sharpest clause is the new one: the column count must be
  unprefixed, for the reason §5.1 gives.
- **the stage area's className** and **`pictureCard`'s signature** are the new literals.
- **the hint sentence** is now desktop-only words inside the same paragraph, and the check says so —
  including that the live-font warning is still outside the hidden span.
- **the inline back button** gained `data-phone-back`.

⚠️ **And two clauses of `place-pictures.cjs` were failing for a reason that has nothing to do with this
work:** `★ Main` and `PLACE_OWN_POSITIONS_LINK` are searched for in `SocialPosts.tsx` to prove they are
gone — and both are **written down in the tombstone comments that record their removal**, so the search
found the obituary and reported the deceased alive. Those two clauses use the comment-stripped source
now. **Third time in this workstream that a check has been broken by a comment quoting the literal it
looks for**, which is why §5.1's guard was rewritten as a measurement rather than a search.

### 6.2 One sweep failure that is not this work's

`add-order-refresh-inputs.cjs` failed in the **first** sweep (`rc=1`, 438.2s, 1 check). It is in the
add-order flow and touches none of the files in §8. It then **passed standalone (`rc=0`, every check
green), and passed again in a second full sweep — 98 of 98, `rc=0`.**

This is the second flake of this shape in two days: `event-types-render.cjs` did the same thing
yesterday. Both look like contention under a 98-harness sweep rather than a defect. ⚠️ **Recorded rather
than quietly re-run**, because a harness that fails only under load is still telling you something, even
if what it is telling you is about the sweep and not about the code.

⚠️ `scripts/phone-editor.cjs` is listed in `scripts/harnesses.json` under `needs_a_browser`, with the
reason the other browser harnesses give: it needs `.next/static` from a completed build and both engines,
and a sweep that silently skipped it would report green for a layout nobody measured.

---

## 7. The rules

| Rule | What happened |
|---|---|
| Test only on Pizza Kitchen | Nothing was opened, called or changed for any truck. The harness mounts the component with its own fixtures and its own `onSave` callback; it writes nothing anywhere |
| Never deploy or push | Neither was done |
| Never run SQL | None was run, and none is needed — there is no migration in this work |
| Never kill by name or pattern | One process was stopped, by the PID I read from `ps` (74716, with its shell 74715). It was a run of this harness whose output pipe I had closed with `head -20`, not the harness hanging |
| No outreach_templates, no emails, no dropped tables, no deleted images | None touched |
| **The desktop must not change at 768 and wider** | **Proven both ways round**: 96 and 90 marked elements identical to the pixel at 768, 1100 and 1728 in both engines, against a baseline captured before the work — plus the grid's column count read off the element at each width, and the screenshots at 1100 and 1728 |
| One shared settings component, no copies | `SettingsPanel` is rendered twice from one `panelProps` bundle; the only difference is `only`. `pictureCard` is one function called with and without a group |

Nothing in the brief arrived garbled, and no instruction contradicted another.

---

## 8. Files

| File | |
|---|---|
| `components/manage/DesignEditor.tsx` | the `only` prop, the phone shell, the item bar, the sheet |
| `lib/copy/socialPosts.ts` | the phone hint, the item names and the tab names |
| `scripts/phone-editor.cjs` | **new** — the measurement |
| `docs/phone-editor-baseline.json` | **new** — the desktop fingerprint. ⛔ Commit it, and never regenerate it to make a run pass |
| `docs/screenshots/phone-editor/` | **new** — 12 screenshots |
| `scripts/harnesses.json` | the harness listed under `needs_a_browser`, with its reason |
| `scripts/design-editor.cjs` · `scripts/place-pictures.cjs` | three assertions rewritten to read the construct rather than the old literal — §6.1 |
