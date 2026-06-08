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
import { localTodayIso } from '@/lib/time-utils'

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
  // LOCAL date (s.7) — must agree with the LOCAL nowMins passed in; toISOString() (UTC)
  // would roll over at UTC midnight and mis-flag a future event's slots as is_past.
  const today = localTodayIso()
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

// ── Oven-occupancy projection (read-time) ─────────────────────────────────────
// Treats the kitchen as a CONTINUOUS per-category FIFO queue projected onto the
// windows: each window cooks one batch (batch_size items) per category; unfinished
// items carry into later windows. A window's occupancy for a category = items still
// cooking from earlier windows + items starting in it. Categories cook in PARALLEL
// (Manual s.6) → projected independently, then combined for the cross-category
// kitchen_capacity ceiling. Pure read-time over the EXISTING single queue source
// (productionSlotUnits) + catConfigs — no storage/writer/lock change (S3/S6).
//
// rate = batch_size * (windowSecs / prep_secs) — items a category cooks per window.
// windowSecs is the real production-window interval (read from slot config, never
// hardcoded). For a 5-min window with 5-min prep this equals batch_size, so the
// validated examples are unchanged; for prep ≠ window it scales (e.g. 10-min prep on
// 5-min windows → half a batch per window, spread across two windows).

export interface WindowOccupancy {
  collection_time: string
  production_slot: string
  tone: SlotTone
  bound_by: string | null               // e.g. "Pizza 2/4" / "global ceiling" / null
  cookingByCat: Record<string, number>  // items of each category cooking in this window
  totalCooking: number                  // sum across prep categories (for the ceiling)
}

const capWord = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const EPS = 1e-9

export function projectOvenOccupancy(
  times: CollectionTimeRow[],
  productionSlotUnits: Record<string, QtyByCat>,
  catConfigs: Record<string, CatConfig>,
  kitchenCapacity: number | null,
  windowSecs: number,
): WindowOccupancy[] {
  // carry[cat] = items still queued (not yet cooked) entering the NEXT window.
  const carry: Record<string, number> = {}
  const sorted = [...times].sort((a, b) => parseMins(a.collection_time) - parseMins(b.collection_time))

  // BUG 1 fix: the cook rate must reflect the ACTUAL spacing between the windows we step
  // through (the collection interval), not slot_duration. When slot_duration > interval the
  // caller's windowSecs (slot_duration-based) over-states the step, doubling the rate. Derive
  // the step from the smallest gap between consecutive rows; fall back to windowSecs for a
  // single row (and the claim/tail path, whose synthetic windows are already correctly spaced
  // so min-gap == windowSecs anyway).
  let minGapSecs = Infinity
  for (let i = 1; i < sorted.length; i++) {
    const gap = (parseMins(sorted[i].collection_time) - parseMins(sorted[i - 1].collection_time)) * 60
    if (gap > 0) minGapSecs = Math.min(minGapSecs, gap)
  }
  const stepSecs = Number.isFinite(minGapSecs) ? minGapSecs : windowSecs

  // BUG 2 fix: several collection rows can map to one production_slot (slot_duration >
  // interval buckets them). Attribute a slot's items to its FIRST row only, so the same
  // units aren't re-counted in every row of the bucket. Genuine overflow still flows via
  // carry; this only stops the double-read.
  const countedSlots = new Set<string>()

  return sorted.map(s => {
    const firstForSlot = !countedSlots.has(s.production_slot)
    countedSlots.add(s.production_slot)
    const incoming = firstForSlot ? (productionSlotUnits[s.production_slot] || {}) : {}
    const cookingByCat: Record<string, number> = {}
    let totalCooking = 0
    let tone: SlotTone = 'green'
    let boundBy: string | null = null
    let bindRank = -1
    let bindOcc = -1

    const cats = new Set([...Object.keys(carry), ...Object.keys(incoming)])
    for (const cat of cats) {
      const cfg = catConfigs[cat.toLowerCase()]
      if (!cfg || !cfg.secs) continue // instant categories don't occupy the oven (s.14)
      const queued = (carry[cat] || 0) + (incoming[cat] || 0)
      if (queued <= EPS) { carry[cat] = 0; continue }
      // items this category cooks per window — scaled by the real window step vs prep cycle
      const rate = Math.max(1, cfg.batch * (stepSecs / cfg.secs))
      const cooking = Math.min(queued, rate)
      cookingByCat[cat] = cooking
      totalCooking += cooking
      carry[cat] = queued - cooking              // remainder cooks in later windows
      // per-category batch saturation: full rate this window = red, partial = amber
      const t: SlotTone = cooking >= rate - EPS ? 'red' : 'amber'
      const r = RANK[t]
      if (r > bindRank || (r === bindRank && cooking > bindOcc)) {
        bindRank = r; bindOcc = cooking
        tone = t; boundBy = `${capWord(cat)} ${Math.round(cooking)}/${Math.round(rate)}`
      }
    }

    // cross-category kitchen_capacity ceiling (items cooking this window across cats)
    if (kitchenCapacity != null && totalCooking >= kitchenCapacity - EPS) {
      tone = 'red'; boundBy = 'global ceiling'; bindRank = RANK.red
    }

    return { collection_time: s.collection_time, production_slot: s.production_slot, tone, bound_by: boundBy, cookingByCat, totalCooking }
  })
}

/**
 * Placement TAIL-COMPLETION window (read-time, same projection as the dots). Folds
 * the order into the cohort (existing items due ≤ its start window + the order, queued
 * at the start window) and returns the LAST window where the order's prep categories
 * are still cooking — i.e. when the order's last item completes. This is the earliest
 * window the order can be collected; callers reassign/pend off it (never reject).
 * Returns null when the order has no prep categories (instant-only) or no windows.
 */
export function projectOrderTailWindow(
  times: CollectionTimeRow[],
  productionSlotUnits: Record<string, QtyByCat>,
  catConfigs: Record<string, CatConfig>,
  kitchenCapacity: number | null,
  windowSecs: number,
  orderByCat: QtyByCat,
  startCollectionTime: string,
): string | null {
  const startMins = parseMins(startCollectionTime)
  const sorted = [...times].sort((a, b) => parseMins(a.collection_time) - parseMins(b.collection_time))
  const startEntry = sorted.find(t => t.collection_time === startCollectionTime) ?? sorted.find(t => parseMins(t.collection_time) >= startMins)
  if (!startEntry) return null
  const startPs = startEntry.production_slot

  // Cohort = existing items due at/before the start window (the queue ahead) + this order.
  const cohort: QtyByCat = {}
  for (const [ps, units] of Object.entries(productionSlotUnits)) {
    if (parseMins(ps) <= startMins) for (const [c, q] of Object.entries(units)) cohort[c] = (cohort[c] || 0) + q
  }
  for (const [c, q] of Object.entries(orderByCat)) cohort[c] = (cohort[c] || 0) + q

  const orderCats = Object.keys(orderByCat).filter(c => {
    const cfg = catConfigs[c.toLowerCase()]
    return cfg && cfg.secs
  })
  if (!orderCats.length) return null // instant-only order — no oven time

  // Windows needed for the cohort to fully drain (max over the order's categories at
  // each category's scaled rate). EXTEND past event end so an over-full event yields a
  // tail beyond the last real window → caller pends (never reject).
  const intervalMins = Math.max(1, Math.round(windowSecs / 60))
  const need = Math.max(1, ...orderCats.map(c => {
    const cfg = catConfigs[c.toLowerCase()]!
    const rate = Math.max(1, cfg.batch * (windowSecs / cfg.secs))
    return Math.ceil((cohort[c] || 0) / rate)
  }))
  const fmt = (mins: number) => `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
  const windows: CollectionTimeRow[] = Array.from({ length: need }, (_, i) => {
    const mm = startMins + i * intervalMins
    return { collection_time: fmt(mm), production_slot: i === 0 ? startPs : fmt(mm) }
  })

  // Project the cohort from the start window onward; the order is the queue tail.
  const occ = projectOvenOccupancy(windows, { [startPs]: cohort }, catConfigs, kitchenCapacity, windowSecs)
  let tail: string | null = null
  for (const w of occ) {
    if (orderCats.some(c => (w.cookingByCat[c.toLowerCase()] || 0) > EPS)) tail = w.collection_time
  }
  return tail
}
