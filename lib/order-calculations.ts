// lib/order-calculations.ts
// SINGLE SOURCE OF TRUTH for all order calculations
// Used by: customer order form, truck dashboard, server-side validation

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
    
    // 2. Calculate deals total (what customer pays for deals)
    const dealsTotal = deals.reduce((sum, deal) => {
      return sum + deal.bundle.bundle_price
    }, 0)
    
    // 3. Calculate deal savings (original price - deal price)
    const dealSavings = deals.reduce((sum, deal) => {
      // If bundle has fixed original_price, use it
      if (deal.bundle.original_price && deal.bundle.original_price > 0) {
        const saving = deal.bundle.original_price - deal.bundle.bundle_price
        return sum + Math.max(0, saving)
      }
      
      // Otherwise calculate from selected items
      const originalPrice = calculateDealOriginalPrice(deal.slots, menuItems)
      const saving = originalPrice - deal.bundle.bundle_price
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
   * Validate that submitted order totals match server-side calculation
   * 
   * @param submitted - Totals submitted by client
   * @param calculated - Server-calculated totals
   * @param tolerance - Maximum allowed difference in pounds (default £0.01)
   * @returns true if totals match within tolerance
   */
  export function validateOrderTotals(
    submitted: { subtotal: number; discountAmt: number; total: number },
    calculated: OrderCalculation,
    tolerance: number = 0.01
  ): { valid: boolean; error?: string } {
    // Check subtotal
    const subtotalDiff = Math.abs(submitted.subtotal - calculated.subtotal)
    if (subtotalDiff > tolerance) {
      return {
        valid: false,
        error: `Subtotal mismatch: submitted £${submitted.subtotal.toFixed(2)}, calculated £${calculated.subtotal.toFixed(2)}`
      }
    }
    
    // Check discount amount
    const discountDiff = Math.abs(submitted.discountAmt - calculated.discountAmt)
    if (discountDiff > tolerance) {
      return {
        valid: false,
        error: `Discount mismatch: submitted £${submitted.discountAmt.toFixed(2)}, calculated £${calculated.discountAmt.toFixed(2)}`
      }
    }
    
    // Check total
    const totalDiff = Math.abs(submitted.total - calculated.total)
    if (totalDiff > tolerance) {
      return {
        valid: false,
        error: `Total mismatch: submitted £${submitted.total.toFixed(2)}, calculated £${calculated.total.toFixed(2)}`
      }
    }
    
    return { valid: true }
  }