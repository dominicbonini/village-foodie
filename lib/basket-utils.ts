// lib/basket-utils.ts
// SINGLE SOURCE OF TRUTH for basket/order item manipulation
// Used by: customer order form, truck dashboard manual orders

export interface BasketItem {
  name: string
  quantity: number
  unit_price: number
}

export interface MenuItem {
  name: string
  price: number
  category: string
  description?: string
  available?: boolean
  stock_remaining?: number | null
  default_stock?: number | null
  image?: string | null
  photo_url?: string | null
  allergens?: string[]
  dietary?: string[]
}

export interface Deal {
  bundle: any
  slots: Record<string, string>
}

/**
 * SINGLE SOURCE for "is this basket/order non-empty?". An order counts as non-empty
 * when it has standalone items OR at least one deal — deals are real content too.
 * Shared by the Add Order panel (Confirm-enable) and the Edit Order modal (Save-enable)
 * so the two can never diverge on item-vs-deal counting. Length-only so it accepts any
 * item/deal array shape from either surface.
 */
export function isOrderNonEmpty(
  items: { length: number } | null | undefined,
  deals: { length: number } | null | undefined
): boolean {
  return (items?.length ?? 0) > 0 || (deals?.length ?? 0) > 0
}

/**
 * The basket cartKeys a deal consumed, one entry per consuming slot. DealsModal emits
 * `USE_EXISTING:<cartKey>` in rawSlots for each "(in basket)" slot (unit suffix already
 * stripped), so a line consumed into N slots appears N times. Used as a deal's
 * itemsTakenFromBasket record. SINGLE SOURCE — all three apply surfaces derive it here.
 */
export function dealConsumedCartKeys(rawSlots: Record<string, string> | null | undefined): string[] {
  return Object.values(rawSlots || {})
    .filter((r): r is string => typeof r === 'string' && r.startsWith('USE_EXISTING:'))
    .map(r => r.slice('USE_EXISTING:'.length))
    .filter(Boolean)
}

/**
 * Remove the standalone basket lines a deal consumed (the "(in basket)" slots), so an
 * in-basket deal doesn't double-count those items. QUANTITY-AWARE: a line consumed N
 * times drops by N units and is removed only at 0 — consuming 2 of a qty-3 line leaves
 * qty 1 (NOT the whole line). Keyed by cartKey (every manual/edit/customer basket line
 * carries one; DealsModal references lines by cartKey). Returns the items unchanged when
 * the deal took nothing from the basket. SINGLE SOURCE for the consume across all three
 * apply handlers (Add Order, customer, edit) so they can't drift.
 */
export function consumeBasketItemsForDeal<T extends { cartKey?: string; quantity: number }>(
  items: T[],
  rawSlots: Record<string, string> | null | undefined,
): T[] {
  const consumed: Record<string, number> = {}
  for (const key of dealConsumedCartKeys(rawSlots)) consumed[key] = (consumed[key] || 0) + 1
  if (!Object.keys(consumed).length) return items
  return items.flatMap(item => {
    const take = item.cartKey ? (consumed[item.cartKey] || 0) : 0
    if (take <= 0) return [item]
    const qty = item.quantity - take
    return qty > 0 ? [{ ...item, quantity: qty }] : []
  })
}

/**
 * Add item to basket, increment quantity if already exists
 * 
 * @param basket - Current basket items
 * @param item - Menu item to add
 * @returns Updated basket
 */
export function addToBasket(
  basket: BasketItem[],
  item: MenuItem
): BasketItem[] {
  const existing = basket.find(b => b.name === item.name)
  
  // Stock check: don't allow adding if at stock limit
  if (item.stock_remaining != null && existing && existing.quantity >= item.stock_remaining) {
    return basket // Return unchanged
  }
  
  // If exists, increment quantity
  if (existing) {
    return basket.map(b => 
      b.name === item.name 
        ? { ...b, quantity: b.quantity + 1 } 
        : b
    )
  }
  
  // Otherwise add new item
  return [...basket, { 
    name: item.name, 
    quantity: 1, 
    unit_price: item.price 
  }]
}

/**
 * Remove item from basket (decrement if qty > 1, remove if qty = 1)
 * 
 * @param basket - Current basket items
 * @param itemName - Name of item to remove
 * @returns Updated basket
 */
export function removeFromBasket(
  basket: BasketItem[],
  itemName: string
): BasketItem[] {
  const existing = basket.find(b => b.name === itemName)
  if (!existing) return basket
  
  // If quantity is 1, remove completely
  if (existing.quantity === 1) {
    return basket.filter(b => b.name !== itemName)
  }
  
  // Otherwise decrement quantity
  return basket.map(b => 
    b.name === itemName 
      ? { ...b, quantity: b.quantity - 1 } 
      : b
  )
}

/**
 * Adjust item quantity by delta (can be positive or negative)
 * Removes item if quantity reaches 0
 * 
 * @param basket - Current basket items
 * @param itemName - Name of item to adjust
 * @param delta - Amount to change (e.g., +1, -1, +5)
 * @returns Updated basket
 */
export function adjustQuantity(
  basket: BasketItem[],
  itemName: string,
  delta: number
): BasketItem[] {
  return basket
    .map(b => 
      b.name === itemName 
        ? { ...b, quantity: b.quantity + delta } 
        : b
    )
    .filter(b => b.quantity > 0) // Remove items with 0 or negative quantity
}

/**
 * Remove deals that reference a deleted item
 * Generic so it preserves the full deal type (AppliedDeal, not just Deal)
 */
export function cleanupDealsForItem<T extends Deal>(
  deals: T[],
  itemName: string
): T[] {
  return deals.filter(deal => 
    !Object.values(deal.slots).includes(itemName)
  )
}

/**
 * Group menu items by category
 * 
 * @param items - Menu items to group
 * @param orderedCategories - Optional ordered list of category names to preserve sort order
 * @returns Array of [categoryName, items[]] tuples
 */
export function groupByCategory(
  items: MenuItem[],
  orderedCategories?: string[]
): Array<[string, MenuItem[]]> {
  const groups: Record<string, MenuItem[]> = {}
  
  items.forEach(item => {
    const category = item.category || 'Uncategorized'
    if (!groups[category]) {
      groups[category] = []
    }
    groups[category].push(item)
  })
  
  // If ordered categories provided, use that order
  if (orderedCategories && orderedCategories.length > 0) {
    const result: Array<[string, MenuItem[]]> = []
    
    // First add categories in the specified order
    orderedCategories.forEach(cat => {
      if (groups[cat]) {
        result.push([cat, groups[cat]])
      }
    })
    
    // Then add any remaining categories not in the ordered list
    Object.entries(groups).forEach(([cat, items]) => {
      if (!orderedCategories.includes(cat)) {
        result.push([cat, items])
      }
    })
    
    return result
  }
  
  // Otherwise return in arbitrary order (Object.entries order)
  return Object.entries(groups)
}

/**
 * Get quantity of a specific item in basket
 * 
 * @param basket - Current basket
 * @param itemName - Item name to check
 * @returns Quantity (0 if not in basket)
 */
export function getItemQuantity(
  basket: BasketItem[],
  itemName: string
): number {
  return basket.find(b => b.name === itemName)?.quantity || 0
}

/**
 * Check if item can be added (stock check)
 * 
 * @param basket - Current basket
 * @param item - Menu item to check
 * @returns true if can add, false if at stock limit
 */
export function canAddItem(
  basket: BasketItem[],
  item: MenuItem
): boolean {
  if (item.stock_remaining == null) return true // No stock limit
  
  const current = getItemQuantity(basket, item.name)
  return current < item.stock_remaining
}