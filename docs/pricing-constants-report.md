# Structuring the pricing numbers — refactor report

**Date:** 23 August 2026
**Status:** built, **NOT deployed, NOT committed, `next dev` NOT run.** Joins the undeployed batch.
**Prompt integrity:** no span arrived garbled. No instruction contradicted another. **One naming
correction to the brief** — the `0.99%` cell lives in `TRANSACTION_ROWS`, not `FEATURE_SECTIONS`; both
are in the same file and both were handled.

✅ **TWO FILES CHANGED: `lib/features.ts` and `lib/plan-features.ts`. Nothing else.**

🔴 **THE HEADLINE RESULT, WHICH IS THE ONE THAT MATTERS: 225 leaf values compared, 0 differences, and
the two snapshot files are byte-identical as raw JSON.** No rendered output moves.

---

# §1 — TASK 2 EVIDENCE FIRST: THE BEFORE/AFTER COMPARISON

## 1.a Method

**Not a visual inspection.** Both modules were **executed** through `jiti` before the first edit and again
after the last one, and **every exported value from both** was serialised to JSON and compared
structurally, leaf by leaf:

`PLAN_META` · `PLAN_PRICES` · `PLAN_DESCRIPTIONS` · `PLAN_ALLOWANCES` · `CARD_FEES` ·
`CARD_FEE_ONLINE_LABEL` · `CARD_FEE_IN_PERSON_LABEL` · `TAP_TO_PAY_SURCHARGE_LABEL` ·
`TRANSACTION_ROWS` · `FEATURE_SECTIONS` (all rows, all cells) · `FOOTNOTES` · `findPlanParityViolations()`

✅ **DELIBERATELY EXHAUSTIVE RATHER THAN TARGETED.** I did not capture "the strings I expected to
touch" — that would only prove I changed what I meant to, not that I left everything else alone.

## 1.b Result

```
  leaf values compared : 225
  DIFFERENCES          : 0

  raw JSON byte-identical: True
  parity guard before/after: [] / []
```

**Spot-check of the four families that actually moved** (all unchanged, all now derived):

```
  PLAN_META.pro.price   : "£29/mo"
  PLAN_META.max.price   : "£49/mo"
  PLAN_ALLOWANCES.pro   : "First £1,500 of online orders included, then 0.99%"
  PLAN_ALLOWANCES.max   : "First £2,000 of online orders included, then 0.99%"
  allowance cells       : {"trial":"Unlimited","starter":"—","pro":"£1,500","max":"£2,000"}
  fee cells             : {"trial":"Free","starter":"Pay at Hatch","pro":"0.99%","max":"0.99%"}
  footnote 2            : "Online payments powered by Stripe Connect. Subject to 0.99% HatchGrab platform fee plus Stripe card processing fees (~1…
```

✅ **The parity guard also ran on both imports** and returned `[]` both times — it throws at module
load in non-production, so a broken import would have failed the snapshot rather than passed quietly.

---

# §2 — TASK 1: THE STRUCTURED NUMBERS

## 2.a Plan price — in `lib/features.ts`, because that is where the single source already is

```ts
export const PLAN_MONTHLY_PENCE: Record<'starter' | 'pro' | 'max', number> = {
  starter: 0,
  pro: 2900,
  max: 4900,
}

export function planPriceLabel(pence: number): string { … }   // "£29/mo"
```

**Why `lib/features.ts` and not beside `CARD_FEES`:** `PLAN_META` is declared *"THE SINGLE SOURCE for
plan name/price/description"*, and `lib/plan-features.ts` **imports from** `lib/features.ts` to derive
`PLAN_PRICES`. **The dependency runs one way.** Putting the number in `plan-features` and the string in
`features` would make `features` need to import back — a cycle — or would force the display string to
move modules, which would change what other files import. **The number had to go where the string already
lives.** That is the "ONLY if the plan price numbers belong there" condition in your scope, met.

## 2.b ✅ PENCE, AS AN INTEGER — WHAT I CHOSE AND WHY

**Chosen: pence, integer.** Three reasons, in order of weight:

1. **`CARD_FEES` two constants away already does it** (`pence: 20`), and the brief's own instruction is
   not to invent a different convention beside one that works.
2. **`orders.total_minor` is the codebase's money type** — §16 records it as *"the authoritative charge
   amount in pence"*. An allowance is compared against order value, which is **already pence**; storing
   pounds would put a conversion at every future comparison site in `lib/payments`.
3. 🔴 **It is the only representation that cannot accumulate a float error across twelve months of
   arithmetic**, which is precisely what the blocked consumers do.

⚠️ **`pct` stays a float (`0.99`), matching `CARD_FEES.online.pct = 1.5`.** A percentage is not money.

## 2.c Allowance and platform fee — in `lib/plan-features.ts`, beside `CARD_FEES`

```ts
export type OnlineAllowance =
  | { kind: 'amount'; pence: number }
  | { kind: 'none' }
  | { kind: 'unlimited' }

export const PLAN_ONLINE_ALLOWANCE: Record<'trial' | 'starter' | 'pro' | 'max', OnlineAllowance> = {
  trial:   { kind: 'unlimited' },
  starter: { kind: 'none' },
  pro:     { kind: 'amount', pence: 150000 },
  max:     { kind: 'amount', pence: 200000 },
}

export const PLATFORM_FEE_OVER_ALLOWANCE = { pct: 0.99 } as const
```

⚠️ **`PLATFORM_FEE_OVER_ALLOWANCE` IS DELIBERATELY NOT FOLDED INTO `CARD_FEES`.** They look alike and
are opposites: **`CARD_FEES` are Stripe's and carry a "not ours, cannot guarantee" warning; this one is
ours and we set it.** Merging them would put a fee we control under a comment saying we do not.

## 2.d The formatters

| Formatter | Produces | Mirrors |
|---|---|---|
| `planPriceLabel(pence)` | `"£29/mo"` | `feeLabel()` |
| `allowanceAmountLabel(pence)` | `"£1,500"` | — |
| `pctLabel({ pct })` | `"0.99%"` | `feeLabel()`'s treatment of `pct` |
| `allowancePenceFor(tier)` | the number, narrowed | — |

🔴 **`allowanceAmountLabel` DELIBERATELY DOES NOT USE `toLocaleString`.** This string is compared
byte-for-byte against its pre-refactor value, and **ICU availability differs between the build host and a
browser** — a trimmed-ICU Node would produce `£1500`. Manual grouping (`replace(/\B(?=(\d{3})+(?!\d))/g, ',')`)
is deterministic everywhere. **The one place a locale helper would have quietly broken the guarantee this
task is built on.**

✅ **`allowancePenceFor` exists so no derived string re-states a number.** My first draft interpolated
`allowanceAmountLabel(150000)` directly into `PLAN_ALLOWANCES` — **which would have been a second
hardcoding, three lines under the map that exists to prevent one.** It now reads through the map, and
**throws rather than falling back** if a tier stops being an `amount`: a loud module-load failure instead
of `£NaN` on the pricing table.

✅ **Verified: zero literal `£1,500`, `£2,000` or `0.99%` remain in executable code** in
`lib/plan-features.ts` (comments excluded).

---

# §3 — TASK 3: TIER COVERAGE

**Six tiers exist** (`starter, pro, max, trial, tester, demo`, from `PLAN_FEATURES`). Coverage, read by
execution:

| tier | `PLAN_MONTHLY_PENCE` | `PLAN_ONLINE_ALLOWANCE` | `PLAN_META.price` | fee-table column |
|---|---|---|---|---|
| starter | `0` | `{kind:'none'}` | `Free` | yes |
| pro | `2900` | `{kind:'amount',pence:150000}` | `£29/mo` | yes |
| max | `4900` | `{kind:'amount',pence:200000}` | `£49/mo` | yes |
| trial | — | `{kind:'unlimited'}` | `Free trial` | yes |
| tester | — | — | `Lifetime` | **no** |
| demo | — | — | `Demo` | **no** |

## 3.a ✅ THE FALSY-CHECK CLASS IS STRUCTURALLY PREVENTED, NOT AVOIDED BY CARE

You named the trial-expiry bug as the pattern to avoid. **A discriminated union is the fix, not a
convention.** `starter` is `{kind:'none'}` and `trial` is `{kind:'unlimited'}` — **two genuinely
different facts that a `number | null` would have collapsed into the same falsy value.** A consumer
**cannot** write `if (!allowance)`: TypeScript forces them to name which case they mean, and the
compiler catches an unhandled one.

## 3.b 🔴 TESTER AND DEMO ARE DELIBERATELY ABSENT, AND THAT IS A REPORTED GAP, NOT AN OVERSIGHT

**Neither has a published commercial position.** No column in `TRANSACTION_ROWS`, no entry in
`PLAN_ALLOWANCES`, no allowance sentence anywhere. Their `PLAN_META` prices are the words `Lifetime` and
`Demo`.

⚠️ **Giving them an allowance would have been inventing a commercial fact**, which the brief forbids
elsewhere and which I am not doing here. **They are excluded from the map's key type**, so a consumer
gets a compile error rather than `undefined` — **the absence is enforced, not accidental.**

**If you want them covered, it is a decision about what a tester and a demo truck are sold, not a
refactor.** `tester` most plausibly mirrors `max`; `demo` most plausibly `unlimited` — **but that is my
inference and it is not written anywhere, which is exactly why I did not encode it.**

---

# §4 — BLAST RADIUS: EVERY CONSUMER, BY GREP

## 4.a Values whose STRINGS are now derived — three renderers, all unchanged in output

| Value | Consumers |
|---|---|
| `PLAN_META` | `app/landing/page.tsx`, `app/admin/page.tsx`, `app/api/admin/route.ts`, `app/manage/[token]/page.tsx`, `components/FeatureGate.tsx`, `lib/useFeatures.ts` |
| `PLAN_PRICES` | `app/landing/page.tsx`, `app/admin/page.tsx`, `app/manage/[token]/page.tsx` |
| `PLAN_ALLOWANCES` | `app/landing/page.tsx` **only** (the three `.plan-fee` divs) |
| `TRANSACTION_ROWS` | `app/landing/page.tsx`, `app/admin/page.tsx`, `app/manage/[token]/page.tsx` |
| `FOOTNOTES` | `app/landing/page.tsx`, `app/admin/page.tsx`, `app/manage/[token]/page.tsx` |

✅ **Three rendering surfaces: the landing pricing table, Admin, and Manage → Billing.** All three read
values proven byte-identical in §1, so **none of them can render differently.**

## 4.b ✅ EVERYTHING NEW HAS ZERO CONSUMERS

`PLAN_MONTHLY_PENCE` · `planPriceLabel` · `PLAN_ONLINE_ALLOWANCE` · `PLATFORM_FEE_OVER_ALLOWANCE` ·
`PLATFORM_FEE_LABEL` · `allowanceAmountLabel` · `allowancePenceFor` · `pctLabel` · `OnlineAllowance`

**All eight exports and the type are read by nothing outside the two modules.** That is correct and
intended: **wiring `lib/payments` is explicitly out of scope and needs its own diagnosis with money on
the end of it**, and the calculator does not exist. **The blast radius of the additions is nil; the blast
radius of the derivations is three renderers whose output is proven unchanged.**

---

# §5 — TASK 4: WHAT WAS NOT DONE

- ✅ **No price, allowance or percentage changed.** Proven by §1 — a repricing would show as a diff.
- ✅ **`lib/pricing.ts` untouched.** The pre-launch mask is unchanged; the new numbers are **not**
  masked, which is correct because they are numbers rather than rendered strings — ⚠️ **and it means a
  future consumer must mask at the DISPLAY end, as every current surface already does.**
- ✅ **Parity guard, landing page, pricing table markup untouched.**
- ✅ **`lib/payments` not wired.**
- ✅ **The cost comparison page was not created.**

---

# §6 — VERIFICATION SUMMARY

| Check | Method | Result |
|---|---|---|
| No rendered output moves | execute both modules before/after, compare 225 leaves | ✅ **0 differences; raw JSON byte-identical** |
| Parity guard still clean | its return value, in both snapshots | ✅ **`[]` / `[]`** |
| No literal amounts left | comment-stripped scan of `lib/plan-features.ts` | ✅ **0 of `£1,500`, `£2,000`, `0.99%`** |
| Tier coverage | execution, all six tiers enumerated | ✅ **4 covered, 2 reported as undocumented** |
| Blast radius | grep per constant | ✅ **3 renderers; 8 new exports unconsumed** |
| Syntax | TypeScript parser | ✅ **both files parse clean** — a parse check, **not** a typecheck |

---

# §7 — WHAT REMAINS UNOBSERVED

1. 🔴 **NOTHING HAS BEEN RENDERED.** `next dev` was not run. **The landing pricing table, Admin and
   Manage → Billing have not been seen** since the change. The byte-identical guarantee is at the level
   of the values those surfaces read — **which is where the risk was, but it is not a screenshot.**
2. ⚠️ **NO TYPECHECK WAS RUN, only a parse.** This change adds a discriminated union and a `Record` with
   a narrowed key type — **exactly the shapes a typecheck catches and a parse does not.** If any
   consumer indexes `PLAN_ONLINE_ALLOWANCE` with a full `Plan`, that is a type error I have not run the
   check that would find it. **Today nothing consumes it, so the exposure is zero** — but the check is
   still unrun.
3. ⚠️ **`allowancePenceFor`'s throw path has never executed.** It cannot fire with the current data
   (both tiers are `amount`); it is a guard for a future edit.
4. ⚠️ **`planPriceLabel`'s pence branch has never executed** — both prices are whole pounds. The
   `£29.50` case is written and unexercised.
5. ⚠️ **The masking interaction is untested.** `NEXT_PUBLIC_PRICING_PUBLISHED` is presumably unset
   locally, so every rendered price is `TBC` in production today regardless — **the snapshot compares
   the pre-mask values**, which is the right comparison for this refactor and does not tell you what a
   visitor sees.

## ✅ WHAT THIS UNBLOCKS

**Both consumers named in the brief.** `lib/payments` can now read `PLAN_ONLINE_ALLOWANCE` and
`PLATFORM_FEE_OVER_ALLOWANCE` as numbers and actually apply an allowance — **the thing `CARD_FEES`'
comment says it could not do** — and a calculator can compute on `PLAN_MONTHLY_PENCE` without parsing
prose. **Neither is wired here.**

⚠️ **UNRELATED, BUT NOTED BECAUSE IT AFFECTS THE NEXT TASK:** the cost-comparison prototype supplied in
chat is **mojibake-damaged** — `Â£` for `£`, `â` for `—` and `·` throughout. The manual's standing rule
covers this exactly (anything containing `§`, `£`, `—` or emoji must reach the executor by
download-to-disk, not as chat text). **The file on disk should be used when that page is built, not the
pasted copy.**
