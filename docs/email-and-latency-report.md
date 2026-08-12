# Every order email, and where order 25's 24 seconds went

**Date:** 12 August 2026
**READ-ONLY DIAGNOSIS. No file changed, no file created except this report. No `next dev`, no `next build`, no commit, no deploy. No fix proposed or applied.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 THE TWO HEADLINES

### 1. `cardHeld` is passed at EXACTLY ONE CALL SITE IN THE ENTIRE CODEBASE

```
$ grep -rn "cardHeld" --include="*.ts" --include="*.tsx" app lib | grep -v lib/email.ts | grep -v promote-draft
(nothing)
```

**QUOTED.** `lib/payments/promote-draft.ts:418` is the only place. **Nine other order emails** call `formatConfirmationEmail` without it, or hardcode the sentence entirely. The parameter is optional and defaults to `undefined`, so every one of them takes the `false` branch and prints:

> **Pay at the truck on collection**

That is one correct email and a fleet of wrong ones. Order 24's second email is site 5 in the table below.

### 2. Order 25's 24 seconds are OURS, and they are not cold start

```
21:22:04.000  Stripe: charge.succeeded + amount_capturable_updated
21:22:05.142  webhook received_at            <- 1.1s, Stripe's
21:22:05.487  order_drafts.promoted_at       <- 🔴 0.345s, ours. NOT a cold start.
21:22:28.976  orders.placed_at               <- 🔴 23.489s. ALL OURS, claim to insert.
21:22:32.461  order_payments row (captured)
21:24:35.262  webhook handled_at             <- 🔴 122.8s more before promoteDraft RESOLVED
```

**The claim landed 345 ms after the webhook arrived.** Whatever the 23.5 s is, it is not container start-up and it is not Stripe — the invocation was already running and had already done a round trip to Postgres.

---

## 1. Every email the product can send about an order

**Source: QUOTED** for every row (file, line, and the parameter list). The `cardHeld` column is quoted by absence — the grep above.

| # | Email | Composed at | Sent at | Payment parameter? | What it says about payment | Hardcoded or branched |
|---|---|---|---|---|---|---|
| 1 | ✅ **Customer confirmation, CARD path** | `promote-draft.ts:389` | `:433` | 🔴 **YES — the only one.** `cardHeld: !!draft.payment_intent_id` | *"Your card is held, not charged"* | **BRANCHED**, correctly |
| 2 | Truck "new order", card path | `promote-draft.ts:442` | `:456` | n/a — `formatNewOrderEmail` **takes no payment parameter at all** | **Nothing.** Only `Total £X` | n/a |
| 3 | ✅ Customer confirmation, PAY-AT-HATCH | `submit/route.ts:1212` | `:1240` | **NO** | *"Pay at the truck on collection"* | **Hardcoded by omission — and CORRECT here.** A card order never reaches this line |
| 4 | Truck "new order", pay-at-hatch | `submit/route.ts:1171` | `:1187` | n/a | **Nothing** | n/a |
| 5 | 🔴 **OPERATOR CONFIRM** | `action/route.ts:246` | `:272` | **NO** | *"Pay at the truck on collection"* | 🔴 **Hardcoded by omission. THIS IS ORDER 24'S SECOND EMAIL** |
| 6 | 🔴 **READY notification** (`deliverReadyEmail`) | `action/route.ts:150` | `:174` | **NO** | 🔴 **TWICE.** `email.ts:214` *"come and collect from X. **Pay at the truck.**"* AND `email.ts:250` *"Pay at the truck on collection"* | 🔴 **Hardcoded, doubled.** The `isReady` line is not even gated on `cardHeld` |
| 7 | 🔴 **QUICK TIME-ADJUST** | `action/route.ts:1684` | `:1711` | **NO** | *"Pay at the truck on collection"* | 🔴 Hardcoded by omission — **and this site captures**, at capture site 3 |
| 8 | 🔴 **OPERATOR EDIT** | `action/route.ts:~745` | `:773` | n/a — **bespoke inline HTML, not `formatConfirmationEmail`** | `:769` *"Pay at the truck on collection · Powered by HatchGrab"* and `:777` the same in plain text | 🔴 **A STRING LITERAL.** Not reachable by any parameter |
| 9 | ✅ Manual / walk-up order | `action/route.ts:1333` | `:1359` | **NO** | *"Pay at the truck on collection"* | Hardcoded by omission — **CORRECT.** A walk-up is pay-at-hatch by definition |
| 10 | Reject notice | `action/route.ts:299` | (`notifyCustomer`) | n/a — bespoke HTML | **Nothing** (the grep for the phrase finds nothing in that body) | n/a |
| 11 | Operator cancel notice | `action/route.ts:330` | (`notifyCustomer`) | n/a — bespoke HTML | **Nothing** | n/a |
| 12 | ⚠️ Customer self-cancel | `orders/cancel/route.ts:111` | `sendCancellationEmail` | **`paymentStatus`**, a different parameter | `email.ts:436` *"Your refund will be processed automatically within 3–5 working days"* — **only when `paymentStatus === 'paid'`** | **BRANCHED**, on the wrong fact |
| 13 | Event cancellation | `events/action/route.ts` | `sendEventCancellationEmail` | **`paymentStatus`** | same refund line | BRANCHED |

**Excluded, not an order email:** `app/api/inbound-schedule/route.ts:317` — schedule verification, no order involved.

### 🔴 Sites 5, 6, 7 and 8 are the defect, and they are the ones a card customer is most likely to see

They are the entire **post-placement** lifecycle: confirm, ready, time-adjust, edit. A pay-at-hatch order is right at all four. A card order is wrong at all four, and **sites 5 and 7 are capture sites** — the money moves in the same request that sends an email telling the customer to pay again.

### ⚠️ And a separate one worth naming: site 12

`paymentStatus === 'paid'` promises *"your refund will be processed automatically"*. **INFERRED:** these are Connect **direct charges**, so the truck is merchant of record and HatchGrab cannot issue that refund. For an order that is authorised-but-uncaptured the status is `'unpaid'`, so the line is absent and cancelling silently leaves a live hold with no mention of it. Out of scope for this diagnosis; recorded because it is the same class of error.

---

## 2. The email an operator's CONFIRM sends

**Source: QUOTED.** `app/api/dashboard/action/route.ts:216-272`:

```ts
    if (action === 'confirm') {
      const { data: order } = await supabase.from('orders').select('*').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      await supabase.from('orders').update({ status: 'confirmed' }).eq('order_key', orderKey).eq('truck_id', truck.id)
      …
      await captureOnConfirmation(supabase, { orderKey, truckId: truck.id, trigger: 'confirm' })

      if (order.customer_email) {
        …
        const { subject, html, text } = formatConfirmationEmail({
          orderId: order.id,
          orderKey: order.order_key,
          customerName: order.customer_name,
          truckName: truck.name,
          items: order.items || [],
          deals: order.deals || [],
          slot: order.slot ?? null,
          discountAmt: order.discount_amt ?? 0,
          total: Number(order.total),
          notes: order.notes ?? null,
          autoAccepted: true,
          venueName: eventRow?.venue_name ?? null,
          …
        })
        await sendEmailUnlessDemo(truck, { to: order.customer_email, subject, html, text, senderName: truck.name })
```

**There is no `cardHeld` in that object.** `formatConfirmationEmail`'s parameter is optional, so it is `undefined`, so `email.ts:238` and `email.ts:308` both take the false branch:

```
Pay at the truck on collection
```

### What data it has, and whether it could know

| Question | Answer |
|---|---|
| Does it have the order? | ✅ **YES — `select('*')`.** Every column, including `payment_status`, in `order` |
| Could it know the order had a **held** authorisation? | 🔴 **YES, trivially.** `readHeldAuthorisations(supabase, [orderKey])` is one call, and the draft row is a primary-key lookup. It asks neither |
| Could it know it had **just been captured**? | 🔴 **YES, AND IT ALREADY HAS THE ANSWER IN ITS HAND AND THROWS IT AWAY.** `captureOnConfirmation` runs **26 lines above** the composition and returns a `CaptureResult` — `'captured'`, `'already'`, `'none'`, `'expired'` or `'failed'`. The call is `await captureOnConfirmation(...)` with **no assignment**. The exact fact the email needs is computed, in the same function, moments earlier, and discarded |
| Is `order.payment_status` usable? | ⚠️ **NO — it is stale by construction.** `order` was read **before** the capture. Even after capture writes the ledger and `recalcOrderPayment` updates the column, this in-memory copy still says `'unpaid'` |

**QUOTED.** The discarded return value is the single most striking thing in this file.

---

## 3. Order 25's email

**Order 25 is `order_key 162d9c9a-f331-4971-9f93-95255d89efe4`, created 2026-08-12T21:22:29.689Z, `status: 'confirmed'`, `payment_status: 'paid'`, `amount_paid: 11`.**

### Which email the code sends, and what it must have said

**Source: QUOTED.** Auto-accepted, so there is no operator confirm; the only send is **site 1**, `promote-draft.ts:389`, with:

```ts
          cardHeld:     !!draft.payment_intent_id,
```

The draft's `payment_intent_id` is `pi_3U3jas2fB4PPCw2D1eQ7Dxqs` — **non-null**, read live. So `cardHeld` is `true` and that email said:

> **Your card is held, not charged** — Test Kitchen takes the payment when they confirm your order. Nothing to pay at the truck.

🔴 **SO SITE 1 CANNOT PRODUCE "PAY AT THE TRUCK" FOR ORDER 25.** I checked the alternatives and none of them explain it either: `email.ts:214`'s *"Pay at the truck."* is gated on `variant: 'ready'`, and the confirmation **screen** contains no payment copy at all (`grep` for "Pay at" in the confirmation component returns nothing).

### Before or after capture, and would the payment state be right?

**QUOTED, from the deployed code (commit `d9cf8b5`, 2026-08-12T21:12:23Z, six minutes before order 24):** capture is **step 8a**, immediately after the event lock releases; the confirmation email is **step 9**. **The send happens AFTER capture.**

Confirmed by the clock: ledger row **21:22:32.461**, `promoteDraft` resolved **21:24:35.262**. The email was composed and sent in that window — **at least two minutes after the money had already moved.**

🔴 **SO THE PARAMETER IS STALE IN THE OPPOSITE DIRECTION.** By the time this email is written the card is not held, it is **charged**. `cardHeld: true` is the least-wrong of the two available branches — `false` would say *"Pay at the truck on collection"* to someone already charged — but **neither branch is true.** `formatConfirmationEmail` has no third state, so an auto-accepted card order **cannot** be described accurately by this function as it stands. That is written into `promote-draft.ts:407-417` and was flagged when the capture was built.

### 🔴 THE ONE CANDIDATE FOR A SECOND EMAIL, AND IT IS NOT ESTABLISHED

`orders.updated_at` for order 25 is **21:24:33.822** — 124 seconds after the insert, and **1.4 s before** `promoteDraft` finally resolved. Nothing in promotion's tail writes `orders`: `enforceStockLimits` only reads `orders` (`stock-availability.ts:36`) and writes `event_item_stock` (`:119-123`); the capture's `recalcOrderPayment` had already run at 21:22:32.

**The only writer I can name that moves `updated_at` without changing `status` — and sends site 5's "Pay at the truck on collection" email — is a second `action: 'confirm'` on an already-confirmed order.** That would fit your report exactly.

**NOT ESTABLISHED.** The confirm branch writes no `action_audit_log` row (`select` on both order keys returns `[]`), so there is no record of who wrote at 21:24:33.822 or why. It could equally be an operator tap on a stale board, the KDS, or an offline replay. **What IS established is that site 1 did not say it.**

---

## 4. 🔴 THE WAIT — ORDER 25, TIMED

**Source: QUOTED.** `order_drafts`, `orders`, `order_payments`, `stripe_webhook_events` and the Stripe event list, all read live.

| From | To | Elapsed | Whose |
|---|---|---|---|
| `21:21:50.101` draft created (`/api/orders/submit`) | `21:21:50` `payment_intent.created` | ~0 s | ours |
| `21:21:50` intent created | `21:22:04` `charge.succeeded` | ⚠️ **13.9 s** | 🔵 **THE CUSTOMER**, at the Apple Pay sheet |
| `21:22:04` Stripe event created | `21:22:05.142` webhook `received_at` | **1.14 s** | 🟠 **STRIPE'S** delivery |
| `21:22:05.142` received | `21:22:05.487` `promoted_at` (the claim) | ✅ **0.345 s** | 🔴 **OURS — and fast. This is where a cold start would show, and it does not** |
| `21:22:05.487` claim | `21:22:28.976` `placed_at` | 🔴 **23.489 s** | 🔴 **OURS. THE WAIT** |
| `21:22:28.976` | `21:22:29.689` `orders.created_at` | 0.71 s | ours (the INSERT) |
| `21:22:29.689` | `~21:22:31` `charge.captured` | ~1.3 s | ours + Stripe (step 8a) |
| `~21:22:31` | `21:22:32.461` ledger row | ~1.5 s | ours |
| `21:22:32.461` | `21:24:35.262` `handled_at` = `promoteDraft` **resolved** | 🔴 **122.8 s** | 🔴 **OURS. THE SECOND, BIGGER WAIT** |

**Customer-visible total, authorisation to order row: 25.7 s.**
**Total `promoteDraft` wall time, claim to resolve: 149.8 s.**

### 🔴 AND ORDER 24, THE SAME CODE PATH, 3½ MINUTES EARLIER

| | order 24 | order 25 |
|---|---|---|
| webhook received → claim | 0.211 s | 0.345 s |
| 🔴 **claim → insert** | ✅ **2.497 s** | 🔴 **23.489 s** |
| insert → `promoteDraft` resolved | 17.7 s | 🔴 **125.6 s** |

**Same function, same truck, same event, same day, 3 minutes 13 seconds apart — and it took 9.4× longer.** Both were promoted by the webhook. That variance is the finding: it is not a constant cost of the four binding phases, it is something intermittent.

**Not established:** what varied. There is no per-step timing in the logs and no Vercel access here.

---

## 5. What the confirmation screen does while waiting

**Source: QUOTED.** `app/trucks/[slug]/order/page.tsx:644-716`.

```ts
    let attempt = 0
    const MAX_ATTEMPTS = 30
    const RETRY_MS = 2000
    const run = () => fetch(`/api/orders/${confirmOrderKey}?truck=${encodeURIComponent(slug)}`, { cache: 'no-store' })
      .then(async r => {
        if (cancelled) return
        if (r.status === 404 && attempt < MAX_ATTEMPTS) {
          attempt++
          setTimeout(() => { if (!cancelled) void run() }, RETRY_MS)
          return
        }
```

| | |
|---|---|
| **Polls** | `GET /api/orders/<order_key>?truck=<slug>`, `cache: 'no-store'` |
| **How often** | First attempt immediate, then every **2000 ms** |
| **How many** | **30** retries, so the window is **~60 s** |
| **On 404 inside the window** | ⚠️ **Not an error state.** `confirmLoading` stays `true`, so nothing flickers |
| **What it renders while waiting** | `:1756` — `<p className="text-slate-400 animate-pulse font-medium">Loading your order...</p>` under the truck header |
| **After 30 failed retries** | `:692` — **"We couldn't find that order."** with a 😕 and *"← Back to truck page"* |

### What the customer sees, by the clock

| t | Screen | Copy |
|---|---|---|
| **5 s** | still polling (attempt 3 of 30) | **"Loading your order..."** |
| **15 s** | still polling (attempt 8) | **"Loading your order..."** |
| **~24 s** | 🔴 **order 25's row appeared here** — the next poll succeeded | the confirmation renders |
| **30 s** | would still be polling (attempt 15) | **"Loading your order..."** |
| **60 s** | 🔴 **the 30th retry.** The next 404 flips to the dead end | **"We couldn't find that order."** |

✅ **The 60-second window did its job.** Order 25 resolved at ~24 s — **41 % of the way to the cliff.** The comment at `:660-674` records that the window was widened from ~8 s after order 18 missed it; order 25 would have missed an 8-second window too.

⚠️ **The screen says nothing about payment, and nothing about why it is waiting.** "Loading your order..." for 24 seconds after an Apple Pay confirmation reads as a failure to a customer who has just been debited. That is a copy and reassurance gap, not a bug.

---

## 6. Could promotion start earlier, or run faster?

### 🔴 IT IS NOT COLD START. THAT IS ESTABLISHED.

**QUOTED.** The claim (`promoted_at 21:22:05.487`) landed **345 ms** after `received_at 21:22:05.142`. In that 345 ms the handler had already verified the Stripe signature, written a `stripe_webhook_events` row, read the draft and executed the guarded `UPDATE`. **A container that had to start could not have done that.** Whatever consumed the 23.5 s happened *after* the invocation was demonstrably warm and talking to Postgres.

### Could it start earlier? ❌ **No, and it should not.**

**QUOTED**, `promote-draft.ts:14-19`: the four binding phases run again *because* the pre-draft answer *"is stale by the time the customer has typed their card number"*. Promotion cannot begin before an authorisation exists — that is the whole design. **The 13.9 s at the Apple Pay sheet is the customer's and is not ours to compress.**

### Could it run faster? ⚠️ **Almost certainly, and here is what sits in the 23.5 s**

**QUOTED**, in order, all between the claim and the INSERT, all `await`ed, all round trips to Postgres:

```
trucks select *                       findSoldOutOption
menu_items_db select                  acquireEventLock          (delete stale + insert)
buildItemCatMap  ┐ Promise.all        checkClosedCategories
buildCatConfigs  ┘                    checkStockShortfall
truck_events select                   checkOptionCeilingShortfall
                                      eventKitchenCapacity
                                      placeOrderInSlotLocked
                                      nextOrderId
```

**Twelve-plus sequential round trips**, only two of which are parallelised. **INFERRED:** at ~50 ms each that is under a second, so 23.5 s is not the ordinary cost of this list — order 24 proves it, at 2.5 s.

### 🔴 IS IT THE UN-AWAITED PROMOTION BEING SUSPENDED?

**QUOTED**, `webhooks/stripe/route.ts:554-555`:

```ts
function startPromotion(orderKey: string, trigger: 'webhook', eventId: string) {
  void promoteDraft(supabase, orderKey, trigger)
```

and the header's own warning at `:547-549`:

> *"THE HONEST LIMITATION: on a serverless runtime the invocation may be frozen once the response is sent, so this is NOT guaranteed to run to completion."*

**The 200 went back at ~21:22:05.2. Everything after that is a detached continuation on an invocation Vercel is free to freeze.** The shape of the evidence fits: 23.5 s to the insert, then **122.8 s** to resolve — and `handled_at 21:24:35.262` is **1.44 s after** the mystery `orders.updated_at` write at `21:24:33.822`. A later request warming the same instance and letting a suspended continuation finish would look exactly like that.

🔴 **NOT ESTABLISHED, AND I WILL NOT ASSERT IT.** Distinguishing "suspended" from "slow" needs the Vercel invocation log, which I have no access to. What I can say without it:

| Candidate | Verdict |
|---|---|
| Serverless **cold start** | ❌ **RULED OUT.** 345 ms to the claim |
| **Stripe** delivery | ❌ **RULED OUT.** 1.14 s, and it is Stripe's anyway |
| **The customer** | ❌ **RULED OUT.** Done at 21:22:04 |
| **Our code, running slowly** | ⚠️ possible — but order 24 ran the identical path in 2.5 s |
| 🔴 **The un-awaited continuation being suspended** | ⚠️ **CONSISTENT WITH EVERY TIMESTAMP, INCLUDING THE 122.8 s TAIL. Not proven** |

---

## 7. Redirect versus webhook — and which one won

### Both can promote. **QUOTED.**

`app/api/payments/return/route.ts:46`:

```ts
    res = await promoteDraft(supabase, draftKey, 'redirect')
```

**`await`ed**, unlike the webhook's `void`. And `promote-draft.ts:107-118`: a conditional `UPDATE` guarded on `promoted_at is null` arbitrates. The winner gets the row and returns `'promoted'`; the loser gets `null` and returns `'already'` **with no error**.

### 🔴 FOR ORDER 25, THE WEBHOOK WON. THIS IS QUOTED, NOT INFERRED.

```
stripe_event_id   : evt_3U3jas2fB4PPCw2D14CMXXfT
type              : payment_intent.amount_capturable_updated
received_at       : 2026-08-12T21:22:05.142474+00:00
handled_at        : 2026-08-12T21:24:35.262+00:00
handler_result    : "promotion:promoted"
```

`markHandled` is called inside `startPromotion`'s `.then()`, with `` `promotion:${res.status}` ``. **`promoted` — not `already` — is returned only by the caller that won the claim.** So the webhook's `promoteDraft` created order 25, and the redirect (whenever the customer's browser reached it) received `'already'` and redirected straight to the confirmation.

**Order 24 is the same:** `evt_3U3jXi2fB4PPCw2D0kRfNljg`, `received_at 21:18:52.462`, `handled_at 21:19:12.88`, `handler_result "promotion:promoted"`.

⚠️ **AND THAT IS THE UNLUCKY OUTCOME OF THE TWO.** The redirect promotes **awaited**, inside a request whose only job is to finish and redirect a waiting human. The webhook promotes **detached**, on an invocation permitted to freeze. **The webhook beat the redirect by enough that the customer then waited 24 seconds for work that would have been awaited had they won.** The race is not rigged either way — the webhook fires from Stripe at authorisation, the redirect fires from the customer's browser — and here Stripe was faster.

---

# Quoted vs inferred

| § | Status |
|---|---|
| 1 | **QUOTED** — every file, line and parameter list; the `cardHeld` grep. The "correct/defect" verdicts are **INFERRED** from which path can reach each site |
| 2 | **QUOTED** — the whole branch, and the discarded `CaptureResult` |
| 3 | **QUOTED** — the `cardHeld` line, the live `payment_intent_id`, the capture-before-email ordering and the two clock readings. The second-email explanation is **NOT ESTABLISHED** |
| 4 | **QUOTED** — every timestamp read live from `order_drafts`, `orders`, `order_payments`, `stripe_webhook_events` and Stripe's event list. The whose-is-whose split is **INFERRED** from what each boundary means |
| 5 | **QUOTED** — the effect, the constants and the copy. The per-second column is **INFERRED** arithmetic from `MAX_ATTEMPTS`/`RETRY_MS` |
| 6 | **QUOTED** — the 345 ms, the `void`, the header's own warning, the step list. The suspension explanation is **NOT ESTABLISHED** |
| 7 | **QUOTED** — `handler_result: "promotion:promoted"` for both orders, and the `await` vs `void` asymmetry |

# Not established

- 🔴 **What wrote `orders.updated_at = 21:24:33.822` for order 25**, and therefore whether a second (site 5) email was sent to it. The confirm branch writes no audit row, so there is no record. This is the only candidate explanation for the "pay at the truck" email you saw on that order, and it is unproven.
- 🔴 **Whether the 23.5 s and the 122.8 s were suspension or slowness.** Needs the Vercel invocation log. Cold start, Stripe and the customer are all ruled out by timestamps.
- **Why order 24 took 2.5 s and order 25 took 23.5 s** on the identical path, 3 minutes apart.
- **Whether Brevo was slow.** The confirmation email sits in the 122.8 s tail with `enforceStockLimits`; nothing times either.
- **What the customer's browser did between 21:22:04 and reaching `/api/payments/return`** — no server-side record exists of when that request arrived, only that it lost the claim.
