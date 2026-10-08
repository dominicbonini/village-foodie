# LANDING HERO RESTORE — THE LIVE FAN BACK, PLUS FIVE CHANGES ON TOP

**7 October 2026 · branch `main`, local only. Nothing pushed, nothing deployed, no production write.
www.hatchgrab.com was READ only. No truck touched.**

---

## 📁 FILES CHANGED

| | |
|---|---|
| `app/landing/page.tsx` | the three-screen fan restored; the hero note moved into `.hero-cta-row` as two lines |
| `app/landing/landing.css` | the fan rules restored; tagline navy; the note's two layouts; hero padding −40%; icons navy; the orange button rule restored to white |

**Added:** `docs/landing-polish-shots/hero-restore/` — 7 screenshots.
⛔ `lib/plan-features.ts`, `lib/landing-table.ts`, `lib/features.ts`: **untouched**.

---

## 🔴 1 · THE LIVE 3-SCREEN FAN IS BACK — CONFIRMED AGAINST THE LIVE PAGE

All six of yesterday's hero arrangements were uncommitted, so **git HEAD *is* what is live**. I did not
assume that — I fetched the served page and diffed it:

```
curl https://www.hatchgrab.com/ | grep -oE 'class="shot shot-[a-z]+"|sizes="(max-width: 939px)[^"]*"'
  vs the same grep on localhost
→ IDENTICAL ✓
```

| | live / restored |
|---|---|
| `kitchen.png` | `.shot-kds` · `min(58%,320px)` · `left: 0; top: 8%` · **`rotate(-6deg)`** · z 1 · `sizes="(max-width: 939px) 58vw, 320px"` · `priority` |
| `dashboard-v4.png` | `.shot-dash` · `min(72%,400px)` · centred · **`rotate(-1deg)`** · z 2 · `sizes="(max-width: 939px) 72vw, 400px"` · `priority` |
| `customer-order.png` | `.shot-phone` · `min(26%,140px)` · `right: 2%; bottom: 0` · **`rotate(5deg)`** · z 3 · `18px` corners · `sizes="(max-width: 939px) 26vw, 140px"` · `priority` |
| the frame | `border-radius: 12px`, **no border**, `box-shadow: 0 22px 50px -20px rgba(15,23,42,.32), 0 2px 8px rgba(15,23,42,.06)` |

**Rendered at 1440: 343×272 · 402×281 · 166×314** — the same numbers HEAD produces.

### Removed, with nothing left behind

`.fan-group` (the shared-tilt wrapper) · the ten `--fan-*` custom properties · `.fan::before` (the tint)
· every per-breakpoint `min()` cap · the two-screen markup · a **second, dead `.shot` rule** from the
polish pass (a thin border and a different shadow) that was being overridden by source order and would
still have read as the live one.

🟢 **`kitchen.png` is back in the hero** and is no longer an unreferenced asset.

### ⚠️ One difference from live, and it is deliberate

**The hero's padding.** That is item 4, below. Everything inside the fan matches; the box it sits in is
40% tighter.

---

## 🔴 2 · THE TAGLINE IS NAVY

`.hero-tag` `color: var(--ink-soft)` → **`var(--head)`** — the token the headline above it already uses,
so the two read as one block. **Measured `rgb(22, 49, 79)` at all four widths.**

⚠️ **Colour only.** The wording, the `clamp(1.15rem,2.2vw,1.45rem)`, the 700 weight, the 1.2
line-height and the `<br />` are untouched. 🟢 **"cooking." keeps its orange italic** — `.hero-tag .lean`
is more specific and is not overridden; measured `rgb(239, 139, 44)` + `italic`.

---

## 🔴 3 · THE LINE MOVED BESIDE THE BUTTON

> No signup, no card.
> See it working in under 60 seconds.

**It is back inside `.hero-cta-row`**, which is `column` below the threshold and `row` above it — so one
element gives "right of the button" on a laptop and "under the button" on a phone, with no duplicate
markup. The `<br />` is the copy's own break.

| | |
|---|---|
| gap to the button | **16px** |
| vertically centred on it | ✓ within 2px |
| smaller than the tagline | **13.6px vs 23.2px** |
| muted | `--hero-grey` #3E5472 — **7.73:1** on white. (`--ink-soft` would be 4.44:1, which *misses* the floor) |
| the button stays one line | ✓ `flex: none` + the base rule's `white-space: nowrap` |
| below 640px | stacked under the button, and `.hero-sub-sm` stays hidden — **the phone does not say it twice** |

### 📐 It needed the gutter, and that took two measurements

The longer line is **~225px**; the text column leaves only **~203px** after the button and the gap. The
copy and the gap are both fixed by the brief, so something had to give:

⛔ **Shrinking the text to fit would have meant ~12px** next to a 19.2px button label. Instead
`.hero-cta-row` is `width: max-content` and the note is `nowrap`, so the second line uses the grid
**gutter**. The font still came down one step — **.92rem → .85rem** — because at .92 the line cleared the
kitchen screenshot by only **5px**. At .85 it clears by **23px**.

🔴 **AND THE BESIDE-LAYOUT STARTS AT 1140px, NOT AT THE HERO'S OWN 940px SPLIT** — because below 1140
there is not enough gutter and the line *overlaps the screenshot*:

| viewport | 940 | 1024 | 1060 | 1100 | **1140** | 1280 | 1440 | 1728 |
|---|---|---|---|---|---|---|---|---|
| clearance | **−68** | **−31** | **−14** | +5 | **+23** | +23 | +23 | +23 |

From 1140 the fan has hit its `min()` caps and stops growing, so the clearance is a flat 23px at every
wider viewport. **Between 940 and 1139 the note stays under the button, left-aligned with it** — the
arrangement the brief specifies for phones, reused rather than a third one invented.

### ⛔ And one bug this introduced, caught by measurement

`width: max-content` on a grid child **raises an `fr` track's automatic minimum**, so it stole width from
the fan: the kitchen dropped from **343×272 to 319×253** and the hero stopped matching live — the one
thing this workstream exists to restore. Fixed with `min-width: 0` on the text cell, which lets the
`.9fr 1.1fr` split hold and the row overflow instead. **Re-measured back to 343×272.**

---

## 🔴 4 · THE HERO IS 40% TIGHTER

📐 **Every number in both clamps is ×0.6**, which is what makes it proportional at *every* width rather
than only at the one it was measured on — the floor, the vw rate and the cap all scale together:

```
top     clamp(2.5rem, 5vw, 4rem)    →  clamp(1.5rem, 3vw, 2.4rem)
bottom  clamp(3rem, 6vw, 4.5rem)    →  clamp(1.8rem, 3.6vw, 2.7rem)
phone   padding-block: 2.5rem 2rem  →  padding-block: 1.5rem 1.2rem
```

⛔ **Scaling only the caps would have left the phone untouched**, because below ~853px the `vw` term
wins and the cap never applies.

| | padding top | padding bottom | hero height |
|---|---|---|---|
| **1440, before** | 64px | 72px | **566px** |
| **1440, after** | **38.4px** | **43.2px** | **512px** — −54px |
| **390, before** | 40px | 32px | **608px** |
| **390, after** | **24px** | **19.2px** | **577px** — −31px |

Both reductions are exactly **−40.0%**.

🟢 **Nothing is clipped.** The fan's own `min-height` and `overflow: hidden` are untouched, so the
screenshots keep the box they had. Measured at every width: the lowest screenshot edge sits **inside**
the hero's bottom edge and above the trust strip (1440: 546 vs 584).

---

## 🔴 5 · THE SIX TILE ICONS ARE NAVY

`.does-ico` `color: var(--orange)` → **`var(--head)`**. Measured: all six compute
`stroke: rgb(22, 49, 79)`, **the same value as the tile headings beside them**. Nothing else in that
section changed.

---

## ⛔ 6 · THE ORANGE BUTTONS — CHANGED TO NAVY, THEN BACK TO WHITE ON YOUR WORD

The brief asked for navy text on every filled orange button. I made that change, and you reversed it on
sight: *"change the orange buttons back to white text."* **The rule is now exactly what it was before,
and the experiment left nothing behind** — measured: all four buttons compute `rgb(255, 255, 255)`.

📐 **The measurements are recorded because they do not change with the decision:**

| text | on `--orange` #EF8B2C | on `--orange-deep` #D9741A (hover) |
|---|---|---|
| **white #FFFFFF** ← shipped | **2.50:1** | **3.25:1** |
| navy #16314F | **5.29:1** | 4.07:1 |

⚠️ **So the label is below the 4.5:1 AA floor, and below the 3:1 large-text floor too** — `.btn-lg` is
1.2rem/700, which is large text, and 2.50 misses even that. The token block in `landing.css` has carried
a version of this warning for months; it is an accepted brand decision, not an oversight, and it is now
written down beside the rule with the four numbers. 🔴 **Navy on the rest state is the only one of the
four that clears 4.5.**

### Where it would have applied

`.hg-landing .btn-primary` is the shared marketing style, so the change would have reached **the landing,
`/features` and `/compare`** — all three render `LandingNav` and `DemoCta` inside a `.hg-landing`
wrapper. ⛔ **It would NOT have reached the operator app**: Manage, the KDS and the customer ordering
pages use Tailwind's `bg-orange-600` with their own text colours and never match that selector. Since
the change was reverted, **nothing on any of those surfaces moved.**

---

## ✅ 7 · CHECKS

**93 browser assertions, all passing**, at 390 / 768 / 1280 / 1440:

- three screens, `.fan-group` gone, z-order 1·2·3, kitchen behind upper-left, phone in front right
- **three distinct tilts** (not one shared), corners 12/12/18px, the live shadow, **no border**, no tint
- the screenshots are clipped by neither the hero edge nor the trust strip
- the tagline is navy; "cooking." stays orange italic
- the note says both sentences, **on two lines**, smaller than the tagline, and the button stays one line
- beside + 16px gap + vertically centred from 1140px; stacked below it; the mobile sub-line stays hidden
- all six icons navy, matching the tile headings
- **all four filled orange buttons have white text**
- **no horizontal page scroll** at any width

| | |
|---|---|
| `npx tsc --noEmit` | **clean** |
| `npx eslint` on the touched files | **0 errors, 0 warnings** |
| `npx next build` | **✓ Compiled successfully** |

### Requested hero image widths, and LCP

| | 390 dpr1 | 390 dpr2 | 1440 dpr1 | 1440 dpr2 |
|---|---|---|---|---|
| `kitchen.png` | 384 | 640 | 384 | 640 |
| `dashboard-v4.png` | 640 | 640 | 640 | 828 |
| `customer-order.png` | 256 | 256 | 256 | 384 |

**LCP element: `h1`** — 68ms at both widths. Unchanged by any of this.

### Difference from the live page at 1440px

**The fan itself: none.** Markup, classes, `sizes`, `priority`, sizes, positions, tilts, corners and
shadow all match. The differences are the five deliberate changes: a navy tagline, the note beside the
button, 40% less hero padding, navy tile icons — and the orange buttons, which are back to live's white.

---

## 📸 8 · SCREENSHOTS

```
docs/landing-polish-shots/hero-restore/hero-390.png     hero-768.png
docs/landing-polish-shots/hero-restore/hero-1280.png    hero-1440.png
docs/landing-polish-shots/hero-restore/what-it-does-1440.png
docs/landing-polish-shots/hero-restore/pricing-1440.png
docs/landing-polish-shots/hero-restore/final-cta-1440.png
```

All DPR 2.

---

## ⚠️ 9 · WHAT I COULD NOT VERIFY

1. ⚠️ **I compared the hero against live by markup, not by pixels.** The classes, all three `sizes`,
   `priority` and the CSS rules are byte-identical to HEAD, and HEAD is what is deployed — but I did not
   screenshot www.hatchgrab.com and diff images, because the live page also carries yesterday's *other*
   landing changes' absence, which would make a whole-page pixel diff noisy rather than informative.
2. ⚠️ **The 1140px threshold is tuned to this copy.** If either line of that note ever gets longer, the
   clearance table in `landing.css` is the thing to re-measure — nothing enforces it.
3. ⚠️ **Real devices and Safari.** Headless Chromium throughout; the LCP milliseconds are localhost
   figures, so the *element* is the meaningful half.
4. ⚠️ **The button contrast stays below AA** — §6. Recorded, not fixed, because you chose white.
