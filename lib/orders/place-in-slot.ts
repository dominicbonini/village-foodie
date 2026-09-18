// lib/orders/place-in-slot.ts
// THE CUSTOMER SLOT-PLACEMENT ENGINE. Moved here VERBATIM from app/api/orders/submit/route.ts:130-305
// on 13 August 2026 so that BOTH order-creation paths for a customer call the same one:
//
//   • pay-at-hatch  — app/api/orders/submit, unchanged, still the only caller it ever had
//   • card          — lib/payments/promote-draft, which places an AUTHORISED draft
//
// 🔴 A MOVE, NOT A REWRITE. The three function bodies below are byte-identical to the originals; only
// the `export` keyword and this header are new. Nothing about placement, capacity or the backward fit
// changed, and the pay-at-hatch path imports the same symbol it used to declare inline.
//
// ⚠️ WHY IT HAD TO MOVE AT ALL. A card order that reaches promotion must be placed by the SAME rules a
// pay-at-hatch order is, or two customers of the same truck get different slot treatment for the same
// basket. Re-implementing the backward fit for the card path would have been a second copy of a
// money-adjacent engine — the exact duplication this codebase spends its comments warning about.
//
// LOCK-FREE, unchanged: the CALLER must already hold the per-event booking lock.
import { supabase } from '@/lib/supabase'
import { getProductionSlotUnits, readCookingReservations } from '@/lib/slot-bookings'
import { orderItemsToQtyByCat } from '@/lib/slot-capacity'
import { earliestBackwardFitSlot, projectBackwardOccupancy, buildAdmittedReservation } from '@/lib/slot-availability'
import { buildReservationForOrder } from '@/lib/orders/cooking-reservation'
import type { StoredCookingReservation } from '@/lib/slot-bookings'
import { getAsapSlot } from '@/lib/slot-utils'
import { generateCollectionTimes } from '@/lib/slot-generation'
import { getNowMinsInTz, getLocalDateInTz } from '@/lib/time-utils'
import type { CatConfig } from '@/lib/prep-utils'

export function timeToMins(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/** Resolve collection slot after auto-accept; bump if production window is batch-full. */
/**
 * Live kitchen_capacity (items ceiling) + event start for a truck/date, from the
 * event's van — the same source the operator traffic light uses. Replaces the dead
 * slot_capacity batch cache for the customer capacity decision.
 */
export async function eventKitchenCapacity(
  truckId: string,
  eventDate: string,
  eventId: string | null,
// 🔴 `vanId` IS RETURNED, NOT THE INTERVALS. The select below is a NAMED select; naming the two
// interval columns on it would make the WHOLE statement 42703 before the migration is applied, and
// this is the read customer placement depends on for capacity. The caller takes the van id and reads
// the intervals through readVanIntervals, which is capability-probed and cannot fail the placement.
): Promise<{ kitchenCapacity: number | null; capacityWindowMins: number; eventStartMins: number; vanId: string | null }> {
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
  return { kitchenCapacity, capacityWindowMins, eventStartMins: ev?.start_time ? timeToMins(String(ev.start_time)) : 0, vanId: ev?.van_id ?? null }
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
export async function placeOrderInSlotLocked(
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
  // P3 (18 September 2026): the per-truck switch. ON ⇒ the walk admits by Dominic's rule and the
  // returned `reservation` is the exact record to store (computed from the SAME fresh read, under the
  // caller's lock). OFF ⇒ today's walk; `reservation` is P2's today's-split record for the same state.
  batchReservations: boolean = false,
): Promise<{ finalSlot: string | null; booked: boolean; reservation?: StoredCookingReservation | null }> {
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
    // P1: the counting orders' reservations, read under the SAME lock; [] on any failure ⇒ today's walk.
    const reservations = await readCookingReservations(supabase, truckId, eventId, excludeOrderKey)
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
    const placement = earliestBackwardFitSlot(times, slotUnits, catConfigs, kitchenCapacity ?? null, eventStartMins, basketByCat, fromMins, capacityWindowMins ?? 5, placeNowMins, reservations, batchReservations)
    if (!placement || timeToMins(placement) > eventEndMins) {
      // No fitting slot before event end → event full → pending (never reject).
      return { finalSlot: null, booked: false }
    }
    // The record for the admitted slot, from the SAME read the walk used. OFF ⇒ today's split of this
    // order alone (what P2 stores); ON ⇒ reserveBatches' windows (fits by construction — the walk chose it).
    const back = projectBackwardOccupancy(slotUnits, catConfigs, eventStartMins, kitchenCapacity ?? null, capacityWindowMins ?? 5, reservations, batchReservations)
    const reservation = batchReservations
      ? buildAdmittedReservation({ back, slotLabel: placement, qtyByCat: basketByCat, catConfigs, kitchenCapacity: kitchenCapacity ?? null, eventStartMins, capacityWindowMins: capacityWindowMins ?? 5, nowMins: placeNowMins, gridIntervalMins: intervalMins ?? null }).record
      : buildReservationForOrder({ slot: placement, qtyByCat: basketByCat, catConfigs, eventStartMins, kitchenCapacity: kitchenCapacity ?? null, capacityWindowMins: capacityWindowMins ?? 5, gridIntervalMins: intervalMins ?? null, source: 'fit' })
    return { finalSlot: placement, booked: true, reservation }
  }
}
