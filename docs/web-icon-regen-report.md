# Regenerating the three web-clip icons from the vector master

**Built. NOT deployed, NOT committed. No SQL, no migrations.**
**Changed: `public/apple-touch-icon.png`, `public/icons/icon-192.png`, `public/icons/icon-512.png`,
`app/layout.tsx`, `public/manifest.json`.**

---

## VERIFICATION

**EXECUTION.** The three written files were **decoded from disk** — not the temporaries they were made
from — and put through the same darker-than-fill test that found the ring. **All three: zero.**
The edge profile is shown old-vs-new so the undershoot's absence is visible, and I opened the 512 to
confirm the artwork is unchanged.

**`npx tsc --noEmit` clean and `manifest.json` parses — SANITY ONLY, not verification.**

**No span of the prompt arrived garbled.**

---

## 1 · The tool and the exact command

**No SVG rasteriser was installed** — checked `rsvg-convert`, `inkscape`, `convert`, `magick`,
`cairosvg` (CLI and Python): **none present**. **`puppeteer` is**, so headless Chromium's own vector
rasteriser did the work.

🔴 **The vector is rendered AT each target size. No large raster is produced and downscaled at any
point** — which is the whole reason the ring existed.

**The generator, run once and then deleted:**

```js
const D='M0.3014 0 L0 0.5625 H0.185 L0.0814 1 L0.3828 0.40625 H0.1978 Z';  // verbatim from the master
const FILL='#EF8B2C';
const HF=829/1024, X0=354/1024, Y0=98/1024;   // geometry — see §2
for (const [N,out] of [[180,'apple-touch-icon'],[192,'icon-192'],[512,'icon-512']]) {
  const s=HF*N, tx=X0*N, ty=Y0*N;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" width="${N}" height="${N}">`
    +`<rect width="${N}" height="${N}" fill="#FFFFFF"/>`
    +`<g transform="translate(${tx},${ty}) scale(${s})"><path d="${D}" fill="${FILL}"/></g></svg>`;
  await page.setViewport({width:N,height:N,deviceScaleFactor:1});   // 🔴 dSF 1 — no supersample, no resample
  await page.setContent(`<!doctype html><style>html,body{margin:0;background:#fff}svg{display:block}</style>${svg}`);
  await page.screenshot({clip:{x:0,y:0,width:N,height:N}, omitBackground:false});
}
```

**Launched with `--force-color-profile=srgb`** so the output is not shifted by the host display's profile.

**Then re-encoded to PNG colour type 2 (RGB, no alpha)** with a small zlib encoder, because **all three
originals are colour type 2** and a screenshot is RGBA. ✅ **Verified: all three written files are colour
type 2.**

---

## 2 · The background, and matching the current appearance

> ✅ **WHITE, AS INSTRUCTED. The master's `<rect fill="#0F172A">` was NOT used** — it is replaced with a
> white rect of the same dimensions. **The dark-slate decision remains yours and is untouched;
> `hatchgrab-icon.svg` itself is unmodified.**

### Geometry — and why it came from the native icon, not the master

**The master's own transform does NOT match these files.** Measured fractions of canvas:

```
master transform      x 0.3660..0.6340   y 0.1500..0.8500
icon-512 (old)        x 0.3398..0.6602   y 0.0938..0.9062
AppIcon (native)      x 0.3457..0.6553   y 0.0957..0.9053
```

**The master is smaller on the canvas.** So to keep these three looking as they do, I took the geometry
from the **clean 1024 native icon** — same artwork, no ringing, the largest and most precise reference:

```
heightFrac 829/1024   x0 354/1024   y0 98/1024
bolt aspect 0.3824  vs the master path's 0.3828   → the same artwork, confirmed
```

### Does the result match?

| | Old bbox | New bbox | Δ |
|---|---|---|---|
| 180 | x 60..119, y 15..164 | x 62..117, y 18..162 | ~2px |
| 192 | x 64..127, y 16..175 | x 66..125, y 18..173 | ~2px |
| 512 | x 174..337, y 48..463 | x 177..335, y 49..462 | ~2-3px |

> ✅ **The new bolts are 2-3px tighter, and that is expected and correct: the OLD bounding boxes were
> INFLATED by the ringing's overshoot, which is non-white and therefore counted as part of the shape.**
> Removing the ring necessarily removes those pixels. **At 512 that is 0.6% — imperceptible.**

**I also opened the new 512 and looked at it: same bolt, same white ground, flat orange, no rim.**

---

## 3 · Verification of the written files

### The darker-than-fill test — the one that found the ring

| File | OLD | **NEW** |
|---|---|---|
| `public/apple-touch-icon.png` | 228 | ✅ **0** |
| `public/icons/icon-192.png` | 266 | ✅ **0** |
| `public/icons/icon-512.png` | 715 | ✅ **0** |

**Decoded from the files on disk.** Anti-aliased edge pixels remain, as they must — 243, 264 and 698
respectively — but **not one of them is darker or more saturated than `#EF8B2C`.**

### The edge profile, one boundary, old vs new

**`icon-512.png`, row 256, the bolt's right edge:**

```
OLD                                   NEW
x=313  #EF8D2F   +1.6                 x=313  #EF8B2C   fill
x=314  #EE841F   -6.2  ← UNDERSHOOT   x=314  #EF8B2C   fill
x=315  #F8CDA4  +57.8  ← OVERSHOOT    x=315  #EF8B2C   fill
x=316  #FFFFFF                        x=316  #FFFFFF
x=317  #FFFDFC  +100.0 ← RIPPLE       x=317  #FFFFFF
x=318  #FFFFFF                        x=318  #FFFFFF
```

> 🔴 **The undershoot, the overshoot and the ripple are all gone.** The new edge goes straight from fill
> to background. **That is the Gibbs ringing removed at source.**

---

## 4 · The cache-buster — every occurrence

**9 occurrences of `?v=2`, all bumped to `?v=3`:**

| File | Line | What |
|---|---|---|
| `app/layout.tsx` | 70 | ⚠️ **the explanatory comment**, which names the token |
| `app/layout.tsx` | 76 | `/favicon.ico?v=3` |
| `app/layout.tsx` | 77 | `/icons/icon-192.png?v=3` |
| `app/layout.tsx` | 78 | `/icons/icon-512.png?v=3` |
| `app/layout.tsx` | 80 | `apple: /apple-touch-icon.png?v=3` (HatchGrab branch) |
| `app/layout.tsx` | 84 | `apple: /apple-touch-icon.png?v=3` (Village Foodie branch) |
| `public/manifest.json` | 11, 17, 23 | the three manifest icon `src` values |

✅ **`grep '?v=2'` now returns nothing in either file.**

⚠️ **Two notes.** `favicon.ico` was bumped too, for a single uniform token across the icon set — **its
file is unchanged**, so this only costs one re-fetch. And **the comment at :70 was updated with the
value**; leaving it saying `?v=2` beside `?v=3` URLs would be exactly the stale-comment trap the manual
now records.

---

## 5 · What someone with the icon already on their home screen must do

**In plain English, for the operator:**

> **The new icon will not appear on its own.** A home-screen shortcut keeps the picture it was created
> with — it is not refreshed when the site is.
>
> **To get the new one: press and hold the HatchGrab icon, choose Delete Bookmark, then open
> hatchgrab.com in Safari and add it to your home screen again** (Share → Add to Home Screen).

**Why, for you:** the `?v=3` change makes fresh visitors and anyone re-adding the shortcut fetch the new
file. 🔴 **It does NOT reach an already-created web clip** — iOS copies the icon into the shortcut at
creation and never re-reads it. **Remove-and-re-add is the only reliable route.**

**Ordinary browser tabs** pick up the new favicon on the next load, or after clearing Safari's cache.
**Nobody on the native app is affected at all** — its icon was never wrong.

---

## 6 · Should the native AppIcon be regenerated too?

> **Optional, and I have not done it.**

| | |
|---|---|
| **What it would change** | **Almost nothing visible.** It is already clean — zero darker pixels, a monotonic AA ramp. Regenerating from the master would shift the bolt by ~2px (the master sits smaller on the canvas) and rewrite the AA marginally |
| **Does it need a release?** | 🔴 **Yes.** An app icon is compiled into the binary, so it ships only in a new build and review |
| **Worth it on its own?** | ❌ **No.** There is no defect to fix |
| **Worth bundling?** | ✅ **Yes — with the `UIBackgroundModes` change and the dark/tinted icon variants**, both of which already need a release. **Doing all three at once costs one submission instead of three** |

⚠️ **And if it is ever regenerated, the geometry question in §2 has to be settled first** — the master and
the shipped icon do not currently agree on how large the bolt sits on the canvas.

---

## 7 · Scope

| | |
|---|---|
| **Changed** | the three web icons, `app/layout.tsx`, `public/manifest.json` |
| **Native icon** `AppIcon-512@2x.png` | ✅ **UNTOUCHED** |
| **`Contents.json`** | ✅ **UNTOUCHED** |
| **Android assets** | ✅ **UNTOUCHED** (all 45 files) |
| `public/icons/hatchgrab-icon.svg` (the master) | ✅ **UNTOUCHED** |
| `public/icons/icon-512-maskable.png`, `public/favicon.ico` | ✅ **UNTOUCHED** |
| **Originals** | backed up in the session scratchpad before overwriting |

---

## What I could not establish

1. 🔴 **That it looks right on his phone.** **The only real test is: re-add the shortcut and look.**
   Everything here is measured from the files.
2. **Whether Chromium's rasteriser matches whatever produced the originals** in sub-pixel placement. **The
   2-3px bbox difference is explained by the ring's removal, but I have not overlaid the two images
   pixel-for-pixel.**
3. **Whether any other cached copy exists** — a CDN edge, an installed PWA on another device. `?v=3`
   handles fetches; it cannot reach an already-created shortcut.
4. **What tool made the 28 August files.** Still unknown; the ringing says it sharpened.
