# Social media, round 2: tab descriptions, a poster and a picture, tags and saved captions

**8 October 2026.** Worked on `main`, locally. **Nothing pushed and nothing deployed.** No database was
touched — I do not run SQL.

---

## 0 · READ THIS FIRST

🔴 **One migration to run: `supabase/migrations/20261020_poster_picture_tag_captions.sql`.** Its full
text is in the chat reply, in the three blocks the rules ask for: read-only checks, the change,
read-only verify.

⚠️ **Run block 1 and read `1c` before running block 2.** It is the one query that can tell you about a
behaviour change, and there is exactly one.

### The one behaviour change, named up front

⛔ **`event_picture_id` used to mean "the location's event image", and whether that image was a PHOTO
cropped into a box or the WHOLE POSTER was decided by the DESIGN.** It is always the **poster** now, so
it is held to the 1% shape rule.

🔴 **Query `1c` lists any location whose current event image is not the standard design's shape.** Those
are the ones that will stop being used until replaced. ⚠️ **Nothing is deleted either way** — the row
and the file stay, and re-uploading one the right shape is one press.

⚠️ **If `1c` returns no rows, there is no behaviour change at all.** I expect none for Pizza Kitchen,
but I cannot run the query, so you are the one who finds out.

### Until the SQL is run

| | Behaviour before block 2 |
|---|---|
| The three headings and descriptions | ✅ work |
| Designs / Create a post widths | ✅ work |
| Location settings · the table | ✅ lists every location; the POSTER column shows a legacy image where there is one |
| Upload / Replace / Remove / "Use it on" / the tag | ⛔ refuse with a sentence naming the migration file |
| The caption editors | ⛔ the save refuses with the same sentence; the editor still shows the seed |
| Every existing post | ✅ **byte-identical** |

---

## 1 · Section by section

| § | Asked for | State |
|---|---|---|
| 1 | each sub-tab gets its own heading and description | ✅ |
| 2 | Designs matches Create a post's widths, one shared constant | ✅ measured at 528/528 |
| 3 | a narrower Locations table, "Locations" card, POSTER · PICTURE, "No images n" | ✅ measured at 27.7% |
| 4 | event poster + location picture, with "Use it on" | ✅ code; **SQL not run** |
| 5 | a social media tag per location | ✅ code; **SQL not run** |
| 6 | captions in Create a post, saved, with label chips | ✅ code; **SQL not run** |
| 7 | the caption travels with the picture, and one grey line | ✅ |
| 8 | "Powered by HatchGrab" on all four posters | ✅ **confirmed, no fix needed** — §7 |
| 9 | checks | ✅ 109 unit + 2-engine render, all green |
| 10 | your test list | §10 |

---

## 2 · §1 · Each sub-tab says what it is for

⛔ **A shared "Social posts" heading and a shared intro stood here, and between them they answered the
wrong question twice.** The heading named the **tab** — which the pill bar directly above it already
names, in the same words, highlighted. The intro ("Designs is where you upload… Make a post puts…") was
a map of two areas that are now three pills in that bar.

🔴 **A page that explains its own navigation is a page whose navigation is not explaining itself.**

⚠️ **One block choosing by `area`, not three copies of the markup.** The three headings must stay the
same size and the same distance from the bar, and that is a fact about one element rather than a habit
shared by three — which the render harness measures (`seenHeadingSizes.size === WIDTHS.length`).

---

## 3 · §2 and §3 · Widths

### Designs and Create a post share one constant

⛔ **They were two different grids and it showed.** Create a post was two equal halves across the full
content width; Designs was `minmax(200px,320px) minmax(200px,320px) minmax(0,1fr)` — two narrow columns
and an **empty third track**, left behind when "Location images" moved out of that area on 7 October. So
two screens one click apart laid their boxes out at different widths, and the pictures in the narrower
one were smaller for a reason that had stopped existing.

🔴 **`TWO_HALVES_GRID`, used by both.** A shared breakpoint written twice is a shared breakpoint until
someone edits one of them.

**Measured** (WebKit and Chromium, 1100px): Create a post `528/528`, Designs `528/528` — same widths,
same left and right edges, each pair two equal halves. ⚠️ **Asserted as a comparison between two
renders**, which is the only way to say "the same": a source check can see one shared constant and still
be wrong about what the layout engine does with it on two different pages.

### A narrower Locations table

⛔ **It was `minmax(0,1fr) minmax(280px,420px)`** — the table took everything the pane did not, which at
1440 is two thirds of the page for three columns, two of which are 24px wide. **The pane is where the
work happens.**

✅ **`minmax(280px,1fr) minmax(0,2.6fr)`** — the brief's own ratio. **Measured at 1100: the table takes
27.7% of the row**, inside the brief's "about a quarter to a third". ⚠️ It is a **ratio**, so it holds at
1728 as well; the 280px floor stops a long venue name squeezing the column to nothing before it
truncates.

⚠️ **The card is headed "Locations" and carries no description** — the page description directly above
it says what the screen is for, and the same sentence twice on one screen is exactly what a per-tab
description was added to stop. The pill and the page heading stay "Location settings".

---

## 4 · §4 · An event poster and a location picture

### The defect this removes

⛔ **Under the old model, whether a location's event image was a photo or a poster was decided by the
design.** A truck who added a photo space to their single event design silently changed what every
location's uploaded image meant — a setting on one screen rewriting the meaning of files uploaded on
another.

🔴 **The truck chooses now, and the two things have two names:**

| | What it is | Shape rule | Where it is drawn |
|---|---|---|---|
| **Event poster** (optional) | a full poster for events at that location | **must match** the standard design (1%) | replaces the standard design as the whole background; the renderer adds the date, times and "Powered by HatchGrab" |
| **Location picture** (optional) | a logo or photo | **any shape** | the **"Use it on"** radio: Weekly post · Single event posts · Both |

### Storage — the brief's suggestion, taken, and why

✅ **Exactly as you suggested**: `event_picture_id` = the poster, `weekly_picture_id` = the picture, plus
`truck_places.picture_use text check in ('weekly','event','both') not null default 'weekly'`.

⚠️ **The columns are NOT renamed.** A rename is a drop-and-add as far as PostgREST's cached schema,
every select string and every harness assertion is concerned — and the rules forbid dropping a column.
The names are slightly behind the meanings; the column comments and `lib/weekly-post/place-pictures.ts`
are the record of that, at the database and at the point of reading.

**Why `picture_use` is a column and not a third reference:**

1. ⛔ **It is a property of the choice, not of an image.** The same file could be a weekly logo for one
   location and an event photo for another.
2. 🔴 **Three values, exactly, and the database says so.** A `check` is the only place a fourth can be
   refused without every reader defending against it.
3. ⚠️ **`not null default 'weekly'` means every existing row is already answered — and answered the way
   the old model behaved.** The default is not a guess; it reproduces today exactly, which is what makes
   the migration safe to run before the code that reads it ships.

⚠️ **The alternative and why it loses:** two booleans (`picture_on_weekly`, `picture_on_event`). It
allows **both false** — a picture uploaded and used nowhere, a way to do work that produces nothing and
get no error. The radio has no such state, and the column should not be able to represent one the UI
cannot produce.

### The mapping, and the one UPDATE

🔴 **There is exactly one `update` in the migration and it touches one column on one set of rows.**

> A location whose two slots pointed at the **same** picture row was a truck saying "use this image for
> both jobs" — the old "Use the event photo here too" link was the only way to produce that state. Under
> the new model that means "this is both my poster and my location picture", so the picture half should
> keep being used in both places. `'both'` is the honest translation; leaving it at `'weekly'` would
> silently stop drawing it on event posts.

Every other row keeps the default, which reproduces today exactly. Queries **1b** (before) and **3c**
(after) are the same shape so you can diff them, and **3d** asserts the update did that and nothing else.

### The resolver — one function, every case

🔴 **`planEventImages()` owns the whole order**: this post's own image > the location's event poster >
the standard design, with the picture in the design's photo space when `picture_use` allows it.

⛔ **A poster beats a picture on an event post** — the poster *is* the background, so its photo space
would be a hole punched in the truck's own artwork. The screen says so in one grey line.

⚠️ **A one-off does NOT beat the picture, and I asserted that the wrong way round first.** Driving it
settled it: a one-off replaces the **picture**, never the design — `resolveDesign`'s own note says it
"uses whichever positions it would otherwise have had" — so the date, the time, the place **and** the
photo space are all drawn on top of it. Singling the photo box out would make it the one box a one-off
silently removes. The brief states the poster rule explicitly and is silent on this one, so it takes the
consistent answer.

⛔ **A private event gets neither, ever** — asserted as its own case, because "the caller will not do
that" is not a guarantee a renderer should rely on.

### A real bug the refactor produced, and how it was caught

⛔ **`placePictureSources` took a `slot` and I filtered on `slot === 'weekly'`.** But that function only
ever fetches the location **picture** — the poster is a background swap, not a box image — so **both**
callers pass the weekly slot. The filter therefore dropped every event-only picture out of the photo
space it had just been told to draw.

🔴 **The parameter is the SURFACE now**, because `picture_use` is applied on the weekly poster and has
already been applied by `planEventImages` on the event one. The harness asserts the parameter's name and
both call sites.

### Legacy

⚠️ **`event_bg_*` still fills the POSTER role exactly as today**, mapped on read — unchanged from
V15.0, and the asymmetry is unchanged too: the poster slot falls back to it, the picture slot does not.

---

## 5 · §5 · The social media tag

`truck_places.social_tag`, nullable text, **no `check` constraint** — the rules live in one function,
`normaliseSocialTag()`:

| Input | Result |
|---|---|
| `  buresmusicfest  ` | `@buresmusicfest` |
| `@buresmusicfest` | `@buresmusicfest` (no second `@`) |
| `` (cleared) | `null` — **not an error**; clearing is how a truck removes a tag |
| `bures music fest` | ⛔ refused: *"A tag can't contain spaces. Use the handle on its own, like @buresmusicfest."* |
| `@a@b` | ⛔ refused: *"A tag can only have one @, at the start."* |
| 61 characters | ⛔ refused: *"That tag is 61 characters. The limit is 60."* |

⛔ **Whitespace is refused rather than stripped.** "@bures music fest" is not a handle with the spaces
taken out — it is somebody typing a **name** into a handle field, and silently turning it into
"@buresmusicfest" would put a handle that may not exist into a published caption.

🔴 **No `check` on the column, deliberately.** A constraint would be a second rule that could drift from
this one, and the one with the better error message would not be the one that fired. ⚠️ And the length is
not `varchar(60)` for the same reason: a truck pasting a 70-character handle should see a sentence, not
a 22001 from the driver.

⚠️ **The normalised value comes back and replaces what was typed**, so an operator who types
`buresmusicfest` sees `@buresmusicfest` and learns the rule rather than being corrected by a caption
three days later. ⛔ **Never shown on a private event** — the server sends no place for one.

---

## 6 · §6 · Captions

### Where they live

`truck_post_designs.caption_template`, per truck per kind. ⛔ **The grain is already exactly right**:
that table is keyed `(truck_id, kind)` with kind in `('week','event')`, which is precisely one caption
per truck per post type. A new table would be a second row with the same key and a join to reach it —
and every screen that loads a caption has already loaded the design row it belongs to.

### `null` is not `''`

🔴 **`null` means "nobody has set one"; an empty string is a caption the truck deliberately emptied.**
Those must not be the same value, which is why the column has no `default ''`.

⛔ **The seed is computed on READ and never written.** The moment `social_overview` wrote a seed, that
distinction would be gone — a truck who later cleared their caption would be indistinguishable from one
who had never touched it, and the next release's better default could never reach them. The editor sees
text either way, so nothing about the screen gives it away; `saved: false` is what tells it not to show
a tick.

### The labels, and the chips

| Weekly | Single event |
|---|---|
| + Week dates · + List of days · + Order link | + Place · + Day & date · + Times · + Order link · + Location tag |

⛔ **Never raw codes.** `lib/weekly-post/caption-template.ts` is the only module that knows a token is
spelled `{place}`; the editor draws each as a small pale-orange chip.

🔴 **The editor is a `contentEditable` div with the chips as `contenteditable={false}` spans**, and the
browser's own editing engine does the rest. That is the whole trick: a false-editable inline element
inside an editable host is treated by every engine as **one character** — Backspace deletes it whole,
the caret steps over it, typing on either side puts text on either side. **Which is exactly what the
brief asks for, and it is the browser's behaviour rather than ours to maintain.**

⚠️ **The two obvious alternatives, and why both lose:** a `<textarea>` shows `{place}`, which the brief
forbids outright; a real rich-text editor needs a selection model, a paste sanitiser and an undo stack —
a component, not a feature.

⛔ **React renders it once and never again from state.** A controlled `contentEditable` is the classic
way to destroy a caret: React re-renders, the DOM node is replaced, the cursor jumps to the start on
every keystroke. `onInput` serialises the DOM and hands the string to the debounced save; the `key`
changes only when a genuinely new template arrives.

⚠️ **The value is read back by walking the nodes, not from `innerText`** — which would give the chips'
**labels** ("Place") instead of their tokens, so the caption would save as the word a chip displays.
⚠️ **`<div>` and `<br>` both mean a newline**: WebKit wraps a new line in a `<div>` and Chromium inserts a
`<br>`, so a reader that knew only one would lose every line break in the other engine.

⚠️ **Paste is forced to plain text.** Without it, pasting from a word processor brings fonts, colours
and `<style>` into a field whose value is read back as text — and a pasted
`<span contenteditable="false">` could masquerade as a chip.

### The missing-label rule — the hard part

⛔ **The brief's line: "if the location has no tag, the label disappears cleanly (no stray space or
'@')".** A naive replace leaves two spaces, or a line that is nothing but a space.

🔴 **The rule, worked out line by line:** *a line whose labels are **all** empty is dropped entirely; a
line with at least one filled label keeps its words, and each empty label takes its surrounding spaces
with it.*

⚠️ **The second half is what my first draft got wrong, and driving it is what found it.**
`Order ahead: {order-link}` with no ordering address came out as the dangling `"Order ahead:"`. ⛔ That is
worse than no line at all — and **`caption.ts` has always agreed**, because it guards that line with
`if (orderUrl)`. 🟢 So the template reproduces today's behaviour exactly, which is what "nothing changes
until the truck edits it" requires.

⚠️ **And it does not drop the event line when only the tag is missing** — that line also holds `{place}`,
`{day-date}` and `{times}`, so one empty label closes its own hole and the sentence survives. A blunter
"drop any line containing an empty label" would have deleted the whole post.

⛔ **A separator with nothing left to separate goes with it.** `…{day-date}, {times}.` with no times left
`…Tue 13 Oct,.` — and `caption.ts` writes that comma as part of the times, not of the sentence.

### The seed fills byte-identically

🟢 **Driven, not claimed:** `fillCaptionTemplate(seedEventTemplate(name), eventCaptionValues(...))` is
compared character for character with `eventPostText(...)` and matches.

⚠️ **Including the relative wording.** `{day-date}` carries `whenPhrase` — "tonight", "tomorrow", "on Tue
13 Oct" — not a bare date. ⛔ **My first draft used `shortDateTextFor`**, which would have changed what
every truck posts; this check is what catches it.

⚠️ **The seed deliberately carries no `{location-tag}`**: today's caption does not mention a handle, so
seeding one would change what every truck posts. The label is one press away.

⛔ **A cancelled event keeps `eventPostText`.** That branch is an apology with **no ordering link** —
sending customers to order from an event that is not happening is the one thing this text must never do
— and a truck's own template could not be trusted to say it.

⚠️ **The weekly note is appended, not templated.** It is a per-week thing typed on the make screen; a
chip for it would be a chip for something that changes every time.

---

## 7 · §7 and §8 · Sharing, and the mark

### Sharing

✅ **The tap-safe order is unchanged**: clipboard first (writing *checks* activation, sharing *consumes*
it), then `navigator.share`, synchronously, no `await` anywhere in front of either.

🔴 **`canShare({ files, text })` is asked SEPARATELY from `canShare({ files })`.** `canShare` is specified
to answer on the exact data it is given, so a platform that takes one may refuse the other — asking once
and sending more than was asked about is how a share that worked yesterday starts throwing.

⚠️ **The clipboard write happens either way**, because Facebook and Instagram take the file and drop the
text whatever `canShare` says. ✅ One grey line under the buttons says exactly that, and it names the two
apps rather than saying "some apps": an operator whose caption did not arrive needs to know whether they
did something wrong, and there they did not.

### "Powered by HatchGrab" — confirmed, nothing to fix

🟢 **All four paths already draw it, and I checked rather than assumed.** Four paths, **two** renderers:
the weekly post is `renderWeeklyPost`; the standard single event post, a location's event poster and a
one-off upload are all `renderEventPost` with different **bytes** behind the same boxes. There is exactly
one `renderEventPost` call site on the route, which is why the three event paths cannot differ.

🔴 **Each renderer pushes the mark LAST**, which is what puts it above the darken layer (`darkenEl` is
pushed early, before the text). ⚠️ **Asserted on the ORDER, not on presence** — a mark pushed before the
darken would still be in the file and would still be invisible on a darkened photo. And it carries its
own shadow when the design asks for readability.

---

## 8 · §9 · Checks

| | |
|---|---|
| `npx tsc --noEmit` | ✅ clean |
| `npx next build` | ✅ Compiled successfully |
| `npx eslint` on every file touched | ✅ 0 errors, 0 warnings |
| `node scripts/place-pictures.cjs` | ✅ **109** |
| `node scripts/social-posts.cjs` | ✅ 104 |
| `node scripts/weekly-post.cjs` | ✅ 223 |
| `node scripts/design-editor.cjs` | ✅ 72 |
| `node scripts/places-tab.cjs` | ✅ 98 |
| `node scripts/places-posts-gating.cjs` | ✅ 41 |
| `node scripts/schedule-graphics-places.cjs` | ✅ 258 |
| `node scripts/outreach-schema-census.cjs` | ✅ 42 |
| `node scripts/run-harnesses.cjs` | see the chat reply |
| `node scripts/social-tab-render.cjs` | ✅ **WebKit and Chromium**, with five controls |

### Every §9 bullet, and where it lives

| Asked for | Where |
|---|---|
| each tab's heading/description | `place-pictures.cjs` §9 — plus the render harness, which measures the three are the **same size** |
| Designs and Create a post share the grid constant | `place-pictures.cjs` §9 (source) and `social-tab-render.cjs` (two renders compared: 528/528) |
| the poster/picture/`picture_use` resolver order, each case including private | `place-pictures.cjs` — **driven**, seven cases |
| shape refusal for posters only | `place-pictures.cjs` — driven, including a 100×3000 picture that still draws |
| tag normalising and refusing | `place-pictures.cjs` — driven, eight cases |
| caption labels filling, including a missing tag | `place-pictures.cjs` — driven, with the no-double-space and no-stray-`@` assertions spelled out |
| template save/load | `place-pictures.cjs` — the save action, and that the **read never writes the seed** |
| the share text passed when allowed | `weekly-post.cjs` — the exact ternary and the separate `canShare` |
| "Powered by HatchGrab" in all four render paths | `place-pictures.cjs` — both renderers, **ordered after the darken**, and one `renderEventPost` call site |

### The browser render

**WebKit and Chromium, at 1100 and 390**, five controls (two-column rule removed; Location settings grid
removed; `items-start` → `items-stretch`; the list's height cap removed).

⚠️ **One control had quietly stopped controlling.** It stripped the Locations grid by naming the literal
`minmax(0,1fr)_minmax(280px,420px)` — the ratio before this build. When the ratio changed, the
`.replace` matched nothing, the control rendered the normal two-pane layout, and it failed on correct
code. **A control that names a literal is a control that stops controlling the day that literal
changes**; it strips whatever the lifted grid's `min-[900px]:` rule is now.

---

## 9 · What I changed in my own work after driving it

1. ⛔ **`{day-date}` was a bare date and had to be the relative phrase.** "Nothing changes until the
   truck edits it" is only true if the label carries `whenPhrase`.
2. ⛔ **`Order ahead:` was left dangling** when there was no link. Fixed with the line rule, which
   `caption.ts` had always implied.
3. ⛔ **The `slot === 'weekly'` filter dropped event-only pictures** out of the photo space. Fixed by
   making the parameter the surface.
4. ⚠️ **I asserted the one-off case backwards** and the driven check refused it; the code was right.
5. ⚠️ **A render control had stopped controlling** — see above.

---

## 10 · Your localhost test list — Pizza Kitchen only, Safari on a Mac

⌘⌥R to hard reload between steps.

1. **Run the SQL.** Block 1, read `1c` (expect no rows), then block 2, then block 3. Check `3d`'s two
   counts are both **0**.
2. **The three headings.** Social media → each pill in turn. Each has its own heading and its own
   description; there is no "Social posts" heading and no "Designs is where you upload…" line anywhere.
3. **Designs widths.** Switch between Create a post and Designs. The two boxes must be the **same width**
   and in the **same place** — the page should not shift.
4. **The narrower table.** Location settings: the table is about a third of the row, the pane the rest.
   Narrow the window below ~900px — they stack, with no sideways scroll.
5. **The chips.** "All n" · "No images n" · "Hidden n". Press each. Search for a town.
6. **Upload a poster, right shape.** Pick a location. The box reads **"Event poster (optional)"** and
   names the size. Upload one that matches → it appears in the pane and in the **POSTER** column.
7. **Upload a poster, wrong shape.** Try a square one. It should be refused with the two-shape sentence.
8. **Upload a location picture.** Any shape. It appears in the **PICTURE** column.
9. **"Use it on" — Weekly post.** Leave it on Weekly. Make this week's post: the picture appears beside
   that location's row (if your weekly design has its Location picture item on; if not, the amber line
   should be offering to open the editor).
10. **"Use it on" — Single event posts.** Switch it. Make a post for an event at that location. ⚠️ With
    a poster on that location the **poster** wins — look for the grey line saying so. Remove the poster
    and make the post again: now the picture should be in the design's photo space (if the design has
    one; if not, the amber line offers to add it).
11. **"Use it on" — Both.** Check both posts.
12. **A tag.** Type `buresmusicfest` and Save → it should come back as `@buresmusicfest`. Try
    `bures music fest` → refused with a sentence.
13. **The tag in a caption.** On Create a post, press **+ Location tag** in the single event caption.
    Make a post for an event at the tagged location — the tag appears. Then make one at a location with
    **no** tag: the line must read cleanly, with **no stray space and no "@"**.
14. **Edit a caption and reload.** Type into either caption editor, wait for **Saved ✓**, then ⌘⌥R. It
    must come back as you left it.
15. **A post's own caption.** Make a post, edit the caption **in the modal**, close it, and reopen. The
    modal's caption should be the template again — the edit applied to that post only.
16. **Share on the Mac.** Press Share. The sheet opens (it does not download). The grey line about
    Facebook and Instagram is under the buttons.
17. **"Powered by HatchGrab".** Check all four: the weekly post; a single event post on the standard
    design; one at a location with a poster; and one where you uploaded an image for that post only.

---

## 11 · Things left behind on purpose

| Thing | Why |
|---|---|
| `place_slot_use` on the route | nothing calls it — "Use the event photo here too" is gone. Removing a route action is a separate change with its own blast radius |
| ~11 more copy constants with no reader | harnesses assert on them by name; a dead export is cheaper than a harness that cannot find its subject |
| `eventImageMode()` in lib | still describes the editor's photo-space switch. What went is the **route** asking it what a location's image is |
| `place_picture_list` / `_main` / `_rename` / `_remove` | unchanged from V15.0. ⛔ `place_picture_remove` is still the only path that deletes a stored object, and nothing presses it |
| `is_main` / `label` / `sort_order` | unchanged. Dropping a column is irreversible |

## 12 · The rules

| Rule | Kept |
|---|---|
| Work on `main`, locally; do not push, do not deploy | ✅ |
| Test only against Pizza Kitchen; never a live truck | ✅ no database touched at all |
| No `outreach_templates` row touched; no real emails | ✅ |
| Kill only by a recorded PID or task id | ✅ nothing killed |
| I do not run SQL — write it AND put it in chat as fenced blocks | ✅ §0 and the chat reply |
| Never drop a table or column, never delete a stored image | ✅ no `drop`, no `delete`; the columns were **not renamed** for exactly this reason |
| Everything stays behind the existing gates | ✅ unchanged — the tab is filtered without `places_posts_preview`, every box gated on `schedule_graphics` |
| Flag a garbled span; stop on a contradiction | ✅ nothing arrived garbled, and nothing contradicted. One point the brief left open — whether a one-off suppresses the picture in the photo space — is resolved in §4 under a stated reason rather than silently |
