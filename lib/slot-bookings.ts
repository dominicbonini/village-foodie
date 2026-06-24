// lib/slot-bookings.ts
// Tracks item quantities per production_slot (batch-based capacity, not order count).

import { SupabaseClient } from '@supabase/supabase-js'
import {
  orderItemsToQtyByCat,
  mergeQtyByCat,
  subtractQtyByCat,
  totalBatchesForQtyByCat,
  type QtyByCat,
} from '@/lib/slot-capacity'
import type { CatConfig } from '@/lib/prep-utils'

export type ProductionSlotUnits = Record<string, QtyByCat>

/**
 * Flatten order items + deal slot items into a single normalised lines array.
 * quantity coerced to number defensively (DB may return strings for older rows).
 * Canonical single source — replaces orderLinesFromOrder (action) and allOrderLines (submit).
 */
export function normaliseOrderLines(
  items: Array<{ name: string; quantity: number | string }>,
  deals?: Array<{ slots?: Record<string, any> }> | null
): Array<{ name: string; quantity: number }> {
  const lines = (items || []).map(i => ({
    name: i.name,
    quantity: typeof i.quantity === 'string' ? parseInt(i.quantity) || 1 : i.quantity,
  }))
  ;(deals || []).forEach(d => {
    Object.values(d.slots || {}).filter(Boolean).forEach(name =>
      lines.push({ name: String(name), quantity: 1 })
    )
  })
  return lines
}

/**
 * Derive the production slot key from a collection time on dynamic-slot trucks
 * (those without static collection_times rows). On static-slot trucks callers
 * should prefer the production_slot value from the collection_times table.
 */
export function deriveProductionSlot(
  collectionTime: string,
  slotDurationMins: number
): string {
  if (slotDurationMins <= 0) return collectionTime
  const [h, m] = collectionTime.split(':').map(Number)
  const slotMins = h * 60 + m
  const prodMins = Math.floor(slotMins / slotDurationMins) * slotDurationMins
  return `${String(Math.floor(prodMins / 60)).padStart(2, '0')}:${String(prodMins % 60).padStart(2, '0')}`
}

export async function buildItemCatMap(
  supabase: SupabaseClient,
  truckId: string
): Promise<Record<string, string>> {
  const [{ data: menuItems }, { data: categories }] = await Promise.all([
    supabase.from('menu_items_db').select('name, category_id').eq('truck_id', truckId),
    supabase.from('menu_categories').select('id, name').eq('truck_id', truckId),
  ])
  const itemCatMap: Record<string, string> = {}
  ;(menuItems || []).forEach(item => {
    const cat = categories?.find(c => c.id === item.category_id)
    if (cat) itemCatMap[item.name] = cat.name.toLowerCase()
  })
  return itemCatMap
}

async function fetchCollectionTimeMap(
  supabase: SupabaseClient,
  truckId: string
): Promise<Record<string, string>> {
  const { data } = await supabase
    .from('collection_times')
    .select('collection_time, production_slot')
    .eq('truck_id', truckId)
  const map: Record<string, string> = {}
  ;(data || []).forEach(r => {
    map[r.collection_time] = r.production_slot
  })
  return map
}

/**
 * Event metadata for production bookkeeping: the event's OWN start window (HH:MM, for
 * null-slot/ASAP resolution) and its event_date (for the date-scoped delete and the
 * event_date column). Keyed by event_id so a null-slot order books into THIS event's
 * start window, NOT the date's earliest event (the cross-event mis-windowing fix).
 */
async function getEventMeta(
  supabase: SupabaseClient,
  eventId: string
): Promise<{ start: string | null; eventDate: string | null }> {
  const { data } = await supabase
    .from('truck_events')
    .select('start_time, event_date')
    .eq('id', eventId)
    .maybeSingle()
  return {
    start: data?.start_time ? String(data.start_time).slice(0, 5) : null,
    eventDate: data?.event_date ?? null,
  }
}

/**
 * Resolve the collection time used for production-slot bookkeeping. A real slot
 * passes through unchanged; a null slot (ASAP) resolves to THIS event's start window.
 * book and unbook MUST both go through this so they target the identical production slot.
 */
async function resolveBookingSlot(
  supabase: SupabaseClient,
  eventId: string,
  collectionTime: string | null
): Promise<string | null> {
  if (collectionTime) return collectionTime
  return (await getEventMeta(supabase, eventId)).start
}

/**
 * Internal read: returns this event's stored units AND whether it had to lazily
 * REBUILD them from `orders`. `reseeded:true` means the returned units were rebuilt
 * from the live orders table (which already reflects EVERY current order, including
 * one just inserted), and persisted — so an incremental caller must NOT re-apply its
 * order on top (that's the first-order double-count). `reseeded:false` means stored
 * rows that do NOT yet include a brand-new order, so an incremental merge is correct.
 */
async function readProductionSlotUnits(
  supabase: SupabaseClient,
  truckId: string,
  eventId: string | null,
  // WRITE callers (addOrderToProductionSlot) persist the lazy reseed and rely on `reseeded` to skip
  // their own merge. PURE READS (getProductionSlotUnits — e.g. the submit fit-check) pass false so the
  // reseed is computed but NOT written. BUG 1: when the fit-check persisted its reseed (which already
  // includes the just-inserted order), the table went non-empty, so the subsequent
  // addOrderToProductionSlot read returned reseeded:false and merged the order ON TOP → first-order
  // double-count. A read-only reseed leaves the table empty until the single authoritative write.
  persistReseed: boolean = true,
  // Forwarded to buildUnitsFromOrders on BOTH reseed paths (degraded fallback + empty-cache). Opt-in;
  // ONLY the submit fit-read passes it (the placing order's order_key). Default undefined → no filter.
  excludeOrderKey?: string | null
): Promise<{ units: ProductionSlotUnits; reseeded: boolean }> {
  // No event → order/view belongs to no event; nothing pooled, empty usage.
  if (!eventId) return { units: {}, reseeded: false }
  const { data, error } = await supabase
    .from('production_slot_usage')
    .select('production_slot, units_by_cat')
    .eq('truck_id', truckId)
    .eq('event_id', eventId)

  if (error) {
    // Degraded fallback (SELECT failed): rebuild but DON'T claim reseeded, so the
    // incremental caller still merges+persists its order (unchanged prior behaviour).
    return { units: await buildUnitsFromOrders(supabase, truckId, eventId, excludeOrderKey), reseeded: false }
  }

  if (!data?.length) {
    // Lazy reseed (covers the empty table between migration and backfill). The rebuild already
    // includes every current order. `reseeded` is claimed ONLY when we actually persisted (didPersist):
    // it tells a write-caller "this order is already booked, skip your merge" — so claiming it without
    // persisting would drop the order entirely (zero-count). Pure reads (persistReseed=false) never
    // persist and never claim reseeded; the write path (default true) persists and skips its merge.
    const built = await buildUnitsFromOrders(supabase, truckId, eventId, excludeOrderKey)
    let didPersist = false
    if (persistReseed) {
      const { eventDate } = await getEventMeta(supabase, eventId)
      if (eventDate) { await syncProductionSlotUsage(supabase, truckId, eventId, eventDate, built); didPersist = true }
    }
    return { units: built, reseeded: didPersist }
  }

  const out: ProductionSlotUnits = {}
  data.forEach(r => {
    out[r.production_slot] = (r.units_by_cat as QtyByCat) || {}
  })
  return { units: out, reseeded: false }
}

/** All production windows for ONE event → item qty by category. Event-scoped: returns
 *  only this event's rows, never pooled with other same-date events. */
export async function getProductionSlotUnits(
  supabase: SupabaseClient,
  truckId: string,
  eventId: string | null,
  // OPT-IN: only the submit fit-read passes the placing order's order_key so the reseed excludes it
  // (Option B self-count fix). Default undefined → full occupancy for every other reader.
  excludeOrderKey?: string | null
): Promise<ProductionSlotUnits> {
  // persistReseed=false → READ-ONLY reseed: never write the table from a pure read (the submit
  // fit-check uses this). The single authoritative write is addOrderToProductionSlot (BUG 1 fix).
  return (await readProductionSlotUnits(supabase, truckId, eventId, false, excludeOrderKey)).units
}

/** An order shape this builder can fold in WITHOUT it being in the DB yet — same fields the DB read
 *  selects (slot, items, deals). Used by computeEventUnitRows so the atomic-RPC path can produce the
 *  post-insert units (committed orders + the placing order) through the IDENTICAL per-order loop. */
type FoldableOrder = { slot: string | null; items: any[]; deals?: any[] | null }

async function buildUnitsFromOrders(
  supabase: SupabaseClient,
  truckId: string,
  eventId: string,
  // OPT-IN fit-read exclusion: the submit fit passes the PLACING order's own order_key so the reseed
  // doesn't count it against itself (it's inserted pending+null-slot BEFORE the fit, so it would
  // otherwise self-occupy the event-start window and over-yield one slot). Default undefined → NO
  // filter → full occupancy. NEVER passed by the write/rebuild/reader paths (they must count all).
  excludeOrderKey?: string | null,
  // ADDITIVE (§45 atomic-RPC): in-memory orders to fold in alongside the DB-read orders, through the
  // SAME per-order resolution below. Default [] → existing callers are byte-identical (they pass none).
  // computeEventUnitRows passes the placing order here so the result equals a post-insert rebuild —
  // without inserting first (the insert + this write happen atomically in the RPC).
  extraOrders: FoldableOrder[] = []
): Promise<ProductionSlotUnits> {
  // Event-scoped: this event's orders only. event_id IS NULL orders (which belong to no event) are
  // excluded by the eq filter, so they pool into nothing. null-slot (ASAP) orders are still included —
  // they book into the event-start window below.
  let ordersQuery = supabase
    .from('orders')
    .select('slot, items, deals')
    .eq('truck_id', truckId)
    .eq('event_id', eventId)
    .in('status', ['pending', 'confirmed', 'modified'])
  if (excludeOrderKey) ordersQuery = ordersQuery.neq('order_key', excludeOrderKey)

  const [timeMap, meta, { data: orders }, { data: menuItems }, { data: categories }] = await Promise.all([
    fetchCollectionTimeMap(supabase, truckId),
    getEventMeta(supabase, eventId),
    ordersQuery,
    supabase.from('menu_items_db').select('name, category_id').eq('truck_id', truckId),
    supabase.from('menu_categories').select('id, name').eq('truck_id', truckId),
  ])
  const eventStart = meta.start

  const itemCatMap: Record<string, string> = {}
  ;(menuItems || []).forEach(item => {
    const cat = categories?.find(c => c.id === item.category_id)
    if (cat) itemCatMap[item.name] = cat.name.toLowerCase()
  })

  const out: ProductionSlotUnits = {}
  // DB-read orders + any folded-in in-memory orders, processed by the IDENTICAL loop body (no logic
  // change for existing callers — extraOrders is empty for them).
  ;[...(orders || []), ...extraOrders].forEach(order => {
    // DEFENSIVE LEGACY FALLBACK: since the submit route now ALWAYS persists the resolved boundary to
    // order.slot (never null for new orders), `order.slot` is the real placed slot and the rebuild
    // reads the SAME ct the incremental booking used → no 10:05-vs-10:00 divergence. The `|| eventStart`
    // only fires for LEGACY null-slot orders placed before that fix; kept so old data still resolves.
    const ct = order.slot || eventStart
    if (!ct) return
    const productionSlot = timeMap[ct] || ct
    // Include deal slot items (normaliseOrderLines) so a rebuild matches the
    // incremental counter, which also books deal items.
    const lines = normaliseOrderLines(order.items || [], order.deals)
    const delta = orderItemsToQtyByCat(lines, itemCatMap)
    out[productionSlot] = mergeQtyByCat(out[productionSlot] || {}, delta)
  })
  return out
}

/**
 * §45 atomic-RPC helper (PURE compute, NO write). Returns the production_slot_usage rows for THIS
 * event AS IF the placing order were already committed — by folding it into buildUnitsFromOrders'
 * identical per-order loop alongside the event's current orders. The atomic RPC then writes these
 * rows (event-scoped delete+insert) in the SAME transaction as the order INSERT, so display and
 * enforcement can't diverge and a failure rolls back both. Seating is byte-identical to the old
 * insert→rebuildProductionSlotUsage path because the SAME helpers + inputs produce the units; only
 * the WRITE moves into the RPC. `newOrder.slot` MUST be the resolved finalSlot (TS resolve output).
 */
export async function computeEventUnitRows(
  supabase: SupabaseClient,
  truckId: string,
  eventId: string,
  newOrder: FoldableOrder
): Promise<{ production_slot: string; units_by_cat: QtyByCat }[]> {
  const units = await buildUnitsFromOrders(supabase, truckId, eventId, undefined, [newOrder])
  return Object.entries(units).map(([production_slot, units_by_cat]) => ({ production_slot, units_by_cat }))
}

// Returns the upsert error (or null) so the reconcile path can SURFACE a write failure instead of
// it masquerading as a successful rebuild (BUG 2). The best-effort lazy-reseed caller ignores it.
async function syncProductionSlotUsage(
  supabase: SupabaseClient,
  truckId: string,
  eventId: string,
  eventDate: string,
  units: ProductionSlotUnits
): Promise<{ error: { message: string } | null }> {
  const rows = Object.entries(units).map(([production_slot, units_by_cat]) => ({
    truck_id: truckId,
    event_id: eventId,
    event_date: eventDate,
    production_slot,
    units_by_cat,
    updated_at: new Date().toISOString(),
  }))
  if (!rows.length) return { error: null }
  const { error } = await supabase.from('production_slot_usage').upsert(rows, {
    onConflict: 'truck_id,event_id,production_slot',
  })
  return { error }
}

async function upsertProductionSlotUnits(
  supabase: SupabaseClient,
  truckId: string,
  eventId: string,
  eventDate: string,
  productionSlot: string,
  units: QtyByCat
) {
  const { error } = await supabase.from('production_slot_usage').upsert(
    {
      truck_id: truckId,
      event_id: eventId,
      event_date: eventDate,
      production_slot: productionSlot,
      units_by_cat: units,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'truck_id,event_id,production_slot' }
  )
  if (error) console.warn('[production_slot_usage] upsert failed (drift risk):', error.message)
}

/** Batch count per collection_time (for slot picker UI). Event-scoped. */
export async function getBatchCountsByCollectionTime(
  supabase: SupabaseClient,
  truckId: string,
  eventId: string,
  collectionTimes: { collection_time: string; production_slot: string }[],
  catConfigs: Record<string, CatConfig>
): Promise<Record<string, number>> {
  const slotUnits = await getProductionSlotUnits(supabase, truckId, eventId)
  const counts: Record<string, number> = {}
  collectionTimes.forEach(t => {
    const units = slotUnits[t.production_slot] || {}
    counts[t.collection_time] = totalBatchesForQtyByCat(units, catConfigs)
  })
  return counts
}

/** Add an order's items to its production window. collectionTime null → ASAP, booked
 *  into THIS event's start window (resolveBookingSlot). eventId null → order belongs to
 *  no event; skipped (we never write null-event rows — they would pool). */
export async function addOrderToProductionSlot(
  supabase: SupabaseClient,
  truckId: string,
  eventId: string | null,
  collectionTime: string | null,
  items: { name: string; quantity: number }[],
  itemCatMap: Record<string, string>
) {
  if (!items.length || !eventId) return
  const meta = await getEventMeta(supabase, eventId)
  // DEFENSIVE LEGACY FALLBACK: callers now pass the SERVER-resolved boundary (order.slot is never
  // null post-submit-fix), so `collectionTime` is the real placed slot and matches what the rebuild
  // reads from order.slot → both converge on the same production_slot. `|| meta.start` only fires for
  // a legacy null/ASAP collectionTime; kept defensively, unreachable for new orders. (book + unbook
  // MUST share this so they target the identical slot.)
  const ct = collectionTime || meta.start
  if (!ct || !meta.eventDate) return
  const timeMap = await fetchCollectionTimeMap(supabase, truckId)
  const productionSlot = timeMap[ct] || ct
  const { units: slotUnits, reseeded } = await readProductionSlotUnits(supabase, truckId, eventId)
  // First order of an event: the cache was empty, so the read just REBUILT it from
  // `orders` (which already contains this order, inserted moments ago) and persisted it.
  // Re-merging would double-count this order — the reseed already booked it. Skip.
  if (reseeded) return
  const current = slotUnits[productionSlot] || {}
  const merged = mergeQtyByCat(current, orderItemsToQtyByCat(items, itemCatMap))
  await upsertProductionSlotUnits(supabase, truckId, eventId, meta.eventDate, productionSlot, merged)
}

/** Remove an order's items from its production window. collectionTime null → ASAP,
 *  resolved to the SAME event-start window the add used, so they cancel out. eventId
 *  null → nothing was booked; nothing to remove. */
export async function removeOrderFromProductionSlot(
  supabase: SupabaseClient,
  truckId: string,
  eventId: string | null,
  collectionTime: string | null,
  items: { name: string; quantity: number }[],
  itemCatMap: Record<string, string>
) {
  if (!items.length || !eventId) return
  const meta = await getEventMeta(supabase, eventId)
  // DEFENSIVE LEGACY FALLBACK: callers now pass the SERVER-resolved boundary (order.slot is never
  // null post-submit-fix), so `collectionTime` is the real placed slot and matches what the rebuild
  // reads from order.slot → both converge on the same production_slot. `|| meta.start` only fires for
  // a legacy null/ASAP collectionTime; kept defensively, unreachable for new orders. (book + unbook
  // MUST share this so they target the identical slot.)
  const ct = collectionTime || meta.start
  if (!ct || !meta.eventDate) return
  const timeMap = await fetchCollectionTimeMap(supabase, truckId)
  const productionSlot = timeMap[ct] || ct
  const slotUnits = await getProductionSlotUnits(supabase, truckId, eventId)
  const current = slotUnits[productionSlot] || {}
  const delta = orderItemsToQtyByCat(items, itemCatMap)
  const next = subtractQtyByCat(current, delta)
  await upsertProductionSlotUnits(supabase, truckId, eventId, meta.eventDate, productionSlot, next)
}

/**
 * Authoritatively recompute units_by_cat from the orders table and OVERWRITE the stored
 * rows — the reconcile/self-heal path (Gap 3). DATE-SCOPED orchestrator: clears the whole
 * date's rows, then rebuilds EACH non-cancelled event on that date as its own event-keyed
 * rows (no cross-event pooling). Per-event rebuild reuses buildUnitsFromOrders (same
 * resolution incl. null-slot → this event's start and deal items), so a rebuild and the
 * incremental counter agree. Best-effort: a read-after-empty lazily reseeds anyway.
 */
export async function rebuildProductionSlotUsage(
  supabase: SupabaseClient,
  truckId: string,
  eventDate: string
) {
  const { error: delErr } = await supabase
    .from('production_slot_usage')
    .delete()
    .eq('truck_id', truckId)
    .eq('event_date', eventDate)
  // BUG 2: do NOT swallow. The old `warn + return` left stale rows AND let the caller record the
  // reconcile as "ran" (the row's updated_at never changed). THROW so a failed reconcile is visible —
  // backfill records it in `failures`, manage/events log it (they already try/catch). The thrown
  // message exposes the real cause (RLS / constraint / event_date mismatch) on the next run.
  if (delErr) throw new Error(`production_slot_usage rebuild delete failed (${truckId} / ${eventDate}): ${delErr.message}`)

  const { data: events, error: evErr } = await supabase
    .from('truck_events')
    .select('id')
    .eq('truck_id', truckId)
    .eq('event_date', eventDate)
    .neq('status', 'cancelled')
  if (evErr) throw new Error(`production_slot_usage rebuild events query failed (${truckId} / ${eventDate}): ${evErr.message}`)
  for (const ev of events || []) {
    const units = await buildUnitsFromOrders(supabase, truckId, ev.id)
    // Surface a WRITE failure too: a silent upsert error would also leave updated_at unchanged.
    const { error: syncErr } = await syncProductionSlotUsage(supabase, truckId, ev.id, eventDate, units)
    if (syncErr) throw new Error(`production_slot_usage rebuild write failed (event ${ev.id}): ${syncErr.message}`)
  }
}

/** @deprecated Use getBatchCountsByCollectionTime — kept for gradual migration */
export async function getSlotBookingCounts(
  supabase: SupabaseClient,
  truckId: string,
  eventId: string,
  collectionTimes?: { collection_time: string; production_slot: string }[],
  catConfigs?: Record<string, CatConfig>
): Promise<Record<string, number>> {
  if (collectionTimes?.length && catConfigs) {
    return getBatchCountsByCollectionTime(supabase, truckId, eventId, collectionTimes, catConfigs)
  }
  // Legacy fallback: order count per slot (event-scoped)
  const { data } = await supabase
    .from('orders')
    .select('slot')
    .eq('truck_id', truckId)
    .eq('event_id', eventId)
    .in('status', ['pending', 'confirmed', 'modified'])
    .not('slot', 'is', null)
  const counts: Record<string, number> = {}
  ;(data || []).forEach(o => {
    if (o.slot) counts[o.slot] = (counts[o.slot] || 0) + 1
  })
  return counts
}

/** @deprecated */
export async function incrementSlotBooking(
  supabase: SupabaseClient,
  truckId: string,
  eventId: string,
  collectionTime: string,
  items?: { name: string; quantity: number }[],
  itemCatMap?: Record<string, string>
) {
  if (items?.length && itemCatMap) {
    await addOrderToProductionSlot(supabase, truckId, eventId, collectionTime, items, itemCatMap)
    return
  }
}

/** @deprecated */
export async function decrementSlotBooking(
  supabase: SupabaseClient,
  truckId: string,
  eventId: string,
  collectionTime: string,
  items?: { name: string; quantity: number }[],
  itemCatMap?: Record<string, string>
) {
  if (items?.length && itemCatMap) {
    await removeOrderFromProductionSlot(supabase, truckId, eventId, collectionTime, items, itemCatMap)
  }
}

export async function moveSlotBooking(
  supabase: SupabaseClient,
  truckId: string,
  eventId: string | null,
  fromSlot: string | null,
  toSlot: string | null,
  items: { name: string; quantity: number }[],
  itemCatMap: Record<string, string>
) {
  if (fromSlot && fromSlot !== toSlot) {
    await removeOrderFromProductionSlot(supabase, truckId, eventId, fromSlot, items, itemCatMap)
  }
  if (toSlot && fromSlot !== toSlot) {
    await addOrderToProductionSlot(supabase, truckId, eventId, toSlot, items, itemCatMap)
  }
}
