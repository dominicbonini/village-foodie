// lib/stock-availability.ts
// Shared logic for enforcing stock limits after any order is placed.
// Reads live order counts from the orders table (event-scoped by date),
// then marks items / categories as sold-out when limits are reached.

type SupabaseClient = any

/** Count items ordered today from the orders table, including deal slots. */
export async function getLiveItemCounts(
  supabase: SupabaseClient,
  truckId: string,
  eventDate: string,
): Promise<Record<string, number>> {
  const { data: orders } = await supabase
    .from('orders')
    .select('items, deals')
    .eq('truck_id', truckId)
    .eq('event_date', eventDate)
    .neq('status', 'cancelled')
    .neq('status', 'rejected')

  const counts: Record<string, number> = {}
  for (const order of orders || []) {
    for (const item of order.items || []) {
      counts[item.name] = (counts[item.name] || 0) + (parseInt(item.quantity) || 1)
    }
    for (const deal of order.deals || []) {
      for (const itemName of Object.values(deal.slots || {})) {
        if (itemName) counts[itemName as string] = (counts[itemName as string] || 0) + 1
      }
    }
  }
  return counts
}

/**
 * After any order insertion, check live counts against item and category limits
 * and mark sold-out flags in item_overrides.
 * itemCatMap: { itemName -> categoryName } — from buildItemCatMap.
 */
export async function enforceStockLimits(
  supabase: SupabaseClient,
  truckId: string,
  eventDate: string,
  itemCatMap: Record<string, string>,
): Promise<void> {
  const [liveItemCounts, { data: itemLimits }, { data: catLimits }] = await Promise.all([
    getLiveItemCounts(supabase, truckId, eventDate),
    supabase
      .from('item_overrides')
      .select('item_name, stock_count, available')
      .eq('truck_id', truckId)
      .not('stock_count', 'is', null),
    supabase
      .from('category_stock')
      .select('category, stock_count')
      .eq('truck_id', truckId)
      .eq('date', eventDate)
      .not('stock_count', 'is', null),
  ])

  // Item-level: mark sold out when ordered >= limit
  for (const limit of itemLimits || []) {
    const ordered = liveItemCounts[limit.item_name] || 0
    if (ordered >= limit.stock_count && limit.available !== false) {
      await supabase
        .from('item_overrides')
        .update({ available: false })
        .eq('truck_id', truckId)
        .eq('item_name', limit.item_name)
    }
  }

  // Category-level: sum all items in category, mark category sold out
  for (const catLimit of catLimits || []) {
    let catOrdered = 0
    for (const [itemName, qty] of Object.entries(liveItemCounts)) {
      if ((itemCatMap[itemName] || '').toLowerCase() === catLimit.category.toLowerCase()) {
        catOrdered += qty
      }
    }
    if (catOrdered >= catLimit.stock_count) {
      // Mark every item in this category as unavailable
      await supabase
        .from('item_overrides')
        .update({ available: false })
        .eq('truck_id', truckId)
        .eq('category', catLimit.category)
    }
  }
}
