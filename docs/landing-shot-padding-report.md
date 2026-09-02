# The gap above and below the screenshots

**One CSS rule added. Nothing committed, nothing deployed.**
**Restore notes updated by ADDITION only** — `docs/landing-copy-restore-notes.md` §19.

---

## VERIFICATION

**Verified by execution:**

| Check | Result |
|---|---|
| `next/image` source (`get-img-props.js`) | for our usage it emits **only** `style="color:transparent"` |
| `grep` for padding/border/background on `.shot*` | **no padding, no border** on the filled slots; **one background** |
| Cascade order in `landing.css` | `.shot` 175 → `.shot img` 185 → new rule 195 → `.shot-empty` 203 |
| `overflow: hidden` present on `.shot` | ✅ line 175 |
| Arithmetic on your measured boxes | reproduces your symptom to the pixel — §diagnosis |

**Sanity only:** `tsc --noEmit` exit 0, lint 0. **Not verification.**

🔴 **I HAVE NOT RENDERED THIS PAGE.** Every geometric statement below is arithmetic against **your**
measurements, not something I saw.

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 🔴 THE DIAGNOSIS — the gap is not padding, and the CSS change will not remove it

**Your two symptoms, one cause. The arithmetic is exact.**

You measured the cards at **320×240** and **398×298** — both 4:3, matching the frames and the current
4:3 files. **With a 4:3 image in a 4:3 box, `contain` leaves nothing.** So the image being rendered is
**not** 4:3.

**Put the PREVIOUS 11-inch images (2420×1668 = 1.4508) through your measured boxes:**

```
kitchen   card 320x240 :  contain -> image renders 320 x 221  ->  gap 19.4px  =  ~10px ABOVE, ~10px BELOW
dashboard card 398x298 :  contain -> image renders 398 x 274  ->  gap 23.7px  =  ~12px ABOVE, ~12px BELOW
```

**That is your symptom, to the pixel.**

🔴 **AND IT EXPLAINS WHY THE SYMPTOM CHANGED SHAPE WHEN I CHANGED `object-fit` LAST ROUND** — which is
the strongest evidence of all:

| `object-fit` | A **wider-than-4:3** image in a 4:3 box | What you reported |
|---|---|---|
| `cover` (before) | scales to fill → **overflows sideways, crops left/right** | *"`d order` instead of `Add order`"* ✅ |
| `contain` (now) | scales to fit → **letterbox bands top/bottom** | *"a gap above and below"* ✅ |

**One stale image, two different symptoms, both predicted exactly. The files on disk are 4:3
(640×480 and 800×600, verified). The browser is not being served those files.**

⚠️ **The filenames never changed** — `kitchen.png` and `dashboard.png` have been overwritten five times
at the same URLs. **A browser cache, or Next's optimiser cache (`.next/cache/images`, which held 4
entries), will keep serving the old bytes indefinitely.**

**The fix is a cache bust, not CSS. See the end.**

---

## 1 · Computed padding, border, background, background-image

**Every rule that contributes, with file and line.**

### `.shot` — the card, shared by all three

`app/landing/landing.css:175`
```css
.hg-landing .shot { background: var(--line); border-radius: 12px; box-shadow: …; overflow: hidden; display: block; position: absolute; }
```

| Property | Value | Source |
|---|---|---|
| `padding` | **0** | `.hg-landing * { box-sizing: border-box; margin: 0; padding: 0; }` — **`landing.css:77`**. `.shot` sets none |
| `border` | **none** | Not set anywhere on `.shot`; the dashed border lives only on `.shot-empty` |
| `background` | 🔴 **`var(--line)`** — a grey | **`landing.css:175`** — **the one survivor** |
| `background-image` | **none** | — |

### `.shot-kds` / `.shot-dash` — before this change

`landing.css:196` and `:197` — **`width`, `aspect-ratio`, `left/top`, `transform`, `z-index` only.**
**No padding, no border, no background of their own** — they inherited the grey from `.shot`.

### The wrapper `next/image` renders between card and img

🔴 **There is none.** With explicit `width`/`height` (not `fill`), `next/image` renders a **bare
`<img>`** — no `<span>`, no wrapper div. **The img is a direct child of `.shot`.**

---

## 2 · Which of the fourteen removals actually landed

**You were right that a background survived. You were wrong about padding — it is gone.**

| # | Removal | State |
|---|---|---|
| 1 | Dashed border on `.shot` | ✅ **Applied** |
| 2 | 🔴 **Paper background** | ⚠️ **NOT removed — CHANGED to `var(--line)`.** I departed from my own spec deliberately and recorded it at the time: a grey "loading" ground and the visible fallback for a missing file. **This is the survivor** |
| 3 | `padding: 1rem` | ✅ **Applied** — gone, and the reset zeroes it anyway |
| 4 | flex centring (`display:flex`, `align-items`, `justify-content`, `gap`, `text-align`) | ✅ **Applied** — now `display: block` |
| 5 | Add `overflow: hidden` | ✅ **Applied** |
| 6 | `.shot .lbl` rule | ✅ **Deleted** (re-scoped to `.shot-empty .lbl`) |
| 7 | `.shot .hint` rule | ✅ **Deleted** (re-scoped) |
| 8 | `.shot-phone .hint` rule | ✅ **Deleted** (re-scoped) |
| 9 | `.shot-dash { border-color }` | ✅ **Deleted** |
| 10 | Section comment | ✅ **Rewritten** |
| 11 | `page.tsx` "DOMINIC" comment | ✅ **Replaced** |
| 12 | Six placeholder spans | ✅ **Deleted from the two filled slots.** ⚠️ Two were deliberately restored on the phone slot |
| 13 | `page.tsx:7-8` header comment | 🔴 **NOT done** — it is a statement about the admin gate, which is out of scope |
| 14 | `layout.tsx` gate condition | 🔴 **NOT done** — same reason |

**So: 11 applied, 1 deliberately altered rather than removed (#2, the background), 2 out of scope.**

⚠️ **Neither #2 nor anything else creates a gap.** A background is painted *behind* the image — it
cannot inset it. **It only makes an existing gap visible, by painting it grey.**

---

## 3 · The img's own width and height, as rendered

**Read from `node_modules/next/dist/shared/lib/get-img-props.js`:**

```js
const imgStyle = Object.assign(
  fill ? { position:'absolute', height:'100%', width:'100%', left:0, top:0, right:0, bottom:0, objectFit, objectPosition } : {},
  showAltText ? {} : { color: 'transparent' },
  style
);
```

**For our usage — `fill` false, no `style` prop, `placeholder` defaults to `'empty'`:**

> 🔴 **`next/image` emits exactly one inline style: `color: transparent`.**
> **No width. No height. No object-fit. No background-image** (that is added only when
> `placeholder !== 'empty'`).

**It also emits `width="320" height="240"` as HTML *attributes*** — the intrinsic-ratio hint. **Attributes
lose to CSS.**

**So the rendered geometry is entirely ours:**

```css
.hg-landing .shot img { display: block; width: 100%; height: 100%; object-fit: contain; }   /* :185 */
```

✅ **The img element FILLS its card exactly — 320×240 and 398×298.** It is **not** inset.

🔴 **THE GAP IS INSIDE THE IMG, NOT AROUND IT.** The element fills the card; `object-fit: contain` then
paints a *smaller* picture inside that element and leaves the rest transparent, showing `.shot`'s grey.
**That is why no amount of padding-hunting finds it — there is no padding.**

---

## 4 · The change made

**`app/landing/landing.css:186-195`** — a new rule after `.shot img`:

```css
.hg-landing .shot-kds, .hg-landing .shot-dash { background: none; padding: 0; }
```

| Declaration | Why |
|---|---|
| `background: none` | 🔴 **Removes the grey the letterbox bands are painted in.** The gap will still exist while a stale image is served, but it will show whatever is behind the tile rather than reading as a deliberate grey frame |
| `padding: 0` | Belt-and-braces. The reset at `:77` already zeroes it; an explicit `0` means a future `padding` on `.shot` cannot silently inset a screenshot |

⚠️ **I did NOT edit `.shot` itself.** Removing the background there would strip it from the placeholder
too, and it is the missing-file fallback.

⚠️ **HONEST LIMIT: this does not close the gap.** Within your constraints — no aspect-ratio change, no
`object-fit` change, no image change, no `width`/`height` change — **nothing in CSS can**, because the
gap is `contain` doing its job on an image whose ratio does not match the box. **The gap closes when the
correct 4:3 file is actually served.**

---

## 5 · The phone placeholder — untouched, and how the split works

**Cascade order in `landing.css`, verified:**

```
:175  .shot                          background: var(--line)   ← all three
:185  .shot img                      the image rule            ← filled slots only (placeholder has no img)
:195  .shot-kds, .shot-dash          background: none          ← THE SPLIT: filled slots only
:203  .shot-empty                    background: var(--paper); border: 2px dashed …; padding: 1rem
:208  .shot-phone                    width / aspect-ratio / position
```

🔴 **The split is by SELECTOR, not by override order.** The new rule at `:195` names only `.shot-kds`
and `.shot-dash`; `.shot-phone` is not in it, so it keeps `.shot`'s background and then `.shot-empty`
re-declares its own paper background, dashed border and padding on top. ✅ **Same specificity (0-2-0),
and `.shot-empty` comes later, so it wins for the placeholder regardless.**

✅ **The phone slot keeps its dashed border, paper background, padding and centred text. Nothing about it
changed.**

---

## 6 · `overflow: hidden`

✅ **Present** — `app/landing/landing.css:175`, on `.shot`, so it applies to all three cards.

**Square image corners cannot poke past the 12px radius (18px on the phone).** ⚠️ **Confirmed by
reading the rule, not by looking at a render.**

---

## 7 · Scope

| Check | Result |
|---|---|
| `aspect-ratio` | ✅ **Untouched** — `4/3`, `4/3`, `9/17` |
| `object-fit` | ✅ **Untouched** — still `contain` |
| `next/image` `width`/`height` | ✅ **Untouched** — `320×240`, `400×300` |
| Image files | ✅ **Untouched** — same bytes |
| Protected strings, Gusto `height={233}`, feature gate, admin gate | ✅ **Untouched** |
| Files changed | **`app/landing/landing.css` only** |

---

## 🔴 What will actually close the gap

**In order of certainty:**

1. **Hard-refresh with cache disabled** — DevTools → Network → *Disable cache*, then ⌘⇧R.
   **If the gap vanishes, it was the stale image and nothing else needs doing.**
2. **Clear Next's optimiser cache** — `rm -rf .next/cache/images` and restart the dev server. **It held
   4 entries.** I did **not** delete it, in case your server is running.
3. 🔴 **The durable fix: change the filenames.** `kitchen-v2.png` / `dashboard-v2.png` (and the two
   `src` values). **Five overwrites at the same two URLs is what created this**, and it will happen
   again on the next replacement. ⚠️ **You told me not to change the image files, so I have not — but
   this is the one change that stops the class of problem.**

**To confirm the diagnosis in one step:** open DevTools → Network, reload, click the request for
`/_next/image?url=%2Fscreenshots%2Fdashboard.png…`, and read the response's intrinsic size. **1668px tall
⇒ stale. 600px tall ⇒ I am wrong and the box is not what it measures.**

---

## What I could not establish

1. 🔴 **That the served image is stale.** **The whole diagnosis rests on it**, it is outside the
   repository, and the network panel settles it in seconds.
2. **Whether the gap persists after a cache bust.** **Not rendered.**
3. **Why `398×298` rather than `400×300`** — a 0.5% shortfall, consistent with `min(72%, 400px)`
   resolving against a container 2px narrower than assumed. **Sub-pixel; not the cause of a 12px band.**
