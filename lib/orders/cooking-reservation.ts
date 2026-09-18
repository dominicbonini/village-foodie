// lib/orders/cooking-reservation.ts
// ── COOKING RESERVATIONS — THE WRITER (P2, 18 September 2026) ───────────────────────────────────────
// After an order is placed or edited, write what TODAY'S projection seats for THAT ORDER ALONE into
// orders.cooking_reservation — nothing more. Under today's rule the engine only ever USES it when it is
// the sole reservation at its slot and equals the slot total (cachedReservationWindows), which is
// exactly the case where seating it verbatim IS today's split. So this phase changes no verdict and no
// dot; it accumulates the data P3 will decide with.
//
// 🔴 BEST-EFFORT, NEVER THROWS, NEVER BLOCKS. A separate UPDATE keyed by order_key + truck_id, after the
// order is already committed. Any failure — column absent (42703), schema cache stale (PGRST204), a
// missing event, an unpriceable line — is logged and leaves the column NULL, which every reader treats
// as "use today's split". The order itself is never altered and never fails because of this.
// ⚠️ It bumps orders.updated_at (the orders_set_updated_at trigger fires on every UPDATE). Audited in
// docs/batch-reservation-p0-p2-report.md §R2: one extra fetchAll on connected screens, no sound, no
// reprint, no reorder — the dashboard sound keys on a NEW order_key and the KDS on INSERT only.
import type { SupabaseClient } from '@supabase/supabase-js'
import { projectBackwardOccupancy, buildAdmittedReservation } from '@/lib/slot-availability'
import { buildItemCatMap, normaliseOrderLines, getProductionSlotUnits, readCookingReservations, readUnitsWithoutOrder } from '@/lib/slot-bookings'
import { orderItemsToQtyByCat } from '@/lib/slot-capacity'
import { buildCatConfigs } from '@/lib/prep-utils'
import type { StoredCookingReservation } from '@/lib/slot-bookings'

let columnMissingLogged = false

/** The event's start and its van's ceiling, read through the CLIENT WE WERE HANDED (never the module
 *  client): the same lookups eventKitchenCapacity makes, so the split is computed with the inputs the
 *  placement used. Missing event ⇒ null ⇒ nothing is written. */
async function loadEventCapacityMeta(supabase: SupabaseClient, truckId: string, eventId: string): Promise<{ eventStartMins: number; kitchenCapacity: number | null; capacityWindowMins: number } | null> {
  const { data: ev } = await supabase.from('truck_events').select('start_time, van_id').eq('truck_id', truckId).eq('id', eventId).maybeSingle()
  if (!ev) return null
  let kitchenCapacity: number | null = null, capacityWindowMins = 5
  if (ev.van_id) {
    const { data: van } = await supabase.from('truck_vans').select('kitchen_capacity, capacity_window_mins').eq('id', ev.van_id).maybeSingle()
    kitchenCapacity = van?.kitchen_capacity ?? null
    capacityWindowMins = van?.capacity_window_mins ?? 5
  }
  const t = ev.start_time ? String(ev.start_time) : null
  const eventStartMins = t ? (parseInt(t.slice(0, 2), 10) || 0) * 60 + (parseInt(t.slice(3, 5), 10) || 0) : 0
  return { eventStartMins, kitchenCapacity, capacityWindowMins }
}

/** The reservation TODAY's projection would give this order on its own. Pure; exported for the harnesses. */
export function buildReservationForOrder(args: {
  slot: string
  qtyByCat: Record<string, number>
  catConfigs: Record<string, { secs: number; batch: number; countsToCapacity?: boolean }>
  eventStartMins: number
  kitchenCapacity: number | null
  capacityWindowMins: number
  gridIntervalMins: number | null
  source: 'fit' | 'override'
}): StoredCookingReservation | null {
  const { slot, qtyByCat, catConfigs, eventStartMins, kitchenCapacity, capacityWindowMins, gridIntervalMins, source } = args
  const back = projectBackwardOccupancy({ [slot]: qtyByCat }, catConfigs, eventStartMins, kitchenCapacity, capacityWindowMins)
  const cats: StoredCookingReservation['cats'] = {}
  for (const [catRaw, n] of Object.entries(qtyByCat)) {
    const cat = catRaw.toLowerCase(); const cfg = catConfigs[cat]; const items = Number(n) || 0
    if (!cfg || !cfg.secs || items <= 0) continue                  // instant categories reserve no window
    const windows = back.intervals
      .filter(iv => iv.cat === cat && iv.endMins > iv.startMins && iv.items > 0)
      .map(iv => ({ startMins: iv.startMins, endMins: iv.endMins, items: iv.items }))
      .sort((a, b) => a.startMins - b.startMins)
    if (!windows.length) continue
    cats[cat] = { items, batch: Math.max(1, cfg.batch), prepMins: Math.max(1, Math.round(cfg.secs / 60)), windows }
  }
  if (!Object.keys(cats).length) return null
  return { v: 1, source, slot, computed: { eventStartMins, capacityWindowMins, kitchenCapacity, gridIntervalMins }, cats }
}

/** P3 (switch ON): write a record the ADMISSION already computed under the lock — no re-read, no recompute,
 *  so the stored windows are exactly the ones reserveBatches admitted from the state the admission saw.
 *  Best-effort like the P2 writer: null on any failure, the order untouched. */
export async function writeReservationRecord(
  supabase: SupabaseClient,
  args: { truckId: string; orderKey: string; record: StoredCookingReservation | null },
): Promise<boolean> {
  if (!args.record) return false
  try {
    const { error } = await supabase.from('orders').update({ cooking_reservation: args.record }).eq('order_key', args.orderKey).eq('truck_id', args.truckId)
    if (error) {
      const code = (error as { code?: string }).code
      if (!columnMissingLogged) { columnMissingLogged = true; console.warn(`[reservations] record write failed (${code ?? 'unknown'}): ${error.message} — order unchanged, display falls back to the slot total`) }
      return false
    }
    return true
  } catch (e) { console.warn('[reservations] record write threw — order unchanged:', e instanceof Error ? e.message : e); return false }
}

/** P3 (switch ON): admit a walk-up or an edited order at `slotLabel` by Dominic's rule against the
 *  event's CURRENT state — units and reservations read now, this order excluded — and return the record
 *  to store ('fit', or 'override' with the shortfall in the nearest window). The caller holds the lock. */
export async function admitForManual(
  supabase: SupabaseClient,
  truckId: string,
  eventId: string,
  eventDate: string,
  orderKey: string,
  slotLabel: string,
  lines: { name: string; quantity: number }[],
  itemCatMap: Record<string, string>,
): Promise<StoredCookingReservation | null> {
  try {
    // 🔴 THE BOARD WITHOUT THIS ORDER (19 September 2026). By the time this runs the order's own load is
    // ALREADY in production_slot_usage — the manual path rebuilt the table after inserting, the edit path
    // re-booked the new lines — and getProductionSlotUnits(…, orderKey) does not exclude by key once the
    // table has rows (only on its reseed paths). Reading the stored totals here counted the order against
    // itself: 16 pizzas at 20:30 saw "two full batches" that were its own, was refused, and was stored as
    // an 'override' the operator never chose. readUnitsWithoutOrder excludes by order_key unconditionally,
    // which is the same board the submit path's fit-read judges. Reservations already excluded by key.
    const [catConfigs, cap, units, reservations] = await Promise.all([
      buildCatConfigs(supabase, truckId),
      loadEventCapacityMeta(supabase, truckId, eventId),
      readUnitsWithoutOrder(supabase, truckId, eventId, orderKey),
      readCookingReservations(supabase, truckId, eventId, orderKey),
    ])
    if (!cap) return null
    const qtyByCat = orderItemsToQtyByCat(lines, itemCatMap)
    const back = projectBackwardOccupancy(units, catConfigs, cap.eventStartMins, cap.kitchenCapacity, cap.capacityWindowMins, reservations, true)
    return buildAdmittedReservation({ back, slotLabel, qtyByCat, catConfigs, kitchenCapacity: cap.kitchenCapacity, eventStartMins: cap.eventStartMins, capacityWindowMins: cap.capacityWindowMins, gridIntervalMins: null }).record
  } catch (e) { console.warn('[reservations] manual admission threw — no reservation written:', e instanceof Error ? e.message : e); void eventDate; return null }
}

/** Load everything from the order's own row and the event, compute, write. Resolves to what was written (or null). */
export async function writeCookingReservation(
  supabase: SupabaseClient,
  args: { truckId: string; eventId: string | null; orderKey: string; gridIntervalMins?: number | null },
): Promise<StoredCookingReservation | null> {
  const { truckId, eventId, orderKey } = args
  try {
    if (!eventId) return null
    const { data: order, error: oErr } = await supabase
      .from('orders')
      .select('order_key, slot, items, deals, status, event_date, capacity_ack_at')
      .eq('order_key', orderKey).eq('truck_id', truckId).maybeSingle()
    if (oErr || !order || !order.slot) return null
    const [itemCatMap, catConfigs, cap] = await Promise.all([
      buildItemCatMap(supabase, truckId),
      buildCatConfigs(supabase, truckId),
      loadEventCapacityMeta(supabase, truckId, eventId),
    ])
    if (!cap) return null
    const lines = normaliseOrderLines((order.items as { name: string; quantity: number }[]) || [], (order.deals as { slots?: Record<string, unknown> }[] | null) ?? null)
    const qtyByCat = orderItemsToQtyByCat(lines, itemCatMap)
    const reservation = buildReservationForOrder({
      slot: String(order.slot), qtyByCat, catConfigs, eventStartMins: cap.eventStartMins, kitchenCapacity: cap.kitchenCapacity,
      capacityWindowMins: cap.capacityWindowMins, gridIntervalMins: args.gridIntervalMins ?? null,
      source: order.capacity_ack_at ? 'override' : 'fit',
    })
    if (!reservation) return null
    const { error } = await supabase.from('orders').update({ cooking_reservation: reservation }).eq('order_key', orderKey).eq('truck_id', truckId)
    if (error) {
      const code = (error as { code?: string }).code
      if (!columnMissingLogged) {
        columnMissingLogged = true
        if (code === 'PGRST204') console.warn('[reservations] write skipped: orders.cooking_reservation not in the schema cache (PGRST204) — order unchanged')
        else if (code === '42703') console.warn('[reservations] write skipped: orders.cooking_reservation absent (42703, migration 20260920 not applied) — order unchanged')
        else console.warn(`[reservations] write failed (${code ?? 'unknown'}): ${error.message} — order unchanged`)
      }
      return null
    }
    return reservation
  } catch (e) {
    console.warn('[reservations] write threw — order unchanged:', e instanceof Error ? e.message : e)
    return null
  }
}
