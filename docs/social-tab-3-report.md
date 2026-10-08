# Social media, round 3: the settings come out of the pop-ups, Venue and Town become two boxes, one location picture, and a sub-tab that cannot discard your work

**9 October 2026.** Worked on `main`, locally. **Nothing pushed and nothing deployed.** I ran no SQL —
you ran `20261021_weekly_only_picture.sql` yourself and told me so.

---

## 0 · READ THIS FIRST

### The one thing in here that changes an existing design

🔴 **Every single event design that already exists will open with a new **Town** box on it.** That is
§3, and it is not optional — the box is derived when the design is read, not when it is saved.

⚠️ **For the default place style (`nameTownBelow`) the poster is pixel-identical.** The venue keeps its
exact box; the town is placed where the renderer was already drawing it — directly below, at 0.62 of the
venue's size, in the venue's own font, colour and alignment.

⛔ **There is one style where "directly below" and "looks the same" cannot both be true, and I did what
the brief says rather than choosing.** `placeStyle: 'nameTown'` drew the name and the town **on one
line**. §3 says Town goes directly below Venue, and also that old layouts look the same. For that one
style those are incompatible. **I followed the explicit instruction: the town is now on its own line
below.** A `nameTown` design will therefore look different — two lines where there was one. I am
flagging it rather than silently picking, because it is the only visual regression in this round.

- `nameTownBelow` (the default) — unchanged.
- `nameOnly` — unchanged; the Town box arrives **switched off**, as the brief says.
- `nameTown` — **two lines now, where it was one.** Named here, and in `lib/weekly-post/layout.ts`.

### The near-miss that would have broken every design

⛔ **The first version of the Town derivation would have stopped every pre-split design from opening at
all.** `parseBox` does not return an error — it **pushes one into the array it is handed**. Every design
saved before today has no `town` key, so passing the shared `errors` array meant every read came back
with "The town box is missing." and the editor refused to open.

🔴 **A throwaway `townErrors` array is the whole fix**, and the fact that it is one line is exactly why
it needed finding. It was caught by driving an existing harness check, not by reading the code.

### The real defect this round found

⛔ **`place_slot_clear` with an unrecognised slot name answered `200 {ok:true}` and cleared the
location's PICTURE.** `asSlotName` returned `'weekly'` for anything it did not recognise, and `slot`
arrives from a client — so a typo, a stale build or a renamed constant all landed silently on the one
slot every design on both surfaces uses.

🔴 **It was survivable with two slot names and is not with three.** `'weekly-only'` and `'weekly'`
differ by a suffix, so the misspelling most likely to happen is the one that hits the slot with the most
to lose — and an operator whose picture vanished could not tell that from a failed upload.

⚠️ **I found it by running a check against the running route, and I found it the hard way: my own check
posted `slot: 'not-a-slot'` and cleared the Music Festival picture on Pizza Kitchen.** I put it back
through `place_slot_use` within the minute, the file was never touched, and the last check in
`scripts/social-tab-3-local.cjs` is now the standing proof that it is still there. It returns `null`
now and all three call sites refuse with "That is not a picture slot."

### The SQL

✅ **`supabase/migrations/20261021_weekly_only_picture.sql` — you have run it.** The fenced block is in
the chat reply. It is idempotent, it adds one nullable column, one guarded foreign key and one partial
index, and it drops, deletes and empties nothing.

---

## 1 · Section by section

| § | What it asked for | Done |
|---|---|---|
| **1a** | A sub-tab pill inside an editor goes to that tab, with an **in-page** confirm when there are unsaved changes | ✅ |
| **1b** | Remove the standalone "‹ Designs" row above the editor title | ✅ (done in round 2 and still true — see §2 below) |
| **2** | Three columns; left list "ON YOUR POST"; centre preview; right 320px sticky panel with TEXT / MAKE IT STAND OUT / MORE OPTIONS; nothing lost; panel drops under the preview below 1100 | ✅ |
| **3** | Venue and Town as separate items with full text settings, in the list, the preview and the renderer; old layouts open and look the same | ✅, with the `nameTown` exception named above |
| **3 (weekly)** | "If the place text lives inside each day row, leave the weekly rows alone and tell me" | ✅ **It does. The weekly rows are untouched.** See §5 |
| **4a** | Remove "Name on posts"; add the grey note naming the real path | ✅ |
| **4b** | The event poster description, exactly; remove the size text | ✅ |
| **4c** | One location picture; new title and blurb; thumbnail left, buttons stacked right; "Use it on" gone; the opt-in weekly link and its box; poster and picture side by side | ✅ |
| **4d** | LOCATION / POSTER / PICTURE columns, with "+1" on the picture thumbnail | ✅ |
| **4e** | The social tag field stays | ✅ |
| **5** | `weekly_only_picture_id`; `picture_use` no longer read or written; the migration file | ✅ |

---

## 2 · §1 · The nav

### The pills could throw away ten minutes of work

⛔ **The sub-tab pills live in the page's own bar, three components above the pane that holds the
editor.** They knew nothing about an unsaved design, so pressing "Designs" while standing in an open
editor switched tab and discarded everything.

🔴 **The guard goes UP, not down.** The pane builds a `requestArea` callback and hands it to the page
through an effect; the page's pills call it instead of `setSocialSection`. The editor reports whether it
is dirty through `onDirtyChange`.

```
DesignEditor ──onDirtyChange──▶ SocialPosts ──onRequestArea──▶ page (the pills)
                                     │
                                     └── requestArea: dirty? ask : goArea
```

⛔ **An in-page confirm, never `window.confirm`.** A browser dialog cannot be styled, cannot speak in the
page's own voice, and on Safari steals focus in a way that has already cost this product a share sheet
(see `components/manage/PostShareBar.tsx`). The dialog is "You have unsaved changes. Leave without
saving?" with **Keep editing** and **Leave**; the backdrop is Keep editing.

⚠️ **A clean editor navigates straight through.** That is what makes the question mean something when it
is asked. If every pill press asked, the answer would stop being read.

### One door out, and it was not one before

🔴 **`onArea` is now called in exactly one place — inside `goArea`.** Anything else would be an
unguarded route out of an open editor, and there was one: **"+ Add location pictures"** in the weekly
design editor's picture settings called `onArea('designs')` directly.

⚠️ **It also pointed at the wrong tab.** It went to Designs because Designs used to hold a per-location
picture list ("Designs for a place"); that list went on 7 October and a location's picture is set in
**Location settings** now. So the button sent you to a tab where there was nothing to do about the
sentence it sat under. It goes to Location settings, through the guard.

### The standalone back row

⚠️ **This was already done in round 2 and I have left it alone.** The editor's title row starts with the
inline "‹ Designs"; the standalone row above it is gone, and `BackLink` survives as an export with no
caller and a tombstone saying why. `scripts/places-tab.cjs` asserts the absence.

---

## 3 · §2 · The settings come out of the pop-ups

### What was wrong with the toolbar, in three structural points

1. ⛔ **A pop-up covers the thing it changes.** Every setting inside "✦ Effects ▾" and "Advanced ▾" is
   about how the words look **on the poster** — so opening either put a panel between the operator and
   the only evidence of whether the change was an improvement.
2. ⛔ **A toolbar that wraps is a toolbar whose controls move.** Nine cells across a `minmax(0,1fr)`
   column wrapped to two or three rows depending on which item was selected and how wide the window was,
   so the Size stepper was in a different place for the Date than for a note. The alternative —
   scrolling sideways — hides half the controls at the width with the least room to find them, and an
   overflow container directly above a drag surface pans the page instead of moving a box.
3. ⚠️ **"Advanced" hid settings by name rather than by use.** Spacing and tilt are not advanced; they
   were simply the ones that did not fit on the row.

### The shape

| Column | Width | What |
|---|---|---|
| Left | 250px | **ON YOUR POST** — one row per item: switch, name, live grey sample. Then Location picture, then "+ Add your own text", then a divider and **Background picture** |
| Centre | the rest | the poster, as large as fits |
| Right | 320px, **sticky** | the item name in bold, "Settings for the box you've picked", then the three sections |

🔴 **Background picture is a row in that list now, not a card under it.** As a card it was the one thing
on the screen you could change without selecting it — and the one item whose settings were not in the
settings panel. It is an item like every other; selecting it opens its card on the right.

### Nothing is lost, and that is asserted rather than asked

⛔ **`EffectsPanel` and `AdvancedPanel` are the SAME components the pop-ups held, mounted inline.**
Re-authoring them would have been the one chance to drop a setting by accident, so the harness asserts
their **contents** — every group heading (`Wording`, `Letters`, `Position`, `Long names`, `Stand out`,
`Whole picture`), every explanatory sentence, "Copy this style to all text" — rather than their presence.

⚠️ **The two items with no text keep their own panels.** A picture has no font and a row spacing has no
box, so `PicturePanel` and `RowsPanel` are their own bodies — which is what the toolbar's two early
returns were. Every control they had is in them.

### The three sections

| Section | Default | Why |
|---|---|---|
| **TEXT** | always open, **no fold at all** | a chevron on these would be an invitation to hide the thing the panel is for |
| **MAKE IT STAND OUT** | open, foldable | a busy photo is the common case and these three are what make words readable on one |
| **MORE OPTIONS** | folded, with a summary | "Spacing, tilt, italic, words before, darken the picture, copy this style, centre the box" |

🔴 **The summary line is what makes a folded section honest.** "More options" alone is a closed door
with no sign on it — and it is the one thing that would make "nothing is lost" a lie on the screen.

⚠️ **The item's own setting leads the TEXT section** — Date style, Place style, Time style, Heading
text, Your text. It is about **what** the item says rather than how it looks, which is the question an
operator asks first.

### Two breakpoints, and the band between them is measured

| Width | Shape |
|---|---|
| ≥ 1100 | three columns; panel sticky on the right |
| 900–1099 | two columns; **panel under the preview** |
| < 900 | one column; the list becomes wrapping chips above the poster; panel under the preview |

⛔ **1000px is now a measured width, and that is not a detail.** This project has already shipped `lg:`
(1024) as a breakpoint on a 1100px machine. A sweep of 1100 and 390 would measure only the two cases
nobody gets wrong.

⛔ **A sticky element taller than the viewport cannot stick**, so the column is
`max-h-[calc(100vh-2rem)] overflow-y-auto`. With MORE OPTIONS open the panel is ~1900px of controls in a
768px box: **the panel scrolls, not the page.** A scrolling page would take the poster off the screen —
the pop-ups' failure in a slower form.

⚠️ **The panel is built once and rendered in one of two places.** Two copies of the JSX would be two
panels to keep in step, and the one nobody is looking at is the one that would drift. The measurement is
one number: **exactly one settings panel is visible at every width.**

---

## 4 · §3 · Venue and Town

### What the renderer did before

It drew **one** box and put the town inside it, on a second line, at `TOWN_SCALE = 0.62`, decided by a
`placeStyle` dropdown with three values. So the town had no font of its own, no colour of its own, no
position of its own and no switch.

### What it does now

`EventLayout` has `town` beside `location`, each a full `TextBox`. `renderEventPost` draws them
separately and passes `'nameOnly'` to both, so neither can draw the other's text. `placeStyle` survives
on the event layout as a **legacy field, read exactly once** — by the migration below.

### The migration is in the validator, not in SQL

🔴 **It runs on every read, which is the only place it can run**: the layouts live in a `jsonb` column
and there is no safe way to rewrite thousands of them in place.

```
town = {
  …venue's box,                                     ← font, colour, align, effects, x, w
  enabled:  oldPlaceStyle !== 'nameOnly',
  fontSize: round(venue.fontSize × 0.62),           ← the scale the renderer already used
  h:        max(12, round(venue.h × 0.62)),
  y:        clamp(venue.y + venue.h),               ← directly below
}
```

⛔ **And the error array is a throwaway one.** See §0 — this is the near-miss.

### The weekly design, which the brief asked about

⚠️ **The place text on the weekly poster lives INSIDE EACH DAY ROW, not in a box of its own.**
`render.ts` builds `locationLinesFor(entries, …, l.placeStyle)` per entry inside the per-day loop, with
`off(l.location)` as the row's box. Seven days means seven of them.

🔴 **So there is nothing there to split into two boxes, and I have left the weekly rows exactly as they
are** — which is what the brief says to do. The weekly design keeps its **Place** item and its **Place
style** dropdown; only the single event design has Venue and Town.

---

## 5 · §4 · Location settings

### "Name on posts" left this screen

⛔ **It wrote `short_name`, and "Tidy up places" edits the name AND THE TOWN, side by side.** Those two
are one fact about the schedule. A second screen editing only the name is how they come to disagree —
the operator shortens the name here, the town stays as it was there, and the poster prints a mismatch
that **neither** screen can show them.

⚠️ **What replaced it is a sentence, not a silence.** Removing a field and saying nothing leaves an
operator hunting, so the grey note names the real path: *"Name and town come from your schedule. Edit
them in Schedule › Events › Add event › Tidy up places."*

⚠️ **Nothing about the data changed.** No column was added when the field arrived and none was dropped
when it left. `locationName()` still reads `short_name` first, and `scripts/places-tab.cjs` still
asserts that — if that preference ever changes, the Tidy up labels become wrong again and that check is
what says so.

### The poster box

> A full poster for events here. It replaces your standard single event design.

⚠️ **The size sentence is gone.** The shape rule still applies and a wrong-shape upload is still refused
in its own words — but a size to read before a job most trucks never do was a cost on everybody. **The
tile says the shape instead**: it is drawn in the standard design's aspect ratio, so you can see what is
being asked for without a number.

### One location picture, used everywhere

> **Location picture** — A logo or photo. Used wherever your designs have a picture space.

⛔ **"Use it on" is gone with the choice it offered.** Three radio buttons asked the truck to decide
something the design already decides: a picture is drawn wherever a design has a picture space, so "you
picked a surface that cannot draw it" is not a state this screen can produce any more.

⚠️ **The amber line went with them.** "Your single event design has no photo space yet →" was a
consequence of that choice. The third line — the poster winning on event posts — is still **true** and
is still how `planEventImages` behaves; it is simply not worth a line on a screen that no longer asks
the truck to choose, because nothing they did caused it.

### The opt-in override

A quiet link under the picture: **"+ Use a different picture on weekly posts"**, which opens a third
box titled **"Picture for weekly posts"** — *"Used on weekly posts instead of your location picture."*

⛔ **The link and the box are mutually exclusive.** Once the override exists, its own box is how it is
changed; a link beside it saying "use a different one" would be a second door into one room.

⛔ **Removing it goes back to one picture.** The column is nulled and the box folds away, with nothing
else to undo. That is why the resolution is a **coalesce** and not a mode column — a mode would leave a
third state meaning "I chose to have an override and then emptied it", which no screen can produce.

### Side by side

⛔ **The two boxes were stacked, and stacked they pushed the tag field below the fold on a laptop** — so
the field most locations need was the one thing you had to scroll for. They are one row from 640px,
`items-start` so a box with an override under it does not stretch the one beside it, and stacked below
640 where two columns of a thumbnail plus two buttons is narrower than either needs.

⚠️ **Replace and Remove are stacked inside each box.** At half a pane a wrapping row wrapped at every
realistic size — and a box whose height depends on whether its buttons wrapped cannot be relied on to
sit level with the one beside it.

### The "+1" badge

⚠️ **It is measured, not just drawn.** It hangs `-right-0.5 -top-0.5` outside its 24px tile, which is
exactly the overhang that silently widens a `table-fixed` column and unaligns every row's thumbnails
from the header above them. **The claim is an equality across rows**: every PICTURE cell is the same
width, badge or no badge, in both engines at both widths.

---

## 6 · §5 · The data

| Column | Meaning | Read by |
|---|---|---|
| `event_picture_id` | **EVENT POSTER** — replaces the standard design as the whole background | single event posts |
| `weekly_picture_id` | **LOCATION PICTURE** — used wherever a design has a picture space | weekly **and** single event |
| `weekly_only_picture_id` | **OPTIONAL OVERRIDE** — weekly posts use this instead | weekly only |
| `picture_use` | ⛔ **dead.** Left in place, left populated, read by nothing | — |

```ts
weeklyPictureFor = (i) => i ? (i.weeklyOnly ?? i.picture) : null
eventPictureFor  = (i) => i ? i.picture : null
```

⚠️ **`placePictureSources` takes a SURFACE, not a slot** — `'weekly'` or `'event'` — and picks the
function. That is the shape round 2 arrived at after the bug where filtering on a slot silently dropped
every event-only picture out of the photo space it had been told to draw.

⛔ **The columns were not renamed, and `weekly_picture_id` is now two models behind its meaning.** A
rename is a drop-and-add as far as PostgREST's cached schema, every select string and every harness
assertion is concerned, and the rules forbid dropping a column. The column comments and
`lib/weekly-post/place-pictures.ts` are the record.

⚠️ **Single event ordering is unchanged**: this post's own image > the location's event poster > the
standard design, with the location picture in the design's photo space. The only change is that
`picture_use` is no longer a fourth condition on that last clause.

---

## 7 · Checks

| | |
|---|---|
| `npx tsc --noEmit` | ✅ clean |
| `npx next build` | ✅ compiled successfully |
| Lint on the files I touched | ✅ no new errors or warnings (`app/manage/[token]/page.tsx` has a 286-error pre-existing baseline; I checked it against `HEAD` and it is **286 before and after**) |
| `node scripts/run-harnesses.cjs` | ✅ 98 harnesses, all green |
| `node scripts/social-posts-render.cjs` | ✅ WebKit, three widths, the editor and the font picker |
| `node scripts/social-tab-render.cjs` | ✅ Chromium **and** WebKit, two widths, six fixtures |
| `node scripts/social-tab-3-local.cjs` | ✅ against the running route and the real database, **Pizza Kitchen only** |

### The harnesses I re-aimed

| File | What changed |
|---|---|
| `design-editor.cjs` | 9 checks rewritten for the three-column, no-pop-up shape. The old ones asserted `<Toolbar`, `✦ Effects ▾`, `Advanced ▾` and a two-column grid |
| `social-posts.cjs` | the editor mount's new prop, the `thumb(…, plus)` signature, the guarded `requestArea`, the gate call-site count, and "Name on posts" **inverted into an absence check** |
| `places-tab.cjs` | the same mount, and the `short_name` writer claim inverted: this card is the one editor again |
| `place-pictures.cjs` | the add-pictures target, and a **new** check for the slot-name refusal |
| `social-tab-render.cjs` | the Location settings fixture rebuilt: the grey note, the side-by-side pair, the stacked buttons, the override's third box, the "+1" badge — plus a new control that strips the pair's two-column rule |
| `social-posts-render.cjs` | the editor fixture rebuilt for three columns; a third width (1000); a MORE OPTIONS-open pass; two controls, one per breakpoint |

### Three things the measurements refused

⚠️ **I am recording these because each one was my assumption, and the browser said no.**

1. **"The poster box is not stretched" as `PB.bottom < WO.top`.** Refused: the picture box is *shorter*
   than the poster box (no file name, one button), so the override can begin above where the poster ends
   without anything being stretched. The honest claim is against the **column's** bottom.
2. **The 900px control run at 1100.** It reported three columns and failed — because at 1100 the 1100
   rule answers for the 900 one. It runs at **1000**, the one width where the 900 rule decides alone.
3. **A slice anchor that could not fail.** `code.indexOf('const thumb = (image: SlotImage | null)')`
   stopped matching when the parameter list grew, returned `-1`, and the slice silently ran to the end
   of the file — where `shrink-0` happens to appear. A `length > 0` test passed on it. **A slice that
   cannot fail to match is a check that cannot fail.**

---

## 8 · Your localhost test list — Pizza Kitchen only

Everything below is already asserted by a harness or a measurement; this is the list for your own eyes.

**The nav**
1. Social media › Designs › **Edit weekly design**. Move a box. Press the **Create a post** pill.
   → the in-page dialog, "Keep editing" / "Leave". Backdrop click = Keep editing.
2. Same, but press the pill **without** moving anything. → straight through, no question.
3. In the weekly design editor, select **Location picture** and press **"+ Add location pictures"**.
   → Location settings (not Designs), and it asks first if you had moved a box.

**The editor**
4. At a wide window: three columns, panel on the right, and it **stays level with the poster** as you
   scroll.
5. Open **MORE OPTIONS**. → the panel scrolls inside itself; the poster does not move or shrink.
6. Narrow the window to about 1000px. → the panel drops under the preview; the list stays.
7. Select **Background picture** in the left list. → its card opens on the right, like every other item.
8. Check a setting you remember from the old pop-ups is still there — "Copy this style to all text" is
   the bottom of MORE OPTIONS.

**Venue and Town**
9. Designs › **Edit single event design**. → **Venue** and **Town** are two rows in the list, two boxes
   on the poster, each with its own font, size, colour and alignment.
10. Switch **Town** off. → its box disappears from the poster.
11. Create a post › a single event → **Make post**. → the poster draws both.

**Location settings**
12. Pick a location. → no "Name on posts"; the grey note names the path instead.
13. The poster box and the picture box are **side by side**; the tag field is visible without scrolling.
14. Press **"+ Use a different picture on weekly posts"**. → a third box appears. Upload something.
15. The table's **PICTURE** column now shows **+1** on that row, and the row is the same height as
    every other.
16. **Remove** the weekly-only picture. → the box folds away and the +1 goes.

---

## 9 · What is left open

| | |
|---|---|
| ⚠️ **`placeStyle: 'nameTown'` designs look different** | two lines where there was one. The brief's two instructions are incompatible for that one style and I followed the explicit one. **Your call** if you want it the other way |
| ⚠️ **`picture_use` still holds values** | nothing reads them. The column and its `check` are left in place because dropping a column is irreversible |
| ⚠️ **The weekly design still has "Place style"** | because the weekly poster draws place text inside each day row. §3 asked me to say so rather than redesign it |
| ⚠️ **"Tidy up places" still labels `name` "Name on posts"** | the renderer uses it **second**. Named in `docs/social-posts-report.md`; left alone because the brief says to leave Tidy up as it is |
| ⚠️ **`scripts/social-tab-3-local.cjs` cannot be swept** | it needs `next dev` and the database. Registered in `harnesses.json` beside `add-order-stale-browser.cjs` with the same reason |
| ⛔ **Nothing is deployed** | you deploy by hand |
