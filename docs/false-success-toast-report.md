# The success toast that reports a refusal

**Date:** 13 August 2026
**READ-ONLY DIAGNOSIS. No file changed, no file created except this report. No `next dev`, no `next build`, no commit, no deploy. No fix proposed or applied.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 YES. IT IS THE SAME PATTERN, AND IT IS THE SAME SHAPE AS THE `reversal: 'none'` INCIDENT.

**The refusal was correct. The toast was not.** `recordCollectionPayment` short-circuited on a settled balance, wrote nothing, and returned `chargedMinor: 0`. The route wrapped that in `{ success: true }`. The client's only money check is `data.paymentWarning` — **it never reads `chargedMinor`** — so `moneyFailed` was false and the green toast fired.

**And the refusal IS on the record.** The audit row written by that very tap:

```
2026-08-13T09:18:42.878673+00:00  mark_paid  0  {"method":null,"charged_minor":0,"ledger_failed":false}
```

🔴 **`charged_minor: 0`.** Compare the tap that actually worked, on 12 August: `mark_paid 600 {"charged_minor":600}`.

**And the card was right to look unchanged** — nothing changed. `await fetchAll()` re-read the same state, so the button stayed. **The operator's eye and the toast disagreed, and the toast was wrong.**

---

## 1. `mark_paid`, end to end

**Source: QUOTED throughout.**

### The tap — `components/dashboard/OrderCard.tsx`

```tsx
        label={effectivePartPaid ? `Mark ${money(balance.balanceMinor)} paid` : 'Mark paid'}
```
⚠️ **Order 18 is `refund_due`, so it is neither `isPaid` nor `isPartPaid`, and the button renders as plain "Mark paid".** `isPaid` tests `'paid' | 'refunded' | 'part_refunded'`; `refund_due` is in none of them.

### The request — `app/dashboard/[token]/page.tsx`

```ts
      const result=await gatedAction({url:'/api/dashboard/action',body:{token,pin,action,order_key:orderKey,…},kind:'status',order_key:orderKey,online:isOnline(),…})
```

### The route — `app/api/dashboard/action/route.ts:1963-2040`

```ts
    if (action === 'mark_paid' || action === 'mark_paid_cash' || action === 'mark_paid_card') {
      if (await hasHeldAuthorisation(supabase, orderKey)) {              // GUARD 1
        … return NextResponse.json({ error: '…charge them twice…' }, { status: 409 })
      }
      let paymentWarning: string | null = null
      let charged = 0
      const method: 'cash' | 'card' | null = …
      try {
        const res = await recordCollectionPayment(supabase, { orderKey, truckId: truck.id, createdBy: actor.actorId, method })
        charged = res.chargedMinor
      } catch (err) {                                                     // GUARD 2
        console.error(`[mark_paid] LEDGER WRITE FAILED …`)
        paymentWarning = 'Payment could not be recorded — the takings figure for this order may be wrong until it is repaired.'
      }
      await logAction(supabase, {
        action, truckId: truck.id, orderKey, amountMinor: charged,
        beforeState: { payment: 'outstanding' },
        afterState: { charged_minor: charged, method, ledger_failed: paymentWarning !== null },
        actor, source: actorSource,
      })
      return NextResponse.json({ success: true, chargedMinor: charged, ...(paymentWarning ? { paymentWarning } : {}) })
    }
```

### The third guard, inside `recordCollectionPayment` — `lib/payments/ledger.ts`

```ts
  const [order, rows] = await Promise.all([readOrder(…), readLedger(…)])
  const before = getOrderBalance(order, rows)

  // Nothing outstanding (already settled, or a replay whose row is present): recalc so the cache is
  // correct and return without inserting a zero/negative row the CHECK would reject anyway.
  if (before.balanceMinor <= 0) {
    const balance = await recalcOrderPayment(supabase, opts.orderKey)
    return { inserted: false, balance, chargedMinor: 0 }
  }
```

### 🔴 What happened for order 18

| Step | Outcome |
|---|---|
| Guard 1 — held authorisation | ❌ **did not fire.** The hold was captured by the sweep, so `readHeldAuthorisations` excludes it |
| 🔴 **Guard 3 — `before.balanceMinor <= 0`** | ✅ **FIRED.** `-600`. **Returned `chargedMinor: 0`, no `throw`, no row** |
| Guard 2 — the `catch` | ❌ never reached — **there was no error to catch** |
| Database writes | 🔴 **ONE: `recalcOrderPayment`**, which rewrote `payment_status` to the same `refund_due` and moved `updated_at` to `09:18:42.812`. **Plus the `mark_paid` audit row.** No `order_payments` row |
| The response | 🔴 **`{ success: true, chargedMinor: 0 }`** — and **no `paymentWarning`**, because nothing failed |

---

## 2. Order 18's live rows, and which guard refused

**Source: QUOTED**, read live.

```
ORDER 18 : {"id":"18","status":"confirmed","payment_status":"refund_due","amount_paid":12,
            "total":6,"total_minor":600,"paid_at":null,"collected_at":null,
            "updated_at":"2026-08-13T09:18:42.812219+00:00"}

LEDGER   :
  2026-08-12T21:14:05.431Z  in_person_other  charge 600p succeeded livemode=true   collect:3a621e2f-…:0:600
  2026-08-12T21:15:15.490Z  online           charge 600p succeeded livemode=false  stripe_pi:pi_3U3fB5…

DRAFT    : {"payment_intent_id":"pi_3U3fB52fB4PPCw2D1VD1opZI",
            "promoted_at":"2026-08-12T16:39:30.604+00:00","authorization_cancelled_at":null}
```

### The arithmetic that refused

`getOrderBalance` over those two rows — both `isLiveRow` (one `livemode: true`, one test-online on a test account):

```
chargeMinor  = 600 + 600 = 1200
refundMinor  = 0
paidMinor    = 1200
totalMinor   = 600
balanceMinor = 600 - 1200 = -600      ->  -600 <= 0  ->  🔴 SHORT-CIRCUIT
```

# 🔴 THE GUARD THAT REFUSED IS `if (before.balanceMinor <= 0)` IN `recordCollectionPayment`.

**It is the correct refusal.** The order is over-paid by £6.00; booking a third charge would deepen it. ⚠️ **And it is not a guard written for this case** — its own comment says *"already settled, or a replay whose row is present"*. **Over-payment falls into it by arithmetic, not by design**, which is why it has no distinct outcome and no distinct message.

⚠️ **Guard 1 correctly stood down.** The draft still has `payment_intent_id` and `authorization_cancelled_at: null`, but a `stripe_pi:` ledger row exists, so `readHeldAuthorisations` excludes it. **Not held — captured.**

---

## 3. 🔴 THE CENTRAL QUESTION: what the toast branches on

**Source: QUOTED**, `app/dashboard/[token]/page.tsx`:

```ts
      const data=result.data??{}; if(!result.ok)throw new Error(data.error)
      …
      const moneyFailed=!!data.paymentWarning
      …
      if(moneyFailed){
        showToast(
          `⚠ Order #${num} — PAYMENT NOT RECORDED. ${action==='collected'?'The order completed':'The order was saved'}; the money did not.`,
          'error',
          {duration:20000,action:{label:'Record payment',run:()=>doAction('mark_paid',orderKey)}},
        )
      }else if(action==='mark_paid'){
        showToast(`Order #${num} marked paid`,'success',{duration:7000,action:{label:'↩ Undo',run:()=>doAction('undo_mark_paid',orderKey)}})
      }
```

| Question | Answer |
|---|---|
| **Does it read the response body?** | ⚠️ **Partly — exactly one field.** `data.paymentWarning`, and `data.error` only when `!result.ok` |
| 🔴 **Does it read `chargedMinor`?** | ❌ **NO.** `grep -rn "chargedMinor" app components` outside `app/api/` returns **ZERO hits.** The number is in the response and nothing anywhere consumes it |
| **Does it show success on any 2xx?** | ✅ **Effectively yes.** `result.ok` plus the absence of one optional string is the whole test |

### The exact exchange for order 18

```
server -> { "success": true, "chargedMinor": 0 }          <- a refusal, published as a number
client -> moneyFailed = !!undefined = false
       -> showToast("Order #18 marked paid", "success", { action: "↩ Undo" })
```

🔴 **AND IT OFFERED AN UNDO FOR SOMETHING THAT DID NOT HAPPEN.** Tapping it fires `undo_mark_paid`, which would delete the **12 August in-person row** — a real £6.00 payment — as the "undo" of a tap that recorded nothing. **A false success toast with a destructive undo attached is worse than a silent no-op.**

### 🔴 It is the same pattern as `reversal: 'none'`, and that one is still here

```ts
      return NextResponse.json({ success: true })      // undo_mark_paid, :2067
```

**`reverseCollectionPayment` returns `{ reversal: 'deleted' | 'refunded' | 'none' }` and this handler discards it entirely** — not even published in the body this time. `grep -rn "\.reversal" app components` outside `app/api/`: **zero hits.**

---

## 4. Every action that can decline inside a 2xx

**QUOTED** for each route line; the "operator is told" column is **INFERRED** from the toast chain.

| # | Action | Route | What it returns on a refusal | What the operator is told |
|---|---|---|---|---|
| 1 | 🔴 **`mark_paid` / `_cash` / `_card`** | `:2040` | `{success:true, chargedMinor:0}` | 🔴 **"Order #N marked paid"** + an Undo. **THE REPORTED BUG** |
| 2 | 🔴 **`undo_mark_paid`** | `:2067` | `{success:true}` — `reversal` **discarded at the server** | 🔴 **"Undone — payment removed"** when nothing was. **THE INCIDENT YOU REMEMBER, STILL PRESENT** |
| 3 | 🔴 **`undo_collected`** | `:605` | `{success:true, status: revertTo}` — `reversal` computed, logged, **not returned** | 🔴 **"Undone — order not collected"**, whether or not a payment row was found |
| 4 | ⚠️ **`collected`** | `:503` | `chargedMinor` **not returned at all**; only `paymentWarning` on a throw | ⚠️ **"Order #N collected"**. The status genuinely changes, so the card moves — **the money half can still be a silent no-op** (settled balance, or the new held-authorisation skip) |
| 5 | ⚠️ **`adjust_slot_+N`** | `:1780` | `{success:true, newSlot}` — 🔴 **`moveSlotBooking`'s result is discarded** | ⚠️ `Order #N adjust_slot_+10` via the fallback branch. `newSlot` is returned and **not read** (0 hits) |
| 6 | ✅ **`edit`** | `:839` | `{…, slotWarning}` | ✅ **READ** — `page.tsx:1897` shows it as an error toast |
| 7 | ✅ **`manual`** (walk-up) | `:1495` | `{…, paymentWarning}` | ✅ **READ**, via the same `moneyFailed` branch |
| 8 | ⚠️ **`send_ready_email`** | `:397` | `{success:true, skipped:'not ready'}` | ⚠️ `skipped` **never read** (0 hits). Internal deferred call, so no operator is watching |
| 9 | ⚠️ **`buzzer`** | `:1945` | `{success:true, assigned:false, lost}` | ⚠️ `assigned` and `lost` **never read** (0 hits) |
| 10 | ⚠️ **`toggle_item` / stock** | `:859`, `:1687` | echo the value that was set | ⚠️ Echo not compared to the request |

### 🔴 THE MEASUREMENT THAT MAKES THIS A CLASS, NOT THREE BUGS

```
$ grep -rn "chargedMinor|\.reversal|\.skipped|\.assigned|\.lost" app components   (excluding app/api/)
   chargedMinor  0 hits
   .reversal     0 hits
   skipped       0 hits
   assigned      0 hits
   lost          0 hits
```

**Two response fields are read by the client — `paymentWarning` and `slotWarning` — and both were added after an incident.** Every other outcome field the server publishes is dead on arrival. 🔴 **The pattern is not "some routes forgot"; it is "the client reports the transport, and only two exceptions were ever carved out."**

---

## 5. Does the optimistic UI revert?

**Source: QUOTED.** 🔴 **ONLINE THERE IS NO OPTIMISTIC PAYMENT UI AT ALL.**

```ts
  const{overlay:paymentOverlay,refresh:refreshPendingPayment}=useOfflinePaymentOverlay(paymentOrders)
```

The overlay is fed **only from the offline outbox**, and `refreshPendingPayment()` is called **only inside `if(result.queued)`**. Online, `doAction` ends with:

```ts
      await fetchAll()
```

**So the card re-renders from the server and simply does not change.** That is exactly what you saw: toast says paid, button still says "Mark paid". ⚠️ **Nothing "reverts" because nothing was ever optimistically applied.**

### The chip vanishing and returning — that is the OFFLINE overlay, and it is deliberate

**QUOTED**, `lib/native/useOfflinePaymentOverlay.ts:78-84`:

```ts
        if (snap.conflictKeys.has(key)) { next.delete(key); continue }
        const o = byKey.get(key)
        // 🔴 THE "SERVER CAUGHT UP" TEST — THE LEDGER, NOT THE STATUS. …
        if (o && entry === 'pending_paid' && o.confirmedPaid) { next.delete(key); continue }
        if (o && entry === 'pending_unpaid' && !o.confirmedPaid) { next.delete(key); continue }
        // else: drained but the ledger has not landed yet → HOLD across the drain→fetch gap.
```

**A pending-paid chip is held until `confirmedPaid` becomes true, and dropped instantly on a conflict.** So offline, a chip appearing then vanishing means **either** the server caught up (correct) **or** the op was rejected (a 409, which the conflict banner surfaces).

### 🔴 CAN THE OPERATOR TELL A REFUSAL FROM A SLOW REFRESH?

# ❌ NO, NOT ONLINE.

Both look identical: a green toast, then a card that has not moved. **The only difference is time**, and `fetchAll()` completes in well under a second, so there is no "slow refresh" to blame — **but the operator has no way to know that.** ⚠️ **Offline is better**, because a rejected op drops its chip and raises the conflict banner. **The online path has no equivalent.**

---

## 6. What an operator SHOULD see — options, not a build

**All INFERRED.**

| | Option | Cost |
|---|---|---|
| **A** | 🔴 **The client reads `chargedMinor`.** `charged === 0` on a `mark_paid` becomes an informational toast: *"Order #18 is already settled — nothing to record."* | One condition, no server change, and it fixes **the reported bug only**. Leaves rows 2-5 of §4 |
| **B** | **The server distinguishes the outcomes** — `{ success: true, outcome: 'recorded' \| 'already_settled' \| 'over_paid' }` — and the client switches on `outcome` | Correct and legible. Touches every money route, and the shape has to be agreed once |
| **C** | 🔴 **Refuse with a non-2xx** (409, like the held-authorisation guard) | Reuses machinery that already works and already produces the right toast. ⚠️ **But `mark_paid` on a settled order is not an error** — and a 409 on the offline path becomes a **conflict**, which the outbox treats as poison. **Would change replay semantics** |
| **D** | **Say what is true about the order instead**: *"Order #18 is over-paid by £6.00 — £6.00 refund due"* | The most useful sentence, because `refund_due` is exactly what this order is. Needs the balance on the response or a re-read |
| **E** | **Never show the button.** `isPaid` covers `paid \| refunded \| part_refunded` and **not `refund_due`** | ⚠️ Attacks the cause one level up. But an over-paid order still needs an operator route to fix it, so hiding the control may strand them |

⚠️ **B is the only one that closes the class rather than the instance**, and the class is what §4 shows.

---

## 7. Is a refusal recorded anywhere findable?

## ✅ YES FOR `mark_paid` — AND ONLY BECAUSE `amountMinor: charged` HAPPENS TO CARRY IT.

```
2026-08-13T09:18:42.878Z  mark_paid  0  {"method":null,"charged_minor":0,"ledger_failed":false}
```

One query separates the refusals from the real ones:
```sql
select * from action_audit_log where action like 'mark_paid%' and (after_state->>'charged_minor')::int = 0;
```

⚠️ **That is a by-product, not a design.** The row's `action` is `mark_paid` either way, `ledger_failed` is `false` either way, and nothing anywhere reads `charged_minor`. **It is discoverable only by someone who already suspects.**

### 🔴 And there is NO log line

`grep` of the `mark_paid` handler: the only `console.error` is in the `catch`, which **did not run**. **The refusal produced no console output at all** — nothing in Vercel's runtime log for that tap.

### The others

| Action | Recorded? |
|---|---|
| `mark_paid` | ⚠️ **implicitly**, via `charged_minor: 0` |
| 🔴 **`undo_mark_paid` refusing** | ❌ **INVISIBLE.** `reverseCollectionPayment`'s `beforeDelete` callback — which writes the audit row — **is only invoked when there is a row to delete.** A `reversal: 'none'` writes **no audit row, no log line, and returns `{success:true}`** |
| `undo_collected` | ⚠️ audit row written, `reversal` in `after_state` — **findable**, not surfaced |
| `collected` | ⚠️ `charged_minor` in the audit row, same by-product |
| `adjust_slot` | ❌ **not established** whether a discarded `moveSlotBooking` failure is logged |

# 🔴 SAID PLAINLY: `undo_mark_paid` REFUSING IS COMPLETELY INVISIBLE. No row, no log, no response field, and a toast that says it worked.

---

## 8. The earlier "buttons appearing not to action" incident

## ⚠️ YES — THIS PATTERN EXPLAINS THAT SYMPTOM EXACTLY, BUT I CANNOT TIE IT TO THAT INCIDENT.

**What I rely on, QUOTED:**

1. **Online there is no optimistic UI** — `doAction` ends in `await fetchAll()`. **A server that changes nothing produces a card that changes nothing**, which is precisely "the button did not action".
2. **The toast fires regardless** — `moneyFailed` is the only money test, so a refusal is indistinguishable from a success on screen.
3. **It reaches a real population.** `mark_paid` on an order already `paid`, `refunded` or `refund_due` all give `balanceMinor <= 0` and all take the short-circuit. ⚠️ **And `refund_due` renders the plain "Mark paid" button**, because `isPaid` does not include it — **so the product invites the tap that cannot work.**
4. **`undo_mark_paid` on an order with no in-person row** does the same with no trace at all.

**NOT ESTABLISHED:** which button, which order, or which day the earlier incident involved. **No record survives that could tie it to this** — precisely because §7 shows a refusal on these paths leaves none. ⚠️ **The absence of evidence is itself the finding**: if it was this, there would be nothing to find, and there is nothing to find.

---

# Quoted vs inferred

| § | Status |
|---|---|
| 1 | **QUOTED** — the button, the request, the route, all three guards, the response. The order-18 walk is **INFERRED** from the live rows and **corroborated** by the `charged_minor: 0` audit row |
| 2 | **QUOTED** — every row read live. The arithmetic is **INFERRED** from `getOrderBalance`, quoted |
| 3 | **QUOTED** — the toast chain and the zero-hit greps |
| 4 | **QUOTED** for every route line and every grep count; the operator-facing column is **INFERRED** from the toast chain |
| 5 | **QUOTED** — the overlay hook and `await fetchAll()` |
| 6 | **INFERRED** throughout. Nothing built |
| 7 | **QUOTED** — the audit row, and the absence of a `console` call on the taken path |
| 8 | **INFERRED**; each supporting fact **QUOTED**. The link to the incident is **not established** |

# Not established

- **Which control the earlier incident involved.** §8.
- **Whether a failed `moveSlotBooking` inside `adjust_slot` is logged**; I did not trace it.
- **How many live orders are currently in a state where `mark_paid` would silently no-op.** I read only order 18. The query is `payment_status in ('paid','refunded','part_refunded','refund_due')` on active orders.

# Standing

- 🔴 **Order 18 is still over-paid by £6.00** and `refund_due` still has no consumer. **The tap you made was the product inviting you to make it worse.**
- 🔴 **The success toast for `mark_paid` offers an Undo that would delete a real £6.00 payment** taken on 12 August. That is the most dangerous single consequence in this report.
- ⚠️ **`refund_due` is absent from `OrderCard`'s `isPaid`**, so the button renders. Same omission as `part_refunded` had before yesterday.
