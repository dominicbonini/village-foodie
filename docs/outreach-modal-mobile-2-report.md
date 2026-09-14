# The outreach prospect modal on a phone — round two

**14 September 2026.** One file changed: `components/admin/OutreachPanel.tsx` — **21 lines, and every
token that differs from `HEAD` is `max-sm:`-prefixed.** Nothing staged.

⚠️ **I CANNOT SEE A SCREEN.** Every layout statement is a READ of the class chain or the output of a real
Tailwind compile. Nothing was observed rendering.

🔴 **ONE OF THE TWO FIXES IS ONLY PARTLY BUILT, ON PURPOSE.** Fix A (the overlap) is done. Fix B's core —
moving UPCOMING / LAST CONTACTED / the demo link / Do not contact into the scrolling body — **cannot be
expressed as an added `max-sm:` class**, and the brief says to stop and report rather than make such a
change. I stopped. What I *could* do within the constraint recovers ~32px of ~284px. §Phase 2 sets out
exactly what the move would be so you can approve it.

---

## 🔴 PREMISES — what was wrong

1. **The specific hypothesis in 0a is PART right and PART wrong**, and the difference decides the fix.
   You offered three candidate causes. Compiled and read:
   - *"the track is `1fr` rather than `minmax(0,1fr)`"* — **REFUTED.** 🧪 `grid-cols-4` compiles to
     `grid-template-columns: repeat(4, minmax(0, 1fr))`. The **track can already shrink to zero.**
   - *"the input carries a width that ignores its container"* — **REFUTED.** `fieldCls` carries `w-full`,
     i.e. `width:100%` of its parent.
   - *"`min-w-0` is absent on the item"* — 🔴 **CONFIRMED, and it is the whole cause.** Each control sits
     in `<label className="block">`, which is a **grid item**. A grid item's `min-width` computes to
     `auto`, and the automatic minimum size is its **min-content** contribution. So the track is 79.5px
     while the item refuses to go below the date control's intrinsic width and **overflows its track**,
     painting over the neighbour. The `16px` font increase raised that intrinsic width; it did not create
     the mechanism.
2. **Everything else in the earlier report held** — the `max-sm:` mechanism, the inline
   `gridTemplateColumns` finding, and the touch-target list. Re-verified where load-bearing (below).

### The two git commands, verbatim

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   components/admin/OutreachPanel.tsx
	modified:   docs/onboarding-flow.md
	modified:   docs/reference-manual.md

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	docs/outreach-modal-mobile-report.md

no changes added to commit (use "git add" and/or "git commit -a")
════
3a95e9f demo
5e57c45 scraper
7a9b823 landing and scraper
6e1259b scraper updates
9e83a5e migration changes
```

### Scope — re-confirmed admin-only

`OutreachPanel` is imported by `app/admin/page.tsx` alone; `app/admin/outreach/page.tsx` is a server
`redirect('/admin?tab=outreach')`. The file exports **only** its default, and every symbol touched this
round — the log-row `div`, its four `<label>`s, the header `div`, the meta `div` — is inside it. Nothing
shared with an operator or customer surface was opened.

---

# PHASE 0 — DIAGNOSIS

## 0a · The LOG A CONTACT row, and why it overlaps

```
container  <div className="grid grid-cols-4 gap-2 flex-shrink-0">
             → grid-template-columns: repeat(4, minmax(0, 1fr))      [COMPILED, not assumed]
 item ×4   <label className="block">        ← a GRID ITEM: min-width computes to `auto`
             <span className={labelCls}>…</span>
             <input type="date" className={fieldCls}>   fieldCls = 'w-full … text-sm max-sm:text-base …'
```

**The arithmetic at 390 × 844**, all of it derived from the class chain:

| step | width |
|---|---|
| viewport | 390 |
| − overlay `max-sm:p-2` (8 + 8) | 374 |
| − body `max-sm:p-4` (16 + 16) | 342 |
| − 3 × `gap-2` (8) | 318 |
| ÷ 4 tracks | **79.5px per track** |

A native `input[type=date]` at **16px** renders its date text plus the UA's calendar affordance; with
`px-2` (16px) and 2px of border its min-content is ≈ **100–115px**. 79.5 vs ~105 ⇒ an overflow of
**≈ 20–35px**, and Dominic measured **15–20pt**. At 430 × 932 the track is (382 − 24)/4 = **89.5px** —
still short, so **430 was broken too** even though the screenshot came from a 390-class device.

🔴 The item overflows **rightward into the next track**, which is why it *paints over* the select rather
than being clipped: grid items are positioned by track lines, and overflow is not clipped by the track.

⚠️ **I could not measure the UA control.** Its intrinsic width is decided by iOS Safari, not by our CSS,
so 100–115px is an estimate from the font size and padding. That is exactly why the fix below carries a
second, unconditional guard rather than relying on the number.

### The sweep — every native date/time input in this modal

🧪 `type="date"|"time"|"datetime-local"|"month"|"week"` searched **alone** across the file: **2 hits, both
`type="date"`.** *Positive control over the same file:* `type="checkbox"` returns **3**, so the search
finds what is there.

| # | control | container | at risk? |
|---|---|---|---|
| 1 | **Contacted on** | `grid grid-cols-4` — a **grid** track, no `min-w-0` | 🔴 **YES — the observed defect** |
| 2 | **Follow up on** | `flex flex-wrap items-center gap-1.5` | **NO** |

🔴 **Why #2 does not show the same symptom, and it is not luck.** It is a **flex item in a *wrapping*
flex container.** A flex item also gets `min-width: auto`, so its intrinsic width is respected identically
— but `flex-wrap` has somewhere to put the excess: the four quick buttons (Tomorrow / +3 days / +1 week /
Clear) **wrap onto the next line** instead of being overlapped. The grid row had no such release, because
`grid-cols-4` fixes the track count. So the screenshot shows one and not the other **because of the
container, not because the second input is narrower.** It was still fixed-adjacent enough to check, and it
needs no change.

## 0b · The locked area, measured

Both bars are **`flex-shrink-0` children of the panel's flex column**, and the scroller is the *body*
(`max-sm:overflow-y-auto`), which is their **sibling** — so neither can scroll away. That is the
structural reason, not just a styling one.

**Header** — `px-5 py-3 … max-sm:flex-wrap max-sm:gap-y-2 max-sm:px-4` (before this round):

| part | px |
|---|---|
| `py-3` top + bottom | 24 |
| row 1 — `h3` `text-lg`, `max-sm:w-full max-sm:order-first` | 28 |
| row 2 — two `ModalThumb` at `w-11 h-11` | 44 |
| row 3 — the prev / position / next / Close group (`text-sm px-2 py-1.5`) | 34 |
| 2 × `max-sm:gap-y-2` | 16 |
| **header total** | **≈ 146** |

**Meta strip** — `px-5 py-2 text-xs … max-sm:gap-y-2 max-sm:px-4`:

| part | px |
|---|---|
| `py-2` top + bottom | 16 |
| row 1 — Stage label + `select` (`max-sm:text-base` 24 line + `py-1.5` 12 + border 2) | 38 |
| row 2 — Last contacted (`text-xs`, wrapped off row 1) | 16 |
| row 3 — the demo chip + Copy (`max-sm:w-full` group) | 24 |
| row 4 — Do not contact | 20 |
| 3 × `max-sm:gap-y-2` | 24 |
| **meta total** | **≈ 138** |

**Locked chrome ≈ 146 + 138 = 284px of 844 = 33.6%.** Dominic said "about a third". ⚠️ Derived from the
class chain and Tailwind's line-heights; the wrap points depend on text widths I cannot measure, so treat
±20px as the honest band.

## 0c · What the meta strip actually contains, classified from the code

| item | what the code does with it | class |
|---|---|---|
| **Stage** `<select>` | `onChange` → `patchProspect(id, { stage })` — **writes on every change** | 🔴 **ACTED ON REPEATEDLY** |
| Upcoming (count + last event date) | static text from server-derived fields | READ ONLY |
| Last contacted | static text, `fmtDate(lastContactedAt)` | READ ONLY |
| Demo link + Copy + expires | `<a>` + a clipboard `<button>` + text — copy it, send it | USED ONCE |
| Create demo (when no demo) | `setCreateDemoForId` → opens the child modal | USED ONCE |
| Do not contact | a checkbox that patches — a one-off flag per prospect | USED ONCE |

🔴 **The classification SUPPORTS Dominic's steer exactly**: Stage is the only control here that is touched
repeatedly; everything else is read-once or use-once. It does not contradict it, so there is nothing to
counter-propose on the *product* question. The obstacle is mechanical, not editorial — see Phase 2.

---

# PHASE 1 — FIX A, the overlap

**Chosen: `max-sm:grid-cols-2` on the row, plus `max-sm:min-w-0` on all four labels.**

| option | verdict |
|---|---|
| **Two columns below sm** (chosen) | 🧪 compiles to `repeat(2, minmax(0,1fr))`. At 390px each track is (342 − 8)/2 = **167px**; at 430px **187px**. Both comfortably exceed the ~100–115px the date control needs, with ~50px of slack for a longer locale format or Dynamic Type. Keeps a grid, keeps reading order (Contacted on · Channel / Direction · Kind), one class. |
| **Zero minimum alone** (`min-w-0` only) | Stops the overlap but leaves the date control **squeezed to 79.5px**, where iOS clips its own date text — a control you cannot read. Correct mechanically, poor as a fix. Kept as the *guard*, not the fix. |
| **Let the row wrap** (`flex flex-wrap`) | Each control sizes to content, so the four land unpredictably — one row, two, or three depending on the longest `<option>`. Unpredictable chrome height on the surface whose height is the other complaint. |
| **Stack Contacted-on alone** | Four rows of one, tallest of all the options, on the screen that is already too tall. |
| **Shrink the font back** | ✗ Explicitly excluded — reintroduces iOS zoom. |

🔴 **Both were applied, and the second is the one that makes the claim safe.** `max-sm:grid-cols-2` fixes
it *if my 100–115px estimate is right*; `max-sm:min-w-0` removes the `min-width:auto` floor so that **even
if the UA control is wider than I estimated, the worst case is a clipped control rather than one painting
over its neighbour.** I cannot measure the UA width, so I did not want the fix to depend on my estimate.

**The sweep's other input (Follow up on) needed no change** — its `flex-wrap` container already absorbs
the overflow (0a).

---

# PHASE 2 — FIX B, and where I stopped

## 🔴 The move you asked for cannot be a `max-sm:` class, so I did not make it

The panel is a flex column of three siblings:

```
panel  flex flex-col ... overflow-hidden
  ├ header   flex-shrink-0          ← locked
  ├ meta     flex-shrink-0          ← locked  (Stage lives here)
  └ body     flex-1 min-h-0 max-sm:overflow-y-auto   ← THE scroller
```

To make UPCOMING / LAST CONTACTED / the demo link / Do not contact scroll away **while Stage stays
locked**, those four must become **descendants of `body`**. No CSS can reparent a node:

- Making the **panel** the scroller instead (`max-sm:overflow-y-auto` on it) scrolls the header *and*
  meta — so **Stage scrolls away too**, which is the one thing you asked to keep.
- Making header and meta `sticky` inside that scroller returns the locked height unchanged.
- `position: sticky` on the Stage `<label>` alone sticks it within **meta**, its containing block — so it
  leaves with meta.

The only routes are a **JSX move** (changes the desktop DOM) or **rendering the group twice** with
`max-sm:hidden` / `hidden max-sm:flex` — which duplicates two stateful components (`DemoLinkChip` holds
`copied`; `DoNotContactToggle` is a bound checkbox) and is a restructure. The brief says: *"If a move
requires restructuring the component, STOP and report instead."* **Stopped.**

**What the move would be, if you approve it** — for the record, not applied: lift the three read/use-once
`<span>`s and the `ml-auto` group out of the meta `div` and re-insert them as the **first child of the
right column root** inside `Detail`, wrapped in `<div className="sm:hidden">`, leaving the meta strip's
desktop copy in place with `max-sm:hidden`. DOM order stays sensible (they land above LOG A CONTACT, where
they read as context), and no `order-*` is needed. It is ~15 lines and it changes the desktop DOM by two
always-hidden wrappers — a weaker desktop proof than today's, which is precisely why it is your call.

## What I did apply — density, within the constraint

| change | saves |
|---|---|
| header `max-sm:py-2` (was `py-3` = 24px) | 8 |
| header `max-sm:gap-y-2` → `max-sm:gap-y-1`, 2 gaps | 8 |
| meta `max-sm:py-1.5` (was `py-2` = 16px) | 4 |
| meta `max-sm:gap-y-2` → `max-sm:gap-y-1`, 3 gaps | 12 |
| **total** | **≈ 32px** |

**Locked chrome ≈ 284 → 252px, i.e. 33.6% → 29.9% of 844.** A real but modest gain. The structural gain
is in the move above.

## The thumbnails — reported, deliberately not shrunk

`ModalThumb`'s `box` is **`w-11 h-11` = 44 × 44px**, and the two of them plus `gap-3` occupy a 44px row.
They *could* be `max-sm:w-8 max-sm:h-8`, saving 12px — **and I did not, for two reasons read from the
code:**

1. 🔴 **The `✕` delete badge is `absolute -top-1 -right-1 w-4 h-4` — a fixed 16px.** On a 44px thumb it
   overhangs a corner; on a 32px thumb the *same* 16px badge covers a far larger share of the target, so a
   thumb tap becomes materially more likely to land on **delete**. The brief says do not make them easier
   to hit by accident. Shrinking the thumb does exactly that without touching the badge.
2. The same `box` class is shared by the image, the broken-image state and the empty drop target, which
   render `text-[9px] text-center leading-tight` copy inside the box. At 32px that copy has ~14px of
   height to live in.

12px is not worth either. Their behaviour is unchanged in every respect.

---

# VERIFICATION

**Instruments, and what each would look like if it proved nothing.**

- 🔴 **A real Tailwind compile** through the repo's own `@tailwindcss/postcss`, because this file's history
  records a class silently failing to generate. *Null result:* a compile that errors and reports
  everything absent — **which is what happened twice in the previous round**. Excluded by compiling a
  **negative control class alongside**, which must be ABSENT; if everything is absent, so is the signal.
- **A structural desktop differ**, token-by-token against `HEAD`. *Null result:* a differ too coarse to
  notice a changed token. *Control:* fed `grid-cols-4` → `grid-cols-3`, it reports both tokens.
- **A wrap- and comment-aware control audit.** *Null result:* a line-based grep — **which is what v1 was.**

### 1 · Desktop unchanged

**21 changed lines · 0 unpaired insert/delete · 0 lines touching a non-`max-sm:` token.**

The claim this round is slightly wider than last time and is stated rather than glossed: two edits
**replace** a `max-sm:` token (`gap-y-2` → `gap-y-1`) rather than only adding one. **A removed `max-sm:`
token cannot affect ≥ 640px either**, by the same media query — so the checker asserts that *every token
that differs in either direction is `max-sm:`-prefixed*, which is the same guarantee reached one step
more generally. 🧪 All 23 `max-sm:` tokens in the file compile; the negative control is absent.

### 2 · 🔴 The load-bearing override, re-verified as instructed

Adding `max-sm:grid-cols-2` changed what the file emits, so both cascade claims were recompiled:

```
165:  .flex {
168:  .grid {
181:  .max-sm\:flex {          ← still AFTER .grid ⇒ still wins below 40rem
```
```
162:  .grid-cols-4 {
165:  .max-sm\:grid-cols-2 {   ← AFTER ⇒ two columns win below 40rem
```

Equal specificity, later rule wins; `max-sm:` carries `@media (width < 40rem)` and `sm:` carries
`(width >= 40rem)` — exact complements.

### 3 · The overlap, by arithmetic — and what I could not do

Track width goes **79.5px → 167px** at 390, and **89.5px → 187px** at 430, against a control needing
~100–115px; and `min-w-0` removes the overflow floor regardless of that estimate. 🔴 **I could not see it.
What still needs Dominic's eye:** whether the date control at 16px actually fits 167px on his device
(locale date format and Dynamic Type both move it), and whether the two-row layout reads well — checklist
R1/R2.

### 4 · Font sizes still ≥ 16px

Re-run: **13 controls in the modal covered — 11 text controls at `max-sm:text-base` (16px) and 2
checkboxes, which carry no text and cannot trigger zoom. Uncovered: NONE.**

🔴 **How this run avoids v1's defect.** v1 joined a tag's wrapped attributes by scanning for `>` — and
stopped at the `>` inside `onChange={e => …}`, so a control whose `className` was on the next line read as
"no text class". v2 strips `=>` before looking for the tag end, and strips comments first (v1 also matched
`<select>` inside a comment). Demonstrated inline: on `<select value={x} onChange={e => go(e)}`, v1 sees a
`>` and stops; v2 sees none and keeps joining.

### 5 · tsc and lint

`tsc --noEmit -p .` exit **0**. ESLint: **rule-for-rule identical to HEAD**.
`git diff --stat` — **1 file, 21 insertions, 21 deletions** (a 1:1 line replacement, the same fact the
desktop proof rests on). The other two modified files are the **pre-existing** uncommitted V13.1 manual
edits.

---

# Open items — unchanged, still not built

1. **Sub-44px touch targets** — Call, WhatsApp, Copy, the header prev/next/Close, the two checkboxes, and
   the 16px `✕` media-delete badges. Out of scope by instruction.
2. **`FilterSelect`** above the table is still `text-xs` → iOS will zoom on focus there.
3. **C15** — two capture-phase `keydown` listeners on `window` between `ScheduleEventsPopup` and
   `ConfirmDeleteDialog`. Untouched.
4. **Landscape safe areas** — no `env(safe-area-inset-*)` handling in this modal.

---

# CHECKLIST

### Safari RDM (⌥⌘R) — iPhone 390 × 844 and 430 × 932
- **R1.** 🔴 LOG A CONTACT is **two controls per row**: *Contacted on · Channel*, then *Direction · Kind*.
  **Nothing overlaps.**
- **R2.** The date box shows a full, readable date — not clipped at either width.
- **R3.** FOLLOW UP ON: the date box and the four quick buttons wrap tidily, nothing overlaps.
- **R4.** The top chrome is a little tighter than before — roughly 30% of the screen rather than a third.
  🔴 **It is still locked. That is the part I stopped on; tell me to do the move and I will.**
- **R5.** Everything from the last round still holds: demo link + Copy visible, "LAST CONTACTED" not cut,
  title on its own line, history scrolls sideways to reach Channel.
- **R6.** Drag the width past **640px** — the layout must snap back to four columns on one row and the
  desktop two-column body. 🔴 **At 641px and above nothing should differ from today.**
- **R7.** Desktop 1280 × 800 sanity: four controls on one row, 45/55 body, exactly as before.

### Only the real phone can answer
- **P1.** 🔴 Tap the **Contacted on** date box — the page must not zoom, and the picker must open over a
  row that is not overlapping anything.
- **P2.** Does the iOS date control actually fit its 167px column, or does its text clip? (`min-w-0` means
  clipping is now the worst case rather than overlap — I want to know if it bites.)
- **P3.** With the keyboard up, can you still reach **Log contact**?
- **P4.** Does the tighter header still feel tappable — prev/next/Close, and the two thumbnails without
  catching the ✕?

## Closing `git status`, verbatim (nothing staged)

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   components/admin/OutreachPanel.tsx
	modified:   docs/onboarding-flow.md
	modified:   docs/reference-manual.md

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	docs/outreach-modal-mobile-2-report.md
	docs/outreach-modal-mobile-report.md

no changes added to commit (use "git add" and/or "git commit -a")
```
