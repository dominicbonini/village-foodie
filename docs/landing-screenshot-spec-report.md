# Landing hero screenshots — what the page expects

**Read-only. No source file changed, nothing deployed, nothing committed.**
**No addition was made to `docs/landing-copy-restore-notes.md` — nothing was edited, so there was
nothing to record.**

---

## VERIFICATION

- **Executed:** reads of `app/landing/page.tsx`, `app/landing/landing.css`, `app/landing/layout.tsx`,
  `components/landing/DemoUpload.tsx`, and directory listings of `public/`. **That is execution of my
  reading, not of the product.**
- 🔴 **I have not rendered the landing page at any viewport.** Every pixel figure below is **computed
  from the CSS tokens**, not measured in a browser. **Treat them as a specification to check, not as an
  observation.**
- **No typecheck was run and none is offered as verification.**

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 🔴 READ THIS FIRST — you launch Thursday

**Two things about the hero are not what the brief assumes, and both bear on the launch:**

1. 🔴 **THE LANDING PAGE IS ADMIN-ONLY IN PRODUCTION.** `app/landing/layout.tsx` redirects every
   non-admin to `/contact`. **The page also carries `robots: { index: false, follow: false }`.** Real
   screenshots are **one of the two conditions** the gate's own comment names for coming off — **the
   other is written permission for the Pizzeria Gusto testimonial, which is not a code fix and is not
   yours to unblock by shipping images.**
2. ⚠️ **The hero's "under 60 seconds" claim is contradicted by the demo's own code**, which has a
   60-second "still working" reassurance and a 90-second escape hatch. **Details in §6.**

---

## 1 · The hero screenshot fan

### Markup — `app/landing/page.tsx:138-144`, verbatim

```jsx
          {/* Screenshot fan — dashed PLACEHOLDER frames. DOMINIC: swap each .shot for a real <img> (tidy data,
              plausible names/items) when screenshots are ready. */}
          <div className="fan">
            <div className="shot shot-kds"><span className="lbl">Screenshot</span><span className="hint">Kitchen screen — tickets in cook order</span></div>
            <div className="shot shot-dash"><span className="lbl">Screenshot</span><span className="hint">Orders dashboard — realistic orders, capacity strip visible</span></div>
            <div className="shot shot-phone"><span className="lbl">Screenshot</span><span className="hint">Customer ordering</span></div>
          </div>
```

### CSS — `app/landing/landing.css:161-171`, verbatim

```css
/* ---------- screenshot fan (dashed placeholders — keep until real shots land) ---------- */
.hg-landing .fan { position: relative; display: flex; align-items: center; justify-content: center; min-height: clamp(300px,42vw,430px); animation: hg-rise .7s cubic-bezier(.2,.7,.3,1) both; }
@keyframes hg-rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
@media(prefers-reduced-motion:reduce){ .hg-landing .fan { animation: none; } html:has(.hg-landing){ scroll-behavior: auto; } }
.hg-landing .shot { background: var(--paper); border: 2px dashed var(--line); border-radius: 12px; box-shadow: 0 22px 50px -20px rgba(15,23,42,.32),0 2px 8px rgba(15,23,42,.06); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .35rem; text-align: center; padding: 1rem; position: absolute; }
.hg-landing .shot .lbl { font-family: var(--display); font-weight: 700; font-size: .66rem; letter-spacing: .14em; text-transform: uppercase; color: var(--ink-faint); }
.hg-landing .shot .hint { font-size: .78rem; color: var(--ink-faint); max-width: 22ch; line-height: 1.35; }
.hg-landing .shot-kds { width: min(58%,320px); aspect-ratio: 4/3; left: 0; top: 8%; transform: rotate(-6deg); z-index: 1; }
.hg-landing .shot-dash { width: min(72%,400px); aspect-ratio: 16/11; left: 50%; top: 50%; transform: translate(-50%,-50%) rotate(-1deg); z-index: 2; border-color: var(--ink-faint); }
.hg-landing .shot-phone { width: min(26%,140px); aspect-ratio: 9/17; right: 2%; bottom: 0; transform: rotate(5deg); z-index: 3; border-radius: 18px; }
.hg-landing .shot-phone .hint { font-size: .7rem; }
```

### The three slots

| Slot | Aspect ratio | Max CSS width | Position | Rotation | z-index | Radius |
|---|---|---|---|---|---|---|
| `.shot-kds` | **4 / 3** (landscape) | `min(58%, 320px)` | `left:0; top:8%` | **−6°** | 1 (back) | 12px |
| `.shot-dash` | **16 / 11** (landscape) | `min(72%, 400px)` | centred | **−1°** | 2 (middle) | 12px |
| `.shot-phone` | **9 / 17** (tall portrait) | `min(26%, 140px)` | `right:2%; bottom:0` | **+5°** | 3 (front) | **18px** |

### How they are sized and cropped

🔴 **THEY ARE NOT CROPPED — BECAUSE THERE IS NOTHING TO CROP YET.** The `.shot` divs are **empty
frames**: no `<img>`, no `background-image`, no `object-fit`, no `overflow`. The `aspect-ratio` sizes the
**box**; nothing constrains an image inside it, because there is no image.

⚠️ **THIS IS THE MOST IMPORTANT GOTCHA IN THIS REPORT:**

> **`.shot` has `border-radius` but NOT `overflow: hidden`.** Drop an `<img>` in as-is and its **square
> corners will poke out past the rounded frame**, and at `.shot-phone`'s 18px radius it will look
> obviously wrong. It also has **`padding: 1rem`**, which will inset your image by 16px on every side,
> and **`display: flex`**, which will not stretch a child to fill.

**Whoever wires the images will need `overflow:hidden`, `padding:0`, and `width/height:100%` +
`object-fit:cover` on the img. §4 lists it as a change, not a caveat.**

### `next/image` or plain `<img>`?

**Currently neither — the frames are empty divs.** The two signals disagree:

- **The in-code comment says `<img>`:** *"swap each .shot for a real `<img>`"*.
- **The page's own convention is `next/image`:** it imports `Image` at `:20` and uses it for the Gusto
  logo at `:225` — `<Image className="quote-logo" src="/gusto-logo.png" alt="" width={320} height={233} />`.

⚠️ **This is a decision for you, not a fact I can report.** `next/image` gives automatic srcset and lazy
loading and matches the file's existing usage; a plain `<img>` is simpler and avoids the layout-shift
rules interacting with `position:absolute`. **I have not tested either inside an absolutely-positioned,
rotated, aspect-ratio'd box.**

### File path and naming convention

🔴 **THE CODE SPECIFIES NONE. There is no `src` anywhere in the fan, and no comment names a path.**
**Anything below is convention inferred from `public/`, not a requirement:**

```
public/gusto-logo.png          ← flat, kebab-case, at the root
public/og.image.png
public/logos/<slug>.jpg|png    ← 100+ truck logos
public/photos/<slug>.jpg       ← truck photos
public/illustrations/*.svg
```

**A consistent choice would be `public/screenshots/<name>.png`, but nothing in the code expects it.**

---

## 2 · What each slot is meant to show

✅ **The code DOES say — it is in the placeholder hint text**, which is the brief the placeholders were
written to carry:

| Slot | The hint, verbatim |
|---|---|
| `.shot-kds` | **"Kitchen screen — tickets in cook order"** |
| `.shot-dash` | **"Orders dashboard — realistic orders, capacity strip visible"** |
| `.shot-phone` | **"Customer ordering"** |

**And the markup comment adds one instruction covering all three:** *"tidy data, plausible names/items"*.

⚠️ **The dashboard hint is the most specific and the most demanding:** it asks for **realistic orders**
*and* the **capacity strip visible**. **That is a composition requirement, not just a screenshot.**

⚠️ **"Customer ordering" is the vaguest of the three** — it does not say which step (menu, basket, slot
picker, confirmation). **Your call.**

---

## 3 · Exactly what to produce

### The pixel maths, and where it comes from

**Computed, not measured.** `--max: 1140px`, `--gut: clamp(1.25rem,4vw,2.5rem)`,
`.hero-grid` at ≥940px is `.9fr 1.1fr` with `gap: clamp(2.5rem,5vw,3.5rem)`.

```
content width  = 1140 − (2 × 40)          = 1060px
minus the gap  = 1060 − 56                = 1004px
fan column     = 1004 × (1.1 ÷ 2.0)       ≈ 552px      ← the widest the fan ever gets
```

| Slot | % of 552px | vs its cap | **Effective CSS size** |
|---|---|---|---|
| `.shot-kds` | 58% ≈ 320.2px | **320px cap binds** | **320 × 240** |
| `.shot-dash` | 72% ≈ 397.4px | under the 400px cap — **the % binds** | **397 × 273** (spec to **400 × 275**) |
| `.shot-phone` | 26% ≈ 143.5px | **140px cap binds** | **140 × 264** |

### 🔴 What to produce — export at 2×

| File | Slot | **Export (2×)** | Aspect | Notes |
|---|---|---|---|---|
| Kitchen screen | `.shot-kds` | **640 × 480** | 4:3 | Landscape. Tablet KDS |
| Orders dashboard | `.shot-dash` | **800 × 550** | 16:11 | Landscape. **Capacity strip must be in frame** |
| Customer ordering | `.shot-phone` | **280 × 529** | 9:17 | **Tall portrait — taller than a 9:16 phone screen** |

- **Format: PNG.** UI screenshots are flat colour and text; PNG stays sharp where JPEG will fringe the
  type. `public/gusto-logo.png` and `og.image.png` are already PNG. ⚠️ **WebP would be smaller — but
  nothing in this repo uses it, so PNG is the consistent choice.**
- **Retina: 2× is what I would supply.** 🔴 **Nothing in the code requests it** — there is no `srcSet`,
  no `sizes`, no `@2x` file anywhere. **If you use `next/image`, it generates its own srcset from one
  source and 2× is simply your source resolution. If you use a plain `<img>`, 2× is the whole retina
  story.** 3× would be ~1.4 MB for three images above the fold; **I would not.**
- **Where:** ⚠️ **The repo does not say.** `public/screenshots/` is my suggestion, consistent with
  `public/logos/` and `public/photos/`.

### 🔴 The one that will catch you out

**`.shot-phone` is 9:17, not 9:16.** A raw iPhone screenshot (2556×1179 → 9:19.5) or a 9:16 capture
**will be cropped top and bottom by `object-fit: cover`** once the CSS is fixed. **Compose for 9:17 or
expect to lose the top and bottom of the screen.**

---

## 4 · Placeholder styling that must come off

🔴 **Do NOT drop a real screenshot into the current CSS. It would render inside a dashed frame, inset by
16px, with square corners poking past the rounded border.**

| # | Where | What | Action |
|---|---|---|---|
| 1 | `landing.css:165` `.shot` | **`border: 2px dashed var(--line)`** | 🔴 **REMOVE** — the dashed frame |
| 2 | `landing.css:165` `.shot` | **`background: var(--paper)`** | **REMOVE** — it will be covered, but it flashes before the image loads |
| 3 | `landing.css:165` `.shot` | **`padding: 1rem`** | 🔴 **REMOVE** — otherwise a 16px inset all round |
| 4 | `landing.css:165` `.shot` | `display:flex; flex-direction:column; align-items:center; justify-content:center; gap:.35rem; text-align:center` | **REMOVE** — these centre the placeholder text and do nothing useful for an image |
| 5 | `landing.css:165` `.shot` | **no `overflow`** | 🔴 **ADD `overflow: hidden`** — or the radius does not clip the image |
| 6 | `landing.css:166` | **`.shot .lbl` rule** | **DELETE** — dead once the span goes |
| 7 | `landing.css:167` | **`.shot .hint` rule** | **DELETE** — dead |
| 8 | `landing.css:171` | **`.shot-phone .hint` rule** | **DELETE** — dead |
| 9 | `landing.css:169` `.shot-dash` | **`border-color: var(--ink-faint)`** | **DELETE** — a placeholder-only darkening of the dashed border |
| 10 | `landing.css:161` | Section comment: *"(dashed placeholders — keep until real shots land)"* | **REWRITE** |
| 11 | `page.tsx:138-139` | The `DOMINIC: swap each .shot…` comment | **REWRITE or DELETE** |
| 12 | `page.tsx:141-143` | **The six `<span className="lbl">` / `<span className="hint">` elements** | 🔴 **DELETE** — this is the visible "Screenshot" text |
| 13 | `page.tsx:7-8` | Header comment: *"real screenshots in place of the placeholders below"* | **UPDATE** — it is one of the two gate conditions |
| 14 | `app/landing/layout.tsx:9-13` | The gate's stated condition 2 | **UPDATE** once shots land — ⚠️ **condition 1 (testimonial) is separate** |

### ✅ Keep

- **`box-shadow`** on `.shot` — that is the fan's depth, not placeholder styling.
- **`border-radius`** (12px / 18px), all **rotations**, all **positions**, all **z-indexes**,
  **`aspect-ratio`**, and the **`hg-rise` animation**. **None of it is placeholder.**

⚠️ **Each image will need `width:100%; height:100%; object-fit:cover; display:block`** — none of which
exists yet.

---

## 5 · Responsive behaviour

🔴 **THE FAN HAS NO MEDIA QUERY AT ALL.** `.fan` and all three `.shot-*` rules sit at **top level** in
`landing.css`. The only media queries near them govern `.hero h1`, `.hero-tag` and `.hero-cta-row`.
**Nothing hides, restacks or resizes the fan at any breakpoint.**

**So: ✅ all three remain visible at every width.** They stay absolutely positioned, rotated and
overlapping — the fan just gets smaller, because every width is a **percentage** of the column.

### On a 375px phone — computed, not measured

`.hero-grid` becomes one column below 940px, so the fan gets the full content width:

```
content = 375 − (2 × 20) = 335px
```

| Slot | Width | Height |
|---|---|---|
| `.shot-kds` | 58% ≈ **194px** | ≈ 146px |
| `.shot-dash` | 72% ≈ **241px** | ≈ 166px |
| `.shot-phone` | 26% ≈ **87px** | ≈ 164px |

Container: `min-height: clamp(300px, 42vw, 430px)` → **42vw = 157px, so the 300px floor binds.**

### ⚠️ Two things worth knowing before you shoot

1. 🔴 **The dashboard screenshot renders ~241 CSS px wide on a phone.** An orders dashboard with
   readable text and a visible capacity strip **will not be legible at that size.** **It will read as
   texture, not as a screenshot.** ⚠️ **If the hero is meant to sell on a phone, that is a design
   question the CSS does not currently answer** — and it is the one I would raise before Thursday.
2. **At 300px container height, the three boxes overlap heavily** — `.shot-phone` spans roughly
   132–300px vertically while `.shot-kds` spans 24–170px. **Compose so the important content is not in
   the corners the neighbouring shots cover.** ⚠️ **I have not rendered this; the overlap is computed
   from the position rules.**

---

## 6 · Everything else in the hero that is placeholder or unbuilt

### 🔴 The demo — BUILT, but NOT PUBLICLY REACHABLE

**Built, and properly:**

- `DemoCta` (`components/landing/DemoUpload.tsx:103`) opens `DemoModal`, which is mounted at
  `page.tsx:491`.
- `DemoModal` is a real implementation: file upload, `/api/demo` (which exists, `maxDuration = 300`),
  staged progress, an `AbortController`, a supersede guard, a sample-menu fallback, and email capture
  on failure.
- The CTA appears on the landing page, `/landing/cost`, `LandingNav` and `LandingFooter`.

🔴 **BUT EVERY ONE OF THOSE SURFACES IS BEHIND THE ADMIN GATE.** `app/landing/layout.tsx`:

```ts
if (process.env.NODE_ENV === 'production' && !(await verifyAdmin())) {
  redirect('/contact')
}
```

> **So in production today, a member of the public cannot reach the demo at all.** They are redirected
> to `/contact`. **The hero's whole hook is built and switched off.**

**The gate's own comment names the two conditions for removing it:**
1. **Written permission for the Pizzeria Gusto testimonial** — 🔴 **not a code fix, and not unblocked by
   your screenshots.**
2. **Real screenshots** — **what you are about to produce.**

⚠️ **Screenshots clear ONE of the two. If Thursday's launch means the public landing page, the
testimonial permission is on the critical path and nothing in the repository can resolve it.**
**`robots: { index: false, follow: false }` (`page.tsx:48`) must be flipped in the same commit** — the
gate comment says so explicitly.

### ⚠️ The "under 60 seconds" claim vs the demo's own timings

**The hero (`page.tsx:132`) says:** *"Upload a photo of your menu. See it working in under 60 seconds."*
**Lower down (`page.tsx:474`):** *"in under 60 seconds"*.

**But `DemoUpload.tsx` carries:**

```ts
const [slowPrompt, setSlowPrompt] = useState(false)   // 60s non-blocking reassurance (message, not cancel)
const [sampleOffer, setSampleOffer] = useState(false) // 90s: add the sample-menu escape hatch to that prompt
```

🔴 **The code expects the 60-second mark to be reached often enough to need reassurance copy, and 90
seconds often enough to need an escape hatch.** ⚠️ **I have not timed a real run** — but a claim of
"under 60 seconds" sitting above a 60-second "still working" message is a tension worth resolving before
you put the page in front of anyone.

⚠️ **You mention the manual describes it as "30 seconds". The page says 60.** **The page is the newer
of the two; the manual's figure appears stale.** I did not change either.

### The rest of the hero — all real

| Element | Status |
|---|---|
| `<h1>`, `.hero-tag` | ✅ Real copy |
| `.trust-strip` — "First month 100% free", "No card needed", "Cancel anytime" | ✅ Real claims, no placeholder markers |
| `.hero-cta-row` / `DemoCta` | ✅ Real, wired to the built modal |

✅ **The `.proof` list styling exists in CSS but is not used in the hero markup** — no placeholder there.

### The other known placeholder on the page (not the hero)

**The Pizzeria Gusto testimonial at `page.tsx:222`** with its logo at `:225`. **Real words from a real
operator, permission outstanding** — one of your three protected strings, untouched.

---

## 7 · Scope

✅ **Nothing was changed.** The three protected strings, the feature gate (`lib/features.ts`), and
everything else are untouched. **This task was a report.**

---

## What I could not establish

1. 🔴 **Every pixel figure is COMPUTED FROM CSS TOKENS, not measured.** **Open the page at 1440px and
   at 375px and check the three boxes against the table in §3 before you shoot.**
2. **Whether `next/image` behaves correctly** inside an absolutely-positioned, rotated,
   `aspect-ratio`-sized box. **Not tested.**
3. **Whether the demo completes in under 60 seconds** in production. **Not timed.**
4. **What "Customer ordering" should show** — the hint does not say which step.
5. **Whether the testimonial permission has since been granted.** **Not a repository fact.**
