# Cancelling an event never refunds captured money — a feasibility diagnosis

READ-ONLY. **No file was edited, nothing was committed, no build was run, no deploy, no database
write, no database read, no Stripe call.** `lib/payments/` was read and quoted and **not touched**.
`git status` is in G4. **Nothing is proposed outside Part F.**

**No span of the prompt arrived garbled, and no instruction contradicted another.**

Dashboard, KDS and manage are reported **separately**. Every claim is marked **READ** or **INFERRED**.

Read first, in full: **§37 of the reference manual** (lines 9322–10571), `docs/event-cancel-holds-report.md`,
`docs/overlay-fixes-report.md`.

---

# 🔴 THE ANSWER, BEFORE THE EVIDENCE

**Confirmed, and the framing in the brief is right: captured money is the worse case.** The event-cancel
branch makes **no payment call of any kind** — the same absence the holds report established — so it
strands releases *and* never refunds captures. A hold self-heals in about seven days; **a capture never
comes back.**

🔴 **AND THE EXPOSURE IS WIDER THAN THE HOLDS ONE, FOR A REASON THE BRIEF NAMES CORRECTLY.** Capture
follows **confirmation**, so every order an operator has already accepted has had its money taken. The
holds report's population was *unconfirmed card orders*; this one's is **every confirmed card order on
the event** — the normal case.

✅ **The build is smaller than it looks, and the reason is that the hard part is already written.**
`refundOrder` is a complete, guarded, idempotent, audited entry point that already computes *what was
actually captured* from the ledger and *what has already gone back* from Stripe. **It needs no change
to be called in a loop.** What does not exist is the **per-order decision** — carrying it from a
checkbox to the endpoint — and the **email sentence for an order cancelled without a refund**.

⚠️ **One correction to the brief's design, offered as a finding rather than an objection.** *"Refund
amount defaults to what was actually captured"* is exactly right and the ledger holds it — **but the
default must be `remainingMinor`, not `capturedMinor`**, or an order already part-refunded is
pre-filled with more than can legally be sent. The distinction is B2 and F3.

---

# PART A — WHAT ALREADY EXISTS

## A1. `refundOrder` — the entry point, quoted

**READ** — `lib/payments/refund.ts:111-163`, the signature and every guard:

```ts
export async function refundOrder(
  supabase: SupabaseClient,
  args: {
    orderKey: string
    truckId: string
    /** Minor units, POSITIVE. The UI's figure is a suggestion; the guards below decide. */
    amountMinor: number
    reason: RefundReason
    note: string | null
    actor: Pick<ResolvedActor, 'actorKind' | 'actorId' | 'actorLabel'>
    source: 'web' | 'native' | 'offline_replay'
  },
): Promise<RefundOutcome> {
  const account = await stripeAccountForTruck(supabase, args.truckId)
  if (!account) {
    return { status: 'failed', detail: 'This truck has no Stripe account, so nothing can be refunded from here.' }
  }
  const stripe = new Stripe(stripeSecretKey())
  …
  // ── 🔴 THE GUARDS. SERVER-SIDE, IN THIS ORDER, AND NONE OF THEM READS THE REQUEST. ───────────────
  if (!refundable.paymentIntentId || refundable.capturedMinor <= 0) {
    return { status: 'refused', reason: 'not_card', remainingMinor: 0,
      detail: 'Nothing was taken by card on this order, so there is nothing to refund here.' }
  }
  if (!Number.isInteger(args.amountMinor) || args.amountMinor <= 0) {
    return { status: 'refused', reason: 'invalid_amount', remainingMinor: refundable.remainingMinor,
      detail: 'Enter an amount greater than zero.' }
  }
  if (args.amountMinor > refundable.remainingMinor) {
    return { status: 'refused', reason: 'exceeds_remaining', remainingMinor: refundable.remainingMinor,
      detail: refundable.remainingMinor === 0
        ? 'This order has already been fully refunded.'
        : `Only £${(refundable.remainingMinor / 100).toFixed(2)} is left to refund on this order.` }
  }
```

**What it returns — READ, `:66-74`, a closed union with four arms:**

```ts
export type RefundOutcome =
  /** Money has gone back and the ledger row is written. */
  | { status: 'refunded'; refundId: string; amountMinor: number; balance: OrderBalance | null }
  /** 🔴 STRIPE HAS ACCEPTED IT AND THE MONEY HAS NOT MOVED YET. No ledger row, by design. */
  | { status: 'pending'; refundId: string; amountMinor: number }
  /** A guard said no. Nothing was sent to Stripe. */
  | { status: 'refused'; reason: 'not_card' | 'invalid_amount' | 'exceeds_remaining'; detail: string; remainingMinor: number }
  /** Stripe or the network failed. Whether money moved is stated in `detail`. */
  | { status: 'failed'; detail: string }
```

**The idempotency key — READ, `:165-171`:**

```ts
  // ── 🔴 THE IDEMPOTENCY KEY, AND WHY IT CARRIES THE REFUNDED-SO-FAR FIGURE ────────────────────────
  // A STATE-TRANSITION key, the same shape collectIdempotencyKey uses: "from this refund position, send
  // this amount". A double-tap repeats it and Stripe returns the SAME refund rather than making a second.
  // A genuine second refund is measured from a moved position, so it keys differently.
  // ⚠️ IT IS BUILT FROM STRIPE'S FIGURE, NOT OURS, WHICH IS WHAT MAKES IT SAFE DURING A PENDING REFUND —
  // the position moves the moment Stripe accepts, not when the money lands.
  const idempotencyKey = `op_refund:${args.orderKey}:${refundable.refundedMinor}:${args.amountMinor}`
```

**The audit row — READ, `:210-238`, written for every outcome including pending:**

```ts
  const settled = refund.status === 'succeeded'
  await logAction(supabase, {
    action: settled ? 'refund_issued' : 'refund_pending',
    truckId: args.truckId,
    orderKey: args.orderKey,
    amountMinor: args.amountMinor,
    beforeState: {
      captured_minor: refundable.capturedMinor,
      refunded_minor_before: refundable.refundedMinor,
      remaining_minor_before: refundable.remainingMinor,
      payment_intent_id: refundable.paymentIntentId,
    },
    afterState: {
      refund_id: refund.id, stripe_status: refund.status,
      stripe_reason: stripeReasonFor(args.reason), reason: args.reason, note: args.note ?? null,
      resolves: settled ? undefined : 'refund_pending',
      meaning: settled
        ? 'the money has gone back to the customer and the ledger row is written'
        : 'Stripe has accepted the refund and the money has NOT moved yet; no ledger row until it settles',
    },
    actor: args.actor, source: args.source,
  })
```

🔴 **AND IT CANNOT THROW PAST ITS GUARDS** — `:108-110`: *"Everything a caller needs to say to an
operator is a return value, so a route can render a refusal without inspecting an exception."* That
property is what makes a loop over dozens of orders feasible at all (C4).

## A2. `releaseHoldForCancelledOrder` — quoted in full

Reproduced in `docs/event-cancel-holds-report.md` A3; the load-bearing parts, **READ** from
`lib/payments/release-hold.ts`:

```ts
export type ReleaseOutcome =
  | { status: 'released'; paymentIntentId: string; amountMinor: number | null }
  | { status: 'none'; reason: 'no_draft' | 'no_intent' | 'already_released' }
  /** 🔴 THE MONEY WAS TAKEN. A refund is the action, not a release, and this refuses to touch it. */
  | { status: 'captured'; paymentIntentId: string }
  | { status: 'failed'; paymentIntentId: string; detail: string }

export async function releaseHoldForCancelledOrder(
  supabase: SupabaseClient,
  args: {
    orderKey: string
    truckId: string
    trigger: 'operator_cancel' | 'customer_cancel'
    actor?: { actorKind: 'owner' | 'staff' | 'token' | 'unknown'; actorId: string | null; actorLabel: string | null }
    source?: 'web' | 'native' | 'offline_replay'
  },
): Promise<ReleaseOutcome> {
  try {
    const draft = await getOrderDraft(supabase, args.orderKey)
    if (!draft) return { status: 'none', reason: 'no_draft' }
    if (!draft.payment_intent_id) return { status: 'none', reason: 'no_intent' }
    if (draft.authorization_cancelled_at) return { status: 'none', reason: 'already_released' }

    const { data: captured, error: ledgerErr } = await supabase
      .from('order_payments').select('id')
      .eq('idempotency_key', onlinePaymentIdempotencyKey(draft.payment_intent_id))
      .maybeSingle()
    if (ledgerErr) { … return { status: 'failed', … } }
    if (captured) return { status: 'captured', paymentIntentId: draft.payment_intent_id }
    …
```

🔴 **THE TWO MODULES PARTITION THE SPACE AND CANNOT COLLIDE, AND THAT IS ALREADY TRUE TODAY.** Release
**refuses** the instant a `stripe_pi:` ledger row exists; refund **refuses** (`not_card`) when
`capturedMinor <= 0`, which is the absence of that same row. **The same one row decides both, in
opposite directions.** No new coordination logic is needed to route an order to the right one —
🔴 **calling both, in either order, is already safe**, because whichever is wrong for that order
returns a no-op status rather than acting.

⚠️ **`trigger` is a closed union of two values** — `'operator_cancel' | 'customer_cancel'` — and an
event cancellation is neither. **That is the one-value widening the holds report identified**, and it
is still the only change release needs.

## A3. `EventCancelModal` and `/api/events/affected-orders`

**READ** — `components/shared/EventCancelModal.tsx`, the props as they stand after the previous task:

```tsx
export function EventCancelModal({
  event, affectedOrderCount, busy = false, onKeep, onConfirm,
}: {
  event: TruckEvent
  affectedOrderCount: number
  busy?: boolean
  onKeep: () => void
  onConfirm: (reason: string, note: string) => void
}) {
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
```

and the only money-adjacent thing it renders:

```tsx
          {affectedOrderCount > 0 && (
            <p className="text-sm font-medium text-red-600 mt-2">
              {affectedOrderCount} order{affectedOrderCount !== 1 ? 's' : ''} will be cancelled and customers notified.
            </p>
          )}
```

**READ** — `app/api/events/affected-orders/route.ts`, in full. 🔴 **It returns a COUNT AND NOTHING
ELSE — not a list, not an order key, not a penny:**

```ts
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('eventId')
  const token = req.nextUrl.searchParams.get('token')
  if (!eventId || !token) return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  const { data: truck } = await supabase.from('trucks').select('id').eq('dashboard_token', token).single()
  if (!truck) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { count, error } = await supabase
    .from('orders').select('id', { count: 'exact', head: true })
    .eq('event_id', eventId).eq('truck_id', truck.id)
    .in('status', ['pending', 'confirmed', 'modified'])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ count: count ?? 0 })
}
```

⚠️ **`head: true` means no rows are transferred at all** — it is a `COUNT(*)`, so widening it is not a
matter of reading more fields off a result that is already there.

⚠️ **AND ITS STATUS LIST DISAGREES WITH THE CANCEL'S.** This counts `['pending','confirmed','modified']`;
the cancel branch acts on `['confirmed','pending']`. **READ**, and §37 records it as a known, deliberate
mismatch: *"the affected-orders count now includes edited orders while that cancel still skips them — so
an edited order is left ORPHANED on a cancelled event."*

## A4. 🔴 What can be reused as-is, and what cannot — this decides the size

| Component | Verdict | What is needed |
|---|---|---|
| **`refundOrder`** | ✅ **AS-IS, no change at all** | Nothing. It takes an order key and an amount, guards both, and returns a closed union. A loop calls it once per ticked row. |
| **`refundableFor`** (inside refund.ts) | ✅ **AS-IS**, but it is **private** | It already computes `capturedMinor` / `refundedMinor` / `remainingMinor`. To show a money summary **before** the loop runs, the endpoint needs those figures — either by exporting this, or by re-deriving them. **Not a change to behaviour; a change to visibility.** |
| **`releaseHoldForCancelledOrder`** | ⚠️ **ONE-WORD WIDENING** | `trigger` gains a third value. Identical to the holds report's finding, unchanged by anything since. |
| **`EventCancelModal`** | ⚠️ **NEEDS A SUMMARY BLOCK AND A SECOND STEP** | It renders one count line. It has no notion of money, no per-order anything, and no step-2 concept. Its structure is friendly to it — `affectedOrderCount` is already a prop supplied by the caller — but the content is new. |
| **`/api/events/affected-orders`** | 🔴 **NEEDS REAL WIDENING** | It is a `COUNT(*)` with `head: true`. A money summary and a per-order list are a different query returning different data. |
| **`app/api/events/action` cancel branch** | 🔴 **NEEDS THE MOST WORK** | It accepts no per-order input, has no payment import, and its loop has no per-item isolation because nothing in it can currently fail (C4). |
| **`sendEventCancellationEmail`** | 🔴 **NEEDS A NEW CASE** | Its only money sentence is gated on `paid_at` and says the truck handles refunds. The fourth case — *cancelled and deliberately not refunded* — does not exist (D3). |

**INFERRED, and it is the headline for sizing: the money engine is done; the decision-carrying is not.**

---

# PART B — THE PER-ORDER STATE

## B1. What determines HELD / CAPTURED / CASH / UNPAID / ALREADY REFUNDED

🔴 **THERE IS NO SINGLE FIELD, AND DELIBERATELY SO.** The state is resolved from **ledger rows** plus
**one draft row**, by two functions.

**CAPTURED / CASH / UNPAID / REFUNDED — READ, `lib/payments/ledger.ts:206-258`**, the chokepoint:

```ts
export function getOrderBalance(order: BalanceableOrder, ledgerRows: LedgerRow[]): OrderBalance {
  const succeeded = (ledgerRows ?? []).filter(r => isLiveRow(r) && r.state === 'succeeded')
  const chargeMinor = succeeded.filter(r => r.kind === 'charge').reduce((s, r) => s + Math.round(r.amount_minor), 0)
  const refundMinor = succeeded.filter(r => r.kind === 'refund').reduce((s, r) => s + Math.round(r.amount_minor), 0)

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
  else if (hasRefundRow) status = 'part_refunded'
  else status = 'part_paid'
  return { paidMinor, balanceMinor, status }
}
```

**CARD versus CASH is the row's `channel`, not the status — READ**, `refundableFor` at `:88-90`:

```ts
  const rows = await readLedger(supabase, orderKey)
  const cardCharges = rows.filter(r => r.kind === 'charge' && r.channel === 'online')
  const capturedMinor = cardCharges.reduce((sum, r) => sum + r.amount_minor, 0)
```

⚠️ **So `status: 'paid'` does not mean refundable.** A cash-paid order is `paid` with zero online
charges and `refundOrder` refuses it as `not_card`. **Any per-order list must branch on the channel,
not on the payment status.**

**HELD — READ, `lib/payments/held-authorisation.ts:41-50`**, a two-table question with four clauses:

```
 *   payment_intent_id IS NOT NULL        an authorisation was created at all
 *   promoted_at IS NOT NULL              the draft became this order (a draft that never promoted has
 *                                        no order to display against)
 *   authorization_cancelled_at IS NULL   the hold has not been released by the sweep or superseded
 *   AND no `stripe_pi:<id>` ledger row   🔴 NOT CAPTURED. Without this, every CAPTURED order would keep
 *                                        reading "held" forever — the draft row is unchanged by capture.
```

🔴 **HELD IS NOT A `payment_status` VALUE AND NEVER WILL BE.** Its own header, `:12-14`: *"THIS IS AN
ADDITIONAL FACT DISPLAYED ALONGSIDE `payment_status`, NOT A REDEFINITION OF PAID… The order is unpaid.
It ALSO has a card held."*

**ALREADY REFUNDED** is `status: 'refunded'` or `'part_refunded'` from the resolver **for settled
refunds**, and — critically — is **not** visible there for a *pending* one. See B5.

## B2. 🔴 "What was actually captured" — and the ledger does hold it

**READ** — `lib/payments/online.ts:91-100`, the writer, with the rule stated at the parameter:

```ts
    /** Minor units, from the Stripe object — NEVER from our order total. See the note below. */
    amountMinor: number
…
  // 🔴 THE AMOUNT IS STRIPE'S, NOT OURS. `amount_received` on the PaymentIntent is what the customer
  // was actually charged. Using `orders.total` here would paper over any divergence — a repriced order,
  // a partial capture — and the ledger's whole job is to record what happened, not what we expected.
```

**READ** — `lib/payments/capture.ts:279`, the value that reaches it:

```ts
      amountMinor = typeof captured.amount_received === 'number' ? captured.amount_received : 0
```

✅ **CONFIRMED: the ledger holds the captured amount, not the order total, and a downward edit is
exactly the case the comment names.** §37 corroborates with a measured example: *"£5.00 captured from a
£13.00 hold, `amount_capturable` 0, `amount_received` 500 against an `amount_authorized` of 1300."*

⚠️ **AND THE FIGURE TO DEFAULT TO IS `remainingMinor`, NOT `capturedMinor`.** **READ**, `:102`:

```ts
  return { capturedMinor, refundedMinor, remainingMinor: Math.max(0, capturedMinor - refundedMinor), paymentIntentId }
```

An order refunded £2 of £6.50 has `capturedMinor: 650` and `remainingMinor: 450`. Defaulting the row to
650 pre-fills an amount the guard at `:154` will refuse — **a form that offers a number the server
rejects.** The brief's rule *"never the order total"* is right; the precise figure is the remainder.

🔴 **AND THE REMAINDER CANNOT BE COMPUTED FROM OUR DATABASE ALONE.** **READ**, `refund.ts:9-15`:

```
// ── 🔴 "HOW MUCH HAS ALREADY GONE BACK" COMES FROM STRIPE, NOT FROM OUR LEDGER ─────────────────────
// This is the single most important decision in the file. lib/payments/online.ts states the rule that
// makes our own ledger the wrong source: "NO LEDGER ROW UNTIL THE MONEY HAS ACTUALLY GONE BACK" — a
// PENDING refund … writes nothing at all until it settles.
```

**INFERRED, and it is the sharpest constraint in this report: a per-order money list is one
`refunds.list` call PER ORDER, or it is wrong during a pending refund.** An event with forty card
orders is forty Stripe round trips to render step 2 accurately. `refundableFor` makes exactly one such
call per invocation (`:96`).

## B3. What marks an order COMPLETE

**READ** — `components/dashboard/types.ts:15-24`, the full status set:

```ts
  PENDING:   'pending',
  CONFIRMED: 'confirmed',
  REJECTED:  'rejected',
  MODIFIED:  'modified',
  CANCELLED: 'cancelled',
  COOKING:   'cooking',
  READY:     'ready',
  COLLECTED: 'collected',
```

✅ **`'collected'` is the complete state, and it does distinguish collected food from a merely confirmed
order** — they are separate members of the same enum, and the ordering is a genuine progression
(`confirmed → cooking → ready → collected`).

**READ** — corroborated by a second field written only on that transition, `types.ts:51-52`:

```ts
  /** Set by 'collected' to the prior status; cleared by undo_collected. Surfaced for the merge/undo. */
  status_before_collected?: string | null
```

🔴 **BUT THE EVENT-CANCEL BRANCH CANNOT SEE A COMPLETED ORDER TODAY.** **READ**, `route.ts:207-209`:
`.in('status', ['confirmed', 'pending'])`. `'collected'`, `'ready'` and `'cooking'` are all absent.

⚠️ **SO THE BRIEF'S DESIGN CHANGES WHAT THE CANCEL TOUCHES, NOT ONLY WHAT IT REFUNDS.** *"Cancelling an
event CANCELS EVERY ORDER"* plus *"COMPLETED orders unticked"* requires collected orders to be **in the
selection set** — which they are not. That is a scope change to the destructive statement itself, and
it is the one part of the design that makes the cancel act on orders it has never acted on before.
**Reported, not resolved.**

## B4. Can one order be BOTH partly captured and partly held?

🔴 **NO. It is structurally impossible, and there are two independent reasons.**

**READ** — `lib/payments/capture.ts:264-278`, quoting Stripe's own behaviour in the code comment:

```ts
      // 🔴 `amount_to_capture` IS SENT ONLY WHEN IT LOWERS THE AMOUNT, so a full capture is the same
      // … A PARTIAL CAPTURE AUTOMATICALLY RELEASES
      // the initial amount, pass the amount_to_capture option.
```

**§37 states the measured consequence:** *"Stripe released the £8.00 itself — 'A partial capture
automatically releases the remaining amount' — with no second call from us"* and *"If you partially
capture a payment, you can't perform another capture for the difference."*

**And second, our own resolver would not report it as held either — READ**, the held predicate's
fourth clause: *"AND no `stripe_pi:<id>` ledger row"*. **One capture writes that row, so the order
leaves the held set entirely** regardless of what fraction was taken.

✅ **So the states are mutually exclusive by construction: an order is held, or captured (in whole or
in part), never both.** ⚠️ **What IS possible, and is a different thing, is `part_paid`** — captured by
card **and** money still owed at the hatch (§37: *"£6.50 paid, £6.50 still to pay"*). A per-order list
must not read that as a partial hold.

## B5. Already-refunded orders — what prevents a second refund

**READ** — three independent guards, and the first is the one that matters:

```ts
refund.ts:154   if (args.amountMinor > refundable.remainingMinor) {
refund.ts:155     // ⚠️ THE SECOND-REFUND CASE IS THE SAME LINE. `remainingMinor` is captured minus everything Stripe is
refund.ts:156     // already holding open, so a first refund of the full amount leaves zero and this refuses at once.
```

```ts
refund.ts:97    // 🔴 EVERYTHING STRIPE IS STILL HOLDING OPEN COUNTS. `failed` and `canceled` money came back to the
refund.ts:98    // truck and is refundable again; `pending`, `requires_action` and `succeeded` are all on their way out.
refund.ts:99    const refundedMinor = list.data
refund.ts:100     .filter(r => r.status !== 'failed' && r.status !== 'canceled')
refund.ts:101     .reduce((sum, r) => sum + (r.amount ?? 0), 0)
```

and the idempotency key at `:171`, which makes a **repeat of the same request** return Stripe's same
refund object rather than creating a second.

✅ **A second refund is prevented, and it is prevented against STRIPE'S figure rather than ours** —
which is precisely what makes it hold while an earlier refund is still pending. **This guard needs
nothing added for a bulk path**, because it is evaluated per order inside `refundOrder`.

---

# PART C — THE ENDPOINT

## C1. The cancel branch, in full, as it stands

**READ** — `app/api/events/action/route.ts:173-256`. **Unchanged by the two previous tasks** — the
overlay work touched only the client gate:

```ts
  // ── CANCEL ───────────────────────────────────────────────
  if (action === 'cancel') {
    const { cancellationNote, cancellationReason } = payload ?? {}
    const fullNote = [cancellationReason, cancellationNote].filter(Boolean).join(' — ')

    const { data: eventRow } = await supabase
      .from('truck_events')
      .select('venue_name, village, event_date, scraped_signature')
      .eq('id', eventId).single()

    const { error } = await supabase
      .from('truck_events')
      .update({ status: 'cancelled', cancellation_note: fullNote || null, updated_at: now })
      .eq('id', eventId).eq('truck_id', truck.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (payload?.suppress && eventRow) { …rejected_event_signatures insert… }

    // Cancel affected orders and notify customers
    const { data: affectedOrders } = await supabase
      .from('orders').select('*')
      .eq('event_id', eventId)
      .in('status', ['confirmed', 'pending'])

    let cancelledOrders = 0
    if (affectedOrders && affectedOrders.length > 0) {
      // Scope by order_key (UUID) — display id is not unique across events, so
      // .in('id', ...) would cancel matching display numbers in OTHER events too.
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
            to: order.customer_email,
            customerName: order.customer_name,
            orderId: order.id,
            truckName: truck.name ?? '',
            venueName: eventRow?.venue_name ?? null,
            village: eventRow?.village ?? null,
            eventDate: eventRow?.event_date ?? null,
            note: fullNote || null,
            paymentStatus: order.paid_at ? 'paid' : null,
          })
        }
      }
    }

    if (eventRow?.event_date) {
      try { await rebuildProductionSlotUsage(supabase, truck.id, eventRow.event_date) }
      catch (err) { console.warn('[events/cancel] production_slot_usage rebuild failed (drift risk):', err) }
    }

    return NextResponse.json({ ok: true, cancelledOrders })
  }
```

**READ** — the file's imports, still with no path to `lib/payments/`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEventCancellationEmail } from '@/lib/email'
import { getSoleActiveVanId } from '@/lib/van-utils'
import { rebuildProductionSlotUsage } from '@/lib/slot-bookings'
import { hasValidEventTimes } from '@/lib/time-utils'
```

## C2. The shape a per-order decision would need

**Stated, not built.** From what the guards actually consume:

```
payload: {
  cancellationReason: string
  cancellationNote: string
  refunds: Array<{ orderKey: string; amountMinor: number }>   // ticked rows only
}
```

**Why that shape and not another, from the code:**

- **`orderKey`, never the display `id`.** The branch's own comment says why: *"display id is not unique
  across events, so `.in('id', ...)` would cancel matching display numbers in OTHER events too."*
- **`amountMinor`, integer, minor units** — `refundOrder` requires `Number.isInteger` and refuses
  anything else (`:148`).
- **Absent from the list means "do not refund"**, which is a positive statement of intent rather than
  an absence of one. ⚠️ **An empty array and a missing key must not mean the same thing** — one is *"no
  order was ticked"*, the other is *"an old client sent no decision at all"*, and the second should not
  silently refund nothing on a path whose whole purpose is to refund.
- **`reason` and `note`**: `refundOrder` requires a `RefundReason` from the seven. **The event modal
  collects a free-text reason from a different five-value list** (`EVENT_CANCEL_REASONS`: Vehicle
  breakdown, Weather, Venue issue, Personal emergency, Other). 🔴 **The two vocabularies do not
  intersect.** §37 records the analogous problem being solved once already — *"ONE REASON DROPDOWN, NOT
  TWO… THE SEVEN SURVIVE BECAUSE THEY ARE A STRICT SUPERSET"* — and here they are **not** a superset in
  either direction. That is an unresolved mapping, not a detail.

## C3. 🔴 ORDER OF OPERATIONS — refund first, and it is the opposite of the hold rule

**The answer is REFUND THEN CANCEL, and §37 states the rule and its reasoning explicitly. READ:**

| | Order | Why |
|---|---|---|
| **Refund on cancel** | **refund FIRST**, then cancel | A failed refund would leave a cancelled order with the money still taken and nobody looking at it. Failing first leaves the order exactly as it was, with the error on screen |
| **Release on cancel** | **cancel FIRST**, then release | An operator mid-service must not be blocked by Stripe being slow. **A failed release leaves an authorisation that expires by itself; a failed refund leaves money taken forever** |

**READ** — the operator single-order cancel already implements the refund-first half, at
`app/api/dashboard/action/route.ts:362`:

```ts
      // The refund goes FIRST because a refund that fails must not leave a cancelled order with the
```

and the release-second half at `:368-369`:

```ts
      // ⚠️ IT ONLY EVER RELEASES. See lib/payments/release-hold: a captured order is refused outright.
      const released = await releaseHoldForCancelledOrder(supabase, {
```

**So no, the same rule does NOT hold for refunds — it inverts.** The failure modes are asymmetric:

- 🔴 **Cancel-then-refund, failing:** the order is `cancelled`, the customer has been emailed, the money
  is still on the truck's account, and **nothing in the system is looking for it.** There is no sweep
  for this — §37: *"No sweep collects a failed release"*, and there is no refund sweep at all.
- ✅ **Refund-then-cancel, failing:** the order is untouched, still live on a still-live event, and the
  operator sees the error while standing in front of the decision.

🔴 **AND A BULK PATH MAKES THIS HARDER THAN THE SINGLE-ORDER CASE, WHICH IS THE GENUINELY NEW PROBLEM.**
With one order, "fail first and change nothing" is coherent. With forty, order #17 failing after
sixteen refunds have already gone out leaves the operator holding a **partially executed cancellation**
— and *"leave it exactly as it was"* is no longer available, because sixteen customers have their money
back. **INFERRED: the all-or-nothing property the single-order rule depends on does not survive the
loop, and nothing in the codebase currently resolves that.** It is the first risk in F3.

## C4. 🔴 THE LOOP — what exists today, and why it has no isolation

**READ** — the entire loop, quoted at C1:

```ts
      for (const order of affectedOrders) {
        if (order.customer_email) {
          await sendEventCancellationEmail({ … })
        }
      }
```

**No `try`/`catch`. No per-order result. No accumulator. Nothing reports which orders succeeded.**

✅ **AND THAT IS CURRENTLY HARMLESS, FOR A REASON THAT WILL NOT SURVIVE.** **READ** —
`lib/email.ts:571-576`, the bottom of `sendConfirmationEmail`:

```ts
  } catch (err) {
    console.error('Email error:', err)
    // Never throw — email failure must not fail the order
  }
}
```

🔴 **THE ONLY THING IN THE LOOP CANNOT THROW, SO NO ISOLATION WAS EVER NEEDED AND NONE WAS WRITTEN.**
The brief's requirement — *"one throw must not skip the rest, and every failure must be visible per
order"* — is **not met by anything in this file**; it is met by a property of the callee.

⚠️ **`refundOrder` shares that property in part** (`:108-110`, *"IT CANNOT THROW PAST THE GUARDS"*) —
but only in part, and the difference matters: it returns `'failed'` and `'refused'` as **values**,
which the current loop has no shape to collect. A loop that ignores return values would swallow
*"Only £15.00 is left to refund"* exactly as silently as an exception.

⚠️ **Also worth recording: the status update is ONE statement, not a loop** —
`.update({...}).in('order_key', orderKeys)` — so cancellation is currently all-or-nothing at the
database, while the emails are per-order. **A per-order refund decision is the first thing that would
make the cancel itself heterogeneous.**

## C5. Pending versus failed — is the distinction there?

✅ **YES, at the refund layer, and it is first-class. READ**, `refund.ts:213` and `:240-248`:

```ts
  const settled = refund.status === 'succeeded'
  …
  if (!settled) {
    // 🔴 NO LEDGER ROW. lib/payments/online.ts owns this rule and the webhook's refund.updated branch is
    // what turns a settled refund into one. Writing an inert row here would be a second state to keep.
    console.warn(
      `[refund] PENDING re=${refund.id} order_key=${args.orderKey} amount=${args.amountMinor} — Stripe has ` +
      `accepted it and the money has not moved. The ledger stays as it is until refund.updated settles it.`,
    )
    return { status: 'pending', refundId: refund.id, amountMinor: args.amountMinor }
  }
```

**Three distinct arms: `'refunded'`, `'pending'`, `'failed'`** — and the audit action differs too
(`refund_issued` versus `refund_pending`, `:215`).

🔴 **BUT THE DISTINCTION DIES ABOVE THAT LAYER, AND THAT IS THE FINDING.** **NOT FOUND: anything that
surfaces a pending refund to an operator or a customer.**

- **No ledger row**, by design — so `getOrderBalance` still reports the order as `paid`. The dashboard
  shows no trace.
- **No email.** §37: *"Never sent on a PENDING refund… And nothing emails when it later settles — the
  webhook is the only thing that knows, and it sends nothing."*
- **No in-product alert on the failure case either.** §37, on `refund.failed`: *"There is NO in-product
  alert. A failed refund is visible only in the audit and runtime logs — and someone still owes that
  customer money."*

⚠️ **INFERRED, and it is a real consequence for this design specifically: `pending` is the LIKELY
outcome of a bulk refund, not an edge case.** Refunds draw on the connected account's available
balance, and cancelling a whole event issues many refunds at once against a balance that has not yet
paid out. **The condition that produces `pending` is exactly the condition a bulk event cancellation
creates.**

---

# PART D — THE CUSTOMER SIDE

## D1. The event-cancellation email, quoted

**READ** — `lib/email.ts:735-775`, in full:

```ts
export async function sendEventCancellationEmail({
  to, customerName, orderId, truckName, venueName, village, eventDate, note, paymentStatus,
}: { … paymentStatus: string | null }): Promise<void> {
  const location = [venueName, village].filter(Boolean).join(', ')
  const dateFormatted = eventDate
    ? new Date(eventDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
    : null
  const noteLine = note ? `<p>${note}</p>` : ''
  // Same correction as the cancellation email above, for the same reasons.
  const refundLine = paymentStatus === 'paid'
    ? ` If you paid by card, any refund is handled by ${truckName} directly — please contact them about it.`
    : ''
  const html = `
    <div style="font-family:Arial,sans-serif;color:#334155;max-width:600px;">
      <p>Hi ${customerName || 'there'},</p>
      <p>Unfortunately <strong>${truckName}</strong>'s event${location ? ` at ${location}` : ''}${dateFormatted ? ` on ${dateFormatted}` : ''} has been cancelled.</p>
      ${noteLine}
      <p>Your order <strong>#${orderId}</strong> has been cancelled.${refundLine}</p>
      <p>We're sorry for any inconvenience.</p>
      <p>${truckName}</p>
      <p style="color:#94a3b8;font-size:12px">Powered by HatchGrab · hatchgrab.com</p>
    </div>
  `
```

**And the caller — READ**, `events/action/route.ts:238`:

```ts
            paymentStatus: order.paid_at ? 'paid' : null,
```

🔴 **ONE GATE, ON `order.paid_at`, AND IT IS THE WRONG COLUMN.** §37 records that `paid_at` *"is never
set by the capture path"* — the resolver is canonical and `paid_at` survives only as a compatibility
timestamp. **INFERRED: a card order captured at confirmation therefore has `paid_at` null, so
`paymentStatus` is null, so `refundLine` is empty — the customer whose money was taken is told nothing
about money at all.** That is the same defect the holds report found for held orders, reached by the
same line.

## D2. What it says today, in the four cases

| Case | What the customer is told about money | Verdict |
|---|---|---|
| **Refunded** | 🔴 **Nothing.** No refund happens today, so this case cannot arise from this path. | n/a |
| **Released hold** | 🔴 **Nothing.** `paid_at` is null for a held order, so `refundLine` is empty — **and no release happens either.** | Silent |
| **Cash order** | ⚠️ *"If you paid by card, any refund is handled by {truckName} directly"* — **only if `paid_at` is set**, which a cash collection does set. **The sentence opens with "If you paid by card", so it degrades honestly** rather than promising a cash customer a card refund. | Survivable |
| **Cancelled WITHOUT refund** | 🔴 **Depends entirely on `paid_at`.** Set → the "contact them directly" sentence. Null → **nothing at all**, which for a captured card order is silence about money that has been taken and is not coming back. | 🔴 **The bad one** |

⚠️ **The good version already exists elsewhere and this template does not use it.** **READ** —
`cancellationPaymentSentence` in the same file, `:598-624`, used by both single-order cancel paths:

```ts
  if (typeof args.refundedMinor === 'number' && args.refundedMinor > 0) {
    const sentence = `${money(args.refundedMinor)} has been refunded to your card. Refunds usually take 5 to 10 business days to appear on your statement, depending on your bank.`
  if (args.refundDeclined) {
    const sentence = `If you have a question about payment for this order, please contact ${args.truckName}.`
  if (args.paymentState === 'held' || args.paymentState === 'held_short') {
    const sentence = `Your card was held for this order, not charged. That hold has been released and no money has been taken.`
  if (args.paymentState === 'captured' || args.paymentState === 'part_paid') {
    const sentence = `If you paid by card, any refund is handled by ${args.truckName} directly — please contact them about it.`
```

🔴 **THREE OF ITS FOUR CASES ARE EXACTLY WHAT THIS PATH NEEDS, AND THE EVENT TEMPLATE REACHES NONE OF
THEM.** It takes a `paymentStatus: string | null` and does its own one-line ternary.

## D3. 🔴 The fourth case — cancelled and deliberately NOT refunded

**What the template would need. Not written.**

The nearest existing wording is `refundDeclined` above: *"If you have a question about payment for this
order, please contact {truck}."* **READ** — §37 records why it is worded that way and the constraint is
absolute:

> **Cancelled, refund declined** — *"If you have a question about payment for this order, please
> contact {truck}."* 🔴 **It must NOT promise a refund and must NOT say one was refused** — the operator
> may change their mind, and an email is the wrong place to argue

⚠️ **BUT THE EVENT CASE IS NOT THE SAME CASE, AND REUSING THAT SENTENCE UNCONSIDERED WOULD BE WRONG.**
Three differences, all reported rather than resolved:

1. **The single-order decline has a stated cause the customer can infer** — the no-show, where they did
   not turn up. **An event cancellation is the truck's own doing**, so *"contact us about payment"* on
   an order the customer did nothing wrong on reads very differently.
2. 🔴 **The design's default makes this case COMMON, not exceptional.** *"COMPLETED orders unticked"*
   means every collected order on a cancelled event gets this sentence — and those are customers who
   **received their food**. For them, no refund is obviously correct, and *"contact them about
   payment"* would invite a conversation that should not happen. ⚠️ **A completed order and a
   deliberately-unrefunded incomplete order are two different messages, and one sentence cannot be
   right for both.**
3. **The template has no plain-text twin of the money sentence.** `cancellationPaymentSentence` returns
   `{ html, text }` precisely so the two cannot disagree; `sendEventCancellationEmail` builds
   `refundLine` as one string and interpolates it into both — which happens to be safe, but is not the
   structure the other path uses.

**What it would need, stated as requirements only:** the amount actually refunded (for the refunded
case), a distinct branch for *completed and not refunded*, a distinct branch for *incomplete and not
refunded*, the released-hold sentence, and a plain-text rendering of each that cannot drift from the
HTML.

---

# PART E — THE UI

## E1. Does a per-order list with editable amounts already exist?

✅ **FOUND — the closest thing is not in payments at all.** **READ** — `app/manage/[token]/page.tsx:5205`,
the AI-import review screen, a mapped list with an editable £ amount per row:

```tsx
                                    <div className="flex items-center gap-1">
                                      <span className="text-sm text-slate-400">£</span>
                                      {/* value stays EMPTY for an unresolved item — never "0.00", which invites
                                          skimming past it as if it were correct. */}
                                      <input type="number" step="0.50" value={Number(item.price) > 0 ? item.price : ''} placeholder="0.00"
                                        onChange={e => { const v = parseFloat(e.target.value); patchImportItem(globalIdx, it => ({ ...it, price: v > 0 ? v : 0, price_missing: !(v > 0), _free: v > 0 ? false : it._free })) }}
                                        className={`w-16 text-sm text-right rounded-lg px-2 py-1 border focus:outline-none focus:ring-1 focus:ring-orange-400 ${priceUnresolved(item) ? 'border-amber-400 bg-amber-50' : 'border-slate-200'}`} />
                                    </div>
```

⚠️ **Its comment is directly applicable to a refund row** — *"value stays EMPTY for an unresolved item —
never '0.00', which invites skimming past it as if it were correct."*

**Also FOUND, a second per-row pattern:** the dashboard's stock tab renders numeric inputs per mapped
row at `page.tsx:4220`, `:4279` and `:4361`, with the Escape-reverts / blur-commits discipline.

**The refund form is close but is SINGLE-ORDER — READ**, `PaymentActionsModal.tsx:280-292`:

```tsx
      {mode === 'partial' && (
        <label className="block">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Amount</span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-slate-500 text-sm">£</span>
            <input type="number" inputMode="decimal" step="0.01" min="0.01" max={(refundableMinor / 100).toFixed(2)}
              value={amountInput} onChange={e => { setAmountInput(e.target.value); setError(null) }}
              placeholder={(refundableMinor / 100).toFixed(2)}
              className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
          </div>
          {partialMinor > refundableMinor && (
            <span className="text-xs text-red-600 mt-1 block">Only {money(refundableMinor)} can be refunded.</span>
          )}
```

✅ **It already does the three things a row would need** — clamp to `max`, default the placeholder to
the refundable figure, and warn above the ceiling. ⚠️ **What it does not have is a list**: `mode`,
`amountInput`, `reason`, `note` and `error` are five flat `useState`s for one order. **A per-order list
is a different state shape**, not a repetition of this component.

## E2. What the money summary needs, and whether the endpoint can supply it

**Per order, from what the guards actually consume:** the order key, the display number, the customer
name, the status (for the complete/incomplete default), the **channel** (card versus cash versus
nothing — B1), `capturedMinor`, `refundedMinor` and `remainingMinor`, and whether a **hold** is live.

🔴 **`/api/events/affected-orders` CANNOT SUPPLY ANY OF IT, AND "WIDENING" UNDERSTATES THE CHANGE.**
**READ** — it is `select('id', { count: 'exact', head: true })`: `head: true` transfers **no rows at
all**. It returns one integer. Everything above is a different query plus:

- a **join or second read** against `order_payments` for the channel and the captured/refunded figures;
- a read against `order_drafts` for the held state (`readHeldAuthorisations` already does exactly this,
  batched — **READ**, `held-authorisation.ts:38`: *"BATCHED — TWO QUERIES FOR THE WHOLE BOARD"*);
- 🔴 **and, for `refundedMinor` to be correct during a pending refund, one `stripe.refunds.list` call
  PER ORDER** (B2). ⚠️ **That turns a read-only display endpoint into one that talks to Stripe**, which
  no `/api/events/*` route does today.

⚠️ **A cheaper variant exists and is worth naming because the trade is real:** taking `refundedMinor`
from our ledger instead would need no Stripe call and would be correct **except** while a refund is
pending — the exact window `refund.ts:9-15` was written to close. **The endpoint would be showing a
figure the refund guard would then refuse.** Reported; not chosen here.

## E3. Where the three surfaces differ in the data they already hold

🔴 **THE SURFACE WITH THE GOOD MODAL HAS THE LEAST DATA, AND THE TWO WITH THE DATA HAD THE WORST GATE.**

| | **Dashboard** | **KDS** | **manage** |
|---|---|---|---|
| Orders in state | ✅ `orders` (`page.tsx:207`) | ✅ `orders` | 🔴 **none** |
| Ledger rows per order | ✅ `payments` (`:327`) | ✅ `payments` (`kds:102`) | 🔴 **none** — `grep -c "payments\[" manage/page.tsx` → **0** |
| Held authorisations | ✅ `heldAuthorisations` (`:226`) | ✅ (`kds:92`) | 🔴 **none** |
| Shows money at all | ✅ yes | ⚠️ **gated off** — passes `hidePayments` | ✅ yes (Payments tab, separate) |
| The event-cancel modal | ✅ (shared, since the last task) | ✅ (shared) | ✅ (shared, original) |

**READ** — the dashboard already renders exactly the per-order money facts a summary needs, at
`page.tsx:3439`:

```tsx
ledgerRows={payments[o.order_key]} heldAuthorisation={heldAuthorisations.has(o.order_key)}
```

⚠️ **BUT ONLY FOR THE ORDERS CURRENTLY LOADED, WHICH IS THE ACTIVE EVENT.** **INFERRED:** cancelling a
**future** event — which is manage's normal case and is reachable from the dashboard's event menu only
for the active event — involves orders the client has never fetched. **So the summary must come from
the server even on the surface that already holds the data**, because the one case where the client
could compute it is the one case where the operator is least likely to be cancelling.

⚠️ **And the KDS deliberately hides money.** **READ**, `kds/page.tsx:167`: *"null = not read yet.
Resolved as NOT-on (see `hidePayments`): the safe direction is to withhold"*. **A refund editor on the
KDS would be the first money-editing surface on a screen whose settled position is to show no prices at
all.** Reported as a question for the design, not answered.

---

# PART F — THE SHAPE

## F1. What the build would involve

### ENDPOINT (`app/api/events/action/route.ts`, plus a read endpoint)

- Accept the per-order decision (C2 shape) and validate it **server-side**, since `refundOrder`'s own
  guards run per order but nothing checks that a submitted key belongs to **this event**.
- Import `lib/payments/refund` and `lib/payments/release-hold` — **the file currently imports neither,
  and imports nothing from `lib/payments/` at all.**
- Refund **before** the status write (C3), per order, collecting a per-order outcome rather than
  discarding it (C4).
- Release holds for the uncaptured orders — the holds report's item, unchanged.
- Widen `releaseHoldForCancelledOrder`'s `trigger` union by one value.
- Reconcile the status-list mismatch between the cancel (`['confirmed','pending']`) and the count
  (`['pending','confirmed','modified']`), and — if the design's *"cancels every order"* is taken
  literally — widen it further to reach `'collected'`, `'ready'` and `'cooking'` (B3).
- A **read** endpoint (widened `/api/events/affected-orders` or a new one) returning the per-order money
  facts of E2.

### UI (`components/shared/EventCancelModal.tsx` + the three callers)

- A money summary block in step 1 — new content in an existing component, whose `affectedOrderCount`
  prop is already supplied by all three callers.
- A step-2 view: a per-order list, a tick per row, an editable amount per row defaulting to
  `remainingMinor`, clamped and warned exactly as `PaymentActionsModal` already does for one order
  (E1).
- The defaults: incomplete ticked, `'collected'` unticked.
- ⚠️ Three callers, three different data situations (E3), and one of them (**the KDS**) currently shows
  no money at all.

### EMAIL (`lib/email.ts`)

- The refunded-amount case, the released-hold case, and 🔴 **two distinct not-refunded cases** —
  completed versus incomplete (D3).
- Plain-text twins for each, matching `cancellationPaymentSentence`'s `{ html, text }` contract.
- ⚠️ The `paid_at` gate at `events/action:238` replaced by something the capture path actually writes.

## F2. Built / needs widening / genuinely new

| | Item |
|---|---|
| ✅ **ALREADY BUILT, no change** | `refundOrder` and every guard in it · the idempotency key · the audit rows for issued/pending · `getOrderBalance` and the ledger's captured figure · `readHeldAuthorisations` · the pending-versus-failed distinction at the refund layer · `EventCancelModal` as a shared three-surface component · the per-row editable-amount UI pattern (manage's import review) · the single-order clamped amount input |
| ⚠️ **NEEDS WIDENING** | `releaseHoldForCancelledOrder.trigger` (one union value) · `refundableFor` (private → visible, no behaviour change) · `EventCancelModal` (a summary block, a second step) · the cancel branch's status list · `sendEventCancellationEmail` (new cases) |
| 🔴 **GENUINELY NEW** | The per-order decision payload and its server-side validation · **a loop that collects per-order outcomes** (nothing in the file does this, C4) · **what to do when the loop half-succeeds** (C3) · the money-summary read endpoint, including whether it calls Stripe (E2) · the reason-vocabulary mapping between the event modal's five and `REFUND_REASONS`' seven (C2) · **any surface at all for a pending refund** (C5) · the two not-refunded email cases (D3) |

## F3. 🔴 Every risk

**1. 🔴 Partial failure mid-loop — the largest, and it has no precedent in this codebase.**
Sixteen refunds sent, order #17 fails. The single-order rule (*"failing first leaves the order exactly
as it was"*) is unavailable: sixteen customers already have their money. **The status update is
currently ONE statement over all keys**, so today's cancel is atomic and a per-order refund makes it
heterogeneous for the first time. ⚠️ **And there is no sweep on this path** — §37: *"No sweep collects a
failed release"*, and no refund sweep exists at all.

**2. 🔴 A refund exceeding what was captured.** ✅ **Guarded, and guarded in the right place** —
`refund.ts:154` compares against `remainingMinor`, computed from **Stripe's** figure. ⚠️ **The risk is
not the guard failing; it is the UI defaulting to `capturedMinor` and pre-filling an amount the server
will refuse** (B2). A row that must be corrected before the operator can proceed, on a screen used
under pressure.

**3. 🔴 Double refund.** ✅ **Three layers already** — `remainingMinor` counting everything Stripe holds
open including pending, the state-transition idempotency key, and Stripe's own refusal. ⚠️ **The new
exposure is the retry**: an operator who does not see a clear result and presses again. The idempotency
key protects an *identical* repeat; a **second attempt after a partial run** carries a different
`refundedSoFar` and therefore a **different key**, so it is a genuine second refund by design. **The
protection is `remainingMinor` reaching zero, not the key.**

**4. 🔴 The operator closes the modal mid-run.** The request is already in flight server-side, so
closing changes nothing about what happens to the money — **it changes what the operator knows.**
⚠️ The previous task's back-handler registration is `[!!eventCancelTarget && !eventCancelBusy, …]`,
which already refuses to dismiss while busy; **the button `disabled={busy}` does the same.** ✅ So the
existing modal is better placed for this than it needed to be. 🔴 **What is missing is the report
afterwards** — with per-order outcomes there is a result to show, and nothing renders one today (the
current response is `{ ok: true, cancelledOrders }`, a single integer).

**5. ⚠️ Pending refunds are the likely outcome, not the edge case.** A bulk refund draws on a connected
account's available balance; cancelling an event issues many at once. **The condition that produces
`pending` is the condition this feature creates** — and per C5 nothing tells the operator or the
customer that a refund is pending, and nothing emails when it settles.

**6. ⚠️ Fees are not returned, and the copy must say so.** The brief's verified note is correct and
matches §37's own record. ⚠️ **A truck refunding a whole event's takings is out of pocket by the
processing fees on every one of them**, and the modal is the only place that could say so before the
decision.

**7. ⚠️ The reason vocabularies do not intersect** (C2). `refundOrder` requires one of seven; the modal
collects one of five, sharing only the word *"Other"*.

**8. ⚠️ Scope creep in the destructive statement itself.** *"Cancels every order"* requires reaching
statuses the cancel has never touched (B3). **The refund half is additive; that half is not.**

## F4

No implementation is proposed and no order is recommended.

---

# PART G — INTEGRITY

## G1. Byte scan — every file opened

**18 files, byte-level scan for NUL and every control byte below 0x09 (plus 0x0B, 0x0C, 0x0E–0x1F,
0x7F). Never grep.**

```
  reference-manual.md                             1572328 bytes  offending=0  CR=0
  event-cancel-holds-report.md                      35063 bytes  offending=0  CR=0
  overlay-fixes-report.md                           46441 bytes  offending=0  CR=0
  release-hold.ts                                    9750 bytes  offending=0  CR=0
  refund.ts                                         16259 bytes  offending=0  CR=0
  ledger.ts                                         53211 bytes  offending=0  CR=0
  held-authorisation.ts                              6924 bytes  offending=0  CR=0
  online.ts                                         14052 bytes  offending=0  CR=0
  capture.ts                                        31097 bytes  offending=0  CR=0
  events/action/route.ts                            13114 bytes  offending=0  CR=0
  events/affected-orders/route.ts                    1358 bytes  offending=0  CR=0
  email.ts                                          42590 bytes  offending=0  CR=0
  types.ts                                          15188 bytes  offending=0  CR=0
  PaymentActionsModal.tsx                           18104 bytes  offending=0  CR=0
  EventCancelModal.tsx                               6213 bytes  offending=0  CR=0
  dashboard/[token]/page.tsx                       388136 bytes  offending=0  CR=0
  dashboard/[token]/kds/page.tsx                   106038 bytes  offending=0  CR=0
  manage/[token]/page.tsx                          782627 bytes  offending=0  CR=0
TOTAL OFFENDING ACROSS 18 FILES: 0
```

✅ **Zero offending bytes, zero CR.** ⚠️ **All 18 were opened READ-ONLY — this is a check on the
repository as found, not on anything this task produced.**

## G2. Byte scan of this report

Separate pass, run after writing: **57,944 bytes, offending = 0** — no NUL, no control byte below
0x09, no CRLF, no lone CR.

## G3. 🔴 Carrier-aware variation-selector check on this report

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 29 | 0 | 29 |
| U+1F534 LARGE RED CIRCLE | 57 | 0 | 57 |
| U+2500 BOX DRAWINGS LIGHT HORIZONTAL | 115 | 0 | 115 |
| U+26A0 WARNING SIGN | 42 | 42 | **0** |

**Every warning sign is paired; ZERO are bare.** **Sum of per-base paired = the report's total U+FE0F count** — no orphan and no double-count.

## G4. `git status` — proof nothing changed

```
M app/api/orders/submit/route.ts
 M app/api/webhooks/instagram/route.ts
 M app/api/webhooks/messenger/route.ts
 M app/api/webhooks/meta/whatsapp/route.ts
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/manage/[token]/page.tsx
 M components/dashboard/AddOrderPanel.tsx
 M docs/reference-manual.md
?? components/shared/EventCancelModal.tsx
?? docs/android-audit-report.md
?? docs/android-back-handler-report.md
?? docs/event-cancel-holds-report.md
?? docs/event-cancel-refunds-report.md
?? docs/fcm-sender-report.md
?? docs/overlay-audit-report.md
?? docs/overlay-fixes-report.md
?? docs/whatsapp-onboarding-report.md
?? docs/whatsapp-routing-report.md
?? docs/whatsapp-signature-report.md
?? lib/fcm.ts
?? lib/meta/
?? lib/native/backHandler.ts
?? supabase/migrations/20260816_trucks_phone_number_id.sql
```

✅ **No file was created, modified or deleted by this task except this report.** The seven modified
files and the nine other untracked paths are prior turns' work, uncommitted as instructed. ⚠️ **`git
diff --stat` is unchanged from the end of the previous task** — no entry in it belongs to this one.
