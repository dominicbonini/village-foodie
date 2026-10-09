# Editor fixes 8 — the canvas, the snap-back, and "Powered by HatchGrab"

**10 October 2026 · not deployed · not pushed · no SQL run · no truck touched**

🔴 **§1 IS DONE AND PROVEN. §2 IS HALF DONE. §3 IS NOT STARTED.** What is here is finished and measured;
what is not is named in §4 rather than left half-built.

---

## 0. The short version

| § | What was asked | What happened |
|---|---|---|
| 1 | The words are not in their box on the single event design | **Done.** One cause, proven with a control that reproduces the reported symptom on the pre-fix code. It also explains §2 |
| 2 | Resizing the Date box snaps back | **Half done.** The cause is the same one, and the clamping is fixed. The save/reload check and the "say why" message are **not** done |
| 3 | "Powered by HatchGrab" becomes a movable box | **Not started** — §4 |

🔴 **ONE CAUSE BEHIND BOTH REPORTS.** The editor measured its canvas from the **background picture**;
every box coordinate is stored in the **layout's** pixels, and the layout is the canvas the renderer
paints on. While the two numbers agree nothing can go wrong — which is why the weekly design never
showed it. When they differ, three things break together and by the same ratio: the box outlines are
misplaced, the live words are drawn at the wrong size, and `DraggableBox`'s clamp ranges invert.

---

## 1. The words are not in their box

### 1.1 The cause

| | reads its canvas from |
|---|---|
| the renderer (`weeklyTree`, `eventTree`) | `W = round(layout.width × renderScale)` — [draw.ts:615](lib/weekly-post/draw.ts#L615), [draw.ts:739](lib/weekly-post/draw.ts#L739) |
| the editor, before this round | `W = background.width` — [DesignEditor.tsx:673](components/manage/DesignEditor.tsx#L673) |

`LivePoster` bridges the two with `k = scale × designW / W` ([LivePoster.tsx:115](components/manage/LivePoster.tsx#L115)),
and it was handed the **picture's** width as `designW` while its `W` came from the **tree**. Its own
header says it relies on those being the same number; nothing made them so.

**The direction fits the report.** Words drawn *smaller* needs `designW < W`, i.e. the picture narrower
than the canvas — and the same mismatch makes `scale = stageW / background.width` too large, so the
outlines are drawn bigger than the poster and run off its right edge. **That is §2's "the box currently
extends past the picture's right edge", from the same cause.**

⚠️ It is **not** the `transform-origin` fault from `social-tab-7-report.md` §2b — that displaces toward
the centre without changing size, and the harness still asserts the corner.

### 1.2 The fix

```diff
- const W = background.width || 1
- const H = background.height || 1
+ const W = (layout.width > 0 ? layout.width : background.width) || 1
+ const H = (layout.height > 0 ? layout.height : background.height) || 1
```

One line, and it fixes all three symptoms at once because all three derive from it: `scale`, the
`bounds` handed to every `DraggableBox`, and `LivePoster`'s `designW`. **It makes that component's
assumption true by construction.**

⚠️ **No element moves for any design whose two sizes already agree** — which is every design the
fingerprint and the harnesses are built from. Confirmed: `phone-editor.cjs` **259 checks green**, with
the desktop fingerprint identical at 768/1100/1728 in both engines, and `live-text-place.cjs` green at
all five widths and three zooms.

⚠️ The background is still what is drawn: the `<img>` fills the stage box, so a picture of a different
pixel size is scaled onto the poster's canvas exactly as the renderer composites it. **Asserted** —
`stageImg` matches the stage to within 2px in every fixture.

### 1.3 The proof

`scripts/live-text-place.cjs` now mounts the **single event** editor (`?kind=event`) and sets the
background's size independently of the layout's (`?bg=`). Five fixtures, both engines:

| fixture | result |
|---|---|
| weekly, picture = canvas | 58 words, all inside their box |
| single event, picture = canvas | 7 words, all inside |
| **single event, 2160×2700 picture under a 1080×1350 canvas** | all inside |
| **single event, 540×675 picture under a 1080×1350 canvas** | all inside |
| weekly, 2160×2700 picture | all inside |

⛔ **The control is the old code, not a broken new one.** An esbuild plugin rewrites that one line back
to `background.width` on load — nothing is copied and nothing on disk is touched — and an absent anchor
throws rather than silently passing. On that build, with a 540px picture under a 1080px canvas:

```
✓ CONTROL: 7 live word(s) fall outside every box — so "inside its box" is a measurement
✓ CONTROL: …and 4 box outline(s) run past the poster's right edge
            (stage ends at 772, widest box at 1200) — which is §2's report, from the same cause
```

⚠️ **"Powered by HatchGrab" is excluded from the inside-its-box claim, and the exclusion is named.**
The renderer draws it free today, belonging to no outline, so the question has no box to ask about.
**That exclusion is exactly what §3 must turn on**, and the harness says so where it is made.

---

## 2. The resize snaps back — half done

### 2.1 What is fixed

The clamp ranges in `DraggableBox` are built from `bounds`, which is the editor's `W`/`H` — so §1's fix
makes them sane again. `east()` is `clamp(w + dx, MIN, bounds.w - x)`, and for a box at an `x` beyond
`bounds.w` that is `Math.max(MIN, negative)`: **the width collapses to the floor whatever the operator
dragged.**

And the second half, which §1 alone does not give: **a box that is already outside is now pulled fully
in** rather than held at a corner by a clamp it can never satisfy. Size is capped first, then position —
that order matters, because clamping the position first against an over-wide box pins `x` to 0 with the
box still hanging off the right.

### 2.2 ⛔ What is NOT done

- **No save/reload check.** The brief asks for: shrink from the right side handle, release, the width
  stays; the same from the left; then Save, reload, confirm. **Not written, not run.**
- **No "say why" message.** After the fix nothing is refused — changes are adjusted — but there is no
  path that tells the operator when a box had to be pulled in, which the brief asks for.

---

## 3. Read-only SQL for the mismatch

Run this to confirm the cause on `test-truck`. **It is read-only and I have not run it.**

```sql
-- READ ONLY. test-truck only. Each saved design with its layout's canvas and its picture's size.
with t as (select id, name from trucks where id = 'test-truck')

-- the two truck-wide designs (weekly and single event)
select
  d.kind                                   as design,
  null::text                               as place,
  (d.layout ->> 'width')::int              as layout_width,
  (d.layout ->> 'height')::int             as layout_height,
  d.width                                  as picture_width,
  d.height                                 as picture_height,
  case when (d.layout ->> 'width')::int is distinct from d.width
        or (d.layout ->> 'height')::int is distinct from d.height
       then 'MISMATCH' else 'ok' end       as verdict
from truck_post_designs d
join t on t.id = d.truck_id

union all

-- each location that has its own event positions and/or its own picture
select
  'event (per-location)'                   as design,
  p.name                                   as place,
  (p.event_layout ->> 'width')::int        as layout_width,
  (p.event_layout ->> 'height')::int       as layout_height,
  p.event_bg_width                         as picture_width,
  p.event_bg_height                        as picture_height,
  case when (p.event_layout ->> 'width')::int is distinct from p.event_bg_width
        or (p.event_layout ->> 'height')::int is distinct from p.event_bg_height
       then 'MISMATCH' else 'ok' end       as verdict
from truck_places p
join t on t.id = p.truck_id
where p.event_layout is not null or p.event_bg_path is not null

order by design, place nulls first;
```

⚠️ **`event_bg_width/height` describe the legacy picture object.** Where a location's poster comes from
a `place_pictures` slot instead, the authoritative size is that row's — the route's own note says so.
If the verdict column reads `ok` everywhere, the mismatch is in a slot picture and this second query
answers it:

```sql
-- READ ONLY. The slot pictures' own measurements, for the same locations.
select p.name as place, pp.width as picture_width, pp.height as picture_height,
       (p.event_layout ->> 'width')::int as layout_width,
       (p.event_layout ->> 'height')::int as layout_height
from truck_places p
join place_pictures pp on pp.place_id = p.id
where p.truck_id = 'test-truck'
order by p.name;
```

---

## 4. 🔴 §3 is not started, and why I stopped rather than start it

**"Powered by HatchGrab" as a movable box is a new first-class box type**, and it reaches further than
its size suggests:

| | |
|---|---|
| `lib/weekly-post/layout.ts` | a new box on the type, defaults at 2.5% of height, a minimum at 1.8%, validation, and **a migration for every saved design that has no stored position** |
| `lib/weekly-post/draw.ts` | drawn from the box rather than at a fixed spot, clamped inside the picture, still last |
| `DesignEditor` | an item in ON YOUR POST with a 🔒 and **no on/off switch**, settings restricted to Text size and colour, the grey line |
| the phone editor | a "🔒 Powered by" item on the bottom bar with Size and Style tabs only |
| the harnesses | the inside-its-box claim turned on, a dragged-to-each-edge check in the editor **and in a rendered PNG**, a minimum-size check, and the fingerprint re-proved |

That is a change to what every poster this product renders looks like, plus a migration of saved
designs. **Starting it in the time left would have meant leaving a half-built box on the surface the
operator uses most** — the same judgement recorded in `docs/phone-fixes-report.md` §4.1, and the reason
that section was reverted rather than shipped half-done.

**Nothing of §3 has been written**, so there is no scaffolding to unpick: `git diff` touches only
`DesignEditor.tsx` (two lines), `DraggableBox.tsx` (the clamps) and `live-text-place.cjs`.

---

## 5. What was run

| | |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx eslint` on the three touched files | 0 errors (3 pre-existing `<img>` warnings; the `require()` error is the house style for every `.cjs` script) |
| `npx next build` | compiled successfully |
| `node scripts/live-text-place.cjs` | **110 checks, 2 engines, all passing** — five fixtures plus the old-code control |
| `node scripts/phone-editor.cjs` | **259 checks, 2 engines, all passing** — the desktop fingerprint identical at 768/1100/1728 |
| `node scripts/run-harnesses.cjs` | **98 harnesses, all green** (`rc=0`) |

---

## 6. The rules

| Rule | |
|---|---|
| Test only on Pizza Kitchen | No truck was opened, called or changed. Every fixture is a compiled component with literal sizes — no database, no session |
| Never deploy or push | Neither was done |
| Never run SQL | None was run; §3's queries are for you |
| Never kill by name or pattern | No process was killed |
| No outreach_templates, no emails, no dropped tables, no deleted images | None touched |
| Desktop and phone share code — fix it once | One line in `DesignEditor`, one in `DraggableBox`; both editors take it |
| Keep the fingerprint and the phone editor green | Both green, unchanged. **No element moved**, because every fixture's layout and picture are the same size |
| Never print a secret | ⛔ **I broke this earlier in the session** and a Google service-account private key fragment reached the transcript. It is being rotated. Nothing in this round reads any `.env*` file |

Nothing in the brief arrived garbled, and no instruction contradicted another.

---

## 7. Files

| File | |
|---|---|
| `components/manage/DesignEditor.tsx` | the canvas is the layout's own, falling back to the picture's |
| `components/manage/DraggableBox.tsx` | a resize or move caps the size first, then the position, so an out-of-bounds box is pulled in |
| `scripts/live-text-place.cjs` | the single event fixture, the background size decoupled from the canvas, and the control rebuilt from the pre-fix code |
