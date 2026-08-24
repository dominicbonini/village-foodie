# Cost comparison — panel rebuild (attempt three) and the plan recommendation

**Date:** 24 August 2026
**Status:** built. **NOT deployed, NOT committed, `next dev` not run by me.**
**Prompt integrity:** no span arrived garbled. No instruction contradicted another.

✅ **ONE FILE CHANGED: `app/landing/cost/CostComparison.tsx`** — the hero context panel and question 2.
Cards 1, 3, 4 and 5, the figure, the verb, the percentage line, the anchor sentence, the two-year line
and `YearLine` are all byte-identical (§4).

---

# §1 — 🔴 WHY THE FIRST TWO ATTEMPTS BOTH STRETCHED

Both versions put the label, the amount and the qualifier in a **multi-column grid template** —
`grid-cols-[auto_auto]`, then `grid-cols-[auto_auto_auto]`. Rendered, **both collapsed to a single
column**: every cell became its own line and `text-right` floated the amounts to the far edge. That is
exactly the five-line rendering you reported, twice, and it accounts for both symptom sets:

| | width class | what you saw |
|---|---|---|
| Attempt 1 | `inline-block` | box **too narrow**, cells stacked |
| Attempt 2 | `mx-auto w-max` | box **full width**, cells stacked, amounts far right |

⚠️ **I CANNOT TELL YOU CONCLUSIVELY WHY THE TEMPLATE DID NOT APPLY, AND I AM NOT GOING TO GUESS.** I went
looking in the build output and the artefacts do not settle it: `.next/static/chunks/*.css` is a **stale
production build**, not what your dev server serves, and the dev CSS under `.next/dev` does not contain
the Tailwind utility layer in a form I can grep — `white-space:nowrap`, a utility I know is in use, is
absent from those files too, which tells me the files are incomplete rather than that the class is
missing. 🔴 **Two of my greps along the way were also simply wrong** — class-name escaping in the first,
and shell glob-mangling of filenames containing `[` and `]` in the second. **Any conclusion I drew from
those is withdrawn.**

✅ **WHAT I CAN STATE, AND IT IS THE PART THAT MATTERS:** both layouts **depended on a column template
being honoured, and neither degraded gracefully when it was not.** That is the actual defect, it is
independent of the root cause, and it is what this rebuild removes.

---

# §2 — TASK 1: THE MECHANISM I USED

**Two flex rows. No grid, no width, no template.**

```jsx
<div className="flex justify-center">                                   // centring
  <div className="rounded-xl px-5 py-4" style={{background:'#F8FAFC'}}> // the panel — NO width class
    <div className="flex items-baseline gap-3 whitespace-nowrap text-sm">…</div>
    <div className="mt-1 flex items-baseline gap-3 whitespace-nowrap text-sm">…</div>
    {fleet > 1 && <p className="mt-2 text-right text-xs text-slate-400">across {fleet} trucks</p>}
  </div>
</div>
```

🔴 **A FLEX ROW HAS NO TEMPLATE TO LOSE.** If anything about it fails to apply, the worst case is the
row loses its **gap** — it cannot lose its **line**. That is the whole reason this shape was chosen over
a third set of column values.

🔴 **CENTRING IS THE WRAPPER'S JOB, NOT A WIDTH ON THE PANEL.** A flex item is content-sized by default
(`flex-grow: 0`, `auto` basis), so `justify-center` on the parent centres a content-width panel **without
the panel declaring any width at all**. `inline-block` made it too narrow; `w-max` left it full width.
**Every width this block has ever carried has been the thing that broke it**, and the comment in the file
now says so as a prohibition.

## 2.a THE INSTRUCTED TRADE, TAKEN

✅ **The amounts no longer share a right edge.** The two labels are different lengths, so left-packed
flex rows cannot align the amounts without a fixed label width — **which is another measurement that can
fail, which is the entire problem**. You said the rows reading as two clean lines matters more. **They
do, so I dropped the alignment.**

## 2.b KEPT

✅ **"a year" is now on BOTH rows**, not hanging off the first as a shared qualifier — so a reader who
scans one row cannot take that figure as monthly.
✅ Tinted fill `#F8FAFC`, `rounded-xl`, `px-5 py-4`, our amount `font-semibold text-slate-700`
(⚠️ **unconditional — it marks OUR row, not the winning row**), and the fleet note inside the panel.
✅ Rows are `mt-1` apart — **one pair, not two paragraphs** — and `mt-1` is a whole step, not a
fractional one.

## 2.c RENDERED LINE STRUCTURE

```
  ONE TRUCK, POSITIVE                THREE TRUCKS                    NEGATIVE
  ┌────────────────────────────┐     ┌──────────────────────────┐    ┌─────────────────────────┐
  │ Right now you pay  £2,520 a year │ Right now you pay  £25,200 a year │ Right now you pay  £600 a year │
  │ With HatchGrab     £1,084 a year │ With HatchGrab     £10,140 a year │ With HatchGrab     £948 a year │
  └────────────────────────────┘     │            across 3 trucks │    └─────────────────────────┘
                                     └──────────────────────────┘
     2 lines                            2 lines + the fleet note        2 lines
```

✅ **Two lines in every case**, each `label · 12px gap · amount a year`, `whitespace-nowrap` so neither
half can break mid-phrase.
✅ **The negative case reads honestly and unflatteringly** — `£600 → £948`, ascending, with the
semibold on our (dearer) number, "You'd pay extra" below it and no anchor sentence. **Nothing here
claims a saving.**

---

# §3 — TASK 2: TITLE AND RECOMMENDATION

✅ **Title follows question 1**, off the already-clamped `fleet`:
- `fleet === 1` → **"How many people work the van?"**
- `fleet > 1` → **"How many people work across your vans?"**

✅ **The answers are still binary** — "One" and "Two or more". **No third option was added.**

## 3.a THE FOUR VARIANTS, RESOLVED THROUGH THE REAL CONSTANTS

```
  1 truck  · One       Pro covers it. £29 per truck per month, with £1,500 of online orders included.
  1 truck  · Two+      We suggest Max. Everyone gets their own login. £49 per truck per month,
                       with £2,000 of online orders included.
  3 trucks · One       Pro covers it. £29 per truck per month, with £1,500 of online orders
                       included on each.
  3 trucks · Two+      We suggest Max. Everyone gets their own login. £49 per truck per month,
                       with £2,000 of online orders included on each.
```

✅ **"on each" IS GATED ON `fleet`, NOT ON `staff`** — the allowance is per truck, so "on each" only
means anything when there is more than one truck to spread it across. **Both cases handled, as you
required.**

## 3.b 🔴 CONFIRMED: EVERY NUMBER IS INTERPOLATED

```
  £29 / £49    ← gbp(plan) ← tier.monthly ← PLAN_MONTHLY_PENCE   (lib/features.ts)
  £1,500/£2,000← tier.allowanceLabel ← allowancePenceFor(...) ← PLAN_ONLINE_ALLOWANCE
                                                                 (lib/plan-features.ts)
  Pro / Max    ← planName ← tier.name
```

✅ **A grep for `£29`, `£49`, `£1,500`, `£2,000`, `£1500` and `£2000` finds FOUR hits in the file and all
four are inside comments** (three of them warnings saying not to hardcode these). **No price or allowance
literal exists in any rendered string.** The table in §3.a was produced by resolving `PLAN_MONTHLY_PENCE`
and `PLAN_ONLINE_ALLOWANCE` out of the lib files and running the page's own `gbp` — **not by reading the
numbers off your brief.**

⚠️ **The wording states the plan as a suggestion now, not as a fact.** Two people needing two logins is a
reason to *suggest* Max; it was never a finding about the operator's business.

---

# §4 — VERIFICATION

| Check | Method | Result |
|---|---|---|
| Change confined | comment-stripped diff | ✅ **14 code lines out, 19 in** |
| Cards 1, 3, 4, 5 | 600-char forward window each | ✅ **all identical** |
| Figure / verb / percentage / anchor | 300-char window each | ✅ **identical** |
| Two-year line, `YearLine` | 300-char window each | ✅ **identical** |
| Two lines per state | structure walk, 3 states | ✅ **§2.c** |
| No hardcoded prices | grep six literal forms | ✅ **4 hits, all in comments** |
| Four sentence variants | resolved from the lib constants | ✅ **§3.a** |
| Typecheck | `npx tsc --noEmit` | **exit 0, zero output** — ⚠️ **not verification** |
| Character census | NUL / control / carrier-aware selectors | ✅ **clean** |

---

# §5 — WHAT REMAINS UNOBSERVED

1. 🔴 **THE PANEL HAS NOT BEEN SEEN. THIS IS ATTEMPT THREE AND THE PREVIOUS TWO BOTH TYPECHECKED
   CLEAN AND BOTH RENDERED WRONG.** I have no standing to tell you this one is right. What I can say is
   that it no longer depends on the thing that failed twice: **there is no grid template and no width
   class left in the block.**
2. 🔴 **IF IT IS STILL WRONG, THE INFORMATION I NEED IS WHETHER THE PANEL IS FULL WIDTH OR
   CONTENT WIDTH** — that single fact separates "the flex wrapper isn't centring" from "something is
   overriding display on these children", and they have opposite fixes.
3. ⚠️ **The dropped right-edge alignment is a real visual change**, not just a concession — the two
   amounts now start at different horizontal positions. **You authorised the trade; you have not seen its
   cost.**
4. ⚠️ **The recommendation sentence is now noticeably longer** than the line it replaced — two sentences
   for the Max case. **Whether it wraps awkwardly inside card 2 at 375px is unmeasured.**
5. ⚠️ **A STALE COMMENT I DELIBERATELY DID NOT TOUCH.** `YearLine` carries
   `The tier is already stated once, in question 2 ("Pro — £29 per truck per month…")`. That quotation no
   longer matches the wording. **Its actual claim — that question 2 names the tier — is still true**, and
   `YearLine` is outside this brief's scope, so **I left it and am telling you instead of editing it.**
   One-line fix whenever `YearLine` is next in scope.
6. ⚠️ **Carried forward:** the `mt-8` separator above the two-year line, the zero-state £0 at 92px, the
   range focus ring, 375px generally, the nav anchors, and the gate, which has still never fired.
