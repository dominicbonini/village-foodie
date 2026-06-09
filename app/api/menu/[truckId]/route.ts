// app/api/menu/[truckId]/route.ts
// Supabase-only menu API

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { calcStockRemaining } from '@/lib/stock-utils'
import { getLiveItemCounts } from '@/lib/stock-availability'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

export const revalidate = 0  // No cache

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ truckId: string }> }
) {
  const { truckId } = await params
  const isDashboard = req.nextUrl.searchParams.get('dashboard') === '1'

  console.log('[MENU API] Looking up truck:', truckId)
  
  // Try slug first (customer-facing URLs use slug), then fall back to ID
  // Note: we don't filter by active here — if truck exists, show menu
  // The truck can control ordering via the paused state in the dashboard
  let truckQuery = await supabase
    .from('trucks')
    .select('*')
    .eq('slug', truckId)
    .single()

  if (truckQuery.error || !truckQuery.data) {
    truckQuery = await supabase
      .from('trucks')
      .select('*')
      .eq('id', truckId)
      .single()
  }

  const truck = truckQuery.data
  const truckError = truckQuery.error

  console.log('[MENU API] Truck found:', truck?.name, 'Error:', truckError)

  if (truckError || !truck) {
    return NextResponse.json({ error: 'Truck not found' }, { status: 404 })
  }

  // Fetch all menu data from Supabase
  const [
    { data: categories, error: catError },
    { data: items, error: itemsError },
    { data: bundles },
    { data: upsellRules },
    { data: codes },
    { data: modifierGroups },
    { data: modifierOptions },
    { data: categoryModGroups },
    { data: itemOverrides },
  ] = await Promise.all([
    supabase
      .from('menu_categories')
      .select('*')
      .eq('truck_id', truck.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name'),

    supabase
      .from('menu_items_db')
      .select('*, default_stock, menu_categories!category_id(name)')
      .eq('truck_id', truck.id)
      .eq('is_active', true)
      .order('name'),

    supabase
      .from('bundles_db')
      .select('*, apply_to_new_events')
      .eq('truck_id', truck.id),

    supabase
      .from('upsell_rules')
      .select('*')
      .eq('truck_id', truck.id),

    supabase
      .from('discount_codes_db')
      .select('*')
      .eq('truck_id', truck.id)
      .eq('is_active', true),

    supabase
      .from('modifier_groups')
      .select('id, name')
      .eq('truck_id', truck.id),

    supabase
      .from('modifier_options')
      .select('id, group_id, name, price_adjustment, available')
      .in('group_id',
        (await supabase.from('modifier_groups').select('id').eq('truck_id', truck.id)).data?.map((g: { id: string }) => g.id) || []
      )
      .order('sort_order', { ascending: true }),

    supabase
      .from('category_modifier_groups')
      .select('category_id, group_id'),

    supabase
      .from('item_overrides')
      .select('item_name, stock_count, available')
      .eq('truck_id', truck.id),
  ])

  console.log('[MENU API] Query results:')
  console.log('  categories:', categories?.length || 0, catError)
  console.log('  items:', items?.length || 0, itemsError)
  console.log('  items data:', items)
  console.log('  bundles:', bundles?.length || 0)

  // Filter bundles by event_deals: use explicit event_id param, or auto-detect the current open/confirmed event
  let filteredBundles = bundles || []
  const eventIdParam = req.nextUrl.searchParams.get('event_id')
  let effectiveEventId = eventIdParam
  let orderingAvailable = true

  if (eventIdParam) {
    // Explicit event — check its status
    const { data: explicitEvent } = await supabase
      .from('truck_events')
      .select('id, status')
      .eq('id', eventIdParam)
      .eq('truck_id', truck.id)
      .maybeSingle()

    if (explicitEvent && !['confirmed', 'open'].includes(explicitEvent.status)) {
      return NextResponse.json({
        error: 'This event is not yet confirmed',
        event_status: explicitEvent.status,
        ordering_available: false,
      }, { status: 404 })
    }
  } else {
    const today = new Date().toISOString().split('T')[0]
    const { data: openEvent } = await supabase
      .from('truck_events')
      .select('id')
      .eq('truck_id', truck.id)
      .in('status', ['open', 'confirmed'])
      .gte('event_date', today)
      .order('event_date', { ascending: true })
      .limit(1)
      .maybeSingle()
    effectiveEventId = openEvent?.id ?? null

    // If no confirmed/open event, check for unconfirmed upcoming events
    if (!effectiveEventId) {
      const { data: unconfirmedEvent } = await supabase
        .from('truck_events')
        .select('id')
        .eq('truck_id', truck.id)
        .eq('status', 'unconfirmed')
        .gte('event_date', today)
        .limit(1)
        .maybeSingle()
      if (unconfirmedEvent) orderingAvailable = false
    }
  }

  if (effectiveEventId) {
    const { data: eventDeals } = await supabase
      .from('event_deals')
      .select('bundle_id, active')
      .eq('event_id', effectiveEventId)

    if (eventDeals && eventDeals.length > 0) {
      const activeBundleIds = new Set(eventDeals.filter(d => d.active).map(d => d.bundle_id))
      filteredBundles = filteredBundles.filter(b => activeBundleIds.has(b.id))
    } else {
      filteredBundles = filteredBundles.filter(b => b.apply_to_new_events)
    }
  }

  // Stock check: filter out bundles where any slot category has no available items
  const menuSlotKeys = ['slot_1_category', 'slot_2_category', 'slot_3_category', 'slot_4_category', 'slot_5_category', 'slot_6_category'] as const
  filteredBundles = filteredBundles.filter(bundle => {
    const slotCategories = menuSlotKeys.map(k => bundle[k]).filter(Boolean) as string[]
    if (slotCategories.length === 0) return true
    return slotCategories.every(slug => {
      const cat = (categories || []).find((c: any) => c.slug === slug || c.name?.toLowerCase() === slug?.toLowerCase())
      if (!cat) return true
      const catItems = (items || []).filter((i: any) => i.category_id === cat.id)
      return catItems.some((i: any) => i.is_available && (i.stock_count === null || i.stock_count > 0))
    })
  })

  // Van-level pause check — extends truck-level pause state
  let isPaused = truck.paused_until
    ? new Date(truck.paused_until) > new Date()
    : false
  let pauseReason: 'manual' | 'offline' | null = isPaused ? 'manual' : null

  if (effectiveEventId) {
    const { data: eventVan } = await supabase
      .from('truck_events')
      .select('van_id')
      .eq('id', effectiveEventId)
      .single()

    if (eventVan?.van_id) {
      const [{ data: van }, { data: eventOverrideRow }] = await Promise.all([
        supabase
          .from('truck_vans')
          .select('paused_until, online_paused_until, auto_pause_on_offline')
          .eq('id', eventVan.van_id)
          .single(),
        supabase
          .from('truck_events')
          .select('offline_protection_override')
          .eq('id', effectiveEventId)
          .single(),
      ])

      if (van) {
        const offlineProtectionEnabled =
          eventOverrideRow?.offline_protection_override !== null &&
          eventOverrideRow?.offline_protection_override !== undefined
            ? eventOverrideRow.offline_protection_override
            : (van.auto_pause_on_offline ?? false)

        const manualPaused = van.paused_until
          ? new Date(van.paused_until) > new Date()
          : false
        const offlinePaused = offlineProtectionEnabled && van.online_paused_until
          ? new Date(van.online_paused_until) > new Date()
          : false

        if (offlinePaused) { isPaused = true; pauseReason = 'offline' }
        if (manualPaused) { isPaused = true; pauseReason = 'manual' }
      }
    }
  }

  // Live order counts — event-scoped (V6.4 invariant), using the resolved event.
  // No confirmed/open event → empty counts.
  const liveItemCounts = effectiveEventId
    ? await getLiveItemCounts(supabase, truck.id, effectiveEventId)
    : {}

  // Build category → modifier groups map
  const groupMap: Record<string, { id: string; name: string; options: { id: string; name: string; price_adjustment: number }[] }[]> = {}
  ;(categories || []).forEach(c => { groupMap[c.id] = [] })
  ;(categoryModGroups || []).forEach(cmg => {
    const group = (modifierGroups || []).find(g => g.id === cmg.group_id)
    if (!group || !groupMap[cmg.category_id]) return
    const options = (modifierOptions || [])
      .filter(o => o.group_id === group.id && (isDashboard || o.available !== false))
      .map(o => ({
        id: o.id,
        name: o.name,
        price_adjustment: o.price_adjustment ?? 0,
        ...(isDashboard && { available: o.available !== false }),
      }))
    groupMap[cmg.category_id].push({ id: group.id, name: group.name, options })
  })

  // Build menu response
  const menu = {
    categories: (categories || []).map(c => ({
      id: c.id,
      name: c.name,
      prep_secs: c.prep_secs ?? null,
      batch_size: c.batch_size ?? null,
      allowNotes: c.allow_notes ?? false,
      default_stock: c.default_stock ?? null,
      modifierGroups: groupMap[c.id] || [],
    })),
    
    items: (items || []).map(i => {
      const override = (itemOverrides || []).find((o: any) => o.item_name === i.name)
      const liveOrdered = liveItemCounts[i.name] || 0
      // item_overrides.stock_count takes precedence; fall back to menu_items_db.default_stock
      const effectiveStockCount = override?.stock_count ?? i.default_stock ?? null
      const stockRemaining = calcStockRemaining(effectiveStockCount, liveOrdered)
      // item_overrides.available takes precedence; also treat stock exhausted as unavailable
      const isAvailable = override != null
        ? (override.available !== false) && (stockRemaining === null || stockRemaining > 0)
        : i.is_available !== false
      return {
        name: i.name,
        description: i.description || '',
        price: i.price,
        category: (i.menu_categories as any)?.name || 'Uncategorized',
        available: isAvailable,
        stock_remaining: stockRemaining,
        default_stock: i.default_stock ?? null,
        photo_url: i.image_path
          ? `${supabaseUrl}/storage/v1/object/public/truck-media/${i.image_path}`
          : null,
        allergens: (i.allergens as string[]) || [],
        dietary: (i.dietary_info as string[]) || [],
      }
    }),
    
    bundles: filteredBundles.map(b => ({
      name: b.name,
      description: b.description || '',
      bundle_price: b.bundle_price,
      original_price: b.original_price,
      slot_1_category: b.slot_1_category,
      slot_2_category: b.slot_2_category,
      slot_3_category: b.slot_3_category,
      slot_4_category: b.slot_4_category,
      slot_5_category: b.slot_5_category,
      slot_6_category: b.slot_6_category,
      start_time: b.start_time,
      end_time: b.end_time,
      available: true,
    })),
    
    upsell_rules: (upsellRules || []).map(r => ({
      id: r.id,
      trigger_category: r.trigger_category,
      suggest_category: r.suggest_category,
      max_suggestions: r.max_suggestions,
      show_at_checkout: r.show_at_checkout ?? false,
    })),
    
    codes: (codes || []).map(c => ({
      code: c.code,
      type: c.type,
      value: c.value,
    })),
  }

  console.log('[MENU API] Returning menu with', menu.items.length, 'items')

  return NextResponse.json({
    truck: {
      id: truck.id,
      name: truck.name,
      logo: truck.logo_storage_path
        ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/truck-media/${truck.logo_storage_path}`
        : null,
      mode: truck.mode,
      venue_name: truck.venue_name,
      time_selection_enabled: truck.time_selection_enabled ?? false,
      paused: isPaused,
      pauseReason: pauseReason,
      extra_wait_mins: (() => {
        const mins = truck.extra_wait_mins ?? 0
        const startedAt = truck.extra_wait_started_at ?? null
        if (!mins || !startedAt) return 0
        const elapsed = (Date.now() - new Date(startedAt).getTime()) / 60000
        return Math.max(0, Math.ceil(mins - elapsed))
      })(),
      plan: (truck.plan ?? 'starter') as 'starter' | 'pro' | 'max',
      allergen_info_url: truck.allergen_info_url ?? null,
      allergen_info_text: truck.allergen_info_text ?? null,
      ordering_available: orderingAvailable,
    },
    menu,
  })
}