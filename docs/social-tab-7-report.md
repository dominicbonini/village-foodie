# Social media tab — round 7

**10 October 2026 · not deployed · no migration · one truck touched (`test-truck`, Pizza Kitchen)**

The brief: *instant text in the editor, clearer buttons, delete own text, location picture fixes.*
Curved text is still not in this round.

---

## 0. The short version

| § | What was asked | What happened |
|---|---|---|
| 1 | A long file name pushes the picture and **Remove** out of their box | Fixed — and then fixed **again**, differently, after the operator looked at the screen. The file name is **gone** at his request, the boxes are flex columns instead of a subgrid, and the borrow link was moving one Upload button 11px |
| 2 | The editor draws **all** the writing live | Done. The poster tree left `render.ts`; the editor and satori are now handed the **same objects**. 0.26ms per frame, no network, measured against the PNG's own pixels in two engines |
| 3 | A blank-picture click must not change the selection; the background becomes a folded section at the foot | Done |
| 4 | "Aa Style all the writing" with a grey second line; a `›` on every ON YOUR POST button | Done |
| 5 | One shared fold arrow, 18px, whole heading row clickable | Done |
| 6 | Delete your own text — button, key, undo, no confirm | Done, and driven as a real gesture against the mounted editor |
| 7 | Nothing cut off from 1000px up | Done, measured at five widths in two engines, with a control that reproduces the cut |
| 2b | **The live text was in the wrong place** — reported after §2 shipped | Cause found by measurement, not by reading: the live layer's `transform-origin` came from a Tailwind class **that no compiled stylesheet contained**. §2b is the whole account |
| + | Four extra requests made during the round | All four done — chips that delete and move, a template save that shows, single event before weekly, and the font-size control |

**One rule was deliberately not broken, and it cost §2 some fidelity:** an uploaded font is never sent
to a browser. Boxes in an uploaded family draw live in Oswald and in the real font in the PNG, and the
editor now says so in a line under the poster. §2.6 has the whole list of known differences.

---

## 1. Location settings — the picture boxes

### 1.1 What was asked, and what the operator then said

The brief described one bug: *"a long file name ('Screenshot 2026-10-05 at 11.11.21.png') makes the
picture and file name overflow their box, pushing Remove out of sight."* It asked for `min-width: 0`
on the grid items, a contained and centred preview, the file name cut short with "…", and Remove
always visible on the right.

That was done first, and it was a real fix with a real cause. **A grid with no
`grid-template-columns` puts its children in one implicit column sized `auto`, and an auto column
grows to its contents' max-content width.** The un-truncated file name sized the column, the column
exceeded the box, and everything in it was drawn outside — measured in WebKit and Chromium, with
Remove's right edge **59px outside its own box**. `grid-cols-[minmax(0,1fr)]` is the fix, and it is
the brief's own words: a zero minimum on the grid item.

Then the operator opened the screen, and said four more things:

1. *"music festival has photos uploaded but the pictures are wider than the box they're in. the
   remove button is not in the box either"*
2. *"and also remove the photo name eg Screenshot 2026-10-05 at 11.11.21.png"*
3. *"when the images are empty in location settings, make sure the upload box lines up as currently it
   sits below the text which have different lengths. best to move the upload box to the bottom so they
   line up"*
4. *"and that should be the same when they are uploaded the images should line up"*

### 1.2 What I could not reproduce, and said so rather than guessing

(3) is the important one, because **the upload boxes not lining up means `grid-rows-subgrid` was not
working on his screen.** That mechanism is the whole reason the rows line up at all.

So I checked rather than assumed:

- the **running dev server's own stylesheet** carries `.grid-rows-subgrid`,
  `.grid-cols-[minmax(0,1fr)]` and the pane's `minmax` track — fetched from
  `/_next/static/chunks/…css` and grepped;
- the compiled production CSS carries them too;
- the WebKit and Chromium measurements passed at 1100, 1280 and 1728.

**I could not reproduce it, and this report does not pretend otherwise.** The dashboard is behind a
login this session has no way into, so the one thing that would have settled it — looking at the real
page — was not available.

### 1.3 So the mechanism was replaced rather than attempted a second time

Subgrid put the alignment in the hands of a layout feature whose failure mode I cannot see from here.
What replaces it cannot have that failure mode at all:

- **each box is a flex column, with `grow` on the DESCRIPTION.** The grid still stretches the three
  boxes to one height — that part was never in doubt — and the description absorbing the slack pushes
  the preview area and the Remove row to the **foot** of every box. Two fixed heights above the bottom
  edge of three equal boxes is the same y **by arithmetic**, not by a track-sizing rule.
- **the footer row is `h-7` whether or not there is a picture.** This is the part that would have
  broken it: the row is empty in an empty box, so bottom-aligning without a fixed height would sit an
  empty box's preview 28px lower than a filled one's — (4) failing between exactly the two states the
  screen shows at once.
- **nothing in the box reports a max-content width any more**, because the file name is gone.

**What is lost:** the title and the description are no longer forced to equal heights between boxes —
only everything from the preview down is. That is invisible today because all three titles are one
line, and if a title ever wraps in one box only, the descriptions will start at different heights.
They already end at different heights and always will, so this is the honest trade.

### 1.4 The file name

The brief asked for it truncated with an ellipsis. The operator asked for it **removed**, which is the
later instruction and the better one: a Supabase file name tells a truck nothing the preview above it
does not, and it was the only thing in the box that ever reported a max-content width. `file_name` is
still stored and still sent by the route; only the line is gone.

### 1.5 A bug the measurement found that nobody had reported

With the file name gone and the boxes bottom-aligned, the harness reported the Upload buttons at
**303 / 314** — 11px apart. The cause: **only one box is ever offered "Use the event post picture"**,
so that box's centred stack was one line taller than the others', and centring put its Upload button
higher. The borrow link is `absolute` at the foot of the drop area now, out of the flow, so Upload is
centred on the same two lines in every box — offered a borrow or not.

A reading of the code would not have found this. A measurement did.

### 1.6 Copy

- the third box is **"Location poster"** — "(optional)" is gone
- its description: *"Got a ready-made poster for this location? Upload it and we'll use it instead of
  your single event design."*
- every empty drop area says **"Drop it here"**

---

## 2. Instant text in the editor

### 2.1 The bug

*"when i move a box the text stays in its old position for seconds."*

The stage was an `<img>` of the server's PNG. A drag moved the **outline** at once and the **words**
waited 400ms of debounce plus a render. Every move, resize, restyle, font change and colour change had
the same lag, and the words you were looking at were the words from the last render — in the last
position.

### 2.2 The design, and why the refactor came before the feature

The brief's condition is exact: the editor must use *"the same layout functions as the renderer
(`resolveTextBox`, `dayCells`, the same fitting rules) and the same font files"*.

**The renderer never built HTML.** It built a tree of `{ type, props: { style } }` objects and handed
them to satori, which is a flexbox engine reading CSS. So the tree does not need **translating** for a
browser — it needs **mounting** in one.

That is the whole design:

```
lib/weekly-post/draw.ts        the poster, as a tree.  PURE.  no next/og, no fs, no fetch.
  ├── weeklyTree()  eventTree()        the whole child list, in paint order
  ├── boxEl / lineEl / daysEls / noteEls / placePictureEl / darkenEl / poweredByEl
  │
  ├──→ lib/weekly-post/render.ts       one ImageResponse call → the PNG a truck posts
  └──→ components/manage/LivePoster.tsx  mounts the same objects as DOM, in the drag's own frame
```

Everything that decides what the poster **looks like** is above the fork. `render.ts` is now the I/O
and the one call to satori, which is all that was ever server-only.

**A second implementation in the editor was the obvious route and is the one this product has already
been burned by.** "What does this box look like" and "what does this box say" each had two answers
once before, and both drifted. One tree cannot drift from itself.

### 2.3 What moved, and what it cost

`lineEl`, `boxEl`, `noteEls`, `placePictureEl`, `pictureForEntry`, `darkenEl`, `dateLines`, `daysEls`,
`poweredByEl`, `renderScale`, `caseOf`, `POWERED_BY`, `RenderWarning`, `PlacePictureSources` and both
tree assemblies. **Nothing changed in the move** except `input.note` → `note` and
`input.placePictures` → `placePictures`, which are parameters now instead of fields of a render
request.

The cost was in the harnesses, and it was worth recording:

- five of `weekly-post.cjs`'s 35 broken-variant **anchors** now patch `draw.ts`. Each was repointed by
  file name only — the anchored line is byte-identical.
- the "the event renderer reuses `boxEl`, the mark and `paint`" claim read `renderEventPost`'s own
  body, which is five lines now. It is a claim about `eventTree` and the shared tree instead, which is
  **stronger**: it asserts the event poster's tree is built by the function the live editor calls.
- its first rewrite asserted `!/next\/og/.test(draw)` and **failed on correct code**, because
  `draw.ts`'s own header explains that it imports no `next/og`. A claim about a dependency has to read
  the import, not the words.
- `place-pictures.cjs`'s private-event refusal and its "Powered by HatchGrab is last" claim moved the
  same way; the latter also now asserts there is exactly one `paint` call per renderer, so neither can
  assemble a poster of its own behind the shared one.
- `design-fonts.cjs`'s two claims about `boxEl`'s metrics and the 12° faux-italic shear moved too, and
  the second gained a half it did not have: **`skewX` must not appear in `render.ts` at all**, so the
  drawing cannot have been quietly copied back.
- `design-editor.cjs` lost the "the darkening is visible before the next PNG arrives" claim and gained
  §2's own — the stage draws the blank whenever there is a live tree, the tree comes from the
  renderer's own builders, the fonts are the renderer's own files, the times are re-derived through
  `timeTextFor`, `LivePoster` contains no `fitLines` / `dayCells` / `locationLinesFor`, and the GET
  still refuses an uploaded family.

### 2.4 The fonts

`fitLines` shrinks, wraps and truncates using the font's own advance widths. Without the real file the
live text would be laid out with somebody else's widths — a long place name would "fit" on screen and
be truncated in the PNG, which is **worse than a slow preview, because it is wrong rather than late**.

- `GET /api/weekly-post?font=<id>&w=400&s=normal&token=…` returns the TTF bytes, behind the same token
  and the same gate as every action in that file.
- `lib/weekly-post/live-fonts.ts` parses that one `ArrayBuffer` for `readFontMetrics` **and** hands it
  to `new FontFace(...)`. One request serves measuring and painting; a Google Fonts stylesheet would
  have painted and not measured.
- the face is **awaited** before anything is drawn live, so there is never a frame in the browser's
  default typeface.
- a library id is `g:lobster`, and a colon is not legal in a CSS font-family identifier. `liveFamily()`
  is the one alias function, shared by the registration and by `LivePoster`'s style mapper — a second
  spelling would register a face under one name and ask for it under another, and every box would draw
  in the default font with no error anywhere.

**An uploaded family is refused, deliberately.** `font_sample` states the rule where it is enforced:
an uploaded font may be commercially licensed, and a readable URL from our domain is redistribution of
somebody else's paid font. That rule is older than this round and §2 does not get to reverse it.

Driven against the running route on `localhost`, with Pizza Kitchen's token:

| Request | Answer |
|---|---|
| `font=oswald` | **200**, `font/ttf`, `Cache-Control: private`, and the bytes are **identical to the committed file** |
| `font=u:myfont` | **403** — "An uploaded font is not served to the browser." |
| `font=nope` | **200 with the fallback face**, and `X-Hg-Font-Family: Oswald` says so. That is `FontBundle.resolve`'s own ladder — a poster in Oswald beats no poster — and the editor registers it under the family the header names, so the live draw and the PNG take the same fallback. Only a `u:` prefix can ever name an uploaded family, so this cannot be used to reach one |
| no `font` | **400** |
| no `token` | **401** |

### 2.5 "Line spacing" measured and never drew — found while wiring this, fixed

`fit.ts` has always multiplied the line height by the operator's "Line spacing" when deciding whether
text **fits**. The element tree carried **no `lineHeight` at all**, so satori stacked every line at the
font's natural height whatever they chose: a box made tall enough for 160% and drawn at 100%.

`lineEl` now sets an explicit `lineHeight` per run, from the font's own metrics × the gap `fitLines`
measured with. Measured:

- **160% now stands 36px taller than 100%** on a two-line heading (92px → 128px of ink).
- **with that one property stripped out of the tree, the two become identical** (92 vs 92) — the
  control.
- **the PNG is unchanged at 100%**: 7 antialiased pixels of difference out of 1,458,000 on the full
  default design. That is what made it safe to add rather than a change to every poster ever made.

Every design saved before today is unchanged unless its owner had moved Line spacing — in which case
it now does what its label says.

**A wrong measurement nearly justified the right change for the wrong reason, and that is worth
recording.** The first reading said the live words sat **17px** above the PNG's and blamed the missing
`lineHeight`. The live bounding box had silently included "Powered by HatchGrab", 600px down the page.
With one line properly measured, a browser's taller line box is still *centred* on the same place, so
the ink lands within 2px either way — and the browser control I had written **could not fail**
(Oswald's `hhea` line gap is zero, so `line-height: normal` already equals our value). It was replaced
by the Line spacing control above, which can.

### 2.6 The known differences between the two painters

Listed because the brief asks for them, and because an operator should know what "👁 Preview post" is
still for.

| Difference | Why | Size |
|---|---|---|
| **An uploaded family draws live in Oswald** | the licensing rule in §2.4 | the whole typeface — **and the editor says so** in an amber line under the poster |
| **A real italic FILE in a library family** draws sheared live | the live bundle requests the upright face only (none of the 21 bundled families has an italic, so the renderer shears those anyway) | a slant angle |
| **A place's picture is not in the live tree** | the editor has no data URI for it; the box's outline is still drawn by the editor's own chrome | the picture is absent live, present in the PNG |
| **Line stacking in a font whose `hhea` line gap is not zero** | satori and a browser compute `normal` differently; the explicit `lineHeight` removes this for every font | nothing measurable in Oswald |
| **`letterSpacing` after the last glyph of a run** | the browser adds it, satori does not | sub-pixel to 1px at the right-hand edge |
| **Two flexbox engines** | yoga and the browser's | measured at **1–2px** horizontally and **2px** on the vertical centre |
| **The first moment after a font is CHANGED** | the new face has to be fetched; until it lands the live bundle is the old one and that box resolves to Oswald, exactly as the server would for a font it could not load | one typeface, for as long as one cached request takes — and it is a position the box already had, not a stale one |

Everything in that table is about how a word **looks**. None of it is about **where** a word is, which
is the bug §2 was given, and which §2.7 measures to 1–2px.

### 2.7 How this was proved

`scripts/live-poster.cjs` (new, registered in `harnesses.json` under `needs_a_browser`) renders the
same design **twice** and compares the pixels with the DOM:

- satori draws the PNG. It is rendered **twice more** — once with the heading on and once off — and
  the diff is exactly the pixels the words put on the page. That is `_png-decode.cjs`'s own documented
  use; my first version diffed against a white buffer it built itself and reported "no ink" on a PNG
  that demonstrably had black glyphs in it.
- a real browser mounts the **same `El[]` tree** through `LivePoster`'s own three translations, lifted
  from the component by regex so the fixture cannot drift from it — and the harness **throws** if any
  of them is no longer there.
- the same Oswald file, inlined as a data URI and registered with `FontFace`.

Results, in **WebKit and Chromium**:

- the live words start and end where the PNG's do — **live 60–512 vs png 61–511**
- the PNG's words sit **inside** the live line box, centred on the same height — **live 165.0 vs png
  167.0**
- a two-line box draws two lines, and the PNG's two sit inside them
- a moved box's words move with it, by the same 60px
- **the live page makes zero network requests**
- **0.26ms** to rebuild a full seven-row poster with the longest venue name in the schedule (60 trees
  in 15.7ms) — which is what "in the same frame as the drag" means in a number

**Four controls**, each restoring a failing shape rather than deleting a rule:

- last frame's words against a moved box — **the bug itself** — and the measurement refuses it
- `grow` off the description: the three picture areas sit at different heights, and so do the Upload
  boxes
- the footer's fixed height removed: a filled box's picture area parts company with the empty ones'
- every `lineHeight` stripped: 160% spacing draws exactly like 100%

### 2.8 The data

The editor knows where every box is and what it looks like. It does not know that Thursday is
Cavendish at 5pm.

- **the weekly design**: `WeeklyPost` fetches the chosen week once per "Preview with" change, with the
  same `load` action the PNG's week comes from. `showPrivate` is not sent — the design preview's own
  PNG does not send it either, so both leave private bookings out; the tick that shows them lives on
  the post screen.
- **the event design**: a new `event_preview_entry` action returns the entry and date through the same
  `eventPostContext` + `designPlaceId` name substitution `event_render` uses — so a place's design
  previews with that place's own name in the venue box, live, exactly as its PNG does.
- **both carry the choice they are for.** Switching week or event leaves the old answer in state until
  the new one lands; without the key the stage would draw last week's dates for a moment, which is
  this very bug reintroduced one layer up. A mismatch reads as "not loaded", so nothing has to be
  cleared and neither effect sets state synchronously.
- **the times are re-derived from the live clock.** `DayEntry.time` is formatted when the week is
  built, with whatever `timeStyle` was *saved*; the operator can change 12h/24h in the panel and the
  PNG follows at once. `timeTextFor` — the function `entryFor` itself uses — is now called by the
  editor, so there is one answer to what the Time box says.

### 2.9 The darkening

The stage shows the **blank** while the live tree is up, so there is nothing baked in and the layer is
simply `layout.darken` — the brief's "the darkening as a CSS layer at the same strength". The old
subtraction (`darken` minus what the PNG had caught up with) survives for the fallback, where the
stage is the PNG again and the old reasoning holds exactly. Both halves are asserted, because a
version that kept only one would be wrong in one of the two states the screen has.

### 2.10 When the stage falls back to the PNG

No fonts yet, no week loaded, the tree builder threw, or a design the builder cannot type. Every
control still works and the PNG is still correct — a degraded preview rather than a white screen.

---

## 2b. The live text was in the wrong place

### 2b.1 What was reported

> *"the box being moved and the words it holds are in different places. The 'Week heading' box is
> selected at the TOP-LEFT of the poster, but its words are drawn at the BOTTOM-RIGHT, cut off at the
> poster's edge. In the same screenshot, all seven rows of 'The 7 days' show NO words at all, only
> empty tinted cells."*

With a suggested cause — *"live text being placed in full-size poster pixels while the boxes are drawn
at the on-screen (scaled) size, or a missing offset or zoom factor"* — and an instruction: **find the
real cause; don't guess.**

### 2b.2 Every check I had was green, and that decided what to do next

This is the part worth recording, because it is a fact about the checks and not about the bug:

- **`live-poster.cjs`** compares the tree's pixels with the PNG's — and the tree was right. It is
  built by the renderer's own function and painted by satori for the comparison; the editor's own
  mounting is not in it.
- **`design-editor.cjs`** reads the source — and the source said all the right things.
- **`social-tab-6-local.cjs`** mounts the real editor — **on a mini-DOM with no layout engine**, so
  "where is this box on screen" is not a question it can be asked. Its own header already said so.

**Not one of them had the real component and a real layout engine in the same process**, so not one of
them could see a box and its words in different places. So the first thing built was the thing that
could.

### 2b.3 `scripts/live-text-place.cjs` — the real component, in a real browser

esbuild (already a dependency) bundles the real `DesignEditor` — with React, `draw.ts`, `days.ts`,
`fit.ts`, `live-fonts.ts` and `LivePoster` — into one browser script. A tiny local HTTP server serves
the page, the app's own compiled stylesheet, and `/api/weekly-post?font=…` answered with **the
committed Oswald file**, so the editor's own font path runs for real rather than being stubbed.

Then it asks the only question that matters: **for every word drawn live, is it inside the box it
belongs to?** Matched by geometry, because the live tree carries no box keys — it is the renderer's
tree and the renderer has no idea the editor exists.

**It found the cause on its first run, before measuring anything.** Its first version asserted that
`.origin-top-left` was present in the compiled CSS, and it threw:

```
Error: the compiled CSS has no `origin-top-left` rule — LivePoster depends on it
```

### 2b.4 The real cause

`LivePoster` scales the whole poster tree to the stage. It did that with a Tailwind class:

```jsx
className="pointer-events-none absolute left-0 top-0 origin-top-left"
style={{ width: `${W}px`, height: `${H}px`, transform: `scale(${k})` }}
```

**Tailwind emits only the utilities it finds in the source at build time, and `origin-top-left` is used
by exactly one file in this repository — that one, created the same day, after the build.** The dev
server rescanned and emitted it; **every compiled chunk under `.next/static` has no such rule at all:**

```
$ grep -c origin-top-left .next/static/chunks/*.css   →  NOT PRESENT in any built chunk
$ grep -c origin-top-left <the dev server's stylesheet> →  1
$ grep -rln origin-top-left components/ app/          →  components/manage/LivePoster.tsx
```

With no rule, `transform-origin` falls back to its default — **the element's centre**. Scaling a
1080×1350 layer about its centre instead of its corner, inside a 460×575 stage:

| | where it should be | where it went |
|---|---|---|
| the heading's words | 46, 64 | **540, 464** — past the right edge, well down |
| row 1's words | 51, 179 | 361, 566 — on the bottom edge |
| row 7's words | 51, 528 | 361, 916 — **341px below the stage**, clipped away by `overflow-hidden` |

**That is the screenshot, exactly: the heading's words at the bottom-right and cut off, and seven rows
of empty tinted cells.** The suggested cause — poster pixels versus screen pixels — was the right
family and the wrong member: the factor was correct and the *origin* it was applied about was not.

### 2b.5 The two fixes

**One.** `transform-origin: top left` is **inline**, in the same style object as the `transform` it
governs. A colour that goes missing from a stylesheet is a cosmetic regression; a `transform-origin`
that goes missing moves every word on the poster. **A load-bearing geometric property does not go in a
class** — it goes where nothing can decide not to emit it.

**Two, which the brief asked for in its own words:** *"live text and boxes use ONE shared conversion
from poster pixels to screen pixels, so they can never separate again."*

They had two. `LivePoster` took `shownW` — the width the stage is **asked** to be
(`fitW × 1.25^zoom`) — and divided it by the tree's width. Every box outline was placed with `scale`,
which is `stageW / background.width`, where `stageW` is the width a `ResizeObserver` **measured**. Two
numbers for one job, from two different readings of the same element. They happen to agree once the
observer has run, which is why this was never the cause of the reported bug — and is exactly the kind
of near-coincidence that becomes one later.

`LivePoster` now takes the editor's own `scale` and the design's own width, and computes:

```js
const k = (scale * designW) / W     // W is the tree's painted width
```

`renderScale` caps the painted longest side at 2160px, so `W = designW × renderScale` — and this
cancels it. For every design under 2160px, `k` **is** `scale`. There is one measurement in the editor
and nothing left to disagree with. `design-editor.cjs` asserts that `shownW` cannot come back as a prop
of that component.

**Both fixes land on the single event design too, without a second edit.** It is the same shared
`DesignEditor` and the same shared `LivePoster`, and `EventPost` supplies `background.width` from the
place's own canvas exactly as `WeeklyPost` supplies the blank's. The harness mounts the weekly editor
because the bug was reported there and because its seven rows are the hardest case — twenty-one cells
against one box — but there is no second code path to get wrong.

### 2b.6 What is measured now

`scripts/live-text-place.cjs`, in **WebKit and Chromium**, **78 measurements**:

- the editor mounts with no page error, fetches its font files, and draws live
- **the live layer starts exactly where the poster does** (273,56 vs 273,56) **and is exactly as wide**
  (499 vs 499) — the one conversion, as a number
- **`transform-origin` is `0px 0px`**, read off the live layer's computed style in the browser. Not off
  a stylesheet and not off the source: however it got there, this is what the browser is using
- the heading's words **overlap and are inside** the heading box — at Fit and zoomed in
- all 21 day cells exist, **all seven rows have words in their cells**, and the day, the place and the
  time each land in their own cell
- **every live word is inside a box or a day cell** — 58 word rectangles, the only exemption being
  "Powered by HatchGrab", which the renderer draws at the foot of the poster and the editor has no box
  for
- no word is drawn outside the poster
- and the core claim holds at **every width from 1000 to 1728 and every zoom level** — 1000, 1100,
  1280, 1440, 1728 × 100%, 125%, 156%. (This editor's zoom is `1.25 ** step`, so the brief's "150%" is
  **156%**; the readout is printed rather than rounded to a number the control cannot produce.)

**The control** declares the blank at **twice** the layout's size, which is the one way to make the
editor's box scale and the live tree's scale disagree from outside the component — the reported bug,
reproduced on purpose, with no product code patched. **45 live words fall outside every box**, and the
claim refuses it.

### 2b.7 Two harness mistakes made while writing this, both recorded

1. **The origin guard matched its own comment.** Rewritten as "no `origin-top-left` in a `className`,
   and `transformOrigin` is set inline", it threw on correct code — because `LivePoster`'s own note
   explains at length why the class is not used. That is the **second** time in this round a claim
   about code matched a comment about code (the first was `next/og` in §2.3). The lesson is the same
   both times: read the construct, not the string.
2. **The width sweep inherited the control's navigation.** It ran after the `?breakScale=1` page and
   reported thirty failures on correct code — the control doing its job one block too late. A loop that
   inherits another block's navigation measures whatever ran before it.

### 2b.8 One thing this leaves behind

**The committed `.next/` build is stale, and the `origin-top-left` incident is what that costs.** It
predates `LivePoster`, so it is missing that class — and would be missing any other utility added
today. Nothing in the product depends on that class any more, so there is no outstanding bug; but the
production build must be re-run before deploy, which it would be anyway. It is named here because
"the dev server has it and the build does not" is a failure mode worth knowing about: **a Tailwind
class is only as present as the last build that scanned for it.**

---

## 3. Clicking the picture

A press on the poster no longer selects anything. The real complaint it caused: **a press on a blank
part of the artwork closed whatever panel was open** — an operator reading "Style all the writing", or
halfway through a font list, lost it by putting a finger on the poster, which is the surface this
screen is built around touching.

The background's settings are a foldable **🖼 BACKGROUND PICTURE** section, always at the foot of the
panel, folded by default, summarised *"Replace picture · Darken the picture · size advice"*. It is
never selected, so there is nothing a click needs to reach.

Driven against the mounted editor: the stage takes no pointer handler at all, the section is there and
folded, opening it does not change which box is selected, and the darken slider still writes to the
design.

---

## 4. Clearer buttons

- **"Aa All text · change all the writing at once"** → **"Aa  Style all the writing"**, with a grey
  second line: *"Font, colour and effects for everything"*.
- every ON YOUR POST button gained a **`›`**, because a row that opens something should look like it
  does.

---

## 5. Fold arrows

One `FoldArrow` component: an 18px SVG chevron, pointing right when closed and down when open
(`rotate-90`), with the **whole heading row** as the button. Three sections had three spellings of the
same affordance.

---

## 6. Delete your own text

A red-outlined **🗑 Delete this text** at the foot of a selected own-text box's settings, with a grey
*"or press Delete"* beside it. Delete and Backspace work when focus is not in a text field. No confirm
— ⌘Z brings it back, which is true of every other change this editor makes.

**A built-in item is switched off, never deleted.** A design with no Date box is a state the validator
and the renderer both understand; a design *missing* one is not.

Driven as a real gesture against the mounted editor, with every assertion read out of the editor's own
**save**:

- the button removes the box from the design, and Undo restores it
- the **Delete key** removes it too, and Undo restores that
- **Backspace with an `<input>` as the event target deletes nothing** — the focus test, which is the
  whole feature: an operator correcting a typo in "Words before" must not lose their text box
- a built-in item has no Delete button at all

Two things about that harness are worth recording:

1. **`dispatchEvent` cannot do this job.** Node has no `KeyboardEvent`, and `event.target` is set *by*
   the dispatch — so the one thing the handler is built around could not be driven through a real
   dispatch. The window's keydown handlers are captured as they are registered instead, and
   `removeEventListener` is tracked too: the handler is torn down and rebuilt on every selection, and
   calling a stale one would delete whatever box was selected when it closed over `selected`.
2. **Undo restores the layout, not the panel's cursor** — `removeNote` selects the Date box, because
   the box it was on has gone. The first version of the key check failed for exactly this reason and
   the behaviour was right: with the Date box selected there is nothing for Delete to remove. The
   harness selects the restored box again, which is what an operator would do.

---

## 7. Nothing cut off

At **1000, 1100, 1280, 1440 and 1728** in WebKit and Chromium: the title row wraps, the page never
scrolls sideways, the Save button and the settings panel are on screen, and below 1100 the panel drops
under the poster.

The control restores the failing shape — `shrink-0` on the "Preview with" label and an uncapped select
— and reproduces the cut exactly: **390px of content in a 366px row, document 402 wide at a 390
viewport**.

---

## 8. The four requests made during the round

### 8.1 Chips that delete and move

*"i tried to delete the 'list of days' from the template but it cleared all the template."*

The chips are `contenteditable="false"` spans inside a `contenteditable` host, and the component's own
comment claimed *"every engine treats such an element as ONE character — Backspace deletes it whole"*.
**That is true of Chromium. It is not true of WebKit**, which is the engine this product is used in:
Safari selects the host, or deletes far past the element. The feature was written and checked in the
engine that happens to do it for you.

The delete is ours now, in `lib/weekly-post/caption-chips.ts` — pure DOM, no React, so a fixture can
drive it. `scripts/caption-chips-render.cjs` loads the compiled module into **both** engines, puts a
caret against a chip, presses a **real Backspace** and reads the template back. Cut and paste carry
the **token**, not the chip's label, so moving a chip is a move rather than a quiet deletion of the
thing that fills that part in.

The control is an unwired page: the chip is **not** deleted as one character, in Chromium and WebKit.

### 8.2 "I added +Week dates and saved and it didn't save"

**It had saved.** The database held `{week-dates} Pizza Kitchen — where we are this week:`. The screen
never reloaded, so the box went on showing what it was showing. `saveCaption` now awaits `load()`.

The comment forbidding a reload was written for the autosave era and had outlived the thing it
protected.

### 8.3 Single event before weekly

On **Designs**, **Create a post** and **Location settings** — including the table's columns and its
ticks. "It matches the table's column order" was a reason about our own screen; **the single event post
is the one a truck makes most often.** Thirty measurements pinned to the old left/right order moved
with it.

### 8.4 Font size

"Smaller | Bigger" became a size you choose. Two nudge buttons made an operator press and look, press
and look, and never answered the question they were asking.

---

## 9. What was run

| Harness | Result |
|---|---|
| `tsc --noEmit` | clean |
| `eslint` on every touched file | clean (3 pre-existing `<img>` advisories in `DesignEditor.tsx`, 2 pre-existing unused-symbol warnings in the route) |
| `scripts/weekly-post.cjs` | **251 passed**, 35 broken variants all failed as required |
| `scripts/draw`-related source claims (`design-editor.cjs`) | **107 passed** |
| `scripts/social-posts.cjs` | **107 passed** |
| `scripts/place-pictures.cjs` | **113 passed** |
| `scripts/design-fonts.cjs` | **87 passed** |
| `scripts/plan-feature-order.cjs` | passed |
| `scripts/check-plain-english.mjs` | 111/112, one pre-existing known violation |
| `scripts/social-tab-render.cjs` | **1044 measurements**, WebKit + Chromium |
| `scripts/social-posts-render.cjs` | measured in 2 engines |
| `scripts/caption-chips-render.cjs` | the chips delete and move correctly, in 2 engines; the control fails as required |
| `scripts/live-poster.cjs` **(new)** | **33 measurements**, WebKit + Chromium, 4 controls |
| `scripts/live-text-place.cjs` **(new)** | **78 measurements**, WebKit + Chromium — the real editor bundled and mounted, 5 widths × 3 zooms, 1 control |
| `scripts/social-tab-6-local.cjs` | every local check passed, against `test-truck` on `localhost:3000` — **nothing saved to the database** |
| `scripts/run-harnesses.cjs` | the full sweep, after the last edit — **98 run · 98 passed · 0 failed** |

**What was not done, and could not be:** the dashboard is behind an operator login this session has no
way into, so none of §1's or §7's measurements were taken on the real `/manage/<token>` page. They were
taken on fixtures built from the components' own lifted class names, in both engines, and §1.2 says
plainly which question that left open.

**What changed about that during the round:** §2b's harness mounts the **real component** in a **real
browser**, which is the first check in this workstream that does both. It is not the real page — there
is no route, no session and no database behind it — but it is the real `DesignEditor` with a real
layout engine, and it caught a bug that four other kinds of check could not see. The same technique
would close §1.2's open question, and that is the obvious next thing to build.

---

## 10. Rules

- Only `test-truck` (Pizza Kitchen, `test-kitchen`) was read or written. No other truck was opened,
  called or changed.
- Nothing was deployed and nothing was pushed.
- **No SQL was run and no migration was needed.** Nothing was added to the database and no column
  changed shape.
- No `outreach_templates` row was created, edited, seeded or deactivated. No email was sent.
- No table, column or stored image was dropped or deleted.
- **Two processes were killed, by PID, and this says which and why.** A harness sweep I had launched in
  the background had been left running by a wrapper that exited without it, so two sweeps were running
  at once over the same temporary directories. I read their PIDs out of `ps` and killed that pair
  (`39612`, `39616`) — by PID, never by name or pattern, which is the rule. Nothing else was stopped.
- Gating is unchanged — the new `GET` is behind the same token and the same two feature keys as every
  action in that route.
- Every shared editor change is in the one shared `DesignEditor`.
- **No span of either brief arrived garbled, and no instruction contradicted another.** The one tension
  was §1's "cut the file name short with …" against the operator's later *"remove the photo name"* —
  the same person, later, about the same line, which is a revision and not a contradiction. It is
  recorded in §1.4 and in the code. The follow-up brief's "150%" is the only other thing worth naming,
  and it is not a contradiction either: this editor's zoom is `1.25 ** step`, so the nearest level is
  **156%**, and §2b.6 prints the readout rather than claiming a number the control cannot produce.
