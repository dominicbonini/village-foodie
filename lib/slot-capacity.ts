// lib/slot-capacity.ts
// Batch-based production slot capacity (batch_size + prep time from menu categories).

import { getCatConfig, type CatConfig } from '@/lib/prep-utils'

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
    const cfg = getCatConfig(cat, catConfigs)
    if (!cfg.secs) return
    const b = qtyToBatches(qty, cfg.batch)
    if (b > maxBatches) maxBatches = b
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
