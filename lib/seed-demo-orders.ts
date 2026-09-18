// lib/seed-demo-orders.ts
// Seeds the demo board (spec §6) so a prospect lands on a service already in progress rather than an
// empty screen.
//
// These are REAL rows in `orders` against the real event, so the capacity engine computes genuine
// occupancy and the traffic lights are true engine output — not painted-on.
//
// 🔴 customer_email IS ALWAYS NULL. Every email site is guarded by `if (order.customer_email)`, so a null
// address makes it structurally impossible for a seeded order to email anyone. The demo-truck guard in
// dashboard/action + orders/submit also blocks sends — keep BOTH. Fake addresses hard-bounce, damaging the
// shared Brevo sender reputation every real truck's confirmations depend on.

import type { SupabaseClient } from '@supabase/supabase-js'
import { generateSlots } from '@/lib/slots'
import { toMinor } from '@/lib/order-repricing'
// 🔴 THE POST-CONDITION'S MACHINERY, ALL OF IT IMPORTED, NONE OF IT REIMPLEMENTED.
// detectCapacityBreaches is the SAME function /api/dashboard calls to raise the "N slots over capacity"
// banner, and it reads projectBackwardOccupancy (the engine). generateCollectionTimes is the SAME
// function the dashboard builds its collection-slot list with. normaliseOrderLines /
// orderItemsToQtyByCat / mergeQtyByCat / buildItemCatMap are the SAME helpers buildUnitsFromOrders uses
// to turn orders into production_slot_usage. The only thing local is the five-line loop that walks the
// in-memory rows — see buildUnitsInMemory, and the equivalence proof in the report.
import { randomUUID } from 'crypto'
import { detectCapacityBreaches, type CapacityBreach } from '@/lib/capacity-breach'
import { resolveIntervalsFor } from '@/lib/slot-interval'
import { resolveBatchReservations } from '@/lib/features'
import { admitForManual, writeReservationRecord, writeCookingReservation } from '@/lib/orders/cooking-reservation'
import { generateCollectionTimes } from '@/lib/slot-generation'
import { normaliseOrderLines, buildItemCatMap, type ProductionSlotUnits } from '@/lib/slot-bookings'
import { orderItemsToQtyByCat, mergeQtyByCat, type QtyByCat } from '@/lib/slot-capacity'
import type { CatConfig } from '@/lib/prep-utils'

const CUSTOMER_NAMES = [
  'Sarah', 'Dave', 'Priya', 'Tom', 'Aisha', 'Mark', 'Chloe', 'Raj', 'Ellie', 'Ben',
  'Nadia', 'Jack', 'Sophie', 'Omar', 'Grace', 'Liam', 'Yasmin', 'Callum', 'Freya', 'Idris',
]

/** FIX 2 — nothing may be collected until this long after the event opens. Seeding onto the opening slots
 *  made every card show "7m late" the instant the demo loaded: a board that reads as a FAILING kitchen,
 *  which is the opposite of the story. The kitchen needs runway ahead of its first collection. */
const FIRST_COLLECTION_OFFSET_MINS = 10
/** 37, not 40. A round number reads as generated; 37 reads as what actually happened. Spread across the
 *  WHOLE window rather than clustered at the front. This is the target for a FULL 3h window — short
 *  windows scale down from it, see ORDERS_PER_SLOT. */
const TARGET_ORDERS = 37

/** Bookable slots in a full 3h window: first collection is start+10, the window ends at start+180, 5-min
 *  grid → (170 / 5) + 1 = 35. */
const FULL_WINDOW_SLOTS = 35

/**
 * 🔴 THE ORDER COUNT SCALES WITH THE WINDOW. It used to be a flat TARGET_ORDERS regardless of how much
 * window there was, which broke in both directions on a short (midnight-clamped) window:
 *
 *   • The planner's budget loop is bounded by `i < slots.length`, so a 5-slot window could only budget
 *     14 of the 43 mains those 37 orders need. The other 23 orders hit `if (!target) continue` and were
 *     silently DROPPED — a board of 14 where the code claimed 37.
 *   • Worse, `stride = slots.length / budgets.length` collapses to 1 once the slot count falls to the
 *     budget count (~16). Stride > 1 is the ONLY thing that produces gaps between filled slots — the
 *     zeros in FILL_PATTERN are filtered out at `nonZero` and never reach the stride. So a short window
 *     produced one solid run of consecutive filled slots: the "bunching".
 *
 * Deriving the target from the slot count fixes both at the source. The budget loop is no longer
 * slot-bound (it wants ~slots.length × 0.45 budgets for ~slots.length orders), so nothing is dropped,
 * and the stride stays above 1 so the taper survives. ~37 over 35 slots; ~7 over 7.
 */
const ORDERS_PER_SLOT = TARGET_ORDERS / FULL_WINDOW_SLOTS   // ≈ 1.057

/** Below this a board stops reading as a service at all. A window this short is already a poor demo;
 *  4 orders is the floor at which the capacity story is still legible. */
const MIN_TARGET_ORDERS = 4

/** ORDER SHAPES — how many MAINS and how many accompaniments each order carries.
 *
 *  Every order being one item looked synthetic; real service is a spread. Cycled in order (deterministic),
 *  so the mix is stable and the arithmetic below is exact rather than statistical.
 *
 *  Per 12-order cycle: 14 mains, 31 items, and the sizes land at 1×2, 2×4, 3×4, 4×1, 5×1 — mostly two- and
 *  three-item orders with a few singles and a couple of family-sized ones. One drinks-only order per cycle
 *  (a real board has them) — everything else contains a main.
 *
 *  🔴 `mains` IS THE CAPACITY UNIT. Only cooked items count toward the ceiling, so `extras` are free — but
 *  a 2-main order occupies 2 of a slot's 4, which is why the planner packs by mains budget rather than by
 *  order count. */
const ORDER_SHAPES: { mains: number; extras: number }[] = [
  { mains: 1, extras: 0 },   // solo, straight in and out
  { mains: 1, extras: 1 },   // main + drink
  { mains: 1, extras: 2 },   // main + side + drink
  { mains: 2, extras: 1 },   // two of them sharing a side
  { mains: 1, extras: 1 },
  { mains: 0, extras: 2 },   // drinks only
  { mains: 1, extras: 2 },
  { mains: 2, extras: 2 },
  { mains: 1, extras: 1 },
  { mains: 1, extras: 2 },
  { mains: 1, extras: 0 },
  { mains: 2, extras: 3 },   // the family order
]
/** Per-slot MAINS BUDGET as a fraction of the ceiling. Cycles FULL → PARTIAL so the board reads busy WITH
 *  visible headroom; the zeros are what leave gaps between filled slots. A budget never exceeds the batch,
 *  and orders are packed WITHIN it, so a breach is impossible by construction. */
const FILL_PATTERN = [1.0, 0, 0.5, 0, 1.0, 0, 0.25, 0, 0.75, 0]

// ── 🔴 THE PLANNING GRID IS RESOLVED, NOT A CONSTANT (19 September 2026) ────────────────────────────
// `const SLOT_INTERVAL_MINS = 5` stood here. It seated seeded orders on a 5-minute grid whatever the van
// was set to, while the capacity ceiling was read from the van — the split docs/slot-interval-van-level-
// report.md recorded and left. A van at 15 minutes then showed a prospect orders at 15:05 and 15:10 that
// no picker on the board could ever offer. The grid now comes from `resolveIntervalsFor` — the SAME
// resolver the customer submit path uses: event override → van → 5/5 — so the seeder and the engine
// cannot disagree about which times exist. Seeded orders are customer-style orders and sit on the
// CUSTOMER grid; the post-condition below examines the OPERATOR grid, which is what the dashboard draws.

/** How many shed-and-recheck passes the post-condition may take before it gives up and WARNS.
 *  Bounded on purpose: this loop runs inside /api/demo (a prospect is watching a spinner) and inside
 *  restartDemoService (which now fires automatically on page load). Each pass is pure CPU over data
 *  already in memory — no database round trip — so three is cheap; an unbounded loop would not be. */
const MAX_BREACH_PASSES = 6

/** Grace minutes the DASHBOARD appends to its collection-slot list (app/api/dashboard/route.ts,
 *  `GRACE_MINS`). Mirrored here so the post-condition examines at least the slots the banner does. */
const DASHBOARD_GRACE_MINS = 30

/** A breach the post-condition could not clear, flattened for the callers' `warnings` channel. */
export interface SeededBreach {
  collection_time: string
  /** The engine's own binding reason, e.g. "Mains 8/4" or "over capacity at event-start". */
  reason: string
  /** Categories over their batch in this window. */
  over_cats: { cat: string; over: number }[]
  /** Items over the kitchen_capacity total ceiling (0 when the breach is per-category only). */
  over_total: number
}

export interface SeededOrders {
  inserted: number
  /** COOKED item lines placed (prep_secs > 0). Was "mains" counted from ORDER_SHAPES.mains, which
   *  under-counted whenever an accompaniment came from a cooked category. */
  mainsItems: number
  /** Total item lines across all orders — cooked + accompaniments. */
  totalItems: number
  slotsUsed: string[]
  skippedNoMenu: boolean
  /**
   * 🔴 REPLACES `peakPerSlot`, WHICH WAS AN INSTRUMENT FAILURE.
   * The old field counted `ORDER_SHAPES.mains` and was documented as existing "so a breach is provable".
   * It reported 4 against a ceiling of 4 while the engine saw 14 cooked items in one slot, because every
   * accompaniment drawn from a cooked category was invisible to it. It was also read by NOTHING — a
   * comment claimed the admin provision panel surfaced it; no such read exists (see the report).
   *
   * This is the highest (category, collection-slot) cooked count actually placed, and `peakBatch` is the
   * batch it is measured against, so the pair can FAIL: peak > batch means the planner over-filled a slot.
   * It is NOT the safety check — `unresolvedBreaches` is. It is a description of the board.
   */
  peakCookedPerSlotPerCat: number
  /** The per-category batch the peak above sits against (the binding category's `menu_categories.batch_size`). */
  peakBatch: number
  /** Collection slots that finished AT their category's batch — "some at max, none over" is the target,
   *  so an empty board and a good board must be tellable apart. */
  slotsAtCapacity: number
  /** How many post-condition passes ran (1 = clean first time). */
  breachPasses: number
  /** Orders removed by the post-condition to clear a breach. */
  shedOrders: number
  /** 🔴 NON-EMPTY MEANS THE BOARD SHIPPED OVER CAPACITY. Never silently true — the callers push these
   *  into their own `warnings`, which reach the admin response. */
  unresolvedBreaches: SeededBreach[]
  /** Human-readable notes for the callers' warnings channel. */
  warnings: string[]
}

/** Every early return builds its result here, so a new field cannot be forgotten by one of them — the
 *  exact class of bug the trucks-projection note in /api/dashboard records three instances of. */
function emptyResult(over: Partial<SeededOrders> = {}): SeededOrders {
  return {
    inserted: 0, mainsItems: 0, totalItems: 0, slotsUsed: [], skippedNoMenu: false,
    peakCookedPerSlotPerCat: 0, peakBatch: 0, slotsAtCapacity: 0,
    breachPasses: 0, shedOrders: 0, unresolvedBreaches: [], warnings: [],
    ...over,
  }
}

/** One REQUIRED group and every option this dish may legitimately be given for it. */
interface RequiredGroup { choices: { name: string; price: number }[] }

interface MenuLine {
  id: string
  name: string
  price: number
  category: string
  /** Lower-cased — the key the capacity engine and production_slot_usage use. */
  catKey: string
  cooked: boolean
  /** 🔴 THE COMMITTED CEILING, READ FROM `menu_categories.batch_size`, NOT the DEMO_MAINS_BATCH constant.
   *  Resolved with `batch_size || 1` — BYTE-FOR-BYTE what /api/dashboard does when it builds catConfigs
   *  (`batch: c.batch_size || 1`), so a category with prep_secs > 0 and batch_size 0 or null is batch 1
   *  here exactly as it is there. Reading the constant instead is how the planner and the engine came to
   *  disagree in the first place. */
  batch: number
  /** `menu_categories.prep_secs` — needed for the catConfigs the post-condition feeds the engine. */
  prepSecs: number
  countsToCapacity: boolean
  /** One entry per REQUIRED group — empty when the dish has none. */
  requiredMods: RequiredGroup[]
}

const toMinsLocal = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
const minsToHHMMLocal = (mins: number): string =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
/** Venue-local minutes-since-midnight for a PASSED Date (deterministic — no new Date() here). Mirrors the
 *  tz extraction demoEventWindow uses, so the seeder's "now" agrees with the window's "now". */
const venueNowMins = (now: Date, tz: string): number => {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const g = (t: string) => Number(p.find(x => x.type === t)?.value ?? '0')
  return g('hour') * 60 + g('minute')
}

/**
 * Resolve each item's REQUIRED modifier groups and pick a valid option for each (fix 5).
 * A seeded order that leaves a required group empty is an INVALID order — the operator's own submit guard
 * would reject it, and it renders on the card as an incomplete line.
 */
async function resolveRequiredMods(
  supabase: SupabaseClient, truckId: string, itemIds: string[],
): Promise<Map<string, RequiredGroup[]>> {
  const out = new Map<string, RequiredGroup[]>()
  if (!itemIds.length) return out

  const { data: groups } = await supabase
    .from('modifier_groups').select('id, name, is_required, min_choices').eq('truck_id', truckId)
  const requiredIds = new Set(
    (groups ?? []).filter(g => g.is_required || (g.min_choices ?? 0) >= 1).map(g => g.id as string))
  if (!requiredIds.size) return out

  const [{ data: links }, { data: options }] = await Promise.all([
    supabase.from('item_modifier_groups')
      .select('menu_item_id, group_id, excluded_option_ids').in('menu_item_id', itemIds),
    supabase.from('modifier_options')
      .select('id, group_id, name, price_adjustment, available')
      .in('group_id', Array.from(requiredIds)),
  ])

  for (const link of links ?? []) {
    const groupId = link.group_id as string
    if (!requiredIds.has(groupId)) continue
    const excluded = new Set((link.excluded_option_ids as string[] | null) ?? [])
    // EVERY valid option this dish carries, not just the first — the seeder picks among them per order so
    // the board doesn't come out as forty identical Chickens. excluded_option_ids (§59) means the superset
    // group holds options this particular dish does NOT offer.
    const choices = (options ?? [])
      .filter(o => o.group_id === groupId && o.available !== false && !excluded.has(o.id as string))
      .map(o => ({ name: String(o.name), price: Number(o.price_adjustment) || 0 }))
    if (!choices.length) continue
    const itemId = link.menu_item_id as string
    const list = out.get(itemId) ?? []
    list.push({ choices })
    out.set(itemId, list)
  }
  return out
}

/**
 * production_slot_usage AS IT WILL BE, computed from rows that are not inserted yet.
 *
 * 🔴 THE ONLY LOCAL CODE IN THE POST-CONDITION, AND IT IS FIVE LINES. Everything it calls is the
 * exported helper the real write path calls: `normaliseOrderLines` (folds deal items in),
 * `orderItemsToQtyByCat` and `mergeQtyByCat`. The loop body is `buildUnitsFromOrders`'s own loop:
 * resolve the collection time, map it through the `collection_times` window key, merge the quantities.
 *
 * WHY NOT CALL buildUnitsFromOrders ITSELF: it is module-private and it reads the orders FROM THE
 * DATABASE, so using it would mean inserting a breaching board first and deleting rows afterwards. The
 * codebase already has a name for computing post-insert units without inserting — `computeEventUnitRows`,
 * the atomic-RPC helper — and that is exactly this shape; it just takes ONE in-memory order, not N.
 * The report proves this loop and the real read path produce identical units for the same orders.
 */
function buildUnitsInMemory(
  rows: { slot?: unknown; items?: unknown; deals?: unknown }[],
  timeMap: Record<string, string>,
  itemCatMap: Record<string, string>,
  eventStart: string,
): ProductionSlotUnits {
  const out: ProductionSlotUnits = {}
  for (const row of rows) {
    const ct = (typeof row.slot === 'string' && row.slot) || eventStart
    if (!ct) continue
    const productionSlot = timeMap[ct] || ct
    const lines = normaliseOrderLines((row.items as never[]) || [], (row.deals as never[]) || null)
    const delta = orderItemsToQtyByCat(lines, itemCatMap)
    out[productionSlot] = mergeQtyByCat(out[productionSlot] || {}, delta as QtyByCat)
  }
  return out
}

/** Flatten a CapacityBreach to the shape the callers' warnings channel carries. */
function toSeededBreach(b: CapacityBreach): SeededBreach {
  return { collection_time: b.collection_time, reason: b.reason, over_cats: b.over_cats, over_total: b.over_total }
}

export async function seedDemoOrders(
  supabase: SupabaseClient,
  args: {
    truckId: string
    eventId: string
    eventDate: string
    startTime: string
    endTime: string
    /**
     * ⚠️ NO LONGER THE CEILING, AND KEPT ONLY AS A FALLBACK. The per-slot ceiling is now read from the
     * committed `menu_categories.batch_size` for each cooked category (see MenuLine.batch) — a constant
     * passed by the caller is precisely how the planner and the engine came to disagree. This value is
     * used only to size the budget loop when the menu has NO cooked category at all, where there is no
     * committed batch to read and nothing counts toward capacity anyway.
     */
    capacity: number
    count?: number
    /** Wall-clock "now" for the FLOOR below. Passed in (not read via new Date()) so the seeder stays
     *  deterministic and unit-testable. Omit → no clock floor (first collection is just start+10, the
     *  pre-floor behaviour) — used by callers/tests that don't care about elapsed time. */
    now?: Date
    tz?: string
  },
): Promise<SeededOrders> {
  const warnings: string[] = []

  // 🔴 `batch_size` AND `prep_secs` AND `counts_toward_capacity`, NOT just `prep_secs`. The planner's
  // ceiling now comes from the committed category row, and the post-condition needs the same three
  // columns to build the catConfigs the engine reads. One select, three more columns.
  const { data: itemRows } = await supabase
    .from('menu_items_db')
    .select('id, name, price, menu_categories!category_id(name, prep_secs, batch_size, counts_toward_capacity)')
    .eq('truck_id', args.truckId).eq('is_active', true).limit(120)

  const requiredMods = await resolveRequiredMods(
    supabase, args.truckId, (itemRows ?? []).map(r => (r as Record<string, any>).id as string))

  const all: MenuLine[] = (itemRows ?? []).map(r => {
    const row = r as Record<string, any>
    const cat = row.menu_categories
    const name = String(cat?.name ?? '')
    return {
      id: String(row.id),
      name: String(row.name ?? ''),
      price: Number(row.price ?? 0),
      category: name,
      catKey: name.toLowerCase(),
      cooked: Number(cat?.prep_secs ?? 0) > 0,
      // `|| 1` — the dashboard's own expression. See the field's note on MenuLine.
      batch: Number(cat?.batch_size) || 1,
      prepSecs: Number(cat?.prep_secs ?? 0),
      countsToCapacity: !!cat?.counts_toward_capacity,
      requiredMods: requiredMods.get(String(row.id)) ?? [],
    }
  }).filter(l => l.name)

  const mains = all.filter(l => l.cooked)
  const others = all.filter(l => !l.cooked)
  if (all.length === 0) return emptyResult({ skippedNoMenu: true })
  // No cooked category (inference fell back, or a drinks-only menu) — seed from everything rather than
  // seeding nothing. The board still populates; it just has no capacity story to tell.
  const mainsPool = mains.length ? mains : all
  // ⚠️ THE FALLBACK STAYS. When every category is cooked (`others` empty — Between Buns Royston, three
  // cooked categories and zero instant items), accompaniments are drawn from the cooked pool and the
  // board keeps its two- and three-item orders. That is the point: a board of singles undersells the
  // product. What changed is that those lines are now CHARGED (see cookedByCat below), so the planner
  // seats fewer orders per slot instead of pretending the extras were free.
  const otherPool = others.length ? others : all

  /** Committed batch per cooked category key. The binding ceiling, per category, as the engine sees it. */
  const batchByCat: Record<string, number> = {}
  for (const l of all) if (l.cooked) batchByCat[l.catKey] = l.batch
  /** catConfigs in EXACTLY the shape /api/dashboard builds for the engine. */
  const catConfigs: Record<string, CatConfig> = {}
  for (const l of all) catConfigs[l.catKey] = { secs: l.prepSecs, batch: l.batch, countsToCapacity: l.countsToCapacity }

  // ── Slot plan (fixes 2/3/4) ────────────────────────────────────────────────────────────────────────
  // FIRST COLLECTION = max(start+10, now+10), rounded UP to the 5-min grid.
  // WHY not just start+10: demoEventWindow floors the start to the nearest half hour, so the start can be
  // up to 29 min in the PAST. The front-weighted FILL_PATTERN puts the fullest budgets in the earliest
  // slots, so without this clamp a prospect's first impression would be a block of orders already late.
  // Clamping the floor to now+10 pushes the busy front into the near-future. Ceil-to-5 keeps it on grid.
  // The event's van, the truck's switch and the resolved grid — ONE read each, reused by the post-condition
  // and the admission loop below. The van id comes from the event, exactly as eventKitchenCapacity resolves it.
  const [{ data: evRow }, { data: truckRow }] = await Promise.all([
    supabase.from('truck_events').select('van_id').eq('id', args.eventId).maybeSingle(),
    supabase.from('trucks').select('plan, feature_overrides, slot_duration_mins').eq('id', args.truckId).maybeSingle(),
  ])
  const vanId = (evRow as { van_id?: string | null } | null)?.van_id ?? null
  const intervals = await resolveIntervalsFor(supabase, vanId, args.eventId)
  /** The CUSTOMER grid — the times a customer (and a seeded customer-style order) can be given. */
  const gridMins = intervals.customer
  const reservationsOn = resolveBatchReservations(truckRow as { plan?: string | null; feature_overrides?: Record<string, unknown> | null } | null)

  const startPlusMins = toMinsLocal(args.startTime) + FIRST_COLLECTION_OFFSET_MINS
  const nowMins = args.now ? venueNowMins(args.now, args.tz ?? 'Europe/London') : null
  const floorMins = nowMins != null ? Math.max(startPlusMins, nowMins + FIRST_COLLECTION_OFFSET_MINS) : startPlusMins
  // Clock-anchored: the first time is the first MULTIPLE OF THE INTERVAL FROM MIDNIGHT at or after the
  // floor, and every later one steps by the interval — the same rule generateCollectionTimes applies.
  const firstMins = Math.ceil(floorMins / gridMins) * gridMins
  const firstCollection = minsToHHMMLocal(firstMins)
  const slots = generateSlots(firstCollection, args.endTime, gridMins)
  if (!slots.length) return emptyResult({ warnings })

  // ── TARGET, DERIVED FROM THE WINDOW (see ORDERS_PER_SLOT) ─────────────────────────────────────────
  // Computed HERE, after `slots`, not at the top of the function — the whole point is that it depends on
  // how much window there actually is. An explicit `args.count` still wins (callers/tests that want a
  // fixed board), and the result is clamped so it can never exceed the full-window figure.
  // 🔴 THE REFERENCE BATCH IS THE SMALLEST COMMITTED ONE, not the DEMO_MAINS_BATCH constant and not the
  // largest: a board must be within the tightest category's ceiling. Computed HERE, before the target,
  // because the target now scales with it (below); the budget loop further down reads the same value.
  const cookedBatches = Object.values(batchByCat)
  const refBatch = cookedBatches.length ? Math.max(1, Math.min(...cookedBatches)) : Math.max(1, args.capacity)
  // ── 🔴 THE ORDER COUNT SCALES WITH THE BATCH AS WELL AS THE WINDOW (19 September 2026) ─────────────
  // ORDERS_PER_SLOT was tuned for the demo default of 4 a batch on a 5-minute grid (35 slots → 37 orders).
  // On a 15-minute grid there are 12 slots, so the same rule gave 13 orders — and at 8 a batch those
  // 13 orders carried barely two batches' worth of cooking, so the budget loop put load on THREE of the
  // twelve times and left nine empty: a board that read as a quiet afternoon, not a service. The count
  // now scales by the batch relative to the 4 it was tuned for, so LOAD relative to capacity is what stays
  // constant. At 4 a batch the factor is 1 and every existing demo seeds exactly as before.
  const batchScale = Math.max(1, refBatch / Math.max(1, args.capacity))
  const target = args.count ?? Math.max(
    MIN_TARGET_ORDERS,
    Math.min(TARGET_ORDERS, Math.round(slots.length * ORDERS_PER_SLOT * batchScale)),
  )

  // ── ORDER SHAPES → the COOKED bill ────────────────────────────────────────────────────────────────
  // 🔴 THE LINES ARE BUILT BEFORE THE BUDGETS NOW, AND THAT ORDERING IS THE FIX.
  // The planner used to budget against `ORDER_SHAPES.mains` — the count of lines drawn from `mainsPool`
  // — and then draw `extras` from `otherPool`. When `otherPool` falls back to `all` (no instant category
  // has any items) those extras are COOKED, and they were charged nothing. A slot budgeted 4 received 4
  // counted mains plus up to 10 uncounted cooked accompaniments.
  // Building each order's lines first makes the charge a FACT ABOUT THE LINES rather than a property of
  // the shape that produced them, so the pool fallback cannot smuggle load past the budget again.
  const shapes = Array.from({ length: target }, (_, i) => ORDER_SHAPES[i % ORDER_SHAPES.length])

  let nameIdx = 0
  let pick = 0
  // Deterministic pseudo-random: a cheap integer hash of (order index, group index). Varies the choice
  // across orders so the board looks like a real service rather than forty identical Chickens, while
  // staying REPRODUCIBLE — Math.random() would make a wrong-looking board impossible to re-inspect.
  const pickIdx = (seed: number, groupIdx: number, len: number) =>
    len <= 1 ? 0 : ((seed * 31 + groupIdx * 17 + 7) >>> 0) % len

  const lineFor = (src: MenuLine, quantity: number, seed: number) => {
    const modifiers = src.requiredMods.map((g, gi) => g.choices[pickIdx(seed, gi, g.choices.length)])
    // 🔴 unit_price INCLUDES the modifiers. That's the convention every real path stores
    // (trucks/[slug]/order/page.tsx:1093 — `menuItem.price + modifiers.reduce(...)`), and OrderLineItem
    // documents unitPrice as "base + modifiers". Storing the base alone made the card list a "+£1.50"
    // modifier while showing the un-adjusted price, so the line total read wrong.
    const unit_price = src.price + modifiers.reduce((a, m) => a + m.price, 0)
    return { name: src.name, quantity, unit_price, ...(modifiers.length ? { modifiers } : {}) }
  }

  /** An order the planner has composed but not yet seated. `cookedByCat` is what it costs. */
  interface Prospect {
    lines: ReturnType<typeof lineFor>[]
    cookedByCat: Record<string, number>
    cookedTotal: number
  }
  const prospects: Prospect[] = []
  for (const shape of shapes) {
    const lines: ReturnType<typeof lineFor>[] = []
    const cookedByCat: Record<string, number> = {}
    let cookedTotal = 0
    const take = (src: MenuLine) => {
      lines.push(lineFor(src, 1, pick)); pick++
      if (src.cooked) { cookedByCat[src.catKey] = (cookedByCat[src.catKey] ?? 0) + 1; cookedTotal++ }
    }
    // ⚠️ ORDER_SHAPES IS UNTOUCHED. Multi-item orders stay — a board of singles undersells the product.
    for (let m = 0; m < shape.mains; m++) take(mainsPool[pick % mainsPool.length])
    for (let e = 0; e < shape.extras; e++) take(otherPool[pick % otherPool.length])
    if (lines.length) prospects.push({ lines, cookedByCat, cookedTotal })
  }
  const totalCookedNeeded = prospects.reduce((n, p) => n + p.cookedTotal, 0)

  // ── SLOT BUDGETS, strided across the whole window ─────────────────────────────────────────────────
  // Budgets, not fixed counts: orders carry several cooked lines, so the planner has to PACK them into a
  // per-slot allowance rather than emit one order per item. Walking the pattern slot-by-slot would exhaust
  // the budget early on a long window (3h = 35 slots) and leave the back third dead, so the budgets are
  // built first and then STRIDED evenly. Deterministic throughout — no Math.random, so an odd-looking
  // board can be re-inspected.
  //
  // 🔴 THE REFERENCE BATCH IS THE SMALLEST COMMITTED ONE, not the DEMO_MAINS_BATCH constant and not the
  // largest. It only decides HOW MANY slots get a budget; the ceiling that is actually enforced is
  // per-category, below. Taking the smallest keeps the slot count honest when one category is tighter
  // than the others (two cooked categories with different batch_size is a real shape — see the report).
  const budgets: { n: number; f: number }[] = []
  let cookedLeft = totalCookedNeeded
  const nonZero = FILL_PATTERN.filter(f => f > 0)
  for (let i = 0; cookedLeft > 0 && i < slots.length; i++) {
    const f = nonZero[i % nonZero.length]
    const n = Math.min(Math.max(1, Math.round(refBatch * f)), refBatch, cookedLeft)
    budgets.push({ n, f })
    cookedLeft -= n
  }

  // 🔴 THE ALLOWANCE IS PER CATEGORY, BECAUSE THE ENGINE'S CEILING IS PER CATEGORY.
  // `projectBackwardOccupancy` compares each cooking window's load against `batchByCat[cat]`, one
  // category at a time — a slot holding 4 items is fine when they are 2+2 across two categories and over
  // when they are 4 of a category whose batch is 3. A single aggregate number cannot express that, which
  // is the second half of why the old planner and the engine disagreed.
  // Each category's allowance is its OWN batch scaled by the pattern fraction, never above that batch.
  const allowanceFor = (f: number): Record<string, number> => {
    const out: Record<string, number> = {}
    for (const [cat, batch] of Object.entries(batchByCat)) {
      out[cat] = Math.min(batch, Math.max(1, Math.round(batch * f)))
    }
    return out
  }

  const planned: { slot: string; allow: Record<string, number> }[] = []
  const stride = budgets.length > 0 ? slots.length / budgets.length : 1
  const taken = new Set<number>()
  budgets.forEach((b, j) => {
    let idx = Math.min(slots.length - 1, Math.round(j * stride))
    while (taken.has(idx) && idx < slots.length - 1) idx++      // never double-book one slot
    if (taken.has(idx)) return
    taken.add(idx)
    planned.push({ slot: slots[idx], allow: allowanceFor(b.f) })
  })
  planned.sort((a, b) => a.slot.localeCompare(b.slot))

  // ── Build the orders ───────────────────────────────────────────────────────────────────────────────
  const rows: Record<string, unknown>[] = []
  const makeOrder = (slot: string, lines: ReturnType<typeof lineFor>[]) => {
    // unit_price already includes modifiers (see lineFor), so this must NOT add them again.
    const total = lines.reduce((s, l) => s + l.unit_price * l.quantity, 0)
    rows.push({
      id: String(rows.length + 1),
      truck_id: args.truckId,
      customer_name: CUSTOMER_NAMES[nameIdx++ % CUSTOMER_NAMES.length],
      customer_phone: null,
      customer_email: null,          // 🔴 see the file header — never populate this
      slot,
      order_type: 'collection',
      event_date: args.eventDate,
      event_id: args.eventId,
      items: lines,
      deals: [],
      discount_code: null,
      subtotal: total,
      discount_amt: 0,
      total,
      // §4a — pence, derived from the total we just computed. Seeded rows carry it like every other
      // write path so a demo dashboard reads the same shape production does.
      total_minor: toMinor(total),
      notes: null,
      // Confirmed, not pending: a pile of unactioned "New — action needed" cards reads as a backlog, not
      // a working kitchen.
      status: 'confirmed',
      payment_status: 'unpaid',
    })
  }

  // ── PACK orders into slot allowances ──────────────────────────────────────────────────────────────
  // An order goes into the first slot (in time order) whose remaining allowance covers EVERY cooked
  // category it carries. An order that fits nowhere is DROPPED — a thinner board, never a fuller one.
  // A zero-cooked order (drinks only, or an all-instant menu) occupies no capacity and attaches to a
  // slot already in use so it sits among real tickets.
  const remaining = planned.map(p => ({ slot: p.slot, left: { ...p.allow }, used: {} as Record<string, number> }))
  const fits = (r: typeof remaining[number], need: Record<string, number>) =>
    Object.entries(need).every(([cat, n]) => (r.left[cat] ?? 0) >= n)

  let mainsItems = 0
  let totalItems = 0
  /** Parallel to `rows` — what each seeded order costs, so the post-condition can shed by load. */
  const rowCost: Record<string, number>[] = []

  for (const p of prospects) {
    const target = p.cookedTotal > 0
      ? remaining.find(r => fits(r, p.cookedByCat))
      : remaining.find(r => Object.keys(r.used).length > 0) ?? remaining[0]
    if (!target) continue      // no slot can take it — drop the order rather than breach

    makeOrder(target.slot, p.lines)
    rowCost.push(p.cookedByCat)
    for (const [cat, n] of Object.entries(p.cookedByCat)) {
      target.left[cat] = (target.left[cat] ?? 0) - n
      target.used[cat] = (target.used[cat] ?? 0) + n
    }
    mainsItems += p.cookedTotal
    totalItems += p.lines.length
  }

  if (!rows.length) return emptyResult({ warnings })

  // ══ THE POST-CONDITION ═══════════════════════════════════════════════════════════════════════════
  // 🔴 A SEEDED BOARD MUST NEVER BE OVER CAPACITY. ONLY A MANUALLY PLACED ORDER MAY BREACH.
  //
  // Phase 1 above made the planner's arithmetic consistent with the engine's — but consistency is not
  // the criterion, because the engine does something no planner models cheaply: it seats each category's
  // load BACKWARD across windows (`numWindows = ceil(N/batch)`, `startMins = deadline − (numWindows−i) ×
  // prepMins`) and it sums every PRE-OPEN window into a single event-start pile. A planner that modelled
  // that would be a second implementation of the engine, and two implementations drift — which is the
  // whole history of this file.
  //
  // So the seeder does not predict the verdict. It ASKS FOR IT: `detectCapacityBreaches`, the same
  // function /api/dashboard calls to raise the "N slots over capacity" banner, over the units this board
  // will produce. If it says the board breaches, orders are shed and it is asked again.
  //
  // ⏱ COST: the passes are pure CPU over data already in memory — no database round trip per pass. The
  // reads below are ONE batch, and they happen once. Bounded at MAX_BREACH_PASSES either way, because a
  // prospect is watching a spinner.
  let breachPasses = 0
  let shedOrders = 0
  let unresolvedBreaches: SeededBreach[] = []
  let itemCatMapForAdmission: Record<string, string> | null = null
  try {
    // The engine's remaining inputs. `buildItemCatMap` is the SAME helper buildUnitsFromOrders uses.
    const [ctRes, itemCatMap] = await Promise.all([
      supabase.from('collection_times').select('collection_time, production_slot').eq('truck_id', args.truckId),
      buildItemCatMap(supabase, args.truckId),
    ])
    itemCatMapForAdmission = itemCatMap
    const timeMap: Record<string, string> = {}
    for (const r of (ctRes.data ?? []) as { collection_time: string; production_slot: string }[]) {
      timeMap[r.collection_time] = r.production_slot
    }

    // 🔴 kitchen_capacity IS READ, NOT ASSUMED NULL. Provisioning writes null (DEMO_VAN_CAPACITY), which
    // switches the global concurrency ceiling OFF — but the demo dashboard's Settings tab can SET it
    // (update_van_settings has no demo gate), so a restarted demo can have a real ceiling. Assuming null
    // would make the post-condition blind to exactly the ceiling Dominic just configured.
    let kitchenCapacity: number | null = null
    let capacityWindowMins = 5
    if (vanId) {
      const { data: van } = await supabase
        .from('truck_vans').select('kitchen_capacity, capacity_window_mins').eq('id', vanId).maybeSingle()
      kitchenCapacity = (van as { kitchen_capacity?: number | null } | null)?.kitchen_capacity ?? null
      capacityWindowMins = (van as { capacity_window_mins?: number | null } | null)?.capacity_window_mins ?? 5
    }

    // The collection slots to examine. The DASHBOARD's list, built by the SAME generateCollectionTimes
    // with the truck's own interval + its 30-minute grace — UNIONED with the slots this seeder actually
    // used, so a slot carrying load can never escape the check because the truck's interval does not
    // land on it. Strictly a superset of what the banner reads: the check is at least as strict.
    // The OPERATOR grid: the list the dashboard draws and the banner reads. Resolved above, from the van.
    const intervalMins = intervals.truck
    const slotDurationMins = (truckRow as { slot_duration_mins?: number | null } | null)?.slot_duration_mins ?? intervalMins
    const dashSlots = intervalMins > 0
      ? generateCollectionTimes(args.startTime, args.endTime, intervalMins, slotDurationMins, DASHBOARD_GRACE_MINS)
          .map(r => r.collection_time)
      : []
    const times = Array.from(new Set([...dashSlots, ...slots])).sort().map(collection_time => ({ collection_time }))
    const eventStartMins = toMinsLocal(args.startTime)

    const detect = (): CapacityBreach[] => detectCapacityBreaches({
      times,
      productionSlotUnits: buildUnitsInMemory(rows, timeMap, itemCatMap, args.startTime),
      catConfigs,
      kitchenCapacity,
      eventStartMins,
      capacityWindowMins,
      // The detector uses these only to ATTRIBUTE a breach to orders for the banner's link text; the
      // verdict itself comes from the units. Synthetic keys keep that output well-formed.
      orders: rows.map((r, i) => ({ order_key: `seed-${i}`, id: i + 1, slot: (r.slot as string) ?? null, status: 'confirmed' })),
    })

    const slotMinsOf = (t: string) => toMinsLocal(t)
    for (let pass = 1; pass <= MAX_BREACH_PASSES; pass++) {
      breachPasses = pass
      const breaches = detect()
      if (breaches.length === 0) { unresolvedBreaches = []; break }

      // SHED, DETERMINISTICALLY — AND USING THE DETECTOR'S OWN ATTRIBUTION, NOT A GUESS.
      // 🔴 `breach.order_keys` IS THE ANSWER TO "WHICH ORDERS FEED THIS WINDOW", AND IT IS THE
      // DETECTOR'S ANSWER. capacity-breach.ts inverts the backward projection with
      // `contributingProductionSlots` precisely because the orders loading a window usually collect
      // somewhere else — orders at 16:30 and 17:00 can put 16:50 over while nothing collects at 16:50.
      // Choosing by "biggest order nearest the breach" instead was a second guess at that inversion, and
      // it did not converge: with a global kitchen_capacity set, shedding removed heavy orders that fed
      // a different window while the breached one stayed over. The synthetic `seed-<index>` keys handed
      // to the detector come back here, so its inversion picks the candidates.
      //
      // Within the candidates: most of the over-category first (fewest orders removed per unit cleared),
      // then the latest-placed, so two identical inputs shed identically. Enough orders are taken to
      // cover the overshoot in ONE pass rather than one per pass.
      //
      // ⚠️ REMOVALS ARE COLLECTED AS INDICES AND APPLIED AFTER THE WHOLE PASS. Splicing inside the loop
      // shifts every later index, so the second breach of a pass would shed the wrong order.
      const toRemove = new Set<number>()
      for (const b of breaches) {
        const cat = b.over_cats.length
          ? b.over_cats.slice().sort((x, y) => y.over - x.over)[0].cat
          // A global-ceiling breach names no category — weigh candidates by their whole cooked load.
          : null
        let need = Math.max(1, Math.round(cat ? (b.over_cats.find(c => c.cat === cat)?.over ?? 1) : b.over_total))
        const bMins = slotMinsOf(b.collection_time)
        const attributed = new Set<number>()
        for (const k of b.order_keys ?? []) {
          const m = /^seed-(\d+)$/.exec(String(k))
          if (m) attributed.add(Number(m[1]))
        }
        const carriedBy = (i: number) => {
          const cost = rowCost[i]
          if (!cost) return 0
          return cat ? (cost[cat] ?? 0) : Object.values(cost).reduce((a, n) => a + n, 0)
        }
        // The detector's contributors first; if it attributed none (it can, when the window is fed only
        // by pre-open spill), fall back to every order carrying the category, nearest slot first.
        const pool = [...rows.keys()].filter(i => !toRemove.has(i) && carriedBy(i) > 0)
        const primary = pool.filter(i => attributed.has(i))
        const candidates = (primary.length ? primary : pool).sort((x, y) => {
          const cx = carriedBy(x), cy = carriedBy(y)
          if (cy !== cx) return cy - cx
          const dx = Math.abs(slotMinsOf(String(rows[x].slot)) - bMins)
          const dy = Math.abs(slotMinsOf(String(rows[y].slot)) - bMins)
          if (dx !== dy) return dx - dy
          return y - x
        })
        for (const i of candidates) {
          if (need <= 0) break
          toRemove.add(i)
          need -= carriedBy(i)
        }
      }

      let removedThisPass = 0
      for (const i of [...toRemove].sort((a, b2) => b2 - a)) {
        totalItems -= (rows[i].items as unknown[]).length
        mainsItems -= Object.values(rowCost[i] ?? {}).reduce((a, n) => a + n, 0)
        rows.splice(i, 1)
        rowCost.splice(i, 1)
        shedOrders++
        removedThisPass++
      }

      if (removedThisPass === 0) {
        // Nothing left to shed for these breaches — record and stop rather than spin.
        unresolvedBreaches = breaches.map(toSeededBreach)
        break
      }
      if (pass === MAX_BREACH_PASSES) {
        const still = detect()
        unresolvedBreaches = still.map(toSeededBreach)
      }
    }

    if (shedOrders > 0) {
      warnings.push(`Capacity post-condition shed ${shedOrders} seeded order(s) over ${breachPasses} pass(es) to keep the board within capacity.`)
    }
    if (unresolvedBreaches.length > 0) {
      // 🔴 NEVER SILENT. This reaches the callers' warnings, which reach the admin response.
      for (const b of unresolvedBreaches) {
        const cats = b.over_cats.map(c => `${c.cat} over by ${c.over}`).join(', ')
        warnings.push(
          `🔴 SEEDED BOARD STILL OVER CAPACITY at ${b.collection_time} — ${b.reason}` +
          (cats ? ` (${cats})` : '') + (b.over_total ? ` (total over by ${b.over_total})` : '') +
          ` — after ${breachPasses} shed pass(es).`)
      }
      console.error(`[seed-demo-orders] POST_CONDITION_FAILED truck=${args.truckId} event=${args.eventId} breaches=${JSON.stringify(unresolvedBreaches)}`)
    }
  } catch (err) {
    // The check could not RUN (a read failed, a column is missing). That is not a licence to ship an
    // unchecked board quietly — the board stands, and the caller is told the guarantee is unverified.
    const msg = err instanceof Error ? err.message : 'unknown'
    warnings.push(`⚠️ Capacity post-condition could not run (${msg}) — the seeded board is UNVERIFIED.`)
    console.error('[seed-demo-orders] post-condition failed to run:', msg)
  }

  // Slots re-measured from what SURVIVED the shed, never from what was planned.
  const usedByCat: Record<string, Record<string, number>> = {}
  rows.forEach((r, i) => {
    const slot = String(r.slot)
    const bucket = usedByCat[slot] ?? (usedByCat[slot] = {})
    for (const [cat, n] of Object.entries(rowCost[i] ?? {})) bucket[cat] = (bucket[cat] ?? 0) + n
  })
  let peakCookedPerSlotPerCat = 0
  let peakBatch = 0
  let slotsAtCapacity = 0
  for (const bucket of Object.values(usedByCat)) {
    let atCap = false
    for (const [cat, n] of Object.entries(bucket)) {
      const batch = batchByCat[cat] ?? 1
      if (n > peakCookedPerSlotPerCat) { peakCookedPerSlotPerCat = n; peakBatch = batch }
      if (n >= batch) atCap = true
    }
    if (atCap) slotsAtCapacity++
  }
  const survivingSlots = Object.keys(usedByCat).sort()

  // ── RENUMBER IN COLLECTION-TIME ORDER (demo only) ───────────────────────────────────────────────
  // Orders were numbered in PACKING order above, which is the shape-cycle order, not time order. That is
  // exactly right for a real service — a real order's number records when it was PLACED, not when it
  // collects, so a real board legitimately shows #12 collecting before #7. On a demo board nobody has
  // that context, so it just reads as arbitrary and invites "why isn't this in order?" — a question about
  // our software instead of about their food, at the one moment we have their attention.
  //
  // ⚠️ DELIBERATELY THE LAST STEP, AND ONLY THE `id`. Packing is untouched, so every guarantee the planner
  // makes is untouched with it: the per-slot mains budget, peak <= the category batch, and the FILL_PATTERN
  // taper are all decided before this line and are properties of `slot`, which this does not modify. This
  // is a pure relabelling of already-placed orders.
  //
  // Array.prototype.sort is stable (spec-guaranteed since ES2019), so orders sharing a slot keep their
  // packing order and the numbering stays deterministic across rebuilds.
  rows.sort((a, b) => String(a.slot).localeCompare(String(b.slot)))

  // ── 🔴 EVERY SEEDED ORDER IS ADMITTED THE WAY A REAL ONE IS (19 September 2026) ───────────────────
  // A bulk `orders.insert(rows)` stood here: the rows landed with no cooking reservation, and the board's
  // first real order was then projected against unreserved load the engine had to guess a split for.
  // Now each row is inserted and then admitted through `admitForManual` — the SAME call the dashboard's
  // Add Order path makes for an operator's walk-up — and its reservation written with
  // `writeReservationRecord`. A row the engine will not admit at its planned time is DELETED and counted
  // as shed, so no seeded order can exceed the batch or the kitchen cap at any instant: the in-memory
  // post-condition above planned within capacity; this is the engine confirming it, row by row, exactly
  // as it would for the prospect's own first order. With the switch OFF the row keeps the fallback split
  // `writeCookingReservation` records, as the manual path does.
  // ⚠️ DEGRADATION: if the very first row — which by construction fits an empty board — is refused, the
  // reservation column is unreadable (migration not applied / schema cache stale). The remaining rows are
  // then inserted WITHOUT admission and a warning says so, rather than seeding an empty board.
  const itemCatMap = itemCatMapForAdmission ?? await buildItemCatMap(supabase, args.truckId)
  let refused = 0
  let admissionUnavailable = false
  const inserted: Record<string, unknown>[] = []
  for (const r of rows) {
    const orderKey = randomUUID()
    r.order_key = orderKey
    r.id = String(inserted.length + 1)
    const { error } = await supabase.from('orders').insert(r)
    if (error) throw new Error(`Seeding demo orders failed: ${error.message}`)
    const lines = normaliseOrderLines((r.items as { name: string; quantity: number }[]) ?? [], null)
    // An order that cooks nothing (sides only) reserves nothing and needs no admission — the engine has
    // no window to give it and `admitForManual` returns null for it, exactly as it does for a refusal.
    // The two are told apart HERE, by the order's own lines, never by the null.
    const cooksSomething = Object.entries(orderItemsToQtyByCat(lines, itemCatMap))
      .some(([cat, n]) => n > 0 && (catConfigs[cat.toLowerCase()]?.secs ?? 0) > 0)
    if (reservationsOn && !admissionUnavailable && cooksSomething) {
      const rec = await admitForManual(supabase, args.truckId, args.eventId, args.eventDate, orderKey, String(r.slot), lines, itemCatMap)
      if (rec) {
        await writeReservationRecord(supabase, { truckId: args.truckId, orderKey, record: rec })
      } else if (!inserted.some(x => x.cooking_admitted)) {
        admissionUnavailable = true
        warnings.push('⚠️ Cooking reservations could not be written (the column is unreadable) — seeded orders carry no reservation.')
      } else {
        await supabase.from('orders').delete().eq('order_key', orderKey).eq('truck_id', args.truckId)
        refused++
        shedOrders++
        continue
      }
    } else if (!reservationsOn && cooksSomething) {
      await writeCookingReservation(supabase, { truckId: args.truckId, eventId: args.eventId, orderKey, gridIntervalMins: gridMins })
    }
    if (cooksSomething && reservationsOn && !admissionUnavailable) r.cooking_admitted = true   // in-memory marker only (stripped below)
    inserted.push(r)
  }
  if (refused > 0) warnings.push(`The engine refused ${refused} seeded order(s) at their planned time; they were not seeded.`)
  for (const r of inserted) delete r.cooking_admitted
  rows.splice(0, rows.length, ...inserted)

  // Advance the per-event counter past the seeded block so the visitor's first real test order can't
  // collide with a seeded display number (orders_event_display_id is UNIQUE on (event_id, id)).
  //
  // Still exactly `rows.length` increments, and still past the highest seeded id — renumbering is a
  // permutation of 1..N, so the maximum is N either way and this guarantee is unaffected.
  //
  // ⏱ PARALLEL, not sequential. This was 37 AWAITED round-trips to Supabase — pure latency, seconds of it,
  // on a flow whose whole promise is "about 30 seconds". The RPC is an atomic per-row increment, so
  // concurrent calls serialise on the row lock and the final value is identical; only the ORDER in which
  // they land varies, and nothing reads the intermediate values.
  await Promise.all(
    Array.from({ length: rows.length }, () =>
      supabase.rpc('increment_event_order_counter', { p_event_id: args.eventId })),
  )

  return {
    inserted: rows.length,
    mainsItems,
    totalItems,
    // Re-measured from the rows that SURVIVED the post-condition, not from `usedSlots` (which records
    // what the planner seated before anything was shed).
    slotsUsed: survivingSlots,
    skippedNoMenu: false,
    // 🔴 NOT the safety check — `unresolvedBreaches` is. This pair DESCRIBES the board and can fail:
    // peak > batch would mean the planner over-filled a slot, which the old `peakPerSlot` could not say.
    peakCookedPerSlotPerCat,
    peakBatch,
    slotsAtCapacity,
    breachPasses,
    shedOrders,
    unresolvedBreaches,
    warnings,
  }
}
