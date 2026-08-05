# The Trial column in the Billing feature matrix

**Date:** 4 August 2026.
**Migrations:** none. **SQL:** none. **`next dev` / `next build`:** not run.
No garbled spans.

---

## Z1. THE FIX

### The new condition, and every place it is read

```ts
const showTrialColumn = truck.plan === 'trial' &&
  (truck.trial_expires_at === null || new Date(truck.trial_expires_at) > new Date())
```

**Named `showTrialColumn`** — it answers "has the trial not **ended**", which is a different question
from `trialActive`'s "is the trial running **now**".

| NULL expiry | future date | past date |
|---|---|---|
| not started → **SHOW** *(the fix)* | running → **SHOW** *(unchanged)* | ended → **HIDE** *(unchanged)* |

**Read in three places, all of them the same layout decision:**

| Line | What |
|---|---|
| [:9691](app/manage/[token]/page.tsx#L9691) | `billingPlans` — whether the array has 4 entries or 3 |
| [:9747](app/manage/[token]/page.tsx#L9747) | the Transaction-fees section-header spacer row |
| [:9774](app/manage/[token]/page.tsx#L9774) | the Feature-sections section-header spacer row |

### 🔴 A correction to the brief's premise: `trialActive` was NOT used elsewhere

> *"Do not reuse trialActive for this; it means 'running now' and is used elsewhere."*

**It was not used elsewhere.** `grep` found exactly three readers — the three above — and all three are
the same decision: how many columns the matrix has. There was no other consumer anywhere in the file.

That changes the right shape of the fix, so I want to be explicit about what I did and why:

**`trialActive` was REMOVED and `showTrialColumn` took over all three sites**, rather than the two
existing side by side. Two reasons, the second of which is a correctness one:

1. Had I left `trialActive` defined and used `showTrialColumn` only at `billingPlans`, `trialActive`
   would have become **dead code** — an unused variable, which lint flags and which pushes the file
   above its baseline.
2. More importantly, **the two spacer rows MUST agree with the column count.** Those rows render an
   extra `<div className="w-14 sm:w-28" />` to reserve the trial column's width in the section-header
   rows. If `billingPlans` had four entries while the spacers still asked `trialActive` (false for a
   NULL expiry), every section header — "Transaction fees", "Max tier" and the rest — would sit **one
   cell out of alignment** with the rows beneath it. One condition with three readers makes that
   impossible; two conditions is exactly the arrangement in which they can disagree.

The behavioural equivalence is exact: for a **future** date `showTrialColumn` and `trialActive` are both
true, and for **past**, **starter**, **pro** and **max** both are false. The only input on which they
differ is NULL — which is the fix.

### 🔴 Type widening: NOT needed, and nothing was widened

```ts
const billingPlans: readonly ('trial' | 'starter' | 'pro' | 'max')[]
```

**Unchanged.** The change alters **when** `'trial'` appears in the array, never **which** values can
appear in it. `'trial'` was already a member of the union — it was simply unreachable for a NULL expiry.

The union still cannot express `'demo'` or `'tester'`, and that is left deliberately: both are
non-purchasable plans with no column in a pricing matrix, and the type is a useful guard against one
being added by accident.

---

## Z2. 🔴 THE LANDING PAGE

### (a) Yes — and it shows Trial unconditionally

`app/landing/page.tsx:38`:

```ts
const TABLE_PLANS = ['trial', 'starter', 'pro', 'max'] as const
```

A fixed literal with no condition — the landing compare table **always** has four columns. Its own
comment says why: *"mirrors Manage → Billing (the point is that Trial visibly includes everything)."*

Under it the Trial column shows:

| | Landing | Billing (after this change) |
|---|---|---|
| Header | `Trial` | `TRIAL` (the raw key, CSS-uppercased) |
| Price | **`Free`** (`PLAN_PRICE_LABEL.trial`, a landing-only literal) | **`Free trial`** (`PLAN_PRICES.trial` ← `PLAN_META.trial.price`) |
| Sub-line | `''` (empty, deliberately — "keeps the sticky header compact") | an invisible `&nbsp;`, deliberately, so column heights match |

### (b) ✅ The feature rows come from ONE source — no duplicated tier record

**Both tables render `FEATURE_SECTIONS` from `lib/plan-features.ts`.** Verified by imports:

| Consumer | Imports from `lib/plan-features.ts` |
|---|---|
| `app/landing/page.tsx:18-20` | `FEATURE_SECTIONS, PLAN_PRICES, PLAN_DESCRIPTIONS, PLAN_ALLOWANCES, FOOTNOTES, …` |
| `app/manage/[token]/page.tsx:17` | `PLAN_PRICES, PLAN_DESCRIPTIONS, TRANSACTION_ROWS, FEATURE_SECTIONS, FOOTNOTES` |
| `app/admin/page.tsx:9` | `PLAN_PRICES, FEATURE_SECTIONS, FOOTNOTES` |

And `PLAN_PRICES` / `PLAN_DESCRIPTIONS` are **derived** from `PLAN_META`, with a comment recording that
they used to be separate literals and *had already drifted*.

**So the feared failure — two hand-maintained records of a commercial promise — does NOT exist for the
feature rows.** That is worth stating as plainly as the warning was.

### ⚠️ But there ARE landing-only render overrides, and they are a lesser version of the same risk

The landing page deliberately overrides parts of the shared data at render time, each labelled
`RENDER-ONLY` in its own comment:

| Override | Line | Effect |
|---|---|---|
| Fees rows | `:53` | landing shows its own fee rows; shared `TRANSACTION_ROWS` is not modified |
| Footnote text | `:62` | landing substitutes its own text for some footnotes |
| `FEATURE_SECTIONS` detail strings | `:69` | *"Billing/Admin keep the original text"* |
| **Trial cell values** | `:47-51` | `trialFeatureValue()` — see (c) |

**These are one source with a divergent presentation layer, not two sources** — a materially better
position than duplication, but the same class of hazard one step down: a row's *meaning* can differ
between the page a prospect reads and the page an operator reads, while the underlying data agrees.
**Reported, not fixed**, as instructed.

### (c) 🔴 ONE ROW WHERE THE TWO TABLES DISAGREE — `SMS order alerts`

Both compute the Trial cell from `row.max` with exceptions, and their exception lists differ by one:

```ts
// LANDING — app/landing/page.tsx:47
function trialFeatureValue(row) {
  if (row.name === 'Online ordering — Pay at Hatch') return true
  if (row.name === 'SMS order alerts') return false        // ← only here
  return row.max
}

// BILLING — app/manage/[token]/page.tsx (matrix cell)
const val = p === 'trial'
  ? (row.name === 'Online ordering — Pay at Hatch' ? true : row.max)
  : row[p]
```

`SMS order alerts` has `max: 'coming_soon'` (`lib/plan-features.ts:97`). So:

| Table | Trial column shows | Reads as |
|---|---|---|
| **Landing** (prospect) | `false` → **—** | not included in the trial |
| **Billing** (operator) | `'coming_soon'` → **"Coming soon"** | included, once it exists |

The landing comment states the intent — *"a paid add-on that isn't part of the free trial"* — and Billing
was never given that exception.

⚠️ **This is a commercial promise reading two ways to two audiences, and it is now more visible**, because
the Trial column that was hidden from self-serve operators will be in front of them. **Not reconciled —
that is a commercial decision**, as Z2(c) says. The fix, whichever way it is decided, is one line: either
add the exception to Billing, or remove it from the landing page.

---

## Z3. WHAT THE COLUMN SAYS

### Header and price, from the shared source

| Element | Value | Source |
|---|---|---|
| Header | `trial`, rendered `uppercase` → **TRIAL** | the array element itself (`{p}`), not `PLAN_META.trial.name` |
| Price | **"Free trial"** | `PLAN_PRICES.trial` ← `PLAN_META.trial.price` |
| Sub-line | an invisible `&nbsp;` | deliberate — the other columns carry a two-line "per truck / month", and matching the height keeps the bottom borders aligned |

⚠️ Minor inconsistency, reported not changed: the header renders the **raw plan key** (`trial`) rather
than `PLAN_META.trial.name` (`Trial`). Uppercased they look identical, so it is invisible today — but a
plan whose key and display name differ would show the key. Out of scope here.

### `PLAN_META.trial.description` — reads fine, no change proposed

> **"All features included — Max tier + Pay at Hatch ordering"**

Z3 anticipated this might read oddly in front of an operator. **It does not.** It is plain, accurate and
non-technical, and it renders in the "Current plan" block above the matrix (via `PLAN_DESCRIPTIONS`), not
in the matrix itself. **Left exactly as it is** — and `lib/features.ts` is on Z4's do-not-touch list
regardless.

*(For contrast, `PLAN_META.demo.description` — "Prospect sandbox — full trial before signup (never
public)" — genuinely is admin-console language, but no operator now reaches it.)*

### 🔴 Countdown language — one line, and it is NOT guarded

Checked everything in and above the matrix:

| Text | Guarded on a date? | For a NOT-STARTED trial |
|---|---|---|
| Matrix Trial header "Free trial" | n/a | ✅ no countdown |
| "Trial ends {date}" (Current plan block) | ✅ `{truck.trial_expires_at && …}` | ✅ not rendered |
| "🔒 You won't be charged until…" | ✅ `{truck.trial_expires_at && …}` | ✅ not rendered |
| Orange-box heading | ✅ ternary → "Your free trial has not started yet" | ✅ correct |
| Orange-box sub-line | ✅ ternary → "…nothing is counting down" | ✅ correct |
| **⏱ "Set up payment before your trial ends to keep access"** ([:9901](app/manage/[token]/page.tsx#L9901)) | **🔴 NO — unconditional inside the `plan === 'trial'` branch** | **🔴 RENDERS, and implies a countdown that has not started** |

**Reported, not fixed.** It sits between the orange box and the billing card and renders for *every*
trial truck, so changing it would alter what Gusto, RTF and Test Kitchen see — which Z4 forbids. The fix
is the same ternary already applied to its two neighbours; it needs the same decision about what the
not-started wording should be, which is a copy call rather than a bug fix.

---

## VERIFICATION

```
$ npx tsc --noEmit
TSC EXIT CODE: 0

$ npx eslint "app/manage/[token]/page.tsx"
✖ 370 problems (293 errors, 77 warnings)
```

**Baseline 370 (293 errors, 77 warnings); now 370 (293, 77) — exactly the baseline.** Removing
`trialActive` while adding `showTrialColumn` is net-neutral, and no unused variable was left behind.

### Files touched

| File | Reason |
|---|---|
| [app/manage/[token]/page.tsx](app/manage/[token]/page.tsx) | Z1 — `showTrialColumn` replaces `trialActive` at all three matrix sites |

**Nothing else.** `lib/plan-features.ts`, `lib/features.ts` and `app/landing/page.tsx` were **read only**
— none appears in the diff, per Z4.

### Which columns the matrix shows

| `plan` | `trial_expires_at` | Columns | Changed? |
|---|---|---|---|
| `trial` | **NULL** (not started) | **Trial · Starter · Pro · Max** | 🔴 **YES — was Starter · Pro · Max** |
| `trial` | future | Trial · Starter · Pro · Max | no |
| `trial` | past | Starter · Pro · Max | no |
| `starter` | any | Starter · Pro · Max | no |
| `pro` | any | Starter · Pro · Max | no |
| `max` | any | Starter · Pro · Max | no |
| `demo` | any | *(no matrix — BillingTab still renders empty)* | no |
| `tester` | any | *(tab hidden entirely)* | no |

### ✅ Gusto, RTF and Test Kitchen — confirmed unchanged

All three are `plan = 'trial'` with **future** expiry dates (17 Oct, 30 Sep, 23 Aug), so:

- `trialActive` was **true** for all three → 4 columns, and the spacer rows reserved the fourth.
- `showTrialColumn` is **true** for all three → 4 columns, same spacers.

**The condition evaluates identically for every one of them, so their Billing tab renders byte-for-byte
what it did before** — same columns, same alignment, same headers, same prices, same copy. The only
input on which old and new differ is a NULL expiry, and none of them has one.
