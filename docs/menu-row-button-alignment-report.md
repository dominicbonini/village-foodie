# Menu row — one right edge for Add, one left edge for the price

**Built and MEASURED AT THE CLIENT. Nothing committed, nothing deployed. No SQL, no migrations.**

---

## VERIFICATION

**EXECUTION.** Headless Chromium (puppeteer 24.43.1) against the dev server at **430 / 390 / 375 /
320px**, `deviceScaleFactor: 2`, `isMobile: true`, after the client-side menu fetch — 26 rows, 2 with
photos. **PARSE:** `tsc` syntax-only, clean. **Not offered as verification.**

**No span of the prompt arrived garbled. No instruction contradicted another.**

⚠️ **You sent two corrections while I was working and both are incorporated and measured:** the price not
sitting bottom-left, and the description stopping short of the screen edge on photo-less rows. **The
second one invalidated my first structure — see §3.**

---

## 1 · 🔴 ADD BUTTON — RIGHT OFFSETS, DISTINCT SET

| Viewport | Distinct right offsets across all 26 rows | |
|---|---|---|
| **430px** | **`[405]`** | ✅ **ONE VALUE** |
| **390px** | **`[365]`** | ✅ **ONE VALUE** |
| **375px** | **`[350]`** | ✅ **ONE VALUE** |
| **320px** | **`[295]`** | ✅ **ONE VALUE** |

**Each is the card's content right edge (viewport − 16px main padding − 8px card padding − 1px border).
Photo and photo-less rows share it.**

## 2 · 🔴 PRICE — LEFT OFFSETS, DISTINCT SET

| Viewport | 430px | 390px | 375px | 320px |
|---|---|---|---|---|
| **Distinct price left offsets** | **`[25]`** | **`[25]`** | **`[25]`** | **`[25]`** |
| | ✅ ONE | ✅ ONE | ✅ ONE | ✅ ONE |

**Identical to the text column's own left offset — the price is the leftmost thing on its line, at the
bottom of the row, on every row.**

### And the fault you spotted mid-task is fixed and measured

**Photo-less rows: the description's right edge now equals the button's right edge** —
**430 `[405]` · 390 `[365]` · 375 `[350]` · 320 `[295]`** — i.e. **the text spans the full card width**
(measured widths **380 / 340 / 325 / 270px**). **It no longer stops short.**

---

## 3 · 🔴 HOW IT IS STRUCTURED — ONE RENDER PATH, AND IT TOOK THREE ATTEMPTS

> **Your question — "does that mean two render paths for the same control?" — was the right one to ask.
> The answer is NO, and avoiding it is what forced the final structure.**

```jsx
<div className="py-3">
  {/* TOP: text + optional image */}
  <div className="flex items-start gap-3 w-full min-w-0">
    <div className="flex-1 min-w-0"> name · description · chips · spice · required-preview </div>
    {item.photo_url && <img width={80} height={80} className="w-20 h-20 max-w-[80px] rounded-xl object-cover shrink-0 …" />}
  </div>
  {/* BOTTOM LINE: full row width, ALWAYS rendered, ONE instance */}
  <div className="flex items-center justify-between gap-2 mt-2 min-w-0">
    <span>£{price}</span>
    {/* the Add / stepper / Sold-out group — written once */}
  </div>
</div>
```

**The Add/stepper block is rendered ONCE** — verified: the button group's class string occurs **1** time
in the file. **There is no photo/no-photo branch around it, so there is nothing that can drift.** That is
the structural answer, not a convention anyone has to remember.

### The three structures, and why the first two failed — measured, not reasoned

| # | Structure | Result |
|---|---|---|
| 1 | **Add inside the TEXT column** (`justify-between` with the price) | 🔴 Its right edge was the *text column's* edge → on a photo row it sat **~92px left** of a photo-less row. **Two right edges — the fault you reported.** |
| 2 | **Add in a persistent RIGHT column, under the image** (`flex-col items-end self-stretch` + `mt-auto`) | ✅ One right edge — **but the column reserved ~60px of width for its FULL height**, so on a photo-less row the description stopped ~60px short. 🔴 **This is the fault you spotted mid-task. Measured and rejected.** |
| 3 | ✅ **Add on its own FULL-WIDTH line below the image** | ✅ **Both edges are the ROW's edges on every row, and the text above spans the full width whenever there is no photo.** |

> **Structure 3 is the one that gives one render path AND one right edge, which is what you asked me to
> prefer.** Structure 2 also had one render path but bought it by permanently narrowing the text.

⚠️ **This is effectively the ORIGINAL bottom baseline restored** — the file's own *"canonical food-app
layout — PRICE left, Add/stepper right"*. **The image moving to the right of the top section is what
makes it work now.** The comment records all three attempts rather than replacing the reasoning.

---

## 4 · Vertical relationship on a photo row

> **The button is aligned to the ROW's bottom, on its own full-width line BELOW the image — not to the
> image's bottom, and not directly underneath the thumbnail inside a shared column.**

| Viewport | Row height | Image top vs name top | Button bottom | Price bottom | Price − Button |
|---|---|---|---|---|---|
| **430px** | 147 / 140px | **Δ 0px** | 2348 / 3118 | 2344 / 3114 | **−4px** |
| **390px** | 166 / 141px | **Δ 0px** | 2405 / 3177 | 2401 / 3173 | **−4px** |
| **375px** | 166 / 141px | **Δ 0px** | 2444 / 3215 | 2440 / 3211 | **−4px** |
| **320px** | 185 / 160px | **Δ 0px** | 2630 / 3498 | 2626 / 3494 | **−4px** |

- ✅ **Image top-aligns with the item name to the pixel (Δ0)** at every viewport — `items-start`.
- ✅ **Price and Add share a baseline**: the −4px is the text's box bottom against the button's box
  bottom, **identical on every row including photo-less ones**, so it reads as one line.
- **Photo-less rows: 71px → now 122-141px**, because the price/Add line is no longer sharing a line with
  anything. **This is the cost of the full-width bottom line and it is uniform across all rows.**

---

## 5 · The short photo row — forced and measured

**No item on the test menu has a photo AND no description, so I stripped the description and chips from a
photo row in the live DOM.**

| | 390px | 320px |
|---|---|---|
| Text column | **19px** | **19px** |
| Image | 80px | 80px |
| **Top section height** | **80px — 🔴 THE IMAGE SETS IT** | **80px — THE IMAGE SETS IT** |
| Whole row | **140px** | **140px** |
| Bottom line starts at | y=2351 (image bottom 2343) | y=2537 (image bottom 2529) |
| **Price** | left **25**, bottom 2375 | left **25**, bottom 2561 |
| **Button** | right **365**, bottom 2379 | right **295**, bottom 2565 |
| **Does the price float?** | 🔴 **NO** | 🔴 **NO** |
| Row scroll / offscreen | 340/340 ok · 0 | 270/270 ok · 0 |

> ✅ **The image sets the top section's height; the price cannot float, because the bottom line is its own
> full-width row BELOW the image rather than a thing pinned inside a column.** **This is precisely what
> structure 2 got wrong and structure 3 makes impossible.**

---

## 6 · Guarantees — all held

| | |
|---|---|
| `min-w-0` chain — top row, text column, name row, bottom line | ✅ Kept |
| `break-words` on the name | ✅ Kept — **a 46-char unbroken token wraps at all four viewports** |
| `width`/`height` attributes on the img | ✅ Kept (`width={80} height={80}`) |
| `w-full` on the top row, `max-w-[80px]` + `shrink-0` on the img | ✅ Kept |
| **No `overflow-hidden` / `overflow-x-clip`** | ✅ **None used** |
| **Rows with `scrollWidth > clientWidth`** | ✅ **0** at 430/390/375/320 |
| **Elements past the right edge** | ✅ **0** at all four |
| **Page horizontal scroll** | ✅ None — `scrollWidth === clientWidth` at all four |

## 7 · Button size and styling — untouched

**Measured 48 × 28 at every viewport, photo and photo-less.** ✅ **Unchanged.** I moved the block; I did
not alter one class on it. **The 28px tap target remains your open decision.**

---

## 8 · The console snippet — updated for both sets

```js
console.log((()=>{const W=[...document.querySelectorAll('div.py-3')].filter(x=>x.querySelector('div.flex.items-start.gap-3'));const pr=w=>[...w.querySelectorAll('span')].find(s=>s.textContent.trim().startsWith('£'));const bt=w=>{const l=w.lastElementChild;return l.querySelector('button')||l.querySelector('span')};const V=W.filter(x=>pr(x)&&bt(x));const R=[...new Set(V.map(x=>Math.round(bt(x).getBoundingClientRect().right)))].sort();const L=[...new Set(V.map(x=>Math.round(pr(x).getBoundingClientRect().left)))].sort();const bad=V.filter(x=>x.scrollWidth>x.clientWidth).length;return`rows=${V.length}\nBUTTON-RIGHT=${JSON.stringify(R)} ${R.length===1?'ONE VALUE OK':'FAIL'}\nPRICE-LEFT=${JSON.stringify(L)} ${L.length===1?'ONE VALUE OK':'FAIL'}\nimages=${JSON.stringify(V.filter(x=>x.querySelector('img')).map(x=>{const g=x.querySelector('img').getBoundingClientRect();return Math.round(g.width)+'x'+Math.round(g.height)}))}\noverflowing=${bad}\nDOC ${document.documentElement.scrollWidth}/${document.documentElement.clientWidth}`})())
```

**Swap `console.log` for `alert` to read it on the device with no console.**

**Expected:** `BUTTON-RIGHT=[<one value>] ONE VALUE OK`, `PRICE-LEFT=[25] ONE VALUE OK`, every image
`80x80`, `overflowing=0`, and DOC values equal. 🔴 **Two or more values in either set means the change
has failed** — send me the output and it settles it in one round. ⚠️ **Hard-reload first.**

---

## Scope

| | |
|---|---|
| Files changed | 🔴 **`app/trucks/[slug]/order/page.tsx` ONLY** |
| Upload path, storage path, data model, manage screen, `AddOrderPanel`, API routes | ✅ **Untouched** |
| Add/stepper logic, modal, basket, stock gating, button styling | ✅ **Untouched — relocated only** |

⚠️ Other files show modified in `git status` — pre-existing uncommitted work from earlier today.

---

## What I could not establish

1. 🔴 **iOS Safari.** **Chromium only.** The snippet settles it.
2. **Whether the taller photo-less row (71 → ~141px) is acceptable.** **It is the direct cost of giving
   the price/Add line the full width, and it is uniform.** Measured, not judged.
3. **The short-photo-row case is a FORCED DOM measurement** — no such item exists on the test menu.
4. **How the right-hand thumbnail reads against a real photo** at 80px with `object-cover`.
