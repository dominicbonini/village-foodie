# Social media, round 6: the seven days become one box, the preview stops being a mode, the picture becomes something you can point at, and the editor starts saying what it does

*10 October 2026. Nothing deployed, nothing pushed, no SQL run and none needed. Pizza Kitchen
(`test-truck` / `test-kitchen`) only — no other truck was opened, called or changed. Curved text is
still not in this round.*

---

## 0 · READ THIS FIRST

### Nothing contradicted anything, and nothing arrived garbled

Three things needed a judgement rather than a stop, and all three are named below: what "Leave them
out" means for the other six days (§A), where the picture goes when it is reordered into the middle of
a row (§A), and how a design editor is tested when the dashboard is behind a login (§8).

### Three more things you reported while this was being built, all fixed

1. **The weekly caption box showed the TEMPLATE** — `{day-list}`, `{order-link}` and all. **This is a
   miss in round 5, not a new bug.** That round added a filled `caption` for both weeks to the overview
   payload and filled it on the server with the Make screen's own two functions… and the card went on
   reading `captions.week.template`. The check that passed was asking the **route**, and the route was
   right all along. A payload assertion cannot see the screen; there is one that can now
   (`scripts/social-posts.cjs`), written as both halves — the card reads the filled caption **and** the
   template is no longer what `filled` is handed, so it cannot pass against the version that shipped.
2. **The two orange buttons on Create a post were not level.** The event half's sat directly under the
   chosen event and above "OR PICK ANOTHER EVENT"; the weekly half's was pinned to the foot of its
   card. It is at the foot of its half now, `mt-auto` in the same flex column — measured in both
   engines, with a control that puts it back where it was and watches the measurement notice.
3. **"All text" had Smaller | Bigger instead of a size** — §C below.

### The three things this round found that were already broken

Not asked for, found while wiring the brief, and all three fixed:

1. **"All text" and "Background picture" were not selectable at all.** `selected` fell back to the
   Date box for any key that is not in the item list — and neither of those two has a box, so neither
   is in the list. **Pressing either silently selected the Date**, which is why both panels looked
   like they did nothing. It shipped in the 9 October build that introduced them.
2. **The leave dialog was rendered below the editor's early return**, so from inside an editor a pill
   press set the state and nothing appeared. That is the "pressing Location settings did nothing" in
   §B10, and §B10's own fix is what found it.
3. **"Darken the picture" was reachable only from places nobody looks.** The renderer has always drawn
   it — measured below — so this was never a rendering bug.

### The one place what shipped differs from the brief as written

§A2 says a row under "Big picture" shows *"place · times"* on its second line. It is drawn as **two
cells side by side**, not one joined string. The reason is §A3 and §C: a truck must be able to click
the times and give them their own font, which they cannot do if the times are half of a sentence that
belongs to the place. At the default weights it looks the same; the difference appears when the two
are styled apart, which is the point of being able to.

---

## 1 · Section by section

| § | What the brief asked | State |
|---|---|---|
| A1 | the seven days become ONE box with per-row parts, ⇔ handles, corner-scale and side-stretch | done |
| A2 | the panel: quick layouts, WHAT'S IN EACH ROW with ⋮⋮, Days off, picture shape | done |
| A3 | clicking a day's words selects that part for styling across all 7 rows | done |
| B1 | the Edit/Preview switch goes; "👁 Preview post" opens the real PNG in an overlay | done |
| B2 | "Preview with" is This week / Next week only | done |
| B3 | the background is selected by clicking the picture; darkening moves there and works live | done, **and the renderer was never the problem** |
| B4 | clicking any words selects their box | done |
| B5 | an editor-only tint and a two-tone outline on every text box | done |
| B6 | corner handles resize the words, side handles the box | done |
| B7 | the FILLED EXAMPLE panel and its overlay are removed | done |
| B8 | the "boxes have been reset" line only when true, fading after ~5s | done |
| B9 | the ON YOUR POST grid's order and heading | done |
| B10 | every pill and "‹ Designs" works, with a three-button dialog | done, **and the bug is named above** |
| C | plain words throughout, advanced settings still under MORE OPTIONS | done |

---

## 2 · §A · "The 7 days" — what it replaces, and the promise it had to keep

### What the weekly design was

Three independent boxes (`date`, `location`, `time`), each placed by hand, plus `rowSpacing` — a pixel
distance that copied all four down six times. **Five numbers an operator had to get right before the
poster looked like a table:**

* the three boxes had to be given the same height and the same top, or Monday's place name sat a few
  pixels above Monday's time;
* their widths had to add up to less than the picture's, with gaps eyeballed;
* `rowSpacing` had to be bigger than the tallest box or the rows overlapped, and small enough that the
  seventh row stayed on the artwork — `rowsFitWarning` exists because it so often was not.

### What it is now

One block (`Layout.days`) with `{x, y, w, h}`, an arrangement, the four parts in order with a weight
each, a days-off mode, a picture shape and a text-band height. The rows share its height **equally**,
so they cannot drift apart; the parts share each row's width **by weight**, so they cannot overlap.
"Gap between days" is gone as a setting: it is `h / 7`, which is not a thing to get wrong.

### The compatibility promise, and how it is kept

> *"EXISTING SAVED DESIGNS MUST RENDER EXACTLY AS TODAY until their owner opens and saves them."*

* **`days` is optional, and its absence is not a default — it is a fact**: this design has not been
  opened in the new editor. `lib/weekly-post/render.ts` keeps its legacy loop, untouched down to the
  comment, and the new path is an `if` in front of it.
* **The conversion happens in the editor, on open, and nowhere else.** Not in `readStoredLayout` —
  the renderer goes through that, and converting there would change what every unopened design draws.
* **The converted layout is the "saved" baseline**, so opening an old design does not report unsaved
  changes it did not make. The conversion is stored the next time the operator saves for a reason of
  their own.
* **The old boxes stay stored and stay validated.** They are the parts' styles — and a rollback to an
  older build ignores `days` and draws the legacy rows, which are still there and still correct.

### The conversion, line by line, and what it costs

`daysFromLegacy` is one promise: **the rows stay where they are.**

* the block's pitch is `rowSpacing`, so `h = rowSpacing × 7` and row *i* lands on old row *i*;
* the top is lifted by half the difference — `y = row1Top + rowH/2 − rowSpacing/2` — **because a cell
  centres its words.** Without the lift every row's text drops by `(rowSpacing − rowH) / 2`, seven
  times, on artwork a truck has approved;
* `textH` is the old row's height, so `fitLines` is handed the height it had. With the band equal to
  the whole row, every box would suddenly have the full pitch to fit into and would be drawn **bigger**
  than the truck approved;
* the order comes from the boxes' own `x` and the weights from their `w`, so a design with the time on
  the left converts with the time on the left.

**What cannot be reproduced, measured rather than asserted:**

| | |
|---|---|
| the gaps between the parts | the operator's own pixel gaps become one even gap |
| the picture | a square at the row's height (or a weighted column under "Big picture"), not its stored w/h |
| rounding | row centres land within 1px of where they were |
| **the whole difference** | **5.2% of the block's pixels move** — against **11.9%** for a genuinely rearranged poster, which is the control that makes the first number mean something |

### Two judgements the brief's words do not settle

**"Leave them out" leaves the day's slot where it is** and draws nothing in it. The other reading —
six days sharing the height — was rejected because of the editor: the outline shows seven equal rows,
and a poster whose rows moved with the week's data would make that outline a lie and would move every
other day away from where the operator put it.

**The picture is a cell under "All on one line" and a column under the other two.** That was a real
bug and a harness found it: as a column always, a picture dragged into the middle of the order jumped
to the far right — *the list said one order and the poster drew another*, which is the one thing a
reorder handle must not do. A column is unavoidable where the words are on two lines, because the
picture spans both.

### One function, two callers

`lib/weekly-post/days.ts` holds `dayCells`, and it is the only place a row's geometry is decided. The
renderer positions satori elements from it; the editor draws its click targets and its ⇔ handles from
the same call. That is the brief's own requirement — *"the editor preview and the satori renderer must
keep resolving through shared functions so they can't drift"* — and the harness asserts it twice: once
on the imports, and once by comparing **the inline styles the mounted editor produced** with
`dayCells`'s own output, cell by cell.

---

## 3 · §A2 · The panel

```
The 7 days
One row for each day. Drag the orange box on your poster to move them, pull its corners to
make the rows bigger or smaller.

QUICK LAYOUTS     [ ▥▬▬▬ ]  [ ▪▬ / ▬▬ ]  [ ██ ▬ / ▬▬ ]
                  All on one   Day on top    Big picture
WHAT'S IN EACH ROW
  ◉ Location picture   if it has one          ⋮⋮
  ◉ Day and date       WEDNESDAY 14TH OCTOBER ⋮⋮
  ◉ Place              The Kings Arms         ⋮⋮
  ◉ Times              5pm – 9pm              ⋮⋮
  Drag ⋮⋮ to change the order. To change how the words look, click them on your poster.

Days off   [ Show a message | Leave them out ]
           What it says: [ No trading today        ]

MORE OPTIONS ▾   Picture shape
```

* **The quick layouts are data, not three code paths** — an arrangement plus weights plus an order, so
  a layout the operator then adjusts by hand is still a valid layout. Each button draws what it does,
  because choosing between them is choosing a shape.
* **Pressing one never switches a part on or off.** A truck with no location pictures would otherwise
  have that part switched back on by pressing "All on one line".
* **Pressing one does reset the text band to the whole row**, because "Day on top" puts the words on
  two lines and a band left at a converted design's old row height would halve every line.
* **The examples are live** — the design's own date wording and its own clock. A fixed "Mon 5th Oct"
  beside a design set to "05/10" would be the one line on the panel that cannot be right.
* **The switches are the boxes' own `enabled`** — the same field the renderer has always read. Nothing
  about what is drawn is stored twice.
* **⋮⋮ is pointer-based, not HTML5 drag-and-drop**, which has no touch support at all on iOS Safari —
  and half this product's operators are on an iPad.
* **"Circle" makes the picture cell square**, in every arrangement — a radius on a wide cell is a
  stadium, not a circle. A row's height is the ceiling on a circle's diameter, so "Big picture ·
  Circle" is as big as a circle can be and the width it does not use goes back to the words.
* **"Show cancelled events" came here** with the "Rows" panel it used to live in. It is a decision
  about what the seven days contain, and about what customers are told, so it is not hidden behind a
  word.

---

## 4 · §B · The editor-wide fixes

### B1 · The Edit/Preview switch lasted one round

It was a **mode**: the poster stayed where it was and the outlines went, so the operator had to
remember which state they were in, every other control silently changed meaning, and a design left in
Preview looked like an editor that had stopped working. **"👁 Preview post" has no state to remember.**
It shows the PNG the stage is already drawing — the real renderer's output for the chosen week or event
— at full size with nothing on top of it, and closes. It is deliberately **not** a second render: a
"preview" that asked for its own PNG could answer differently from the one the operator has been
looking at.

### B3 · The darkening — what was actually wrong

The brief says *"today it shows no visible difference — find out why and fix it"*. Three findings:

1. **The renderer has always drawn it.** Measured through the live route on Pizza Kitchen's own design:
   at 60% the PNG comes back 997,286 → 856,679 bytes, and in a synthetic render every channel comes back
   at about 40% of its value. The renderer was never the problem.
2. **The control was in the MORE OPTIONS of a text box** — and on a box that *follows* "All text" that
   whole section is not drawn. So an operator who selected the Date and opened MORE OPTIONS **could not
   find it at all**. Its only other homes were "All text" › MORE OPTIONS and the weekly "Rows" item,
   neither of which is where anybody looks for a setting about the picture.
3. **The preview is 400ms behind**, so even where it was reachable, a slide showed nothing until you
   let go.

Fixed: it is in the background picture's own settings, which is where pointing at the picture takes
you; and an editor-only overlay draws **the difference the PNG has not caught up with** — never more —
falling to nothing the moment the new PNG lands. A slide downwards still waits for the render rather
than showing a lie.

⚠️ **The slider's ceiling moved from 60% to 70%**, which is §B3's number. The validator capped `darken`
at 60 — the 6 October brief's number — so a slider offering 70 would have offered a value the save
refuses. It is one exported constant now (`MAX_DARKEN`), shared by the validator, the renderer and the
editor: 60 in one and 70 in another is a slider whose top third does nothing. No existing design is
affected, because every stored value is ≤ 60. The *reason* for having a ceiling is unchanged — a 100%
dark layer hides the artwork completely, at which point the truck has not uploaded a design, they have
uploaded a wallpaper.

### B5 · Why white writing was invisible while editing

The renderer's readability rule adds a shadow where it is needed, but an operator placing a box on a
pale photograph could not see the words they were placing — they were dragging an empty rectangle. Every
text box now carries `rgba(15,23,42,.28)` behind it and a dashed white border with a thin dark `outline`
outside it, so it is legible on a white picture and on a black one. **None of it is ever in the PNG** —
the renderer does not import the file it is written in. The picture box is deliberately **not** tinted:
that would show a photograph darker than the one about to be posted.

### B6 · Corner versus side

A corner makes the **words** bigger or smaller; a side makes the **box** wider or taller with the words
unchanged. Only `DraggableBox` knows which happened — a corner drag and a side drag can both produce
"w and h changed" — so it reports a `DragInfo`, and **the factor is measured from the gesture's start**:
multiplying frame by frame compounds the rounding, and fifty frames of ×1.02 is not ×2.7. Four side
handles are new; before today the only way to make a box wider was to make it taller too, which on a box
whose text is centred moved the words.

### B8 · A message that was usually false

`resetLayout` is true for any new picture of a different **size**, including a re-export of the same
artwork at a higher resolution — where every box is carried across and nothing has moved. The line
claiming the operator's work had moved appeared when nothing had, and stayed until something else
replaced it. It now needs the new picture to be a different **shape** (ratio moved by more than 1%)
**and** the boxes to have actually moved, and it fades after five seconds in its own slot.

### B10 · The bug, and the dialog

**The dialog was rendered in the boxes view's JSX — below three `if (view.kind === …) return`
branches.** So from inside an editor with unsaved changes, a pill press called `setLeaveTo(…)` and
nothing appeared: the state changed, the dialog was not in the tree. That is "pressing Location
settings from the weekly editor did nothing", exactly.

It is one element now, built above the returns and rendered by all four views, with three buttons:

```
Save your changes first?
You've changed this design since you last saved.
                        [ Keep editing ]  [ Leave without saving ]  [ Save and leave ]
```

Two were a false choice — the dialog that exists to protect the operator's work offered no way to keep
it. "Save and leave" **awaits** the save before leaving (leaving first would unmount the screen that
reports whether it worked) and a failed save keeps the editor open with its own error. "‹ Designs" now
asks the same question: it is the exit an operator actually uses, so the guard that protected the three
pills was leaving the front door open.

### B9 · The grid

```
ON YOUR POST                                   click one to change it
┌──────────────────────────────────────────────────────────────────┐
│ Aa  All text · change all the writing at once                     │
└──────────────────────────────────────────────────────────────────┘
┌───────────────────────────┐  ┌───────────────────────────────────┐
│ ◉ Week heading            │  │ ☰ The 7 days                      │
└───────────────────────────┘  └───────────────────────────────────┘
                     + Add your own text
```

The 🔗 legend is gone from the heading: on the weekly grid the glyph now appears on **nothing** — the
four text boxes it marked are inside "The 7 days" — so it explained a symbol that is not on screen. It
survives on the single event design's four buttons, with its meaning in the button's `title`. The
Background picture button is gone too: the picture is on the screen, and a button that selects the
biggest object on the page is a second way to do what pointing at it already does.

### B2 and B7 · Two real features that lost their doors

* **"A busy week"** rendered a fabricated worst case — a 60-character place name, a stacked Saturday, a
  cancelled day. It was useful. What it was not is a week this truck has: two of three preview choices
  showed their schedule and one showed somebody else's, which is a thing an operator can post by
  mistake. `busy: true` is still a server capability.
* **The filled example** was a finished poster shown at 30% over the preview so boxes could be lined up
  against the real thing. **The preview is the real thing now** — the stage draws the renderer's PNG for
  the chosen week, with this truck's own place names in it — so a faint second poster on top of a true
  one was two answers to one question. The upload endpoint and the stored file are untouched.

Both are tombstoned in the source rather than deleted quietly.

---

## 5 · §C · Plain words

| Was | Is | Why |
|---|---|---|
| "Shows" | "How the date is written" / "How the times are written" / "How the place is written" / "What the heading says" / "What it says" | one word stood over four different questions and told an operator only that the control did *something* |
| *(nothing)* | "Other choices: …" under the date style | a dropdown shows today's answer when closed, so the one thing it cannot tell you is what else is in it |
| "Size", a number with arrows | "Text size", `[A−] 44 [A+]`, with *"or drag a corner of the box on your poster"* | the number had no units an operator could see, and the handles — the control most will actually use — were mentioned nowhere |
| "Line up", three drawn bar icons | "Line up the words" · ⇤ Left \| ≡ Centre \| Right ⇥ | three stacked bars are a picture of a *paragraph*; the thing being lined up is one line of a place name |
| "Style" (B / I / AA) | "Letters", with Bold / Italic / CAPITALS as the tooltips | "Style" was also the name of the switch two rows above it |
| "LOOK" + "🔗 Same as All text" | "Style" + "Match the other writing \| Style this one on its own" | a noun the operator had to map onto the behaviour; the positions say what they do now. **The behaviour is byte-for-byte what it was** |
| "MAKE IT STAND OUT" | "MAKE IT EASIER TO READ" | the first was a claim; the second is the job |
| "Band behind" | "Coloured strip behind the words" | a typesetter's word with its object missing |
| "Letter spacing", "Shadow strength", "Band corners", "Band space around" | "Space between letters", "How dark the shadow is", "Rounded corners on the strip", "Space around the words in the strip" | all four named a parameter rather than an effect |
| "If it doesn't fit: Shrink to fit / Use two lines" | "If a name is too long: Make it smaller / Use two lines" | — |
| "style every text box at once" | "change all the writing at once" (the brief's own words) | "style" as a verb, and "text box" is a noun an operator does not have — what they have is writing on a poster |
| three different MORE OPTIONS summaries | one, in plain words | three summaries for one section is three places for the contents to be described wrongly |
| the group headings "Wording", "Position", "Long names", "Stand out" | *(gone)* | labels on labels — every control under them already says what it does, in full |

"Settings for the box you've picked" became **"You clicked this on your poster. Change it here."** —
which also tells an operator how to pick a different one.

### And the font size, asked for mid-round

> *"for font there's smaller and bigger options. just change this to font size so they can choose."*

The "All text" panel had **Smaller | Bigger**, two buttons that nudged every box by 5%. They made an
operator press and look, press and look, and never answered the question they were asking: *how big is
my writing?* It is a **Text size** stepper now — `[A−] 44 [A+]` — and the number it shows is the **Date
box's** size.

⚠️ **Why a reference box rather than one number for everything.** A design's boxes are deliberately
different sizes — a 120px heading over a 40px time — and setting them all to one number would flatten a
hierarchy the truck built on purpose. So changing the number scales every box by the same ratio, with
the grey line *"Changes every box at once and keeps the big ones bigger."* The reference box lands
exactly on what was typed (`round(from × to/from)` is `to`), so the readout and the design agree after
every press, and the validator's own 6px floor is applied to each box so a scale-down cannot produce a
design that will not save.

---

## 6 · What is where

| File | What changed |
|---|---|
| `lib/weekly-post/days.ts` | **new.** The model, the one layout function, the boundary and reorder arithmetic, the quick layouts, and `daysFromLegacy` |
| `lib/weekly-post/layout.ts` | `Layout.days` (optional), `parseDays`, `rowsFitWarning` silent for a block |
| `lib/weekly-post/render.ts` | `daysEls` — the new path, in front of the untouched legacy loop |
| `components/manage/DraggableBox.tsx` | side handles, `DragInfo`, `onTap`, the tint and the two-tone outline; `hidden` tombstoned |
| `components/manage/DesignEditor.tsx` | the days item, `DaysLayer`, `DaysPanel`, the conversion on open, the background-click selection, the live darkening, the preview overlay, the saver, and §C throughout |
| `components/manage/DesignEditorBits.tsx` | the stepper's buttons can be labelled (`A−` / `A+`) |
| `components/manage/SocialPosts.tsx` | the three-button dialog, hoisted above the early returns; "‹ Designs" guarded; the weekly caption filled; the event half's button pinned to the foot |
| `lib/weekly-post/layout.ts` (again) | `MAX_DARKEN` — one ceiling, 70%, shared by the validator, the renderer and the slider |
| `components/manage/WeeklyPost.tsx` | no busy week, no filled example, §B8's fading message, the saver threaded |
| `components/manage/EventPost.tsx` | §B8 and the saver |
| `lib/copy/socialPosts.ts` | every string above |

---

## 7 · The SQL you asked for (read-only)

Pasted in chat as well. It counts saved **weekly** designs per truck and says which are already on the
new model, so "who could be affected" is a list rather than a guess.

```sql
select t.id,
       t.name,
       t.slug,
       count(*)                                         as weekly_designs,
       max(d.updated_at)                                as last_saved,
       count(*) filter (where d.layout -> 'days' is not null) as already_new_model,
       count(*) filter (where d.layout -> 'days' is null)     as still_old_row_model
from   public.truck_post_designs d
join   public.trucks t on t.id = d.truck_id
where  d.kind = 'week'
group  by t.id, t.name, t.slug
order  by last_saved desc nulls last;
```

Nothing in it writes. `still_old_row_model` is the number that matters: those designs render exactly as
they do today until their owner opens and saves them.

---

## 8 · Checks

### Type check and lint

* `npx tsc --noEmit` — **clean**.
* `eslint` on every touched file — **0 errors**. The warnings are `<img>` advice that predates this
  round, plus two dead helpers in `app/api/weekly-post/route.ts` kept for the comments that explain
  them (named in the round-5 report).
* `npx next build` — **compiles**, every route built.

### Harnesses

| harness | result |
|---|---|
| `weekly-post.cjs` | **251 passed** (was 223) — 28 new, including the conversion's pixel measurement and its control |
| `design-editor.cjs` | **104 passed** (was 89) — 12 rewritten for this round's changes (two of them merged into one, which is why 89 + 16 is 104), 16 new |
| `social-tab-6-local.cjs` | **new.** The live route + the real editor mounted; every check passes |
| `social-tab-5-local.cjs` | still passes — it asks the route about captions and picture slots, which this round did not touch |
| `social-posts-render.cjs` | passes; its Edit/Preview staleness guard now points at "Preview post" |
| `social-tab-render.cjs` | passes, both engines — plus the new "the two make buttons are LEVEL" measurement and its control |
| `social-posts.cjs` | **106 passed** (was 103) — three new, including the one that would have caught the weekly caption |
| `place-pictures.cjs` / `design-fonts.cjs` / `places-tab.cjs` | 113 / 87 / 98 |
| **the full sweep** | **98 run · 98 passed · 0 failed**, started after the last edit — the only honest signal |

### How the editor itself was tested, and what that cost

**The dashboard is behind a login and this script has no operator session** — `/manage/<token>` answers
with `/login`. Rather than fabricate credentials, the second half of `social-tab-6-local.cjs` mounts the
**real `DesignEditor`** with `react-dom/client` on `scripts/_mini-dom.cjs`, exactly as
`scripts/add-order-refresh.cjs` has done since September, and drives the real handlers React attached:

* a corner drag is `DraggableBox`'s own `onPointerDown` / `onPointerMove` / `onPointerUp`;
* a tap is a press that does not move, reported through `onTap` and hit-tested against `dayCells`;
* and **what each gesture produced is read back out of the editor's own Save**, so every assertion is
  about the layout a save would store.

What that cannot do, said out loud: **there is no layout engine, so nothing there measures CSS.** The
outlines, the tint and the two-tone border are asserted by class in `design-editor.cjs`; the geometry is
asserted against `dayCells`, which is the function the renderer itself calls. The PNG side — the
darkening, the days-off message, "Leave them out", the converted layout — is measured through the
**live route** against Pizza Kitchen's own design.

### Two harness premises that were wrong, and one that the world changed

* **The create-a-post fixture gave a caption box to the event half and not to the weekly one** — so the
  two halves were not the shape of the screen, and "are the buttons level?" could not have passed
  however the component was written. A fixture that diverges from the component measures a page nobody
  is served.
* **Stripping `mt-auto` is not a control for levelness.** With the ten-row picker expanded the event
  half is the taller one, so its button's natural position *is* the foot — the control reported "level"
  with the rule removed. The control restores the **old arrangement** instead, which is the failure
  that was reported.
* **"The stored design has no block" stopped being true while the round was being built**, because you
  opened the weekly design and saved it — which is the feature working. A check whose premise an
  operator can change by using the product will report a failure nobody caused, so it asks the honest
  question now: whichever state the design is in, is that state right? (It is: a valid block, with
  `rowSpacing` and the three boxes still beside it.) Pizza Kitchen's design is **on the new model** as
  of 11:27 today — 2240 × 1379 at 153,357, parts in the order picture · day · place · times.

### Five bugs in my own work — four found by the harnesses, one by looking at a poster

1. **The picture jumped to the end of the row when it was reordered into the middle** — the list said
   one order and the poster drew another. Found by the mounted-editor check that compares the list's
   order with the row's. Fixed by making the picture a cell rather than a column under "All on one line".
2. **"Big picture" was the same size as a square.** Its share came out at 14% of the row because the
   weight was measured against the words' combined weights — the name said one thing and the geometry
   did another, which is the "a button that does nothing" class this project has shipped twice.
3. **"Circle" drew a stadium, not a circle** — and nothing in the harness was ever going to say so. Under
   "Big picture" the picture's cell is a weighted share (291 × 140 on a 1080px poster), and a border
   radius of half the shorter side turns that into a pill. The control was satisfied — the three
   layouts *did* draw different posters — and the shape was still wrong. **It was found by rendering a
   poster with a real picture in it and looking at it.** The cell is a square whenever the shape is
   `circle`, in every arrangement; a row is the ceiling on a circle's diameter, so "Big picture ·
   Circle" is as big as a circle can be and the leftover width goes back to the words.
4. **A corner drag could shrink "The 7 days" below what the validator accepts.** `DraggableBox`'s floor
   is 8px for any box — the right floor for a text box and the wrong one for a block holding seven rows
   that each have to clear 8px. The block would have looked saveable and the save would have been
   refused *after* the work, which is the exact failure the clamp-to-the-picture exists to prevent.
   `minH` is new.
5. **The conversion's pixel threshold was a guess.** 3.3% of the whole poster sounded large until the
   control was added: a genuinely rearranged poster differs by only 7.6% of the whole image, because
   text is a small share of a 1080×1350 picture. The measurement moved inside the block, where it means
   something: **5.2% against 11.9%**.

### Live checks on localhost — Pizza Kitchen only

* the stored weekly design **has a `days` block** — you opened it and saved it at 11:27 while this was
  being built, which is the conversion working on a real design: 2240 × 1379 at 153,357, parts in the
  order picture · day · place · times, with `rowSpacing` and the three boxes still stored beside it;
* it renders byte-identically twice (1,140,279 bytes), and the **same** layout with the block stripped
  off draws a different file (1,139,801) — both models are live through the one route;
* the darkening changes the PNG; a custom days-off message changes the PNG; "Leave them out" changes it
  again;
* a weekly and a single event poster both render with **"Powered by HatchGrab"**.

---

## 9 · What is left open

* **The second line of "Big picture" is two cells, not one joined string** — §0 says why.
* **"Boxes sit exactly over their words" is true of the box, not of the glyphs.** The clickable area is
  the stored rectangle — the same one the renderer draws into — and the renderer centres the text
  inside it, so a box an operator has left taller than its words is clickable above and below them.
  Making the outline shrink to the drawn text would mean measuring the text in the browser, which is
  the one thing this editor refuses to do (it would be a second answer to "how big is this text?",
  and `fitLines` is the first).
* **The ⇔ handles are drawn on row 1 only.** Twenty-one handles over a truck's artwork is the "second
  design on top of their design" problem this editor has already fixed once; every row shares the same
  weights, so one row's handles move all seven.
* **A part cannot be nudged with the arrow keys or centred**, because it has no position of its own.
  The block can be, and is.
* **`textH` is invisible.** It is set by the conversion and scaled by a corner drag, and nothing in the
  UI shows it. That is deliberate — it is a compatibility measure, not a setting — but it is the one
  field in the new model that an operator cannot see or reset other than by pressing a quick layout.
* **"A busy week" and the filled example have lost their doors**, not their code.
* **The dashboard login** is why the editor is mounted rather than driven through the page. If you want
  the real page measured end to end in WebKit, the thing to give me is a test operator account.
* **The two make buttons being level costs a scroll on a short window.** Two cards of different
  content can only be level at the foot, so on a window shorter than the card (800px in the fixture;
  the real one is 1000) both primary buttons now need a scroll where before one of them did. The check
  that asserted "the event button is above the fold" is retired, with its reason, and replaced by the
  claims that still matter: neither button is clipped by its own card, and each is the last control
  before its caption.
* **Nothing is deployed and nothing is pushed. No SQL was run.**
