# SOCIAL POSTS: MAKE A POST / DESIGNS — AND THE PLACES TAB REMOVED

**6 October 2026 · branch `main`, local. Pushed: no. Deployed: no. SQL run: none — and none was needed.**

Nothing here drops a table, deletes a stored picture, or changes a single row of place data. The same
columns, the same rows, the same `sg_*` actions — **only where they are edited has moved.**
`public.place_pictures` is untouched and is still read by nothing.

---

## 1 · THE PLACES TAB IS GONE

**Schedule's pills are now: Events · Event types · Social posts.**

The tab shipped yesterday and is deleted today. Its four controls went to the two screens that were
already about them:

| It had | It is now | Why there |
|---|---|---|
| **The five fields** — name, short name, address, area, postcode | **"Tidy up places"** in Add event, and that is their **only** home | It always had them, keyed per place. A second editor of five columns is a second place for them to disagree |
| **The usual event type** (a pill row) | **Add event**, as a tick under the type pills | The question only makes sense at the moment you are choosing a type for that place |
| **Hiding and restoring** | **The venue suggestion row** — a `×` on each, "Show hidden" beneath | You meet a place by typing its name. That is when you discover one you do not want offered |
| **"Picture for posts"** | **Social posts › Designs**, Box 3 and the place design editor | The picture only exists for a post, so it belongs with the design it changes |

**I checked "Tidy up places" before deleting anything**, as you asked. It edits all five fields —
`label="Name on posts"`, `"Short name"`, `"Address"`, `"Area"`, `"Postcode"` — and mounts
`<PlaceDetail key={selected.id}>`, so it remounts per place and the on-blur saves cannot write one
place's values onto another. No reason to stop.

**Deleted:** `components/manage/PlacesTab.tsx`, `WeeklyPostPane` (its gate moved), `scripts/places-tab-render.cjs`.

### Old links

| Link | Lands on |
|---|---|
| `?section=places` | **Social posts › Designs** |
| `?section=weekly` | **Social posts › Make a post** |

Both are mapped by `canonicalScheduleSection()` in `lib/manage-links.ts`, **at the URL** — so nothing
past the mount parser ever sees a legacy id. ⛔ **Neither falls through to Events.** Falling through is
what made `?section=places` land on the wrong screen the *first* time the Places pill was retired
(3 October), and it is why the map exists rather than a validator that just rejects what it does not
recognise.

The `ScheduleSection` type now lives in `lib/manage-links.ts` and is imported by the page, which used
to declare its own copy. Two copies is how a section comes to exist in a pill bar and not in a link.

---

## 2 · SOCIAL POSTS — two areas, six boxes

Header: **"Social posts"**, one line of description, and a segmented control **[Make a post | Designs]**
at the top right. It opens on Make a post. Both areas are in the URL (`?section=posts` / `?section=designs`),
through the one builder.

**The old Single event | Weekly sub-tabs are gone.** They split the page by *which post* before asking
the question you actually arrive with: *am I making something, or setting it up?*

### 2a · Make a post

| Box | What is in it |
|---|---|
| **Weekly post** | thumbnail · "Your whole week on one picture." · a **Which week** select (This week · dates / Next week · dates) · "`N` events" · a full-width **Make this week's post** |
| **Single event post** | the next **six** upcoming events, in date order · each with a **colour bar saying which design the post will use** (orange = this place's own, grey = your Standard), the date in bold, the times, the venue below, and **Make post** · footer link **See all upcoming events** |
| **Post for a place** | a search box · every non-hidden place, favourites first · "`Name` · `town`" and "Next: `date`" with **Make post** for that event, or **Nothing booked** and a dash · footer "`N` places · hidden places aren't listed" |

Under them, one line: *"Make post opens the finished picture with the caption, ready to download or
share. Each post uses that place's own design if it has one, otherwise your Standard event design."*

⛔ **"last made" is not shown, because we do not store it.** You said to leave it out rather than invent
one, and a date nobody recorded is a date you would plan around.

### 2b · Designs

| Box | What is in it |
|---|---|
| **Weekly post design** | a large preview · **✓ Set up** / **Not set up** · the blurb · **Edit weekly design** |
| **Event post design** | a large preview of your Standard single-event design · a badge · the blurb · **Edit event design** |
| **Designs for a place** (the widest) | a search box · **every non-hidden place, own-design ones first** · thumbnail, name, "Own design" or "Standard", and **Edit** / **Give own design** · footer "`X` with their own design · `Y` using Standard" |

A place counts as **Own design** only once a picture is saved — that is the server's `hasPicture`, not
a client flag, so "Give own design" and then backing out leaves nothing behind.

### ⛔ Nothing is rebuilt. Every box is a door.

| Box | Opens |
|---|---|
| Weekly post | `WeeklyPostApp`'s make screen, **on the week you chose** |
| Single event · Post for a place · the editor's footer | `EventPostModal` — **the same modal the Events list opens** |
| The two design boxes | `WeeklyPostApp`'s and `EventSetupScreen`'s existing setup screens, as full pages under "‹ Designs" |
| Designs for a place | the place design editor, which **is** `EventSetupScreen` focused on one place |

🔴 **So this product still has exactly ONE drag surface.** `scripts/social-posts.cjs` counts the
`DraggableBox` definitions in the tree and requires one. I added two optional props to
`EventSetupScreen` — `onlyStandard` and `onlyPlaceId` — which hide its own Designs list and its picker
and lock it to one design. The picture, the fonts, the preview, the save paths and the drag handling
are untouched.

### 🔴 The one new read — and the loop it exists to prevent

`social_overview` on `/api/weekly-post` returns, in one call: the two designs and whether each is set
up; the next six events; and **every non-hidden place with one short-lived signed URL each**, its next
public event, and its upcoming public events.

⛔ **The alternative was `event_load` once per place** — the only action that signed a place's picture,
and one that also reads up to 200 events in each direction to build the setup screen's previews.
**Twenty-one copies of that read, to draw twenty-one 64px squares.**

It is **read-only** (no insert, update, upsert, delete or storage remove — asserted over the action's
own body), forward-only and bounded (`gte(today)`, `limit(400)`), owner-scoped by the same `truck.id`
every other read uses, and behind the same gate: `gated()` runs once at the top of POST, so it needed no
check of its own and cannot have been accidentally left open.

### ⛔ A private event is never offered a post

Decided on the **server**, in three places, because three surfaces could have got it wrong:

- the next-six list sends `isPrivate: true` with **no venue, no town and no place** — not hidden on the
  client, **dropped before the payload**;
- a place's `next` is its next **public** event, because that is the event its button would post;
- the place editor's "Preview with" list is public-only.

It is still a row, greyed, in its date position — *"Private event · no post"* — with no button. An
operator who sees five events when they have six bookings will go looking for the sixth.

### 2c · The place design editor

A full page: **‹ Social posts › Designs** · the place name, large · "`town` · event design for this
place" · *"Event posts at `<place>` use this design. Everywhere else uses your Standard design."*

- **"Name on posts"** and **"Preview with"** in a card above the editor.
- Then the existing editor — picture, text positions, fonts, preview.
- A footer: **Make post for `<date of the next public event>`** (hidden when there is none — there is no
  event for the button to be about) and, on the far right, link-styled **Use Standard design here
  instead**, which removes the picture after a confirm and only then.

**Upload** is the existing `upload_url` → PUT → `confirm_upload` (`which: 'place'`) flow, with the
server's own shape check, 10MB cap and PNG/JPG rule. **No new upload route.** A wrong-shaped image is
refused with the existing sentence naming both shapes.

**Text positions** works for a place: the existing editor already supports per-place positions
("Same as Standard" / "Own for this place"), and `onlyPlaceId` simply opens it on that place. No second
drag surface.

### 🔴 "Name on posts" — and a mislabelling you should know about

You asked me to find out which field the renderer actually prints. **It is `short_name`.**
`locationName()` in `lib/weekly-post/week-data.ts` reads `short_name` first and falls back to `name`.
So the control in the place design editor is bound to **`short_name`**, written with `sg_upsert_place` —
the action Tidy up already uses. **No column was added.**

⛔ **But "Tidy up places" labels `name` "Name on posts", and `name` is the field the renderer uses
SECOND.** That label is wrong today: fill in a Short name and the poster stops printing the thing
labelled "Name on posts". I left it alone because your brief says to keep Tidy up as it is — **this is
a decision for you.** The two candidates:

1. rename Tidy up's `name` field to **"Full name"** and its `short_name` field to **"Name on posts"**; or
2. leave both and accept that the editor's "Name on posts" and Tidy up's are different columns.

I would do (1). Say the word.

### ⚠️ One place the brief and the code disagree, and what I did

You wrote: *"Without `schedule_graphics`, show the existing locked/upgrade state inside the box"* — for
Box 1 only. But `/api/weekly-post` gates **every** action on `schedule_graphics` (`gated()` runs once at
the top of POST), so a Make post button in Box 2 or Box 3 on such a truck would open a modal that 403s.

**I locked all three boxes the same way**, with the one gate helper, because a button that cannot work
is worse than a locked box that says why. It is not a contradiction inside your brief, so I did not stop
— and **no truck is in that state today**: the preview key is on Pizza Kitchen, which is on `trial`, and
`TRIAL_FEATURES` spreads `MAX_FEATURES`. Tell me if you want the other reading.

---

## 3 · ADD EVENT

### 3a · The venue suggestions are places

The list was ten de-duplicated `venue_name`s from past events. A place is the thing you are choosing,
and it is the thing that carries a usual type, a town, a hidden flag and a design.

Under a **YOUR PLACES** heading, each row shows: the **name** (truncating), the **town** beneath, its
**usual type on the right** — a colour dot and the name, or a **purple lock and "Private"** — and a
**`×`** (aria-label "Hide this place").

- The colour is `colourFor(index in the truck's types)` — the Event types grid's own index, so one type
  is never two colours on two screens.
- ⚠️ **An id that is not in the type list draws NO label** — never "Standard", which would be a lie
  about a place that carries an id.
- ⛔ **The `×` carries both `preventDefault` and `stopPropagation`.** It sits inside the row's own click
  target; without both, hiding a place would also pick it and close the step.
- Hidden places that match what you typed appear as **"`N` hidden place(s) match · Show hidden"**;
  pressing it adds a **HIDDEN** heading with those places greyed and a **Show again** button.
- ⛔ **A hidden place is never an ordinary suggestion and is never pre-selected.** The two groups come
  from one filter, so they cannot overlap. "Show hidden" is per-open and never remembered.

⚠️ **The old event-derived list survives**, as a second group under **"From your schedule"**, for a venue
that has no place row.

### 3b · The "Always use" tick

When a known place is picked and the selected type **differs** from the one the form pre-selected for
it, a green tick row appears under the pills:

- **"Always use `<Type>` at `<Place>`"** when the place has a stored usual type;
- **"Use `<Type>` at `<Place>` next time"** when it has none.

It disappears if you put the type back. ⛔ **Unticked by default, always** — this is the only thing in
Add event that writes to a place, and a pre-ticked box would turn "different this once" into "for ever".

⛔ **It is derived dead when it is not offered, not cleared by an effect.** My first version cleared it
in a `useEffect`; that is a cascading render (the one new ESLint error this build briefly introduced)
**and a frame of wrongness** — between the render that stopped offering the row and the effect that
cleared it, a save would have read `true` and written the wrong place's type.

🔴 **The write happens after the event save, only on success**, and **a failed place write never fails
the save**: its own catch, and a toast naming both outcomes in the right order ("Event saved. `<Place>`'s
usual type was not — …"). It is a toast and not an inline note because the modal closes on a successful
save, which is exactly when the write runs — an inline note would be drawn and destroyed in one tick.

Without the tick, Add event writes nothing to a place. `sg_place_usual_type` has **exactly one caller**
in `page.tsx`, inside the ticked branch, and `scripts/places-tab.cjs` §2 asserts the count.

Pro trucks still see Standard and Private only (the filter is the server's, on the two feature keys).
Private still opens the purple panel. **3c: "Tidy up places" is untouched.**

---

## 4 · CHECKS

### ⛔ Three harness failures, and all three were harnesses lying

**1 · A tombstone satisfied the check that tested for the string it quoted.**
`scripts/places-tab.cjs` §6 tested **raw** source for `href="?section=places"`. That link had been
changed to `manageSectionHref('places')` the day before, leaving a comment reading **⛔ WAS
`href="?section=places"`** — and the comment passed the check. **It was green for a day on a claim about
a thing that no longer existed.** `codeOf` first; it is in that harness's own header.

**2 · `scripts/schedule-places-render.cjs` had THREE dead lifts and had not run for days.** I repaired
it, as you asked, and found a third cause beyond the two in the tidy report:

| Lift | Was | Now |
|---|---|---|
| the shared `Toggle` | `relative w-11 h-6 rounded-full transition-colors` | the base class and the FULL arm of the `compact ? … : …` ternary, lifted separately |
| the Add event picker | `<select id="event-type-select">`'s className | `data-event-type-pills` and one pill — and the five assertions re-aimed: "the same height as the Van select" is meaningless for a pill row, so what is measured now is that every pill stays inside the pane, the row does not widen it, one line at 1440 and **wrapped** at 390 rather than a sideways scroller, and a tappable height |
| the Van field | the native select's inline class string in `page.tsx` | `CONTROL_BOX` in `lib/ui-tokens.ts`, where the box is now decided |

**3 · A cosmetic screenshot was killing the whole run.** `eng.shot` is the last thing in a width's loop,
and this machine's Chromium times out inside `Page.captureScreenshot`; the throw escaped `measure()` and
took every measurement already made with it. **A shot is evidence, not a test** — it swallows its own
failure and prints one line. Both render harnesses now have that, plus `protocolTimeout` and `HG_ENGINES`.

**And two measurement bugs of one shape, both failing on correct markup:** a `Range`'s client rects are
one per **box**, so an `inline-flex` type label (a dot `<span>` beside a text node) read as two lines;
and a `startsWith` chain with a catch-all `else` checked a box-2 button against box 3's edges. A
fallback branch that catches everything it was not told about is a fallback that mislabels.

### 🔴 One real layout bug the render harness found

**A 20-place list stretched its box.** `flex-1 min-h-0 overflow-y-auto` lets a child be shorter than its
content *only when something above it decides the height* — and these boxes sit in the page's own flow
with nothing capping them. So a truck with twenty places grew the box, and `items-stretch` then dragged
the other two boxes to the same height. **Fixed with `max-h-72` on all three lists**, and measured at
three widths with 20 rows.

### The harnesses

| | |
|---|---|
| `places-tab.cjs` | ✅ **92** — §1, §2, §3, §4 and §6 re-aimed at the new homes |
| **`social-posts.cjs`** (NEW) | ✅ **32** — privacy, the one read, one drag surface, the gate, the URL |
| `places-posts-gating.cjs` | ✅ **44** |
| `weekly-post.cjs` | ✅ **207** |
| `schedule-graphics-places.cjs` | ✅ **258** — W18 and W23 re-aimed, the pill count 4 → 3, the line-loss allowlist extended |
| `private-events.cjs` | ✅ **206** |
| `event-types.cjs` | ✅ **185** |
| `event-pricing.cjs` · `screenshot-truck-details.cjs` | ✅ **110** · ✅ **173** |
| **Full sweep** | `node scripts/run-harnesses.cjs` — **94 run, 94 passed, 0 failed** |

**Your asked-for assertions, and where each one lives:**

| Claim | Where |
|---|---|
| a truck without `places_posts_preview` sees no change | `social-posts.cjs` §4, `places-posts-gating.cjs` §2 |
| no private event is ever offered a Make post | `social-posts.cjs` §1 (three server-side checks) |
| Add event writes to a place only when ticked AND saved | `places-tab.cjs` §2 (five checks, incl. the one-caller count) |
| old `section=places` links land on Designs | `places-tab.cjs` §1, `social-posts.cjs` §5, `schedule-graphics-places.cjs` |
| no hand-written Manage links | `places-tab.cjs` §1b (sweeps `app/` and `components/` for both `href="?tab=` and `href="?section=`) |
| no per-place `event_load` loop for thumbnails | `social-posts.cjs` §2 |
| nothing reads `public.place_pictures` | `places-tab.cjs` §3 (sweeps `app/`, `lib/`, `components/`) |

### Render measurement — both engines, three widths

**`scripts/social-posts-render.cjs` (NEW)** and the **repaired `scripts/schedule-places-render.cjs`**
both pass in **Chromium AND WebKit** at **1440×900, 820×1180 and 390×844**.

```
Social posts, 1440  Make a post  boxes 461/461/461, one row, equal height
                    Designs      boxes 407/407/570, one row, equal height
            820/390              stacked, no horizontal page scroll
            all widths           20-row lists scroll INSIDE their box; every button inside its own box
Add event,  1440    pills 6 on 1 row, 30px tall · always-use sentence 1 line
             390    pills wrapped · sentence 2 lines · × inside the row and inside the dropdown
```

Each file also renders a **control** fixture with the grid removed, so the side-by-side assertions
cannot pass on a page that never had columns. Screenshots (renders of fixtures, not a running page) are
in `docs/screenshots/social-posts/`.

⚠️ **Chromium still cannot take a screenshot on this machine.** The measurements run and pass in both
engines; only the PNGs are skipped, with a line saying so. The committed screenshots are WebKit's.

### Everything else

- **`tsc --noEmit`** — clean. **`npx next build`** — compiled.
- **ESLint, measured both ways (stashed tree vs applied):** **warnings 343 → 340** (down 3) and
  **errors 1,301 → 1,303** (up 2). The +2 are `@typescript-eslint/no-require-imports` in the one new
  non-render harness — **every `.cjs` harness in this repository carries those**, and silencing them
  there alone would be inconsistent with ~300 existing ones. The new render harness's 5 exactly replace
  the deleted `places-tab-render.cjs`'s 5.

---

## 5 · WHAT TO TEST ON LOCALHOST — Pizza Kitchen only, Safari on Mac

Open `http://localhost:3000/manage/<Pizza Kitchen's token>?tab=schedule`.
⚠️ If the **Social posts** pill is not there, the `places_posts_preview` grant has not been applied —
the corrected SQL (keyed on `id = 'test-truck'`, **not** the slug) is at the top of
`docs/places-tidy-report.md`.

**Safari shortcuts:** hard reload is **⌘⌥R**. For narrow widths, **Develop › Enter Responsive Design
Mode** (enable the Develop menu in Safari › Settings › Advanced).

### The shape of the screen

1. Schedule shows **three** pills: Events · Event types · Social posts. **There is no Places pill.**
2. Open **Social posts**. It opens on **Make a post**, and the URL reads `…?tab=schedule&section=posts`.
3. Press **Designs**. The URL becomes `…&section=designs`. **⌘⌥R** — it reloads on Designs.
4. Paste `…?tab=schedule&section=places` into a new tab. It must land on **Social posts › Designs**,
   not Billing and not Events. Then try `…&section=weekly` — **Make a post**.

### Make a post

5. **Box 1.** Change **Which week** to Next week; the "`N` events" line should change. Press **Make this
   week's post** — the existing weekly make screen opens **on next week**, under a "‹ Social posts" link.
   Go back.
6. **Box 2.** The next six events, in date order, each with a thin colour bar. Press **Make post** on one
   — the usual post modal opens with the picture and the caption. Close it.
7. **The private event.** If one is in the next six, it is **greyed**, reads *"Private event · no post"*,
   shows **no venue and no town**, and has **no button**. (If none is, add a private event for a date
   this week in Add event, come back, and check it.)
8. **Box 3.** Type part of a place name in the search box — the list filters. A place with a booking
   shows "Next: `<date>`" and **Make post**; one without shows **Nothing booked** and a dash. Press one
   and check the post is for *that* place's next event.

### Designs

9. **Box 1 and Box 2** show a preview and **✓ Set up**. Press **Edit weekly design** — the existing
   weekly setup screen opens as a full page under **‹ Designs**, with no "Single event | Weekly" switch.
   Go back. Press **Edit event design** — the Standard single-event setup, **with no Designs list inside
   it** (Box 3 is that list now).
10. **Box 3.** Places with their own picture come **first**, with a thumbnail and **Own design**; the
    rest show a blank tile and **Standard**. The footer counts both.
11. **Give own design** on a place with none. The editor opens: the place's name, the scope sentence,
    **Name on posts**, **Preview with**, the editor, and a footer.
12. **Upload a picture for this place** — choose a PNG or JPG **the same shape as your Standard design**.
    It saves in place. Go back to Designs: that place is now **first**, with its thumbnail and
    **Own design**.
13. **A wrong-shaped image is refused**, with the sentence naming both shapes. Try a square one.
14. **Name on posts.** Type a short name, click away, then make a post for that place — the poster should
    print **the short name**. (This is the field the renderer actually uses — see §2c.)
15. **Use Standard design here instead.** Open the place again, press it, confirm. You land back on
    Designs and the place reads **Standard** with a blank tile.

### Add event

16. Open **Add event** and start typing a venue name. Under **YOUR PLACES**, each row shows the name, the
    town below, and **its usual type on the right** — a colour dot and a name, or a 🔒 and **Private**.
17. **Press the `×` on one row.** The place must be **hidden** — and the form must **not** select it and
    must **not** close the step. The row leaves the list at once.
18. Type part of that place's name again. A line reads **"1 hidden place matches · Show hidden"**. Press
    it: a **HIDDEN** heading appears with the place greyed and a **Show again** button. Press that — it
    returns to the normal list.
19. **The tick.** Pick a known place. Note which type pill is selected. Press a **different** type — a
    green row appears: **"Always use `<Type>` at `<Place>`"** (or "**Use … next time**" if the place has
    no stored type). It is **unticked**.
20. Press the **original** type again — **the row disappears**.
21. **Without ticking it**, choose a different type and save the event. Reopen Add event, pick the same
    place: the pre-selected type must be **unchanged**. (Add event wrote nothing to the place.)
22. **Now tick it** and save. Reopen Add event, pick that place: the pre-selected type is **the new one**.
23. **Tidy up places** (from Add event) still edits all five fields, and selecting a second place shows
    **that** place's values — not the first one's.

### Phone width

24. **Develop › Enter Responsive Design Mode**, iPhone width. On **Make a post** and on **Designs** the
    three boxes **stack**, nothing scrolls the page sideways, the long lists scroll **inside** their
    boxes, and every button stays inside its box. In Add event, the type pills **wrap** onto two rows
    rather than scrolling sideways, and the `×` stays inside the suggestion row.

---

## Files

| File | |
|---|---|
| `components/manage/SocialPosts.tsx` | **new** — the two areas, the six boxes, the place design editor |
| `lib/copy/socialPosts.ts` | **new** — every sentence the page says |
| `app/api/weekly-post/route.ts` | **new action `social_overview`** — read-only, one signed URL per place |
| `components/manage/EventPost.tsx` | `onlyStandard` / `onlyPlaceId`; the stale Places pointer deleted |
| `components/manage/WeeklyPost.tsx` | `initialMode` / `initialWeek` / `initialDesignKind` / `hideKindSwitch` / `onBack` |
| `components/manage/EventTypes.tsx` | `onUsual` — the pill row reports what it pre-selected, from the same response |
| `lib/manage-links.ts` | the section vocabulary, `canonicalScheduleSection`, the two legacy ids |
| `app/manage/[token]/page.tsx` | three pills; the Social posts mount; the place suggestions; the `×`; the tick and its write |
| `components/manage/SchedulePlaces.tsx` | `WeeklyPostPane` removed (its gate moved with it) |
| ⛔ deleted | `components/manage/PlacesTab.tsx`, `scripts/places-tab-render.cjs` |
| `scripts/social-posts.cjs`, `scripts/social-posts-render.cjs` | **new**, both listed in `scripts/harnesses.json` |
| `scripts/places-tab.cjs`, `places-posts-gating.cjs`, `weekly-post.cjs`, `schedule-graphics-places.cjs`, `schedule-places-render.cjs` | re-aimed; the last one repaired from three dead lifts |
| `docs/reference-manual.md` | **V14.3**; §64.9 marked history, §64.10 extended, **§64.11** and **§64.12** added |

---

## Open items for you

| | |
|---|---|
| **Deploy** | not done. `git push origin main`, then §74.6's live checks |
| 🔴 **"Tidy up places" labels `name` "Name on posts", and the renderer prefers `short_name`** | a real mislabelling. I left it alone on your instruction — see §2c for the two options. **I would rename both fields** |
| ⚠️ **The `schedule_graphics` reading** | I locked all three Make-a-post boxes, not just the weekly one. §2 explains why. No truck is affected today |
| `public.place_pictures` + its storage objects | in the database, read by nothing. ⛔ Do not drop without asking |
| Chromium screenshots on this machine | measurements unaffected in both engines; worth a `npx puppeteer browsers install chrome` |
