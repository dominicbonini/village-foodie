# The edit path reconsiders money

BUILD. 13 August 2026.

**No `next dev`, no `next build`, no commit, no deploy. No migration was needed and none was written** — every value this work produces (`part_paid`, `unpaid`, `paid`, `refund_due`) is already in the `payment_status` CHECK, no column was added, and no table was altered.

**Four files changed**, all inside the stated scope:

```
app/api/dashboard/action/route.ts   |  57 +++++++++++++-
lib/email.ts                        |  73 +++++++++++++++++-
lib/payments/capture.ts             | 118 ++++++++++++++++++++++------
lib/payments/email-payment-state.ts | 150 ++++++++++++++++++++++++++++++++----
```

`npx tsc --noEmit` exits 0.

**THE RULE, AS GIVEN, IS WHAT THE CODE NOW DOES:** the authorisation is fixed at what the customer agreed to; an operator's edit never increases what is taken from the card; up captures the hold and the rest is due at the hatch; down captures the lower amount.

---

## 1. `recalcOrderPayment` ON THE EDIT PATH

### Where, and why there

`app/api/dashboard/action/route.ts`, immediately after the `orders.update` write and its error check, **before** the production-slot re-booking and **before** the customer email:

```ts
      if (updateErr) {
        console.error('[edit] order update failed:', updateErr.message, updateErr.details, updateErr.hint)
        return NextResponse.json({ error: 'Could not save the changes to this order' }, { status: 500 })
      }

      // ── 🔴 THE TOTAL MOVED, SO THE MONEY QUESTION HAS A NEW ANSWER. RECOMPUTE IT. ────────────────
      ...
      try {
        const recalculated = await recalcOrderPayment(supabase, orderKey)
        console.log(
          `[edit] order_key=${orderKey} repriced to ${newTotalMinor} — payment cache recomputed: ` +
          `status=${recalculated.status} paid_minor=${recalculated.paidMinor} balance_minor=${recalculated.balanceMinor}`,
        )
      } catch (recalcErr) {
        console.error(
          `[edit] 🔴 PAYMENT CACHE NOT UPDATED for order_key=${orderKey} after repricing to ${newTotalMinor} — ` +
          `orders.payment_status and amount_paid still describe the OLD total. The edit IS saved and the ` +
          `ledger is unaffected; re-run recalcOrderPayment for this order to repair:`,
          recalcErr instanceof Error ? recalcErr.message : recalcErr,
        )
      }
```

Three reasons for that exact position:

1. **After the write, because it recomputes against the NEW total.** `balance = total_minor − paid`; run a line earlier and it would recompute the answer that was already there.
2. **Before the email, because the email asks the same question.** `resolveEmailPayment` a few lines below reads the ledger and the draft; putting the recalc first means the sentence the customer gets and the row a refetching dashboard reads describe one instant, not two.
3. **Inside the same request, not deferred.** The operator presses Save and the board refetches within a second. A queued or webhook-driven repair would leave a window in which the column and the card disagree, which is the state this whole fix exists to end.

**Non-fatal, deliberately, and in the shape this handler already uses.** The slot re-booking below it fails into a `slotWarning` rather than a rollback, for the stated reason that "losing the operator's edit over it would be far worse". The same argument is stronger here: the edit is already saved, **the ledger is untouched by an edit**, and every ledger-derived surface (the card, the printed ticket, all five emails) is correct with or without this line. The one realistic failure is a `23514` CHECK violation on a `part_refunded` value while migration `20260817` is still unapplied — and `recalcOrderPayment` names that migration in its own error text.

### It cannot surprise an operator mid-service

The reasoning, and then the measured proof.

**It decides nothing.** It reads the ledger and writes an absolute value: `payment_status = getOrderBalance(...).status` and `amount_paid = paidMinor`. An edit does not touch `order_payments`, so **`amount_paid` cannot move at all** — for order 59 it was rewritten to the same `6.50` it already held. Only `payment_status` can change, and only to the answer `getOrderBalance` was **already giving the operator's card**: `components/dashboard/OrderCard.tsx:216-217` says "getOrderBalance is the SAME pure function the server rollup uses, so the card and orders.payment_status can never disagree" — a claim that was false until this line existed and is now true.

Every transition it can produce, computed from the real `getOrderBalance` (pure, no writes):

```
  unpaid, edited up             {"paidMinor":0,"balanceMinor":1300,"status":"unpaid"}
  unpaid, edited down           {"paidMinor":0,"balanceMinor":500,"status":"unpaid"}
  captured 650, edited up       {"paidMinor":650,"balanceMinor":650,"status":"part_paid"}
  captured 650, edited down     {"paidMinor":650,"balanceMinor":-150,"status":"refund_due"}
  captured 650, untouched       {"paidMinor":650,"balanceMinor":0,"status":"paid"}
```

- An **unpaid** order — every pay-at-hatch and walk-up order, and every held card order before capture — **does not move at all**, in either direction. That is the overwhelming majority of edits during a service, and for them this line is a no-op that costs two indexed reads.
- **`paid` to `part_paid`** is the order-59 case. The card was already showing `£6.50 paid, £6.50 due`; now the column agrees.
- **`paid` to `refund_due`** is the only transition an operator has not already been shown, and it needs an order that was **captured** and then edited **downward**. The card does not change appearance: `SETTLED_STATUSES` includes `refund_due`, so it still reads PAID (verified below, case 4). Nothing new is asked of the operator mid-service. ⚠️ It also means nothing prompts anyone to return the difference — `refund_due` still has no consumer. That is a standing item, it is outside the decided rule (which is about holds, not captures), and the brief forbids building the refund UI. **Flagged, not built.**

### It also repairs the sweep's premise

`find_stranded_authorisations` filters `payment_status not in ('paid','refund_due')` on the stated grounds that the column "IS NOT A SECOND OPINION" because only `recalcOrderPayment` writes it. That premise is now true again on the edit path: an order paid in cash and then edited upward moves to `part_paid`, so the sweep sees it instead of skipping it as `paid`. No change was made to the sweep, as instructed.

---

## 2. PARTIAL CAPTURE FOR A DOWNWARD EDIT

### How the amount is passed

`lib/payments/capture.ts`, step 2c decides the number and step 3 sends it:

```ts
    const captureMinor = Math.min(balance.balanceMinor, authorisedMinor)
    const isPartialCapture = captureMinor < authorisedMinor
```

```ts
      const captured = await stripe.paymentIntents.capture(
        piId,
        isPartialCapture ? { amount_to_capture: captureMinor } : {},
        { stripeAccount: account },
      )
```

🔴 **`amount_to_capture` is sent only when it LOWERS the amount.** A full capture is the same empty-params call it has always been, so an unedited order cannot change behaviour by a byte (proved in case (e)).

`authorisedMinor` is `order_drafts.total_minor` — what the customer agreed to, written once at draft creation and never revised by any of the five updates that table takes.

### The SDK accepts it — from the installed types, not from memory

`stripe@22.4.0`, `node_modules/stripe/cjs/resources/PaymentIntents.d.ts`:

```ts
    capture(id: string, params?: PaymentIntentCaptureParams, options?: RequestOptions): Promise<Response<PaymentIntent>>;   // :75
```

```ts
export interface PaymentIntentCaptureParams {                                                                              // :8356
    /**
     * The amount to capture from the PaymentIntent, which must be less than or equal to the original amount. Defaults to the full `amount_capturable` if it's not provided.
     */
    amount_to_capture?: number;
```

"must be less than or equal to the original amount" is exactly the rule as decided, enforced by Stripe as well as by `Math.min`.

### The remainder is released by Stripe — from the documentation

`docs.stripe.com/payments/place-a-hold-on-a-payment-method`, verbatim:

> "To capture the authorized funds, make a PaymentIntent capture request. This captures the total authorized amount by default. **To capture less or (for certain online card payments) more than the initial amount, pass the `amount_to_capture` option. A partial capture automatically releases the remaining amount.**"

and the constraint that makes the number final:

> "you can only perform one capture on an authorized payment for most payments. **If you partially capture a payment, you can't perform another capture for the difference.**"

Both quotes are in the code, at the call site, so the next reader does not have to take it on trust. **Nothing in this build releases anything by hand** — there is no second Stripe call.

### A partial capture is written down

Because the ledger records what was *taken* and nothing else would record what was *released*:

```
select * from action_audit_log where action = 'capture_partial' order by created_at desc;
```

`logAction`'s `action` field is `string` (`lib/audit/actionAudit.ts:44`), so no type or migration was needed. The row carries `captured_minor`, `requested_minor`, `released_minor` and `paid_minor_before`.

---

## 3. THE GUARD: LOWER BALANCE CAPTURES LESS, SETTLED STILL REFUSES

**Removed** — the refusal that took nothing at all:

```ts
    if (balance.balanceMinor < authorisedMinor) {
      ...
      await recordCaptureRefusal(supabase, args, piId, 'part_paid', balance, authorisedMinor)
      return { status: 'not_owed', ..., reason: 'part_paid', ... }
    }
```

**Kept, character for character** — the 12 August double-charge fix:

```ts
    if (balance.balanceMinor <= 0) {
      // 🔴 THE ORDERS 18-AND-19 CASE. Nothing is owed; somebody has already been paid.
      ...
      await recordCaptureRefusal(supabase, args, piId, 'settled', balance, authorisedMinor)
      return { status: 'not_owed', paymentIntentId: piId, reason: 'settled', ... }
    }
```

Everything else in the function is untouched: the draft read, the `authorization_cancelled_at` check, the `stripe_pi:` ledger pre-check (idempotency layer 1), the balance-read failure refusal, the `ALREADY_CAPTURED` / `GONE` handling, the ledger write and its failure path.

The `not_owed.reason` union still carries `'part_paid'`; **nothing emits it any more**, and the type comment says so, so an older persisted result or an exhaustive switch elsewhere still type-checks.

⚠️ **One consequence stated plainly.** The old `part_paid` refusal also covered an order **part-paid in cash** whose hold was for the whole order. That case now captures the outstanding balance rather than refusing — which is the same rule ("never more than was agreed", and here rather less), takes only what is owed, and cannot overcharge. It is strictly better than refusing, which left the truck unpaid.

---

## 4. THE SENTENCE FOR A HOLD THAT IS TOO SMALL

A sixth state, `'held_short'`, distinct from `'part_paid'` because **no money has moved**: the card is standing by for the amount the customer agreed to and an edit has taken the order past it.

`lib/payments/email-payment-state.ts` now re-examines `'held'` the way it already re-examined `'captured'`:

```ts
  if (state === 'held') {
    if (typeof facts.heldMinor !== 'number') return facts
    try {
      const balance = await readOrderBalance(supabase, orderKey)
      if (balance.balanceMinor > facts.heldMinor) {
        return { state: 'held_short', paidMinor: balance.paidMinor, balanceMinor: balance.balanceMinor, heldMinor: facts.heldMinor }
      }
      return { ...facts, paidMinor: balance.paidMinor, balanceMinor: balance.balanceMinor }
    } catch (err) { ... return { state: 'unknown' } }
  }
```

⚠️ **An edit DOWNWARD stays plain `'held'`** — the hold is bigger than the order, capture takes the lower amount, and there is genuinely nothing to pay at the truck. ⚠️ **A balance that cannot be read becomes `'unknown'`**, the same fail-safe the `'captured'` branch uses: `'held'` asserts "nothing to pay at the truck", which is the other sentence that cannot be walked back once sent.

`resolveEmailPaymentState` keeps its signature (it is now a one-line wrapper), so the four other send sites are untouched. The edit site uses the new `resolveEmailPayment`, which returns the figures it computed anyway — **removing a duplicate `readOrderBalance` call** that ran a dozen lines later on the same two rows.

### THE COPY

**HTML** (amber, matching part-paid, because money IS owed at the window — not the indigo of a hold that covers everything):

```html
<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px;margin-top:12px;text-align:center">
  <p style="margin:0;font-size:16px;font-weight:800;color:#92400e">Your card is held for part of this order &mdash; £6.50 still to pay</p>
  <p style="margin:6px 0 0;font-size:13px;color:#b45309">Test Kitchen takes the £6.50 held when they confirm your order. The remaining £6.50 is due when you collect.</p>
</div>
```

**Plain text:**

```
Your card is held for £6.50, which Test Kitchen takes when they confirm your order. £6.50 of this order is still to pay when you collect.
```

**Short** (the edit email's footer line): `Card held for part of this order, £6.50 still to pay`
**Ready-email suffix:** ` £6.50 still to pay.`

**Without figures** — a caller that could not cheaply produce a balance gets the same sentence, vaguer and still true:

```
text : Your card is held for part of this order. Test Kitchen takes the amount held when they confirm your order, and the rest is due when you collect.
short: Card held for part of this order
```

The word "paid" appears nowhere in it, because nothing has been.

### THE OTHER FIVE STATES ARE BYTE-IDENTICAL

Measured against a baseline built by removing **only** the new `case 'held_short'` block from the current file (2,073 characters) — i.e. the exact file as it stood before this turn — and running both through `paymentNote` and through the whole of `formatConfirmationEmail`:

```
  captured  amounts=no   BYTE-IDENTICAL      captured  amounts=yes  BYTE-IDENTICAL      captured  with heldMinor  BYTE-IDENTICAL
  part_paid amounts=no   BYTE-IDENTICAL      part_paid amounts=yes  BYTE-IDENTICAL      part_paid with heldMinor  BYTE-IDENTICAL
  held      amounts=no   BYTE-IDENTICAL      held      amounts=yes  BYTE-IDENTICAL      held      with heldMinor  BYTE-IDENTICAL
  hatch     amounts=no   BYTE-IDENTICAL      hatch     amounts=yes  BYTE-IDENTICAL      hatch     with heldMinor  BYTE-IDENTICAL
  unknown   amounts=no   BYTE-IDENTICAL      unknown   amounts=yes  BYTE-IDENTICAL      unknown   with heldMinor  BYTE-IDENTICAL

  formatConfirmationEmail captured  BYTE-IDENTICAL
  formatConfirmationEmail part_paid BYTE-IDENTICAL
  formatConfirmationEmail held      BYTE-IDENTICAL
  formatConfirmationEmail hatch     BYTE-IDENTICAL
  formatConfirmationEmail unknown   BYTE-IDENTICAL
  formatConfirmationEmail held_short renders: "Your card is held for part of this order"
```

The third column matters: passing the new `heldMinor` field to any of the five other states changes nothing — only `'held_short'` reads it.

⚠️ **A stated limit.** Only the edit email passes figures today; the confirm, time-adjust, ready and promotion emails pass a state and no amounts, so they render the figure-free variant of `'held_short'` and of `'part_paid'`. That is pre-existing and correct-but-vaguer. Threading amounts into those four sites was not in scope and was not done.

---

## 5. WHAT THE OPERATOR SEES ON THE CARD, FOR EACH CASE

Real `OrderCard`, server-rendered with real ledger rows (`account_is_test` stamped exactly as `/api/dashboard` stamps it), one render per case:

| Case | CARD HELD chip | PAID badge | Part-paid row | Offers "Mark paid" |
|------|----------------|-----------|---------------|--------------------|
| **held, edited UP** (hold £6.50, total £13.00) | `CARD HELD` | — | — | no |
| **held, edited DOWN** (hold £6.50, total £5.00) | `CARD HELD` | — | — | no |
| **captured, edited UP** (paid £6.50, total £13.00) | — | — | `£6.50 paid, £6.50 due` | yes |
| **captured, edited DOWN** (paid £6.50, total £5.00) | — | `PAID` | — | no |

Read as behaviour:

- **Held and edited up.** The order reads unpaid for its full new total, with the CARD HELD chip. The operator is not offered "Mark paid" (the held-authorisation guard), and at confirmation the hold is captured and the card flips to `£6.50 paid, £6.50 due` — which is the moment the remainder becomes collectable. ⚠️ The chip does not say the hold is only *part* of the total; the customer's email now does, the card does not. Changing the chip was not in scope. **Flagged.**
- **Held and edited down.** Identical display, and at confirmation the card is charged the lower amount and the order reads `paid`.
- **Captured and edited up.** The amber part-paid row, tappable, with the remainder due — unchanged from the previous build, and now the `payment_status` column agrees with it.
- **Captured and edited down.** Still reads `PAID` (the column is `refund_due`, which `SETTLED_STATUSES` treats as settled). Nothing prompts a refund; see §1.

---

## VERIFICATION

Everything below ran against the real Supabase project and the real Stripe sandbox connected account `acct_1U30w22fB4PPCw2D`, with `sk_test_`.

### (a) Order 59 — the column, and two stale consumers before and after

**One write: `recalcOrderPayment` on order 59.** Not reverted — the new value is the correct one.

Emails were **intercepted at `globalThis.fetch` before `lib/email` was imported**; every Brevo call was captured and none was transmitted. Any fetch to a host other than Brevo or Supabase would have thrown.

```
LEDGER (the authority): [{"kind":"charge","channel":"online","amount_minor":650,"livemode":false}]

---- BEFORE  (column as the edit left it) ----
  orders row            : payment_status=paid  amount_paid=6.5  total=13 (1300p)
  [3.2] /api/orders/[id]: payment_status="paid"  total=13
  [3.1] manage page line: "Paid by card"
  [3.3] confirm screen  : "Paid by card"
  [3.4] cancellation email promises a refund? true
        refund sentence : "<p>Your refund will be processed automatically within 3–5 working days.</p>"
        emails actually transmitted: 0 (intercepted: 1)

>>> WRITE: recalcOrderPayment(order 59) — the call the edit handler now makes
    returned: {"paidMinor":650,"balanceMinor":650,"status":"part_paid"}

---- AFTER   (column recomputed from the ledger) ----
  orders row            : payment_status=part_paid  amount_paid=6.5  total=13 (1300p)
  [3.2] /api/orders/[id]: payment_status="part_paid"  total=13
  [3.1] manage page line: "Pay at the truck"
  [3.3] confirm screen  : "Pay at the truck"
  [3.4] cancellation email promises a refund? false
        refund sentence : "(none)"
        emails actually transmitted: 0 (intercepted: 1)
```

*([3.1] and [3.3] are two different files carrying the same predicate; both were evaluated character for character as written, against the value the real route handler returned.)*

Three of the six stale consumers were exercised end to end, with the **real** route handler and the **real** email builder:

- `app/api/orders/[id]/route.ts` — the route that feeds the other two — now returns `part_paid`.
- `app/order/[id]/manage/page.tsx:163-164` — no longer tells a customer who owes £6.50 that they are "Paid by card".
- `lib/email.ts:559` — **no longer promises an automatic refund** this codebase cannot issue.

The remaining three (the confirmation screen, the sweep's SQL predicate, the type union) read the same corrected column. **Not one of the six was edited**, exactly as instructed: fixing the column is the fix.

### (b) A held order edited DOWN, then confirmed

Hold £13.00, order edited to £5.00.

```
  created pi=pi_3U3vn92fB4PPCw2D0kVMBmIZ
    {"status":"requires_capture","amount":1300,"amount_capturable":1300,"amount_received":0,
     "charge_amount":1300,"charge_captured":false,"charge_amount_captured":0,"amount_authorized":1300}
  after edit + recalcOrderPayment: {"paidMinor":0,"balanceMinor":500,"status":"unpaid"}
  email facts: {"state":"held","heldMinor":1300,"paidMinor":0,"balanceMinor":500}
  email short: "Your card is held, not charged"

[capture] PARTIAL CAPTURE order_key=...b (confirm): the hold is for 1300 and the order owes 500, so 500
was taken from pi=pi_3U3vn92... and Stripe released the remaining 800. That difference is NOT recoverable
from this hold — a capture cannot be repeated for the difference.
[capture] CAPTURED order_key=...b pi=pi_3U3vn92... amount_minor=500 trigger=confirm -> status=paid

  captureOnConfirmation -> {"status":"captured","paymentIntentId":"pi_3U3vn92...","amountMinor":500}
  stripe now: {"status":"succeeded","amount":1300,"amount_capturable":0,"amount_received":500,
               "charge_amount":1300,"charge_captured":true,"charge_amount_captured":500,"amount_authorized":1300}
  ledger    : [{"kind":"charge","channel":"online","amount_minor":500,"idempotency_key":"stripe_pi:pi_3U3vn92..."}]
  balance   : {"paidMinor":500,"balanceMinor":0,"status":"paid"}
  audit     : [{"action":"capture_partial","amount_minor":500,"after_state":{"captured_minor":500,
                "requested_minor":500,"released_minor":800,"paid_minor_before":0, ...}}]
```

🔴 **£5.00 taken from a £13.00 hold. `amount_capturable` is 0 and `amount_received` is 500 against an `amount_authorized` of 1300 — Stripe released the £8.00 itself, with no second call from us.** Before this build, this order captured **nothing** and the hold expired in silence.

### (c) A held order edited UP, then confirmed

Hold £6.50, order edited to £13.00.

```
  created pi=pi_3U3vnD2fB4PPCw2D0iRa9cDg  {"status":"requires_capture","amount":650,"amount_capturable":650, ...}
  after edit + recalcOrderPayment: {"paidMinor":0,"balanceMinor":1300,"status":"unpaid"}

  🔴 email facts: {"state":"held_short","paidMinor":0,"balanceMinor":1300,"heldMinor":650}
  🔴 email short: "Card held for part of this order, £6.50 still to pay"
  🔴 email text : "Your card is held for £6.50, which Test Kitchen takes when they confirm your order.
                   £6.50 of this order is still to pay when you collect."

  captureOnConfirmation -> {"status":"captured","paymentIntentId":"pi_3U3vnD2...","amountMinor":650}
  stripe now: {"status":"succeeded","amount":650,"amount_capturable":0,"amount_received":650, ...}
  ledger    : [{"kind":"charge","channel":"online","amount_minor":650,"idempotency_key":"stripe_pi:pi_3U3vnD2..."}]
  balance   : {"paidMinor":650,"balanceMinor":650,"status":"part_paid"}
  email after confirm: {"state":"part_paid", ...} -> "£6.50 paid, £6.50 still to pay"
```

The held amount and only the held amount was captured; the balance reads `part_paid`; and the edit email said so **before** the customer walked to the window. Under the old code that email said "Your card is held, not charged — nothing to pay at the truck."

### (d) A settled order — the 12 August fix does not regress

Hold £6.50; the order is paid £6.50 **in cash** at the hatch; then confirmation runs.

```
  marked paid in person: {"paidMinor":650,"balanceMinor":0,"status":"paid"}

[capture] 🔴 REFUSING TO CAPTURE order_key=...d (confirm): the order is ALREADY SETTLED —
paid_minor=650, balance=0, status=paid. Capturing pi=pi_3U3vnG2... would charge this customer a second
time. The hold is untouched and still needs releasing or claiming by hand.

  captureOnConfirmation -> {"status":"not_owed","reason":"settled","paidMinor":650,"balanceMinor":0,"authorisedMinor":650}
  stripe now: {"status":"requires_capture","amount":650,"amount_capturable":650,"amount_received":0,
               "charge_captured":false,"charge_amount_captured":0}
  ledger    : [{"kind":"charge","channel":"in_person_other","amount_minor":650,
                "idempotency_key":"collect:...d:0:650"}]
  audit     : [{"action":"capture_not_owed", "after_state":{"reason":"settled","captured":false, ...}}]
```

**Refused. Nothing captured, `charge_captured: false`, the hold untouched.** Yesterday's fix is intact.

### (e) An unedited order — capture is unchanged

Hold £6.50, order £6.50, no edit.

```
  created pi=pi_3U3vn52fB4PPCw2D1LToEinx  {"status":"requires_capture","amount":650,"amount_capturable":650, ...}
  email short: "Your card is held, not charged"
[capture] CAPTURED order_key=...e pi=pi_3U3vn52... amount_minor=650 trigger=confirm -> status=paid
  stripe now: {"status":"succeeded","amount":650,"amount_capturable":0,"amount_received":650,
               "charge_amount":650,"charge_captured":true,"charge_amount_captured":650,"amount_authorized":650}
  balance   : {"paidMinor":650,"balanceMinor":0,"status":"paid"}
  audit     : []          <- no capture_partial row; no amount_to_capture was sent
```

Full amount, empty params, empty audit. The ordinary card order is byte-identical.

### EVERY WRITE, AND THE CLEANUP

**Supabase, permanent:**
- `orders` row for order 59: `payment_status` `paid` -> `part_paid`, `amount_paid` unchanged at `6.50`. **Deliberately not reverted** — reverting would restore a false value.

**Supabase, created and deleted:**
- 4 `orders` rows, 4 `order_drafts` rows, 4 `order_payments` rows, 2 `action_audit_log` rows, all under four fixed synthetic `order_key`s (`11111111-0000-4000-8000-00000000000b/c/d/e`). No real order was touched.

**Cleanup proof.** The captures make Stripe emit `payment_intent.succeeded` to the **deployed** webhook, which writes the same rows under the same keys. Deleting while that is in flight is exactly the race that caused a production 500 on 12 August, so the harness **waited 45s, re-polled 15s apart, and only deleted once the row count had stopped moving**:

```
waiting 45s for the deployed webhook to finish with these intents before deleting...
  ledger rows for the harness orders: 4 then 4 — settled
  cancelled the uncaptured hold pi=pi_3U3vnG2fB4PPCw2D1Wf4skr3 -> canceled
  deleted action_audit_log / order_payments / orders / order_drafts rows: ok, ok, ok, ok
  leftovers: {"order_payments":0,"orders":0,"order_drafts":0,"action_audit_log":0}
```

**Stripe, permanent sandbox artifacts** (test charges cannot be deleted):

```
pi_3U3vn52fB4PPCw2D1LToEinx   captured 650   (e)
pi_3U3vn92fB4PPCw2D0kVMBmIZ   captured 500 of 1300, 800 released   (b)
pi_3U3vnD2fB4PPCw2D0iRa9cDg   captured 650   (c)
pi_3U3vnG2fB4PPCw2D1Wf4skr3   never captured, CANCELLED in cleanup   (d)
pi_3U3vmm2fB4PPCw2D1DFmp0F8   from a first run that aborted on a NOT NULL constraint; CANCELLED
```

No hold was left live. **No email was transmitted at any point** — the only email code exercised was behind the fetch intercept, and the capture path sends none.

---

## NON-ASCII CENSUS

| File | Before | After | Distinct before | Distinct after | Character classes |
|------|--------|-------|-----------------|----------------|-------------------|
| `app/api/dashboard/action/route.ts` | 2860 | 2974 | 16 | 16 | unchanged |
| `lib/payments/capture.ts` | 642 | 810 | 6 | 6 | unchanged |
| `lib/payments/email-payment-state.ts` | 390 | 422 | 5 | 5 | unchanged |
| `lib/email.ts` | 94 | 95 | 16 | 16 | unchanged |

Vocabularies, before and after, identical in each file:

```
app/api/dashboard/action/route.ts   🔴—─⚠️→·–§⇒£✓à…✅🔔
lib/payments/capture.ts             🔴─—⚠️…
lib/payments/email-payment-state.ts 🔴─—⚠️
lib/email.ts                        —£📝×🎁↳📍→…🎉✓🔔·⏰📞–
```

**No file gained a character class.** `lib/email.ts` gained exactly one character — the single `£` in the new sentence's money helper, a character it already used 
in the `part_paid` branch. `email-payment-state.ts` has never contained `£` or `…`, and the new comments there use `--` and plain full stops accordingly.

---

## FLAGS

- **Nothing in the prompt arrived garbled**, and no instruction contradicted another. Nothing outside the WHAT NOT TO TOUCH list was changed: no refund UI, no change to `getOrderBalance` or the CHECK constraint, no change to promotion, the sweeps or the refund event handlers, and **none of the six stale consumers was edited**.
- **No migration is needed.** `part_paid`, `unpaid`, `paid` and `refund_due` are all already in the CHECK.
- 🔴 **Two things are recorded rather than built**, both outside the decided rule and both previously known: `refund_due` still has no consumer (a captured order edited downward produces it and nothing prompts a refund), and the operator's CARD HELD chip does not say the hold covers only part of the total — the customer's email now does, the card does not.
- ⚠️ **Standing items unaffected by this work**: migrations `20260816` and `20260817` still need running by hand; `refund.failed` still needs subscribing in Stripe; Link is still on for `acct_1U30w22fB4PPCw2D`.
