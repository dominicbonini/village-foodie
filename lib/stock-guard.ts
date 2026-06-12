// lib/stock-guard.ts
// SHARED atomic stock guard + per-event booking mutex. Used by BOTH the customer submit
// (/api/orders/submit) and the truck manual order (/api/dashboard/action) so the two paths
// enforce the SAME race-proof guarantee: no order inserts without holding the lock AND passing
// the stock check, so total sold can never exceed stock (the only oversell on the truck path is
// a deliberate, informed override — see /api/dashboard/action).

import { supabase } from '@/lib/supabase'
import { getLiveItemCounts } from '@/lib/stock-availability'
import { calcStockRemaining, calcEffectiveRemaining } from '@/lib/stock-utils'

// ── Per-EVENT mutex (booking_locks) — gap-free serialization ──────────────────
// One event-level lock per submit so the entire decide-and-book runs against a snapshot that
// already includes EVERY prior booking on the event. Acquire = INSERT (PK conflict = held);
// stale rows older than the TTL are reclaimed first so a leaked lock self-heals.
const LOCK_TTL_MS = 10_000      // a leaked lock self-heals after this
const LOCK_MAX_WAIT_MS = 1_000  // total acquire budget (absorbs the timing blip) before bail
const LOCK_RETRY_MS = 150
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Acquire the per-event booking lock. Acquire = INSERT into booking_locks; a PK conflict (23505)
 * means it's held — retry within the budget. Stale rows (older than LOCK_TTL_MS) are reclaimed
 * first, and the sweep only deletes rows OLDER than the TTL so a fresh lock is never stolen.
 * Returns true if acquired (caller MUST release in finally); false if contended past the budget
 * or errored — caller must then NOT insert (the no-oversell guarantee depends on holding it).
 */
export async function acquireEventLock(truckId: string, eventDate: string): Promise<boolean> {
  const deadline = Date.now() + LOCK_MAX_WAIT_MS
  for (;;) {
    await supabase
      .from('booking_locks')
      .delete()
      .eq('truck_id', truckId)
      .eq('event_date', eventDate)
      .lt('locked_at', new Date(Date.now() - LOCK_TTL_MS).toISOString())
    const { error } = await supabase
      .from('booking_locks')
      .insert({ truck_id: truckId, event_date: eventDate })
    if (!error) return true
    if (error.code !== '23505') {
      console.warn('[booking_locks] acquire error (failing safe — no insert):', error.message)
      return false
    }
    if (Date.now() >= deadline) return false
    await sleep(LOCK_RETRY_MS)
  }
}

export async function releaseEventLock(truckId: string, eventDate: string): Promise<void> {
  const { error } = await supabase
    .from('booking_locks')
    .delete()
    .eq('truck_id', truckId)
    .eq('event_date', eventDate)
  if (error) console.warn('[booking_locks] release failed (self-heals via TTL):', error.message)
}

/**
 * Atomic stock guard. Given the order's DEAL-INCLUSIVE lines (normaliseOrderLines — deal-slot
 * constituents already flattened in), return the items whose requested qty exceeds the CURRENT
 * effective remaining, or null if everything fits. Effective remaining = min(item, category):
 * item ceiling = event_item_stock.stock_count(eventId) ?? menu_items_db.default_stock; category
 * ceiling = event_category_stock.stock_count(eventId) ?? menu_categories.default_stock. The per-event
 * override is read for the SAME eventId that feeds getLiveItemCounts (sold) — ceiling and sold are
 * one event; a missing override row falls through to the live Settings default (never unlimited-by-
 * accident). "sold" is derived live via getLiveItemCounts (which tallies deal slots too), so an item
 * can't be oversold via a deal. MUST be called under the per-event lock so the read+insert is atomic.
 * null limits = unlimited (never blocks).
 */
export async function checkStockShortfall(
  truckId: string,
  eventId: string,
  eventDate: string,
  orderLines: { name: string; quantity: number }[],
  itemCatMap: Record<string, string>,
): Promise<{ name: string; remaining: number }[] | null> {
  // Ceiling = per-event override (event_item_stock / event_category_stock) ?? live Settings default.
  // The override is read for the SAME eventId that feeds getLiveItemCounts (sold) — so ceiling and
  // sold are scoped to one event (no cross-event bleed). A missing override row falls through to the
  // Settings default below; it never yields unlimited-by-accident.
  const [sold, { data: menuItems }, { data: menuCats }, { data: overrides }, { data: catStock }] = await Promise.all([
    getLiveItemCounts(supabase, truckId, eventId),
    supabase.from('menu_items_db').select('name, default_stock').eq('truck_id', truckId),
    supabase.from('menu_categories').select('name, default_stock').eq('truck_id', truckId),
    supabase.from('event_item_stock').select('item_name, stock_count, no_item_cap').eq('truck_id', truckId).eq('event_id', eventId),
    supabase.from('event_category_stock').select('category, stock_count').eq('truck_id', truckId).eq('event_id', eventId),
  ])

  // Ceilings (override/category_stock take precedence; fall back to the default_stock column).
  const itemDefault: Record<string, number | null> = {}
  ;(menuItems || []).forEach((i: any) => { itemDefault[i.name] = i.default_stock ?? null })
  const itemOverride: Record<string, number> = {}
  // no_item_cap = "follow category" → item ceiling resolves to null (no cap), overriding the default.
  const itemNoCap = new Set<string>()
  ;(overrides || []).forEach((o: any) => {
    if (o.no_item_cap) itemNoCap.add(o.item_name)
    else if (o.stock_count != null) itemOverride[o.item_name] = o.stock_count
  })
  const itemCeiling = (name: string): number | null =>
    itemNoCap.has(name) ? null : (name in itemOverride ? itemOverride[name] : (itemDefault[name] ?? null))

  const catDefault: Record<string, number | null> = {}
  ;(menuCats || []).forEach((c: any) => { catDefault[c.name.toLowerCase()] = c.default_stock ?? null })
  const catOverride: Record<string, number> = {}
  ;(catStock || []).forEach((r: any) => { if (r.stock_count != null) catOverride[r.category.toLowerCase()] = r.stock_count })
  const catCeiling = (cat: string): number | null =>
    cat in catOverride ? catOverride[cat] : (catDefault[cat] ?? null)

  // Sold per category (deal-inclusive — every ordered item, mapped to its category).
  const soldByCat: Record<string, number> = {}
  for (const [name, qty] of Object.entries(sold)) {
    const c = (itemCatMap[name] || '').toLowerCase()
    if (c) soldByCat[c] = (soldByCat[c] || 0) + (qty as number)
  }

  // Requested per item & per category from the deal-inclusive lines.
  const reqByItem: Record<string, number> = {}
  const reqByCat: Record<string, number> = {}
  for (const l of orderLines) {
    reqByItem[l.name] = (reqByItem[l.name] || 0) + l.quantity
    const c = (itemCatMap[l.name] || '').toLowerCase()
    if (c) reqByCat[c] = (reqByCat[c] || 0) + l.quantity
  }

  const shortfall: { name: string; remaining: number }[] = []
  for (const [name, reqQty] of Object.entries(reqByItem)) {
    const cat = (itemCatMap[name] || '').toLowerCase()
    const itemRem = calcStockRemaining(itemCeiling(name), sold[name] || 0)
    const catRem = calcStockRemaining(catCeiling(cat), soldByCat[cat] || 0)
    const eff = calcEffectiveRemaining(itemRem, catRem)
    // Reject if this item alone exceeds its effective remaining, OR its category's TOTAL
    // requested exceeds the category remaining (shared-category overflow across basket lines).
    const catOver = catRem != null && (reqByCat[cat] || 0) > catRem
    if ((eff != null && reqQty > eff) || catOver) {
      const cap = Math.min(eff ?? Infinity, catRem ?? Infinity)
      shortfall.push({ name, remaining: Number.isFinite(cap) ? Math.max(0, cap) : 0 })
    }
  }
  return shortfall.length ? shortfall : null
}
