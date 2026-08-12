# Refunds from HatchGrab: what exists, and what the blocking question turns out to be

**Date:** 12 August 2026
**READ-ONLY DIAGNOSIS. No file changed, no file created except this report. No `next dev`, no `next build`, no commit, no deploy. No fix proposed or applied.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 THE BLOCKING QUESTION IS ANSWERED, AND I HAVE BEEN WRONG ABOUT IT IN FOUR PREVIOUS REPORTS

**YES. A platform may refund a direct charge on a connected account using its own secret key with the `Stripe-Account` header. Stripe documents it explicitly, as policy, not as mechanism.**

**QUOTED VERBATIM** from `https://docs.stripe.com/connect/direct-charges`, under the heading **"Issue refunds"**:

> **Just as platforms can create charges on connected accounts, they can also create refunds of charges on connected accounts. Create a refund using your platform's secret key while authenticated as the connected account.**
>
> Application fees aren't automatically refunded when issuing a refund. Your platform must explicitly refund the application fee or the connected account—the account on which the charge was created—loses that amount. You can refund an application fee by passing a `refund_application_fee` value of **true** in the refund request:
>
> ```curl
> curl https://api.stripe.com/v1/refunds \
>   -u "<<YOUR_SECRET_KEY>>:" \
>   -H "Stripe-Account: {{CONNECTEDACCOUNT_ID}}" \
>   -d "charge={{CHARGE_ID}}" \
>   -d refund_application_fee=true
> ```
>
> By default, the entire charge is refunded, but you can create a partial refund by setting an `amount` value as a positive integer.

🔴 **I HAVE WRITTEN THE OPPOSITE, REPEATEDLY, AND IT WAS NOT TRUE.** `capture-not-firing-report.md`, `email-payment-state-report.md`, `sweep-double-charge-report.md` and `capture-balance-guard-report.md` all state some version of *"these are direct charges, so HatchGrab cannot refund them — only the truck can."* **That is wrong.** I inferred it from "the truck is merchant of record", which is true and which governs **whose balance the money comes out of** — not who may call the API. Stripe's own page distinguishes the two and I did not.

**So this is the build you asked for, not the different one.** The button issues a refund; it does not merely record that one is owed.

### The three things that follow from the same documentation

| | **QUOTED** |
|---|---|
| **Whose money** | *"Stripe debits the refund amount from the connected account's balance directly when you create a refund."* — `docs.stripe.com/connect/charges`, Refunds table |
| 🔴 **It may not settle immediately** | *"If the connected account's balance is insufficient, we set the refund status to `pending`. When the connected account's balance has enough funds, Stripe automatically processes pending refunds in the order they were created and updates their status to `successful`."* — **so a refund is not always `succeeded` when created**, and §5/§7 turn on that |
| **Application fees** | Must be refunded explicitly. ⚠️ **Moot today** — `lib/payments/capture.ts` states *"NO `application_fee_amount`… This build charges no platform fee… 'no fee' is absence"*. It stops being moot the day fees are switched on |

### The SDK confirms the mechanism, and only the mechanism

**QUOTED**, `node_modules/stripe/cjs/resources/Refunds.d.ts` (stripe **22.4.0**):

```ts
    create(params?: RefundCreateParams, options?: RequestOptions): Promise<Response<Refund>>;
```
```ts
export interface RefundCreateParams {
    amount?: number;
    charge?: string;
    payment_intent?: string;
    reason?: RefundCreateParams.Reason;      // 'duplicate' | 'fraudulent' | 'requested_by_customer'
    metadata?: Emptyable<MetadataParam>;
    refund_application_fee?: boolean;
    reverse_transfer?: boolean;
}
```

⚠️ **The `options?: RequestOptions` parameter is where `stripeAccount` goes, and on its own it proves nothing** — every resource takes it. **The permission comes from the documentation above, not from this signature.** That distinction is exactly what you asked me not to blur, and it is what I got wrong before.

⚠️ **Stripe's own `Reason` enum has three values** — `duplicate`, `fraudulent`, `requested_by_customer` — which is **not** the dropdown you want. A HatchGrab reason list ("sold out", "wrong item", "customer changed their mind") would have to map onto those three or live only in our metadata and our ledger. **Not established** which you want; it is a product decision.

⚠️ **NOT ESTABLISHED, AND EASILY SETTLED:** I did not test this empirically. A captured sandbox direct charge exists on `acct_1U30w22fB4PPCw2D` from the last verification run, and one `refunds.create` with the platform key would settle it beyond doubt. **I did not run it because this is a read-only diagnosis and a refund is a state change at Stripe.** Say the word and it takes thirty seconds.

---

## 2. The popup on the ACTIVE list

**Source: QUOTED.** `components/dashboard/OrderCard.tsx`.

### How it opens — the PAID chip is its only entry point

`:435-455`:

```tsx
  const paidChipStatic = hidePayments ? null
    : effectivePaid ? <span className="… bg-green-100 text-green-700 …">PAID</span>
    : heldAuthorisation ? <span title="Card authorised — do not collect. Payment is taken when you confirm." className="… bg-indigo-100 text-indigo-700 …">CARD HELD</span>
    : effectivePartPaid ? <span className="… bg-amber-100 text-amber-700 …">{money(balance.paidMinor)} / {money(balance.balanceMinor)} due</span>
    : null

  const paidChip = paidChipStatic === null ? null : heldAuthorisation && !effectivePaid ? (
    <span className="flex-shrink-0">{paidChipStatic}</span>
  ) : (
    <button onClick={() => setConfirmRemovePayment(true)} title="Tap to remove this payment" className="flex-shrink-0">
      {paidChipStatic}
    </button>
  )
```

### The popup itself — `removePaymentModal`, `:468-491`

```tsx
  const removePaymentModal = !confirmRemovePayment ? null : (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && setConfirmRemovePayment(false)}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Remove payment?</h3>
          <p className="text-sm text-slate-500 mt-2">
            This removes the <strong className="text-slate-700">{money(balance.paidMinor)}</strong> recorded
            against order <strong className="text-slate-700">#{order.id}</strong>. The order stays where it is;
            only the payment record is removed.
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setConfirmRemovePayment(false)}
            className="flex-1 border border-slate-200 text-slate-600 py-3 rounded-xl text-sm">Cancel</button>
          <button
            onClick={() => { setConfirmRemovePayment(false); onAction('undo_mark_paid', order.order_key) }}
            disabled={isLoading('undo_mark_paid')}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-50">
            {isLoading('undo_mark_paid') ? '…' : 'Remove payment'}
          </button>
        </div>
      </div>
    </div>
  )
```

### Every control, and the condition governing it

| Control | Rendered when | Does |
|---|---|---|
| The chip (tap target) | `!hidePayments` **and** the order is paid, part-paid or held | opens the modal |
| 🔴 **…except when held** | `heldAuthorisation && !effectivePaid` → a **`<span>`, not a button** | **NOT TAPPABLE.** Quoted: *"a held authorisation has no ledger row to remove, so the modal would offer to undo something that does not exist"* |
| Backdrop | always, while open | closes (target-guarded, so a drag inside does not dismiss) |
| **Cancel** | always | closes |
| **Remove payment** | always | `onAction('undo_mark_paid', order.order_key)`; disabled while loading |

🔴 **THIS IS NOT A REFUND POPUP AND MUST NOT BECOME ONE BY ACCIDENT.** Its own comment: *"`undo_mark_paid` reverses a RECORDING, not a refund. No money moves. It deletes a row that says money was taken; it does not take money back."* **A refund control added here would sit one tap from a button that deletes the record of a payment**, and the two are opposite operations. That is a design hazard worth naming before anything is built.

⚠️ **AND THE HELD CASE BLOCKS THE OBVIOUS ROUTE.** For a card order the chip only becomes tappable once the order reads `effectivePaid` — i.e. once captured. That is correct for refunds (you cannot refund an uncaptured hold) but it means the entry point is currently gated on a condition written for a different purpose.

---

## 3. The COMPLETED list

🔴 **IT IS NOT THE SAME COMPONENT. IT IS NOT A COMPONENT AT ALL.**

**QUOTED**, `app/dashboard/[token]/page.tsx:2347`:

```ts
  const otherOrders=eventOrders.filter(o=>['collected','cancelled','rejected'].includes(o.status))
```

and `:3092-3145` renders them as **inline JSX inside the page**, not `<OrderCard>`:

```tsx
            {otherOrders.length>0&&(
              <div className="mb-4">
                <button onClick={()=>setShowCompleted(c=>!c)} className="w-full flex items-center justify-between gap-2 py-2 text-left">
                  <span className="flex items-center gap-2 text-sm font-bold text-slate-700">
                    <span className={`transition-transform inline-block text-slate-400 text-xs ${showCompleted?'rotate-90':''}`}>▶</span>
                    Completed &amp; cancelled ({otherOrders.length})
                  </span>
                  …
                {showCompleted&&(
                <div className="space-y-2 mt-1">
                  {otherOrders.map(o=>{
                  const unrecorded=hasUnrecordedPayment(o as never,payments[o.order_key]??[],paymentFailures.has(o.order_key))
                  return (
                    <div key={o.order_key} className={`bg-white rounded-xl px-4 py-3 flex items-center justify-between …`}>
```

### What a completed row offers today

| Control | When |
|---|---|
| `#id`, a status pill, `🕐 slot`, customer name, item counts, notes | always |
| `⚠ PAYMENT NOT RECORDED` banner | `hasUnrecordedPayment(...)` |
| A red **repair** button firing `mark_paid` | 🔴 **only when `unrecorded`** |
| `↩ Undo` | (referenced in the comments; beside the row) |

### 🔴 THERE IS NO PAID CHIP, NO BALANCE, AND NO PAYMENT CONTROL OF ANY KIND ON A NORMAL COMPLETED ROW

`getOrderBalance` is **not** called in this block. `money(...)` is not rendered. The row is a summary, not a money surface. **For the overwhelming majority of completed orders — the ones that paid correctly — there is nothing to tap.**

### What would have to exist for the same popup to open from here

**INFERRED**, and it is more than a prop:

1. **A shared component or a lifted modal.** The modal is `const removePaymentModal` **inside** `OrderCard`, closed over `order`, `balance`, `money` and `onAction`. It cannot be rendered from the completed list without extracting it — or rendering `<OrderCard>` there, which would change the whole visual language of that list.
2. **A balance per completed row.** The data is present (`payments[o.order_key]`) but the block does not compute it. One `getOrderBalance` call per row would fix that.
3. **A tap target that is not the PAID chip**, since completed rows have no chip. A row-level tap, or a small money affordance.
4. ⚠️ **A decision about cancelled and rejected orders**, which share this list. `otherOrders` includes `'cancelled'` and `'rejected'` — and a cancelled paid order is *exactly* the case the refund emails already promise something about (§9).

---

## 4. What each list already knows

**Source: QUOTED.** `app/api/dashboard/route.ts`.

```ts
  /** order_key → its order_payments rows. Fed straight into getOrderBalance client-side. */
  const payments: Record<string, any[]> = {}
  …
  const paymentFailures = new Set<string>()
  …
  const heldAuthorisations: string[] = []
```
```ts
      .from('order_payments')
      // The shared LEDGER_ROW_COLUMNS list, so this select can never drift out of step with what
      .select(LEDGER_ROW_COLUMNS)
```
and `LEDGER_ROW_COLUMNS` is:
```ts
export const LEDGER_ROW_COLUMNS = 'order_key, truck_id, kind, channel, amount_minor, state, external_ref, livemode'
```

| Question | Answer | Detail |
|---|---|---|
| **Payment channel?** | ✅ **YES** | `channel` is in the select — `'online'` vs `'in_person_other'` distinguishes card from cash |
| **Amount paid?** | ✅ **YES** | `amount_minor` + `kind` + `state`; both lists receive the raw rows and the active card runs `getOrderBalance` over them |
| **The ledger rows?** | ✅ **YES, in full** — for **both** lists | The map is keyed on `visibleKeys` = `[...activeOrders, ...doneToday]`, so completed orders' rows are already on the client |
| **Whether a refund has been issued?** | ⚠️ **YES, DERIVABLE — and only derivable.** | `getOrderBalance` computes `hasRefundRow = succeeded.some(r => r.kind === 'refund')` and returns `status: 'refunded'`. **There is no `refunds` array and no per-refund detail** |
| 🔴 **The Stripe charge or intent id?** | ❌ **NO — AND THIS IS THE GAP** | `external_ref` **is** in `LEDGER_ROW_COLUMNS` and holds the PaymentIntent id for an online row. ⚠️ But `charges.retrieve`/`refunds.create` also need the **connected account id**, which the dashboard does not receive per order |
| **How much has already been refunded?** | ⚠️ derivable as `Σ succeeded refunds`, but not surfaced | |

### Would a new fetch be needed?

**INFERRED: for the UI, no. For the action, yes — server-side.**

- ✅ **The popup can render entirely from what both lists already have**: amount paid, channel, whether a refund exists. Nothing new needs shipping to the browser.
- 🔴 **The server action needs two things it must read itself**: the connected account (`stripeAccountForTruck`, already exists) and the charge/intent to refund (`external_ref` on the online ledger row, or the promoted draft's `payment_intent_id`). **Both are one indexed read; neither should come from the client.**

---

## 5. How a refund is represented in the ledger

### The shape is already defined and already handled

**QUOTED**, `lib/payments/ledger.ts`:

```ts
  const succeeded = (ledgerRows ?? []).filter(r => isLiveRow(r) && r.state === 'succeeded')
  const chargeMinor = succeeded.filter(r => r.kind === 'charge').reduce((s, r) => s + Math.round(r.amount_minor), 0)
  const refundMinor = succeeded.filter(r => r.kind === 'refund').reduce((s, r) => s + Math.round(r.amount_minor), 0)
```

| Field | Value | Why |
|---|---|---|
| `kind` | **`'refund'`** | already a `PaymentKind`, already summed |
| `state` | **`'succeeded'`** — ⚠️ **but see the `pending` note below** | only `succeeded` rows count |
| **Sign of `amount_minor`** | 🔴 **POSITIVE.** *"amount_minor must be a positive integer (got …) — kind carries the sign"* | a `CHECK` enforces it; `kind` is the sign |
| `channel` | `'online'` | so `isLiveRow`'s arm (b) can classify a sandbox refund |
| `idempotency_key` | **not established** — see below | |

### `reverseCollectionPayment` is the wrong template, and its own comments say so

**QUOTED**, its signature:

```ts
): Promise<{ reversal: 'deleted' | 'refunded' | 'none'; balance: OrderBalance }>
```

It **DELETES** an in-person charge row rather than compensating it, and `action/route.ts:2045` explains why:

> *"real money moved, so the row is DELETED rather than compensated (a refund row for a payment that…)"*

and the modal's own note:

> *"`undo_mark_paid` reverses a RECORDING, not a refund. No money moves."*

🔴 **SO A CARD REFUND MUST FOLLOW A DIFFERENT SHAPE: A COMPENSATING `kind: 'refund'` ROW, NEVER A DELETE.** The delete is correct only for a record of money that never moved through Stripe. A card refund is a real, separate money event at Stripe with its own `re_…` id, and deleting the original charge row would destroy the record of a charge that genuinely happened. ⚠️ The `'refunded'` arm of that return type shows the compensating path was anticipated — **not established** whether it is reachable today.

### 🔴 The idempotency key, and the one problem with it

The existing patterns are `stripe_pi:<intent id>` (one capture per intent) and `collect:<order_key>:<paid_before>:<balance>` (state-dependent). **Neither fits.** A refund is **N-per-charge** — Stripe: *"You can do so multiple times, until the entire charge has been refunded."*

**INFERRED, and it is the natural fit:** key on **Stripe's own refund id** — `stripe_re:<refund id>` — mirroring `stripe_pi:`. ⚠️ **But that id does not exist until Stripe answers**, so it cannot be a pre-write idempotency guard. §7.

### And the `pending` complication

Stripe may return a refund with `status: 'pending'`. `getOrderBalance` counts only `state === 'succeeded'`, so a pending refund would be **invisible to the balance** — the order would keep reading `paid` while a refund is in flight. **Writing it as `succeeded` when Stripe said `pending` would be a lie in the ledger.** The honest options are a `pending` row that later flips (needs the webhook, §10) or no row until it settles. **Not established** which; it is a design decision.

---

## 6. What `getOrderBalance` and `recalcOrderPayment` would do

**QUOTED**, the arithmetic in full:

```ts
  const paidMinor = chargeMinor - refundMinor
  const totalMinor = orderTotalMinor(order)
  const balanceMinor = totalMinor - paidMinor
  const hasRefundRow = succeeded.some(r => r.kind === 'refund')

  let status: PaymentStatus
  if (paidMinor === 0 && hasRefundRow) status = 'refunded'
  else if (paidMinor === 0) status = 'unpaid'
  else if (paidMinor < 0) status = 'refund_due'
  else if (balanceMinor < 0) status = 'refund_due'
  else if (balanceMinor === 0) status = 'paid'
  else status = 'part_paid'
```

### Worked, for a £6.50 order fully paid by card

| Refund | `chargeMinor` | `refundMinor` | `paidMinor` | `balanceMinor` | `hasRefundRow` | **`status`** |
|---|---|---|---|---|---|---|
| none | 650 | 0 | 650 | 0 | false | `paid` |
| 🔴 **full (650)** | 650 | 650 | **0** | 650 | **true** | 🔴 **`refunded`** |
| ⚠️ **partial (200)** | 650 | 200 | 450 | 200 | true | ⚠️ **`part_paid`** |

🔴 **A FULL REFUND ALREADY WORKS, AND THE BRANCH ORDER IS WHY.** Its own comment:

> *"'refunded' is tested FIRST and keys on refund-row PRESENCE, never on the sum. 'Charged then fully refunded back to zero' and 'never paid at all' are the SAME arithmetic state (`paidMinor === 0`); only the existence of a refund row tells them apart. Reordering these two silently reports every fully-refunded order as 'unpaid'."*

⚠️ **A PARTIAL REFUND READS `part_paid`, WHICH IS ARITHMETICALLY RIGHT AND OPERATIONALLY MISLEADING.** The card would show the amber `£4.50 / £2.00 due` chip — as if the customer still owes £2.00, when in fact they were refunded it. **`PaymentStatus` has no `part_refunded` value**, so this is not a bug in the arithmetic; it is a vocabulary that does not yet have the word. **Changing it means changing the CHECK constraint and `getOrderBalance`'s branch order — the two things every previous brief has ring-fenced.**

`recalcOrderPayment` needs no change: it writes whatever `getOrderBalance` returns into `payment_status` / `amount_paid`, and *"it reads the full ledger and writes an absolute value, never a delta, so re-running it converges from any starting state."*

---

## 7. Every guard a refund action needs

**INFERRED**, with each existing pattern **QUOTED**.

| Guard | What exists | Verdict |
|---|---|---|
| **Who may press it** | `verifyToken(token, pin)` — the only thing that can refuse a request on this route — plus `resolveActorSafe` for attribution, *"LOGGING ONLY, NEVER AUTHORISATION"* | ⚠️ **A shared per-truck token is the whole authorisation model.** Anyone with the board can refund. **A refund may deserve more than that; there is nothing finer to reuse** |
| 🔴 **Double refund** | ❌ **NOTHING FITS.** `stripe_pi:` is one-per-intent; `collect:…:paid:balance` is state-dependent and would *change* after the first refund, so a replay would mint a different key and pass | 🔴 **The real guard is Stripe's own:** *"This method will raise an error when called on an already-refunded charge, or when trying to refund more money than is left on a charge."* Plus a `Idempotency-Key` header on the request — `RequestOptions` supports it — **but the client must supply a stable one, which means minting it before the call** |
| **Refunding more than captured** | Stripe refuses (quoted above). Locally, `Σ succeeded charges − Σ succeeded refunds` from `getOrderBalance` bounds it | ✅ **Two layers available** — exactly the shape the capture guard just took |
| 🔴 **Stripe accepts, our write fails** | 🔴 **THE WORST CASE, AND THERE IS A PRECEDENT FOR EXACTLY IT.** `capture.ts`: *"CAPTURED BUT NOT RECORDED … THE CUSTOMER HAS PAID. The webhook's payment_intent.succeeded should write the same row"* | ⚠️ **That recovery depends on a webhook. For refunds there is none — §10.** So today a lost write is unrecoverable except by hand |

### The idempotency pattern that fits best

**QUOTED**, `recordPaymentEvent`:

```ts
    if (error.code === '23505') inserted = false
    else throw new Error(`[ledger] insert failed for ${event.orderKey}: ${error.message}`)
```

**INFERRED:** mint a deterministic key **before** calling Stripe — e.g. `refund:<order_key>:<amount>:<attempt>` — pass it as Stripe's `Idempotency-Key`, and write the ledger row under `stripe_re:<refund id>` once Stripe answers. That gives Stripe-side idempotency on the request and ledger-side idempotency on the result. **Not built; not established that it is the best shape.**

---

## 8. A refund against a CASH order

### It must be refused at Stripe, and it must not be refused at the hatch

**INFERRED, and the popup makes it unavoidable**: the same PAID chip opens for `channel: 'in_person_other'` and for `channel: 'online'`. **The dropdown you want sits on a popup that already serves both.**

| | |
|---|---|
| **Can Stripe refund it?** | ❌ **NO.** There is no charge. `refunds.create` needs a `charge` or `payment_intent` and a cash row has neither |
| **What SHOULD happen** | ⚠️ **The operator hands back cash and the system records it.** The refund is real; only the *rail* is different |
| **What that is, in ledger terms** | A `kind: 'refund'`, `channel: 'in_person_other'` row — the exact mirror of the collect row. `getOrderBalance` already sums it, and `status` already becomes `refunded` |
| 🔴 **What it must NOT do** | Silently do nothing, or reuse `undo_mark_paid`. **That DELETES the charge row**, which erases the record that money was ever taken — the opposite of a refund, and it would make a genuine cash refund indistinguishable from a mis-tap correction |
| **How the popup tells them apart** | ✅ **`channel` is already on every ledger row the dashboard ships** (§4). An order with an `online` charge offers a card refund; one with only `in_person_other` offers "record a cash refund" |
| ⚠️ **The mixed case** | An order part-paid by card and part in cash is possible (§5 of the previous report). Refunding it needs a **per-row** decision, not a per-order one. **Not established** how you want that presented |

---

## 9. Every place the product mentions refunds

**Source: QUOTED. There are SIX, and I count FIVE that promise an automatic refund, not four** — because two of the emails say it twice, once in HTML and once in plain text. By **email** rather than by code site it is three; by code site it is five. Both counts are below so the discrepancy is visible rather than smoothed over.

| # | File : line | Trigger | Exact sentence | Promise? |
|---|---|---|---|---|
| 1 | `app/api/dashboard/action/route.ts:354` | operator **cancels** an order. Gated `order.paid_at` | **"Your refund will be processed automatically within 3–5 working days."** | 🔴 **YES** |
| 2 | `lib/email.ts:520-521` — `sendCancellationEmail`, HTML. Gated `paymentStatus === 'paid'`. Caller: `app/api/orders/cancel/route.ts:111` (**customer self-cancel**) | customer cancels their own order | **"Your refund will be processed automatically within 3–5 working days."** | 🔴 **YES** |
| 3 | `lib/email.ts:538` — the same email's **plain text** | as above | **"Your refund will be processed within 3–5 working days."** | 🔴 **YES** |
| 4 | `lib/email.ts:561-562` — `sendEventCancellationEmail`, HTML. Gated `paymentStatus === 'paid'`. Caller: `app/api/events/action/route.ts:238`, which passes `paymentStatus: order.paid_at ? 'paid' : null` | **the truck cancels a whole event** | **" Your refund will be processed automatically within 3–5 working days."** | 🔴 **YES** |
| 5 | `lib/email.ts:579` — the same email's **plain text** | as above | **" Your refund will be processed automatically within 3–5 working days."** | 🔴 **YES** |
| 6 | `app/order/[id]/manage/page.tsx:99-100` — the customer's own cancellation screen | after a customer cancels | **"Your order has been cancelled. If you paid by card, any refund is handled by {truck name} directly — please contact them about it."** | ✅ **NO** |

### 🔴 THE ONE THAT DOES NOT PROMISE IS THE ONE THAT WAS DELIBERATELY REWRITTEN — AND ITS STATED REASON IS THE THING I NOW KNOW IS WRONG

**QUOTED**, `app/order/[id]/manage/page.tsx:85-97`:

> *"🔴 REWRITTEN 10 August 2026, BEFORE THE FIRST CARD PAYMENT EXISTED. It read: 'If you paid online, a refund will be processed within 5-10 business days.' Both halves were promises HatchGrab cannot keep… 🔴 **WE ARE NEVER MERCHANT OF RECORD. Card payments are DIRECT charges on the truck's own Stripe account — the money never passes through HatchGrab, so we cannot return it.**"*

⚠️ **The first half of that reasoning stands — the truck IS merchant of record and the money IS debited from its balance. The conclusion does not: §1 shows the platform may create the refund.** Once a refund button exists, **five of these six sentences become keepable promises and the sixth becomes needlessly defeatist.** All six should be revisited together, and #1 and #4/#5 gate on `paid_at`/`paid`, which say nothing about whether a refund was actually issued.

⚠️ **AND EVERY ONE OF THEM IS CURRENTLY FALSE IN THE SAME WAY:** nothing in this codebase issues a refund, so *"processed automatically"* describes a process that does not exist. That is unchanged by this diagnosis.

---

## 10. `charge.refunded`

# ❌ NOT HANDLED. The webhook handles exactly three event types.

**QUOTED**, `grep -n "eventType === " app/api/webhooks/stripe/route.ts`:

```
299:  if (eventType === 'account.updated') {
393:  if (eventType === 'payment_intent.amount_capturable_updated') {
428:  if (eventType === 'payment_intent.succeeded') {
```

A `charge.refunded` delivery falls to the default arm — **recorded and acknowledged, never acted on**:

> *"UNRECOGNISED EVENT TYPES ARE NORMAL, NOT ERRORS. Every verified event is recorded and acknowledged, whatever its type… Returning non-2xx for a type we do not handle would make Stripe retry it for three days to no purpose."*

### What would be needed for a Dashboard refund to reach our ledger

**INFERRED**, four things:

1. 🔴 **A subscription to `charge.refunded` (and `refund.updated`) on the CONNECTED-ACCOUNT scope** (`events_from: @accounts`). Without it the branch never runs — the same caveat already written against `amount_capturable_updated`: *"Without that subscription this branch never runs."*
2. **A branch that correlates the refund to an order.** ⚠️ **Harder than the capture path.** A refund made in the truck's own Dashboard carries **no HatchGrab metadata**. `charge.payment_intent` → our `order_payments.external_ref` is the only link, and `external_ref` is not indexed as a lookup key.
3. **A writer** — a `recordOnlineCardRefund` mirroring `recordOnlineCardPayment`, keyed `stripe_re:<refund id>` so a Dashboard refund and an in-app refund converge on one row.
4. ⚠️ **Handling `pending` → `succeeded`.** Refunds can settle later (§1), so the row must either be written on settlement or updated — and `recordPaymentEvent` only ever **inserts**.

🔴 **UNTIL THAT EXISTS, A TRUCK REFUNDING IN ITS OWN STRIPE DASHBOARD LEAVES OUR LEDGER SAYING `paid` FOREVER** — and the board, the takings figure and every email keep agreeing with it. **That is true today, before any button is built.**

---

# Quoted vs inferred

| § | Status |
|---|---|
| 1 | **QUOTED** — Stripe's "Issue refunds" section verbatim, the funds-flow table, and the SDK signature. The correction to my earlier reports is **QUOTED-derived**. Empirical confirmation **not established, deliberately** |
| 2 | **QUOTED** — the chip, the modal, and every control |
| 3 | **QUOTED** — the filter and the inline JSX. What would be needed is **INFERRED** |
| 4 | **QUOTED** — the payload and `LEDGER_ROW_COLUMNS`. The fetch conclusion is **INFERRED** |
| 5 | **QUOTED** — the arithmetic, the `CHECK` message, `reverseCollectionPayment`'s signature and its "delete not compensate" note. The key shape is **INFERRED** |
| 6 | **QUOTED** — the branch order and its comment. The worked table is **INFERRED** arithmetic |
| 7 | **INFERRED** throughout; every existing pattern **QUOTED** |
| 8 | **INFERRED**; the `channel` availability is **QUOTED** |
| 9 | **QUOTED** — all six, verbatim, with their gates |
| 10 | **QUOTED by absence** — the three handled types. The four requirements are **INFERRED** |

# Not established

- 🔴 **Whether the refund actually succeeds against this sandbox account.** Documented as permitted; not exercised. One `refunds.create` on the connected account would settle it.
- **Which reason vocabulary you want**, and whether it maps onto Stripe's three (`duplicate`, `fraudulent`, `requested_by_customer`) or lives only in our ledger and metadata.
- **How a `pending` refund should appear** before it settles.
- **How a partial refund should read on the card**, given `part_paid` is the only status the arithmetic can produce and it says "still owes".
- **Whether refunding should require more authorisation than the shared dashboard token.**
- **How a mixed cash-and-card order should be refunded**, which rail first.
