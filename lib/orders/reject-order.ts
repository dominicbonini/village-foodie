// lib/orders/reject-order.ts
// 🔴 REFUSING AN ORDER, IN ONE PLACE, BECAUSE IT NOW MOVES MONEY.
//
// ── WHY THIS IS A MODULE AND NOT THIRTY LINES IN A ROUTE ────────────────────────────────────────────
// Rejecting releases a card authorisation (lib/payments/release-hold). While the logic lived inline in
// `app/api/dashboard/action`'s POST it could only ever run from a request — so anything else that needed
// to reject would have had to write the release call a SECOND time, which is a second place to get a
// money path wrong. Nothing else calls this yet; that is the point of extracting it before there is.
//
// ⚠️ THIS FILE IS A MOVE, NOT A REWRITE. The statements below are the route branch's statements, in the
// route branch's order, with their comments. Only the plumbing changed: what the handler read from `req`
// and `body` now arrives as arguments, and the two HTTP responses became return values.
//
// 🔴 `source` IS `ActorSource`, WHICH NOW ADMITS 'system' — the value a scheduled caller would pass,
// because it has no request and no human behind it. The union is enforced by a Postgres CHECK on
// action_audit_log, widened by hand on 19 August 2026 and recorded in
// supabase/migrations/20260819_action_audit_log_system_actor.sql.
// ⚠️ NOTHING PASSES 'system' YET, AND THIS FILE DOES NOT CARE WHICH VALUE ARRIVES. The type was widened
// ahead of any sweep precisely so the first automatic caller cannot fail a CHECK inside logAction —
// which would happen AFTER the card hold had already been cancelled at Stripe.
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveEmailPaymentState } from '@/lib/payments/email-payment-state'
import { releaseHoldForTerminalOrder } from '@/lib/payments/release-hold'
import {
  removeOrderFromProductionSlot,
  buildItemCatMap,
  normaliseOrderLines,
} from '@/lib/slot-bookings'
// THE SENDER MOVED TO lib/email SO BOTH CALLERS CAN REACH IT. It was route-local and the cancel branch
// uses it too, so leaving it there would have meant either a second copy or a route that imports its own
// internals back from here. Its body is unchanged and the cancel branch's call site is untouched.
import { rejectionPaymentSentence, notifyCustomer } from '@/lib/email'
import type { ResolvedActor, ActorSource } from '@/lib/audit/actor'

// Escape operator free-text before interpolating into a customer email's HTML (prevents broken
// markup / injection from a rejection/cancellation reason). NOTE: the CANCEL email (:cancellation
// reasonLine) does NOT escape today — same risk there; escape it too if/when that's touched.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** What happened, in the terms the caller needs to answer with. The route builds today's JSON from this
 *  and DERIVES NOTHING: `holdRelease` is the release outcome's own status, verbatim. */
export type RejectOutcome =
  | { ok: false; reason: 'order_not_found' }
  | { ok: true; status: 'rejected'; holdRelease: 'released' | 'none' | 'captured' | 'failed' }

/**
 * Reject an order: refuse it, give back any card hold, free the slot and tell the customer.
 *
 * ⚠️ IT DOES NOT GUARD ON STATUS, exactly as the route did not. A concurrency guard is its own piece of
 * work and adding one here would have made this refactor a behaviour change.
 */
export async function rejectOrder(
  supabase: SupabaseClient,
  args: {
    orderKey: string
    /** The truck row. Only `id` and `name` are read, and `name` reaches the customer's email. */
    truck: { id: string; name: string }
    /** The operator's free text, or null/absent. Escaped before it reaches the email. */
    rejectionReason?: string | null
    /** Who did it, for the audit row the release writes. */
    actor: ResolvedActor
    source: ActorSource
  },
): Promise<RejectOutcome> {
  const { orderKey, truck, rejectionReason, actor, source } = args
  const { data: order } = await supabase.from('orders').select('*').eq('order_key', orderKey).eq('truck_id', truck.id).single()
  if (!order) return { ok: false, reason: 'order_not_found' }
  // ── 🔴 WHAT THE MONEY WAS DOING, ASKED BEFORE ANYTHING MOVES. ────────────────────────────────
  // THE SAME ORDERING THE CANCEL BRANCH BELOW ESTABLISHES, AND FOR THE IDENTICAL REASON: releasing
  // stamps `authorization_cancelled_at`, after which the resolver answers 'hatch' — "Pay at the
  // truck on collection" — about an order the truck has just refused to cook. One read, one answer,
  // used by the email at the bottom of this branch.
  const rejectPaymentState = await resolveEmailPaymentState(supabase, orderKey)
  // Dedicated rejection_reason column (NOT cancellation_reason — a rejected order isn't cancelled).
  await supabase.from('orders').update({ status: 'rejected', rejection_reason: rejectionReason || null }).eq('order_key', orderKey).eq('truck_id', truck.id)
  // ── 🔴 THE ORDER IS REJECTED FIRST, AND THE HOLD IS RELEASED AFTER — CANCEL'S ORDERING. ─────
  // A hold is not money out. Nothing has been taken, and a release that fails leaves an
  // authorisation that expires by itself in about a week — so an operator refusing an order
  // mid-service must never be blocked by Stripe being slow, and this call cannot fail the request:
  // every outcome is a return value and it cannot throw.
  // ⚠️ IT ONLY EVER RELEASES. See lib/payments/release-hold: an order whose money was already taken
  // is refused outright, and so is one whose ledger would not answer.
  // 🔴 REJECT IS WHERE THE HOLD WAS BEING LEFT BEHIND. A rejected order is terminal and was never
  // served, so its authorisation can never become a charge — and until this call existed neither
  // sweep could see it: the capture sweep's allow-list excludes every unaccepted status, and the
  // abandonment sweep owns `promoted_at is null`, which a promoted order fails by construction.
  const rejectRelease = await releaseHoldForTerminalOrder(supabase, {
    orderKey, truckId: truck.id, trigger: 'operator_reject', actor, source,
  })
  // 🔴 THE REJECTION STANDS EITHER WAY, BUT A FAILED RELEASE IS NOT SILENT. The module has already
  // written a `hold_release_failed` audit row; this puts it in the server log beside the action that
  // caused it, and the response carries the outcome so no caller can read `success: true` as
  // "and the card was let go".
  if (rejectRelease.status === 'released') {
    console.log(`[reject] hold released pi=${rejectRelease.paymentIntentId} order_key=${orderKey} (operator)`)
  } else if (rejectRelease.status === 'failed' || rejectRelease.status === 'captured') {
    console.error(
      `[reject] 🔴 THE HOLD WAS NOT RELEASED for order_key=${orderKey}: ${rejectRelease.status}. The ` +
      `order IS rejected. See action_audit_log for hold_release_failed, and lib/payments/release-hold ` +
      `for why a captured order is refused here rather than refunded.`,
    )
  }
  if (order.event_date) {
    // order.slot may be null (ASAP) — removeOrderFromProductionSlot resolves
    // it to the same event-start window the booking used, so it unbooks cleanly.
    const itemCatMap = await buildItemCatMap(supabase, truck.id)
    await removeOrderFromProductionSlot(
      supabase, truck.id, order.event_id, order.slot,
      normaliseOrderLines(order.items || [], order.deals), itemCatMap
    )
  }
  // Ceiling model (step 3): NO option-stock reversal needed — nothing was decremented at placement
  // (the ceiling is computed live from active orders), so removing this order from the live set on
  // reject IS the credit-back. Was: releaseOptionStock (the decrement pool, removed).
  if (order.customer_email) {
    // Mirrors the cancel email's reasonLine — the operator's reason, escaped, shown to the customer.
    const reasonLine = rejectionReason ? `<p style="color:#475569">Reason: ${escapeHtml(rejectionReason)}</p>` : ''
    // ── 🔴 ONE SENTENCE ABOUT THE MONEY, AND IT REPORTS WHAT ACTUALLY HAPPENED. ────────────────
    // The state was read BEFORE the status changed and the release ran; whether the hold really went
    // back comes from the release's own return value, never from having asked for it. A pay-at-hatch
    // rejection — which is most of them — gets "You have not been charged for this order."
    const rejectMoney = rejectionPaymentSentence({
      truckName: truck.name,
      paymentState: rejectPaymentState,
      holdReleased: rejectRelease.status === 'released'
        || (rejectRelease.status === 'none' && rejectRelease.reason === 'already_released'),
    })
    await notifyCustomer(truck, order.customer_email, `Order #${order.id} update`,
      `<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">
        <h2>Order update</h2>
        <p>Unfortunately <strong>${truck.name}</strong> is unable to fulfil order #${order.id}.</p>
        ${reasonLine}
        ${rejectMoney.html}
        <p>Please order at the truck on arrival. Sorry for the inconvenience.</p>
        <p style="color:#64748b;font-size:13px">Powered by HatchGrab · hatchgrab.com</p>
      </body>`,
      // THE TEXT TWIN, FROM THE SAME SENTENCE. notifyCustomer's own contract: an email that states
      // what happened to a customer's money must say it in both renderings, or a text-only client
      // reads Brevo's strip of the markup and the two can disagree.
      `Unfortunately ${truck.name} is unable to fulfil order #${order.id}.`
      + `${rejectionReason ? ' Reason: ' + rejectionReason : ''}${rejectMoney.text}`
      + ` Please order at the truck on arrival. Sorry for the inconvenience. Powered by HatchGrab — hatchgrab.com`)
  }
  // ⚠️ ADDITIVE FIELD. `success` and `status` are unchanged and mean exactly what they meant; the
  // rejection did happen. `hold_release` is the money half of the answer, which had no field before
  // because there was no money half.
  return { ok: true, status: 'rejected', holdRelease: rejectRelease.status }

}
