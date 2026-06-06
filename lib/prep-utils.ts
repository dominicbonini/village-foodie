// lib/prep-utils.ts
// SINGLE SOURCE OF TRUTH for prep time / ready time calculations
// Used by: truck dashboard (client), slots API (server), customer order form (client)

import type { SupabaseClient } from '@supabase/supabase-js'

export interface CatConfig {
    secs: number
    batch: number
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
  export function calcQueueAwareReadySecs(
    newByCat: Record<string, number>,
    queueByCat: Record<string, number>,
    catConfigs: Record<string, CatConfig>,
    bufferSecs: number = 120
  ): number {
    let maxSecs = 0
    Object.entries(newByCat).forEach(([cat, newQty]) => {
      const cfg = catConfigs[cat.toLowerCase()] ?? getCatConfig(cat)
      if (!cfg.secs) return
      const queueQty = queueByCat[cat] || 0
      const totalQty = queueQty + newQty
      const finalBatch = Math.ceil(totalQty / cfg.batch)
      const secs = finalBatch * cfg.secs
      if (secs > maxSecs) maxSecs = secs
    })
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
  export function calcQueuePushSecs(
    newByCat: Record<string, number>,
    queueByCat: Record<string, number>,
    catConfigs: Record<string, CatConfig>
  ): number {
    let maxSecs = 0
    Object.entries(newByCat).forEach(([cat, newQty]) => {
      const cfg = catConfigs[cat.toLowerCase()] ?? getCatConfig(cat)
      if (!cfg.secs) return
      const totalQty = (queueByCat[cat] || 0) + newQty
      const secs = (Math.ceil(totalQty / cfg.batch) - 1) * cfg.secs
      if (secs > maxSecs) maxSecs = secs
    })
    return maxSecs
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
      .select('name, prep_secs, batch_size')
      .eq('truck_id', truckId)
    const catConfigs: Record<string, CatConfig> = {}
    ;(categories || []).forEach(c => {
      catConfigs[c.name.toLowerCase()] = {
        secs: c.prep_secs || 0,
        batch: c.batch_size && c.batch_size > 0 ? c.batch_size : 999,
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