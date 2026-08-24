# Cost comparison page — two small fixes

**Date:** 23 August 2026
**Status:** **FIX 1 APPLIED. FIX 2 STOPPED** — it cannot be done in `app/landing/cost/page.tsx` alone,
which is the case your own instruction told me to stop on.
**NOT deployed, NOT committed, `next dev` NOT run.**
**Prompt integrity:** no span arrived garbled. No instruction contradicted another.

✅ **ONE FILE CHANGED: `app/landing/cost/page.tsx`.** `lib/pricing.ts` (15:51), `lib/features.ts`
(22:32), `lib/plan-features.ts` (22:33), `app/landing/layout.tsx` and `app/landing/page.tsx` (18:17) all
predate the page (22:58) and were not reopened.

---

# FIX 1 — APPLIED

## 1.a The test is asked of the formatter, not of the number

```ts
function rendersAsZero(n: number): boolean {
  return gbp(n) === gbp(0)
}

/** Do we announce a SAVING? Only when it is positive AND survives formatting. */
function isRealSaving(n: number): boolean {
  return n > 0 && !rendersAsZero(n)
}
```

✅ **No threshold, no second magic number.** The decision is made on **the string the operator will
actually see**, so display and claim cannot diverge. **If `gbp()` ever changes to 2dp, this follows it
automatically** — which is precisely what a `>= 1` threshold would not do, and would fail in the
*other* direction (suppressing a genuine £0.60 saving that now printed as "£0.60").

⚠️ **The conjunction matters.** `rendersAsZero(-0.004)` is **false** — `gbp(-0.004)` is `"-£0"`, which
is not `"£0"` — so the `n > 0` half is what rejects tiny negatives. Neither half is redundant.
**`-£0` never actually renders**: every display site passes `Math.abs()`.

## 1.b Applied at all four sites that announce a saving as a figure

| Site | Before | Now |
|---|---|---|
| Primary CTA label | `m.saveY1 > 0` | `isRealSaving(m.saveY1)` via `good` |
| Hero heading + colour + the "that's a new fryer" anchor | `good = m.saveY1 > 0` | `good = isRealSaving(m.saveY1)` |
| Two-year total — *"Over two years that's £X saved"* | `m.twoYear > 0` | `isRealSaving(m.twoYear)` |
| `YearLine` — *"Save £X"* / *"Extra £X"*, and its colour | `save >= 0` | `isRealSaving(save)` |

⚠️ **`YearLine` IS A JUDGEMENT CALL AND I AM FLAGGING IT RATHER THAN BURYING IT.** A value that rounds
away now reads **"Extra £0"** rather than "Save £0". Both are odd; **"Extra £0" is at least literally
true** (there is £0 difference) and stops short of claiming a saving, which is the whole point of the
fix. 🔴 **I did not invent a third wording** — a dedicated "Level" or "No difference" would read better
and is a copy decision, not a fix. **Yours if you want it.**

## 1.c ✅ THE BOUNDARY, EXERCISED

The four functions were **extracted verbatim from the page** and their types stripped **by the TypeScript
compiler** rather than by regex (my first attempt used a regex and silently ate the `dp` parameter —
recorded because it would have produced a confident wrong table):

```
   saving   gbp()    rendersAsZero  isRealSaving  CTA label                     hero heading               YearLine
   0.004    £0       true           false         "Try it with your menu →"     Extra in your first year   "Extra £0"
   0.5      £1       false          true          "Start free and save £1 →"    Your first year saving     "Save £1"
   0.99     £1       false          true          "Start free and save £1 →"    Your first year saving     "Save £1"
   1        £1       false          true          "Start free and save £1 →"    Your first year saving     "Save £1"

   surrounding:
   0        £0       false(isRealSaving)  "Try it with your menu →"
   -0.004   -£0      false                "Try it with your menu →"
   -1       -£1      false                "Try it with your menu →"
   472.1    £472     true                 "Start free and save £472 →"
   5062.8   £5,063   true                 "Start free and save £5,063 →"
```

✅ **The boundary sits at 0.5, and it belongs to `gbp()` rather than to any constant in the test:**

```
   0.4 -> £0   0.49 -> £0   0.5 -> £1   0.51 -> £1
```

**That is the property you asked for.** `rendersAsZero(n)` *is* `gbp(n) === gbp(0)`.

---

# FIX 2 — 🔴 STOPPED. IT CANNOT BE DONE IN THIS FILE.

**Your instruction:** *"If this cannot be done in the page alone — if it needs a layout or a server
component — STOP and tell me rather than widening the scope yourself."* **It needs a server component.**

## 2.a The chain that blocks it, read from source

```
app/landing/cost/page.tsx      'use client'   (9 useState/useMemo usages — it must be)
        ↓ would need
verifyAdmin            lib/auth/admin.ts
        ↓ imports
createSupabaseServerClient     lib/supabase/server.ts
        ↓ imports
cookies()              next/headers          ← SERVER-ONLY
```

🔴 **`next/headers` cannot be imported into a client module** — Next.js rejects it at build. And
**`'use client'` is module-scoped**, so one file cannot be a server component that gates and a client
component that holds the calculator. **The page is `'use client'` out of necessity: it is nine hooks of
interactive state.**

## 2.b 🔴 AND THE IN-SCOPE WORKAROUND WOULD BE A FAKE GATE, WHICH IS WORSE THAN NONE

`NEXT_PUBLIC_PRICING_PUBLISHED` **is** readable client-side, so I could have written
`{PRICING_PUBLISHED || isAdmin ? <Calculator/> : null}` inside the page and called it done.

🔴 **THAT WOULD NOT PROTECT THE PRICES.** A client-side conditional hides the markup, **not the bundle**
— `PLAN_MONTHLY_PENCE`, the allowances and the platform fee are imported into this module and ship to
the browser in the JavaScript whatever the conditional says. Anyone opening devtools reads them.

⚠️ **It would also require a second admin check**, since the real one cannot run there — exactly what
your brief forbids.

🔴 **A gate that looks like protection and is not is the worse outcome**, because the next person reads
the conditional and stops asking. **So I did not write it, and I added no partial version:** `grep` for
`verifyAdmin`, `next/headers`, `PRICING_PUBLISHED` or `lib/auth` in the page returns **nothing**.

## 2.c The minimal shape, for your approval — NOT BUILT

Two files, no new logic:

```
app/landing/cost/page.tsx          → becomes a SERVER component:
                                       if (!PRICING_PUBLISHED && !(await verifyAdmin())) redirect('/contact')
                                       return <CostComparison />
app/landing/cost/CostComparison.tsx → 'use client', the entire current file body, unchanged
```

✅ **It reuses the landing layout's own check** (`verifyAdmin` from `lib/auth/admin`) with no second
mechanism, and the prices never reach a non-admin's bundle because the client module is never rendered.

**What a non-admin would see with the flag unset:** a redirect to `/contact` — **the same destination
the landing layout already sends them to**, so the two gates agree rather than each inventing a
behaviour. ⚠️ **With the flag SET, the page opens to everyone by itself**, which is the property you
asked for: *open by itself at launch, impossible to leak before it.*

⚠️ **One consequence worth deciding with it:** the page would then be reachable by non-admins **while the
landing itself is still gated**, since it would no longer depend on the landing's gate for its safety.
That is arguably correct — it is what "opens by itself at launch" means — but it is a behaviour change
to state, not to discover.

---

# §3 — VERIFICATION

| Check | Method | Result |
|---|---|---|
| Fix 1 boundary | four functions extracted verbatim from the page, types stripped by `ts.transpileModule`, driven across 0.004 / 0.5 / 0.99 / 1.00 plus five surrounding cases | ✅ **table in 1.c** |
| Fix 1 applied everywhere a saving is announced | grep of the four sites | ✅ **CTA, hero, two-year, YearLine** |
| No partial Fix 2 in the page | grep for `verifyAdmin` / `next/headers` / `PRICING_PUBLISHED` / `lib/auth` | ✅ **zero hits** |
| Typecheck | `npx tsc --noEmit` | **exit 0, zero output** — ⚠️ **not offered as verification**, per your standing instruction |
| Scope | mtimes + `git status` | ✅ **only `app/landing/cost/page.tsx`** |
| Character census | NUL / control / carrier-aware selectors | ✅ **0 NUL, 0 orphan selectors, no bare glyphs** |

---

# §4 — WHAT REMAINS UNOBSERVED

1. 🔴 **NOTHING HAS BEEN RENDERED.** `next dev` was not run. **The page has still never been displayed
   at any width.** The Fix 1 table is the behaviour of the real functions on real inputs — **it is not
   a screenshot of the CTA.**
2. 🔴 **FIX 2 IS NOT DONE, so the exposure it addresses is unchanged.** The page still reads price
   numbers that `lib/pricing.ts` does not mask, and **is still safe only because the landing layout
   happens to gate it.** ⚠️ **That is exactly the accident your brief wanted removed, and it is still
   there.**
3. ⚠️ **"Extra £0" has never been seen in context** (1.b). It is reachable only in a band roughly a
   penny wide, so it is unlikely to be seen at all — which is also why I would not spend new copy on it
   without your say-so.
4. ⚠️ **The range focus ring is still unobserved**, carried from the build report. Still the first thing
   I would look at in a browser.
5. ⚠️ **`gbp()`'s 2dp path is still only exercised by the per-truck overage line**, and that has not
   been rendered either.

## 🔴 ONE DECISION WAITING ON YOU

**Approve the two-file split in 2.c**, or tell me to leave Fix 2 and accept that the page's safety
depends on the landing's gate. **I will not widen the scope to a second file without that.**
