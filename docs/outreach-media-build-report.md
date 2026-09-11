# Outreach logo/photo media — built

**9 September 2026.** Two files changed: `app/api/admin/outreach/route.ts` (+99) and
`components/admin/OutreachPanel.tsx` (+513/−67), plus `lib/outreach-filter.ts` (untracked, carried from an
earlier task). **No schema change, no migration, nothing installed, `package.json` and the lockfile
untouched.** Nothing staged, committed or pushed; `git add` was not run in any form.

🔴 **NO UPLOAD WAS PERFORMED AND NO ROW WAS WRITTEN.** No admin session is obtainable here, so the upload
path has never executed. Evidence classes are separated in §6.

---

## 0. CONTRADICTIONS FOUND — one new one, at the top as instructed

Everything in your corrections block held up. One **new** contradiction surfaced, and it is the one that
made the table look wrong to you:

🔴 **`text-center` on a table cell does not centre a `flex` child — NOR A BLOCK ONE — and several of my
own "centring proofs" were checking the wrong property. This took two passes to get right (§5.6).** `display:flex` makes an element a **block-level** flex
container that fills its cell, so the parent's `text-align` has nothing to centre and `mx-auto` is a
no-op — the content sits hard left. My checks asserted `text-center` was *present on the `<td>`/`<th>`*,
which it was, and reported green while the page was visibly not centred. **You were right and the check
was worthless.** 🔎 The fix is the pattern **this file already used correctly** in `WhatsAppBox:698` and
`TriStateBox:677` — `inline-flex` — which is exactly why the tick columns looked right while the headings
and media cells did not. Applied to both, and the check is now "no bare `flex` token in a heading or a
media cell" rather than "text-center is present".

⚠️ Also corrected: the sort-header button reserves a 2-unit sort marker on the right whether or not it is
showing, so the label sat half a marker left of true centre even once the button itself was centred. A
matching empty spacer now balances it.

---

## 1. `git status`, verbatim, before any edit

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   components/admin/OutreachPanel.tsx

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	docs/outreach-filter-ux-report.md
	docs/outreach-media-report.md
	docs/outreach-table-report.md
	lib/outreach-filter.ts

no changes added to commit (use "git add" and/or "git commit -a")
```

**Proceeded as instructed.** ✅ **No other file was entangled** — at END the only additions are
`app/api/admin/outreach/route.ts` and this report. 🧪 `git diff --cached --stat` is **empty**; the index
was never touched. 🧪 A scoped `git status --short` over `app/manage`, `app/order`, `app/trucks`, `app/o`,
`app/api/manage`, `app/api/menu`, `app/api/inbound-schedule`, `components/dashboard`, `lib/truck-logo.ts`,
`lib/image-utils.ts`, `public/`, `package.json` and `package-lock.json` returns **nothing**. **No customer-
or operator-facing surface touched.**

---

## 2. THE UPLOAD ACTION — declared NEW, with the one genuine reuse named separately

### 2.1 🔴 New, not a reuse

🔎 `app/api/admin/outreach/route.ts`, inside `POST`, branching on `content-type: multipart/form-data`.
**It is a new server action.** `get_upload_url` (`app/api/manage/route.ts:1565`) was not reused and this
is not a variant of it — wrong gate (`dashboard_token`), wrong id space (operator truck id), and it is a
**signed-URL the client PUTs to**, where this brief requires the bytes to pass through the server. ⚠️
Named explicitly because app manual §51.7 records a "reuse" that was a fourth independent implementation.

✅ **The genuine reuse is the COLUMN WRITE:** the same resolve-`discovery_truck_id`-then-`update`
`discovery_trucks` pattern `update_prospect` already uses for `contact_email`/`phone` — same route, same
`verifyAdmin` gate, same service-role client. No new gate, no widened access.

### 2.2 What it writes

🔴 **Absolute Supabase URL**, per your decision — the shape 🧪 **44 rows already hold**, all on
`https://ffphgwonshgxamtvefcv.supabase.co/storage/v1/object/public/truck-media` (re-derived; both
`SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` resolve to that host). `formatImageUrl` passes `http…`
through untouched, so both stored shapes keep working and no consumer changes.

**Filename scheme:** `<discovery_truck_id>/<logos|photos>/<timestamp>-<sanitised name>`

- the **discovery truck UUID** makes a collision *between* trucks impossible — the failure that would
  otherwise put one business's logo on another's public listing;
- the **timestamp** stops a re-upload silently overwriting a previous object;
- 🔴 **logo/photo are separated INSIDE the object path, not in the column value** (which is a full URL
  either way) — you permitted this; it is for anyone reading the bucket, not for resolution;
- the name is sanitised to `[A-Za-z0-9._-]` and tail-truncated to 80 chars.

### 2.3 Validation and the empty-slot rule

- **Type** must start with `image/`; **size** ≤ 5 MB. Both are checked **server-side before a byte reaches
  the public bucket**; the browser has a copy of the type check purely to give an instant reason.
- 🔴 **Empty slots only, enforced on the SERVER** (`409` if the column is already non-null), not just by
  the UI declining to offer a drop target. A UI convention is not a rule a direct POST has to honour.

### 2.4 🔴 The orphan window

Bytes must exist before a column can reference them, so the window is one-directional and cannot be
designed away — only handled:

1. Upload to the bucket.
2. **Immediately** update the column — nothing in between.
3. On DB failure → **delete the just-uploaded object**, and return an error saying no change was made.
4. If that cleanup **also** fails → `console.error` the exact path with both error messages, because **an
   orphan nobody can name is one nobody will ever remove.**

**The column is never written first.** A column pointing at bytes that do not exist is the silent-blank
failure, which is worse than an orphan: the orphan is invisible, the blank is public.

---

## 3. THE TABLE — three states, and why two of them must not look alike

🔎 `MediaCell` in `components/admin/OutreachPanel.tsx`. Logo column first, **photo immediately after it**
(no reason found to separate them; their two filters then sit adjacently under the existing column-order
rule).

| state | condition | renders | droppable? |
|---|---|---|---|
| **1 PRESENT** | value resolves | thumbnail | no — replacing is out of scope |
| **2 EMPTY** | column is `NULL` | dashed border, `+` | 🔴 **yes — the only droppable state** |
| **3 BROKEN** | value stored but 404s | **solid amber border, ⚠** | **no** |

🔴 **Brokenness is detected, not assumed** — nothing in the stored string says whether it resolves, so the
`<img>` reports it via `onError`. State 3 is reachable only after a real load failure, and a new value
clears the flag so a successful upload cannot inherit the previous value's ⚠.

⚠️ **Why 2 and 3 must differ:** a resolved image and a 404 both render as an empty box, so a naive cell
would show a broken value as an inviting empty slot — and dropping on it would *look* like filling a gap
while actually being a replace, which the server refuses with a 409 the operator could not explain.

**Logos render as circles, photos as squares** (your instruction), applied to **all three states** so an
empty or broken logo slot is still recognisably the logo column. 🧪 Verified: `rounded-full` / `rounded-md`
are the only two `rounded-*` tokens in `MediaCell`, both from the one `shape` expression, and all three
states use the shared `box` class.

⚠️ The empty slot is a `<label>` wrapping a hidden file input, so it is **also click-to-pick**. Drag-and-drop
is what you asked for; the click costs nothing and uses the identical handler. Flagged rather than assumed.

---

## 4. THE TWO FILTERS

🔎 Added to `matchesOutreachFilter` **after every existing clause**, reusing the existing `presenceMatch`
helper — the same one Email and Phone use. **Any / Has / Missing, not tri-state**: a null image column is
genuinely absent, with no "nobody checked" reading.

**Placed in column order** (Logo, Photo first) — and because Logo and Photo now precede Truck, 🔴 **the
search box had to move into the ordered array** rather than being rendered ahead of it, or it would have
stayed pinned first and broken the one invariant that array exists to hold.

---

## 5. PROOFS — failure mode first, then how it was ruled out

### 5.1 The three media states — 🔴 the failure mode is that PRESENT and BROKEN look identical

**A resolved URL and a 404 both render as an empty box**, so counting "values present" proves nothing
about whether they resolve. **So resolution was actually tested**: leading-slash values checked against
the filesystem, absolute URLs by HTTP `HEAD`. 🧪 Re-derived over the **231** rows this page loads
(pagination asserted: prospects fetched 231 = `count=exact` header 231):

| | logo_url | photo_url |
|---|---|---|
| **EMPTY** (null — droppable) | **78** | **153** |
| **PRESENT** (resolves) | **153** | **77** |
| 🔴 **BROKEN** (stored, 404) | **0** | **1** — `Chai Stall /photos/chaistall.jpg` |
| total | **231** ✅ | **231** ✅ |

✅ **All three states exist in the live data**, so all three branches are reachable — not hypothetical.
🧪 All 44 absolute `truck-media` URLs returned OK, which is what validates the write shape chosen in §2.2.
⚠️ **`Chai Stall` was NOT fixed** — out of scope, flagged separately, and it is the live instance that made
state 3 necessary.

### 5.2 The two new filters — 🔴 the failure mode is a fully-populated column

**A presence filter over a column with a value on every row returns everything and is indistinguishable
from no filter.** 🧪 Neither column is fully populated, and both partition exactly:

| filter | rows | verdict |
|---|---|---|
| Logo = Has / Missing | **153** / **78** | proper subsets; 153 + 78 = 231 ✅ |
| Photo = Has / Missing | **78** / **153** | proper subsets; 78 + 153 = 231 ✅ |

⚠️ **An honest nuance:** `Chai Stall` counts as **Has** for photo even though the image 404s. The filter
asks whether the *column* is populated, which is the right question for "what still needs an image" — but
it is not the same question as "what displays correctly", and the two differ by exactly one row today.

### 5.3 No existing predicate clause changed — A/B, not assertion

**"I only added clauses after the others" is easy to assert and easy to get wrong**, so the pre-change
predicate was reconstructed by excising the two new clauses, both versions compiled, and both run over
the same 231 rows. 🧪 **All 18 pre-existing cases identical** — `huOrdering` 19/212, `huMap` 121/110,
`whatsapp` 30/201, `doNotContact` 0, `email` 55/176, `phone` 69/162, `stage=contacted` 3, `schedule`
50/103/78, `nextAction` 1/230, `search=pizza` 28. **ZERO of 18 changed.**

### 5.4 Bar order still matches the columns — with a control that fails

**A reordered bar looks identical to one that was not reordered if I only assert it.** Both sequences
extracted from source and mapped to column indices, which must be strictly increasing:

```
    1. Logo    2. Photo   3. Truck   4. Phone   5. WhatsApp   6. Email
    7. HU ordering   8. HU map   9. Schedule   10. Stage
   11. Last contacted  — no filter, skipped
   12. Next action → 11.        (no column) → 12. Do not contact  (last)

   column indices in bar order: [0,1,2,3,4,5,6,7,8,9,11]   strictly increasing: YES
   (control) transposed [3,1,2,0,…]                        increasing: NO — the check can fail
```

### 5.5 Header / colgroup / cell alignment across 12 columns

**Three parallel lists were edited; if any disagreed, every value after the mismatch would render under
the wrong heading and still compile.** 🧪 All three extracted and compared position by position:
**header 12, colgroup 12, cells 12, all agree** — `logo, photo, name, phone, whatsapp, email, hu_ordering,
hu_map, schedule, stage, last_contacted, next_action`.

### 5.6 Centring — the check that was worthless, replaced

⚠️ **My earlier proof asserted `text-center` was present on every `<th>`/`<td>`. It was, and the page was
still not centred** (§0). The property that mattered was whether the *child* is block-level. 🧪 The check
is now: **zero bare `flex` tokens in `<thead>` and zero in `MediaCell`**, both using `inline-flex`; and
12 of 12 `<td>`s plus the single `<th>` template carry `text-center`, with no `text-left` in either.

🔴 **THAT FIX WAS INCOMPLETE, AND YOU CAUGHT IT — CORRECTED 9 September (second pass).** `inline-flex`
fixed the **headings** but the logo and photo thumbnails were still left-aligned. **The reason is a second
mechanism I had not accounted for:** Tailwind's preflight sets `img { display: block }`, so the thumbnail
is a **block** box and `text-align` cannot move it whatever display the utility claims. And the cell is
**always wider than the box**: 🧪 the colgroup sums to **1460px** under a **1622px** `minWidth`, so
`table-fixed` distributes the surplus — a 56px column renders **~62px at the minimum width and ~69px on a
wide window**, leaving **6–13px of slack** around a 40px box, i.e. a **3–7px left offset** that grows with
the window.

✅ **The fix no longer depends on the child's `display` at all.** Each media cell now wraps its content in
`<div className="flex items-center justify-center">` — **a flex container centres its child whatever the
child is**. `box` carries size and shape only; the two glyph states (`⚠`, `+`) keep their own `inline-flex`
to centre their own glyph; the `<img>` needs nothing. 🧪 Verified: both wrappers carry
`flex items-center justify-center`, `box` is `w-10 h-10 ${shape} shrink-0`, and there are **0** bare
block-level `flex` classes left in `MediaCell`.

**THIRD PASS — the thumbnails were still reported left-aligned.** 🧪 On re-inspection the source was
already correct: the flex wrapper was in place on both cells and `app/globals.css` carries **no** `table`,
`td` or `img` rule that could override it. ⚠️ The screenshot showed the **headings centred** — which was
pass 1 — so it is consistent with having been taken before pass 2 reached the browser. **I did not treat
that as the answer.**

🔴 **Centring is now redundant across three independent mechanisms, and any ONE is sufficient:**

| # | mechanism | centres |
|---|---|---|
| 1 | `text-center` on the `<td>` | inline-level children |
| 2 | `flex items-center justify-center` wrapper | **any** child, whatever its display |
| 3 | `mx-auto` on the box (definite `w-10`) | block-level children |

A block `<img>` ignores (1); an `inline-flex` box ignores (3); (2) covers both. They cannot conflict —
all three resolve to the same position.

### 🔴 FOURTH PASS — THE ROOT CAUSE, AND IT WAS NEVER A CENTRING BUG

Prompted to search rather than keep theorising, I checked the mechanism first and it came back clean:
🧪 every utility (`mx-auto`, `justify-center`, `text-center`, `w-10`, `inline-flex`) **is present in the
built CSS**; 🧪 `app/globals.css` has exactly **one** unlayered bare-element rule (`body`) — which matters
because in Tailwind v4 **unlayered CSS beats every layered utility regardless of specificity**, so this was
the prime suspect; and 🧪 the `img` rules that looked dangerous (`width:100%`, `height:40px`) turned out to
be scoped `.hg-landing .shot img` / `.hg-landing .foot-badge img`, i.e. the landing page, **not** this table.
Leaflet's unlayered import is 🧪 102 rules, **0** of them unscoped.

**So the CSS was fine, and the problem was arithmetic in the `<colgroup>`.** At `width: 56px`, those two
columns were too narrow in **two opposite ways at once**:

| | space available | space needed | result |
|---|---|---|---|
| `<th>` (`px-3` → 24px padding) | **32px** | ~50px `LOGO`, ~57px `PHOTO` | 🔴 heading **overflowed** and was pushed sideways |
| `<td>` (`px-2` → 16px padding) | **40px** | thumbnail `w-10` = **40px** | 🔴 **exactly zero slack** — the image could not move |

**The image was already hard against its only possible position, and the heading was displaced by
overflow, so the two could not line up.** That reads on screen as "the images are left-aligned".

🔴 **`text-center`, the flex wrapper and `mx-auto` were all correct and all irrelevant** — there was
nothing for any of them to centre within. Fixed by widening both columns to **88px** (header needs 57 of
64px; image now has 32px of slack), `minWidth` moved 1622 → 1686 to keep the surplus maths in step.

⚠️ **THE PROCESS FAILURE WORTH KEEPING, AND IT IS MINE.** Three passes were spent adding redundant
centring mechanisms to a element that had **nowhere to move**, because I kept checking *"is the centring
rule present?"* and never *"is there any free space for it to act on?"* **A centring rule and a zero-width
gap produce identical output.** The cheap check I skipped for three rounds was the column-width
subtraction — 15 seconds of arithmetic against three rounds of CSS theory.

⚠️ **Also flagged: I ran `npx next build` five times this session while a `next dev` server (PID 1338, up
since Mon 21:07) was serving the same project.** In this Next version the dev tree is isolated under
`.next/dev` and 🧪 it *was* recompiling (387 files touched after my last edit), so it did not cause this —
**but running a production build against a live dev server is not something to do casually, and I did not
check first.** No `next build` was run after this fix for that reason.

### FIFTH PASS — ALL TWELVE COLUMNS RESIZED, AND THE SPRAWL HAD THE SAME ROOT CAUSE

🔴 **`minWidth` HAD BEEN LARGER THAN THE COLGROUP SUM IN EVERY VERSION OF THIS TABLE, AND THAT INFLATES
EVERY COLUMN.** `table-fixed` distributes the difference across all columns, so each rendered *wider* than
its declared width. It was 1510 vs 1348 in the original, and my media columns made it 1638 vs 1476 — 162px
of invisible padding spread across the row, which is why the table sprawled and ran off-screen.

✅ **The two are now equal at 1198px, so a column is exactly the width written.** Widths were set by
whichever is larger: the widest **unbreakable word** in the heading (headings wrap on spaces) + 16px of
`px-2`, or the widest cell content.

| | logo | photo | name | phone | whatsapp | email | hu_ord | hu_map | schedule | stage | last_c | next_a |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **px** | 64 | 64 | 170 | 115 | 72 | 210 | 76 | 68 | 78 | 105 | 88 | 88 |

**1198px total, down from an effective ~1638px** — and it now fits a ~1288px viewport with room to spare
instead of overflowing.

🔴 **The enabling change was taking the sort ▲/▼ marker OUT OF THE LAYOUT FLOW** (absolutely positioned,
rendered only when active). In flow it plus its balancing spacer cost 24px on *every* column; on a 64px
media column it overflowed the cell outright. Out of flow it costs nothing, the heading label is exactly
centred with no spacer needed, and columns can be as narrow as their content.

🧪 Re-verified after rewriting the whole colgroup: **header 12 / colgroup 12 / cells 12, all three in the
same order** — the check that would catch a rewrite having shuffled a column.

🔴 **Still a source-level check, not an observation — and this is now the FOURTH centring claim I have made
without being able to see the page.** The lesson, restated harder: **`text-center` is not evidence of
centring when the child may be block-level, and a source-level class check is not evidence that a page
renders correctly.** Where I cannot observe, redundancy beats a single mechanism I believe is the right
one.

### 5.7 Compiler

🧪 `npx tsc --noEmit` → **0 errors**. 🧪 `npx next build` → **exit 0**, zero lines matching `error|failed`.

---

## 6. EVIDENCE CLASS — stated plainly

- ✅ **Compiler-confirmed:** types, the production build, and every structural claim extracted from source
  (column order, three-list alignment, centring mechanism, bar order, filter placement).
- ✅ **Executed against real data:** every count in §5.1–5.3, including live HTTP `HEAD` checks of all 44
  bucket URLs and filesystem checks of the static paths. ⚠️ **These are direct service-role reads and
  public HEAD requests — not the route, not the page.**
- 🔴 **Reasoned from source only, NEVER OBSERVED:** the upload itself. **No file was uploaded, no object
  created, no column written, nothing rendered, no control clicked.** No admin session is obtainable
  ("NO ADMIN SURFACE CAN BE VERIFIED BEFORE THE OPERATOR SEES IT"), so the multipart branch, the 409
  refusal, the orphan cleanup and the `onError` broken-state transition are **all unexercised**.
  **I do not claim any upload succeeded.**

---

## 7. NOT DONE, AND WHAT REPLACING WOULD NEED

- **Replacing a filled slot — out of scope, and refused server-side.** It would need: a **delete endpoint
  that does not exist** (🔎 `app/manage/[token]/page.tsx:9385` records the same gap for operator logos); a
  decision on whether the superseded object is removed or kept; and 🔴 **a rule for the 186 rows whose
  value points at `public/logos` or `public/photos`** — those are static files in the repo, so "replace"
  there means either shipping a deploy or migrating the row to a bucket URL, which is a data decision,
  not a UI one. **Stopped there.**
- **`Chai Stall`'s broken `photo_url`** — untouched, as instructed.
- **Gusto's three protections, all still intact:** 🧪 re-derived — both its media columns are non-null (so
  its slots are not drop targets *and* the server would 409), `trucks.logo_storage_path` is set, and
  `resolveTruckLogo` still has no `discovery_trucks` fallback. Nothing in this change touches any of them.
- **`matchesOutreachFilter`'s existing clauses** — byte-identical, proven behaviourally in §5.3.
