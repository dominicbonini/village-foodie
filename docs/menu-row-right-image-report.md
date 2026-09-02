# Menu row — image moved to the RIGHT

**Built and MEASURED AT THE CLIENT. Nothing committed, nothing deployed. No SQL, no migrations.**

---

## VERIFICATION — MEASURED IN A BROWSER

**What I performed: EXECUTION.** Headless Chromium (puppeteer 24.43.1) against the dev server at
**430 / 390 / 375 / 320px**, `deviceScaleFactor: 2`, `isMobile: true`, after the client-side menu fetch
(26 rows, 2 with photos). **PARSE:** `tsc` syntax-only — clean. **Not a typecheck as evidence.**

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 2 · 🔴 THE ALIGNMENT — THE POINT OF THE CHANGE. ONE VALUE, MEASURED.

**Text-column left offset, across all 26 rows, photo and photo-less:**

| Viewport | All rows | Photo rows | Photo-less rows | |
|---|---|---|---|---|
| **430px** | **`[25]`** | `[25]` | `[25]` | ✅ **ONE VALUE** |
| **390px** | **`[25]`** | `[25]` | `[25]` | ✅ **ONE VALUE** |
| **375px** | **`[25]`** | `[25]` | `[25]` | ✅ **ONE VALUE** |
| **320px** | **`[25]`** | `[25]` | `[25]` | ✅ **ONE VALUE** |

> ✅ **`[25]` is a set of DISTINCT measured left offsets across every row on the menu. It has exactly one
> member at every viewport.** The name, description, chips and price start at the same left edge whether
> or not the item has a photo. **The two-left-edge problem (25px vs 117px) is gone.**

---

## 1 · The restructure

**The image block moved from before the text column to after it. Same element, same classes, same
`width`/`height` attributes — only its position in the row changed.**

```jsx
<div className="flex items-start gap-3 w-full min-w-0">
  <div className="flex-1 min-w-0">        {/* name · description · chips · spice · preview · price+Add */}
  </div>
  {item.photo_url && <img width={80} height={80}
       className="w-20 h-20 max-w-[80px] rounded-xl object-cover shrink-0 border border-slate-100" />}
</div>
```

**Rows without a photo have no image column and no spacer — the text column takes the full width**
(measured: **380 / 340 / 325 / 270px** at the four viewports, i.e. the whole row).

### The reversal is recorded, not silently replaced

**As with "Option B", the previous reasoning is kept in the comment and marked superseded:**

> *"🔴 THIS REVERSES THE LEFT-HAND PLACEMENT BUILT EARLIER THE SAME DAY, AND THE REASONING IS KEPT RATHER
> THAN REPLACED. Left-hand was correct only if every row had a photo. MEASURED: 27 of 29 items on a real
> menu have none, so a left image gave the list TWO left edges — 25px on photo-less rows, 117px on photo
> rows — and the vertical spine of the list was lost. … 🔴 THAT ALIGNMENT IS THE POINT: anything that
> reintroduces a second left edge defeats this change."*

---

## 3 · 🔴 THE ADD BUTTON — I kept it at the text column's right edge

**Chosen: the button STAYS where it is** — the bottom baseline of the text column, price left / Add
right. **Not under the image, not moved to the left.**

### Why

1. 🔴 **It is not actually a conflict — measured.** The button is inside the *text column*, which ends
   where the image column begins. On a normal row the text column is **117-161px** tall against an
   **80px** image, so **the button sits BELOW the image's bottom edge, not beside it.**

| Viewport | Item | textCol height | image bottom | button top | Beside the image? |
|---|---|---|---|---|---|
| 390px | Margherita | 142px | 2343 | 2377 | **NO — below it** |
| 390px | Pepperoni | 117px | 3140 | 3149 | **NO — below it** |
| 320px | Margherita | 161px | 2529 | 2583 | **NO — below it** |
| 320px | Pepperoni | 136px | 3422 | 3450 | **NO — below it** |

2. **It preserves a documented decision** — the file's own comment calls price-left/Add-right *"the
   canonical food-app layout"* and explains the left-aligned price gives *"a clean, consistent edge down
   the list"*. **Moving the button would reverse a third decision in one day for no measured gain.**
3. **Moving it under the image would break on photo-less rows**, which have no image column — the button
   would need two different homes depending on whether a photo exists. **That is the two-left-edges
   mistake in a new place.**

### The edge case, forced and measured rather than reasoned

**No item on the test menu has a photo AND no description, so I stripped the description and chips from
a photo row in the live DOM to create the shortest possible photo row:**

| Viewport | textCol | Row height | Button | Beside image? | Horizontal gap | Row scroll | Offscreen |
|---|---|---|---|---|---|---|---|
| **390px** | **55px** | **80px** (the image sets it) | **48×28** | **YES** | **12px** | 340/340 ok | 0 |
| **320px** | **55px** | **80px** | **48×28** | **YES** | **12px** | 270/270 ok | 0 |

> ✅ **Even in the only case where they do share a line, nothing is squeezed: the button keeps its full
> 48×28 and there is a 12px gap to the thumbnail, at 320px.**

### 🔴 THE MEASURED TAP TARGET — 48 × 28 px, AND 28px IS BELOW GUIDELINE

**Identical at every viewport, on photo and photo-less rows alike.**

> 🔴 **28px tall is under the 44px (iOS HIG) / 48px (Material) minimum.**
> ⚠️ **THIS IS PRE-EXISTING AND UNCHANGED BY THIS WORK.** The button has been
> `px-3 py-1.5 text-xs` throughout; **I did not shrink it and this layout does not squeeze it** — the
> measurement is the same on rows with no image at all. **I am reporting it because you asked for the
> number, not because this change caused it.** Raising it to `py-3` (44px) is a one-class change on a
> separate decision, and I have not made it.

---

## 4 · Top alignment ✅ — measured, exact

| Viewport | image top | name top | Δ |
|---|---|---|---|
| 430px | 2225 | 2225 | **0px** |
| 390px | 2263 | 2263 | **0px** |
| 375px | 2302 | 2302 | **0px** |
| 320px | 2469 | 2469 | **0px** |

**`items-start` on the row. The thumbnail sits exactly level with the item name, not mid-row.**

---

## 5 · Guarantees kept — all verified in the served CSS and by measurement

| Guarantee | State |
|---|---|
| `min-w-0` chain — row, text column, name row, price row | ✅ **Kept.** `.min-w-0{min-width:0}` present in the served stylesheet |
| `break-words` on the name | ✅ **Kept.** `.break-words{overflow-wrap:break-word}` present. **A 46-character unbroken token wraps at all four viewports** |
| `width`/`height` HTML attributes on the img | ✅ **Kept** — `width={80} height={80}` |
| `w-full` on the row, `max-w-[80px]` + `shrink-0` on the img | ✅ **Kept.** `.max-w-\[80px\]{max-width:80px}` present |
| **No `overflow-hidden` / `overflow-x-clip`** | ✅ **None used** |
| **No row scrolls horizontally** | ✅ **0 overflowing rows** at 430/390/375/320 |
| **Nothing off-screen** | ✅ **0 elements** with `right >` viewport, at all four |
| **Page does not scroll horizontally** | ✅ `scrollWidth === clientWidth` at all four |

---

## 6 · Full measurement table

| | 430px | 390px | 375px | 320px |
|---|---|---|---|---|
| Page `scrollWidth`/`clientWidth` | 430/430 | 390/390 | 375/375 | 320/320 |
| Rows measured | 26 | 26 | 26 | 26 |
| **Rows with `scrollWidth > clientWidth`** | **0** | **0** | **0** | **0** |
| **Elements past the right edge** | **0** | **0** | **0** | **0** |
| Image rendered | **80×80** | **80×80** | **80×80** | **80×80** |
| Image left offset (photo rows) | 325 | 285 | 270 | 215 |
| **Text-column left (ALL rows)** | **25** | **25** | **25** | **25** |
| Text-column width — photo row | 288 | 248 | 233 | 178 |
| Text-column width — photo-less row | 380 | 340 | 325 | 270 |
| Add button | 48×28 | 48×28 | 48×28 | 48×28 |
| 46-char unbroken token | wraps | wraps | wraps | wraps |

### 🔴 The console snippet — run it on the phone

**One line. Paste into Safari's console (Mac Web Inspector), or use the `alert` version below on-device:**

```js
console.log((()=>{const R=[...document.querySelectorAll('div.flex.items-start.gap-3')];const L=[...new Set(R.map(r=>Math.round(r.querySelector(':scope>div.flex-1').getBoundingClientRect().left)))];return R.map((r,i)=>{const g=r.querySelector(':scope>img'),c=r.querySelector(':scope>div.flex-1').getBoundingClientRect(),b=r.querySelector('button');return`#${i} img=${g?Math.round(g.getBoundingClientRect().width)+'x'+Math.round(g.getBoundingClientRect().height):'none'} nat=${g?g.naturalWidth+'x'+g.naturalHeight:'-'} colLeft=${Math.round(c.left)} colW=${Math.round(c.width)} btn=${b?Math.round(b.getBoundingClientRect().width)+'x'+Math.round(b.getBoundingClientRect().height):'-'} ${r.scrollWidth>r.clientWidth?'OVERFLOW':'ok'}`}).join('\n')+`\nLEFT-OFFSETS=${JSON.stringify(L)} ${L.length===1?'ONE VALUE OK':'FAIL: MORE THAN ONE'}\nDOC ${document.documentElement.scrollWidth}/${document.documentElement.clientWidth}${document.documentElement.scrollWidth>document.documentElement.clientWidth?' PAGE-SCROLLS':''}`})())
```

**No-console version (dialog on the device):**

```js
alert((()=>{const R=[...document.querySelectorAll('div.flex.items-start.gap-3')];const L=[...new Set(R.map(r=>Math.round(r.querySelector(':scope>div.flex-1').getBoundingClientRect().left)))];const bad=R.filter(r=>r.scrollWidth>r.clientWidth).length;const im=R.filter(r=>r.querySelector(':scope>img')).map(r=>{const g=r.querySelector(':scope>img').getBoundingClientRect();return Math.round(g.width)+'x'+Math.round(g.height)});return`rows=${R.length}\nLEFT-OFFSETS=${JSON.stringify(L)} ${L.length===1?'ONE VALUE OK':'FAIL'}\nimages=${JSON.stringify(im)}\noverflowing rows=${bad}\nDOC ${document.documentElement.scrollWidth}/${document.documentElement.clientWidth}`})())
```

**What it should say:** `LEFT-OFFSETS=[25] ONE VALUE OK`, every `img=80x80`, `overflowing rows=0`, and no
`PAGE-SCROLLS`. 🔴 **If `img=` equals `nat=`, the stylesheet has not applied on that device** — the same
check as last round. ⚠️ **Hard-reload first.**

---

## 7 · Scope

| | |
|---|---|
| Files changed | 🔴 **`app/trucks/[slug]/order/page.tsx` ONLY** |
| Upload path, storage path, data model | ✅ **Untouched** |
| Manage screen, `AddOrderPanel`, API routes | ✅ **Untouched** |
| Add/stepper logic, modal, basket, stock gating | ✅ **Untouched** — the button was not modified, only its neighbours |

⚠️ Other files show modified in `git status` — **all pre-existing uncommitted work from earlier today,
none from this task.**

---

## What I could not establish

1. 🔴 **How it renders in iOS Safari.** **Chromium only.** The snippet in §6 settles it in one round, and
   the previously reported phone breakage was never reproduced here.
2. **Whether the right-hand thumbnail reads well against a real photo** — `object-cover` on a square crop
   of a 3811×3781 source. **Measured, not judged.**
3. **Whether 28px is an acceptable tap target to you.** **Reported, not changed.**
4. **The shortest-photo-row case is a FORCED measurement** — I removed the description from a live row in
   the DOM because no such item exists on the test menu. **Real data would confirm it.**
