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
import { getLocalDateInTz } from '@/lib/time-utils'

export interface CollectionTimeRow {
  collection_time: string
  production_slot: string
  /** WINDOW key the WRITE stores load under = `timeMap[collection_time] || collection_time`. Pre-resolved
   *  by the route (where collection_times/timeMap is available) and passed through to the row so the
   *  DISPLAY (buildSlotIndicators) can mirror the write. Absent ⇒ buildSlotIndicators falls back to
   *  collection_time. NOTE: the capacity ENGINE reads in THIS file still key by collection_time/
   *  production_slot — see the audit note; they need a deeper re-key (parseMins can't read a range key). */
  production_window_key?: string
}

export interface SlotAvailabilityRow {
  collection_time: string
  production_slot: string
  /** Pre-resolved window key (= write key) carried through to the client so the day-load dots
   *  (buildSlotIndicators) read the SAME key the write used. See CollectionTimeRow.production_window_key. */
  production_window_key: string
  /** Items used against the BINDING constraint (global ceiling or a category cohort). */
  current_orders: number
  /** Capacity of the binding constraint (items). 999 = unlimited. */
  max_orders: number
  soft_max: number
  remaining: number
  available: boolean
  /** Genuinely past clock time only (today: slot < now, event tz). No lead — see too_soon. */
  is_past: boolean
  /** Below earliestCollectionMins (the SINGLE prep/queue/extraWait readiness floor) but not past. */
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
  // Accept a production_slot_usage WINDOW key (range "19:20-19:30") as well as a plain HH:MM. The
  // backward-fit engine iterates the usage map and parses each key as the bucket-START deadline
  // (projectBackwardOccupancy:"bucket START = ready-by deadline"); window SIZE comes from
  // capacityWindowMins + prep cadence, never the range end — so the START is the complete semantic.
  // Split on '-' FIRST: a range yields its start ("19:20-19:30" → "19:20"); a single key has no '-'
  // so split('-')[0] returns it unchanged. WITHOUT this, Number("20-19") = NaN dropped windowed load
  // from the projection → the engine under-read a full window and over-accepted (the windowed-truck bug).
  const start = hhmm.split('-')[0]
  const [h, m] = start.split(':').map(Number)
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
  /** Event timezone for the "today"/is_past comparison. Default 'Europe/London'. The caller must
   *  pass `nowMins` computed in the SAME tz (getNowMinsInTz(tz)) so the two agree. */
  tz?: string
  /**
   * 🔴 THE DISPLAYED GRID'S INTERVAL (5/10/15/20/30). DISPLAY ONLY — it changes which windows the
   * no-basket DOT reads (coverDotWindows), never the fit. Default 5 ⇒ the original single-window read,
   * unchanged. Passed by /api/slots from the customer or truck interval; the customer page omits it.
   */
  displayIntervalMins?: number
  /** P1: per-order cooking reservations for the event; absent ⇒ today's projection exactly. */
  reservations?: EngineReservation[]
  /** P3: the per-truck switch. Absent/false ⇒ P2 behaviour exactly. */
  batchReservations?: boolean
}): SlotAvailabilityRow[] {
  const {
    times, productionSlotUnits, catConfigs, kitchenCapacity, capacityWindowMins,
    date, nowMins, earliestCollectionMins, eventStartMins, eventEndMins,
    basketByCat, tz, displayIntervalMins, reservations, batchReservations,
  } = params
  const displayInterval = displayIntervalMins ?? 5
  const capWindow = Math.max(1, Math.round(capacityWindowMins ?? 5))
  // "today" in the EVENT timezone — must agree with the tz-computed nowMins passed in. UTC would
  // roll over at UTC midnight and mis-flag a future event's slots as is_past.
  const today = getLocalDateInTz(tz ?? 'Europe/London')
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
  const back = projectBackwardOccupancy(productionSlotUnits, catConfigs, eventStartMins, kitchenCapacity, capWindow, reservations ?? [], batchReservations === true)
  // A collection slot at T is served by the cooking window ENDING at T (keyed T−step), NOT
  // the window starting at T — the off-by-one that blocked one slot early.
  const step = backwardWindowStepMins(catConfigs)
  // NOW-CLAMP for the per-slot basket fit below: only meaningful when the event IS today (nowMins is
  // mins-of-day, so for a future-date event it would mis-compare across days). Future event ⇒ -Inf
  // (no clamp): the legacy eventStart-only behaviour, correct because the whole event is after now.
  const nowClamp = date === today ? nowMins : Number.NEGATIVE_INFINITY

  // The dots need each slot's PREDECESSOR on the displayed grid (coverDotWindows covers the span between
  // them). Sorted once; `times` itself is not reordered.
  const orderedMins = [...times].map(t => parseMins(t.collection_time)).sort((a, b) => a - b)
  const prevOf = (m: number): number | null => { const i = orderedMins.indexOf(m); return i > 0 ? orderedMins[i - 1] : null }

  return times.map(s => {
    const slotMins = parseMins(s.collection_time)
    const isGrace = eventEndMins !== undefined && slotMins > eventEndMins
    // PAST = genuinely elapsed only (slot strictly before now, event tz). The flat +5 "lead" is GONE
    // (V7.1): the SINGLE readiness lead is now earliestCollectionMins (prep + queue + extraWait, via
    // calcMinReadyMins) carried by tooSoon. So available folds ONE prep-based floor, not two — the
    // ASAP slot (getAsapSlot, gated on available) now equals the earliest slot the picker allows.
    const isPast = !isGrace && date === today && slotMins < nowMins
    const tooSoon = !isPast && slotMins < earliestCollectionMins

    let tone: SlotTone
    let boundBy: string | null
    let bindCurrent: number
    let bindCap: number
    let windowToneForAvailable: SlotTone = 'green'
    if (hasBasket) {
      // Operator/customer placing THIS order: does it fit the backward windows ending at S?
      const fit = fitOrderBackward(back, slotMins, basket, catConfigs, kitchenCapacity, eventStartMins, capWindow, nowClamp, productionSlotUnits[s.collection_time] || {})
      tone = fit.tone
      boundBy = fit.bound_by
      bindCurrent = 0
      bindCap = kitchenCapacity ?? UNLIMITED
    } else {
      // No basket (customer initial view / dashboard list). §31-COMPLIANT DISPLAY DOT = COOKING-WINDOW
      // OCCUPANCY: read the SINGLE cooking window ENDING at this collection slot (keyed slotMins − step),
      // EXACTLY as buildSlotIndicators does (slot-display.ts:87), so /api/slots's dot and the strip agree
      // and both equal the engine's per-window occupancy. The dot shows "what's IN THE OVEN per window"
      // (§31:3147), NOT a fit/lead verdict — that verdict belongs to the PICKER (the hasBasket branch
      // above, via fitOrderBackward → loadRunsOffFront, §31:3149-3151). A parallel display calc (the
      // §38 loadRunsOffFront + worst-window scan) is forbidden here (§31:3174, §31:3164-3168) and was
      // reverted.
      // §31 EVENT-START PILE-UP: the event-start slot's dot reads the RAW piled total from the engine's
      // display-only pileByStart (keyed by eventStartMins ⇒ hits ONLY the event-start collection slot);
      // every other slot keeps the §39 single-window occupancy read. ONE engine-computed field, also read
      // by buildSlotIndicators (the strip), so the API dot and the strip cannot diverge.
      // 🔴 AT 5 THIS IS THE ORIGINAL LINE, UNTOUCHED. Only a 10–30 display grid takes the covering read.
      // 18 September 2026: ONE shared read for every dot — dotOccupancyAt. Its `window` is the line above,
      // byte-for-byte; its `tone` is that window's tone OR, on a grid finer than the prep, the rolling
      // load an order at T would share (see the helper). 🔴 `available` BELOW KEEPS TODAY'S WINDOW TONE:
      // the customer's empty-basket list gates on it, and the times offered to customers must not move.
      const read = dotOccupancyAt(back, slotMins, prevOf(slotMins), step, eventStartMins, catConfigs, kitchenCapacity, displayInterval, batchReservations === true)
      const w = read.window
      tone = read.tone
      boundBy = w?.bound_by ?? null
      bindCurrent = Math.round(w?.total ?? 0)
      bindCap = kitchenCapacity ?? UNLIMITED
      windowToneForAvailable = w?.tone ?? 'green'
    }

    // The offered/available verdict reads the window tone (today's), never the display tone.
    const capacityAvailable = (hasBasket ? tone : windowToneForAvailable) !== 'red'
    const w = back.byStart.get(slotMins - step) ?? null
    const bindRemaining = w ? (kitchenCapacity == null ? UNLIMITED : Math.max(0, Math.round(w.remainingTotal))) : (kitchenCapacity ?? UNLIMITED)

    return {
      collection_time: s.collection_time,
      production_slot: s.production_slot,
      // Pass through the route-resolved window key (= write key) for the display read. Fall back to
      // collection_time when the route didn't attach one (empty-collection_times truck ⇒ write also keys by ct).
      production_window_key: s.production_window_key ?? s.collection_time,
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

/**
 * ── 🔴 THE WIDER-GRID DOT READ (16 September 2026) — DISPLAY ONLY, READS THE ENGINE, COMPUTES NOTHING ──
 *
 * WHY IT EXISTS. A dot at collection time T reads the ONE cooking window ending at T
 * (`byStart.get(T − step)`). That is exact while the displayed grid step equals the cooking step (5 and
 * 5). On a 15-minute display grid with 5-minute cooking windows, two of every three windows are on NO dot:
 * 🧪 3 pizzas collected 18:10 / batch 2 seat in windows starting 18:00 (2) and 18:05 (1); the 18:00 dot
 * reads 17:55 (empty) and the 18:15 dot reads 18:10 (empty) — a full batch cooking, both dots green.
 *
 * WHAT IT DOES. A dot at T covers every window in `back.byStart` whose window ENDS in (T_prev, T] — i.e.
 * startMins in (T_prev − step, T − step] — never earlier than the event start; the FIRST dot also covers
 * `back.pileByStart` for the event start (pre-open load), so the pile stays visible even when the event
 * start is not itself a displayed time (clock anchoring: a 17:50 start puts the pile on the 18:00 dot).
 *   tone         = the WORST covered tone
 *   byCat/total  = the covered window with the HIGHEST total (the PEAK), so the count is a real
 *                  concurrency, never a sum across windows — three windows of 2 are not "6"
 *   bound_by     = that peak window's, and `peak: true` so the label can say "peak 2 Pizzas"
 * INVARIANT (10–30): every non-empty byStart window and the pile land on EXACTLY ONE dot.
 *
 * 🔴 IT IS ONLY CALLED WHEN THE DISPLAY INTERVAL IS 10–30. At 5, both readers run their original single-
 * window line unchanged, so a 5-minute truck's dots are byte-identical to before. The gate is at each
 * call site, deliberately in the open, so `git diff` shows the original expression intact.
 * 🔴 IT DOES NOT TOUCH `byStart`, `pileByStart`, `windows` OR ANYTHING ELSE ON `back` — it reads.
 */
export interface CoveredDotWindow extends BackwardWindow {
  /** True when this dot summarises more than one window and its count is the peak, not a total. */
  peak: boolean
}

export function coverDotWindows(
  back: { byStart: Map<number, BackwardWindow>; pileByStart: Map<number, BackwardWindow>; intervals: CookInterval[]; batchByCat: Record<string, number> },
  slotMins: number,
  prevSlotMins: number | null,
  step: number,
  eventStartMins: number,
): CoveredDotWindow | null {
  const covered: BackwardWindow[] = []
  // The first displayed dot carries the pre-open pile, whatever time it is at.
  if (prevSlotMins === null) {
    const pile = back.pileByStart.get(eventStartMins)
    if (pile) covered.push(pile)
  }
  // Windows ENDING in (T_prev, T] ⇒ starting in (T_prev − step, T − step]; never before the event start,
  // because everything before it is already summed into the pile above.
  const lo = prevSlotMins === null ? eventStartMins : Math.max(eventStartMins, prevSlotMins - step + 1)
  const hi = slotMins - step
  for (const [startMins, w] of back.byStart) {
    if (startMins < lo || startMins > hi) continue
    if (w.total <= 1e-9 && w.tone === 'green') continue           // empty windows carry nothing
    covered.push(w)
  }
  if (covered.length === 0) return null

  // ── 🔴 THE DOT REPORTS ITS OWN STRETCH (19 September 2026) ────────────────────────────────────────
  // This used to answer `{ ...peakW, tone: worst.tone }` — the record of the fullest window it covered.
  // That window's `byCat`, `remainingByCat`, `total` and `bound_by` describe ITS OWN prep-length span,
  // which on a misaligned board begins before the stretch this dot stands for. Dominic's 12:15 dot on a
  // 15-minute grid covered the window at 11:50, whose own [11:50, 12:05) really does hold 8 of 8 — so the
  // dot reported 8/8 and went red, while its own stretch [12:00, 12:15) held 4 and had room for 2 more.
  // One wrong record produced three wrong answers: the label read 8, the tone read red, and /api/slots'
  // `available` read false, which made getAsapSlot skip the time and ASAP disagree with the picker.
  // (docs/full-batch-bookable-bug-report.md.)
  //
  // The record is now BUILT for [from, slotMins) — the same span the label sums and the same one
  // reserveBatches judges — by the same rules the window builder uses: `byCat` is the items cooking in
  // the stretch (each batch counted once), `remainingByCat` is batch − the stretch's PEAK, `total` is the
  // stretch's peak concurrency, and the tone falls out of those. Nothing here reads a neighbour.
  // = slotMins − max(prep, grid). The FIRST listed dot has no predecessor and stands for everything since
  // the event opened, so its stretch reaches back to the open (or a prep before the dot, whichever is
  // earlier) — otherwise a cohort cooking between the open and the first time would light no dot at all.
  const from = prevSlotMins === null
    ? Math.min(eventStartMins, slotMins - step)
    : Math.min(prevSlotMins, slotMins - step)

  // ⚠️ THE EVENT-START PILE KEEPS TODAY'S ANSWER. §31's first dot shows the RAW PILED COUNT — load that
  // could not seat in a real pre-open window — which is not a fact about any span and cannot be rebuilt
  // from the intervals. When the pile is covered this returns exactly what it always did.
  const pileCovered = prevSlotMins === null && back.pileByStart.has(eventStartMins)
  let worst = covered[0]
  let peakW = covered[0]
  for (const w of covered) {
    if (RANK[w.tone] > RANK[worst.tone]) worst = w
    if (w.total > peakW.total) peakW = w
  }
  if (pileCovered) {
    return {
      ...peakW,
      tone: worst.tone,
      bound_by: worst === peakW ? peakW.bound_by : (worst.bound_by ?? peakW.bound_by),
      peak: covered.length > 1,
    }
  }

  // The kitchen ceiling is not a parameter here, so it is recovered from a covered window: every window
  // records `remainingTotal = kc − total`, so `total + remainingTotal === kc` exactly. All-Infinity ⇒ no
  // ceiling is set, and `remainingTotal` stays Infinity as it does everywhere else.
  let kc: number | null = null
  for (const w of covered) if (Number.isFinite(w.remainingTotal)) { kc = w.total + w.remainingTotal; break }

  const byCat: Record<string, number> = {}
  for (const iv of back.intervals) {
    if (!iv.cat || iv.items <= 0 || iv.endMins <= iv.startMins) continue
    if (iv.startMins < slotMins && from < iv.endMins) byCat[iv.cat] = (byCat[iv.cat] || 0) + iv.items
  }
  const remainingByCat: Record<string, number> = {}
  let tone: SlotTone = 'green'
  let bound_by: string | null = null
  let bindRank = -1
  let bindUsed = -1
  for (const cat of Object.keys(byCat)) {
    const batch = back.batchByCat[cat]
    if (batch == null) continue
    const used = categoryLoadOver(back.intervals, cat, from, slotMins)     // the stretch's own peak
    remainingByCat[cat] = batch - used
    const t: SlotTone = used >= batch - EPS ? 'red' : 'amber'
    const r = RANK[t]
    if (r > bindRank || (r === bindRank && used > bindUsed)) {
      bindRank = r; bindUsed = used
      tone = t; bound_by = `${capWord(cat)} ${Math.round(used)}/${Math.round(batch)}`
    }
  }
  const conc = peakLoadOver(back.intervals, from, slotMins, false)
  if (kc != null && conc >= kc - EPS) { tone = 'red'; bound_by = 'global ceiling' }
  return {
    startMins: from,
    start: `${String(Math.floor(from / 60) % 24).padStart(2, '0')}:${String(from % 60).padStart(2, '0')}`,
    beforeEventStart: from < eventStartMins,
    byCat,
    total: conc,
    remainingByCat,
    remainingTotal: kc == null ? Infinity : kc - conc,
    tone,
    bound_by,
    peak: covered.length > 1,
  }
}

// ── THE DOT'S READ — ONE HELPER FOR EVERY DOT (18 September 2026) ──────────────────────────────────
// Called by buildSlotIndicators (Add Order list, edit picker, the day strip via /api/dashboard and the
// offline strip recompute) and by buildSlotAvailability's no-basket branch (/api/slots' `tone`). Nothing
// else reads a dot, and no surface may re-derive one.
//
// 🔴 THE PROBLEM IT CLOSES. The dot at T read only the load BOOKED AT T's own cooking window — the window
// ending at T (or, on a 10–30 grid, the windows a dot covers). On a grid finer than the prep that misses
// a batch that merely OVERLAPS: 8 pizzas @17:00 cook 16:45–17:00; a 17:05 order would cook 16:50–17:05
// and share the grill with all eight, so the picker refuses it — while the 17:05 dot, reading only the
// window keyed 16:50, stayed green with no count. Operators asked why free-looking times were refused.
//
// THE RULE. For each cooking category the ROLLING load an order collected at T would share:
//   categoryLoadOver(back.intervals, cat, T − prep_cat, T)  — the SAME helper and the SAME half-open
// overlap fitOrderBackward judges a one-batch order at T with — plus the kitchen ceiling AS THE FIT
// APPLIES IT over that same span: switch OFF, the window-scoped peak concurrency (windowScopedPeak's own
// instants — the span start and every existing start inside it); switch ON, reserveBatches' overlapping
// total. The dot's colour is the WORST of today's window read and this rolling read.
//
// 🔴 HOW IT COMBINES WITH TODAY'S READ, EXACTLY. `window` below is today's read, byte-for-byte: the
// event-start pile, else the single window ending at T on a 5-minute grid, else coverDotWindows on a
// 10–30 grid (the "peak" coverage). `tone` = max(window.tone, overlap tone). The overlap is REPORTED
// (`overlap` non-null, so a reason label can be shown) ONLY when its tone is STRICTLY WORSE than the
// window's, i.e. only when it says something the window did not. On an ALIGNED grid — the step a whole
// multiple of every cooking prep — every interval that overlaps [T − prep, T) starts exactly at T − prep,
// which is the window today's read already looks at (5-minute grids) or one of the windows the dot
// covers (10–30), so the overlap is never worse: the colour and the label are today's, by construction.
// scripts/dot-overlap-labels.cjs proves that over the aligned fixtures and a seeded sweep.
//
// 🔴 A VERDICT IS NOT READ HERE AND NONE IS CHANGED. This is display: fitOrderBackward,
// earliestBackwardFitSlot, placement, reservations, detectCapacityBreaches and /api/slots' `available`
// (which the customer's empty-basket list gates on) are untouched — `available` keeps reading today's
// window, not this tone. AGREEMENT is a property, not a coupling: a dot red by overlap for category c
// ⇔ a one-item order of c at T is refused, proven by the same harness over ≥ 2,000 states.
export type DotOverlap =
  | { kind: 'batch'; cat: string; used: number; batch: number; free: number }
  | { kind: 'kitchen'; used: number; cap: number; free: number }
export interface DotCatRead { used: number; batch: number; free: number; prepMins: number; kitchenUsed: number | null; full: boolean }
export interface DotRead {
  /** Today's read, unchanged: the pile / the window ending at T / the covered windows. */
  window: (BackwardWindow & { peak?: boolean }) | null
  /** max(window tone, overlap tone). */
  tone: SlotTone
  /** The binding rolling limit at T — null unless it is strictly worse than the window's own tone. */
  overlap: DotOverlap | null
  /** The rolling read per cooking category, for callers that must name a limit ("next free" by limit). */
  perCat: Record<string, DotCatRead>
  /** The kitchen ceiling over the longest cooking span at T, when a ceiling is set. */
  kitchen: { used: number; cap: number; free: number } | null
}
/** The kitchen's PEAK over [fromMins, toMins) for the dot — the same read under both switch states
 *  (18 September 2026; the switch-ON branch used to SUM every real interval overlapping the span, so two
 *  back-to-back batches read as one). Points count at the span's start and at cooking starts, exactly as
 *  the window's own ceiling read counts them (peakLoadOver, `includePointsInside` false). */
function kitchenLoadOver(intervals: CookInterval[], fromMins: number, toMins: number): number {
  return peakLoadOver(intervals, fromMins, toMins, false)
}
export function dotOccupancyAt(
  back: BackwardOccupancy,
  slotMins: number,
  prevSlotMins: number | null,
  step: number,
  eventStartMins: number,
  catConfigs: Record<string, CatConfig>,
  kitchenCapacity: number | null,
  displayIntervalMins: number = 5,
  batchReservations: boolean = false,
  /** Tie-break for the binding category among equals: lower rank first (menu order). Default: config order. */
  rankOf: (cat: string) => number = () => 0,
): DotRead {
  // The kitchen read no longer depends on the switch (18 September 2026: one peak under both states);
  // the parameter stays in place for its callers and the harnesses that pass it positionally.
  void batchReservations
  // 1. Today's read, byte-for-byte.
  const window = displayIntervalMins > 5
    ? coverDotWindows(back, slotMins, prevSlotMins, step, eventStartMins)
    : (back.pileByStart.get(slotMins) ?? back.byStart.get(slotMins - step) ?? null)
  const windowTone: SlotTone = window?.tone ?? 'green'

  // 2. The rolling read per cooking category over [T − prep, T).
  const perCat: Record<string, DotCatRead> = {}
  let kitchen: { used: number; cap: number; free: number } | null = null
  for (const [catRaw, cfg] of Object.entries(catConfigs)) {
    if (!cfg || !cfg.secs) continue
    const cat = catRaw.toLowerCase()
    const batch = Math.max(1, cfg.batch)
    const prepMins = Math.max(1, Math.round(cfg.secs / 60))
    const used = categoryLoadOver(back.intervals, cat, slotMins - prepMins, slotMins)
    const kitchenUsed = kitchenCapacity == null ? null : kitchenLoadOver(back.intervals, slotMins - prepMins, slotMins)
    const full = used >= batch - EPS || (kitchenUsed != null && kitchenUsed >= kitchenCapacity! - EPS)
    perCat[cat] = { used, batch, free: Math.max(0, Math.round(batch - used)), prepMins, kitchenUsed, full }
    if (kitchenUsed != null && (kitchen === null || kitchenUsed > kitchen.used)) kitchen = { used: kitchenUsed, cap: kitchenCapacity!, free: Math.max(0, Math.round(kitchenCapacity! - kitchenUsed)) }
  }

  // 3. The binding category: worst tone, then the fullest, then menu order.
  const toneOf = (r: DotCatRead): SlotTone => r.full ? 'red' : r.used > EPS ? 'amber' : 'green'
  let bindCat: string | null = null
  for (const cat of Object.keys(perCat)) {
    if (bindCat === null) { bindCat = cat; continue }
    const a = perCat[cat], b = perCat[bindCat]
    const ra = RANK[toneOf(a)], rb = RANK[toneOf(b)]
    if (ra > rb || (ra === rb && (a.used / a.batch > b.used / b.batch || (a.used / a.batch === b.used / b.batch && rankOf(cat) < rankOf(bindCat))))) bindCat = cat
  }
  const overlapTone: SlotTone = bindCat ? toneOf(perCat[bindCat]) : 'green'
  const tone: SlotTone = RANK[overlapTone] > RANK[windowTone] ? overlapTone : windowTone

  // 4. The reason, only when the rolling read is strictly worse than the window's own.
  let overlap: DotOverlap | null = null
  if (bindCat && RANK[overlapTone] > RANK[windowTone]) {
    const r = perCat[bindCat]
    const kitchenBinds = r.kitchenUsed != null && kitchenCapacity != null && (
      overlapTone === 'red' ? r.kitchenUsed >= kitchenCapacity - EPS && r.used < r.batch - EPS      // full by the ceiling, not the batch
                            : Math.max(0, kitchenCapacity - r.kitchenUsed) < r.free)                 // fewer free by the ceiling than by the batch
    overlap = kitchenBinds
      ? { kind: 'kitchen', used: Math.round(r.kitchenUsed!), cap: kitchenCapacity!, free: Math.max(0, Math.round(kitchenCapacity! - r.kitchenUsed!)) }
      : { kind: 'batch', cat: bindCat, used: Math.round(r.used), batch: r.batch, free: r.free }
  }
  return { window, tone, overlap, perCat, kitchen }
}

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
  /** DISPLAY-ONLY event-start pile-up (§31 "Event-start pre-open seating"). Keyed by eventStartMins
   *  → a synthetic window whose byCat/total is the RAW committed load at the event-start COLLECTION
   *  slot — the load that would otherwise spread into impossible pre-open windows (before the single
   *  run-up window [eventStart−prep, eventStart)). Read ONLY by the dots (buildSlotAvailability
   *  no-basket + buildSlotIndicators) so the event-start dot shows the raw piled total (6 pizzas →
   *  red 6), NOT the adjacent-window remainder (2). NOT read by the picker — byStart/intervals are
   *  untouched. Empty unless the event-start slot carries load. */
  pileByStart: Map<number, BackwardWindow>
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
  /** The cooking category this interval belongs to. ADDITIVE (17 September 2026): set for cooking
   *  batches, absent for instant points. Read ONLY by categoryLoadOver, the rolling per-category batch
   *  check. The sweep-line and every other reader ignore it. */
  cat?: string
}

/**
 * ── THE ROLLING PER-CATEGORY BATCH CHECK — ONE HELPER, EVERY READER (17 September 2026) ────────────
 * The MOST items of category `cat` on the grill at any one instant of the window [fromMins, toMins):
 * the PEAK concurrent load, not the sum of every batch that overlaps. Half-open: an interval ending
 * exactly at fromMins, or starting exactly at toMins, does NOT overlap — a batch finishing as the next
 * starts is two batches, not one — and at an instant t a batch counts iff startMins ≤ t < endMins.
 *
 * 🔴 PEAK, NOT SUM (18 September 2026, Dominic's decision — docs/peak-load-rule-report.md). The sum
 * over-counted: 5 pizzas cooking 21:55–22:10 and 8 cooking 22:10–22:25 are back to back — never more
 * than 8 in the oven — yet both overlap [22:00, 22:15), so the span summed to 13. Two back-to-back
 * batches of 4 summed to 8 and REFUSED a single pizza at 22:15 although only 5 would ever cook at once.
 * The peak is what the physical rule means — at no instant more than `batch` of a category — and it
 * is what every reader now gets: admission (reserveBatches / fitOrderBackward), the window tone,
 * the dot label (via remainingByCat) and detectCapacityBreaches, so all four agree. Peak ≤ sum, so
 * nothing the sum accepted is refused; where the grid is a whole multiple of the prep every
 * overlapping batch starts at fromMins and peak == sum, so aligned trucks are byte-identical.
 *
 * 🔴 WHY THIS EXISTS. The per-category batch used to be judged by START MINUTE alone —
 * `back.byStart.get(ws)?.byCat[cat]` in fitOrderBackward, and each window's own `byCat` for the tone —
 * which is a rolling check only while every window of a category starts on a grid at least as coarse
 * as its prep. With 5-minute collection slots and a 15-minute cook, A=8 @18:15 cooks [18:00,18:15) and
 * B=8 @18:20 cooks [18:05,18:20); they share no start minute, so 16 burgers sat on an 8-batch grill
 * from 18:05 to 18:15 and nothing said so (docs/batch-overlap-review-report.md). §31's "every rolling
 * cooking window" was a claim the batch path did not implement; the kitchen-capacity ceiling always did
 * (windowScopedPeak / concurrencyAt). This makes the batch path mean what §31 says.
 *
 * 🔴 PROVABLY A NO-OP WHEN THE COLLECTION STEP IS A MULTIPLE OF THE PREP (prep ≤ step). Every window
 * of a category then starts on the grid and is at most one step long, so two windows either share a
 * start minute or are disjoint — and the overlap sum equals the same-start sum exactly. Gusto (prep 5,
 * step 5) is that case; scripts/batch-rolling-identity.cjs proves it against the frozen baseline.
 * ⚠️ NOT a no-op when prep exceeds the step, whatever the ratio: prep 10 on a 5-minute grid overlaps
 * (A @18:10 → [18:00,18:10), B @18:15 → [18:05,18:15)). That is the case this fixes.
 *
 * 🔴 DISPLAY == PICKER by construction: fitOrderBackward's verdict and projectBackwardOccupancy's tone
 * both call this, with the same intervals. Instant points carry no `cat` and are never counted.
 */
export function categoryLoadOver(intervals: CookInterval[], cat: string, fromMins: number, toMins: number): number {
  const batches: CookInterval[] = []
  for (const iv of intervals) {
    if (iv.cat !== cat || iv.items <= 0) continue
    if (iv.endMins <= iv.startMins) continue                       // a point is never a batch
    batches.push(iv)
  }
  return peakLoadOver(batches, fromMins, toMins, false)
}

/**
 * ── THE ONE PEAK (18 September 2026) ────────────────────────────────────────────────────────────
 * The most counted items present at any one instant of [fromMins, toMins), read with concurrencyAt —
 * reals cover [start, end), a zero-width point hits only its own instant. The load is piecewise
 * constant and rises only where something STARTS, so the peak is attained at fromMins or at a start
 * inside the span; those are the only instants read. Half-open throughout: a batch ending at an
 * instant has left it, one starting there is in it — touching batches never share an instant.
 *
 * `includePointsInside` says whether a zero-width instant point strictly inside the span, at no
 * cooking start, is an evaluated instant:
 *   • false — the DISPLAY and BREACH reads (the window's ceiling `conc`, kitchenLoadOver, and the
 *     per-category batch via categoryLoadOver, where there are no points anyway). Points count at
 *     the span's start and at cooking starts, exactly as today's window read counts them; a point
 *     seated strictly inside is read by the window it keys (capacity step), as before. This is what
 *     keeps an aligned grid byte-identical: no cooking start lies strictly inside an aligned window.
 *   • true — ADMISSION (reserveBatches' per-window ceiling and windowScopedPeak): every instant the
 *     order's span covers, points included, so no admitted order can put the kitchen over the cap at
 *     any minute. windowScopedPeak has always read points inside an order's span; reserveBatches
 *     now sees them too, which can only tighten toward the verdict windowScopedPeak already gave.
 *
 * Every ceiling and batch reader goes through here: categoryLoadOver, kitchenLoadOver, the window
 * builder's `conc`, reserveBatches, windowScopedPeak. One implementation, so a sum can never creep
 * back into one of them alone (docs/peak-ceiling-rule-report.md).
 */
export function peakLoadOver(intervals: CookInterval[], fromMins: number, toMins: number, includePointsInside: boolean): number {
  if (toMins <= fromMins) return 0
  const instants = new Set<number>([fromMins])
  for (const iv of intervals) {
    if (iv.items <= 0) continue
    if (iv.startMins <= fromMins || iv.startMins >= toMins) continue
    if (iv.endMins > iv.startMins || includePointsInside) instants.add(iv.startMins)
  }
  let peak = 0
  for (const t of instants) { const c = concurrencyAt(intervals, t); if (c > peak) peak = c }
  return peak
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

// WINDOW-SCOPED peak concurrency — the ceiling peak ONLY at instants the `focus` intervals (a NEW
// order's cooking + its instant points) occupy, evaluated against the FULL `allIntervals` set. This
// answers "does adding THIS order breach the ceiling in a window IT occupies?" — an unrelated earlier
// over-capacity window (e.g. a prior override breach) the order doesn't touch must NOT block it
// (the GLOBAL maxConcurrentCount red-ed out every slot post-breach → null ASAP everywhere). It
// NARROWS the instant set ONLY: at each evaluated instant, concurrencyAt(allIntervals, t) still
// counts the order PLUS every existing batch covering t (incl. boundary-spanning ones — the §31
// sweep-line). Concurrency is piecewise-constant, rising only at interval STARTS, so the peak within
// the order's cooking spans is hit at one of: the order's own interval starts (cooking + points), OR
// any allIntervals start that falls inside an order COOKING span [oS,oE) — evaluating both catches a
// spanning existing batch that begins mid-order-window (the no-oversell requirement).
// ── DESCRIPTIVE FIT DETAIL — WHY A SLOT DOES NOT FIT (18 September 2026) ───────────────────────────
// 🔴 PURELY DESCRIPTIVE. Nothing here decides anything. Every number below is recorded AT THE POINT THE
// VERDICT IS ALREADY BEING MADE, from the same values that made it, so the popup cannot contradict the
// engine. The old confirm re-derived its own totals from bound_by and printed a combined figure ("it
// would need 16") that exists nowhere in the kitchen: 16 is two separate batches of 8, never sixteen
// pizzas in one oven. The operator's question is "which batch is full, and by how much" — these fields
// answer exactly that and nothing else.
// ⚠️ `cat` is the ENGINE'S LOWERCASE KEY, deliberately. The stored display name lives in
// menu_categories.name and this module has never seen it; the caller maps key → name with the map it
// already holds. Putting a capWord() guess in here would print "Pizza" for a category stored as "PIZZA".

/** One cooking window this order occupies, for ONE category. */
export interface FitWhyWindow {
  /** Window start, minutes from midnight (inclusive). */
  startMins: number
  /** Window end, minutes from midnight (exclusive) — startMins + the category's prep. */
  endMins: number
  /** Rolling load of OTHER orders across this window — categoryLoadOver's own answer, not a re-read. */
  existing: number
  /** batch − existing, floored at 0. What this window could still take. */
  free: number
  /** This order's items cooking in THIS window (one batch, except the last which may be a part batch). */
  share: number
}

/** A category whose batch ceiling blocks this slot. */
export interface FitWhyBatch {
  kind: 'batch'
  /** Lowercase engine key — the caller maps it to the stored display name. */
  cat: string
  /** Items per batch (cfg.batch). */
  batch: number
  /** Minutes per batch (cfg.secs / 60, rounded). */
  prepMins: number
  /** Every window this order occupies for this category, EARLIEST FIRST. */
  windows: FitWhyWindow[]
}

/** The shared kitchen ceiling, at the instant it peaked. */
export interface FitWhyKitchen {
  kind: 'kitchen'
  /** kitchen_capacity. */
  cap: number
  /** The window the peak instant falls in (the order's own cooking window, or the capacity cadence). */
  startMins: number
  endMins: number
  /** Items OTHER orders have cooking at that instant. */
  existing: number
  /** Items THIS order adds at that instant. existing + add === the `peak` field above. */
  add: number
}

/** Cooking that would have to start before the event opens. */
export interface FitWhyPreOpen {
  kind: 'preopen'
  cat: string
  /** Event start, minutes from midnight. */
  eventStartMins: number
}

/** Ordered blocking reasons: batch first, then kitchen, then pre-open. Empty when fits is true. */
export type FitWhy = Array<FitWhyBatch | FitWhyKitchen | FitWhyPreOpen>

/**
 * WHERE the window-scoped peak happened, and how it splits between existing load and this order.
 * 🔴 IT IS THE SAME CALCULATION AS windowScopedPeak, NOT A SECOND ONE: identical instant set, and the
 * count comes from the same `concurrencyAt` primitive. windowScopedPeak stays byte-identical (it is one
 * of the frozen §31 symbols) so this records the argmax alongside it instead of changing it.
 * scripts/add-order-fit-message.cjs asserts `existing + add === fit.peak` on every swept fixture, so the
 * two can never drift apart unnoticed.
 */
function peakDetailOver(allIntervals: CookInterval[], focus: CookInterval[], capacityStep: number): { instant: number; total: number; add: number; startMins: number; endMins: number } | null {
  if (!focus.length) return null
  const instants = new Set<number>()
  const cookingSpans: Array<[number, number]> = []
  for (const f of focus) {
    if (f.items <= 0) continue
    instants.add(f.startMins)
    if (f.endMins > f.startMins) cookingSpans.push([f.startMins, f.endMins])
  }
  if (!instants.size) return null
  for (const iv of allIntervals) {
    if (iv.items <= 0) continue
    for (const [oS, oE] of cookingSpans) {
      if (iv.startMins >= oS && iv.startMins < oE) { instants.add(iv.startMins); break }
    }
  }
  let best = -1, total = 0
  for (const t of instants) { const c = concurrencyAt(allIntervals, t); if (c > total) { total = c; best = t } }
  if (best < 0) return null
  const add = concurrencyAt(focus, best)
  // Name the window the peak sits in: the order's own cooking window containing it, else the capacity
  // cadence starting there (an instant-only order has no cooking span to name).
  let startMins = best, endMins = best + capacityStep
  for (const f of focus) {
    if (f.endMins > f.startMins && f.startMins <= best && best < f.endMins) { startMins = f.startMins; endMins = f.endMins; break }
  }
  return { instant: best, total, add, startMins, endMins }
}

// 18 September 2026: the SAME instant set as before — each order cooking span [oS, oE) is read by
// peakLoadOver with points included (oS itself, every start inside, points inside), and each of the
// order's own instant points at its instant — now through the one peak implementation. What it counts
// is unchanged; scripts/peak-ceiling-rule.cjs holds the old body and proves the verdicts identical.
function windowScopedPeak(allIntervals: CookInterval[], focus: CookInterval[]): number {
  let peak = 0
  let any = false
  for (const f of focus) {
    if (f.items <= 0) continue
    any = true
    const c = f.endMins > f.startMins
      ? peakLoadOver(allIntervals, f.startMins, f.endMins, true)   // the span: its start, every start inside, points inside
      : concurrencyAt(allIntervals, f.startMins)                    // the order's own point, at its instant
    if (c > peak) peak = c
  }
  return any ? peak : 0
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
  // NOW-CLAMP (event-tz mins-of-day; default -Inf = no clamp, e.g. a future-date event). An instant
  // capacity point can't be seated before now — you can't use elapsed oven time. NEGATIVE_INFINITY
  // preserves the legacy event-start-only behaviour for callers that don't pass it / future events.
  nowMins: number = Number.NEGATIVE_INFINITY,
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
    // Front floor = max(eventStart pre-open allowance, NOW). The eventStart side keeps its one pre-open
    // capacity window (`- capacityStep`, the "ready at start" pre-prep credit); the NOW side has NO
    // allowance — cooking/seating cannot start in an elapsed window. So instant points seat no earlier
    // than max(eventStartMins - capacityStep, nowMins).
    if (w < Math.max(eventStartMins - capacityStep, nowMins)) return { points, runsOffFront: true }
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

/**
 * Which STORED production slots have cooking load overlapping the window span [fromMins, toMins)?
 *
 * DISPLAY-ONLY, for naming the orders an operator would have to move. Shares the seating cadence with
 * projectBackwardOccupancy below (same `numWindows = ceil(N/batch)` reaching back `numWindows*prep`
 * from the deadline) so the two can't disagree about which slots feed a window.
 *
 * 🔴 HARD LIMIT — this returns SLOTS, never orders, and that is not a shortcut. `productionSlotUnits`
 * is a per-slot AGGREGATE: 5 pizzas at 18:30 may be two orders, and the units that spill backward from
 * it into an earlier window belong to those orders JOINTLY. There is no information anywhere in the
 * projection that could attribute a spilled unit to one order — CookInterval carries no provenance and
 * the source deadline is discarded during seating. Callers must list orders BY COLLECTION SLOT with
 * their own quantities, and must not imply which order supplied which unit.
 */
export function contributingProductionSlots(
  productionSlotUnits: Record<string, QtyByCat>,
  catConfigs: Record<string, CatConfig>,
  fromMins: number,
  toMins: number,
  capacityWindowMins: number = 5,
): string[] {
  const capacityStep = Math.max(1, Math.round(capacityWindowMins))
  const out: string[] = []
  for (const [ps, units] of Object.entries(productionSlotUnits || {})) {
    const deadline = parseMins(ps)
    let overlaps = false
    for (const [catRaw, rawN] of Object.entries(units || {})) {
      const cfg = catConfigs[catRaw.toLowerCase()]
      const N = Number(rawN) || 0
      if (!cfg || N <= 0) continue
      if (!cfg.secs) {
        // Ticked instant load seats as a single point at deadline − capacityStep (see the seating loop).
        if (cfg.countsToCapacity) {
          const at = deadline - capacityStep
          if (at >= fromMins && at < toMins) overlaps = true
        }
        continue
      }
      const batch = Math.max(1, cfg.batch)
      const prep = Math.max(1, Math.round(cfg.secs / 60))
      const numWindows = Math.ceil(N / batch)
      // Cooking occupies [deadline − numWindows*prep, deadline). Overlaps the span iff it starts
      // before the span ends AND ends after the span starts.
      if (deadline - numWindows * prep < toMins && deadline > fromMins) overlaps = true
    }
    if (overlaps) out.push(ps)
  }
  return out.sort((a, b) => parseMins(a) - parseMins(b))
}

// ── COOKING RESERVATIONS — PHASE P1 (18 September 2026): the ENGINE INPUT, no behaviour change ────────
// An order may carry `orders.cooking_reservation`: the cooking windows it was seated in when it was
// placed (P2 writes today's split of the order's own items). projectBackwardOccupancy can now be handed
// those reservations. In THIS phase they are used under one strict rule, chosen so the output is byte-
// identical to seating the slot total with today's split:
//   a (slot, category) is seated from its reservation ONLY when exactly ONE counting order at that slot
//   carries a reservation for the category, its items equal the slot's stored total for the category,
//   and it was computed with the category's current batch and prep. Anything else — two orders sharing
//   a slot, a stale batch, a missing reservation, an instant category — falls back to today's split.
// Why so strict: storage holds per-slot TOTALS. Two orders of 5 at one slot are seated by today's rule
// as 8 + 2 across two windows; their two per-order reservations say 5 + 5 in the nearest window. Neither
// seating them verbatim nor mixing one reservation with a fallback remainder reproduces 8 + 2 — only
// "sole reservation equal to the total" does, and then only because P2 wrote today's split. P3 changes
// the rule; this phase changes nothing an operator or customer can see (scripts/batch-reservation-p2-
// identity.cjs proves it over 5,000 random sequences, and the committed golden still passes).
/** One cooking window an order was seated in. Minutes from midnight; endMins = startMins + prep. */
export interface CookingReservationWindow { startMins: number; endMins: number; items: number }
/** What the ENGINE needs from a stored reservation. Built from orders.cooking_reservation by
 *  readCookingReservations (lib/slot-bookings.ts); never read from the row by anything else. */
export interface EngineReservation {
  orderKey: string
  /** The order's collection time, "HH:MM" — the slot whose stored total it is part of. */
  slot: string
  /** 'override' = placed anyway over the batch (P4); read by detectCapacityBreaches to name the order. */
  source?: 'fit' | 'override'
  cats: Record<string, { items: number; batch: number; prepMins: number; windows: CookingReservationWindow[] }>
}

/** P3 projection: every VALID reservation at (slot, cat) — the batch and prep must match the current
 *  config — and the items they account for. Pure. */
export function validReservationsAt(reservations: EngineReservation[] | undefined, slot: string, cat: string, batch: number, prepMins: number): { windows: CookingReservationWindow[]; items: number } {
  const windows: CookingReservationWindow[] = []; let items = 0
  for (const r of reservations || []) {
    if (r.slot !== slot) continue
    const c = r.cats?.[cat]; if (!c) continue
    if (c.batch !== batch || c.prepMins !== prepMins) continue
    const ws = (c.windows || []).filter(w => w.items > 0 && w.endMins - w.startMins === prepMins)
    if (!ws.length) continue
    windows.push(...ws); items += ws.reduce((a, w) => a + w.items, 0)
  }
  return { windows: windows.sort((a, b) => a.startMins - b.startMins), items }
}

/** P1/P2 IDENTITY RULE — the windows to seat for (slot, cat), or null ⇒ today's split. Pure. */
export function cachedReservationWindows(
  reservations: EngineReservation[] | undefined,
  slot: string,
  cat: string,
  totalItems: number,
  batch: number,
  prepMins: number,
): CookingReservationWindow[] | null {
  if (!reservations || !reservations.length) return null
  let found: EngineReservation['cats'][string] | null = null
  let count = 0
  for (const r of reservations) {
    if (r.slot !== slot) continue
    const c = r.cats?.[cat]
    if (!c) continue
    count++; found = c
  }
  if (count !== 1 || !found) return null                         // sole reservation at this slot+cat, or fallback
  if (Math.round(found.items) !== Math.round(totalItems)) return null   // it must account for the WHOLE stored total
  if (found.batch !== batch || found.prepMins !== prepMins) return null // computed with the current config
  const ws = (found.windows || []).filter(w => w.items > 0)
  if (!ws.length) return null
  const sum = ws.reduce((a, w) => a + w.items, 0)
  if (Math.round(sum) !== Math.round(totalItems)) return null
  if (ws.some(w => w.endMins - w.startMins !== prepMins)) return null
  return [...ws].sort((a, b) => a.startMins - b.startMins)
}

// ── reserveBatches — DOMINIC'S RULE, the shared helper for P3 (18 September 2026) ───────────────────
// NOT CALLED BY fitOrderBackward YET. It exists now so its behaviour is pinned by tests before anything
// depends on it (scripts/batch-reservation-helper.cjs). The rule, verbatim from the decision:
//   • an order of a category uses EXACTLY ceil(items / batch) back-to-back windows ending at T;
//   • an order that fits one batch is never split;
//   • it fits if those windows' free space adds up (rolling load, half-open, as categoryLoadOver reads it);
//   • it reserves nearest-first (freshest food);
//   • the pre-open floor (eventStart − prep) and the now-clamp apply to the earliest window.
// Free space is min(batch − category load, kc − total load) per window; the caller re-checks the
// kitchen ceiling across categories with the sweep-line exactly as today.
export interface ReserveBatchesWindow { startMins: number; endMins: number; existing: number; free: number; share: number }
export function reserveBatches(args: {
  intervals: CookInterval[]
  cat: string
  slotMins: number
  items: number
  batch: number
  prepMins: number
  kitchenCapacity: number | null
  /** Earliest minute a window may START (eventStartMins − prep, the one pre-open run-up). */
  floorMins: number
  nowMins?: number
}): { fits: boolean; windows: ReserveBatchesWindow[]; reason: 'ok' | 'batch' | 'preopen' | 'now' } {
  const { intervals, cat, slotMins, items, batch, prepMins, kitchenCapacity, floorMins } = args
  const nowMins = args.nowMins ?? Number.NEGATIVE_INFINITY
  const B = Math.max(1, batch), P = Math.max(1, prepMins)
  const nw = Math.max(1, Math.ceil(items / B))
  const windows: ReserveBatchesWindow[] = []
  for (let i = 0; i < nw; i++) {
    const ws = slotMins - (i + 1) * P
    const existing = categoryLoadOver(intervals, cat, ws, ws + P)
    let free = B - existing
    if (kitchenCapacity != null) {
      // 18 September 2026: the PEAK in the kitchen over this window, points inside included — the
      // instants windowScopedPeak reads for the same span — not the sum of every real overlapping it.
      const total = peakLoadOver(intervals, ws, ws + P, true)
      free = Math.min(free, kitchenCapacity - total)
    }
    windows.push({ startMins: ws, endMins: ws + P, existing, free: Math.max(0, free), share: 0 })
  }
  const earliest = windows[windows.length - 1].startMins
  if (earliest < floorMins) return { fits: false, windows, reason: 'preopen' }
  if (earliest < nowMins) return { fits: false, windows, reason: 'now' }
  let rem = items
  for (const w of windows) { const take = Math.min(rem, w.free); if (take > 0) { w.share = take; rem -= take } }   // nearest-first
  if (rem > 0) { for (const w of windows) w.share = 0; return { fits: false, windows, reason: 'batch' } }
  return { fits: true, windows, reason: 'ok' }
}

// ── buildAdmittedReservation — WHAT A PLACEMENT STORES, switch ON (P3 + P4) ───────────────────────
// From the SAME projection the admission used (`back`), for the order's own categories at its slot:
//   • fits (every cooking category's reserveBatches fits) ⇒ source 'fit', its nearest-first windows;
//   • otherwise — "Place it anyway", any manual placement that does not fit, or an edit the operator
//     confirmed — source 'override': greedy where there is free space, and the SHORTFALL goes into the
//     NEAREST window, over the batch. An order of ≤ batch items still uses one window (all of it there).
// The dot then shows the true over-count in red (the projection seats this verbatim) and
// detectCapacityBreaches names the order. Instant categories reserve nothing, as in P2.
export function buildAdmittedReservation(args: {
  back: BackwardOccupancy
  slotLabel: string
  qtyByCat: QtyByCat
  catConfigs: Record<string, CatConfig>
  kitchenCapacity: number | null
  eventStartMins: number
  capacityWindowMins: number
  nowMins?: number
  gridIntervalMins?: number | null
}): { fits: boolean; record: { v: 1; source: 'fit' | 'override'; slot: string; computed: { eventStartMins: number; capacityWindowMins: number; kitchenCapacity: number | null; gridIntervalMins: number | null }; cats: Record<string, { items: number; batch: number; prepMins: number; windows: CookingReservationWindow[] }> } | null } {
  const { back, slotLabel, qtyByCat, catConfigs, kitchenCapacity, eventStartMins, capacityWindowMins } = args
  const slotMins = parseMins(slotLabel)
  const cats: Record<string, { items: number; batch: number; prepMins: number; windows: CookingReservationWindow[] }> = {}
  let fits = true
  for (const [catRaw, rawM] of Object.entries(qtyByCat)) {
    const cat = catRaw.toLowerCase(); const cfg = catConfigs[cat]; const M = Number(rawM) || 0
    if (!cfg || !cfg.secs || M <= 0) continue
    const batch = Math.max(1, cfg.batch), prep = Math.max(1, Math.round(cfg.secs / 60))
    const r = reserveBatches({ intervals: back.intervals, cat, slotMins, items: M, batch, prepMins: prep, kitchenCapacity, floorMins: eventStartMins - prep, nowMins: args.nowMins })
    let windows: CookingReservationWindow[]
    if (r.fits) windows = r.windows.filter(w => w.share > 0).map(w => ({ startMins: w.startMins, endMins: w.endMins, items: w.share }))
    else {
      fits = false
      // greedy into free space nearest-first, then the shortfall into the NEAREST window, over the batch
      let rem = M; const shares = r.windows.map(w => { const t = Math.min(rem, Math.max(0, w.free)); rem -= t; return t })
      if (rem > 0) shares[0] += rem
      windows = r.windows.map((w, i) => ({ startMins: w.startMins, endMins: w.endMins, items: shares[i] })).filter(w => w.items > 0)
    }
    cats[cat] = { items: M, batch, prepMins: prep, windows: windows.sort((a, b) => a.startMins - b.startMins) }
  }
  if (!Object.keys(cats).length) return { fits, record: null }
  return { fits, record: { v: 1, source: fits ? 'fit' : 'override', slot: slotLabel, computed: { eventStartMins, capacityWindowMins, kitchenCapacity, gridIntervalMins: args.gridIntervalMins ?? null }, cats } }
}

export function projectBackwardOccupancy(
  productionSlotUnits: Record<string, QtyByCat>,
  catConfigs: Record<string, CatConfig>,
  eventStartMins: number,
  kitchenCapacity: number | null,
  capacityWindowMins: number = 5,
  // P1 (18 September 2026): per-order cooking reservations, used ONLY under cachedReservationWindows'
  // identity rule. Absent or empty ⇒ this function is byte-for-byte today's.
  reservations: EngineReservation[] = [],
  // P3 (18 September 2026): the per-truck switch. ON ⇒ every valid reservation is seated verbatim and
  // only the UNRESERVED remainder of each slot total takes today's split (so an order placed before the
  // switch, with no reservation, keeps exactly its current arrangement). OFF ⇒ P2's identity rule.
  batchReservations: boolean = false,
): BackwardOccupancy {
  // Accumulate COOKING load per window-start minute → { cat: items } (drives per-category batch tones).
  const loadByStart = new Map<number, Record<string, number>>()
  const batchByCat: Record<string, number> = {}
  // Each cooking category's window length, so the rolling tone below spans [start, start+prep) for THAT
  // category — categories with different preps share a start minute but not a span.
  const prepByCat: Record<string, number> = {}
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
      prepByCat[cat] = prepMins
      const numWindows = Math.ceil(N / batch)
      const earliestWindowMins = deadline - numWindows * prepMins
      if (earliestWindowMins < eventStartMins) {
        cantFit.push({ productionSlot: ps, cat, qty: N, earliestWindowMins, eventStartMins })
      }
      // P1: a SOLE reservation that accounts for this slot's whole category total is seated verbatim
      // (earliest window first, the same order the loop below produces). Everything else — including
      // every slot shared by two orders — takes today's split below. See cachedReservationWindows.
      const cached = batchReservations ? null : cachedReservationWindows(reservations, ps, cat, N, batch, prepMins)
      if (cached) {
        for (const rw of cached) {
          const w = loadByStart.get(rw.startMins) ?? {}
          w[cat] = (w[cat] || 0) + rw.items
          loadByStart.set(rw.startMins, w)
          cookIntervals.push({ startMins: rw.startMins, endMins: rw.endMins, items: rw.items, cat })
        }
        continue
      }
      // P3 (switch ON): seat every valid reservation at this slot verbatim — including an override's
      // over-the-batch nearest window, which is how the dot shows the true over-count — then fall through
      // to today's split for whatever part of the stored total is NOT reserved (pre-switch orders).
      let seatN = N
      if (batchReservations) {
        const v = validReservationsAt(reservations, ps, cat, batch, prepMins)
        for (const rw of v.windows) {
          const w = loadByStart.get(rw.startMins) ?? {}
          w[cat] = (w[cat] || 0) + rw.items
          loadByStart.set(rw.startMins, w)
          cookIntervals.push({ startMins: rw.startMins, endMins: rw.endMins, items: rw.items, cat })
        }
        seatN = Math.max(0, N - v.items)
        if (seatN <= 0) continue
      }
      // Seat batches backward on the PREP grid (UNCHANGED): earliest windows full (batch), the
      // window ADJACENT to collection holds the remainder N − batch*(numWindows-1) ∈ [1, batch].
      // Each window is ALSO a [S, S+prep) concurrency interval for the global sweep.
      const numWindowsSeat = batchReservations ? Math.ceil(seatN / batch) : numWindows
      for (let i = 0; i < numWindowsSeat; i++) {
        const startMins = deadline - (numWindowsSeat - i) * prepMins
        const isAdjacent = i === numWindowsSeat - 1
        const items = isAdjacent ? seatN - batch * (numWindowsSeat - 1) : batch
        const w = loadByStart.get(startMins) ?? {}
        w[cat] = (w[cat] || 0) + items
        loadByStart.set(startMins, w)
        cookIntervals.push({ startMins, endMins: startMins + prepMins, items, cat })
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
      // 🔴 ROLLING PER-CATEGORY TONE (17 September 2026). `byCat` (the LABEL) is still this start
      // minute's own load, unchanged. The TONE, `remainingByCat` and `bound_by` now use the rolling
      // category load over this window's span [startMins, startMins + prep_cat) — every batch of the
      // category overlapping it, via the SAME categoryLoadOver the picker uses — so two half-overlapping
      // full batches read red here exactly as fitOrderBackward refuses them. Identical to the old
      // per-start value whenever the collection step is a multiple of the prep (see the helper).
      // remainingByCat = batch − rolling load: detectCapacityBreaches reads it and now flags an overlap
      // with no kitchen ceiling set, which it could not before.
      for (const cat of Object.keys(byCat)) {
        const batch = batchByCat[cat]
        if (batch == null) continue
        const used = categoryLoadOver(cookIntervals, cat, startMins, startMins + (prepByCat[cat] ?? step))
        remainingByCat[cat] = batch - used
        const t: SlotTone = used >= batch - EPS ? 'red' : 'amber'
        const r = RANK[t]
        if (r > bindRank || (r === bindRank && used > bindUsed)) {
          bindRank = r; bindUsed = used
          tone = t; bound_by = `${capWord(cat)} ${Math.round(used)}/${Math.round(batch)}`
        }
      }
      // Global ceiling for the no-basket display = the kitchen's PEAK over this window's span (18
      // September 2026) — its start and every cooking start inside it, points counted where they sit at
      // those instants — the same read as kitchenLoadOver, so the dot, the breach detector and this tone
      // name one number. Until today this was the concurrency at the window's START instant alone, which
      // an overlapping batch starting inside the span could slip past. The span is the longest cooking
      // prep among this window's categories (an instant-only window has no span — see below). Where the
      // grid is a whole multiple of every prep no start lies strictly inside, so the read is unchanged.
      let spanMins = 0
      for (const cat of Object.keys(byCat)) if (batchByCat[cat] != null) spanMins = Math.max(spanMins, prepByCat[cat] ?? step)
      // An instant-only window (keyed at deadline − capacityStep, holding zero-width points) has no span:
      // its points occupy their instant, so it reads exactly today's concurrency there.
      const conc = spanMins > 0 ? peakLoadOver(intervals, startMins, startMins + spanMins, false) : concurrencyAt(intervals, startMins)
      // `total` stays today's read — the concurrency at this window's START instant. It is the cover's
      // tie-break only (coverDotWindows picks the "peak" window by it on a 10–30 grid) and is what keeps
      // a mixed-prep aligned grid's cover label byte-identical; the ceiling itself (tone, remainingTotal,
      // the breach detector, /api/slots' remaining) reads `conc`, the span peak.
      const atStart = concurrencyAt(intervals, startMins)
      if (kitchenCapacity != null && conc >= kitchenCapacity - EPS) {
        tone = 'red'; bound_by = 'global ceiling'
      }
      return {
        startMins,
        start: fmt(startMins),
        beforeEventStart: startMins < eventStartMins,
        byCat,
        total: atStart,
        remainingByCat,
        remainingTotal: kitchenCapacity == null ? Infinity : kitchenCapacity - conc,
        tone,
        bound_by,
      }
    })

  const byStart = new Map<number, BackwardWindow>()
  for (const w of windows) byStart.set(w.startMins, w)

  // ── DISPLAY-ONLY event-start pile-up (§31 "Event-start pre-open seating") ──
  // At the event-start COLLECTION slot, cooking can begin at most ONE run-up window before open
  // ([eventStart−prep, eventStart)); load needing to seat earlier than that has nowhere valid and
  // PILES into the first slot. The seating loop / byStart / intervals above are UNCHANGED — the
  // picker reads those and is already correct via its independent raw-load lead (loadRunsOffFront).
  // This SEPARATE map lets the dots show the piled total for the event-start slot only.
  //
  // §31 (b) SEMANTICS: the pile sums ALL cooking seated in the PRE-OPEN windows (startMins <
  // eventStartMins) — read from the engine's already-built `byStart` (which already sums across ALL
  // orders, regardless of which slot they were collected at). The pre-open windows have NO collection
  // dot of their own (no slot exists before event-start), so their load surfaces ONLY here. Reading
  // productionSlotUnits[event-start slot] (collected-AT-event-start only) UNDER-reported: it missed
  // cooking that a LATER-collected order seats backward into a pre-open window (e.g. 16:35 order's
  // first batch cooking in the 16:25 run-up window). EXCLUDE startMins === eventStartMins — the
  // window [eventStart, eventStart+step) IS read by the eventStart+step collection dot, so including
  // it would double-count. We only READ byStart here (display-only) — byStart.byCat / intervals are
  // not mutated, so the picker stays byte-identical. Mid-event slots get NO entry (§39 single-window).
  const pileByStart = new Map<number, BackwardWindow>()
  {
    const byCat: Record<string, number> = {}
    let total = 0
    let preOpenCeilingRed = false
    for (const w of windows) {
      if (w.startMins >= eventStartMins) continue                          // pre-open windows ONLY
      for (const [cat, n] of Object.entries(w.byCat)) {
        const v = Number(n) || 0
        if (v <= 0) continue
        byCat[cat] = (byCat[cat] || 0) + v                                 // cooking sum (byStart.byCat = cooking cats)
        total += v
      }
      if (w.tone === 'red' && w.bound_by === 'global ceiling') preOpenCeilingRed = true
    }
    if (Object.keys(byCat).length > 0 || preOpenCeilingRed) {
      let tone: SlotTone = 'green'
      let bound_by: string | null = null
      let bindRank = -1
      let bindUsed = -1
      let overflowed = false
      const remainingByCat: Record<string, number> = {}
      for (const [cat, used] of Object.entries(byCat)) {
        const batch = batchByCat[cat]
        if (batch == null) continue
        remainingByCat[cat] = batch - used
        if (used > batch + EPS) overflowed = true                          // needs >1 window ⇒ true pile-up
        const t: SlotTone = used >= batch - EPS ? 'red' : 'amber'
        const r = RANK[t]
        if (r > bindRank || (r === bindRank && used > bindUsed)) {
          bindRank = r; bindUsed = used
          tone = t; bound_by = `${capWord(cat)} ${Math.round(used)}/${Math.round(batch)}`
        }
      }
      // Propagate red from any pre-open window already over the kitchen-capacity ceiling.
      if (preOpenCeilingRed) { tone = 'red'; overflowed = true }
      // RED via genuine overflow (load that can't fit the single run-up window) ⇒ the §31 wording.
      if (tone === 'red' && overflowed) bound_by = 'over capacity at event-start'
      pileByStart.set(eventStartMins, {
        startMins: eventStartMins,
        start: fmt(eventStartMins),
        beforeEventStart: false,
        byCat,
        total,
        remainingByCat,
        remainingTotal: kitchenCapacity == null ? Infinity : kitchenCapacity - total,
        tone,
        bound_by,
      })
    }
  }

  return { windows, byStart, pileByStart, cantFit, batchByCat, intervals }
}

/**
 * Shared lead/over-capacity predicate — the SINGLE source of the "can this cooking load be ready by
 * its collection slot without starting a batch before the event opens?" verdict, used by BOTH the
 * picker (fitOrderBackward) and the no-basket display dot so they can never disagree.
 *
 * Returns TRUE if any COOKING category's load `units` (by category), all due by `slotMins`, needs a
 * cooking window that starts before the front floor max(eventStart − prep, now) — i.e. it can't fit
 * before open ⇒ over capacity / "too soon". Mirrors the per-category lead check fitOrderBackward
 * uses (nw = ceil(N/batch); earliest window start = slotMins − nw·prep). Instant/no-prep categories
 * are skipped (their lead is enforced separately by placeInstantPoints).
 */
export function loadRunsOffFront(
  units: QtyByCat,
  catConfigs: Record<string, CatConfig>,
  slotMins: number,
  eventStartMins: number,
  nowMins: number = Number.NEGATIVE_INFINITY,
): boolean {
  for (const [catRaw, rawN] of Object.entries(units || {})) {
    const cat = catRaw.toLowerCase()
    const cfg = catConfigs[cat]
    const N = Number(rawN) || 0
    if (!cfg?.secs || N <= 0) continue
    const batch = Math.max(1, cfg.batch)
    const prep = Math.max(1, Math.round(cfg.secs / 60))
    const nw = Math.ceil(N / batch)
    if (slotMins - nw * prep < Math.max(eventStartMins - prep, nowMins)) return true
  }
  return false
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
  // NOW-CLAMP (event-tz mins-of-day; default -Inf = no clamp). The order's earliest cooking window
  // cannot start before NOW — cooking can only begin at/after the current time, so a multi-batch order
  // can't borrow elapsed oven windows (the bug that made large-order ASAP impossibly early). Pass -Inf
  // for a FUTURE-date event (mins-of-day would otherwise mis-compare across days). See the front floor below.
  nowMins: number = Number.NEGATIVE_INFINITY,
  // EXISTING committed total at THIS collection slot (production_slot_usage[slot]) by category. The
  // front-floor / pre-open-lead check below is judged on (existing + new), not the new order alone —
  // so a slot already AT its ceiling can't take more: cooking can't start before the event opens beyond
  // the single first-batch-at-open window, and a slot whose committed load already needs >1 pre-open
  // window rejects new load. Default {} = legacy (new order only) for callers that don't pass it; an
  // EMPTY slot is unchanged either way (existing 0 ⇒ nwCombined == nw).
  existingAtSlot: QtyByCat = {},
  // P3 (18 September 2026): the per-truck switch. ON ⇒ the per-category batch decision is reserveBatches
  // (Dominic's rule) and the order's cooking intervals are the windows it would reserve. OFF ⇒ today.
  batchReservations: boolean = false,
): {
  tone: SlotTone
  bound_by: string | null
  fits: boolean
  /** Window-scoped PEAK concurrency including this order — the figure the ceiling was judged against.
   *  0 when there is no ceiling or the order has no counted load. ADDITIVE: existing callers that
   *  destructure { tone, bound_by, fits } are unaffected. Display-only. */
  peak: number
  /** Earliest cooking-window start this order occupies (minutes from midnight), so a caller can name
   *  the real window span [spanFromMins, slotMins) rather than just the collection time. Null when the
   *  order has no cooking load (instant-only). Display-only. */
  spanFromMins: number | null
  /** WHY it does not fit, in the order a human should read it: batch, then kitchen, then pre-open.
   *  ALWAYS EMPTY when fits is true. Purely descriptive — see FitWhy. ADDITIVE: every field above is
   *  unchanged for every input, which scripts/batch-rolling-identity.cjs proves against the committed
   *  golden. */
  why: FitWhy
  /** P3, switch ON only (the key is ABSENT otherwise): per cooking category, the windows reserveBatches
   *  would reserve — the exact record the writers store — or null when the category does not fit. */
  reserved?: Record<string, CookingReservationWindow[] | null>
} {
  // Order's COOKING load on the PREP grid (drives per-category batch tones) + its concurrency
  // intervals; counted-instant items are tallied for capacity-cadence placement below.
  const orderLoad = new Map<number, Record<string, number>>()
  const batchOf: Record<string, number> = {}
  const orderCookIntervals: CookInterval[] = []
  let orderInstant = 0
  // ── DESCRIPTIVE ACCUMULATORS (18 September 2026). Written where the verdict is written, read nowhere
  // in this function. `why` is assembled at the end in reading order: batch, kitchen, pre-open. ──────
  const whyPreOpen: FitWhyPreOpen[] = []
  /** cat → every window this order occupies for it, with the load that window already carries. */
  const whyWindows = new Map<string, FitWhyWindow[]>()
  /** cats whose batch ceiling is actually EXCEEDED — the ones that block. */
  const whyBatchBlocked = new Set<string>()
  const prepOf: Record<string, number> = {}
  let whyKitchen: FitWhyKitchen | null = null
  // P3 (switch ON): the verdict per category from reserveBatches, and the windows it would reserve.
  const onVerdicts: Array<{ tone: SlotTone; label: string }> = []
  const reservedByCat: Record<string, CookingReservationWindow[] | null> = {}
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
    prepOf[cat] = prep
    const nw = Math.ceil(M / batch)
    // Front floor = max(eventStart pre-open allowance, NOW). eventStart keeps its ONE pre-open window
    // (`- prep`, the batch-1-ready-AT-start pre-prep credit, Manual s.6); NOW has NO allowance — you
    // can't cook in an elapsed window. CRITICAL: the lead is judged on the COMBINED load that must be
    // ready by T — this slot's EXISTING committed total for the category PLUS the new order — not the
    // new order alone. So nwCombined windows are needed; the earliest required window-start
    // (slotMins − nwCombined*prep) must be ≥ max(eventStartMins - prep, nowMins). A slot already at its
    // ceiling (its committed load already needs >1 pre-open window) therefore rejects more, while an
    // EMPTY slot is unchanged (existing 0 ⇒ nwCombined == nw). The per-window batch/ceiling checks below
    // still seat only the new order's `nw` windows (existing windowed load is folded via back.byStart).
    // Lead check via the shared verdict helper (ONE source with the no-basket display dot) — judged on
    // the COMBINED load (this slot's committed total for the cat + the new order). Identical formula
    // to the prior inline check (nw = ceil((existing+M)/batch); start = slotMins − nw·prep < floor).
    if (loadRunsOffFront({ [cat]: (Number(existingAtSlot[cat]) || 0) + M }, catConfigs, slotMins, eventStartMins, nowMins)) {
      runsOffFront = true
      whyPreOpen.push({ kind: 'preopen', cat, eventStartMins })   // descriptive only — the flag above is the verdict
    }
    if (batchReservations) {
      // ── P3, SWITCH ON: DOMINIC'S RULE ───────────────────────────────────────────────────────────
      // reserveBatches decides this category: exactly ceil(M/batch) back-to-back windows ending at T,
      // never split when M ≤ batch, fits iff the free space adds up, nearest-first. Its windows ARE the
      // order's cooking intervals (so the kitchen-ceiling sweep below sees the real arrangement) and ARE
      // `why` and the stored reservation — one function, so DISPLAY == PICKER by construction.
      const r = reserveBatches({ intervals: back.intervals, cat, slotMins, items: M, batch, prepMins: prep, kitchenCapacity, floorMins: eventStartMins - prep, nowMins })
      const wins = r.windows.map(w => ({ startMins: w.startMins, endMins: w.endMins, existing: Math.round(w.existing), free: Math.round(w.free), share: Math.round(w.share) })).sort((a, b) => a.startMins - b.startMins)
      whyWindows.set(cat, wins)
      reservedByCat[cat] = r.fits ? wins.filter(w => w.share > 0).map(w => ({ startMins: w.startMins, endMins: w.endMins, items: w.share })) : null
      if (r.fits) {
        let full = false
        for (const w of r.windows) if (w.share > 0) {
          const o = orderLoad.get(w.startMins) ?? {}; o[cat] = (o[cat] || 0) + w.share; orderLoad.set(w.startMins, o)
          orderCookIntervals.push({ startMins: w.startMins, endMins: w.endMins, items: w.share, cat })
          if (w.existing + w.share >= batch - EPS) full = true
        }
        onVerdicts.push({ tone: full ? 'amber' : 'green', label: `${capWord(cat)} ${Math.round(r.windows[0].existing + r.windows[0].share)}/${Math.round(batch)}` })
      } else {
        // Refused: seat today's split so the ceiling/peak/spanFromMins stay meaningful; the verdict is red.
        for (let i = 0; i < nw; i++) { const ws = slotMins - (i + 1) * prep; const items = i === 0 ? M - batch * (nw - 1) : batch; orderCookIntervals.push({ startMins: ws, endMins: ws + prep, items, cat }) }
        whyBatchBlocked.add(cat)
        onVerdicts.push({ tone: 'red', label: `${capWord(cat)} ${Math.round(r.windows[0].existing + M)}/${Math.round(batch)}` })
      }
      continue
    }
    for (let i = 0; i < nw; i++) {
      // The order COOKS in the windows ENDING at the collection slot T: latest/adjacent window
      // [T−prep, T) keyed T−prep (i=0), stepping back … T−nw*prep. Mirrors projectBackwardOccupancy.
      const ws = slotMins - (i + 1) * prep
      const items = i === 0 ? M - batch * (nw - 1) : batch
      const w = orderLoad.get(ws) ?? {}
      w[cat] = (w[cat] || 0) + items
      orderLoad.set(ws, w)
      orderCookIntervals.push({ startMins: ws, endMins: ws + prep, items, cat })
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

  // PER-CATEGORY batch tones — 🔴 ROLLING (17 September 2026). The existing load for this order's window
  // [ws, ws+prep) is every existing batch of the category that OVERLAPS it (categoryLoadOver over
  // back.intervals — the same intervals the sweep-line reads), no longer only the batch that starts at
  // the same minute. combined / thresholds / consider / bound_by are unchanged.
  if (batchReservations) { for (const v of onVerdicts) consider(v.tone, v.label) }
  for (const [ws, ord] of batchReservations ? [] : orderLoad) {
    for (const [cat, add] of Object.entries(ord)) {
      const batch = batchOf[cat]
      if (batch == null) continue
      const prep = Math.max(1, Math.round((catConfigs[cat]?.secs ?? 0) / 60))
      const existing = categoryLoadOver(back.intervals, cat, ws, ws + prep)
      const combined = existing + add
      const t: SlotTone = combined > batch + EPS ? 'red' : combined >= batch - EPS ? 'amber' : 'green'
      consider(t, `${capWord(cat)} ${Math.round(combined)}/${Math.round(batch)}`)
      // DESCRIPTIVE, from the very numbers above — no second read of back.intervals.
      const list = whyWindows.get(cat) ?? []
      list.push({ startMins: ws, endMins: ws + prep, existing: Math.round(existing), free: Math.max(0, Math.round(batch - existing)), share: Math.round(add) })
      whyWindows.set(cat, list)
      if (t === 'red') whyBatchBlocked.add(cat)
    }
  }

  // KITCHEN-CAPACITY CEILING = EXACT sweep-line concurrency, WINDOW-SCOPED to the windows THIS order
  // occupies (§31: the ceiling is per cooking window; an unrelated earlier over-capacity window —
  // e.g. a prior override breach — must NOT block a later genuinely-fitting slot). Cooking is fixed
  // (existing ⊕ order intervals); if adding the order peaks over the ceiling in a window IT touches
  // it's an unfixable collision ⇒ red. Otherwise greedily seat the order's counted-instant items as
  // concurrency points on the capacity cadence — running off the event front (no headroom before
  // open) ⇒ doesn't fit. Amber when the resulting peak (in the order's windows) sits exactly at the
  // ceiling (parity with the old at-N amber). windowScopedPeak ≤ the old global maxConcurrentCount
  // always, and EQUALS it whenever the binding window is one the order occupies — so the NON-breached
  // case (no window over cap, or the order itself over cap) is byte-identical; only an unrelated
  // breach-elsewhere stops red-ing every slot. Per-instant COUNT is unchanged (all covering batches,
  // incl. boundary-spanning, still counted) — only the evaluated instant SET is narrowed.
  // reportedPeak is captured for the CALLER's message only — it never influences tone/fits below.
  let reportedPeak = 0
  if (kitchenCapacity != null) {
    const realIntervals = [...back.intervals, ...orderCookIntervals]
    const cookingPeak = windowScopedPeak(realIntervals, orderCookIntervals)
    reportedPeak = cookingPeak
    if (cookingPeak > kitchenCapacity + EPS) {
      consider('red', 'global ceiling')
      const d = peakDetailOver(realIntervals, orderCookIntervals, capacityStep)
      if (d) whyKitchen = { kind: 'kitchen', cap: kitchenCapacity, startMins: d.startMins, endMins: d.endMins, existing: Math.round(d.total - d.add), add: Math.round(d.add) }
    } else {
      const { points, runsOffFront: instantOff } =
        placeInstantPoints(orderInstant, slotMins, realIntervals, kitchenCapacity, capacityStep, eventStartMins, nowMins)
      if (instantOff) {
        consider('red', 'global ceiling')
        // The instants could not be seated at all, so the cooking peak is the honest thing to name.
        const d = peakDetailOver(realIntervals, orderCookIntervals, capacityStep)
        if (d) whyKitchen = { kind: 'kitchen', cap: kitchenCapacity, startMins: d.startMins, endMins: d.endMins, existing: Math.round(d.total - d.add), add: Math.round(d.add) }
      } else {
        const peak = points.length
          ? windowScopedPeak([...realIntervals, ...points], [...orderCookIntervals, ...points])
          : cookingPeak
        reportedPeak = peak
        if (peak >= kitchenCapacity - EPS) consider('amber', 'global ceiling')
      }
    }
  }

  // Earliest window this order occupies — the start of the span the caller can name.
  let spanFromMins: number | null = null
  for (const iv of orderCookIntervals) {
    if (spanFromMins === null || iv.startMins < spanFromMins) spanFromMins = iv.startMins
  }

  // fits derived from bindRank (number) — `tone` is closure-mutated, so a direct
  // `tone !== 'red'` would mis-narrow to the literal 'green'.
  const fits = bindRank < RANK.red
  // ── ASSEMBLE `why` — reading order, and ONLY when the slot actually does not fit ──────────────────
  // Every element was recorded above at the moment its own verdict was taken; nothing is recomputed
  // here and nothing here can change `fits`, `tone`, `bound_by`, `peak` or `spanFromMins`.
  const why: FitWhy = []
  if (!fits) {
    for (const cat of Object.keys(batchOf)) {
      if (!whyBatchBlocked.has(cat)) continue
      const windows = (whyWindows.get(cat) ?? []).slice().sort((a, b) => a.startMins - b.startMins)
      why.push({ kind: 'batch', cat, batch: Math.round(batchOf[cat]), prepMins: prepOf[cat] ?? 0, windows })
    }
    if (whyKitchen) why.push(whyKitchen)
    for (const p of whyPreOpen) why.push(p)
  }
  if (batchReservations) return { tone, bound_by, fits, peak: Math.round(reportedPeak), spanFromMins, why, reserved: reservedByCat }
  return { tone, bound_by, fits, peak: Math.round(reportedPeak), spanFromMins, why }
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
  // NOW-CLAMP (event-tz mins-of-day; default -Inf = no clamp / future-date event). Forwarded to
  // fitOrderBackward so a placement whose backward cooking windows extend before now is rejected — the
  // returned ASAP/booked slot is physically achievable, not just ≥ fromMins.
  nowMins: number = Number.NEGATIVE_INFINITY,
  // P1: forwarded to the projection; empty ⇒ today's walk exactly.
  reservations: EngineReservation[] = [],
  batchReservations: boolean = false,
): string | null {
  const back = projectBackwardOccupancy(productionSlotUnits, catConfigs, eventStartMins, kitchenCapacity, capacityWindowMins, reservations, batchReservations)
  const sorted = [...times].sort((a, b) => parseMins(a.collection_time) - parseMins(b.collection_time))
  for (const t of sorted) {
    const m = parseMins(t.collection_time)
    if (m < fromMins) continue
    if (fitOrderBackward(back, m, orderByCat, catConfigs, kitchenCapacity, eventStartMins, capacityWindowMins, nowMins, productionSlotUnits[t.collection_time] || {}, batchReservations).fits) {
      return t.collection_time
    }
  }
  return null
}
