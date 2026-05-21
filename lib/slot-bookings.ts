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

/** All production windows for a truck/date → item qty by category. */
export async function getProductionSlotUnits(
  supabase: SupabaseClient,
  truckId: string,
  eventDate: string
): Promise<ProductionSlotUnits> {
  const { data, error } = await supabase
    .from('production_slot_usage')
    .select('production_slot, units_by_cat')
    .eq('truck_id', truckId)
    .eq('event_date', eventDate)

  if (error) {
    return buildUnitsFromOrders(supabase, truckId, eventDate)
  }

  if (!data?.length) {
    const built = await buildUnitsFromOrders(supabase, truckId, eventDate)
    await syncProductionSlotUsage(supabase, truckId, eventDate, built)
    return built
  }

  const out: ProductionSlotUnits = {}
  data.forEach(r => {
    out[r.production_slot] = (r.units_by_cat as QtyByCat) || {}
  })
  return out
}

async function buildUnitsFromOrders(
  supabase: SupabaseClient,
  truckId: string,
  eventDate: string
): Promise<ProductionSlotUnits> {
  const [timeMap, { data: orders }, { data: menuItems }, { data: categories }] = await Promise.all([
    fetchCollectionTimeMap(supabase, truckId),
    supabase
      .from('orders')
      .select('slot, items')
      .eq('truck_id', truckId)
      .eq('event_date', eventDate)
      .in('status', ['pending', 'confirmed', 'modified'])
      .not('slot', 'is', null),
    supabase.from('menu_items_db').select('name, category_id').eq('truck_id', truckId),
    supabase.from('menu_categories').select('id, name').eq('truck_id', truckId),
  ])

  const itemCatMap: Record<string, string> = {}
  ;(menuItems || []).forEach(item => {
    const cat = categories?.find(c => c.id === item.category_id)
    if (cat) itemCatMap[item.name] = cat.name.toLowerCase()
  })

  const out: ProductionSlotUnits = {}
  ;(orders || []).forEach(order => {
    if (!order.slot) return
    const productionSlot = timeMap[order.slot] || order.slot
    const items = Array.isArray(order.items) ? order.items : []
    const delta = orderItemsToQtyByCat(items, itemCatMap)
    out[productionSlot] = mergeQtyByCat(out[productionSlot] || {}, delta)
  })
  return out
}

async function syncProductionSlotUsage(
  supabase: SupabaseClient,
  truckId: string,
  eventDate: string,
  units: ProductionSlotUnits
) {
  const rows = Object.entries(units).map(([production_slot, units_by_cat]) => ({
    truck_id: truckId,
    event_date: eventDate,
    production_slot,
    units_by_cat,
    updated_at: new Date().toISOString(),
  }))
  if (!rows.length) return
  await supabase.from('production_slot_usage').upsert(rows, {
    onConflict: 'truck_id,event_date,production_slot',
  })
}

async function upsertProductionSlotUnits(
  supabase: SupabaseClient,
  truckId: string,
  eventDate: string,
  productionSlot: string,
  units: QtyByCat
) {
  const { error } = await supabase.from('production_slot_usage').upsert(
    {
      truck_id: truckId,
      event_date: eventDate,
      production_slot: productionSlot,
      units_by_cat: units,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'truck_id,event_date,production_slot' }
  )
  if (error) console.error('[production_slot_usage] upsert failed:', error.message)
}

/** Batch count per collection_time (for slot picker UI). */
export async function getBatchCountsByCollectionTime(
  supabase: SupabaseClient,
  truckId: string,
  eventDate: string,
  collectionTimes: { collection_time: string; production_slot: string }[],
  catConfigs: Record<string, CatConfig>
): Promise<Record<string, number>> {
  const slotUnits = await getProductionSlotUnits(supabase, truckId, eventDate)
  const counts: Record<string, number> = {}
  collectionTimes.forEach(t => {
    const units = slotUnits[t.production_slot] || {}
    counts[t.collection_time] = totalBatchesForQtyByCat(units, catConfigs)
  })
  return counts
}

/** Add an order's items to its production window. */
export async function addOrderToProductionSlot(
  supabase: SupabaseClient,
  truckId: string,
  eventDate: string,
  collectionTime: string,
  items: { name: string; quantity: number }[],
  itemCatMap: Record<string, string>
) {
  if (!collectionTime || !items.length) return
  const timeMap = await fetchCollectionTimeMap(supabase, truckId)
  const productionSlot = timeMap[collectionTime] || collectionTime
  const slotUnits = await getProductionSlotUnits(supabase, truckId, eventDate)
  const current = slotUnits[productionSlot] || {}
  const merged = mergeQtyByCat(current, orderItemsToQtyByCat(items, itemCatMap))
  await upsertProductionSlotUnits(supabase, truckId, eventDate, productionSlot, merged)
}

/** Remove an order's items from its production window. */
export async function removeOrderFromProductionSlot(
  supabase: SupabaseClient,
  truckId: string,
  eventDate: string,
  collectionTime: string,
  items: { name: string; quantity: number }[],
  itemCatMap: Record<string, string>
) {
  if (!collectionTime || !items.length) return
  const timeMap = await fetchCollectionTimeMap(supabase, truckId)
  const productionSlot = timeMap[collectionTime] || collectionTime
  const slotUnits = await getProductionSlotUnits(supabase, truckId, eventDate)
  const current = slotUnits[productionSlot] || {}
  const delta = orderItemsToQtyByCat(items, itemCatMap)
  const next = subtractQtyByCat(current, delta)
  await upsertProductionSlotUnits(supabase, truckId, eventDate, productionSlot, next)
}

/** @deprecated Use getBatchCountsByCollectionTime — kept for gradual migration */
export async function getSlotBookingCounts(
  supabase: SupabaseClient,
  truckId: string,
  eventDate: string,
  collectionTimes?: { collection_time: string; production_slot: string }[],
  catConfigs?: Record<string, CatConfig>
): Promise<Record<string, number>> {
  if (collectionTimes?.length && catConfigs) {
    return getBatchCountsByCollectionTime(supabase, truckId, eventDate, collectionTimes, catConfigs)
  }
  // Legacy fallback: order count per slot
  const { data } = await supabase
    .from('orders')
    .select('slot')
    .eq('truck_id', truckId)
    .eq('event_date', eventDate)
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
  eventDate: string,
  collectionTime: string,
  items?: { name: string; quantity: number }[],
  itemCatMap?: Record<string, string>
) {
  if (items?.length && itemCatMap) {
    await addOrderToProductionSlot(supabase, truckId, eventDate, collectionTime, items, itemCatMap)
    return
  }
}

/** @deprecated */
export async function decrementSlotBooking(
  supabase: SupabaseClient,
  truckId: string,
  eventDate: string,
  collectionTime: string,
  items?: { name: string; quantity: number }[],
  itemCatMap?: Record<string, string>
) {
  if (items?.length && itemCatMap) {
    await removeOrderFromProductionSlot(supabase, truckId, eventDate, collectionTime, items, itemCatMap)
  }
}

export async function moveSlotBooking(
  supabase: SupabaseClient,
  truckId: string,
  eventDate: string,
  fromSlot: string | null,
  toSlot: string | null,
  items: { name: string; quantity: number }[],
  itemCatMap: Record<string, string>
) {
  if (fromSlot && fromSlot !== toSlot) {
    await removeOrderFromProductionSlot(supabase, truckId, eventDate, fromSlot, items, itemCatMap)
  }
  if (toSlot && fromSlot !== toSlot) {
    await addOrderToProductionSlot(supabase, truckId, eventDate, toSlot, items, itemCatMap)
  }
}
