# Self-serve provisions `trial`, and a NULL expiry means NOT STARTED

**Date:** 4 August 2026.
**Migrations:** none. **SQL:** none run. **`next dev` / `next build`:** not run. **No backfill.**
No garbled spans.

**Y1 and Y2 were read together before anything was written, and they can both be satisfied** — with one
condition Y2(d) exists to catch, found and fixed. Detail under Y2(d).

---

## Y1. PROVISIONING SWITCHES TO `trial`

`lib/provision-truck.ts`, the **operator** profile:

```diff
-    plan: 'demo',                 // pre-trial "setup mode" — NOT 'trial'. canAccess() returns false for
-                                  // EVERY feature when plan==='trial' && trial_expires_at is null.
+    plan: 'trial',
```

The comment it replaces is preserved in the new one, because it explains why `demo` was chosen and why
that reason has expired: it was a **workaround for the very `canAccess` branch Y2 changes**.

### (a) ✅ Which profile changed — confirmed

```
lib/provision-truck.ts:140    plan: 'trial',      ← OPERATOR profile   (changed)
lib/provision-truck.ts:174    plan: 'demo',       ← DEMO profile       (UNCHANGED)
```

**A prospect's throwaway demo truck is not a signup and does not become a trial.** `PLAN_FEATURES.demo`,
`PLAN_META.demo` and `'demo'` in the `Plan` union all stay exactly as they were — the value is still
live, just no longer reachable by signup.

### (b) `trial_expires_at` stays NULL

Unchanged at `lib/provision-truck.ts` — still `trial_expires_at: null`, with an expanded comment
recording that NULL now *means* something ("not started") rather than being a placeholder. Nomination
sets a date; nomination does not exist.

### (c) 🔴 No backfill — and what the five test trucks will do

**Nothing was backfilled.** The five existing `plan = 'demo'` test trucks are untouched and **will keep
the empty Billing tab** described in `docs/billing-tab-report.md` — `BillingTab` has branches for
`trial`, `starter` and `pro`/`max` and no fallback, so `demo` still renders an empty flex container.
That is unchanged by this slice and will remain until they are migrated by hand.

**The UPDATE to run — NOT EXECUTED:**

```sql
-- Migrate the five self-serve TEST trucks from the old pre-trial value to the new one.
-- 🔴 The `id not like 'demo-%'` clause is the whole safety of this statement: prospect demo trucks
--    carry that prefix and MUST stay on plan 'demo'. Never run it without that predicate.
-- Access is identical before and after (PLAN_FEATURES.demo === PLAN_FEATURES.trial); what changes is
-- that the Billing tab acquires a branch and stops rendering empty.
update trucks
set    plan = 'trial'
where  plan = 'demo'
  and  id not like 'demo-%'
  and  trial_expires_at is null;
```

Run this first to see exactly what it would touch:

```sql
select id, name, slug, plan, trial_expires_at, setup_step, created_at
from trucks
where plan = 'demo' and id not like 'demo-%'
order by created_at;
```

### (d) 🔴 THE BLAST RADIUS — every `plan === 'demo'` site, enumerated

| # | Location | What it is | What changes for a self-serve operator |
|---|---|---|---|
| 1 | `lib/provision-truck.ts:140` | operator profile's plan | **CHANGED** to `'trial'` |
| 2 | `lib/provision-truck.ts:174` | demo profile's plan | **unchanged** — prospect demos stay `'demo'` |
| 3 | `lib/provision-truck.ts:259` `VALID_PLANS` | includes `'demo'` | **unchanged** — still a valid value to provision or set |
| 4 | `lib/provision-truck.ts:286` `if (kind === 'demo') return` | tests **kind**, not plan | **unaffected** |
| 5 | `lib/features.ts:1` `Plan` union | includes `'demo'` | **unchanged** |
| 6 | `lib/features.ts:84` `PLAN_FEATURES.demo` | `new Set(TRIAL_FEATURES)` | **unchanged, and now only prospect demos read it.** 🔴 This is why access does not move: the set a signup gets is identical before and after |
| 7 | `lib/features.ts:137` `PLAN_META.demo` | name/price/description | **unchanged** — still needed for the admin console |
| 8 | `app/admin/page.tsx:159` `PLAN_ORDER` | includes `'demo'` | **unchanged** — the admin matrix keeps its Demo column |
| 9 | `app/admin/page.tsx:67/402/1677/1708` | `kind: 'operator' \| 'demo'` in create-truck | **kind**, not plan — **unaffected** |
| 10 | `app/api/admin/create-truck/route.ts:34` | validates `kind` | **unaffected** |
| 11 | **`BillingTab`** | no `demo` branch at all | 🔴 **THE POINT OF THE CHANGE.** A self-serve operator now matches `plan === 'trial'` and gets the full Billing page instead of an empty div |
| 12 | Billing tab **visibility** (`page.tsx:488`) | `truck?.plan !== 'tester'` | **unaffected** — `trial` was never excluded |
| 13 | `app/dashboard/[token]/page.tsx:136` | a **comment** saying a signed-up truck also sits on plan `'demo'` | **STALE — corrected.** The detector is `token.startsWith('demo-')` and always was; only its justification changed |
| 14 | `app/manage/[token]/page.tsx` QR default | a **comment** citing `plan 'demo'`'s feature set | **STALE — corrected.** The logic is unchanged: `canAccess(..., 'branded_qr_code', ..., null)` still passes, now via the trial set |
| 15 | `lib/settings-copy.ts:35` | a **comment** in `TRIAL_NOT_STARTED_BY_EVENTS` | **STALE — corrected**, with the change recorded rather than overwritten |
| 16 | `lib/email-signup.ts:169-171` | a **comment** explaining why the welcome email omits the trial paragraph | ⚠️ **Now partially stale and DELIBERATELY LEFT.** Its conclusion still holds — nomination still does not exist, so the paragraph still must not ship — and rewriting it would touch a live email module for a comment. Flagged, not edited |

**Nothing in that list is a behaviour change except #11.** Four are stale comments (three corrected, one
flagged); the rest are `kind`-based, admin-only, or the `demo` plan value continuing to exist for the
trucks that still use it.

---

## Y2. 🔴 NULL MEANS "NOT STARTED"

### (b) The exact before and after — `lib/features.ts`

**Before:**
```ts
if (plan === 'trial') {
  if (!trialExpiresAt) return false
  if (new Date(trialExpiresAt) <= new Date()) return false
  return PLAN_FEATURES.trial.has(feature)
}
```

**After:**
```ts
if (plan === 'trial') {
  if (!trialExpiresAt) return PLAN_FEATURES.trial.has(feature)          // not started yet
  if (new Date(trialExpiresAt) <= new Date()) return false              // expired — UNCHANGED
  return PLAN_FEATURES.trial.has(feature)                               // running
}
```

**One line changed.** The three branches are kept explicit rather than collapsed, so the not-started case
is legible and the expired case is visibly untouched in a diff.

### (a) ✅ The EXPIRED case is untouched

`if (new Date(trialExpiresAt) <= new Date()) return false` is byte-identical. A past date still denies
everything. That is a product decision Dominic has not made — Y4.

### (c) 🔴 No existing truck's access changes — traced, not asserted

Both branches this slice touches require a **NULL** expiry. All three live trucks have **future** dates,
so neither is reached: they take the third branch, `return PLAN_FEATURES.trial.has(feature)`, before and
after.

| Truck | `trial_expires_at` | Branch taken (before) | Branch taken (after) |
|---|---|---|---|
| Pizzeria Gusto | 2026-10-17 | running → trial set | **running → trial set** |
| Real Thai Food | 2026-09-30 | running → trial set | **running → trial set** |
| Test Kitchen | 2026-08-23 | running → trial set | **running → trial set** |
| a self-serve signup | NULL | *(would have been)* deny all | not started → trial set |
| a hypothetical expired trial | past | deny all | **deny all — unchanged** |

And per the live data, **no truck is currently on `trial` with a NULL or past expiry**, so the branch
whose meaning changed is **unreachable in production today**. The five `demo` trucks never enter the
`plan === 'trial'` block at all.

### (d) 🔴 EVERY OTHER READER — and the one that contradicted it

I enumerated all readers of `trial_expires_at` / `trialExpiresAt`. **One treated NULL as expired.**

| Reader | Treats NULL as expired? | Action |
|---|---|---|
| **`lib/useFeatures.ts:14-15`** | **🔴 YES** — `plan === 'trial' && (!trialExpiresAt \|\| <past>)` | **FIXED** — see below |
| `lib/features.ts` `hasFeature` | No — returns the trial set for `plan === 'trial'` regardless. Already consistent | none |
| `app/manage/[token]/page.tsx:397` trial reminder popup | No — `if (!truck.trial_expires_at) return`. A not-started trial correctly gets no nag | none |
| `page.tsx:660/670` "…ends soon" fallbacks | Unreachable for NULL — they live **inside** that popup, which returns early | none needed; left alone |
| `BillingTab` `trialActive` (`:9669`) | No — requires non-null AND future. Used only to size the matrix | see Y3 note |
| `components/FeatureGate.tsx:23` | No — delegates to `canAccess` | inherits the fix |
| `components/printing/PrintingSettings.tsx:53` | No — delegates to `canAccess` | inherits the fix |
| `app/api/manage`, `/api/menu`, `/api/orders/submit`, `/api/events/action`, both WhatsApp webhooks | No — all delegate to `canAccess` | inherit the fix |
| `app/admin/page.tsx` (579/587/995) | No — it **writes** the value | none |
| `app/api/dashboard/route.ts:583`, `/api/admin/route.ts:54` | No — pass-through projections | none |

**The fix, `lib/useFeatures.ts`:**

```diff
-  const isTrialExpired = plan === 'trial'
-    && (!trialExpiresAt || new Date(trialExpiresAt) < new Date())
+  const isTrialExpired = plan === 'trial'
+    && !!trialExpiresAt && new Date(trialExpiresAt) < new Date()
```

⚠️ **`isTrialExpired` currently has NO consumer** — `useFeatures` is imported exactly once
(`app/dashboard/[token]/kds/page.tsx:731`) and destructures only `can`. So this changes no behaviour
today. **It was fixed anyway:** a shared hook carrying a definition that contradicts the gate sitting
beside it is a trap set for whatever reads it first, and "it happens to be unused" is not a property
that survives the next feature.

---

## Y3. THE BILLING TAB

### (a) The not-started banner

The heading fell back to **"Your trial ends soon"** — false and alarming for the state every self-serve
operator is now provisioned into. Now:

| `trial_expires_at` | Heading |
|---|---|
| a date | `Your trial ends 17 October 2026` — **byte-identical to before** |
| **NULL** | **"Your free trial has not started yet"** |

### (b) The "You're on Max features" line — it renders, and it is half true

**It does render in the NULL case** — it sits directly under the heading with no date guard of its own.
Assessed rather than assumed:

- **"You're on Max features"** — **TRUE.** `PLAN_FEATURES.trial` is `[...MAX_FEATURES]`, and `canAccess`
  now grants that whole set on a NULL expiry. The sentence is accurate.
- **"Choose a plan before your trial ends to keep access"** — **FALSE.** It points at an ending that has
  not begun; there is nothing to act before.

**Corrected for the NULL case only:**

> **"You have every Max feature while you set up. You choose which event starts your free trial —
> until then, nothing is counting down."**

The dated branch keeps the original sentence, unchanged.

**Where the copy lives:** `TRIAL_NOT_STARTED_HEADING` and `TRIAL_NOT_STARTED_BILLING` in
`lib/settings-copy.ts`, **beside** `TRIAL_NOT_STARTED_BY_EVENTS`. That constant did **not** fit — it is
specifically about adding events not starting the trial, which is the wizard's question, not Billing's —
so new strings were added rather than one stretched to cover both. One home for trial copy, as required.

⚠️ **The T2 comment above `TRIAL_NOT_STARTED_BY_EVENTS` was stale the moment Y1 landed** — it said "a
self-serve operator is provisioned on plan 'demo', whose feature set never expires". Corrected in place,
with the change recorded rather than silently overwritten.

### 🔴 Not touched, and reported instead

`trialActive` (`:9669`) still requires a non-null future date, so for a not-started trial the matrix
renders **three** columns (starter/pro/max) with **no column highlighted as current**. Changing it would
alter what Gusto and RTF see, which Y3 forbids. Cosmetic, and left as-is deliberately.

---

## Y4. REPORT ONLY — THE EXPIRY CLIFF

**Test Kitchen expires 2026-08-23, nineteen days out.** On that date `canAccess` starts returning `false`
for every feature: no pre-ordering, no online payments, no printing, no WhatsApp replies, no advanced
reporting — while Billing still says *"You're on Max features"* (that branch is date-guarded only for the
lines around it, not for that sentence).

**What should happen, in my view: fall back to Starter's feature set.**

- Starter is a real, permanently free tier that already exists and is already a complete product — walk-up
  orders, KDS, dashboard, menu, deals, Pay-at-Hatch online ordering.
- "Your trial ended, so you are on the free plan" is a sentence an operator can act on. "Your trial ended,
  so nothing works" is not a plan, it is an outage — and for a truck mid-service it is an outage with
  customers standing at the hatch.
- It also matches what every other entry in the manual and the pricing page implies happens.

**The smallest change** would be one line in `canAccess`:

```ts
if (new Date(trialExpiresAt) <= new Date()) return PLAN_FEATURES.starter.has(feature)
```

…plus the Billing copy for that state, which currently claims Max features. **Not built.** Two reasons
beyond it being Dominic's call: it changes what a live trading truck can do on a date nineteen days away,
and it should be decided together with what the `plan` VALUE becomes at expiry — today nothing writes it,
so the row would still say `trial` while behaving as Starter, which is the same
snapshot-is-not-a-history trap recorded in manual §35.

---

## VERIFICATION

```
$ npx tsc --noEmit
TSC EXIT CODE: 0
```

| File | Baseline | Now |
|---|---|---|
| `lib/features.ts` | 0 | **0** |
| `lib/useFeatures.ts` | 0 | **0** |
| `lib/provision-truck.ts` | 0 | **0** |
| `lib/settings-copy.ts` | 0 | **0** |
| `app/manage/[token]/page.tsx` | **370** (293 errors, 77 warnings) | **370 (293, 77)** |
| `app/dashboard/[token]/page.tsx` | **93** (68 errors, 25 warnings) | **93 (68, 25)** |

### Files touched

| File | Reason |
|---|---|
| `lib/provision-truck.ts` | Y1 — operator profile provisions `trial`; demo profile untouched |
| `lib/features.ts` | Y2 — `canAccess`: NULL expiry grants the trial set; expired branch unchanged |
| `lib/useFeatures.ts` | Y2(d) — `isTrialExpired` no longer counts NULL as expired |
| `lib/settings-copy.ts` | Y3 — two not-started strings; the stale T2 comment corrected |
| `app/manage/[token]/page.tsx` | Y3 — Billing's not-started heading and sentence; one stale comment |
| `app/dashboard/[token]/page.tsx` | one stale comment about the demo detector (no logic change) |

### 🔴 What the three live trucks can access — before and after

- **Pizzeria Gusto** — before: the full trial (Max) feature set, because its trial runs to 17 October.
  After: **exactly the same**, by the same code path; neither branch this slice touched is reached for a
  future date.
- **Real Thai Food** — before: the full trial (Max) feature set, expiry 30 September. After: **exactly
  the same**, unchanged path, unchanged copy.
- **Test Kitchen** — before: the full trial (Max) feature set, expiry 23 August. After: **exactly the
  same** — and unchanged too is the cliff on 23 August, which this slice deliberately did not move (Y4).

**No production truck's access, Billing page or copy changes as a result of this slice.** The only
trucks whose behaviour differs are ones provisioned from now on, and the five test trucks *if* the Y1(c)
UPDATE is run.
