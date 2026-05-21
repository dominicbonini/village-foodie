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
  
  export const DEFAULT_CAT_CONFIG: Record<string, CatConfig> = {
    pizzas:   { secs: 480, batch: 3 }, pizza:    { secs: 480, batch: 3 },
    burgers:  { secs: 360, batch: 2 }, burger:   { secs: 360, batch: 2 }, mains: { secs: 360, batch: 2 },
    drinks:   { secs: 0,   batch: 99 }, drink:   { secs: 0,   batch: 99 },
    dips:     { secs: 0,   batch: 99 }, dip:     { secs: 0,   batch: 99 },
    sides:    { secs: 60,  batch: 5 },  side:    { secs: 60,  batch: 5 },
    desserts: { secs: 180, batch: 3 },  extras:  { secs: 0,   batch: 99 },
  }
  
  export function getCatConfig(
    cat: string,
    customConfigs?: Record<string, CatConfig>
  ): CatConfig {
    const key = cat.toLowerCase()
    if (customConfigs?.[key]) return customConfigs[key]
    return DEFAULT_CAT_CONFIG[key] ?? { secs: 240, batch: 2 }
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
      const cfg = getCatConfig(cat, customConfigs)
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
      catConfigs[c.name.toLowerCase()] = { secs: c.prep_secs || 0, batch: c.batch_size || 1 }
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