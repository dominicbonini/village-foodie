# Footer badge — repositioned, and switched to the black variant

**Built. Not deployed, not committed. Two files: `components/landing/LandingFooter.tsx` and
`app/landing/landing.css`.**

**VERIFICATION.** Not a typecheck. **I rendered the footer in Chromium and measured it** at 1280, 940,
760, 390 and 320px, on a hatchgrab host (`http://hatchgrab.127.0.0.1.nip.io:3000/`), each width measured
**twice** — once with the badge hidden — so every "unchanged" below is a comparison, not an assumption.
Screenshots are of the `<footer>` element itself.

**GARBLED SPANS: none.** No instruction contradicted another.

## 🔴 The headline: I built the middle position, measured it, and it was wrong

You asked for the centre and said *"I asked for the middle; tell me if it doesn't work."* **It didn't,
and here is the measurement rather than an opinion.** With the badge as a third `space-between` child:

| Width | Gap to brand | Gap to links | Badge width |
|---|---|---|---|
| **1280px** | **278.3px** | **278.3px** | 119.66px |
| 940px | 180.7px | 180.7px | 119.66px |
| 760px | 97.9px | 97.9px | 119.66px |

**At 1280px the badge had more than twice its own width of empty footer on each side.** It did not read
as a middle column; it read as something that had come loose. Your mid-task message —
*"no that doesnt look right. move it. below the links on the right."* — reached the same conclusion, and
**the final build is your position, not the middle one.** §1 is what shipped; the middle-column
measurements above are §5's answer.

---

## 1. Where it is now, and what moved

**Under the links, right-aligned, inside a new `.foot-right` column.**

```
┌─ .foot-grid  (unchanged: the same two-child `space-between` flex row) ──────────────┐
│  HATCHGRAB                                            Pricing Privacy Terms Contact │
│  Less time booking.                                            [ Download on the ]  │
│  More time cooking.                                            [   App Store     ]  │
└────────────────────────────────────────────────────────────────────────────────────┘
   ─────────────────────────────────────────────────────────────────────────────────
   © 2026 HatchGrab                              From the people behind Village Foodie
```

**The mechanism is one wrapper.** `.foot-grid` still has exactly **two** children. The second is now a
`.foot-right` column holding `.foot-links` and `.foot-apps`:

```css
.hg-landing .foot-right { display: flex; flex-direction: column; align-items: flex-end; gap: 1.25rem; }
```

`align-items: flex-end` is what pins the badge to the links' **right edge**. Without it the badge would
start under "Pricing" while the links end at "Contact" — stacked but visibly misaligned.

### Do the brand column and the links keep their positions and widths? — **Yes. Measured, at every width.**

| Width | Brand width | Links position & width | |
|---|---|---|---|
| 1280 | 127px → **127px** | 913.3–1170 (256.7) → **913.3–1170 (256.7)** | ✅ identical |
| 940 | 127 → **127** | 645.7–902.4 (256.7) → **identical** | ✅ |
| 760 | 127 → **127** | 472.9–729.6 (256.7) → **identical** | ✅ |
| 390 | 127 → **127** | 66.7–323.3 (256.7) → **identical** | ✅ |
| 320 | 127 → **127** | 31.7–288.3 (256.7) → **identical** | ✅ |

**Nothing on either side moved by a single pixel at any width.** The badge's right edge lands on **1170**
at 1280px — the same x as the links' right edge, aligned to within 0.0px.

**Vertical cost: +11.2px on desktop** (236.4 → 247.6). The middle position cost +60px, and the original
brand-column position also cost +60px — **stacking under the links is the cheapest of the three**,
because the badge shares vertical space the brand block was already using.

---

## 2. Room for the second badge — side by side, and that is what I built for

**Side by side, under the links, right-aligned as a pair.** Measured with a simulated second badge:

| Width | Gap | Wrapped to 2 rows? | Overflow? | Footer height |
|---|---|---|---|---|
| 1280 | 20px | **no** | no | 247.6px (**+0.0** vs one badge) |
| 940 | 20px | **no** | no | 247.6px (+0.0) |
| 760 | 20px | **no** | no | 247.6px (+0.0) |
| 390 | 20px | **no** | no | 372.7px (+0.0) |
| 320 | 20px | **no** | no | 372.7px (+0.0) |

**Adding the second badge costs zero extra height at every width, including 320px.**

**Why side by side rather than stacked:** the links row is **256.7px** wide and two badges are **259.3px**
in my (worst-case) simulation — they sit under the links as a block of almost exactly matching width,
which reads as deliberate. A real Play badge is 646×250 native → **103.4px** at 40px tall, so the real
pair is **243.0px**, slightly narrower than the links row. `.foot-apps` keeps `flex-wrap: wrap`, so if a
future locale's badge is wider they stack rather than overflow — but nothing measured needs that.

### 🟢 The switch to black removed the rework this needed

The previous report flagged an unavoidable cost: Apple requires the **black** badge as soon as another
platform's badge appears, and a black badge on `bg-slate-900` would have needed a light panel behind the
pair. **The footer is now on black already.** So publishing Android is purely additive:

1. Add the Play badge as a sibling `<a>` after the Apple one — Apple requires its badge **first**.
2. Remove "Android coming soon" from `app/landing/page.tsx:194` and `:88`.

**No colour change. No panel. No CSS.** The one-deploy requirement is met.

---

## 3. Apple's requirements after the move — measured

| Requirement | Required | Measured | |
|---|---|---|---|
| Unmodified official artwork | — | the supplied file, plain `<img>`, no filter/transform/shadow/radius/hover | ✅ |
| *"40 px for use onscreen"* | ≥40px | **40.00px** at all five widths | ✅ |
| Undistorted | 2.9916 | **2.9915** (119.66 × 40) | ✅ |
| *"Minimum clear space… one-quarter the height"* | ≥10px | **above 20.0px** (to the links) · **below 38.4px** (to the legal strip) · **left 813.3px** at 1280 / 100.2px at 320 | ✅ 2× or better on every side |
| Links to the product page | — | §6 — sentinel, as instructed | ⚠️ by your instruction |

The 20px above the badge is `.foot-right`'s `gap: 1.25rem`, doing double duty as the clear space.

**On the black variant:** it is Apple's own file, unmodified — choosing between two supplied variants is
not an edit. On `bg-slate-900` the black badge's `#a6a6a6` border and white lettering read as a bordered
control; the white one read as a bright slab. **The white file stays in `public/badges/`** and the README
now records that black is live and white is held for a light footer.

---

## 4. The three widths, and what the collapse does

| | 1280px | 390px | 320px |
|---|---|---|---|
| Layout | 2-column row | **stacked column** | **stacked column** |
| Stacking order | brand ← → links / badge | **brand → links → badge** | **brand → links → badge** |
| Badge | right-aligned under links | **centred** | **centred** |
| Badge size | 40px, undistorted | same | same |
| Clear space above / below | 20.0 / 38.4 | 20.0 / 38.4 | 20.0 / 38.4 |
| Space either side of badge | — | 135.2px each | **100.2px each** |
| Footer height | 236.4 → **247.6** (+11.2) | 312.7 → **372.7** (+60) | 312.7 → **372.7** (+60) |
| Horizontal overflow | **none** | **none** | **none** |
| Two badges | fits, no wrap | fits, no wrap | **fits, no wrap** |

**The collapse happens at ≤720px**, where `.foot-grid` becomes a centred column and `.foot-right` switches
to `align-items: center`. The badge is **last in the stack** — brand, then links, then badge — which is
the right order: it is the newest and least essential item, and it sits directly above the legal rule.

### Is it cramped? — **No, and I looked as well as measured.**

At **320px** the badge has **100.2px of clear footer either side** and nothing overflows. The screenshot
shows a centred single column with even rhythm: wordmark, tagline, links row, badge, rule, legal lines.
**+60px on a footer that was already 312.7px** is a 19% increase, on a page 20,000px long.

**No options needed — nothing measured argues for hiding, shrinking or dropping it.** For completeness,
if you ever want it back: hiding below a breakpoint removes it from the phone-first audience that can
actually install the app, and shrinking is not available because **40px is Apple's minimum and the badge
is already at it**.

---

## 5. Does the middle position leave it stranded? — **Yes, and that is measured, not an opinion**

Answered at the top. **278.3px of empty footer on each side at 1280px**, against a badge 119.66px wide.
At 940px, 180.7px each side. Only by **760px** did the gaps (97.9px) start to look like a column rather
than a gap.

**Plainly: the middle position was worse than where it started.** In the brand column it was at least
anchored to something; in the middle it was anchored to nothing, in the widest, emptiest part of the
footer. **Under the links it is anchored to the links** — shared right edge, 20px below them — and that
is the version that is built.

---

## 6. The App Store URL — left invalid, as instructed

```ts
export const APP_STORE_URL = 'APP_STORE_URL_NOT_YET_SUPPLIED'
```

**Untouched.** Still deliberately invalid so it cannot ship looking correct. **This remains the one thing
blocking deploy.**

---

## 7. Protected strings and gates

**Verified by `git diff` — all return no changes:**

- `lib/plan-features.ts` — `'Online ordering — Pay at Hatch'` (`:185`) and the `'—'` cell value. **Untouched.**
- `lib/features.ts` — **untouched.**
- `app/landing/layout.tsx` — the admin gate. **Untouched.**
- The Pizzeria Gusto testimonial and the Gusto logo's `width={320} height={233}` — in
  `app/landing/page.tsx`, **not modified in this task**.

---

## Files changed

```
components/landing/LandingFooter.tsx   badge moved into a new .foot-right column, below .foot-links;
                                       src switched to the black variant; both changes documented in place
app/landing/landing.css                .foot-right added; .foot-apps back to shrink-to-content;
                                       mobile centring moved onto .foot-right
public/badges/README.md                records black as live, white as held, and why the Android
                                       switch no longer costs a rework
```

⚠️ **One correction worth recording:** my first attempt at this move broke the JSX nesting (an unclosed
`<div>`), caught by the compiler. I restored from a backup and rebuilt the change by explicit line ranges
rather than string matching. **No half-applied edit survives in the file** — the measurements above were
taken after the rebuild and re-taken after the final comment edits, and are identical.

**Nothing deployed. Nothing committed. No SQL, no migrations.**
