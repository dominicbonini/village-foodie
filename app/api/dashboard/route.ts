// app/api/dashboard/route.ts
// Returns live orders for a truck dashboard session
// Verified by dashboard_token + PIN

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getBatchCountsByCollectionTime } from '@/lib/slot-bookings'
import { buildSlotAvailability } from '@/lib/slot-availability'
import { generateCollectionTimes } from '@/lib/slot-generation'
import type { CatConfig } from '@/lib/prep-utils'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const pin   = req.nextUrl.searchParams.get('pin')
  const vanId = req.nextUrl.searchParams.get('van_id')
  const date  = req.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0]

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 401 })
  }

  // Find truck by token — select('*') avoids 401 errors from missing columns
  const { data: truck, error } = await supabase
    .from('trucks')
    .select('*')
    .eq('dashboard_token', token)
    .eq('active', true)
    .single()

  if (error || !truck) {
    console.error('[dashboard] truck lookup failed:', error?.message, error?.details)
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  // If there's a logged-in user, verify they own this truck
  const supabaseAuth = await createSupabaseServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()

  let currentUserName: string | null = null
  let userRole: 'owner' | 'manager' | 'staff' | null = null

  if (user) {
    const { data: operator } = await supabase
      .from('operators')
      .select('id, name, email')
      .eq('auth_user_id', user.id)
      .single()

    const isOwner = !!(operator && truck.operator_id && truck.operator_id === operator.id)

    if (isOwner) {
      currentUserName = operator!.name || operator!.email || null
      userRole = 'owner'
    } else {
      // Not the owner — check truck_users membership (staff/manager, or invited user
      // whose operators record was created during invite but doesn't own any truck)
      const { data: truckUser } = await supabase
        .from('truck_users')
        .select('name, email, role')
        .eq('auth_user_id', user.id)
        .eq('truck_id', truck.id)
        .single()

      if (truckUser) {
        currentUserName = truckUser.name || truckUser.email || null
        userRole = (truckUser.role as 'owner' | 'manager' | 'staff') || 'staff'
      } else if (operator && truck.operator_id) {
        // User has an operator account for a different truck → deny
        return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })
      }
      // No operator record + no truck_users → token-only access (KDS/anonymous), userRole stays null
    }
  }

  // Check PIN if set
  if (truck.dashboard_pin && truck.dashboard_pin !== pin) {
    return NextResponse.json({ error: 'Invalid PIN', requiresPin: true }, { status: 401 })
  }

  // In-flight orders: no date filter — covers pre-orders AND orders that moved to cooking/ready
  // before event_date ticks over (timezone edges, near-midnight walk-ups, etc.)
  const ACTIVE_STATUSES = ['pending', 'confirmed', 'modified', 'cooking', 'ready']
  // Terminal orders: scoped to the selected date so yesterday's collected orders don't bleed in
  const DATE_DONE_STATUSES = ['collected', 'rejected', 'cancelled']

  let activeOrdersQuery = supabase
    .from('orders')
    .select('*')
    .eq('truck_id', truck.id)
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: true })

  let doneOrdersQuery = supabase
    .from('orders')
    .select('*')
    .eq('truck_id', truck.id)
    .eq('event_date', date)
    .in('status', DATE_DONE_STATUSES)
    .order('created_at', { ascending: true })

  // Van KDS: show orders for this van OR unassigned orders (van_id null appears on all vans)
  if (vanId) {
    activeOrdersQuery = activeOrdersQuery.or(`van_id.eq.${vanId},van_id.is.null`)
    doneOrdersQuery   = doneOrdersQuery.or(`van_id.eq.${vanId},van_id.is.null`)
  }

  const [{ data: activeOrders }, { data: doneToday }] = await Promise.all([
    activeOrdersQuery,
    doneOrdersQuery,
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
      .neq('status', 'cancelled')
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
  const [{ data: categories }, { data: menuItemsForMap }] = await Promise.all([
    supabase
      .from('menu_categories')
      .select('id, name, prep_secs, batch_size, sort_order')
      .eq('truck_id', truck.id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('menu_items_db')
      .select('name, category_id')
      .eq('truck_id', truck.id),
  ])

  const catConfigs: Record<string, CatConfig> = {}
  ;(categories || []).forEach(c => {
    catConfigs[c.name.toLowerCase()] = {
      secs: c.prep_secs || 0,
      batch: c.batch_size || 1,
    }
  })

  const categoryOrder = (categories || []).map(c => c.name)
  const catById: Record<string, string> = Object.fromEntries(
    (categories || []).map(c => [c.id, c.name])
  )
  const itemCategoryMap: Record<string, string> = {}
  ;(menuItemsForMap || []).forEach(item => {
    if (item.category_id && catById[item.category_id]) {
      itemCategoryMap[item.name] = catById[item.category_id]
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
    currentUserName,
    userRole,
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
      plan:                (truck.plan ?? 'starter') as 'starter' | 'pro' | 'max' | 'trial',
      trial_expires_at:    truck.trial_expires_at ?? null,
      feature_overrides:   (truck.feature_overrides ?? null) as Record<string, boolean> | null,
    },
    todayEvent: todayEvent
      ? { id: todayEvent.id, event_date: todayEvent.event_date, start_time: todayEvent.start_time, end_time: todayEvent.end_time, venue_name: todayEvent.venue_name ?? null }
      : null,
    orders:  orders || [],
    slots:   slotsWithCapacity,
    date,
    categoryOrder,
    itemCategoryMap,
  })
}