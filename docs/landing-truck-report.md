# LANDING TRUCK ILLUSTRATION — REPLACED

**Date:** 31 July 2026 · **Repo:** `/Users/dominicbonini/dev/village-foodie` · **Branch:** `main`
**Status: ✅ DONE.** `tsc --noEmit` **clean (exit 0)**. No `next dev` / `next build` run.
**File changed (1):** `app/landing/page.tsx`.

**Prompt integrity:** no span read as garbled or truncated.

---

# ✅ ASSET VERIFICATION — BOTH PRESENT

| File | Bytes | viewBox |
|---|---|---|
| `public/illustrations/food-truck.svg` | **1,123** | `24.0 18.0 351.5 176.0` |
| `public/illustrations/food-truck-themed.svg` | **1,177** | `24.0 18.0 351.5 176.0` |

Both match the sizes you stated. Directory created 31 July 16:19.

---

# 1. DIAGNOSIS

## (a) Exact line range — **408 to 418** (11 lines)

Opening `<svg className="truck" …>` at **408**, closing `</svg>` at **418**.

## (b) The opening tag, in full

```jsx
<svg className="truck" viewBox="0 0 260 132" aria-hidden="true">
```

**Three attributes only.** No `width`, no `height`, no `role`, no `aria-label`, no `xmlns`.

## (c) What wraps it — and 🔴 the wrapper does NOT size it

```jsx
<section id="try">
  <div className="wrap final">
    <svg className="truck" …>
```

🔴 **The `<svg>` sizes ITSELF.** The sizing lives on the `.truck` class, which is on the `<svg>` element —
[landing.css:305](app/landing/landing.css#L305):

```css
.hg-landing .truck { width: min(230px,60%); height: auto; display: block; margin: 0 auto 1.6rem; }
```

The wrapper only supplies context: `.final { text-align: center }` ([:304](app/landing/landing.css#L304))
and `.wrap { max-width: var(--max); padding-inline: var(--gut) }` — the `60%` resolves against `.wrap`.

⚠️ **This is the load-bearing detail for the swap:** `className="truck"` had to move onto the *new*
`<svg>`, and no `width`/`height` attribute could be added, or it would fight the `min(230px,60%)` rule.
⚠️ Note `.truck` carries `margin: 0 auto 1.6rem` — a **margin that survives** the `.hg-landing *` reset,
because `.hg-landing .truck` is (0,2,0) and the reset is (0,1,0). No margin change was needed.

## (d) Current aspect ratio — **1.9697:1** (viewBox `0 0 260 132` → 260 ÷ 132)

New is **1.9972:1** (351.5 ÷ 176). **Difference: 1.38%.**

### ⚠️ I judged this NOT material and proceeded. Here is the exact number so you can disagree.

| Viewport | Rendered width | Height BEFORE | Height AFTER | Δ |
|---|---|---|---|---|
| Desktop (width caps at 230px) | 230px | **116.77px** | **115.16px** | **−1.61px** |
| 360px viewport (60% binds → 192px) | 192px | 97.48px | 96.14px | −1.34px |

**The illustration is ~1.6px shorter at its largest.** I treated that as immaterial rather than stopping,
for two reasons: 1.38% is well inside the tolerance you accept elsewhere (±10-15% on text-width
estimates), and **§3 of your own brief asks me to "state the illustration's rendered width and height
before and after"** — which presumes the replacement happens and the numbers get reported, rather than a
stop on any ratio change at all. **If 1.6px is more than you want absorbed, say so and I will revert.**

## (e) Rendered **once**

The only truck illustration on the page. The other three `<svg>` elements are unrelated:
[:83](app/landing/page.tsx#L83) the `.tick` checkmark (12×12), and
[:231](app/landing/page.tsx#L231)/[:233](app/landing/page.tsx#L233) two 16×16 inline icons.

## (f) ✅ Yes — inside `.hg-landing`

The subtree root is [page.tsx:100](app/landing/page.tsx#L100)
(`<div className={\`hg-landing …\`}>`); the illustration sits at 408, well inside it. **So the
Tailwind-spacing-is-inert rule applies here** — which is why any sizing fix would have had to be a scoped
CSS rule. **None was needed.**

---

# 2. THE REPLACEMENT

**Read from disk and copied verbatim** — no path data was retyped. Verified programmatically after the
edit: **both `d` attributes and all 6 `<circle>` elements from the file appear byte-identical in
`page.tsx`**, and the token counts match (3 × `var(--head, #16314F)`, 1 × `var(--orange, #EF8B2C)` in
code).

**The new opening tag:**

```jsx
<svg className="truck" viewBox="24.0 18.0 351.5 176.0" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Food truck">
```

| Requirement | Done |
|---|---|
| Same wrapper, same classes | ✅ `<div className="wrap final">` untouched |
| Carry over what sized it | ✅ `className="truck"` moved onto the new `<svg>` — the *only* thing that sized it |
| Keep `role="img"` / `aria-label="Food truck"` | ✅ both from the file |
| viewBox unaltered | ✅ `24.0 18.0 351.5 176.0` |
| No width/height fighting the wrapper | ✅ neither attribute added |
| Old block deleted entirely, not commented out | ✅ `grep '0 0 260 132'` → **0** |
| No literal hex reintroduced | ✅ only `#FFFFFF` remains, and that is in the source file itself |

**Fill inventory of the new element:** 6 × `#FFFFFF`, 3 × `var(--head, #16314F)`, 1 × `var(--orange, #EF8B2C)`.
The white is the truck's windows/wheel-hubs and comes straight from the asset.

⚠️ **One deliberate accessibility change:** the old block was `aria-hidden="true"` (decorative); the new
one carries `role="img" aria-label="Food truck"` per your instruction, so it is now **announced** to
screen readers. Flagging because it is a behaviour change, not just a visual one.

⚠️ **No JSX renaming was needed — I verified rather than assuming.** I grepped the file for hyphenated
attributes: the only one is `aria-label`, which React accepts as-is. There is no `stroke-width`,
`fill-rule` or similar. The `<g transform="translate(399.5,0) scale(-1,1)">` (a horizontal flip) is also
JSX-safe.

⚠️ **No margin or padding rule was needed**, so `landing.css` was not touched at all.

---

# 3. VERIFICATION

## ✅ `grep "EA580C"` in `app/landing/` → **ZERO MATCHES**

⚠️ **It did not pass on the first attempt, and I fixed the cause.** My explanatory comment originally
quoted the literal `fill="#EA580C"` when describing what was removed — which would have defeated exactly
the grep check you asked for. **I rewrote the comment to describe it as "the app's ACTION orange (Tailwind
orange-600)" without the literal**, and noted in-line why. The grep is now genuinely clean.

## ✅ `public/illustrations/food-truck.svg` is NOT referenced

No `src=`, no `import`, no `url()` anywhere in `app/`, `components/` or `lib/`. **It remains the untouched
standalone spare for later `<img>` use**, exactly as intended.

⚠️ **One transparency note:** the filename *does* appear once in `app/landing/page.tsx`, inside my comment
block, recording that the spare exists and what it is for. **That is prose, not a reference** — no code
loads it. I kept it because a future reader benefits from knowing the spare is there; say the word if you
would rather the grep be clean of that too.

## Rendered dimensions, before and after

| | Aspect | Desktop (230px wide) | 360px viewport (192px wide) |
|---|---|---|---|
| **Before** | 1.9697:1 | 230 × **116.77px** | 192 × **97.48px** |
| **After** | 1.9972:1 | 230 × **115.16px** | 192 × **96.14px** |

**Width is unchanged at every viewport** — it is set by `min(230px,60%)`, which the viewBox does not
affect. **Only height moves, by −1.61px at most.**

## ✅ Does anything below shift vertically? — **Yes, by ~1.6px, upward**

`.truck` is `display: block` in normal flow, so everything after it in `<section id="try">` — the
`<h2>Want to see how easy setup is?</h2>`, the lede, the CTA and the proof list — **moves up by the same
~1.61px** (~1.34px on small screens). Nothing reflows, nothing rewraps, no element changes width; the
section is simply 1.6px shorter.

## Untouched, as instructed

| Element | State |
|---|---|
| Nav wordmark | ✅ `sm:w-[168px] sm:h-auto` — unchanged |
| `.foot-logo` | ✅ `block foot-logo` — unchanged |
| Footer slogan | ✅ "Less time booking. / More time cooking." — unchanged |
| Hero copy, pricing, tables, footnotes | ✅ untouched |
| `app/landing/landing.css` | ✅ **not edited at all** |

**Only `app/landing/page.tsx` was modified.** (`public/illustrations/` shows as `??` untracked — those are
your hand-placed assets, not something I created.)

---

## What I could NOT verify

- 🔴 **Nothing was rendered.** No `next dev`/`next build`, so **the new illustration has never been seen
  on screen.** **The checks I would want:** (a) it renders at all and is the right way round — the asset
  has a `scale(-1,1)` horizontal flip baked into its `<g>`, so if it faces the wrong way that transform is
  why; (b) the `var(--head)` / `var(--orange)` fills actually resolve on the page rather than falling back
  — they will, since the illustration is inside `.hg-landing` where both tokens are declared, but that is
  reasoning not observation; (c) the 1.6px shift is invisible, as expected.
- ⚠️ **The height figures are arithmetic** (width ÷ viewBox ratio), not measured pixels. The `60%` branch
  assumes `--gut` at its 20px minimum on a 360px viewport.
- **I did not compare the two SVG files to each other** beyond their viewBoxes — I took your word that
  `food-truck.svg` is the plain-hex twin, and inlined only the themed one.
- **I did not check whether the illustration's new proportions suit the section visually** — a 1.38%
  ratio change is arithmetically trivial but the artwork itself is entirely different, and only you can
  judge whether it sits right above that heading.
- **`tsc` exit 0 is necessary and not sufficient** — it proves the JSX parses and every attribute is
  valid React; it says nothing about how the SVG paints.
