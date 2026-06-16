// app/api/dashboard/route.ts
// Returns live orders for a truck dashboard session
// Verified by dashboard_token + PIN

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getProductionSlotUnits } from '@/lib/slot-bookings'
import { buildSlotAvailability } from '@/lib/slot-availability'
import { buildSlotIndicators } from '@/lib/slot-display'
import { generateCollectionTimes } from '@/lib/slot-generation'
import type { CatConfig } from '@/lib/prep-utils'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const pin   = req.nextUrl.searchParams.get('pin')
  const vanId = req.nextUrl.searchParams.get('van_id')
  const date  = req.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0]
  const eventIdParam = req.nextUrl.searchParams.get('event_id')

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 401 })
  }

  // Find truck by token — select('*') avoids 401 errors from missing columns
  const { data: truck, error } = await supabase
    .from('trucks')
    .select('*')
    .eq('dashboard_token', token)
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

  // Resolve the dashboard event context BEFORE reading orders, so the order lists
  // can be scoped to the selected event (V6.4: orders belong to an event, never a
  // pooled date). collection_times is fetched alongside (retained as-is).
  const [{ data: staticTimes }, { data: todayEvents }] = await Promise.all([
    supabase
      .from('collection_times')
      .select('collection_time, production_slot')
      .eq('truck_id', truck.id)
      .order('collection_time', { ascending: true }),
    supabase
      .from('truck_events')
      .select('id, start_time, end_time, venue_name, event_date, van_id, paused_until, online_paused_until, last_offline_pause_at, extra_wait_mins, extra_wait_started_at')
      .eq('truck_id', truck.id)
      .eq('event_date', date)
      .neq('status', 'cancelled')
      .order('start_time', { ascending: true }),
  ])

  // Use first event for slot generation (if truck has multiple same-day events,
  // the client will select one and re-fetch; first is the best default)
  const todayEvent = (todayEvents && todayEvents.length > 0) ? todayEvents[0] : null

  // Event-scoped projection (re-key fix): project the CLIENT-SELECTED event's un-pooled
  // usage. The single-event-on-date case is a FALLBACK only; warn on an ambiguous date
  // so a two-same-date-event truck never silently projects the wrong event.
  let selectedEventId: string | null = null
  if (eventIdParam && todayEvents?.some(e => e.id === eventIdParam)) {
    selectedEventId = eventIdParam
  } else if (todayEvents && todayEvents.length === 1) {
    selectedEventId = todayEvents[0].id
  } else if ((todayEvents?.length ?? 0) > 1) {
    console.warn(`[dashboard] ${todayEvents!.length} events on ${date} for truck ${truck.id} and no valid event_id param — projecting first (${todayEvents![0].id})`)
    selectedEventId = todayEvents![0].id
  }

  // The selected event row (matches selectedEventId and the production-units read).
  // On a multi-event-same-date day this differs from todayEvents[0] — slot times,
  // boundaries, capacity and units must ALL describe this one event, or the dots
  // would be drawn against the wrong event's window.
  const selectedEvent = todayEvents?.find(e => e.id === selectedEventId) ?? todayEvent

  // In-flight orders: no date filter — covers pre-orders AND orders that moved to cooking/ready
  // before event_date ticks over (timezone edges, near-midnight walk-ups, etc.)
  const ACTIVE_STATUSES = ['pending', 'confirmed', 'modified', 'cooking', 'ready']
  // Terminal orders shown alongside the active list for the same event.
  const DONE_STATUSES = ['collected', 'rejected', 'cancelled']

  // Orders are strictly event-scoped (no event_date+van_id fallback): with no
  // selected event there is nothing to show (Section 5 — empty dashboard).
  let activeOrders: any[] = []
  let doneToday: any[] = []
  if (selectedEventId) {
    let activeOrdersQuery = supabase
      .from('orders')
      .select('*')
      .eq('truck_id', truck.id)
      .eq('event_id', selectedEventId)
      .in('status', ACTIVE_STATUSES)
      .order('created_at', { ascending: true })

    let doneOrdersQuery = supabase
      .from('orders')
      .select('*')
      .eq('truck_id', truck.id)
      .eq('event_id', selectedEventId)
      .in('status', DONE_STATUSES)
      .order('created_at', { ascending: true })

    // Van KDS: show orders for this van OR unassigned orders (van_id null appears on all vans)
    if (vanId) {
      activeOrdersQuery = activeOrdersQuery.or(`van_id.eq.${vanId},van_id.is.null`)
      doneOrdersQuery   = doneOrdersQuery.or(`van_id.eq.${vanId},van_id.is.null`)
    }

    const [{ data: a }, { data: d }] = await Promise.all([activeOrdersQuery, doneOrdersQuery])
    activeOrders = a || []
    doneToday = d || []
  }

  // Dedupe by order_key (UUID) — id is the per-event display number and is NOT
  // unique across events, so keying by id would silently drop orders.
  const orderMap = new Map<string, NonNullable<typeof activeOrders>[number]>()
  ;(activeOrders || []).forEach(o => orderMap.set(o.order_key, o))
  ;(doneToday || []).forEach(o => orderMap.set(o.order_key, o))
  const orders = Array.from(orderMap.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  const intervalMins = truck.collection_interval_mins ?? 0
  const slotDurationMins = truck.slot_duration_mins ?? intervalMins
  const GRACE_MINS = 30

  // Compute event boundaries (HH:MM → minutes since midnight) from the SELECTED
  // event so times agree with the selected event's production units.
  const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  const eventStartMins = selectedEvent?.start_time ? toMins(selectedEvent.start_time) : null
  const eventEndMins   = selectedEvent?.end_time   ? toMins(selectedEvent.end_time)   : null

  // Generate slots only from event data — no static fallback
  const slots =
    selectedEvent?.start_time && selectedEvent?.end_time && intervalMins > 0
      ? generateCollectionTimes(selectedEvent.start_time, selectedEvent.end_time, intervalMins, slotDurationMins, GRACE_MINS)
      : []

  const [{ data: categories }, { data: menuItemsForMap }] = await Promise.all([
    supabase
      .from('menu_categories')
      .select('id, name, prep_secs, batch_size, sort_order, counts_toward_capacity')
      .eq('truck_id', truck.id)
      .eq('is_active', true)
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
      countsToCapacity: !!c.counts_toward_capacity,
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
    tone?: 'green' | 'amber' | 'red'
    label?: string
  }[] = []

  // Hoisted so they can be returned for the dashboard's capacity card (single source —
  // the client used to read truck_vans directly with the anon key, which RLS blocked).
  let kitchenCapacity: number | null = null
  let capacityWindowMins = 5
  let activeVanName: string | null = null
  // The selected event's van offline-protection DEFAULT (Settings value). The dashboard
  // shows this when there's no per-event override — without it the client's vanAutoPause
  // stays hardcoded false and misreports the toggle/label.
  let vanAutoPause: boolean = false
  // The selected event's van "show cooking step" preference (Settings value). The KDS cook
  // view gates the "Start cooking" button on this — without it the KDS never loads the
  // setting and the cook step shows regardless of the toggle. Defaults off (matches the
  // Settings toggle's default) when the van has no value.
  let vanShowCookingStep: boolean = false
  // Pause is now EVENT-scoped (truck_events). Sourced from the SELECTED event below and returned
  // under these (legacy-named) keys so the client computes paused state from the SAME fields the
  // customer menu checks. (Kept the key names to avoid churning the client read path.)
  const eventPausedUntil: string | null = (selectedEvent as any)?.paused_until ?? null
  const eventOnlinePausedUntil: string | null = (selectedEvent as any)?.online_paused_until ?? null
  // Durable offline-pause marker (survives the heartbeat reconnect clear). Surfaced with the
  // selected event's id so the dashboard can fire + ack the "paused while offline" popup per-event.
  const eventLastOfflinePauseAt: string | null = (selectedEvent as any)?.last_offline_pause_at ?? null

  try {
    // kitchen_capacity + name from the SELECTED event's van — the same event the
    // production-usage read and slot times are scoped to, so a multi-event-same-date
    // day shows the right event's capacity, not the date's first event.
    const capacityEvent = selectedEvent
    if (capacityEvent?.van_id) {
      const { data: van } = await supabase
        .from('truck_vans')
        .select('kitchen_capacity, capacity_window_mins, name, auto_pause_on_offline, show_cooking_step')
        .eq('id', capacityEvent.van_id)
        .single()
      kitchenCapacity = van?.kitchen_capacity ?? null
      capacityWindowMins = van?.capacity_window_mins ?? 5
      activeVanName = van?.name ?? null
      vanAutoPause = van?.auto_pause_on_offline ?? false   // van offline-protection DEFAULT (toggle label)
      vanShowCookingStep = van?.show_cooking_step ?? false
    }
    const productionSlotUnits = selectedEventId
      ? await getProductionSlotUnits(supabase, truck.id, selectedEventId)
      : {}
    const nowMins = new Date().getHours() * 60 + new Date().getMinutes()
    // For the truck: don't show slots before event start (use eventStartMins as minimum)
    const earliestMins = eventStartMins !== null ? eventStartMins : nowMins
    // Per-slot per-category composition wording ("2 Pizzas, 1 Other") — the SAME buildSlotIndicators
    // the Add Order / Edit dots use (identical backward projection), surfaced so the day-load strip
    // can show the dots' wording on desktop instead of the opaque current_orders/max_orders ratio.
    // No new capacity formula — reuses the dots' own function with the menu category order.
    const dayIndicators = buildSlotIndicators(
      slots || [],
      productionSlotUnits,
      catConfigs,
      kitchenCapacity,
      eventStartMins ?? 0,
      categoryOrder,
      capacityWindowMins,
    )
    slotsWithCapacity = buildSlotAvailability({
      times: slots || [],
      productionSlotUnits,
      catConfigs,
      kitchenCapacity,
      capacityWindowMins,
      date,
      nowMins,
      earliestCollectionMins: earliestMins,
      eventStartMins: eventStartMins ?? 0,
      eventEndMins: eventEndMins ?? undefined,
    }).map(s => ({
      collection_time: s.collection_time,
      production_slot: s.production_slot,
      current_orders: s.current_orders,
      max_orders: s.max_orders,
      available: s.available,
      is_past: s.is_past,
      is_grace: s.is_grace,
      // The day-load strip's tone + label reflect the FULL collection-slot total (buildSlotIndicators
      // now reads production_slot_usage[production_slot] directly), so the strip and the operator Add
      // Order / Edit dots agree. Falls back to buildSlotAvailability's tone only if the indicator is
      // missing. buildSlotAvailability's own tone/available (customer-facing) is unchanged.
      tone: dayIndicators.get(s.collection_time)?.tone ?? s.tone,
      label: dayIndicators.get(s.collection_time)?.label ?? '',
    }))
  } catch (slotErr) {
    console.error('[dashboard] slot capacity error:', slotErr)
    slotsWithCapacity = (slots || []).map(s => ({
      collection_time: s.collection_time,
      production_slot: s.production_slot,
      current_orders: 0,
      max_orders: 999,
      available: true,
      is_past: false,
      is_grace: false,
      tone: 'green' as const,
      label: '',
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
      // Pause + extra-wait are EVENT-scoped now — sourced from the selected event, not the truck.
      // (Legacy trucks.* columns left unread; the badge reads these via the response.)
      paused_until:        null,
      extra_wait_mins:     (selectedEvent as any)?.extra_wait_mins ?? 0,
      extra_wait_started_at: (selectedEvent as any)?.extra_wait_started_at ?? null,
      kds_mode:            truck.kds_mode ?? false,
      crew_mode:           truck.crew_mode ?? 'solo',
      display_mode:        (truck.display_mode ?? 'list') as 'list' | 'grid',
      plan:                (truck.plan ?? 'starter') as 'starter' | 'pro' | 'max' | 'trial',
      trial_expires_at:    truck.trial_expires_at ?? null,
      feature_overrides:   (truck.feature_overrides ?? null) as Record<string, boolean> | null,
      logo: truck.logo_storage_path
        ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/truck-media/${truck.logo_storage_path}`
        : null,
      qr_code_style: (truck.qr_code_style ?? 'standard') as 'standard' | 'branded',
      truck_emoji:   truck.truck_emoji ?? null,
      slug:          truck.slug ?? null,
    },
    todayEvent: todayEvent
      ? { id: todayEvent.id, event_date: todayEvent.event_date, start_time: todayEvent.start_time, end_time: todayEvent.end_time, venue_name: todayEvent.venue_name ?? null }
      : null,
    // Authoritative van capacity + name (service-role read above) for the capacity card —
    // replaces the RLS-blocked anon truck_vans read the client used to do.
    kitchenCapacity,
    capacityWindowMins,
    activeVanName,
    vanAutoPause,
    vanShowCookingStep,
    vanPausedUntil: eventPausedUntil,            // event-scoped (key kept for the client)
    vanOnlinePausedUntil: eventOnlinePausedUntil, // event-scoped (key kept for the client)
    lastOfflinePauseAt: eventLastOfflinePauseAt, // durable offline-pause marker (popup trigger)
    offlinePauseEventId: selectedEventId,         // the event the marker belongs to (ack key)
    orders:  orders || [],
    slots:   slotsWithCapacity,
    date,
    categoryOrder,
    itemCategoryMap,
  })
}