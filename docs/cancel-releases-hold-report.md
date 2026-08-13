# Cancelling an order releases the hold

BUILD. 13 August 2026.

**No `next dev`, no `next build`, no commit, no deploy. No migration is needed and none was written** — no column, no table, no CHECK, and the audit rows use `action_audit_log`'s free-text `action` column.

**One file created, five changed:**

```
lib/payments/release-hold.ts          NEW — the guards and the two call sites' single entry point
lib/payments/promote-draft.ts         +1 word (`export` on releaseHold) + a note
app/api/dashboard/action/route.ts     operator cancel: release after cancel; the email uses the resolver
app/api/orders/cancel/route.ts        customer cancel: the same, and the email learns the payment state
lib/email.ts                          sendCancellationEmail gains `paymentState` and a held-card sentence
app/dashboard/[token]/page.tsx        the cancel modal's held-order block now says the hold is released
```

`npx tsc --noEmit` exits 0. Nothing on the WHAT NOT TO TOUCH list was touched: the capture sweep's allow-list and the capture guard are **untouched**, the abandonment sweep's `promoted_at is null` predicate is **untouched**, the refund path built earlier today is **untouched**, and neither the cancellation window nor who may cancel changed.

---

## 1. WHAT WAS REUSED, AND BOTH CALL SITES

🔴 **No third way to cancel a PaymentIntent was written.** `grep -rn "paymentIntents.cancel" app lib` returns **one** line, unchanged:

```
lib/payments/authorize.ts:207:    await stripe.paymentIntents.cancel(
```

**And the release itself is `promoteDraft`'s**, which the refusal branch already used. It gained one word:

```ts
// 🔴 EXPORTED FOR lib/payments/release-hold, AND FOR THAT REASON ONLY. A cancelled order's hold is the
// same act as a refused promotion's: cancel at Stripe, then stamp the draft, in that order. Writing a
// second one would be a second place for the ordering above to be got wrong.
// ⚠️ VISIBILITY ONLY. Not one character of the body changed.
export async function releaseHold(
```

`lib/payments/release-hold.ts` adds the **guards** and nothing else — its whole import list is five lines, and it makes no Stripe call of its own:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { getOrderDraft } from '@/lib/payments/order-drafts'
import { onlinePaymentIdempotencyKey } from '@/lib/payments/online'
import { releaseHold } from '@/lib/payments/promote-draft'
import { logAction } from '@/lib/audit/actionAudit'
```

### Call site 1 — the operator, `app/api/dashboard/action/route.ts`

```ts
      const released = await releaseHoldForCancelledOrder(supabase, {
        orderKey, truckId: truck.id, trigger: 'operator_cancel', actor, source: actorSource,
      })
      if (released.status === 'released') {
        console.log(`[cancel] hold released pi=${released.paymentIntentId} order_key=${orderKey} (operator)`)
      }
```

### Call site 2 — the customer, `app/api/orders/cancel/route.ts`

```ts
    const paymentState = await resolveEmailPaymentState(supabase, order.order_key)
    await releaseHoldForCancelledOrder(supabase, {
      orderKey: order.order_key,
      truckId: order.truck_id,
      trigger: 'customer_cancel',
      actor: { actorKind: 'unknown', actorId: null, actorLabel: null },
      source: 'web',
    })
```

⚠️ **`trigger` is recorded on the audit row**, so "did the customer or the operator cancel this" is answerable from one query rather than by inference.

---

## 2. IT CAN ONLY EVER RELEASE

**Three independent reasons, in decreasing order of how much you have to trust me:**

**1. It cannot capture or refund, and this is structural, not a promise.** The module imports no capture and no refund. `grep -n "paymentIntents\.\|refunds\.create\|captureOnConfirmation\|\.capture(" lib/payments/release-hold.ts` matches **two comment lines and no code**. The only thing it can do to a PaymentIntent is hand it to `releaseHold`, whose only Stripe verb is `cancelAuthorization` → `paymentIntents.cancel`.

**2. A captured order is refused before Stripe is contacted at all** — the quoted guard:

```ts
    const { data: captured, error: ledgerErr } = await supabase
      .from('order_payments')
      .select('id')
      .eq('idempotency_key', onlinePaymentIdempotencyKey(draft.payment_intent_id))
      .maybeSingle()
    if (ledgerErr) {
      // 🔴 "I COULD NOT TELL" IS A REFUSAL. A read failure is not evidence that nothing was captured,
      // and acting on that guess is how a paid order gets its charge cancelled.
      ...
      return { status: 'failed', paymentIntentId: draft.payment_intent_id, detail: `ledger read failed: ${ledgerErr.message}` }
    }
    if (captured) return { status: 'captured', paymentIntentId: draft.payment_intent_id }
```

**It is the same question capture asks itself**, keyed the same way — `stripe_pi:<intent>`, the row capture and the webhook both write. ⚠️ **A read failure refuses too**, rather than assuming nothing was captured.

**3. Stripe would refuse anyway.** `paymentIntents.cancel` on a `succeeded` intent is an error, not a refund. **The build does not rely on that**, but it is the third net. Measured in (c): the captured intent came out of a cancellation still `succeeded`, `received: 500`, with its ledger row intact.

---

## 3. THE ORDERING, AND WHY IT IS THE OPPOSITE OF THE REFUND'S

🔴 **The order is cancelled FIRST. The release runs after and cannot fail the request.**

```ts
      await supabase.from('orders').update({ status: 'cancelled', cancellation_reason: cancellationReason || null })...
      // ── 🔴 THE ORDER IS CANCELLED FIRST, AND THE HOLD IS RELEASED AFTER. ────────────────────────
      // The refund goes FIRST because a refund that fails must not leave a cancelled order with the
      // customer's money still taken and nobody looking at it — money OUT is the thing that must not be
      // silently skipped. A HOLD is not money out: nothing has been taken, and a release that fails
      // leaves an authorisation that expires on its own in about a week. So the costs are reversed, and
      // so is the ordering: an operator cancelling mid-service must never be blocked by Stripe being
      // slow or unreachable, and this call cannot fail the request — every outcome is a return value.
```

**The two failure costs are not symmetric, which is the whole argument:**

| | If the money step fails | Cost of the failure |
|---|---|---|
| **Refund on cancel** (refund first) | money the customer is owed stays taken | 🔴 **Permanent until a human notices.** Nothing expires it |
| **Release on cancel** (cancel first) | an authorisation stays live | ⚠️ **Self-limiting** — Stripe expires it in about seven days, and nothing was ever taken |

**What is recorded when the release fails**, so the hold is findable rather than lost:

```ts
      await logAction(supabase, {
        action: 'hold_release_failed',
        truckId: args.truckId, orderKey: args.orderKey,
        amountMinor: typeof draft.total_minor === 'number' ? draft.total_minor : null,
        beforeState: { payment_intent_id: draft.payment_intent_id, trigger: args.trigger },
        afterState: {
          released: false,
          meaning: 'the order was cancelled and its card authorisation was NOT released; the hold may still be live',
          resolves: 'cancel_this_intent_by_hand_or_let_it_expire',
        },
        actor, source: args.source ?? 'web',
      })
```

One query finds every one:

```sql
select * from action_audit_log where action = 'hold_release_failed' order by created_at desc;
```

🔴 **And `authorization_cancelled_at` stays NULL, deliberately.** The draft still reads as an uncancelled authorisation — which is exactly what any future collector will look for. Stamping it on a failure would hide the hold from the only predicate that can find it.

---

## 4. THE CUSTOMER'S CANCELLATION EMAIL

**It now asks the resolver instead of guessing from a column**, and the sentence lives in `lib/email.ts` with all the other payment copy — not in the cancel path:

```ts
  const refundLine = paymentState === 'held' || paymentState === 'held_short'
    ? `<p>Your card was held for this order, not charged. That hold has been released and no money has been taken.</p>`
    : (paymentState === 'captured' || paymentState === 'part_paid' || (!paymentState && paymentStatus === 'paid'))
    ? `<p>If you paid by card, any refund is handled by ${truckName} directly — please contact them about it.</p>`
    : ''
```

with a plain-text twin built from the same decision, *"ONE DECISION, TWO RENDERINGS. The text twin must never disagree with the HTML about money."*

🔴 **The state is resolved BEFORE the release**, at both call sites, and that ordering is load-bearing: releasing stamps `authorization_cancelled_at`, after which `readEmailPaymentState` answers `'hatch'` — *"Pay at the truck on collection"* — to a customer whose order has just been cancelled.

⚠️ **`paymentState` is optional**, so any caller that does not pass it renders exactly what it rendered before.

⚠️ **The operator's cancel email had a second defect and it is now fixed too:** it gated on `order.paid_at`, *which the capture path never sets*, so it could never fire for a card order at all. It now uses the same resolved state.

**What each customer now reads:**

| Order | Sentence |
|---|---|
| **Card held** | *"Your card was held for this order, not charged. That hold has been released and no money has been taken."* |
| **Card captured / part paid** | *"If you paid by card, any refund is handled by {truck} directly — please contact them about it."* |
| **Pay at hatch** | nothing about money, as before |

---

## 5. WHAT THE OPERATOR SEES IN THE CANCEL MODAL

**Was:** *"Their card is **held, not charged** — no money has been taken, so there is nothing to refund. The hold is released when it expires."*

**Now:** *"Their card is **held, not charged** — no money has been taken, so there is nothing to refund. Cancelling releases the hold straight away."*

The other three blocks (card money taken · cash taken · nothing taken) are unchanged.

---

## 6. THE ORDERS ALREADY IN THIS STATE

**Read live, across every promoted draft with an uncancelled authorisation:**

```
promoted drafts with an UNCANCELLED intent: 9
  #24 held 750p  captured=true      #59 held 650p  captured=true      #67 held 650p  captured=true
  #25 held 1100p captured=true      #60 held 2100p captured=true      #62 held 600p  captured=true
  #18 held 600p  captured=true      #19 held 650p  captured=true      #66 held 350p  captured=true

🔴 CANCELLED-OR-REJECTED ORDERS WITH A LIVE, UNCAPTURED HOLD: 0
```

✅ **There are none today.** Every promoted draft that still reads "uncancelled" was in fact **captured** — capture consumes the hold without stamping `authorization_cancelled_at`, which is why they linger in that query. **No one-off repair is needed.**

### Does anything collect them in future? No — and here is the honest recommendation

**Neither sweep can see a cancelled order**, exactly as the brief states, and 🔴 **neither should be changed to**:

- The **capture** sweep may only ever capture. Adding `'cancelled'` to its allow-list would make it **charge cancelled orders** — catastrophic, and explicitly fenced off.
- The **abandonment** sweep owns `promoted_at is null`. A promoted order fails that by construction, and widening it would break the partition that stops the two jobs colliding.

**So there is no safe one-line predicate change, and I have not made one.** The recommendation, not built:

| Option | What it is | Cost |
|---|---|---|
| **(i) A third sweep** — the honest fix | `promoted_at is not null` **AND** `authorization_cancelled_at is null` **AND** the order is `cancelled`/`rejected` **AND** no `stripe_pi:` ledger row → release. It would reuse `releaseHoldForCancelledOrder` unchanged | A new cron and a new SQL predicate. **It preserves the partition**: cancel-only, never captures, and disjoint from both existing jobs |
| **(ii) A one-off script** | the same query, run by hand when `hold_release_failed` appears | Cheapest. **Nothing runs it automatically** |
| **(iii) Nothing** | the failure path is audited and holds expire in about a week | Free. ⚠️ It is what today's zero-count relies on, and it is only acceptable because nothing was ever taken |

⚠️ **The population this would serve is now only the FAILURES** — `action_audit_log where action = 'hold_release_failed'` — because the two live paths release at the moment of cancellation. That is a much smaller and self-announcing set than the one that existed this morning.

---

## VERIFICATION

Real routes, real drafts, real Stripe sandbox. Emails intercepted before any import; **zero transmitted**.

### (a) An operator cancels a HELD order

```
before: stripe={"status":"requires_capture","amount":950,"received":0,"cancellation_reason":null}
[promote] hold released pi=pi_3U3y012fB4PPCw2D0xF3yTXf draft=a7656040-… (cancelled)
[cancel] hold released pi=pi_3U3y012fB4PPCw2D0xF3yTXf order_key=a7656040-… (operator)
HTTP 200 {"success":true,"status":"cancelled"}
after : stripe={"status":"canceled","amount":950,"received":0,"cancellation_reason":"abandoned"}
draft.authorization_cancelled_at="2026-08-13T12:44:47.768+00:00"
order status=cancelled   ledger rows=[]
audit=["hold_released"]
customer email says: "Your card was held for this order, not charged. That hold has been released and no money has been taken."
```

🔴 **`canceled` at Stripe, `received: 0`, no ledger row, the order cancelled, and the customer told the truth.**

### (b) A customer cancels a HELD order

```
[promote] hold released pi=pi_3U3y042fB4PPCw2D00j9ruhT draft=8fdcd957-… (cancelled)
HTTP 200 {"ok":true}
after : stripe={"status":"canceled","amount":700,"received":0,"cancellation_reason":"abandoned"}
draft.authorization_cancelled_at="2026-08-13T12:44:50.374+00:00"
order status=cancelled   ledger rows=[]
audit=["hold_released"]
customer email says: "Your card was held for this order, not charged. That hold has been released and no money has been taken."
```

**Identical outcome on the path nobody is watching**, through the same module and the same release.

### (c) A CAPTURED order is cancelled — the release does NOT run

```
before: stripe={"status":"succeeded","amount":500,"received":500}  ledger=[{"kind":"charge","amount_minor":500}]
HTTP 200 {"success":true,"status":"cancelled"}
after : stripe={"status":"succeeded","amount":500,"received":500}  ledger=[{"kind":"charge","amount_minor":500}]
draft.authorization_cancelled_at=null  (null = untouched)
audit=[]
customer email says: "If you paid by card, any refund is handled by Test Kitchen directly — please contact them about it."
```

🔴 **The money is untouched, the ledger row is untouched, the draft is untouched, and no audit row was written** because the module returned `captured` before doing anything. **The refund path is what handles this order**, and the email says so.

### (d) The release fails — the order still cancels

Forced honestly: the intent was cancelled at Stripe first, then the draft pointed at an id that does not exist, so `cancelAuthorization` returns `ok: false`.

```
[authorize] cancel FAILED pi=pi_doesnotexist_harness: No such payment_intent: 'pi_doesnotexist_harness'
[promote] 🔴 CANCEL FAILED pi=pi_doesnotexist_harness draft=915a3013-…
[release-hold] 🔴 COULD NOT RELEASE pi=pi_doesnotexist_harness for cancelled order_key=915a3013-… (operator_cancel).
              The order IS cancelled and a hold may remain on this customer's card until it expires.
              Recorded as hold_release_failed.

HTTP 200 {"success":true,"status":"cancelled"}
order status=cancelled   <- STILL CANCELLED
draft.authorization_cancelled_at=null  (null = still findable)
audit row: {"action":"hold_release_failed","after_state":{
  "meaning":"the order was cancelled and its card authorisation was NOT released; the hold may still be live",
  "released":false,"resolves":"cancel_this_intent_by_hand_or_let_it_expire"}}
```

**The operator was not blocked, and the hold is findable by one query.**

### (e) A pay-at-hatch order is cancelled — unchanged

```
HTTP 200 {"success":true,"status":"cancelled"}
order status=cancelled
STRIPE CALLS MADE DURING THIS CANCEL: 0
audit=[]
```

🔴 **Zero Stripe calls**, counted by wrapping `fetch` for the duration of the request. The cheap path is one primary-key read that finds no draft and returns.

### EVERY WRITE, AND THE CLEANUP

| Write | Undone? |
|---|---|
| 5 `orders` rows, 4 `order_drafts` rows, 1 `order_payments` row, the `action_audit_log` rows | **yes** — `leftovers: {"orders":0,"order_drafts":0,"order_payments":0,"action_audit_log":0}` |
| 4 Stripe PaymentIntents | `pi_3U3y01…` **canceled**, `pi_3U3y04…` **canceled**, `pi_3U3y0A…` **canceled**, `pi_3U3y07…` **succeeded** (the captured case). Sandbox objects cannot be deleted |
| A first run that died on a harness FK-ordering bug | **purged at the start of the second run**; its 3 intents were cancelled or are listed above |

```
waiting 45s so the deployed webhook is not mid-write when rows go...
ledger rows for harness orders: 1 then 1 — settled
EMAILS TRANSMITTED: 0 (intercepted 1)
```

**What needs a browser:** the cancel modal's one-sentence copy change. Everything else ran for real.

---

## NON-ASCII CENSUS

| File | Total before | Total after | Distinct before | Distinct after | Vocabulary |
|---|---|---|---|---|---|
| `lib/payments/release-hold.ts` | — (new) | 304 | — | 5 | `🔴─—⚠️` |
| `lib/payments/promote-draft.ts` | 587 | 590 | 7 | 7 | unchanged |
| `app/api/dashboard/action/route.ts` | 3090 | 3181 | 15 | 15 | unchanged |
| `app/api/orders/cancel/route.ts` | 3 | 4 | 1 | 1 | `—` only, before and after |
| `lib/email.ts` | 98 | 99 | 15 | 15 | unchanged |
| `app/dashboard/[token]/page.tsx` | 2582 | 2582 | 53 | 53 | unchanged |

**No file gained a character class.** ⚠️ `app/api/orders/cancel/route.ts` has a vocabulary of exactly **one** character — an em dash — and the comments added there were written to keep it that way.

---

## FLAGS

- **Nothing in the prompt arrived garbled**, and no instruction contradicted another.
- ✅ **Zero orders are stranded today** — every promoted draft with an uncancelled authorisation turned out to be captured. The gap was real and its backlog is empty.
- 🔴 **No safe one-line predicate exists** to collect future failures: the capture sweep may never see a cancelled order and the abandonment sweep's partition must hold. A third, cancel-only sweep is recommended and **not built**.
- ⚠️ **`releaseHold` gained `export`** in `promote-draft.ts` — visibility only, to avoid a second implementation of cancel-then-stamp.
- ⚠️ **The operator cancel email's `paid_at` gate is gone**, replaced by the resolver. That was a defect flagged in the refund report and is now closed as a side effect of using one source for the payment sentence.
