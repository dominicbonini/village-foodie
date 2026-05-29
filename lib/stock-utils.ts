/** Net remaining stock. Returns null when no limit is set. Clamps to 0 (never negative). */
export function calcStockRemaining(stockCount: number | null, ordersCount: number): number | null {
  return stockCount !== null ? Math.max(0, stockCount - ordersCount) : null
}

/** Effective remaining = min(item-level, category-level), either can be null (unlimited). */
export function calcEffectiveRemaining(
  itemRem: number | null,
  catRem: number | null,
): number | null {
  if (itemRem !== null && catRem !== null) return Math.min(itemRem, catRem)
  return itemRem ?? catRem
}
