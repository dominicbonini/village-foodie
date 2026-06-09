// lib/slot-indicator.ts
// SINGLE SOURCE OF TRUTH for the slot traffic-light display.
// Operator-only: consumed by the Add Order panel. Customers never see the
// traffic-light — they only get cleanly available slots (no full/amber entries).
//
// As of the category-aware engine, the tone is RESOLVED in buildSlotAvailability
// (lib/slot-availability.ts) from the per-window ceiling + cumulative per-category
// throughput. This reads that resolved `tone`/`remaining`; the legacy batch-scalar
// calc remains only as a fallback for slot shapes that predate the engine.

const SOFT_CAP_RATIO = 0.85

export type SlotTone = 'green' | 'amber' | 'red'

export interface SlotIndicatorInput {
  current_orders: number
  max_orders: number
  remaining?: number
  /** Engine-resolved tone (category-aware). Preferred when present. */
  tone?: SlotTone
}

export function getSlotIndicator(slot: SlotIndicatorInput): {
  tone: SlotTone
  emoji: string
  label: string
  remaining: number
} {
  const remaining = slot.remaining ?? (
    slot.max_orders >= 999
      ? 999
      : Math.max(0, Math.floor(slot.max_orders * SOFT_CAP_RATIO) - slot.current_orders)
  )

  // Prefer the engine-resolved tone; fall back to the legacy batch-scalar calc.
  let tone = slot.tone
  if (!tone) {
    if (slot.max_orders >= 999) {
      tone = 'green'
    } else {
      const pct = slot.current_orders / slot.max_orders
      tone = pct >= 1 || remaining <= 0 ? 'red' : pct >= 0.7 ? 'amber' : 'green'
    }
  }

  // Red is "Full". V6.4: amber's per-category count ("Pizza 2/4") comes from the
  // occupancy projection's bound_by (not derivable here, which lacks category data),
  // so amber carries no directional label — no stale V6.3 directional string.
  switch (tone) {
    case 'red':   return { tone, emoji: '🔴', label: 'Full', remaining: 0 }
    case 'amber': return { tone, emoji: '🟡', label: '', remaining }
    default:      return { tone: 'green', emoji: '🟢', label: '', remaining }
  }
}
