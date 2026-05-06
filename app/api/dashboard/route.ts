// app/api/dashboard/route.ts
// Returns live orders for a truck dashboard session
// Verified by dashboard_token + PIN

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const pin   = req.nextUrl.searchParams.get('pin')
  const date  = req.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0]

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 401 })
  }

  // Find truck by token
  const { data: truck, error } = await supabase
    .from('trucks')
    .select('id, name, dashboard_pin, mode, venue_name, slot_duration_mins, collection_interval_mins, items_per_minute, walkin_buffer_pct')
    .eq('dashboard_token', token)
    .eq('active', true)
    .single()

  if (error || !truck) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  // Check PIN if set
  if (truck.dashboard_pin && truck.dashboard_pin !== pin) {
    return NextResponse.json({ error: 'Invalid PIN', requiresPin: true }, { status: 401 })
  }

  // Fetch today's orders
  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .eq('truck_id', truck.id)
    .eq('event_date', date)
    .order('created_at', { ascending: true })

  // Fetch available slots for manual order entry
  const { data: slots } = await supabase
    .from('collection_times')
    .select('collection_time, production_slot')
    .eq('truck_id', truck.id)
    .eq('event_date', date)
    .order('collection_time', { ascending: true })

  // Get order counts per slot to check capacity
  const { data: capacities } = await supabase
    .from('slot_capacity')
    .select('slot, max_orders')
    .eq('truck_id', truck.id)
    .eq('event_date', date)

  const slotCounts: Record<string, number> = {}
  orders?.forEach(o => {
    if (o.slot && ['pending','confirmed','modified'].includes(o.status)) {
      slotCounts[o.slot] = (slotCounts[o.slot] || 0) + 1
    }
  })

  const capacityMap = Object.fromEntries(
    (capacities || []).map(c => [c.slot, c.max_orders])
  )

  const slotsWithCapacity = (slots || []).map(s => ({
    collection_time:  s.collection_time,
    production_slot:  s.production_slot,
    current_orders:   slotCounts[s.collection_time] || 0,
    max_orders:       capacityMap[s.production_slot] || 999,
    available:        (slotCounts[s.collection_time] || 0) < (capacityMap[s.production_slot] || 999),
  }))

  return NextResponse.json({
    truck: {
      id:         truck.id,
      name:       truck.name,
      mode:       truck.mode,
      venue_name: truck.venue_name,
    },
    orders:  orders || [],
    slots:   slotsWithCapacity,
    date,
  })
}