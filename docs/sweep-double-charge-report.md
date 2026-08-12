# The sweep that charged two customers twice

**Date:** 12 August 2026
**READ-ONLY DIAGNOSIS. No file changed, no file created except this report. No `next dev`, no `next build`, no commit, no deploy. No fix proposed or applied.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 FIRST, A CORRECTION TO THE PREMISE. `'collected'` IS NOT WHAT DID THIS.

Your framing was that the allow-list's `'collected'` entry is the problem. **The audit log says otherwise — both orders were `confirmed`, and both were marked paid by `mark_paid`, which does not touch status at all.**

```
21:14:05.545  mark_paid          #18  600  actor_kind=owner   {"charged_minor":600,"ledger_failed":false}
21:14:07.610  mark_paid          #19  650  actor_kind=owner   {"charged_minor":650,"ledger_failed":false}
21:15:13.611  capture_missing    #18  600  found_by=stranded_sweep
21:15:15.939  capture_recovered  #18  600  {"result":"captured","order_status":"confirmed"}
21:15:16.081  capture_missing    #19  650  found_by=stranded_sweep
21:15:17.630  capture_recovered  #19  650  {"result":"captured","order_status":"confirmed"}
```

🔴 **`"order_status":"confirmed"` — recorded by the sweep itself.** `orders.paid_at` and `orders.collected_at` are both `null` on each order, which is exactly what `mark_paid` leaves behind. **Removing `'collected'` from the allow-list would not have prevented this by a single penny.**

## And the real defect is one clause

```sql
    and not exists (
      select 1 from order_payments p
      where p.idempotency_key = 'stripe_pi:' || d.payment_intent_id
    )
```

**That is an equality test on one computed string.** An in-person payment's row carries `collect:<order_key>:0:600`. **The clause cannot see it — not "misses it", cannot see it.** The sweep asks *"has THIS INTENT been captured?"* when the question it needs answered is *"does this order still owe money?"*, and this codebase already has a chokepoint for the second one — `getOrderBalance` — which the sweep never calls.

**Elapsed between the two charges: 70.4 seconds.**

---

## 1. The predicate, and the code that acts on it

**Source: QUOTED.** `supabase/migrations/20260815_find_stranded_authorisations.sql`:

```sql
  select
    d.order_key, d.truck_id, o.id::text as order_id, o.status::text as order_status,
    d.payment_intent_id, d.total_minor, d.promoted_at
  from order_drafts d
  join orders o on o.order_key = d.order_key
  where
    d.payment_intent_id is not null
    and d.promoted_at is not null
    and d.authorization_cancelled_at is null
    and o.status in ('confirmed', 'modified', 'cooking', 'ready', 'collected')
    and d.promoted_at < now() - make_interval(mins => greatest(coalesce(p_grace_minutes, 10), 0))
    and not exists (
      select 1
      from order_payments p
      where p.idempotency_key = 'stripe_pi:' || d.payment_intent_id
    )
  order by d.promoted_at asc
  limit greatest(coalesce(p_limit, 100), 1);
```

**And what acts on each row** — `lib/payments/stranded-authorisations.ts`:

```ts
  for (const row of found.rows) {
    console.error(
      `[stranded] 🔴 CONFIRMED ORDER HOLDING UNCAPTURED MONEY: order #${row.orderId} ` +
      `(order_key=${row.orderKey}, truck=${row.truckId}, status=${row.orderStatus}) has ` +
      `${row.totalMinor}p held on pi=${row.paymentIntentId} since ${row.promotedAt} and no ledger row.`,
    )
    await recordFirstSighting(supabase, row)

    if (opts.dryRun) { outcomes.push({ ...toOutcome(row), result: 'dry_run' }); continue }

    const cap = await captureOnConfirmation(supabase, {
      orderKey: row.orderKey, truckId: row.truckId, trigger: 'stranded_sweep',
    })

    if (cap.status === 'captured' || cap.status === 'already') {
      recovered++
      await logAction(supabase, { action: 'capture_recovered', … })
      …
    } else if (cap.status === 'expired') {
      await markAuthorizationCancelled(supabase, row.orderKey)
      …
    }
  }
```

🔴 **There is no condition between the row arriving and `captureOnConfirmation` being called.** The predicate is the entire decision.

---

## 2. What the sweep can see at the moment it decides

**Source: QUOTED.** Exactly seven values, all of them from the function's `returns table`:

```
order_key   truck_id   order_id   order_status   payment_intent_id   total_minor   promoted_at
```

| Table | What it reads | What it therefore knows |
|---|---|---|
| `order_drafts` | `payment_intent_id`, `promoted_at`, `authorization_cancelled_at`, `total_minor` | there is a live authorisation |
| `orders` | **`o.status` only** — via `join orders o on o.order_key = d.order_key` | the truck accepted it |
| `order_payments` | 🔴 **one row, by one exact key**: `p.idempotency_key = 'stripe_pi:' || d.payment_intent_id` | whether *this intent* was captured |

### 🔴 DOES IT KNOW WHETHER MONEY WAS ALREADY TAKEN BY ANOTHER MEANS? **NO.**

- It **never selects `orders.payment_status`** — which read `'refund_due'` on both orders within a second of the capture.
- It **never selects `orders.amount_paid`**.
- It **never calls `getOrderBalance`**, the function whose own header calls itself *"the CHOKEPOINT"* for paid-ness.
- It reads `order_payments` **only** through that single-key `NOT EXISTS`.

**INFERRED, and it is the whole finding:** the sweep is blind by construction, not by oversight. Every fact it would need was one join away and none of them was asked for.

---

## 3. 🔴 THE CENTRAL QUESTION: WHAT "MARK PAID" WRITES

### What is written

**Source: QUOTED.** `app/api/dashboard/action/route.ts:1963`:

```ts
    if (action === 'mark_paid' || action === 'mark_paid_cash' || action === 'mark_paid_card') {
      …
      const res = await recordCollectionPayment(supabase, { orderKey, truckId: truck.id, createdBy: actor.actorId, method })
      charged = res.chargedMinor
      …
      await logAction(supabase, { action, truckId: truck.id, orderKey, amountMinor: charged, … })
      return NextResponse.json({ success: true, chargedMinor: charged, … })
    }
```

and `lib/payments/ledger.ts`:

```ts
  const { inserted, balance } = await recordPaymentEvent(supabase, {
    orderKey: opts.orderKey,
    truckId: opts.truckId,
    kind: 'charge',
    channel: 'in_person_other',
    amountMinor: before.balanceMinor,
    state: 'succeeded',
    idempotencyKey: collectIdempotencyKey(opts.orderKey, before.paidMinor, before.balanceMinor),
    note: 'Mark paid & done — taken at the hatch',
    createdBy: opts.createdBy ?? null,
    method: opts.method ?? null,
    livemode: true,
  })
```
```ts
export function collectIdempotencyKey(orderKey: string, paidBeforeMinor: number, balanceMinor: number): string {
  return `collect:${orderKey}:${paidBeforeMinor}:${balanceMinor}`
}
```

| | |
|---|---|
| **A ledger row?** | ✅ **Yes** — `kind: 'charge'`, `channel: 'in_person_other'`, `state: 'succeeded'`, `livemode: true` |
| **A `payment_status` change?** | ✅ **Yes, but indirectly.** `recordPaymentEvent` calls `recalcOrderPayment`, *"the ONLY writer of payment_status/amount_paid"*, which derives both from the ledger |
| **Anything else?** | An `action_audit_log` row. 🔴 **`mark_paid` does NOT write `status`, `paid_at` or `collected_at`** — which is why #18 and #19 read `status: 'confirmed'`, `paid_at: null` |

### Would the predicate exclude that order? ❌ **NO.**

Walk each clause against order 18 as it stood at 21:15:13:

| Clause | Value | Excluded? |
|---|---|---|
| `d.payment_intent_id is not null` | `pi_3U3fB52fB4PPCw2D1VD1opZI` | ❌ |
| `d.promoted_at is not null` | set | ❌ |
| `d.authorization_cancelled_at is null` | null | ❌ |
| `o.status in (…)` | `'confirmed'` | ❌ |
| `d.promoted_at < now() - 10 min` | promoted 16:39 | ❌ |
| 🔴 `not exists (… idempotency_key = 'stripe_pi:pi_3U3fB5…')` | **no such row existed** | ❌ |

**Every clause passed. The order was returned and captured.**

### 🔴 CAN THE `NOT EXISTS` CLAUSE SEE AN IN-PERSON ROW? NO, AND HERE ARE THE TWO STRINGS

```
what the clause looks for :  stripe_pi:pi_3U3fB52fB4PPCw2D1VD1opZI
what mark_paid wrote      :  collect:3a621e2f-92b6-4d70-9d37-c5a0e469426c:0:600
```

**Different prefix, different body, different generator.** The clause is `p.idempotency_key = <one string>`; an in-person row can never equal it. It is not a filter that excludes in-person payments — it is a filter that **only ever matches Stripe captures of one specific intent**, and everything else in the ledger is outside its field of view.

⚠️ **AND THE SAME BLINDNESS IS ONE LAYER DEEPER.** `captureOnConfirmation`'s first idempotency layer has the identical shape:

```ts
    const idempotencyKey = onlinePaymentIdempotencyKey(piId)
    const { data: existing } = await supabase
      .from('order_payments')
      .select('id')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()
    if (existing) return { status: 'already', paymentIntentId: piId }
```

**So even if the sweep had passed the order on to the capture function unfiltered — which it did — the capture function had no second chance to notice either.** Two guards, one question between them.

---

## 4. Orders 18 and 19, live

**Source: QUOTED.** Read just now.

### Order #18 — `3a621e2f-92b6-4d70-9d37-c5a0e469426c`
```
{"id":"18","status":"confirmed","payment_status":"refund_due","amount_paid":12,"total":6,
 "total_minor":600,"paid_at":null,"collected_at":null}

21:14:05.431868+00  in_person_other    600p  succeeded  collect:3a621e2f-…:0:600           by=0610eb33-… (owner)
21:15:15.490675+00  online             600p  succeeded  stripe_pi:pi_3U3fB52fB4PPCw2D1VD1opZI  by=stripe_webhook
```
🔴 **£6.00 order. £12.00 taken. Gap: 70.06 s.**

### Order #19 — `a06c2090-99bd-40da-9f3c-10c5779b964f`
```
{"id":"19","status":"confirmed","payment_status":"refund_due","amount_paid":13,"total":6.5,
 "total_minor":650,"paid_at":null,"collected_at":null}

21:14:07.524868+00  in_person_other    650p  succeeded  collect:a06c2090-…:0:650           by=0610eb33-… (owner)
21:15:17.219892+00  online             650p  succeeded  stripe_pi:pi_3U3iwC2fB4PPCw2D0DwOxtVU  by=stripe_webhook
```
🔴 **£6.50 order. £13.00 taken. Gap: 69.69 s.**

⚠️ **`created_by` on the second row reads `stripe_webhook`** — misleading but not wrong: `recordOnlineCardPayment` hardcodes that string, and both the webhook and `captureOnConfirmation` write through it. The **audit log** is what identifies the actor: `capture_recovered … "via":"stranded_sweep"`.

✅ **The ledger detected it correctly and immediately.** `payment_status: 'refund_due'` is `getOrderBalance` reporting `paidMinor > totalMinor`. **The system knows. Nothing acts on it.**

---

## 5. Every route to "held authorisation + completed in-person payment"

**Source: QUOTED** for each handler; the reachability judgements are **INFERRED**.

| # | Route | Books an in-person row? | Reachable with a held authorisation? |
|---|---|---|---|
| 1 | 🔴 **`mark_paid` / `mark_paid_cash` / `mark_paid_card`** — `action/route.ts:1963` | ✅ `recordCollectionPayment` | 🔴 **YES — THIS IS WHAT HAPPENED.** Status untouched, so the order stays in the sweep's allow-list |
| 2 | **`collected`** — `action/route.ts:416` (one-press completion) | ✅ same call, same key | ⚠️ **YES.** Writes `status: 'collected'` — still inside the allow-list |
| 3 | **Two-press completion**: `mark_paid` then `collected` | the second is a no-op (`before.balanceMinor <= 0` short-circuits) | ⚠️ **YES**, via route 1 |
| 4 | **Offline replay** of either from the native outbox | ✅ same handlers, `source: 'offline_replay'` | ⚠️ **YES**, and it can land hours later |
| 5 | **Walk-up / manual order** — `action/route.ts:1457` | ✅ `recordCollectionPayment` | ❌ **NO.** A manual order has no `order_drafts` row, so no authorisation and no sweep row |
| 6 | **`undo_collected` / undo mark paid** | **deletes** the collect row | ⚠️ Restores an outstanding balance, at which point capturing is *correct* |

### 🔴 AND THE ONLY THING GUARDING ROUTE 1 IS A CLIENT-SIDE BUTTON LABEL

`components/dashboard/OrderCard.tsx:322`:

```ts
    if (effectivePaid || heldAuthorisation) {
      return <Btn label="Collected" colour="dark" loading={isLoading('collected')} onClick={() => onAction('collected', order.order_key)} />
    }
```

The card **does** suppress "Mark paid" for a held order, with a comment saying *"pressing it books a SECOND payment at the hatch for an order the customer has already authorised."* **That reasoning was correct and it was written down.**

🔴 **BUT THERE IS NO SERVER-SIDE GUARD.** The `mark_paid` handler goes straight to `recordCollectionPayment` with no check on `order_drafts`, no call to `readHeldAuthorisations`, and no reference to `heldAuthorisation` anywhere. **A stale board, a KDS, an offline replay or a direct POST all book the row.**

⚠️ **Why it was offered here is NOT ESTABLISHED.** The suppression is in HEAD and was deployed by 21:14. The most likely explanation is a dashboard tab loaded before `961ecd8` landed, since the same session's earlier evidence records the board showing order 19 "as unpaid with no held-authorisation state" — but I cannot prove which build served that page.

---

## 6. What *should* happen — the options, and what each costs

**Not built. Stated, with the trade for each.** All **INFERRED**.

| | Option | What it costs |
|---|---|---|
| **A** | 🔴 **Ask the real question: replace the single-key `NOT EXISTS` with the outstanding balance** — the sweep captures only if the order still owes money | Requires a new migration (a `sum` over the ledger, not an anti-join) and forces a decision on **part-payment**: an order £2 paid in cash still owes £4, but the authorisation is for the full £6 and Stripe cannot partially capture more than was authorised — capturing would overcharge. **The most correct option and the one with the most edge cases** |
| **B** | **Cancel the hold instead of capturing when the order is already settled** | Honest and terminal: the customer paid once, the hold is released, the truck keeps the cash. Costs the truck nothing. ⚠️ Wrong if the in-person row was itself the mistake — and this direction is unrecoverable, because releasing a hold cannot be undone |
| **C** | **Skip and flag: leave the hold, record `capture_conflict`, surface it** | Cheapest and safest — no money moves on a guess. ⚠️ The hold sits until Stripe expires it (~7 days), and it needs an operator surface, otherwise it is a log line nobody reads |
| **D** | **Guard at the source: refuse `mark_paid`/`collected` server-side when a held authorisation exists** | Closes the door rather than mopping the floor, and matches what the card already believes. ⚠️ Blocks the legitimate *"the card is held but the customer wants to pay cash"* flow unless there is an explicit override, and **does nothing for orders already in this state** |
| **E** | **Move the check into `captureOnConfirmation`, so every site inherits it** | One place, every caller fixed. ⚠️ Changes behaviour at the confirm and time-adjust sites too, where "already paid in person" is a different and rarer situation — and that function's contract is currently *"capture follows confirmation"*, not *"capture if owed"* |
| **F** | **Act on `refund_due`** — the ledger already detects this within a second | Detection exists and is free. ⚠️ **HatchGrab cannot refund a direct charge** — only the truck can, from its own Dashboard. So this can only ever be an alert, never a remedy |

⚠️ **AND A CONSTRAINT THAT NARROWS ALL OF THEM:** these are Connect **direct charges**. Once captured, the platform has no way to give the money back. **Every option that lets a capture happen on a settled order is unrecoverable by this codebase.** That argues for the guard being *before* the capture, not after.

---

## 7. Can the same conflict arise at the other capture sites?

# ⚠️ YES. THE GUARD IS THE SAME AT ALL FOUR, AND IT IS THE ONE THAT FAILED.

**Source: QUOTED.** Every site calls `captureOnConfirmation`, whose only pre-capture ledger check is:

```ts
    const idempotencyKey = onlinePaymentIdempotencyKey(piId)
    const { data: existing } = await supabase
      .from('order_payments').select('id').eq('idempotency_key', idempotencyKey).maybeSingle()
    if (existing) return { status: 'already', paymentIntentId: piId }
```

**There is no other ledger check anywhere in that function.** So the blindness is shared. What differs is only *how easily each site can be reached after an in-person payment*:

| Site | Guard on capture | Reachable after `mark_paid`? |
|---|---|---|
| 🔴 **Sweep** (`stranded_sweep`) | 🔴 **the predicate only** — quoted in §1, and it is what failed | 🔴 **YES, AUTOMATICALLY, EVERY 15 MINUTES, WITH NO HUMAN IN THE LOOP.** This is what makes it uniquely dangerous |
| **Operator confirm** (`confirm`) | `if (action === 'confirm')` — an operator tap, and nothing about payment | ⚠️ **YES.** Marking a *pending* order paid at the hatch and then confirming it does exactly this. Requires two deliberate taps in that order |
| **Quick-time-adjust** (`time_adjust`) | offered on pending orders only; writes `status: 'confirmed'` unconditionally | ⚠️ **YES**, same shape as confirm, and less obviously a money action |
| **promoteDraft** (`promote_auto_accept`) | `if (autoAccepted)` — the flag it just wrote into `orders.status` | ✅ **NO, BY TIMING RATHER THAN BY GUARD.** It fires inside the request that *creates* the order, so no operator has had a chance to mark anything paid. **Immune today; not protected** |

🔴 **SO IT IS NOT UNIQUE TO THE SWEEP — but the sweep is the only site that acts unattended.** At the other three a human is present and has just looked at the order; at the sweep nobody is, and it retries every fifteen minutes.

---

## 8. How many orders are in this state right now

**Source: QUOTED.** Run read-only against every promoted draft with an uncancelled authorisation:

```
promoted drafts with an uncancelled authorisation: 4
⚠️ CAPTURED + NON-STRIPE PAYMENT #18 3a621e2f-… status=confirmed payment_status=refund_due paid=12/6   nonStripe=in_person_other:600
⚠️ CAPTURED + NON-STRIPE PAYMENT #19 a06c2090-… status=confirmed payment_status=refund_due paid=13/6.5 nonStripe=in_person_other:650

🔴 HELD authorisation AND a non-Stripe payment (the sweep WOULD double-charge): 0
⚠️ ALREADY captured AND a non-Stripe payment (already double-charged) : 2
```

| | |
|---|---|
| 🔴 **At risk right now** | **0.** No order currently holds an uncaptured authorisation alongside an in-person payment, so the next cron run charges nobody twice |
| ⚠️ **Already double-charged** | **2** — orders **#18** and **#19**, both `refund_due` |
| **Total exposure** | **£12.50 of sandbox money**, £6.00 on `pi_3U3fB52fB4PPCw2D1VD1opZI` and £6.50 on `pi_3U3iwC2fB4PPCw2D0DwOxtVU` |

⚠️ **Zero-at-risk is a snapshot, not a property.** The window opens the moment any operator marks a held card order paid, and closes only when the sweep next runs — up to 15 minutes later. Here it was 70 seconds.

---

# Quoted vs inferred

| § | Status |
|---|---|
| Correction | **QUOTED** — the audit rows, the null `paid_at`/`collected_at`, and `"order_status":"confirmed"` recorded by the sweep itself |
| 1 | **QUOTED** — the predicate and the loop, both in full |
| 2 | **QUOTED** — the `returns table`, the join, and the single-key `NOT EXISTS`. "It cannot know" is **QUOTED by absence** |
| 3 | **QUOTED** — the handler, `recordCollectionPayment`, `collectIdempotencyKey`, and both live key strings. The clause-by-clause walk is **INFERRED** from the live row values |
| 4 | **QUOTED** — read live |
| 5 | **QUOTED** for every handler and for the OrderCard suppression. Reachability is **INFERRED**. Why the button was pressed is **not established** |
| 6 | **INFERRED** throughout. Nothing built |
| 7 | **QUOTED** — the shared pre-check and each site's own guard. Reachability is **INFERRED** |
| 8 | **QUOTED** — run read-only just now |

# Not established

- 🔴 **Why the dashboard offered "Mark paid" on two held orders** when `OrderCard.tsx:322` suppresses it. A board loaded before `961ecd8` deployed is the likeliest explanation; only the browser session could confirm it.
- **Whether the operator intended to take payment in person**, or was testing the button. The audit rows say `actor_kind: 'owner'`, `method: null` — no cash/card split was chosen.
- **What the right answer is for a PART-paid order** whose remaining balance is smaller than the authorised amount. Option A in §6 forces that decision and I have not made it.

# Standing

- 🔴 **£12.50 is owed back to two customers and this codebase cannot return it.** Direct charges: the refunds must be issued by the truck from its own Stripe Dashboard. Sandbox money, so nothing real is outstanding — but the sequence is production-accurate.
- ⚠️ **`payment_status: 'refund_due'` is a detection with no consumer.** The ledger noticed within a second, wrote it down, and nothing reads it.
- ⚠️ **The `'collected'` entry in the allow-list is still worth a second look** on its own merits — an order handed over and marked collected in cash is route 2 in §5 — **but it is not what happened here, and changing it alone would fix nothing.**
