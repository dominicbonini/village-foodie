# LANDING HERO FAN — THE TILT RESTORED, DASHBOARD IN FRONT

**6 October 2026 · branch `main`, local only. Nothing pushed, nothing deployed, no production request,
no truck touched.**

This replaces `docs/landing-hero-rebalance-report.md` and the hero spacing job. ⚠️ **Its sizing was then
tuned once more** — `docs/landing-hero-fan-sizing-report.md` holds the numbers now applied.

---

## ⚠️ 0 · THE HERO SPACING JOB DID NOT RUN

The brief said: *"If a hero spacing job is queued and hasn't started, skip it. Report whether it ran."*

🟢 **It had not started.** Only its "before" measurement existed — the 409px gap the rebalance left — so
it was skipped and **no `docs/landing-hero-spacing-report.md` was written**. 🟢 **Its objective is met by
this work anyway**: the gap to the nearest screen is **49px at 1280, 1440 and 1728**, inside the 48–80px
band that brief asked for, with the text column untouched.

---

## 📁 FILES CHANGED

| | |
|---|---|
| `app/landing/landing.css` | the `.shot-*` rules rewritten — one tilt, new slots, new sizes, base and ≥940px |
| `app/landing/page.tsx` | three `sizes`; `priority` on the dashboard **only** |

**Added:** `docs/landing-polish-shots/hero-fan/` — hero at 390, 768, 1024, 1280, 1440, 1728.

---

## 🔴 1 · THE COMPOSITION

Found in the stylesheet's own history — the fan this restores is the polish pass's, with the slots
swapped:

| | z | slot | width @1440 | tilt |
|---|---|---|---|---|
| `kitchen.png` | **1** | back, upper-right, 60% of the dashboard | 252px | −3° |
| `dashboard-v4.png` | **2** | **front, largest, lower-left** | 420px | −3° |
| `customer-order.png` | **3** | front, bottom-right | 86px | −3° |

🔴 **One angle for every screen — −3°**, which is the brief's rule and is what makes it read as one fan
rather than three pasted rectangles. ⚠️ **−3° rather than the polish pass's −4°/2.5°/4°, and the number
is chosen rather than picked**: a rotated box's axis-aligned width grows by `h·sin θ`, so the 420×289
dashboard gains 15px at 3° and 20px at 4°, and that growth eats straight into the 48–80px gap the brief
bounds.

🔴 **No background square, panel or tint.** `.fan::before` was deleted in the rebalance and has not
returned — verified as computed `content: none` at every width.

### 📐 The phone was sized off the dashboard, not chosen

```
dashboard 420 wide → 420 ÷ (800/551) = 289 tall
phone      86 wide →  86 × (2778/1284) = 186 tall  =  64.4% of 289   ✓ under the 65% cap
```

### ⛔ And it clears the basket — the brief's own tie-break decided this

Point 3 forbids covering the dashboard's basket column or its orange "Take payment" button, with an
explicit tie-break: *"shift the phone further right/down until the basket is clear."*

**First attempt: `right: 9%` put the phone 15px inside the dashboard's right edge** — and that right
third *is* the basket and the button. Moved to **`right: 5%`**, which puts it just past the dashboard's
right edge: **overlap 0px**, basket and orange button wholly visible. ⚠️ The group still reads as one fan
because the phone overlaps the **kitchen** behind it; what it no longer does is sit on the one
screenshot the hero is selling.

### ⚠️ And the kitchen had to come in 2% from the right

At `right: 0` the rotated kitchen's painted corner reached **x 1255 against the nav's right edge at
1250** — breaking point 5. `right: 2%` (11px) puts it back inside at 1246. **Measured, not
precautionary**: it is the same axis-aligned-box growth as the tilt note above.

---

## ✅ 2 · CHECKS — ALL PASSING AT 1280, 1440 AND 1728

| | |
|---|---|
| all three share one tilt | ✓ `matrix(0.99863, -0.052336, …)` — identical computed transform |
| z-order kitchen < dashboard < phone | ✓ 1 < 2 < 3 |
| phone height ≤ 65% of the dashboard's | ✓ **61%** (190px vs 311px rendered) |
| basket and Take payment visible | ✓ **0px overlap**; the basket third starts at x 1121, the phone at x 1276 |
| no background square | ✓ `content: none` |
| text column unmoved, aligned to the logo | ✓ equal at every width |
| gap to the text | ✓ **49px** (48–80 asked for) |
| group's right edge inside the nav's | ✓ 1388 vs 1394 @1728 |
| group centre level with headline→button | ✓ 401 vs 381 |
| no horizontal scroll | ✓ 390, 768, 1024, 1280, 1440, 1728 |

⚠️ **One width is outside the band: at 1024px the gap measures 44px**, 4px under. The brief bounds
1280–1440, so 1024 is outside its stated range — flagged rather than tuned, because closing it there
would open it at the widths the brief does bound.

### Requested image widths, and LCP

| | 390 dpr1 | 390 dpr2 | 1440 dpr1 | 1440 dpr2 |
|---|---|---|---|---|
| `kitchen.png` | 384 | 384 | 384 | 640 |
| `dashboard-v4.png` | 640 | 640 | 640 | 1080 |
| `customer-order.png` | 128 | 128 | 128 | 256 |

| | rebalance | **this pass** |
|---|---|---|
| LCP element | `img kitchen.png` | **`h1`** |
| LCP time, 390 / 1440 | 84ms / 84ms | **60ms / 60ms** |

🟢 **The regression the rebalance introduced is gone.** `priority` is now on `dashboard-v4.png` alone, as
point 6 asks; the other two are `loading="lazy"` and arrive a beat later — an accepted trade, measured
rather than assumed.

`npx tsc --noEmit`: **clean**.

---

## 🔴 3 · PHONE LAYOUT, AND THE TILT THERE

The base rules carry the **same order and the same −3°** as the desktop block — the group is one fan at
every width, not a fan on a laptop and something else on a phone. Only the percentages differ.

⚠️ **No gentler phone tilt was needed.** The brief allowed one if −3° looked cramped at 390px; it does
not, there is no horizontal scroll and nothing is cut off, so the angle is left alone rather than
special-cased.

---

## ⚠️ 4 · WHAT I COULD NOT VERIFY

1. ⚠️ **"The basket is visible" is asserted as geometry**, not by reading pixels: the phone has zero
   overlap with the dashboard, so nothing of it can be covered. The screenshots are the visual evidence.
2. ⚠️ **Real devices and Safari.** Headless Chromium; LCP times are localhost figures.
3. ⚠️ **1024px sits 4px outside the gap band** — §2.
