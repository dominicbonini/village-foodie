# Structural diagnosis — the code an authorize-then-capture flow would sit on

**Date:** 11 August 2026
**READ-ONLY. No file changed, no file created except this report. No `next dev`, no `next build`.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

🔴 **ONE FINDING IS NOT STRUCTURAL AND YOU NEED IT BEFORE ANY DESIGN WORK: server-side price validation is INERT. It cannot reject anything, including a client that posts a total of £0.01.** Proven by execution, not inference — §6.

**Every answer below is labelled QUOTED or INFERRED. Where neither is possible it says "not established".**

---

## 1. `app/api/orders/submit/route.ts` — structural map

**Source: QUOTED** (line ranges and phase markers read from the file; the file is **1,144 lines**).

| # | Lines | Phase | What it does | Moveable? |
|---|---|---|---|---|
| 1 | 303–322 | **VALIDATION** | `await req.json()`, destructure 15 fields | pure |
| 2 | 324–327 | **VALIDATION** | required-field check → 400 | **pure** |
| 3 | 329–348 | **VALIDATION** | fetch truck by `slug`, then fallback by `id` | DB read |
| 4 | 351–363 | **VALIDATION** | account-pending-deletion gate → refusal | DB read |
| 5 | 369–386 | **VALIDATION** | demo/hidden-truck gate | DB read |
| 6 | 404–442 | **VALIDATION** | plan/feature gates (`canAccess`) | DB read |
| 7 | 466–537 | 🔴 **VALIDATION** | menu + bundles + discount fetch; `calculateOrderTotal`; `validateOrderTotals` → 400 | **DB reads + pure compute — see §6** |
| 8 | 538–597 | **VALIDATION** | resolve the event; pre-order-window gate | DB read |
| 9 | 599–718 | **VALIDATION** | required-modifier completeness guard → 409 | mostly pure |
| 10 | 720–730 | **STOCK GUARD** | option sold-out backstop → 409 | DB read |
| 11 | **742** | 🔴 **LOCKING** | `acquireEventLock(resolvedTruckId, orderEventDate)` | **cannot move** |
| 12 | 755–762 | **LOCKING** | not acquired → 409 `{ retry: true }`, **no insert** | — |
| 13 | 766–795 | 🔴 **STOCK GUARD** | `checkClosedCategories` → 409; `checkStockShortfall` → 409; `checkOptionCeilingShortfall` → 409 | **cannot move — inside the lock** |
| 14 | 800–890 | 🔴 **SLOT RESOLUTION** | `eventKitchenCapacity`, then `placeOrderInSlotLocked` — *"RESOLVES { booked, finalSlot } and files NOTHING"* | **cannot move — inside the lock** |
| 15 | 892–902 | **SLOT RESOLUTION** | `computeEventUnitRows` — the usage rows *"AS IF this order were committed"* | inside the lock |
| 16 | 907–930 | 🔴 **DB WRITE** | `supabase.rpc('place_order_atomic', …)` | **cannot move** |
| 17 | 938–940 | **LOCKING** | `finally { if (haveLock) await releaseEventLock(...) }` | — |
| 18 | 960–979 | **DB WRITE** | `upsell_events` insert — **fire-and-forget**, not awaited | after |
| 19 | 981–989 | **DB WRITE** | `enforceStockLimits(...)` — writes `event_item_stock.available` | after |
| 20 | 991–1017 | **NOTIFICATION** | truck's new-order email | after |
| 21 | 1019–1075 | 🔴 **NOTIFICATION** | **customer confirmation email** | after — **see §8** |
| 22 | 1077–1119 | **NOTIFICATION** | APNs push `sendOrderPendingPush` | after |
| 23 | 1122–1133 | **RESPONSE** | `NextResponse.json({ success, orderId, orderKey, … })` | — |

### Every side effect outside the request

**Source: QUOTED**

| Side effect | Line | Kind |
|---|---|---|
| `booking_locks` DELETE (stale sweep) + INSERT | `stock-guard.ts:47-56` | DB write |
| `place_order_atomic` RPC | **922** | DB write (transaction) |
| `booking_locks` DELETE (release) | `stock-guard.ts:63-68` | DB write |
| `upsell_events` insert | 976 | DB write, **not awaited** |
| `enforceStockLimits` | 985 | DB write |
| Truck email → Brevo | 1013 | network |
| Customer email → Brevo | 1067 | network |
| APNs push → `api.push.apple.com` | 1109 | network |

⚠️ **`await req.json()` at 303 consumes the request stream** — the body can be read once.

### Pure vs unmoveable

**INFERRED from the phase markers and the lock boundary, which are QUOTED:**

- **Pure computation** (no external state; safe to run anywhere, including before an authorization): the field check (2), total arithmetic inside `calculateOrderTotal`, and the modifier-completeness maths (9).
- 🔴 **Cannot be moved out of the lock**: phases **13, 14, 15, 16**. The file states the reason at **736**: *"GUARANTEE: NO order is ever inserted without holding the lock AND passing the stock check, so total sold can never exceed stock."* **The checks are binding only because the insert follows them inside the same lock.**
- **Can be moved after** anything: 18–22 — all post-save and explicitly best-effort.

---

## 2. The order insert

**Source: QUOTED.** It is an **RPC**, and the call site is [`app/api/orders/submit/route.ts:922`](../app/api/orders/submit/route.ts#L922):

```ts
const { data: rpcData, error: rpcErr } = await supabase.rpc('place_order_atomic', {
  p_order,
  p_final_slot: finalSlot,
  p_status:     status,
  p_event_id:   eventRow?.id ?? null,
  p_truck_id:   resolvedTruckId,
  p_event_date: orderEventDate,
  p_unit_rows:  unitRows,
})
```

**`p_order` (lines 907–922):**

```ts
const p_order = {
  customer_name:  customerName,
  customer_email: customerEmail,
  customer_phone: customerPhone,
  order_type:     'collection',
  items,
  deals:          deals ?? null,
  discount_code:  discountCode ?? null,
  subtotal:       subtotal ?? total,
  discount_amt:   discountAmt ?? 0,
  total,
  notes:          notes ?? null,
  van_id:         eventRow?.van_id ?? null,
  payment_status: 'unpaid',
}
```

**RPC name:** `place_order_atomic` · **7 arguments** as above.

### What happens inside that same call

**Source: QUOTED from `supabase/migrations/20260804_place_order_atomic_placed_at.sql`:**

| Step | Inside the RPC? |
|---|---|
| **Counter increment** | ✅ **YES** — `increment_event_order_counter(p_event_id)`, falling back to `increment_order_counter(p_truck_id)` (lines 63–71) |
| **Order INSERT** | ✅ **YES** (74–103), `returning order_key into v_order_key` |
| **Production-slot write** | ✅ **YES** (106–112) — `delete from production_slot_usage where truck_id … and event_id …` then a loop of inserts from `p_unit_rows` |
| 🔴 **Stock decrement** | 🔴 **NEITHER — IT DOES NOT EXIST.** There is no stock decrement anywhere. Stock is a **live count over `orders`**: `getLiveItemCounts` selects `orders … .neq('status','cancelled').neq('status','rejected')` (`lib/stock-availability.ts:35-42`). **The order row's existence IS the decrement.** |

⚠️ **The production-slot write is a full DELETE-then-INSERT of that event's rows**, from rows the TS caller computed — **not an increment**.

---

## 3. The booking lock

**Source: QUOTED**

- **Acquired:** `submit/route.ts:742` — `const lock = await acquireEventLock(resolvedTruckId, orderEventDate)`
- **Released:** `submit/route.ts:938-940` — `} finally { if (haveLock) await releaseEventLock(resolvedTruckId, orderEventDate) }`

**Implementation — `lib/stock-guard.ts`:**

```ts
const LOCK_TTL_MS = 10_000      // a leaked lock self-heals after this
const LOCK_MAX_WAIT_MS = 3_000
const LOCK_RETRY_MS = 150
```

| | |
|---|---|
| **TTL** | **10 seconds** — stale rows are swept before each acquire attempt, and *"the sweep only deletes rows OLDER than the TTL so a fresh lock is never stolen"* |
| **Mechanism** | Acquire = `INSERT` into `booking_locks`; **PK conflict (23505) = held** |
| **On contention** | Retry every **150 ms** up to a **3,000 ms** budget; then `{ ok: false, reason: 'contention' }` → the route returns **409 `{ retry: true }`** and *"We must NOT place without the lock — overselling would be possible"* |

### 🔴 Is there a network call to an external service between acquire and release?

**NO. Source: QUOTED** — every call between 742 and 940 is a Supabase query or the RPC. **The three external calls (Brevo ×2, APNs) are all at 1013, 1067 and 1109 — after the `finally` block at 938.**

⚠️ **INFERRED consequence, flagged as such:** the current critical section is bounded by database latency only. **Placing a Stripe authorization inside it would be the first external network call under the lock**, against a **3 s acquire budget** and a **10 s TTL** — so an authorization slower than 10 s would let the lock self-heal while still held logically. **Not established** what Stripe's p99 is here.

---

## 4. The Stripe Checkout path that exists

**Source: QUOTED**

**Route file:** `app/api/stripe/checkout/route.ts`

**Session creation, exactly as sent:**

```ts
const session = await stripe.checkout.sessions.create(
  {
    mode: 'payment',
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'gbp',
        unit_amount: amountMinor,
        product_data: { name: `${truck.name} — order #${order.id}` },
      },
    }],
    payment_intent_data: {
      metadata: { order_key: order.order_key, truck_id: truck.id, source: 'hatchgrab_online_order' },
    },
    metadata: { order_key: order.order_key, truck_id: truck.id },
    success_url: `${base}/order/${order.order_key}/manage?paid=1`,
    cancel_url: `${base}/order/${order.order_key}/manage`,
  },
  { stripeAccount: operator.stripe_account_id },
)
```

⚠️ **No `capture_method`** is sent, so it defaults to automatic. **No `application_fee_amount`.** **No `expires_at`** — so Stripe's 24-hour default applies.

### Where the PaymentIntent id is stored

🔴 **It is NOT stored at Checkout time.** The route returns only `{ url: session.url }`. **The id first reaches our database when the webhook writes the ledger row**, as `order_payments.external_ref` and inside `order_payments.idempotency_key`:

```ts
externalRef: args.paymentIntentId,
idempotencyKey: onlinePaymentIdempotencyKey(args.paymentIntentId),   // `stripe_pi:${paymentIntentId}`
```
*(`lib/payments/online.ts`)*

### The webhook's correlation code

**QUOTED from `app/api/webhooks/stripe/route.ts:343-370`:**

```ts
const orderKey = typeof metadata.order_key === 'string' ? metadata.order_key : null
…
if (!orderKey) {
  console.log(`[webhook/stripe] payment_intent.succeeded id=${eventId} pi=${piId} — no order_key metadata, not ours`)
  …
}
…
const { data: order } = await supabase
  .from('orders')
  .select('order_key, truck_id')
  .eq('order_key', orderKey)
  .maybeSingle()
```

**Correlation is `PaymentIntent.metadata.order_key → orders.order_key`.** There is no reverse index — nothing on `orders` records the PaymentIntent.

---

## 5. The customer page's submit payload

**Source: QUOTED** from `app/trucks/[slug]/order/page.tsx:1130-1148`. **Complete, not summarised.**

```ts
fetch('/api/orders/submit', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    truckId: slug, customerName: name, customerEmail: email, customerPhone: phone,
    slot: asapChosen ? null : (selectedSlot || null), eventDate: eventDateIso, eventId: event?.id ?? null,
    items: basket.map(b => ({
      name: b.menuItem.name,
      quantity: b.quantity,
      unit_price: b.menuItem.price + b.modifiers.reduce((s, m) => s + m.price, 0),
      modifiers: b.modifiers.length > 0 ? b.modifiers : undefined,
      specialInstructions: b.specialInstructions || undefined,
      source: (b as any).source || 'direct',
    })),
    deals: appliedDeals.map(d => ({ name: d.bundle.name, slots: d.slots, slotModifiers: d.slotModifiers, slotNotes: d.slotNotes, price: d.bundle.bundle_price })),
    discountCode: appliedCode?.code || null,
    subtotal: subtotal, discountAmt: discountAmt, total, notes: notes || null,
    upsellEvents: extra.upsellEvents || [],
  }),
})
```

**Field by field — the shape a draft record must preserve:**

| Field | Type | Note |
|---|---|---|
| `truckId` | `string` | the **slug**, not the id |
| `customerName` | `string` | |
| `customerEmail` | `string` | required by the route |
| `customerPhone` | `string` | |
| `slot` | `string \| null` | **null = ASAP**, a meaningful value |
| `eventDate` | `string` (ISO date) | |
| `eventId` | `string \| null` | |
| `items[]` | array | see below |
| `items[].name` | `string` | |
| `items[].quantity` | `number` | |
| 🔴 `items[].unit_price` | `number` | **item price + all modifier prices, pre-summed** |
| `items[].modifiers?` | `{ name: string; price: number }[] \| undefined` | omitted when empty |
| `items[].specialInstructions?` | `string \| undefined` | |
| `items[].source` | `string` | `'direct'` or an upsell source |
| `deals[]` | array | |
| `deals[].name` | `string` | |
| `deals[].slots` | `Record<string, string>` | |
| `deals[].slotModifiers` | `Record<string, {name,price}[]>` | |
| `deals[].slotNotes` | `Record<string, string>` | |
| `deals[].price` | `number` | the bundle price |
| `discountCode` | `string \| null` | |
| `subtotal` | `number` | |
| `discountAmt` | `number` | |
| `total` | `number` | |
| `notes` | `string \| null` | |
| `upsellEvents` | `array` | analytics only |

⚠️ **Nothing in this payload identifies the payment method.** `payByCard` is client state and is **never sent** — the card path is chosen *after* the response returns.

---

## 6. 🔴 PRICE VALIDATION — QUOTED, AND IT IS INERT

**Call site — `submit/route.ts:517-537`, QUOTED:**

```ts
const serverCalculation = calculateOrderTotal(
  items,
  dealsForCalc,
  menuItems || [],
  discountCodeData
)

const validation = validateOrderTotals(
  { subtotal, discountAmt: discountAmt ?? 0, total },
  serverCalculation,
  0.01
)

if (!validation.valid) {
  console.error('[ORDER VALIDATION]', validation.error)
  return NextResponse.json({ 
    error: 'Order total validation failed. Please refresh and try again.' 
  }, { status: 400 })
}
```

**`calculateOrderTotal` — `lib/order-calculations.ts:83-85`, QUOTED:**

```ts
const itemsTotal = items.reduce((sum, item) => {
  return sum + (item.price * item.quantity)
}, 0)
```

### 🔴 Which field each side reads

| Side | Field | Quote |
|---|---|---|
| **Client sends** | **`unit_price`** | `unit_price: b.menuItem.price + b.modifiers.reduce(...)` |
| **Submit route's own interface** | **`unit_price`** | `interface OrderItem { name; quantity; unit_price; … }` (route lines 33–39) — **no `price` field** |
| 🔴 **`calculateOrderTotal` reads** | **`price`** | `item.price * item.quantity`, and `lib/order-calculations.ts:12-16` declares `OrderItem { name; price; quantity }` |

🔴 **The two disagree. `item.price` is `undefined` on every item the customer path sends.**

### Does it currently reject anything? **No. Proven by execution:**

```
itemsTotal          = NaN
subtotal            = NaN
total               = NaN
Math.abs(9.5 - NaN) = NaN
NaN > 0.01          = false  ← false means the check PASSES

A deliberately WRONG client total also passes:
  Math.abs(0.01 - NaN) > 0.01 = false
```

**`validateOrderTotals` compares with `Math.abs(a - b) > tolerance` (lines 149, 158, 167). Every comparison against `NaN` is `false`, so no branch returns `{ valid: false }` and it falls through to `return { valid: true }`.**

**The log line that would fire if it did reject — QUOTED, route line 534:**

```ts
console.error('[ORDER VALIDATION]', validation.error)
```

⚠️ **It has never fired for a customer order**, and `tsc` cannot see this: `body` comes from `await req.json()` and is `any`, so `items` is `any` at the call site and the field mismatch is invisible to the type checker.

⚠️ **Deals are unaffected** — `dealsForCalc` is reshaped into the `{ bundle, slots }` form the function expects (route 497–500), so the deals arm reads real numbers. 🔴 **But `subtotal = itemsTotal + dealsTotal`, and `NaN + n` is `NaN`**, so a deals-only order is the only case that could compute a real number — **not established** whether an items-free order exists in practice.

🔴 **Consequence for your design: an authorize-then-capture flow that authorizes the CLIENT-SUPPLIED total would authorize whatever the client says.** The server currently has no working opinion on the amount.

---

## 7. Every path that sets `rejected` or `cancelled` after an order exists

**Source: QUOTED**

| # | Path | Trigger | What it does about payment |
|---|---|---|---|
| 1 | `app/api/dashboard/action/route.ts:269` — **reject** | **Operator** | 🔴 **Nothing.** Unbooks the slot; the comment says *"NO option-stock reversal needed"*. **Reads no payment field.** Emails the customer: *"Please order at the truck on arrival."* |
| 2 | `app/api/dashboard/action/route.ts:302` — **cancel** | **Operator** | Reads **`order.paid_at`**, line 315: `const refundLine = order.paid_at ? '<p>Your refund will be processed automatically within 3–5 working days.</p>' : ''` |
| 3 | `app/api/orders/cancel/route.ts:82` — **customer cancel** | **Customer** | Reads **`order.payment_status`**, line 117: `paymentStatus: order.payment_status ?? null` — passed to the cancellation email only |
| 4 | `app/api/events/action/route.ts:220` — **event cancelled** | **Operator** | Reads **`order.paid_at`**, line 238: `paymentStatus: order.paid_at ? 'paid' : null` |

🔴 **No path reads the ledger.** None calls `getOrderBalance` or queries `order_payments`. **Two read `paid_at`, one reads `payment_status`, one reads neither** — and `paid_at` is described at `action/route.ts:532` as *"payment_status is now canonical; paid_at remains only as a…"* (comment truncated in the file at that point).

🔴 **No path issues a refund, cancels a PaymentIntent, or touches Stripe at all.**

⚠️ **Relevant to your design:** paths **1 and 2** are the operator rejecting or cancelling an order that, under authorize-then-capture, might hold an **uncaptured authorization**. **Nothing there would cancel it.**

---

## 8. Emails on the submit path

**Source: QUOTED**

| Order | Line | Email | Relative to the insert |
|---|---|---|---|
| 1 | **1013** | **Truck's new-order email** — `formatNewOrderEmail` → `sendConfirmationEmail({ to: truckEmail, …, senderName: 'HatchGrab' })` | **AFTER** the RPC (922) |
| 2 | 🔴 **1067** | **Customer confirmation** — `formatConfirmationEmail` → `sendConfirmationEmail({ to: customerEmail, …, truckName: truck.name })` | **AFTER** the RPC, **BEFORE** the response (1122) |

🔴 **The customer confirmation is sent inside the same request, ~145 lines after the order row is created and ~55 lines before the response is returned.**

⚠️ **Both are wrapped and best-effort** — route 1022: *"Confirmation-email FORMATTING … and SENDING must never 500 a saved order."*

⚠️ **Both are suppressed for demo trucks** — `if (!isDemoTruck) try {` (1034).

**A third, non-email notification: APNs push at 1109** (`sendOrderPendingPush`).

🔴 **For your design:** the customer confirmation fires **before any card form could have been shown**, so under order-first it always describes an unpaid order. **Under authorize-then-capture the order would not exist until after authorization, so this email would naturally fall after the money is held** — a consequence worth noting, not a change to make here.

---

## Summary of what is QUOTED vs INFERRED

| § | Status |
|---|---|
| 1 | **QUOTED** (line ranges, phase markers, side effects). The pure/unmoveable classification is **INFERRED** from the quoted lock boundary and the quoted guarantee comment. |
| 2 | **QUOTED** — call site, RPC name, all 7 arguments, `p_order`, and the RPC body from the migration |
| 3 | **QUOTED** — acquire/release sites, TTL, budget, retry, contention behaviour. The p99 remark is explicitly **not established**. |
| 4 | **QUOTED** — route file, session parameters, webhook correlation, where the PI id lands |
| 5 | **QUOTED** — the complete payload; types read from the literal and the route's interface |
| 6 | 🔴 **QUOTED and PROVEN BY EXECUTION** |
| 7 | **QUOTED** — four paths, each with the payment field it reads |
| 8 | **QUOTED** — both call sites with line numbers |

## Not established

- Stripe's latency distribution for an authorization, relative to the 3 s acquire budget and 10 s lock TTL (§3).
- Whether any real customer order is deals-only, which is the one case where `calculateOrderTotal` could return a real number (§6).
- What `paid_at`'s remaining role is — the explanatory comment at `action/route.ts:532` is cut off mid-sentence in the file.
