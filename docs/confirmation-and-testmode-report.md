# The confirmation route, and why a test payment cannot be seen

**Date:** 11 August 2026
**READ-ONLY. No file changed, no file created except this report. No `next dev`, no `next build`. No commit, no deploy. No fix proposed or applied.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 THE TWO ANSWERS, UP FRONT

**PART A —** The submitted state displays **fourteen** distinct things. **Eleven could be rebuilt from `order_key` alone.** 🔴 **Three cannot, because the columns do not exist**: the *requested* slot, whether the slot moved, and the ASAP estimate. A repo-wide grep for `requested_slot` and `slot_changed` returns **zero hits** in `app/`, `lib/` and `supabase/`. **That is the genuine obstacle, and it is a schema gap, not a wiring problem.**

**PART B —** 🔴 **Nothing in the codebase distinguishes a test truck from a real one except the `demo-` token prefix**, and that is deliberate — `trucks.is_test` is explicitly forbidden. ✅ **But the paid state can ALREADY be exercised end to end without touching a single filter**, because `recordCollectionPayment` hardcodes `livemode: true` — there is no test mode for cash. **What cannot be exercised is the CARD path specifically.**

⚠️ **And the blast radius of relaxing a filter is smaller than it looks:** the **Reports tab does not read `order_payments` at all.** It reads `orders.total`. Verified by quoting the query.

---

# PART A — THE CONFIRMATION ROUTE

## 1. The `submitted` state, in full

**Source: QUOTED.** `app/trucks/[slug]/order/page.tsx` — **lines 1283-1417**, guarded by `if (submitted) return (`.

```tsx
  if (submitted) return (
    <Shell><Hdr slug={slug} truck={truck} scrolled={false} showBack={false} />
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">✓</div>
          <h2 className="text-2xl font-black text-slate-900 mb-1">{submittedAutoAccepted ? 'Order confirmed!' : 'Order received!'}</h2>
          <p className="text-slate-500 mb-3 text-sm">
            {submittedAutoAccepted
              ? <>Thanks! We've received your order and it'll be ready soon.</>
              : <><span className="font-semibold text-slate-700">{truckName}</span> will confirm your order shortly.</>
            }
          </p>

          {submittedOrderId && <p className="text-slate-400 text-sm mb-3">Order #{submittedOrderId}</p>}

          {/* Collection time — promoted above the receipt */}
          {(submittedConfirmedSlot || selectedSlot) && (
            submittedAutoAccepted && submittedConfirmedSlot ? (
              <div className={`rounded-xl p-3 mb-4 text-sm text-center border ${(submittedSlotChanged || asapMoved) ? 'bg-amber-50 border-amber-100' : 'bg-green-50 border-green-100'}`}>
                {submittedSlotChanged && submittedRequestedSlot ? (
                  <>
                    <p className="font-black text-amber-900 text-base">Ready at {submittedConfirmedSlot}</p>
                    <p className="text-amber-700 text-xs mt-0.5">Your {submittedRequestedSlot} slot was just taken — this is the next available time.</p>
                  </>
                ) : asapMoved ? (
                  <>
                    <p className="font-black text-amber-900 text-base">Ready at {submittedConfirmedSlot}</p>
                    <p className="text-amber-700 text-xs mt-0.5">Slightly later than the {formatTime(submittedAsapEstimate!)} we estimated.</p>
                  </>
                ) : (
                  <>
                    <p className="font-bold text-green-800 mb-0.5">Collection time: {submittedConfirmedSlot}</p>
                    <p className="text-green-700 text-xs">See you at the hatch!</p>
                  </>
                )}
              </div>
            ) : (selectedSlot || submittedConfirmedSlot) ? (
              <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 mb-4 text-sm text-left">
                <p className="font-black text-orange-800 text-base">Preferred collection: {asapMoved ? submittedConfirmedSlot : (selectedSlot || submittedConfirmedSlot)}</p>
                {asapMoved && (
                  <p className="text-orange-600 text-xs mt-0.5">Slightly later than the {formatTime(submittedAsapEstimate!)} we estimated.</p>
                )}
                <p className="text-orange-600 text-xs mt-0.5">{truckName} will confirm your collection time when they accept your order.</p>
              </div>
            ) : null
          )}

          <div className="bg-slate-50 rounded-xl p-4 text-left space-y-2 mb-4 border border-slate-100">
            {basket.map(b => (
              <OrderLineItem
                key={b.cartKey}
                name={b.menuItem.name}
                quantity={b.quantity}
                unitPrice={b.menuItem.price + b.modifiers.reduce((s, m) => s + m.price, 0)}
                basePrice={b.menuItem.price}
                modifiers={b.modifiers}
                specialInstructions={b.specialInstructions}
                variant="customer"
              />
            ))}
            {appliedDeals.map((deal, i) => {
              const origPrice = calcDealOriginalPrice(deal, menu?.items || [])
              const saving = origPrice > deal.bundle.bundle_price ? origPrice - deal.bundle.bundle_price : 0
              return (
                <div key={i}>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">
                      🎁 {deal.bundle.name}
                      {saving > 0 && <span className="ml-1.5 text-green-600 font-medium">save £{saving.toFixed(2)}</span>}
                    </span>
                    <span className="font-medium text-slate-700">£{deal.bundle.bundle_price.toFixed(2)}</span>
                  </div>
                  {Object.keys(deal.slots).sort().map(slotKey => {
                    const itemName = deal.slots[slotKey]
                    if (!itemName) return null
                    const mods = deal.slotModifiers?.[slotKey] || []
                    const note = deal.slotNotes?.[slotKey]
                    return (
                      <div key={slotKey}>
                        <div className="pl-3 text-xs text-slate-400">{itemName}</div>
                        {mods.map(m => (
                          <div key={m.name} className="flex justify-between pl-6 text-xs text-slate-400">
                            <span>{m.name}</span>
                            {m.price > 0 && <span>+£{m.price.toFixed(2)}</span>}
                          </div>
                        ))}
                        {note && <div className="pl-6 text-xs text-slate-400 italic">📝 {note}</div>}
                      </div>
                    )
                  })}
                </div>
              )
            })}
            <div className="flex justify-between text-sm border-t border-slate-200 pt-2">
              <span className="font-black text-slate-900">Total</span>
              <span className="font-black text-slate-900">£{total.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex justify-between text-sm mb-4">
            <span className="text-slate-500">Payment</span>
            <span className="font-bold text-slate-700">Pay at the truck</span>
          </div>

          {cardFallbackNotice && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 mb-4 text-left">
              <p className="text-xs text-amber-700">
                We couldn’t start the card payment, so your order is set to pay at the truck instead.
                Your order is placed — nothing has been charged.
              </p>
            </div>
          )}

          <p className="text-slate-400 text-xs mb-6">Confirmation sent to {email}</p>
          <a href={`/trucks/${slug}/order`} className="block w-full bg-slate-900 text-white font-bold py-3 px-6 rounded-xl hover:bg-slate-800 transition-colors">
            Back to {truckName}
          </a>
```

### Every piece of data it displays — fourteen

| # | Piece | Where on the card |
|---|---|---|
| 1 | **Truck header + logo** | `<Hdr truck={truck}>` |
| 2 | **"Order confirmed!" / "Order received!"** | headline, branches on auto-accept |
| 3 | **The truck's display name** | subheading and the back button |
| 4 | **Display order number** | *"Order #7"* |
| 5 | **Confirmed collection slot** | *"Ready at 12:30"* / *"Collection time: 12:30"* |
| 6 | 🔴 **The REQUESTED slot** | *"Your 12:00 slot was just taken"* |
| 7 | 🔴 **Whether the slot moved** | picks amber vs green, and which sentence |
| 8 | 🔴 **The ASAP estimate** | *"Slightly later than the 12:15 we estimated"* |
| 9 | **Every basket line** — name, qty, unit price, base price, **modifiers with prices**, special instructions | `<OrderLineItem variant="customer">` |
| 10 | **Every deal** — bundle name, bundle price, **savings**, slot items, slot modifiers with prices, slot notes | the `appliedDeals` map |
| 11 | **Order total** | *"Total £18.50"* |
| 12 | **Payment line** | hardcoded *"Pay at the truck"* |
| 13 | **Card-fallback notice** | conditional on `cardFallbackNotice` |
| 14 | **Customer email** | *"Confirmation sent to …"* |

---

## 2. Where each value comes from

**Source: QUOTED.** The submit response is `app/api/orders/submit/route.ts:1122-1136`:

```ts
    return NextResponse.json({
      success:       true,
      orderId,
      orderKey:      order.order_key,
      truckName:     truck.name,
      slot:          confirmedSlot,
      requestedSlot,
      autoAccepted,
      slotChanged,
      total,
    })
```

**And the assignment block, `page.tsx:1231-1238`:**

```tsx
      setSubmittedOrderId(data.orderId)
      setSubmittedAutoAccepted(!!data.autoAccepted)
      setSubmittedConfirmedSlot(data.slot ?? null)
      setSubmittedRequestedSlot(data.requestedSlot ?? (selectedSlot || null))
      setSubmittedSlotChanged(!!data.slotChanged)
      setSubmittedAsapEstimate(asapChosen ? (backwardAsap || asapSlot || customerAsapTime || null) : null)
```

| # | Piece | Source | 🔴 Survives navigation? |
|---|---|---|---|
| 1 | Truck header | **fetch** — `/api/menu` → `truck` | ✅ re-fetchable |
| 2 | Headline | **submit response** — `data.autoAccepted` | ✅ derivable from `orders.status` |
| 3 | Truck name | **submit response** `truckName` / fetched `truck` | ✅ |
| 4 | Order number | **submit response** — `data.orderId` | ✅ `orders.id` |
| 5 | Confirmed slot | **submit response** — `data.slot` | ✅ `orders.slot` |
| 6 | 🔴 **Requested slot** | **submit response** `requestedSlot`, **falling back to component state** `selectedSlot` | 🔴 **NO — never persisted** |
| 7 | 🔴 **Slot changed** | **submit response** — `data.slotChanged` | 🔴 **NO — never persisted** |
| 8 | 🔴 **ASAP estimate** | 🔴 **PURE COMPONENT STATE** — `backwardAsap \|\| asapSlot \|\| customerAsapTime`, all computed in the browser from the slots fetch | 🔴 **NO — never sent, never stored** |
| 9 | **Basket lines** | 🔴 **COMPONENT STATE** — `basket`, built as the customer taps | ⚠️ **the DATA survives in `orders.items`; this variable does not** |
| 10 | **Deals** | 🔴 **COMPONENT STATE** — `appliedDeals` … **plus `menu?.items`** for `calcDealOriginalPrice` | ⚠️ same — plus a **live menu read** for the savings figure |
| 11 | Total | 🔴 **COMPONENT STATE** — `total`, the client's own arithmetic | ✅ `orders.total` |
| 12 | Payment line | **hardcoded string** | ✅ trivially |
| 13 | Card-fallback notice | **component state** — set only when Stripe could not start | 🔴 **NO — but it is unreachable after a successful redirect anyway** |
| 14 | Email | 🔴 **COMPONENT STATE** — the `email` form field | ✅ `orders.customer_email` |

🔴 **THE DIFFICULTY IN ONE SENTENCE: items 6, 7 and 8 exist ONLY as component state or as a one-shot response field, and none of the three is written to any table.**

⚠️ **Items 9, 10, 11 and 14 read from component state today but the same information is in `orders`** — they are a wiring problem, not an obstacle.

---

## 3. What `app/order/[id]/manage` renders

**Source: QUOTED.** 220 lines. What it displays:

| Element | Condition |
|---|---|
| `{order.truck_name}` + `Order #{order.id}` on a dark bar | always |
| `Pickup  {slot} · {venue_name}` | `order.slot` truthy |
| **`Payment` — `Paid by card` / `Pay at the truck`** | always; branches on `order.payment_status === 'paid'` |
| **`Status` — the raw `order.status`, capitalised** | always |
| Item rows — `{quantity}× {name}` and a line price | `(order.items \|\| []).map` |
| `Total` | always |
| 🔴 **A red "Cancel order" button** | `canCancel` |
| *"Cancellations accepted up to N minutes before pickup"* | `canCancel && cancellation_cutoff_mins > 0` |
| `statusLabel()` — why cancelling is unavailable | `!canCancel` |
| ✓ *"Order cancelled"* + refund copy | after a successful cancel |

### 🔴 What `/order/[id]/manage` shows that the submitted state does NOT

| Only on the manage page | Why it matters |
|---|---|
| 🔴 **A real `Payment` line driven by `payment_status`** | the submitted state hardcodes *"Pay at the truck"* |
| **The order's `status`** (`pending` / `confirmed` / `ready` / `cancelled`) | the submitted state only knows the status at the instant of placing |
| **The venue name** | |
| 🔴 **A CANCEL CONTROL** | the submitted state has none |
| 🔴 **It survives a reload, a bookmark and an email link** | it is a real route |

### 🔴 What the submitted state shows that the manage page does NOT

| Only on the submitted state | |
|---|---|
| 🔴 **Modifiers and their prices** | the manage page prints `{qty}× {name}` and nothing else |
| 🔴 **Deals — bundle name, savings, slot items, slot modifiers, slot notes** | 🔴 **the manage page fetches `deals` and NEVER RENDERS IT** |
| 🔴 **Special instructions per line** | |
| **Slot-moved and ASAP-moved explanations** | |
| **The reassuring frame** — green ✓, "Order confirmed!", "Confirmation sent to …" | |
| **Site chrome** — `<Shell>` and the truck header | the manage page is a bare card on a grey field |
| **A way back to the truck** | |

---

## 4. Could the submitted state be rebuilt from `order_key` alone?

**Source: QUOTED** for every column claim.

| # | Piece | Rebuildable? | Column / table |
|---|---|---|---|
| 1 | Truck header + logo | ✅ **YES** | `orders.truck_id` → `trucks.name`, `trucks.logo_storage_path` (via `resolveTruckLogo`) |
| 2 | Confirmed vs received headline | ✅ **YES** | `orders.status` — `confirmed` ⇒ auto-accepted |
| 3 | Truck name | ✅ **YES** | `trucks.name` |
| 4 | Order number | ✅ **YES** | `orders.id` |
| 5 | Confirmed slot | ✅ **YES** | `orders.slot` |
| 6 | 🔴 **Requested slot** | 🔴 **NO** | **No column exists.** A grep for `requested_slot` across `app/`, `lib/` and `supabase/` returns **zero hits** |
| 7 | 🔴 **Slot changed** | 🔴 **NO** | **No column exists.** `slot_changed` — **zero hits** |
| 8 | 🔴 **ASAP estimate** | 🔴 **NO** | **Never left the browser.** Not in the submit request body, not in any column |
| 9 | Basket lines with modifiers + instructions | ✅ **YES** | `orders.items` JSONB — carries `name`, `quantity`, `unit_price`, `modifiers[{name, price}]`, `specialInstructions` (quoted from `page.tsx:1135-1142`) |
| 10 | Deals with slots, modifiers, notes | ✅ **YES** | `orders.deals` JSONB — `{name, slots, slotModifiers, slotNotes, price}` |
| 10a | ⚠️ **Deal SAVINGS** | ⚠️ **YES, but two ways and they differ** | `orders.deal_savings` (`20260728_orders_total_minor_deal_savings.sql:41`) is written on the **walk-up** path only; the customer path computes it live from `menu?.items`. **A rebuild would need `menu_items_db`, i.e. a second read against a menu that may have changed** |
| 11 | Total | ✅ **YES** | `orders.total` |
| 12 | Payment line | ✅ **YES — and better than today** | `orders.payment_status` |
| 13 | Card-fallback notice | 🔴 **NO** | Client-only. ⚠️ **Moot: unreachable after a successful redirect** |
| 14 | Email | ✅ **YES** | `orders.customer_email` |

### 🔴 THE OBSTACLES, NAMED

**Three, and they are the same obstacle three times: the customer path records the OUTCOME and discards the REQUEST.**

1. 🔴 **`requested_slot` does not exist.** The submit route computes `requestedSlot`, returns it in the response, and never writes it.
2. 🔴 **`slot_changed` does not exist.** Derivable from #1 if #1 were stored; not otherwise.
3. 🔴 **The ASAP estimate never leaves the browser.** It is not even in the request body — the client computes it from the slots fetch and shows it.

⚠️ **A fourth, softer one: deal savings.** Reproducible only by re-reading the live menu, and the third-pass pricing audit established the menu changes under orders (three Gusto dishes renamed or deleted). **A rebuilt savings figure could differ from the one the customer saw.**

---

## 5. Does any existing route render a full order from an `order_key`?

**Source: QUOTED.** Every `page.tsx` outside `app/api` was enumerated. **Four surfaces render a single order; only one is customer-facing.**

| Route | Audience | Keys on | What it shows |
|---|---|---|---|
| **`app/order/[id]/manage`** | 🔴 **CUSTOMER** | **`order_key`** (`.eq('order_key', id)`) | The list in §3 — no deals, no modifiers, no savings, one Cancel button |
| **`app/dashboard/[token]` → `OrderCard`** | operator | `order.order_key` | 🔴 **The richest single-order view in the product** — items with modifiers, deals with slot modifiers and notes, notes, buzzer, PAID chip, balance, and every action (`confirm`, `collected`, `mark_paid`, `undo_*`, `adjust_slot`) |
| **`app/dashboard/[token]/kds`** | operator | `o.order_key` | Kitchen card: lines and modifiers for cooking, `getOrderBalance` for paid state, no money controls |
| **`app/dev/ticket-preview`** | 🔴 **developer only** | none — hand-built fixtures | Renders `mapOrderToTicket` output against constructed `LedgerRow`s |

🔴 **THERE IS EXACTLY ONE CUSTOMER-FACING ROUTE THAT RENDERS AN ORDER, AND IT IS THE CANCELLATION PAGE.**

⚠️ **`OrderCard` already renders everything the submitted state renders and more** — but it is operator-only, lives inside the dashboard's token-authenticated shell, and takes its data from `/api/dashboard`, which is keyed on `dashboard_token`, not `order_key`.

---

## 6. `canCancel`, in full

**Source: QUOTED.** `app/order/[id]/manage/page.tsx:109-127`:

```tsx
  const isPastCutoff = (): boolean => {
    if (!order.slot || !order.event_date || !order.cancellation_cutoff_mins) return false
    const slotTime = new Date(`${order.event_date}T${order.slot}`)
    const cutoff = new Date(slotTime.getTime() - order.cancellation_cutoff_mins * 60 * 1000)
    return new Date() > cutoff
  }

  const canCancel =
    order.allow_cancellation &&
    ['pending', 'confirmed'].includes(order.status) &&
    !isPastCutoff()

  const statusLabel = () => {
    if (order.status === 'cancelled') return 'This order has already been cancelled.'
    if (order.status === 'ready' || order.status === 'collected')
      return 'This order can no longer be cancelled.'
    if (isPastCutoff()) return 'The cancellation window has passed.'
    return 'Cancellations are not accepted for this order.'
  }
```

### Every condition — three, and one helper

| # | Condition | Source |
|---|---|---|
| 1 | `order.allow_cancellation` | `trucks.allow_customer_cancellation` |
| 2 | `order.status ∈ {pending, confirmed}` | `orders.status` |
| 3 | `!isPastCutoff()` | `orders.slot`, `orders.event_date`, `trucks.cancellation_cutoff_mins` |

### 🔴 DOES `payment_status`, `paid_at`, `amount_paid` OR THE LEDGER APPEAR? — NO. NONE OF THEM.

| Term | In `canCancel`? | Anywhere in the file? |
|---|---|---|
| `payment_status` | 🔴 **NO** | ⚠️ **YES — but only to print a label** at `:162-163` |
| `paid_at` | 🔴 **NO** | 🔴 **NO** — not selected by `/api/orders/[id]`, not in `OrderState` |
| `amount_paid` | 🔴 **NO** | 🔴 **NO** |
| `order_payments` / `getOrderBalance` / any ledger term | 🔴 **NO** | 🔴 **NO** — the file imports nothing from `lib/payments` |

🔴 **A CUSTOMER WHO HAS JUST PAID BY CARD SEES A LIVE CANCEL BUTTON**, and the cancel call carries no payment awareness either — `:46-50` posts `{ order_key: id }` and nothing else.

---

## 7. The email that links to that page

**Source: QUOTED.** `lib/email.ts:188-196`:

```ts
  // Cancellation link section (omitted on the ready notification — too late to cancel a ready order)
  const cancellationSection = (params.allowCancellation && !isReady) ? `
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid #e2e8f0">
      <p style="margin:0;font-size:12px;color:#94a3b8">
        Need to cancel?
        <a href="${params.baseUrl || 'https://www.hatchgrab.com'}/order/${params.orderKey}/manage" style="color:#ea580c;margin-left:4px">Cancel your order</a>
        (up to ${params.cancellationCutoffMins ?? 30} minutes before your pickup time)
      </p>
    </div>` : ''
```

**The exact URL built:**

```
${baseUrl || 'https://www.hatchgrab.com'}/order/${orderKey}/manage
```

⚠️ **`baseUrl` is passed as `process.env.NEXT_PUBLIC_HATCHGRAB_URL`** from the confirmation-email call sites.

### 🔴 WHAT THIS DECIDES

🔴 **THE PAGE CANNOT SIMPLY BE REPURPOSED, BECAUSE EVERY CONFIRMATION EMAIL ALREADY POINTS AT IT AND CALLS IT *"Cancel your order"*.** Those emails are already in customers' inboxes. **A customer following that link expects a cancel control and must find one.**

⚠️ **The link text and the surrounding sentence are the page's contract**: *"Need to cancel? … (up to N minutes before your pickup time)"*. **Whatever the page becomes, that promise has to keep working from that URL.**

⚠️ **The section is conditional** — `params.allowCancellation && !isReady` — so a truck with cancellation off, or a ready-order email, links nowhere at all. **Those customers have no route to their order.**

---

# PART B — WHY A TEST PAYMENT CANNOT BE SEEN

## 8. Every place that filters on `livemode`

**Source: QUOTED.** An exhaustive grep across `app/`, `lib/`, `components/` and `supabase/migrations/`. **Five filters. Two deliberate non-filters. Two writers.**

### The five filters

| # | File : line | Filters to | What breaks if a test row passes |
|---|---|---|---|
| 1 | 🔴 `lib/payments/ledger.ts:286` — `readLedger` | **`.eq('livemode', true)`** | **Every balance in the product.** `paidMinor` gains money that does not exist ⇒ orders read **paid** ⇒ `recalcOrderPayment` writes `orders.payment_status = 'paid'` ⇒ **food leaves the hatch against nothing.** ⚠️ It is also `recordCollectionPayment`'s input, so a real collection would be short-circuited by a `balanceMinor <= 0` guard |
| 2 | 🔴 `lib/payments/ledger.ts:110` — `isLiveRow` | **`row.livemode === true`** | The **chokepoint**. Same as #1 for every in-memory consumer: OrderCard, KDS, the printed ticket, `confirmedPaid` |
| 3 | `lib/payments/ledger.ts:570` — `reverseCollectionPayment` | **`.eq('livemode', true)`** | 🔴 **An undo would delete the WRONG ROW** — the newest matching charge would be the test row, so the undo removes a row representing no money and **leaves the real payment standing on an order the operator now believes is unpaid** |
| 4 | 🔴 `app/api/dashboard/route.ts:267` | **`.eq('livemode', true)`** | 🔴 **The only route by which payment rows reach a browser.** Without it a test row is visible on the operator's screen, the KDS and the printed ticket |
| 5 | `app/dev/ticket-preview/page.tsx:81` — a fixture, not a filter | writes `livemode: true` | The preview renders every scenario as **unpaid** — which its own comment calls *"the exclude-by-default rule working"* |

### The two DELIBERATE non-filters — quoted, because they are the exceptions

**`app/api/admin/delete-truck/route.ts:151-155`:**

```ts
  // ⚠️ DELIBERATELY NOT FILTERED ON `livemode`, AND THIS IS THE EXCEPTION TO THE EXCLUDE-BY-DEFAULT
  // RULE — reviewed, not overlooked. …
  // Adding `.eq('livemode', true)` would let a truck holding only test rows be hard-deleted — and the
  // cascade takes the WHOLE table for that truck with it, live rows included, if the classification
  // were ever wrong by a single row.
```

**`app/api/admin/execute-account-deletion/route.ts:52-58`:**

```ts
  // ⚠️ THE PAYMENT COUNT IS DELIBERATELY NOT FILTERED ON `livemode`. This is the second documented
  // exception … `paymentsIntact` below is a REGRESSION DETECTOR for physical retention, not a
  // report of money. … a filtered count would be blind to test rows being destroyed
```

### The two writers

| File : line | Value | Note |
|---|---|---|
| 🔴 `lib/payments/ledger.ts:482` — `recordCollectionPayment` | **hardcoded `livemode: true`** | *"There is no test mode for cash."* |
| `lib/payments/online.ts:85` — `recordOnlineCardPayment` | **`livemode: args.livemode`**, from the Stripe event | The webhook passes `event.livemode` |

⚠️ **`lib/payments/ledger.ts:93` — `LEDGER_ROW_COLUMNS` — is a fifth structural defence**: `livemode` is in the shared select list so no reader can omit it and hand `isLiveRow` rows it cannot classify.

---

## 9. `isLiveRow` and `readLedger`, in full

**Source: QUOTED.** `lib/payments/ledger.ts:74-111`:

```ts
  /** ── IS THIS MONEY REAL? (20260807_order_payments_livemode.sql) ────────────────────────────────
   *  NOT NULL in the database, so a row read from Postgres ALWAYS carries a boolean. Optional here for
   *  exactly one reason: a caller may construct a LedgerRow by hand (the ticket preview does). It is
   *  NEVER optional because a SELECT might omit it — see LEDGER_ROW_COLUMNS, which exists so that
   *  cannot happen.
   *  ⚠️ ABSENT IS TREATED AS TEST, NOT AS LIVE. See isLiveRow for why that direction is the only safe
   *  one. If you are adding a reader and your rows come back without this field, the fix is to select
   *  it — not to relax the check. */
  livemode?: boolean
}

export const LEDGER_ROW_COLUMNS = 'order_key, kind, channel, amount_minor, state, external_ref, livemode'

/**
 * 🔴 THE SINGLE TEST FOR "THIS ROW IS REAL MONEY", AND THE DEFAULT IS EXCLUDE.
 *
 * `livemode === true`, not `!== false`. That strictness is the whole point, and it is chosen for its
 * FAILURE DIRECTION rather than its elegance:
 *   • A consumer that forgets to select the column sees every row as ineligible → the order reads
 *     UNPAID → the operator asks for money that was already taken. Embarrassing, visible, recoverable
 *     in one tap.
 *   • The lenient form (`!== false`) fails the other way: a forgotten column makes a TEST payment count
 *     as real → the customer is shown as PAID → food goes out the hatch against money that does not
 *     exist, and nothing anywhere reports it. Not visible, and not recoverable.
 * Between "under-report" and "over-report" on a money column there is no symmetry, so the check is not
 * symmetric either. DO NOT relax this to `!== false` to make a fixture pass; give the fixture a livemode.
 */
export function isLiveRow(row: { livemode?: boolean }): boolean {
  return row.livemode === true
}
```

**`readLedger` — `:267-287`:**

```ts
async function readLedger(supabase: SupabaseClient, orderKey: string): Promise<LedgerRow[]> {
  const { data, error } = await supabase
    .from('order_payments')
    .select(LEDGER_ROW_COLUMNS)
    // ── 🔴 TWO FILTERS. BOTH MANDATORY. NEITHER REPLACES THE OTHER. ─────────────────────────────────
    // THIS IS THE 7 AUGUST INCIDENT, WRITTEN AT THE SCENE. On 7 August commit 3a1d082 added the
    // `livemode` filter below by REPLACING the `order_key` filter above it. Every balance was then
    // computed from the ENTIRE order_payments table — every order, every truck — so `paidMinor` became
    // the whole-table sum, `balanceMinor` went negative, and recordCollectionPayment short-circuited on
    // its `balanceMinor <= 0` guard: no row written, NO ERROR RAISED, `chargedMinor: 0` returned as a
    // success. Pizzeria Gusto recorded £0 for an afternoon of real collections with nothing anywhere
    // reporting a fault. It passed `tsc` and it passed lint, because the deleted filter left `orderKey`
    // still referenced in the error string below, so the parameter was never "unused".
    //
    // They answer DIFFERENT questions and are not interchangeable:
    //   .eq('order_key', orderKey) → WHOSE money is this?   Scope. Without it the sum is everyone's.
    //   .eq('livemode', true)      → is this money REAL?    Mode.  Without it a test row counts as cash.
    // If you are adding a third, ADD it. Do not edit either of these two lines to make room.
    .eq('order_key', orderKey)
    .eq('livemode', true)
  if (error) throw new Error(`[ledger] could not read order_payments for ${orderKey}: ${error.message}`)
```

⚠️ **`getOrderBalance`'s own header, `:152-161`**, states why the exclusion lives at the chokepoint:

```ts
  // ── 🔴 THE TEST-ROW EXCLUSION LIVES HERE, AND HERE IS WHY ─────────────────────────────────────────
  // This function is the CHOKEPOINT: OrderCard, the dashboard's confirmedPaid, mapOrderToTicket (the
  // printed kitchen ticket), recalcOrderPayment (which writes orders.payment_status/amount_paid) and
  // recordCollectionPayment ALL derive paid-ness by calling it, and nothing derives paid-ness any other
  // way. Filtering at this one point means a consumer added NEXT YEAR is correct because it called the
  // resolver, not because its author remembered a rule
```

🔴 **THERE ARE TWO LAYERS AND THEY ARE NOT REDUNDANT.** The SQL filters stop a test row **travelling to a browser**; `isLiveRow` stops it **being summed**. **Relaxing one does not relax the other**, and relaxing the SQL alone would put test rows on the operator's screen while every figure still read unpaid.

---

## 10. Which surfaces would change if one truck's test payment counted

**Source: QUOTED** for the mechanism of each; **INFERRED** for the rendered result.

| Surface | File | Currently | Would show |
|---|---|---|---|
| 🔴 **The PAID chip** (OrderCard) | `OrderCard.tsx:211` — `getOrderBalance(order, ledgerRows ?? [])` | ⚠️ **Nothing.** `ledgerRows` arrives empty (filtered at `/api/dashboard:267`), so `status: 'unpaid'` | ✅ **A PAID chip** |
| 🔴 **The completion button** | `OrderCard.tsx:302-347` | *"Mark paid & collected"* / *"Mark paid"* — **it asks for money already taken** | *"Collected"* / *"Done"* — the paid stage |
| **The Cash/Card split** | `OrderCard.tsx:337-339` | offered — the order reads unpaid | not offered |
| 🔴 **The KDS card** | `kds/page.tsx:1382` — `getOrderBalance(o, payments[o.order_key] ?? [])` | unpaid | paid |
| 🔴 **`orders.payment_status` / `amount_paid`** | `recalcOrderPayment` via `getOrderBalance` | 🔴 **`unpaid`, £0.00 — written to the ROW** | `paid`, the amount |
| 🔴 **The customer manage page** | `order/[id]/manage:162-163` — reads `orders.payment_status` | *"Pay at the truck"* | ✅ ***"Paid by card"*** in green |
| 🔴 **The printed kitchen ticket** | `mapOrderToTicket.ts:69` — `getOrderBalance(order, ledgerRows ?? [])` | prints unpaid / a balance due | prints paid |
| **The dashboard's `confirmedPaid`** | `page.tsx:314` | false — affects completed-list grouping | true |
| **`hasUnrecordedPayment`** | `ledger.ts:228` | true — drives the offline payment overlay | false |
| ✅ **The Reports tab** | `get_report`, `manage/route.ts:1257` | 🔴 **UNAFFECTED — see below** | 🔴 **UNAFFECTED** |

### 🔴 THE REPORTS TAB DOES NOT READ `order_payments` AT ALL

**Source: QUOTED.** `app/api/manage/route.ts`, the `get_report` handler:

```ts
      .from('orders')
      …
      .select('order_key, id, customer_name, customer_email, status, slot, total, discount_amt, created_at, items, deals, event_date, event_id')
```

🔴 **It reads `orders` and `truck_events`. `order_payments` does not appear in the handler.** Revenue is `orders.total`.

⚠️ **THIS CUTS BOTH WAYS, AND THE SECOND HALF IS THE UNCOMFORTABLE ONE.** ✅ A relaxed `livemode` filter **cannot corrupt the reports**. 🔴 **But it also means the reports already count every order at its `orders.total` regardless of whether anyone paid** — a test order is in the revenue figure **today**, and always has been, because reports never consulted the ledger.

### Also changed — an operator-visible side effect

⚠️ **`/api/dashboard:267` is described in its own comment as *"the ONLY route by which payment rows reach a browser"*.** Relaxing it puts the raw rows — `channel: 'online'`, `external_ref: 'pi_…'` — on the operator's device, where **anything added later that reads them for a purpose other than summing would inherit a test row silently.**

---

## 11. Does anything distinguish a test truck from a real one?

**Source: QUOTED. 🔴 NOTHING ON `trucks` DOES, AND THAT IS DELIBERATE.**

| Candidate | Exists? | Verdict |
|---|---|---|
| 🔴 **`trucks.is_test`** | 🔴 **NO** | **Forbidden.** `app/dashboard/[token]/page.tsx:168`: *"A trucks.is_test-style column is forbidden (reference-manual §824)."* And `20260723_demo_sessions.sql:13`: *"It repeats the `is_test` mistake"* |
| **`trucks.plan`** | ✅ exists — `'starter' \| 'pro' \| 'max' \| 'trial' \| 'tester' \| 'demo'` | 🔴 **REJECTED IN CODE AS A DETECTOR.** `page.tsx:166-167`: *"the PLAN is a billing tier and says nothing about whether a truck is a throwaway sandbox, so it could never be the detector. The token prefix is."* |
| ✅ **The `demo-` prefix** | ✅ **YES — the only one** | `lib/demo.ts:27-29`: `isDemoIdentifier(id) => id.startsWith(DEMO_PREFIX)`. Used as `token.startsWith('demo-')` at `page.tsx:170`, *"Client-side from the route param → no fetch, no API change, correct on first paint"* |
| **`operators.stripe_charges_enabled`** | ✅ exists | ⚠️ **Readiness, not test-ness.** Its migration states *"There is no livemode column on this table, deliberately: an operator has ONE account"* |
| **`order_payments.livemode`** | ✅ exists | 🔴 **PER-ROW, NOT PER-TRUCK.** It classifies **money**, not businesses |

🔴 **SO: THE ONLY TEST/REAL DISTINCTION IN THE PRODUCT IS THE `demo-` TOKEN PREFIX, AND IT DOES NOT APPLY TO `test-kitchen`.** `test-kitchen` is an ordinary operator truck whose id is `test-truck`; nothing in the schema marks it as a sandbox. **Any per-truck relaxation would have to invent a distinction the codebase has twice refused to add.**

---

## 12. Every non-display consumer of `order_payments`

**Source: QUOTED.** Every file naming the table was enumerated.

| Consumer | File | Reads | Would a test row corrupt a figure that matters? |
|---|---|---|---|
| 🔴 **`readLedger`** → every balance | `ledger.ts:267` | filtered `true` | 🔴 **YES — the worst case.** Writes `orders.payment_status` and `amount_paid` |
| 🔴 **`reverseCollectionPayment`** | `ledger.ts:555-570` | filtered `true` | 🔴 **YES, AND DESTRUCTIVELY.** It is a `[0]` pick, not a sum, so **the chokepoint cannot save it** — the undo would delete the test row and leave the real payment standing |
| **`/api/dashboard` payments map** | `dashboard/route.ts:254-267` | filtered `true` | ⚠️ **Not a figure — a visibility boundary.** Test rows reach the browser |
| **delete-truck guard 3** | `admin/delete-truck:160-163` | 🔴 **UNFILTERED, deliberately** | ✅ **NO — and it must stay unfiltered.** A row count protecting retention; over-counting is its safe direction |
| **`paymentsIntact`** | `execute-account-deletion:59-66` | 🔴 **UNFILTERED, deliberately** | ✅ **NO — same reasoning.** A regression detector for physical retention |
| **`action_audit_log` before/after state** | `lib/audit/actionAudit.ts` | whatever it is handed | ⚠️ **Records what happened; corrupts nothing.** But it would record a test row as a deleted payment |
| **`mapOrderToTicket`** | `printing/mapOrderToTicket.ts:69` | via `getOrderBalance` | 🔴 **YES — prints "paid" on a physical ticket** |
| ✅ **Reports / `get_report`** | `manage/route.ts:1257` | 🔴 **DOES NOT READ THE TABLE** | ✅ **NO — structurally immune** |
| ✅ **Exports** | — | 🔴 **Not established that any export reads `order_payments`** — no export path naming the table was found | — |
| **`account-deletion` / the cron** | `lib/account-deletion.ts`, `cron/account-deletion-due` | counts / retention | ✅ **NO** — same class as the two guards |
| **`/api/stripe/connect`** | `stripe/connect/route.ts` | mentions the table in commentary | **Not established** that it reads rows; no filtered query found |

### 🔴 WHERE A RELAXATION MUST NOT REACH

1. 🔴 **`reverseCollectionPayment` (`ledger.ts:570`).** Its own comment says the chokepoint *"cannot save this one. It has to be right here."* **A relaxation here loses real money.**
2. 🔴 **`recalcOrderPayment` via `readLedger`.** It writes to the `orders` row, so the corruption **persists** rather than being a render artefact.
3. 🔴 **The two admin guards must stay UNFILTERED.** They are already the opposite exception; "making them consistent" would let a truck holding real takings be hard-deleted.

---

## 13. Does Stripe's test mode offer a way to exercise the paid state without changing our filters?

### About Stripe's own facilities — **NOT ESTABLISHED**

🔴 **I cannot answer this from the repository.** Nothing in the codebase describes a Stripe feature that would emit `livemode: true` from a test-mode payment, and I did not consult Stripe's documentation for this pass. **Anything I said about it would be speculation.**

**What IS established, from code, is that our own build forecloses it from both ends:**

- `lib/stripe/connect.ts:88` and `app/api/stripe/checkout/route.ts:40-47` **refuse any key not starting `sk_test_`** — *"this build may not take real payments."*
- The webhook copies `livemode` **verbatim from the event** (`route.ts:192`) and its migration forbids deriving it: *"NEVER from an env var, a key prefix, or which endpoint received the callback."*
- Both handler branches gate on `livemode !== false`, so **only sandbox events are acted on**.

🔴 **So a test-mode card payment can only ever produce `livemode: false`, and every display filter excludes it. The obstacle is ours, not Stripe's.**

### ✅ BUT THE PAID STATE IS ALREADY EXERCISABLE — QUOTED

**`lib/payments/ledger.ts:474-482`:**

```ts
    // 🔴 HARDCODED TRUE, AND CORRECTLY SO — NOT A PLACEHOLDER. This function books an IN-PERSON
    // collection: an operator standing at a hatch, having physically taken cash or run a card through
    // their own PDQ. There is no test mode for cash. No configuration, no key and no environment can
    // make this money less real, so there is nothing here to read a flag from — the truth is in what
    // the function does.
    livemode: true,
```

✅ **Tapping "Mark paid" or "Mark paid & collected" on any order writes `livemode: true` and passes every filter.** The PAID chip, the completion button, the KDS card, `orders.payment_status`, the customer manage page's *"Paid by card"* line and the printed ticket **all light up today, with no change to anything.**

🔴 **WHAT THAT DOES NOT EXERCISE — and it is exactly the part in question:**

| Exercised by the in-person path | Not exercised |
|---|---|
| ✅ every display surface in §10 | 🔴 **`channel: 'online'`** — it writes `in_person_other` |
| ✅ `getOrderBalance`, `recalcOrderPayment`, the rollup | 🔴 **the webhook → `recordOnlineCardPayment` writer** |
| ✅ the PAID chip and completion flow | 🔴 **`external_ref: 'pi_…'`, the PaymentIntent binding** |
| ✅ undo / re-collect | 🔴 **the `livemode: false` classification itself** |

⚠️ **So the honest position: the DISPLAY LAYER is fully exercisable today; the ONLINE-CARD WRITER AND ITS CLASSIFICATION are not.** Whether Stripe offers anything that changes that is **not established**.

---

## Quoted vs inferred

| § | Status |
|---|---|
| 1 | **QUOTED** — the full render, lines 1283-1417 |
| 2 | **QUOTED** — the submit response, the assignment block, and every setter's argument |
| 3 | **QUOTED** — all 220 lines read; the two difference lists are read directly off both files |
| 4 | **QUOTED** for every column; the three "NO"s are **exhaustive negative greps** |
| 5 | **QUOTED** — every `page.tsx` outside `app/api` enumerated |
| 6 | **QUOTED** — `canCancel`, `isPastCutoff`, `statusLabel`, plus negative greps for the four payment terms |
| 7 | **QUOTED** — the template and its condition |
| 8 | **QUOTED** — an exhaustive grep; five filters, two non-filters, two writers, all quoted |
| 9 | **QUOTED** — both in full with surrounding context |
| 10 | **QUOTED** for each mechanism; the rendered outcomes are **INFERRED** from the quoted code. The Reports finding is **QUOTED** |
| 11 | **QUOTED** — the forbidding comments, the plan union, `isDemoIdentifier` |
| 12 | **QUOTED** — every consumer; two entries marked **not established** |
| 13 | 🔴 **NOT ESTABLISHED** for Stripe's facilities. **QUOTED** for the in-person path and for our own sandbox refusals |

## Not established

- **Whether Stripe test mode offers any facility that would let the paid state be exercised without changing our filters.** Not answerable from the repository, and not guessed at.
- **Whether any export path reads `order_payments`** — no export naming the table was found, but I did not enumerate every export.
- **Whether `/api/stripe/connect` reads ledger rows** — it names the table in commentary; no filtered query was found.
- **Whether `orders.deal_savings` is populated on customer-path orders** — the walk-up insert writes it; the customer path's `p_order` does not name it, so it is presumably null there, but I read no rows.
- **What `/order/[id]/manage` should become.** This is a map, as asked; no design is proposed.
