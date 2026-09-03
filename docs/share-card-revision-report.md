# The HatchGrab share card — revision 2, filling the card

**GARBLED SPANS: none. No instruction contradicted another** — I checked the specified numbers against
the 340px gate arithmetically *before* rendering, and they are self-consistent with ~24px of headroom.

**ONE file changed: `public/logos/hatchgrab-share-card.png`, overwritten in place.**

🟢 **No code was touched.** `app/layout.tsx` needed nothing: the card's dimensions did not change, so the
declared `width: 1200, height: 630` still describes the file. ⚠️ Note for the record — that file now
shows clean in `git status` not because it was reverted but because **you committed it in `4ebba67`
("whatsapp logo fix")**; `shareImage` is present in HEAD.

---

## 🔴 THE PASS CONDITION — MEASURED TWICE, BY TWO INDEPENDENT METHODS

| Method | Group extent | % of 630 | ≥ 340? |
|---|---|---|---|
| **Range over each text node** (the method the brief specified) | **363.89 px** | **57.76%** | ✅ **PASS** |
| **Pixel scan of the written PNG** — bottom-most non-white row, border excluded | **360 px** | **57.14%** | ✅ **PASS** |
| *Baseline (previous card)* | *243 px* | *38.6%* | *fail* |

**Both clear the gate by ~20px. The extent grew by 117–121px, a 48–50% increase.**

⚠️ **Why two numbers, and which is stricter.** `Range.getBoundingClientRect()` over a text node returns
the **text content area** — 56px for a 48px face — which is tighter than the 62.4px line box but still
looser than the glyph outline. So I scanned the actual PNG pixels as well, which is the only measurement
that cannot be argued with. **The pixel scan is the stricter of the two and it also passes.** I am
reporting the specified method's number as the headline and the pixel number as the check on it.

---

## Read back from the written file

```
path   : public/logos/hatchgrab-share-card.png
pixels : 1200 x 630
bytes  : 27,924  (27.27 KB)
under 200 KB : YES  — 13.6% of budget
exactly 1200 x 630 : True
format : PNG, bit depth 8, colour type 2 (RGB, no alpha)
```

🟢 **Exactly 1200 × 630, so the STOP condition did not fire** and `app/layout.tsx` needed no edit.
**Before: 21,463 B. After: 27,924 B** — +6,461 B for the larger mark and the second line.

---

## Geometry

### The wordmark

| | Measured |
|---|---|
| Width | **880.00 px** — inside the 840–920 bounds |
| **Derived height** | **193.50 px** |
| **Aspect** | **4.547804 : 1** |
| **SVG's own viewBox ratio** | `viewBox="21 39 1287 283"` → **1287 ÷ 283 = 4.547703 : 1** |
| **Difference** | **0.000101** — sub-pixel; the ratio comes from the SVG, never typed |
| Top edge | **115.00 px** — exactly as specified |
| Bottom edge | **308.50 px** |
| Horizontal centre | **600.00** on a 1200 card |
| Ink centre, from pixels | cols **164 → 1036**, centre **600.0** |

**Height was never typed.** The `<img>` carries `width: 880px; height: auto`, so the browser derives the
height from the viewBox — §38's rule (*"the wordmark's crop ratio must be DERIVED, not typed"*).

⚠️ **Element top 115, visible ink top 119.** The SVG carries ~4px of transparent margin inside its
viewBox. The *element* edge is at 115 as specified; the *ink* begins at 119. Both reported so neither
number surprises anyone later.

### The tagline — per line, measured as INK

| | Line 1 — "Less time booking." | Line 2 — "More time cooking." |
|---|---|---|
| Ink width | **402.06 px** | **409.16 px** |
| Ink left → right | **398.97 → 801.03** | **395.42 → 804.58** |
| Ink top → bottom | **360.50 → 416.50** | **422.89 → 478.89** |
| **Ink centre X** | **600.00** | **600.00** |

Both lines centre on **600.00** — dead centre, and confirmed independently by the pixel scan
(tagline ink cols **399 → 801**, centre **600.0**).

Face: **Helvetica Neue, 48px, weight 400, line-height 1.3**, colour **`rgb(22, 49, 79)` = `#16314F`**.
Full stops present on both lines, exactly as written.

### The gaps

| | Measured | Target |
|---|---|---|
| **Wordmark bottom edge → line 1 ink top** | **52.00 px** | ~52 ✅ |
| Line 1 ink top → line 2 ink top (advance) | **62.39 px** | 48 × 1.3 = 62.4 ✅ |
| **Group: wordmark top → line 2 ink bottom** | **115.00 → 478.89 = 363.89 px** | ≥ 340 ✅ |

The 52px gap and the 115px top edge were solved by **measure-and-correct**: render, measure the ink,
apply the delta, re-render. **Converged after 2 corrections** to within 0.02px of both targets. Setting
a CSS margin and hoping would have missed, because the ink top is not the box top.

### Per-element safe-area check — 1080 × 570, i.e. x ∈ [60, 1140], y ∈ [30, 600]

```
wordmark  left 160.00  right 1040.00  top 115.00  bottom 308.50   inSafe: true
line 1    left 398.97  right  801.03  top 360.50  bottom 416.50   inSafe: true
line 2    left 395.42  right  804.58  top 422.89  bottom 478.89   inSafe: true
```

**Tightest margins: 100px horizontal (the wordmark) and 85px vertical (below line 2).** Cross-checked
against real pixels: all ink falls in rows 119–478 and columns 164–1036, inside the safe box on every
edge. **The border is the only thing at the card edge**, excepted by instruction; row 0 was verified to
be solid `#16314F` across its full width.

---

## 🔴 I OPENED THE PNG AND LOOKED AT IT

**It no longer reads as an empty card. The problem is fixed.**

The wordmark now carries the composition — HATCH in navy, Grab in orange under its swoosh arrow — at a
size where it is the subject rather than a small mark floating in a field. It spans 73% of the card's
width and its ink occupies 30% of the height, against a fifth before. The two stacked sentences sit
beneath it as a clear second voice: same navy, obviously lighter and smaller, and the two-line stack
gives the lower half something to hold that one line did not. The hairline border reads as a crisp
boundary. **Against a white chat background this will look like a designed card, not a logo on a blank
page.**

### ⚠️ One thing I can see that the numbers do not fail on

**The group sits high. There is 119px of white above the ink and 151px below it — 32px more at the
bottom.** It is not a defect against anything you specified, and at a glance it reads as deliberate
rather than wrong, but with the mark this much larger the imbalance is now visible in a way it was not
when the group was small and floating.

**If you want it optically centred, the ink top wants to be at 135 rather than 119 — element top ≈131
instead of 115.** That is one number in one render, and I have **not** done it: you specified
"approximately 115px", and 131 is not approximately 115. **Reported for your call, not acted on.**

Two smaller observations, neither actionable unless you want them:
- The wordmark's arrow tip reaches column 1036, closer to the right safe edge (104px clear) than the
  HATCH stem is to the left (104px clear) — symmetric, because the SVG's own bounding box is what
  centres. Fine.
- Line 2 is 7px wider than line 1, so the stack is very slightly wedge-shaped. Invisible at a glance,
  and inherent to centring two different strings.

---

## What I verified, and what I did not

### Verified by execution

| | |
|---|---|
| Dimensions and byte size | ✅ **read back from the written file's PNG header**, not restated |
| Wordmark width, derived height, aspect vs viewBox | ✅ measured in the laid-out document |
| Per-line tagline ink extents and centres | ✅ **Range over each text node**, as specified |
| Gap and group extent | ✅ measured, and **cross-checked by scanning the PNG's pixels** |
| Safe area, per element | ✅ numerically, and against real ink rows/columns |
| Border is navy and flush | ✅ row 0 confirmed solid `#16314F` |
| **The card looks right** | ✅ **I opened it and looked** — see above |
| No code touched | ✅ `git status` shows only the PNG |

### 🔴 NOT verified — stated plainly

- ⚠️ **Nothing was deployed.** The live card is unchanged until you deploy.
- 🔴 **I did not test in WhatsApp.** How it renders in a real chat bubble, and whether WhatsApp still
  holds a cached preview of the earlier image, are both unobserved. This is the same gap as last time
  and it is the only thing that would actually confirm the original symptom is gone.
- ⚠️ **No typecheck or build was run, and none is being offered as verification** — there was no code
  change to check.
- ⚠️ **The font is baked into the raster.** Re-rendering on another machine may pick a different face;
  the HTML that produced this lives only in my scratch directory, not in the repo.

---

## Open

1. 🔴 **Deploy, then re-fetch production and re-check `og:image`.**
2. ⚠️ **The 32px vertical imbalance** — one number, awaiting your decision.
3. ⚠️ Carried from the diagnosis and untouched: the absent canonical, `og:url` pointing at the apex, and
   the consumer brand's still-wrong declared dimensions over its 3.68 MB file.

**Nothing committed. Nothing deployed. No code changed.**
