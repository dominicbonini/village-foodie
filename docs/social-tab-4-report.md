# Social media, round 4: one shared text style, a full-width editor, a caption you can edit, three pictures, and a font upload that works

**9 October 2026.** Worked on `main`, locally. **Nothing pushed and nothing deployed.** I ran no SQL.

---

## 0 · READ THIS FIRST

### One thing differs from the brief as written, and it is in §5

⛔ **The brief's default caption template reads `Pizza Kitchen at {venue}, {area} on {day-date}, {times}.` — and I have dropped the literal "on".**

🔴 **`{day-date}` already carries it.** The label is not a bare date: it fills through `whenPhrase`,
which returns `"tonight"`, `"tomorrow"` **or `"on Tue 13 Oct"`** — the word is part of the phrase, and
has been since templates were added, precisely so a truck does not have to type "on" and then lose it
the week the event is tonight.

So the brief's literal text produces:

| Event | The brief's text | What ships |
|---|---|---|
| Next Tuesday | `… Lavenham **on on** Tue 13 Oct, 17:00 – 20:00.` | `… Lavenham on Tue 13 Oct, 17:00 – 20:00.` |
| Tonight | `… Lavenham **on tonight**, 17:00 – 20:00.` | `… Lavenham tonight, 17:00 – 20:00.` |

⚠️ **The brief does not ask for `{day-date}` to change**, so the conflict is between its default's
wording and a behaviour it leaves alone. Dropping the literal is what makes the two agree — and it has
a second benefit worth more than the first: **the seed now fills byte-identically to the caption
`caption.ts` has always written**, so a truck who has never opened the editor sees the words they have
always seen. A harness check asserts that equality and is what caught the doubling.

⚠️ **If you want the brief's text literally, say so and I will put the "on" back** — it needs
`{day-date}` to become a bare date, which changes what every truck posts.

### The SQL, and what happens before you run it

⛔ **`supabase/migrations/20261022_three_location_pictures.sql` has not been run.** The read-only check
and the migration are both in the chat reply.

🔴 **Until you run it, Location settings answers 503 and names the file.** That is deliberate and it is
itself a fix: until this round, `social_overview` named a column that did not exist, PostgREST answered
`42703`, **the error was never looked at, and the screen drew "No locations yet." over twenty-one
locations.** A wrong answer delivered confidently is worse than an error. The local-check script found
it, and the script now stops with that message rather than reporting twenty failures.

⚠️ **`MIGRATION_NEEDED` also named the wrong migration** — 20261020, which you have already run. An
operator following it would have re-run a migration that was fine and still had a broken screen. It
names 20261022 now.

### The behaviour change you will see on an existing design

⚠️ **Every existing design opens looking identical, and the harness drives that.** The shared style is
taken **from the design** on read — the look of its first enabled text box, Date first — and then every
box is asked whether its own look already equals that: equal ⇒ it follows, different ⇒ it keeps its own.

⛔ **A flag defaulted to `false` would have silently repainted a Permanent Marker heading in Oswald**, on
exactly the designs that had been worked on the most. That is why the flag is derived by comparison
rather than defaulted.

---

## 1 · Section by section

| § | What it asked for | Done |
|---|---|---|
| **1** | Remove the two "Used for:" lines | ✅ |
| **2** | Full-width editor; poster fitted and scaled; "− Fit +"; one 380px panel; compact settings; switch knobs fixed; font list inside the panel; nothing lost | ✅ |
| **3** | "All text" — one shared style, follow-or-own per box, the three notes, "Size: Smaller \| Bigger", old layouts identical | ✅ |
| **4** | Town → Area; the location note; "Venue name" in Tidy up places | ✅ |
| **5** | The next-event card, the picker, the editable caption, "✎ Edit template", `{venue}`/`{area}` | ✅, with the "on" above |
| **6** | Three picture boxes, the ✓/– columns, the two borrow links, drag-and-drop | ✅ |
| **7** | `event_photo_picture_id`, the dead columns, the migration | ✅ |
| **8** | The upload button at the top, always enabled, with an inline card | ✅ |

---

## 2 · §3 · "All text" — the deepest change

### What it replaces, and why a bulk copy was the wrong shape

⛔ **"Copy this style to all text" was a one-way bulk write.** It stamped eleven copies of one style onto
eleven boxes — so the next change meant eleven more presses, and **nothing in the data recorded that
the boxes were ever meant to match.** An operator changing the shared font a week later had no way to
know which boxes had been copied from which.

🔴 **A shared style is a relationship.** `layout.textStyle` holds the look; a box either follows it or
owns its own. Change the shared font and every following box changes for ever, not once.

### The split, and the one judgement call

| Shared (`TextLook`) | Per box, for ever |
|---|---|
| `fontId`, `bold`, `italic`, `caps`, `color`, `letterSpacing`, and **all** of `effects` | what it says (date style, words before), `fontSize`, `x/y/w/h`, `align`, `tilt`, `ifTooLong`, `enabled` |

⚠️ **`lineSpacing` is per box and the brief names it neither way.** It is in the same Advanced group as
letter spacing, which **is** shared — but it multiplies the drawn height of a box's text, so it belongs
with size and position rather than with colour. Sharing it would silently change the height of every
multi-line box when a truck adjusted one. **Said out loud because it is a judgement call, not a reading
of the brief.**

### One resolver, which the brief required

```
lib/weekly-post/layout.ts        resolveTextBox(look, box)
          ▲                                   ▲
          │                                   │
lib/weekly-post/render.ts            components/manage/DesignEditor.tsx
  (every boxEl call site)              (what the panel's controls show)
```

⛔ **Two functions answering "what does this box look like" is how a preview comes to disagree with the
PNG**, and this product has shipped that class twice already (two background colours on one editor and
one on the other; a colour control that drew an empty well in Safari, written twice).

⚠️ **`LOOK_KEYS` is `satisfies`-checked against `TextLook`**, so a field added to one and not the other
cannot compile.

### The subtle half: `fontsUsedBy`

⛔ **A following box still carries its old `fontId` in storage.** Reading the raw field would load a face
nothing uses — and, the half that actually breaks a poster, **would fail to load the shared one**. So
every following box would fall back to Oswald in the PNG while the editor showed the right family name.
Both `fontsUsedBy` and `fontsUsedByEvent` resolve first. (`town` joined the second list at the same
time; it was missing, which was harmless only while it could not have a font of its own.)

### What the harnesses said about this, unprompted

🔴 **Four fixtures were silently testing nothing, and every one of them said so.** This is the most
useful thing that happened in this round and it is worth recording in full:

| Where | What it reported |
|---|---|
| `weekly-post.cjs` V20 | **"MUST FAIL BUT PASSED."** The fixture gave a note box a red band; the box followed All text, so `resolveTextBox` replaced its `effects` and both renders came out identical |
| `design-editor.cjs` §2 | **Nine effect variants stopped being detectable** — every shadow, outline and band case, plus Italic and Letter spacing |
| `design-fonts.cjs` | **Three font renders drew Oswald.** `withFont` set `fontId` on the boxes, not on the shared look |
| `design-fonts.cjs` | **The real-italic-vs-shear comparison** compared two identical images |

⚠️ **None of these is a workaround.** Each fixture now says the true thing: a box with a band the shared
style does not have **is** a box with its own style, and setting a look field on a following box is a
write nothing reads. **Which is also the lesson for the product** — and it is why the settings panel
does not draw a following box's font and colour at all.

### The three notes

| State | What the panel shows |
|---|---|
| **All text** selected | the shared settings, "Size: Smaller \| Bigger", and an amber note naming any own-style boxes with "Match it again" |
| a box that **follows** | a blue "🔗 Same font, colour and effects as All text · **Change just this box**", then only Shows, Size, Line up and MORE OPTIONS |
| a box that **owns** | an amber "Own style · **Match All text again**", the full style settings, and "**Use this style for all text**" at the foot |

⛔ **"Change just this box" copies the shared look in and marks it own in the same commit.** Flipping the
flag alone would reveal whatever stale look the box carried in storage — on an old design, a font nobody
has used for months — so the box would visibly change the instant the operator asked to change *just
this box*, before they had changed anything.

🔴 **"Use this style for all text" makes every box follow, including the other own-style ones.** A version
that left them alone would be "use this style for all text except the ones that disagree", which is what
the operator pressed the link to stop.

---

## 3 · §2 · The editor

### Full width, and why the page grants it rather than the pane taking it

⛔ **The content is capped at `max-w-5xl` above 1400px** — 1024px of a 1728px window — so an editor asked
to use the full width could not, however it was built.

⚠️ **The obvious trick is wrong.** `margin-left: calc(50% - 50vw)` breaks out of any centred container —
and `vw` **includes the vertical scrollbar**, so on any page tall enough to scroll it overflows by ~15px
and the page pans sideways. Over a drag surface, a sideways pan is a lost gesture.

🔴 **So the pane asks and the page answers**: `onFullWidth` → `socialWide` → `wideContent`, which drops
the cap and widens the gutter to 24px on both the sub-tab bar and the content. The pane reports `false`
on unmount, and the page also checks the active tab — a stale `true` would silently widen Settings.

### The poster is fitted, not capped

⛔ **`maxHeight: min(64vh, 820px)` was a guess at how much of the window the poster may have, and it was
wrong in both directions.** On a 16-inch window 64vh left a third of the height unused; on a short window
the title row, the hint and the zoom control pushed the bottom of the poster off the screen, because none
of them was counted.

🔴 **The grey area is measured and the poster is `min(areaW, areaH × ratio)`** — which is what "the largest
size that fits, both width and height" actually means. Only a layout engine knows what the rows above it
took.

⛔ **And `clientWidth` includes padding.** The first version read it straight, so on a 390px phone the area
measured 366 and the poster was fitted to 366 inside a 342px content box — **the area scrolled sideways at
Fit, where nothing should scroll at all.** The padding is subtracted from the computed style now, not
hard-coded, because `p-3` is a class somebody will change. **The render harness caught this.**

### The panel

One 380px column, sticky above 1100, under the poster below it. The item list is **inside** it.

⛔ **A 250px list on the far left and a 320px panel on the far right were the two halves of one job with
the poster between them** — picking a box and changing it was a 1,000px round trip, and on a 16-inch
window the poster was still only getting the middle third.

⚠️ **The list's live grey samples are a real loss.** "Date · Wednesday 14th October" told an operator what
would be on the poster in that design's own setting; two across has room for a name, a switch and an
"own" badge, and not for a sample. What replaces them is a poster big enough to read. **If you want them
back, the row has to be one-across and the panel gets taller.**

⚠️ **"Each row" survives**, because the weekly post has seven of them — without it the list reads as "one
date, one place, one time" and the operator places their boxes for Monday and wonders where Tuesday went.
On a single event design that group is empty and the heading does not render, so it does not contradict
§2's list.

### The switch knob — the reported bug, and why it happened

⛔ **It was positioned by a transform from an `auto` left edge:**

```
<span className="absolute top-0.5 w-4 h-4 … translate-x-4 / translate-x-0.5" />
```

🔴 **`absolute` with no `left` uses the element's *static position*** — a property of the inline formatting
context it would have had, not a reliable 0. The knob is the only child of an empty `block` span, so where
that lands is engine-dependent; in Safari it resolved outside the track's left edge and `translate-x-4`
carried it out the other side. **A box positioned relative to "wherever it would have been" is not
positioned at all when there is nothing to be relative to.**

⚠️ **Both edges are stated now and nothing is transformed**: `left-0.5` off, `left-auto right-0.5` on, on a
36 × 20 track with a 16px knob. **Measured against its own track in WebKit**, which is the only way to
catch it — a class census sees `translate-x-4` and cannot tell where the element it moves started from.

### The font list

⛔ **`w-[22rem]` is 352px — wider than the 380px panel's content box** — and the `calc(100vw-2rem)` cap could
not help: on a 1728px window that is 1696px, so the list opened at its full width and ran past the right
edge of the column it lives in. **A cap against the wrong container is not a cap.** `w-full` is the fix,
with the viewport cap kept for the one case it cannot cover.

---

## 4 · §5 · Create a post

The card is one chosen event, three rows to change it, the rest behind a press, and one editable caption.

⛔ **What went, and why each one mattered:**
1. 🔴 **The date was first and the venue third, in grey.** An operator knows their events by *where* they
   are. The venue leads now, 21px and bold, with the area under it and "Wed 14 Oct · 11:00 – 14:00"
   semi-bold below.
2. ⛔ **A "Make post" button on every row was a second door to one modal** — and it skipped the caption box
   entirely, so an edited caption would have been silently discarded for every event but the first. A row
   **chooses**; one button posts. `onArea`-style discipline: there is exactly one `onPost(` call.
3. ⚠️ **The three soonest events were behind a press.** A truck's next few days is what the card is for.

🔴 **The caption is filled on the client, by the same two pure functions the server uses** —
`fillCaptionTemplate` + `eventCaptionValues`. That is what makes "pick another event" refresh it with no
round trip, and it is only safe because there is one implementation of "what does this caption say". The
overview sends the three per-truck facts it needs (`captionBits`: order link, clock style, country); the
per-event half is already on the rows.

⚠️ **The operator's caption travels into the modal and is what Share copies** — `captionOverride`, compared
with `!== undefined` rather than `||`, because "not offered", "offered and empty" and "offered and typed"
are three different states. Schedule › Events' own "Make post" passes nothing, because that door has no
caption box in front of it.

### The weekly card's gap

⚠️ **The weekly caption box is seeded with the TEMPLATE, not a filled caption**, and that is a real gap.
`weekCaptionValues` needs the whole week's rows — seven days of entries with their times — and the
overview sends the week's **counts**, not its events. Filling it would be a second read this card has not
asked for. **The weekly Make screen still fills it properly**, which is where the operator actually copies
it from. Fixing it means adding the week's entries to the overview payload.

---

## 5 · §6 and §7 · Three pictures

| Column | Means | Read by |
|---|---|---|
| `weekly_picture_id` | the **weekly post** picture | weekly posts, **no fallback** |
| `event_photo_picture_id` | the **event post** picture | the single event design's picture space |
| `event_picture_id` | the **poster** | single event posts (replaces the design) |
| `weekly_only_picture_id` | ⛔ dead **and emptied** | — |
| `picture_use` | ⛔ dead | — |

⛔ **"One picture used everywhere" had two consequences nobody could see on the screen**: a logo chosen
because it suits a 180px line on a weekly poster was also the photo cropped into a 1080px space on an
event post, and the only way out was an override box behind a link that had to be found first.

🔴 **The convenience the override existed for is a link in each empty box.** "Use the event post picture"
points the slot at the **same stored row** — `place_slot_use` takes a picture id, so no file is uploaded
and none is copied. (`place_pictures_path_uidx` is a full unique index on `path`, so a copy is impossible
anyway.)

### The migration's guard

⛔ **`where event_photo_picture_id is null` alone is not idempotent in the way that matters.** The moment an
operator presses **Remove**, that column is null again — so a re-run a week later would put the weekly
picture back into a slot the truck had deliberately emptied.

🔴 **The guard is "has this migration run before?", asked of the schema itself.** §4 sets a comment on the
new column inside the same transaction, so the comment's presence is an exact record of a completed run.
No migrations table is assumed, because nothing here runs SQL and cannot rely on one.

⚠️ **And the two backfills are ordered**: (b) must read `weekly_picture_id` before (c) overwrites it, or
the weekly override would be copied into the event photo as well — which is the one thing neither surface
draws today.

### What the three boxes lost

⚠️ **The poster box's tile no longer shows the target shape.** It took its aspect ratio from the standard
design, so an empty poster box said what shape was wanted without a number — and three boxes of equal
size, which §6 asks for, cannot do that. **An operator uploading their first poster now sees the target
shape only in the refusal if they get it wrong.** The refusal still names the size.

⚠️ **`object-cover` → `object-contain` is a gain, in the same change**: the preview no longer crops, so a
wide logo is shown whole rather than as its middle third.

---

## 6 · §8 · The font upload

⛔ **The order was backwards.** The file input was **disabled until the licence tick**, at the bottom of a
capped list of forty rows — so the one thing an operator with their own font came here to do was the
thing furthest from the top, greyed out, with the explanation above it in small grey text. **You cannot
sensibly claim a licence for a file you have not named yet.**

🔴 **The button is beside the search box and is always enabled; the tick gates "Add font".** Nothing is
uploaded until that press, which is the property the old order was protecting — and the server still
refuses an untipped confirm, because a client-side gate is advice.

---

## 7 · Checks

| | |
|---|---|
| `npx tsc --noEmit` | ✅ clean |
| `npx next build` | ✅ compiled successfully |
| Lint on the files I touched | ✅ no new errors or warnings. `app/manage/[token]/page.tsx` has a 286-error pre-existing baseline — **286 before and after**, verified against `HEAD` |
| `node scripts/run-harnesses.cjs` | ✅ **98 run · 98 passed · 0 failed** |
| `node scripts/social-posts-render.cjs` | ✅ WebKit, three widths: the two-column editor, the fitted poster, the sticky panel, **the switch knobs**, the font list |
| `node scripts/social-tab-render.cjs` | ✅ Chromium **and** WebKit: §5's card and caption, §6's three equal boxes, the ✓/– columns, the two-line names |
| `node scripts/social-tab-4-local.cjs` | ⚠️ **stops at the migration gate**, which is the correct behaviour until you run the SQL. Everything before it passes |

### Three bugs the render harnesses found in my own work

⚠️ **Recorded because each was my assumption and the browser refused it:**

1. **`clientWidth` includes padding.** The poster was fitted to 366 inside a 342px content box, so the
   area scrolled sideways at Fit.
2. **`block` defeats `line-clamp-2`.** Both set `display`; whichever rule is later in the compiled
   stylesheet wins, and `block` won — the location names wrapped to **three** lines.
3. **A lift with no capture group returns `undefined`.** The fixture rendered `class="undefined"` and
   reported a 0px preview. A lift whose pattern captures nothing hands back nothing, silently.

### And two checks that pinned the code as it was *before* my own last two fixes

⚠️ **Worth recording, because it is a hazard of fixing a thing and its check in the wrong order.** I ran
`social-posts.cjs` and `design-editor.cjs` green, then made two late fixes the render harnesses had
asked for — removing `block` from the location name, and subtracting the padding from the measured area
— and both source harnesses then failed on their next run, because each was asserting the *old* string.

🔴 **The full sweep is what caught it, not the targeted re-runs.** A harness that passed an hour ago is
not a harness that passes now; the only honest signal is the sweep after the last edit. Both checks now
assert the FIXED shape **and the absence of the broken one**, so neither can be put back quietly.

### Checks I retired, and why

⛔ **Three claims lost their subject and are tombstoned rather than deleted:**
- "below 900px the list becomes chips" — the list is inside the panel, so there is no width at which it
  is absent. The markup went with the claim; keeping it would have left `min-[900px]:hidden` inside a
  column that only exists above 1100.
- "the *More events* list scrolls inside itself" — the picker shows three rows always and expands in
  place. What replaced it is a containment claim, which is the property the old `max-h` was protecting.
- "both slot thumbnails are `shrink-0`" — the tiles are a ✓ or a – in a `table-fixed` 44px column, which
  is a stronger guarantee than `shrink-0` ever was.

---

## 8 · Your localhost test list — Pizza Kitchen only

**Run the SQL first.** Until you do, Location settings will say so by name.

**The editor, at about 1728 × 1000 and at 1100**
1. Social media › Designs › **Edit weekly design**. → the page uses the full window; the poster fills the
   grey area; nothing needs page scrolling.
2. **"− Fit +"** under the poster. → + zooms and the grey area scrolls; **Fit** comes back exactly.
3. Every switch in the panel. → **the white knob is inside the green track**, right when on, left when off.
4. Open the **Font** list. → it opens inside the panel and never past its right edge; the list scrolls
   within itself.
5. Open **MORE OPTIONS**. → the panel scrolls inside itself; the poster does not move.
6. Narrow to ~1050px. → the panel drops under the poster.

**All text**
7. Select **All text**, change the colour. → every following box changes.
8. **Size: Smaller / Bigger.** → every text box scales together, keeping its relative size.
9. Select **Date** → the blue note. Press **Change just this box** → the full style settings, and an "own"
   badge on its button in the grid. Change its colour; All text no longer moves it.
10. On that box, **Use this style for all text** → it becomes the shared style and every box follows.
11. Back on **All text** → the amber note names any box still on its own, with **Match it again**.
12. **Open an existing design and check it looks the same.** This is the one that matters.

**Create a post**
13. The venue is first and large; the area is under it; the date and times below that.
14. Pick a different event from **OR PICK ANOTHER EVENT**. → the top section and the caption both refresh,
    and the button reads "Create post for this event".
15. Type in the caption, then **Create post**. → the share step copies **your** words.
16. Reload. → your typing is gone and the template is unchanged. That is correct.
17. **✎ Edit template** → the chip editor, **Save template** → the caption above refreshes.

**Location settings**
18. Three equal boxes side by side; the LOCATION / WEEKLY / EVENT / POSTER columns show ✓ or –.
19. Drag a file onto an empty box. → it uploads.
20. With one picture set and the other empty → **"Use the event post picture"** appears in the empty one.
    Press it. → both columns show ✓ and no second file was uploaded.
21. **Remove** → only that slot clears; the other two are untouched.
22. Long venue names wrap to two lines instead of being cut off.

**The posters**
23. Make a weekly post and a single event post. → the right pictures, and "Powered by HatchGrab".

---

## 9 · What is left open

| | |
|---|---|
| ⛔ **The brief's literal default caption double-prints "on"** | dropped, for the reason in §0. **Your call** if you want it the other way |
| ⚠️ **The weekly caption box holds the template, not a filled caption** | the overview sends the week's counts, not its rows. The weekly Make screen fills it properly |
| ⚠️ **The item list lost its live grey samples** | two across has no room for them. **Your call** |
| ⚠️ **An empty poster box no longer shows the target shape** | three equal boxes cannot each take a design's aspect ratio. The refusal still names the size |
| ⚠️ **`picture_use` and `weekly_only_picture_id` still exist** | read by nothing; the second is emptied. Dropping a column is irreversible |
| ⚠️ **Three dead symbols in `app/api/weekly-post/route.ts`** | `weekCaption`, `kindOf`, `readPlaceSlots` — all left over from round 3, all out of this brief's scope. Named so they are not mistaken for mine |
| ⚠️ **Curved text is not started**, as instructed | |
| ⛔ **Nothing is deployed** | you deploy by hand |
