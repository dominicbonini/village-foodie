# The testimonial logo's alt text

**Workstream:** landing-page — the logo's alt text
**Date:** 29 August 2026
**Deploys:** frozen. Nothing deployed, no migration run, no column dropped, no domain removed from Vercel, no credential added.
**Read first:** `docs/landing-testimonial-style-report.md` §3, which flagged this and proposed exactly this fix:

> ⚠️ **ONE THING I DID NOT FIX, BECAUSE IT WOULD MEAN EDITING THE LOGO.** The logo still carries `alt="Pizzeria Gusto"`, so **a screen reader hears the business name from the image and again from the role line.** … The fix is `alt=""` on a decorative logo whose name is in adjacent text — a one-attribute change to the element this workstream was told not to touch. **Flagged, not changed.**

🔴 **THE GATE AND THE `noindex` ARE UNTOUCHED.** `app/landing/layout.tsx` is **byte-identical** (`cmp -s`), and `robots: { index: false, follow: false }` is unchanged on the same line.

---

## 1. The element, before and after

`app/landing/page.tsx:216` — the only `alt=` attribute on the entire page.

**Before:**

```jsx
<Image className="quote-logo" src="/gusto-logo.png" alt="Pizzeria Gusto" width={320} height={233} />
```

**After:**

```jsx
<Image className="quote-logo" src="/gusto-logo.png" alt="" width={320} height={233} />
```

**The complete diff of the file — one line replaced, same file length:**

```
216c216
< <Image className="quote-logo" src="/gusto-logo.png" alt="Pizzeria Gusto" width={320} height={233} />
---
> <Image className="quote-logo" src="/gusto-logo.png" alt="" width={320} height={233} />

changed lines: 2  (one line replaced)
file length:   485 → 485
```

**Everything else about the element is byte-identical**, confirmed from the served DOM rather than the source:

```
src          : /_next/image?url=%2Fgusto-logo.png&w=640&q=75
currentSrc   : …/_next/image?url=%2Fgusto-logo.png&w=384&q=75
width/height : 320 / 233
class        : quote-logo
loading      : lazy      decoding: async
loaded       : true      natural 320x233      rendered box 77x56
```

Source, dimensions, class, loading behaviour and decoding are all as they were.

---

## 2. Why an empty string rather than a removed attribute

`alt=""` and a missing `alt` are **not** the same thing to assistive technology. An empty string is a positive declaration that the image is decorative, and the image is removed from the accessibility tree. A *missing* `alt` leaves the element with no accessible name and many screen readers fall back to announcing the filename — here, `gusto-logo.png`, which would be worse than what we started with.

`next/image` requires the `alt` prop, so it could not have been dropped in any case; and `jsx-a11y/alt-text` accepts `alt=""` as an explicit decorative marker. **eslint exits 0.**

---

## 3. Verification

I performed **parse**, **typecheck** and **execution**. All three, in those words.

**Parse.** The edit was applied by anchored, asserted replacement — the script asserts the exact element string occurs exactly once before writing.

**Typecheck.** `npx tsc --noEmit` — clean. `npx eslint app/landing/page.tsx` — **exit 0**.

**Execution.** The page was loaded in a real browser, the served element read from the DOM, the accessibility tree snapshotted, and the testimonial screenshotted and compared pixel by pixel against the capture taken before this change.

### The name is announced once

**From the accessibility tree, not from reading the attribute** — every image node on the page:

```
role=image  name="HatchGrab"
role=image  name="Example order ticket: order 17 for Sarah, two Margheritas with no basil, …"
role=image  name="Food truck"
role=image  name="HatchGrab"
role=image  name=""                    ← the Gusto logo, now decorative

images announcing "Pizzeria Gusto": 0   ✅
```

⚠️ **The other four images keep their accessible names**, which is the proof that this was one attribute and not a blanket clear.

### The rendered attribution text is unchanged

```
1. Nadia & Bogdan
2. Owners, Pizzeria Gusto
3. Mobile Pizzeria of the Year
4. Regional winner

visible text of the block: "Nadia & Bogdan Owners, Pizzeria Gusto Mobile Pizzeria of the Year Regional winner"
times "Pizzeria Gusto" appears: 1
```

Character for character what `docs/landing-testimonial-style-report.md` §3 recorded. **The quote's own words were not touched and are not part of this change.**

### Nothing else on the page changed

```
✅ app/landing/layout.tsx  — BYTE-IDENTICAL   (the admin gate)
✅ app/landing/landing.css — BYTE-IDENTICAL
✅ robots: { index: false, follow: false } — identical, same line number
   app/landing/page.tsx    — one line, same file length
```

**And nothing a sighted reader sees changed at all.** The testimonial block was screenshotted at 1440px before and after and compared byte by byte:

```
before: 1440x473   after: 1440x473
differing bytes: 0 of 2,043,360  (0.0000%)
✅ PIXEL-IDENTICAL
```

---

## 4. One thing I deliberately did not add

The brief said *"Scope is one attribute. Change nothing else."*, so **I did not add a code comment explaining why the alt is empty.**

⚠️ **The consequence is worth naming: a bare `alt=""` reads like an oversight**, and the next person to run an accessibility sweep may "fix" it back to the business name — reinstating the double announcement. This report is the only record of the reasoning. **If you would like a one-line comment beside it, say so and it is a one-line change.**

---

## 5. What remains unobserved

1. **No real screen reader was run.** The proof is Chromium's accessibility tree, which is what VoiceOver, NVDA and JAWS read from — but it is the tree, not an actual announcement heard end to end.
2. **No production build.** Measured against the dev server.
3. **Written permission to publish the testimonial is still recorded nowhere**, which is why the gate stays on. Unchanged by this workstream.

---

**No span of this prompt arrived garbled, and no instruction contradicted another.** "Set its alt to an empty string" and "do not change … anything else about the element" are consistent: the alt is the one attribute changed, and every other attribute was verified unchanged in the served DOM.
