# LANDING HERO — TWO SCREENS, PHONE ON THE LEFT

**6 October 2026 · branch `main`, local only. Nothing pushed, nothing deployed, no production request,
no truck touched, and the menu-upload demo flow was not run.**

This replaces the three-screen fan (`docs/landing-hero-fan-sizing-report.md`). It builds on that code
and **repurposes its CSS custom properties**, as the brief asked.

---

## 📁 FILES CHANGED

| | |
|---|---|
| `app/landing/page.tsx` | `kitchen.png` removed from the hero; both screens wrapped in one `.fan-group`; two `sizes`; `loading` |
| `app/landing/landing.css` | the hero constants repurposed; the group container added; every three-screen rule and variable removed |

**Added:** `docs/landing-polish-shots/hero-two-screens/` — hero at 390, 768, 1280, 1440.

---

## ⛔ 0 · ALSO IN THIS TURN: THE TYPE BUMP WAS REVERTED

Two separate instructions during this work: *"the text size in what it does has been changed… change it
back"*, then *"i think the text size in getting going has also been changed."*

**Both reverted.** The polish workstream's +12% is fully undone — `.does-item h3` 1.05rem,
`.does-item p` .94rem, `.step h3` 1.12rem, `.step p` .95rem: the values they had at the start of the day.
⚠️ **Only the `font-size`s went back.** `.does-item h3` is still a flex row — that is the inline-icon
layout, a different change, and it stays. `docs/landing-polish-report.md` §5 is marked accordingly.

---

## 🔴 1 · `kitchen.png` LEFT THE HERO — AND NOTHING ELSE USES IT

**The file is not deleted.** `public/screenshots/kitchen.png` is untouched.

⛔ **Nothing else in the product references it.** Grepped across `app/`, `components/`, `lib/`,
`scripts/` and `public/`: the only remaining mentions are **historical reports in `docs/`**. So it is now
an **unreferenced asset**. ⚠️ **Flagged, not removed** — deleting a screenshot was not asked for, and it
is the obvious candidate if the hero ever wants a third screen back.

---

## 🔴 2 · ONE GROUP, ONE TILT — THE STRUCTURAL CHANGE

Every earlier pass rotated **each image about its own centre**, so three "identical" angles still read as
three planes. Both screens now sit inside one `.fan-group`, and the tilt is applied **once, to that
wrapper**.

**Measured:** the group's computed transform is `matrix(0.99863, -0.052336, …)` and **both images compute
`transform: none`** — there are no per-image transforms left. That is asserted at all four widths.

⚠️ **−3° is kept rather than softened.** With two screens the group is wider and shorter, so the same
angle reads gentler than it did with three. No separate phone-width tilt was needed: 390px has no
horizontal scroll and nothing is cut off.

---

## 🔴 3 · THE TUNABLE CONSTANTS

Declared once on `.hg-landing .fan`:

| Constant | Value | What it is a percentage **of** |
|---|---|---|
| `--fan-tilt` | **-3deg** | the one angle, on the group |
| `--fan-dash-w` | **78%** | the group width **W** (the `.fan` box) |
| `--fan-phone-h` | **.9** | a **fraction of the dashboard's rendered height** |
| `--fan-phone-overlap` | **.25** | a fraction of the **phone's own width** |
| `--fan-dash-right` | **2%** | the dashboard's inset from the group's right edge |
| `--fan-phone-top` | **9%** | the phone's offset below the dashboard's top |
| `--fan-group-shift` | **29px** | the whole group's downward nudge |
| `--fan-phone-w` | *derived* | `calc(var(--fan-dash-w) * 0.31834 * var(--fan-phone-h))` |

⛔ **`--fan-kds-w`, `--fan-kds-top`, `--fan-kds-right`, `--fan-dash-top`, `--fan-phone-right` and
`--fan-phone-bottom` are gone** with the third screen and the bottom-anchored phone. **No constant is
left that nothing reads**, and the `.shot-kds` selector was removed from the one shared rule that still
named it.

**Two values are derived, not typed**, because the brief specifies the phone by *height* and by
*overlap* while CSS lays this out by *width* and by *left*:

```
phone width = dash width × (551/800) × (1284/2778) × phone-h  =  dash width × 0.31834 × phone-h
phone left  = (W − dash width − dash inset) − phone width × (1 − overlap)
```

⚠️ **If either image is re-exported at a new shape, 0.31834 is the number to recompute** — and nothing
will fail if it is not; the phone will simply stop being the height it claims to be.

### 📐 Two numbers were solved, not picked

**`--fan-dash-w: 78%`.** The **phone** is the group's left edge, so the dashboard's width is what sets the
gap to the text. At 84% the phone sat 23px *left* of the fan's own edge and the gap fell to **26px**,
under the band. Solving `W − inset − D − D·0.2865·(1 − overlap)` for a gap in band gives D ≈ 430px of a
552px group = **78%**. ⛔ **It is bounded on both sides** — the group's right edge must stay inside the
nav's — so it is not free to grow.

**`--fan-phone-overlap: .25` declared, ~34% measured.** The overlap is computed on the *unrotated* boxes;
rotating the group swings the phone's corner further over the dashboard, so the painted overlap runs
~8 points above the declared one. **Declared low, measured right** — the honest way round when the brief
specifies the painted result.

---

## ✅ 4 · CHECKS — 44 ASSERTIONS, ALL PASSING

At 390, 768, 1280 and 1440px:

| | |
|---|---|
| only **two** screens render, no `kitchen.png` in the hero | ✓ |
| **one** tilt, on the group; per-image transforms `none / none` | ✓ |
| the phone is on the **left** and in **front** | ✓ 708 < 799, z 2 > 1 |
| overlapping the dashboard's left edge by ~a third | ✓ **46px = 34%** of the phone |
| phone height ≈ 90% of the dashboard's | ✓ **86%** |
| **basket and "Take payment" fully visible** | ✓ the phone reaches x **845**; that third starts at x **1093** |
| no background square or tint | ✓ `content: none` |
| text column aligned to the nav logo | ✓ 190 = 190 at 1440 |
| **no horizontal page scroll** | ✓ 390, 768, 1280, 1440 |
| gap from the text to the phone | ✓ **66px** (48–80 asked for) |
| group's right edge inside the nav's | ✓ **1244 vs 1250** |
| group's top level with the headline | ✓ **224 vs 224** |
| its bottom level with the "No signup" line | ✓ **552 vs 573** |

⛔ **The basket claim is structural, not tuned.** The phone is on the **left**; the basket column and the
orange button are in that screenshot's **right** third. It can only ever cover menu tiles — which is what
every previous pass had to achieve by hand, and kept getting wrong.

### Rendered sizes at 1440px

| | rendered | ratio |
|---|---|---|
| **dashboard** | **446 × 319px** | 78% of the group (declared); back, z 1 |
| **phone** | **137 × 273px** | **86%** of the dashboard's height; front, z 2 |

⚠️ Painted (axis-aligned) sizes; the −3° tilt makes them a few px larger than the CSS boxes, which is why
86% is reported rather than the declared 90%.

### Requested image widths, and LCP

| | 390 dpr1 | 390 dpr2 | 1440 dpr1 | 1440 dpr2 |
|---|---|---|---|---|
| `dashboard-v4.png` | 640 | 640 | 640 | 1080 |
| `customer-order.png` | 128 | 256 | 256 | 384 |

**LCP element: `h1`** — 56ms at 390, 60ms at 1440. The element the page had before any of today's hero
work, and no worse than it.

**Loading:** `dashboard-v4.png` has **`priority`**; `customer-order.png` has **`loading="eager"` without
it**. ⚠️ That distinction is real: `priority` would add `fetchpriority="high"` and make the phone compete
with the dashboard for the LCP slot. Eager alone means not lazy — it starts immediately, at normal
priority.

`npx tsc --noEmit`: **clean**. `npx eslint` on the touched files: **0 errors, 0 warnings**.
`npx next build`: **✓ Compiled successfully**. `lib/landing-table.ts` and `lib/features.ts`: **unchanged**.

---

## 📸 5 · SCREENSHOTS

```
docs/landing-polish-shots/hero-two-screens/hero-390.png
docs/landing-polish-shots/hero-two-screens/hero-768.png
docs/landing-polish-shots/hero-two-screens/hero-1280.png
docs/landing-polish-shots/hero-two-screens/hero-1440.png
```

All DPR 2, clipped to `header.hero`.

---

## ⚠️ 6 · WHAT I COULD NOT VERIFY, AND ONE THING TO KNOW

1. ⚠️ **The phone is 86% of the dashboard, not 90%** — the tilt again. Setting `--fan-phone-h` to ~.94
   would make the *painted* ratio 90%; one line in the constants block if you want it exact.
2. ⚠️ **`public/screenshots/kitchen.png` is now unreferenced** — §1. Yours to delete or keep.
3. ⚠️ **`.shot-empty` in landing.css was already dead before this work** (its markup went when the last
   placeholder was filled). Not mine, not removed, flagged.
4. ⚠️ **`event-types-render.cjs` failed in one full sweep and passes on its own** (exit 0, all
   measurements green). It is a Playwright render harness and the sweep was running against my
   `next start` on the same machine — resource contention, not a regression. Re-run on its own to
   confirm.
5. ⚠️ **Real devices and Safari.** Headless Chromium throughout; LCP milliseconds are localhost figures,
   so the *element* is the meaningful half of that comparison.
