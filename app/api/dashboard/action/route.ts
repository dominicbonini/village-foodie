// app/api/dashboard/action/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { formatConfirmationEmail, formatNewOrderEmail, sendConfirmationEmail, renderOrderLinesHtml, paymentNote } from '@/lib/email'
// 🔴 THE ONE RESOLVER EVERY EMAIL IN THIS FILE ASKS. Four sites here used to print "Pay at the truck on
// collection" unconditionally — to customers whose card was held, and to customers already charged.
// None of them works the answer out for itself; they all call this. See lib/payments/email-payment-state.
import { resolveEmailPaymentState, resolveEmailPayment } from '@/lib/payments/email-payment-state'
// 🔴 THE SERVER-SIDE HALF OF "DO NOT COLLECT THIS AT THE HATCH". The order card hides the button; these
// two branches are what stops an offline replay, a stale board or the KDS booking the payment anyway.
// Same resolver the CARD HELD chip reads, so the button and the guard cannot disagree.
import { hasHeldAuthorisation } from '@/lib/payments/held-authorisation'
import { isDemoIdentifier } from '@/lib/demo'
import { getVanOrderReadyDefault } from '@/lib/van-utils'
import { hasValidEventTimes } from '@/lib/time-utils'
import {
  addOrderToProductionSlot,
  removeOrderFromProductionSlot,
  moveSlotBooking,
  buildItemCatMap,
  normaliseOrderLines,
  deriveProductionSlot,
  rebuildProductionSlotUsage,
} from '@/lib/slot-bookings'
import { nextOrderId } from '@/lib/order-utils'
import { loadPriceBook, repriceOrder, toMinor, type RepriceItem } from '@/lib/order-repricing'
// 🔴 recalcOrderPayment IS THE ONLY WRITER OF orders.payment_status / amount_paid, and the edit handler
// is the only thing that moves the other side of `balance = total_minor - paid`. See the EDIT branch.
import { recordCollectionPayment, reverseCollectionPayment, recalcOrderPayment } from '@/lib/payments/ledger'
import { captureOnConfirmation } from '@/lib/payments/capture'
// 🔴 EVERY REFUND GUARD LIVES IN THAT MODULE, NOT HERE. This route validates the request's shape and
// renders the outcome; the amount, the already-refunded figure and the fit are decided there.
import { refundOrder, REFUND_REASONS } from '@/lib/payments/refund'
// 🔴 THE HOLD BEHIND A CANCELLED ORDER. Release only — it cannot capture and it refuses a captured order.
import { releaseHoldForCancelledOrder } from '@/lib/payments/release-hold'
import { resolveActorSafe, resolveActorSource } from '@/lib/audit/actor'
import { resolvePaidStep } from '@/lib/payments/paid-step'
import { assignBuzzer } from '@/lib/buzzer'
import { logAction, logActionOrThrow } from '@/lib/audit/actionAudit'
import type { DiscountCode } from '@/lib/order-calculations'
import { validateModifierSelection, hasUnsatisfiableRequiredGroup } from '@/lib/modifier-rules'
import { getLiveItemCounts, enforceStockLimits } from '@/lib/stock-availability'
import { acquireEventLock, releaseEventLock, checkStockShortfall, checkClosedCategories } from '@/lib/stock-guard'
import { findSoldOutOption, checkOptionCeilingShortfall } from '@/lib/option-stock'


/** Resolve the paid-step settings for ONE event, server-side, through the SAME helper the client uses.
 *  🔴 The ?? chain lives in lib/payments/paid-step.ts and nowhere else — this only supplies the event
 *  row. A second inline `?? truck.show_paid_step` anywhere would let the server and the order card
 *  disagree about whether the paid step is split, which is the divergence this design exists to make
 *  impossible. A missing eventId resolves to the truck default, which is the correct fallback. */
async function paidStepFor(truck: any, eventId: string | null | undefined) {
  if (!eventId) return resolvePaidStep(truck, null)
  const { data: ev, error: evErr } = await supabase
    .from('truck_events')
    // 🔴 DEPLOY-COUPLED, IN ONE DIRECTION ONLY. `completion_presses_override` was added here on
    // 10 August 2026, which makes THIS BUILD REQUIRE supabase/migrations/
    // 20260810_truck_events_completion_presses_override.sql TO HAVE BEEN APPLIED FIRST. A named select
    // on a column that does not exist is 42703 and fails the WHOLE statement — see the handler below,
    // which then falls back to the truck defaults and silently ignores every per-event override.
    // Migration first, then deploy. The reverse order is the failure this file already documents.
    .select('show_paid_step_override, takes_cash_override, completion_presses_override')
    .eq('id', eventId)
    .eq('truck_id', truck.id)
    .maybeSingle()
  // ── ⚠️ THIS FAILS TO A WRONG VALUE, NOT TO A CRASH (V9.5) ────────────────────────────────────────
  // A NAMED select on the two override columns, so it carries the same 42703 exposure that emptied the
  // dashboard board. Here the consequence is quieter and therefore worse: `ev` is null, resolvePaidStep
  // falls back to the TRUCK DEFAULTS, and `collected` / `undo_collected` / the walk-up paid-at-order path
  // all proceed with the event's override SILENTLY IGNORED. Today both defaults are false so the
  // fallback happens to be right — and it will not stay right. The first operator to enable cash for one
  // event would get card-only behaviour server-side with no signal anywhere.
  //
  // We log and continue: refusing the action would block a collection mid-service, which is a far worse
  // outcome than resolving one setting from the default. The log is what makes the divergence findable.
  if (evErr) {
    console.error(
      `[action] paid-step lookup FAILED for event ${eventId} (truck ${truck.id}) — falling back to the ` +
      `TRUCK DEFAULTS, so any per-event show_paid_step/takes_cash override is being IGNORED for this ` +
      `action:`, evErr.message,
    )
  }
  return resolvePaidStep(truck, ev as any)
}

async function verifyToken(token: string, pin?: string) {
  const { data: truck } = await supabase
    .from('trucks').select('*').eq('dashboard_token', token).single()
  if (!truck) return null
  if (truck.dashboard_pin && truck.dashboard_pin !== pin) return null
  return truck
}

// Escape operator free-text before interpolating into a customer email's HTML (prevents broken
// markup / injection from a rejection/cancellation reason). NOTE: the CANCEL email (:cancellation
// reasonLine) does NOT escape today — same risk there; escape it too if/when that's touched.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ── 🔴 DEMO TRUCKS NEVER SEND EMAIL ────────────────────────────────────────────────────────────────────
// A demo's order addresses are whatever the prospect typed into their own test order — fake or throwaway.
// Sending produces hard bounces that damage the SHARED sender reputation every real truck's confirmations
// depend on, and Brevo Free is a 300/day shared cap that stops sending SILENTLY once hit.
//
// This file had EIGHT send sites (ready / confirm / reject / cancel / edit / manual-customer / manual-truck
// / bulk-update). Guarding each one individually would be eight chances to miss one — and a missed one is
// invisible until the bounce rate moves. So every send goes through ONE wrapper: the guard cannot be
// bypassed by adding a new call site that follows the existing pattern, and `sendConfirmationEmail` is no
// longer called directly anywhere below.
async function sendEmailUnlessDemo(
  truck: { id?: string | null; name?: string | null } | null | undefined,
  params: Parameters<typeof sendConfirmationEmail>[0],
) {
  if (isDemoIdentifier(truck?.id)) {
    console.log(`[dashboard/action] demo truck ${truck?.id} — email to ${params.to} suppressed`)
    return
  }
  await sendConfirmationEmail(params)
}

// Raw Brevo sender for the reject/cancel notices. Takes the TRUCK (not just its name) so it shares the
// demo guard above — passing only truckName would have left these two sites unguarded.
async function notifyCustomer(
  truck: { id?: string | null; name?: string | null } | null | undefined,
  email: string,
  subject: string,
  html: string,
) {
  const truckName = truck?.name ?? undefined
  if (isDemoIdentifier(truck?.id)) {
    console.log(`[dashboard/action] demo truck ${truck?.id} — email to ${email} suppressed`)
    return
  }
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey || !email) return
  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender:      { name: truckName || 'HatchGrab', email: process.env.EMAIL_FROM_ADDRESS || 'donotreply@villagefoodie.co.uk' },
        to:          [{ email }],
        subject,
        htmlContent: html,
      }),
    })
  } catch (err) { console.error('Email failed:', err) }
}

// Build + send the customer "order ready" email (variant:'ready'). Extracted so BOTH the synchronous path
// (KDS / non-deferred 'ready') and the deferred path ('send_ready_email', fired ~4s after the dashboard
// Ready click if not undone) share ONE implementation. Resolves the venue by the order's own event_id.
async function deliverReadyEmail(order: any, truck: any) {
  if (!order.customer_email) return
  let eventQuery = supabase
    .from('truck_events')
    .select('venue_name, town, postcode')
    .eq('truck_id', truck.id)
  eventQuery = order.event_id
    ? eventQuery.eq('id', order.event_id)
    : eventQuery.eq('event_date', order.event_date).neq('status', 'cancelled')
  const { data: eventRow } = await eventQuery.maybeSingle()
  // ── 🔴 THE READY EMAIL SAID "Pay at the truck." TWICE, TO EVERYONE. ─────────────────────────────
  // Once in the headline ("come and collect from X. Pay at the truck.") and once in the payment box.
  // For a card order that has been confirmed and captured, both were a bill for money already taken —
  // and this is the last email before the customer walks up to the window.
  // ⚠️ NO CAPTURE RESULT EXISTS HERE. Ready happens long after any confirmation, so this reads.
  const paymentState = await resolveEmailPaymentState(supabase, order.order_key)
  const { subject, html, text } = formatConfirmationEmail({
    variant: 'ready',
    paymentState,
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
    venueName: eventRow?.venue_name ?? null,
    venueTown: eventRow?.town ?? null,
    venuePostcode: eventRow?.postcode ?? null,
    preferredContactMethod: truck.preferred_contact_method ?? null,
    contactPhone: truck.contact_phone ?? null,
    whatsappSender: truck.whatsapp_sender ?? null,
    socialFacebook: truck.social_facebook ?? null,
    socialInstagram: truck.social_instagram ?? null,
    contactEmail: truck.contact_email ?? null,
    baseUrl: process.env.NEXT_PUBLIC_HATCHGRAB_URL,
    truckSlug: truck.slug ?? undefined,
  })
  await sendEmailUnlessDemo(truck, { to: order.customer_email, subject, html, text, senderName: truck.name })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    // order_key (UUID) is the row identity for every order op. orderId is gone as a
    // lookup key — orders are addressed only by order_key now.
    const { token, pin, action, order_key: orderKey, manualOrder, itemName, available, editedOrder } = body

    const truck = await verifyToken(token, pin)
    if (!truck) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    // ── ACTOR ATTRIBUTION (V9.4) — LOGGING ONLY, NEVER AUTHORISATION ───────────────────────────────
    // This route previously discarded identity entirely: verifyToken above resolves a TRUCK from a
    // shared per-truck token, and nothing ever asked who the human was — even though the cookie was
    // sitting right there on every web request. resolveActor is the SAME implementation the dashboard
    // GET uses (lib/audit/actor.ts, extracted from app/api/dashboard/route.ts).
    //
    // 🔴 THE GATE IS UNCHANGED AND STAYS UNCHANGED. verifyToken above is still the only thing that can
    // refuse a request. resolveActor never throws and never returns a refusal — it reports what it could
    // determine, and every failure path degrades to actor_kind 'unknown'. In particular `foreignOperator`
    // (which the dashboard GET turns into a 403) is DELIBERATELY IGNORED here: a logging concern must
    // never become a new way for a live operator action to be refused at the hatch mid-service.
    // Where identity is genuinely not determinable, that FACT is recorded — actor_kind 'token' with a
    // null actor_id — so the log distinguishes "a shared token acted" from "we failed to ask".
    const actor = await resolveActorSafe(req, supabase, truck)
    const actorSource = resolveActorSource(req, body)

    // ── Offline-replay conflict guard (Phase 1) ───────────────────────────────
    // A status op replayed from the offline outbox carries `expected_from` (the statuses it may apply FROM,
    // incl. its target). If the order has since moved to a state NOT in that set — e.g. a customer
    // cancelled/rejected it online while the operator advanced it offline — return 409 so the outbox FLAGS it
    // for review instead of overwriting the cancel. Online requests omit expected_from → zero behaviour change.
    if (Array.isArray(body.expected_from) && orderKey && action !== 'manual') {
      const { data: cur } = await supabase.from('orders').select('status').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      if (cur && !body.expected_from.includes(cur.status)) {
        return NextResponse.json({ error: 'conflict', current_status: cur.status }, { status: 409 })
      }
    }

    // ── CONFIRM ───────────────────────────────────────────────────────────────
    if (action === 'confirm') {
      const { data: order } = await supabase.from('orders').select('*').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      await supabase.from('orders').update({ status: 'confirmed' }).eq('order_key', orderKey).eq('truck_id', truck.id)

      // ── 🔴 CAPTURE SITE 2 of 4: THE OPERATOR CONFIRM — AND EVERY OFFLINE REPLAY OF IT. ──────────
      // ⚠️ THIS IS ALSO WHERE A CARD ORDER THAT LANDED `pending` CAPTURES. Its hold sat correctly held
      // from promotion until this tap; site 4 (promote-draft) deliberately did not take it.
      // The native outbox replays a queued confirm as this same `action: 'confirm'`, differing only by
      // the `expected_from` guard checked at the top of this route. There is no separate replay handler,
      // so this one call covers both — including a replay that lands long after the tap, where the hold
      // may since have expired (captureOnConfirmation reports that as `expired`, never as a capture).
      // ⚠️ AFTER the status write, deliberately: the confirmation is the thing that must happen.
      // ⚠️ AWAITED AND CANNOT THROW — every failure comes back as a value. The order is already
      // confirmed by the line above and stays confirmed whatever this returns.
      const captureResult = await captureOnConfirmation(supabase, { orderKey, truckId: truck.id, trigger: 'confirm' })

      if (order.customer_email) {
        // ── 🔴 THE RESULT ON THE LINE ABOVE IS WHAT THE EMAIL NEEDS, AND IT USED TO BE DISCARDED. ──
        // This branch called captureOnConfirmation, threw the answer away, and then composed an email
        // twenty-six lines later that told the customer to pay at the truck — money it had just taken.
        // 🔴 IT IS ALSO MORE ACCURATE THAN RE-READING. An `expired` capture means Stripe refused because
        // the hold is gone: the draft row does not know that yet, so a database read would answer
        // "held" and promise a customer their card is covering an order it is not.
        // ⚠️ `none` (no authorisation on this order) is not decisive, and the resolver falls through to
        // the database — which answers 'hatch' for every pay-at-hatch order, exactly as today.
        const paymentState = await resolveEmailPaymentState(supabase, orderKey, captureResult)
        // Resolve the venue strictly by the order's OWN event_id (cross-event fix): an
        // event_date+maybeSingle lookup returns null/the wrong row on multi-event dates,
        // putting the wrong venue in the confirmation email. Fall back to date only when the
        // order has no event_id (legacy rows).
        let eventQuery = supabase
          .from('truck_events')
          .select('venue_name, town, postcode')
          .eq('truck_id', truck.id)
        eventQuery = order.event_id
          ? eventQuery.eq('id', order.event_id)
          : eventQuery.eq('event_date', order.event_date).neq('status', 'cancelled')
        const { data: eventRow } = await eventQuery.maybeSingle()
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
          paymentState,
          venueName: eventRow?.venue_name ?? null,
          venueTown: eventRow?.town ?? null,
          venuePostcode: eventRow?.postcode ?? null,
          preferredContactMethod: truck.preferred_contact_method ?? null,
          contactPhone: truck.contact_phone ?? null,
          whatsappSender: truck.whatsapp_sender ?? null,
          socialFacebook: truck.social_facebook ?? null,
          socialInstagram: truck.social_instagram ?? null,
          contactEmail: truck.contact_email ?? null,
          allowCancellation: truck.allow_customer_cancellation ?? true,
          cancellationCutoffMins: truck.cancellation_cutoff_mins ?? 30,
          baseUrl: process.env.NEXT_PUBLIC_HATCHGRAB_URL,
          truckSlug: truck.slug ?? undefined,
        })
        await sendEmailUnlessDemo(truck, { to: order.customer_email, subject, html, text, senderName: truck.name })
      }
      return NextResponse.json({ success: true, status: 'confirmed' })
    }

    // ── REJECT ────────────────────────────────────────────────────────────────
    if (action === 'reject') {
      const { rejectionReason } = body
      const { data: order } = await supabase.from('orders').select('*').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      // Dedicated rejection_reason column (NOT cancellation_reason — a rejected order isn't cancelled).
      await supabase.from('orders').update({ status: 'rejected', rejection_reason: rejectionReason || null }).eq('order_key', orderKey).eq('truck_id', truck.id)
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

    // ── CANCEL ────────────────────────────────────────────────────────────────
    if (action === 'cancel') {
      const { cancellationReason } = body
      const { data: order } = await supabase.from('orders').select('*').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      // ── 🔴 WHAT THE MONEY WAS DOING, ASKED BEFORE ANYTHING MOVES. ────────────────────────────────
      // Resolved here rather than after the release, because releasing stamps `authorization_cancelled_at`
      // and the resolver would then answer 'hatch' — "Pay at the truck on collection" — to a customer
      // whose order has just been cancelled. One read, one answer, used by the email below.
      const cancelPaymentState = await resolveEmailPaymentState(supabase, orderKey)
      await supabase.from('orders').update({ status: 'cancelled', cancellation_reason: cancellationReason || null }).eq('order_key', orderKey).eq('truck_id', truck.id)
      // ── 🔴 THE ORDER IS CANCELLED FIRST, AND THE HOLD IS RELEASED AFTER. ────────────────────────
      // ── WHY THIS ORDERING, WHEN THE REFUND-ON-CANCEL USES THE OPPOSITE ONE ─────────────────────
      // The refund goes FIRST because a refund that fails must not leave a cancelled order with the
      // customer's money still taken and nobody looking at it — money OUT is the thing that must not be
      // silently skipped. A HOLD is not money out: nothing has been taken, and a release that fails
      // leaves an authorisation that expires on its own in about a week. So the costs are reversed, and
      // so is the ordering: an operator cancelling mid-service must never be blocked by Stripe being
      // slow or unreachable, and this call cannot fail the request — every outcome is a return value.
      // ⚠️ IT ONLY EVER RELEASES. See lib/payments/release-hold: a captured order is refused outright.
      const released = await releaseHoldForCancelledOrder(supabase, {
        orderKey, truckId: truck.id, trigger: 'operator_cancel', actor, source: actorSource,
      })
      if (released.status === 'released') {
        console.log(`[cancel] hold released pi=${released.paymentIntentId} order_key=${orderKey} (operator)`)
      }
      if (order.event_date) {
        // order.slot may be null (ASAP) — resolved to the event-start window so it unbooks.
        const itemCatMap = await buildItemCatMap(supabase, truck.id)
        await removeOrderFromProductionSlot(
          supabase, truck.id, order.event_id, order.slot,
          normaliseOrderLines(order.items || [], order.deals), itemCatMap
        )
      }
      // Ceiling model (step 3): NO option-stock reversal — cancelling removes this order from the live
      // ceiling tally automatically (was: releaseOptionStock, the removed decrement pool).
      if (order.customer_email) {
        const reasonLine = cancellationReason ? `<p style="color:#475569">${cancellationReason}</p>` : ''
        // 🔴 THE RESOLVER, NOT `paid_at`. That column is never set by the capture path, so this line
        // could never fire for a card order at all — the gate was as wrong as the sentence was. The same
        // resolver every other order email asks now decides, and it distinguishes the case this build
        // exists for: a HELD card, where nothing was taken and the hold has just been released.
        const refundLine =
          cancelPaymentState === 'held' || cancelPaymentState === 'held_short'
            ? `<p>Your card was held for this order, not charged. That hold has been released and no money has been taken.</p>`
          : cancelPaymentState === 'captured' || cancelPaymentState === 'part_paid'
            ? `<p>If you paid by card, any refund is handled by ${truck.name} directly — please contact them about it.</p>`
            : ''
        await notifyCustomer(truck, order.customer_email, `Your order has been cancelled — ${truck.name}`,
          `<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px;color:#334155">
            <p>Hi ${order.customer_name || 'there'},</p>
            <p>Your order <strong>#${order.id}</strong> from <strong>${truck.name}</strong> has been cancelled.</p>
            ${reasonLine}
            ${refundLine}
            <p>We're sorry for any inconvenience.</p>
            <p>${truck.name}</p>
            <p style="color:#94a3b8;font-size:12px">Powered by HatchGrab · hatchgrab.com</p>
          </body>`)
      }
      return NextResponse.json({ success: true, status: 'cancelled' })
    }

    // ── READY ─────────────────────────────────────────────────────────────────
    // Sets status='ready'. The customer "ready" email is sent INLINE for non-deferred callers (KDS cook
    // screen — body.defer_email falsy), but DEFERRED for the main dashboard (body.defer_email === true):
    // the client shows a 4s undo toast and fires `send_ready_email` only after the window closes, so an
    // undo within 4s sends no email. Either way the email always fires for a ready (model A) — KDS
    // immediately, dashboard after the undo window.
    if (action === 'ready') {
      const { data: order } = await supabase.from('orders').select('*').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      await supabase.from('orders').update({ status: 'ready' }).eq('order_key', orderKey).eq('truck_id', truck.id)
      // RELEASE kitchen-capacity occupancy at ready (done cooking). buildUnitsFromOrders no longer counts a
      // 'ready' order, so the rebuild frees its production slot — shared with every capacity reader (the
      // orders-screen day load + the seating projection; queued/new orders can then seat into the freed
      // window). The order itself stays in the list/counts — only its capacity occupancy clears.
      if (order.event_date) await rebuildProductionSlotUsage(supabase, truck.id, order.event_date)
      if (!body.defer_email) {
        await deliverReadyEmail(order, truck)
      }
      return NextResponse.json({ success: true, status: 'ready' })
    }

    // ── SEND READY EMAIL (deferred) ─────────────────────────────────────────────
    // Fired by the dashboard ~4s after a Ready click if it wasn't undone. GUARDED on status==='ready' so a
    // raced undo (status back to 'confirmed') sends nothing. Double-send is prevented client-side (the 4s
    // timer is cleared whenever the flush path fires), with this status guard as the server backstop.
    if (action === 'send_ready_email') {
      const { data: order } = await supabase.from('orders').select('*').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      if (order.status !== 'ready') return NextResponse.json({ success: true, skipped: 'not ready' })
      await deliverReadyEmail(order, truck)
      return NextResponse.json({ success: true })
    }

    // ── UNDO READY ──────────────────────────────────────────────────────────────
    // Reverts status ready→confirmed (the dashboard undo). Status-only: unlike undo_collected, marking
    // ready never freed a production slot, so there is NO production_slot_usage rebuild here.
    if (action === 'undo_ready') {
      const { data: order } = await supabase.from('orders').select('event_date').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      await supabase.from('orders').update({ status: 'confirmed' }).eq('order_key', orderKey).eq('truck_id', truck.id)
      // RE-BOOK: 'confirmed' occupies capacity again, so rebuild to reclaim the slot ready had freed —
      // else the undo leaves an undercount (oversell). Mirrors the §-engine release-at-ready symmetry.
      if (order?.event_date) await rebuildProductionSlotUsage(supabase, truck.id, order.event_date)
      return NextResponse.json({ success: true, status: 'confirmed' })
    }

    // ── COLLECTED ─────────────────────────────────────────────────────────────
    if (action === 'cooking') {
      await supabase.from('orders').update({ status: 'cooking' }).eq('order_key', orderKey).eq('truck_id', truck.id)
      return NextResponse.json({ success: true, status: 'cooking' })
    }

    if (action === 'collected') {
      const now = new Date().toISOString()
      const { data: order } = await supabase.from('orders').select('slot, event_date, event_id, status').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      // Record the from-status so Undo reverts ONE stage to the ACTUAL previous status (ready if it was
      // ready, confirmed/modified if collected directly) — never a hardcoded 'confirmed'. Guard against
      // re-firing on an already-collected order: don't overwrite a real prior status with 'collected'.
      const fromStatus = order?.status && order.status !== 'collected' ? order.status : null
      // ── PAYMENT FIRST, FULFILMENT SECOND — AND FAIL OPEN (V9.4) ────────────────────────────────────
      // The ledger row is booked BEFORE the status write so a failure cannot pass unnoticed. But it must
      // NOT block the collection: SURFACING a failure is not the same as REFUSING the action. The
      // operator is at the hatch with cash already in hand — refused mid-service they cannot clear the
      // order from the board, the queue backs up and customers wait. What failed is an ACCOUNTING write
      // for money that has ALREADY physically moved.
      // So the failure is surfaced three ways instead of one: the order is still collected, a
      // paymentWarning rides back on the success response (the slotWarning shape, :546 — same reasoning,
      // the operator's action is never rolled back over a secondary write), and the server log carries
      // the order_key so the reconciliation query in lib/payments/ledger.ts has something to correlate
      // against. Recovery is re-running recalcOrderPayment for that order: the ledger is the truth, it is
      // repairable, and an order collected-with-no-payment-record is a detectable, fixable state. An
      // operator stuck at the hatch is neither.
      // ⚠️ EXPIRY CONDITION — REVISIT WHEN THIS STOPS BEING TRUE. Fail-open is correct only while the
      // ledger is PASSIVE: today it drives no UI, no platform fee and no Stripe reconciliation, so a
      // missing row costs nothing until it is repaired. Once it drives the 0.99% fee or Stripe
      // settlement (§37), a missing row IS A MISSING FEE — money silently not charged — and this branch
      // must be reconsidered deliberately, not inherited.
      let paymentWarning: string | null = null
      let chargedMinor: number | null = null
      // ── 🔴 THE SAME GUARD, SHAPED DIFFERENTLY, BECAUSE THIS ACTION IS NOT ABOUT MONEY. ───────────
      // One-press completion books the SAME in-person row as mark_paid — recordCollectionPayment,
      // channel 'in_person_other', the full outstanding balance — so a held order double-charges here
      // too. But `collected` is a FULFILMENT action, and refusing it strands an operator at the hatch
      // with food in their hand, which this file says repeatedly must never happen.
      // 🔴 SO THE ACTION PROCEEDS AND ONLY THE MONEY WRITE IS SKIPPED. The order completes, the queue
      // clears, and nothing is charged twice. The customer's card already covers this order and is
      // captured at confirmation.
      // ⚠️ For a held order that has ALREADY been captured this changes nothing: the balance is zero,
      // so recordCollectionPayment's own `before.balanceMinor <= 0` guard was already booking nothing.
      // This branch is for the window where the capture has not landed yet.
      const heldOnCollect = await hasHeldAuthorisation(supabase, orderKey)
      if (heldOnCollect) {
        console.warn(
          `[collected] order_key=${orderKey} truck=${truck.id} has a LIVE CARD HOLD — completing the ` +
          `order but booking NO in-person payment. The card is charged at confirmation.`,
        )
      }
      try {
        const res = heldOnCollect
          ? { chargedMinor: 0 }
          : await recordCollectionPayment(supabase, { orderKey, truckId: truck.id, createdBy: actor.actorId })
        chargedMinor = res.chargedMinor
      } catch (err) {
        console.error(`[collected] LEDGER WRITE FAILED for order_key=${orderKey} truck_id=${truck.id} — the order WAS still marked collected (fail-open). Re-run recalcOrderPayment for this order_key to repair; the reconciliation query in lib/payments/ledger.ts will list it until then:`, err)
        paymentWarning = 'Order completed, but the payment record could not be saved — the takings figure for this order may be wrong until it is repaired.'
      }
      // AUDIT (append-only, best-effort). Written AFTER the fact because nothing is destroyed here — the
      // ledger row and the order row both persist, so a lost audit row is a gap, not an erasure. It uses
      // the swallowing `logAction` for the same reason the ledger write fails open: a logging failure must
      // not block a hatch mid-service. Contrast undo_collected below, which fails CLOSED.
      // `ledger_failed` is recorded so the log itself shows when the money record is known-missing.
      await logAction(supabase, {
        action: 'collected', truckId: truck.id, orderKey, amountMinor: chargedMinor,
        beforeState: { status: order?.status ?? null, paid_at: null, collected_at: null },
        afterState: { status: 'collected', paid_at: now, collected_at: now, charged_minor: chargedMinor, ledger_failed: paymentWarning !== null },
        actor, source: actorSource,
      })
      const { error: collectErr } = await supabase.from('orders').update({ status: 'collected', paid_at: now, collected_at: now, ...(fromStatus ? { status_before_collected: fromStatus } : {}) }).eq('order_key', orderKey).eq('truck_id', truck.id)
      if (collectErr) {
        // Still fail-CLOSED, and correctly so: this is the FULFILMENT write, not the accounting one. If
        // it fails the order genuinely is not collected, so there is nothing to fail open about — the
        // operator must see that the action did not take. (A ledger row may or may not have been booked
        // above; the reconciliation query surfaces the orphan and a retry is idempotent on its key.)
        console.error(`[collected] status update FAILED for order_key=${orderKey} — order is NOT collected:`, collectErr)
        return NextResponse.json({ error: collectErr.message }, { status: 500 })
      }
      // Free kitchen usage on collect by REBUILDING the date's production_slot_usage from the live
      // orders (deterministic), not an incremental subtract. The order is now 'collected' so the
      // rebuild (buildUnitsFromOrders filters pending/confirmed/modified) excludes it → its capacity
      // is freed AND co-located orders in the same slot are preserved exactly. This replaces the old
      // removeOrderFromProductionSlot, whose read-only reseed could wipe co-located orders and drift.
      // Idempotent: re-firing (or completing an already-collected order) yields the same state.
      if (order?.event_date) {
        await rebuildProductionSlotUsage(supabase, truck.id, order.event_date)
      }
      return NextResponse.json({ success: true, status: 'collected', ...(paymentWarning ? { paymentWarning } : {}) })
    }

    // ── UNDO COLLECTED ────────────────────────────────────────────────────────
    if (action === 'undo_collected') {
      const { data: order } = await supabase.from('orders').select('slot, event_date, event_id, status_before_collected').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      // Revert ONE stage, to the order's ACTUAL previous status (recorded by 'collected'): 'ready' if it
      // was ready, 'confirmed'/'modified' if collected directly. Fallback 'confirmed' for legacy rows with
      // no recorded from-status (pre-migration) — the old behaviour, but only as a fallback now.
      const revertTo = order?.status_before_collected || 'confirmed'
      // ── REVERSE THE PAYMENT, THEN THE FULFILMENT STATE (V9.4) ──────────────────────────────────────
      // Mirrors 'collected': ledger first so a failure leaves the order collected-and-paid (a coherent
      // state the operator can retry) rather than reverted-but-still-paid. Errors SURFACE.
      //
      // 🔴 THIS BRANCH FAILS CLOSED, AND THAT IS THE INVERSE OF 'collected' ON PURPOSE.
      // 'collected' fails OPEN because blocking an operator at the hatch with cash in hand is worse than
      // a recoverable accounting gap the reconciliation query will surface. Undo is the opposite case: it
      // DELETES a payment row, and an erased payment record with no log of the erasure is precisely the
      // fraud vector this table exists to prevent (mark paid → take cash → undo → no trace). So the audit
      // row is written FIRST, via logActionOrThrow, and passed as `beforeDelete` — if that insert fails
      // the delete never runs, the ledger row survives, and the undo is refused with a 500. Losing an
      // undo is recoverable; losing the evidence of one is not.
      // before_state carries the FULL contents of the row about to be destroyed (amount, channel,
      // idempotency_key, created_at, created_by, note, currency, state, external_ref, id) so the deletion
      // is fully reconstructable from the log alone.
      // ── TWO-STAGE UNDO (V9.4) — WHETHER THIS ALSO REVERSES THE PAYMENT DEPENDS ON THE PRESSES ──────
      // ONE press: "Mark paid and collected" is ONE action, so its undo must reverse BOTH halves —
      //   status and payment. Unchanged from phase 1a.
      // TWO presses: paying and completing are two separate taps with two separate toasts, so an undo
      //   must reverse exactly ONE stage. Undoing "Done" reverts the STATUS ONLY and leaves the payment
      //   standing; the payment has its own undo (undo_mark_paid) on its own toast. Reversing both here
      //   would silently undo a tap the operator did not just make.
      //
      // 🔴 KEYED ON completionPresses, NOT show_paid_step (10 August 2026). Those were the same boolean
      // until the settings were split, and this is the branch that makes the split matter: it decides
      // what an undo MEANS. `show_paid_step` now answers a question about ORDER ENTRY (can an order be
      // placed unpaid from the Add Order panel) and has no bearing on whether completion was one tap or
      // two — so reading it here would, on a truck with entry unpaid-capable but completion in one tap,
      // leave a payment standing that the single tap had just booked.
      // ⚠️ `completionPresses` comes from the TRUCK object, which paidStepFor already has via
      // select('*') — NOTHING was added to that function's named truck_events select. That select is on
      // the path the outbox replays through and fails to a WRONG VALUE rather than a crash; keeping this
      // column off it is why this change carries no 42703 exposure.
      const splitPaidStep = (await paidStepFor(truck, (order as any)?.event_id)).completionPresses === 'two'
      let reversal: 'deleted' | 'refunded' | 'none' = 'none'
      try {
        if (splitPaidStep) {
          // Status-only revert. Nothing is destroyed, so there is nothing to capture before the fact.
          await logAction(supabase, {
            action: 'undo_collected', truckId: truck.id, orderKey, amountMinor: null,
            beforeState: { status: 'collected' },
            afterState: { status: revertTo, reversal: 'status_only', payment_left_intact: true },
            actor, source: actorSource,
          })
        } else {
        const res = await reverseCollectionPayment(supabase, {
          orderKey, truckId: truck.id, createdBy: actor.actorId,
          beforeDelete: async (deletedRow) => {
            await logActionOrThrow(supabase, {
              action: 'undo_collected', truckId: truck.id, orderKey,
              amountMinor: deletedRow.amount_minor,
              beforeState: { ledger_row: deletedRow, status: 'collected' },
              afterState: { ledger_row: null, ledger_row_deleted: true, status: revertTo },
              actor, source: actorSource,
            })
          },
        })
        reversal = res.reversal
        }
      } catch (err) {
        console.error(`[undo_collected] REFUSED for order_key=${orderKey} truck_id=${truck.id} — ledger reversal or its audit write failed; the payment row was NOT deleted and the order was NOT reverted:`, err)
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Payment could not be reversed' }, { status: 500 })
      }
      // The 'deleted' path already logged inside beforeDelete (it HAD to, before the row vanished), and
      // the split-paid-step path logged its status-only revert above. The other two destroy nothing —
      // 'refunded' appends a compensating row, 'none' found nothing to reverse — so they log here,
      // best-effort, purely so that EVERY undo appears in the trail.
      if (!splitPaidStep && reversal !== 'deleted') {
        await logAction(supabase, {
          action: 'undo_collected', truckId: truck.id, orderKey, amountMinor: null,
          beforeState: { status: 'collected' },
          afterState: { status: revertTo, reversal },
          actor, source: actorSource,
        })
      }
      // paid_at AND collected_at are BOTH cleared (V9.4). Previously neither was: an order reverted to
      // confirmed/ready kept both timestamps, so the operator-cancel path (:254) and the event-cancel
      // path (events/action:202) — which both read paid_at — would promise a cash customer a refund on
      // an order that was never paid. payment_status is now canonical; paid_at remains only as a
      // compatibility timestamp, so it must not be left contradicting the ledger.
      const { error: undoErr } = await supabase.from('orders').update({ status: revertTo, status_before_collected: null, paid_at: null, collected_at: null }).eq('order_key', orderKey).eq('truck_id', truck.id)
      if (undoErr) {
        console.error('[undo_collected] status update failed after the ledger was reversed:', undoErr)
        return NextResponse.json({ error: undoErr.message }, { status: 500 })
      }
      // Rebuild the date's production_slot_usage from the live orders (deterministic, idempotent — two undo
      // entry points: toast + completed list). Capacity follows the reverted status automatically because
      // the rebuild reads it AFTER this update: revert→'ready' stays FREED (buildUnitsFromOrders excludes
      // ready); revert→'confirmed'/'modified' RE-OCCUPIES the cook slot. No special-casing needed.
      if (order?.event_date) {
        await rebuildProductionSlotUsage(supabase, truck.id, order.event_date)
      }
      return NextResponse.json({ success: true, status: revertTo })
    }

    // ── EDIT ORDER ────────────────────────────────────────────────────────────
    if (action === 'edit') {
      const {
        items, slot, notes, deals: editedDeals, customerName, customerEmail, customerPhone,
        // The operator's explicit acknowledgement that lines which are NOT on the menu are being
        // saved at their advisory price: the exact server total they were shown. Echoed back so we
        // confirm the figure they saw, not whatever we happen to compute now.
        confirmUnresolvedTotal,
      } = editedOrder || {}
      const { data: order } = await supabase.from('orders').select('*').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

      // ── SERVER-AUTHORITATIVE PRICING, PRICE-LOCKED ─────────────────────────────────────────────
      // The request body's unit_price / modifier prices / deal price are ADVISORY ONLY — they say
      // WHAT was selected, never what it costs.
      //
      // PRICE-LOCK: the authoritative price for a line ALREADY on this order is the one STORED on the
      // row (`order.items` / `order.deals`, selected above). A menu price change since placement must
      // never reach an existing order — it applies to future orders only. The live menu is loaded
      // solely to price something this edit genuinely ADDS.
      //
      // The money arithmetic is delegated to calculateOrderTotal (lib/order-calculations) — the SAME
      // function the customer path and Add Order use. This replaces the third inline formula that
      // lived here, so subtotal now INCLUDES deals (order-calculations.ts:108) instead of being
      // items-only, and discount_amt is RECOMPUTED (a percentage code rescales with the edited
      // basket) instead of being read, subtracted and never written back.
      const effItems = items || order.items || []
      const effDeals = editedDeals !== undefined ? editedDeals : (order.deals || [])
      const priceBook = await loadPriceBook(supabase, truck.id)

      // DISCOUNT resolution. Deliberately NOT filtered on is_active: the order already carries this
      // code, and an operator deactivating a code for NEW customers must not retroactively re-charge
      // an existing one. If the code row is gone entirely we cannot rescale it, so we honour the
      // amount already promised as a FIXED discount and flag it as unresolvable (below) so the
      // operator sees that the server could not verify it. No discount_code ⇒ no discount, full stop:
      // that is what makes discount_amt mean "money deducted" on every path (see §4b).
      let discountCodeRow: DiscountCode | null = null
      const unresolvedDiscount: { kind: 'discount'; name: string; advisoryPrice: number }[] = []
      if (order.discount_code) {
        const { data: codeRow } = await supabase
          .from('discount_codes_db')
          .select('code, type, value')
          .eq('truck_id', truck.id)
          .eq('code', String(order.discount_code).toUpperCase())
          .maybeSingle()
        if (codeRow) {
          discountCodeRow = codeRow as unknown as DiscountCode
        } else {
          const stored = Number(order.discount_amt) || 0
          discountCodeRow = { code: String(order.discount_code), type: 'fixed', value: stored }
          unresolvedDiscount.push({ kind: 'discount', name: String(order.discount_code), advisoryPrice: stored })
        }
      }

      // The stored row IS the price source. `order` was selected with `*` at the top of this handler,
      // so items/deals here are exactly what is persisted — never anything from the request body.
      const repriced = repriceOrder(
        effItems, effDeals, priceBook,
        { items: order.items, deals: order.deals },
        discountCodeRow,
      )
      const newSubtotal = repriced.calculation.subtotal     // items + deals (order-calculations.ts:108)
      const newDiscountAmt = repriced.calculation.discountAmt
      // PENCE FIRST, then pounds from the pence. A percentage code is the one way an order total can
      // land on a fraction of a penny (10% of £10.05 = £1.005); rounding to pence HERE and deriving
      // `total` from that means total and total_minor are the same number by construction, instead of
      // JS float rounding and Postgres numeric(8,2) rounding independently and disagreeing by 1p.
      // For every total that is already 2dp — i.e. all of them today — this is an exact round-trip.
      const newTotalMinor = toMinor(repriced.calculation.total)
      const newTotal = newTotalMinor / 100
      const unresolved = [...repriced.unresolved, ...unresolvedDiscount]

      // ── CONFIRM UNPRICEABLE NEW LINES ──────────────────────────────────────────────────────────
      // Under price-lock there is no menu-drift delta to surface: an existing line's price CANNOT
      // move, and a new line is priced off the same live menu the operator's modal is showing, so
      // client and server agree by construction. The only thing left worth stopping for is a
      // genuinely NEW item / modifier / bundle whose name is not on the menu at all — there is no
      // authoritative price for it, so we fall back to the advisory figure and make the operator say
      // yes to that explicitly. Nothing is written on this branch.
      //
      // Rare by construction: the edit modal only offers names that exist on the live menu, so this
      // needs the menu to have changed under the operator (or a hand-crafted request).
      //
      // A DELETED DISCOUNT CODE rides in the same set. It is not a "new line", but it is the same
      // class of problem — a name we cannot price, where the fallback is a guess — and unlike a menu
      // price it is not locked (a code must rescale to the edited basket). Silently applying a
      // guessed discount is worse than asking, so it prompts too.
      //
      // Strictly `typeof number` — Number(null) and Number('') are 0, which would read as a genuine
      // acknowledgement of a £0.00 total.
      const acknowledged = typeof confirmUnresolvedTotal === 'number'
        && Number.isFinite(confirmUnresolvedTotal)
        && Math.abs(confirmUnresolvedTotal - newTotal) <= 0.005
      if (unresolved.length > 0 && !acknowledged) {
        return NextResponse.json({
          needsPriceConfirm: true,
          total:             newTotal,
          subtotal:          newSubtotal,
          discountAmt:       newDiscountAmt,
          unresolved,
        }, { status: 409 })
      }

      // Persist deals in EXACTLY the Add Order shape {name, slots, slotModifiers, slotNotes,
      // price} — price is the AUTHORITATIVE bundle price (the stored one for a deal already on the
      // order, the current bundles_db one for a newly added deal), which is the same figure the total
      // uses and what OrderCard's deal price column reads. UI-only fields (isNew /
      // itemsTakenFromBasket) are dropped, so an edit-saved deal renders byte-identically to an
      // Add-Order deal.
      const dealsCanonical = repriced.deals.map(d => ({
        name: d.name,
        slots: d.slots ?? {},
        slotModifiers: d.slotModifiers ?? {},
        slotNotes: d.slotNotes ?? {},
        price: Number(d.price) || 0,
      }))
      // An untouched order that never had deals keeps its stored value (null stays null) — only an
      // order that HAS deals, or whose deals were edited, gets the canonical array written.
      const dealsToStore = (editedDeals === undefined && dealsCanonical.length === 0) ? order.deals : dealsCanonical

      const newSlot = slot !== undefined ? slot : order.slot
      // CHECK THE WRITE. This update used to discard its result and the handler reported success
      // regardless — a failed write looked identical to a saved edit, and the operator only found out
      // when a later refetch showed the old order. Now a failure is a real error.
      const { error: updateErr } = await supabase.from('orders').update({
        // Items carry the AUTHORITATIVE unit_price (and modifier prices): the locked-in figure for a
        // line already on the order, the current menu figure for one this edit added. Writing them
        // back means the stored line prices and the stored total can never disagree — and it is what
        // keeps the price locked for the NEXT edit too, since that edit reads this row.
        items:    repriced.items,
        deals:    dealsToStore,
        slot:     newSlot,
        notes:    notes    !== undefined ? notes : order.notes,
        // Customer contact — all optional; blank clears to null. Preserve when not sent.
        // Blank name → the "Walk-up" sentinel (same default as the manual insert), so a
        // walk-up edited with the name left empty still reads "Walk-up", not blank.
        customer_name:  customerName  !== undefined ? ((customerName || '').trim() || 'Walk-up') : order.customer_name,
        customer_email: customerEmail !== undefined ? (customerEmail || null) : order.customer_email,
        customer_phone: customerPhone !== undefined ? (customerPhone || null) : order.customer_phone,
        total:       newTotal,
        subtotal:    newSubtotal,
        discount_amt: newDiscountAmt,
        // §4a — pence, derived server-side from the server total. Never client-supplied.
        total_minor: newTotalMinor,
        status:   'modified',
      }).eq('order_key', orderKey).eq('truck_id', truck.id)
      if (updateErr) {
        console.error('[edit] order update failed:', updateErr.message, updateErr.details, updateErr.hint)
        return NextResponse.json({ error: 'Could not save the changes to this order' }, { status: 500 })
      }

      // ── 🔴 THE TOTAL MOVED, SO THE MONEY QUESTION HAS A NEW ANSWER. RECOMPUTE IT. ────────────────
      // ── WHAT THIS FIXES ─────────────────────────────────────────────────────────────────────────
      // Order 59, 13 August: paid 650 by card, edited to 1300, and `orders.payment_status` still read
      // 'paid' with `amount_paid` 6.50 against a total of 13.00. balance = total_minor - paid, and this
      // handler is the ONLY thing in the codebase that moves the first term. Every ledger writer already
      // recalculates; nothing did when the OTHER side of the subtraction changed.
      // 🔴 HERE, NOT LATER. Directly after the write that changed the total and BEFORE the email below,
      // so the resolver that composes the customer's sentence and the row a refetching dashboard reads
      // are looking at the same recomputed state. Later would be a window; earlier would recompute
      // against the old total.
      // ⚠️ IT DOES NOT DECIDE ANYTHING — it recomputes from the ledger, which this handler does not
      // touch. `amount_paid` cannot move (no payment happened); only `payment_status` can, and only to
      // the answer getOrderBalance was already giving the operator's card. An upward edit of a paid
      // order goes 'paid' -> 'part_paid', which is the chip they are already looking at.
      // ⚠️ NON-FATAL, and deliberately the same shape as the slot re-booking below: the edit is already
      // saved and correct, the LEDGER is untouched and still authoritative, and every ledger-derived
      // surface (the card, the ticket, the emails) is right with or without this line. Losing an
      // operator's edit over a cache write would be far worse than a stale cache that the next payment
      // event repairs.
      try {
        const recalculated = await recalcOrderPayment(supabase, orderKey)
        console.log(
          `[edit] order_key=${orderKey} repriced to ${newTotalMinor} — payment cache recomputed: ` +
          `status=${recalculated.status} paid_minor=${recalculated.paidMinor} balance_minor=${recalculated.balanceMinor}`,
        )
      } catch (recalcErr) {
        console.error(
          `[edit] 🔴 PAYMENT CACHE NOT UPDATED for order_key=${orderKey} after repricing to ${newTotalMinor} — ` +
          `orders.payment_status and amount_paid still describe the OLD total. The edit IS saved and the ` +
          `ledger is unaffected; re-run recalcOrderPayment for this order to repair:`,
          recalcErr instanceof Error ? recalcErr.message : recalcErr,
        )
      }

      // Slot re-booking is reported, NOT rolled back: the order above is already saved and correct.
      // A capacity-board write failure is a display/planning problem that the next rebuild self-heals
      // — losing the operator's edit over it would be far worse.
      let slotWarning: string | null = null
      if (order.event_date && (items || slot !== undefined)) {
        const itemCatMap = await buildItemCatMap(supabase, truck.id)
        // REMOVE uses the PRIOR stored state (old items + old deals) to subtract exactly
        // what was previously booked. ADD uses the EDITED state — the SAME items+deals
        // written to the row above — so a deal CHANGE re-counts production usage correctly
        // (Gap 4). Deal constituents are counted via normaliseOrderLines' deals arg.
        const oldLines = normaliseOrderLines(order.items || [], order.deals)
        const newDeals = editedDeals !== undefined ? editedDeals : order.deals
        const newLines = normaliseOrderLines(items || order.items || [], newDeals)
        // No slot gate: order.slot / newSlot may be null (ASAP) — both resolve to the
        // event-start window inside the helpers, so old usage is freed and new re-booked.
        const unbooked = await removeOrderFromProductionSlot(
          supabase, truck.id, order.event_id, order.slot, oldLines, itemCatMap
        )
        const rebooked = await addOrderToProductionSlot(
          supabase, truck.id, order.event_id, newSlot, newLines, itemCatMap
        )
        const slotErrors = [unbooked.error, rebooked.error].filter(Boolean)
        if (slotErrors.length) {
          console.error('[edit] production slot re-booking failed (order WAS saved):', slotErrors.join(' | '))
          slotWarning = 'Order saved, but the kitchen capacity board could not be updated — check the slot before relying on it.'
        }
      }

      if (order.customer_email) {
        // ── 🔴 THE ONE SITE THAT DOES NOT USE formatConfirmationEmail, AND THE ONLY ONE WHERE THE
        //    SENTENCE WAS A STRING LITERAL RATHER THAN AN UNPASSED PARAMETER. ─────────────────────
        // It builds its own HTML, so the fix is the same resolver feeding `paymentNote().short` into
        // the footer line and the plain text. 'hatch' renders "Pay at the truck on collection", which
        // is byte-identical to the literal it replaces.
        // ⚠️ NO CAPTURE HAPPENS ON THIS PATH, so this reads. An edit does not confirm anything.
        // ⚠️ AND A LIMIT, STATED RATHER THAN PAPERED OVER: editing an order whose card is ALREADY
        // CAPTURED changes the total, and the captured amount does not follow it. The customer is told
        // the new total and that their payment has gone through, which are both true and do not add up.
        // Reconciling a repriced capture is a money change and is out of scope here.
        // ── 🔴 THE STATE AND THE FIGURES, FROM ONE RESOLUTION. ────────────────────────────────────
        // An edit is the one action that can turn a settled order into a part-paid one, or leave a hold
        // covering only part of the new total — so this is the site most likely to render 'part_paid' or
        // 'held_short', and a customer reading "New total £13.00" needs the numbers, not a vague
        // sentence. Read AFTER the repricing above, so the balance is the new total minus what was taken.
        // ⚠️ THIS USED TO BE TWO CALLS — resolveEmailPaymentState, then readOrderBalance a dozen lines
        // later for the same two rows. resolveEmailPayment returns the figures it already computed, so
        // the second read is gone and the sentence and the numbers can no longer come from two reads
        // taken at different instants.
        const payFacts = await resolveEmailPayment(supabase, orderKey)
        const paymentState = payFacts.state
        const payAmounts = typeof payFacts.paidMinor === 'number' && typeof payFacts.balanceMinor === 'number'
          ? { paidMinor: payFacts.paidMinor, balanceMinor: payFacts.balanceMinor, heldMinor: payFacts.heldMinor }
          : undefined
        const payNote = paymentNote(paymentState, truck.name, payAmounts)
        // The SERVER-priced items/deals — the same figures that were just persisted, so the
        // customer's email can never quote a price the order row doesn't hold.
        const finalItems = repriced.items.map(i => ({
          name: i.name,
          quantity: i.quantity,
          unit_price: i.unit_price,
          modifiers: i.modifiers,
          specialInstructions: typeof i.specialInstructions === 'string' ? i.specialInstructions : undefined,
        }))
        // Route through the SHARED renderer (renderOrderLinesHtml) so the deal bundle price (£15)
        // and per-modifier prices (+£1.50) render — the inline fork omitted them.
        const emailDeals = dealsCanonical
        const linesHtml = renderOrderLinesHtml(finalItems, emailDeals)
        const slotToShow = slot !== undefined ? slot : order.slot
        const html = `<body style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:20px;color:#1e293b">
            <h2>Your order has been updated ✓</h2>
            <p><strong>${truck.name}</strong> has updated order #${order.id}.</p>
            ${slotToShow ? `<p><strong>Collection time:</strong> ${slotToShow}</p>` : ''}
            <p style="font-size:12px;color:#64748b;margin-bottom:4px">Updated order:</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px;margin:8px 0">
              ${linesHtml}
              <tr style="border-top:1px solid #e2e8f0">
                <td style="padding-top:8px;font-weight:700">New total</td>
                <td style="text-align:right;padding-top:8px;font-weight:700">£${newTotal.toFixed(2)}</td>
              </tr>
            </table>
            <p style="color:#94a3b8;font-size:12px">${payNote.short} · Powered by HatchGrab · hatchgrab.com</p>
          </body>`
        // Send via the shared, HatchGrab-branded, Brevo-verified sender (same path as the
        // confirmation/new-order emails) — replaces the inline notifyCustomer (Village Foodie).
        await sendEmailUnlessDemo(truck, {
          to: order.customer_email,
          subject: `Order #${order.id} updated`,
          html,
          text: `${truck.name} has updated your order #${order.id}. New total £${newTotal.toFixed(2)}. ${payNote.short}. — HatchGrab`,
          truckName: truck.name,
        })
      }
      return NextResponse.json({
        success: true,
        status: 'modified',
        total: newTotal,
        ...(slotWarning ? { slotWarning } : {}),
      })
    }

    // ── 🔴 REFUND — OPERATOR-AUTHORISED, CARD ONLY ────────────────────────────────────────────────
    // ── WHAT THIS ROUTE DOES AND DOES NOT DECIDE ──────────────────────────────────────────────────
    // It decides NOTHING about money. The amount, the reason and the note arrive from a form; every
    // question that matters — is there a card charge, how much has already gone back, does this fit —
    // is answered inside lib/payments/refund, from our ledger and from Stripe. This handler validates
    // the SHAPE of the request and renders the outcome.
    // ⚠️ NOT OFFLINE-REPLAYABLE, AND DELIBERATELY NOT IN THE OUTBOX. A queued refund would be a Stripe
    // call replayed blind against a position that has since moved. The card submits it online only.
    if (action === 'refund') {
      const rawAmount = body.amount_minor
      const reason = body.reason
      const note = typeof body.note === 'string' ? body.note.trim() : ''
      if (!REFUND_REASONS.includes(reason)) {
        return NextResponse.json({ error: 'Choose a reason for this refund.' }, { status: 400 })
      }
      // ⚠️ THE NOTE IS REQUIRED FOR 'other' AND THE SERVER SAYS SO TOO. A required field enforced only in
      // the browser is a field that is empty in the audit log the first time somebody uses a stale tab.
      if (reason === 'other' && !note) {
        return NextResponse.json({ error: 'Add a note explaining this refund.' }, { status: 400 })
      }
      const amountMinor = typeof rawAmount === 'number' ? Math.round(rawAmount) : NaN
      if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
        return NextResponse.json({ error: 'Enter an amount greater than zero.' }, { status: 400 })
      }
      const outcome = await refundOrder(supabase, {
        orderKey, truckId: truck.id, amountMinor, reason, note: note || null, actor, source: actorSource,
      })
      switch (outcome.status) {
        case 'refunded':
          return NextResponse.json({
            success: true, refunded: true, refundId: outcome.refundId, amountMinor: outcome.amountMinor,
            status: outcome.balance?.status ?? null,
          })
        case 'pending':
          // 🔴 A 200, AND IT MUST NOT SAY "REFUNDED". Stripe has accepted it and the money has not moved;
          // the ledger is untouched and the order still reads paid. Reporting success here is the
          // false-success class this codebase has already paid for twice.
          return NextResponse.json({
            success: true, refunded: false, pending: true, refundId: outcome.refundId, amountMinor: outcome.amountMinor,
          })
        case 'refused':
          // 409, like every other guard refusal on this route, carrying the figure the operator needs.
          return NextResponse.json(
            { error: outcome.detail, refundRefused: outcome.reason, remainingMinor: outcome.remainingMinor },
            { status: 409 },
          )
        default:
          return NextResponse.json({ error: outcome.detail }, { status: 502 })
      }
    }

    // ── ITEM AVAILABILITY (sold out toggle) — PER-EVENT (Phase 5) ──────────────
    if (action === 'set_item_availability') {
      if (!itemName) return NextResponse.json({ error: 'itemName required' }, { status: 400 })
      const { event_id } = body
      if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
      // Omit stock_count → preserved on an existing row, defaults null on a new row (no ceiling
      // override). Writes only this event's row (onConflict event_id,item_name).
      await supabase.from('event_item_stock').upsert({
        truck_id:  truck.id,
        event_id,
        item_name: itemName,
        available: available !== false,
      }, { onConflict: 'event_id,item_name' })
      return NextResponse.json({ success: true, item: itemName, available })
    }

    // ── GET ITEM OVERRIDES — PER-EVENT (Phase 5) ───────────────────────────────
    if (action === 'get_item_overrides') {
      const { event_id } = body
      if (!event_id) return NextResponse.json({ success: true, soldOut: [] })
      const { data } = await supabase
        .from('event_item_stock').select('item_name')
        .eq('truck_id', truck.id).eq('event_id', event_id).eq('available', false)
      return NextResponse.json({ success: true, soldOut: (data || []).map((r: any) => r.item_name) })
    }

    // ── UPDATE EVENT TIMES ────────────────────────────────────────────────────
    if (action === 'update_event') {
      const { event_id, start_time, end_time, event_date } = body
      const date = event_date || new Date().toISOString().split('T')[0]
      if (event_id) {
        // LIVE-TIME GATE: never leave a LIVE event (confirmed/open) timeless. A draft may still be cleared.
        const { data: cur } = await supabase.from('truck_events').select('status').eq('id', event_id).eq('truck_id', truck.id).single()
        const isLive = cur?.status === 'confirmed' || cur?.status === 'open'
        if (isLive && !hasValidEventTimes(start_time, end_time)) {
          return NextResponse.json({ error: 'A live event needs a start and end time — add them before saving.' }, { status: 400 })
        }
        await supabase.from('truck_events')
          .update({ start_time, end_time, updated_at: new Date().toISOString() })
          .eq('id', event_id)
          .eq('truck_id', truck.id)
      } else {
        // INSERT creates an UNCONFIRMED draft (truck_events.status defaults to 'unconfirmed') → null times
        // allowed here; it can't go LIVE without passing the confirm/open time gate (events/action). So no
        // block on draft creation (drafts stay null-OK by design).
        // Seed order_ready_override from the van's current default (master-switch model — new events
        // start matching the Settings default).
        const seededOrderReady = await getVanOrderReadyDefault(supabase, truck.id)
        await supabase.from('truck_events')
          .insert({ truck_id: truck.id, event_date: date, start_time, end_time, order_ready_override: seededOrderReady, source: 'manual' })
      }
      return NextResponse.json({ success: true })
    }

    // ── MANUAL ORDER ──────────────────────────────────────────────────────────
    if (action === 'manual') {
      // §4b: `dealSavings` is a NOTIONAL "saved vs à la carte" figure, NOT money deducted — it used
      // to be shipped in the discountAmt slot and stored as if it were a discount. It now has its own
      // column (orders.deal_savings) and discountAmt means money-off on this path like every other.
      // 🔴 `total`, `subtotal`, `discountAmt` and `dealSavings` ARE DELIBERATELY NOT DESTRUCTURED ANY
      // MORE. The panel still sends all four and the server now reads none of them — every one is
      // resolved below from the price book. Leaving them bound would leave four client money values in
      // scope for a future edit to reach for by accident, which is the whole failure mode this change
      // exists to close. (§4b's rule still holds and is now enforced by the engine: dealSavings is
      // notional and lands in orders.deal_savings; discount_amt means money actually deducted.)
      const { customerName, customerPhone, customerEmail, slot, items, notes, event_date: passedEventDate, event_id: passedEventId } = manualOrder
      const deals = manualOrder.deals ?? null
      if (!items?.length && !deals?.length) {
        return NextResponse.json({ error: 'Items required' }, { status: 400 })
      }

      // ── Required-modifier completeness guard (operator backstop; mirrors the §15 customer-submit
      // guard) ───────────────────────────────────────────────────────────────────────────────────
      // The operator UI now forces required items through the modal (addOrCustomise); this is the
      // SERVER net for that path — operator orders submit here, NOT via /api/orders/submit, so they
      // skip §15. Resolves each line's required groups PER-ITEM (Stage B: name → id → item_modifier_
      // groups) and runs the shared validateModifierSelection. Standalone `items` only (deal-slot
      // constituents are out of scope, same as §15). FAIL-SAFE: any INTERNAL error → log + PROCEED
      // (never block a valid operator order on the guard's own bug); unknown/renamed names skipped.
      try {
        const requiredUnmet = await (async () => {
          const { data: groupsRaw } = await supabase
            .from('modifier_groups')
            .select('id, name, is_required, min_choices, max_choices')
            .eq('truck_id', truck.id)
          const requiredIds = new Set((groupsRaw || [])
            .filter(g => g.is_required || (g.min_choices ?? 0) >= 1)
            .map(g => g.id))
          if (requiredIds.size === 0) return null // no required groups → nothing to enforce

          const [{ data: itemLinks }, { data: optsRaw }, { data: itemRows }] = await Promise.all([
            supabase.from('item_modifier_groups').select('menu_item_id, group_id'),
            supabase.from('modifier_options').select('id, group_id, name, price_adjustment, available, stock_count').in('group_id', Array.from(requiredIds)),
            supabase.from('menu_items_db').select('id, name').eq('truck_id', truck.id),
          ])
          const itemIdByName: Record<string, string> = {}
          ;(itemRows || []).forEach(i => { itemIdByName[i.name] = i.id })
          // Stage-2 follow-up: event-scope the option availability/stock used by this required-group
          // guard (event_option_stock(this event) ?? template), so an operator-placed order honours a
          // per-event sold-out/stock-0 extra like the customer path (findSoldOutOption / the menu read).
          let optList = optsRaw || []
          if (passedEventId && optList.length) {
            const { data: ovRows } = await supabase
              .from('event_option_stock')
              .select('option_id, stock_count, available')
              .eq('truck_id', truck.id)
              .eq('event_id', passedEventId)
              .in('option_id', optList.map(o => o.id))
            const ovById: Record<string, { stock_count: number | null; available: boolean | null }> = {}
            ;(ovRows as any[] | null || []).forEach(r => { ovById[r.option_id] = { stock_count: r.stock_count ?? null, available: r.available ?? null } })
            optList = optList.map(o => {
              const x = ovById[o.id]
              if (!x) return o
              return { ...o, available: x.available != null ? x.available : o.available, stock_count: x.stock_count != null ? x.stock_count : o.stock_count }
            })
          }
          const groupsById = new Map((groupsRaw || []).map(g => [g.id, { ...g, options: optList.filter(o => o.group_id === g.id) }]))
          const reqGroupsByItemId: Record<string, any[]> = {}
          ;(itemLinks || []).forEach(link => {
            if (!requiredIds.has(link.group_id)) return
            const g = groupsById.get(link.group_id); if (!g) return
            ;(reqGroupsByItemId[link.menu_item_id] ||= []).push(g)
          })
          for (const it of (items || [])) {
            const itemId = itemIdByName[it.name]
            if (!itemId) continue // unknown/renamed item → can't resolve → skip (never fail on a name miss)
            const groups = reqGroupsByItemId[itemId] || []
            if (groups.length === 0) continue
            // §36 backstop: a required group with no selectable option → item is sold out (unorderable).
            if (hasUnsatisfiableRequiredGroup(groups)) return { item: it.name, soldOut: true }
            const selected = Array.isArray(it.modifiers) ? it.modifiers : []
            const { unmetGroupNames } = validateModifierSelection(groups, selected)
            if (unmetGroupNames.length > 0) return { item: it.name, group: unmetGroupNames[0] }
          }
          // DEAL-SLOT items (§29 fix): a slot item with a required group must have it satisfied via
          // deal.slotModifiers[slotKey] — same resolution as standalone, validated per slot.
          for (const d of (deals || [])) {
            const slots = d?.slots || {}
            const slotMods = d?.slotModifiers || {}
            for (const slotKey of Object.keys(slots)) {
              const itemId = itemIdByName[slots[slotKey]]
              if (!itemId) continue // unknown/renamed slot item → skip (never fail on a name miss)
              const groups = reqGroupsByItemId[itemId] || []
              if (groups.length === 0) continue
              if (hasUnsatisfiableRequiredGroup(groups)) return { item: slots[slotKey], soldOut: true }
              const selected = Array.isArray(slotMods[slotKey]) ? slotMods[slotKey] : []
              const { unmetGroupNames } = validateModifierSelection(groups, selected)
              if (unmetGroupNames.length > 0) return { item: slots[slotKey], group: unmetGroupNames[0] }
            }
          }
          return null
        })()
        if (requiredUnmet) {
          return NextResponse.json(
            {
              error: requiredUnmet.soldOut
                ? `Sorry, ${requiredUnmet.item} is sold out.`
                : `Please choose ${requiredUnmet.group} for ${requiredUnmet.item}.`,
              requiredModifier: true,
            },
            { status: 400 },
          )
        }
      } catch (err) {
        console.error('[manual] required-modifier guard error — proceeding (fail-safe):', err)
      }

      const eventDate = passedEventDate || new Date().toISOString().split('T')[0]
      // Resolve event_id: prefer the explicit ID from the panel; fall back to a
      // truck_id + event_date lookup ONLY when exactly one event matches that date
      // (same-day multi-event would be ambiguous — leave null and let the display
      // fallback in the dashboard handle it).
      let orderEventId: string | null = passedEventId || null
      if (!orderEventId) {
        const { data: dateEvents } = await supabase
          .from('truck_events')
          .select('id')
          .eq('truck_id', truck.id)
          .eq('event_date', eventDate)
          .neq('status', 'cancelled')
        if (dateEvents?.length === 1) {
          orderEventId = dateEvents[0].id
        } else if ((dateEvents?.length ?? 0) > 1) {
          console.warn(`[manual] ${dateEvents!.length} events on ${eventDate} for truck ${truck.id} — leaving event_id null`)
        }
      }
      // Walk-up / manual orders ALWAYS confirm (Section 5): the operator is present and
      // knows the queue, so the manual path bypasses auto_accept and ALL capacity gating
      // (that gate lives only on the customer path / claimAvailableSlot). The order still
      // occupies the oven via addOrderToProductionSlot below — confirm always, occupy always.
      // Pass `deals` so a deal's cookable constituents (deals[].slots) count toward oven
      // capacity, exactly like standalone items — same shared extractor every other path
      // uses (submit/edit/rebuild). Without it, walk-up deal pizzas were dropped from the
      // incremental capacity write. Instant constituents are skipped later by projectOvenOccupancy.
      const manualLines = normaliseOrderLines(items || [], deals)
      const itemCatMap = await buildItemCatMap(supabase, truck.id)

      // ── 🔴 SERVER-AUTHORITATIVE PRICING (WALK-UP) ──────────────────────────────────────────────
      // The same engine the customer path and the edit path use — lib/order-repricing. There is ONE
      // pricing implementation in this codebase and this is a call into it, not a copy of it.
      // What stood here was `items.reduce((s,i) => s + parseFloat(i.unit_price) * parseInt(i.quantity))`
      // — the panel's own arithmetic, re-added up. It agreed with the client because it WAS the client.
      //
      // ── 🔴 AND THE OPERATOR PRICE OVERRIDE, WHICH IS THE ONE THING THAT SURVIVES CLIENT-SIDE ────
      // AddOrderPanel's InlinePriceEditor lets an operator set a line price by hand: a walk-up
      // discount, a damaged item, goodwill. That is a real capability and it stays. What changes is
      // that it is now EXPLICIT rather than indistinguishable from a normal price.
      //
      // 🔴 THE FIELD NAMES.
      //   ON THE WIRE   items[].price_override  — the operator's hand-set UNIT price, in pounds.
      //                                           Absent on every line they did not touch.
      //   IN THE ROW    items[].unit_price      — the EFFECTIVE price (the override where one was set,
      //                                           the book price otherwise). Unchanged meaning, so all
      //                                           thirty-odd existing readers are untouched.
      //                 items[].price_override  — the operator's figure, echoed. Its PRESENCE is the
      //                                           audit marker: a line carrying it was priced by a
      //                                           human, and no other line can be.
      //                 items[].book_price      — what the menu said at that moment. Written only
      //                                           alongside an override, so the adjustment is
      //                                           reconstructable later without a menu archaeology dig.
      // The customer path STRIPS price_override before it reaches the engine (see
      // app/api/orders/submit) — this field is operator-only by construction, not by convention.
      //
      // ⚠️ THE OVERRIDE IS APPLIED THROUGH PRICE-LOCK, NOT AROUND IT. Pass 1 prices everything from
      // the book. Pass 2 re-runs the SAME engine with pass 1 as the stored/locked price source, with
      // the operator's unit price substituted on the lines they set — so the engine treats an override
      // exactly as it treats an already-locked line, and the totals still come out of
      // calculateOrderTotal. No money arithmetic is performed at this call site.
      //
      // 🔴 THIS RUNS BEFORE THE STOCK GUARDS HERE TOO (lock → checkClosedCategories →
      // checkStockShortfall → checkOptionCeilingShortfall → findSoldOutOption → INSERT, all below), and
      // it is safe for the SAME single reason: loadPriceBook filters on truck_id and nothing else, so a
      // sold-out item still prices and still reaches its own guard. Adding an availability filter there
      // would turn every sold-out line into a needsPriceConfirm prompt at the hatch. See the header on
      // loadPriceBook in lib/order-repricing.ts and the matching note in app/api/orders/submit/route.ts.
      const priceBook = await loadPriceBook(supabase, truck.id)

      // An override is a finite, non-negative number and nothing else. A blank editor, a null, a string
      // that does not parse, or a negative all mean NO OVERRIDE — never a silent £0 or a credit.
      const readOverride = (it: { price_override?: unknown } | null | undefined): number | null => {
        const v = it?.price_override
        if (v === null || v === undefined || v === '') return null
        const n = typeof v === 'number' ? v : parseFloat(String(v))
        return Number.isFinite(n) && n >= 0 ? n : null
      }
      const overrideByIndex: (number | null)[] = (items || []).map(readOverride)

      // Strip the operator's money fields before the engine sees them: the engine passes unknown keys
      // straight through to the stored row, so an unparsed `price_override` (or a hand-crafted
      // `book_price`) would otherwise persist and read as if the server had written it. We re-attach
      // our own, derived, below.
      const manualItemsIn: RepriceItem[] = (items || []).map((it: RepriceItem) => {
        const copy = { ...it }
        delete copy.price_override
        delete copy.book_price
        return copy
      })

      // PASS 1 — the book, and only the book. This is also where `unresolved` is decided: pass 2 can
      // never report one, because everything is locked by then.
      const booked = repriceOrder(manualItemsIn, deals, priceBook, {})
      const hasOverride = overrideByIndex.some(v => v !== null)
      // PASS 2 — the same engine, price-locked to pass 1, with the operator's figures substituted.
      const priced = hasOverride
        ? repriceOrder(manualItemsIn, deals, priceBook, {
            items: booked.items.map((line, i) =>
              overrideByIndex[i] === null ? line : { ...line, unit_price: overrideByIndex[i] }),
            deals: booked.deals,
          })
        : booked

      // ── UNPRICEABLE LINE — THE OPERATOR IS ASKED, NOT REFUSED ──────────────────────────────────
      // A human is standing at the hatch, so this follows the edit handler's existing 409
      // needsPriceConfirm pattern rather than failing the order: the server reports what it could not
      // price and the total it would store, and the panel asks the operator to confirm that figure.
      // Nothing is written on this branch — no lock is taken, no counter advanced, no row inserted.
      // 🔴 An OVERRIDE is not an unresolved. The operator setting a price is an answer, not a question.
      const serverTotalMinor = toMinor(priced.calculation.total)
      const serverTotal = serverTotalMinor / 100
      const serverSubtotal = priced.calculation.subtotal
      const serverDiscountAmt = priced.calculation.discountAmt
      const serverDealSavings = priced.calculation.dealSavings
      {
        // Strictly `typeof number` — Number(null) and Number('') are 0, which would read as a genuine
        // acknowledgement of a £0.00 total. Same test the edit handler uses, same field name.
        const ack = manualOrder?.confirmUnresolvedTotal
        const acknowledged = typeof ack === 'number' && Number.isFinite(ack) && Math.abs(ack - serverTotal) <= 0.005
        if (booked.unresolved.length > 0 && !acknowledged) {
          return NextResponse.json({
            needsPriceConfirm: true,
            total:             serverTotal,
            subtotal:          serverSubtotal,
            discountAmt:       serverDiscountAmt,
            unresolved:        booked.unresolved,
          }, { status: 409 })
        }
      }

      // The rows as they will be stored. `unit_price` is already the effective price on an overridden
      // line (pass 2 locked it there); the two extra keys are what make it auditable.
      const pricedItems = priced.items.map((line, i) => {
        const ov = overrideByIndex[i]
        if (ov === null) return line
        return { ...line, price_override: ov, book_price: booked.items[i]?.unit_price ?? null }
      })
      // Deals in EXACTLY the shape the edit path persists — price is the AUTHORITATIVE bundle price.
      // `deals ? … : null` preserves the existing null-vs-[] distinction on this column.
      const pricedDeals = deals
        ? priced.deals.map(d => ({
            name: d.name,
            slots: d.slots ?? {},
            slotModifiers: d.slotModifiers ?? {},
            slotNotes: d.slotNotes ?? {},
            price: Number(d.price) || 0,
          }))
        : null

      // Informed-override flag: the operator only sees this AFTER an atomic check reported the
      // real shortfall, then consciously chooses to proceed. It does NOT skip the check.
      const override = manualOrder.override === true

      // ── Atomic stock guard + insert under the per-event lock (Stage 3) ──
      // SAME race-proof guarantee as the customer path: NO order inserts without holding the
      // lock AND (for a non-override submit) passing the stock check, so ACCIDENTAL oversell is
      // impossible. The ONLY oversell is a deliberate, INFORMED override — the check still RUNS
      // (the operator was shown the real remaining); override just inserts past the reported
      // shortfall. Contended past the retry budget → bail WITHOUT inserting (never unguarded).
      const haveLock = (await acquireEventLock(truck.id, eventDate)).ok
      let newOrderId = ''
      let manualOrderKey = ''
      try {
        if (!haveLock) {
          return NextResponse.json(
            { error: 'We are handling a lot of orders right now — please try again', retry: true },
            { status: 409 },
          )
        }

        // (a) STOCK CHECK — atomic (deal-inclusive). Null event → no-op (no event-scoped count
        //     possible; never block a null-event walk-up). On a shortfall WITHOUT override → do
        //     NOT insert; return the real per-item remaining so the operator can decide. With
        //     override:true → the operator has SEEN the shortfall and proceeds (informed oversell).
        if (orderEventId && !override) {
          // Category CLOSED gate — honest hard stop, checked before the count shortfall. Gated by
          // !override so an INFORMED operator can still add for the hatch (they close ONLINE orders but
          // keep serving the window); the AddOrderPanel prompts "add anyway?" → resubmits override:true.
          const closed = await checkClosedCategories(truck.id, orderEventId, manualLines, itemCatMap)
          if (closed) {
            return NextResponse.json({ error: `${closed[0]} is closed for this event`, categoryClosed: true, categories: closed }, { status: 409 })
          }
          const shortfall = await checkStockShortfall(truck.id, orderEventId, eventDate, manualLines, itemCatMap)
          if (shortfall) {
            return NextResponse.json({ error: 'Not enough stock', stock: true, items: shortfall }, { status: 409 })
          }
          // Extras ceiling check (step 2) — SAME shared engine as items (no secondary axis), so operator
          // orders honour the per-event option ceiling too. !override only: an informed override skips it
          // (like the item check). The decrement-pool draw below still runs (additive — removed in step 3).
          const optShort = await checkOptionCeilingShortfall(supabase, truck.id, orderEventId, items, deals)
          if (optShort && optShort.length) {
            return NextResponse.json({ error: `Sorry, ${optShort[0].name} just sold out.`, optionStock: true, optionName: optShort[0].name }, { status: 409 })
          }
        }

        // (a2) OPTION available=false HARD-OFF backstop (ceiling model). The QUANTITY ceiling is the (a)
        //      check above (checkOptionCeilingShortfall, event-scoped via the shared engine); this catches
        //      a MANUAL sold-out / stock-0 the count math wouldn't. !override only (an informed override
        //      proceeds past it). The decrement-pool draw was REMOVED (step 3) — nothing is decremented;
        //      the ceiling is computed live from active orders.
        if (!override) {
          const soldOut = await findSoldOutOption(supabase, truck.id, items, deals, passedEventId)
          if (soldOut) {
            return NextResponse.json({ error: `Sorry, ${soldOut} just sold out.`, optionStock: true, optionName: soldOut }, { status: 409 })
          }
        }

        // (b) Display number (per-event, restarts at 1) — under the lock. order_key UUID is set
        //     by the column default. orderEventId may be null (ambiguous/no event) → truck fallback.
        // Offline-origin orders KEEP their device-prefixed provisional number (e.g. 'M3') as the PERMANENT
        // display id — skip the server counter so a synced order isn't renumbered (M3 → 3). order_key
        // idempotency (the upsert below) still prevents a double-insert on replay. Online orders (no
        // provisional) take the next server sequential exactly as before.
        const provisionalId: string | null =
          typeof manualOrder?.provisional_id === 'string' && manualOrder.provisional_id ? manualOrder.provisional_id : null
        if (provisionalId) {
          newOrderId = provisionalId
        } else {
          try {
            newOrderId = await nextOrderId(orderEventId, truck.id)
          } catch (err: any) {
            console.error('[manual] order counter failed:', err.message)
            return NextResponse.json({ error: 'Failed to generate order ID' }, { status: 500 })
          }
        }

        // (c) INSERT — walk-up/manual orders ALWAYS confirm (operator present). .select() returns
        //     the default-generated order_key for the cancel link.
        // Accept a CLIENT-minted order_key (offline outbox) → idempotent replay: a re-sent already-synced
        // walk-up is a no-op (order_key PK conflict → ignored), never a duplicate. Online walk-ups (no client
        // key) keep the server-default order_key + a plain insert, exactly as before.
        const clientOrderKey: string | undefined = typeof manualOrder?.order_key === 'string' ? manualOrder.order_key : undefined
        const insertPayload: Record<string, any> = {
          id: newOrderId, truck_id: truck.id,
          customer_name: customerName || 'Walk-up', customer_phone: customerPhone || null,
          customer_email: customerEmail || null,
          slot: slot || null, order_type: 'collection', event_date: eventDate,
          event_id: orderEventId,
          // 🔴 EVERY MONEY FIELD BELOW IS SERVER-DERIVED. The panel's `total`, `subtotal`, `discountAmt`
          // and `dealSavings` are still destructured (an offline outbox replay from an older build still
          // sends them) and are now read by NOTHING. The only client figure that reaches money is an
          // explicit per-line price_override, which is recorded as such on the row.
          items: pricedItems, deals: pricedDeals, discount_code: null,
          subtotal: serverSubtotal, discount_amt: serverDiscountAmt, total: serverTotal,
          // §4b — the notional deal saving, in its own column. Never subtracted from `total`.
          // Now computed by calculateOrderTotal (inside the engine) rather than sent by the panel.
          deal_savings: serverDealSavings > 0 ? serverDealSavings : null,
          // §4a — pence, derived here from the server-held total. Never client-supplied.
          total_minor: serverTotalMinor,
          // OVER-CAPACITY ACKNOWLEDGEMENT. Set only when the operator was shown the over-capacity
          // modal (AddOrderPanel, submit-time fresh fit check) and chose "Place it anyway". The
          // TIMESTAMP is server-minted — the client sends a boolean intent, never a time it could
          // backdate. Null = no acknowledgement, which is every other order: a normal placement, or
          // one that arrived unattended (offline collision / sync race). Nothing reads it yet;
          // narrowing the breach banner to unacknowledged breaches is a later task.
          capacity_ack_at: manualOrder?.capacityAcknowledged === true ? new Date().toISOString() : null,
          notes: notes || null, status: 'confirmed',
          payment_status: 'unpaid',
          // ── placed_at — THE MOMENT OF SALE, CLIENT-MINTED ────────────────────────────────────────
          // ⚠️ This one IS taken from the client, unlike capacity_ack_at directly above, and the
          // difference is deliberate. capacity_ack_at records a decision the SERVER witnessed, so a
          // client-supplied time there could be backdated to disguise an override. placed_at records
          // when the operator physically took the order, which for an offline walk-up the server never
          // saw and CANNOT reconstruct — created_at will be the sync time, possibly hours later.
          // The client is the only witness, so it is the only possible source.
          // Null-safe: an old client that does not send it leaves the column null, which every reader
          // treats as unknown and falls back to created_at.
          placed_at: typeof manualOrder?.placedAt === 'string' && manualOrder.placedAt ? manualOrder.placedAt : null,
          // Buzzer chosen DURING order entry (the Add Order grid button). Written straight onto the
          // insert so the number is on the row from the first read. When it collides with another
          // order the operator has already confirmed the take in the grid; the clear happens in the
          // assignBuzzer call below, which cannot run until this row exists.
          buzzer_number: Number.isInteger(manualOrder?.buzzerNumber) && manualOrder.buzzerNumber >= 1
            ? manualOrder.buzzerNumber
            : null,
        }
        if (clientOrderKey) insertPayload.order_key = clientOrderKey
        let manualOrderRow: { order_key: string } | null = null
        let insertErr: { message?: string; details?: string; hint?: string } | null = null
        if (clientOrderKey) {
          const up = await supabase.from('orders').upsert(insertPayload, { onConflict: 'order_key', ignoreDuplicates: true }).select('order_key').maybeSingle()
          insertErr = up.error; manualOrderRow = up.data
          if (!manualOrderRow && !insertErr) {
            // Already present (replay of an already-synced order) → return its identity so the ACK is stable.
            const existing = await supabase.from('orders').select('order_key').eq('order_key', clientOrderKey).eq('truck_id', truck.id).maybeSingle()
            manualOrderRow = existing.data
          }
        } else {
          const ins = await supabase.from('orders').insert(insertPayload).select('order_key').single()
          insertErr = ins.error; manualOrderRow = ins.data
        }
        if (insertErr || !manualOrderRow) {
          console.error('[manual] order insert failed:', insertErr?.message, insertErr?.details, insertErr?.hint)
          return NextResponse.json({ error: 'Failed to save order' }, { status: 500 })
        }
        manualOrderKey = manualOrderRow.order_key

        // (c2) OFFLINE-ORIGIN order KEEPS its device number (e.g. M5) — so ADVANCE the event's order counter
        //      to max(current, provisionalNumber). Otherwise the counter stays behind the offline numbers and
        //      the next ONLINE order restarts at 5 and numerically overlaps M5. Under the SAME event lock as
        //      the online increment_event_order_counter, so read-then-max is race-safe here. Idempotent on
        //      replay (max never regresses). Null-event → the truck-level counter fallback.
        if (provisionalId) {
          const provNum = parseInt(provisionalId.replace(/^\D+/, ''), 10)
          if (Number.isFinite(provNum) && provNum > 0) {
            if (orderEventId) {
              const { data: ev } = await supabase.from('truck_events').select('order_counter').eq('id', orderEventId).maybeSingle()
              if (ev && provNum > (ev.order_counter ?? 0)) await supabase.from('truck_events').update({ order_counter: provNum }).eq('id', orderEventId)
            } else {
              const { data: tr } = await supabase.from('trucks').select('order_counter').eq('id', truck.id).maybeSingle()
              if (tr && provNum > ((tr as { order_counter?: number }).order_counter ?? 0)) await supabase.from('trucks').update({ order_counter: provNum }).eq('id', truck.id)
            }
          }
        }

        // (c3) BUZZER TAKEN FROM ANOTHER ORDER. The number is already ON the new row (it went in with
        //      the insert), so this call exists only to CLEAR it from whichever other order in this
        //      event was still holding it — the operator confirmed that take in the grid before
        //      submitting. assignBuzzer re-writes the same number onto this row too, which is a no-op.
        //      ⚠️ Best-effort: the ORDER IS ALREADY CREATED and must stay created. Fail-open here
        //      matches the ledger write at the foot of this handler (:1189-1191) — the worst case is
        //      one number appearing on two cards until an operator re-assigns, which is visible and
        //      fixable, whereas refusing the order strands someone at the hatch.
        //      ✅ PHASE 2: assignBuzzer is now ONE RPC in ONE TRANSACTION, so the "one number on two
        //      cards" window this comment used to warn about is closed. The call is unchanged and
        //      still non-replay: a walk-up placed from the grid is an operator-confirmed take.
        if (insertPayload.buzzer_number != null && manualOrderKey) {
          try {
            await assignBuzzer(supabase, {
              truckId: truck.id,
              eventId: orderEventId,
              orderKey: manualOrderKey,
              buzzerNumber: insertPayload.buzzer_number as number,
            })
          } catch (err) {
            console.error(`[manual] buzzer assign failed for order_key=${manualOrderKey} — the ORDER WAS STILL CREATED and carries the number; another order may still show it until re-assigned:`, err)
          }
        }

        // (d) Occupy the oven window — REBUILD from orders (deterministic; the SAME path cancel/reject/
        //     collect use) instead of the old incremental read-merge-blind-SET (clobber/drift vector).
        //     Recomputes the slot total = the true sum of this event's orders (incl. the just-inserted
        //     one; an override order PUSHES the total further over capacity, never clobbers). Under the
        //     SAME event lock. Null event → nothing to rebuild (matches the old addOrderToProductionSlot
        //     skip; a null-event walk-up isn't counted by buildUnitsFromOrders anyway). Event-date-scoped.
        if (orderEventId) await rebuildProductionSlotUsage(supabase, truck.id, eventDate)
      } finally {
        if (haveLock) await releaseEventLock(truck.id, eventDate)
        // (Ceiling model — no option-draw compensation: nothing is decremented at placement, so a
        // non-placed order leaves no pool draw to credit back. Was: compensateOptionDraws.)
      }

      // Venue strictly by the resolved orderEventId (cross-event fix) — date+maybeSingle
      // returns the wrong/no row on multi-event dates. Fall back to date only when ambiguous
      // (orderEventId null), mirroring the order row that was just written.
      let manualEventQuery = supabase
        .from('truck_events')
        .select('venue_name, town, postcode')
        .eq('truck_id', truck.id)
      manualEventQuery = orderEventId
        ? manualEventQuery.eq('id', orderEventId)
        : manualEventQuery.eq('event_date', eventDate).neq('status', 'cancelled')
      const { data: manualEventRow } = await manualEventQuery.maybeSingle()

      // Built from the SERVER-priced rows, not the request body — the same figures just written to
      // the order, so neither email can quote a price the row does not hold. An overridden line shows
      // its overridden price, which is what the customer was charged and what the operator agreed.
      const manualEmailItems = pricedItems.map((i: any) => ({
        name: i.name,
        quantity: parseInt(i.quantity) || 1,
        unit_price: parseFloat(i.unit_price) || 0,
        modifiers: i.modifiers,
        specialInstructions: i.specialInstructions,
      }))

      if (customerEmail) {
        const { subject, html, text } = formatConfirmationEmail({
          orderId: newOrderId,
          orderKey: manualOrderKey,
          truckName: truck.name,
          customerName,
          slot: slot || null,
          items: manualEmailItems,
          deals: pricedDeals || [],
          discountAmt: serverDiscountAmt,
          total: serverTotal,
          notes: notes || null,
          autoAccepted: true,
          venueName:              manualEventRow?.venue_name ?? null,
          venueTown:              manualEventRow?.town ?? null,
          venuePostcode:          manualEventRow?.postcode ?? null,
          preferredContactMethod: truck.preferred_contact_method ?? null,
          contactPhone:           truck.contact_phone ?? null,
          whatsappSender:         truck.whatsapp_sender ?? null,
          socialFacebook:         truck.social_facebook ?? null,
          socialInstagram:        truck.social_instagram ?? null,
          contactEmail:           truck.contact_email ?? null,
          allowCancellation:      truck.allow_customer_cancellation ?? true,
          cancellationCutoffMins: truck.cancellation_cutoff_mins ?? 30,
          baseUrl:                process.env.NEXT_PUBLIC_HATCHGRAB_URL,
          truckSlug:              truck.slug ?? undefined,
        })
        await sendEmailUnlessDemo(truck, { to: customerEmail, subject, html, text, truckName: truck.name })
      }

      if (truck.contact_email && (truck as any).truck_order_email_enabled !== false) {
        // Truck gets the canonical 🔔 New order notification (shared builder) — the
        // SAME email the customer self-order path sends the truck. Never a copy of the
        // customer confirmation. The customer email above is unchanged. Gated by the
        // "Email me new orders" toggle (trucks.truck_order_email_enabled, default true).
        const { subject, html, text } = formatNewOrderEmail({
          orderId: newOrderId,
          customerName: customerName || 'Walk-up',
          customerPhone: customerPhone || null,
          slot: slot || null,
          items: manualEmailItems,
          deals: pricedDeals || [],
          total: serverTotal,
          notes: notes || null,
          venueName:     manualEventRow?.venue_name ?? null,
          venueTown:     manualEventRow?.town ?? null,
          venuePostcode: manualEventRow?.postcode ?? null,
          autoAccepted: true,
        })
        await sendEmailUnlessDemo(truck, {
          to: truck.contact_email,
          subject,
          html,
          text,
          truckName: truck.name,
          senderName: 'HatchGrab',
        })
      }

      // ── WALK-UP PAID AT ORDER (V9.4) ────────────────────────────────────────────────────────────
      // The operator took the money as part of placing the order (the confirm bar's payment button).
      // 🔴 THE ORDER AND THE PAYMENT ARE ONE SERVER ACTION, ONE REQUEST, ONE OUTBOX OP. The order was
      // created above in this same handler and the ledger row is booked here — the client makes a single
      // `gatedAction({ kind: 'create' })` carrying `paymentTaken`, and NOTHING dispatches a separate
      // payment op beside it. That is not an implementation detail: the outbox marks a conflicted op
      // `conflict`, SKIPS it and continues, so a create that landed while a payment conflicted would
      // leave an unpaid order looking paid. Do not split this into two dispatches.
      // ⚠️ SAME LEDGER ROW A LATER "Mark paid" WOULD WRITE — same `recordCollectionPayment`, same
      // `collect:{order_key}:{paidBefore}:{balance}` key, same `channel: 'in_person_other'`. One order,
      // one ledger, whichever route the money arrived by; only the moment differs.
      // ⚠️ FAILS OPEN, matching `collected` and `mark_paid`: the order is ALREADY CREATED above and must
      // stay created. An accounting failure must never undo or block order entry at the hatch — the
      // warning rides back on the success response (and is now surfaced; see docs/payments-report.md).
      //
      // ── 🔴 THE `showPaidStep &&` GATE WAS REMOVED, 10 August 2026. IT WAS HALF OF A LIVE DEFECT. ──
      // This read `if (paidStepFor(...).showPaidStep && paymentTaken === true && …)`. Its stated purpose
      // was to stop a stale client booking a payment on a truck that had not enabled the flow — but the
      // setting does not mean that and never did. `show_paid_step` answers "can this panel ALSO place an
      // order UNPAID?", so with it OFF the truck is saying they ALWAYS take payment at order time, and
      // this gate refused a payment in precisely the configuration that always takes one. Combined with
      // the client forcing `paymentTaken: false` in the same state, the OFF setting could not record a
      // payment by any route — the operator had to mark the order paid on the card afterwards.
      // 🔴 THERE IS NO TRUCK CONFIGURATION UNDER WHICH A `paymentTaken: true` FROM THIS PANEL SHOULD BE
      // REFUSED. Both settings offer a payment button; only the presence of an UNPAID button differs. So
      // the condition is the operator's action alone, and no config is consulted. Do not re-add a
      // settings gate here — if the panel offered the button, the server honours it.
      let manualPaymentWarning: string | null = null
      if (manualOrder?.paymentTaken === true && manualOrderKey) {
        let chargedMinor = 0
        try {
          const manualMethod: 'cash' | 'card' | null =
            manualOrder?.paymentMethod === 'cash' || manualOrder?.paymentMethod === 'card' ? manualOrder.paymentMethod : null
          const res = await recordCollectionPayment(supabase, { orderKey: manualOrderKey, truckId: truck.id, createdBy: actor.actorId, method: manualMethod })
          chargedMinor = res.chargedMinor
        } catch (err) {
          console.error(`[manual] LEDGER WRITE FAILED for order_key=${manualOrderKey} truck_id=${truck.id} — the ORDER WAS STILL CREATED (fail-open). Re-run recalcOrderPayment to repair:`, err)
          manualPaymentWarning = 'Order created, but the payment record could not be saved — the takings figure for this order may be wrong until it is repaired.'
        }
        await logAction(supabase, {
          action: 'manual_paid_at_order', truckId: truck.id, orderKey: manualOrderKey, amountMinor: chargedMinor,
          beforeState: { payment: 'none', order: 'created' },
          afterState: { charged_minor: chargedMinor, ledger_failed: manualPaymentWarning !== null },
          actor, source: actorSource,
        })
      }

      return NextResponse.json({ success: true, orderId: newOrderId, autoConfirmed: true, ...(manualPaymentWarning ? { paymentWarning: manualPaymentWarning } : {}) })
    }

    // ── GET STOCK ─────────────────────────────────────────────────────────────
    if (action === 'get_stock') {
      // Per-event (Phase 5): the dashboard shows the override for the SELECTED event so it edits and
      // displays the same per-event value. No event selected → no override rows + empty counts (shows
      // live Settings defaults). Reads are scoped by the SAME event_id the writes/guard/menu use.
      const eventId: string | null = body.eventId ?? null
      const [{ data: overrides }, { data: cats }, liveItemCounts, { data: menuItems }, { data: menuCats }] = await Promise.all([
        eventId
          ? supabase.from('event_item_stock')
              .select('item_name, available, stock_count, no_item_cap')
              .eq('truck_id', truck.id).eq('event_id', eventId)
          : Promise.resolve({ data: [] as any[] }),
        eventId
          ? supabase.from('event_category_stock')
              .select('category, stock_count, available')
              .eq('truck_id', truck.id).eq('event_id', eventId)
          : Promise.resolve({ data: [] as any[] }),
        eventId ? getLiveItemCounts(supabase, truck.id, eventId) : Promise.resolve({} as Record<string, number>),
        supabase.from('menu_items_db')
          .select('name, menu_categories!category_id(name)')
          .eq('truck_id', truck.id),
        supabase.from('menu_categories')
          .select('*')
          .eq('truck_id', truck.id),
      ])

      // Build item→category map from menu for category order counting
      const itemCatMap: Record<string, string> = {}
      for (const item of menuItems || []) {
        const cat = (item.menu_categories as any)?.name
        if (cat) itemCatMap[item.name] = cat
      }

      // Merge overrides + live counts; also include items that were ordered today
      // but have no explicit override row (so ordered counts show for everyone)
      const overrideMap: Record<string, any> = {}
      for (const r of overrides || []) overrideMap[r.item_name] = r

      const allNames = new Set([
        ...Object.keys(overrideMap),
        ...Object.keys(liveItemCounts),
      ])

      const stocks = Array.from(allNames)
        // Surface a row if it has sales, an explicit cap, OR a no_item_cap flag (follow-category state
        // has stock_count=null, so it must be included explicitly or the dashboard would miss it).
        .filter(name => (liveItemCounts[name] || 0) > 0 || overrideMap[name]?.stock_count != null || overrideMap[name]?.no_item_cap === true)
        .map(name => {
          const override = overrideMap[name]
          return {
            name,
            available:   override?.available ?? true,
            stock_count: override?.stock_count ?? null,
            no_item_cap: override?.no_item_cap ?? false,
            orders_count: liveItemCounts[name] || 0,
            category:    itemCatMap[name] ?? null,  // event_item_stock has no category — map via menu
          }
        })

      // Live category order counts
      const liveCatCounts: Record<string, number> = {}
      for (const [itemName, qty] of Object.entries(liveItemCounts)) {
        const cat = itemCatMap[itemName]
        if (cat) liveCatCounts[cat] = (liveCatCounts[cat] || 0) + qty
      }

      // category_stock row takes precedence; fall back to default_stock from menu_categories
      const catDefaultMap: Record<string, number | null> = {}
      for (const mc of menuCats || []) catDefaultMap[mc.name] = mc.default_stock ?? null

      const catStockMap: Record<string, number | null> = {}
      const catAvailableMap: Record<string, boolean> = {}
      for (const r of cats || []) { catStockMap[r.category] = r.stock_count; if (r.available === false) catAvailableMap[r.category] = false }

      // Build merged list: all categories that have either explicit stock or a default
      const allCatNames = new Set([
        ...Object.keys(catStockMap),
        ...Object.keys(catDefaultMap).filter(n => catDefaultMap[n] !== null),
        ...Object.keys(liveCatCounts),
      ])

      const categoryStocks = Array.from(allCatNames).map(category => ({
        category,
        stock_count:   catStockMap[category] ?? null,
        default_stock: catDefaultMap[category] ?? null,
        orders_count:  liveCatCounts[category] || 0,
        available:     catAvailableMap[category] ?? true,
      }))

      return NextResponse.json({ success: true, stocks, categoryStocks })
    }

    // ── SET MODIFIER OPTION AVAILABILITY — PER-EVENT (extras stock-scoping fix, stage 1) ───────────
    // Was an UPDATE on the SHARED modifier_options row (leaked to manage + every event). Now writes a
    // PER-EVENT override row in event_option_stock (mirrors set_stock / event_item_stock for menu items).
    // modifier_options.available stays the TEMPLATE (set in manage). NOTE: order-time DECREMENT is still
    // template (stage 2) — only the dashboard write + customer read are event-scoped this stage.
    if (action === 'set_modifier_option_available') {
      const { optionId, available, event_id } = body
      if (!optionId) return NextResponse.json({ error: 'optionId required' }, { status: 400 })
      if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
      // Verify the option belongs to this truck via its group
      const { data: opt } = await supabase.from('modifier_options').select('group_id').eq('id', optionId).single()
      if (opt) {
        const { data: grp } = await supabase.from('modifier_groups').select('id').eq('id', opt.group_id).eq('truck_id', truck.id).single()
        if (!grp) return NextResponse.json({ error: 'Not found' }, { status: 404 })
        await supabase.from('event_option_stock').upsert({
          truck_id: truck.id, event_id, option_id: optionId, available: available !== false,
        }, { onConflict: 'event_id,option_id' })
      }
      return NextResponse.json({ success: true })
    }

    // ── SET MODIFIER-OPTION STOCK — PER-EVENT (extras stock-scoping fix, stage 1) ───────────────────
    // Was an UPDATE on the SHARED modifier_options row (leaked to manage + every event). Now writes a
    // PER-EVENT override row in event_option_stock (mirrors set_stock / event_item_stock). NULL/blank =
    // inherit the template (modifier_options.stock_count, set in manage). NOTE: the order-time DECREMENT
    // still draws the shared template pool (stage 2 — the §54 atomic hot path); only the dashboard write
    // + customer read are event-scoped this stage. Same group→truck guard.
    if (action === 'set_modifier_option_stock') {
      const { optionId, stockCount, event_id } = body
      if (!optionId) return NextResponse.json({ error: 'optionId required' }, { status: 400 })
      if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
      const { data: opt } = await supabase.from('modifier_options').select('group_id').eq('id', optionId).single()
      if (opt) {
        const { data: grp } = await supabase.from('modifier_groups').select('id').eq('id', opt.group_id).eq('truck_id', truck.id).single()
        if (!grp) return NextResponse.json({ error: 'Not found' }, { status: 404 })
        const next = (stockCount === null || stockCount === undefined || stockCount === '') ? null : Math.max(0, parseInt(String(stockCount), 10) || 0)
        await supabase.from('event_option_stock').upsert({
          truck_id: truck.id, event_id, option_id: optionId, stock_count: next,
        }, { onConflict: 'event_id,option_id' })
      }
      return NextResponse.json({ success: true })
    }

    // ── SET ITEM STOCK — PER-EVENT (Phase 5) ──────────────────────────────────
    if (action === 'set_stock') {
      const { itemName, available, stockCount, noItemCap, event_id } = body
      if (!itemName) return NextResponse.json({ error: 'itemName required' }, { status: 400 })
      if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
      // Writes stock_count, available AND no_item_cap together for THIS event. no_item_cap=true =
      // "follow category" (ceiling resolves to null); false + stock_count=null = "use default". This
      // is the RECOVERY path Phase 4 flagged: available !== false clears a prior enforce-set sold-out.
      // (event_item_stock has no category/updated_at columns.)
      await supabase.from('event_item_stock').upsert({
        truck_id:    truck.id,
        event_id,
        item_name:   itemName,
        available:   available !== false,
        stock_count: stockCount ?? null,
        no_item_cap: noItemCap === true,
      }, { onConflict: 'event_id,item_name' })
      return NextResponse.json({ success: true })
    }

    // ── SET CATEGORY STOCK — PER-EVENT (Phase 5) ──────────────────────────────
    if (action === 'set_category_stock') {
      const { category, stockCount, event_id } = body
      if (!category) return NextResponse.json({ error: 'category required' }, { status: 400 })
      if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
      await supabase.from('event_category_stock').upsert({
        truck_id:    truck.id,
        event_id,
        category,
        stock_count: stockCount ?? null,
      }, { onConflict: 'event_id,category' })
      return NextResponse.json({ success: true })
    }

    // ── SET CATEGORY AVAILABLE (enable/disable) — PER-EVENT, GATE model ─────────
    // Mirrors set_item_availability / set_modifier_option_available. Omit stock_count → preserved on an
    // existing row (no-clobber), defaults null on a new row (disabling never invents a ceiling). available
    // === false closes the whole category for THIS event (menu-hide + submit gate); auto-reverts next event.
    if (action === 'set_category_available') {
      const { category, available, event_id } = body
      if (!category) return NextResponse.json({ error: 'category required' }, { status: 400 })
      if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
      // Check .error — a swallowed write is the V7.1 trap: the client believes it succeeded, then a
      // refetch returns pre-write state and the toggle "reverts" with no clue why. Surface it as 500.
      const { error: catAvailErr } = await supabase.from('event_category_stock').upsert({
        truck_id:    truck.id,
        event_id,
        category,
        available:   available !== false,
      }, { onConflict: 'event_id,category' })
      if (catAvailErr) {
        console.error('[set_category_available] upsert failed:', catAvailErr.message)
        return NextResponse.json({ error: catAvailErr.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, category, available: available !== false })
    }

    // ── DECREMENT STOCK ON ORDER ──────────────────────────────────────────────
    // NOTE: no live client caller (kept for completeness). enforceStockLimits is per-event (Phase 4)
    // — pass event_id from the body; it no-ops without one.
    if (action === 'decrement_stock') {
      const { categoryMap, event_id } = body
      // Live counts are read from the orders table — no counters to maintain.
      // categoryMap: { itemName: categoryName } from the caller.
      await enforceStockLimits(supabase, truck.id, event_id, categoryMap || {})
      return NextResponse.json({ success: true })
    }

    // ── adjust_slot ───────────────────────────────────────────────────────────
    if (action?.startsWith('adjust_slot_+')) {
      const mins = parseInt(action.replace('adjust_slot_+', ''))
      if (!orderKey || isNaN(mins)) return NextResponse.json({ error: 'Invalid' }, { status: 400 })
      const { data: ord } = await supabase.from('orders').select('id,slot,event_date,event_id,customer_email,customer_name,items,deals,total,notes,discount_amt').eq('order_key', orderKey).single()
      if (!ord?.slot) return NextResponse.json({ error: 'No slot' }, { status: 400 })
      const [h, m] = ord.slot.split(':').map(Number)
      const newTotal = h * 60 + m + mins
      const newSlot = `${String(Math.floor(newTotal / 60) % 24).padStart(2, '0')}:${String(newTotal % 60).padStart(2, '0')}`
      if (ord.event_date) {
        const full = await supabase.from('orders').select('items, deals').eq('order_key', orderKey).single()
        if (full.data) {
          const itemCatMap = await buildItemCatMap(supabase, truck.id)
          await moveSlotBooking(
            supabase, truck.id, ord.event_id, ord.slot, newSlot,
            normaliseOrderLines(full.data.items || [], full.data.deals), itemCatMap
          )
        }
      }
      await supabase.from('orders').update({ slot: newSlot, status: 'confirmed' }).eq('order_key', orderKey)

      // ── 🔴 CAPTURE SITE 3 of 4: QUICK-TIME-ADJUST, WHICH IS A CONFIRMATION IN DISGUISE. ─────────
      // The line above writes `status: 'confirmed'` UNCONDITIONALLY alongside the new slot, and the
      // control is offered on PENDING orders only — so pressing "+10m" confirms the order. A held
      // authorisation must capture here exactly as it does at the Confirm button, or a customer who was
      // "confirmed" by a time change keeps a hold that expires unclaimed.
      // ⚠️ The rolled-forward slot changes nothing about the money: the amount was fixed at
      // authorisation and capture takes that amount.
      // ⚠️ AWAITED AND CANNOT THROW. The order is already confirmed and re-slotted above.
      const adjustCapture = await captureOnConfirmation(supabase, { orderKey, truckId: truck.id, trigger: 'time_adjust' })

      // Notify customer of time change
      if (ord.customer_email) {
        // 🔴 THE SAME DISCARDED-ANSWER DEFECT AS THE CONFIRM BRANCH. This is a confirmation, it takes
        // the money, and the email it sends about the new time said "Pay at the truck on collection".
        const paymentState = await resolveEmailPaymentState(supabase, orderKey, adjustCapture)
        const { data: slotEventRow } = await supabase
          .from('truck_events')
          .select('venue_name, town, postcode')
          .eq('truck_id', truck.id)
          .eq('event_date', ord.event_date)
          .neq('status', 'cancelled')
          .maybeSingle()
        const { html, text } = formatConfirmationEmail({
          orderId: ord.id,
          orderKey,
          customerName: ord.customer_name,
          truckName: truck.name,
          items: ord.items || [],
          deals: ord.deals || [],
          slot: newSlot,
          slotAdjustedFrom: ord.slot,
          discountAmt: ord.discount_amt ?? 0,
          total: Number(ord.total),
          notes: ord.notes ?? null,
          autoAccepted: true,
          paymentState,
          venueName: slotEventRow?.venue_name ?? null,
          venueTown: slotEventRow?.town ?? null,
          venuePostcode: slotEventRow?.postcode ?? null,
          preferredContactMethod: truck.preferred_contact_method ?? null,
          contactPhone: truck.contact_phone ?? null,
          whatsappSender: truck.whatsapp_sender ?? null,
          socialFacebook: truck.social_facebook ?? null,
          socialInstagram: truck.social_instagram ?? null,
          contactEmail: truck.contact_email ?? null,
          allowCancellation: truck.allow_customer_cancellation ?? true,
          cancellationCutoffMins: truck.cancellation_cutoff_mins ?? 30,
          baseUrl: process.env.NEXT_PUBLIC_HATCHGRAB_URL,
          truckSlug: truck.slug ?? undefined,
        })
        await sendEmailUnlessDemo(truck, {
          to: ord.customer_email,
          subject: `Your order #${ord.id} has been updated`,
          html,
          text,
          senderName: truck.name,
        })
      }
      return NextResponse.json({ success: true, newSlot })
    }

    // (update_keep_screen_on removed — keep-screen-on is a PER-DEVICE localStorage pref, no DB write.
    //  trucks.keep_screen_on is dormant, to be dropped with the interface field in a cleanup pass.)

    // ── set_auto_accept ──────────────────────────────────────────────────────
    // ── PAID STEP SETTINGS (V9.4) ─────────────────────────────────────────────
    // show_paid_step=false is today's behaviour EXACTLY and is the default; nothing in the operator
    // surface changes until a truck opts in.
    // ── set_show_paid_step_override ── EVENT-scoped (truck_events), mirrors set_order_ready_override.
    // 🔴 This writes truck_events ONLY. The truck DEFAULT (trucks.show_paid_step) is owned by
    // Manage → Settings; the dashboard must never write it. Writes a concrete true/false for THIS event,
    // which is what makes it survive a later change to the default — see lib/payments/paid-step.ts.
    //
    // ── 🔴 NULL CLEARS THE OVERRIDE. IT IS A VALUE, NOT A MISSING ARGUMENT (10 August 2026) ─────────
    // This used to coerce with `!!value`, so it could ONLY ever write a concrete true/false — which made
    // the override a ONE-WAY DOOR. An operator who tried a setting on one event could never return that
    // event to "follow the truck default": they could only guess the default and match it by hand, and
    // the event would then silently stop tracking the default when it later changed. Coinciding with the
    // default and INHERITING it are different states, and only one of them was reachable.
    // `value === null` now writes NULL, which is exactly the "inherit" the schema has always defined
    // (truck_events.show_paid_step_override is `boolean default null`, and lib/payments/paid-step.ts
    // resolves `event?.show_paid_step_override ?? truck?.show_paid_step`).
    // ⚠️ RESOLUTION ORDER IS UNTOUCHED. This changes only which values can be STORED, never how a stored
    // value is read. Nothing in paidStepFor or the resolver moved.
    // ⚠️ VALIDATED, NOT COERCED — `!!value` would silently turn a typo'd string into `true`. Anything
    // that is not a boolean or null is now a 400, the same discipline set_completion_presses_override
    // uses. `undefined` is REJECTED rather than treated as null: an omitted field is a client bug, and
    // silently clearing an override on one would be the quiet kind of wrong.
    if (action === 'set_show_paid_step_override') {
      const { value, eventId } = body
      if (!eventId) return NextResponse.json({ error: 'Missing eventId' }, { status: 400 })
      if (value !== null && typeof value !== 'boolean') {
        return NextResponse.json({ error: 'value must be true, false, or null to clear' }, { status: 400 })
      }
      // ── SERVER-CONFIRMED UPDATE (V9.6) ─────────────────────────────────────────────────────────
      // Returns the UPDATED ROW so the client can set state FROM THE RESPONSE instead of guessing
      // (optimistic) or re-reading (full refetch). The response IS the source, so it cannot refresh the
      // wrong object — the failure that made a saved paid-step invisible to Add Order.
      // ⚠️ select('*'), NOT a named list: a named select naming a column that does not exist fails the
      // WHOLE statement with 42703 (§35). '*' cannot, and it returns a complete row the client can merge.
      // ⚠️ NO .single(): it throws PGRST116 on zero rows, which would turn a no-op into a 500. An array
      // lets a zero-row result fall through to `event: null` → the client's refetch fallback.
      const { data: rows, error } = await supabase.from('truck_events')
        .update({ show_paid_step_override: value }).eq('id', eventId).eq('truck_id', truck.id)
        .select('*')
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      // Row absent ⇒ still success. The UPDATE and the representation are ONE PostgREST statement, so
      // `error` unset means the write committed; a missing row is not a failed write and must never be
      // reported as one. The client falls back to its refetch.
      return NextResponse.json({ success: true, event: rows?.[0] ?? null })
    }

    // ── set_completion_presses_override ── EVENT-scoped (truck_events), mirrors set_show_paid_step_override.
    // 🔴 Writes truck_events ONLY. The truck DEFAULT (trucks.completion_presses) is owned by Manage →
    // Settings and the dashboard must never write it — the same rule the other two overrides follow.
    //
    // ── 🔴 NULL IS A REAL VALUE HERE: IT MEANS "CLEAR THE OVERRIDE, GO BACK TO MY USUAL SETTING" ─────
    // The other two overrides coerce with `!!value`, so they can only ever write a CONCRETE true/false —
    // which means once an operator touches one for an event, that event is pinned to a literal value
    // forever and changing the truck default no longer reaches it. There is no route back to inherit.
    // That is a real gap in those two (named in docs/payments-report.md), and it is not repeated here:
    // `value === null` writes NULL, which is exactly the "inherit" the schema already defines.
    // ⚠️ VALIDATED, NOT COERCED. An unrecognised value is a 400 rather than a silent write of something
    // the CHECK would reject with a 23514 — the same discipline mark_paid uses for `method`.
    if (action === 'set_completion_presses_override') {
      const { value, eventId } = body
      if (!eventId) return NextResponse.json({ error: 'Missing eventId' }, { status: 400 })
      if (value !== null && value !== 'one' && value !== 'two') {
        return NextResponse.json({ error: "value must be 'one', 'two', or null to clear" }, { status: 400 })
      }
      // Server-confirmed update — same contract as set_show_paid_step_override above: select('*') and
      // NOT a named list (a named select naming a column that does not exist fails the WHOLE statement
      // with 42703), no .single() (PGRST116 on zero rows would turn a no-op into a 500), and a missing
      // row is still success because the UPDATE and its representation are ONE statement.
      const { data: rows, error } = await supabase.from('truck_events')
        .update({ completion_presses_override: value }).eq('id', eventId).eq('truck_id', truck.id)
        .select('*')
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, event: rows?.[0] ?? null })
    }

    // ── set_buzzer_prompt_override ── EVENT-scoped (truck_events), mirrors the two payment overrides.
    // 🔴 Writes truck_events ONLY. The VAN default (truck_vans.buzzer_count) is owned by Manage →
    // Settings and the dashboard must never write it — this toggle governs the after-order PROMPT for
    // one event, not whether the van carries buzzers at all.
    // Writes a concrete true/false; NULL (inherit) is only ever the absence of a write. Nothing seeds
    // this column onto new events, so an override expires by itself — the paid-step model, and the
    // reasoning is recorded at lib/payments/paid-step.ts:18-34.
    if (action === 'set_buzzer_prompt_override') {
      const { value, eventId } = body
      if (!eventId) return NextResponse.json({ error: 'Missing eventId' }, { status: 400 })
      // Server-confirmed update — same contract as set_show_paid_step_override above; the reasoning for
      // select('*'), the absent .single() and the row-absent-is-still-success rule is recorded there.
      const { data: rows, error } = await supabase.from('truck_events')
        .update({ buzzer_prompt: !!value }).eq('id', eventId).eq('truck_id', truck.id)
        .select('*')
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, event: rows?.[0] ?? null })
    }

    // ── set_buzzer ── ASSIGN / CLEAR A PHYSICAL BUZZER NUMBER ────────────────────────────────────
    // 🔴 THIS IS DELIBERATELY NOT THE `edit` ACTION, AND MUST NEVER BE ROUTED THROUGH IT.
    // `edit` forces status:'modified' (:675), re-books production slot capacity (:686-708) and emails
    // the customer that their order changed (:710-748). Handing someone a pager is none of those
    // things: the order has not changed, the kitchen load has not changed, and a customer receiving
    // "your order has been updated" because a buzzer was assigned would be a support ticket.
    // This handler writes `buzzer_number` and NOTHING else. No status, no timestamps, no email, no
    // capacity rebuild. (orders_set_updated_at still bumps updated_at — required, so the client merge
    // at lib/orders/mergeOrders.ts accepts the read that carries the new number.)
    //
    // ⚠️ TWO-ROW WRITE, NOT YET ATOMIC — PHASE 2 REPLACES THIS WITH AN RPC. Taking a buzzer from
    // another order is two sequential statements inside assignBuzzer (lib/buzzer.ts). The clear runs
    // first on purpose; the ordering argument and the phase-2 plan are written up there.
    //
    // Uniqueness per (event, buzzer) is an APPLICATION invariant enforced here and pre-warned in the
    // grid — there is deliberately no unique index, because the confirmed take-it path would then 500
    // at the hatch. See supabase/migrations/20260803_orders_buzzer_number_placed_at.sql.
    if (action === 'set_buzzer') {
      if (!orderKey) return NextResponse.json({ error: 'Missing order_key' }, { status: 400 })
      const raw = body.buzzerNumber
      // null / '' / undefined ⇒ CLEAR. Anything else must be a positive integer.
      const buzzerNumber: number | null =
        raw === null || raw === undefined || raw === '' ? null : Number(raw)
      if (buzzerNumber !== null && (!Number.isInteger(buzzerNumber) || buzzerNumber < 1)) {
        return NextResponse.json({ error: 'Invalid buzzer number' }, { status: 400 })
      }
      // The order's OWN event scopes the clear — never a client-supplied event id, so a stale or
      // hostile client cannot free a buzzer on some other event.
      // Status is deliberately NOT checked: an operator correcting the record on an already-collected
      // order is legitimate, and refusing it would be friction with no safety gain.
      const { data: target } = await supabase.from('orders')
        .select('event_id, placed_at').eq('order_key', orderKey).eq('truck_id', truck.id).maybeSingle()
      if (!target) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      // ── REPLAY MARKER — QUEUED OPS ONLY ────────────────────────────────────────────────────────
      // `replay` rides on the outbox body alone (gatedAction's queuedExtra), never on an online
      // request. It is what switches assign_buzzer_atomic from "the operator confirmed this take, just
      // do it" to "nobody was asked — arbitrate on placed_at and flag the loser".
      const isReplay = body.replay === true
      // ── THE OP'S CARRIED placed_at ─────────────────────────────────────────────────────────────
      // A replayed buzzer op carries the ORDER'S placed_at. It is REPAIR-ONLY: the RPC arbitrates on
      // the ROW's value, and an operator-created order already has one (client-minted at the tap), so
      // this fires only for a pre-migration row that has none. Writing it makes the carried value
      // load-bearing rather than decorative, and gives conflict resolution something better than
      // created_at to compare. Never overwrites an existing placed_at.
      if (isReplay && !(target as any).placed_at && typeof body.placedAt === 'string' && body.placedAt) {
        await supabase.from('orders')
          .update({ placed_at: body.placedAt })
          .eq('order_key', orderKey).eq('truck_id', truck.id).is('placed_at', null)
      }
      try {
        const { assigned, clearedFrom, lost } = await assignBuzzer(supabase, {
          truckId: truck.id,
          eventId: (target as any).event_id ?? null,
          orderKey,
          buzzerNumber,
          replay: isReplay,
        })
        // 🔴 A LOST REPLAY IS STILL A 2xx, AND THAT IS DELIBERATE. `assigned: false` means conflict
        // resolution ran and this order lost the buzzer on placed_at — the server did exactly what it
        // was asked to. Returning 409 would flag the op 'conflict' in the outbox and leave it sitting
        // there for a human to re-run, re-running a decision that has already been made correctly.
        // The operator is told through the banner instead (orders.buzzer_lost_at), which names the
        // order and offers Assign — an actionable prompt rather than a dead queue entry.
        return NextResponse.json({ success: true, assigned, buzzerNumber: assigned ? buzzerNumber : null, clearedFrom, lost })
      } catch (err) {
        console.error(`[set_buzzer] failed for order_key=${orderKey} truck_id=${truck.id}:`, err)
        return NextResponse.json({ error: 'Could not save the buzzer number' }, { status: 500 })
      }
    }

    // ── set_takes_cash_override ── EVENT-scoped (truck_events), mirrors set_show_paid_step_override.
    // 🔴 Writes truck_events ONLY. The truck DEFAULT (trucks.takes_cash) is owned by Manage → Settings.
    // The intended use is a card terminal failing mid-service: cash on for TONIGHT, from the dashboard.
    // Nothing is seeded onto future events, so the override expires by itself.
    // 🔴 NULL CLEARS THE OVERRIDE, exactly as on set_show_paid_step_override above — read the full
    // reasoning there. In short: `!!value` made this a one-way door, and coinciding with the truck
    // default is not the same state as inheriting it. Resolution order is untouched.
    if (action === 'set_takes_cash_override') {
      const { value, eventId } = body
      if (!eventId) return NextResponse.json({ error: 'Missing eventId' }, { status: 400 })
      if (value !== null && typeof value !== 'boolean') {
        return NextResponse.json({ error: 'value must be true, false, or null to clear' }, { status: 400 })
      }
      // Server-confirmed update — same contract as set_show_paid_step_override above; the reasoning for
      // select('*'), the absent .single() and the row-absent-is-still-success rule is recorded there.
      const { data: rows, error } = await supabase.from('truck_events')
        .update({ takes_cash_override: value }).eq('id', eventId).eq('truck_id', truck.id)
        .select('*')
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, event: rows?.[0] ?? null })
    }

    // ── MARK PAID (V9.4) — the FIRST half of the split "Mark paid & done" ─────
    // Takes the full OUTSTANDING balance and does NOT touch order status: the order stays exactly where
    // it is in the queue. Reuses recordCollectionPayment, so it books the same ledger row under the same
    // `collect:{order_key}` key that a one-tap completion would — the money event is identical, only the
    // moment differs. Re-firing is therefore a safe no-op (balance already zero).
    // Fails OPEN, like `collected`: the operator has the cash in hand, so an accounting failure must not
    // strand the order. The warning rides back on the success response.
    // Three action names, ONE handler. The cash/card split sends `mark_paid_cash` / `mark_paid_card`
    // rather than `mark_paid` + a body field, so the client's per-button loading key
    // (`${action}-${order_key}`) is naturally DISTINCT per button — without that, tapping Cash would
    // put BOTH buttons into the pending state, which is exactly the bug fixed on the confirm bar.
    // `mark_paid` (no suffix) stays valid for a truck that does not split, and still honours an explicit
    // body.method if one is ever sent.
    if (action === 'mark_paid' || action === 'mark_paid_cash' || action === 'mark_paid_card') {
      // ── 🔴 THE SERVER-SIDE GUARD. A LIVE CARD HOLD REFUSES AN IN-PERSON PAYMENT. ─────────────────
      // The order card already hides this button for a held order (OrderCard.tsx:322, "pressing it
      // books a SECOND payment at the hatch for an order the customer has already authorised"). That
      // reasoning was right and it was written down — AND IT WAS THE ONLY THING PROTECTING THE MONEY.
      // 🔴 ON 12 AUGUST 2026 IT WAS NOT ENOUGH. Orders 18 and 19 were marked paid at 21:14 and their
      // held cards captured 70 seconds later; both customers were charged twice. A button label cannot
      // defend a route that an offline replay, a stale board, the KDS or a direct POST can all reach.
      // ⚠️ THIS ONE FAILS CLOSED, UNLIKE EVERY OTHER MONEY WRITE IN THIS FILE. `collected` and the
      // ledger writes below fail OPEN because refusing them strands an operator at the hatch with cash
      // in hand. Refusing HERE strands nobody: the money has not been taken yet, the customer's card
      // already covers the order, and the correct action is to do nothing. Fail-open is for recording
      // money that has already moved; this is preventing money from moving twice.
      // ⚠️ 409, NOT 400. The request is well-formed; it conflicts with the order's current state.
      if (await hasHeldAuthorisation(supabase, orderKey)) {
        console.warn(
          `[${action}] REFUSED for order_key=${orderKey} truck=${truck.id} — the card is authorised and ` +
          `uncaptured. Recording an in-person payment here is the double-charge of 12 August.`,
        )
        await logAction(supabase, {
          action: `${action}_refused_card_held`, truckId: truck.id, orderKey,
          beforeState: { reason: 'held_authorisation' },
          afterState: { recorded: false, meaning: 'refused: this order has a live card hold against it' },
          actor, source: actorSource,
        })
        return NextResponse.json({
          error: 'This customer has already paid by card. Their card is authorised for this order and is '
               + 'charged automatically when you confirm it, so taking payment here would charge them '
               + 'twice. Nothing has been recorded.',
        }, { status: 409 })
      }
      let paymentWarning: string | null = null
      let charged = 0
      // HOW the money arrived. Validated against the same vocabulary as the DB CHECK so a bad value
      // fails as a 400 rather than a 23514. Absent/invalid ⇒ null ⇒ "not recorded", the honest value
      // for a truck that does not split cash from card.
      const method: 'cash' | 'card' | null =
        action === 'mark_paid_cash' ? 'cash'
        : action === 'mark_paid_card' ? 'card'
        : (body.method === 'cash' || body.method === 'card' ? body.method : null)
      try {
        const res = await recordCollectionPayment(supabase, { orderKey, truckId: truck.id, createdBy: actor.actorId, method })
        charged = res.chargedMinor
      } catch (err) {
        console.error(`[mark_paid] LEDGER WRITE FAILED for order_key=${orderKey} truck_id=${truck.id} — the order was NOT marked paid in the ledger (fail-open; status untouched). Re-run recalcOrderPayment to repair:`, err)
        paymentWarning = 'Payment could not be recorded — the takings figure for this order may be wrong until it is repaired.'
      }
      await logAction(supabase, {
        action, truckId: truck.id, orderKey, amountMinor: charged,
        beforeState: { payment: 'outstanding' },
        afterState: { charged_minor: charged, method, ledger_failed: paymentWarning !== null },
        actor, source: actorSource,
      })
      return NextResponse.json({ success: true, chargedMinor: charged, ...(paymentWarning ? { paymentWarning } : {}) })
    }

    // ── UNDO MARK PAID (V9.4) — the payment half of the two-stage undo ────────
    // Same rule as undo_collected's reversal and for the same reason: this is a mis-tap seconds old, no
    // real money moved, so the row is DELETED rather than compensated (a refund row for a payment that
    // never happened would corrupt the §37 fee figures). Audit FIRST — if the audit write fails the
    // delete is aborted and the undo refused. FAILS CLOSED, deliberately: erasing a payment record with
    // no log of the erasure is the exact state action_audit_log exists to prevent.
    if (action === 'undo_mark_paid') {
      try {
        await reverseCollectionPayment(supabase, {
          orderKey, truckId: truck.id, createdBy: actor.actorId,
          beforeDelete: async (deletedRow) => {
            await logActionOrThrow(supabase, {
              action: 'undo_mark_paid', truckId: truck.id, orderKey,
              amountMinor: deletedRow.amount_minor,
              beforeState: { ledger_row: deletedRow },
              afterState: { ledger_row: null, ledger_row_deleted: true },
              actor, source: actorSource,
            })
          },
        })
      } catch (err) {
        console.error(`[undo_mark_paid] REFUSED for order_key=${orderKey} truck_id=${truck.id} — the payment row was NOT deleted:`, err)
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Payment could not be reversed' }, { status: 500 })
      }
      return NextResponse.json({ success: true })
    }

    if (action === 'set_auto_accept') {
      const { value } = body
      await supabase.from('trucks').update({ auto_accept: !!value }).eq('id', truck.id)
      return NextResponse.json({ success: true })
    }

    // ── set_online_payments_paused ── 🔴 TEMPORARY. DELETE THIS HANDLER WITH THE SWITCH ──────────────
    // Turns online card payments off (and back on) for THIS TRUCK, across every event. The rule itself
    // lives in lib/payments/online-payments-switch.ts — this handler writes the column and never decides.
    //
    // 🔴 TRUCK-WIDE, AND UNLIKE EVERY OTHER SETTING ON THE DASHBOARD SETTINGS TAB. The three paid-step
    // overrides and the buzzer prompt all write truck_events for the ACTIVE EVENT and expire by
    // themselves. This writes `trucks` and persists until an operator clears it. That is correct for a
    // payment incident — an outage does not end because the service did — and it is exactly why the
    // dashboard carries a persistent banner while it is set. Do NOT re-scope this to an event.
    //
    // ⚠️ THE TIMESTAMP IS SERVER-MINTED. The client sends a boolean intent and never a time it could
    // backdate — the same discipline capacity_ack_at uses on the walk-up insert.
    //
    // ⚠️ VALIDATED, NOT COERCED — `!!value` would silently read a typo'd string as `true` and pause a
    // truck's payments. Anything that is not a boolean is a 400, the same rule
    // set_show_paid_step_override follows. There is no `null` here: unlike a per-event override this
    // column has no third "inherit" state, so `false` IS the un-paused value.
    if (action === 'set_online_payments_paused') {
      const { value } = body
      if (typeof value !== 'boolean') {
        return NextResponse.json({ error: 'value must be true or false' }, { status: 400 })
      }
      // ⚠️ select('*'), NOT a named list — the same rule set_show_paid_step_override follows: a named
      // select naming a column that does not exist fails the WHOLE statement with 42703 (§35), and '*'
      // cannot. 🔴 But unlike that handler the ROW IS NOT RETURNED: `trucks` carries tokens and pins,
      // which /api/dashboard strips through publicTruckFields before they reach a browser. Only the one
      // column is echoed back, which is all the client sets state from.
      // ⚠️ NO .single(): it throws PGRST116 on zero rows, turning a no-op into a 500.
      const { data: rows, error } = await supabase.from('trucks')
        .update({ online_payments_paused_at: value ? new Date().toISOString() : null })
        .eq('id', truck.id)
        .select('*')
      if (error) {
        console.error('[set_online_payments_paused] update failed:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      // Row absent still means success — the UPDATE and its representation are ONE PostgREST statement,
      // so `error` unset means the write committed. The client falls back to its refetch.
      return NextResponse.json({
        success: true,
        online_payments_paused_at: rows?.[0]?.online_payments_paused_at ?? null,
      })
    }

    // ── set_print_trigger_mode ── WHEN a kitchen ticket prints. TRUCK-level, not device-level: it is a
    //    workflow policy ("we print when we accept" vs "ten minutes before"), and two devices holding
    //    DIFFERENT modes would print the same order twice at two different times, which reads as a
    //    malfunction rather than a duplicate. See 20260806_trucks_print_trigger_mode.sql.
    //    ⚠️ WHITELISTED, not passed through. The column has a CHECK constraint, so an unexpected value
    //    would 400 from Postgres; coercing to the safe default here keeps the failure quiet and correct,
    //    matching set_sound_config's sanitising idiom rather than trusting the client.
    if (action === 'set_print_trigger_mode') {
      const mode = body.value === 'on_confirmed' ? 'on_confirmed' : 'lead_time'
      const { error } = await supabase.from('trucks').update({ print_trigger_mode: mode }).eq('id', truck.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, print_trigger_mode: mode })
    }

    // ── set_notes_require_review ── hold NOTED orders pending for manual review (allergy safety) ──
    if (action === 'set_notes_require_review') {
      const { value } = body
      await supabase.from('trucks').update({ notes_require_review: !!value }).eq('id', truck.id)
      return NextResponse.json({ success: true })
    }

    // ── set_sound_config ── per-truck SOUND POLICY (which alerts fire). Same trucks.sound_config column
    //    the Manage settings write → the two surfaces mirror automatically. Sanitised defensively: the
    //    'off' new_orders value stays VALID (spec'd + may be API/DB-set) even though the UI no longer offers it.
    if (action === 'set_sound_config') {
      const v = body.value ?? {}
      const no = ['needs_confirming', 'all', 'off'].includes(v.new_orders) ? v.new_orders : 'needs_confirming'
      const sound_config = { new_orders: no, order_due: !!v.order_due }
      const { error } = await supabase.from('trucks').update({ sound_config }).eq('id', truck.id)
      if (error) {
        console.error('[set_sound_config] write failed:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, sound_config })
    }

    // ── set_paused ── EVENT-scoped (truck_events), not truck/van ───────────────
    if (action === 'set_paused') {
      const { paused_until, eventId } = body
      if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 })
      const resuming = !paused_until // null/undefined ⇒ "Resume orders"
      // Resume = operator forcing orders back on for THIS event → clear both the manual pause and
      // any offline auto-pause on the event. (If still genuinely offline, the heartbeat-monitor
      // re-applies online_paused_until on its next run for the live event; the heartbeat clears it
      // while the device beats.) Pause sets only paused_until, leaving any offline pause untouched.
      const patch = resuming
        ? { paused_until: null, online_paused_until: null }
        : { paused_until }
      await supabase.from('truck_events').update(patch).eq('id', eventId).eq('truck_id', truck.id)
      return NextResponse.json({ success: true })
    }

    // ── set_offline_protection ── EVENT-scoped offline_protection_override (truck_events) ──────────
    // SERVICE-ROLE write (the dashboard toggle used to write via the browser anon client, which RLS
    // silently no-op'd → the toggle never persisted). value: true (force on) / false (force off) /
    // null (reset to the van default). Disabling (false) ALSO clears any active offline auto-pause
    // (online_paused_until) for this event — "don't offline-pause this event" should take effect now,
    // not wait for the AND-gate with a leftover value. NEVER touches paused_until (a manual pause is
    // separate). Mirrors the set_paused clear, but offline-only.
    if (action === 'set_offline_protection') {
      const { value, eventId } = body
      if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 })
      if (value !== true && value !== false && value !== null) {
        return NextResponse.json({ error: 'value must be true, false, or null' }, { status: 400 })
      }
      const patch: Record<string, unknown> = { offline_protection_override: value }
      if (value === false) patch.online_paused_until = null // disabling clears the offline pause too
      const { error } = await supabase.from('truck_events').update(patch).eq('id', eventId).eq('truck_id', truck.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    // ── set_order_ready_override ── EVENT-scoped order_ready_override (truck_events) ────────────────
    // Per-event order-ready on/off. value: true (on) / false (off). The dashboard toggle only ever sends
    // true/false (master-switch model — every event has a concrete value); null is still accepted as a
    // legacy/no-op input. Governs ONLY the orders-screen Ready button (model A — the ready email is never
    // gated). effectiveOrderReady resolves from this in /api/dashboard, so a refetch picks up the new value.
    if (action === 'set_order_ready_override') {
      const { value, eventId } = body
      if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 })
      if (value !== true && value !== false && value !== null) {
        return NextResponse.json({ error: 'value must be true, false, or null' }, { status: 400 })
      }
      const { error } = await supabase.from('truck_events').update({ order_ready_override: value }).eq('id', eventId).eq('truck_id', truck.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    // ── set_extra_wait ── EVENT-scoped (truck_events), not trucks ──────────────
    if (action === 'set_extra_wait') {
      const { eventId } = body
      if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 })
      const mins = parseInt(body.minutes) || 0
      await supabase.from('truck_events').update({
        extra_wait_mins: mins,
        extra_wait_started_at: mins > 0 ? new Date().toISOString() : null,
      }).eq('id', eventId).eq('truck_id', truck.id)
      return NextResponse.json({ success: true })
    }

    // ── SAVE PREP CONFIGS ─────────────────────────────────────────────────────
    if (action === 'save_prep_configs') {
      const configs: Record<string, { secs: number; batch: number }> = body.configs || {}
      const { data: cats } = await supabase
        .from('menu_categories')
        .select('id, name')
        .eq('truck_id', truck.id)
      for (const cat of (cats || [])) {
        const cfg = configs[cat.name.toLowerCase()]
        if (!cfg) continue
        await supabase.from('menu_categories').update({
          prep_secs: cfg.secs,
          batch_size: cfg.batch,
        }).eq('id', cat.id)
      }
      return NextResponse.json({ success: true })
    }

    // ── UPDATE CATEGORY ───────────────────────────────────────────────────────
    if (action === 'update_category') {
      const { categoryId, name, prep_secs, batch_size, allow_notes, counts_toward_capacity } = body
      if (!categoryId) return NextResponse.json({ error: 'categoryId required' }, { status: 400 })
      await supabase.from('menu_categories')
        // counts_toward_capacity only set when explicitly provided (the capacity tickbox) — a
        // prep/batch save omits it and must NOT reset it. undefined fields are dropped by the PATCH.
        .update({ name, prep_secs, batch_size, allow_notes, ...(counts_toward_capacity !== undefined ? { counts_toward_capacity: !!counts_toward_capacity } : {}) })
        .eq('id', categoryId)
        .eq('truck_id', truck.id)
      return NextResponse.json({ success: true })
    }

    // ── GET EVENTS ────────────────────────────────────────────────────────────
    if (action === 'get_events') {
      const today = new Date().toISOString().split('T')[0]
      const { data: events } = await supabase
        .from('truck_events')
        .select('id, event_date, start_time, end_time, venue_name')
        .eq('truck_id', truck.id)
        .neq('status', 'cancelled')
        .gte('event_date', today)
        .order('event_date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(20)
      return NextResponse.json({ success: true, events: events || [] })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  } catch (err: any) {
    console.error('Dashboard action error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}