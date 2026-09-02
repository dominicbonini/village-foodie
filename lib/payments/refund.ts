// lib/payments/refund.ts
// 🔴 THE ONE PLACE AN OPERATOR'S REFUND REACHES STRIPE. Every guard lives here, not in the UI.
//
// ── WHY THE GUARDS ARE HERE AND NOT ON THE CARD ────────────────────────────────────────────────────
// A form can be edited, replayed, or bypassed entirely by a POST. The amount that leaves this function
// is the amount that leaves the truck's bank, so the only figure that decides anything is one this
// module computed for itself, from sources the browser cannot touch.
//
// ── 🔴 "HOW MUCH HAS ALREADY GONE BACK" COMES FROM STRIPE, NOT FROM OUR LEDGER ─────────────────────
// This is the single most important decision in the file. lib/payments/online.ts states the rule that
// makes our own ledger the wrong source: "NO LEDGER ROW UNTIL THE MONEY HAS ACTUALLY GONE BACK" — a
// PENDING refund (which a Connect direct charge produces whenever the connected account's balance is
// short) writes nothing at all until it settles. So a second refund issued during that window would be
// measured against a ledger that has not moved, and the two together could exceed the charge.
// `refunds.list` counts the pending one. It costs one round trip on a rare path.
//
// ── ⚠️ THIS FILE WRITES THE SAME ROW THE WEBHOOK WRITES, THROUGH THE SAME FUNCTION ─────────────────
// recordOnlineCardRefund, keyed `stripe_re:<refund id>`. When Stripe's own event for this refund
// arrives moments later the webhook calls the identical function with the identical key and the insert
// is a 23505 no-op. There is no second shape and no second writer.
import type { SupabaseClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { readLedger, type OrderBalance, readOrderBalance } from '@/lib/payments/ledger'
import { recordOnlineCardRefund } from '@/lib/payments/online'
import { stripeAccountForTruck } from '@/lib/payments/authorize'
import { logAction } from '@/lib/audit/actionAudit'
import type { ResolvedActor } from '@/lib/audit/actor'
import { stripeClient } from '@/lib/stripe/client'

/**
 * 🔴 THE OPERATOR'S REASONS, WHICH ARE NOT STRIPE'S.
 *
 * Stripe accepts exactly three: `duplicate`, `fraudulent`, `requested_by_customer`. A food truck's
 * reasons are operational — an item ran out, an order was never collected — and forcing them into three
 * would destroy the only record of WHY, which is the thing an operator will want in a month.
 * So the full reason and the note go to OUR audit log and to the refund's Stripe metadata, and only the
 * coarse mapping below goes to Stripe's own field.
 * ⚠️ `fraudulent` IS DELIBERATELY UNREACHABLE. It is a chargeback-risk signal to the card networks, not
 * a description of a wrong sandwich, and nothing in this list means it.
 */
export const REFUND_REASONS = [
  'item_unavailable',
  'not_collected',
  'wrong_or_missing_item',
  'quality_issue',
  'duplicate_payment',
  'customer_cancelled',
  'other',
] as const
export type RefundReason = (typeof REFUND_REASONS)[number]

/** Our seven, onto Stripe's three. Everything that is not literally a duplicate is the customer's ask. */
export function stripeReasonFor(reason: RefundReason): 'duplicate' | 'requested_by_customer' {
  return reason === 'duplicate_payment' ? 'duplicate' : 'requested_by_customer'
}

export type RefundOutcome =
  /** Money has gone back and the ledger row is written. */
  | { status: 'refunded'; refundId: string; amountMinor: number; balance: OrderBalance | null }
  /** 🔴 STRIPE HAS ACCEPTED IT AND THE MONEY HAS NOT MOVED YET. No ledger row, by design. */
  | { status: 'pending'; refundId: string; amountMinor: number }
  /** A guard said no. Nothing was sent to Stripe. */
  | { status: 'refused'; reason: 'not_card' | 'invalid_amount' | 'exceeds_remaining'; detail: string; remainingMinor: number }
  /** Stripe or the network failed. Whether money moved is stated in `detail`. */
  | { status: 'failed'; detail: string }

/**
 * What this order could still have refunded, in minor units, and the intent to refund it against.
 *
 * ⚠️ CAPTURED IS OUR LEDGER'S FIGURE AND THAT IS CORRECT: a charge row is only written when Stripe has
 * confirmed the money moved, so it cannot overstate. REFUNDED IS STRIPE'S, for the pending reason above.
 */
async function refundableFor(
  supabase: SupabaseClient,
  stripe: Stripe,
  orderKey: string,
  account: string,
): Promise<{ capturedMinor: number; refundedMinor: number; remainingMinor: number; paymentIntentId: string | null }> {
  const rows = await readLedger(supabase, orderKey)
  const cardCharges = rows.filter(r => r.kind === 'charge' && r.channel === 'online')
  const capturedMinor = cardCharges.reduce((sum, r) => sum + r.amount_minor, 0)
  // The intent is on the charge row's external_ref — recordOnlineCardPayment writes it there.
  const paymentIntentId = cardCharges.find(r => r.external_ref)?.external_ref ?? null
  if (!paymentIntentId || capturedMinor <= 0) {
    return { capturedMinor, refundedMinor: 0, remainingMinor: 0, paymentIntentId: null }
  }
  const list = await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100 }, { stripeAccount: account })
  // 🔴 EVERYTHING STRIPE IS STILL HOLDING OPEN COUNTS. `failed` and `canceled` money came back to the
  // truck and is refundable again; `pending`, `requires_action` and `succeeded` are all on their way out.
  const refundedMinor = list.data
    .filter(r => r.status !== 'failed' && r.status !== 'canceled')
    .reduce((sum, r) => sum + (r.amount ?? 0), 0)
  return { capturedMinor, refundedMinor, remainingMinor: Math.max(0, capturedMinor - refundedMinor), paymentIntentId }
}

/**
 * Issue a refund an operator asked for.
 *
 * 🔴 IT CANNOT THROW PAST THE GUARDS. Everything a caller needs to say to an operator is a return value,
 * so a route can render a refusal without inspecting an exception.
 */
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
    source: 'web' | 'native' | 'offline_replay' | 'system'
  },
): Promise<RefundOutcome> {
  const account = await stripeAccountForTruck(supabase, args.truckId)
  if (!account) {
    return { status: 'failed', detail: 'This truck has no Stripe account, so nothing can be refunded from here.' }
  }
  const stripe = stripeClient()

  let refundable: Awaited<ReturnType<typeof refundableFor>>
  try {
    refundable = await refundableFor(supabase, stripe, args.orderKey, account)
  } catch (err) {
    // 🔴 "I COULD NOT TELL" IS A REFUSAL, NEVER AN ASSUMPTION. Exactly the rule capture follows before it
    // moves money: a balance we could not read is not evidence that a refund is safe.
    const detail = err instanceof Error ? err.message : String(err)
    console.error(`[refund] 🔴 could not establish what is refundable for order_key=${args.orderKey}:`, detail)
    return { status: 'failed', detail: 'We could not check what has already been refunded, so nothing was sent.' }
  }

  // ── 🔴 THE GUARDS. SERVER-SIDE, IN THIS ORDER, AND NONE OF THEM READS THE REQUEST. ───────────────
  if (!refundable.paymentIntentId || refundable.capturedMinor <= 0) {
    return {
      status: 'refused', reason: 'not_card', remainingMinor: 0,
      detail: 'Nothing was taken by card on this order, so there is nothing to refund here.',
    }
  }
  if (!Number.isInteger(args.amountMinor) || args.amountMinor <= 0) {
    return {
      status: 'refused', reason: 'invalid_amount', remainingMinor: refundable.remainingMinor,
      detail: 'Enter an amount greater than zero.',
    }
  }
  if (args.amountMinor > refundable.remainingMinor) {
    // ⚠️ THE SECOND-REFUND CASE IS THE SAME LINE. `remainingMinor` is captured minus everything Stripe is
    // already holding open, so a first refund of the full amount leaves zero and this refuses at once.
    return {
      status: 'refused', reason: 'exceeds_remaining', remainingMinor: refundable.remainingMinor,
      detail: refundable.remainingMinor === 0
        ? 'This order has already been fully refunded.'
        : `Only £${(refundable.remainingMinor / 100).toFixed(2)} is left to refund on this order.`,
    }
  }

  // ── 🔴 THE IDEMPOTENCY KEY, AND WHY IT CARRIES THE REFUNDED-SO-FAR FIGURE ────────────────────────
  // A STATE-TRANSITION key, the same shape collectIdempotencyKey uses: "from this refund position, send
  // this amount". A double-tap repeats it and Stripe returns the SAME refund rather than making a second.
  // A genuine second refund is measured from a moved position, so it keys differently.
  // ⚠️ IT IS BUILT FROM STRIPE'S FIGURE, NOT OURS, WHICH IS WHAT MAKES IT SAFE DURING A PENDING REFUND —
  // the position moves the moment Stripe accepts, not when the money lands.
  const idempotencyKey = `op_refund:${args.orderKey}:${refundable.refundedMinor}:${args.amountMinor}`

  let refund: Stripe.Refund
  try {
    // ── 🔴 THE DAY A PLATFORM FEE EXISTS, THIS CALL SILENTLY SHORTCHANGES THE TRUCK ─────────────────
    // CORRECT TODAY, AND ONLY BECAUSE THERE IS NO FEE. `application_fee_amount` is never sent anywhere in
    // this build — authorize.ts and capture.ts both record "absence, never zero", and the commercial model
    // is 0% on every tier. With no fee on the charge there is nothing for a refund to give back.
    // ⚠️ THE TRAP IS STRIPE'S DEFAULT, NOT OUR CODE. On a DIRECT charge, `refunds.create` WITHOUT an
    // explicit `refund_application_fee: true` leaves the application fee WITH THE PLATFORM. So the moment
    // a fee is introduced, this unchanged call refunds the customer in full out of the CONNECTED ACCOUNT
    // while HatchGrab keeps its cut — the truck absorbs the platform's fee on every refund it issues.
    // 🔴 IT FAILS SILENTLY AND IN THE TRUCK'S DISFAVOUR. No error, no refused status, no audit anomaly:
    // the refund succeeds, the customer is made whole, and the shortfall is invisible until someone
    // reconciles a payout by hand. This file's other guards all fail LOUD; this one would not.
    // 🔴 SET `refund_application_fee` IN THE SAME COMMIT THAT INTRODUCES THE FEE — not afterwards, and not
    // as a follow-up ticket. If a fee is ever added and this line is still unchanged, that is the bug.
    refund = await stripe.refunds.create(
      {
        payment_intent: refundable.paymentIntentId,
        amount: args.amountMinor,
        reason: stripeReasonFor(args.reason),
        // ⚠️ OUR REASON TRAVELS TOO, so a human in the Stripe Dashboard sees what the operator chose
        // rather than the three-value approximation. The audit row below is the durable record.
        metadata: {
          order_key: args.orderKey,
          truck_id: args.truckId,
          hatchgrab_reason: args.reason,
          ...(args.note ? { hatchgrab_note: args.note.slice(0, 400) } : {}),
        },
      },
      { stripeAccount: account, idempotencyKey },
    )
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error(`[refund] 🔴 STRIPE REFUSED for order_key=${args.orderKey} amount=${args.amountMinor}:`, detail)
    return { status: 'failed', detail }
  }

  // ── THE AUDIT ROW. WRITTEN FOR EVERY OUTCOME, INCLUDING PENDING. ─────────────────────────────────
  // 🔴 IT IS THE ONLY RECORD OF WHY. Stripe keeps three reasons and our own seven live here, with the
  // note, the actor and the figures the guards used.
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
      refund_id: refund.id,
      stripe_status: refund.status,
      stripe_reason: stripeReasonFor(args.reason),
      reason: args.reason,
      note: args.note ?? null,
      resolves: settled ? undefined : 'refund_pending',
      meaning: settled
        ? 'the money has gone back to the customer and the ledger row is written'
        : 'Stripe has accepted the refund and the money has NOT moved yet; no ledger row until it settles',
    },
    actor: args.actor,
    source: args.source,
  })

  if (!settled) {
    // 🔴 NO LEDGER ROW. lib/payments/online.ts owns this rule and the webhook's refund.updated branch is
    // what turns a settled refund into one. Writing an inert row here would be a second state to keep.
    console.warn(
      `[refund] PENDING re=${refund.id} order_key=${args.orderKey} amount=${args.amountMinor} — Stripe has ` +
      `accepted it and the money has not moved. The ledger stays as it is until refund.updated settles it.`,
    )
    return { status: 'pending', refundId: refund.id, amountMinor: args.amountMinor }
  }

  // ── THE LEDGER ROW, THROUGH THE WEBHOOK'S OWN WRITER. ────────────────────────────────────────────
  try {
    await recordOnlineCardRefund(supabase, {
      orderKey: args.orderKey,
      truckId: args.truckId,
      amountMinor: refund.amount ?? args.amountMinor,
      refundId: refund.id,
      paymentIntentId: refundable.paymentIntentId,
      // ⚠️ FROM OUR OWN KEY'S MODE, exactly as capture does it: a refund is not an event and carries no
      // livemode of its own to copy here. With the key guard removed, an `sk_live_` key makes this `true`
      // and the refund row counts as live money without an edit to this line.
      livemode: !process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'),
      currency: refund.currency ?? undefined,
    })
  } catch (ledgerErr) {
    // 🔴 THE MONEY HAS GONE BACK AND WE FAILED TO RECORD IT. Loud, and RECOVERABLE WITHOUT US: Stripe's
    // own refund.created / charge.refunded arrives within seconds and writes the identical row under the
    // identical `stripe_re:` key. The one thing this must not do is report a failure the operator would
    // retry — that would send a SECOND refund for money already returned.
    const detail = ledgerErr instanceof Error ? ledgerErr.message : String(ledgerErr)
    console.error(
      `[refund] 🔴 REFUNDED BUT NOT RECORDED re=${refund.id} order_key=${args.orderKey} ` +
      `amount=${args.amountMinor}: ${detail}. THE CUSTOMER HAS BEEN REFUNDED. The webhook's refund.created ` +
      `should write the same row under the same key; do NOT refund again.`,
    )
    return { status: 'refunded', refundId: refund.id, amountMinor: args.amountMinor, balance: null }
  }

  let balance: OrderBalance | null = null
  try { balance = await readOrderBalance(supabase, args.orderKey) } catch { balance = null }
  console.log(`[refund] REFUNDED re=${refund.id} order_key=${args.orderKey} amount_minor=${args.amountMinor} -> status=${balance?.status ?? 'unknown'}`)
  return { status: 'refunded', refundId: refund.id, amountMinor: args.amountMinor, balance }
}
