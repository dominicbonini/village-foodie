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
// Total acquire budget. Raised 1s → 3s (V7.7): A's heavy first-order critical section (stock re-check
// + empty-cache reseed + insert + fit + slot persist + addOrderToProductionSlot) can approach ~1s
// under real latency, so a 1s budget expired before A released → spurious "handling a lot of orders"
// message on normal 2-order contention. 3s comfortably absorbs a single concurrent order's hold, so
// contention resolves SILENTLY into the already-working next-slot fit; a timeout now = genuine overload.
const LOCK_MAX_WAIT_MS = 3_000
const LOCK_RETRY_MS = 150
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Result of acquireEventLock. ok=true → held (caller MUST release in finally). ok=false carries WHY,
// so the caller can tell a genuine failure from contention — though with the 3s budget BOTH are now
// "genuine" (a DB error, or a hold that outlasted the full budget = sustained overload) and warrant
// the last-resort message. The reason is surfaced for clarity/logging; the LOCK MECHANISM is unchanged.
export type LockResult = { ok: true } | { ok: false; reason: 'error' | 'contention' }

/**
 * Acquire the per-event booking lock. Acquire = INSERT into booking_locks; a PK conflict (23505)
 * means it's held — retry within the budget. Stale rows (older than LOCK_TTL_MS) are reclaimed
 * first, and the sweep only deletes rows OLDER than the TTL so a fresh lock is never stolen.
 * Returns { ok:true } if acquired (caller MUST release in finally); { ok:false, reason } if a real DB
 * error ('error') or contended past the full budget ('contention') — caller must then NOT insert
 * (the no-oversell guarantee depends on holding it).
 */
export async function acquireEventLock(truckId: string, eventDate: string): Promise<LockResult> {
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
    if (!error) return { ok: true }
    if (error.code !== '23505') {
      console.warn('[booking_locks] acquire error (failing safe — no insert):', error.message)
      return { ok: false, reason: 'error' }
    }
    if (Date.now() >= deadline) return { ok: false, reason: 'contention' }
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

// ── SHARED ceiling-shortfall engine (source-agnostic) ─────────────────────────
// The pure shortfall math, extracted from checkStockShortfall so items, categories, and (later) modifier
// options all run ONE model and can't drift. Given the order's lines, a live "sold" tally (by primary
// key), a primary ceiling resolver, and an OPTIONAL secondary axis (key-of + ceiling — e.g. category),
// returns the lines whose requested qty exceeds the EFFECTIVE remaining = min(primary, secondary), or
// null if all fit. Reject if a line alone exceeds its effective remaining OR its secondary key's TOTAL
// requested exceeds the secondary remaining (shared-axis overflow across basket lines). null ceiling =
// unlimited (never blocks). Pure/sync — the caller fetches the tally + builds the resolvers.
export function checkCeilingShortfall(
  lines: { name: string; quantity: number }[],
  primaryTally: Record<string, number>,
  primaryCeiling: (name: string) => number | null,
  secondary?: { keyOf: (name: string) => string; ceiling: (key: string) => number | null },
): { name: string; remaining: number }[] | null {
  // Secondary-axis "sold" — re-bucket the primary tally through keyOf (empty key = not on the axis).
  const soldBySecondary: Record<string, number> = {}
  if (secondary) {
    for (const [name, qty] of Object.entries(primaryTally)) {
      const k = secondary.keyOf(name)
      if (k) soldBySecondary[k] = (soldBySecondary[k] || 0) + (qty as number)
    }
  }
  // Requested per primary key & per secondary key from the order lines.
  const reqByItem: Record<string, number> = {}
  const reqBySecondary: Record<string, number> = {}
  for (const l of lines) {
    reqByItem[l.name] = (reqByItem[l.name] || 0) + l.quantity
    if (secondary) {
      const k = secondary.keyOf(l.name)
      if (k) reqBySecondary[k] = (reqBySecondary[k] || 0) + l.quantity
    }
  }

  const shortfall: { name: string; remaining: number }[] = []
  for (const [name, reqQty] of Object.entries(reqByItem)) {
    const k = secondary ? secondary.keyOf(name) : ''
    const itemRem = calcStockRemaining(primaryCeiling(name), primaryTally[name] || 0)
    const catRem = secondary ? calcStockRemaining(secondary.ceiling(k), soldBySecondary[k] || 0) : null
    const eff = calcEffectiveRemaining(itemRem, catRem)
    // Reject if this line alone exceeds its effective remaining, OR its secondary key's TOTAL requested
    // exceeds the secondary remaining (shared-axis overflow across basket lines).
    const catOver = catRem != null && (reqBySecondary[k] || 0) > catRem
    if ((eff != null && reqQty > eff) || catOver) {
      const cap = Math.min(eff ?? Infinity, catRem ?? Infinity)
      shortfall.push({ name, remaining: Number.isFinite(cap) ? Math.max(0, cap) : 0 })
    }
  }
  return shortfall.length ? shortfall : null
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

  // Run the SHARED engine: items are the primary axis (sold + itemCeiling), CATEGORY is the secondary
  // axis (key = the item's lowercased category, ceiling = catCeiling). The derivation (soldByCat /
  // reqByCat) + the shortfall math now live ONCE in checkCeilingShortfall — behaviour is byte-identical.
  return checkCeilingShortfall(
    orderLines,
    sold,
    itemCeiling,
    { keyOf: (name) => (itemCatMap[name] || '').toLowerCase(), ceiling: catCeiling },
  )
}

/**
 * Category ENABLE/DISABLE gate (GATE model, per-event). Returns the DISTINCT display names of any
 * categories that are turned OFF for this event (event_category_stock.available === false) AND present
 * in the order — or null if none. Kept SEPARATE from checkStockShortfall (which is about remaining
 * counts): a closed category is a hard stop, not a shortfall, so callers return an HONEST "category
 * closed" rejection rather than faking remaining=0 into the shortfall shape. Menu-hide alone is a
 * bypass (a stale client / crafted request), so this MUST run at submit on both the customer and the
 * operator path (operator gated by !override — an informed override may still add for the hatch).
 * orderLines are deal-inclusive (constituents already flattened); itemCatMap maps item → category.
 */
export async function checkClosedCategories(
  truckId: string,
  eventId: string,
  orderLines: { name: string; quantity: number }[],
  itemCatMap: Record<string, string>,
): Promise<string[] | null> {
  const { data: catStock } = await supabase
    .from('event_category_stock')
    .select('category, available')
    .eq('truck_id', truckId)
    .eq('event_id', eventId)
  const closed: Record<string, string> = {} // lowercased key -> display name
  ;(catStock || []).forEach((r: any) => {
    if (r.available === false) closed[String(r.category).toLowerCase()] = r.category
  })
  if (!Object.keys(closed).length) return null
  const hit = new Set<string>()
  for (const l of orderLines) {
    const k = (itemCatMap[l.name] || '').toLowerCase()
    if (k && closed[k]) hit.add(closed[k])
  }
  return hit.size ? Array.from(hit) : null
}
