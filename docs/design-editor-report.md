# SOCIAL POSTS · PART 1 — ONE SHARED DESIGN EDITOR

**6 October 2026 · branch `main`, local. Pushed: no. Deployed: no.**

🔴 **No SQL was run and none is needed.** Every new setting lives in the existing `layout` jsonb
column. Nothing was written to the database. **No saved design and no place data was touched.**
Everything stays behind the existing `places_posts_preview` / `schedule_graphics` gates; a truck
without them sees no change.

⛔ **Two things a truck has already approved now render differently.** Both were asked for in the
brief. They are set out in §4 below, first, because they are the only part of this build that is not
backwards compatible.

---

## ⛔ 1 · THE TWO DELIBERATE BREAKS — READ THESE FIRST

### 1.1 · "Time shows as" is gone. A design saved as **"From 5pm" now renders "5pm – 9pm"**.

The single-event design had a setting with two values — `From 5pm` and `5pm – 9pm` — and it defaulted
to the first. The brief removes it: *"Time always shows start and finish."*

`EventTimeDisplay`, `formatEventTime()` and the `timeDisplay` field are **deleted**.
`validateEventLayout` no longer reads the stored value at all, so the next save drops it.

| | |
|---|---|
| **Who is affected** | any single-event design (Standard, or a place's own) saved with the default or with "From 5pm" chosen — which is **every** such design, because `from` was the default |
| **What they will see** | a single-event poster whose Time box read `From 5pm` now reads `5pm – 9pm` |
| **What they will see if the event has no finish time** | `5pm` — the range formatter returns just the start rather than a dangling dash. It never reads `From 5pm` again |
| **Asserted** | `scripts/design-editor.cjs` §3 and `scripts/weekly-post.cjs` §8b |

⚠️ **If you want the old behaviour kept as an option, say so** — it is a `TimeStyle`-shaped field and
about twenty lines to restore, but it would be a third thing in the Time item's toolbar.

### 1.2 · "Raised ordinals" is gone as a setting and is **always on**.

Every box had a `raisedOrdinals` boolean, default `false`. The brief removes the setting and makes it
always on. The field is **no longer parsed and no longer stored**; the renderer passes `true` through
one helper (`caseOf`), so there is nowhere for a `false` to survive.

| | |
|---|---|
| **Who is affected** | any design — weekly or single event — that left it off, which was the default |
| **What they will see** | `14` with a smaller, raised `TH` where it previously read `14TH` at full size |
| **Where it does NOT apply** | captions. A caption is a plain string and cannot draw a superscript, so `weekLabel()` and `shortDate()` still ask for the un-raised form |
| **Asserted** | `scripts/design-editor.cjs` §3 |

---

## 🔴 2 · ONE EDITOR

`components/manage/DesignEditor.tsx` — **1,261 lines**, and it replaces:

| Was | Lines removed |
|---|---|
| `WeeklyPost.tsx` → `SetupScreen`'s left list, drag surface and right-hand style column | −590 net |
| `EventPost.tsx` → `EventSetupScreen`'s left list, drag surface and right-hand style column | −508 net |

⛔ **THE TWO HAD ALREADY DRIFTED, AND THAT IS THE ARGUMENT.** Measured on the code as it stood this
morning:

| | weekly editor | event editor |
|---|---|---|
| Background colour behind the date | **two** (trading, days off) | **one** |
| On/off switches per box | **none** | three |
| The last-toggle rule | — | enforced |
| "Raised ordinals" | present | present |
| The colour control | a bare `<input type="color">` | **the same bug, written twice** |

Each new option in this brief would have had to be added to both, and the first one anybody forgot
would be a setting that worked on one screen and silently did nothing on the other.

### 2.1 · The shape of the screen

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ ‹ Designs   Weekly post design        Preview with ▾  Undo  Redo  Cancel  SAVE│
├──────────────┬────────────────────────────────────────────────────────────────┤
│ ON YOUR      │ DATE STYLE   FONT    SIZE    COLOUR   STYLE   LINE UP          │
│ WEEKLY POST  │ [Wed 14th…▾] [Oswald▾] −42+  ■■■■□    B  AA    ≡ ≡ ≡           │
│ ◉ Week head… │                                      ✦ Effects ▾  Advanced ▾   │
│   Week comm… ├────────────────────────────────────────────────────────────────┤
│ EACH ROW     │                                                                │
│ ◉ Date       │                  ┌──────────────────────┐                      │
│   Wednesday… │                  │                      │                      │
│ ◉ Place      │                  │   the renderer's     │                      │
│   The Kings… │                  │        PNG           │                      │
│ ◉ Time       │                  │                      │                      │
│   5pm – 9pm  │                  └──────────────────────┘                      │
│ ◉ Rows       │  Drag a box to move it, drag a corner to resize. Long names    │
│   96px apart │  shrink to fit the box.                                        │
│ + Add your…  │                                                                │
├──────────────┤                                                                │
│ BACKGROUND   │                                                                │
│ PICTURE      │                                                                │
│ 1080 × 1350  │                                                                │
│ Portrait 4:5 │                                                                │
│ Replace pic. │                                                                │
└──────────────┴────────────────────────────────────────────────────────────────┘
```

**There is no right-hand settings column at all**, and that is measured rather than asserted from the
source: the browser block reads the computed `grid-template-columns` **track count**, which is the only
thing that can tell a removed column from one that happens to be empty this render. **Two tracks above
900px, one below.**

⛔ **THE BREAKPOINT IS 900, NOT `lg` (1024)** — the fix you reported two builds ago, applied to the new
screen from the start. A 1000–1100px laptop window is the width this screen is used at.

### 2.2 · The left list

One list, with the brief's headings: **"On your weekly post"** on the weekly design, **"Text on your
post"** on the other two. Every item has an on/off switch, its name, and a **live grey sample**:

| Item | Sample | Where |
|---|---|---|
| Week heading | the heading template | weekly only |
| **EACH ROW** → Date | `Wednesday 14th October` — in the design's own date style, in the truck's country | all |
| **EACH ROW** → Place | `The Kings Arms · Lavenham` — in the design's own place style | all |
| **EACH ROW** → Time | `5pm – 9pm` — in the design's own clock | all |
| **EACH ROW** → Rows | `96px apart · Monday to Sunday` | weekly only |
| Your own text | the box's own text, or "The note you type when you make the post" | all |

🔴 **THE SAMPLES ARE A READOUT, NOT A LEGEND.** Changing the date style changes the sample. A
hard-coded "e.g. Monday 1st January" would be the one thing on the screen that could not be wrong, and
also the one thing that could not be right.

⚠️ **"Rows" has a spacer where the others have a switch.** Row spacing is a distance, not something
drawn, so it is not given a dead toggle to explain.

**The Place/Time last-toggle rule stays**, and it is now enforced by **both** validators rather than
only the event one — the weekly post draws cancelled events the same two ways. ⚠️ It cannot break an
existing design: every design saved before `enabled` existed reads as all-on.

### 2.3 · `enabled` moved onto every box

It was on the event layout's three boxes only, with a comment saying the weekly post had *"no
meaningful 'turn the date off'"*. That was true of the old screen and is not true of this one: the
brief gives **every** item a switch, and a truck whose artwork already prints "MONDAY" down the side
needs the weekly Date box **gone**, not dragged off the edge.

Default `true` in the validator, so every saved design reads as "everything on" — which is what they
were. Both renderers now skip a switched-off box and **its band**.

### 2.4 · The Background picture card

Thumbnail · `1080 × 1350 · Portrait (4:5)` · **Replace picture** · and the brief's sentence:

> Your picture without any date or place on it. We add those.

### 2.5 · Below 900px

The left list becomes **horizontal chips above the toolbar**, and they **wrap**. A horizontally
scrolling strip hides half its own contents at exactly the width with the least room to discover them
— and a scroll container above a drag surface is the easiest way to end up panning the page instead of
moving a box. The selected item's switch follows the chips, since the chip itself cannot hold one.

**No horizontal page scroll at either measured width.**

---

## 🔴 3 · THE TOOLBAR, THE EFFECTS POPOVER AND THE ADVANCED PANEL

### 3.1 · The toolbar — selected item only, directly above the picture

Small uppercase labels, `h-8` on every control so the row has one height, `flex-wrap` on the row and
`shrink-0` on each cell. **It wraps; it never scrolls sideways** — measured as `scrollWidth ≤
clientWidth` **beside** its own height, so "it wraps" cannot pass by the toolbar being empty.

| Cell | Date | Place | Time | Week heading | Your own text | Rows |
|---|---|---|---|---|---|---|
| **item style** | DATE STYLE ▾ | PLACE STYLE ▾ | TIME STYLE ▾ | the text field | the text field | SPACING −/+ |
| FONT · SIZE · COLOUR · STYLE · LINE UP | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| ✦ Effects ▾ · Advanced ▾ | ✓ | ✓ | ✓ | ✓ | ✓ | Advanced only |

- **DATE STYLE**'s options **are the dates themselves**, from the locale table: `Wednesday 14th
  October` / `Wed 14th Oct` / `14th October` / `Wed 14/10`. "Long" and "Short" would make the operator
  open each one to find out what it does.
- **STYLE** hides the Bold button for a family with **no bold file** rather than offering a lie — six
  of the twenty-one ship one weight, and `resolveWeight` falls back to the 400 file, so the button
  would depress and change nothing.
- **LINE UP** is three drawn icons, not a dropdown. Drawn rather than glyphs: the Unicode alignment
  characters are missing from several system fonts and render as a box.
- **COLOUR** — see §3.4.
- The **✦ Effects** button is **lit when the item has any effect**, so an operator can see that
  without opening the panel.

### 3.2 · Effects — "Effects for the date" / "…the place" / "…the time" / "…your own text"

> Make the words easier to read on a busy picture.

| Control | Words |
|---|---|
| **Shadow** | None · Soft · Strong |
| **Outline each letter** + colour | *A thin line around each letter.* |
| **Band behind the words** + colour | *A coloured strip behind the text, like a label.* |
| **Band on days off** *(weekly)* / **Band when the event is cancelled** *(single event)* | the post-type add-on, on the Date item only |
| **Keep it readable automatically** — **on by default** | *If the words are hard to read on your picture, we add a soft shadow. Your colours never change.* |

#### ⛔ The band replaces "Background behind the date", and old designs are mapped to it at the same look

| | |
|---|---|
| **What it was** | a `bgTrading` colour on the **date box alone** — so a truck who wanted a label strip behind the **time** could not have one |
| **What it is** | `effects.band` on **every** item, with colour, see-through, corners and padding |
| **The mapping** | a stored `bgTrading` arrives as `band: true, bandColour: <it>, bandOpacity: 100, bandRadius: 0, bandPadding: 0` |
| **Why that is "the same look"** | fully opaque, square corners and no padding is **exactly** what the old code drew — a rectangle filling the box rect |
| **Proved how** | 🔴 **a pixel comparison.** `scripts/design-editor.cjs` §1 renders the migrated design and a design with the band set by hand, and requires the PNGs to be **byte-identical** |
| ⚠️ **Once saved by the new editor** | the legacy field is **not re-read**. A truck who switches the band off keeps it off |

🔴 **`keepReadable` became per item, with the design-wide flag as its default.** The rule is about one
colour on one patch of picture, so a truck with white text on a dark sky and dark text on a light band
wants it on for one and off for the other. `parseBox` takes the old design-wide value and hands it
down, so an old design keeps its single answer for all of its boxes — asserted.

### 3.3 · Advanced — closed by default · "Advanced · Date" · *Most posts never need these.*

| Group | Controls |
|---|---|
| **WORDING** | **Day on its own line** *(Date only — the field formerly labelled "Two lines")* · **Time style** 12h/24h *(Time only; the default comes from the country)* · **On a day with no event** *(Place, weekly only)* · **Words before** — e.g. "Find us" |
| **LETTERS** | Italic · Letter spacing · Line spacing |
| **POSITION** | **Tilt** −15°…+15°, default 0 · **Centre on the picture** → Across / Up and down |
| **LONG NAMES** | **If it doesn't fit** → Shrink to fit *(default)* / Use two lines |
| **STAND OUT** | Shadow strength · Outline thickness · Band see-through · Band corners · Band space around |
| **WHOLE PICTURE** | **Darken the picture** 0–60%, default 0 — a dark layer **under all the text** |
| | **Copy this style to all text** · and, on a "Your own text" item, Remove this text box |

- ⚠️ **"Two lines" became "Day on its own line" — same stored field.** "Two lines" was read as "wrap
  this box when it is too long", which is what **If it doesn't fit** does; two settings that sounded
  like each other and did different things.
- ⚠️ **Time style appears in the toolbar AND in Advanced**, bound to the **same** piece of state. The
  brief asks for it in both places; one piece of state means they cannot disagree, and the Advanced
  copy says so.
- ⚠️ **"Band see-through" is shown as see-through and stored as opacity.** `90% see-through` is what an
  operator means; `bandOpacity: 10` is what the renderer needs. The conversion lives in one place.
- ⛔ **"Copy this style to all text" does NOT copy the line-up.** Line-up is a **positional** decision:
  a weekly design has the date left and the time right on purpose, and copying one item's alignment
  onto all of them would collapse a three-column row into one. It copies family, size, weight,
  capitals, colour, letter and line spacing, tilt, the long-name rule and the whole Effects object —
  and **re-samples** `bgSample` per box, because that is the colour of the artwork *under that box*.
- ⚠️ **Darken is design-wide**, so it is the same control on every item's panel rather than five
  copies of one value.

### 3.4 · ⛔ The colour control was broken in both old screens

Both wrote `<input type="color">` bare. **In Safari that renders as an empty well until it is opened**
— so a design whose date is white showed a **blank rectangle** where its colour should be, and a truck
checking "what colour is my date?" could not tell. It was written twice, which is why nobody noticed.

`ColourField` draws the current colour itself, with eight swatches beside it and the native picker
**invisible on top of** the swatch — so the colour is always visible and clicking it still opens the
system picker. **Never an empty box.**

### 3.5 · Undo / redo

⌘Z and ⇧⌘Z (and Ctrl+Z, for a keyboard on an iPad). One `past / present / future` state object, every
update functional.

- 🔴 **One drag is ONE undo step.** The first pointer move opens the history entry; the release closes
  it. Without that, fifty presses of ⌘Z would undo one drag.
- 🔴 **Ignored while typing.** A heading field or a "Words before" box has its own undo stack that the
  operator expects to work; stealing ⌘Z inside an input would undo their last **drag** while they were
  fixing a typo.
- ⚠️ The two buttons are **disabled, not hidden** — a button that appears and disappears would shift
  Cancel and Save every time anything was undone.

### 3.6 · Dragging, resizing and snapping

`DraggableBox` moved to **its own file** (`components/manage/DraggableBox.tsx`) and gained
**snap-to-centre** with a hairline orange guide, shown **only while snapped**. A permanent pair of
centre lines over someone's artwork is a second design on top of their design.

- ⛔ **The snap threshold is defined on SCREEN and converted in.** A fixed 8 *native* pixels is an 8px
  pull on a 1080px blank at full size and a 2px pull on the same blank at a quarter size — unreachable
  on a phone, a twitch on a 2160px poster. The pull the operator **feels** has to be constant.
- 🔴 **Snapping applies while MOVING and never while resizing.** A corner drag changes two edges at
  once; pulling one to the centre line would move the opposite edge as a side effect, so the box would
  appear to resize from the wrong corner.
- 🔴 **It is still the one implementation.** Its pointer handling took three fixes to get right on
  touch. `scripts/weekly-post.cjs`, `places-tab.cjs` and `social-posts.cjs` all assert the count of
  `export function DraggableBox` in `components/` + `lib/` is **exactly one**.

---

## 🔴 4 · REGIONAL DATES AND TIMES — `lib/weekly-post/locale.ts`

**293 lines.** One table, keyed by country code, holding each country's date styles, its numeric order
and its default time style. **Every formatter and the renderer read it.**

| | GB *(the default for everyone)* | US |
|---|---|---|
| `long` | Wednesday 14th October | Wednesday, October 14th |
| `short` | Wed 14th Oct | Wed, Oct 14th |
| `dayMonth` | 14th October | October 14th |
| `numeric` | Wed 14/10 | **Wed 10/14** |
| numeric order | `dmy` | `mdy` |
| default time | `5pm – 9pm` (12h) | `5pm – 9pm` (12h) |

- 🔴 **THE IDS NAME THE SHAPE, NOT THE WORDS.** `long` is "the weekday, the day and the month in full",
  whichever order that country writes them in. Ids like `'wednesday-14th-october'` would have made the
  **stored** value country-specific, so a truck that moved country would carry the old country's
  wording in its design for ever.
- ⛔ **`numeric` is the one style where the order changes the MEANING.** `14/10` and `10/14` are the
  same day to the truck that wrote them and two different days to a reader from the other country. It
  is the reason the table is keyed by country rather than by taste.
- 🔴 **"Day on its own line" breaks where the country allows, and the US comma goes with it.** GB
  breaks after a space; the US breaks after a **comma**, and the comma must then disappear — a line
  ending in a dangling comma on a poster reads as a mistake. A component that split a finished string
  on its first space would get GB right and put `Wednesday,` on its own line for an American truck.
  That is why `datePartsFor()` returns `{ weekday, separator, rest }` rather than a string.
- ⚠️ **An unknown country falls back to GB rather than throwing.** A design must still render for a
  truck whose country column says something this build has not met.

### 4.1 · The country is read through ONE function

```ts
export function countryForTruck(truck?: { country?: string | null } | null): CountryCode
```

It **returns `'GB'` for everyone**, because `trucks` has no country column. ⛔ **That is the point:**
every caller asks it instead of assuming, so the day the column exists this function reads it and
nothing else in the product changes. It is called in **one place** — `app/api/weekly-post/route.ts` —
and the country travels to the editor in the `load` / `event_load` responses and to the renderer as a
`country` argument.

⛔ **No component may default it, and that is swept for.** `scripts/design-editor.cjs` §5 asserts that
`countryForTruck` appears in the route and **not** in the editor, and that none of the four editor
files contains a month name, a hand-built ordinal suffix, or a `${d}/${m}`.

### 4.2 · What moved out of `format.ts`

`dayAndMonthRuns`, `weekdayName` and `longDateRuns` are **gone**. They wrote "28th September" and
nothing else — the UK's order, hard-coded in the module every other module asks about words.

⚠️ **`headingRuns` now TAKES a date formatter.** `locale.ts` imports `format.ts` for `ordinal` and
`TextRun`, so calling it from `format.ts` would close the cycle — and in a module graph the harness
compiles as plain CommonJS, a cycle means one of the two gets a half-initialised copy of the other: a
bug that shows up as an undefined function at render time and nowhere earlier. The renderer, which
already knows the country, supplies it.

### 4.3 · The caption asks the same table

`caption.ts` carried its own `SHORT_DAYS` / `SHORT_MONTHS` arrays and spelled `Tue 13 Oct` out in the
UK's order — a third copy of "how is a date written". Both of its date helpers now go through the
table. ⚠️ **GB output is unchanged**, which is checked.

### 4.4 · The place style

| Option | What it draws | |
|---|---|---|
| **Name, town below** | `The Kings Arms` / `Lavenham` *(smaller second line)* | **today's behaviour, the default** |
| **Name, town** | `The Kings Arms, Lavenham` | one line |
| **Name only** | `The Kings Arms` | |

🔴 **THE TIME BOX'S SPACER FOLLOWS THE PLACE STYLE, AND FORGETTING THAT WAS THE OBVIOUS BUG HERE.** The
Time box draws a blank line under each entry to stay level with a Place column that has a town line
under each name. Under "Name, town" and "Name only" there **is** no town line — so a spacer would push
every time down one line against nothing, and on a stacked day the second event's time would sit
beside the first event's name.

⚠️ **The suppression rule is not repeated.** `townLine()` in `week-data.ts` has already decided whether
there *is* a town (null when the name contains it, null for a private event); the place style only
decides where to put one that exists.

### 4.5 · How an old design maps

| Stored | Becomes | Renders |
|---|---|---|
| no `dateStyle` | `'long'` (`LEGACY_DATE_STYLE`) | **exactly what it renders today** |
| no `placeStyle` | `'nameTownBelow'` | **exactly what it renders today** |
| an unknown style id *(a rollback from a later build)* | the legacy one | a poster in the wrong style is recoverable; one that will not render is not |

---

## 🔴 5 · THE RENDERER — EVERY NEW OPTION IS DRAWN BY THE ONE RENDERER

Nothing is imitated in the browser. The editor draws the dashed outlines and nothing else; every pixel
of the poster is `lib/weekly-post/render.ts` through `/api/weekly-post`.

| Option | How it is drawn | Honest? |
|---|---|---|
| Shadow None/Soft/Strong | `textShadow`, one offset, blur and opacity per preset | ✅ real |
| Shadow strength | moves the shadow's **opacity**, not its distance — a stronger shadow further from the letters reads as a second blurry copy of the text | ✅ real |
| **Outline** | ⚠️ **four layered `text-shadow` offsets, not a stroke** — see §5.1 | ⚠️ approximation |
| Band: colour, see-through, corners, padding | a `div` behind the text with `backgroundColor` (8-digit hex), `borderRadius`, inflated by the padding | ✅ real |
| **Italic** | ⚠️ **a 12° `skewX`, not a designed italic** — see §5.2 | ⚠️ approximation |
| Letter spacing | `letterSpacing`, **applied per run** — satori does not inherit it from a flex container to the text nodes inside | ✅ real |
| Line spacing | multiplies `fit.ts`'s `LINE_GAP` | ✅ real |
| Tilt | `transform: rotate(Ndeg)` with `transformOrigin: center`, on the band **and** the text | ✅ real |
| Darken the picture | one `div` at 0–60% black, pushed **before** the text children | ✅ real |
| Words before | **prepended to the runs**, so it shrinks to fit with the rest and can never end up in a different size from the name it introduces. First line only | ✅ real |
| Date / place / time styles | `locale.ts` | ✅ real |
| **If it doesn't fit → two lines** | a word-boundary split **before** the size search — see §5.3 | ✅ real |

### 5.1 · ⚠️ The outline is four layered text-shadows, not a stroke

satori has **no `-webkit-text-stroke` and no `paint-order`**. Four diagonal offsets of the outline
colour at a small blur is the closest honest approximation — and it is the same trick
`outlineShadow()` has always used for the automatic readability rule, so this is not a new
compromise, it is an existing one made available as a setting.

**What it is not:** a true stroke. **Above about thickness 8 the corners of a letter round off.** The
thickness slider goes to 10 and the top two values look soft rather than sharp.

⚠️ **And the outline is painted LAST in the shadow list**, because `text-shadow` paints the first entry
on top: an outline painted over a soft shadow would have the shadow fill in the gap the outline is
meant to leave.

⚠️ **The automatic readability shadow is skipped when the operator has chosen a preset.** Two soft
shadows on top of each other makes the text look bruised, and the automatic rule's job — "the words
are hard to read" — is already done by the one they chose. ⛔ **All three contributors are combined in
ONE function** (`textShadowFor`), because CSS has a single `text-shadow`: written separately in the
renderer, the last one assigned would silently win, and the automatic one is assigned last — so
turning on "Strong shadow" on a low-contrast picture would have switched the shadow **off**.

### 5.2 · ⚠️ Italic is a shear, not an italic face

The 21 bundled families ship `-400.ttf` and `-700.ttf` **only**. There is no italic file, and
`fontsForDesign` passes `style: 'normal'` for every one of them — so telling satori `fontStyle:
'italic'` would draw the upright face and the setting would be **silently inert**.

The renderer skews the text by **12°**, which is what a word processor does when a family has no
italic. ⚠️ **Letterforms are slanted, not redrawn**, so a handwriting family (Caveat, Pacifico,
Dancing Script) gains nothing from it and may look worse. The Advanced panel says so in its hint.

### 5.3 · "Use two lines" is solved in `fit.ts`, not in the renderer

⛔ **It could not be applied in the renderer alone.** Letter spacing makes every line wider, line
spacing makes the block taller, and "use two lines" changes how many lines there are — drawing any of
them without **measuring** them is how text that "fitted" lands outside its box, which is the one
thing that module promises never happens.

- 🔴 **The wrap is tried BEFORE the size search.** Wrapping a line that has already been shrunk would
  produce two small lines where one large one was possible; the operator asked for two lines so the
  text could stay **big**.
- ⚠️ **Only lines that do not already fit are wrapped.** Otherwise "Lavenham" would be split on every
  row that was never the problem.
- ⚠️ **Split by measured width, not by character count**, so the two lines come out close to even and
  read as a deliberate wrap rather than an accident. It works **across runs**, so a date's raised
  ordinal stays raised on whichever line it lands on.
- ⛔ **One long word with no space in it is returned untouched** and the size search takes over. We do
  not invent a hyphen in "Waldingfield" on someone's poster.
- ⚠️ **`letterSpacing` shrinks with the font and is RETURNED by `fitLines`** rather than recomputed by
  the renderer. Two different pieces of arithmetic for one value would make every line measure as
  fitting and draw a little wider — invisible until a long place name.

### 5.4 · The validator

`LAYOUT_VERSION` **stays at 1**. Bumping it would make the validator refuse every saved design, which
is the opposite of compatible.

| | |
|---|---|
| Every new field is **optional on input** | with a default that draws nothing |
| `shadowStrength` | 0–100 |
| `outlineWidth` | 1–10 |
| `bandOpacity` | 0–100 |
| `bandRadius`, `bandPadding` | 0–**image height**. A 40px radius is a gentle curve on a 2160px poster and a blob on a 600px one, so the only honest ceiling is the picture |
| `letterSpacing` | **−½× to +2× the font size**. A typographic measure, not a pixel constant — ±200px is meaningless at both 600px and 2160px |
| `lineSpacing` | 50–300 % |
| `tilt` | **−15…+15°**, the brief's range. A box rotated 40° leaves its own outline, so the drag handles would no longer be over the text they move |
| `darken` | 0–**60 %**, the brief's cap. 100% would hide the artwork completely and leave text on a black rectangle |
| **Junk is still refused** | `Number.isFinite`, not `typeof === 'number'`: `NaN` and `Infinity` are both numbers and both reach satori as a silently undrawn element |

⚠️ **`scaleEventLayout` scales the pixel-valued new fields too** — letter spacing, band radius and band
padding, by the **height** factor, like the font size. Carrying them unchanged onto a 2160px canvas
would halve the tracking and shrink a 40px corner to a hairline. ⚠️ **Tilt, line spacing and italic do
NOT scale**: a degree is a degree and a percentage is a percentage at any resolution.

---

## 🔴 6 · "YOUR OWN TEXT" — WHAT THE NOTE BOX BECAME

The brief names the note boxes **"Your own text"** and gives the item **a text field in the toolbar**.
A box that only ever drew the note typed on the make screen has no text of its own to edit, so:

| | |
|---|---|
| `NoteBox` gains `text: string` | and `Layout.note` / `EventLayout.note` become **`notes: NoteBox[]`**, up to **4** |
| The one token it understands is **`{note}`** | replaced with whatever was typed when the post was made |
| 🔴 **An old single `note` migrates to `notes[0]` with text exactly `'{note}'`** | which renders the typed note, and **nothing** when there is none — which is what it has always done |
| ⚠️ A box whose text comes out **empty after substitution** is not drawn at all, band included | which is the older rule ("an empty bordered area on finished artwork looks like a mistake") and is what makes the token work |
| ⛔ **The emptiness test is on the SUBSTITUTED string** | testing `box.text` would find `'{note}'` non-empty and draw an empty box on **every** poster made without a note |
| ⚠️ A new box starts at `'{note}'` | so it behaves like the old one, and the toolbar names the token so an operator who sees it does not delete it |
| ⚠️ A ceiling of 4, not a refusal | the render cost is linear in this number, and an unbounded array in a `jsonb` column written from a browser is a way to make one request take a minute. A payload with nine keeps the first four |
| ⚠️ A box that fails to parse is **dropped, not fatal** | the three real boxes are the design; a stray fifth text box with a bad coordinate should not cost the operator their whole poster — and dropped rather than clamped, because a text box in the wrong place is worse than one missing |

⛔ **`{note}` and `{start}`/`{end}` are NOT one template language.** The heading understands the week's
dates and not the note; a text box understands the note and not the dates. Two tokens, each named
where it works, rather than a shared mini-language nobody documents.

---

## 🔴 7 · THE POST-TYPE ADD-ONS

Passed in, or switched on by `kind` — never a branch the editor had to grow.

| Post type | Add-on | Where it lives |
|---|---|---|
| **Weekly** | **Week heading** item, with its text field in the toolbar | an item in the list |
| | **Rows** item — spacing, and "Days run Monday to Sunday" | an item in the list |
| | **Days-off text** — "On a day with no event" | the **Place** item's Advanced → WORDING |
| | **Show cancelled events** | the **Rows** item's Advanced |
| | **Band on days off** | the **Date** item's Effects |
| | **A filled example**, shown faintly over the preview | a caller's `footer` panel + the `overlayUrl` prop |
| **Single event** | **Band when the event is cancelled** | the **Date** item's Effects |
| **A place's** | **Same positions as Standard / Own positions for ⟨place⟩** | a `scope` prop, drawn **at the top of the left panel**, above the item list |
| | the Remove / "Use Standard design here instead" control | a caller's `footer` panel |

⚠️ **The filled example was kept although the brief does not mention it.** It is the one feature of the
old setup screen that cannot be reproduced from anything else on the page — lining boxes up against a
real finished poster — so dropping it would have been a quiet removal rather than a redesign. **Say if
you want it gone.**

### 7.1 · "Preview with"

| Screen | Options |
|---|---|
| **Weekly design** | This week · Next week · **A busy week** |
| **Single event / a place's** | the next **up to 8 public** events, as `Sat 11 Oct · The Kings Arms` |

- ⛔ **"A busy week" replaces the old "Preview a busy week" button**, which changed what the picture
  showed and said nothing about what it was showing instead. It is still week **data** through the
  same renderer — a 60-character place name, a stacked Saturday, a cancelled day and a day off.
- 🔴 **The event design's preview was not a choice before this build.** The server picked one and the
  screen explained itself when the pick was odd; an operator designing for a festival in three weeks
  could not see their design against it. The server still **chooses the default** (a place's design
  previews on an event at that place, which is a fact about the schedule) and now also returns the
  next few.
- ⚠️ **Public events only.** A private booking previews as "Private event" with no place, so offering
  it would mean choosing the one event that shows the operator the least about their own Place box.

---

## 🔴 8 · THE DESIGNS PAGE

| | Was | Is |
|---|---|---|
| **Box 2's heading** | Event post design | **Single event post design** |
| **Its description** | "Your background picture for a single event post. We write that event's date, place and times on top of it." | "Your **standard** design for a post about one event. We write that event's date, place and times on top of it." *(**standard** bold)* |
| **Used for:** | "every event post, at every place — unless that place has its own design." | "every post about a single event." |
| **Its button** | Set up / Edit **event design** | **Set up single event design** / **Edit single event design** |

⛔ **"Event post design" named the wrong distinction.** The box beside it — "Designs for a place" — is
**also** a design for event posts, so an operator reading the two headings could not tell which one
their next post would use. And **standard** is bold because it is the fact that makes Box 3 make
sense: this one is the default, and a place with its own replaces it there.

**The matching wording, fixed in six places:**

| Where | Now reads |
|---|---|
| Make-a-post empty state | "You haven't designed **a single event post** yet" |
| Make-a-post footnote | "…otherwise your **single event post** design." |
| Box 3's description | "…instead of your **single event post** design." |
| Box 3's footer | a copy **function**, `placeDesignFooter()` — "3 with their own design · 18 using your **single event post** design" |
| The place editor's scope line | "Everywhere else uses your **single event post** design." |
| `EventPost.tsx`'s set-up card | "Set up your **single event** post" |

⚠️ **The footer became a function in the copy file** rather than a sentence in the JSX: Box 2's name
changed and the footer names it, so they had to change **together** — in one file rather than in two
that could be edited one at a time.

### 8.1 · "Designs for a place" — the order and the orange button

| | |
|---|---|
| 🔴 **Places WITHOUT their own design come FIRST** | it was the other way round. Box 3's job is to get a picture onto a venue that has not got one, so the rows an operator can **act on** were the ones they had to scroll past twenty finished places to reach |
| 🔴 **Their "Design" button is ORANGE** | giving a venue its own picture IS making something, and it is the one act Box 3 exists for |
| ⚠️ **"Edit" stays outlined** | it goes to a design that already exists, which is navigation |
| ⚠️ **It is NOT a fourth primary** | `BTN_PRIMARY` is the full-width bottom-of-box button and is a size bigger. A row button that changed **size** as well as colour between its two states would make the list's rows two different heights. It is its own class, with the same padding and text size as the outlined one |
| ⚠️ **The sort is stable within each half** | `places` arrives favourites-first then by name; equal rows return 0, which keeps that order |

---

## 🔴 9 · "Show private events" ON THE WEEKLY MAKE SCREEN

A toggle next to **Show cancelled events**, **OFF by default**.

⛔ **THIS IS A REDUCTION, AND THE BRIEF'S DESCRIPTION OF TODAY WAS NOT QUITE RIGHT — SO SAY SO.** The
brief says *"When off they are left out as today."* **They were not left out.** `buildWeekData` had no
privacy filter at all, so **a private event appeared on every weekly poster** as a "Private event" row
with its date and times, and there was **no way to leave it out**. What this build adds is the ability
to leave it out, and it makes that the default.

| | |
|---|---|
| **OFF (default)** | the event is not in the week at all — not in the poster, not in the caption, not in the tick list |
| **ON** | the row reads **"Private event"** with its date and its times |
| ⛔ **Never, in either state** | its place, its town, its place name, or any place picture |
| **Why that holds** | `locationName()` returns `PRIVATE_PUBLIC_LABEL` and `townLine()` returns `null`, **both before the place is consulted** — the same rule the public schedule page obeys. The flag decides whether the row **exists**, never what it says |
| ⚠️ **A private event that is also cancelled** | is left out for being **private**, not kept for being cancelled — the test is before the cancelled one |

### 9.1 · 🔴 The server decides

```ts
const showPrivate = body.showPrivate === true        // app/api/weekly-post/route.ts, read ONCE
```

- ⛔ **A browser-side filter could not have affected the PNG at all**, because the renderer runs on the
  server. The flag reaches `buildWeekData`, which drops the events.
- ⚠️ **`=== true`, not truthiness.** `"false"`, `1` and `[]` are all truthy values a hand-made payload
  could send, and every one of them would put a private booking on a poster.
- ⚠️ **Read once, for all three actions** (`load`, `captions`, `render`), so the tick list, the caption
  and the picture are **one** answer. Sending it to the picture and not the caption would produce a
  poster with a booking on it and a caption that did not mention it — or the reverse, which is worse.
- ⚠️ **The toggle lives in `WeeklyPostApp`, not in the make screen.** The tick list comes from the
  `load` response, so a flag held locally would change what the **poster** contained while the list
  beside it still showed the old set. It is lifted to the one component that calls `load`, exactly as
  the week choice already is.

---

## ⚠️ 10 · THREE PLACES I NARROWED THE BRIEF, AND WHY

| | |
|---|---|
| ⚠️ **"note boxes" is up to FOUR, not unbounded** | the render cost is linear in the count and the column is written from a browser. Four is more than any poster needs; say if you want more |
| ⚠️ **"Preview with" is hidden when there is nothing to choose** | on a design whose truck has no events at all, the select would be empty. The server's own explanation line ("Preview uses your last event here") still shows |
| ⚠️ **The weekly post's "Show cancelled events" stayed where it was** | it is the make screen's local toggle **and** a saved layout field. §3 puts it in the **Rows** item's Advanced on the design screen; the make screen's own copy is untouched, so the two still work the way they did |

---

## ✅ 11 · WHAT WAS RUN

| | |
|---|---|
| `tsc --noEmit` | **clean** |
| `npx next build` | **✓ Compiled successfully** |
| **ESLint — product code** | **identical: 774 errors in `app`+`components`+`lib` both ways.** Warnings **down 2** (dead imports removed) |
| **ESLint — whole repo** | errors rise by exactly **4**, all `@typescript-eslint/no-require-imports` in the new harness. That class already accounts for **525** errors across the 95 existing harnesses |
| **Full sweep** | `node scripts/run-harnesses.cjs` — **96 run · 96 passed · 0 failed**, run twice: once on the finished tree, and once more after four stale comments were corrected |

### 11.1 · `scripts/design-editor.cjs` — new, **60 checks**, registered in `harnesses.json`

| § | What it proves |
|---|---|
| **1** | 🔴 **a stored layout from before today renders BYTE-IDENTICALLY** to the same design built fresh — and the comparison **can** fail (moving one box changes the bytes) · every new field comes back at a no-op default · the old `bgTrading` becomes the band **and draws the same pixels** · a design already saved by the new editor keeps its own band |
| **2** | 🔴 **twenty options, twenty pixel comparisons**: each one renders and **changes the picture** · the numeric fields are bounded · `NaN`/`Infinity` are refused · darken is capped at 60% |
| **3** | ⛔ the two deliberate breaks, asserted **as changes** so they cannot be reintroduced by accident or forgotten |
| **4** | 🔴 private events: off by default · on, with date and times · **never the venue, the town or the place id** · a cancelled-and-private event is dropped for being private · the server reads the flag once, strictly, and it reaches `buildWeekData` · the make screen's toggle, off by default, next to the cancelled one |
| **5** | 🔴 the grid is two columns at 900 and not `lg` · the toolbar is above the picture and wraps · the two list headings and EACH ROW · every toolbar cell · the Effects words · Advanced closed, per item, every group · the caption · ⌘Z/⇧⌘Z and one-undo-per-drag · the colour control draws its own colour · chips above the toolbar below 900 · **no hard-coded date wording in any editor file** · the country through one function |
| **6** | 🔴 §8's wording and the reversed order with the orange button |

### 11.2 · `scripts/weekly-post.cjs` — **221 checks · 35 mutation variants, 35 failed as required**

- **The locale formatters:** all four styles in **both** countries against the table's own samples, and
  **the picker's samples ARE the formatter's output** — so the list cannot promise a format it does not
  draw. **A teens date (11th November) in every style in both countries.** The numeric reversal. The
  two-line break and the dropped US comma. An unknown country. An unknown date style.
- **The old→new mapping:** an old single `note` migrates to `notes[0]` with the `{note}` token; the box
  count is bounded; a stored `timeDisplay` is ignored rather than refused.
- **V15 re-aimed** to the new `noteEls` guard; **V20 replaced** (see §11.4).

### 11.3 · `scripts/social-posts-render.cjs` — the editor, **WebKit only**, **1100×800 and 390×844**

Per the brief: no long multi-width sweep, no Chromium retries.

| 1100×800 | 390×844 |
|---|---|
| grid **2** tracks (`250px 810px`) | grid **1** track (`366px`) |
| no horizontal page scroll | no horizontal page scroll |
| toolbar ends 188, picture starts 200 | toolbar ends 544, picture starts 556 |
| toolbar wraps (808 in 808, 132px tall) | toolbar wraps (364 in 364, 313px tall) |
| picture 410×512 ≤ 64vh (512) | picture 366×458 ≤ 64vh (540) |
| left list present, 250px, picture **beside** it | list becomes **chips**, above the toolbar, wrapping |

⚠️ **Plus the editor's own control:** with the two-column rule stripped, 1100px must come out as
**one** track — so "the grid has two columns" is a measurement rather than a restatement. Screenshots
in `docs/screenshots/design-editor/`.

### 11.4 · Five harness faults found and fixed

1. ⛔ **A COUNT IN RAW SOURCE IS THE SAME TRAP AS A BOOLEAN, AND IT HID BETTER.**
   `social-posts.cjs`'s "exactly four buttons may be primary" counted `data-primary` in **unstripped**
   source and went to **five**, because the note explaining that the new orange place-row button is
   *not* a primary contains the words `data-primary`. **A count going up reads as a product change
   rather than a harness fault.** `codeOf` before any source assertion — **including counts**. Sixth
   instance of this class in this project.
2. ⚠️ **AN EFFECT ON TEXT HAS NO PIXELS WHEN THE TEXT IS EMPTY.** The replacement V20 — "a `{note}` box
   is drawn on every post made without a note" — could not fail until the fixture gave that box a
   **band**: an empty text element is zero pixels and the two images came out identical. The same fault
   the first draft of V15 had, in a new place.
3. ⚠️ **AN ABSENCE TEST OVER A WHOLE FILE CATCHES THE CORRECT USE TOO.** `!/raisedOrdinals/` on the
   editor failed on the **one correct call left** — the formatter that builds the grey **sample**,
   which is a plain string and cannot draw a superscript. Satisfying it by deleting that call would
   have broken the sample. The check now names the **control** it forbids, not the word.
4. ⚠️ **A HARNESS THAT NAMED A FILE RATHER THAN A FACT.** Three checks required the one `DraggableBox`
   definition to be in `WeeklyPost.tsx`. The **count** is the claim; the file was incidental, and the
   claim survived the move.
5. ⚠️ **FOUR COMMENTS DESCRIBED BEHAVIOUR THAT NO LONGER EXISTS.** `render.ts` and `week-data.ts` still
   explained why the single-event poster said "From 5pm" and why the raw times travel beside the
   formatted one. The second reason is still true; the first is gone. **A stale comment is the exact
   mechanism that kept a `places-tab.cjs` check green for a day** — found by grepping the whole feature
   for `From 5pm` after the code was finished, which is a step worth keeping.
6. ⛔ **A `git stash` TO MEASURE AN ESLINT BASELINE CORRUPTED A RUNNING SWEEP.** The full sweep was in
   the background reading the working tree; stashing swapped the tree under it. Stopped by the
   **recorded task id** — never by name or pattern — and re-run from a quiet tree. **Nothing may stash
   while anything is reading the tree.**

⚠️ **And one product bug the harness caught back:** `places-tab.cjs` asserted that the Place toggle
said *why* it may be off ("The place name is in your picture — HatchGrab won't add it."). I had dropped
that line in the rewrite. It is back, under the list, shown only when Place is off.

---

## 📄 12 · FILES

| File | |
|---|---|
| **`components/manage/DesignEditor.tsx`** | **new, 1,261 lines** — the one editor |
| **`components/manage/DesignEditorBits.tsx`** | **new, 263** — Stepper, Slider, ColourField, Switch, CheckRow, Popover, the toolbar classes |
| **`components/manage/DraggableBox.tsx`** | **new, 158** — moved out of `WeeklyPost.tsx`, plus centre-snapping |
| **`components/manage/FontPicker.tsx`** | **new, 69** — grouped, with `familyHasBold`. Part 2 extends this one file |
| **`lib/weekly-post/locale.ts`** | **new, 293** — the country table and `countryForTruck()` |
| **`scripts/design-editor.cjs`** | **new, 495** — 60 checks |
| `lib/weekly-post/layout.ts` | +578 — `Effects`, the extras, `enabled` on every box, `notes[]`, the two validators, `parseEffects`/`parseExtras`/`parseNotes` |
| `lib/weekly-post/render.ts` | +283 — the effects layer, the darken layer, `withWordsBefore`, `noteEls`, `enabled` guards |
| `lib/weekly-post/fit.ts` | +153 — letter spacing, line spacing, `splitRunsInTwo` |
| `lib/weekly-post/contrast.ts` | +120 — `textShadowFor`, `presetShadow`, `withAlpha` |
| `lib/weekly-post/format.ts` | −95/+95 — the dates moved out; `headingRuns` takes a formatter; `formatEventTime` deleted |
| `lib/weekly-post/caption.ts` | the two date helpers ask the locale table |
| `lib/weekly-post/week-data.ts` | +24 — `showPrivate` |
| `components/manage/WeeklyPost.tsx` | **−590 net** — the editor is gone; `showPrivate` added to the make screen |
| `components/manage/EventPost.tsx` | **−508 net** — the editor is gone; the designs list became a pill row |
| `components/manage/SocialPosts.tsx` | +55 — §8 |
| `lib/copy/socialPosts.ts` | +61 — §8's wording |
| `app/api/weekly-post/route.ts` | +43 — `country`, `showPrivate`, `previewEvents` |
| `docs/reference-manual.md` | **V14.6** |
| 4 harnesses re-aimed | `weekly-post`, `social-posts`, `places-tab`, `social-posts-render` |

**No SQL. I do not expect any — and none is included, because there is none to run.**

---

## 🧪 13 · THE LOCALHOST TEST LIST — PIZZA KITCHEN ONLY, SAFARI ON MAC

**Setup.** `npm run dev` · open `/manage/<Pizza Kitchen's token>` · **Schedule › Social posts**.
⚠️ **⌘⌥R for a hard reload** before you start — the editor is a new component and a cached chunk will
show you the old screen. For the narrow widths: **Develop › Enter Responsive Design Mode**.

⚠️ **Pizza Kitchen has no rows in `truck_post_designs`**, so §13.1 begins by uploading a picture. Any
PNG at least 600px on the short side will do; a 4:5 portrait is the realistic shape.

### 13.1 · The layout

| # | Do | Expect |
|---|---|---|
| 1 | Designs › **Set up weekly design** → upload a blank | the editor opens: a list on the **left**, the picture **centre**, a toolbar **above** the picture |
| 2 | Look to the right of the picture | **nothing.** No settings column. The picture fills the width |
| 3 | Widen and narrow the window between about **850 and 950px** | the list and the picture swap between side-by-side and stacked **at 900** |
| 4 | At any width, try to scroll the page sideways | **it does not.** Nothing is cut off at the right edge |
| 5 | Read the list | Week heading · **EACH ROW** · Date · Place · Time · Rows · + Add your own text |
| 6 | Read the grey line under **Date** | a real date — `Wednesday 14th October` |
| 7 | Read the grey line under **Place** and **Time** | `The Kings Arms · Lavenham` and `5pm – 9pm` |
| 8 | Scroll the left column down | **Background picture** · `1080 × 1350 · Portrait (4:5)` · Replace picture · *"Your picture without any date or place on it. We add those."* |

### 13.2 · Selecting each item

| # | Do | Expect |
|---|---|---|
| 9 | Click **Date** | the toolbar's first cell is **DATE STYLE** |
| 10 | Click **Place** | it becomes **PLACE STYLE** |
| 11 | Click **Time** | **TIME STYLE** |
| 12 | Click **Week heading** | a **text field** with `{start} {end}` beside it |
| 13 | Click **Rows** | **SPACING −/+** and "Days run Monday to Sunday". No font, no colour |
| 14 | On each of the above | FONT · SIZE · COLOUR · STYLE · LINE UP, and ✦ Effects / Advanced on the right |
| 15 | Switch **Place** off with its toggle | its outline disappears from the picture, the sample greys and strikes through, **and a line appears under the list**: "The place name is in your picture — HatchGrab won't add it." |
| 16 | Now switch **Time** off too | **refused**, with the sentence about a cancelled event needing one of the two |
| 17 | Switch Place back on | the outline returns **in the same position** |
| 18 | Choose a font with one weight — **Anton**, **Pacifico** or **Bebas Neue** | the **B** button **disappears** (that family has no bold file) |
| 19 | Choose **Oswald** | **B** comes back |
| 20 | Look at the **COLOUR** cell | the current colour is **visible as a filled swatch** — not an empty box. Click it for the system picker |

### 13.3 · Effects

| # | Do | Expect |
|---|---|---|
| 21 | Date selected → **✦ Effects** | "Effects for the date" · *Make the words easier to read on a busy picture.* |
| 22 | Shadow → **Soft**, then **Strong** | the preview changes both times. The ✦ Effects button is now **lit** |
| 23 | **Outline each letter** on, pick a colour | *A thin line around each letter.* and the preview changes |
| 24 | **Band behind the words** on, pick a colour | *A coloured strip behind the text, like a label.* — a strip behind each date |
| 25 | **Band on days off** on, pick a different colour | the days with no trading take **that** colour instead |
| 26 | **Keep it readable automatically** | **already on.** Switch it off and on; on a picture with a light area under the date the soft shadow comes and goes |
| 27 | Click outside the panel, and press **Escape** with it open | it closes both ways |
| 28 | Select **Time** → ✦ Effects | the title reads "Effects for the time" and the controls are **that** item's |

### 13.4 · Advanced

| # | Do | Expect |
|---|---|---|
| 29 | **Advanced ▾** | **closed until you press it.** "Advanced · Date" · *Most posts never need these.* |
| 30 | Read the groups | WORDING · LETTERS · POSITION · LONG NAMES · STAND OUT · WHOLE PICTURE |
| 31 | WORDING → **Day on its own line** | the weekday moves onto its own line |
| 32 | WORDING → **Words before** → type `Find us` | it appears in front of the date, **at the same size** |
| 33 | LETTERS → **Italic** | the date slants. ⚠️ It is a **shear**, not a designed italic — the hint says so |
| 34 | LETTERS → **Letter spacing** / **Line spacing** | both change the picture |
| 35 | POSITION → **Tilt** → drag to **−10°** | the date **and its band** rotate together |
| 36 | …drag to each end | it stops at **−15°** and **+15°** |
| 37 | POSITION → **Centre on the picture** → **Across**, then **Up and down** | the box jumps to the middle on that axis |
| 38 | LONG NAMES → select **Place** → **Use two lines** | the long place name in your busy-week preview wraps onto two lines instead of shrinking |
| 39 | STAND OUT → the five sliders | each changes the picture. **Band see-through** at 70% shows the artwork through the strip |
| 40 | WHOLE PICTURE → **Darken the picture** → 40% | the whole photograph darkens **under** the text |
| 41 | …drag it to the end | it stops at **60%** |
| 42 | **Copy this style to all text** | Place and Time take the Date's font, size, colour, capitals and effects — **and keep their own left/right alignment** |

### 13.5 · Undo and redo

| # | Do | Expect |
|---|---|---|
| 43 | Drag the Date box across the picture in one movement | it moves |
| 44 | **⌘Z** | **one press** puts it back — not fifty |
| 45 | **⇧⌘Z** | it returns |
| 46 | Change the font, the size and the colour; press ⌘Z three times | each one undoes |
| 47 | Click into the **Week heading** text field, type, then press **⌘Z** | it undoes **your typing**, not the last drag |
| 48 | Undo back to the start | the **Undo** button greys out rather than disappearing |

### 13.6 · Snapping

| # | Do | Expect |
|---|---|---|
| 49 | Drag a box slowly towards the **middle** of the picture | it **snaps** when its centre is near, and a **thin orange line** appears |
| 50 | Keep dragging past the middle | the line disappears |
| 51 | Drag a **corner** handle near the middle | **no snap, no line** — resizing is never snapped |

### 13.7 · Dates and times

| # | Do | Expect |
|---|---|---|
| 52 | Date → DATE STYLE → each of the four | `Wednesday 14th October` · `Wed 14th Oct` · `14th October` · `Wed 14/10`. **The option's words are the date itself** |
| 53 | After each | the **grey sample** in the left list changes to match, **and so does the picture** |
| 54 | Place → PLACE STYLE → the three | `The Kings Arms, Lavenham` on two lines, then one, then just the name. ⚠️ On "Name, town" and "Name only" the **times stay level with the names** — no blank line pushing them down |
| 55 | Time → TIME STYLE | `5pm – 9pm` and `17:00 – 21:00`. **There is no "From 5pm" option anywhere** |
| 56 | Preview with → **A busy week** | the worst case: a 60-character place name, a stacked day, a cancelled day and a day off |

### 13.8 · The single event design and a place's

| # | Do | Expect |
|---|---|---|
| 57 | ‹ Designs → **Set up single event design** | the box reads **"Single event post design"**, its description has **standard** in bold, "Used for: every post about a single event." |
| 58 | Upload a picture → the editor opens | the same editor. The list is **Text on your post** · Date · Place · Time — **no EACH ROW, no Week heading, no Rows** |
| 59 | **Preview with ▾** | a list of your next events, as `Sat 11 Oct · ⟨place⟩` |
| 60 | Pick a different event | the picture redraws against **that** event |
| 61 | Date → ✦ Effects | the day-off band reads **"Band when the event is cancelled"** |
| 62 | **🔴 TIME** | the Time box reads a **range** — `5pm – 9pm`. This is break 1.1 |
| 63 | **🔴 DATE** | the ordinal suffix is **raised and smaller** whether you asked for it or not. This is break 1.2 |
| 64 | ‹ Designs → Box 3 **Designs for a place** | the places **without** their own design are at the **top**, with **ORANGE "Design"** buttons; the ones with their own are below, with outlined **"Edit"** |
| 65 | Press an orange **Design** | the place's own page, with **Same positions as Standard / Own positions for ⟨place⟩** at the **top of the left panel** |
| 66 | Leave it on "Same positions as Standard" | the boxes are shown **dashed grey and cannot be dragged**, with a line saying why |
| 67 | Switch to **Own positions** | they become draggable, starting from Standard's arrangement |

### 13.9 · Show private events

⚠️ **This needs a private event in Pizza Kitchen's week.** If there is none, mark 68–72 **not tested**
rather than guessing.

| # | Do | Expect |
|---|---|---|
| 68 | Social posts › **Make a post** → Weekly → the right-hand panel | **Show private events**, **OFF**, directly under **Show cancelled events**, with the line "They show as 'Private event' with the date and times — never the place." |
| 69 | With it off | the private event is **not** on the poster, **not** in the caption, and **not** in the tick list |
| 70 | Switch it **ON** | the poster redraws with a row reading **"Private event"**, its date and its times |
| 71 | **🔴 Look hard at that row** | **no venue name, no town, no place picture.** Nothing but "Private event" |
| 72 | Download the image and read it | the same. The decision is the server's — the private row is not in the page and hidden, it is not sent |

### 13.10 · Saving and reopening

| # | Do | Expect |
|---|---|---|
| 73 | Set an unusual combination: Soft shadow, an outline, a band at 60% see-through with 12px corners, −6° tilt, 160% line spacing, "Find us" before the date, 30% darken, the short date style, Name-only places, **and switch the Week heading off** |  |
| 74 | **Save design** | "Design saved." |
| 75 | ‹ Designs, then open the weekly design again | **every one of those is still set**, and the picture looks the same |
| 76 | **⌘⌥R**, open it again | the same |
| 77 | Add a **Your own text** box, type `Pre-order at hatchgrab.com`, save, reopen | it is there, with your words |
| 78 | Replace the `{note}` placeholder in a second text box and save | both boxes keep their own text |
| 79 | Make a post with the weekly design and look at the picture | the saved settings are on the real poster, not just the preview |
| 80 | **Cancel** out of the editor after a change without saving | the change is **not** kept |

### 13.11 · Narrow

**Develop › Enter Responsive Design Mode → 390 × 844.**

| # | Do | Expect |
|---|---|---|
| 81 | Open the weekly design | the list is a row of **chips** — Week heading · Date · Place · Time · Rows · Your own text — **above** the toolbar |
| 82 | Look at the chips | they **wrap onto more rows**. They do **not** scroll sideways |
| 83 | Tap a chip | the toolbar below changes to that item, and a **Show ⟨item⟩** switch appears under the chips |
| 84 | Look at the toolbar | it **wraps** onto several rows. It does **not** scroll sideways |
| 85 | Try to scroll the page sideways | **it does not** |
| 86 | Find the picture | under the toolbar, fitting the width, with the caption under it |
| 87 | Scroll down | **Background picture** and the rest follow the picture |
| 88 | ✦ Effects, then Advanced | each panel opens **inside** the screen — nothing pushes the page sideways |
| 89 | Drag a box with a finger | it moves. The page does not scroll under the drag |
| 90 | Save | works |

---

## 📋 14 · OPEN ITEMS FOR YOU

| | |
|---|---|
| **Deploy** | **not done — you deploy by hand** |
| ⛔ **The two breaks (§1)** | they change posters a truck has already approved. Say if either should be put back |
| ⚠️ **`countryForTruck()` returns `'GB'` for everyone** | `trucks` has no country column. The US half of the table is built and tested and unreachable. **When you add the column, that one function is the only thing that changes** |
| ⚠️ **Italic is a 12° shear** | no bundled family has an italic file. Part 2's uploaded fonts could bring real ones |
| ⚠️ **The outline is four layered shadows** | satori has no text stroke. Above thickness ~8 the corners round off |
| ⚠️ **"Your own text" is capped at four boxes** | say if that is too few |
| ⚠️ **The filled example was kept** | not in the brief; say if you want it gone |
| ⚠️ **13.9 (private events) needs a private event in the week** | if Pizza Kitchen has none, those five steps are untested |
| From V14.5 | `public.place_pictures` is still unread in the database; Chromium's screenshot timeout is still intermittent on this machine |
