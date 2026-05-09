// app/api/slots/[truckId]/route.ts
// Returns available collection slots for a truck on a given date
// Used by the customer order form to show/block time slots

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const revalidate = 0

export async function GET(req: NextRequest, { params }: { params: Promise<{ truckId: string }> }) {
  const { truckId } = await params
  const date = req.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0]

  // Fetch collection times for this truck
  const { data: times } = await supabase
    .from('collection_times')
    .select('collection_time, production_slot')
    .eq('truck_id', truckId)
    .order('collection_time', { ascending: true })

  if (!times || times.length === 0) {
    return NextResponse.json({ slots: [] })
  }

  // Fetch slot capacities
  const { data: capacities } = await supabase
    .from('slot_capacity')
    .select('slot, max_orders')
    .eq('truck_id', truckId)
    .eq('event_date', date)

  const capacityMap = Object.fromEntries(
    (capacities || []).map(c => [c.slot, c.max_orders])
  )

  // Count existing orders per slot for this date
  const { data: existingOrders } = await supabase
    .from('orders')
    .select('slot')
    .eq('truck_id', truckId)
    .eq('event_date', date)
    .in('status', ['pending', 'confirmed', 'modified'])

  const slotCounts: Record<string, number> = {}
  ;(existingOrders || []).forEach(o => {
    if (o.slot) slotCounts[o.slot] = (slotCounts[o.slot] || 0) + 1
  })

  // Build slot list with availability
  // Soft capacity: show as "full" at 85% to leave buffer for last-minute orders
  const SOFT_CAP_RATIO = 0.85

  const slots = times.map(s => {
    const maxOrders = capacityMap[s.production_slot] || 999
    const currentOrders = slotCounts[s.collection_time] || 0
    const softMax = Math.max(1, Math.floor(maxOrders * SOFT_CAP_RATIO))
    const available = currentOrders < softMax
    const remaining = Math.max(0, softMax - currentOrders)

    // Don't show slots in the past
    const [h, m] = s.collection_time.split(':').map(Number)
    const slotMins = h * 60 + m
    const now = new Date()
    const nowMins = now.getHours() * 60 + now.getMinutes()
    const isPast = date === new Date().toISOString().split('T')[0] && slotMins <= nowMins + 5

    return {
      collection_time: s.collection_time,
      production_slot: s.production_slot,
      current_orders:  currentOrders,
      max_orders:      maxOrders,
      soft_max:        softMax,
      remaining,
      available:       available && !isPast,
      is_past:         isPast,
    }
  })

  return NextResponse.json({ slots })
}