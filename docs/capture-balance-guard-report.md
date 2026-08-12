# Capture asks the right question now

**Date:** 12 August 2026
**BUILD.** No `next dev`, no `next build`. Nothing committed. Nothing deployed.
**🔴 ONE MIGRATION FOR YOU TO RUN:** `supabase/migrations/20260816_find_stranded_authorisations_settled.sql`
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 THE HEADLINE, RUN AGAINST ORDERS 18 AND 19's EXACT SEQUENCE

```
promoted -> order #38 status=pending, hold live
marked paid in person: charged=650p -> payment_status=paid balance=0p
stripe BEFORE capture : requires_capture capturable=650 received=0
🔴 captureOnConfirmation -> {"status":"not_owed","reason":"settled","paidMinor":650,"balanceMinor":0,"authorisedMinor":650}
stripe AFTER  capture : requires_capture capturable=650 received=0
ledger rows: [{"channel":"in_person_other","amount_minor":650,"idempotency_key":"collect:1ff71d95-…:0:650"}]
audit      : [{"action":"capture_not_owed", … "reason":"settled" … }]
```

**Same order, same hold, same 70-second window — and the second charge does not happen.** The hold is byte-for-byte unchanged at Stripe, one ledger row exists instead of two, and the near-miss is on the record.

| # | Change | File |
|---|---|---|
| 1 | 🔴 The pre-check asks the **balance**, via `getOrderBalance` | `lib/payments/capture.ts` + one new read-only export in `ledger.ts` |
| 2 | A refusal with a reason: `not_owed` / `settled` \| `part_paid`, recorded as `capture_not_owed` | `lib/payments/capture.ts` |
| 3 | The sweep's predicate excludes settled orders | 🔴 **migration `20260816_…`** |
| 4 | `mark_paid` refuses a held order **409**; `collected` completes but books nothing | `app/api/dashboard/action/route.ts` |
| 5 | Part-paid distinguished from settled, and protected rather than broken | §5 |
| Census | ✅ **NO FILE GAINED A CHARACTER CLASS.** Five distinct sets, all identical |

---

## 1. Capture asks the right question

**The new step 2b**, `lib/payments/capture.ts`:

```ts
    let balance: OrderBalance
    try {
      balance = await readOrderBalance(supabase, args.orderKey)
    } catch (err) {
      // 🔴 "I COULD NOT TELL" IS A REFUSAL, NEVER A ZERO. readOrderBalance throws on a missing order, a
      // failed read and a scope violation. Capturing on any of those would be moving money on a guess,
      // and the guess that costs a double charge is exactly the one being fixed. The sweep retries.
      …
      return { status: 'failed', paymentIntentId: piId, detail: `balance unavailable: ${message}` }
    }

    const authorisedMinor = typeof draft.total_minor === 'number' ? draft.total_minor : balance.balanceMinor

    if (balance.balanceMinor <= 0) { … return { status: 'not_owed', reason: 'settled', … } }
    if (balance.balanceMinor < authorisedMinor) { … return { status: 'not_owed', reason: 'part_paid', … } }
```

### 🔴 The one new export, and why it is not a hand-rolled select

`lib/payments/ledger.ts`:

```ts
export async function readOrderBalance(supabase: SupabaseClient, orderKey: string): Promise<OrderBalance> {
  const [order, rows] = await Promise.all([readOrder(supabase, orderKey), readLedger(supabase, orderKey)])
  return getOrderBalance(order, rows)
}
```

**`recalcOrderPayment` without the write-back.** Its comment states the reason plainly:

> 🔴 **BECAUSE `readLedger` IS NOT A SELECT, IT IS FOUR SAFETY PROPERTIES.** The `order_key` scope filter and its runtime assertion (the 7 August incident), the widened mode filter, and `annotateTestAccountRows` — without which `isLiveRow`'s arm (b) has no `account_is_test` to read and **every sandbox card payment silently stops counting**. A caller that writes its own query gets none of that and looks correct.

✅ **`getOrderBalance`'s arithmetic and return type are untouched.** ✅ **No idempotency key changed.** ✅ **No CHECK constraint changed.** `recalcOrderPayment` keeps its own body — two reads are duplicated on purpose rather than editing a function that writes `payment_status` on the hatch.

### Ordering matters, and it preserves `already`

Step **2a** still does the single-key `stripe_pi:` lookup and returns `already` first, so nothing that already treated `already` as success changes. Step **2b** runs only when this intent has not been captured. The old check is kept and correctly labelled:

> ⚠️ **THIS IS A NARROW QUESTION AND IT IS NOT THE ONE THAT MATTERS MOST.** It answers "did WE capture THIS intent", nothing more. Step 2b is the one that asks what the order owes.

---

## 2. What capture returns

**A refusal, not an error and not a success:**

```ts
  | {
      status: 'not_owed'
      paymentIntentId: string
      reason: 'settled' | 'part_paid'
      paidMinor: number
      balanceMinor: number
      authorisedMinor: number
    }
```

| Field | Why it is on the result |
|---|---|
| `reason` | `settled` = nothing owed; `part_paid` = something owed, but less than the hold |
| `paidMinor` / `balanceMinor` | from `getOrderBalance`, so the caller does not re-derive |
| `authorisedMinor` | what a capture *would* have taken — the difference is the overcharge avoided |

### 🔴 And it is recorded, so the near-miss is visible

A new audit action, deliberately **distinct** from `capture_failed`:

```ts
  await logAction(supabase, {
    action: 'capture_not_owed',
    …
    afterState: {
      reason, captured: false,
      paid_minor: balance.paidMinor, balance_minor: balance.balanceMinor, payment_status: balance.status,
      meaning: reason === 'settled'
        ? 'this order was already paid by other means; capturing would have charged the customer twice'
        : 'this order is part paid; capturing the whole hold would have overcharged',
      hold: 'left live and uncaptured — release or claim it by hand',
    },
```

**One query separates "capture is broken" from "capture correctly declined":**
```sql
select * from action_audit_log where action = 'capture_not_owed' order by created_at desc;
```

Plus a `🔴` console line naming the amounts. **Nothing is released and nothing is taken** — the hold is left exactly as found, because choosing between "capture the remainder" and "give it back" is a human's call and releasing money is irreversible.

---

## 3. The sweep's predicate — layer two

**`supabase/migrations/20260816_find_stranded_authorisations_settled.sql`**, one clause added:

```sql
    -- 🔴 AND IT STILL OWES MONEY. Added 16 August 2026 after orders 18 and 19 were each charged twice.
    -- 'paid' means somebody already settled it; 'refund_due' means somebody settled it TWICE and this
    -- function must not make a third attempt.
    and coalesce(o.payment_status, 'unpaid') not in ('paid', 'refund_due')
```

### Why `payment_status` and not a SQL sum

> 🔴 **`orders.payment_status` IS NOT A SECOND OPINION.** It is written by exactly one function — `recalcOrderPayment`, *"the ONLY writer of payment_status/amount_paid"* — from `getOrderBalance`. So this clause **cannot drift from the balance: the balance is what writes it.**
>
> ⚠️ The alternative was reproducing `isLiveRow` in SQL — `livemode`, `channel`, and the `account_is_test` annotation only `ledger.ts` knows how to compute — in a second language, where it would drift the first time either changed.

⚠️ **Its cost, stated:** the cache can be stale if a recalc failed. **Acceptable because this is the second of two layers** — §1 reads the live balance before every capture, so a stale cache costs a wasted row in the result set, never a double charge.

✅ **Additive and reversible.** `create or replace` on one read-only function; re-applying `20260815` restores the previous definition exactly. Deploy order does not matter — the TypeScript guard is complete on its own.

⚠️ **`'collected'` stays in the allow-list, and the header says why:** the 12 August incident did not come through it — both orders were `'confirmed'`, and `mark_paid` never writes status. Narrowing it would have prevented nothing and would blind the sweep to an order handed over unpaid.

---

## 4. 🔴 THE MISSING SERVER-SIDE GUARD

### `mark_paid` — fails **closed**, 409

```ts
      if (await hasHeldAuthorisation(supabase, orderKey)) {
        console.warn(`[${action}] REFUSED for order_key=${orderKey} … Recording an in-person payment here is the double-charge of 12 August.`)
        await logAction(supabase, { action: `${action}_refused_card_held`, … })
        return NextResponse.json({
          error: 'This customer has already paid by card. Their card is authorised for this order and is '
               + 'charged automatically when you confirm it, so taking payment here would charge them '
               + 'twice. Nothing has been recorded.',
        }, { status: 409 })
      }
```

**What the operator sees — verbatim, from the live 409:**

> **This customer has already paid by card. Their card is authorised for this order and is charged automatically when you confirm it, so taking payment here would charge them twice. Nothing has been recorded.**

⚠️ **THIS ONE FAILS CLOSED, UNLIKE EVERY OTHER MONEY WRITE IN THIS FILE.** The others fail open because refusing them strands an operator at the hatch with cash in hand. **Refusing here strands nobody:** the money has not been taken, the card already covers the order, and the correct action is to do nothing. Fail-open is for *recording* money that has already moved; this is *preventing* money from moving twice.

It uses `hasHeldAuthorisation` — **the same resolver the CARD HELD chip reads**, so the button and the guard cannot disagree.

### 🔴 AND `collected` TOO, WHICH THE BRIEF DID NOT NAME — DECLARED

One-press completion calls the **same** `recordCollectionPayment` for the **same** outstanding balance, so a held order double-charges there as well. Refusing it outright would strand an operator mid-service, so:

```ts
      const heldOnCollect = await hasHeldAuthorisation(supabase, orderKey)
      …
      const res = heldOnCollect
        ? { chargedMinor: 0 }
        : await recordCollectionPayment(supabase, { orderKey, truckId: truck.id, createdBy: actor.actorId })
```

**The order completes; only the money write is skipped.** Verified: `POST {action:collected} -> 200`, `order status=collected`, `ledger rows=[]`.

⚠️ **This is one branch beyond instruction 4 and I am declaring it.** Leaving it would have meant a one-press truck double-charging on its very next order — the same defect, the same money, reachable from the same board.

---

## 5. The part-paid case — protected, not broken

`part_paid` is a real state in the CHECK constraint and the guard distinguishes it by **comparing the outstanding balance to the amount the hold is for**:

| Situation | `balanceMinor` vs `authorisedMinor` | Outcome |
|---|---|---|
| Nothing paid (**the ordinary card order**) | equal | ✅ **capture proceeds, unchanged** |
| Settled at the hatch | `0` | ❌ `not_owed` / `settled` |
| 🔴 **Part paid** | `0 < balance < authorised` | ❌ `not_owed` / `part_paid` |
| Order edited upward after authorising | `balance > authorised` | ✅ capture proceeds; a balance remains |

### 🔴 Why part-paid is a refusal and not a capture

**The hold is for the whole order.** Taking it against an order that is £2 paid overcharges by exactly £2 — precisely the failure this build exists to end, arrived at from the other direction. Stripe *can* capture a lesser amount, but **this build does not do partial capture**, and inventing it inside a guard would be the wrong place to decide it.

**Measured** — a £6.50 order with £2.00 taken in cash:
```
after £2.00 in person -> {"paidMinor":200,"balanceMinor":450,"status":"part_paid"}   (hold is for 650p)
🔴 captureOnConfirmation -> {"status":"not_owed","reason":"part_paid","paidMinor":200,"balanceMinor":450,"authorisedMinor":650}
stripe AFTER capture : requires_capture capturable=650 received=0
```

**Nothing is broken: the £4.50 is still owed, the hold is still live, and the state is on the record.** The operator collects the remainder at the hatch, or the hold is released. ⚠️ **Partial capture is the fuller answer and is not built** — that decision is yours, and it is a money change, not a guard.

---

## 6. All four sites inherit it

**QUOTED.** `grep -rn "captureOnConfirmation(supabase" app lib`:

```
app/api/orders/submit/route.ts:1078          await captureOnConfirmation(supabase, {          trigger: 'auto_accept'
app/api/dashboard/action/route.ts:246        const captureResult = await captureOnConfirmation(supabase, { … trigger: 'confirm' })
app/api/dashboard/action/route.ts:1730       const adjustCapture  = await captureOnConfirmation(supabase, { … trigger: 'time_adjust' })
lib/payments/promote-draft.ts:372            captureResult = await captureOnConfirmation(supabase, {         trigger: 'promote_auto_accept' })
lib/payments/stranded-authorisations.ts:165  const cap = await captureOnConfirmation(supabase, {            trigger: 'stranded_sweep' })
```

| Site | Trigger | Inherits step 2b? |
|---|---|---|
| 1 · pay-at-hatch auto-accept | `auto_accept` | ✅ |
| 2 · operator confirm | `confirm` | ✅ **and proved live in (e)** |
| 3 · quick-time-adjust | `time_adjust` | ✅ |
| 4 · card auto-accept at promotion | `promote_auto_accept` | ✅ |
| — · the sweep (a backstop, not a confirmation) | `stranded_sweep` | ✅ **and proved live in (a)** |

🔴 **There is no other way to capture in this codebase.** `grep -rn "paymentIntents.capture"` returns exactly one hit, inside `captureOnConfirmation` itself. **Fixing it there is what makes all five inherit; a guard in the sweep would have left the other four blind, and the next report would have been about one of those.**

---

# VERIFICATION

**Method:** the real modules through `jiti`, the real database, the real Stripe sandbox on `acct_1U30w22fB4PPCw2D`, and the real `POST` export of `app/api/dashboard/action/route.ts` with the truck's own dashboard token. Brevo intercepted at the `fetch` boundary.

## 🔴 WRITES DECLARED

| Write | Cleanup |
|---|---|
| 5 `order_drafts` rows | ✅ deleted |
| 5 `orders` rows (#38-#42) | ✅ deleted |
| 4 `order_payments` rows | ✅ deleted |
| 5 sandbox PaymentIntents | ⚠️ **NOT reversible.** 1 captured (case b), 4 cancelled in cleanup |
| 5 display numbers | ⚠️ **NOT reversible.** Next real order is #43 |
| `action_audit_log` rows (`capture_not_owed` ×3, `mark_paid_refused_card_held`, `collected`) | ⚠️ **NOT deleted, on purpose.** Append-only table |
| **Emails sent** | ✅ **ZERO** — 6 intercepted, none delivered |

```
residual drafts/orders/payments: 0/0/0
```

## (a) Paid in person, hold live — orders 18 and 19's exact sequence

```
marked paid in person: charged=650p -> payment_status=paid balance=0p
stripe BEFORE capture : requires_capture capturable=650 received=0
🔴 captureOnConfirmation -> {"status":"not_owed","reason":"settled","paidMinor":650,"balanceMinor":0,"authorisedMinor":650}
stripe AFTER  capture : requires_capture capturable=650 received=0
ledger rows: [{"channel":"in_person_other","amount_minor":650,"idempotency_key":"collect:1ff71d95-…:0:650"}]
audit      : [{"action":"capture_not_owed", "reason":"settled", "balance_minor":0, "payment_status":"paid",
               "hold":"left live and uncaptured — release or claim it by hand"}]
```

✅ **Refused.** ✅ **The hold is untouched — `capturable=650`, `received=0`, before and after.** ✅ **One ledger row, not two.** ✅ **Recorded.**

## (b) Nothing paid — capture proceeds as before

```
readOrderBalance -> {"paidMinor":0,"balanceMinor":650,"status":"unpaid"}
captureOnConfirmation -> {"status":"captured","paymentIntentId":"pi_3U3kYF…","amountMinor":650}
stripe: succeeded capturable=0 received=650
ledger rows: [{"channel":"online","amount_minor":650,"idempotency_key":"stripe_pi:pi_3U3kYF…"}]
```

✅ **`requires_capture` → `succeeded`.** The ordinary path is unchanged: `balanceMinor === authorisedMinor`, so neither refusal fires.

## (c) Part paid

```
after £2.00 in person -> {"paidMinor":200,"balanceMinor":450,"status":"part_paid"}   (hold is for 650p)
🔴 captureOnConfirmation -> {"status":"not_owed","reason":"part_paid","paidMinor":200,"balanceMinor":450,"authorisedMinor":650}
stripe AFTER capture : requires_capture capturable=650 received=0
audit : [{"action":"capture_not_owed","reason":"part_paid","meaning":"this order is part paid; capturing the whole hold would have overcharged"}]
```

✅ **Refused before overcharging by £2.00.** The £4.50 remains owed and the hold remains live.

## (d) `mark_paid` refused server-side

```
🔴 POST {action:mark_paid} -> 409
   operator sees: "This customer has already paid by card. Their card is authorised for this order and is
                   charged automatically when you confirm it, so taking payment here would charge them
                   twice. Nothing has been recorded."
ledger rows after the refusal: []  (must be [])
stripe: requires_capture capturable=650 received=0
```

and the one-press completion on the same order:

```
[collected] … has a LIVE CARD HOLD — completing the order but booking NO in-person payment.
POST {action:collected} -> 200 {"success":true,"status":"collected"}
   order status=collected   ledger rows=[]  (completed, nothing charged)
audit : ["mark_paid_refused_card_held","collected"]
```

✅ **Nothing recorded, hold untouched, and the refusal is auditable.** ✅ **The operator can still complete the order.**

## (e) The sites inherit it — driven through the real confirm route

```
order #42 promoted pending, then paid in person. Now drive the REAL confirm route:
[capture] 🔴 REFUSING TO CAPTURE … (confirm): the order is ALREADY SETTLED — paid_minor=650, balance=0, status=paid.
POST {action:confirm} -> 200 {"success":true,"status":"confirmed"}
stripe after confirm : requires_capture capturable=650 received=0
ledger rows: [{"channel":"in_person_other","amount_minor":650,"idempotency_key":"collect:42e2ff71-…:0:650"}]
audit      : ["capture_not_owed"]
```

🔴 **The confirmation still succeeds (200, `status: 'confirmed'`) and the capture refuses.** That separation is the point: confirmation is fulfilment, capture is money, and the order must never fail to reach the kitchen because money did not move.

## Tooling

```
$ npx tsc --noEmit  -> clean
$ npx eslint <the five files>  -> 20 problems, all pre-existing `any`/unused in action/route.ts
```
⚠️ tsc-clean is not verification and is not offered as any. The evidence above is real rows and real Stripe.

---

# 🔴 NON-ASCII CENSUS

| File | Before | After | Distinct set |
|---|---|---|---|
| `lib/payments/ledger.ts` | 1067 / **12** | 1107 / **12** | `£ § × Σ — • → − ─ ⚠ 🔴 ️` **identical** |
| `lib/payments/capture.ts` | 527 / **6** | 642 / **6** | `— … ─ ⚠ 🔴 ️` **identical** |
| `lib/payments/stranded-authorisations.ts` | 294 / **7** | 299 / **7** | `£ — • ─ ⚠ 🔴 ️` **identical** |
| `lib/payments/email-payment-state.ts` | 217 / **5** | 224 / **5** | `— ─ ⚠ 🔴 ️` **identical** |
| `app/api/dashboard/action/route.ts` | 2778 / **16** | 2826 / **16** | 16 characters, **identical** |

✅ **NO FILE GAINED A CHARACTER CLASS IT DID NOT ALREADY CONTAIN.**

**New file:**

| File | Total | Distinct |
|---|---|---|
| `supabase/migrations/20260816_find_stranded_authorisations_settled.sql` | 205 | 7 — `£ — ─ ⚠ ✅ 🔴 ️` |

---

# 🔴 WHAT YOU HAVE TO DO

```sql
-- supabase/migrations/20260816_find_stranded_authorisations_settled.sql
```
✅ **Additive and reversible.** One `create or replace` on a read-only function; re-applying `20260815` restores it exactly.

**Verify after applying:**
```sql
select * from find_stranded_authorisations(0, 100);
  -- expect NO row whose order reads payment_status 'paid' or 'refund_due'
select o.id, o.payment_status from orders o
 where o.order_key in (select order_key from find_stranded_authorisations(0, 500));
  -- expect only 'unpaid' and 'part_paid'
```

⚠️ **Order does not matter.** The TypeScript guard is complete on its own; this narrows what the sweep even looks at.

---

# Declared beyond the brief, and standing

- ⚠️ **`collected` was guarded as well as `mark_paid`** — §4. Same money, same route, and leaving it would have double-charged on the next one-press order.
- ⚠️ **`email-payment-state.ts` gained one `switch` case**, compelled by the exhaustive switch when `CaptureResult` gained a variant. It returns `null` (defer to the database), because the one mapping that would be actively harmful is `'hatch'` — *"Pay at the truck on collection"* to somebody who has just paid at the truck. **No other email behaviour changed.**
- 🔴 **Orders 18 and 19 are still double-charged and this codebase still cannot refund them.** Direct charges: £6.00 on `pi_3U3fB52fB4PPCw2D1VD1opZI` and £6.50 on `pi_3U3iwC2fB4PPCw2D0DwOxtVU`, from the truck's own Stripe Dashboard. Sandbox money.
- ⚠️ **`refund_due` is still a detection with no consumer.** The ledger flags it; nothing acts on it. Unchanged by this work.
- ⚠️ **Partial capture is not built.** A part-paid order now refuses instead of overcharging, which is safe but not complete — the hold sits until somebody resolves it or Stripe expires it.
- ⚠️ **A `capture_not_owed` row is written on every sweep pass** for an unresolved order, unlike `capture_missing` which is deduplicated. Rare by construction, but a permanently unresolved order will accumulate one every 15 minutes.
