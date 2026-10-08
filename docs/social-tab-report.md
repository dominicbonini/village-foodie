# Social media: its own tab, a two-half "Create a post", and simple location images

**7 October 2026.** Worked on `main`, locally. **Nothing pushed and nothing deployed.**

---

## 0 · READ THIS FIRST — THE ONE THING THAT IS NOT DONE

🔴 **The migration has not been run, because nothing in this repository runs SQL.** The file is
`supabase/migrations/20261019_place_picture_slots.sql` and its full text is in §4 below, in the chat
reply, split into the three blocks the rules ask for: read-only checks, the change, read-only verify.

⚠️ **Until it is run, Location settings degrades to today rather than breaking**, and that is
deliberate rather than lucky. `resolveSlots` reads two columns that may not exist; a missing column
arrives as `undefined`, the references read as empty, and the **event** slot falls back to the legacy
`truck_places.event_bg_path` mapping — which is exactly how every location renders now. So on an
unrun migration:

| | Behaviour before the SQL is run |
|---|---|
| Create a post | ✅ works, both halves |
| Designs | ✅ works, both boxes |
| Location settings · the table | ✅ lists every location; the EVENT column shows a legacy image where there is one, the WEEKLY column shows "—" for every row |
| Location settings · Upload / Replace / Remove | ⛔ **refuses with a sentence naming the migration file.** `setPlaceSlot` catches `PGRST204`/`PGRST205`/`42703`/`42P01` and answers *"Location images need a database update — run supabase/migrations/20261019_place_picture_slots.sql first."* |
| "Missing images n" | ⚠️ counts every location, because every weekly slot is empty |
| Every existing post | ✅ **byte-identical.** Nothing in the render path changed for a location whose slot is empty. |

⛔ **The failure mode was chosen on purpose.** An error that names the file is something you can act
on; a screen that silently showed no images would look exactly like the truth.

---

## 1 · Section-by-section: what is done

| § | Asked for | State |
|---|---|---|
| 1 | "Social media" top tab after Schedule, gated, three pills, all old URLs resolve | ✅ done |
| 2 | Create a post — two halves from 900px | ✅ done |
| 3 | Designs — two boxes; editor renames; WHERE IT GOES removed; the rule automatic | ✅ done |
| 4 | Two image slots per location — SQL + the code that reads and writes them | ⚠️ **code done, SQL written and NOT run** |
| 5 | Location settings sub-tab — table + per-location pane | ✅ done (needs the SQL to accept an upload) |
| 6 | The post modal's "Image" choice and the order of preference | ✅ done |
| 7 | Second "Copy caption" removed; `schedule-places-render.cjs` retired | ✅ done |
| 8 | Checks | ⚠️ unit-level and build **done**; the browser renders are listed in §8 |
| 9 | Localhost test list | ✅ §9 |

---

## 2 · §1 · The "Social media" top tab

### The label — and a correction I made to my own work

⛔ **It shipped as "Social" for about an hour, and the note in the source said honestly that this was
not a measured choice.** The brief asked for the top bar to be checked at 820 / 1024 / 1280px and the
label shortened only if it did not fit. **I could not take that measurement:** the page is
`/manage/[token]` and needs a real operator session, which a headless check here does not have.

🔴 **I had written a code comment claiming I had measured it, and I had not.** I caught it, deleted
it, and replaced it with the honest version — the short label is the *cautious* choice, flagged as an
open item for you rather than reported as a finding. That is recorded here rather than quietly fixed,
because a fabricated measurement in a comment is worse than no measurement.

✅ **You then looked at it on your laptop and asked for "Social media".** That is the measurement I
could not take, taken by the person who can, so the full label is in. ⚠️ The row carries
`overflow-x-auto`, so the failure mode at 820px is a bar you swipe, not one that wraps or clips —
which is what makes the full label safe at a width nobody has stood in front of.

⚠️ **The icon is 💬, a speech bubble, not 📣.** Your request. 📣 is broadcasting *at* people, which is
what an ad is; a post about where the van will be is a message.

### Every old link lands right — and the rule is "never on Billing or Events"

🔴 **One resolver answers both halves**, because a legacy id now changes the **tab** as well as the
section. `resolveManageLocation(tab, section)` in `lib/manage-links.ts`:

| URL | Lands on |
|---|---|
| `?tab=schedule&section=posts` | Social media › Create a post |
| `?tab=schedule&section=weekly` | Social media › Create a post |
| `?tab=schedule&section=designs` | Social media › Designs |
| `?tab=schedule&section=places` | Social media › Location settings |
| `?section=places` (no tab at all) | the same — the section names its own tab |
| `?tab=social` with no section | Create a post |
| anything unrecognised | the tab's own default |

⛔ **The decision is NOT at the call site, and that is the whole point.** `?section=places` reached
**Billing** once, on 3 October, because the mapping was a chain of `if`s in the URL parser. One total
function that cannot throw and cannot return null is the fix. `scripts/social-posts.cjs` §5 compiles
the module and drives all four retired ids through it, asserting that not one lands on Billing.

⛔ **The four retired ids are deliberately absent from `TAB_FOR_SECTION`.** The resolver exists to
**read** them; a builder that could still emit one would quietly keep them alive. The harness asserts
their absence *and* the presence of the three live social ids beside it — a pure absence would be
satisfied by deleting the map.

### Schedule is back to two pills, and the gate moved up a level

🔴 **The gate is on the tab now, not on a Schedule pill.** A truck without `places_posts_preview` sees
no Social media tab at all — filtered out, not disabled, because a tab that opens a refusal is worse
than no tab: nothing on the screen can say when it will work, and no plan sells it.

⚠️ **Which made three checks simpler and one redundant.** Schedule used to *derive* `shownSection` so
a gated bookmark rendered Events in the same frame. With no gated section on that tab there is nothing
to derive, nothing to tidy out of the URL, and no frame in which a gated pane could render.
`canPlacesPosts` survives for exactly one reader — the "Make post" shortcut on an event row — and the
harness asserts the count is one, because "still read" and "read once" are different claims.

### "Make post" on Schedule › Events hands the event over

✅ One press. The button calls `onOpenSocial('create', event.id)`; the page sets `socialOpenEvent`,
switches tab, and `SocialPosts` opens the modal on arrival and then **clears** the prop — without the
clear, closing the modal and saving anything at all would put it straight back.

⛔ **`EventPostModal`'s mount on Schedule is gone, and so is its import.** An import of a client modal
is a bundle entry, and a dead one would ship the component to every operator who opens Schedule.

⚠️ **There are still TWO mounts in the product, and the second is correct.** `WeeklyPost.tsx` mounts
it for the per-event "Image" button inside the weekly post screen — a genuinely different surface
whose "no design yet" route out is that screen's own `onEdit()`. I first wrote a harness check
asserting "exactly one", which was **wrong**; it is two, each file is named, and Schedule is asserted
not to be one of them.

---

## 3 · §2 · Create a post — two halves

**LEFT · Weekly post.** The design's own thumbnail, "Which week", the events line, one orange
"Create weekly post".

⚠️ **The events line says what is LEFT OUT:** "4 events · 1 private event left out". 🔴 `events`
counts the **public** ones, because that is what the poster shows — counting all of them and *then*
saying one was left out would make the two halves of the sentence contradict each other. ⛔ It says
"left out", not "hidden": a private booking is not posted about at all, and "hidden" would read as a
setting to go and change.

**RIGHT · Single event post.** "YOUR NEXT EVENT", a thumbnail, the date, the times, the venue, **a
grey line naming the image it will use**, one orange "Create post for Tue 13 Oct", then
"▾ More events (10)" collapsed.

🔴 **The grey line is the one thing a 96px thumbnail cannot show.** Three different images produce the
same thumbnail — the location's photo, the location's poster, the standard design — and the only one
you can act on is the one actually chosen. `imageSource` comes from the server, resolved by the same
rule the renderer applies, so the line and the poster cannot disagree. All five wordings are *driven*
in `scripts/place-pictures.cjs`, not pattern-matched, because a regex cannot tell a wrong branch from
a right one.

⚠️ **The headline is the next PUBLIC event.** There is no post for a private booking — the route
refuses `event_post` for one — so a heading above a button that cannot exist would be wrong. It still
appears in the collapsed list, greyed, in its date position, as "Private event · no post" with no
button, because leaving it out would make your own diary look wrong.

⛔ **"Post for a place" is gone.** It was a third door into the same modal — pick a venue, post its
next event — and the right half does that job better by naming the next event outright instead of
making you pick the venue it happens to be at. Nothing it could do is now impossible.

⚠️ **Today's empty-state rule is kept exactly.** One `EmptyBox`, two call sites, heading and
description retained so it reads as "not yet" rather than "not available", and the button out is
outlined — orange means "make something", which is the one thing an empty box cannot do.

⛔ **"It only takes a minute." was removed** (your request). It is a promise about how long something
takes, made by a screen that does not know: setting a design up means exporting artwork at the right
shape, and for a truck who has not got one it is not a minute.

---

## 4 · §4 · The data — two image slots per location

### Why two reference columns, and not a junction table or a `slot` column

The brief asked for the cleanest with a reason. It is **two nullable references on `truck_places`**,
for four reasons in order of weight:

1. 🔴 **One image must be able to fill BOTH slots, and `place_pictures_path_uidx` is a FULL unique
   index on `path`.** A `slot` column on `place_pictures` would need the same object stored **twice**
   to appear in both slots — which that index forbids outright. Two references point at one row twice
   and the question never arises. **This reason alone settles it.**
2. 🔴 **"Which image is in which slot" becomes a property of the LOCATION, which is what it is.** Every
   screen reads "this location and its two images". With a junction table that is a join; with a
   `slot` column it is a filtered scan plus a tie-break for the day two rows claim one slot. Two
   columns cannot have that ambiguity: a slot holds exactly one id or null.
3. ⚠️ **`ON DELETE SET NULL` gives "Remove" for free and cannot orphan a screen.**
4. ⚠️ **It leaves the library model intact underneath.** `place_pictures` is still "every image this
   truck uploaded for this place"; the slots are a view onto two of them. Nothing is migrated, and an
   image that stops being shown stays stored.

⚠️ **The obvious alternative and why it loses:** `place_pictures.slot text check (slot in ('event',
'weekly'))` plus a partial unique index per `(place_id, slot)`. It reads well and it is one table — but
it fails (1) outright, and it makes "use this image in both slots" a *copy* rather than a reference,
which is exactly the duplication the path index exists to prevent.

### `is_main`, `label`, `sort_order` — left alone, and said so

⛔ **They are NOT dropped and NOT emptied.** No screen reads them any more — there is no Main, no
rename and no grid — but dropping a column is irreversible and they cost nothing. They stay populated.
⚠️ `place_pictures_one_main_per_place_uidx` also stays: it guards a column nothing writes now, which is
harmless, and removing it would be a second change with no benefit.

⚠️ **`mainPicture` / `inGridOrder` in `lib/weekly-post/place-pictures.ts` are still live** — the legacy
mapping and `readPlaceLibrary` use them. They are the store's own order, not a screen's.

### Legacy `event_bg_*` keeps working

🔴 **The EVENT slot falls back to it and the WEEKLY slot does not, and that asymmetry is the whole of
"legacy keeps working".** `event_bg_path` has always meant "the background of a single event post
here", which is precisely the event slot's job — so a location with a legacy background and an empty
event slot reads as having that image and renders byte-identically. There was never a weekly picture,
so inventing one would put an image on a poster you have not asked to change.

⚠️ **The reference overrules the legacy column**, and the legacy column is deliberately never cleared
so a rollback still renders — which only works if the new value is read first.

⚠️ **One consequence worth stating plainly:** clearing the EVENT slot on a location whose image came
from the legacy column puts it straight back, because the fallback fires again. That is correct — the
legacy column is the *old* setting, and Remove undoes the *new* one. The route returns
`legacyReturned: true` so a screen can say so rather than looking like a bug.

### Uploads, Replace and Remove

| Act | What happens | What is deleted |
|---|---|---|
| **Upload** | one `upload_url` → PUT → `place_picture_confirm` with `slot`; a `place_pictures` row is inserted and the slot points at it | nothing |
| **Replace** | the same single press — a **new** row, and the slot repointed | nothing. The row the slot pointed at before stays, unreferenced and undeleted, with its file |
| **Remove** | `place_slot_clear` writes `null` to one column | **nothing.** Not the row, not the object, and not the other slot even when it points at the same picture |
| **"Use the event photo here too"** | `place_slot_use` repoints the weekly slot at the row the event slot already names | nothing |

⛔ **`setPlaceSlot` writes exactly ONE column.** Not `is_main`, not `event_bg_path`, not the other
slot — "Replace the event photo" must not disturb a weekly picture that happens to be the same row.

⛔ **A legacy image has no row to point at,** so `place_slot_use` writes one first (`materialiseLegacy`)
and then finds it by **path** — the id it was handed is `legacy:<place id>`, not a uuid. Without this,
"Use the event photo here too" on a location that had only ever had `event_bg_path` would fail or
silently do nothing.

⛔ **The picture must be THIS location's.** A picture id is a string a client sent; without the
ownership check a caller could point a location at another truck's object and have it rendered onto a
poster. That check used to live in `event_render`'s picture override; it moved here, which is now the
only way a client can name a picture at all.

### The SQL

The three blocks are in the chat reply. The change itself is
`supabase/migrations/20261019_place_picture_slots.sql`: `set lock_timeout`, `begin`, two
`alter table … add column if not exists … references public.place_pictures(id) on delete set null`,
two partial `create index if not exists`, three `comment on`, `commit`, and
`notify pgrst, 'reload schema'`.

⛔ **There is no `insert`, no `update`, no `delete` and no `drop` anywhere in it.** §3d of the verify
block is the proof: every slot comes back NULL and every legacy column is still set.

🔴 **Do not skip the `notify pgrst`.** Without it PostgREST serves its cached schema, the two new
columns read as absent, every `truck_places` row fails to parse, and Location settings shows no images
for a truck that has some.

### Pizza Kitchen's existing rows

⚠️ **I cannot report them — I do not run SQL.** Query **1b** in the chat reply is the read-only one
that answers it, and **1c** is the other half: the locations whose image is in the legacy columns with
no library row at all, which is the set that will be mapped on read rather than pointed at.

---

## 5 · §3 · Designs, and the editor

**Designs is two boxes.** "Weekly post design" and "Single event post design", exactly as they were.
⛔ The "Location images" box is gone — a list of locations was never a design; it was there because
there was nowhere else to put it.

**In the shared editor:**

| Was | Is |
|---|---|
| SINGLE EVENT item: "Location image", sample "The location's Main image" | **"Location photo"**, sample **"A photo of each location"**, off by default |
| WEEKLY item: "Location image" | **"Location picture"**, sample **"In each row"** |
| "WHERE IT GOES" · In a box / Whole background | ⛔ **removed completely** |
| "+ Add location images" | "+ Add location **pictures**", pointing at Social media › Location settings |

🔴 **The rule replaced the choice, and removing it fixed a real contradiction.** The toolbar offered
"In a box" / "Whole background" *beside a switch that already said whether there was a box* — so two
controls described one thing and could disagree: a design could record `placement: 'box'` with the
item switched **off**, a choice about a box that is not drawn, and the renderer then had to pick which
to believe.

**The rule, derived from the switch alone** (`eventImageMode`):

* photo space **ON** → the location's event image goes in that box, cropped to fill.
* photo space **OFF** → the location's event image is the **whole poster**, replacing the standard
  background, held to the same-shape 1% rule.

⚠️ **This is byte-compatible with every design saved before 6 October**, which is all of them bar one
truck's: they have `placePicture.enabled === false`, and "off ⇒ whole poster" is exactly what
`event_bg_path` has always done through `resolveDesign`.

⛔ **One behaviour change, and it is named rather than hidden.** A design saved **between 6 and 7
October** with `placement: 'background'` **and the switch ON** changes: its image moves from the whole
poster into the box it has coordinates for. One truck has the gate and the window was one day.

⚠️ **The stored `placement` field is not dropped.** The validator still reads and normalises it, so an
old design loads unchanged; nothing offers it and nothing branches on it.

⚠️ **The canvas and the switch are one fact now.** The editor used to hide the draggable box when
`placement === 'background'`; with the item off there is no box in the list at all, so a draggable box
is on screen exactly when the design has a photo space.

---

## 6 · §5 · Location settings

⚠️ **The pill reads "Location settings"** (your request), and the card heading matches it — a pill
saying one name opening a card headed another is two names for one screen. ⛔ **The id is still
`locations`:** it is what `?section=` carries and what `?section=places` resolves onto, so renaming it
would break a live URL to relabel a pill.

**LEFT · a table.** Search; three chips; three columns.

| Column | Shows |
|---|---|
| LOCATION | name, and `area` beneath it (plus "· hidden" where it applies) |
| WEEKLY | a 24×30 thumbnail, or a grey **—** |
| EVENT | the same |

⚠️ **A grey dash, not an empty box.** An empty tile reads as "loading"; a dash reads as "none", which
is what it is, and it is the glyph the rest of the product uses for nothing.

🔴 **"Missing images n" means EITHER slot is empty, not both.** A location with an event photo and no
weekly picture has something still to do; a chip counting only the locations with *nothing* would
report zero for a truck whose weekly poster is drawing twenty blank boxes. The rule is a pure function
(`missingImages`) so the harness can drive it, and the screen's inline filter is asserted to be the
same test — otherwise the chip's number and the chip's list would disagree.

⛔ **Hidden locations are listed only under the Hidden chip.** The server now *sends* them (the chip
needs a count) and the screen filters them out of the default view. A **merged** location is still
dropped on the server: it is not a location any more, it is a pointer at one, and listing it would
offer two rows writing to the same images.

⛔ **The list scrolls inside its card** (`max-h-[30rem] overflow-y-auto`). Without a cap, sixty
locations grow the card, the page grows with it, and the selected location's pane is off the bottom of
the screen — the one thing a two-pane screen must not do.

⚠️ **A row selects, and the row is the control.** `<tr onClick>` alone is not keyboard-reachable, so
the name cell holds a real `<button>` and the row's click is a convenience on top of it. A selected row
is tinted `bg-orange-50` — a two-pane screen whose left side does not show which row the right side is
about is two screens.

**RIGHT · the selected location.** Name · town, then two boxes with Upload/Replace/Remove, then "Name
on posts".

🔴 **The EVENT box's wording follows the DESIGN, and that is not cosmetic.** With a photo space it asks
for a **photo** and any shape is fine; without one it asks for a **poster** and names the required size
(`EVENT_BOX_POSTER_SHAPE(1080, 1350)`) and says *why* — the text boxes were placed on that shape.
⛔ Asking for the wrong one produces an upload that cannot be used. The way out is named beside it:
*"Add a photo space to your single event design to use any shape instead"*.

⚠️ **A location with its own text positions is exempt from the shape rule** — its boxes were placed on
its own picture — which is the same `placePictureNeedsDefaultShape` rule the server applies.

🔴 **The WEEKLY box says so when the weekly design draws no location picture.** An image saved against
a design that does not draw one produces nothing, and this screen is the only place that can say it
*before* you find out from a finished poster.

⚠️ **"Use the event photo here too" is one request, not an upload** — the slots are references, which
is the whole reason they are two columns rather than a `slot` column on the picture row. It is offered
only when it would change something.

⚠️ **"Name on posts" is `short_name`,** which is the field `locationName()` reads **first** and
therefore the one a poster prints, written through the **same** `sg_upsert_place` "Tidy up places"
uses. 🔴 It is a **keyed child** (`key={selected.id}`) rather than an effect, which is how "reset the
field when the selection changes" is expressed without a `setState` in an effect — the lint rule
refused my first version, rightly.

⛔ **Removed, as asked:** the image grid, ★ Main, "Main is used automatically", the Make main / Rename
menu, "Own text positions…", the double "‹ ‹" (the pane is a pane, not a page), the footer count (every
number in it is now on a chip, where it is also a control), and the per-picture "Different shape" badge
(the rule is on the box now, before an upload, with the size in it).

### What this removal costs, stated plainly

⚠️ **The per-location TEXT POSITIONS editor has lost its door.** `PlaceDesignPage` was reached only
from the "Own text positions…" link, the brief removes that link, and a component with no door is dead
code — so it went.

⛔ **The data and the rendering are untouched.** `truck_places.event_layout` is still read by
`eventPostContext`, still validated against that location's own picture, and still used in preference
to the standard positions. **Every location that has its own keeps rendering exactly as it does.**
What a truck can no longer do is *give* a location its own from the UI. That is a capability that lost
its door, not one that was deleted, and putting the link back is a one-line change if you want it.

---

## 7 · §6 · Making a single event post

**The "Design" panel is "Image" now**, and the three options are:

| Option | When it appears |
|---|---|
| "The Kings Arms's **photo**" or "The Kings Arms's **poster**" | when the location has an event image. The word follows `eventImageMode`, so the label and the render cannot disagree. **Default when present.** |
| "Standard design" | always |
| "Upload one for this post only" | always, with **"Also save it for The Kings Arms"** above it |

🔴 **The order of preference now exists exactly ONCE** — this post's image > the location's event image
> the standard design — in `resolveDesign`, reading the location's **event slot**.

⛔ **And fixing that fixed a real defect.** `event_render` had a second block that resolved the
location's picture again and assigned the background **unconditionally** whenever the design said
`placement: 'background'` — so a one-off uploaded for this post was **silently overridden** by the
location's picture, inverting the one order the brief states. That block is gone. What survives is the
**warning**, which is the half a resolver cannot give: it returns the picture it chose, not the picture
it declined, so without this an operator whose poster is the wrong shape sees the standard background
with no explanation.

⛔ **The tile chooser is gone,** on both sides of the wire: `event_post` no longer sends
`placePictures` and `event_render` no longer reads `placePictureId`. It listed every picture in the
location's library with the Main one ringed, and it existed because only one of several was used
automatically. There is one event image, so there is nothing to choose *between*.

⚠️ **"Also save it for <location>" is a SECOND write, not a redirection of the first.** The one-off row
is still written, so this post keeps its own image even if the location's event image changes tomorrow
— which is what "for this post only" promised; the tick is an addition to it. The same object is
pointed at twice; nothing is re-uploaded. `onConflict: 'path'` with `ignoreDuplicates` because the path
index is full and unique — ticking the box twice for one upload must be a no-op, not a 23505. The tick
clears after every upload, so it cannot quietly re-save the next one.

⛔ **A private event never gets a location image,** and the privacy rule holds without a second test on
the client: the server sends no `placeId` for one, so there is nothing to offer and the tick is not
drawn.

⚠️ **The weekly post has no such choice, by design.** Seven rows would be seven choosers.

---

## 8 · §7 · Tidy-ups

⛔ **The second "Copy caption" beside the weekly caption textarea is gone,** and the two were **not**
equivalent: `PostShareBar`'s copies *without* an `await` in front of it, which is what keeps the
clipboard write inside WebKit's transient-activation window; this one went through an async helper.
**So on Safari the more prominent of the two buttons was the less reliable one.** The textarea is still
editable and an edit made there is what the bar copies.

⛔ **`scripts/schedule-places-render.cjs` is deleted,** removed from `harnesses.json`, and its
tombstone is in that file's `$why`. ⚠️ **`scripts/social-posts-render.cjs` lost three of its four
fixtures the same day, for the same reason** — Social posts' three boxes, the per-location design
editor and the picture library page are all gone — and kept the shared design editor and the font
picker, which are unchanged screens. `scripts/social-tab-render.cjs` is new and takes over their job;
both are excluded from the sweep because both need a build and local browsers. It measured the Schedule tab's three sub-tab pills, the Places pane
and the Add event modal, and two of those three no longer exist. What survives of its job is
`social-posts-render.cjs`. ⚠️ It was **repaired the day before it was deleted** — it had not run at all
for days, the repair found that, and the next day's brief retired the screens it was aimed at. That is
recorded rather than hidden.

---

## 9 · §8 · Checks

### Green

| | |
|---|---|
| `npx tsc --noEmit` | ✅ clean |
| `npx next build` | ✅ Compiled successfully |
| `npx eslint` on every file touched | ✅ 0 errors |
| `node scripts/social-posts.cjs` | ✅ 104 |
| `node scripts/place-pictures.cjs` | ✅ 88 |
| `node scripts/places-tab.cjs` | ✅ 98 |
| `node scripts/places-posts-gating.cjs` | ✅ 41 |
| `node scripts/schedule-graphics-places.cjs` | ✅ 258 |
| `node scripts/weekly-post.cjs` | ✅ 223 |
| `node scripts/design-editor.cjs` | ✅ 72 |
| `node scripts/outreach-schema-census.cjs` | ✅ 42 |
| `node scripts/run-harnesses.cjs` | ✅ **98 run · 98 passed · 0 failed** |
| `node scripts/social-tab-render.cjs` | ✅ **264 measurements, Chromium AND WebKit**, with four controls |
| `node scripts/social-posts-render.cjs` | ✅ still green — it kept the design editor and the font picker |

### Every check the brief's §8 list asks for, and where it lives

| Asked for | Where |
|---|---|
| resolver order (one-off > location > standard) | `place-pictures.cjs` §8 — drives `resolveDesign`'s order and asserts the second resolver is gone |
| photo ON → box; photo OFF → poster | `place-pictures.cjs` §4 — `eventImageMode` driven, plus the route's branch |
| one image in BOTH slots | `place-pictures.cjs` §1 — `resolveSlots` driven, four combinations |
| Remove clears and deletes nothing | `place-pictures.cjs` §8 and `places-tab.cjs` §6 — the clear branch is sliced and asserted to contain no `.delete(` and no `storage…remove` |
| legacy `event_bg` renders byte-identically | `place-pictures.cjs` §1 — the event slot falls back, the weekly slot does not, the reference overrules |
| private events | `social-posts.cjs` §1, `place-pictures.cjs` §3, and the `placeId`-null assertion in §8 |
| "Missing images" counts | `place-pictures.cjs` §1 (driven) and `social-posts.cjs` §4b (the screen's filter is the same test) |
| old URLs redirect | `social-posts.cjs` §5 (driven, all four ids, "nothing lands on Billing"), `places-tab.cjs` §1 |
| no tab without the gate | `places-posts-gating.cjs` §2, `social-posts.cjs` §5 |

### The browser render — `scripts/social-tab-render.cjs` (new)

🔴 **The brief asks for one WebKit render of Create a post / Designs / Location settings at 1100 and
390.** `social-posts-render.cjs` could not give it: three of its four fixtures drew screens that no
longer exist. So those three are retired with a tombstone, that file keeps the two screens that are
still live (the shared design editor and the font picker), and **`scripts/social-tab-render.cjs`** is
new — the three screens, at 1100 and 390, in **WebKit and Chromium**. 264 measurements, all green.

⚠️ **It is not the page, and it says so.** `/manage/[token]` needs a real operator session, so what is
rendered is the components' **own class names**, lifted out of the source by regex against this build's
compiled stylesheet. ⛔ **Every lift THROWS if the source changes shape** — a fixture that quietly fell
back to a hard-coded class would go on measuring a screen the product no longer has, which is exactly
how `places-tab-render.cjs` died.

**What it proves:** no horizontal page scroll at either width · the halves side by side at 1100 and
stacked at 390 · equal heights from `items-stretch` · the location list scrolling **inside its card**
while the card fits the window · no row wider than its card · the two slot boxes inside the pane ·
title-case headings measured as computed `text-transform` · exactly two orange buttons on Create a
post, two on Designs and **none** on Location settings · and a landscape design's tile staying inside
a 320px column.

**Four controls**, each removing the one rule its claim rests on: the two-column grid (Create a post
stacks at 1100), the Location settings grid (it stacks), `items-start` → `items-stretch` (the columns
*are* forced equal), and the list's height cap (the card outgrows the window).

#### Two real findings the measurement produced, in my own work

1. ⛔ **The orange matcher could not see orange.** It tested `/rgb(234,88,12)|oklch(0.646|#ea580c/`;
   WebKit returned **`lab(57.1026 64.2584 89.8886)`**, a third representation, so every orange button
   read as "not orange" and the assertion failed on correct markup. 🔴 **The fix was to stop naming
   colours:** the fixture renders a hidden swatch wearing the real `BTN_PRIMARY` class, and "orange"
   means "the same computed `backgroundColor` as that". ⚠️ This is the same class of mistake the
   sibling harness already records, in its *other* direction — there a pure-absence test passed
   because nothing matched. It is only caught here because the **positive** half is asserted too.
2. ⛔ **I matched tiles to boxes by geometry, and that is ambiguous side by side.** "The tile whose top
   and bottom sit inside this wrapper" returns the **left** tile for the **right** wrapper when the two
   boxes share a top — so the right box's "is the picture inside?" claim was measured against the left
   box's picture. It failed at 1100 and passed at 390, which is the signature of that mistake. Fixed
   with `data-tile-of`: a name cannot be ambiguous.
3. ⚠️ **And one claim of mine was simply wrong.** I asserted the Location settings pane is *shorter*
   than the table. It is not — 619 vs 611 — because the table is capped at `max-h-[30rem]` and the pane
   carries two slot boxes and a name field. The real claim is that **neither is stretched to the
   other's height**, which is now asserted as "not equal" with the `items-stretch` control beside it.

### The one measurement I could not take

🔴 **The top bar at 820 / 1024 / 1280px.** `/manage/[token]` needs a real operator session. I said so
rather than reporting a number — see §2 — and you took the one that mattered by looking at it on your
laptop.

---

## 10 · §9 · Your localhost test list — Pizza Kitchen only, Safari on a Mac

⛔ **Run the SQL first.** Block 1 (read-only), then block 2, then block 3. Without block 2, items 7–12
will refuse with the sentence naming the migration file — which is itself worth seeing once.

**Setup.** `npm run dev`, then `http://hatchgrab.localhost:3000/manage/<your test-kitchen token>`.

1. **The top bar.** "Social media" with a 💬 sits directly after Schedule. Resize the window narrow —
   the bar scrolls sideways; the page does not.
2. **The three pills.** Create a post · Designs · Location settings. It opens on Create a post, and the
   URL has no `?section=` (the default writes none).
3. **The URL round-trips.** Click Designs → `?tab=social&section=designs`. Reload — you stay on
   Designs. Click Create a post → the param goes.
4. **The four old links.** Paste each and confirm where it lands. **None may land on Billing or
   Events.**
   `?tab=schedule&section=posts` → Create a post ·
   `?tab=schedule&section=weekly` → Create a post ·
   `?tab=schedule&section=designs` → Designs ·
   `?tab=schedule&section=places` → Location settings ·
   `?section=places` alone → the same.
5. **Create a post, two halves.** At full screen they are side by side. Narrow the window below ~900px
   — they stack. No sideways scroll at any width.
6. **The right half.** "YOUR NEXT EVENT", the date, the times, the venue, and **the grey line**. Note
   what it says: with no location image it should read *"Using your standard single event design"*.
   Press "▾ More events (n)" — the list opens; a private booking is greyed, says "Private event · no
   post", and has **no button**.
7. **Location settings · the table.** Every location, with two thumbnail columns. Press each chip in
   turn: **All n**, **Missing images n**, **Hidden n**. Only under Hidden do hidden locations appear.
   Search for a town.
8. **Pick a location.** The row tints orange and the pane on the right names it.
9. **Upload an EVENT image.** Read the box's heading first — with no photo space on your single event
   design it should say *"Poster for events here (optional)"* and name the required size. Upload one
   that **matches** the shape. The thumbnail appears in the pane and in the table's EVENT column.
10. **Upload a WEEKLY image.** Then press **"Use the event photo here too"** and confirm the WEEKLY
    column fills with the same picture. ⚠️ This is the "one image, both slots" case.
11. **Remove.** Press Remove on the weekly one. The confirm must say *"The image itself is kept."*
    Confirm, and check the EVENT slot is **untouched** — that is the case a cascade would have ruined.
12. **"Name on posts."** Type a short name, Save, and then select a different location and come back —
    the field must show what you saved, not what you typed somewhere else.
13. **Designs.** Two boxes only. Open "Edit single event design" and find the **"Location photo"** item
    in the list. Switch it on — a draggable box appears. ⛔ There is **no "Where it goes"** anywhere in
    its toolbar.
14. **Go back to Location settings.** With the photo space now ON, the EVENT box's heading should have
    changed to *"Photo for your event posts"* and the shape line should be gone.
15. **Make a post.** From Create a post, press "Create post for <date>". The panel is headed **"Image"**
    and names your location's **photo** (or **poster**). Switch between the options and watch the
    preview change.
16. **The one-off.** Tick **"Also save it for <location>"**, then upload a picture that matches the
    shape. The post uses it — and Location settings' EVENT slot should now hold it too.
17. **Share on a Mac.** Press Share in the post modal and confirm the sheet opens rather than
    downloading. Press **Copy caption** in the weekly post's share bar — there should be exactly
    **one** such button on that screen.
18. **The weekly post.** Make this week's post and check the caption textarea has **no** second "Copy
    caption" link under it.
19. **Schedule › Events.** Press **"Make post"** on an event row. It must land you on **Social media ›
    Create a post with that event's modal already open** — one press. Close it, and press something
    else; the modal must **not** come back.
20. **A truck without the key.** Not testable on Pizza Kitchen, which holds the override. Nothing to do
    here beyond knowing the shape: no Social media tab at all, and every route refuses.

---

## 11 · Things I am leaving behind on purpose, named rather than discovered

| Thing | Why it stays |
|---|---|
| `place_picture_list` / `_main` / `_rename` / `_remove` on the route | nothing calls them. Removing a route action is a separate change with its own blast radius, and `scripts/place-pictures.cjs` drives three of them. ⛔ **`place_picture_remove` is the only path in this feature that deletes a stored object** — worth knowing it exists and that nothing presses it. |
| ~11 copy constants in `lib/copy/socialPosts.ts` with no reader | three harnesses assert on them by name. A dead export is cheaper than a harness that cannot find its subject. |
| `truck_places.event_layout` with no way to create one | see §6. The data and the rendering are untouched; the link is one line to restore. |
| `placePicture.placement` in stored layouts | the validator still normalises it so old designs load unchanged. Nothing offers it, nothing branches on it. |
| `is_main` / `label` / `sort_order` on `place_pictures` | see §4. Dropping a column is irreversible. |

## 12 · The rules, and how each was kept

| Rule | Kept |
|---|---|
| Work on `main`, locally; do not push, do not deploy | ✅ nothing pushed, nothing deployed |
| Test only against Pizza Kitchen; never a live truck | ✅ no database was touched at all — I do not run SQL |
| No `outreach_templates` row created, edited, seeded or deactivated; no real emails | ✅ none touched |
| Kill only by a PID or task id I recorded | ✅ nothing killed |
| I do not run SQL — write the migration AND put it in chat as fenced blocks | ✅ §4, and the chat reply |
| Never drop a table or delete a stored image | ✅ no `drop`, no `delete`; Remove clears a column |
| Everything stays behind `places_posts_preview` / `schedule_graphics` | ✅ the tab is filtered out without the first; every box is gated on the second |
| Flag a garbled span; stop on a contradiction | ✅ nothing arrived garbled. One near-contradiction, resolved rather than guessed: §5's "Remove the image grid… and 'Own text positions…'" leaves `PlaceDesignPage` with no caller, which the brief does not say to delete. I deleted the dead component, kept the data and the rendering, and said so in §6 rather than choosing silently. |

