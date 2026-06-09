// app/api/orders/submit/route.ts
// Receives order from the frontend, saves to Supabase,
// fires WhatsApp to truck and email confirmation to customer

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { calculateOrderTotal, validateOrderTotals } from '@/lib/order-calculations'
import {
  addOrderToProductionSlot,
  getProductionSlotUnits,
  buildItemCatMap,
  normaliseOrderLines,
  deriveProductionSlot,
} from '@/lib/slot-bookings'
import { orderItemsToQtyByCat } from '@/lib/slot-capacity'
import { earliestBackwardFitSlot } from '@/lib/slot-availability'
import { getAsapSlot } from '@/lib/slot-utils'
import { generateCollectionTimes } from '@/lib/slot-generation'
import { buildCatConfigs } from '@/lib/prep-utils'
import type { CatConfig } from '@/lib/prep-utils'
import { formatConfirmationEmail, formatNewOrderEmail, sendConfirmationEmail } from '@/lib/email'
import { nextOrderId } from '@/lib/order-utils'
import { enforceStockLimits } from '@/lib/stock-availability'

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
): Promise<{ kitchenCapacity: number | null; eventStartMins: number }> {
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
  if (ev?.van_id) {
    const { data: van } = await supabase
      .from('truck_vans')
      .select('kitchen_capacity')
      .eq('id', ev.van_id)
      .single()
    kitchenCapacity = van?.kitchen_capacity ?? null
  }
  return { kitchenCapacity, eventStartMins: ev?.start_time ? timeToMins(String(ev.start_time)) : 0 }
}

// ── Per-EVENT mutex (Option A) — gap-free serialization ───────────────────────
// One event-level lock per submit so the entire decide-and-book runs against a
// snapshot that already includes EVERY prior booking on the event — required by the
// cumulative cross-slot per-category throughput model (b), not just per-slot (a).
const LOCK_TTL_MS = 10_000      // a leaked lock self-heals after this
const LOCK_MAX_WAIT_MS = 1_000  // total acquire budget before the pending fallback
const LOCK_RETRY_MS = 150
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Acquire the per-event booking lock. Acquire = INSERT into booking_locks; a PK
 * conflict (23505) means it's held — retry within the budget. Stale rows (older than
 * LOCK_TTL_MS) are reclaimed first, and the sweep only deletes rows OLDER than the TTL
 * so a fresh lock is never stolen. Returns true if acquired (caller MUST release in
 * finally); false if contended/errored → caller falls back to pending (never overfills).
 */
async function acquireEventLock(truckId: string, eventDate: string): Promise<boolean> {
  const deadline = Date.now() + LOCK_MAX_WAIT_MS
  for (;;) {
    await supabase
      .from('booking_locks')
      .delete()
      .eq('truck_id', truckId)
      .eq('event_date', eventDate)
      .lt('locked_at', new Date(Date.now() - LOCK_TTL_MS).toISOString())
    const { error } = await supabase
      .from('booking_locks')
      .insert({ truck_id: truckId, event_date: eventDate })
    if (!error) return true
    if (error.code !== '23505') {
      console.warn('[booking_locks] acquire error (failing safe to pending):', error.message)
      return false
    }
    if (Date.now() >= deadline) return false
    await sleep(LOCK_RETRY_MS)
  }
}

async function releaseEventLock(truckId: string, eventDate: string): Promise<void> {
  const { error } = await supabase
    .from('booking_locks')
    .delete()
    .eq('truck_id', truckId)
    .eq('event_date', eventDate)
  if (error) console.warn('[booking_locks] release failed (self-heals via TTL):', error.message)
}

/**
 * Customer slot rule (Section 5/6/7), race-safe via ONE per-event lock. The whole
 * walk runs inside a single lock: read units FRESH (reflecting all prior bookings on
 * the event), evaluate the requested/ASAP-resolved slot then each later slot via
 * buildSlotAvailability (this order folded in as basket), and BOOK the first non-red
 * one atomically. ASAP (requestedSlot null) resolves its start via getAsapSlot
 * (Section 6 — not forked) then walks the same way.
 *
 *   booked=true  → order booked at finalSlot (capacity consumed under lock).
 *   booked=false → no slot non-red (event full) OR lock contended → pending, NOT
 *                  booked. A slot is never overfilled and the customer is never rejected.
 *
 * Reuses buildSlotAvailability + addOrderToProductionSlot — no forked formula (S3/S6),
 * no change to writer semantics (we only wrap decide+book in the lock).
 */
async function claimAvailableSlot(
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
): Promise<{ finalSlot: string | null; booked: boolean }> {
  // Lock stays keyed by (truckId, eventDate) — unchanged. event_id only scopes the
  // production_slot_usage read/write below so same-date events don't pool.
  if (!(await acquireEventLock(truckId, eventDate))) {
    console.warn(`[claimAvailableSlot] event lock contended (${truckId}/${eventDate}) — pending fallback`)
    return { finalSlot: requestedSlot, booked: false }
  }
  try {
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
      await addOrderToProductionSlot(supabase, truckId, eventId, ct, orderLines, itemCatMap)
      return { finalSlot: ct, booked: true }
    }

    const startEntry = times.find(t => t.collection_time === startSlot)
    // Unrecognised slot (not in the list) → confirm at requested, no capacity check (Section 5).
    if (!startEntry) {
      await addOrderToProductionSlot(supabase, truckId, eventId, startSlot, orderLines, itemCatMap)
      return { finalSlot: startSlot, booked: true }
    }

    // One FRESH read under the event lock — we are the sole writer for its duration.
    const slotUnits = await getProductionSlotUnits(supabase, truckId, eventId)
    const eventEndMins = eventEndTime ? timeToMins(eventEndTime) : Number.POSITIVE_INFINITY
    const eventStartMins = eventStartTime ? timeToMins(eventStartTime) : 0

    // Instant-only order (no oven categories) → book at the start slot (no window model).
    const hasOven = Object.keys(basketByCat).some(c => {
      const cfg = catConfigs[c.toLowerCase()]
      return !!(cfg && cfg.secs)
    })
    if (!hasOven) {
      await addOrderToProductionSlot(supabase, truckId, eventId, startSlot, orderLines, itemCatMap)
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
    const placement = earliestBackwardFitSlot(times, slotUnits, catConfigs, kitchenCapacity ?? null, eventStartMins, basketByCat, fromMins)
    if (!placement || timeToMins(placement) > eventEndMins) {
      // No fitting slot before event end → event full → pending (never reject).
      return { finalSlot: null, booked: false }
    }
    await addOrderToProductionSlot(supabase, truckId, eventId, placement, orderLines, itemCatMap)
    return { finalSlot: placement, booked: true }
  } finally {
    await releaseEventLock(truckId, eventDate)
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

    // Pause guard — truck level
    if (truck.paused_until && new Date(truck.paused_until) > new Date()) {
      return NextResponse.json(
        { error: 'Orders are currently paused', paused: true, reason: 'manual' },
        { status: 423 }
      )
    }

    // Pause guard — van level (look up the event assigned to this date)
    const pauseCheckDate = eventDate ?? new Date().toISOString().split('T')[0]
    const { data: pauseEvent } = await supabase
      .from('truck_events')
      .select('van_id, status')
      .eq('truck_id', resolvedTruckId)
      .eq('event_date', pauseCheckDate)
      .neq('status', 'cancelled')
      .maybeSingle()

    // Event status guard — block orders for unconfirmed events
    if (pauseEvent?.status && !['confirmed', 'open'].includes(pauseEvent.status)) {
      return NextResponse.json(
        { error: 'This event is not available for ordering', event_status: pauseEvent.status },
        { status: 403 }
      )
    }

    if (pauseEvent?.van_id) {
      const { data: pauseVan } = await supabase
        .from('truck_vans')
        .select('paused_until, online_paused_until')
        .eq('id', pauseEvent.van_id)
        .single()

      if (pauseVan) {
        const offlinePaused = pauseVan.online_paused_until
          ? new Date(pauseVan.online_paused_until) > new Date()
          : false
        const manualPaused = pauseVan.paused_until
          ? new Date(pauseVan.paused_until) > new Date()
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
    // claimAvailableSlot (reassign to the first available later slot, else pending).
    // Non-capacity validation (payload/total/event) stays below, unchanged.

    // ── Server-side total validation ──────────────────────────────────────────
    const { data: menuItems } = await supabase
      .from('menu_items_db')
      .select('name, price')
      .eq('truck_id', resolvedTruckId)

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

    // ── Generate display number (per-event, restarts at 1) ────────────────────
    // order_key (UUID) is generated by the column default — never set it here.
    const orderId = await nextOrderId(eventRow?.id ?? null, resolvedTruckId)

    // ── Save to Supabase ──────────────────────────────────────────────────────
    const { data: order, error: insertErr } = await supabase
      .from('orders')
      .insert({
        id:             orderId,
        truck_id:       resolvedTruckId,
        customer_name:  customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        slot:           slot ?? null,
        order_type:     'collection',
        event_date:     orderEventDate,
        event_id:       eventRow?.id ?? null,
        van_id:         eventRow?.van_id ?? null,
        items,
        deals:          deals ?? null,
        discount_code:  discountCode ?? null,
        subtotal:       subtotal ?? total,
        discount_amt:   discountAmt ?? 0,
        total,
        notes:          notes ?? null,
        status:         'pending',
        payment_status: 'unpaid',
      })
      .select()
      .single()

    if (insertErr || !order) {
      console.error('Order insert error:', insertErr)
      return NextResponse.json({ error: 'Failed to save order' }, { status: 500 })
    }

    // ── Capacity-safe slot placement (customer path, Section 5/7) ─────────────
    // Customers only ever get an AVAILABLE slot. The chosen slot is validated
    // against LIVE capacity under a per-slot lock (claimAvailableSlot): not red →
    // use it; full → reassign to the first available later slot; all full →
    // pending. Never rejected. Status: auto-accept ON → confirm; OFF → pending on
    // the (possibly reassigned) available slot for operator confirmation.
    const requestedSlot = slot ?? null
    let confirmedSlot = requestedSlot          // what the customer email shows (null = ASAP)
    let autoAccepted = false
    let slotChanged = false

    if (eventDate) {
      // Live kitchen_capacity (items) from the event's van — same source as the
      // operator traffic light, so customer placement and the dot agree on "full".
      const { kitchenCapacity } = await eventKitchenCapacity(resolvedTruckId, eventDate, eventRow?.id ?? null)
      const claim = await claimAvailableSlot(
        resolvedTruckId, eventDate, eventRow?.id ?? null, requestedSlot, orderLines, itemCatMap, catConfigs,
        eventRow?.start_time ?? null,
        eventRow?.end_time ?? null,
        truck.collection_interval_mins ?? 0,
        truck.slot_duration_mins ?? (truck.collection_interval_mins ?? 0),
        kitchenCapacity,
      )
      const update: Record<string, unknown> = {}
      if (claim.booked && claim.finalSlot) {
        const dur = truck.slot_duration_mins ?? (truck.collection_interval_mins ?? 0)
        if (requestedSlot) {
          // Chosen slot: persist the (possibly reassigned) slot; slotChanged drives
          // the slotAdjustedFrom email box (Section 18 — reused, no new copy).
          confirmedSlot = claim.finalSlot
          slotChanged = claim.finalSlot !== requestedSlot
          if (slotChanged) update.slot = claim.finalSlot
        } else {
          // ASAP: keep slot null ONLY when booked at the event-start window, so the
          // production_slot_usage booking matches the writers' null->event-start
          // resolution (book/unbook identity; writer semantics untouched). If pushed
          // to a later window, persist the concrete slot (email then shows that time).
          const startPs = deriveProductionSlot(String(eventRow?.start_time ?? claim.finalSlot).slice(0, 5), dur)
          const finalPs = deriveProductionSlot(claim.finalSlot, dur)
          if (finalPs === startPs) {
            confirmedSlot = null            // customer still sees "ASAP"
          } else {
            update.slot = claim.finalSlot   // pushed later -> concrete collection time
            confirmedSlot = claim.finalSlot
          }
        }
        if (truck.auto_accept) {
          autoAccepted = true
          update.status = 'confirmed'
        }
      }
      // !claim.booked -> event full / lock contended -> leave pending at requested
      // (or ASAP/null), unbooked. Never rejected, never overfilled.
      if (Object.keys(update).length) {
        await supabase.from('orders').update(update).eq('order_key', order.order_key)
      }
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

    // ── Enforce stock limits (update sold-out flags) ──────────────────────────
    try {
      await enforceStockLimits(supabase, resolvedTruckId, orderEventDate, itemCatMap)
    } catch (err) {
      console.error('[submit] stock limit enforcement failed:', err)
      // Never block the order — stock enforcement is best-effort
    }

    // ── Email to truck ────────────────────────────────────────────────────────
    try {
      const truckEmail = truck.contact_email
      if (truckEmail) {
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

    try {
      await sendConfirmationEmail({ to: customerEmail, subject, html, text, truckName: truck.name })
    } catch (emailErr) {
      console.error('Customer email failed:', emailErr)
    }

    // The truck's only operator-bound email per self-order is the 🔔 New order
    // notification sent above (formatNewOrderEmail) — never a copy of the customer
    // confirmation.

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