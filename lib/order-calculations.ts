// lib/order-calculations.ts
// SINGLE SOURCE OF TRUTH for all order calculations
// Used by: customer order form, truck dashboard, server-side validation

/** Format modifier names with upcharge prices for cart line display.
 *  e.g. [{name:'Extra Cheese',price:1.5}] → "Extra Cheese +£1.50" */
export function formatModifiers(modifiers: { name: string; price: number }[]): string {
  return modifiers.map(m => m.price > 0 ? `${m.name} +£${m.price.toFixed(2)}` : m.name).join(', ')
}

export interface OrderItem {
    name: string
    price: number
    quantity: number
  }
  
  export interface MenuItem {
    name: string
    price: number
  }
  
  export interface AppliedDeal {
    bundle: {
      name: string
      bundle_price: number
      original_price?: number | null
    }
    slots: Record<string, string>
    modifierExtra?: number
  }
  
  export interface DiscountCode {
    code: string
    type: 'pct' | 'fixed'
    value: number
  }
  
  export interface OrderCalculation {
    itemsTotal: number      // Total of individual items in basket
    dealsTotal: number      // Total price of all deals
    dealSavings: number     // How much was saved by using deals
    subtotal: number        // itemsTotal + dealsTotal
    discountAmt: number     // Discount code amount
    total: number           // Final amount to pay
  }
  
  /**
   * Calculate the original price of items in a deal
   * (what they would cost if purchased individually)
   */
  export function calculateDealOriginalPrice(
    slots: Record<string, string>,
    menuItems: MenuItem[]
  ): number {
    return Object.values(slots).reduce((sum, itemName) => {
      if (!itemName) return sum
      const item = menuItems.find(i => i.name === itemName)
      return sum + (item?.price || 0)
    }, 0)
  }
  
  /**
   * SINGLE SOURCE OF TRUTH for order calculations
   * 
   * This function is used by:
   * - Customer order form (frontend)
   * - Truck dashboard manual orders (frontend)
   * - Server-side validation (backend)
   * 
   * @param items - Individual items in basket
   * @param deals - Applied meal deals
   * @param menuItems - Full menu for price lookup
   * @param discountCode - Optional discount code
   * @returns Complete breakdown of order totals
   */
  export function calculateOrderTotal(
    items: OrderItem[],
    deals: AppliedDeal[],
    menuItems: MenuItem[],
    discountCode?: DiscountCode | null
  ): OrderCalculation {
    // 1. Calculate items subtotal (individual items, not in deals)
    const itemsTotal = items.reduce((sum, item) => {
      return sum + (item.price * item.quantity)
    }, 0)
    
    // 2. Calculate deals total (what customer pays for deals, including modifier pass-through)
    const dealsTotal = deals.reduce((sum, deal) => {
      return sum + deal.bundle.bundle_price + (deal.modifierExtra || 0)
    }, 0)

    // 3. Calculate deal savings (original price - effective deal price)
    const dealSavings = deals.reduce((sum, deal) => {
      const effectivePrice = deal.bundle.bundle_price + (deal.modifierExtra || 0)
      // If bundle has fixed original_price, use it
      if (deal.bundle.original_price && deal.bundle.original_price > 0) {
        const saving = deal.bundle.original_price - effectivePrice
        return sum + Math.max(0, saving)
      }

      // Otherwise calculate from selected items
      const originalPrice = calculateDealOriginalPrice(deal.slots, menuItems)
      const saving = originalPrice - effectivePrice
      return sum + Math.max(0, saving)
    }, 0)
    
    // 4. Calculate subtotal (before discount codes)
    const subtotal = itemsTotal + dealsTotal
    
    // 5. Calculate discount code amount
    let discountAmt = 0
    if (discountCode) {
      if (discountCode.type === 'pct') {
        // Percentage discount
        discountAmt = subtotal * (discountCode.value / 100)
      } else {
        // Fixed amount discount
        discountAmt = discountCode.value
      }
    }
    
    // 6. Calculate final total (can't be negative)
    const total = Math.max(0, subtotal - discountAmt)
    
    return {
      itemsTotal,
      dealsTotal,
      dealSavings,
      subtotal,
      discountAmt,
      total
    }
  }
  
  /**
   * REMOVED: validateOrderTotals.
   *
   * It compared the client's submitted subtotal/discountAmt/total against a server calculation and
   * rejected a mismatch over a 1p tolerance. It had ONE call site, in app/api/orders/submit, and it
   * never once rejected an order: the server side of the comparison was calculateOrderTotal(items),
   * which reads `item.price`, while the customer path sends `item.unit_price`. Every line summed to
   * NaN, so every `Math.abs(submitted - NaN) > tolerance` was false and every order passed. It had been
   * blind for its entire life and looked, in the code, exactly like a working guard.
   *
   * There is nothing left for it to validate. Pricing is no longer a claim the client makes and the
   * server checks: the server resolves every price itself, from the menu, via lib/order-repricing, on
   * both order-creation paths. A comparison against a number nobody trusts is not a weaker guard than
   * before; it is a misleading one, and its presence is what stopped anyone looking.
   *
   * calculateOrderTotal itself STAYS and is used more than ever: the customer basket, the Add Order
   * panel, the dashboard edit modal and repriceOrder all combine money through it.
   */