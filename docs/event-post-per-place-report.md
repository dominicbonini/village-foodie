# A design per place · single-event posts · and the places modal tidied

**Branch:** `schedule-graphics` (confirmed with `git branch --show-current` before every commit).
**Date:** 4 October 2026.
**No SQL was run.** One migration is written and is listed below for you to run by hand.
**Village Spice only.** Pizzeria Gusto was not touched, read or used for any check. No keys printed, no
background polls, nothing deployed.

Left out as instructed: AI, ready-made designs, Facebook posting, event types.

---

## 0 · WHAT THIS CHANGES, IN ONE PARAGRAPH

Before this, a place could have its own **picture** but always borrowed Standard's **text positions**.
That works when a place picture is the same poster with a different photo, and fails completely for a
truck like Kezmet, whose per-venue artwork already has the venue name printed on it and is laid out
differently. A place can now have its own positions as well, which means its picture may be any shape;
each of the three boxes can be switched off; and one function now decides the picture **and** the
positions together so the modal and the renderer cannot disagree. Separately, Tidy up places is now
exactly the same modal size as Add event, its two long fields each get a row, and its Merge button is
gone from the screen while the server's merge is untouched.

---

## PART 1 · A DESIGN PER PLACE

### 1.1 · The data — ONE nullable column

`supabase/migrations/20261008_event_post_place_layouts.sql`. Idempotent, additive only, with a column
comment. **NOT RUN.**

```sql
set lock_timeout = '3s';

begin;

alter table public.truck_places
  add column if not exists event_layout jsonb;

comment on column public.truck_places.event_layout is
  'Optional OWN text positions for single-event posts at this place. NULL means ''same text positions as Standard'' — the behaviour of every row before 20261008 — so a place with only event_bg_path set keeps using the truck''s default event layout. When set, a full event layout in the shape validateEventLayout() accepts (lib/weekly-post/layout.ts): version, width, height, the date/location/time boxes each with an explicit `enabled` flag, an optional note box, timeStyle, timeDisplay and keepReadable. width/height MUST equal this row''s event_bg_width/event_bg_height — the server reads them from those columns and never from the request body, because they are what proves a box sits inside the real picture. A place with its own positions may use a picture of ANY shape (the 1% aspect rule in checkAspect() applies only to places still on Standard''s positions); replacing the picture with a different shape resets this column to NULL, because boxes placed on one shape land somewhere else on another.';

commit;

notify pgrst, 'reload schema';
```

**NULL is the existing behaviour.** Every row today reads as "same positions as Standard", so this
migration changes no post that currently renders.

**Why `jsonb` on `truck_places` and not a row in `truck_post_designs`.** That table is keyed
`(truck_id, kind)` with `kind in ('week','event')` — one row per truck per poster. A per-place layout
is not a third kind of poster; it is a variation of the event poster for one venue, and there can be
dozens. Keying by place as well would make `kind` mean two things and force every existing read to
filter on a column that is null for both current kinds. The place already owns
`event_bg_path/width/height`, so the layout sits beside the picture it belongs to, and the existing
cascade from `truck_places` disposes of both.

**Why no CHECK constraint.** The shape is validated by `validateEventLayout()` — the same function the
weekly and event designs go through — against width/height read from **this row's stored picture
columns**, never from the request body. A CHECK cannot see what those columns mean, could not be kept
in step with `LAYOUT_VERSION`, and would turn a recoverable 400 into a failed write.

#### Verification selects (read-only — run after the migration)

The column exists, is nullable, and is `jsonb`:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'truck_places' and column_name = 'event_layout';
```

The comment landed:

```sql
select col_description('public.truck_places'::regclass, ordinal_position) as comment
from information_schema.columns
where table_schema = 'public' and table_name = 'truck_places' and column_name = 'event_layout';
```

Nothing was changed for any existing place — every row should still read NULL immediately after the
migration:

```sql
select count(*) as places, count(event_layout) as with_own_positions
from public.truck_places;
```

Village Spice's places and what each one currently has (no layouts yet, so `own_positions` is false
for all of them):

```sql
select p.name, p.short_name,
       p.event_bg_path is not null as has_picture,
       p.event_bg_width, p.event_bg_height,
       p.event_layout is not null as own_positions
from public.truck_places p
where p.truck_id = 'village-spice'
order by p.is_favourite desc, p.name;
```

PostgREST is serving the new column (this must return a row, not PGRST205):

```sql
select event_layout from public.truck_places limit 1;
```

### 1.2 · The shape rule now depends on whose positions are used

| The design | Shape rule | Where |
| --- | --- | --- |
| Standard | its own picture defines the canvas | — |
| A place on **Same as Standard** | within 1% of Standard (`checkAspect`), as before | `confirm_upload`, slot `place` |
| A place with **Own positions** | any shape; only the ≥600px short side applies | `confirm_upload`, slot `place` |
| A one-off for one event | must match **whichever design it would otherwise use** | `confirm_upload`, slot `one-off` |

That last row is the subtle one. A one-off replaces the picture and **inherits** the positions, so at
Kezmet (own positions, 1080×1080) a 1080×1350 upload matches Standard perfectly and is still the wrong
shape for the boxes it is about to be given. `oneOffMustMatch()` returns the design to measure against,
and the route gets the same answer from `eventPostContext(...).canvas`.

**Replacing an own-positions picture with a different shape resets that place's boxes** — to
`defaultEventLayout(new size)`, **not to NULL**. NULL would mean "same as Standard", which would
silently undo the truck's choice *and* then fail the 1% rule against the picture just accepted, leaving
a place with a picture it is not allowed to use. The same shape at a different resolution keeps the
boxes, scaled (`scaleEventLayout`).

**Standard → Own** starts from Standard's boxes scaled proportionally, because the truck has already
arranged those three boxes and the reason to switch is usually to move one of them.

**Own → Standard is refused** when the place picture's shape does not match Standard's, with this
sentence:

> This place's picture is a different shape from your Standard one, so the standard text positions
> would not fit it. Replace the picture with one the same shape as your Standard picture first, or keep
> this place's own positions.

Silently scaling Standard's boxes onto a differently shaped picture would be worse than refusing,
because it would look like it worked.

### 1.3 · The three boxes can be switched off

Date, Location and Time each get an on/off toggle, on **every** design including Standard.

- **An explicit `enabled` flag, not a zero-size box.** A 0×0 box is indistinguishable from one the
  truck dragged to nothing, cannot be switched back on without remembering where it was, and would
  still be measured, shrunk and warned about by the fit machinery. The validator accepts
  `enabled: false` explicitly and **keeps the coordinates**, so switching back on puts the box where it
  was. A layout saved before the toggles existed reads as all-on.
- **Location off says why, under the toggle:** "The place name is in your picture — HatchGrab won't add
  it."
- **At least one of Location or Time must stay on.** A cancelled event says so in exactly those two
  places — the place name struck through, and the word CANCELLED where the time goes. With both off a
  cancelled event renders as an ordinary poster telling customers to come to something that is not
  happening. Blocked in the UI *and* in `validateEventLayout`, both using `toggleIsAllowed` and the
  same message (`LAST_TOGGLE_MESSAGE`). The **Date** box may be switched off freely — it carries no
  cancellation.
- The renderer draws nothing at all for an off box. Proved in the pixels (§5).

### 1.4 · One resolver for the picture AND the positions

`resolveDesign()` in `lib/weekly-post/backgrounds.ts` replaces `resolveBackground` as the decision, and
`resolveBackground` now **delegates to it** so the order of preference exists in exactly one place.

Order: **one-off > place design > Standard**, and the positions follow:

- a place with its own layout brings its picture **and** its positions;
- a place with no layout brings its picture and uses Standard's positions (today's behaviour);
- a one-off brings only a picture and inherits whichever positions it displaced;
- **forcing "Standard design" in the modal takes Standard's picture AND Standard's positions.** Taking
  Standard's picture with a place's boxes would put text where that place's artwork has room and
  Standard's does not — the exact failure this feature exists to prevent.
- a place with positions and **no picture of its own** keeps its positions over Standard's picture.
  Half a design is still a design; ignoring it would silently undo what the truck asked for.

#### The §8.3 fix: the place is matched by **id**

`entryFor` now returns `placeId`, and `eventPostContext` looks the place up by it. Stage 2 matched on
the name it had just printed, which was correct by coincidence while the only thing hanging off it was
a picture. It is wrong in two ways that now cost real artwork:

1. two places can share a short name ("Sudbury" the market and "Sudbury" the pub), so the wrong design
   could be attached;
2. a place whose `short_name` is blank prints its `name`, so a later edit to either column would
   silently detach the design.

The harness asserts this with two places sharing a short name, one of them with a design, and
**states what the old code would have done**: by name, both events resolve to the pub.

### 1.5 · The setup screen

The left column is now **DESIGNS**: "Standard — Used at every other place" first, then every place that
has one, each with a one-line status from **one server-side function** (`placeDesignStatus`) so the list
and the right-hand column cannot describe the same design differently:

- `Own picture and text positions`
- `Own picture, standard positions`
- `Different shape — not used until replaced` (only for a place on Standard's positions — a place with
  its own positions may be any shape, so "different shape" is not a fault there)
- plus two honest extras, because a design can be selected before it has been given anything:
  `Standard picture, own text positions` and `No picture yet — using Standard`.

Below it, **"+ Add a design for a place"** opens a picker using the same list Add event offers —
favourites first, then by name, with a search. The order comes from the server, so the two screens
cannot drift apart.

**Nothing is written until the truck gives that place something of its own** (a picture, or a switch to
its own positions). Backing out of a half-made design leaves nothing behind, and the saved list never
names a design that does not exist.

Middle: the selected design's picture with draggable boxes, at **that design's** canvas size. A place on
"Same as Standard" shows Standard's boxes **not draggable**, with a line saying so — dragging them there
would either edit Standard from a screen headed "Sudbury", or throw the drag away on save.

Right column: **Picture** (Replace — or "Add a picture" where the design has none of its own, because
a design picked from the place picker has no picture yet and offering to replace one it does not have
reads as though something is already there) · **Text positions** ("Same as Standard | Own for this place",
places only) · **Text we add** with the three toggles and "+ Add a note box" · **Time shows as** ·
**Remove this place's design** (confirm; deletes the picture, the positions and the stored object).

**Preview**, per design, decided server-side:

1. the next upcoming event at that place;
2. else the last event there, labelled **"Preview uses your last event here"** — previewing on a past
   date with no sign of it would have a truck checking artwork against a booking that has gone;
3. else the next event anywhere with this place's name substituted, labelled "No events here yet —
   preview shows your next event with this place's name". **The substitution is done from the place id,
   server-side** — letting the client send a name would put arbitrary text on a poster through a path
   that renders it at any size.

**On a phone the Designs list becomes a dropdown above the preview**, at the grid's own `lg:`
breakpoint. No new breakpoint was introduced.

### 1.6 · The make-post modal

The options are labelled **"<Place> design"**, **"Standard design"**, **"Upload one for this event
only"** — and the panel is titled **Design**, not Background, because the choice now moves the text as
well as the picture. Where the place has its own positions and Standard is chosen, the modal says so:
"Standard's picture and Standard's text positions — not Kezmet's." The upload link reads "Replace it"
once a one-off exists, so the same words do not appear twice.

### 1.7 · New and changed server actions

| Action | What it does |
| --- | --- |
| `event_load` | now returns `designs` (Standard + each place with one, with status and preview), `places` (the picker's list, each with its own preview) |
| `event_place_mode` | Same as Standard ↔ Own for this place; refuses Own → Standard on a shape mismatch |
| `event_place_save_layout` | saves one place's boxes, validated against **its stored picture size** |
| `event_remove_place_design` | removes the picture, the positions and the stored object (the old name `event_remove_place_bg` is still accepted, so a browser left open on the previous build does not get "Unknown action") |
| `event_render` | takes `designPlaceId` to preview a place's design, and `background` to force a source; validates against the canvas it will draw on |
| `event_post` | now reports `layoutSource` and `placeName` |
| `confirm_upload` | the per-design shape rule for slots `place` and `one-off` |

---

## PART 2 · THE PLACES MODAL

### 2.1 · The same size as Add event, at every breakpoint

**The defect.** Add event and Tidy up places are the *same* modal. `showPicker` decides whether the
two-**pane** layout is drawn and deliberately excludes Tidy up (which has its own single-pane content) —
but it was **also** deciding the **shell's size**. So Tidy up got `sm:max-w-lg lg:max-w-2xl` and no
definite height: visibly narrower and shorter than Add event, opened from the same button bar, with its
list having nothing to scroll against.

**The fix.** Two questions, two flags. The shell is written once as constants:

```
EVENT_MODAL_SHELL  = 'bg-white w-full shadow-2xl flex flex-col min-h-0 overflow-x-hidden max-sm:h-dvh sm:rounded-2xl sm:max-h-[90vh]'
EVENT_MODAL_WIDE   = 'md:h-[90vh] md:max-w-[1040px]'
EVENT_MODAL_NARROW = 'sm:max-w-lg lg:max-w-2xl'
```

and `const wideShell = showPicker || modalView === 'tidy'`. `showPicker` still decides the content.
Measured as a **comparison** (§6), not against numbers: both shells are rendered at the same viewport
in the same engine and must come out identical. They do — 1040×810, 788×1062, 390×844.

### 2.2 · A full-width row for each long field

"Name on posts" and "Address" are `sm:col-span-2`. A venue name like "The Bull & Butcher, Wickhambrook
Green" is comfortably past 40 characters, and sharing a row put it in a half-width box where the end
scrolled out of sight while being typed. Short name, Area and Postcode stay in pairs — all three are
well under a line, and a row each would make a five-field card scroll for no reason.

At 1440 a 40-character name measures **280px of text in a 566px field**. Measured on the input's value
against a probe span in the same font, because an input shows overflow by scrolling and has no overflow
of its own — so "is it clipped" is a question about the text, not the box.

### 2.3 · Merge removed from the screen, kept on the server

Removed: the "Merge into another place" button, its target list, its confirm card, the `merging` /
`mergeInto` state, `doMerge`, `mergeTargets`, and the now-unused `places` prop on `PlaceDetail`.

**Kept and untouched:**

- `sg_merge_place` in `app/api/manage/route.ts`;
- `merged_into_id` resolution in `resolvePlaceMerge` / `placeForEvent`;
- `is_hidden: false` still clearing `merged_into_id`, so "Restore this place" still un-merges;
- every row merged before today behaves exactly as it did.

**Now unreachable from the app:** the `sg_merge_place` action handler and its entry in the allowed-action
list in `app/api/manage/route.ts`. It is listed here rather than deleted, because deleting it would also
delete the only way to undo a merge by hand. Nothing else became unreachable — `resolvePlaceMerge`,
`isRetired` and the `merged_into_id` column are all still read on every page load.

### 2.4 · The field comparison

Every `truck_places` column, against this form and the Add event form:

| Column | In the places form? | Verdict |
| --- | --- | --- |
| `id`, `truck_id`, `created_at`, `updated_at` | no | not user-editable |
| `venue_id` | no | the scraper's venue anchor; not a thing an operator sets |
| `name_key` | no | **deliberately** not editable — it is what the truck's *events* say. Re-keying on a rename would orphan every event at that place, silently |
| `name` | **Name on posts** | ✓ |
| `short_name` | **Short name** | ✓ |
| `address` | **Address** | ✓ |
| `postcode` | **Postcode** | ✓ |
| `area` | **Area** | ✓ |
| `is_favourite` | ★ Favourite button | ✓ |
| `is_hidden` | Hide / Restore button | ✓ |
| `merged_into_id` | removed by instruction (§2.3) | server kept |
| `event_bg_path/width/height`, `event_layout` | no | they belong to the event-post setup screen, which owns the picture and the boxes |

Add event's place-related fields: **Venue name** (→ `name`), **Full address (optional)** (→ `address`),
**Area (village, town or city)** (→ `area`/`town`), **Postcode** (→ `postcode`). All four have a
counterpart here.

**Nothing was added.** Every user-editable column already has a field, and no field was invented just
because a column exists.

---

## PART 3 · THE MANUAL

`docs/reference-manual.md` line 11, under `**Version 13.8**`: `September 2026` → `October 2026`.
One line changed; `git diff --stat` reports `1 insertion(+), 1 deletion(-)`. Nothing else in the manual
was touched.

---

## 4 · THE CHECKS

`scripts/weekly-post.cjs`: **207 checks, 35 broken variants, all 35 fail as required.** Every stage 1
and stage 2 check still passes unchanged.

New sections:

- **8c · A design per place** — the order of preference and the positions that travel with it; forcing
  Standard; the shape rule per design kind; `oneOffMustMatch`; `scaleEventLayout`.
- **8d · Boxes switched off** — the explicit flag, coordinates preserved, old layouts read as all-on,
  both-off refused with the shared message, Date free to go.
- **8e · The place is matched by id** — two places sharing a short name, one with a design, including
  what the by-name lookup *would* have done.
- **9d · In the pixels** — each box draws when on and **not one pixel** when off; a cancelled event with
  Location off still reads CANCELLED, with the difference asserted **in the time band** and the location
  band asserted identical.
- **9c additions** — the modal's choice reaching the resolver; validation against the stored picture
  size; the toggles and their message; the designs list, statuses and picker; the preview fallbacks; the
  shell comparison; merge gone from the screen and kept on the server; the full-width rows.

### The nine new variants, each must fail

| | What it breaks | Caught by |
| --- | --- | --- |
| V16 (repointed) | the order of preference, inverted **in `resolveDesign`** — now the one place it lives, so both callers break | 8c |
| V23 | a place's own positions ignored; its picture drawn with Standard's boxes (stage 2's behaviour) | 8c |
| V24 | a one-off measured against Standard at a place with its own positions | 8c |
| V25 | a place with its own positions still forced to match the default's shape — the feature does not work at all | 8c |
| V26 | `entryFor` stops reporting the place id — every place design silently stops being found | 8e |
| V27 | the last-toggle rule removed; a cancelled event can stop reading cancelled | 8d |
| V28 | a switched-off Location box drawn anyway | 9d (pixels) |
| V29 | the time box skipped whenever Location is off — a plausible mistake, and a cancelled poster becomes an ordinary one | 9d (pixels) |
| V30 | "Standard design" takes Standard's picture but keeps the place's positions | 8c |
| V31–V35 | source-text variants: the tidy shell shrinks back; the sizes written inline again; the route reverts to name matching; the forced choice stops reaching the resolver; a place's canvas taken from the request body | 9c |

**V31–V35 exist because five checks in 9c read source text** (the route and `page.tsx` cannot be
compiled in isolation here). A text check is worth no more than its ability to notice the regression it
describes, so each is re-run against a **mutated copy in memory** — nothing is written to disk.

### Checks of mine that were wrong before they were right

Recorded because the pattern keeps recurring:

1. **The shell-constant count** forbade the numbers appearing more than once and failed on the three
   *comments* that explain them. A check that forbids writing down why is a worse check — comments are
   stripped and the **code** is counted.
2. **The merge check** forbade the string `sg_merge_place` and failed on the removal note that tells the
   next reader the server kept it. It now forbids a **call**.
3. **The full-width check** searched backwards for the nearest `sm:col-span-2` and compared it with the
   nearest `<Input` — which is always the field's own tag, so every field read as paired and the check
   could not pass. It now splits on `<Input`, so "the markup wrapping this field" is exactly one
   segment.
4. **The same check's slice** ended at `indexOf('Events here')` — a phrase that also appears in that
   file's own header comment, at offset 630, *before* the card. The slice came out empty and the check
   silently tested nothing. The end is now found **from the start**.
5. **V35 mutated the wrong line.** `const w = row.event_bg_width || design.width` appears in both
   `event_place_mode` and `event_place_save_layout`, and `String.replace` with a string replaces only
   the first — which is outside the slice the predicate reads. It "passed". Every occurrence is now
   mutated.
6. **The tidy fixture's list was clipped, not scrolled.** It put the rows straight into the bordered
   `overflow-hidden` box; the real component wraps them in `flex-1 min-h-0 overflow-y-auto`, and that
   nested pair is the whole mechanism. The check reported the scroll broken on working code.
7. **The full-row assertion ran at 390 too**, where the card is one column and *every* field is full
   width — so there is no narrower field to be wider than. It is a statement about the two-column
   layout and is asserted at `sm:` and above, with a phone-specific assertion instead.

### Stale assertions updated after a correct change

Each kept its intent; each carries a comment saying why:

- `scripts/schedule-places-render.cjs` — two `lift()` calls read the shell from the inline
  `className={...}`, which no longer exists. They now read the **constants**, which is where the shell
  lives; the reason for lifting at all (the fixture must break rather than measure a shell nobody is
  served) is unchanged. The height is picked out of `EVENT_MODAL_WIDE` separately so `breakScroll` can
  drop it without also changing the width.
- `scripts/schedule-graphics-places.cjs` — "the three controls" is now "the two controls", and asserts
  the Merge button is **absent**; the definite-height and one-size checks read the constants and
  additionally assert Tidy up gets the wide shell.
- The **line-level multiset diff** gained four allowlist entries: the four inline shell-class lines that
  became the three constants. **Zero unexplained lines lost** (`232 passed`).
- `scripts/outreach-schema-census.cjs` — `truck_places` pinned at **18** columns (was 17) and
  `event_layout` asserted present. Without that, the migration could be written and never applied, or
  applied and never read, and nothing would notice — the failure mode is a place whose own positions
  silently never load. **42 passed.**

### Measurements — WebKit and Chromium, 1440 / 820 / 390

`scripts/schedule-places-render.cjs`, both engines, all pass:

```
  event setup 1440×900  stage 460×575 · right 280px · doc 1440 vs 1440
  event setup  820×1180 stage 788×985 · right 788px · doc 820 vs 820
  event setup  390×844  stage 358×448 · right 358px · doc 390 vs 390
  event modal 1440×900  stage 532×665 · right 300px · doc 1440 vs 1440
  event modal  820×1180 stage 424×530 · right 300px · doc 820 vs 820
  event modal  390×844  stage 310×388 · right 310px · doc 390 vs 390
  tidy        1440×900  modal 1040×810 vs add-event 1040×810 · name 280/566px
  tidy         820×1180 modal  788×1062 vs add-event  788×1062 · name 280/314px
  tidy         390×844  modal  390×844  vs add-event  390×844  · name 280/284px
```

No horizontal page scroll anywhere; nothing clipped; the tidy list scrolls **inside** the modal at 768
and above and stacks below it; the shells match exactly at every width. Existing breakpoints were kept.

### The rest

- `npx tsc --noEmit` — clean.
- `npm run build` / `npx next build` — compiled successfully.
- **ESLint on added lines** — 0 errors. `page.tsx` reports **361 problems (283 errors, 78 warnings)
  before and after, byte-identical** (all pre-existing). `EventPost.tsx` and `SchedulePlaces.tsx`: 0
  errors, 2 warnings, both the pre-existing `<img>` advice on the preview images.
- `node scripts/run-harnesses.cjs` — **84 of 84 harnesses pass**, with one exception recorded below.

#### The sweep, and the one harness that fails

The full sweep takes about three hours, past this session's background time limit, so it was run in
chunks using the runner's own `--list=` option (28, then 28, then 28 — 84 in total). The chunk lists
were written to a scratch directory, not into the repository; `scripts/harnesses.json` is unchanged.
Every chunk screened clean and every harness passed, **except**:

**`add-order-refresh-inputs.cjs` fails, and it failed before this work.** It fails on a *different*
check each run:

| Run | Conditions | What failed |
| --- | --- | --- |
| sweep, first pass | other harnesses competing | V1, a broken variant, wrongly passed |
| isolated, my tree | nothing else running | V2, a broken variant, wrongly passed |
| isolated, **`540ab39`** — the commit *before* this work, in a clean worktree | nothing else running | check (a), "the 3-pizza 11:45 order is cancelled" |

Three runs, three different failures, one of them on a tree that contains none of this work. It is the
timing flakiness already recorded for `add-order-refresh*`, and it is **not caused by this build**: the
harness compiles `components/dashboard/AddOrderPanel.tsx`, `components/printing/PrintingSettings.tsx`,
`components/printing/PrinterTypeChoice.tsx` and `lib/capacity-refresh.ts`, none of which this work
touches, and the harness file is byte-identical to its pre-change version. I proved that by running it
in a worktree at `540ab39` rather than by reasoning about which files it reads.

**It is left failing.** Fixing a flaky harness in the add-order panel is not in this brief, and making
it pass by loosening it would be worse than leaving it honest.

---

## 5 · HOW THE SWITCHED-OFF BOX IS PROVED IN THE PIXELS

"Draws nothing" is a claim about the image, not about the renderer. A renderer could skip the text and
still emit a shadow, a panel behind the date, or a row of background colour from an empty flex child.

For each of the three boxes: render it as the **only** box on the poster (the other two parked in an
8×8 corner), then render the same poster with it switched off as well, and diff its own band against a
poster with all three off. It must differ when on — otherwise "nothing changed" would pass for a box
that never worked — and **not by one pixel** when off. `keepReadable: false` on both sides, so the
comparison cannot be decided by a drop shadow whose presence depends on the sampled colour.

The cancelled case is the same method: the difference between a cancelled and a trading poster, with
Location off, must be **in the time band**, and the location band must be **identical**. Comparing whole
posters would pass on any difference at all — including the struck-through name, which is the very thing
switched off here.

---

## 6 · WHAT TO TEST ON LOCALHOST — VILLAGE SPICE

Run the migration first. Localhost uses the production database, so this is Village Spice only.

1. **Nothing changed for existing designs.** Open Schedule › Weekly post › setup › **Single event**. The
   Designs list shows "Standard — Used at every other place" selected, and any place that already had a
   picture listed under it reading **"Own picture, standard positions"**. Make a post for an event at
   such a place: identical to before.
2. **Add a design for a place.** "+ Add a design for a place" → the picker lists every visible place,
   favourites first with a ★, and the search filters by name and area. Pick one. It appears in the list
   reading "No picture yet — using Standard", the preview shows Standard's picture with **that place's
   name** in the location box, and the boxes are **not draggable** with a line explaining why. Reload the
   page: it is **gone**, because nothing was saved. That is intended.
3. **The Kezmet case — a differently shaped picture with the venue name in it.** Pick a place, set
   **Text positions → Own for this place** (the boxes arrive as Standard's, scaled). Now **Replace** the
   picture with a **square** image, at least 600px on the short side, that already has the venue name
   printed on it. It is **accepted** — the 1% rule does not apply here — and the message says the boxes
   have been reset for the new shape. Drag the Date and Time boxes into the clear space.
   Switch **Location off**: the note "The place name is in your picture" appears, and the preview loses
   the added name. **Save design.** Make a post for an event at that place: square picture, your boxes,
   no duplicated venue name.
4. **A one-off at that place must be square too.** In the make-post modal for an event there, try
   "Upload one for this event only" with a 1080×1350 image — the shape that matches Standard. It is
   **refused**, naming the size to export at. Upload a square one: accepted.
5. **Standard chosen at a place with its own design.** Same modal, choose **"Standard design"**. The
   picture *and* the text positions become Standard's, and the line under the radios says so.
6. **Both toggles off is blocked.** On any design, switch Location off, then Time off. It is refused with
   the sentence about a cancelled event, and Time stays on.
7. **A cancelled event with Location off still reads CANCELLED.** Cancel an event at the place from
   step 3 and make its post. The word CANCELLED is in the time box.
8. **Own → Standard is refused on a shape mismatch.** On the place from step 3, set Text positions back
   to **Same as Standard**. Refused, with the sentence naming what to do.
9. **Two places with similar names.** If Village Spice has two places whose short names match (or make
   one temporarily), give **one** of them a design and make a post for an event at the **other**. It
   must use Standard, not the first one's design.
10. **Preview fallbacks.** Select a design for a place with nothing coming up: the label reads "Preview
    uses your last event here". For a place with no events at all: "No events here yet — preview shows
    your next event with this place's name".
11. **Remove this place's design** → confirm. It leaves the Designs list and events there go back to
    Standard.
12. **On a phone (390px).** The Designs list is a **dropdown above the preview** with the status beneath
    it. No sideways scroll.
13. **Tidy up places is the same size as Add event.** Open Add event, note the modal's size, press
    "Tidy up places". **The box must not change size or move.** Check at a desktop width, an iPad width
    and a phone width.
14. **The long fields.** In Tidy up places pick a place and give it a 40-character "Name on posts". At
    1440 the whole name is visible with no clipping. Address has its own row too. Short name, Area and
    Postcode sit in pairs.
15. **The places list scrolls inside the modal.** With more than a screenful of places, the left list
    scrolls on its own and the detail stays put.
16. **No Merge button.** It is gone from the place detail. **Favourite** and **Hide / Restore** still
    work, and restoring a previously merged place still un-merges it.

---

## 7 · WHAT I DID NOT DO

- **No SQL was run.** The migration is yours to apply.
- **Not deployed, not pushed to main, nothing merged or rebased.** Work is on `schedule-graphics`.
- **`sg_merge_place` was not deleted**, only disconnected from the UI (§2.3).
- **No new breakpoints.** The phone dropdown uses the setup grid's existing `lg:`; the places form uses
  the card's existing `sm:`.
- **The manual got one line.** Nothing else in it was touched.
