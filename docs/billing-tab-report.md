# The empty Billing tab on plan `demo`

**Date:** 4 August 2026. **Read-only.** Nothing changed, no SQL run, no migration.
No garbled spans found.

---

## THE ANSWER IN ONE LINE

`BillingTab` has **three top-level plan branches and no fallback**. `demo` matches none of them, so the
component renders its wrapper `<div>` with **zero children**.

---

## B1. WHAT BILLING RENDERS, AND WHY IT IS EMPTY

### (a) Every top-level block, and its condition

`BillingTab` is [app/manage/[token]/page.tsx:9666-9998](app/manage/[token]/page.tsx#L9666). Its entire
`return` is one flex column containing **four** conditional children and nothing unconditional:

| # | Line | Condition | Renders |
|---|---|---|---|
| — | [:9667](app/manage/[token]/page.tsx#L9667) | `if (!truck) return null` | early return |
| 1 | [:9828](app/manage/[token]/page.tsx#L9828) | `{plan === 'trial' && (` | current plan, trial-ends banner, upgrade buttons, the billing card, the full price/feature matrix, footnotes |
| 2 | [:9895](app/manage/[token]/page.tsx#L9895) | `{plan === 'starter' && (` | current plan, upgrade prompt, billing card, matrix, footnotes |
| 3 | [:9933](app/manage/[token]/page.tsx#L9933) | `{(plan === 'pro' \|\| plan === 'max') && (` | current plan, billing card, matrix, footnotes |
| 4 | [:9961](app/manage/[token]/page.tsx#L9961) | `{showUpgradeModal && (` | the upgrade modal — `useState(false)`, and **only openable from buttons inside blocks 1–3** |

**There is no `else`, no default branch, and nothing rendered outside these four.**

### (b) 🔴 Walking each condition for `plan = 'demo'`, `trial_expires_at = null`

```
plan = 'demo'   trial_expires_at = null

{plan === 'trial' && …}                      'demo' === 'trial'   → FALSE
{plan === 'starter' && …}                    'demo' === 'starter' → FALSE
{(plan === 'pro' || plan === 'max') && …}    both                 → FALSE
{showUpgradeModal && …}                      useState(false)      → FALSE, and unreachable
```

**All four fail.** What is left is the wrapper alone:

```jsx
return (
  <div className="flex flex-col gap-6">
    {/* four falsy expressions, each rendering nothing */}
  </div>
)
```

`trialActive` ([:9669-9671](app/manage/[token]/page.tsx#L9669-L9671)) is also `false` — it requires
`plan === 'trial'` **and** a non-null future date — but it never gets consulted, because it only affects
the matrix inside branches that do not render.

> 🔴 **The specific expression that produces the empty page is the absence of a fourth plan branch.**
> There is no single failing condition to point at; the fault is that the set `{trial, starter, pro,
> max}` is not exhaustive over the `Plan` union `{starter, pro, max, trial, tester, demo}`, and the
> component was written as if it were.

### (c) The list that drives the render — **hardcoded, not `PLAN_ORDER`**

[:9672-9674](app/manage/[token]/page.tsx#L9672-L9674):

```ts
const billingPlans: readonly ('trial' | 'starter' | 'pro' | 'max')[] = trialActive
  ? (['trial', 'starter', 'pro', 'max'] as const)
  : (['starter', 'pro', 'max'] as const)
```

**Billing does NOT use `PLAN_ORDER`.** It uses this literal, whose **type cannot even express `'demo'`**
— adding it would be a type error, not a silent omission. `grep` confirms no `PLAN_ORDER` reference
anywhere in `BillingTab`.

⚠️ **This does not cause the empty tab**, and it is worth being precise about that: `billingPlans` only
sizes the matrix columns, and the matrix lives inside branches 1–3, which never run for `demo`. It
matters for the *fix*, not the diagnosis.

The manual (V11) is correct that `PLAN_ORDER` lives in `app/admin/page.tsx:159` and contains `'demo'` —
**that list drives the admin console, not this tab.** Two different plan lists, and only one of them
knows `demo` exists.

**What Billing does read from the shared metadata**, and which does have a `demo` entry:

| Source | `demo` present? | Used at |
|---|---|---|
| `PLAN_META` (`lib/features.ts:137`) | ✅ `{ name: 'Demo', price: 'Demo', description: 'Prospect sandbox — full trial before signup (never public)' }` | [:9818](app/manage/[token]/page.tsx#L9818), [:9834](app/manage/[token]/page.tsx#L9834), [:9901](app/manage/[token]/page.tsx#L9901) |
| `PLAN_PRICES` / `PLAN_DESCRIPTIONS` (`lib/plan-features.ts`) | ✅ — both are `Record<Plan, string>` DERIVED from `PLAN_META` | inside branches 1–3 |
| `billingPlans` (local literal) | ❌ — and the type forbids it | the matrix |

> **So the data to render a demo plan already exists.** `PLAN_META.demo` has a name, a price string and
> a description. Nothing reads them, because no branch runs.

### (d) `canAccess()` — **not involved at all**

`grep` across the whole of `BillingTab` finds **no `canAccess`, no `FeatureGate`, no `useFeatures`**. The
only match is a comment noting that `maskPrice` is shared *with* `FeatureGate`.

Billing gates purely on the literal `truck.plan` string. So the answer to "what does `canAccess` return
for `demo`" is **irrelevant to this fault** — though for completeness it returns `PLAN_FEATURES.demo`
membership, i.e. the full trial set, and never expires (manual V11 §13).

---

## B2. EMPTY, OR MISSING ITS HEADLINE?

**A shell with nothing in it — not a blank page, and not a heading with nothing under it.**

Precisely what the operator sees:

- The app shell renders normally: header, the eight-tab bar with **Billing** highlighted, the scrolling
  `<main>`.
- Inside `<main>`, `BillingTab` returns `<div className="flex flex-col gap-6">` containing **no
  elements at all**.
- `BillingTab` renders **no heading of its own** — every "Current plan" heading lives *inside* branches
  1–3. There is no `<h2>Billing</h2>` at the top of the component to survive.

So: **tabs and chrome present, content area completely blank.** It reads as a page that failed to load
rather than a page with a missing section — which is why it was reported as "completely empty".

---

## B3. WHO ELSE HITS THIS

### (a) Every plan value

| `truck.plan` | `trial_expires_at` | Billing renders |
|---|---|---|
| `trial` | future date | **Full page.** Current plan, "Trial ends <date>", upgrade buttons, the "🔒 you won't be charged until…" reassurance, billing card, **4-column** matrix (trial + starter + pro + max), footnotes |
| `trial` | **NULL** | **Full page, minus the dates.** Branch 1 fires on `plan === 'trial'` alone; the date lines are individually guarded by `truck.trial_expires_at &&`, and the banner falls back to **"Your trial ends soon"**. `trialActive` is false, so the matrix drops to **3 columns** and the trial column disappears |
| `trial` | **past date** | **Identical to NULL** — same branch, same guards; `trialActive` false → 3 columns. The date lines DO render, showing a date already gone |
| `starter` | any | **Full page** — current plan, upgrade prompt, billing card, matrix, footnotes |
| `pro` / `max` | any | **Full page** — current plan, billing card, matrix, footnotes |
| `tester` | any | **The tab is never shown.** [:488](app/manage/[token]/page.tsx#L488): `if (t.id === 'billing') return userRole === 'owner' && truck?.plan !== 'tester'` |
| **`demo`** | any | **🔴 EMPTY** |

⚠️ Also: **the tab is owner-only.** A `manager` never sees Billing on any plan.

### (b) 🔴 Pizzeria Gusto and Real Thai Food — **NOT affected**

**No live trading truck has an empty Billing tab.** Both are on `trial`, and branch 1 fires on
`plan === 'trial'` **alone** — it does not require a valid or non-null `trial_expires_at`. Whatever
state their expiry column is in, they get the full page.

**The state of their date only changes what is written, not whether anything renders:**

- future date → "Trial ends 3 September 2026" and the "you won't be charged until…" line;
- NULL → those lines are omitted and the banner reads **"Your trial ends soon"**;
- past date → the lines render with a date in the past.

### (c) What Billing shows when `canAccess` is denying everything

The manual records that once `trial_expires_at` passes — **or is NULL** — `canAccess()` returns `false`
for **every** feature. Billing does not consult `canAccess` (B1d), so it renders the trial page
regardless, and that page says, at [:9851](app/manage/[token]/page.tsx#L9851):

> **"You're on Max features. Choose a plan before your trial ends to keep access."**

⚠️ **In that state the sentence is false in both halves.** The operator is on *no* features — `canAccess`
denies all of them — and the trial has already ended (or never started). A truck in this state is told
it has the top tier while the product is switched off around it.

**This is a second, independent defect from the empty tab**, on the surface most likely to be read when
something stops working. It is not caused by `demo` and it does not affect `demo` (which never reaches
this branch). Reported, not fixed.

---

## B4. IS THIS THE `demo` PROBLEM, OR SEPARATE?

**It is the `demo` problem — a non-purchasable sandbox plan on a UI built only for purchasable ones.**
And the codebase proves the class was already known:

> [:488](app/manage/[token]/page.tsx#L488) — `truck?.plan !== 'tester'`

**`tester` is a non-purchasable plan, and it was handled by hiding the tab entirely.** `demo` is the same
class of plan and was never added to that exclusion, nor given a branch. The gap is not that nobody
thought about non-purchasable plans; it is that `demo` arrived later and no one revisited the decision.

⚠️ There is no defect independent of that. Every other plan renders correctly, `billingPlans` is
irrelevant until a branch runs, and `canAccess` is not involved. **One missing case, one consequence.**

### What Billing WOULD need to show a self-serve operator

Not the purchase UI — there is nothing to purchase yet. Honestly, the minimum is:

1. **What plan they are on and what it means.** `PLAN_META.demo` already exists, but its description —
   *"Prospect sandbox — full trial before signup (never public)"* — is written for the admin console and
   would be wrong in front of an operator who has signed up and is no longer a prospect.
2. **What happens next, and when.** This is where the honest answer runs out: **a self-serve operator's
   trial has not started, cannot start, and has no end date**, because trial nomination does not exist
   (manual V11 §27). Any "your trial ends…" line would be fiction, and the current trial branch is built
   almost entirely around that date.
3. **The plan matrix**, which is plan-independent and would work as-is — except `billingPlans`' type
   would have to admit `demo` as a current-plan column, or the "current plan" highlight would land on
   nothing.

> 🔴 **This is downstream of an unresolved decision and should not be patched ahead of it.** Whether
> self-serve provisions `demo` or `trial` is still open (manual V11 §13, §27). Those two answers need
> *different* Billing pages:
> - **stay on `demo`** → Billing needs a fourth branch describing a plan that is free, unexpiring and
>   not purchasable — a page that has never existed and whose copy has to be written;
> - **switch to `trial`** → the empty tab **disappears on its own**, because branch 1 already handles a
>   trial with a NULL date. But it would then show "Your trial ends soon" to someone whose trial has not
>   started, which is B3(c)'s defect arriving by a different route.
>
> **Adding a `demo` branch now would be building a page for a plan that may not exist next week.**
> Hiding the tab for `demo` — one character-for-character extension of the `tester` exclusion already on
> line 488 — is the change that is correct under *both* answers, and is the only thing I would consider
> doing before the plan decision is made. Not built; that is a decision, not a diagnosis.

---

## B5. LIVE CHECKS

Which plans are actually in use, and how many trucks would hit the empty tab:

```sql
select plan,
       count(*)                                                   as trucks,
       count(*) filter (where trial_expires_at is null)            as expiry_null,
       count(*) filter (where trial_expires_at <= now())           as expiry_past,
       count(*) filter (where trial_expires_at >  now())           as expiry_future
from trucks
where id not like 'demo-%'
group by plan
order by trucks desc;
```

**Any row with `plan = 'demo'` is a truck whose Billing tab is empty today.** A row with
`plan = 'trial'` and a non-zero `expiry_null` or `expiry_past` is a truck being told "You're on Max
features" while `canAccess` denies everything — B3(c).

The two live trucks specifically, to confirm neither is affected:

```sql
select name, slug, plan, trial_expires_at, setup_step, active,
       case
         when plan = 'demo'                          then 'EMPTY BILLING TAB'
         when plan = 'tester'                        then 'billing tab hidden'
         when plan = 'trial' and trial_expires_at is null then 'renders, says "ends soon", canAccess denies all'
         when plan = 'trial' and trial_expires_at <= now() then 'renders with a past date, canAccess denies all'
         else 'renders normally'
       end as billing_state
from trucks
where id not like 'demo-%'
order by created_at;
```

---

## SUMMARY

| Question | Answer |
|---|---|
| Why is it empty? | `BillingTab` has three plan branches (`trial`, `starter`, `pro`/`max`) and **no fallback**; `demo` matches none, so the wrapper `<div>` renders with no children |
| Blank, or a shell? | **A shell.** Chrome and tabs render; the content area is completely empty. There is no component-level heading to survive |
| Does `PLAN_ORDER` cause it? | **No.** Billing uses a hardcoded literal whose type cannot express `demo`, and it only sizes the matrix inside branches that never run |
| Is `canAccess` involved? | **No.** Billing gates on the raw `truck.plan` string only |
| Are Gusto / RTF affected? | **No.** Both are `trial`, and branch 1 fires on the plan value alone regardless of the expiry column |
| Is it the `demo` problem? | **Yes** — and `tester`, the same class of plan, was already handled by hiding the tab on line 488. `demo` was never added |
| Second finding | An expired-or-NULL trial is told **"You're on Max features"** while `canAccess` denies every feature. Independent of `demo`; affects `trial` only |
