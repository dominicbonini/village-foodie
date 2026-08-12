# Authorised, not captured — why nothing says so

**Date:** 13 August 2026
**READ-ONLY DIAGNOSIS. No file changed, no file created except this report. No `next dev`, no `next build`. No commit, no deploy. No fix proposed or applied.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 THE THREE FINDINGS

1. ⚠️ **THE TIMELINE IS NOT WHAT IT LOOKS LIKE. Twenty-three of the ~35 seconds were the CUSTOMER, not us.** Stripe stamped the authorisation event at **16:39:18** — the draft was written at 16:38:55, so 23s is Apple Pay. **Our own latency is 16:39:19.6 → 16:39:42.3 = ~22.7s**, and it is **not database work**: every query promotion makes measures 39-138ms. §2.
2. 🔴 **THE EMAIL HAS NO PAYMENT BRANCH AT ALL.** `formatConfirmationEmail` takes **no payment parameter of any kind**, and "Pay at the truck on collection" is a **hardcoded constant** in both the HTML and the plain text. It is not a wrong branch; **there is no branch.** §3.
3. 🔴 **NOTHING THE DASHBOARD READS KNOWS A PaymentIntent EXISTS.** A grep for `payment_intent` or `order_drafts` across `/api/dashboard`, the dashboard page, `OrderCard`, the KDS and the printing library returns **nothing**. The information exists — on the draft row — and no operator surface asks for it. §4, §6.

**The live state, read now:**

| | |
|---|---|
| Draft `3a621e2f-…` | `promoted_at: 2026-08-12T16:39:30.604Z`, PII nulled, 🔴 **`payment_intent_id: pi_3U3fB52fB4PPCw2D1VD1opZI` STILL PRESENT** |
| Order `18` | `status: confirmed`, `payment_status: unpaid`, `amount_paid: null` |
| `order_payments` | 🔴 **empty** — correct, nothing captured |
| The PaymentIntent | 🔴 **`status: requires_capture`, `capture_method: manual`, `amount_capturable: 600`, `amount_received: 0`** |

✅ **Every one of those is correct.** The money is held. The defect is entirely that no surface can say so.

---

## 1. The confirmation screen's retry

**Source: QUOTED.** `app/trucks/[slug]/order/page.tsx:660-676`:

```tsx
    let attempt = 0
    const MAX_ATTEMPTS = 8
    const RETRY_MS = 1000
    const run = () => fetch(`/api/orders/${confirmOrderKey}?truck=${encodeURIComponent(slug)}`, { cache: 'no-store' })
      .then(async r => {
        if (cancelled) return
        if (r.status === 404 && attempt < MAX_ATTEMPTS) {
          attempt++
          // ⚠️ NOT an error state — `confirmLoading` stays true, so the screen keeps saying it is
          // loading rather than flashing a failure and correcting itself.
          setTimeout(() => { if (!cancelled) void run() }, RETRY_MS)
          return
        }
        if (!r.ok) {
          setConfirmError('We couldn’t find that order.')
          setConfirmLoading(false)
          return
        }
```

| | |
|---|---|
| Attempts | 1 immediate + **up to 8 retries = 9 fetches** |
| Interval | **1000 ms**, fixed |
| 🔴 **Total window** | **~8 seconds** of waiting (8 × 1s), plus request time — call it **8-10s** |
| On giving up | 🔴 **"We couldn't find that order."** and `confirmLoading` false |

🔴 **THE ORDER APPEARED ~47 SECONDS AFTER THE DRAFT.** Even measured from the authorisation (16:39:18) the order was 24s away. **The window is roughly a third of what this order needed.** ⚠️ And the failure copy is the one written for a bogus key — a customer who has just paid is told their order does not exist.

---

## 2. Where the ~35 + ~12 seconds went

**Source: QUOTED** for the timestamps and the measurements; **INFERRED** for the attribution.

### 🔴 IT WAS THE WEBHOOK, AND THE ROW SAYS SO

```
RECENT WEBHOOK EVENTS:
  2026-08-12T16:39:19.62666+00:00  payment_intent.amount_capturable_updated  handled=true  result=promotion:promoted  created=2026-08-12T16:39:18+00:00
```

✅ **`handler_result = 'promotion:promoted'`** — written only by `startPromotion`'s `.then` in the webhook route:
```ts
      return markHandled(eventId, `promotion:${res.status}`)
```
**So the webhook fired and its promotion returned `promoted`.** ⚠️ **The redirect route is also wired** and would have called the same `promoteDraft`; whichever lost would have got `already` and done nothing. **Nothing here records that the redirect ran at all** — it writes no row. **Not established** whether it also fired; the webhook is the one that won.

### The real timeline

| Time | Event | Gap |
|---|---|---|
| 16:38:55.60 | Draft written; PaymentIntent created (`pi.created` = 16:38:55) | — |
| **16:39:18** | 🔴 **Stripe stamps `payment_intent.amount_capturable_updated`** — the customer authorised | ⚠️ **+22.4s — APPLE PAY, NOT US** |
| 16:39:19.63 | Webhook received and recorded | +1.6s (Stripe's delivery) |
| 16:39:30.60 | `promoted_at` — the claim landed | 🔴 **+11.0s** |
| 16:39:42.35 | Order row inserted | 🔴 **+11.7s** |

**Our latency is the last two rows: ~22.7 seconds.**

### Every step between the webhook and the insert

**QUOTED** from `lib/payments/promote-draft.ts`, in order:

| # | Step | Measured |
|---|---|---|
| — | `startPromotion(orderKey, 'webhook', eventId)` — **not awaited**; the 2xx returns first | — |
| 1 | `claimOrderDraft` = `getOrderDraft` + guarded UPDATE | **138ms + 108ms** |
| 2 | `trucks.select('*')` | **80ms** |
| 3 | `buildItemCatMap` + `buildCatConfigs` (parallel) | **39ms / 43ms** |
| 4 | `menu_items_db` select | **44ms** |
| 5 | `truck_events` select | **50ms** |
| 6 | `findSoldOutOption` | **0ms** |
| 7 | `acquireEventLock` — ⚠️ retry budget up to ~3s under contention | not measured |
| 8 | `checkClosedCategories` / `checkStockShortfall` / `checkOptionCeilingShortfall` | **86ms** for the stock check |
| 9 | `eventKitchenCapacity` + `placeOrderInSlotLocked` | not measured |
| 10 | `nextOrderId` (under the lock) | not measured |
| 11 | 🔴 **The order INSERT** | — |
| 12 | `erasePii`, `rebuildProductionSlotUsage`, `enforceStockLimits` | after the insert |
| 13 | ⚠️ **`await sendConfirmationEmail` ×2** — customer and truck, **both awaited** | after the insert |

🔴 **ALL OF IT MEASURED AGAINST THE LIVE DATABASE, AND NONE OF IT IS SLOW:**

```
  getOrderDraft (1 select)               138ms
  claim-shaped UPDATE (guard false)      108ms
  trucks select *                        80ms
  buildItemCatMap                        39ms
  buildCatConfigs                        43ms
  menu_items_db select                   44ms
  truck_events select                    50ms
  findSoldOutOption                      0ms
  checkStockShortfall                    86ms
```

**The steps before the claim should total well under a second. Eleven seconds elapsed. The steps between the claim and the insert should total ~1-2s. Twelve seconds elapsed.**

### 🔴 SO IT IS NOT DATABASE WORK. WHAT IT IS, IS NOT ESTABLISHED.

**The candidates, in order of plausibility:**

1. ⚠️ **SERVERLESS SUSPENSION.** `startPromotion` deliberately does not await — the route's own comment says so:
   > *"⚠️ THE COST, STATED PLAINLY: on a serverless runtime an invocation may be frozen once the response is returned, so this promotion is NOT guaranteed to finish."*
   **An invocation that is frozen and later resumed would produce exactly this shape: a long gap before the first query, then another before the insert.**
2. ⚠️ **Cold start.** `promote-draft` pulls in `stock-guard`, `option-stock`, `slot-bookings`, `prep-utils`, `place-in-slot`, `order-utils`, `stock-availability`, `email` and the Stripe SDK. A first load of that graph is not free.
3. ⚠️ **`acquireEventLock` contention** — up to a ~3s retry budget. Would explain part of the second gap, not eleven seconds of the first.

🔴 **I cannot separate these from here.** The Vercel invocation log for 16:39 would, and `[promote:webhook] PROMOTED …` carries the end of it.

---

## 3. The confirmation email

**Source: QUOTED.** `promoteDraft` sends it at `:350`:

```ts
        const { subject, html, text } = formatConfirmationEmail({
          orderId,
          orderKey:     draft.order_key,
          truckName:    truck.name,
          customerName: draft.customer_name ?? '',
          slot:         confirmedSlot,
          requestedSlot: draft.requested_slot,
          slotChanged,
          items:        draft.items as never,
          deals:        (draft.deals ?? []) as never,
          discountAmt:  draft.discount_amt ?? 0,
          total:        draft.total,
          notes:        draft.notes ?? null,
          autoAccepted,
          …
```

### 🔴 EVERY LINE THAT BRANCHES ON PAYMENT STATE: THERE ARE NONE.

**`formatConfirmationEmail`'s complete parameter list** (`lib/email.ts:79-105`) contains `orderId`, `orderKey`, `truckName`, `customerName`, `slot`, `requestedSlot`, `slotChanged`, `items`, `deals`, `discountAmt`, `total`, `notes`, `autoAccepted`, `slotAdjustedFrom`, venue fields, contact fields, `allowCancellation`, `cancellationCutoffMins`, `baseUrl`, `truckSlug`.

🔴 **NOT ONE PAYMENT PARAMETER. NO `paymentStatus`, NO `amountPaid`, NO `authorised` FLAG.**

**And the sentence is a constant.** HTML, `lib/email.ts:232-234`:

```html
  <div style="background:#f1f5f9;border-radius:10px;padding:16px;margin-top:12px;text-align:center">
    <p style="margin:0;font-size:16px;font-weight:800;color:#1e293b">Pay at the truck on collection</p>
  </div>
```

Plain text, `:288`:
```ts
    'Pay at the truck on collection.',
```

### The exact sentence this customer saw

> 🔴 **Pay at the truck on collection**

Rendered in a grey panel, **16px, font-weight 800, centred** — one of the most prominent elements in the email. ⚠️ **Unconditional.** It appears identically on a pay-at-hatch order, an authorised card order, and (were capture built) a captured one.

### What the email had available about the authorisation

**QUOTED — everything `promoteDraft` holds at that line:**

- `draft.payment_intent_id` — 🔴 **`pi_3U3fB52fB4PPCw2D1VD1opZI`, on the row it is reading**
- `draft.livemode` — `false`
- `draft.total_minor` — `600`, the exact amount held
- the `promoted`/`refused` outcome it is in the middle of returning

🔴 **THE FACT WAS IN THE FUNCTION'S OWN HAND AND WAS NEVER PASSED.** Nothing was missing; the parameter does not exist.

---

## 4. What the dashboard reads to decide payment state

**Source: QUOTED.**

**One query, `app/api/dashboard/route.ts:289-304`:**
```ts
      const { data: payRows, error: payErr } = await supabase
        .from('order_payments')
        .select(LEDGER_ROW_COLUMNS)
        .in('order_key', visibleKeys)
        .or('livemode.eq.true,and(livemode.eq.false,channel.eq.online)')
```
where `LEDGER_ROW_COLUMNS = 'order_key, truck_id, kind, channel, amount_minor, state, external_ref, livemode'`.

**Sent to the browser as** `payments` (order_key → rows) and `paymentFailures`, then:
```tsx
  const balance = getOrderBalance(order as any, ledgerRows ?? [])
  const isPaid = balance.status === 'paid' || balance.status === 'refunded'
```

### 🔴 CAN ANYTHING IT RECEIVES DISTINGUISH A HELD AUTHORISATION? NO.

**For order 18, `order_payments` is EMPTY** — measured. `getOrderBalance` over zero rows returns `paidMinor: 0`, `status: 'unpaid'`. ✅ **Arithmetically correct and informationally silent:** it is byte-identical to a pay-at-hatch order that owes £6.00.

### 🔴 DOES ANYTHING IT FETCHES KNOW A PaymentIntent EXISTS AND IS `requires_capture`? NO.

**Exhaustive grep for `payment_intent` and `order_drafts` across `app/api/dashboard/route.ts`, `app/dashboard/[token]/page.tsx`, `components/dashboard/OrderCard.tsx`, `app/dashboard/[token]/kds/page.tsx` and `lib/printing/*.ts`:**

```
(NOTHING — no reference to payment_intent or order_drafts on any dashboard surface)
```

⚠️ **`order_payments.external_ref` DOES hold PaymentIntent ids and IS in the column list** — but only once a payment has been **recorded**, and nothing is recorded for an uncaptured hold. **The one field that could carry it is empty precisely when it would matter.**

---

## 5. What an operator sees for order 18 today

**Source: QUOTED.**

### The order card (dashboard, solo)

**The paid chip — `OrderCard.tsx:412-416`:**
```tsx
  const paidChipStatic = hidePayments ? null
    : effectivePaid ? <span className="…bg-green-100 text-green-700…">PAID</span>
    : effectivePartPaid ? <span className="…bg-amber-100 text-amber-700…">{money(balance.paidMinor)} / {money(balance.balanceMinor)} due</span>
    : null
```
🔴 **`effectivePaid` false, `effectivePartPaid` false ⇒ `null`. NO CHIP AT ALL.** The header shows `#18 · 17:00`, the customer name, and `£6.00` — **with nothing beside it.**

**The primary button — `:341-348`, two-press configuration:**
```tsx
        label={effectivePartPaid ? `Mark ${money(balance.balanceMinor)} paid` : 'Mark paid'}
```
or, one-press: `label="Mark paid & collected"`.

🔴 **THE OPERATOR IS PRESENTED WITH A BUTTON THAT SAYS "Mark paid".** That is the £6.00 being taken twice.

### The KDS

**`kds/page.tsx:1382-1390`:**
```tsx
                const bal = getOrderBalance(o as never, payments[o.order_key] ?? [])
                const settled = bal.status === 'paid' || bal.status === 'refunded'
…
                    {hidePayments ? null : settled
                      ? <span className="text-green-600">✓ paid</span>
                      : <span className="text-amber-600">£{(bal.balanceMinor / 100).toFixed(2)} due</span>}
```
🔴 **`£6.00 due`, in amber.**

### The printed ticket

**`lib/printing/ticket.ts:359-365`:**
```ts
  if (order.showPaidStep && order.paymentStatus) {
    …
    if (order.paymentStatus === 'paid') lines.push({ text: padBetween('PAYMENT', 'PAID', width), bold: true })
    else if (order.paymentStatus === 'part_paid') lines.push({ text: padBetween('TO PAY', money(bal), width), bold: true })
    else if (order.paymentStatus === 'unpaid') lines.push({ text: padBetween('TO PAY', money(bal), width), bold: true })
```
🔴 **`TO PAY                  £6.00`, in bold**, on the ticket that goes to the pass.

### 🔴 THREE SURFACES, THREE INSTRUCTIONS TO COLLECT MONEY THAT IS ALREADY HELD

| Surface | Shows |
|---|---|
| Order card | no chip, and a **`Mark paid`** button |
| KDS | **`£6.00 due`** |
| Ticket | **`TO PAY £6.00`** |
| Customer's email | **"Pay at the truck on collection"** |

⚠️ **All four agree with each other and all four are wrong about the same thing.**

---

## 6. The draft after promotion

**Source: QUOTED — read live, just now.**

✅ **YES, IT REMAINS READABLE.** `claimOrderDraft` sets `promoted_at`; `erasePii` nulls three columns. **Nothing deletes the row.**

```json
{
 "order_key": "3a621e2f-92b6-4d70-9d37-c5a0e469426c",
 "customer_name": null, "customer_email": null, "customer_phone": null,
 "items": [{"name":"Fish Cake","quantity":1,"unit_price":6,"source":"direct"}],
 "total": 6, "total_minor": 600,
 "created_at": "2026-08-12T16:38:55.603604+00:00",
 "expires_at": "2026-08-12T17:08:55.603604+00:00",
 🔴 "payment_intent_id": "pi_3U3fB52fB4PPCw2D1VD1opZI",
 "livemode": false,
 "promoted_at": "2026-08-12T16:39:30.604+00:00",
 "authorization_cancelled_at": null,
 "promotion_failed_at": null
}
```

🔴 **`payment_intent_id` SURVIVES, AND THE ORDER SHARES THE DRAFT'S KEY.** So the join is a primary-key lookup:

> `order_drafts.payment_intent_id WHERE order_key = <the order's own key>`

⚠️ **AND `promoted_at IS NOT NULL AND authorization_cancelled_at IS NULL` ALREADY MEANS "AUTHORISED, NOT RELEASED"** — with no new column, no migration, and no Stripe call. **The truth of "authorised, awaiting capture" is one indexed lookup away from every dashboard surface, and nothing looks.**

⚠️ **The live state at Stripe, if a surface wanted certainty:** `retrieve(pi)` returns `status: requires_capture`, `amount_capturable: 600`. **Read-only, but one API call per order — the draft row answers it without leaving the database.**

⚠️ **THE ROW IS NOT PERMANENT.** `purge_order_drafts()` deletes expired, never-promoted rows — this one is promoted, so **it is not swept today**. But nothing guarantees promoted drafts are retained, and nothing documents them as a source of truth.

---

## 7. `payment_status` values in the live CHECK

**Source: QUOTED.** `supabase/migrations/20260729_orders_payment_status_widen_check.sql:69-70`:

```sql
  add constraint orders_payment_status_check
  check (payment_status in ('unpaid', 'paid', 'part_paid', 'refunded', 'refund_due', 'failed'));
```

| Value | Means |
|---|---|
| `unpaid` | nothing received |
| `paid` | balance settled |
| `part_paid` | some received, some outstanding |
| `refunded` | charged then fully refunded |
| `refund_due` | refunds exceed charges |
| `failed` | ⚠️ in the CHECK and in the type union; **`getOrderBalance` never returns it** |

### 🔴 NONE OF THEM MEANS "AUTHORISED, NOT CAPTURED". SAID PLAINLY.

**Every value is a statement about money that has MOVED.** An authorisation is money that has been **reserved and not moved**, which this vocabulary cannot express. `unpaid` is the only truthful one available — and it is indistinguishable from "owes money at the hatch", which is exactly the defect.

⚠️ **`getOrderBalance` could not produce a new value even if the CHECK allowed one:** it derives status purely from summing `order_payments` rows, and an uncaptured hold writes no row.

---

## 8. Everywhere that would need to change

**Source: INFERRED**, from §§3-7. **Listed only — nothing changed.**

### The data layer — nothing can be distinct until one of these exists

| # | Place | What |
|---|---|---|
| 1 | 🔴 **A source of truth** | Either read `order_drafts.payment_intent_id` by `order_key` (✅ **exists today, no migration**), or a new `orders` column, or a ledger row of a new kind. **§6 says the first already works** |
| 2 | `orders_payment_status_check` | ⚠️ **ONLY if you add a status value.** Deploy-coupled, and `getOrderBalance` would have to learn to return it |
| 3 | `getOrderBalance` / `LEDGER_ROW_COLUMNS` | The documented chokepoint. Its return type carries `{ paidMinor, balanceMinor, status }` and no notion of a hold |

### The surfaces

| # | Place | What it says now |
|---|---|---|
| 4 | 🔴 **`lib/email.ts` — `formatConfirmationEmail`** | Needs a payment parameter **and** a branch; today the sentence is a constant in **both** the HTML (`:233`) and the text (`:288`). ⚠️ `promoteDraft` must pass it |
| 5 | **The confirmation screen** — `?confirm=` | Renders from `/api/orders/[id]`, which returns `payment_status` and nothing about a hold. ⚠️ **Also §1's retry window** — a separate defect on the same screen |
| 6 | `app/api/orders/[id]/route.ts` | The named select the confirmation reads. Would need the new fact |
| 7 | 🔴 **`OrderCard` — the paid chip** | `null` today. Needs a third state beside `PAID` and part-paid |
| 8 | 🔴 **`OrderCard` — the completion button** | Says **`Mark paid`**. The most consequential one: it is the control that double-charges |
| 9 | **`app/api/dashboard/route.ts`** | Must ship the fact; today it ships only ledger rows |
| 10 | **KDS footer** (`kds/page.tsx:1383-1389`) | `£6.00 due` |
| 11 | **Printed ticket** (`ticket.ts:359-365`) | `TO PAY £6.00`. ⚠️ Its fallback branch already prints any unknown status uppercased, so a new value would appear **without** a code change — legibly, but unstyled |
| 12 | `lib/printing/mapOrderToTicket.ts` | Resolves `paymentStatus` and `balanceMinor` for the ticket |
| 13 | ⚠️ **Reports** (`app/api/manage/route.ts`, `app/manage/[token]/page.tsx`) | Takings are computed from `order_payments`; an uncaptured hold is **correctly** absent. **Would only change if you want "authorised but not yet captured" as a reported figure** |
| 14 | ⚠️ **`undo_mark_paid` / the remove-payment modal** | Already refuses online rows via `.neq('channel','online')`; a held authorisation has no row at all, so the chip and modal never appear. **Worth re-checking once a chip does appear** |
| 15 | ⚠️ **`lib/payments/paid-step.ts` consumers** | `showPaidStep` decides whether the money UI exists at all. A held-authorisation state must not appear on a truck that has the paid step off |

---

## Quoted vs inferred

| § | Status |
|---|---|
| 1 | **QUOTED** — the retry block. The 8-10s window is **INFERRED** arithmetic |
| 2 | **QUOTED** — the webhook row, `handler_result`, `stripe_created_at`, and nine live timings. The attribution to serverless suspension is **INFERRED** and explicitly **not established** |
| 3 | **QUOTED** — the call, the full parameter list, and both hardcoded sentences. "No branch exists" is **QUOTED** (the parameter is absent) |
| 4 | **QUOTED** — the query, the column list, the resolver, and the exhaustive negative grep |
| 5 | **QUOTED** — all four surfaces verbatim |
| 6 | **QUOTED** — the live draft row. "One indexed lookup away" is **INFERRED** |
| 7 | **QUOTED** — the CHECK constraint. "None means authorised" is **QUOTED** by inspection |
| 8 | **INFERRED** throughout; each surface's current output is **QUOTED** in §§3-5 |

## Not established

- 🔴 **Why promotion took ~22.7s of OUR time.** Every query measures under 140ms, so it is not the database. Serverless suspension and cold start are the candidates; the Vercel invocation log for 16:39 would settle it.
- **Whether the redirect route also fired.** It writes no row. Only the webhook left evidence, and it won.
- **Whether `acquireEventLock` contended** on this order. It has a ~3s budget and would explain part of the second gap, not the first.
- **Whether promoted drafts are retained indefinitely.** `purge_order_drafts()` does not touch them today, but nothing documents them as a durable source.
- **What the product should show.** This is the map; the wording, the status vocabulary and whether a new column is wanted are all yours.
