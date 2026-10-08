# Landing: the /features link becomes a navy button with a lead-in

**7 October 2026.** Current branch only. **Nothing pushed, nothing deployed.** Localhost only; no truck
data was touched.

---

## 1 · What changed

| | Before | After |
|---|---|---|
| Lead-in | *(none)* | **"Not sure which plan? See exactly what each one includes."** — centred, muted, 14.08px |
| Control | `<a class="btn btn-ghost">See every feature →</a>` — outlined, white fill | `<a class="btn btn-navy">Compare all features →</a>` — solid navy, white text |
| Position | under the plan cards, before "Switching from another platform?" | **unchanged** |

Plus one unrelated item you asked for in the same message: the **"What it does"** tile heading
**"Your social media posts, done for you"** is now **"Automate your Facebook & Instagram posts"**
([page.tsx:360](app/landing/page.tsx#L360)). Its body copy is untouched.

### Files

| File | Change |
|---|---|
| [app/landing/page.tsx](app/landing/page.tsx) | the lead-in `<p>` and the navy button replace the single `.feat-cta` link; the social tile heading renamed |
| [app/landing/landing.css](app/landing/landing.css) | `--head-deep` token; `.btn-navy` + `.btn-navy:hover`; `.feat-lead`; `.feat-btn`; `.feat-cta` re-purposed; the old white-fill rule deleted |

---

## 2 · The navy variant, and why it is allowed to be filled

⛔ **The old note on this button argued against a filled one, and it was right about ORANGE.** Every
orange control on the landing page opens the demo modal. A filled orange button here would promise the
same action as the three "Try Free" buttons in the cards directly above it and deliver a different one
— a link to `/features`.

🔴 **Navy does not carry that meaning anywhere on this page.** `--head` is the heading colour; it is
not a CTA colour. So a navy button cannot be mistaken for a fourth demo CTA, which is what makes a
filled control safe here where an orange one is not.

🔴 **The lead-in is what makes the button worth pressing.** "Compare all features →" on its own is a
label. "Not sure which plan?" is the question a reader standing in front of three cards is actually
holding, and it answers it *before* the button asks for a click.

```css
.hg-landing .btn-navy { background: var(--head); color: #fff; border-color: var(--head); padding-inline: 1.9rem; }
.hg-landing .btn-navy:hover { background: var(--head-deep); border-color: var(--head-deep); transform: translateY(-1px); }
```

⚠️ **It adds a fill and a wider gutter and nothing else.** The height, the radius, the font, the
transition all still come from `.btn` — so it is the same *shape* as the "Try Free" buttons, which is
what the brief asks for. ⛔ **`padding-block` is deliberately untouched:** changing it would change the
height, and "same height, wider padding" is one instruction, not two.

### `--head-deep` is a new token, and the brief anticipated that

⚠️ The brief says *"use existing tokens where they exist."* The stylesheet had `--head` and **nothing
darker** — so `.btn-navy:hover` would otherwise have carried a hex literal. `--head-deep: #0F2238` is
declared beside `--head` in the shared token block.

### `.btn-primary` and `.btn-ghost` are untouched

⛔ **`.btn-primary` was not changed** — it is still orange with white text, as decided on 7 October
after the navy-text experiment was reversed on sight. ⛔ **`.btn-ghost` was not changed either**, and
it still has four users: the Starter and Max "Try Free" buttons, and the "Log in" link in the nav and
on `/contact`. Filling that class globally would have looked identical today and surprised whoever next
put a ghost button on a tinted background.

### What *was* removed

```css
/* deleted */
.hg-landing .feat-cta .btn { background: var(--paper); }
```

🔴 **That rule existed only for this button.** `.btn-ghost` is transparent, which read as a hole in the
pricing band's tint, so it was given a white fill on 6 October. The button is filled navy now, so there
is nothing left for it to do — and a rule that fills a navy button white would be the next person's
puzzle. Nothing else referenced it.

---

## 3 · Measurements — WebKit, on the HatchGrab host

`http://hatchgrab.localhost:3000/`, measured in the browser rather than read off the source.

### Contrast — **the brief asked for this to be reported**

| State | Foreground | Background | Ratio | AA 4.5 | AAA 7 |
|---|---|---|---|---|---|
| **Rest** | `#FFFFFF` | `--head` `#16314F` | **13.24:1** | ✅ | ✅ |
| **Hover** | `#FFFFFF` | `--head-deep` `#0F2238` | **16.08:1** | ✅ | ✅ |

🟢 **Both clear 4.5:1 comfortably, and the hover is the *more* legible of the two** — the right
direction for a state the pointer is already on.

🟢 **This is the opposite situation to `.btn-primary`**, whose white-on-orange is **2.50:1** and is an
accepted brand decision recorded in the stylesheet. The navy button needs no such exception.

### Geometry

| | 390px | 1440px | "Try Free" (same page) |
|---|---|---|---|
| Height | 48px | 48px | **48px** ✅ same |
| Corner radius | 7px | 7px | **7px** ✅ same |
| `padding-block` | 11.2px | 11.2px | **11.2px** ✅ same |
| `padding-inline` | 30.4px | 30.4px | 18.4px — **the navy one is wider** ✅ |
| Button width | 233px | 233px | 303px / 294px (card width) |
| Content column | 350px | 1060px | — |
| Full width? | **no** — centred, 79…311 in 390 | **no** — centred, 604…836 in 1440 | — |

⚠️ **At 390 I took the brief's "otherwise" branch: sized to its label and centred.** The brief allows
full width below 640px *"if that matches the Try Free buttons there"* — they do stretch to their card's
width, because `.plan` is a flex column and `.plan .btn` has `margin-top: auto` with the default
`align-items: stretch`. I chose the centred option because a secondary action reading narrower than the
primary ones above it is the clearer hierarchy, and the screenshot bears that out. **Say the word and
it is one `width: 100%` inside a `@media (max-width: 639px)`.**

### Spacing

| Gap | Measured | Brief |
|---|---|---|
| Lead-in → button | **11px** | "about 10–12px" ✅ |
| Plan cards → lead-in | 2.2rem (`.feat-cta` margin-top, up from 1.4rem) | "comfortable spacing above" ✅ |
| Button → switching box | **32px** | "comfortable spacing below" ✅ |

⚠️ `margin-top` went from **1.4rem to 2.2rem** because there are two blocks here now where there was
one: the pair has to read as its own step between the cards above and the switching block below, not as
a tail on either. 2.2rem is the same gap `.switch-block` takes.

### The lead-in matches `.switch-body` exactly

| | `.feat-lead` | `.switch-body` |
|---|---|---|
| `font-size` | 14.08px | **14.08px** ✅ |
| `color` | `rgb(95,122,153)` (`--ink-soft`) | **`rgb(95,122,153)`** ✅ |

⚠️ They are **not** a shared class. They sit in different blocks, and sharing one would tie two sections
together for a resemblance rather than a reason — but if one is ever changed the other should be looked
at, which is why both rules say so.

### The link, and no horizontal scroll

| | 390px | 1440px |
|---|---|---|
| `href` | `/features` ✅ | `/features` ✅ |
| Label | "Compare all features →" ✅ | same |
| `document.documentElement.scrollWidth` | **390** | **1440** |
| `window.innerWidth` | 390 | 1440 |
| **Horizontal scroll** | **none** ✅ | **none** ✅ |

---

## 4 · Focus — and one honest finding

✅ **The focus ring is the page's own and it applies here**, which is what "use existing tokens where
they exist" asks for. `.hg-landing :focus-visible` is `2.5px solid var(--orange)` at a 3px offset.
Measured on the button after tabbing to it with a real keypress:

```
outline-width 2px · outline-style solid · outline-color rgb(239, 139, 44) · outline-offset 3px
```

(Chromium renders 2.5px as 2px at DPR 1.) The clipped screenshot
`focus-ring-1440.png` shows it. ⛔ **A second ring on this one button would be a second answer to a
question the stylesheet settled once.**

### ⚠️ Two measurement traps I fell into first, both recorded because the first readings looked like bugs

1. **The hover appeared not to work.** `page.hover()` ran before the scroll had settled, so the pointer
   was over the element's *old* position and `:hover` never matched — the button read `#16314F` in both
   states. Moving the real mouse to the button's measured centre gives `#0F2238`, with the
   `translateY(-1px)`. **The CSS was always right; the measurement was wrong.**
2. **`el.focus()` from script reads `outline-style: none`.** `:focus-visible` only matches a real
   keyboard interaction. ⚠️ And then **tabbing in WebKit never reaches the button at all**: macOS
   WebKit does not move keyboard focus to a link unless Safari's *"Press Tab to highlight each item"* is
   on, and headless WebKit inherits that default. **That is a platform preference, not something this
   page controls** — so the ring is measured in Chromium, where links are tabbable. The rule itself is
   shared, so it is the same ring in both.

### 🔴 A pre-existing finding, surfaced by this work — your call, not changed

**The orange focus ring is 2.35:1 against the pricing band's background** (`--orange` `#EF8B2C` on
`--wash` `#F5F8FB`). WCAG 2.2's non-text contrast floor for a focus indicator is **3:1**.

⚠️ **This is page-wide and predates this change** — `.hg-landing :focus-visible` is the one ring every
control on the landing page wears, and the band it sits on has been that colour throughout. The navy
button is simply the first place I measured it. Against the button itself the ring is **5.29:1**, and at
a 3px offset it touches both.

⛔ **I have not changed it.** Altering a shared focus ring to fix one button would change every control
on the page, which is well outside "one small element". If you want it fixed, the cheap version is a
two-tone ring (a white inner `box-shadow` under the orange outline) applied to the shared rule — one
line, but it touches everything, so it should be its own decision.

---

## 5 · Checks

| | |
|---|---|
| `npx tsc --noEmit` | ✅ clean |
| `npx eslint app/landing/page.tsx` | ✅ 0 problems |
| Link target | ✅ `/features` at both widths |
| Contrast | ✅ 13.24:1 rest, 16.08:1 hover — **both reported above** |
| Horizontal scroll at 390 | ✅ none |
| Horizontal scroll at 1440 | ✅ none |
| Screenshots | ✅ `docs/landing-polish-shots/features-button/` |

### The screenshots

| File | What it shows |
|---|---|
| `pricing-cta-1440.png` | plan cards, lead-in, button and the switching box at 1440 |
| `pricing-cta-390.png` | the same at 390 |
| `pricing-section-1440.png` | the whole pricing section at 1440 |
| `pricing-section-390.png` | the whole pricing section at 390 |
| `focus-ring-1440.png` | the button with keyboard focus, clipped |

⚠️ **The first focus screenshot was useless and was retaken.** Tabbing scrolls the page, so a viewport
shot landed on the testimonial section. It is a clip round the button's measured rectangle now.

---

## 6 · Scope

⛔ **Nothing else in the pricing section changed** — not the cards, not the trial banner, not the
switching block, not the footnotes. The only edit outside this one element is the "What it does" tile
heading you asked for in the same message, named in §1.

⚠️ **The dev server was already running on port 3000** and I used it rather than starting a second; a
second `next dev` refused the lock, as it should. Nothing was killed.
