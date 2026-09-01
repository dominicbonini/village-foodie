# The testimonial logo's alt — the comment

**Workstream:** landing-page — one comment
**Date:** 29 August 2026
**Deploys:** frozen. Nothing deployed, no migration run, no column dropped, no domain removed from Vercel, no credential added.
**Read first:** `docs/landing-logo-alt-report.md` §4, which flagged the gap this closes:

> ⚠️ **The consequence is worth naming: a bare `alt=""` reads like an oversight**, and the next person to run an accessibility sweep may "fix" it back to the business name — reinstating the double announcement. This report is the only record of the reasoning. **If you would like a one-line comment beside it, say so and it is a one-line change.**

🔴 **THE GATE AND THE `noindex` ARE UNTOUCHED.** `app/landing/layout.tsx` is **byte-identical** (`cmp -s`), and `robots: { index: false, follow: false }` is unchanged on line 48.

---

## 1. The change

**One line added at `app/landing/page.tsx:216`.** The element's own line is not touched.

```jsx
{/* 🔴 alt="" IS DELIBERATE, NOT AN OVERSIGHT: "Pizzeria Gusto" is in the role line directly below, so an alt would announce the business name TWICE — and a MISSING alt would make some screen readers read the filename instead. */}
<Image className="quote-logo" src="/gusto-logo.png" alt="" width={320} height={233} />
```

It records both halves of the reasoning, which is what makes it useful: **why there is no alt text** (the name is already announced by the role line beneath) **and why the attribute is present at all rather than removed** (a missing `alt` sends some readers to the filename, `gusto-logo.png`, which is worse than either). A comment that gave only the first half would invite the second mistake.

**The complete diff — a pure addition:**

```
215a216
> {/* 🔴 alt="" IS DELIBERATE, NOT AN OVERSIGHT: … */}

file length: 485 → 486
```

`215a216` is an **append**, not a replacement — line 216 as it stood (the `<Image>`) is now line 217 and is character-for-character what it was. **The attribute, the source, the dimensions, the class and the loading behaviour are all untouched.**

It is a single source line: 246 characters, opening `{/*` and closing `*/}` on itself. Long, but the file's own style carries longer — the blockquote on line 214 is ~210 characters.

---

## 2. Verification

I performed **parse**, **typecheck** and **execution**. All three, in those words.

**Parse.** The edit was applied by anchored, asserted replacement — the script asserts the exact `<Image …>` string occurs exactly once before writing, and inserts above it rather than rewriting it.

**Typecheck.** `npx tsc --noEmit` — clean. `npx eslint app/landing/page.tsx` — **exit 0**.

**Execution.** The rendered testimonial section was captured from a real browser **before** the edit and again after, and the two were compared byte by byte.

### 🔴 The rendered markup is unchanged

```
BEFORE : 1722 bytes of rendered markup
AFTER  : 1722 bytes
✅ BYTE-IDENTICAL — not one character differs
```

```
alt attribute as served                     : alt=""      (empty, unchanged)
comment present in the rendered output      : 0 occurrences
```

**A JSX `{/* */}` comment is stripped at compile time and never reaches the DOM**, which is why the output is identical rather than merely equivalent. That is the whole reason this could be done without touching a character of what renders.

⚠️ **This was captured before and after against the same running dev server**, so the comparison is of two real renders, not of a render against a saved expectation.

### The accessibility behaviour is unchanged

```
accessibility tree — image node names:
  "HatchGrab"
  "Example order ticket: order 17 for Sarah, two Margheritas with no basil, …"
  "Food truck"
  "HatchGrab"
  ""                                    ← the Gusto logo, still decorative

images announcing "Pizzeria Gusto": 0   ✅ still none
```

The four other images keep their accessible names, so nothing was cleared beyond the one already-empty alt.

### Scope

```
✅ app/landing/layout.tsx  — BYTE-IDENTICAL   (the admin gate)
✅ app/landing/landing.css — BYTE-IDENTICAL
✅ robots: { index: false, follow: false } — identical, line 48
   app/landing/page.tsx    — one line added, nothing replaced
```

---

## 3. What remains unobserved

1. **No real screen reader was run.** The proof is Chromium's accessibility tree, which is what VoiceOver, NVDA and JAWS read from — but it is the tree, not a heard announcement.
2. **No production build.** Measured against the dev server. A production build strips JSX comments the same way, but that was not exercised here.
3. **Written permission to publish the testimonial is still recorded nowhere**, which is why the gate stays on. Unchanged by this workstream.

---

**No span of this prompt arrived garbled, and no instruction contradicted another.** "Add a one-line comment" and "change not a character of the rendered output" are consistent precisely because JSX comments are compile-time only — proven above rather than assumed.
