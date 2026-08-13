// lib/payments/release-hold.ts
// 🔴 GIVE A HELD CARD BACK WHEN THE ORDER IT WAS HELD FOR NO LONGER EXISTS.
//
// ── THE GAP THIS CLOSES ─────────────────────────────────────────────────────────────────────────────
// The cancel handler updated `status`, unbooked the slot and emailed, and never touched Stripe. Neither
// sweep could pick the leftovers up either: the CAPTURE sweep's allow-list is
// ('confirmed','modified','cooking','ready','collected') — 'cancelled' is deliberately absent, because
// that job may only ever capture — and the ABANDONMENT sweep owns `promoted_at is null`, which a
// promoted order fails by construction. So a cancelled order's hold sat on a customer's card for about
// seven days against an order that no longer existed, and nothing told anyone.
//
// ── 🔴 THIS FILE ONLY EVER RELEASES. IT CANNOT TAKE MONEY. ─────────────────────────────────────────
// It imports no capture and no refund, and it makes no Stripe call of its own: the only thing it can do
// to a PaymentIntent is hand it to promoteDraft's `releaseHold`, which is the SAME function the refusal
// branch uses and which reaches Stripe through `cancelAuthorization` — the one and only place in this
// codebase that calls `paymentIntents.cancel`. `grep -rn "paymentIntents\." lib/payments/release-hold.ts`
// returns nothing, and that is the guarantee, not a promise.
//
// ── ⚠️ AND IT REFUSES OUTRIGHT ON AN ORDER WHOSE MONEY WAS ALREADY TAKEN ───────────────────────────
// A captured order has no hold to release, and cancelling a succeeded PaymentIntent is not a refund —
// Stripe would reject it, but this does not rely on that. The ledger is asked first, with the same
// `stripe_pi:` key capture itself uses as its layer-1 idempotency check.
import type { SupabaseClient } from '@supabase/supabase-js'
import { getOrderDraft } from '@/lib/payments/order-drafts'
import { onlinePaymentIdempotencyKey } from '@/lib/payments/online'
// 🔴 THE EXISTING RELEASE, NOT A SECOND ONE. Cancel at Stripe, then stamp the draft, in that order,
// with the logging that goes with it — see its own header for why the order is load-bearing.
import { releaseHold } from '@/lib/payments/promote-draft'
import { logAction } from '@/lib/audit/actionAudit'

export type ReleaseOutcome =
  /** A live hold was cancelled at Stripe and the draft is stamped. */
  | { status: 'released'; paymentIntentId: string; amountMinor: number | null }
  /** Nothing to do, and not an error: no draft, no intent, already released, or nothing was held. */
  | { status: 'none'; reason: 'no_draft' | 'no_intent' | 'already_released' }
  /** 🔴 THE MONEY WAS TAKEN. A refund is the action, not a release, and this refuses to touch it. */
  | { status: 'captured'; paymentIntentId: string }
  /** Stripe would not cancel it. THE HOLD MAY STILL BE LIVE — see the audit row this writes. */
  | { status: 'failed'; paymentIntentId: string; detail: string }

/**
 * Release the authorisation behind a cancelled order, if there is one.
 *
 * 🔴 IT CANNOT THROW. Every failure is a return value, because the caller is a cancellation and a
 * cancellation must never fail because Stripe was slow — see the ordering note at both call sites.
 *
 * @param trigger which cancellation asked for it. Recorded, so "did the customer or the operator cancel
 *                this" is answerable from the audit log rather than by inference.
 */
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
    // ── 1. IS THERE AN AUTHORISATION AT ALL? ──────────────────────────────────────────────────
    // 🔴 THE CHEAP NO-OP FOR EVERY PAY-AT-HATCH AND WALK-UP ORDER: one primary-key read, and out. No
    // Stripe client is constructed and no network call is made. The overwhelming majority of
    // cancellations end here and must cost almost nothing — the same shape captureOnConfirmation opens
    // with, for the same reason.
    const draft = await getOrderDraft(supabase, args.orderKey)
    if (!draft) return { status: 'none', reason: 'no_draft' }
    if (!draft.payment_intent_id) return { status: 'none', reason: 'no_intent' }
    if (draft.authorization_cancelled_at) return { status: 'none', reason: 'already_released' }

    // ── 2. 🔴 WAS THE MONEY ALREADY TAKEN? IF SO, THIS IS NOT OUR ACTION. ─────────────────────
    // The same question capture asks itself before it moves anything, keyed the same way: one row,
    // `stripe_pi:<intent>`, written by capture and by the webhook under the identical key. If it exists
    // the hold became a charge and there is nothing to release — the money is on the customer's card
    // and only the REFUND path can send it back. Releasing is not a refund and must never stand in for
    // one.
    const { data: captured, error: ledgerErr } = await supabase
      .from('order_payments')
      .select('id')
      .eq('idempotency_key', onlinePaymentIdempotencyKey(draft.payment_intent_id))
      .maybeSingle()
    if (ledgerErr) {
      // 🔴 "I COULD NOT TELL" IS A REFUSAL. A read failure is not evidence that nothing was captured,
      // and acting on that guess is how a paid order gets its charge cancelled.
      console.error(
        `[release-hold] 🔴 could not check whether order_key=${args.orderKey} was captured — REFUSING to ` +
        `release pi=${draft.payment_intent_id}:`, ledgerErr.message,
      )
      return { status: 'failed', paymentIntentId: draft.payment_intent_id, detail: `ledger read failed: ${ledgerErr.message}` }
    }
    if (captured) return { status: 'captured', paymentIntentId: draft.payment_intent_id }

    // ── 3. THE RELEASE — promoteDraft's, unchanged. ──────────────────────────────────────────
    const ok = await releaseHold(supabase, {
      order_key: draft.order_key,
      truck_id: draft.truck_id ?? args.truckId,
      payment_intent_id: draft.payment_intent_id,
    })

    const actor = args.actor ?? { actorKind: 'unknown' as const, actorId: null, actorLabel: null }
    if (!ok) {
      // ── 🔴 THE HOLD MAY STILL BE LIVE, SO IT IS WRITTEN DOWN WHERE SOMEBODY CAN FIND IT. ────
      // `authorization_cancelled_at` stays NULL, deliberately: the draft still reads as an uncancelled
      // authorisation, which is what any future collector will look for. One query finds every one:
      //     select * from action_audit_log where action = 'hold_release_failed' order by created_at desc;
      // ⚠️ THE CANCELLATION IS NOT UNDONE. The order is already cancelled by the time this runs, and
      // reversing a customer's cancellation because Stripe was unreachable would be far worse than a
      // hold that expires on its own in about a week.
      console.error(
        `[release-hold] 🔴 COULD NOT RELEASE pi=${draft.payment_intent_id} for cancelled order_key=` +
        `${args.orderKey} (${args.trigger}). The order IS cancelled and a hold may remain on this ` +
        `customer's card until it expires. Recorded as hold_release_failed.`,
      )
      await logAction(supabase, {
        action: 'hold_release_failed',
        truckId: args.truckId,
        orderKey: args.orderKey,
        amountMinor: typeof draft.total_minor === 'number' ? draft.total_minor : null,
        beforeState: { payment_intent_id: draft.payment_intent_id, trigger: args.trigger },
        afterState: {
          released: false,
          meaning: 'the order was cancelled and its card authorisation was NOT released; the hold may still be live',
          resolves: 'cancel_this_intent_by_hand_or_let_it_expire',
        },
        actor,
        source: args.source ?? 'web',
      })
      return { status: 'failed', paymentIntentId: draft.payment_intent_id, detail: 'cancelAuthorization returned false' }
    }

    await logAction(supabase, {
      action: 'hold_released',
      truckId: args.truckId,
      orderKey: args.orderKey,
      amountMinor: typeof draft.total_minor === 'number' ? draft.total_minor : null,
      beforeState: { payment_intent_id: draft.payment_intent_id, trigger: args.trigger },
      afterState: { released: true, meaning: 'the order was cancelled and the card authorisation was released; no money moved' },
      actor,
      source: args.source ?? 'web',
    })
    return {
      status: 'released',
      paymentIntentId: draft.payment_intent_id,
      amountMinor: typeof draft.total_minor === 'number' ? draft.total_minor : null,
    }
  } catch (err) {
    // 🔴 THE OUTER NET. Nothing above may reach a caller as an exception, because every caller is a
    // cancellation and a cancellation must not fail over money that has not moved.
    const detail = err instanceof Error ? err.message : String(err)
    console.error(`[release-hold] 🔴 UNEXPECTED for order_key=${args.orderKey} (${args.trigger}):`, detail)
    return { status: 'failed', paymentIntentId: '', detail }
  }
}
