// lib/prep-utils.ts
// SINGLE SOURCE OF TRUTH for prep time / ready time calculations
// Used by: truck dashboard (client), slots API (server), customer order form (client)

import type { SupabaseClient } from '@supabase/supabase-js'

export interface CatConfig {
    secs: number
    batch: number
    /** No-prep categories (secs 0) the operator ticked to count toward the shared
     *  kitchen_capacity ceiling (e.g. instant Sides/Dips). Ignored when secs>0 (prep-bearing
     *  categories always count). Default false → today's behaviour (0-prep skipped). */
    countsToCapacity?: boolean
  }
  
  export interface PrepItem {
    name: string
    quantity: number
  }
  
  export interface PrepMenuItem {
    name: string
    category: string
  }
  
  // Kept as empty export so existing dashboard imports don't break
  export const DEFAULT_CAT_CONFIG: Record<string, CatConfig> = {}

  export function getCatConfig(catName: string): CatConfig {
    // All config comes from DB — safe instant/unlimited default for unknown categories
    return { secs: 0, batch: 999 }
  }
  
  export function catCookSecs(qty: number, cfg: CatConfig): number {
    if (cfg.secs === 0) return 0
    return Math.ceil(qty / cfg.batch) * cfg.secs
  }
  
  export function calcReadySecs(
    items: PrepItem[],
    waitSecs: number,
    menuItems?: PrepMenuItem[],
    customConfigs?: Record<string, CatConfig>
  ): number {
    if (!items.length) return 0
    const catGroups: Record<string, number> = {}
    items.forEach(item => {
      const cat = menuItems?.find(m => m.name === item.name)?.category || 'mains'
      catGroups[cat] = (catGroups[cat] || 0) + item.quantity
    })
    let maxSecs = 0
    Object.entries(catGroups).forEach(([cat, qty]) => {
      const cfg = customConfigs?.[cat.toLowerCase()] ?? getCatConfig(cat)
      const secs = catCookSecs(qty, cfg)
      if (secs > maxSecs) maxSecs = secs
    })
    return Math.max(30, maxSecs) + waitSecs
  }
  
  export function calcReadyTime(
    items: PrepItem[],
    waitSecs: number,
    menuItems?: PrepMenuItem[],
    customConfigs?: Record<string, CatConfig>
  ): string {
    if (!items.length) return ''
    const totalSecs = calcReadySecs(items, waitSecs, menuItems, customConfigs)
    const t = new Date()
    t.setSeconds(t.getSeconds() + totalSecs)
    return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
  }
  
  export function calcMinsFromNow(
    items: PrepItem[],
    waitSecs: number,
    menuItems?: PrepMenuItem[],
    customConfigs?: Record<string, CatConfig>
  ): number {
    if (!items.length) return 0
    return Math.ceil(calcReadySecs(items, waitSecs, menuItems, customConfigs) / 60)
  }
  
  export function getCategoryTime(cat: string): number {
    return Math.round(getCatConfig(cat).secs / 60)
  }
  
  /**
   * SINGLE SOURCE OF TRUTH for queue-aware ready time calculation.
   * Used by: truck dashboard AND customer order form.
   *
   * totalQty = queueByCat[cat] + newByCat[cat]
   * finalBatch = ceil(totalQty / batchSize)
   * prepSecs = finalBatch x prepSecs
   */
  /**
   * Per-category queue-aware ready time, BEFORE the max-collapse. Each entry is
   * finalBatch * prepSecs for that category (finalBatch = ceil((queue+new)/batch)).
   * No buffer, no 30s floor — raw batch math only. Instant categories (no prep_secs)
   * are omitted, exactly as the aggregate version skips them.
   *
   * SINGLE SOURCE of the per-category batch math (S3/S6): calcQueueAwareReadySecs
   * collapses this; the slot-capacity engine reads it per category. Do not
   * re-derive ceil(qty/batch)*secs anywhere else.
   */
  export function calcReadySecsByCat(
    newByCat: Record<string, number>,
    queueByCat: Record<string, number>,
    catConfigs: Record<string, CatConfig>
  ): Record<string, number> {
    const byCat: Record<string, number> = {}
    Object.entries(newByCat).forEach(([cat, newQty]) => {
      const cfg = catConfigs[cat.toLowerCase()] ?? getCatConfig(cat)
      if (!cfg.secs) return
      const totalQty = (queueByCat[cat] || 0) + newQty
      const finalBatch = Math.ceil(totalQty / cfg.batch)
      byCat[cat] = finalBatch * cfg.secs
    })
    return byCat
  }

  export function calcQueueAwareReadySecs(
    newByCat: Record<string, number>,
    queueByCat: Record<string, number>,
    catConfigs: Record<string, CatConfig>,
    bufferSecs: number = 120
  ): number {
    const byCat = calcReadySecsByCat(newByCat, queueByCat, catConfigs)
    const maxSecs = Object.values(byCat).reduce((m, secs) => (secs > m ? secs : m), 0)
    if (maxSecs === 0) return 0
    return Math.max(30, maxSecs) + bufferSecs
  }
  
  /**
   * Queue push past event start, for events that haven't started yet.
   * Manual s.6: ASAP base is never eventStart + prep — batch 1 is pre-prepped and
   * ready AT event start. Each subsequent batch lands one prep-cycle later, so the
   * new order's final batch completes (ceil((queue+new)/batch) - 1) cycles after
   * start. Empty queue + an order fitting one batch ⇒ 0 (ASAP = event start exactly).
   * Used by: AddOrderPanel queueAware (client) AND slots API (server) — must agree.
   */
  /**
   * Per-category queue push past event start, BEFORE the max-collapse. Each entry
   * is (ceil((queue+new)/batch) - 1) * prepSecs — the pre-prep credit (batch 1 ready
   * AT event start, Manual s.6). Instant categories omitted. SINGLE SOURCE of the
   * push math (S3/S6): calcQueuePushSecs collapses this, and the slot-capacity
   * engine's constraint (b) reads it per category. Do not re-derive elsewhere.
   */
  export function calcQueuePushSecsByCat(
    newByCat: Record<string, number>,
    queueByCat: Record<string, number>,
    catConfigs: Record<string, CatConfig>
  ): Record<string, number> {
    const byCat: Record<string, number> = {}
    Object.entries(newByCat).forEach(([cat, newQty]) => {
      const cfg = catConfigs[cat.toLowerCase()] ?? getCatConfig(cat)
      if (!cfg.secs) return
      const totalQty = (queueByCat[cat] || 0) + newQty
      byCat[cat] = (Math.ceil(totalQty / cfg.batch) - 1) * cfg.secs
    })
    return byCat
  }

  export function calcQueuePushSecs(
    newByCat: Record<string, number>,
    queueByCat: Record<string, number>,
    catConfigs: Record<string, CatConfig>
  ): number {
    const byCat = calcQueuePushSecsByCat(newByCat, queueByCat, catConfigs)
    return Object.values(byCat).reduce((m, secs) => (secs > m ? secs : m), 0)
  }

  /**
   * Fetch and normalise per-category prep configs from the DB for a given truck.
   * Canonical single source — used by both the manual-order and customer-order paths.
   */
  export async function buildCatConfigs(
    supabase: SupabaseClient,
    truckId: string
  ): Promise<Record<string, CatConfig>> {
    const { data: categories } = await supabase
      .from('menu_categories')
      .select('name, prep_secs, batch_size, counts_toward_capacity')
      .eq('truck_id', truckId)
    const catConfigs: Record<string, CatConfig> = {}
    ;(categories || []).forEach(c => {
      catConfigs[c.name.toLowerCase()] = {
        secs: c.prep_secs || 0,
        batch: c.batch_size && c.batch_size > 0 ? c.batch_size : 999,
        countsToCapacity: !!c.counts_toward_capacity,
      }
    })
    return catConfigs
  }

  /**
   * Minimum minutes before earliest collection, used by slots API.
   */
  export function calcMinReadyMins(
    queueByCat: Record<string, number>,
    catConfigs: Record<string, CatConfig>
  ): number {
    let maxSecs = 0
    Object.entries(queueByCat).forEach(([cat, qty]) => {
      const cfg = catConfigs[cat.toLowerCase()] || getCatConfig(cat)
      const secs = catCookSecs(qty, cfg)
      if (secs > maxSecs) maxSecs = secs
    })
    return Math.ceil(Math.max(120, maxSecs) / 60)
  }

  /**
   * SINGLE resolver for an order's effective collection time, as a local Date.
   * Shared by the dashboard order card (display + urgency) and the orders-list sort.
   *
   *   - order.slot set  → the explicit slot time (event_date + slot).
   *   - order.slot null → the event-date-aware ASAP base (Manual s.6):
   *       • future-date event, or today-but-not-yet-open → event start
   *       • today underway                              → max(now, event start)
   *     This mirrors getAsapSlot's today/future branching — same now-floor,
   *     no forked formula. (Queue-aware prep is applied at NEW-order entry in
   *     AddOrderPanel via calcQueuePushSecs; the live queue isn't in scope here,
   *     so the floor is event start, which is what governs before service.)
   *
   * All dates built with new Date(y, mo-1, d, h, m) local time (Manual s.7) —
   * never new Date('YYYY-MM-DD…'), which Safari parses as UTC and shifts the day.
   *
   * Returns null only when there is no slot AND no usable event start to anchor to
   * (callers fall back to ticket age in that case).
   */
  export function resolveCollectionTime(
    order: { slot: string | null; event_date: string | null },
    event: { event_date: string | null; start_time: string | null } | null,
  ): Date | null {
    const toLocal = (dateStr: string, timeStr: string): Date | null => {
      const [y, mo, d] = dateStr.split('-').map(Number)
      const [h, m] = timeStr.split(':').map(Number)
      if ([y, mo, d, h, m].some(n => Number.isNaN(n))) return null
      return new Date(y, mo - 1, d, h, m, 0, 0)
    }

    // order.slot is now ALWAYS populated for new orders (submit persists the resolved boundary), so
    // THIS branch fires for every order placed after that fix → the operator card shows a stable
    // boundary time, not the drifting raw clock.
    if (order.slot && order.event_date) {
      return toLocal(order.event_date, order.slot)
    }

    const evDate = event?.event_date ?? order.event_date
    if (!evDate || !event?.start_time) return null
    const eventStart = toLocal(evDate, event.start_time)
    if (!eventStart) return null

    // LEGACY FALLBACK (unreachable for new orders): only a legacy null-slot ASAP order reaches here.
    // The raw `now` drifts every minute — that was the "10:23 · now" bug; new orders never hit it.
    const now = new Date()
    return now.getTime() > eventStart.getTime() ? now : eventStart
  }