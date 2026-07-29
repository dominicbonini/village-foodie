# Collect idempotency key — LIVE BUG FIX (build report)

**Date:** 30 July 2026 · **Repo:** `/Users/dominicbonini/dev/village-foodie` · **Branch:** `main`
**Status: ✅ FIXED.** `tsc --noEmit` clean; 18/18 ledger cases, 10/10 label cases, 4/4 detector cases,
and a 7-scenario × 4-scheme key simulation, all passing.
**No migration written or applied. `next dev` / `next build` NOT run.**
**Only `lib/payments/ledger.ts` changed (+76/−9).**

> This file replaces the previous fix-pass report. That content is not preserved anywhere.

**Prompt integrity:** no span read as garbled or truncated.

**Your reasoning was right about the bug and right that my `totalMinor` proposal had a hole.
It was wrong about the balance-based key being the fix — I found a second, more likely hole in it, and
it turns out to be *worse* than the scheme it replaces. Detail in §Verdict.**

---

## D1 — `collectIdempotencyKey` and every caller

**Before** ([ledger.ts:141-143](lib/payments/ledger.ts#L141)):

```ts
/** The deterministic idempotency key for the single "Mark paid & done" charge on an order.
 *  See recordCollectionPayment() for why this shape, and why an undo frees it. */
export function collectIdempotencyKey(orderKey: string): string {
  return `collect:${orderKey}`
}
```

**Callers — three, all inside `lib/payments/ledger.ts`; nothing outside the module ever touched it:**

| Site | Use |
|---|---|
| `ledger.ts:281` | `recordCollectionPayment` → the key on every in-person charge |
| `ledger.ts:321` | `reverseCollectionPayment` → the lookup for the row to delete |
| — | `grep -rn "collectIdempotencyKey" app lib components` returns only these two plus the definition |

Because `recordCollectionPayment` is the single charge path, **all three of these flows shared one
constant key per order**: `collected` ([action/route.ts:367](app/api/dashboard/action/route.ts#L367)),
`mark_paid` ([:1475](app/api/dashboard/action/route.ts#L1475)), and the walk-up paid-at-order block
([:1163](app/api/dashboard/action/route.ts#L1163)).

## D2 — the 23505 handling, and whether callers can tell

**The handling** ([ledger.ts:235-239](lib/payments/ledger.ts#L235), before this pass):

```ts
let inserted = true
if (error) {
  if (error.code === '23505') inserted = false          // idempotent replay — the event is already recorded
  else throw new Error(`[ledger] insert failed for ${event.orderKey}: ${error.message}`)
}
const balance = await recalcOrderPayment(supabase, event.orderKey)
return { inserted, balance }
```

**Confirmed: indistinguishable in practice, though the information was technically present.**

`recordCollectionPayment` does return `{ inserted, chargedMinor }`, and a swallowed duplicate returns
`inserted: false, chargedMinor: 0`. So the data existed. But:

1. **It is the same return shape as the legitimate "nothing outstanding" early exit**
   ([ledger.ts:268-272](lib/payments/ledger.ts#L268)), which also returns `inserted: false,
   chargedMinor: 0`. The two cases were **genuinely** indistinguishable at the API boundary.
2. **No caller inspected it.** All three sites do `const res = await recordCollectionPayment(...)` and
   read only `res.chargedMinor` for the audit row. None branch on `inserted`. The `mark_paid` handler
   returns `{ success: true, chargedMinor: 0 }` — a 200, with the audit row recording
   `charged_minor: 0, ledger_failed: false`. **The operator saw a success, and the audit log recorded a
   successful action that moved no money.**

## D3 — `reverseCollectionPayment` looked up by key

**Confirmed** ([ledger.ts:321-329](lib/payments/ledger.ts#L321), before this pass):

```ts
const key = collectIdempotencyKey(opts.orderKey)
const { data: rows, error } = await supabase
  .from('order_payments')
  .select('id, kind, channel, amount_minor, currency, state, external_ref, note, idempotency_key, created_at, created_by')
  .eq('order_key', opts.orderKey)
  .eq('idempotency_key', key)          // ← the key-based lookup
```

This is why the change is mandatory rather than cosmetic: changing the key format without changing this
would make every pre-deploy payment **un-undoable**, and `reverseCollectionPayment` would return
`reversal: 'none'` while silently leaving the money on the order.

## D4 — how many rows carry the OLD format

**What the code assumed:** that **every** reversible in-person charge has `idempotency_key` exactly
`collect:{order_key}`. There was no other format, because `recordCollectionPayment` was the only writer
and it always used that constant.

So the repo's understanding is: **old-format rows = every manual charge ever written**, i.e. every row
with `kind='charge' AND channel='in_person_other'`, from the day `20260729_order_payments_ledger.sql`
was applied until this deploy. Given `show_paid_step` is on only for test-truck, that should be a
handful — but the code never depended on the count, and after this change **it depends on nothing about
the key at all**. To confirm the live number:

```sql
select case when idempotency_key like 'collect:%:%:%' then 'new (paid:balance)'
            when idempotency_key like 'collect:%'     then 'OLD (constant)'
            else 'no key' end as fmt,
       count(*)
  from order_payments where kind = 'charge' group by 1;
```

---

## VERDICT ON THE BALANCE-BASED KEY — tested, and rejected

I simulated the real ledger semantics (balance-zero guard, 23505 → swallowed, undo deletes the row)
across **7 sequences × 4 key schemes**. Money-lost outcomes:

| Scenario | constant (today) | `:{total}` (mine) | `:{balance}` (yours) | `:{paidBefore}:{balance}` |
|---|---|---|---|---|
| A simple pay once | ✅ | ✅ | ✅ | ✅ |
| B replay of one tap (offline drain) | ✅ | ✅ | ✅ | ✅ |
| C pay, edit up, pay balance | ❌ **lost** | ✅ | ✅ | ✅ |
| D pay, two *equal* upward edits | ❌ **lost** | ✅ | ✅ | ✅ |
| E pay, edit up, pay, edit **down**, refund, edit up again *(your case)* | ❌ **lost** | ❌ **lost** | ❌ **lost** | ❌ **lost** |
| F pay, undo, re-pay (key must free) | ✅ | ✅ | ✅ | ✅ |
| G pay, edit up, pay, replay **both** taps | ❌ **lost** | ✅ | ✅ | ✅ |
| **H pay in FULL, then customer DOUBLES the order** | ❌ **lost** | ✅ | ❌ **lost** | ✅ |
| **I three equal top-ups of +£9.50** | ❌ **lost** | ✅ | ❌ **lost** | ✅ |

**The hole in the balance key (H).** Pay a £9.50 order in full → the customer adds another £9.50 of food
→ total £19.00 → **the outstanding balance is £9.50 again** → same key → charge silently vanishes. That
is not contrived; it is "they came back for another round", and it is *more likely at a hatch than your
edit-down-refund-edit-up case*. Scenario I is the same failure repeating. **So the balance key is worse
than the total key I originally proposed, not better.**

**You were right that `:{total}` has a hole** — E, exactly as you described.

### What I adopted: `collect:{order_key}:{paidBeforeMinor}:{balanceMinor}`

A **state-transition** key — *"from this ledger position, settle this amount"*. It passes everything the
other schemes pass, plus H and I, because a repeated *balance* no longer collides when the *paid
position* differs.

### ⚠️ It still fails E, and that is not fixable with any deterministic key

Stated plainly rather than glossed: **if the key is a function of ledger state, then any sequence that
returns the ledger to an earlier state and repeats the same transition will collide.** That is a
property of determinism. E does exactly that — the refund puts `paid` back to 950 and the re-edit puts
the balance back to 550, so the transition `950 → +550` recurs.

The complete answer is a **client-minted per-tap key**. The outbox already mints `op_id` for precisely
this purpose and never transmits it (established in the audit review). I did **not** adopt it here
because it means changing the live offline gate, and you asked for this to land alone so a failure is
attributable. It is the right next step if you want E closed properly.

E also requires refunds, which are **not built** (§37) — so it is currently unreachable.

---

## THE DETECTOR — how a genuine replay is distinguished from a real collision

You asked me to tell you how I distinguish them, or say plainly that I cannot. **I can, and it is
exact:**

| | Genuine replay | Real key collision |
|---|---|---|
| The named row | is *this* charge — its money is already counted | belongs to some **other**, older charge |
| Balance after recalc | **fell** (normally to zero) | **unchanged** |
| Correct behaviour | silent success | **surface** |

Implemented in `recordCollectionPayment` ([ledger.ts:316-333](lib/payments/ledger.ts#L316)):

```ts
const swallowedButNothingSettled = !inserted && balance.balanceMinor === before.balanceMinor
if (swallowedButNothingSettled) throw new Error(`[ledger] charge of … was SWALLOWED as a duplicate but the balance is unchanged …`)
```

**This is the important safety property: it does not depend on the key scheme.** Any residual
collision — E, or something neither of us has thought of — becomes loud instead of silent.

Verified with 4 targeted cases:

```
PASS  genuine replay of a settled charge is SILENT      → surfaced=false
PASS  scenario E collision is SURFACED, not silent      → surfaced=true
PASS  legitimate top-up does NOT surface                → surfaced=false
PASS  LIVE BUG (constant key) would have SURFACED       → surfaced=true
```

The last one is the useful one: **had this detector existed, the bug you are fixing would have
announced itself on the first part-payment instead of hiding.**

⚠️ **No false positive on the concurrent race.** Two in-flight requests both read balance 550; A
inserts, B collides — but B's recalc reads the ledger *after* A's insert, so B sees balance 0 ≠ 550 and
stays silent. That is the case the unique index exists for, and it still works.

⚠️ **How it surfaces:** the throw is caught by the existing fail-open handlers, so the operator action
still completes and the failure comes back as `paymentWarning` + a loud server log + an audit row with
`ledger_failed: true`. Consistent with the `collected` ruling. **Note the `paymentWarning` toast wiring
is still deferred to part 2, so today it surfaces in the log and the audit trail, not on screen.**

---

## `reverseCollectionPayment` — the change and its old-format proof

Now matches on **row shape, never on the key**
([ledger.ts:373-393](lib/payments/ledger.ts#L373)):

```ts
.eq('order_key', opts.orderKey)
.eq('kind', 'charge')
.neq('channel', 'online')
.order('created_at', { ascending: false })     // newest first
```

**Compatibility proof — which rows each lookup matches:**

| Row | OLD (`.eq idempotency_key`) | NEW (kind + channel) |
|---|---|---|
| **OLD-format charge** `collect:X` | ✅ | ✅ |
| **NEW-format charge** `collect:X:0:950` | ❌ **would break** | ✅ |
| **NEW top-up** `collect:X:950:550` | ❌ **would break** | ✅ |
| refund row | ❌ | ❌ correctly excluded |
| online charge | ❌ | ❌ correctly excluded |
| `in_person_stripe` charge | ❌ | ✅ matched — then the existing `noRealMoneyMoved` test sees its `external_ref` and **compensates rather than deletes**, which is correct |

**Confirmed against both formats: old-format rows written before this deploy still reverse correctly**,
which is the live-data requirement. `order by created_at desc` means undo reverses the payment just
taken — matching what both the 7-second toast and the paid-chip affordance mean by "undo".

---

## Verified by READING vs by RUNNING

**By RUNNING:**
- `npx tsc --noEmit` → **exit 0** after every edit.
- **Key simulation**, 7 scenarios × 4 schemes, modelling the real semantics (balance-zero guard,
  23505 → swallowed, undo deletes). Produced the table above and found hole **H** in your proposal.
- **Detector**, 4 cases (above).
- **Regression: 18/18** ledger-derivation cases (16 existing + 2 new key-distinctness assertions) and
  **10/10** button-label cases.
  ⚠️ One existing case failed first and was a **stale assertion**, not a regression: case 16 still called
  the one-argument signature. Updated to the new contract rather than silenced.
- The compatibility table above was computed, not eyeballed.

**By READING only:** D1-D4 in full; that no caller inspects `inserted`; that `idempotency_key` appears
nowhere outside `lib/payments/ledger.ts`.

---

## What I could NOT verify

- **Nothing has run against Postgres.** The 23505 behaviour, the unique partial index actually firing,
  and the `.neq('channel','online')` PostgREST filter are all **reasoned from the contract, not
  observed**. The simulation models what I believe the DB does; it is not the DB.
- **No live row has been reversed under either key format.** The compatibility proof is a truth table
  over the lookup predicates, not an executed query.
- **The live old-format row count is unknown** — the query is in D4 for you to run.
- **The detector has never fired in production.** Its no-false-positive-on-race claim is reasoned from
  read-after-write ordering; I did not run concurrent requests.
- **Scenario E remains open by design** and is untestable today because refunds do not exist.
- ⚠️ **`chargedMinor` semantics changed subtly:** a swallowed duplicate now throws rather than returning
  `chargedMinor: 0`, so the fail-open handlers convert it into a `paymentWarning`. I have not observed
  that path end to end, and **the warning is not yet rendered on screen** (part 2).
- **No `next dev` / `next build`** per constraint; tsc-clean does not prove the bundle.
- **Nothing observed on a device**, and no real order placed on `test-truck`.
