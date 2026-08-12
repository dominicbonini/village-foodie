# Payment state, threaded through every order email

**Date:** 12 August 2026
**BUILD.** No `next dev`, no `next build`. Nothing committed. Nothing deployed. **No migration — none was needed.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 THE SHORT VERSION

| | |
|---|---|
| **One resolver** | `lib/payments/email-payment-state.ts`. Four states. Every site calls it; none works it out for itself |
| **Four sentences** | captured / held / hatch / **unknown** — HTML and plain text, plus a third place the ready email said "Pay at the truck." |
| **The discarded `CaptureResult`** | now assigned, and it **beats a database read** on `expired` |
| 🔴 **Q5, ANSWERED DEFINITIVELY** | **NOTHING sent order 25 a second email.** Brevo's own log shows **exactly one**. See §5 |
| **Census** | ✅ **NO FILE GAINED A CHARACTER CLASS.** Both distinct sets byte-identical |
| ⚠️ **One flagged consequence** | **promoteDraft's email still says "your card is held" for an auto-accepted, already-captured order** — because you instructed me not to change it. §V(a) |

**Verified end to end with Brevo intercepted at the `fetch` boundary, so the bytes below are the bytes a customer would have received. Zero emails left this machine — confirmed against Brevo's send log afterwards.**

---

## 1. One resolver, and every call site

**`lib/payments/email-payment-state.ts`** — new, 155 lines. The core:

```ts
export type EmailPaymentState = 'captured' | 'held' | 'hatch' | 'unknown'

export async function readEmailPaymentState(supabase, orderKey): Promise<EmailPaymentState> {
    const { data: draft, error: draftErr } = await supabase
      .from('order_drafts')
      .select('payment_intent_id, promoted_at, authorization_cancelled_at')
      .eq('order_key', orderKey)
      .maybeSingle()

    if (draftErr) { … return 'unknown' }
    if (!draft?.payment_intent_id) return 'hatch'

    const { data: ledgerRow, error: ledgerErr } = await supabase
      .from('order_payments')
      .select('id')
      .eq('idempotency_key', onlinePaymentIdempotencyKey(draft.payment_intent_id))
      .maybeSingle()

    if (ledgerErr) { … return 'unknown' }
    if (ledgerRow) return 'captured'
    if (draft.authorization_cancelled_at) return 'hatch'
    if (!draft.promoted_at) { … return 'unknown' }
    return 'held'
}
```

and the one entry point every site uses:

```ts
export async function resolveEmailPaymentState(supabase, orderKey, capture?): Promise<EmailPaymentState> {
  if (capture) {
    const fromCapture = emailPaymentStateFromCapture(capture)
    if (fromCapture) return fromCapture
  }
  return readEmailPaymentState(supabase, orderKey)
}
```

### 🔴 Why it does not simply call `readHeldAuthorisations`

The `'held'` predicate is **the same three conditions plus the same ledger check** the display resolver uses, and that is written into the header so a future edit to one is a visible obligation on the other. It is a separate function for one reason, stated at the top of the file:

> `readHeldAuthorisations` returns an **EMPTY SET on any error**, so an operator surface degrades to what it showed before the chip existed. That is right for a chip and **WRONG for an email**: "not held" collapses into "pay at the truck", which is a bill sent to someone who has already been charged, **and an email cannot be corrected once sent**. So every read failure here becomes `'unknown'`.

### Every call site

| Site | File : line | How it resolves | Was |
|---|---|---|---|
| 5 · **operator confirm** | `action/route.ts:231, 240` | `resolveEmailPaymentState(supabase, orderKey, captureResult)` | 🔴 hardcoded "Pay at the truck on collection" |
| 6 · **ready notification** | `action/route.ts:157` | `resolveEmailPaymentState(supabase, order.order_key)` | 🔴 the same, **twice** |
| 7 · **quick-time-adjust** | `action/route.ts:1696, 1701` | `resolveEmailPaymentState(supabase, orderKey, adjustCapture)` | 🔴 the same |
| 8 · **operator edit** | `action/route.ts:772` | `resolveEmailPaymentState(supabase, orderKey)` → `paymentNote(state, truck.name).short` | 🔴 a **string literal** in bespoke HTML |
| 1 · promote-draft | unchanged | still passes `cardHeld` only | ✅ correct, and untouched by instruction |
| 3, 9 · pay-at-hatch, walk-up | unchanged | pass neither → `'hatch'` | ✅ correct, byte-identical |

The confirm site, quoted in full:

```ts
      const captureResult = await captureOnConfirmation(supabase, { orderKey, truckId: truck.id, trigger: 'confirm' })

      if (order.customer_email) {
        …
        const paymentState = await resolveEmailPaymentState(supabase, orderKey, captureResult)
```

and the edit site, which owns its own markup:

```ts
        const paymentState = await resolveEmailPaymentState(supabase, orderKey)
        const payNote = paymentNote(paymentState, truck.name)
        …
            <p style="color:#94a3b8;font-size:12px">${payNote.short} · Powered by HatchGrab · hatchgrab.com</p>
```

---

## 2. 🔴 THREE STATES, AND A FOURTH. THE EXACT SENTENCES.

One function, `paymentNote(state, truckName)` in `lib/email.ts`, feeding **all three** places an email mentions money. **Rendered, not transcribed:**

### CAPTURED — money taken, nothing owed

```html
<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin-top:12px;text-align:center">
    <p style="margin:0;font-size:16px;font-weight:800;color:#166534">Paid by card</p>
    <p style="margin:6px 0 0;font-size:13px;color:#15803d">Your payment has gone through — nothing to pay at the truck.</p>
</div>
```
**Plain text:** `Paid by card. Your payment has gone through — nothing to pay at the truck.`
**Ready line:** `…come and collect from Test Kitchen. Already paid by card.`

✅ **"Paid" appears here and nowhere else.** This is the one state where money has actually moved.

### HELD — authorised, not captured

```html
<div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:16px;margin-top:12px;text-align:center">
    <p style="margin:0;font-size:16px;font-weight:800;color:#3730a3">Your card is held, not charged</p>
    <p style="margin:6px 0 0;font-size:13px;color:#4f46e5">Test Kitchen takes the payment when they confirm your order. Nothing to pay at the truck.</p>
</div>
```
**Plain text:** `Your card is held, not charged. Test Kitchen takes the payment when they confirm your order — nothing to pay at the truck.`
**Ready line:** `…come and collect from Test Kitchen. Your card is held, not charged — nothing to pay at the truck.`

✅ **Character for character the block that already shipped**, so promote-draft's email is unchanged.

### HATCH — money owed, no authorisation

```html
<div style="background:#f1f5f9;border-radius:10px;padding:16px;margin-top:12px;text-align:center">
    <p style="margin:0;font-size:16px;font-weight:800;color:#1e293b">Pay at the truck on collection</p>
</div>
```
**Plain text:** `Pay at the truck on collection.`
**Ready line:** `…come and collect from Test Kitchen. Pay at the truck.`

✅ **Character for character today's**, so every pay-at-hatch order is untouched.

### 🔴 THE THIRD PLACE THE OLD EMAIL SAID IT

The "ready" headline hardcoded `. Pay at the truck.` for **everyone**, outside the payment box entirely — so a card customer collecting an order they had already paid for read a bill **twice**. It is now `payNote.readySuffix`, and `'hatch'` renders the identical string.

---

## 3. The `CaptureResult`, used

```ts
export function emailPaymentStateFromCapture(result: CaptureResult): EmailPaymentState | null {
  switch (result.status) {
    case 'captured':
    case 'already':
      return 'captured'
    case 'expired':
      return 'hatch'
    case 'failed':
      return 'unknown'
    case 'none':
      return null
  }
}
```

| Outcome | State | Email says | Why |
|---|---|---|---|
| `captured` | `captured` | **Paid by card** | The money moved in this request |
| `already` | `captured` | **Paid by card** | It moved in an earlier one; the ledger row was found |
| 🔴 `expired` | 🔴 **`hatch`** | 🔴 **Pay at the truck on collection** | **The hold is gone and nothing was taken. The order is confirmed and the customer genuinely OWES.** This is the one case where that sentence is correct for a card order |
| `failed` | `unknown` | **We're still confirming your payment** | Covers a failed draft read, a missing Stripe account, a mid-capture network failure, **and "captured but the ledger write failed" — which means they HAVE paid** |
| `none` | *(not decisive)* | falls through to the database | No authorisation exists; the read answers `'hatch'`, exactly as today |

### 🔴 `expired` IS WHY THE RESULT BEATS A DATABASE READ, AND THIS IS MEASURED

Stripe refused because the hold is gone — but `authorization_cancelled_at` is set **later**, by the stranded sweep, or never. From the harness, on a real order whose hold I cancelled at Stripe behind the system's back:

```
  a DATABASE read would answer : held  <- WRONG, the hold is gone
```

A read at that moment would have promised the customer their card was covering an order it was not. **The capture result knows; the row does not.**

---

## 4. Capture in flight, or its outcome unknown

**The honest answer needed a fourth sentence, so I wrote one.**

```html
<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px;margin-top:12px;text-align:center">
    <p style="margin:0;font-size:16px;font-weight:800;color:#92400e">We're still confirming your payment</p>
    <p style="margin:6px 0 0;font-size:13px;color:#b45309">Your card was authorised, so please do not pay again — Test Kitchen will confirm at the hatch.</p>
</div>
```
**Plain text:** `We're still confirming your payment. Your card was authorised, so please do not pay again — Test Kitchen will confirm at the hatch.`
**Ready line:** `…come and collect from Test Kitchen. We're still confirming your payment — please do not pay again.`

It satisfies both constraints exactly:

| Constraint | How |
|---|---|
| **Must not claim money was taken that might not have been** | The word "paid" does not appear. It says the card was **authorised** — which is certain, because `unknown` is only reachable for an order that has a `payment_intent_id` or whose read failed |
| **Must not tell a customer to pay again when their card is held** | The operative instruction is **"please do not pay again"** |

🔴 **THE ASYMMETRY IS DELIBERATE AND IS WHY THIS IS THE SAFE DEFAULT.** If we are wrong and they do owe money, they are told at the hatch and pay — recoverable in thirty seconds. If we are wrong the other way, a charged customer pays twice, and only one of the two parties finds out.

**Reached by:** any `order_drafts` or `order_payments` read failure, a `'failed'` capture, and the not-describable case of an intent with no `promoted_at`.

---

## 5. ⚠️ WHAT SENT ORDER 25'S SECOND EMAIL

# 🔴 NOTHING DID. THERE WAS NO SECOND EMAIL.

I queried **Brevo's own transactional send log** — the delivery system itself, not our database:

```
2026-08-12T23:24:36.102+02:00 | Order #25 confirmed      <- 21:24:36.102 UTC
2026-08-12T23:19:13.333+02:00 | Order #24 received       <- 21:19:13.333 UTC
2026-08-12T23:19:12.999+02:00 | Order #24 confirmed      <- 21:19:12.999 UTC
```

**Order 25 received exactly ONE email**, sent **0.84 s after `promoteDraft` resolved** (`handled_at 21:24:35.262`). That is site 1, with `cardHeld: true`, and it said **"Your card is held, not charged."**

### 🔴 AND HERE IS THE ALMOST-CERTAIN EXPLANATION, VISIBLE IN THOSE THREE LINES

**Order 24's two emails arrived 334 ms apart, IN THE WRONG ORDER:**

```
21:19:12.999   "Order #24 confirmed"   <- the OPERATOR CONFIRM email. autoAccepted:true.
                                          🔴 THIS IS THE ONE THAT SAID "Pay at the truck on collection".
21:19:13.333   "Order #24 received"    <- promoteDraft's email. autoAccepted:false, cardHeld:true.
                                          "Your card is held, not charged".
```

**QUOTED**, `lib/email.ts:122-126`:
```ts
  const subject = isReady
    ? `Order #${params.orderId} is ready — ${params.truckName}`
    : params.autoAccepted
      ? `Order #${params.orderId} confirmed`
      : `Order #${params.orderId} received`
```

So the inbox at that moment held **"Order #24 confirmed"** (pay at the truck), **"Order #24 received"** (card held) and, five minutes later, **"Order #25 confirmed"** (card held). **Two adjacent emails with near-identical subject lines, one of them wrong — and the wrong one arrived FIRST, before the "received" email it was supposed to follow.** Conflating them is the natural reading of that inbox.

⚠️ **AND THE ORDERING IS ITSELF A REAL DEFECT, though not the one you asked about.** promoteDraft's tail was so slow (`handled_at 21:19:12.88`) that the operator confirmed before it had sent its first email. **The customer was told their order was confirmed and to pay at the truck, and then told it had been received and their card was held.**

### What about the `orders.updated_at = 21:24:33.822` write?

🔴 **IT SENT NO EMAIL — that is now established, not inferred.** Brevo has nothing at that timestamp. **What wrote it is still not established.** `orders_set_updated_at` (migration `20260703`) fires on any UPDATE, and I ruled out the candidates in promotion's tail: `enforceStockLimits` only **reads** `orders` (`stock-availability.ts:36`) and writes `event_item_stock`; `rebuildProductionSlotUsage` writes `production_slot_usage`; `recalcOrderPayment` had already run at 21:22:32. Remaining possibilities, none confirmable without an audit row — **and the confirm branch writes none**:

- an operator action that happens to be a no-op on `status` (a re-tap of Confirm from a stale board, or the KDS)
- something in the dashboard write path I have not found

⚠️ **But note it is 1.44 s BEFORE `handled_at`** — consistent with a request warming the frozen lambda and letting the suspended promotion finish. That would mean the write and the resolution are the same event's cause and effect.

---

# VERIFICATION

**Method:** the **real** modules through `jiti`, the **real** database, the **real** Stripe sandbox, and the **real** `POST` export of `app/api/dashboard/action/route.ts`. **`globalThis.fetch` was patched to intercept `api.brevo.com`**, so every email was captured verbatim and none was sent.

## 🔴 WRITES DECLARED

| Write | Cleanup |
|---|---|
| 3 `order_drafts` rows | ✅ deleted |
| 3 `orders` rows (#29, #30, #31) | ✅ deleted |
| 2 `order_payments` rows | ✅ deleted |
| 3 sandbox PaymentIntents (2 captured, 1 cancelled) | ⚠️ **NOT reversible.** £19.50 of sandbox money on the connected account |
| `production_slot_usage` for 2026-08-13 | ✅ `rebuildProductionSlotUsage` re-run |
| 6 display numbers (#26-#31) consumed | ⚠️ **NOT reversible.** An earlier run with a faulty output extractor burned #26-#28; the next real order is #32 |
| **Emails sent** | ✅ **ZERO.** Verified against Brevo afterwards: no send to `harness@example.invalid`, and the newest real send is still "Order #25 confirmed" |

```
residual drafts/orders/payments: 0/0/0
BREVO CALLS THAT LEFT THIS MACHINE: 0 (all intercepted)
```

## (a) A card order captured on auto-accept

```
[capture] CAPTURED order_key=757bac52-… trigger=promote_auto_accept -> status=paid
[promote:redirect] PROMOTED draft=757bac52-… -> order #30 status=confirmed capture=captured
resolveEmailPaymentState -> captured
```

✅ **The resolver is right: `captured`.**

### 🔴 BUT THE EMAIL THIS CUSTOMER ACTUALLY RECEIVES IS STILL THE HELD ONE, AND I AM FLAGGING IT

```
site 1 (promote-draft, UNCHANGED BY INSTRUCTION) emails: [ 'Order #30 confirmed' ]
  HTML : <div style="background:#eef2ff;…">
           <p …>Your card is held, not charged</p>
           <p …>Test Kitchen takes the payment when they confirm your order. Nothing to pay at the truck.</p>
         </div>
  TEXT : Your card is held, not charged. Test Kitchen takes the payment when they confirm your order — nothing to pay at the truck.
```

⚠️ **THE MONEY HAD ALREADY MOVED WHEN THAT WAS COMPOSED.** promote-draft captures at step 8a and emails at step 9. The brief says *"Do not change promoteDraft's first email. It is correct."*, so I have not touched it — **but this is the one remaining stale sentence in the product, and it is on the highest-volume path.** One line would fix it: `paymentState: await resolveEmailPaymentState(supabase, draft.order_key)` in place of `cardHeld`. **Your call, not mine.**

**Every other site now renders it correctly for that same order** — the ready notification, sent through the real route:

```
  POST {action:ready} -> 200 | emails: [ 'Order #30 is ready — Test Kitchen' ]
  HTML : <div style="background:#f0fdf4;border:1px solid #bbf7d0;…">
           <p …>Paid by card</p>
           <p …>Your payment has gone through — nothing to pay at the truck.</p>
         </div>
  TEXT : Paid by card. Your payment has gone through — nothing to pay at the truck.
  READY: ready for collection — come and collect from Test Kitchen. Already paid by card.
```

🔴 **That email previously said "Pay at the truck." in the headline AND "Pay at the truck on collection" in the box — to a customer already charged £6.50.**

## (b) A card order held, awaiting operator confirmation

```
[promote:redirect] PROMOTED draft=a1df675b-… -> order #29 status=pending capture=held, pending confirmation
resolveEmailPaymentState -> held
emails intercepted: [ 'Order #29 received' ]
HTML : <div style="background:#eef2ff;border:1px solid #c7d2fe;…">
         <p …>Your card is held, not charged</p>
         <p …>Test Kitchen takes the payment when they confirm your order. Nothing to pay at the truck.</p>
       </div>
TEXT : Your card is held, not charged. Test Kitchen takes the payment when they confirm your order — nothing to pay at the truck.
```

✅ Correct, and unchanged from what already shipped.

## (c) A card order whose capture returned `expired`

Real order #31, promoted `pending`, hold then cancelled at Stripe behind the system's back, then confirmed through the real route:

```
  a DATABASE read would answer : held  <- WRONG, the hold is gone
[capture] 🔴 AUTHORISATION GONE … status of canceled … The order IS confirmed and the customer has NOT paid
POST {action:confirm} -> 200 | emails: [ 'Order #31 confirmed' ]
HTML : <div style="background:#f1f5f9;border-radius:10px;padding:16px;margin-top:12px;text-align:center">
         <p style="margin:0;font-size:16px;font-weight:800;color:#1e293b">Pay at the truck on collection</p>
       </div>
TEXT : Pay at the truck on collection.
```

🔴 **THE CUSTOMER IS CORRECTLY TOLD THEY OWE MONEY** — and only the `CaptureResult` could have known that. The database said `held`.

## (d) A pay-at-hatch order — byte-identical, on every affected site

HEAD's `lib/email.ts` and the working tree's, same parameters, diffed:

```
  variant=confirmation subject IDENTICAL  html IDENTICAL (2973b)  text IDENTICAL (247b)
  variant=ready        subject IDENTICAL  html IDENTICAL (2278b)  text IDENTICAL (284b)
  cardHeld:true          html IDENTICAL  text IDENTICAL
  edit-email footer      paymentNote('hatch').short = "Pay at the truck on collection"
```

✅ **Both variants, HTML and plain text, byte-for-byte.** The `cardHeld: true` row proves promote-draft's email is unchanged too. The edit email's footer interpolation resolves to the exact literal it replaced, so sites 3, 8 and 9 are unchanged for a pay-at-hatch order.

## (e) An operator confirming a held card order

The same order #29 from (b), through the real `POST` handler with the truck's real dashboard token:

```
[capture] CAPTURED order_key=a1df675b-… trigger=confirm -> status=paid
POST /api/dashboard/action -> 200 {"success":true,"status":"confirmed"}
emails intercepted: [ 'Order #29 confirmed' ]
HTML : <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin-top:12px;text-align:center">
         <p style="margin:0;font-size:16px;font-weight:800;color:#166534">Paid by card</p>
         <p style="margin:6px 0 0;font-size:13px;color:#15803d">Your payment has gone through — nothing to pay at the truck.</p>
       </div>
TEXT : Paid by card. Your payment has gone through — nothing to pay at the truck.
```

🔴 **THIS IS THE EMAIL THAT SAID "Pay at the truck on collection" TO ORDER 24.** Same order, same request, same £6.50 taken — and it now says what happened.

⚠️ One harness artefact: `[actor] identity resolution failed … cookies was called outside a request scope` — the route's own `resolveActorSafe` degrading to `actor_kind: 'unknown'` exactly as designed when there is no Next request scope.

## Tooling

```
$ npx tsc --noEmit   -> clean
$ npx eslint lib/email.ts lib/payments/email-payment-state.ts app/api/dashboard/action/route.ts
   20 problems before, 20 problems after  (all pre-existing `any`/unused warnings)
```
⚠️ tsc-clean is not verification and is not offered as any. The evidence above is intercepted bytes.

---

# 🔴 NON-ASCII CENSUS

| File | Before | After | Distinct set |
|---|---|---|---|
| `lib/email.ts` | 81 / **16** | 91 / **16** | `£ · × – — … → ↳ ⏰ ✓ 🎁 🎉 📍 📝 📞 🔔` **identical** |
| `app/api/dashboard/action/route.ts` | 2702 / **16** | 2778 / **16** | `£ § · à – — … → ⇒ ─ ⚠ ✅ ✓ 🔔 🔴 ️` **identical** |

✅ **NO FILE GAINED A CHARACTER CLASS IT DID NOT ALREADY CONTAIN.** In particular `lib/email.ts` has never carried `🔴`, `⚠️` or `─`, so every comment added to it is written without them.

**New file** (no baseline; every character drawn from classes already in the codebase):

| File | Total | Distinct |
|---|---|---|
| `lib/payments/email-payment-state.ts` | 217 | 5 — `— ─ ⚠ 🔴 ️` |

---

# Flagged, and not done

- 🔴 **promote-draft's email still says "your card is held" for an auto-accepted, already-captured order.** Left alone by explicit instruction. §V(a) shows the exact bytes and the one-line change.
- 🔴 **The out-of-order arrival on order 24** — "confirmed / pay at the truck" landed 334 ms **before** "received / card held", because promotion's tail is slow. Correct copy will not fix a confirmation that overtakes its own placement email.
- ⚠️ **Editing an order whose card is already captured** changes the total; the captured amount does not follow it. The customer is now told the new total **and** that their payment went through — both true, and they do not add up. Reconciling a repriced capture is a money change and out of scope. Recorded at `action/route.ts:768-771`.
- ⚠️ **`sendCancellationEmail` still branches on `paymentStatus === 'paid'`** and promises *"your refund will be processed automatically"*. These are direct charges, so HatchGrab cannot issue it. Not in the four sites named by the brief; unchanged.
- **What wrote `orders.updated_at = 21:24:33.822` on order 25** — still not established. It sent no email; that much is now certain.
