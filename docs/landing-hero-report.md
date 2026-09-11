# Mobile landing hero and header — final polish

Mobile only (below 640px). Desktop, tablet, the grey trust band, /compare and the contact page are
unchanged — proved below, not assumed. No `next dev`, no `next build`, no deploy.

Nothing in the brief arrived garbled and no instruction contradicted another.

---

# STEP 0 · WHY THE REPLICA AND SAFARI DISAGREED

## The cause: the phone is not 390px wide. It is about 430px.

**The replica was measuring the right page at the wrong width.** Its font, font size, weight, tracking,
gutters and text column were all correct; the only wrong input was the viewport.

🧪 The H1's two candidate first lines, measured at 32px/800 in the replica:

| tracking | "The ordering system built" | needs a text column of | i.e. a viewport of |
|---|---|---|---|
| `-.03em` (before the 11 Sep change) | **379.7px** | ≥ 379.7px | **≥ 420px** |
| `-.015em` (after it) | **391.7px** | ≥ 391.7px | **≥ 432px** |

So there is a window — **viewport 420px to 431px** — in which the *old* tracking fits "built" on line 1
and the *new* tracking does not. That is exactly the pair of observations reported from the phone.
🧪 Driven through the replica at a range of widths, it reproduces both:

```
  390px  -.03em  → "The ordering system" / "built for food trucks."
  390px  -.015em → "The ordering system" / "built for food trucks."
  420px  -.03em  → "The ordering system built" / "for food trucks."   ← what Safari showed BEFORE
  420px  -.015em → "The ordering system" / "built for food trucks."   ← what Safari shows NOW
  430px  -.03em  → "The ordering system built" / "for food trucks."   ← BEFORE
  430px  -.015em → "The ordering system" / "built for food trucks."   ← NOW
  440px  -.03em  → "The ordering system built" / "for food trucks."
  440px  -.015em → "The ordering system built" / "for food trucks."   (both fit — outside the window)
```

**430px is the CSS width Safari reports for the iPhone Plus and Pro Max sizes** (14 Plus / 14 Pro Max /
15 Plus / 16 Plus). It sits inside the window; 390px (iPhone 12–16 base) and 393px (Pro) do not, and 440px
(16 Pro Max) is outside it in the other direction.

## What it was NOT — the candidates I ruled out by measurement

| candidate | ruled out because |
|---|---|
| **Font loading / wrong font file** | 🧪 The replica's woff2 was parsed: its table directory contains **`fvar`, `gvar`, `avar`, `HVAR`, `STAT`** — it is the genuine **variable** Archivo, so the 800 weight is a real instance and not synthetic bold (which would have rendered wider and broken earlier) |
| **Text column width / gutters** | 🧪 `--gut` resolves to `clamp(1.25rem, 4vw, 2.5rem)` → 20px each side below 500px, giving a 350px column at 390px. The replica measured exactly that |
| **font-size clamp** | 🧪 `clamp(2rem, 4.3vw, 3rem)` resolves to **32px** at every width below 640px, in the replica and by arithmetic. Not a variable |
| **Root font size / viewport meta** | 🧪 Root is 16px; the harness carries the same `width=device-width, initial-scale=1` meta as the app |

**This raises my confidence in the harness rather than lowering it.** It did not mispredict; it answered a
question about 390px that was then compared against a ~430px screen.

## Confidence in each measurement below

| measurement | confidence | why |
|---|---|---|
| Spacing: hero padding, H1→sub gap, sub→button gap | **Very high** | Pure CSS box geometry. No font metrics involved, so the width question cannot touch it |
| Colour and contrast ratios | **Very high** | Arithmetic on the hex value, plus the computed `color` read back from the rendered element |
| "Log in" position in each header state | **Very high** | Box geometry again, read from the live rects in both states |
| Desktop/tablet unchanged | **Very high** | Element-by-element diff of two rendered pages |
| **Supporting-line breaks at each width** | **High, not certain** | Depends on font metrics. The replica is now *validated* against reality — it reproduces both real-Safari H1 observations once the width is right — but a text-fit prediction is still the one class of number here that a rendering difference could move. Slack is quoted with every one so you can judge the margin |

⚠️ **What would confirm the 430px inference outright:** opening the page on that phone and reading
`window.innerWidth`. I have inferred the width from behaviour rather than observed it.

---

# THE CHANGES

## Files changed

| file | why |
|---|---|
| `app/landing/landing.css` | items 1, 2 (CSS deletion), 3 |
| `app/landing/page.tsx` | item 2 (copy + deletion), and passes the new nav prop |
| `components/landing/LandingNav.tsx` | **item 4 — flagged below, it genuinely needs it** |

**🔴 Why item 4 needed `LandingNav.tsx`.** "Log in" must sit flush right with the CTA to its **left**, and
the DOM order is currently `Log in` then CTA. A CSS `order:` on the flex row would have achieved the
visual result **without touching this file** — and would have left the DOM reading "Log in, Upload menu"
while the eye reads "Upload menu, Log in". The brief asks for reading order and visual order to match, so
the **elements** had to move, not their painted order. The prop is `ctaFirst`, it defaults to `false`
(today's behaviour exactly), and **only `app/landing/page.tsx` passes it** — /compare calls
`<LandingNav landingHref="/landing" />` with no prop and is untouched.

## 1 · Space around the H1

| | before | after |
|---|---|---|
| hero `padding-block` (top) | `1.6rem` = **25.6px** | `2.5rem` = **40px** |
| 🧪 measured nav bottom → H1 top | **25.59px** | **40.00px** (**+14.41px**) |
| 🧪 measured H1 bottom → supporting line top | **16.00px** | **20.00px** |
| 🧪 supporting line → button | 17.59px | **17.59px — unchanged**, as required |

⚠️ **Deviation, small and deliberate:** the brief said "about 14px". `2.5rem` is **+14.4px** rather than
exactly 14; a literal 14px would be `2.475rem`, an odd value to leave in the file for 0.4px. The hero's
**bottom** padding is untouched at `2rem`.

## 2 · Supporting line copy, and the note removed

New copy, with the break written into the markup:

> Upload your menu, no signup needed.
> See a working demo in under 60 seconds.

🧪 **Where each line breaks** (16px Public Sans 400; slack against the text column in brackets):

| viewport | column | line 1 | line 2 |
|---|---|---|---|
| **320px** | 280px | one line, 277.4px **[2.6px]** | **wraps to two** — the accepted outcome |
| **360px** | 320px | one line, 277.4px **[42.6px]** | one line, 307.5px **[12.5px]** |
| **375px** | 335px | one line **[57.6px]** | one line **[27.5px]** |
| **390px** | 350px | one line **[72.6px]** | one line **[87.5px on the wider column]** |
| 430px (the real phone) | 390px | one line | one line |

Both lines fit at 360px, so there was nothing to stop for and nothing was shrunk. ⚠️ **Line 1 has only
2.6px of slack at 320px** — it is one character from wrapping there, which is inside the width the brief
allows to wrap anyway.

**The line under the button is gone entirely:** the `<p class="hero-note-sm">` in `page.tsx`, the
`.hero-note-sm` base rule, its `display:block` in the media block and its comment block are all deleted.
🧪 grep finds **no remaining `hero-note-sm`** in the stylesheet or the markup. Nothing replaces it. The
trust-strip comment that quoted the deleted sentence was updated so it does not describe absent copy.

## 3 · Supporting line colour

| | value | contrast on white |
|---|---|---|
| before | `#4A627F` | 6.28:1 |
| **after** | **`#3E5472`** | **7.73:1** |
| `--ink` (body copy) for comparison | `#2C4766` | 9.54:1 |

Inside the 7.5–8:1 target and still clearly lighter than the body colour. 🧪 The rendered element reports
`rgb(62, 84, 114)`, which is `#3E5472`. It was changed **on the hero-scoped `--hero-grey`**, so it moved
in one place; `--ink-soft` and every other shared token are untouched.

## 4 · Header "Log in"

🧪 Measured at 390px, with the content's right edge at **370.00px**:

| state | "Log in" right edge | CTA right edge | CTA visibility |
|---|---|---|---|
| hidden | **370.00** | 312.41 | `hidden` |
| revealed | **370.00** | 312.41 | `visible` |
| mid-transition | **370.00** | 312.41 | interpolating opacity only |

- **"Log in" is flush with the content edge** — 370.00 against 370.00, not near it.
- **It does not move between states**, because the CTA keeps its box in both (`visibility`, never
  `display`) and the reveal's only movement is `transform: translateX(6px)`, which is applied at paint
  time and never participates in layout. Mid-transition is therefore the same measurement by
  construction, not by sampling.
- The reveal mechanism, the 320ms in / 200ms out split, the transform-only slide and the reduced-motion
  rule are **untouched** — no rule in that block was edited.

**Reading order chosen: logo → Upload menu → Log in.** 🧪 The DOM order of the visible items and their
left-to-right visual order are both `Upload my menu → Log in`, and the harness asserts they are equal. The
CTA is defined once in `LandingNav` and rendered by whichever branch `ctaFirst` picks, so the two orders
cannot drift apart.

---

# CHECKS

**`npx tsc --noEmit` exits 0.** **Lint is unchanged:** `app/landing/page.tsx` and
`components/landing/LandingNav.tsx` report **2 warnings before and 2 after** — `TablePlan` and
`DETAIL_OVERRIDES`, both pre-existing and unrelated; the baseline was measured by restoring the committed
files, linting them, and putting mine back.

**Desktop and tablet, before vs after, every element compared:**

| width | result |
|---|---|
| 640px | ✅ identical |
| 768px | ✅ identical |
| 1024px | ✅ identical |
| 1280px | ✅ identical |
| 1440px | ✅ identical |

The only entry that differs at those widths is the deleted note — `display:none` before, absent after —
and neither generates a box, so the layout is unchanged. Position, size, font size, tracking, colour and
margin of every other element match exactly, the header CTA and the trust strip included.

**The contact page's shape** (`.hg-landing` wrapper, an `<h1>` outside any `.hero`, the shared nav)
🧪 renders **identically** before and after at 320, 360, 390, 414, 639, 768 and 1280px.

**/compare** 🧪 passes no `ctaFirst` (grep: 0 occurrences in `app/compare/page.tsx`), so its nav keeps
today's DOM order, and it renders no element carrying a `hero` class, so none of the hero-scoped rules can
match it.

**The grey trust band:** byte-identical above 639px. On mobile its own box is unchanged (360×160 at 360px,
390×135.7 at 390px, same content, same styling) and it starts **12.7px higher**, because the hero is net
shorter: +14.4px of top padding and +4px of heading gap, less the 17.5px note and the 13.6px row gap that
went with it.

# UNSURE ABOUT, OR DEVIATED ON

1. **The 430px inference is behavioural, not observed.** It explains both Safari observations exactly and
   nothing else I tested does, but I have not read the device's `innerWidth`.
2. **`+14.4px`, not `+14px`** — a round `2.5rem` in preference to `2.475rem`.
3. **Line 1 has 2.6px of slack at 320px.** It fits, and 320px is a width the brief allows to wrap, but it
   is the tightest number in this report.
4. **`LandingNav.tsx` was edited**, which the brief permitted conditionally. The reason is in §Files
   changed: a CSS-only fix would have broken the DOM/visual order match the brief asks for.
5. I did not touch the reveal's timings, trigger, transform or reduced-motion rule, and did not re-verify
   the IntersectionObserver trigger point — it was out of scope and no rule it depends on was edited.
