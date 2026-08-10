# `readLedger` — the `order_key` filter restored, and the class guarded

**Date:** 10 August 2026
**Files changed:** `lib/payments/ledger.ts`, `app/api/dashboard/route.ts`. Nothing else.
**Not run, per the constraints:** `cap sync`, `next dev`, `next build`.

---

## 🔴 The headline: Gusto did not lose any money, and their paid step is ON

Two findings from exercising this against the live database. Both **correct the record**, including things I wrote myself and put in the manual.

### 1. `show_paid_step` for Pizzeria Gusto is **`true`**, not `false`

```
TRUCKS: [{ "id": "pizzeria-gusto", "name": "Pizzeria Gusto",
           "show_paid_step": true, "takes_cash": false, "plan": "trial", "active": true }]
recent events: 6 checked — show_paid_step_override = null on every one
```

Every brief this week, the reference manual, and several of my own reports state Gusto is
`show_paid_step false`. **It is true, at truck level, with no event override.** Independently
corroborated by their own data: ledger rows are written **minutes before** `collected_at` (order #3 paid
17:15:59, collected 17:34:34), which is the two-act `mark_paid` → `Collected` signature. A paid-step-off
truck writes both in the same request.

**This matters beyond a fact correction.** The KDS `ledgerRows` defect I reported as *"latent, because
Gusto has show_paid_step false"* **was not latent for them** — it was live. And their tap count is 3,
not the 2 I reported.

### 2. No money was lost on 7 August

Every collection inside the incident window has a correct ledger row:

```
7 AUG COLLECTIONS (incident window 14:24–19:00 BST = 13:24–18:00 UTC)
  order  collected_at(UTC)      total   ledger_row_at(UTC)     amount
  #21   2026-08-07T17:34:10  £ 35.00  2026-08-07T17:33:56  £ 35.00
  #3    2026-08-07T17:34:34  £ 32.00  2026-08-07T17:15:59  £ 32.00
  #4    2026-08-07T17:34:36  £ 12.00  2026-08-07T17:34:17  £ 12.00
  … 14 more, every one matched …
  collected inside the incident window: 17  |  of those MISSING a ledger row: 0
```

**17 in-window collections, 17 ledger rows, every amount equal to the order total.** The buggy build was
never serving Gusto's traffic. Ledger coverage by day:

| Day | Collected | Has ledger row | Missing |
|---|---|---|---|
| 18 Jun – 28 Jul | 117 | 0 | 117 — **pre-ledger, not damage** (`order_payments` was created 29 July) |
| **31 Jul** | 35 | **35** | 0 |
| **3 Aug** | 4 | **4** | 0 |
| **7 Aug** | 29 | **29** | 0 |

⚠️ **The reconstruction task in `docs/payments-damage-report.md` and the backlog is therefore not needed
for Gusto.** I recorded that damage as fact in the V11.5 manual entry on the strength of the mechanism
rather than the data. The mechanism was real; the exposure was not.

### The one thing that IS residue — a single corrupted cache row

```
pizzeria-gusto #1  status=cancelled  collected_at=null  total=£25.00
                   payment_status='refund_due'   amount_paid=1050.4   updated_at=2026-08-07T16:08:09Z
  its ledger rows: NONE — nothing was inserted (the short-circuit)
ALL refund_due rows across ALL trucks: 1
```

£1,050.40 written against a £25 cancelled order — the whole-table sum at that moment. **One row, one
truck, no money involved.** `recalcOrderPayment` will converge it to `unpaid` / `0.00` once this deploys,
which is correct: nothing was taken.

---

## Part 1 — State established

### 1. A revert **was** in progress. Aborted, deliberately.

```
You are currently reverting commit 3a1d082.
  (all conflicts fixed: run "git revert --continue")
```

**Aborted rather than continued.** A wholesale revert of `3a1d082` is the wrong instrument: that commit
contains **three things worth keeping** alongside the one bad line — the KDS `ledgerRows` fix, the
`hidePayments` device toggle, and the `livemode` migration. Reverting would have thrown all three away
to undo a missing `WHERE` clause.

My uncommitted `reference-manual.md` / `manual-update-report.md` work was **backed up first** and
verified byte-identical (md5) afterwards. `.git/REVERT_HEAD` and `.git/MERGE_MSG` are cleared.

### 2. 🔴 Correction to the brief — the Stripe files came from `b7f3213`, not `3a1d082`

```
$ git log --oneline --diff-filter=A -1 -- <each file>
app/api/webhooks/stripe/route.ts                      <- b7f3213
lib/stripe/webhook-signature.ts                       <- b7f3213
supabase/migrations/20260807_stripe_webhook_events.sql <- b7f3213
```

`b7f3213` is `HEAD` and was never being reverted, so **all three were structurally never at risk.** All
present: 214, 162 and 150 lines respectively. Everything else from `3a1d082` is also restored — KDS
`ledgerRows` prop present, `hidePayments` present (6 references), livemode migration file present.

### 3. `readLedger` on disk before the fix — **the filter was ABSENT**

```ts
async function readLedger(supabase: SupabaseClient, orderKey: string): Promise<LedgerRow[]> {
  const { data, error } = await supabase
    .from('order_payments')
    .select(LEDGER_ROW_COLUMNS)
    .eq('livemode', true)                    // ← the only filter. order_key GONE.
  if (error) throw new Error(`[ledger] could not read order_payments for ${orderKey}: …`)
```

`orderKey` survived **only inside the error string** — which is exactly why `@typescript-eslint/no-unused-vars` never fired.

---

## Part 2 — The fix

**Both filters. Neither replacing the other.**

```ts
.from('order_payments')
.select(LEDGER_ROW_COLUMNS)
.eq('order_key', orderKey)   // WHOSE money is this?  Scope.
.eq('livemode', true)        // is this money REAL?    Mode.
```

The site carries the incident written at the scene, and the instruction that matters:
*"They answer DIFFERENT questions and are not interchangeable… If you are adding a third, ADD it. Do not
edit either of these two lines to make room."*

**The `livemode` predicate is `= true`, and that is correct** — measured, not assumed:

```
livemode column: ✅ PRESENT      order_payments TOTAL rows: 83
  livemode=true: 83   livemode=false: 0
```

The column exists (the migration was applied), every row is live, and the ledger must count real money
only. Had the column been absent, this filter would have broken every balance read — which is precisely
the kind of assumption this exercise exists to stop making.

---

## Part 3 — 🔴 Verification against real database rows

**`tsc` and lint are not offered as verification.** They passed on the original bug. What follows is the
real query against the real database, with the real numbers.

A throwaway script imported the **actual** `lib/payments/ledger.ts` (via a `@/`-alias resolver hook, since
the module uses path aliases) and reproduced `readLedger`'s query and assertion byte-for-byte —
`readLedger` is module-private. **Read-only: SELECT only, no INSERT/UPDATE/DELETE, and none of the
writing functions was called.**

```
TABLE: order_payments total rows = 83
       whole-table succeeded sum   = 187590 minor (£1875.90)
       ^ this is what EVERY order's balance was subtracted from during the incident
```

### (a) `readLedger` returns ONLY that order's rows

```
  order_key                       : 44d0e7f8-123d-4ae4-8e0d-564f0daa2608
  rows returned FOR THIS ORDER    : 1
  rows in the WHOLE table         : 83
  differ?                         : YES — 1 !== 83  ✅
  every returned row is this order: YES ✅
  what the BUGGY query returned   : 83 rows (82 belonging to OTHER orders)
```

### (b) `getOrderBalance` for a PAID order — sensible, not negative

```
  order #2  truck=test-truck
  order total_minor               : 950 (£9.50)
  paidMinor                       : 950 (£9.50)
  balanceMinor                    : 0 (£0.00)
  status                          : paid
  balanceMinor >= 0 ?             : YES ✅ (not negative)

    with the FIX : balanceMinor 0 → fully paid, correct short-circuit
    with the BUG : balanceMinor -186640 (£-1866.40) → status 'refund_due' → £0 RECORDED
```

### (c) `getOrderBalance` for an UNPAID order — balance equals the order total

```
  order #4  truck=demo-15yy2ecnkemmchrr8np69p29n8
  rows returned                   : 0
  order total_minor               : 1350 (£13.50)
  paidMinor                       : 0
  balanceMinor                    : 1350 (£13.50)
  status                          : unpaid
  balanceMinor === total_minor ?  : YES ✅
  with the BUG this order would have been: balanceMinor -186240 → 'refund_due' → £0 RECORDED ❌
```

### (d) The guard fires when the filter is missing

```
  ✅ THREW: SCOPE VIOLATION: 82 of 83 rows belong to a DIFFERENT order.
```

### Gusto, against their own live rows

```
  Pizzeria Gusto (pizzeria-gusto)  show_paid_step=true takes_cash=false
    ledger rows: 68  |  all livemode=true: true
    order #3: total £24.00, paid £24.00, balance £0.00, status 'paid' ✅
    order #8: total £39.50, paid £39.50, balance £0.00, status 'paid' ✅
    order #7: total £24.00, paid £24.00, balance £0.00, status 'paid' ✅
    order #5: total £27.40, paid £27.40, balance £0.00, status 'paid' ✅
    order #9: total £23.50, paid £23.50, balance £0.00, status 'paid' ✅
    sampled 5: 5 sensible, 0 negative
```

### Script deleted

```
$ rm -f __verify_readledger.mjs __alias_hook.mjs
$ ls __verify_readledger.mjs __alias_hook.mjs
ls: __verify_readledger.mjs: No such file or directory
ls: __alias_hook.mjs: No such file or directory
$ git status --short        # no stray files
```

**Confirmed deleted. Both of them.**

### Regression only — not verification

```
$ npx tsc --noEmit ; echo $?
0
$ diff lint-baseline lint-now
✅ LINT RULE PROFILE IDENTICAL TO BASELINE (912 / 15 rules)
```

`lib/payments/ledger.ts` produces **0** lint messages. `app/api/dashboard/route.ts` produces 17, **all
pre-existing `@typescript-eslint/no-explicit-any`** — the global profile is unchanged, so none are new.

---

## Part 4 — The guard

**Built. A runtime scope assertion inside `readLedger`:**

```ts
const rows = (data ?? []) as unknown as (LedgerRow & { order_key?: string })[]
const strays = rows.filter(r => r.order_key !== orderKey).length
if (strays > 0) {
  throw new Error(`[ledger] SCOPE VIOLATION reading order_payments for ${orderKey}: ${strays} of ${rows.length} rows belong to a DIFFERENT order. …`)
}
```

Plus the enabling change — **`order_key` added to `LEDGER_ROW_COLUMNS`**, with a comment saying it is
load-bearing and must not be removed. `app/api/dashboard/route.ts` had `` `order_key, ${LEDGER_ROW_COLUMNS}` ``
and now uses the constant alone, so the column is not selected twice.

### 🔴 My first draft of this guard was inert, and that is worth recording

The version I wrote before checking read `r.order_key !== undefined && r.order_key !== orderKey`. But
`LEDGER_ROW_COLUMNS` did **not** include `order_key`, so `r.order_key` was `undefined` on every row and
**the assertion could never fire.** It passed `tsc`. It passed lint. It would have sat there looking like
protection.

That is the same failure as the bug it guards against — a plausible-looking construct that no static
check can evaluate — reproduced while writing the fix for it. Two corrections followed: select the
column, and drop the `!== undefined` escape so **a row whose `order_key` was not selected now fails**.
The guard therefore catches its own precondition being removed, which is the only way it stays alive.

### Why this one, and the trade-off

It checks the **result**, not the query. A `WHERE` clause is invisible to `tsc` and to lint — both
passed on 7 August — but a returned row's `order_key` is a value that can be compared. Cost is one
comparison per row over a set measured at **1 row per order across all 83**.

**It throws rather than filtering the strays out.** Every caller already fails safe on a throw:
`collected` and `mark_paid` catch and fail **open** (the order completes, a `paymentWarning` is set, the
log names the `order_key`); `undo_collected` fails **closed**. Silently correcting the data would hide
the defect for exactly as long as it took someone to notice the money was wrong — the failure mode this
exists to end.

**Stated plainly: it is a detector, not a preventer.** It fires after a bad query runs, only on a path
someone exercises, and it cannot catch a filter that is wrong in a way that still returns this order's
rows — a wrong `livemode` predicate, for instance, would pass it.

**Rejected: a typed query builder that cannot omit `order_key`.** Genuinely stronger — it makes the
mistake unrepresentable rather than detectable. But it means wrapping the PostgREST builder for this
table, it protects only sites that adopt it, and it is a larger change to money code than the fix it
accompanies. Not small; described and not built, per the brief.

---

## Gusto — what changes

**Operationally: nothing.** Production is on the rolled-back build and their collections are recording
correctly — 29/29 on 7 August, 100% ledger coverage since 31 July.

**How I know**, rather than assume:
- Their real orders resolve correctly through the fixed function: 5 of 5 sampled show `balance £0.00`,
  status `paid`, `balanceMinor >= 0`.
- Check (a) proves the read is scoped to **1 row**, not the 83 rows / £1,875.90 the bug summed.
- Their 17 in-window collections on 7 August all carry correct ledger rows — the damage did not occur.

**What this fixes is the repo.** `HEAD` (`b7f3213`) still contained the bug, so **deploying it as it
stood would have introduced the £0 defect to a truck that never suffered it.** That is the actual risk
this change removes.

⚠️ **One row still needs repair:** `pizzeria-gusto #1` carries `payment_status='refund_due'` and
`amount_paid=1050.40` on a £25 cancelled order with no ledger row. `recalcOrderPayment` converges it to
`unpaid` / `0.00` once this deploys. No money is involved.

⚠️ **Deploy note, yours not mine:** production (`6be1064`) is behind the repo. Shipping this also ships
`3a1d082` + `b7f3213` — the KDS `ledgerRows` fix, `hidePayments`, `livemode` filtering, and the Stripe
webhook route. Bigger than "one line".

---

## Constraints — held

| Constraint | Status |
|---|---|
| Don't touch customer order path, KDS, printing, commerce-policy, pricing, keep-awake, native shell, legal pages | ✅ two files changed: `lib/payments/ledger.ts`, `app/api/dashboard/route.ts` |
| No `cap sync` / `next dev` / `next build` | ✅ none run |
| Script read-only, deleted afterwards | ✅ SELECT only; both files deleted and confirmed |
| `tsc`/lint not offered as verification | ✅ reported as regression only |
| Flag garbled spans | ✅ nothing garbled; one factual correction (Stripe file provenance) flagged in Part 1 |

## Corrections this work forced to the record

1. **Gusto's `show_paid_step` is `true`.** The manual (§37, V11.5 changelog), `docs/kds-payment-report.md`,
   `docs/payment-actions-report.md` and `docs/stripe-connect-report.md` all say false.
2. **No money was lost on 7 August.** The V11.5 changelog states *"every collection from 14:24 recorded
   £0"* as fact. The mechanism was real and the rollback was right; the exposure was not.
3. **The KDS `ledgerRows` defect was live for Gusto, not latent** — it follows from (1).
4. **Reconstruction is not needed.** One cache row needs recalculating; no payments need reconstructing.

These are documentation changes, not code, and I have not made them — say the word and I will.
