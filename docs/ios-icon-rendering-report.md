# The iOS app icon — what the file holds, and what iOS renders from it

**READ-ONLY. No assets changed, no files written except this report, nothing deployed.**

---

## VERIFICATION

**EXECUTION.** Every pixel claim comes from decoding the PNGs with the decoder written for this work
(zlib inflate + per-scanline unfiltering). **This time the boundary was sampled ALL THE WAY AROUND the
shape — 2,619 transition runs across every row and every column — not one scanline.** You were right that
the single cut at y=512 settled nothing.

🔴 **I CANNOT SEE THE DEVICE.** Everything about what iOS *renders* is either (a) a downscale I simulated
here, or (b) documented vendor behaviour I have not tested. **Each is labelled.** Nothing in §1 was
observed on hardware.

**No span of the prompt arrived garbled.**

---

## 🔴 TWO CORRECTIONS TO MY PREVIOUS REPORT, FIRST

1. **I said the anti-aliased edge would not matter at icon size. IT DOES.** Simulated downscale to 60px:
   **128 rim pixels, 3.6% of the icon**, in pale washed oranges — `#F7C392`, `#F7C595`, `#FDF4EB`.
   **A visibly lighter line around the bolt. That is what he is seeing.**
2. **I said there is no vector master in the repository. THERE IS.**
   🔴 **`public/icons/hatchgrab-icon.svg`** — a true 1024×1024 vector: one `<path>` filled `#EF8B2C` on a
   `<rect>` filled **`#0F172A`**. **I looked for `.svg` under `public/` and read the top-level hits; I
   never looked in `public/icons/`.**

---

## 1 · Appearance variants, and what iOS does with none supplied

**`Contents.json` — READ in full above:** one `images` entry (`universal`, `ios`, `1024x1024`), and
**no `appearances` key anywhere.**

**iOS 18+ renders three appearances: light, dark and tinted.** With a single unqualified image:

| Appearance | What is supplied | What iOS does |
|---|---|---|
| **Light** | This file | Uses it |
| **Dark** | 🔴 **Nothing** | Falls back to the light image — **your white background stays white on a dark home screen** |
| **Tinted** | 🔴 **Nothing** | **Derives one** from the light image |

⚠️ **DOCUMENTED VENDOR BEHAVIOUR, NOT MEASURED.** I have no device and cannot run Xcode's preview.

### What the brand orange becomes under the tinted derivation

**The tinted variant is built from LUMINANCE, then recoloured with the user's tint. Measured (Rec.709):**

```
brand orange #EF8B2C   luminance 153.4
white ground #FFFFFF   luminance 255.0
```

> 🔴 **The bolt becomes roughly 60% grey on a 100% white ground — a 102/255 separation, and the orange is
> gone entirely.** A tinted home screen cannot show your brand colour, because nothing in the icon set
> tells it what the brand colour is.

⚠️ **This is a real gap and it may be what he is looking at — but it would change the WHOLE bolt, not
draw a line around it.** It does not on its own explain "a differently-coloured line around the outside".

---

## 2 · Between 1024px and the home screen — and 🔴 the edge DOES survive

**iOS applies a superellipse ("squircle") mask and downscales the 1024px source to the display size
(~60pt on an iPhone home screen).** ✅ **The mask cannot clip the bolt: measured bounding box x 354-670,
y 98-926, so the shape has 354px of side padding and 98px top and bottom, and touches no edge.**

### Simulated downscale, 1024 → 60, box filter

**A scanline across the result:**

```
x=0   #FFFFFF   white
x=21  #FEFBF8   ← blend
x=23  #EF8B2C   the bolt
x=36  #F2A55D   ← BLEND, and clearly a pale orange
x=38  #FFFFFF   white
```

**Across the whole 60px icon: 128 non-pure pixels (3.6%)** — `#F7C392`, `#F7C595`, `#FDF4EB`.

> ## 🔴 YES. A 1-2px ANTI-ALIASED EDGE AT 1024px SURVIVES AS A 1-2px RIM AT 60px, AND IT READS AS A PALE,
> DESATURATED ORANGE — LIGHTER THAN THE BOLT AND WARMER THAN THE WHITE.
>
> **That is a "differently-coloured line around the outside of the bolt", and it is arithmetically
> inevitable: downscaling averages, and averaging orange with white produces exactly this.**

⚠️ **I used a box filter. iOS's downscaler is not necessarily a box filter** — a Lanczos-style kernel can
overshoot and make the rim *more* pronounced, not less. **The direction of the effect is certain; the
exact colour is not.**

---

## 3 · 🔴 IS ANYTHING OTHER THAN ANTI-ALIASING AT THE BOUNDARY? — Measured all the way around: NO

### Transition-band widths, every row and every column

```
width 1 px : 1401 runs (53.5%)      width 4 px :  34 (1.3%)
width 2 px :  669 runs (25.5%)      width 5 px : 136 (5.2%)
width 3 px :  374 runs (14.3%)      6/7/8 px   :   3 runs
width 154 px: 2 runs (0.1%)
```

⚠️ **The 3-5px runs and the two 154px runs are NOT a thick band.** They are **shallow-angle edges**: where
the bolt's outline runs nearly parallel to the scan direction, a single-pixel-wide edge crossed by that
scan produces a long run. **The bolt's points and its two internal angles are exactly where this occurs**
— which is why a single horizontal cut at y=512 could never have found them, and why you were right to
ask.

### The decisive test — is every edge pixel a blend of white and the brand orange?

**For all 2,503 non-pure pixels I projected the colour onto the white→orange line in RGB and measured the
perpendicular distance off it.** A stroke, a gradient to another hue, a shadow or a matte would sit **off**
that line.

```
off-line error ≤ 2 : 2,503  (100.0%)
off-line error > 2 :     0  (  0.0%)
worst case: 0.7 (rounding)      t ranges 0.004 → 0.996 (a full, smooth ramp)
```

| Candidate | Verdict |
|---|---|
| **A stroke or outline** | ❌ **Ruled out.** A stroke is a *consistent* colour at a *consistent* width; these are 121 values on a continuous ramp |
| **A ring wider than 2px** | ❌ **Ruled out.** 79% of runs are 1-2px; the rest are shallow-angle geometry |
| **A gradient** | ❌ **Ruled out.** A gradient would leave the white→orange line |
| **A drop shadow** | ❌ **Ruled out.** A shadow is *darker* than both; every pixel here lies between them |

> ✅ **Nothing but anti-aliasing is in the file. Confirmed around the entire perimeter, points and internal
> angles included.**

---

## 4 · Against the surfaces where he says it looks right

| Surface | Asset | Bolt sits on | Structurally different how |
|---|---|---|---|
| 🔴 **iOS app icon** | `AppIcon-512@2x.png` 1024², RGB | **white, flattened into the file** | **The blend is baked in at 1024 and then downscaled** |
| **Android launcher** | `ic_launcher_foreground.png` 432², RGBA, **97% transparent** | **alpha** — composited by the system over `ic_launcher_background` (**`#FFFFFF`**) | 🔴 **The asset contains NO white-blend rim at all.** Only 8 distinct saturated values, against the iOS icon's 121 |
| **Wordmark** (app header, landing) | `public/logos/hatchgrab-wordmark.svg` | **vector** | 🔴 **No raster edge exists at any size** — it is re-rasterised crisply at whatever size it is drawn |
| **Vector master** | `public/icons/hatchgrab-icon.svg` | 🔴 **`#0F172A` dark slate** | **The canonical design is NOT on white** |
| PWA maskable | `icon-512-maskable.png` | **`#0F172A`** (97%) | Matches the master |
| PWA / apple-touch | `icon-512.png`, `apple-touch-icon.png` | white | Same white-flatten as iOS, at smaller sizes |

**Other structural facts, measured:** the bolt does **not** touch the canvas edge on iOS (354px side
padding); the iOS file is **colour type 2, no alpha channel**; and 🔴 **it carries NO colour-management
chunk at all** — no `iCCP`, no `sRGB`, no `gAMA`, no `cHRM` (chunks present: `IHDR`, `pHYs`, `IDAT`,
`IEND`).

> ⚠️ **The untagged colour is worth knowing but does not explain a rim** — an untagged image rendered on a
> Display P3 screen shifts the *whole* orange, not its outline.

> 🔴 **THE SHORT ANSWER TO "why not anywhere else": the wordmark is vector, the Android foreground blends
> to alpha, and the vector master is on dark slate. The iOS icon is the only place a raster orange edge is
> permanently flattened against white and then shrunk by 17×.**

---

## 5 · A matte or halo from a flattened transparent original

**How I would detect it:** a matte leaves edge pixels blended toward a colour that is *not* the final
background — a black matte gives a dark fringe, a coloured matte a coloured one. **Either lands OFF the
white→orange line in RGB.**

> ✅ **NOT PRESENT. 100% of edge pixels lie on that line (max deviation 0.7).**

⚠️ **And note the mathematics:** flattening a transparent original *onto white* is **identical** to
anti-aliasing against white. **So even if the source was flattened, it is not a defect and is undetectable
as one — because there is nothing wrong with the result.** **The rim is not a matte artefact; it is the
correct rendering of a soft edge on white.**

---

## 6 · What to supply

### A · The dark and tinted variants — the gap that certainly exists

**Three files at 1024×1024 in `AppIcon.appiconset`, and a `Contents.json` that declares them:**

```json
{ "images" : [
    { "filename":"AppIcon-light.png","idiom":"universal","platform":"ios","size":"1024x1024" },
    { "filename":"AppIcon-dark.png","idiom":"universal","platform":"ios","size":"1024x1024",
      "appearances":[{"appearance":"luminosity","value":"dark"}] },
    { "filename":"AppIcon-tinted.png","idiom":"universal","platform":"ios","size":"1024x1024",
      "appearances":[{"appearance":"luminosity","value":"tinted"}] }
  ], "info":{"author":"xcode","version":1} }
```

- **Dark:** the bolt on **`#0F172A`** — which is what the vector master already is.
- **Tinted:** Apple expects a **grayscale** image; supply the bolt as a light grey on transparent/black so
  the system's tint lands on the shape rather than deriving 60% grey on white.

### B · A cleaner source — and it is available, contrary to my last report

🔴 **`public/icons/hatchgrab-icon.svg` is a genuine vector master.** Rendering the AppIcon from it at
1024 does **not** remove the rim (any raster of a soft edge on white will have one), **but it is the right
source** and it lets you choose the background rather than inherit white.

**The change that would actually reduce the rim:** 🔴 **stop putting the bolt on white.** On the master's
`#0F172A`, the blend runs orange→dark slate, which is far less conspicuous than orange→white — and it
matches `icon-512-maskable.png`, the wordmark's usual context and the brand.

⚠️ **That is a design decision, not a bug fix, and I am not making it.**

---

## What I could not establish — and it is the important part

1. 🔴 **What his phone is actually showing.** **No device.** I cannot tell whether he is seeing (a) the
   downscale rim measured in §2, (b) a derived tinted icon (§1), or (c) something else entirely.
2. 🔴 **Which iOS version and home-screen appearance mode.** **This single question separates §1 from §2**,
   and either a screenshot or "is your home screen on tinted or dark?" settles it in one exchange.
3. **iOS's actual downscaling kernel.** My box filter proves a rim appears; it does not predict its exact
   colour.
4. **Whether the untagged colour profile shifts the orange** on a P3 display. Measurable only on device.
