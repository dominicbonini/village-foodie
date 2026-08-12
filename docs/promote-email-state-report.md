# promoteDraft's confirmation email: resolved, not assumed

**Date:** 12 August 2026
**BUILD. One change.** No `next dev`, no `next build`. Nothing committed. Nothing deployed. **No migration.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 THE SHORT VERSION

| | |
|---|---|
| **What changed** | `cardHeld: !!draft.payment_intent_id` → `paymentState`, from the same resolver the other four sites use |
| **Source of truth** | 🔴 **The `CaptureResult` from step 8a**, which was already in hand and being discarded — the resolver falls back to a database read only when it is not decisive |
| **Blast radius** | **8 changed lines that are not comments**, all in `lib/payments/promote-draft.ts`. Nothing else in the repo touched |
| **Census** | ✅ **534 → 587 characters, distinct 7 → 7, SET IDENTICAL** |
| **Pay-at-hatch** | ✅ **Byte-identical, proved by string equality against HEAD's renderer** |

**All four cases exercised end to end against the real database and real Stripe, with Brevo intercepted at the `fetch` boundary. The sentences below are the bytes a customer would have received. Zero emails sent.**

---

## The change

### 1. The capture result is hoisted instead of discarded

```ts
    // ⚠️ HOISTED SO THE CONFIRMATION EMAIL CAN READ IT. It used to be a `const` inside the branch and
    // was discarded — the same defect the operator-confirm branch had, and for the same reason: the
    // email is composed forty lines later and re-derives what this already knows.
    let captureNote = 'no authorisation'
    let captureResult: CaptureResult | undefined
    if (autoAccepted) {
      captureResult = await captureOnConfirmation(supabase, {
        orderKey: draft.order_key, truckId: draft.truck_id, trigger: 'promote_auto_accept',
      })
      captureNote = captureResult.status
    } else if (draft.payment_intent_id) {
      captureNote = 'held, pending confirmation'
    }
```

### 2. The email resolves, inside its own guard

```ts
    if (!isDemoTruck && draft.customer_email) {
      try {
        // ── 🔴 WHAT THIS CUSTOMER OWES, FROM THE SAME RESOLVER ALL FOUR OPERATOR EMAILS USE. ────────
        // 🔴 THE CAPTURE RESULT FIRST, BECAUSE IT IS THE MOST ACCURATE SOURCE THERE IS, and this
        // function has one in hand. Step 8a captured moments ago; an `expired` result means Stripe
        // refused because the hold is gone, and the draft row does not know that yet — a database read
        // at this instant would answer "held" and promise a customer their card is covering an order
        // it is not. Exactly the reasoning the operator-confirm branch now follows.
        // ⚠️ `captureResult` IS UNDEFINED FOR AN ORDER THAT LANDED PENDING, deliberately: nothing was
        // captured, so there is nothing to report from, and the resolver reads — answering 'held' for a
        // live authorisation and 'hatch' for a draft that never had one.
        // ⚠️ INSIDE THE EMAIL GUARD, so a demo truck or an order with no email address pays nothing.
        const paymentState = await resolveEmailPaymentState(supabase, draft.order_key, captureResult)
        const { subject, html, text } = formatConfirmationEmail({
```

and the parameter itself:

```ts
          paymentState,
```

### 3. The comment that justified the old behaviour is gone, and says why

It read *"AND IT STAYS `true` EVEN WHEN STEP 8a HAS JUST CAPTURED, WHICH IS A DELIBERATE TRADE, NOT AN OVERSIGHT… THE HONEST FIX IS A THIRD BRANCH… out of scope here"*. That reasoning was sound only while the formatter had two branches. It now has four, so the trade no longer exists to make. The replacement records the sequence honestly:

> *The first fix gave it `cardHeld: !!draft.payment_intent_id`, which was accurate for exactly as long as this file captured nothing.*
> 🔴 *THAT STOPPED BEING TRUE WHEN STEP 8a WAS ADDED. Capture now runs inline, BEFORE this line, so an auto-accepted card order was being told "your card is held, not charged" about money that had already moved.*

### 🔴 Why the `CaptureResult` and not simply a read

`captureOnConfirmation`'s `expired` branch calls `recordCaptureProblem` and **does not** call `markAuthorizationCancelled` — so at the instant the email is composed the draft still has `authorization_cancelled_at: null`, a live `payment_intent_id`, `promoted_at` set, and no ledger row. **`readEmailPaymentState` would answer `'held'`.** Case (b) below is exactly that order, and it correctly says the customer owes money — which only the capture result could have known. That is the same asymmetry the operator-confirm branch relies on, measured in the previous report as `a DATABASE read would answer : held  <- WRONG, the hold is gone`.

### Everything else in promoteDraft is untouched

```
$ git diff -U0 lib/payments/promote-draft.ts | grep -vE "^[+-]\s*//"
-import { captureOnConfirmation } from '@/lib/payments/capture'
+import { captureOnConfirmation, type CaptureResult } from '@/lib/payments/capture'
+import { resolveEmailPaymentState } from '@/lib/payments/email-payment-state'
+    let captureResult: CaptureResult | undefined
-      const cap = await captureOnConfirmation(supabase, {
+      captureResult = await captureOnConfirmation(supabase, {
-      captureNote = cap.status
+      captureNote = captureResult.status
+        const paymentState = await resolveEmailPaymentState(supabase, draft.order_key, captureResult)
-          cardHeld:     !!draft.payment_intent_id,
+          paymentState,
```

**Eight lines.** No change to the resolver, the other four sites, the capture logic, the claim, the insert, the lock, or the truck email. `git status` shows one file modified by this turn.

---

# VERIFICATION

**Method:** the real `promoteDraft` through `jiti`, the real database, the real Stripe sandbox on `acct_1U30w22fB4PPCw2D`, and `globalThis.fetch` patched to intercept `api.brevo.com`. **Every string below is lifted from the intercepted Brevo payload.**

## (a) An auto-accepted card order that captured

```
[capture] CAPTURED order_key=efa184ba-… pi=pi_3U3k5w2fB4PPCw2D0uoGRXi3 amount_minor=650 trigger=promote_auto_accept -> status=paid
[promote:redirect] PROMOTED draft=efa184ba-… -> order #32 status=confirmed capture=captured
email subject : Order #32 confirmed
```

**HTML**
```html
<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin-top:12px;text-align:center">
    <p style="margin:0;font-size:16px;font-weight:800;color:#166534">Paid by card</p>
    <p style="margin:6px 0 0;font-size:13px;color:#15803d">Your payment has gone through — nothing to pay at the truck.</p>
</div>
```
**Plain text**
```
Paid by card. Your payment has gone through — nothing to pay at the truck.
```

🔴 **This is the sentence that used to read "Your card is held, not charged" about £6.50 that had already left the customer's account.**

## (b) An auto-accepted card order whose capture returned `expired`

The hold was cancelled at Stripe **before** promotion, so step 8a met a dead intent.

```
[capture] 🔴 AUTHORISATION GONE for order_key=e3e34b0d-… (promote_auto_accept): … status of canceled …
          The order IS confirmed and the customer has NOT paid — they owe money at the hatch.
[promote:redirect] PROMOTED draft=e3e34b0d-… -> order #33 status=confirmed capture=expired
email subject : Order #33 confirmed
```

**HTML**
```html
<div style="background:#f1f5f9;border-radius:10px;padding:16px;margin-top:12px;text-align:center">
    <p style="margin:0;font-size:16px;font-weight:800;color:#1e293b">Pay at the truck on collection</p>
</div>
```
**Plain text**
```
Pay at the truck on collection.
```

✅ **Correct, and only the `CaptureResult` knew it.** The order is confirmed, no money moved, the hold is gone — the customer genuinely owes at the window. A database read at that instant would have said `held`, because nothing had yet marked the authorisation cancelled.

## (c) A card order that landed pending and was not captured

```
[promote:redirect] PROMOTED draft=f68511cb-… -> order #34 status=pending capture=held, pending confirmation
email subject : Order #34 received
```

**HTML**
```html
<div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:16px;margin-top:12px;text-align:center">
    <p style="margin:0;font-size:16px;font-weight:800;color:#3730a3">Your card is held, not charged</p>
    <p style="margin:6px 0 0;font-size:13px;color:#4f46e5">Test Kitchen takes the payment when they confirm your order. Nothing to pay at the truck.</p>
</div>
```
**Plain text**
```
Your card is held, not charged. Test Kitchen takes the payment when they confirm your order — nothing to pay at the truck.
```

✅ **Unchanged from what this email already said**, and now said because it was resolved rather than assumed. `captureResult` is `undefined` here — nothing was captured — so the resolver read the draft and found a live, uncaptured authorisation.

## (d) No authorisation — the pay-at-hatch block, byte-identical

A draft promoted with **no `payment_intent_id`**, so step 8a returned `none` and the resolver fell through to the database.

```
[promote:redirect] PROMOTED draft=873a02ea-… -> order #35 status=confirmed capture=none
email subject : Order #35 confirmed
```

**HTML**
```html
<div style="background:#f1f5f9;border-radius:10px;padding:16px;margin-top:12px;text-align:center">
    <p style="margin:0;font-size:16px;font-weight:800;color:#1e293b">Pay at the truck on collection</p>
</div>
```
**Plain text**
```
Pay at the truck on collection.
```

### 🔴 PROVED BY STRING EQUALITY, NOT BY EYE

```
HEAD's cardHeld:false block === the block just sent?  IDENTICAL
HEAD's plain text  : "Pay at the truck on collection."
the text just sent : "Pay at the truck on collection."

renderer, no payment params: html IDENTICAL (2196b)  text IDENTICAL
```

The first comparison takes the block HEAD's `lib/email.ts` renders for `cardHeld: false` and compares it, character for character, with the block the live promotion just sent. The last line renders the whole email through both HEAD's formatter and the working tree's with no payment parameter at all — **2196 bytes of HTML, identical, plus identical plain text.**

⚠️ **A note on what (d) models.** `promoteDraft` only ever runs for card orders in production, so a draft with no intent is not a real pay-at-hatch order — the real one is `app/api/orders/submit/route.ts:1212`, which `git status` confirms this turn did not touch. (d) proves the stronger thing: even the *promotion* path renders the untouched block when no money is held.

## 🔴 WRITES DECLARED

| Write | Cleanup |
|---|---|
| 4 `order_drafts` rows | ✅ deleted |
| 4 `orders` rows (#32, #33, #34, #35) | ✅ deleted |
| 1 `order_payments` row | ✅ deleted |
| 3 sandbox PaymentIntents (1 captured, 1 cancelled, 1 left `requires_capture`) | ⚠️ **NOT reversible.** Sandbox test data |
| 4 display numbers consumed | ⚠️ **NOT reversible.** The next real order is #36 |
| 1 `action_audit_log` row (`capture_failed`, from case b) | ⚠️ **NOT deleted, on purpose.** That table is append-only |
| **Emails sent** | ✅ **ZERO** |

```
residual drafts/orders/payments: 0/0/0
BREVO CALLS THAT LEFT THIS MACHINE: 0 (all intercepted)
```

## Tooling

```
$ npx tsc --noEmit                          -> clean
$ npx eslint lib/payments/promote-draft.ts  -> clean, no output
```
⚠️ tsc-clean is not verification and is not offered as any. The evidence above is intercepted bytes.

---

# 🔴 NON-ASCII CENSUS

| File | Before | After | Distinct set |
|---|---|---|---|
| `lib/payments/promote-draft.ts` | 534 / **7** | 587 / **7** | `— • → ─ ⚠ 🔴 ️` **identical** |

✅ **NO CHARACTER CLASS GAINED.** No other file was modified this turn, so no other census applies.

---

# Standing

- ✅ **All five order-email sites now read the same resolver.** `grep -rn "cardHeld" app lib` returns hits only in `lib/email.ts`, where the parameter survives as the documented fallback for a caller that passes no state.
- ⚠️ **`cardHeld` now has no caller.** It is kept, not removed, because deleting it would change `formatConfirmationEmail`'s signature for no behavioural gain and its fallback is what guarantees an unmigrated future caller renders the pay-at-hatch block rather than crashing. Worth removing on a tidy-up pass; **not done here**, because "do not change anything else" is the instruction.
- ⚠️ **Still open from earlier work, unchanged by this turn:** `sendCancellationEmail` promises an automatic refund HatchGrab cannot issue on a direct charge; and editing an already-captured order changes the total without moving the captured amount.
