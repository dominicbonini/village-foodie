// app/api/orders/submit/route.ts
// Receives order from the frontend, saves to Supabase,
// fires WhatsApp to truck and email confirmation to customer

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { calculateOrderTotal, validateOrderTotals } from '@/lib/order-calculations'
import {
  computeEventUnitRows,
  getProductionSlotUnits,
  buildItemCatMap,
  normaliseOrderLines,
} from '@/lib/slot-bookings'
import { orderItemsToQtyByCat } from '@/lib/slot-capacity'
import { earliestBackwardFitSlot } from '@/lib/slot-availability'
import { getAsapSlot } from '@/lib/slot-utils'
import { generateCollectionTimes } from '@/lib/slot-generation'
import { buildCatConfigs } from '@/lib/prep-utils'
import { validateModifierSelection, hasUnsatisfiableRequiredGroup, selectedCountForGroup } from '@/lib/modifier-rules'
import { findSoldOutOption, checkOptionCeilingShortfall } from '@/lib/option-stock'
import type { CatConfig } from '@/lib/prep-utils'
import { getNowMinsInTz, getLocalDateInTz } from '@/lib/time-utils'
import { isPreorderDeadlinePassed, isPreorderOpenYet, type PreorderConfig } from '@/lib/preorder'
import { canAccess } from '@/lib/features'
import { formatConfirmationEmail, formatNewOrderEmail, sendConfirmationEmail } from '@/lib/email'
import { enforceStockLimits } from '@/lib/stock-availability'
import { sendOrderPendingPush } from '@/lib/apns'
import { acquireEventLock, releaseEventLock, checkStockShortfall } from '@/lib/stock-guard'

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderItem {
  name: string
  quantity: number
  unit_price: number
  modifiers?: { name: string; price: number }[]
  specialInstructions?: string
}

interface AppliedDeal {
  name: string
  price?: number
  slots: Record<string, string>
  slotModifiers?: Record<string, { name: string; price: number }[]>
  slotNotes?: Record<string, string>
}

// ─── WhatsApp message formatter ───────────────────────────────────────────────

function formatWhatsAppOrder(params: {
  orderId: string
  truckName: string
  customerName: string
  customerPhone: string
  customerEmail: string
  slot: string | null
  eventDate: string
  items: OrderItem[]
  deals: AppliedDeal[]
  discountCode: string | null
  discountAmt: number
  total: number
  notes: string | null
}): string {
  const divider = '─────────────────────────────'
  const lines: string[] = [
    `*NEW ORDER — #${params.orderId}*`,
    `${params.truckName}`,
    params.slot ? `Collection: ${params.slot}` : `Date: ${params.eventDate}`,
    '',
    `*${params.customerName}*`,
    `📞 ${params.customerPhone}`,
    `📧 ${params.customerEmail}`,
    '',
  ]

  params.items.forEach(item => {
    const lineTotal = (item.unit_price * item.quantity).toFixed(2)
    lines.push(`  ${item.quantity}× ${item.name.padEnd(20)} £${lineTotal}`)
  })

  if (params.deals.length > 0) {
    lines.push('')
    params.deals.forEach(deal => {
      lines.push(`  🎁 ${deal.name}`)
      Object.entries(deal.slots).forEach(([, item]) => {
        if (item) lines.push(`     ${item}`)
      })
    })
  }

  lines.push(divider)

  if (params.discountCode && params.discountAmt > 0) {
    lines.push(`  Code ${params.discountCode}`.padEnd(28) + `-£${params.discountAmt.toFixed(2)}`)
  }

  lines.push(`  *TOTAL${' '.repeat(22)}£${params.total.toFixed(2)}*`)

  if (params.notes) {
    lines.push('')
    lines.push(`📝 ${params.notes}`)
  }

  lines.push('')
  lines.push(`Reply:`)
  lines.push(`  CONFIRM ${params.orderId}`)
  lines.push(`  REJECT ${params.orderId}`)
  lines.push(`  MODIFY ${params.orderId} SLOT`)
  lines.push(`  MODIFY ${params.orderId} ITEM [item] SUB [sub]`)
  lines.push(`  MODIFY ${params.orderId} ITEM [item] REMOVE`)

  return lines.join('\n')
}

// ─── Email confirmation formatter ─────────────────────────────────────────────

function timeToMins(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/** Resolve collection slot after auto-accept; bump if production window is batch-full. */
/**
 * Live kitchen_capacity (items ceiling) + event start for a truck/date, from the
 * event's van — the same source the operator traffic light uses. Replaces the dead
 * slot_capacity batch cache for the customer capacity decision.
 */
async function eventKitchenCapacity(
  truckId: string,
  eventDate: string,
  eventId: string | null,
): Promise<{ kitchenCapacity: number | null; capacityWindowMins: number; eventStartMins: number }> {
  // Resolve the SPECIFIC event by id (the order's actual event) so a multi-event-same-date
  // day reads the right van/capacity. Fall back to the date's first event only when no
  // event_id is available (warn).
  let ev: { start_time: string | null; van_id: string | null } | null = null
  if (eventId) {
    const { data } = await supabase
      .from('truck_events')
      .select('start_time, van_id')
      .eq('truck_id', truckId)
      .eq('id', eventId)
      .maybeSingle()
    ev = data ?? null
    if (!ev) console.warn(`[eventKitchenCapacity] event_id ${eventId} not found for truck ${truckId} — date fallback`)
  }
  if (!ev) {
    if (!eventId) console.warn(`[eventKitchenCapacity] no event_id for truck ${truckId} on ${eventDate} — using date's first event`)
    const { data } = await supabase
      .from('truck_events')
      .select('start_time, van_id')
      .eq('truck_id', truckId)
      .eq('event_date', eventDate)
      .neq('status', 'cancelled')
      .order('start_time', { ascending: true })
      .limit(1)
      .maybeSingle()
    ev = data ?? null
  }
  let kitchenCapacity: number | null = null
  let capacityWindowMins = 5
  if (ev?.van_id) {
    const { data: van } = await supabase
      .from('truck_vans')
      .select('kitchen_capacity, capacity_window_mins')
      .eq('id', ev.van_id)
      .single()
    kitchenCapacity = van?.kitchen_capacity ?? null
    capacityWindowMins = van?.capacity_window_mins ?? 5
  }
  return { kitchenCapacity, capacityWindowMins, eventStartMins: ev?.start_time ? timeToMins(String(ev.start_time)) : 0 }
}

/**
 * Customer slot rule (Section 5/6/7), race-safe via ONE per-event lock. The whole
 * walk runs inside a single lock: read units FRESH (reflecting all prior bookings on
 * the event), evaluate the requested/ASAP-resolved slot then each later slot via
 * buildSlotAvailability (this order folded in as basket), and BOOK the first non-red
 * one atomically. ASAP (requestedSlot null) resolves its start via getAsapSlot
 * (Section 6 — not forked) then walks the same way.
 *
 *   booked=true  → finalSlot is the RESOLVED placement (capacity NOT yet consumed).
 *   booked=false → no slot non-red (event full) OR lock contended → pending, NOT
 *                  booked. A slot is never overfilled and the customer is never rejected.
 *
 * RESOLVE-ONLY: this function no longer files production_slot_usage. The caller persists
 * order.slot = finalSlot FIRST, then calls addOrderToProductionSlot once — so the lazy reseed
 * (buildUnitsFromOrders) reads the real placed slot on a first-order-after-clear, not the null
 * insert value (which fell back to eventStart). Reuses buildSlotAvailability — no forked formula.
 *
 * LOCK-FREE: the CALLER MUST already hold the per-event booking lock. The acquire/release is
 * hoisted to the POST handler so the stock re-check + order insert + this placement all run
 * under ONE lock (Option B atomic stock guard). Here booked=false means "event full / no
 * fitting slot before end" only — lock contention is handled by the caller.
 */
async function placeOrderInSlotLocked(
  truckId: string,
  eventDate: string,
  eventId: string | null,
  requestedSlot: string | null,
  orderLines: { name: string; quantity: number }[],
  itemCatMap: Record<string, string>,
  catConfigs: Record<string, CatConfig>,
  eventStartTime?: string | null,
  eventEndTime?: string | null,
  intervalMins?: number,
  slotDurationMins?: number,
  kitchenCapacity?: number | null,
  capacityWindowMins?: number,
  // The PLACING order's own order_key — excluded from the fit's occupancy reseed so it can't count
  // itself (it's inserted pending+null-slot before this fit). Opt-in; only the submit path passes it.
  excludeOrderKey?: string | null,
): Promise<{ finalSlot: string | null; booked: boolean }> {
  // event_id scopes the production_slot_usage read/write so same-date events don't pool.
  {
    const { data: staticTimes } = await supabase
      .from('collection_times')
      .select('collection_time, production_slot')
      .eq('truck_id', truckId)
      .order('collection_time', { ascending: true })

    const iv = intervalMins ?? 0
    const dur = slotDurationMins ?? iv
    const times =
      staticTimes?.length
        ? staticTimes
        : eventStartTime && eventEndTime && iv > 0
          ? generateCollectionTimes(eventStartTime, eventEndTime, iv, dur)
          : []
    const basketByCat = orderItemsToQtyByCat(orderLines, itemCatMap)

    // Resolve the starting slot: explicit request, else ASAP via the existing resolver
    // (Section 6/7 — first slot at/after the ASAP floor; not forked).
    const startSlot =
      requestedSlot ??
      getAsapSlot(times.map(t => ({ collection_time: t.collection_time, available: true })), eventDate)?.collection_time ??
      null

    // No schedule / unresolvable start (e.g. pub / no collection_times) → book at the
    // event-start window with no slot model, preserving prior ASAP-booking behaviour.
    if (!startSlot || !times.length) {
      const ct = startSlot ?? (eventStartTime ? eventStartTime.slice(0, 5) : null)
      if (!ct) return { finalSlot: null, booked: false }
      return { finalSlot: ct, booked: true }
    }

    const startEntry = times.find(t => t.collection_time === startSlot)
    // Unrecognised slot (not in the list) → confirm at requested, no capacity check (Section 5).
    if (!startEntry) {
      return { finalSlot: startSlot, booked: true }
    }

    // One FRESH read under the event lock — we are the sole writer for its duration. excludeOrderKey
    // drops THIS order from the empty-cache reseed so it doesn't self-occupy the start window (Option B).
    const slotUnits = await getProductionSlotUnits(supabase, truckId, eventId, excludeOrderKey)
    const eventEndMins = eventEndTime ? timeToMins(eventEndTime) : Number.POSITIVE_INFINITY
    const eventStartMins = eventStartTime ? timeToMins(eventStartTime) : 0

    // Truly-uncounted order (no oven AND no ticked-instant categories) → book at the start slot
    // (nothing participates in the concurrency ceiling). Counted-instant orders fall THROUGH to the
    // backward-fit gate below so they're capacity-checked too (no oversell) — the engine seats their
    // instant items as concurrency points on the capacity cadence.
    const hasCounted = Object.keys(basketByCat).some(c => {
      const cfg = catConfigs[c.toLowerCase()]
      return !!(cfg && (cfg.secs || cfg.countsToCapacity))
    })
    if (!hasCounted) {
      return { finalSlot: startSlot, booked: true }
    }

    // BACKWARD-FIT placement (Stage 3): the earliest slot whose ceil(N/batch) cooking windows
    // (ending at it) have spare — the SAME fitOrderBackward engine the picker/ASAP use, so the
    // server places exactly where the backward picker would OFFER. A requested slot is honored
    // when it fits; otherwise the order reassigns FORWARD to the next fitting slot (never
    // rejected). ASAP (no requested slot) → earliest fitting at/after the now-floor startSlot.
    const fromMins = requestedSlot
      ? Math.max(timeToMins(startSlot), timeToMins(requestedSlot))
      : timeToMins(startSlot)
    // NOW-CLAMP so the BOOKED slot is physically achievable (cooking can't start before now). Today
    // only — for a future-date event nowMins (mins-of-day) would mis-compare, so pass -Inf (no clamp).
    // Event tz hardcoded 'Europe/London' (matches the engine default), replaced by trucks.timezone later.
    const placeNowMins = eventDate === getLocalDateInTz('Europe/London')
      ? getNowMinsInTz('Europe/London')
      : Number.NEGATIVE_INFINITY
    const placement = earliestBackwardFitSlot(times, slotUnits, catConfigs, kitchenCapacity ?? null, eventStartMins, basketByCat, fromMins, capacityWindowMins ?? 5, placeNowMins)
    if (!placement || timeToMins(placement) > eventEndMins) {
      // No fitting slot before event end → event full → pending (never reject).
      return { finalSlot: null, booked: false }
    }
    return { finalSlot: placement, booked: true }
  }
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ─── Main POST handler ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      truckId,
      customerName,
      customerEmail,
      customerPhone,
      slot,
      eventDate,
      eventId,
      items,
      deals,
      discountCode,
      discountAmt,
      subtotal,
      total,
      notes,
      upsellEvents,
    } = body

    // ── Validate ──────────────────────────────────────────────────────────────
    if (!truckId || !customerName || !customerEmail || (!items?.length && !deals?.length)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // ── Fetch truck (by slug or id) ───────────────────────────────────────────
    let truckQuery = await supabase
      .from('trucks')
      .select('*')
      .eq('slug', truckId)
      .eq('active', true)
      .single()

    if (truckQuery.error || !truckQuery.data) {
      truckQuery = await supabase
        .from('trucks')
        .select('*')
        .eq('id', truckId)
        .eq('active', true)
        .single()
    }

    const truck = truckQuery.data
    if (!truck) {
      return NextResponse.json({ error: 'Truck not found' }, { status: 404 })
    }

    // Use the actual truck UUID for all subsequent queries
    const resolvedTruckId = truck.id

    // (Pause is EVENT-scoped — the per-event guard below reads truck_events.paused_until /
    // online_paused_until. The old truck-level guard here was removed: nothing writes
    // trucks.paused_until anymore, and a stale pre-migration value would have falsely 423'd
    // every event truck-wide.)

    // Pause guard — van level. Resolve the order's event by its eventId (event-scoped, like the
    // customer menu) so the van pause is enforced for the ACTUAL event. The old date +
    // .maybeSingle() lookup returned null on multi-event-same-date days (>1 row) and silently
    // SKIPPED the entire van guard → manual/offline van pause not enforced → orders slipped
    // through. Fall back to the date lookup only when no eventId was sent.
    let pauseEvent: { van_id: string | null; status: string | null; paused_until: string | null; online_paused_until: string | null } | null = null
    if (eventId) {
      const { data } = await supabase
        .from('truck_events')
        .select('van_id, status, paused_until, online_paused_until')
        .eq('id', eventId)
        .eq('truck_id', resolvedTruckId)
        .maybeSingle()
      pauseEvent = data
    } else {
      const pauseCheckDate = eventDate ?? new Date().toISOString().split('T')[0]
      const { data } = await supabase
        .from('truck_events')
        .select('van_id, status, paused_until, online_paused_until')
        .eq('truck_id', resolvedTruckId)
        .eq('event_date', pauseCheckDate)
        .neq('status', 'cancelled')
        .maybeSingle()
      pauseEvent = data
    }

    // Event status guard — block orders for unconfirmed events
    if (pauseEvent?.status && !['confirmed', 'open'].includes(pauseEvent.status)) {
      return NextResponse.json(
        { error: 'This event is not available for ordering', event_status: pauseEvent.status },
        { status: 403 }
      )
    }

    // EVENT-scoped pause: read THIS event's own pause fields (truck/van pause no longer consulted).
    if (pauseEvent) {
      {
        const offlinePaused = pauseEvent.online_paused_until
          ? new Date(pauseEvent.online_paused_until) > new Date()
          : false
        const manualPaused = pauseEvent.paused_until
          ? new Date(pauseEvent.paused_until) > new Date()
          : false

        if (offlinePaused || manualPaused) {
          return NextResponse.json(
            {
              error: 'Orders are currently paused',
              paused: true,
              reason: offlinePaused ? 'offline' : 'manual',
            },
            { status: 423 }
          )
        }
      }
    }

    const orderLines = normaliseOrderLines(items, deals)
    const [itemCatMap, catConfigs] = await Promise.all([
      buildItemCatMap(supabase, resolvedTruckId),
      buildCatConfigs(supabase, resolvedTruckId),
    ])

    // NOTE: the old "slot full → 409" hard-block is removed for the customer path.
    // A full slot now never rejects — capacity is resolved at booking time by
    // placeOrderInSlotLocked (reassign to the first available later slot, else pending).
    // Non-capacity validation (payload/total/event) stays below, unchanged. The ONE 409
    // the customer path can return now is the atomic stock guard (out of stock), below.

    // ── Server-side total validation ──────────────────────────────────────────
    const { data: menuItems } = await supabase
      .from('menu_items_db')
      .select('name, price, auto_accept, preorder_enabled')
      .eq('truck_id', resolvedTruckId)

    // Per-item auto-accept rollup (reuses the read above — no extra fetch). An item flagged
    // auto_accept=false forces the WHOLE order into manual review even when the truck auto-accepts.
    // Keyed by name (same join basis as buildItemCatMap); an unknown/renamed name defaults to
    // allow (true) — never fail an order over a name miss (documented name-join limitation).
    const autoAcceptByName: Record<string, boolean> = {}
    ;(menuItems || []).forEach(m => { autoAcceptByName[m.name] = m.auto_accept !== false })

    // PRE-ORDER (Stage 4): per-item pre-order config, keyed by name (same basis as autoAcceptByName).
    // A past-deadline 'force_pending' item behaves like auto_accept=false for the rollup below — it
    // forces the WHOLE order pending. Evaluated event-tz at the rollup (where eventRow is resolved).
    // GLOBAL config (V7.8): `enabled` (inclusion) is per-ITEM; deadline type/value/action are the ONE
    // truck-level rule (trucks.preorder_*), constant across items. Helper untouched.
    const preorderByName: Record<string, PreorderConfig> = {}
    ;(menuItems || []).forEach((m: any) => {
      preorderByName[m.name] = {
        enabled: m.preorder_enabled, deadlineType: (truck as any).preorder_deadline_type,
        deadlineValue: (truck as any).preorder_deadline_value, pastAction: (truck as any).preorder_past_action,
      }
    })

    const { data: bundles } = await supabase
      .from('bundles_db')
      .select('*')
      .eq('truck_id', resolvedTruckId)

    // Reconstruct deals
    const dealsForCalc = (deals || []).map((d: AppliedDeal) => ({
      bundle: bundles?.find(b => b.name === d.name) || { name: d.name, bundle_price: 0, original_price: null },
      slots: d.slots || {}
    }))

    // Find discount code
    let discountCodeData = null
    if (discountCode) {
      const { data } = await supabase
        .from('discount_codes_db')
        .select('*')
        .eq('truck_id', resolvedTruckId)
        .eq('code', discountCode.toUpperCase())
        .eq('is_active', true)
        .single()
      discountCodeData = data
    }

    // Calculate totals server-side
    const serverCalculation = calculateOrderTotal(
      items,
      dealsForCalc,
      menuItems || [],
      discountCodeData
    )

    // Validate submitted totals
    const validation = validateOrderTotals(
      { subtotal, discountAmt: discountAmt ?? 0, total },
      serverCalculation,
      0.01
    )

    if (!validation.valid) {
      console.error('[ORDER VALIDATION]', validation.error)
      return NextResponse.json({ 
        error: 'Order total validation failed. Please refresh and try again.' 
      }, { status: 400 })
    }

    // ── Resolve the event for this order ──────────────────────────────────────
    // Prefer the event_id the customer ordered against (unambiguous). Only fall back
    // to (truck_id, event_date) when no id was sent — and then take the earliest by
    // start_time via limit(1) so 2+ same-date events no longer collapse to null
    // (Section 5). van_id is selected so the order can be associated with the van.
    const orderEventDate = eventDate ?? new Date().toISOString().split('T')[0]

    // PRE-ORDER OPEN-WINDOW HARD GATE (V8.3): reject BEFORE booking if any line's pre-order-tagged item
    // hasn't OPENED yet (now < open). Server-enforced (not just menu-hidden) — the SAME isPreorderOpenYet
    // the menu API display uses, so display == enforcement (DRY linchpin). Date-based, event-tz (NEVER
    // device-local — BST lesson). Gated by plan + master toggle, like the deadline.
    {
      const poFeatureOn = canAccess(truck.plan, 'advance_preordering', truck.feature_overrides ?? {}, truck.trial_expires_at ?? null)
      const poActive = poFeatureOn && (truck as any).preorders_enabled !== false
      if (poActive) {
        const poNowDate = getLocalDateInTz((truck as any).timezone || 'Europe/London')
        const openYet = isPreorderOpenYet((truck as any).preorder_open_rule, orderEventDate, poNowDate)
        if (!openYet && orderLines.some(l => (menuItems || []).find((m: any) => m.name === l.name)?.preorder_enabled === true)) {
          return NextResponse.json({ error: 'Pre-orders for this event aren’t open yet — please check back when they open.', preorder_not_open: true }, { status: 403 })
        }
      }
    }
    const eventCols = 'id, start_time, end_time, venue_name, town, postcode, van_id'
    let eventRow: {
      id: string; start_time: string | null; end_time: string | null
      venue_name: string | null; town: string | null; postcode: string | null; van_id: string | null
    } | null = null
    if (eventId) {
      const { data } = await supabase
        .from('truck_events')
        .select(eventCols)
        .eq('id', eventId)
        .eq('truck_id', resolvedTruckId)
        .neq('status', 'cancelled')
        .maybeSingle()
      eventRow = data
    }
    if (!eventRow) {
      if (eventId) console.warn(`[submit] event_id ${eventId} not found for truck ${resolvedTruckId} — falling back to date`)
      const { data } = await supabase
        .from('truck_events')
        .select(eventCols)
        .eq('truck_id', resolvedTruckId)
        .eq('event_date', orderEventDate)
        .neq('status', 'cancelled')
        .order('start_time', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (data && !eventId) {
        // No event_id was sent — date fallback in use. Warn if the date is ambiguous.
        const { count } = await supabase
          .from('truck_events')
          .select('id', { count: 'exact', head: true })
          .eq('truck_id', resolvedTruckId)
          .eq('event_date', orderEventDate)
          .neq('status', 'cancelled')
        if ((count ?? 0) > 1) console.warn(`[submit] no eventId sent and ${count} events on ${orderEventDate} for ${resolvedTruckId} — using earliest (${data.id})`)
      }
      eventRow = data
    }

    // ── Required-modifier completeness guard (A2, safety net) ──────────────────────────────
    // Belt-and-braces BEHIND the order modals: reject if a standalone line is missing a required
    // modifier-group selection (baskets persist across sessions; a group can become required after
    // an item was already added). Reuses lib/modifier-rules (validateModifierSelection) — no rule
    // logic reimplemented. FAIL-SAFE: any error resolving groups → log + PROCEED (the modal gate is
    // the primary enforcement; this guard must never reject a valid order due to its own failure).
    // Standalone `items` only — deal-slot constituents are out of A2 scope.
    try {
      const unmet: { item: string; soldOut?: boolean; group?: string; overMax?: number } | null = await (async () => {
        const { data: groupsRaw } = await supabase
          .from('modifier_groups')
          .select('id, name, is_required, min_choices, max_choices')
          .eq('truck_id', resolvedTruckId)
        // Groups we must validate: REQUIRED (min ≥ 1) and/or CAPPED ("choose up to N", max_choices < 99).
        // The 99 sentinel = "choose many" (unlimited) → nothing to enforce.
        const enforceIds = new Set((groupsRaw || [])
          .filter(g => g.is_required || (g.min_choices ?? 0) >= 1 || (g.max_choices ?? 99) < 99)
          .map(g => g.id))
        if (enforceIds.size === 0) return null // no required/capped groups → nothing to enforce

        // Stage B: resolve groups PER-ITEM via item_modifier_groups (menu_item_id → groups),
        // replacing the retired category_modifier_groups lookup. name→id keeps the same rename caveat
        // (a renamed dish can't be resolved → skipped, never a false reject). The link select is global
        // but filtered by enforceIds (truck-scoped) + this truck's item ids, so no cross-truck leak.
        const [{ data: itemLinks }, { data: optsRaw }, { data: itemRows }] = await Promise.all([
          supabase.from('item_modifier_groups').select('menu_item_id, group_id, excluded_option_ids'),
          supabase.from('modifier_options').select('id, group_id, name, price_adjustment, available, stock_count').in('group_id', Array.from(enforceIds)),
          supabase.from('menu_items_db').select('id, name').eq('truck_id', resolvedTruckId),
        ])
        const itemIdByName: Record<string, string> = {}
        ;(itemRows || []).forEach(i => { itemIdByName[i.name] = i.id })
        const groupsById = new Map((groupsRaw || []).map(g => [g.id, { ...g, options: (optsRaw || []).filter(o => o.group_id === g.id) }]))
        const groupsByItemId: Record<string, any[]> = {}
        ;(itemLinks || []).forEach(link => {
          if (!enforceIds.has(link.group_id)) return
          const g = groupsById.get(link.group_id); if (!g) return
          // Per-dish availability (model C): drop THIS dish's excluded options before any check, the
          // same filter the menu API's resolveGroup applies (drop option whose id ∈ excluded_option_ids).
          // A per-link copy avoids cross-contaminating other dishes that share the group. With this,
          // hasUnsatisfiableRequiredGroup (a required group with all options excluded for this dish →
          // options []), validateModifierSelection (min), and overMaxFor (max) all see the per-dish set.
          const excluded = new Set((link as { excluded_option_ids?: string[] }).excluded_option_ids || [])
          const scoped = excluded.size ? { ...g, options: (g.options as any[]).filter(o => !excluded.has(o.id)) } : g
          ;(groupsByItemId[link.menu_item_id] ||= []).push(scoped)
        })
        // Per-group MAX backstop ("choose up to N"): reject if a group has MORE than max_choices
        // selected. The client caps via toggleWithGroupRules, but a crafted client could over-submit.
        // Mirrors the required (min) guard; the 99 "many" sentinel is skipped.
        const overMaxFor = (groups: any[], selected: any[]): { group: string; max: number } | null => {
          for (const g of groups) {
            const max = g.max_choices ?? 99
            if (max < 99 && selectedCountForGroup(g, selected) > max) return { group: g.name, max }
          }
          return null
        }
        for (const it of (items || [])) {
          const itemId = itemIdByName[it.name]
          if (!itemId) continue // unknown/renamed item → can't resolve → skip (never fail on a name miss)
          const groups = groupsByItemId[itemId] || []
          if (groups.length === 0) continue
          // §36 backstop: a required group with no selectable option → item is sold out (unorderable).
          if (hasUnsatisfiableRequiredGroup(groups)) return { item: it.name, soldOut: true }
          const selected = Array.isArray(it.modifiers) ? it.modifiers : []
          const { unmetGroupNames } = validateModifierSelection(groups, selected)
          if (unmetGroupNames.length > 0) return { item: it.name, group: unmetGroupNames[0] }
          const over = overMaxFor(groups, selected)
          if (over) return { item: it.name, group: over.group, overMax: over.max }
        }
        // DEAL-SLOT items (§29 fix): a slot item with a required group must have it satisfied via
        // deal.slotModifiers[slotKey] — same resolution as standalone, validated per slot.
        for (const d of (deals || [])) {
          const slots = d?.slots || {}
          const slotMods = d?.slotModifiers || {}
          for (const slotKey of Object.keys(slots)) {
            const itemId = itemIdByName[slots[slotKey]]
            if (!itemId) continue // unknown/renamed slot item → skip (never fail on a name miss)
            const groups = groupsByItemId[itemId] || []
            if (groups.length === 0) continue
            if (hasUnsatisfiableRequiredGroup(groups)) return { item: slots[slotKey], soldOut: true }
            const selected = Array.isArray(slotMods[slotKey]) ? slotMods[slotKey] : []
            const { unmetGroupNames } = validateModifierSelection(groups, selected)
            if (unmetGroupNames.length > 0) return { item: slots[slotKey], group: unmetGroupNames[0] }
            const over = overMaxFor(groups, selected)
            if (over) return { item: slots[slotKey], group: over.group, overMax: over.max }
          }
        }
        return null
      })()
      if (unmet) {
        return NextResponse.json(
          {
            error: unmet.soldOut
              ? `Sorry, ${unmet.item} is sold out.`
              : unmet.overMax != null
                ? `Please choose at most ${unmet.overMax} option${unmet.overMax !== 1 ? 's' : ''} for ${unmet.group} (${unmet.item}).`
                : `Please choose ${unmet.group} for ${unmet.item}.`,
            requiredModifier: true,
          },
          { status: 400 },
        )
      }
    } catch (err) {
      console.error('[submit] required-modifier guard error — proceeding (fail-safe):', err)
    }

    // ── Option sold-out backstop (D2) ──────────────────────────────────────────────────────
    // Catches a MANUALLY sold-out option (available=false) — which the atomic stock decrement below
    // does NOT (it only checks stock_count). The decrement remains the real oversell guard for the
    // shared count; this backstop covers manual sold-out + a stock-0 race. FAIL-OPEN (findSoldOutOption
    // returns null on its own error). Standalone-items + deal-slots, all selected options.
    {
      const soldOut = await findSoldOutOption(supabase, resolvedTruckId, items, deals, eventId)
      if (soldOut) {
        return NextResponse.json({ error: `Sorry, ${soldOut} just sold out.`, optionStock: true }, { status: 409 })
      }
    }

    // ── Atomic stock guard + slot placement under ONE per-event lock (Stage 2, Option B) ──
    // The booking_locks mutex is HOISTED here (it used to live inside claimAvailableSlot) so the
    // stock re-check, the order INSERT, and the slot claim all run under a SINGLE lock — two
    // concurrent submits can't both read the same "N remaining" and both insert (oversell). The
    // stock check is BEFORE the insert → a shortfall returns 409 with NO half-written order (no
    // rollback). GUARANTEE: NO order is ever inserted without holding the lock AND passing the
    // stock check, so total sold can never exceed stock. On contention the caller WAITS within
    // acquireEventLock's retry budget (which absorbs the timing blip); only if the budget is
    // genuinely exhausted do we bail WITHOUT inserting and ask the client to retry — we never
    // fall back to a non-atomic insert.
    const lock = await acquireEventLock(resolvedTruckId, orderEventDate)
    const haveLock = lock.ok
    let order: { order_key: string } | null = null
    let orderId = ''
    const requestedSlot = slot ?? null
    let confirmedSlot: string | null = requestedSlot   // what the customer email shows (null = ASAP)
    let autoAccepted = false
    let slotChanged = false
    try {
      // Lock not acquired: either a real DB error or contention that outlasted the FULL 3s budget —
      // both genuine (the long budget absorbs normal 2-order contention, which now resolves silently
      // into the next-slot fit without ever reaching here). We must NOT place without the lock —
      // overselling would be possible. Bail non-destructively; the client re-submits (basket kept).
      if (!haveLock) {
        console.warn(`[submit] lock not acquired (${lock.ok ? '' : lock.reason}) for ${resolvedTruckId} / ${orderEventDate}`)
        return NextResponse.json(
          { error: 'We are handling a lot of orders right now — please try again', retry: true },
          { status: 409 },
        )
      }

      // (a) STOCK RE-CHECK — event-scoped, deal-inclusive (orderLines already flattens deal-slot
      //     constituents). Skipped when no resolved event. Customer HARD STOP: any requested qty over
      //     remaining → 409, NO row persisted (this is BEFORE the atomic RPC). Atomic: we hold the
      //     lock through [check → RPC], so a concurrent submit waits and then sees this order's insert.
      if (eventRow?.id) {
        const shortfall = await checkStockShortfall(resolvedTruckId, eventRow.id, orderEventDate, orderLines, itemCatMap)
        if (shortfall) {
          return NextResponse.json(
            { error: 'Some items just sold out', stock: true, items: shortfall },
            { status: 409 },
          )
        }
        // Extras ceiling check (step 2) — SAME shared engine as items, no secondary axis. Pre-lock, like
        // the item check. Reuses the optionStock 409 response shape the client already handles.
        const optShort = await checkOptionCeilingShortfall(supabase, resolvedTruckId, eventRow.id, items, deals)
        if (optShort && optShort.length) {
          return NextResponse.json(
            { error: `Sorry, ${optShort[0].name} just sold out.`, optionStock: true, optionName: optShort[0].name },
            { status: 409 },
          )
        }
      }

      // (b) RESOLVE the slot (READ-ONLY; nothing is inserted yet, so NO self-exclude — the fit sees
      //     the true current occupancy WITHOUT this order, exactly as the old exclude-the-pre-insert
      //     workaround achieved). placeOrderInSlotLocked RESOLVES { booked, finalSlot } and files
      //     NOTHING — the atomic RPC does the single write. Never rejects: full → pending/unbooked.
      let finalSlot: string | null = requestedSlot
      let booked = false
      if (eventDate) {
        // Live kitchen_capacity (items) from the event's van — same source as the operator traffic
        // light, so customer placement and the dot agree on "full".
        const { kitchenCapacity, capacityWindowMins } = await eventKitchenCapacity(resolvedTruckId, eventDate, eventRow?.id ?? null)
        const claim = await placeOrderInSlotLocked(
          resolvedTruckId, eventDate, eventRow?.id ?? null, requestedSlot, orderLines, itemCatMap, catConfigs,
          eventRow?.start_time ?? null,
          eventRow?.end_time ?? null,
          truck.collection_interval_mins ?? 0,
          truck.slot_duration_mins ?? (truck.collection_interval_mins ?? 0),
          kitchenCapacity,
          capacityWindowMins,
          // NO excludeOrderKey: no order exists pre-resolve now (insert + book are atomic in the RPC).
        )
        if (claim.booked && claim.finalSlot) {
          booked = true
          // The SERVER-resolved boundary is authoritative (it knows if the requested slot was full and
          // bumped forward). It becomes order.slot (in the RPC) AND the production_slot_usage key, and
          // the customer-facing confirmedSlot — never null for a booked order.
          finalSlot = claim.finalSlot
          if (requestedSlot) {
            // Chosen slot: slotChanged drives the slotAdjustedFrom email box (Section 18 — reused).
            confirmedSlot = claim.finalSlot
            slotChanged = claim.finalSlot !== requestedSlot
          } else {
            // ASAP: confirmedSlot is the CUSTOMER-FACING value (on-screen, email, response). ASAP is
            // only a SELECTION shortcut — once placed, the order has a concrete allocated boundary and
            // the customer must SEE it. (slotChanged stays false: requestedSlot is null for ASAP, so
            // the "your slot was taken" amber path never fires.)
            confirmedSlot = claim.finalSlot
          }
          // Auto-confirm ONLY when the truck auto-accepts AND every basket item allows it. A single
          // item flagged auto_accept=false forces the whole order to stay `pending` (manual review) —
          // reusing the same state an auto-accept-off truck produces. autoAccepted stays false, so the
          // customer "Order received! … will confirm shortly" messaging + email tone apply unchanged.
          const allItemsAutoAccept = orderLines.every(l => autoAcceptByName[l.name] !== false)
          // PRE-ORDER force-pending (Stage 4): a line whose item is past a 'force_pending' pre-order
          // deadline forces the order pending — the SAME effect as auto_accept=false, via the SAME
          // helper Stage 3 uses for the menu sold-out (display ⟷ enforcement can't diverge). Event-tz
          // now (NEVER device-local); plan-gated server-side (a downgraded truck's config is inert).
          // tz defaults to 'Europe/London' (the documented current state until per-truck tz lands).
          const preorderTz = (truck as any).timezone || 'Europe/London'
          const preorderFeatureOn = canAccess(
            truck.plan, 'advance_preordering', truck.feature_overrides ?? {}, truck.trial_expires_at ?? null
          )
          let eventStartMins: number | null = null
          if (eventRow?.start_time) {
            const [sh, sm] = String(eventRow.start_time).split(':').map(Number)
            eventStartMins = (sh || 0) * 60 + (sm || 0)
          }
          // MASTER toggle (V7.8): truck-level preorders_enabled gates ALL pre-order effects. !== false
          // so null/pre-migration reads as ENABLED. Read-time gate only — per-item config persists.
          const preorderActive = preorderFeatureOn && eventStartMins != null
            && (truck as any).preorders_enabled !== false
          const preNowMins = getNowMinsInTz(preorderTz)
          const preNowDate = getLocalDateInTz(preorderTz)
          const anyForcesPending = preorderActive && orderLines.some(l => {
            const cfg = preorderByName[l.name]
            if (!cfg) return false
            const pre = isPreorderDeadlinePassed(cfg, orderEventDate, eventStartMins as number, preNowDate, preNowMins)
            return pre.isPreorder && pre.passed && pre.pastAction === 'force_pending'
          })
          // SAFETY — notes need review: a customer note (order-level OR any line's specialInstructions) is
          // where allergy requests land, so a truck with notes_require_review ON holds a NOTED order `pending`
          // for a human to read + accept instead of auto-confirming it unread. Same pending state an
          // auto_accept=false item already produces (NO new status; customer messaging unchanged). `!== false`
          // (not a bare truthy read) so a pre-migration/undefined column still REVIEWS — safe-by-default.
          // Deal-slot free-text notes (deals[].slotNotes: Record<slot, note>) count too — a note on a deal
          // item is still an allergy request. slotModifiers (a CHOICE, not free text) does NOT count.
          // Defensive on any shape (null slotNotes / non-string values) — a throw here would fail the order.
          const orderHasNotes =
            !!(notes && notes.trim()) ||
            (Array.isArray(items) && items.some((i: any) => i?.specialInstructions?.trim())) ||
            (Array.isArray(deals) && deals.some((d: any) =>
              Object.values(d?.slotNotes ?? {}).some((n: any) => typeof n === 'string' && n.trim())))
          if (
            truck.auto_accept && allItemsAutoAccept && !anyForcesPending
            && !((truck as any).notes_require_review !== false && orderHasNotes)
          ) {
            autoAccepted = true
          }
        }
        // !claim.booked -> event full / lock contended -> finalSlot stays requestedSlot (or ASAP/null),
        // unbooked (p_unit_rows null below). Never rejected, never overfilled.
      }

      // (c) STATUS — pending unless auto-accepted above (only reachable when booked).
      const status = autoAccepted ? 'confirmed' : 'pending'

      // (d) UNIT ROWS — the production_slot_usage rows for THIS event AS IF this order were committed,
      //     computed by the EXISTING helpers (computeEventUnitRows → buildUnitsFromOrders), byte-
      //     identical to the old insert→rebuild. ONLY when booked + has event. Unbooked / no-event →
      //     NULL (NOT []) so the RPC's step-4 guard SKIPS the usage write → order persists unbooked,
      //     exactly like the old full-but-pending path.
      const unitRows = (booked && eventRow?.id)
        ? await computeEventUnitRows(supabase, resolvedTruckId, eventRow.id, { slot: finalSlot, items, deals: deals ?? null })
        : null

      // (e) ATOMIC PLACEMENT — display number + order INSERT + usage book in ONE transaction
      //     (place_order_atomic). Any failure RAISES → the WHOLE txn rolls back: no ghost order, no
      //     counter gap. (Option oversell is now the pre-lock CEILING check above — checkOptionCeiling-
      //     Shortfall — not an in-RPC pool draw.) p_order carries ONLY the plain order columns
      //     (id/slot/status/event_id/event_date/order_key are RPC params or DB defaults). Totals are
      //     numbers (RPC casts ::numeric); items/deals are jsonb; van_id is uuid-string-or-empty.
      const p_order = {
        customer_name:  customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        order_type:     'collection',
        items,
        deals:          deals ?? null,
        discount_code:  discountCode ?? null,
        subtotal:       subtotal ?? total,
        discount_amt:   discountAmt ?? 0,
        total,
        notes:          notes ?? null,
        van_id:         eventRow?.van_id ?? null,
        payment_status: 'unpaid',
      }
      const { data: rpcData, error: rpcErr } = await supabase.rpc('place_order_atomic', {
        p_order,
        p_final_slot: finalSlot,
        p_status:     status,
        p_event_id:   eventRow?.id ?? null,
        p_truck_id:   resolvedTruckId,
        p_event_date: orderEventDate,
        p_unit_rows:  unitRows,
      })
      if (rpcErr || !rpcData) {
        // Rolled back — NOTHING persisted (no order, no usage, option stock restored, counter not
        // advanced). Mirrors the old "Failed to save order" 500; the client retries on a clean slate.
        console.error('place_order_atomic failed (rolled back, nothing persisted):', rpcErr)
        return NextResponse.json({ error: 'Failed to save order' }, { status: 500 })
      }
      orderId = String((rpcData as any).order_number)
      order = { order_key: (rpcData as any).order_key }
    } finally {
      if (haveLock) await releaseEventLock(resolvedTruckId, orderEventDate)
    }

    // Defensive narrowing: the only path to here is a successful RPC (every failure returned above),
    // so `order` is set — this guard satisfies the type and never fires in practice.
    if (!order) {
      return NextResponse.json({ error: 'Failed to save order' }, { status: 500 })
    }

    // ── Record upsell events ──────────────────────────────────────────────────
    if (upsellEvents?.length) {
      const eventRows = upsellEvents.map((e: any) => ({
        truck_id:         resolvedTruckId,
        // order_key (UUID) for stable identity. NOTE: upsell_events is not yet
        // provisioned in prod — this insert is fire-and-forget and currently no-ops.
        order_id:         order.order_key,
        event_date:       orderEventDate,
        rule_id:          e.rule_id || null,
        trigger_category: e.trigger_category,
        suggest_category: e.suggest_category,
        items_shown:      e.items_shown || [],
        items_added:      e.items_added || {},
        accepted:         !!e.accepted,
        total_value:      e.total_value || 0,
      }))
      supabase.from('upsell_events').insert(eventRows).then(({ error }) => {
        if (error) console.error('[submit] upsell_events insert failed:', error.message)
      })
    }

    // ── Enforce stock limits (update sold-out flags) — per-event (Phase 4) ────
    // Scoped to eventRow.id, the SAME event_id the guard used above, so an exhausted event marks
    // only itself. No-ops if the order had no resolvable event_id.
    try {
      if (eventRow?.id) await enforceStockLimits(supabase, resolvedTruckId, eventRow.id, itemCatMap)
    } catch (err) {
      console.error('[submit] stock limit enforcement failed:', err)
      // Never block the order — stock enforcement is best-effort
    }

    // ── Email to truck ────────────────────────────────────────────────────────
    // Gated by the operator's "Email me new orders" toggle (trucks.truck_order_email_enabled, default
    // true). `!== false` so a null/legacy value keeps it ON. ONLY this truck-facing notification is
    // gated — the customer confirmation below is untouched. Best-effort; never affects placement.
    try {
      const truckEmail = truck.contact_email
      if (truckEmail && (truck as any).truck_order_email_enabled !== false) {
        const { subject, html, text } = formatNewOrderEmail({
          orderId,
          customerName,
          customerPhone,
          slot,
          items,
          deals: deals || [],
          total,
          notes: notes ?? null,
          venueName:     eventRow?.venue_name ?? null,
          venueTown:     eventRow?.town ?? null,
          venuePostcode: eventRow?.postcode ?? null,
          autoAccepted,
        })
        await sendConfirmationEmail({ to: truckEmail, subject, html, text, senderName: 'HatchGrab' })
      }
    } catch (err) {
      console.error('Truck email failed:', err)
    }

    // ── Email to customer ─────────────────────────────────────────────────────
    // BEST-EFFORT (post-save): the order is already SAVED (and booked) above, so the request MUST
    // succeed from the customer's view. Confirmation-email FORMATTING (dealsWithPrice +
    // formatConfirmationEmail) and SENDING must never 500 a saved order — a throw here would hit the
    // outer catch and tell the customer "Something went wrong" while the order sits on the dashboard
    // (duplicate-order / divergence hazard). Wrapped to mirror the operator-email block (above) and
    // the send below: log and continue to the success response. (Pre-save failures still 500 — only
    // POST-save steps are best-effort. Does NOT touch placement/booking/slot-usage/rollup.)
    try {
      const dealsWithPrice = (deals ?? []).map((d: AppliedDeal) => {
        const bundle = bundles?.find(b => b.name === d.name)
        return { ...d, price: bundle?.bundle_price }
      })
      const { subject, html, text } = formatConfirmationEmail({
        orderId,
        orderKey:     order.order_key,
        truckName:    truck.name,
        customerName,
        slot:         confirmedSlot,
        requestedSlot,
        slotChanged,
        items,
        deals:        dealsWithPrice,
        discountAmt:  discountAmt ?? 0,
        total,
        notes:        notes ?? null,
        autoAccepted,
        venueName:              eventRow?.venue_name ?? null,
        venueTown:              eventRow?.town ?? null,
        venuePostcode:          eventRow?.postcode ?? null,
        preferredContactMethod: truck.preferred_contact_method ?? null,
        contactPhone:           truck.contact_phone ?? null,
        whatsappSender:         truck.whatsapp_sender ?? null,
        socialFacebook:         truck.social_facebook ?? null,
        socialInstagram:        truck.social_instagram ?? null,
        contactEmail:           truck.contact_email ?? null,
        allowCancellation:      truck.allow_customer_cancellation ?? true,
        cancellationCutoffMins: truck.cancellation_cutoff_mins ?? 30,
        baseUrl:                process.env.NEXT_PUBLIC_HATCHGRAB_URL,
        truckSlug:              truck.slug ?? undefined,
      })
      await sendConfirmationEmail({ to: customerEmail, subject, html, text, truckName: truck.name })
    } catch (emailErr) {
      // Non-fatal: the order is saved/booked — never fail the request over the confirmation email.
      console.error('Confirmation email failed (non-fatal, order saved):', emailErr)
    }

    // The truck's only operator-bound email per self-order is the 🔔 New order
    // notification sent above (formatNewOrderEmail) — never a copy of the customer
    // confirmation.

    // ── (Package 5) APNs "order needs confirming" push — SOLE order-notification source ─────────────
    // POST-save, fire-and-forget (mirrors the email blocks: MUST NOT block/hang or fail the saved order).
    // Fires ONLY when the order is pending (needs confirming) = !autoAccepted. Routes: order's event →
    // truck_events.van_id → van (van-level master pref) → van_devices (device opt-out + push_token). The
    // webview no longer fires a local notification (dupe removed at KDS), so this is the one alert per
    // pending order regardless of app foreground/background/closed. Null van / no enabled device / no
    // token / APNs-unconfigured → graceful no-op (order still saved + shown in-app). Invalid tokens
    // (BadDeviceToken/Unregistered) are cleared so we don't keep routing to dead devices.
    if (!autoAccepted) {
      try {
        const eid = eventRow?.id ?? null
        let vanId: string | null = null
        if (eid) {
          const { data: evVan } = await supabase.from('truck_events').select('van_id').eq('id', eid).single()
          vanId = (evVan?.van_id as string | null) ?? null
        }
        if (vanId) {
          // Van-level master toggle (default ON when no row).
          const { data: pref } = await supabase
            .from('van_notification_prefs').select('enabled').eq('van_id', vanId).eq('type', 'order_pending').maybeSingle()
          if (!pref || pref.enabled) {
            const { data: devices } = await supabase
              .from('van_devices').select('device_id, push_token').eq('van_id', vanId).eq('notify_enabled', true).not('push_token', 'is', null)
            const tokens = (devices || []).map(d => d.push_token as string).filter(Boolean)
            if (tokens.length) {
              const res = await sendOrderPendingPush(tokens, { orderKey: order?.order_key ?? '', orderNumber: orderId, truckName: truck.name })
              if (res.invalidTokens.length) {
                await supabase.from('van_devices').update({ push_token: null }).in('push_token', res.invalidTokens)
              }
            }
          }
        }
      } catch (pushErr) {
        console.error('Order-pending push failed (non-fatal, order saved):', pushErr)
      }
    }

    // ── Done ──────────────────────────────────────────────────────────────────
    return NextResponse.json({
      success:       true,
      orderId,
      truckName:     truck.name,
      slot:          confirmedSlot,
      requestedSlot,
      autoAccepted,
      slotChanged,
      total,
    })

  } catch (err: any) {
    console.error('Order submit error:', err)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    )
  }
}