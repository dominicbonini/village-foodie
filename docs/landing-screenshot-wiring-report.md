# Hero fan — two real screenshots in, third slot back to a placeholder

**Nothing committed. Nothing deployed. No SQL, no migration.**
**Restore notes updated by ADDITION only** — `docs/landing-copy-restore-notes.md` §11.

---

## VERIFICATION

**Verified by execution:**

| Check | Result |
|---|---|
| `sips` on both source files | **Both 2560×1440 PNG** |
| **I opened and looked at both images** | Identification below is **observed, not inferred** |
| `next build` with `customer.png` absent | **Exit 0** — no warning, no mention |
| Image optimizer, `next start` + `curl` | `kitchen.png` **200** · `dashboard.png` **200** · `customer.png` **400** |

**Sanity checks only:** `tsc --noEmit` exit 0, `eslint` 0 problems. **Not verification.**

🔴 **I HAVE NOT RENDERED THIS PAGE.** I have not seen the fan at any viewport. Everything about how the
images *look* in their frames — the crop, the placeholder, the fill — is computed from CSS and from the
images' dimensions. **§2 and §4 say so where it matters.**

**No span of the prompt arrived garbled.**

---

## FIRST — which file is which

**I could NOT tell them apart from dimensions: both are 2560×1440.** So rather than guess, **I opened
them.**

| File | What it actually shows |
|---|---|
| **`Screenshot_20260901_114103.png`** | 🔴 **THE KITCHEN SCREEN (KDS).** Unmistakable: `← Dashboard`, the List/Grid/Full/Cook toggles, the `TO MAKE` strip, order tickets with **Ready** and **Mark paid & collected** buttons |
| **`Screenshot_20260901_114038.png`** | ⚠️ **THE ADD ORDER PANEL** — the menu grid (PIZZA/DRINKS/DESSERTS), a running basket, `Total £36.00`, `Take payment £36.00` |

🔴 **NEITHER IS THE ORDERS DASHBOARD.** The slot's own brief reads *"Orders dashboard — realistic
orders, capacity strip visible"*. **038 is the Add Order tab: no orders list, no capacity strip.**

**I stopped on that and you said "just use both, doesn't need to be KDS atm" — so:**

- `.shot-kds` ← **103** (the real KDS) → `kitchen.png`
- `.shot-dash` ← **038** (Add Order) → `dashboard.png`

⚠️ **I changed that slot's `alt` text.** It read *"The HatchGrab orders dashboard, showing live orders
and the day's capacity strip"* — **false for this image**, and a screen reader would announce it as
fact. It now reads *"Taking an order on HatchGrab: the menu on the left, the running basket and total on
the right"*. **Reword freely.**

---

## 🔴 A MISMATCH IN THE BRIEF, FLAGGED NOT RESOLVED

**Your prompt says the customer slot "stays as a placeholder for now". It was not a placeholder.**

**The previous task wired ALL THREE slots to `next/image` and deleted every placeholder span and the
three `.lbl`/`.hint` CSS rules.** So when this task began, the customer slot was an `<Image>` pointing at
a file that does not exist — **which renders broken, not as a placeholder.**

**I took your instruction at its intent** — *the customer slot should not show a broken image* — **and
put it back to a real placeholder.** That required more than deleting an `<Image>` (§4). **If you would
rather it stayed wired and simply rendered empty until the file lands, it is a small change back.**

---

## 1 · Recorded before touching anything

**`docs/landing-copy-restore-notes.md` §11 ADDED**; nothing existing edited.

- **§11.1** — the customer slot's `<Image>` line verbatim (what the placeholder replaced).
- **§11.2** — the `.shot` / `.shot img` rules verbatim. ⚠️ **Neither was edited this task** — a
  `.shot-empty` block was *added after* them.
- **§11.3** — which source file became which target, with dimensions.

⚠️ **§10 already holds the original pre-wiring markup and CSS.** §11 records the intermediate state, so
you can revert to *either* point.

---

## 2 · The files, and what their size does to the render

| Target | Source | Actual | Your stated expectation | My spec's figure |
|---|---|---|---|---|
| `kitchen.png` | `…114103.png` | **2560×1440**, 267 KB | 1280×960 | 640×480 |
| `dashboard.png` | `…114038.png` | **2560×1440**, 224 KB | 1600×1100 | 800×550 |

### ⚠️ Three discrepancies. Nothing was resized or cropped.

**(a) Your expected figures and my spec's disagree.** You wrote 1280×960 / 1600×1100; my
`landing-screenshot-spec-report.md` §3 said **640×480 / 800×550**. **Yours are 4× the CSS box, mine are
2×.** ⚠️ **Neither matters much in practice — `next/image` downscales — but the numbers should agree
before you shoot the phone shot.**

**(b) 🔴 THE ASPECT RATIOS DO NOT MATCH, AND THIS ONE IS VISIBLE.** Both sources are **16:9**. Neither
frame is.

```
.shot-kds   4:3    ← 16:9 source is wider → crops 640px of width (25%), 320px from EACH side
.shot-dash  16:11  ← 16:9 source is wider → crops 465px of width (18%), 233px from EACH side
```

**`object-fit: cover` centres, so the crop is symmetric — it eats both edges.**

🔴 **What that likely costs, from what I saw in the images** *(reasoned from the layout, NOT rendered)*:

- **kitchen.png at 25%:** the left edge carries `← Dashboard` and the view toggles; the right edge
  carries `Screen on`. **Both are near the outer 12.5% and are likely partly cut.** The order tickets are
  central and should survive.
- **dashboard.png at 18%:** the left edge is the PIZZA/DRINKS/DESSERTS tabs; **the right edge is the
  basket and the orange `Take payment £36.00` button — the most eye-catching element in the frame, and
  the one nearest the crop.**

**Options, none applied:** re-crop the sources to 4:3 and 16:11 before they go in; change the frame
ratios in `landing.css`; or accept the crop. ⚠️ **I did not resize or crop anything.**

**(c) Resolution is far above what is needed** — 2560px into a 320px box. Harmless (Next downscales),
just larger files than necessary.

### ⚠️ Two content observations, since these are going on a public page

1. 🔴 **Both show visible test data**: the truck is **"App Tester"**, the event is **"Test Event 12"**,
   and the customer names are the seeded set (Ben, Ella, Finn, Grace, Harry…). **The slot brief asked
   for *"tidy data, plausible names/items"*.**
2. ⚠️ **The KDS shot shows every ticket badged late** — `145m late`, `110m late`, `105m late`, `95m
   late`, `90m late`. **On a marketing hero that reads as a kitchen in trouble**, which is the opposite
   of the claim the hero makes.

**Neither is mine to decide. Both are worth a second look before Thursday.**

---

## 3 · The §4 removals for the two filled slots

🔴 **ALREADY DONE — by the previous task, not this one.** For `.shot-kds` and `.shot-dash`:

| Removal | State |
|---|---|
| Dashed border | ✅ Gone from the base `.shot` |
| Paper background | ✅ Replaced with `--line` |
| `padding: 1rem` | ✅ Gone |
| `display:flex` centring | ✅ Now `display:block` |
| Placeholder + hint spans | ✅ Deleted from both slots |

**Nothing was left to remove for those two. The only change this task made to them is that their target
files now exist.**

✅ **The customer slot was left as a placeholder — but I had to rebuild it as one (§4).**

---

## 4 · The `.shot` fix, and 🔴 what it does to the remaining placeholder

**The base rule (unchanged this task):**

```css
.hg-landing .shot { background: var(--line); border-radius: 12px; box-shadow: …; overflow: hidden; display: block; position: absolute; }
.hg-landing .shot img { display: block; width: 100%; height: 100%; object-fit: cover; }
```

- **`overflow: hidden`** — clips the image to the 12px / 18px radius. Without it the image's square
  corners render outside the rounded frame.
- **`display: flex` → `display: block`, `padding` removed** — flex will not stretch a child to fill, and
  the padding would inset the screenshot 16px on every side.

### 🔴 You asked what the shared rule does to the placeholder. It breaks it — so I fixed that too.

**A text placeholder inside an image frame renders wrong: no padding, no centring, and no dashed edge to
read as deliberately empty. It would look like a bug, not a gap.**

**Added — a modifier that restores exactly what the base rule dropped, for that one slot:**

```css
.hg-landing .shot-empty { background: var(--paper); border: 2px dashed var(--line); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .35rem; text-align: center; padding: 1rem; }
.hg-landing .shot-empty .lbl  { font-family: var(--display); font-weight: 700; font-size: .66rem; letter-spacing: .14em; text-transform: uppercase; color: var(--ink-faint); }
.hg-landing .shot-empty .hint { font-size: .7rem; color: var(--ink-faint); max-width: 22ch; line-height: 1.35; }
```

**and the markup:**

```jsx
<div className="shot shot-phone shot-empty"><span className="lbl">Screenshot</span><span className="hint">Customer ordering</span></div>
```

⚠️ **I have not rendered it.** The reasoning is from the cascade — `.shot-empty` follows `.shot` and has
higher specificity on the properties it overrides. **Check the phone slot looks like a deliberate dashed
box, not a grey smear, when you next open the page.**

---

## 5 · `width` / `height`

**Unchanged from the previous task, and already correct: the CSS box sizes, not the export sizes.**

| Slot | `width`/`height` | Why not the source size |
|---|---|---|
| kitchen | **320 × 240** | 2560×1440 would reserve a box eight times too wide and shift the layout |
| dashboard | **400 × 275** | same |
| customer | *(placeholder — no Image)* | — |

⚠️ **They must keep agreeing with the CSS `aspect-ratio`**, or `next/image` and the CSS disagree about
the frame's shape.

---

## 6 · What a missing image does — RE-VERIFIED with one slot genuinely absent

| Stage | Result |
|---|---|
| **`next build`** | ✅ **Exit 0.** **No warning. `customer.png` is never mentioned** |
| **Optimizer, `kitchen.png`** | **200** |
| **Optimizer, `dashboard.png`** | **200** |
| **Optimizer, `customer.png`** | 🔴 **400** |

> 🔴 **A MISSING IMAGE DOES NOT BREAK THE BUILD. It fails silently at build and visibly at runtime.**

✅ **Not a live risk today** — the customer slot is a placeholder div, not an `<Image>`, so **nothing
requests `customer.png` at all.**

🔴 **BUT THE RISK RETURNS THE MOMENT YOU WIRE THE PHONE SHOT.** The build will not catch a typo, and
**`customer.png` vs `Customer.png` works on your Mac and fails on Vercel's case-sensitive filesystem.**
**Open the page in a browser after adding it.**

---

## 7 · The three dead CSS rules — 🔴 they were already removed, and the placeholder needed them back

**Direct answer: they could NOT have been removed now, and removing them earlier was premature.**

**The previous task deleted `.shot .lbl`, `.shot .hint` and `.shot-phone .hint`** — correct if all three
slots hold images, **wrong the moment one goes back to being a placeholder.** ⚠️ **I re-introduced their
substance, scoped to `.shot-empty`**, rather than restoring the originals: the base `.shot` no longer
styles text, so a `.shot .lbl` selector would sit on a rule that fights it.

**When the phone shot lands:** delete `shot-empty` and the two spans from the markup, put an `<Image>`
there, **and delete the entire `.shot-empty` block from `landing.css`.** 🔴 **Nothing else uses it — the
comment in the CSS says so, so the next reader does not have to work it out.**

---

## 8 · Scope

| Check | Result |
|---|---|
| Files changed | **`app/landing/page.tsx`, `app/landing/landing.css`**; **2 PNGs added** to `public/screenshots/` |
| Three protected strings | ✅ **Untouched** |
| Feature gate `lib/features.ts` | ✅ **Untouched** |
| Landing admin gate `app/landing/layout.tsx` | ✅ **Untouched** |
| `robots: { index: false }` | ✅ **Untouched** |
| Committed / deployed | **Neither** |

⚠️ **`.next/` was rebuilt by the verification build** — gitignored.
⚠️ **The gate's stated conditions still are not met:** it comes off only when the testimonial is cleared
**and** the screenshots are real. **One of three slots is still a placeholder.**

---

## What I could not establish

1. 🔴 **How any of this renders.** **Not opened in a browser.** The crop percentages are arithmetic; what
   they cut is reasoned from the images' layout.
2. **Whether `next/image`'s inline styles fight `.shot img`** in a rotated, absolutely-positioned box.
   **Still unverified — check this first.**
3. **Whether the crop removes anything you care about** — §2's per-image reasoning needs your eye.
4. **Whether "App Tester" / "Test Event 12" / the late badges are acceptable** on a public page.
5. **Which figures are right for the phone shot** — your 4× or my 2× (§2a).
