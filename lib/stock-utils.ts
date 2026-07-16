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

/**
 * How many MORE of an item you can add, given the in-progress basket — the ONE rule shared by the
 * customer page, the operator Add-Order panel, and (by construction) the submit gate. Mirrors
 * checkCeilingShortfall (lib/stock-guard.ts): an item can breach EITHER its own cap or its category's
 * SHARED cap, so `addable` = the min, across the non-null axes, of (committed-remaining − basket-so-far):
 *
 *   itemAddable = itemRem === null ? null : itemRem − itemBasketQty     // this exact item
 *   catAddable  = catRem  === null ? null : catRem  − catBasketQty      // the whole category (deal slots folded)
 *   addable     = min of the non-null ones  (null = unlimited on that axis; both null = no cap anywhere)
 *
 * itemRem/catRem are the CEILING minus COMMITTED (other live orders) — exactly what the menu API and the
 * operator's calcStockRemaining produce. The basket totals are THIS order in progress. Clamped to 0.
 * So `addable <= 0` ⟺ the `+` is disabled ⟺ checkCeilingShortfall would reject one more unit. `bound`
 * names the axis that produced the min (for badge copy); null when unlimited. Ties resolve to 'item'
 * (mirrors calcEffectiveRemaining's min tie-break).
 */
export function calcAddableRemaining(args: {
  itemRem: number | null
  catRem: number | null
  itemBasketQty: number
  catBasketQty: number
}): { addable: number | null; bound: 'item' | 'category' | null } {
  const { itemRem, catRem, itemBasketQty, catBasketQty } = args
  const itemAddable = itemRem === null ? null : Math.max(0, itemRem - itemBasketQty)
  const catAddable = catRem === null ? null : Math.max(0, catRem - catBasketQty)
  if (itemAddable === null && catAddable === null) return { addable: null, bound: null }
  if (itemAddable === null) return { addable: catAddable, bound: 'category' }
  if (catAddable === null) return { addable: itemAddable, bound: 'item' }
  return catAddable < itemAddable
    ? { addable: catAddable, bound: 'category' }
    : { addable: itemAddable, bound: 'item' }
}
