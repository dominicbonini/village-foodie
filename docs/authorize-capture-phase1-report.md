# Authorize-then-capture — phase 1, the map

**Date:** 12 August 2026
**READ-ONLY. No file changed, no file created except this report. No `next dev`, no `next build`. No commit, no deploy. No fix proposed or applied.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 THE FOUR THINGS THAT DECIDE THE SHAPE OF THE BUILD

1. ✅ **The authoritative total is computed at `submit/route.ts:643`, and NOTHING between `:315` and there writes anything.** The amount to authorize is reachable with zero side effects. **§3.**
2. 🔴 **`order_key` DOES NOT EXIST BEFORE THE INSERT** — it is a `gen_random_uuid()` column default, minted by the RPC. The one correlation key the entire payment stack uses cannot be known at authorization time. **But a client-minted `order_key` precedent already exists on the walk-up path. §9.**
3. ⚠️ **Only ONE of the four in-lock phases genuinely needs the lock.** Closed-category, stock and option-ceiling are all read-only checks that would have to be re-run under the lock anyway; slot resolution + `place_order_atomic` are the pair the lock exists for. **A draft can be validated without holding it — but that validation is advisory, not binding. §2.**
4. 🔴 **THERE IS NO DRAFT STORE AND NOTHING CLOSE TO ONE.** Every candidate is either device-local or the wrong shape. **§10.**

---

## 1. The card path end to end, as it runs today

**Source: QUOTED.**

| # | Where | Line | What |
|---|---|---|---|
| 1 | `order/page.tsx` | :1245 | Client POSTs `/api/orders/submit` |
| 2 | `submit/route.ts` | :315 | `const body = await req.json()` |
| 3 | " | :341-405 | Truck resolve, deletion gate, hidden-truck gate |
| 4 | " | :430-500 | Pause guard, event-status guard |
| 5 | " | :492 | `normaliseOrderLines(items, deals)`, `buildItemCatMap`, `buildCatConfigs` |
| 6 | " | :505-527 | `menu_items_db` read, `discount_codes_db` read |
| 7 | 🔴 " | **:538-648** | **PRICING — `loadPriceBook` + `repriceOrder`, the 409 on an unpriceable line, and the authoritative totals** |
| 8 | " | :650-796 | Event resolve, pre-order open gate, required-modifier guard |
| 9 | " | :836 | `findSoldOutOption` → 409 |
| 10 | 🔴 " | **:852** | **`acquireEventLock`** |
| 11 | " | :882 / :889 / :898 | closed-category / stock / option-ceiling → 409 |
| 12 | " | :917 | `placeOrderInSlotLocked` — resolves, writes nothing |
| 13 | " | :1007 | `computeEventUnitRows` |
| 14 | 🔴 " | **:1044** | **`place_order_atomic` — THE ORDER ROW IS WRITTEN HERE** |
| 15 | " | :1062 | `releaseEventLock` (in `finally`) |
| 16 | " | :1110 | UPDATE `requested_slot` / `asap_estimate` |
| 17 | " | :1136 | `upsell_events` insert (fire-and-forget) |
| 18 | " | :1145 | `enforceStockLimits` |
| 19 | " | :1175 | **Truck "new order" email** |
| 20 | 🔴 " | **:1228** | **CUSTOMER CONFIRMATION EMAIL SENDS** |
| 21 | " | :1270 | APNs push |
| 22 | " | :1282-1295 | 200 with `orderKey` |
| 23 | 🔴 `order/page.tsx` | **:1340-1350** | **ONLY NOW is `/api/stripe/checkout` called** |
| 24 | `checkout/route.ts` | :60-64 | Reads the order row for amount/truck |
| 25 | " | :129-169 | `checkout.sessions.create` on the connected account |
| 26 | `order/page.tsx` | :1349 | `window.location.href = payData.url` |

**QUOTED — the client, `order/page.tsx:1334-1350`:**

```tsx
      // ── 🔴 THE ORDER NOW EXISTS. ONLY NOW IS A CARD OFFERED. ─────────────────────────────────────
      // Order-first is forced, not chosen: place_order_atomic books production capacity in the same
      // transaction as the order, so paying first would need slot reservation that does not exist.
      if (payByCard && truck?.card_payments_ready && data.orderKey) {
        try {
          const pay = await fetch('/api/stripe/checkout', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderKey: data.orderKey }),
          })
          const payData = await pay.json().catch(() => ({}))
          if (pay.ok && payData.url) {
            // Leaves the site for Stripe's hosted page and returns to /order/{key}/manage.
            window.location.href = payData.url as string
            return
          }
```

**QUOTED — `checkout/route.ts:2-9`, which states the coupling in its own header:**

```
// ── 🔴 ORDER FIRST. THIS ROUTE IS ONLY EVER REACHED AFTER place_order_atomic HAS COMMITTED. ─────────
// That ordering is forced, not chosen: `place_order_atomic` books production capacity in the SAME
// transaction as the order row, so paying first would need a slot-reservation system that does not
// exist, and two customers could pay for the last portion. The cost of this direction is an abandoned
// checkout leaving an unpaid order holding capacity — logged as out of scope, and visible on the
// dashboard rather than invisible in a Stripe balance.
```

🔴 **SO BY THE TIME THE CUSTOMER SEES A CARD FIELD: the row exists, the display number is consumed, `production_slot_usage` is written, stock is counted, `event_item_stock` may have been flipped sold-out, the confirmation email has SENT, and the operator has been pushed.** The abandonment cost is not one row — it is all twenty-two steps.

⚠️ **The success_url already points at the confirmation** (`checkout/route.ts:159`):

```ts
        success_url: `${base}/trucks/${truck.slug ?? truck.id}/order?confirm=${order.order_key}`,
```

That URL takes an `order_key` that must exist. **Under authorize-first it would have to take a draft identifier instead, or the confirmation would 404 on the redirect.**

---

## 2. The four binding phases, and which need the lock

**Source: QUOTED.** `submit/route.ts:842-851` states the lock's purpose:

```
    // ── Atomic stock guard + slot placement under ONE per-event lock (Stage 2, Option B) ──
    // The booking_locks mutex is HOISTED here (it used to live inside claimAvailableSlot) so the
    // stock re-check, the order INSERT, and the slot claim all run under a SINGLE lock — two
    // concurrent submits can't both read the same "N remaining" and both insert (oversell). …
    // GUARANTEE: NO order is ever inserted without holding the lock AND passing the
    // stock check, so total sold can never exceed stock.
```

**Phase (i) — closed category, `:882-888`:**
```ts
        const closed = await checkClosedCategories(resolvedTruckId, eventRow.id, orderLines, itemCatMap)
        if (closed) {
          return NextResponse.json(
            { error: `${closed[0]} is closed for this event`, categoryClosed: true, categories: closed },
            { status: 409 },
          )
        }
```

**Phase (ii) — stock, `:889-895`:**
```ts
        const shortfall = await checkStockShortfall(resolvedTruckId, eventRow.id, orderEventDate, orderLines, itemCatMap)
        if (shortfall) {
          return NextResponse.json(
            { error: 'Some items just sold out', stock: true, items: shortfall },
            { status: 409 },
          )
        }
```

**Phase (iii) — option ceiling, `:896-904`.** ⚠️ **Its own comment says "Pre-lock, like the item check", which is now inaccurate — it sits inside the `try` after `acquireEventLock`.** Quoted as found.

**Phase (iv) — slot resolution, `:907-926`:**
```ts
      // (b) RESOLVE the slot (READ-ONLY; nothing is inserted yet, so NO self-exclude — the fit sees
      //     the true current occupancy WITHOUT this order …). placeOrderInSlotLocked RESOLVES
      //     { booked, finalSlot } and files NOTHING — the atomic RPC does the single write.
```

**And `place_order_atomic`, `:1044`, whose SQL is the only write** (`20260804_place_order_atomic_placed_at.sql`):

```sql
  insert into orders ( … ) values ( … ) returning order_key into v_order_key;

  -- BOOK capacity, EVENT-SCOPED: only when there's an event AND TS-computed rows (booked).
  if p_event_id is not null and p_unit_rows is not null then
    delete from production_slot_usage where truck_id = p_truck_id and event_id = p_event_id;
    for v_row in select * from jsonb_array_elements(p_unit_rows) loop
      insert into production_slot_usage ( … );
    end loop;
  end if;
```

### 🔴 WHICH MUST STAY INSIDE THE LOCK

| Phase | Reads | Writes | Must hold the lock? |
|---|---|---|---|
| (i) closed category | `event_category_stock` | none | ❌ **No.** A GATE on a flag, not a count. Two concurrent orders cannot race a boolean |
| (ii) stock shortfall | `getLiveItemCounts` over `orders` + ceilings | none | 🔴 **YES — for its GUARANTEE, not for its correctness.** It reads live order counts. Outside the lock, two submits both read "1 left" and both proceed |
| (iii) option ceiling | `getLiveOptionCounts` over `orders` + ceilings | none | 🔴 **YES**, same reason, same shape |
| (iv) slot resolution | `production_slot_usage` + `orders` occupancy | 🔴 **none — resolve-only** | 🔴 **YES.** It computes an allocation from occupancy that the very next statement mutates |
| `place_order_atomic` | — | 🔴 **`orders` + `production_slot_usage` + the counter** | 🔴 **YES. Non-negotiable** |

### ✅ THE DIRECT ANSWER FOR A DRAFT

**Source: INFERRED, from the above.**

✅ **A draft CAN be validated without holding the lock.** All four phases are read-only; nothing between `:852` and `:1044` writes. Running (i)–(iv) pre-authorization costs a wasted read on contention and nothing else.

🔴 **BUT THE RESULT IS ADVISORY, NOT BINDING, AND THE DISTINCTION IS THE WHOLE RISK.** The lock does not make these checks *correct* — it makes them *durable through to the insert*. A draft validated at 19:02 and converted at 19:04 must have (i)–(iv) **re-run under the lock at conversion**, because between those two moments other orders will have consumed stock and capacity.

⚠️ **AND THAT RE-RUN CAN FAIL AFTER THE CUSTOMER'S CARD IS AUTHORIZED.** Today a stock 409 costs the customer a re-submit with a full basket. Under authorize-first it would arrive with money already held. **Not established: what the design wants to happen there.** It is the single hardest consequence of the inversion and it is not answered by anything in the codebase.

---

## 3. Where the authoritative total is computed, and whether it is reachable without creating an order

**Source: QUOTED.** `submit/route.ts:641-648`:

```ts
    // The authoritative figures. PENCE FIRST, then pounds derived from the pence, so `total` and
    // `total_minor` are the same number by construction …
    const pricedItems = repriced.items
    const pricedDeals = repriced.deals
    const serverTotalMinor = toMinor(repriced.calculation.total)
    const serverTotal = serverTotalMinor / 100
    const serverSubtotal = repriced.calculation.subtotal
    const serverDiscountAmt = repriced.calculation.discountAmt
```

**Line 643 is the amount that would be authorized.** `serverTotalMinor` is already in minor units — the same integer `checkout/route.ts:117` derives today via `toMinor(Number(order.total ?? 0))`.

### ✅ YES — REACHABLE WITH NO ORDER AND NO SIDE EFFECT AT ALL

**Source: QUOTED.** Everything between `:315` (`req.json()`) and `:643` is reads and refusals. The complete write inventory of that span is **empty** — a grep for `.insert(` / `.update(` / `.upsert(` / `.rpc(` in `submit/route.ts` returns its first hit at **`:1044`**, four hundred lines later:

```
852:    const lock = await acquireEventLock(…)
1044:      const { data: rpcData, error: rpcErr } = await supabase.rpc('place_order_atomic', { … })
1110:        .update(confirmationFields)
1136:      supabase.from('upsell_events').insert(eventRows)…
1272:                await supabase.from('van_devices').update({ push_token: null })…
```

⚠️ **`acquireEventLock` at `:852` DOES write** (a `booking_locks` row) — but it is the first write on the path and it is **189 lines after** the total is computed.

✅ **So the sequence [parse → truck → guards → price → total] is a pure function of the request plus the database. It could be a route of its own, or the first half of an authorize route, unchanged.**

⚠️ **One caveat, QUOTED:** the pricing block can itself refuse (`:591-612`, the unpriceable-line 409). An authorize route inherits that refusal — correctly, since there is no amount to authorize.

---

## 4. Everything with an effect outside the request

**Source: QUOTED** for each site; the must/could column is **INFERRED**.

| # | Line | Effect | Must be at order creation? |
|---|---|---|---|
| 1 | :852 | `acquireEventLock` — INSERT `booking_locks` | ⚠️ Must wrap the insert. Transient, released at `:1062` |
| 2 | 🔴 :1044a | `increment_event_order_counter` / `increment_order_counter` — **consumes a display number** | 🔴 **MUST.** Inside the RPC transaction. A draft must not take one, or numbers gap |
| 3 | 🔴 :1044b | INSERT `orders` | 🔴 **MUST — it IS order creation** |
| 4 | 🔴 :1044c | DELETE+INSERT `production_slot_usage` | 🔴 **MUST.** Same transaction, and §8's capacity board |
| 5 | :1110 | UPDATE `orders` — `requested_slot`, `asap_estimate` | ⚠️ Already non-atomic and non-fatal today. **Could move**, but has nowhere better to go |
| 6 | :1136 | INSERT `upsell_events` (fire-and-forget) | ✅ **Could happen later.** Analytics. Its own comment notes the table "is not yet provisioned in prod" |
| 7 | :1145 | `enforceStockLimits` → UPDATE/INSERT `event_item_stock.available` | ⚠️ **Must follow the insert** (it counts committed orders) but need not be synchronous |
| 8 | :1175 | **Truck "new order" email** | ✅ **Could be later** — but the operator wants it at the moment of sale |
| 9 | 🔴 :1228 | **CUSTOMER CONFIRMATION EMAIL** | 🔴 **SEE BELOW** |
| 10 | :1270 | APNs `sendOrderPendingPush` | ✅ Could be later. Already `!autoAccepted`-gated and fire-and-forget |
| 11 | :1272 | UPDATE `van_devices.push_token = null` | ✅ Cleanup of dead tokens. Incidental |

### 🔴 THE CONFIRMATION EMAIL — THE ONE YOU ASKED ABOUT

**QUOTED, `:1181-1189`:**

```
    // ── Email to customer ─────────────────────────────────────────────────────
    // BEST-EFFORT (post-save): the order is already SAVED (and booked) above, so the request MUST
    // succeed from the customer's view. Confirmation-email FORMATTING (dealsWithPrice +
    // formatConfirmationEmail) and SENDING must never 500 a saved order — a throw here would hit the
    // outer catch and tell the customer "Something went wrong" while the order sits on the dashboard
    // (duplicate-order / divergence hazard).
```

✅ **IT IS ALREADY FULLY DECOUPLED, AND THAT IS THE FINDING.** It is:

- **After** the insert and outside the lock (`:1228` vs `:1062`)
- **Wrapped in its own try/catch** and explicitly non-fatal
- **Fed entirely from in-scope values** — `orderId`, `order.order_key`, `truck.*`, `confirmedSlot`, `requestedSlot`, `slotChanged`, `pricedItems`, `pricedDeals`, `serverDiscountAmt`, `serverTotal`, `autoAccepted`, `eventRow.*`
- **Demo-suppressed** by a guard on the whole block

🔴 **EVERY ONE OF THOSE VALUES EXISTS ONLY AFTER THE RPC RETURNS.** `orderId` is the display number the counter minted; `order.order_key` is the RPC's `returning`; `confirmedSlot` / `slotChanged` come from `placeOrderInSlotLocked`; `autoAccepted` from the auto-accept rollup at `:1010-1024`.

✅ **SO IT MOVES FOR FREE.** It does not need to be in this request at all — it needs to be in whatever request creates the order. **Under authorize-first it simply follows the order into the second request, unchanged, and the abandonment problem it causes today (a confirmation for an order nobody paid for) disappears as a side effect rather than needing a fix.**

⚠️ **NOT ESTABLISHED: whether the email should fire at creation or at CAPTURE.** The stated design puts capture after confirmation, and an auto-accept failure leaves the order pending and uncaptured — so an order can exist, emailed, with an authorization never captured. Nothing in the codebase decides that.

---

## 5. What would have to be true to move order creation to a second request

**Source: INFERRED**, from the quoted body reads below.

Three conditions:

1. 🔴 **Everything the second request needs must be in the draft**, because the browser that posted it may never come back. The full list is below.
2. 🔴 **A correlation identifier must exist BEFORE the order does.** §9 — this is the hard one.
3. ⚠️ **The four binding phases must be re-runnable at conversion time**, under the lock, against the draft's stored request. §2.

### Everything submit reads from the request body

**QUOTED — the destructure, `:317-344`:**

```ts
    const {
      truckId,
      customerName,
      customerEmail,
      customerPhone,
      slot,
      eventDate,
      eventId,
      items,
      deals,
      discountCode,
      discountAmt,
      subtotal,
      total,
      notes,
      upsellEvents,
      asapEstimate,
    } = body
```

⚠️ **A grep for `body.` in the whole route returns exactly one hit — a comment at `:61`.** So the destructure is the complete inventory; nothing reads the body by any other route.

| Field | Read at | Must the draft hold it? |
|---|---|---|
| `truckId` | :344 truck resolve | 🔴 **YES** |
| `customerName` / `customerEmail` / `customerPhone` | p_order :1029-1031, both emails | 🔴 **YES** |
| `slot` | :856 `requestedSlot`, :917 slot resolution, emails | 🔴 **YES** |
| `eventDate` | :583 `orderEventDate`, lock key :852, `p_event_date` | 🔴 **YES** |
| `eventId` | :443 pause guard, :605 event resolve | 🔴 **YES** |
| `items` | :492 orderLines, guards, pricing, `orderHasNotes`, p_order | 🔴 **YES** |
| `deals` | same | 🔴 **YES** |
| `discountCode` | :521 code lookup, `p_order.discount_code` | 🔴 **YES** |
| `notes` | p_order, `orderHasNotes`, emails | 🔴 **YES** |
| `upsellEvents` | :1136 `upsell_events` insert | ⚠️ **Yes if kept**; analytics only |
| `asapEstimate` | :1110 confirmation UPDATE | ⚠️ **Yes if kept**; display only |
| ✅ `discountAmt` | 🔴 **NOTHING** | ✅ **NO** |
| ✅ `subtotal` | 🔴 **NOTHING** | ✅ **NO** |
| ✅ `total` | 🔴 **NOTHING** | ✅ **NO** |

🔴 **THE LAST THREE ARE PROVED DEAD, QUOTED.** A grep for those identifiers in the route returns only the destructure at `:328-330` and the dead `formatWhatsAppOrder` interface at `:73-74`. **The server-pricing change did the hardest part of this work in advance: the draft never has to carry a money field, and the amount authorized is derived, not transported.**

⚠️ **AND ONE THING NOT IN THE BODY.** `placed_at` is minted by `now()` inside the RPC (`20260804…sql`: *"SERVER-MINTED. Never read from p_order"*). Under a two-request flow, `now()` becomes the CONVERSION time, not the moment the customer committed. **Not established whether that matters** — the migration's own reasoning ("request time IS commit time") stops being true.

---

## 6. The trigger for order creation: redirect-back vs webhook

**Source: INFERRED** for the failure modes; **QUOTED** for each mechanism's current behaviour.

### Option A — redirect-back from the client

**The mechanism exists today**, `checkout/route.ts:159`:
```ts
        success_url: `${base}/trucks/${truck.slug ?? truck.id}/order?confirm=${order.order_key}`,
```

| | |
|---|---|
| ✅ **Latency** | The order appears while the customer is watching. The confirmation renders from real data |
| ✅ **Failure is visible** | If creation fails — stock gone, slot gone — the customer is on the page and can be told |
| 🔴 **Customer closes the tab after authorizing** | **NO ORDER IS EVER CREATED.** The authorization sits at Stripe until it expires. The customer believes they ordered; the truck has no ticket. **This is the failure mode that decides against A on its own** |
| 🔴 **Signal is not evidence** | The webhook route already states the principle at `:313-315`: *"The customer's browser returning from Stripe is not evidence — they can close the tab, lose signal, or never come back"* |
| ⚠️ **Redelivery** | Not applicable — but a customer refreshing the success URL is the same hazard, and needs the same idempotency |
| ⚠️ **Mobile** | The card path leaves the site entirely (`window.location.href`). On a phone, tab-closing after payment is ordinary behaviour, not an edge case |

### Option B — the Stripe webhook

| | |
|---|---|
| ✅ **Customer closes the tab** | **Irrelevant. The event arrives regardless.** This is the whole argument for B |
| ✅ **Idempotency already exists, twice** | `stripe_webhook_events_event_id_uniq` (23505 = duplicate, 200, stop) and `order_payments_idempotency_key_uidx` keyed on the PaymentIntent id. **Redelivery is already a solved problem on this route** |
| 🔴 **The order appears LATER, not instantly** | Stripe delivery is typically seconds but is not guaranteed. **The customer lands on the confirmation before the order exists.** Today `?confirm=` fetches `/api/orders/{key}` and would 404 |
| 🔴 **Creation now happens where failure is invisible** | The four binding phases would run inside a webhook handler. A stock 409 there has **no customer to tell** — only a log and a 500 that makes Stripe retry a refusal that will never succeed |
| 🔴 **The 2xx contract fights it** | QUOTED, `:34-36`: *"The 2xx is returned as soon as the event is DURABLY RECORDED and no later. Nothing slow, and nothing that can throw, runs between verification and the response — because a slow or throwing handler is precisely what turns one delivery into several."* **Order creation is slow and can throw.** It is exactly what this contract excludes |
| ⚠️ **Retry semantics invert** | Today a 500 means "we lost the receipt, resend". Under B a 500 could mean "stock ran out", which retrying for three days cannot fix |
| ⚠️ **Redelivery of the SAME event** | The receipt insert at `:179` 23505s and returns `{ received: true, duplicate: true }` **before any handler runs** — so a redelivery would currently **skip creation entirely**. Safe against duplicates, but it means the duplicate branch must be able to tell "already created" from "recorded but creation failed" |

### ⚠️ WHAT NEITHER OPTION SOLVES, AND IT IS THE SAME GAP

🔴 **An authorization that is never converted.** Under A a closed tab strands it; under B a failed stock re-check strands it. **Both need cancel-authorization, which the stated design already requires to hang off `'cancelled'` and `'rejected'`** (`action/route.ts:264` and `:298`) — but neither of those fires for an order that was never created. **Not established: what cancels an authorization whose draft never became an order.**

⚠️ **A hybrid is neither recommended nor excluded here** — the brief asked for costs, not a recommendation, and both are stated above.

---

## 7. The webhook on `payment_intent.succeeded`, today and under the change

**Source: QUOTED.** `app/api/webhooks/stripe/route.ts:327-408`. The load-bearing part:

```ts
    const metadata = (pi?.metadata ?? {}) as Record<string, unknown>
    const orderKey = typeof metadata.order_key === 'string' ? metadata.order_key : null

    if (!orderKey) {
      console.log(`[webhook/stripe] payment_intent.succeeded id=${eventId} pi=${piId} — no order_key metadata, not ours`)
      await markHandled(eventId, 'not_ours')
      return NextResponse.json({ received: true })
    }
    …
    const { data: order } = await supabase
      .from('orders')
      .select('order_key, truck_id')
      .eq('order_key', orderKey)
      .maybeSingle()

    if (!order?.truck_id) {
      console.error(
        `[webhook/stripe] 🔴 payment_intent.succeeded FOR AN UNKNOWN ORDER — pi=${piId} order_key=${orderKey} ` +
        `amount_received=${amountReceived}. The customer HAS been charged. Reconcile by hand.`,
      )
      await markHandled(eventId, 'unknown_order')
      return NextResponse.json({ received: true })
    }
```

Then `recordOnlineCardPayment` (`lib/payments/online.ts:60`), keyed `stripe_pi:{id}`.

### 🔴 WHAT WOULD HAVE TO CHANGE

**Source: INFERRED**, from the quoted code.

1. 🔴 **"UNKNOWN ORDER" IS CURRENTLY AN ALARM AND WOULD BECOME THE NORMAL CASE.** Under authorize-first the order legitimately does not exist yet. That branch — `console.error` + `Reconcile by hand` — would fire on **every** payment. It must learn to distinguish *"no order and no draft"* (still the alarm) from *"no order, but a draft is waiting"* (the expected path).
2. ⚠️ **`metadata.order_key` would carry a draft id**, or a second metadata key would be needed. §9.
3. 🔴 **`amount_received` IS ZERO ON AN AUTHORIZATION.** The guard at `:353` — `amountReceived === null || amountReceived <= 0` → INCOMPLETE, recorded, not acted on — **would reject every uncaptured intent.** An authorize-first flow fires `payment_intent.amount_capturable_updated` (or `.requires_capture`), not `.succeeded`, at authorization time. **`payment_intent.succeeded` would arrive at CAPTURE, after the order already exists.** ⚠️ **Not established whether the endpoint is subscribed to any capturable/authorization event** — the code handles exactly two types, `account.updated` and `payment_intent.succeeded`.
4. 🔴 **The ordering would invert.** Today: order → payment → ledger. Under authorize-first: authorization → order → capture → ledger. **The ledger write stays exactly where it is** (at succeeded/capture) and needs no change — it is the *creation* that moves, not the money recording.
5. ⚠️ **The 23505 duplicate short-circuit at `:198-207` returns BEFORE any handler.** If creation moved into a handler, a redelivery would skip it. That is correct for a completed creation and wrong for one that failed mid-way.
6. ⚠️ **The `livemode !== false` sandbox gate at `:328` applies unchanged.**

---

## 8. Every place an order's existence consumes capacity or stock

**Source: QUOTED.** 🔴 **This is the exact list a draft must not touch.**

**1 — item stock. `lib/stock-availability.ts:35-42`:**
```ts
  const { data: orders } = await supabase
    .from('orders')
    .select('items, deals')
    .eq('truck_id', truckId)
    .eq('event_id', eventId)
    .neq('status', 'cancelled')
    .neq('status', 'rejected')
  return tallyItemCounts(orders || [])
```
⚠️ **Note the shape: NOT an allow-list. Any status that is not `cancelled` or `rejected` counts.** A draft written into `orders` with a novel status like `'draft'` **would be counted.** Consumers: `checkStockShortfall`, `enforceStockLimits`, and `/api/menu/[truckId]:286` (the customer's `stock_remaining` badges).

**2 — option stock. `lib/option-stock.ts:68-75`:** byte-identical query, tallying `modifiers` + `slotModifiers`. Same not-an-allow-list hazard.

**3 — kitchen capacity. `lib/slot-bookings.ts:216-227` (`buildUnitsFromOrders`):**
```ts
  let ordersQuery = supabase
    .from('orders')
    .select('slot, items, deals')
    .eq('truck_id', truckId)
    .eq('event_id', eventId)
    .in('status', ['pending', 'confirmed', 'modified', 'cooking'])
```
✅ **THIS ONE IS AN ALLOW-LIST**, so a novel status is invisible to it.

**4 — the legacy per-slot count, `lib/slot-bookings.ts:464-474`:** same allow-list.

**5 — the persisted capacity board.** `place_order_atomic` DELETEs and re-INSERTs `production_slot_usage` for the event, from `p_unit_rows` computed by `computeEventUnitRows` → `buildUnitsFromOrders` **with the placing order folded in** (`slot-bookings.ts:279`). Read by `/api/dashboard/route.ts:577`, `/api/slots/[truckId]:152`, and the fit at `submit/route.ts:917`.

**6 — the sold-out flag.** `enforceStockLimits` (`submit/route.ts:1145`) writes `event_item_stock.available = false` when a live count hits its ceiling. **A draft that was counted would flip a real item sold-out.**

**7 — the display number.** `increment_event_order_counter` inside the RPC. Not capacity, but consumed and not returnable.

### 🔴 THE CONSTRAINT, STATED PRECISELY

**Source: INFERRED.** Two of the six consumers (items, options) count **every order that is not cancelled/rejected**. So **a draft stored as a row in `orders` would be counted by them no matter what status it carried**, unless both queries were changed — and changing them is changing the money-adjacent stock engine.

✅ **A draft in a SEPARATE TABLE is invisible to all six without touching any of them.** That is the only shape that satisfies *"nothing the capacity engine, getLiveItemCounts or buildUnitsFromOrders can see may know it exists"* without editing the engine.

---

## 9. The identifier linking draft → PaymentIntent → order

**Source: QUOTED.**

**Today, correlation is one-way and single-keyed.** Set at `checkout/route.ts:143-146`:
```ts
        payment_intent_data: {
          metadata: { order_key: order.order_key, truck_id: truck.id, source: 'hatchgrab_online_order' },
        },
        metadata: { order_key: order.order_key, truck_id: truck.id },
```
Read at `webhook:343`. 🔴 **And nothing points back:** the live `orders` column list contains **no** `payment_intent`, `stripe_*` or `checkout_session` column —

```
id, truck_id, customer_name, customer_phone, customer_email, slot, order_type, table_ref, event_date,
items, extras, bundle, discount_code, subtotal, discount_amt, total, notes, status, modify_type,
modify_data, payment_status, amount_paid, created_at, updated_at, deals, source, paid_at, collected_at,
event_id, cancellation_reason, van_id, order_key, rejection_reason, status_before_collected,
total_minor, deal_savings, capacity_ack_at, buzzer_number, placed_at, buzzer_lost_at, requested_slot,
asap_estimate
```

⚠️ **The PaymentIntent id IS recorded — one table over.** `order_payments.external_ref`, with `idempotency_key = stripe_pi:{id}` (`lib/payments/online.ts:45-47`). So `order → PI` is answerable today via a join on `order_payments`, but only **after** a successful payment.

### 🔴 THE BLOCKER

**`orders.order_key` does not exist until the INSERT.** QUOTED, `20260607_order_key_per_event.sql:20`:

```sql
  ADD COLUMN IF NOT EXISTS order_key uuid NOT NULL DEFAULT gen_random_uuid();
```

and the RPC takes it from that default — *"INSERT the order (order_key + created_at/updated_at via column defaults)"*, then `returning order_key into v_order_key`. **The one key the whole payment stack correlates on is minted by the row it identifies.**

### ✅ AND THE PRECEDENT THAT SOLVES IT ALREADY EXISTS

**QUOTED, `action/route.ts:1174-1226` — the offline walk-up path mints its `order_key` on the DEVICE:**

```ts
        const clientOrderKey: string | undefined = typeof manualOrder?.order_key === 'string' ? manualOrder.order_key : undefined
        …
        if (clientOrderKey) insertPayload.order_key = clientOrderKey
        …
          const up = await supabase.from('orders').upsert(insertPayload, { onConflict: 'order_key', ignoreDuplicates: true })…
```

🔴 **So an `order_key` minted BEFORE the row exists is an established pattern in this codebase, with idempotent-insert semantics already built around it.** A draft could carry a pre-minted `order_key`, put it in `payment_intent_data.metadata.order_key` exactly as today, and the webhook's join, `recordOnlineCardPayment`, the success URL and the confirmation route would all work **unchanged**.

⚠️ **The cost, stated:** an `order_key` would exist for a draft that may never become an order, so the key alone would stop meaning "an order exists". Every reader that treats a present `order_key` as proof of an order would need re-checking.

⚠️ **Alternative:** a separate `draft_id` in metadata alongside `order_key`. **Not established which the design wants**, and both are workable given the precedent.

---

## 10. What exists that could serve as a draft store

**Source: QUOTED. 🔴 NOTHING. There is no draft store and no table close to one.**

Every `create table` across `supabase/migrations/`:

```
booking_locks · excluded_terms · action_audit_log · demo_cleanup_log · demo_sessions
device_notification_prefs · discovery_events · discovery_trucks · kds_sessions
operator_email_verifications · order_payments · whatsapp_logs · rejected_event_signatures
scraper_run_log · stripe_webhook_events · subscribers · venues
```

### Candidate by candidate

| Candidate | Shape | Verdict |
|---|---|---|
| `orders` itself, with a `'draft'` status | — | 🔴 **NO.** §8: `getLiveItemCounts` and `getLiveOptionCounts` count everything not `cancelled`/`rejected`. A draft row would consume stock. Violates the stated constraint directly |
| `booking_locks` | `(truck_id, event_date)` PK, `locked_at`, sweep-by-age index, RLS service-role only | ⚠️ **Wrong shape** (one row per truck-date, no payload) — but ✅ **the right PRECEDENT**: a short-lived server-only row swept by age is exactly a draft's lifecycle |
| `stripe_webhook_events` | insert-first + 23505 idempotency, `handled` / `handled_at` / `handler_result`, RLS with zero policies | ⚠️ **Wrong purpose** — but ✅ **the closest PATTERN.** Its idempotency idiom and its handled-marking are what a draft's convert-once needs |
| `order_payments` | `order_key` FK-ish, `idempotency_key` unique, `external_ref` | ⚠️ **Presupposes an order.** Would need the draft to exist first |
| `operator_email_verifications` | `token unique`, `created_at`, `expires_at`, `verified_at` | ✅ **THE CLOSEST TABLE IN THE REPO BY SHAPE** — an opaque key, an expiry, and a consumed-at timestamp. Exactly a draft's three lifecycle columns. **Wrong domain entirely**, but the shape is already house style |
| `demo_sessions` | has `expires_at` | ⚠️ Same shape family; wrong domain |
| `lib/native/outbox.ts` | 🔴 **Capacitor Preferences on the operator's DEVICE** (`hg_outbox_op_<id>`) | 🔴 **NO.** Device-local, operator-only, never server-visible. A customer's browser has nothing equivalent, and a draft must survive a closed tab |

### ✅ THE ANSWER

**A new table is required.** Nothing existing can hold it. But **three house patterns already exist to build it from**, and none of them has to be invented:

- **`operator_email_verifications`** — the `token` / `expires_at` / `verified_at` triple, for the draft's identity and lifecycle
- **`stripe_webhook_events`** — insert-first + 23505 for convert-exactly-once, plus RLS with zero policies so only the service role can touch it
- **`booking_locks`** — the swept-by-age index, for expiring drafts nobody converted

⚠️ **Not established:** whether the draft's payload should be one jsonb column holding the §5 body or a set of typed columns. Nothing in the repo settles it, though `orders.items` / `orders.deals` are already jsonb and the draft must round-trip into them.

---

## Quoted vs inferred

| § | Status |
|---|---|
| 1 | **QUOTED** — every step with a line number; the client block and the checkout header verbatim |
| 2 | **QUOTED** — all four phases and the RPC's SQL. The must/could split is **INFERRED**, and the "advisory not binding" consequence with it |
| 3 | **QUOTED** — the totals block; the write inventory verified by grep. "Reachable with no side effect" is **INFERRED** from that grep |
| 4 | **QUOTED** — all eleven sites and the email's own header comment. The must/could column is **INFERRED** |
| 5 | **QUOTED** — the destructure, and the proof that three money fields are read nowhere. The three conditions are **INFERRED** |
| 6 | **QUOTED** — the success_url, the "browser returning is not evidence" comment, the 2xx contract, the 23505 short-circuit. The failure modes are **INFERRED** |
| 7 | **QUOTED** — the whole handler. Every "would have to change" is **INFERRED** |
| 8 | **QUOTED** — all six consumers verbatim, plus the counter. The allow-list vs not-an-allow-list distinction is **QUOTED** (visible in the queries); its consequence is **INFERRED** |
| 9 | **QUOTED** — the metadata write, the webhook read, the live `orders` column list, the `order_key` default, the client-minted precedent. The blocker is **INFERRED** |
| 10 | **QUOTED** — the full table list and each candidate's shape. "A new table is required" is **INFERRED** |

## Not established

- **What happens when the post-authorization stock/capacity re-check fails** with money already held. The single hardest consequence of the inversion; nothing in the codebase addresses it. §2.
- **Whether the confirmation email should fire at order creation or at capture**, given that the design leaves an auto-accept failure pending and uncaptured. §4.
- **Whether the webhook endpoint is subscribed to any authorization-time event.** The code handles exactly two types, and `payment_intent.succeeded` carries `amount_received: 0` before capture. §7.
- **What cancels an authorization whose draft never became an order.** The stated `'cancelled'`/`'rejected'` hooks fire on orders, and there would be none. §6.
- **Whether the draft should carry a pre-minted `order_key` or a separate `draft_id`.** Both work; the precedent supports the former. §9.
- **Whether `placed_at`'s server-minted `now()` still means what its migration says** once creation is a second request. §5.
- **The draft payload's column shape.** §10.
