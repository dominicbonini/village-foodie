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
import { recordPaymentEvent, recalcOrderPayment } from './ledger'
// A failed refund DESTROYS a money row, so its audit write must be the strict one: a failed log aborts
// the delete. Same rule undo_collected follows.
import { logActionOrThrow } from '@/lib/audit/actionAudit'

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
 * The idempotency key for an online card REFUND. Stripe's own refund id, prefixed.
 *
 * ── 🔴 WHY NOT THE INTENT ID, AND WHY NOT THE CHARGE ID ────────────────────────────────────────────
 * A capture is ONE-PER-INTENT, so `stripe_pi:{id}` is a complete identity for it. A refund is not:
 * Stripe's own documentation says "You can optionally refund only part of a charge. You can do so
 * multiple times, until the entire charge has been refunded." Keying on the intent or the charge would
 * make the SECOND partial refund a 23505 no-op — silently swallowed, exactly the defect
 * collectIdempotencyKey was rewritten to fix when `collect:{order_key}` swallowed every charge after
 * the first. The refund id is the only identifier that is one-per-refund.
 *
 * ✅ AND IT IS STABLE ACROSS REDELIVERY, which is the property the unique index actually needs. Stripe
 * mints `re_...` when the refund is created and repeats it on every redelivery of every event that
 * mentions it — including `charge.refunded` and `refund.updated`, which is what lets those two branches
 * converge on ONE row without knowing about each other.
 *
 * ⚠️ `stripe_re:` DELIBERATELY MIRRORS `stripe_pi:`. One prefix per Stripe object type, so the source of
 * any row is legible from the key alone and no path can collide with another.
 */
export function onlineRefundIdempotencyKey(refundId: string): string {
  return `stripe_re:${refundId}`
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

/**
 * Record an online card REFUND that Stripe has already settled.
 *
 * ── 🔴 ONLY `succeeded` REFUNDS REACH HERE, AND THAT IS THE WHOLE PENDING DECISION ─────────────────
 * A Connect refund on a direct charge can come back `pending` when the connected account's balance is
 * short — Stripe: "we set the refund status to `pending`... Stripe automatically processes pending
 * refunds in the order they were created and updates their status to `successful`."
 * getOrderBalance counts ONLY `state === 'succeeded'`, so a pending row would be inert: it would change
 * no balance and no surface. Writing one would therefore buy nothing and cost a second state to keep in
 * step — and `recordPaymentEvent` is INSERT-ONLY, so flipping it later would mean building an UPDATE
 * path into the ledger for a row nothing reads. So the rule is: NO LEDGER ROW UNTIL THE MONEY HAS
 * ACTUALLY GONE BACK. A pending refund is recorded in `action_audit_log` instead, where it is visible
 * without pretending to be money that has moved. See the webhook's `refund.updated` branch, which is
 * what turns a pending refund into this call once Stripe settles it.
 *
 * ⚠️ THE AMOUNT IS THE INDIVIDUAL REFUND'S, NEVER `charge.amount_refunded`. That field is CUMULATIVE:
 * a second 200p refund on a charge already refunded 200p reports 400, and booking it would double-count.
 * One row per `re_...`, each carrying its own amount, and the sum is arithmetic the ledger already does.
 *
 * ⚠️ POSITIVE amount, `kind: 'refund'`. The ledger's CHECK requires it — "amount_minor must be a
 * positive integer... kind carries the sign" — and getOrderBalance subtracts refunds from charges.
 */
export async function recordOnlineCardRefund(
  supabase: SupabaseClient,
  args: {
    orderKey: string
    truckId: string
    /** Minor units, POSITIVE, from the Refund object — never from the charge's cumulative total. */
    amountMinor: number
    /** Stripe's `re_...`. The identity of this refund and the whole of its idempotency. */
    refundId: string
    /** The intent this refund is against. Recorded so a row can be traced back without a join. */
    paymentIntentId: string | null
    livemode: boolean
    currency?: string
  },
) {
  return recordPaymentEvent(supabase, {
    orderKey: args.orderKey,
    truckId: args.truckId,
    kind: 'refund',
    channel: 'online',
    amountMinor: args.amountMinor,
    state: 'succeeded',
    method: 'card',
    // ⚠️ THE REFUND ID, NOT THE INTENT. `external_ref` is what a human follows back to Stripe, and for
    // this row the object at Stripe is the refund.
    externalRef: args.refundId,
    idempotencyKey: onlineRefundIdempotencyKey(args.refundId),
    livemode: args.livemode,
    currency: args.currency,
    createdBy: 'stripe_webhook',
    note: args.paymentIntentId ? `Card refund (${args.paymentIntentId})` : 'Card refund',
  })
}

/**
 * 🔴 A REFUND THAT FAILED AFTER WE ALREADY RECORDED IT. REMOVE THE ROW.
 *
 * ── WHY THIS EXISTS, AND WHY IT IS NOT THE PENDING CASE ────────────────────────────────────────
 * Stripe's own test card for this path documents the shape: `4000000000005126` / `pm_card_refundFail`
 * — "If you initiate a refund, its status begins as `succeeded`. Some time later, its status
 * transitions to `failed` and sends a `refund.failed` event."
 * 🔴 SO THE LEDGER ROW IS ALREADY WRITTEN BY THE TIME THE FAILURE ARRIVES. The refund was `succeeded`,
 * recordOnlineCardRefund booked it, getOrderBalance computed `refunded`, and every surface said so.
 * Then the bank returned the money to the truck and the customer got nothing. Without this, the order
 * reads REFUNDED forever for a refund that never happened — the worst direction, because it tells an
 * operator a customer has been made whole when they have not.
 *
 * ── DELETE, NEVER COMPENSATE, AND THE PRECEDENT IS reverseCollectionPayment ────────────────────
 * That function deletes rather than compensates when the row "represents no money", and this is the
 * same case read the other way: the refund row asserts money went back, and it came back. A
 * compensating `charge` row would inflate Sigma-visible takings by an amount nobody was ever paid.
 * ⚠️ AUDIT FIRST, WITH THE WHOLE ROW, AND THE AUDIT FAILING ABORTS THE DELETE — `logActionOrThrow`, the
 * same rule undo_collected follows: money evidence is never erased without a record of the erasure.
 * ⚠️ THEN recalc, so `orders.payment_status` returns to `paid`. It is derived, and the ledger just moved.
 *
 * @returns `removed` when a row was deleted, `none` when there was nothing recorded (the pending case,
 *          where the refund failed before it ever settled and no row was ever written).
 */
export async function removeFailedOnlineRefund(
  supabase: SupabaseClient,
  args: { orderKey: string; truckId: string; refundId: string; failureReason: string | null; eventType: string },
): Promise<{ outcome: 'removed' | 'none'; amountMinor: number }> {
  const { data: row, error } = await supabase
    .from('order_payments')
    // The FULL row, because this is what goes into action_audit_log.before_state and that log has to be
    // enough to reconstruct what was destroyed. Same list, same reason, as reverseCollectionPayment.
    .select('id, kind, channel, amount_minor, currency, state, external_ref, note, idempotency_key, created_at, created_by, livemode')
    .eq('idempotency_key', onlineRefundIdempotencyKey(args.refundId))
    .maybeSingle()

  if (error) throw new Error(`[online-refund] could not read the refund row for ${args.refundId}: ${error.message}`)
  if (!row) return { outcome: 'none', amountMinor: 0 }

  // 🔴 AUDIT BEFORE THE DELETE, AND A FAILED AUDIT ABORTS IT. logActionOrThrow, not logAction.
  await logActionOrThrow(supabase, {
    action: 'refund_reversed_failed',
    truckId: args.truckId,
    orderKey: args.orderKey,
    amountMinor: typeof row.amount_minor === 'number' ? row.amount_minor : null,
    beforeState: { ...row, refund_id: args.refundId, event_type: args.eventType },
    afterState: {
      deleted: true,
      failure_reason: args.failureReason,
      meaning: 'Stripe reported this refund FAILED after we had recorded it. The money came back to the '
             + 'truck, so the ledger row asserting a refund is removed and the order reads paid again.',
    },
    actor: { actorKind: 'unknown', actorId: null, actorLabel: null },
    source: 'web',
  })

  const { error: delErr } = await supabase.from('order_payments').delete().eq('id', row.id)
  if (delErr) throw new Error(`[online-refund] could not delete the failed refund row ${row.id}: ${delErr.message}`)

  // The cache is derived and the ledger just moved. This is the only writer of payment_status.
  await recalcOrderPayment(supabase, args.orderKey)
  return { outcome: 'removed', amountMinor: typeof row.amount_minor === 'number' ? row.amount_minor : 0 }
}
