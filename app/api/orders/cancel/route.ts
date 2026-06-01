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
    const { orderId } = await req.json()

    if (!orderId) {
      return NextResponse.json({ error: 'Order ID required' }, { status: 400 })
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
        )
      `)
      .eq('id', orderId)
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
    if (order.slot && order.event_date && truck?.cancellation_cutoff_mins) {
      const slotTime = new Date(`${order.event_date}T${order.slot}`)
      const cutoffTime = new Date(
        slotTime.getTime() - truck.cancellation_cutoff_mins * 60 * 1000
      )
      if (new Date() > cutoffTime) {
        return NextResponse.json(
          {
            error: `Cancellations must be made at least ${truck.cancellation_cutoff_mins} minutes before your pickup time`,
          },
          { status: 409 }
        )
      }
    }

    // Cancel the order
    const { error: cancelError } = await supabase
      .from('orders')
      .update({ status: 'cancelled', cancellation_reason: 'Customer cancelled' })
      .eq('id', orderId)

    if (cancelError) {
      return NextResponse.json({ error: 'Failed to cancel order' }, { status: 500 })
    }

    // Remove from production slot (same pattern as operator cancel)
    if (order.slot && order.event_date && order.truck_id) {
      try {
        const itemCatMap = await buildItemCatMap(supabase, order.truck_id)
        await removeOrderFromProductionSlot(
          supabase,
          order.truck_id,
          order.event_date,
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
