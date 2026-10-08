# LANDING ICONS INLINE — ORANGE, ON THE HEADING'S OWN LINE

**6 October 2026 · branch `main`, local only. Nothing pushed, nothing deployed, no production request,
no truck touched.**

This replaces part of `docs/landing-polish-report.md` §3, which had put each icon in a pale tinted
rounded square *above* its heading. The square is gone.

---

## 📁 FILES CHANGED

| | |
|---|---|
| `app/landing/page.tsx` | each `<TileIcon>` moved **inside** its `<h3>`, and the heading text wrapped in a `<span>` |
| `app/landing/landing.css` | `.does-ico` rewritten; `.does-item h3` made a flex row |

**Added:** `docs/landing-polish-shots/icons-inline/` — two screenshots.

⛔ **No tile text, no icon choice, no section layout and nothing else on the page was touched.**

---

## 🔴 1 · WHAT WENT, AND WHAT REPLACED IT

**Deleted from `.does-ico`:** `width/height: 2.6rem`, `border-radius: 10px`,
`background: var(--orange-wash)`, `color: var(--head)`, `margin-bottom: .7rem`, and the
`inline-flex`/`align-items`/`justify-content` that centred a glyph inside that box.

**Now:**

```css
.hg-landing .does-item h3 { display: flex; align-items: flex-start; gap: .5rem; … }
.hg-landing .does-ico     { flex: none; display: block; color: var(--orange);
                            margin-top: calc((1.55em - 22px) / 2); }
.hg-landing .does-ico svg { display: block; width: 22px; height: 22px; stroke-width: 2; }
```

**Measured:** background `rgba(0, 0, 0, 0)`, border-width `0px`, padding `0px` — no background, no
border, no padding box, which is what the brief asked for in those words.

---

## 🔴 2 · THE COLOUR IS DEFINED ONCE, AND IT WAS ALREADY THERE

The brief asked for `HATCHGRAB_ORANGE_HEX` **#EF8B2C** from `lib/brand.ts`, via an existing constant or a
CSS variable defined once — **not the hex six times**.

🟢 **`landing.css` already declares `--orange: #EF8B2C`** in its token block, and its own comment calls it
*"THE one orange"*. That is the same value as `HATCHGRAB_ORANGE_HEX`. So the icons use `var(--orange)`:
**one declaration, no new variable, and no seventh copy of the hex entering the repository.**

⚠️ **`color`, not `stroke`.** lucide renders `stroke="currentColor"`, so the colour is inherited — an icon
swapped in later cannot miss it, and there is exactly one place to change.

**Measured:** all six compute `stroke: rgb(239, 139, 44)`, and the set of distinct values across the six
is **1** — so "no per-icon colours" is asserted as a count, not as six separate equality checks.

---

## 🔴 3 · ON THE HEADING'S LINE, AND THE WRAPPED-LINE RULE

The icon is the **first of two flex children** of the `<h3>`; the heading's text is the second, wrapped in
its own `<span>`.

⛔ **That span is the whole mechanism for the brief's wrapping rule.** An inline icon with the text loose
in the `h3` would indent *every* line to the icon's left edge. As its own flex item the text has its own
content box, so a second line sits under the **text**, not under the icon. Verified live: at 390px
*"Your social media posts, made for you"* wraps to two lines and does exactly that.

⛔ **`align-items: flex-start`, not `center`.** Centre would align the icon against the whole heading
block, so a two-line heading would push the icon half a line down. flex-start pins it to the top and the
computed `margin-top` centres it on the **first** line.

📐 **That offset is computed, not eyeballed.** The heading's line box is `1.55em` — the `.hg-landing` body
line-height, which this deliberately does **not** override — so the offset is half the difference between
that box and the 22px glyph. `em` resolves against the icon's own inherited font-size, which is the
heading's, so the two track together if the type scale ever moves. ⛔ **A fixed px offset would drift the
moment it did.**

**Measured:** every icon is centred on the first line to within 2.5px, sits **4px** from the text's top on
all six, and the gap is **8px** on all six.

---

## 🔴 4 · THE BODY TEXT DID NOT MOVE

**Measured:** each tile's `<p>` is at its tile's own left edge, to within 0.5px, while the heading text is
indented **30px** (22px glyph + 8px gap). So the glyph hangs into the tile's left margin and the
paragraph is where it has always been — which is what "keeps its current left edge" asks for.

⚠️ **My first assertion demanded the opposite** — that the body line up with the indented heading text —
and failed on correct markup. The check was wrong, not the page.

---

## ✅ 5 · CHECKS

**30 browser assertions, all passing**, at 390px and 1440px:

- six tiles, each with an icon · all `aria-hidden="true"`
- every icon centred on the heading's **first** line, immediately before the text, **8px** gap
- no tinted square: background `rgba(0,0,0,0)`, border `0px`, padding `0px`
- all six stroke **#EF8B2C**, and exactly **one** distinct colour across the set
- **22px** glyphs · consistent 4px offset on all six
- the body text keeps the tile's left edge; the heading is indented by icon + gap
- no horizontal page scroll

`npx tsc --noEmit` on the touched files: **clean**.

### 🔴 The section is shorter — at 1440px, 1021px → **863px**

| | before | after | |
|---|---|---|---|
| **section height @1440** | **1021px** | **863px** | **−158px (−15.5%)** |
| grid height @1440 | 623px | 464px | −159px |
| section height @390 | 1700px | 1412px | −288px (−16.9%) |

Each tile lost the icon box's 2.6rem plus its .7rem bottom margin — ~53px — and six tiles across two
columns is three rows of that.

⚠️ **The "before" figures are this morning's icon-square version**, not the pre-icon page: that is the
state this change replaced, and the comparison the brief asked for.

### One check that failed on correct code, and was my error

⚠️ **`span:not(.soon-inline)` matched the icon's own span.** `.does-ico` is not `.soon-inline`, so every
alignment check compared the icon against itself and reported a −22px gap on correct markup. The text
span is selected by position now (`h3.children[1]`).

---

## 📸 6 · SCREENSHOTS

```
docs/landing-polish-shots/icons-inline/what-it-does-390.png
docs/landing-polish-shots/icons-inline/what-it-does-1440.png
```

Both DPR 2, clipped to the `.does` grid.

---

## ⚠️ 7 · WHAT I COULD NOT VERIFY

1. ⚠️ **Real devices and Safari.** Headless Chromium only.
2. ⚠️ **Optical centring.** The offset centres the glyph's **box** on the line box, which is geometrically
   right; whether a given lucide glyph looks optically centred inside its own 22px box is a judgement no
   measurement here makes. The screenshots are the evidence for that.
