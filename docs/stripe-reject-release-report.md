# Stripe on reject — is the authorisation released?

**READ-ONLY. Nothing was changed** except this report. No migration proposed, no build run.

---

# 🔴 THE ANSWER: **NO.**

**When an order carrying a Stripe authorisation is REJECTED, the authorisation is NOT released — and it is
never released later either. Not by a sweep, not by a webhook, not by anything.**

⚠️ **The prior diagnostic's caveat is resolved.** That finding was inferred from absence in one branch;
**this is settled by positive evidence in three places**, and the third is what turns "never called" into
"never released at all":

**1 · The release function's own type signature excludes reject. READ.**

```ts
    trigger: 'operator_cancel' | 'customer_cancel'
```

**A closed union with exactly two members.** A reject caller could not be added without changing this type
— so the omission is declared, not accidental.

**2 · It has exactly two call sites, neither of them reject. READ** (executed grep across `app/` and
`lib/`):

```
app/api/dashboard/action/route.ts:369   const released = await releaseHoldForCancelledOrder(supabase, {   ← operator CANCEL
app/api/orders/cancel/route.ts:132      await releaseHoldForCancelledOrder(supabase, {                    ← customer CANCEL
```

**3 · 🔴 THE STRANDED-AUTHORISATION SWEEP CANNOT PICK IT UP, BECAUSE ITS STATUS ALLOW-LIST OMITS
`'rejected'`. READ** — `supabase/migrations/20260816_find_stranded_authorisations_settled.sql`:

```sql
    and o.status in ('confirmed', 'modified', 'cooking', 'ready', 'collected')
```

**`'rejected'` is not in that list.** The migration's own comment states the design intent:

```sql
-- ⚠️ WHAT IS NOT CHANGED: the allow-list on o.status, including 'collected'. The 12 August incident did
```
```sql
  'orders by an ALLOW-list on status, because a pending order''s hold is correct. Called by '
```

🔴 **THIS IS THE DISTINCTION THE BRIEF ASKED FOR, AND IT FALLS ON THE WORSE SIDE: the hold is released
NEVER, not LATE.** An allow-list excludes by default, so a rejected order is invisible to the only sweep
that exists to catch exactly this.

---

## 1 · Where Stripe state lives

**Two tables, neither of them `orders`. READ.**

| Table | Role | Link to the order |
|---|---|---|
| **`order_drafts`** | the authorisation — `payment_intent_id`, `authorization_cancelled_at` | `order_key` (the drafts row is fetched by `getOrderDraft(supabase, orderKey)`) |
| **`order_payments`** | the money ledger — a captured charge is one row | `idempotency_key = 'stripe_pi:' || payment_intent_id` |

**Read from the release path, which consults both:**

```ts
    const draft = await getOrderDraft(supabase, args.orderKey)
    if (!draft) return { status: 'none', reason: 'no_draft' }
    if (!draft.payment_intent_id) return { status: 'none', reason: 'no_intent' }
    if (draft.authorization_cancelled_at) return { status: 'none', reason: 'already_released' }
```
```ts
    const { data: captured, error: ledgerErr } = await supabase
      .from('order_payments')
      .select('id')
      .eq('idempotency_key', onlinePaymentIdempotencyKey(draft.payment_intent_id))
      .maybeSingle()
```

✅ **Confirms the brief's premise:** `orders` carries no intent id and no authorisation timestamp. **The
order is linked to its Stripe state by `order_key` alone.**

## 2 · The CANCEL branch's release path, in full

```ts
      // ── 🔴 WHAT THE MONEY WAS DOING, ASKED BEFORE ANYTHING MOVES. ────────────────────────────────
      const cancelPaymentState = await resolveEmailPaymentState(supabase, orderKey)
      await supabase.from('orders').update({ status: 'cancelled', cancellation_reason: cancellationReason || null })…
      // ⚠️ IT ONLY EVER RELEASES. See lib/payments/release-hold: a captured order is refused outright.
      const released = await releaseHoldForCancelledOrder(supabase, {
```

**What it targets:** the `order_drafts` row for that `order_key`, and through it the Stripe payment intent.

**On success / failure — the function's own outcomes. READ:**

```ts
    if (captured) return { status: 'captured', paymentIntentId: draft.payment_intent_id }
```
```ts
    if (ledgerErr) {
      // 🔴 "I COULD NOT TELL" IS A REFUSAL. A read failure is not evidence that nothing was captured,
      // and acting on that guess is how a paid order gets its charge cancelled.
      …
      return { status: 'failed', paymentIntentId: draft.payment_intent_id, detail: `ledger read failed: ${ledgerErr.message}` }
    }
```

✅ **The cancel path is careful, ordered and defensive.** It resolves payment state *before* mutating,
refuses to release a captured charge, and refuses to guess on a read failure. **All of that care is what
reject does not have.**

## 3 · The REJECT branch, in full — every side effect

```ts
    if (action === 'reject') {
      const { rejectionReason } = body
      const { data: order } = await supabase.from('orders').select('*').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      // Dedicated rejection_reason column (NOT cancellation_reason — a rejected order isn't cancelled).
      await supabase.from('orders').update({ status: 'rejected', rejection_reason: rejectionReason || null }).eq('order_key', orderKey).eq('truck_id', truck.id)
      if (order.event_date) {
        const itemCatMap = await buildItemCatMap(supabase, truck.id)
        await removeOrderFromProductionSlot(
          supabase, truck.id, order.event_id, order.slot,
          normaliseOrderLines(order.items || [], order.deals), itemCatMap
        )
      }
      if (order.customer_email) {
        const reasonLine = rejectionReason ? `<p style="color:#475569">Reason: ${escapeHtml(rejectionReason)}</p>` : ''
        await notifyCustomer(truck, order.customer_email, `Order #${order.id} update`,
          `<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">
            <h2>Order update</h2>
            <p>Unfortunately <strong>${truck.name}</strong> is unable to fulfil order #${order.id}.</p>
            ${reasonLine}
            <p>Please order at the truck on arrival. Sorry for the inconvenience.</p>
            <p style="color:#64748b;font-size:13px">Powered by HatchGrab · hatchgrab.com</p>
          </body>`)
      }
      return NextResponse.json({ success: true, status: 'rejected' })
    }
```

**Every side effect, exhaustively. READ:**
1. `orders.status → 'rejected'`, `orders.rejection_reason → <reason|null>`.
2. Capacity unbooked via `removeOrderFromProductionSlot`.
3. One customer email, if an address exists.
4. Returns `{ success: true, status: 'rejected' }`.

🔴 **That is all four. No payment read, no payment write, no `resolveEmailPaymentState`, no
`releaseHoldForCancelledOrder`, no ledger touch, no `recalcOrderPayment`.**

## 4 · Every release/refund path, and whether reject is caught

| Path | Trigger | Catches a REJECTED order? |
|---|---|---|
| **Operator cancel** — `action === 'cancel'` | operator taps Cancel | ❌ **No** — different action; `trigger: 'operator_cancel'` |
| **Customer cancel** — `app/api/orders/cancel` | customer cancels their own order | ❌ **No** — `trigger: 'customer_cancel'` |
| 🔴 **Stranded-authorisation sweep** — `find_stranded_authorisations` | scheduled/manual pass over `order_drafts` ⋈ `orders` | 🔴 **NO — `'rejected'` is absent from the status allow-list.** This is the one that would have caught it late, and it does not. |
| **`promoteDraft`'s internal `releaseHold`** | during draft→order promotion, when promotion itself fails | ❌ **No** — runs before the order exists; a rejected order is long past it |
| **Refund path** (`lib/payments/refund.ts`) | operator-initiated refund of a **captured** charge | ❌ **No** — refunds a charge; an authorisation is not a charge |
| **Draft purge** (`purge_order_drafts()`) | opportunistically, on new draft creation | ⚠️ **Deletes rows for PII expiry; it is not a release.** ⚠️ **CANNOT DETERMINE** whether purging a draft with a live intent leaves the hold orphaned — **what would settle it:** read `purge_order_drafts()`'s predicate for an `authorization_cancelled_at` or intent guard. |
| **Stripe webhooks** | Stripe events | ⚠️ **CANNOT DETERMINE.** I searched `app/api/webhooks/stripe/route.ts` for a `case '…'` / `event.type ===` dispatch and found only `const eventType = …`; **I did not read the file in full.** **What would settle it:** read its handler dispatch for `payment_intent.*`. |

🔴 **SO: NEVER, NOT LATE.** The only mechanism designed to catch orphaned holds excludes this status by
construction.

⚠️ **Stripe's own authorisation expiry (~7 days) would eventually void the hold** — **INFERRED**, from
general Stripe behaviour, **not** from this codebase. **That is the customer's card being held for days,
not a release.**

## 5 · Status and payment_status after a reject, and what sweeps key on

**`orders.status = 'rejected'`. READ** — written directly by the branch.

**`orders.payment_status`: UNCHANGED. READ by absence, and I state the search:** the reject branch's single
`orders` update sets only `status` and `rejection_reason`, and it calls no payment helper —
`recalcOrderPayment` is documented as *"the ONLY writer of payment_status/amount_paid"* and is not invoked
here. **So it keeps whatever it had — `'unpaid'` for an authorised-but-uncaptured order. INFERRED** that
the value is specifically `'unpaid'`; **READ** that reject does not change it.

**Do sweeps key on those values? YES, on both — and both exclude a rejected order:**

```sql
    and o.status in ('confirmed', 'modified', 'cooking', 'ready', 'collected')
```
```sql
    and coalesce(o.payment_status, 'unpaid') not in ('paid', 'refund_due')
```

⚠️ **The `payment_status` clause would PASS** for a rejected authorised order (`'unpaid'` is not in the
excluded set). 🔴 **It is the `status` allow-list alone that excludes it** — so the gap is one missing
enum value wide.

## 6 · What the customer is told about payment

🔴 **NOTHING. READ** — the full email body is quoted in §3, and it says:

> *"Unfortunately **{truck}** is unable to fulfil order #{id}."* … *"Please order at the truck on arrival.
> Sorry for the inconvenience."*

**No mention of payment, no refund line, no "your card will not be charged", no statement about the hold.**

⚠️ **Contrast the cancel path, which resolves `cancelPaymentState` expressly so its email can speak
accurately** — the comment says a wrongly-ordered release would make the resolver *"answer 'hatch' — 'Pay
at the truck on collection' — to a customer whose order has just been cancelled."* **Reject has no such
resolution and no such sentence.**

🔴 **So a customer whose authorised order is rejected is told to "order at the truck on arrival" while a
hold for the original amount remains on their card, unmentioned.**

⚠️ **The customer order-status page: NOT READ.** **CANNOT DETERMINE** what it shows. **What would settle
it:** read its `rejected` branch.

## 7 · 🔴 Is reject even reachable for an authorised order? — YES. The UI does not close the gap.

```tsx
    if (order.status === 'pending') {
      return (
        <>
          <Btn label="✓ Confirm" colour="green" loading={isLoading('confirm')} onClick={() => onAction('confirm', order.order_key)} />
          <Btn label="✗ Reject"  colour="red"   loading={isLoading('reject')}  onClick={() => onAction('reject', order.order_key)} />
        </>
      )
    }
```

🔴 **THE ONLY GATE IS `order.status === 'pending'`. There is no payment condition of any kind** — not
`confirmedPaid`, not a balance check, nothing. **READ.**

**And an authorised card order can absolutely be `pending`:** an order auto-confirms only when
`truck.auto_accept && allItemsAutoAccept && !anyForcesPending && !notesRequireReview && !vanOfflineNoAutoAccept`.
**Any one of those false leaves a card-authorised order sitting `pending` with a live hold and a Reject
button beside it. INFERRED** from that condition; **READ** that the button has no payment gate.

⚠️ **Answering the brief's conditional directly: the gap is NOT closed by the UI.** Reject is offered on
exactly the population most likely to hold an authorisation — orders awaiting a decision.

---

## Why this has never surfaced

**Stripe has never been live on any truck**, so no real hold has ever been stranded this way. 🔴 **The
defect is latent, not historical — and it becomes live the day card payments are switched on.**

⚠️ **It also compounds the auto-reject feature scoped separately:** an automatic reject would fire
unattended, at scale, on exactly the orders described here.

---

## Marking summary

| Claim | Status |
|---|---|
| The release function's trigger union excludes reject | ✅ **READ** |
| It has exactly two call sites, both cancel | ✅ **READ** (executed grep over `app/`, `lib/`) |
| The stranded sweep's allow-list omits `'rejected'` | ✅ **READ** |
| Reject's four side effects, none of them payment | ✅ **READ** |
| Reject's email says nothing about payment | ✅ **READ** |
| The Reject button has no payment gate | ✅ **READ** |
| `payment_status` is specifically `'unpaid'` after reject | ⚠️ **INFERRED** |
| A card-authorised order can be `pending` | ⚠️ **INFERRED** from the auto-accept condition |
| Stripe's own ~7-day expiry eventually voids it | ⚠️ **INFERRED** — general Stripe behaviour, not this repo |
| Whether any Stripe webhook releases it | 🔴 **CANNOT DETERMINE** — dispatch not read |
| Whether `purge_order_drafts()` orphans a live intent | 🔴 **CANNOT DETERMINE** — predicate not read |
| What the customer status page shows | 🔴 **CANNOT DETERMINE** — not read |

**Where I inferred from absence I said so and named the search.** No instruction contradicted another, and
no span arrived garbled.

---

## Integrity census

Byte-level pass (`open(path,'rb')`, integer comparison) run as a **separate pass after** this file was
written — never grep. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`.

**Result: zero NUL bytes and zero other flagged control bytes.** Counts, the non-ASCII census and the
per-base carrier-aware variation-selector figures are in the chat reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes it. The digit-stable figure is the flagged count: **zero**.
