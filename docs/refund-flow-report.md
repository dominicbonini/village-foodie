# Operator-authorised refunds — the map

**Date:** 11 August 2026
**READ-ONLY. No file changed, no file created except this report. No `next dev`, no `next build`. No commit, no deploy. Nothing reverted, nothing proposed — this is the map, as asked.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 THE SIX THINGS THAT DECIDE THIS

1. ✅ **A REFUND IS POSSIBLE TODAY WITH THE DATA WE HOLD.** `Refunds.create` accepts **either** `charge` **or** `payment_intent`, and `order_payments.external_ref` holds the PaymentIntent id. **No new column is required to issue one.**
2. ✅ **THE LEDGER ALREADY MODELS A REFUND, AND ALREADY WRITES ONE.** `kind` admits `'refund'`, `getOrderBalance` already subtracts them, and `reverseCollectionPayment` writes a compensating refund row today. **The shape exists; only the Stripe call does not.**
3. 🔴 **THE FOUR REFUND SENTENCES CONTRADICT EACH OTHER, AND THREE OF THEM ARE PROMISES WE CANNOT KEEP.** Three say *"automatically within 3–5 working days"*; one says *"handled by {truck} directly"*. **Two of the three branch on `paid_at`, one on `payment_status` — different fields for the same question.**
4. 🔴 **`refund_due` IS WRITTEN BY THE LEDGER BUT RENDERED TO NOBODY.** Two branches in `getOrderBalance` set it; **no operator surface and no customer surface displays a word about it.**
5. 🔴 **A REFUND MADE IN THE TRUCK'S OWN STRIPE DASHBOARD REACHES US AND IS DISCARDED.** The webhook handles exactly two event types, and `charge.refunded` is not one of them.
6. 🔴 **THE DASHBOARD CANNOT TELL AN ONLINE PAYMENT FROM A CASH ONE.** `channel` rides in `LEDGER_ROW_COLUMNS` and reaches the browser, but **no component reads it** — a repo-wide grep finds zero display uses.

---

## 0. 🔴 THE CORRECTION — what the `canCancel` gate does today, and what reverting it involves

**Source: QUOTED.** `app/order/[id]/manage/page.tsx:127-133`:

```tsx
  const isPaidOrPartPaid = order.payment_status === 'paid' || order.payment_status === 'part_paid' || order.payment_status === 'refund_due'

  const canCancel =
    order.allow_cancellation &&
    ['pending', 'confirmed'].includes(order.status) &&
    !isPaidOrPartPaid &&
    !isPastCutoff()
```

**And the copy it produces, `:140-141`:**

```tsx
    if (isPaidOrPartPaid)
      return `This order has been paid. To cancel it or ask for a refund, please contact ${order.truck_name || 'the truck'} directly.`
```

### What it does today

| Order state | Before the gate | After the gate |
|---|---|---|
| `confirmed` + `unpaid`, in window | ✅ Cancel button | ✅ Cancel button — **unchanged** |
| 🔴 `confirmed` + **`paid`**, in window | ✅ Cancel button | 🔴 **BLOCKED** — the copy above |
| 🔴 `confirmed` + `part_paid` / `refund_due` | ✅ Cancel button | 🔴 **BLOCKED** |
| Past cutoff, terminal, or cancellation off | blocked | blocked — unchanged |

**Live impact, measured during the build:** exactly **one** order changed — `d2d5a74a`, `confirmed` + `paid`, within its cutoff.

### 🔴 EXACTLY WHAT REVERTING INVOLVES — THREE EDITS IN ONE FILE, NOTHING ELSE

| # | Edit | Lines |
|---|---|---|
| 1 | Delete the `isPaidOrPartPaid` const **and its 11-line comment block** | `:116-127` |
| 2 | Remove `!isPaidOrPartPaid &&` from `canCancel` | `:132` |
| 3 | Remove the `if (isPaidOrPartPaid) return …` branch from `statusLabel()` | `:135-141` |

✅ **NOTHING ELSE DEPENDS ON IT.** `isPaidOrPartPaid` is referenced in exactly those two places; a grep finds no other consumer, no API change, no migration, no type change. **`payment_status` was already fetched, typed and rendered on that page before this gate existed**, so removing the gate leaves it in use for the *"Paid by card"* line and nothing dangles.

⚠️ **The census cost of reverting is two `⚠️`/U+FE0F pairs and one `🔴` removed — no character class would be lost**, since all three already appear elsewhere in that file.

⚠️ **AND THE REASON THE GATE WAS WRONG IS WORTH KEEPING.** The gate's own comment argues *"HatchGrab cannot return it"* — which is true of HatchGrab and irrelevant to the customer's right to cancel. **The cancellation window is a truck setting** (`trucks.allow_customer_cancellation`, `trucks.cancellation_cutoff_mins`); a paid order inside that window is still cancellable, and the refund is a **separate** operator action. **Blocking the cancel to avoid an unrefundable cancellation solved the wrong half.**

---

## 1. The customer cancellation flow, end to end

**Source: QUOTED.**

### The control — `app/order/[id]/manage/page.tsx`

```tsx
  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this order?')) return
    setCancelling(true)
    const res = await fetch('/api/orders/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_key: id }),
    })
```

⚠️ **A native `window.confirm`. The body carries `order_key` and nothing else** — no reason, no amount, no payment context.

### The route — `app/api/orders/cancel/route.ts`, its three guards

```ts
    if (!truck?.allow_customer_cancellation) {
      return NextResponse.json({ error: 'This truck does not accept cancellations' }, { status: 403 })
    }
    if (!['pending', 'confirmed'].includes(order.status)) {
      return NextResponse.json({ error: 'This order can no longer be cancelled' }, { status: 409 })
    }
    if (truck?.cancellation_cutoff_mins && order.event_date) {
      …
        if (new Date() > cutoffTime) {
          return NextResponse.json(
            { error: `Orders can no longer be cancelled within ${truck.cancellation_cutoff_mins} minutes of collection` },
            { status: 409 })
```

🔴 **NOT ONE OF THE THREE MENTIONS PAYMENT.** The route has no `payment_status`, no `paid_at`, no ledger read.

### Every database write — exactly one

```ts
    const { error: cancelError } = await supabase
      .from('orders')
      .update({ status: 'cancelled', cancellation_reason: 'Customer cancelled' })
      .eq('order_key', orderKey)
```

**Plus one best-effort side effect:**

```ts
        await removeOrderFromProductionSlot(
          supabase, order.truck_id, order.event_id, order.slot,
          normaliseOrderLines(order.items || [], order.deals), itemCatMap)
```

🔴 **NO `order_payments` ROW IS WRITTEN. NO `payment_status` IS CHANGED.** A paid order that is cancelled keeps `payment_status = 'paid'` and `amount_paid` intact.

### The email — one, and it promises a refund

```ts
      await sendCancellationEmail({
        to: order.customer_email,
        …
        paymentStatus: order.payment_status ?? null,
      })
```

### 🔴 WHAT HAPPENS TODAY WHEN THE ORDER WAS PAID ONLINE

**INFERRED, from the quoted code:**

| | |
|---|---|
| Can the customer reach it? | 🔴 **NO — the new `canCancel` gate blocks the button** (§0). The **route itself would still allow it** if called directly, since it never checks payment |
| Order row | `status: 'cancelled'`, `payment_status` **stays `'paid'`** |
| Ledger | 🔴 **UNTOUCHED** — the charge row stands |
| Stripe | 🔴 **NOTHING HAPPENS.** No refund, no cancel, no API call at all |
| Email | 🔴 **PROMISES A REFUND** — *"Your refund will be processed automatically within 3–5 working days"* (§4) |
| Money | 🔴 **STILL IN THE TRUCK'S STRIPE ACCOUNT** |

🔴 **SO THE PRE-GATE BEHAVIOUR WAS: CANCEL THE ORDER, PROMISE AN AUTOMATIC REFUND, AND ISSUE NONE.**

---

## 2. The operator cancellation flow, end to end

**Source: QUOTED.**

### Single order — `app/api/dashboard/action/route.ts:298-328`

```ts
    if (action === 'cancel') {
      const { cancellationReason } = body
      const { data: order } = await supabase.from('orders').select('*').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      await supabase.from('orders').update({ status: 'cancelled', cancellation_reason: cancellationReason || null }).eq('order_key', orderKey).eq('truck_id', truck.id)
      if (order.event_date) {
        const itemCatMap = await buildItemCatMap(supabase, truck.id)
        await removeOrderFromProductionSlot(
          supabase, truck.id, order.event_id, order.slot,
          normaliseOrderLines(order.items || [], order.deals), itemCatMap
        )
      }
      if (order.customer_email) {
        const reasonLine = cancellationReason ? `<p style="color:#475569">${cancellationReason}</p>` : ''
        const refundLine = order.paid_at ? `<p>Your refund will be processed automatically within 3–5 working days.</p>` : ''
        await notifyCustomer(truck, order.customer_email, `Your order has been cancelled — ${truck.name}`, …)
      }
      return NextResponse.json({ success: true, status: 'cancelled' })
    }
```

| | |
|---|---|
| **Guards** | 🔴 **NONE beyond "the order exists on this truck".** No status check, no cutoff, **no payment check** |
| **DB writes** | one — `status` + `cancellation_reason`. **No ledger row, no `payment_status` change** |
| **Slot** | `removeOrderFromProductionSlot`, awaited (not wrapped in try/catch here, unlike the customer path) |
| **Email** | inline HTML via `notifyCustomer`, 🔴 **branching on `order.paid_at`** |
| **Stripe** | 🔴 **NOTHING** |

⚠️ **The operator path is LESS guarded than the customer path** — it will cancel a `ready` or `collected` order, and past any cutoff.

### 🔴 Bulk event cancellation — `app/api/events/action/route.ts:204-242`

```ts
    const { data: affectedOrders } = await supabase
      .from('orders')
      .select('*')
      .eq('event_id', eventId)
      .in('status', ['confirmed', 'pending'])

    let cancelledOrders = 0
    if (affectedOrders && affectedOrders.length > 0) {
      const orderKeys = affectedOrders.map((o: any) => o.order_key)
      await supabase
        .from('orders')
        .update({
          status: 'cancelled',
          cancellation_reason: `Event cancelled${fullNote ? ': ' + fullNote : ''}`,
        })
        .in('order_key', orderKeys)

      cancelledOrders = affectedOrders.length

      for (const order of affectedOrders) {
        if (order.customer_email) {
          await sendEventCancellationEmail({
            …
            paymentStatus: order.paid_at ? 'paid' : null,
          })
        }
      }
    }
```

🔴 **ONE BULK `UPDATE … .in('order_key', keys)` FOR EVERY ORDER, THEN A LOOP OF EMAILS.**

⚠️ **THIS IS THE HARDEST PATH FOR A REFUND FEATURE, AND IT IS WORTH NAMING NOW:**
- It sweeps **paid and unpaid orders in one statement** with no per-row branch.
- 🔴 **`paymentStatus: order.paid_at ? 'paid' : null`** — it does not read `payment_status` at all, so **a card-paid order whose `paid_at` is null gets no refund line**, and a cash order with `paid_at` set gets one.
- **The emails are sent in a serial `for` loop**, already a scaling concern before any Stripe call is added per row.

---

## 3. Every `refund_due` occurrence

**Source: QUOTED.** An exhaustive grep across `app/`, `lib/`, `components/`, `supabase/`.

| File : line | Kind | What |
|---|---|---|
| 🔴 `lib/payments/ledger.ts:226` | **WRITE** | `else if (paidMinor < 0) status = 'refund_due'` |
| 🔴 `lib/payments/ledger.ts:227` | **WRITE** | `else if (balanceMinor < 0) status = 'refund_due'` |
| `lib/payments/ledger.ts:65` | type | `export type PaymentStatus = … \| 'refund_due' \| …` |
| `lib/payments/ledger.ts:47` | comment | the reconciliation SQL in the header |
| `lib/supabase.ts:52` | type | the `orders` row type |
| `lib/printing/ticket.ts:103` | type | `paymentStatus?:` on the ticket model |
| `app/order/[id]/manage/page.tsx:127` | **READ** | the new `canCancel` gate — 🔴 **the ONLY functional read outside the ledger** |
| `20260729_orders_payment_status_widen_check.sql:70` | schema | `check (payment_status in (…, 'refund_due', …))` |

### 🔴 DOES ANYTHING SET IT? — YES, TWO BRANCHES

```ts
  else if (paidMinor < 0) status = 'refund_due'
  else if (balanceMinor < 0) status = 'refund_due'
```

**QUOTED from `getOrderBalance`. It means "we hold more of the customer's money than the order is worth"** — either refunds exceed charges, or the total was edited down after payment. **`recalcOrderPayment` then writes it to `orders.payment_status`.**

### 🔴 DOES ANYTHING RENDER IT? — TO NOBODY

| Surface | Renders `refund_due`? |
|---|---|
| `OrderCard` | 🔴 **NO.** It tests `balance.status === 'paid' \| 'refunded'` and `'part_paid'` — **`refund_due` falls through every branch** |
| The customer manage page | 🔴 **NO.** `payment_status === 'paid' ? 'Paid by card' : 'Pay at the truck'` — **a `refund_due` order reads "Pay at the truck"** |
| The new confirmation | 🔴 **NO** — same two-branch test |
| The printed ticket | ⚠️ **The type admits it**; whether `ticket.ts` prints it was not traced. **Not established** |
| Any email | 🔴 **NO** — a grep finds no `refund_due` in `lib/email.ts` |

🔴 **SO AN ORDER CAN CARRY `refund_due` — AND THE BUILD REPORT CONFIRMED ONE DOES (`a9f1aa6d`, paid 1900 against a 950 total) — AND NO HUMAN IS TOLD.** ⚠️ Worse: that order's customer page says *"Pay at the truck"* while the platform holds double their money.

---

## 4. Every customer-facing refund sentence — four sites, and they disagree

**Source: QUOTED.**

### Site 1 — `lib/email.ts:414-416` · `sendCancellationEmail` (the customer-cancel and… nothing else)

```ts
  const refundLine = paymentStatus === 'paid'
    ? `<p>Your refund will be processed automatically within 3–5 working days.</p>`
    : ''
```
**Branches on:** the `paymentStatus` argument, passed as `order.payment_status ?? null` from `/api/orders/cancel`.
**Promises:** 🔴 **an AUTOMATIC refund within 3–5 working days.**

### Site 2 — `lib/email.ts:432` · the plain-text half of the same email

```ts
    text: `… ${paymentStatus === 'paid' ? ' Your refund will be processed within 3–5 working days.' : ''} …`
```
⚠️ **Same field, same window, but the word *"automatically"* is missing.** The HTML and text bodies of one email do not match.

### Site 3 — `lib/email.ts:455-457` · `sendEventCancellationEmail`

```ts
  const refundLine = paymentStatus === 'paid'
    ? ' Your refund will be processed automatically within 3–5 working days.'
    : ''
```
🔴 **Branches on a value the caller derives as `order.paid_at ? 'paid' : null`** — **not** `payment_status`.

### Site 4 — `app/api/dashboard/action/route.ts:315` · the operator-cancel email, inline

```ts
        const refundLine = order.paid_at ? `<p>Your refund will be processed automatically within 3–5 working days.</p>` : ''
```
🔴 **Branches on `paid_at` directly.**

### Site 5 — `app/order/[id]/manage/page.tsx:98-101` · the post-cancel screen

```tsx
          <p className="text-sm text-slate-500">
            Your order has been cancelled. If you paid by card, any refund is handled by{' '}
            {order?.truck_name || 'the truck'} directly — please contact them about it.
          </p>
```
**Branches on:** 🔴 **nothing — it is unconditional.**
**Promises:** ✅ **that the TRUCK handles it. The opposite of sites 1-4.**

### Site 6 — `app/order/[id]/manage/page.tsx:141` · the new `statusLabel`

```tsx
      return `This order has been paid. To cancel it or ask for a refund, please contact ${order.truck_name || 'the truck'} directly.`
```

### 🔴 THE CONTRADICTION TABLE

| Site | File:line | Branches on | Promises |
|---|---|---|---|
| 1 | `email.ts:414` | `payment_status` | 🔴 **automatic, 3–5 days** |
| 2 | `email.ts:432` | `payment_status` | 🔴 3–5 days (no "automatically") |
| 3 | `email.ts:455` | 🔴 **`paid_at`** (via the caller) | 🔴 **automatic, 3–5 days** |
| 4 | `action/route.ts:315` | 🔴 **`paid_at`** | 🔴 **automatic, 3–5 days** |
| 5 | `manage/page.tsx:98` | nothing | ✅ **the truck handles it** |
| 6 | `manage/page.tsx:141` | `payment_status` | ✅ **contact the truck** |

🔴 **FOUR SITES PROMISE AN AUTOMATIC REFUND THAT NOTHING ISSUES. TWO SAY THE OPPOSITE. AND THE TWO GROUPS BRANCH ON DIFFERENT FIELDS** — so a card-paid order with a null `paid_at` gets no promise from sites 3-4 and a full promise from site 1.

⚠️ **`paid_at` versus `payment_status` is not cosmetic.** The `orders` row carries both; `recalcOrderPayment` writes `payment_status` and `amount_paid` **and does not touch `paid_at`**. **Not established** what still writes `paid_at` — that was outside this pass.

---

## 5. What Stripe requires to refund a direct charge

**Source: QUOTED**, from the installed SDK's types and from the code that already calls Stripe.

### Which object is refunded — `node_modules/stripe/cjs/resources/Refunds.d.ts:428-461`

```ts
export interface RefundCreateParams {
    amount?: number;
    /**
     * The identifier of the charge to refund.
     */
    charge?: string;
    …
    /**
     * The identifier of the PaymentIntent to refund.
     */
    payment_intent?: string;
```

🔴 **EITHER. Both are optional and either identifies the payment.** ✅ **`payment_intent` is accepted directly** — this is the decisive finding for §6.

**Other relevant parameters, quoted:**

| Param | Note |
|---|---|
| `amount?: number` | **partial refunds are supported** — omit for a full refund |
| `reason?: 'duplicate' \| 'fraudulent' \| 'requested_by_customer'` | |
| `metadata?` | ⚠️ **the same hook the PaymentIntent uses to carry `order_key`** |
| `refund_application_fee?: boolean` | *"An application fee can be refunded only by the application that created the charge."* ⚠️ **Moot — this build sends no application fee** |
| `reverse_transfer?: boolean` | *"A transfer can be reversed only by the application that created the charge."* ⚠️ **Moot — direct charges have no transfer** |

### The connected-account header

**`node_modules/stripe/cjs/Types.d.ts:89` and `:244`:**

```ts
    stripeAccount?: string;
```

**And the pattern already in use — `app/api/stripe/checkout/route.ts`:**

```ts
    const session = await stripe.checkout.sessions.create(
      { … },
      // 🔴 The connected account. Without this header the charge would be created on the PLATFORM
      // account, making HatchGrab merchant of record — the one thing the model forbids.
      { stripeAccount: operator.stripe_account_id },
    )
```

✅ **The SDK exposes `stripe.refunds` (`stripe.core.d.ts:197`: `refunds: RefundResource`)**, and `RequestOptions.stripeAccount` is the second argument — **exactly the shape the checkout route already uses.**

### Can the platform initiate it?

⚠️ **INFERRED, and stated as such.** The mechanism is present: the platform's secret key plus `{ stripeAccount }` is how every other Connect call in this codebase acts on a connected account, and `stripe.refunds.create` takes the same `RequestOptions`. 🔴 **But whether Stripe PERMITS a platform to refund a direct charge on a connected account — and under what Connect capability — is a policy question the type definitions do not answer.** **NOT ESTABLISHED from the repository, and I will not answer it from memory.**

⚠️ **One thing the types DO say bears on it:** the `refund_application_fee` and `reverse_transfer` docstrings both read *"only by the application that created the charge"* — **HatchGrab did create the charge**, via `sessions.create` with `{ stripeAccount }`. **That is suggestive, not conclusive**, and both parameters are moot here anyway.

---

## 6. What we store, and whether it is enough

**Source: QUOTED.**

### What is stored — the PaymentIntent id, and only that

**`lib/payments/online.ts:83`:**
```ts
    externalRef: args.paymentIntentId,
```

**Written into `order_payments.external_ref`** — `lib/payments/ledger.ts:524`:
```ts
    external_ref: event.externalRef ?? null,
```

**The column's own comment, `20260729_order_payments_ledger.sql:70-71`:**
```sql
  -- The processor's id (Stripe PaymentIntent/Refund) once Stripe exists. Its PRESENCE is also the test
  -- for "real money moved" that decides delete-vs-reverse on undo.
```

### 🔴 DO WE STORE A CHARGE ID? — NO

```
$ grep -rn "latest_charge\|charge_id\|'ch_'\|charges.retrieve" app lib
  (no matches)
```

🔴 **Nothing in the codebase stores, reads or fetches a Stripe Charge id.**

### ✅ THE VERDICT: A REFUND IS POSSIBLE TODAY, WITH NO NEW DATA

| Question | Answer |
|---|---|
| Does a refund need the Charge? | 🔴 **NO** — `payment_intent` is an accepted alternative (§5) |
| Do we store what is needed? | ✅ **YES** — `order_payments.external_ref` holds `pi_…`, verified live: `pi_3U31rB2fB4PPCw2D0j9ji161`, `pi_3U3GgH2fB4PPCw2D13vzTwn2`, `pi_3U3GBu2fB4PPCw2D0c1r7d6g`, `pi_3U3GYj2fB4PPCw2D0FMj5XRb`, `pi_3U3MWk2fB4PPCw2D1L7mjQy8` |
| Is a migration needed to issue one? | 🔴 **NO** |

⚠️ **BUT `external_ref` IS NULLABLE AND IS NULL ON EVERY IN-PERSON ROW.** `recordCollectionPayment` never sets it. **A refund action would have to key on `channel = 'online'` AND a non-null `external_ref`**, and treat a cash charge as unrefundable-by-us — which is correct, since no card was involved.

⚠️ **The connected account id is on `operators.stripe_account_id`, reachable via `orders.truck_id → trucks.operator_id`** — the same two hops the account-mode work already makes.

---

## 7. The ledger's write path, and how a refund would be represented

**Source: QUOTED.**

### The CHECK constraints — `20260729_order_payments_ledger.sql:78-83`

```sql
  constraint order_payments_kind_chk    check (kind    in ('charge', 'refund')),
  constraint order_payments_channel_chk check (channel in ('online', 'in_person_stripe', 'in_person_other')),
  constraint order_payments_state_chk   check (state   in ('pending', 'succeeded', 'failed')),
  -- Positive-only: a negative "charge" and a positive "refund" would both balance the same way while
  -- meaning opposite things. The sign lives in `kind`, in exactly one place.
  constraint order_payments_amount_positive_chk check (amount_minor > 0)
```

✅ **`'refund'` IS ALREADY A LEGAL `kind`. `'pending'` IS ALREADY A LEGAL `state`.** No migration is needed for either.

### The three writers

**`recordOnlineCardPayment` — `lib/payments/online.ts`:**
```ts
  return recordPaymentEvent(supabase, {
    orderKey: args.orderKey, truckId: args.truckId,
    kind: 'charge', channel: 'online',
    amountMinor: args.amountMinor, state: 'succeeded', method: 'card',
    externalRef: args.paymentIntentId,
    idempotencyKey: onlinePaymentIdempotencyKey(args.paymentIntentId),
    livemode: args.livemode, currency: args.currency,
    createdBy: 'stripe_webhook', note: 'Online card payment',
  })
```

**`recordCollectionPayment` — `lib/payments/ledger.ts`:**
```ts
  const { inserted, balance } = await recordPaymentEvent(supabase, {
    orderKey: opts.orderKey, truckId: opts.truckId,
    kind: 'charge', channel: 'in_person_other',
    amountMinor: before.balanceMinor, state: 'succeeded',
    idempotencyKey: collectIdempotencyKey(opts.orderKey, before.paidMinor, before.balanceMinor),
    note: 'Mark paid & done — taken at the hatch',
    createdBy: opts.createdBy ?? null, method: opts.method ?? null,
    livemode: true,
  })
```

### 🔴 `reverseCollectionPayment` — THE PRECEDENT, AND IT ALREADY WRITES A REFUND ROW

```ts
  // Real money moved — compensate, never delete. No idempotency key: a second undo of a genuinely
  // processed payment is a distinct money event and must not be silently swallowed by a key collision.
  const { balance } = await recordPaymentEvent(supabase, {
    orderKey: opts.orderKey,
    truckId: opts.truckId,
    kind: 'refund',
    channel: row.channel,
    amountMinor: Math.round(row.amount_minor),
    state: 'succeeded',
    note: 'Reversal of "Mark paid & done" (undo) — original payment had an external reference',
    createdBy: opts.createdBy ?? null,
    livemode: row.livemode ?? true,
  })
  return { reversal: 'refunded', balance }
```

⚠️ **And the delete-vs-compensate rule it implements:**
```ts
    // 'refunded' appends a compensating row, 'none' found nothing to reverse
```
🔴 **The test is `external_ref` presence** — *"Its PRESENCE is also the test for 'real money moved' that decides delete-vs-reverse on undo."*

### 🔴 HOW A REFUND WOULD BE REPRESENTED — A NEW ROW

| Option | Verdict |
|---|---|
| ✅ **A new `kind: 'refund'` row** | 🔴 **THE ONLY ONE CONSISTENT WITH THE DESIGN.** The table is append-oriented, `amount_minor` is positive-only with the sign in `kind`, and `reverseCollectionPayment` already does exactly this |
| 🔴 A state change on the charge row | 🔴 **WRONG.** `state` means the processor's outcome for *that* event, not whether it was later undone. Mutating it would destroy the record of a payment that genuinely happened |
| 🔴 A negative `amount_minor` | 🔴 **FORBIDDEN by CHECK**, and the constraint's comment says why |

⚠️ **`state: 'pending'` is available and may matter here in a way it does not for cash:** a Stripe refund is not instantaneous. **Not established** whether a refund should be booked `pending` on request and moved to `succeeded` on `charge.refunded` — that is a design question, and §10 shows we do not receive that event today.

⚠️ **`channel` would be `'online'`** (inherited from the row being reversed, as `reverseCollectionPayment` does), and **`external_ref` would hold the Refund's own `re_…` id** — the column's comment already anticipates *"PaymentIntent/Refund"*.

---

## 8. `getOrderBalance` with a refund row, and `recalcOrderPayment`

**Source: QUOTED.**

### The arithmetic already handles it

```ts
  const succeeded = (ledgerRows ?? []).filter(r => isLiveRow(r) && r.state === 'succeeded')
  const chargeMinor = succeeded.filter(r => r.kind === 'charge').reduce((s, r) => s + Math.round(r.amount_minor), 0)
  const refundMinor = succeeded.filter(r => r.kind === 'refund').reduce((s, r) => s + Math.round(r.amount_minor), 0)

  const paidMinor = chargeMinor - refundMinor
  const totalMinor = orderTotalMinor(order)
  const balanceMinor = totalMinor - paidMinor
  const hasRefundRow = succeeded.some(r => r.kind === 'refund')
```

**And the status branches, with their load-bearing order:**

```ts
  // ── BRANCH ORDER IS LOAD-BEARING ──────────────────────────────────────────────────────────────────
  // 'refunded' is tested FIRST and keys on refund-row PRESENCE, never on the sum. "Charged then fully
  // refunded back to zero" and "never paid at all" are the SAME arithmetic state (paidMinor === 0);
  // only the existence of a refund row tells them apart. Reordering these two silently reports every
  // fully-refunded order as 'unpaid'.
  let status: PaymentStatus
  if (paidMinor === 0 && hasRefundRow) status = 'refunded'
  else if (paidMinor === 0) status = 'unpaid'
  else if (paidMinor < 0) status = 'refund_due'
  else if (balanceMinor < 0) status = 'refund_due'
  else if (balanceMinor === 0) status = 'paid'
  else status = 'part_paid'
```

### 🔴 WHAT `payment_status` WOULD BECOME

| Refund | `paidMinor` | Resulting status |
|---|---|---|
| ✅ **Full** (refund = charge) | `0` with `hasRefundRow` | 🔴 **`'refunded'`** — the first branch, already correct |
| **Partial** | `> 0`, `balanceMinor > 0` | **`'part_paid'`** ⚠️ which reads as *"still owes money"* — arithmetically right, semantically odd for a refund |
| **Over-refund** | `< 0` | **`'refund_due'`** |

✅ **NO CHANGE TO `getOrderBalance` IS NEEDED. It has handled refunds since the ledger was built.**

### `recalcOrderPayment` — the write-back

```ts
export async function recalcOrderPayment(supabase: SupabaseClient, orderKey: string): Promise<OrderBalance> {
  const [order, rows] = await Promise.all([readOrder(supabase, orderKey), readLedger(supabase, orderKey)])
  const balance = getOrderBalance(order, rows)

  const { error } = await supabase
    .from('orders')
    .update({ payment_status: balance.status, amount_paid: fromMinor(balance.paidMinor) })
    .eq('order_key', orderKey)
```

✅ **`'refunded'` is in the CHECK** (`20260729_orders_payment_status_widen_check.sql:70`), so the write-back succeeds.

🔴 **BUT NOTHING RENDERS `'refunded'` AS A DISTINCT STATE.** `OrderCard:212` reads `const isPaid = balance.status === 'paid' || balance.status === 'refunded'` — **a fully refunded order shows the same PAID chip as a paid one.**

---

## 9. The operator surfaces

**Source: QUOTED.**

### What the card shows for a cancelled order today

```tsx
  const otherOrders = eventOrders.filter(o => ['collected','cancelled','rejected'].includes(o.status))
  const cancelledCount = otherOrders.filter(o => o.status === 'cancelled').length
```

⚠️ **A cancelled order moves to the "Completed" section**, alongside collected and rejected ones.

**And `OrderCard`'s action block, quoted by status:**
```tsx
    if (order.status === 'pending') { … Confirm / Reject … }
    …
    if (order.status === 'cooking') { … }
    if (order.status === 'ready') { … }
```
🔴 **THERE IS NO `if (order.status === 'cancelled')` BRANCH.** A cancelled order renders **no action buttons at all** — which is exactly the empty space a Refund button would occupy.

### The PAID chip on a cancelled-and-paid order

```tsx
  const isPaid = balance.status === 'paid' || balance.status === 'refunded'
  const isPartPaid = balance.status === 'part_paid'
```
⚠️ **`balance` is computed regardless of `status`, so a cancelled-and-paid order STILL SHOWS ITS PAID CHIP.** ✅ That is useful — the operator can see the money is there — but it is the only signal.

### 🔴 DOES THE DASHBOARD KNOW ONLINE FROM IN-PERSON? — THE DATA ARRIVES; NOTHING READS IT

```ts
export const LEDGER_ROW_COLUMNS = 'order_key, truck_id, kind, channel, amount_minor, state, external_ref, livemode'
```

✅ **`channel` is selected and reaches the browser** in `/api/dashboard`'s `payments` map.

```
$ grep -n "channel" components/dashboard/OrderCard.tsx app/dashboard/[token]/page.tsx components/dashboard/types.ts
  OrderCard.tsx:495   — a COMMENT about colour
  OrderCard.tsx:817   — a COMMENT about layout
  OrderCard.tsx:841   — a COMMENT about layout
  page.tsx:938/943    — supabase REALTIME channels, unrelated
```

🔴 **NOT ONE FUNCTIONAL READ. The operator cannot tell a £12 card payment from £12 of cash on any surface.** ⚠️ **For a refund button that is decisive** — it must appear only for `channel: 'online'` rows with an `external_ref`, and the component currently has the data and no code that looks at it.

### Where a button would live — INFERRED

| Candidate | Note |
|---|---|
| **`OrderCard`'s empty cancelled branch** | ✅ The natural home; the card already computes `balance` and receives `ledgerRows` |
| **A new `action` in `/api/dashboard/action`** | ✅ Matches every other operator money action (`collected`, `mark_paid`, `undo_collected`) and inherits `verifyToken` |
| **The customer manage page** | 🔴 **NO** — the brief says operator-authorised, never automatic |

---

## 10. A refund made in the truck's own Stripe dashboard

**Source: QUOTED. 🔴 THE EVENT REACHES US AND IS DISCARDED.**

### Every event type the webhook handles — exactly two

```
$ grep -n "eventType === " app/api/webhooks/stripe/route.ts
  252:  if (eventType === 'account.updated') {
  327:  if (eventType === 'payment_intent.succeeded') {
```

🔴 **`charge.refunded`, `refund.created`, `refund.updated` and `charge.refund.updated` are NOT handled.**

### What happens to one

**The default arm, quoted:**
```ts
  // ── UNRECOGNISED EVENT TYPES ARE NORMAL, NOT ERRORS ──────────────────────────────────────────────
  // Every verified event is recorded and acknowledged, whatever its type. Handlers dispatch above on
  // `eventType`; this default arm stays exactly as it is: record, log, 200.
  return NextResponse.json({ received: true })
```

| Step | What happens |
|---|---|
| Delivery | ⚠️ **Only if the endpoint is SUBSCRIBED to that event.** **Not established** — the Stripe Dashboard's subscription list was not read |
| Signature | ✅ verified normally |
| `stripe_webhook_events` | ✅ **A ROW IS WRITTEN** — type, livemode, connected_account, all of it |
| `order_payments` | 🔴 **NOTHING** — no handler, no ledger row |
| `orders.payment_status` | 🔴 **UNCHANGED — still `'paid'`** |

🔴 **SO: A TRUCK REFUNDS IN STRIPE, THE MONEY GOES BACK, AND EVERY HATCHGRAB SURFACE STILL SAYS PAID.** ✅ The receipt log would hold the evidence; nothing would act on it.

⚠️ **This is the mirror of the feature being asked for**, and it argues that whatever writes a refund row should be the **webhook**, not the button — so a Dashboard refund and a HatchGrab refund converge on one path. **INFERRED**, and offered as an observation rather than a design.

---

## 11. Guards a refund action would need

**Source: QUOTED** for the existing patterns; **INFERRED** for the requirements.

### Who may press it

✅ **`verifyToken` already exists** — `app/api/dashboard/action/route.ts:71-77`:
```ts
async function verifyToken(token: string, pin?: string) {
  const { data: truck } = await supabase
    .from('trucks').select('*').eq('dashboard_token', token).single()
  if (!truck) return null
  if (truck.dashboard_pin && truck.dashboard_pin !== pin) return null
  return truck
}
```
⚠️ **Truck-level, not per-user.** Every money action already uses it, and every handler additionally scopes `.eq('truck_id', truck.id)`.

⚠️ **`created_by` is on the ledger** and `lib/audit/actor.ts` resolves a real name for `action_audit_log` — so attribution is available if a refund should record who authorised it.

### Partial refunds

✅ **Stripe supports them** — `amount?: number` (§5). ✅ **The ledger supports them** — a `refund` row for less than the charge yields `part_paid`. ⚠️ **`getOrderBalance` has no notion of "refunded in part"**, so the UI meaning is unresolved. **Not established** whether the product wants them.

### 🔴 WHAT PREVENTS A DOUBLE REFUND — the existing pattern, and its deliberate exception

**`recordPaymentEvent`, quoted:**
```ts
    // 23505 = the idempotency key already exists. USUALLY a genuine replay, whose money is already
    if (error.code === '23505') inserted = false
```

**The unique index is `order_payments_idempotency_key_uidx`, and there are two key shapes:**

```ts
export function collectIdempotencyKey(orderKey: string, paidBeforeMinor: number, balanceMinor: number): string {
  return `collect:${orderKey}:${paidBeforeMinor}:${balanceMinor}`
}
```
```ts
export function onlinePaymentIdempotencyKey(paymentIntentId: string): string {
  return `stripe_pi:${paymentIntentId}`
}
```

🔴 **THE SECOND IS THE ONE TO REUSE, AND `online.ts` SAYS WHY:**
```
 * ✅ THE STRIPE OBJECT ID IS THE CORRECT KEY. The PaymentIntent id is globally unique, is minted by
 * Stripe before the money moves, and is IDENTICAL on every redelivery of the event — which is exactly
 * the property the unique index needs.
 …
 * ⚠️ Prefixed rather than bare, so a key can never be confused with one minted by another path
```

⚠️ **AND THE COUNTER-EXAMPLE IS ALSO IN THE FILE.** `reverseCollectionPayment` writes its refund row with **NO key**, deliberately:
```ts
  // Real money moved — compensate, never delete. No idempotency key: a second undo of a genuinely
  // processed payment is a distinct money event and must not be silently swallowed by a key collision.
```

🔴 **SO THE CODEBASE HOLDS BOTH ANSWERS, AND THEY APPLY TO DIFFERENT THINGS.** A refund driven by a **Stripe Refund id** (`re_…`) should key on it; a refund driven by an **operator pressing a button twice** is the case that must not be swallowed silently. **INFERRED:** the ledger row should key on Stripe's Refund id, and the double-press must be caught **before** the Stripe call — because two `refunds.create` calls would create **two real refunds** that no ledger key can undo.

### What happens if refunded twice today

⚠️ **INFERRED, from the quoted arithmetic:** two full refund rows give `paidMinor < 0` → **`'refund_due'`** → a state nothing renders (§3). 🔴 **And on the Stripe side there would be two genuine refunds** — the money side is not protected by anything in this codebase.

### Guards the analysis implies — INFERRED, offered as a checklist rather than a design

| Guard | Why |
|---|---|
| The order belongs to this truck | every other handler does `.eq('truck_id', truck.id)` |
| `channel = 'online'` **and** `external_ref` non-null | a cash charge is not ours to refund (§6) |
| No existing `kind: 'refund'` row | check **before** the Stripe call, not only at insert (§11) |
| `getOrderBalance().paidMinor > 0` | do not refund an order with nothing on it |
| `operators.stripe_charges_enabled` / a live account | the same readiness the checkout route re-reads |
| 🔴 The sandbox key guard | `sandboxKey()` refuses `sk_live_` — **a refund route inherits that refusal, so it cannot move real money on this build either** |
| An audit row | `action_audit_log` already records every money action with before/after state |

---

## Quoted vs inferred

| § | Status |
|---|---|
| 0 | **QUOTED** — the gate, the copy, and a **negative grep** for other consumers |
| 1 | **QUOTED** — control, route, all three guards, the single write, the email. The paid-order outcome is **INFERRED** from those quotes |
| 2 | **QUOTED** — both handlers in full, including the bulk update and the email loop |
| 3 | **QUOTED** — an exhaustive grep, every hit classified. The ticket-printing question is **not established** |
| 4 | **QUOTED** — all six sites with their branch fields |
| 5 | **QUOTED** — `RefundCreateParams`, `RequestOptions.stripeAccount`, `RefundResource`, and the existing `{ stripeAccount }` call. 🔴 **Whether Stripe PERMITS a platform-initiated refund on a direct charge is NOT ESTABLISHED** |
| 6 | **QUOTED** — the writer, the column, its comment, and a **negative grep** for any Charge id |
| 7 | **QUOTED** — all four CHECK constraints and all three writers |
| 8 | **QUOTED** — the arithmetic, the branch order, and `recalcOrderPayment` |
| 9 | **QUOTED** — the completed-list filter, the action-block statuses, the PAID-chip test, and a **negative grep** for `channel` reads |
| 10 | **QUOTED** — a `grep` returning exactly two event types, plus the default arm. Subscription state is **not established** |
| 11 | **QUOTED** — `verifyToken`, both idempotency helpers, the 23505 handler, and the deliberate no-key case. The checklist is **INFERRED** |

## Not established

- 🔴 **Whether Stripe permits a PLATFORM to refund a direct charge on a connected account**, and under what capability. The SDK types show the mechanism, not the policy — and I will not answer it from memory.
- **Whether the Stripe endpoint is subscribed to `charge.refunded`.** That is in the Dashboard, not the repo.
- **What still writes `orders.paid_at`**, which three of the four refund sentences branch on while `recalcOrderPayment` does not touch it.
- **Whether `lib/printing/ticket.ts` prints `refund_due`** — its type admits the value; the render was not traced.
- **Whether partial refunds are wanted**, and what `part_paid` should mean after one.
- **Whether a refund row should be booked `pending` on request and settled on a webhook** — the `state` column allows it, but we do not receive the event that would settle it (§10).
