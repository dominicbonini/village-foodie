// app/api/menu/[truckId]/route.ts
// Supabase-only menu API

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { calcStockRemaining } from '@/lib/stock-utils'
import { getLiveItemCounts } from '@/lib/stock-availability'
import { resolveTruckLogo } from '@/lib/truck-logo'
import { hasUnsatisfiableRequiredGroup } from '@/lib/modifier-rules'
import { getNowMinsInTz, getLocalDateInTz } from '@/lib/time-utils'
import { isPreorderDeadlinePassed, preorderDeadlineClock, formatPreorderLabel } from '@/lib/preorder'
import { canAccess } from '@/lib/features'

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
    { data: subcategories },
    { data: bundles },
    { data: upsellRules },
    { data: codes },
    { data: modifierGroups },
    { data: modifierOptions },
    { data: itemModGroups },
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
      .from('menu_subcategories')
      .select('id, category_id, name, sort_order')
      .eq('truck_id', truck.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),

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
      .select('id, name, is_required, min_choices, max_choices')
      .eq('truck_id', truck.id),

    supabase
      .from('modifier_options')
      .select('id, group_id, name, price_adjustment, available, allergens, dietary_info, stock_count')
      .in('group_id',
        (await supabase.from('modifier_groups').select('id').eq('truck_id', truck.id)).data?.map((g: { id: string }) => g.id) || []
      )
      .order('sort_order', { ascending: true }),

    // Stage B: per-item modifier-group links are now the SOLE source of truth for resolution.
    // category_modifier_groups is RETIRED here — item_modifier_groups(menu_item_id, group_id)
    // drives which groups each dish carries.
    supabase
      .from('item_modifier_groups')
      .select('menu_item_id, group_id'),
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
    // Explicit event — deals/pause/ordering resolve strictly from THIS id (cross-event fix);
    // no status auto-detect runs. Customer surface still gates ordering on a not-yet-confirmed
    // event; the operator dashboard (dashboard=1) bypasses the gate so it can load any event's
    // menu/deals regardless of status.
    const { data: explicitEvent } = await supabase
      .from('truck_events')
      .select('id, status')
      .eq('id', eventIdParam)
      .eq('truck_id', truck.id)
      .maybeSingle()

    if (!isDashboard && explicitEvent && !['confirmed', 'open'].includes(explicitEvent.status)) {
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

  // event_deals.active is the CUSTOMER visibility toggle (per-event "show this deal"). It must NOT
  // gate the OPERATOR add-order list — the operator can always see/add any deal regardless of whether
  // it's live to customers. So this filter runs for the customer surface only (!isDashboard); the
  // operator (dashboard=1) keeps the full bundle list. Customer behaviour is unchanged.
  if (effectiveEventId && !isDashboard) {
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

  // EVENT-scoped pause: read this event's own paused_until / online_paused_until (truck/van pause
  // are no longer consulted — they bled across events). offline-protection effective = the event's
  // override ?? the van's auto_pause_on_offline default. No live-gate: the write side only ever
  // stamps the correct (live) event.
  let isPaused = false
  let pauseReason: 'manual' | 'offline' | null = null
  // EVENT-scoped extra-wait (replaces truck.extra_wait_*). Captured here from the resolved event.
  let eventExtraWaitMins = 0
  let eventExtraWaitStartedAt: string | null = null
  // PRE-ORDER (Stage 3): the resolved event's start (→ minutes-of-day, event-tz) + local date, fed to
  // isPreorderDeadlinePassed. Null when no event resolves ⇒ the deadline term stays inert.
  let preorderEventStartMins: number | null = null
  let preorderEventDate: string | null = null

  if (effectiveEventId) {
    const { data: ev } = await supabase
      .from('truck_events')
      .select('van_id, paused_until, online_paused_until, offline_protection_override, extra_wait_mins, extra_wait_started_at, start_time, event_date')
      .eq('id', effectiveEventId)
      .single()

    if (ev) {
      eventExtraWaitMins = ev.extra_wait_mins ?? 0
      eventExtraWaitStartedAt = ev.extra_wait_started_at ?? null
      if (ev.start_time) {
        const [sh, sm] = String(ev.start_time).split(':').map(Number)
        preorderEventStartMins = (sh || 0) * 60 + (sm || 0)
      }
      preorderEventDate = ev.event_date ?? null
      let vanAutoPause = false
      if (ev.van_id) {
        const { data: van } = await supabase
          .from('truck_vans')
          .select('auto_pause_on_offline')
          .eq('id', ev.van_id)
          .single()
        vanAutoPause = van?.auto_pause_on_offline ?? false
      }
      const offlineProtectionEnabled =
        ev.offline_protection_override !== null && ev.offline_protection_override !== undefined
          ? ev.offline_protection_override
          : vanAutoPause

      const manualPaused = ev.paused_until ? new Date(ev.paused_until) > new Date() : false
      const offlinePaused = offlineProtectionEnabled && ev.online_paused_until
        ? new Date(ev.online_paused_until) > new Date()
        : false

      if (offlinePaused) { isPaused = true; pauseReason = 'offline' }
      if (manualPaused) { isPaused = true; pauseReason = 'manual' }
    }
  }

  // Live order counts — event-scoped (V6.4 invariant), using the resolved event.
  // No confirmed/open event → empty counts.
  const liveItemCounts = effectiveEventId
    ? await getLiveItemCounts(supabase, truck.id, effectiveEventId)
    : {}

  // Per-event stock override (sparse) — fetched for the SAME effectiveEventId as liveItemCounts above,
  // so the ceiling and the sold count belong to one event. A missing row falls through to the live
  // menu_items_db default below (never unlimited-by-accident). Empty until a dashboard edit (Phase 5).
  const eventItemOverride: Record<string, { stock_count: number | null; available: boolean }> = {}
  if (effectiveEventId) {
    const { data: eis } = await supabase
      .from('event_item_stock')
      .select('item_name, stock_count, available')
      .eq('truck_id', truck.id)
      .eq('event_id', effectiveEventId)
    ;(eis || []).forEach((o: any) => {
      eventItemOverride[o.item_name] = { stock_count: o.stock_count ?? null, available: o.available }
    })
  }

  // Build a resolved group object (with its options) for a given group id. Shared by the per-item
  // map below. Returns null if the group isn't found.
  type ResolvedGroup = { id: string; name: string; is_required: boolean; min_choices: number; max_choices: number; options: { id: string; name: string; price_adjustment: number; allergens: string[]; dietary: string[]; available: boolean; stock_count: number | null }[] }
  const resolveGroup = (groupId: string): ResolvedGroup | null => {
    const group = (modifierGroups || []).find(g => g.id === groupId)
    if (!group) return null
    const options = (modifierOptions || [])
      .filter(o => o.group_id === group.id && (isDashboard || o.available !== false))
      .map(o => ({
        id: o.id,
        name: o.name,
        price_adjustment: o.price_adjustment ?? 0,
        // Per-option allergens/dietary (Stage C) — independent of the dish's own allergens.
        // Surfaced at selection + carried onto the basket line/ticket/email (safety field).
        allergens: (o.allergens as string[]) || [],
        dietary: (o.dietary_info as string[]) || [],
        // available emitted to CUSTOMERS too (Stage D1) — fixes the display gap where a sold-out
        // option still showed to customers (isModifierAvailable defaulted undefined→true). Both
        // modals already filter on `available`; they just weren't receiving it on the customer read.
        available: o.available !== false,
        stock_count: (o.stock_count as number) ?? null,
      }))
    return {
      id: group.id,
      name: group.name,
      // Selection rules — consumed by the customer modal (A1) + operator modal (A2). Defaults
      // mirror the column defaults (not required, multi-select) so an un-set group behaves as today.
      is_required: (group as any).is_required ?? false,
      min_choices: (group as any).min_choices ?? 0,
      max_choices: (group as any).max_choices ?? 99,
      options,
    }
  }

  // Stage B: per-ITEM modifier-group map keyed by menu_item_id (the SOLE resolution source).
  // Each dish carries its OWN groups; category_modifier_groups no longer participates.
  const itemGroupMap: Record<string, ResolvedGroup[]> = {}
  ;(itemModGroups || []).forEach(link => {
    const g = resolveGroup(link.group_id)
    if (!g) return
    ;(itemGroupMap[link.menu_item_id] ||= []).push(g)
  })

  // Sub-categories grouped by category_id (display-only labels, sorted by sort_order).
  const subcatMap: Record<string, { id: string; name: string; sort_order: number }[]> = {}
  for (const s of (subcategories || [])) {
    ;(subcatMap[s.category_id] ||= []).push({ id: s.id, name: s.name, sort_order: s.sort_order ?? 0 })
  }

  // PRE-ORDER (Stage 3) — read-time context for the sold-out term. Event-tz now (NEVER device-local
  // new Date().getHours()), and the plan gate: when the truck isn't on advance_preordering, the term
  // is inert (a Pro→Starter downgrade stops stored config applying). tz defaults to 'Europe/London'
  // (the documented current state until per-truck trucks.timezone lands).
  const preorderTz = (truck as any).timezone || 'Europe/London'
  const preorderNowMins = getNowMinsInTz(preorderTz)
  const preorderNowDate = getLocalDateInTz(preorderTz)
  const preorderFeatureOn = canAccess(
    truck.plan, 'advance_preordering', truck.feature_overrides ?? {}, truck.trial_expires_at ?? null
  )
  // MASTER toggle (V7.8): truck-level preorders_enabled gates ALL pre-order effects. !== false so a
  // null/pre-migration column reads as ENABLED (existing trucks unaffected). Per-item config is NOT
  // cleared when off — this gates at READ time only; the config persists ("saved but disabled").
  const preorderActive = preorderFeatureOn && preorderEventDate != null && preorderEventStartMins != null
    && (truck as any).preorders_enabled !== false

  // CUSTOMER-FACING pre-order label (V7.8) — computed ONCE, server-side, in event-tz. GLOBAL config:
  // the deadline clock is the ONE truck-level rule (trucks.preorder_*), identical for every enabled
  // item, so the "before" string is shared. Per-item enablement only flips whether an item GETS a
  // label (below). null when the feature/event gate is off ⇒ no labels anywhere. Reuses the helper's
  // cross-day math (preorderDeadlineClock) — NO client-side time, NO duplicated date arithmetic.
  let preorderBeforeLabel: string | null = null
  if (preorderActive) {
    const clock = preorderDeadlineClock(
      { enabled: true, deadlineType: (truck as any).preorder_deadline_type,
        deadlineValue: (truck as any).preorder_deadline_value, pastAction: (truck as any).preorder_past_action },
      preorderEventDate as string, preorderEventStartMins as number,
    )
    if (clock) preorderBeforeLabel = formatPreorderLabel('before', clock.mins, clock.date, preorderEventDate as string)
  }
  // The post-cutoff force-pending string is config-independent (the helper ignores mins/date for it).
  const preorderClosedLabel = formatPreorderLabel('closed_pending', 0, '', '')

  // Build menu response
  const menu = {
    categories: (categories || []).map(c => ({
      id: c.id,
      name: c.name,
      prep_secs: c.prep_secs ?? null,
      batch_size: c.batch_size ?? null,
      allowNotes: c.allow_notes ?? false,
      default_stock: c.default_stock ?? null,
      counts_toward_capacity: c.counts_toward_capacity ?? false,
      // RETIRED for resolution (Stage B): groups now live on each item. Kept as an empty array so
      // any lingering category-level reader degrades to "no groups" rather than crashing.
      modifierGroups: [],
      subcategories: subcatMap[c.id] || [],
    })),
    
    items: (items || []).map(i => {
      const override = eventItemOverride[i.name]
      const liveOrdered = liveItemCounts[i.name] || 0
      // Per-event override stock_count takes precedence; fall back to live menu_items_db.default_stock.
      const effectiveStockCount = override?.stock_count ?? i.default_stock ?? null
      const stockRemaining = calcStockRemaining(effectiveStockCount, liveOrdered)
      // Availability via AND-composition (event_item_stock.available is NOT NULL DEFAULT true, so it
      // can't represent "unset"): Settings is_available propagates (a Settings-disabled item stays
      // disabled everywhere), a per-event override can only RESTRICT (available=false = per-event
      // sold-out), never force-available. Stock exhaustion also marks unavailable.
      // PRE-ORDER sold-out (Stage 3): past a 'sold_out' pre-order deadline ⇒ hide like a manual
      // sold-out. Read-time only (no stored write, auto-reverts), via the shared Stage-2 helper so
      // display (here) and submit enforcement (Stage 4) can't diverge. Inert when the feature is off
      // or no event resolved (preorderActive false), or the item isn't a configured pre-order item.
      // GLOBAL config (V7.8): `enabled` (inclusion) is per-ITEM; the deadline type/value/action are the
      // ONE truck-level rule (trucks.preorder_*), applied to every included item. Helper untouched.
      const pre = preorderActive
        ? isPreorderDeadlinePassed(
            { enabled: (i as any).preorder_enabled, deadlineType: (truck as any).preorder_deadline_type,
              deadlineValue: (truck as any).preorder_deadline_value, pastAction: (truck as any).preorder_past_action },
            preorderEventDate as string, preorderEventStartMins as number, preorderNowDate, preorderNowMins,
          )
        : { isPreorder: false, passed: false, pastAction: null as null | 'sold_out' | 'force_pending' }
      const preorderSoldOut = pre.isPreorder && pre.passed && pre.pastAction === 'sold_out'
      // Customer-facing label/state for THIS item (reusing the SAME `pre` verdict — one verdict source).
      // 'before' = deadline not passed; 'closed_pending' = passed & force_pending (still orderable,
      // kitchen approves). passed & sold_out ⇒ null (the item is available:false/hidden, no label).
      // Non-enabled item ⇒ pre.isPreorder false ⇒ both null. The strings come from the global compute.
      let preorderState: 'before' | 'closed_pending' | null = null
      let preorderLabel: string | null = null
      if (pre.isPreorder) {
        if (!pre.passed) { preorderState = 'before'; preorderLabel = preorderBeforeLabel }
        else if (pre.pastAction === 'force_pending') { preorderState = 'closed_pending'; preorderLabel = preorderClosedLabel }
      }
      const isAvailable = (i.is_available !== false)
        && (override ? override.available !== false : true)
        && (stockRemaining === null || stockRemaining > 0)
        // Sold-out if a REQUIRED group has no selectable option left (e.g. all proteins out) — there's
        // a mandatory choice with nothing to pick, so the item is unorderable. Single source: this
        // flag propagates to the customer list, operator tiles, and the modal (a sold-out item never
        // opens orderable). Keys only on required groups (validateModifierSelection skips the group).
        && !hasUnsatisfiableRequiredGroup(itemGroupMap[i.id] || [])
        && !preorderSoldOut          // ← pre-order past 'sold_out' deadline (read-time, plan-gated)
      return {
        name: i.name,
        description: i.description || '',
        price: i.price,
        category: (i.menu_categories as any)?.name || 'Uncategorized',
        // Stage B: per-item modifier groups (SOLE resolution source). Customer modal + operator
        // AddOrderPanel read item.modifierGroups directly (no more category name-match).
        modifierGroups: itemGroupMap[i.id] || [],
        subcategory_id: (i as any).subcategory_id ?? null,
        available: isAvailable,
        stock_remaining: stockRemaining,
        default_stock: i.default_stock ?? null,
        photo_url: i.image_path
          ? `${supabaseUrl}/storage/v1/object/public/truck-media/${i.image_path}`
          : null,
        allergens: (i.allergens as string[]) || [],
        dietary: (i.dietary_info as string[]) || [],
        spiciness: (i.spiciness as number) ?? null,
        // Operator-only routing flag — read so the Manage editor reflects the saved value.
        // NOT consumed by the customer page (invisible to customers).
        auto_accept: (i.auto_accept as boolean) ?? true,
        // Customer-facing pre-order label (server-computed, event-tz). null when the item isn't an
        // enabled pre-order item or the feature/event gate is off. The customer page renders it as-is.
        preorderState,
        preorderLabel,
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

  // Logo: operator upload → Village Foodie discovery fallback (shared resolver, Section 14/27).
  const logo = await resolveTruckLogo(supabase, truck.id, truck.logo_storage_path)

  return NextResponse.json({
    truck: {
      id: truck.id,
      name: truck.name,
      logo,
      mode: truck.mode,
      venue_name: truck.venue_name,
      time_selection_enabled: truck.time_selection_enabled ?? false,
      paused: isPaused,
      pauseReason: pauseReason,
      extra_wait_mins: (() => {
        // EVENT-scoped extra-wait (was truck.extra_wait_*).
        const mins = eventExtraWaitMins
        const startedAt = eventExtraWaitStartedAt
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