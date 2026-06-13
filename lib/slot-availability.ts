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

import type { CatConfig } from '@/lib/prep-utils'
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

const UNLIMITED = 999
const RANK: Record<SlotTone, number> = { green: 0, amber: 1, red: 2 }

function parseMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/**
 * Representative window step (minutes) for the SINGLE-window slot→cooking-window lookups
 * (dots + no-basket availability): a collection slot at T is served by the cooking window
 * ENDING at T, keyed T−step. We use the finest prep cadence among prep categories — exact
 * for single-cadence events (the validated scenarios). The per-CATEGORY exact mapping lives
 * in fitOrderBackward (the authoritative basket-aware path); for mixed-cadence menus the
 * single-window display is approximate but the fit/booking/ASAP remain per-category exact.
 * 0 when there are no prep categories (no oven windows ⇒ shift is moot).
 */
export function backwardWindowStepMins(catConfigs: Record<string, CatConfig>): number {
  let step = Infinity
  for (const cfg of Object.values(catConfigs)) {
    if (cfg && cfg.secs) step = Math.min(step, Math.max(1, Math.round(cfg.secs / 60)))
  }
  return Number.isFinite(step) ? step : 0
}

export function buildSlotAvailability(params: {
  times: CollectionTimeRow[]
  /** Per production_slot item quantities by category (production_slot_usage). */
  productionSlotUnits: Record<string, QtyByCat>
  catConfigs: Record<string, CatConfig>
  /** Items ceiling for constraint (a); null = (a) OFF. */
  kitchenCapacity: number | null
  /** The global ceiling's own window cadence (capacity_window_mins, van column). Default 5. */
  capacityWindowMins?: number
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
    times, productionSlotUnits, catConfigs, kitchenCapacity, capacityWindowMins,
    date, nowMins, earliestCollectionMins, eventStartMins, eventEndMins,
    basketByCat,
  } = params
  const capWindow = Math.max(1, Math.round(capacityWindowMins ?? 5))
  // LOCAL date (s.7) — must agree with the LOCAL nowMins passed in; toISOString() (UTC)
  // would roll over at UTC midnight and mis-flag a future event's slots as is_past.
  const today = localTodayIso()
  const basket = basketByCat ?? {}
  const hasBasket = Object.keys(basket).length > 0

  // BACKWARD occupancy model (Stage 2): an order's oven load lives in the COOKING windows
  // before its collection, not its collection bucket. We project the EXISTING load once,
  // then per candidate slot S read the window STARTING at S (the picker slot ⟷ that cooking
  // window). No basket ⇒ tone is that window's existing load (hide a full window). With a
  // basket ⇒ overlay the order via fitOrderBackward (windows ending at S) — RED = doesn't
  // fit. Retires the old (a) collection-bucket ceiling AND (b) cumulative throughput: the
  // lead-time check is now "the order's backward windows all have spare and none precede
  // event start" (run-off-front), expressed per-window.
  const back = projectBackwardOccupancy(productionSlotUnits, catConfigs, eventStartMins, kitchenCapacity, capWindow)
  // A collection slot at T is served by the cooking window ENDING at T (keyed T−step), NOT
  // the window starting at T — the off-by-one that blocked one slot early.
  const step = backwardWindowStepMins(catConfigs)

  return times.map(s => {
    const slotMins = parseMins(s.collection_time)
    const isGrace = eventEndMins !== undefined && slotMins > eventEndMins
    const isPast = !isGrace && date === today && slotMins <= nowMins + 5
    const tooSoon = !isPast && slotMins < earliestCollectionMins

    let tone: SlotTone
    let boundBy: string | null
    let bindCurrent: number
    let bindCap: number
    if (hasBasket) {
      // Operator/customer placing THIS order: does it fit the backward windows ending at S?
      const fit = fitOrderBackward(back, slotMins, basket, catConfigs, kitchenCapacity, eventStartMins, capWindow)
      tone = fit.tone
      boundBy = fit.bound_by
      bindCurrent = 0
      bindCap = kitchenCapacity ?? UNLIMITED
    } else {
      // No basket (customer initial view / dashboard list): the existing load in the cooking
      // window ENDING at S (keyed S−step). A full window ⇒ red ⇒ hidden from the customer.
      const w = back.byStart.get(slotMins - step) ?? null
      tone = w?.tone ?? 'green'
      boundBy = w?.bound_by ?? null
      bindCurrent = Math.round(w?.total ?? 0)
      bindCap = kitchenCapacity ?? UNLIMITED
    }

    const capacityAvailable = tone !== 'red'
    const w = back.byStart.get(slotMins - step) ?? null
    const bindRemaining = w ? (kitchenCapacity == null ? UNLIMITED : Math.max(0, Math.round(w.remainingTotal))) : (kitchenCapacity ?? UNLIMITED)

    return {
      collection_time: s.collection_time,
      production_slot: s.production_slot,
      current_orders: bindCurrent,
      max_orders: bindCap,
      soft_max: bindCap,
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

// ⚠️ RETIRED (Stage 3) — FORWARD-attribution projection. No live callers: the operator
// dots, customer/operator availability, ASAP and auto-placement all moved to the BACKWARD
// model (projectBackwardOccupancy / fitOrderBackward / earliestBackwardFitSlot). Kept only
// because the WindowOccupancy interface below is still referenced (slot-display reconstructs
// it for back-compat). Do NOT wire new consumers to this — it seats load at the COLLECTION
// window and carries forward (the inverted bug the backward model fixes). Safe to delete once
// the WindowOccupancy shape is inlined.
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
  cookingByCat: Record<string, number>  // items of each category cooking in this window (the "X")
  rateByCat: Record<string, number>     // per-prep-category cook capacity this window (the "/Y")
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

  // Per-prep-category cook capacity (the "/Y" denominator) for THIS slot config —
  // constant across windows. Exposed on every WindowOccupancy so fit-checks (e.g. the
  // Add Order capacity confirm) read the SAME rate the tone/bound_by use, never a
  // parallel calc. Instant categories (secs 0) are omitted — they don't occupy the oven.
  const rateByCat: Record<string, number> = {}
  for (const [cat, cfg] of Object.entries(catConfigs)) {
    if (cfg && cfg.secs) rateByCat[cat.toLowerCase()] = Math.max(1, cfg.batch * (stepSecs / cfg.secs))
  }

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
      const rate = rateByCat[cat.toLowerCase()] ?? Math.max(1, cfg.batch * (stepSecs / cfg.secs))
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

    return { collection_time: s.collection_time, production_slot: s.production_slot, tone, bound_by: boundBy, cookingByCat, rateByCat, totalCooking }
  })
}

/**
 * ⚠️ RETIRED (Stage 3) — forward TAIL-COMPLETION placement. No live callers: ASAP and
 * auto-confirm placement moved to earliestBackwardFitSlot (the backward-fit search). Kept
 * transiently; do NOT wire new consumers — use earliestBackwardFitSlot. Safe to delete.
 *
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

// ── BACKWARD cohort occupancy (read-time, STAGE 1 — not yet wired to any consumer) ──
//
// Physically correct per-window oven occupancy. An order of N items (per category)
// collected at T occupies ceil(N/batch) COOKING windows BACKWARD from T, at the
// category's prep cadence (cfg.secs), batch-size per window, the window ADJACENT to
// collection holding the remainder. Example: 10 pizzas, batch 4, prep 5min, collect
// 19:00 → 18:45=4, 18:50=4, 18:55=2; 19:00+ = 0 (free).
//
// This is the inverse of projectOvenOccupancy, which seats an order's load AT its
// collection production_slot and carries FORWARD — the bug that reds the collection
// window while leaving the (physically busy) lead-up windows free. projectOvenOccupancy
// is left UNTOUCHED this stage; consumers still read the old forward path. This function
// exists only to be verified in isolation before anything trusts it.
//
// ── GRANULARITY RECONCILIATION (coarse stored bucket → fine cooking windows) ──
// production_slot_usage is keyed by a slot_duration-bucketed production_slot (coarse,
// e.g. 10-min) holding the SUM of every order collecting in that bucket. The backward
// spread is at PREP cadence (fine, e.g. 5-min, and per-category). We anchor each bucket's
// cohort at its production_slot key (the bucket START, "HH:MM") as the ready-by DEADLINE,
// and spread its batches backward from there at cfg.secs cadence. Anchoring at the bucket
// START (not its end) is the CONSERVATIVE choice when slot_duration > prep cadence: an
// order collecting at 19:05 that buckets to "19:00" is treated as due by 19:00, reserving
// oven time slightly earlier than its true 19:05 deadline (never later). Each category
// spreads independently at its own prep cadence (categories cook in parallel, Manual s.6);
// the per-window map keys by exact window-start minute, so differing cadences accumulate
// honestly by minute. Instant categories (secs 0) occupy no oven time and are skipped.

export interface BackwardWindow {
  /** Window start minutes-from-midnight (== collectionDeadline − k*prepMins). May be < eventStartMins (run-off-front). */
  startMins: number
  /** Window start "HH:MM" (display; wraps 24h, so run-off-front entries may read oddly — rely on startMins). */
  start: string
  /** True when this window starts before event start — physically impossible (insufficient lead). */
  beforeEventStart: boolean
  /** Items of each prep category cooking in this window. */
  byCat: Record<string, number>
  /** Sum across categories (for the kitchen-capacity ceiling). */
  total: number
  /** batch − used per category. Negative ⇒ honest over-subscription (override) — NOT re-packed. */
  remainingByCat: Record<string, number>
  /** kitchenCapacity − total (Infinity when no ceiling set). Negative ⇒ honest over-full. */
  remainingTotal: number
  /** Traffic-light for this window — IDENTICAL rule to projectOvenOccupancy: a category
   *  full/over (used >= batch) ⇒ red, partial ⇒ amber; total >= ceiling ⇒ red. */
  tone: SlotTone
  /** Binding category/constraint, e.g. "Pizza 4/4" / "global ceiling" / null (never green-binding). */
  bound_by: string | null
}

export interface CantFitFlag {
  /** The stored collection bucket whose backward spread runs before event start. */
  productionSlot: string
  cat: string
  qty: number
  /** Earliest cooking-window start this cohort needs (< eventStartMins ⇒ insufficient lead). */
  earliestWindowMins: number
  eventStartMins: number
}

export interface BackwardOccupancy {
  /** All cooking windows that carry load, sorted by startMins ascending. */
  windows: BackwardWindow[]
  /** Same windows indexed by startMins for O(1) lookup. */
  byStart: Map<number, BackwardWindow>
  /** Cohorts that can't fit because they'd need windows before event start (old (b)'s real job). */
  cantFit: CantFitFlag[]
  /** Per-category batch size seen (the "/Y" denominator) — for fit-checks/rate reconstruction. */
  batchByCat: Record<string, number>
  /** EXISTING counted load as concurrency intervals (cooking = [start,start+prep); instant
   *  counted = zero-width point). The global kitchen_capacity ceiling is judged ONLY by the
   *  sweep-line over these ⊕ an order's intervals — see maxConcurrentCount. */
  intervals: CookInterval[]
}

// ── Global kitchen_capacity ceiling = EXACT concurrency check (replaces the per-window cascade) ──
// kitchen_capacity is a CONCURRENCY ceiling: "no more than N counted items in production at the
// same instant." Each counted contribution is an interval on the timeline; a cooking batch of M
// items (prep P, seated at window-start S) occupies [S, S+P) and counts M at every instant inside
// it; an instant counted item is a zero-width point counting M at its seat instant. The ceiling
// holds iff the sweep-line PEAK concurrency ≤ kitchen_capacity. No buckets, no anchor constant.
// The capacity window cadence (capacity_window_mins) only governs where INSTANT items are seated
// and how their overflow rolls backward (placeInstantPoints) — cooking is deterministic and merely
// read by the sweep. Per-category batch placement (pizza on its prep grid) is unchanged.
export interface CookInterval {
  /** Start minute (inclusive). */
  startMins: number
  /** End minute (exclusive for cooking; == startMins for a zero-width instant point). */
  endMins: number
  /** Counted items present across [startMins, endMins). */
  items: number
}

// Sweep-line peak concurrency over counted intervals. Tie-break at equal timestamps:
// real END (free the oven) before real START (a batch finishing at T does NOT count concurrent
// with one starting at T), and zero-width POINTS are evaluated AFTER both — so a point registers
// at its instant alongside coincident-START batches and excluding coincident-END batches.
export function maxConcurrentCount(intervals: CookInterval[]): number {
  type Ev = { t: number; kind: 0 | 1 | 2; delta: number }
  const events: Ev[] = []
  const pointAt = new Map<number, number>()
  for (const iv of intervals) {
    if (iv.items <= 0) continue
    if (iv.endMins > iv.startMins) {
      events.push({ t: iv.startMins, kind: 1, delta: iv.items })   // real START
      events.push({ t: iv.endMins, kind: 0, delta: -iv.items })    // real END
    } else {
      pointAt.set(iv.startMins, (pointAt.get(iv.startMins) || 0) + iv.items)
    }
  }
  for (const t of pointAt.keys()) events.push({ t, kind: 2, delta: 0 })
  events.sort((a, b) => a.t - b.t || a.kind - b.kind)   // END(0) < START(1) < POINT(2)
  let running = 0
  let peak = 0
  for (const e of events) {
    if (e.kind === 2) {
      // running already reflects coincident STARTs (kind 1) and dropped coincident ENDs (kind 0).
      const c = running + (pointAt.get(e.t) || 0)
      if (c > peak) peak = c
    } else {
      running += e.delta
      if (running > peak) peak = running
    }
  }
  return peak
}

// Counted concurrency at a single instant t — reals cover [start,end); points hit only t == start.
function concurrencyAt(intervals: CookInterval[], t: number): number {
  let c = 0
  for (const iv of intervals) {
    if (iv.items <= 0) continue
    if (iv.endMins > iv.startMins) { if (iv.startMins <= t && t < iv.endMins) c += iv.items }
    else if (iv.startMins === t) c += iv.items
  }
  return c
}

// Greedy backward placement of zero-prep COUNTED instant items as concurrency points. Instant
// items have no intrinsic schedule, so they seat into capacityStep-spaced windows ending at
// `anchorMins` (collection-adjacent first), each taking only the concurrency headroom left by the
// fixed cooking/existing load already present. Overflow rolls one capacityStep earlier; needing a
// window before eventStart ⇒ can't fit (runsOffFront). IDENTICAL rule in both engine callers, so
// placement and recorded-occupancy spill instant load the same way (the do-not-undo).
function placeInstantPoints(
  count: number,
  anchorMins: number,
  base: CookInterval[],
  kitchenCapacity: number | null,
  capacityStep: number,
  eventStartMins: number,
): { points: CookInterval[]; runsOffFront: boolean } {
  const points: CookInterval[] = []
  if (count <= 0) return { points, runsOffFront: false }
  const ws0 = anchorMins - capacityStep
  if (kitchenCapacity == null) {
    points.push({ startMins: ws0, endMins: ws0, items: count })  // no ceiling ⇒ no spread needed
    return { points, runsOffFront: false }
  }
  const sofar = [...base]
  let remaining = count
  let w = ws0
  while (remaining > 0) {
    // One pre-open window allowed (mirrors the cooking path's `eventStartMins - prep`): instant items
    // may seat as early as one capacity window before open, so up to kitchenCapacity are ready at start.
    if (w < eventStartMins - capacityStep) return { points, runsOffFront: true }
    const headroom = Math.max(0, kitchenCapacity - concurrencyAt(sofar, w))
    const place = Math.min(remaining, headroom)
    if (place > 0) {
      const p: CookInterval = { startMins: w, endMins: w, items: place }
      points.push(p); sofar.push(p)
      remaining -= place
    }
    w -= capacityStep
  }
  return { points, runsOffFront: false }
}

export function projectBackwardOccupancy(
  productionSlotUnits: Record<string, QtyByCat>,
  catConfigs: Record<string, CatConfig>,
  eventStartMins: number,
  kitchenCapacity: number | null,
  capacityWindowMins: number = 5,
): BackwardOccupancy {
  // Accumulate COOKING load per window-start minute → { cat: items } (drives per-category batch tones).
  const loadByStart = new Map<number, Record<string, number>>()
  const batchByCat: Record<string, number> = {}
  const cantFit: CantFitFlag[] = []
  // step = PREP grid (cooking window keying + the no-basket single-window lookup). UNCHANGED.
  const step = backwardWindowStepMins(catConfigs)
  // capacityStep = the global ceiling's OWN cadence (capacity_window_mins): where instant counted
  // items seat and roll. Independent of prep — closes the "borrow the fastest prep" gap and the
  // no-cooking-category collapse.
  const capacityStep = Math.max(1, Math.round(capacityWindowMins))

  const fmt = (mins: number) => {
    const m = ((mins % 1440) + 1440) % 1440
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  }

  // Cooking concurrency intervals + per-deadline instant counted totals (placed after cooking).
  const cookIntervals: CookInterval[] = []
  const instantByDeadline: Array<{ deadline: number; count: number }> = []

  for (const [ps, units] of Object.entries(productionSlotUnits)) {
    const deadline = parseMins(ps) // bucket START = ready-by deadline (see reconciliation note)
    let instantHere = 0
    for (const [catRaw, rawN] of Object.entries(units)) {
      const cat = catRaw.toLowerCase()
      const cfg = catConfigs[cat]
      const N = Number(rawN) || 0
      if (!cfg || N <= 0) continue
      if (!cfg.secs) {
        // No prep cadence. Counts toward the ceiling only if the operator ticked it.
        if (cfg.countsToCapacity) {
          instantHere += N                          // CEILING path — feeds the concurrency points / sweep (UNCHANGED).
          // DISPLAY-ONLY byCat tally so the operator dot composition label shows "Other N" again
          // (the V6.7 rebuild relocated instant load to anonymous concurrency points and dropped it
          // from byCat). byCat is read ONLY by the composition label, remainingByCat, and the cooking
          // tone loop (which `continue`s on batch==null below, so instant cats still never self-red);
          // it is NEVER read by the ceiling, which uses concurrencyAt(intervals,…). So this cannot
          // double-count. Seated at the collection-adjacent CAPACITY window (deadline − capacityStep),
          // a key the window builder emits. No batchByCat → no per-category denominator/tone.
          const ws = deadline - capacityStep
          const w = loadByStart.get(ws) ?? {}
          w[cat] = (w[cat] || 0) + N
          loadByStart.set(ws, w)
        }
        continue
      }
      const batch = Math.max(1, cfg.batch)
      const prepMins = Math.max(1, Math.round(cfg.secs / 60))
      batchByCat[cat] = batch
      const numWindows = Math.ceil(N / batch)
      const earliestWindowMins = deadline - numWindows * prepMins
      if (earliestWindowMins < eventStartMins) {
        cantFit.push({ productionSlot: ps, cat, qty: N, earliestWindowMins, eventStartMins })
      }
      // Seat batches backward on the PREP grid (UNCHANGED): earliest windows full (batch), the
      // window ADJACENT to collection holds the remainder N − batch*(numWindows-1) ∈ [1, batch].
      // Each window is ALSO a [S, S+prep) concurrency interval for the global sweep.
      for (let i = 0; i < numWindows; i++) {
        const startMins = deadline - (numWindows - i) * prepMins
        const isAdjacent = i === numWindows - 1
        const items = isAdjacent ? N - batch * (numWindows - 1) : batch
        const w = loadByStart.get(startMins) ?? {}
        w[cat] = (w[cat] || 0) + items
        loadByStart.set(startMins, w)
        cookIntervals.push({ startMins, endMins: startMins + prepMins, items })
      }
    }
    if (instantHere > 0) instantByDeadline.push({ deadline, count: instantHere })
  }

  // Place EXISTING instant counted items as concurrency points, greedily backward against the fixed
  // cooking load (and instants already placed) — deterministic deadline-asc order, the SAME
  // placeInstantPoints rule fitOrderBackward applies to a new order's instants (the do-not-undo).
  const intervals: CookInterval[] = [...cookIntervals]
  instantByDeadline.sort((a, b) => a.deadline - b.deadline)
  for (const { deadline, count } of instantByDeadline) {
    const { points } = placeInstantPoints(count, deadline, intervals, kitchenCapacity, capacityStep, eventStartMins)
    for (const p of points) {
      intervals.push(p)
      // TONE-COVERAGE FIX: a point can spill onto an EARLIER capacity window than the single
      // display window (deadline−capacityStep). That earlier window may hold ONLY spilled points
      // (no cooking, no label), so it never got a loadByStart key and the window-builder skipped it
      // → its dot defaulted to green despite being at the ceiling. Guarantee the window EXISTS so the
      // builder computes its tone via the SAME concurrencyAt(intervals, startMins) path below. byCat
      // is left EMPTY on purpose: the "Other N" LABEL stays single-window (deadline−capacityStep,
      // above) — only the TONE reflects spill. So a spilled-only window shows a red/amber tone with
      // no item label ("full from earlier overflow"). Concurrency math + fit path are untouched: this
      // adds no points/load, only a zero-byCat tone-list entry; fitOrderBackward still reads
      // back.intervals (which already had these points) and existing?.byCat[cat] ?? 0 is unchanged.
      if (!loadByStart.has(p.startMins)) loadByStart.set(p.startMins, {})
    }
  }

  const windows: BackwardWindow[] = [...loadByStart.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([startMins, byCat]) => {
      const remainingByCat: Record<string, number> = {}
      // Per-category batch tone (PREP grid) — UNCHANGED: full/over ⇒ red, partial ⇒ amber
      // (worst wins, tie-break higher load).
      let tone: SlotTone = 'green'
      let bound_by: string | null = null
      let bindRank = -1
      let bindUsed = -1
      for (const [cat, used] of Object.entries(byCat)) {
        const batch = batchByCat[cat]
        if (batch == null) continue
        remainingByCat[cat] = batch - used
        const t: SlotTone = used >= batch - EPS ? 'red' : 'amber'
        const r = RANK[t]
        if (r > bindRank || (r === bindRank && used > bindUsed)) {
          bindRank = r; bindUsed = used
          tone = t; bound_by = `${capWord(cat)} ${Math.round(used)}/${Math.round(batch)}`
        }
      }
      // Global ceiling for the no-basket display = EXACT concurrency at this window's instant
      // (cooking spanning + instant points), not a per-window sum. Identical to the old per-window
      // total when capacityStep == prep and nothing spans a boundary (today's state).
      const conc = concurrencyAt(intervals, startMins)
      if (kitchenCapacity != null && conc >= kitchenCapacity - EPS) {
        tone = 'red'; bound_by = 'global ceiling'
      }
      return {
        startMins,
        start: fmt(startMins),
        beforeEventStart: startMins < eventStartMins,
        byCat,
        total: conc,
        remainingByCat,
        remainingTotal: kitchenCapacity == null ? Infinity : kitchenCapacity - conc,
        tone,
        bound_by,
      }
    })

  const byStart = new Map<number, BackwardWindow>()
  for (const w of windows) byStart.set(w.startMins, w)
  return { windows, byStart, cantFit, batchByCat, intervals }
}

// ── Backward FIT check: can an order of `orderByCat` be placed at collection slot S? ──
// The order's LATEST cooking window is the one STARTING at S (adjacent to its collection,
// holding the remainder); earlier full batches extend backward at prep cadence. The order
// FITS when, for every window it touches: existing load + the order's batch ≤ batch (per
// category) AND ≤ kitchenCapacity (across categories), AND no window starts before event
// start (run-off-front). Returns the binding tone — RED ⇒ doesn't fit (customer hidden /
// operator override-confirm). Shared by buildSlotAvailability AND the customer order page
// so both audiences ask ONE engine the same question. `back` is the EXISTING occupancy
// (basket NOT folded — this overlays the order on top).
export function fitOrderBackward(
  back: BackwardOccupancy,
  slotMins: number,
  orderByCat: QtyByCat,
  catConfigs: Record<string, CatConfig>,
  kitchenCapacity: number | null,
  eventStartMins: number,
  capacityWindowMins: number = 5,
): { tone: SlotTone; bound_by: string | null; fits: boolean } {
  // Order's COOKING load on the PREP grid (drives per-category batch tones) + its concurrency
  // intervals; counted-instant items are tallied for capacity-cadence placement below.
  const orderLoad = new Map<number, Record<string, number>>()
  const batchOf: Record<string, number> = {}
  const orderCookIntervals: CookInterval[] = []
  let orderInstant = 0
  const capacityStep = Math.max(1, Math.round(capacityWindowMins))
  // One pre-open batch is allowed for COOKING lead: a window may extend at most one prep-interval
  // before eventStart. (Instant lead is enforced by placeInstantPoints against eventStart.)
  let runsOffFront = false
  for (const [catRaw, rawM] of Object.entries(orderByCat)) {
    const cat = catRaw.toLowerCase()
    const cfg = catConfigs[cat]
    const M = Number(rawM) || 0
    if (!cfg || M <= 0) continue
    if (!cfg.secs) {
      // Counted instant → seated as capacity-cadence concurrency points below; unticked: skipped.
      if (cfg.countsToCapacity) orderInstant += M
      continue
    }
    const batch = Math.max(1, cfg.batch)
    const prep = Math.max(1, Math.round(cfg.secs / 60))
    batchOf[cat] = batch
    const nw = Math.ceil(M / batch)
    // earliest required window-start = slotMins − nw*prep; allow one pre-open window.
    if (slotMins - nw * prep < eventStartMins - prep) runsOffFront = true
    for (let i = 0; i < nw; i++) {
      // The order COOKS in the windows ENDING at the collection slot T: latest/adjacent window
      // [T−prep, T) keyed T−prep (i=0), stepping back … T−nw*prep. Mirrors projectBackwardOccupancy.
      const ws = slotMins - (i + 1) * prep
      const items = i === 0 ? M - batch * (nw - 1) : batch
      const w = orderLoad.get(ws) ?? {}
      w[cat] = (w[cat] || 0) + items
      orderLoad.set(ws, w)
      orderCookIntervals.push({ startMins: ws, endMins: ws + prep, items })
    }
  }

  let tone: SlotTone = 'green'
  let bound_by: string | null = null
  let bindRank = -1
  const consider = (t: SlotTone, label: string) => {
    const r = RANK[t]
    if (r > bindRank) { bindRank = r; tone = t; bound_by = t === 'green' ? null : label }
  }
  // Insufficient COOKING lead (needs more than one pre-open window) ⇒ red, regardless of capacity.
  if (runsOffFront) consider('red', 'too soon (insufficient lead)')

  // PER-CATEGORY batch tones (PREP grid) — UNCHANGED: existing per-cat load ⊕ order's per-cat load.
  for (const [ws, ord] of orderLoad) {
    const existing = back.byStart.get(ws)
    for (const [cat, add] of Object.entries(ord)) {
      const batch = batchOf[cat]
      if (batch == null) continue
      const combined = (existing?.byCat[cat] ?? 0) + add
      const t: SlotTone = combined > batch + EPS ? 'red' : combined >= batch - EPS ? 'amber' : 'green'
      consider(t, `${capWord(cat)} ${Math.round(combined)}/${Math.round(batch)}`)
    }
  }

  // GLOBAL CEILING = EXACT sweep-line concurrency (the ONLY place it's judged). Cooking is fixed
  // (existing ⊕ order intervals); if that alone peaks over the ceiling it's an unfixable collision
  // ⇒ red. Otherwise greedily seat the order's counted-instant items as concurrency points on the
  // capacity cadence — running off the event front (no headroom before open) ⇒ doesn't fit. Amber
  // when the resulting peak sits exactly at the ceiling (parity with the old at-N amber).
  if (kitchenCapacity != null) {
    const realIntervals = [...back.intervals, ...orderCookIntervals]
    const cookingPeak = maxConcurrentCount(realIntervals)
    if (cookingPeak > kitchenCapacity + EPS) {
      consider('red', 'global ceiling')
    } else {
      const { points, runsOffFront: instantOff } =
        placeInstantPoints(orderInstant, slotMins, realIntervals, kitchenCapacity, capacityStep, eventStartMins)
      if (instantOff) {
        consider('red', 'global ceiling')
      } else {
        const peak = points.length ? maxConcurrentCount([...realIntervals, ...points]) : cookingPeak
        if (peak >= kitchenCapacity - EPS) consider('amber', 'global ceiling')
      }
    }
  }

  // fits derived from bindRank (number) — `tone` is closure-mutated, so a direct
  // `tone !== 'red'` would mis-narrow to the literal 'green'.
  return { tone, bound_by, fits: bindRank < RANK.red }
}

// ── ASAP / auto-placement (Stage 3): earliest collection slot that BACKWARD-FITS ──
// The single ASAP+placement definition: the earliest collection time T (sorted, T ≥
// fromMins time-floor) whose ceil(N/batch) backward cooking windows ending at T have spare
// and don't run before event start — i.e. fitOrderBackward is NOT red. Replaces the old
// forward projectOrderTailWindow "last window still cooking". Shared by the operator panel,
// the customer page, and the submit auto-confirm so ASAP, the floor, placement, and the
// picker all answer ONE fit question. Returns null when no slot in `times` fits (caller
// pends — never rejects). `fromMins` is the now/lead time floor (default: no floor).
export function earliestBackwardFitSlot(
  times: CollectionTimeRow[],
  productionSlotUnits: Record<string, QtyByCat>,
  catConfigs: Record<string, CatConfig>,
  kitchenCapacity: number | null,
  eventStartMins: number,
  orderByCat: QtyByCat,
  fromMins: number = Number.NEGATIVE_INFINITY,
  capacityWindowMins: number = 5,
): string | null {
  const back = projectBackwardOccupancy(productionSlotUnits, catConfigs, eventStartMins, kitchenCapacity, capacityWindowMins)
  const sorted = [...times].sort((a, b) => parseMins(a.collection_time) - parseMins(b.collection_time))
  for (const t of sorted) {
    const m = parseMins(t.collection_time)
    if (m < fromMins) continue
    if (fitOrderBackward(back, m, orderByCat, catConfigs, kitchenCapacity, eventStartMins, capacityWindowMins).fits) {
      return t.collection_time
    }
  }
  return null
}
