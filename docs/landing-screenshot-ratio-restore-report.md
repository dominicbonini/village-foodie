# Frame ratios restored — and one instruction that cannot be carried out

**Nothing committed. Nothing deployed. No SQL, no migration.**
**Restore notes updated by ADDITION only** — `docs/landing-copy-restore-notes.md` §13.

---

## VERIFICATION

- **Executed:** `sips` to measure and crop; `python3` for the aspect arithmetic; `git diff` for scope.
- **Sanity only:** `tsc --noEmit` exit 0. **Not verification.**
- 🔴 **I HAVE NOT RENDERED THIS PAGE.** I have not seen the fan since the change. **Everything about how
  it looks is arithmetic, and you are the one who can see it.**

**No span of the prompt arrived garbled.**

---

## 🔴 STOP — item 2's dashboard crop is geometrically impossible

**You asked me to stop rather than choose if an instruction cannot be satisfied. This one cannot.**

> *"Crop … `dashboard.png` to 16:11 … crop from the TOP and BOTTOM, never the sides."*

**Cropping only ever removes pixels. Removing HEIGHT makes an image WIDER, not narrower** — and 16:11
(1.4545) is **narrower** than the 16:9 source (1.7778). So a top/bottom crop moves *away* from the
target.

```
source 2560x1440 = 1.7778 (16:9)
target 16:11     = 1.4545  — NARROWER than the source

crop WIDTH  (keep h=1440):  w = 1440 x 16/11 = 2095   removes 465px of width      ✅ possible
crop HEIGHT (keep w=2560):  h = 2560 x 11/16 = 1760   needs +320px of height ADDED  🔴 IMPOSSIBLE
```

**`dashboard.png` is therefore UNCHANGED at 2560×1440.** I did not crop the sides — you explicitly ruled
that out — and I did not silently pick a different target.

### Your options

| # | Option | Cost |
|---|---|---|
| **A** | **Crop 465px of width** (233 each side, centred) | ⚠️ **Exactly what you ruled out.** ~9% off each edge — less than the 18% `cover` was taking, because `cover` crops to fill *and* the frame is now restored |
| **B** | **Crop 465px from ONE side only** | Keeps one edge whole. ⚠️ **Still a side crop, but a chosen one.** 🔴 **In `dashboard.png` the basket, total and `Take payment` button are on the RIGHT — cropping only the LEFT preserves them** |
| **C** | **Pad to 16:11** — add 320px of canvas top/bottom | **Not a crop.** Adds bars; on a rotated tile they will read as a mistake |
| **D** | **Re-take the screenshot taller** — an iPad capture at 4:3 or 16:11 | 🔴 **The only option that loses nothing.** The device is 4:3; a 16:9 capture is already a cropped view of it |
| **E** | **Change `.shot-dash` to 16:9** | **You just rejected this.** Recorded for completeness only |

**My reading: D, then B.** The source is a 16:9 capture of a 4:3 device — **the pixels you want probably
still exist on the iPad**, and a fresh capture would need no crop at all. ⚠️ **Not my call.**

---

## 1 · The four values, restored and in step

**All four confirmed AGREEING by arithmetic, not by eye:**

| # | Where | Was (§12) | **Now** | Aspect |
|---|---|---|---|---|
| 1 | `landing.css` `.shot-kds` | `16/9` | **`aspect-ratio: 4/3`** | 1.3333 |
| 2 | `page.tsx` kitchen `<Image>` | `320×180` | **`width={320} height={240}`** | 1.3333 |
| 3 | `landing.css` `.shot-dash` | `16/9` | **`aspect-ratio: 16/11`** | 1.4545 |
| 4 | `page.tsx` dashboard `<Image>` | `400×225` | **`width={400} height={275}`** | 1.4545 |

```
kitchen  : CSS 4/3   = 1.3333   Image 320/240 = 1.3333   -> AGREE
dashboard: CSS 16/11 = 1.4545   Image 400/275 = 1.4545   -> AGREE
```

✅ **CSS and `next/image` agree on both.** This matters because a mismatch makes the two disagree about
the frame's shape — the reason all four move together.

✅ **`width={320} height={233}` — the Gusto logo — was NOT touched.** Confirmed absent from the diff.

---

## 2 · The kitchen crop — done

**Permitted: your "never the sides" instruction was scoped to the dashboard, and 4:3 from 16:9 can only
be reached by removing width.**

| | Before | After |
|---|---|---|
| `kitchen.png` | **2560 × 1440** (16:9, 1.7778) | **1920 × 1440** (4:3, 1.3333) ✅ |

**Removed: 640px of width — 320px from each side, centred.**

⚠️ **What that likely takes, from the image I looked at earlier** *(reasoned, NOT rendered)*: the left
edge carried `← Dashboard` and the List/Grid/Full/Cook toggles; the right edge carried `Screen on`.
**Both sit inside the outer 12.5% and are probably now partly or wholly gone.** **The order tickets and
the `TO MAKE` strip are central and should be intact.**

🔴 **The crop is LOSSY and in-place — but the uncropped original is safe:**

```
~/Downloads/Screenshot_20260901_114103.png   2560x1440, 274,141 bytes   ← kitchen
~/Downloads/Screenshot_20260901_114038.png   2560x1440, 229,399 bytes   ← dashboard
```

**Both confirmed still present.** Re-copy to undo.

---

## 3 · Dimensions, and the 2× question

| File | Before | After | Ratio | vs its CSS box |
|---|---|---|---|---|
| `kitchen.png` | 2560×1440 | **1920×1440** | ✅ 4:3 | 320×240 → **6.0×** |
| `dashboard.png` | 2560×1440 | **2560×1440 (unchanged)** | 🔴 16:9, **not** 16:11 | 400×275 → 6.4× |

### ⚠️ "Confirm both are at 2× for their frame" — they are NOT, and I did not resize

**2× of the CSS boxes is 640×480 and 800×550.** The cropped kitchen is **1920×1440 — 6×**.

🔴 **I deliberately did not downscale**, for three reasons: downscaling is lossy and you may still
re-crop; `next/image` generates its own srcset and downscales at request time, so extra source
resolution costs bytes in the repo but not on the wire; and **the 2× figure itself is unresolved** —
your earlier message said 1280×960, my spec said 640×480 (yours is 4× the CSS box, mine is 2×). **That
disagreement should be settled before anything is resized.**

**Say the word and I will downscale to whichever figure you want.**

---

## 4 · The phone slot — untouched

✅ **`.shot-phone` is still `aspect-ratio: 9/17`.**
✅ **Still the `shot-empty` placeholder div with its two spans — no `<Image>`, no `customer.png`.**
✅ **Nothing in this task touched it.**

---

## 5 · The shared `.shot` rule and the placeholder

**Unchanged by this task**, and still correct for both uses:

```css
.hg-landing .shot { background: var(--line); border-radius: 12px; box-shadow: …; overflow: hidden; display: block; position: absolute; }
.hg-landing .shot img { display: block; width: 100%; height: 100%; object-fit: cover; }
.hg-landing .shot-empty { background: var(--paper); border: 2px dashed var(--line); display: flex; … padding: 1rem; }
```

**`shot-empty` appears 3× in `page.tsx` and 3× in `landing.css`** — the class on the div plus its two
`.lbl` / `.hint` rules. **It follows `.shot` in the cascade and overrides exactly what the image-frame
rewrite dropped: the dashed border, the paper background, the padding and the flex centring.**

⚠️ **This ratio change cannot affect the placeholder** — it touched only `.shot-kds` and `.shot-dash`.
🔴 **But I have not rendered it, so "still behaves" is a claim about the cascade, not an observation.**
**Please glance at the phone tile when you next look.**

---

## 6 · Scope

| Check | Result |
|---|---|
| Files changed | `app/landing/landing.css`, `app/landing/page.tsx`, `public/screenshots/kitchen.png` |
| `dashboard.png` | **Unchanged** — blocked on your decision |
| Three protected strings | ✅ **Absent from the diff** |
| Gusto logo `height={233}` | ✅ **Absent from the diff** |
| `lib/features.ts` | ✅ **Untouched** |
| `app/landing/layout.tsx` | ✅ **Untouched** |
| Committed / deployed | **Neither** |

---

## What happens next, and what I could not establish

1. 🔴 **Decide the dashboard crop** — A, B, C or D above. **Until then `.shot-dash` is a 16:11 frame
   holding a 16:9 image, so `object-fit: cover` will still crop ~18% of its width at render.** **The
   symptom you reported is FIXED for the kitchen and NOT for the dashboard.**
2. **Whether the kitchen crop took anything you needed.** **Reasoned from the layout; not rendered.**
3. **Whether to downscale to 2×**, and which 2× figure is right.
4. **Whether `next/image`'s inline styles fight `.shot img`** in a rotated, absolutely-positioned box —
   **still never verified.**
5. Still outstanding from earlier and unaffected: both images show **"App Tester" / "Test Event 12"**
   with seeded names, and the KDS tickets are badged **145m / 110m / 105m late**.
