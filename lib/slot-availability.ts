// lib/slot-availability.ts
// Category-aware slot availability (customer slots API + operator dashboard).
//
// TWO constraints per candidate collection time T (Manual s.6/s.10/s.14):
//   (a) PER-WINDOW global item ceiling — total non-instant items promised in T's
//       own production window <= kitchen_capacity (only when capacity is set).
//   (b) CUMULATIVE per-category throughput — for each category, the cohort promised
//       from event start up to AND INCLUDING T must be cookable by T:
//       eventStart + calcReadySecsByCat(cohort) <= T.
// Both read live from production_slot_usage.units_by_cat (ITEMS per production slot
// per category). slot_capacity's batch rows are no longer consulted (dead cache).

import { calcQueuePushSecsByCat, type CatConfig } from '@/lib/prep-utils'
import type { QtyByCat } from '@/lib/slot-capacity'
import type { SlotTone } from '@/lib/slot-indicator'

export interface CollectionTimeRow {
  collection_time: string
  production_slot: string
}

export interface SlotAvailabilityRow {
  collection_time: string
  production_slot: string
  /** Items used against the BINDING constraint (global ceiling or a category cohort). */
  current_orders: number
  /** Capacity of the binding constraint (items). 999 = unlimited. */
  max_orders: number
  soft_max: number
  remaining: number
  available: boolean
  /** Genuinely past clock time only (today: slot <= now + 5). */
  is_past: boolean
  /** Below earliestCollectionMins (queue-aware ready floor) but NOT actually past. */
  too_soon: boolean
  /** True for slots after the event end time (grace period for truck only). */
  is_grace: boolean
  // ── category-aware engine additions (new fields, existing ones unchanged) ──
  /** Resolved traffic-light tone — the worst of (a)/(b). Read by getSlotIndicator. */
  tone: SlotTone
  /** Which constraint/category bound the slot (null when green). For diagnostics/report. */
  bound_by: string | null
}

const SOFT_CAP_RATIO = 0.85
const UNLIMITED = 999
// Pre-event ordering context (Manual s.6: customer pre-order passes 0). The (b)
// throughput gate is a pure physical-cook check anchored at event start.
const THROUGHPUT_BUFFER_SECS = 0
const RANK: Record<SlotTone, number> = { green: 0, amber: 1, red: 2 }

function parseMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function buildSlotAvailability(params: {
  times: CollectionTimeRow[]
  /** Per production_slot item quantities by category (production_slot_usage). */
  productionSlotUnits: Record<string, QtyByCat>
  catConfigs: Record<string, CatConfig>
  /** Items ceiling for constraint (a); null = (a) OFF. */
  kitchenCapacity: number | null
  date: string
  nowMins: number
  earliestCollectionMins: number
  /** Event start (minutes from midnight) — anchor for constraint (b). */
  eventStartMins: number
  /** If set, slots after this minute are flagged is_grace (truck grace period). */
  eventEndMins?: number
  /**
   * In-progress operator basket (items by category). When set, it is treated as
   * "placed at THIS candidate slot" for every row: added to (a)'s per-window total
   * and (b)'s cumulative cohort. This makes the operator dot, the override modal,
   * and the autoConfirm gate all answer the same question — "if I put this order
   * here, what happens" — from one engine. Omit (customer path) for queue-only.
   */
  basketByCat?: QtyByCat
}): SlotAvailabilityRow[] {
  const {
    times, productionSlotUnits, catConfigs, kitchenCapacity,
    date, nowMins, earliestCollectionMins, eventStartMins, eventEndMins,
    basketByCat,
  } = params
  const today = new Date().toISOString().split('T')[0]
  const basket = basketByCat ?? {}

  // Index production windows by minute for the cumulative (b) cohort.
  const prodWindows = Object.entries(productionSlotUnits).map(([slot, units]) => ({
    mins: parseMins(slot),
    units,
  }))

  return times.map(s => {
    const slotMins = parseMins(s.collection_time)
    const isGrace = eventEndMins !== undefined && slotMins > eventEndMins
    const isPast = !isGrace && date === today && slotMins <= nowMins + 5
    const tooSoon = !isPast && slotMins < earliestCollectionMins

    const unitsHere: QtyByCat = productionSlotUnits[s.production_slot] || {}
    const windowSecs = Math.max(0, (slotMins - eventStartMins) * 60)

    // Collapse all pressures to the most-constrained one for the scalar contract.
    let tone: SlotTone = 'green'
    let boundBy: string | null = null
    let bindCurrent = 0
    let bindCap = UNLIMITED
    let bindSoft = UNLIMITED
    let bindRemaining = UNLIMITED
    let bindRank = -1
    const consider = (label: string, t: SlotTone, used: number, cap: number, soft: number, remaining: number) => {
      const r = RANK[t]
      // Worst tone wins; tie-break on smallest remaining headroom.
      if (r > bindRank || (r === bindRank && remaining < bindRemaining)) {
        bindRank = r
        tone = t
        boundBy = t === 'green' ? null : label
        bindCurrent = used
        bindCap = cap
        bindSoft = soft
        bindRemaining = remaining
      }
    }

    // ── (a) per-window committed-load ceiling ─────────────────────────────────
    // Only the items ALREADY committed to T's own production window count here. The
    // basket is NOT added: a multi-item order's items are produced ACROSS windows at
    // the kitchen's rate (handled once by (b) throughput) — they do not all pile into
    // T's single window. Adding the whole basket here was the bug that red-flagged
    // every slot for a large order. (a) now only reddens a window already full of
    // prior bookings; whether THIS order fits is (b)'s job.
    if (kitchenCapacity != null) {
      let usedItems = 0
      for (const [cat, qty] of Object.entries(unitsHere)) {
        const cfg = catConfigs[cat.toLowerCase()]
        if (cfg && cfg.secs) usedItems += qty // exclude instant items (Manual s.14)
      }
      const cap = kitchenCapacity
      const soft = Math.max(1, Math.floor(cap * SOFT_CAP_RATIO))
      const remaining = Math.max(0, soft - usedItems)
      const pct = cap > 0 ? usedItems / cap : Infinity
      const t: SlotTone = pct >= 1 || remaining <= 0 ? 'red' : pct >= 0.7 ? 'amber' : 'green'
      consider('global ceiling', t, usedItems, cap, soft, remaining)
    }

    // ── (b) cumulative per-category throughput ────────────────────────────────
    const cohort: QtyByCat = {}
    for (const w of prodWindows) {
      if (w.mins <= slotMins) {
        for (const [cat, qty] of Object.entries(w.units)) cohort[cat] = (cohort[cat] || 0) + qty
      }
    }
    // Basket "placed here" joins the cumulative cohort (its window is this slot's).
    for (const [cat, qty] of Object.entries(basket)) cohort[cat] = (cohort[cat] || 0) + qty
    // Mirror the ASAP base (Manual s.6): prep runs during the lead time before the
    // event, so batch 1 is ready AT event start. The cohort's ready time relative to
    // event start is the pre-prep push (ceil(qty/batch)-1)*secs — NOT the full
    // finalBatch*secs. This is why a light early load is GREEN at T = eventStart
    // instead of redding out. (The now-anchored floor for not-before-now is handled
    // separately by tooSoon/earliestCollectionMins.)
    const pushByCat = calcQueuePushSecsByCat(cohort, {}, catConfigs)
    for (const [cat, qty] of Object.entries(cohort)) {
      if (qty <= 0) continue
      const cfg = catConfigs[cat.toLowerCase()]
      if (!cfg || !cfg.secs) continue // instant categories impose no throughput limit
      const need = (pushByCat[cat] ?? 0) + THROUGHPUT_BUFFER_SECS // secs past event start
      // Max items of this category cookable by T with the lead credit:
      // (ceil(N/batch)-1)*secs <= windowSecs  ⇒  maxBatches = floor(windowSecs/secs)+1
      const cap = (Math.floor(windowSecs / cfg.secs) + 1) * cfg.batch
      const remaining = Math.max(0, cap - qty)
      const ratio = windowSecs > 0 ? need / windowSecs : (need > 0 ? Infinity : 0)
      const t: SlotTone = need > windowSecs ? 'red' : ratio >= 0.7 ? 'amber' : 'green'
      consider(`${cat} (cumulative throughput)`, t, qty, cap, Math.max(1, Math.floor(cap * SOFT_CAP_RATIO)), remaining)
    }

    // kitchen_capacity null AND no prep anywhere ⇒ no pressures ⇒ unlimited green.
    const capacityAvailable = bindRank < RANK.red

    return {
      collection_time: s.collection_time,
      production_slot: s.production_slot,
      current_orders: bindCurrent,
      max_orders: bindCap,
      soft_max: bindSoft,
      remaining: bindRemaining,
      available: capacityAvailable && !isPast && !tooSoon,
      is_past: isPast,
      too_soon: tooSoon,
      is_grace: isGrace,
      tone,
      bound_by: boundBy,
    }
  })
}
