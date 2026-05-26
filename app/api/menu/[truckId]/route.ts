// app/api/menu/[truckId]/route.ts
// Supabase-only menu API

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const revalidate = 0  // No cache

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ truckId: string }> }
) {
  const { truckId } = await params
  
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
  ] = await Promise.all([
    supabase
      .from('menu_categories')
      .select('id, name, prep_secs, batch_size, allow_notes')
      .eq('truck_id', truck.id)
      .order('sort_order', { ascending: true })
      .order('name'),

    supabase
      .from('menu_items_db')
      .select('*, menu_categories!category_id(name)')
      .eq('truck_id', truck.id)
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
      .select('id, group_id, name, price_adjustment')
      .in('group_id',
        (await supabase.from('modifier_groups').select('id').eq('truck_id', truck.id)).data?.map((g: { id: string }) => g.id) || []
      )
      .order('sort_order', { ascending: true }),

    supabase
      .from('category_modifier_groups')
      .select('category_id, group_id'),
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

  if (!effectiveEventId) {
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
      const { data: van } = await supabase
        .from('truck_vans')
        .select('paused_until, online_paused_until')
        .eq('id', eventVan.van_id)
        .single()

      if (van) {
        const manualPaused = van.paused_until
          ? new Date(van.paused_until) > new Date()
          : false
        const offlinePaused = van.online_paused_until
          ? new Date(van.online_paused_until) > new Date()
          : false

        if (offlinePaused) { isPaused = true; pauseReason = 'offline' }
        if (manualPaused) { isPaused = true; pauseReason = 'manual' }
      }
    }
  }

  // Build category → modifier groups map
  const groupMap: Record<string, { id: string; name: string; options: { id: string; name: string; price_adjustment: number }[] }[]> = {}
  ;(categories || []).forEach(c => { groupMap[c.id] = [] })
  ;(categoryModGroups || []).forEach(cmg => {
    const group = (modifierGroups || []).find(g => g.id === cmg.group_id)
    if (!group || !groupMap[cmg.category_id]) return
    const options = (modifierOptions || [])
      .filter(o => o.group_id === group.id)
      .map(o => ({ id: o.id, name: o.name, price_adjustment: o.price_adjustment ?? 0 }))
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
      modifierGroups: groupMap[c.id] || [],
    })),
    
    items: (items || []).map(i => ({
      name: i.name,
      description: i.description || '',
      price: i.price,
      category: (i.menu_categories as any)?.name || 'Uncategorized',
      available: i.is_available,
      stock_remaining: i.stock_count,
    })),
    
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
      trigger_category: r.trigger_category,
      suggest_category: r.suggest_category,
      max_suggestions: r.max_suggestions,
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
      logo: truck.logo_storage_path,
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
    },
    menu,
  })
}