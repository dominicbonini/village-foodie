# LANDING HERO REBALANCE — FLAT STACK, DASHBOARD LARGEST

**6 October 2026 · branch `main`, local only. Nothing pushed, nothing deployed, no production request,
no truck touched.**

> ⛔ **THIS WORKSTREAM WAS REPLACED LATER THE SAME DAY**, by the brief that restored the tilted fan —
> `docs/landing-hero-fan-report.md`, then resized in `docs/landing-hero-fan-sizing-report.md`. It is
> reported in full because it ran, it changed `sizes` and `priority`, and its two measurable outcomes —
> a 409px gap and an LCP regression — are the evidence the next brief acted on.

---

## 📁 FILES CHANGED

| | |
|---|---|
| `app/landing/landing.css` | `.fan::before` deleted; the `.shot-*` rules re-anchored, resized and de-tilted |
| `app/landing/page.tsx` | three `sizes` values; `priority` removed from `kitchen.png` |

**Added:** `docs/landing-polish-shots/hero-rebalance/` — hero screenshots at 390, 768, 1024, 1280, 1440, 1728.

---

## 🔴 WHAT IT DID

**1 · The faint tinted panel behind the group was removed** — `.fan::before`, a `--wash` rounded
rectangle inset 10%/4%, added hours earlier by the polish workstream. **Deleted, not set to `none`.**
Verified as a computed `content: none` at every width.

**2 · The stack was inverted.** The polish pass had made the kitchen largest and in front; this made the
dashboard the main image:

| | z-index | role | width @1440 |
|---|---|---|---|
| `kitchen.png` | 1 | back, top-right | 320px |
| `dashboard-v4.png` | 2 | front-left, largest | 408px |
| `customer-order.png` | 3 | front, bottom-right | 182px |

**3 · Every tilt was removed** — the brief's own rule ("keep a tilt only if it is the same for all
three"); they were −4°, 2.5° and 4°, so the group sat square.

**4 · `.fan`'s min-height stayed 525px.** `.hero-grid` is `align-items: center`, so the fan is what
vertically centres the text column beside it. The geometry wanted 450px; taking it would have moved the
heading, tagline, button and note up by ~37px, which the brief forbade.

**5 · `priority` moved to the dashboard and the phone**, off the kitchen, as instructed.

---

## ✅ WHAT WAS MEASURED

**All structural checks passed** at 1024–1728px: z-order kitchen(1) < dashboard(2) < phone(3); the
dashboard largest and lower-left of the kitchen, overlapping it; the phone over its bottom-right; the
text's left edge equal to the nav logo's; no tinted panel; no horizontal scroll at 390–1728.

### 🔴 TWO OUTCOMES THAT ARGUED AGAINST IT

**1 · The gap to the front-most screen was 409px at 1440 and 1728.** The hero read as two things with a
hole between them. A follow-up brief was queued to fix exactly this.

**2 · LCP got worse, and changed element.**

| | before | after |
|---|---|---|
| LCP element, 390 / 1440 | `h1` / `h1` | **`img /screenshots/kitchen.png`** at both |
| LCP time, 390 / 1440 | 56ms / 60ms | **84ms / 84ms** |

⚠️ **Removing `priority` from the kitchen is what did it.** It is still above the fold, so it became
`loading="lazy"`, painted later, and — still being a large element — became the LCP candidate *and*
pushed the time out. The instruction was explicit and was followed; the cost is recorded rather than
hidden. 🟢 **The fan pass that replaced this restored `h1` as the LCP element at 60ms.**

### Requested image widths

| | 390 dpr1 | 390 dpr2 | 1440 dpr1 | 1440 dpr2 |
|---|---|---|---|---|
| `kitchen.png` | 384 | 640 | 384 | 640 |
| `dashboard-v4.png` | 640 | 640 | 640 | 828 |
| `customer-order.png` | 256 | 384 | 256 | 384 |

Rendered at 1440: kitchen 320 · dashboard 408 · phone 182.

`npx tsc --noEmit`: **clean**.

---

## ⚠️ THE HERO SPACING JOB: IT DID NOT RUN

A separate brief was queued to close that 409px gap. The fan brief that arrived next said: *"This
REPLACES the hero rebalance and hero spacing work. If a hero spacing job is queued and hasn't started,
skip it. Report whether it ran."*

🟢 **It had not started** — only its "before" gap was measured, as part of this workstream's checks — so
it was skipped, and **no `docs/landing-hero-spacing-report.md` was written**. 🟢 **Its objective was met
anyway**: the fan pass brings the gap to **49–50px**, inside the 48–80px band that brief specified.

---

## ⚠️ WHAT I COULD NOT VERIFY

1. ⚠️ **Real devices and Safari.** Headless Chromium only; LCP times are localhost figures, so the
   *element* is the meaningful half of that comparison and the milliseconds are not representative.
2. ⚠️ **This layout was never seen by anyone but me** before it was replaced — the screenshots in
   `hero-rebalance/` are the only record of it.
