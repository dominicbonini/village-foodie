import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendCancellationEmail } from '@/lib/email'
import {
  removeOrderFromProductionSlot,
  buildItemCatMap,
  normaliseOrderLines,
} from '@/lib/slot-bookings'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    // order_key is the UUID row identity (from the cancel link). Never the display id.
    const { order_key: orderKey } = await req.json()

    if (!orderKey) {
      return NextResponse.json({ error: 'Order key required' }, { status: 400 })
    }

    // Fetch order with truck settings
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        trucks!truck_id (
          name,
          allow_customer_cancellation,
          cancellation_cutoff_mins
        ),
        truck_events!event_id (
          end_time
        )
      `)
      .eq('order_key', orderKey)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const truck = order.trucks as any

    // Check cancellation is allowed for this truck
    if (!truck?.allow_customer_cancellation) {
      return NextResponse.json(
        { error: 'This truck does not accept cancellations' },
        { status: 403 }
      )
    }

    // Can only cancel pending or confirmed orders
    if (!['pending', 'confirmed'].includes(order.status)) {
      return NextResponse.json(
        { error: 'This order can no longer be cancelled' },
        { status: 409 }
      )
    }

    // Check cutoff window — order.slot is "HH:MM", order.event_date is "YYYY-MM-DD"
    if (truck?.cancellation_cutoff_mins && order.event_date) {
      const event = (order as any).truck_events
      const effectiveSlot = order.slot || event?.end_time || null
      if (effectiveSlot) {
        const slotTime = new Date(`${order.event_date}T${effectiveSlot}`)
        const cutoffTime = new Date(slotTime.getTime() - truck.cancellation_cutoff_mins * 60 * 1000)
        if (new Date() > cutoffTime) {
          return NextResponse.json(
            { error: `Orders can no longer be cancelled within ${truck.cancellation_cutoff_mins} minutes of collection` },
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
      return NextResponse.json({ error: 'Failed to cancel order' }, { status: 500 })
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
    }

    // Send cancellation email to customer
    if (order.customer_email) {
      await sendCancellationEmail({
        to: order.customer_email,
        customerName: order.customer_name || 'there',
        orderId: order.id,
        truckName: truck?.name || '',
        reason: null,
        paymentStatus: order.payment_status ?? null,
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[customer-cancel] error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
