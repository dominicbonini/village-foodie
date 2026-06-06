// lib/slot-indicator.ts
// SINGLE SOURCE OF TRUTH for the slot traffic-light display.
// Operator-only: consumed by the Add Order panel. Customers never see the
// traffic-light — they only get cleanly available slots (no full/amber entries).
//
// "remaining" is the soft-cap definition (soft_max − current_orders) returned by
// /api/slots. When a caller has a slot shape without it (e.g. /api/dashboard),
// the same soft-cap maths is derived here — never max_orders − current_orders,
// which overstates space relative to the availability cutoff.

const SOFT_CAP_RATIO = 0.85 // must match lib/slot-availability.ts

export type SlotTone = 'green' | 'amber' | 'red'

export interface SlotIndicatorInput {
  current_orders: number
  max_orders: number
  remaining?: number
}

export function getSlotIndicator(slot: SlotIndicatorInput): {
  tone: SlotTone
  emoji: string
  label: string
  remaining: number
} {
  const unlimited = slot.max_orders >= 999
  if (unlimited) return { tone: 'green', emoji: '🟢', label: '', remaining: 999 }
  const softMax = Math.max(1, Math.floor(slot.max_orders * SOFT_CAP_RATIO))
  const remaining = slot.remaining ?? Math.max(0, softMax - slot.current_orders)
  const pct = slot.current_orders / slot.max_orders
  if (pct >= 1 || remaining <= 0) return { tone: 'red', emoji: '🔴', label: 'Full', remaining: 0 }
  if (pct >= 0.7) return { tone: 'amber', emoji: '🟡', label: `${remaining} left`, remaining }
  return { tone: 'green', emoji: '🟢', label: `${remaining} left`, remaining }
}
