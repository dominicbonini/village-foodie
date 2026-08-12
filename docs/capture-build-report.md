# Capture on confirmation

**Date:** 13 August 2026
**BUILD. One new file, two edited. NO MIGRATION NEEDED and none written. No `next dev`, no `next build`. Nothing committed, nothing deployed.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# ✅ WHAT NOW HOLDS

**A confirmed order captures, whatever route it took.** Proved end to end against real Stripe: `requires_capture -> succeeded`, one ledger row, order reads `paid`.

| Verification | Result |
|---|---|
| (a) Capture on confirmation | ✅ **PASS** — intent `succeeded`, **1** ledger row, `payment_status: paid`, `amount_paid: 6` |
| (b) Idempotency | ✅ **PASS** — second call `already` in **53ms**, no Stripe call, still one row |
| (c) Pay-at-hatch | ✅ **PASS** — `none` in **23ms**, one indexed read, no Stripe call |
| (d) Capture fails | ✅ **PASS** — `expired`, order **still confirmed**, no ledger row, audit row written |

🔴 **NO MIGRATION.** The authorisation is found by primary-key lookup on `order_drafts`, and a failed capture is recorded in the existing `action_audit_log`.

---

## 1. The capture function

**`lib/payments/capture.ts`** — `captureOnConfirmation(supabase, { orderKey, truckId, trigger })`.

### 🔴 IDEMPOTENT ON THE INTENT ID, AT THREE LAYERS

```
//   1. A ledger pre-check on `stripe_pi:<id>` — a second call returns `already` WITHOUT touching Stripe.
//   2. Stripe itself refuses to capture twice; that refusal is recognised and treated as success.
//   3. `order_payments_idempotency_key_uidx` makes a duplicate insert a silent no-op (recordPaymentEvent
//      already treats 23505 that way).
```

**Layer 1, quoted:**
```ts
    const idempotencyKey = onlinePaymentIdempotencyKey(piId)
    const { data: existing } = await supabase
      .from('order_payments')
      .select('id')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()
    if (existing) return { status: 'already', paymentIntentId: piId }
```

**Layer 2** — `ALREADY_CAPTURED` is recognised and **falls through to the ledger write**, so a first attempt that captured and then failed to record still gets its row on the retry.

⚠️ **AND THE WEBHOOK CONVERGES ON THE SAME KEY.** Capturing makes Stripe emit `payment_intent.succeeded`, which the existing webhook branch handles with `recordOnlineCardPayment` under the identical key — whichever lands second is a 23505 no-op. **The webhook is unchanged and becomes the backstop for a capture whose own ledger write failed.**

---

## 2. The call sites, and why there is no fifth

| # | Site | File : line | Trigger |
|---|---|---|---|
| **1** | 🔴 **Auto-accept** — inline after `place_order_atomic` | `app/api/orders/submit/route.ts:1058` | `'auto_accept'` |
| **2** | 🔴 **Operator confirm — AND every offline replay** | `app/api/dashboard/action/route.ts:221` | `'confirm'` |
| **3** | 🔴 **Quick-time-adjust** | `app/api/dashboard/action/route.ts:1663` | `'time_adjust'` |
| **4** | **Offline replay of confirm** | ✅ **covered by site 2** — see below |

**Site 1:**
```ts
    if (autoAccepted) {
      await captureOnConfirmation(supabase, {
        orderKey: order.order_key, truckId: resolvedTruckId, trigger: 'auto_accept',
      })
    }
```
🔴 **Gated on `autoAccepted`, which IS the confirmation.** Auto-accept writes `'confirmed'` inside the RPC, so there is no separate write to hook. **An order auto-accept declined stays `pending` and UNCAPTURED**, and captures later at site 2 or 3.

**Site 2:**
```ts
      await captureOnConfirmation(supabase, { orderKey, truckId: truck.id, trigger: 'confirm' })
```

**Site 3:**
```ts
      await captureOnConfirmation(supabase, { orderKey, truckId: truck.id, trigger: 'time_adjust' })
```

### 🔴 WHY SITE 4 NEEDS NO SEPARATE CALL

**The native outbox replays a queued confirm as the same `action: 'confirm'`.** The only difference is the `expected_from` guard at the top of the route (`:207-209`) — **there is no separate replay handler**, so site 2's call covers it, including a replay landing hours later where the hold has since expired (reported as `expired`, never as a capture).

### 🔴 HOW I SATISFIED MYSELF THERE IS NO FIFTH

**An exhaustive grep for every write of `status: 'confirmed'` across `app/`, `lib/`, `components/`:**

| Hit | Is it a confirmation site? |
|---|---|
| `action/route.ts:218` — `confirm` | ✅ **YES — site 2** |
| `action/route.ts:1649` — quick-time-adjust | ✅ **YES — site 3** |
| `submit/route.ts:986` — `const status = autoAccepted ? 'confirmed' : 'pending'` | ✅ **YES — site 1** |
| ⚠️ `action/route.ts:368` — **`undo_ready`** (ready → confirmed) | ❌ **NO, and this is the one worth naming.** It is a REVERT, not a first confirmation: `Ready` is only offered on an already-confirmed order, so the order captured at its original confirmation. A call here would be a `status: 'already'` no-op. **Left out deliberately, not overlooked** |
| `action/route.ts:1199` — the walk-up INSERT | ❌ **NO.** A walk-up has no draft and can never have one — drafts are created only by the card fork in submit. Capture would be `none` |
| `events/action/route.ts:102` | ❌ An **event** status, not an order |
| `seed-demo-orders.ts`, `dev/ticket-preview`, `AddOrderPanel` optimistic, `manage` page | ❌ Fixtures and client-side optimism |

✅ **Nothing else in the codebase writes an order to `confirmed`.**

⚠️ **NOTHING ELSE IN THOSE HANDLERS WAS CHANGED.** Each edit is one awaited call plus its comment, placed **after** the status write.

---

## 3. 🔴 CAPTURE CANNOT BREAK CONFIRMATION

**The function cannot throw. Every failure is a return value:**

```ts
  } catch (err) {
    // 🔴 THE OUTER NET. Nothing above may reach a caller as an exception, because every caller is a
    // confirmation and confirmation must not fail over money.
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[capture] 🔴 UNEXPECTED for order_key=${args.orderKey} (${args.trigger}): ${message}`)
    return { status: 'failed', paymentIntentId: '', detail: message }
  }
```

**And the callers ignore the value.** Each site is `await captureOnConfirmation(...)` with nothing read from it — the order is already written by the line above, and nothing downstream branches on the result.

✅ **Proved in (d):** with a dead authorisation, the order came back `{"status":"confirmed","payment_status":"unpaid"}`.

### What is recorded, so a failed capture is findable

```ts
  await logAction(supabase, {
    action: 'capture_failed',
    truckId: args.truckId,
    orderKey: args.orderKey,
    beforeState: { payment_intent_id: paymentIntentId, trigger: args.trigger },
    afterState: { kind, detail: detail.slice(0, 500), captured: false },
    actor: { actorKind: 'unknown', actorId: null, actorLabel: null },
    source: 'web',
  })
```

🔴 **ONE QUERY ANSWERS "WHICH CONFIRMED ORDERS FAILED TO CAPTURE":**
```sql
select * from action_audit_log where action = 'capture_failed' order by created_at desc;
```

**The observed row:**
```json
{"action":"capture_failed","order_key":"61440968-…",
 "after_state":{"kind":"expired","detail":"This PaymentIntent could not be captured because it has a status of canceled…","captured":false}}
```

⚠️ **`action_audit_log` was chosen because it is the codebase's existing append-only record for money actions** — the brief forbids touching the draft table and wanted no migration.
⚠️ **`actor` is `unknown`** — capture is a system action with no human behind it (auto-accept has no operator at all), and inventing one would put a false name on a money record.

### 🔴 WHAT AN OPERATOR SEES: NOTHING NEW, DELIBERATELY

**The brief forbids touching the order card, the KDS, the ticket and the email**, so a failed capture is **invisible on every operator surface**. The order shows exactly as it did before — unpaid, with a `Mark paid` button — which for a failed capture is **correct**: the customer genuinely has not paid and does owe money at the hatch.

🔴 **BUT A SUCCESSFUL CAPTURE IS NOW VISIBLE, AND THAT IS THE REAL CHANGE.** The ledger row makes `getOrderBalance` return `paid`, so the card shows **PAID**, the KDS shows **✓ paid**, and the ticket prints **PAYMENT PAID** — with no change to any of them. **The gap that remains is the one you have scoped as next: an order that is authorised but not yet confirmed still reads unpaid everywhere.**

---

## 4. 🔴 THE EXPIRED AUTHORISATION

**Recognised by pattern and reported as its own state — never as a capture:**

```ts
const GONE = /canceled|cancelled|expired|status of requires_payment_method/i
```
```ts
      } else if (GONE.test(message)) {
        console.error(
          `[capture] 🔴 AUTHORISATION GONE for order_key=${args.orderKey} pi=${piId} (${args.trigger}): ` +
          `${message}. The order IS confirmed and the customer has NOT paid — they owe ` +
          `money at the hatch. No ledger row was written.`,
        )
        await recordCaptureProblem(supabase, args, piId, 'expired', message)
        return { status: 'expired', paymentIntentId: piId, detail: message }
      }
```

**And the second case — a hold the sweep already released — is caught before Stripe is touched at all:**
```ts
    if (draft.authorization_cancelled_at) {
      console.warn(
        `[capture] order_key=${args.orderKey} confirmed (${args.trigger}) but its authorisation was ` +
        `already cancelled at ${draft.authorization_cancelled_at} — nothing to capture; the customer ` +
        `has NOT paid.`,
      )
      return { status: 'expired', paymentIntentId: draft.payment_intent_id, detail: 'authorisation already cancelled' }
    }
```

| Requirement | Held? |
|---|---|
| Does not look like a successful capture | ✅ `status: 'expired'`, **no ledger row** — proved in (d): `ledger rows: 0` |
| Does not block the confirmation | ✅ **Proved in (d)**: order `confirmed` |
| Findable afterwards | ✅ `capture_failed` audit row with `kind: 'expired'` |

---

## 5. An order with no authorisation

```ts
    const { data: draft, error: draftErr } = await supabase
      .from('order_drafts')
      .select('order_key, truck_id, payment_intent_id, authorization_cancelled_at')
      .eq('order_key', args.orderKey)
      .maybeSingle()
…
    if (!draft?.payment_intent_id) return { status: 'none' }
```

✅ **One primary-key read and out.** No Stripe client is constructed, no network call is made, nothing is logged. **Measured at 23ms** in (c).

⚠️ **A READ FAILURE IS NOT `none`.** Returning `none` on a database error would silently drop a real hold, so it is a `failed` with no intent id — findable, never mistaken for success:
```ts
    if (draftErr) {
      console.error(
        `[capture] 🔴 could not read the draft for order_key=${args.orderKey} (${args.trigger}) — ` +
        `if this order HAD an authorisation it is NOT captured:`, draftErr.message,
      )
      return { status: 'failed', paymentIntentId: '', detail: `draft read failed: ${draftErr.message}` }
    }
```

---

## 6. Is the ledger row identical to the webhook's?

✅ **YES — because it is written by the same function.** `recordOnlineCardPayment`, the one the webhook's `payment_intent.succeeded` branch calls.

**The row that was actually written, read back:**
```json
{"kind":"charge","channel":"online","amount_minor":600,"state":"succeeded",
 "external_ref":"pi_3U3iQ52fB4PPCw2D1Pb6ghGV",
 "idempotency_key":"stripe_pi:pi_3U3iQ52fB4PPCw2D1Pb6ghGV",
 "method":"card","livemode":false,"created_by":"stripe_webhook","note":"Online card payment"}
```

**Field for field identical to an immediate charge** — which is what makes the two writers safely idempotent against each other on the shared key.

### ⚠️ ONE FIELD READS SLIGHTLY WRONG, AND I LEFT IT

🔴 **`created_by: "stripe_webhook"` — but this row was written by the capture path, not the webhook.** `recordOnlineCardPayment` hardcodes it and takes no `createdBy`.

**Left as-is deliberately:** changing it would make the row **not identical**, which is the property the brief asked about and the property that keeps the two writers interchangeable. ⚠️ **The cost is a small inaccuracy in the ledger's provenance field, stated rather than hidden.** `note` is likewise the generic `'Online card payment'`, which is true of a capture.

⚠️ **One genuine difference in the CALL, not the row:** `livemode` cannot be copied from an event (a capture is not an event), so it is derived from our own key's mode — `!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')`. **The sandbox guard has already refused anything but `sk_test_` by that line, so it is `false` by construction today.**

---

## V. VERIFICATION

⚠️ **WRITES DECLARED:** two drafts, two sandbox PaymentIntents, one ledger row, two orders, one audit row. **All cleaned; residue proved.**
🔴 **ONE WRITE CANNOT BE UNDONE:** sandbox intent `pi_3U3iQ52fB4PPCw2D1Pb6ghGV` was **really captured** — a £6.00 test-mode charge on the connected account. **That was the point of test (a)**; it is sandbox money and cannot be un-captured.

### (a) Held authorisation captured on confirmation

```
  BEFORE  intent pi_3U3iQ52fB4PPCw2D1Pb6ghGV status requires_capture capturable 600 received 0
  BEFORE  order payment_status: { payment_status: 'unpaid', amount_paid: null }
  captureOnConfirmation -> {"status":"captured","paymentIntentId":"pi_3U3iQ5…","amountMinor":600} (1555ms)
  AFTER   intent status succeeded received 600
  AFTER   ledger rows: 1
  AFTER   order: {"payment_status":"paid","amount_paid":6}
  PASS - requires_capture -> succeeded, ONE ledger row, order reads paid
```

### (b) Idempotency

```
  second call -> {"status":"already","paymentIntentId":"pi_3U3iQ5…"} (53ms)
  ledger rows now: 1  intent received still 600
  PASS - one ledger row, no second capture, and it answered WITHOUT a Stripe call
```
⚠️ **53ms vs 1555ms** — the pre-check answered from our own ledger and never reached Stripe.

### (c) Pay-at-hatch unaffected

```
  order 93252309-27ed-416d-b63a-7b48636c0bff has a draft: false
  captureOnConfirmation -> {"status":"none"} (23ms — one indexed read, no Stripe call)
  PASS - no-op, and cheap
```

### (d) Capture failing leaves the order confirmed

```
  captureOnConfirmation -> {"status":"expired","paymentIntentId":"pi_3U3iQ9…","detail":"This PaymentIntent could not be captured because it has a status of canceled…"}
  order after: {"status":"confirmed","payment_status":"unpaid"}
  ledger rows: 0
  audit rows : [{"action":"capture_failed","order_key":"61440968-…","after_state":{"kind":"expired",…,"captured":false}}]
  PASS - not a capture, order STILL CONFIRMED, no ledger row, recorded in the audit log
```

### (e) 🔴 WHICH SITES A SCRIPT REACHED, AND WHICH NEED YOU

| Site | Exercised? | How |
|---|---|---|
| **The capture function itself** | ✅ **Fully** — all four outcomes above | script |
| **Site 2 — operator confirm** | ⚠️ **The capture call was exercised with `trigger: 'confirm'`; the HANDLER was not** | needs hand test |
| **Site 1 — auto-accept** | 🔴 **NOT exercised.** Reaching it needs a real submit that auto-accepts on a truck with a live authorisation | needs hand test |
| **Site 3 — time-adjust** | 🔴 **NOT exercised.** Needs a pending order with a held authorisation | needs hand test |
| **Site 4 — offline replay** | 🔴 **NOT exercised.** Needs the native app offline | needs hand test |

**Exact steps:**

| # | Site | Steps | Expected |
|---|---|---|---|
| 1 | **Auto-accept** | On a truck with auto-accept ON and no notes: place a card order, pay with `4242 4242 4242 4242` | Order arrives **confirmed** and the card shows **PAID** immediately. Stripe: intent `succeeded`. Log: `[capture] CAPTURED … trigger=auto_accept` |
| 2 | **Operator confirm** | Turn auto-accept **off**. Place a card order and pay. The order arrives **pending** and reads **unpaid** — 🔴 **correct, the hold is not captured yet.** Press **Confirm** | The card flips to **PAID**. Stripe: `succeeded`. Log: `trigger=confirm` |
| 3 | **Time-adjust** | Same, but instead of Confirm press **+10m** on the pending order | Slot moves, status becomes confirmed, **and the card flips to PAID**. Log: `trigger=time_adjust` |
| 4 | **Offline replay** | On the native app, go offline, press **Confirm** on a pending card order, come back online | The queued confirm replays; the card flips to **PAID**. Log: `trigger=confirm`. ⚠️ If it has been more than ~7 days, expect `[capture] 🔴 AUTHORISATION GONE` and the order stays unpaid — which is correct |
| 5 | **Double-confirm** | Confirm, then press **+10m** on the same order | Second call logs nothing and writes nothing. `select count(*) from order_payments where order_key='…'` = **1** |

### Gates

```
tsc: clean
eslint — submit 23 (baseline 23), action 19 (baseline 19), capture.ts 0. ZERO NEW.
```

**Residue:** probe orders `[]`, `capture_failed` audit rows `0`, and **order 18 verified intact** (`{"id":"18","status":"confirmed","payment_status":"unpaid"}`). The one remaining draft is order 18's own.

---

## VI. NON-ASCII CENSUS

| File | Before (total / distinct) | After | New class? |
|---|---|---|---|
| `app/api/orders/submit/route.ts` | 1377 / 19 | 1441 / 19 | ✅ **none** |
| `app/api/dashboard/action/route.ts` | 2663 / 16 | 2700 / 16 | ✅ **none** |
| `lib/payments/capture.ts` | — (new) | 490 / 6 | — |

✅ **Both edited files keep an identical distinct set.** The new file uses `─ — 🔴 ⚠️ …` only.

---

## VII. What was NOT touched

| Constraint | Held? |
|---|---|
| `promoteDraft`, `claimOrderDraft`, the draft table, the cron sweep | ✅ **Not opened.** Capture only READS `order_drafts` |
| The authorisation path, the Payment Element, `payment_method_types` | ✅ **Not opened** |
| `place_order_atomic`, the capacity engine, the stock guard | ✅ **Not opened** |
| The confirmation email, order card, KDS, ticket | ✅ **Not opened.** Making a HELD authorisation visible is untouched |
| `application_fee_amount` | ✅ **Not added.** `grep application_fee lib/payments/capture.ts` → the comment saying it is absent |
| Anything else | ✅ One new file, two one-call edits |

🔴 **NO MIGRATION IS NEEDED AND NONE WAS WRITTEN.**

## Flagged

- ⚠️ **`created_by: 'stripe_webhook'` on a capture-written row.** §6 — the price of keeping the row identical.
- ⚠️ **`undo_ready` does not capture.** It is a revert of an already-confirmed order, so capture already ran. Named in §2 rather than silently skipped.
- ⚠️ **A failed capture is invisible to the operator** — by instruction. The order reads unpaid, which is true; only the audit log and the server log say a hold was lost.
- ⚠️ **Site 1 adds one indexed read to every customer order**, card or not. Measured at 23ms for the no-op case.
- ⚠️ **The `GONE` and `ALREADY_CAPTURED` patterns match Stripe's message TEXT.** Stripe returns no distinct machine code for these, and the codebase already accepts that weakness in `lib/stripe/connect.ts`. If Stripe rewords, a capture failure degrades to `failed` — still not a false success, still audited.
