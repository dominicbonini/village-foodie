# `refund.failed`: yes, and the gap was worse than the question assumed

**Date:** 13 August 2026
**READ-ONLY DIAGNOSIS, THEN A BUILD — the gap was real.** No `next dev`, no `next build`. Nothing committed. Nothing deployed. **No migration.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 THE ANSWER: YES, AND THE FAILURE MODE IS NOT THE ONE THE QUESTION DESCRIBES

Your question assumed the risk was *a pending refund fails and the audit row stays open forever.* **Stripe's own test-card documentation says the common shape is the opposite, and much worse:**

> **`4000000000005126` / `pm_card_refundFail`** — *"The charge succeeds. If you initiate a refund, **its status begins as `succeeded`. Some time later, its status transitions to `failed`** and sends a `refund.failed` event."*

🔴 **SO THE LEDGER ROW IS ALREADY WRITTEN WHEN THE FAILURE ARRIVES.** The refund lands `succeeded`, we book it, `getOrderBalance` computes `refunded`, `payment_status` becomes `refunded` — and then the bank returns the money to the truck and the customer gets nothing. **The order says REFUNDED forever for a refund that did not happen.** That is worse than a stale audit row: it tells an operator a customer has been made whole when they have not.

**Reproduced end to end against real Stripe, and the real event arrived in 5 seconds.**

---

## 1. Which event fires — MEASURED, not inferred

### From the installed SDK (stripe 22.4.0) — **QUOTED**

`node_modules/stripe/cjs/resources/Events.d.ts` carries three distinct refund types with Stripe's own descriptions:

```ts
/** Occurs whenever a refund is created. */   type: 'refund.created';
/** Occurs whenever a refund has failed. */   type: 'refund.failed';
/** Occurs whenever a refund is updated. */   type: 'refund.updated';
```

and `refund.failed` is a separate member of the `EnabledEvent` union used for webhook subscriptions.

### From Stripe's documentation — **QUOTED**

> *"In the rare instance that a refund fails, we notify you using the **`refund.failed`** event."*

and from the refund-events table:

| Event | Stripe's description |
|---|---|
| `refund.updated` | *"Sent when the refund is updated. **Updates include adding metadata and providing details like the ARN as a reference number to trace refunds.**"* |
| `refund.failed` | *"Sent when a **refund has failed**."* |
| `charge.refund.updated` | *"**(Deprecated)** … Listen to `refund.updated` for updates on all refunds instead."* |

**The docs establish that `refund.failed` fires. They do not state whether `refund.updated` also fires** — so on documentation alone that half would be *not established*.

### 🔴 SO I MEASURED IT. Every event Stripe emitted for one real failing refund:

```
09:03:02  charge.succeeded          status=succeeded
09:03:04  charge.captured           status=succeeded
09:03:05  refund.created            status=succeeded
09:03:05  charge.refunded           status=succeeded
09:03:06  refund.updated            status=succeeded     <- fires on the SUCCEEDED transition
09:03:06  charge.refund.updated     status=succeeded
09:03:12  refund.failed             status=failed        <- 🔴 THE FAILURE
09:03:12  charge.refund.updated     status=failed        (deprecated type)
```

# 🔴 `refund.updated` DOES NOT FIRE ON THE TRANSITION TO `failed`.

It fired for `succeeded` and **not** for `failed`. The only non-deprecated event announcing the failure is **`refund.failed`**. **Without subscribing it, we would never learn** — and the deprecated `charge.refund.updated` is not a substitute the docs would have us rely on.

**QUOTED** (live Stripe event list, connected account `acct_1U30w22fB4PPCw2D`).

---

## 2. What the handler did with a non-`succeeded`, non-`pending` status

**QUOTED**, the branch as it stood:

```ts
      if (status !== 'succeeded') {
        console.warn(
          `[webhook/stripe] refund=${refundId} on order_key=${chargeRow.order_key} is ${status ?? 'unknown'}, ` +
          `NOT succeeded — no ledger row yet. The order still reads paid, which is true: the money has ` +
          `not gone back. Waiting for refund.updated.`,
        )
        await logAction(supabase, {
          action: 'refund_pending', …
          afterState: {
            stripe_status: status, recorded: false,
            meaning: 'Stripe has not settled this refund yet, so no money has gone back and no ledger row exists',
          },
        })
        pending++
        continue
      }
```

**A single catch-all.** So a failed refund arriving on `refund.updated` was:

| | |
|---|---|
| **Written to the ledger?** | ❌ No |
| **Ignored?** | ❌ No |
| **Audited?** | ✅ **Yes — as `refund_pending`**, with `stripe_status: 'failed'` recorded accurately in `after_state` |
| 🔴 **And mislabelled** | The action name says *pending*, the `meaning` says *"Stripe has not settled this refund **yet**"*, the log says *"**Waiting for refund.updated**"*, and the counter says `pending=1` |

🔴 **ALL FOUR ASSERT A FUTURE THAT WILL NEVER ARRIVE.** And `refund.failed` was not in the handled list at all, so **the real event fell to the default arm — recorded, acknowledged, never acted on.**

---

## 3. What was left behind — WRONG versus merely ABSENT

### The case your question described (fail while `pending`)

| | State | Verdict |
|---|---|---|
| Audit row | `refund_pending`, `stripe_status: 'failed'` | 🔴 **WRONG.** Its name, its `meaning` and the log line all promise a settlement that cannot come. It never closes |
| Ledger | no row | ✅ **CORRECT.** No money moved |
| `payment_status` | `paid` | ✅ **CORRECT** |
| Operator surfaces | order reads PAID | ✅ correct about money, ⚠️ **ABSENT**: no signal a refund was attempted and failed |
| `handler_result` | `pending=1` | 🔴 **WRONG.** A terminal failure counted as in-flight |

### 🔴 The case Stripe's test card documents, and the one I reproduced (`succeeded` → `failed`)

| | State | Verdict |
|---|---|---|
| Ledger | 🔴 **a `kind: 'refund'` row for 650p** | 🔴 **WRONG. It asserts money went back that came back** |
| `payment_status` | 🔴 **`refunded`** | 🔴 **WRONG** |
| Order card | `REFUNDED` chip, `Collected` button | 🔴 **WRONG** |
| KDS | `✓ paid` | ⚠️ coincidentally harmless |
| Ticket | `PAYMENT REFUNDED` | 🔴 **WRONG** |
| Audit | 🔴 **nothing at all** — `refund.failed` was unhandled | 🔴 **ABSENT, and the worst absence here** |

🔴 **THE GAP IS REAL, AND ITS DANGEROUS HALF IS A FALSE LEDGER STATEMENT, NOT AN OPEN AUDIT ROW.**

---

## 4. What I built

### A terminal-failure branch, above the pending check

`app/api/webhooks/stripe/route.ts`:

```ts
      if (status === 'failed' || status === 'canceled') {
        const failureReason = typeof r.failure_reason === 'string' ? r.failure_reason : null
        let removed: Awaited<ReturnType<typeof removeFailedOnlineRefund>>
        try {
          removed = await removeFailedOnlineRefund(supabase, {
            orderKey: chargeRow.order_key as string,
            truckId: chargeRow.truck_id as string,
            refundId, failureReason, eventType,
          })
        } catch (revErr) {
          // 🔴 500 SO STRIPE RETRIES. Leaving a refund row standing for a refund that failed is the
          // exact false statement this branch exists to remove …
          return NextResponse.json({ error: 'failed-refund reversal failed' }, { status: 500 })
        }
        …
        failed++
        continue
      }
```

⚠️ **`canceled` is handled here too**, because Stripe says so: *"Canceled refunds transition to a `canceled` status. **As cancellations are a type of refund failure**, the attributes `failure_reason` and `failure_balance_transaction` are included."*

⚠️ **The pending branch's code is unchanged.** It now only sees genuinely in-flight statuses (`pending`, `requires_action`), which is what it always claimed to be about. **Declared: what reaches it changed, its body did not.**

### The reversal — delete, audit-first, with a precedent

`lib/payments/online.ts`, `removeFailedOnlineRefund`:

> 🔴 **DELETE, NEVER COMPENSATE, AND THE PRECEDENT IS `reverseCollectionPayment`.** That function deletes rather than compensates when the row *"represents no money"*, and this is the same case read the other way: the refund row asserts money went back, and it came back. **A compensating `charge` row would inflate takings by an amount nobody was ever paid.**

- Reads the **full** row (the same column list `reverseCollectionPayment` uses, for the same reason — the audit must reconstruct what was destroyed).
- 🔴 **`logActionOrThrow`, not `logAction`** — a failed audit **aborts the delete**, the rule `undo_collected` follows.
- Deletes, then `recalcOrderPayment` so `payment_status` returns to `paid`.
- Returns `none` when nothing was recorded — the pending case, where no row ever existed.

### Resolving the open `refund_pending` row

The audit log is **append-only** — *"Nothing in this codebase may ever UPDATE or DELETE from `action_audit_log`"* — so "resolve" means **appending the row that closes it**:

```ts
          beforeState: { refund_id: refundId, payment_intent_id: piId, event_type: eventType, resolves: 'refund_pending' },
          afterState: {
            stripe_status: status, failure_reason: failureReason,
            ledger_row: removed.outcome === 'removed' ? 'removed (had been recorded as succeeded)' : 'none was ever written',
            meaning: 'THE CUSTOMER HAS NOT BEEN REFUNDED. Stripe returned the money to the truck. Only '
                   + 'the truck can arrange another way to pay them back.',
          },
```

`resolves: 'refund_pending'` names the action it supersedes, and both rows carry the same `order_key` and `refund_id`, so one query pairs them.

### 🔴 Where you or an operator would see it

| Surface | What |
|---|---|
| **The durable record** | `select * from action_audit_log where action in ('refund_failed','refund_reversed_failed') order by created_at desc;` |
| **The log line** | `🔴 REFUND FAILED refund=re_… order_key=… amount_minor=650 reason=expired_or_canceled_card. The ledger row has been REMOVED and the order reads paid again. THE CUSTOMER EXPECTED THIS MONEY BACK AND DID NOT GET IT — only the truck can retry it.` |
| **The event record** | `stripe_webhook_events.handler_result` = `refund:written=0,pending=0,failed=1,skipped=0` |
| **The board, indirectly** | the order returns to **PAID**, so it stops claiming a refund that did not happen |

⚠️ **THERE IS NO IN-PRODUCT ALERT, AND I AM STATING THAT PLAINLY RATHER THAN IMPLYING ONE.** A failed refund is visible in the audit log and the runtime log; **nothing on the dashboard tells an operator to go and pay that customer another way.** Building one means a new operator surface, which is outside this brief. **It is the residual gap.**

---

## 5. No ledger row for a failed refund

✅ **Confirmed, and stronger than asked.** Nothing in the new branch calls `recordPaymentEvent` or any writer — the only ledger operation is the **removal** of a row that should not have been there. Verified: after the real failure the ledger holds **one row, the original charge**, and the order reads `paid`.

---

## 6. Does `refund.failed` need subscribing separately?

# 🔴 YES. ADD IT.

**Established two ways:**
1. **QUOTED** — it is a distinct member of the SDK's `EnabledEvent` union and a separate row in Stripe's refund-events table.
2. 🔴 **MEASURED** — `refund.updated` did **not** fire on the transition to `failed`. §1.

**Your endpoint's subscription list should be, on the connected-account scope:**

```
payment_intent.amount_capturable_updated
payment_intent.succeeded
refund.created
refund.updated
charge.refunded
refund.failed          <- 🔴 ADD THIS
```

⚠️ `charge.refund.updated` also carries the failure but is **deprecated** — *"Listen to `refund.updated` for updates on all refunds instead"* — and `refund.updated` demonstrably does not cover it. **Do not rely on the deprecated one.**

---

# VERIFICATION — A REAL FAILED REFUND, AGAINST REAL STRIPE

✅ **I could produce one**, using Stripe's documented refund-failure test card `pm_card_refundFail`. **The real `refund.failed` event arrived in 5 seconds** and was replayed, HMAC-signed, into the real route handler.

```
order #58 captured with pm_card_refundFail
refunds.create -> re_3U3uXS2fB4PPCw2D154B8iI6 amount=650 status=succeeded

[webhook/stripe] refund RECORDED order=ca159d3d-… refund=re_3U3uXS…154B8iI6 amount_minor=650 -> status=refunded
  refund.created (succeeded) -> 200  handler_result=refund:written=1,pending=0,failed=0,skipped=0
  ledger now  : [ charge 650 , 🔴 refund 650 stripe_re:re_3U3uXS…154B8iI6 ]
  order now   : {"id":"58","payment_status":"refunded","amount_paid":0}
  balance now : {"paidMinor":0,"balanceMinor":650,"status":"refunded"}

  waiting for Stripe to transition the refund to failed...
    t+0s refund status = succeeded
  refund.failed arrived after ~5s (refund status now failed)
  🔴 REAL refund.failed event: evt_3U3uXS2fB4PPCw2D1UHE3fAH  status=failed failure_reason=expired_or_canceled_card

[webhook/stripe] 🔴 REFUND FAILED refund=re_3U3uXS…154B8iI6 order_key=ca159d3d-… amount_minor=650
  reason=expired_or_canceled_card. The ledger row has been REMOVED and the order reads paid again.
  THE CUSTOMER EXPECTED THIS MONEY BACK AND DID NOT GET IT — only the truck can retry it.
  refund.failed -> 200  handler_result=refund:written=0,pending=0,failed=1,skipped=0

  🔴 ledger AFTER  : [ charge 650 ]                          <- the refund row is gone
  🔴 order  AFTER  : {"id":"58","payment_status":"paid","amount_paid":6.5}
  🔴 balance AFTER : {"paidMinor":650,"balanceMinor":0,"status":"paid"}
```

**And the audit trail, both rows:**

```json
[{ "action": "refund_reversed_failed", "amount_minor": 650,
   "after_state": { "deleted": true, "failure_reason": "expired_or_canceled_card",
     "meaning": "Stripe reported this refund FAILED after we had recorded it. The money came back to the
                 truck, so the ledger row asserting a refund is removed and the order reads paid again." }},
 { "action": "refund_failed", "amount_minor": 650,
   "after_state": { "stripe_status": "failed", "failure_reason": "expired_or_canceled_card",
     "ledger_row": "removed (had been recorded as succeeded)",
     "meaning": "THE CUSTOMER HAS NOT BEEN REFUNDED. Stripe returned the money to the truck. Only the
                 truck can arrange another way to pay them back." }}]
```

🔴 **`payment_status` went `paid` → `refunded` → `paid`, driven entirely by real Stripe events.** The `refunded` state — which before this build was permanent — lasted 6 seconds.

### 🔴 WRITES DECLARED

| Write | Cleanup |
|---|---|
| 1 `order_drafts`, 1 `orders` (#58), 2 `order_payments` (one later deleted by the code under test) | ✅ deleted — `residual drafts/orders/payments/events: 0/0/0/0` |
| 2 `stripe_webhook_events` rows | ✅ deleted |
| 🔴 **1 real sandbox capture and 1 real sandbox refund** on the connected account | ⚠️ **NOT reversible.** Sandbox money |
| Display number #58 | ⚠️ not reversible |
| `action_audit_log` rows (`refund_reversed_failed`, `refund_failed`) | ⚠️ **NOT deleted** — append-only |
| **Emails** | ✅ **0 sent** (Brevo intercepted) |

### What I did NOT verify

- ⚠️ **The `canceled` status.** Handled by the same branch on Stripe's stated grounds that a cancellation *is* a refund failure, but **I did not produce one** — card-refund cancellation is Dashboard-only.
- ⚠️ **A refund that fails while still `pending`.** The connected account's balance is healthy, so no sandbox refund ever went pending. The branch treats it identically and the `removeFailedOnlineRefund` `none` arm covers it, but **that arm was exercised only by reasoning, not by a real event.**

### Tooling
```
$ npx tsc --noEmit -> clean        $ npx eslint <both files> -> clean, no output
```

---

# 🔴 NON-ASCII CENSUS

| File | Before | After | Distinct set |
|---|---|---|---|
| `app/api/webhooks/stripe/route.ts` | 1108 / **8** | 1171 / **8** | `§ — … → ─ ⚠ 🔴 ️` **identical** |
| `lib/payments/online.ts` | 204 / **7** | 278 / **7** | `§ — ─ ⚠ ✅ 🔴 ️` **identical** |

✅ **NO FILE GAINED A CHARACTER CLASS.** No other file was modified; no migration was needed.

---

# What you have to do

**Subscribe `refund.failed`** on the connected-account-scoped destination, alongside the three you have already added. **Nothing else** — no migration, no schema change.

# Standing

- ⚠️ **No in-product alert for a failed refund.** Audit log and runtime log only. **A customer is owed money and only the truck can pay it** — that wants an operator surface, and it belongs with the refund UI.
- ⚠️ **`refund_pending` rows written before this build are still open** and will never be resolved by anything, because their `refund.failed` events were never handled. One query finds them: `action_audit_log where action = 'refund_pending'`. **There are none in the live database** — the only ones were written by verification harnesses and their orders are deleted.
- ⚠️ **`charge.refund.updated` fires for both transitions** and is deprecated. Not handled, and should not be.
