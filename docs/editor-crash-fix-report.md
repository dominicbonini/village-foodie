# THE DESIGN EDITOR CRASH, AND "PLACE PICTURES" → "LOCATION IMAGES"

**7 October 2026 · branch `main`, local only. Nothing pushed, nothing deployed, no SQL run, no database
write, no truck touched, no email sent, and no `outreach_templates` row read or edited.**

---

## 🔴 1 · THE CRASH — WHICH PATH, AND IT IS NOT THE ONE THE BRIEF GUESSED

```
TypeError: undefined is not an object (evaluating 'PLACE_STYLE_SAMPLES[l.placeStyle].split')
  at itemsOf (components/manage/DesignEditor.tsx:183)
```

### The path

**`app/api/weekly-post/route.ts` · `event_load`**, which sent the design's jsonb column to the browser
**exactly as it came out of the database**:

```ts
design: designIsReady(design) ? {
  width: design!.width, height: design!.height, layout: design!.layout,   // ← raw
```

behind this, forty lines earlier:

```ts
const standardLayout = (design?.layout ?? null) as EventLayout | null     // ← asserts nothing at runtime
```

`EventSetupScreen`'s `layoutFor()` then hands it straight to `<DesignEditor initialLayout={layout}>`.

🔴 **THE VALIDATORS WERE WIRED INTO EVERY *WRITE* PATH AND NO *READ* PATH.**
`validateLayout` / `validateEventLayout` are called on save (`:1104`, `:1150`, `:1433`, `:1444`), on
render (`:1585`) and on a place's layout inside `resolvePlaceDesign` (`:587`) — **never** on `load` or
`event_load`. Reading was the half that had no gate.

### ⛔ It is **part 1**, not part 3 — confirmed against git, not assumed

The brief suspected "the part 3 change that loads the design alongside place pictures". It is not.

| | |
|---|---|
| `git show HEAD:app/api/weekly-post/route.ts` | the raw send is at **line 391** (`load`) and **line 970** (`event_load`) — it **predates all of this work** and is the original behaviour |
| `git show HEAD:components/manage/DesignEditor.tsx` | **does not exist.** `DesignEditor.tsx` is new in part 1 |
| `PLACE_STYLE_SAMPLES` at HEAD | **0 occurrences** |

So the unvalidated read has always been there and was always harmless, because the editor only read
fields every stored design already had. **Part 1 added `placeStyle` and `dateStyle`**, a design saved
before part 1 has neither, and the editor read `undefined`. Part 3 only gave Dominic a reason to open
that screen again.

⚠️ **Pizza Kitchen's design was never corrupt.** It is a valid pre-part-1 event design.

### 🔴 And the validators already knew the answer

`validateEventLayout` defaults a missing `placeStyle` to `'nameTownBelow'` and a missing `dateStyle` to
`LEGACY_DATE_STYLE`. **The bug was never a missing default — it was a path that never asked for one.**

---

## 🔴 2 · THE FIX — ONE DOOR IN, FOR EVERY READ

**New in `lib/weekly-post/layout.ts`:**

```ts
export function readStoredLayout(input: unknown, width: number, height: number): StoredLayoutRead<Layout>
export function readStoredEventLayout(input: unknown, width: number, height: number): StoredLayoutRead<EventLayout>
```

They validate, and **never return `null`**: a stored value that cannot be validated at all — wrong
version, a box outside a resized canvas, junk — yields the **default layout for that canvas** rather
than a crash or an empty screen, with `repaired: true` so a caller can say so.

⚠️ **That fallback is a real loss and it is deliberate.** The operator's positions are gone for that
session. The alternative on the day it happens is a screen that does not load at all. ⚠️ Nothing
surfaces `repaired` to an operator today; it exists so that when something does, it needs no second
code path to find out.

### Wired in at every read site

| Site | Was | Now |
|---|---|---|
| `event_load` · the standard design | `layout: design!.layout` | `readStoredEventLayout(design!.layout, design!.width ?? 0, design!.height ?? 0).layout` |
| `event_load` · each place's own layout | `layout: (pl.event_layout ?? null)` | `readStoredEventLayout(pl.event_layout, pw, ph).layout` |
| `load` · the weekly design | `layout: design!.layout` | `readStoredLayout(design!.layout, design!.width ?? 0, design!.height ?? 0).layout` |

⚠️ **The place's layout is normalised only when the place has its own picture size.** With no `pw`/`ph`
there is no canvas to validate against, and `null` there means *"this place is on Standard's
positions"* — which `layoutFor` already handles. Defaulting it would invent positions for a place that
never had any.

⛔ **The canvas is always the design's own**, never anything a caller sent: the size is what proves a
box sits inside the artwork.

⚠️ **The renderer needed no change** — `event_render` and the save paths already validated. The gap was
only ever the editor's.

### The sample lookups are now total

**New in `lib/weekly-post/locale.ts`:**

```ts
export const DEFAULT_PLACE_STYLE: PlaceStyleId = 'nameTownBelow'
export function placeStyleSample(style: unknown): string
```

⛔ **It takes `unknown` deliberately.** Typing the parameter `PlaceStyleId` would make TypeScript call
the fallback unreachable — which is exactly the false comfort that let this ship: the value comes out of
a jsonb column, where the type system has no reach. `DesignEditor.tsx:183` calls it instead of indexing.

⚠️ The other sample site (`:1135`) iterates `PLACE_STYLE_IDS`, so it was never at risk. `dateTextFor`
branches with `if (style === 'numeric')` and cannot throw on an unknown style.

---

## ✅ 3 · THE THREE CASES, IN THE HARNESS — AND A CONTROL

Added as **§7 of `scripts/design-editor.cjs`**, which compiles and *runs* the real modules.

🔴 **The fixtures are the real pre-part-1 shapes**, lifted from `defaultEventLayout` / `defaultLayout`
as they stood at git HEAD — not a guess at what an old design looks like.

| | |
|---|---|
| **CONTROL** | the old expression `PLACE_STYLE_SAMPLES[l.placeStyle].split` **throws on this fixture** — so the test provably reproduces the bug it guards |
| precondition | the fixture really has no `placeStyle` and no `dateStyle` |
| **(a)** Pizza Kitchen's stored event shape | opens; `placeStyle`, `dateStyle` and `placePicture` all present; `repaired: false` |
| **(a) ii** | **the operator's own box positions are KEPT** (`date.y === 600`, and that differs from the default) — a fallback would also stop the crash and silently discard them, so the two outcomes are told apart |
| **(b)** a place's own layout | opens, validated against the **place's** 900×900 picture size |
| **(c)** a weekly layout from before part 1 | opens with every field the editor reads |
| last resort | `null`, `undefined`, `42`, `'nope'`, `{}`, `{version:99}` → a usable layout, `repaired: true`, never a throw |
| `placeStyleSample` | never throws on six junk inputs — **and a known id still gets its own sample**, so "never throws" cannot be satisfied by a function that always returns one string |
| the wiring | all three read sites call the one door, **and `layout: design!.layout` appears nowhere** — asserted as an absence so a future read site cannot quietly reintroduce it |

**`scripts/design-editor.cjs`: 70 checks, all passing** (was 60).

---

## 🔴 4 · "PLACE PICTURES" → "LOCATION IMAGES" — WORDING ONLY

⛔ **No table, column, route, action, prop or identifier was renamed.** `place_pictures`,
`PLACE_PICTURES_TITLE`, `place_picture_list`, `placePictureId`, `picturesCount`, `noPicturesLine` and
the editor item's `key: 'place-picture'` all keep their names — that key is **stored inside saved
layouts**. ⚠️ **So a grep for "place pictures" in code still finds things. That is expected**, and a
note at the top of the copy block says so.

| Where | Now reads |
|---|---|
| Designs box heading | **Location images** |
| its description | *"Save images for a location — a pub's logo, a photo, a festival's poster. Your designs decide where they appear: in an image box on your weekly or single event post, or as the whole background."* |
| group headings | **No images yet (n)** / **With images (n)** |
| row sub-line | **town · N images** — `picturesCount(1) === '1 image'`, asserted by **calling** it |
| box footer | *"N with images · M with none"* |
| a location's page line | *"Images for this location. The one marked Main is used automatically; you can pick a different one when you make a post."* |
| the add tile | **+ Add image** |
| own-positions link | *"Own text positions for this location (optional)"* |
| remove confirm | *"…It is this location's Main image — the next one becomes Main."* |
| editor item | **Location image** · sample **"The location's Main image"** (and *", as the whole background"*) |
| editor toolbar | **Location images** · **+ Add location images** · **If a location has no image** · *Advanced · Location image* |
| the weekly count line | *"16 of your 20 locations have no image yet"* / *"All 20 of your locations have an image."* |
| the overlay chip on the canvas | **Location image** |
| make-post panel | **Image for this location** |

⚠️ **The wrong-shape note was already the brief's wording** — *"Different shape — can't be used as a
whole background"* — and is unchanged.
🟢 **The "Place" TEXT item keeps its name**, as the brief asks: `{ key: 'location', name: 'Place', … }`.
⚠️ **"picture" still appears in copy the brief did not list** — the weekly design blurb, the empty
state, `EMPTY_BODY`. Those belong to other boxes and were left alone.

### Harnesses re-aimed to the new words

| | |
|---|---|
| `scripts/place-pictures.cjs` | 7 checks — **75/75** |
| `scripts/social-posts.cjs` | 5 checks — **97/97** |
| `scripts/social-posts-render.cjs` | the fixture's row text, group headings, footer and add tile — **passes in both engines** |

🟢 **One check got stronger in the move.** The singular was pinned by a regex on the ternary's source;
it now **compiles `lib/copy/socialPosts.ts` and calls the function** — `picturesCount(1) === '1 image'`
and `picturesCount(3) === '3 images'`. "1 images" is the bug that function exists to prevent, and a
regex on its source would pass on a wrong branch.

---

## ✅ 5 · WHAT WAS RUN

| | |
|---|---|
| `npx tsc --noEmit` | **clean** |
| `node scripts/run-harnesses.cjs` | **98 run · 98 passed · 0 failed** |
| `scripts/design-editor.cjs` on its own | **70/70** (was 60 — ten new) |
| `scripts/place-pictures.cjs` | **75/75** |
| `scripts/social-posts.cjs` | **97/97** |
| `scripts/social-posts-render.cjs` (not sweepable) | by hand, **both engines pass** |

---

## 🧪 6 · THE LOCALHOST TEST LIST — PIZZA KITCHEN ONLY, SAFARI, ⌘⌥R

`npm run dev` · Manage → **Schedule → Social posts**. Pizza Kitchen, slug `test-kitchen`, id
`test-truck`. **Do not open Pizzeria Gusto or any other truck.**

### 6.1 · The crash

| | Do | Expect |
|---|---|---|
| 1 | **Designs → Edit single event design** | 🔴 **it opens.** No red screen, nothing in the console |
| 2 | Look at the left-hand item list | every item is there, including **Location image** |
| 3 | Select **Place** in that list | the sample reads *The Kings Arms / Lavenham* — the default style, because this design predates the setting |
| 4 | Drag a box, press **Save** | saves; reopen and the position is where you left it |
| 5 | **Designs → Location images →** a location with its own positions → the quiet **"Own text positions for this location (optional)"** link | the editor opens on **that location's** picture, boxes inside it |
| 6 | **Designs → Edit weekly design** | opens; the week rows and every item render |
| 7 | Console throughout | **no `undefined is not an object`** |

### 6.2 · The wording

| | Look at | Expect |
|---|---|---|
| 8 | Designs, box 3 | heading **Location images**; the description names *an image box … or as the whole background* |
| 9 | its list | **NO IMAGES YET (n)** then **WITH IMAGES (n)**; rows read *town · N images* (and *1 image* for one) |
| 10 | the footer under it | *"N with images · M with none"* |
| 11 | open a location | *"Images for this location. The one marked Main is used automatically…"*, and a **+ Add image** tile |
| 12 | a differently-shaped image | *"Different shape — can't be used as a whole background"* |
| 13 | the ⋯ menu on an image | Make main · Rename · Remove, and the confirm says *"…this location's Main image"* |
| 14 | **Edit weekly design**, the **Location image** item | toolbar says **Location images**, **+ Add location images**, and *"N of your M locations have no image yet"* |
| 15 | the same item on the single event design | **If a location has no image** · *Advanced · Location image* |
| 16 | **Make a post → Single event post**, at a location with 2+ images | the panel is **Image for this location** |
| 17 | the **Place** item in either editor | still called **Place** — unchanged, as asked |

---

## ⚠️ 7 · WHAT I COULD NOT VERIFY

1. ⚠️ **I did not open the editor in a browser.** No SQL was run and nothing was written, so I could not
   load Pizza Kitchen's actual row. The three cases are proven against **fixtures built from the real
   pre-part-1 shapes in git**, with a control that proves the old expression throws on them — but
   step 1 of §6.1 is still yours to confirm.
2. ⚠️ **The exact bytes of Pizza Kitchen's stored layout are unknown to me.** If it carries something
   beyond "pre-part-1 defaults" — a box outside the canvas after a resize, say — it will open on the
   **default** layout rather than its own positions, and `repaired` will be true. §6.1 step 4 is what
   would reveal that: if the boxes are not where you left them, tell me and I will look.
3. ⚠️ **`repaired` is surfaced nowhere.** An operator whose layout could not be read gets a working
   editor and no explanation. A one-line banner is the obvious next step if you want it.
4. ⚠️ **`event-types-render.cjs`** failed once in a full sweep yesterday and passes on its own; it is a
   Playwright harness and was competing with a local server. Unrelated to this change.
