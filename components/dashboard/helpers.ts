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

/**
 * Combined urgency: the worse of slot-relative timing and time-since-creation.
 * ready/cooking overrides are handled in the caller — this only covers time urgency.
 *
 * RED ('late') fires ONLY when the SLOT is overdue (slotState === 'late', i.e.
 * slotOffset >= 1) — that is the SOLE source of red. The creation-age signal is a gentle
 * live-service nudge that CAPS at amber ('warn') from 15 min and never climbs: a not-yet-
 * overdue order is never reddened for being a stale ticket (operator ruling). A 20-min and
 * a 60-min not-due ticket both yield age='warn' — never 'late'.
 */
export function getCombinedUrgency(slotDt: Date | null, createdAt: string): AgeState {
  const slotOffset = slotDt ? getSlotOffset(slotDt) : -999
  const slotState  = getAgeState(slotOffset)
  // Creation-age urgency is a LIVE-SERVICE signal (unactioned ticket going stale).
  // It must never fire for pre-orders whose slot is still far away — otherwise an
  // order for tomorrow turns red 30 min after being placed. When the slot is more
  // than 60 min out, slot timing alone governs (calm/neutral).
  if (slotDt && slotOffset < -60) return slotState
  const ageMins    = getTicketAge(createdAt)
  // Age caps at 'warn' from 15 min and never escalates to 'late' — only an overdue SLOT
  // reds the card. Buckets: new (<5) / ok (<15) / warn (>=15).
  const ageState: AgeState =
    ageMins < 5  ? 'new' :
    ageMins < 15 ? 'ok'  : 'warn'
  const priority: Record<AgeState, number> = { new: 0, ok: 1, warn: 2, late: 3 }
  return priority[slotState] >= priority[ageState] ? slotState : ageState
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