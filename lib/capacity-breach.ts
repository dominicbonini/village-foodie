// PIECE 2 — reconnect "capacity exceeded" detection (DETECTION + WARNING ONLY).
//
// After offline orders sync and `rebuildProductionSlotUsage` has run (so `production_slot_usage`
// is authoritative), this READS the SAME engine output the day-load strip / dots already consume
// (§31 canonical model) and flags collection slots whose cooking window is GENUINELY OVER a ceiling.
//
// IT DOES NOT CHANGE THE ENGINE. It only calls projectBackwardOccupancy (the source of truth) and
// reads the RAW BackwardWindow fields. No auto-bump, no gating, no placement change — the operator
// reviews and amends by judgment.
//
// THE "EXCEEDED" CONDITION (per Piece-2 spec + §31):
//   STRICTLY OVER, not tone==='red'. A window is breached when it is over EITHER ceiling:
//     • remainingTotal   < -EPS  (concurrency total > kitchen_capacity), OR
//     • remainingByCat[c] < -EPS  (a category over its batch — surfaces at the event-start pile-up)
//   tone==='red' also fires on legitimately-FULL slots (>= ceiling), which would cry wolf on normal
//   busy nights — so we DELIBERATELY do not use it. We read the RAW window remainingTotal /
//   remainingByCat (NOT the /api/slots `remaining` field, which is Math.max(0,…)-clamped and can
//   NEVER show a breach).

import { projectBackwardOccupancy, backwardWindowStepMins } from '@/lib/slot-availability'
import type { CatConfig } from '@/lib/prep-utils'
import type { QtyByCat } from '@/lib/slot-capacity'

// Local EPS — matches the engine's private 1e-9. We only READ, so no coupling risk.
const BREACH_EPS = 1e-9

// Orders occupying the oven — the SAME status set the write path (buildUnitsFromOrders, §71) counts.
// 'ready' is released, 'collected'/'cancelled'/'rejected' are terminal — none contribute load, so
// none are listed as "sitting in" a breached window.
const OCCUPYING_STATUSES = new Set(['pending', 'confirmed', 'modified', 'cooking'])

export interface CapacityBreach {
  /** The collection slot whose cooking window is over a ceiling (the slot the operator sees red). */
  collection_time: string
  /** The engine's OWN binding reason, e.g. "Pizza 5/4" / "global ceiling" / "over capacity at event-start". */
  reason: string
  /** Items over the kitchen_capacity total ceiling in this window (0 if the breach is per-category only). */
  over_total: number
  /** Categories over their per-category batch in this window (empty if the breach is the total only). */
  over_cats: Array<{ cat: string; over: number }>
  /** order_keys of OCCUPYING orders collected at this slot — for the operator to find & amend. */
  order_keys: string[]
  /** Their per-event display numbers — for the banner link text. */
  order_ids: number[]
}

export interface DetectCapacityBreachesParams {
  /** The collection slots (same list the strip renders). */
  times: Array<{ collection_time: string }>
  /** production_slot → qty-by-cat, post-rebuild (authoritative). */
  productionSlotUnits: Record<string, QtyByCat>
  catConfigs: Record<string, CatConfig>
  kitchenCapacity: number | null
  eventStartMins: number
  capacityWindowMins?: number
  /** Active/terminal orders for the event (only OCCUPYING ones map into breaches). */
  orders: Array<{ order_key: string; id: number; slot: string | null; status: string }>
}

/**
 * Detect collection slots whose cooking window is genuinely OVER a ceiling, by READING
 * projectBackwardOccupancy's output (the exact same read the dots do). Returns one entry per
 * breached collection slot, with the occupying orders sitting in it. Empty when nothing is over.
 *
 * NO ENGINE CHANGE — projectBackwardOccupancy / buildSlotAvailability / rebuildProductionSlotUsage
 * and the tone logic are all untouched; this only consumes their output.
 */
export function detectCapacityBreaches(p: DetectCapacityBreachesParams): CapacityBreach[] {
  const { times, productionSlotUnits, catConfigs, kitchenCapacity, eventStartMins, capacityWindowMins, orders } = p
  if (!Array.isArray(times) || times.length === 0) return []

  // SAME projection the strip / /api/dashboard already run — identical inputs, identical model (§31).
  const back = projectBackwardOccupancy(
    productionSlotUnits || {},
    catConfigs || {},
    eventStartMins,
    kitchenCapacity,
    Math.max(1, Math.round(capacityWindowMins ?? 5)),
  )
  const step = backwardWindowStepMins(catConfigs || {})
  const parseMins = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0) }

  // Group OCCUPYING orders by their collection slot → "orders sitting in this window".
  const ordersBySlot = new Map<string, Array<{ order_key: string; id: number }>>()
  for (const o of orders || []) {
    if (!o || !o.slot || !o.order_key || !OCCUPYING_STATUSES.has(o.status)) continue
    const arr = ordersBySlot.get(o.slot) ?? []
    arr.push({ order_key: o.order_key, id: o.id })
    ordersBySlot.set(o.slot, arr)
  }

  const breaches: CapacityBreach[] = []
  for (const s of times) {
    const slotMins = parseMins(s.collection_time)
    // EXACT display read: the event-start pile at the first slot, else the cooking window ENDING here.
    const w = back.pileByStart.get(slotMins) ?? back.byStart.get(slotMins - step) ?? null
    if (!w) continue

    // STRICTLY OVER only — read the RAW window fields (never the clamped API `remaining`).
    const overTotal = w.remainingTotal < -BREACH_EPS ? -w.remainingTotal : 0
    const overCats: Array<{ cat: string; over: number }> = []
    for (const [cat, rem] of Object.entries(w.remainingByCat || {})) {
      if (rem < -BREACH_EPS) overCats.push({ cat, over: -rem })
    }
    if (overTotal <= 0 && overCats.length === 0) continue   // full is fine; only genuine over-subscription flags

    const grp = ordersBySlot.get(s.collection_time) ?? []
    breaches.push({
      collection_time: s.collection_time,
      reason: w.bound_by ?? (overTotal > 0 ? 'kitchen capacity' : 'batch'),
      over_total: Math.round(overTotal),
      over_cats: overCats.map(o => ({ cat: o.cat, over: Math.round(o.over) })),
      order_keys: grp.map(o => o.order_key),
      order_ids: grp.map(o => o.id),
    })
  }
  return breaches
}
