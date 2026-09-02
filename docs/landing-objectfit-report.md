# `object-fit: cover` → `contain` on the screenshot slots

**One CSS declaration changed. Nothing committed, nothing deployed.**
**Restore notes updated by ADDITION only** — `docs/landing-copy-restore-notes.md` §18.

---

## VERIFICATION

**Verified by execution:**

| Check | Result |
|---|---|
| `sips` on both files | `kitchen.png` **640×480 = 1.3333** · `dashboard.png` **800×600 = 1.3333** |
| `next build` + `curl` the image optimiser | serves **640×480** and **800×600** — **both exactly 4:3** |
| `grep` for `object-fit` across `app/` and `components/` | **one** rule reaches these slots |
| `next/image` source (`get-img-props.js`) | does **not** emit `object-fit` for our usage |

**Sanity only:** `tsc --noEmit` exit 0. **Not verification.**

🔴 **I HAVE NOT RENDERED THIS PAGE.** I have not seen the fan before or after. Everything about what
appears on screen is reasoned from the CSS and from what the optimiser returns.

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 1 · The change

**`app/landing/landing.css:185`** — one declaration.

```diff
- .hg-landing .shot img { display: block; width: 100%; height: 100%; object-fit: cover; }
+ .hg-landing .shot img { display: block; width: 100%; height: 100%; object-fit: contain; }
```

The comment block above it (`:176-184`) was rewritten to record why, including the `"d order"` symptom.

**Nothing else in the rule changed** — `display`, `width` and `height` are untouched.

⚠️ **I changed the SHARED `.shot img` rule rather than adding two slot-specific rules.** You asked for
the change on `.shot-kds` and `.shot-dash`; **those are the only two slots that contain an `<img>`**, so
the effect is exactly those two. 🔴 **Adding `.shot-kds img, .shot-dash img { object-fit: contain }`
would have left `cover` standing in the shared rule — two declarations disagreeing, which is precisely
what item 2 warns against.** One rule, one value.

---

## 2 · Every place `object-fit` could reach these slots

**Searched `app/`, `components/` and `app/landing/landing.css` for `object-fit`, `objectFit`,
`object-cover` and `object-contain`.**

| Source | Applies here? |
|---|---|
| **`app/landing/landing.css:185`** — `.hg-landing .shot img` | ✅ **THE ONLY ONE.** Now `contain` |
| `<Image>` `style` prop | ❌ **Neither tag passes `style`** |
| `<Image>` `className` | ❌ **Neither tag passes `className`** — so no Tailwind `object-*` either |
| `<Image>` `fill` | ❌ **Not used.** Both use explicit `width`/`height` |
| Inline `style` on the wrapper divs | ❌ None |
| `next/image` internals | ❌ **See §5** |
| Other `object-fit` hits in the repo | ❌ All in unrelated files — `app/page.tsx:194`, `app/trucks/page.tsx:41,120`, `app/trucks/[slug]/order/page.tsx:2455,2821,4116`, `app/venues/[slug]/VenueClient.tsx:139`, `app/dashboard/[token]/page.tsx:5417`. **None is on the landing page** |

> ✅ **Exactly one declaration governs these slots, so there is nothing to reconcile and no specificity
> contest.**

---

## 3 · What was NOT touched

| | |
|---|---|
| `aspect-ratio` | ✅ **Untouched** — `.shot-kds` `4/3`, `.shot-dash` `4/3`, `.shot-phone` `9/17` |
| `next/image` `width`/`height` | ✅ **Untouched** — `320×240` and `400×300` |
| Image files | ✅ **Untouched** — same bytes, same mtime (21:12) |
| Protected strings, Gusto `height={233}`, feature gate, admin gate | ✅ **Untouched** |

---

## 4 · The phone placeholder

**`.shot-phone` carries `shot-empty` and holds no `<img>`** — two `<span>` elements, `lbl` and `hint`:

```jsx
<div className="shot shot-phone shot-empty"><span className="lbl">Screenshot</span><span className="hint">Customer ordering</span></div>
```

🔴 **The changed rule is `.hg-landing .shot img`. With no `img` inside, it does not match, so this
change cannot affect the placeholder.** Its `aspect-ratio: 9/17`, dashed border, paper background and
centred text are all unchanged. **Not touched, as instructed.**

---

## 5 · Does `next/image` need a `style` or `className` for `contain` to win?

🔴 **No. The CSS is unopposed, and I checked the library rather than assuming.**

**Read from `node_modules/next/dist/shared/lib/get-img-props.js`:** `objectFit` appears there only as
(a) a **legacy `layout`-era prop** you may pass explicitly, and (b) input to the **blur-placeholder's
`background-size`** (`:507-510`). **Neither path applies:** we pass no `objectFit` prop, no `style`, and
`placeholder` defaults to `empty`.

**So the rendered `<img>` carries no inline `object-fit`, and `.hg-landing .shot img` (specificity
0-2-1) is the only declaration in play.**

⚠️ **It WOULD have lost to an inline style** — inline beats any selector short of `!important`. **That
is exactly why it is worth having checked rather than assumed**, and why nothing here needs
`!important`.

⚠️ **One thing `next/image` does still control: which file the browser downloads.** `sizes` drives the
srcset. **That affects resolution, never cropping.**

---

## 6 · Will `contain` show letterbox bars? — 🔴 **No. And that is the problem with this fix.**

**`contain` bars appear only when the image's ratio differs from the box's. Both are 4:3:**

```
frame  .shot-kds  / .shot-dash   aspect-ratio: 4/3          = 1.3333
file   kitchen.png   640x480                                = 1.3333   (verified by sips)
file   dashboard.png 800x600                                = 1.3333   (verified by sips)
optimiser serves     640x480 / 800x600                      = 1.3333   (verified by curl)
```

> ✅ **No bars.** If any did appear, the background behind them is **`.shot`'s
> `background: var(--line)`** — a neutral grey — visible inside the 12px rounded, `overflow:hidden`
> frame.

### 🔴 THE THING YOU NEED TO KNOW BEFORE YOU LOOK AGAIN

**When the box and the image are the same ratio, `cover` and `contain` produce an IDENTICAL result** —
both fill the frame exactly, neither crops, neither letterboxes. **`cover` cannot have zoomed or cut
anything under the current files.**

**So one of these is true, and the change I just made only helps in the second case:**

1. 🔴 **You were looking at a stale render.** The images were replaced at **21:12**, and the previous
   pair were **11-inch, 2420×1668 = 1.4508** — *wider* than a 4:3 box. `cover` on those scales to match
   height and overflows horizontally, **cutting the left and right edges: `"Add order"` → `"d order"`.
   That is an exact match for the symptom.** The filenames did not change, so a browser cache — or the
   Next optimiser cache, which still holds **4 entries** — would keep serving the old image.
   **→ `contain` changes nothing; a hard refresh does.**
2. **The rendered box is not the ratio it is declared to be** — something is sizing `.shot-dash` taller
   than 4:3 at runtime. **→ `contain` fixes the symptom, and bars would appear.**

⚠️ **I could not distinguish these without rendering, and I did not render.** **The change is a genuine
safety net for case 2 and harmless in case 1** — but if the tiles still look zoomed after this, **case 1
is the answer and the fix is a cache-bust, not more CSS.**

**To tell them apart in one step:** hard-refresh (⌘⇧R) and check whether the dashboard tile now reads
`"Add order"`. If it does, it was the cache. **If bars appear instead, it was case 2** — and the box
ratio is the thing to look at, not `object-fit`.

---

## Scope

| Check | Result |
|---|---|
| Files changed | **`app/landing/landing.css` only** — one declaration plus its comment |
| `app/landing/page.tsx` | **Untouched by this change** |
| Image files | **Untouched** |
| Committed / deployed | **Neither** |

⚠️ **`.next/` was rebuilt by the verification build.** Gitignored.

---

## What I could not establish

1. 🔴 **Whether this change fixes what you saw** — §6. **Not rendered.**
2. **Whether your browser was serving a cached pre-21:12 image.** **The single most likely explanation,
   and it is outside the repository.**
3. **Whether the rendered `.shot-dash` box is actually 4:3.** Declared 4:3; **never measured in a
   browser.** DevTools on that element settles it in seconds.
