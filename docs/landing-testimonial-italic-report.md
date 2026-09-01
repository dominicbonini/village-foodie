# The testimonial — italics restored, and the role line lifted

**Workstream:** landing-page — italics back, and the role line
**Date:** 29 August 2026
**Deploys:** frozen. Nothing deployed, no migration run, no column dropped, no domain removed from Vercel, no credential added.
**Read first:** `docs/landing-testimonial-style-report.md` — which records the italic removal this reverses.

🔴 **THE GATE AND THE `noindex` ARE UNTOUCHED.** `app/landing/layout.tsx` is **byte-identical** (`cmp -s`), and `robots: { index: false, follow: false }` is unchanged on line 48.

✅ **NO STOP CONDITION WAS REACHED.** Item 1 said to stop if "villages." strands at any width. **It does not strand at any of the eight widths** — measurements in §2.

---

## 1. What changed — two declaration lines

**`app/landing/page.tsx` is byte-identical.** The quote's words, the logo, the names, the award and the quote mark are all markup, and none of it was touched. Only `landing.css` changed, and within it only two declarations:

```diff
-.hg-landing blockquote  { … font-weight: 400; font-style: normal; font-size: clamp(1.25rem,2.3vw,1.45rem); line-height: 1.6; … }
+.hg-landing blockquote  { … font-weight: 400; font-style: italic; font-size: clamp(1.25rem,2.3vw,1.45rem); line-height: 1.6; … }

-.hg-landing .quote-role { … font-weight: 600; color: var(--ink-faint); font-size: .8rem; … }
+.hg-landing .quote-role { … font-weight: 400; color: var(--head);      font-size: .8rem; … }
```

**Everything else from the last change stands** — weight 400, the same clamp, the 46rem measure, the 1.6 line height. Only `font-style` moved.

**Every other rule in the block is byte-identical**, checked rule by rule:

```
✅ .quote-name   ✅ .quote-cred   ✅ .cred-title   ✅ .cred-scope   ✅ .quote-cred svg
✅ .quote-mark   ✅ .quote-in     ✅ .quote-by     ✅ .quote-logo   ✅ .quote-who   ✅ .quote-sec
```

### Why the reversal, recorded in the stylesheet

The rule's previous note argued the 3.4rem orange quote mark already said "speech", so the italic was saying it twice. **Observed in place, the mark alone did not carry it:** at weight 400 upright, 46rem wide and centred, the paragraph read as body copy that happened to sit under a decorative glyph. The mark is a flourish *above* the block; the italic is a property *of* the text, and only the second travels with the words. **The earlier reasoning was sound and the observation beat it** — the comment now says so rather than being quietly deleted.

---

## 2. Line counts at all eight widths

🔴 **Re-measured, not assumed** — each character's rendered `top` was read back to group the text into real line boxes.

| Width | Size | Lines | Last line | |
|---|---|---|---|---|
| desktop 1440 | 23.2px | **3** | 10 words | ✅ |
| laptop 1280 | 23.2px | **3** | 10 words | ✅ |
| tablet 1024 | 23.2px | **3** | 10 words | ✅ |
| tablet 768 | 20px | **3** | 6 words | ✅ |
| phone 430 | 20px | 5 | 4 words | ✅ |
| phone 390 | 20px | 5 | 6 words | ✅ |
| phone 360 | 20px | 6 | 2 words | ✅ |
| phone 320 | 20px | 7 | 2 words | ✅ |

**✅ NO STRANDING AT ANY OF THE EIGHT WIDTHS.** The three even lines survive the switch:

```
1. HatchGrab has made ordering so much easier. Everything's organised,
2. we can track stock and know exactly how many pizzas we have left to sell
3. — and the time slots are fantastic for busy villages.
```

⚠️ **The line breaks are identical to the upright version at every width** — the switch changed the letterforms and not a single break point.

🔴 **AND THAT WAS NOT SAFE TO ASSUME, FOR THE OPPOSITE REASON TO THE ONE I FIRST WROTE.** I had written into the stylesheet that Archivo's italic is *narrower* than its roman. **Measured, it is WIDER** — 478.17px against 473.77px for the same 42-character string at 23.2px, about **0.9%**. The breaks survived with enough slack to absorb that; had the margin been tighter they would not have. **The comment has been corrected to the measured direction.**

---

## 3. The italic is the real drawn face, not a synthesised slant

Three independent checks:

```
loaded faces for family "Archivo":
  style=italic  weight=100 900  status=loaded      ← a real variable italic face
  style=normal  weight=100 900  status=loaded

document.fonts.check("italic 400 23px Archivo") : true
```

**And the definitive test — the same string measured three ways:**

```
upright                    : 473.77px
italic                     : 478.17px
italic, synthesis DISABLED : 478.17px
```

**Disabling `font-synthesis` changes nothing.** If the browser were faking the slant, switching synthesis off would have fallen back to upright and the width would have collapsed to 473.77px. It did not, so the slant comes from a drawn face.

⚠️ **`app/landing/page.tsx` still loads Archivo with `style: ['normal','italic']`** — unchanged, and the stylesheet warns against dropping `'italic'` from that call, which `.quote-mark` also depends on.

---

## 4. The role line

**Chosen: `color: var(--head)` (`#16314f`), `font-weight: 400`.** Size unchanged at `.8rem`.

Measured in a browser:

```
line                     size      weight  colour
Nadia & Bogdan           16px      800     #16314f
Owners, Pizzeria Gusto   12.8px    400     #16314f     ← was #9aafc4 / 600
Mobile Pizzeria of…      12.48px   700     #ef8b2c
Regional winner          10.88px   600     #9aafc4

role colour == name colour : ✅ yes (#16314f)
role weight <  name weight : ✅ yes (400 vs 800)
```

**The separation is now weight and size, not colour.** Against the names' 800/1rem it sits at 400/.8rem in the same navy, so it reads as the same voice one step down rather than as a caption in a different ink. 🔴 **Dropping the weight is what stops the added contrast from shouting** — raising the colour without lowering the weight would have made it compete with the names.

**400 and not 500**, for the reason this stylesheet already records: the page writes 600, 700 and 800, plus 400 as its implicit body weight. **500 would be an orphan step; 400 is not.**

⚠️ **THE NAMES AND THE AWARD ARE UNCHANGED AND SO IS THEIR ORDER** — `.quote-name`, `.cred-title`, `.cred-scope` and `.quote-cred` are byte-identical rules, and `page.tsx` is byte-identical, so the markup order cannot have moved.

⚠️ **ONE OBSERVATION, OUT OF SCOPE AND NOT ACTED ON.** The complaint that started this — the faintest thing in the stack sitting under bolder things — now applies to **"Regional winner"**, which is `#9aafc4` at 10.88px and is the quietest line remaining. The brief said not to change the award, so I did not. Flagged in case you want it looked at.

---

## 5. Verification

I performed **parse**, **typecheck** and **execution**. All three, in those words.

**Parse.** Every edit was applied by anchored, asserted replacement, each asserting its anchor occurs exactly once before writing.

**Typecheck.** `npx tsc --noEmit` — clean.

**Execution.** The page was loaded in a real browser at eight viewport widths; line boxes, computed styles, font faces, glyph widths and codepoints were all read from the live DOM.

### The quote's text is unchanged, character for character

```
"HatchGrab has made ordering so much easier. Everything's organised, we can track stock and
 know exactly how many pizzas we have left to sell — and the time slots are fantastic for
 busy villages."

identical to the recorded text: ✅ YES     lengths 194 / 194
```

Every non-alphanumeric, non-space character — the same table as the two previous reports:

| index | codepoint | char |
|---|---|---|
| 42 | `U+002E` | `.` |
| 54 | `U+0027` | `'` — still the straight apostrophe |
| 66 | `U+002C` | `,` |
| 141 | `U+2014` | `—` |
| 193 | `U+002E` | `.` |

### No part of the quote is styled differently

```
child elements inside blockquote : 0  []          ✅ pure text
node types                       : [3]            (one text node)
distinct computed styles         : 1              ✅
  400 | italic | 23.2px | rgb(22,49,79) | none | rgba(0,0,0,0) | Archivo
```

**One text node, zero child elements, one computed style across every character.** There is no element inside the blockquote that could carry different styling, and no `::first-line`, `::first-letter` or descendant rule targets it.

### Scope

```
✅ app/landing/layout.tsx — BYTE-IDENTICAL   (the admin gate)
✅ app/landing/page.tsx   — BYTE-IDENTICAL   (quote words, logo, names, award, quote mark)
   robots: { index: false, follow: false }   unchanged, line 48
   app/landing/landing.css — two declaration lines; every other change is comment
```

---

## 6. What remains unobserved

1. **No real device.** Headless Chromium at set viewports; a physical phone may break a line one word differently, and italic is the case where that is most likely.
2. **Only Chromium.** Safari and Firefox round sub-pixel widths differently. **The desktop three-line result has the most margin** — 10 words on the last line — but 768px sits closer to a break boundary now that the face is 0.9% wider.
3. **No production build.** Measured against the dev server.
4. **Written permission to publish the testimonial is still recorded nowhere**, which is why the gate stays on.

---

**No span of this prompt arrived garbled, and no instruction contradicted another.** Item 1's stop condition was live throughout and was not met: no width strands a word, so no size was adjusted to compensate and no decision was taken on your behalf.
