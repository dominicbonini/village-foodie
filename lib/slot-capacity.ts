// lib/slot-capacity.ts
// Batch-based production slot capacity (batch_size + prep time from menu categories).

import { getCatConfig, type CatConfig } from '@/lib/prep-utils'
import { normaliseOrderLines } from '@/lib/slot-bookings'

export type QtyByCat = Record<string, number>

export function orderItemsToQtyByCat(
  items: { name: string; quantity: number }[],
  itemCatMap: Record<string, string>
): QtyByCat {
  const byCat: QtyByCat = {}
  items.forEach(i => {
    const cat = (itemCatMap[i.name] || 'mains').toLowerCase()
    byCat[cat] = (byCat[cat] || 0) + (parseInt(String(i.quantity)) || 1)
  })
  return byCat
}

// ── OFFLINE advisory occupancy — SHARED by the day strip (displaySlots) AND the Add-Order picker ──────
// Client-side mirror of the server's buildUnitsFromOrders: rebuild the window→qtyByCat occupancy FROM ORDERS
// (base = {}, not the frozen server blob — so offline STATUS changes are reflected). Source = server orders +
// not-yet-synced offline creates (deduped by order_key, event-scoped); apply the overlay-aware status + the
// engine's OCCUPYING filter (pending/confirmed/modified/cooking occupy; ready/collected/cancelled/rejected
// release). One fold, so the strip and the picker can never diverge. Advisory offline — server stays
// authoritative on reconnect (oversell detection = CapacityBreachBanner).
type OccupancyOrder = { order_key: string; slot?: string | null; status?: string; event_id?: string | null; items?: unknown; deals?: unknown }
export function buildOfflineOccupancy(args: {
  slots: { collection_time?: string; production_window_key?: string }[]
  serverOrders: OccupancyOrder[]
  queuedOrders: OccupancyOrder[]
  statusFor: (o: OccupancyOrder) => string | undefined
  eventId: string
  eventStart: string
  itemCategoryMap: Record<string, string>
}): Record<string, QtyByCat> {
  const { slots, serverOrders, queuedOrders, statusFor, eventId, eventStart, itemCategoryMap } = args
  const OCCUPYING = ['pending', 'confirmed', 'modified', 'cooking']
  const syncedKeys = new Set(serverOrders.map(o => o.order_key))
  const source = [...serverOrders, ...queuedOrders.filter(o => o && !syncedKeys.has(o.order_key))]
    .filter(o => o && o.event_id === eventId)
  const timeMap: Record<string, string> = {}
  slots.forEach(s => { if (s?.collection_time) timeMap[s.collection_time] = s.production_window_key || s.collection_time })
  const merged: Record<string, QtyByCat> = {}
  source.forEach(o => {
    const status = statusFor(o)
    if (!status || !OCCUPYING.includes(status)) return
    const ct = o.slot || eventStart
    if (!ct) return
    const ps = timeMap[ct] || ct
    const lines = normaliseOrderLines((o.items as Array<{ name: string; quantity: number | string }>) || [], o.deals as Array<{ slots?: Record<string, unknown> }> | null | undefined)
    const delta = orderItemsToQtyByCat(lines, itemCategoryMap || {})
    merged[ps] = mergeQtyByCat(merged[ps] || {}, delta)
  })
  return merged
}

export function mergeQtyByCat(a: QtyByCat, b: QtyByCat): QtyByCat {
  const out = { ...a }
  Object.entries(b).forEach(([cat, qty]) => {
    out[cat] = (out[cat] || 0) + qty
  })
  return out
}

export function subtractQtyByCat(a: QtyByCat, b: QtyByCat): QtyByCat {
  const out = { ...a }
  Object.entries(b).forEach(([cat, qty]) => {
    out[cat] = Math.max(0, (out[cat] || 0) - qty)
  })
  return out
}

/** Oven cycles needed for a quantity in one category. */
export function qtyToBatches(qty: number, batchSize: number): number {
  if (qty <= 0) return 0
  const batch = Math.max(1, batchSize)
  return Math.ceil(qty / batch)
}

/**
 * Batches required across prep categories (pizza, burgers, etc.).
 * Uses the highest batch count — matches dashboard prep list logic.
 */
export function totalBatchesForQtyByCat(
  qtyByCat: QtyByCat,
  catConfigs: Record<string, CatConfig>
): number {
  let maxBatches = 0
  Object.entries(qtyByCat).forEach(([cat, qty]) => {
    const cfg = catConfigs[cat.toLowerCase()] ?? getCatConfig(cat)
    // Skip instant categories — they don't consume kitchen capacity
    if (!cfg.secs || cfg.secs === 0) return
    const batches = Math.ceil(qty / cfg.batch)
    if (batches > maxBatches) maxBatches = batches
  })
  return maxBatches
}

/** Can this order fit in a production window that already has `existingUnits`? */
export function canFitInProductionSlot(
  existingUnits: QtyByCat,
  newItems: { name: string; quantity: number }[],
  itemCatMap: Record<string, string>,
  maxBatches: number,
  catConfigs: Record<string, CatConfig>,
  softCapRatio = 0.85
): boolean {
  const softMax = Math.max(1, Math.floor(maxBatches * softCapRatio))
  const merged = mergeQtyByCat(existingUnits, orderItemsToQtyByCat(newItems, itemCatMap))
  return totalBatchesForQtyByCat(merged, catConfigs) <= softMax
}
