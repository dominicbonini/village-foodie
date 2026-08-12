import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveTruckLogo } from '@/lib/truck-logo'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // [id] is the order_key UUID — globally unique, so no truck scoping needed.
  // id (the display number) stays in the SELECT for the "Order #N" header.
  const { id } = await params

  // -- ⚠️ OPTIONAL TRUCK SCOPING — ADDED 11 August 2026, AND IT IS OPT-IN -------------------------
  // The order_key is an unguessable UUID, so the unscoped read above is not a leak and the email link
  // that has always used this route must keep working exactly as it does — it carries no slug and can
  // supply none. But the customer CONFIRMATION lives at /trucks/<slug>/order and does carry one, and a
  // slug that disagrees with the order's truck would render one truck's order under another truck's
  // header and logo. Not a leak; a correctness fault, and a confusing one.
  // SO THE SCOPING IS A PARAMETER, NOT A RULE: absent => behaviour is byte-identical to before.
  // A caller that knows which truck it is showing passes `?truck=<slug-or-id>` and gets a 404 on a
  // mismatch; a caller that does not, does not.
  const truckParam = req.nextUrl.searchParams.get('truck')

  const { data: order, error } = await supabase
    .from('orders')
    .select(`
      id,
      status,
      customer_name,
      customer_email,
      slot,
      requested_slot,
      asap_estimate,
      event_date,
      items,
      deals,
      deal_savings,
      total,
      payment_status,
      truck_id,
      trucks!truck_id (
        name,
        slug,
        logo_storage_path,
        allow_customer_cancellation,
        cancellation_cutoff_mins
      )
    `)
    .eq('order_key', id)
    .single()

  if (error || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  const truck = order.trucks as any

  // ⚠️ THE MISMATCH IS A 404, NOT A 403, AND DELIBERATELY THE SAME BODY AS "not found". A caller asking
  // about an order on the wrong truck should learn nothing about whether that order exists elsewhere —
  // the same reasoning the hidden-truck gate in /api/orders/submit uses for its own 404. Matched against
  // BOTH the slug and the id, because a truck is addressable either way across this codebase.
  if (truckParam && truckParam !== truck?.slug && truckParam !== order.truck_id) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  // Fetch venue name via truck_id + event_date (orders have no direct FK to truck_events)
  let venueName: string | null = null
  if (order.truck_id && order.event_date) {
    const { data: event } = await supabase
      .from('truck_events')
      .select('venue_name')
      .eq('truck_id', order.truck_id)
      .eq('event_date', order.event_date)
      .maybeSingle()
    venueName = event?.venue_name ?? null
  }

  // The truck's logo, resolved by the SAME shared resolver /api/menu uses, so the confirmation's header
  // is identical whichever way the customer reached it. Isolated in its own await: a logo is decoration
  // and must never be the reason an order fails to render.
  let truckLogo: string | null = null
  if (order.truck_id) {
    try {
      truckLogo = await resolveTruckLogo(supabase, order.truck_id, truck?.logo_storage_path ?? null)
    } catch (e) {
      console.error('[orders/:id] logo resolve failed — rendering without it:', e instanceof Error ? e.message : e)
    }
  }

  return NextResponse.json({
    id: order.id,
    status: order.status,
    customer_name: order.customer_name,
    slot: order.slot,
    event_date: order.event_date,
    items: order.items,
    deals: order.deals,
    total: order.total,
    // ⚠️ THE ORDER'S OWN STATE, NOT A CLAIM FROM A URL. The customer can land here straight from an
    // authorisation, from a bookmark, or minutes later — so what they are told about money must come
    // from the row, never from a query parameter that a failed payment happens to carry.
    payment_status: order.payment_status ?? 'unpaid',
    truck_name: truck?.name ?? null,
    venue_name: venueName,
    allow_cancellation: truck?.allow_customer_cancellation ?? false,
    cancellation_cutoff_mins: truck?.cancellation_cutoff_mins ?? 0,
    // -- ADDED 11 August 2026 for the URL-reachable confirmation ------------------------------------
    // ⚠️ PURELY ADDITIVE. /order/[id]/manage types its response as OrderState and reads it field by
    // field, so extra keys are inert there — nothing filters, nothing iterates the object.
    customer_email: order.customer_email ?? null,
    requested_slot: order.requested_slot ?? null,
    asap_estimate: order.asap_estimate ?? null,
    deal_savings: order.deal_savings ?? null,
    truck_logo: truckLogo,
  })
}
