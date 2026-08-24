# Cost comparison page — build report

**Date:** 23 August 2026
**Status:** built, **NOT deployed, NOT committed, `next dev` NOT run.** Joins the undeployed batch.
**Prompt integrity:** no span arrived garbled. No instruction contradicted another.

✅ **THE REFERENCE FILE WAS CHECKED FIRST AND IS CLEAN.** `~/Downloads/cost-comparison-v11.jsx`,
16,791 bytes, decodes as UTF-8, **zero mojibake markers** (`Â£`, `Ã`, `â€`, BOM — all absent), and a
full non-ASCII inventory of exactly what it should contain:

```
  U+00A3 '£' x3    U+2014 '—' x3    U+00B7 '·' x3    U+2192 '→' x3
```

⚠️ **The copy pasted into chat on the previous attempt WAS damaged** (`Â£`, `â`). **The download-to-disk
rule is what made the difference, and this is the second time it has proved itself in two days.** The
disk file is what I built from.

✅ **ONE FILE CREATED: `app/landing/cost/page.tsx`.** Nothing else was touched — `lib/features.ts`
(22:32) and `lib/plan-features.ts` (22:33) carry only the previous task's constants refactor and were
not reopened (page written 22:51). `lib/pricing.ts`, the landing page, its layout and the pricing table
are untouched. **The pricing snapshot from the last task still byte-matches its pre-refactor baseline.**

---

# §1 — WHERE IT LIVES AND WHAT GATES IT

**Route: `app/landing/cost/page.tsx` → `/landing/cost`.**

**Gate inherited: `app/landing/layout.tsx`**, which in production runs `verifyAdmin()` and redirects
anyone else to `/contact`, with `export const dynamic = 'force-dynamic'` so it evaluates per request.

✅ **INHERITED BY CONSTRUCTION, NOT COPIED.** A Next.js layout wraps every descendant route, so the
gate applies without a second file existing. **There is nothing to keep in sync and nothing to forget.**

⚠️ **Recorded in the page header for whoever moves it later:** the gate moves with the route or it is
gone, and **a copied gate must redirect to `/contact`, never to `'/'`** — `proxy.ts` rewrites `'/'` to
the landing on hatchgrab.com, so redirecting there loops forever on the domain given to Apple as the
Marketing URL.

⚠️ **The page is `'use client'` inside a server layout.** That is the supported arrangement and is how
`DemoModalProvider` already works on the landing.

---

# §2 — TASK 1: EVERY NUMBER, BY CONSTANT NAME

| Displayed value | Comes from | Module |
|---|---|---|
| Pro monthly £29 | `PLAN_MONTHLY_PENCE.pro / 100` | `lib/features.ts` |
| Max monthly £49 | `PLAN_MONTHLY_PENCE.max / 100` | `lib/features.ts` |
| Pro allowance £1,500 | `allowancePenceFor('pro')` → `allowanceAmountLabel(...)` | `lib/plan-features.ts` |
| Max allowance £2,000 | `allowancePenceFor('max')` → `allowanceAmountLabel(...)` | `lib/plan-features.ts` |
| Platform fee 0.99% | `PLATFORM_FEE_OVER_ALLOWANCE.pct` | `lib/plan-features.ts` |
| Card processing 1.5% | `CARD_FEES.online.pct` | `lib/plan-features.ts` |
| Card processing 20p | `CARD_FEES.online.pence` | `lib/plan-features.ts` |

## 2.a ✅ THE LITERAL SCAN: ZERO OF THE SEVEN REMAIN

Comments stripped, executable code only:

```
     0  29 (plan price)          0  1500 / 1,500        0  0.99
     0  49 (plan price)          1  2000 / 2,000        0  1.5 (card pct)
                                                        1  20 (card pence)
```

🔴 **TWO HITS, AND NEITHER IS A PRICING LITERAL. I READ BOTH RATHER THAN REPORTING THE COUNT.**

1. **`if (v < 2000) return 'a new fryer and griddle'`** — a band threshold in `anchor()`, which turns a
   saving into a physical comparison. **A copy threshold, not the £2,000 allowance.** From the prototype,
   unchanged.
2. **`useState('20')`** — the **prefill for what the operator pays their CURRENT provider**.

🔴 **AND THE SECOND ONE IS A TRAP I HAVE COMMENTED AGAINST.** §21 records Hatches Up's cost model as
*"4.5% + 20p all-in on online orders"* — **so `4.5` and `20` are the COMPETITOR's published rates**,
correctly literals here. The 20p **coincidentally equals `CARD_FEES.online.pence`**, and the page
subtracts one from the other. **Wiring it to `CARD_FEES` would look like a tidy-up and would silently
make the competitor's fee track ours.** The comment at that line says so.

**So: zero of the seven forbidden literals survive.**

## 2.b ✅ THE UNION IS HANDLED AT MODULE LOAD, AND IT FAILS LOUDLY

```ts
const PLANS = {
  pro: { …, allowance: allowancePenceFor('pro') / 100, allowanceLabel: allowanceAmountLabel(allowancePenceFor('pro')) },
  max: { …, allowance: allowancePenceFor('max') / 100, allowanceLabel: allowanceAmountLabel(allowancePenceFor('max')) },
} as const
```

**Two layers, and both are needed:**

- **Compile time:** `allowancePenceFor` is typed `(tier: 'pro' | 'max')`, so `'none'` and `'unlimited'`
  are unreachable **by the type system** — the page cannot ask for a tier it does not offer.
- **Run time:** the helper **throws** if a tier stops being `{ kind: 'amount' }`. 🔴 **Resolved at MODULE
  SCOPE rather than in render, deliberately** — the failure then happens at import, before anything
  paints, rather than on the third click of a page that has already shown someone a number. **An
  unreachable state should break the page load, not the interaction.**

✅ **No silent fallback to zero exists anywhere:** a zero allowance would make the page compute a
platform fee on the operator's entire turnover and overstate our own cost.

---

# §3 — TASK 2: THE FORMATTER MAPPING

✅ **`toLocaleString` occurrences in the page: 0.**

| Displayed number | Goes through |
|---|---|
| The plan allowance (3 places: card 2, card 3 over/under branches) | **`allowanceAmountLabel`** — the shared helper, `lib/plan-features.ts` |
| Every other money figure — hero saving, GMV, excess, per-truck overage, fleet GMV, plan monthly, year one/two totals, two-year total, AOV (12 call sites) | **local `gbp()`**, using the **same regex grouping** as `allowanceAmountLabel` |
| Card processing rate `{CARD_PCT}% + {CARD_PENCE}p` (4 sites) | **raw** — a rate, not money; no grouping applies |
| Platform fee `{OVERAGE}%` (1 site) | **raw** — same reason |
| Effective percentages | `.toFixed(1)` / `.toFixed(0)` — percentages, not currency |

🔴 **WHY A LOCAL `gbp()` AND NOT THE SHARED HELPER FOR EVERYTHING:** `allowanceAmountLabel` takes
**pence** and renders **whole pounds**. The page's own figures are **pounds** and sometimes need **2dp**
(the per-truck overage). Reusing it would have meant converting back to pence to be re-divided. **The
grouping expression is identical** — `replace(/\B(?=(\d{3})+(?!\d))/g, ',')` — so the two cannot
diverge on the thing that mattered.

**Verified side by side on this host:**

```
       999 -> gbp "£999"        toLocaleString "£999"
      1500 -> gbp "£1,500"      toLocaleString "£1,500"
   1234567 -> gbp "£1,234,567"  toLocaleString "£1,234,567"
   allowanceAmountLabel: pro £1,500   max £2,000
```

⚠️ **Identical HERE because this host has full ICU.** That is the point: **on a trimmed-ICU runtime
`toLocaleString` would render `£1500` while `allowanceAmountLabel` still rendered `£1,500`, on the same
screen.** The regex is deterministic everywhere.

---

# §4 — TASK 3: COPY

- ✅ Headline unchanged.
- ✅ Sub-line now *"Takes about a minute, and you'll see what a year on HatchGrab would save you."*
- ✅ **"included" now always names what is included**, in all three places:
  card 2 *"…of online orders included on each"*; card 3 over-allowance *"{£1,500} of online orders
  included per truck"*; card 3 under-allowance rewritten to *"Inside the {£1,500} of online orders
  included — nothing on top of the plan."*
- ✅ **The "Adjust plan prices" toggle and both `Num` inputs are deleted**, along with the
  `proPrice` / `maxPrice` / `open` state and the `Num` component. **An editable price on a page that
  computes a saving is a page that can be made to say anything** — recorded at the site.

## 4.a ⚠️ ONE CHANGE YOU ASKED FOR MID-TURN: "MONTHS FREE" IS ITS OWN QUESTION

Lifted out of card 4 into **card 5, *"How many months free do you get?"***, matching the voice of the
other four titles and carrying the same `disabled={!staff}` gate.

✅ **You were right, and the reason is sharper than layout:** card 4 asks *"What do you pay per order
**now**?"* — about the operator's **current provider**. Months free is a **HatchGrab** offer. Nesting it
there put our number inside their question and **quietly implied the free months were something their
existing provider gave them.** Separate subject, separate card.

---

# §5 — TASK 4: THE CTAs, AND THE FALLBACK EXERCISED

**Both CTAs use `DemoCta`**, wrapped in `DemoModalProvider` with `DemoModal` rendered once — **exactly
the landing's arrangement**, not `/signup`.

- **Primary**, inside the results card, full-width bar under the hero figure.
- **Secondary**, after the small print at the very bottom, plainer: *"Try it with your menu →"*.

## 5.a ✅ THE FALLBACK WAS EXERCISED, NOT ASSUMED

`group()` and `gbp()` were **extracted from the page source** (not retyped), the real constants loaded
through `jiti`, and the maths driven across the sign of the saving:

```
  POSITIVE  save=    472.10  label="Start free and save £472 →"      typical: 4.5%+20p, £2,500/mo, Pro
  POSITIVE  save=   5062.80  label="Start free and save £5,063 →"    3 trucks, £8,000/mo, Max
  NEGATIVE  save=   -466.80  label="Try it with your menu →"         competitor charges exactly card cost
  NEGATIVE  save=   -348.00  label="Try it with your menu →"         competitor cheaper than card cost
  NEGATIVE  save=   -582.00  label="Try it with your menu →"         tiny volume on Max

  save=         0  ->  "Try it with your menu →"      (exact zero, both signs)
  save=        -1  ->  "Try it with your menu →"
```

✅ **Zero and negative both take the fallback**, because the test is `save > 0`.

⚠️ **ONE EDGE I FOUND WHILE DOING IT, AND IT IS REAL IF VANISHINGLY UNLIKELY:** a saving of a fraction
of a penny is `> 0`, so it renders **"Start free and save £0 →"**. It needs the operator's cost to land
within a penny of ours across a whole year. **Not fixed** — it was not in scope and the fix is a
threshold decision (`> 0` → `>= 1`?) that is yours. **Reported rather than quietly changed.**

---

# §6 — TASK 5: THE QUALITY FLOOR

| Requirement | What was done |
|---|---|
| **Four truck buttons at 375px** | `flex flex-wrap gap-2 sm:gap-3` with `min-w-0 flex-1` on each. Three buttons plus the "4+" box on one 335px row leaves each under 70px, so **wrapping is what prevents the overflow** |
| **Two fee inputs side by side** | `min-w-0` on both `flex-1` halves and `w-full min-w-0` on the inputs. ⚠️ **`min-w-0` is the whole fix**: without it a flex child refuses to shrink below its content width and the row pushes past the card |
| **Keyboard focus on ranges** | 🔴 explicit `:focus-visible` rules on `::-webkit-slider-thumb` and `::-moz-range-thumb` (a 4px orange halo). **The default outline draws around a 6px-tall track and is effectively invisible** — which your own report predicted |
| **Focus elsewhere** | `focus-visible:ring-2` (+ offset) on every button and number input; `focus-visible:ring-4` on both CTAs |
| **Accessible labels** | All five `aria-label`s from the prototype kept verbatim; the two fee inputs also keep their visible `<span>` labels inside `<label>` |
| **Empty / non-numeric input** | See 6.a |

## 6.a ✅ THE NUMBER INPUTS WERE RESTRUCTURED, AND THE REASON IS NOT PEDANTRY

**The prototype stored these as numbers**, so `+''` became `0` and `+'abc'` became `NaN`. **Clearing a
field to retype it snapped the value to zero and fought the cursor**, and `NaN` propagated into the
arithmetic and out to the hero figure.

**Now: the raw string is state, the number is derived** through

```ts
function numOr(raw: string, fallback: number): number {
  if (raw.trim() === '') return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}
```

and `gbp()` itself is defensive (`Number.isFinite(n) ? n : 0`). **Exercised on hostile input:**

```
    NaN -> "£0"    Infinity -> "£0"    -Infinity -> "£0"    -250.5 -> "-£251"
```

⚠️ `trucks` stays a number (the 1/2/3 buttons set it directly) with a **separate raw string for the "4+"
box**, clamped to 1-50 on entry.

---

# §7 — TASK 6: THE TYPECHECK

**`npx tsc --noEmit` → exit 0, zero output, whole project.**

✅ **The gap you named is closed.** The previous task added a discriminated union
(`OnlineAllowance`) and a narrowed-key `Record<'trial'|'starter'|'pro'|'max', …>` and could only
parse-check them. **This page is their first consumer** — it indexes the record, calls the narrowing
accessor, and uses `as const` on the derived plan map — **and the compiler accepts all of it.**

⚠️ **Not offered as verification, per your instruction.** It proves the shapes are consistent. It proves
nothing about whether the page renders or whether the arithmetic is right.

---

# §8 — WHAT REMAINS UNOBSERVED

1. 🔴 **NOTHING HAS BEEN RENDERED.** `next dev` was not run, per scope. **The page has never been
   displayed at any width, on any device.** Everything in §6 is a class-level argument, not an
   observation.
2. 🔴 **THE 375px CLAIMS ARE THE WEAKEST THING HERE.** `flex-wrap` guarantees the truck buttons *wrap*
   rather than overflow — **it does not tell me whether a wrapped row of three digits and a "4+" box
   looks deliberate or broken.** Same for the two fee inputs at their minimum width.
3. 🔴 **THE RANGE FOCUS RING HAS NEVER BEEN SEEN.** Pseudo-element focus styling is the most
   browser-divergent thing on the page; `:focus-visible` on a slider thumb is exactly where support
   varies. **This is the single item I would look at first in a browser.**
4. ⚠️ **The demo modal has never been opened from this page.** `DemoModalProvider`/`DemoCta`/`DemoModal`
   are wired the way the landing wires them, but that is structural.
5. ⚠️ **The gate has never been exercised from this route.** Inheritance is a framework guarantee, not
   something I observed; a non-admin has not been redirected from `/landing/cost`.
6. ⚠️ **The arithmetic is the prototype's, and I did not re-derive it.** I wired real constants into
   settled maths. **If the model is wrong, this build did not make it right.**
7. ⚠️ **`PLAN_MONTHLY_PENCE.starter` is unused here** — the page only offers Pro and Max, per the
   prototype. Starter is not a comparison case.

## 🔴 TWO THINGS FOR YOU

- **The sub-penny saving renders "save £0 →"** (5.a). A threshold decision, not a bug fix.
- **The page shows real prices while `NEXT_PUBLIC_PRICING_PUBLISHED` masks them everywhere else.** It
  reads the NUMBERS, which `lib/pricing.ts` does not mask — only rendered strings go through
  `maskPrice`. ⚠️ **Behind the admin gate that is arguably correct** (the mask exists to stop test
  trucks seeing pricing, and there are none here) — **but it is a live inconsistency: this page would
  show £29 on a screen where Billing shows "TBC".** I flagged it in the earlier report as a decision and
  it is still open.
