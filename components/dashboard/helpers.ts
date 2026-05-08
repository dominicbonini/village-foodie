// components/dashboard/helpers.ts
// Pure helper functions for the truck dashboard

import type { Slot, BasketItem, MenuItem, CatConfig } from './types'
import { DEFAULT_CAT_CONFIG } from './types'

export function getAsapSlot(slots: Slot[]): Slot | null {
  const now = new Date()
  const nowMins = now.getHours() * 60 + now.getMinutes()
  return slots.find(s => {
    const [h, m] = s.collection_time.split(':').map(Number)
    return (h * 60 + m) > nowMins && s.available
  }) || null
}

export function getCatConfig(cat: string, customConfigs?: Record<string, CatConfig>): CatConfig {
  const key = cat.toLowerCase()
  if (customConfigs?.[key]) return customConfigs[key]
  return DEFAULT_CAT_CONFIG[key] ?? { secs: 240, batch: 2 }
}

export function catCookSecs(qty: number, cfg: CatConfig): number {
  if (cfg.secs === 0) return 0
  return Math.ceil(qty / cfg.batch) * cfg.secs
}

export function calcReadySecs(
  items: BasketItem[],
  waitSecs: number,
  menuItems?: MenuItem[],
  customConfigs?: Record<string, CatConfig>
): number {
  if (!items.length) return 0
  let maxSecs = 0
  const catGroups: Record<string, number> = {}
  items.forEach(item => {
    const cat = menuItems?.find(m => m.name === item.name)?.category || 'mains'
    catGroups[cat] = (catGroups[cat] || 0) + item.quantity
  })
  Object.entries(catGroups).forEach(([cat, qty]) => {
    const cfg = getCatConfig(cat, customConfigs)
    const secs = catCookSecs(qty, cfg)
    if (secs > maxSecs) maxSecs = secs
  })
  return Math.max(30, maxSecs) + waitSecs
}

export function calcReadyTime(
  items: BasketItem[],
  waitSecs: number,
  menuItems?: MenuItem[],
  customConfigs?: Record<string, CatConfig>
): string {
  if (!items.length) return ''
  const totalSecs = calcReadySecs(items, waitSecs, menuItems, customConfigs)
  const t = new Date()
  t.setSeconds(t.getSeconds() + totalSecs)
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
}

export function calcMinsFromNow(
  items: BasketItem[],
  waitSecs: number,
  menuItems?: MenuItem[],
  customConfigs?: Record<string, CatConfig>
): number {
  if (!items.length) return 0
  return Math.ceil(calcReadySecs(items, waitSecs, menuItems, customConfigs) / 60)
}

export function getCategoryTime(cat: string): number {
  return Math.round(getCatConfig(cat).secs / 60)
}

export function getBundleSlotCats(b: any): string[] {
  return [
    b.slot_1_category, b.slot_2_category, b.slot_3_category,
    b.slot_4_category, b.slot_5_category, b.slot_6_category
  ].filter((s): s is string => !!s)
}