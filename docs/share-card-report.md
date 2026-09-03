# The HatchGrab share card — composed, and the metadata corrected

**GARBLED SPANS: none. No instruction contradicted another** — including the redirect instruction, which
was satisfiable without touching `baseUrl`. See Task 2.

**Two things changed, and nothing else:**

| | |
|---|---|
| **NEW** | `public/logos/hatchgrab-share-card.png` |
| **MODIFIED** | `app/layout.tsx` — 31 insertions, 4 deletions |

**Nothing deployed. No canonical link added** — out of scope by instruction, and still absent (0
occurrences of `canonical` in the file).

---

## The wordmark variant — read before rendering, no STOP condition

Both SVGs are the same 8,163 bytes with the same `viewBox="21 39 1287 283"`, and they differ only in one
fill:

| File | Fills | For |
|---|---|---|
| 🟢 **`public/logos/hatchgrab-wordmark.svg`** | **`#16314F`** + `#EF8B2C` | **light backgrounds — USED** |
| `public/logos/hatchgrab-wordmark-white.svg` | `#FFFFFF` + `#EF8B2C` | dark backgrounds — not used |

**The light variant is navy**, exactly `#16314F`, so the STOP condition did not fire and nothing was
recoloured. Rendered from the vector at target size rather than upscaled from a raster — §38's own
web-clip lesson (*"rendering the vector at each target size rather than downscaling a raster"*).

---

## Task 1 — the card

Composed as HTML at 1200×630 and rasterised by headless Chrome at `deviceScaleFactor: 1`, with the
wordmark placed as an `<img>` so the SVG's own viewBox governs its aspect ratio — **the ratio is
preserved by construction, not by a typed pair of numbers.** That is the manual's rule at §38:
*"the wordmark's crop ratio must be DERIVED, not typed."*

### 🔴 MEASURED FROM THE WRITTEN FILE — read back from `public/`, not restated from the request

```
path   : public/logos/hatchgrab-share-card.png
pixels : 1200 x 630
bytes  : 21,463  (20.96 KB)
aspect : 1.9048 : 1
format : PNG, bit depth 8, colour type 2 (RGB, no alpha)
```

| Requirement | Measured | |
|---|---|---|
| Exactly 1200 × 630 | **1200 × 630** | ✅ |
| Under 200 KB | **20.96 KB** — 10.5% of budget | ✅ |
| No space in the filename | `hatchgrab-share-card.png` | ✅ |
| White background `#FFFFFF` | `#FFFFFF` | ✅ |
| 2px navy hairline flush to the edge | `border: 2px solid #16314F`, `box-sizing: border-box` → occupies the outermost 2px, fully inside the canvas | ✅ |

### Geometry, measured in the laid-out document

| | Measured |
|---|---|
| Wordmark size | **600.00 × 131.92 px** |
| Wordmark aspect | **4.5481 : 1** (the SVG's own 1287÷283 = 4.5477 — preserved) |
| Wordmark ≤ 660px wide | **600px** ✅ |
| Horizontally centred | centre x = **600.00** on a 1200 card ✅ |
| **Above the vertical centre** | top **182**, bottom **313.92** — **bottom edge sits 1.08px above the 315 midline** ✅ |
| Tagline ink | **709.05 × 49 px**, centre x = **599.99** ✅ |
| Tagline colour | `rgb(22, 49, 79)` = **`#16314F`** ✅ |
| Tagline face | **Helvetica Neue 42px / weight 400** — a clean grotesque sans |
| Gap, wordmark bottom → tagline ink top | **62px** |
| Group extent | 182 → 424.92, **centre y 303.46** — 11.5px above the geometric centre, which is optical centring rather than an error |

⚠️ **Tagline measured as INK, not as its box.** A block element's `getBoundingClientRect` spans the full
line box and would have reported a width of 1196px and a centre that is centred by definition — the
box-not-content trap §35 records. A `Range` over the text node gives the 709.05px the eye actually sees.

### 🟢 Safe area — 1080 × 570, checked per element

Both elements were tested against `x ∈ [60, 1140]`, `y ∈ [30, 600]`:

```
wordmark  left 300.00  right 900.00  top 182.00  bottom 313.92   inSafe: true
tagline   left 245.47  right 954.52  top 375.92  bottom 424.92   inSafe: true
```

**Tightest margins: 175.92px horizontal (tagline) and 152px vertical (wordmark top).** A square crop
would clip only whitespace and the border. I rendered a second copy with the safe-area outlined and
looked at it — nothing crosses the line.

⚠️ **The border is the one thing a crop would clip**, unavoidably, because "flush to the card edge" puts
it outside any inset safe area. That is inherent to the instruction, not a defect.

### ⚠️ One judgement call, flagged rather than assumed

The tagline was given as **`less time booking, more time cooking`** and specified as **"Sentence case"**.
Those two are in mild tension: the string is lowercase, the instruction says sentence case. **I applied
sentence case — `Less time booking, more time cooking`** — reading it as the explicit typographic
direction, and kept everything else exact: no terminal full stop, navy, secondary weight and size.

🔴 **If you meant the words set all-lowercase as typed, this is a one-character re-render.** I did not
treat it as a contradiction worth stopping over, but it is the one thing here I could have read the
other way.

---

## Task 2 — `app/layout.tsx`

### The existing branch, used — no second branch created

```ts
const shareImage = isHG
  ? { url: `https://${host}/logos/hatchgrab-share-card.png`, width: 1200, height: 630 }
  : { url: '/logos/village-foodie logo-sharing.png',          width: 1200, height: 630 }
```

`openGraph.images[0]` now reads `shareImage.url / .width / .height`, and `twitter.images[0]` reads
`shareImage.url`. **One value, two consumers** — they used to be two independent string literals saying
the same thing, which is precisely how one could have been corrected without the other.

### 🟢 The redirect requirement — satisfied WITHOUT touching `baseUrl`, so no contradiction

The instruction warned this might be impossible without changing the branched `baseUrl`. **It is
possible.** A *relative* url resolves against `metadataBase`, which is the apex — and the apex 307s. An
**absolute** url bypasses `metadataBase` entirely, so `baseUrl`, `metadataBase` and `og:url` are all
untouched and still read the apex, exactly as before.

Built from **`host`** — the header already read at line 23 for the branch itself — so the image URL *is*
the host that served the response and **cannot redirect by construction**, on production or on a preview
deployment. Verified against production before the change: `https://www.hatchgrab.com/logos/...` returns
**`HTTP/2 200`** directly, while the apex returns `307` to it.

### Dimensions are measured, not intended

`width: 1200, height: 630` now describe the file that was actually written — read back from its PNG
header. **The pair they replaced said 1200×630 over a 2397×1270 file**, which is the defect the
diagnosis named: the tags did not describe the resource they pointed at.

### 🟢 The Village Foodie branch is byte-identical

| | |
|---|---|
| Production served, before | `https://villagefoodie.co.uk/logos/village-foodie%20logo-sharing.png` |
| Locally rendered, after | `https://villagefoodie.co.uk/logos/village-foodie%20logo-sharing.png` |

**Same string.** Still relative in source, still resolving through `metadataBase`, `1200 × 630` and its
alt unchanged. ⚠️ **Those declared dimensions remain wrong for that file** (it is 2397×1270) — but
correcting the consumer brand's image was explicitly not in scope, and I did not.

### Out of scope, untouched — confirmed by diff

- `app/layout.tsx:144` (`const brand = host?.includes('hatchgrab')`) — **0 occurrences in the diff**.
- The inline host-check duplication at line 23 — left as it is.
- No canonical link added.
- `lib/brand.ts`, `BRANDS.HATCHGRAB.logo` — untouched. The diagnosis established it has zero consumers
  and is not the cause; fixing it would have changed nothing here.

---

## 🔴 What I verified, and what I did not

**Neither a typecheck nor a successful render is verification, and I am not offering either as such.**

### Verified by execution

| | Result |
|---|---|
| The card renders and is written | ✅ 1200×630, 21,463 B, read back from the file in `public/` |
| Geometry against every stated constraint | ✅ measured in the laid-out document (table above) |
| The card looks correct | ✅ **I opened the PNG and looked at it** — white ground, navy hairline at the edge, navy/orange wordmark high and centred, navy tagline beneath, generous whitespace |
| Safe area | ✅ per-element, plus a guide overlay I looked at |
| **The hatchgrab host serves the new card in `og:image` and `twitter:image`** | ✅ **from the rendered HTML response**, not the source |
| **The consumer host still serves its own image, unchanged** | ✅ same, and byte-compared to production's previous value |
| **The asset is actually served, with no redirect** | ✅ `HTTP 200`, `image/png`, **`num_redirects=0`**, and **sha256-identical** to the file on disk |
| Out-of-scope lines untouched | ✅ by diff |

### 🔴 NOT verified — stated plainly

- ⚠️ **Nothing was deployed**, per the brief. **Every check above ran against the local dev server.** The
  production response still carries the old Village Foodie image until you deploy.
- 🔴 **I did not test in WhatsApp.** The rendering client is WhatsApp and I have no way to drive it. **The
  card's appearance in a real chat bubble is unobserved**, and so is how WhatsApp treats the new
  `og:image` — including whether its cache still holds the old one.
- ⚠️ **The `https://` scheme is hardcoded** alongthe request host. Correct on production and on Vercel
  previews, which are TLS-only; on the local dev server it produces an `https://` URL for an `http://`
  origin. **Harmless — it is a metadata string, not a fetch — but it is a real mismatch in dev and I am
  naming it rather than letting you find it.**
- ⚠️ **No typecheck or build is being reported as verification.** I did not run one.
- ⚠️ **The font is baked into the raster**, so there is no runtime font dependency — but I did not verify
  Helvetica Neue is what a different machine would pick if the card were ever re-rendered. **Re-rendering
  on another machine may produce a different face.** The rendered artefact is the deliverable; the HTML
  used to produce it lives only in my scratch directory.

---

## What is still open after this change

1. 🔴 **Deploy, then re-fetch production and re-check the tags.** Until then the live card is unchanged.
2. ⚠️ **WhatsApp may serve a cached preview** for an already-shared link. Worth confirming with a
   fresh link after deploy.
3. ⚠️ **The consumer brand's declared dimensions are still wrong** — `1200 × 630` over a 2397×1270,
   3.68 MB file. Out of scope here; the same one-line class of fix.
4. ⚠️ **The canonical link is still absent on all three hosts** — deliberately untouched.
5. ⚠️ **`og:url` still reads the apex** while the page is served from `www`. Untouched, by instruction.

**Nothing committed. Nothing deployed.**
