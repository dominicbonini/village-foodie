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
    image?: string | null
  }
  
  export interface Deal {
    bundle: any
    slots: Record<string, string>
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
   * (When item is removed from basket, any deals using it become invalid)
   * 
   * @param deals - Current applied deals
   * @param itemName - Name of item that was removed
   * @returns Deals that don't reference the removed item
   */
  export function cleanupDealsForItem(
    deals: Deal[],
    itemName: string
  ): Deal[] {
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