# Why authorize-then-capture did not take effect

**Date:** 13 August 2026
**READ-ONLY DIAGNOSIS. No file changed, no file created except this report. No `next dev`, no `next build`. No commit, no deploy. No fix proposed or applied.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

⚠️ **ONE DECLARED DEVIATION FROM "READ-ONLY":** I queried the Stripe API for existing objects (`paymentIntents.retrieve`, `checkout.sessions.list`, `paymentIntents.list`) on the connected account. **Reads only — nothing was created, modified or cancelled at Stripe.** They are what turned this from an inference into a proof.

---

# 🔴 THE CAUSE, ESTABLISHED — AND IT IS ONE LINE OF MINE

**`authorizeDraft` ran. Readiness passed. Stripe accepted `capture_method: 'manual'` and created the Session. Then my own guard rejected it.**

Stripe's own record, read live:

```
RECENT CHECKOUT SESSIONS on the connected account acct_1U30w22fB4PPCw2D:
  2026-08-12T14:24:22.000Z cs_test_a1MKd87… pi=null                        status=open     meta={"order_key":"973663fd-38bc-47cc-838e-a9000def4428","truck_id":"test-truck"}
  2026-08-12T14:24:24.000Z cs_test_a1jTJWN… pi=pi_3U3d5B2fB4PPCw2D1GoSarUW status=complete meta={"order_key":"d8beddf7-3e97-47a7-a9e6-2735acddb0b5","truck_id":"test-truck"}
```

🔴 **THE FIRST SESSION CARRIES THE DRAFT'S KEY.** `authorizeDraft` worked. But **`payment_intent` is `null`**, and my code requires it:

```ts
    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null

    if (!session.url || !paymentIntentId) {
      console.error(
        `[authorize] 🔴 session created without a url or intent for draft=${args.orderKey} ` +
        `(url=${!!session.url} pi=${paymentIntentId}) — cannot proceed`,
      )
      return { ok: false, reason: 'error', detail: 'session incomplete' }
    }
```

🔴 **THE ASSERTION IN THAT FILE'S OWN HEADER IS FALSE.** I wrote: *"`session.payment_intent` hands back its id at creation so it can be attached to the draft immediately."* **It does not.** A Checkout Session's PaymentIntent is created when the customer **submits payment**, not when the Session is created — proved twice over by Stripe's own timestamps:

| Session created | Session `payment_intent` at creation | PaymentIntent actually created |
|---|---|---|
| 14:24:22 (**the draft's**) | 🔴 **null** | — (still `open`, never completed) |
| 14:24:24 (the old path's) | null at creation | **14:24:41** — 17 s later |

⚠️ **AND THE SECOND SESSION'S `pi=` IS POPULATED ONLY BECAUSE IT IS NOW `complete`.** The field fills in retrospectively. At the instant `sessions.create` returned, both were null.

**So the guard returns `{ ok: false }`, `authorizeDraft` fails, and the card fork FALLS THROUGH — by design — into the pay-at-hatch path, which creates the order, mints its own key, and sends the email.**

---

## 1. What the order page posts, and where

**Source: QUOTED.** `app/trucks/[slug]/order/page.tsx:1290` — inside the **existing** `fetch('/api/orders/submit', …)` body:

```tsx
          payByCard: !!(payByCard && truck?.card_payments_ready),
        }),
      })
```

✅ **It calls `/api/orders/submit`, exactly as before.** There is no separate draft-creating endpoint. The new path is a **branch inside the existing submit route**, selected by one added body field.

**And the client handles the new reply at `:1365-1368`:**
```tsx
      if (data.requiresAuthorization && data.url) {
        window.location.href = data.url as string
        return
      }
```

⚠️ **This branch was never reached on the live order**, because the server never returned `requiresAuthorization` — see §3.

---

## 2. The branch that chooses the card path

**Source: QUOTED.** `app/api/orders/submit/route.ts:701`:

```ts
    if (payByCard === true) {
```

🔴 **STRICT `=== true`.** The client must send the JSON boolean `true` in `payByCard`. Absent, `false`, `"true"`, `1` — none select the card path.

**And it did send it:** the draft row exists, and `createOrderDraft` is called from nowhere else in the codebase. **QUOTED evidence — the live draft:**

```
 "order_key": "973663fd-38bc-47cc-838e-a9000def4428",
 "truck_id": "test-truck",
 "created_at": "2026-08-12T14:24:22.501828+00:00",
 "total_minor": 1800,
```

✅ **So the fork was entered. The condition is not the fault.**

---

## 3. What happens after the draft is written — and does it return?

**Source: QUOTED.** `submit/route.ts`, from the draft write to the fall-through, in full:

```ts
      if (created.ok) {
        const auth = await authorizeDraft(supabase, {
          orderKey:    draftKey,
          truckId:     resolvedTruckId,
          truckName:   truck.name,
          truckSlug:   truck.slug ?? null,
          amountMinor: serverTotalMinor,
        })
        if (auth.ok) {
          // 🔴 THE ONLY SUCCESSFUL EXIT THAT CREATES NO ORDER. The client redirects to `url`; Stripe
          // authorises; promotion follows from the webhook (authoritative) and/or the return route.
          return NextResponse.json({
            requiresAuthorization: true,
            orderKey: draftKey,
            url: auth.url,
            total: serverTotal,
          })
        }
        console.warn(
          `[submit] card authorisation unavailable for draft=${draftKey} truck=${resolvedTruckId} ` +
          `(${auth.reason}${auth.reason === 'error' ? `: ${auth.detail}` : ''}) — falling through to ` +
          `pay-at-hatch. The draft is left to expire and be swept; no money was authorised.`,
        )
      } else {
        console.error(
          `[submit] draft not created for truck=${resolvedTruckId} (${created.error}) — falling through ` +
          `to pay-at-hatch. No money was authorised.`,
        )
      }
      // ⚠️ FALL THROUGH. Not a return: the order is placed unpaid below, exactly as it is today when
      // /api/stripe/checkout fails, and the customer pays at the truck.
    }

    // ── Atomic stock guard + slot placement under ONE per-event lock (Stage 2, Option B) ──
```

### 🔴 THE DIRECT ANSWER

**It returns ONLY when `auth.ok` is true. On ANY authorisation failure it CONTINUES into order creation.** There is exactly one `return` in the block, and it is behind `if (auth.ok)`.

🔴 **THAT FALL-THROUGH IS MINE, IT IS DELIBERATE, AND IT IS WHAT PRODUCED THIS INCIDENT.** I wrote it so a truck that cannot take cards still gets its order placed — and documented it in the phase-2b report as *"AND IT FALLS BACK RATHER THAN FAILING."* What I did not anticipate is that it would fire on **every** card order, because the failure is not a truck-configuration problem but an unconditional bug in the line above it.

⚠️ **AND THE FALL-THROUGH IS SILENT TO EVERYONE BUT THE LOG.** The customer sees the normal order-first flow. The operator sees a normal order. The only artefact is one `console.warn` — and an orphaned draft.

---

## 4. Every path that can still reach `place_order_atomic` on a card order

**Source: QUOTED.** A repo-wide grep for `place_order_atomic` outside `supabase/migrations/` returns **exactly one call site**:

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

`app/api/orders/submit/route.ts:963`. Every other hit is a comment.

✅ **So there is ONE path, and it is the one the card fork falls through into.** `promote-draft.ts` deliberately does not use the RPC (it cannot supply the draft's `order_key`), and no other route calls it.

🔴 **Nothing "else" created this order. The submit route created it, on its normal path, because the card branch declined to return.**

---

## 5. How the order got a DIFFERENT `order_key`

**Source: QUOTED.** `place_order_atomic` does not accept an `order_key` and does not include it in its INSERT column list — `20260804_place_order_atomic_placed_at.sql`:

```sql
  insert into orders (
    id, truck_id, customer_name, customer_email, customer_phone, slot, order_type,
    event_date, event_id, van_id, items, deals, discount_code, subtotal, discount_amt,
    total, total_minor, notes, status, payment_status, placed_at
  ) values ( … )
  returning order_key into v_order_key;
```

**`order_key` is absent from that list**, so the row takes its column default — `20260607_order_key_per_event.sql:20`:

```sql
  ADD COLUMN IF NOT EXISTS order_key uuid NOT NULL DEFAULT gen_random_uuid();
```

🔴 **`gen_random_uuid()` MINTED `d8beddf7-…`, KNOWING NOTHING ABOUT THE DRAFT.** The draft's `973663fd-…` was minted 1.0 s earlier by `newOrderKey()` (`crypto.randomUUID()`) and, once the fork fell through, was never referenced again. **Two independent keys, because two independent code paths minted them.**

⚠️ This is precisely the incompatibility `promote-draft.ts` documents as its reason for not using the RPC — *"🔴 IT CANNOT WRITE THE DRAFT'S order_key."* The fall-through routes straight into the function that has that limitation.

---

## 6. Why `payment_intent_id` is null on the draft

**Source: QUOTED. Because `attachPaymentIntent` was never reached.**

`lib/payments/authorize.ts` has exactly one call, and it sits **after** the guard that bailed:

```ts
    if (!session.url || !paymentIntentId) { … return { ok: false, reason: 'error', detail: 'session incomplete' } }

    // 🔴 ATTACHED BEFORE THE CUSTOMER IS SENT ANYWHERE. …
    const attached = await attachPaymentIntent(supabase, {
      orderKey: args.orderKey,
      paymentIntentId,
      livemode: session.livemode === true,
    })
```

**Every condition guarding it:**

| Guard | Held on this order? |
|---|---|
| `truck.operator_id` present | ✅ `d926161e-…` |
| `resolveOnlineCardPayments(operator, truck).offered` | ✅ `stripe_charges_enabled: true`, `online_payments_paused_at: null` |
| `Number.isInteger(amountMinor) && > 0` | ✅ 1800 |
| `sessions.create` does not throw | ✅ **`cs_test_a1MKd87…` exists** |
| 🔴 **`session.url && paymentIntentId`** | 🔴 **FAILED — `payment_intent` was `null`** |
| `attachPaymentIntent` returns true | ⚫ never reached |

✅ **Readiness is proved good by the live data**, and independently by the fact that the OLD `/api/stripe/checkout` created a working session for the same truck two seconds later.

### What happens if PaymentIntent creation throws

**QUOTED** — the whole body is wrapped:

```ts
  } catch (err) {
    console.error(`[authorize] FAILED draft=${args.orderKey}:`, err instanceof Error ? err.message : err)
    return { ok: false, reason: 'error', detail: err instanceof Error ? err.message : 'unknown' }
  }
```

🔴 **YES — A THROW FALLS BACK TO THE OLD PATH.** `{ ok: false }` is indistinguishable at the call site from "this truck cannot take cards", and §3's fall-through then places the order and offers the old checkout. **Every failure mode of authorisation, including a total Stripe outage, silently reverts the customer to order-first.**

⚠️ **AND `attachPaymentIntent` RETURNING FALSE DOES THE SAME** — despite the comment above it saying *"REFUSING to send the customer to pay, because an authorisation this system cannot name is worse than no card payment."* It refuses the **authorisation**, then the caller places the order and the client offers the old checkout anyway.

---

## 7. Why the order was `payment_status: 'paid'`

⚠️ **A CORRECTION TO THE BRIEF, WITH EVIDENCE. IT WAS NOT PAID AT CREATION.** It was created `unpaid` at 14:24:23 and became `paid` **twenty seconds later**, by the normal online-payment path.

**The ledger row, read live:**

```json
 { "order_key": "d8beddf7-3e97-47a7-a9e6-2735acddb0b5",
   "kind": "charge", "channel": "online", "amount_minor": 1800, "state": "succeeded",
   "external_ref": "pi_3U3d5B2fB4PPCw2D1GoSarUW",
   "idempotency_key": "stripe_pi:pi_3U3d5B2fB4PPCw2D1GoSarUW",
   "created_at": "2026-08-12T14:24:43.724541+00:00", "created_by": "stripe_webhook",
   "method": "card", "livemode": false }
```

**The timeline, all timestamps from live records:**

| Time | Event |
|---|---|
| 14:24:22.50 | Draft written |
| 14:24:22 | `authorizeDraft`'s Session created — **manual capture, draft key, `pi=null`** → guard bails |
| 14:24:23.52 | 🔴 **Order created by `place_order_atomic`, `payment_status: 'unpaid'`** |
| ~14:24:23 | 🔴 **Confirmation email sent** — before any card was entered |
| 14:24:24 | Client calls `/api/stripe/checkout`; **second** Session created, order key |
| 14:24:41 | Customer pays. **`pi_3U3d5B…` created, `capture_method: automatic_async`, charged immediately** |
| 14:24:43.72 | Webhook writes the ledger row |
| 14:24:43 | `recalcOrderPayment` writes `payment_status: 'paid'`, `amount_paid: 18` |

**What sets it — `lib/payments/ledger.ts:457-460`, the only writer:**

```ts
  const { error } = await supabase
    .from('orders')
    .update({ payment_status: balance.status, amount_paid: fromMinor(balance.paidMinor) })
    .eq('order_key', orderKey)
```

🔴 **AND THE PaymentIntent PROVES WHICH PATH TOOK THE MONEY:**

```
  capture_method: automatic_async
  metadata      : {"order_key":"d8beddf7-…","source":"hatchgrab_online_order","truck_id":"test-truck"}
```

**`automatic_async`, not `manual`** — so it was created by `/api/stripe/checkout`, which sets no `capture_method`. **The money was CHARGED, not held.** Authorize-then-capture did not merely fail to promote; it did not participate at all.

⚠️ **`status: 'confirmed'`** is the ordinary auto-accept result of `place_order_atomic`, unrelated to payment.

---

## 8. The confirmation email

**Source: QUOTED.** `app/api/orders/submit/route.ts:1147`:

```ts
      await sendConfirmationEmail({ to: customerEmail, subject, html, text, truckName: truck.name })
```

**Sent by the PAY-AT-HATCH path in `/api/orders/submit`**, in the post-save block that begins *"BEST-EFFORT (post-save): the order is already SAVED (and booked) above."*

🔴 **THAT IS WHY IT ARRIVED BEFORE CARD DETAILS.** It is bound to order creation, and under the fall-through the order was created ~18 seconds before the customer submitted their card. `promote-draft.ts`'s own confirmation send — the one designed to fire only after authorisation — **never ran**, because promotion never ran, because there was no attached PaymentIntent and no draft key at Stripe to promote from.

⚠️ **The truck's "new order" email at `:1094` went out on the same path, at the same moment.**

---

## What the system is left holding

| Artefact | State |
|---|---|
| Draft `973663fd-…` | 🔴 **Orphaned.** `payment_intent_id` null, `promoted_at` null, **PII still present**, expires 14:54 |
| Its Stripe Session `cs_test_a1MKd87…` | `status: open`, manual capture, **never used**. Expires on Stripe's own schedule |
| Order `d8beddf7-…` | Real, confirmed, paid, correct |
| The customer | ✅ **Charged correctly, once, £18. No money is at risk from this** |

✅ **The orphaned draft is deletable** — `payment_intent_id` is null, so both purges will remove it and its PII at expiry without needing the cancellation sweep.

---

## Quoted vs inferred

| § | Status |
|---|---|
| 1 | **QUOTED** — the client body field and the `requiresAuthorization` handler |
| 2 | **QUOTED** — the condition; that it was satisfied is **QUOTED** from the live draft row |
| 3 | **QUOTED** — the whole block verbatim. "Continues into order creation" is read directly off it |
| 4 | **QUOTED** — the single call site, established by exhaustive grep |
| 5 | **QUOTED** — the RPC's INSERT list and the column default |
| 6 | **QUOTED** — the guard, the call, the catch. Which guard failed is **QUOTED** from Stripe's `pi=null` |
| 7 | **QUOTED** — the ledger row, the PaymentIntent, the writer. The timeline is **INFERRED** by ordering those timestamps |
| 8 | **QUOTED** — the send site |

## Not established

- **The `[authorize] 🔴 session created without a url or intent` log line was not read.** I have no Vercel log access. The conclusion rests on Stripe's own records instead — a Session bearing the draft key with `payment_intent: null` — which is stronger evidence than the log would have been, but the log should exist and would confirm it in one line.
- **Whether `payment_intent` is ever populated at Session creation on some API version or configuration.** Observed null at creation on every Session in this account's history; whether that is universal is not established from here.
- **Why the 2026-08-10 Session shows `pi=null` while `status=expired`** yet a matching PaymentIntent exists from one second later. Consistent with the field filling in only on completion, but not chased.
