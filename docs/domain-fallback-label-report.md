# The lapsed-plan fallback label

**Workstream:** custom-domain — the fallback link's label
**Date:** 29 August 2026
**Deploys:** frozen. Nothing deployed, no migration run, no column dropped, no domain removed from Vercel, no credential added.
**Read first:** `docs/domain-fallback-link-report.md` §5.3, which recorded this exact option and its trade-off.

This resolves §5.3 of that report, which read:

> **"See \<name\>'s dates and order"** produces a double possessive for names already ending in *s* — "See Bob's Burgers & Co's dates and order". It reads acceptably but is not elegant. **"Order from \<name\>"** would avoid it and match the destination's own heading exactly, at the cost of not mentioning dates.

You have taken that trade — the double possessive goes, the word "dates" goes with it.

---

## 1. The change

One line of code, in `app/domain/page.tsx`:

```diff
-            See {truck.name}&apos;s dates and order
+            Order from {truck.name}
```

The `&apos;` entity disappears with the possessive; there is no apostrophe left in the label.

**The label is now the destination's heading verbatim.** `app/trucks/[slug]/order/page.tsx:2461` renders:

```tsx
Order from {truckName}
```

Same three words, same interpolated name, same order. A customer pressing the button reads the identical phrase at the top of the page they land on — the label cannot over- or under-promise the destination, because it *is* the destination's own words.

⚠️ **What was given up, stated plainly.** "dates" was the half of the old label that told a customer *why* to press a button on a page whose schedule has just gone. "Order from …" says what the page is for, not what it lists. That was the acknowledged cost in §5.3 and it is still the cost; the destination does list the dates, so the promise is not broken, merely unadvertised.

A four-line note recording the reason and the string it replaced was added to the block's docblock — the only other edit to the file, and it is a comment.

---

## 2. Verification

I performed **parse**, **typecheck** and **execution**. All three, in those words.

**Parse.** `node --check scripts/check-plain-english.mjs` — clean. The page edit was applied by anchored, asserted replacement; the script asserts the anchor occurs exactly once before writing.

**Typecheck.** `npx tsc --noEmit` — clean.

**Execution — the fallback rendered, both name shapes.** The `if (!planGrants)` block was sliced verbatim from the file, compiled with `ts.transpileModule`, and rendered with `react-dom/server` against the **real** `orderPageUrl` loaded from the real `lib/custom-domain/copy.ts` in a `vm`. Nothing reimplemented.

```
NAME ENDING IN s       "Bob's Burgers & Co"
   label: Order from Bob's Burgers & Co
   href : https://www.hatchgrab.com/trucks/bobs-burgers-and-co/order

NAME ENDING IN s       "Athens Gyros"
   label: Order from Athens Gyros
   href : https://www.hatchgrab.com/trucks/athens-gyros/order

NAME NOT ENDING IN s   "Pizzeria Gusto"
   label: Order from Pizzeria Gusto
   href : https://www.hatchgrab.com/trucks/pizzeria-gusto/order

NULL SLUG              "No Slug Truck"
   NO LINK — identity and brand line only (null guard held)
```

Both `s`-ending names read cleanly. The old label would have produced *"See Bob's Burgers & Co's dates and order"* and *"See Athens Gyros's dates and order"*; neither shape occurs now, because the construction that produced them is gone rather than special-cased.

### The href and the null guard are byte-identical

The `<a>` element with only the label line removed from each side, diffed against the pre-edit snapshot:

```
✅ IDENTICAL — guard, href, target, rel and className all unchanged
```

Component by component:

```
href={orderPageUrl(truck.slug)}        before=1 after=1  ✅ identical
{truck.slug && (                       before=1 after=1  ✅ identical
target="_blank"                        before=1 after=1  ✅ identical
rel="noopener noreferrer"              before=1 after=1  ✅ identical
```

The null-guard behaviour is also confirmed by execution above — a null `trucks.slug` still renders the identity and brand line with no button. The helper was not touched, the URL is not composed inline, and `createSlug` is still absent from this path.

### Nothing else on the page changed

Full diff against the pre-edit snapshot — four added comment lines and the one label line, nothing more:

```
175a176,179
>    * ⚠️ THE LABEL IS THE DESTINATION'S OWN HEADING, WORD FOR WORD (29 August 2026). …
188c192
<             See {truck.name}&apos;s dates and order
---
>             Order from {truck.name}
```

With comments stripped from both sides, the **code-only** diff is exactly one line, and the file is the same length:

```
109c109
<             See {truck.name}&apos;s dates and order
---
>             Order from {truck.name}
(lines of code: 127 → 127)
```

**Scope held.** `lib/custom-domain/copy.ts` was not touched this workstream — its mtime is `00:02:43`, from the previous one, against `00:15:33` for the page:

```
app/domain/page.tsx                  2026-08-29 00:15:33   ← edited
lib/custom-domain/copy.ts            2026-08-29 00:02:43   (untouched)
scripts/check-plain-english.mjs      2026-08-29 00:15:43   ← corpus entry
```

### The page still serves

Real browser, the real custom domain, confirming a fallback-only change did not disturb the normal path:

```
http://events.testtruck.test:3000/  →  HTTP 200
Thai Kitchen · Mon 31 Aug 12:00 – 17:30 · Nethergate Brewery & Distillery CO10 9HN · Pre-order · Powered by HatchGrab
normal (plan-granted) render, unaffected: ✅ confirmed
```

### The checker

Corpus entry updated in place, with a comment recording the previous string:

```ts
'fallback link':           'Order from Pizzeria Gusto',
```

```
PLAIN-ENGLISH CHECK — 112 strings, 27 banned words
  PASS  fallback link
  111/112 pass, 1 known violation(s)      exit: 0
```

Passes with no exclusion required. The one known violation is the pre-existing `QR: print or display`, unchanged and still reported rather than excluded.

---

**No span of this prompt arrived garbled, and no instruction contradicted another.** The brief's scope line ("not the href, not the helper, not the null guard") and its instruction to update the checker corpus are consistent — the corpus lives in `scripts/check-plain-english.mjs`, not on the page, so updating it changes nothing the scope line protects.
