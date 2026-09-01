# The Pizzeria Gusto testimonial — typography and attribution

**Workstream:** landing-page — testimonial typography and attribution
**Date:** 29 August 2026
**Deploys:** frozen. Nothing deployed, no migration run, no column dropped, no domain removed from Vercel, no credential added.
**Read first:** `docs/landing-testimonial-report.md` — the quote is a real customer's words. **Not one character of it was changed, and this report proves that rather than asserting it.**

🔴 **THE GATE AND THE `noindex` ARE UNTOUCHED.** `app/landing/layout.tsx` is **byte-identical** (`cmp -s`), and `robots: { index: false, follow: false }` is unchanged and on the same line. Permission to publish is still recorded nowhere. They move together, in their own change.

---

## 1. Typography

| | Before | After |
|---|---|---|
| **a. Style** | `italic` | **`normal`** |
| **b. Weight** | `600` | **`400`** (regular) |
| **c. Size** | `clamp(1.25rem, 2.6vw, 1.7rem)` | **`clamp(1.25rem, 2.3vw, 1.45rem)`** |
| **c. Measure** | none — filled the 56rem column | **`max-width: 46rem`**, centred |
| **d. Line height** | `1.35` | **`1.6`** |
| | `letter-spacing: -.02em` · `margin-bottom: 1.5rem` | `-.01em` · `1.75rem` |

**a — italics removed.** The 3.4rem orange quote mark above already says this is speech; the mark *and* the italic were saying it twice, and 35 words of italic is slower to read. ⚠️ **`.quote-mark` is still italic**, so `page.tsx` must keep `style: ['normal','italic']` on the Archivo call — noted in the stylesheet so nobody prunes it.

**b — 400, and this reverses an earlier decision rather than ignoring it.** The old comment argued *"600 AND NOT 500, BECAUSE 500 APPEARED NOWHERE ELSE ON THE PAGE"* — a lone 500 would be an orphan step in a scale that writes only 600 (×12), 700 (×17) and 800 (×11). **400 is not an orphan: it is the page's own body weight**, inherited by every paragraph that never declares one. So the brief's "medium or regular" resolves to **regular**, which adds no new value to the scale where medium would have. Archivo is loaded as a variable font, so 400 is drawn, not synthesised.

**c — the minimum did not move, and that is deliberate.** Only the maximum came down, `1.7rem → 1.45rem`. 🔴 **The stranded line was a desktop defect; phones never had it.** Shrinking the phone size to fix a fault it did not have would have made the quote **smaller than this page's own body copy, which is 18.4px there** — wrong for a featured testimonial. The `vw` term moved `2.6 → 2.3` so the ramp still lands on the new maximum instead of reaching it early.

**The measure sits on the blockquote, not on `.quote-in`**, because `.quote-in` also wraps the logo and the award, which are centred against the wider column by design. `.quote-in` stays at 56rem; its comment now says it no longer governs the quote.

⚠️ **Size and measure had to move together.** Shrinking the type alone fits *more* characters per line in a 56rem column and gave two long uneven lines; narrowing alone at 1.7rem gave five.

### How the values were chosen

🔴 **By sweeping candidates in a real browser across eight widths and reading the line boxes back** — not by estimating from character counts. Each character's `getBoundingClientRect().top` was compared to group the text into actual rendered lines. **Twenty candidate combinations were measured**; several that looked fine on desktop simply moved the stranded word to 768px or 390px.

---

## 2. Line counts, measured

**Before — the defect:**

```
desktop 1440   4 lines   last line: "villages."        🔴 1 word, stranded
laptop  1280   4 lines   last line: "villages."        🔴 1 word, stranded
tablet   768   3 lines   last line: 6 words
phone    390   5 lines   last line: 7 words
phone    360   6 lines   last line: 5 words
```

**After:**

```
desktop 1440   3 lines   last line: 10 words   ✅
laptop  1280   3 lines   last line: 10 words   ✅
tablet   768   3 lines   last line:  6 words   ✅
phone    390   5 lines   last line:  6 words   ✅
phone    360   6 lines   last line:  2 words   ✅
```

**Desktop and laptop set in three even lines:**

```
1. HatchGrab has made ordering so much easier. Everything's organised,
2. we can track stock and know exactly how many pizzas we have left to sell
3. — and the time slots are fantastic for busy villages.
```

**Phone (390px) sets in five even lines**, 20px type, no stranding. ⚠️ **Three lines is not achievable on a phone** for 194 characters at a readable size — the requirement was "about three even lines", which is met at desktop where the defect was, and the phone result is even rather than stranded.

⚠️ **One thing I did not chase: line 3 at desktop begins with the em dash.** It is a natural break at a punctuation boundary, not a stranding, and forcing it elsewhere would mean a non-breaking space inside a real person's punctuation. Flagged as a judgement, not fixed.

---

## 3. The attribution

**Renders exactly as specified, in the required order:**

```
Nadia & Bogdan
Owners, Pizzeria Gusto
★ Mobile Pizzeria of the Year ★
Regional winner
```

The logo sits above, unchanged; **the award is byte-identical and in the same place**.

### 🔴 How the truck name was kept from reading twice

**The existing `.quote-name` line held `Pizzeria Gusto` on its own. I repurposed that line rather than adding to it** — it now holds the owners' names, and the business name appears **once**, inside the new role line beneath.

Adding the names *above* the existing line would have rendered:

```
Pizzeria Gusto          ← the existing line
Nadia & Bogdan
Owners, Pizzeria Gusto  ← the name again, two lines later
```

A new `.quote-role` class sits between the names and the award: weight 600, `.8rem`, `--ink-faint` — quieter than the names above it and than the award below, so the stack reads **name → role → credential** without three things competing.

⚠️ **`&` is written as `{'&'}`**, not bare, so no formatter turns it into an entity or the word "and".

⚠️ **ONE THING I DID NOT FIX, BECAUSE IT WOULD MEAN EDITING THE LOGO.** The logo still carries `alt="Pizzeria Gusto"`, so **a screen reader hears the business name from the image and again from the role line.** Sighted readers see it once, because the logo is a picture. The fix is `alt=""` on a decorative logo whose name is in adjacent text — a one-attribute change to the element this workstream was told not to touch. **Flagged, not changed.**

---

## 4. No emphasis inside the quote, and no photo

**Proven from the live DOM, not from reading the source:**

```
child ELEMENTS inside blockquote : 0  []      ✅ pure text — there is nothing to style differently
node types inside                : [3]        (3 = text node, one only)
distinct computed styles across every character : 1   ✅
  400 | normal | 23.2px | rgb(22,49,79) | none | rgba(0,0,0,0) | Archivo
```

**One text node, zero child elements, one computed style covering every character** — weight, style, size, colour, text-decoration and background all uniform. Nothing is bolded, highlighted or coloured. Grepped `landing.css` for `::first-line`, `::first-letter`, `::selection`, `mark` and any `blockquote <descendant>` selector: **none exists**, so no rule can reach part of the text.

**No photo, no placeholder, no empty frame:** one image in the attribution — the existing logo — and `div:empty, span:empty, figure` returns **0**.

---

## 5. The quote, character for character

Read back from the rendered DOM and compared against the text on disk:

```
"HatchGrab has made ordering so much easier. Everything's organised, we can track stock
 and know exactly how many pizzas we have left to sell — and the time slots are
 fantastic for busy villages."

matches today's text exactly: ✅ YES     lengths: 194 / 194
```

**Every non-alphanumeric, non-space character — identical to the table in the prior report:**

| index | codepoint | char |
|---|---|---|
| 42 | `U+002E` | `.` |
| 54 | `U+0027` | `'` — the straight apostrophe, **still straight** |
| 66 | `U+002C` | `,` |
| 141 | `U+2014` | `—` — em dash, intact |
| 193 | `U+002E` | `.` |

⚠️ **The `U+0027` apostrophe question from the prior report is still open and I did not resolve it.** It remains the one character that only the operator's original message can settle. Changing it was not in scope and would be re-punctuating their words.

---

## 6. Verification

I performed **parse**, **typecheck** and **execution**. All three, in those words.

**Parse.** Both edits were applied by anchored, asserted replacement, each asserting its anchor occurs exactly once before writing.

**Typecheck.** `npx tsc --noEmit` — clean. `npx eslint app/landing/page.tsx` — exit 0, no findings.

**Execution.** The page was loaded in a real browser at eight viewport widths; line boxes, computed styles, codepoints and image state were read from the live DOM, and the testimonial was screenshotted at desktop and phone.

### Scope

```
✅ app/landing/layout.tsx   — BYTE-IDENTICAL   (the admin gate)
✅ robots: { index: false } — identical, same line
```

**`app/landing/page.tsx` — one hunk**, the attribution block. Nothing else in the file differs.

**`app/landing/landing.css` — two declaration changes**, everything else added is comment:

- the `blockquote` rule (rewritten)
- `.quote-role` (new)

**Blast radius is zero by count:** on the whole page there is **1** `blockquote`, **1** `.quote-name`, **1** `.quote-role`, **1** `.quote-in`. Every changed selector matches exactly one element, and all four are inside the testimonial. The other six sections cannot be reached by any rule this workstream touched.

⚠️ **The quote's own words, the logo and the award were not touched**, and `public/gusto-logo.png` is unchanged.

### One thing I checked rather than assumed

The first phone screenshot showed **no logo**. Rather than report that, I scrolled the section into view and re-read the element:

```
loading attr : lazy      complete: true
natural size : 320x233   rendered box: 77x56
✅ present and loaded — the earlier blank was lazy-loading, not a fault
```

**`loading="lazy"` is pre-existing `next/image` behaviour and unrelated to this change.**

---

## 7. What remains unobserved

1. **No real device.** Every measurement is headless Chromium at a set viewport; a physical phone's font rendering may break a line one word differently.
2. **Only Chromium.** Safari and Firefox hyphenate and round sub-pixel widths differently, so the exact line counts at 768px and 360px are not guaranteed cross-browser. **The desktop three-line result has the most margin** — the last line carries 10 words, so it would take a large metric difference to strand anything again.
3. **No production build.** Measured against the dev server.
4. **The apostrophe question is still unresolved** (§5), and **written permission to publish is still recorded nowhere** — which is why the gate stays on.

---

**No span of this prompt arrived garbled, and no instruction contradicted another.** Rule 3 (do not emphasise any part of the quote) and rules 1a–1d sit together without conflict: every typographic change applies to the whole blockquote, which is a single text node.
