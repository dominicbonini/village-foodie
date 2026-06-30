// components/dashboard/helpers.ts
// Re-exports shared prep/slot utilities from lib/
// Keeps existing dashboard imports working without changes

export { getAsapSlot } from '@/lib/slot-utils'

export {
  getCatConfig,
  catCookSecs,
  calcReadySecs,
  calcReadyTime,
  calcMinsFromNow,
  getCategoryTime,
  DEFAULT_CAT_CONFIG,
  resolveCollectionTime,
} from '@/lib/prep-utils'

export type { CatConfig } from '@/lib/prep-utils'

// getBundleSlotCats stays here — dashboard-specific
export function getBundleSlotCats(b: any): string[] {
  return [
    b.slot_1_category, b.slot_2_category, b.slot_3_category,
    b.slot_4_category, b.slot_5_category, b.slot_6_category
  ].filter((s): s is string => !!s)
}

// ── KDS helpers ───────────────────────────────────────────────────────────────

import type { Order } from './types'
import type { CatConfig } from '@/lib/prep-utils'

export type AgeState = 'new' | 'ok' | 'warn' | 'late'
export type HeaderState = AgeState | 'ready' | 'cooking'

/** Minutes elapsed since the order was created. Returns a non-negative integer. */
export function getTicketAge(createdAt: string | Date): number {
  const created = typeof createdAt === 'string' ? new Date(createdAt) : createdAt
  return Math.max(0, Math.floor((Date.now() - created.getTime()) / 60000))
}

/**
 * Minutes until (negative) or past (positive) the order's due slot.
 * e.g. -120 = 2 hours until slot. +5 = 5 minutes overdue.
 * Pass a full Date built from event_date + slot, not a raw HH:MM string.
 */
export function getSlotOffset(slotTime: Date): number {
  return Math.floor((Date.now() - slotTime.getTime()) / 60000)
}

/**
 * Raw cook seconds for an order = the worst (longest) category's batch math,
 * max over categories of ceil(qty / batch) * prep_secs. NO 30s floor and NO buffer
 * — instant/no-cook categories (prep_secs 0) contribute 0, so a basket of only
 * no-cook items returns 0. This is the order's actual oven time; the prep-aware
 * amber lead is derived from it. Mirrors the calcReadySecs per-category math (single
 * source) but without the ready-time floor, which would mask no-cook orders.
 */
export function getOrderCookSecs(
  items: { name: string; quantity: number }[],
  itemCategoryMap: Record<string, string>,
  catConfigs: Record<string, CatConfig>,
): number {
  const byCat: Record<string, number> = {}
  items.forEach(it => {
    const cat = (itemCategoryMap[it.name] || 'mains').toLowerCase()
    byCat[cat] = (byCat[cat] || 0) + it.quantity
  })
  let maxSecs = 0
  Object.entries(byCat).forEach(([cat, qty]) => {
    const cfg = catConfigs[cat]
    if (!cfg || !cfg.secs) return
    const secs = Math.ceil(qty / (cfg.batch || 1)) * cfg.secs
    if (secs > maxSecs) maxSecs = secs
  })
  return maxSecs
}

/** Small handling/plating margin added on top of pure cook time when deciding the
 *  amber ("start cooking now") moment — so the operator has a beat to plate and hand
 *  over, and an instant/no-cook order still ambers ~2 min out rather than only at due. */
const AMBER_BUFFER_SECS = 120

/** Minutes before the collection target at which the card flips to amber = cook time +
 *  handling buffer, floored at 2 min. A 12-min pizza ambers ~14 min out; a no-cook side
 *  ambers ~2 min out — instead of a flat 5-min (too late for cooked food) or a 15-min
 *  ticket-age offset (too early). */
export function cookAmberLeadMins(cookSecs: number): number {
  return Math.max(2, Math.ceil((cookSecs + AMBER_BUFFER_SECS) / 60))
}

/**
 * KDS urgency state based on slot offset (minutes until/past due) and the order's
 * prep-aware amber lead (cook time + buffer; see cookAmberLeadMins).
 *   new   = slot is more than (lead+10) min away → grey
 *   ok    = slot is (lead..lead+10) min away      → white, start thinking
 *   warn  = slot is within the lead, or just due  → amber, start cooking NOW
 *   late  = slot has passed by 1+ min             → red, overdue
 *
 * amberLeadMins defaults to 5, which exactly reproduces the previous fixed thresholds
 * (warn 0–5, ok 5–15, new >15) for any caller that doesn't supply a prep-aware lead.
 * For slotless (walk-up) orders, pass -999 to always get 'new'.
 */
export function getAgeState(slotOffset: number, amberLeadMins: number = 5): AgeState {
  if (slotOffset >= 1)                       return 'late'  // overdue slot → red
  if (slotOffset >= -amberLeadMins)          return 'warn'  // within must-start window → amber (prep-aware)
  if (slotOffset >= -(amberLeadMins + 10))   return 'ok'    // approaching → white
  return 'new'                                              // far out → grey
}

/**
 * Combined urgency, driven by PREP-AWARE slot timing.
 * ready/cooking overrides are handled in the caller — this only covers time urgency.
 *
 * The card flips to AMBER ('warn') at the latest moment the operator can still start
 * and finish on time = when the slot is within (cook time + buffer) of now — see
 * cookAmberLeadMins. A 12-min pizza ambers ~14 min before its slot; a no-cook side
 * ambers ~2 min before. RED ('late') fires ONLY when the SLOT is overdue (slotOffset
 * >= 1) — the SOLE source of red.
 *
 * Ticket age is now a DEMOTED signal: it can only lift a far-out grey ticket to white
 * once it's a few minutes old; it can NEVER manufacture amber. (Previously age hitting
 * 15 min turned a card amber even when its slot was still 45 min out and the food only
 * needed ~12 min to cook — the "amber ~30 min before cooking is needed" false alarm.)
 *
 * @param amberLeadMins minutes before the slot to flip amber (cook time + buffer);
 *   defaults to 5, preserving the old fixed threshold for callers without prep data.
 */
export function getCombinedUrgency(
  slotDt: Date | null,
  createdAt: string,
  amberLeadMins: number = 5,
): AgeState {
  // Slotless legacy walk-up (no due time to anchor cook urgency): fall back to the old
  // ticket-age staleness buckets — new (<5) / ok (<15) / warn (>=15).
  if (!slotDt) {
    const ageMins = getTicketAge(createdAt)
    return ageMins < 5 ? 'new' : ageMins < 15 ? 'ok' : 'warn'
  }
  const slotOffset = getSlotOffset(slotDt)
  const slotState  = getAgeState(slotOffset, amberLeadMins)
  // Prep-aware SLOT timing is the SOLE source of amber/red. Age only lifts a far-out
  // grey ticket to white once it's a few minutes old — it can no longer escalate colour.
  if (slotState !== 'new') return slotState
  return getTicketAge(createdAt) >= 5 ? 'ok' : 'new'
}

/** Tailwind classes for the full-width ticket header bar, covering bg, text, and border. */
export function getHeaderStyle(state: HeaderState): string {
  switch (state) {
    case 'ready':   return 'bg-green-50 text-green-900 border-b border-green-200 border-t-4 border-t-green-500'
    case 'cooking': return 'bg-amber-50 text-amber-900 border-b border-amber-200 border-t-4 border-t-amber-400'
    case 'new':     return 'bg-slate-50 text-slate-900 border-b border-slate-200'
    case 'ok':      return 'bg-white text-slate-900 border-b border-slate-200'
    case 'warn':    return 'bg-amber-50 text-amber-900 border-b border-amber-200 border-t-4 border-t-amber-400'
    case 'late':    return 'bg-red-50 text-red-900 border-b border-red-200 border-t-4 border-t-red-500'
  }
}

/** True if the order has a non-empty notes/allergy field. */
export function isAllergyOrder(order: Order): boolean {
  return !!(order.notes && order.notes.trim().length > 0)
}

/** True if the order contains at least one deal. */
export function hasDealItems(order: Order): boolean {
  return !!(order.deals && order.deals.length > 0)
}

/**
 * Returns a map of item name → total quantity across all provided orders.
 * Counts both standalone items and deal slot items.
 */
export function getAllDayCounts(orders: Order[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const order of orders) {
    for (const item of order.items) {
      counts[item.name] = (counts[item.name] || 0) + item.quantity
    }
    for (const deal of order.deals || []) {
      for (const itemName of Object.values(deal.slots)) {
        if (itemName) counts[itemName] = (counts[itemName] || 0) + 1
      }
    }
  }
  return counts
}