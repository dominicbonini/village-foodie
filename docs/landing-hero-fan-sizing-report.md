# LANDING HERO FAN SIZING — TUNABLE CONSTANTS, AND VARIANT B APPLIED

**6 October 2026 · branch `main`, local only. Nothing pushed, nothing deployed, no production request,
no truck touched, and the menu-upload demo flow was not run.**

Builds on `docs/landing-hero-fan-report.md`. The fan's **shape** is unchanged — shared tilt, z-order,
corners, border, shadow, no background square, text column untouched — and only its **sizes** moved.

---

## 📁 FILES CHANGED

| | |
|---|---|
| `app/landing/landing.css` | the per-breakpoint `.shot-*` literals replaced by **one constants block** |
| `app/landing/page.tsx` | three `sizes` values, updated to variant B's rendered widths |

**Added:** `docs/landing-polish-shots/hero-fan-sizing/` — five screenshots.

---

## 🔴 1 · THE SIZING IS TUNABLE NOW

🔴 **This is the fourth arrangement of this hero in one day.** Polish → rebalance → fan → this. Four
passes of hand-editing six `min()` caps *twice over* (once for phone/tablet, once for ≥940px) is how a
composition ends up with a width that no longer matches its `sizes` attribute. **The duplication is
gone: there is now one set of `.shot-*` rules, driven by variables.**

Declared once on `.hg-landing .fan`:

| Constant | Value | What it is a percentage **of** |
|---|---|---|
| `--fan-dash-w` | **60%** | the group width **W** (the `.fan` box) |
| `--fan-kds-w` | **46%** | the group width W |
| `--fan-phone-h` | **.9** | a **fraction of the dashboard's rendered height** |
| `--fan-phone-w` | *derived* | `calc(var(--fan-dash-w) * 0.31834 * var(--fan-phone-h))` |
| `--fan-tilt` | **-3deg** | the one angle every screen shares |
| `--fan-kds-top` | **0%** | the kitchen's offset from the group's top |
| `--fan-dash-top` | **24%** | the dashboard's offset from the top |
| `--fan-kds-right` | **2%** | |
| `--fan-phone-right` | **24%** | |
| `--fan-phone-bottom` | **6%** | |

🔴 **`--fan-phone-w` is derived, not typed.** The brief specifies the phone by **height**; CSS lays these
out by **width**. The conversion is written out once:

```
phone width = dash width × (551/800) × (1284/2778) × phone-h-fraction
            = dash width × 0.68875 × 0.46220 × f
            = dash width × 0.31834 × f
```

551/800 is the dashboard's height-over-width and 1284/2778 the phone's width-over-height — **read off the
`aspect-ratio` declarations, not guessed**. ⚠️ **If either image is re-exported at a new shape, 0.31834
is the number to recompute, and nothing will fail if it is not** — the phone will simply stop being the
height it claims to be.

⚠️ **The same constants drive phone, tablet and laptop.** The base rules and the ≥940px block read the
same block, so the proportions are identical and only the `.fan` box they are a percentage *of* changes.
That is what "same proportions as variant B, scaled to fit" means here — there is no second set of
numbers to keep in step. Confirmed by measurement: the phone is **86% of the dashboard** and the kitchen
**77% of its width** at 390, 768, 1280 **and** 1440.

---

## 📐 2 · VARIANT B, AS RENDERED AT 1440px

Group width **W = 552px**.

| | rendered | ratio |
|---|---|---|
| **kitchen** | **264 × 204px** | **77%** of the dashboard's width *(75–80% asked for)* |
| **dashboard** | **343 × 245px** | **62%** of W *(~60% asked for)* |
| **phone** | **106 × 210px** | **86%** of the dashboard's **height** *(~90% asked for)* |

⚠️ **These are painted (axis-aligned) sizes, which a −3° tilt makes a few px wider than the CSS boxes** —
the dashboard's CSS width is 331px, 60.0% of W exactly. The percentages above are therefore reported
from the measurement, not from the declaration, which is why they read 62% and 86% rather than 60% and
90%. Both are inside the bands the brief set.

**Against the complaints that prompted this:**

| | before (fan pass) | **variant B** |
|---|---|---|
| dashboard "far too big" | 434px (79% of W) | **343px (62%)** — down 21% |
| phone "far too small" | 96 × 190px, 61% of the dashboard | **106 × 210px, 86%** |
| kitchen "a little too small" | 262px, 60% of the dashboard | **264px, 77%** |
| "sits low, empty space top-left" | dashboard anchored **bottom** | dashboard anchored **`top: 24%`**, and the group's centre now sits at **381** against the headline→button middle at **381** — exactly level |

### ⛔ Is the "Take payment" button visible? **Yes.**

Asserted as geometry **and** confirmed in the screenshot: the dashboard's bottom-right corner — where the
orange `Take payment £50.00` button sits — is at **(1007, 479)**, and the phone's box is
**1017–1123 × 422–632**. The corner is **outside** it. The phone crosses only **18px** of the dashboard's
right edge, below the button, so the basket column (from x 918) stays almost entirely visible. The brief
permits that edge overlap and forbids covering the button; both hold.

---

## 🖼 3 · THE TWO ALTERNATIVES — RENDERED, NOT APPLIED

🟢 **Each variant is a three-line override of the constants block**, injected at runtime in the browser.
**Nothing was left applied**, and the stylesheet was not edited to produce them — which is the return on
expressing the fan as constants in the first place.

| | override | dashboard | kitchen | phone |
|---|---|---|---|---|
| **A** | `--fan-dash-w:63%; --fan-kds-w:44.1%; --fan-phone-h:.75` | 360 × 257 (65% of W) | 253 × 195 (70% of dash) | 92 × 184 (71%) |
| **B** ✅ | *as shipped* | **343 × 245 (62%)** | **264 × 204 (77%)** | **106 × 210 (86%)** |
| **C** | `--fan-dash-w:56%; --fan-kds-w:47.6%; --fan-phone-h:1.05` | 320 × 229 (58% of W) | 273 × 211 (85% of dash) | 115 × 229 (100%) |

---

## ✅ 4 · CHECKS — 14 ASSERTIONS, ALL PASSING

| | |
|---|---|
| dashboard ≈ 60% of W | ✓ **62%** |
| kitchen 75–80% of the dashboard's width | ✓ **77%** |
| phone ≈ 90% of the dashboard's height | ✓ **86%** |
| …and no taller than it | ✓ 210 vs 245px |
| gap to the nearest screen 48–80px | ✓ **50px** |
| group's right edge inside the nav's | ✓ 1244 vs 1250 |
| group's centre level with headline→button | ✓ **381 vs 381** |
| text column aligned to the nav logo | ✓ 190 = 190 |
| "Take payment" corner not under the phone | ✓ |
| most of the basket visible | ✓ 18px crossed of a 343px-wide screen |
| **no horizontal page scroll** | ✓ **390, 768, 1280, 1440** |

`npx tsc --noEmit` on the touched files: **clean**. `npx eslint` on them: **0 errors, 0 warnings**.
`npx next build`: **✓ Compiled successfully**.

### Loading

`dashboard-v4.png` **keeps `priority`**; the other two do not. `sizes` updated to variant B:

| | `sizes` | 390 dpr1 | 390 dpr2 | 1440 dpr1 | 1440 dpr2 |
|---|---|---|---|---|---|
| `kitchen.png` | `(max-width: 939px) 46vw, 332px` | 384 | 384 | 384 | 750 |
| `dashboard-v4.png` | `(max-width: 939px) 60vw, 332px` | 384 | 640 | 384 | 750 |
| `customer-order.png` | `(max-width: 939px) 18vw, 96px` | 128 | 256 | 128 | 256 |

**LCP is `h1` at 60ms (390) and 64ms (1440)** — the element the page had before any of today's hero work,
and no worse than it.

⚠️ **The kitchen and the dashboard request the same 332px cap**, which is a coincidence of this variant
(331 and 254 CSS px land on the same step of next/image's ladder), not a shared value — they are two
separate attributes and the next size change will part them.

---

## 📸 5 · SCREENSHOTS

```
docs/landing-polish-shots/hero-fan-sizing/variant-A-1440.png
docs/landing-polish-shots/hero-fan-sizing/variant-B-1440.png   ← applied
docs/landing-polish-shots/hero-fan-sizing/variant-C-1440.png
docs/landing-polish-shots/hero-fan-sizing/variant-B-1280.png
docs/landing-polish-shots/hero-fan-sizing/variant-B-390.png
```

All DPR 2, clipped to `header.hero`.

---

## ⚠️ 6 · WHAT I COULD NOT VERIFY

1. ⚠️ **The percentages land 1–4 points off the brief's targets** (62 vs 60, 86 vs 90) because the tilt
   makes the painted box wider than the CSS box. Setting the *declared* values to hit the *painted*
   targets is a one-line change to the constants block if you want it exact — say the word.
2. ⚠️ **"Most of the basket is visible" is geometry plus a screenshot**, not pixel analysis of the
   underlying image: I know the phone covers 18px of the dashboard's right edge and not the button's
   corner, and the screenshot shows the basket readable.
3. ⚠️ **Real devices and Safari.** Headless Chromium throughout; the LCP milliseconds are localhost
   figures, so the *element* is the meaningful half of that comparison.
4. ⚠️ **Variants A and C were judged from single 1440px screenshots** — they were not checked for scroll,
   overlap or button coverage, since they are not applied.
