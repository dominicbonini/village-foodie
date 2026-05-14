// lib/deal-utils.ts
// Shared deal logic for both truck dashboard and customer order form

export interface BundleSlot {
    slot_1_category: string | null
    slot_2_category: string | null
    slot_3_category: string | null
    slot_4_category: string | null
    slot_5_category: string | null
    slot_6_category: string | null
  }
  
  export interface MenuItem {
    name: string
    category: string
    price: number
    [key: string]: any
  }
  
  export interface BasketItem {
    name?: string
    menuItem?: MenuItem
    quantity?: number
    [key: string]: any
  }
  
  /**
   * Get non-null slot categories from a bundle
   */
  export function getBundleSlotCategories(bundle: BundleSlot): string[] {
    return [
      bundle.slot_1_category,
      bundle.slot_2_category,
      bundle.slot_3_category,
      bundle.slot_4_category,
      bundle.slot_5_category,
      bundle.slot_6_category,
    ].filter((c): c is string => c !== null)
  }
  
  /**
   * Get items from menu that match a given category
   */
  export function getItemsForCategory(category: string, menuItems: MenuItem[]): MenuItem[] {
    return menuItems.filter(item => item.category === category)
  }
  
  /**
   * Check if basket has at least one item from a given category
   */
  export function hasItemInCategory(category: string, basketItems: BasketItem[], menuItems: MenuItem[]): boolean {
    return basketItems.some(b => {
      const itemName = b.name || b.menuItem?.name
      if (!itemName) return false
      const menuItem = menuItems.find(m => m.name === itemName)
      return menuItem?.category === category
    })
  }
  
  /**
   * Auto-prefill deal slots from basket items where possible
   * Returns a map of slot keys (slot_1, slot_2, etc) to item names
   */
  export function prefillSlotsFromBasket(
    bundle: BundleSlot,
    basketItems: BasketItem[],
    menuItems: MenuItem[]
  ): Record<string, string> {
    const prefill: Record<string, string> = {}
    const slotKeys: (keyof BundleSlot)[] = [
      'slot_1_category',
      'slot_2_category',
      'slot_3_category',
      'slot_4_category',
      'slot_5_category',
      'slot_6_category',
    ]
  
    slotKeys.forEach((slotKey, idx) => {
      const category = bundle[slotKey]
      if (!category) return
  
      const matchInBasket = basketItems.find(b => {
        const itemName = b.name || b.menuItem?.name
        if (!itemName) return false
        const menuItem = menuItems.find(m => m.name === itemName)
        return menuItem?.category === category
      })
  
      if (matchInBasket) {
        const itemName = matchInBasket.name || matchInBasket.menuItem?.name
        if (itemName) prefill[`slot_${idx + 1}`] = itemName
      }
    })
  
    return prefill
  }
  
  /**
   * Calculate how many deals can be applied based on basket contents
   * Returns the maximum number of this deal that can be added
   */
  export function maxDealsApplicable(
    bundle: BundleSlot,
    basketItems: BasketItem[],
    menuItems: MenuItem[]
  ): number {
    const slots = getBundleSlotCategories(bundle)
    if (slots.length === 0) return 0
  
    // For each required category, count how many eligible items are in basket
    const categoryItemCounts = slots.map(cat => {
      return basketItems.reduce((count, b) => {
        const itemName = b.name || b.menuItem?.name
        if (!itemName) return count
        const menuItem = menuItems.find(m => m.name === itemName)
        const qty = b.quantity || 1
        return menuItem?.category === cat ? count + qty : count
      }, 0)
    })
  
    // The max deals is limited by the category with the fewest items
    return Math.min(...categoryItemCounts)
  }
  
  /**
   * Check if all slots in a deal are filled
   */
  export function isDealComplete(
    bundle: BundleSlot,
    slotSelections: Record<string, string>
  ): boolean {
    const slots = getBundleSlotCategories(bundle)
    return slots.every((cat, idx) => {
      const slotKey = `slot_${idx + 1}`
      return !!slotSelections[slotKey]
    })
  }
  
  /**
   * Calculate the original price of items selected for a deal
   */
  export function calculateDealOriginalPrice(
    slotSelections: Record<string, string>,
    menuItems: MenuItem[]
  ): number {
    return Object.values(slotSelections).reduce((sum, itemName) => {
      const item = menuItems.find(m => m.name === itemName)
      return sum + (item?.price || 0)
    }, 0)
  }
  