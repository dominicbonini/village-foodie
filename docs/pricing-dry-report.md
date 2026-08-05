# Per-truck pricing suppression — BUILD

**Date:** 5 August 2026. Supersedes the DRY audit of the same name.
**Migration: WRITTEN, NOT RUN.** No SQL executed. `next dev` / `next build` not run. `NEXT_PUBLIC_PRICING_PUBLISHED` not touched.
No garbled spans in the brief.

**Seven files:** one new migration, one new component, and five edits.

---

## A. THE MIGRATION — written, not run

**`supabase/migrations/20260805_trucks_hide_pricing.sql`**

```sql
alter table trucks add column if not exists hide_pricing boolean not null default false;

comment on column trucks.hide_pricing is '…';

notify pgrst, 'reload schema';
```

Idempotent (`if not exists`), `NOT NULL DEFAULT false`, with a `comment on column` and a VERIFY block in the house style — including the reminder that `add column if not exists` succeeds whether or not it added anything, so the row count is the only proof.

### The UPDATE — separate, by slug, NOT in the migration file

```sql
-- Run ONCE, by hand, AFTER the migration above. Deliberately NOT in the migration file:
-- a migration describes the SHAPE of the schema; which operator is suppressed is DATA, and it will be
-- cleared from the admin console rather than by a second migration.
update trucks set hide_pricing = true where slug = 'pizzeria-gusto';

-- VERIFY — expect exactly one row, and it must be the truck you meant:
select id, slug, name, hide_pricing from trucks where hide_pricing = true;
```

⚠️ **By `slug`, as instructed.** `slug` is not declared unique in anything I read, so the verify query above is not optional — it is how you confirm the statement hit one row and the right one. `update … returning slug, name` would do the same job in one statement if you prefer.

### 🔴 DEPLOY ORDER — one direction genuinely matters

| Order | Safe? |
|---|---|
| Code before migration | ✅ **Yes for the operator surface.** `/api/manage` uses `select('*')`, which DEGRADES — the field is absent, the client reads `undefined`, `?? false` resolves to visible. Today's behaviour |
| Migration before code | ✅ Yes. Nothing reads the column until the code ships; the default is false |
| 🔴 **Code before migration, ADMIN** | 🔴 **NO.** `/api/admin` uses a hand-maintained explicit select, and a named select against a missing column fails the **whole query** with 42703 — blanking the entire admin trucks table |

**Run the migration BEFORE deploying.** This is recorded in the migration header.

---

## B. THE RULE

[lib/pricing.ts](lib/pricing.ts):

```ts
export function pricesVisibleFor(hidePricing: boolean): boolean {
  return PRICING_PUBLISHED && !hidePricing
}

export function maskPriceFor(val: string, hidePricing: boolean): string {
  if (NON_SECRET_PRICE.has(val)) return val
  return pricesVisibleFor(hidePricing) ? val : 'TBC'
}
```

✅ **ANDed, never overridden.** `hidePricing` is on the restrictive side, so flipping the global flag to `'true'` cannot reveal prices to a suppressed truck — which is the entire point. The non-sensitive allowlist (`Free`, `Free trial`, `Lifetime`, `0%`, `Pay at Hatch`) is exempt from both, exactly as before.

`maskPrice(val)` is **kept unchanged** as the global-only primitive, with a comment saying it has no truck context and must not be called from a component.

---

## C. WIRING — a React context, and why

### What I chose

**A context provider wrapping the manage page once, plus two hooks.** New file [components/PricingPolicy.tsx](components/PricingPolicy.tsx):

```tsx
const HidePricingContext = createContext<boolean>(true)   // default: HIDE

export function PricingPolicyProvider({ hidePricing, children }) { … }
export function usePriceMask(): (val: string) => string      // drop-in for maskPrice
export function usePricesVisible(): boolean                  // for copy gated on visibility
```

Wrapped once at [page.tsx:510](app/manage/[token]/page.tsx#L510), the highest point `truck` is available:

```tsx
<PricingPolicyProvider hidePricing={truck.hide_pricing ?? false}>
```

### Why, in the terms the brief set

**Threading a boolean was rejected because it works today and fails on the next price added.** A new call site that forgets the argument compiles fine or takes a default, and silently renders a real price to a suppressed operator — the projection-omission class the manual records three times. A rule that depends on every future author remembering it is a warning, not a control.

**The context inverts that.** `usePriceMask()` returns a function that already knows which truck it is for. The author of a new price does not need to know the truck exists, and the 17 existing call sites did not change at all — only the three *declarations* did.

### 🔴 The context default is `true` (hide) — deliberately NOT the column's default

The two defaults answer different questions and take opposite directions:

| | Default | Because |
|---|---|---|
| **Column** `hide_pricing` | `false` (visible) | "we have never thought about this truck" = follow the global flag = every truck's behaviour today |
| **Context** (no provider) | **`true` (hide)** | "this component is outside a provider" = we do not know whose truck this is |

**The failure directions are not symmetric.** Over-masking shows "TBC" to someone who could have seen a price — visible, harmless, reported within a day. Under-masking shows a real price to an operator we promised not to — invisible to us, and the exact thing this feature prevents. **Fail toward the mistake that announces itself.**

### Call sites converted — three declarations, seventeen renders

| Site | Change |
|---|---|
| [page.tsx:9725](app/manage/[token]/page.tsx#L9725) BillingTab | `const px = maskPrice` → `const px = usePriceMask()`. **The 14 `px(…)` uses are untouched** |
| [page.tsx:9728](app/manage/[token]/page.tsx#L9728) footnote 2 | `PRICING_PUBLISHED ||` → `pricesVisible ||` (`usePricesVisible()`) — it substitutes a sentence rather than masking a value |
| [page.tsx:8182](app/manage/[token]/page.tsx#L8182) van add-on | two direct `maskPrice(…)` calls → `vanPx(…)` from the same hook |
| [FeatureGate.tsx:28](components/FeatureGate.tsx#L28) | `maskPrice(meta.price)` → `px(meta.price)`. ✅ **Both render sites inherit it; neither was edited** |

⚠️ **`FeatureGate` gained `'use client'` and its hook sits above the early returns** — hooks cannot follow a conditional return. Same for BillingTab: both hooks are hoisted above `if (!truck) return null`. ⚠️ **The three `useState` calls below that guard are a PRE-EXISTING `rules-of-hooks` violation** (3 errors in the baseline). I left them alone — relocating live billing state is not this task — and a comment says so, so the new hooks are not later "tidied" down to join them.

---

## D. PROJECTION — CHECKED, NOT ASSUMED

**Every path that feeds a masking call site:**

| Path | Projection | `hide_pricing` arrives? |
|---|---|---|
| **`/api/manage` GET** → `truck` → BillingTab, SettingsTab, FeatureGate | [route.ts:26-28](app/api/manage/route.ts#L26) **`.select('*')`**, returned as `{ ...truck, logo }` at [:167](app/api/manage/route.ts#L167) | ✅ **automatically, no edit needed** |
| 🔴 **`/api/admin` GET** → admin trucks table + edit modal | [route.ts:54](app/api/admin/route.ts#L54) **hand-maintained explicit select** | 🔴 **NO — would have been silently absent. FIXED: added to the list** |
| `/api/dashboard` | reads no price and calls no masking function | n/a — deliberately not touched |
| `/api/admin` POST | `const { truckId, discoveryTruckId, ...updates } = body` then `.update(updates)` — **no allowlist on the trucks path** | ✅ `hide_pricing` passes through unchanged |

**This is exactly the failure D anticipated**, and it was real: the manage page was safe by luck of `select('*')`, the admin console was not. Left unfixed, the admin toggle would have read `undefined`, rendered unchecked for a suppressed truck, and written `false` on the next save — **silently clearing the suppression**.

⚠️ Both admin queries already carry a comment about a named select failing the whole statement with 42703 (`route.ts:60`, about `signup_promo_code`). The same trap, the same file, two columns apart.

---

## E. ADMIN

| Change | Where |
|---|---|
| Column added to the explicit select | [api/admin/route.ts:54](app/api/admin/route.ts#L54) |
| `hide_pricing: boolean` on `AdminTruck` | [admin/page.tsx:33](app/admin/page.tsx#L33) |
| Checkbox **"Hide pricing (show TBC)"** beside **Active** in the edit modal | [admin/page.tsx:1048-1059](app/admin/page.tsx#L1048) |

Uses the established `modalEdits.x ?? editingTruck.x` pattern copied from the Active toggle, and saves through the existing modal save. **No new endpoint, no allowlist change.** ✅ Clearable without SQL, which was the requirement.

---

## VERIFY — what each surface shows

`px('£29/mo')` on the Billing tab, matrix, FeatureGate and van add-on:

| Truck | `NEXT_PUBLIC_PRICING_PUBLISHED` | `hide_pricing` | Renders |
|---|---|---|---|
| **Gusto** | **`'true'` (ON)** | `true` | 🔴 **`TBC`** — the whole point |
| **Gusto** | OFF | `true` | `TBC` |
| **Any other truck** | **`'true'` (ON)** | `false` | ✅ **`£29/mo`** — real price |
| **Any other truck** | OFF | `false` | `TBC` |

Non-sensitive values (`Free`, `Free trial`, `Lifetime`, `0%`, `Pay at Hatch`) render as themselves in **all four** cells, unchanged.

Footnote 2 follows the same table: Gusto keeps *"Platform and card processing fees are TBC…"* after the flip; everyone else gets the real Stripe wording.

### ✅ A truck with no `hide_pricing` value behaves as VISIBLE

Three independent guards, all resolving to "not hidden":

1. **Column default** — `NOT NULL DEFAULT false`, so every existing row is `false` the moment the migration runs.
2. **Absent field** (pre-migration, or a projection that drops it) — `truck.hide_pricing ?? false` at [page.tsx:510](app/manage/[token]/page.tsx#L510). `undefined ?? false` → `false` → visible.
3. **Type** — `hide_pricing?: boolean` on the `Truck` interface, so the optional case is expressed rather than assumed.

⚠️ The **context** default is the opposite (`true`/hide) and that is intentional — it covers "no provider at all", a programming error, not a data state. Both are documented at their definitions.

### Build

```
$ npx tsc --noEmit
TSC EXIT: 0
```

| File | Baseline | Now | |
|---|---|---|---|
| `app/manage/[token]/page.tsx` | 370 (293 err, 77 warn) | **370 (293, 77)** | ✅ exact |
| `app/admin/page.tsx` | 10 (8, 2) | **10 (8, 2)** | ✅ exact (verified by stashing) |
| `components/FeatureGate.tsx` | clean | **clean** | ✅ |
| `components/PricingPolicy.tsx` | — | **clean** | ✅ new |
| `lib/pricing.ts` | clean | **clean** | ✅ |
| `app/api/admin/route.ts` | clean | **clean** | ✅ |

⚠️ **The manage page briefly went to 372.** Both new errors were `react-hooks/rules-of-hooks` — my two hooks landing *below* BillingTab's `if (!truck) return null` and joining the pre-existing violation there. Fixed by hoisting them above the guard, which is also simply correct. **Caught by the baseline check, not by review.**

---

## SCOPE

| Constraint | Status |
|---|---|
| Purchase-CTA gates / `lib/commerce-policy.ts` | ✅ **untouched.** Not read by, and does not read, anything here |
| Prices, thresholds, fees, footnote text | ✅ **unchanged.** `PLAN_META`, `PLAN_ALLOWANCES`, `TRANSACTION_ROWS`, `FOOTNOTES` not edited — this changes *when* a value is shown, never *what* it is |
| `NEXT_PUBLIC_PRICING_PUBLISHED` | ✅ **not flipped.** Yours, in Vercel |
| SQL | ✅ **not run.** Migration written, UPDATE supplied separately |

🔴 **The two axes are deliberately not connected.** `commerce-policy` answers *"may this PLATFORM show a purchase CTA"* (iOS: no). `hide_pricing` answers *"may this TRUCK see real numbers"*. On iOS with a suppressed truck both apply independently — the CTA is absent and any surviving price reads TBC — but **neither module imports the other**, and combining them would mean one flag could mask a change in the other.

### ⚠️ Not addressed, and still true from the audit

The **admin console and the landing page render `PLAN_PRICES` unmasked** — they never called `maskPrice` and still do not, so `hide_pricing` does not reach them. Both are access-gated (staff-only; `/landing` is admin-gated in production), and extending masking there was not in scope. **After the global flip, an admin viewing the console sees real prices for every truck including Gusto** — correct for a staff surface, but worth knowing before someone screen-shares it.
