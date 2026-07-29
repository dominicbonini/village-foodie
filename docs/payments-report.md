# Payments phase 1a — BUILD REPORT (ledger, rollup, channel) · fail-open revision

**Date:** 29 July 2026 · **Repo:** `/Users/dominicbonini/dev/village-foodie` · **Branch:** `main`
**Status: ✅ BUILT. `tsc --noEmit` clean; 16/16 behavioural cases pass on the derivation.**
**No migration applied. `next dev` / `next build` NOT run.** No Stripe. No UI.

> This file replaces the previous build report. That content is not preserved anywhere.

**Prompt integrity:** no span read as garbled or truncated.

---

## 0. THE CHANGE IN THIS REVISION — "Mark paid & done" now fails OPEN

One branch changed. The ledger write still happens **first**; it no longer blocks the collection.

**Before (fail-closed):** a ledger failure returned 500 and the order was *not* marked collected.
**Now (fail-open):** the order is marked collected regardless; the failure is surfaced three ways.

[app/api/dashboard/action/route.ts:328-352](app/api/dashboard/action/route.ts#L328):

```ts
let paymentWarning: string | null = null
try {
  await recordCollectionPayment(supabase, { orderKey, truckId: truck.id })
} catch (err) {
  console.error(`[collected] LEDGER WRITE FAILED for order_key=${orderKey} truck_id=${truck.id} — the order WAS still marked collected (fail-open). Re-run recalcOrderPayment for this order_key to repair; the reconciliation query in lib/payments/ledger.ts will list it until then:`, err)
  paymentWarning = 'Order completed, but the payment record could not be saved — the takings figure for this order may be wrong until it is repaired.'
}
```

and the response ([:367](app/api/dashboard/action/route.ts#L367)):

```ts
return NextResponse.json({ success: true, status: 'collected', ...(paymentWarning ? { paymentWarning } : {}) })
```

**This follows the `slotWarning` shape exactly**, not a new one — same three moves as the edit path at
[:546-568](app/api/dashboard/action/route.ts#L546): a `let …Warning: string | null = null`, a
`console.error` on failure that states the primary action still succeeded, and
`...(warning ? { warning } : {})` spread onto the success payload. Nothing is rolled back, exactly as
`lib/slot-bookings.ts` returning its write errors never rolls back an edit.

**The expiry condition is recorded at the branch**, as asked — fail-open is correct only while the
ledger is *passive*; once it drives the 0.99% fee or Stripe settlement (§37) a missing row is a
**missing fee**, money silently not charged, and the branch must be reconsidered rather than inherited.

### Two things I did NOT change, flagged for your call

**(a) The status-update failure remains fail-CLOSED** ([:354-361](app/api/dashboard/action/route.ts#L354)).
That write is *fulfilment*, not accounting: if it fails the order genuinely is not collected, so there
is nothing to fail open about and the operator must see the action did not take. I also corrected its
log line, which had become inaccurate — it said "after the ledger row was booked", which is no longer
guaranteed. That is the only other line touched.

**(b) `undo_collected` still fails closed.** You scoped this change to "Mark paid & done" and said
nothing else changes, so I left it — but it is now **asymmetric** and you should know deliberately: a
collect whose ledger write fails completes anyway, while an undo whose ledger reversal fails is
refused with a 500. The argument for leaving it is that an undo is a correction, not a service-critical
action — nobody is waiting at the hatch for it, and the operator can simply retry. The argument for
changing it is that the same "surfacing ≠ blocking" logic applies. **My recommendation: leave it as-is
for this deploy** — refusing an undo is recoverable and visible, whereas the asymmetry only matters if
undo failures turn out to be common, which we have no evidence for yet. Say if you want it symmetric.

### ⚠️ The warning is returned but nothing renders it yet
`paymentWarning` rides back on the response, but the dashboard's `collected` handler does not read it —
unlike the edit path, where [page.tsx:1362](app/dashboard/[token]/page.tsx#L1362) does
`showToast(data?.slotWarning ?? …, data?.slotWarning ? 'error' : 'success')`. Wiring it would mean
touching the `collected` toast, which carries the live 7-second undo affordance, and UI is explicitly
out of scope this pass. **So today the operator sees nothing on failure** — detection is the loud
server log plus the reconciliation query. It is a one-line addition in the next (UI) pass, and the
payload is already shaped for it.

**Net effect, as intended:** a failure now leaves an order collected-with-no-payment-record — a state
the reconciliation query detects and a re-run of `recalcOrderPayment` repairs — rather than an operator
stuck at the hatch with cash in hand.

**Untouched by this revision, as instructed:** the idempotency scheme, the rollup, the undo rule, and
both migrations. Verified by md5 — `lib/payments/ledger.ts` and both `.sql` files are byte-identical to
the previous pass.

---

## 1. The idempotency-key scheme, and what `orderGate` actually supplies

**The check you asked for — the answer is "yes, but it never reaches the server."**

`lib/native/outbox.ts:124` mints `op_id: newUuid()` per queued op. It is genuinely stable and survives
replay: it is the Preferences storage key (`hg_outbox_op_<op_id>`), persisted before the network call,
and removed only on a definitive ACK ([orderGate.ts:210](lib/native/orderGate.ts#L210)).

**But it is never transmitted.** The drain posts `syncing.body`
([orderGate.ts:198](lib/native/orderGate.ts#L198)); `op_id` lives on the op *envelope*, outside `body`.

**Chosen scheme: the deterministic key `collect:{order_key}`**, minted server-side by
`collectIdempotencyKey()`. Why, rather than plumbing `op_id` through:

- This action charges **the whole outstanding balance exactly once per order**, so `order_key` + the
  action already identifies the event uniquely. `op_id` would add entropy, not identity.
- An offline replay re-posts a byte-identical body → same derived key → collision → the desired no-op.
- It needs no client change, so the live native offline gate is untouched by this pass.

**Confirmed: undo → re-collect works.** The undo DELETES the collect row, freeing the unique key, so
collect → undo → re-collect inserts cleanly the second time. This holds *only because* undo deletes;
had it written a compensating refund the key would stay occupied and the re-collect would be silently
swallowed as a replay. The two rulings are load-bearing on each other, and that is recorded in the code.

Not a composite on `(order_key, kind, channel)` — £10 cash now + £5 on collection stay possible. A
unique violation is treated as a *successful* no-op that still runs the recalc, so a replay landing
after a failed first recalc repairs the cache.

---

## 2. The rollup derivation as implemented

`getOrderBalance(order, ledgerRows)` in [lib/payments/ledger.ts](lib/payments/ledger.ts) — pure, no
I/O, exported for the next pass's UI.

```
succeeded    = rows where state = 'succeeded'        ← 'pending' and 'failed' contribute nothing
chargeMinor  = Σ succeeded where kind = 'charge'
refundMinor  = Σ succeeded where kind = 'refund'
paidMinor    = chargeMinor − refundMinor
totalMinor   = order.total_minor ?? toMinor(order.total)
balanceMinor = totalMinor − paidMinor
```

| # | Condition | Result |
|---|---|---|
| 1 | `paidMinor === 0 && hasRefundRow` | `refunded` |
| 2 | `paidMinor === 0` | `unpaid` |
| 3 | `paidMinor < 0` | `refund_due` (anomaly — mine, see below) |
| 4 | `balanceMinor < 0` | `refund_due` |
| 5 | `balanceMinor === 0` | `paid` |
| 6 | else | `part_paid` |

Branch 1 is tested **first** and keys on refund-row **presence**, never the sum: "charged then fully
refunded to zero" and "never paid" are the same arithmetic state (`paidMinor === 0`). Swapping 1 and 2
silently reports every fully-refunded order as `unpaid`. Asserted by harness case 6.

**Branch 3 is beyond your spec — flagging again.** Refunds exceeding charges leaves `paidMinor`
negative, which your five rules do not cover; it would fall through to `part_paid` where a negative
paid figure reads as a normal outstanding balance. Unreachable while `amount_minor > 0` (CHECK) and
undo deletes rather than over-refunds, but bucketed explicitly rather than landing somewhere misleading.

`orderTotalMinor()` falls back to `toMinor(order.total)` when `total_minor` is NULL — necessary because
the backfill was dropped and pre-`20260728` rows have none. Safe because every money column is
`numeric(8,2)` (harness case 15: `12.20 + 0.10 → 1230`, not 1229).

`recalcOrderPayment()` is **idempotent by construction** — reads the whole ledger, writes an absolute
value, never a delta (harness case 14). Only writer of `payment_status` / `amount_paid`. On `23514` it
says explicitly that the deploy-coupled migration has not been applied.

---

## 3. The reconciliation query

In the header comment of [lib/payments/ledger.ts](lib/payments/ledger.ts), not a route. Lists any order
whose cached state disagrees with its own ledger rows — **expect zero**. This is now also the primary
detector for the fail-open path above.

```sql
select o.order_key, o.id, o.truck_id, o.total_minor, o.payment_status, o.amount_paid,
       coalesce(l.paid_minor, 0)                   as ledger_paid_minor,
       round(coalesce(l.paid_minor, 0) / 100.0, 2) as ledger_paid_pounds,
       o.total_minor - coalesce(l.paid_minor, 0)   as balance_minor
  from orders o
  left join (
    select order_key,
           sum(case when kind = 'charge' then amount_minor else -amount_minor end) as paid_minor,
           count(*) filter (where kind = 'refund')                                  as refund_rows
      from order_payments
     where state = 'succeeded'
     group by order_key
  ) l on l.order_key = o.order_key
 where round(coalesce(l.paid_minor, 0) / 100.0, 2) is distinct from coalesce(o.amount_paid, 0)
    or o.payment_status is distinct from case
         when coalesce(l.paid_minor, 0) = 0 and coalesce(l.refund_rows, 0) > 0 then 'refunded'
         when coalesce(l.paid_minor, 0) = 0                                    then 'unpaid'
         when o.total_minor - coalesce(l.paid_minor, 0) < 0                     then 'refund_due'
         when o.total_minor - coalesce(l.paid_minor, 0) = 0                     then 'paid'
         else 'part_paid' end
 order by o.created_at desc;
```

⚠️ Until the (deferred) backfill runs, this reports the **128 legacy collected orders** as drift: they
carry `paid_at` but no ledger rows. Expected, not a fault — add `and o.paid_at is null` to see only
post-deploy drift, which is also how you isolate genuine fail-open casualties.

---

## 4. Every file and line changed

| File | Change |
|---|---|
| **`lib/payments/ledger.ts`** *(new, 300 lines)* | `getOrderBalance`, `orderTotalMinor`, `recalcOrderPayment`, `recordPaymentEvent`, `recordCollectionPayment`, `reverseCollectionPayment`, `collectIdempotencyKey`, the reconciliation query, and the C3 rule in the header. **Unchanged this revision** |
| [lib/order-repricing.ts:428-434](lib/order-repricing.ts#L428) | **+8/−0** — `fromMinor` added beside the existing `toMinor`. No second `toMinor` (C5) |
| [lib/supabase.ts:49-54](lib/supabase.ts#L49) | **+5/−1** — union widened to include `'part_paid'` and `'refund_due'`, plus derived-cache / deploy-coupling comments |
| [app/api/dashboard/action/route.ts:20](app/api/dashboard/action/route.ts#L20) | import of `recordCollectionPayment`, `reverseCollectionPayment` |
| [app/api/dashboard/action/route.ts:328-352](app/api/dashboard/action/route.ts#L328) | **`collected` — FAIL-OPEN ledger write** + `paymentWarning`, decision and expiry condition in comment ⟵ *this revision* |
| [app/api/dashboard/action/route.ts:354-361](app/api/dashboard/action/route.ts#L354) | status-update error check; stays fail-closed, log line corrected ⟵ *this revision* |
| [app/api/dashboard/action/route.ts:367](app/api/dashboard/action/route.ts#L367) | `paymentWarning` spread onto the success payload ⟵ *this revision* |
| [app/api/dashboard/action/route.ts:377-395](app/api/dashboard/action/route.ts#L377) | `undo_collected` — payment reversed first; update now also clears **`paid_at` and `collected_at`** (C1); error checked |
| [lib/seed-demo-orders.ts:15, :319](lib/seed-demo-orders.ts#L319) | **+2/−1** — `Math.round(total * 100)` → `toMinor(total)`, plus the import |
| **`supabase/migrations/20260729_order_payments_ledger.sql`** *(new)* | see §5. **Unchanged this revision** |
| **`supabase/migrations/20260729_orders_payment_status_widen_check.sql`** *(new)* | see §5. **Unchanged this revision** |

Diff totals: `action/route.ts` **+62/−3**, `order-repricing.ts` +8/−0, `supabase.ts` +5/−1,
`seed-demo-orders.ts` +2/−1. **No other file touched.** No UI, no toggle, no balance display, no
backfill, no currency/country snapshot, nothing Stripe.

### `undo_collected` — the rule as implemented (unchanged)
DELETE when `external_ref is null` **and** `state = 'succeeded'` **and** `channel != 'online'`;
otherwise a compensating `refund`. Reasoning in a comment at the branch: the 7-second undo toast means
most undos are mis-taps, and a refund row for a mis-tap is a money event that never happened, which
would corrupt the 0.99%/allowance figures §37 depends on. The compensating refund deliberately carries
**no** idempotency key — a second undo of a genuinely processed payment is a distinct money event.

---

## 5. Migrations — classification and run order (unchanged)

Both in `supabase/migrations/`, idempotent, house-pattern headers, each with a `VERIFY AFTER APPLYING`
block reading resulting **state** (`information_schema`, `pg_constraint`, `pg_indexes`, `pg_policies`)
rather than the statement's return. **Neither has been applied.**

| Order | File | Classification |
|---|---|---|
| **1st** | `20260729_order_payments_ledger.sql` | ✅ **ADDITIVE** — new table nothing deployed reads. Safe any time |
| **2nd** | `20260729_orders_payment_status_widen_check.sql` | 🔴 **DEPLOY-COUPLED** |
| **3rd** | *deploy the app* | — |

**Run both BEFORE the deploy.** The table is additive but still must precede the deploy — the handlers
write to it on every collection and PostgREST returns PGRST205 for a table it cannot see. The CHECK
widening must precede it because a rejected CHECK is not a warning: Postgres refuses the write (23514).
Applying either early is a no-op for the running app.

⚠️ **Fail-open changes the blast radius of getting this order wrong, in both directions.** Deploying
before the migrations no longer breaks order completion — collections will succeed and every one will
log a ledger failure and silently skip its payment record. Less disruptive, more insidious. Run the
migrations first.

**RLS follows the house pattern (C2):** `enable row level security` + the
`-- service-role only, no anon policy` comment and **no `create policy`** — matching
`device_notification_prefs`, `booking_locks`, `whatsapp_logs`, `excluded_terms`. The verification block
asserts `relrowsecurity = t` **and** `policy_count = 0`.

The CHECK migration drops the old constraint via a `DO` loop over `pg_constraint` matching any check
mentioning `payment_status`, not `drop constraint if exists <name>` — the original name was assigned by
Postgres and is asserted nowhere in this repo, so guessing it would produce a migration that reports
success and changes nothing (the §35 class). Its verification block includes a **positive proof** inside
`begin … rollback`: it actually attempts `update orders set payment_status = 'part_paid'` and rolls
back. Reading the definition proves the text changed; executing a write proves it is accepted.

---

## 6. What I verified by reading vs by running

**By RUNNING:**
- `npx tsc --noEmit` → **exit 0, clean** (re-run after this revision).
- The **16-case behavioural harness** re-run after this revision → **16 passed, 0 failed.** Covers
  unpaid / exact-paid / part-paid / two-part-charges-settle / overpaid→`refund_due` /
  **charged-then-fully-refunded→`refunded` not `unpaid`** (the branch-ordering trap) / part-refund /
  `pending` ignored / `failed` charge ignored / `failed` refund ignored / refunds-exceed-charges anomaly
  / null `total_minor` fallback / zero-total order / derivation idempotence / `12.20 + 0.10 → 1230` /
  key shape.
  ⚠️ **Harness caveat:** no TS runner is installed, so it runs against a **copy** of `ledger.ts` with the
  single import specifier rewritten to a local shim carrying byte-identical `num`/`toMinor`/`fromMinor`
  bodies. `diff` proves the copy is otherwise identical to the shipped file. The *logic* under test is
  the shipped source; the *module wiring* is not.
- `md5` on `ledger.ts` and both migrations, confirming this revision touched none of them.
- A grep asserting the ledger branch now contains **zero** `return NextResponse` statements — i.e. no
  early return survives on that path, which is what fail-open means mechanically.

**By READING only** (grep/sed over the working tree): the `op_id`-not-transmitted finding and the whole
offline replay path; the `slotWarning` shape at `:546-568` and its client consumer at `page.tsx:1362`;
the RLS house pattern across four migrations; all diagnosis carried over from the earlier pass.

---

## 7. What I could NOT verify

- **The fail-open path has never been exercised.** I have not forced a ledger failure and observed a
  collection still completing. It is verified by reading the control flow and by the no-early-return
  grep, **not by running it**.
- **No migration was applied** — the table has never been created, the CHECK never widened. Both
  `VERIFY AFTER APPLYING` blocks are written but unrun.
- **No runtime execution of any route.** `recalcOrderPayment`, `recordCollectionPayment` and
  `reverseCollectionPayment` have never run against Postgres; only the pure parts are tested. The
  Supabase error-code assumptions (`23505`, `23514`) come from the PostgREST/Postgres contract, **not
  observed**.
- **The unique-index-as-no-op path is untested end to end** — that a replayed collect returns `23505`
  rather than some other error is unverified against the live stack.
- **`gen_random_uuid()` availability** assumed from five existing migrations; not confirmed here.
- **The live constraint's actual name** is unverified — hence the `DO` loop.
- **Whether `orders_updated_at` fires on an update touching only `payment_status`/`amount_paid`** —
  still unverified and still load-bearing: if it does not, the rollup's write-back will not bump
  `updated_at` and `mergeOrders` will not invalidate a cached dashboard. Worth one query before the next
  pass builds the balance display on it.
- **No `next dev` / `next build`** — per constraint. tsc-clean does not prove the routes bundle.
- **Nothing observed on a device**, and no real order placed on `test-truck`.
