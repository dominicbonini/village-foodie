// lib/payments/online.ts
// THE ONLINE CARD PAYMENT'S ONE WAY INTO THE LEDGER.
//
// ── 🔴 WHY THIS EXISTS AND recordCollectionPayment DOES NOT DO IT ───────────────────────────────────
// `recordCollectionPayment` is the HATCH path and is wrong here in three specific ways, not one:
//   1. it hardcodes `channel: 'in_person_other'`;
//   2. its own note says it "derives the amount from the balance rather than from a processor" — the
//      exact inverse of a card payment, whose amount is whatever Stripe actually captured;
//   3. it short-circuits on a zero balance, which is right for a collection and wrong for a webhook
//      that must record what happened whatever the local view of the balance says.
// So this is a THIN WRAPPER OVER recordPaymentEvent — the general writer — and not a widening of the
// collection path. There is still exactly one INSERT into order_payments in this codebase.
//
// ── 🔴 THE CHANNEL IS THE POINT OF THIS FILE ───────────────────────────────────────────────────────
// `channel: 'online'` has been reserved-but-never-written since the ledger was built (§37). The
// migration says why: "payment_status alone cannot tell you whether the 0.99% platform fee applies —
// only the channel can. In-person payments never incur it and never count toward the monthly
// allowance." This build charges NO platform fee — but every row it writes carries the channel and the
// truck and the timestamp, so THE LEDGER IS THE ALLOWANCE HISTORY and a fee introduced later can be
// computed over orders taken today. Recording `orders.payment_status` and skipping this table would
// take real money with no record of how it arrived, and that is the one mistake that cannot be undone.
//
// ⚠️ THIS FILE IS lib/payments. THE MONEY-PATH INVARIANT APPLIES: exercised against real rows before
// deploying, never merely typechecked.
import type { SupabaseClient } from '@supabase/supabase-js'
import { recordPaymentEvent } from './ledger'

/**
 * 🔴 THE IDEMPOTENCY KEY FOR A WEBHOOK-DRIVEN PAYMENT.
 *
 * ⚠️ `collectIdempotencyKey` MUST NOT BE USED HERE, and the reason is structural rather than stylistic.
 * That key is `collect:{orderKey}:{paidBefore}:{balance}` — derived from LEDGER POSITION. Position is
 * the one thing that is not stable across a webhook retry: Stripe re-delivers the same event for up to
 * three days, and by the second delivery the ledger may have moved. Two deliveries of one payment would
 * then mint two different keys and insert two charge rows, doubling the recorded amount.
 *
 * ✅ THE STRIPE OBJECT ID IS THE CORRECT KEY. The PaymentIntent id is globally unique, is minted by
 * Stripe before the money moves, and is IDENTICAL on every redelivery of the event — which is exactly
 * the property the unique index needs. `order_payments_idempotency_key_uidx` then makes a duplicate
 * delivery a silent no-op, the same 23505 idiom the webhook route already uses for its receipt log.
 *
 * ⚠️ Prefixed rather than bare, so a key can never be confused with one minted by another path, and so
 * the source is legible in the row itself.
 */
export function onlinePaymentIdempotencyKey(paymentIntentId: string): string {
  return `stripe_pi:${paymentIntentId}`
}

/**
 * Record a successful online card payment.
 *
 * ⚠️ `livemode` IS REQUIRED AND COMES FROM THE EVENT, never from a key prefix or an env var — the same
 * rule the receipt log follows. A test payment recorded as live is the defect the column exists for.
 * ⚠️ `state: 'succeeded'` only. This is called from the `payment_intent.succeeded` branch; a failed
 * payment writes NOTHING, because the order is already `unpaid` and an extra row saying so would make
 * `getOrderBalance` do arithmetic over an event where no money moved.
 *
 * Returns whatever recordPaymentEvent returns, including its duplicate no-op result.
 */
export async function recordOnlineCardPayment(
  supabase: SupabaseClient,
  args: {
    orderKey: string
    truckId: string
    /** Minor units, from the Stripe object — NEVER from our order total. See the note below. */
    amountMinor: number
    paymentIntentId: string
    livemode: boolean
    currency?: string
  },
) {
  // 🔴 THE AMOUNT IS STRIPE'S, NOT OURS. `amount_received` on the PaymentIntent is what the customer
  // was actually charged. Using `orders.total` here would paper over any divergence — a repriced order,
  // a partial capture — and the ledger's whole job is to record what happened, not what we expected.
  return recordPaymentEvent(supabase, {
    orderKey: args.orderKey,
    truckId: args.truckId,
    kind: 'charge',
    channel: 'online',
    amountMinor: args.amountMinor,
    state: 'succeeded',
    method: 'card',
    externalRef: args.paymentIntentId,
    idempotencyKey: onlinePaymentIdempotencyKey(args.paymentIntentId),
    livemode: args.livemode,
    currency: args.currency,
    createdBy: 'stripe_webhook',
    note: 'Online card payment',
  })
}
