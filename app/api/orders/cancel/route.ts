import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendCancellationEmail } from '@/lib/email'
import { moneyFormatForOrder } from '@/lib/money-server'
import { truckTimeZone } from '@/lib/truck-time'
import { eventTimeInstant } from '@/lib/event-window'
// RELEASE ONLY. It cannot capture and it refuses an order whose money was already taken; see the module.
import { releaseHoldForTerminalOrder } from '@/lib/payments/release-hold'
import { resolveEmailPaymentState } from '@/lib/payments/email-payment-state'
import {
  removeOrderFromProductionSlot,
  buildItemCatMap,
  normaliseOrderLines,
} from '@/lib/slot-bookings'
import { customerErrorBody } from '@/lib/i18n/customer-errors'
import { localeForTruck } from '@/lib/i18n/server-locale'
import { DEFAULT_LOCALE, type AppLocale } from '@/lib/i18n/locales'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  // Every refusal carries a code and its values (Language Phase 1a, lib/i18n/customer-errors) — en-GB until the
  // order's truck is known, then its language.
  let locale: AppLocale = DEFAULT_LOCALE
  try {
    // order_key is the UUID row identity (from the cancel link). Never the display id.
    const { order_key: orderKey } = await req.json()

    if (!orderKey) {
      return NextResponse.json(customerErrorBody(locale, 'order_key_required'), { status: 400 })
    }

    // Fetch order with truck settings
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        trucks!truck_id (
          name,
          allow_customer_cancellation,
          cancellation_cutoff_mins,
          timezone,
          country
        ),
        truck_events!event_id (
          start_time,
          end_time
        )
      `)
      .eq('order_key', orderKey)
      .single()

    if (orderError || !order) {
      return NextResponse.json(customerErrorBody(locale, 'order_not_found'), { status: 404 })
    }

    const truck = order.trucks as any
    locale = await localeForTruck(truck)

    // Check cancellation is allowed for this truck
    if (!truck?.allow_customer_cancellation) {
      return NextResponse.json(
        customerErrorBody(locale, 'cancellations_not_accepted'),
        { status: 403 }
      )
    }

    // Can only cancel an order that has not been made or handed over yet.
    // 'modified' ADDED: an edited order is a LIVE order. Editing it is the operator changing an item or a
    // time; it is not the customer giving up their right to cancel, and every other consumer in the
    // codebase already treats 'modified' as the accepted-and-changed sibling of 'confirmed' (the capture
    // sweep's allow-list, the dashboard's active set, the slot engine, buzzers). This one did not, so an
    // edit silently removed a customer's cancel button AND returned 409 to anyone who reached the endpoint
    // anyway, while their confirmation email still invited them to cancel.
    // The two gates either side of this are unchanged: the truck must allow cancellation, and the cutoff
    // window still applies. The held-card release below has no status gate at all and refuses a captured
    // order, so this admits nothing that could strand money.
    if (!['pending', 'confirmed', 'modified'].includes(order.status)) {
      return NextResponse.json(
        customerErrorBody(locale, 'cannot_cancel'),
        { status: 409 }
      )
    }

    // Check cutoff window — order.slot is "HH:MM", order.event_date is "YYYY-MM-DD"
    if (truck?.cancellation_cutoff_mins && order.event_date) {
      const event = (order as any).truck_events
      const effectiveSlot = order.slot || event?.end_time || null
      if (effectiveSlot) {
        // 🔴 THE SLOT IS THE TRUCK'S WALL CLOCK (Phase 2B, 10 October 2026). It was parsed as UTC on the
        // server (`new Date(\`${date}T${slot}\`)`), so a UK truck's cutoff fell an hour LATE all through BST
        // and a New York truck's four hours EARLY. Now the truck's zone, by the one rule — the same instant
        // the receipt page computes for its Cancel button.
        // 🔴 AN EVENT THAT RUNS PAST MIDNIGHT (lib/event-window.ts): a slot (or end) earlier than its start is the NEXT
        // day's, so a 00:15 order on a 20:00–00:30 event is cut off at 00:15 on the next day − the window. Any other
        // event (or no event row): the order's own date, exactly as before.
        const slotTime = eventTimeInstant(order.event_date, event?.start_time, event?.end_time, effectiveSlot, await truckTimeZone(truck))
        const cutoffTime = new Date(slotTime - truck.cancellation_cutoff_mins * 60 * 1000)
        if (new Date() > cutoffTime) {
          return NextResponse.json(
            customerErrorBody(locale, 'cancel_window_passed', { n: truck.cancellation_cutoff_mins, count: String(truck.cancellation_cutoff_mins) }),
            { status: 409 }
          )
        }
      }
    }

    // Cancel the order
    const { error: cancelError } = await supabase
      .from('orders')
      .update({ status: 'cancelled', cancellation_reason: 'Customer cancelled' })
      .eq('order_key', orderKey)

    if (cancelError) {
      return NextResponse.json(customerErrorBody(locale, 'cancel_failed'), { status: 500 })
    }

    // Remove from production slot (same pattern as operator cancel).
    // order.slot may be null (ASAP) — resolved to the event-start window so it unbooks.
    if (order.event_date && order.truck_id) {
      try {
        const itemCatMap = await buildItemCatMap(supabase, order.truck_id)
        await removeOrderFromProductionSlot(
          supabase,
          order.truck_id,
          order.event_id,
          order.slot,
          normaliseOrderLines(order.items || [], order.deals),
          itemCatMap
        )
      } catch (err) {
        console.error('[customer-cancel] slot removal failed (non-blocking):', err)
      }
      // Ceiling model (step 3): no option-stock reversal — cancelling removes this order from the live
      // ceiling tally automatically (was: releaseOptionStock, the removed decrement pool).
    }

    // THE HELD CARD, AND THIS IS THE PATH NOBODY IS WATCHING.
    // A customer cancelling inside their window is the worse of the two cases: no operator is present,
    // and before this the authorisation simply sat on their card for about a week against an order that
    // no longer existed. Neither sweep could see it — the capture sweep excludes 'cancelled' by design
    // and the abandonment sweep owns drafts that were never promoted.
    // THE ORDER IS ALREADY CANCELLED ABOVE. This runs after, cannot throw, and cannot fail the request:
    // a customer must not be told their cancellation failed because Stripe was slow. A release that
    // fails writes hold_release_failed and leaves the authorisation findable.
    // ONLY EVER RELEASES: a captured order is refused by the module, because giving money back is a
    // refund and a refund is somebody's decision, not a side effect of a cancellation.
    const paymentState = await resolveEmailPaymentState(supabase, order.order_key)
    await releaseHoldForTerminalOrder(supabase, {
      orderKey: order.order_key,
      truckId: order.truck_id,
      trigger: 'customer_cancel',
      actor: { actorKind: 'unknown', actorId: null, actorLabel: null },
      source: 'web',
    })

    // Send cancellation email to customer
    if (order.customer_email) {
      await sendCancellationEmail({
        money: await moneyFormatForOrder(order),
        to: order.customer_email,
        customerName: order.customer_name || '',   // the email says "Hi there" itself when there is no name
        orderId: order.id,
        truckName: truck?.name || '',
        reason: null,
        paymentStatus: order.payment_status ?? null,
        // Resolved BEFORE the release above, so it still reads 'held' rather than the 'hatch' a stamped
        // draft would produce. The email says what was true when they cancelled.
        paymentState,
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[customer-cancel] error:', err)
    return NextResponse.json(customerErrorBody(locale, 'something_went_wrong'), { status: 500 })
  }
}
