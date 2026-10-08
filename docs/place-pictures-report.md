# SOCIAL POSTS · PART 3 — PLACE PICTURES AS A LIBRARY, USED BY BOTH DESIGNS

**18 October 2026 · branch `main`, local. Pushed: no. Deployed: no.**

⛔ **THERE IS SQL AND IT HAS NOT BEEN RUN.** `supabase/migrations/20261018_place_picture_library.sql`.
The full text, with read-only checks before and a read-only verify after, is in my chat reply and in
§9. **Nothing in this feature works until you apply it**, and the route says so by name if the columns
are absent.

🔴 **`public.place_pictures` is not dropped, not recreated and not emptied — it is ALTERed.** No stored
picture is deleted by anything in this build.

🔴 **Saved designs render byte-for-byte as they did.** Proved in pixels, on both designs, *with a full
library available* — §7.

---

## 🔴 1 · THE MODEL — AND IT IS A CHANGE OF MODEL, NOT A FEATURE

Until today a place had **one** picture and it meant **one thing**:
`truck_places.event_bg_path` **was** the background of a single-event post there. The picture and the
use were the same fact — so a truck who wanted a pub's logo in the corner of their **weekly** poster
had nowhere to put it.

🔴 **Now a place simply HAS PICTURES** — a logo, a photo, a venue's poster — and one is marked **Main**.
**They are not tied to a post type.** Each **design** decides how it uses them, through the new
"Place picture" item in the shared editor.

⛔ **Which means the old behaviour is now a SETTING, not a shape of the data.** "This place's picture
is the background" is `placement: 'background'` on the single event design. That is precisely what
lets today's designs keep rendering exactly as they do.

---

## 🔴 2 · STORAGE — THE EXISTING TABLE FITS, SO IT IS REUSED

`public.place_pictures` was added on 20261015 for the Places tab, which was deleted the next day. Its
shape is already the library's:

```
truck_id · place_id · path · file_name · bytes · width · height · created_at
```

— "a truck's picture for a place, where the file is, how big it is, what shape it is and when it
arrived", which is §1's list exactly. **What was missing is only the three things §1 names.**

| Added | |
|---|---|
| `is_main boolean not null default false` | ⚠️ `false` for every existing row is correct: nothing has chosen one yet, and the read layer picks the oldest until somebody does |
| `label text` | ⚠️ **nullable, falling back to `file_name`.** The operator renames a picture for display; the file name is what they uploaded and is still what a download is called. **Overwriting `file_name` on a rename would lose the only record of what the file actually is** |
| `sort_order integer not null default 0` | a grid the operator can rearrange needs a number; without one the order is "whatever the database felt like" |

### 2.1 · At most one Main per place, enforced by the database

```sql
create unique index if not exists place_pictures_one_main_per_place_uidx
  on public.place_pictures (place_id) where is_main;
```

🔴 **A partial unique index, and it is safe here BECAUSE NOTHING UPSERTS ON IT** — which the brief asked
me to say, and which this repository already has a rule about: a partial index cannot be an
`ON CONFLICT` target (42P10, learned on 20261013). `place_pictures_path_uidx` is **full** for exactly
that reason — the route upserts on `path` — and the pin's index is partial because it is only ever an
index.

**"Make main" is two UPDATE statements**, never an upsert: clear this place's Main, then set the new
one. ⚠️ **The index is the guard that matters**: without it, two concurrent presses leave a place with
two Mains and the poster picks whichever the read returned first, **differently on different renders**.

`places-tab.cjs` now asserts this directly — exactly one `upsert` on the table, targeting `path`, and
no `onConflict` naming `is_main` or `place_id`.

### 2.2 · RLS and grants brought into line

⛔ **The 20261015 migration enabled RLS and revoked from `anon, authenticated` — but created NO POLICY
and did NOT revoke from `public`.** Every other truck-owned table here uses all three defences, and the
third is the one that does the work: **enabling RLS alone leaves Supabase's default grants in place**,
so the capability is still reachable with the anon key and merely default-denied.

⚠️ **It mattered less when nothing read this table. It matters now**: these rows name storage paths for
pictures a truck uploaded, and this is the table a poster is drawn from.

### 2.3 · Private storage, signed URLs only

The existing private `post-designs` bucket, under the truck's own folder. The browser gets short-lived
signed URLs for **thumbnails only**; the **renderer** is handed bytes as a data URI and takes no URLs
at all. PNG/JPG, 10MB, ≥600px short side — the existing `checkUpload`, from the real bytes.

⛔ **And NO shape rule on upload.** A library picture is a logo or a photo; it is only held to the
design's shape if the operator later asks for it as a **whole background**, which is decided per
picture and shown on the picture. Refusing a pub's square logo for not matching a 4:5 poster would
refuse the commonest thing this feature is for.

---

## 🔴 3 · MOVING THE EXISTING DATA — I PICKED **MAP ON READ**, AND HERE IS WHY

### ⛔ 3.1 · First: I could not run the read-only query, and I will not pretend otherwise

The rules say *"You do NOT run SQL"*. So the brief's *"check with a read-only query first"* and
*"show before/after for Pizza Kitchen"* are given below as **the exact query** and **what the mapping
will deterministically produce from whatever it returns** — not as output I have seen.

**Run this first:**

```sql
-- BEFORE · every place that has a picture today. Pizza Kitchen is id 'test-truck'.
select p.id, p.name, p.short_name, p.area,
       p.event_bg_path, p.event_bg_width, p.event_bg_height,
       (p.event_layout is not null) as has_own_positions,
       (select count(*) from public.place_pictures pp where pp.place_id = p.id) as library_rows
  from public.truck_places p
 where p.truck_id = 'test-truck'
   and p.event_bg_path is not null
 order by p.name;
```

**What the mapping then produces, per row returned, with no further SQL:**

| Before (the query's columns) | After (what the Place pictures screen shows) |
|---|---|
| `event_bg_path = 'test-truck/place-….png'` | one picture, **Main**, labelled **"Event poster"**, pointing at **that same object** |
| `event_bg_width`, `event_bg_height` | the picture's recorded shape, unchanged |
| `library_rows = 0` | the library shows **1**; `place_pictures` still holds **0 rows** |
| `has_own_positions` | unchanged — the own-positions editor is behind the page's quiet link |

⚠️ **A place whose `library_rows` is already > 0** (somebody used the Places tab in its one day of
life) keeps exactly those rows and the legacy picture is **not** added — otherwise it would appear
twice.

### 🔴 3.2 · Why map-on-read is the safer of the two

| | **One-off SQL data step** | **Map on read** ✅ |
|---|---|---|
| Writes production data | **yes**, before anything is tested | **no** |
| Needs `bytes`, which is `not null` and unknown | would have to be joined out of `storage.objects` metadata, or the constraint relaxed | not needed until the row is actually written |
| Two sources of truth | **yes** — the library AND `truck_places.event_bg_path`, both live, free to disagree the moment either is edited | **no** |
| If it is wrong | rows to find and undo | re-read |
| Rollback | the library rows outlive the code | the old columns were never touched |

⛔ **THE SECOND ROW IS THE ARGUMENT.** `resolveDesign` still reads the place's picture out of
`truck_places`. An `insert` would make the library a *second* record of that same picture, and from
that moment the two could disagree — a rename here, a re-upload there. **Mapping leaves exactly ONE
source of truth for today's behaviour until the operator does something**, and the route then
materialises the row (`materialiseLegacy`) so the library takes over.

🔴 **For any given place, only one of the two ever applies. So nothing can drift — by construction,
not by discipline.**

⚠️ **The materialisation is lazy and it is what makes the library editable.** You cannot rename or
un-Main a row that does not exist, so every one of the four mutations calls it first — asserted.

⛔ **And removing a legacy picture does NOT delete the file**, because `truck_places.event_bg_path`
still names it and the place's existing event post still renders from it. Everything else is this
library's own object and goes with its row.

### 3.3 · The migration therefore writes no data at all

Asserted: **no `insert into public.place_pictures`, no `update`, no `alter table public.truck_places`,
no `drop`, no `truncate`, no `delete`.**

---

## 🔴 4 · THE DESIGNS PAGE — "Place pictures"

| | |
|---|---|
| **Heading** | **Place pictures** |
| **Description** | *"Save pictures for a place — a pub's logo, a photo, a festival's poster. Your designs decide where they appear: in a picture box on your weekly or single event post, or as the whole background."* |

⛔ **"Designs for a place" named the OLD model** — a place had one picture and it was a background — so
it named a thing that no longer exists.

| The list | |
|---|---|
| a search box | name or area |
| **No pictures yet (n)** | blank tile · name · town · **ORANGE "Add"** |
| **With pictures (n)** | the Main picture's thumbnail · name · **"town · N pictures"** · outlined **"Edit"** |

🔴 **It sorts on the LIBRARY's count, not on the old `hasPicture` flag.** A place can now have three
pictures and no `event_bg_path`, or the reverse — sorting on the old flag would put a place with a full
library in the "no pictures" group.

⛔ **THE "Own design" TAG IS GONE, AND SO ARE FIVE COPY EXPORTS.** V14.5 removed the grey "Standard"
tag from these rows because *Standard* is the name of an **event type** in this product. The "Own
design" tag that survived it has now gone the same way: a place does not have a design, it has
**pictures**, and the rows worth marking are the ones with **none** — which is a heading over a group,
not a badge on twenty rows. The four `PLACE_DESIGN_BLURB*` exports and `placeDesignFooter` were
**deleted rather than left unused**; an exported sentence nothing renders is one the next person will
believe is on the screen. Thirteen harness checks were aimed at that markup, **three of them still
passing against the dead exports** — they are re-aimed in §10.4.

🔴 **ONE LINE PER ROW AT EVERY WIDTH FROM 390px UP**, by the same mechanism the row it replaces used:
no `flex-wrap`, `min-w-0` + `truncate` on the text block, `shrink-0` on the tile and the button. **The
name is the only thing that gives way.**

🔴 **THUMBNAILS COME FROM ONE BATCHED READ** — `social_overview` calls `readPlaceLibrary` once for every
visible place, and that function issues **exactly one query** (asserted: one `await supabase.from`, with
`.in('place_id', ids)`). Twenty places would otherwise be twenty round trips to draw twenty 28px
squares.

---

## 🔴 5 · A PLACE'S PICTURES PAGE

`‹ Designs` · the place name and town · then the brief's line:

> Pictures for this place. The one marked Main is used automatically; you can pick a different one when
> you make a post.

⛔ **It names both facts an operator needs before uploading anything**: which picture gets used, and
that the choice is not final. Without the second sentence, "Main" reads as "the only one that does
anything" and a truck uploads one picture per place for ever.

| | |
|---|---|
| **The grid** | `repeat(auto-fill, minmax(7rem, 1fr))` — **8 columns at 1100, 2 at 390**, measured |
| **The Main one** | **★ Main** badge **and** an orange ring. The ring is what the eye finds; the badge says why. One without the other is decoration |
| **A wrong-shaped one** | *"Different shape — can't be used as a whole background"*, **on the picture itself** |
| **+ Add picture** | a dashed tile, the same size and shape as a picture, so the grid stays a grid |
| **Clicking a picture** | **Make main · Rename · Remove** |
| **Remove** | a confirm that **names the picture** and says what happens to Main: *"Remove "Pitch photo"? It is this place's Main picture — the next one becomes Main."* |
| **Removing the Main** | promotes the next in the grid's own order, so a library is never left with pictures and no Main |

🔴 **"Own text positions for this place (optional)"** is the quiet link under the grid. It opens the
existing place layout in the shared editor. ⚠️ **That capability is not lost; it is the right size on
the screen now** — it is what the old page *was*, and almost no truck needs it.

---

## 🔴 6 · "PLACE PICTURE" IN THE SHARED EDITOR

One item, **one implementation, both designs** — which is the whole point of part 1's shared editor.

| | |
|---|---|
| **In the left list** | **"Place picture"**, with the sample line **"The place's Main picture"** and an on/off switch |
| **Where** | in the **EACH ROW** group on the weekly design (that is where it is drawn); in the top group on a single event |
| **Default** | ⛔ **OFF**, for new designs and for every design saved before today |
| **On the canvas** | a box you drag and resize exactly like a text box — the same `DraggableBox`, the same snapping |

### 6.1 · The toolbar

| Cell | Weekly | Single event |
|---|---|---|
| **WHERE IT GOES** | **"In each row"** — a statement, not a choice of one | **In a box** / **Whole background** |
| **PICTURE** | Fill the box / Fit inside | ✓ |
| **CORNERS** | Square / Rounded | ✓ |
| **IF A PLACE HAS NO PICTURE** | Leave it out *(default)* / Leave a blank space / **Show your logo** | ✓ |
| **Advanced** | border colour and width, corner radius | ✓ |
| **+ Add place pictures** | ✓ with the real count | — |

⛔ **The weekly post has no "Whole background", and the type does not say so — the editor does.** "Whole
background" means *this event's* background; a weekly poster is seven events on one picture, so there
is no "the place" whose picture could replace it. A stored `'background'` on a weekly layout is read as
`'box'` rather than refused — the worst case is a design that draws its picture in the box it already
has coordinates for.

⛔ **"Show your logo" is offered only to a truck that has one.** The logo is
**`trucks.logo_storage_path`, in the PUBLIC `truck-media` bucket** — `lib/truck-logo.ts` is the one
resolver, and that is the answer to the brief's "find out where it's stored and name it". ⚠️ **It is
still read server-side and inlined as a data URI** rather than linked: the renderer does no I/O and
takes no URLs, and handing it a public link would be the one exception to a rule worth more than the
bytes saved. **An option that silently draws nothing is worse than an option that is not there**, so if
there is no logo the choice is absent — and a stored `logo` on a design whose logo was later removed
falls back to drawing nothing.

### 6.2 · "+ Add place pictures", with the real number

🔴 **It answers the question the setting raises.** A truck who switches this on and sees six empty rows
has no way to find out why. The toolbar says **"16 of your 20 places have no picture yet"** and the
orange button opens Designs › Place pictures — where those places are already first.

### 6.3 · The grey placeholder is CHROME, not a render

⛔ **Drawn only while the picture box is SELECTED**, half-transparent, behind its own outline. The PNG
underneath is the truth — if the preview event's place has a Main picture the renderer has already
drawn it there. While the operator is **positioning** the box they need to see its extent even when the
place has nothing, which is the one case the renderer deliberately draws nothing for.

---

## 🔴 7 · THE RENDERER

**Fetched before the render starts** — the same discipline as the fonts and the background, and for the
same reason: the renderer is synchronous and a render that fetched could time out on somebody's poster.
⚠️ **One download per DISTINCT place**, not per row: a week with three events at the same pub downloads
that logo once.

### ⛔ 7.1 · satori renders `backgroundSize: cover` and `contain` IDENTICALLY — measured

This is the one real surprise in this build, and it was found by **a pixel assertion failing**, not by
reading documentation.

| Approach | 400×100 picture in a 60×60 box |
|---|---|
| `backgroundSize: 'cover'` vs `'contain'` | 🔴 **byte-for-byte identical** |
| either vs an explicit `60px 15px` | different |
| **`<img>` with `objectFit: 'cover'` vs `'contain'`** | ✅ **different** |

So "Fill the box" and "Fit inside" would have been **one setting with two labels** — the exact "a
setting that does nothing" failure part 2's font checks exist to catch.

🔴 **The picture is therefore an `<img>` with `objectFit`, inside a clipping div** that keeps the
corners, the border and the `overflow: hidden`. ⚠️ `paint`'s argument against `<img>` for the poster's
own backdrop — *"it participates in layout and could be displaced by a sibling"* — does not reach here:
this `<img>` is the **only child** of an absolutely positioned, fixed-size div.

### 7.2 · What each setting draws

| | |
|---|---|
| **In each row** (weekly) | the row's **first** entry's place. A stacked day has two events and one box; the first is the one whose name and time are at the top of the row |
| **A day off** | ⛔ **no picture box at all** — there is no place to have one, which is a different thing from a place with none, so `ifMissing` does not apply |
| **Whole background** (single event) | ⛔ **not drawn by the renderer at all.** The route swaps the background bytes, which is the same mechanism a place's own picture has always used. Drawing it twice would put the venue's poster on top of itself |
| **`omit`** *(default)* | nothing. **The only safe default** — most trucks will have a library for two venues out of twenty, and a design that left a hole on every other row would look broken on a poster they never previewed |
| **`blank`** | the box, its border and its space, with nothing in it — for a design whose layout depends on the gap |
| **`logo`** | the truck's own, falling back to nothing |

### ⛔ 7.3 · The shape rule for "Whole background"

The design's text boxes were placed on the **design's** canvas, so a differently shaped picture puts
every one of them somewhere else — **on artwork that goes straight to customers.** So the place's Main
picture is held to the existing **1%** rule, and `usableAsWholeBackground` **defers to**
`backgrounds.ts` rather than restating it. ⚠️ A place with its **own positions** is exempt, which is the
existing stage-2b rule.

A picture that fails: **that event uses the standard background**, a render warning says so, and the
place's pictures page marks that picture. Asserted at the tolerance boundary — 0.5% passes, 5% fails —
so changing either rule alone fails the check.

### ⛔ 7.4 · A private event NEVER shows a place picture — two defences, both server-side

1. **`entryFor` nulls a private booking's `placeId`.** It already nulled its name and its town, *"before
   the place is consulted at all"*; part 3 gives a place pictures, which the renderer finds **by that
   id**. Leaving it set would have let a private booking draw the venue's logo on a public poster — the
   one thing redacting the words was for.
2. **The renderer refuses on `entry.isPrivate`.** Explicit, so the absence is assertable rather than
   accidental.

⚠️ **Either alone would be enough; neither alone would be checked.** Both are.
⚠️ **Nothing else loses anything by (1)**: `placeId`'s only other readers are `eventPostContext` (a
private event cannot have a single-event post — `isSinglePostBlocked` refuses first) and the design
preview picker (which filters private events out before it asks).

---

## 🔴 8 · MAKING A POST

| | |
|---|---|
| **Single event** | when the place has **more than one** picture **and** the design has the item switched on, the modal shows the pictures as small tiles, **defaulting to Main** |
| **Weekly** | **always each place's Main.** Seven rows would be seven choosers, and "used automatically" is exactly the promise the pictures page makes |

⛔ **The chosen picture is checked against THIS place's own library.** A picture id in a request is a
string a client sent; a poster must not be able to draw any object in the bucket because a caller named
it. ⚠️ **It is for this post only and is never stored** — the same rule the per-post note follows.

---

## 📜 9 · THE SQL

`supabase/migrations/20261018_place_picture_library.sql` — **ALTER only.** Full text in my chat reply,
with read-only checks before and a read-only verify after. In summary:

| | |
|---|---|
| **Added** | `is_main` · `label` · `sort_order`, plus a `label` not-blank CHECK |
| **Indexes** | `place_pictures_one_main_per_place_uidx` (**partial**, `where is_main`) and a grid-order index |
| **RLS** | the service-role policy and `revoke … from anon, authenticated, public` — the 20261015 migration had neither |
| **Comment** | replaced; the old one says the opposite of what is now true |
| **Not touched** | `truck_places`, `truck_events`, `venues`, and every ordering, KDS and payments table. **No `insert`, no `update`, no `delete`, no `drop`** |
| **Last line** | `notify pgrst, 'reload schema'` |

---

## ✅ 10 · WHAT WAS RUN

| | |
|---|---|
| `tsc --noEmit` | **clean** |
| `npx next build` | **✓ Compiled successfully** |
| **ESLint — product code** | **identical: 774 errors in `app`+`components`+`lib` both ways.** Warnings +2, both `<img>` — the project's baseline class |
| **Full sweep** | `node scripts/run-harnesses.cjs` — **98 run · 98 passed · 0 failed** |
| **Not in the sweep** | `scripts/social-posts-render.cjs` by hand (needs a build, Chromium **and** WebKit) — **Chromium + WebKit, all measurements pass** |
| **New harness** | `scripts/place-pictures.cjs` — **75 checks**, registered (**98** listed) |
| **Browser** | a place's pictures page in **WebKit** at **1100×800 and 390×844**, with its own control |

### 10.1 · The brief's eight unit checks, each one named

| Asked for | Where |
|---|---|
| one Main per place | §1 — including a library with **no** Main, and the deterministic fallback |
| the mapping keeps Pizza Kitchen's place post byte-identical | §6 — **a pixel comparison**, on both designs, with a full library available, and proved able to fail |
| "In a box" and "Whole background" both render, pixels differ | §5 and §4 — and fill/fit, corners and border each differ too |
| the shape rule falls back correctly | §4 — at the tolerance boundary, both sides |
| the weekly row picture repeats per row | §5 — a one-event week vs a two-event week, in pixels |
| a private event never gets a place picture | §3 — **both** defences |
| the Designs list sorts no-pictures first | §8 — and on the **library's** count, not the old flag |
| thumbnails are batched | §8 — one query in `readPlaceLibrary`, asserted by counting `await supabase.from` |

### 10.2 · Five faults found

1. ⛔ **satori treats `cover` and `contain` as the same thing** — §7.1. Found by a pixel assertion
   failing. Fixed with an `<img>` + `objectFit`, also measured.
2. ⛔ **An action named after a table broke a sweep.** `action: 'place_pictures'` made
   `places-tab.cjs`'s "no component reads `place_pictures`" report a component that reads nothing of
   the kind — a string cannot say which of the two it is. Renamed `place_picture_list`, which also
   matches its four siblings. **The action name was arbitrary; the sweep is not.**
3. ⚠️ **A slice with an ambiguous end anchor, in SQL this time.** The table comment is extracted to its
   terminating `';` because the comment's own prose contains a semicolon, and a bare `;` cut it off
   after seventy characters — failing on correct SQL.
4. ⚠️ **A whole-file absence test caught the quotation that explained it.** "The comment no longer says
   *THEY DO NOT AFFECT POSTS*" failed because the migration's header **quotes** that sentence to say why
   it is being replaced. Scoped to the statement. **Seventh variation of "a comment interfered with a
   check on code", and the first in SQL.**
5. ⚠️ **A split string constant is never contiguous** — a regex for a whole sentence failed on a
   two-line concatenation. Matched in halves, including the join.

### 10.3 · Sixth fault: **three checks were passing on code nothing renders**

The first full sweep came back **96 of 98**, with eleven checks failing in `social-posts.cjs` and two in
`design-editor.cjs` — all of them aimed at Box 3's old markup: the `pl.hasPicture ? 'Edit' : 'Design'`
button, the `<DesignTag>` element, the `placeDesignFooter` sentence.

⛔ **The eleven that failed were the easy half.** Three others went on **passing** — "Designs › Designs
for a place", "…and it says what a place design REPLACES", and "the two bold sentences are parts plus a
flattened whole" — because the strings they look for were still **exported from the copy module** and
simply no longer rendered by anything. A check that reads a copy module and not the screen cannot tell
"on the screen" from "in the file", and a green tick on a sentence no operator can see is worse than a
red one.

🔴 **So the dead exports were deleted, not left alone**, and the checks re-aimed at what Box 3 now says.
`scripts/social-posts-render.cjs` had the same fault in its strongest form: it `lift`s class strings out
of the component, and one of them — the "Own design" tag — no longer existed, so **the harness could not
build its fixture at all**. It had also been drawing every place-row button with the *outlined* class,
which made *"exactly two buttons are orange"* a claim that fixture **could not have failed**. It lifts
the orange class now and renders both kinds of row.

### 10.4 · The re-aimed checks, named

| Was | Is |
|---|---|
| `"Design"`/`"Edit"` and the tag follow `hasPicture` | `"Add"`/`"Edit"` and the count follow `pictureCount`, from the server |
| no `uppercase` **anywhere** in the component | `uppercase` on **exactly** the two group-heading rows, named by their markers — the whole-file ban would have forced a worse heading to keep a check green |
| 5 literal `<Box>` titles + 1 constant | 4 + 2, both constants named |
| the sort reads `hasPicture` | it reads `pictureCount`, **and the old flag decides nothing between `designList` and `postList`** |
| the tag sits after the name | the row is tile → name → count → button, **and `DesignTag` is gone** |
| three bolded constants | **exactly** `INTRO_DESIGNS_WORD`, `INTRO_MAKE_WORD`, `USED_FOR_LABEL` — the third named as the one allowed exception |
| the footer names the single event post design | it counts pictures, from the copy module, **and `placeDesignFooter` exists nowhere** |
| Box 3's blurb, two checks | Box 3's live description, three checks |
| the absence list included a sentence that no longer exists anywhere | **every sentence in it must be present in the copy module first** — otherwise the absence proves nothing |
| fixture: ghosted row buttons, hard-coded box 2 and box 3 headings | the real orange class, and both headings **lifted** from the copy module |

### 10.5 · One documented promise deliberately reversed

`places-tab.cjs` asserted *"NOTHING in app/, lib/ or components/ reads `place_pictures`"*, and the
table's own comment said *"THEY DO NOT AFFECT POSTS"*. **Part 3 makes that table the library**, so both
are now false. The assertion is **re-aimed to the claim that still matters** — read in **exactly one**
server file, by **no** component — and the migration replaces the comment. ⚠️ **Flagged rather than
quietly deleted**, because an assertion that is removed to let a change through is how a guard stops
guarding.

---

## 🧪 11 · THE LOCALHOST TEST LIST — PIZZA KITCHEN ONLY, SAFARI ON MAC

### ⛔ 11.0 · Run the SQL first

| # | Do |
|---|---|
| 1 | Run the **read-only BEFORE query** (§3.1) and keep its output |
| 2 | Run `supabase/migrations/20261018_place_picture_library.sql` |
| 3 | Run the **verify** block; confirm the three columns, the **partial** one-main index, the policy and the revoke |
| 4 | `npm run dev`, open `/manage/<Pizza Kitchen's token>` → **Schedule › Social posts → Designs**, **⌘⌥R** |

⚠️ **Until step 2 is done**, the box shows every place as having no pictures and an upload is refused by
name.

### 11.1 · The Designs box

| # | Do | Expect |
|---|---|---|
| 5 | Look at box 3 | heading **Place pictures**, and the two-sentence description |
| 6 | Look at the list | **No pictures yet (n)** first, then **With pictures (n)** — both drawn in small capitals by the stylesheet, not typed in capitals |
| 7 | Check a place from your BEFORE query | it is under **With pictures**, with its existing picture as the thumbnail and **"town · 1 picture"** |
| 8 | Look at the buttons | **ORANGE "Add"** in the first group, outlined **"Edit"** in the second |
| 9 | Search for a place by name and by town | both match; the groups and their counts follow |
| 10 | Narrow the window to about 400px | **every row is still ONE line** — the name truncates |

### 11.2 · A place's pictures

| # | Do | Expect |
|---|---|---|
| 11 | Press **Add** on a place with none | its page: ‹ Designs, the name, the town, and the "Main is used automatically" line |
| 12 | Press **+ Add picture**, choose a PNG | it appears, with **★ Main** and an orange ring — the first one is always Main |
| 13 | Add a second and a third | they appear; the first keeps ★ Main |
| 14 | Click the second picture | a menu: **Make main · Rename · Remove** |
| 15 | **Make main** | the ring and the badge move to it |
| 16 | **Rename** the third to `Festival poster` | the label changes under the tile |
| 17 | **Remove** the Main one | a confirm that **names it** and says the next becomes Main. After it, another has ★ Main |
| 18 | Try a 12MB file, then a PDF | refused with a plain sentence; nothing is added |
| 19 | Press **Own text positions for this place (optional)** | the existing editor opens |

### 11.3 · The existing picture is untouched

| # | Do | Expect |
|---|---|---|
| 20 | Open the place from step 7 | **one** picture, **★ Main**, labelled **"Event poster"** |
| 21 | Make a post for an event there (Make a post › Post for a place) | **the poster looks exactly as it did before today** |
| 22 | Rename that picture to `Pub artwork` | it renames — this is the moment the row is written |
| 23 | Make the post again | **still identical.** The picture is the same object |

### 11.4 · The single event design

| # | Do | Expect |
|---|---|---|
| 24 | Designs › **Edit single event design** → the left list | a **Place picture** item, **switched off**, with "The place's Main picture" |
| 25 | Switch it **on** | a draggable box appears; the preview shows the preview event's place's Main picture |
| 26 | Drag it and resize it | it moves and resizes like a text box, and snaps to the middle |
| 27 | **PICTURE → Fit inside**, then **Fill the box** | the picture letterboxes, then crops |
| 28 | **CORNERS → Rounded** | the corners round |
| 29 | **Advanced → Draw a border** | a border appears; the width slider changes it |
| 30 | **IF A PLACE HAS NO PICTURE** | **Leave it out · Leave a blank space**, and **Show your logo** **only if you have uploaded a logo in Settings** |
| 31 | Save, ‹ Designs, reopen | everything is still set |
| 32 | **WHERE IT GOES → Whole background** | the box disappears from the canvas — there is nothing to position — and the preview uses the place's picture as the whole background |
| 33 | Add a **square** picture to that place and make it Main | on its pictures page it reads *"Different shape — can't be used as a whole background"* |
| 34 | Preview that event | the **standard** background is used, with a warning saying why |
| 35 | Make it Main again with a correctly shaped picture | the background is that picture |

### 11.5 · The weekly design

| # | Do | Expect |
|---|---|---|
| 36 | Designs › **Edit weekly design** → the left list | **Place picture**, under **EACH ROW** |
| 37 | Switch it on | a box appears **in row 1**, and the preview draws a picture **on every row that has an event** |
| 38 | Look at **WHERE IT GOES** | **"In each row"** only — there is no "Whole background" |
| 39 | Look at the toolbar's right-hand side | an orange **+ Add place pictures** and a line like **"16 of your 20 places have no picture yet"** |
| 40 | Press it | Designs › **Place pictures**, with the places that have none first |
| 41 | Go back, set **IF A PLACE HAS NO PICTURE → Leave a blank space** with a border | the rows whose places have nothing show an empty bordered box |
| 42 | Set it back to **Leave it out** | those rows show nothing |
| 43 | Save, make this week's post, download it | the pictures are on the real poster |

### 11.6 · Choosing a picture when you post

| # | Do | Expect |
|---|---|---|
| 44 | Make sure a place has **three** pictures and the single event design has the item **on** |  |
| 45 | Make a post for an event at that place | a **"Picture for this place"** panel with three tiles, **Main selected** |
| 46 | Press a different tile | the poster redraws with that picture |
| 47 | Close and reopen the modal | it is back to **Main** — the choice is for that post only |
| 48 | A place with **one** picture | **no panel** — there is nothing to choose |
| 49 | Switch the design's Place picture **off** and reopen | **no panel**, even with three pictures |

### 11.7 · A private event

⚠️ **Needs a private event in Pizza Kitchen's week.** If there is none, mark these **not tested**.

| # | Do | Expect |
|---|---|---|
| 50 | Make a post for that event | **refused** — a private event has no single-event post. Unchanged |
| 51 | Weekly make screen → **Show private events** on, with the weekly Place picture on | the private row shows **"Private event"**, its date and times — and **NO picture**, even if that venue has a full library |
| 52 | Download the image and look hard | the same. No logo, no photo, no venue name, no town |

### 11.8 · Narrow

**Develop › Enter Responsive Design Mode → 390 × 844.**

| # | Do | Expect |
|---|---|---|
| 53 | Designs › a place's pictures | the grid is **two across**, every tile square and the same size |
| 54 | Tap a picture in the **right-hand** column | its menu opens **inside the screen** |
| 55 | Try to scroll the page sideways | **it does not** |
| 56 | The weekly design, Place picture selected | the toolbar wraps; **+ Add place pictures** and its line are both on screen |

---

## 📋 12 · OPEN ITEMS FOR YOU

| | |
|---|---|
| ⛔ **THE SQL** | **not run.** Inline in my chat reply |
| ⛔ **I COULD NOT RUN THE "BEFORE" QUERY** | the rules forbid it. §3.1 gives the query and exactly what the mapping produces from its output |
| **Deploy** | **not done — you deploy by hand** |
| ⚠️ **`truck_places.event_bg_*` is still live** | it is the source of truth for a place whose library has not been touched, and the whole reason nothing can drift. The day you want it gone is a separate, deliberate migration |
| ⚠️ **A legacy picture's FILE is never deleted** | removing it from the library removes the row only, because the place still names that object |
| ⚠️ **One picture at a time** | no bulk upload; the existing three-call flow per file |
| ⚠️ **The weekly row picture uses the row's FIRST entry** | a stacked day has two venues and one box |
| ⚠️ **"Show your logo" needs a logo in Settings** | `trucks.logo_storage_path`. If you have none, the option is correctly absent |
| From V14.7 | `countryForTruck()` still returns `'GB'`; part 2's font SQL is also still unrun if you have not applied it |
