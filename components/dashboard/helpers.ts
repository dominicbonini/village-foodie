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

export type AgeState = 'new' | 'ok' | 'warn' | 'late'

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
 * KDS urgency state based on slot offset (minutes until/past due).
 *   new   = slot is more than 15 min away   → grey
 *   ok    = slot is 5–15 min away           → green, start thinking
 *   warn  = slot is 0–5 min away or just due → amber, should be cooking
 *   late  = slot has passed by 1+ min        → red, overdue
 *
 * For slotless (walk-up) orders, pass -999 to always get 'new'.
 */
export function getAgeState(slotOffset: number): AgeState {
  if (slotOffset < -15) return 'new'
  if (slotOffset < -5)  return 'ok'
  if (slotOffset < 1)   return 'warn'
  return 'late'
}

/** Tailwind classes for the full-width ticket header bar, covering bg, text, and border. */
export function getHeaderStyle(state: AgeState): string {
  switch (state) {
    case 'new':  return 'bg-slate-100 text-slate-900 border-b border-slate-200'
    case 'ok':   return 'bg-green-100 text-green-900 border-b border-green-200'
    case 'warn': return 'bg-amber-100 text-amber-900 border-b border-amber-200'
    case 'late': return 'bg-red-100 text-red-900 border-b border-red-200'
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