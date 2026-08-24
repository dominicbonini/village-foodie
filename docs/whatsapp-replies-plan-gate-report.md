# `whatsapp_replies` plan gate — STOPPED AT STEP 1. NO CHANGE MADE.

**Date:** 20 August 2026
**Outcome:** 🔴 **THE STOP CONDITION IN YOUR STEP 1(c) FIRED.** `lib/features.ts` and
`lib/plan-features.ts` **already agree**, and `whatsapp_replies` **is already granted to Pro**.
**The work is done. The manual is stale. No code was changed.**

**Verified by execution, not by reading:** `canAccess('pro', 'whatsapp_replies')` returns **`true`**, and
`findPlanParityViolations()` returns **`[]`**. Both results are reproduced in §4.

**Prompt integrity:** no span arrived garbled. No instruction contradicted another. Nothing was deployed,
`next dev` was not run, and `git diff lib/features.ts lib/plan-features.ts` is **empty**.

---

# STEP 1 — DIAGNOSIS

## 1.a The current grant in `lib/features.ts`

`whatsapp_replies` is a member of **`PRO_FEATURES`**, quoted with its own comment:

```ts
const PRO_FEATURES: Feature[] = [
  …
  'instagram_messenger_replies',
  'branded_qr_code',
  'advanced_reporting',
  'whatsapp_replies',   // Pro+Max — moved from Max-only: a Pro truck was sold WhatsApp replies and the gate silently blocked it (canAccess('pro',…)===false)
]
```

and it reaches every higher tier by spread:

```ts
const MAX_FEATURES: Feature[] = [
  ...PRO_FEATURES,   // includes whatsapp_replies now
  'ticket_printing',
  'multi_device_kds',
  'cook_screen',
]

const TRIAL_FEATURES: Feature[] = [...MAX_FEATURES]
```

```ts
export const PLAN_FEATURES: Record<Plan, Set<Feature>> = {
  starter: new Set([ … ]),      // whatsapp_replies NOT present
  pro:     new Set(PRO_FEATURES),
  max:     new Set(MAX_FEATURES),
  trial:   new Set(TRIAL_FEATURES),
  tester:  new Set(MAX_FEATURES),
  demo:    new Set(TRIAL_FEATURES),
}
```

**Which plans are granted:** `pro`, `max`, `trial`, `tester`, `demo`. **Not `starter`.**

⚠️ **The `Feature` union still files the identifier under a `// Max` comment header:**

```ts
  // Max
  | 'ticket_printing'
  | 'multi_device_kds'
  | 'cook_screen'
  | 'whatsapp_replies'
```

**That comment is cosmetic — it groups a type union and grants nothing.** It is almost certainly the
source of the "still Max-only" reading: **a grep for `whatsapp_replies` in this file returns the union
line before it returns the `PRO_FEATURES` line.** Recorded because it is a trap, not a defect. **NOT
changed — that is outside what you named.**

## 1.b The current entry in `lib/plan-features.ts`

```ts
      { name: 'WhatsApp auto-replies',            footnote: '4', detail: 'Auto-reply to WhatsApp enquiries about your menu and schedule.', starter: false, pro: true,           max: true           },
```

**Which plans:** `pro: true`, `max: true`, `starter: false`. **Pro+Max, as you said.**

The sibling row, for contrast, is the one legitimately not hard-true:

```ts
      { name: 'Messenger & Instagram auto-replies', footnote: '4', detail: 'Same as WhatsApp auto-replies, for Messenger and Instagram enquiries.', starter: false, pro: 'coming_soon', max: 'coming_soon' },
```

## 1.c 🔴 DO THEY AGREE? YES. AND PRO ALREADY HAS IT.

| | starter | pro | max |
|---|---|---|---|
| **Gate** (`canAccess`, `lib/features.ts`) | `false` | **`true`** | `true` |
| **Marketing** (`FEATURE_SECTIONS`, `lib/plan-features.ts`) | `false` | **`true`** | `true` |

✅ **Identical on all three tiers.** Per your own step 1(c) I stopped here and made no change.

🔴 **YOUR STEP 2 IS A NO-OP AS WRITTEN.** *"Grant `whatsapp_replies` to Pro in `lib/features.ts`"* —
it is already there, in `PRO_FEATURES`, and has been since the fix recorded in the V8.9 changelog entry.
**There is no edit that would satisfy the instruction, because its end state is the current state.**

## 1.d The parity guard — it does NOT have a hole here, and the reason matters

**Your 1(d) is conditional:** *"Does it currently PASS with this discrepancy present? If it passes, the
guard has a hole."* ✅ **The guard passes, and there is no discrepancy present, so the premise of the
question does not obtain. The guard is not failing to catch anything — there is nothing to catch.**

✅ **THE GUARD IS THE REASON THIS IS ALREADY FIXED.** Its own comment names this exact feature as the
class it was built for:

> *"any row advertised as a hard `true` for a tier MUST be allowed by the gate for that tier. This catches
> the WhatsApp class (marketed Pro, gated Max-only) automatically."*

**What it compares:**

```ts
export function findPlanParityViolations(): string[] {
  const tiers: Array<'starter' | 'pro' | 'max'> = ['starter', 'pro', 'max']
  const out: string[] = []
  for (const section of FEATURE_SECTIONS) {
    for (const row of section.rows) {
      const feature = ROW_FEATURE_MAP[row.name]
      if (!feature) continue
      for (const tier of tiers) {
        if (row[tier] === true && !canAccess(tier, feature)) {
          out.push(`"${row.name}" advertised for ${tier} but canAccess('${tier}','${feature}') is false`)
        }
      }
    }
  }
  return out
}
```

and it runs at **module load**, throwing in dev and `console.error`-ing in production:

```ts
    if (process.env.NODE_ENV !== 'production') throw new Error(msg)
    console.error(msg)
```

⚠️ **WHAT IT DOES NOT COMPARE — four real limits, reported because you asked for the guard's shape:**

1. 🔴 **IT IS ONE-DIRECTIONAL.** It catches *advertised but not allowed*. It does **not** catch
   *allowed but not advertised* — a feature granted to a tier whose marketing cell reads `false` passes
   silently. **That is the genuine hole in its shape.** It is the safer direction to miss (the operator
   gets more than the matrix promises rather than less), but it is a gap, and it is invisible.
2. **`'coming_soon'` cells are skipped entirely.** Only `row[tier] === true` is inspected, so the
   Messenger/Instagram row is unchecked in both directions today.
3. ⚠️ **IT IS KEYED ON ROW-NAME STRINGS**, and the file says so itself: *"renaming a row here without
   renaming it above silently drops that row from `findPlanParityViolations()` — the guard stops
   checking and reports clean."* **A rename disarms the check with no signal.**
4. **Only `starter`/`pro`/`max` are checked.** `trial`, `tester` and `demo` are never compared —
   correctly, since the matrix has no columns for them, but it means the guard says nothing about the
   plans **every truck on the estate is actually on.**

⚠️ **A fifth, structural one:** the guard only fires when a module that imports `lib/plan-features.ts`
is loaded (Admin, Billing, the landing table). **There is no CI step and no test asserting on it** —
the function is exported for exactly that purpose and nothing consumes it. **A drift introduced today
surfaces when someone renders a pricing page, not when someone commits.**

---

# STEP 2 — NOT PERFORMED

🔴 **No change was made to `lib/features.ts`.** Step 2 is explicitly conditional — *"only if step 1
confirms they disagree"* — and step 1 confirms they agree. `git diff lib/features.ts lib/plan-features.ts`
is **empty**.

**Nothing else was touched either:** no other feature's grants, no plan-model restructuring, no marketing
table edit.

---

# STEP 3 — EVERY OTHER STATEMENT OF THIS FEATURE'S TIER

## 3.a ✅ THERE IS NO THIRD SOURCE OF TRUTH IN CODE

`grep -rn "whatsapp_replies"` across `*.ts` / `*.tsx`, excluding `node_modules` and `docs/`, returns
**eleven** hits. Classified:

| File | Role |
|---|---|
| `lib/features.ts` (union member, `PRO_FEATURES` entry, `MAX_FEATURES` spread comment) | 🔴 **SOURCE 1 — the gate** |
| `lib/plan-features.ts` (the `FEATURE_SECTIONS` row, the `ROW_FEATURE_MAP` entry) | 🔴 **SOURCE 2 — the marketing table** |
| `app/api/webhooks/meta/whatsapp/route.ts` | **consumer** — `canAccess(truck.plan, 'whatsapp_replies', …)` |
| `app/api/webhooks/whatsapp/route.ts` (dormant Twilio) | **consumer** — same call, plus a log line |
| `app/manage/[token]/page.tsx` | **consumer** — `can('whatsapp_replies')` and a `<FeatureGate feature="whatsapp_replies" …>` |
| `lib/whatsapp/connection-state.ts` | **a comment only**, and the module is imported by nothing |

✅ **Two sources of truth, exactly as your brief assumed. No third. Nothing to stop for.**

## 3.b ✅ USER-VISIBLE COPY IN CODE — ALL CORRECT, NOTHING NEEDED CHANGING

**(i) The upgrade prompt — generated, so no edit** (and you asked me to say so rather than touch it).
`components/FeatureGate.tsx` derives the tier name from the gate:

```tsx
  const needed = requiredPlan(feature)
  const meta = PLAN_META[needed]
  …
          {upgradeMessage ?? `This feature requires the ${meta.name} plan`}
```

**Executed:** `requiredPlan('whatsapp_replies')` → **`'pro'`** → the prompt already reads *"This
feature requires the **Pro** plan"*. **Derived from `lib/features.ts`. No edit.**

**(ii) The landing plan cards — correct, but a hand-written duplicate.** The bullet sits inside the
**Pro** card (`{/* Pro */}`, `<div className="plan hero-plan">`, `PLAN_META.pro.name`):

```tsx
                <li>WhatsApp auto-replies (Messenger &amp; Instagram coming soon)</li>
```

✅ **The tier is right.** ⚠️ **But this list is NOT rendered from `FEATURE_SECTIONS`**, and the file
carries its own warning about that a few lines above:

> *"HAND-WRITTEN, NOT RENDERED FROM FEATURE_SECTIONS. This bullet is a literal twin of the matrix row in
> `lib/plan-features.ts` and nothing checks the two against each other, so it must be changed in the SAME
> commit or the same page shows two different claims."*

⚠️ **So there IS a third COPY of this claim — just not a third source of truth for the gate, and it
currently agrees.** `findPlanParityViolations()` does not inspect it (it reads `FEATURE_SECTIONS`, not
JSX). **Recorded, not changed: it is already correct, and correcting a correct string is how a working
page breaks.**

**(iii) Billing tab, Admin, wizard, email copy.** All pricing surfaces render `FEATURE_SECTIONS` or
`PLAN_META`; no hand-written WhatsApp-tier string exists in any of them. **Nothing to correct.**

## 3.c 🔴 THE MANUAL — SIX ENTRIES, FOUR OF THEM STALE. FOR YOU TO FIX; I DID NOT EDIT IT.

You asked me to report manual statements rather than edit `reference-manual.md`. **I did not edit it.**
Here is every one, with a verdict:

| Location | What it says | Verdict |
|---|---|---|
| **V8.9 changelog** — *"**FIXED:** `whatsapp_replies` → `PRO_FEATURES` (Max inherits it via the spread)"* | the fix landed | ✅ **TRUE. This is the accurate entry, and it is the one your brief half-remembered.** |
| §4, *Feature gating rules* — *"WhatsApp auto-replies are MAX only (cost-incurring). Instagram/Messenger are Pro."* | Max-only | 🔴 **STALE, and it is exactly backwards on both halves** — WhatsApp is Pro+Max, Messenger/Instagram are `coming_soon`. |
| §20, *Platform compliance and tone* — *"Instagram/Messenger are Pro; WhatsApp is Max only."* | Max-only | 🔴 **STALE** — the one you already knew about. |
| §20, the **V11.36** block — *"`lib/features.ts` grants it at max/trial/tester/override only — NOT Pro/Starter"* | Max-only | 🔴 **STALE — AND I WROTE IT TODAY. See §5.** |
| §27 backlog — *"whatsapp_replies plan-gate discrepancy (V7.6) … Reconcile (Section 20)"* | open | 🔴 **STALE — closed by the V8.9 fix.** |
| §27, the **V11.36** backlog — *"`whatsapp_replies` SHOULD BE A PRO FEATURE … the feature module grants it at Max/trial/tester"* | open | 🔴 **STALE — AND I WROTE IT TODAY. See §5.** |

🔴 **THE RESOLUTION OF THE CONTRADICTION YOUR STEP 1 NAMES: the "already corrected" claim is the TRUE
one, and §4, §20 and §27 are the stale halves.** The code has matched marketing since the V8.9 fix.

---

# STEP 4 — VERIFICATION

**`tsc` was not run and nothing here is offered as tsc-clean**, per your instruction. What follows was
executed against the real modules, loaded through `jiti` from the repository (nothing retyped).

## 4.a The parity guard, before — and there is no "after", because nothing changed

```
NODE_ENV = (unset => non-production, so the module-load guard THROWS on any violation)
RESULT: module loaded WITHOUT throwing -> the module-load drift guard did NOT fire
findPlanParityViolations() => [] | count = 0
```

✅ **Zero violations, and the module-load guard — which throws in non-production — did not fire.**
Two independent signals from the same run. **Before and after are identical because the working tree was
not modified.**

## 4.b Which plans can receive WhatsApp auto-replies — from the code, executed

```
--- canAccess(plan, "whatsapp_replies"), no overrides, no trial expiry ---
  starter  -> false
  pro      -> true
  max      -> true
  trial    -> true
  tester   -> true
  demo     -> true

--- PLAN_FEATURES membership ---
  starter  has: false   (set size 10)
  pro      has: true    (set size 19)
  max      has: true    (set size 22)
  trial    has: true    (set size 22)
  tester   has: true    (set size 22)
  demo     has: true    (set size 22)

requiredPlan("whatsapp_replies") => pro
```

**Answer: `pro`, `max`, `trial`, `tester` and `demo`. Not `starter`.**

## 4.c Does any `demo` or `trial` truck see a behavioural difference? — the reasoning, not the assertion

**Trivially no, because nothing changed.** But your premise deserves testing on its own terms, so here is
what would have happened *had* the grant needed adding:

**The chain, each link executed or quoted rather than asserted:**

1. The webhook's only gate is `canAccess(truck.plan, 'whatsapp_replies', truck.feature_overrides ?? {}, truck.trial_expires_at)`.
2. For `plan: 'demo'`, `canAccess` falls to `PLAN_FEATURES.demo.has(feature)`. `demo: new Set(TRIAL_FEATURES)`,
   `TRIAL_FEATURES = [...MAX_FEATURES]`, `MAX_FEATURES = [...PRO_FEATURES, …]`. → **`PRO_FEATURES ⊆ MAX_FEATURES`
   by construction, so adding to `PRO_FEATURES` can only ever be a no-op for `demo`.** Executed: `true`.
3. For `plan: 'trial'`, the expiry branch runs first:
   ```ts
   if (plan === 'trial') {
     if (!trialExpiresAt) return PLAN_FEATURES.trial.has(feature)          // not started yet
     if (new Date(trialExpiresAt) <= new Date()) return false              // expired — UNCHANGED
     return PLAN_FEATURES.trial.has(feature)                               // running
   }
   ```
   Executed across all three branches:
   ```
   trial, null expiry        -> true
   trial, future 2030-01-01  -> true
   trial, expired 2020-01-01 -> false
   ```
   ⚠️ **The expired branch returns `false` before consulting the set at all** — so it is unreachable by
   any change to `PRO_FEATURES`. **An expired trial is denied for a reason that has nothing to do with
   tier membership.**
4. → **All 13 trucks are `demo` or `trial`. Every one of those paths either already returns `true`, or
   returns `false` for a reason a tier change cannot touch.**

✅ **YOUR PREMISE IS CORRECT, AND I FOUND NO PATH THAT CONTRADICTS IT.** There is no behavioural
difference for any existing truck — both because the grant is already present, and because it would
have been a no-op for these plans even if it had not been.

⚠️ **The one place a difference COULD ever appear is a truck on `plan: 'pro'` — and there is none.**
The change that made that safe was shipped at V8.9.

---

# §5 — A CORRECTION I OWE YOU

🔴 **TWO OF THE FOUR STALE MANUAL ENTRIES ARE MINE, WRITTEN EARLIER TODAY.** When I integrated the
V11.36 delta into §20 and §27, I carried its claim that *"the feature module grants it at Max/trial/tester
only"* forward without checking it against `lib/features.ts`.

🔴 **I had already read the correct value and did not use it.** During the readiness-report task this
morning I ran `grep -n "whatsapp_replies" lib/features.ts`, saw line 50 — *"Pro+Max — moved from
Max-only"* — and noted at the time that the discrepancy was fixed. I then wrote the opposite into the
manual a few hours later, because I integrated the delta's summary rather than re-reading the source.

**That is the manual's own recurring failure — *a summary of a report is not the report* — committed
against a file I had personally read the same day.** It is material: it is what turned a closed item into
an open one and prompted this commission. **The V8.9 entry recording the fix was correct the whole
time.**

**All four stale entries are listed in 3.c for you to correct. I did not edit `reference-manual.md`, per
your instruction.**

---

# §6 — WHAT WAS NOT TOUCHED

✅ Confirmed by `git diff`: **no file was modified by this task.**

- ✅ `lib/features.ts` — unchanged (`git diff` empty)
- ✅ `lib/plan-features.ts` — unchanged (`git diff` empty)
- ✅ The Graph API version pin, the webhook route, the classifier, `trucks.phone_number_id`
- ✅ The three WhatsApp fixes already in the working tree
- ✅ `docs/reference-manual.md` — **deliberately not edited**, per step 3

⚠️ **Also in `git status`, all from earlier tasks today and none from this one:**
`app/api/webhooks/meta/whatsapp/route.ts`, `supabase/migrations/20260523_messaging_schema.sql`,
`docs/reference-manual.md`, `docs/website-embed-read.md`, `docs/hatchgrab-root-landing.md`, and three
report files.

---

# §7 — WHAT REMAINS OPEN, IF YOU WANT IT

**Not proposed as work — listed because the diagnosis surfaced it.**

1. 🔴 **Four stale manual entries** (3.c). The §4 one is the worst: it is in the *Feature gating rules*
   list, which is where someone checks a tier before writing a gate.
2. ⚠️ **The `// Max` comment header above `whatsapp_replies` in the `Feature` union** (1.a) — the most
   likely cause of the misreading, and a one-line move to the `// Pro` group.
3. ⚠️ **The parity guard is one-directional and has no CI step** (1.d). *Allowed but not advertised*
   passes silently, and the guard only fires when a pricing page renders.
4. ⚠️ **The landing card's hand-written bullets are unchecked against `FEATURE_SECTIONS`** (3.b ii).
   The file knows and says so; nothing enforces it.
