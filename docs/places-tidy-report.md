# THE PLACES TAB TIDY-UP — 5 October 2026

**Branch:** `main`, local. `schedule-graphics` fast-forwarded to match.
**Pushed:** no. **Deployed:** no. **SQL run:** none — and none was needed.

---

## 🔴 READ THIS FIRST — A GRANT SQL I GAVE YOU EARLIER WOULD HAVE MATCHED 0 ROWS

The `places_posts_preview` grant written in `docs/release-prep-report.md` and
`docs/fixes-and-gating-report.md` is keyed on **`id = 'test-kitchen'`**.

**`test-kitchen` is Pizza Kitchen's SLUG. Its id is `test-truck`.** That `UPDATE` updates nothing, the
verification `SELECT` returns `false`, and the Places and Social posts pills stay hidden — with no error
anywhere, because an `UPDATE` that matches no rows is not a failure.

**The corrected statements.** Read first, change, verify — nothing here has been run.

```sql
-- 1 · READ-ONLY. Confirm which row you are about to touch, by id AND by slug.
select id, slug, name, plan, feature_overrides
from public.trucks
where id = 'test-truck' or slug = 'test-kitchen';
--   expect ONE row: id = 'test-truck', slug = 'test-kitchen', name = 'Pizza Kitchen'.
--   ⛔ If it returns two rows, STOP — you have two trucks and this grant would guess.
```

```sql
-- 2 · THE CHANGE. Merges one key; removes nothing.
--     `coalesce` handles a NULL column; `||` adds the key beside whatever is already there.
update public.trucks
set feature_overrides = coalesce(feature_overrides, '{}'::jsonb)
                        || '{"places_posts_preview": true}'::jsonb
where id = 'test-truck';
--   expect: UPDATE 1.   ⛔ UPDATE 0 means you are on the wrong key again.
```

```sql
-- 3 · READ-ONLY VERIFICATION.
select
  (select count(*) from public.trucks
     where feature_overrides->>'places_posts_preview' = 'true')            as trucks_with_the_key,
  (select count(*) from public.trucks
     where feature_overrides->>'places_posts_preview' = 'true'
       and id <> 'test-truck')                                            as anyone_else,
  (select feature_overrides from public.trucks where id = 'test-truck')   as pizza_kitchens_overrides;
--   expect: 1, 0, and an object containing "places_posts_preview": true alongside anything already there.
```

⚠️ **If the Places pill has been visible on your localhost all along, the grant was applied correctly by
some other route and these statements will simply confirm it (step 2 is idempotent).** If it has NOT
been visible, this is why.

🔴 **The same confusion was in the code.** `scripts/private-events.cjs` had `const TRUCK = 'test-kitchen'`
— the slug in an id position. Fixed to `'test-truck'`; the harness passes 206.

---

## 1 · EVENT TYPE PER PLACE — the dropdown is a pill row, and "Automatic" is gone

**What you see now.** At the top of the place detail: **Standard · 🔒 Private · the truck's custom
types**, as pills, exactly one selected, under the heading "Event type" and above one line —
*"Add event picks this type whenever you choose this place."*

| | |
|---|---|
| **A place nobody has set** | shows the type the existing history rule gives — Standard where there is no history — as an **ordinary selected pill, with no special label** |
| **Where that answer comes from** | the server, in `usual_automatic_type_id` on the `sg_places` row, resolved by `readPlaceTypeHistory` — the **same function Add event's pre-selection uses**. So the pill you see IS what Add event will pick |
| **Add event's pre-selection** | the stored choice if there is one (`by: 'pin'`), else the history rule. That order was already right and is unchanged |
| **Choosing a different type in Add event** | changes that event only. `PlacesTab` is the **only** caller of `sg_place_usual_type` in the repository; the form's pill row calls `onChange` and writes nothing |
| **Storage** | unchanged — `usual_type_is_standard` / `usual_event_type_id`, resolved `is_standard ? Standard : (id ?? the rule)` on both sides of the wire |
| **A Pro truck** | sees **Standard and Private only**. Filtered on the two feature keys, never on the plan name |

⛔ **Why the option went.** It offered three states where you only ever want one answer: *what type comes
up when I pick this place?* "Automatic (Market — last used here)" is an honest label for a mechanism, and
a mechanism is not what the question is about.

🔴 **And that label had been false.** `automaticNameFor` was `() => 'Standard'` — a hardcoded word — so a
wedding venue whose last three bookings were Private was told Automatic meant Standard, on the screen
whose job is to say what will happen. It was fixed yesterday by making the server resolve it; today the
option it labelled is gone. `scripts/places-tab.cjs` §2 now asserts the word **"Automatic" appears
nowhere in the tab's code**.

⚠️ **The route still accepts `null`** (which means "nothing stored", the state every place starts in).
`clearOwn` and older callers send it and the storage did not change — removing it would be a breaking
change to a wire format for no gain. What is gone is any way for the **screen** to say it: `savePin`
takes a string.

---

## 2 · THE PLACES LIST — the type on every row, and hidden places back on the screen

**Each row now carries its place's type on the right:** a colour dot and the name, or a **purple lock and
"Private"**.

- The colour is `colourFor(index in the truck's types)` — **the Event types grid's own index**, so one
  type is never two colours on two screens.
- The name is `truncate` and the label is not, so a long name gives way and the type is always whole:
  a half-written type name is worse than a truncated venue, which has its own sub-line underneath.
- ⚠️ **An id that is not in the types list draws NO label** — never "Standard". Standard is `null`; a
  label there would be a lie about a place that carries an id.

**Hidden places are no longer removed from view.** They sit at the bottom of the list under a
**HIDDEN PLACES** heading, greyed, under one line:

> Hidden places stay out of Add event. Open one to restore it.

Opening one shows the normal detail with **"Restore this place"**. Search covers them, in their section.

⛔ **The "N hidden places · Show" footer is deleted.** It was a count you had to press to reveal a list,
and until you pressed it a place you had hidden was simply absent from the screen that owns places. The
question you arrive with is "where did The Crown go?", and a screen that answers it only after a hunt has
hidden the answer too.

⚠️ **"Tidy up places" in Add event keeps the old behaviour** — a different job, a short working pass
where a long greyed tail is noise. `PlaceList` takes both props; the tab passes `hiddenSection`, Tidy up
passes `showHidden`. Asserted by name so the two cannot be conflated again.

---

## 3 · REMOVED

| Gone | With it |
|---|---|
| **Both "Events here" boxes** — the card under the fields and the one at the bottom | `sg_place_events` on /api/manage, and `countsAsUpcoming` from that file's imports |
| **The "Favourite" button** in the detail pane | nothing — the list star does it on every row without opening anything, and `onFavourite` / `setFavourite` are untouched |
| **"Your own pictures", entirely** — the pane and the upload, list and remove routes | `sg_place_pictures`, `sg_place_picture_url`, `sg_place_picture_save`, `sg_place_picture_remove`, and `readImageInfo` from that file's imports |

⛔ **`public.place_pictures` IS LEFT IN THE DATABASE, WITH ITS ROWS AND ITS STORAGE OBJECTS.** No
migration. Nothing reads it — `scripts/places-tab.cjs` §3 sweeps `app/`, `lib/` and `components/` for the
table name and fails on a single hit. **Do not drop it without asking: it holds somebody's photographs.**
The route tombstone says so where the next person will find it.

🔴 **Eleven checks proved the extra-pictures pane was safe, and it was deleted anyway.** Its RLS, its
cascades, its 10MB CHECK, its server-built upload path, the path re-check, the real bytes read from
storage, the object deleted before the row — all correct, all passing. It was a reference library that
nothing read: no post, no feed, no export, no other screen, and its own copy had to say so in capitals
every time it was drawn. **Proving a thing is safe is not the same as proving it is wanted.**

⚠️ **What survived the "Events here" deletion:** Next and Last still reach the **list rows**, computed in
`sg_places` with the same `groupEventsByPlace` + `placeForEvent` grouping the deleted action used — so
nothing about merged places was lost. `traded_last_year` is still on the payload and is now rendered
nowhere; it was the "· N times in the last year" clause.

**`PLACES_TAB_ONLY` is one entry long now:** `sg_place_usual_type`. Still an array, because the name is
what says what the rule is.

---

## 4 · PICTURE FOR POSTS — uploaded in place

The section is called **"Picture for posts"**.

| | |
|---|---|
| **No picture** | a placeholder tile reading **"Standard design"**, the line *"Event posts here use your standard design."*, and **"Upload a picture for this place"** |
| **With one** | a thumbnail, the dimensions, **Replace**, **Text positions** and **Remove** (confirmed — it deletes a file and sends this place's posts back to the standard design) |
| **The flow** | the existing one: `upload_url` → direct PUT → `confirm_upload` with `which: 'place'`, on `/api/weekly-post`. The same three calls `EventPost.tsx` makes, so the shape check, the 10MB cap, the PNG/JPG rule and the storage path are the server's existing ones. **No new route action.** |
| **The shape check** | the **server's, and only the server's** — the only honest source for an aspect ratio is the real pixels of the stored object. The client's size and type tests are a courtesy that saves a doomed upload |
| **"Text positions"** | still a link. That part of the old reasoning survives: the drag surface lives in Social posts › Single event with its three pointer fixes, and a second one here would be a second set of those bugs |

⚠️ **One thing to know about the thumbnail.** `sg_places` returns `event_bg_path` — a path, not something
an `<img>` can load, because the bucket is private. The one action that already signs a place's post
picture is `event_load`, so that is what the pane calls: **once**, only when the place has a picture, and
again after an upload. It is not a cheap read (it also loads up to 200 events each way for the setup
screen's previews). A dedicated one-URL action would be cheaper and would be a new route surface; say the
word and I will add one.

### 🔴 THE BUG BEHIND "Add a picture for this place" → BILLING

**The cause, in two parts.** The link was a bare relative query:

```tsx
<a href="?section=weekly">Add a picture for this place</a>
```

A bare `?section=…` **replaces the whole query string**, so `?tab=` was dropped. The page's mount parser
does imply the tab from the section — **but it is not the only thing that sets the tab**, and on a truck
whose plan is `'trial'` the defaults-to-Billing effect ran afterwards and won.

**Two fixes, because either one alone leaves the other reachable:**

1. **`lib/manage-links.ts` — one builder.** `manageSectionHref(section)` returns `?tab=<tab>&section=<section>`
   from a `TAB_FOR_SECTION` map declared once. ⛔ **It does not take a `tab` for a section** — the tab a
   section belongs to is a property of the section, not a choice at the call site, which is exactly what
   the broken links got wrong.
2. **`urlAskedForTab`** in `app/manage/[token]/page.tsx` — a ref set after **all four branches** of the
   mount parser (`?tab=`, the two retired tab keys, and a bare `?section=` that implies its tab). The
   trial default returns early when it is true, before it looks at the plan.

**Every in-app link into a Schedule section, found and fixed:**

| Link | Was | Now |
|---|---|---|
| Places tab → "Text positions" | `?section=weekly` | `manageSectionHref('weekly')` |
| Single-event post → "Places" | `?section=places` | `manageSectionHref('places')` |

**And no Manage link is hand-written anywhere now.** Three `href="?tab=billing"` literals (two in
`page.tsx`, one in `FeatureGate.tsx`) went through `manageTabHref` too. The string it returns is
identical — **that is the point**: a literal that happens to be right is the one a later edit gets wrong.
`scripts/places-tab.cjs` §1b sweeps `app/` and `components/` for both forms and fails on either.

🔴 **The version of this bug that was costing you something.** `app/api/inbound-schedule/route.ts`
**emails** an operator `/manage/<token>?tab=schedule` when the scraper finds events for them to review.
On a trial truck that link opened a price list — and no screen could have shown it, because the fault was
in the page the email points at. Fix 2 repairs it; the email now builds its link with `manageTabHref`.

---

## 🔴 A SECOND BUG, FOUND WHILE TIDYING — and it would have written one place's details onto another

`PlaceDetail` keeps the five fields (name, short name, address, area, postcode) as **local draft state**
and saves them **on blur**. That only works because the caller gives it a `key` of the place id, so it
remounts when the selection changes.

**The Places tab's mount had no `key`.** Selecting a second place reused the component: the pane showed
the **first** place's five fields, and blurring any of them would have written them onto the second
place. "Tidy up places" always had the key — this tab simply never got it.

Fixed, with the reason in the file, and **both** mounts are now asserted.

---

## 5 · CHECKS

### The six you named

| Harness | Result |
|---|---|
| `places-tab.cjs` | ✅ **93 passed** (was 46 + 15 failing; §2, §3 and §4 re-aimed, §1b added) |
| `places-posts-gating.cjs` | ✅ **44 passed** |
| `weekly-post.cjs` | ✅ **207 passed**, 35 variants all failing as required |
| `schedule-graphics-places.cjs` | ✅ **258 passed**, every variant caught |
| `private-events.cjs` | ✅ **206 passed**, 24 variants all caught |
| `event-types.cjs` | ✅ **185 passed** |

### Everything else

- **`tsc --noEmit`** — clean.
- **`npx next build`** — compiled, every route rendered.
- **ESLint — identical to the baseline, measured both ways.** `1,296 errors, 342 warnings` on a stashed
  tree and `1,296 errors, 342 warnings` with this work applied. Three newly-dead references were removed
  to get there (`countsAsUpcoming`, `readImageInfo`, and `exists` in the re-aimed harness); the one new
  `react-hooks/set-state-in-effect` error I introduced is gone, by deriving the thumbnail URL from a
  stored path instead of clearing it in an effect.
- **Full sweep** — `node scripts/run-harnesses.cjs`: **93 run · 93 passed · 0 failed.**
- **`event-pricing.cjs`** — 110 passed, 15 variants; run because the pricing refactor is one commit old.
- **`screenshot-truck-details.cjs`** — 173 passed. It pins `/api/inbound-schedule` byte-for-byte against
  HEAD with a named allowlist, so the email-link change needed an entry. Adding it exposed a hole: the
  list was matched against **both** sides of the diff but the expiry check assumed every entry was an
  ADDITION, so a line that was **replaced** could not be tolerated without claiming the deleted line must
  still be present. There are two lists now, with opposite expiry checks.

### Render measurement — `scripts/places-tab-render.cjs` (NEW)

**Chromium AND WebKit, at 1440×900, 820×1180 and 390×844. Both engines report identical geometry.**

```
1440×900 (desktop)        list 300×630 @x16 · detail 1096 @x328 · pills 6 on 1 row · hidden note 2 lines
820×1180 (iPad portrait)  list 300×826 @x16 · detail  476 @x328 · pills 6 on 2 rows · hidden note 2 lines
390×844  (phone)          list 358×857 @x16 · detail  358 @x16  · pills 6 on 2 rows · hidden note 1 line
```

**94 assertions per engine**, including: no horizontal page scroll at any width; the list scrolls inside
its own 70vh card at 1440 and 820 and the two panes stack at 390; **every one of eleven rows' type labels
inside the card, on one line, never run into by the name**; the HIDDEN PLACES section on screen and below
the live groups; all six pills inside the pane, on one line at 1440 and wrapped at 390 rather than
overflowing; the picture card's three controls inside the card at every width. A **control** fixture with
the two-pane grid removed is also measured, so the side-by-side assertions cannot pass on a tab that
never had two panes.

Screenshots (renders of the fixture, not captures of a running page) are in
`docs/screenshots/places-tidy/`, at 1440 and 390 in both engines, in the **with a picture** state.

⚠️ **Chromium did not hang this time.** The fault from yesterday is still in the machine; this harness
makes two `evaluate` calls per page and takes no element screenshots, and it completes in both engines.

---

## ⛔ ONE HONEST GAP: `scripts/schedule-places-render.cjs` DOES NOT RUN, AND HAS NOT FOR DAYS

I extended it first and found it throws **"the fixture cannot be built"** before measuring anything — at
`HEAD`, on a clean tree, so not from this work. Two stale lifts:

1. the shared `Toggle`'s geometry moved into a `compact ? 'w-[38px] h-[22px]' : 'w-11 h-6'` ternary, so
   the lift pinned to `relative w-11 h-6 rounded-full transition-colors` cannot match;
2. the Add event type picker stopped being `<select id="event-type-select">` and became a pill row
   (`data-event-type-pills`) — which three of its fixtures still lift, and five of its assertions still
   compare against the Van select's height.

**A fixture that cannot build is not a failing test, it is no test.** It exits 1, so the run looks loud —
and meanwhile *every* measurement in that file, including ones about screens with no toggle and no
picker, has been silently unmeasured.

**I did not half-fix it.** (1) is a two-line repair; (2) means re-aiming assertions about the Add event
modal, a screen this build did not touch, and I would rather you decided that than have me quietly
rewrite claims about someone else's work. I reverted my edits to it so this commit's story stays clean.
The Places tab is measured by the new file instead. **Say the word and I will repair it.**

---

## 6 · WHAT TO TEST ON LOCALHOST — Pizza Kitchen only

Open `http://localhost:3000/manage/<Pizza Kitchen's token>?tab=schedule&section=places`.
⚠️ **If the Places pill is not there, do the grant at the top of this report first.**

1. **The pill row.** Pick a place. One pill is black (selected). Press **Private** — it turns purple with
   a lock and nothing else changes. Press **Standard** again. Reload: the pill you left selected is still
   selected.
2. **A place you have never set.** Pick one you have never touched. A pill is already selected — Standard
   if it has no history, otherwise the type of its most recent event — and **no pill says "Automatic"**.
3. **The pill is what Add event picks.** Note the pill on a place. Open **Add event**, choose that place:
   the form's type pill row should pre-select **the same type**.
4. **…and Add event does not write back.** In that same form, change the type to something else and save
   the event. Go back to Places and open that place: **the pill must be unchanged**.
5. **The list labels.** Every row shows a dot and a type name, or a purple lock and "Private". A place
   pinned to Private shows the lock. Check one with a long name — the **name** truncates, the type does
   not.
6. **Hidden places.** Open a place, **Hide this place**. It does **not** vanish: it moves to a
   **HIDDEN PLACES** section at the bottom, greyed. Type part of its name in the search box — it is still
   findable, in that section. Open it and press **Restore this place**; it returns to the list above.
7. **What is gone.** No "Events here" box under the fields, none at the bottom of the page, no
   **Favourite** button in the detail, and no "Your own pictures" section. The **star on the list row
   still works** — tap it and the place moves to Favourites.
8. **Picture for posts — no picture.** A place with no picture shows a "Standard design" tile and *"Event
   posts here use your standard design."* Press **Upload a picture for this place**, choose a PNG or JPG
   **the same shape as your standard design**. It should save in place, show a thumbnail and the
   dimensions, and give you Replace / Text positions / Remove.
9. **…and a wrong-shaped one is refused with a sentence that names both shapes.** Try a square image
   against a 1080×1350 standard design.
10. **Text positions.** Press it. ⛔ **It must land on Social posts › Single event — NOT on Billing.**
    This is the bug; Pizza Kitchen is on `trial`, which is the plan it needed.
11. **Remove.** Press it, confirm. Back to the "Standard design" placeholder.
12. **The other repaired link.** From Social posts › Single event, the **"Places"** pointer must open
    Schedule › Places, not Billing.
13. **The emailed link.** Paste `http://localhost:3000/manage/<token>?tab=schedule` into a fresh tab. It
    must open **Schedule**, not Billing. (This is the link the scraper emails.)
14. **Phone width.** Narrow the window to ~390px. The list is the screen, the pills wrap to two rows
    rather than scrolling sideways, and nothing scrolls the page sideways.

---

## Files

| File | |
|---|---|
| `components/manage/PlacesTab.tsx` | `PlaceTypePills`, `placeTypeId` (one derivation, read by the pills AND the list), `PostPicturePane`, `typeLabelFor`; `UsualTypeSelect`, `PicturesPane` and `EventsHere` deleted; `key` on `PlaceDetail` |
| `components/manage/SchedulePlaces.tsx` | `PlaceList` gained `typeLabelFor` and `hiddenSection`; `PlaceDetail` lost the Events-here card and the Favourite button; `PlacePicture` / `PlaceEventRow` deleted |
| `app/api/manage/route.ts` | five actions deleted (−201 lines, +84 of tombstone and corrected prose); `PLACES_TAB_ONLY` down to one entry |
| `lib/manage-links.ts` | **new** — the one link builder |
| `app/manage/[token]/page.tsx` | `urlAskedForTab`; `token` passed to `PlacesTab`; two `?tab=billing` literals through the builder |
| `components/FeatureGate.tsx`, `components/manage/EventPost.tsx`, `app/api/inbound-schedule/route.ts` | links through the builder |
| `lib/copy/serviceSettings.ts` | `POST_PICTURE_STANDARD_NOTE` |
| `scripts/places-tab-render.cjs` | **new** — the render measurement, listed in `scripts/harnesses.json` |
| `scripts/places-tab.cjs`, `places-posts-gating.cjs`, `schedule-graphics-places.cjs`, `screenshot-truck-details.cjs`, `private-events.cjs` | re-aimed; the `test-truck` fixture fix |
| `docs/reference-manual.md` | **V14.2**; §64.9 amended in four places; **§64.10** added for the link builder |

---

## Open items for you

| | |
|---|---|
| **Deploy** | not done. `git push origin main`, then §74.6's live checks |
| **The grant SQL at the top of this report** | not run. Three statements, read / change / verify |
| `scripts/schedule-places-render.cjs` | does not run at `HEAD`; two causes named above. Your call |
| `public.place_pictures` + its storage objects | in the database, read by nothing. ⛔ Do not drop without asking |
| The thumbnail's `event_load` read | works, not cheap. A one-URL action is a small addition if you want it |
