// lib/stock-availability.ts
// Shared logic for enforcing stock limits after any order is placed.
// Reads live order counts from the orders table, then marks items /
// categories as sold-out when limits are reached.

type SupabaseClient = any

/** Tally item counts from a set of order rows, including deal slots. */
function tallyItemCounts(orders: any[]): Record<string, number> {
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
 * Count items ordered for a specific event from the orders table, including
 * deal slots. Event-scoped per the V6.4 invariant: counts belong to an event,
 * not a calendar day. Orders with a NULL event_id are excluded automatically
 * (NULL never equals a value).
 */
export async function getLiveItemCounts(
  supabase: SupabaseClient,
  truckId: string,
  eventId: string,
): Promise<Record<string, number>> {
  const { data: orders } = await supabase
    .from('orders')
    .select('items, deals')
    .eq('truck_id', truckId)
    .eq('event_id', eventId)
    .neq('status', 'cancelled')
    .neq('status', 'rejected')
  return tallyItemCounts(orders || [])
}

/**
 * After any order insertion, check live counts against the PER-EVENT effective ceiling and mark
 * exhausted items sold-out for THAT event only (event_item_stock.available=false). Event-scoped
 * (Phase 4): an exhausted event marks only itself — no cross-event bleed.
 *
 * Ceiling = event_item_stock.stock_count(eventId) ?? menu_items_db.default_stock, and category =
 * event_category_stock.stock_count(eventId) ?? menu_categories.default_stock — the SAME ceiling the
 * guard + menu API read (Phase 3b), with sold from getLiveItemCounts(truckId, eventId) (same eventId).
 * So enforce flips available=false at exactly the threshold the guard blocks at — no phantom, no gap.
 *
 * NO-CLOBBER: setting available=false must never alter stock_count. An EXISTING override row is
 * UPDATEd (available only); a NEW row is INSERTed with stock_count=null (no ceiling override → still
 * falls through to default_stock). stock_count is never written on the update path.
 *
 * itemCatMap: { itemName -> categoryName } — from buildItemCatMap.
 */
export async function enforceStockLimits(
  supabase: SupabaseClient,
  truckId: string,
  eventId: string,
  itemCatMap: Record<string, string>,
): Promise<void> {
  if (!eventId) return // event-scoped: nothing to enforce without an event

  const [sold, { data: menuItems }, { data: menuCats }, { data: overrides }, { data: catStock }] =
    await Promise.all([
      getLiveItemCounts(supabase, truckId, eventId),
      supabase.from('menu_items_db').select('name, default_stock').eq('truck_id', truckId).eq('is_active', true),
      supabase.from('menu_categories').select('name, default_stock').eq('truck_id', truckId),
      supabase.from('event_item_stock').select('item_name, stock_count, available, no_item_cap').eq('truck_id', truckId).eq('event_id', eventId),
      supabase.from('event_category_stock').select('category, stock_count, available').eq('truck_id', truckId).eq('event_id', eventId),
    ])

  // Per-event override maps (keyed by name; also tells us which items already have a row → UPDATE vs INSERT).
  const itemOverride: Record<string, { stock_count: number | null; available: boolean; no_item_cap: boolean }> = {}
  ;(overrides || []).forEach((o: any) => { itemOverride[o.item_name] = { stock_count: o.stock_count ?? null, available: o.available, no_item_cap: !!o.no_item_cap } })
  const catOverride: Record<string, number | null> = {}
  // Per-event category OFF (GATE): the disabled state is handled by the menu-hide + submit gate; the
  // sweep must NOT bulk-write item rows for an OFF category (that would strand items available=false on
  // reopen — the lossy behaviour GATE exists to avoid). Collect them and skip the category pass below.
  const catDisabled = new Set<string>()
  ;(catStock || []).forEach((r: any) => {
    const k = String(r.category).toLowerCase()
    catOverride[k] = r.stock_count ?? null
    if (r.available === false) catDisabled.add(k)
  })

  // Effective ceilings — IDENTICAL to the guard/menu (override ?? default). null = unlimited.
  // no_item_cap = "follow category" → item ceiling null (no cap), overriding the default.
  const itemDefault: Record<string, number | null> = {}
  ;(menuItems || []).forEach((i: any) => { itemDefault[i.name] = i.default_stock ?? null })
  const itemCeiling = (name: string): number | null => {
    const ov = itemOverride[name]
    if (ov?.no_item_cap) return null
    return ov && ov.stock_count != null ? ov.stock_count : (itemDefault[name] ?? null)
  }
  const catDefault: Record<string, number | null> = {}
  ;(menuCats || []).forEach((c: any) => { catDefault[String(c.name).toLowerCase()] = c.default_stock ?? null })
  const catCeiling = (cat: string): number | null =>
    cat in catOverride && catOverride[cat] != null ? catOverride[cat] : (catDefault[cat] ?? null)

  // Sold per category (deal-inclusive — every ordered item mapped to its category).
  const soldByCat: Record<string, number> = {}
  for (const [name, qty] of Object.entries(sold)) {
    const c = (itemCatMap[name] || '').toLowerCase()
    if (c) soldByCat[c] = (soldByCat[c] || 0) + (qty as number)
  }

  // Mark a single item sold-out for THIS event — no-clobber: UPDATE available only when a row exists,
  // else INSERT with stock_count=null (no ceiling override). Skip if already false.
  const markUnavailable = async (name: string) => {
    const ov = itemOverride[name]
    if (ov) {
      if (ov.available === false) return
      await supabase.from('event_item_stock')
        .update({ available: false })
        .eq('truck_id', truckId).eq('event_id', eventId).eq('item_name', name)
    } else {
      await supabase.from('event_item_stock')
        .insert({ truck_id: truckId, event_id: eventId, item_name: name, available: false, stock_count: null })
      itemOverride[name] = { stock_count: null, available: false, no_item_cap: false } // dedupe within this run (category pass)
    }
  }

  // Item-level: exhausted (finite ceiling reached) → sold-out for this event.
  for (const i of menuItems || []) {
    const ceiling = itemCeiling(i.name)
    if (ceiling != null && (sold[i.name] || 0) >= ceiling) await markUnavailable(i.name)
  }

  // Category-level: category exhausted → mark every item in that category unavailable for this event.
  for (const c of menuCats || []) {
    const cat = String(c.name).toLowerCase()
    if (catDisabled.has(cat)) continue   // OFF category — GATE handles hiding; don't sweep-mark its items (lossy on reopen)
    const ceiling = catCeiling(cat)
    if (ceiling != null && (soldByCat[cat] || 0) >= ceiling) {
      for (const i of menuItems || []) {
        if ((itemCatMap[i.name] || '').toLowerCase() === cat) await markUnavailable(i.name)
      }
    }
  }
}
