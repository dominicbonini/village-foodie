# SOCIAL POSTS: EMPTY STATES, THE DESIGNS LAYOUT, AND CLEARER WORDING

**6 October 2026 · branch `main`, local. Pushed: no. Deployed: no. SQL run: none.**
No saved design data, no place data. Everything stays behind `places_posts_preview`.

Two things you told me mid-build are in here as well: the **event post design stretching out of its
box**, and **removing the event type from "Designs for a place"**.

---

## ⛔ ONE THING I STOPPED AND ASKED ABOUT

**"Remove the event type from 'Designs for a place'"** — there is no event type rendered in that box.
The only thing that reads like one is the grey **"Standard"** tag on each row, which §3 of your brief
specifies. That is a contradiction between your brief and your message, so I asked rather than chose.

**You chose: drop the "Standard" tag only.** Done — rows with their own design keep the pale orange
"Own design" tag; rows on the event design carry nothing.

🔴 **And it was the right call for a second reason.** *Standard* is the name of an **event type** in
this product — the first pill on the Event types grid and on every Add event form — so a grey
"Standard" on a place row genuinely did look like that type attached to the place. It also carried no
information: every untagged place is on the event design, so a tag on all of them says only "this row
is a row". The default is still visible twice over — a blank tile, and a button reading "Design".

---

## 1 · ONE EMPTY STATE, THE SAME IN EVERY BOX

⛔ **There were three answers to one situation, and that was the fault.** With no design the weekly box
relabelled its orange button to "Set up weekly design", boxes 2 and 3 showed a grey line and left their
Make post buttons **greyed**, and the lists underneath went on listing events nobody could post.

⛔ **A disabled control is a promise that it will work under some condition the screen does not name.**
Six greyed buttons under a one-line note is six invitations to press something and find out nothing.

**One panel now, identical in all three**, replacing the box BODY and nothing else:

```
┌──────────────────────────────────────┐
│ Weekly post                          │   ← heading and description stay
│ One picture showing everywhere…      │
│ ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐ │
│                                      │
│    You haven't designed a            │
│        weekly post yet               │
│   Upload your picture in Designs     │
│    first. It only takes a minute.    │
│          [ Go to Designs ]           │
│ └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘ │
└──────────────────────────────────────┘
```

| | |
|---|---|
| **When** | the weekly box when the weekly design is not ready; boxes 2 and 3 when the Standard event design is not ready. **`designIsReady()` is the only test**, as you said |
| ⚠️ **The heading and description stay** | which is what makes it read as "not yet" rather than "not available" |
| ⛔ **No orange in an empty box** | orange means "make something", and that is the one thing an empty box cannot do. The button out is outlined |
| ⛔ **No disabled buttons, and no list left behind** | the lists are not drawn at all |
| ⚠️ **It fills the box** | so three empty boxes are still three equal boxes side by side |
| 🔴 **"Go to Designs" switches the AREA and nothing more** | not a particular editor — you may need the weekly one or the event one, and Designs is where both are. It goes through `onSectionChange`, so the URL becomes `?section=designs` and a reload stays put |

When a design is ready, that box shows its normal content exactly as before, and the weekly box keeps
its orange **"Make this week's post"**.

---

## 2 · THE TWO DESIGN BOXES

Top to bottom: heading · description · **centred picture with its badge beneath** · **"Used for:"**
panel · a full-width **orange** button pinned to the bottom.

| | |
|---|---|
| **The picture** | 176×220 for a 4:5 design — a fixed height with the width from the design's own shape. An empty tile is the **same size**, with "No design yet" centred |
| ⚠️ **Centred by a shared wrapper** | the tile and the badge are in one `items-center` flex column. `mx-auto` on the tile alone would pass a class check and still leave the badge against the left edge |
| **"Used for:"** | *the weekly post only.* / *every event post, at every place — unless that place has its own design.* ⛔ This is the question the two boxes could not answer: they are two pictures with near-identical descriptions, and what tells them apart is not what is ON them but which posts USE them |
| **The button** | **orange**, full width, pinned to the bottom. "Edit weekly design" / "Set up weekly design" and "Edit event design" / "Set up event design", from `designIsReady`. Both open the same screens as before |
| **Equal height** | measured, in both states, at every width where they are in a row |

### ⛔ The landscape design that burst out of its box

**You reported this mid-build**, and it is the real find of the day.

A tile at a fixed 220px height takes its width from the design's own shape. A **1920×1080** design is
therefore **391px wide** — and the column it sits in is between **200 and 320px**. It overflowed the
card.

🔴 **The height is now the target, not the rule.** 220px tall unless that would make it wider than
**176px**, in which case the width caps and the height follows the ratio down. A 4:5 design is still
exactly 176×220; a 16:9 one is 176×99, which is what a landscape design actually looks like.
`maxWidth: '100%'` is the belt to that braces.

⛔ **And no measurement could have caught it.** Every fixture this harness has ever drawn used a
portrait design, so a tile wider than its box was a shape the tests could not produce. **A fixture that
only ever renders the shape you expect is a fixture that can only confirm you.** A 1920×1080 tile is
rendered at every width now, in both design boxes, against the box's own edges — and checked for
centring too, because a capped width that was not re-centred would sit left.

```
1000 landscape design  tile 176×99 in a 320px box      (and the same at 1100/1280/1440/1728/820/390)
```

---

## 3 · "DESIGNS FOR A PLACE" ROWS

**One line, at every width from 390 up:** tile · name (truncating) with the town beneath · the
"Own design" tag where there is one · the button on the **right**.

⛔ **`flex-wrap` is gone from the row.** In a list — where every row is the same shape — one row
silently becoming two lines is what makes the list hard to scan.

🔴 **The name is the only thing that gives way.** `min-w-0` + `truncate` on the text block, `shrink-0`
on the tile, the tag and the button. ⚠️ **`min-w-0` is required**: a flex child's default
`min-width: auto` refuses to shrink below its content, which is exactly how a "truncating" name pushes
a button out of its box instead.

**Buttons:** **"Design"** for a place on the event design, **"Edit"** for one with its own. Both
outlined, both opening the same place editor. ⚠️ "Give own design" was three words for the commonest
state in the list, and that is what pushed the row onto two lines in a 200px column.

**Footer:** `<N> with its own design · <M> using your event post design` — "its" for one, "their"
otherwise, and the second half names the design the way Box 2 names it rather than saying "Standard".

---

## 4 · WORDING

Every string below is in `lib/copy/socialPosts.ts`, and the component writes none of its own — asserted
both ways.

| Where | Words |
|---|---|
| **Page intro** | **Designs** is where you upload your background pictures, once. **Make a post** puts your dates, places and times on them for you. |
| Make a post › Weekly post | One picture showing everywhere you'll be this week. |
| Make a post › Single event post | One picture for one event: its date, place and times. |
| Make a post › Post for a place | Pick a place and post the next event you have there. |
| Designs › Weekly post design | Your background picture for the weekly schedule post. Each week we write your days, places and times on top of it. · **Used for:** the weekly post only. |
| Designs › Event post design | Your background picture for a single event post. We write that event's date, place and times on top of it. · **Used for:** every event post, at every place — unless that place has its own design. |
| Designs › Designs for a place | Want a different picture at one venue — a pub's logo, a festival's poster? Give that place its own design. Event posts there use it **instead of** your event post design. |

⚠️ **The two sentences with bold in them are exported as parts, plus a flattened whole.** A string with
`**` in it would need either a parser or a second copy in the JSX. The bold words in the intro are the
segmented control's own labels, so they read as the control rather than as emphasis; **"instead of"**
is bold because the whole sentence turns on it — read as "as well as", an operator gives a venue its
logo and wonders why the date stopped appearing where it used to.

⚠️ Curly apostrophes throughout, asserted (no escaped straight ones in any exported string).

---

## 5 · CHECKS

### ⛔ Four measurement failures, and the first one is the lesson

**1 · Every fixture had drawn a portrait design.** See §2 — the overflow was found by you looking at
the real screen, because no fixture could produce the shape that fails.

**2 · The fixture blamed the wrong design.** It used one empty-state title for all three boxes, so the
weekly box read *"You haven't designed an **event** post yet"*. **The component was always right; the
screenshot is what showed it.** Both titles are lifted from the copy module now, and the harness
asserts box 1's differs from boxes 2 and 3.

**3 · An equal-height claim is a claim about a ROW.** Asserted at 390 too — where the boxes stack and
each is as tall as its own content — it failed on correct markup.

**4 · `divide-y` puts a border on every row but the last**, so "every row the same height" failed by
1px at six widths. Within 1px now; a wrapped row is twice the height, nowhere near the tolerance.

**And one more, in the source harness:** an absence test over a whole file catches the correct new use
too — "Set up weekly design is gone" failed the moment the **Designs** box legitimately used that exact
label. It is scoped to the Make a post markup now.

### The harnesses

| | |
|---|---|
| `social-posts.cjs` | ✅ **87** — the old set-up-first assertions removed; the empty state, the wording, the tiles, the rows and the tag added |
| `places-tab.cjs` · `places-posts-gating.cjs` | ✅ **95** · ✅ **44** |
| `weekly-post.cjs` · `schedule-graphics-places.cjs` | ✅ **207** · ✅ **258** |
| `private-events.cjs` · `event-types.cjs` | ✅ **206** · ✅ **185** |
| **Full sweep** | **94 run · 94 passed · 0 failed** |

**Your asked-for assertions, and how each is measured:**

| Claim | How |
|---|---|
| each empty box shows the panel with "Go to Designs" | three panels found by id, each inside its own box, each filling it, each with its own button — and **no list left behind** |
| no orange and no disabled Make post in an empty box | computed **background** of every button: zero orange when empty; and `disabled={!data.standard.ready}` is gone from the source entirely |
| on Designs only the two design buttons are orange | `orangeButtons.join() === 'box1btn,box2btn'`, in both states |
| on Make a post only "Make this week's post", only when ready | `=== 'box1btn'` when ready, `length === 0` when not |
| the tile's centre within 2px of the box's | both boxes, both states, **and** for a landscape design |
| the two design boxes equal height | at every width where they are in a row |
| every place row one line at 1000/1100/1280/1440/1728/390 | the **button's top is above the row's midpoint** — which is what "did not wrap" actually means — plus the button inside the row and inside the box |
| the "Design"/"Edit" labels and the footer singular/plural | source assertions in `social-posts.cjs` §4d |

### Render measurement

**752 assertions per engine**, at **1000, 1100, 1280, 1440, 1728, 820 and 390**, in **both** states
("nothing set up" and "both set up, one place with its own design"), plus a **landscape design**
fixture and the **control** fixture — in **Chromium AND WebKit**.

✅ **Chromium took its screenshots this time** — zero skipped, where the last two builds skipped every
one. The fault is intermittent on this machine, not fixed.

WebKit screenshots of both areas in both states at 1100 are in `docs/screenshots/social-posts-polish/`.

### Everything else

- **`tsc --noEmit`** clean · **`npx next build`** compiled.
- **ESLint identical to baseline, measured both ways: 1,304 errors and 340 warnings each.**

---

## 6 · WHAT TO TEST ON LOCALHOST — Pizza Kitchen only, Safari on Mac

Open `http://localhost:3000/manage/<Pizza Kitchen's token>?tab=schedule&section=posts`. **⌘⌥R** hard
reloads. Pizza Kitchen has **no designs**, so you start in the empty state.

### With nothing set up

1. **Make a post** shows **three boxes side by side**, each with its heading and description, and each
   with the **same** dashed panel below. The weekly one says *"You haven't designed a **weekly** post
   yet"*; the other two say *"…an **event** post yet"*.
2. **No orange anywhere** on that screen, and **no greyed-out "Make post" buttons** — there is no event
   list at all.
3. Press **Go to Designs** in any of the three. The segmented control moves to **Designs** and the URL
   becomes `…&section=designs`. **⌘⌥R** — it reloads on Designs.
4. On **Designs**: both picture tiles are **grey, tall and the same size**, with **"No design yet"**
   centred and **"Not set up"** beneath. Each has a **"Used for:"** line, and a **full-width orange**
   button at the bottom reading **"Set up weekly design"** / **"Set up event design"**.
5. **"Designs for a place"**: every row is **one line** — tile, name, town beneath, **"Design"** on the
   right. **No "Standard" tag anywhere.** The footer reads "0 with their own design · N using your
   event post design".
6. Read the intro under "Social posts": **Designs** … once. **Make a post** … for you. Both area names
   bold.

### Set the weekly design up

7. Press **Set up weekly design** and upload a picture; save the design.
8. Go back to **Make a post**. The **weekly box is normal** — "Which week", the event count, and an
   **orange "Make this week's post"**. **The other two boxes are still the empty panel.**
9. On **Designs**, the weekly box now shows your picture, **"✓ Set up"**, and **"Edit weekly design"**.
10. ⚠️ **If your picture is landscape** (wider than tall), check it sits **inside** its box with white
    space either side — it must not touch or cross the card's edge. That was the bug you reported.

### Set the event design up

11. **Set up event design**, upload, save.
12. **Make a post**: all three boxes are normal. The event list is back, a private event is still greyed
    with no button, and every "Make post" works.
13. **Designs**: both boxes show a picture and **"✓ Set up"**, both buttons read **"Edit …"**, and the
    two boxes are the **same height**.
14. Give one place its own design (**Design** → upload). Back on Designs that place moves to the top,
    shows its thumbnail and a pale orange **"Own design"** tag, and its button reads **"Edit"**. The
    footer counts it: "1 with its own design · N using your event post design".

### Narrow

15. Drag the window narrower. The boxes stay side by side to about 900px, then stack. **A place row
    never becomes two lines** — the name truncates with "…" and the button stays on the right.

---

## Files

| File | |
|---|---|
| `components/manage/SocialPosts.tsx` | `EmptyBox`, `UsedFor`, the capped `DesignTile`, the tag-only-when-own `DesignTag`, the centred design boxes, the one-line place rows, the bold intro |
| `lib/copy/socialPosts.ts` | every string in §4; the empty-state strings; the "Used for" lines; the two split sentences |
| `scripts/social-posts.cjs` | §3c rewritten for the empty state; §4c the wording; §4d the tiles and rows; the tag and tile checks re-aimed |
| `scripts/social-posts-render.cjs` | both states at seven widths; the landscape fixture; centring, equal height and one-line row measurements; the polish screenshots |
| `docs/reference-manual.md` | **V14.5**; §64.14 amended |

---

## Open items for you

| | |
|---|---|
| **Deploy** | not done |
| ⚠️ **Chromium's screenshot timeout** | it worked this run and failed the last two. Intermittent on this machine; the measurements are unaffected either way |
| From V14.4 | `public.place_pictures` is in the database, read by nothing |
