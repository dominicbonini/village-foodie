# SOCIAL POSTS: MATCHING THE AGREED LAYOUT

**6 October 2026 · branch `main`, local. Pushed: no. Deployed: no. SQL run: none.**
No saved design data was changed. No place data was changed.

---

## 🔴 THE BUG, AND WHY NO HARNESS CAUGHT IT

Both grids went side by side at Tailwind's `lg` — **1024px**. A 16in MacBook Pro in Safari with a
normal window is **1000–1100px** wide. So on the machine this product is used on, the three boxes
stacked full width — on the screen size the design was drawn for.

⛔ **The render harness measured 1440 and 820. Both were correct.**

**A breakpoint with no measurement between its two sides is a breakpoint nobody has checked.** 1440
proved side-by-side, 820 proved stacked, and the entire laptop range between them was never rendered.
That is the finding of this build, and it is now impossible to repeat here: the harness measures
**1000, 1100, 1280, 1440 and 1728** above the breakpoint and **820 and 390** below it, both areas, in
both engines.

---

## 1 · SIDE BY SIDE ON LAPTOP AND DESKTOP

Three boxes in one row from **900px** up; stacked below it.

| | |
|---|---|
| **Make a post** | `min-[900px]:grid-cols-3` — three equal columns |
| **Designs** | `min-[900px]:grid-cols-[minmax(200px,320px)_minmax(200px,320px)_minmax(0,1fr)]` — the two design boxes comfortable at ~320px, allowed to shrink to 200px below ~1100 **without leaving the row**, and "Designs for a place" takes the rest |

⚠️ **`min-[900px]:` is an arbitrary variant, not a new theme screen.** Tailwind 4 supports it, and a
one-off breakpoint used by exactly two grids does not belong in the theme where everything else would
inherit it.

**Measured at every width:** the three boxes share one `top` (one row), are in left-to-right order, and
come out the **same height** (`items-stretch`); the long lists scroll **inside** their box (`max-h-72`
kept); the footer stays at the bottom (`mt-auto`); every button is inside its own box; and there is no
horizontal page scroll.

**At narrow column widths the rows wrap rather than overflow.** The text block is
`min-w-[9rem] flex-1` in a `flex-wrap` row, so at a comfortable width the date, the venue and the
button are on one line, and when the column is too narrow the **button drops under the text**. It never
overflows, which is what a `shrink-0` button in a `nowrap` row does.

---

## 2 · THE LOOK

| | |
|---|---|
| **Box headings** | bold, **title case, 17px**, dark — one constant (`BOX_HEADING`) for all six, with the description directly beneath in regular grey. ⛔ It was `SUBCARD_HEADING` — uppercase, letter-spaced, 12px — which is the treatment for a label above a group of controls, and it made three choices read as three form sections |
| **The segmented control** | a light grey track with the selected option a **white segment with a soft shadow** and dark text. It was orange-on-pale-orange in a bordered box — this product's **primary** colour, and a view switch is not an action |
| **Orange** | **only** "Make this week's post" / "Set up weekly design" and "Make post for `<date>`". Every Edit, every per-row Make post and "Give own design" is **outlined** — white, grey border, dark text |
| **Design previews** | a **fixed-height tile with a derived width**, in the design's own shape (the server now sends `width`/`height`). With no picture the **same-sized** tile shows "No design yet" centred |
| **Place tiles** | 28×35 portrait — a thumbnail, or a plain grey tile with **no text in it** |
| **The design tag** | "Own design" (pale orange) / "Standard" (pale grey), to the right of the name and **before** the button |
| **The colour bar** | **4px, full row height**, orange for a place's own design and **dark navy** (`slate-800`) for Standard |
| **Times** | `formatTimeRange` — the product's one formatter |

**Three of those were not style choices, they were defects:**

- **The empty design tile was a thin bar.** `aspect-[4/5] w-full` with no image collapses to whatever
  the content needs, so "Not set up" drew a strip where a tall tile should be — and the two Designs
  boxes were then different heights for a reason that had nothing to do with the designs. ⚠️ It is a
  **fixed height with a derived width**, not `aspect-ratio`: three boxes in a row are three widths, so a
  width-driven ratio would give three different heights, which is the thing this fixes.
- **A Standard place tile said "Standard" in 9px inside a 40px box** — unreadable, and redundant next
  to a tag saying the same word at a size somebody can read.
- **The colour bar was a 32px stub beside a taller row**, in `slate-300`. At 4px wide, grey on white is
  invisible at arm's length — and "which design will this use?" is the only question the bar exists to
  answer. Navy for Standard, orange for own.

⚠️ **"the place's own design colour"** — there is no colour stored per place design. Orange is used for
"own" (matching the Own design tag) and navy for Standard. If you want a real per-place colour that is
a column and a picker, and I did not add one.

⛔ **And `timeLabel` was a second time formatter.** It wrote `17:00–20:00` with no spaces while the rest
of the product writes `17:00 – 20:00` through `formatTimeRange`, whose own note says *"use this
everywhere a start–end pair is shown so no surface re-introduces seconds (the recurring bug)"*. This
surface was the next one to re-introduce it. It is deleted and the shared one is imported.

---

## 3 · "NOT SET UP" — what I found, and what I could not

### ⚠️ What I could not do

**I could not open the setup screens for Pizza Kitchen.** That needs the dev server running and an
operator session with the dashboard token, which this work has neither. So I cannot tell you whether a
saved design actually exists on that row.

**Here is the read-only SQL that answers it.** It writes nothing.

```sql
-- READ-ONLY. What Pizza Kitchen actually has, for both design kinds.
select
  kind,
  blank_path   is not null  as has_picture,
  example_path is not null  as has_example,
  width, height,
  layout       is not null  as has_layout,
  updated_at
from public.truck_post_designs
where truck_id = 'test-truck'
order by kind;
--   NO ROWS  ⇒ nothing was ever set up, and "Not set up" was telling the truth.
--   A ROW with has_picture = true, width/height set and has_layout = true
--            ⇒ it IS set up, and the box was wrong — read the section below.
--   A ROW with any of those false
--            ⇒ a HALF-WRITTEN design: the exact case that made the screens disagree.
```

⛔ **`test-truck` is the id. `test-kitchen` is the slug** — the same confusion that made an earlier
grant SQL match 0 rows.

### 🔴 What I did find, mechanically, and fixed

**Four readers were asking "is this design set up?" four different ways, and the screens applied a
fifth.**

| Reader | Asked |
|---|---|
| `load` → `WeeklyPostApp` | does a ROW exist |
| `event_load` → `EventSetupScreen` | does a ROW exist |
| `event_post` → `EventPostModal` | does a ROW exist |
| `social_overview` → the Designs boxes | does a row with a `blank_path` exist |
| the weekly setup screen | `!layout \|\| !size \|\| !blankUrl` |
| the event setup screen | `!standard` — a row — then read `standard.width` off it |

**They disagree on a half-written row, in both directions:**

- a row with a picture but **no layout** ⇒ Social posts said **"✓ Set up"**; the setup screen its button
  opens said the opposite;
- a row with **no picture at all** ⇒ Social posts said **"Not set up"**; the event editor opened anyway
  and read `standard.width` off a null.

⛔ **"Not set up" over a button that opens a working editor is a screen calling itself a liar**, and an
operator cannot tell which half to believe.

**One predicate now, in `lib/weekly-post/ready.ts`, with five call sites and no reader deciding for
itself:**

```ts
designIsReady(d)  //  d && d.blank_path && d.width && d.height && d.layout != null
```

Each part is something a render would otherwise die on. ⚠️ `layout == null`, **not falsy** — `{}` is not
a sensible layout but it is a **saved** one, and refusing it would hide a real design from its owner.

⚠️ **It is in `lib/` so the harness can CALL it.** `scripts/social-posts.cjs` `require`s it (Node 22
strips the types) and exercises all five half-written states plus the empty-layout case. **A predicate
nothing can call is a predicate nobody checks.**

**So:** if the SQL above shows a complete row, the box was wrong and is now right. If it shows no row,
"Not set up" was true. Either way the two can no longer disagree.

---

## 4 · WHEN A DESIGN ISN'T SET UP

I looked at what the existing flows do. **Neither explains it.**

| | Before | Now |
|---|---|---|
| **Weekly** | `WeeklyPostApp` falls back to its setup screen when `load` returns no design — so the button said **"Make this week's post"** and opened **setup**. It handled it by doing something other than what the button promised | the button reads **"Set up weekly design"** and goes to Designs › weekly setup. Same destination, honest label. Still orange: setting it up IS the thing to do from that box |
| **Event** | `EventPostModal` asks the server, gets `hasDesign: false`, calls `onNeedsSetup()` — the modal flashes and the operator lands on the editor with **no sentence anywhere** | one grey line at the top of **boxes 2 and 3**: *"Set up your event design first. **Set it up**"*, linking to Designs › event setup — and the Make post buttons stay **visible but disabled** |

⚠️ **Disabled, not hidden.** A row that lost its button would have the operator wondering what is
different about that **event**; a disabled one under a line above the list says what is different about
the **truck**. ⛔ A **private** row still has **no button at all** — disabled is for "not yet", absent is
for "never".

---

## 5 · TIDY UP PLACES LABELS

| Column | Label |
|---|---|
| `name` | **Full name** |
| `short_name` | **Name on posts** — hint: *"Leave blank to use the full name."* |

The place design editor's "Name on posts" stays bound to `short_name`. **Labels only**: no column, no
data, no save path changed — `saveField('name', …)` and `saveField('short_name', …)` are untouched.

`scripts/places-tab.cjs` §4 now asserts **which label sits on which input's `onBlur`** — not merely that
both labels exist, which would pass either way round — **and** that the renderer still prefers
`short_name`. If that preference ever changes, these labels become wrong again and that check says so.

---

## 6 · CHECKS

### ⛔ Four more measurement failures, and one of them was passing vacuously

**1 · A pure-absence assertion cannot tell "correct" from "measured nothing".**
"Only the allowed buttons are orange" **passed on its first run — because the matcher found no orange
at all.** Tailwind 4 writes colours as `oklch()`, and the matcher only knew `rgb()`. It was caught only
because I had also asserted the positive — "the weekly button **IS** one of them" — which failed. The
colour is resolved through a canvas now, so any notation the stylesheet uses works.

**2 · A staleness check must name what the measurement depends on.** The harness's "is this build
current?" marker was `1.4fr`, the Designs grid's old column ratio. When the ratio changed, the marker
went on passing against a stylesheet that had **no `min-[900px]` rule at all** — so every box stacked at
1440 and three "side by side" assertions failed on correct source. The marker is the media query now.

**3 · A slice that silently widens.** `weekly-post.cjs` bounded the place-fields card with
`indexOf('Events here')` — a card deleted on 5 October — so `indexOf` returned −1 and `slice(start, -1)`
ran to one character short of EOF. It kept passing. Third sibling of this class in three days; it is
anchored on the card's own closing tag now.

**4 · Compare against the content box, not the border box.** "The design bar is full row height" failed
at all seven widths on correct markup, because the row carries `py-2`.

### The harnesses

| | |
|---|---|
| `places-tab.cjs` | ✅ **95** — the two label bindings added |
| `social-posts.cjs` | ✅ **53** — the readiness predicate **called**, the set-up-first behaviour, and the look |
| `places-posts-gating.cjs` | ✅ **44** |
| `weekly-post.cjs` | ✅ **207** — the field-width check re-aimed and its anchor repaired |
| `schedule-graphics-places.cjs` | ✅ **258** |
| **Full sweep** | `node scripts/run-harnesses.cjs` — **94 run, 94 passed, 0 failed** |

**Your asked-for render assertions:**

| Claim | How it is measured |
|---|---|
| headings not uppercase | computed `text-transform === 'none'`, on all three headings, at every width |
| only the allowed buttons are orange | computed **background colour** of every `<button>` on the screen, resolved through a canvas; `ALLOWED_ORANGE` is a named set of two ids |
| the empty design tile is the same size as a filled one | both are rendered in the **same fixture** and compared to each other — not against a number |
| no text inside Standard place tiles | `textContent.trim() === ''` on a Standard row's tile |
| every button inside its box at every width | each button mapped to its box **by name** (a `startsWith` chain with a catch-all `else` mislabels) |

### Render measurement

**`scripts/social-posts-render.cjs` — 295 assertions per engine, at seven widths, in Chromium AND
WebKit.** The control fixture is kept, so the side-by-side assertions cannot pass on a single column.

```
1000×800  (laptop window)    posts 315/315/315 · designs 320/320/304  — one row, equal height
1100×800  (laptop, wider)    posts 348/348/348 · designs 320/320/404  — one row, equal height
1280×800  desktop            one row  ·  1440×900 one row  ·  1728×1117 one row
 820×1180 (iPad portrait)    stacked  ·  390×844 (phone) stacked
```

⚠️ **Chromium still cannot take a screenshot on this machine** — the measurements run and pass in both
engines; only the PNGs are skipped, with a line saying so. WebKit screenshots of both areas at **1100**
and **1728** are in `docs/screenshots/social-posts-layout/`.

### Everything else

- **`tsc --noEmit`** clean · **`npx next build`** compiled.
- **ESLint, measured both ways:** **warnings level with baseline (340)**, **errors 1,303 → 1,304**. The
  one new error is a third `require()` in `social-posts.cjs` — the one that lets the harness **call**
  `designIsReady` over real shapes instead of pattern-matching its source. I would rather have the real
  exercise than the lint count; say the word and I will swap it back.

---

## 7 · WHAT TO TEST ON LOCALHOST — Pizza Kitchen only, Safari on Mac

Open `http://localhost:3000/manage/<Pizza Kitchen's token>?tab=schedule&section=posts`.
**⌘⌥R** is a hard reload. For narrow widths: **Develop › Enter Responsive Design Mode**.

### The layout

1. **A normal laptop window** (don't maximise). **Make a post** shows **three boxes side by side**:
   Weekly post · Single event post · Post for a place. They are the **same height**.
2. Press **Designs**. Three boxes side by side again — the two design boxes a comfortable width, and
   **Designs for a place** taking the rest.
3. **Drag the window narrower.** They should stay side by side well past the point you would expect —
   down to about **900px** — and only then stack. Drag it wide again; at full screen they stay in one
   row and do not stretch oddly.
4. **No sideways scrollbar** at any width you drag through, on either area.
5. **A long list scrolls inside its box.** Scroll inside "Post for a place" — the box does not grow and
   the other two do not stretch with it.

### The look

6. **Headings** read *Weekly post*, *Single event post*, *Post for a place* — **bold title case**, not
   SHOUTING CAPITALS with wide letter spacing. The description sits directly underneath in grey.
7. **The segmented control** (top right) is a light grey track with the selected option as a **white**
   segment. **No orange text.**
8. **Count the orange buttons on Make a post: there should be exactly one** — "Make this week's post".
   Every "Make post" in the lists is white with a grey border.
9. **On Designs there should be NO orange at all.** "Edit weekly design", "Edit event design", "Edit"
   and "Give own design" are all outlined.
10. **The two design previews are tall tiles of the same size**, whether or not there is a design. One
    with no design shows a grey tile with **"No design yet" centred** — not a thin bar.
11. **In "Designs for a place"**, a place on Standard has a small plain grey tile with **no writing in
    it**, and a **"Standard"** tag to the right before the button. A place with its own design shows its
    picture and a pale orange **"Own design"** tag.
12. **In "Single event post"**, each row has a **4px coloured bar down its left, the full height of the
    row** — dark navy for Standard, orange for a place with its own design. A **private** event is
    greyed, reads "Private event · no post", and has **no button**.
13. **Times** read `17:00 – 20:00`, with spaces around the dash, the same as everywhere else.

### "Not set up", and the set-up-first behaviour

14. On **Designs**, note whether each design says **✓ Set up** or **Not set up**.
15. Press **Edit weekly design**. If the box said "Not set up", you should land on the **upload** card
    ("Set up your weekly post"). If it said "✓ Set up", you should land on the **editor** with your
    picture. ⛔ **If those two disagree, tell me** — that is the bug §3 is about, and the SQL at the top
    of §3 will say which it is.
16. Press **‹ Designs**, then **Edit event design**. Same check.
17. **If the weekly design is not set up**, go to Make a post: box 1's orange button reads **"Set up
    weekly design"** (not "Make this week's post") and takes you to the weekly setup.
18. **If the event design is not set up**, boxes 2 and 3 carry a grey line — *"Set up your event design
    first. Set it up"* — and every **Make post** button in them is **greyed and unpressable**. Press
    "Set it up": it opens the event design setup.
19. Once a design IS set up, those boxes behave normally again — the buttons come back and the line
    disappears.

### Tidy up places

20. Open **Add event › Tidy up places** and pick a place. The first field is **Full name**; the one
    below the address is **Name on posts**, with the hint *"Leave blank to use the full name."*
21. Type a short name into **Name on posts**, click away, then make a post for an event at that place.
    **The poster should print the short name.** That is the point of the swap: that field is what the
    renderer actually uses.

### Phone and tablet

22. **Develop › Enter Responsive Design Mode**, iPhone width. Both areas **stack**, the lists still
    scroll inside their boxes, nothing scrolls the page sideways, and in a narrow box the **Make post**
    button drops under the text rather than overflowing.

---

## Files

| File | |
|---|---|
| `lib/weekly-post/ready.ts` | **new** — the one readiness predicate |
| `app/api/weekly-post/route.ts` | five call sites through it; the weekly design's `width`/`height` added to `social_overview` |
| `components/manage/SocialPosts.tsx` | the 900px grids, `BOX_HEADING`, `BTN_PRIMARY`/`BTN_OUTLINE`, `DesignTile`, `PlaceTile`, `DesignTag`, the segmented control, the wrapping rows, the set-up-first note, `formatTimeRange` |
| `lib/copy/socialPosts.ts` | `EVENT_DESIGN_FIRST`, `EVENT_DESIGN_FIRST_LINK` |
| `components/manage/SchedulePlaces.tsx` | the two Tidy up labels swapped (labels only) |
| `scripts/social-posts.cjs` | the predicate **called**; the set-up-first checks; the look section |
| `scripts/social-posts-render.cjs` | seven widths; the computed-style assertions; the repaired staleness marker; the layout screenshots |
| `scripts/places-tab.cjs`, `weekly-post.cjs`, `schedule-graphics-places.cjs` | the label bindings, and one repaired slice anchor |
| `docs/reference-manual.md` | **V14.4**; **§64.13** and **§64.14** added; §64.12's mislabelling note resolved |

---

## Open items for you

| | |
|---|---|
| **Deploy** | not done |
| ⚠️ **Whether Pizza Kitchen really has no designs** | I could not open the screens. The read-only SQL is in §3 — run it and tell me what it says |
| ⚠️ **The per-place bar colour** | orange means "own design". A genuinely per-place colour would be a column and a picker; I did not add one |
| ⚠️ **ESLint is +1 error** | the `require()` that lets the harness call `designIsReady` for real. Your call |
