import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const truckSlug = req.nextUrl.searchParams.get('truck')

  // Resolve slug to truck_id for collision-safe lookup.
  // Order IDs like "0042" are per-truck sequential — the slug scopes the query
  // to the correct truck so two trucks sharing the same sequential ID don't collide.
  let truckId: string | null = null
  if (truckSlug) {
    const { data: truckRow } = await supabase
      .from('trucks')
      .select('id')
      .eq('slug', truckSlug)
      .single()
    truckId = truckRow?.id ?? null
  }

  let query = supabase
    .from('orders')
    .select(`
      id,
      status,
      customer_name,
      slot,
      event_date,
      items,
      deals,
      total,
      truck_id,
      trucks!truck_id (
        name,
        allow_customer_cancellation,
        cancellation_cutoff_mins
      )
    `)
    .eq('id', id)

  if (truckId) {
    query = query.eq('truck_id', truckId)
  }

  const { data: order, error } = await query.single()

  if (error || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  const truck = order.trucks as any

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

  return NextResponse.json({
    id: order.id,
    status: order.status,
    customer_name: order.customer_name,
    slot: order.slot,
    event_date: order.event_date,
    items: order.items,
    deals: order.deals,
    total: order.total,
    truck_name: truck?.name ?? null,
    venue_name: venueName,
    allow_cancellation: truck?.allow_customer_cancellation ?? false,
    cancellation_cutoff_mins: truck?.cancellation_cutoff_mins ?? 0,
  })
}
