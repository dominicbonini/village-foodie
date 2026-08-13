# The edit path does not reconsider money

READ-ONLY DIAGNOSIS. 13 August 2026.

**No file was changed. No file was created except this one. No `next dev`, no `next build`, no commit, no deploy. No fix is proposed or applied.** Two read-only Node probes were run against the live database (SELECT only, both print `WRITES PERFORMED: 0`); their output is quoted below. No Stripe write of any kind was made; the Stripe evidence in Q6 and Q7 comes from the installed SDK's `.d.ts` files and from Stripe's own documentation pages, fetched and quoted verbatim.

Every answer is labelled **QUOTED** (read out of a file, a database row, an SDK type or a Stripe doc) or **INFERRED** (reasoning over those facts). Where something could not be established it says so.

---

## THE HEADLINE

`recalcOrderPayment` — which `lib/payments/ledger.ts:459` calls *"the ONLY writer of payment_status/amount_paid"* — **has no call site anywhere on the edit path**. The edit writes `total` and `total_minor` and leaves the two derived money caches holding the answer to a question that is no longer being asked.

Live, right now, for order 59:

```
#59  status=modified  total_minor=1300  col.payment_status=paid  col.amount_paid=6.5
     ledgerPaid=650   balance=650       draftAuth=650                <<< COLUMN vs LEDGER
```

Every surface that computes from `order_payments` is correct (the card, the printed ticket, the four emails that go through `resolveEmailPaymentState`). Every surface that reads the column is wrong, and one of them **promises the customer a refund**.

Problem 2 — a HELD order edited upward — **has no live instance**; there is not one uncaptured authorisation in the database. It is described from the code, and the code says the customer is told *"Your card is held, not charged … Nothing to pay at the truck"* for an order whose hold covers half of it. `lib/payments/email-payment-state.ts:93-98` already declares that limit in a comment.

---

## LIVE EVIDENCE

Order 59, read directly (probe 2, SELECT only):

```json
{ "id": "59", "order_key": "b97b132e-df1f-4d7c-9d63-51eac9435e0f",
  "status": "modified", "paid_at": null, "collected_at": null,
  "payment_status": "paid", "amount_paid": 6.5,
  "total": 13, "total_minor": 1300,
  "customer_email": "dominicbonini@hotmail.com",
  "created_at": "2026-08-13T09:10:03.715959+00:00",
  "updated_at": "2026-08-13T09:39:14.047974+00:00" }

LEDGER: [{ "kind":"charge", "channel":"online", "amount_minor":650, "state":"succeeded",
           "idempotency_key":"stripe_pi:pi_3U3udz2fB4PPCw2D0eRIWF9A", "livemode":false,
           "created_at":"2026-08-13T09:10:05.358307+00:00" }]

DRAFT:  { "total_minor":650, "payment_intent_id":"pi_3U3udz2fB4PPCw2D0eRIWF9A",
          "promoted_at":"2026-08-13T09:10:03.197+00:00", "authorization_cancelled_at":null }
```

QUOTED. The order was captured at 09:10:05 for 650p and edited at 09:39:14 to 1300p. `payment_status` and `amount_paid` still describe 09:10.

**QUOTED — and it is order 59 alone.** The same probe swept the forty most recent `test-truck` orders and flagged every row where the column and the ledger disagree. Exactly one row is flagged. Nothing else in the visible history has been edited after payment.

---

## 1. THE EDIT HANDLER, END TO END

**QUOTED.** `app/api/dashboard/action/route.ts:609-858`. In order:

| # | Lines | What it does | Touches money? |
|---|-------|--------------|----------------|
| 1 | 610-616 | Destructures `items, slot, notes, deals, customerName, customerEmail, customerPhone, confirmUnresolvedTotal` from the body | no |
| 2 | 617-618 | `select('*')` the order by `order_key` + `truck_id`; 404 if absent | read |
| 3 | 634-636 | `effItems` / `effDeals` fall back to the STORED row; `loadPriceBook(supabase, truck.id)` | read |
| 4 | 644-660 | Resolves the discount code from `discount_codes_db`; a deleted code degrades to a fixed discount and is pushed to `unresolvedDiscount` | read |
| 5 | 664-668 | `repriceOrder(effItems, effDeals, priceBook, { items: order.items, deals: order.deals }, discountCodeRow)` — price-lock: the stored row is the price source | no |
| 6 | 669-677 | `newSubtotal`, `newDiscountAmt`, `newTotalMinor = toMinor(...)`, `newTotal = newTotalMinor / 100` | computes a total |
| 7 | 698-709 | If any line is unpriceable and the operator has not echoed the exact figure, returns **409 `needsPriceConfirm`**. Nothing is written on this branch | no |
| 8 | 717-726 | Canonicalises deals to the Add-Order shape | no |
| 9 | **732-753** | **THE WRITE** | writes the total |
| 10 | 754-757 | Checks the write; 500 `Could not save the changes to this order` on failure | no |
| 11 | 762-785 | Production-slot unbook/rebook; failure is a `slotWarning`, never a rollback | no |
| 12 | 787-851 | The customer email, only if `order.customer_email` | **reads** the ledger |
| 13 | 852-857 | `200 { success: true, status: 'modified', total: newTotal, slotWarning? }` | no |

The write itself, verbatim (`:732-753`):

```ts
const { error: updateErr } = await supabase.from('orders').update({
  items:    repriced.items,
  deals:    dealsToStore,
  slot:     newSlot,
  notes:    notes    !== undefined ? notes : order.notes,
  customer_name:  customerName  !== undefined ? ((customerName || '').trim() || 'Walk-up') : order.customer_name,
  customer_email: customerEmail !== undefined ? (customerEmail || null) : order.customer_email,
  customer_phone: customerPhone !== undefined ? (customerPhone || null) : order.customer_phone,
  total:       newTotal,
  subtotal:    newSubtotal,
  discount_amt: newDiscountAmt,
  // §4a — pence, derived server-side from the server total. Never client-supplied.
  total_minor: newTotalMinor,
  status:   'modified',
}).eq('order_key', orderKey).eq('truck_id', truck.id)
```

Twelve columns. `payment_status` is not among them. `amount_paid` is not among them. `order_drafts` is not touched. No Stripe call is made.

Everything the handler does about money is **read-only**, and all of it is in the email block (`:798-813`):

```ts
const paymentState = await resolveEmailPaymentState(supabase, orderKey)
let payAmounts: { paidMinor: number; balanceMinor: number } | undefined
try {
  const b = await readOrderBalance(supabase, orderKey)
  payAmounts = { paidMinor: b.paidMinor, balanceMinor: b.balanceMinor }
} catch (balErr) {
  console.error(`[edit] could not read the balance for order_key=${orderKey} — the update email will omit the figures:`, ...)
}
const payNote = paymentNote(paymentState, truck.name, payAmounts)
```

`readOrderBalance` is `recalcOrderPayment` **without the write-back** — `lib/payments/ledger.ts:470` says exactly that: *"recalcOrderPayment without the write-back — the same two reads, the same getOrderBalance, and nothing touched."* So the edit path computes the correct balance, renders it into an email, and throws it away.

**Is `recalcOrderPayment` called anywhere on that path? No.** QUOTED — `grep -rn "recalcOrderPayment" --include="*.ts" --include="*.tsx" .` returns four call sites, all inside the ledger module, plus one in `online.ts`, plus comments:

```
lib/payments/ledger.ts:584   inside recordPaymentEvent
lib/payments/ledger.ts:613   inside recordCollectionPayment
lib/payments/ledger.ts:731   inside reverseCollectionPayment   (reversal: 'none')
lib/payments/ledger.ts:742   inside reverseCollectionPayment   (reversal: 'deleted')
lib/payments/online.ts:234   inside removeFailedOnlineRefund
```

Every one of those is reached by a **ledger row moving**. The edit moves the *total*, and nothing in the design notices that the other side of the subtraction changed.

**INFERRED — the shape of the defect.** `balance = total_minor − paid`. There are two ways for that expression to change and only one of them triggers a recalculation. The system is wired to the numerator it expected to move.

---

## 2. `recalcOrderPayment`, IN FULL

**QUOTED.** `lib/payments/ledger.ts:456-509`, including its own docstring:

```ts
/**
 * RECOMPUTE the derived caches from the ledger and write them back to `orders`.
 * IDEMPOTENT by construction: it reads the full ledger and writes an absolute value, never a delta, so
 * re-running it converges from any starting state. This is the ONLY writer of payment_status/amount_paid.
 *
 * The write-back is also STRUCTURAL, not a convenience: a row in a separate table does not touch
 * `orders.updated_at`, and lib/orders/mergeOrders.ts version-guards on that value — so without this
 * update a cached dashboard would never learn a balance changed.
 *
 * Throws on any failure. Callers must surface it, never swallow it.
 */
export async function recalcOrderPayment(supabase: SupabaseClient, orderKey: string): Promise<OrderBalance> {
  const [order, rows] = await Promise.all([readOrder(supabase, orderKey), readLedger(supabase, orderKey)])
  const balance = getOrderBalance(order, rows)

  const { error } = await supabase
    .from('orders')
    .update({ payment_status: balance.status, amount_paid: fromMinor(balance.paidMinor) })
    .eq('order_key', orderKey)
  if (error) {
    const hint = error.code === '23514'
      ? ' — payment_status CHECK rejected the value; has 20260729_orders_payment_status_widen_check.sql been applied?'
      : ''
    throw new Error(`[ledger] write-back failed for ${orderKey}: ${error.message}${hint}`)
  }
  return balance
}
```

**What it reads** (QUOTED): `readOrder` (`:446-454`) selects `total, total_minor` from `orders` and **throws** if the row is missing; `readLedger` selects the shared `LEDGER_ROW_COLUMNS` for that one `order_key`, applies the order-key scope assertion, the widened mode filter and `annotateTestAccountRows`. Two indexed reads, run in parallel.

**What it writes**: exactly two columns, `payment_status` and `amount_paid`, on one row, by `order_key`. Absolute values, never deltas.

**Would calling it after an edit be safe?**

- **INFERRED — it cannot lose information.** The ledger is untouched by an edit; only the total moved. So `amount_paid` for order 59 would be rewritten to the same `6.50` it already holds, and only `payment_status` would move.
- **INFERRED — it is idempotent and order-independent**, by its own construction: it recomputes from scratch and writes an absolute value. Running it once after the edit, or ten times, or a week later, converges to the same answer.
- **QUOTED — the directions it can move.** `getOrderBalance`'s status branch:

```ts
if (paidMinor === 0 && hasRefundRow) status = 'refunded'
else if (paidMinor === 0)            status = 'unpaid'
else if (paidMinor < 0)              status = 'refund_due'
else if (balanceMinor < 0)           status = 'refund_due'
else if (balanceMinor === 0)         status = 'paid'
else if (hasRefundRow)               status = 'part_refunded'
else                                 status = 'part_paid'
```

  After an **upward** edit of a paid order: `paid` → `part_paid`. After a **downward** edit that takes the total below what was taken: `paid` → `refund_due`. An edit of an unpaid order: `unpaid` → `unpaid`, no change.

**Could it surprise an operator mid-service?** Three honest answers, all INFERRED:

1. `paid` → `part_paid` **would not** surprise: the card already shows `£6.50 paid, £6.50 due` because `OrderCard` computes from the ledger rows (`components/dashboard/OrderCard.tsx:216-217` — *"getOrderBalance is the SAME pure function the server rollup uses, so the card and orders.payment_status can never disagree"*, which is precisely the claim the missing recalc falsifies). The column would be catching up with what the operator is already looking at.
2. `paid` → `refund_due` **could** surprise, and it is the one direction worth naming. `refund_due` currently has no consumer — it is a standing item from an earlier report — and `OrderCard`'s `SETTLED_STATUSES = ['paid', 'refunded', 'part_refunded', 'refund_due']` treats it as settled, so the card would keep reading paid while the column changed underneath it. Nothing would tell anyone money is owed back. (See Q8: there is no way to send it.)
3. **It throws.** `recalcOrderPayment` throws on a missing order, on a read failure, and on a CHECK violation. On the edit path the operator's edit is *already written* by the time any recalc could run, so a throw would have to be handled as a warning like the slot re-booking failure at `:781-784` — or it would turn a saved edit into a 500. That is a real design question and this report does not answer it, per the brief.

**⚠️ QUOTED — one interaction worth flagging.** `recalcOrderPayment` also bumps `orders.updated_at`, and `lib/orders/mergeOrders.ts` version-guards on that value. The edit already writes the row once; a recalc after it would be a second bump within the same request.

---

## 3. EVERY CONSUMER READING THE STALE COLUMN

These do **not** compute a balance from `order_payments`. What each shows for order 59 *right now* is stated.

### 3.1 `app/order/[id]/manage/page.tsx:163-164` — the customer's cancel-link page 🔴

**QUOTED:**

```tsx
<span className={`font-medium ${order.payment_status === 'paid' ? 'text-green-600' : 'text-slate-900'}`}>
  {order.payment_status === 'paid' ? 'Paid by card' : 'Pay at the truck'}
</span>
```

**Order 59 today: green "Paid by card".** The customer owes £6.50. This is the page linked from the cancellation email, so it is reachable by the customer at any time.

*(This file also carries the opposite defect from a previous report — a HELD order reads "Pay at the truck" here. Same line, both directions.)*

### 3.2 `app/api/orders/[id]/route.ts:107` — the API that feeds it

**QUOTED:**

```ts
payment_status: order.payment_status ?? 'unpaid',
```

with the comment *"THE ORDER'S OWN STATE, NOT A CLAIM FROM A URL"* — which is true and is not the problem: the row itself is stale. **Order 59 today: returns `'paid'`.** This response feeds both 3.1 and the URL-reachable confirmation screen.

### 3.3 `app/trucks/[slug]/order/page.tsx:1832` + `:3437-3441` — the confirmation screen

**QUOTED:**

```tsx
paymentStatus={confirmOrder.payment_status ?? 'unpaid'}
...
{paymentStatus === 'paid' ? (
  <span className="font-bold text-green-600">Paid by card</span>
) : (
  <span className="font-bold text-slate-700">Pay at the truck</span>
)}
```

The comment above it anticipates `part_paid` — *"`part_paid` and `refunded` are legal values on this column and both fall to the not-paid branch, which is the safe direction"* — which is correct reasoning that never gets to run, because the column never becomes `part_paid`. **Order 59 today: "Paid by card"** on a screen that also prints `Total £13.00`.

### 3.4 `app/api/orders/cancel/route.ts:117` → `lib/email.ts:559,577` — the refund promise 🔴 THE WORST ONE

**QUOTED:**

```ts
paymentStatus: order.payment_status ?? null,
```

```ts
const refundLine = paymentStatus === 'paid'
  ? `<p>Your refund will be processed automatically within 3–5 working days.</p>`
  : ''
```

**Order 59 today: if the customer cancels, they are emailed a promise of an automatic refund.** Three things are wrong with that at once: only £6.50 was ever taken against a £13.00 order; the promise says "automatically"; and (Q8) **this codebase cannot issue a refund at all.** The word "automatically" is false for every order, not only for 59 — but a stale `'paid'` is what puts it in front of a part-paid customer.

### 3.5 `app/api/events/action/route.ts:238` — event cancellation

**QUOTED:** `paymentStatus: order.paid_at ? 'paid' : null` — a *different* stale source, `paid_at` rather than `payment_status`, feeding the same `refundLine` in `sendEventCancellationEmail` (`lib/email.ts:600`). **Order 59 today: `paid_at` is `null`** (probe above), so this one happens to say nothing. INFERRED: for a card order it is `paid_at` that is unreliable here — nothing on the capture path sets it — so this line is wrong in the *other* direction for genuinely paid card orders. Out of scope; recorded.

### 3.6 `supabase/migrations/20260816_find_stranded_authorisations_settled.sql:100` — a DB-side money decision 🔴

**QUOTED:**

```sql
and coalesce(o.payment_status, 'unpaid') not in ('paid', 'refund_due')
```

with the header's own justification: *"`orders.payment_status` IS NOT A SECOND OPINION. It is written by exactly one function — recalcOrderPayment … from getOrderBalance"*. **That premise is exactly what the edit path breaks.** INFERRED consequence: an order whose column reads a stale `'paid'` is invisible to the stranded sweep. For 59 that is harmless (its hold was already captured). For the shape it *is* wrong on — an order paid in cash, then edited upward, still carrying a live hold — the sweep would skip an order that now genuinely owes money.

**Not established:** whether `20260816` has been applied to the live database. It is on the standing list of migrations run by hand, and the deployed function definition was not read.

### 3.7 `lib/supabase.ts:52` — the type union

**QUOTED:** `payment_status: 'unpaid' | 'paid' | 'part_paid' | 'refunded' | 'refund_due' | 'failed'` — missing `'part_refunded'`, which `getOrderBalance` can now return. A typing staleness, not a display; recorded because it is in the same blast radius.

### 3.8 `lib/account-deletion.ts:22`

**QUOTED:** a comment listing `payment_status, amount_paid` among the fields an anonymised order retains. No behaviour.

### For contrast — the surfaces that are RIGHT, and why

**QUOTED.** These compute from `order_payments` and are correct for order 59 without any change: `components/dashboard/OrderCard.tsx` (the `£6.50 paid, £6.50 due` chip), `app/api/dashboard/route.ts` (ships `LEDGER_ROW_COLUMNS` to the browser precisely so the card need not read the caches), `app/dashboard/[token]/page.tsx`, `app/dashboard/[token]/kds/page.tsx`, `lib/printing/mapOrderToTicket.ts` → `lib/printing/ticket.ts` (the printed `TO PAY` line), `lib/native/orderGate.ts`, `lib/native/useOfflinePaymentOverlay.ts`, and the four email sites via `lib/payments/email-payment-state.ts` → `lib/email.ts:paymentNote`.

**INFERRED — the pattern.** Every surface built or repaired since the ledger landed reads the ledger. Every surface that predates it reads the column. The stale column is not randomly distributed: it is exactly the customer-facing half of the product.

---

## 4. EVERY PATH THAT CHANGES AN ORDER'S TOTAL AFTER PAYMENT

**QUOTED.** All ten `from('orders').update(...)` sites in `app` and `lib`:

| Site | Writes | Changes the total? | Recalculates? |
|------|--------|--------------------|---------------|
| `action/route.ts:234` confirm | `status` | no | n/a (calls `captureOnConfirmation`, which recalcs via `recordPaymentEvent` when it captures) |
| `action/route.ts:308` reject | `status`, `rejection_reason` | no | no |
| `action/route.ts:341` cancel | `status`, `cancellation_reason` | no | no |
| `action/route.ts:378` ready | `status` | no | no |
| `action/route.ts:407` unready | `status` | no | no |
| `action/route.ts:416` cooking | `status` | no | no |
| `action/route.ts:485` collected | `status`, `paid_at`, `collected_at`, `status_before_collected` | no | via `recordCollectionPayment` |
| `action/route.ts:593` undo collected | `status`, `paid_at`, `collected_at` | no | via `reverseCollectionPayment` |
| **`action/route.ts:732` edit** | **`total`, `total_minor`, `subtotal`, `discount_amt`, items, deals, slot, notes, customer\_\*, `status`** | **YES** | **NO** |
| `action/route.ts:1734` quick time-adjust | `slot`, `status` | no | via `captureOnConfirmation` |

**There is exactly one path, and it is the `edit` handler.**

**QUOTED — there is no separate walk-up edit path.** A walk-up order is edited through this same handler; the handler proves it itself at `:743-744`: *"Blank name → the 'Walk-up' sentinel (same default as the manual insert), so a walk-up edited with the name left empty still reads 'Walk-up', not blank."*

**QUOTED — the other sites that write a total are INSERTS, not edits**: `action/route.ts:1271-1276` (the manual/Add-Order insert, which writes `payment_status: 'unpaid'` at `:1285`), `orders/submit/route.ts:1180` and `:1312`, `lib/payments/promote-draft.ts:308-311` (also `payment_status: 'unpaid'`), plus `lib/seed-demo-orders.ts` and `app/dev/ticket-preview/page.tsx`. None of them modifies an existing order's total.

**INFERRED — the symmetry that is missing.** Money events change `paid` and always recalculate. The edit changes `total_minor` and never does. One function is the single writer of the caches, and the single mutator of the other operand does not call it.

---

## 5. PROBLEM 2 — A HELD ORDER EDITED UPWARD

### There is no live example, and that is established, not assumed

**QUOTED.** The probe swept every promoted draft carrying a `payment_intent_id`. All six have a matching `stripe_pi:` ledger row — every authorisation in the database has been captured:

```
#24 authorised  750p   order total  750p   captured true
#59 authorised  650p   order total 1300p   captured true   <<< total moved, but AFTER capture
#25 authorised 1100p   order total 1100p   captured true
#60 authorised 2100p   order total 2100p   captured true
#18 authorised  600p   order total  600p   captured true
#19 authorised  650p   order total  650p   captured true
```

Order 59 is the only order whose total ever moved, and it was already captured when it moved. **No order in this database has been edited while its card was held.** Everything below is from the code.

### What the hold is worth, and what the new total is

**QUOTED — the authorised amount is frozen at creation and never revised.** `order_drafts.total_minor` is written once, by `createOrderDraft`. Every subsequent write to that table is one of exactly five updates:

```
order-drafts.ts:288   { payment_intent_id, livemode }
order-drafts.ts:350   { promoted_at }
order-drafts.ts:385   { customer_name: null, customer_email: null, customer_phone: null }   // erasePii
order-drafts.ts:412   { promotion_failed_at, promotion_failure_reason }
order-drafts.ts:435   { authorization_cancelled_at }
```

None of them touches `total_minor`, and the edit handler does not touch `order_drafts` at all. So after an edit from £6.50 to £13.00: **hold = 650p (`order_drafts.total_minor`, and the PaymentIntent's own `amount` at Stripe), order total = 1300p (`orders.total_minor`), ledger paid = 0, balance = 1300p.**

`lib/payments/capture.ts:207-209` is the one place that names the distinction, correctly:

```ts
// What the hold is for, and therefore what capturing takes. The draft's own figure, which is the
// amount authorised — not the order total, which an operator may have edited since.
const authorisedMinor = typeof draft.total_minor === 'number' ? draft.total_minor : balance.balanceMinor
```

### What the customer's email says

**QUOTED — the resolver returns `'held'` and does not re-examine it.** `lib/payments/email-payment-state.ts:189`:

```ts
if (state !== 'captured') return state
```

The balance re-check added in the previous build guards only the `'captured'` branch. For a held order the draft has an intent, has no `stripe_pi:` ledger row, has no `authorization_cancelled_at` and has `promoted_at`, so `readEmailPaymentState` returns `'held'` at `:98` — and the file says so in its own words at `:93-97`:

> *"'held' IS NOT RE-EXAMINED AGAINST THE BALANCE, AND THAT IS A STATED LIMIT RATHER THAN AN OVERSIGHT. An order whose card is held and which is then EDITED UPWARD has a hold covering only part of the new total, so 'nothing to pay at the truck' becomes wrong for it too. Fixing that needs a sentence about a hold that is too small — a different message from part-paid, which is about money already taken — and it is not the case order 59 reported. Recorded, not built."*

**QUOTED — what the edit email therefore prints.** `paymentNote('held', truckName)` (`lib/email.ts:67-78`) returns:

```
short: 'Your card is held, not charged'
text:  'Your card is held, not charged. <truck> takes the payment when they confirm your order —
        nothing to pay at the truck.'
```

and the edit email renders `payNote.short` into its footer (`action/route.ts:840`) and the full `short` sentence into its plain text (`:848`), alongside `New total £13.00`.

**INFERRED — the exact wrong sentence.** The customer receives an email saying **"New total £13.00"** and **"Your card is held, not charged … nothing to pay at the truck"**, when £6.50 of that £13.00 is covered by the hold and £6.50 is not covered by anything. It is the same two-true-sentences-that-do-not-add-up shape as order 59's captured case, one state over — exactly as the brief says.

### What happens afterwards, which is where it partly self-corrects

**INFERRED from QUOTED code.** When the operator confirms the edited order, `captureOnConfirmation` runs. `balance.balanceMinor` is 1300 and `authorisedMinor` is 650, so the settled guard (`balance <= 0`) is false and the part-paid guard (`balance < authorised`) is false. Capture proceeds, and `capture.ts:259` passes **no amount**:

```ts
const captured = await stripe.paymentIntents.capture(piId, {}, { stripeAccount: account })
```

so the full 650p hold is taken. The ledger then reads paid 650 / balance 650 → `part_paid`, `recordPaymentEvent` recalculates the column correctly, and the confirmation email — which passes the capture result into `resolveEmailPaymentState`, hits the `'captured'` branch and gets re-examined against the balance — correctly says *"£6.50 paid, £6.50 still to pay"*.

**So the sequence is: a wrong edit email, then a right confirmation email.** The operator's card is right throughout. The customer is told twice and told different things, and the first telling is the one they read before they arrive.

---

## 6. WHAT CAN BE DONE ABOUT A HOLD THAT IS NOW TOO SMALL

Four options. What each costs, and no choice made.

### (a) Incremental authorization — INSTALLED, BUT NOT AVAILABLE TO THIS INTEGRATION

**QUOTED — the SDK has it.** `stripe@22.4.0`, `node_modules/stripe/cjs/resources/PaymentIntents.d.ts:137`:

```ts
incrementAuthorization(id: string, params: PaymentIntentIncrementAuthorizationParams, options?: RequestOptions): Promise<Response<PaymentIntent>>;
```

`:11408-11412`:

```ts
export interface PaymentIntentIncrementAuthorizationParams {
    /**
     * The updated total amount that you intend to collect from the cardholder. This amount must be greater than the currently authorized amount.
     */
    amount: number;
```

**QUOTED — Stripe's own availability section** (`docs.stripe.com/terminal/features/incremental-authorizations`):

> *"They're only available with Visa, Mastercard, American Express, or Discover."*
> *"**You can only increment a transaction made with the POS and reader fully online.**"*
> *"You have a maximum of 10 attempts per payment."*

and the eligibility flag and request flag are both card-present:

> *"Set the `request_incremental_authorization_support` field to `true`"* — documented as `payment_method_options[card_present][request_incremental_authorization_support]`
> *"check the `incremental_authorization_supported` field on the PaymentIntent's latest charge"* — documented as `charge.payment_method_details.card_present.incremental_authorization_supported`

**INFERRED — it does not apply here.** `lib/payments/authorize.ts:137` creates every HatchGrab intent with `payment_method_types: ['card']` — card-not-present, in a browser, with no Terminal reader anywhere in the product. Every eligibility surface Stripe documents for incremental authorization lives under `card_present`. The page is filed under `/terminal/features/`.

**Cost if it were available:** one API call, no customer interaction, but a decline is a real outcome (*"Fail – Returns a `card_declined` error, and the PaymentIntent remains authorized to capture the original amount"*), so it needs a failure path anyway.

### (b) Overcapture — REAL FOR ONLINE CARDS, GATED THREE WAYS

**QUOTED — the SDK has the parameter.** `PaymentIntents.d.ts:2295`: `type RequestOvercapture = 'if_available' | 'never' | OtherString;` under `payment_method_options.card`. `Charges.d.ts:1654-1662` carries the response side:

```ts
interface Overcapture {
    /** The maximum amount that can be captured. */
    maximum_amount_capturable: number;
    /** Indicates whether or not the authorized amount can be over-captured. */
    status: Overcapture.Status;
}
```

**QUOTED — Stripe's availability** (`docs.stripe.com/payments/overcapture`):

> *"Only available with Visa, Mastercard, American Express, or Discover."*
> *"**Only eligible for online card payments.**"*
> *"Card brands limit the amount that you can overcapture (generally calculated as a percentage of the authorized amount)…"*
> *"**IC+ feature** — We offer overcapture to users on IC+ pricing … If you're on standard Stripe pricing and want access to this feature, contact us…"*
> *"You must specify the PaymentIntents you plan to overcapture by using `if_available` with the `request_overcapture` parameter."* — i.e. **at creation/confirmation, before anyone knows an edit is coming.**

The limits table, for a food truck: Visa *"Global — Eating places and restaurants; fast food restaurants — +20%"*; Mastercard *"US*** — +30%"*; Amex *"Global**** — Eating places and restaurants … +30%"*; Discover *"Global — … eating places and restaurants … +20%"*. Visa carries *"\* Excludes businesses in the European Economic Area (EEA)"*.

And the SCA paragraph, which matters most for a UK truck:

> *"Under SCA requirements, you generally need to authenticate an amount that's greater than or equal to the amount that you eventually capture. For this reason, you need to authenticate and authorize for the highest estimated amount that you plan to capture, rather than using overcapture as outlined elsewhere on this page. … **If you find it necessary to capture an amount beyond the originally authorized and authenticated amount, you must cancel the original payment and create a new one with the correct amount.**"*

**QUOTED — the repo does not request it.** `grep -rn "request_overcapture\|amount_to_capture\|incrementAuthorization" app lib` returns **nothing**. `authorize.ts:112-140` passes `amount`, `currency`, `capture_method`, `metadata`, `payment_method_types` and nothing else.

**INFERRED — the cost.** It would have to be requested on every intent up front, it needs IC+ pricing, and the ceiling is +20-30% of the authorised amount — a £6.50 hold could stretch to about £7.80-£8.45, nowhere near £13.00. Stripe's own SCA guidance for a UK merchant points at cancel-and-re-authorise instead.

### (c) Capture what is held, collect the rest at the hatch

**QUOTED — this is what the code does today**, by falling through both guards in `capture.ts` and capturing the full hold with no amount parameter (see Q5). The resulting `part_paid` state is fully supported end to end: the chip (`£6.50 paid, £6.50 due`), the email (`paymentNote('part_paid', …)` with figures), the printed ticket's `TO PAY` line, and the `mark_paid` / undo flow repaired in the previous two builds.

**Cost:** two payment instruments for one order; the customer must have means to pay at the window; the operator has to notice. Zero new code, zero new Stripe surface, zero new failure mode. The customer learns the true position from the *confirmation* email, not the *edit* email.

### (d) Cancel and re-authorise

**QUOTED — cancellation exists**: `lib/payments/authorize.ts:207`, `await stripe.paymentIntents.cancel(...)`, already used by the stale-authorisation sweep.

**QUOTED — re-authorisation has nothing to re-authorise with.** The create call (`authorize.ts:112-140`) sets no `customer`, no `setup_future_usage` and attaches no payment method for later use. There is no stored credential.

**INFERRED — the cost.** The customer must come back into a payment sheet and confirm a new intent. Between the cancel and the new authorisation nothing is held, so the truck's cover is zero for that window; if the customer never returns the order has no money against it at all. The customer sees the original pending authorisation drop off and a new one appear — two entries on their statement for one meal. For an order edited *while they walk to the hatch*, this is the option that needs them present anyway, which (c) also needs, without giving up the hold already in hand.

---

## 7. A HELD ORDER EDITED DOWNWARD

**INFERRED from QUOTED code — the capture is refused outright, and the customer pays nothing.**

Hold 650p; edited down to, say, 500p. Ledger paid 0, so `balance.balanceMinor` = 500, `authorisedMinor` = 650. At confirmation, `capture.ts:226`:

```ts
if (balance.balanceMinor < authorisedMinor) {
```

500 < 650 is **true**, so `captureOnConfirmation` returns `{ status: 'not_owed', reason: 'part_paid' }` and logs:

```
[capture] 🔴 REFUSING TO CAPTURE order_key=… (confirm): the order is PART PAID — paid_minor=0,
still owed=500, but the hold is for 650. Capturing pi=… would take 150 too much. Collect the
remainder at the hatch and release the hold.
```

**Consequences, all INFERRED:**

- **Nothing is captured, ever.** The stranded sweep retries and hits the identical guard, so the refusal is permanent. The hold sits live until Stripe expires it — `capture.ts:279` notes Stripe keeps an uncaptured intent *"about seven days"*.
- **The order reads `unpaid`** on every surface (ledger paid = 0), so the operator sees a full £5.00 due and the customer, whose card is held, is told at the window to pay in full. The guard that exists to prevent overcharging produces a customer paying twice over if they comply — once now, and once if the hold were ever claimed.
- **The refusal is mislabelled.** `reason: 'part_paid'` and the message *"the order is PART PAID — paid_minor=0"* name a state the order is not in. Nothing has been paid; the hold is simply too big. Diagnostically this makes a downward-edited order indistinguishable in the audit log (`action = 'capture_not_owed'`) from a genuinely part-paid one.

**Is a partial capture possible? Yes at Stripe, no in this build.**

**QUOTED — the SDK:** `PaymentIntents.d.ts:8364`, `amount_to_capture?: number;` on the capture params.

**QUOTED — Stripe's docs** (place-a-hold): *"To capture less or (for certain online card payments) more than the initial amount, pass the `amount_to_capture` option. **A partial capture automatically releases the remaining amount.**"* And the constraint that comes with it: *"you can only perform one capture on an authorized payment for most payments. If you partially capture a payment, you can't perform another capture for the difference."*

**QUOTED — nothing in this repo does it.** `grep -rn "amount_to_capture" app lib` returns nothing; `capture.ts:259` passes `{}`. And `capture.ts:227-229` says so in as many words:

> *"Stripe can capture a lesser amount, but this build does not do partial capture and inventing it inside a guard would be the wrong place to decide it."*

---

## 8. AN EDIT AFTER CAPTURE — CAN MONEY GO BACK?

**QUOTED — no. This codebase never creates a refund.**

`grep -rn "refunds.create\|createRefund\|issueRefund" app lib` returns **nothing**. The only Stripe refund API call anywhere in the repo is a *read*, `app/api/webhooks/stripe/route.ts:600`:

```ts
const list = await stripe.refunds.list({ payment_intent: piId, limit: 100 }, { stripeAccount: connectedAccount })
```

used to reconcile refunds that were made somewhere else.

**QUOTED — what does exist**, all of it inbound:

- `order_payments` supports `kind: 'refund'`, and `getOrderBalance` subtracts it (`paidMinor = chargeMinor − refundMinor`).
- `payment_status` has `refunded`, `part_refunded` and `refund_due` in its CHECK (the last of these still awaiting migration `20260817` by hand).
- The webhook handles `charge.refunded`, `refund.created`, `refund.updated` and `refund.failed`, keyed `stripe_re:<refund id>`, so a refund issued **in the truck's own Stripe Dashboard** reaches the ledger and the column.

**INFERRED — so the only route money takes back is an operator opening Stripe.** Nothing in HatchGrab initiates it, nothing prompts for it, and nothing tells anyone it is owed:

- After a downward edit of a captured order, `recalcOrderPayment` — if it were called — would write `refund_due`, and **`refund_due` has no consumer**: `OrderCard`'s `SETTLED_STATUSES` counts it as settled, so the card would still read "paid" and no chip would appear. That is a standing item from an earlier report, and this is the path that would start producing the state.
- `paymentNote` has **no branch for "we owe you money"**. `resolveEmailPaymentState` re-examines the `'captured'` branch with `if (balance.balanceMinor > 0) return 'part_paid'` — an over-paid order has a *negative* balance, so it falls through and returns `'captured'`, and the customer is emailed *"Paid by card. Your payment has gone through — nothing to pay at the truck."* True, and silent about the money owed back to them.
- The one place in the product that promises a refund is the cancellation email (Q3.4), which fires on cancellation, not on an edit, and promises an *automatic* refund that no code performs.

**QUOTED — the edit handler already admits this**, at `:794-797`:

> *"AND A LIMIT, STATED RATHER THAN PAPERED OVER: editing an order whose card is ALREADY CAPTURED changes the total, and the captured amount does not follow it. The customer is told the new total and that their payment has gone through, which are both true and do not add up. Reconciling a repriced capture is a money change and is out of scope here."*

---

## FLAGS

- **Nothing in the prompt arrived garbled**, and no instruction contradicts another.
- **No fix is proposed or applied**, per the brief. Nothing in this report is a recommendation.
- **Files changed: none. Files created: this one.** A non-ASCII census does not apply — no source file was touched.

## NOT ESTABLISHED

- Whether migration `20260816_find_stranded_authorisations_settled.sql` (and therefore the `payment_status`-based sweep filter in Q3.6) has been applied to the live database. The deployed function definition was not read.
- Whether any order outside the forty most recent `test-truck` rows has a stale column; the probe was scoped to that window and to one truck.
- The behaviour of a *live* held-and-edited order (Q5, Q7). No such row exists; both are reasoned from the code, and both would be worth reproducing deliberately before anything is built on them.
