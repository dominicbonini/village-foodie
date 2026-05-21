// app/api/dashboard/route.ts
// Returns live orders for a truck dashboard session
// Verified by dashboard_token + PIN

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getBatchCountsByCollectionTime } from '@/lib/slot-bookings'
import { buildSlotAvailability } from '@/lib/slot-availability'
import { generateCollectionTimes } from '@/lib/slot-generation'
import type { CatConfig } from '@/lib/prep-utils'

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
    .select('id, name, dashboard_pin, mode, venue_name, slot_duration_mins, collection_interval_mins, items_per_minute, walkin_buffer_pct, auto_accept, paused_until, extra_wait_mins, extra_wait_started_at, kds_mode, crew_mode, display_mode')
    .eq('dashboard_token', token)
    .eq('active', true)
    .single()

  if (error || !truck) {
    console.error('[dashboard] truck lookup failed:', error?.message, error?.details)
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  // Check PIN if set
  if (truck.dashboard_pin && truck.dashboard_pin !== pin) {
    return NextResponse.json({ error: 'Invalid PIN', requiresPin: true }, { status: 401 })
  }

  // Active orders: no date filter — pre-orders for future events must always be visible
  const ACTIVE_STATUSES = ['pending', 'confirmed', 'modified']
  // Completed + cancelled: scoped to the selected date so yesterday's orders don't bleed in
  const DATE_DONE_STATUSES = ['ready', 'collected', 'rejected', 'cancelled']

  const [{ data: activeOrders }, { data: doneToday }] = await Promise.all([
    supabase
      .from('orders')
      .select('*')
      .eq('truck_id', truck.id)
      .in('status', ACTIVE_STATUSES)
      .order('created_at', { ascending: true }),
    supabase
      .from('orders')
      .select('*')
      .eq('truck_id', truck.id)
      .eq('event_date', date)
      .in('status', DATE_DONE_STATUSES)
      .order('created_at', { ascending: true }),
  ])

  const orderMap = new Map<string, NonNullable<typeof activeOrders>[number]>()
  ;(activeOrders || []).forEach(o => orderMap.set(o.id, o))
  ;(doneToday || []).forEach(o => orderMap.set(o.id, o))
  const orders = Array.from(orderMap.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  // Fetch collection times: prefer dynamic generation from today's event,
  // fall back to static collection_times table
  const [{ data: staticTimes }, { data: todayEvents }] = await Promise.all([
    supabase
      .from('collection_times')
      .select('collection_time, production_slot')
      .eq('truck_id', truck.id)
      .order('collection_time', { ascending: true }),
    supabase
      .from('truck_events')
      .select('id, start_time, end_time, venue_name, event_date')
      .eq('truck_id', truck.id)
      .eq('event_date', date)
      .neq('is_cancelled', true)
      .order('start_time', { ascending: true }),
  ])

  // Use first event for slot generation (if truck has multiple same-day events,
  // the client will select one and re-fetch; first is the best default)
  const todayEvent = (todayEvents && todayEvents.length > 0) ? todayEvents[0] : null

  const intervalMins = truck.collection_interval_mins ?? 0
  const slotDurationMins = truck.slot_duration_mins ?? intervalMins
  const GRACE_MINS = 30

  // Compute event boundaries (HH:MM → minutes since midnight)
  const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  const eventStartMins = todayEvent?.start_time ? toMins(todayEvent.start_time) : null
  const eventEndMins   = todayEvent?.end_time   ? toMins(todayEvent.end_time)   : null

  // Generate slots only from event data — no static fallback
  const slots =
    todayEvent?.start_time && todayEvent?.end_time && intervalMins > 0
      ? generateCollectionTimes(todayEvent.start_time, todayEvent.end_time, intervalMins, slotDurationMins, GRACE_MINS)
      : []

  // Get order counts per slot to check capacity
  const { data: capacities } = await supabase
    .from('slot_capacity')
    .select('slot, max_orders')
    .eq('truck_id', truck.id)
    .eq('event_date', date)

  const capacityMap = Object.fromEntries(
    (capacities || []).map(c => [c.slot, c.max_orders])
  )
  const { data: categories } = await supabase
    .from('menu_categories')
    .select('name, prep_secs, batch_size')
    .eq('truck_id', truck.id)

  const catConfigs: Record<string, CatConfig> = {}
  ;(categories || []).forEach(c => {
    catConfigs[c.name.toLowerCase()] = {
      secs: c.prep_secs || 0,
      batch: c.batch_size || 1,
    }
  })

  let slotsWithCapacity: {
    collection_time: string
    production_slot: string
    current_orders: number
    max_orders: number
    available: boolean
    is_past: boolean
    is_grace: boolean
  }[] = []

  try {
    const slotCounts = await getBatchCountsByCollectionTime(
      supabase, truck.id, date, slots || [], catConfigs
    )
    const nowMins = new Date().getHours() * 60 + new Date().getMinutes()
    // For the truck: don't show slots before event start (use eventStartMins as minimum)
    const earliestMins = eventStartMins !== null ? eventStartMins : nowMins
    slotsWithCapacity = buildSlotAvailability({
      times: slots || [],
      capacityMap,
      slotCounts,
      date,
      nowMins,
      earliestCollectionMins: earliestMins,
      eventEndMins: eventEndMins ?? undefined,
    }).map(s => ({
      collection_time: s.collection_time,
      production_slot: s.production_slot,
      current_orders: s.current_orders,
      max_orders: s.max_orders,
      available: s.available,
      is_past: s.is_past,
      is_grace: s.is_grace,
    }))
  } catch (slotErr) {
    console.error('[dashboard] slot capacity error:', slotErr)
    slotsWithCapacity = (slots || []).map(s => ({
      collection_time: s.collection_time,
      production_slot: s.production_slot,
      current_orders: 0,
      max_orders: capacityMap[s.production_slot] || 999,
      available: true,
      is_past: false,
      is_grace: false,
    }))
  }

  return NextResponse.json({
    truck: {
      id:          truck.id,
      name:        truck.name,
      mode:        truck.mode,
      venue_name:  truck.venue_name,
      auto_accept:         truck.auto_accept ?? false,
      paused_until:        truck.paused_until ?? null,
      extra_wait_mins:     truck.extra_wait_mins ?? 0,
      extra_wait_started_at: truck.extra_wait_started_at ?? null,
      kds_mode:            truck.kds_mode ?? false,
      crew_mode:           truck.crew_mode ?? 'solo',
      display_mode:        (truck.display_mode ?? 'list') as 'list' | 'grid',
    },
    todayEvent: todayEvent
      ? { id: todayEvent.id, event_date: todayEvent.event_date, start_time: todayEvent.start_time, end_time: todayEvent.end_time, venue_name: todayEvent.venue_name ?? null }
      : null,
    orders:  orders || [],
    slots:   slotsWithCapacity,
    date,
  })
}