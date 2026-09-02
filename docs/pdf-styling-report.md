# PDF — column alignment, wordmark, and brand colour

**Built. Not deployed, not committed. No SQL, no migrations. One file changed:
`app/landing/features-pdf/route.ts`.**

**GARBLED SPANS: none.** ⚠️ **One premise in item 6 is not quite right and I did not stop for it** — the
brief's *intent* is unambiguous and I followed it. See §6.

**VERIFICATION.** Not a typecheck. I **measured the defect before changing anything**, **measured it
again after**, and **opened both pages plus a greyscale render**.

---

## PART ONE — the alignment defect

### 1. The cause — read, then measured

**Three things in the CSS, and the first is the bug:**

```css
table { width: 100%; border-collapse: collapse; }        /* no table-layout -> "auto" */
th, td { text-align: left; vertical-align: top; … }      /* 🔴 this applies to TH */
td.f { width: 40%; }
td.c { width: 15%; text-align: center; }                 /* 🔴 centres only the BODY */
```

| Question you asked | Answer |
|---|---|
| Separate tables for header and body? | **No** — one `<table>`, a real `<thead>` |
| Column widths set? | **On `td` only.** The `th` cells had **no width at all** |
| Header cells carrying the body's alignment? | 🔴 **No — the opposite.** `th` inherited `text-align: left` from the shared rule; `td.c` overrode to `center` for body cells only |
| `table-layout` fixed or auto? | **auto** — `table-layout` appeared **zero** times in the file |

**So every plan name sat at the left edge of its column while the tick beneath it sat at the centre.**

🔴 **And that explains the uneven offset you noticed.** With left-aligned text, the *centre* of the word
depends on how long the word is — so the gap to the centred tick differs per column. Measured before any
change:

| Plan | Header ink-centre | Tick ink-centre | **Offset** |
|---|---|---|---|
| Trial | 337.0 | 380.0 | **−43.0px** |
| Starter | 464.0 | 500.0 | **−36.0px** |
| Pro | 575.1 | 620.0 | **−44.9px** |
| Max | 697.1 | 740.0 | **−42.9px** |

*"Starter"* is the longest word, so its centre sits furthest right and its offset is the smallest — the
uneven pattern is the symptom of exactly this cause.

### 🔴 A measurement trap I fell into first, and it matters

My first pass measured each header's **bounding box** and reported **0px offset on all four columns** —
apparently no defect at all. **That measurement was worthless:** `.th-plan` is a block `<div>`, so its
box always spans the full cell and its centre matches the column's by definition. **It measures the box,
not the ink.**

Every figure above and below uses a **`Range` over the text node**, which gives where the glyphs actually
are. **Had I trusted the first number I would have told you there was nothing wrong.**

### 2. The fix

```css
/* table-layout: fixed is half of it — with "auto" the browser sizes columns from CONTENT and the width
   declarations are hints it may ignore, so header and body could resolve to different grids. */
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
th, td { vertical-align: top; padding: 5px 6px; }     /* text-align REMOVED from the shared rule */
th.f, td.f { width: 40%; text-align: left; }
th.c, td.c { width: 15%; text-align: center; }
```

The header cells now carry the same column classes as the body (`<th class="c">`, and `class="f"` on the
leading empty cell), so **alignment is declared per column and shared** — a header and its cells can no
longer disagree.

**MEASURED after the fix, same ink-centre method:**

| Plan | Offset |
|---|---|
| Trial | **0px** |
| Starter | **0px** |
| Pro | **0px** |
| Max | **0px** |

Computed styles confirm it: `table-layout = fixed`, `th.c text-align = center`, `td.c text-align = center`.

### 3. Page 2

✅ **The header repeats and is correctly centred there too** — confirmed by opening the rendered page 2.
`thead { display: table-header-group }` is unchanged, and because the fix is on the shared column classes
rather than on a one-off rule, the repeated header inherits it by construction. The greyscale render
(§7) shows the same alignment on both pages.

---

## PART TWO — the wordmark

### 4. The asset

**`public/logos/hatchgrab-wordmark.svg`**, reached through **`HATCHGRAB_WORDMARK_SVG`** from
`lib/brand.ts` — the same constant every other surface uses, not a typed-out path.

🔴 **Inlined as a base64 data URI, and it has to be.** This document is produced with
`page.setContent()`, not by navigating to our own origin, so the page has **no base URL**:
`src="/logos/…"` would resolve to nothing and the header would render empty. The file is read from
`process.cwd()/public` at request time. A read failure logs and renders the header **without** the
wordmark rather than failing the whole document — the table is the point.

### 5. The 4.548:1 ratio and the variant

`lib/brand.ts:26-29` records it: artwork tight-cropped to `viewBox "21 39 1287 283"`, and *"EVERY
hardcoded width/height PAIR must use 4.548:1 — a stale pair letterboxes or squashes."*

**The pair I used: `width 136.44 × height 30`.**

- **136.44 ÷ 30 = 4.548** exactly.
- It is **derived, not typed**: `const WORDMARK_W = +(WORDMARK_H * 4.548).toFixed(2)`, so the pair cannot
  go stale — change the height and the width follows.
- **MEASURED as rendered: 136.44 × 30, ratio 4.548:1.**
- I verified the source independently: both SVGs carry `viewBox="21 39 1287 283"` → **1287/283 = 4.548**.

**Variant: the DARK one (`hatchgrab-wordmark.svg`), because the document is white.** Confirmed by reading
the fills in each file:

| File | Fills | For |
|---|---|---|
| `hatchgrab-wordmark.svg` | `#16314F` + `#EF8B2C` | ✅ **light backgrounds — used here** |
| `hatchgrab-wordmark-white.svg` | `#FFFFFF` + `#EF8B2C` | dark backgrounds — would render invisible here |

🟢 Worth recording: the dark variant's navy is **`#16314F`, exactly `HATCHGRAB_NAVY_HEX`** — the artwork
and the constant agree, which is what `lib/brand.ts` means by *"THE AUTHORITATIVE SOURCE IS THE ARTWORK"*.

It sits **beside the title**, with the title shortened from *"HatchGrab — plans and features"* to
**"Plans and features"** — the wordmark now says who it is, and repeating the name beside its own logo
was redundant.

---

## PART THREE — colour

### 6. The constants I imported

```ts
import { HATCHGRAB_NAVY_HEX, HATCHGRAB_ORANGE_HEX, HATCHGRAB_WORDMARK_SVG } from '@/lib/brand'
```

**Nothing was copied out of `landing.css`.** The two hexes are interpolated into a `:root` block as
`--navy` and `--orange`, and used for: the `h1`, the `thead` bottom border, the group-row labels, the
`.allow`/`.fn` headings (navy), and the single rule under the document head (orange).

### 🔴 The correction to item 6's premise

You wrote that *"HEADER_BG in lib/brand.ts is the single source for brand navy."* **It is not, and it
cannot be used here:**

```ts
export const HEADER_BG = 'bg-slate-900'   // AppHeader — all operator headers
```

**`HEADER_BG` is a Tailwind class string, not a colour.** There is no stylesheet in this document to
resolve it against, so it has no meaning in a standalone PDF.

🟢 **The file anticipates exactly this case and answers it.** `lib/brand.ts:41-44`, read verbatim:

> *"⚠️ THIS IS A HEX, AND EVERYTHING ELSE IN THIS FILE'S COLOUR SECTION IS A TAILWIND CLASS STRING… for
> EMAIL templates. The `_HEX` suffix marks the difference so nobody drops it into a className."*

**A PDF is the same kind of consumer as an email template**, so `HATCHGRAB_NAVY_HEX` and
`HATCHGRAB_ORANGE_HEX` are the correct imports. **Your intent — take brand colour from `lib/brand.ts`,
never from the stylesheet — is met exactly; only the constant name in the brief was off.** That is why I
did not stop.

⚠️ One thing to know: `lib/brand.ts:39` says of the navy *"defined here for reference only; nothing uses
it yet."* **This PDF is now its first consumer**, so that comment is out of date. It is in a file item 10
does not forbid, but it is not this task's business — flagging rather than editing.

### 7. Greyscale — what carries the meaning

**Nothing on this page depends on colour to be understood, and I checked by rendering it in greyscale
rather than reasoning about it.**

| What it must convey | What carries it without colour |
|---|---|
| Included / not / coming | 🔴 **Three different GLYPHS**: `✓`, `—`, and the words `Coming soon`. Not three colours of one mark — `cellLabel()` returns different strings |
| Section grouping | Light grey band + **uppercase, bold, letter-spaced** label |
| Row name vs description | **Font weight and size**, not hue |
| Which column | Position + the repeated header (now correctly centred) |
| Footnote references | Superscript **numerals** |

**The greyscale render is legible throughout** — arguably the clearest view of the document I produced.
Colour is doing decoration only: navy for headings, one orange rule under the head.

### 8. Ticks and dashes — untouched, and proved

`diff` of the `.yes` / `.no` / `.soon` rules before and after: **identical.**

```css
.yes  { color: #1F7A3D; font-weight: 700; }
.no   { color: #93A1B4; }
.soon { color: #B26B0F; font-size: 8px; }
```

Computed at render: tick `rgb(31,122,61)`, dash `rgb(147,161,180)`, soon `rgb(178,107,15)` — unchanged.
**The protected `'—'` is styled by the pre-existing `.no` rule and its VALUE was never touched**; it is
still produced by `cellLabel()` in `lib/landing-table.ts` and escaped for HTML only.

---

## 9. The regenerated document

| | |
|---|---|
| **Pages** | **2** (unchanged) |
| **File size** | **170,056 bytes** (was 167,063 — **+2,993**, the inlined wordmark) |
| **Any row split across pages?** | **No** — `tr { break-inside: avoid }` unchanged, confirmed on both pages |
| **Header repeats on page 2?** | ✅ **Yes, and correctly centred** |
| **All five footnotes present?** | ✅ **6 footnote paragraphs** — the five numbered notes plus the "summary, not a contract" line |
| **Header alignment (§2)** | **0px offset on all four columns**, ink-centre measured, from 36–45px and uneven |
| **Wordmark** | 136.44 × 30 rendered, **4.548:1** |

A fresh copy is at `~/Downloads/hatchgrab-plans-and-features.pdf`.

⚠️ The wordmark appears on **page 1 only** — it lives in the document head above the table, not in the
`<thead>`. That is intended: what repeats is the plan-column header, which is what a reader needs on
page 2. Say the word if you want it on every page.

---

## 10. What was not touched

| | |
|---|---|
| The three protected strings | ✅ `'Online ordering — Pay at Hatch'` still **2 occurrences**; the `'—'` value unchanged (styling only) |
| `lib/pricing.ts` (price mask set) | ✅ untouched |
| `lib/features.ts` | ✅ untouched |
| `app/landing/layout.tsx` (landing admin gate) | ✅ untouched |
| `lib/plan-features.ts` / `lib/landing-table.ts` | ✅ untouched — this change is presentation only |
| The landing page | ✅ untouched — it has its own stylesheet and is unaffected |

---

## One thing worth recording

⚠️ **My CSS comments initially broke the build**, because the stylesheet lives inside a **template
literal** and I wrote `` `auto` `` and `` `fixed` `` in them — a backtick terminates the literal. The
compiler caught it; the comments now use quotes. **Anyone editing this stylesheet must avoid backticks
entirely**, which is not obvious from looking at it.

**Nothing deployed. Nothing committed.**
