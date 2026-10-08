# Social media, round 5: the three boxes line up, a zoom that cannot widen the page, a LOOK switch, Edit/Preview with nudging, portrait advice, and a weekly caption that is actually filled in

*9 October 2026. Nothing deployed, nothing pushed. Pizza Kitchen (`test-truck` / `test-kitchen`) only —
no other truck was opened, called or changed. No SQL was run and none is needed: the round-4 migration
`20261022_three_location_pictures.sql` was already applied before this round started.*

---

## 0 · READ THIS FIRST

### Nothing in this round contradicted anything else, and nothing arrived garbled

The brief's six sections are independent of each other and none of them fights a rule. One instruction
needed a judgement call rather than a stop, and it is §6 — see the next heading. One instruction appended
to the brief turned out to rest on a wrong premise, and that is the Background picture box — see the one
after.

### §6 is filled on the SERVER, not from "the week's entries" shipped to the browser

The brief says: *"Add the week's entries to the overview payload and fill it with the same functions the
weekly Make screen uses (`fillCaptionTemplate` + `weekCaptionValues`), so the two can't differ."*

The **goal** — one set of functions, so the card and the Make screen cannot disagree — is met exactly.
The **mechanism** is one step earlier than the brief describes: the overview payload now carries the
**finished caption string**, not the week's entries.

Why: `weekCaptionValues` does not take entries. It takes a `WeekData` — the object `buildWeekData` makes
out of the week's rows, the place library, the time style, the cancelled/private rules and the excluded
event ids. Shipping entries would mean running `buildWeekData` a second time in the browser, with a
second copy of those five inputs, which is **precisely the drift §6 exists to prevent**. Filling on the
server uses the one `buildWeekData` call path the Make screen already uses, with the design's own stored
`timeStyle` read through `readStoredLayout`, so the two cannot differ by construction rather than by
discipline.

If you want the entries in the payload anyway — for a future card that lists them — say so and they go in
beside the caption, not instead of it.

### The "Background picture 3840 × 2160" box: the control has a purpose, the DUPLICATION did not

Your note: *"also remove the box showing 'Background picture 3840*2160' unless it has a purpose but it
doesnt seem to do anything."*

It had a purpose and it was hidden under four readouts of two facts:

* the item-grid **button** said "Background picture" **and** "3840 × 2160";
* the settings card below it had its own **heading** "Background picture" — directly under the panel's own
  title, which already said it — **and** repeated the size.

The part that does something is **"Replace picture"**, which lives in that card and is the only way to
change a design's artwork. So the card stays and the noise is gone:

* the card's own heading is **removed** (the panel title is the heading now) and so is its border — it is
  a plain section of the panel;
* the **size and shape live in one place only**, the settings, which is exactly where §5 wants them;
* the grid **button carries the name alone**.

What you were reacting to — a box that announces a number and offers nothing — no longer exists. If the
remaining card still reads as inert, the next step is to make the thumbnail itself a drop target, and
that is noted in the code at the spot.

---

## 1 · Section by section

| § | What the brief asked | State |
|---|---|---|
| 1 | three Location settings boxes line up, row by row, in Safari too; "Location poster (optional)"; new page description | done, and **measured in both engines** |
| 2 | `[−] [100%] [+]` + separate "Fit to screen"; percentage is a label; Fit greyed when fitted; zoom must not widen the page | done, and **measured at 1728 × 1000**. ⚠️ The reported widening did not reproduce — read §3 below |
| 3 | the LOOK switch replaces the two coloured notes; 🔗 on following boxes; "🔗 = matches All text" legend | done |
| 4 | Edit/Preview switch; only the selected box outlined; pink centre guides; arrow-key nudging; one undo step per run | done |
| 5 | portrait advice in the Background picture settings, green tick at 4:5, tip otherwise | done |
| 6 | the weekly card's caption box holds this week's FINISHED caption | done, **filled server-side** — read §0 |

Everything editor-side went into the **one shared `DesignEditor`**, so weekly, single event and location
designs got all of it at once. Gating is untouched — no `plan-features` or `useGatedActionResult` change
is in this round.

---

## 2 · §1 · Three boxes that line up — and the premise that measured itself

The three picture boxes have descriptions of different lengths, so at 1100px they wrap to **2, 2 and 3**
lines. Before this round each box laid itself out independently, so the picture area and the
Remove/Upload row of the third box sat a line lower than the other two.

The fix is **CSS subgrid**, as the brief suggested:

* the container declares the four rows once — `grid-rows-[auto_auto_auto_auto]`, three columns from 900px;
* each box is `grid grid-rows-subgrid row-span-4 content-start`, so its four children are placed in the
  **container's** rows rather than its own.

Two things had to change for that to work at all:

* **the file input had to leave the flow.** It is `absolute hidden` now; as a normal child it occupied a
  grid row and pushed everything below it down by a box-dependent amount.
* **the Remove/Upload row is always rendered**, empty when there is no image. A row that only exists when
  filled is not a row the other boxes can line up against.

### The measurement premise measured the thing under test

This is the round's sharpest lesson. To prove the alignment means first proving the boxes' descriptions
really are different lengths — otherwise three identical boxes line up trivially and the check says
nothing.

My first two premises were **both wrong in the same way**:

* the description row's **height** read 79 / 79 / 79;
* its **`scrollHeight`** read 59 / 59 / 59.

Both are *stretched by subgrid itself*. I was asking the alignment mechanism whether the alignment
mechanism was needed. The premise has to use something subgrid cannot touch:

```js
const rg = document.createRange(); rg.selectNodeContents(descEl); rg.getClientRects().length
```

— the number of **line boxes**, which is 2 / 2 / 3 regardless of how tall the row is stretched to be.

With the premise honest, the result in **Chromium and WebKit**, at 1100px:

| row | box 1 | box 2 | box 3 |
|---|---|---|---|
| title | 163 | 163 | 163 |
| description | 197 | 197 | 197 |
| picture area | 276 | 276 | 276 |
| Remove / Upload | 428 | 428 | 428 |

Also in §1: **"Event poster (optional)" → "Location poster (optional)"** (`POSTER_BOX_TITLE` stays
exported as the record — harnesses read it by name), and the page description is now *"Pictures and
social media tags for each location. They're used automatically when you create a post."*

---

## 3 · §2 · The zoom — and the bug that would not reproduce

The control is what the brief asked for:

```
[ − ]  100%  [ + ]        [ Fit to screen ]
```

The percentage is a `<span>`, `tabular-nums` so the row does not twitch between 100% and 125%, and
"Fit to screen" is `disabled` while `zoomStep === 0`.

### ⚠️ The reported symptom did not reproduce, and I fixed the shape anyway

The brief reports that zooming to 125% widens the whole page and cuts off the settings panel and Save. I
built a fixture mirroring the real classes at the real window size and **could not reproduce it at any
zoom step, including the maximum**. The editor's grid does not widen the page.

Two honest possibilities: the symptom comes from outside the editor's grid (an ancestor on the manage
page), or it was fixed incidentally by round 4's full-width work hours before the brief was written. I
could not make it happen, so I could not find which.

What I did instead of nothing:

* **the poster area is a `grid` with the poster at `margin: auto`, not a centred flex row.** This is not
  cosmetic. In a centred flex container the overflow at the **start** edge is unreachable — `scrollLeft`
  cannot go below 0 — so at high zoom the left of the poster is permanently off-screen. `margin: auto`
  inside a grid overflows symmetrically and both directions scroll.
* `min-w-0 max-w-full` on the area, so it can never ask its parent for more width than it has;
* the poster is `shrink-0`, or a flex child's `min-width: auto` squeezes it back and `+` does nothing.

And a **standing measurement**, so if it ever does happen a harness says so. At 1728 × 1000, Fit versus
zoom step 6:

| | Fit | zoomed |
|---|---|---|
| page width | 1728 | **1728** |
| settings panel left / width | 1336 / 380 | **1336 / 380** |
| Save button left | 1716 | **1716** |
| poster inside the area | — | **2148 in 1308** (the area scrolls, nothing else moves) |

---

## 4 · §3 · The LOOK switch

The two coloured notes are gone. In their place, under the box name:

```
LOOK
[ 🔗 Same as All text | Its own style ]
Font, colour and effects come from All text. Pick "Its own style" to change them for this box only.
```

and in the other position: *"This box has its own font, colour and effects. Pick "Same as All text" to
match the others again."*

**Why a switch beats the notes.** The notes were a state readout with the control buried inside the
sentence describing it — *"🔗 Same font, colour and effects as All text · Change just this box"* — and
the two states looked like two different components rather than two positions of one thing. Neither note
said what the other position would do. A two-way switch shows both positions at once, which is what makes
it visible that there is a choice at all.

**The behaviour is byte-for-byte what it was.** "Its own style" calls `makeOwn`, the same function
"Change just this box" called; "Same as All text" calls `makeFollow`, which is "Match All text again".
`makeOwn` still copies the shared look in and sets the flag **in one commit** — two commits would let the
box flash to whatever stale look it carried in storage at the instant the operator asked to change just
this box. "Use this style for all text" is unchanged at the foot of an own-style box, and the **All text**
amber note is unchanged.

In the ON YOUR POST grid:

* a following text box shows a small **🔗** (`title="🔗 Same as All text"`), an own-style box keeps its
  **own** badge;
* the heading line reads **ON YOUR POST** on the left and **🔗 = matches All text** on the right,
  replacing *"click to edit"*. The legend explains a glyph an operator cannot work out; "click to edit" is
  a thing they can. `EDITOR_CLICK_TO_EDIT` is kept as the record of the wording and is no longer drawn.
* the **Background picture** button carries its name alone (see §0).

---

## 5 · §4 · Edit / Preview, outlines, guides and nudging

### The switch

`✎ Edit | 👁 Preview` at the top-left of the grey area, with the hint *"Preview hides the box outlines so
you see the finished post"* beside it. The hint names what Preview **does**: pressing an unlabelled
control on a design you have spent ten minutes on is a thing people do not do.

Preview hides **everything that is not the post** — outlines, handles, labels, the six faint weekly rows
and the location-picture placeholder — and boxes cannot be dragged. The selection is held in state, not in
the DOM, so switching back restores the same box selected with its settings open.

**Hidden means `return null`, not `display:none`.** A box hidden with CSS still captures pointer events
and is still a nudge target; `hidden` on `DraggableBox` returns null, so in Preview there is nothing to
drag and nothing to move.

### Outlines

* **selected**: `border-2 border-orange-500`, a 10% orange wash, handles, name label.
* **every other box**: `border border-dashed border-white/25`, no label, `hover:border-white/60` and the
  name appears on hover (`group-hover`).

### Centre guides

While dragging, a **pink** 1px line appears the moment the box is within a few pixels of a centre, and it
disappears on release (`onGuides?.(NO_GUIDES)` in the gesture's `end`). The snap itself is unchanged —
this round only changed the colour and made the line strictly a drag-time thing.

### Nudging

Arrow keys move the selected box **1 poster pixel**, Shift **10**, clamped to the poster exactly as a drag
is — the validator refuses a box reaching outside the image, so a nudge that produced one would be a nudge
that could not be saved.

Three details that matter:

* **the focus test comes before `preventDefault`.** `INPUT`, `TEXTAREA`, `SELECT`, `isContentEditable` —
  all return early. Calling `preventDefault` first would stop a `<select>` from doing the thing it had
  already decided to do.
* **no nudging in Preview, and none when read-only.** One rule, two inputs.
* **a run of nudges is ONE undo step.** The first press opens the step with the same `beginGesture` a
  drag uses, the rest are `live`, and the run closes after 600ms of no presses — long enough to hold a key
  down, short enough that two deliberate adjustments are two steps. Twenty presses of ↓ is one thing the
  operator did.

A note on how this is written: the key handler reads `readOnly` directly rather than the `editable` const.
`editable` is declared below the hook with the other render derivations, and **a hook may not read a
`const` declared below it** — the third time that rule has bitten in this codebase.

---

## 6 · §5 · Portrait advice

In the Background picture settings:

* **4:5 within 1%** → `1080 × 1350 · Portrait 4:5` with ` ✓ best for Instagram & Facebook` appended in
  **bold green**;
* **anything else** → the size and shape in grey, plus *"Tip: a portrait picture (1080 × 1350, 4:5) shows
  biggest on Instagram and Facebook feeds."*

The tolerance is 1%, the same one the poster shape rule uses: a 1080 × 1349 export is a 4:5 design and
telling its owner otherwise would be pedantry with a green tick. The tip is **advice, not a warning** —
a landscape design still renders, still posts, and is right for some trucks — and it names the numbers,
so acting on it needs no second look. It is not shown on a 4:5 design, where it would be advice to do what
has already been done, which is the fastest way to teach someone to stop reading grey text.

---

## 7 · §6 · The weekly caption, filled

`social_overview` now sends a finished caption for **this week and next week**:

```ts
const weekTplForCaption = String(weekDesign?.caption_template ?? '').trim() || seedWeekTemplate(truck.name)
const weeklyTimeStyle = readStoredLayout(weekDesign?.layout, …).layout.timeStyle
const captionForWeek = (range) => {
  const wk = buildWeekData(range, inWeek(range.start, range.end), placeRows ?? [], {
    timeStyle: weeklyTimeStyle, showCancelled: true, showPrivate: false, excludedEventIds: [],
  })
  return fillCaptionTemplate(weekTplForCaption, weekCaptionValues({
    week: wk, orderUrl: truck.slug ? scanUrl(truck.slug) : null, timeStyle: weeklyTimeStyle, country,
  }))
}
```

— `fillCaptionTemplate` + `weekCaptionValues`, the Make screen's own two functions, over a `WeekData`
built by the Make screen's own `buildWeekData`, with the design's **stored** `timeStyle`. The weekly
card's box shows that string; its `key` includes the caption so a changed week re-seeds the textarea
rather than keeping a stale draft. The template is still reachable behind "✎ Edit template" on the Make
screen, where editing it means *every* week.

If no weekly design exists yet, the seed template is used — the same seed the Make screen falls back to —
so the box is never empty and never shows tokens.

---

## 8 · Checks

### Type check and lint

* `npx tsc --noEmit` — **clean**.
* `eslint` on the five touched files — **0 errors**. Three warnings existed, all pre-dating this round;
  one (`weekCaption`, an import left dead by round 4) is removed. Two remain, `kindOf` and
  `readPlaceSlots` in `app/api/weekly-post/route.ts` — both dead, both referenced by name in comments that
  explain *why* they are not called. They are left in place deliberately; deleting them would strand the
  explanation. Say the word and they go.
* `npx next build` — **compiles**, every route built.

### Harnesses

| harness | result |
|---|---|
| `design-editor.cjs` | 89 passed — ~8 new checks for §2's zoom shape, §3's switch, §4's view switch / preview / faint outlines / pink guides / nudging, §5's advice, and the Background button's name-only label |
| `social-tab-render.cjs` | passed, with §1's row alignment measured in Chromium **and** WebKit |
| `social-posts-render.cjs` | passed, with §2's zoom guard at 1728 × 1000 |
| `social-tab-5-local.cjs` | **new**, replaces the round-4 one in `scripts/harnesses.json`; every check passes on localhost against Pizza Kitchen, including §6 |
| `place-pictures.cjs` | 113 |
| `social-posts.cjs` | 103 |
| `design-fonts.cjs` | 87 |
| `places-tab.cjs` | 98 |
| `weekly-post.cjs` | 223 |
| **the full 98-harness sweep** | **98 run · 98 passed · 0 failed**, after the last edit — the only honest signal |

Two §6 checks are worth naming because they are the ones that would catch a regression nobody would
notice by eye: *no `{token}` survives in either week's caption*, and *the two weeks read differently* — a
caption that was accidentally built from a fixed range would pass every other check.

### Three bugs in my own work, found by the harnesses

1. **the subgrid premise measured the thing under test** (§2 above) — twice, two different ways.
2. **the fixture's footer row only rendered when filled**, so two of the three boxes had three children
   and the fourth-row comparison was comparing nothing. The fixture mirrors the component's
   always-present row now.
3. **the §6 local checks landed inside the migration-gate early-exit block**, where they could never run,
   and the variable name clashed with one already declared. Moved out, renamed.

### Live checks on localhost — Pizza Kitchen only

* a **weekly** poster renders: 200, 997,286 bytes, real PNG, *"Powered by HatchGrab"* present;
* a **single event** poster renders the same way;
* `social_overview` returns three picture slots per location and a filled caption for both weeks —
  *"Pizza Kitchen — where we are this week: …"*.

---

## 9 · What is left open

* **§2's reported widening.** Not reproduced, structurally fixed, now measured. If you can make it happen
  again, the thing to tell me is the window width and which sub-tab — that will point at the ancestor.
* **The Background picture thumbnail is not a drop target.** If the card still reads as inert now the
  duplication is gone, that is the next small thing.
* **`kindOf` and `readPlaceSlots`** are dead code kept for their comments. A tidy-up round should either
  delete both and move the explanations, or use them.
* **`scripts/social-tab-4-local.cjs` was deleted**, not kept beside the new one — round 5's script is a
  copy of it with the stale checks fixed, and `harnesses.json` lists one local probe. ⚠️ It was never
  committed, so it is not recoverable from git. Say so if you wanted it kept and I will rebuild it.
* **Curved text** is still not in this round, as instructed.
* **Nothing is deployed and nothing is pushed.** No SQL was run.
